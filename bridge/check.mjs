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
    shell: false,
    windowsHide: true
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
  checks.push({ name, ok: r.ok, detail: r.ok ? (r.text.split(/\r?\n/)[0] || detail || "OK") : (r.error || r.text || detail || "echec") });
}

check("Git", "git", ["--version"]);
check("Depot Passio", "git", ["rev-parse", "--show-toplevel"]);
check("Claude Code", process.platform === "win32" ? "claude.cmd" : "claude", ["--version"], "CLI Claude introuvable ou non executable");
check("Codex", process.platform === "win32" ? "codex.cmd" : "codex", ["--version"], "CLI Codex introuvable ou non executable");

const repo = run("git", ["rev-parse", "--show-toplevel"]);
if (repo.ok && path.resolve(repo.text.split(/\r?\n/)[0]) !== REPO) {
  const c = checks.find((x) => x.name === "Depot Passio");
  c.ok = false;
  c.detail = `attendu ${REPO}, obtenu ${repo.text}`;
}

const isolated = process.env.PASSIO_BRIDGE_ISOLATED === "1";

console.log("PASSIO BRIDGE — diagnostic local\n");
for (const c of checks) console.log(`${c.ok ? "OK" : "KO"}  ${c.name} — ${c.detail}`);
console.log(`${isolated ? "OK" : "BLOQUE"}  Worker isole — ${isolated ? "PASSIO_BRIDGE_ISOLATED=1" : "non active (volontairement sur pour le test du tunnel)"}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} prerequis CLI disponibles.`);
if (failed.length) {
  console.log("Le Bridge ne doit pas etre active dans ChatGPT tant que ces KO ne sont pas corriges.");
  process.exit(1);
}

if (!isolated) {
  console.log("\nMode SECURISE DE PRE-CONNEXION : passio_status fonctionne, mais passio_analyze / passio_implement / passio_continue refuseront de lancer Claude.");
  console.log("N'active pas PASSIO_BRIDGE_ISOLATED=1 sur le compte Windows principal. Ce flag est reserve au futur worker/VM dedie sans secrets ni acces prod.");
} else {
  console.log("\nWorker isole actif : verifier qu'il ne contient aucun secret personnel, aucune cle service_role et aucun acces Supabase prod avant d'ouvrir le tunnel.");
}
