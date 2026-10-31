// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE NUAGE (2026-09-28, simplifié le 2026-10-23) — la page /pilotage/,
// LE centre de pilotage, sans PC. Trois onglets : Accueil (voyant, « À faire »,
// chiffres clés), Détails, Réglages.
// La session (jeton sb-…) et la fonction `pilotage` sont SIMULÉES : rien ne
// part vers la production. La liste « À faire » du faux état est construite par
// la VRAIE fonction `aFaire` (_shared/pilotage.js) : la page est éprouvée sur
// ce que le serveur rend, pas sur une copie à la main.
// On mesure : écran de connexion sans session, rendu au gabarit iPhone, textes
// HOSTILES rendus en texte, refus 403 dit en clair, chaque geste envoie
// EXACTEMENT sa demande, données périmées dites, jamais de faux « rien à faire ».
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
const IL_Y_A_3H = new Date(Date.now() - 3 * 3600e3).toISOString();
const SERIE = [0, 1, 0, 2, 1, 0, 3].map((n, i) => ({ jour: "2026-09-2" + (2 + i), n }));
const GH = {
  issues: [{ numero: 12, titre: CHARGE, labels: ["sentinelle", "humain"], url: "javascript:alert(1)", depuis: MAINTENANT, pr: false, pause: false },
    { numero: 13, titre: "fix: correctif", labels: [], url: "https://github.com/PASSIO74/passio-app/pull/13", depuis: MAINTENANT, pr: true, pause: false }],
  runs: { sentinelle: { etat: "completed", conclusion: "success", le: MAINTENANT, url: "https://github.com/PASSIO74/passio-app/actions/runs/1" }, veille: null, deploy: { etat: "completed", conclusion: "success", le: IL_Y_A_3H, url: null } },
  pause: false,
  aReparer: [{ cible: "issue", numero: 12, libelle: "#12 · " + CHARGE, url: null, enCours: null }],
  luLe: MAINTENANT,
};
const BASE = {
  genereLe: MAINTENANT,
  verdict: { couleur: "rouge", titre: "Problème en cours", raisons: ["1 sujet(s) qui t'attendent"] },
  disponibilite: { repond: true, depuis: MAINTENANT, veilleLe: MAINTENANT },
  sante: { evenements15: 40, erreursJs15: 2, api5xx15: 0, erreurs24h: 3, principales: [] },
  erreurs: { serie: SERIE, total7: 7, total7Prec: 2, details: [{ message: CHARGE, n: 3, comptes: 1, plateformes: [{ nom: "Android", n: 3 }], pages: [{ nom: "/fil", n: 3 }], premier: MAINTENANT, dernier: MAINTENANT, serie: SERIE }] },
  utilisateurs: { total: 41, inscritsJour: 1, inscritsSemaine: 6, inscritsSemainePrec: 4, serieInscriptions: SERIE, maintenant: { comptes: 2, appareils: 3 }, aujourdhui: { comptes: 9, appareils: 12, horsPublic: 4 } },
  activation: { cohorte: 4, mures: 3, activesMures: 1, taux: 33, enCours: 1, enCoursActives: 0, premiers: { message: 1 }, jours: 7, cohorteJours: 30, crees: 6, echantillon: null,
    // Les comptes créés, par leur NOM (2026-10-23) — tels que comptesRecents les rend.
    nouveaux: [
      { nom: CHARGE, nomLu: true, cree: MAINTENANT, confirme: false, voie: "e-mail", actif: null },
      { nom: "Léa", nomLu: true, cree: IL_Y_A_3H, confirme: true, voie: "Google", actif: true },
      { nom: null, nomLu: true, cree: IL_Y_A_3H, confirme: true, voie: "e-mail", actif: false },
      { nom: "Sam", nomLu: true, cree: IL_Y_A_3H, confirme: true, voie: "Google", actif: false },
      { nom: "Jo", nomLu: true, cree: IL_Y_A_3H, confirme: true, voie: "e-mail", actif: false },
      { nom: "Ana", nomLu: true, cree: IL_Y_A_3H, confirme: true, voie: "e-mail", actif: false },
      { nom: "Tom", nomLu: true, cree: IL_Y_A_3H, confirme: true, voie: "e-mail", actif: false },
    ],
    // Le total des inscrits (2026-10-24), toutes dates.
    inscrits: { total: 13, tronque: false } },
  tendances: { inscriptions: { actuel: 6, precedent: 4, delta: 2, sens: "hausse", bon: true, pct: 50 }, erreurs: { actuel: 7, precedent: 2, delta: 5, sens: "hausse", bon: false, pct: 250 } },
  miseEnLigne: { le: IL_Y_A_3H, etat: "ok", dureeMs: 3 * 3600e3, apres: 1, avant: 4, tendance: null },
  signalements: { ouverts: 1, liste: [{ id: "rep_1", type: "post", motif: CHARGE, le: MAINTENANT }] },
  capacite: { mesuresServeur: true, jauges: [
    { cle: "connexions", libelle: "Connexions en direct (comptes)", valeur: 360, plafond: 500, unite: "", pct: 72, couleur: "orange", estimation: true },
    { cle: "base", libelle: "Base de données", valeur: 104857600, plafond: 8589934592, unite: "octets", pct: 1.2, couleur: "vert", estimation: false },
  ] },
  alertes: { appareils: 2, vapid: true },
  historique: [{ le: MAINTENANT, couleur: "orange", dispo: true, raisons: ["la veille signale un problème"] }],
  github: GH,
  relancesPossibles: [{ cle: "sentinelle", libelle: "Sentinelle" }],
  gestesGithub: true,
  autonomie: { reveilSentinelle: true, retour: { mode: "inactif", jeton: false, proposition: null } },
  nonLus: [],
  erreursLecture: {},
};

