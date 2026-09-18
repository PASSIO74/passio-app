// ═══════════════════════════════════════════════════════════════════════════
// TÉLÉMÉTRIE — LA CHAÎNE INSCRIPTION → CONFIRMATION → CONNEXION SE VOIT
//
// Carte télémétrie-client du 2026-09-18 (LOT E, G2) : rien n'était émis à
// « compte créé, confirme ton e-mail », à « e-mail déjà utilisé », au renvoi
// du lien, à la confirmation, ni à la connexion réussie. Le compteur `signups`
// du pilotage comptait `signup`/`account_created`, que PERSONNE n'émettait.
// Pire : « Email not confirmed » est un 400 sur /auth/v1/token, marqué
// `refus_attendu` par le hook fetch et EXCLU des problèmes — une vague de
// testeurs bloqués à la confirmation était strictement invisible.
//
// Aucun compte n'est créé, aucun e-mail n'est envoyé, rien ne part vers la
// production : `supa.auth` est remplacé par des doubles (même levier que
// confirmation-email.spec.js — on MUTE l'objet, on ne le remplace pas), et les
// POST telemetry_events sont servis en 201 par une route.
//
// Chaque cas nomme la MUTATION qui le rend rouge (éprouvées à l'écriture).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

const SOURCE_APP02 = path.join(__dirname, "..", "..", "js", "app-02-state-utils.js");
const SOURCE_APP08 = path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js");

// Ouvre l'écran d'auth réel (landing → « Créer un compte »), pose les doubles
// `supa.auth` et la capture de `tel.action` / `tel.flush`.
async function ouvrirAuth(page, doubles = {}) {
  await sansDonneesDistantes(page);
  await page.route("**/rest/v1/telemetry_events*", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [GATE_KEY, GATE_TOKEN]);
  // `?telemetry=1` : seul opt-in local — sans lui `flowStart` rend null et
  // les hooks ne sont pas installés ; on mesurerait le vide en se croyant vert.
  await page.goto("/index.html?telemetry=1");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 });
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate((d) => {
    window.__auth = { signUp: [], signIn: [], resend: [] };
    supa.auth.signUp = async (args) => { window.__auth.signUp.push(args); return d.signUp; };
    supa.auth.signInWithPassword = async (args) => { window.__auth.signIn.push(args); return d.signIn; };
    supa.auth.resend = async (args) => { window.__auth.resend.push(args); return d.resend; };
    // `window.tel` EST l'objet Telemetry (même référence que `tel`) : muter ses
    // méthodes intercepte à la source, sans dépendre du transport.
    window.__telCap = [];
    window.__flushCap = [];
    window.tel.action = function (name, meta) { window.__telCap.push({ name: name, meta: meta || {} }); };
    window.tel.flush = function (opts) { window.__flushCap.push(opts || {}); };
  }, {
    signUp: doubles.signUp || { data: { user: null, session: null }, error: null },
    signIn: doubles.signIn || { data: { session: null }, error: null },
    resend: doubles.resend || { data: {}, error: null },
  });
}

async function remplirInscription(page, email = "nouvelle@exemple.com") {
  await page.locator("#authTabSignup").click();
  await page.locator("#authName").fill("Camille");
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();
}

async function remplirConnexion(page, email = "bloque@exemple.com") {
  await page.locator("#authTabSignin").click();
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authSubmitBtn").click();
}

const capture = (page) => page.evaluate(() => window.__telCap);
const noms = (evs) => evs.map((e) => e.name);
// Aucune meta ne doit porter une adresse : la clé `email` est refusée par le
// filtre, mais un « rc » ou un « kind » qui la citerait passerait — on vérifie
// la VALEUR, pas seulement la clé.
function sansAdresse(evs) {
  for (const e of evs) for (const v of Object.values(e.meta || {})) expect(String(v)).not.toContain("@");
}

