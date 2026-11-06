// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS CRITIQUES — du flux d'action au verdict métier, dans le nuage
// (2026-11-06)
//
// Entrée : des lignes `telemetry_events` de type `flow` (start / step / end,
// reliées par `correlation_id`), telles que la base les rend — DANS N'IMPORTE
// QUEL ORDRE (un lot de télémétrie part en un seul insert : ses lignes ont le
// même `received_at`, et leur ordre de lecture n'est pas garanti), et parfois
// en DOUBLE (copie d'un événement déjà reçu, mesurée à 18 % le 2026-10-11).
// Sortie : pour chaque contrat (contrats-actions.js), combien d'actions ont
// abouti, échoué, été refusées légitimement, attendent en file, sont encore en
// cours, ou sont restées sans verdict — et un état que l'écran peut dire.
//
// Les règles, une par piège :
//  · RIEN N'EST INVENTÉ. Une action sans verdict dans son délai est INCONNUE,
//    jamais réussie, jamais échouée : la télémétrie a pu se perdre (onglet
//    fermé, appareil hors ligne). Une fin sans début connu est ORPHELINE
//    (fenêtre de lecture coupée), comptée à part, jamais jugée.
//  · LE DÉNOMINATEUR SE DIT. `juges` = réussies + échouées + inconnues. Les
//    refus légitimes et les mises en file sont montrés à côté, jamais retirés
//    en silence ; les actions encore dans leur délai ne sont pas jugées.
//  · PAS D'ÉTAT SAIN SANS VOLUME. En dessous de `SEUILS.minJuges` actions
//    jugées, l'état est « insuffisant » — gris, jamais vert (une heure calme
//    n'est pas une preuve de santé).
//  · UNE PANNE SE PROUVE PAR DES IDENTITÉS SERVEUR. Le code de refus (`rc`) et
//    tout le contenu d'une ligne sont écrits par un navigateur ; seul
//    `auth_uid` est posé par le serveur (trigger `telemetry_pose_identite`).
//    Une ligne SANS compte ne pèse RIEN (ni succès qui dilue, ni échec qui
//    alarme) : elle est comptée à part (`anonymes`), et dite.
//  · UN COMPTE NE DILUE PAS LES AUTRES. Dans les TAUX qui décident de l'état,
//    chaque compte pèse au plus `parCompteMax` actions : un compte qui rejoue
//    cent faux succès ne masque pas les échecs de trois autres (revue de
//    sécurité du 2026-11-06). Les nombres affichés restent les vrais.
//  · UNE PANNE NE SONNE QUE CONFIRMÉE. `etatParcours` dit « panne » sur des
//    identités serveur ; `confirmerPannes` exige en plus qu'au moins
//    `panneComptesMin` d'entre elles soient des comptes ANCIENS et confirmés
//    (relus dans l'authentification par la fonction). Sans confirmation, la
//    panne redescend en « dégradé » : orange, jamais rouge, jamais un réveil.
//  · DEUX HORLOGES NE SE SOUSTRAIENT PAS. Les durées viennent de `client_ts`
//    (l'horloge de L'APPAREIL, début et fin sur la même) ; l'âge d'une action
//    sans fin vient de `received_at` (l'horloge du SERVEUR) contre `maintenant`
//    (serveur). Un écart d'horloge client ne fabrique ni panne ni lenteur.
//  · LES SONDES SONT À PART. Une ligne `meta.synthetic` est un essai de la
//    surveillance : comptée dans `sondes`, jamais dans le public.
// Ce fichier ne fait AUCUN appel réseau ; tests/unit/parcours.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════

import { CONTRATS, VERSION_CONTRATS, RE_CODE, RE_ACTION, REFUS_COMMUNS, CODE_RESEAU, validerContrats, PARCOURS_NON_INSTRUMENTES } from "./contrats-actions.js";

