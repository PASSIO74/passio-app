// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — MESSAGERIE : LA CONVERSATION (domaine `msg-conversation`)
//
// Tout est inventé (personnes du socle `GENS`, textes, fichiers). Les lignes ont
// la forme que le client LIT : `supaLoadMyConversations` et `supaLoadMessages`
// (js/app-08-ui-modals-tour.js) — `conv_messages.content` est du JSON
// (`{type:"text"|"media"|"gif"|"audio"|"doc"|"location"|"react"|"del", …}`),
// décodé par `applyMsgContentData` (js/app-04-comments-shop.js).
//
// Conversations semées :
//   · c_audit_lea    1:1 — TOUS les types de message, réponses, réactions, accusé ✓✓
//   · g_audit_cordes groupe de 5 — expéditeurs nommés, nom très long, mention
//   · c_audit_malik  1:1 — 230 messages (pagination par 40, longue conversation)
//   · c_audit_long   1:1 — interlocutrice au nom très long
//   · c_audit_tom    1:1 — aucune bulle (état vide)
//   · c_audit_ines   1:1 — fil court, sert aux envois / échecs / blocage
//   · evgrp_ev_audit_bœuf  discussion d'activité (même composant qu'un groupe)
//
// ⚠️ HORODATAGES RELATIFS À « MAINTENANT » (et non à des heures murales) : les
// captures doivent montrer le même fil quelle que soit l'heure de la passe.
// Les blocs « −71 h / −47 h / −23 h » tombent sur trois jours calendaires
// distincts tant que la passe a lieu avant 22 h (heure de Paris).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");

const IDS = {
  lea: "c_audit_lea",
  groupe: "g_audit_cordes",
  longue: "c_audit_malik",
  nomLong: "c_audit_long",
  vide: "c_audit_tom",
  ines: "c_audit_ines",
  activite: "evgrp_ev_audit_boeuf",
};

const TEXTE_LONG =
  "Oui, tous les jeudis ! On est une petite dizaine, niveaux très mélangés. Le principe : chacun apporte un morceau qu'il travaille, on le joue une fois tel quel, puis on le démonte ensemble — tempo, doigtés, respiration.\n\n" +
  "La dernière fois on a passé une heure entière sur huit mesures de Villa-Lobos et personne ne s'est ennuyé. Si tu viens, prends ta guitare et un accordeur ; pour les partitions on partage.\n\n" +
  "Ah, et l'entrée est par la cour, deuxième porte à gauche (pas celle du conservatoire, celle avec l'interphone « Atelier »).";

const LIEN = "https://exemple.passio.test/stages/lutherie-novembre-2026/programme-complet?ref=conversation&utm_source=audit";

// Minutes écoulées → horodatage serveur sans fuseau.
const il = (minutes) => base.ilYA(minutes);
const H = 60;

function texte(t, extra) { return JSON.stringify(Object.assign({ type: "text", text: t }, extra || {})); }

/**
 * Sème les conversations du domaine dans le faux serveur.
 * opts.sans : tableau de clés d'IDS à ne pas semer.
 * opts.leaLu : false → Léa n'a PAS lu mon dernier message (✓ simple).
 * opts.vocal : URL d'un fichier audio jouable (servie par une route du scénario).
 */
