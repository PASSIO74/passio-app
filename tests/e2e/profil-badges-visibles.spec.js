// ============================================================================
// PLUS AUCUNE PASTILLE DE POINTS SUR LE PROFIL (2026-08-31)
// ----------------------------------------------------------------------------
// HISTOIRE. Le lot UI-6 (§11) masquait `.profile-chips-row` pour cacher les
// pastilles de score, de rang et de solde Passia. L'ADR-009 a retiré ce moteur
// EN ENTIER, mais la règle CSS est restée — et la rangée ne portait plus qu'une
// chose, la pastille de BADGES d'assiduité, devenue invisible en silence. Ce
// fichier avait alors été écrit pour prouver qu'un badge gagné se voyait.
//
// AUJOURD'HUI. Benjamin a demandé le retrait de cette dernière pastille : « sur
// le profil supprime la petite médaille avec le point, l'app générale n'a plus
// du tout le système de points. » La rangée entière part avec elle, ainsi que
// `openBadgesSheet()`, dont c'était l'unique appelant.
//
// Ce test change donc de sens, mais pas de fichier : il défend le RETRAIT, là où
// il défendait la visibilité. Le moteur de badges, lui, continue de tourner
// (`myBadgeCount`, `_announceNewBadges`) — un jalon reste fêté par un toast,
// il n'est simplement plus exposé comme un compteur.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// « Organisateur » : créer un événement. `myEngagementStats` compte par
// `organizerId`/`authorId`, jamais par `ownerId` — une sonde écrite avec
// `ownerId` rendrait 0 badge et ferait passer ce test sans rien prouver.
async function gagnerUnBadge(page) {
  await page.evaluate(() => {
    state.userEvents = [{
      id: "ev_badge", title: "Atelier test", passion: "cuisine",
      date: Date.now() + 86400000, time: "18:00", city: "Lyon", attendees: [],
      organizerId: (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me", desc: "",
    }];
    saveState();
    goTo("profiles");
    renderMainProfile();
  });
  await page.waitForTimeout(400);
}

test.describe("plus de pastille de points sur le profil", () => {
  test("même avec un badge gagné, aucune médaille ni rangée de pastilles", async ({ page }) => {
    await bootOnboarded(page);
    await gagnerUnBadge(page);

    // Garde anti-creux : sans elle, ce test passerait aussi si le moteur de
    // badges était cassé — on prouverait alors une absence pour une mauvaise
    // raison. Le badge EST gagné ; c'est son affichage qui a été retiré.
    expect(await page.evaluate(() => myBadgeCount()),
      "prémisse : un badge est bien acquis").toBeGreaterThan(0);

    await expect(page.locator("#mainProfileBadges")).toHaveCount(0);
    await expect(page.locator("#profileBadgeCount")).toHaveCount(0);
    await expect(page.locator(".profile-chips-row")).toHaveCount(0);
    // Le profil ne doit plus afficher de compteur en médaille.
    expect(await page.locator("#mainProfileCard").innerText()).not.toContain("🏅");
  });

  test("la visionneuse de badges n'a plus de porte d'entrée — ni fonction orpheline", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => goTo("profiles"));
    await page.waitForTimeout(400);

    // `openBadgesSheet` est retirée : une fonction sans appelant est du code
    // mort, et ce projet en paie le prix cher.
    expect(await page.evaluate(() => typeof window.openBadgesSheet)).toBe("undefined");
    expect(await page.evaluate(() =>
      [...document.querySelectorAll("[onclick]")]
        .filter((n) => (n.getAttribute("onclick") || "").includes("openBadgesSheet")).length)).toBe(0);
  });

  test("aucune exception de rendu après le retrait", async ({ page }) => {
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await bootOnboarded(page);
    await gagnerUnBadge(page);
    // `renderMainProfile` est rappelée à chaque publication : un
    // `getElementById` laissé sur un nœud supprimé la ferait lever à chaque fois
    // (le piège du `renderTopbar` d'ADR-009).
    await page.evaluate(() => { renderMainProfile(); renderMainProfile(); });
    await page.waitForTimeout(300);
    expect(erreurs).toEqual([]);
  });
});
