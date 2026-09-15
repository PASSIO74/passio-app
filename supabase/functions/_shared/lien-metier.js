// Lien MÉTIER entre l'émetteur d'une push et son destinataire (MSG-04, 2026-09-14).
// En .js et non .ts, comme `plafond.js` : Deno l'importe tel quel dans
// `notify-call`, et `node --test tests/unit/lien-metier.test.mjs` charge le MÊME
// fichier — le verrou mesure ce qui est déployé, pas une copie.
//
// CE QUI MANQUAIT. `notify-call` authentifiait l'appelant (jeton), bornait sa
// cadence et refusait un blocage — mais n'exigeait AUCUN lien entre lui et le
// destinataire : tout compte connecté pouvait réveiller n'importe quel membre,
// avec un texte libre (`text`) et sous un nom libre (`fromName`). Le push est
// un canal qui perce tout (écran verrouillé, appli fermée) : il doit être
// l'ÉCHO d'un fait que la base a accepté, jamais une parole en l'air.
//
// LA RÈGLE, en trois points :
//   · APPEL : l'appelant et l'appelé partagent une conversation 1:1 — c'est la
//     seule surface d'où un appel peut partir (`startCall` refuse un groupe).
//   · NOTIFICATION : une ligne `notifications` de l'émetteur vers le
//     destinataire existe, écrite dans les deux dernières minutes — donc
//     acceptée par la RLS (`from_id = auth.uid()`, `not is_blocked_with`,
//     `trg_rate_limit`) ou par un trigger serveur (`follows_notifier`). Le
//     TEXTE poussé est celui de cette ligne, jamais celui du corps de requête.
//   · IDENTITÉ : le nom et l'emoji viennent de `profiles`, jamais du corps.
// Un lien absent rend exactement la réponse d'un blocage (« aucun appareil
// abonné ») : ni l'un ni l'autre ne doit apprendre pourquoi.

const FENETRE_NOTIF_MS = 2 * 60_000;

