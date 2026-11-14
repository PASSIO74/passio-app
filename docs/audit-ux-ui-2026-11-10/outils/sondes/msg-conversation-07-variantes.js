// Sonde 07 — variantes : groupe, nom très long, conversation vide, discussion d'activité,
// en-tête (cibles, IRL), fond de conversation, brouillon + rechargement, retour système,
// blocage (je bloque / on m'a bloqué), bandeau hors ligne par-dessus l'en-tête.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, context, serveur, photo, banc, GENS, MOI }) => {
  const out = {};
  try {
    await jeu.routes(page, { irl: true });
    const tete = () => page.evaluate(() => {
      const h = document.getElementById("convFpHead");
      const r = (e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
      const nom = h.querySelector(".conv-fp-name"); const sous = h.querySelector(".conv-fp-passion");
      return { texte: h.innerText.replace(/\s+/g, " "), nomTronque: nom.scrollWidth > nom.clientWidth + 1, largeurNom: nom.clientWidth, nomComplet: nom.textContent, title: nom.getAttribute("title"), sous: sous.textContent, couleurSous: getComputedStyle(sous).color, tailleSous: getComputedStyle(sous).fontSize, boutons: [...h.querySelectorAll("button")].map((b) => ({ nom: b.getAttribute("aria-label") || b.title || "", aria: b.getAttribute("aria-label"), ...r(b) })), avatar: (() => { const a = h.querySelector(".conv-fp-head-avatar"); return { ...r(a), role: a.getAttribute("role"), nom: a.getAttribute("aria-label"), cliquable: !!a.getAttribute("onclick") }; })(), titreNiveau: h.querySelector("h1,h2,h3") ? h.querySelector("h1,h2,h3").tagName : null };
    });

    // ① Groupe
    await jeu.entrer(page, "Atelier cordes du jeudi");
    out.groupe = { tete: await tete(), expediteurs: await page.evaluate(() => [...document.querySelectorAll("#convFpThread .conv-sender-name")].map((e) => ({ t: e.textContent, w: Math.round(e.getBoundingClientRect().width), coul: getComputedStyle(e).color }))), avatarsDansLeFil: await page.evaluate(() => document.querySelectorAll("#convFpThread .conv-bubble-wrap.them img.avatar, #convFpThread .conv-bubble-wrap.them .msg-avatar").length), menuPlusIRL: await page.evaluate(() => { const i = document.getElementById("v6cProposerIrl"); return i ? !i.hidden : null; }), boutonIrlTete: await page.evaluate(() => !!document.querySelector("#convFpHead [data-irl-proposal-action]")) };
    await photo("groupe");
    // Mention @ dans le groupe
    await page.locator("#convFpInput").tap();
    await page.keyboard.type("Merci @Ma");
    await page.waitForTimeout(400);
    out.mention = await page.evaluate(() => { const b = document.getElementById("convMentionBox"); if (!b) return null; const r = b.getBoundingClientRect(); return { lignes: [...b.querySelectorAll(".conv-mention-row")].map((x) => ({ t: x.innerText.trim(), h: Math.round(x.getBoundingClientRect().height) })), boite: { y: Math.round(r.y), h: Math.round(r.height) } }; });
    await photo("groupe-mention");
    await page.locator("#convFpInput").fill("");
    await page.evaluate(() => { try { _hideMentionBox(); } catch (e) {} closeConversation(); });
    await page.waitForTimeout(500);

    // ② Nom très long
    await jeu.entrer(page, GENS.long.nom.slice(0, 20));
    out.nomLong = await tete();
    await photo("nom-long");
    await page.evaluate(() => closeConversation()); await page.waitForTimeout(400);

    // ③ Conversation vide
    await jeu.entrer(page, GENS.tom.nom);
    out.vide = await page.evaluate(() => { const t = document.getElementById("convFpThread"); return { texte: t.innerText.replace(/\s+/g, " ").trim(), opacite: getComputedStyle(t.firstElementChild).opacity }; });
    await photo("vide");
    await page.evaluate(() => closeConversation()); await page.waitForTimeout(400);

    // ④ Discussion d'activité
    await jeu.entrer(page, "Bœuf acoustique");
    out.activite = { tete: await tete(), lienVersActivite: await page.evaluate(() => !!document.querySelector("#convFpHead [onclick*='openEvent'], #convFpHead [onclick*='irl']")) };
    await photo("activite");
    await page.evaluate(() => closeConversation()); await page.waitForTimeout(400);

    // ⑤ 1:1 avec bouton IRL (verdict serveur simulé « oui ») + aide contextuelle masquée par défaut
    await jeu.entrer(page, GENS.ines.nom);
    await page.waitForTimeout(600);
    out.un = await tete();
    out.irl = await page.evaluate(() => { const b = document.querySelector("#convFpHead [data-irl-proposal-action]"); if (!b) return null; const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return { aria: b.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height), fond: cs.backgroundColor, couleur: cs.color }; });
    out.teteLargeurs = await page.evaluate(() => { const h = document.getElementById("convFpHead"); return [...h.children].map((e) => ({ c: e.className || e.tagName, w: Math.round(e.getBoundingClientRect().width) })); });
    await photo("tete-irl");

    // ⑥ Fond de conversation (réglage) vu depuis le fil
    await page.evaluate((id) => { _setConvBg(id, 5); }, jeu.IDS.ines);   // « Nuit » #0a0a0f
    await page.waitForTimeout(500);
    await jeu.enBas(page);
    out.fond = await page.evaluate(() => { const t = document.getElementById("convFpThread"); const sep = [...t.children].find((e) => !e.classList.contains("conv-bubble-wrap")); const heure = t.querySelector(".conv-bubble-time"); return { fond: t.style.background, couleurSeparateur: sep ? getComputedStyle(sep.querySelector("span")).color : null, couleurHeure: heure ? getComputedStyle(heure).color : null }; });
    await photo("fond-nuit");
    await page.evaluate((id) => { _setConvBg(id, 1); }, jeu.IDS.ines);   // « Violet »
    await page.waitForTimeout(400);
    await photo("fond-violet");
    await page.evaluate((id) => { _setConvBg(id, 0); }, jeu.IDS.ines);
    await page.waitForTimeout(300);

    // ⑦ Brouillon : taper, quitter, revenir ; puis recharger la page
    await page.locator("#convFpInput").tap();
    await page.keyboard.type("Brouillon non envoyé, à retrouver");
    await page.waitForTimeout(700);
    await page.locator(".conv-fp-back").first().tap();
    await page.waitForTimeout(600);
    out.brouillonListe = await page.evaluate((nom) => { const c = [...document.querySelectorAll("#messageList .msg-card")].find((x) => x.innerText.includes(nom)); return c ? c.querySelector(".msg-preview").innerText : null; }, GENS.ines.nom);
    await jeu.entrer(page, GENS.ines.nom);
    out.brouillonRetour = await page.locator("#convFpInput").inputValue();
    await page.evaluate(() => saveConversationsNow());
    await page.reload();
    await page.waitForFunction(() => document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active"), null, { timeout: 20000 });
    await page.waitForTimeout(3500);
    await jeu.routes(page, { irl: true }).catch(() => {});
    out.apresRechargement = await page.evaluate(() => ({ conversationOuverte: document.getElementById("conv-fullpage").classList.contains("active"), ecran: (document.querySelector(".screen.active") || {}).id, hash: location.hash }));
    await page.evaluate(() => goTo("messages")); await page.waitForTimeout(1500);
    out.brouillonListeApres = await page.evaluate((nom) => { const c = [...document.querySelectorAll("#messageList .msg-card")].find((x) => x.innerText.includes(nom)); return c ? c.querySelector(".msg-preview").innerText : null; }, GENS.ines.nom);
    await photo("liste-apres-rechargement");
    await jeu.entrer(page, GENS.ines.nom);
    out.brouillonApresRechargement = await page.locator("#convFpInput").inputValue();

    // ⑧ Retour système (geste du bord) : ferme la conversation ? et deuxième retour ?
    await page.goBack(); await page.waitForTimeout(600);
    out.retour1 = await page.evaluate(() => ({ conversationOuverte: document.getElementById("conv-fullpage").classList.contains("active"), ecran: (document.querySelector(".screen.active") || {}).id }));
    // Retour avec le menu « + » ouvert, avec le panneau emoji ouvert
    await jeu.entrer(page, GENS.ines.nom);
    await page.locator("#btnAttach").tap(); await page.waitForTimeout(300);
    await page.goBack(); await page.waitForTimeout(600);
    out.retourMenuOuvert = await page.evaluate(() => ({ conversationOuverte: document.getElementById("conv-fullpage").classList.contains("active"), menuEncoreOuvert: document.getElementById("convAttachMenu").classList.contains("open") }));
    await jeu.entrer(page, GENS.ines.nom);
    out.menuResteOuvertALaReouverture = await page.evaluate(() => document.getElementById("convAttachMenu").classList.contains("open"));
    await page.touchscreen.tap(300, 300); await page.waitForTimeout(200);
    await page.locator("#btnEmoji").tap(); await page.waitForTimeout(300);
    await page.goBack(); await page.waitForTimeout(600);
    out.retourEmojiOuvert = await page.evaluate(() => ({ conversationOuverte: document.getElementById("conv-fullpage").classList.contains("active"), panneauEncoreVisible: document.getElementById("convEmojiPanel").classList.contains("open"), ecran: (document.querySelector(".screen.active") || {}).id }));
    await photo("emoji-apres-retour");
    await page.evaluate(() => { document.getElementById("convEmojiPanel").classList.remove("open"); });

    // ⑨ L'AUTRE m'a bloqué (ligne `blocks` posée côté serveur pendant la session) : j'écris
    await jeu.entrer(page, GENS.ines.nom);
    serveur.t.blocks.push({ blocker_id: GENS.ines.id, blocked_id: MOI.id, created_at: new Date().toISOString() });
    await page.locator("#convFpInput").fill("Tu es là ?");
    await page.locator("#convFpSendBtn").click();
    await page.waitForTimeout(1500);
    out.bloquePar = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; const h = document.querySelector('#convFpThread [data-msgst="' + CSS.escape(m.id) + '"]'); return { statut: m.status, indicateur: h ? h.innerText.trim() : null, toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), file: JSON.parse(localStorage.getItem("passio_outbox_v1") || "[]").length, champActif: !document.getElementById("convFpInput").disabled }; }, jeu.IDS.ines);
    await jeu.enBas(page);
    await photo("bloque-par-l-autre");
    const lien = page.locator('#convFpThread [data-msgst] span[onclick]').last();
    if (await lien.count()) { await lien.tap(); await page.waitForTimeout(1200); }
    out.bloqueParApresReessai = await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); const m = c.messages[c.messages.length - 1]; return { statut: m.status, toasts: (window.__toasts || []).map((t) => t.msg).slice(-2) }; }, jeu.IDS.ines);
    serveur.t.blocks.length = 0;

    // ⑩ JE bloque depuis la conversation (Paramètres → Bloquer) : confirm() natif accepté
    page.once("dialog", (d) => { out.dialogueBlocage = { type: d.type(), message: d.message() }; d.accept(); });
    await page.locator('#convFpHead button[title="Paramètres"]').tap();
    await page.waitForTimeout(500);
    await page.locator("#convSettingsContent .csetting-item", { hasText: "Bloquer" }).tap();
    await page.waitForTimeout(1500);
    out.apresBlocage = await page.evaluate((nom) => ({ conversationOuverte: document.getElementById("conv-fullpage").classList.contains("active"), dansLaListe: [...document.querySelectorAll("#messageList .msg-card")].some((x) => x.innerText.includes(nom)), toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), modale: document.getElementById("modalBackdrop").classList.contains("active") }), GENS.ines.nom);
    await photo("apres-blocage");
    // Conversation avec un compte que J'AI bloqué, rouverte de force (lien de notification, transfert…)
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.evaluate((id) => openConversation(id), jeu.IDS.ines);
    await page.waitForTimeout(1200);
    out.convBloqueeOuverte = await page.evaluate(() => ({ bulles: document.querySelectorAll("#convFpThread .conv-bubble-wrap").length, bandeau: !!document.querySelector("#conv-fullpage .conv-blocked-banner, #conv-fullpage [data-bloque]"), champActif: !document.getElementById("convFpInput").disabled, texteFil: document.getElementById("convFpThread").innerText.replace(/\s+/g, " ").slice(0, 160) }));
    await photo("conv-bloquee-ouverte");
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
