// Sonde ENTRÉE 02 — ce que chaque destination fait pour un visiteur, puis la porte de compte.
"use strict";
module.exports = async ({ page, photo }) => {
  const etat = () => page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== "none" && c.visibility !== "hidden" && r.height > 0; };
    const mb = document.getElementById("modalBackdrop");
    return {
      ecran: (document.querySelector(".screen.active") || {}).id, hash: location.hash,
      modale: mb && mb.classList.contains("active") ? document.getElementById("modalContent").innerText.replace(/\s+/g, " ").slice(0, 260) : null,
      onboarding: vis(document.getElementById("onboarding")),
      feuille: (() => { const s = document.getElementById("v2CreateSheet"); return s && !s.hidden ? s.innerText.replace(/\s+/g, " ") : null; })(),
      bulle: (() => { const t = document.querySelector(".fr-tip"); return t ? t.innerText.replace(/\s+/g, " ") : null; })(),
      haut: ((document.querySelector(".screen.active") || {}).innerText || "").replace(/\s+/g, " ").slice(0, 300),
      hist: history.length,
    };
  });
  const out = {};
  const clic = async (cle) => { await page.locator('#appNavV2 [data-v2-key="' + cle + '"]').click(); await page.waitForTimeout(1300); };
  await clic("meet"); out.rencontrer = await etat(); await photo("a-rencontrer");
  await clic("messages"); out.messages = await etat(); await photo("b-messages");
  await clic("profile"); out.profil = await etat(); await photo("c-profil");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await clic("create"); out.creer = await etat(); await photo("d-creer");
  await page.locator("#v2CreateSheet [data-v2-create=post]").click().catch(() => {}); await page.waitForTimeout(1300);
  out.creerPublication = await etat(); await photo("e-creer-publication");
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await page.locator(".app-topbar .topbar-left").click(); await page.waitForTimeout(1200);
  out.logo = await etat(); await photo("f-logo");
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await page.locator('.app-topbar [aria-label="Notifications"]').click(); await page.waitForTimeout(1200);
  out.cloche = await etat(); await photo("g-cloche");
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await page.locator('.app-topbar [aria-label="Paramètres"]').click(); await page.waitForTimeout(1200);
  out.parametres = await etat();
  out.devPanel = await page.evaluate(() => { const p = document.getElementById("devPanel"); return { cls: p.className, texte: p.innerText.replace(/\s+/g, " ").slice(0, 600) }; });
  await photo("h-parametres");
  await page.locator('.app-topbar [aria-label="Paramètres"]').click().catch(() => {}); await page.waitForTimeout(600);
  await page.locator('.app-topbar [aria-label="Explorer"]').click(); await page.waitForTimeout(1300);
  out.loupe = await etat(); await photo("i-loupe");
  // Retour système depuis la loupe
  await page.goBack(); await page.waitForTimeout(900); out.retourLoupe = await etat();
  return out;
};
module.exports.demarrage = { mode: "visiteur" };
