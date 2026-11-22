// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — DOMAINE « PARTAGE, LIENS ET INVITATION »
//
// Complète le socle (outils/jeu/base.js). Tout est inventé : aucun identifiant,
// nom, texte ou lieu n'existe en production.
//
// Ce que ce jeu permet d'ouvrir au bout d'un lien :
//   · publication publique          pa_lea_1        (socle)            → s'ouvre
//   · publication d'un compte privé pa_prive_1      (Sacha Privé)      → la RLS la tait
//   · publication supprimée         pa_supprimee_1  (aucune ligne)     → « introuvable »
//   · bobine                        pa_lea_2        (socle)            → lecteur
//   · activité à venir (autrui)     ev_par_lea      (Léa Fontaine)
//   · activité à venir (la mienne)  ev_par_moi      (Camille Audit)    → outils d'organisation
//   · activité passée (j'y étais)   ev_par_passee                      → « Partager mon expérience »
//   · activité annulée              ev_par_annulee
//   · activité inconnue             ev_par_inconnue (aucune ligne)     → « introuvable »
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");

const IDS = {
  postPublic: "pa_lea_1",
  postLong: "pa_ines_1",
  postPrive: "pa_prive_1",
  postSupprime: "pa_supprimee_1",
  bobine: "pa_lea_2",
  evAutrui: "ev_par_lea",
  evMoi: "ev_par_moi",
  evPasse: "ev_par_passee",
  evAnnule: "ev_par_annulee",
  evInconnu: "ev_par_inconnue",
  evTitreLong: "ev_par_long",
};

// Horodatage serveur SANS fuseau (UTC), `jours` plus tard, à `heure` h (heure UTC).
function dansJours(jours, heureUtc) {
  const d = new Date(Date.now() + jours * 86400000);
  d.setUTCHours(heureUtc == null ? 17 : heureUtc, 0, 0, 0);
  return d.toISOString().replace("Z", "");
}

function peupler(srv, ctx) {
  const { MOI, GENS, media } = ctx;

  // ── Publications ────────────────────────────────────────────────────────
  const post = (id, auteur, minutes, extra) => srv.t.posts.push(Object.assign({
    id, author_id: auteur.id, passion_id: "musique", mood: "creation", content: "", media_url: null,
    created_at: base.ilYA(minutes), is_reel: false, overlays: null, vlog: null, shared_from_post_id: null, shared_data: null, event_id: null,
  }, extra || {}));
  // Compte PRIVÉ : la policy de `posts` ne la rend ni à un visiteur ni à un
  // compte dont la demande d'abonnement est encore en attente (cas de MOI).
  post(IDS.postPrive, GENS.prive, 90, { content: "Répétition privée du quatuor — réservé à mes abonnés.", media_url: media("photo-haute.jpg") });

  // ── Activités ───────────────────────────────────────────────────────────
  const ev = (id, auteur, extra) => srv.t.events.push(Object.assign({
    id, author_id: auteur.id, organizer_id: auteur.id, title: "Activité", passion_id: "musique",
    lat: 45.7578, lng: 4.8320, city: "Lyon", emoji: "🎸", date_at: dansJours(3, 17), description: "",
    venue: "", postal_code: "69007", price: 0, max_attendees: 12, external_link: "", event_type: "Atelier",
    cover_url: null, end_at: null, status: "active", updated_at: null, created_at: base.ilYA(60 * 20),
    co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  }, extra || {}));
  const vient = (evId, qui, rsvp) => srv.t.event_attendees.push({ event_id: evId, user_id: qui.id, rsvp: rsvp || "going", checked_in_at: null, created_at: base.ilYA(60 * 5) });

  ev(IDS.evAutrui, GENS.lea, {
    title: "Atelier lutherie : régler son chevalet", venue: "Atelier des Cordes", cover_url: media("couverture-evenement.jpg"),
    description: "Deux heures pour apprendre à régler la hauteur des cordes. Apporte ta guitare, les outils sont sur place.",
  });
  vient(IDS.evAutrui, GENS.lea); vient(IDS.evAutrui, GENS.malik); vient(IDS.evAutrui, GENS.ines, "maybe");

  ev(IDS.evMoi, MOI, {
    title: "Bœuf acoustique au parc", venue: "Parc de la Tête d'Or — kiosque", emoji: "🎶", date_at: dansJours(5, 16),
    description: "On joue ce qu'on aime, sans ampli. Débutants bienvenus.", event_type: "Rencontre",
  });
  vient(IDS.evMoi, MOI); vient(IDS.evMoi, GENS.tom);

  ev(IDS.evPasse, GENS.malik, {
    title: "Initiation grimpe en salle", passion_id: "sport", emoji: "🧗", venue: "Salle Vertical", city: "Villeurbanne",
    date_at: dansJours(-4, 18), created_at: base.ilYA(60 * 24 * 9),
  });
  vient(IDS.evPasse, GENS.malik); vient(IDS.evPasse, MOI);

  ev(IDS.evAnnule, GENS.ines, {
    title: "Sortie photo au lever du jour", passion_id: "photographie", emoji: "📷", venue: "Quai Saint-Antoine",
    date_at: dansJours(2, 5), status: "cancelled",
  });

  ev(IDS.evTitreLong, GENS.long, {
    title: "Rencontre « Cordes sensibles » : musique de chambre pour amateurs, lecture à vue et pique-nique partagé", emoji: "🎻",
    venue: "Conservatoire à rayonnement régional — salle Debussy", city: "Saint-Rémy-lès-Chevreuse", date_at: dansJours(8, 13),
  });
  vient(IDS.evTitreLong, GENS.long);

  return srv;
}

module.exports = { IDS, peupler, dansJours };
