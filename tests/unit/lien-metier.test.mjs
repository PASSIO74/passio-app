// MSG-04 — le lien métier d'une push (supabase/functions/_shared/lien-metier.js).
//
// Le fichier testé est CELUI que Deno déploie dans `notify-call`. Le client
// Supabase est un FAUX scripté : chaque `from(table)` rend un constructeur qui
// mémorise ses filtres et résout depuis un jeu de lignes en mémoire — assez
// pour prouver la RÈGLE (quel lien ouvre la push, quel texte part), pas le SQL.
//   ① ② appel : 1:1 commune → ok ; groupe seul, aucune conversation, tiers → refus
//   ③ ④ notification : ligne récente de moi vers lui → ok, texte de LA LIGNE
//        (entités décodées) ; ligne ancienne, ligne d'un autre, ligne vers un
//        autre → refus
//   ⑤ identité : profil lu en base, bornée ; ligne absente → repli neutre
//   ⑥ une erreur de lecture est un REFUS (fail-closed), jamais une push
//   ⑦ decoderEntites : les cinq entités d'escapeHtml, et rien d'autre
import { test } from "node:test";
import assert from "node:assert/strict";
import { decoderEntites, identiteAppelant, lienAppel, lienNotification, lienEvenement } from "../../supabase/functions/_shared/lien-metier.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T0 = Date.parse("2026-09-14T10:00:00Z");