export const SEUILS = Object.freeze({
  minJuges: 5,             // en dessous : « insuffisant », jamais « sain »
  panneEchecsMin: 3,       // une panne : au moins 3 échecs…
  panneComptesMin: 2,      // …chez au moins 2 comptes serveur distincts…
  panneTaux: 0.5,          // …et au moins la moitié des actions jugées
  degradeEchecsMin: 2,
  degradeTaux: 0.2,
  inconnusMin: 3,          // des actions sans verdict…
  inconnusTaux: 0.5,       // …majoritaires : « dégradé » (non confirmé), jamais « panne »
  lenteurEchantillonsMin: 20, // un p95 au-dessus de l'objectif ne compte qu'avec assez de mesures
  dureeMaxMs: 3600e3,      // une durée au-delà est une horloge folle : écartée
  parCompteMax: 5,         // poids maximal d'un compte dans les taux qui décident
});

// Les issues possibles d'une action, et leur libellé pour un humain.
export const ISSUES = Object.freeze({
  reussi: "réussie", refuse: "refusée (règle métier)", attente: "en file locale",
  reseau: "coupure réseau de l'appareil", echoue: "échouée", en_cours: "en cours", inconnu: "sans verdict",
});

const ms = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : NaN; };
const code = (v) => { const s = String(v == null ? "" : v).trim().toLowerCase(); return RE_CODE.test(s) ? s : (s ? "autre" : null); };
const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * Regroupe les lignes par corrélation. Rend { flux: Map(cid → flux), doublons }.
 * Un flux : { cid, action, debutClient, debutRecu, finClient, statutFin,
 * confirmation ("ok"|"error"|null), rc, compte, version, synthetique, trafic }.
 */
export function regrouperFlux(lignes, contrats = CONTRATS) {
  const flux = new Map();
  const vus = new Set();
  let doublons = 0;
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (!l || typeof l !== "object") continue;
    const cid = typeof l.correlation_id === "string" ? l.correlation_id : "";
    if (!/^fl_[A-Za-z0-9_-]{4,64}$/.test(cid)) continue;
    const eid = l.event_id ? String(l.event_id) : null;
    if (eid) { if (vus.has(eid)) { doublons++; continue; } vus.add(eid); }
    let f = flux.get(cid);
    if (!f) { f = { cid, action: null, debutClient: NaN, debutRecu: NaN, finClient: NaN, statutFin: null, confirmation: null, rc: null, compte: null, version: null, synthetique: false, trafic: null }; flux.set(cid, f); }
    const meta = objet(l.meta);
    if (l.auth_uid && !f.compte) f.compte = String(l.auth_uid);
    // Une version est écrite par le navigateur : assainie, elle ne porte jamais de texte libre.
    if (l.app_version && !f.version) f.version = /^[0-9A-Za-z._+-]{1,40}$/.test(String(l.app_version)) ? String(l.app_version) : "autre";
    if (meta.synthetic === true) f.synthetique = true;
    if (typeof meta.trafic === "string" && !f.trafic) f.trafic = meta.trafic.slice(0, 20);
    const etape = l.action;
    if (etape === "start") {
      const a = String(meta.flow_action || "");
      if (RE_ACTION.test(a)) f.action = a;
      const c = ms(l.client_ts), r = ms(l.received_at);
      if (Number.isFinite(c) && !(c >= f.debutClient)) f.debutClient = c;
      if (Number.isFinite(r) && !(r >= f.debutRecu)) f.debutRecu = r;
    } else if (etape === "step") {
      const cle = String(meta.step || "");
      const contrat = f.action && Object.hasOwn(contrats, f.action) ? contrats[f.action] : null;
      // L'étape de confirmation est celle du contrat ; « saved » à défaut (ordre
      // de lecture : le start peut arriver après — on retient sous « saved »).
      if (cle === (contrat ? contrat.confirmation : "saved") || cle === "saved") {
        f.confirmation = l.status === "ok" ? "ok" : "error";
        if (f.confirmation === "error") f.rc = code(meta.rc) || f.rc || "sans_code";
      } else if (cle === "queued") {
        f.rc = code(meta.rc) || "hors_ligne";
      }
    } else if (etape === "end") {
      const st = String(l.status || "");
      f.statutFin = st === "ok" || st === "error" || st === "pending" ? st : "error";
      const c = ms(l.client_ts);
      if (Number.isFinite(c)) f.finClient = c;
      if (f.statutFin === "error" && !f.rc) f.rc = code(meta.rc);
    }
  }
  return { flux, doublons };
}

