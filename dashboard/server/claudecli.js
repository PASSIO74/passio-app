// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE CODE EN LOCAL (GRATUIT) — appelle le binaire `claude` déjà installé sur
// la machine, qui utilise l'abonnement Claude Code de l'utilisateur. AUCUNE clé
// API, aucun coût au message. C'est l'alternative gratuite à ANTHROPIC_API_KEY.
//
// On lance `claude -p` en mode non-interactif, sortie JSON, permission "plan"
// (lecture seule : Claude peut analyser le dépôt mais ne modifie jamais de
// fichier). Le prompt passe par STDIN (jamais dans argv → zéro souci de guillemets
// ni d'injection).
// ═══════════════════════════════════════════════════════════════════════════
import { spawn } from "node:child_process";
import os from "node:os";
import { config } from "./config.js";

let _state = { checked: false, installed: false, loggedIn: false, available: false, version: "" };

/** Lance `claude <args>` (sans stdin) et renvoie { ran, code, out, err }. */
function runCli(args, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let p;
    try { p = spawn("claude", args, { shell: true, cwd: config.repoPath, windowsHide: true }); }
    catch { return finish({ ran: false }); }
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => finish({ ran: false }));
    p.on("close", (code) => finish({ ran: true, code, out, err }));
    setTimeout(() => { try { p.kill(); } catch {} finish({ ran: false }); }, timeoutMs);
  });
}

/**
 * Détecte le `claude` local ET son état de connexion RÉEL (`claude auth status`).
 * available = installé ET connecté → c'est la seule condition d'analyse gratuite.
 */
export async function detectClaudeCli() {
  const st = await runCli(["auth", "status"]);
  let installed = false, loggedIn = false;
  if (st.ran) { installed = true; try { loggedIn = JSON.parse(st.out).loggedIn === true; } catch {} }
  let version = _state.version;
  if (installed && !version) { const v = await runCli(["--version"], 8000); if (v.ran) version = (v.out || "").trim(); }
  _state = { checked: true, installed, loggedIn, available: loggedIn, version };
  return loggedIn;
}

/** État connu (sans relancer la détection). */
export function claudeCliState() { return { ..._state }; }

/** true si on peut faire une analyse « en direct » (clé API OU CLI local connecté). */
export function liveFixAvailable() { return Boolean(config.anthropicKey) || _state.available; }

/**
 * Lance une analyse via le `claude` local. Retourne { analysis } en cas de succès,
 * ou { error, authNeeded } si un souci survient (ex. session à reconnecter).
 */
export function runClaudeCli(prompt, { deep = false, timeoutMs } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let p;
    try {
      // Deux modes :
      // • RAPIDE (défaut, ~40 s) : réponse directe à partir du contexte déjà fourni
      //   (code, stack, chronologie sont dans le prompt). TOUS les outils coupés, dossier
      //   neutre (os.tmpdir) pour ne pas charger l'énorme CLAUDE.md, modèle sonnet.
      // • APPROFONDI (opt-in, ~2-3 min) : Claude LIT le vrai code du dépôt (Read/Grep/Glob,
      //   lecture seule — jamais Edit/Write) pour un correctif EXACT applicable ; cwd = dépôt,
      //   modèle plus fin. Timeout plus long.
      const args = deep
        ? ["-p", "--output-format", "json", "--model", config.claudeCliModelDeep,
           "--disallowedTools", "Bash", "Task", "WebFetch", "WebSearch", "Edit", "Write", "NotebookEdit", "TodoWrite"]
        : ["-p", "--output-format", "json", "--model", config.claudeCliModel,
           "--disallowedTools", "Bash", "Glob", "Grep", "Task", "WebFetch", "WebSearch", "Read", "Edit", "Write", "NotebookEdit", "TodoWrite"];
      p = spawn("claude", args,
        { shell: true, cwd: deep ? config.repoPath : os.tmpdir(), windowsHide: true });
    } catch (e) { return finish({ error: e.message }); }
    timeoutMs = timeoutMs || (deep ? 420000 : 120000);
    const timer = setTimeout(() => { try { p.kill(); } catch {} finish({ error: "L'analyse a pris trop de temps (délai dépassé)." }); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); finish({ error: e.message }); });
    p.on("close", () => {
      clearTimeout(timer);
      let j = null;
      try { j = JSON.parse(out); } catch {}
      if (j && j.is_error) {
        const msg = String(j.result || "");
        const authNeeded = /authenticate|oauth|401|expired|log ?in|connect/i.test(msg);
        return finish({ error: msg || "Erreur Claude Code.", authNeeded });
      }
      if (j && typeof j.result === "string") return finish({ analysis: j.result });
      if (out.trim()) return finish({ analysis: out.trim() });
      return finish({ error: err.trim() || "Réponse vide de Claude Code." });
    });
    try { p.stdin.write(prompt); p.stdin.end(); } catch (e) { clearTimeout(timer); finish({ error: e.message }); }
  });
}
