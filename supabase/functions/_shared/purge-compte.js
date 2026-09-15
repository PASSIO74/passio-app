// Purge VÉRIFIÉE d'un compte (AUTH-05 / SUP-10, contre-revue Astra, 2026-09-14 ;
// ASTRA-11 / ASTRA-12, 2026-09-15).
// En .js comme `plafond.js` : Deno l'importe tel quel dans `delete-account`, et
// `node --test tests/unit/purge-compte.test.mjs` charge le MÊME fichier.
//
// CE QUI MANQUAIT (14/09). `delete-account` faisait quinze `delete()` « best-effort »
// SANS lire `{ error }` (le SDK ne lève pas), ne purgeait que trois dossiers
// du seau `content` (photos, videos, audios — pas avatars, covers, events,
// passion_*), jamais les pièces jointes de messagerie (`attachments/<conv>/…`),
// ignorait dix-sept tables qui portent l'identifiant du compte (user_state,
// blocks, conv_reads, comment_interactions, event_reactions, user_safety,
// passion_quotas, telemetry…), puis supprimait le compte Auth et rendait
// `ok: true`. Le client affichait « Compte supprimé » quoi qu'il arrive. La
// suppression du compte Auth ne prouvait donc pas celle de ses données.
//
// ⚠️ ET LE CORRECTIF DU 14/09 SUPPRIMAIT LES FICHIERS D'AUTRUI (ASTRA-11, 15/09).
// Il relevait les pièces jointes à purger dans le CONTENU des messages du compte
// — `{ "url": ".../attachments/<conv>/<fichier>" }`, un texte que le client
// écrit librement — puis les supprimait avec la clé service_role. Un message de
// A portant le chemin d'une pièce jointe de B faisait donc supprimer l'objet de
// B, `ok: true`. Et le client supprimait ses messages AVANT d'appeler la
// fonction : à la seconde tentative il n'y avait plus rien à relever, le
// fichier restait (ASTRA-12). Un chemin fourni par le client n'est pas une
// autorisation.
//
// LA RÈGLE. Ce qui appartient au compte se lit à sa SOURCE : `storage.objects.owner`,
// posé par la plateforme à l'upload depuis le JWT de l'appelant — jamais dans
// un message. `objets_stockage_du_compte(uid)` (migration du 15/09, service_role
// seul) rend ces objets, tous seaux confondus ; on les supprime par l'API
// Storage, puis on RELIT par la même fonction. Les huit dossiers `<dossier>/<uid>/`
// du seau `content` restent purgés aussi (défense en profondeur : le chemin y
// porte l'uid, c'est la policy d'upload qui l'impose). On purge, on RELIT ce qui
// reste, et le compte Auth ne part que si rien ne reste. Un échec rend la liste
// des restes ; le compte reste ouvert et la suppression est RELANÇABLE (chaque
// geste est idempotent — et comme la relève ne dépend plus des messages, une
// seconde tentative trouve encore les fichiers).
//
// ⚠️ FAIL-CLOSED PARTOUT : fonction absente (migration non appliquée), liste
// illisible, relecture illisible → échec ou reste NOMMÉ, jamais `ok`. Une purge
// qui ne peut pas prouver qu'elle a fini n'a pas fini.

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

/** Fonction SQL (service_role) qui rend les objets dont le compte est propriétaire. */
export const RPC_OBJETS = "objets_stockage_du_compte";
/** Taille de page des listes (plafond `max-rows` de PostgREST et du Storage). */
export const PAGE = 1000;
/** Taille d'un lot de suppression Storage. */
const LOT_SUPPRESSION = 100;

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

/**
 * Liste COMPLÈTE d'un préfixe : le Storage plafonne une page à 1 000 entrées,
 * on avance par `offset` jusqu'à une page courte. Rend `{ noms }` ou `{ erreur }`.
 */
async function listerDossier(admin, seau, prefixe) {
  const noms = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(seau).list(prefixe, { limit: PAGE, offset });
    if (error) return { erreur: error.message || "list" };
    const page = (data || []).filter((f) => f && f.name).map((f) => `${prefixe}/${f.name}`);
    noms.push(...page);
    if (page.length < PAGE) return { noms };
  }
}

async function supprimerObjets(admin, seau, noms) {
  for (let i = 0; i < noms.length; i += LOT_SUPPRESSION) {
    const rm = await admin.storage.from(seau).remove(noms.slice(i, i + LOT_SUPPRESSION));
    if (rm && rm.error) return rm.error.message || "remove";
  }
  return null;
}

