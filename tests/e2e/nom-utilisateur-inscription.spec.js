// ═══════════════════════════════════════════════════════════════════════════
// NOM D'UTILISATEUR DEMANDÉ À L'INSCRIPTION (2026-09-09)
//
// Rapport d'un testeur : « à l'inscription le nom d'utilisateur n'est pas
// demandé ». Il l'était — mais à l'étape `name` de l'onboarding, qui n'est PLUS
// JAMAIS ATTEINTE par un compte neuf depuis l'activation de « Confirm email »
// (2026-08-30) : `signUp` ne rend plus de session, la personne revient par
// « Se connecter », et cette branche pose `onboarded = true` puis RECHARGE —
// `boot()` entre directement dans l'app. Le compte s'appelait « Passionné ».
//
// Le nom est donc demandé au SEUL écran que tout compte traverse : le
// formulaire de création. Il voyage dans `user_metadata` (la seule mémoire qui
// survive à « je crée ici, je confirme ailleurs ») et `boot()` l'applique.
//
// Aucun compte n'est créé, aucun e-mail n'est envoyé : `supa.auth` est doublé.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

async function ouvrirAuth(page) {
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    // Coupure de la « première visite » : cette suite mesure le formulaire
    // historique depuis un appareil vierge (convention du projet).
    localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [GATE_KEY, GATE_TOKEN]);
  // Isolation : cette suite navigue par son propre `page.goto`, donc la portée
  // de `bootOnboarded` ne la couvre pas. Sans elle, son verdict dépendrait du
  // contenu de la PRODUCTION (8e gate de `npm run verif`).
  await sansDonneesDistantes(page);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(
    () => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 },
  );
  // `exitLandingAsAuth` présélectionne l'onglet dans un setTimeout de 50 ms :
  // agir avant ferait basculer le mode sous le test.
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  await page.evaluate(() => {
    window.__auth = { signUp: [] };
    supa.auth.signUp = async (args) => {
      window.__auth.signUp.push(args);
      return { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
    };
  });
}

async function remplir(page, { nom, consent = true } = {}) {
  if (nom !== undefined) await page.locator("#authName").fill(nom);
  await page.locator("#authEmail").fill("nouvelle@exemple.com");
  await page.locator("#authPassword").fill("motdepasse123");
  await page.locator("#authPasswordConfirm").fill("motdepasse123");
  await page.locator("#authPhone").fill("0612345678");
  if (consent) await page.locator("#authConsent").click();
}

