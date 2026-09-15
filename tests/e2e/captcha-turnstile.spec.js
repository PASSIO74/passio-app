// ═══════════════════════════════════════════════════════════════════════════
// CAPTCHA ANTI-ROBOTS (Cloudflare Turnstile) — SEC-06 du go/no-go du 2026-09-11.
//
// Sans captcha, un script vide le quota d'e-mails d'authentification et rend
// l'inscription indisponible jusqu'à 24 h. Le serveur (Supabase, « Enable
// Captcha protection ») refusera TOUT appel d'auth sans jeton ; ce client doit
// donc en joindre un à l'inscription, à la connexion, au mot de passe oublié et
// au renvoi de lien — et ne rien changer tant que la sitekey est VIDE (le
// client se déploie AVANT l'interrupteur serveur, jamais après).
//
// Le widget est un FAUX posé avant l'app (`window.turnstile`), donc aucun
// script de Cloudflare n'est chargé ; les appels Supabase sont des doubles.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const RACINE = path.resolve(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");

async function ouvrirAuth(page, { sitekey = "", fauxWidget = true, erreur = null } = {}) {
  const demandesCloudflare = [];
  await page.route("https://challenges.cloudflare.com/**", (route) => { demandesCloudflare.push(route.request().url()); route.abort(); });
  await page.addInitScript(([k, t, sk, faux]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_first_run_experience_v1", "0");
    window.PASSIO_TURNSTILE_SITEKEY = sk;
    if (faux) {
      // Le faux Turnstile : rend un jeton numéroté à chaque rendu et à chaque reset.
      window.__ts = { renders: [], resets: 0, n: 0 };
      window.turnstile = {
        render(el, opts) {
          window.__ts.renders.push({ id: el && el.id, sitekey: opts.sitekey, language: opts.language });
          // Comme le vrai : une iframe de 65 px prend place dans le conteneur.
          const cadre = document.createElement("div"); cadre.style.height = "65px"; cadre.setAttribute("data-faux-turnstile", "1"); el.appendChild(cadre);
          window.__ts.n++;
          setTimeout(() => opts.callback("jeton-" + window.__ts.n), 0);
          window.__ts.opts = opts;
          return "w1";
        },
        reset() {
          window.__ts.resets++;
          window.__ts.n++;
          const o = window.__ts.opts;
          setTimeout(() => o && o.callback("jeton-" + window.__ts.n), 0);
        },
      };
    }
  }, [GATE_KEY, GATE_TOKEN, sitekey, fauxWidget]);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa, null, { timeout: 25000 });
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate((err) => {
    window.__auth = { signUp: [], signIn: [], reset: [], resend: [] };
    const rep = err ? { data: { user: null, session: null }, error: { message: err } } : { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
    supa.auth.signUp = async (a) => { window.__auth.signUp.push(a); return rep; };
    supa.auth.signInWithPassword = async (a) => { window.__auth.signIn.push(a); return err ? rep : { data: { session: null }, error: null }; };
    supa.auth.resetPasswordForEmail = async (email, o) => { window.__auth.reset.push({ email, o }); return { data: {}, error: null }; };
    supa.auth.resend = async (a) => { window.__auth.resend.push(a); return { data: {}, error: null }; };
  }, erreur);
  return demandesCloudflare;
}

async function inscrire(page, email = "nouvelle@exemple.com") {
  await page.locator("#authTabSignup").click();
  await page.locator("#authName").fill("Camille");
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();
}

test("① sitekey VIDE : rien n'est chargé, rien n'est montré, l'appel part comme avant (sans captchaToken)", async ({ page }) => {
  const demandes = await ouvrirAuth(page, { sitekey: "", fauxWidget: false });
  await expect(page.locator("#authCaptcha")).toBeHidden();
  await inscrire(page);
  await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
  const args = await page.evaluate(() => window.__auth.signUp[0]);
  expect(args.options).not.toHaveProperty("captchaToken");
  expect(args.options.data.name).toBe("Camille");
  expect(demandes).toEqual([]);
  expect(await page.evaluate(() => captchaActif())).toBe(false);
});

test("② sitekey posée : le widget est peint dans #authCaptcha, avec la sitekey, en français", async ({ page }) => {
  await ouvrirAuth(page, { sitekey: "1x00000000000000000000AA" });
  await expect.poll(() => page.evaluate(() => window.__ts.renders.length)).toBe(1);
  const r = await page.evaluate(() => window.__ts.renders[0]);
  expect(r).toEqual({ id: "authCaptcha", sitekey: "1x00000000000000000000AA", language: "fr" });
  await expect(page.locator("#authCaptcha")).toBeVisible();
});

