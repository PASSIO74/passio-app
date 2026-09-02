// Profil visité — les trois actions de modération vivent dans le menu ⋯
// (demande de Benjamin, 2026-09-02 : « déplace les 3 onglets partager /
// signaler / bloquer, ils sont trop visibles et prennent trop de place, mets
// plutôt trois petits points discrets en haut à droite du profil »).
//
// Ce que ces cas verrouillent, et pourquoi :
// ① la rangée de trois boutons a disparu de la surface du profil visité ;
// ② le ⋯ existe, il est SUR la couverture et ne recouvre pas la croix de
//    fermeture (deux boutons de 34 px dans le même coin, c'est le piège) ;
// ③ le menu s'ouvre AU-DESSUS de la modale — `.profile-dots-menu` était à
//    z-index 1200 pour 10001 côté `.modal-backdrop`, donc présent dans le DOM
//    et invisible. Un test d'existence seul serait resté vert sur ce défaut :
//    on mesure donc le point CENTRAL du menu avec elementFromPoint.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function ouvrirProfilVisite(page) {
  await page.evaluate(() => {
    window._supaReal = false;
    // `u_lea` est une utilisatrice du contenu de démonstration : le profil se
    // résout en local, sans requête serveur.
    openUserProfile("u_lea");
  });
  await expect(page.locator(".modal.modal-fullscreen")).toBeVisible();
}

test.describe("Profil visité — options dans le menu ⋯", () => {
  test("① aucune rangée Partager / Signaler / Bloquer sur la surface", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirProfilVisite(page);
    const modale = page.locator(".modal.modal-fullscreen");
    for (const mot of ["Partager", "Signaler", "Bloquer"]) {
      await expect(modale.locator(`button:visible:has-text("${mot}")`)).toHaveCount(0);
    }
  });

  test("② le ⋯ est sur la couverture et ne recouvre pas la croix", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirProfilVisite(page);
    const dots = page.locator(".modal.modal-fullscreen .profile-dots-btn.on-cover");
    await expect(dots).toBeVisible();
    const b = await dots.boundingBox();
    const cover = await page.locator(".modal.modal-fullscreen .main-profile-cover").boundingBox();
    expect(b).not.toBeNull();
    // ⚠️ IL Y A DEUX × : `openModal` en injecte un, et le balisage de la modale
    // porte déjà le sien. On les mesure donc TOUS — viser le premier venu
    // laisserait passer un recouvrement avec l'autre.
    const croix = await page.locator(".modal.modal-fullscreen .modal-close").all();
    expect(croix.length).toBeGreaterThan(0);
    for (const c of croix) {
      const r = await c.boundingBox();
      if (!r) continue;
      // Aucun recouvrement horizontal : le ⋯ est franchement à gauche du ×.
      expect(b.x + b.width).toBeLessThanOrEqual(r.x);
    }
    // Il est bien posé DANS la couverture, pas au-dessus ni en dessous.
    expect(b.y).toBeGreaterThanOrEqual(cover.y - 1);
    expect(b.y + b.height).toBeLessThanOrEqual(cover.y + cover.height + 1);
  });

  test("③ le menu s'ouvre AU-DESSUS de la modale, avec les trois entrées", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirProfilVisite(page);
    await page.locator(".modal.modal-fullscreen .profile-dots-btn.on-cover").click();
    const menu = page.locator("#profileDotsMenu");
    await expect(menu).toBeVisible();
    await expect(menu.locator('[role="menuitem"]')).toHaveCount(3);
    await expect(menu).toContainText("Partager le profil");
    await expect(menu).toContainText("Signaler");
    await expect(menu).toContainText("Bloquer");
    // Rien ne le recouvre : le point central du menu appartient bien au menu.
    const b = await menu.boundingBox();
    const dedans = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!(el && el.closest("#profileDotsMenu"));
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    expect(dedans).toBe(true);
  });

  test("④ « Signaler » depuis le menu ouvre bien le signalement", async ({ page }) => {
    await bootOnboarded(page);
    await ouvrirProfilVisite(page);
    await page.locator(".modal.modal-fullscreen .profile-dots-btn.on-cover").click();
    await page.locator('#profileDotsMenu [role="menuitem"]:has-text("Signaler")').click();
    // `reportUser` envoie le signalement puis ferme la modale et confirme par un
    // toast — c'est le comportement d'AVANT, inchangé : seule la surface bouge.
    await expect(page.locator("#toastStack .toast")).toContainText(/Signalement envoyé/i);
    // ⚠️ `closeModal` masque la fenêtre, il ne retire pas le nœud : on mesure
    // la VISIBILITÉ, pas la présence dans le DOM.
    await expect(page.locator(".modal.modal-fullscreen")).toBeHidden();
  });
});
