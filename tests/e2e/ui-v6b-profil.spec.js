// Lot UI-6B — le Profil du §11.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① la tête suit le §11 : « Modifier » est visible et nommé, la statistique
//      « posts » a quitté le premier niveau sans que rien soit perdu ;
//   ② « Mes passions » : chaque identité porte « Actif » ou « Activer » ;
//   ③ LE contrôle central : « Activer » change RÉELLEMENT l'identité active
//      (`state.user.currentProfileId`) et le confirme visiblement — c'est le
//      chaînon qui manquait, `switchToProfile()` n'étant appelée par personne ;
//   ④ le contrôle de non-régression qui va avec : activer ne bascule PAS le
//      filtre de contenu de la carte (`toggleProfileSelect`), alors que la
//      carte entière le porte en `onclick` ;
//   ⑤ les boutons SURVIVENT au rendu que leur propre clic déclenche ;
//   ⑥ les deux kill switches rendent le profil historique ;
//   ⑦ mobile 320 / 390 / 430 px : aucun débordement, cibles ≥ 44 px.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_6b", "0"));
  }
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = () => {};
  });
}

// Deux identités : l'onboarding n'en crée qu'une, et « Activer » n'a de sens
// qu'à partir de deux. On écrit dans l'état, jamais dans le DOM.
async function poserDeuxProfils(page) {
  await page.evaluate(() => {
    const p0 = state.user.profiles[0];
    state.user.profiles = [
      p0,
      { id: "v6b_p2", passion: "photo", name: "Photo", emoji: "📷", color: "#8b5cf6", bio: "" },
    ];
    state.user.currentProfileId = p0.id;
    saveState();
  });
}

async function ouvrirProfil(page) {
  await page.evaluate(() => goTo("profiles"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-profiles");
    return el && el.classList.contains("active");
  });
  await page.evaluate(() => renderProfilesScreen());
  await page.waitForTimeout(250);
  // §6 du lot UI-7 : les identités vivent désormais dans l'onglet « À propos ».
  // La fonctionnalité n'a pas bougé, sa PORTE si — on l'ouvre, plutôt que de
  // retirer des assertions. Le `count()` garde ce test valide même sous kill
  // switch du lot, où la barre d'onglets n'existe pas.
  const ongletApropos = page.locator('[data-v7-tab="apropos"]');
  if (await ongletApropos.count()) {
    await ongletApropos.click();
    await page.waitForTimeout(150);
  }
}

