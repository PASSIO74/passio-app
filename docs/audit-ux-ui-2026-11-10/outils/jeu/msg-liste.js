// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — MESSAGERIE : LISTE, GROUPES, PARAMÈTRES, APPELS
//
// Tout est inventé : personnes, conversations, messages, groupes, activité.
// Aucun identifiant, nom ou texte n'existe en production.
//
// Trois volumes, à appeler dans `demarrage.peupler` APRÈS `base.peupler` :
//   · rien            → un compte sans conversation serveur (la liste montre
//                        alors les cinq « Exemple PASSIO » de l'application) ;
//   · peuplerQuelques → 12 conversations qui couvrent tous les types d'aperçu ;
//   · peuplerVolume   → 46 conversations (pagination à 30, tri, recherche).
//
// Les drapeaux PUREMENT LOCAUX (épinglée, archivée, sourdine, brouillon, fond)
// ne vivent pas en base : `drapeauxLocaux(page, {...})` les pose APRÈS le
// démarrage, par `page.evaluate` — état « simulé », à déclarer comme tel.
//
// ⚠️ Les identifiants `conv_lea`, `conv_theo`, `conv_nina`, `conv_karim`,
// `conv_sofia` sont ceux des exemples embarqués (`SEED_CONVERSATIONS`) : une
// conversation qui porterait l'un d'eux serait rendue comme un exemple.
// Tous les identifiants d'ici commencent donc par `cva_` / `grp_a_` / `evgrp_a_`.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");
const { ilYA } = base;

// Personnes supplémentaires (liste volumineuse). Prénoms et noms composés au hasard.
const PRENOMS = ["Anaïs", "Bastien", "Clémence", "Driss", "Élodie", "Farid", "Gaëlle", "Hugo", "Isaline", "Jordan", "Katia", "Loïc", "Maëlys", "Nolan", "Océane", "Pablo", "Quitterie", "Rayan", "Solène", "Titouan", "Ulysse", "Violette", "Wassim", "Xavière", "Yanis", "Zélie", "Adèle", "Baptiste", "Capucine", "Diego", "Emma", "Florian", "Garance", "Hippolyte", "Iris", "Jules", "Kenza", "Léon", "Margaux", "Nino"];
const NOMS = ["Roche", "Leroy", "Vasseur", "Haddad", "Perrin", "Mansouri", "Le Goff", "Barbier", "Charpentier", "Meunier", "Volkov", "Kerbrat", "Dumas", "Ferrand", "Rivière", "Navarro", "de Montal", "Belkacem", "Aubert", "Guillou", "Marchetti", "Blanchard", "Chaoui", "Lemoine", "Benhamou", "Carpentier", "Jacquet", "Renaud", "Fabre", "Ortega", "Collin", "Masson", "Besnard", "Tessier", "Cordier", "Maillard", "Idrissi", "Poulain", "Hamel", "Rossi"];
const EMOJIS = ["🎸", "🧗", "📷", "🍳", "🎻", "🥾", "🎨", "📚", "🚲", "🧶", "🎹", "🏊", "🌱", "🎭", "♟️", "🛹", "🧘", "🪴", "🎤", "🏺"];
const PASSIONS = [["musique", "🎵"], ["sport", "🏋️"], ["photographie", "📷"], ["cuisine", "🍳"]];

function personnesSupplementaires() {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const n = String(i + 1).padStart(2, "0");
    out.push({ id: "a0d17000-0000-4000-8000-0000000020" + n, nom: PRENOMS[i] + " " + NOMS[i], emoji: EMOJIS[i % EMOJIS.length], passion: PASSIONS[i % PASSIONS.length], avatar: (i % 3 === 0) ? "avatar-" + ((i % 6) + 1) + ".jpg" : null });
  }
  return out;
}