/**
 * L'issue d'un flux selon son contrat. `maintenant` = horloge du SERVEUR.
 * Rend une clé de ISSUES, ou null (pas de début connu : orphelin, non jugé).
 */
export function issueFlux(f, contrat, maintenant = Date.now()) {
  if (!f || !f.action || !contrat) return null;
  // La confirmation métier prime sur la fin : c'est elle qui dit la source de vérité.
  const verdict = f.confirmation || (f.statutFin === "ok" || f.statutFin === "error" ? f.statutFin : null);
  if (verdict === "ok") return "reussi";
  if (verdict === "error") {
    if (f.rc && (contrat.refusLegitimes.includes(f.rc) || REFUS_COMMUNS.includes(f.rc))) return "refuse";
    if (f.rc && contrat.attente.includes(f.rc)) return "attente";
    if (f.rc === CODE_RESEAU) return "reseau";
    return "echoue";
  }
  if (f.statutFin === "pending") return "attente";
  const age = maintenant - f.debutRecu;
  if (!Number.isFinite(age)) return "inconnu";
  return age <= contrat.finMs ? "en_cours" : "inconnu";
}

/** Rang le plus proche (nearest-rank), sur une liste TRIÉE. */
export function centile(tries, p) {
  if (!Array.isArray(tries) || !tries.length) return null;
  const rang = Math.min(tries.length, Math.max(1, Math.ceil((p / 100) * tries.length)));
  return tries[rang - 1];
}

const vide = (c) => ({
  id: c.id, libelle: c.libelle, domaine: c.domaine, criticite: c.criticite, objectifP95Ms: c.objectifP95Ms,
  tentes: 0, reussis: 0, refuses: 0, attente: 0, reseau: 0, echoues: 0, enCours: 0, inconnus: 0, juges: 0,
  tauxSucces: null, comptes: 0, comptesEchec: 0, anonymes: 0, anonymesEchec: 0, sondes: 0, p50Ms: null, p95Ms: null, mesures: 0,
  codes: [], versionsEchec: [], dernier: null, etat: "non_observe", raisons: [],
  _comptes: new Set(), _comptesEchec: new Set(), _durees: [], _codes: new Map(), _versions: new Map(), _parCompte: new Map(),
});

/**
 * Le bilan de tous les contrats sur un lot de lignes.
 * opts : { maintenant, contrats, fenetreMs, seuils, depuisMs, garderComptes }.
 *  · `depuisMs` : ne juge que les actions COMMENCÉES depuis (horloge serveur) —
 *    le voyant juge l'heure écoulée dans des lignes lues sur 24 h ;
 *  · `garderComptes` : garde `comptesEchecIds` (identités serveur des comptes
 *    en échec) pour un usage INTERNE à la fonction (réveil de la Sentinelle,
 *    qui vérifie leur ancienneté). Jamais rendu au téléphone ni à GitHub.
 */
