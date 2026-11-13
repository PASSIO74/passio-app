// ═══════════════════════════════════════════════════════════════════════════
// LOT-15 (audit UX/UI du 2026-11-10) — LE STUDIO ET L'ÉDITEUR MÉDIA
//   ① CRE-C01 : retirer la photo rend le texte ; « Créer → Publication » ouvre
//      le Studio sur le média réellement attaché, sinon le texte.
//   ② CRE-C05 : le texte se garde seul et se propose au retour (Reprendre / Effacer).
//   ③ CRE-C06 / C07 / C08 / C15 : envies 44 px dans l'ordre du Fil, plus de zone
//      d'envoi sombre, « Retirer la photo » nommé, « Texte, photo ou vidéo ».
//   ④ CRE-C10 : une ligne dit pour qui (et combien de temps pour une story).
//   ⑤ CRE-C02 / C17 : le sélecteur dit « Pour cette publication », annonce l'ajout
//      aux passions, marque la ligne choisie d'un ✓.
//   ⑥ CRE-C14 : un visiteur n'a aucune demande de micro.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { bootVisiteur } = require("./first-run-helper");

test("① CRE-C01 : retirer la photo rend le texte ; « Publication » rouvre sur le texte", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    goTo("studio");
    photoDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    studioType = "photo";
    renderPhotoPreview();
    const libelle = (document.querySelector('[data-v6-media="photo"]') || {}).textContent || "";
    const retirer = document.querySelector("#photoPreviewBox .photo-clear");
    const nom = retirer && retirer.getAttribute("aria-label");
    clearPhoto();
    const apresRetrait = studioType;
    studioType = "audio";
    ouvrirStudioPublication();
    return { libelle, nom, apresRetrait, apresPublication: studioType };
  });
  expect(r.libelle, "le bouton du composer le dit").toBe("Changer la photo");
  expect(r.nom).toBe("Retirer la photo");
  expect(r.apresRetrait).toBe("text");
  expect(r.apresPublication).toBe("text");
});

test("② CRE-C05 : le texte du Studio survit au rechargement et se propose", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => goTo("studio"));
  await page.locator("#postText").fill("Mon brouillon de luthier");
  await page.waitForTimeout(900);
  // Ce qui survit au rechargement, c'est le stockage local : on le lit, puis on
  // rouvre un Studio vide (le banc de démonstration ne rejoue pas un rechargement).
  expect(await page.evaluate(() => (lireBrouillonStudio() || {}).text)).toBe("Mon brouillon de luthier");
  await page.evaluate(() => { document.getElementById("postText").value = ""; goTo("feed"); goTo("studio"); });
  const bandeau = page.locator("#studioBrouillon");
  await expect(bandeau).toContainText("Mon brouillon de luthier");
  await bandeau.locator("button", { hasText: "Reprendre" }).click();
  await expect(page.locator("#postText")).toHaveValue("Mon brouillon de luthier");
  await expect(bandeau).toHaveCount(0);
  await page.evaluate(() => { document.getElementById("postText").value = ""; proposerBrouillonStudio(); });
  await page.locator("#studioBrouillon button", { hasText: "Effacer" }).click();
  expect(await page.evaluate(() => lireBrouillonStudio())).toBeNull();
});

test("③ CRE-C06 / C07 / C15 : envies 44 px dans l'ordre du Fil, plus de zone d'envoi, « Texte, photo ou vidéo »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    goTo("studio");
    const pills = [...document.querySelectorAll("#postMoodRow .pill")];
    const out = {
      ordre: pills.map((b) => b.textContent.trim()),
      hauteur: Math.min(...pills.filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height)),
      zone: getComputedStyle(document.getElementById("uploadZone")).display,
    };
    PassioUIV2.openCreateSheet();
    out.sousTitre = [...document.querySelectorAll("#v2CreateSheet .v2-sheet-item")].map((b) => b.textContent).find((t) => /Publication/.test(t));
    PassioUIV2.closeCreateSheet();
    return out;
  });
  expect(r.ordre).toEqual(["Apprendre", "Idées", "Rencontrer", "Tous"]);
  expect(r.hauteur).toBeGreaterThanOrEqual(44);
  expect(r.zone, "la zone d'envoi sombre est retirée sous UI-6").toBe("none");
  expect(r.sousTitre).toContain("Texte, photo ou vidéo");
});

test("④ CRE-C10 : la ligne d'audience — story 24 h et passion, compte privé « tes abonnés »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const story = ligneAudience("story");
    state.user.general.isPrivate = true;
    const prive = ligneAudience("publication");
    state.user.general.isPrivate = false;
    goTo("studio");
    const studio = (document.getElementById("ligneAudience_publication") || {}).textContent || "";
    return { story, prive, studio };
  });
  expect(r.story).toMatch(/^Visible 24 h par ta communauté · /);
  expect(r.prive).toBe("Visible par tes abonnés");
  expect(r.studio).toBe("Visible par ta communauté");
});

test("⑤ CRE-C02 / C17 : le sélecteur dit pour quoi, annonce l'ajout, coche la ligne choisie", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => goTo("studio"));
  await page.waitForTimeout(400);
  const ouvert = await page.evaluate(() => window.PassioFlatUI && typeof PassioFlatUI.ouvrirChoixStudio === "function"
    ? (PassioFlatUI.ouvrirChoixStudio(), true) : false);
  test.skip(!ouvert, "sélecteur plat indisponible dans ce banc");
  const champ = page.locator("#modalContent .psel-input");
  await champ.fill("escalade");
  await page.waitForTimeout(600);
  const ligne = page.locator("#modalContent .psel-item").first();
  await ligne.click();
  await page.waitForTimeout(200);
  await expect(page.locator("#modalContent .psel-section").first()).toHaveText("Pour cette publication");
  await expect(page.locator("#modalContent .psel-note")).toContainText("rejoindra aussi tes passions");
  await expect(page.locator("#modalContent .psel-item-choisie .psel-item-plus").first()).toHaveText("✓");
});

test("⑥ CRE-C14 : un visiteur n'a aucune demande de micro", async ({ page }) => {
  await bootVisiteur(page);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    let demandes = 0;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { demandes++; throw new Error("refus"); };
    await toggleRecording();
    return demandes;
  });
  expect(r, "aucune demande de permission avant un compte").toBe(0);
});
