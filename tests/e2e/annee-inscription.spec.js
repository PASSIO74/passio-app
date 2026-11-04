// ═══════════════════════════════════════════════════════════════════════════
// ANNÉE DE NAISSANCE À L'INSCRIPTION  (2026-11-01, relecture du 2026-11-04)
//
// Le parcours « Première visite » (actif depuis le 2026-09-01) ne demandait
// l'année nulle part. La proposition IRL exige deux majeurs DÉCLARÉS côté
// serveur (`irl_interaction_allowed`) : l'allumer pour tout le monde l'aurait
// laissée invisible à tous les comptes nés depuis. L'année est donc demandée
// au formulaire de création, voyage dans `user_metadata.birth_year` (`signUp`
// ne rend pas de session avant la confirmation d'e-mail) et est déclarée au
// serveur à la première session (`admissionAnneeDuCompte`, app-07).
//
// ⚠️ Sous 18 ans, rien ne part : la politique (§ 10) dit que l'inscription est
// refusée. Ne pas confondre avec la porte d'admission, où le compte existe déjà
// et où l'année part au serveur. Le cas ③ le verrouille.
// ⚠️ `state` et `MY_UID` peuvent être ceux d'un autre compte que la session, et
// le serveur ne recule jamais une date de majorité. Le cas ⑦ le verrouille.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { poserGateSansPremiereVisite } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

const COMPTE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPTE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

test("③ sous 18 ans : aucun compte créé, rien en local, et une faute de frappe se corrige", async ({ page }) => {
  await ouvrirAuth(page);
  const { courante, avant } = await page.evaluate(() => ({
    courante: new Date().getFullYear(),
    avant: { an: state.user.birthYear, mineur: state.user.isMinor },
  }));
  await remplir(page);
  for (const age of [5, 15, 17]) {
    await page.locator("#authBirthYear").fill(String(courante - age));
    await page.locator("#authSubmitBtn").click();
    await expect(page.locator("#authMsg")).toContainText("18 ans et plus");
    await expect(page.locator("#authMsg")).toContainText("corrige");
    expect(await page.evaluate(() => window.__signUp.length), `${age} ans`).toBe(0);
  }
  expect(await page.evaluate(() => ({ an: state.user.birthYear, mineur: state.user.isMinor }))).toEqual(avant);

  await page.locator("#authBirthYear").fill(String(courante - 18));
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
  expect(await page.evaluate(() => window.__signUp[0].options.data.birth_year)).toBe(courante - 18);
});

test("④ l'année part avec le compte ; sans session, elle n'entre pas dans l'état local", async ({ page }) => {
  await ouvrirAuth(page);
  await remplir(page, "1995");
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
  const r = await page.evaluate(() => ({
    meta: window.__signUp[0].options.data.birth_year,
    local: state.user.birthYear,
    mineur: state.user.isMinor,
  }));
  expect(r).toEqual({ meta: 1995, local: null, mineur: false });
});

test("④ bis un refus du serveur ne laisse aucune année sur l'état", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate(() => {
    supa.auth.signUp = async (a) => {
      window.__signUp.push(a);
      return { data: { user: null, session: null }, error: { message: "User already registered" } };
    };
  });
  await remplir(page, "1990");
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
  await expect(page.locator("#authMsg")).not.toBeEmpty();
  expect(await page.evaluate(() => state.user.birthYear)).toBe(null);
});

test("④ ter avec une session : l'année entre dans l'état et n'est pas redemandée", async ({ page }) => {
  await ouvrirAuth(page);
  await page.evaluate((uid) => {
    supa.auth.signUp = async (a) => {
      window.__signUp.push(a);
      const user = { id: uid, identities: [{ id: "i1" }], user_metadata: a.options.data };
      return { data: { user, session: { user, access_token: "jeton" } }, error: null };
    };
  }, COMPTE_A);
  await remplir(page, "1995");
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => state.user.birthYear)).toBe(1995);
  const r = await page.evaluate(() => ({
    saute: _onbEtapeASauter("age"),
    etape: typeof onbSteps !== "undefined" ? onbSteps[onbStepIdx] : null,
    mineur: state.user.isMinor,
  }));
  expect(r.saute).toBe(true);
  expect(r.etape).not.toBe("age");
  expect(r.mineur).toBe(false);

  // Une année mineure encore en état (compte d'avant) ne saute pas l'étape : elle y est refusée.
  expect(await page.evaluate(() => {
    state.user.birthYear = new Date().getFullYear() - 15;
    return _onbEtapeASauter("age");
  })).toBe(false);
});

