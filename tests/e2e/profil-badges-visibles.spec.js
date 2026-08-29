// ============================================================================
// UN BADGE GAGNÉ EST VISIBLE (2026-08-29)
// ----------------------------------------------------------------------------
// Le lot UI-6 (§11) posait `:root.passio-ui-6 .profile-chips-row { display:none }`
// pour masquer les pastilles de score, de rang et de solde. L'ADR-009 (#195) a
// ensuite retiré ce moteur EN ENTIER — il n'y avait donc plus rien à masquer,
// mais la règle est restée.
//
// Or la rangée ne porte plus qu'une chose : la pastille de BADGES d'assiduité,
// jalons concrets (sorties, villes, pays) que l'ADR-009 garde expressément — le
// commentaire d'`index.html` le dit noir sur blanc. UI-6 étant actif par défaut,
// la règle rendait ces badges inatteignables.
//
// Mesuré avant correctif, avec un badge RÉELLEMENT gagné (« Organisateur ») :
//   badges gagnés            → 1
//   pastille, display propre → "inline-flex"   (le moteur faisait son travail)
//   RANGÉE, display calculé  → "none"          (UI-6 la masquait)
//   hauteur visible          → 0
//
// Et `openBadgesSheet()` n'a AUCUN autre appelant : la fonctionnalité était
// calculée à chaque rendu, et morte à l'écran.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// « Organisateur » : créer un événement. `myEngagementStats` compte par
// `organizerId`/`authorId`, jamais par `ownerId` — une sonde écrite avec
// `ownerId` rendait 0 badge et aurait fait croire le défaut inexistant.
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

const mesure = (page) => page.evaluate(() => {
  const chip = document.getElementById("mainProfileBadges");
  const row = chip ? chip.closest(".profile-chips-row") : null;
  return {
    badges: myBadgeCount(),
    chipDisplay: chip ? getComputedStyle(chip).display : "?",
    rangeeDisplay: row ? getComputedStyle(row).display : "?",
    hauteur: chip ? Math.round(chip.getBoundingClientRect().height) : -1,
  };
});

test.describe("la pastille de badges du profil", () => {
  test("est visible quand un badge est gagné", async ({ page }) => {
    await bootOnboarded(page);
    await gagnerUnBadge(page);
    const m = await mesure(page);

    // Garde anti-creux : sans elle, ce test passerait aussi si le moteur de
    // badges avait cessé d'en attribuer.
    expect(m.badges).toBeGreaterThan(0);
    expect(m.rangeeDisplay).not.toBe("none");
    expect(m.chipDisplay).not.toBe("none");
    expect(m.hauteur).toBeGreaterThan(0);
  });

  test("reste invisible pour un compte qui n'en a aucun", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      state.userEvents = [];
      state.user.joinedEvents = [];
      state.user.checkedInEvents = [];
      saveState();
      goTo("profiles");
      renderMainProfile();
    });
    await page.waitForTimeout(400);
    const m = await mesure(page);

    expect(m.badges).toBe(0);
    // La pastille garde son propre `display:none` en ligne : un compte neuf ne
    // voit pas une pastille « 0 », qui ne raconterait rien.
    expect(m.hauteur).toBe(0);
  });

  test("sous le kill switch UI-6, le comportement est le même", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => localStorage.setItem("passio_ui_6", "0"));
    await gagnerUnBadge(page);
    const m = await mesure(page);
    expect(m.badges).toBeGreaterThan(0);
    expect(m.hauteur).toBeGreaterThan(0);
  });
});
