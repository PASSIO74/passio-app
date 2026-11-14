// Données fictives du domaine RENCONTRES IRL — FICHE, PARTICIPATION, ORGANISATION.
// Complète outils/jeu/base.js. Tout est inventé.
//
// Activités semées (préfixe ev_if_) :
//   avenir     — Tom, dans 3 jours, 8 places, 3 inscrits (cas nominal)
//   jour       — Léa, aujourd'hui dans 3 h, sans limite de places
//   complete   — Malik, 4 places, 4 inscrits, 2 en liste d'attente
//   passee     — Inès, il y a 2 jours, MOI inscrit·e (avis possible), 2 commentaires
//   annulee    — Tom, annulée, MOI inscrit·e
//   mienne     — MOI organise, dans 5 jours, 6 places, 4 inscrits + 1 peut-être
//   payante    — « long », 15 €, titre et description très longs, lien externe
//   prive      — compte privé, dans 6 jours
//   live       — Léa, commencée il y a 30 min, MOI inscrit·e (pointage)
//   presque    — Tom, 5 places, 4 inscrits (refus « complète » rejoué par le serveur)
"use strict";
const base = require("./base");

const sansZ = (d) => d.toISOString().replace("Z", "");
function aHeure(joursDepuisAuj, h, m) {
  const d = new Date(Date.now() + joursDepuisAuj * 24 * 3600 * 1000);
  d.setHours(h, m || 0, 0, 0);
  return d;
}

