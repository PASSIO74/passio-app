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
]);

/** Les couples (table, colonne) exportés, dérivés de la liste de purge. */
export function tablesExport() {
  return TABLES_COMPTE.filter(([t, c]) => !EXCLUS_EXPORT.has(t + "." + c));
}

export const PAGE = 1000;
export const PLAFOND_PAR_TABLE = 5000;

async function lireTable(admin, table, col, uid) {
  const lignes = [];
  let tronque = false;
  for (let debut = 0; debut < PLAFOND_PAR_TABLE; debut += PAGE) {
    const r = await admin.from(table).select("*").eq(col, uid).order("created_at", { ascending: true, nullsFirst: true }).range(debut, debut + PAGE - 1);
    if (r.error) {
      // Une colonne `created_at` absente : on relit sans ordre.
      if (/created_at/.test(String(r.error.message || ""))) {
        const r2 = await admin.from(table).select("*").eq(col, uid).range(debut, debut + PAGE - 1);
        if (r2.error) return { lignes, erreur: r2.error.message, tronque };
        lignes.push(...(r2.data || []));
        if ((r2.data || []).length < PAGE) break;
        continue;
      }
      return { lignes, erreur: r.error.message, tronque };
    }
    lignes.push(...(r.data || []));
    if ((r.data || []).length < PAGE) break;
    if (lignes.length >= PLAFOND_PAR_TABLE) { tronque = true; break; }
  }
  return { lignes, erreur: null, tronque };
}

async function listerDossier(admin, seau, prefixe) {
  try {
    const { data, error } = await admin.storage.from(seau).list(prefixe, { limit: 1000 });
    if (error || !data) return [];
    return data.filter((o) => o && o.name).map((o) => prefixe + "/" + o.name);
  } catch (e) { return []; }
}

/**
 * Rassemble tout ce qui appartient au compte `uid` en un objet JSON.
 * Ne lève jamais : les tables illisibles sont nommées dans `erreurs`.
 */
export async function exporterCompte(admin, uid, identite) {
  const tables = {};
  const erreurs = [];
  const tronquees = [];
  for (const [table, col] of tablesExport()) {
    const { lignes, erreur, tronque } = await lireTable(admin, table, col, uid);
    if (erreur) { erreurs.push(table + "." + col + " : " + erreur); continue; }
    const cle = table + (col === "id" || col === "user_id" || col === "author_id" || col === "from_id" || col === "follower_id" || col === "blocker_id" ? "" : " (" + col + ")");
    tables[cle] = (tables[cle] || []).concat(lignes);
    if (tronque) tronquees.push(cle);
  }
  const medias = [];
  for (const dossier of DOSSIERS_CONTENU) {
    for (const chemin of await listerDossier(admin, "content", dossier + "/" + uid)) {
      let url = null;
      try { url = admin.storage.from("content").getPublicUrl(chemin).data.publicUrl; } catch (e) {}
      medias.push({ seau: "content", chemin, url });
    }
  }
  return {
    format: "passio-export/1",
    genere_le: new Date().toISOString(),
    compte: identite || null,
    tables,
    medias,
    tronquees,
    erreurs,
  };
}