test("③ inscription : le jeton du widget part dans options.captchaToken, puis le widget est remis à zéro (jeton à usage unique)", async ({ page }) => {
  await ouvrirAuth(page, { sitekey: "sk" });
  await inscrire(page);
  await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
  const args = await page.evaluate(() => window.__auth.signUp[0]);
  expect(args.options.captchaToken).toMatch(/^jeton-\d+$/);
  expect(args.options.data.cgu_version).toBeTruthy();
  await expect.poll(() => page.evaluate(() => window.__ts.resets)).toBeGreaterThanOrEqual(1);
});

test("④ connexion : options.captchaToken aussi", async ({ page }) => {
  await ouvrirAuth(page, { sitekey: "sk" });
  await page.locator("#authTabSignin").click();
  await page.locator("#authEmail").fill("qui@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__auth.signIn.length)).toBe(1);
  const args = await page.evaluate(() => window.__auth.signIn[0]);
  expect(args.email).toBe("qui@exemple.com");
  expect(args.options.captchaToken).toMatch(/^jeton-\d+$/);
});

test("⑤ mot de passe oublié : le jeton part avec redirectTo", async ({ page }) => {
  await ouvrirAuth(page, { sitekey: "sk" });
  await page.locator("#authTabSignin").click();
  await page.locator("#authEmail").fill("qui@exemple.com");
  await page.locator("#authForgotLink").click();
  await expect.poll(() => page.evaluate(() => window.__auth.reset.length)).toBe(1);
  const args = await page.evaluate(() => window.__auth.reset[0]);
  expect(args.email).toBe("qui@exemple.com");
  expect(args.o.redirectTo).toMatch(/^http/);
  expect(args.o.captchaToken).toMatch(/^jeton-\d+$/);
});

test("⑥ renvoi du lien de confirmation : options.captchaToken", async ({ page }) => {
  await ouvrirAuth(page, { sitekey: "sk" });
  await page.locator("#authEmail").fill("qui@exemple.com");
  await page.evaluate(() => onbResendConfirmation());
  await expect.poll(() => page.evaluate(() => window.__auth.resend.length)).toBe(1);
  const args = await page.evaluate(() => window.__auth.resend[0]);
  expect(args.type).toBe("signup");
  expect(args.options.captchaToken).toMatch(/^jeton-\d+$/);
});

test("⑦ refus serveur « captcha » : dit en français, jamais le message brut", async ({ page }) => {
  await ouvrirAuth(page, { sitekey: "sk", erreur: "captcha verification process failed" });
  await inscrire(page);
  const msg = page.locator("#authMsg");
  await expect(msg).toHaveText(/anti-robots/i);
  await expect(msg).not.toContainText(/captcha verification/i);
});

test("⑧ CSP : challenges.cloudflare.com est le SEUL hôte tiers, en script-src ET frame-src, dans les DEUX fichiers", async () => {
  for (const f of ["netlify.toml", "_headers"]) {
    const t = lire(f);
    const csp = (t.match(/Content-Security-Policy[ =:]+"?([^"\n]+)/) || [])[1] || "";
    const scriptSrc = (csp.match(/script-src ([^;]+);/) || [])[1] || "";
    const frameSrc = (csp.match(/frame-src ([^;]+);/) || [])[1] || "";
    expect(scriptSrc.trim(), f).toBe("'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(frameSrc.trim(), f).toBe("https://challenges.cloudflare.com");
  }
});

test("⑨ à la SOURCE : le banc de comptes réels n'entre plus par le mot de passe (immunisé contre le captcha)", async () => {
  const src = lire("tests/e2e/compte-e2e.js");
  expect(src).toContain("generate_link");
  expect(src).toContain('verifyOtp({ token_hash: th, type: "magiclink" })');
  // Et le client : trois points de demande (onbDoAuth couvre connexion ET
  // inscription, plus mot de passe oublié, plus renvoi), consommés ensuite.
  const app = lire("js/app-02-state-utils.js");
  expect((app.match(/await captchaJeton\(\)/g) || []).length).toBe(3);
  expect((app.match(/captchaReinitialiser\(\);/g) || []).length).toBeGreaterThanOrEqual(3);
});

