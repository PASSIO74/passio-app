// Sonde — partage d'un PROFIL (menu ⋯ du profil visité) et « Inviter des amis »
// (menu ⋯ de mon profil, Paramètres → Support, séparateur « Exemples » du fil),
// plus la fiche d'une passion (porte de partage : présente ou non ?).
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/partage");

const toastVisible = () => Array.from(document.querySelectorAll("#toastStack .toast")).map((t) => { const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { txt: t.innerText, visible: top === t || t.contains(top), auDessus: top ? (top.id || String(top.className).slice(0, 40) || top.tagName) : null, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; });

module.exports = async ({ page, photo, context }) => {
  const out = {};
  // ── Profil visité : toucher l'auteur d'une carte du fil ──────────────────
  const carte = page.locator('#screen-feed .post[data-postid="pa_lea_1"]').first();
  await carte.scrollIntoViewIfNeeded();
  await carte.locator(".post-author").first().click();
  await page.waitForTimeout(2500);
  await photo("a-profil-visite");
  out.profil = await page.evaluate(() => {
    const c = document.getElementById("modalContent");
    const b = c.querySelector("[onclick*='openVisitedProfileMenu']");
    const r = b ? b.getBoundingClientRect() : null;
    return { titre: (c.querySelector("h1,h2,h3,.v7-nom,.modal-title") || {}).innerText, hash: location.hash, menu: b ? { html: b.outerHTML.slice(0, 220), w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label") } : null, partageDirect: !!c.querySelector("[onclick*='shareUserProfile']") };
  });
  await page.locator("#modalContent [onclick*='openVisitedProfileMenu']").first().click();
  await page.waitForTimeout(400);
  out.menu = await page.evaluate(() => { const m = document.querySelector(".profile-dots-menu"); return m ? { items: Array.from(m.querySelectorAll("button")).map((b) => ({ t: b.innerText, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })), role: m.getAttribute("role") } : null; });
  await photo("b-menu-profil-visite");
  // Presse-papiers refusé.
  await page.locator(".profile-dots-menu button", { hasText: "Partager le profil" }).click();
  await page.waitForTimeout(600);
  out.partageRefuse = await page.evaluate(toastVisible);
  await photo("c-partage-profil-refuse");
  await page.waitForTimeout(3200);
  // Presse-papiers accordé.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#modalContent [onclick*='openVisitedProfileMenu']").first().click();
  await page.waitForTimeout(300);
  await page.locator(".profile-dots-menu button", { hasText: "Partager le profil" }).click();
  await page.waitForTimeout(600);
  out.partageCopie = await page.evaluate(toastVisible);
  out.presseProfil = await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message));
  await photo("d-partage-profil-copie");
  // Feuille native simulée.
  await page.evaluate(() => { window.__partages = []; navigator.share = (d) => { window.__partages.push(d); return Promise.resolve(); }; });
  await page.locator("#modalContent [onclick*='openVisitedProfileMenu']").first().click();
  await page.waitForTimeout(300);
  await page.locator(".profile-dots-menu button", { hasText: "Partager le profil" }).click();
  await page.waitForTimeout(400);
  out.natifProfil = await page.evaluate(() => window.__partages.slice());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3300);

  // ── Mon profil : menu ⋯ → Inviter des amis ───────────────────────────────
  await page.evaluate(() => goTo("profiles"));
  await page.waitForTimeout(1500);
  out.monProfil = await page.evaluate(() => { const b = document.querySelector("#screen-profiles [onclick*='openMainProfileMenu']"); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label"), partageMonProfil: !!document.querySelector("#screen-profiles [onclick*='shareUserProfile']") }; });
  await page.locator("#screen-profiles [onclick*='openMainProfileMenu']").first().click();
  await page.waitForTimeout(400);
  out.menuMoi = await page.evaluate(() => Array.from(document.querySelectorAll(".profile-dots-menu button")).map((b) => b.innerText));
  await photo("e-menu-mon-profil");
  await page.evaluate(() => { window.__partages = []; });
  await page.locator(".profile-dots-menu button", { hasText: "Inviter des amis" }).click();
  await page.waitForTimeout(400);
  out.inviterProfilNatif = await page.evaluate(() => window.__partages.slice());
  // Sans feuille native : copie.
  await page.evaluate(() => { delete navigator.share; });
  out.shareType = await page.evaluate(() => typeof navigator.share);
  await page.locator("#screen-profiles [onclick*='openMainProfileMenu']").first().click();
  await page.waitForTimeout(300);
  await page.locator(".profile-dots-menu button", { hasText: "Inviter des amis" }).click();
  await page.waitForTimeout(600);
  out.inviterProfilCopie = await page.evaluate(toastVisible);
  out.presseInvite = await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message));
  await photo("f-inviter-copie");
  await page.waitForTimeout(3200);

  // ── Paramètres → Support ────────────────────────────────────────────────
  out.support = await page.evaluate(() => { const b = document.querySelector("[onclick*='shareBeta()']"); if (!b) return null; const p = document.getElementById("devPanel"); return { texte: b.innerText, panneauOuvert: p && p.classList.contains("active") }; });
  const ouvreur = page.locator(".topbar [onclick*='toggleDevPanel'], [onclick*='toggleDevPanel']").first();
  out.ouvreur = await ouvreur.count();
  await page.evaluate(() => toggleDevPanel());
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector("[onclick*='shareBeta()']"); if (b) b.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(300);
  await photo("g-parametres-support");
  out.supportBouton = await page.evaluate(() => { const b = document.querySelector("[onclick*='shareBeta()']"); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), voisins: Array.from(b.parentElement.children).map((c) => c.innerText.trim()).slice(0, 6), titreSection: (b.closest("section, .dev-section, div") || {}).previousElementSibling ? b.closest("div").previousElementSibling.innerText : null }; });
  await page.locator("[onclick*='shareBeta()']").first().click();
  await page.waitForTimeout(600);
  out.supportApres = await page.evaluate(toastVisible);
  out.presseSupport = await page.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e.message));
  await photo("h-apres-support");
  await page.waitForTimeout(3200);

  // ── Séparateur « Exemples PASSIO » du fil ───────────────────────────────
  await page.evaluate(() => goTo("feed"));
  await page.waitForTimeout(900);
  out.sep = await page.evaluate(() => { const s = document.querySelector(".feed-exemples-sep"); const b = document.querySelector(".feed-exemples-sep-invite"); if (!s) return null; const r = b ? b.getBoundingClientRect() : null; return { texte: s.innerText, bouton: b ? { t: b.innerText, w: Math.round(r.width), h: Math.round(r.height) } : null }; });
  if (out.sep) { await page.evaluate(() => document.querySelector(".feed-exemples-sep").scrollIntoView({ block: "center" })); await page.waitForTimeout(400); await photo("i-separateur-fil"); }
  if (out.sep && out.sep.bouton) {
    await page.locator(".feed-exemples-sep-invite").first().click();
    await page.waitForTimeout(600);
    out.sepApres = await page.evaluate(toastVisible);
    await photo("j-apres-separateur");
  }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
