// ═══════════════════════════════════════════════════════════════════════════
// MOT DE PASSE — AIDER À EN CHOISIR UN, PLUTÔT QUE DE REFUSER CELUI QU'ON A
//
// Rapport d'essai réel (capture, 2026-09-16) : « Emma0207@ » → « Ce mot de
// passe apparaît dans des fuites de données connues. Choisis-en un autre, plus
// original. », affiché EN HAUT du formulaire, à quatre champs du mot de passe,
// sans la moindre indication de ce qui est attendu ni de quoi faire ensuite.
//
// ⚠️ CE LOT N'AJOUTE AUCUNE RÈGLE — et c'est la première chose que ce banc
// mesure. Les trois exigences affichées (`MOT_DE_PASSE_REGLES`) sont EXACTEMENT
// celles que le serveur applique déjà. Ce qui change : elles sont écrites avant
// d'être opposées, le refus se prononce LÀ où l'on tape, et « Proposer un mot
// de passe » donne une sortie à qui n'en trouve plus.
//
// Aucun compte n'est créé : `supa.auth.signUp` est remplacé par un double.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

const FUITE = "Password is known to be weak and easy to guess, please choose a different one.";

async function ouvrirInscription(page, erreurSignUp) {
  await page.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    // Coupure de la « première visite » : ce banc mesure l'écran d'auth.
    localStorage.setItem("passio_first_run_experience_v1", "0");
  }, [GATE_KEY, GATE_TOKEN]);
  await sansDonneesDistantes(page);
  await page.goto("/index.html");
  await page.waitForSelector("#landing.active", { timeout: 25000 });
  await page.getByRole("button", { name: "Créer un compte" }).first().click();
  await page.waitForFunction(() => typeof onbDoAuth === "function" && typeof supa !== "undefined" && !!supa,
    null, { timeout: 25000 });
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  // ⚠️ `supa` est un `let` de portée script : on MUTE l'objet, on ne le
  // remplace pas (`window.supa = x` créerait une propriété séparée).
  await page.evaluate((err) => {
    window.__signUp = [];
    supa.auth.signUp = async (args) => {
      window.__signUp.push(args);
      return err ? { data: { user: null, session: null }, error: { message: err } }
                 : { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
    };
    supa.auth.signInWithPassword = async (args) => {
      window.__signUp.push(args);
      return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
    };
  }, erreurSignUp || null);
}

async function soumettre(page, mdp) {
  await page.locator("#authName").fill("Camille");
  await page.locator("#authEmail").fill("nouvelle@exemple.com");
  await page.locator("#authPassword").fill(mdp);
  await page.locator("#authPasswordConfirm").fill(mdp);
  await page.locator("#authConsent").click();
  await page.locator("#authSubmitBtn").click();
}

test("① les trois règles du serveur sont ÉCRITES, et seulement à la création", async ({ page }) => {
  await ouvrirInscription(page);
  const aide = page.locator("#authPwdHint");
  await expect(aide).toBeVisible();
  const texte = await page.locator("#authPwdRules").textContent();
  // Le nombre vient de MOT_DE_PASSE_MIN, jamais d'une constante de test.
  const min = await page.evaluate(() => MOT_DE_PASSE_MIN);
  expect(texte).toContain(min + " caractères");
  expect(texte).toContain("des lettres");
  expect(texte).toContain("des chiffres");
  // ⚠️ ET RIEN D'AUTRE. Une règle affichée que le serveur ne demande pas serait
  // exactement ce que ce lot devait éviter : compliquer la sélection.
  expect(texte).not.toMatch(/majuscule|minuscule|spécial|symbole|caractère spécial/i);
  expect(await page.evaluate(() => MOT_DE_PASSE_REGLES.length)).toBe(3);
  // En CONNEXION il n'y a rien à choisir : l'aide disparaît.
  await page.locator("#authTabSignin").click();
  await expect(aide).toBeHidden();
  await page.locator("#authTabSignup").click();
  await expect(aide).toBeVisible();
});

test("② les règles s'allument à la frappe, une par une", async ({ page }) => {
  await ouvrirInscription(page);
  const lus = async () => page.evaluate(() =>
    Array.from(document.querySelectorAll("#authPwdRules > span")).map((s) => s.textContent.trim().charAt(0)));
  // Champ vierge : on ÉNONCE, on ne reproche pas — aucune règle n'est cochée.
  expect(await lus()).toEqual(["○", "○", "○"]);
  await page.locator("#authPassword").fill("abc");
  expect(await lus()).toEqual(["○", "✓", "○"]);
  await page.locator("#authPassword").fill("abcd1234");
  expect(await lus()).toEqual(["✓", "✓", "✓"]);
});

