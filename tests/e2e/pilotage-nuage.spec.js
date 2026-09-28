// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE NUAGE (2026-09-28) — la page téléphone /pilotage/, sans PC.
// La session (jeton sb-…) et la fonction `pilotage` sont SIMULÉES : rien ne
// part vers la production. On mesure : écran de connexion sans session, rendu
// d'un état au gabarit iPhone, titre d'enquête HOSTILE rendu en texte, refus
// 403 dit en clair, relance qui envoie la bonne cible.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { sansDonneesDistantes } = require("./app-helper");

const FONCTION = "**/functions/v1/pilotage";
const CHARGE = '<img src=x onerror="window.__pwn=1">';

function jwt(email) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: "11111111-1111-4111-8111-111111111111", email, role: "authenticated", exp: 4102444800 }) + ".sig";
}
async function poserSession(page, email = "passioadmin@gmail.com") {
  await page.addInitScript(([cle, jeton, email]) => {
    localStorage.setItem(cle, JSON.stringify({
      access_token: jeton, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
      user: { id: "11111111-1111-4111-8111-111111111111", email, aud: "authenticated", role: "authenticated" },
    }));
  }, ["sb-njkiyoklssvefstljemx-auth-token", jwt(email), email]);
}
const ETAT = {
  genereLe: new Date().toISOString(),
  verdict: { couleur: "orange", titre: "À surveiller", raisons: ["1 enquête(s) Sentinelle en cours"] },
  sante: { evenements15: 40, erreursJs15: 2, api5xx15: 0, erreurs24h: 3, principales: [{ message: CHARGE, n: 3, comptes: 1, dernier: new Date().toISOString() }] },
  utilisateurs: { total: 41, inscritsJour: 1, inscritsSemaine: 6, maintenant: { comptes: 2, appareils: 3 }, aujourdhui: { comptes: 9, appareils: 12 } },
  signalements: { ouverts: 0 },
  github: {
    issues: [{ numero: 12, titre: CHARGE, labels: ["sentinelle", "humain"], url: "javascript:alert(1)", depuis: new Date().toISOString(), pr: false },
      { numero: 13, titre: "fix: correctif", labels: [], url: "https://github.com/PASSIO74/passio-app/pull/13", depuis: new Date().toISOString(), pr: true }],
    runs: { sentinelle: { etat: "completed", conclusion: "success", le: new Date().toISOString(), url: "https://github.com/PASSIO74/passio-app/actions/runs/1" }, veille: null, deploy: { etat: "completed", conclusion: "success", le: new Date().toISOString(), url: null } },
  },
  relancesPossibles: [{ cle: "sentinelle", libelle: "Sentinelle" }],
  nonLus: [],
};

test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => { await sansDonneesDistantes(page); });

test("① sans session : écran de connexion, jamais l'application", async ({ page }) => {
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranConnexion")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
});

test("② état rendu, titre hostile en texte, lien non-GitHub refusé, aucune barre horizontale", async ({ page }) => {
  const soucis = [];
  page.on("pageerror", (e) => soucis.push(e.message));
  await poserSession(page);
  await page.route(FONCTION, (r) => r.fulfill({ json: ETAT }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("À surveiller");
  await expect(page.locator("#badgeAccueil")).toHaveText("1");
  expect(await page.textContent("#attente")).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('#attente a[href^="javascript"]').count()).toBe(0);
  for (const t of ["machines", "utilisateurs", "reglages", "accueil"]) {
    await page.click(`.barre button[data-tab="${t}"]`);
    await expect(page.locator("#" + t)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  expect(soucis).toEqual([]);
});

test("③ un autre compte reçoit le refus en clair", async ({ page }) => {
  await poserSession(page, "quelquun@exemple.fr");
  await page.route(FONCTION, (r) => r.fulfill({ status: 403, json: { error: "Réservé au compte de l'éditeur." } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranRefus")).toBeVisible();
  await expect(page.locator("#refusTexte")).toContainText("quelquun@exemple.fr");
});

test("④ relancer envoie la cible de la liste, avec le jeton de session", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await page.route(FONCTION, async (r) => {
    const corps = r.request().postDataJSON();
    envois.push({ corps, auth: r.request().headers().authorization || "" });
    await r.fulfill({ json: corps.action === "relancer" ? { ok: true } : ETAT });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/pilotage/");
  await page.click('.barre button[data-tab="machines"]');
  await page.click('#relances button:has-text("Lancer maintenant")');
  await expect(page.locator("#relances button")).toHaveText("Lancé ✓");
  const relance = envois.find((e) => e.corps.action === "relancer");
  expect(relance.corps).toEqual({ action: "relancer", cible: "sentinelle" });
  expect(relance.auth).toMatch(/^Bearer ey/);
});
