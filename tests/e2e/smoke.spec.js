// Tests smoke PASSIO — vérifient que l'app démarre et que les flux critiques s'affichent.
// Aucune écriture en base : on ne crée ni compte ni post.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

let pageErrors;

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  // Déverrouille l'Access Gate pour tester l'app elle-même
  // (le gate a sa propre suite : access-gate.spec.js)
  //
  // ⚠️ ET POSE LE KILL SWITCH DE LA PREMIÈRE VISITE. Depuis le 2026-09-01 ce
  // lot est ACTIF par défaut : un appareil vierge entre directement dans le Fil
  // et ne voit plus la landing. Cette suite observe le parcours HISTORIQUE —
  // elle pose donc la coupure et garde TOUTES ses assertions, convention déjà
  // appliquée aux mises en ligne d'UI-3A et des lots UI-4. Le nouveau parcours
  // par défaut a sa propre suite, `first-run.spec.js` (37 cas).
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [GATE_KEY, GATE_TOKEN]);
});

test("la page charge avec le bon titre", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page).toHaveTitle(/PASSIO/i);
});

test("la landing s'affiche (logo, badge, CTA)", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.getByText("Gratuit · 18 ans et +")).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter" }).first()).toBeVisible();
});

// ⚠️ LA LANDING NE DOIT PROMETTRE QUE CE QUE L'APPLICATION FAIT (2026-09-12).
// Elle annonçait « Beta privée » — l'application est ouverte depuis le
// 2026-09-11 — et un pilier « Documente tes voyages », alors que le Carnet de
// voyage a été RETIRÉ par ADR-011 §6. Personne ne l'avait vu parce qu'elle
// n'est plus sur le chemin d'un visiteur (`js/first-run.js` entre directement
// dans le Fil) : elle ne s'affiche QUE pour un appareil qui porte un compte
// dont la session n'est pas retrouvée — jeton expiré, hors ligne, SDK non
// chargé. C'est-à-dire, très exactement, quelqu'un qui revient.
//
// ⚠️ UNE SURFACE QUE PLUS PERSONNE NE TRAVERSE N'EST PAS UNE SURFACE MORTE :
// elle vieillit sans témoin. Ce verrou est le témoin.
test("la landing ne promet rien qui n'existe plus", async ({ page }) => {
  await page.goto("/index.html");
  // ⚠️ `textContent`, JAMAIS `innerText` — et ce n'est pas un détail de style.
  // `innerText` est sensible au RENDU : le badge vit dans `.landing-header`, que
  // le navigateur ne peint pas tant que la landing n'est pas active, donc
  // `innerText` rendait un texte PARTIEL (1 472 caractères sans le badge) et ce
  // cas restait VERT avec le défaut réinjecté. Mesuré le 2026-09-12, en le
  // réinjectant — pas en le relisant. Même famille qu'`offsetParent` qui ne
  // mesure rien sur un élément `position: fixed`.
  const texte = await page.locator("#landing").textContent();

  for (const mort of ["Beta privée", "Documente tes voyages", "Carnet de voyage", "carnet de voyage"]) {
    expect(texte, `la landing cite « ${mort} », qui n'existe plus`).not.toContain(mort);
  }

  // Deux piliers portaient le MÊME emoji et la MÊME promesse (« Retrouvez-vous
  // en vrai » / « Rencontre-les pour de vrai »). Une redite n'est pas un défaut
  // fonctionnel, donc aucune gate ne pouvait la voir : on la mesure ici.
  const titres = await page.locator("#landing .landing-pillar-title").allTextContents();
  expect(titres.length).toBeGreaterThan(0);
  expect(new Set(titres).size, `piliers en double : ${titres.join(" | ")}`).toBe(titres.length);
});

test("le bouton Se connecter ouvre le formulaire d'authentification", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Se connecter" }).first().click();
  await expect(page.locator("#authEmail")).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#authPassword")).toBeVisible();
});

test("aucune erreur JavaScript fatale au démarrage", async ({ page }) => {
  await page.goto("/index.html");
  await page.waitForTimeout(4000);
  const fatal = pageErrors.filter(
    (m) => !/Failed to fetch|NetworkError|load failed/i.test(m)
  );
  expect(fatal, "Erreurs JS détectées: " + fatal.join(" | ")).toHaveLength(0);
});

test("le manifest PWA et le service worker sont servis", async ({ page, request }) => {
  const manifest = await request.get("/manifest.json");
  expect(manifest.ok()).toBeTruthy();
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
});
