// Lot UI-6B — le Profil du §11.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① la tête suit le §11 : le point d'édition est un CRAYON discret au coin
//      haut droit de la couverture (ordre du 2026-08-29) — il ouvre le même
//      `openMainProfileMenu`, remplace le « ⋯ » qui occupait ce coin, et la
//      statistique « posts » a quitté le premier niveau sans que rien soit
//      perdu ;
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
//
// ⚠️ CONVENTION DE TEST (la même qu'à la mise en ligne d'UI-3A et d'UI-4) : le
// lot UI-8 RECOUVRE la carte de passion — sous UI-8 c'est `renderProfilesScreen`
// qui rend l'état de la carte (« Passion active ✓ » / « Utiliser pour créer »),
// et UI-6B lui rend la main (deux modules n'écrivent jamais la même surface).
// Cette suite observe le comportement HISTORIQUE : elle pose donc le kill switch
// du lot qui le recouvre, et garde TOUTES ses assertions. La cohabitation des
// deux est prouvée à part, dans `ui-v8-passions.spec.js`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, opts = {}) {
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_6b", "0"));
  }
  await page.addInitScript(() => localStorage.setItem("passio_ui_8", "0"));
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
  // ⚠️ LA PORTE CHANGE, LES ASSERTIONS NON — pour la deuxième fois. Le lot UI-7
  // avait déplacé les cartes de passion dans l'onglet « À propos » ; la refonte
  // multi-passion (ADR-011 §2) retire cet onglet et range ces cartes dans le
  // panneau `#passionManager`, ouvert à la demande. On ouvre ce panneau plutôt
  // que de retirer des attentes. `openPassionManager` existe quel que soit
  // l'état du drapeau UI-8, donc ce chemin vaut aussi sous kill switch.
  await page.evaluate(() => {
    if (typeof openPassionManager === "function") openPassionManager();
  });
  await page.waitForTimeout(250);
}

