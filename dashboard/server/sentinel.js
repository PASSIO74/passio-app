// ═══════════════════════════════════════════════════════════════════════════
// SENTINELLE — l'agent de débogage PERMANENT du centre de pilotage.
//
// Jusqu'ici, diagnostiquer un problème demandait un geste humain : ouvrir le
// dashboard, repérer l'alerte, cliquer « Réparer avec Claude ». Un problème qui
// survient la nuit, ou pendant qu'on regarde ailleurs, restait un simple point
// rouge sans explication. La sentinelle supprime ce geste : elle écoute les
// alertes en continu, décide seule lesquelles méritent une analyse, construit le
// contexte, lance Claude Code, et publie le diagnostic dans le flux temps réel.
//
// ─── Ce qu'elle NE fait PAS, délibérément ─────────────────────────────────────
// Elle ne corrige RIEN toute seule : aucun patch appliqué, aucune branche créée,
// aucun push. Un correctif automatique sur une prod qu'on ne regarde pas est une
// panne qui s'écrit elle-même : la sentinelle produit la CAUSE et le patch
// PROPOSÉ, l'application reste un geste humain (voir docs/SECURITE.md).
//
// ─── Quatre garde-fous qui comptent ───────────────────────────────────────────
// 1. SANDBOX (le vrai sujet, cf. `claudecli.js`). Le processus Claude lancé sans
//    surveillance ne dispose QUE d'une liste blanche d'outils : rien du tout en
//    analyse rapide, Read/Grep/Glob en analyse approfondie. Personnalisations et
//    serveurs MCP neutralisés. Ce point prime sur tous les autres : sans lui, le
//    reste ne protège rien.
// 2. INJECTION. Un message d'erreur vient du navigateur d'un utilisateur : c'est
//    de la donnée hostile. Tout texte observé est neutralisé (clôtures de bloc
//    cassées, longueur bornée) et encadré d'une consigne explicite. C'est de
//    l'HYGIÈNE de prompt, PAS une frontière — la frontière, c'est la sandbox.
//    Les alertes à texte libre ne déclenchent jamais le mode approfondi.
// 3. BUDGET. Une panne produit des rafales d'alertes ; sans plafond, la
//    sentinelle brûlerait le quota Claude en quelques minutes. Déduplication par
//    cause ET révision du dépôt (cooldown long, persisté), file bornée, une
//    analyse à la fois, plafond horaire, sous-plafond pour l'approfondi.
// 4. DÉMARRAGE. Au boot, on n'analyse pas l'arriéré : seules les alertes émises
//    APRÈS le démarrage comptent (sinon chaque redémarrage relance 500 analyses).
//
// ─── Son angle mort, à ne jamais oublier ──────────────────────────────────────
// Elle ne voit QUE ce qui déclenche une alerte. Un bouton qui n'émet plus rien,
// un résultat faux en HTTP 200, une télémétrie interrompue : zéro alerte, donc
// zéro diagnostic — et ça ressemble exactement au calme. « Aucun diagnostic » ne
// veut jamais dire « tout va bien » ; la santé se mesure ailleurs (fraîcheur de
// l'ingestion, taux de réussite bout en bout).
// ═══════════════════════════════════════════════════════════════════════════
import { config } from "./config.js";
import { revisionCourte } from "./git-revision.js";
import { JsonDb } from "./jsondb.js";
import { broadcast } from "./sse.js";
import { onAlert, raiseInternal } from "./alerts.js";
import { store } from "./store.js";
import { trace as traceOne } from "./traces.js";
import { suspectsFor, suspectsPromptBlock } from "./correlate.js";
import { buildContext, buildPrompt, buildTracePrompt, liveAnalyze } from "./claude.js";
import { liveFixAvailable } from "./claudecli.js";
import { audit } from "./audit.js";
import { sanitizeObserved, dataBlock } from "./donnees-observees.js";
import { attemptRepair, repairState } from "./repair.js";

const db = new JsonDb("sentinel", { enabled: null, seen: {}, diagnoses: [], skippedLog: [] });

