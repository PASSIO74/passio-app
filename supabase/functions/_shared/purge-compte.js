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
  // ⚠️ ASTRA-27 (contre-revue du 15/09) : `call_invites` est née le 15/09 avec
  // MSG-01 et n'est entrée NI dans cette liste NI dans l'export qui en dérive.
  // Ses deux colonnes sont du `text` SANS clé étrangère : rien, côté base, ne
  // l'aurait emportée avec le compte. LES DEUX BOUTS sont purgés — c'est la
  // règle de la maison pour un LIEN (`follows`, `blocks`, `notifications` la
  // suivent déjà) : une invitation entre A et B ne veut plus rien dire quand A
  // n'existe plus, et laisser la ligne laisserait l'identifiant de A en base
  // après sa suppression. Aucune exception de conservation n'est revendiquée
  // ici : ce n'est ni une trace de modération ni un objet partagé.
  ["call_invites", "from_id"], ["call_invites", "to_id"],
  ["notifications", "user_id"], ["notifications", "from_id"],
  ["follows", "follower_id"], ["follows", "following_id"],
  ["blocks", "blocker_id"], ["blocks", "blocked_id"],
  ["push_subscriptions", "user_id"], ["user_state", "user_id"], ["user_safety", "user_id"],
  ["user_passions", "user_id"], ["passion_quotas", "user_id"], ["passion_requests", "user_id"],
  ["step_interactions", "user_id"], ["video_lives", "author_id"],
  // ⚠️ ASTRA-27, ET CELLES-CI N'ÉTAIENT NOMMÉES NULLE PART. Le Carnet de voyage
  // a été RETIRÉ (ADR-011 §6) en conservant délibérément ses données : les
  // tables `cdv_*` sont donc toujours en production — mesuré le 15/09 : 13
  // lignes portant un identifiant de compte (`cdv_lives` 2, `cdv_live_steps` 4,
  // `cdv_live_comments` 4, `cdv_live_reactions` 3). Supprimer un compte y
  // laissait son identifiant, et rien ne pouvait le dire : aucune gate ne
  // comparait les tables du dépôt à cette liste. C'est très exactement le
  // défaut d'ASTRA-27, une fonctionnalité plus tôt. « Retirée » ne veut pas
  // dire « effacée » : tant que les données vivent, elles se purgent.
  ["cdv_lives", "author_id"], ["cdv_live_steps", "author_id"],
  ["cdv_live_comments", "author_id"], ["cdv_live_reactions", "user_id"],
  ["cdv_live_followers", "user_id"],
  ["cdv_live_collaborators", "user_id"], ["cdv_live_collaborators", "added_by"],
  ["client_errors", "uid"], ["client_errors", "auth_uid"],
  ["analytics_events", "user_id"], ["telemetry_events", "user_id"],
  // ⚠️ ASTRA-54 (cinquième contre-revue, 15/09) : trouvé par la gate des tables
  // une fois qu'elle a lu le SCHÉMA RÉSULTANT et plus des mots — `auth_uid` est
  // né d'un ALTER TABLE (migration du 14/09), posé par trigger depuis auth.uid() :
  // un identifiant de compte que rien ne purgeait.
  ["telemetry_events", "auth_uid"],
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

