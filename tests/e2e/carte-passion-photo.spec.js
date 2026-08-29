// ============================================================================
// LA PASTILLE PHOTO D'UNE PASSION N'OUVRE QUE LE SÉLECTEUR DE FICHIER
// (2026-08-29)
// ----------------------------------------------------------------------------
// La carte de passion est cliquable EN ENTIER — `openEditPassionProfile` sous
// le lot UI-8, `toggleProfileSelect` sur le chemin historique — et les deux
// `<input type="file">` cachés sont ses DESCENDANTS.
//
// La pastille 📷 fait `event.stopPropagation()` puis `input.click()`. Ce
// stopPropagation ne concerne que le clic SUR LA PASTILLE : `HTMLElement.click()`
// dispatche un NOUVEL événement, qui part de l'input et remonte jusqu'à la
// carte. Mesuré avant correctif : taper 📷 ouvrait le sélecteur de fichier ET
// la modale d'édition, en une seule tape.
//
// Le même chemin existe par le menu « Options » (`openPassionProfileMenu` →
// « Photo de la passion »), qui appelle le même `input.click()` : le correctif
// est donc posé sur l'INPUT, pas sur la pastille, pour couvrir les deux portes.
//
// ⚠️ Le profil principal (`#mainProfileAvatar`) porte le même motif mais ne
// souffre pas du défaut : son `onclick` rappelle `input.click()`, et le garde
// de réentrance de la spécification HTML (« click in progress flag ») arrête la
// récursion au premier tour. Ne pas « corriger » cet endroit-là.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function poserDeuxPassions(page) {
  await page.evaluate(() => {
    state.user.profiles = [
      { id: "p_a", passion: "musique", name: "Ben", bio: "" },
      { id: "p_b", passion: "cuisine", name: "Ben", bio: "" },
    ];
    state.user.currentProfileId = "p_a";
    saveState();
    goTo("profiles");
    if (typeof renderProfilesScreen === "function") renderProfilesScreen();
  });
  await page.waitForTimeout(500);
}

// Tape la pastille et compte : le clic a-t-il atteint l'input, et la carte
// a-t-elle réagi ? On neutralise l'ouverture réelle du sélecteur de fichier,
// mais on laisse l'événement SE PROPAGER — c'est l'objet de la mesure.
async function taperPastille(page, idCarte) {
  return page.evaluate(({ id }) => {
    let carteReagit = 0;
    const vraiEdit = window.openEditPassionProfile;
    const vraiToggle = window.toggleProfileSelect;
    window.openEditPassionProfile = function () { carteReagit++; };
    window.toggleProfileSelect = function () { carteReagit++; };

    let clicsInput = 0;
    const inp = document.getElementById("passionPhoto_" + id);
    if (inp) inp.addEventListener("click", function (e) { clicsInput++; e.preventDefault(); });

    // ⚠️ On part de l'INPUT et on remonte à sa carte : les deux chemins ne
    // rendent pas le même balisage (`[data-v8-card]` sous UI-8, `.profile-card`
    // nu sous le kill switch), et un sélecteur de carte écrit en dur attrapait
    // la mauvaise carte — donc une pastille qui n'était pas celle mesurée.
    const carte = inp ? inp.closest(".profile-card") : null;
    const badge = carte ? carte.querySelector(".passion-photo-badge") : null;
    if (badge) badge.click();

    window.openEditPassionProfile = vraiEdit;
    window.toggleProfileSelect = vraiToggle;
    return { badge_trouve: !!badge, clics_input: clicsInput, carte_reagit: carteReagit };
  }, { id: idCarte });
}

test.describe("la pastille photo d'une carte de passion", () => {
  test("sous UI-8 : ouvre le sélecteur, sans ouvrir la modale d'édition", async ({ page }) => {
    await bootOnboarded(page);
    await poserDeuxPassions(page);
    const r = await taperPastille(page, "p_b");

    expect(r.badge_trouve).toBe(true);
    // La garde anti-creux : sans elle, le test passerait aussi si la pastille
    // ne faisait plus rien du tout.
    expect(r.clics_input).toBe(1);
    // Le défaut : valait 1 avant correctif.
    expect(r.carte_reagit).toBe(0);
  });

  test("sous le kill switch UI-8 : ne bascule pas non plus le filtre de contenu", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => localStorage.setItem("passio_ui_8", "0"));
    await poserDeuxPassions(page);
    const r = await taperPastille(page, "p_b");

    expect(r.badge_trouve).toBe(true);
    expect(r.clics_input).toBe(1);
    expect(r.carte_reagit).toBe(0);
  });
});
