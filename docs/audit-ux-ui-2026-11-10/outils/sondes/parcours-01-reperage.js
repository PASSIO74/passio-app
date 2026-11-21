// Repérage du parcours cœur : ce que montre le fil, puis ce qu'ouvre un appui sur l'auteur.
const jeu = require("../jeu/parcours");
const decrire = () => {
  const vus = (sel, racine) => Array.from((racine || document).querySelectorAll(sel)).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const nom = (e) => (e.getAttribute("aria-label") || e.innerText || e.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 50);
  const modale = document.querySelector("#modalBackdrop.active #modalContent, #modalBackdrop.open #modalContent, #modalBackdrop[style*='flex'] #modalContent");
  const racine = modale || document.querySelector("#conv-fullpage.active") || document.querySelector(".screen.active");
  return {
    ou: modale ? "modale" : (document.querySelector("#conv-fullpage.active") ? "conversation" : (document.querySelector(".screen.active") || {}).id),
    commandes: vus("button, [role='button'], a[href], [onclick]", racine).slice(0, 40).map((e) => nom(e) + " <" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/)[0] : "") + ">"),
  };
};
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(2500);
  const out = {};
  out.cartes = await page.evaluate(() => Array.from(document.querySelectorAll("#feedList [data-post-id], #feedList .post-card")).slice(0, 5).map((c) => ({ id: c.getAttribute("data-post-id") || c.id, auteur: (c.querySelector(".post-author") || {}).innerText, boutons: Array.from(c.querySelectorAll("button, [role='button'], [onclick]")).map((b) => (b.getAttribute("aria-label") || b.innerText || "").replace(/\s+/g, " ").trim().slice(0, 28)).filter(Boolean) })));
  await photo("1-fil");
  // Appui sur l'auteur de la première carte.
  const auteur = page.locator("#feedList .post-author").first();
  await auteur.click();
  await page.waitForTimeout(1500);
  out.apresAuteur = await page.evaluate(decrire);
  await photo("2-profil");
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
