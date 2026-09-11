// Tests E2E de l'Access Gate (verrouillage par code d'accès pré-lancement).
// Vérifie : blocage total, rejet d'un mauvais code, déverrouillage, persistance session.
const { test, expect } = require("@playwright/test");
const { GATE_CODE, GATE_KEY, GATE_TOKEN, CLE_PREMIERE_VISITE } = require("./gate-helper");

// ⚠️ Cette suite teste le GATE, pas ce qu'il y a derrière — mais deux de ses cas
// vérifient qu'après le bon code on arrive bien sur la landing. Depuis le
// 2026-09-01 le parcours « première visite » est ACTIF par défaut : un appareil
// vierge entre alors directement dans le Fil, et ces deux cas mesuraient le
// nouveau parcours en croyant mesurer l'ancien. On pose donc la coupure au boot
// et on garde TOUTES les assertions — convention déjà appliquée aux mises en
// ligne d'UI-3A et des lots UI-4. Les cas qui portent sur le gate lui-même ne
// sont pas affectés : la coupure vit dans `localStorage`, le jeton du gate dans
// `sessionStorage`, les deux ne se croisent pas.
test.beforeEach(async ({ page }) => {
  // ⚠️ Le rideau est LEVÉ par défaut depuis l'ouverture publique (2026-09-11) :
  // cette suite l'ARME explicitement pour continuer d'éprouver le mécanisme.
  await page.addInitScript((cle) => {
    localStorage.setItem(cle, "0");
    localStorage.setItem("passio_gate_actif", "1");
  }, CLE_PREMIERE_VISITE);
});

test("au premier lancement, l'écran de code bloque toute l'app", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  // L'app est masquée tant que le code n'est pas saisi
  await expect(page.locator(".app-shell")).toBeHidden();
  await expect(page.locator("#landing")).toBeHidden();
});

test("un mauvais code est rejeté avec un message d'erreur", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  await page.locator("#pgInput").click();
  await page.keyboard.type("0000");
  await expect(page.locator("#pgErr")).toHaveClass(/show/);
  await expect(page.locator(".app-shell")).toBeHidden();
  // Aucun jeton posé
  const token = await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY);
  expect(token).toBeNull();
});

test("le bon code déverrouille l'app et pose le jeton de session", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pgInput").click();
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  const token = await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY);
  expect(token).toBe(GATE_TOKEN);
});

test("un jeton falsifié ne déverrouille pas l'app", async ({ page }) => {
  await page.addInitScript((k) => sessionStorage.setItem(k, "jeton-bidon"), GATE_KEY);
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
});

test("une fois déverrouillé, le rechargement dans le même onglet ne redemande pas le code", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pgInput").click();
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(page.locator("#passioGate")).toHaveCount(0);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
});

test("les deep links / URL internes sont aussi protégés", async ({ page }) => {
  await page.goto("/index.html#messages");
  await expect(page.locator("#passioGate")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
});

// ⚠️ LE CODE ÉTAIT REDEMANDÉ À CHAQUE OUVERTURE (corrigé le 2026-09-10).
// Le jeton ne vivait qu'en `sessionStorage` : sur un téléphone, où l'onglet est
// purgé sans arrêt, cela voulait dire « à chaque fois ». C'est le tout premier
// écran que rencontre quelqu'un à qui on vient d'envoyer le lien, et pour une
// diffusion gratuite et large cette friction se paie à chaque session — pour un
// gain de sécurité nul : le hash est dans le JavaScript livré et un code à
// 4 chiffres se force en quelques secondes. Ce gate dit « ce n'est pas encore
// public », il ne protège rien.
test("le déverrouillage survit à la fin de session : le code n'est pas redemandé à la prochaine ouverture", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pgInput").click();
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });

  // Le jeton est posé aux DEUX endroits : la session (que tout le reste du code
  // lit) et l'appareil (qui, lui, survit à la fermeture de l'onglet).
  const pose = await page.evaluate((k) => ({
    session: sessionStorage.getItem(k), appareil: localStorage.getItem(k),
  }), GATE_KEY);
  expect(pose.session).toBe(GATE_TOKEN);
  expect(pose.appareil).toBe(GATE_TOKEN);

  // Fin de session : l'onglet est fermé, `sessionStorage` disparaît. L'appareil,
  // lui, se souvient.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.locator("#passioGate")).toHaveCount(0);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  // …et la session est réalimentée, puisque c'est elle que le reste du code lit.
  expect(await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY)).toBe(GATE_TOKEN);
});

