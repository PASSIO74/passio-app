// ═══════════════════════════════════════════════════════════════════════════
// ENTONNOIR DES LIENS — LA DERNIÈRE MARCHE : « COMPTE CRÉÉ » (2026-10-04)
//
// Le pilotage suivait déjà un lien partagé jusqu'à « ouvert (confirmé) ». Il
// ne disait pas si l'ouverture avait fait NAÎTRE un compte — or c'est la seule
// mesure qui dise si les partages font venir du monde.
//
//  ① l'ouverture d'un lien suivi (`?plk=`) mémorise le lien d'arrivée de
//     l'appareil (clé d'APPAREIL, jamais purgée par l'adoption d'un compte) ;
//  ② l'inscription par e-mail émet `link_signup` SUR L'APPAREIL D'ARRIVÉE — pas
//     à la confirmation, qui s'ouvre souvent dans un autre navigateur ;
//  ③ « e-mail déjà utilisé » n'est pas une inscription ;
//  ④ le retour de Google (aucun `signUp` sur l'appareil) est reconnu à la
//     première session d'un compte NEUF ; un compte existant OUBLIE le lien.
//
// On mesure ce qui PART (route `telemetry_events`), jamais l'intention.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { sansDonneesDistantes } = require("./app-helper");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const LIEN = "lk_essai_inscription1";
const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");

async function preparer(page, { query, memoire } = {}) {
  await page.addInitScript(([k, t, mem]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    // Formulaire historique depuis un appareil vierge (convention du projet).
    localStorage.setItem("passio_first_run_experience_v1", "0");
    if (mem && !sessionStorage.getItem("__mem_posee")) {
      localStorage.setItem("passio_lien_arrivee_v1", JSON.stringify(mem));
      sessionStorage.setItem("__mem_posee", "1");
    }
  }, [GATE_KEY, GATE_TOKEN, memoire || null]);
  await sansDonneesDistantes(page);
  const lignes = [];
  await page.route("**/rest/v1/telemetry_events*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      try { JSON.parse(req.postData() || "[]").forEach((r) => lignes.push(r)); } catch (e) {}
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: "" });
  });
  await page.goto("/index.html?telemetry=1" + (query || ""));
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  return lignes;
}

async function ouvrirCreation(page, { dejaUtilise = false, invite = null } = {}) {
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 });
  await page.evaluate(([deja, inv]) => {
    window.__signUp = 0;
    supa.auth.signUp = async (args) => {
      window.__signUp++;
      const meta = Object.assign({}, (args.options && args.options.data) || {}, inv ? { invite_de: inv } : {});
      return { data: { user: { id: "u1", identities: deja ? [] : [{ id: "i1" }], user_metadata: meta }, session: null }, error: null };
    };
  }, [dejaUtilise, invite]);
  await page.locator("#authName").fill("Sam");
  await page.locator("#authEmail").fill("sam@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp)).toBe(1);
}

const signups = (lignes) => lignes.filter((r) => r.action === "link_signup");
const memoire = (page) => page.evaluate(() => localStorage.getItem("passio_lien_arrivee_v1"));

