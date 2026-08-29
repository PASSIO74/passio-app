// ============================================================================
// « MES PASSIONS » DIT LA MÊME CHOSE SUR LE FIL ET SUR RENCONTRER (2026-08-29)
// ----------------------------------------------------------------------------
// Le lot UI-8 a introduit l'archivage d'une passion. `archiverPassion` nettoie
// le filtre du Fil (`_activeFeedPassions`) et les filtres du Profil, et
// `renderProfileStrip` ne rend plus que `passionsVivantes()`.
//
// Mais `_irlMyPassions()` (app-07) mappait `state.user.profiles` EN ENTIER.
// Mesuré avant correctif, juste après avoir archivé « Cuisine » :
//   Fil         → ["musique"]
//   Rencontrer  → ["musique", "cuisine"]
//
// Conséquences : la passion rangée gardait sa tuile marquée « ✦ une de tes
// passions », et l'intention « Passio » d'UI-4A1 — qui se sert de cette liste —
// filtrait dessus. Deux écrans en désaccord sur ce que veut dire « tes
// passions », juste après que l'utilisateur en a explicitement rangé une.
//
// ⚠️ Ce que ce fichier vérifie AUSSI, parce que c'est le piège du correctif :
// une passion archivée qui serait ENCORE dans `irlPassionFilters` doit rester
// affichée. `renderIrlPassionTiles` ajoute `[...irlPassionFilters]` aux tuiles
// montrées précisément pour qu'un filtre actif ne devienne jamais indécochable.
// Retirer la passion de « miennes » ne doit pas casser cette garantie.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function deuxPassionsPuisArchivage(page) {
  return page.evaluate(() => {
    state.user.profiles = [
      { id: "p_a", passion: "musique", name: "Ben", bio: "" },
      { id: "p_b", passion: "cuisine", name: "Ben", bio: "" },
    ];
    state.user.currentProfileId = "p_a";
    saveState();
    archiverPassion("p_b");
    goTo("irl");
    renderIRL();
  });
}

const etat = (page) => page.evaluate(() => {
  const row = document.getElementById("irlPassionRow");
  return {
    miennesIRL: _irlMyPassions(),
    vivantes: passionsVivantes().map((p) => p.passion),
    tuiles: row ? Array.from(row.querySelectorAll("[data-irlpassion]")).map((e) => e.getAttribute("data-irlpassion")) : [],
    marqueesMiennes: row ? Array.from(row.querySelectorAll("[data-irlpassion]"))
      .filter((e) => e.querySelector(".irl-tile-mine"))
      .map((e) => e.getAttribute("data-irlpassion")) : [],
  };
});

test.describe("une passion archivée, sur Rencontrer", () => {
  test("n'est plus comptée parmi « mes passions », comme sur le Fil", async ({ page }) => {
    await bootOnboarded(page);
    await deuxPassionsPuisArchivage(page);
    await page.waitForTimeout(600);
    const e = await etat(page);

    // Les deux écrans doivent dire la même chose.
    expect(e.miennesIRL).toEqual(e.vivantes);
    expect(e.miennesIRL).not.toContain("cuisine");
    // Garde anti-creux : la passion vivante, elle, doit bien y être.
    expect(e.miennesIRL).toContain("musique");
    // Et elle ne porte plus le marqueur « ✦ une de tes passions ».
    expect(e.marqueesMiennes).not.toContain("cuisine");
  });

  test("reste affichée et décochable si elle était ENCORE filtrée", async ({ page }) => {
    await bootOnboarded(page);
    await deuxPassionsPuisArchivage(page);
    // On repose explicitement le filtre sur la passion rangée : c'est l'état
    // qu'un utilisateur peut avoir laissé derrière lui avant d'archiver.
    await page.evaluate(() => {
      // `irlPassionFilters` est un `let` de portée script — absent de `window`.
      // `irlPassionFilterSet()` rend le Set VIVANT, c'est le seul point d'entrée.
      irlPassionFilterSet().add("cuisine");
      renderIRL();
    });
    await page.waitForTimeout(600);
    const e = await etat(page);

    // Elle n'est plus « mienne »…
    expect(e.miennesIRL).not.toContain("cuisine");
    // …mais sa tuile EXISTE, sinon le filtre serait indécochable.
    expect(e.tuiles).toContain("cuisine");
  });

  test("sous le kill switch UI-8, toutes les passions redeviennent « miennes »", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => localStorage.setItem("passio_ui_8", "0"));
    await page.evaluate(() => {
      state.user.profiles = [
        { id: "p_a", passion: "musique", name: "Ben", bio: "" },
        { id: "p_b", passion: "cuisine", name: "Ben", bio: "", archived: true },
      ];
      state.user.currentProfileId = "p_a";
      saveState();
      goTo("irl");
      renderIRL();
    });
    await page.waitForTimeout(600);
    const e = await etat(page);
    // L'archivage n'existe pas comme notion sous le kill switch : on rend tout,
    // exactement comme avant le lot UI-8.
    expect(e.miennesIRL).toContain("musique");
    expect(e.miennesIRL).toContain("cuisine");
  });
});
