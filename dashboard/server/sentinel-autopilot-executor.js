// SENTINEL AUTOPILOT EXECUTOR — promotion locale transactionnelle et rollback.
//
// Cette couche est volontairement distincte de la décision (sentinel-autopilot.js)
// et du réparateur (repair.js). Elle ne déploie JAMAIS en production : elle peut
// seulement fusionner une branche `sentinelle/*` dans la branche locale cible,
// puis prouver le résultat. Au premier test rouge, elle revient exactement au
// SHA d'avant promotion et enregistre l'échec dans la mémoire d'apprentissage.
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { audit } from "./audit.js";
import { broadcast } from "./sse.js";
import { runSuiteAwait } from "./tests.js";
import { autopilotDecision, registerAutopilotOutcome } from "./sentinel-autopilot.js";
import { acquireAutopilotLock, releaseAutopilotLock, autopilotLockSnapshot } from "./sentinel-autopilot-lock.js";
import { recordPromotionTransaction, promotionJournalSnapshot } from "./sentinel-promotion-journal.js";

const TARGET_BRANCH = process.env.DASH_AUTOPILOT_TARGET_BRANCH || "main";
const VERIFY_SUITES = (process.env.DASH_AUTOPILOT_VERIFY_SUITES || "authz,globals,handlers,smoke")
  .split(",").map((s) => s.trim()).filter(Boolean);

function runGit(args, cwd = config.repoPath, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    let out = "", err = "";
    const cap = (current, chunk, max) => (current + chunk.toString()).slice(-max);
    proc.stdout.on("data", (d) => { out = cap(out, d, 120_000); });
    proc.stderr.on("data", (d) => { err = cap(err, d, 60_000); });
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
    proc.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
    proc.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out, err: e.message }); });
  });
}

export const realAutopilotOps = {
  async status() { return runGit(["status", "--porcelain", "--untracked-files=no"]); },
  async branch() { return runGit(["rev-parse", "--abbrev-ref", "HEAD"]); },
  async head() { return runGit(["rev-parse", "HEAD"]); },
  async merge(branch) {
    return runGit(["merge", "--no-ff", branch, "-m", `merge(sentinelle-autopilot): ${branch}`], config.repoPath, 180_000);
  },
  async abortMerge() { return runGit(["merge", "--abort"]); },
  async resetHard(sha) { return runGit(["reset", "--hard", sha]); },
  async verify(suite) { return runSuiteAwait(suite, config.repoPath, "sentinelle-autopilot"); },
};

function tail(v, n = 1200) {
  const s = String(v || "");
  return s.length > n ? "…" + s.slice(-n) : s;
}

function guardianTiming(policy = {}) {
  const generatedAt = policy?.localGate?.evidence?.guardianGeneratedAt || null;
  if (!generatedAt) return { guardianObservedAt: null, guardianAgeMs: null };
  const observed = Date.parse(generatedAt);
  if (!Number.isFinite(observed)) {
    return { guardianObservedAt: String(generatedAt).slice(0, 64), guardianAgeMs: null };
  }
  return {
    guardianObservedAt: new Date(observed).toISOString(),
    guardianAgeMs: Math.max(0, Date.now() - observed),
  };
}

export async function runPromotionTransaction(repair, {
  ops = realAutopilotOps,
  targetBranch = TARGET_BRANCH,
  suites = VERIFY_SUITES,
  acquireLock = acquireAutopilotLock,
  releaseLock = releaseAutopilotLock,
} = {}) {
  const result = {
    attempted: true,
    ok: false,
    rolledBack: false,
    targetBranch,
    repairBranch: repair?.branch || null,
    repairSha: repair?.sha || null,
    suites: [],
    startedAt: Date.now(),
  };

  if (!repair?.branch || !/^sentinelle\/[\w./-]+$/.test(repair.branch)) {
    return { ...result, attempted: false, reason: "repair_branch_invalid" };
  }

  const lock = acquireLock({
    incidentId: repair?.incidentId || null,
    diagnosisId: repair?.diagnosisId || null,
    branch: repair.branch,
  });
  if (!lock?.ok) {
    return {
      ...result,
      attempted: false,
      reason: lock?.reason || "promotion_lock_unavailable",
      activePromotion: lock?.active || null,
    };
  }

  try {
    const st = await ops.status();
    if (st.code !== 0) return { ...result, attempted: false, reason: "git_status_failed", detail: tail(st.err || st.out) };
    if (String(st.out || "").trim()) return { ...result, attempted: false, reason: "working_tree_dirty" };

    const br = await ops.branch();
    const current = String(br.out || "").trim();
    if (br.code !== 0 || current !== targetBranch) {
      return { ...result, attempted: false, reason: "wrong_target_branch", currentBranch: current || null };
    }

    const before = await ops.head();
    const beforeSha = String(before.out || "").trim();
    if (before.code !== 0 || !/^[0-9a-f]{7,40}$/i.test(beforeSha)) {
      return { ...result, attempted: false, reason: "pre_promotion_sha_unavailable" };
    }
    result.beforeSha = beforeSha;

    const merged = await ops.merge(repair.branch);
    if (merged.code !== 0) {
      await ops.abortMerge().catch(() => {});
      result.reason = "merge_failed";
      result.detail = tail(merged.err || merged.out);
      result.durationMs = Date.now() - result.startedAt;
      return result;
    }

    for (const suite of suites) {
      let proof;
      try { proof = await ops.verify(suite); }
      catch (e) { proof = { code: -1, output: e?.message || String(e) }; }
      const ok = proof?.code === 0;
      result.suites.push({ suite, ok, detail: ok ? null : tail(proof?.output) });
      if (!ok) {
        const rb = await ops.resetHard(beforeSha);
        result.rolledBack = rb?.code === 0;
        result.reason = result.rolledBack ? `verification_failed:${suite}` : `rollback_failed:${suite}`;
        result.rollbackDetail = result.rolledBack ? null : tail(rb?.err || rb?.out);
        result.durationMs = Date.now() - result.startedAt;
        return result;
      }
    }

    const after = await ops.head();
    result.afterSha = String(after.out || "").trim() || null;
    result.ok = after.code === 0 && Boolean(result.afterSha) && result.afterSha !== beforeSha;
    result.reason = result.ok ? null : "promotion_head_not_advanced";
    if (!result.ok) {
      const rb = await ops.resetHard(beforeSha);
      result.rolledBack = rb?.code === 0;
    }
    result.durationMs = Date.now() - result.startedAt;
    return result;
  } finally {
    releaseLock(lock.token);
  }
}