// La liste « À faire » est celle que la fonction construirait (vraie fonction).
let aFaire;
test.beforeAll(async () => { ({ aFaire } = await import("../../supabase/functions/_shared/pilotage.js")); });
/** Un état complet : la base, des surcharges, et sa liste « À faire » recalculée. */
function etat(extra = {}) {
  const e = { ...BASE, ...extra };
  if (!("aFaire" in extra)) e.aFaire = aFaire(e);
  return e;
}

/** Route la fonction : l'état pour « etat », { ok, message } pour tout geste, et garde les corps reçus. */
async function routerFonction(page, envois, e = etat(), reponses = {}) {
  await page.route(FONCTION, async (r) => {
    const corps = r.request().postDataJSON();
    envois.push({ corps, auth: r.request().headers().authorization || "" });
    await r.fulfill({ json: corps.action === "etat" ? e : reponses[corps.action] || { ok: true, message: "Fait (banc)." } });
  });
}
const sansBarreHorizontale = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const gestes = (envois) => envois.filter((e) => e.corps.action !== "etat");

test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => { await sansDonneesDistantes(page); });

test("① sans session : écran de connexion, jamais l'application", async ({ page }) => {
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranConnexion")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
});

test("② Accueil : voyant, « À faire » en texte, chiffres et tendances ; trois onglets sans barre horizontale", async ({ page }) => {
  const soucis = [];
  page.on("pageerror", (e) => soucis.push(e.message));
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("Problème en cours");
  // « À faire » : l'issue « À toi », le correctif, le signalement, l'erreur du
  // jour et la jauge orange (connexions à 72 %) — les textes de tiers en TEXTE.
  const af = page.locator("#afaire");
  await expect(af.locator("article")).toHaveCount(5);
  await expect(af).toContainText("Connexions en direct (comptes)");
  expect(await af.textContent()).toContain("#12 · " + CHARGE);
  await expect(af).toContainText("#13 · fix: correctif");
  await expect(af).toContainText("Signalement · post");
  await expect(af).toContainText("« " + CHARGE + " »");
  await expect(page.locator("#badgeAccueil")).toHaveText("5");
  await expect(page.locator("#nbAFaire")).toHaveText("5");
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  await expect(af.locator("article").first()).toContainText("À toi");
  // Chiffres clés et tendances.
  const ch = page.locator("#chiffres");
  await expect(ch).toContainText("en ligne maintenant");
  await expect(ch).toContainText("2 compte(s) connecté(s)");
  await expect(ch).toContainText("▲ +2 vs 7 j d'avant");
  await expect(ch.locator(".tendance.bon").first()).toContainText("+2");
  await expect(ch.locator(".tendance.bon").last(), "moins d'erreurs depuis la mise en ligne qu'avant : bonne nouvelle").toContainText("4 sur les 3 h d'avant");
  await expect(ch.locator(".tendance.mauvais").first()).toContainText("+5");
  await expect(ch).toContainText("33 %");
  await expect(ch).toContainText("erreurs depuis la mise en ligne");
  await expect(ch).toContainText("4 sur les 3 h d'avant");
  await expect(page.locator("#pourInfoRepli")).toBeHidden();
  for (const t of ["details", "reglages", "accueil"]) {
    await page.click(`.barre button[data-tab="${t}"]`);
    await expect(page.locator("#" + t)).toBeVisible();
    expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  }
  expect(soucis).toEqual([]);
});

