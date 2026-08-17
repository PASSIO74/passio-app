#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

function run(command, args = [], cwd = REPO) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  return {
    ok: r.status === 0,
    code: r.status,
    text: ((r.stdout || "") + (r.stderr || "")).trim(),
    error: r.error ? r.error.message : null
  };
}

const checks = [];
function check(name, command, args, detail) {
  const r = run(command, args);
  checks.push({ name, ok: r.ok, detail: r.ok ? (r.text.split(/\r?\n/)[0] || detail || "OK") : (r.error || r.text || detail || "échec") });
}

check("Git", "git", ["--version"]);
check("Dépôt Passio", "git", ["rev-parse", "--show-toplevel"]);
check("Claude Code", "claude", ["--version"], "CLI Claude introuvable ou non exécutable");
check("Codex", "codex", ["--version"], "CLI Codex introuvable ou non exécutable");

const repo = run("git", ["rev-parse", "--show-toplevel"]);
if (repo.ok && path.resolve(repo.text.split(/\r?\n/)[0]) !== REPO) {
  const c = checks.find((x) => x.name === "Dépôt Passio");
  c.ok = false;
  c.detail = `attendu ${REPO}, obtenu ${repo.text}`;
}

console.log("PASSIO BRIDGE — diagnostic local\n");
for (const c of checks) console.log(`${c.ok ? "OK" : "KO"}  ${c.name} — ${c.detail}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} prérequis disponibles.`);
if (failed.length) {
  console.log("Le Bridge ne doit pas être activé dans ChatGPT tant que ces KO ne sont pas corrigés.");
  process.exit(1);
}

console.log("Prérequis CLI présents. Étape suivante : npm install dans bridge/, puis test MCP local/tunnel.");