test.describe("UI-6B — Profil et multi-profils", () => {
  test("URL normale : « Modifier » visible, « posts » hors du premier niveau", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    await expect(page.locator("#v6bModifier")).toBeVisible();
    await expect(page.locator("#v6bModifier")).toHaveText("Modifier");

    // Masquée, JAMAIS retirée : les onglets de contenu ouvrent la même chose.
    const posts = page.locator("#screen-profiles .main-profile-stat").first();
    await expect(posts).toHaveCount(1);
    await expect(posts).toBeHidden();
    await expect(page.locator("#screen-profiles .main-profile-stat").nth(1)).toBeVisible();
    expect(await page.evaluate(() => typeof openMyPostsTab === "function")).toBe(true);

    // Le titre du §11.
    await expect(page.locator("#nouveauProfilLien")).toHaveText("+ Ajouter une passion");
    expect(await page.evaluate(() =>
      document.getElementById("nouveauProfilLien").parentNode.textContent)).toContain("Mes passions");

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("« Mes passions » : une identité Actif, l'autre Activer", async ({ page }) => {
    await boot(page);
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    await expect(page.locator("#profileList .profile-card")).toHaveCount(2);
    await expect(page.locator("#profileList .v6b-actif")).toHaveCount(1);
    await expect(page.locator("#profileList .v6b-activer")).toHaveCount(1);
    await expect(page.locator('[data-v6b-activer="v6b_p2"]')).toBeVisible();
  });

  test("LE contrôle : « Activer » change l'identité active, et le confirme", async ({ page }) => {
    await boot(page);
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    const avant = await page.evaluate(() => state.user.currentProfileId);
    expect(avant).not.toBe("v6b_p2");

    await page.locator('[data-v6b-activer="v6b_p2"]').click();
    await page.waitForFunction(() => state.user.currentProfileId === "v6b_p2", null, { timeout: 5000 });

    // « visiblement confirmée » (§11) : le changement d'identité n'est jamais muet.
    await expect(page.locator(".toast").last()).toBeVisible();

    // Et le rendu suit : les rôles se sont échangés.
    await page.waitForTimeout(300);
    await expect(page.locator('[data-v6b-activer="v6b_p2"]')).toHaveCount(0);
    await expect(page.locator("#profileList .v6b-actif")).toHaveCount(1);
    await expect(page.locator("#profileList .v6b-activer")).toHaveCount(1);
  });

  test("activer ne bascule PAS le filtre de contenu de la carte", async ({ page }) => {
    await boot(page);
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    const avant = await page.evaluate(() => [...(window.profilesFilterSelection || [])]);
    await page.locator('[data-v6b-activer="v6b_p2"]').click();
    await page.waitForFunction(() => state.user.currentProfileId === "v6b_p2", null, { timeout: 5000 });
    const apres = await page.evaluate(() => [...(window.profilesFilterSelection || [])]);
    expect(apres, "le clic ne doit pas se propager à toggleProfileSelect").toEqual(avant);
  });

  test("les boutons survivent au rendu déclenché par leur propre clic", async ({ page }) => {
    await boot(page);
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    // `switchToProfile` rappelle `renderProfilesScreen`, qui réécrit
    // #profileList EN ENTIER : un bouton posé une seule fois disparaîtrait.
    await page.locator('[data-v6b-activer="v6b_p2"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator("#profileList .v6b-ident")).toHaveCount(2);

    // Et un rendu provoqué par autre chose ne les perd pas non plus.
    await page.evaluate(() => renderProfilesScreen());
    await page.waitForTimeout(300);
    await expect(page.locator("#profileList .v6b-ident")).toHaveCount(2);
  });

  test("kill switch local au boot : profil historique strictement rendu", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { killLocal: true, errors });
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    expect(await page.evaluate(() =>
      document.documentElement.classList.contains("passio-ui-6b"))).toBe(false);
    await expect(page.locator("#v6bModifier")).toHaveCount(0);
    await expect(page.locator(".v6b-ident")).toHaveCount(0);
    await expect(page.locator("#screen-profiles .main-profile-stat").first()).toBeVisible();
    await expect(page.locator("#nouveauProfilLien")).toHaveText("+ Nouveau");

    expect(errors.js, "exceptions JS avec le kill switch").toEqual([]);
  });

  test("kill switch mémoire : tout est retiré, le titre reprend ses mots", async ({ page }) => {
    await boot(page);
    await poserDeuxProfils(page);
    await ouvrirProfil(page);
    await expect(page.locator("#v6bModifier")).toHaveCount(1);

    await page.evaluate(() => { window.PASSIO_UI_6B = false; window.PassioUIV6B.apply(); });
    await page.waitForTimeout(250);

    await expect(page.locator("#v6bModifier")).toHaveCount(0);
    await expect(page.locator(".v6b-ident")).toHaveCount(0);
    await expect(page.locator("#nouveauProfilLien")).toHaveText("+ Nouveau");
    expect(await page.evaluate(() =>
      document.getElementById("nouveauProfilLien").parentNode.textContent)).toContain("Mes profils passion");
    await expect(page.locator("#screen-profiles .main-profile-stat").first()).toBeVisible();
  });

  for (const largeur of [320, 390, 430]) {
    test("mobile " + largeur + " px : aucun débordement, cibles ≥ 44 px", async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 844 });
      await boot(page);
      await poserDeuxProfils(page);
      await ouvrirProfil(page);

      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const cibles = [document.getElementById("v6bModifier")]
          .concat(Array.from(document.querySelectorAll(".v6b-activer")))
          .filter(Boolean);
        const carte = document.querySelector("#profileList .profile-card");
        return {
          deborde: doc.scrollWidth > doc.clientWidth + 1,
          carteDansLeCadre: carte.getBoundingClientRect().right <= doc.clientWidth + 1,
          minHauteur: Math.min.apply(null, cibles.map((c) => c.getBoundingClientRect().height)),
        };
      });
      expect(m.deborde, "la page déborde horizontalement").toBe(false);
      expect(m.carteDansLeCadre, "la carte de profil sort du cadre").toBe(true);
      expect(m.minHauteur, "cible tactile").toBeGreaterThanOrEqual(44);
    });
  }
});
