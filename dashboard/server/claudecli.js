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
import path from "node:path";
import { config } from "./config.js";

// Dossier d'identifiants ISOLÉ pour le `claude` du pilotage (CLAUDE_CONFIG_DIR),
// relatif à la racine du dashboard. Vide = partage `~/.claude` avec l'application
// Claude de bureau et les terminaux. Lu ICI et non dans config.js : ce fichier
// est la frontière de sécurité de la sandbox, et config.js est sous garde
// « gouvernance critique » (contre-revue humaine) pour d'autres raisons.
const CLAUDE_CONFIG_DIR = process.env.DASH_CLAUDE_CONFIG_DIR
  ? path.resolve(config.root, process.env.DASH_CLAUDE_CONFIG_DIR) : "";

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAT DE LA CONNEXION — et POURQUOI elle est dans cet état (`reason`).
//
//   reason : null            → connecté
//            "logged_out"    → le CLI répond, mais la session OAuth est tombée
//                              (→ `claude auth login`, ou Connecter-Claude.cmd)
//            "auth_refused"  → une analyse a été refusée faute d'authentification
//            "not_installed" → `claude` introuvable (PATH) ou trop ancien
//            "probe"         → la sonde elle-même ne répond plus (délai dépassé,
//                              machine saturée, disque plein…) N fois de suite
//
// `since` date le dernier CHANGEMENT de disponibilité : l'écran peut dire
// « déconnecté depuis 3 h » au lieu d'un état sans histoire.
// ═══════════════════════════════════════════════════════════════════════════
let _state = {
  checked: false, installed: false, loggedIn: false, available: false, version: "",
  reason: null, probeFailures: 0, lastProbeAt: null, lastProbeError: null, since: null,
};

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
// Le CLI lancé par le pilotage hérite parfois d'une session Claude Code parente
// (le pilotage a été démarré depuis un terminal de Claude Code) : ces variables
// le feraient se croire « enfant » d'une session hôte et attendre son
// authentification de l'hôte. On les retire : c'est un processus autonome.
const PARENT_SESSION_ENV = [
  "CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_HOST_SESSION_ID",
  "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH",
  "CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_PID",
];
function childEnv() {
  const e = { ...process.env };
  for (const k of SECRET_ENV) delete e[k];
  for (const k of PARENT_SESSION_ENV) delete e[k];
  // Identifiants ISOLÉS (facultatif, DASH_CLAUDE_CONFIG_DIR) : le CLI du pilotage
  // lit et rafraîchit SES jetons dans un dossier à lui, que ni l'application
  // Claude de bureau ni un terminal ne réécrivent. Sans lui, tous partagent
  // `~/.claude/.credentials.json` — voir la note dans README « connexion ».
  if (CLAUDE_CONFIG_DIR) e.CLAUDE_CONFIG_DIR = CLAUDE_CONFIG_DIR;
  return e;
}

/** Sous Windows, `p.kill()` tue le shell intermédiaire (`shell: true`), pas
 *  l'arbre en dessous : on abat tout l'arbre, sinon un `claude` orphelin survit. */
function tuerArbre(p) {
  try { p.kill(); } catch {}
  if (process.platform === "win32" && p && p.pid) {
    try { spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {}
  }
}

// ── Sonde ──────────────────────────────────────────────────────────────────
// 45 s et non 12 : mesuré, `claude auth status` répond en ~0,5 s sur un poste
// calme, mais un poste saturé (shards e2e, build, disque plein) peut mettre
// bien plus — et un délai dépassé n'est PAS une déconnexion, c'est une sonde
// qui n'a rien vu. Les deux cas sont distingués plus bas.
const PROBE_TIMEOUT_MS = Math.max(10_000, Number(process.env.DASH_CLAUDE_CLI_PROBE_TIMEOUT_S || 45) * 1000);
// Sondes NON CONCLUANTES consécutives avant de se déclarer indisponible.
const PROBE_FAILURES_MAX = Math.max(1, Number(process.env.DASH_CLAUDE_CLI_PROBE_FAILURES || 3));

/**
 * Lance `claude <args>` (sans stdin).
 * Renvoie { ran: true, code, out, err } si le processus a RÉPONDU (quel que
 * soit son code), ou { ran: false, reason: "timeout" | "spawn", err } si la
 * sonde n'a rien pu conclure. La distinction est le cœur de la robustesse :
 * « pas de réponse » ne vaut pas « déconnecté ».
 */
function runCli(args, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let p;
    try { p = spawn("claude", args, { shell: true, cwd: config.repoPath, windowsHide: true, env: childEnv() }); }
    catch (e) { return finish({ ran: false, reason: "spawn", err: e.message }); }
    const timer = setTimeout(() => { tuerArbre(p); finish({ ran: false, reason: "timeout", err: `aucune réponse en ${Math.round(timeoutMs / 1000)} s` }); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); finish({ ran: false, reason: "spawn", err: e.message }); });
    p.on("close", (code) => { clearTimeout(timer); finish({ ran: true, code, out, err }); });
  });
}