// ⚠️ R31 (audit du 2026-11-02, corrigé le 2026-11-04) — CE QUE LES AUTRES ONT ÉCRIT SUR
// SES PUBLICATIONS ET SES COMMENTAIRES. `TABLES_COMPTE` efface ce qui PORTE l'identifiant
// du compte. Les commentaires, « j'aime », co-auteurs et interactions que d'AUTRES comptes
// ont laissés sur ses publications — et les réponses ou réactions laissées sur ses
// commentaires — portent l'identifiant de LEUR auteur : ils restaient, orphelins, et
// `post_is_visible` (« pas de ligne posts → public ») les rendait lisibles par tous, visiteur
// compris. La migration R31 (`migration_publications_supprimees_2026-11-04.sql`) ferme cette
// lecture et pose les déclencheurs qui les emportent avec la publication. La purge les efface
// AUSSI, elle-même, et les RELIT : elle ne dépend pas de l'ordre d'application de la
// migration, et une dépendance qui reste est un reste NOMMÉ (fail-closed). Ce n'est pas
// l'export : ces lignes sont les données d'autrui (l'export ne lit que `TABLES_COMPTE`).
//
// ⚠️ L'IDENTIFIANT EST CHOISI PAR LE CLIENT, ET CETTE PURGE EFFACE AVEC LA CLÉ DE SERVICE. Sans
// garde, un compte qui publie sous l'identifiant d'une activité ou d'un exemple, qui commente
// sous celui d'une publication ou d'une réponse, puis se supprime, emportait ce qui visait
// l'original. Mêmes gardes que les déclencheurs de la migration R31, et les mêmes raisons :
// `cribler` écarte ce qui n'est pas de lui, et `planDependances` tient chaque interaction à
// son FIL. Un identifiant écarté n'entre dans aucun filtre : il est compté, jamais répété.
/** Ce qui vise une PUBLICATION du compte (colonne = identifiant de la publication). */
export const DEPENDANCES_PUBLICATION = [
  ["post_comments", "post_id"], ["post_likes", "post_id"], ["post_collaborators", "post_id"],
  // Le FIL : réactions de la publication, réponses, réactions aux réponses (`srep_…`).
  ["comment_interactions", "post_id"],
  // La CIBLE : une réaction de publication écrite SANS fil (anciennes lignes, 0 le 04/11).
  ["comment_interactions", "comment_id"],
];
/** Ce qui vise un COMMENTAIRE du compte : réponses et réactions d'autrui, dans le fil de ce commentaire. */
export const DEPENDANCES_COMMENTAIRE = [["comment_interactions", "comment_id"]];
/** Taille d'un lot d'identifiants dans un filtre `in.(…)` (URL PostgREST bornée). */
export const LOT_IN = 50;
/** Un identifiant plus long n'est pas de ceux que le client fabrique (`ci_ids_len_check` : 120 ; mesuré le 04/11 : 31 au plus). */
export const ID_LONGUEUR_MAX = 120;
/** Le jeu de caractères qu'un identifiant peut porter dans un filtre (mesuré le 04/11 : aucune ligne hors de lui). */
const ID_FORME = /^[A-Za-z0-9_:.+-]+$/;
/** La liste FERMÉE d'`est_identifiant_exemple` (migration R31) : `identifiants-exemple.test.mjs` compare les deux. */
export const EXPRESSION_EXEMPLE = /^(p[0-9]+|p[mpv][0-9]+|pn_[a-z0-9]+_[0-9]+|pac_[a-z]+|p_ev_[a-z]+|p_ev[0-9]+_e[0-9]+|reel_seed_[a-z0-9_]+|e[0-9]+)$/;
/** Dans un fil d'exemple, seul un commentaire au format du client compte : `c1`, `cp1_1`… sont ceux de démonstration. */
const COMMENTAIRE_REEL = /^c_[0-9a-z]{8,17}$/;
const estBorne = (id) => typeof id === "string" && id.length <= ID_LONGUEUR_MAX && ID_FORME.test(id);
const estExemple = (id) => typeof id === "string" && EXPRESSION_EXEMPLE.test(id);

/** Dossiers du seau `content` où le client dépose sous `<dossier>/<uid>/…`. */
export const DOSSIERS_CONTENU = ["photos", "videos", "audios", "events", "avatars", "covers", "passion_covers", "passion_photos"];

/** Fonction SQL (service_role) qui rend les objets dont le compte est propriétaire. */
export const RPC_OBJETS = "objets_stockage_du_compte";
/** Taille de page des listes (plafond `max-rows` de PostgREST et du Storage). */
export const PAGE = 1000;
/** Taille d'un lot de suppression Storage. */
const LOT_SUPPRESSION = 100;

// ⚠️ ASTRA-27 : UNE TABLE ABSENTE N'EST PAS UN ÉCHEC DE PURGE — MAIS ELLE SE DIT.
// La purge est fail-closed : toute erreur laisse le compte ouvert. Ajouter une
// table à `TABLES_COMPTE` casserait donc la suppression de compte sur tout
// environnement qui ne l'a pas (staging, projet de reprise, base d'avant la
// migration). PostgREST répond `PGRST205` / « Could not find the table » : ce
// cas précis devient une NOTE, jamais un échec — et jamais un silence non plus,
// sinon une table réellement oubliée se cacherait derrière ce pardon.
// Tout le reste (droits, contrainte, réseau) reste bloquant.
const TABLE_ABSENTE = /PGRST205|could not find the table|relation .* does not exist|schema cache/i;
function estTableAbsente(msg) { return TABLE_ABSENTE.test(String(msg || "")); }