/** Faux client : `tables` = { nom: [lignes] } ; `pannes` = tables qui rendent une erreur. */
function fauxAdmin(tables, pannes = []) {
  return {
    from(table) {
      const filtres = [];
      let limite = null, ordre = null;
      const exec = () => {
        if (pannes.includes(table)) return { data: null, error: { message: "panne " + table } };
        let rows = (tables[table] || []).filter((r) => filtres.every((f) => f(r)));
        if (ordre) rows = rows.slice().sort((x, y) => (x[ordre.col] < y[ordre.col] ? 1 : -1) * (ordre.asc ? -1 : 1));
        if (limite != null) rows = rows.slice(0, limite);
        return { data: rows, error: null };
      };
      const b = {
        select() { return b; },
        eq(col, v) { filtres.push((r) => r[col] === v); return b; },
        in(col, vals) { filtres.push((r) => vals.includes(r[col])); return b; },
        gte(col, v) { filtres.push((r) => String(r[col]) >= String(v)); return b; },
        order(col, o) { ordre = { col, asc: !!(o && o.ascending) }; return b; },
        limit(n) { limite = n; return b; },
        maybeSingle() { const r = exec(); return Promise.resolve({ data: r.error ? null : (r.data[0] || null), error: r.error }); },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      return b;
    },
  };
}

const BASE = {
  profiles: [{ id: A, username: "Ben'j <b>x</b>", emoji: "🎸" }],
  conversations: [{ id: "dm_ab", is_group: false }, { id: "grp_abc", is_group: true }],
  conv_members: [
    { conv_id: "dm_ab", user_id: A }, { conv_id: "dm_ab", user_id: B },
    { conv_id: "grp_abc", user_id: A }, { conv_id: "grp_abc", user_id: B }, { conv_id: "grp_abc", user_id: C },
  ],
  notifications: [
    { from_id: A, user_id: B, kind: "message", content: "Ben&#39;j t&#39;a envoyé un message", created_at: new Date(T0 - 30_000).toISOString() },
    { from_id: A, user_id: C, kind: "like", content: "vieille", created_at: new Date(T0 - 3_600_000).toISOString() },
    { from_id: B, user_id: C, kind: "follow", content: "B te suit", created_at: new Date(T0 - 10_000).toISOString() },
  ],
};

test("① appel : une conversation 1:1 commune ouvre la push", async () => {
  assert.equal((await lienAppel(fauxAdmin(BASE), A, B)).ok, true);
});

test("② appel : un groupe commun ne suffit pas, ni l'absence de conversation, ni un tiers", async () => {
  // A et C ne partagent que le groupe.
  assert.equal((await lienAppel(fauxAdmin(BASE), A, C)).ok, false);
  // Un compte sans aucune conversation.
  assert.equal((await lienAppel(fauxAdmin(BASE), "dddddddd-dddd-4ddd-8ddd-dddddddddddd", B)).ok, false);
  // Le pair n'est dans aucune de mes conversations.
  const sansB = { ...BASE, conv_members: BASE.conv_members.filter((m) => m.user_id !== B) };
  assert.equal((await lienAppel(fauxAdmin(sansB), A, B)).ok, false);
});

test("③ notification : une ligne récente de moi vers lui ouvre la push, avec SON texte décodé", async () => {
  const r = await lienNotification(fauxAdmin(BASE), A, B, T0);
  assert.equal(r.ok, true);
  assert.equal(r.texte, "Ben'j t'a envoyé un message");
  assert.equal(r.kind, "message");
});

test("④ notification : ligne trop ancienne, ligne d'un autre émetteur, ligne vers un autre → refus", async () => {
  assert.equal((await lienNotification(fauxAdmin(BASE), A, C, T0)).ok, false, "1 h : hors fenêtre");
  assert.equal((await lienNotification(fauxAdmin(BASE), A, C, T0 - 3_599_000)).ok, true, "…mais dans la fenêtre à l'époque");
  assert.equal((await lienNotification(fauxAdmin(BASE), C, B, T0)).ok, false, "C n'a rien écrit vers B");
  assert.equal((await lienNotification(fauxAdmin(BASE), B, A, T0)).ok, false, "B n'a rien écrit vers A (sa ligne va vers C)");
});

test("⑤ identité : lue en base et bornée ; ligne absente → repli neutre", async () => {
  const idn = await identiteAppelant(fauxAdmin(BASE), A);
  assert.equal(idn.name, "Ben'j <b>x</b>"); // brut : c'est l'OS qui affiche, pas du HTML
  assert.equal(idn.emoji, "🎸");
  const long = { profiles: [{ id: A, username: "x".repeat(200), emoji: "🎸🎸🎸🎸🎸🎸🎸🎸🎸🎸" }] };
  const b = await identiteAppelant(fauxAdmin(long), A);
  assert.equal(Array.from(b.name).length, 60);
  assert.equal(Array.from(b.emoji).length, 8);
  assert.deepEqual(await identiteAppelant(fauxAdmin({ profiles: [] }), A), { name: "Quelqu'un", emoji: "📞" });
});

test("⑥ une erreur de lecture est un refus, jamais une push", async () => {
  assert.equal((await lienAppel(fauxAdmin(BASE, ["conv_members"]), A, B)).ok, false);
  assert.equal((await lienAppel(fauxAdmin(BASE, ["conversations"]), A, B)).ok, false);
  assert.equal((await lienNotification(fauxAdmin(BASE, ["notifications"]), A, B, T0)).ok, false);
  // L'identité, elle, replie : un nom manquant ne doit pas empêcher un appel légitime.
  assert.deepEqual(await identiteAppelant(fauxAdmin(BASE, ["profiles"]), A), { name: "Quelqu'un", emoji: "📞" });
});

test("⑦ decoderEntites : les cinq entités d'escapeHtml, dans le bon ordre", () => {
  assert.equal(decoderEntites("a &amp;lt; b"), "a &lt; b"); // &amp; décodé en dernier : pas de double décodage
  assert.equal(decoderEntites("&lt;b&gt; &quot;x&quot; &#39;y&#x27;"), "<b> \"x\" 'y'");
  assert.equal(decoderEntites(null), "");
});

// ── MSG-04, second étage (contre-revue Astra, 2026-09-15) : la ligne
// `notifications` est écrite par l'appelant lui-même et ne prouve rien. Une
// push n'est envoyée que si l'ÉVÉNEMENT MÉTIER existe en base et lie les deux
// comptes. Le faux admin ci-dessus suffit : `select().eq().limit()`.
const t = (s) => new Date(T0 - s * 1000).toISOString();
const EVT = {
  ...BASE,
  posts: [{ id: "post_b", author_id: B }, { id: "post_c", author_id: C }],
  profiles: [...BASE.profiles, { id: B, username: "Léa", emoji: "🌿" }, { id: C, username: "Chris", emoji: "🎿" }],
  post_likes: [{ post_id: "post_b", user_id: A }],
  // ⚠️ Les commentaires portent leur TEXTE : c'est lui qui dit QUI est mentionné.
  post_comments: [
    { id: "cm1", post_id: "post_b", author_id: A, content: "beau spot @Léa tu viens ?", created_at: t(30) },
    { id: "cm_quelconque", post_id: "post_b", author_id: A, content: "joli !", created_at: t(25) },
    { id: "cm_vieux", post_id: "post_c", author_id: A, content: "@Léa", created_at: t(7200) },
  ],
  conv_messages: [{ id: "m1", conv_id: "dm_ab", from_id: A, created_at: t(20) }, { id: "m_vieux", conv_id: "grp_abc", from_id: A, created_at: t(7200) }],
  events: [{ id: "ev1", author_id: B, organizer_id: B, co_organizers: [] }, { id: "ev_a", author_id: A, organizer_id: A, co_organizers: [] }],
  event_attendees: [{ event_id: "ev1", user_id: A, created_at: t(40), rated_at: null }, { event_id: "ev_a", user_id: B, created_at: t(9000) }],
  event_comments: [{ id: "ec1", event_id: "ev1", author_id: A, created_at: t(10) }],
  video_lives: [{ id: "live1", author_id: A, started_at: t(60) }],
  follows: [{ follower_id: B, following_id: A, status: "accepted" }],
};

test("⑧ ASTRA (RÉINJECTION) : une notification fabriquée SANS événement métier ne pousse rien", async () => {
  // Sur le code du 14/09 : la ligne `notifications` suffisait.
  const sans = { ...EVT, post_likes: [], post_comments: [], conv_messages: [] };
  assert.equal((await lienEvenement(fauxAdmin(sans), "like", A, B, "post_b", T0)).ok, false);
  assert.equal((await lienEvenement(fauxAdmin(sans), "comment", A, B, "post_b", T0)).ok, false);
  assert.equal((await lienEvenement(fauxAdmin(sans), "message", A, B, "dm_ab", T0)).ok, false);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "genre_inventé", A, B, "x", T0)).ok, false, "genre inconnu : refus");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "like", A, B, "", T0)).ok, false, "ref_id absent : refus");
});