// ─── Réglages (surchargeables par .env) ──────────────────────────────────────
const env = process.env;
const SETTINGS = {
  // Niveaux qui déclenchent une analyse. `info` jamais : ce n'est pas un problème.
  levels: (env.DASH_SENTINEL_LEVELS || "critical,high").split(",").map((s) => s.trim()).filter(Boolean),
  // Une même cause (clé d'alerte) n'est ré-analysée qu'après ce délai.
  cooldownMs: Number(env.DASH_SENTINEL_COOLDOWN_MIN || 360) * 60_000,   // 6 h
  maxPerHour: Number(env.DASH_SENTINEL_MAX_PER_HOUR || 8),
  // Sous-plafond des analyses APPROFONDIES : ce sont elles qui durent (jusqu à
  // 7 min) et qui mangent le quota de l abonnement partagé avec le travail
  // interactif. Au-dela, la sentinelle degrade en analyse rapide.
  maxDeepPerHour: Number(env.DASH_SENTINEL_MAX_DEEP_PER_HOUR || 3),
  minGapMs: Number(env.DASH_SENTINEL_MIN_GAP_S || 90) * 1000,
  queueMax: Number(env.DASH_SENTINEL_QUEUE_MAX || 20),
  keep: Number(env.DASH_SENTINEL_KEEP || 100),
  // ─── Mode approfondi : DÉSACTIVÉ par défaut, et ce n'est pas de la prudence
  // de principe. Mesuré le 2026-08-16 : avec `--tools Read,Grep,Glob` et
  // cwd = dépôt, un chemin ABSOLU hors dépôt est bien refusé, mais un chemin
  // RELATIF remontant (`../../AppData/…`) est lu sans difficulté. Le répertoire
  // de travail n'est donc PAS une frontière de système de fichiers, et les
  // règles de permission par `--settings` n'ont pas permis de la rétablir (en
  // `-p`, un mode non permissif refuse tout, y compris le dépôt).
  // Conséquence : un texte hostile arrivant dans le prompt pourrait faire lire
  // un fichier quelconque du poste et en recopier le contenu dans le diagnostic.
  // La sentinelle tournant SANS personne devant l'écran, elle ne prend pas ce
  // risque : ses analyses automatiques n'ont aucun accès disque. Le contexte
  // (extrait de source lu par le SERVEUR, lui confiné, stack, commits,
  // chronologie) est déjà dans le prompt. `DASH_SENTINEL_DEEP=true` pour
  // l'activer en connaissance de cause ; le bouton « Analyse approfondie »,
  // lui, reste inchangé : c'est un humain qui le déclenche et qui lit le résultat.
  deep: env.DASH_SENTINEL_DEEP === "true",
  // ─── Bruit : des clés d'alerte qui ne désignent JAMAIS un défaut du code.
  // Mesuré sur les 10 diagnostics de sentinel.json (2026-09-18) : 4 analyses
  // portaient sur « Échec d'envoi de la télémétrie (appareil peut-être hors
  // ligne) » — le réseau d'un testeur, rien à réparer — et chacune a coûté un
  // cran des 8/h, 90 s d'occupation et du quota d'abonnement. Une alerte de
  // pic mécanique (`spike`) ou de lenteur d'API dit la même chose : un fait
  // d'exploitation, pas une cause dans js/. Ces alertes restent visibles dans
  // le flux ; elles cessent seulement d'appeler Claude. Surchargeable par
  // DASH_SENTINEL_SKIP_KEYS (préfixes, virgules). Le préfixe `sentinelle:`
  // protège contre une boucle : une alerte émise PAR la sentinelle ne doit
  // jamais la réveiller, quel que soit DASH_SENTINEL_LEVELS.
  skipKeys: (env.DASH_SENTINEL_SKIP_KEYS || "conn:,spike,apislow:,linkopen:,linkerr:,sentinelle:")
    .split(",").map((s) => s.trim()).filter(Boolean),
};

// Rappel ajouté au prompt du SECOND essai (voir pump()). Le second essai est
// un processus CLI neuf qui n'a jamais vu la première réponse : le rappel parle
// donc d'« une première réponse à ce dossier », pas de « ta réponse ». Et la
// consigne d'outils suit le mode — en approfondi Read/Grep/Glob restent permis
// (le préambule les autorise), en rapide il n'y en a aucun.
function rappelVerdict(deep) {
  return [
    "Une première réponse à ce dossier s'est arrêtée AVANT la section « ## Verdict » (ou ne portait pas",
    "la ligne finale VERDICT:). Réponds en respectant strictement le format imposé, en commençant",
    "par « ## Verdict » et en terminant par la ligne « VERDICT: … », seule sur sa ligne.",
    deep
      ? "Lecture seule (Read, Grep, Glob) ; ne lance aucune commande, ne modifie rien."
      : "Sans outil, sans lecture de fichier : uniquement à partir des données fournies.",
  ].join("\n");
}

// ─── État vivant (mémoire) ───────────────────────────────────────────────────
const rt = {
  started: false,
  startedAt: 0,
  queue: [],
  running: null,          // { id, title, startedAt }
  repairing: null,        // réparation en cours (diagnostic -> patch -> tests)
  lastRunAt: 0,
  runsWindow: [],         // horodatages des analyses de la dernière heure
  deepWindow: [],         // idem, limité aux analyses APPROFONDIES (quota)
  skipped: { cooldown: 0, budget: 0, deepBudget: 0, level: 0, queue: 0, unavailable: 0, noise: 0, sansVerdict: 0 },
  total: 0,
  reprise: null,          // minuteur posé quand le budget horaire est épuisé (la file doit repartir seule)
};

