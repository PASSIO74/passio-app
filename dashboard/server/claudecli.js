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
import fs from "node:fs";
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
// Marqueur pour Connecter-Claude.cmd : le dossier que CE serveur lit vraiment
// (chaîne vide = ~/.claude partagé). Sans lui, le script promettait « le
// pilotage le voit en moins d'une minute » alors qu'un serveur démarré avant le
// réglage regardait ailleurs. Écriture protégée : un disque plein ne doit pas
// empêcher le module de charger.
try {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(path.join(config.dataDir, "claude-config-dir.txt"), CLAUDE_CONFIG_DIR);
} catch {}

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
//            "quota"         → limite d'usage de l'abonnement atteinte : session
//                              valide, aucune analyse jusqu'à `quotaUntil`
//
// `since` date le dernier CHANGEMENT de disponibilité : l'écran peut dire
// « déconnecté depuis 3 h » au lieu d'un état sans histoire.
// ═══════════════════════════════════════════════════════════════════════════
let _state = {
  checked: false, installed: false, loggedIn: false, available: false, version: "",
  reason: null, probeFailures: 0, lastProbeAt: null, lastProbeError: null, since: null, quotaUntil: null,
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
  if (!p) return;
  // ⚠️ Sous Windows, `taskkill /T /F` SEUL (revue contradictoire du 2026-09-13,
  // mesuré par essai réel) : il abat la racine ET ses descendants, mais il
  // énumère l'arbre ~300 ms après son lancement — si `p.kill()` a déjà tué
  // cmd.exe entre-temps (< 10 ms), l'arbre n'est plus rattaché et le `claude`
  // petit-enfant survit. Tant « kill puis taskkill » (version d'origine) que
  // « taskkill puis kill dans la foulée » laissent l'orphelin en vie.
  // `p.kill()` n'est plus qu'un repli : si taskkill ne peut pas être lancé, ou
  // s'il rend un code non nul (processus déjà parti, arbre introuvable).
  if (process.platform === "win32" && p.pid) {
    let tk = null;
    try { tk = spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {}
    if (!tk) { try { p.kill(); } catch {} return; }
    tk.on("error", () => { try { p.kill(); } catch {} });
    tk.on("close", (code) => { if (code !== 0) { try { p.kill(); } catch {} } });
    return;
  }
  try { p.kill(); } catch {}
}

/**
 * Nombre lu dans l'environnement : vide/absent → défaut ; non numérique → défaut
 * (avec une trace : `setTimeout(NaN)` déclenche tout de suite, une cadence NaN
 * faisait tourner la surveillance en boucle serrée ou rendait la sonde muette) ;
 * sinon borné par `min` dans l'unité de la variable. Exporté pour être verrouillé.
 */
export function lireNombre(nom, defaut, min, env = process.env) {
  const brut = env[nom];
  if (brut === undefined || String(brut).trim() === "") return defaut;
  const n = Number(brut);
  if (!Number.isFinite(n)) { try { console.error(`[claudecli] ${nom}="${String(brut).slice(0, 40)}" n'est pas un nombre : défaut ${defaut}`); } catch {} return defaut; }
  return Math.max(min, n);
}

// ── Sonde ──────────────────────────────────────────────────────────────────
// 45 s et non 12 : mesuré, `claude auth status` répond en ~0,5 s sur un poste
// calme, mais un poste saturé (shards e2e, build, disque plein) peut mettre
// bien plus — et un délai dépassé n'est PAS une déconnexion, c'est une sonde
// qui n'a rien vu. Les deux cas sont distingués plus bas.
const PROBE_TIMEOUT_MS = lireNombre("DASH_CLAUDE_CLI_PROBE_TIMEOUT_S", 45, 10) * 1000;
// Sondes NON CONCLUANTES consécutives avant de se déclarer indisponible.
const PROBE_FAILURES_MAX = lireNombre("DASH_CLAUDE_CLI_PROBE_FAILURES", 3, 1);

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
  // Limite d'usage : elle PRIME sur la session tant qu'elle court (la session
  // est valide, mais aucune analyse ne passera), et s'efface seule à l'heure de
  // remise à zéro — la disponibilité redevient alors celle de la session.
  if (next.quotaUntil && next.quotaUntil <= now) {
    next.quotaUntil = null;
    if (next.reason === "quota") next.reason = null;
    next.available = next.loggedIn === true;
  }
  if (next.quotaUntil && next.quotaUntil > now) { next.available = false; next.reason = "quota"; }
  // Strictement croissant : deux bascules dans la même milliseconde (tests,
  // rafale) doivent rester distinguables — `since` sert d'identité de bascule
  // pour ne signaler chacune qu'une fois (cf. signaler).
  const bascule = next.available !== _state.available;
  if (bascule || _state.since === null) next.since = Math.max(now, (_state.since || 0) + 1);
  else next.since = _state.since;
  _state = next;
  // L'écran suit la bascule EN DIRECT (revue du 2026-09-13) : la SPA figeait
  // « Réparation automatique active » avec l'état lu au login (12 h), donc
  // mentait dans les deux sens après une chute ou un retour du CLI. Import
  // paresseux : ce fichier est la frontière de sécurité, il n'embarque pas le
  // serveur ; et une diffusion qui échoue ne doit jamais casser une sonde.
  if (bascule) {
    try {
      if (_broadcast) _broadcast("claude", claudeCliState());
      else import("./sse.js").then((m) => m.broadcast("claude", claudeCliState())).catch(() => {});
    } catch {}
  }
  return _state;
}
let _broadcast = null;
/** RÉSERVÉ AUX TESTS : remplace la diffusion SSE (sinon l'import de sse.js tire l'observation et ses fichiers). */
export function _setBroadcastForTests(fn) { _broadcast = fn; }

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
    const code = (st && st.reason) || "spawn";
    const detail = st && st.err ? String(st.err).replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const next = { ..._state, checked: true, probeFailures: failures, lastProbeAt: now, lastProbeError: detail ? `${code}: ${detail}` : code };
    if (failures >= PROBE_FAILURES_MAX && _state.available) {
      next.loggedIn = false; next.available = false; next.reason = "probe";
    }
    // Jamais de réponse conclusive jusqu'ici (démarrage sur un poste saturé) :
    // l'écran dirait « ni CLI ni clé API » — faux, on ne SAIT pas. La raison
    // « probe » le dit sans rien rabattre (revue contradictoire du 2026-09-13).
    if (!_state.installed && !_state.loggedIn && !_state.reason) next.reason = "probe";
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
const WATCH_MS = lireNombre("DASH_CLAUDE_CLI_WATCH_MIN", 10, 1) * 60_000;
const RETRY_MS = lireNombre("DASH_CLAUDE_CLI_RETRY_MIN", 1, 0.5) * 60_000;
let _watchTimer = null;
let _watchGeneration = 0;
let _watching = false;