test("⑨ message : un message récent de l'appelant dans une conversation du destinataire — et pas ailleurs", async () => {
  assert.equal((await lienEvenement(fauxAdmin(EVT), "message", A, B, "dm_ab", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "message", A, C, "dm_ab", T0)).ok, false, "C n'est pas membre de dm_ab");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "message", A, B, "grp_abc", T0)).ok, false, "le message du groupe est trop vieux");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "message", B, A, "dm_ab", T0)).ok, false, "B n'a rien écrit");
});

test("⑩ like / comment : sur une publication DU destinataire, par l'appelant, récemment", async () => {
  assert.equal((await lienEvenement(fauxAdmin(EVT), "like", A, B, "post_b", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "like", A, C, "post_b", T0)).ok, false, "C n'est pas l'auteur");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "comment", A, B, "post_b", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "comment", A, C, "post_c", T0)).ok, false, "commentaire trop vieux");
  // ⚠️ ASTRA-24 : « le commentaire récent suffit » était ce que mesurait cette
  // ligne, et c'était le défaut. Il faut désormais que le commentaire DÉSIGNE B.
  assert.equal((await lienEvenement(fauxAdmin(EVT), "mention", A, B, "post_b", T0)).ok, true, "mention : le commentaire nomme @Léa");
});

test("⑪ activités : participant → organisateur, organisateur → inscrit, invitation via une conversation 1:1", async () => {
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_join", A, B, "ev1", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_join", A, C, "ev1", T0)).ok, false, "C n'organise pas ev1");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_comment", A, B, "ev1", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_update", A, B, "ev_a", T0)).ok, true, "B est inscrit à ev_a");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_update", A, C, "ev_a", T0)).ok, false, "C n'est pas inscrit");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_update", B, A, "ev_a", T0)).ok, false, "B n'organise pas ev_a");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_invite", A, B, "ev_a", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "event_invite", A, C, "ev_a", T0)).ok, false, "C : ni inscrit, ni conversation 1:1 avec A");
});

