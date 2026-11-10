// Données fictives du domaine CRÉATION ET MÉDIAS. Complète outils/jeu/base.js.
// Tout est inventé.
//
//   ev_cre_passee — Léa, il y a 2 jours, MOI inscrit·e : porte « Partager mon
//                   expérience » (Studio pré-rempli, publication rattachée).
"use strict";
const path = require("path");
const base = require("./base");

const sansZ = (d) => d.toISOString().replace("Z", "");

function peupler(srv, ctx) {
  const { MOI, GENS, media } = ctx;
  base.peupler(srv, ctx);
  // Le référentiel SERVEUR des passions (table `passions`), comme en production :
  // sans lui, `estPassionCanonique` retombe sur les 19 du socle et le sélecteur
  // du Studio refuse toute passion fine — un artefact du banc, pas du produit.
  const ref = require(path.join(__dirname, "..", "..", "..", "..", "data", "passions-v1.json"));
  srv.t.passions = (ref.passions || []).map((p) => ({ id: p[0], status: "active" }));
  const debut = new Date(Date.now() - 2 * 24 * 3600 * 1000); debut.setHours(18, 0, 0, 0);
  const fin = new Date(debut.getTime() + 2 * 3600 * 1000);
  srv.t.events.push({
    id: "ev_cre_passee", author_id: GENS.lea.id, organizer_id: GENS.lea.id, title: "Atelier cordes et chevalets",
    passion_id: "musique", lat: 45.764, lng: 4.8357, city: "Lyon", emoji: "🎸", date_at: sansZ(debut), end_at: sansZ(fin),
    description: "On règle nos instruments ensemble.", venue: "Atelier des Cordes", address: "12 rue Fictive", contact: "",
    postal_code: "69001", price: 0, max_attendees: 10, external_link: "", event_type: "Atelier",
    cover_url: media("couverture-evenement.jpg"), status: "active", created_at: base.ilYA(60 * 24 * 6),
    updated_at: base.ilYA(60 * 24 * 6), co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  });
  srv.t.event_attendees.push(
    { event_id: "ev_cre_passee", user_id: GENS.lea.id, rsvp: "going", created_at: base.ilYA(60 * 24 * 5), checked_in_at: null },
    { event_id: "ev_cre_passee", user_id: MOI.id, rsvp: "going", created_at: base.ilYA(60 * 24 * 4), checked_in_at: null },
  );
  return srv;
}

module.exports = { peupler };