export async function executeAutopilotPromotion(repair, options = {}) {
  const policy = options.policyDecision || autopilotDecision(repair, options.guardian, options.learning);
  if (policy.decision !== "PROMOTE_LOCAL") {
    return { attempted: false, status: "HOLD", blockers: policy.blockers || [], policy };
  }
  if (config.isProd || !config.allowMutations) {
    return {
      attempted: false,
      status: "HOLD",
      blockers: [config.isProd ? "production_mutation_forbidden" : "mutations_disabled"],
      policy,
    };
  }

  broadcast("sentinel_autopilot", { phase: "start", branch: repair.branch, sha: repair.sha });
  const tx = await runPromotionTransaction(repair, options);
  const status = tx.ok ? "PROMOTED_LOCAL" : (tx.rolledBack ? "ROLLED_BACK" : "REJECTED");
  const timing = guardianTiming(policy);
  const journalWriter = options.recordJournal || recordPromotionTransaction;
  try {
    journalWriter({
      incidentId: repair?.incidentId || null,
      diagnosisId: repair?.diagnosisId || null,
      repairBranch: repair?.branch || null,
      repairSha: repair?.sha || null,
      beforeSha: tx.beforeSha || null,
      afterSha: tx.afterSha || null,
      attempted: tx.attempted === true,
      ok: tx.ok === true,
      rolledBack: tx.rolledBack === true,
      reason: tx.reason || (tx.ok ? "verified_local_promotion" : "promotion_failed"),
      status,
      suites: tx.suites || [],
      guardianObservedAt: timing.guardianObservedAt,
      guardianAgeMs: timing.guardianAgeMs,
      durationMs: tx.durationMs,
    });
  } catch {
    audit("sentinel_autopilot_journal_failed", {
      branch: repair.branch,
      repairSha: repair.sha,
      reason: "journal_write_failed",
    }, "sentinelle-autopilot");
  }

  const outcome = registerAutopilotOutcome(repair, {
    ok: Boolean(tx.ok),
    recurrence: false,
    reason: tx.reason || (tx.ok ? "verified_local_promotion" : "promotion_failed"),
  });
  audit(tx.ok ? "sentinel_autopilot_promoted" : "sentinel_autopilot_rejected", {
    branch: repair.branch,
    repairSha: repair.sha,
    beforeSha: tx.beforeSha || null,
    afterSha: tx.afterSha || null,
    rolledBack: Boolean(tx.rolledBack),
    reason: tx.reason || null,
    suites: (tx.suites || []).map((suite) => ({ suite: suite.suite, ok: suite.ok === true })),
  }, "sentinelle-autopilot");
  broadcast("sentinel_autopilot", {
    phase: "end", branch: repair.branch, ok: Boolean(tx.ok),
    rolledBack: Boolean(tx.rolledBack), reason: tx.reason || null,
  });
  return { ...tx, status, learning: outcome, policy };
}

export function autopilotExecutorSnapshot() {
  return {
    targetBranch: TARGET_BRANCH,
    verifySuites: VERIFY_SUITES,
    productionMutation: false,
    requiresExplicitMutationFlag: true,
    processLocalLock: autopilotLockSnapshot(),
    promotionJournal: promotionJournalSnapshot(20),
    distributedCoordination: false,
  };
}