async function supprimerLignes(admin, table, col, uid) {
  try {
    const r = await admin.from(table).delete().eq(col, uid);
    if (!r || !r.error) return null;
    const m = r.error.message || (r.error.code ? String(r.error.code) : "erreur");
    return estTableAbsente(m) || estTableAbsente(r.error.code) ? { absente: m } : m;
  } catch (e) { const m = (e && e.message) || "exception"; return estTableAbsente(m) ? { absente: m } : m; }
}

async function compterRestes(admin, table, col, uid) {
  try {
    const r = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, uid);
    if (r && r.error) return -1;                 // illisible : compte comme un reste
    return typeof r.count === "number" ? r.count : -1;   // un comptage absent n'est pas zéro
  } catch (_e) { return -1; }
}

/**
 * Les lignes de `table` que le compte a écrites, TOUTES (pages de `PAGE`, ordre stable).
 * Rend `{ lignes }` ou `{ erreur }` — une liste illisible n'est jamais une liste vide :
 * sans elle, on ne saurait plus quelles publications étaient les siennes.
 */
export async function listerLignes(admin, table, col, uid, colonnes) {
  const lignes = [];
  try {
    for (let de = 0; ; de += PAGE) {
      const r = await admin.from(table).select(colonnes).eq(col, uid).order("id").range(de, de + PAGE - 1);
      if (!r || r.error) return { erreur: (r && r.error && (r.error.message || r.error.code)) || "lecture" };
      lignes.push(...(r.data || []).filter((x) => x && x.id));
      if ((r.data || []).length < PAGE) return { lignes };
    }
  } catch (e) { return { erreur: (e && e.message) || "exception" }; }
}

/** Ceux de `ids` qui existent aussi dans `table`. Rend `{ homonymes }` ou `{ erreur }` ; une table absente n'a pas d'homonyme. */
async function chercherHomonymes(admin, table, ids) {
  const homonymes = new Set();
  for (let i = 0; i < ids.length; i += LOT_IN) {
    try {
      const r = await admin.from(table).select("id").in("id", ids.slice(i, i + LOT_IN));
      if (r && r.error) {
        if (estTableAbsente(r.error.message) || estTableAbsente(r.error.code)) return { homonymes };
        return { erreur: r.error.message || String(r.error.code || "lecture") };
      }
      for (const x of (r && r.data) || []) homonymes.add(x.id);
    } catch (e) { return { erreur: (e && e.message) || "exception" }; }
  }
  return { homonymes };
}

/**
 * Ce qu'une purge peut viser sans toucher à autrui : `garde(ligne)` pour la forme, puis aucun
 * homonyme dans `tables`. Rend `{ lignes, ecartes }`, et `erreur` si un relevé est illisible :
 * alors RIEN n'est gardé (on ne peut plus dire ce qui est à lui).
 */
async function cribler(admin, lignes, garde, tables) {
  const formes = lignes.filter(garde);
  let reste = formes;
  for (const table of tables) {
    const h = await chercherHomonymes(admin, table, reste.map((l) => l.id));
    if (h.erreur) return { lignes: [], ecartes: lignes.length, erreur: `${table} (${h.erreur})` };
    reste = reste.filter((l) => !h.homonymes.has(l.id));
  }
  return { lignes: reste, ecartes: lignes.length - reste.length };
}

/** Une publication du compte, vraiment : bornée, hors exemple, sans homonyme parmi les activités. */
const criblerPublications = (admin, lignes) =>
  cribler(admin, lignes, (l) => estBorne(l.id) && !estExemple(l.id), ["events"]);