// ── Enveloppes de contenu, telles que le client les écrit (app-09) ──────────
const contenu = {
  photo: (url) => JSON.stringify({ type: "media", filename: "photo.jpg", fileType: "image/jpeg", url, text: "[MEDIA] photo.jpg" }),
  video: (url) => JSON.stringify({ type: "media", filename: "clip.webm", fileType: "video/webm", url, text: "[MEDIA] clip.webm" }),
  vocal: (url, s) => JSON.stringify({ type: "audio", filename: "Message vocal (" + (s || 12) + "s)", fileType: "audio/webm", url, text: "[AUDIO] Message vocal (" + (s || 12) + "s)" }),
  audio: (url, nom) => JSON.stringify({ type: "audio", filename: nom || "maquette.mp3", fileType: "audio/mpeg", url, text: "[AUDIO] " + (nom || "maquette.mp3") }),
  doc: (url, nom) => JSON.stringify({ type: "doc", filename: nom || "topo-falaise.pdf", fileType: "application/pdf", url, text: "[DOC] " + (nom || "topo-falaise.pdf") }),
  gif: (url) => JSON.stringify({ type: "gif", url, text: "🎬 GIF" }),
  position: () => JSON.stringify({ type: "location", lat: 45.75, lng: 4.85, url: "https://maps.google.com/?q=45.75000,4.85000", text: "📍 Ma position : https://maps.google.com/?q=45.75000,4.85000" }),
};

function outils(srv) {
  let n = 0;
  return {
    conv(id, createur, membres, extra) {
      srv.t.conversations.push(Object.assign({ id, is_group: false, group_name: null, passion_id: null, created_by: createur, created_at: ilYA(60 * 24 * 20) }, extra || {}));
      membres.forEach((u) => srv.t.conv_members.push({ conv_id: id, user_id: u }));
    },
    msg(convId, de, minutes, content) {
      srv.t.conv_messages.push({ id: "ma_" + String(++n).padStart(4, "0"), conv_id: convId, from_id: de, content, created_at: ilYA(minutes) });
    },
    lu(convId, uid, minutes) {
      srv.t.conv_reads.push({ conv_id: convId, user_id: uid, last_read_at: ilYA(minutes) });
    },
  };
}

const ID = {
  lea: "cva_lea", malik: "cva_malik", ines: "cva_ines", tom: "cva_tom", long: "cva_long", prive: "cva_prive",
  groupe: "grp_a_grimpe", activite: "evgrp_a_repet", video: "cva_video", position: "cva_position", vide: "cva_vide", doc: "cva_doc",
};

