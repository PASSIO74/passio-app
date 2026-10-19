// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES DISTANTS — l'interrupteur que toute la production écoute (2026-10-11)
//
// Jusqu'ici, aucun interrupteur SERVEUR ne coupait une fonctionnalité chez tout
// le monde (docs/RECUPERATION.md, EXP-03 : « C'est écrit, pas réglé ») : les
// drapeaux `passio_*="0"` sont des coupures LOCALES, par appareil, et le seul
// retour arrière était de remettre en ligne la version d'avant. À 100 000
// comptes, ça ne suffit plus : une fonctionnalité qui casse doit pouvoir être
// éteinte chez tous en quelques minutes, sans déploiement, pendant que la
// Sentinelle écrit le correctif ; et une production qui approche d'un mur de
// capacité doit pouvoir RALENTIR toute seule plutôt que tomber.
//
// Trois réglages, une ligne chacun dans `public.reglages_distants` (lisible par
// tous, écrite par la seule fonction `pilotage`, clé service_role) :
//   · `delestage` { niveau: 0 | 1 | 2 } — les filets de rafraîchissement, les
//     compteurs visibles et l'échantillon de télémétrie ralentissent ×2 / ×4,
//     et le temps réel s'endort plus tôt. Rien ne casse : on lit moins souvent.
//     Posé à la main depuis le téléphone, ou par la veille (pg_cron, 5 min)
//     quand les connexions temps réel ou les pannes serveur montent.
//   · `coupures` { cles: [...] } — des drapeaux d'une LISTE BLANCHE, posés à
//     "0" chez chaque appareil (ce qu'un drapeau sait faire : ENLEVER).
//   · `bandeau` { texte, niveau } — un message court à tous (« les inscriptions
//     par e-mail sont saturées, passe par Google »).
//
// Ce fichier ne fait AUCUN appel réseau : il valide et il DÉCIDE. Le client
// (js/reglages-distants.js) porte une copie de la liste blanche et des
// facteurs ; tests/unit/reglages.test.mjs confronte les deux.
// ═══════════════════════════════════════════════════════════════════════════

export const CLES_REGLAGES = Object.freeze(["delestage", "coupures", "bandeau"]);

/** Niveau de délestage → facteur appliqué aux cadences (×) et à l'échantillon (÷). */
export const FACTEURS_DELESTAGE = Object.freeze({ 0: 1, 1: 2, 2: 4 });

/**
 * Drapeaux qu'un réglage distant peut poser à "0". Chacun est un « kill switch »
 * documenté du dépôt, lu sous la forme `localStorage.getItem(k) === "0"` —
 * le banc vérifie que le fichier qui le lit existe et compare bien à "0".
 * ⚠️ DÉLIBÉRÉMENT ABSENTS :
 *   · `passio_telemetry` — couper la télémétrie aveuglerait la veille même qui
 *     décide ; pour alléger, c'est le délestage qui échantillonne ;
 *   · `passio_realtime_v3` — "0" fait retomber sur le canal GLOBAL v1, qui
 *     coûte PLUS sous charge : l'inverse d'une protection ;
 *   · toute clé de DONNÉES (`passio_mvp_state_v1`, conversations, files…) :
 *     y écrire "0" effacerait un compte. Une liste blanche, jamais un motif.
 */
export const COUPURES_AUTORISEES = Object.freeze([
  "flat_passions_v1",
  "passio_feed_intents_v1",
  "passio_feed_irl_bridge_v1",
  "passio_feed_rank",
  "passio_feed_window_v1",
  "passio_first_run_experience_v1",
  "passio_invitations_v1",
  "passio_invite_apres_creation_v1",
  "passio_irl_proposal_v1",
  "passio_liens_courts_v1",
  "passio_rappels_push_v1",
  "passio_recap_semaine",
  "passio_ui_3",
  "passio_ui_4a0",
  "passio_ui_4a1",
  "passio_ui_4a2",
  "passio_ui_4a3",
  "passio_ui_4a4",
  "passio_ui_4a5",
  "passio_ui_4b",
  "passio_ui_5",
  "passio_ui_6",
  "passio_ui_6a",
  "passio_ui_6b",
  "passio_ui_6c",
  "passio_ui_7",
  "passio_ui_8",
  "passio_ui_v2",
]);

