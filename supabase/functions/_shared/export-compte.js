// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DES DONNÉES D'UN COMPTE (EXP-08, portabilité RGPD art. 20, 2026-09-14)
//
// Partagé entre l'Edge Function `export-account` (Deno) et
// `tests/unit/export-compte.test.mjs` (Node) : un seul fichier, aucun
// transpileur — même règle que `purge-compte.js`.
//
// CE QU'ON EXPORTE : ce que la personne a FOURNI ou qui la concerne
// directement — ses publications, commentaires, stories, rencontres,
// inscriptions, messages ENVOYÉS, notifications REÇUES, abonnements SUIVIS,
// blocages POSÉS, état, passions, profil, identité Auth (e-mail, dates).
// CE QU'ON N'EXPORTE PAS : ce que d'AUTRES ont écrit à son sujet (qui la
// suit, qui l'a bloquée, notifications qu'elle a causées chez autrui, ajouts
// par un tiers) — ce sont les données de ces tiers ; ni les traces techniques
// (client_errors, analytics, telemetry : anonymes ou purgées à 7 j, sans
// intérêt de portabilité). Les MÉDIAS sont listés par chemin, avec l'URL
// publique pour le seau `content` — pas d'octets dans le JSON.
// ═══════════════════════════════════════════════════════════════════════════
import { TABLES_COMPTE, DOSSIERS_CONTENU } from "./purge-compte.js";

/** Couples (table, colonne) à ÉCARTER : données d'autrui ou traces techniques. */
export const EXCLUS_EXPORT = new Set([
  "notifications.from_id", "follows.following_id", "blocks.blocked_id", "post_collaborators.added_by",
  "client_errors.uid", "client_errors.auth_uid", "analytics_events.user_id", "telemetry_events.user_id", "telemetry_events.auth_uid",
  // ⚠️ ASTRA-27 : l'« autre bout » d'un lien n'est pas MA donnée. `added_by`
  // dit qui m'a ajouté (comme `post_collaborators.added_by`) ; `call_invites.to_id`
  // reste EXPORTÉ, lui, car une invitation reçue est un fait qui me concerne —
  // même raisonnement que `notifications.user_id`, exporté, contre
  // `notifications.from_id`, exclu.
  "cdv_live_collaborators.added_by",
]);

/** Les couples (table, colonne) exportés, dérivés de la liste de purge. */
export function tablesExport() {
  return TABLES_COMPTE.filter(([t, c]) => !EXCLUS_EXPORT.has(t + "." + c));
}

export const PAGE = 1000;
export const PLAFOND_PAR_TABLE = 5000;

