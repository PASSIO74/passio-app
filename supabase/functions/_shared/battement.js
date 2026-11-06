// ═══════════════════════════════════════════════════════════════════════════
// LE BATTEMENT DE LA VEILLE — une preuve de TRAVAIL, pas seulement de vie
// (2026-11-06, consigne §13)
//
// La veille `pilotage` (pg_cron, toutes les 5 min) est ce qui fait sonner le
// téléphone. Si elle s'arrête, plus rien ne sonne — et le silence ressemble
// exactement au calme. Le canari (`sentinel_observation_canary`) prouvait que
// la chaîne d'INGESTION marche ; il ne prouvait pas que la veille avait LU ses
// sources, JUGÉ le voyant et PRIS ses décisions : un processus vivant peut être
// bloqué. Le battement est écrit À LA FIN d'une veille, au plus une fois par
// quart d'heure, et dit ce qu'elle a réellement fait :
//   · chaque source lue ou non (santé, signalements, GitHub, parcours…) ;
//   · le voyant obtenu, si elle a sonné ;
//   · la décision de chaque geste automatique et la raison d'un refus ;
//   · la politique d'automatisation en vigueur et sa validité.
// Il vit dans `analytics_events` (user_id `systeme:pilotage`), écrit par la
// clé service_role : un navigateur ne peut pas le forger (RLS), contrairement
// au canari qui emprunte volontairement le chemin public.
//
// Trois lecteurs, une seule règle (`resumerBattement`) :
//   · le téléphone (fonction `pilotage`, action `etat`) — « Santé de la veille » ;
//   · la veille de production (GitHub, `scripts/veille-production.mjs`) — le
//     CHIEN DE GARDE EXTÉRIEUR : un autre fournisseur, un autre ordonnanceur,
//     un autre canal d'alerte (issue [VEILLE], e-mail de GitHub) ;
//   · les bancs (tests/unit/battement.test.mjs).
// Distinctions de la consigne : liveness (le battement existe), readiness
// (ses lectures ont abouti), santé fonctionnelle (voyant, parcours), fraîcheur
// (âge du dernier battement). Un battement absent ou périmé n'est JAMAIS sain.
// ═══════════════════════════════════════════════════════════════════════════

export const BATTEMENT = "pilotage_battement";
export const AUTEUR_BATTEMENT = "systeme:pilotage";
export const BATTEMENT_TOUTES_MS = 14 * 60e3;   // au plus un par quart d'heure (pg_cron : 5 min)
export const BATTEMENT_PERIME_MS = 35 * 60e3;   // deux battements manqués et une marge
export const BATTEMENTS_ATTENDUS_24H = 96;
// Les lectures dont dépend le voyant : l'une manque, la veille est « incomplète ».
export const LECTURES_BATTEMENT = Object.freeze(["sante", "signalements", "github", "parcours"]);

const etatLecture = (r) => (r && r.status === "fulfilled" ? "ok" : "ko");
const court = (x, n = 80) => String(x == null ? "" : x).replace(/[\u0000-\u001f]/g, " ").slice(0, n);

/**
 * Le contenu d'un battement, à partir de ce que la veille a fait. PUR.
 * `lectures` : { nom → PromiseSettledResult } ; `gestes` : { nom → résultat d'étape }.
 */
export function contenuBattement({ lectures = {}, verdict = null, sonne = false, gestes = {}, politique = null, parcours = null, revision = "dev", dureeMs = null } = {}) {
  const l = {};
  for (const [k, r] of Object.entries(lectures)) l[k] = etatLecture(r);
  const g = {};
  for (const [k, v] of Object.entries(gestes)) {
    if (!v || typeof v !== "object") { g[k] = "inconnu"; continue; }
    if (v.erreur) g[k] = "erreur:" + court(v.erreur, 60);
    else if (v.lance || v.propose || v.emis || v.ecrit || v.changer) g[k] = "fait";
    else if ("niveau" in v) g[k] = "niveau:" + Number(v.niveau || 0);
    else g[k] = court(v.raison || (v.inactif ? "inactif" : "rien"), 60);
  }
  const p = parcours && Array.isArray(parcours.parcours) ? parcours.parcours : [];
  return {
    revision: court(revision, 40),
    dureeMs: Number.isFinite(dureeMs) ? Math.round(dureeMs) : null,
    lectures: l,
    voyant: verdict && verdict.couleur ? court(verdict.couleur, 10) : null,
    sonne: !!sonne,
    gestes: g,
    politique: politique ? { version: politique.version, mode: court(politique.mode, 20), valide: !!politique.valide } : null,
    parcours: { panne: p.filter((x) => x.etat === "panne").length, degrade: p.filter((x) => x.etat === "degrade").length,
      juges: p.reduce((s, x) => s + (Number(x.juges) || 0), 0), tronque: !!(parcours && parcours.tronque) },
  };
}

const t = (v) => {
  if (v == null || v === "") return NaN;
  let s = String(v).trim().replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  return Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(s) ? s : s + "Z");
};

/**
 * Le battement le plus récent → ce qu'un lecteur doit en conclure. PUR.
 * `ligne` = { properties, created_at } ou null ; `n24` = battements sur 24 h (ou null).
 * etat : « jamais » | « arrete » (périmé) | « incomplet » (une lecture du voyant
 * a échoué, ou la politique est invalide) | « vivant ».
 */
export function resumerBattement(ligne, n24 = null, maintenant = Date.now()) {
  const regularite = Number.isFinite(n24) ? { battements24h: n24, attendus24h: BATTEMENTS_ATTENDUS_24H } : null;
  if (!ligne) return { etat: "jamais", le: null, ageMs: null, frais: false, lecturesKo: [], raisons: ["aucun battement de la veille : elle n'a jamais tourné jusqu'au bout depuis ce lot"], ...regularite };
  const le = t(ligne.created_at);
  const ageMs = Number.isFinite(le) ? Math.max(0, maintenant - le) : null;
  const p = ligne.properties && typeof ligne.properties === "object" ? ligne.properties : {};
  const lectures = p.lectures && typeof p.lectures === "object" ? p.lectures : {};
  const lecturesKo = LECTURES_BATTEMENT.filter((k) => lectures[k] !== "ok");
  const politiqueInvalide = !!(p.politique && p.politique.valide === false);
  const base = { le: Number.isFinite(le) ? new Date(le).toISOString() : null, ageMs, revision: p.revision || null, voyant: p.voyant || null, gestes: p.gestes || {}, parcours: p.parcours || null, politique: p.politique || null, lecturesKo, ...regularite };
  if (ageMs == null || ageMs > BATTEMENT_PERIME_MS) {
    const min = ageMs == null ? "?" : Math.round(ageMs / 60e3);
    return { ...base, etat: "arrete", frais: false, raisons: [`dernier battement il y a ${min} min : la veille ne tourne plus, les alertes du téléphone sont muettes`] };
  }
  const raisons = [];
  if (lecturesKo.length) raisons.push("la veille n'a pas pu lire : " + lecturesKo.join(", "));
  if (politiqueInvalide) raisons.push("politique d'automatisation invalide : aucun geste automatique");
  if (raisons.length) return { ...base, etat: "incomplet", frais: true, raisons };
  return { ...base, etat: "vivant", frais: true, raisons: [`battement il y a ${Math.round(ageMs / 60e3)} min, toutes les lectures abouties`] };
}
