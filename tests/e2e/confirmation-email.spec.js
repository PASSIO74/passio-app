// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMATION D'E-MAIL — ce que l'écran d'auth doit dire quand signUp ne rend
// plus de session.
//
// Contexte : « Confirm email » a été activé le 2026-08-30 (SMTP Brevo). Deux
// branches de `onbDoAuth` qui n'étaient jusque-là JAMAIS atteintes sont
// devenues le cas courant — et toutes deux étaient muettes :
//
//   ① `_showAuthMsg(...)` puis `switchAuthTab("signin")`, alors que
//      switchAuthTab REMET `#authMsg` à zéro. La personne créait son compte et
//      voyait l'écran basculer sans un mot : rien ne lui disait d'aller
//      chercher son e-mail. Mesuré avant correction : #authMsg vide.
//   ② aucune sortie si le lien n'arrive pas (spam, lien expiré) : « déjà
//      utilisé » à l'inscription, « confirme ton e-mail » à la connexion, et
//      pas de renvoi. Le compte était perdu.
//
// Aucun compte n'est créé et aucun e-mail n'est envoyé : `supa.auth` est
// remplacé par des doubles qui enregistrent leurs appels.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

// Ouvre l'écran d'auth réel (landing → « Créer un compte ») puis instrumente
// `supa.auth`. ⚠️ `supa` est un `let` de portée script : on mute l'objet
// existant, on ne le remplace pas — `window.supa = …` ne toucherait pas le
// binding que l'app utilise.
async function ouvrirAuth(page, doubles = {}) {
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    // ⚠️ Coupure de la « première visite », ACTIVE par défaut depuis le
    // 2026-09-01 : sans elle, un appareil vierge entre directement dans le Fil
    // et cette suite mesurerait le NOUVEAU parcours en croyant mesurer l'ancien.
    // Convention du projet : on pose la coupure, on ne retire aucune assertion.
    localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [GATE_KEY, GATE_TOKEN]);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 });
  // ⚠️ `exitLandingAsAuth` présélectionne l'onglet dans un setTimeout de 50 ms :
  // agir avant qu'il ne parte fait basculer le mode SOUS le test (mesuré — la
  // connexion partait en validation d'inscription). On attend donc l'état posé.
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate((d) => {
    window.__auth = { signUp: [], signIn: [], resend: [] };
    supa.auth.signUp = async (args) => { window.__auth.signUp.push(args); return d.signUp; };
    supa.auth.signInWithPassword = async (args) => { window.__auth.signIn.push(args); return d.signIn; };
    supa.auth.resend = async (args) => { window.__auth.resend.push(args); return d.resend; };
  }, {
    signUp: doubles.signUp || { data: { user: null, session: null }, error: null },
    signIn: doubles.signIn || { data: { session: null }, error: null },
    resend: doubles.resend || { data: {}, error: null },
  });
}

async function remplirInscription(page, email = "nouvelle@exemple.com") {
  await page.locator("#authTabSignup").click();
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
  await page.locator("#authPhone").fill("0612345678");
  await page.locator("#authSubmitBtn").click();
}

test("compte créé sans session : le message de confirmation reste affiché", async ({ page }) => {
  await ouvrirAuth(page, {
    // Ce que rend Supabase avec « Confirm email » ON : un user, pas de session.
    signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
  });
  await remplirInscription(page);

  const msg = page.locator("#authMsg");
  await expect(msg).toBeVisible();
  await expect(msg).toContainText("Compte créé");
  await expect(msg).toContainText("e-mails");
  // Et l'écran a bien basculé sur « Se connecter » — les deux à la fois, c'est
  // exactement ce que l'ordre des appels avait cassé.
  await expect(page.locator("#authTabSignin")).toHaveClass(/active/);
});

test("e-mail déjà utilisé : l'explication survit au changement d'onglet", async ({ page }) => {
  await ouvrirAuth(page, {
    // Anti-énumération : Supabase ne renvoie pas d'erreur, il rend un user aux
    // `identities` vides.
    signUp: { data: { user: { id: "u1", identities: [] }, session: null }, error: null },
  });
  await remplirInscription(page, "deja@exemple.com");

  const msg = page.locator("#authMsg");
  await expect(msg).toBeVisible();
  await expect(msg).toContainText("déjà utilisé");
  await expect(page.locator("#authTabSignin")).toHaveClass(/active/);
});

test("après une inscription à confirmer, le renvoi est proposé et envoie le bon type", async ({ page }) => {
  await ouvrirAuth(page, {
    signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
  });
  await remplirInscription(page, "aconfirmer@exemple.com");

  const lien = page.locator("#authResendLink");
  await expect(lien).toBeVisible();
  await lien.click();

  await expect(page.locator("#authMsg")).toContainText("renvoyé");
  const appels = await page.evaluate(() => window.__auth.resend);
  expect(appels).toHaveLength(1);
  expect(appels[0].type).toBe("signup");
  expect(appels[0].email).toBe("aconfirmer@exemple.com");
});

test("connexion refusée faute de confirmation : le renvoi devient la sortie", async ({ page }) => {
  await ouvrirAuth(page, {
    signIn: { data: { session: null }, error: { message: "Email not confirmed" } },
  });
  await page.locator("#authTabSignin").click();
  await page.locator("#authEmail").fill("bloque@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authSubmitBtn").click();

  await expect(page.locator("#authMsg")).toContainText("Confirme ton e-mail");
  await expect(page.locator("#authResendLink")).toBeVisible();

  await page.locator("#authResendLink").click();
  const appels = await page.evaluate(() => window.__auth.resend);
  expect(appels).toHaveLength(1);
  expect(appels[0].email).toBe("bloque@exemple.com");
});

test("le délai anti-abus de Supabase est traduit, pas recraché en anglais", async ({ page }) => {
  await ouvrirAuth(page, {
    signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
    resend: { data: null, error: { message: "For security purposes, you can only request this after 47 seconds." } },
  });
  await remplirInscription(page, "trop.vite@exemple.com");
  await page.locator("#authResendLink").click();

  const msg = page.locator("#authMsg");
  await expect(msg).toContainText("Patiente une minute");
  await expect(msg).not.toContainText("security purposes");
});

test("le lien de renvoi ne survit pas à un changement d'onglet manuel", async ({ page }) => {
  await ouvrirAuth(page, {
    signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
  });
  await remplirInscription(page, "ephemere@exemple.com");
  await expect(page.locator("#authResendLink")).toBeVisible();

  await page.locator("#authTabSignup").click();
  await expect(page.locator("#authResendLink")).toBeHidden();
  await expect(page.locator("#authMsg")).toHaveText("");
});

test("un compte confirmé entre dans l'app : le chemin nominal est intact", async ({ page }) => {
  await ouvrirAuth(page, {
    signUp: {
      data: {
        user: { id: "u_ok", identities: [{ id: "i1" }] },
        session: { access_token: "jeton", user: { id: "u_ok" } },
      },
      error: null,
    },
  });
  await remplirInscription(page, "confirme@exemple.com");

  // Session présente → aucune invitation à confirmer, aucun renvoi proposé,
  // et l'onboarding avance (onbNext) au lieu de rester sur l'écran d'auth.
  await expect(page.locator("#authResendLink")).toBeHidden();
  await expect(page.locator("#authMsg")).not.toContainText("Vérifie tes e-mails");
  expect(await page.evaluate(() => localStorage.getItem("passio_uid"))).toBe("u_ok");
});