/** Les cinq entités que `escapeHtml` (app-02) pose : le push affiche du texte brut. */
export function decoderEntites(s) {
  return String(s == null ? "" : s)
    .replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function borneTexte(v, max) {
  const s = String(v == null ? "" : v).trim();
  return s ? Array.from(s).slice(0, max).join("") : "";
}

/** Nom et emoji de l'émetteur, lus en base. Repli neutre si la ligne manque. */
export async function identiteAppelant(admin, fromUid) {
  const repli = { name: "Quelqu'un", emoji: "📞" };
  try {
    const { data, error } = await admin.from("profiles").select("username, emoji").eq("id", fromUid).maybeSingle();
    if (error || !data) return repli;
    return { name: borneTexte(data.username, 60) || repli.name, emoji: borneTexte(data.emoji, 8) || repli.emoji };
  } catch (_e) { return repli; }
}

/** Appel : les deux comptes partagent au moins une conversation 1:1. */
export async function lienAppel(admin, fromUid, toUserId) {
  try {
    const miennes = await admin.from("conv_members").select("conv_id").eq("user_id", fromUid);
    if (miennes.error) return { ok: false, raison: "lecture conv_members" };
    const ids = (miennes.data || []).map((r) => r.conv_id).filter(Boolean);
    if (!ids.length) return { ok: false, raison: "aucune conversation" };
    const siennes = await admin.from("conv_members").select("conv_id").eq("user_id", toUserId).in("conv_id", ids);
    if (siennes.error) return { ok: false, raison: "lecture conv_members" };
    const communes = (siennes.data || []).map((r) => r.conv_id).filter(Boolean);
    if (!communes.length) return { ok: false, raison: "aucune conversation commune" };
    const un_a_un = await admin.from("conversations").select("id").in("id", communes).eq("is_group", false).limit(1);
    if (un_a_un.error) return { ok: false, raison: "lecture conversations" };
    if (!(un_a_un.data || []).length) return { ok: false, raison: "aucune conversation 1:1 commune" };
    return { ok: true, raison: "" };
  } catch (_e) { return { ok: false, raison: "exception" }; }
}

/**
 * Notification : une ligne `notifications` récente de l'émetteur vers le
 * destinataire. Rend le texte et le genre de CETTE ligne — la base est la
 * source, le corps de requête n'est qu'un signal.
 */
export async function lienNotification(admin, fromUid, toUserId, maintenantMs, fenetreMs) {
  const maintenant = typeof maintenantMs === "number" ? maintenantMs : Date.now();
  const fenetre = typeof fenetreMs === "number" ? fenetreMs : FENETRE_NOTIF_MS;
  try {
    const depuis = new Date(maintenant - fenetre).toISOString();
    const r = await admin.from("notifications").select("content, kind, created_at, ref_id")
      .eq("from_id", fromUid).eq("user_id", toUserId).gte("created_at", depuis)
      .order("created_at", { ascending: false }).limit(1);
    if (r.error) return { ok: false, raison: "lecture notifications" };
    const ligne = (r.data || [])[0];
    if (!ligne) return { ok: false, raison: "aucune notification récente" };
    return { ok: true, raison: "", texte: borneTexte(decoderEntites(ligne.content), 200), kind: borneTexte(ligne.kind, 32), refId: ligne.ref_id == null ? "" : String(ligne.ref_id) };
  } catch (_e) { return { ok: false, raison: "exception" }; }
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ L'ÉVÉNEMENT MÉTIER, PAS SEULEMENT LA NOTIFICATION (contre-revue Astra du
// 2026-09-15, MSG-04 PARTIEL). La ligne `notifications` exigée ci-dessus est
// écrite par L'APPELANT lui-même (la RLS l'y autorise : c'est ainsi que les
// j'aime et commentaires notifient) — « vérifier son existence ne prouve pas
// un événement métier légitime ». Une push doit donc être l'écho d'un FAIT que
// la base a accepté par ailleurs, et qui LIE l'appelant au destinataire :
//   · message  → un `conv_messages` récent de l'appelant dans la conversation
//                `ref_id`, dont le destinataire est MEMBRE ;
//   · like     → un `post_likes` de l'appelant sur la publication `ref_id`,
//                dont le destinataire est l'AUTEUR ;
//   · comment  → un `post_comments` récent de l'appelant sur `ref_id`, auteur
//                de la publication = destinataire ;
//   · mention  → un message récent de l'appelant dans une conversation `ref_id`
//                dont le destinataire est membre, ou un commentaire récent de
//                l'appelant sur la publication `ref_id` (le mentionné n'en est
//                pas forcément l'auteur) ;
//   · event_join / event_feedback → `event_attendees` (appelant, `ref_id`),
//                organisateur de l'activité = destinataire ;
//   · event_comment → `event_comments` récent (appelant, `ref_id`),
//                organisateur = destinataire ;
//   · event_update / event_invite → l'appelant ORGANISE `ref_id`, et le
//                destinataire y est inscrit (invite : ou, à défaut, partage une
//                conversation 1:1 avec lui — on n'invite que qui l'on peut joindre) ;
//   · live_video → un `video_lives` de l'appelant démarré récemment, et le
//                destinataire le SUIT ;
//   · follow / follow_request / follow_accept → une ligne `follows` entre eux.
// Genre inconnu, `ref_id` absent là où il est requis, lecture en erreur : REFUS
// (fail-closed) — une push manquée vaut mieux qu'une push qui perce.
const FENETRE_EVENEMENT_MS = 10 * 60_000;

async function unSeul(admin, table, filtres) {
  let q = admin.from(table).select("*");
  for (const [col, v] of filtres) q = q.eq(col, v);
  const r = await q.limit(1);
  if (!r || r.error) return { erreur: true };
  return { ligne: (r.data || [])[0] || null };
}
function recent(ligne, col, maintenant, fenetre) {
  if (!ligne) return false;
  if (!(col in ligne) || ligne[col] == null) return true;   // table sans horodatage : la ligne suffit
  const t = Date.parse(ligne[col]);
  return !Number.isNaN(t) && t >= maintenant - fenetre && t <= maintenant + 60_000;
}
async function organisateurDe(admin, eventId) {
  const r = await unSeul(admin, "events", [["id", eventId]]);
  if (r.erreur || !r.ligne) return null;
  return { author: r.ligne.author_id || null, organizer: r.ligne.organizer_id || null, co: Array.isArray(r.ligne.co_organizers) ? r.ligne.co_organizers : [] };
}
const estOrganisateur = (o, uid) => !!o && (o.author === uid || o.organizer === uid || o.co.includes(uid));

// ⚠️ ASTRA-24 — UNE MENTION SANS DESTINATAIRE N'EST PAS UNE MENTION.
// La branche « commentaire » n'exigeait QUE ceci : que l'appelant ait commenté
// récemment la publication `ref_id`. Elle ne regardait JAMAIS `toUserId`. Le
// commentaire de l'époque le disait lui-même — « le mentionné n'en est pas
// forcément l'auteur » — sans voir que cela ne laissait plus AUCUNE condition
// sur le destinataire : n'importe quel compte pouvait être « le mentionné ».
//
// ⚠️ ET ÇA REFERMAIT LE TROU QUE LE LIEN MÉTIER VENAIT D'OUVRIR, PAR LA PORTE
// D'À CÔTÉ. `lienNotification` prend le texte de la ligne `notifications` au
// lieu du corps de requête ; mais cette ligne, l'appelant l'écrit lui-même
// (`notifications_insert_own_author` : `from_id = auth.uid()`, non bloqué —
// mesuré en production le 2026-09-15). Commenter une publication publique,
// écrire une ligne « mention » vers n'importe qui avec le texte de son choix,
// invoquer `notify-call` : le texte libre ressortait sur l'écran verrouillé
// d'un inconnu. Le lien métier est la seule marche qui pouvait l'arrêter.
//
// CE QU'ON EXIGE MAINTENANT, et c'est ce que le client prétend faire : que le
// commentaire mentionne VRAIMENT cette personne. `_notifyCommentMentions`
// (app-04) cherche `@<nom>` dans le texte ; on cherche le même `@<nom>`, avec
// la même règle, dans le commentaire réellement écrit. Une mention devient
// alors un acte PUBLIC et vérifiable, pas une déclaration.
//
// ⚠️ LA RÈGLE DE COMPARAISON EST CELLE DU CLIENT, À LA LETTRE (`toLowerCase`,
// sous-chaîne, pas de normalisation d'accents). En durcir une seule moitié
// ferait REFUSER des mentions légitimes — une garde qui coupe le service
// qu'elle protège est un défaut, pas une précaution.
// ⚠️ `profiles.username` N'A PAS D'INDEX UNIQUE (écrit dans le dépôt) : deux
// comptes peuvent porter le même nom, et tous deux passeront cette garde. Ce
// n'est pas un contournement, c'est la sémantique du produit — la mention est
// ambiguë à l'écriture. Ce qui est fermé, c'est le destinataire ARBITRAIRE.
function mentionne(texte, nom) {
  if (typeof texte !== "string" || typeof nom !== "string" || !nom) return false;
  return texte.toLowerCase().indexOf("@" + nom.toLowerCase()) > -1;
}

async function mentionDansUnCommentaire(admin, postId, fromUid, toUserId, maintenant, fenetre) {
  const prof = await unSeul(admin, "profiles", [["id", toUserId]]);
  if (prof.erreur) return { erreur: "lecture profiles" };
  const nom = prof.ligne && typeof prof.ligne.username === "string" ? prof.ligne.username.trim() : "";
  if (!nom) return { erreur: "destinataire sans nom : aucune mention ne peut le désigner" };
  // ⚠️ ON LIT PLUSIEURS COMMENTAIRES, ET DANS L'ORDRE. `unSeul` fait `.limit(1)`
  // SANS `order` : quelle ligne revient dépend du plan. Pour une simple
  // existence c'était sans effet ; ici il faut le commentaire QUI MENTIONNE,
  // et un appelant qui a commenté deux fois le même fil en aurait été privé au
  // hasard — une garde intermittente se lit comme une panne.
  const r = await admin.from("post_comments").select("content, created_at")
    .eq("post_id", postId).eq("author_id", fromUid)
    .order("created_at", { ascending: false }).limit(20);
  if (!r || r.error) return { erreur: "lecture post_comments" };
  for (const com of r.data || []) {
    if (!recent(com, "created_at", maintenant, fenetre)) continue;
    if (mentionne(com.content, nom)) return { ok: true };
  }
  return { ok: false };
}

/**
 * L'événement métier qui justifie une push de genre `kind`, de `fromUid` vers
 * `toUserId`, à propos de `refId`. Rend `{ ok, raison }`.
 */
export async function lienEvenement(admin, kind, fromUid, toUserId, refId, maintenantMs, fenetreMs) {
  const maintenant = typeof maintenantMs === "number" ? maintenantMs : Date.now();
  const fenetre = typeof fenetreMs === "number" ? fenetreMs : FENETRE_EVENEMENT_MS;
  const k = String(kind || "");
  const ref = refId == null ? "" : String(refId);
  try {
    if (k === "message" || k === "mention") {
      if (ref) {
        const msg = await unSeul(admin, "conv_messages", [["conv_id", ref], ["from_id", fromUid]]);
        if (msg.erreur) return { ok: false, raison: "lecture conv_messages" };
        const membre = await unSeul(admin, "conv_members", [["conv_id", ref], ["user_id", toUserId]]);
        if (membre.erreur) return { ok: false, raison: "lecture conv_members" };
        if (msg.ligne && membre.ligne && recent(msg.ligne, "created_at", maintenant, fenetre)) return { ok: true, raison: "" };
        if (k === "mention") {
          const v = await mentionDansUnCommentaire(admin, ref, fromUid, toUserId, maintenant, fenetre);
          if (v.erreur) return { ok: false, raison: v.erreur };
          if (v.ok) return { ok: true, raison: "" };
        }
      }
      return { ok: false, raison: "aucun message ni commentaire récent de l'appelant DÉSIGNANT le destinataire" };
    }
    if (k === "like" || k === "comment") {
      if (!ref) return { ok: false, raison: "ref_id absent" };
      const post = await unSeul(admin, "posts", [["id", ref]]);
      if (post.erreur) return { ok: false, raison: "lecture posts" };
      if (!post.ligne || post.ligne.author_id !== toUserId) return { ok: false, raison: "le destinataire n'est pas l'auteur de la publication" };
      const fait = k === "like"
        ? await unSeul(admin, "post_likes", [["post_id", ref], ["user_id", fromUid]])
        : await unSeul(admin, "post_comments", [["post_id", ref], ["author_id", fromUid]]);
      if (fait.erreur) return { ok: false, raison: "lecture " + (k === "like" ? "post_likes" : "post_comments") };
      if (fait.ligne && recent(fait.ligne, "created_at", maintenant, fenetre)) return { ok: true, raison: "" };
      return { ok: false, raison: "aucun " + k + " récent de l'appelant sur cette publication" };
    }
    if (k === "event_join" || k === "event_feedback" || k === "event_comment") {
      if (!ref) return { ok: false, raison: "ref_id absent" };
      const org = await organisateurDe(admin, ref);
      if (!estOrganisateur(org, toUserId)) return { ok: false, raison: "le destinataire n'organise pas cette activité" };
      const fait = k === "event_comment"
        ? await unSeul(admin, "event_comments", [["event_id", ref], ["author_id", fromUid]])
        : await unSeul(admin, "event_attendees", [["event_id", ref], ["user_id", fromUid]]);
      if (fait.erreur) return { ok: false, raison: "lecture " + (k === "event_comment" ? "event_comments" : "event_attendees") };
      if (fait.ligne && recent(fait.ligne, k === "event_feedback" ? "rated_at" : "created_at", maintenant, fenetre)) return { ok: true, raison: "" };
      return { ok: false, raison: "aucune participation ni commentaire récent de l'appelant" };
    }
    if (k === "event_update" || k === "event_invite") {
      if (!ref) return { ok: false, raison: "ref_id absent" };
      const org = await organisateurDe(admin, ref);
      if (!estOrganisateur(org, fromUid)) return { ok: false, raison: "l'appelant n'organise pas cette activité" };
      const inscrit = await unSeul(admin, "event_attendees", [["event_id", ref], ["user_id", toUserId]]);
      if (inscrit.erreur) return { ok: false, raison: "lecture event_attendees" };
      if (inscrit.ligne) return { ok: true, raison: "" };
      if (k === "event_invite") return lienAppel(admin, fromUid, toUserId);
      return { ok: false, raison: "le destinataire n'est pas inscrit" };
    }
    if (k === "live_video") {
      const live = await unSeul(admin, "video_lives", [["author_id", fromUid]]);
      if (live.erreur) return { ok: false, raison: "lecture video_lives" };
      if (!live.ligne || !recent(live.ligne, "started_at", maintenant, fenetre)) return { ok: false, raison: "aucun live récent de l'appelant" };
      const suit = await unSeul(admin, "follows", [["follower_id", toUserId], ["following_id", fromUid]]);
      if (suit.erreur) return { ok: false, raison: "lecture follows" };
      return suit.ligne ? { ok: true, raison: "" } : { ok: false, raison: "le destinataire ne suit pas l'appelant" };
    }
    if (k === "follow" || k === "follow_request" || k === "follow_accept") {
      const a = await unSeul(admin, "follows", [["follower_id", fromUid], ["following_id", toUserId]]);
      if (a.erreur) return { ok: false, raison: "lecture follows" };
      if (a.ligne) return { ok: true, raison: "" };
      const b = await unSeul(admin, "follows", [["follower_id", toUserId], ["following_id", fromUid]]);
      if (b.erreur) return { ok: false, raison: "lecture follows" };
      return b.ligne ? { ok: true, raison: "" } : { ok: false, raison: "aucun abonnement entre les deux comptes" };
    }
    return { ok: false, raison: "genre de notification inconnu : " + k };
  } catch (_e) { return { ok: false, raison: "exception" }; }
}
