import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DASH = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DASH, "..");
const LOCAL = path.join(REPO, ".passio", "ai-worker");
const STATE_FILE = path.join(LOCAL, "state.json");
const LOG_FILE = path.join(LOCAL, "worker.log");
const REQUEST_PREFIX = "ai/request/";
const RESULT_PREFIX = "ai/result/";
const PROTOCOL = "passio-ai-v1";
const POLL_MS = Math.max(10_000, Number(process.env.PASSIO_AI_POLL_MS || 20_000));
const CLAUDE_MODEL = process.env.PASSIO_AI_CLAUDE_MODEL || "opus";
const MAX_FILES = Number(process.env.PASSIO_AI_MAX_FILES || 60);
const MAX_CHANGED_LINES = Number(process.env.PASSIO_AI_MAX_LINES || 12_000);

fs.mkdirSync(LOCAL, { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2_000_000) {
      fs.writeFileSync(LOG_FILE, fs.readFileSync(LOG_FILE, "utf8").slice(-500_000));
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  process.stdout.write(line);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return { requests: {} }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function filteredEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:SUPABASE_|DASH_|ANTHROPIC_API_KEY$|OPENAI_API_KEY$|GITHUB_TOKEN$|GH_TOKEN$)/i.test(key)) delete env[key];
  }
  return env;
}

