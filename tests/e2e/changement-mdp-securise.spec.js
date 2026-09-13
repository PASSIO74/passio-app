// ═══════════════════════════════════════════════════════════════════════════
// CHANGER SON MOT DE PASSE — avec l'ANCIEN, et une preuve fraîche si la
// session est vieille (contrepartie client de deux gardes serveur Supabase :
// « Require current password when updating » et « Secure password change »).
//
// Avant ce lot, `updateUser({ password })` partait seul : une session volée
// suffisait à changer le mot de passe et à verrouiller le compte hors de son
// propriétaire. Et allumer les gardes serveur sans ce client aurait cassé le
// changement pour toute session de plus de 24 h, en anglais.
//
// Aucun compte réel : `supa.auth` est mutée par des doubles (`supa` est un
// `let` de portée script — on mute l'objet, on ne le remplace jamais).
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

/**
 * Ouvre la modale « Changer mon mot de passe » avec des doubles :
 *  - `providers` : ce que la session annonce (["email"] = un mot de passe existe)
 *  - `reponses`  : file des réponses successives d'`updateUser`
 */
async function ouvrir(page, { providers = ["email"], reponses = [{ data: {}, error: null }], reauth = { data: {}, error: null } } = {}) {
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors);
  await page.evaluate(({ providers, reponses, reauth }) => {
    window.__cp = { updateUser: [], reauthenticate: 0 };
    const file = reponses.slice();
    supa.auth.getSession = async () => ({ data: { session: { user: { id: "u1", app_metadata: { providers } } } }, error: null });
    supa.auth.updateUser = async (attrs) => { window.__cp.updateUser.push(attrs); return file.length > 1 ? file.shift() : file[0]; };
    supa.auth.reauthenticate = async () => { window.__cp.reauthenticate++; return reauth; };
    openChangePassword();
  }, { providers, reponses, reauth });
  await expect(page.locator("#cpNew")).toBeVisible();
  return errors;
}

async function remplir(page, { actuel = "AncienMdp1", nouveau = "NouveauMdp1", confirme } = {}) {
  if (actuel !== null) await page.locator("#cpCurrent").fill(actuel);
  await page.locator("#cpNew").fill(nouveau);
  await page.locator("#cpConfirm").fill(confirme === undefined ? nouveau : confirme);
  await page.locator("#cpBtn").click();
}

test("① le mot de passe ACTUEL est demandé, et il part avec la demande (current_password)", async ({ page }) => {
  await ouvrir(page);
  await expect(page.locator("#cpCurrentWrap")).toBeVisible();
  await remplir(page);
  await expect.poll(() => page.evaluate(() => window.__cp.updateUser.length)).toBe(1);
  const envoye = await page.evaluate(() => window.__cp.updateUser[0]);
  expect(envoye).toEqual({ password: "NouveauMdp1", current_password: "AncienMdp1" });
});

test("② sans mot de passe actuel : refus AVANT tout appel serveur, en français", async ({ page }) => {
  await ouvrir(page);
  await remplir(page, { actuel: "" });
  await expect(page.locator("#cpMsg")).toHaveText(/mot de passe actuel/i);
  expect(await page.evaluate(() => window.__cp.updateUser.length)).toBe(0);
});

test("③ compte Google (sans mot de passe) : le champ est MASQUÉ et rien ne bloque", async ({ page }) => {
  await ouvrir(page, { providers: ["google"] });
  await expect(page.locator("#cpCurrentWrap")).toBeHidden();
  await remplir(page, { actuel: null });
  await expect.poll(() => page.evaluate(() => window.__cp.updateUser.length)).toBe(1);
  const envoye = await page.evaluate(() => window.__cp.updateUser[0]);
  expect(envoye).toEqual({ password: "NouveauMdp1" });
});

