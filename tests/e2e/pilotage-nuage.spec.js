// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE NUAGE (2026-09-28, refait le 2026-11-04) — la page /pilotage/, LE
// centre de pilotage, sans PC. Un seul écran pour les deux besoins : ce qu'il y a à
// régler (un bouton par problème, aucune confirmation) et le nombre d'utilisateurs.
// Le reste (d'où viennent les gens, détail technique, réglages) est rangé plus bas.
// La session (jeton sb-…) et la fonction `pilotage` sont SIMULÉES : rien ne
// part vers la production. La liste « À faire » du faux état est construite par
// la VRAIE fonction `aFaire` (_shared/pilotage.js) : la page est éprouvée sur
// ce que le serveur rend, pas sur une copie à la main.
// On mesure : écran de connexion sans session, rendu au gabarit iPhone, textes
// HOSTILES rendus en texte, refus 403 dit en clair, chaque geste envoie
// EXACTEMENT sa demande, et s'annule pendant 5 s, données périmées dites, jamais de
// faux « rien à régler ». Le délai d'annulation est réduit partout (poserSession),
// sauf dans les tests qui le mesurent.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { sansDonneesDistantes } = require("./app-helper");

const FONCTION = "**/functions/v1/pilotage";
const CHARGE = '<img src=x onerror="window.__pwn=1">';

function jwt(email) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: "11111111-1111-4111-8111-111111111111", email, role: "authenticated", exp: 4102444800 }) + ".sig";
}
async function poserSession(page, email = "passioadmin@gmail.com", delaiAnnuler = 30) {
  await page.addInitScript(([cle, jeton, email, delai]) => {
    window.PILOTAGE_DELAI_ANNULER_MS = delai;
    localStorage.setItem(cle, JSON.stringify({
      access_token: jeton, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
      user: { id: "11111111-1111-4111-8111-111111111111", email, aud: "authenticated", role: "authenticated" },
    }));
  }, ["sb-njkiyoklssvefstljemx-auth-token", jwt(email), email, delaiAnnuler]);
}
const MAINTENANT = new Date().toISOString();
const IL_Y_A_3H = new Date(Date.now() - 3 * 3600e3).toISOString();
const SERIE = [0, 1, 0, 2, 1, 0, 3].map((n, i) => ({ jour: "2026-09-2" + (2 + i), n }));
const GH = {
  issues: [{ numero: 12, titre: CHARGE, labels: ["sentinelle", "humain"], url: "javascript:alert(1)", depuis: MAINTENANT, pr: false, pause: false },
    { numero: 13, titre: "fix: correctif", labels: [], url: "https://github.com/PASSIO74/passio-app/pull/13", depuis: MAINTENANT, pr: true, pause: false, correctif: true, externe: false }],
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
    // Le total des inscrits (2026-10-24), toutes dates, et la marche (2026-11-04).
    inscrits: { total: 13, tronque: false, semaine: 2, semainePrec: 3, mois: 6, courbe: [
      { jour: "2026-06-23", n: 2, total: 2 }, { jour: "2026-08-05", n: 3, total: 5 }, { jour: "2026-09-08", n: 2, total: 7 }, { jour: "2026-10-20", n: 6, total: 13 },
    ] } },
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
// ⚠️ `require()` et non `import()` (audit du 2026-11-02) : `_shared/pilotage.js`
// est un module ES dans un dossier sans `"type": "module"`. Node 22 le charge
// par `require(esm)` dans les deux cas ; mais le chargeur ESM que Playwright
// enregistre (`node:module.register`, transform Babel des fichiers hors
// node_modules) le compile en CommonJS sous `import()` avec Playwright 1.60 —
// « SyntaxError: Unexpected token 'export' », les 22 tests de la suite rouges
// en local alors qu'ils passent en CI (1.64.1). `require()` ne passe pas par ce
// chargeur : même module, même fonction, quelle que soit la version du banc.
let aFaire;
test.beforeAll(() => { ({ aFaire } = require("../../supabase/functions/_shared/pilotage.js")); });
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
/** Depuis n'importe où : l'accueil, puis la page rangée en bas. */
async function aller(page, vue) {
  const retour = page.locator("#retour");
  if (await retour.isVisible()) await retour.click();
  await expect(page.locator("#accueil")).toBeVisible();
  await page.click(`.plus button[data-tab="${vue}"]`);
  await expect(page.locator("#" + vue)).toBeVisible();
}
async function accueil(page) {
  const retour = page.locator("#retour");
  if (await retour.isVisible()) await retour.click();
  await expect(page.locator("#accueil")).toBeVisible();
}
/** Un geste rangé sous le texte de la ligne (refuser, fermer…). */
async function autreChoix(ligne, libelle) {
  if (!(await ligne.locator("details").evaluate((d) => d.open))) await ligne.locator("summary").click();
  await ligne.locator("button", { hasText: libelle }).click();
}

// ⚠️ `serviceWorkers: "block"` (2026-11-04) : dès que le service worker du pilotage contrôle la page,
// WebKit envoie les appels à la fonction sans passer par `page.route` : le geste du banc partait vers
// la VRAIE fonction avec son faux jeton (401 mesuré). C'est ce qui avait sorti cette suite du socle
// iPhone le 2026-10-11, attribué à tort à confirm() : un défaut du banc, pas d'iPhone.
test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });

test.beforeEach(async ({ page }) => { await sansDonneesDistantes(page); });

test("① sans session : écran de connexion, jamais l'application", async ({ page }) => {
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranConnexion")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
});