/** 12 conversations : chaque type d'aperçu, des non-lus, un groupe, une discussion d'activité, un nom très long. */
function peuplerQuelques(srv, ctx) {
  const { MOI, GENS, media } = ctx;
  const o = outils(srv);
  const extra = personnesSupplementaires().slice(0, 4);
  extra.forEach((p) => {
    if (!srv.prof(p.id)) srv.t.profiles.push({ id: p.id, username: p.nom, emoji: p.emoji, color: "#7c3aed", avatar_url: p.avatar ? media(p.avatar) : null, is_private: false, passion_id: p.passion[0], passions: [{ id: p.passion[0], emoji: p.passion[1] }], bio: "" });
  });

  // 1. Léa — texte reçu, 2 non-lus, il y a 3 min
  o.conv(ID.lea, MOI.id, [MOI.id, GENS.lea.id]);
  o.msg(ID.lea, MOI.id, 60 * 26, "Tu as retrouvé le capodastre ?");
  o.msg(ID.lea, GENS.lea.id, 60 * 25, "Oui, il était dans l'étui de la folk.");
  o.msg(ID.lea, MOI.id, 50, "Top. Je passe à l'atelier cette semaine.");
  o.msg(ID.lea, GENS.lea.id, 6, "Samedi matin alors ?");
  o.msg(ID.lea, GENS.lea.id, 3, "Tu viens samedi à l'atelier ? J'apporte les cordes.");
  o.lu(ID.lea, MOI.id, 40);

  // 2. Malik — mon dernier message (« Toi : »), lu
  o.conv(ID.malik, GENS.malik.id, [MOI.id, GENS.malik.id]);
  o.msg(ID.malik, GENS.malik.id, 70, "Salle jeudi 19 h, tu es toujours partante ?");
  o.msg(ID.malik, MOI.id, 25, "Parfait, à jeudi 19 h devant l'accueil.");
  o.lu(ID.malik, MOI.id, 20);

  // 3. Inès — photo reçue, 1 non-lu
  o.conv(ID.ines, GENS.ines.id, [MOI.id, GENS.ines.id]);
  o.msg(ID.ines, MOI.id, 60 * 5, "Montre-moi le tirage quand il est sec !");
  o.msg(ID.ines, GENS.ines.id, 60 * 2, contenu.photo(media("photo-portrait.jpg")));
  o.lu(ID.ines, MOI.id, 60 * 4);

  // 4. Tom — message vocal reçu, lu
  o.conv(ID.tom, GENS.tom.id, [MOI.id, GENS.tom.id]);
  o.msg(ID.tom, GENS.tom.id, 60 * 5, contenu.vocal(media("boucle.webm"), 14));
  o.lu(ID.tom, MOI.id, 60);

  // 5. Nom très long + message très long, hier
  o.conv(ID.long, GENS.long.id, [MOI.id, GENS.long.id]);
  o.msg(ID.long, GENS.long.id, 60 * 27, "Bonjour Camille, je vous confirme la répétition ouverte de samedi : nous jouerons le quatuor en entier, puis un temps d'échange avec le public, et enfin un goûter partagé dans la cour si le temps le permet.");
  o.lu(ID.long, MOI.id, 60 * 20);

  // 6. Groupe — document envoyé par un autre membre, il y a 2 jours
  o.conv(ID.groupe, MOI.id, [MOI.id, GENS.malik.id, GENS.lea.id, GENS.tom.id], { is_group: true, group_name: "Grimpe du jeudi", passion_id: "sport" });
  o.msg(ID.groupe, MOI.id, 60 * 24 * 6, "J'ai créé ce groupe « Grimpe du jeudi » 🎉 Bienvenue à tous !");
  o.msg(ID.groupe, GENS.lea.id, 60 * 24 * 3, "Je prends les dégaines.");
  o.msg(ID.groupe, GENS.malik.id, 60 * 24 * 2, contenu.doc(media("photo-carre.jpg"), "topo-falaise.pdf"));
  o.lu(ID.groupe, MOI.id, 60 * 24 * 2 - 30);

  // 7. Discussion d'activité (créée par un autre) — 5 non-lus, il y a 3 jours.
  //    `inconnu` est membre mais n'a aucun fil 1:1 avec moi et n'a jamais écrit :
  //    son profil n'est donc dans aucun cache local au démarrage.
  const inconnu = personnesSupplementaires()[39];
  if (!srv.prof(inconnu.id)) srv.t.profiles.push({ id: inconnu.id, username: inconnu.nom, emoji: inconnu.emoji, color: "#7c3aed", avatar_url: null, is_private: false, passion_id: "musique", passions: [{ id: "musique", emoji: "🎵" }], bio: "" });
  o.conv(ID.activite, GENS.long.id, [MOI.id, GENS.long.id, GENS.lea.id, GENS.ines.id, extra[0].id, extra[1].id, inconnu.id], { is_group: true, group_name: "📍 Répétition ouverte du samedi", passion_id: "musique" });
  o.msg(ID.activite, GENS.long.id, 60 * 24 * 4, "Bienvenue dans la discussion de l'activité.");
  o.msg(ID.activite, GENS.lea.id, 60 * 24 * 3 + 50, "Je viens avec ma guitare.");
  o.msg(ID.activite, extra[0].id, 60 * 24 * 3 + 40, "Il y a un parking à vélos ?");
  o.msg(ID.activite, GENS.long.id, 60 * 24 * 3 + 30, "Oui, dans la cour.");
  o.msg(ID.activite, GENS.ines.id, 60 * 24 * 3 + 10, "Je ferai quelques photos si personne n'y voit d'inconvénient.");
  o.msg(ID.activite, extra[1].id, 60 * 24 * 3, "Rendez-vous 14 h devant la grille, on entre ensemble.");
  o.lu(ID.activite, MOI.id, 60 * 24 * 4 - 10);

  // 8. Compte privé — GIF envoyé par moi, il y a 6 jours
  o.conv(ID.prive, MOI.id, [MOI.id, GENS.prive.id]);
  o.msg(ID.prive, GENS.prive.id, 60 * 24 * 6 + 30, "Merci pour l'adresse !");
  o.msg(ID.prive, MOI.id, 60 * 24 * 6, contenu.gif(media("photo-carre.jpg")));
  o.lu(ID.prive, MOI.id, 60 * 24 * 6);

  // 9. Vidéo reçue, il y a 9 jours (horodatage en date)
  o.conv(ID.video, extra[0].id, [MOI.id, extra[0].id]);
  o.msg(ID.video, extra[0].id, 60 * 24 * 9, contenu.video(media("boucle.webm")));
  o.lu(ID.video, MOI.id, 60 * 24 * 8);

  // 10. Position envoyée par moi, il y a 12 jours
  o.conv(ID.position, MOI.id, [MOI.id, extra[1].id]);
  o.msg(ID.position, extra[1].id, 60 * 24 * 12 + 20, "Tu es où ?");
  o.msg(ID.position, MOI.id, 60 * 24 * 12, contenu.position());
  o.lu(ID.position, MOI.id, 60 * 24 * 12);

  // 11. Fichier audio (pièce jointe, pas un vocal), il y a 15 jours
  o.conv(ID.doc, extra[2].id, [MOI.id, extra[2].id]);
  o.msg(ID.doc, extra[2].id, 60 * 24 * 15, contenu.audio(media("boucle.webm"), "maquette-refrain.mp3"));
  o.lu(ID.doc, MOI.id, 60 * 24 * 14);

  // 12. Conversation ouverte mais jamais commencée
  o.conv(ID.vide, MOI.id, [MOI.id, extra[3].id], { created_at: ilYA(60 * 24 * 18) });
  return srv;
}