test("③ « Proposer un mot de passe » remplit les DEUX champs, EN CLAIR", async ({ page }) => {
  await ouvrirInscription(page);
  await page.locator("#authPwdSuggest").click();
  const etat = await page.evaluate(() => ({
    a: document.getElementById("authPassword").value,
    b: document.getElementById("authPasswordConfirm").value,
    ta: document.getElementById("authPassword").type,
    tb: document.getElementById("authPasswordConfirm").type,
    ok: motDePasseAccepte(document.getElementById("authPassword").value),
  }));
  expect(etat.a.length).toBeGreaterThan(8);
  // Les deux champs, sinon « les mots de passe ne correspondent pas » juste après.
  expect(etat.b).toBe(etat.a);
  // ⚠️ Un mot de passe proposé qu'on ne peut pas LIRE est un mot de passe perdu.
  expect(etat.ta).toBe("text");
  expect(etat.tb).toBe("text");
  expect(etat.ok).toBe(true);
  // Et on dit qu'il faut le noter : c'est lui qu'il faudra retaper.
  await expect(page.locator("#authPwdRefus")).toBeVisible();
  await expect(page.locator("#authPwdRefus")).toContainText(/note-le/i);
  // Il passe la porte : l'appel part, sans aucun refus local.
  await soumettre(page, etat.a);
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
});

test("③ bis le tirage est ALÉATOIRE et toujours conforme (200 tirages)", async ({ page }) => {
  await ouvrirInscription(page);
  const r = await page.evaluate(() => {
    const vus = new Set();
    let tousOk = true, motRepete = false;
    for (let i = 0; i < 200; i++) {
      const m = motDePasseSuggere();
      vus.add(m);
      if (!motDePasseAccepte(m)) tousOk = false;
      const bouts = m.split("-");
      if (bouts[0] === bouts[1]) motRepete = true;
    }
    return { distincts: vus.size, tousOk, motRepete, exemple: motDePasseSuggere() };
  });
  expect(r.tousOk).toBe(true);
  // Un générateur qui rendrait deux fois la même chose serait un mot de passe
  // partagé par deux comptes. 200 tirages dans ~9 000 000 de combinaisons :
  // les collisions doivent rester exceptionnelles.
  expect(r.distincts).toBeGreaterThan(195);
  // « vent-vent-1234 » se lit comme un bug, et coûte de l'entropie.
  expect(r.motRepete).toBe(false);
  expect(r.exemple).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
});

test("④ un refus du SERVEUR se prononce aussi SOUS le champ, avec la sortie", async ({ page }) => {
  await ouvrirInscription(page, FUITE);
  await soumettre(page, "abcd1234");
  // Le bandeau du haut est conservé (c'est lui que mesure mot-de-passe-minimum)…
  await expect(page.locator("#authMsg")).toContainText(/fuites de données/);
  // …et le même refus se dit là où l'on tape, AVEC la porte de sortie nommée.
  const sous = page.locator("#authPwdRefus");
  await expect(sous).toBeVisible();
  await expect(sous).toContainText(/fuites de données/);
  await expect(sous).toContainText(/Proposer un mot de passe/);
  await expect(sous).not.toContainText("Password");
  // La sortie est réellement là, sous les yeux.
  await expect(page.locator("#authPwdSuggest")).toBeVisible();
});

test("④ bis retaper efface le refus — répondre, c'est répondre", async ({ page }) => {
  await ouvrirInscription(page, FUITE);
  await soumettre(page, "abcd1234");
  await expect(page.locator("#authPwdRefus")).toBeVisible();
  await page.locator("#authPassword").fill("abcd12345");
  await expect(page.locator("#authPwdRefus")).toBeHidden();
});

test("⑤ lettres + chiffres : refusé AVANT le serveur, et JAMAIS en connexion", async ({ page }) => {
  await ouvrirInscription(page);
  await soumettre(page, "motdepasse");
  await expect(page.locator("#authMsg")).toContainText(/lettres et des chiffres/);
  expect(await page.evaluate(() => window.__signUp.length)).toBe(0);
  // ⚠️ La même saisie en CONNEXION doit partir : un mot de passe choisi avant
  // le réglage serveur (2026-09-13) est valide, le refuser à la porte
  // enfermerait son compte dehors.
  await page.locator("#authTabSignin").click();
  await page.locator("#authEmail").fill("ancien@exemple.com");
  await page.locator("#authPassword").fill("motdepasse");
  await page.locator("#authSubmitBtn").click();
  await expect.poll(() => page.evaluate(() => window.__signUp.length)).toBe(1);
});

test("⑥ `autocomplete` dit au trousseau ce qu'il doit faire", async ({ page }) => {
  await ouvrirInscription(page);
  // ⚠️ C'est CET attribut qui fait apparaître « Mot de passe fort » du trousseau
  // iOS. Le champ était figé sur `current-password` : en création, le trousseau
  // se taisait, et chacun devait inventer son mot de passe tout seul.
  const lire = () => page.evaluate(() => ({
    p: document.getElementById("authPassword").getAttribute("autocomplete"),
    min: document.getElementById("authPassword").getAttribute("minlength"),
  }));
  expect(await lire()).toEqual({ p: "new-password", min: String(await page.evaluate(() => MOT_DE_PASSE_MIN)) });
  await page.locator("#authTabSignin").click();
  const enConnexion = await lire();
  expect(enConnexion.p).toBe("current-password");
  // Aucun minimum en connexion : un ancien mot de passe de 6 caractères entre.
  expect(enConnexion.min).toBe(null);
});