export function bilanParcours(lignes, opts = {}) {
  const maintenant = Number.isFinite(opts.maintenant) ? opts.maintenant : Date.now();
  const contrats = opts.contrats || CONTRATS;
  const seuils = { ...SEUILS, ...(opts.seuils || {}) };
  const invalides = validerContrats(contrats);
  if (invalides.length) return { version: VERSION_CONTRATS, contratsInvalides: invalides.slice(0, 5), parcours: [], lues: 0 };
  const { flux, doublons } = regrouperFlux(lignes, contrats);
  const par = new Map(Object.values(contrats).map((c) => [c.id, vide(c)]));
  let orphelins = 0, horsContrat = 0;
  for (const f of flux.values()) {
    if (!f.action) { orphelins++; continue; }
    if (Number.isFinite(opts.depuisMs) && !(f.debutRecu >= opts.depuisMs)) continue;
    const b = par.get(f.action);
    if (!b) { horsContrat++; continue; }
    if (f.synthetique) { b.sondes++; continue; }
    const contrat = contrats[f.action];
    const issue = issueFlux(f, contrat, maintenant);
    // Sans identité serveur : dit, jamais pesé (revue de sécurité du 2026-11-06).
    if (!f.compte) { b.anonymes++; if (issue === "echoue") b.anonymesEchec++; continue; }
    b.tentes++;
    b._comptes.add(f.compte);
    if (issue === "reussi" || issue === "echoue" || issue === "inconnu") {
      const pc = b._parCompte.get(f.compte) || { r: 0, e: 0, i: 0 };
      pc[issue === "reussi" ? "r" : issue === "echoue" ? "e" : "i"]++;
      b._parCompte.set(f.compte, pc);
    }
    if (Number.isFinite(f.debutRecu) && !(f.debutRecu <= ms(b.dernier))) b.dernier = new Date(f.debutRecu).toISOString();
    if (issue === "reussi") {
      b.reussis++;
      const d = f.finClient - f.debutClient;
      if (Number.isFinite(d) && d >= 0 && d <= seuils.dureeMaxMs) b._durees.push(d);
    } else if (issue === "refuse") b.refuses++;
    else if (issue === "attente") b.attente++;
    else if (issue === "reseau") b.reseau++;
    else if (issue === "en_cours") b.enCours++;
    else if (issue === "inconnu") b.inconnus++;
    else if (issue === "echoue") {
      b.echoues++;
      b._comptesEchec.add(f.compte);
      const k = f.rc || "sans_code";
      b._codes.set(k, (b._codes.get(k) || 0) + 1);
      if (f.version) b._versions.set(f.version, (b._versions.get(f.version) || 0) + 1);
    }
  }
  const parcours = [];
  for (const b of par.values()) {
    b.juges = b.reussis + b.echoues + b.inconnus;
    b.tauxSucces = b.juges ? Math.round((b.reussis / b.juges) * 1000) / 10 : null;
    b.comptes = b._comptes.size;
    b.comptesEchec = b._comptesEchec.size;
    // TOUS les comptes, jamais les « n premiers » : l'ordre des lignes est celui
    // qu'un émetteur choisit (revue de sécurité du 2026-11-06). C'est la
    // vérification qui tire au hasard et se borne (`melanger`, la fonction).
    if (opts.garderComptes) b.comptesEchecIds = [...b._comptesEchec];
    const durees = b._durees.sort((x, y) => x - y);
    b.mesures = durees.length;
    b.p50Ms = centile(durees, 50);
    b.p95Ms = centile(durees, 95);
    b.codes = [...b._codes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([c, n]) => ({ code: c, n }));
    b.versionsEchec = [...b._versions.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([v, n]) => ({ version: v, n }));
    // Les taux qui DÉCIDENT : chaque compte pèse au plus `parCompteMax` actions jugées.
    let pe = 0, pi = 0, pt = 0;
    for (const { r, e, i } of b._parCompte.values()) {
      const t = r + e + i, k = t > seuils.parCompteMax ? seuils.parCompteMax / t : 1;
      pe += e * k; pi += i * k; pt += t * k;
    }
    b.tauxEchecPondere = pt ? pe / pt : 0;
    b.tauxInconnuPondere = pt ? pi / pt : 0;
    Object.assign(b, etatParcours(b, seuils));
    for (const k of ["_comptes", "_comptesEchec", "_durees", "_codes", "_versions", "_parCompte"]) delete b[k];
    parcours.push(b);
  }
  return {
    version: VERSION_CONTRATS, lues: Array.isArray(lignes) ? lignes.length : 0, flux: flux.size, doublons, orphelins, horsContrat,
    fenetreMs: Number.isFinite(opts.fenetreMs) ? opts.fenetreMs : null, genereLe: new Date(maintenant).toISOString(), parcours,
  };
}

