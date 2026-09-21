// ═══════════════════════════════════════════════════════════════════════════
// CE QUI T'ATTEND — l'agrégateur du geste humain (2026-09-18).
//
// Les attentes étaient éparpillées : correctifs vérifiés à fusionner (tiroir
// Sentinelle), PR de la chaîne GitHub (nulle part), incidents à transitionner
// (aucune UI), alertes non acquittées (vue « avancée »), modération (onglet
// Exploitation, capacité db), disque et CLI (Sources). L'Accueil pouvait dire
// « Tout fonctionne bien » pendant que tout cela s'accumulait.
//
// `attenteSnapshot(sources, now)` est PUR : il reçoit les lectures et rend
//   · `items[]`  — { key, priorite P0..P3, titre, detail, depuis, cible } ;
//   · `machines7j` — ce que les automates ont fait (comptages seulement) ;
// un état vide est « Rien ne t'attend », distinct de « attente non lue ».
// Le wrapper `attente()` lit les sources (chaîne GitHub mémorisée, sentinelle,
// audit, incidents, alertes, exploitation, disque, CLI, superviseur, stockage)
// et met en cache 60 s : l'Accueil rejoue toutes les 10 s et à chaque événement.
// Il diffuse `attente` sur le SSE quand la liste change. Jamais un identifiant
// de personne ni un contenu de ligne : des comptages, des titres tronqués.
// ═══════════════════════════════════════════════════════════════════════════
const H = 3_600_000;
const J = 24 * H;
const MEMO_MS = 60_000;

const PRIORITE_CHAINE = {
  pause: "P1", sante_rouge: "P1", humain: "P1", recidive: "P1", disponibilite: "P0", moderation: "P2",
  veille: "P1", digest: "P2", poste: "P1", enquete_longue: "P2", correctif_pr: "P2", pr_ouverte: "P3",
};
const TITRE_CHAINE = {
  pause: "Coupe-circuit posé : la sentinelle GitHub est en pause", sante_rouge: "Santé rouge signalée par la sentinelle distante",
  humain: "Enquête qui attend une décision humaine", recidive: "Récidive après déploiement : décision humaine",
  disponibilite: "Site en panne signalé", moderation: "Signalement de modération ouvert", veille: "Veille production en alerte",
  digest: "Digest du jour à lire", poste: "Le poste a besoin de toi", enquete_longue: "Enquête ouverte depuis plus de 6 h",
  correctif_pr: "Correctif automatique en attente de fusion", pr_ouverte: "PR ouverte (contre-revue à vérifier)",
};
const ORDRE = { P0: 0, P1: 1, P2: 2, P3: 3 };
// Comptes rendus (lot F) : SENTINELLE_TOKEN à ≤ 1 j = P0, 2–3 j = P1, au-delà
// rien ; tableau de veille muet au-delà de 6 h = P2.
const JETON_P0_MAX_J = 1;
const JETON_P1_MAX_J = 3;
const VEILLE_MUETTE_MIN = 360;
const tronque = (s, n = 120) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, n);

// `depuis` est TOUJOURS un nombre de millisecondes (ou null) : la chaîne GitHub
// apporte des ISO (`created_at`), les alertes et incidents des nombres ; sans
// cette normalisation, app.js affichait « depuis NaNj » et le tri devenait
// incohérent pour tous les items GitHub (D1-C3).
const enMs = (v) => { const d = typeof v === "string" ? Date.parse(v) : v; return Number.isFinite(d) ? d : null; };

