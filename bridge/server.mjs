#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const BRIDGE_ROOT = path.join(REPO, ".passio", "bridge");
const WORKTREES = path.join(BRIDGE_ROOT, "worktrees");
const TASKS = path.join(BRIDGE_ROOT, "tasks");
const MAX_OUTPUT = 240_000;

fs.mkdirSync(WORKTREES, { recursive: true });
fs.mkdirSync(TASKS, { recursive: true });

function textResult(value, isError = false) {
  return {
    isError,
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }]
  };
}

function slug(value) {
  return String(value || "task")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

function execFile(command, args, cwd = REPO, opts = {}) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 32 * 1024 * 1024,
    env: opts.env || process.env
  });
  return {
    ok: r.status === 0,
    code: r.status,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
    error: r.error ? r.error.message : null
  };
}

function requireGitRepo() {
  const r = execFile("git", ["rev-parse", "--show-toplevel"]);
  if (!r.ok || path.resolve(r.stdout) !== REPO) {
    throw new Error(`Passio Bridge doit etre lance depuis le depot Passio attendu: ${REPO}`);
  }
}

function resolveClaude() {
  const finder = process.platform === "win32" ? "where" : "which";
  const r = execFile(finder, ["claude"], REPO);
  if (!r.ok) throw new Error("Claude Code CLI introuvable dans PATH.");
  const candidates = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return candidates.find((p) => /\.(cmd|exe|bat)$/i.test(p)) || candidates[0] || "claude";
}

function safeEnv() {
  // Claude Code a besoin de son environnement utilisateur pour son auth et ses outils,
  // mais le Bridge ne rajoute aucun secret et n'accepte jamais d'env arbitraire du client.
  return { ...process.env, PASSIO_BRIDGE: "1" };
}

function runClaude({ cwd, prompt, planOnly = false, sessionId = null, maxTurns = 60 }) {
  const claude = resolveClaude();
  const args = ["-p", prompt, "--output-format", "json", "--max-turns", String(maxTurns)];
  if (sessionId) args.push("--resume", sessionId);
  if (planOnly) args.push("--permission-mode", "plan");
  else args.push("--permission-mode", "bypassPermissions");

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(claude, args, {
      cwd,
      env: safeEnv(),
      shell: process.platform === "win32",
      windowsHide: true
    });
    child.stdout.on("data", (d) => { if (stdout.length < MAX_OUTPUT) stdout += d.toString(); });
    child.stderr.on("data", (d) => { if (stderr.length < MAX_OUTPUT) stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch (_) {}
      resolve({ code, stdout, stderr, parsed });
    });
  });
}

function taskFile(id) {
  return path.join(TASKS, `${id}.json`);
}

function saveTask(task) {
  task.updatedAt = new Date().toISOString();
  fs.writeFileSync(taskFile(task.id), JSON.stringify(task, null, 2), "utf8");
}

function loadTask(id) {
  const p = taskFile(id);
  if (!fs.existsSync(p)) throw new Error(`Tache Bridge inconnue: ${id}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function repoSnapshot(cwd = REPO) {
  return {
    branch: execFile("git", ["branch", "--show-current"], cwd).stdout,
    head: execFile("git", ["rev-parse", "HEAD"], cwd).stdout,
    status: execFile("git", ["status", "--short"], cwd).stdout,
    log: execFile("git", ["log", "-5", "--oneline"], cwd).stdout
  };
}

function createWorktree(title) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const id = `${stamp}-${slug(title)}`;
  const branch = `bridge/${slug(title)}-${stamp}`;
  const dir = path.join(WORKTREES, id);

  const fetch = execFile("git", ["fetch", "origin", "main"], REPO);
  if (!fetch.ok) throw new Error(`git fetch origin main a echoue: ${fetch.stderr || fetch.stdout}`);

  const wt = execFile("git", ["worktree", "add", "-b", branch, dir, "origin/main"], REPO);
  if (!wt.ok) throw new Error(`creation worktree echouee: ${wt.stderr || wt.stdout}`);
  return { id, branch, dir };
}

function riskInstruction(risk) {
  if (risk === "critical") {
    return [
      "RISQUE CRITIQUE: auth/identite, RLS, Storage, contenu d'autrui, PII, paiement, moderation, permissions, migration destructive ou secret.",
      "Tu dois utiliser la revue croisee existante du projet avant de conclure: generer le dossier avec `npm run revue` (avec tests adaptes), le faire challenger via le canal existant `scripts/chatgpt.js`/Codex, puis verifier chaque objection dans le depot reel.",
      "Classe les objections CONFIRME / INFIRME / PARTIEL / NON APPLICABLE et corrige uniquement ce qui est confirme."
    ].join("\n");
  }
  return "Risque normal: applique les tests adaptes; n'utilise la revue croisee que si le changement touche finalement une frontiere critique.";
}

function implementationPrompt(title, instruction, risk) {
  return `Tu travailles sur PASSIO via Passio Bridge.\n\nOBJECTIF: ${title}\n\nINSTRUCTION UTILISATEUR:\n${instruction}\n\n${riskInstruction(risk)}\n\nREGLES BRIDGE NON NEGOCIABLES:\n- Lis CLAUDE.md et respecte tous les garde-fous du projet.\n- Tu es dans un worktree dedie; ne touche pas aux autres worktrees.\n- Ne merge jamais main et ne force jamais un push.\n- Ne deploie pas et n'effectue aucune ecriture directe destructive en production. Les operations prod a risque doivent rester bloquees sauf si l'instruction les exige explicitement ET que les garde-fous projet les autorisent.\n- Teste le comportement positif ET negatif pertinent.\n- A la fin, committe uniquement ton perimetre et pousse TA branche sur origin.\n- Dans ton rapport final, donne: branche, commit, fichiers modifies, tests executes/resultats, revue Codex si declenchee, risques residuels, et ce qui n'a pas pu etre prouve.\n- Ne demande pas de confirmation a Benjamin: choisis l'option la plus sure qui satisfait l'objectif et va au bout.`;
}

requireGitRepo();

const server = new McpServer({ name: "passio-bridge", version: "0.1.0" });

server.registerTool(
  "passio_status",
  {
    description: "Lire l'etat Git et les taches locales du Passio Bridge. Aucune modification.",
    inputSchema: z.object({})
  },
  async () => {
    const tasks = fs.readdirSync(TASKS).filter((f) => f.endsWith(".json")).slice(-20).map((f) => {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(TASKS, f), "utf8"));
        return { id: t.id, title: t.title, branch: t.branch, status: t.status, updatedAt: t.updatedAt };
      } catch (_) { return null; }
    }).filter(Boolean);
    return textResult({ repo: REPO, ...repoSnapshot(REPO), tasks });
  }
);

