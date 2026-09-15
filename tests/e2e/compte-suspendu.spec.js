// MOD-01 (suspension, 2026-09-15) — un compte suspendu par la modération lit
// « suspendu » en français à la connexion, avec la voie de contestation.
//
// GoTrue refuse un compte banni (`banned_until`) par `{ code: "user_banned",
// message: "User is banned" }` ; ce message partait tel quel dans l'écran de
// connexion. ① le refus est traduit, jamais brut (RÉINJECTION : sur le code
// d'avant, « User is banned » s'affiche) ; ② un autre refus reste ce qu'il était.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

async function ouvrirConnexion(page, erreur) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_first_run_experience_v1", "0");
    window.PASSIO_TURNSTILE_SITEKEY = "";
  }, [GATE_KEY, GATE_TOKEN]);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa, null, { timeout: 25000 });
  await page.evaluate((err) => {
    supa.auth.signInWithPassword = async () => ({ data: { session: null, user: null }, error: err });
  }, erreur);
  await page.locator("#authTabSignin").click();
  await page.locator("#authEmail").fill("suspendu@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => (document.getElementById("authMsg") || {}).textContent || "")).not.toBe("");
  return page.evaluate(() => (document.getElementById("authMsg") || {}).textContent || "");
}

test("① compte suspendu : le refus est dit en français, avec la voie de contestation — jamais « User is banned »", async ({ page }) => {
  const msg = await ouvrirConnexion(page, { message: "User is banned", code: "user_banned", status: 403 });
  expect(msg).toMatch(/suspendu par la modération/);
  expect(msg).toMatch(/passioadmin@gmail\.com/);
  expect(msg).not.toMatch(/banned/i);
});

test("② un mauvais mot de passe reste « E-mail ou mot de passe incorrect »", async ({ page }) => {
  const msg = await ouvrirConnexion(page, { message: "Invalid login credentials", code: "invalid_credentials", status: 400 });
  expect(msg).toMatch(/E-mail ou mot de passe incorrect/);
});