test.describe("Liens partagés — la marche « compte créé »", () => {
  test("① ouvrir un lien suivi mémorise le lien d'arrivée de l'appareil", async ({ page }) => {
    const lignes = await preparer(page, { query: "&plk=" + LIEN });
    const m = JSON.parse(await memoire(page));
    expect(m.lk).toBe(LIEN);
    expect(Date.now() - m.at).toBeLessThan(60000);
    // Le marqueur quitte la barre d'adresse (comportement d'avant, inchangé).
    expect(await page.evaluate(() => location.search)).not.toContain("plk");
    await expect.poll(() => lignes.some((r) => r.action === "link_open" && r.correlation_id === LIEN)).toBe(true);
  });

  test("② l'inscription par e-mail émet `link_signup` sur l'appareil d'arrivée, une fois", async ({ page }) => {
    const lignes = await preparer(page, { query: "&plk=" + LIEN });
    await ouvrirCreation(page, { invite: "1a7e1a7e-0000-4000-8000-0000000c0de1" });
    await expect.poll(() => signups(lignes).length, { timeout: 10000 }).toBe(1);
    const s = signups(lignes)[0];
    expect(s.correlation_id).toBe(LIEN);
    expect(s.type).toBe("link");
    expect(s.meta.link_id).toBe(LIEN);
    expect(s.meta.voie).toBe("email");
    expect(s.meta.invite).toBe(true);
    expect(typeof s.meta.delai_s).toBe("number");
    // Consommé : un second compte créé sur l'appareil ne s'attribuera pas ce lien.
    expect(await memoire(page)).toBeNull();
  });

  test("② bis sans lien d'arrivée, une inscription n'émet rien", async ({ page }) => {
    const lignes = await preparer(page);
    await ouvrirCreation(page);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.tel && tel.flush && tel.flush());
    await page.waitForTimeout(500);
    expect(signups(lignes)).toEqual([]);
  });

  test("③ « e-mail déjà utilisé » n'est pas une inscription : rien ne part, le lien reste", async ({ page }) => {
    const lignes = await preparer(page, { query: "&plk=" + LIEN });
    await ouvrirCreation(page, { dejaUtilise: true });
    await page.waitForTimeout(1500);
    expect(signups(lignes)).toEqual([]);
    expect(JSON.parse(await memoire(page)).lk).toBe(LIEN);
  });

  test("④ retour de Google : compte NEUF → signalé ; compte existant → lien oublié, rien ne part", async ({ page }) => {
    const lignes = await preparer(page, { query: "&plk=" + LIEN });
    const session = (createdMsAgo, provider) => ({
      user: { id: "9d3f1c2a-1b2c-4d5e-8f90-a1b2c3d4e5f6", created_at: new Date(Date.now() - createdMsAgo).toISOString(),
              app_metadata: { provider }, user_metadata: {} },
    });
    // Compte existant (créé il y a un an) : ce n'est pas une inscription.
    const v1 = await page.evaluate((s) => signalerInscriptionViaLien(s), session(365 * 86400000, "google"));
    expect(v1).toBe("compte_existant");
    expect(await memoire(page)).toBeNull();
    // Un nouveau lien, puis un compte né à l'instant par Google.
    await page.evaluate((lk) => localStorage.setItem("passio_lien_arrivee_v1", JSON.stringify({ lk, at: Date.now() - 60000 })), LIEN);
    const v2 = await page.evaluate((s) => signalerInscriptionViaLien(s), session(5000, "google"));
    expect(v2).toBe("signale");
    await expect.poll(() => signups(lignes).length, { timeout: 10000 }).toBe(1);
    expect(signups(lignes)[0].meta.voie).toBe("google");
    expect(signups(lignes)[0].meta.invite).toBe(false);
    // Une seconde session du même compte ne réémet rien : la mémoire est consommée.
    expect(await page.evaluate((s) => signalerInscriptionViaLien(s), session(6000, "google"))).toBe("aucun_lien");
  });

  test("④ bis un compte créé AVANT l'ouverture du lien n'est pas « venu par ce lien »", async ({ page }) => {
    await preparer(page, { memoire: { lk: LIEN, at: Date.now() } });
    const v = await page.evaluate(() => signalerInscriptionViaLien({ user: {
      id: "9d3f1c2a-1b2c-4d5e-8f90-a1b2c3d4e5f6", created_at: new Date(Date.now() - 10 * 60000).toISOString(),
      app_metadata: { provider: "email" }, user_metadata: {} } }));
    expect(v).toBe("compte_existant");
  });

  test("⑤ un lien d'arrivée de plus de 14 jours ne vaut plus rien", async ({ page }) => {
    await preparer(page, { memoire: { lk: LIEN, at: Date.now() - 15 * 86400000 } });
    expect(await page.evaluate(() => tel._lienArrivee())).toBeNull();
    expect(await memoire(page)).toBeNull();
  });

  test("⑥ le câblage, à la source : ouverture, inscription, retour de session", async () => {
    const t = lire("js/telemetry.js");
    const capture = t.slice(t.indexOf("(function captureLinkOpen()"), t.indexOf("(function captureLinkOpen()") + 2500);
    expect(capture).toContain("localStorage.setItem(LIEN_ARRIVEE_KEY");
    const a2 = lire("js/app-02-state-utils.js");
    const d = a2.indexOf("async function onbDoAuth(");
    const corpsAuth = a2.slice(d, a2.indexOf("\nasync function ", d + 10) > 0 ? a2.indexOf("\nasync function ", d + 10) : d + 40000);
    // Émis APRÈS la sortie « déjà utilisé » et AVANT la branche « à confirmer ».
    const iDeja = corpsAuth.indexOf("identities.length === 0");
    const iLien = corpsAuth.indexOf('tel.linkSignup("email"');
    const iPending = corpsAuth.indexOf('tel.action("signup_pending_confirmation")');
    expect(iDeja).toBeGreaterThan(0);
    expect(iLien).toBeGreaterThan(iDeja);
    expect(iPending).toBeGreaterThan(iLien);
    const a8 = lire("js/app-08-ui-modals-tour.js");
    // Les DEUX entrées de session (boot ET onAuthStateChange) appellent le signal.
    expect((a8.match(/try \{ signalerInscriptionViaLien\(session\); \}/g) || []).length).toBe(2);
    // Clé d'APPAREIL : jamais purgée par l'adoption d'un compte.
    const scoped = a2.slice(a2.indexOf("ACCOUNT_SCOPED_KEYS"), a2.indexOf("ACCOUNT_SCOPED_KEYS") + 3000);
    expect(scoped).not.toContain("passio_lien_arrivee_v1");
  });
});