// ──────────────────────────────────────────────────────────────────────────
// ① Le champ est à l'écran là où un compte se crée, et nulle part ailleurs
// ──────────────────────────────────────────────────────────────────────────
test("① le nom est demandé à la création, pas à la connexion", async ({ page }) => {
  await ouvrirAuth(page);
  await expect(page.locator("#authNameWrap")).toBeVisible();
  await expect(page.locator("#authName")).toBeVisible();

  await page.locator("#authTabSignin").click();
  await expect(page.locator("#authNameWrap")).toBeHidden();

  await page.locator("#authTabSignup").click();
  await expect(page.locator("#authNameWrap")).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────
// ② Sans nom, aucune inscription ne part — et l'écran DIT pourquoi
//    (un refus muet est indiscernable d'une panne : règle de la fiche 19)
// ──────────────────────────────────────────────────────────────────────────
test("② inscription refusée sans nom, et rien n'est envoyé à Supabase", async ({ page }) => {
  await ouvrirAuth(page);
  await remplir(page, { nom: "" });
  await page.locator("#authSubmitBtn").click();

  const msg = page.locator("#authMsg");
  await expect(msg).toBeVisible();
  await expect(msg).toContainText(/nom d'utilisateur/i);
  expect(await page.evaluate(() => window.__auth.signUp.length)).toBe(0);
  // Le bouton reste utilisable : on sort du refus sans recharger.
  await expect(page.locator("#authSubmitBtn")).toBeEnabled();
});

test("② bis un nom d'un seul caractère est refusé", async ({ page }) => {
  await ouvrirAuth(page);
  await remplir(page, { nom: "B" });
  await page.locator("#authSubmitBtn").click();
  await expect(page.locator("#authMsg")).toContainText(/nom d'utilisateur/i);
  expect(await page.evaluate(() => window.__auth.signUp.length)).toBe(0);
});

// ──────────────────────────────────────────────────────────────────────────
// ③ Le nom part dans user_metadata, normalisé, sous les DEUX clés
// ──────────────────────────────────────────────────────────────────────────
test("③ le nom voyage dans user_metadata (name ET display_name), normalisé", async ({ page }) => {
  await ouvrirAuth(page);
  await remplir(page, { nom: "  Ben   jamin  " });
  await page.locator("#authSubmitBtn").click();

  const appels = await page.evaluate(() => window.__auth.signUp);
  expect(appels.length).toBe(1);
  const d = appels[0].options.data;
  expect(d.name).toBe("Ben jamin");        // blancs de bord et doublons réduits
  expect(d.display_name).toBe("Ben jamin"); // même valeur : deux orthographes seraient un piège
  expect(d.phone).toBeTruthy();             // le lot ne casse pas le champ voisin
});

// ──────────────────────────────────────────────────────────────────────────
// ④ La normalisation, aux bornes
// ──────────────────────────────────────────────────────────────────────────
test("④ nomCompteValide : bornes et normalisation", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(() => ({
    vide: nomCompteValide(""),
    espaces: nomCompteValide("   "),
    un: nomCompteValide("B"),
    deux: nomCompteValide("Bé"),
    trim: nomCompteValide("  Camille \n"),
    interne: nomCompteValide("Jean   Marc"),
    max: nomCompteValide("x".repeat(40)),
    trop: nomCompteValide("x".repeat(41)),
    nul: nomCompteValide(null),
  }));
  expect(r.vide).toBe("");
  expect(r.espaces).toBe("");
  expect(r.un).toBe("");
  expect(r.deux).toBe("Bé");
  expect(r.trim).toBe("Camille");
  expect(r.interne).toBe("Jean Marc");
  expect(r.max.length).toBe(40);
  expect(r.trop).toBe("");
  expect(r.nul).toBe("");
});

// ──────────────────────────────────────────────────────────────────────────
// ⑤ Le compte qui revient par la connexion RÉCUPÈRE son nom
//    (le cas du testeur : création ici, confirmation par e-mail, retour)
// ──────────────────────────────────────────────────────────────────────────
test("⑤ appliquerNomCompte : le nom des métadonnées remplace « Passionné »", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(() => {
    state.user = state.user || {};
    state.user.name = "Passionné";           // le repli de supaEnsureProfileExists
    state.user.general = state.user.general || {};
    state.user.general.username = "";
    const rendu = appliquerNomCompte({ user: { user_metadata: { name: "Camille" } } });
    return { rendu, nom: state.user.name, pseudo: state.user.general.username };
  });
  expect(r.rendu).toBe("Camille");
  expect(r.nom).toBe("Camille");
  // `general.username` PRIME dans supaEnsureProfileExists : le laisser vide,
  // c'est laisser le repli « Profil » gagner la course.
  expect(r.pseudo).toBe("Camille");
});

test("⑤ bis un retour Google (full_name) est couvert par le même chemin", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(() => {
    state.user = { name: "", general: {} };
    return appliquerNomCompte({ user: { user_metadata: { full_name: "Alex Martin" } } });
  });
  expect(r).toBe("Alex Martin");
});

// ──────────────────────────────────────────────────────────────────────────
// ⑥ … mais il n'écrase JAMAIS un nom déjà choisi
// ──────────────────────────────────────────────────────────────────────────
test("⑥ appliquerNomCompte n'écrase pas un nom existant", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(() => {
    state.user = { name: "Renommé depuis les Paramètres", general: { username: "Renommé depuis les Paramètres" } };
    const rendu = appliquerNomCompte({ user: { user_metadata: { name: "Camille" } } });
    return { rendu, nom: state.user.name };
  });
  expect(r.nom).toBe("Renommé depuis les Paramètres");
  expect(r.rendu).toBe("Renommé depuis les Paramètres");
});

test("⑥ bis une session sans métadonnée ne casse rien et ne vide rien", async ({ page }) => {
  await ouvrirAuth(page);
  const r = await page.evaluate(() => {
    state.user = { name: "Passionné", general: {} };
    return {
      sans: appliquerNomCompte({ user: {} }),
      nulle: appliquerNomCompte(null),
      nom: state.user.name,
    };
  });
  expect(r.nom).toBe("Passionné");   // rien à appliquer : on ne détruit pas
  expect(r.sans).toBe("Passionné");
  expect(r.nulle).toBe("Passionné");
});

