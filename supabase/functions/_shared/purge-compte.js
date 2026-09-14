// Purge VÉRIFIÉE d'un compte (AUTH-05 / SUP-10, contre-revue Astra, 2026-09-14).
// En .js comme `plafond.js` : Deno l'importe tel quel dans `delete-account`, et
// `node --test tests/unit/purge-compte.test.mjs` charge le MÊME fichier.
//
// CE QUI MANQUAIT. `delete-account` faisait quinze `delete()` « best-effort »
// SANS lire `{ error }` (le SDK ne lève pas), ne purgeait que trois dossiers
// du seau `content` (photos, videos, audios — pas avatars, covers, events,
// passion_*), jamais les pièces jointes de messagerie (`attachments/<conv>/…`),
// ignorait dix-sept tables qui portent l'identifiant du compte (user_state,
// blocks, conv_reads, comment_interactions, event_reactions, user_safety,
// passion_quotas, telemetry…), puis supprimait le compte Auth et rendait
// `ok: true`. Le client affichait « Compte supprimé » quoi qu'il arrive. La
// suppression du compte Auth ne prouvait donc pas celle de ses données.
//
// LA RÈGLE : on purge, on RELIT ce qui reste, et le compte Auth ne part que si
// rien ne reste. Un échec rend la liste des restes ; le compte reste ouvert et
// la suppression est RELANÇABLE (chaque geste est idempotent).

/** Tables qui portent l'identifiant du compte, et la colonne qui le porte. */
export const TABLES_COMPTE = [
  ["posts", "author_id"], ["post_likes", "user_id"], ["post_comments", "author_id"],
  ["post_collaborators", "user_id"], ["post_collaborators", "added_by"],
  ["comment_interactions", "user_id"], ["comment_likes", "user_id"],
  ["stories", "author_id"], ["story_views", "user_id"],
  ["events", "author_id"], ["event_attendees", "user_id"], ["event_comments", "author_id"], ["event_reactions", "user_id"],
  ["conv_messages", "from_id"], ["conv_members", "user_id"], ["conv_reads", "user_id"],
  ["notifications", "user_id"], ["notifications", "from_id"],
  ["follows", "follower_id"], ["follows", "following_id"],
  ["blocks", "blocker_id"], ["blocks", "blocked_id"],
  ["push_subscriptions", "user_id"], ["user_state", "user_id"], ["user_safety", "user_id"],
  ["user_passions", "user_id"], ["passion_quotas", "user_id"], ["passion_requests", "user_id"],
  ["step_interactions", "user_id"], ["video_lives", "author_id"],
  ["client_errors", "uid"], ["client_errors", "auth_uid"],
  ["analytics_events", "user_id"], ["telemetry_events", "user_id"],
  ["profiles", "id"],
];
// ⚠️ Volontairement HORS liste, et pourquoi :
//   · reports (reporter_id / target_id) : la trace de modération d'un tiers
//     ne disparaît pas avec le signaleur ; l'identifiant orphelin ne renvoie
//     plus à rien. Décision à confirmer côté juridique (art. 17 vs obligation
//     de traitement des signalements).
//   · passions.created_by / conversations.created_by / events.organizer_id :
//     des objets partagés qui survivent à leur créateur ; l'identifiant y est
//     orphelin, pas une donnée lisible.

/** Dossiers du seau `content` où le client dépose sous `<dossier>/<uid>/…`. */
export const DOSSIERS_CONTENU = ["photos", "videos", "audios", "events", "avatars", "covers", "passion_covers", "passion_photos"];

/**
 * Chemins des pièces jointes (seau `attachments`) portés par les messages du
 * compte : le nom d'objet ne contient pas l'auteur, seule la ligne
 * `conv_messages` le sait — il faut donc les relever AVANT de la supprimer.
 * Reconnaît les deux formes d'URL en base (Supabase et CDN).
 */
