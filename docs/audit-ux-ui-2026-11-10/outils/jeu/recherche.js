// Données fictives du domaine RECHERCHE ET DÉCOUVERTE. Complète outils/jeu/base.js.
// Tout est inventé.
//
//   · table `passions` (référentiel serveur) semée comme outils/jeu/creation.js :
//     sans elle `estPassionCanonique` retombe sur les 19 du socle (artefact du banc) ;
//   · Malik porte « Escalade » (passion fine) ; Inès « Photo » ;
//   · deux publications sur des passions fines (escalade, guitare électrique) ;
//   · Tom est BLOQUÉ par MOI (ligne `blocks`) : apparaît-il encore dans la recherche ?
//   · une activité à venir sur « Musique » à Lyon : la fiche de la passion la montre-t-elle ?
//   · `passionInconnue` (option) : une publication portant un identifiant absent du
//     référentiel et du socle (cas d'une passion perso d'une autre personne) — explique
//     la tuile « ✨ Passion » vue sur SOC-003.
"use strict";
const path = require("path");
const base = require("./base");

const sansZ = (d) => d.toISOString().replace("Z", "");

function peupler(srv, ctx, opts) {
  opts = opts || {};
  const { MOI, GENS, media } = ctx;
  base.peupler(srv, ctx);
  const ref = require(path.join(__dirname, "..", "..", "..", "..", "data", "passions-v1.json"));
  srv.t.passions = (ref.passions || []).map((p) => ({ id: p[0], status: "active" }));

  const malik = srv.prof(GENS.malik.id);
  Object.assign(malik, { passion_id: "sport-escalade", passions: [{ id: "sport-escalade", emoji: "🏋️", label: "Escalade" }, { id: "sport", emoji: "🏋️" }] });
  const lea = srv.prof(GENS.lea.id);
  Object.assign(lea, { passions: [{ id: "musique", emoji: "🎵" }, { id: "musique-guitare-electrique", emoji: "🎸", label: "Guitare électrique" }] });

  const post = (id, auteur, minutes, extra) => srv.t.posts.push(Object.assign({
    id, author_id: auteur.id, passion_id: "musique", mood: "creation", content: "", media_url: null,
    created_at: base.ilYA(minutes), is_reel: false, overlays: null, vlog: null, shared_from_post_id: null, shared_data: null, event_id: null,
  }, extra || {}));
  post("rec_malik_esc", GENS.malik, 90, { passion_id: "sport-escalade", content: "Voie en 6b enchaînée ce soir, les avant-bras s'en souviennent.", media_url: media("photo-haute.jpg") });
  post("rec_lea_gtr", GENS.lea, 200, { passion_id: "musique-guitare-electrique", content: "Nouvelle pédale de fuzz testée sur un vieux riff.", media_url: media("photo-carre.jpg") });
  if (opts.passionInconnue) post("rec_inconnue", GENS.ines, 30, { passion_id: "perso_tirage_cyanotype", content: "Tirage au cyanotype, premier essai au soleil." });

  if (opts.bloque !== false) srv.t.blocks.push({ blocker_id: MOI.id, blocked_id: GENS.tom.id, created_at: base.ilYA(60 * 24) });

  const debut = new Date(Date.now() + 3 * 24 * 3600 * 1000); debut.setHours(19, 0, 0, 0);
  srv.t.events.push({
    id: "ev_rec_jam", author_id: GENS.lea.id, organizer_id: GENS.lea.id, title: "Jam guitare au parc",
    passion_id: "musique", lat: 45.7578, lng: 4.8320, city: "Lyon", emoji: "🎸", date_at: sansZ(debut), end_at: sansZ(new Date(debut.getTime() + 2 * 3600 * 1000)),
    description: "On apporte nos instruments, on joue ensemble.", venue: "Parc de la Tête d'Or", address: "Entrée principale", contact: "",
    postal_code: "69006", price: 0, max_attendees: 12, external_link: "", event_type: "Rencontre",
    cover_url: media("couverture-evenement.jpg"), status: "active", created_at: base.ilYA(60 * 24 * 2),
    updated_at: base.ilYA(60 * 24 * 2), co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  });
  srv.t.event_attendees.push({ event_id: "ev_rec_jam", user_id: GENS.lea.id, rsvp: "going", created_at: base.ilYA(60 * 24 * 2), checked_in_at: null });
  return srv;
}

// État local : MOI a « Musique » (passion vivante) et l'a bloqué·e côté client aussi.
function etat(onboardedState, opts) {
  opts = opts || {};
  const e = onboardedState(1);
  e.user.name = "Camille Audit"; e.user.general.username = "Camille Audit";
  e.user.profiles.forEach((p) => { p.name = "Camille Audit"; });
  if (opts.bloque !== false) e.user.blocked = ["a0d17000-0000-4000-8000-00000000e005"];
  return e;
}

module.exports = { peupler, etat };
