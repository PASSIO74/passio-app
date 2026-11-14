// Sonde 06a — mode démo (sans session) : les cinq conversations « Exemple PASSIO ».
"use strict";
module.exports = async ({ page, photo }) => {
  const out = { dialogues: [] };
  let accepter = false;
  page.on("dialog", async (d) => { out.dialogues.push({ type: d.type(), message: d.message() }); if (accepter) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {}); });
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  try {
    await page.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = function (m, ty) { window.__toasts.push({ msg: String(m), type: ty || "info" }); return t.apply(this, arguments); }; });
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(1500);
    await photo("liste-exemples");
    out.liste = await page.evaluate(() => ({
      cartes: [...document.querySelectorAll("#messageList .msg-card")].map((c) => ({ nom: c.querySelector(".msg-name").textContent, l2: [...c.querySelectorAll(".msg-passion")].map((x) => x.textContent).join("|"), apercu: c.querySelector(".msg-preview").textContent, nonLu: c.classList.contains("unread"), demo: c.getAttribute("data-conv-demo"), h: Math.round(c.getBoundingClientRect().height) })),
      nav: (document.querySelector(".nav-msg-badge") || {}).textContent || null, squelette: document.querySelectorAll(".msg-skel-row").length, vide: getComputedStyle(document.getElementById("messagesEmpty")).display,
      l2Style: (function () { const e = document.querySelector("#messageList .msg-passion"); if (!e) return null; const cs = getComputedStyle(e); return { fs: cs.fontSize, col: cs.color }; })(),
    }));
    await page.locator("#messageList .msg-card").first().tap();
    await page.waitForTimeout(900);
    await photo("exemple-ouvert");
    out.exemple = await page.evaluate(() => { const h = document.getElementById("convFpHead"); const inp = document.getElementById("convFpInput"); return { nom: h.querySelector(".conv-fp-name").textContent, sous: h.querySelector(".conv-fp-passion").textContent, actions: [...h.querySelectorAll(".conv-action-btn")].map((b) => b.title), champ: { disabled: inp.disabled, readOnly: inp.readOnly, placeholder: inp.placeholder }, bandeau: (document.querySelector("#conv-fullpage [class*='demo'], #conv-fullpage [data-demo]") || {}).textContent || null }; });
    // Tenter d'écrire dans un exemple
    await page.locator("#convFpInput").fill("Bonjour !").catch(() => {});
    await page.locator("#convFpSendBtn").tap().catch(() => {});
    await page.waitForTimeout(700);
    out.ecrireExemple = { toasts: await toasts(), valeur: await page.evaluate(() => document.getElementById("convFpInput").value) };
    await photo("exemple-envoi-refuse");
    // Paramètres d'un exemple
    await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
    await page.waitForTimeout(500);
    await photo("exemple-parametres");
    out.parametresExemple = await page.evaluate(() => [...document.querySelectorAll("#convSettingsContent .csetting-label")].map((s) => s.textContent));
    // Supprimer l'exemple (accepté) → retour à la liste
    accepter = true;
    await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
    await page.locator("#convSettingsContent .csetting-item", { hasText: "Supprimer la conversation" }).tap();
    await page.waitForTimeout(900);
    out.apresSuppression = await page.evaluate(() => ({ n: document.querySelectorAll("#messageList .msg-card").length, toasts: (window.__toasts || []).map((t) => t.msg).slice(-1) }));
    // Supprimer les quatre autres pour atteindre l'état vide par de vrais gestes
    for (let i = 0; i < 4; i++) {
      await page.locator("#messageList .msg-card").first().tap();
      await page.waitForTimeout(700);
      await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
      await page.waitForTimeout(400);
      await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
      await page.locator("#convSettingsContent .csetting-item", { hasText: "Supprimer la conversation" }).tap();
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(400);
    await photo("etat-vide");
    out.vide = await page.evaluate(() => { const e = document.getElementById("messagesEmpty"); const t = e.querySelector(".empty-text"); return { display: getComputedStyle(e).display, titre: e.querySelector(".empty-title").textContent, texte: t.textContent, bouton: !!e.querySelector("button"), champRecherchePresent: !!document.getElementById("convGlobalSearch") && document.getElementById("convGlobalSearch").offsetParent !== null, placeholderRecherche: document.getElementById("convGlobalSearch").placeholder }; });
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "demo" };
