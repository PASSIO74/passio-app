// ═══════════════════════════════════════════════════════════════════════════
// LOT-16 (audit UX/UI du 2026-11-10) — LE PROFIL
//   ① PRO-C04 : un seul filtre de format à la fois, « Tout » neutre (deux profils).
//   ② PRO-C07 / C08 / C09 / C17 : profil visité — « publications », une seule
//      croix, actions de 44 px, « ✓ Suivi » moins fort que Message, bandeau
//      « Tu as bloqué ce compte ».
//   ③ PRO-C10 : ouvert depuis une liste, le profil y ramène.
//   ④ PRO-C22 : une fenêtre qui remplace le profil n'hérite pas de son plein écran.
//   ⑤ PRO-C11 / C12 / C14 / C15 : textes justes, réseaux remplis seulement.
//   ⑥ PRO-C18 / C19 / C21 : fichier non image refusé à voix haute ; « Déjà
//      ajoutée » ; pastille de compte dans la vignette.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① PRO-C04 : un seul filtre de format à la fois, « Tout » neutre", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    goTo("profiles");
    switchProfileTab("posts");
    switchProfileTab("photos");
    const apresPhotos = [...profileTabSelection];
    switchProfileTab("photos");
    const apresRetouche = [...profileTabSelection];
    window._visited = { authorId: "u_lea", posts: [], passionSel: new Set(), tabSel: new Set(), locked: false };
    switchVisitedTab("photos"); switchVisitedTab("videos");
    const visite = [...window._visited.tabSel];
    switchVisitedTab("posts");
    return { apresPhotos, apresRetouche, visite, visiteTout: [...window._visited.tabSel] };
  });
  expect(r.apresPhotos, "« Photos » remplace « Tout »").toEqual(["photos"]);
  expect(r.apresRetouche, "retoucher l'actif rend « Tout »").toEqual(["posts"]);
  expect(r.visite).toEqual(["videos"]);
  expect(r.visiteTout).toEqual([]);
});

test("② PRO-C07 / C08 / C09 / C17 : le profil visité", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { state.user.following = ["u_lea"]; return openUserProfile("u_lea"); });
  await page.waitForTimeout(500);
  const m = page.locator("#modalContent");
  expect(await m.locator(".modal-close").count(), "une seule croix").toBe(1);
  await expect(m.locator(".main-profile-stat span").nth(1)).toHaveText(/^publications?$/);
  const msg = m.locator("#visitedProfileActions .btn.primary");
  expect((await msg.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const suivi = await page.evaluate(() => getComputedStyle(document.getElementById("followBtn_u_lea")).backgroundColor);
  expect(suivi, "« ✓ Suivi » n'est plus un bouton plein").not.toBe("rgb(124, 58, 237)");

  await page.evaluate(() => { closeModal(); state.user.blocked = ["u_lea"]; return openUserProfile("u_lea"); });
  await page.waitForTimeout(500);
  await expect(m.locator(".profil-bloque")).toContainText("Tu as bloqué ce compte");
  await expect(m.locator(".profil-bloque button")).toHaveText("Débloquer");
  await expect(m.locator("#visitedProfileActionsMasquees")).toBeHidden();
});

test("③ PRO-C10 : un profil ouvert depuis « Abonnements » y ramène", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => { state.user.following = ["u_lea"]; openFollowingList(); });
  const ligne = page.locator("#modalContent .personne-ligne").first();
  await expect(ligne).toHaveAttribute("role", "button");
  expect(await page.locator("#modalContent .modal-close").count(), "une seule croix sur la liste").toBe(1);
  await ligne.click();
  const retour = page.locator("#modalContent .profil-retour-liste");
  await expect(retour).toHaveText("← Abonnements");
  await retour.click();
  await expect(page.locator("#modalContent .modal-title")).toHaveText("Abonnements");
});

test("④ PRO-C22 : « Signaler » n'hérite pas du plein écran du profil", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => openUserProfile("u_lea"));
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const avant = document.querySelector(".modal").classList.contains("modal-fullscreen");
    openModal('<div class="modal-title">Signaler ce compte</div>');
    return { avant, apres: document.querySelector(".modal").classList.contains("modal-fullscreen") };
  });
  expect(r).toEqual({ avant: true, apres: false });
});

test("⑤ PRO-C11 / C14 / C15 : textes justes, réseaux remplis seulement", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    goTo("profiles");
    state.user.general = state.user.general || {};
    state.user.general.rsLinks = [{ platform: "tiktok", url: "https://www.tiktok.com/@x" }];
    openEditMainProfile();
    const m = document.getElementById("modalContent");
    const visibles = [...m.querySelectorAll(".rs-ligne")].filter((l) => !l.hidden).map((l) => l.querySelector("input").getAttribute("aria-label"));
    const out = { titre: m.querySelector(".modal-title").textContent, visibles, ajouter: !!m.querySelector(".rs-ajouter") };
    m.querySelector(".rs-ajouter").click();
    out.apresAjout = [...m.querySelectorAll(".rs-ligne")].filter((l) => !l.hidden).length;
    return out;
  });
  expect(r.titre).toBe("Modifier mon profil");
  expect(r.visibles).toEqual(["TikTok"]);
  expect(r.ajouter).toBe(true);
  expect(r.apresAjout).toBe(8);
});

test("⑥ PRO-C18 / C21 : un fichier non image le dit ; la pastille de compte est dans la vignette", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const toasts = [];
    const t0 = window.toast;
    window.toast = (m) => { toasts.push(m); };
    let refus = null;
    try { await _readAndCrop(new File(["x"], "clip.mp4", { type: "video/mp4" }), { aspect: 1 }); } catch (e) { refus = e.message; }
    window.toast = t0;
    const span = document.createElement("span");
    span.className = "profile-tile-count";
    span.style.cssText = "position:absolute;top:-5px;right:-5px;";
    document.body.appendChild(span);
    const cs = getComputedStyle(span);
    const pos = { top: cs.top, right: cs.right };
    span.remove();
    return { toasts, refus, pos };
  });
  expect(r.refus).toBe("pas une image");
  expect(r.toasts.join(" ")).toContain("Ce fichier n'est pas une image");
  expect(r.pos).toEqual({ top: "1px", right: "1px" });
});
