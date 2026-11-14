// Sonde ENTRÉE 01 — première visite d'un visiteur (mode visiteur, drapeau actif par défaut).
// Ce que voit un appareil vierge : écran actif, barres, carte de bienvenue, repères, aides.
"use strict";
module.exports = async ({ page, photo }) => {
  const lire = () => page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== "none" && c.visibility !== "hidden" && r.height > 0 && r.width > 0; };
    const boite = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
    const nav = document.getElementById("appNavV2");
    return {
      ecran: (document.querySelector(".screen.active") || {}).id,
      landing: vis(document.getElementById("landing")), onboarding: vis(document.getElementById("onboarding")),
      racine: document.documentElement.className,
      bienvenue: (() => { const w = document.getElementById("frWelcome"); return w ? { boite: boite(w), texte: w.innerText.replace(/\s+/g, " ") } : null; })(),
      bulle: (() => { const t = document.querySelector(".fr-tip"); return t ? { boite: boite(t), texte: t.innerText.replace(/\s+/g, " ") } : null; })(),
      nav: nav ? [...nav.children].map((c) => ({ label: c.innerText.trim(), aria: c.getAttribute("aria-label"), tag: c.tagName, actif: c.classList.contains("active"), boite: boite(c) })) : null,
      navAncienne: vis(document.getElementById("appNav")),
      topbar: [...document.querySelectorAll(".app-topbar [role=button], .app-topbar button")].filter(vis).map((c) => ({ aria: c.getAttribute("aria-label"), title: c.title, boite: boite(c) })),
      titreEcran: [...document.querySelectorAll(".screen.active h1, .screen.active h2, .screen.active .screen-title")].filter(vis).slice(0, 4).map((e) => e.innerText.trim().slice(0, 60)),
      prefs: localStorage.getItem("passio_first_run_v1"),
      hash: location.hash,
      vh: getComputedStyle(document.documentElement).getPropertyValue("--app-vh"),
      skip: [...document.querySelectorAll("a[href^='#']")].slice(0, 3).map((a) => a.outerHTML.slice(0, 120)),
      textes: (document.querySelector(".screen.active") || document.body).innerText.replace(/\s+/g, " ").slice(0, 700),
    };
  });
  const out = { arrivee: await lire() };
  await photo("1-arrivee");
  await page.locator("#appMain").evaluate((m) => m.scrollTo(0, 900));
  await page.waitForTimeout(1200);
  out.apresDefilement = await lire();
  await photo("2-defile");
  await page.waitForTimeout(5000);
  out.apresAttente = await lire();
  await photo("3-attente");
  return out;
};
module.exports.demarrage = { mode: "visiteur" };