/** Un commentaire du compte, vraiment : hors réponse et exemple, sans homonyme parmi les publications et les commentaires d'activité. */
const criblerCommentaires = (admin, lignes) =>
  cribler(admin, lignes, (l) => estBorne(l.id) && (l.post_id == null || estBorne(l.post_id))
    && !l.id.startsWith("srep_") && !estExemple(l.id)
    && (!estExemple(l.post_id) || COMMENTAIRE_REEL.test(l.id)), ["posts", "event_comments"]);

/**
 * Les effacements à faire, chacun avec sa condition de fil : une interaction n'appartient qu'à
 * son FIL. La cible seule ne vaut que sans fil ; un commentaire n'emporte que le sien.
 */
export function planDependances(publications, commentaires) {
  const plan = [];
  const ids = publications.map((l) => l.id);
  for (const [table, col] of DEPENDANCES_PUBLICATION) {
    plan.push({ table, col, ids, sansFil: table === "comment_interactions" && col === "comment_id" });
  }
  const parFil = new Map();
  for (const c of commentaires) {
    if (c.post_id == null) continue;
    if (!parFil.has(c.post_id)) parFil.set(c.post_id, []);
    parFil.get(c.post_id).push(c.id);
  }
  for (const [table, col] of DEPENDANCES_COMMENTAIRE) {
    for (const [fil, idsFil] of parFil) plan.push({ table, col, ids: idsFil, fil });
    plan.push({ table, col, ids: commentaires.map((c) => c.id), sansFil: true });
  }
  return plan.filter((e) => e.ids.length);
}

const limiter = (q, e, lot) => {
  const f = q.in(e.col, lot);
  if (e.sansFil) return f.is("post_id", null);
  return e.fil ? f.eq("post_id", e.fil) : f;
};

/** Exécute le `plan`, par lots. Rend les échecs NOMMÉS ; une table absente est notée, pas un échec. */
async function supprimerDependances(admin, plan, absentes) {
  const echecs = [];
  for (const e of plan) {
    for (let i = 0; i < e.ids.length; i += LOT_IN) {
      let m = null;
      try {
        const r = await limiter(admin.from(e.table).delete(), e, e.ids.slice(i, i + LOT_IN));
        if (r && r.error) m = r.error.message || (r.error.code ? String(r.error.code) : "erreur");
        if (m && (estTableAbsente(m) || estTableAbsente(r.error.code))) {
          const cle = `dependances:${e.table}:${e.col}`;
          if (!absentes.includes(cle)) absentes.push(cle);
          break;
        }
      } catch (ex) { m = (ex && ex.message) || "exception"; }
      if (m) { echecs.push(`dependances:${e.table}:${e.col} (${m})`); break; }
    }
  }
  return echecs;
}