async function purgerDossier(admin, seau, prefixe) {
  try {
    const l = await listerDossier(admin, seau, prefixe);
    if (l.erreur) return { erreur: l.erreur, restes: -1 };
    if (!l.noms.length) return { erreur: null, restes: 0 };
    const err = await supprimerObjets(admin, seau, l.noms);
    if (err) return { erreur: err, restes: l.noms.length };
    // ⚠️ La relecture qui échoue n'est PAS « zéro reste » (ASTRA-12) : illisible.
    const relu = await listerDossier(admin, seau, prefixe);
    if (relu.erreur) return { erreur: null, restes: -1 };
    return { erreur: null, restes: relu.noms.length };
  } catch (e) { return { erreur: (e && e.message) || "exception", restes: -1 }; }
}

/**
 * Objets dont le compte est PROPRIÉTAIRE, tous seaux, par la fonction SQL.
 * Rend `{ objets: [{bucket_id, name}] }` ou `{ erreur }` — une fonction absente
 * ou en erreur est une erreur, jamais une liste vide.
 */
export async function listerObjetsDuCompte(admin, uid) {
  const objets = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const r = await admin.rpc(RPC_OBJETS, { p_uid: uid }).range(from, from + PAGE - 1);
      if (!r || r.error) return { erreur: (r && r.error && r.error.message) || "rpc" };
      const page = (r.data || []).filter((o) => o && o.bucket_id && o.name);
      objets.push(...page);
      if (page.length < PAGE) return { objets };
    }
  } catch (e) { return { erreur: (e && e.message) || "exception" }; }
}

/**
 * Purge tout ce qui porte `uid`, puis RELIT. Rend `{ ok, echecs, restes }` :
 * `echecs` = gestes en erreur (nom lisible), `restes` = ce qui subsiste après
 * relecture (table:colonne=n, ou seau/prefixe=n, ou objets=n). `ok` ⇔ les deux
 * listes vides. `objets` = nombre d'objets Storage relevés par propriété.
 */
export async function purgerCompte(admin, uid) {
  const echecs = [];
  const restes = [];

  // ① Relever les objets Storage du compte PAR PROPRIÉTÉ — l'autorité, pas les
  //    messages. Fonction absente ou illisible : échec nommé, on ne devine rien.
  const releve = await listerObjetsDuCompte(admin, uid);
  if (releve.erreur) echecs.push(`objets:rpc (${releve.erreur})`);
  const objets = releve.objets || [];

  // ② Lignes, une table à la fois, chaque verdict lu.
  for (const [table, col] of TABLES_COMPTE) {
    const err = await supprimerLignes(admin, table, col, uid);
    if (err) echecs.push(`${table}:${col} (${err})`);
  }

  // ③ Médias : les objets relevés (par seau, par lots), puis les huit dossiers
  //    du seau public en second filet.
  const parSeau = new Map();
  for (const o of objets) { if (!parSeau.has(o.bucket_id)) parSeau.set(o.bucket_id, []); parSeau.get(o.bucket_id).push(o.name); }
  for (const [seau, noms] of parSeau) {
    try {
      const err = await supprimerObjets(admin, seau, noms);
      if (err) echecs.push(`${seau} (${err})`);
    } catch (e) { echecs.push(`${seau} (${(e && e.message) || "exception"})`); }
  }
  for (const dossier of DOSSIERS_CONTENU) {
    const r = await purgerDossier(admin, "content", `${dossier}/${uid}`);
    if (r.erreur) echecs.push(`content/${dossier} (${r.erreur})`);
    if (r.restes) restes.push(`content/${dossier}/${uid}=${r.restes < 0 ? "illisible" : r.restes}`);
  }

  // ④ Relecture : ce qui reste est nommé. Illisible compte comme un reste.
  if (!releve.erreur) {
    const relu = await listerObjetsDuCompte(admin, uid);
    if (relu.erreur) restes.push("objets=illisible");
    else if (relu.objets.length) restes.push(`objets=${relu.objets.length}`);
  }
  for (const [table, col] of TABLES_COMPTE) {
    const n = await compterRestes(admin, table, col, uid);
    if (n !== 0) restes.push(`${table}:${col}=${n < 0 ? "illisible" : n}`);
  }

  return { ok: echecs.length === 0 && restes.length === 0, echecs, restes, objets: objets.length };
}