test("③ Détails : erreurs, activation et entonnoir, machines, capacité, historique", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await page.click('.barre button[data-tab="details"]');
  await expect(page.locator("#site")).toContainText("Le site répond");
  expect(await page.textContent("#erreurs")).toContain(CHARGE);
  // Activation (2026-10-06) : taux sur les comptes MÛRS, les jeunes à part, et ce qui active.
  await expect(page.locator("#activation")).toContainText("33 %");
  await expect(page.locator("#activation")).toContainText("1 / 3");
  await expect(page.locator("#activation")).toContainText("de moins de 7 j");
  await expect(page.locator("#activationPremiers")).toHaveText("Premier geste des comptes activés : message 1");
  await expect(page.locator("#entonnoir")).toContainText("comptes créés");
  await expect(page.locator("#entonnoir")).toContainText("2 compte(s) n'ont jamais confirmé leur e-mail.");
  await expect(page.locator("#maintenant")).toContainText("robots / équipe 24 h (non comptés)");
  await expect(page.locator("#runs")).toContainText("Mise en ligne (déploiement)");
  await expect(page.locator("#runs")).toContainText(/GitHub lu (à l'instant|il y a \d+ min)/);
  await expect(page.locator("#jauges")).toContainText("72 %");
  await expect(page.locator("#jauges")).toContainText("100 Mo sur 8 Go");
  await expect(page.locator("#historique")).toContainText("À surveiller");
  await expect(page.locator("#historique")).toContainText("la veille signale un problème");
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  await page.click('.barre button[data-tab="reglages"]');
  await expect(page.locator("#alertes")).toContainText("2 appareil(s)");
});

test("④ un autre compte reçoit le refus en clair", async ({ page }) => {
  await poserSession(page, "quelquun@exemple.fr");
  await page.route(FONCTION, (r) => r.fulfill({ status: 403, json: { error: "Réservé au compte de l'éditeur." } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranRefus")).toBeVisible();
  await expect(page.locator("#refusTexte")).toContainText("quelquun@exemple.fr");
});

test("⑤ partie illisible : « Non lu » avec sa raison, jamais un faux 0 %", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ activation: null, nonLus: ["activation"], erreursLecture: { activation: "HTTP 500" } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#chiffres")).toContainText("nouveaux comptes activés");
  await page.click('.barre button[data-tab="details"]');
  await expect(page.locator("#activation")).toContainText("Non lu");
  await expect(page.locator("#activation")).toContainText("HTTP 500");
  await expect(page.locator("#activation")).not.toContainText("%");
  await expect(page.locator("#activationPremiers")).toBeHidden();
  await page.click('.barre button[data-tab="accueil"]');
  await expect(page.locator("#nouveauxComptes")).toContainText("Non lu");
  await expect(page.locator("#nouveauxComptes")).toContainText("HTTP 500");
});

test("⑥ chaque geste envoie EXACTEMENT sa demande, avec le jeton, après confirmation", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerFonction(page, envois);
  page.on("dialog", (d) => d.accept());
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("Problème en cours");
  const af = page.locator("#afaire");
  await af.locator("article", { hasText: "fix: correctif" }).locator("button", { hasText: "Fusionner" }).click();
  await expect(page.locator("#bandeauOk")).toContainText("Fait (banc).");
  expect(gestes(envois).pop().corps).toEqual({ action: "fusionner", numero: 13 });
  expect(gestes(envois).pop().auth).toMatch(/^Bearer ey/);
  await af.locator("article", { hasText: "fix: correctif" }).locator("button", { hasText: "Refuser" }).click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "fermer", numero: 13 });
  await af.locator("article", { hasText: "#12" }).locator("button", { hasText: "Réparer" }).click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "reparer", cible: "issue", numero: 12 });
  await af.locator("article", { hasText: "#12" }).locator("button", { hasText: "Fermer" }).click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "fermer", numero: 12 });
  await af.locator("article", { hasText: "Signalement" }).locator("button", { hasText: "Rejeter" }).click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "signalement", id: "rep_1", statut: "dismissed" });
  // L'erreur du jour : une enquête est ouverte (#12 est « sentinelle ») → pas de relance proposée.
  await expect(af.locator("article", { hasText: "3 fois" }).locator("button")).toHaveCount(0);

  await page.click('.barre button[data-tab="details"]');
  await page.click('#pause button:has-text("Mettre en pause")');
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "pause" });
  await page.click('#relances button:has-text("Lancer maintenant")');
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "relancer", cible: "sentinelle" });
});

