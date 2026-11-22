// Compte PRIVÉ (MOI) avec une demande en attente (Nora) : compteur et liste « Abonnés »
// AVANT acceptation, notification Accepter / Refuser, puis après acceptation.
// Blocage : Tom bloqué par moi, Inès qui m'a bloquée ; « Bloquer » depuis le menu ⋯.
const jeu = require("../jeu/profils");
const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
module.exports = async ({ page, photo, serveur, GENS }) => {
  const out = {};
  const etape = async (nom, fn) => { try { out[nom] = await fn(); await photo(nom); } catch (e) { out[nom] = "ERREUR " + String(e.message).slice(0, 300); } };
  await page.evaluate(() => goTo("profiles"));
  await jeu.absolutiser(page);
  await page.waitForTimeout(2000);
  await etape("1-compteur", async () => page.evaluate(() => document.querySelector("#mainProfileCard .main-profile-stats").innerText.replace(/\s+/g, " ")));
  await etape("2-liste-abonnes", async () => { await page.locator(".main-profile-stat:visible").first().click(); await page.waitForTimeout(1500); return page.evaluate(() => document.getElementById("peopleListBody").innerText.replace(/\s+/g, " ").slice(-200)); });
  await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
  await etape("3-cloche", async () => { await page.locator(".topbar-bell").last().click(); await page.waitForTimeout(1500); return page.evaluate(() => { const l = document.querySelector(".notif-list") || document.querySelector("#modalContent"); return l ? l.innerText.replace(/\s+/g, " ").slice(0, 500) : "?"; }); });
  await etape("4-accepter", async () => { await page.locator("button:has-text('Accepter')").first().click(); await page.waitForTimeout(1500); return { toasts: await page.evaluate(() => (window.__toasts || []).map((t) => t.msg).slice(-2)), ligne: serveur.t.follows.find((f) => f.follower_id === jeu.NORA.id) }; });
  await page.evaluate(() => { closeModal(); goTo("profiles"); }); await page.waitForTimeout(800);
  // Tom bloqué par moi
  await etape("5-tom-bloque", async () => { await page.evaluate((u) => openUserProfile(u), GENS.tom.id); await page.waitForTimeout(2200); return page.evaluate(() => (document.querySelector("#modalContent") || {}).innerText.replace(/\s+/g, " ").slice(0, 400)); });
  await etape("6-tom-menu", async () => { await page.locator("#modalContent .profile-dots-btn").click(); await page.waitForTimeout(400); return page.evaluate(() => document.getElementById("profileDotsMenu").innerText); });
  await page.keyboard.press("Escape"); await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
  // Inès m'a bloquée
  await etape("7-ines-bloque-moi", async () => { await page.evaluate((u) => openUserProfile(u), GENS.ines.id); await page.waitForTimeout(2200); return page.evaluate(() => (document.querySelector("#modalContent") || {}).innerText.replace(/\s+/g, " ").slice(0, 400)); });
  await page.evaluate(() => closeModal()); await page.waitForTimeout(400);
  // Bloquer Malik depuis le menu : y a-t-il une confirmation ?
  await etape("8-bloquer-malik", async () => {
    await page.evaluate((u) => openUserProfile(u), GENS.malik.id); await page.waitForTimeout(2200);
    await page.locator("#modalContent .profile-dots-btn").click(); await page.waitForTimeout(400);
    await page.locator("#profileDotsMenu >> text=Bloquer").click(); await page.waitForTimeout(1500);
    return { modale: await page.evaluate(() => (document.querySelector("#modalBackdrop.active #modalContent") || {}).innerText || null), toasts: await page.evaluate(() => (window.__toasts || []).map((t) => t.msg).slice(-2)), blocks: serveur.t.blocks.map((b) => b.blocker_id.slice(-4) + "→" + b.blocked_id.slice(-4)) };
  });
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(M, { passions: 2 }), peupler: (srv, ctx) => jeu.peupler(srv, ctx, { moiPrive: true, bloque: true, bloquePar: true, abonnes: 4 }) };