test("un jeton d'APPAREIL falsifié ne déverrouille pas non plus", async ({ page }) => {
  // La seconde source ne doit pas être une porte dérobée : elle est comparée au
  // même hash que la première.
  await page.addInitScript((k) => localStorage.setItem(k, "jeton-bidon"), GATE_KEY);
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
});
// ═══════════════════════════════════════════════════════════════════════════
// TEXTES LÉGAUX LISIBLES SANS CODE (2026-09-11)
//
// La LCEN (art. 1-1) impose des mentions légales à la disposition du PUBLIC.
// Le rideau masquait tout — et en production le bloc applicatif, où vivaient
// les textes, n'est injecté qu'après le code : un visiteur sans code ne
// pouvait lire ni qui édite, ni qui héberge, ni comment joindre l'éditeur.
// Les textes vivent désormais dans js/legal-textes.js (tête de page) et
// l'écran du code les rend lui-même. Trois cas : ils se lisent ; les lire ne
// déverrouille rien et ne saisit rien ; ce sont les MÊMES textes que ceux de
// l'application (source unique, mesurée à l'octet près).
// ═══════════════════════════════════════════════════════════════════════════
const LEGAUX = [
  { bouton: "Mentions légales",         titre: "Mentions légales",                   attendu: ["Netlify, Inc.", "101 2nd Street", "passioadmin@gmail.com", "1-1, II"], modale: "openLegalNotice" },
  { bouton: "Conditions d'utilisation", titre: "Conditions générales d'utilisation", attendu: ["18 ans", "risques et périls", "Droit français"],                        modale: "openTermsOfService" },
  { bouton: "Confidentialité",          titre: "Politique de confidentialité",       attendu: ["CNIL", "identifiant d'appareil", "13 mois"],                             modale: "openPrivacyPolicy" },
];

test("sans code, les mentions légales, les CGU et la politique se lisent depuis l'écran du code d'accès", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#passioGate")).toBeVisible();
  const panneau = page.locator("#pgLegalPanel");
  await expect(panneau).toBeHidden();
  for (const l of LEGAUX) {
    await page.getByRole("button", { name: l.bouton, exact: true }).click();
    await expect(panneau).toBeVisible();
    await expect(page.locator("#pgLegalTitre")).toHaveText(l.titre);
    const texte = await page.locator("#pgLegalBody").innerText();
    for (const mot of l.attendu) expect(texte, `${l.titre} doit contenir « ${mot} »`).toContain(mot);
    expect(texte).not.toContain("Texte indisponible");
    expect(texte).not.toContain("[à compléter]");
    // Lire n'est pas entrer : rien n'est déverrouillé, aucun jeton posé.
    await expect(page.locator(".app-shell")).toBeHidden();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY)).toBeNull();
    await page.locator("#pgLegalClose").click();
    await expect(panneau).toBeHidden();
  }
});

