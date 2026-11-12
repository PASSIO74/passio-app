// ═══════════════════════════════════════════════════════════════════════════
// LOT-13 (audit UX/UI du 2026-11-10) — L'ENTRÉE, LE COMPTE, LA NAVIGATION
//   ① ENT-C06 : Paramètres — fond, croix 44 px, Échap, retour système, aria-expanded ;
//      « Supprimer mon compte » dans « Compte » ; « Démo » masquée hors démo.
//   ② ENT-C07 : le retour système ferme la feuille « Créer » sans changer d'écran.
//   ③ ENT-C09 : recharger sur #messages rouvre Messages.
//   ④ ENT-C10 : changer d'onglet rend sa place dans le fil.
//   ⑤ ENT-C11 / C19 : onglets role=tab de 44 px, sorties en <button>, champs alignés.
//   ⑥ ENT-C18 : hors ligne, « pas de connexion », jamais un message anglais.
//   ⑦ ENT-C16 : « Avant de continuer » — pas de croix, case de 22 px.
//   ⑧ ENT-C14 : l'aide « auteur » dit « profil », « Compris » à 44 px.
//   ⑨ ENT-C12 / C13 : liens d'évitement ; une action principale sur l'accueil.
// Compte de démonstration local (`bootOnboarded`) : aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test("① ENT-C06 : le panneau Paramètres se ferme par le fond, la croix, Échap et le retour", async ({ page }) => {
  await bootOnboarded(page);
  const ouvert = () => page.evaluate(() => document.getElementById("devPanel").classList.contains("active"));
  const declencheur = page.locator("#topbarParametres");
  await declencheur.click();
  expect(await ouvert()).toBe(true);
  await expect(declencheur).toHaveAttribute("aria-expanded", "true");
  const croix = page.locator("#devPanel .dev-panel-fermer");
  expect((await croix.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  expect(await ouvert(), "Échap ferme").toBe(false);
  await expect(declencheur).toHaveAttribute("aria-expanded", "false");

  await declencheur.click();
  await page.mouse.click(20, 500);
  expect(await ouvert(), "un toucher dehors ferme").toBe(false);

  await declencheur.click();
  await croix.click();
  expect(await ouvert(), "la croix ferme").toBe(false);

  await page.waitForTimeout(300);
  await declencheur.click();
  await page.waitForTimeout(200);
  await page.goBack();
  await page.waitForTimeout(400);
  expect(await ouvert(), "le retour système ferme").toBe(false);
  expect(await page.evaluate(() => document.getElementById("screen-feed").classList.contains("active")), "l'écran dessous ne change pas").toBe(true);

  const r = await page.evaluate(() => {
    const suppr = document.getElementById("settingsDeleteAccount");
    const compte = suppr.closest(".settings-section");
    return {
      dansCompte: !!compte && /Compte/.test(compte.querySelector(".settings-section-header").textContent),
      demoMasquee: getComputedStyle(document.getElementById("settingsDemo")).display === "none",
    };
  });
  expect(r.dansCompte, "« Supprimer mon compte » vit dans « Compte », loin de la déconnexion").toBe(true);
  expect(r.demoMasquee, "« Démo » masquée hors mode démo").toBe(true);
});

test("② ENT-C07 : le retour système ferme la feuille « Créer » sans changer d'écran dessous", async ({ page }) => {
  await bootOnboarded(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => PassioUIV2.openCreateSheet());
  await page.waitForTimeout(200);
  await page.goBack();
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    feuille: !document.getElementById("v2CreateSheet").hidden,
    fil: document.getElementById("screen-feed").classList.contains("active"),
  }));
  expect(r.feuille, "la feuille est fermée").toBe(false);
  expect(r.fil, "l'écran dessous n'a pas changé").toBe(true);
});

test("③ ENT-C09 : recharger sur #messages rouvre Messages", async ({ page }) => {
  await bootOnboarded(page);
  await page.evaluate(() => goTo("messages"));
  expect(await page.evaluate(() => location.hash)).toBe("#messages");
  await page.reload();
  await page.waitForFunction(() => document.getElementById("screen-messages") && document.getElementById("screen-messages").classList.contains("active"), null, { timeout: 15000 });
  expect(await page.evaluate(() => location.hash)).toBe("#messages");
});

test("④ ENT-C10 : changer d'onglet rend sa place dans le fil", async ({ page }) => {
  await bootOnboarded(page);
  await page.waitForTimeout(600);
  const avant = await page.evaluate(async () => {
    const m = document.getElementById("appMain");
    m.scrollTop = 900;
    await new Promise((r) => setTimeout(r, 300));
    return m.scrollTop;
  });
  expect(avant, "le fil défile").toBeGreaterThan(400);
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(300);
  await page.evaluate(() => goTo("feed"));
  await page.waitForTimeout(900);
  const apres = await page.evaluate(() => document.getElementById("appMain").scrollTop);
  expect(Math.abs(apres - avant), `rendu à ${apres}, quitté à ${avant}`).toBeLessThan(80);
});

