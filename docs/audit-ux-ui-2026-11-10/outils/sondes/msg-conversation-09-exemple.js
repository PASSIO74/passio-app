// Sonde 09 — conversation d'exemple en mode démonstration : que se passe-t-il à l'envoi,
// au micro, au menu « + » ? (toast, fenêtre de compte, rien ?)
"use strict";
module.exports = async ({ page, photo }) => {
  const out = {};
  try {
    await page.evaluate(() => goTo("messages"));
    await page.waitForSelector("#messageList .msg-card", { timeout: 15000 });
    await page.waitForTimeout(600);
    out.cartes = await page.evaluate(() => [...document.querySelectorAll("#messageList .msg-card")].map((c) => ({ t: c.innerText.replace(/\s+/g, " ").slice(0, 80), demo: c.getAttribute("data-conv-demo") })));
    await page.locator("#messageList .msg-card").first().click();
    await page.waitForFunction(() => document.getElementById("conv-fullpage").classList.contains("active"), null, { timeout: 8000 });
    await page.waitForTimeout(1000);
    out.tete = await page.evaluate(() => document.getElementById("convFpHead").innerText.replace(/\s+/g, " "));
    await page.evaluate(() => { window.__t = []; const st = document.getElementById("toastStack"); new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => window.__t.push(n.textContent)))).observe(st, { childList: true }); });
    await page.locator("#convFpInput").fill("Bonjour !");
    await page.locator("#convFpSendBtn").click();
    await page.waitForTimeout(500);
    out.envoi = await page.evaluate(() => ({ toasts: window.__t.slice(), modale: document.getElementById("modalBackdrop").classList.contains("active"), titreModale: ((document.querySelector("#modalContent h2, #modalContent h3, #modalContent .modal-title") || {}).textContent || "").trim().slice(0, 80), champ: document.getElementById("convFpInput").value, landing: (document.getElementById("landing") || { classList: { contains: () => false } }).classList.contains("active"), invite: typeof window.requireAuthentication === "function" }));
    await photo("apres-envoi");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.waitForTimeout(400);
    // micro et pièce jointe
    await page.locator("#btnVoice").tap(); await page.waitForTimeout(500);
    out.micro = await page.evaluate(() => ({ toasts: window.__t.slice(), modale: document.getElementById("modalBackdrop").classList.contains("active"), enregistre: window._isRecording }));
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "demo" };
