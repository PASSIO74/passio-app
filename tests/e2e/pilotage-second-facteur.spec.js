// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE — LE SECOND FACTEUR (2026-11-08, audit de sécurité du 06/11, A-01)
// La fonction `pilotage` sait exiger un second facteur (PILOTAGE_EXIGER_AAL2),
// mais rien ne permettait d'en inscrire un : la condition du GO était hors
// d'atteinte. On mesure : l'inscription depuis les Réglages (code QR, clé, code
// vérifié), et un refus « Second facteur requis » qui ne ferme jamais les
// Réglages où il s'inscrit. Auth et fonction SIMULÉES : rien ne part en production.
// SUSPENDU le 08/11 (« on le remettra plus tard ») : le code n'est plus demandé à
// l'ouverture (SECOND_FACTEUR_A_L_OUVERTURE), il ne l'est plus que si la
// fonction l'exige. Pour le remettre, rétablir aussi le test « le code est
// demandé à l'ouverture, avant l'application » (historique git, #789).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { sansDonneesDistantes } = require("./app-helper");

const UID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "passioadmin@gmail.com";
const FACTEUR = { id: "f-totp-1", factor_type: "totp", friendly_name: "Pilotage", status: "verified",
  created_at: "2026-11-08T00:00:00Z", updated_at: "2026-11-08T00:00:00Z" };

function jwt(aal) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, email: EMAIL, role: "authenticated", aal, exp: 4102444800,
    amr: [{ method: aal === "aal2" ? "totp" : "oauth", timestamp: 1762560000 }] }) + ".sig";
}
const utilisateur = (factors) => ({ id: UID, email: EMAIL, aud: "authenticated", role: "authenticated", factors });

async function poserSession(page, factors) {
  await page.addInitScript(([cle, jeton, user]) => {
    localStorage.setItem(cle, JSON.stringify({ access_token: jeton, refresh_token: "r", token_type: "bearer",
      expires_in: 3600, expires_at: 4102444800, user }));
  }, ["sb-njkiyoklssvefstljemx-auth-token", jwt("aal1"), utilisateur(factors)]);
}