test("⑤ ENT-C11 / C19 : onglets, sorties et champs du compte", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    document.getElementById("onboarding").classList.add("active");
    switchAuthTab("signup");
    const t1 = document.getElementById("authTabSignin"), t2 = document.getElementById("authTabSignup");
    const out = {
      roles: [t1.getAttribute("role"), t2.getAttribute("role")],
      selection: [t1.getAttribute("aria-selected"), t2.getAttribute("aria-selected")],
      hauteur: Math.min(t1.getBoundingClientRect().height, t2.getBoundingClientRect().height),
      oublie: document.getElementById("authForgotLink").tagName,
      renvoi: document.getElementById("authResendLink").tagName,
      annee: [document.getElementById("birthYear").getAttribute("inputmode"), document.getElementById("birthYear").getAttribute("autocomplete")],
      libelleNom: document.querySelector("[data-onb-step='name'] label.field > span").textContent,
    };
    switchAuthTab("signin");
    out.selectionApres = [t1.getAttribute("aria-selected"), t2.getAttribute("aria-selected")];
    return out;
  });
  expect(r.roles).toEqual(["tab", "tab"]);
  expect(r.selection).toEqual(["false", "true"]);
  expect(r.selectionApres).toEqual(["true", "false"]);
  expect(r.hauteur).toBeGreaterThanOrEqual(44);
  expect(r.oublie, "« Mot de passe oublié ? » atteignable au clavier").toBe("BUTTON");
  expect(r.renvoi).toBe("BUTTON");
  expect(r.annee).toEqual(["numeric", "bday-year"]);
  expect(r.libelleNom).toBe("Nom d'utilisateur");
});

test("⑥ ENT-C18 : hors ligne, le formulaire dit « pas de connexion »", async ({ page, context }) => {
  await bootOnboarded(page);
  expect(await page.evaluate(() => [traduireRefusCaptcha("Failed to fetch"), traduireRefusCaptcha("Load failed"), traduireRefusCaptcha("NetworkError when attempting to fetch resource.")]))
    .toEqual(Array(3).fill("Pas de connexion internet — réessaie quand tu es en ligne."));
  await context.setOffline(true);
  const msg = await page.evaluate(async () => {
    document.getElementById("onboarding").classList.add("active");
    switchAuthTab("signin");
    document.getElementById("authEmail").value = "a@exemple.com";
    document.getElementById("authPassword").value = "motdepasse1";
    await onbDoAuth();
    return document.getElementById("authMsg").textContent;
  });
  await context.setOffline(false);
  expect(msg).toBe("Pas de connexion internet — réessaie quand tu es en ligne.");
});

test("⑦ ENT-C16 : « Avant de continuer » n'a pas de croix, et sa case fait 22 px", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    localStorage.setItem(CONSENTEMENT_REQUIS_KEY, "1");
    ouvrirConsentementRequis();
    const c = document.getElementById("consentRequisCase").getBoundingClientRect();
    const ligne = document.getElementById("consentRequisCase").closest("label").getBoundingClientRect();
    const out = { croix: document.querySelectorAll("#modalContent .modal-close").length, cote: Math.round(c.width), ligne: ligne.height };
    localStorage.removeItem(CONSENTEMENT_REQUIS_KEY);
    return out;
  });
  expect(r.croix, "deux réponses seulement").toBe(0);
  expect(r.cote).toBe(22);
  expect(r.ligne).toBeGreaterThanOrEqual(44);
});

test("⑧ ENT-C14 : l'aide « auteur » dit « profil » et « Compris » fait 44 px", async ({ page }) => {
  await bootOnboarded(page);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    fermerHint();
    if (state.hintsVus) delete state.hintsVus.feed_auteur;
    window.PassioFirstRun && (PassioFirstRun.aidesHistoriquesEnPause = () => false);
    const cible = document.querySelector("#feedList .post .post-author");
    montrerHint("feed_auteur", cible);
  });
  const bulle = page.locator(".passio-hint");
  await expect(bulle).toContainText("Touche le nom pour voir son profil");
  expect((await bulle.locator(".passio-hint-ok").boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test("⑨ ENT-C12 / C13 : liens d'évitement, et une seule action principale à l'accueil", async ({ page }) => {
  await bootOnboarded(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await page.keyboard.press("Tab");
  const premier = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
  expect(premier, "le premier arrêt est le lien d'évitement").toBe("Aller à la navigation");
  await page.keyboard.press("Enter");
  const focus = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest("nav")));
  expect(focus, "le focus est dans la barre de navigation").toBe(true);
  const cta = await page.evaluate(() => [...document.querySelectorAll("#landing .landing-cta .btn.primary")].map((b) => b.textContent.trim()));
  expect(cta).toEqual(["Créer un compte"]);
});