/** 46 conversations : les 12 ci-dessus + 34 fils 1:1 étalés sur trois mois. */
function peuplerVolume(srv, ctx) {
  const { MOI, media } = ctx;
  peuplerQuelques(srv, ctx);
  const o = outils(srv);
  const gens = personnesSupplementaires();
  const PHRASES = ["On se cale ça la semaine prochaine ?", "Merci pour le lien, je regarde ce soir.", "Trop bien la sortie de dimanche !", "Tu as encore la partition ?", "Je te redis pour l'horaire.", "Ça marche, bonne soirée.", "Tu peux m'envoyer l'adresse ?", "J'ai adoré ta dernière publication.", "On remet ça quand tu veux.", "Je suis en retard de dix minutes.", "Parfait pour moi.", "Tu connais un bon réparateur ?"];
  gens.slice(4, 38).forEach((p, i) => {
    if (!srv.prof(p.id)) srv.t.profiles.push({ id: p.id, username: p.nom, emoji: p.emoji, color: "#7c3aed", avatar_url: p.avatar ? media(p.avatar) : null, is_private: false, passion_id: p.passion[0], passions: [{ id: p.passion[0], emoji: p.passion[1] }], bio: "" });
    const id = "cva_v" + String(i + 1).padStart(2, "0");
    const minutes = 60 * 24 * (16 + i * 2) + i * 7;      // de 16 à 82 jours
    o.conv(id, i % 2 ? MOI.id : p.id, [MOI.id, p.id], { created_at: ilYA(minutes + 600) });
    o.msg(id, i % 3 === 0 ? MOI.id : p.id, minutes, PHRASES[i % PHRASES.length]);
    o.lu(id, MOI.id, minutes - 5);
  });
  return srv;
}

/**
 * Drapeaux LOCAUX posés après le démarrage (état simulé).
 * `drapeaux` : { <convId>: { pinned, archived, _muted, draft, bg, unread } }
 */
async function drapeauxLocaux(page, drapeaux) {
  await page.evaluate((d) => {
    const convs = getConversations();
    Object.keys(d).forEach((id) => { const c = convs.find((x) => x.id === id); if (c) Object.assign(c, d[id]); });
    saveConversationsNow();
    try { renderMessages(); } catch (e) {}
  }, drapeaux);
}

/** Attend que la liste des conversations soit rendue (au moins `n` lignes). */
async function attendreListe(page, n) {
  await page.waitForFunction((k) => document.querySelectorAll("#messageList .msg-card").length >= k, n == null ? 1 : n, { timeout: 15000 });
}

module.exports = { peuplerQuelques, peuplerVolume, drapeauxLocaux, attendreListe, personnesSupplementaires, contenu, ID };
