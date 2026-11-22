// Sonde — partage d'un PROFIL (menu ⋯ du profil visité) et « Inviter des amis »
// (crayon de mon profil, Paramètres → Support, séparateur « Exemples » du fil),
// plus la fiche d'une passion (porte de partage : présente ou non ?).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");
const A = require("./partage-aide");

module.exports = async ({ page, photo, context }) => {
  const out = {};
  // ── Profil visité : toucher l'auteur d'une carte du fil ──────────────────
  await A.etape(out, "profil", async () => {
    const carte = await A.centrerCarte(page, "pa_lea_1");
    await carte.locator(".post-author").first().click();
    await page.waitForTimeout(2500);
    await photo("a-profil-visite");
    return page.evaluate(() => {
      const c = document.getElementById("modalContent");
      const b = c.querySelector("[onclick*='openVisitedProfileMenu']");
      const r = b ? b.getBoundingClientRect() : null;
      return { hash: location.hash, menu: b ? { html: b.outerHTML.slice(0, 220), w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label") } : null, partageDirect: !!c.querySelector("[onclick*='shareUserProfile']") };
    });
  });
  await A.etape(out, "menu", async () => {
    await page.locator("#modalContent [onclick*='openVisitedProfileMenu']").first().click();
    await page.waitForTimeout(400);
    await photo("b-menu-profil-visite");
    return page.evaluate(() => { const m = document.querySelector(".profile-dots-menu"); return m ? { items: Array.from(m.querySelectorAll("button")).map((b) => ({ t: b.innerText, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })), role: m.getAttribute("role"), z: getComputedStyle(m).zIndex } : null; });
  });
  await A.etape(out, "partageRefuse", async () => {
    await page.locator(".profile-dots-menu button", { hasText: "Partager le profil" }).click();
    await page.waitForTimeout(600);
    await photo("c-partage-profil-refuse");
    return page.evaluate(A.toastsVisibles);
  });
  await page.waitForTimeout(3200);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await A.etape(out, "partageCopie", async () => {
    await page.locator("#modalContent [onclick*='openVisitedProfileMenu']").first().click();
    await page.waitForTimeout(300);
    await page.locator(".profile-dots-menu button", { hasText: "Partager le profil" }).click();
    await page.waitForTimeout(600);
    await photo("d-partage-profil-copie");
    return { toasts: await page.evaluate(A.toastsVisibles), presse: await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message)) };
  });
  await A.etape(out, "natifProfil", async () => {
    await A.simulerPartageNatif(page, "ok");
    await page.locator("#modalContent [onclick*='openVisitedProfileMenu']").first().click();
    await page.waitForTimeout(300);
    await page.locator(".profile-dots-menu button", { hasText: "Partager le profil" }).click();
    await page.waitForTimeout(400);
    return page.evaluate(() => window.__partages.slice());
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3300);

  // ── Mon profil : crayon → menu → Inviter des amis ────────────────────────
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(1500);
  await A.etape(out, "monProfil", async () => {
    const r = await page.evaluate(() => { const b = document.querySelector("#screen-profiles .v6b-modifier"); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label"), partageMonProfil: !!document.querySelector("#screen-profiles [onclick*='shareUserProfile']") }; });
    await page.locator("#screen-profiles .v6b-modifier").first().click();
    await page.waitForTimeout(400);
    await photo("e-menu-mon-profil");
    r.entrees = await page.evaluate(() => Array.from(document.querySelectorAll(".profile-dots-menu button")).map((b) => b.innerText));
    return r;
  });
  await A.etape(out, "inviterProfilNatif", async () => {
    await page.evaluate(() => { window.__partages = []; });
    await page.locator(".profile-dots-menu button", { hasText: "Inviter des amis" }).click();
    await page.waitForTimeout(400);
    return page.evaluate(() => window.__partages.slice());
  });
  await A.retirerPartageNatif(page);
  await A.etape(out, "inviterProfilCopie", async () => {
    await page.locator("#screen-profiles .v6b-modifier").first().click();
    await page.waitForTimeout(300);
    await page.locator(".profile-dots-menu button", { hasText: "Inviter des amis" }).click();
    await page.waitForTimeout(700);
    await photo("f-inviter-copie");
    return { share: await page.evaluate(() => typeof navigator.share), toasts: await page.evaluate(A.toastsVisibles), presse: await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message)), journal: await page.evaluate(() => (window.__toasts || []).map((t) => t.msg).slice(-3)) };
  });
  await page.waitForTimeout(3200);

  // ── Paramètres → Support (trois gestes réels) ───────────────────────────
  await A.etape(out, "support", async () => {
    await page.locator(".hamburger[aria-label='Paramètres']").first().click();
    await page.waitForTimeout(500);
    await photo("g-parametres");
    await page.locator("#devPanel .settings-section-header", { hasText: "Support" }).click();
    await page.waitForTimeout(500);
    await photo("h-parametres-support");
    const b = await page.evaluate(() => { const b = document.querySelector("#devPanel [onclick*='shareBeta()']"); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), rang: Array.from(b.parentElement.children).indexOf(b) + 1, sur: b.parentElement.children.length, voisins: Array.from(b.parentElement.children).map((c) => c.innerText.trim()) }; });
    await page.locator("#devPanel [onclick*='shareBeta()']").click();
    await page.waitForTimeout(700);
    await photo("i-apres-support");
    b.toasts = await page.evaluate(A.toastsVisibles);
    b.presse = await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message));
    b.panneauOuvert = await page.evaluate(() => document.getElementById("devPanel").classList.contains("active"));
    return b;
  });
  await page.waitForTimeout(3200);

  // ── Séparateur « Exemples PASSIO » du fil ───────────────────────────────
  await A.etape(out, "separateur", async () => {
    await page.evaluate(() => goTo("feed"));
    await page.waitForTimeout(1200);
    const s = await page.evaluate(() => { const s = document.querySelector(".feed-exemples-sep"); const b = document.querySelector(".feed-exemples-sep-invite"); if (!s) return null; s.scrollIntoView({ block: "center" }); const r = b ? b.getBoundingClientRect() : null; return { texte: s.innerText, bouton: b ? { t: b.innerText, w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(b).fontSize } : null }; });
    await page.waitForTimeout(400);
    await photo("j-separateur-fil");
    if (s && s.bouton) {
      await page.locator(".feed-exemples-sep-invite").first().click();
      await page.waitForTimeout(700);
      s.toasts = await page.evaluate(A.toastsVisibles);
      await photo("k-apres-separateur");
    }
    return s;
  });

  // ── Fiche d'une passion : une porte de partage ? ────────────────────────
  await A.etape(out, "passion", async () => {
    await page.waitForTimeout(3000);
    const tag = page.locator("#screen-feed .post .post-passion-tag").first();
    await page.evaluate(() => { const t = document.querySelector("#screen-feed .post .post-passion-tag"); if (t) t.scrollIntoView({ block: "center" }); });
    await tag.click();
    await page.waitForTimeout(1200);
    await photo("l-fiche-passion");
    return page.evaluate(() => { const c = document.getElementById("modalContent"); const ouverte = document.getElementById("modalBackdrop").classList.contains("active"); return { ouverte, titre: ouverte ? c.innerText.slice(0, 60) : null, portesPartage: ouverte ? Array.from(c.querySelectorAll("[onclick*='share'], [aria-label*='artager'], .share-ico")).length : null, premiersBoutons: ouverte ? Array.from(c.querySelectorAll("button")).slice(0, 6).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 30)) : null }; });
  });
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
