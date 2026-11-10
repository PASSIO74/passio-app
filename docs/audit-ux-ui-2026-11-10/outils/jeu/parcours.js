// Données fictives du PARCOURS CŒUR : découvrir une publication → ouvrir le profil →
// suivre → écrire → rejoindre l'activité. Complète outils/jeu/base.js.
"use strict";
const base = require("./base");

function peupler(srv, ctx) {
  const { MOI, GENS, media } = ctx;
  base.peupler(srv, ctx);
  const tom = srv.prof(GENS.tom.id);
  if (tom) Object.assign(tom, { passion_id: "musique", passions: [{ id: "musique", emoji: "🎵" }, { id: "cuisine", emoji: "🍳" }], bio: "Guitare folk et cuisine du dimanche. Toujours partant pour un bœuf." });

  // Une activité organisée par Tom, samedi prochain, 8 places, 3 inscrits.
  const jour = new Date(Date.now() + 3 * 24 * 3600 * 1000); jour.setHours(15, 0, 0, 0);
  const fin = new Date(jour.getTime() + 2 * 3600 * 1000);
  const sansZ = (d) => d.toISOString().replace("Z", "");
  srv.t.events.push({
    id: "ev_parcours_boeuf", author_id: GENS.tom.id, organizer_id: GENS.tom.id, title: "Bœuf acoustique au parc de la Tête d'Or",
    passion_id: "musique", lat: 45.7772, lng: 4.8553, city: "Lyon", emoji: "🎸", date_at: sansZ(jour), end_at: sansZ(fin),
    description: "On se retrouve près du kiosque avec nos instruments. Tous niveaux, on joue ce qui vient. Apporte de l'eau et de quoi t'asseoir.",
    venue: "Kiosque du parc de la Tête d'Or", postal_code: "69006", price: 0, max_attendees: 8, external_link: "", event_type: "Rencontre",
    cover_url: media("couverture-evenement.jpg"), status: "active", created_at: base.ilYA(60 * 5), updated_at: base.ilYA(60 * 5),
    co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  });
  for (const [u, m] of [[GENS.tom.id, 290], [GENS.lea.id, 200], [GENS.ines.id, 90]]) {
    srv.t.event_attendees.push({ event_id: "ev_parcours_boeuf", user_id: u, rsvp: "going", created_at: base.ilYA(m), checked_in_at: null });
  }
  // La publication de Tom qui annonce l'activité (envie « Rencontrer », reliée par event_id).
  srv.t.posts.push({
    id: "pa_tom_boeuf", author_id: GENS.tom.id, passion_id: "musique", mood: "irl",
    content: "Qui vient jouer samedi ? Bœuf acoustique au parc, tous niveaux. J'apporte une deuxième guitare pour qui n'en a pas.",
    media_url: media("photo-paysage.jpg"), created_at: base.ilYA(4), is_reel: false, overlays: null, vlog: null,
    shared_from_post_id: null, shared_data: null, event_id: "ev_parcours_boeuf",
  });
  srv.t.post_likes.push({ post_id: "pa_tom_boeuf", user_id: GENS.lea.id, created_at: base.ilYA(3) });
  srv.t.post_comments.push({ id: "pc_parcours_1", post_id: "pa_tom_boeuf", author_id: GENS.lea.id, content: "J'en suis, je prends le cajón.", created_at: base.ilYA(2) });
  return srv;
}

module.exports = { peupler };
