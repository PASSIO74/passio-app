// COMPTE CONNU, SANS SESSION NI ÉTAT LOCAL : plus jamais l'ancienne landing.
//
// LE DÉFAUT (Benjamin, 2026-10-13, capture d'un ordinateur de bureau) : le lien
// ouvrait l'ANCIENNE page d'accueil (le pitch d'avant la première visite),
// coiffée du bandeau rouge « Session expirée ». L'appareil portait l'uuid d'un
// compte connecté autrefois (`passio_uid`) et un jeton SDK périmé, mais aucun
// état onboardé : `compteExistant()` (first-run) refusait l'entrée invitée,
// `entrerEnSessionExpiree()` (qui exige `state.onboarded`) aussi, et `boot()`
// retombait sur `showLanding()`.
//
// Cette suite exige : ① l'appareil sort du compte mort et entre dans le fil
// invité, écran de connexion par-dessus (RÉINJECTION : sans
// `sortirCompteSansSession`, `#landing.active` est vrai et `passio_uid` reste
// l'uuid) ; ② un état ONBOARDÉ n'est jamais purgé par ce chemin ; ③ drapeau
// coupé, la landing historique reste rendue à l'octet près.
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

const UID = "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const CLE_JETON = "sb-njkiyoklssvefstljemx-auth-token";
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Posé UNE fois : `addInitScript` rejoue à chaque navigation, rechargement
// compris — sans la marque, il réinstallerait le compte mort après la purge.
async function compteMort(page, etatOnboarde) {
  await page.addInitScript(([u, cle, st]) => {
    if (sessionStorage.getItem("__compte_mort_pose")) return;
    sessionStorage.setItem("__compte_mort_pose", "1");
    localStorage.setItem("passio_uid", u);
    localStorage.setItem(cle, JSON.stringify({
      access_token: "jeton-perime", refresh_token: "r", token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) - 600, user: { id: u },
    }));
    if (st) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [UID, CLE_JETON, etatOnboarde || null]);
}

function mesure(page) {
  return page.evaluate((cle) => ({
    landing: !!document.querySelector("#landing.active"),
    invite: document.documentElement.classList.contains("passio-first-run"),
    formulaire: !!document.querySelector("#onboarding.active"),
    uid: localStorage.getItem("passio_uid"),
    jeton: !!localStorage.getItem(cle),
    etat: localStorage.getItem("passio_mvp_state_v1"),
  }), CLE_JETON);
}

test.describe("Compte connu sans session : le nouveau parcours, pas l'ancienne landing", () => {
  test("① uuid + jeton périmé, aucun état onboardé : fil invité et écran de connexion", async ({ page }) => {
    await compteMort(page);
    await bootVisiteur(page);
    await page.waitForFunction(() => document.documentElement.classList.contains("passio-first-run"), null, { timeout: 15000 });
    const m = await mesure(page);
    expect(m.landing, "l'ancienne landing ne s'affiche plus").toBe(false);
    expect(m.invite, "entrée dans le parcours de première visite").toBe(true);
    expect(m.formulaire, "l'écran de connexion est proposé par-dessus").toBe(true);
    expect(RE_UUID.test(m.uid || ""), "l'uuid du compte mort est oublié").toBe(false);
    expect(m.jeton, "le jeton périmé est retiré").toBe(false);
  });

  test("② un état ONBOARDÉ n'est jamais purgé par ce chemin", async ({ page }) => {
    const st = { onboarded: true, user: { name: "Test", profiles: [] } };
    await compteMort(page, st);
    await bootVisiteur(page);
    const m = await mesure(page);
    expect(m.uid, "le compte reste en place").toBe(UID);
    expect(JSON.parse(m.etat || "{}").onboarded, "l'état local est gardé").toBe(true);
    expect(m.invite).toBe(false);
  });

  test("③ drapeau coupé : la landing historique, comme avant", async ({ page }) => {
    await compteMort(page);
    await bootVisiteur(page, { flag: "off" });
    const m = await mesure(page);
    expect(m.landing).toBe(true);
    expect(m.uid).toBe(UID);
  });
});