/** L'état d'un parcours et ses raisons, en mots. FONCTION PURE. */
export function etatParcours(b, seuils = SEUILS) {
  const raisons = [];
  if (!b.tentes) return { etat: "non_observe", raisons: ["aucune action observée sur la fenêtre"] };
  // Les taux pondérés (un compte ≤ parCompteMax actions) décident quand le bilan les porte.
  const tauxEchec = Number.isFinite(b.tauxEchecPondere) ? b.tauxEchecPondere : (b.juges ? b.echoues / b.juges : 0);
  const tauxInconnu = Number.isFinite(b.tauxInconnuPondere) ? b.tauxInconnuPondere : (b.juges ? b.inconnus / b.juges : 0);
  const sur = `${b.echoues} échec(s) sur ${b.juges} action(s) jugée(s)`;
  if (b.echoues >= seuils.panneEchecsMin && b.comptesEchec >= seuils.panneComptesMin && tauxEchec >= seuils.panneTaux) {
    return { etat: "panne", raisons: [`${sur}, chez ${b.comptesEchec} comptes`] };
  }
  if (b.echoues >= seuils.degradeEchecsMin && tauxEchec >= seuils.degradeTaux) raisons.push(`${sur} (${b.comptesEchec} compte(s))`);
  if (b.inconnus >= seuils.inconnusMin && tauxInconnu >= seuils.inconnusTaux) raisons.push(`${b.inconnus} action(s) sans verdict sur ${b.juges} : résultat non confirmé`);
  if (b.mesures >= seuils.lenteurEchantillonsMin && b.p95Ms != null && b.objectifP95Ms && b.p95Ms > b.objectifP95Ms) raisons.push(`lent : p95 ${Math.round(b.p95Ms)} ms pour un objectif de ${b.objectifP95Ms} ms (${b.mesures} mesures)`);
  if (raisons.length) return { etat: "degrade", raisons };
  if (b.juges < seuils.minJuges) return { etat: "insuffisant", raisons: [`${b.juges} action(s) jugée(s) : trop peu pour conclure (il en faut ${seuils.minJuges})`] };
  return { etat: "sain", raisons: [`${b.reussis} réussie(s) sur ${b.juges} jugée(s)`] };
}

/**
 * Confirme ou rabat chaque panne : au moins `panneComptesMin` de ses comptes en
 * échec doivent être ANCIENS et confirmés — `anciens` est l'ensemble que la
 * fonction a relu dans l'authentification. Une panne non confirmée redescend en
 * « dégradé » (orange) et le dit. Les identités sont ensuite RETIRÉES du bilan :
 * il peut partir vers le téléphone. PUR : rend un nouveau bilan.
 */
export function confirmerPannes(bilan, verification, seuils = SEUILS) {
  if (!bilan || !Array.isArray(bilan.parcours)) return bilan;
  // `verification` : l'ensemble des comptes anciens, ou { anciens, nonLus } quand
  // la lecture a été bornée — un compte NON LU n'est ni ancien ni neuf.
  const v = verification instanceof Set ? { anciens: verification, nonLus: new Set() } : (verification || {});
  const ok = v.anciens instanceof Set ? v.anciens : new Set();
  const nonLus = v.nonLus instanceof Set ? v.nonLus : new Set();
  const parcours = bilan.parcours.map((p) => {
    const { comptesEchecIds, ...reste } = p;
    if (p.etat !== "panne") return reste;
    const ids = Array.isArray(comptesEchecIds) ? comptesEchecIds : [];
    const n = ids.filter((u) => ok.has(u)).length;
    if (n >= seuils.panneComptesMin) return { ...reste, panneConfirmee: true, comptesEchecAnciens: n };
    // Lecture bornée atteinte : la panne n'est PAS déclarée non confirmée en
    // silence — elle le dit (« vérification incomplète »), en orange.
    const nl = ids.filter((u) => nonLus.has(u)).length;
    const pourquoi = nl ? `vérification incomplète : ${nl} compte(s) non relu(s) (lecture bornée), ${n} ancien(s) trouvé(s)` : `${n} compte(s) ancien(s) sur ${p.comptesEchec} en échec (il en faut ${seuils.panneComptesMin})`;
    return { ...reste, etat: "degrade", panneConfirmee: false, comptesEchecAnciens: n, verificationIncomplete: nl > 0,
      raisons: [`panne non confirmée : ${pourquoi} — ${p.raisons[0]}`] };
  });
  return { ...bilan, parcours };
}

/**
 * Mélange (Fisher-Yates) avec un tirage que l'émetteur des lignes ne choisit pas :
 * la vérification des comptes se borne sur un échantillon AU HASARD, jamais sur
 * l'ordre des lignes. `aleatoire(n)` rend un entier dans [0, n[ (injectable pour les bancs).
 */
