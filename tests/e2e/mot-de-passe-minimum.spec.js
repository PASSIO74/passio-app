// ═══════════════════════════════════════════════════════════════════════════
// MOT DE PASSE — 8 caractères minimum, et les refus du serveur en FRANÇAIS.
//
// Contexte (audit de sécurité du 2026-09-12, avant l'envoi à des milliers de
// personnes) : le minimum côté serveur (Supabase → Email → « Minimum password
// length ») passe de 6 à 8, et « Password requirements » exige lettres et
// chiffres. Trois portes du client disaient encore « 6 » : inscription,
// changement depuis les Paramètres, récupération par lien. Et les refus du
// serveur — mot de passe trop court, mot de passe fuité (HaveIBeenPwned, EM-6
// du go/no-go du 2026-09-11, mesuré deux fois ce jour-là), composition —
// partaient tels quels, en anglais, dans une interface française.
//
// `MOT_DE_PASSE_MIN` (app-02) est la SEULE source du nombre ;
// `traduireRefusMotDePasse` la SEULE table des refus. Aucun compte n'est créé :
// `supa.auth.signUp` est remplacé par un double qui rend l'erreur voulue.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

async function ouvrirInscription(page, erreurSignUp) {
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    // Coupure de la « première visite » : cette suite mesure l'écran d'auth
    // historique, on pose la coupure et on ne retire aucune assertion.
    localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [GATE_KEY, GATE_TOKEN]);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 });
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  // ⚠️ `supa` est un `let` de portée script : on mute l'objet, on ne le
  // remplace pas.
  await page.evaluate((err) => {
    window.__signUp = [];
    supa.auth.signUp = async (args) => {
      window.__signUp.push(args);
      return err ? { data: { user: null, session: null }, error: { message: err } }
                 : { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
    };
  }, erreurSignUp || null);
}

async function remplir(page, mdp) {
  await page.locator("#authTabSignup").click();
  await page.locator("#authName").fill("Camille");
  await page.locator("#authEmail").fill("nouvelle@exemple.com");
  await page.locator("#authPassword").fill(mdp);
  await page.locator("#authPasswordConfirm").fill(mdp);
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();
}

test("① le minimum est 8, et il vit à UN endroit (MOT_DE_PASSE_MIN)", async ({ page }) => {
  await ouvrirInscription(page);
  const min = await page.evaluate(() => MOT_DE_PASSE_MIN);
  expect(min).toBe(8);
  // Les trois champs de saisie d'un NOUVEAU mot de passe portent le même seuil
  // que la constante — un `minlength` en dur qui divergerait serait une
  // quatrième source du nombre.
  await page.evaluate(() => { try { openChangePassword(); } catch (e) {} });
  const attrs = await page.evaluate(() => ["#cpNew", "#cpConfirm"].map((s) => { const el = document.querySelector(s); return el ? el.getAttribute("minlength") : null; }));
  for (const a of attrs) if (a !== null) expect(a).toBe(String(min));
});

test("② 7 caractères : refus AVANT tout appel serveur, en français, avec le nombre", async ({ page }) => {
  await ouvrirInscription(page);
  await remplir(page, "abc1234");
  const msg = page.locator("#authMsg");
  await expect(msg).toBeVisible();
  await expect(msg).toContainText("8 caractères");
  expect(await page.evaluate(() => window.__signUp.length)).toBe(0);
});

test("③ 8 caractères : l'appel part", async ({ page }) => {
  await ouvrirInscription(page);
  await remplir(page, "abcd1234");
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
});

const REFUS = [
  ["Password should be at least 8 characters.", /trop court/, /8 caractères/],
  ["Password is known to be weak and easy to guess, please choose a different one.", /fuites de données/, /Choisis-en un autre/],
  ["Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789.", /lettres et chiffres/, /mot de passe/i],
];

for (const [brut, attendu, attendu2] of REFUS) {
  test(`④ refus serveur traduit : « ${brut.slice(0, 34)}… »`, async ({ page }) => {
    await ouvrirInscription(page, brut);
    await remplir(page, "abcd1234");
    const msg = page.locator("#authMsg");
    await expect(msg).toBeVisible();
    await expect(msg).toHaveText(attendu);
    await expect(msg).toHaveText(attendu2);
    // Et pas un mot d'anglais : le message brut n'est jamais affiché tel quel.
    await expect(msg).not.toContainText("Password");
  });
}

test("⑤ un refus qui n'est PAS un mot de passe traverse intact (la table ne mange rien)", async ({ page }) => {
  await ouvrirInscription(page);
  const t = await page.evaluate(() => [
    traduireRefusMotDePasse("Invalid login credentials"),
    traduireRefusMotDePasse(""),
    traduireRefusMotDePasse(null),
  ]);
  expect(t).toEqual(["Invalid login credentials", "", ""]);
});
