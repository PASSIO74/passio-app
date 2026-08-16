// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE CODE EN LOCAL (GRATUIT) — appelle le binaire `claude` déjà installé sur
// la machine, qui utilise l'abonnement Claude Code de l'utilisateur. AUCUNE clé
// API, aucun coût au message. C'est l'alternative gratuite à ANTHROPIC_API_KEY.
//
// On lance `claude -p` en mode non-interactif, sortie JSON. Le prompt passe par
// STDIN (jamais dans argv → zéro souci de guillemets ni d'injection d'argument).
//
// ⚠️ SANDBOX FAIL-CLOSED — corrigé le 2026-08-16, ne pas revenir en arrière.
// Le code d'origine se reposait sur `--disallowedTools` (une LISTE NOIRE d'outils
// intégrés). Vérification faite en lançant réellement le CLI et en lui demandant
// ses outils : la liste noire laissait passer
//   • `PowerShell` — la liste interdisait « Bash », or l'outil shell s'appelle
//     PowerShell sur Windows : exécution de commandes arbitraires disponible ;
//   • TOUT le MCP Supabase du projet (`execute_sql`, `apply_migration`,
//     `delete_branch`, `pause_project`…) — les outils MCP ne sont pas des
//     intégrés, aucune liste noire d'intégrés ne les couvre ;
//   • CronCreate, RemoteTrigger, TaskCreate, SendMessage, Artifact…
// Et `.claude/settings.json` du projet pose `defaultMode: bypassPermissions`,
// donc ces outils s'auto-approuvent. Un texte hostile arrivant jusqu'au prompt
// (stack trace d'un navigateur) pouvait donc, en théorie, écrire en base de
// production. Une liste noire ne peut pas être exhaustive : la sandbox est
// désormais une LISTE BLANCHE (`--tools`), plus la neutralisation des
// personnalisations et des serveurs MCP.
// ═══════════════════════════════════════════════════════════════════════════
import { spawn } from "node:child_process";
import os from "node:os";
import { config } from "./config.js";

let _state = { checked: false, installed: false, loggedIn: false, available: false, version: "" };

// Neutralise tout ce qui pourrait élargir la sandbox sans passer par ce fichier :
// personnalisations du dépôt et de la machine (CLAUDE.md, skills, plugins, hooks,
// agents, commandes) et serveurs MCP. `--strict-mcp-config` sans `--mcp-config`
// = AUCUN serveur MCP. Pas de `--bare` : il couperait l'authentification par
// abonnement (OAuth jamais lu) et l'analyse gratuite cesserait de fonctionner.
const SANDBOX = ["--safe-mode", "--strict-mcp-config", "--no-session-persistence", "--no-chrome"];

// Les secrets du dashboard n'ont RIEN à faire dans l'environnement du processus
// enfant : il analyse du texte, il n'appelle jamais Supabase. On part de
// l'environnement complet (le CLI a besoin de PATH, HOME, APPDATA et de ses
// propres identifiants) et on retire nommément ce qui nous appartient.
const SECRET_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_URL",
  "DASH_SESSION_SECRET", "DASH_ADMIN_PASSWORD", "DASH_EXTRA_USERS",
];
function childEnv() {
  const e = { ...process.env };
  for (const k of SECRET_ENV) delete e[k];
  return e;
}

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
 * Arguments du CLI selon le mode. Exporté pour être VERROUILLÉ par un test :
 * c'est la frontière de sécurité de la sentinelle, elle ne doit pas pouvoir
 * s'élargir par inadvertance.
 *
 * • RAPIDE (~40 s) : répond à partir du seul contexte fourni dans le prompt.
 *   Aucun outil utile, dossier neutre (os.tmpdir) — donc pas de CLAUDE.md à
 *   charger — modèle rapide.
 * • APPROFONDI (~2-3 min) : Claude LIT le vrai code (Read/Grep/Glob et rien
 *   d'autre) pour un correctif exact ; cwd = dépôt, modèle plus fin.
 *
 * ⚠️ `--tools ""` est documenté comme « aucun outil » mais rend en fait la liste
 * COMPLÈTE par défaut, Bash/Edit/Write inclus — mesuré le 2026-08-16. Un nom
 * d'outil invalide produit le même effet. La seule forme fiable est une liste
 * blanche de noms VALIDES : le mode rapide n'obtient donc qu'un outil inerte
 * (bloc-notes de session, aucun accès disque ni réseau). Vérifié par un appel
 * réel : ce mode répond IMPOSSIBLE quand on lui demande de lire un fichier.
 */
export function buildCliArgs(deep) {
  const base = ["-p", "--output-format", "json", "--model", deep ? config.claudeCliModelDeep : config.claudeCliModel];
  return [...base, ...SANDBOX, "--tools", deep ? "Read,Grep,Glob" : "TodoWrite"];
}

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
      const args = buildCliArgs(deep);
      p = spawn("claude", args,
        { shell: true, cwd: deep ? config.repoPath : os.tmpdir(), windowsHide: true, env: childEnv() });
    } catch (e) { return finish({ error: e.message }); }
    timeoutMs = timeoutMs || (deep ? 420000 : 120000);
    // Sous Windows, `p.kill()` tue le shell intermédiaire (`shell: true`), pas
    // forcément l'arbre en dessous : un `claude` orphelin pouvait survivre au
    // délai et continuer à consommer le quota. La sentinelle lançant des
    // analyses sans personne devant l'écran, ces orphelins s'accumuleraient.
    const timer = setTimeout(() => {
      try { p.kill(); } catch {}
      if (process.platform === "win32" && p.pid) {
        try { spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {}
      }
      finish({ error: "L'analyse a pris trop de temps (délai dépassé)." });
    }, timeoutMs);
    // Borne de sortie. Une consigne hostile peut demander une réponse
    // gigantesque ; sans plafond, elle grossirait la mémoire du serveur puis le
    // fichier de diagnostics. On coupe net au-delà.
    const MAX_OUT = 400_000;
    p.stdout.on("data", (d) => {
      if (out.length > MAX_OUT) return;
      out += d;
      if (out.length > MAX_OUT) {
        out = out.slice(0, MAX_OUT);
        try { p.kill(); } catch {}
        finish({ error: "Réponse anormalement longue, analyse interrompue." });
      }
    });
    p.stderr.on("data", (d) => { if (err.length < 20_000) err += d; });
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