test("⑫ live et abonnements : un live récent vers un abonné ; une ligne follows entre eux", async () => {
  assert.equal((await lienEvenement(fauxAdmin(EVT), "live_video", A, B, "live1", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "live_video", A, C, "live1", T0)).ok, false, "C ne suit pas A");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "follow", B, A, "", T0)).ok, true);
  assert.equal((await lienEvenement(fauxAdmin(EVT), "follow_accept", A, B, "", T0)).ok, true, "dans l'autre sens aussi");
  assert.equal((await lienEvenement(fauxAdmin(EVT), "follow", A, C, "", T0)).ok, false);
});

test("⑬ une lecture en erreur est un refus, jamais une push", async () => {
  assert.equal((await lienEvenement(fauxAdmin(EVT, ["post_likes"]), "like", A, B, "post_b", T0)).ok, false);
  assert.equal((await lienEvenement(fauxAdmin(EVT, ["conv_members"]), "message", A, B, "dm_ab", T0)).ok, false);
  assert.equal((await lienEvenement(fauxAdmin(EVT, ["events"]), "event_join", A, B, "ev1", T0)).ok, false);
});

test("⑭ lienNotification rend aussi le ref_id de la ligne, pour l'événement", async () => {
  const admin = fauxAdmin({ notifications: [{ from_id: A, user_id: B, kind: "like", content: "x", ref_id: "post_b", created_at: t(5) }] });
  const r = await lienNotification(admin, A, B, T0);
  assert.equal(r.ok, true); assert.equal(r.refId, "post_b");
});

// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-24 — UNE MENTION SANS DESTINATAIRE N'EST PAS UNE MENTION
//
// Le défaut : la branche « commentaire » n'exigeait que le commentaire de
// l'APPELANT sur `ref_id`, et ne regardait jamais `toUserId`. Combiné à la RLS
// de `notifications` (mesurée en production le 15/09 : tout compte peut écrire
// une ligne vers n'importe qui, avec le texte de son choix, du moment qu'il
// n'est pas bloqué), cela rendait le TEXTE LIBRE de push à un inconnu : la
// seule marche restante était ce lien métier.
// ═══════════════════════════════════════════════════════════════════════════
test("⑬ ASTRA-24 (RÉINJECTION) : commenter une publication ne permet pas de « mentionner » n'importe qui", async () => {
  // C n'est nommé dans aucun commentaire de A — sur le code d'avant, ce cas
  // passait, et A pouvait faire afficher son texte sur l'écran de C.
  assert.equal((await lienEvenement(fauxAdmin(EVT), "mention", A, C, "post_b", T0)).ok, false,
    "le destinataire n'est désigné par aucun commentaire");
  // Et la RAISON doit dire ce qui manque, pas laisser croire à un commentaire absent.
  const v = await lienEvenement(fauxAdmin(EVT), "mention", A, C, "post_b", T0);
  assert.match(v.raison, /DÉSIGNANT/, "un refus muet ou trompeur envoie enquêter à côté");
});

test("⑬ bis la mention légitime passe, y compris noyée dans d'autres commentaires", async () => {
  // Le commentaire qui mentionne n'est PAS le plus récent de A sur ce fil
  // (`cm_quelconque` l'est). Un `.limit(1)` sans `order` en aurait privé A au
  // hasard du plan : une garde intermittente se lit comme une panne.
  assert.equal((await lienEvenement(fauxAdmin(EVT), "mention", A, B, "post_b", T0)).ok, true);
  // Même règle que le client : insensible à la casse, sous-chaîne.
  const casse = { ...EVT, post_comments: [{ id: "x", post_id: "post_b", author_id: A, content: "salut @léa", created_at: t(10) }] };
  assert.equal((await lienEvenement(fauxAdmin(casse), "mention", A, B, "post_b", T0)).ok, true, "@léa vaut @Léa, comme côté client");
  // Le nom SANS l'arobase n'est pas une mention.
  const sansArobase = { ...EVT, post_comments: [{ id: "x", post_id: "post_b", author_id: A, content: "Léa était là", created_at: t(10) }] };
  assert.equal((await lienEvenement(fauxAdmin(sansArobase), "mention", A, B, "post_b", T0)).ok, false);
  // Un commentaire qui mentionne mais qui est TROP VIEUX ne rouvre rien.
  const vieux = { ...EVT, post_comments: [{ id: "x", post_id: "post_b", author_id: A, content: "@Léa", created_at: t(7200) }] };
  assert.equal((await lienEvenement(fauxAdmin(vieux), "mention", A, B, "post_b", T0)).ok, false);
});