test("⑦ un geste refusé à la confirmation n'envoie rien", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerFonction(page, envois);
  page.on("dialog", (d) => d.dismiss());
  await page.goto("/pilotage/");
  await page.locator("#afaire button", { hasText: "Fusionner" }).click();
  await page.waitForTimeout(300);
  expect(gestes(envois)).toEqual([]);
});

test("⑧ sans jeton GitHub : aucun geste GitHub, le réglage à faire est dit", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ gestesGithub: false, relancesPossibles: [] }));
  await page.goto("/pilotage/");
  await expect(page.locator("#afaire button", { hasText: /Fusionner|Refuser|Réparer|Fermer|Sentinelle/ })).toHaveCount(0);
  await expect(page.locator("#pourInfoRepli")).toBeVisible();
  await expect(page.locator("#pourInfoTitre")).toContainText("Pour info (1)");
  await page.click("#pourInfoTitre");
  await expect(page.locator("#pourInfo")).toContainText("PILOTAGE_GITHUB_TOKEN");
  await page.click('.barre button[data-tab="details"]');
  await expect(page.locator("#relances")).toContainText("PILOTAGE_GITHUB_TOKEN");
  expect(await page.locator("#pause button, #relances button").count()).toBe(0);
});

test("⑨ site injoignable : voyant rouge, en tête de « À faire » et dans Détails", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ disponibilite: { repond: false, depuis: MAINTENANT, veilleLe: MAINTENANT }, verdict: { couleur: "rouge", titre: "Problème en cours", raisons: ["le site ne répond pas"] } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdict")).toHaveClass(/rouge/);
  await expect(page.locator("#afaire article").first()).toContainText("Le site ne répond pas");
  await page.click('.barre button[data-tab="details"]');
  await expect(page.locator("#site")).toContainText("Le site ne répond pas");
});

test("⑩ « Réparer » : sur l'exécution en échec et sur l'enquête, demande exacte ; « en cours » dit sans second bouton", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  const gh = {
    ...GH,
    issues: [{ numero: 556, titre: "[VEILLE] 2 alerte(s) : flux, deploiement", labels: ["veille"], url: "https://github.com/PASSIO74/passio-app/issues/556", depuis: MAINTENANT, pr: false, pause: false },
      { numero: 600, titre: "[RÉPARER] #12", labels: ["reparation", "claude"], url: "https://github.com/PASSIO74/passio-app/issues/600", depuis: MAINTENANT, pr: false, pause: false },
      { numero: 12, titre: CHARGE, labels: ["humain"], url: "javascript:alert(1)", depuis: MAINTENANT, pr: false, pause: false }],
    runs: { ...GH.runs, deploy: { etat: "completed", conclusion: "failure", le: MAINTENANT, url: "https://github.com/PASSIO74/passio-app/actions/runs/9" } },
    aReparer: [
      { cible: "issue", numero: 556, libelle: "#556 · [VEILLE] 2 alerte(s)", url: "https://github.com/PASSIO74/passio-app/issues/556", enCours: null },
      { cible: "run", cle: "deploy", libelle: "Déploiement en échec", url: "https://github.com/PASSIO74/passio-app/actions/runs/9", enCours: null },
      { cible: "issue", numero: 12, libelle: CHARGE, url: "javascript:alert(1)", enCours: 600 },
    ],
  };
  await routerFonction(page, envois, etat({ github: gh, signalements: { ouverts: 0, liste: [] }, miseEnLigne: { le: null, etat: "failure" } }));
  page.on("dialog", (d) => d.accept());
  await page.goto("/pilotage/");
  const af = page.locator("#afaire");
  const run = af.locator("article", { hasText: "Déploiement en échec" });
  await expect(run).toContainText("En échec");
  await expect(run.locator("a")).toHaveAttribute("href", "https://github.com/PASSIO74/passio-app/actions/runs/9");
  const humain = af.locator("article", { hasText: "#12" });
  await expect(humain).toContainText("Réparation demandée : #600");
  await expect(humain.locator("button", { hasText: "Réparer" })).toHaveCount(0);
  expect(await humain.textContent()).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  await expect(page.locator("#chiffres")).toContainText("Échec");
  await run.locator("button", { hasText: "Réparer" }).click();
  await expect.poll(() => gestes(envois).pop()?.corps).toEqual({ action: "reparer", cible: "run", cle: "deploy" });
  await af.locator("article", { hasText: "#556" }).locator("button", { hasText: "Réparer" }).click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "reparer", cible: "issue", numero: 556 });
  // La réparation ouverte est « pour info » : elle n'appelle aucun geste.
  await page.click("#pourInfoTitre");
  await expect(page.locator("#pourInfo")).toContainText("[RÉPARER] #12");
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
});

