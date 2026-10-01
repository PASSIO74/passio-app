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
const MAINTENANT = new Date().toISOString();
const SERIE = [0, 1, 0, 2, 1, 0, 3].map((n, i) => ({ jour: "2026-09-2" + (2 + i), n }));
const ETAT = {
  genereLe: MAINTENANT,
  verdict: { couleur: "orange", titre: "À surveiller", raisons: ["1 enquête(s) Sentinelle en cours"] },
  disponibilite: { repond: true, depuis: MAINTENANT, veilleLe: MAINTENANT },
  sante: { evenements15: 40, erreursJs15: 2, api5xx15: 0, erreurs24h: 3, principales: [] },
  erreurs: { serie: SERIE, details: [{ message: CHARGE, n: 3, comptes: 1, plateformes: [{ nom: "Android", n: 3 }], pages: [{ nom: "/fil", n: 3 }], premier: MAINTENANT, dernier: MAINTENANT, serie: SERIE }] },
  utilisateurs: { total: 41, inscritsJour: 1, inscritsSemaine: 6, serieInscriptions: SERIE, maintenant: { comptes: 2, appareils: 3 }, aujourdhui: { comptes: 9, appareils: 12 } },
  signalements: { ouverts: 1, liste: [{ id: "rep_1", type: "post", motif: CHARGE, le: MAINTENANT }] },
  capacite: { mesuresServeur: true, jauges: [
    { cle: "connexions", libelle: "Connexions en direct (comptes)", valeur: 360, plafond: 500, unite: "", pct: 72, couleur: "orange", estimation: true },
    { cle: "base", libelle: "Base de données", valeur: 104857600, plafond: 8589934592, unite: "octets", pct: 1.2, couleur: "vert", estimation: false },
  ] },
  alertes: { appareils: 2, vapid: true },
  github: {
    issues: [{ numero: 12, titre: CHARGE, labels: ["sentinelle", "humain"], url: "javascript:alert(1)", depuis: MAINTENANT, pr: false, pause: false },
      { numero: 13, titre: "fix: correctif", labels: [], url: "https://github.com/PASSIO74/passio-app/pull/13", depuis: MAINTENANT, pr: true, pause: false }],
    runs: { sentinelle: { etat: "completed", conclusion: "success", le: MAINTENANT, url: "https://github.com/PASSIO74/passio-app/actions/runs/1" }, veille: null, deploy: { etat: "completed", conclusion: "success", le: MAINTENANT, url: null } },
    pause: false,
    aReparer: [],
  },
  relancesPossibles: [{ cle: "sentinelle", libelle: "Sentinelle" }],
  gestesGithub: true,
  nonLus: [],
};

/** Route la fonction : l'état pour « etat », { ok, message } pour tout geste, et garde les corps reçus. */
async function routerFonction(page, envois, etat = ETAT) {
  await page.route(FONCTION, async (r) => {
    const corps = r.request().postDataJSON();
    envois.push({ corps, auth: r.request().headers().authorization || "" });
    await r.fulfill({ json: corps.action === "etat" ? etat : { ok: true, message: "Fait (banc)." } });
  });
}

test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => { await sansDonneesDistantes(page); });

test("① sans session : écran de connexion, jamais l'application", async ({ page }) => {
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranConnexion")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
});

test("② état rendu, titres hostiles en texte, lien non-GitHub refusé, aucune barre horizontale", async ({ page }) => {
  const soucis = [];
  page.on("pageerror", (e) => soucis.push(e.message));
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("À surveiller");
  await expect(page.locator("#site")).toContainText("Le site répond");
  await expect(page.locator("#badgeAccueil")).toHaveText("1");
  await expect(page.locator("#badgeMachines")).toHaveText("1");
  expect(await page.textContent("#attente")).toContain(CHARGE);
  expect(await page.textContent("#erreurs")).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  for (const t of ["machines", "utilisateurs", "capacite", "reglages", "accueil"]) {
    await page.click(`.barre button[data-tab="${t}"]`);
    await expect(page.locator("#" + t)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  expect(await page.textContent("#signalements")).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  await expect(page.locator("#jauges")).toContainText("72 %");
  await expect(page.locator("#jauges")).toContainText("100 Mo sur 8 Go");
  await expect(page.locator("#alertes")).toContainText("2 appareil(s)");
  expect(soucis).toEqual([]);
});

test("③ un autre compte reçoit le refus en clair", async ({ page }) => {
  await poserSession(page, "quelquun@exemple.fr");
  await page.route(FONCTION, (r) => r.fulfill({ status: 403, json: { error: "Réservé au compte de l'éditeur." } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranRefus")).toBeVisible();
  await expect(page.locator("#refusTexte")).toContainText("quelquun@exemple.fr");
});

test("④ chaque geste envoie EXACTEMENT sa demande, avec le jeton, après confirmation", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerFonction(page, envois);
  page.on("dialog", (d) => d.accept());
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("À surveiller");
  const dernierGeste = () => envois.filter((e) => e.corps.action !== "etat").pop();

  await page.click('.barre button[data-tab="machines"]');
  await page.click('#prs button:has-text("Fusionner")');
  await expect(page.locator("#bandeauOk")).toContainText("Fait (banc).");
  expect(dernierGeste().corps).toEqual({ action: "fusionner", numero: 13 });
  expect(dernierGeste().auth).toMatch(/^Bearer ey/);

  await page.click('#prs button:has-text("Refuser")');
  await expect.poll(() => dernierGeste().corps).toEqual({ action: "fermer", numero: 13 });
  await page.click('#pause button:has-text("Mettre en pause")');
  await expect.poll(() => dernierGeste().corps).toEqual({ action: "pause" });
  await page.click('#relances button:has-text("Lancer maintenant")');
  await expect.poll(() => dernierGeste().corps).toEqual({ action: "relancer", cible: "sentinelle" });

  await page.click('.barre button[data-tab="utilisateurs"]');
  await page.click('#signalements button:has-text("Rejeter")');
  await expect.poll(() => dernierGeste().corps).toEqual({ action: "signalement", id: "rep_1", statut: "dismissed" });
});

test("⑤ un geste refusé à la confirmation n'envoie rien", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerFonction(page, envois);
  page.on("dialog", (d) => d.dismiss());
  await page.goto("/pilotage/");
  await page.click('.barre button[data-tab="machines"]');
  await page.click('#prs button:has-text("Fusionner")');
  await page.waitForTimeout(300);
  expect(envois.filter((e) => e.corps.action !== "etat")).toEqual([]);
});

test("⑥ sans jeton GitHub : aucun bouton de geste GitHub, l'explication à la place", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], { ...ETAT, gestesGithub: false, relancesPossibles: [] });
  await page.goto("/pilotage/");
  await page.click('.barre button[data-tab="machines"]');
  await expect(page.locator("#relances")).toContainText("PILOTAGE_GITHUB_TOKEN");
  expect(await page.locator('#prs button, #pause button, #attente button').count()).toBe(0);
});