server.registerTool(
  "passio_analyze",
  {
    description: "Demander a Claude Code une analyse en mode plan/lecture du depot Passio, sans modifier les fichiers.",
    inputSchema: z.object({
      question: z.string().min(1).max(20000),
      maxTurns: z.number().int().min(1).max(80).default(30)
    })
  },
  async ({ question, maxTurns }) => {
    const prompt = `Analyse PASSIO sans modifier aucun fichier. Lis CLAUDE.md et le code necessaire. Reponds avec faits verifies, incertitudes, risques et recommandation. Question: ${question}`;
    const out = await runClaude({ cwd: REPO, prompt, planOnly: true, maxTurns });
    if (out.code !== 0 || out.parsed?.is_error) return textResult({ error: true, stderr: out.stderr, raw: out.stdout }, true);
    return textResult({ sessionId: out.parsed?.session_id || null, result: out.parsed?.result || out.stdout });
  }
);

server.registerTool(
  "passio_implement",
  {
    description: "Executer une modification Passio dans un worktree et une branche dedies via Claude Code. Ne merge pas main. Pour les sujets critiques, impose la revue croisee Codex existante.",
    inputSchema: z.object({
      title: z.string().min(3).max(160),
      instruction: z.string().min(1).max(30000),
      risk: z.enum(["normal", "critical"]).default("normal"),
      maxTurns: z.number().int().min(5).max(120).default(80)
    })
  },
  async ({ title, instruction, risk, maxTurns }) => {
    const wt = createWorktree(title);
    const task = {
      id: wt.id,
      title,
      instruction,
      risk,
      branch: wt.branch,
      worktree: wt.dir,
      status: "running",
      createdAt: new Date().toISOString(),
      sessionId: null
    };
    saveTask(task);

    const out = await runClaude({ cwd: wt.dir, prompt: implementationPrompt(title, instruction, risk), maxTurns });
    task.sessionId = out.parsed?.session_id || null;
    task.status = out.code === 0 && !out.parsed?.is_error ? "completed" : "failed";
    task.result = out.parsed?.result || out.stdout;
    task.stderr = out.stderr;
    task.snapshot = repoSnapshot(wt.dir);
    saveTask(task);

    return textResult({
      taskId: task.id,
      status: task.status,
      branch: task.branch,
      sessionId: task.sessionId,
      result: task.result,
      git: task.snapshot,
      stderr: task.stderr || undefined
    }, task.status !== "completed");
  }
);

server.registerTool(
  "passio_continue",
  {
    description: "Reprendre une tache Passio Bridge existante dans son worktree et sa session Claude Code.",
    inputSchema: z.object({
      taskId: z.string().min(1).max(120),
      instruction: z.string().min(1).max(30000),
      maxTurns: z.number().int().min(3).max(120).default(60)
    })
  },
  async ({ taskId, instruction, maxTurns }) => {
    const task = loadTask(taskId);
    if (!fs.existsSync(task.worktree)) return textResult(`Worktree absent pour ${taskId}: ${task.worktree}`, true);
    const prompt = `Continue la tache Passio Bridge \"${task.title}\". Nouvelle instruction: ${instruction}\nRespecte les memes regles de securite et de perimetre. Teste, committe uniquement ton perimetre et pousse ta branche; ne merge jamais main.`;
    const out = await runClaude({ cwd: task.worktree, prompt, sessionId: task.sessionId, maxTurns });
    task.sessionId = out.parsed?.session_id || task.sessionId;
    task.status = out.code === 0 && !out.parsed?.is_error ? "completed" : "failed";
    task.result = out.parsed?.result || out.stdout;
    task.stderr = out.stderr;
    task.snapshot = repoSnapshot(task.worktree);
    saveTask(task);
    return textResult({ taskId, status: task.status, branch: task.branch, sessionId: task.sessionId, result: task.result, git: task.snapshot }, task.status !== "completed");
  }
);

console.error(`Passio Bridge MCP 0.1.0 - repo ${REPO}`);
serveStdio(() => server);
