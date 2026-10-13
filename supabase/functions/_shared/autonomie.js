// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMIE DE LA VEILLE — réveiller la Sentinelle, proposer de retirer un
// mauvais déploiement (2026-10-11, suite du plan docs/PASSIO_100K_AUTONOMIE.md ;
// revu le 2026-10-13 après contre-revue adversariale)
//
// La veille `pilotage` tourne toutes les 5 min (pg_cron, tenu à la minute) ;
// la Sentinelle, elle, attend un cron GitHub servi 4 à 8 fois par jour. Deux
// décisions passent donc de « quand GitHub voudra bien » à « dans les 5 min » :
//
// ① RÉVEILLER LA SENTINELLE (`doitReveillerSentinelle`) : des échecs chez au
//    moins DEUX comptes anciens en 30 min, aucune enquête en cours, pas de
//    pause, pas de run récent → `workflow_dispatch` de sentinelle-autonome.yml.
//    Le réveil ne décide rien d'autre : le détecteur garde ses propres filtres
//    (comptes identifiés, dédup, une enquête à la fois, auto-fusion bornée).
//
// ② PROPOSER DE RETIRER UN MAUVAIS DÉPLOIEMENT (`decideRetour`) : dans les
//    90 min qui suivent une mise en ligne, une famille d'échec NOUVELLE — vue
//    chez moins de deux comptes anciens sur une autre version dans les 24 h —
//    chez au moins CINQ comptes anciens → une issue `humain` est ouverte et le
//    téléphone sonne ; le pilote VOIT la version qui sera remise, puis la remet
//    d'un toucher (POST /deploys/<id>/restore, mesuré à 2 s le 14/09). Il faut
//    le secret PILOTAGE_NETLIFY_TOKEN.
//    ⚠️ JAMAIS DE RETRAIT AUTOMATIQUE (deux revues de sécurité du 2026-10-12) :
//    le déclencheur est de la télémétrie écrite par des navigateurs. Un retrait
//    automatique laisserait quiconque contrôle quelques comptes anciens retirer
//    la version servie — y compris un CORRECTIF DE SÉCURITÉ, et rouvrir la
//    faille qu'il fermait. La machine détecte et prévient ; un humain confirme.
//
// ⚠️ CE QUI DÉCIDE SE COMPTE EN BASE (contre-revue du 2026-10-13) : comptes
// DISTINCTS par `auth_uid` (identité posée par le trigger serveur), créés
// depuis 24 h (réveil) ou 7 jours avant la mise en ligne (proposition), e-mail
// confirmé, pas anonymes — `pilotage_audience` et `pilotage_familles_erreurs`
// (migrations/migration_reglages_distants_2026-10-11.sql). Le premier jet
// comptait dans une page de 1 000 lignes : un seul appareil en boucle la
// remplissait, et des comptes neufs décidaient de ce qui était examiné.
// ⚠️ AUCUN TEXTE CLIENT NE SORT VERS GITHUB : l'issue et la notification portent
// des nombres, une version et une empreinte — jamais le message d'erreur, qui
// est écrit par le navigateur et serait lu par un agent. Le pilote, lui, le
// voit (rendu en texte, jamais en HTML).
// Ce fichier ne fait AUCUN appel réseau ; tests/unit/autonomie.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════

// Les fenêtres et anciennetés du réveil et de la proposition sont écrites dans
// la migration (SQL) ; ces constantes les DISENT, et le verrou ⑫ vérifie que
// les deux disent la même chose.
export const REVEIL = Object.freeze({ comptesMin: 2, fenetreMs: 30 * 60e3, runRecentMs: 45 * 60e3, ancienneteMinMs: 24 * 3600e3, parJour: 12 });
// `entreDeuxGestesMs` : un double appui retirerait DEUX versions (le second lit
// la version remise comme courante) — un geste réussi ferme le bouton 10 min.
// `exclusionMs` : une version retirée ne revient jamais par ce bouton dans les
// 24 h (un retour puis un redéploiement ne doit pas remettre la version cassée).
export const RETOUR = Object.freeze({
  comptesMin: 5, vuAilleursMin: 2, apresDeploiementMaxMs: 90 * 60e3, recuperationMs: 6 * 3600e3,
  ancienneteMinMs: 7 * 864e5, entreDeuxGestesMs: 10 * 60e3, exclusionMs: 864e5, parPage: 30, pagesMax: 10,
});

// Les marques écrites dans `analytics_events` (user_id "systeme:pilotage") :
// une SEULE orthographe, lue et écrite par les mêmes constantes (verrou ⑪).
export const EVT = Object.freeze({
  reveil: "sentinelle_reveil", propose: "retour_propose", manuel: "retour_manuel",
  echec: "retour_echec", incertain: "retour_incertain",
});