function peupler(srv, ctx) {
  const { MOI, GENS, media } = ctx;
  base.peupler(srv, ctx);

  const ev = (id, auteur, debut, dureeH, extra) => {
    const fin = new Date(debut.getTime() + dureeH * 3600 * 1000);
    srv.t.events.push(Object.assign({
      id, author_id: auteur.id, organizer_id: auteur.id, title: "Activité", passion_id: "musique",
      lat: 45.764, lng: 4.8357, city: "Lyon", emoji: "🎸", date_at: sansZ(debut), end_at: sansZ(fin),
      description: "", venue: "", address: "", contact: "", postal_code: "69001", price: 0, max_attendees: null,
      external_link: "", event_type: "Rencontre", cover_url: media("couverture-evenement.jpg"), status: "active",
      created_at: base.ilYA(60 * 30), updated_at: base.ilYA(60 * 30), co_organizers: [], series_id: null,
      recurrence: "none", conv_id: null,
    }, extra || {}));
  };
  const inscrit = (evId, uid, rsvp, minutes, extra) => srv.t.event_attendees.push(Object.assign({
    event_id: evId, user_id: uid, rsvp: rsvp || "going", created_at: base.ilYA(minutes || 100), checked_in_at: null,
  }, extra || {}));

  // ① À venir — cas nominal (Tom)
  ev("ev_if_avenir", GENS.tom, aHeure(3, 15), 2, {
    title: "Bœuf acoustique au kiosque", venue: "Kiosque du parc", address: "Parc de la Tête d'Or", postal_code: "69006",
    description: "On se retrouve près du kiosque avec nos instruments. Tous niveaux, on joue ce qui vient.\nApporte de l'eau et de quoi t'asseoir.",
    max_attendees: 8, lat: 45.7772, lng: 4.8553, contact: "tom.girard@exemple.test",
  });
  inscrit("ev_if_avenir", GENS.tom.id, "going", 290);
  inscrit("ev_if_avenir", GENS.lea.id, "going", 200);
  inscrit("ev_if_avenir", GENS.ines.id, "going", 90);
  srv.t.event_comments.push(
    { id: "ec_if_1", event_id: "ev_if_avenir", author_id: GENS.lea.id, author_name: GENS.lea.nom, text: "Je prends le cajón !", created_at: base.ilYA(80) },
    { id: "ec_if_2", event_id: "ev_if_avenir", author_id: GENS.tom.id, author_name: GENS.tom.nom, text: "Parfait. S'il pleut on se replie sous le kiosque.", created_at: base.ilYA(60) },
  );

  // ② Aujourd'hui (Léa), sans limite
  const dansTroisH = new Date(Date.now() + 3 * 3600 * 1000); dansTroisH.setMinutes(0, 0, 0);
  ev("ev_if_jour", GENS.lea, dansTroisH, 2, {
    title: "Atelier réglage de guitare", passion_id: "musique", venue: "Atelier de Léa", address: "8 rue des Luthiers",
    description: "Apporte ta guitare, on règle la hauteur des cordes et le manche ensemble.", event_type: "Atelier",
  });
  inscrit("ev_if_jour", GENS.lea.id, "going", 500);
  inscrit("ev_if_jour", GENS.malik.id, "going", 300);

  // ③ Complète avec liste d'attente (Malik)
  ev("ev_if_complete", GENS.malik, aHeure(4, 19), 2, {
    title: "Initiation escalade en salle", passion_id: "sport", emoji: "🧗", event_type: "Sport & activité",
    venue: "Salle Vertige", address: "21 quai Perrache", postal_code: "69002", max_attendees: 4, price: 8,
    description: "Baudriers prêtés. Chaussons en location sur place (5 €).",
  });
  for (const [u, m] of [[GENS.malik.id, 900], [GENS.lea.id, 700], [GENS.tom.id, 500], [GENS.ines.id, 400]]) inscrit("ev_if_complete", u, "going", m);
  inscrit("ev_if_complete", GENS.long.id, "waitlist", 200);
  inscrit("ev_if_complete", GENS.prive.id, "waitlist", 100);

  // ④ Passée (Inès) — MOI y était
  ev("ev_if_passee", GENS.ines, aHeure(-2, 10), 3, {
    title: "Balade photo argentique dans le Vieux-Lyon", passion_id: "photo", emoji: "📷", event_type: "Rencontre",
    venue: "Place Saint-Jean", description: "Une pellicule chacun, on échange nos réglages.", max_attendees: 10,
  });
  inscrit("ev_if_passee", GENS.ines.id, "going", 60 * 24 * 5);
  inscrit("ev_if_passee", MOI.id, "going", 60 * 24 * 4);
  inscrit("ev_if_passee", GENS.tom.id, "going", 60 * 24 * 4);

  // ⑤ Annulée (Tom) — MOI inscrit·e
  ev("ev_if_annulee", GENS.tom, aHeure(2, 12), 2, {
    title: "Pique-nique cuisine du monde", passion_id: "cuisine", emoji: "🍳", status: "cancelled",
    venue: "Berges du Rhône", description: "Chacun apporte un plat de son enfance.",
  });
  inscrit("ev_if_annulee", GENS.tom.id, "going", 3000);
  inscrit("ev_if_annulee", MOI.id, "going", 2000);

  // ⑥ La mienne (MOI organise)
  ev("ev_if_mienne", MOI, aHeure(5, 20), 2, {
    title: "Scène ouverte guitare-voix", venue: "Bar Le Comptoir", address: "3 place Sathonay", postal_code: "69001",
    description: "Deux morceaux chacun, ampli fourni. Inscription des passages sur place.", max_attendees: 6,
    contact: "06 12 34 56 78",
  });
  inscrit("ev_if_mienne", MOI.id, "going", 2000);
  inscrit("ev_if_mienne", GENS.lea.id, "going", 1500);
  inscrit("ev_if_mienne", GENS.malik.id, "going", 1200);
  inscrit("ev_if_mienne", GENS.tom.id, "going", 600);
  inscrit("ev_if_mienne", GENS.ines.id, "maybe", 300);

  // ⑦ Payante, textes très longs (Marie-Charlotte)
  ev("ev_if_payante", GENS.long, aHeure(8, 18, 30), 3, {
    title: "Masterclass de musique de chambre : interpréter les quatuors de Beethoven avec un public bienveillant",
    passion_id: "musique", emoji: "🎻", event_type: "Cours", price: 15, max_attendees: 20,
    venue: "Salle des Cordes sensibles — Conservatoire associatif du 4e arrondissement", address: "112 boulevard de la Croix-Rousse",
    postal_code: "69004", external_link: "https://billetterie.exemple.test/cordes-sensibles/masterclass-beethoven-quatuors",
    description: Array.from({ length: 6 }, (_, i) => "Paragraphe " + (i + 1) + " : on travaillera la respiration commune, l'écoute des voix intérieures et la manière de tenir un tempo sans chef. Les partitions sont envoyées une semaine avant.").join("\n\n"),
  });
  inscrit("ev_if_payante", GENS.long.id, "going", 3000);
  inscrit("ev_if_payante", GENS.lea.id, "going", 1000);

  // ⑧ Compte privé organisateur
  ev("ev_if_prive", GENS.prive, aHeure(6, 18), 2, {
    title: "Club de lecture à voix haute", passion_id: "musique", emoji: "📚", event_type: "Book club",
    venue: "Bibliothèque du quartier", description: "On lit à tour de rôle.",
  });
  inscrit("ev_if_prive", GENS.prive.id, "going", 1000);

  // ⑨ En cours (Léa) — MOI inscrit·e : pointage possible
  const ilYa30 = new Date(Date.now() - 30 * 60 * 1000);
  ev("ev_if_live", GENS.lea, ilYa30, 2, {
    title: "Jam du jeudi soir", venue: "Péniche La Note", address: "Quai Rambaud", description: "Jam ouverte.",
  });
  inscrit("ev_if_live", GENS.lea.id, "going", 3000);
  inscrit("ev_if_live", MOI.id, "going", 2000);

  // ⑩ Presque complète (Tom) : 5 places, 4 inscrits
  ev("ev_if_presque", GENS.tom, aHeure(7, 11), 2, {
    title: "Brunch des musiciens", passion_id: "cuisine", emoji: "🥐", max_attendees: 5, venue: "Café Lumière",
    description: "On partage un brunch et nos playlists.",
  });
  for (const [u, m] of [[GENS.tom.id, 900], [GENS.lea.id, 800], [GENS.malik.id, 700], [GENS.ines.id, 600]]) inscrit("ev_if_presque", u, "going", m);

  // Publication « Rencontrer » de Tom reliée à l'activité à venir (porte d'entrée depuis le fil).
  srv.t.posts.push({
    id: "pa_if_tom", author_id: GENS.tom.id, passion_id: "musique", mood: "irl",
    content: "Qui vient jouer samedi ? Bœuf acoustique au kiosque, tous niveaux.",
    media_url: media("photo-paysage.jpg"), created_at: base.ilYA(4), is_reel: false, overlays: null, vlog: null,
    shared_from_post_id: null, shared_data: null, event_id: "ev_if_avenir",
  });
  return srv;
}

// Fait « remplir » une activité côté serveur APRÈS le chargement du client
// (refus « complète » rejoué par le déclencheur du faux serveur).
function remplirEnDouce(srv, evId, uid) {
  srv.t.event_attendees.push({ event_id: evId, user_id: uid, rsvp: "going", created_at: base.ilYA(1), checked_in_at: null });
}

module.exports = { peupler, remplirEnDouce };
