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
import { config } from "./config.js";

let _state = { checked: false, available: false, version: "" };

/** Détecte une fois si le binaire `claude` répond. */
export async function detectClaudeCli() {
  const ok = await new Promise((resolve) => {
    let out = "";
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const p = spawn("claude", ["--version"], { shell: true, cwd: config.repoPath, windowsHide: true });
      p.stdout.on("data", (d) => (out += d));
      p.on("error", () => finish(false));
      p.on("close", (code) => { _state.version = out.trim(); finish(code === 0 && /Claude Code/i.test(out)); });
      setTimeout(() => { try { p.kill(); } catch {} finish(false); }, 8000);
    } catch { finish(false); }
  });
  _state = { checked: true, available: ok, version: _state.version };
  return ok;
}

/** État connu (sans relancer la détection). */
export function claudeCliState() { return { ..._state }; }

/** true si on peut faire une analyse « en direct » (clé API OU CLI local). */
export function liveFixAvailable() { return Boolean(config.anthropicKey) || _state.available; }

/**
 * Lance une analyse via le `claude` local. Retourne { analysis } en cas de succès,
 * ou { error, authNeeded } si un souci survient (ex. session à reconnecter).
 */
export function runClaudeCli(prompt, { timeoutMs = 150000 } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let p;
    try {
      p = spawn("claude", ["-p", "--output-format", "json", "--permission-mode", "plan"],
        { shell: true, cwd: config.repoPath, windowsHide: true });
    } catch (e) { return finish({ error: e.message }); }
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