// ⚠️ ASTRA-14 (contre-revue Astra, 2026-09-15) : L'INCOMPLÉTUDE SE DIT, TOUJOURS.
// La version du 14/09 avait deux silences : sans colonne `created_at`, le chemin
// de repli atteignait le plafond de 5 000 lignes SANS poser `tronque` (le
// contrôle ne vivait que sur le chemin ordonné) ; et le listing Storage
// avalait ses erreurs et s'arrêtait à 1 000 objets. Désormais : un seul
// chemin de pagination, un ORDRE stable (`created_at`, sinon `id`, sinon
// aucun — et l'export le dit), la troncature posée dès qu'une page pleine
// touche le plafond, les erreurs de listing nommées, le listing paginé, et un
// BILAN en tête du fichier que le client affiche au téléchargement.
// ⚠️ ASTRA-28 (quatrième contre-revue, 15/09/2026) — L'EXPORT SE DISAIT ENCORE
// COMPLET SANS ORDRE TOTAL, ET SANS SAVOIR S'IL AVAIT TOUT PRIS.
//
// Deux défauts, mesurés :
//   ① `created_at` SEUL n'est pas un ordre : deux lignes de même date sont
//      départagées par le plan, pas par la requête. Avec une pagination par
//      `range()`, deux pages de dates égales rendaient 1 001 lignes dont
//      1 000 identifiants distincts — un doublon, donc un identifiant OMIS —
//      et le bilan disait `complet: true` ;
//   ② `tables_sans_ordre_stable` était CALCULÉ, RAPPORTÉ… et n'entrait PAS
//      dans `bilan.complet`. Une table lue sans aucun ordre, donc paginée au
//      hasard, sortait « complète ».
//
// LA RÉPONSE : un ORDRE TOTAL (`created_at` PUIS `id`, l'identifiant étant
// unique), un COMPTE EXACT demandé au serveur, et une détection de doublons.
// « Autant de lignes que le serveur en annonce, toutes distinctes » est la
// seule façon honnête de dire qu'on a tout pris. Sans ordre total, on ne le
// dit pas : la table est nommée et le bilan n'est plus complet.
// Référence : https://www.postgresql.org/docs/current/queries-limit.html
async function lirePage(admin, table, col, uid, cles, debut, veutCompte) {
  let q = admin.from(table).select("*", veutCompte ? { count: "exact" } : undefined).eq(col, uid);
  for (const c of cles) q = q.order(c, { ascending: true, nullsFirst: true });
  return q.range(debut, debut + PAGE - 1);
}
// Les clés d'ordre, de la plus complète à la moins : on DESCEND d'un cran quand
// une colonne n'existe pas, et on relit la MÊME page — jamais une page sautée,
// jamais un ordre changé en route.
const ECHELLE_ORDRE = [["created_at", "id"], ["id"], []];
function colonneAbsente(message, cles) {
  const m = String(message || "");
  return cles.some((c) => c && new RegExp("\\b" + c + "\\b").test(m)) && /does not exist|unknown|could not find/i.test(m);
}
async function lireTable(admin, table, col, uid) {
  const lignes = [];
  let niveau = 0;
  let debut = 0;
  let attendu = null;
  const vus = new Set();
  let doublons = 0;
  for (;;) {
    let r = await lirePage(admin, table, col, uid, ECHELLE_ORDRE[niveau], debut, debut === 0);
    while (r.error && niveau < ECHELLE_ORDRE.length - 1 && colonneAbsente(r.error.message, ECHELLE_ORDRE[niveau])) {
      niveau++;
      r = await lirePage(admin, table, col, uid, ECHELLE_ORDRE[niveau], debut, debut === 0);
    }
    const ordre = ECHELLE_ORDRE[niveau].join(",") || null;
    // ⚠️ « TOTAL » veut dire « sans ex æquo possible » : seul un ordre qui se
    // termine par l'identifiant unique l'est. `created_at` seul ne l'est pas.
    const ordreTotal = ECHELLE_ORDRE[niveau][ECHELLE_ORDRE[niveau].length - 1] === "id";
    if (r.error) return { lignes, erreur: r.error.message, tronque: false, ordre, ordreTotal, attendu, doublons, incoherence: null };
    if (debut === 0 && typeof r.count === "number") attendu = r.count;
    const page = r.data || [];
    for (const l of page) {
      const cle = l && l.id != null ? String(l.id) : null;
      if (cle !== null) { if (vus.has(cle)) doublons++; else vus.add(cle); }
      lignes.push(l);
    }
    const fini = page.length < PAGE;
    const plafond = lignes.length >= PLAFOND_PAR_TABLE;
    if (fini || plafond) {
      const gardees = plafond ? lignes.slice(0, PLAFOND_PAR_TABLE) : lignes;
      // ⚠️ LA SEULE PREUVE D'EXHAUSTIVITÉ QU'ON PUISSE DONNER : autant de lignes
      // que le serveur en annonce, et toutes distinctes. Une différence peut
      // venir d'une écriture concurrente ; elle reste une INCOHÉRENCE, pas un
      // détail — on ne peut pas jurer avoir tout pris.
      let incoherence = null;
      if (doublons) incoherence = doublons + " ligne(s) rendue(s) deux fois — pagination instable";
      else if (!plafond && attendu != null && gardees.length !== attendu) incoherence = "le serveur annonce " + attendu + " ligne(s), " + gardees.length + " obtenue(s)";
      return { lignes: gardees, erreur: null, tronque: plafond, ordre, ordreTotal, attendu, doublons, incoherence };
    }
    debut += PAGE;
  }
}

