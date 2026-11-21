// Sonde 04b — discussion d'activité dont je ne suis PAS la créatrice : rôle affiché, retirer, ajouter, quitter.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, GENS, MOI, serveur }) => {
  const out = { dialogues: [] };
  let accepter = false;
  page.on("dialog", async (d) => { out.dialogues.push({ type: d.type(), message: d.message() }); if (accepter) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {}); });
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  try {
    await page.evaluate(() => goTo("messages"));
    await jeu.attendreListe(page, 3);
    await page.locator('#messageList .msg-card:has(.msg-name:has-text("Répétition ouverte"))').tap();
    await page.waitForTimeout(900);
    await photo("entete-activite");
    out.entete = await page.evaluate(() => { const h = document.getElementById("convFpHead"); return { nom: h.querySelector(".conv-fp-name").textContent, sous: h.querySelector(".conv-fp-passion").textContent, avatarFond: h.querySelector(".conv-fp-head-avatar") ? h.querySelector(".conv-fp-head-avatar").style.background.slice(0, 80) : null, lienActivite: !!h.querySelector('[onclick*="openEvent"], [onclick*="Event"]') }; });
    await page.locator('#convFpHead .conv-action-btn[title="Membres"]').tap();
    await page.waitForTimeout(600);
    await photo("membres-non-creatrice");
    out.nonCreatrice = await page.evaluate(() => { const c = document.getElementById("modalContent"); return { texte: c.innerText, nbRetirer: [...c.querySelectorAll("button")].filter((b) => /Retirer/.test(b.textContent)).length }; });
    out.membresEnBase = serveur.t.conv_members.filter((m) => m.conv_id === jeu.ID.activite).length;
    await page.locator("#modalContent button", { hasText: "Retirer" }).first().tap();
    await page.waitForTimeout(1300);
    out.retraitNonCreatrice = { toasts: (await toasts()).slice(-1), apres: serveur.t.conv_members.filter((m) => m.conv_id === jeu.ID.activite).length };
    await photo("retrait-refuse");
    await page.locator("#grpTab_add").tap();
    await page.waitForTimeout(300);
    await page.locator("#grpSearchInput").fill("Tom G");
    await page.waitForTimeout(300);
    await photo("ajouter-recherche");
    const bouton = page.locator("#grpAddList button").first();
    if (await bouton.count()) {
      await bouton.tap();
      await page.waitForTimeout(1300);
      out.ajoutNonCreatrice = {
        toasts: (await toasts()).slice(-1),
        tomEnBase: serveur.t.conv_members.some((m) => m.conv_id === jeu.ID.activite && m.user_id === GENS.tom.id),
        local: await page.evaluate((a) => (getConversations().find((c) => c.id === a.id).userIds || []).includes(a.tom), { id: jeu.ID.activite, tom: GENS.tom.id }),
        dernierMessage: await page.evaluate((id) => { const c = getConversations().find((x) => x.id === id); return c.messages[c.messages.length - 1].text; }, jeu.ID.activite),
        refusServeur: serveur.journal.filter((r) => r.table === "conv_members" && r.m === "POST").length,
      };
      await photo("ajout-annonce");
    } else out.ajoutNonCreatrice = "aucun candidat";
    accepter = true;
    await page.locator("#modalContent button", { hasText: "Quitter" }).tap();
    await page.waitForTimeout(1300);
    out.quitter = { toasts: (await toasts()).slice(-1), moiEnBase: serveur.t.conv_members.some((m) => m.conv_id === jeu.ID.activite && m.user_id === MOI.id), dansListe: await page.evaluate(() => [...document.querySelectorAll("#messageList .msg-name")].some((n) => /Répétition/.test(n.textContent))), conv: await page.evaluate(() => document.getElementById("conv-fullpage").classList.contains("active")) };
    await photo("apres-quitter");
    // Paramètres d'un GROUPE (pas de section Confidentialité)
    await page.locator('#messageList .msg-card:has(.msg-name:has-text("Grimpe du jeudi"))').tap();
    await page.waitForTimeout(800);
    await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
    await page.waitForTimeout(500);
    await photo("parametres-groupe");
    out.parametresGroupe = await page.evaluate(() => ({ sections: [...document.querySelectorAll("#convSettingsContent .csetting-section")].map((s) => s.textContent), items: [...document.querySelectorAll("#convSettingsContent .csetting-label")].map((s) => s.textContent) }));
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  out.toasts = await toasts();
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
