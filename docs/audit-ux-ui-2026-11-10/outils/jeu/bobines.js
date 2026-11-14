// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — DOMAINE « BOBINES, STORIES ET LIVE »
//
// Complète le socle (outils/jeu/base.js). Tout est inventé : aucun identifiant,
// nom, texte ou lieu n'existe en production.
//
// ⚠️ MÉDIA VIDÉO. Le client type un média par son ADRESSE (`supaLoadPosts`,
// app-08:4979 : « .mp4 » ou « videos/ » → vidéo ; sinon photo). La bobine du
// socle `pa_lea_2` pointe `boucle.webm` sans ce marqueur : elle est donc lue
// comme une PHOTO (<img> sur un .webm, masquée en erreur) — un défaut du jeu
// de données, pas du produit. Ici, chaque vidéo porte le suffixe `#videos/`
// (même parade que `jeu/fil.js`) : le serveur statique sert le fichier, le
// client y voit une vidéo. Le Chromium du banc lit le webm ; le H.264 de
// production n'est pas éprouvé ici.
//
// Ce que ce jeu met en place (compte connecté : Camille Audit) :
//   · bobines : vidéo courte (Léa, avec discussion), vidéo reliée à une
//     ACTIVITÉ (Malik → « Voir l'activité »), photo avec texte superposé et
//     légende longue (Inès), nom d'auteur très long, vidéo INTROUVABLE (404,
//     Tom), ma propre bobine ;
//   · stories : Léa (2 : photo puis texte), Malik (vidéo, DÉJÀ VUE), Inès
//     (photo + texte superposé), Marie-Charlotte (texte), la mienne ;
//   · un live en cours (Tom) dans `video_lives`.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");
const fil = require("./fil");

const IDS = {
  lea: "pb_bob_lea", malik: "pb_bob_malik", ines: "pb_bob_ines", long: "pb_bob_long",
  erreur: "pb_bob_erreur", moi: "pb_bob_moi", socle: "pa_lea_2",
  activite: "ev_bob_bloc", live: "vl_bob_tom",
  stLea1: "st_bob_lea_1", stLea2: "st_bob_lea_2", stMalik: "st_bob_malik", stInes: "st_bob_ines", stLong: "st_bob_long", stMoi: "st_bob_moi",
};

const LEGENDE_LONGUE = "Développement d'une pellicule HP5 poussée à 1600 : la cuve, le révélateur à 20 °C, "
  + "l'agitation toutes les minutes, puis l'arrêt et le fixateur. Ce qui change tout, c'est la régularité du geste "
  + "et la patience au séchage. Je mets le détail des temps en commentaire pour celles et ceux qui veulent essayer "
  + "chez eux, sans labo, avec une simple salle de bain plongée dans le noir.";