/** Liste COMPLÈTE d'un préfixe (paginée) ; une erreur est rendue, jamais avalée. */
async function listerDossier(admin, seau, prefixe) {
  const chemins = [];
  try {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(seau).list(prefixe, { limit: 1000, offset });
      if (error) return { chemins, erreur: error.message || "list" };
      const page = (data || []).filter((o) => o && o.name).map((o) => prefixe + "/" + o.name);
      chemins.push(...page);
      if (page.length < 1000) return { chemins, erreur: null };
    }
  } catch (e) { return { chemins, erreur: (e && e.message) || "exception" }; }
}

/**
 * Rassemble tout ce qui appartient au compte `uid` en un objet JSON.
 * Ne lève jamais : les tables illisibles sont nommées dans `erreurs`.
 */
export async function exporterCompte(admin, uid, identite) {
  const tables = {};
  const erreurs = [];
  const tronquees = [];
  const sansOrdre = [];
  const incoherences = [];
  const raisonsOrdre = {};
  for (const [table, col] of tablesExport()) {
    const { lignes, erreur, tronque, ordre, ordreTotal, incoherence } = await lireTable(admin, table, col, uid);
    if (erreur) { erreurs.push(table + "." + col + " : " + erreur); continue; }
    const cle = table + (col === "id" || col === "user_id" || col === "author_id" || col === "from_id" || col === "follower_id" || col === "blocker_id" ? "" : " (" + col + ")");
    tables[cle] = (tables[cle] || []).concat(lignes);
    if (tronque) tronquees.push(cle);
    // ⚠️ ASTRA-28 : « sans ordre STABLE » veut dire « sans ordre TOTAL ». Une
    // table lue sur `created_at` seul est ordonnée et pourtant paginée au
    // hasard dès qu'il y a des ex æquo : elle compte ici, comme celle qui n'a
    // aucun ordre. Et ce n'est signalé que si la pagination a réellement eu
    // lieu (une seule page ne peut pas se mélanger).
    // Le NOM de la table reste nu — c'est ce que le client affiche et ce que
    // les verrous comparent ; la raison vit à côté, elle ne le pollue pas.
    if (!ordreTotal && lignes.length >= PAGE) { sansOrdre.push(cle); raisonsOrdre[cle] = ordre ? "ordre « " + ordre + " », non total (ex æquo possibles)" : "aucun ordre"; }
    if (incoherence) incoherences.push(cle + " : " + incoherence);
  }
  const medias = [];
  for (const dossier of DOSSIERS_CONTENU) {
    const l = await listerDossier(admin, "content", dossier + "/" + uid);
    if (l.erreur) erreurs.push("content/" + dossier + " : " + l.erreur);
    for (const chemin of l.chemins) {
      let url = null;
      try { url = admin.storage.from("content").getPublicUrl(chemin).data.publicUrl; } catch (e) {}
      medias.push({ seau: "content", chemin, url });
    }
  }
  // Le BILAN, en tête : complet ou non, et pourquoi. Le client l'affiche.
  const bilan = {
    // ⚠️ ASTRA-28 : `tables_sans_ordre_stable` était calculé, rapporté… et
    // n'entrait PAS dans `complet`. Une table paginée au hasard sortait donc
    // « complète ». Un état non vérifié n'est jamais annoncé complet.
    complet: erreurs.length === 0 && tronquees.length === 0 && sansOrdre.length === 0 && incoherences.length === 0,
    tables_exportees: Object.keys(tables).length,
    lignes: Object.values(tables).reduce((n, l) => n + l.length, 0),
    medias: medias.length,
    tables_tronquees: tronquees.slice(),
    tables_sans_ordre_stable: sansOrdre.slice(),
    incoherences_de_pagination: incoherences.slice(),
    raisons_ordre_non_total: { ...raisonsOrdre },
    erreurs: erreurs.slice(),
    plafond_par_table: PLAFOND_PAR_TABLE,
  };
  return {
    format: "passio-export/1",
    genere_le: new Date().toISOString(),
    bilan,
    compte: identite || null,
    tables,
    medias,
    tronquees,
    erreurs,
  };
}
