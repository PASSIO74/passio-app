// ═══════════════════════════════════════════════════════════════════════════
// TESTS — exécute des commandes de test de Passio depuis une LISTE BLANCHE.
// Jamais de console système ouverte : seules les commandes déclarées ici sont
// exécutables. Sortie streamée en direct via SSE. Une seule exécution à la fois.
// ═══════════════════════════════════════════════════════════════════════════
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { broadcast } from "./sse.js";
import { audit } from "./audit.js";
import { entree } from "./liste-blanche.js";

export const TEST_SUITES = {
  authz:      { label: "Autorisation — séparation entre comptes (AUTHZ-CRITICAL)", cmd: "npx", args: ["playwright", "test", "tests/e2e/authz-critical.spec.js"] },
  smoke:      { label: "Smoke + access-gate (E2E)", cmd: "npm", args: ["test"] },
  handlers:   { label: "Audit des handlers onclick", cmd: "npm", args: ["run", "audit:handlers"] },
  globals:    { label: "Audit des collisions de globals", cmd: "npm", args: ["run", "audit:globals"] },
  irl:        { label: "E2E IRL", cmd: "npx", args: ["playwright", "test", "tests/e2e/irl.spec.js"] },
  cdv:        { label: "E2E Carnet de voyage", cmd: "npx", args: ["playwright", "test", "tests/e2e/cdv.spec.js"] },
  feedrank:   { label: "E2E Classement du fil", cmd: "npx", args: ["playwright", "test", "tests/e2e/feed-ranking.spec.js"] },
  cadrage:    { label: "E2E Cadrage viewport", cmd: "npx", args: ["playwright", "test", "tests/e2e/cadrage.spec.js"] },
};

let running = null;
let dernierAuthz = null;   // { pass, total, at, code }

export function authzSnapshot() {
  if (!dernierAuthz) return null;
  const ageMs = Math.max(0, Date.now() - dernierAuthz.at);
  const minutes = Math.floor(ageMs / 60000);
  return {
    pass: dernierAuthz.pass,
    total: dernierAuthz.total,
    at: dernierAuthz.at,
    ageMs,
    ageMinutes: Math.floor(ageMs / 60000),
    code: dernierAuthz.code,
    verifieLe: minutes < 1 ? "à l'instant" : `il y a ${minutes} min`,
  };
}

function capterAuthz(sortie, code) {
  const passed = /(\d+)\s+passed/.exec(sortie);
  const failed = /(\d+)\s+failed/.exec(sortie);
  const p = passed ? Number(passed[1]) : 0;
  const f = failed ? Number(failed[1]) : 0;
  if (!p && !f) return;
  dernierAuthz = { pass: p, total: p + f, at: Date.now(), code };
}

/** Abat tout l'arbre (revue du 2026-09-13) : sous Windows `proc.kill()` ne tuait
 *  que cmd.exe — Playwright et Chromium survivaient, et une seconde suite pouvait
 *  démarrer en parallèle sur le même port 8080. `taskkill /T /F` seul, `kill()`
 *  en repli (cf. claudecli.js tuerArbre, mesuré). */
function tuerArbre(proc) {
  if (!proc) return;
  if (process.platform === "win32" && proc.pid) {
    let tk = null;
    try { tk = spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {}
    if (!tk) { try { proc.kill(); } catch {} return; }
    tk.on("error", () => { try { proc.kill(); } catch {} });
    tk.on("close", (code) => { if (code !== 0) { try { proc.kill(); } catch {} } });
    return;
  }
  try { proc.kill(); } catch {}
}

export function listSuites() {
  return Object.entries(TEST_SUITES).map(([id, s]) => ({ id, label: s.label, cmd: [s.cmd, ...s.args].join(" ") }));
}
export function currentRun() {
  return running ? { id: running.id, startedAt: running.startedAt, running: true, lines: running.output.length } : { running: false };
}

export function runSuite(id, actor) {
  if (running) { const e = new Error("Un test est déjà en cours."); e.code = 409; throw e; }
  const suite = entree(TEST_SUITES, id);
  if (!suite) { const e = new Error("Suite inconnue (hors liste blanche)."); e.code = 400; throw e; }
  audit("run_tests", { id, cmd: suite.cmd + " " + suite.args.join(" ") }, actor);

  const proc = spawn(suite.cmd, suite.args, { cwd: config.repoPath, shell: process.platform === "win32", env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
  const run = { id, proc, startedAt: Date.now(), output: [] };
  running = run;
  broadcast("test", { phase: "start", id, label: suite.label });

  // `run`, pas `running` : après un arrêt, un processus qui vide encore ses tampons
  // écrivait dans `running.output` alors que `running` valait null → TypeError
  // dans un gestionnaire 'data' → exception non rattrapée → serveur mort.
  const push = (chunk, stream) => {
    const text = chunk.toString();
    run.output.push(text);
    if (run.output.length > 4000) run.output.shift();
    broadcast("test", { phase: "log", id, stream, text });
  };
  proc.stdout.on("data", (c) => push(c, "out"));
  proc.stderr.on("data", (c) => push(c, "err"));
  proc.on("close", (code) => {
    if (id === "authz") capterAuthz(run.output.join(""), code);
    broadcast("test", { phase: "end", id, code });
    audit("run_tests_done", { id, code }, actor);
    if (running === run) running = null;
  });
  proc.on("error", (err) => {
    broadcast("test", { phase: "end", id, code: -1, error: err.message });
    if (running === run) running = null;
  });
  return { started: id };
}

export function runSuiteAwait(id, cwd, actor, timeoutMs = 900_000) {
  return new Promise((resolve, reject) => {
    if (running) { const e = new Error("Un test est déjà en cours."); e.code = 409; return reject(e); }
    const suite = entree(TEST_SUITES, id);
    if (!suite) { const e = new Error("Suite inconnue (hors liste blanche)."); e.code = 400; return reject(e); }
    audit("run_tests_auto", { id, cwd }, actor);
    const proc = spawn(suite.cmd, suite.args, { cwd: cwd || config.repoPath, shell: process.platform === "win32", env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
    const run = { id, proc, startedAt: Date.now(), output: [] };
    running = run;
    broadcast("test", { phase: "start", id, label: suite.label + " (vérification automatique)" });
    let out = "";
    const push = (c, stream) => {
      const text = c.toString();
      out += text; if (out.length > 400_000) out = out.slice(-400_000);
      run.output.push(text); if (run.output.length > 4000) run.output.shift();
      broadcast("test", { phase: "log", id, stream, text });
    };
    const timer = setTimeout(() => tuerArbre(proc), timeoutMs);
    proc.stdout.on("data", (c) => push(c, "out"));
    proc.stderr.on("data", (c) => push(c, "err"));
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (id === "authz") capterAuthz(out, code);
      broadcast("test", { phase: "end", id, code });
      if (running === run) running = null;
      resolve({ code: code === null ? -1 : code, output: out });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      broadcast("test", { phase: "end", id, code: -1, error: err.message });
      if (running === run) running = null;
      resolve({ code: -1, output: out + "\n" + err.message });
    });
  });
}

export function stopRun(actor) {
  if (!running) return { stopped: false };
  tuerArbre(running.proc);
  audit("stop_tests", { id: running.id }, actor);
  // `running` est libéré par l'événement 'close' du processus (l'arbre entier est
  // abattu, il arrive vite) : le libérer ici laissait démarrer une seconde suite
  // pendant que la première vidait encore Chromium sur le port 8080.
  const id = running.id;
  return { stopped: true, id };
}