// L'Auth simulée : l'état des facteurs évolue comme sur le vrai serveur.
async function routerAuth(page, etat) {
  await page.route("**/auth/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/user") && req.method() === "GET") return json(200, utilisateur(etat.facteurs));
    if (/\/factors$/.test(url.pathname) && req.method() === "POST") {
      etat.inscriptions++;
      etat.facteurs = etat.facteurs.concat([{ ...FACTEUR, id: "f-neuf", status: "unverified" }]);
      // Le vrai serveur rend le SVG brut : supabase-js le préfixe en `data:image/svg+xml`.
      return json(200, { id: "f-neuf", type: "totp", friendly_name: "Pilotage",
        totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
          secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/Passio:" + EMAIL + "?secret=JBSWY3DPEHPK3PXP" } });
    }
    const m = /\/factors\/([^/]+)\/(challenge|verify)$/.exec(url.pathname);
    if (m && m[2] === "challenge") return json(200, { id: "defi-" + m[1], type: "totp", expires_at: 4102444800 });
    if (m && m[2] === "verify") {
      const corps = JSON.parse(req.postData() || "{}");
      etat.verifications.push({ facteur: m[1], code: corps.code, defi: corps.challenge_id });
      if (corps.code !== etat.bonCode) return json(422, { code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
      etat.facteurs = etat.facteurs.map((f) => (f.id === m[1] ? { ...f, status: "verified" } : f));
      return json(200, { access_token: jwt("aal2"), refresh_token: "r2", token_type: "bearer", expires_in: 3600,
        expires_at: 4102444800, user: utilisateur(etat.facteurs) });
    }
    const d = /\/factors\/([^/]+)$/.exec(url.pathname);
    if (d && req.method() === "DELETE") { etat.facteurs = etat.facteurs.filter((f) => f.id !== d[1]); return json(200, { id: d[1] }); }
    return json(404, { msg: "non simulé : " + url.pathname });
  });
}
// La fonction : on garde le niveau du jeton de chaque appel.
async function routerFonction(page, appels, reponse) {
  await page.route("**/functions/v1/pilotage", async (route) => {
    const jeton = (route.request().headers()["authorization"] || "").replace(/^Bearer /, "");
    let aal = null;
    try { aal = JSON.parse(Buffer.from(jeton.split(".")[1], "base64url").toString()).aal; } catch (_e) { /* jeton illisible */ }
    appels.push(aal);
    const r = reponse(aal);
    await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
}

test.beforeEach(async ({ page }) => { await sansDonneesDistantes(page); });

test("inscription depuis les Réglages : code QR, clé, code vérifié, facteur actif", async ({ page }) => {
  const etat = { facteurs: [], inscriptions: 0, verifications: [], bonCode: "123456" };
  const appels = [];
  await poserSession(page, []);
  await routerAuth(page, etat);
  await routerFonction(page, appels, () => ({ status: 503, body: { error: "indisponible" } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#app")).toBeVisible();
  await page.click('[data-tab="reglages"]');
  const zone = page.locator("#secondFacteur");
  await expect(zone).toContainText("Aucun second facteur");
  await page.click("#sfAjouter");
  await expect(zone.locator("img.qr-code")).toHaveAttribute("src", /^data:image\/svg\+xml;/);
  await expect(zone.locator(".cle-totp")).toHaveText("JBSWY3DPEHPK3PXP");
  // Sur le même téléphone : le bouton ouvre l'application d'authentification, compte prérempli.
  await expect(page.locator("#sfOuvrirAppli")).toHaveAttribute("href", /^otpauth:\/\/totp\//);
  expect(etat.inscriptions).toBe(1);
  // Un code mal formé ne part pas.
  await page.fill("#sfInscriptionCode", "12");
  await page.click("#sfActiver");
  await expect(zone.locator(".erreur")).toHaveText("Le code fait 6 chiffres.");
  expect(etat.verifications).toHaveLength(0);
  // Un mauvais code est refusé, et dit.
  await page.fill("#sfInscriptionCode", "000000");
  await page.click("#sfActiver");
  await expect(zone.locator(".erreur")).toContainText("Code refusé");
  // Le bon code active le facteur et élève la session ; la carte dit que le code est suspendu.
  await page.fill("#sfInscriptionCode", "123 456");
  await page.click("#sfActiver");
  await expect(zone).toContainText("Suspendu");
  await expect(zone).toContainText("n'est plus demandé pour l'instant");
  await expect(zone).toContainText("Cette session est vérifiée.");
  expect(etat.verifications.at(-1)).toEqual({ facteur: "f-neuf", code: "123456", defi: "defi-f-neuf" });
});

test("suspendu : un facteur vérifié n'arrête plus l'ouverture, l'application s'ouvre sans code", async ({ page }) => {
  const etat = { facteurs: [FACTEUR], inscriptions: 0, verifications: [], bonCode: "654321" };
  const appels = [];
  await poserSession(page, [FACTEUR]);
  await routerAuth(page, etat);
  await routerFonction(page, appels, () => ({ status: 503, body: { error: "indisponible" } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#ecranSecondFacteur")).toBeHidden();
  await expect.poll(() => appels.length).toBeGreaterThan(0);
  expect(appels.every((a) => a === "aal1"), "la lecture part avec la session de connexion, sans code").toBe(true);
  expect(etat.verifications, "aucun code demandé").toHaveLength(0);
  await page.click('[data-tab="reglages"]');
  await expect(page.locator("#secondFacteur")).toContainText("Suspendu");
});

test("suspendu, mais la fonction l'exige encore : le code est demandé, jamais l'écran de refus", async ({ page }) => {
  const etat = { facteurs: [FACTEUR], inscriptions: 0, verifications: [], bonCode: "654321" };
  const appels = [];
  await poserSession(page, [FACTEUR]);
  await routerAuth(page, etat);
  await routerFonction(page, appels, (aal) => (aal === "aal2" ? { status: 503, body: { error: "indisponible" } } : { status: 403, body: { error: "Second facteur requis." } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranSecondFacteur")).toBeVisible();
  await expect(page.locator("#sfErreur")).toContainText("Le pilotage demande ton second facteur.");
  await expect(page.locator("#ecranRefus")).toBeHidden();
  const avantCode = appels.length;
  await page.fill("#sfCode", "111111");
  await page.click("#sfValider");
  await expect(page.locator("#sfErreur")).toContainText("Code refusé");
  await expect(page.locator("#app")).toBeHidden();
  await page.fill("#sfCode", "654321");
  await page.press("#sfCode", "Enter");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#ecranSecondFacteur")).toBeHidden();
  await expect.poll(() => appels.length).toBeGreaterThan(avantCode);
  expect(appels.slice(avantCode).every((a) => a === "aal2"), "après le code, chaque appel part avec la session élevée").toBe(true);
});

test("« Second facteur requis » sans facteur inscrit : les Réglages restent ouverts, avec la marche à suivre", async ({ page }) => {
  const etat = { facteurs: [], inscriptions: 0, verifications: [], bonCode: "123456" };
  const appels = [];
  await poserSession(page, []);
  await routerAuth(page, etat);
  await routerFonction(page, appels, () => ({ status: 403, body: { error: "Second facteur requis." } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#bandeauErreur")).toContainText("ajoute-le dans Réglages");
  await expect(page.locator("#ecranRefus")).toBeHidden();
  await expect(page.locator("#app")).toBeVisible();
  await page.click('[data-tab="reglages"]');
  await expect(page.locator("#secondFacteur")).toContainText("Aucun second facteur");
});