// ──────────────────────────────────────────────────────────────────────────
// ⑦ LE CÂBLAGE, PAS SEULEMENT LA FONCTION
//
// ⚠️ Piège maison, écrit noir sur blanc dans CLAUDE.md : « tester la fonction
// ne suffit pas, le câblage pouvait être supprimé sans un seul rouge ». Le seul
// appelant vit dans la branche « session retrouvée » de `boot()` — chemin qu'un
// banc local ne parcourt pas (`_supaReal` y est faux, le SDK vient d'un CDN).
// On mesure donc le câblage à la source, et sa POSITION : après l'hydratation
// serveur (l'état du compte fait foi) et avant le profil de repli, qui lit
// `state.user.name`.
// ──────────────────────────────────────────────────────────────────────────
test("⑦ boot() appelle appliquerNomCompte, entre l'hydratation et le profil de repli", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "js", "app-08-ui-modals-tour.js"), "utf8");

  const iAppel = src.indexOf("appliquerNomCompte(session)");
  expect(iAppel).toBeGreaterThan(-1);

  const iHydratation = src.indexOf("supaLoadUserState === \"function\") await supaLoadUserState()");
  const iRepli = src.indexOf("const _name = (srvProf && srvProf.username)");
  expect(iHydratation).toBeGreaterThan(-1);
  expect(iRepli).toBeGreaterThan(-1);
  expect(iAppel).toBeGreaterThan(iHydratation);
  expect(iAppel).toBeLessThan(iRepli);
});

// ──────────────────────────────────────────────────────────────────────────
// ⑧ LA MÊME QUESTION N'EST JAMAIS POSÉE DEUX FOIS
//
// Mesuré en production le 2026-09-10 : le seul compte créé depuis « Confirm
// email » a sa ligne `profiles` 26 SECONDES après son compte auth, avec son nom
// ET sa passion — donc `signUp` lui a rendu une session et l'onboarding a
// continué. Ce chemin est vivant : sans ce saut, le formulaire demande le nom,
// puis l'écran suivant redemande « Comment t'appelles-tu ? ».
// ──────────────────────────────────────────────────────────────────────────
async function allerAgeAvecSession(page, nom) {
  await page.evaluate(() => {
    supa.auth.signUp = async () => ({
      data: { user: { id: "u1", identities: [{ id: "i1" }] },
              session: { user: { id: "11111111-2222-4333-8444-555555555555" } } },
      error: null,
    });
  });
  await remplir(page, { nom });
  await page.locator("#authSubmitBtn").click();
  await page.waitForTimeout(400);
}

const etapeActive = () =>
  document.querySelector(".onb-step.active")?.getAttribute("data-onb-step");

test("⑧ signUp qui rend une session : l'étape « prénom » est SAUTÉE", async ({ page }) => {
  await ouvrirAuth(page);
  await allerAgeAvecSession(page, "Camille");

  // L'inscription a continué l'onboarding : on est sur l'âge.
  expect(await page.evaluate(etapeActive)).toBe("age");

  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).first().click();
  await page.waitForTimeout(300);

  // ⚠️ LE POINT CENTRAL : on passe directement aux passions, la question du nom
  // ayant déjà sa réponse — et le nom saisi au formulaire est intact.
  expect(await page.evaluate(etapeActive)).toBe("passions");
  expect(await page.evaluate(() => state.user.name)).toBe("Camille");
});

test("⑧ bis sauter l'étape ne saute pas ce qu'elle préparait (grille peinte)", async ({ page }) => {
  await ouvrirAuth(page);
  await allerAgeAvecSession(page, "Camille");
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).first().click();
  await page.waitForTimeout(400);

  // `onbValidateName` peignait la grille APRÈS son `onbNext()` : sans report,
  // l'écran des passions s'ouvrirait VIDE — défaut muet, invisible aux gates.
  const tuiles = await page.evaluate(
    () => document.querySelectorAll("#passionGrid .passion-card, #passionGrid .psel-tile, #passionGrid > *").length,
  );
  expect(tuiles).toBeGreaterThan(0);
});

test("⑨ sans nom connu, l'étape « prénom » est bien POSÉE", async ({ page }) => {
  await ouvrirAuth(page);
  await allerAgeAvecSession(page, "Camille");
  // On efface le nom : le saut ne doit tenir qu'à la réponse déjà connue,
  // jamais à l'inscription elle-même — sinon plus personne n'est jamais nommé.
  await page.evaluate(() => { state.user.name = ""; });
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).first().click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(etapeActive)).toBe("name");
});

test("⑩ le saut vaut DANS LES DEUX SENS (le retour ne rouvre pas l'étape)", async ({ page }) => {
  await ouvrirAuth(page);
  await allerAgeAvecSession(page, "Camille");
  await page.locator("#birthYear").fill("1995");
  await page.getByRole("button", { name: "Valider" }).first().click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(etapeActive)).toBe("passions");

  // Sauter à l'aller seulement laisserait « ← Retour » ré-afficher l'étape
  // évitée : une porte fermée dans un seul sens.
  await page.evaluate(() => onbPrev());
  await page.waitForTimeout(200);
  expect(await page.evaluate(etapeActive)).toBe("age");
});