test("② Accueil : UN écran, ce qu'il y a à régler et le nombre d'utilisateurs, sans barre d'onglets ni débordement", async ({ page }) => {
  const soucis = [];
  page.on("pageerror", (e) => soucis.push(e.message));
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("Problème en cours");
  await expect(page.locator(".barre"), "plus de barre d'onglets").toHaveCount(0);
  // Les problèmes : l'issue « À toi », le correctif, le signalement et la jauge orange
  // (connexions à 72 %) — trois d'un coup, pour garder la croissance sur l'écran.
  await expect(page.locator("#verdictDetail")).toHaveText("4 choses à régler.");
  const af = page.locator("#afaire");
  await expect(af.locator("article")).toHaveCount(3);
  await expect(page.locator("#afaireSuite")).toHaveText("Voir le dernier");
  await page.click("#afaireSuite");
  await expect(af.locator("article")).toHaveCount(4);
  await expect(page.locator("#afaireSuite")).toBeHidden();
  await expect(af).toContainText("Connexions en direct (comptes)");
  await expect(af.locator("article").first()).toContainText("Un problème attend ta décision");
  await expect(af.locator("article").first()).toContainText("Claude prépare le correctif.");
  await expect(af).toContainText("Un correctif est prêt");
  await expect(af).toContainText("Quelqu'un a signalé une publication");
  // Les textes de tiers, en TEXTE, jamais en balises.
  expect(await af.textContent()).toContain("#12 · " + CHARGE);
  await expect(af).toContainText("#13 · fix: correctif");
  await expect(af).toContainText("« " + CHARGE + " »");
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  // Un seul bouton par problème, celui-ci sans choix à faire ; le reste est replié.
  await expect(af.locator("article").first().locator(".btn-regler")).toHaveText("Régler");
  await expect(af.locator("article").first().locator("button", { hasText: "Ce n'est pas un problème" })).toBeHidden();
  // La croissance : le nombre, sa marche, et qui est là.
  await expect(page.locator("#totalNombre")).toHaveText("13");
  await expect(page.locator("#totalLibelle")).toHaveText("utilisateurs");
  await expect(page.locator("#marche .marche-trait")).toHaveCount(1);
  await expect(page.locator("#evolutionSemaine")).toHaveText("+2 cette semaine.");
  await expect(page.locator("#evolutionAvant")).toHaveText("+3 la semaine d'avant, +6 sur 30 jours.");
  await expect(page.locator("#audience")).toContainText("en ligne");
  await expect(page.locator("#audience")).toContainText("12");
  // Le reste est rangé : les chiffres clés sont dans le détail, sans barre horizontale nulle part.
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  await aller(page, "details");
  const ch = page.locator("#chiffres");
  await expect(ch).toContainText("2 compte(s) connecté(s)");
  await expect(ch).toContainText("▲ +2 vs 7 j d'avant");
  await expect(ch.locator(".tendance.bon").first()).toContainText("+2");
  await expect(ch.locator(".tendance.bon").last(), "moins d'erreurs depuis la mise en ligne qu'avant : bonne nouvelle").toContainText("4 sur les 3 h d'avant");
  await expect(ch.locator(".tendance.mauvais").first()).toContainText("+5");
  await expect(ch).toContainText("33 %");
  await expect(ch).toContainText("erreurs depuis la mise en ligne");
  // Le palier de croissance (13 utilisateurs → « Lancement ») reste « pour info » : ce n'est pas un problème.
  await expect(page.locator("#pourInfoRepli")).toBeVisible();
  await page.click("#pourInfoTitre");
  await expect(page.locator("#pourInfo")).toContainText("Lancement · 13 inscrits");
  for (const t of ["details", "reglages", "croissance"]) {
    await aller(page, t);
    expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  }
  await accueil(page);
  expect(soucis).toEqual([]);
});

test("③ Détails : erreurs, activation et entonnoir, machines, capacité, historique", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await aller(page, "details");
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
  await aller(page, "reglages");
  await expect(page.locator("#alertes")).toContainText("2 appareil(s)");
});

test("④ un autre compte reçoit le refus en clair", async ({ page }) => {
  await poserSession(page, "quelquun@exemple.fr");
  await page.route(FONCTION, (r) => r.fulfill({ status: 403, json: { error: "Réservé au compte de l'éditeur." } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#ecranRefus")).toBeVisible();
  await expect(page.locator("#refusTexte")).toContainText("quelquun@exemple.fr");
});

test("⑤ partie illisible : « Non lu » avec sa raison, jamais un faux 0 % ni un faux total", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ activation: null, nonLus: ["activation"], erreursLecture: { activation: "HTTP 500" } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#nouveauxComptes")).toContainText("Non lu");
  await expect(page.locator("#nouveauxComptes")).toContainText("HTTP 500");
  await expect(page.locator("#totalNombre"), "un total illisible n'est pas zéro").toHaveText("—");
  await expect(page.locator("#marche svg")).toHaveCount(0);
  await aller(page, "details");
  await expect(page.locator("#chiffres")).toContainText("nouveaux comptes activés");
  await expect(page.locator("#activation")).toContainText("Non lu");
  await expect(page.locator("#activation")).toContainText("HTTP 500");
  await expect(page.locator("#activation")).not.toContainText("%");
  await expect(page.locator("#activationPremiers")).toBeHidden();
});

test("⑥ un toucher : chaque geste envoie EXACTEMENT sa demande, avec le jeton, sans aucune boîte de dialogue", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  let dialogues = 0;
  page.on("dialog", (d) => { dialogues++; d.dismiss(); });
  await routerFonction(page, envois);
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictTitre")).toHaveText("Problème en cours");
  const af = page.locator("#afaire");
  const correctif = af.locator("article", { hasText: "Un correctif est prêt" });
  await correctif.locator(".btn-regler").click();
  await expect(page.locator("#bandeauOk")).toContainText("Fait (banc).");
  expect(gestes(envois).pop().corps).toEqual({ action: "fusionner", numero: 13 });
  expect(gestes(envois).pop().auth).toMatch(/^Bearer ey/);
  await autreChoix(correctif, "Refuser");
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "fermer", numero: 13 });
  const issue = af.locator("article", { hasText: "#12" });
  await issue.locator(".btn-regler").click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "reparer", cible: "issue", numero: 12 });
  await autreChoix(issue, "Ce n'est pas un problème");
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "fermer", numero: 12 });
  // Un signalement : deux décisions d'un toucher, sous les yeux. Aucune machine ne tranche.
  const signalement = af.locator("article", { hasText: "signalé" });
  await expect(signalement.locator(".btn-regler")).toHaveCount(0);
  await signalement.locator("button", { hasText: "Sans suite" }).click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "signalement", id: "rep_1", statut: "dismissed" });
  await signalement.locator("button", { hasText: "C'est traité" }).click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "signalement", id: "rep_1", statut: "handled" });
  // L'erreur du jour : une enquête est ouverte (#12 est « sentinelle ») → rien à régler, elle est dans le détail.
  await expect(af).not.toContainText("3 fois");
  await aller(page, "details");
  await expect(page.locator("#pourInfoTitre")).toContainText("Pour info");
  await page.click("#pourInfoTitre");
  await expect(page.locator("#pourInfo")).toContainText("3 fois");
  await page.click('#pause button:has-text("Mettre en pause")');
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "pause" });
  await page.click('#relances button:has-text("Lancer maintenant")');
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "relancer", cible: "sentinelle" });
  expect(dialogues, "un seul toucher : jamais de boîte de confirmation").toBe(0);
});