/** Analyseur injectable — les tests remplacent Claude par une fonction locale. */
let analyzer = (prompt, opts) => liveAnalyze(prompt, opts);
export function _setAnalyzer(fn) { analyzer = fn; }
/** Disponibilité d'une source d'analyse — injectable pour les tests. */
let available = () => liveFixAvailable();
export function _setAvailability(fn) { available = fn; }
/** Réparateur injectable — les tests vérifient le CÂBLAGE sans écrire dans git. */
let repairer = (record, an) => attemptRepair(record, an);
export function _setRepairer(fn) { repairer = fn; }

export function isEnabled() {
  const v = db.get().enabled;
  // Défaut : ACTIVE. C'est la demande — le centre de pilotage débogue seul.
  return v === null || v === undefined ? env.DASH_SENTINEL !== "off" : Boolean(v);
}

export function setEnabled(on, actor = null) {
  db.update((d) => { d.enabled = Boolean(on); });
  audit("sentinel_toggle", { enabled: Boolean(on) }, actor);
  broadcast("sentinel_state", sentinelState());
  return isEnabled();
}

// ════════════════════════════════════════════════════════════════════════════
//  NEUTRALISATION DES DONNÉES OBSERVÉES
// ════════════════════════════════════════════════════════════════════════════
// Les deux gestes vivent dans `donnees-observees.js` : `claude.js` en a besoin
// lui aussi, et comme ce module-ci l'importe déjà, les y laisser aurait créé un
// cycle d'imports. `sanitizeObserved` reste ré-exportée ici pour les appelants
// historiques (dont la suite de tests de la sentinelle).
export { sanitizeObserved };

// ═══════════════════════════════════════════════════════════════════════════
//  TRIAGE — quelles alertes méritent une analyse automatique
// ═══════════════════════════════════════════════════════════════════════════
// Révision du dépôt, lue à même `.git` (aucun processus lancé), cache 60 s.
// Elle entre dans la clé de cooldown : sans elle, « même cause pendant 6 h »
// masquerait une régression DIFFÉRENTE apparue après un commit — le moment
// précis où l'on a le plus besoin d'un diagnostic frais.
let _rev = { v: "", at: 0 };
export function repoRevision(now = Date.now()) {
  if (now - _rev.at < 60_000) return _rev.v;
  _rev.at = now;
  // `.git` peut être un DOSSIER (dépôt principal) ou un FICHIER `gitdir:`
  // (worktree) : git-revision.js sait lire les deux. "" = pas un dépôt, ou
  // illisible : on retombe sur la clé nue plutôt que d'inventer une révision.
  _rev.v = revisionCourte(config.repoPath, 8);
  return _rev.v;
}

/** Clé de déduplication : la cause ET la révision du code. */
export function cooldownKey(alert) {
  const base = alert.key || alert.title;
  const rev = repoRevision();
  return rev ? `${base}@${rev}` : base;
}

/**
 * Décide du sort d'une alerte.
 * @returns {{take:true, kind:string, deep:boolean} | {take:false, reason:string}}
 */