export function attenteSnapshot(src = {}, now = Date.now()) {
  const items = [];
  const ajoute = (it) => items.push({ key: it.key, priorite: it.priorite, titre: tronque(it.titre), detail: tronque(it.detail || "", 200), depuis: enMs(it.depuis), cible: it.cible || null });

  // 1. La chaîne GitHub (issues et PR qui attendent quelqu'un).
  const chaine = src.chaine || null;
  for (const a of (chaine && Array.isArray(chaine.attente)) ? chaine.attente : []) {
    ajoute({ key: `gh:${a.type}:${a.numero}`, priorite: a.type === "correctif_pr" && a.autoMerge === false ? "P1" : (PRIORITE_CHAINE[a.type] || "P3"),
      titre: TITRE_CHAINE[a.type] || a.type, detail: `#${a.numero} — ${a.titre}`, depuis: a.depuis, cible: a.url });
  }
  if (chaine && chaine.chaine && (chaine.chaine.etat === "morte" || chaine.chaine.etat === "pause")) {
    ajoute({ key: "gh:chaine:" + chaine.chaine.etat, priorite: "P1", titre: chaine.chaine.etat === "pause" ? "Chaîne autonome en pause" : "Chaîne autonome morte", detail: chaine.chaine.cause, cible: "#exploitation" });
  }
  for (const [f, c] of Object.entries((chaine && chaine.crons) || {})) {
    if (c.etat === "desactive") ajoute({ key: "gh:cron:" + f, priorite: "P1", titre: `Cron GitHub désactivé : ${c.label}`, detail: c.texte, cible: "#exploitation" });
  }

  // 2. La sentinelle locale : correctifs vérifiés non fusionnés, refus récents.
  const fusionnees = new Set((src.audit || []).filter((a) => a.action === "sentinel_repair_merged").map((a) => a.details && a.details.branch).filter(Boolean));
  for (const d of src.diagnostics || []) {
    const r = d.repair;
    if (!r) continue;
    if (r.ok && r.branch && !fusionnees.has(r.branch) && !(r.production && r.production.published)) {
      ajoute({ key: "sent:merge:" + d.id, priorite: "P1", titre: "Correctif vérifié à fusionner", detail: `${d.title} — branche ${r.branch}`, depuis: d.ts, cible: "#sentinel" });
    } else if (r.attempted && !r.ok && now - (d.ts || 0) < 7 * J) {
      ajoute({ key: "sent:refus:" + d.id, priorite: "P3", titre: "Réparation automatique refusée", detail: `${d.title} — ${r.raison || "raison non précisée"}`, depuis: d.ts, cible: "#sentinel" });
    }
  }

  // 3. Incidents high/critical ouverts depuis plus de 72 h.
  for (const i of src.incidents || []) {
    if (i.status === "closed" || !(i.severity === "high" || i.severity === "critical")) continue;
    const vu = Date.parse(i.lastSeenAt || i.createdAt);
    if (!Number.isFinite(vu) || now - vu < 72 * H) continue;
    ajoute({ key: "inc:" + i.id, priorite: "P2", titre: "Incident ouvert depuis plus de 3 jours", detail: `${i.signal?.title || i.id} — dernière occurrence il y a ${Math.round((now - vu) / J)} j`, depuis: vu, cible: "#alerts" });
  }

  // 4. Alertes high/critical non acquittées — UNE par clé, et jamais une clé
  // dont la dernière alerte est un retour (`info` = la panne est finie, vue par
  // la machine). alerts.js referme ces alertes à l'émission du retour ; ici on
  // ne dépend pas de ce qu'il a déjà fait : un fichier d'avant la règle, ou un
  // retour arrivé entre deux passages, ne remet pas 5 « Ingestion sourde »
  // réparées seules devant Benjamin. Plusieurs occurrences ouvertes d'une même
  // clé = une ligne, datée de la PREMIÈRE, qui compte les autres.
  const parCle = new Map();   // clé -> { derniere, ouvertes[] }
  for (const a of src.alerts || []) {
    const k = a.key || a.title;
    const e = parCle.get(k) || { derniere: a, ouvertes: [] };
    if ((a.ts || 0) > (e.derniere.ts || 0)) e.derniere = a;
    if (!a.acknowledged && (a.level === "high" || a.level === "critical")) e.ouvertes.push(a);
    parCle.set(k, e);
  }
  let nAlertes = 0;
  for (const e of parCle.values()) {
    if (!e.ouvertes.length || e.derniere.level === "info" || nAlertes >= 20) continue;
    nAlertes++;
    e.ouvertes.sort((x, y) => (x.ts || 0) - (y.ts || 0));
    const premiere = e.ouvertes[0], recente = e.ouvertes[e.ouvertes.length - 1];
    const critique = e.ouvertes.some((x) => x.level === "critical");
    ajoute({ key: "al:" + recente.id, priorite: critique ? "P0" : "P1", titre: recente.title,
      detail: `${recente.message || ""}${e.ouvertes.length > 1 ? ` (${e.ouvertes.length} occurrences)` : ""}`, depuis: premiere.ts, cible: "#alerts" });
  }

  // 5. Modération (comptages seulement).
  const mod = src.exploitation && src.exploitation.moderation;
  const vmod = src.exploitation && src.exploitation.verdicts && src.exploitation.verdicts.moderation;
  if (mod && mod.ouverts > 0) {
    ajoute({ key: "mod:ouverts", priorite: vmod && vmod.etat === "alert" ? "P1" : "P2", titre: "Signalements à traiter", detail: vmod ? vmod.texte : `${mod.ouverts} signalement(s) en attente`, depuis: mod.plusAncienOuvert ? Date.parse(mod.plusAncienOuvert) : null, cible: "#exploitation" });
  }

  // 6. Le poste : disque, CLI, superviseur, stockage.
  const dk = src.disk || {};
  if (dk.checked && dk.low) ajoute({ key: "poste:disk", priorite: "P1", titre: "Disque du poste presque plein", detail: `${dk.freeGb != null ? dk.freeGb.toFixed(1) : "?"} Go libres (seuil ${dk.thresholdGb} Go) — libérer de la place`, depuis: dk.since, cible: "#sources" });
  const cli = src.cli || null;
  if (cli && cli.checked && !cli.available && cli.installed !== false && !src.apiKey) {
    ajoute({ key: "poste:cli", priorite: cli.reason === "quota" ? "P2" : "P1", titre: cli.reason === "quota" ? "Claude Code : limite d'usage atteinte" : "Claude Code déconnecté : Connecter-Claude.cmd", detail: `raison : ${cli.reason || "inconnue"} — la sentinelle ne diagnostique plus`, depuis: cli.since, cible: "#sources" });
  }
  const sv = src.supervise || {};
  if (sv.supervised && (sv.restarts || 0) >= 3) ajoute({ key: "poste:supervise", priorite: "P2", titre: "Serveur relancé plusieurs fois", detail: `${sv.restarts} relances depuis le logon — regarder le disque et le journal du superviseur`, cible: "#sources" });
  const st = src.storage || null;
  if (st && st.available === false) ajoute({ key: "poste:storage", priorite: "P1", titre: "Le pilotage ne peut plus écrire ses données", detail: (st.failing || []).map((f) => f.name).join(", "), cible: "#sources" });

  // 7. Les comptes rendus (tableau de veille lu sur GitHub) : le jeton de la
  // chaîne de réparation qui expire, et une veille qui ne s'exprime plus.
  // Benjamin ne lit pas ses mails : le rappel vit ici, un jour avant (P0),
  // trois jours avant (P1) ; au-delà, la veille porte déjà [ATTENTION] < 14 j.
  const veille = src.comptesRendus && src.comptesRendus.veille;
  if (veille) {
    const majLe = enMs(veille.majLe);
    const ageMin = majLe != null ? (now - majLe) / 60_000 : veille.ageMin;
    // Les jours lus datent du tableau : un tableau vieux de 2 j qui dit « 3 j »
    // parle d'un jeton qui expire dans 1 j. On retranche l'âge (jours entiers).
    const jLu = veille.jetons ? veille.jetons.SENTINELLE_TOKEN : null;
    const ageJ = Number.isFinite(ageMin) && ageMin > 0 ? Math.floor(ageMin / 1440) : 0;
    const j = Number.isInteger(jLu) ? Math.max(0, jLu - ageJ) : null;
    if (Number.isInteger(j) && j >= 0 && j <= JETON_P1_MAX_J) {
      ajoute({ key: "jeton:sentinelle", priorite: j <= JETON_P0_MAX_J ? "P0" : "P1",
        titre: `Renouveler SENTINELLE_TOKEN — ${j === 0 ? "expire aujourd'hui" : `expire dans ${j} j`}`,
        detail: "github.com/settings/tokens → régénérer le jeton, puis Settings > Secrets and variables > Actions > SENTINELLE_TOKEN ; sans lui la chaîne de réparation s'arrête",
        depuis: veille.majLe, cible: "#exploitation" });
    }
    // Un tableau servi depuis un cache PÉRIMÉ (lecture GitHub en panne, quota épuisé) ne parle pas du cron :
    // la panne de lecture est déjà portée ailleurs (erreur, quota). On n'accuse la veille que sur une lecture fraîche.
    if (Number.isFinite(ageMin) && ageMin > VEILLE_MUETTE_MIN && src.comptesRendus.perime !== true) {
      ajoute({ key: "tableau:veille:age", priorite: "P2", titre: `La veille ne s'est pas exprimée depuis ${Math.round(ageMin / 60)} h`,
        detail: "cron servi 4 à 23× moins souvent qu'annoncé ; au-delà de 6 h, ouvrir Actions › Veille de production",
        depuis: majLe, cible: "#exploitation" });
    }
  }

  items.sort((a, b) => (ORDRE[a.priorite] - ORDRE[b.priorite]) || ((a.depuis || 0) - (b.depuis || 0)));

  // Ce que les machines ont fait (7 j) : comptages depuis l'audit et GitHub.
  const audit7 = (src.audit || []).filter((a) => now - (a.ts || 0) < 7 * J);
  const n = (action, pred = () => true) => audit7.filter((a) => a.action === action && pred(a)).length;
  const fermees = chaine && Array.isArray(chaine.fermees7j) ? chaine.fermees7j : null;
  const runsOk7 = (f) => { const r = chaine && chaine.runs && chaine.runs[f]; return r && r.dernierSucces && now - Date.parse(r.dernierSucces.quand) < 7 * J ? 1 : 0; };
  const machines7j = {
    diagnostics: n("sentinel_diagnose"), diagnosticsOk: n("sentinel_diagnose", (a) => a.details && a.details.ok === true),
    correctifsVerifies: n("sentinel_repair_ready"), correctifsRejetes: n("sentinel_repair_rejected"), correctifsFusionnes: n("sentinel_repair_merged"),
    publications: n("sentinel_production_published"), recidives: n("sentinel_recurrence_detected"), testsAuto: n("run_tests_auto"),
    enquetesGithubFermees: fermees ? fermees.length : null,
    sauvegardeOk: chaine ? runsOk7("sauvegarde.yml") : null, veilleOk: chaine ? runsOk7("veille-production.yml") : null,
    chaine: chaine && chaine.chaine ? chaine.chaine.etat : null,
  };

  return { items, count: items.length, parPriorite: items.reduce((acc, i) => { acc[i.priorite] = (acc[i.priorite] || 0) + 1; return acc; }, {}), machines7j, generatedAt: now, sourcesLues: Object.keys(src).filter((k) => src[k] != null) };
}

