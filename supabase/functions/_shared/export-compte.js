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
  "client_errors.uid", "client_errors.auth_uid", "analytics_events.user_id", "telemetry_events.user_id",
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
async function lirePage(admin, table, col, uid, ordre, debut) {
  let q = admin.from(table).select("*").eq(col, uid);
  if (ordre) q = q.order(ordre, { ascending: true, nullsFirst: true });
  return q.range(debut, debut + PAGE - 1);
}
async function lireTable(admin, table, col, uid) {
  const lignes = [];
  let ordre = "created_at";
  let debut = 0;
  for (;;) {
    let r = await lirePage(admin, table, col, uid, ordre, debut);
    // Colonne d'ordre absente : on descend d'un cran (`id`, puis aucun) et on
    // relit la MÊME page — jamais une page sautée, jamais un ordre changé en route.
    while (r.error && ordre && new RegExp(ordre).test(String(r.error.message || ""))) {
      ordre = ordre === "created_at" ? "id" : null;
      r = await lirePage(admin, table, col, uid, ordre, debut);
    }
    if (r.error) return { lignes, erreur: r.error.message, tronque: false, ordre };
    const page = r.data || [];
    lignes.push(...page);
    if (page.length < PAGE) return { lignes, erreur: null, tronque: false, ordre };
    debut += PAGE;
    // Une page PLEINE qui atteint le plafond : il en reste peut-être — tronqué.
    if (lignes.length >= PLAFOND_PAR_TABLE) return { lignes: lignes.slice(0, PLAFOND_PAR_TABLE), erreur: null, tronque: true, ordre };
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
  for (const [table, col] of tablesExport()) {
    const { lignes, erreur, tronque, ordre } = await lireTable(admin, table, col, uid);
    if (erreur) { erreurs.push(table + "." + col + " : " + erreur); continue; }
    const cle = table + (col === "id" || col === "user_id" || col === "author_id" || col === "from_id" || col === "follower_id" || col === "blocker_id" ? "" : " (" + col + ")");
    tables[cle] = (tables[cle] || []).concat(lignes);
    if (tronque) tronquees.push(cle);
    if (!ordre && lignes.length >= PAGE) sansOrdre.push(cle);
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
    complet: erreurs.length === 0 && tronquees.length === 0,
    tables_exportees: Object.keys(tables).length,
    lignes: Object.values(tables).reduce((n, l) => n + l.length, 0),
    medias: medias.length,
    tables_tronquees: tronquees.slice(),
    tables_sans_ordre_stable: sansOrdre.slice(),
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