test.describe("UI-6B — Profil et multi-profils", () => {
  test("URL normale : le crayon au coin haut droit, « posts » hors du premier niveau", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    const crayon = page.locator("#v6bModifier");
    await expect(crayon).toBeVisible();
    // « un petit onglet très discret (crayon) » : une icône, aucun libellé.
    await expect(crayon).toHaveText("");
    await expect(crayon.locator("svg")).toHaveCount(1);
    await expect(crayon).toHaveAttribute("aria-label", "Modifier le profil");

    // Le coin HAUT DROIT de la couverture, et pas ailleurs.
    const pose = await page.evaluate(() => {
      const b = document.getElementById("v6bModifier");
      const cov = document.getElementById("mainProfileCover");
      const rb = b.getBoundingClientRect(), rc = cov.getBoundingClientRect();
      return {
        dansLaCouverture: cov.contains(b),
        droite: rc.right - rb.right,
        haut: rb.top - rc.top,
        largeur: rb.width,
        hauteur: rb.height,
      };
    });
    expect(pose.dansLaCouverture).toBe(true);
    expect(pose.droite).toBeLessThanOrEqual(8);
    expect(pose.haut).toBeLessThanOrEqual(8);
    // Discret à l'œil (rond de 30 px peint par ::before), mais la cible
    // tactile reste entière : c'est la BOÎTE qui est mesurée.
    expect(pose.largeur).toBeGreaterThanOrEqual(44);
    expect(pose.hauteur).toBeGreaterThanOrEqual(44);

    // Le « ⋯ » occupait ce coin et ouvrait le MÊME menu : masqué, jamais
    // retiré du DOM — le kill switch doit pouvoir le rendre.
    const dots = page.locator("#screen-profiles .profile-dots-btn.on-cover");
    await expect(dots).toHaveCount(1);
    await expect(dots).toBeHidden();

    // Masquée, JAMAIS retirée : les onglets de contenu ouvrent la même chose.
    const posts = page.locator("#screen-profiles .main-profile-stat").first();
    await expect(posts).toHaveCount(1);
    await expect(posts).toBeHidden();
    await expect(page.locator("#screen-profiles .main-profile-stat").nth(1)).toBeVisible();
    expect(await page.evaluate(() => typeof openMyPostsTab === "function")).toBe(true);

    // Le titre du §11. ⚠️ Le renommage que faisait UI-6B a été RETIRÉ le
    // 2026-09-03 : le markup dit « Gérer mes passions » de lui-même, et
    // `#nouveauProfilLien` est devenu la BULLE « + » descendue du rail. Une
    // réécriture par `textContent` aurait détruit ses deux enfants ; ce cas
    // vérifie donc le résultat À L'ÉCRAN, qui est ce qu'il a toujours voulu dire.
    await expect(page.locator("#nouveauProfilLien")).toHaveAttribute("aria-label", "Ajouter une passion");
    await expect(page.locator("#nouveauProfilLien .profile-tile-label")).toHaveText("Ajouter");
    expect(await page.evaluate(() =>
      document.getElementById("passionManagerTitre").textContent)).toContain("Gérer mes passions");

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("le crayon ouvre le même menu d'édition (rien n'est perdu)", async ({ page }) => {
    await boot(page);
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    await page.locator("#v6bModifier").click();
    const menu = page.locator(".profile-dots-menu");
    await expect(menu).toBeVisible();
    // Les quatre entrées historiques d'`openMainProfileMenu`.
    await expect(menu).toContainText("Modifier le profil");
    await expect(menu).toContainText("Photo de profil");
    await expect(menu).toContainText("Photo de couverture");
    await expect(menu).toContainText("Apparence");
  });

  // ⚠️ RETRAIT DES EMOJIS DÉCORATIFS DU MENU ⋯ (Benjamin, 2026-09-03) : « garde
  // seulement les textes ». Le verrou mesure les DEUX moitiés du défaut
  // possible, parce qu'elles se rattrapent l'une l'autre :
  //   ① plus aucun caractère hors du latin/ponctuation dans les libellés — un
  //      `icon: "✏️"` réintroduit tomberait ici ;
  //   ② plus aucun `<span class="profile-dots-ico">` — car `_profileDotsOpen`
  //      rendait la colonne d'icônes MÊME VIDE : 20 px de largeur plus les
  //      10 px de `gap` de `.profile-dots-item`, et les entrées restaient
  //      décalées de 30 px derrière du blanc. Le seul contrôle ① serait resté
  //      vert sur cette moitié-là.
  test("le menu ⋯ ne porte plus d'emoji : le texte seul, sans colonne d'icônes", async ({ page }) => {
    await boot(page);
    await poserDeuxProfils(page);
    await ouvrirProfil(page);

    await page.locator("#v6bModifier").click();
    await expect(page.locator(".profile-dots-menu")).toBeVisible();

    const vu = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("#profileDotsMenu .profile-dots-item"));
      return {
        nb: items.length,
        icones: document.querySelectorAll("#profileDotsMenu .profile-dots-ico").length,
        // Ce qui n'est ni lettre latine, ni chiffre, ni ponctuation courante.
        exotiques: items
          .map((b) => (b.textContent || "").replace(/[\p{Script=Latin}\p{Nd}\s'’«».,:;!?()\[\]&+\-—–…/]/gu, ""))
          .filter((reste) => reste.length > 0),
      };
    });

    expect(vu.nb, "les cinq entrées sont toujours là").toBe(5);
    expect(vu.exotiques, "aucun emoji dans les libellés du menu").toEqual([]);
    expect(vu.icones, "et aucune colonne d'icônes, même vide").toBe(0);
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
    // ⚠️ LE VOCABULAIRE N'EST SOUS AUCUN KILL SWITCH, et c'est ce que ce cas
    // vérifie : coupé, UI-6B ne doit PAS restituer un « + Ajouter » ni un titre
    // « Mes passions ». Le markup d'origine porte désormais « Gérer mes
    // passions » et la bulle, et il les garde drapeau éteint.
    await expect(page.locator("#nouveauProfilLien .profile-tile-label")).toHaveText("Ajouter");
    expect(await page.evaluate(() =>
      document.getElementById("passionManagerTitre").textContent)).toContain("Gérer mes passions");
    // Le point d'édition historique reprend sa place.
    await expect(page.locator("#screen-profiles .profile-dots-btn.on-cover")).toBeVisible();

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
    await expect(page.locator("#screen-profiles .profile-dots-btn.on-cover")).toBeVisible();
    // ⚠️ MÊME EXIGENCE QUE CI-DESSUS, PAR LA COUPURE MÉMOIRE. `toutRendre()` ne
    // restitue plus aucun mot du panneau depuis le 2026-09-03 : restituer
    // « Mes passions » aurait écrasé le titre du markup, et « + Ajouter » aurait
    // remplacé la bulle par un mot nu.
    await expect(page.locator("#nouveauProfilLien .profile-tile-label")).toHaveText("Ajouter");
    expect(await page.evaluate(() =>
      document.getElementById("passionManagerTitre").textContent)).toContain("Gérer mes passions");
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