test("⑪ « À faire » vide : « Rien à faire », sans badge ; liste absente (fonction pas à jour) : jamais un faux « rien à faire »", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ aFaire: [] }));
  await page.goto("/pilotage/");
  await expect(page.locator("#afaire")).toContainText("Rien à faire");
  await expect(page.locator("#badgeAccueil")).toBeHidden();
  await page.unroute(FONCTION);
  const ancien = etat(); delete ancien.aFaire;
  await routerFonction(page, [], ancien);
  await page.click("#actualiser");
  await expect(page.locator("#afaire")).toContainText("Liste indisponible");
  await expect(page.locator("#afaire")).not.toContainText("Rien à faire");
  await expect(page.locator("#badgeAccueil")).toBeHidden();
});

test("⑫ GitHub illisible : voyant orange qui le nomme, raison dans « À faire » et dans Détails", async ({ page }) => {
  await poserSession(page);
  const raison = "GitHub HTTP 403 (limite de lecture atteinte, pas de jeton)";
  await routerFonction(page, [], etat({ github: null, nonLus: ["github"], erreursLecture: { github: raison },
    verdict: { couleur: "orange", titre: "À surveiller", raisons: ["non lu : GitHub (enquêtes, mises en ligne)"], incomplet: true }, miseEnLigne: { le: null, etat: "inconnu" } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdict")).toHaveClass(/orange/);
  await expect(page.locator("#verdictDetail")).toContainText("non lu : GitHub");
  await expect(page.locator("#afaire")).toContainText("GitHub n'a pas pu être lu");
  await expect(page.locator("#afaire")).toContainText("HTTP 403");
  await expect(page.locator("#chiffres")).toContainText("date de mise en ligne inconnue");
  await page.click('.barre button[data-tab="details"]');
  await expect(page.locator("#runs")).toContainText("Non lu");
  await expect(page.locator("#runs")).toContainText("HTTP 403");
});

test("⑬ données périmées : une lecture échoue, l'écran le dit et grise le voyant", async ({ page }) => {
  await page.clock.install();
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("Problème en cours");
  await expect(page.locator("#perime")).toBeHidden();
  await page.unroute(FONCTION);
  await page.route(FONCTION, (r) => r.fulfill({ status: 500, json: { error: "panne (banc)" } }));
  await page.clock.fastForward("04:00");
  await expect(page.locator("#perime")).toBeVisible();
  await expect(page.locator("#perime")).toContainText("la dernière lecture a échoué");
  await expect(page.locator("#verdict")).toHaveClass(/perime/);
  await expect(page.locator("#bandeauErreur")).toContainText("panne (banc)");
});

// ─── Protection automatique (2026-10-11) : les réglages distants ─────────────
const REGLAGES = {
  absente: false,
  delestage: { niveau: 1, pose_par: "veille", maj: MAINTENANT, motif: "Délestage automatique : connexions temps réel à 84 %" },
  coupures: { cles: ["passio_invitations_v1"], maj: MAINTENANT },
  bandeau: { texte: CHARGE, niveau: "alerte", maj: MAINTENANT },
  coupuresPossibles: ["passio_invitations_v1", "passio_recap_semaine", "passio_ui_8"],
};

test("⑭ Protection : état lu, textes hostiles en texte, chaque geste envoie EXACTEMENT sa demande", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerFonction(page, envois, etat({ reglages: REGLAGES }));
  page.on("dialog", (d) => d.accept());
  await page.goto("/pilotage/");
  // La protection active est dite « pour info » sur l'accueil.
  await page.click("#pourInfoTitre");
  await expect(page.locator("#pourInfo")).toContainText("L'app est ralentie pour tenir la charge");
  expect(await page.textContent("#pourInfo")).toContain(CHARGE);
  await page.click('.barre button[data-tab="reglages"]');
  const p = page.locator("#protection");
  await expect(p).toContainText("Délestage : Économie (×2)");
  await expect(p).toContainText("posé par la veille");
  await expect(p).toContainText("Invitations (passio_invitations_v1)");
  expect(await p.textContent()).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  const champ = await page.locator("#bandeauTexte").boundingBox();
  expect(champ.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator("#bandeauTexte").evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);

  // Chaque geste réussi relit l'état et REPEINT le panneau (champs compris) :
  // on attend ce repeint avant le geste suivant, comme le ferait un doigt.
  const nEtats = () => envois.filter((e) => e.corps.action === "etat").length;
  async function faire(bouton, attendu) {
    const e0 = nEtats(), g0 = gestes(envois).length;
    await p.locator("button", { hasText: bouton }).click();
    await expect.poll(() => gestes(envois).length).toBe(g0 + 1);
    expect(gestes(envois).pop().corps).toEqual(attendu);
    await expect.poll(nEtats).toBeGreaterThan(e0);
    await expect(page.locator("#actualiser")).not.toHaveClass(/tourne/);
  }
  await faire("Survie (×4)", { action: "reglages", cle: "delestage", valeur: { niveau: 2 } });
  await faire("Rallumer : Invitations", { action: "reglages", cle: "coupures", valeur: { cles: [] } });
  await page.selectOption("#coupureChoix", "passio_ui_8");
  await faire("Couper chez tout le monde", { action: "reglages", cle: "coupures", valeur: { cles: ["passio_invitations_v1", "passio_ui_8"] } });
  await faire("Retirer le message", { action: "reglages", cle: "bandeau", valeur: null });
  const n = gestes(envois).length;
  await p.locator("button", { hasText: "Afficher à tous" }).click();
  await expect(page.locator("#bandeauErreur")).toContainText("Écris d'abord le message.");
  expect(gestes(envois).length, "un message vide n'est pas envoyé").toBe(n);
  await page.fill("#bandeauTexte", "Maintenance à 22 h");
  await page.selectOption("#bandeauNiveau", "info");
  await faire("Afficher à tous", { action: "reglages", cle: "bandeau", valeur: { texte: "Maintenance à 22 h", niveau: "info" } });
});

test("⑮ Protection : délestage manuel → « Rendre à l'automatique » ; table absente → la migration est nommée", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerFonction(page, envois, etat({ reglages: { ...REGLAGES, delestage: { niveau: 2, pose_par: "pilote", maj: MAINTENANT, motif: null } } }));
  page.on("dialog", (d) => d.accept());
  await page.goto("/pilotage/");
  await page.click('.barre button[data-tab="reglages"]');
  const p = page.locator("#protection");
  await expect(p).toContainText("Manuel");
  await expect(p.locator("button", { hasText: "Survie (×4)" }), "le niveau déjà posé à la main n'a pas de bouton").toHaveCount(0);
  await p.locator("button", { hasText: "Rendre à l'automatique" }).click();
  await expect.poll(() => gestes(envois).pop()?.corps).toEqual({ action: "reglages", cle: "delestage", valeur: null });

  await page.unroute(FONCTION);
  await routerFonction(page, [], etat({ reglages: { absente: true, migration: "migrations/migration_reglages_distants_2026-10-11.sql", coupuresPossibles: [] } }));
  await page.click("#actualiser");
  await expect(p).toContainText("Pas encore allumée");
  await expect(p).toContainText("migration_reglages_distants_2026-10-11.sql");
  await expect(p.locator("article", { hasText: "Pas encore allumée" }).locator("button")).toHaveCount(0);
});

test("⑯ Retour arrière : la proposition est EN TÊTE de « À faire » ; aperçu, UNE confirmation qui nomme les deux versions, puis le geste", async ({ page }) => {
  await poserSession(page);
  const envois = [], dialogues = [];
  await routerFonction(page, envois, etat({ reglages: REGLAGES }));
  page.on("dialog", (d) => { dialogues.push(d.message()); d.accept(); });
  await page.goto("/pilotage/");
  await page.click('.barre button[data-tab="reglages"]');
  const p = page.locator("#protection");
  await expect(p.locator("article", { hasText: "Réveil de la Sentinelle" })).toContainText("Actif");
  const eteint = p.locator("article", { hasText: "Retour arrière" });
  await expect(eteint).toContainText("Éteint");
  await expect(eteint).toContainText("PILOTAGE_NETLIFY_TOKEN");
  await expect(eteint.locator("button")).toHaveCount(0);
  await page.unroute(FONCTION);
  // Une proposition dont l'échec est un texte HOSTILE (écrit par un navigateur) : rendu en texte.
  const famille = "error:<img src=x onerror=alert(1)> TypeError";
  const APERCU = { ok: true, courant: { commit: "aaaa1111", publie: "2026-10-13T09:00:00Z" }, cible: { id: "6eca16aa0123456789abcdef", commit: "bbbb2222", publie: "2026-10-12T18:00:00Z" } };
  await routerFonction(page, envois, etat({ reglages: REGLAGES, autonomie: { reveilSentinelle: false,
    retour: { mode: "proposer", jeton: true, proposition: { le: new Date().toISOString(), version: "aaaa1111", comptes: 6, empreinte: "0badf00d", famille } } } }),
    { retour_apercu: APERCU });
  await page.click("#actualiser");
  await expect(p.locator("article", { hasText: "Retour arrière" })).toContainText("Proposé");
  await expect(p).toContainText("Jamais seul");
  await expect(p.locator("article", { hasText: "Réveil de la Sentinelle" })).toContainText("PILOTAGE_GITHUB_TOKEN");
  await page.click('.barre button[data-tab="accueil"]');
  const decision = page.locator("#afaire article").first();
  await expect(decision).toContainText("À décider");
  await expect(decision).toContainText("aaaa1111");
  await expect(decision).toContainText("6 comptes");
  await expect(decision).toContainText(famille);
  await expect(decision.locator("img")).toHaveCount(0);
  await decision.locator("button", { hasText: "Remettre la version précédente" }).click();
  // D'abord l'aperçu, puis UNE confirmation qui nomme les deux versions, puis le geste avec la cible de l'aperçu.
  await expect.poll(() => gestes(envois).pop()?.corps).toEqual({ action: "retour_arriere", cible: "6eca16aa0123456789abcdef" });
  expect(gestes(envois).map((e) => e.corps.action)).toEqual(["retour_apercu", "retour_arriere"]);
  expect(dialogues).toHaveLength(1);
  expect(dialogues[0]).toContain("bbbb2222");
  expect(dialogues[0]).toContain("aaaa1111");
});

test("⑰ Nouveaux comptes : les NOMS des comptes créés, en texte — 5 sur l'accueil ; Détails mène à la liste complète", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  const acc = page.locator("#nouveauxComptes");
  await expect(acc.locator("li.compte")).toHaveCount(5);
  expect(await acc.textContent()).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  await expect(acc.locator("img")).toHaveCount(0);
  await expect(acc).toContainText("Léa");
  await expect(acc.locator("li.compte").first()).toContainText("e-mail pas encore confirmé");
  await expect(acc.locator("li.compte", { hasText: "Léa" })).toContainText("par Google");
  await expect(acc.locator("li.compte", { hasText: "Léa" })).toContainText("a fait un geste");
  await expect(acc).toContainText("Profil pas encore rempli");
  await expect(acc).not.toContainText("Tom");
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  // Détails : l'accès à la liste complète (elle se lit à la demande).
  await page.click('.barre button[data-tab="details"]');
  await expect(page.locator("#comptesCrees")).toContainText("Tous les inscrits");
  await expect(page.locator("#comptesCrees button", { hasText: "Voir les 13 inscrits" })).toBeVisible();
  await expect(page.locator("#comptes")).toContainText("inscrits au total");
  await expect(page.locator("#comptes")).toContainText("13");
});