export function cheminsPiecesJointes(lignes) {
  const out = new Set();
  for (const l of lignes || []) {
    const c = l && l.content;
    if (typeof c !== "string" || c.charAt(0) !== "{") continue;
    let d; try { d = JSON.parse(c); } catch (_e) { continue; }
    const u = d && (d.url || d.fileUrl);
    if (typeof u !== "string") continue;
    const m = u.match(/\/(?:object\/(?:public|sign|authenticated)\/attachments|media\/attachments)\/([^?#]+)/);
    if (m && m[1]) out.add(decodeURIComponent(m[1]));
  }
  return Array.from(out);
}

async function supprimerLignes(admin, table, col, uid) {
  try {
    const r = await admin.from(table).delete().eq(col, uid);
    return r && r.error ? (r.error.message || "erreur") : null;
  } catch (e) { return (e && e.message) || "exception"; }
}

async function compterRestes(admin, table, col, uid) {
  try {
    const r = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, uid);
    if (r && r.error) return -1;                 // illisible : compte comme un reste
    return typeof r.count === "number" ? r.count : 0;
  } catch (_e) { return -1; }
}

async function purgerDossier(admin, seau, prefixe) {
  try {
    const { data, error } = await admin.storage.from(seau).list(prefixe, { limit: 1000 });
    if (error) return { erreur: error.message || "list", restes: -1 };
    const noms = (data || []).filter((f) => f && f.name).map((f) => `${prefixe}/${f.name}`);
    if (!noms.length) return { erreur: null, restes: 0 };
    const rm = await admin.storage.from(seau).remove(noms);
    if (rm && rm.error) return { erreur: rm.error.message || "remove", restes: noms.length };
    const relu = await admin.storage.from(seau).list(prefixe, { limit: 1000 });
    return { erreur: null, restes: relu && relu.data ? relu.data.length : 0 };
  } catch (e) { return { erreur: (e && e.message) || "exception", restes: -1 }; }
}

/**
 * Purge tout ce qui porte `uid`, puis RELIT. Rend `{ ok, echecs, restes }` :
 * `echecs` = gestes en erreur (nom lisible), `restes` = ce qui subsiste après
 * relecture (table:colonne=n, ou seau/prefixe=n). `ok` ⇔ les deux listes vides.
 */
export async function purgerCompte(admin, uid) {
  const echecs = [];
  const restes = [];

  // ① Relever les pièces jointes AVANT de supprimer les messages qui les portent.
  let pj = [];
  try {
    const r = await admin.from("conv_messages").select("content").eq("from_id", uid);
    if (r && r.error) echecs.push("conv_messages:lecture"); else pj = cheminsPiecesJointes(r.data);
  } catch (_e) { echecs.push("conv_messages:lecture"); }

  // ② Lignes, une table à la fois, chaque verdict lu.
  for (const [table, col] of TABLES_COMPTE) {
    const err = await supprimerLignes(admin, table, col, uid);
    if (err) echecs.push(`${table}:${col} (${err})`);
  }

  // ③ Médias : les huit dossiers du seau public, puis les pièces jointes relevées.
  for (const dossier of DOSSIERS_CONTENU) {
    const r = await purgerDossier(admin, "content", `${dossier}/${uid}`);
    if (r.erreur) echecs.push(`content/${dossier} (${r.erreur})`);
    if (r.restes) restes.push(`content/${dossier}/${uid}=${r.restes}`);
  }
  if (pj.length) {
    try {
      const rm = await admin.storage.from("attachments").remove(pj);
      if (rm && rm.error) echecs.push(`attachments (${rm.error.message || "remove"})`);
    } catch (e) { echecs.push(`attachments (${(e && e.message) || "exception"})`); }
  }

  // ④ Relecture : ce qui reste est nommé. Un compte illisible compte comme un reste.
  for (const [table, col] of TABLES_COMPTE) {
    const n = await compterRestes(admin, table, col, uid);
    if (n !== 0) restes.push(`${table}:${col}=${n < 0 ? "illisible" : n}`);
  }

  return { ok: echecs.length === 0 && restes.length === 0, echecs, restes, piecesJointes: pj.length };
}