test.describe("Télémétrie — inscription, confirmation, connexion", () => {

  // MUTATION : retirer `tel.action("auth_submitted", …)` ou
  // `tel.action("signup_pending_confirmation")` de onbDoAuth → rouge.
  test("① compte créé sans session : auth_submitted {kind:signup} puis signup_pending_confirmation, marqueur posé", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
    });
    const avant = Date.now();
    await remplirInscription(page);
    await expect(page.locator("#authMsg")).toContainText("Compte créé");

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signup_pending_confirmation"]);
    expect(evs[0].meta).toEqual({ kind: "signup" });
    sansAdresse(evs);
    // Le marqueur est un HORODATAGE, rien d'autre — relu par boot/SIGNED_IN.
    const marqueur = await page.evaluate(() => localStorage.getItem("passio_signup_pending"));
    expect(Number(marqueur)).toBeGreaterThanOrEqual(avant);
    expect(Number(marqueur)).toBeLessThanOrEqual(Date.now());
  });

  // MUTATION : retirer `tel.action("signup_refused", { rc: "deja_utilise" })` → rouge.
  test("② e-mail déjà utilisé (identities vides, aucune erreur GoTrue) : signup_refused {rc:deja_utilise}", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [] }, session: null }, error: null },
    });
    await remplirInscription(page, "deja@exemple.com");
    await expect(page.locator("#authMsg")).toContainText("déjà utilisé");

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signup_refused"]);
    expect(evs[1].meta).toEqual({ rc: "deja_utilise" });
    sansAdresse(evs);
    // Pas de marqueur : aucun compte n'a été créé.
    expect(await page.evaluate(() => localStorage.getItem("passio_signup_pending"))).toBeNull();
  });

  // MUTATION : retirer l'émission `signin_refused` dans la branche `if (error)`,
  // ou faire rendre "autre" à rcRefusAuth pour « Email not confirmed » → rouge.
  test("③ connexion refusée « Email not confirmed » : signin_refused {rc:non_confirme}, jamais le message", async ({ page }) => {
    await ouvrirAuth(page, {
      signIn: { data: { session: null }, error: { message: "Email not confirmed" } },
    });
    await remplirConnexion(page);
    await expect(page.locator("#authMsg")).toContainText("Confirme ton e-mail");

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signin_refused"]);
    expect(evs[0].meta).toEqual({ kind: "signin" });
    expect(evs[1].meta).toEqual({ rc: "non_confirme" });
    sansAdresse(evs);
  });

  test("③ bis rcRefusAuth : table des raisons fermée, déduite du message OU du code, sans le recopier", async ({ page }) => {
    await ouvrirAuth(page);
    const r = await page.evaluate(() => ({
      captcha: rcRefusAuth({ message: "captcha verification process failed" }),
      captchaCode: rcRefusAuth({ message: "x", code: "captcha_failed" }),
      banni: rcRefusAuth({ message: "User is banned" }),
      banniCode: rcRefusAuth({ message: "x", code: "user_banned" }),
      nonConfirme: rcRefusAuth({ message: "Email not confirmed" }),
      nonConfirmeCode: rcRefusAuth({ code: "email_not_confirmed" }),
      deja: rcRefusAuth({ message: "User already registered" }),
      dejaCode: rcRefusAuth({ code: "user_already_exists" }),
      quota: rcRefusAuth({ message: "Email rate limit exceeded" }),
      quotaCode: rcRefusAuth({ code: "over_email_send_rate_limit" }),
      mdp: rcRefusAuth({ message: "Invalid login credentials" }),
      mdpCode: rcRefusAuth({ code: "invalid_credentials" }),
      faible: rcRefusAuth({ message: "Password should contain at least one character of each", code: "weak_password" }),
      autre: rcRefusAuth({ message: "Database error saving new user" }),
      vide: rcRefusAuth(null),
      // Un message qui cite une adresse ne doit JAMAIS ressortir.
      adresse: rcRefusAuth({ message: "Unexpected failure for jean@exemple.com" }),
    }));
    expect(r).toEqual({
      captcha: "captcha", captchaCode: "captcha", banni: "banni", banniCode: "banni",
      nonConfirme: "non_confirme", nonConfirmeCode: "non_confirme",
      deja: "deja_utilise", dejaCode: "deja_utilise", quota: "quota", quotaCode: "quota",
      mdp: "mdp", mdpCode: "mdp", faible: "mdp", autre: "autre", vide: "autre", adresse: "autre",
    });
  });

  // MUTATION : retirer `tel.action("confirmation_resent", { ok: !error })` → rouge.
  test("④ renvoi du lien : confirmation_resent {ok:true} puis {ok:false} sur refus", async ({ page }) => {
    await ouvrirAuth(page, {
      signUp: { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null },
    });
    await remplirInscription(page, "aconfirmer@exemple.com");
    await expect(page.locator("#authResendLink")).toBeVisible();
    await page.locator("#authResendLink").click();
    await expect(page.locator("#authMsg")).toContainText("renvoyé");

    // Second renvoi refusé (délai anti-abus) : l'issue est dite, pas l'adresse.
    await page.evaluate(() => {
      supa.auth.resend = async () => ({ data: null, error: { message: "For security purposes, you can only request this after 47 seconds." } });
    });
    await page.locator("#authResendLink").click();
    await expect(page.locator("#authMsg")).toContainText("Patiente");

    const evs = (await capture(page)).filter((e) => e.name === "confirmation_resent");
    expect(evs.map((e) => e.meta)).toEqual([{ ok: true }, { ok: false }]);
    sansAdresse(evs);
  });

  // MUTATION : retirer `tel.action("signin_ok")` ou le `tel.flush({ keepalive: true })`
  // qui le suit → rouge. Sans le flush, l'événement attendrait le minuteur de 3 s
  // et serait emporté par le `location.reload()` qui suit immédiatement.
  test("⑤ connexion réussie : signin_ok puis flush keepalive AVANT le rechargement", async ({ page }) => {
    await ouvrirAuth(page, {
      signIn: { data: { session: { user: { id: "11111111-1111-4111-8111-111111111111" } } }, error: null },
    });
    // On arrête le parcours JUSTE APRÈS l'émission : `adopterCompteConnecte`
    // est le premier geste qui suit, et il mène au rechargement (qui perdrait
    // la capture). Une promesse jamais résolue fige onbDoAuth là, sans reload.
    await page.evaluate(() => { window.adopterCompteConnecte = () => new Promise(() => {}); });
    await remplirConnexion(page, "ok@exemple.com");
    await page.waitForFunction(() => window.__telCap.some((e) => e.name === "signin_ok"), null, { timeout: 10000 });

    const evs = await capture(page);
    expect(noms(evs)).toEqual(["auth_submitted", "signin_ok"]);
    const flushes = await page.evaluate(() => window.__flushCap);
    expect(flushes.length).toBeGreaterThanOrEqual(1);
    expect(flushes[flushes.length - 1]).toEqual({ keepalive: true });
    sansAdresse(evs);
  });

  // MUTATION : retirer `localStorage.removeItem("passio_signup_pending")` de
  // signalerInscriptionConfirmee → le second appel ré-émet (doublon) ; retirer
  // l'émission → aucun signup_confirmed.
  test("⑥ signup_confirmed : première session vue avec le marqueur, délai en secondes, UNE seule émission", async ({ page }) => {
    await ouvrirAuth(page);
    const r = await page.evaluate(() => {
      localStorage.setItem("passio_signup_pending", String(Date.now() - 90 * 1000));
      const session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
      const premier = signalerInscriptionConfirmee(session);
      const marqueurApres = localStorage.getItem("passio_signup_pending");
      const second = signalerInscriptionConfirmee(session);        // plus de marqueur
      const sansSession = (localStorage.setItem("passio_signup_pending", String(Date.now())), signalerInscriptionConfirmee(null));
      const marqueurSansSession = localStorage.getItem("passio_signup_pending");
      localStorage.removeItem("passio_signup_pending");
      return { premier, second, sansSession, marqueurApres, marqueurSansSession, evs: window.__telCap };
    });
    expect(r.premier).toBe(true);
    expect(r.marqueurApres).toBeNull();
    expect(r.second).toBe(false);
    // Sans session, le marqueur RESTE : la confirmation n'a pas encore eu lieu.
    expect(r.sansSession).toBe(false);
    expect(r.marqueurSansSession).not.toBeNull();
    const confirmes = r.evs.filter((e) => e.name === "signup_confirmed");
    expect(confirmes).toHaveLength(1);
    expect(confirmes[0].meta.delai_s).toBeGreaterThanOrEqual(90);
    expect(confirmes[0].meta.delai_s).toBeLessThan(120);
    expect(Object.keys(confirmes[0].meta)).toEqual(["delai_s"]);
  });

  // MUTATION : retirer l'un des deux appels (boot ou SIGNED_IN) → rouge. Sans
  // ce cas, la fonction pourrait rester vivante et n'être appelée par PERSONNE.
  test("⑦ contrat de source : signalerInscriptionConfirmee est câblée au boot ET au SIGNED_IN, le marqueur posé à « compte créé »", async () => {
    const app08 = fs.readFileSync(SOURCE_APP08, "utf8");
    // Les APPELS (`…(session);`), pas la déclaration (`…(session) {`).
    expect((app08.match(/signalerInscriptionConfirmee\(session\);/g) || []).length).toBe(2);
    expect(app08).toMatch(/^function signalerInscriptionConfirmee\(session\) \{/m);
    // Le premier appel est dans `boot` (branche session), le second dans le
    // handler onAuthStateChange — dans cet ordre dans le fichier.
    const iBoot = app08.indexOf("async function boot() {");
    const iHandler = app08.indexOf("onAuthStateChange");
    const appels = [];
    let k = -1;
    while ((k = app08.indexOf("signalerInscriptionConfirmee(session);", k + 1)) !== -1) appels.push(k);
    expect(appels[0]).toBeGreaterThan(iBoot);
    expect(appels[1]).toBeGreaterThan(iHandler);

    const app02 = fs.readFileSync(SOURCE_APP02, "utf8");
    expect(app02).toMatch(/localStorage\.setItem\("passio_signup_pending", String\(Date\.now\(\)\)\)/);
    // Le marqueur n'est PAS de portée compte : il doit SURVIVRE à la purge
    // d'adoption qui précède le premier boot avec session.
    const bloc = app02.slice(app02.indexOf("var ACCOUNT_SCOPED_KEYS = ["), app02.indexOf("];", app02.indexOf("var ACCOUNT_SCOPED_KEYS = [")));
    expect(bloc).not.toContain("passio_signup_pending");
  });
});