function peupler(srv, ctx, opts) {
  opts = opts || {};
  const { MOI, GENS, media } = ctx;
  const sans = new Set(opts.sans || []);
  const vocal = opts.vocal || (media("boucle.webm").replace("boucle.webm", "audit-vocal.wav"));

  const conv = (id, extra) => srv.t.conversations.push(Object.assign({ id, is_group: false, group_name: null, passion_id: null, created_by: MOI.id, created_at: il(60 * 24 * 12) }, extra || {}));
  const membres = (id, uids) => uids.forEach((u) => srv.t.conv_members.push({ conv_id: id, user_id: u }));
  let n = 0;
  const msg = (convId, de, minutes, content, idForce) => {
    const id = idForce || ("m_audit_" + String(++n).padStart(4, "0"));
    srv.t.conv_messages.push({ id, conv_id: convId, from_id: de.id, content, created_at: il(minutes) });
    return id;
  };
  const lu = (convId, qui, minutes) => srv.t.conv_reads.push({ conv_id: convId, user_id: qui.id, last_read_at: il(minutes) });

  // ── 1. Léa — tous les types ───────────────────────────────────────────────
  if (!sans.has("lea")) {
    const c = IDS.lea;
    conv(c); membres(c, [MOI.id, GENS.lea.id]);
    // Bloc « il y a trois jours » (−71 h)
    msg(c, GENS.lea, 71 * H, texte("Salut Camille ! J'ai écouté ta compo, le pont en ré mineur est super."), "m_lea_01");
    msg(c, MOI, 71 * H - 3, texte("Merci Léa 🙏 J'ai hésité à la publier."), "m_lea_02");
    msg(c, MOI, 71 * H - 4, texte("Tu joues toujours à l'atelier le jeudi ?"), "m_lea_03");
    msg(c, GENS.lea, 71 * H - 9, texte(TEXTE_LONG), "m_lea_04");
    // Bloc « avant-hier » (−47 h)
    msg(c, GENS.lea, 47 * H, JSON.stringify({ type: "media", filename: "atelier.jpg", fileType: "image/jpeg", url: media("photo-atelier.jpg"), text: "[MEDIA] atelier.jpg" }), "m_lea_05");
    msg(c, GENS.lea, 47 * H - 1, texte("Voilà l'atelier, la table du fond est libre le samedi."), "m_lea_06");
    msg(c, MOI, 47 * H - 20, texte("Parfait, je passe samedi alors.", { rt: { id: "m_lea_06", t: "Voilà l'atelier, la table du fond est libre le samedi.", n: GENS.lea.nom } }), "m_lea_07");
    msg(c, GENS.lea, 47 * H - 21, texte("🎸🔥"), "m_lea_08");
    msg(c, MOI, 47 * H - 30, texte("Le programme du stage : " + LIEN), "m_lea_09");
    // Bloc « hier » (−23 h)
    msg(c, GENS.lea, 23 * H, JSON.stringify({ type: "audio", filename: "Message vocal (14s)", fileType: "audio/webm", url: vocal, text: "[AUDIO] Message vocal (14s)" }), "m_lea_10");
    msg(c, MOI, 23 * H - 6, JSON.stringify({ type: "audio", filename: "Message vocal (7s)", fileType: "audio/webm", url: vocal, text: "[AUDIO] Message vocal (7s)" }), "m_lea_11");
    msg(c, GENS.lea, 23 * H - 10, JSON.stringify({ type: "doc", filename: "Programme-stage-lutherie-novembre-2026.pdf", fileType: "application/pdf", url: media("photo-carre.jpg") + "?doc=programme.pdf", text: "[DOC] Programme-stage-lutherie-novembre-2026.pdf" }), "m_lea_12");
    msg(c, GENS.lea, 23 * H - 11, JSON.stringify({ type: "audio", filename: "maquette-pont-re-mineur.mp3", fileType: "audio/mpeg", url: vocal + "?piste=maquette", text: "[AUDIO] maquette-pont-re-mineur.mp3" }), "m_lea_13");
    msg(c, GENS.lea, 22 * H, texte("Je te garde la table du fond."), "m_lea_14");
    // Bloc « aujourd'hui »
    msg(c, GENS.lea, 50, texte("Tu viens à quelle heure samedi ?"), "m_lea_15");
    msg(c, MOI, 45, texte("Vers 10 h, ça te va ?"), "m_lea_16");
    msg(c, GENS.lea, 44, JSON.stringify({ type: "gif", url: media("photo-carre.jpg") + "?gif=1", text: "🎞 GIF" }), "m_lea_17");
    msg(c, MOI, 40, JSON.stringify({ type: "media", filename: "partition.jpg", fileType: "image/jpeg", url: media("photo-portrait.jpg"), text: "[MEDIA] partition.jpg" }), "m_lea_18");
    msg(c, GENS.lea, 35, JSON.stringify({ type: "media", filename: "arpeges.webm", fileType: "video/webm", url: media("boucle.webm"), text: "[MEDIA] arpeges.webm" }), "m_lea_19");
    msg(c, MOI, 30, JSON.stringify({ type: "location", lat: 45.7485, lng: 4.8467, url: "https://maps.google.com/?q=45.74850,4.84670", text: "📍 Ma position : https://maps.google.com/?q=45.74850,4.84670" }), "m_lea_20");
    msg(c, GENS.lea, 25, texte("Super. Prends ta guitare, on regardera le chevalet ensemble."), "m_lea_21");
    msg(c, MOI, 20, texte("Ça marche, à samedi !"), "m_lea_22");
    // Réactions (messages de contrôle : jamais de bulle)
    msg(c, GENS.lea, 71 * H - 5, JSON.stringify({ type: "react", target: "m_lea_02", emoji: "❤️", op: "add" }), "rx_lea_01");
    msg(c, MOI, 47 * H - 2, JSON.stringify({ type: "react", target: "m_lea_05", emoji: "🔥", op: "add" }), "rx_lea_02");
    msg(c, GENS.lea, 47 * H - 22, JSON.stringify({ type: "react", target: "m_lea_07", emoji: "👍", op: "add" }), "rx_lea_03");
    msg(c, MOI, 24, JSON.stringify({ type: "react", target: "m_lea_21", emoji: "👍", op: "add" }), "rx_lea_04");
    msg(c, GENS.lea, 19, JSON.stringify({ type: "react", target: "m_lea_22", emoji: "😂", op: "add" }), "rx_lea_05");
    msg(c, GENS.lea, 19, JSON.stringify({ type: "react", target: "m_lea_22", emoji: "❤️", op: "add" }), "rx_lea_06");
    lu(c, MOI, 18);
    if (opts.leaLu !== false) lu(c, GENS.lea, 10);
  }

  // ── 2. Groupe ─────────────────────────────────────────────────────────────
  if (!sans.has("groupe")) {
    const g = IDS.groupe;
    conv(g, { is_group: true, group_name: "Atelier cordes du jeudi", passion_id: "musique" });
    membres(g, [MOI.id, GENS.lea.id, GENS.malik.id, GENS.ines.id, GENS.long.id]);
    msg(g, MOI, 26 * H, texte("Bienvenue dans le groupe ! On cale ici les séances du jeudi."), "m_grp_01");
    msg(g, GENS.lea, 26 * H - 4, texte("Top, merci Camille."), "m_grp_02");
    msg(g, GENS.long, 26 * H - 10, texte("Bonsoir à toutes et à tous. Je peux apporter deux pupitres et une lampe si besoin."), "m_grp_03");
    msg(g, GENS.long, 26 * H - 11, texte("Et un violoncelle, évidemment 🎻"), "m_grp_04");
    msg(g, GENS.malik, 180, texte("Je serai en retard jeudi, je sors de la salle à 19 h."), "m_grp_05");
    msg(g, GENS.ines, 170, JSON.stringify({ type: "media", filename: "salle.jpg", fileType: "image/jpeg", url: media("photo-paysage.jpg"), text: "[MEDIA] salle.jpg" }), "m_grp_06");
    msg(g, GENS.ines, 169, texte("La salle vue depuis l'entrée, pour ceux qui ne connaissent pas."), "m_grp_07");
    msg(g, MOI, 120, texte("@" + GENS.lea.nom + " tu peux ouvrir à 18 h 30 ?"), "m_grp_08");
    msg(g, GENS.lea, 118, texte("Oui, j'ai la clé."), "m_grp_09");
    msg(g, GENS.malik, 60, texte("👍"), "m_grp_10");
    msg(g, GENS.long, 12, texte("Parfait. À jeudi, et pensez à accorder avant d'arriver, on gagne un quart d'heure à chaque fois."), "m_grp_11");
    msg(g, GENS.malik, 119, JSON.stringify({ type: "react", target: "m_grp_08", emoji: "👍", op: "add" }), "rx_grp_01");
    msg(g, GENS.ines, 118, JSON.stringify({ type: "react", target: "m_grp_08", emoji: "👍", op: "add" }), "rx_grp_02");
    lu(g, MOI, 100);
  }

  // ── 3. Longue conversation (230 messages) ─────────────────────────────────
  if (!sans.has("longue")) {
    const c = IDS.longue;
    conv(c); membres(c, [MOI.id, GENS.malik.id]);
    const phrases = [
      "Tu grimpes ce soir ?", "Oui, 19 h à la salle.", "Je prends les dégaines.", "Ok 👌",
      "On tente la voie bleue du fond, celle avec le dévers ?", "Si mes avant-bras suivent.",
      "Rappelle-moi de te rendre ta corde.", "Garde-la jusqu'à dimanche, on sort en falaise si la météo tient.",
      "Top.", "Je réserve le créneau.",
    ];
    const total = 230;
    for (let i = 1; i <= total; i++) {
      const de = (i % 3 === 0) ? MOI : GENS.malik;
      const minutes = 5 + (total - i) * 31;            // 31 min d'écart : ~5 jours de fil
      msg(c, de, minutes, texte("n° " + String(i).padStart(3, "0") + " — " + phrases[i % phrases.length]), "m_mal_" + String(i).padStart(3, "0"));
    }
    lu(c, MOI, 2); lu(c, GENS.malik, 1);
  }

  // ── 4. Nom très long ──────────────────────────────────────────────────────
  if (!sans.has("nomLong")) {
    const c = IDS.nomLong;
    conv(c); membres(c, [MOI.id, GENS.long.id]);
    msg(c, GENS.long, 300, texte("Bonjour Camille, seriez-vous disponible pour la répétition ouverte de samedi ?"), "m_lng_01");
    msg(c, MOI, 290, texte("Bonjour ! Oui, avec plaisir."), "m_lng_02");
    msg(c, GENS.long, 280, texte("Merveilleux. Je vous envoie le programme."), "m_lng_03");
    lu(c, MOI, 270); lu(c, GENS.long, 285);
  }

  // ── 5. Conversation sans message (état vide) ──────────────────────────────
  if (!sans.has("vide")) { conv(IDS.vide, { created_at: il(400) }); membres(IDS.vide, [MOI.id, GENS.tom.id]); }

  // ── 6. Inès — fil court pour les envois ───────────────────────────────────
  if (!sans.has("ines")) {
    const c = IDS.ines;
    conv(c); membres(c, [MOI.id, GENS.ines.id]);
    msg(c, GENS.ines, 600, texte("Tu développes toujours tes pellicules toi-même ?"), "m_ine_01");
    msg(c, MOI, 590, texte("Non, je débute. Tu me montrerais ?"), "m_ine_02");
    msg(c, GENS.ines, 580, texte("Avec plaisir, passe au labo un de ces soirs."), "m_ine_03");
    lu(c, MOI, 570); lu(c, GENS.ines, 585);
  }

  // ── 7. Discussion d'activité (identifiant `evgrp_…`, même composant) ──────
  if (!sans.has("activite")) {
    const g = IDS.activite;
    conv(g, { is_group: true, group_name: "📍 Bœuf acoustique au parc de Gerland", passion_id: "musique", created_by: GENS.lea.id });
    membres(g, [MOI.id, GENS.lea.id, GENS.tom.id]);
    msg(g, GENS.lea, 500, texte("Bienvenue aux inscrits ! Rendez-vous samedi 15 h devant le kiosque."), "m_act_01");
    msg(g, GENS.tom, 480, texte("J'apporte de quoi grignoter."), "m_act_02");
    msg(g, MOI, 470, texte("Je prends ma guitare et un cajón."), "m_act_03");
    lu(g, MOI, 460);
  }
  return srv;
}

