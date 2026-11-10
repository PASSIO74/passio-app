// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — DOMAINE « PROFILS ET PASSIONS » (PRO-…)
//
// Complète outils/jeu/base.js. Deux moitiés :
//   · `peupler(srv, ctx, opts)` sème le FAUX SERVEUR : abonnés nombreux, une
//     demande d'abonnement en attente (avec sa notification `follow_request`),
//     publications et activité de Léa (profil visité riche), blocages ;
//   · `etat(media, opts)` construit l'ÉTAT LOCAL de Camille Audit (MOI) :
//     ses passions, sa bio multiligne, sa couverture et son avatar, et des
//     publications de TOUS les types. ⚠️ Mes publications vivent dans
//     `state.userPosts` (synchronisé par `user_state`, que le faux serveur ne
//     rejoue pas) : sans cet état, « Mon profil » serait vide quoi qu'il y ait
//     dans `posts`. C'est un artefact du banc, pas un défaut du produit.
// Tout est inventé : aucun nom, texte ou identifiant n'existe en production.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");

const NORA = { id: "a0d17000-0000-4000-8000-000000002101", nom: "Nora Petit" };
const PRENOMS = ["Adèle", "Basile", "Chloé", "Damien", "Élise", "Fabien", "Gaëlle", "Hugo", "Iris", "Jules", "Katia", "Louis", "Maëlle", "Nils", "Océane", "Paul", "Quentin", "Rose"];
const NOMS = ["Arnaud", "Besson", "Carré", "Dumas", "Esnault", "Ferrand", "Guérin", "Huet", "Imbert", "Joly", "Klein", "Lemoine", "Marchal", "Noël", "Olivier", "Perrot", "Quéré", "Roux"];
const abonneId = (i) => "a0d17000-0000-4000-8000-0000000030" + String(i).padStart(2, "0");

/**
 * opts : { abonnes: n (défaut 18), demande: bool (défaut true), moiPrive: bool,
 *          bloque: bool (MOI bloque Tom), bloquePar: bool (Inès bloque MOI) }
 */