export function triage(alert, now = Date.now(), seen = db.get().seen) {
  if (!alert || alert.manual) return { take: false, reason: "manuelle" };
  if (!SETTINGS.levels.includes(alert.level)) return { take: false, reason: "level" };
  // Bruit (cf. SETTINGS.skipKeys) : par préfixe de clé, ou par la marque
  // `meta.kind: "reseau"` que l'émetteur peut poser sur une alerte qui parle
  // de la connexion d'un appareil et non d'un défaut du produit.
  const cleBrute = String(alert.key || alert.title || "");
  if (SETTINGS.skipKeys.some((p) => cleBrute.startsWith(p))) return { take: false, reason: "bruit" };
  if (alert.meta && alert.meta.kind === "reseau") return { take: false, reason: "bruit" };

  const key = cooldownKey(alert);
  const last = seen[key];
  if (last && now - last < SETTINGS.cooldownMs) return { take: false, reason: "cooldown" };

  // Le mode approfondi (Claude lit le dépôt) n'est ouvert qu'aux alertes dont le
  // contexte est STRUCTURÉ côté serveur : une trace (verdict calculé) ou un bug
  // (empreinte normalisée + stack). Les alertes bâties sur du texte libre venu
  // du client restent en analyse superficielle, sans accès aux fichiers.
  if (alert.meta && alert.meta.cid) return { take: true, kind: "trace", deep: SETTINGS.deep };
  if (alert.meta && alert.meta.bug) return { take: true, kind: "bug", deep: SETTINGS.deep };
  return { take: true, kind: "generic", deep: false };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTRUCTION DU PROMPT
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE VERDICT VIENT EN PREMIER, ET UNE LIGNE MACHINE LE RÉPÈTE EN DERNIER.
// Jusqu'au 2026-09-18 le format demandait « ## En clair » d'abord et le verdict
// en deuxième : une sortie coupée tôt perdait précisément la seule section que
// la machine lit. Et en mode RAPIDE (aucun outil, dossier temporaire), rien ne
// disait au modèle qu'il n'avait pas d'outil : il tentait un Glob ou un
// PowerShell, le tour s'arrêtait, et le fragment était enregistré comme un
// diagnostic (4 cas sur 10 mesurés). Le préambule dépend donc du mode.
function preambule(deep) {
  return [
    "Tu es la sentinelle de débogage du projet PASSIO (PWA vanilla JS + Supabase).",
    "Le centre de pilotage a détecté un problème EN CONDITIONS RÉELLES et t'appelle",
    "automatiquement, sans intervention humaine. Personne ne lit par-dessus ton épaule :",
    "sois exact plutôt qu'exhaustif, et dis clairement quand tu n'es pas sûr.",
    "",
    "Contraintes ABSOLUES :",
    deep
      ? "• Tu es en LECTURE SEULE : tu peux LIRE le dépôt (Read, Grep, Glob) et rien d'autre, ne modifie aucun fichier,"
      : "• Tu es en LECTURE SEULE et tu n'as AUCUN outil, aucun accès au dépôt ni au disque : n'essaie jamais de lire,",
    deep
      ? "  ne lance aucune commande, ne crée aucune branche. Tu proposes un correctif, tu ne l'appliques pas."
      : "  lister ou chercher un fichier ; réponds UNIQUEMENT avec les données fournies ci-dessous,",
    deep ? "" : "  et ne mentionne jamais tes outils ni leur absence. Tu proposes un correctif, tu ne l'appliques pas.",
    "• Ne divulgue aucune clé, aucun secret, aucune donnée personnelle dans ta réponse.",
    "• Distingue le DÉFAUT du GARDE-FOU : beaucoup de comportements du pilotage sont",
    "  volontaires (filtre env=production, résidus datés de 7 j, contenu de démo,",
    "  capacité `db` sur les routes d'intégrité, mutations refusées en prod).",
    "",
    "Sans reproduction, tu produis une HYPOTHÈSE causale, pas un diagnostic prouvé :",
    "sépare ce que les données montrent de ce que tu en déduis. Méfie-toi du biais",
    "« le dernier commit est le coupable » — les commits récents te sont donnés comme",
    "piste, pas comme conclusion.",
    "",
    "Format de réponse imposé, dans cet ordre exact :",
    "## Verdict — l'un de : DÉFAUT RÉEL / COMPORTEMENT ATTENDU / INSUFFISAMMENT DE DONNÉES.",
    "## En clair — 2-3 phrases sans jargon.",
    "## Preuves — ce que les données établissent, factuellement.",
    "## Hypothèse — ta cause probable, et ce qui manque pour la prouver.",
    "## Fichiers — " + (deep ? "chemins réels lus dans le dépôt." : "UNIQUEMENT des chemins présents dans les données fournies ; sinon écris INCONNU."),
    "## Correctif proposé · ## Vérification · ## Risques",
    "Termine par une DERNIÈRE ligne, seule : VERDICT: DEFAUT_REEL ou VERDICT: COMPORTEMENT_ATTENDU ou VERDICT: INSUFFISANT",
  ].filter((l) => l !== "").join("\n");
}

/** Contexte générique : l'alerte + les erreurs récentes qui l'entourent. */
function genericBlock(alert) {
  const L = [];
  L.push(`- Alerte : ${sanitizeObserved(alert.title, 200)}`);
  L.push(`- Niveau : ${sanitizeObserved(alert.level, 20)}`);
  L.push(`- Message : ${sanitizeObserved(alert.message, 800)}`);
  const m = alert.meta || {};
  for (const k of ["screen", "endpoint", "action", "step", "device", "link"]) {
    if (m[k]) L.push(`- ${k} : ${sanitizeObserved(m[k], 200)}`);
  }
  let recent = [];
  try { recent = store.recent({ type: "error" }, 8) || []; } catch { recent = []; }
  if (recent.length) {
    L.push("");
    L.push("Erreurs récentes du flux (les 8 dernières) :");
    for (const e of recent) {
      L.push(`- [${sanitizeObserved(e.type, 20)}] ${sanitizeObserved(e.message || e.action, 220)}`
        + `${e.screen ? " @" + sanitizeObserved(e.screen, 40) : ""}`);
    }
  }
  return dataBlock("Ce que le pilotage a observé", L.join("\n"));
}

/** Assemble le prompt complet du job. Exporté pour les tests. */
export async function buildJobPrompt(job) {
  const { alert, kind, deep } = job;

  if (kind === "trace") {
    const t = traceOne(alert.meta.cid);
    if (t) {
      let suspects = null;
      try { suspects = await suspectsFor(t.startedAt, t.feature); } catch { suspects = null; }
      return preambule(deep) + "\n\n" + buildTracePrompt(t, suspects ? suspectsPromptBlock(suspects) : "");
    }
    // Trace expirée du store mémoire : on retombe sur le contexte générique
    // plutôt que d'inventer — et on le DIT dans le prompt.
    return preambule(deep) + "\n\n(La trace détaillée a expiré du tampon mémoire ; contexte réduit.)\n\n" + genericBlock(alert);
  }

  if (kind === "bug") {
    const ctx = await buildContext(alert.meta.bug);
    if (ctx) return preambule(deep) + "\n\n" + buildPrompt(ctx, { deep });
    return preambule(deep) + "\n\n(Le bug groupé n'est plus dans le tampon ; contexte réduit.)\n\n" + genericBlock(alert);
  }

  return preambule(deep) + "\n\n" + genericBlock(alert);
}

// ═══════════════════════════════════════════════════════════════════════════
//  FILE D'ATTENTE & EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════
function budgetOk(now = Date.now()) {
  rt.runsWindow = rt.runsWindow.filter((t) => now - t < 3600_000);
  if (rt.runsWindow.length >= SETTINGS.maxPerHour) return false;
  return true;
}

/** Point d'entrée : une alerte vient d'être émise. */
export function consider(alert, now = Date.now()) {
  if (!rt.started || !isEnabled()) return null;
  // L'arriéré d'avant le démarrage n'est pas rejoué.
  if (alert.ts && alert.ts < rt.startedAt) return null;
  if (!available()) { rt.skipped.unavailable++; return null; }

  const verdict = triage(alert, now);
  if (!verdict.take) {
    if (verdict.reason === "cooldown") rt.skipped.cooldown++;
    else if (verdict.reason === "level") rt.skipped.level++;
    else if (verdict.reason === "bruit") rt.skipped.noise++;
    // `level` n'est pas journalisé : chaque warn/info du flux en produirait un.
    if (verdict.reason !== "level") noterSaut(alert, verdict.reason, now);
    return null;
  }
  if (rt.queue.length >= SETTINGS.queueMax) { rt.skipped.queue++; noterSaut(alert, "queue", now); return null; }

  // Le cooldown est posé À L'ENTRÉE (pas à la fin) : pendant une rafale, les 40
  // alertes suivantes de la même cause ne doivent pas s'empiler dans la file.
  const key = cooldownKey(alert);
  db.update((d) => { d.seen[key] = now; });

  // Le mode approfondi lance un Claude qui peut tourner plusieurs minutes et qui
  // consomme le quota de l'abonnement. Au-delà de son propre plafond horaire, on
  // DÉGRADE en analyse rapide au lieu de renoncer : un diagnostic moins fin vaut
  // mieux que pas de diagnostic, et le quota reste disponible pour le travail
  // interactif.
  let deep = verdict.deep;
  if (deep && rt.deepWindow.filter((t) => now - t < 3600_000).length >= SETTINGS.maxDeepPerHour) {
    deep = false;
    rt.skipped.deepBudget++;
  }

  const job = {
    id: "sd_" + now.toString(36) + Math.random().toString(36).slice(2, 6),
    alert, kind: verdict.kind, deep,
    queuedAt: now, key,
  };
  rt.queue.push(job);
  broadcast("sentinel_state", sentinelState());
  pump();
  return job;
}

/**
 * Journal des alertes écartées — persisté et borné (50). Jusqu'ici `skipped`
 * n'était qu'un objet mémoire remis à zéro à chaque relance du superviseur
 * (cinq entre le 13 et le 18/09) : impossible de savoir APRÈS COUP ce que la
 * sentinelle avait laissé passer, ni pourquoi.
 */
function noterSaut(alert, reason, now = Date.now()) {
  const entree = { ts: now, key: String(alert.key || alert.title || "").slice(0, 180), reason, title: String(alert.title || "").slice(0, 120), level: alert.level || null };
  db.update((d) => {
    d.skippedLog = Array.isArray(d.skippedLog) ? d.skippedLog : [];
    d.skippedLog.unshift(entree);
    if (d.skippedLog.length > 50) d.skippedLog.length = 50;
  });
}

/**
 * Budget horaire épuisé : la file ne doit pas dormir jusqu'au prochain consider().
 * Mesuré (revue du 2026-09-18) : pump() rendait sans rien replanifier — les jobs
 * en file attendaient une nouvelle alerte ou la fin d'une analyse, parfois des
 * heures. On se réveille quand le plus vieux cran de la fenêtre sort de l'heure.
 */
function planifierReprise(now) {
  if (rt.reprise) return;
  const plusVieux = rt.runsWindow.length ? Math.min(...rt.runsWindow) : now;
  const delai = Math.max(250, plusVieux + 3600_000 - now + 10);
  rt.reprise = setTimeout(() => { rt.reprise = null; pump(); }, delai);
  rt.reprise.unref?.();
}

let pumping = false;
async function pump() {
  if (pumping || rt.running || !rt.queue.length) return;
  const now = Date.now();
  if (!budgetOk(now)) { rt.skipped.budget++; planifierReprise(now); return; }
  if (now - rt.lastRunAt < SETTINGS.minGapMs) {
    setTimeout(() => pump(), SETTINGS.minGapMs - (now - rt.lastRunAt)).unref?.();
    return;
  }
  pumping = true;
  const job = rt.queue.shift();
  // La source d'analyse est re-vérifiée ICI, pas seulement à l'entrée de la file
  // (revue contradictoire du 2026-09-13) : si la session du CLI tombe pendant
  // qu'une file de 20 alertes attend, chaque job partait quand même, recevait
  // « Aucune source d'analyse disponible » et CONSOMMAIT un cooldown de 6 h et un
  // cran du budget horaire, sans qu'aucun Claude n'ait été appelé. On rend la
  // clé et on laisse l'alerte revenir : elle sera analysée dès la reconnexion.
  if (!available()) {
    rt.skipped.unavailable++;
    db.update((d) => { delete d.seen[job.key]; });
    pumping = false;
    broadcast("sentinel_state", sentinelState());
    return;
  }
  rt.running = { id: job.id, title: job.alert.title, startedAt: now, deep: job.deep };
  rt.lastRunAt = now;
  rt.runsWindow.push(now);
  if (job.deep) rt.deepWindow = rt.deepWindow.filter((t) => now - t < 3600_000).concat(now);
  broadcast("sentinel_state", sentinelState());

  let result;
  let essais = 1;
  try {
    const prompt = await buildJobPrompt(job);
    result = await analyzer(prompt, { deep: job.deep });
    // ─── Une réponse SANS verdict n'est pas un diagnostic ──────────────────
    // Mesuré sur sentinel.json (2026-09-18) : 4 diagnostics sur 10 étaient des
    // fragments (le modèle tentait un outil qu'il n'a pas, le tour s'arrêtait)
    // enregistrés error=null, audit ok:true, cooldown 6 h posé — un succès qui
    // n'en était pas un, et personne pour le voir. Désormais : un second essai
    // avec rappel du format, puis, s'il ne rend toujours rien d'exploitable,
    // un ÉCHEC nommé. Le cooldown est conservé (Claude a bien travaillé : c'est
    // le garde-fou n°3), mais l'échec se voit dans l'état, l'audit et une alerte.
    // Une analyse VIDE ("") sans erreur est traitée comme un fragment : ce n'est
    // pas plus un diagnostic qu'une réponse tronquée (revue du 2026-09-18).
    if (result && !result.error && !extractVerdict(result.analysis)) {
      essais = 2;
      const r2 = await analyzer(prompt + "\n\n" + rappelVerdict(job.deep), { deep: job.deep });
      if (r2 && !r2.error && r2.analysis && extractVerdict(r2.analysis)) result = r2;
      else if (r2 && r2.error) result = { ...result, error: r2.error, via: r2.via || result.via, authNeeded: r2.authNeeded };
      if (!result.error && !extractVerdict(result.analysis)) {
        result = { ...result, error: "réponse vide ou sans verdict après deux essais (sortie tronquée ou format non respecté)", sansVerdict: true };
      }
    }
  } catch (e) {
    result = { error: e.message || String(e) };
  }

  // Un échec qui n'a RIEN coûté à Claude (pas de source, refus d'authentification,
  // exception avant l'appel) ne doit ni brûler le cooldown de la cause ni compter
  // dans le budget horaire : mesuré le 09/09 (sentinel.json), deux alertes `high`
  // « consommées » en 2 s avec « OAuth session expired », puis 6 h de silence sur
  // la même cause. Un délai dépassé ou une limite d'usage, eux, ont bien occupé
  // Claude ou son quota : leur cooldown reste (garde-fou n°3, cf. en-tête).
  // Un SECOND essai en refus d'authentification ne rend rien non plus : le
  // premier appel, lui, a bien occupé Claude (revue du 2026-09-18).
  const sansCout = essais === 1 && Boolean(result?.error) && (result?.via === "none" || result?.authNeeded === true || result?.via == null);
  if (sansCout) {
    db.update((d) => { delete d.seen[job.key]; });
    rt.runsWindow = rt.runsWindow.filter((t) => t !== now);
    if (job.deep) rt.deepWindow = rt.deepWindow.filter((t) => t !== now);
  }

  const record = {
    id: job.id,
    ts: Date.now(),
    durationMs: Date.now() - now,
    key: job.key,
    kind: job.kind,
    deep: job.deep,
    level: job.alert.level,
    title: job.alert.title,
    subject: job.alert.message || "",
    meta: job.alert.meta || {},
    // Le diagnostic est persisté : on le borne aussi ici, indépendamment de la
    // borne du CLI (l'analyse peut aussi venir de l'API).
    analysis: result?.analysis ? String(result.analysis).slice(0, 60_000) : null,
    error: result?.error || null,
    via: result?.via || null,
    essais,
    verdict: result?.error ? null : extractVerdict(result?.analysis),
    // Informatif, remonté par claudecli.js : `subtype` ≠ "success" (plafond de
    // tours…) ou des refus d'outils expliquent une sortie tronquée.
    subtype: typeof result?.subtype === "string" ? result.subtype : null,
    denials: Number.isFinite(result?.denials) ? result.denials : null,
  };
  db.update((d) => {
    d.diagnoses.unshift(record);
    if (d.diagnoses.length > SETTINGS.keep) d.diagnoses.length = SETTINGS.keep;
    // Purge des clés de cooldown trop vieilles (le fichier ne doit pas gonfler).
    const cutoff = Date.now() - SETTINGS.cooldownMs * 4;
    for (const [k, t] of Object.entries(d.seen)) if (t < cutoff) delete d.seen[k];
  });
  if (result?.sansVerdict) {
    rt.skipped.sansVerdict++;
    // Alerte `warn` émise APRÈS la persistance du diagnostic (le lien
    // meta.diagnosis pointe sur un enregistrement qui existe déjà). Clé
    // `sentinelle:…` conservée par raiseInternal : c'est ce préfixe, dans
    // skipKeys, qui empêche la sentinelle de s'analyser elle-même (anti-boucle),
    // quel que soit DASH_SENTINEL_LEVELS. Import statique : alerts.js n'importe
    // pas sentinel.js, il n'y a pas de cycle. Un échec d'émission ne doit pas
    // faire tomber pump() — l'alerte est un bonus, le diagnostic est déjà écrit.
    try {
      raiseInternal({ key: "sentinelle:sans-verdict", level: "warn", title: "Sentinelle : diagnostic sans verdict",
        message: `« ${record.title} » : deux réponses sans « ## Verdict » — sortie tronquée ou format non respecté. Le cooldown reste posé ; rien n'a été réparé.`,
        meta: { view: "sentinel", diagnosis: record.id } });
    } catch (e) { console.error("[sentinelle] alerte sans-verdict impossible :", e.message); }
  }
  rt.total++;
  rt.running = null;
  pumping = false;
  audit("sentinel_diagnose", { id: record.id, kind: record.kind, key: record.key, ok: !record.error }, "sentinelle");
  broadcast("sentinel", record);
  broadcast("sentinel_state", sentinelState());

  // ─── Réparation ───────────────────────────────────────────────────────────
  // Uniquement sur un DÉFAUT RÉEL auto-déclaré : on ne « corrige » pas un
  // comportement attendu, et on ne bricole pas sur des données insuffisantes.
  // Séquentiel à dessein : les vérifications prennent des minutes et ne doivent
  // pas se chevaucher (Playwright, un seul serveur local).
  if (record.verdict === "defect" && !record.error) {
    rt.repairing = { id: record.id, title: record.title, startedAt: Date.now() };
    broadcast("sentinel_state", sentinelState());
    let rep;
    try { rep = await repairer(record, analyzer); }
    catch (e) { rep = { attempted: true, raison: "erreur inattendue : " + (e.message || String(e)) }; }
    rt.repairing = null;
    record.repair = rep;
    db.update((d) => { const x = d.diagnoses.find((y) => y.id === record.id); if (x) x.repair = rep; });
    broadcast("sentinel", record);
    broadcast("sentinel_state", sentinelState());
  }
  if (rt.queue.length) setTimeout(() => pump(), 250).unref?.();
  return record;
}

/** Récupère le verdict auto-déclaré par l'analyse (section « ## Verdict »). */
export function extractVerdict(analysis) {
  if (!analysis) return null;
  const s = String(analysis);
  // ① La ligne machine, demandée en DERNIÈRE ligne, seule. On retient la
  //    DERNIÈRE occurrence, et seulement si rien d'autre que du blanc la suit :
  //    le préambule demande au modèle de CITER les données observées dans
  //    « ## Preuves », et un message d'alerte hostile peut contenir sa propre
  //    ligne « VERDICT: DEFAUT_REEL » (sanitizeObserved ne touche ni les sauts
  //    de ligne ni ce mot). Prise à la première occurrence (revue du
  //    2026-09-18), cette citation l'emportait sur la conclusion du modèle et
  //    un « defect » forcé déclenchait le réparateur. La conclusion du modèle
  //    est toujours ce qu'il écrit en dernier ; une citation ne l'est jamais.
  //    Si la ligne finale manque (sortie tronquée, texte après), on retombe
  //    sur ② — la section « ## Verdict », en tête par format.
  const lignes = [...s.matchAll(/^[ \t]*VERDICT\s*:\s*(DEFAUT_REEL|DÉFAUT_RÉEL|COMPORTEMENT_ATTENDU|INSUFFISANT)\b[ \t\r]*$/gim)];
  const m0 = lignes[lignes.length - 1];
  if (m0 && !s.slice(m0.index + m0[0].length).trim()) {
    const v = m0[1].toUpperCase();
    return v.startsWith("D") ? "defect" : v.startsWith("C") ? "expected" : "insufficient";
  }
  // ② La section, tolérante à la FORME (« ## Verdict », « **Verdict :** »,
  //    « Verdict — ») mais stricte sur le MOT qui suit.
  const m = s.match(/(?:^|\n)\s*(?:#{1,6}\s*)?\**\s*Verdict\s*\**\s*[:—–-]?\s*\**\s*\n?\s*([^\n]{0,80})/i);
  if (!m) return null;
  const line = m[1].toUpperCase();
  if (line.includes("DÉFAUT") || line.includes("DEFAUT")) return "defect";
  if (line.includes("ATTENDU")) return "expected";
  if (line.includes("INSUFF")) return "insufficient";
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  API PUBLIQUE
// ═══════════════════════════════════════════════════════════════════════════
export function sentinelState() {
  return {
    enabled: isEnabled(),
    started: rt.started,
    available: available(),
    running: rt.running,
    repairing: rt.repairing,
    repair: repairState(),
    queued: rt.queue.length,
    total: rt.total,
    skipped: { ...rt.skipped },
    skippedLog: (db.get().skippedLog || []).slice(0, 10),
    runsLastHour: rt.runsWindow.filter((t) => Date.now() - t < 3600_000).length,
    settings: {
      levels: SETTINGS.levels, maxPerHour: SETTINGS.maxPerHour,
      cooldownMin: Math.round(SETTINGS.cooldownMs / 60000), deep: SETTINGS.deep,
      skipKeys: SETTINGS.skipKeys,
    },
  };
}

export function listDiagnoses(limit = 50) { return db.get().diagnoses.slice(0, limit); }
export function getDiagnosis(id) { return db.get().diagnoses.find((d) => d.id === id) || null; }

/** Démarre l'écoute. Idempotent — l'abonnement au flux d'alertes n'est posé qu'une fois. */
let subscribed = false;
export function startSentinel() {
  const already = rt.started && subscribed;
  rt.started = true;
  if (!rt.startedAt) rt.startedAt = Date.now();
  if (already) return sentinelState();
  if (!subscribed) {
    subscribed = true;
    onAlert((alert) => { try { consider(alert); } catch (e) { console.error("[sentinelle]", e.message); } });
  }
  console.log(`  ▸ Sentinelle : ${isEnabled() ? "active" : "en veille"}${available() ? "" : " (aucune source d'analyse — connecte `claude`)"}`);
  broadcast("sentinel_state", sentinelState());
  return sentinelState();
}

/** Remise à zéro de l'état vivant — usage TESTS uniquement. */
export function _reset({ startedAt = Date.now() } = {}) {
  rt.queue.length = 0; rt.running = null; rt.repairing = null; rt.lastRunAt = 0; rt.runsWindow.length = 0; rt.deepWindow.length = 0;
  rt.total = 0; rt.started = true; rt.startedAt = startedAt;
  rt.skipped = { cooldown: 0, budget: 0, deepBudget: 0, level: 0, queue: 0, unavailable: 0, noise: 0, sansVerdict: 0 };
  if (rt.reprise) { clearTimeout(rt.reprise); rt.reprise = null; }
  pumping = false;
  db.update((d) => { d.seen = {}; d.diagnoses = []; d.skippedLog = []; });
}
export const _settings = SETTINGS;
export function _pump() { return pump(); }
/** Fenêtre horaire des analyses — usage TESTS (éprouver la reprise après budget épuisé). */
export function _setRunsWindowForTests(ts) { rt.runsWindow = Array.isArray(ts) ? ts.slice() : []; }