test("lire un texte légal ne saisit aucun code : le clavier va au panneau, pas au champ", async ({ page }) => {
  await page.goto("/index.html");
  // Le champ du code prend le focus 700 ms après l'affichage : on attend qu'il
  // soit parti, c'est précisément la fenêtre où un lecteur ouvre un texte.
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Mentions légales", exact: true }).click();
  await expect(page.locator("#pgLegalPanel")).toBeVisible();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("pgLegalClose");
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#passioGate")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
  expect(await page.locator("#pgInput").inputValue()).toBe("");
  // Échap referme et rend le clavier au champ du code.
  await page.keyboard.press("Escape");
  await expect(page.locator("#pgLegalPanel")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("pgInput");
});

test("ouvrir un texte dans la première seconde : le focus différé du champ ne reprend pas la main", async ({ page }) => {
  // Le champ du code prend le focus par un setTimeout de 700 ms après
  // l'affichage. Quelqu'un qui tape « Mentions légales » avant ce délai lisait
  // le texte pendant que le clavier revenait, en silence, sur le champ du code :
  // les touches suivantes y auraient saisi un code. `focusInput` s'abstient tant
  // qu'un texte est ouvert — c'est cette garde que ce cas mesure.
  //
  // ⚠️ MESURÉ PAR RÉINJECTION : sans horloge simulée, `page.goto` rend la main
  // après `load` (scripts, styles, polices), donc APRÈS les 700 ms — le clic
  // arrivait toujours trop tard, et retirer la garde laissait ce cas VERT. Avec
  // l'horloge simulée, le minuteur ne part que quand le test le décide.
  await page.clock.install();
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Mentions légales", exact: true }).click();
  await expect(page.locator("#pgLegalPanel")).toBeVisible();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("pgLegalClose");
  await page.clock.runFor(1500); // le focus différé part maintenant… et doit s'abstenir
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("pgLegalClose");
  // Panneau fermé, le champ reprend le clavier comme d'habitude.
  await page.keyboard.press("Escape");
  await expect(page.locator("#pgLegalPanel")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("pgInput");
});

test("le panneau est inerte : Tab ne rejoint pas le champ du code sous l'overlay", async ({ page }) => {
  // `aria-modal` n'isole rien par lui-même. Sans `inert` sur la carte du code,
  // Shift+Tab depuis le bouton × atteignait les trois liens puis le champ du
  // code, invisibles sous l'overlay : quatre chiffres tapés là déverrouillaient
  // l'application pendant la lecture (relecture indépendante, 2026-09-11).
  await page.goto("/index.html");
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Mentions légales", exact: true }).click();
  await expect(page.locator("#pgLegalPanel")).toBeVisible();
  // Mesuré APRÈS CHAQUE pression : sans `inert`, le champ du code reçoit le
  // focus à la 4e (× → Confidentialité → Conditions → Mentions → champ), puis
  // le cycle repart ailleurs — une assertion posée seulement à la fin ne le
  // voyait pas (réinjection du 2026-09-11).
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    const actif = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? (a.id || a.className || a.tagName) : "aucun";
    });
    expect(actif, `après ${i + 1} Shift+Tab, le focus est sur « ${actif} »`).not.toBe("pgInput");
    expect(actif).not.toContain("pg-legal-link");
  }
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#passioGate")).toBeVisible();
  await expect(page.locator(".app-shell")).toBeHidden();
  expect(await page.locator("#pgInput").inputValue()).toBe("");
  expect(await page.evaluate((k) => sessionStorage.getItem(k), GATE_KEY)).toBeNull();
  // Et la carte redevient utilisable une fois le panneau fermé.
  await page.locator("#pgLegalClose").click();
  await expect(page.locator("#pgLegalPanel")).toBeHidden();
  await page.locator("#pgInput").click();
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
});

test("Échap referme le panneau même après un clic dans le texte", async ({ page }) => {
  // Un clic sur un paragraphe (non focalisable) posait le focus sur <body> ;
  // un keydown ciblé sur <body> ne traverse jamais #passioGate, et Échap
  // devenait muet. La carte est focalisable (tabindex=-1) et l'écoute vit au
  // niveau du document.
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Mentions légales", exact: true }).click();
  await expect(page.locator("#pgLegalPanel")).toBeVisible();
  await page.locator("#pgLegalBody p").first().click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pgLegalPanel")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("pgInput");
});

test("les textes du gate sont ceux de l'application, à l'octet près (source unique)", async ({ page }) => {
  await page.goto("/index.html");
  const depuisGate = {};
  for (const l of LEGAUX) {
    await page.getByRole("button", { name: l.bouton, exact: true }).click();
    await expect(page.locator("#pgLegalPanel")).toBeVisible();
    depuisGate[l.modale] = await page.locator("#pgLegalBody").innerHTML();
    await page.locator("#pgLegalClose").click();
  }
  // Puis on déverrouille et on ouvre les mêmes textes par les modales d'app-02.
  await page.locator("#pgInput").click();
  await page.keyboard.type(GATE_CODE);
  await expect(page.locator("#landing")).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(() => typeof openLegalNotice === "function" && typeof openModal === "function", null, { timeout: 15000 });
  for (const l of LEGAUX) {
    const html = await page.evaluate((fn) => {
      window[fn]();
      const corps = document.querySelector(".modal-backdrop.active #modalContent div[style*='max-height:55vh']");
      const h = corps ? corps.innerHTML : null;
      closeModal();
      return h;
    }, l.modale);
    expect(html, `${l.modale} : le corps de la modale`).not.toBeNull();
    expect(html.trim().length).toBeGreaterThan(500);
    expect(html.trim()).toBe(depuisGate[l.modale].trim());
  }
});