// ─── Tous les inscrits (2026-10-24) ─────────────────────────────────────────
// La tuile « inscrits au total » de l'accueil ouvre la liste de TOUS les
// inscrits, par leur nom, une page de 100 à la fois (action `inscrits`).
function pageInscritsBanc(total, page, parPage = 100) {
  const pages = Math.max(1, Math.ceil(total / parPage));
  const debut = (page - 1) * parPage;
  const comptes = Array.from({ length: Math.max(0, Math.min(parPage, total - debut)) }, (_, i) => {
    const k = debut + i + 1;
    return { nom: k === 1 ? CHARGE : "Membre " + k, nomLu: true, cree: new Date(Date.now() - k * 3600e3).toISOString(), confirme: k !== 2, voie: k % 2 ? "e-mail" : "Google", actif: null };
  });
  return { total, tronque: false, page, pages, parPage, comptes };
}
async function routerAvecInscrits(page, envois, total, { echecs = 0 } = {}) {
  let restants = echecs;
  await page.route(FONCTION, async (r) => {
    const corps = r.request().postDataJSON();
    envois.push({ corps, auth: r.request().headers().authorization || "" });
    if (corps.action === "inscrits") {
      if (restants > 0) { restants--; await r.fulfill({ status: 502, json: { error: "Comptes illisibles : délai dépassé (banc)" } }); return; }
      await r.fulfill({ json: pageInscritsBanc(total, Number(corps.page) || 1) });
      return;
    }
    await r.fulfill({ json: corps.action === "etat" ? etat({ activation: { ...BASE.activation, inscrits: { total, tronque: false } } }) : { ok: true, message: "Fait (banc)." } });
  });
}

