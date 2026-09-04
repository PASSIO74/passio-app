const path = require("path"); const fs = require("fs");
const REPO = "/home/user/passio-app";
const { chromium } = require(path.join(REPO, "node_modules/@playwright/test"));
const { bootOnboarded } = require(path.join(REPO, "tests/e2e/app-helper.js"));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:8105", viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  await bootOnboarded(page, null, 3);
  const r = await page.evaluate(() => {
    if (typeof openSettings === "function") openSettings();
    const b = document.getElementById("settingsPassionsIllimitees");
    const sec = b && b.closest(".settings-section");
    if (sec && !sec.classList.contains("open")) sec.classList.add("open");
    b && b.scrollIntoView();
    const vis = !!(b && b.offsetParent);
    const avant = { plafondActif: plafondPassionsActif(), restantes: passionsRestantesOffertes(), quota: changementsPassionRestants() };
    b && b.click();
    const apres = { plafondActif: plafondPassionsActif(), restantes: passionsRestantesOffertes(), quota: changementsPassionRestants(), texte: b && b.textContent, cle: localStorage.getItem("passio_passions_illimitees_v1") };
    return { boutonPresent: !!b, boutonVisible: vis, avant, apres, gardeCompte: (function(){ try { return typeof requireAuthentication === "function"; } catch(e){ return null; } })() };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + "/G-bouton-illimite-parametres.png" });
  fs.writeFileSync(__dirname + "/G-bouton-illimite-parametres.json", JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
