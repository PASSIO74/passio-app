// ═══════════════════════════════════════════════════════════════════════════
// ANNÉE DE NAISSANCE À L'INSCRIPTION  (2026-11-01)
//
// Le parcours « Première visite » (actif depuis le 2026-09-01) ne demandait
// l'année nulle part. La proposition IRL exige deux majeurs DÉCLARÉS côté
// serveur (`irl_interaction_allowed`) : l'allumer pour tout le monde l'aurait
// laissée invisible à tous les comptes nés depuis. L'année est donc demandée
// au formulaire de création, voyage dans `user_metadata.birth_year` (`signUp`
// ne rend pas de session avant la confirmation d'e-mail) et est déclarée au
// serveur à la première session par `admissionRappelServeur` (app-07).
//
// ⚠️ Le pré-filtre n'écarte que < 13 ans, comme la porte d'admission : entre
// 13 et 17 ans l'année doit PARTIR, c'est le serveur qui en fait un refus
// durable. Le cas ③ le verrouille.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

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
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate(() => {
    window.__signUp = [];
    supa.auth.signUp = async (a) => {
      window.__signUp.push(a);
      return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
    };
  });
}

async function remplir(page, annee) {
  await page.locator("#authTabSignup").click();
  await page.locator("#authName").fill("Camille");
  if (annee !== undefined) await page.locator("#authBirthYear").fill(annee);
  await page.locator("#authEmail").fill("nouvelle@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
  await page.locator("#authConsent").click();
}

test("① le champ n'existe qu'à la création, pas à la connexion", async ({ page }) => {
  await ouvrirAuth(page);
  await page.locator("#authTabSignup").click();
  await expect(page.locator("#authBirthYearWrap")).toBeVisible();
  await page.locator("#authTabSignin").click();
  await expect(page.locator("#authBirthYearWrap")).toBeHidden();
});

test("② sans année, aucun compte n'est créé", async ({ page }) => {
  await ouvrirAuth(page);
  await remplir(page);
  await page.locator("#authSubmitBtn").click();
  await expect(page.locator("#authMsg")).toContainText("année de naissance");
  expect(await page.evaluate(() => window.__signUp.length)).toBe(0);
});

test("③ une année de moins de 13 ans est écartée ; 13 à 17 ans part au serveur", async ({ page }) => {
  await ouvrirAuth(page);
  const courante = await page.evaluate(() => new Date().getFullYear());
  await remplir(page, String(courante - 5));
  await page.locator("#authSubmitBtn").click();
  await expect(page.locator("#authMsg")).toContainText("Vérifie ton année");
  expect(await page.evaluate(() => window.__signUp.length)).toBe(0);

  await page.locator("#authBirthYear").fill(String(courante - 15));
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
  const r = await page.evaluate(() => ({
    meta: window.__signUp[0].options.data.birth_year,
    mineur: state.user.isMinor,
  }));
  expect(r.meta).toBe(courante - 15);
  expect(r.mineur).toBe(true);
});

test("④ l'année part avec le compte et reste en local", async ({ page }) => {
  await ouvrirAuth(page);
  await remplir(page, "1995");
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
  const r = await page.evaluate(() => ({
    meta: window.__signUp[0].options.data.birth_year,
    local: state.user.birthYear,
    mineur: state.user.isMinor,
  }));
  expect(r).toEqual({ meta: 1995, local: 1995, mineur: false });
});

test("⑤ première session sur un autre appareil : l'année de user_metadata est déclarée", async ({ page }) => {
  await ouvrirAuth(page);
  const appels = await page.evaluate(async () => {
    const vus = [];
    state.user.birthYear = null;
    window._supaReal = true;
    MY_UID = "11111111-2222-4333-8444-555555555555";
    supa.auth.getSession = async () => ({
      data: { session: { user: { id: MY_UID, user_metadata: { birth_year: 1990 } } } }, error: null,
    });
    supa.rpc = async (nom, args) => { vus.push({ nom, args }); return { data: true, error: null }; };
    _admissionAnneePoussee = false;
    const ok = await admissionRappelServeur();
    return { ok, vus, local: state.user.birthYear };
  });
  expect(appels.ok).toBe(true);
  expect(appels.local).toBe(1990);
  expect(appels.vus).toContainEqual({ nom: "declare_birth_year", args: { _birth_year: 1990 } });
});

test("⑥ sans année locale, la proposition IRL demande quand même le verdict serveur", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(async () => {
    const vus = [];
    state.user.birthYear = null;
    window._supaReal = true;
    MY_UID = "11111111-2222-4333-8444-555555555555";
    supa.rpc = async (nom) => { vus.push(nom); return { data: true, error: null }; };
    const verdict = await irlProposalServerVerdict("22222222-2222-4333-8444-555555555555");
    return { verdict, vus };
  });
  expect(r.vus).toContain("irl_interaction_allowed");
  expect(r.verdict.ok).toBe(true);
});