export const BANDEAU_MAX = 200;
export const MOTIF_MAX = 300;

// Caractères de contrôle et séparateurs bidirectionnels : un bandeau est lu par
// tout le monde, il ne doit ni casser une ligne ni retourner un texte.
const RE_CONTROLE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * Valide et normalise une valeur avant écriture. Rend `{ valeur }` ou
 * `{ erreur }` — jamais une valeur « à peu près juste ».
 */
export function normaliserReglage(cle, valeur) {
  if (!CLES_REGLAGES.includes(cle)) return { erreur: "Réglage inconnu." };
  const v = valeur && typeof valeur === "object" && !Array.isArray(valeur) ? valeur : null;
  if (!v) return { erreur: "Valeur invalide." };
  if (cle === "delestage") {
    const n = v.niveau;
    if (!Number.isInteger(n) || !Object.hasOwn(FACTEURS_DELESTAGE, n)) return { erreur: "Niveau de délestage invalide (0, 1 ou 2)." };
    return { valeur: { niveau: n } };
  }
  if (cle === "coupures") {
    if (!Array.isArray(v.cles)) return { erreur: "Liste de coupures invalide." };
    const inconnues = v.cles.filter((k) => !COUPURES_AUTORISEES.includes(k));
    if (inconnues.length) return { erreur: "Coupure hors liste blanche : " + inconnues.slice(0, 3).map(String).join(", ") };
    return { valeur: { cles: [...new Set(v.cles)].sort() } };
  }
  // bandeau
  const texte = typeof v.texte === "string" ? v.texte.replace(RE_CONTROLE, " ").replace(/\s+/g, " ").trim() : "";
  if (!texte) return { erreur: "Le bandeau est vide." };
  if (texte.length > BANDEAU_MAX) return { erreur: `Bandeau trop long (${BANDEAU_MAX} caractères au plus).` };
  const niveau = v.niveau === "alerte" ? "alerte" : "info";
  return { valeur: { texte, niveau } };
}

export function normaliserMotif(m) {
  const t = typeof m === "string" ? m.replace(RE_CONTROLE, " ").replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, MOTIF_MAX) : null;
}

// ─── Délestage automatique (la veille, toutes les 5 min) ────────────────────
//
// On MONTE tout de suite (un mur ne prévient pas deux fois) ; on ne DESCEND
// que d'un cran à la fois, après 30 min au moins au niveau courant, et sous un
// seuil plus bas que celui de montée (hystérésis : sans elle, une mesure qui
// oscille autour de 80 % ferait basculer toute la production toutes les 5 min).
// Un réglage posé par le PILOTE n'est jamais touché : la main gagne.
// Une mesure absente (`null`) ne fait jamais monter ; si TOUTES le sont, rien
// ne bouge — on ne lève pas une protection à l'aveugle.
// `aveugle` (2026-10-13) : la télémétrie touche son plafond global, les lots
// légitimes sont refusés et les mesures BAISSENT sans que la charge baisse —
// alors on peut monter, pas descendre… pendant 2 h au plus (`aveugleMaxMs`) :
// un flot anonyme sature la télémétrie à volonté, il ne doit pas pouvoir
// tenir la production ralentie sans fin. Le voyant « veille aveugle » du
// verdict (même mesure, mesureAveugle) prévient le pilote, qui peut lever le
// délestage d'un toucher.
// ⚠️ DEUX MESURES, AUCUNE FALSIFIABLE À BON MARCHÉ PAR UN CLIENT. La télémétrie
// s'écrit depuis n'importe quel navigateur, clé anon comprise : compter des
// LIGNES en panne, ou des `device_id`, donnerait à un seul compte malveillant
// le levier de ralentir toute la production. On compte donc des COMPTES
// DISTINCTS par `auth_uid` — l'identité que le trigger serveur pose depuis le
// jeton (ASTRA-06), jamais celle que le client écrit :
//   · `pctConnexions` = comptes distincts actifs sur 5 min / 500 ;
//   · `comptes5xx15`  = comptes distincts ayant reçu une réponse ≥ 500 en 15 min,
//     comptes de PLUS DE 7 JOURS seulement, e-mail confirmé (pilotage_audience,
//     contre-revue du 2026-10-13 : dix comptes neufs forgeant une ligne « 503 »
//     délestaient toute la production). Les connexions restent la charge brute :
//     les forger exige des centaines de comptes actifs, la charge même. Un
//     délestage posé à tort se lève d'un toucher (le pilote gagne toujours).
export const SEUILS_DELESTAGE = Object.freeze({
  monter: { 2: { pctConnexions: 95, comptes5xx15: 40 }, 1: { pctConnexions: 80, comptes5xx15: 10 } },
  descendre: { 2: { pctConnexions: 85, comptes5xx15: 20 }, 1: { pctConnexions: 70, comptes5xx15: 4 } },
  tenueMs: 30 * 60e3,
  aveugleMaxMs: 2 * 3600e3,
});