/**
 * Le mode du retour arrière : `inactif` sans jeton Netlify, `proposer` avec.
 * Il n'existe PAS de mode automatique (voir ② en tête).
 */
export function modeRetour(jetonNetlify) {
  return jetonNetlify ? "proposer" : "inactif";
}

/** Le réveil a-t-il déjà servi son quota du jour ? (`reveils24h` lu en base ; illisible = épuisé) */
export function reveilsEpuises(reveils24h) {
  return !Number.isFinite(reveils24h) || reveils24h >= REVEIL.parJour;
}

const t = (v) => (v == null ? NaN : Date.parse(String(v)));

/** Enquêtes Sentinelle EN COURS : issue (pas PR) `sentinelle`, pas rendue à l'humain. */
export function enquetesEnCours(issues) {
  return (Array.isArray(issues) ? issues : []).filter((i) => i && !i.pr && Array.isArray(i.labels)
    && i.labels.includes("sentinelle") && !i.labels.includes("humain")).length;
}

/**
 * Faut-il lancer la Sentinelle maintenant ? `dernierRun` = resumerRun() du
 * dernier sentinelle-autonome.yml sur main ({ etat, conclusion, le }) ;
 * `comptesErreurs` = `comptes_echecs_30min` de pilotage_audience (NULL = pas
 * de mesure = on ne réveille pas). Rend { reveiller, raison }.
 */
export function doitReveillerSentinelle({ pause, enquetes, dernierRun, comptesErreurs, maintenant = Date.now() } = {}) {
  if (pause) return { reveiller: false, raison: "pause" };
  if (!Number.isFinite(comptesErreurs) || comptesErreurs < REVEIL.comptesMin) return { reveiller: false, raison: "calme" };
  if (!Number.isFinite(enquetes) || enquetes > 0) return { reveiller: false, raison: "enquete_en_cours" };
  if (dernierRun && dernierRun.etat && dernierRun.etat !== "completed") return { reveiller: false, raison: "run_en_cours" };
  const le = t(dernierRun && dernierRun.le);
  if (Number.isFinite(le) && maintenant - le < REVEIL.runRecentMs) return { reveiller: false, raison: "run_recent" };
  return { reveiller: true, raison: `${comptesErreurs} comptes en échec en 30 min, aucune enquête en cours` };
}