/** Extrait l'objet JSON de la sortie de `claude auth status` (tolère une bannière). */
function parseAuthStatus(out) {
  const s = String(out || "");
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

/** Pose le nouvel état ; `since` ne bouge que si la DISPONIBILITÉ change. */
function poser(next, now = Date.now()) {
  if (next.available !== _state.available || _state.since === null) next.since = now;
  else next.since = _state.since;
  _state = next;
  return _state;
}

/**
 * Détecte le `claude` local ET son état de connexion RÉEL (`claude auth status`).
 * available = installé ET connecté → c'est la seule condition d'analyse gratuite.
 *
 * Une sonde NON CONCLUANTE (délai dépassé, spawn impossible) ne rabat PAS l'état :
 * on garde le dernier état connu et on compte. Ce n'est qu'après
 * PROBE_FAILURES_MAX échecs consécutifs qu'on se déclare indisponible, avec la
 * raison « probe » — jamais « absent ». Avant cette correction (2026-09-12), un
 * seul dépassement de 12 s suffisait à afficher « CLI absente » et à rendre la
 * sentinelle sourde pour dix minutes.
 *
 * `probe` est injectable pour les tests (la vraie sonde dépend du poste).
 */
export async function detectClaudeCli({ probe = runCli } = {}) {
  const st = await probe(["auth", "status"], PROBE_TIMEOUT_MS);
  const now = Date.now();

  if (!st || !st.ran) {
    const failures = (_state.probeFailures || 0) + 1;
    const next = { ..._state, checked: true, probeFailures: failures, lastProbeAt: now, lastProbeError: (st && st.reason) || "spawn" };
    if (failures >= PROBE_FAILURES_MAX && _state.available) {
      next.loggedIn = false; next.available = false; next.reason = "probe";
    }
    poser(next, now);
    return _state.loggedIn;
  }

  const j = parseAuthStatus(st.out);
  const installed = j !== null;
  const loggedIn = installed && j.loggedIn === true;
  let version = _state.version;
  if (installed && !version) { const v = await probe(["--version"], 15_000); if (v && v.ran) version = (v.out || "").trim(); }
  poser({
    ..._state, checked: true, installed, loggedIn, available: loggedIn, version,
    reason: loggedIn ? null : installed ? "logged_out" : "not_installed",
    probeFailures: 0, lastProbeAt: now, lastProbeError: null,
  }, now);
  return loggedIn;
}

/** État connu (sans relancer la détection). */
export function claudeCliState() { return { ..._state, isolated: Boolean(CLAUDE_CONFIG_DIR) }; }

// ═══════════════════════════════════════════════════════════════════════════
// SURVEILLANCE DE LA CONNEXION — corrigé le 2026-09-09, durci le 2026-09-12.
//
// `detectClaudeCli()` ne tournait QU'UNE FOIS, au démarrage (`index.js`), et
// n'était rejouée que si un humain cliquait la clé du dashboard. Or la session
// OAuth du CLI expire toute seule. Conséquence mesurée : la sentinelle tourne
// des jours durant avec `available: false`, donc SANS analyser une seule
// alerte — et l'écran continue d'annoncer l'état du démarrage, qui n'est plus
// vrai. Le pilotage se croyait calme parce qu'il était sourd, exactement
// l'angle mort décrit en tête de `sentinel.js`.
//
// Corrections, complémentaires :
//   ① `noteAuthFailure()` — un refus d'authentification pendant une analyse
//      RABAT l'état immédiatement, au lieu de laisser l'écran mentir jusqu'au
//      prochain redémarrage — et le SIGNALE (2026-09-12 : jusque-là cette
//      chute-là était muette, et le tour de surveillance suivant, partant d'un
//      état déjà « déconnecté », ne voyait plus rien à signaler) ;
//   ② `startClaudeCliWatch()` — re-détection périodique, donc la reconnexion
//      (`claude auth login` dans un terminal) est reprise TOUTE SEULE, sans
//      relancer le pilotage ni cliquer nulle part ;
//   ③ cadence ADAPTATIVE (2026-09-12) : 10 min quand tout va bien, 1 min dès que
//      la connexion est perdue — une reconnexion est vue en moins d'une minute,
//      au lieu de rester « à reconnecter » jusqu'à dix minutes après l'avoir été ;
//   ④ chaque bascule est signalée dans le flux : `warn` à la chute (avec la
//      RAISON), `info` au retour — sans le retour, on ne sait jamais si la
//      reconnexion a pris.
//
// ⚠️ La sonde `claude auth status` est un lancement de processus : la cadence
// reste basse et le minuteur est `unref()` — sinon il tiendrait le processus
// Node en vie et les tests ne rendraient jamais la main.
// ═══════════════════════════════════════════════════════════════════════════
const WATCH_MS = Math.max(60_000, Number(process.env.DASH_CLAUDE_CLI_WATCH_MIN || 10) * 60_000);
const RETRY_MS = Math.max(30_000, Number(process.env.DASH_CLAUDE_CLI_RETRY_MIN || 1) * 60_000);
let _watchTimer = null;
let _watching = false;

/** Délai avant la prochaine sonde : long si connecté, court si on attend la reconnexion. Pur, verrouillé par test. */
export function nextWatchDelay(state = _state, everyMs = WATCH_MS, retryMs = RETRY_MS) {
  return state.available ? everyMs : Math.min(everyMs, retryMs);
}

const RAISONS = {
  logged_out: "La session du CLI a expiré : plus aucun diagnostic ni correctif automatique tant que `claude auth login` (ou dashboard\\Connecter-Claude.cmd) n'a pas été relancé. La reprise est automatique ensuite, en moins d'une minute.",
  auth_refused: "Une analyse a été refusée faute d'authentification : la session du CLI est tombée. Relancer `claude auth login` (ou dashboard\\Connecter-Claude.cmd) ; la reprise est automatique ensuite.",
  not_installed: "`claude` est introuvable depuis le pilotage (PATH) ou trop ancien pour `claude auth status`. Installer ou mettre à jour Claude Code, puis relancer le pilotage.",
  probe: "La sonde `claude auth status` ne répond plus (%N essais de suite, dernier : %E). Le CLI est peut-être bloqué ou la machine saturée — vérifier le disque (un disque plein a déjà fait planter le pilotage) et les processus `claude` orphelins. Aucune action de reconnexion n'est requise si le CLI répond de nouveau.",
};
function messageChute(apres) {
  const r = RAISONS[apres.reason] || RAISONS.logged_out;
  return r.replace("%N", String(apres.probeFailures || 0)).replace("%E", apres.lastProbeError || "inconnu");
}

/**
 * Signale une BASCULE de disponibilité dans le flux d'alertes :
 *   connecté → déconnecté : `warn`, avec la raison (sans elle, la panne est
 *     silencieuse par nature : plus d'analyses = plus de diagnostics = calme) ;
 *   déconnecté → connecté : `info`, sinon on ne sait jamais si la reconnexion
 *     a été vue. Pas d'alerte à la toute première détection (démarrage).
 * Niveau `warn` volontairement : la sentinelle n'analyse que `critical,high`,
 * donc l'alerte ne peut pas déclencher une analyse… qui échouerait faute
 * d'authentification.
 *
 * L'import est PARESSEUX : `claudecli.js` est la frontière de sécurité de la
 * sandbox, on ne lui attache pas la moitié du serveur (et son test l'importe
 * seul). Retourne l'alerte émise, ou null.
 */
async function signaler(avant, apres, notify = null) {
  let alerte = null;
  if (avant.available === true && apres.available === false) {
    alerte = { level: "warn", title: "Claude Code déconnecté", message: messageChute(apres) };
  } else if (avant.checked && avant.available === false && apres.available === true) {
    alerte = { level: "info", title: "Claude Code reconnecté", message: `La session du CLI répond de nouveau${apres.version ? ` (${apres.version})` : ""} : diagnostics et correctifs automatiques repris.` };
  }
  if (!alerte) return null;
  try {
    const raise = notify || (await import("./alerts.js")).raiseManual;
    raise(alerte);
  } catch {}
  return alerte;
}

/**
 * Rabat l'état sur « non connecté » quand une analyse a échoué faute d'auth.
 * Ne touche pas `installed` : le binaire est toujours là, c'est la session qui
 * est tombée. Retourne le nouvel état, pour être VERROUILLÉ par un test.
 * La bascule est signalée (une seule fois : un second appel, déjà déconnecté,
 * ne produit rien) ; `notify` est injectable pour les tests.
 */
export function noteAuthFailure({ notify = null } = {}) {
  const avant = { ..._state };
  poser({ ..._state, checked: true, loggedIn: false, available: false, reason: "auth_refused" });
  signaler(avant, { ..._state }, notify).catch(() => {});
  return { ..._state };
}

/**
 * Un tour de surveillance : re-détecte, et SIGNALE toute bascule (chute ou
 * retour). `detect` et `notify` sont injectables : sonder le vrai
 * `claude auth status` rendrait le verrou dépendant de la machine.
 */
export async function claudeCliWatchTick({ notify = null, detect = detectClaudeCli } = {}) {
  const avant = { ..._state };
  await Promise.resolve().then(detect).catch(() => {});
  const apres = { ..._state };
  await signaler(avant, apres, notify);
  return { avant: avant.loggedIn, apres: apres.loggedIn, changed: avant.loggedIn !== apres.loggedIn, reason: apres.reason };
}

/**
 * Démarre la re-détection périodique, à cadence adaptative (cf. nextWatchDelay).
 * Idempotent. Retourne le minuteur courant.
 */
export function startClaudeCliWatch(everyMs = WATCH_MS, retryMs = RETRY_MS) {
  if (_watching) return _watchTimer;
  _watching = true;
  const planifier = () => {
    if (!_watching) return;
    _watchTimer = setTimeout(async () => {
      try { await claudeCliWatchTick(); } catch {}
      planifier();
    }, nextWatchDelay(_state, everyMs, retryMs));
    if (typeof _watchTimer.unref === "function") _watchTimer.unref();
  };
  planifier();
  return _watchTimer;
}

/** Force l'état — RÉSERVÉ AUX TESTS : sans lui, impossible de poser la
 *  prémisse « connecté » avant de mesurer la chute. */
export function _setStateForTests(next) { _state = { ..._state, ...next }; return { ..._state }; }

/** Arrête la surveillance (tests, arrêt propre). */
export function stopClaudeCliWatch() {
  _watching = false;
  if (_watchTimer) { clearTimeout(_watchTimer); _watchTimer = null; }
}


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
      tuerArbre(p);
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
        // L'écran ne doit pas continuer d'annoncer « connecté » après un refus.
        if (authNeeded) noteAuthFailure();
        return finish({ error: msg || "Erreur Claude Code.", authNeeded });
      }
      if (j && typeof j.result === "string") return finish({ analysis: j.result });
      if (out.trim()) return finish({ analysis: out.trim() });
      return finish({ error: err.trim() || "Réponse vide de Claude Code." });
    });
    try { p.stdin.write(prompt); p.stdin.end(); } catch (e) { clearTimeout(timer); finish({ error: e.message }); }
  });
}