test("⑦ le geste part seul après le délai ; retoucher pendant le délai l'annule et rien ne part", async ({ page }) => {
  await poserSession(page, "passioadmin@gmail.com", 1200);
  const envois = [];
  await routerFonction(page, envois);
  await page.goto("/pilotage/");
  const b = page.locator("#afaire article", { hasText: "Un correctif est prêt" }).locator(".btn-regler");
  await b.click();
  await expect(b).toHaveText(/^Annuler \(\d\)$/);
  await expect(b).toHaveClass(/arme/);
  expect(gestes(envois), "le geste attend la fin du délai").toEqual([]);
  await b.click();
  await expect(b).toHaveText("Régler");
  await expect(page.locator("#bandeauOk")).toContainText("Annulé");
  await page.waitForTimeout(1500);
  expect(gestes(envois), "annulé : rien n'est parti").toEqual([]);
  // Sans le retoucher, il part tout seul.
  await b.click();
  await expect(b).toHaveText(/^Annuler/);
  await expect.poll(() => gestes(envois).map((e) => e.corps), { timeout: 4000 }).toEqual([{ action: "fusionner", numero: 13 }]);
});

test("⑧ sans jeton GitHub : aucun geste GitHub, le premier problème est le jeton, et son bouton mène à la page où le poser", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ gestesGithub: false, relancesPossibles: [] }));
  await page.goto("/pilotage/");
  const jeton = page.locator("#afaire article").first();
  await expect(jeton).toContainText("Il manque le jeton GitHub");
  expect(await jeton.textContent()).toContain("PILOTAGE_GITHUB_TOKEN");
  const lien = jeton.locator("a.btn-regler");
  await expect(lien).toHaveText("Régler");
  await expect(lien).toHaveAttribute("href", /^https:\/\/supabase\.com\/dashboard\/project\/[a-z]+\/functions\/secrets$/);
  await expect(lien).toHaveAttribute("rel", "noopener");
  await page.click("#afaireSuite");
  await expect(page.locator("#afaire button", { hasText: /Régler|Fusionner|Refuser|Ce n'est pas/ })).toHaveCount(0);
  await aller(page, "details");
  await expect(page.locator("#relances")).toContainText("PILOTAGE_GITHUB_TOKEN");
  expect(await page.locator("#pause button, #relances button").count()).toBe(0);
});

test("⑨ site injoignable : voyant rouge, en tête de la liste, et le bouton mène à Netlify tant que le retour arrière n'a pas de jeton", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ disponibilite: { repond: false, depuis: MAINTENANT, veilleLe: MAINTENANT }, verdict: { couleur: "rouge", titre: "Problème en cours", raisons: ["le site ne répond pas"] } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdict")).toHaveClass(/rouge/);
  const site = page.locator("#afaire article").first();
  await expect(site).toContainText("Le site ne répond pas");
  await expect(site.locator("a.btn-regler")).toHaveAttribute("href", "https://app.netlify.com/");
  await aller(page, "details");
  await expect(page.locator("#site")).toContainText("Le site ne répond pas");
});

test("⑩ « Régler » répare : sur l'exécution en échec et sur l'enquête, demande exacte ; une réparation en cours se dit, sans bouton", async ({ page }) => {
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
  await page.goto("/pilotage/");
  const af = page.locator("#afaire");
  const run = af.locator("article", { hasText: "La mise en ligne a échoué" });
  await expect(run).toContainText("Claude prépare le correctif.");
  await expect(run.locator("a[href]").first()).toHaveAttribute("href", "https://github.com/PASSIO74/passio-app/actions/runs/9");
  // La réparation en cours : dans « En cours », sans bouton à presser, le texte hostile en texte.
  const encours = page.locator("#enCours article", { hasText: "#12" });
  await expect(encours).toContainText("Claude prépare le correctif (#600).");
  await expect(encours.locator(".btn-regler")).toHaveCount(0);
  expect(await encours.textContent()).toContain(CHARGE);
  await expect(af.locator("article", { hasText: "#12" })).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  await run.locator(".btn-regler").click();
  await expect.poll(() => gestes(envois).pop()?.corps).toEqual({ action: "reparer", cible: "run", cle: "deploy" });
  await af.locator("article", { hasText: "#556" }).locator(".btn-regler").click();
  await expect.poll(() => gestes(envois).pop().corps).toEqual({ action: "reparer", cible: "issue", numero: 556 });
  // La réparation ouverte est « pour info » : sa cible porte déjà la ligne.
  await aller(page, "details");
  await expect(page.locator("#chiffres")).toContainText("Échec");
  await page.click("#pourInfoTitre");
  await expect(page.locator("#pourInfo")).toContainText("[RÉPARER] #12");
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
});

