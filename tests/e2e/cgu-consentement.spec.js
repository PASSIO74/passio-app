// ═══════════════════════════════════════════════════════════════════════════
// CGU, MENTIONS LÉGALES ET CONSENTEMENT À L'INSCRIPTION  (2026-09-08)
//
// Pourquoi ce lot. L'application ouvre à de vrais utilisateurs. Il lui manquait
// les DEUX textes qu'un service en ligne doit produire — les conditions
// générales (le contrat) et les mentions légales (qui édite, qui héberge, à qui
// s'adresser) — et surtout le geste qui forme le contrat : un consentement
// EXPLICITE au moment de créer le compte. La politique de confidentialité, elle,
// existait déjà.
//
// Deux défauts précis que ces cas verrouillent :
//
//   ① L'identité de l'éditeur était INVENTÉE. `openAbout()` affichait
//      « PASSIO SAS · France · contact@passio.app » — une forme juridique, un
//      pays et une adresse qu'aucun document du dépôt n'établit, la dernière
//      contredisant l'adresse réelle donnée par la politique de
//      confidentialité. Une mention légale fausse trompe ; une mention légale
//      visiblement inachevée se complète. Tout champ non renseigné s'affiche
//      donc « [à compléter] » EN CLAIR (`PASSIO_EDITEUR`, source unique).
//
//   ② Le piège du `<label>`. Les liens vers les CGU et la politique vivent
//      DANS le label de la case à cocher : l'activation d'un label part du clic
//      sur un de ses descendants, donc ouvrir les CGU COCHERAIT le
//      consentement — un accord donné par le geste qui sert à le lire.
//      `stopPropagation` l'empêche ; le cas ④ le mesure.
//
// ⚠️ La garde est mesurée SUR SON CHEMIN RÉEL (le vrai bouton, la vraie case),
// jamais en appelant la fonction de validation à la main : c'est le câblage,
// pas la fonction, qui a manqué dans les défauts passés du projet.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_KEY, GATE_TOKEN, poserGateSansPremiereVisite } = require("./gate-helper");
const { sansDonneesDistantes, bootOnboarded } = require("./app-helper");

// Ouvre l'écran d'auth réel (landing → « Créer un compte ») et remplace
// `supa.auth` par des doubles qui ENREGISTRENT leurs appels sans rien envoyer.
// ⚠️ `supa` est un `let` de portée script : on mute l'objet, on ne le remplace
// pas — `window.supa = …` ne toucherait pas le binding que l'app utilise.
async function ouvrirAuth(page) {
  await sansDonneesDistantes(page);
  await poserGateSansPremiereVisite(page);
  await page.addInitScript(() => { sessionStorage.setItem("passio_pwa_dismissed", "1"); });
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(
    () => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 },
  );
  // `exitLandingAsAuth` présélectionne l'onglet dans un setTimeout de 50 ms :
  // agir avant qu'il ne parte ferait basculer le mode SOUS le test.
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate(() => {
    window.__auth = { signUp: [], signIn: [], oauth: [] };
    supa.auth.signUp = async (a) => {
      window.__auth.signUp.push(a);
      return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
    };
    supa.auth.signInWithPassword = async (a) => {
      window.__auth.signIn.push(a);
      return { data: { session: null }, error: { message: "Invalid login" } };
    };
    supa.auth.signInWithOAuth = async (a) => { window.__auth.oauth.push(a); return { error: null }; };
  });
}

