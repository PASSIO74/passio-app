// ═══════════════════════════════════════════════════════════════════════════
// LA PAGE, DANS UN VRAI NAVIGATEUR — le seul test qui voit ce qui s'affiche.
//
// Tout le reste de cette suite lit du code. Ici on démarre le serveur, on ouvre
// Chromium, on se connecte, et on regarde. Deux raisons de l'avoir écrit :
//
//   1. VALIDER LA CORRECTION D'INJECTION. Elle a réécrit 33 gestionnaires de
//      clic. Une erreur de virgule dans l'un d'eux ne casse rien au chargement :
//      le bouton devient simplement inerte, ou lève dans la console au clic. Un
//      test statique ne peut pas le voir — un navigateur, si.
//   2. PROUVER QUE LA FAILLE EST FERMÉE, avec la vraie chaîne : un message
//      d'erreur hostile servi par l'API, rendu par la page, cliqué. Si l'échappement
//      cédait, la charge s'exécuterait ici et le test le dirait.
//
// Les réponses de l'API sont interceptées côté navigateur : ce test ne dépend ni
// de Supabase, ni de données réelles, et peut donc injecter une charge hostile
// sans rien écrire nulle part.
// ═══════════════════════════════════════════════════════════════════════════
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { demarrerServeur, MDP } from "./aide-serveur.js";

// Chromium est fourni par l'environnement ; le paquet `playwright` peut viser
// une autre révision. On prend le binaire présent plutôt que d'en télécharger un.
const CHEMINS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH,
].filter(Boolean);
const BINAIRE = CHEMINS.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

let serveur = null, navigateur = null, chromium = null, indisponible = null;

before(async () => {
  // ⚠️ Saut EXPLICITE et bruyant, jamais silencieux : sans Chromium, ce fichier
  // ne prouve rien, et il doit le dire. L'échappement reste couvert par
  // `spa-echappement.test.js`, qui lit le source et ne demande aucun navigateur.
  if (!BINAIRE) { indisponible = "aucun binaire Chromium (voir CHROMIUM_PATH)"; return; }
  try { ({ chromium } = await import("playwright")); }
  catch { indisponible = "le paquet `playwright` n'est pas installé (npm i -D playwright)"; return; }
  try {
    serveur = await demarrerServeur();
    navigateur = await chromium.launch({ executablePath: BINAIRE, args: ["--no-sandbox"] });
  } catch (e) { indisponible = "Chromium n'a pas démarré : " + String(e.message).slice(0, 120); }
}, { timeout: 120_000 });

/** À appeler en tête de chaque test : rend `true` s'il faut sauter, en le disant. */
function sauter(t) {
  if (!indisponible) return false;
  t.skip("navigateur indisponible — " + indisponible);
  return true;
}

after(async () => {
  try { await navigateur?.close(); } catch {}
  serveur?.arreter();
});

/** Ouvre une page connectée, en collectant TOUT ce que la console reproche. */
async function pageConnectee() {
  const ctx = await navigateur.newContext({ baseURL: serveur.base });
  const page = await ctx.newPage();
  const soucis = [];
  page.on("console", (m) => { if (m.type() === "error") soucis.push("console: " + m.text()); });
  page.on("pageerror", (e) => soucis.push("exception: " + e.message));
  page.on("dialog", async (d) => { soucis.push("DIALOGUE: " + d.message()); await d.dismiss(); });

  await page.goto("/");
  await page.waitForSelector("#loginForm", { timeout: 20_000 });
  await page.fill("#loginUser", "admin_test");
  await page.fill("#loginPass", MDP);
  await page.click("#loginForm button[type=submit]");
  await page.waitForSelector("#nav a", { timeout: 20_000 });
  return { ctx, page, soucis };
}

test("la page se charge, la connexion passe, la navigation est rendue", async (t) => {
  if (sauter(t)) return;
  const { ctx, page, soucis } = await pageConnectee();
  const onglets = await page.$$eval("#nav a", (as) => as.map((a) => a.dataset.id));
  assert.ok(onglets.length >= 10, `navigation trop courte : ${onglets.length} entrées`);
  assert.ok(onglets.includes("overview"));
  // Les 401 d'avant la connexion sont attendus : la page interroge `/api/me`
  // pour savoir si une session existe, et la réponse « non » passe par un 401.
  assert.deepEqual(soucis.filter((x) => !/Failed to load resource/.test(x)), [],
    "l'ouverture de la page ne doit rien reprocher d'autre");
  await ctx.close();
});

test("chaque onglet s'affiche sans rien casser", async (t) => {
  if (sauter(t)) return;
  const { ctx, page, soucis } = await pageConnectee();
  const onglets = await page.$$eval("#nav a", (as) => as.map((a) => a.dataset.id));

  const vides = [];
  for (const id of onglets) {
    await page.goto("/#" + id);
    await page.waitForTimeout(180);
    const contenu = (await page.$eval("#view", (n) => n.textContent.trim()).catch(() => "")) || "";
    if (contenu.length < 20) vides.push(id);
  }
  // Sans Supabase, les panneaux affichent « non configuré » — mais ils affichent
  // QUELQUE CHOSE. Un onglet réellement vide est le défaut qu'on cherche.
  assert.deepEqual(vides, [], "des onglets ne rendent rien du tout");
  assert.deepEqual(soucis.filter((s) => !/Failed to load resource|favicon/.test(s)), [],
    "un onglet lève une erreur JavaScript");
  await ctx.close();
});