/** Délai avant la prochaine sonde : long si connecté, court si on attend la reconnexion. Pur, verrouillé par test. */
export function nextWatchDelay(state = _state, everyMs = WATCH_MS, retryMs = RETRY_MS) {
  return state.available ? everyMs : Math.min(everyMs, retryMs);
}

const RAISONS = {
  logged_out: "La session du CLI a expiré : plus aucun diagnostic ni correctif automatique tant que `claude auth login` (ou dashboard\\Connecter-Claude.cmd) n'a pas été relancé. La reprise est automatique ensuite (%R).",
  auth_refused: "Une analyse a été refusée faute d'authentification : la session du CLI est tombée. Relancer `claude auth login` (ou dashboard\\Connecter-Claude.cmd) ; la reprise est automatique ensuite.",
  not_installed: "`claude` est introuvable depuis le pilotage (PATH) ou trop ancien pour `claude auth status`. Installer ou mettre à jour Claude Code, puis relancer le pilotage.",
  probe: "La sonde `claude auth status` ne répond plus (%N essais de suite, dernier : %E). Le CLI est peut-être bloqué ou la machine saturée — vérifier le disque (un disque plein a déjà fait planter le pilotage) et les processus `claude` orphelins. Aucune action de reconnexion n'est requise si le CLI répond de nouveau.",
  quota: "Limite d'usage de l'abonnement Claude atteinte (%M). Plus aucune analyse jusqu'à %U : l'état se rétablit seul à cette heure-là (%R). Rien à reconnecter — la session est valide.",
};
function messageChute(apres) {
  const r = RAISONS[apres.reason] || RAISONS.logged_out;
  return r.replace("%N", String(apres.probeFailures || 0)).replace("%E", apres.lastProbeError || "inconnu")
    .replace("%R", `sondée toutes les ${Math.round(RETRY_MS / 60_000) || 1} min tant qu'elle manque`)
    .replace("%M", String(apres.lastAnalysisError || "").slice(0, 160) || "message du CLI non disponible")
    .replace("%U", apres.quotaUntil ? new Date(apres.quotaUntil).toLocaleString("fr-FR") : "l'heure de remise à zéro");
}