async function remplirInscription(page) {
  await page.locator("#authTabSignup").click();
  await page.locator("#authEmail").fill("nouvelle@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
  await page.locator("#authPhone").fill("0612345678");
}

// ──────────────────────────────────────────────────────────────────────────
// ① La case n'existe QUE là où un contrat se forme
// ──────────────────────────────────────────────────────────────────────────
test("① le consentement est demandé à la création, pas à la connexion", async ({ page }) => {
  await ouvrirAuth(page);

  await page.locator("#authTabSignup").click();
  await expect(page.locator("#authConsentWrap")).toBeVisible();
  await expect(page.locator("#authConsent")).not.toBeChecked();

  await page.locator("#authTabSignin").click();
  await expect(page.locator("#authConsentWrap")).toBeHidden();

  // ⚠️ `label.field` est `display:block` en CSS. Rendre la main au CSS
  // (`style.display = ""`) remettrait le texte SOUS la case, sur toute la
  // largeur : on exige la rangée, pas seulement la visibilité.
  await page.locator("#authTabSignup").click();
  const dir = await page.locator("#authConsentWrap").evaluate(
    (el) => getComputedStyle(el).flexDirection + "|" + getComputedStyle(el).display,
  );
  expect(dir).toBe("row|flex");
});

// ──────────────────────────────────────────────────────────────────────────
// ② Sans accord, AUCUN compte n'est créé — mesuré sur le vrai bouton
// ──────────────────────────────────────────────────────────────────────────
test("② inscription refusée sans consentement : signUp n'est jamais appelé", async ({ page }) => {
  await ouvrirAuth(page);
  await remplirInscription(page);
  await page.locator("#authSubmitBtn").click();

  await expect(page.locator("#authMsg")).toContainText("conditions générales");
  expect(await page.evaluate(() => window.__auth.signUp.length)).toBe(0);
});

test("③ inscription acceptée une fois la case cochée", async ({ page }) => {
  await ouvrirAuth(page);
  await remplirInscription(page);
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();

  const appels = await page.evaluate(() => window.__auth.signUp);
  expect(appels).toHaveLength(1);
  expect(appels[0].email).toBe("nouvelle@exemple.com");

  // La trace de l'accord : QUI a accepté QUOI. Sans la version, une réécriture
  // des CGU rendrait « a accepté » inexploitable.
  const cgu = await page.evaluate(() => (state && state.user && state.user.cgu) || null);
  expect(cgu).not.toBeNull();
  expect(cgu.version).toBe("2026-09-08");
  expect(typeof cgu.acceptedAt).toBe("string");
  expect(cgu.acceptedAt.length).toBeGreaterThan(10);
});

// ──────────────────────────────────────────────────────────────────────────
// ④ LE PIÈGE DU LABEL — lire les CGU ne vaut pas les accepter
// ──────────────────────────────────────────────────────────────────────────
test("④ ouvrir les CGU depuis le lien ne coche PAS la case", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignup").click();

  await page.locator("#authCguLink").click();
  await expect(page.locator(".modal-backdrop.active")).toBeVisible();
  await expect(page.locator(".modal-title")).toContainText("Conditions générales");
  await expect(page.locator("#authConsent")).not.toBeChecked();

  await page.evaluate(() => closeModal());
  await page.locator("#authPrivacyLink").click();
  await expect(page.locator(".modal-title")).toContainText("Politique de confidentialité");
  await expect(page.locator("#authConsent")).not.toBeChecked();
});

// ──────────────────────────────────────────────────────────────────────────
// ⑤ Le bouton Google forme le même contrat que le formulaire
// ──────────────────────────────────────────────────────────────────────────
test("⑤ Google en création : bloqué sans accord, passant avec", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignup").click();

  await page.locator("#authGoogleBtn").click();
  await expect(page.locator("#authMsg")).toContainText("conditions générales");
  expect(await page.evaluate(() => window.__auth.oauth.length)).toBe(0);

  await page.locator("#authConsent").click();
  await page.locator("#authGoogleBtn").click();
  await expect.poll(() => page.evaluate(() => window.__auth.oauth.length)).toBe(1);
});

test("⑥ Google en connexion : l'accord n'est pas redemandé", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignin").click();
  await page.locator("#authGoogleBtn").click();
  await expect.poll(() => page.evaluate(() => window.__auth.oauth.length)).toBe(1);
});

// ──────────────────────────────────────────────────────────────────────────
// ⑦ Ce que les CGU doivent DIRE
// ──────────────────────────────────────────────────────────────────────────
test("⑦ les CGU couvrent les engagements que le produit prend vraiment", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => openTermsOfService());
  const texte = await page.locator(".modal-backdrop.active .modal").innerText();

  // L'âge minimum, et la majorité pour les rencontres en vrai — les deux portes
  // que le code applique réellement (onbValidateAge, requireAdmission).
  expect(texte).toContain("13 ans");
  expect(texte).toMatch(/majeur/i);
  // Ce qu'un membre doit pouvoir opposer au service, et l'inverse.
  expect(texte).toMatch(/signal/i);          // signalement / modération
  expect(texte).toMatch(/supprimer ton compte/i);
  expect(texte).toMatch(/propriétaire/i);    // les contenus restent à leur auteur
  expect(texte).toMatch(/droit français/i);
  expect(texte).toContain("contact@ladamemetallerie.com");
  // Une adresse de contact inventée ne doit revenir NULLE PART.
  expect(texte).not.toContain("contact@passio.app");
});