test("⑲ « inscrits au total » : la tuile de l'accueil ouvre TOUS les inscrits, par leur nom, page par page, en texte", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerAvecInscrits(page, envois, 150);
  await page.goto("/pilotage/");
  // Juste sous le voyant, avant « À faire » : visible dès l'ouverture.
  const tuile = page.locator("#tuileInscrits button.chiffre-bouton");
  // boundingBox() n'attend rien : mesurer avant le rendu de l'état rendait
  // `null` une fois sur deux (CI #666, 2026-10-31). On attend les deux nœuds.
  await expect(tuile).toBeVisible();
  await expect(page.locator("#afaire")).toBeVisible();
  const [yTuile, yAFaire] = await Promise.all([tuile.boundingBox(), page.locator("#afaire").boundingBox()]).then((b) => b.map((x) => x && x.y));
  expect(yTuile).toBeLessThan(yAFaire);
  expect(yTuile, "visible sans faire défiler, au gabarit iPhone").toBeLessThan(780);
  await expect(tuile).toContainText("150");
  await expect(tuile).toContainText("inscrits au total");
  expect(envois.filter((e) => e.corps.action === "inscrits"), "la liste ne se lit qu'au toucher").toHaveLength(0);
  await tuile.click();
  await expect(page.locator("#inscrits")).toBeVisible();
  await expect(page.locator("#titreOnglet")).toHaveText("Inscrits");
  const liste = page.locator("#inscritsListe");
  await expect(liste.locator("li.compte")).toHaveCount(100);
  expect(envois.filter((e) => e.corps.action === "inscrits").map((e) => e.corps)).toEqual([{ action: "inscrits", page: 1 }]);
  expect(envois.find((e) => e.corps.action === "inscrits").auth).toMatch(/^Bearer ey/);
  expect(await liste.textContent()).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  await expect(liste.locator("img")).toHaveCount(0);
  await expect(liste.locator("li.compte").nth(1)).toContainText("e-mail pas encore confirmé");
  await expect(page.locator("#inscritsResume")).toContainText("150 inscrits");
  await expect(page.locator("#inscritsResume")).toContainText("100 affichés");
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  // La page suivante s'AJOUTE à la liste.
  await page.click("#inscritsSuite");
  await expect(liste.locator("li.compte")).toHaveCount(150);
  await expect(liste).toContainText("Membre 150");
  await expect(page.locator("#inscritsSuite")).toBeHidden();
  expect(envois.filter((e) => e.corps.action === "inscrits").map((e) => e.corps.page)).toEqual([1, 2]);
  // Retour à l'accueil.
  await page.click("#inscritsRetour");
  await expect(page.locator("#accueil")).toBeVisible();
  await expect(page.locator("#inscrits")).toBeHidden();
});