// Un WAV PCM mono de `secondes` s (sinusoïde douce) : servi par une route du
// scénario pour que le lecteur de vocal ait un fichier RÉELLEMENT jouable.
function wav(secondes) {
  const taux = 8000, nb = Math.floor(taux * (secondes || 2));
  const buf = Buffer.alloc(44 + nb * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + nb * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(taux, 24); buf.writeUInt32LE(taux * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(nb * 2, 40);
  for (let i = 0; i < nb; i++) buf.writeInt16LE(Math.round(Math.sin(i / taux * 2 * Math.PI * 220) * 2500), 44 + i * 2);
  return buf;
}

// ── Aides de parcours partagées par les sondes et les scénarios du domaine ──
// Attend que les médias du fil soient chargés (les images n'ont pas de dimensions
// réservées : tant qu'elles chargent, les bulles BOUGENT — c'est un constat du
// domaine, mais un geste de banc posé pendant ce mouvement tomberait à côté).
async function filPret(page, ms) {
  await page.waitForFunction(() => {
    const t = document.getElementById("convFpThread");
    if (!t) return false;
    return [...t.querySelectorAll("img")].every((i) => i.complete);
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms == null ? 350 : ms);
}
// Va sur Messages et entre dans une conversation par un VRAI toucher sur sa carte.
async function entrer(page, nom, opts) {
  opts = opts || {};
  const surMessages = await page.evaluate(() => { const s = document.getElementById("screen-messages"); return !!s && s.classList.contains("active"); });
  if (!surMessages) { await page.evaluate(() => goTo("messages")); }
  await page.waitForSelector("#messageList .msg-card", { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.locator("#messageList .msg-card", { hasText: nom }).first().click();
  await page.waitForFunction(() => document.getElementById("conv-fullpage").classList.contains("active"), null, { timeout: 8000 });
  await page.waitForTimeout(900);          // transition (280 ms) + lecture serveur
  await filPret(page);
  if (opts.bas !== false) await enBas(page);
}
// Remet le fil sur son dernier message (ce que l'application ne fait pas toujours seule).
async function enBas(page) {
  await page.evaluate(() => { const t = document.getElementById("convFpThread"); if (t) t.scrollTop = t.scrollHeight; });
  await page.waitForTimeout(250);
}
const bulle = (id) => '.conv-bubble-wrap[data-mid="' + id + '"] .conv-bubble';
// Les routes du domaine : un vocal jouable (WAV généré) et, au besoin, le verdict
// serveur de la proposition IRL (la RPC n'existe pas dans le faux serveur).
async function routes(page, opts) {
  opts = opts || {};
  await page.route("**/audit-vocal.wav*", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: wav(opts.dureeVocal || 3) }));
  if (opts.irl) {
    await page.route(/\/rest\/v1\/rpc\/irl_interaction_allowed/, (r) => {
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "true" });
    });
  }
}

module.exports = { IDS, peupler, wav, TEXTE_LONG, LIEN, filPret, entrer, enBas, bulle, routes };