// ──────────────────────────────────────────────────────────────────────────
// ⑧ L'identité de l'éditeur : inachevée et VISIBLE, jamais inventée
// ──────────────────────────────────────────────────────────────────────────
test("⑧ les mentions légales n'inventent aucune identité", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => openLegalNotice());
  const texte = await page.locator(".modal-backdrop.active .modal").innerText();

  expect(texte).toMatch(/Éditeur du service/i);
  expect(texte).toMatch(/Directeur de la publication/i);
  expect(texte).toMatch(/Hébergement/i);
  expect(texte).toContain("contact@ladamemetallerie.com");
  expect(texte).toMatch(/LCEN|6-I-5/);
  expect(texte).toMatch(/cnil\.fr/i);

  // Aucune identité fabriquée, et les trous se VOIENT.
  expect(texte).not.toContain("PASSIO SAS");
  expect(texte).not.toContain("contact@passio.app");

  // Le marqueur suit exactement les champs vides de PASSIO_EDITEUR : quand ils
  // seront renseignés, ce cas continuera de dire la vérité au lieu de rougir.
  const vides = await page.evaluate(() => Object.keys(PASSIO_EDITEUR)
    .filter((k) => ["raisonSociale", "formeJuridique", "capital", "siege", "rcs",
      "siret", "tvaIntra", "directeurPublication"].indexOf(k) !== -1)
    .filter((k) => !PASSIO_EDITEUR[k]).length);
  const marqueurs = (texte.match(/\[à compléter\]/g) || []).length;
  expect(marqueurs).toBe(vides);
});

test("⑨ « À propos » lit la même source, il ne redit pas une identité à lui", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => openAbout());
  const texte = await page.locator(".modal-backdrop.active .modal").innerText();
  expect(texte).not.toContain("PASSIO SAS");
  expect(texte).not.toContain("contact@passio.app");
  expect(texte).toContain("contact@ladamemetallerie.com");
});

// ──────────────────────────────────────────────────────────────────────────
// ⑩ LE CÂBLAGE, PAS LA FONCTION — les deux entrées des Paramètres
//
// ⚠️ Leçon de la fiche 18 : douze cas ouvraient un panneau par
// `page.evaluate(...)`, donc supprimer l'entrée du menu laissait la suite
// VERTE. Ici on ne fait que des GESTES.
// ──────────────────────────────────────────────────────────────────────────
test("⑩ Paramètres → Support ouvre les CGU et les mentions légales, au geste", async ({ page }) => {
  // ⚠️ `errors` est un OBJET à trois seaux (js / console / network), pas un
  // tableau : `bootOnboarded` y pousse directement.
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);

  // ⚠️ DEUX BASCULES SE CROISENT ICI, ET LES ENCHAÎNER À L'AVEUGLE ÉCHOUE.
  // ① Le clic sur un bouton de modale sort de `.dev-panel` : le délégué de
  //    fermeture d'app-02 referme le panneau. ② Mais la section « Support »,
  //    elle, RESTE dépliée — recliquer son en-tête la REPLIE, et le bouton
  //    visé disparaît (mesuré : `locator.click` en timeout de 15 s).
  // On amène donc la section à l'état voulu au lieu de basculer.
  const ouvrirSupport = async (nom) => {
    if (!(await page.locator("#devPanel").evaluate((el) => el.classList.contains("active")))) {
      await page.locator(".hamburger").click();
      await expect(page.locator("#devPanel")).toHaveClass(/active/);
    }
    const bouton = page.getByRole("button", { name: nom });
    if (!(await bouton.isVisible())) {
      await page.locator(".settings-section-header", { hasText: "Support" }).click();
    }
    await expect(bouton).toBeVisible();
    return bouton;
  };

  await (await ouvrirSupport("Conditions générales d'utilisation")).click();
  await expect(page.locator(".modal-backdrop.active .modal-title")).toContainText("Conditions générales");
  await page.evaluate(() => closeModal());

  await (await ouvrirSupport("Mentions légales")).click();
  await expect(page.locator(".modal-backdrop.active .modal-title")).toContainText("Mentions légales");

  expect(errors.js).toEqual([]);
  expect(errors.console).toEqual([]);
});