function peupler(srv, ctx, opts) {
  opts = opts || {};
  const { MOI, GENS, media } = ctx;
  base.peupler(srv, ctx);
  const ajouterProfil = (id, nom, extra) => {
    if (!srv.prof(id)) srv.t.profiles.push(Object.assign({ id, username: nom, emoji: "✨", color: "#7c3aed", avatar_url: null, is_private: false, passion_id: "musique", passions: [{ id: "musique", emoji: "🎵" }], bio: "" }, extra || {}));
    if (!srv.t.user_safety.some((u) => u.user_id === id)) srv.t.user_safety.push({ user_id: id, majority_at: "2010-01-01" });
  };
  // Abonnés nombreux (liste « Abonnés » volumineuse).
  const n = opts.abonnes == null ? 18 : opts.abonnes;
  for (let i = 0; i < n; i++) {
    const id = abonneId(i);
    ajouterProfil(id, PRENOMS[i % PRENOMS.length] + " " + NOMS[i % NOMS.length], { emoji: ["🎸", "📷", "🍳", "🧗", "📚", "🎨"][i % 6], passion_id: ["musique", "photo", "cuisine", "sport", "litterature", "art"][i % 6], passions: [{ id: ["musique", "photo", "cuisine", "sport", "litterature", "art"][i % 6], emoji: ["🎵", "📷", "🍳", "🏋️", "📚", "🎨"][i % 6] }], avatar_url: i % 3 === 0 ? media("avatar-" + ((i % 6) + 1) + ".jpg") : null });
    srv.t.follows.push({ follower_id: id, following_id: MOI.id, status: "accepted", created_at: base.ilYA(60 * 24 * (i + 4)) });
  }
  // Une DEMANDE en attente vers MOI (Nora), avec la notification que le
  // déclencheur `follows_notifier` écrirait en production.
  ajouterProfil(NORA.id, NORA.nom, { emoji: "🌿", passion_id: "jardinage", passions: [{ id: "jardinage", emoji: "🌱" }], avatar_url: media("avatar-3.jpg"), bio: "Potager partagé, graines anciennes." });
  if (opts.demande !== false) {
    srv.t.follows.push({ follower_id: NORA.id, following_id: MOI.id, status: "pending", created_at: base.ilYA(25) });
    srv.t.notifications.push({ id: "fr_" + NORA.id.slice(-6) + "_" + MOI.id.slice(-6), user_id: MOI.id, from_id: NORA.id, kind: "follow_request", content: NORA.nom + " souhaite s'abonner à ton compte privé", read: false, created_at: base.ilYA(25), post_id: null });
  }
  if (opts.moiPrive) { const p = srv.prof(MOI.id); if (p) p.is_private = true; }
  // Léa : profil visité riche (photos, bobine, texte, activité organisée).
  const post = (id, auteur, minutes, extra) => srv.t.posts.push(Object.assign({
    id, author_id: auteur.id, passion_id: "musique", mood: "creation", content: "", media_url: null,
    created_at: base.ilYA(minutes), is_reel: false, overlays: null, vlog: null, shared_from_post_id: null, shared_data: null, event_id: null,
  }, extra || {}));
  post("pp_lea_3", GENS.lea, 60 * 50, { content: "Atelier du samedi : vernis au tampon.", media_url: media("photo-carre.jpg") });
  post("pp_lea_4", GENS.lea, 60 * 70, { passion_id: "cuisine", content: "Tarte aux mirabelles, recette de ma grand-mère.", media_url: media("photo-paysage.jpg") });
  post("pp_lea_5", GENS.lea, 60 * 90, { content: "Quelqu'un a déjà remplacé un sillet en os ? Je cherche des conseils." });
  post("pp_prive_1", GENS.prive, 60 * 6, { content: "Publication réservée aux abonnés.", media_url: media("photo-haute.jpg") });
  const jour = new Date(Date.now() + 5 * 24 * 3600 * 1000); jour.setHours(18, 30, 0, 0);
  const sansZ = (d) => d.toISOString().replace("Z", "");
  srv.t.events.push({
    id: "ev_pro_lea", author_id: GENS.lea.id, organizer_id: GENS.lea.id, title: "Atelier réglage de guitare", passion_id: "musique",
    lat: 45.76, lng: 4.84, city: "Lyon", emoji: "🎸", date_at: sansZ(jour), end_at: sansZ(new Date(jour.getTime() + 2 * 3600 * 1000)),
    description: "On règle vos guitares ensemble : action, intonation, cordes.", venue: "Atelier de la Croix-Rousse", postal_code: "69004",
    price: 0, max_attendees: 6, external_link: "", event_type: "Atelier", cover_url: media("photo-atelier.jpg"), status: "active",
    created_at: base.ilYA(60 * 8), updated_at: base.ilYA(60 * 8), co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  });
  if (opts.bloque) srv.t.blocks.push({ blocker_id: MOI.id, blocked_id: GENS.tom.id, created_at: base.ilYA(60) });
  if (opts.bloquePar) srv.t.blocks.push({ blocker_id: GENS.ines.id, blocked_id: MOI.id, created_at: base.ilYA(60) });
  return srv;
}

const BIO = "Guitare le soir, rando le dimanche.\nJe photographie les concerts de quartier.\nLyon 7e — toujours partante pour un bœuf.";
const BIO_LONGUE = "Guitariste autodidacte depuis douze ans, photographe de concerts de quartier, cuisinière du dimanche et randonneuse quand la météo le permet. "
  + "Je partage ici mes essais, mes ratés et mes petites victoires.\n\nJ'organise un bœuf acoustique tous les premiers samedis du mois.\nÉcris-moi pour venir !";

