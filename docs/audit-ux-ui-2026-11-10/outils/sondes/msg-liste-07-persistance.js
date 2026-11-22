// Sonde 07 — ce qui survit à un rechargement : épinglée, archivée, sourdine, fond, brouillon, photo et
// description de groupe. Chaque réglage est posé PAR DE VRAIS GESTES, puis la page est rechargée
// (même onglet, même stockage, même faux serveur) — comme une application fermée puis rouverte.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo }) => {
  const out = { dialogues: [] };
  page.on("dialog", async (d) => { out.dialogues.push(d.message()); await d.accept("Sortie falaise chaque jeudi, niveau 5c et plus.").catch(() => {}); });
  const item = (texte) => page.locator("#convSettingsContent .csetting-item", { hasText: texte }).first();
  const ouvrir = async (nom) => { await page.locator('#messageList .msg-card:has(.msg-name:has-text("' + nom + '"))').tap(); await page.waitForTimeout(800); };
  const parametres = async () => { await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap(); await page.waitForTimeout(450); };
  const retour = async () => { await page.locator("#convFpHead .conv-fp-back").tap(); await page.waitForTimeout(700); };
  const etat = () => page.evaluate((ID) => {
    const c = (id) => getConversations().find((x) => x.id === id) || {};
    return {
      tomEpinglee: !!c(ID.tom).pinned, inesArchivee: !!c(ID.ines).archived, malikSourdine: !!c(ID.malik)._muted, leaFond: c(ID.lea).bg || null, longBrouillon: c(ID.long).draft || null,
      groupeDescription: c(ID.groupe).groupDesc || null,
      premiers: [...document.querySelectorAll("#messageList .msg-name")].slice(0, 3).map((n) => n.textContent), archivees: document.getElementById("archivedToggleRow").innerText,
      apercuLong: ([...document.querySelectorAll("#messageList .msg-card")].find((k) => /Marie-Charlotte/.test(k.textContent)) || { querySelector: () => ({ textContent: "" }) }).querySelector(".msg-preview").textContent.slice(0, 50),
      stockage: (function () { try { const s = JSON.parse(localStorage.getItem("passio_conversations_v1") || "[]"); const g = (id) => s.find((x) => x.id === id) || {}; return { tom: !!g(ID.tom).pinned, ines: !!g(ID.ines).archived, malik: !!g(ID.malik)._muted, lea: g(ID.lea).bg || null, long: g(ID.long).draft || null }; } catch (e) { return String(e); } })(),
    };
  }, jeu.ID);
  try {
    await page.evaluate(() => goTo("messages"));
    await jeu.attendreListe(page, 5);
    // Épingler Tom
    await ouvrir("Tom Girard"); await parametres(); await item("Épingler").tap(); await page.waitForTimeout(400); await retour();
    // Sourdine Malik
    await ouvrir("Malik Benali"); await parametres(); await item("Couper les notifications").tap(); await page.waitForTimeout(400);
    await page.locator("#convSettingsPanel .conv-fp-back").tap(); await page.waitForTimeout(300); await retour();
    // Fond « Océan » chez Léa
    await ouvrir("Léa Fontaine"); await parametres(); await item("Fond de conversation").tap(); await page.waitForTimeout(400);
    await page.locator('#modalContent [onclick^="_setConvBg"]').nth(2).tap(); await page.waitForTimeout(600); await retour();
    // Brouillon chez Marie-Charlotte
    await ouvrir("Marie-Charlotte"); await page.locator("#convFpInput").fill("Merci, je serai là samedi avec"); await page.waitForTimeout(400); await retour();
    // Description du groupe
    await ouvrir("Grimpe du jeudi"); await page.locator('#convFpHead .conv-action-btn[title="Membres"]').tap(); await page.waitForTimeout(500);
    await page.locator('#modalContent [onclick^="editGroupDescription"]').tap(); await page.waitForTimeout(600);
    await page.locator("#modalContent button", { hasText: "Retour" }).tap(); await page.waitForTimeout(600); await retour();
    // Archiver Inès
    await ouvrir("Inès Moreau"); await parametres(); await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; }); await item("Archiver la conversation").tap(); await page.waitForTimeout(900);
    await page.waitForTimeout(600);   // laisse passer l'écriture différée (250 ms) dans le stockage
    out.avant = await etat();
    await photo("avant-rechargement");
    // Rechargement
    await page.reload();
    await page.waitForFunction(() => { const el = document.getElementById("screen-feed"); return el && el.classList.contains("active"); }, null, { timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); goTo("messages"); });
    await jeu.attendreListe(page, 5);
    await page.waitForTimeout(800);
    out.apres = await etat();
    await photo("apres-rechargement");
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
