// PASSIO Control Center — AI Orchestrator V2 backend.
// Reads the canonical .passio/orchestrator.json manifest, exposes truthful local
// status, and submits work to the existing aiworker.mjs without ever touching
// main directly. No Lovable API keys or production secrets are used here.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";
import { audit } from "./audit.js";

const exec = promisify(execFile);
const REPO = path.resolve(config.repoPath);
const MANIFEST = path.join(REPO, ".passio", "orchestrator.json");
const WORKER_STATE = path.join(REPO, ".passio", "ai-worker", "state.json");
const WORKER_LOG = path.join(REPO, ".passio", "ai-worker", "worker.log");
const SUPERVISOR_PID = path.join(REPO, "dashboard", "data", "supervise.pid");
const PROTOCOL = "passio-ai-v1";
const REQUEST_PREFIX = "ai/request/";
const RESULT_PREFIX = "ai/result/";

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function tail(file, lines = 30) {
  try { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-lines); } catch { return []; }
}
function filteredEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:SUPABASE_|DASH_PASSWORD|DASH_SESSION_SECRET|ANTHROPIC_API_KEY$|OPENAI_API_KEY$|GITHUB_TOKEN$|GH_TOKEN$)/i.test(key)) delete env[key];
  }
  return env;
}
async function git(args, opts = {}) {
  return exec("git", args, { cwd: opts.cwd || REPO, maxBuffer: 8 * 1024 * 1024, env: filteredEnv(), ...opts });
}
function safeId(value) {
  return String(value || "task").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "task";
}
function processAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
async function remoteBranches(prefix) {
  try {
    const { stdout } = await git(["ls-remote", "--heads", "origin", `refs/heads/${prefix}*`]);
    return stdout.split(/\r?\n/).filter(Boolean).map((line) => {
      const [sha, ref] = line.trim().split(/\s+/);
      return { sha, branch: ref.replace(/^refs\/heads\//, "") };
    });
  } catch { return []; }
}

export function routeTask(input = {}) {
  const text = `${input.title || ""} ${input.instruction || ""}`.toLowerCase();
  const ui = /(design|ui\b|ux\b|interface|ecran|écran|onboarding|landing|maquette|visuel|mobile|profil|feed|parcours)/i.test(text);
  const security = /(secur|sécur|rls|auth|permission|xss|csrf|secret|vulner|audit)/i.test(text);
  const backend = /(backend|supabase|database|base de don|migration|sql|api|serveur|server|endpoint)/i.test(text);
  const tests = /(test|playwright|qa\b|regression|bug|debug|corrig|fix|refactor)/i.test(text);
  // Une négation « sans X » dit l'INVERSE du mot qu'elle porte. Sans la retirer,
  // « analyse seulement, sans coder » déclenchait l'exclusion sur « code »
  // (sous-chaîne de « coder ») et une demande de revue pure partait en « general ».
  const sansNegation = text.replace(/\bsans\s+\S+/g, " ");
  const reviewOnly = /(review|revue|challenge|avis|audit seulement|analyse seulement)/i.test(text) && !/(implement|implémente|corrig|fix|code)/i.test(sansNegation);

  if (reviewOnly) return {
    category: "review",
    primary: "codex",
    agents: ["codex", "chatgpt"],
    pipeline: "Codex → ChatGPT",
    lovableRecommended: false,
    explanation: "Demande principalement analytique : revue indépendante puis arbitrage ChatGPT."
  };
  if (ui) return {
    category: "ui_ux",
    primary: "lovable",
    agents: ["lovable", "claude_code", "codex", "chatgpt"],
    pipeline: "Lovable (concept) → Claude Code (production) → Codex (revue) → ChatGPT (arbitrage)",
    lovableRecommended: true,
    explanation: "Sujet UI/UX : Lovable est recommandé pour explorer, mais l'exécution locale reste Claude Code + Codex."
  };
  if (security) return {
    category: "security",
    primary: "claude_code",
    agents: ["claude_code", "codex", "chatgpt"],
    pipeline: "Claude Code → Codex → Claude Code → Codex → ChatGPT",
    lovableRecommended: false,
    explanation: "Sujet sécurité : Claude Code travaille dans le dépôt, Codex challenge indépendamment."
  };
  if (backend) return {
    category: "backend",
    primary: "claude_code",
    agents: ["claude_code", "codex", "chatgpt"],
    pipeline: "Claude Code → Codex → Claude Code → Codex → ChatGPT",
    lovableRecommended: false,
    explanation: "Sujet backend/données : Claude Code est le moteur principal, Codex vérifie."
  };
  if (tests) return {
    category: "engineering",
    primary: "claude_code",
    agents: ["claude_code", "codex", "chatgpt"],
    pipeline: "Claude Code → Codex → Claude Code → Codex → ChatGPT",
    lovableRecommended: false,
    explanation: "Travail d'ingénierie : exécution locale Claude Code + revue Codex."
  };
  return {
    category: "general",
    primary: "claude_code",
    agents: ["claude_code", "codex", "chatgpt"],
    pipeline: "Claude Code → Codex → ChatGPT",
    lovableRecommended: false,
    explanation: "Routage par défaut vers Claude Code, avec seconde opinion Codex et arbitrage ChatGPT."
  };
}

export async function snapshot() {
  const manifest = readJson(MANIFEST, { version: 0, error: "manifest orchestrateur absent" });
  const workerState = readJson(WORKER_STATE, { requests: {} });
  const supervisorPid = (() => { try { return Number(fs.readFileSync(SUPERVISOR_PID, "utf8").trim()); } catch { return null; } })();
  const [requests, results] = await Promise.all([remoteBranches(REQUEST_PREFIX), remoteBranches(RESULT_PREFIX)]);
  const stateByBranch = workerState?.requests || {};
  const tasks = requests.map((r) => {
    const state = stateByBranch[r.branch] || {};
    const id = r.branch.slice(REQUEST_PREFIX.length);
    const result = results.find((x) => x.branch === `${RESULT_PREFIX}${id}`);
    return {
      id, requestBranch: r.branch, requestSha: r.sha,
      status: result ? "done" : (state.status || "queued"),
      resultBranch: result?.branch || state.resultBranch || null,
      resultSha: result?.sha || state.commit || null,
      updatedAt: state.updatedAt || null,
      error: state.error || null,
    };
  }).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  return {
    manifest,
    sourceOfTruth: manifest?.source_of_truth || { repository: "PASSIO74/passio-app", production_branch: "main" },
    local: {
      supervised: processAlive(supervisorPid),
      supervisorPid: supervisorPid || null,
      workerStateAvailable: fs.existsSync(WORKER_STATE),
      workerLog: tail(WORKER_LOG, 24),
    },
    agents: {
      chatgpt: { status: "external", truthfulLabel: "Orchestrateur dans ChatGPT", model: manifest?.orchestrator?.model || "GPT-5.6 Sol" },
      claude_code: { status: processAlive(supervisorPid) ? "supervised" : "unknown", truthfulLabel: "Exécuté par aiworker.mjs dans la session locale standard" },
      codex: { status: processAlive(supervisorPid) ? "supervised" : "unknown", truthfulLabel: "Reviewer local appelé par aiworker.mjs" },
      lovable: {
        status: manifest?.agents?.lovable?.project_id ? "configured" : "unknown",
        truthfulLabel: "Piloté via ChatGPT MCP — pas directement par le serveur local",
        projectId: manifest?.agents?.lovable?.project_id || null,
        editorUrl: manifest?.agents?.lovable?.project_id ? `https://lovable.dev/projects/${manifest.agents.lovable.project_id}` : null,
      },
    },
    tasks,
    counts: {
      queued: tasks.filter((t) => t.status === "queued").length,
      running: tasks.filter((t) => t.status === "running").length,
      done: tasks.filter((t) => t.status === "done").length,
      failed: tasks.filter((t) => t.status === "failed").length,
    },
    mutationsEnabled: Boolean(config.allowMutations),
    production: Boolean(config.isProd),
  };
}

export async function submitTask(input = {}, actor = "unknown") {
  if (config.isProd || !config.allowMutations) {
    const e = new Error("Soumission IA désactivée : le Control Center est en production ou DASH_ALLOW_MUTATIONS n'est pas actif."); e.code = 403; throw e;
  }
  const title = String(input.title || "").trim().slice(0, 160);
  const instruction = String(input.instruction || "").trim().slice(0, 30000);
  if (!title || !instruction) { const e = new Error("Titre et instruction requis."); e.code = 400; throw e; }
  const id = safeId(input.id || `${Date.now()}-${title}`);
  const branch = `${REQUEST_PREFIX}${id}`;
  const route = routeTask({ title, instruction });

  const existing = await remoteBranches(branch);
  if (existing.some((b) => b.branch === branch)) { const e = new Error(`La tâche ${id} existe déjà.`); e.code = 409; throw e; }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "passio-ai-request-"));
  try {
    await git(["fetch", "origin", "main"]);
    await git(["worktree", "add", "-b", branch, tmp, "origin/main"]);
    const payload = {
      protocol: PROTOCOL,
      id,
      title,
      instruction,
      route,
      requestedAt: new Date().toISOString(),
      requestedBy: String(actor || "control-center").slice(0, 120),
      source: "passio-control-center",
    };
    fs.writeFileSync(path.join(tmp, ".passio-request.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
    await git(["add", ".passio-request.json"], { cwd: tmp });
    await git(["commit", "-m", `chore(ai): request ${title}`], { cwd: tmp });
    await git(["push", "-u", "origin", branch], { cwd: tmp });
    audit("orchestrator_task_submit", { id, title, branch, route: route.category }, actor);
    return { ok: true, id, branch, route };
  } finally {
    try { await git(["worktree", "remove", "--force", tmp]); } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    try { await git(["worktree", "prune"]); } catch {}
  }
}