test("INJECTION : un message d'erreur hostile ne s'exécute pas, et le bouton marche", async (t) => {
  if (sauter(t)) return;
  const { ctx, page, soucis } = await pageConnectee();

  // La charge exacte qui cassait l'attribut avant le correctif.
  const CHARGE = `x'); window.__injecte = true; alert(1); //`;
  const bug = {
    id: "abcdef123456", title: CHARGE, message: CHARGE, stack: CHARGE,
    severity: "critical", status: "nouveau", count: 3, users: 1, devices: 1,
    versions: ["1.0"], screens: ["feed"], firstSeen: Date.now(), lastSeen: Date.now(),
    samples: [], codeRef: null,
  };
  await page.route("**/api/bugs", (r) => r.fulfill({ json: [bug] }));
  await page.route("**/api/bugs/*", (r) => r.fulfill({ json: { ...bug, snippet: null, timeline: [] } }));

  await page.goto("/#bugs");
  await page.waitForSelector("#bugRows tr", { timeout: 20_000 });

  // ① L'attribut a bien été écrit, et la charge n'y est pas une apostrophe vive.
  const attributs = await page.$$eval("#bugRows tr", (trs) => trs.map((t) => t.getAttribute("onclick") || ""));
  assert.ok(attributs.some((a) => a.includes("__bug(")), "la ligne doit porter son gestionnaire");

  // ② Ouvrir la fiche : c'est là que vivent les six boutons réécrits.
  await page.click("#bugRows tr");
  await page.waitForTimeout(400);

  // ③ Rien n'a été exécuté : ni marqueur, ni boîte de dialogue.
  assert.equal(await page.evaluate(() => window.__injecte), undefined,
    "la charge s'est exécutée : l'échappement ne tient pas");
  assert.deepEqual(soucis.filter((s) => s.startsWith("DIALOGUE")), []);

  // ④ Et le texte hostile s'affiche bien — échappé, donc lisible tel quel.
  const texte = await page.evaluate(() => document.body.innerText);
  assert.ok(texte.includes("window.__injecte = true"),
    "le message doit rester VISIBLE : neutraliser n'est pas censurer");

  // ⑤ Un bouton réécrit fonctionne toujours (c'est la moitié du risque du
  //    correctif : 33 gestionnaires réécrits, dont aucun ne doit être inerte).
  const boutons = await page.$$("button.btn-sm");
  let clique = false;
  for (const b of boutons) {
    if (((await b.textContent()) || "").includes("Erreur")) { await b.click(); clique = true; break; }
  }
  assert.ok(clique, "le bouton « Copier l'erreur » doit être présent");
  await page.waitForTimeout(200);
  assert.deepEqual(soucis.filter((s) => s.startsWith("exception")), [],
    "cliquer un gestionnaire réécrit ne doit lever aucune exception");

  await ctx.close();
});

test("INJECTION : une gravité fabriquée n'ouvre pas d'attribut", async (t) => {
  if (sauter(t)) return;
  const { ctx, page, soucis } = await pageConnectee();
  // `severity` part directement dans `class="pill ${…}"`. Un guillemet suffisait.
  const bug = {
    id: "0badc0de0bad", title: "Bug ordinaire", message: "msg",
    severity: `x" onmouseover="window.__injecte2 = true`, status: "nouveau",
    count: 1, users: 1, devices: 1, versions: [], screens: [], samples: [],
    firstSeen: Date.now(), lastSeen: Date.now(),
  };
  await page.route("**/api/bugs", (r) => r.fulfill({ json: [bug] }));
  await page.goto("/#bugs");
  await page.waitForSelector("#bugRows tr", { timeout: 20_000 });

  const attrs = await page.$$eval("#bugRows .pill", (ns) => ns.map((n) => n.getAttributeNames().join(",")));
  assert.ok(attrs.length > 0, "la pastille de gravité doit être rendue");
  for (const a of attrs) {
    assert.ok(!a.includes("onmouseover"), "un attribut a été fabriqué depuis la gravité : " + a);
  }
  assert.equal(await page.evaluate(() => window.__injecte2), undefined);
  assert.deepEqual(soucis.filter((s) => s.startsWith("exception")), []);
  await ctx.close();
});

test("quitter un onglet pendant son rafraîchissement ne lève rien", async (t) => {
  if (sauter(t)) return;
  const { ctx, page, soucis } = await pageConnectee();

  // On retarde délibérément la réponse de l'Accueil, puis on change d'onglet
  // pendant l'attente. Avant le correctif, le rafraîchissement écrivait dans un
  // `#ovProv` déjà remplacé : « Cannot set properties of null », et tout le
  // reste du rafraîchissement était abandonné en silence.
  await page.route("**/api/overview", async (r) => {
    await new Promise((res) => setTimeout(res, 600));
    r.continue();
  });

  await page.goto("/#overview");
  await page.waitForTimeout(120);          // le rafraîchissement est parti…
  await page.goto("/#alerts");             // …et on quitte pendant qu'il attend
  await page.waitForTimeout(1200);         // largement de quoi laisser la réponse arriver

  assert.deepEqual(soucis.filter((s) => s.startsWith("exception")), [],
    "un rafraîchissement en vol ne doit pas lever quand sa cible a disparu");
  await ctx.close();
});