let _memo = { t: 0, valeur: null, cles: null };
let _mods = null;

async function modules() {
  if (_mods) return _mods;
  const [chaine, sentinel, audit, incidents, alerts, exploitation, disque, claudecli, jsondb, sse, config, comptesRendus] = await Promise.all([
    import("./chaine-autonome.js"), import("./sentinel.js"), import("./audit.js"), import("./incident-packets.js"), import("./alerts.js"),
    import("./exploitation.js"), import("./disque.js"), import("./claudecli.js"), import("./jsondb.js"), import("./sse.js"), import("./config.js"),
    import("./comptes-rendus.js"),
  ]);
  _mods = { chaine, sentinel, audit, incidents, alerts, exploitation, disque, claudecli, jsondb, sse, config, comptesRendus };
  return _mods;
}

/** Lecture réelle des douze sources ; chaque lecture en échec rend son défaut, jamais une exception. */
async function lireSources({ now, supervise }) {
  const m = await modules();
  const lire = async (fn, defaut = null) => { try { return await fn(); } catch { return defaut; } };
  // comptesRendus lit la chaîne mémorisée (aucun appel GitHub de plus) : après chaineAutonome.
  const [chaine, exploitation] = await Promise.all([lire(() => m.chaine.chaineAutonome({ now })), lire(() => m.exploitation.exploitation())]);
  const comptesRendus = await lire(() => m.comptesRendus.comptesRendus({ now }));
  return {
    chaine, exploitation, comptesRendus,
    diagnostics: await lire(() => m.sentinel.listDiagnoses(100), []),
    audit: await lire(() => m.audit.listAudit(3000), []),
    incidents: await lire(() => m.incidents.listIncidentPackets(200), []),
    alerts: await lire(() => m.alerts.listAlerts(), []),
    disk: await lire(() => m.disque.diskState()),
    cli: await lire(() => m.claudecli.claudeCliState()),
    apiKey: Boolean(m.config.config.anthropicKey),
    supervise,
    storage: await lire(() => m.jsondb.storageHealth()),
  };
}
async function diffuser(evenement, payload) { const m = await modules(); m.sse.broadcast(evenement, payload); }