/** Combien de lignes une entrée du `plan` vise encore : un nombre, `-1` si illisible, `null` si la table est absente. */
async function compterDependances(admin, e) {
  let n = 0;
  for (let i = 0; i < e.ids.length; i += LOT_IN) {
    try {
      const r = await limiter(admin.from(e.table).select("*", { count: "exact", head: true }), e, e.ids.slice(i, i + LOT_IN));
      if (r && r.error) return (estTableAbsente(r.error.message) || estTableAbsente(r.error.code)) ? null : -1;
      if (typeof r.count !== "number") return -1;   // un comptage absent n'est pas zéro
      n += r.count;
    } catch (_e) { return -1; }
  }
  return n;
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
// ⚠️ ASTRA-25 — LA BARRIÈRE SE POSE AVANT LE PREMIER COMPTAGE, ou la purge ne
// peut pas finir. Effacer, relire, ré-effacer est une PASSE DE PLUS, pas une
// barrière : une écriture qui arrive après le comptage de SA table et avant la
// relecture finale survit, et `ok` est rendu quand même. Aucun nombre de passes
// ne ferme cette fenêtre — le gel client (`_accountPurged`) ne vaut que pour CE
// navigateur, et un second appareil, un onglet resté ouvert, une requête déjà
// en vol ou un ancien jeton encore valide écrivent quand même (PostgREST ne
// vérifie que la signature du jeton, pas le bannissement GoTrue).
//
// ⚠️ ASTRA-39 / 40 / 41 / 42 (cinquième contre-revue, 15/09) — LA BARRIÈRE v2.
// Le marqueur `comptes_en_suppression` n'est plus écrit directement : quatre
// fonctions SQL (service_role seul) portent la règle, et cette fonction ne fait
// que les appeler DANS L'ORDRE, avec SON jeton :
//   ⓪ `reclamer_suppression(uid, jeton)` — UNE tentative à la fois par compte
//      (ASTRA-40). Non acquise = une autre tentative est vivante, ou le compte
//      est déjà `supprimee` : on s'arrête, sans rien toucher.
//   ⓪' `attendre_ecritures_en_vol()` — les transactions qui avaient franchi
//      leur policy AVANT la marque et n'ont pas encore validé (ASTRA-41) : on
//      attend leur fin ; s'il en reste au délai, la purge ÉCHOUE (fail-closed).
//   ① → ④ relevé, effacements, relectures — comme avant. Le trigger SQL posé par
//      la migration refuse pendant ce temps TOUTE écriture portant l'identifiant
//      (l'appelant, un tiers, l'anonyme, un trigger privilégié, la clé de
//      service — ASTRA-39), la clause de policy refuse l'appelant plus tôt.
//   ⑤ `terminer_suppression(uid, jeton, statut)` — ne touche la ligne QUE si le
//      jeton est le sien : une tentative tardive ne retire plus la protection
//      d'une autre (ASTRA-40). `echec` lève la protection (compte utilisable,
//      purge relançable) ; `purgee` la CONSERVE (le compte Auth doit encore
//      partir) ; `supprimee` (posé par `marquerSupprime` après deleteUser) la
//      conserve pour la rétention.
// ⚠️ ASTRA-56 (sixième contre-revue, 16/09) — LA BARRIÈRE v3. Une tentative
// VIVANTE n'est plus reprenable même en `purgee` (A attend deleteUser : B
// n'obtient rien) ; `echec` sur un compte dont les données sont parties
// s'ÉCRIT `purgee` (la protection ne se lève jamais après une purge) ; un
// deleteUser en échec pose l'événement `auth_echec` (`marquerAuthEchec`) qui
// TERMINE la tentative sans lever la protection. Ce fichier ne suppose plus
// l'état du marqueur : il rapporte `statut_marqueur` tel que SQL l'a écrit, et
// `donnees_purgees` dès que SQL dit qu'une purge antérieure a eu lieu.
// ⚠️ SANS INFRASTRUCTURE (migration non appliquée) LA PURGE NE PART PLUS
// (ASTRA-42). La v1 continuait « en le disant » — et le handler jetait la note :
// HTTP 200, `ok:true`, pour une suppression que rien ne garantissait. Une purge
// qui ne peut pas prouver qu'elle a fini n'a pas fini : `code: "infrastructure_absente"`.
export const RPC_RECLAMER = "reclamer_suppression";
export const RPC_TERMINER = "terminer_suppression";
export const RPC_ATTENDRE = "attendre_ecritures_en_vol";
/** Délai maximal d'attente des écritures en vol, en ms (une fonction Edge a ~150 s ; une transaction PostgREST vit des ms). */
export const ATTENTE_EN_VOL_MS = 5000;

const FONCTION_ABSENTE = /PGRST202|could not find the function|function .* does not exist|schema cache/i;
function estInfrastructureAbsente(err) {
  if (!err) return false;
  return estTableAbsente(err.message) || estTableAbsente(err.code) || FONCTION_ABSENTE.test(String(err.message || "")) || FONCTION_ABSENTE.test(String(err.code || ""));
}

async function appelerRpc(admin, nom, args) {
  try {
    const r = await admin.rpc(nom, args);
    if (!r) return { erreur: { message: "réponse vide" } };
    if (r.error) return { erreur: r.error };
    return { data: r.data };
  } catch (e) { return { erreur: { message: (e && e.message) || "exception" } }; }
}

/**
 * Fin d'opération, conditionnelle au jeton. Rend { ok, motif, statut, protection, donnees_deja_purgees } ;
 * ok ⇔ la ligne était bien la nôtre. `statut` et `protection` sont ceux que
 * SQL a ÉCRITS (ou lus, sur un refus) — jamais l'événement demandé (ASTRA-56 :
 * `echec` demandé sur un compte purgé s'écrit `purgee`, et le dit).
 */
async function terminer(admin, uid, jeton, statut, detail) {
  const r = await appelerRpc(admin, RPC_TERMINER, { p_uid: uid, p_jeton: jeton, p_statut: statut, p_detail: detail || null });
  if (r.erreur) return { ok: false, motif: r.erreur.message || "erreur", statut: null, protection: null, donnees_deja_purgees: null };
  const d = r.data || {};
  return { ok: d.ok === true, motif: d.motif || null, statut: d.statut || null,
           protection: typeof d.protection === "boolean" ? d.protection : null,
           donnees_deja_purgees: typeof d.donnees_deja_purgees === "boolean" ? d.donnees_deja_purgees : null };
}

/** Après `deleteUser` : le marqueur passe en `supprimee` (rétention). Rend { ok, motif, statut, protection }. */
export async function marquerSupprime(admin, uid, jeton) {
  return terminer(admin, uid, jeton, "supprimee", null);
}

/**
 * Après un `deleteUser` en ÉCHEC : la tentative est TERMINÉE, les données sont
 * parties, la protection reste (`purgee`) — et la ligne redevient reprenable
 * tout de suite (ASTRA-56, règle ③). Rend { ok, motif, statut, protection }.
 */
export async function marquerAuthEchec(admin, uid, jeton, detail) {
  return terminer(admin, uid, jeton, "auth_echec", detail || null);
}

/**
 * Purge tout ce qui porte `uid`, puis RELIT. Rend `{ ok, code, echecs, restes, absentes, notes, barriere, objets, jeton }` :
 * `echecs` = gestes en erreur, `restes` = ce qui subsiste après relecture, `ok` ⇔ les deux vides
 * ET la tentative encore la nôtre. `code` nomme un arrêt avant purge :
 * `infrastructure_absente`, `deja_en_cours`, `deja_supprimee`, `barriere`, `en_vol`, `jeton_perdu`, `incomplete`.
 * `jeton` identifie CETTE tentative ; `delete-account` le repasse à `marquerSupprime`.
 * `dependances` (R31) = { publications, commentaires, ecartes } : combien de publications et de
 * commentaires du compte ont vu purger ce que d'AUTRES y avaient écrit (restes : `dependances:…`),
 * et combien d'identifiants n'étaient pas de lui (forme ou homonyme : rien n'est effacé en leur nom).
 */
export async function purgerCompte(admin, uid, options) {
  const jeton = (options && options.jeton) || (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()) + "-" + Math.random());
  const echecs = [];
  const absentes = [];
  const restes = [];
  const notes = [];
  const base = { echecs, restes, absentes, notes, jeton, objets: 0 };

  // ⓪ RÉCLAMER — avant tout comptage, avant tout geste.
  const rec = await appelerRpc(admin, RPC_RECLAMER, { p_uid: uid, p_jeton: jeton, p_motif: "delete-account" });
  if (rec.erreur) {
    if (estInfrastructureAbsente(rec.erreur)) {
      echecs.push(`barrière:absente (${rec.erreur.message || rec.erreur.code || "?"})`);
      notes.push("infrastructure de suppression ABSENTE (migration non appliquée) : la purge n'est pas engagée — une suppression sans barrière ne serait pas garantie");
      return { ok: false, code: "infrastructure_absente", barriere: "absente", ...base };
    }
    echecs.push(`barrière:reclamation (${rec.erreur.message || rec.erreur.code || "erreur"})`);
    return { ok: false, code: "barriere", barriere: "refus", ...base };
  }
  const etat = rec.data || {};
  if (etat.acquise !== true) {
    const code = etat.statut === "supprimee" ? "deja_supprimee" : "deja_en_cours";
    notes.push(`tentative non acquise : statut ${etat.statut || "?"}${etat.motif ? " (" + etat.motif + ")" : ""}`);
    return { ok: false, code, barriere: "occupee", statut: etat.statut || null, ...base };
  }
  // ⚠️ ASTRA-56 : une reprise depuis `purgee` (Auth échoué, ou tentative morte
  // après sa purge) part d'un compte dont les DONNÉES SONT DÉJÀ PARTIES. On le
  // sait dès ici, et chaque arrêt ultérieur le dira — « rien n'a été supprimé »
  // serait faux.
  if (etat.donnees_deja_purgees === true) {
    base.donnees_purgees = true;
    notes.push(`reprise : les données de ce compte ont déjà été purgées (${etat.purge_terminee_le || "date inconnue"}) ; reste la suppression Auth`);
  }

  // Un arrêt en `echec` : SQL n'écrit `echec` que si les données ne sont pas
  // parties ; sinon il ÉCRIT `purgee` (règle ②) et le rend. On rapporte ce qu'il
  // a écrit, pas ce qu'on a demandé.
  const arreter = async (code, detail) => {
    const fin = await terminer(admin, uid, jeton, "echec", detail);
    if (!fin.ok) echecs.push(`barrière:fin (${fin.motif || "refus"}, statut ${fin.statut || "?"})`);
    const out = { ok: false, code: fin.ok ? code : "jeton_perdu", barriere: fin.ok ? (fin.statut === "purgee" ? "conservee" : "levee") : "perdue",
                  statut_marqueur: fin.statut, ...base };
    if (fin.donnees_deja_purgees === true) out.donnees_purgees = true;
    return out;
  };

  // ⓪' LES ÉCRITURES DÉJÀ ENGAGÉES (ASTRA-41).
  const vol = await appelerRpc(admin, RPC_ATTENDRE, { p_max_ms: ATTENTE_EN_VOL_MS });
  if (vol.erreur) {
    echecs.push(`barrière:en_vol (${vol.erreur.message || vol.erreur.code || "erreur"})`);
    return arreter("en_vol", { echecs });
  }
  const enVol = vol.data || {};
  if (typeof enVol.restantes !== "number" || enVol.restantes > 0) {
    echecs.push(`écritures en vol non terminées (${typeof enVol.restantes === "number" ? enVol.restantes : "illisible"}) après ${enVol.attendu_ms || "?"} ms`);
    return arreter("en_vol", { echecs, en_vol: enVol });
  }
  if (enVol.en_vol_initial > 0) notes.push(`${enVol.en_vol_initial} transaction(s) en vol attendue(s) pendant ${enVol.attendu_ms} ms`);

  // ① Relever les objets Storage du compte PAR PROPRIÉTÉ — l'autorité, pas les
  //    messages. Fonction absente ou illisible : échec nommé, on ne devine rien.
  const releve = await listerObjetsDuCompte(admin, uid);
  if (releve.erreur) echecs.push(`objets:rpc (${releve.erreur})`);
  const objets = releve.objets || [];
  base.objets = objets.length;

  // ①bis R31 — ce que les AUTRES ont écrit sur ses publications et sur ses commentaires.
  //    Relevé AVANT ② : une fois ses publications effacées, plus rien ne dit lesquelles
  //    étaient les siennes. Une liste illisible est un échec nommé, jamais « rien à faire ».
  //    ⚠️ Un identifiant est choisi par le client : le crible écarte ce qui n'est pas de lui.
  const pubs = await listerLignes(admin, "posts", "author_id", uid, "id");
  const coms = await listerLignes(admin, "post_comments", "author_id", uid, "id, post_id");
  if (pubs.erreur) echecs.push(`dependances:relevé posts (${pubs.erreur})`);
  if (coms.erreur) echecs.push(`dependances:relevé post_comments (${coms.erreur})`);
  const criblePubs = await criblerPublications(admin, pubs.lignes || []);
  const cribleComs = await criblerCommentaires(admin, coms.lignes || []);
  if (criblePubs.erreur) echecs.push(`dependances:homonymes de publications, ${criblePubs.erreur}`);
  if (cribleComs.erreur) echecs.push(`dependances:homonymes de commentaires, ${cribleComs.erreur}`);
  const ecartes = criblePubs.ecartes + cribleComs.ecartes;
  base.dependances = { publications: criblePubs.lignes.length, commentaires: cribleComs.lignes.length, ecartes };
  if (ecartes && !criblePubs.erreur && !cribleComs.erreur) notes.push(`dependances : ${ecartes} identifiant(s) écarté(s), forme ou homonyme`);
  const plan = planDependances(criblePubs.lignes, cribleComs.lignes);
  echecs.push(...await supprimerDependances(admin, plan, absentes));

  // ② Lignes, une table à la fois, chaque verdict lu.
  for (const [table, col] of TABLES_COMPTE) {
    const err = await supprimerLignes(admin, table, col, uid);
    if (!err) continue;
    if (err.absente) { absentes.push(`${table}:${col}`); continue; }
    echecs.push(`${table}:${col} (${err})`);
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
    let n = await compterRestes(admin, table, col, uid);
    // ⚠️ UNE ÉCRITURE TARDIVE DU CLIENT N'EST PAS UN RESTE (SUP-10, 2026-09-15).
    // Entre l'effacement et la relecture, l'application encore ouverte peut
    // repousser son état (`user_state`) ou un accusé de lecture : mesuré en CI
    // sur le staging (`user_state:user_id=1`), et c'est aussi la mécanique qui
    // laissait des lignes orphelines derrière un compte supprimé (PRO-06). On
    // efface UNE seconde fois ce qui est réapparu, et on relit ; ce qui
    // subsiste encore est un vrai reste, nommé. Une seule reprise : une ligne
    // qui revient à chaque passage est un client qui écrit en boucle, et il faut
    // que quelqu'un le voie. (Avec la barrière v2 ce cas ne devrait plus se
    // produire ; la reprise reste, comme filet, et le reste reste nommé.)
    if (n > 0) {
      const err = await supprimerLignes(admin, table, col, uid);
      if (err && err.absente) { n = 0; }
      else if (err) echecs.push(`${table}:${col} (reprise : ${err})`);
      else n = await compterRestes(admin, table, col, uid);
    }
    if (n !== 0) restes.push(`${table}:${col}=${n < 0 ? "illisible" : n}`);
  }
  // ④bis R31 — plus rien ne vise ses publications ni ses commentaires. Un TIERS qui commente
  //    ou aime pendant la purge (la barrière ne garde que les écritures DU compte) laisse une
  //    ligne tardive : réeffacée UNE fois, comme celles du compte ; ce qui subsiste est nommé.
  const parCle = new Map();
  for (const e of plan) {
    let n = await compterDependances(admin, e);
    if (n === null) continue;                        // table absente : déjà notée en ①bis
    if (n > 0) {
      const err = await supprimerDependances(admin, [e], absentes);
      if (err.length) echecs.push(...err.map((x) => x.replace(/ \(/, " (reprise : ")));
      n = await compterDependances(admin, e);
    }
    if (n === null) continue;
    const cle = `${e.table}:${e.col}`;
    const avant = parCle.has(cle) ? parCle.get(cle) : 0;
    parCle.set(cle, avant < 0 || n < 0 ? -1 : avant + n);
  }
  for (const [cle, n] of parCle) if (n !== 0) restes.push(`dependances:${cle}=${n < 0 ? "illisible" : n}`);

  // Une table absente ne fait pas échouer la purge : `delete-account` le dit dans ses notes.
  if (absentes.length) notes.push(`tables absentes : ${absentes.join(", ")}`);

  const purgeOk = echecs.length === 0 && restes.length === 0;
  // ⑤ FIN D'OPÉRATION, PAR JETON. Sur un succès la protection est CONSERVÉE
  // (`purgee`) : le compte Auth part juste après, et lever la marque rouvrirait
  // l'écriture dans la fenêtre qui sépare les deux. Sur un échec, `echec` lève
  // la protection — MAIS seulement si la tentative est encore la nôtre.
  if (!purgeOk) return arreter("incomplete", { echecs, restes });
  const fin = await terminer(admin, uid, jeton, "purgee", null);
  if (!fin.ok) {
    // Une autre tentative a repris le compte pendant la nôtre (tentative réputée
    // morte, reprise) : NOTRE relecture ne vaut plus rien pour ELLE, et on ne
    // doit surtout pas supprimer le compte Auth sur la foi d'une purge dont on
    // n'a plus la garde.
    echecs.push(`barrière:fin (${fin.motif || "refus"}, statut ${fin.statut || "?"})`);
    return { ok: false, code: "jeton_perdu", barriere: "perdue", statut_marqueur: fin.statut, ...base };
  }
  return { ok: true, code: null, barriere: "posee", statut_marqueur: fin.statut, ...base };
}
