// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — TRANSVERSE (notifications, blocages, une activité)
//
// Tout est inventé. À appeler APRÈS `base.peupler` :
//   · peuplerNotifs(srv, ctx)    — une notification de chaque `kind` connu du
//                                   client (_notifEmoji, app-08:9157), lues et non lues ;
//   · peuplerVolume(srv, ctx)    — 45 notifications (le serveur en rend 30, l'état en garde 50) ;
//   · peuplerBlocages(srv, ctx)  — deux comptes bloqués (Tom, nom très long).
// Les textes reprennent EXACTEMENT les libellés écrits par l'application
// (`supaInsertNotif(…, "a aimé ton post")`, migrations `follows_notifier`) :
// c'est leur vocabulaire qu'on audite.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");
const { ilYA, dans } = base;

const EV_ID = "ev_tra_atelier";
const EV_SUPPR = "ev_tra_supprimee";

function activite(srv, ctx) {
  const { GENS, MOI, media } = ctx;
  if (srv.t.events.some((e) => e.id === EV_ID)) return;
  srv.t.events.push({
    id: EV_ID, author_id: GENS.lea.id, organizer_id: GENS.lea.id, title: "Atelier réglage de guitare", passion_id: "musique",
    lat: 45.764, lng: 4.8357, city: "Lyon", emoji: "🎸", date_at: dans(60 * 26), end_at: dans(60 * 28),
    description: "On apprend à régler la hauteur des cordes et le manche.", venue: "Atelier de la Croix-Rousse", address: "", contact: "",
    postal_code: "69004", price: 0, max_attendees: 8, external_link: "", event_type: "Atelier", cover_url: media("couverture-evenement.jpg"),
    status: "active", created_at: ilYA(60 * 30), updated_at: ilYA(60 * 30), co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  });
  srv.t.event_attendees.push({ event_id: EV_ID, user_id: MOI.id, rsvp: "going", created_at: ilYA(300), checked_in_at: null });
}

function peuplerNotifs(srv, ctx) {
  const { GENS, MOI } = ctx;
  activite(srv, ctx);
  const n = (id, kind, de, ref, texte, minutes, vue) => srv.t.notifications.push({
    id: "n_tra_" + id, user_id: MOI.id, kind, from_id: de ? de.id : null, ref_id: ref, content: (de ? de.nom + " " : "") + texte,
    seen: !!vue, created_at: ilYA(minutes),
  });
  // Non lues (récentes)
  n("like", "like", GENS.lea, "pa_moi_1", "a aimé ton post", 4);
  n("comment", "comment", GENS.malik, "pa_moi_1", "a commenté ton post", 9);
  n("mention", "mention", GENS.ines, "pa_ines_1", "t'a mentionné·e dans un commentaire", 15);
  n("follow", "follow", GENS.tom, GENS.tom.id, "a commencé à te suivre", 22);
  n("follow_request", "follow_request", GENS.prive, GENS.prive.id, "souhaite s'abonner à ton compte privé", 30);
  n("accept", "follow", GENS.prive, GENS.prive.id, "a accepté ta demande d'abonnement", 41);
  n("message", "message", GENS.lea, "conv_tra_inexistante", "t'a envoyé un message", 50);
  n("event_join", "event_join", GENS.malik, EV_ID, "a rejoint ton événement", 65);
  // Lues (plus anciennes)
  n("event_update", "event_update", GENS.lea, EV_ID, "une place s'est libérée, tu es inscrit·e !", 60 * 3, true);
  n("event_invite", "event_invite", GENS.lea, EV_ID, "t'invite à « Atelier réglage de guitare »", 60 * 5, true);
  n("event_cancelled", "event_cancelled", GENS.long, EV_SUPPR, "« Répétition ouverte » a été supprimé par l'organisateur", 60 * 8, true);
  n("event_feedback", "event_feedback", GENS.ines, EV_ID, "a laissé un avis ⭐⭐⭐⭐ sur ton activité", 60 * 20, true);
  n("reaction", "reaction", GENS.long, "pa_moi_1", "a réagi 😂 à ton post", 60 * 26, true);
  n("like_supprime", "like", GENS.tom, "pa_supprime_404", "a aimé ton commentaire", 60 * 30, true);
  n("moderation", "moderation", null, null, "Ta publication a été masquée après signalement, en attendant une vérification.", 60 * 50, true);
}

function peuplerVolume(srv, ctx) {
  const { GENS, MOI } = ctx;
  const gens = [GENS.lea, GENS.malik, GENS.ines, GENS.tom, GENS.long];
  const textes = [["like", "a aimé ton post"], ["comment", "a commenté ton post"], ["follow", "a commencé à te suivre"], ["like", "a aimé ton commentaire"]];
  for (let i = 0; i < 45; i++) {
    const g = gens[i % gens.length], t = textes[i % textes.length];
    srv.t.notifications.push({ id: "n_tra_v" + i, user_id: MOI.id, kind: t[0], from_id: g.id, ref_id: t[0] === "follow" ? g.id : "pa_moi_1", content: g.nom + " " + t[1], seen: i > 11, created_at: ilYA(5 + i * 37) });
  }
}

function peuplerBlocages(srv, ctx) {
  const { GENS, MOI } = ctx;
  srv.t.blocks.push({ blocker_id: MOI.id, blocked_id: GENS.tom.id, created_at: ilYA(60 * 24) });
  srv.t.blocks.push({ blocker_id: MOI.id, blocked_id: GENS.long.id, created_at: ilYA(60 * 48) });
}

module.exports = { peuplerNotifs, peuplerVolume, peuplerBlocages, activite, EV_ID };