// Dépendances remplaçables par les tests (lecture des sources, diffusion SSE) :
// le contrat du wrapper — cache 60 s, UN événement `attente` quand la liste
// de clés change — se prouve sans sentinel.js ni GitHub.
let _deps = { lireSources, diffuser };

/** Instantané agrégé, mis en cache 60 s. `supervise` est fourni par index.js (il connaît le superviseur). */
export async function attente({ now = Date.now(), supervise = null, force = false } = {}) {
  if (!force && _memo.valeur && now - _memo.t < MEMO_MS) return _memo.valeur;
  const src = await _deps.lireSources({ now, supervise });
  const snap = attenteSnapshot(src, now);
  const cles = JSON.stringify(snap.items.map((i) => i.key));
  if (_memo.cles !== null && _memo.cles !== cles) { try { await _deps.diffuser("attente", { n: snap.count }); } catch {} }
  _memo = { t: now, valeur: snap, cles };
  return snap;
}

/** RÉSERVÉ AUX TESTS. */
export function _resetAttenteForTests() { _memo = { t: 0, valeur: null, cles: null }; _deps = { lireSources, diffuser }; }
export function _setDepsForTests({ lireSources: l = null, diffuser: d = null } = {}) { _deps = { lireSources: l || lireSources, diffuser: d || diffuser }; }