export function melanger(liste, aleatoire = null) {
  const a = Array.isArray(liste) ? liste.slice() : [];
  const tirer = typeof aleatoire === "function" ? aleatoire : (n) => {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === "function") { const u = new Uint32Array(1); c.getRandomValues(u); return u[0] % n; }
    return Math.floor(Math.random() * n);
  };
  for (let i = a.length - 1; i > 0; i--) { const j = tirer(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Les identités des comptes en échec des parcours en panne (usage INTERNE à la fonction). */
export function comptesDesPannes(bilan) {
  if (!bilan || !Array.isArray(bilan.parcours)) return [];
  return [...new Set(bilan.parcours.filter((p) => p.etat === "panne").flatMap((p) => p.comptesEchecIds || []))];
}

const nomParcours = (p) => "« " + p.libelle + " »";

/**
 * Ce que le bilan apporte au VOYANT : { rouge: [...], orange: [...] }.
 * Une panne d'un parcours critique est rouge ; d'un parcours important, orange ;
 * un parcours dégradé est orange. « Insuffisant » et « non observé » ne colorent
 * rien : ils se disent sur l'écran, ils ne sonnent pas.
 */
export function raisonsVerdict(bilan) {
  const rouge = [], orange = [];
  if (!bilan || !Array.isArray(bilan.parcours)) return { rouge, orange };
  if (Array.isArray(bilan.contratsInvalides) && bilan.contratsInvalides.length) orange.push("contrats d'action invalides : les parcours ne sont pas jugés");
  for (const p of bilan.parcours) {
    // Rouge = panne CONFIRMÉE d'un parcours critique (confirmerPannes). Une panne
    // que personne n'a confirmée ne sonne jamais : orange, et elle le dit.
    if (p.etat === "panne" && p.panneConfirmee === true && p.criticite === "critique") rouge.push(`parcours ${nomParcours(p)} en panne : ${p.raisons[0]}`);
    else if (p.etat === "panne") orange.push(`parcours ${nomParcours(p)} en panne${p.panneConfirmee === true ? "" : " (à confirmer)"} : ${p.raisons[0]}`);
    else if (p.etat === "degrade") orange.push(`parcours ${nomParcours(p)} dégradé : ${p.raisons[0]}`);
  }
  return { rouge, orange };
}

/** Les parcours à régler (panne ou dégradé), du plus grave au moins grave. */
export function parcoursARegler(bilan) {
  if (!bilan || !Array.isArray(bilan.parcours)) return [];
  const rang = (p) => (p.etat === "panne" ? (p.criticite === "critique" ? 0 : 1) : 2);
  return bilan.parcours.filter((p) => p.etat === "panne" || p.etat === "degrade").sort((a, b) => rang(a) - rang(b) || b.comptesEchec - a.comptesEchec || b.echoues - a.echoues);
}

/**
 * La couverture de la supervision, calculée — jamais déclarée. `observes24h` =
 * identifiants d'action vus dans la fenêtre. `instrumentes` = ceux qu'un
 * émetteur porte dans le code (garde statique) ; à défaut, le registre.
 */
export function couverture(bilan, contrats = CONTRATS, nonInstrumentes = PARCOURS_NON_INSTRUMENTES) {
  const ids = Object.keys(contrats);
  const observes = bilan && Array.isArray(bilan.parcours) ? bilan.parcours.filter((p) => p.tentes > 0).map((p) => p.id) : [];
  const jugeables = bilan && Array.isArray(bilan.parcours) ? bilan.parcours.filter((p) => p.etat === "sain" || p.etat === "degrade" || p.etat === "panne").map((p) => p.id) : [];
  return {
    recenses: ids.length + nonInstrumentes.length,
    sousContrat: ids.length,
    critiques: ids.filter((i) => contrats[i].criticite === "critique").length,
    observes: observes.length,
    jugeables: jugeables.length,
    nonObserves: ids.filter((i) => !observes.includes(i)),
    nonInstrumentes: nonInstrumentes.map((x) => ({ id: x.id, libelle: x.libelle, vuPar: x.vuPar })),
  };
}
