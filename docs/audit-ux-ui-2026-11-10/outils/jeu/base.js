// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — SOCLE COMMUN (mode `compte`, faux serveur en mémoire)
//
// Personnes, suivis et quelques publications. Tout est inventé : aucun de ces
// identifiants, noms ou textes n'existe en production. Chaque domaine complète
// ce socle avec son propre fichier (outils/jeu/<domaine>.js) et l'appelle dans
// `demarrage.peupler` :
//
//   const base = require("../jeu/base");
//   demarrage: { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); /* + le sien */ } }
//
// Formes des lignes = celles que le client LIT (js/app-08 : supaLoadPosts,
// _resolveProfilesByIds…). `created_at` des tables `posts`, `stories`,
// `conv_messages`, `notifications`, `events`, `profiles` est un `timestamp`
// SANS fuseau (cf. CLAUDE.md, `supaTs`).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";

// Horodatage serveur sans fuseau, `minutes` avant maintenant.
function ilYA(minutes) { return new Date(Date.now() - minutes * 60000).toISOString().replace("Z", ""); }
function dans(minutes) { return new Date(Date.now() + minutes * 60000).toISOString().replace("Z", ""); }

function peupler(srv, ctx) {
  const { MOI, GENS, media } = ctx;
  const profil = (p, extra) => {
    const existant = srv.prof(p.id);
    const ligne = Object.assign({
      id: p.id, username: p.nom, emoji: "✨", color: "#7c3aed", avatar_url: null, is_private: false,
      passion_id: "musique", passions: [{ id: "musique", emoji: "🎵" }], bio: "",
    }, extra || {});
    if (existant) Object.assign(existant, ligne); else srv.t.profiles.push(ligne);
    if (!srv.t.user_safety.some((u) => u.user_id === p.id)) srv.t.user_safety.push({ user_id: p.id, majority_at: "2010-01-01" });
  };
  profil(MOI, { emoji: "🎧", bio: "Guitare le soir, rando le dimanche.\nLyon 7e.", passions: [{ id: "musique", emoji: "🎵" }] });
  profil(GENS.lea, { emoji: "🎸", avatar_url: media("avatar-1.jpg"), bio: "Luthière amatrice. Je répare, j'accorde, je joue.", passions: [{ id: "musique", emoji: "🎵" }, { id: "cuisine", emoji: "🍳" }] });
  profil(GENS.malik, { emoji: "🧗", avatar_url: media("avatar-2.jpg"), bio: "Grimpe en salle la semaine, falaise le week-end.", passion_id: "sport", passions: [{ id: "sport", emoji: "🏋️" }] });
  profil(GENS.ines, { emoji: "📷", avatar_url: media("avatar-3.jpg"), bio: "Argentique, 35 mm, développement maison.", passion_id: "photo", passions: [{ id: "photo", emoji: "📷" }] });
  profil(GENS.tom, { emoji: "🍳", avatar_url: media("avatar-4.jpg"), bio: "", passion_id: "cuisine", passions: [{ id: "cuisine", emoji: "🍳" }] });
  profil(GENS.prive, { emoji: "🔒", avatar_url: media("avatar-6.jpg"), bio: "Compte privé.", is_private: true });
  profil(GENS.long, { emoji: "🎻", avatar_url: media("avatar-5.jpg"), bio: "Violoncelliste, professeure de musique de chambre, organisatrice des rencontres « Cordes sensibles » — trois lignes de biographie pour éprouver les textes longs et les retours à la ligne.\nDeuxième paragraphe.\nTroisième paragraphe." });

  const suit = (a, b, statut) => srv.t.follows.push({ follower_id: a, following_id: b, status: statut || "accepted", created_at: ilYA(60 * 24 * 3) });
  suit(MOI.id, GENS.lea.id); suit(MOI.id, GENS.malik.id); suit(MOI.id, GENS.long.id);
  suit(GENS.lea.id, MOI.id); suit(GENS.ines.id, MOI.id); suit(GENS.tom.id, MOI.id);
  suit(MOI.id, GENS.prive.id, "pending");

  const post = (id, auteur, minutes, extra) => srv.t.posts.push(Object.assign({
    id, author_id: auteur.id, passion_id: "musique", mood: "creation", content: "", media_url: null,
    created_at: ilYA(minutes), is_reel: false, overlays: null, vlog: null, shared_from_post_id: null, shared_data: null, event_id: null,
  }, extra || {}));
  post("pa_lea_1", GENS.lea, 12, { content: "Chevalet recollé, cordes neuves. Elle sonne mieux qu'à l'achat.", media_url: media("photo-atelier.jpg") });
  post("pa_malik_1", GENS.malik, 55, { passion_id: "sport", mood: "irl", content: "Qui est partant pour la salle jeudi 19 h ? On se retrouve devant l'accueil." });
  post("pa_ines_1", GENS.ines, 140, { passion_id: "photo", mood: "learn", content: "Premier développement en noir et blanc : ce que j'ai appris.\n\n1. La température du révélateur compte plus que la marque.\n2. Agiter doucement, pas secouer.\n3. Le rinçage n'est pas une formalité.\n4. Sécher à l'abri de la poussière, vraiment à l'abri.\n\nJe détaille tout ça ci-dessous pour celles et ceux qui hésitent à se lancer : le matériel coûte moins cher qu'on le croit, la cuve se trouve d'occasion, et la première pellicule ratée fait partie du jeu.", media_url: media("photo-portrait.jpg") });
  post("pa_long_1", GENS.long, 300, { content: "Répétition ouverte samedi.", media_url: media("photo-panorama.jpg") });
  post("pa_lea_2", GENS.lea, 60 * 26, { content: "Trente secondes d'arpèges.", media_url: media("boucle.webm"), is_reel: true });
  post("pa_moi_1", MOI, 60 * 30, { content: "Ma première compo, soyez indulgents.", media_url: media("photo-carre.jpg") });
  return srv;
}

module.exports = { peupler, ilYA, dans };