/** Empreinte courte et stable d'un texte (FNV-1a 32 bits) : ce qui sort à la place du texte. */
export function empreinte(message) {
  let h = 0x811c9dc5;
  const s = String(message || "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

const entier = (x) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : NaN);

/**
 * Faut-il proposer de retirer la version servie ? `familles` = lignes de
 * pilotage_familles_erreurs : { famille, comptes, n, comptes_ailleurs } — des
 * comptes ANCIENS distincts, comptés en base. Une famille est NOUVELLE si moins
 * de RETOUR.vuAilleursMin comptes anciens l'ont eue sur une autre version dans
 * les 24 h (une ligne anonyme ou un compte neuf ne la rend jamais « déjà vue »).
 * Une valeur illisible n'est jamais une nouveauté. `dernier` : dernière
 * proposition { version, le } ou null. Toutes les familles sont examinées :
 * une régression partielle ne se cache pas derrière le bruit de fond.
 */
export function decideRetour({ actif, version, deployeA, familles, dernier, maintenant = Date.now() } = {}) {
  const non = (raison) => ({ retour: false, raison });
  if (!actif) return non("inactif");
  if (typeof version !== "string" || !/^[0-9a-f]{7,40}$/.test(version)) return non("version_inconnue");
  const dep = t(deployeA);
  if (!Number.isFinite(dep) || maintenant - dep < 0) return non("deploiement_inconnu");
  if (maintenant - dep > RETOUR.apresDeploiementMaxMs) return non("hors_fenetre");
  if (dernier && dernier.version === version) return non("deja_proposee");
  const der = t(dernier && dernier.le);
  if (Number.isFinite(der) && maintenant - der < RETOUR.recuperationMs) return non("recuperation");
  for (const f of Array.isArray(familles) ? familles : []) {
    if (!f || typeof f.famille !== "string" || !f.famille) continue;
    const comptes = entier(f.comptes), ailleurs = entier(f.comptes_ailleurs);
    if (!(comptes >= RETOUR.comptesMin)) continue;
    if (!(ailleurs < RETOUR.vuAilleursMin)) continue;   // déjà vue, ou illisible : pas une régression de CETTE version
    return { retour: true, raison: "erreur_nouvelle", cle: f.famille,
      famille: { empreinte: empreinte(f.famille), comptes, n: entier(f.n) || 0 } };
  }
  return non("aucune_erreur_nouvelle");
}

/** Les déploiements de production PRÊTS (même filtre que scripts/rollback-selection.mjs). */
export function deploiementsProduction(liste) {
  return (Array.isArray(liste) ? liste : []).filter((d) => d && d.context === "production" && d.state === "ready");
}

/**
 * Le déploiement de production à remettre : le premier qui SUIT le courant
 * (du plus récent au plus ancien) et n'a pas été retiré dans les 24 h
 * (`exclus` : identifiants de déploiements). Même contrat que
 * scripts/rollback-selection.mjs quand rien n'est exclu (ASTRA-19 : jamais
 * « le premier de la liste » si le courant n'y est pas).
 */
export function choisirPrecedent(liste, courant, exclus = new Set()) {
  const prods = deploiementsProduction(liste);
  if (!courant) return { erreur: "courant_inconnu" };
  const i = prods.findIndex((d) => d.id === courant);
  if (i === -1) return { erreur: "courant_absent" };
  const ex = exclus instanceof Set ? exclus : new Set();
  const prev = prods.slice(i + 1).find((d) => !ex.has(d.id));
  if (!prev) return { erreur: "aucun_precedent" };
  return { cible: prev.id };
}

/**
 * Faut-il lire une page de plus ? Oui tant que la page était pleine et que la
 * cible n'est pas trouvable : courant pas encore vu, ou aucun déploiement non
 * exclu derrière lui. Sans exclusion, c'est continuerPagination de
 * scripts/rollback-selection.mjs (verrou ⑥).
 */
export function continuerPagination(page, taillePage, cumul, courant, exclus = new Set()) {
  if (!page || page.length < taillePage) return false;
  if (!courant) return true;
  const i = cumul.findIndex((d) => d && d.id === courant);
  if (i === -1) return true;
  const ex = exclus instanceof Set ? exclus : new Set();
  return !cumul.slice(i + 1).some((d) => d && !ex.has(d.id));
}

/**
 * Identifiant d'un geste : un uuid (v8, RFC 9562) tiré d'un HMAC-SHA-256 de
 * `cle` sous un SECRET SERVEUR. Deux passages concurrents du même geste
 * écrivent la même clé primaire dans `analytics_events` ; la base refuse le
 * second (23505) — la seule exclusion mutuelle qui tienne entre deux isolats.
 * ⚠️ Sans secret, la clé se calcule depuis le dépôt (public) : un compte
 * quelconque, qui peut insérer dans `analytics_events` une ligne dont il
 * choisit l'`id`, pré-occupait la clé et neutralisait le bouton du pilote et
 * toute proposition (contre-revue du 2026-10-13). Pas de secret = pas de geste.
 */
export async function idGeste(cle, secret) {
  if (typeof secret !== "string" || secret.length < 16) throw new Error("idGeste : secret serveur absent");
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const o = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(String(cle))));
  o[6] = (o[6] & 0x0f) | 0x80;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Un commit court et sûr à afficher ou à recopier (8 hex), sinon « ? ». */
export function commitCourt(v) {
  return typeof v === "string" && /^[0-9a-f]{7,40}$/.test(v) ? v.slice(0, 8) : "?";
}

export const TITRE_PROPOSITION = "[RETOUR ARRIÈRE PROPOSÉ]";

/** Corps de l'issue : des nombres et des identifiants vérifiés, aucun texte client. */
export function corpsProposition({ version, famille, deployeA }) {
  return [
    `La version **${commitCourt(version)}**, mise en ligne le ${String(deployeA || "?").slice(0, 16).replace("T", " ").replace(/[^0-9: ?-]/g, "")} UTC, provoque un échec **nouveau**`,
    `(empreinte \`${String(famille && famille.empreinte || "?").replace(/[^0-9a-f]/g, "")}\`, vu chez moins de deux comptes sur une autre version dans les 24 h) chez **${Number(famille && famille.comptes) || 0} comptes** existant depuis plus de 7 jours.`,
    "",
    "## Ce que tu fais",
    "- Pilotage › Capacité : lis l'échec, puis « Remettre la version précédente » — le pilotage te montre la version qui sera remise avant que tu confirmes.",
    "- Ou laisse faire : la Sentinelle verra le même échec et ouvrira son enquête ; le correctif suivra.",
    "- ⚠️ Le prochain déploiement de `main` remettra le code retiré tant que le correctif n'y est pas.",
    "",
    "_Ouvert par la veille du pilotage (retour arrière proposé, jamais automatique)._",
  ].join("\n");
}