function run(command, args = [], opts = {}) {
  return new Promise((resolve) => {
    const shell = opts.shell ?? false;
    let out = "", err = "", finished = false;
    const finish = (result) => { if (!finished) { finished = true; resolve(result); } };
    let child;
    try {
      child = spawn(command, args, {
        cwd: opts.cwd || REPO,
        shell,
        windowsHide: true,
        env: opts.env || process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      return finish({ code: -1, out, err: e.message });
    }
    child.stdout.on("data", (d) => { if (out.length < 2_000_000) out += d; });
    child.stderr.on("data", (d) => { if (err.length < 500_000) err += d; });
    child.on("error", (e) => finish({ code: -1, out, err: e.message }));
    child.on("close", (code) => finish({ code: code ?? -1, out, err }));
    if (opts.stdin != null) {
      try { child.stdin.write(String(opts.stdin)); } catch {}
    }
    try { child.stdin.end(); } catch {}
    const timeoutMs = opts.timeoutMs || 120_000;
    setTimeout(() => {
      if (finished) return;
      // L'arbre d'abord, et SEUL sous Windows (revue du 2026-09-13, mesuré) :
      // `child.kill()` avant `taskkill /T` tuait le shell en < 10 ms, taskkill
      // n'énumérait plus d'arbre 300 ms après, et le `claude`/`codex`
      // petit-enfant survivait (45 min de quota). `kill()` n'est qu'un repli.
      if (process.platform === "win32" && child.pid) {
        let tk = null;
        try { tk = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {}
        if (!tk) { try { child.kill(); } catch {} }
        else { tk.on("error", () => { try { child.kill(); } catch {} }); tk.on("close", (c) => { if (c !== 0) { try { child.kill(); } catch {} } }); }
      } else {
        try { child.kill(); } catch {}
      }
      finish({ code: -2, out, err: `${err}\nTIMEOUT after ${timeoutMs} ms`.trim() });
    }, timeoutMs).unref?.();
  });
}

const git = (args, opts = {}) => run("git", args, { ...opts, shell: false });

function safeId(value) {
  return String(value || "task").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "task";
}

async function ensureAgents() {
  const claude = await run("claude", ["auth", "status"], {
    shell: process.platform === "win32",
    env: filteredEnv(),
    timeoutMs: 20_000,
  });
  let claudeOk = false;
  try { claudeOk = JSON.parse(claude.out).loggedIn === true; } catch {}
  if (claude.code !== 0 || !claudeOk) {
    throw new Error("Claude Code local n'est pas connecté (lancer: claude auth login)");
  }

  const codex = await run("codex", ["login", "status"], {
    shell: process.platform === "win32",
    env: filteredEnv(),
    timeoutMs: 20_000,
  });
  const codexText = `${codex.out}\n${codex.err}`;
  if (codex.code !== 0 || /not logged in|unauthor|credential|auth required/i.test(codexText)) {
    throw new Error("Codex local n'est pas connecté (lancer: codex login)");
  }
}

async function listRequests() {
  const r = await git(["ls-remote", "--heads", "origin", `refs/heads/${REQUEST_PREFIX}*`], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`git ls-remote: ${(r.err || r.out).slice(-500)}`);
  return r.out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, ref] = line.split(/\s+/);
    return { sha, branch: ref.replace(/^refs\/heads\//, "") };
  });
}

async function remoteBranchExists(branch) {
  const r = await git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`], { timeoutMs: 30_000 });
  return r.code === 0 && r.out.trim().length > 0;
}

async function fetchRequest(branch) {
  const r = await git(["fetch", "--force", "origin", `refs/heads/${branch}:refs/remotes/origin/${branch}`], { timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`git fetch ${branch}: ${(r.err || r.out).slice(-800)}`);
  const f = await git(["show", `origin/${branch}:.passio-request.json`], { timeoutMs: 30_000 });
  if (f.code !== 0) throw new Error(".passio-request.json absent de la branche de demande");
  let task;
  try { task = JSON.parse(f.out); } catch { throw new Error(".passio-request.json invalide"); }
  if (task.protocol !== PROTOCOL) throw new Error(`protocole refusé (${task.protocol || "absent"})`);
  if (!task.id || !task.title || !task.instruction) throw new Error("demande incomplète (id/title/instruction requis)");
  if (branch !== `${REQUEST_PREFIX}${safeId(task.id)}`) throw new Error("id de demande incohérent avec la branche");
  return task;
}

async function createWorktree(task) {
  await git(["fetch", "origin", "main"], { timeoutMs: 120_000 });
  const id = safeId(task.id);
  const resultBranch = `${RESULT_PREFIX}${id}`;
  if (await remoteBranchExists(resultBranch)) return { alreadyDone: true, resultBranch };

  const dir = path.join(LOCAL, "worktrees", id);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  if (fs.existsSync(dir)) {
    await git(["worktree", "remove", "--force", dir], { timeoutMs: 60_000 }).catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  await git(["branch", "-D", resultBranch], { timeoutMs: 30_000 }).catch(() => {});
  const r = await git(["worktree", "add", "-b", resultBranch, dir, "origin/main"], { timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`git worktree add: ${(r.err || r.out).slice(-800)}`);

  const mainModules = path.join(REPO, "node_modules");
  const workModules = path.join(dir, "node_modules");
  if (fs.existsSync(mainModules) && !fs.existsSync(workModules)) {
    if (process.platform === "win32") {
      const j = await run("cmd", ["/d", "/s", "/c", "mklink", "/J", workModules, mainModules], { cwd: dir, timeoutMs: 30_000 });
      if (j.code !== 0) log(`jonction node_modules non créée: ${(j.err || j.out).trim().slice(-300)}`);
    } else {
      try { fs.symlinkSync(mainModules, workModules, "dir"); } catch {}
    }
  }
  return { dir, resultBranch, alreadyDone: false };
}

async function runClaude(prompt, cwd, maxTurns = 120) {
  const args = [
    "-p", "--output-format", "json", "--model", CLAUDE_MODEL,
    "--max-turns", String(maxTurns), "--no-session-persistence",
  ];
  const r = await run("claude", args, {
    cwd,
    shell: process.platform === "win32",
    env: filteredEnv(),
    stdin: prompt,
    timeoutMs: 45 * 60_000,
  });
  if (r.code !== 0) throw new Error(`Claude Code a échoué (${r.code}): ${(r.err || r.out).slice(-1500)}`);
  let parsed;
  try { parsed = JSON.parse(r.out); } catch { parsed = null; }
  if (parsed?.is_error) throw new Error(`Claude Code: ${String(parsed.result || "erreur").slice(-1500)}`);
  return String(parsed?.result || r.out || "").trim();
}

async function stageAndValidate(cwd) {
  let r = await git(["add", "-A"], { cwd, timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`git add: ${(r.err || r.out).slice(-500)}`);

  r = await git(["diff", "--cached", "--name-only", "origin/main", "--"], { cwd, timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`git diff --name-only: ${(r.err || r.out).slice(-500)}`);
  const files = r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!files.length) throw new Error("Claude n'a produit aucune modification");
  if (files.length > MAX_FILES) throw new Error(`${files.length} fichiers modifiés (maximum ${MAX_FILES})`);
  const forbidden = files.filter((f) => /(^|\/)(?:\.env(?:\.|$)|settings\.local\.json$)|^\.passio\/|^node_modules\//i.test(f));
  if (forbidden.length) throw new Error(`fichiers sensibles interdits: ${forbidden.join(", ")}`);

  const diff = await git(["diff", "--cached", "--numstat", "origin/main", "--"], { cwd, timeoutMs: 30_000 });
  let changedLines = 0;
  for (const line of diff.out.split(/\r?\n/)) {
    const [a, d] = line.split(/\s+/);
    if (/^\d+$/.test(a || "")) changedLines += Number(a);
    if (/^\d+$/.test(d || "")) changedLines += Number(d);
  }
  if (changedLines > MAX_CHANGED_LINES) throw new Error(`${changedLines} lignes changées (maximum ${MAX_CHANGED_LINES})`);

  const check = await git(["diff", "--cached", "--check"], { cwd, timeoutMs: 30_000 });
  if (check.code !== 0) throw new Error(`git diff --check rouge: ${(check.out || check.err).slice(-1200)}`);
  return { files, changedLines };
}

async function buildReviewBundle(task, cwd, suffix) {
  const reviewDir = path.join(LOCAL, "reviews", safeId(task.id), suffix);
  const args = [
    path.join(cwd, "scripts", "dossier-revue.js"),
    "--titre", task.title,
    "--base", "origin/main",
    "--sortie", reviewDir,
  ];
  const r = await run(process.execPath, args, { cwd, timeoutMs: 10 * 60_000, env: filteredEnv() });
  if (r.code !== 0) throw new Error(`dossier de revue: ${(r.err || r.out).slice(-1500)}`);
  const bundle = path.join(reviewDir, "DOSSIER-COMPLET.md");
  if (!fs.existsSync(bundle)) throw new Error("DOSSIER-COMPLET.md non généré");
  return bundle;
}

async function runCodexReview(task, cwd, bundle, phase) {
  const question = phase === "final"
    ? [
        "Revue finale indépendante. Vérifie le changement demandé et le dossier joint.",
        "Cherche les défauts réels, régressions, sécurité, logique et tests manquants.",
        "Première ligne OBLIGATOIRE : VERDICT: OK si aucun défaut bloquant concret ne reste, sinon VERDICT: BLOQUANT.",
        "Après cette ligne, explique précisément. N'invente pas de problème : un blocage doit être démontrable depuis le dossier.",
      ].join(" ")
    : [
        "Revue indépendante du changement demandé. Challenge l'implémentation de Claude Code à partir du dossier joint.",
        "Liste uniquement les problèmes concrets ou vérifications réellement nécessaires, avec priorité et justification.",
        "Ne modifie rien. Claude Code décidera ensuite quoi corriger après vérification dans le vrai worktree.",
      ].join(" ");
  const args = [
    path.join(cwd, "scripts", "chatgpt.js"),
    question,
    "--transport", "codex",
    "--fil", `ai-${safeId(task.id)}-${phase}`,
    "--fichier", bundle,
  ];
  const r = await run(process.execPath, args, { cwd, timeoutMs: 30 * 60_000, env: filteredEnv() });
  if (r.code !== 0) throw new Error(`Codex a échoué (${r.code}): ${(r.err || r.out).slice(-1800)}`);
  return r.out.trim();
}

function firstLine(text) {
  return String(text || "").split(/\r?\n/).find((s) => s.trim())?.trim() || "";
}

function compact(text, max = 1300) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function commitAndPush(task, cwd, resultBranch, meta) {
  const message = [
    `feat(ai): ${task.title}`,
    "",
    `AI-Task: ${safeId(task.id)}`,
    "AI-Orchestration: Claude Code standard -> Codex -> Claude Code -> Codex",
    `Claude-Initial: ${compact(meta.claudeInitial, 500)}`,
    `Codex-Review: ${compact(meta.codexReview, 900)}`,
    `Claude-Reconcile: ${compact(meta.claudeReconcile, 500)}`,
    `Codex-Final: ${compact(meta.codexFinal, 900)}`,
    `Files: ${meta.files.length} | Changed-lines: ${meta.changedLines}`,
  ].join("\n");
  let r = await git(["commit", "-m", message], { cwd, timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`git commit: ${(r.err || r.out).slice(-1200)}`);
  r = await git(["push", "-u", "origin", resultBranch], { cwd, timeoutMs: 5 * 60_000 });
  if (r.code !== 0) throw new Error(`git push: ${(r.err || r.out).slice(-1500)}`);
  return (await git(["rev-parse", "HEAD"], { cwd, timeoutMs: 30_000 })).out.trim();
}

async function cleanupWorktree(cwd) {
  if (!cwd) return;
  await git(["worktree", "remove", "--force", cwd], { timeoutMs: 120_000 }).catch(() => {});
  try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {}
  await git(["worktree", "prune"], { timeoutMs: 30_000 }).catch(() => {});
}

// ── Plafond et recul entre deux essais (revue contradictoire du 2026-09-13) ──
// Une demande en échec était REPRISE au sondage suivant (20 s), sans compteur :
// chaque reprise recréait un worktree complet et relançait Claude (jusqu'à
// 45 min) puis Codex. Mesuré le 24/08 : la même demande rejouée toute la
// journée sur « You've hit your weekly limit », vidant le quota partagé avec la
// sentinelle. Et une demande laissée `running` par un arrêt brutal (le
// superviseur tue l'enfant sans `finally`) était ignorée POUR TOUJOURS : quatre
// demandes figées depuis le 19-24/08.
const MAX_ATTEMPTS = Math.max(1, Number(process.env.PASSIO_AI_MAX_ATTEMPTS) || 5);
const RUNNING_STALE_MS = Math.max(60_000, Number(process.env.PASSIO_AI_RUNNING_STALE_MIN || 90) * 60_000);
function reculMs(attempts) { return Math.min(6 * 3600_000, 5 * 60_000 * 2 ** Math.max(0, attempts - 1)); } // 5, 10, 20, 40, 80 min… plafonné 6 h

/** Au démarrage : une demande `running` d'un processus MORT ne l'est plus. */
function libererRunningOrphelins(state) {
  let n = 0;
  for (const [key, r] of Object.entries(state.requests || {})) {
    if (r && r.status === "running" && r.pid !== process.pid) {
      state.requests[key] = { ...r, status: "failed", error: `interrompue (processus ${r.pid || "?"} disparu) — reprise possible`, attempts: r.attempts || 0, updatedAt: new Date().toISOString() };
      n++;
    }
  }
  if (n) { saveState(state); log(`${n} demande(s) figée(s) en « running » par un arrêt brutal remise(s) en jeu`); }
  return n;
}

async function processRequest(req, state) {
  const id = safeId(req.branch.slice(REQUEST_PREFIX.length));
  const key = req.branch;
  const previous = state.requests[key];
  const meme = previous?.sha === req.sha;
  if (meme && previous?.status === "done") return;
  if (meme && previous?.status === "running") {
    // Un `running` de CE processus est en cours (poll sérialisé : impossible en
    // pratique) ; un `running` trop vieux ou d'un autre pid est un fantôme.
    const age = Date.now() - Date.parse(previous.updatedAt || 0);
    if (previous.pid === process.pid && age < RUNNING_STALE_MS) return;
    log(`demande ${id} figée en « running » (pid ${previous.pid || "?"}, ${Math.round(age / 60_000)} min) : remise en jeu`);
  }
  const attempts = meme ? (previous.attempts || 0) : 0;
  if (meme && previous?.status === "failed") {
    if (attempts >= MAX_ATTEMPTS) {
      if (!previous.abandonLogged) { log(`demande ${id} abandonnée après ${attempts} essai(s) — pousser un nouveau commit sur ${req.branch} pour la relancer`); state.requests[key] = { ...previous, abandonLogged: true }; saveState(state); }
      return;
    }
    const prochain = Date.parse(previous.updatedAt || 0) + reculMs(attempts);
    if (Date.now() < prochain) return; // recul : pas encore l'heure
  }

  const resultBranch = `${RESULT_PREFIX}${id}`;
  if (await remoteBranchExists(resultBranch)) {
    state.requests[key] = { sha: req.sha, status: "done", resultBranch, updatedAt: new Date().toISOString() };
    saveState(state);
    return;
  }

  state.requests[key] = { sha: req.sha, status: "running", attempts: attempts + 1, pid: process.pid, updatedAt: new Date().toISOString() };
  saveState(state);
  log(`prise en charge ${req.branch} @ ${req.sha.slice(0, 8)} (essai ${attempts + 1}/${MAX_ATTEMPTS})`);

  let cwd = null;
  try {
    const task = await fetchRequest(req.branch);
    await ensureAgents();
    const wt = await createWorktree(task);
    if (wt.alreadyDone) {
      state.requests[key] = { sha: req.sha, status: "done", resultBranch: wt.resultBranch, updatedAt: new Date().toISOString() };
      saveState(state);
      return;
    }
    cwd = wt.dir;

    const initialPrompt = [
      `TÂCHE PASSIO: ${task.title}`,
      "",
      task.instruction,
      "",
      "Tu travailles dans un WORKTREE isolé du vrai dépôt PASSIO. Tu es le Claude Code standard local de Benjamin.",
      "Lis CLAUDE.md et les pièges/skills pertinents. Analyse puis implémente complètement la demande dans ce worktree.",
      "Tu peux modifier le code et les tests nécessaires et lancer les vérifications pertinentes.",
      "EXCEPTION D'ORCHESTRATION: ne fais NI commit NI push et ne touche pas à main; le worker local gère Git après revue croisée.",
      "Ne lis jamais .env, dashboard/.env ou .claude/settings.local.json. Ne modifie rien hors de ce worktree.",
      "À la fin, résume les changements et les vérifications réellement exécutées.",
    ].join("\n");
    const claudeInitial = await runClaude(initialPrompt, cwd, 120);
    await stageAndValidate(cwd);

    const bundle1 = await buildReviewBundle(task, cwd, "review-1");
    const codexReview = await runCodexReview(task, cwd, bundle1, "review");

    const reconcilePrompt = [
      `TÂCHE PASSIO: ${task.title}`,
      "",
      task.instruction,
      "",
      "Tu as déjà implémenté cette tâche dans ce worktree. Voici maintenant la revue indépendante de Codex :",
      "--- CODEX REVIEW ---",
      codexReview,
      "--- FIN CODEX REVIEW ---",
      "",
      "Vérifie CHAQUE remarque contre le vrai code. Corrige uniquement ce qui est fondé; ne suis jamais aveuglément Codex.",
      "Complète les tests/vérifications utiles. Ne committe et ne pousse rien; reste dans ce worktree et ne lis aucun secret.",
      "À la fin, résume ce que tu as accepté/refusé de la revue et pourquoi.",
    ].join("\n");
    const claudeReconcile = await runClaude(reconcilePrompt, cwd, 100);
    const validation = await stageAndValidate(cwd);

    const bundle2 = await buildReviewBundle(task, cwd, "review-final");
    const codexFinal = await runCodexReview(task, cwd, bundle2, "final");
    if (!/^VERDICT:\s*OK\b/im.test(codexFinal)) {
      throw new Error(`Codex final n'a pas validé: ${firstLine(codexFinal)} — ${compact(codexFinal, 1200)}`);
    }

    const commit = await commitAndPush(task, cwd, wt.resultBranch, {
      claudeInitial, codexReview, claudeReconcile, codexFinal,
      files: validation.files, changedLines: validation.changedLines,
    });
    state.requests[key] = {
      sha: req.sha,
      status: "done",
      resultBranch: wt.resultBranch,
      commit,
      updatedAt: new Date().toISOString(),
    };
    saveState(state);
    log(`terminé ${task.id} -> ${wt.resultBranch} @ ${commit.slice(0, 8)} (Claude + Codex OK)`);
  } catch (e) {
    const essais = attempts + 1;
    state.requests[key] = {
      sha: req.sha,
      status: "failed",
      attempts: essais,
      error: String(e.message || e).slice(0, 3000),
      updatedAt: new Date().toISOString(),
    };
    try { saveState(state); } catch (se) { log(`état non écrit (${se.code || se.message}) : la demande sera rejouée au redémarrage`); }
    log(`échec ${id} (essai ${essais}/${MAX_ATTEMPTS}${essais < MAX_ATTEMPTS ? `, prochain dans ${Math.round(reculMs(essais) / 60_000)} min` : ", abandon"}): ${String(e.message || e).replace(/\s+/g, " ").slice(0, 1200)}`);
  } finally {
    await cleanupWorktree(cwd);
  }
}

let busy = false;
let stopping = false;

async function poll() {
  if (busy || stopping) return;
  busy = true;
  try {
    const state = loadState();
    const requests = await listRequests();
    for (const req of requests) {
      if (stopping) break;
      await processRequest(req, state);
    }
  } catch (e) {
    log(`poll: ${String(e.message || e).replace(/\s+/g, " ").slice(0, 1000)}`);
  } finally {
    busy = false;
  }
}

function stop(signal) {
  stopping = true;
  log(`arrêt (${signal})`);
  setTimeout(() => process.exit(0), 200).unref?.();
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

log(`worker Claude+Codex actif — dépôt ${REPO}, sondage ${Math.round(POLL_MS / 1000)} s, ${MAX_ATTEMPTS} essais max par demande${process.env.CLAUDE_CONFIG_DIR ? `, identifiants Claude isolés (${process.env.CLAUDE_CONFIG_DIR})` : ""}`);
try { libererRunningOrphelins(loadState()); } catch (e) { log(`état initial illisible : ${e.message}`); }
await poll();
setInterval(poll, POLL_MS);