const fini = (x) => typeof x === "number" && Number.isFinite(x);

export function decideDelestage(actuel, mesures, maintenant = Date.now()) {
  const niveauActuel = actuel && Object.hasOwn(FACTEURS_DELESTAGE, actuel.niveau) ? actuel.niveau : 0;
  const reste = { niveau: niveauActuel, changer: false, motif: null };
  if (actuel && actuel.pose_par === "pilote") return reste;
  const m = mesures || {};
  const pct = fini(m.pctConnexions) ? m.pctConnexions : null;
  const e5 = fini(m.comptes5xx15) ? m.comptes5xx15 : null;
  if (pct == null && e5 == null) return reste;

  const depasse = (s) => (pct != null && pct >= s.pctConnexions) || (e5 != null && e5 >= s.comptes5xx15);
  const raison = (s) => [
    pct != null && pct >= s.pctConnexions ? `connexions temps réel à ${pct} %` : null,
    e5 != null && e5 >= s.comptes5xx15 ? `${e5} comptes touchés par des pannes serveur en 15 min` : null,
  ].filter(Boolean).join(" · ");

  let cible = 0;
  if (depasse(SEUILS_DELESTAGE.monter[2])) cible = 2;
  else if (depasse(SEUILS_DELESTAGE.monter[1])) cible = 1;
  if (cible > niveauActuel) {
    return { niveau: cible, changer: true, motif: "Délestage automatique : " + raison(SEUILS_DELESTAGE.monter[cible]) };
  }
  if (niveauActuel === 0) return reste;

  const s = SEUILS_DELESTAGE.descendre[niveauActuel];
  const depuis = actuel && actuel.maj ? Date.parse(actuel.maj) : NaN;
  if (m.aveugle === true && !(Number.isFinite(depuis) && maintenant - depuis >= SEUILS_DELESTAGE.aveugleMaxMs)) return reste;
  const sous = (pct == null || pct < s.pctConnexions) && (e5 == null || e5 < s.comptes5xx15);
  const tenu = Number.isFinite(depuis) && maintenant - depuis >= SEUILS_DELESTAGE.tenueMs;
  if (sous && tenu) {
    const n = niveauActuel - 1;
    return { niveau: n, changer: true, motif: n === 0 ? "Fin du délestage : la charge est redescendue." : "Délestage allégé : la charge redescend." };
  }
  return reste;
}

/** Les réglages lus en base, rendus au téléphone (le motif reste côté pilote). */
export function resumerReglages(lignes) {
  const out = { delestage: { niveau: 0, pose_par: null, maj: null, motif: null }, coupures: { cles: [], maj: null }, bandeau: null };
  for (const l of lignes || []) {
    if (!l || !CLES_REGLAGES.includes(l.cle)) continue;
    const n = normaliserReglage(l.cle, l.valeur);
    if (n.erreur) continue;
    if (l.cle === "delestage") out.delestage = { niveau: n.valeur.niveau, pose_par: l.pose_par || null, maj: l.maj || null, motif: l.motif || null };
    else if (l.cle === "coupures") out.coupures = { cles: n.valeur.cles, maj: l.maj || null };
    else out.bandeau = { ...n.valeur, maj: l.maj || null };
  }
  return out;
}