test("⑬ ter fail-closed : un destinataire sans nom, ou une lecture en panne, ne pousse rien", async () => {
  // Sans `username`, aucune mention ne peut le désigner : on refuse plutôt que
  // de laisser passer « pas de nom, donc pas de contrainte ».
  const anonyme = { ...EVT, profiles: [...BASE.profiles, { id: B, username: "", emoji: "🌿" }] };
  assert.equal((await lienEvenement(fauxAdmin(anonyme), "mention", A, B, "post_b", T0)).ok, false);
  assert.equal((await lienEvenement(fauxAdmin(EVT, ["profiles"]), "mention", A, B, "post_b", T0)).ok, false, "lecture profiles en panne : refus");
  assert.equal((await lienEvenement(fauxAdmin(EVT, ["post_comments"]), "mention", A, B, "post_b", T0)).ok, false, "lecture commentaires en panne : refus");
});

test("⑭ la mention EN GROUPE reste gouvernée par l'appartenance, et c'est un choix écrit", async () => {
  // Elle n'exige pas que le message nomme la personne : dans un groupe, les
  // deux comptes peuvent déjà s'écrire, donc la push n'ouvre aucun canal neuf.
  // Le nom affiché d'un membre (`_groupMemberName`) n'est pas `profiles.username` :
  // exiger la concordance REFUSERAIT des mentions légitimes.
  const grp = { ...EVT, conv_messages: [{ id: "m", conv_id: "grp_abc", from_id: A, content: "coucou", created_at: t(20) }] };
  assert.equal((await lienEvenement(fauxAdmin(grp), "mention", A, B, "grp_abc", T0)).ok, true, "B est membre du groupe");
  const horsGroupe = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  assert.equal((await lienEvenement(fauxAdmin(grp), "mention", A, horsGroupe, "grp_abc", T0)).ok, false, "un non-membre reste dehors");
});

// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-24 (cinquième contre-revue, 15/09/2026) — la push n'était pas fermée :
// le texte poussé restait celui de l'émetteur, et « @Lea » désignait un nom,
// pas un compte. La décision entière vit dans `autoriserPushNotif`.
// ═══════════════════════════════════════════════════════════════════════════
import { autoriserPushNotif, textePush } from "../../supabase/functions/_shared/lien-metier.js";

test("ASTRA-24 ① REPRODUCTION : commentaire « Bonjour @Lea » + ligne 'mention' à texte libre → avant : ok, texte libre poussé ; après : refusé (origine client)", async () => {
  const tables = {
    ...BASE,
    profiles: [{ id: A, username: "Alex", emoji: "🎸" }, { id: B, username: "Lea", emoji: "🌿" }],
    posts: [{ id: "p1", author_id: C }],
    post_comments: [{ post_id: "p1", author_id: A, content: "Bonjour @Lea", created_at: new Date(T0 - 10_000).toISOString() }],
    notifications: [{ from_id: A, user_id: B, kind: "mention", ref_id: "p1", content: "texte libre sans rapport", created_at: new Date(T0 - 5_000).toISOString() }],
  };
  // AVANT : lienNotification.ok + lienEvenement.ok (la mention est dans le commentaire) → push du texte LIBRE.
  const lien = await lienNotification(fauxAdmin(tables), A, B, T0);
  const ev = await lienEvenement(fauxAdmin(tables), "mention", A, B, "p1", T0);
  assert.equal(lien.ok && ev.ok, true, "reproduction : les deux gardes d'avant disaient oui");
  assert.equal(lien.texte, "texte libre sans rapport", "reproduction : et le texte poussé était celui de l'émetteur");
  // APRÈS : la ligne est d'origine CLIENT → aucune push.
  const d = await autoriserPushNotif(fauxAdmin(tables), A, B, T0);
  assert.equal(d.ok, false);
  assert.match(d.raison, /origine client/);
});

