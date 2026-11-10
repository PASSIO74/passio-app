// Sonde bobines 05 : onglet Bobines de mon profil et d'un profil visité (ouverture puis fermeture : où revient-on ?),
// sortie vers l'auteur, bulle du live → visionneuse spectateur.
const base = require("../jeu/base");
const jeu = require("../jeu/bobines");
const fs = require("fs"), path = require("path"), os = require("os");
module.exports = async ({ page, photo, GENS }) => {
  await page.waitForTimeout(2500);
  const out = {};
  const ecran = () => page.evaluate(() => ({ ecran: (document.querySelector(".screen.active") || {}).id, modale: document.getElementById("modalBackdrop").classList.contains("active"), reels: reelsState.open, hash: location.hash, vlive: !!document.querySelector("#vliveOverlay.active") }));
  try {
    await page.evaluate(() => { const p = findPostAnywhere("pb_bob_moi"); state.userPosts.unshift(Object.assign({}, p, { _source: "me", profileId: state.user.currentProfileId })); saveState(); goTo("profiles"); });
    await page.waitForTimeout(1200);
    await page.locator('.profile-tab[data-tab="bobines"]').first().click(); await page.waitForTimeout(400); await page.locator('.profile-tab[data-tab="posts"]').first().click();
    await page.waitForTimeout(900);
    await page.evaluate(() => { const g = document.querySelector("#myPostsList, #myPosts") ; const t = document.querySelector('.profile-tab[data-tab="bobines"]'); t && t.scrollIntoView({ block: "start" }); });
    await page.waitForTimeout(500);
    await photo("mon-profil-bobines");
    out.monProfil = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('[onclick^="openReelById"]')); return c.map((e) => ({ html: e.innerHTML.slice(0, 160), r: [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)] })); });
    await page.locator('[onclick^="openReelById"]').first().click();
    await page.waitForTimeout(1200);
    out.apresOuverture = Object.assign(await ecran(), { id: await page.evaluate(() => (document.querySelectorAll("#reelsList .reel-item")[reelsState.current] || {}).getAttribute && document.querySelectorAll("#reelsList .reel-item")[reelsState.current].getAttribute("data-post-id")) });
    await page.locator(".reels-close").click();
    await page.waitForTimeout(800);
    out.apresFermeture = await ecran();
    // profil visité
    await page.evaluate((id) => openUserProfile(id), GENS.lea.id);
    await page.waitForTimeout(1500);
    const t = page.locator('#visitedTabs .profile-tab[data-vtab="bobines"]');
    out.ongletVisite = await t.count();
    if (out.ongletVisite) { await t.first().click(); await page.waitForTimeout(500); const tt = page.locator('#visitedTabs .profile-tab[data-vtab="posts"]'); if (await tt.count() && (await tt.first().getAttribute('aria-pressed')) === 'true') await tt.first().click(); await page.waitForTimeout(900); }
    await photo("profil-visite-bobines");
    out.visiteGrille = await page.evaluate(() => Array.from(document.querySelectorAll('[onclick*="openReelById"]')).length);
    await page.locator('.modal [onclick*="openReelById"]').first().click();
    await page.waitForTimeout(1200);
    out.visiteOuverture = await ecran();
    await page.locator(".reels-close").click();
    await page.waitForTimeout(800);
    out.visiteFermeture = await ecran();
    await photo("apres-fermeture-visite");
    // sortie auteur depuis le lecteur
    await page.evaluate(() => goTo("feed")); await page.waitForTimeout(800);
    await page.evaluate(() => openReelById("pb_bob_lea")); await page.waitForTimeout(1200);
    await page.locator(".reel-item").first().locator(".reel-author").click();
    await page.waitForTimeout(1200);
    out.sortieAuteur = await ecran();
    await photo("sortie-auteur");
    await page.evaluate(() => { try { closeModal(); } catch (e) {} goTo("feed"); }); await page.waitForTimeout(800);
    // live
    await page.evaluate(() => { const m = document.getElementById("appMain"); if (m) m.scrollTop = 0; });
    await page.waitForTimeout(400);
    await page.locator("#storiesRowFeed .story-item", { hasText: "Tom" }).first().click();
    await page.waitForTimeout(2500);
    out.live = Object.assign(await ecran(), await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }; return { close: r(".vlive-close"), share: r(".vlive-icon-btn"), follow: r("#vliveFollowBtn"), react: r(".vlive-react-btn"), input: r("#vliveChatInput"), inputFs: getComputedStyle(document.getElementById("vliveChatInput") || document.body).fontSize, status: (document.getElementById("vliveStatus") || {}).textContent, toasts: (window.__toasts || []).slice(-3) }; }));
    await photo("live");
  } catch (e) { out.erreur = String(e.message).slice(0, 500); }
  fs.writeFileSync(path.join(os.tmpdir(), "passio-audit-sondes", "bobines-05.json"), JSON.stringify(out, null, 1));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => { base.peupler(s, c); jeu.peupler(s, c, { live: true }); } };