test("④ session de plus de 24 h : le serveur veut une preuve → code par e-mail, puis renvoi avec nonce", async ({ page }) => {
  await ouvrir(page, { reponses: [
    { data: null, error: { code: "reauthentication_needed", message: "Password update requires reauthentication." } },
    { data: {}, error: null },
  ] });
  await remplir(page);
  // Premier tour : refus « preuve requise » → reauthenticate() appelé UNE fois,
  // le champ du code apparaît, le message explique, le bouton est rendu.
  await expect(page.locator("#cpNonceWrap")).toBeVisible();
  await expect(page.locator("#cpMsg")).toHaveText(/code à 6 chiffres/i);
  expect(await page.evaluate(() => window.__cp.reauthenticate)).toBe(1);
  await expect(page.locator("#cpBtn")).toBeEnabled();
  // Le mot de passe saisi n'a pas été perdu.
  await expect(page.locator("#cpNew")).toHaveValue("NouveauMdp1");
  // Second tour : le code part avec la demande, et le changement aboutit.
  await page.locator("#cpNonce").fill("123456");
  await page.locator("#cpBtn").click();
  await expect.poll(() => page.evaluate(() => window.__cp.updateUser.length)).toBe(2);
  const second = await page.evaluate(() => window.__cp.updateUser[1]);
  expect(second).toEqual({ password: "NouveauMdp1", current_password: "AncienMdp1", nonce: "123456" });
  await expect(page.locator("#cpNew")).toBeHidden();
});

test("④ bis : code demandé mais laissé vide → refus avant tout appel", async ({ page }) => {
  await ouvrir(page, { reponses: [
    { data: null, error: { code: "reauthentication_needed", message: "Password update requires reauthentication." } },
  ] });
  await remplir(page);
  await expect(page.locator("#cpNonceWrap")).toBeVisible();
  await page.locator("#cpBtn").click();
  await expect(page.locator("#cpMsg")).toHaveText(/code reçu par e-mail/i);
  expect(await page.evaluate(() => window.__cp.updateUser.length)).toBe(1);
});

test("⑤ l'envoi du code échoue : on le dit, on ne laisse pas un formulaire figé", async ({ page }) => {
  await ouvrir(page, {
    reponses: [{ data: null, error: { code: "reauthentication_needed", message: "Password update requires reauthentication." } }],
    reauth: { data: null, error: { message: "smtp down" } },
  });
  await remplir(page);
  await expect(page.locator("#cpMsg")).toHaveText(/Impossible d'envoyer le code/i);
  await expect(page.locator("#cpBtn")).toBeEnabled();
  await expect(page.locator("#cpNonceWrap")).toBeHidden();
});

const REFUS = [
  [{ code: "current_password_invalid", message: "Current password is invalid" }, /actuel incorrect/i],
  [{ code: "current_password_required", message: "Current password required when setting new password." }, /mot de passe actuel/i],
  [{ code: "reauthentication_not_valid", message: "Nonce is not valid" }, /Code incorrect ou expiré/i],
  [{ code: "same_password", message: "New password should be different from the old password." }, /différent de l'ancien/i],
  [{ code: "weak_password", message: "Password is known to be weak and easy to guess, please choose a different one." }, /fuites de données/i],
];
for (const [erreur, attendu] of REFUS) {
  test(`⑥ refus serveur « ${erreur.code} » traduit`, async ({ page }) => {
    await ouvrir(page, { reponses: [{ data: null, error: erreur }] });
    await remplir(page);
    const msg = page.locator("#cpMsg");
    await expect(msg).toHaveText(attendu);
    await expect(msg).not.toContainText(/password/i);
    await expect(page.locator("#cpBtn")).toBeEnabled();
  });
}

test("⑦ à la SOURCE : le formulaire porte les trois champs et l'appelant sait les lire", async ({ page }) => {
  await ouvrir(page);
  const src = await page.evaluate(() => doChangePassword.toString());
  for (const attendu of ["current_password", "nonce", "reauthenticate", "reauthentication_needed", "cpCurrentWrap", "cpNonceWrap"]) {
    expect(src, attendu).toContain(attendu);
  }
});