test("ASTRA-24 ② une 'mention' écrite par le SERVEUR (origine serveur) pousse un texte DÉRIVÉ, jamais celui de la ligne", async () => {
  const tables = {
    ...BASE,
    profiles: [{ id: A, username: "Alex", emoji: "🎸" }],
    notifications: [{ from_id: A, user_id: B, kind: "mention", ref_id: "p1", origine: "serveur", content: "Alex t'a mentionné dans un commentaire", created_at: new Date(T0 - 5_000).toISOString() }],
  };
  const d = await autoriserPushNotif(fauxAdmin(tables), A, B, T0);
  assert.equal(d.ok, true, d.raison);
  assert.equal(d.texte, "Alex t'a mentionné");
  assert.equal(d.kind, "mention");
  // Même une ligne serveur au contenu bizarre ne pousse que le gabarit.
  tables.notifications[0].content = "<script>alert(1)</script> lis-moi";
  assert.equal((await autoriserPushNotif(fauxAdmin(tables), A, B, T0)).texte, "Alex t'a mentionné");
});

test("ASTRA-24 ③ les genres encore écrits par le client : événement exigé, texte DÉRIVÉ (le `content` de la ligne n'est plus poussé)", async () => {
  const tables = {
    ...BASE,
    profiles: [{ id: A, username: "Alex", emoji: "🎸" }],
    notifications: [{ from_id: A, user_id: B, kind: "message", ref_id: "grp_abc", content: "N'IMPORTE QUOI écrit par le client", created_at: new Date(T0 - 5_000).toISOString() }],
    conv_messages: [{ conv_id: "grp_abc", from_id: A, created_at: new Date(T0 - 8_000).toISOString() }],
  };
  const d = await autoriserPushNotif(fauxAdmin(tables), A, B, T0);
  assert.equal(d.ok, true, d.raison);
  assert.equal(d.texte, "Alex a écrit dans un groupe", "groupe : le gabarit de groupe, sans nom interprété");
  // Conversation 1:1 : autre gabarit.
  tables.notifications[0].ref_id = "dm_ab"; tables.conv_messages[0].conv_id = "dm_ab";
  assert.equal((await autoriserPushNotif(fauxAdmin(tables), A, B, T0)).texte, "Alex t'a envoyé un message");
  // Sans événement métier : refus, comme avant.
  tables.conv_messages = [];
  assert.equal((await autoriserPushNotif(fauxAdmin(tables), A, B, T0)).ok, false);
  // Un genre sans gabarit ne pousse rien.
  tables.notifications[0].kind = "genre_inconnu";
  assert.equal((await autoriserPushNotif(fauxAdmin(tables), A, B, T0)).ok, false);
});

test("ASTRA-24 ④ textePush : un gabarit par genre, le nom borné, l'inconnu nul", () => {
  assert.equal(textePush("like", "Camille"), "Camille a aimé ta publication");
  assert.equal(textePush("follow", ""), "Quelqu'un a commencé à te suivre");
  assert.equal(textePush("like", "x".repeat(80)).length <= 80 + 30, true);
  assert.equal(textePush("inconnu", "Camille"), null);
  assert.equal(textePush("mention", "Lea"), "Lea t'a mentionné");
});

test("ASTRA-24 ⑤ transition : sans colonne `origine` (migration non appliquée), une ligne 'mention' vaut 'client' et ne pousse pas ; les autres genres poussent avec le gabarit", async () => {
  const sansColonne = {
    ...BASE,
    profiles: [{ id: A, username: "Alex" }],
    notifications: [
      { from_id: A, user_id: B, kind: "mention", ref_id: "p1", content: "x", created_at: new Date(T0 - 5_000).toISOString() },
    ],
    posts: [{ id: "p1", author_id: C }],
    post_comments: [{ post_id: "p1", author_id: A, content: "@Lea", created_at: new Date(T0 - 6_000).toISOString() }],
  };
  assert.equal((await autoriserPushNotif(fauxAdmin(sansColonne), A, B, T0)).ok, false);
  sansColonne.notifications = [{ from_id: A, user_id: C, kind: "like", ref_id: "p1", content: "x", created_at: new Date(T0 - 5_000).toISOString() }];
  sansColonne.post_likes = [{ post_id: "p1", user_id: A, created_at: new Date(T0 - 6_000).toISOString() }];
  const d = await autoriserPushNotif(fauxAdmin(sansColonne), A, C, T0);
  assert.equal(d.ok, true, d.raison); assert.equal(d.texte, "Alex a aimé ta publication");
});