test("⑤ première session sur un autre appareil : l'année de user_metadata est déclarée, sans copie locale", async ({ page }) => {
  await ouvrirAuth(page);
  const appels = await page.evaluate(async (uid) => {
    const vus = [];
    state.user.birthYear = null;
    window._supaReal = true;
    MY_UID = uid;
    _uidProprietaireEtat = uid;
    supa.auth.getSession = async () => ({
      data: { session: { user: { id: MY_UID, user_metadata: { birth_year: 1990 } } } }, error: null,
    });
    supa.rpc = async (nom, args) => { vus.push({ nom, args }); return { data: true, error: null }; };
    _admissionAnneePoussee = false;
    const ok = await admissionRappelServeur();
    return { ok, vus, local: state.user.birthYear };
  }, COMPTE_A);
  expect(appels.ok).toBe(true);
  expect(appels.local).toBe(null);
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

test("⑦ l'année d'un autre compte ne part jamais sous le jeton de la session", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(async ([A, B]) => {
    const vus = [];
    window._supaReal = true;
    supa.rpc = async (nom, args) => { if (nom === "declare_birth_year") vus.push(args._birth_year); return { data: true, error: null }; };
    const session = (id, meta) => { supa.auth.getSession = async () => ({ data: { session: { user: { id, user_metadata: meta } } }, error: null }); };
    const neuf = () => { vus.length = 0; _admissionAnneePoussee = false; _admissionDeclaration = null; };

    // L'état et MY_UID sont ceux de A (2011), la session est celle de B.
    MY_UID = A; _uidProprietaireEtat = A;
    state.user.birthYear = 2011; state.user.isMinor = true;
    const out = {};

    neuf(); session(B, { birth_year: 1990 }); await admissionRappelServeur();
    out.avecMetadonnee = vus.slice();

    neuf(); session(B, {}); out.sansMetadonnee = await admissionRappelServeur();
    out.sansMetadonneeVus = vus.slice();

    neuf(); session(B, { birth_year: 1990 }); await irlProposalDeclareBirthYear();
    out.parLaProposition = vus.slice();

    // MY_UID a suivi la session, mais l'état reste celui de A.
    neuf(); MY_UID = B; session(B, {}); out.etatEtranger = await admissionRappelServeur();
    out.etatEtrangerVus = vus.slice();

    // Témoin positif : l'état est bien celui du compte, l'année locale part.
    neuf(); MY_UID = A; state.user.birthYear = 1985; session(A, { birth_year: 1990 }); await admissionRappelServeur();
    out.memeCompte = vus.slice();
    return out;
  }, [COMPTE_A, COMPTE_B]);
  expect(r.avecMetadonnee).toEqual([1990]);
  expect(r.sansMetadonnee).toBe(false);
  expect(r.sansMetadonneeVus).toEqual([]);
  expect(r.parLaProposition).toEqual([1990]);
  expect(r.etatEtranger).toBe(false);
  expect(r.etatEtrangerVus).toEqual([]);
  expect(r.memeCompte).toEqual([1985]);
});

test("⑧ une seule déclaration par compte et par page ; un échec libère la place", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(async (A) => {
    let appels = 0, panne = false;
    window._supaReal = true;
    MY_UID = A; _uidProprietaireEtat = A;
    state.user.birthYear = 1985;
    supa.auth.getSession = async () => ({ data: { session: { user: { id: A, user_metadata: {} } } }, error: null });
    supa.rpc = async () => { appels++; return panne ? { data: null, error: { message: "panne simulée" } } : { data: true, error: null }; };
    _admissionAnneePoussee = false; _admissionDeclaration = null;
    await Promise.all([admissionRappelServeur(), irlProposalDeclareBirthYear(), irlProposalDeclareBirthYear()]);
    await irlProposalDeclareBirthYear();
    const groupees = appels;

    appels = 0; panne = true; _admissionDeclaration = null;
    const echec = await irlProposalDeclareBirthYear();
    panne = false;
    const reprise = await irlProposalDeclareBirthYear();
    return { groupees, echec, reprise, apresEchec: appels };
  }, COMPTE_A);
  expect(r.groupees).toBe(1);
  expect(r.echec).toBe(false);
  expect(r.reprise).toBe(true);
  expect(r.apresEchec).toBe(2);
});

test("⑨ un visiteur et une session expirée n'interrogent pas le serveur", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(async (A) => {
    const vus = [];
    window._supaReal = true;
    supa.rpc = async (nom) => { vus.push(nom); return { data: true, error: null }; };

    MY_UID = "u_visiteur";
    const visiteur = await irlProposalServerVerdict(A);

    MY_UID = "11111111-2222-4333-8444-555555555555";
    window._sessionExpiree = true;
    const expiree = await irlProposalServerVerdict(A);
    window._sessionExpiree = false;
    return { visiteur, expiree, vus };
  }, COMPTE_A);
  expect(r.visiteur).toEqual({ ok: false, reason: "server_unavailable" });
  expect(r.expiree).toEqual({ ok: false, reason: "server_unavailable" });
  expect(r.vus).toEqual([]);
});

test("⑩ un démarrage sans session ne consomme pas le verrou : la session suivante déclare", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(async (A) => {
    const vus = [];
    window._supaReal = true;
    MY_UID = A; _uidProprietaireEtat = A;
    state.user.birthYear = null;
    supa.rpc = async (nom, args) => { vus.push(args && args._birth_year); return { data: true, error: null }; };
    _admissionAnneePoussee = false; _admissionDeclaration = null;

    supa.auth.getSession = async () => ({ data: { session: null }, error: null });
    const sansSession = await admissionRappelServeur();
    const verrou = _admissionAnneePoussee;

    supa.auth.getSession = async () => ({ data: { session: { user: { id: A, user_metadata: { birth_year: 1990 } } } }, error: null });
    const avecSession = await admissionRappelServeur();
    return { sansSession, verrou, avecSession, vus };
  }, COMPTE_A);
  expect(r.sansSession).toBe(false);
  expect(r.verrou).toBe(false);
  expect(r.avecSession).toBe(true);
  expect(r.vus).toEqual([1990]);
});
