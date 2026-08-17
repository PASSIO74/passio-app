#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

// Depuis le correctif CVE-2024-27980 de Node, spawnSync REFUSE un .cmd/.bat sans
// shell (EINVAL). On ne remet pas shell:true pour autant : on reprend le motif de
// server.mjs (commandForSpawn) et on passe par ComSpec avec des argv fixes.
function spawnFixed(command, args, cwd) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    // cmd /s retire le PREMIER et le DERNIER guillemet de la ligne : sans paire
    // englobante, "chemin.cmd" "--version" devient chemin.cmd" "--version.
    const quote = (value) => `"${String(value).replace(/"/g, '\\"')}"`;
    const line = `"${[command, ...args].map(quote).join(" ")}"`;
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", line], {
      cwd,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: true
    });
  }
  return spawnSync(command, args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
}

// Un shim npm s'appelle claude.cmd sur Windows : on le localise avec where.exe
// (executable natif, donc sans shell) plutot que de deviner le nom.
function resolveCli(name) {
  if (process.platform !== "win32") return name;
  const r = spawnSync("where", [name], { encoding: "utf8", shell: false, windowsHide: true });
  if (r.status !== 0) return `${name}.cmd`;
  const candidates = (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return candidates.find((p) => /\.(cmd|exe|bat)$/i.test(p)) || candidates[0] || `${name}.cmd`;
}

function run(command, args = [], cwd = REPO) {
  const r = spawnFixed(command, args, cwd);
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
check("Claude Code", resolveCli("claude"), ["--version"], "CLI Claude introuvable ou non executable");
check("Codex", resolveCli("codex"), ["--version"], "CLI Codex introuvable ou non executable");

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