test("⑳ « Voir les N inscrits » des nouveaux comptes mène à la même liste ; une lecture ratée se dit et se réessaie", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerAvecInscrits(page, envois, 13, { echecs: 1 });
  await page.goto("/pilotage/");
  await page.locator("#nouveauxComptes button", { hasText: "Voir les 13 inscrits" }).click();
  await expect(page.locator("#inscrits")).toBeVisible();
  await expect(page.locator("#inscritsListe")).toContainText("Liste impossible à lire");
  await expect(page.locator("#inscritsListe")).toContainText("délai dépassé (banc)");
  await page.locator("#inscritsListe button", { hasText: "Réessayer" }).click();
  await expect(page.locator("#inscritsListe li.compte")).toHaveCount(13);
  await expect(page.locator("#inscritsListe")).not.toContainText("Liste impossible à lire");
  await expect(page.locator("#inscritsResume")).toContainText("13 inscrits");
  await expect(page.locator("#inscritsSuite")).toBeHidden();
});

test("⑱ Nouveaux comptes : aucun → dit ; noms illisibles → « Nom non lu » ; fonction pas à jour → « Liste indisponible »", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ activation: { ...BASE.activation, nouveaux: [] } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#nouveauxComptes")).toContainText("Aucun compte créé ces 30 derniers jours");
  await page.unroute(FONCTION);
  await routerFonction(page, [], etat({ activation: { ...BASE.activation, nouveaux: [{ nom: null, nomLu: false, cree: MAINTENANT, confirme: true, voie: "Google", actif: null }] } }));
  await page.click("#actualiser");
  await expect(page.locator("#nouveauxComptes")).toContainText("Nom non lu");
  await expect(page.locator("#nouveauxComptes")).not.toContainText("Profil pas encore rempli");
  await page.unroute(FONCTION);
  const ancienne = { ...BASE.activation }; delete ancienne.nouveaux;
  await routerFonction(page, [], etat({ activation: ancienne }));
  await page.click("#actualiser");
  await expect(page.locator("#nouveauxComptes")).toContainText("Liste indisponible");
});