/**
 * État local de MOI. opts : { passions: n (1..5, défaut 3), posts: bool (défaut true),
 *   photos: bool (couverture + avatar, défaut true), bio: "courte"|"longue"|"aucune",
 *   archivee: bool (une passion archivée en plus), rs: bool (réseaux sociaux) }
 */
function etat(media, opts) {
  opts = opts || {};
  const P = [
    { passion: "musique", emoji: "🎵", color: "#7c3aed" },
    { passion: "photo", emoji: "📷", color: "#0ea5e9" },
    { passion: "cuisine", emoji: "🍳", color: "#f97316" },
    { passion: "voyage", emoji: "✈️", color: "#10b981" },
    { passion: "jardinage", emoji: "🌱", color: "#16a34a" },
  ];
  const nb = Math.max(1, Math.min(5, opts.passions || 3));
  const profiles = P.slice(0, nb).map((p, i) => ({ id: "pp_" + i, name: "Camille Audit", passion: p.passion, emoji: p.emoji, bio: "", color: p.color, createdAt: i + 1 }));
  if (opts.archivee) profiles.push({ id: "pp_arch", name: "Camille Audit", passion: "sport", emoji: "🏋️", bio: "", color: "#64748b", createdAt: 9, archived: true, archivedAt: Date.now() - 12 * 24 * 3600 * 1000 });
  const bio = opts.bio === "aucune" ? "" : opts.bio === "longue" ? BIO_LONGUE : BIO;
  const general = { username: "Camille Audit", bio };
  if (opts.photos !== false) { general.coverPhoto = media("couverture.jpg"); general.avatarPhoto = media("avatar-6.jpg"); }
  if (opts.rs) general.rsLinks = [{ platform: "instagram", url: "https://example.org/camille" }, { platform: "youtube", url: "https://example.org/camille-video" }];
  const H = 3600 * 1000, maintenant = Date.now();
  const p = (id, heures, extra) => Object.assign({ id, authorId: "a0d17000-0000-4000-8000-00000000a001", profileId: "pp_0", authorName: "Camille Audit", authorEmoji: "🎧", authorColor: "#7c3aed", passion: "musique", mood: "creation", type: "text", text: "", createdAt: maintenant - heures * H, timestamp: maintenant - heures * H, likes: 0, liked: false, comments: [] }, extra);
  const posts = opts.posts === false ? [] : [
    p("pm_photo_1", 3, { type: "photo", image: media("photo-atelier.jpg"), text: "Nouvelles cordes, nouveau son." }),
    p("pm_photo_2", 26, { type: "photo", passion: "photo", profileId: "pp_1", image: media("photo-panorama.jpg"), text: "Concert du quartier, vu du balcon." }),
    p("pm_video_1", 50, { type: "video", video: media("boucle.webm"), text: "Trente secondes de picking." }),
    p("pm_reel_1", 74, { type: "video", isReel: true, video: media("boucle.webm"), image: media("photo-haute.jpg"), text: "Bobine : accordage express." }),
    p("pm_audio_1", 98, { type: "audio", audio: media("boucle.webm"), text: "Maquette d'une compo, première prise." }),
    p("pm_texte_1", 120, { type: "text", passion: "cuisine", profileId: "pp_2", text: "Quelqu'un a une bonne recette de pâte à pizza sans pétrin ?" }),
    p("pm_photo_3", 150, { type: "photo", passion: "photo", profileId: "pp_1", image: media("photo-portrait.jpg"), text: "Portrait au 50 mm." }),
  ].filter((x) => nb > 1 || x.passion === "musique");
  return {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Camille Audit", birthYear: 1995, isMinor: false,
      currentProfileId: "pp_0", profiles,
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], savedCarnets: [], general,
    },
    userPosts: posts, userEvents: [], notifications: [],
    currentMood: "all", selectedFeedPassions: [],
  };
}

module.exports = { peupler, etat, NORA, abonneId, BIO, BIO_LONGUE };