test("⑪ rien à régler : le voyant le dit, sans bouton ; liste absente (fonction pas à jour) : jamais un faux « rien à régler »", async ({ page }) => {
  await poserSession(page);
  const vert = { couleur: "vert", titre: "Tout va bien", raisons: ["Aucune erreur récente, rien d'urgent."] };
  await routerFonction(page, [], etat({ aFaire: [], verdict: vert }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictDetail")).toContainText("Rien à régler.");
  await expect(page.locator("#verdictDetail")).toContainText("Tu seras prévenu");
  await expect(page.locator("#afaire article")).toHaveCount(0);
  await expect(page.locator("#toutRegler")).toBeHidden();
  await page.unroute(FONCTION);
  const ancien = etat({ verdict: vert }); delete ancien.aFaire;
  await routerFonction(page, [], ancien);
  await page.click("#actualiser");
  await expect(page.locator("#afaire")).toContainText("Liste indisponible");
  await expect(page.locator("#verdictDetail")).not.toContainText("Rien à régler");
  await expect(page.locator("#toutRegler")).toBeHidden();
});

test("⑫ GitHub illisible : voyant orange qui le nomme, raison sur la ligne, et son bouton relit", async ({ page }) => {
  await poserSession(page);
  const raison = "GitHub HTTP 403 (limite de lecture atteinte, pas de jeton)";
  const envois = [];
  await routerFonction(page, envois, etat({ github: null, nonLus: ["github"], erreursLecture: { github: raison },
    verdict: { couleur: "orange", titre: "À surveiller", raisons: ["non lu : GitHub (enquêtes, mises en ligne)"], incomplet: true }, miseEnLigne: { le: null, etat: "inconnu" } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdict")).toHaveClass(/orange/);
  await expect(page.locator("#verdictDetail")).toContainText("non lu : GitHub");
  const ligne = page.locator("#afaire article", { hasText: "GitHub n'a pas pu être lu" });
  await expect(ligne).toContainText("HTTP 403");
  const lectures = envois.filter((e) => e.corps.action === "etat").length;
  await ligne.locator(".btn-regler").click();
  await expect.poll(() => envois.filter((e) => e.corps.action === "etat").length).toBeGreaterThan(lectures);
  await aller(page, "details");
  await expect(page.locator("#chiffres")).toContainText("date de mise en ligne inconnue");
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
  await page.goto("/pilotage/");
  // La protection active est dite « pour info », dans le détail : rien à régler.
  await aller(page, "details");
  await page.click("#pourInfoTitre");
  await expect(page.locator("#pourInfo")).toContainText("L'app est ralentie pour tenir la charge");
  expect(await page.textContent("#pourInfo")).toContain(CHARGE);
  await aller(page, "reglages");
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
  await page.goto("/pilotage/");
  await aller(page, "reglages");
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

test("⑯ Retour arrière : la proposition est EN TÊTE de la liste ; le toucher montre ce qui sera remis, puis le geste part, sans boîte de dialogue", async ({ page }) => {
  await poserSession(page, "passioadmin@gmail.com", 700);
  const envois = [];
  let dialogues = 0;
  page.on("dialog", (d) => { dialogues++; d.dismiss(); });
  await routerFonction(page, envois, etat({ reglages: REGLAGES }));
  await page.goto("/pilotage/");
  await aller(page, "reglages");
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
  await accueil(page);
  const decision = page.locator("#afaire article").first();
  await expect(decision).toContainText("La mise en ligne casse l'app chez 6 comptes");
  await expect(decision).toContainText("aaaa1111");
  expect(await decision.textContent()).toContain(famille);
  await expect(decision.locator("img")).toHaveCount(0);
  // Jamais dans « Tout régler » : c'est un choix, pas une réparation.
  const b = decision.locator(".btn-regler");
  await b.click();
  // D'abord l'aperçu, écrit sous le problème pendant le délai d'annulation, puis le geste avec la cible de l'aperçu.
  await expect(decision.locator(".apercu")).toContainText("bbbb2222");
  await expect(decision.locator(".apercu")).toContainText("aaaa1111");
  await expect(decision.locator(".apercu")).toBeVisible();
  await expect(b).toHaveText(/^Annuler/);
  expect(gestes(envois).map((e) => e.corps.action)).toEqual(["retour_apercu"]);
  await expect.poll(() => gestes(envois).pop()?.corps, { timeout: 4000 }).toEqual({ action: "retour_arriere", cible: "6eca16aa0123456789abcdef" });
  expect(gestes(envois).map((e) => e.corps.action)).toEqual(["retour_apercu", "retour_arriere"]);
  expect(dialogues).toBe(0);
});

test("⑰ Derniers arrivés : les NOMS, en texte — 3 sur l'accueil, nom et date ; Détails mène à la liste complète", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  const acc = page.locator("#nouveauxComptes");
  await expect(acc.locator("li.compte")).toHaveCount(3);
  expect(await acc.textContent()).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  await expect(acc.locator("img")).toHaveCount(0);
  await expect(acc).toContainText("Léa");
  await expect(acc).toContainText("Profil pas encore rempli");
  await expect(acc).not.toContainText("Sam");
  await expect(acc, "le détail de chaque compte est dans la liste complète").not.toContainText("e-mail pas encore confirmé");
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  // Détails : l'accès à la liste complète (elle se lit à la demande).
  await aller(page, "details");
  await expect(page.locator("#comptesCrees")).toContainText("Tous les utilisateurs");
  await expect(page.locator("#comptesCrees button", { hasText: "Voir les 13 utilisateurs" })).toBeVisible();
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

test("⑲ le nombre d'utilisateurs : visible dès l'ouverture, il ouvre TOUS les utilisateurs, par leur nom, page par page, en texte", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerAvecInscrits(page, envois, 150);
  await page.goto("/pilotage/");
  const total = page.locator("#totalUtilisateurs");
  await expect(total).toContainText("150");
  await expect(total).toContainText("utilisateurs");
  // boundingBox() n'attend rien : mesurer avant le rendu de l'état rendait
  // `null` une fois sur deux (CI #666, 2026-10-31). On attend le nombre (ci-dessus).
  const boite = await total.boundingBox();
  expect(boite.y, "visible sans faire défiler, au gabarit iPhone, même avec des problèmes").toBeLessThan(780 - boite.height);
  expect(envois.filter((e) => e.corps.action === "inscrits"), "la liste ne se lit qu'au toucher").toHaveLength(0);
  await total.click();
  await expect(page.locator("#inscrits")).toBeVisible();
  await expect(page.locator("#titreOnglet")).toHaveText("Utilisateurs");
  const liste = page.locator("#inscritsListe");
  await expect(liste.locator("li.compte")).toHaveCount(100);
  expect(envois.filter((e) => e.corps.action === "inscrits").map((e) => e.corps)).toEqual([{ action: "inscrits", page: 1 }]);
  expect(envois.find((e) => e.corps.action === "inscrits").auth).toMatch(/^Bearer ey/);
  expect(await liste.textContent()).toContain(CHARGE);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  await expect(liste.locator("img")).toHaveCount(0);
  await expect(liste.locator("li.compte").nth(1)).toContainText("e-mail pas encore confirmé");
  await expect(page.locator("#inscritsResume")).toContainText("150 utilisateurs");
  await expect(page.locator("#inscritsResume")).toContainText("100 affichés");
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  // La page suivante s'AJOUTE à la liste.
  await page.click("#inscritsSuite");
  await expect(liste.locator("li.compte")).toHaveCount(150);
  await expect(liste).toContainText("Membre 150");
  await expect(page.locator("#inscritsSuite")).toBeHidden();
  expect(envois.filter((e) => e.corps.action === "inscrits").map((e) => e.corps.page)).toEqual([1, 2]);
  // Retour à l'accueil.
  await page.click("#retour");
  await expect(page.locator("#accueil")).toBeVisible();
  await expect(page.locator("#inscrits")).toBeHidden();
  await expect(page.locator("#retour")).toBeHidden();
});

test("⑳ « Voir les N utilisateurs » des derniers arrivés mène à la même liste ; une lecture ratée se dit et se réessaie", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerAvecInscrits(page, envois, 13, { echecs: 1 });
  await page.goto("/pilotage/");
  await page.locator("#nouveauxComptes button", { hasText: "Voir les 13 utilisateurs" }).click();
  await expect(page.locator("#inscrits")).toBeVisible();
  await expect(page.locator("#inscritsListe")).toContainText("Liste impossible à lire");
  await expect(page.locator("#inscritsListe")).toContainText("délai dépassé (banc)");
  await page.locator("#inscritsListe button", { hasText: "Réessayer" }).click();
  await expect(page.locator("#inscritsListe li.compte")).toHaveCount(13);
  await expect(page.locator("#inscritsListe")).not.toContainText("Liste impossible à lire");
  await expect(page.locator("#inscritsResume")).toContainText("13 utilisateurs");
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

// ─── Croissance, coût, pré-tri (2026-11-01) ─────────────────────────────────
// L'onglet Croissance rend ce que `croissance()` (_shared/croissance.js) fait de
// la réponse de `pilotage_croissance` — la VRAIE fonction, comme `aFaire`.
test("㉑ Croissance : sources, bouche-à-oreille, rétention « … » quand c'est trop tôt ; coût et geste des jauges ; publication masquée", async ({ page }) => {
  const soucis = [];
  page.on("pageerror", (e) => soucis.push(e.message));
  const { croissance } = require("../../supabase/functions/_shared/croissance.js");
  const { jauges, coutMensuel } = require("../../supabase/functions/_shared/pilotage.js");
  const hier = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const cr = croissance({ jours: 30, agrege_le: hier, cumul: [
    { mesure: "visite", valeur: "instagram", n: 120 }, { mesure: "inscription", valeur: "instagram", n: 12 },
    { mesure: "inscription", valeur: "lien", n: 3 }, { mesure: "inscription_lien", valeur: "google", n: 3 },
    { mesure: "lien_cree", valeur: "post", n: 9 }, { mesure: "lien_partage", valeur: "whatsapp", n: 7 }, { mesure: "lien_ouvert", valeur: "external", n: 5 },
    { mesure: "campagne", valeur: "lancement", n: 4 },
  ], actifs: [{ jour: hier, n: 42 }], cohortes: [{ semaine: "2026-10-26", taille: 15, j1: 6, j7: 0, j30: 0, dernier: new Date().toISOString().slice(0, 10) }] });
  const js = jauges({ connexions: 360, emails: 250, base: 104857600 });
  const e = etat({ croissance: cr, capacite: { mesuresServeur: true, jauges: js, cout: coutMensuel(js) },
    signalements: { ouverts: 0, liste: [], masques: [{ id: "p_9", signaleurs: 3, le: MAINTENANT, extrait: CHARGE }] } });
  const envois = [];
  await poserSession(page);
  await routerFonction(page, envois, e);
  await page.goto("/pilotage/");
  // Pré-tri : la publication masquée attend une décision, son extrait en TEXTE.
  await page.click("#afaireSuite");
  const af = page.locator("#afaire");
  await expect(af).toContainText("Une publication a été masquée après 3 signalements");
  expect(await af.textContent()).toContain(CHARGE);
  // Jauge orange : le geste et son prix, et le bouton mène à la page du fournisseur.
  await expect(af).toContainText("Brevo");
  await expect(af.locator("article", { hasText: "E-mails d'inscription" }).locator("a.btn-regler")).toHaveAttribute("href", "https://app.brevo.com/");
  await af.locator("article", { hasText: "masquée" }).locator(".btn-regler").click();
  await expect.poll(() => gestes(envois).map((x) => x.corps)).toContainEqual({ action: "masquage", id: "p_9", decision: "garder" });
  // Croissance.
  await aller(page, "croissance");
  await expect(page.locator("#croissanceChiffres")).toContainText("15");
  await expect(page.locator("#croissanceChiffres")).toContainText("42");
  await expect(page.locator("#croissanceSources")).toContainText("Instagram");
  await expect(page.locator("#croissanceSources")).toContainText("120 venus · 12 inscrits · 10 %");
  await expect(page.locator("#croissanceSources")).toContainText("lancement : 4 inscrits");
  await expect(page.locator("#croissanceLiens")).toContainText("whatsapp 7");
  const ligne = page.locator(".tableau-retention tr").nth(1);
  await expect(ligne).toContainText("15");
  await expect(ligne.locator("td").nth(2), "le plus jeune compte a été créé aujourd'hui : J1 pas encore mesurable").toHaveText("…");
  expect(await sansBarreHorizontale(page)).toBeLessThanOrEqual(0);
  // Coût.
  await aller(page, "details");
  await expect(page.locator("#cout")).toContainText("~25 €");
  await expect(page.locator("#cout")).toContainText("(à prévoir)");
  await expect(page.locator("#jauges")).toContainText("À faire : Passer Brevo");
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(soucis).toEqual([]);
});

test("㉒ Croissance : migration pas appliquée → dit, jamais un faux zéro", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, [], etat({ croissance: { absente: true, migration: "migrations/migration_croissance_2026-11-01.sql" } }));
  await page.goto("/pilotage/");
  await aller(page, "croissance");
  await expect(page.locator("#croissanceSources")).toContainText("Pas encore allumée");
  await expect(page.locator("#croissanceChiffres")).toBeEmpty();
});

// ─── Un seul écran, un seul toucher (2026-11-04) ────────────────────────────
const CORRECTIF = { numero: 21, titre: "fix: x", labels: [], url: "https://github.com/PASSIO74/passio-app/pull/21", depuis: MAINTENANT, pr: true, pause: false, correctif: true, externe: false };
const CHANTIER = { numero: 22, titre: "feat: un chantier d'une autre session", labels: [], url: "https://github.com/PASSIO74/passio-app/pull/22", depuis: MAINTENANT, pr: true, pause: false, correctif: false, externe: false };
const FORK = { numero: 23, titre: "fix: urgent, à fusionner", labels: [], url: "https://github.com/PASSIO74/passio-app/pull/23", depuis: MAINTENANT, pr: true, pause: false, correctif: false, externe: true };

test("㉓ « Tout régler » : un toucher pour tout ce qui répare, dans l'ordre, chaque demande une fois ; jamais une décision ni un retour arrière", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  const gh = { ...GH, issues: [{ numero: 556, titre: "[VEILLE] flux", labels: ["veille"], url: null, depuis: MAINTENANT, pr: false, pause: false }, CORRECTIF],
    runs: { ...GH.runs, deploy: { etat: "completed", conclusion: "failure", le: MAINTENANT, url: null }, sentinelle: { etat: "completed", conclusion: "success", le: IL_Y_A_3H } },
    aReparer: [{ cible: "issue", numero: 556, libelle: "#556", url: null, enCours: null }, { cible: "run", cle: "deploy", libelle: "d", url: null, enCours: null }] };
  await routerFonction(page, envois, etat({ github: gh, reglages: REGLAGES,
    autonomie: { reveilSentinelle: true, retour: { mode: "proposer", jeton: true, proposition: { le: MAINTENANT, version: "aaaa1111", comptes: 6, famille: "x" } } } }));
  await page.goto("/pilotage/");
  const tout = page.locator("#toutRegler");
  // Le déploiement, la veille, le correctif, et les erreurs du jour (que la Sentinelle n'a pas vues).
  await expect(tout).toHaveText("Tout régler (4)");
  await tout.click();
  await expect(page.locator("#bandeauOk")).toContainText("4 problèmes pris en main.");
  expect(gestes(envois).map((e) => e.corps)).toEqual([
    { action: "reparer", cible: "run", cle: "deploy" },
    { action: "reparer", cible: "issue", numero: 556 },
    { action: "fusionner", numero: 21 },
    { action: "relancer", cible: "sentinelle" },
  ]);
  expect(JSON.stringify(gestes(envois)), "ni le retour arrière, ni le signalement").not.toMatch(/retour|signalement|masquage/);
});

test("㉔ « Tout régler » : un refus est dit avec sa raison, les autres passent ; moins de deux réparations, pas de bouton", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  const gh = { ...GH, issues: [{ numero: 556, titre: "[VEILLE] flux", labels: ["veille"], url: null, depuis: MAINTENANT, pr: false, pause: false }, CORRECTIF], aReparer: [{ cible: "issue", numero: 556, libelle: "#556", url: null, enCours: null }] };
  const e = etat({ github: gh, signalements: { ouverts: 0, liste: [] }, erreurs: { ...BASE.erreurs, details: [] }, capacite: { mesuresServeur: true, jauges: [] } });
  await page.route(FONCTION, async (r) => {
    const corps = r.request().postDataJSON();
    envois.push({ corps, auth: "" });
    if (corps.action === "fusionner") { await r.fulfill({ status: 409, json: { error: "Ce correctif est en conflit avec la version en ligne." } }); return; }
    await r.fulfill({ json: corps.action === "etat" ? e : { ok: true, message: "Fait (banc)." } });
  });
  await page.goto("/pilotage/");
  await page.click("#toutRegler");
  await expect(page.locator("#bandeauErreur")).toContainText("1 refusé : Ce correctif est en conflit");
  await expect(page.locator("#bandeauOk")).toContainText("1 problème pris en main.");
  // Un seul problème réparable : son bouton suffit.
  await page.unroute(FONCTION);
  await routerFonction(page, [], etat({ github: { ...gh, issues: [CORRECTIF], aReparer: [] }, signalements: { ouverts: 0, liste: [] }, erreurs: { ...BASE.erreurs, details: [] }, capacite: { mesuresServeur: true, jauges: [] } }));
  await page.click("#actualiser");
  await expect(page.locator("#afaire article")).toHaveCount(1);
  await expect(page.locator("#toutRegler")).toBeHidden();
});

test("㉕ un chantier en cours n'est pas un problème : hors de l'accueil, ses gestes dans le détail ; un fork ne se fusionne jamais d'ici", async ({ page }) => {
  await poserSession(page);
  const gh = { ...GH, issues: [CHANTIER, FORK], aReparer: [] };
  await routerFonction(page, [], etat({ github: gh, signalements: { ouverts: 0, liste: [] }, erreurs: { ...BASE.erreurs, details: [] }, capacite: { mesuresServeur: true, jauges: [] }, verdict: { couleur: "vert", titre: "Tout va bien", raisons: [] } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictDetail")).toContainText("Rien à régler.");
  await expect(page.locator("#afaire article")).toHaveCount(0);
  await aller(page, "details");
  await page.click("#pourInfoTitre");
  const info = page.locator("#pourInfo");
  const chantier = info.locator("article", { hasText: "#22" });
  await expect(chantier).toContainText("Un chantier en cours, pas un problème.");
  await expect(chantier.locator("button", { hasText: "Fusionner" })).toBeVisible();
  const fork = info.locator("article", { hasText: "#23" });
  await expect(fork.locator("button", { hasText: "Refuser" })).toBeVisible();
  await expect(fork.locator("button", { hasText: "Fusionner" }), "dépôt public : le titre d'un fork ne prouve rien").toHaveCount(0);
});

test("㉖ une relecture ne repeint jamais sous un geste armé", async ({ page }) => {
  await poserSession(page, "passioadmin@gmail.com", 60000);
  const envois = [];
  await routerFonction(page, envois);
  await page.goto("/pilotage/");
  const b = page.locator("#afaire article", { hasText: "Un correctif est prêt" }).locator(".btn-regler");
  await b.click();
  await expect(b).toHaveText(/^Annuler/);
  const lectures = () => envois.filter((e) => e.corps.action === "etat").length;
  const avant = lectures();
  // Une relecture demandée pendant le délai attend : sinon le bouton « Annuler » disparaîtrait.
  await page.click("#actualiser");
  await page.waitForTimeout(150);
  expect(lectures()).toBe(avant);
  await expect(b).toHaveText(/^Annuler/);
  expect(gestes(envois)).toEqual([]);
  // Annuler libère la relecture mise en attente.
  await b.click();
  await expect(b).toHaveText("Régler");
  await expect.poll(lectures).toBeGreaterThan(avant);
  expect(gestes(envois)).toEqual([]);
});

test("㉜ le téléphone se verrouille pendant le délai : le geste part tout de suite, il n'attend pas le retour", async ({ page }) => {
  await poserSession(page, "passioadmin@gmail.com", 60000);
  const envois = [];
  await routerFonction(page, envois);
  await page.goto("/pilotage/");
  const b = page.locator("#afaire article", { hasText: "Un correctif est prêt" }).locator(".btn-regler");
  await b.click();
  await expect(b).toHaveText(/^Annuler/);
  expect(gestes(envois)).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => gestes(envois).map((e) => e.corps)).toEqual([{ action: "fusionner", numero: 13 }]);
});

test("㉗ la marche : elle se lit au doigt et au clavier, finit sur le total, et se retrouve mois par mois", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await expect(page.locator("#totalNombre")).toHaveText("13");
  const marche = page.locator("#marche");
  await expect(marche.locator(".marche-trait")).toHaveCount(1);
  await expect(marche).toHaveAttribute("aria-label", /^De 2 le .* à 13 utilisateurs aujourd'hui\.$/);
  await expect(page.locator("#marcheAxe")).toContainText("23 juin");
  await expect(page.locator("#marcheAxe")).toContainText("aujourd'hui");
  // Le dernier point du trait est bien le haut du graphe : la marche finit sur le total.
  const bout = await marche.locator(".marche-bout").first().boundingBox();
  const zone = await marche.boundingBox();
  expect(bout.y - zone.y).toBeLessThan(20);
  await expect(page.locator("#marcheInfo")).toBeHidden();
  // Le clavier : les flèches parcourent les marches.
  await marche.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#marcheInfo")).toContainText("13 utilisateurs");
  await expect(page.locator("#marcheInfo")).toContainText("(+6)");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#marcheInfo")).toContainText("7 utilisateurs");
  // Le doigt : la marche la plus proche.
  await page.touchscreen.tap(zone.x + 2, zone.y + zone.height / 2);
  await expect(page.locator("#marcheInfo")).toContainText("2 utilisateurs");
  // Le même contenu sans graphique : mois par mois.
  await aller(page, "croissance");
  const mois = page.locator("#croissanceMois tr");
  await expect(mois, "l'en-tête et quatre mois").toHaveCount(5);
  await expect(mois.nth(1)).toContainText("octobre 2026");
  await expect(mois.nth(1)).toContainText("+6");
  await expect(mois.nth(1)).toContainText("13");
  // Un seul utilisateur, et le singulier.
  await page.unroute(FONCTION);
  await routerFonction(page, [], etat({ activation: { ...BASE.activation, inscrits: { total: 1, tronque: false, semaine: 0, semainePrec: 0, mois: 0, courbe: [{ jour: "2026-06-23", n: 1, total: 1 }] } } }));
  await page.click("#actualiser");
  await page.click("#retour");
  await expect(page.locator("#totalLibelle")).toHaveText("utilisateur");
  await expect(page.locator("#evolutionSemaine")).toHaveText("Aucun nouveau cette semaine.");
  await expect(page.locator("#evolutionAvant")).toHaveText("Aucun la semaine d'avant, aucun sur 30 jours.");
});

test("㉘ le bouton retour du téléphone revient à l'accueil, au lieu de fermer l'application ; un lien direct ouvre sa page", async ({ page }) => {
  await poserSession(page);
  await routerFonction(page, []);
  await page.goto("/pilotage/");
  await expect(page.locator("#retour")).toBeHidden();
  await page.click('.plus button[data-tab="reglages"]');
  await expect(page.locator("#reglages")).toBeVisible();
  await expect(page.locator("#titreOnglet")).toHaveText("Réglages");
  await page.goBack();
  await expect(page.locator("#accueil")).toBeVisible();
  await expect(page.locator("#retour")).toBeHidden();
  await expect(page.locator("#titreOnglet")).toHaveText("Pilotage");
  // Un double toucher sur « ‹ » ne recule qu'une fois : on reste dans le pilotage.
  await page.click('.plus button[data-tab="reglages"]');
  await page.evaluate(() => { const r = document.getElementById("retour"); r.click(); r.click(); });
  await expect(page.locator("#accueil")).toBeVisible();
  await page.waitForTimeout(200);
  expect(new URL(page.url()).pathname).toBe("/pilotage/");
  // Rouvrir la page sur une adresse de détail : la page, et « ‹ » ramène à l'accueil.
  await page.goto("/pilotage/#details");
  await expect(page.locator("#details")).toBeVisible();
  await page.click("#retour");
  await expect(page.locator("#accueil")).toBeVisible();
  // Une adresse inconnue n'est pas une page (le retour de Google écrit sa session dans l'adresse).
  await page.goto("/pilotage/#access_token=abc");
  await expect(page.locator("#accueil")).toBeVisible();
});

test("㉙ le bandeau d'un geste reste à l'écran, même en bas d'une longue page", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  await routerFonction(page, envois);
  await page.goto("/pilotage/");
  await aller(page, "details");
  await page.click('#relances button:has-text("Lancer maintenant")');
  const b = page.locator("#bandeauOk");
  await expect(b).toContainText("Fait (banc).");
  const boite = await b.boundingBox();
  expect(boite.y).toBeGreaterThanOrEqual(0);
  expect(boite.y + boite.height).toBeLessThanOrEqual(780);
});

test("㉚ la Sentinelle muette et les erreurs demandent le même geste : « Tout régler » ne le lance qu'une fois", async ({ page }) => {
  await poserSession(page);
  const envois = [];
  const neufHeures = new Date(Date.now() - 9 * 3600e3).toISOString();
  const gh = { ...GH, issues: [{ numero: 556, titre: "[VEILLE] flux", labels: ["veille"], url: null, depuis: MAINTENANT, pr: false, pause: false }],
    runs: { ...GH.runs, sentinelle: { etat: "completed", conclusion: "success", le: neufHeures } }, aReparer: [{ cible: "issue", numero: 556, libelle: "#556", url: null, enCours: null }] };
  await routerFonction(page, envois, etat({ github: gh, signalements: { ouverts: 0, liste: [] }, capacite: { mesuresServeur: true, jauges: [] } }));
  await page.goto("/pilotage/");
  await expect(page.locator("#verdictDetail"), "trois lignes à régler").toHaveText("3 choses à régler.");
  await expect(page.locator("#toutRegler"), "mais deux demandes distinctes").toHaveText("Tout régler (2)");
  await page.click("#toutRegler");
  await expect(page.locator("#bandeauOk")).toContainText("2 problèmes pris en main.");
  expect(gestes(envois).map((e) => e.corps)).toEqual([{ action: "reparer", cible: "issue", numero: 556 }, { action: "relancer", cible: "sentinelle" }]);
});

test("㉛ un palier franchi : une bonne nouvelle dans la croissance, jamais un problème à régler", async ({ page }) => {
  await poserSession(page);
  const activation = { ...BASE.activation, inscrits: { ...BASE.activation.inscrits, total: 104, semaine: 9 } };
  await routerFonction(page, [], etat({ activation }));
  await page.goto("/pilotage/");
  const palier = page.locator("#palier");
  await expect(palier).toContainText("100 inscrits atteints");
  await expect(palier).toContainText("Prochain palier : 300 inscrits.");
  await expect(page.locator("#afaire")).not.toContainText("100 inscrits");
  await expect(page.locator("#verdictDetail"), "il ne compte pas parmi les choses à régler").toHaveText("4 choses à régler.");
  // La semaine suivante : retour dans le détail, plus rien sur l'accueil.
  await page.unroute(FONCTION);
  await routerFonction(page, [], etat({ activation: { ...activation, inscrits: { ...activation.inscrits, semaine: 1 } } }));
  await page.click("#actualiser");
  await expect(palier).toBeHidden();
});
