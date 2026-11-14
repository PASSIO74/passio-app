// Sonde ENTRÉE 05 — parcours historique (drapeau coupé : passio_first_run_experience_v1="0") :
// landing, son pied, puis étapes d'onboarding forcées (âge, prénom, passions) et tour guidé.
"use strict";
module.exports = async ({ page, photo }) => {
  const out = {};
  const b = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), c.position, c.zIndex]; }, sel);
  out.landing = await page.evaluate(() => { const l = document.getElementById("landing"); return { actif: l.classList.contains("active"), scroll: [l.scrollTop, l.scrollHeight, l.clientHeight] }; });
  out.cta = await b(".landing-cta"); out.badge = await b(".landing-badge");
  await photo("1-landing");
  await page.locator("#landing").evaluate((l) => l.scrollTo(0, 99999)); await page.waitForTimeout(600);
  await photo("2-landing-bas");
  await page.locator(".landing-cta button", { hasText: "Créer un compte" }).click(); await page.waitForTimeout(1200);
  out.signup = await page.evaluate(() => ({ onb: document.getElementById("onboarding").classList.contains("active"), sortie: !!document.getElementById("frBackToExplore"), msg: document.getElementById("authMsg").innerText }));
  await photo("3-signup-historique");
  await page.goBack(); await page.waitForTimeout(900);
  out.retour = await page.evaluate(() => ({ onb: document.getElementById("onboarding").classList.contains("active"), landing: document.getElementById("landing").classList.contains("active"), hash: location.hash }));
  await photo("4-retour");
  for (const etape of ["age", "name", "passions"]) {
    await page.evaluate((e) => { document.getElementById("onboarding").classList.add("active"); showOnbStep(e); }, etape);
    await page.waitForTimeout(900);
    out["etape_" + etape] = await page.evaluate(() => { const s = document.querySelector(".onb-step.active"); return s ? s.innerText.replace(/\s+/g, " ").slice(0, 300) : null; });
    await photo("5-etape-" + etape);
  }
  return out;
};
module.exports.demarrage = { mode: "visiteur", stockage: { passio_first_run_experience_v1: "0" } };