function peupler(srv, ctx, opts) {
  opts = opts || {};
  const { MOI, GENS, media } = ctx;
  fil.completerFilCompteurs(srv);
  const video = (nom) => media(nom || "boucle.webm") + "#videos/";

  // ── Activité reliée à une bobine ─────────────────────────────────────────
  const d = new Date(Date.now() + 3 * 86400000); d.setUTCHours(17, 30, 0, 0);
  srv.t.events.push({
    id: IDS.activite, author_id: GENS.malik.id, organizer_id: GENS.malik.id, title: "Initiation bloc — salle Vertical",
    passion_id: "sport", lat: 45.7676, lng: 4.8799, city: "Villeurbanne", emoji: "🧗", date_at: d.toISOString().replace("Z", ""),
    description: "Deux heures pour découvrir le bloc. Chaussons prêtés.", venue: "Salle Vertical", postal_code: "69100", price: 0,
    max_attendees: 8, external_link: "", event_type: "Atelier", cover_url: media("couverture-evenement.jpg"), end_at: null, status: "active",
    updated_at: null, created_at: base.ilYA(60 * 30), co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  });

  // ── Bobines ──────────────────────────────────────────────────────────────
  if (!opts.sansBobines) {
    const reel = (id, auteur, minutes, extra) => srv.t.posts.push(Object.assign({
      id, author_id: auteur.id, passion_id: "musique", mood: "creation", content: "", media_url: null,
      created_at: base.ilYA(minutes), is_reel: true, overlays: null, vlog: null, shared_from_post_id: null, shared_data: null, event_id: null,
    }, extra || {}));
    reel(IDS.lea, GENS.lea, 8, { content: "Arpèges en do majeur, main droite seule. Trente secondes par jour suffisent.", media_url: video() });
    reel(IDS.malik, GENS.malik, 20, { passion_id: "sport", mood: "irl", content: "Le bloc jaune de samedi, en vrai c'est plus dur. Venez l'essayer avec nous.", media_url: video(), event_id: IDS.activite });
    reel(IDS.ines, GENS.ines, 45, {
      passion_id: "photo", mood: "learn", content: LEGENDE_LONGUE, media_url: media("photo-haute.jpg"),
      overlays: [{ type: "text", text: "HP5 @1600", x: 50, y: 22, size: 30, color: "#ffffff" }, { type: "emoji", emoji: "🎞️", x: 78, y: 34, size: 48 }],
    });
    reel(IDS.long, GENS.long, 70, { content: "Le passage difficile du deuxième mouvement, lentement.", media_url: video() });
    reel(IDS.erreur, GENS.tom, 95, { passion_id: "cuisine", content: "Le pliage des raviolis, version rapide.", media_url: media("introuvable.mp4") });
    reel(IDS.moi, MOI, 130, { content: "Mon premier essai de bobine : la grille d'accords de la semaine.", media_url: video() });

    // Discussion sur la bobine de Léa.
    const com = (id, pid, auteur, minutes, texte) => srv.t.post_comments.push({ id, post_id: pid, author_id: auteur.id, content: texte, created_at: base.ilYA(minutes) });
    com("c_bob_1", IDS.lea, GENS.malik, 6, "Ça a l'air simple, et pourtant…");
    com("c_bob_2", IDS.lea, GENS.ines, 5, "Tu fais ça avec un métronome ? Je n'arrive jamais à garder le tempo plus de deux mesures, surtout quand je change de corde.");
    com("c_bob_3", IDS.lea, GENS.long, 4, "Très propre. On en parle jeudi ?");
    const aime = (pid, qui) => srv.t.post_likes.push({ post_id: pid, user_id: qui.id, created_at: base.ilYA(3) });
    [GENS.malik, GENS.ines, GENS.tom].forEach((g) => aime(IDS.lea, g));
    [GENS.lea].forEach((g) => aime(IDS.malik, g));
  }

  // ── Stories (moins de 24 h) ──────────────────────────────────────────────
  if (!opts.sansStories) {
    const story = (id, auteur, minutes, extra) => srv.t.stories.push(Object.assign({
      id, author_id: auteur.id, passion_id: "musique", content: "", emoji: "✨", media_url: null, media_type: null, overlays: null, created_at: base.ilYA(minutes),
    }, extra || {}));
    story(IDS.stLea1, GENS.lea, 90, { content: "Atelier ouvert ce soir", media_url: media("photo-atelier.jpg"), media_type: "photo" });
    story(IDS.stLea2, GENS.lea, 30, { content: "Les cordes sont arrivées ! Qui passe les essayer avant samedi ?" });
    story(IDS.stMalik, GENS.malik, 200, { passion_id: "sport", content: "", media_url: video(), media_type: "video" });
    story(IDS.stInes, GENS.ines, 260, {
      passion_id: "photo", content: "Planche-contact", media_url: media("photo-paysage.jpg"), media_type: "photo",
      overlays: [{ type: "text", text: "Ce matin, lumière parfaite", x: 50, y: 18, size: 26, color: "#ffffff" }],
    });
    story(IDS.stLong, GENS.long, 400, { content: "Répétition jeudi 19 h, salle 3. Partitions du Schubert à imprimer avant, s'il vous plaît." });
    if (!opts.sansMaStory) story(IDS.stMoi, MOI, 50, { content: "Session guitare ce soir 🎸" });
    srv.t.story_views.push({ story_id: IDS.stMalik, user_id: MOI.id, created_at: base.ilYA(100) });
  }

  // ── Live en cours ────────────────────────────────────────────────────────
  if (opts.live) {
    srv.t.video_lives.push({
      id: IDS.live, author_id: GENS.tom.id, author_name: GENS.tom.nom, author_emoji: "🍳", author_photo: media("avatar-4.jpg"),
      title: "Pâtes fraîches en direct", status: "live", started_at: new Date(Date.now() - 7 * 60000).toISOString(), last_seen: new Date().toISOString(),
    });
  }
  return srv;
}

module.exports = { IDS, peupler, LEGENDE_LONGUE };