test("⑦ site injoignable : dit en tête d'accueil", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], { ...ETAT, disponibilite: { repond: false, depuis: MAINTENANT, veilleLe: MAINTENANT }, verdict: { couleur: "rouge", titre: "Problème en cours", raisons: ["le site ne répond pas"] } });
  await page.goto("/pilotage/");
  await expect(page.locator("#site")).toContainText("Le site ne répond pas");
  await expect(page.locator("#verdict")).toHaveClass(/rouge/);
});

test("⑧ « Réparer » : bloc sous le voyant, bouton sur l'enquête et sur l'exécution, demande exacte ; masqué sans problème ni jeton", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  const gh = {
    ...ETAT.github,
    issues: [{ numero: 556, titre: "[VEILLE] 2 alerte(s) : flux, deploiement", labels: ["veille"], url: "https://github.com/PASSIO74/passio-app/issues/556", depuis: MAINTENANT, pr: false, pause: false },
      { numero: 600, titre: "[RÉPARER] #12", labels: ["reparation"], url: "https://github.com/PASSIO74/passio-app/issues/600", depuis: MAINTENANT, pr: false, pause: false }],
    runs: { ...ETAT.github.runs, deploy: { etat: "completed", conclusion: "failure", le: MAINTENANT, url: "https://github.com/PASSIO74/passio-app/actions/runs/9" } },
    aReparer: [
      { cible: "issue", numero: 556, libelle: "#556 · [VEILLE] 2 alerte(s)", url: "https://github.com/PASSIO74/passio-app/issues/556", enCours: null },
      { cible: "run", cle: "deploy", libelle: "Déploiement en échec", url: "https://github.com/PASSIO74/passio-app/actions/runs/9", enCours: null },
      { cible: "issue", numero: 12, libelle: CHARGE, url: "javascript:alert(1)", enCours: 600 },
    ],
  };
  await routerFonction(page, envois, { ...ETAT, github: gh, verdict: { couleur: "rouge", titre: "Problème en cours", raisons: ["dernier déploiement en échec"] } });
  page.on("dialog", (d) => d.accept());
  await page.goto("/pilotage/");
  await expect(page.locator("#blocReparer")).toBeVisible();
  await expect(page.locator("#reparer button:has-text('Réparer')")).toHaveCount(2);
  await expect(page.locator("#reparer")).toContainText("Réparation en cours : #600");
  expect(await page.textContent("#reparer")).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  const dernierGeste = () => envois.filter((e) => e.corps.action !== "etat").pop();

  await page.click("#reparer article:nth-child(2) button:has-text('Réparer')");
  await expect.poll(() => dernierGeste() && dernierGeste().corps).toEqual({ action: "reparer", cible: "run", cle: "deploy" });
  await page.click("#attente button:has-text('Réparer')");
  await expect.poll(() => dernierGeste().corps).toEqual({ action: "reparer", cible: "issue", numero: 556 });
  await page.click('.barre button[data-tab="machines"]');
  await page.click("#runs button:has-text('Réparer')");
  await expect.poll(() => envois.filter((e) => e.corps.action === "reparer").length).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("⑨ « Réparer » absent quand rien n'est à réparer, ou sans jeton GitHub", async ({ page }) => {
  await poserSession(page);
  const aReparer = [{ cible: "run", cle: "deploy", libelle: "Déploiement en échec", url: null, enCours: null }];
  await routerFonction(page, [], { ...ETAT, gestesGithub: false, relancesPossibles: [], github: { ...ETAT.github, aReparer } });
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("À surveiller");
  await expect(page.locator("#blocReparer")).toBeHidden();
  expect(await page.locator("button:has-text('Réparer')").count()).toBe(0);
});
