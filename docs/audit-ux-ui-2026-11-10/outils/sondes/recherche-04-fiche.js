// Recherche — fiche d'une passion : ouverture depuis une tuile tendance, depuis un
// résultat, passion à moi / pas à moi / sans contenu, créateurs, passions proches,
// bas de fiche, « + Créer profil », suivi synchronisé, tuile « ✨ Passion ».
const jeu = require("../jeu/recherche");
const banc = require("../banc");
const decrire = () => {
  const m = document.querySelector("#modalBackdrop.active #modalContent");
  if (!m) return { modale: false, ecran: document.querySelector(".screen.active").id };
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    modale: true,
    texte: m.innerText.replace(/\n+/g, " | ").slice(0, 900),
    hauteur: m.scrollHeight, visible: m.clientHeight,
    cmds: Array.from(m.querySelectorAll("button, [role=button], .link, .trending-tile")).filter(vis).slice(0, 24).map((e) => { const r = e.getBoundingClientRect(); return (e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").slice(0, 30) + " " + Math.round(r.width) + "×" + Math.round(r.height); }),
    activites: /activit|sortie|rencontr|IRL/i.test(m.innerText),
  };
};
module.exports = async ({ page, photo, serveur, GENS }) => {
  const out = {};
  const etape = async (nom, fn, att) => { try { await fn(); await page.waitForTimeout(att == null ? 1500 : att); out[nom] = await page.evaluate(decrire); await photo(nom); } catch (e) { out[nom] = "ERREUR " + String(e.message).slice(0, 300); } };
  try {
    await page.locator(".topbar-right > *").first().click();
    await page.waitForTimeout(1800);
    out.tendances = await page.evaluate(() => document.getElementById("trendingGrid").innerText.replace(/\n/g, " | "));
    await etape("01-musique", async () => { await page.locator("#trendingGrid .trending-tile").first().click(); });
    await etape("02-musique-bas", async () => { await page.evaluate(() => { const m = document.querySelector("#modalContent"); m.scrollTop = m.scrollHeight; }); }, 500);
    await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
    await etape("03-escalade", async () => { const i = page.locator("#explorerSearch"); await i.fill("escalade"); await i.dispatchEvent("input"); await page.waitForTimeout(1400); await page.locator("#exploreSearchResults >> text=Escalade").first().click(); });
    out.escaladeBoutons = await page.evaluate(() => Array.from(document.querySelectorAll("#modalContent .btn")).map((b) => b.innerText + " " + Math.round(b.getBoundingClientRect().width) + "×" + Math.round(b.getBoundingClientRect().height)));
    await etape("04-astro-vide", async () => { await page.evaluate(() => openPassionExplorer("photo-astrophoto")); });
    await etape("05-suivre-depuis-fiche", async () => {
      await page.evaluate(() => closeModal()); await page.waitForTimeout(300);
      const i = page.locator("#explorerSearch"); await i.fill("escalade"); await i.dispatchEvent("input"); await page.waitForTimeout(1400);
      await page.locator("#exploreSearchResults >> text=Escalade").first().click(); await page.waitForTimeout(1400);
    });
    out.createursEscalade = await page.evaluate(() => document.getElementById("pexCreators").innerText.replace(/\n/g, " | "));
    // Créer profil (ajouter la passion)
    await etape("06-creer-profil", async () => { await page.locator("#modalContent button:has-text('Créer profil')").first().click(); }, 1500);
    out.toasts = await page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
    out.apresAjout = await page.evaluate(() => ({ ecran: document.querySelector(".screen.active").id, passions: state.user.profiles.map((p) => p.passion + (p.archived ? "(arch)" : "")) }));
    // Créateurs à suivre : seed suivable ?
    await page.evaluate(() => goTo("explore")); await page.waitForTimeout(1500);
    out.createurs = await page.evaluate(() => Array.from(document.querySelectorAll("#suggestedCreators .list-row")).map((r) => r.innerText.replace(/\n/g, " | ")));
    await etape("07-createurs", async () => { await page.evaluate(() => { const el = document.getElementById("suggestedCreators"); el.scrollIntoView({ block: "start" }); }); }, 500);
    const avant = serveur.t.follows.length;
    const seed = page.locator("#suggestedCreators .list-row:has-text('Karim Belkacem') button").first();
    if (await seed.count()) { await seed.click(); await page.waitForTimeout(1500); }
    out.suivreSeed = { followsAvant: avant, followsApres: serveur.t.follows.length, derniere: serveur.t.follows.slice(-1)[0], toasts: await page.evaluate(() => (window.__toasts || []).slice(-3).map((t) => t.msg)), bouton: await seed.innerText().catch(() => null) };
    await photo("08-suivre-seed");
    // seed users : identifiants
    out.seedIds = await page.evaluate(() => (state.seed.users || []).slice(0, 6).map((u) => u.id + " " + u.name));
    out.ines = await page.evaluate(() => Array.from(document.querySelectorAll("[data-follow-uid='a0d17000-0000-4000-8000-00000000d004']")).map((b) => b.innerText));
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(banc.onboardedState), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