// ── MOD-07 (2026-09-15) : la sitekey est POSÉE, et le widget ne s'allume que
// sur les hôtes que Cloudflare connaît ──────────────────────────────────────
// Un widget Turnstile est lié à des hôtes. Sur localhost ou un aperçu de PR il
// ne peut que rendre une erreur, et `captchaJeton()` attendrait 20 s un jeton
// qui ne vient jamais, à chaque inscription et chaque connexion — 8 suites en
// CI. `captchaActif()` exige donc un hôte de `PASSIO_TURNSTILE_HOTES` ; un
// banc qui pose `window.PASSIO_TURNSTILE_SITEKEY` reste maître (cas ① à ⑦).
test("⑩ à la SOURCE : la sitekey du widget est posée dans app-08, avec l'hôte de production", async () => {
  const app08 = lire("js/app-08-ui-modals-tour.js");
  expect(app08).toMatch(/const PASSIO_TURNSTILE_SITEKEY = "0x[0-9A-Za-z_-]{10,}";/);
  expect(app08).toMatch(/const PASSIO_TURNSTILE_HOTES = \["passio-app\.netlify\.app"\];/);
});

async function ouvrirAuthSansOverride(page, hotes) {
  const demandesCloudflare = [];
  await page.route("https://challenges.cloudflare.com/**", (route) => { demandesCloudflare.push(route.request().url()); route.abort(); });
  await page.addInitScript(([k, t, h]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_first_run_experience_v1", "0");
    if (h) window.PASSIO_TURNSTILE_HOTES = h;   // pas de window.PASSIO_TURNSTILE_SITEKEY : la constante d'app-08 décide
    window.__ts = { renders: [], n: 0 };
    // Comme le vrai (et comme le faux des cas ① à ⑦) : un reset rejoue un défi, donc un jeton neuf.
    window.turnstile = { render(el, opts) { window.__ts.opts = opts; window.__ts.renders.push({ sitekey: opts.sitekey }); window.__ts.n++; setTimeout(() => opts.callback("jeton-" + window.__ts.n), 0); return "w1"; }, reset() { window.__ts.n++; const o = window.__ts.opts; setTimeout(() => o && o.callback("jeton-" + window.__ts.n), 0); } };
  }, [GATE_KEY, GATE_TOKEN, hotes]);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa, null, { timeout: 25000 });
  await page.evaluate(() => {
    window.__auth = { signUp: [] };
    supa.auth.signUp = async (a) => { window.__auth.signUp.push(a); return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null }; };
  });
  return demandesCloudflare;
}

test("⑪ hors des hôtes déclarés (localhost) : inactif — rien n'est chargé, l'appel part sans jeton, sans attendre", async ({ page }) => {
  const demandes = await ouvrirAuthSansOverride(page, null);
  expect(await page.evaluate(() => captchaSitekey().length > 0), "la sitekey d'app-08 est bien là").toBe(true);
  expect(await page.evaluate(() => captchaActif()), "…mais l'hôte n'est pas déclaré").toBe(false);
  const t0 = Date.now();
  await inscrire(page);
  await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
  expect(Date.now() - t0, "aucune attente de jeton").toBeLessThan(5000);
  const args = await page.evaluate(() => window.__auth.signUp[0]);
  expect(args.options).not.toHaveProperty("captchaToken");
  expect(await page.evaluate(() => window.__ts.renders.length), "aucun widget rendu").toBe(0);
  expect(demandes).toEqual([]);
});

test("⑫ sur un hôte déclaré : actif — le widget est rendu avec LA sitekey d'app-08 et le jeton part", async ({ page }) => {
  await ouvrirAuthSansOverride(page, ["localhost", "127.0.0.1"]);
  expect(await page.evaluate(() => captchaActif())).toBe(true);
  await inscrire(page);
  await expect.poll(() => page.evaluate(() => window.__auth.signUp.length)).toBe(1);
  const r = await page.evaluate(() => ({ rendus: window.__ts.renders, args: window.__auth.signUp[0] }));
  expect(r.rendus.length).toBe(1);
  expect(r.rendus[0].sitekey).toMatch(/^0x[0-9A-Za-z_-]{10,}$/);
  expect(r.args.options.captchaToken).toMatch(/^jeton-[0-9]+$/);
  // La règle d'hôte : égalité, ou sous-domaine (frontière au point) — jamais
  // un simple suffixe (`7.0.0.1` ne couvre pas `127.0.0.1`).
  expect(await page.evaluate(() => {
    const h = location.hostname;
    window.PASSIO_TURNSTILE_HOTES = [h.slice(2)]; const suffixe = captchaActif();
    window.PASSIO_TURNSTILE_HOTES = [h.slice(h.indexOf(".") + 1)]; const sousDomaine = captchaActif();
    window.PASSIO_TURNSTILE_HOTES = [h]; const egal = captchaActif();
    window.PASSIO_TURNSTILE_HOTES = []; const aucun = captchaActif();
    return { suffixe, sousDomaine, egal, aucun };
  })).toEqual({ suffixe: false, sousDomaine: true, egal: true, aucun: false });
});