/**
 * Le message d'erreur d'une analyse est-il une LIMITE D'USAGE (abonnement ou
 * débit) ? Retourne { until } — l'heure de remise à zéro annoncée par le CLI
 * (« resets Aug 28, 3am (Europe/Paris) ») si elle se lit, sinon 60 min pour une
 * limite d'abonnement, 15 min pour une limite de débit — ou null. Pur, exporté
 * pour être VERROUILLÉ. 529 (surcharge serveur, transitoire) n'en fait PAS partie.
 */
export function looksLikeQuotaError(msg, status = null, now = Date.now()) {
  const s = String(msg || "");
  const abonnement = Number(status) === 429 || /hit your (?:weekly |daily |monthly |session |5-hour )?(?:usage )?limit|usage limit|quota/i.test(s);
  const debit = /rate limit/i.test(s);
  if (!abonnement && !debit) return null;
  let until = null;
  const m = s.match(/resets?\s+(?:at\s+)?([A-Za-z]{3,9}\.?\s+\d{1,2},?\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (m) {
    const ref = new Date(now);
    let d = m[1] ? new Date(`${m[1].replace(/\.|,/g, "").trim()} ${ref.getFullYear()}`) : new Date(ref);
    if (!Number.isNaN(d.getTime())) {
      let h = Number(m[2]); const min = Number(m[3] || 0); const ap = (m[4] || "").toLowerCase();
      if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
      d.setHours(h, min, 0, 0);
      if (d.getTime() <= now) d = new Date(d.getTime() + (m[1] ? 365 : 1) * 86_400_000);
      until = d.getTime();
    }
  }
  if (!until) until = now + (abonnement ? 60 : 15) * 60_000;
  return { until };
}

/**
 * Pose la limite d'usage : indisponible jusqu'à `until`, raison « quota »,
 * alerte une fois ; `poser()` l'efface seul à l'échéance (la sonde tourne
 * chaque minute tant que l'état n'est pas disponible).
 */
export function noteQuota(until, message = "", { notify = null } = {}) {
  const avant = { ..._state };
  poser({ ..._state, checked: true, quotaUntil: until, lastAnalysisError: String(message || "").slice(0, 300) });
  signaler(avant, { ..._state }, notify).catch(() => {});
  return { ..._state };
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
let _derniereBasculeSignalee = null;
async function signaler(avant, apres, notify = null) {
  let alerte = null;
  if (avant.available === true && apres.available === false) {
    alerte = { level: "warn", title: "Claude Code déconnecté", message: messageChute(apres) };
  } else if (avant.checked && avant.available === false && apres.available === true) {
    alerte = avant.reason === "quota"
      ? { level: "info", title: "Claude Code : limite d'usage levée", message: "L'heure de remise à zéro est passée : diagnostics et correctifs automatiques repris." }
      : { level: "info", title: "Claude Code reconnecté", message: `La session du CLI répond de nouveau${apres.version ? ` (${apres.version})` : ""} : diagnostics et correctifs automatiques repris.` };
  }
  if (!alerte) return null;
  // Une bascule = une alerte, même si deux chemins la voient (revue du
  // 2026-09-13) : un tour de surveillance prend son instantané `avant`, sa sonde
  // dure 0,5 à 45 s, et pendant ce temps `confirmAuthFailure()` peut rabattre
  // et signaler — le tour, à son retour, re-signalerait la même chute.
  // `since` ne change qu'à une bascule de disponibilité : il l'identifie.
  if (apres.since !== null && apres.since === _derniereBasculeSignalee) return null;
  _derniereBasculeSignalee = apres.since;
  try {
    const raise = notify || (await import("./alerts.js")).raiseManual;
    raise(alerte);
  } catch (e) {
    // Une alerte perdue (disque plein, store indisponible) laisse au moins une
    // trace dans le journal du superviseur : sinon la panne est deux fois muette.
    try { console.error(`[claudecli] alerte non enregistrée (${alerte.title}) : ${e && e.message ? e.message : e}`); } catch {}
  }
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
 * Le message d'erreur d'une analyse ressemble-t-il à un refus d'authentification ?
 * Pur, exporté pour être VERROUILLÉ. L'ancienne expression contenait `connect` :
 * « Could not connect to server », « ECONNREFUSED » ou un « fetch failed » de
 * réseau passaient pour une session tombée, et l'écran basculait sur « à
 * reconnecter » alors qu'il n'y avait rien à reconnecter. Les mots réseau
 * excluent explicitement.
 */
export function looksLikeAuthError(msg) {
  const s = String(msg || "");
  if (/ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|could not connect|failed to connect|unable to connect|connection error|internet connection|fetch failed|network|socket|DNS|ssl|certificate|proxy/i.test(s)) return false;
  return /authenticat|unauthori|oauth|\b401\b|expired|not logged|log ?in\b|invalid[ _-]?(?:token|grant|api key)|credential/i.test(s);
}

/**
 * Un refus d'authentification pendant une analyse n'est cru qu'après RE-SONDE
 * (2026-09-13). Avant : `noteAuthFailure()` rabattait l'état sur le seul
 * message d'erreur — une erreur de réseau ou de proxy qui « ressemblait » à un
 * refus déconnectait le pilotage à l'écran, et la sentinelle sautait toutes les
 * alertes (`skipped.unavailable`) jusqu'au tour de surveillance suivant.
 *   • la sonde dit « connecté » (ou reste muette) → l'état connu est GARDÉ, on
 *     note seulement l'erreur d'analyse ;
 *   • la sonde confirme la déconnexion → raison `auth_refused`, alerte une fois.
 * `detect` et `notify` sont injectables pour les tests.
 */
export async function confirmAuthFailure({ detect = detectClaudeCli, notify = null, error = "" } = {}) {
  const avant = { ..._state };
  let loggedIn = avant.loggedIn;
  try { loggedIn = await detect(); } catch {}
  if (loggedIn) {
    _state = { ..._state, lastAnalysisError: error ? String(error).slice(0, 300) : "refus d'authentification apparent, sonde connectée" };
    return { flipped: false, kept: true };
  }
  poser({ ..._state, checked: true, loggedIn: false, available: false, reason: "auth_refused" });
  await signaler(avant, { ..._state }, notify);
  return { flipped: avant.available === true, kept: false };
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
  // Compteur de génération : un `stop()` puis `start()` pendant qu'un tour est
  // EN VOL (sonde de 0,5 à 45 s) créait deux chaînes de minuteurs, et `stop()`
  // n'en arrêtait qu'une — deux sondes par cadence, pour toujours. Le tour en
  // vol d'une génération périmée ne se replanifie pas.
  const generation = ++_watchGeneration;
  const planifier = () => {
    if (!_watching || generation !== _watchGeneration) return;
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
  _watchGeneration++; // invalide aussi un tour en vol : il ne se replanifiera pas
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
        tuerArbre(p);
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
        // Limite d'usage de l'abonnement (429, « You've hit your weekly limit ·
        // resets Aug 28, 3am ») : ce n'est ni une déconnexion ni une panne, et
        // `claude auth status` continue de dire « connecté » — jusqu'au
        // 2026-09-13 l'état restait vert pendant des jours, chaque alerte était
        // consommée en erreur, sans raison ni alerte. Modélisée à part.
        const quota = looksLikeQuotaError(msg, j.api_error_status);
        if (quota) { noteQuota(quota.until, msg); return finish({ error: msg || "Limite d'usage atteinte.", quota: true, until: quota.until }); }
        const authNeeded = looksLikeAuthError(msg);
        // L'écran ne doit pas continuer d'annoncer « connecté » après un refus —
        // mais on RE-SONDE avant de rabattre (cf. confirmAuthFailure).
        if (authNeeded) confirmAuthFailure({ error: msg }).catch(() => {});
        return finish({ error: msg || "Erreur Claude Code.", authNeeded });
      }
      if (j && typeof j.result === "string") return finish({ analysis: j.result });
      if (out.trim()) return finish({ analysis: out.trim() });
      return finish({ error: err.trim() || "Réponse vide de Claude Code." });
    });
    try { p.stdin.write(prompt); p.stdin.end(); } catch (e) { clearTimeout(timer); finish({ error: e.message }); }
  });
}
