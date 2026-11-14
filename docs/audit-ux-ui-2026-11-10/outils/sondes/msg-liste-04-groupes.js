// Sonde 04 — création de groupe, en-tête de groupe, fenêtre « membres », rôles, quitter, description, photo.
"use strict";
const path = require("path");
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, banc, GENS, MOI, serveur }) => {
  const out = { dialogues: [] };
  let reponseDialogue = { accepter: false, texte: undefined };
  page.on("dialog", async (d) => { out.dialogues.push({ type: d.type(), message: d.message(), defaut: d.defaultValue() }); if (reponseDialogue.accepter) await d.accept(reponseDialogue.texte).catch(() => {}); else await d.dismiss().catch(() => {}); });
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  try {
  await page.evaluate(() => goTo("messages"));
  await jeu.attendreListe(page, 3);

  // ── Création ──
  await page.locator(".v6a-plus").tap();
  await page.waitForTimeout(200);
  await page.locator("#v6aMenu .v6a-menu-item").nth(1).tap();
  await page.waitForTimeout(700);
  await photo("creation-ouverte");
  out.creation = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    const r = (e) => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      hauteur: c.scrollHeight, visible: c.clientHeight, top: Math.round(c.getBoundingClientRect().top),
      nomChamp: (function () { const i = document.getElementById("groupName"); return { fs: getComputedStyle(i).fontSize, placeholder: i.placeholder, max: i.maxLength, focus: document.activeElement === i }; })(),
      passions: [...c.querySelectorAll(".group-passion-option")].map((p) => Object.assign({ t: p.textContent.trim() }, r(p))),
      membres: [...c.querySelectorAll(".group-user-option")].map((p) => Object.assign({ t: p.textContent.trim(), uid: p.getAttribute("data-uid"), role: p.getAttribute("role"), aria: p.getAttribute("aria-checked") || p.getAttribute("aria-pressed") }, r(p))),
      champRechercheMembres: !!c.querySelector(".group-user-list input[type=text], input[placeholder*='hercher']"),
      bouton: (function () { const b = [...c.querySelectorAll("button")].find((x) => /Créer le groupe/.test(x.textContent)); const bb = b.getBoundingClientRect(); return { y: Math.round(bb.top), bas: Math.round(bb.bottom), vh: innerHeight, visible: bb.bottom <= innerHeight }; })(),
      texte: c.innerText.slice(0, 400),
    };
  });
  // Valider vide
  const creer = page.locator("#modalContent button", { hasText: "Créer le groupe" });
  await creer.scrollIntoViewIfNeeded();
  await creer.tap();
  await page.waitForTimeout(300);
  out.videToast = (await toasts()).slice(-1);
  await page.locator("#groupName").fill("Cordes du dimanche");
  await creer.tap();
  await page.waitForTimeout(300);
  out.sansPassionToast = (await toasts()).slice(-1);
  await page.locator("#modalContent .group-passion-option").first().tap();
  await creer.tap();
  await page.waitForTimeout(300);
  out.sansMembreToast = (await toasts()).slice(-1);
  await page.locator("#modalContent .group-user-option").nth(0).tap();
  await page.locator("#modalContent .group-user-option").nth(2).tap();
  await page.waitForTimeout(200);
  await page.evaluate(() => { const l = document.querySelector(".group-user-list"); if (l) l.scrollTop = 0; document.getElementById("modalContent").scrollTop = 0; });
  await photo("creation-remplie");
  await page.evaluate(() => { document.getElementById("modalContent").scrollTop = 9999; });
  await page.waitForTimeout(200);
  await photo("creation-remplie-bas");
  await creer.tap();
  await page.waitForTimeout(1500);
  await photo("apres-creation");
  out.apresCreation = await page.evaluate(() => {
    const g = getConversations().find((c) => c.isGroup && c.groupName === "Cordes du dimanche");
    return { toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), id: g && g.id, userIds: g && g.userIds, modale: document.getElementById("modalBackdrop").classList.contains("active"), conv: document.getElementById("conv-fullpage").classList.contains("active"), premier: (document.querySelector("#messageList .msg-name") || {}).textContent, apercu: (document.querySelector("#messageList .msg-preview") || {}).textContent, ligne2: (document.querySelector("#messageList .msg-passion") || {}).textContent };
  });
  out.enBase = { conv: serveur.t.conversations.filter((c) => c.group_name === "Cordes du dimanche").map((c) => ({ id: c.id, created_by: c.created_by === MOI.id ? "moi" : c.created_by })), membres: serveur.t.conv_members.filter((m) => /^grp_/.test(m.conv_id) && m.conv_id !== jeu.ID.groupe).map((m) => m.user_id) };

  // ── Groupe dont je suis la créatrice (membres réels) ──
  await page.locator("#messageList .msg-card", { hasText: "Grimpe du jeudi" }).tap();
  await page.waitForTimeout(900);
  await photo("entete-groupe");
  out.enteteGroupe = await page.evaluate(() => { const h = document.getElementById("convFpHead"); return { nom: h.querySelector(".conv-fp-name").textContent, sous: h.querySelector(".conv-fp-passion").textContent, actions: [...h.querySelectorAll(".conv-action-btn")].map((b) => ({ title: b.getAttribute("title"), aria: b.getAttribute("aria-label"), w: b.getBoundingClientRect().width })), infoOnclick: h.querySelector(".conv-fp-head-info").getAttribute("onclick"), avatarOnclick: (h.querySelector(".conv-fp-head-avatar") || {}).getAttribute ? h.querySelector(".conv-fp-head-avatar").getAttribute("onclick") : null, infoRole: h.querySelector(".conv-fp-head-info").getAttribute("role") }; });
  // Toucher le nom du groupe : que se passe-t-il ?
  await page.locator("#convFpHead .conv-fp-head-info").tap();
  await page.waitForTimeout(400);
  out.tapNomGroupe = await page.evaluate(() => ({ modale: document.getElementById("modalBackdrop").classList.contains("active") }));
  await page.locator('#convFpHead .conv-action-btn[title="Membres"]').tap();
  await page.waitForTimeout(600);
  await photo("membres");
  out.membres = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    return {
      texte: c.innerText,
      onglets: [...c.querySelectorAll('[id^="grpTab_"]')].map((t) => ({ t: t.textContent, h: Math.round(t.getBoundingClientRect().height), role: t.getAttribute("role"), sel: t.getAttribute("aria-selected") })),
      retirer: [...c.querySelectorAll("button")].filter((b) => /Retirer/.test(b.textContent)).map((b) => ({ w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), fs: getComputedStyle(b).fontSize })),
      bas: [...c.querySelectorAll("button")].filter((b) => /Retour|Quitter/.test(b.textContent)).map((b) => ({ t: b.textContent, h: Math.round(b.getBoundingClientRect().height) })),
      photoZone: (function () { const z = c.querySelector('[onclick^="pickGroupPhoto"]'); return z ? { w: z.getBoundingClientRect().width, h: z.getBoundingClientRect().height, role: z.getAttribute("role"), aria: z.getAttribute("aria-label") } : null; })(),
    };
  });
  // Onglet Ajouter
  await page.locator("#grpTab_add").tap();
  await page.waitForTimeout(400);
  await photo("membres-ajouter");
  out.ajouter = await page.evaluate(() => { const l = document.getElementById("grpAddList"); const i = document.getElementById("grpSearchInput"); return { n: l.children.length, premiers: [...l.children].slice(0, 6).map((x) => x.innerText.replace(/\n/g, " | ")), fsChamp: getComputedStyle(i).fontSize, focus: document.activeElement === i, placeholder: i.placeholder, boutonAjouter: (function () { const b = l.querySelector("button"); return b ? { w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), fs: getComputedStyle(b).fontSize } : null; })() }; });
  await page.locator("#grpSearchInput").fill("ines");
  await page.waitForTimeout(300);
  out.ajouterRecherche = await page.evaluate(() => document.getElementById("grpAddList").innerText);
  await page.locator("#grpSearchInput").fill("zzz");
  await page.waitForTimeout(300);
  out.ajouterRechercheVide = await page.evaluate(() => document.getElementById("grpAddList").innerText);
  // Description → prompt natif
  await page.locator('#modalContent [onclick^="editGroupDescription"]').tap();
  await page.waitForTimeout(300);
  // Retirer un membre réel (je suis créatrice) → chemin serveur
  await page.locator("#grpTab_members").tap();
  await page.waitForTimeout(200);
  await page.locator("#modalContent button", { hasText: "Retirer" }).first().tap();
  await page.waitForTimeout(900);
  out.retraitCreatrice = { toasts: (await toasts()).slice(-1), enBase: serveur.t.conv_members.filter((m) => m.conv_id === jeu.ID.groupe).length, confirmation: out.dialogues.filter((d) => /Retirer|retirer/.test(d.message)).length };
  await photo("membres-apres-retrait");
  // Quitter → confirm natif (refusé)
  await page.locator("#modalContent button", { hasText: "Quitter" }).tap();
  await page.waitForTimeout(300);
  // Photo du groupe : sélecteur de fichier
  const [selecteur] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null), page.locator('#modalContent [onclick^="pickGroupPhoto"]').tap()]);
  if (selecteur) {
    const erreursAvant = await page.evaluate(() => (window.__erreursSonde = window.__erreursSonde || []).length);
    await page.evaluate(() => { window.addEventListener("error", (e) => window.__erreursSonde.push(String(e.message))); });
    await selecteur.setFiles(path.join(banc.AUDIT, "outils", "medias", "photo-carre.jpg"));
    await page.waitForTimeout(900);
    out.photoGroupe = await page.evaluate((id) => ({ toasts: (window.__toasts || []).map((t) => t.msg).slice(-1), enregistree: !!(getConversations().find((c) => c.id === id) || {}).groupPhoto, taille: ((getConversations().find((c) => c.id === id) || {}).groupPhoto || "").length, erreurs: window.__erreursSonde, modaleAvatarAJour: /url\(/.test((document.querySelector('#modalContent [onclick^="pickGroupPhoto"] div') || { style: { background: "" } }).style.background), enteteAvatarAJour: /url\(/.test((document.querySelector("#convFpHead .conv-fp-head-avatar") || { style: { background: "" } }).style.background) }), jeu.ID.groupe);
    await photo("photo-groupe-apres");
  } else out.photoGroupe = "pas de sélecteur";
  await page.locator("#modalContent button", { hasText: "Retour" }).tap();
  await page.waitForTimeout(700);
  await photo("apres-retour");

  // ── Discussion d'activité : je ne suis PAS la créatrice ──
  await page.locator("#convFpHead .conv-fp-back").tap();
  await page.waitForTimeout(600);
  await page.locator("#messageList .msg-card", { hasText: "Répétition ouverte" }).tap();
  await page.waitForTimeout(900);
  await page.locator('#convFpHead .conv-action-btn[title="Membres"]').tap();
  await page.waitForTimeout(600);
  await photo("membres-non-creatrice");
  out.nonCreatrice = await page.evaluate(() => { const c = document.getElementById("modalContent"); return { texte: c.innerText, nbRetirer: [...c.querySelectorAll("button")].filter((b) => /Retirer/.test(b.textContent)).length, enTete: (document.querySelector("#convFpHead .conv-fp-passion") || {}).textContent }; });
  const membresAvant = serveur.t.conv_members.filter((m) => m.conv_id === jeu.ID.activite).length;
  await page.locator("#modalContent button", { hasText: "Retirer" }).first().tap();
  await page.waitForTimeout(1200);
  out.retraitNonCreatrice = { toasts: (await toasts()).slice(-1), avant: membresAvant, apres: serveur.t.conv_members.filter((m) => m.conv_id === jeu.ID.activite).length };
  // Ajouter (non créatrice) : succès annoncé ?
  await page.locator("#grpTab_add").tap();
  await page.waitForTimeout(300);
  await page.locator("#grpSearchInput").fill("tom g");
  await page.waitForTimeout(300);
  const boutonAjout = page.locator("#grpAddList button").first();
  if (await boutonAjout.count()) {
    await boutonAjout.tap();
    await page.waitForTimeout(1200);
    out.ajoutNonCreatrice = { toasts: (await toasts()).slice(-1), enBaseApres: serveur.t.conv_members.filter((m) => m.conv_id === jeu.ID.activite).length, tomEnBase: serveur.t.conv_members.some((m) => m.conv_id === jeu.ID.activite && m.user_id === GENS.tom.id), local: await page.evaluate((a) => (getConversations().find((c) => c.id === a.id).userIds || []).includes(a.tom), { id: jeu.ID.activite, tom: GENS.tom.id }), dernierMessage: await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); return c.messages[c.messages.length - 1].text; }, jeu.ID.activite) };
    await photo("ajout-non-creatrice");
  } else out.ajoutNonCreatrice = "aucun candidat";
  // Quitter la discussion (accepté cette fois)
  reponseDialogue = { accepter: true };
  await page.locator("#modalContent button", { hasText: "Quitter" }).tap();
  await page.waitForTimeout(1200);
  out.quitter = { toasts: (await toasts()).slice(-1), moiEnBase: serveur.t.conv_members.some((m) => m.conv_id === jeu.ID.activite && m.user_id === MOI.id), dansListe: await page.evaluate(() => [...document.querySelectorAll("#messageList .msg-name")].some((n) => /Répétition/.test(n.textContent))), conv: await page.evaluate(() => document.getElementById("conv-fullpage").classList.contains("active")) };
  await photo("apres-quitter");
  out.toasts = await toasts();
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
