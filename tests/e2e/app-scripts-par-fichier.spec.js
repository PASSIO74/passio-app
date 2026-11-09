// ═══════════════════════════════════════════════════════════════════════════
// LE BLOC APP EN 9 SCRIPTS — UNE VERSION NE FAIT RETÉLÉCHARGER QUE CE QUI A CHANGÉ
// (2026-11-09, capacité sans investir)
//
// Jusque-là `scripts/build.js` concaténait les 9 `js/app-0*.js` dans UN `app.js`
// (417 Ko compressés, mesuré en production) : une version qui ne touchait qu'un
// fichier faisait retélécharger tout le bloc à chaque appareil actif. Il sort
// désormais en 9 scripts `app/<nom>.js?v=<empreinte de SON contenu>`, servis en
// `immutable` (`_headers`), injectés par un chargeur après le gate. Fiche :
// docs/journal/capacite-perf-realtime.md.
//
// Ce que la suite garde, sur un VRAI artefact servi par un serveur de banc aux
// en-têtes de production :
//   ① les 9 sont téléchargés EN PARALLÈLE et exécutés DANS L'ORDRE DU BLOC, même
//     quand le premier arrive en dernier (hoisting entre app-01 et app-09 : un
//     ordre d'arrivée ne doit jamais devenir un ordre d'exécution) ; le signal
//     `passio:app-ready` part UNE fois, après le 9ᵉ ;
//   ② un script qui ne se charge pas est RETENTÉ : l'application démarre quand même ;
//   ③ un script introuvable ARRÊTE le chargement : rien ne s'exécute après lui —
//     app-09 ne démarre jamais une application à laquelle il manque un fichier ;
//   ⑤ comme l'ancien app.js unique, rien ne s'exécute avant que le DERNIER soit
//     arrivé (les minuteurs de démarrage d'app-04 partent avec ceux d'app-08) ;
//   ④ LE BUT, avec le vrai worker : la première visite télécharge chaque script UNE
//     fois (le preload sert l'exécution), une réouverture n'en télécharge AUCUN, et
//     une version qui ne change qu'un fichier ne retélécharge QUE LUI — alors même
//     que le nouveau worker vide son cache à l'activation (le cache HTTP, immutable,
//     rend les autres).
//
// ⚠️ LE SERVEUR AJOUTE UNE SONDE à chaque script servi (`__ordre.push(<nom>)`) : le
// contenu change, pas l'URL — l'ordre d'exécution se lit sans toucher aux sources.
// ⚠️ LA CIBLE SUPABASE DES ARTEFACTS N'EXISTE PAS, ET LE PROXY EST MORT (même banc que
// pwa-maj-pendant-appel.spec.js) : sous WebKit, une requête émise par un worker
// échappe à `page.route`.
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { test, expect } = require("@playwright/test");
const { onboardedState, sansDonneesDistantes } = require("./app-helper");

test.use({ proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1,localhost" } });

const RACINE = path.join(__dirname, "..", "..");
const UID_MOI = "6d0c2b9e-41f7-4a8e-9b3d-5e2f1a7c8d90";
const SOURCE_MODIFIEE = "app-04-comments-shop.js";

// ── Les deux artefacts : B ne diffère de A que par UN fichier du bloc ─────────
let artefacts = null;
let serveur = null;
const etat = { dossier: null, journal: [], fautes: {}, essais: {}, liberes: {} };

function construire(arbre, sortie) {
  const env = {
    ...process.env, COMMIT_REF: "c".repeat(40),
    PASSIO_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    PASSIO_SUPABASE_ANON: "cle-de-banc",
  };
  delete env.GITHUB_SHA;
  delete env.PASSIO_BUILD_TIME;
  execFileSync(process.execPath, ["scripts/build.js", path.join(sortie, "index.html")], { cwd: arbre, env, stdio: "pipe" });
  for (const f of ["manifest.json", "icon-192.png", "icon-512.png"]) fs.copyFileSync(path.join(arbre, f), path.join(sortie, f));
  const page = fs.readFileSync(path.join(sortie, "index.html"), "utf8");
  const scripts = [...page.matchAll(/"app\/(app-0\d[\w-]*\.js)\?v=([0-9a-f]+)"/g)].map((m) => ({ nom: m[1], v: m[2] }));
  const css = "styles.css" + (/"styles\.css(\?v=[0-9a-f]+)"/.exec(page) || [])[1];
  return { release: JSON.parse(fs.readFileSync(path.join(sortie, "release.json"), "utf8")), scripts, css };
}

function deuxArtefacts() {
  const arbre = fs.mkdtempSync(path.join(os.tmpdir(), "passio-app-scripts-"));
  fs.mkdirSync(path.join(arbre, "scripts"));
  for (const d of ["js", "data"]) fs.cpSync(path.join(RACINE, d), path.join(arbre, d), { recursive: true });
  for (const f of ["index.html", "styles.css", "sw.js", "manifest.json", "icon-192.png", "icon-512.png", "scripts/build.js"]) {
    fs.copyFileSync(path.join(RACINE, f), path.join(arbre, f));
  }
  const a = path.join(arbre, "dist-a");
  const b = path.join(arbre, "dist-b");
  const A = construire(arbre, a);
  fs.appendFileSync(path.join(arbre, "js", SOURCE_MODIFIEE), '\nwindow.__versionServie = "B";\n');
  const B = construire(arbre, b);
  return { arbre, a, b, A, B };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png" };

// Les en-têtes de production qui comptent ici (`_headers`) : les scripts app/ un an,
// immutable ; la page, le worker et le contrat jamais en cache.
function servir() {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const chemin = decodeURIComponent(url.pathname);
    const rel = chemin === "/" ? "index.html" : chemin.replace(/^\/+/, "");
    const f = path.join(etat.dossier, rel);
    const scriptApp = /^app\/(app-0\d[\w-]*\.js)$/.exec(rel);
    const nom = scriptApp && scriptApp[1];
    etat.journal.push({ rel, query: url.search, t: Date.now() });
    if (!f.startsWith(etat.dossier) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    const faute = (nom && etat.fautes[nom]) || {};
    if (nom) etat.essais[nom] = (etat.essais[nom] || 0) + 1;
    if (faute.toujours || (faute.echecs && etat.essais[nom] <= faute.echecs)) {
      res.writeHead(503, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    let corps = fs.readFileSync(f);
    // La sonde note aussi l'heure du PREMIER script exécuté (⑤).
    if (nom) corps = Buffer.concat([corps, Buffer.from("\n;window.__debut = window.__debut || Date.now(); (window.__ordre = window.__ordre || []).push(" + JSON.stringify(nom) + ");\n")]);
    const envoyer = () => {
      if (nom) etat.liberes[nom] = Date.now();
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(f)] || "application/octet-stream",
        "Cache-Control": (nom || rel === "styles.css") ? "public, max-age=31536000, immutable" : "no-store",
      });
      res.end(corps);
    };
    if (faute.retard) setTimeout(envoyer, faute.retard); else envoyer();
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

test.beforeAll(async () => {
  test.setTimeout(180000);
  artefacts = deuxArtefacts();
  serveur = await servir();
});

test.afterAll(async () => {
  if (serveur) await new Promise((ok) => serveur.close(ok));
  if (artefacts) fs.rmSync(artefacts.arbre, { recursive: true, force: true });
});

let erreurs = [];
test.beforeEach(async ({ page }) => {
  test.setTimeout(90000);
  etat.dossier = artefacts.a;
  etat.journal = [];
  etat.fautes = {};
  etat.essais = {};
  etat.liberes = {};
  erreurs = [];
  page.on("pageerror", (e) => erreurs.push(String(e && e.message)));
  await page.addInitScript(({ local, uid }) => {
    window.__ordre = window.__ordre || [];
    window.addEventListener("passio:app-ready", () => { window.__ordre.push("ready"); window.__appPrete = true; });
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_uid", uid);
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(local));
  }, { local: onboardedState(1), uid: UID_MOI });
});

const adresse = () => "http://127.0.0.1:" + serveur.address().port + "/index.html";
const nomsA = () => artefacts.A.scripts.map((s) => s.nom);
// Une ReferenceError est la signature d'un script exécuté avant celui qui le définit
// (Chromium : « is not defined » ; WebKit : « Can't find variable »). ⚠️ Pas
// d'apostrophe dans la regex : l'épurateur des gardes (audit-tests-isolation.js) y
// verrait l'ouverture d'une chaîne et avalerait la suite du fichier.
const referencesManquantes = () => erreurs.filter((m) => /is not defined|Can.t find variable/i.test(m));
const requetesApp = (depuis = 0) => etat.journal.filter((r) => r.t >= depuis && /^app\//.test(r.rel));
// Tous les fichiers VERSIONNÉS (empreinte dans l'adresse) : les 9 scripts et la feuille de style.
const requetesVersionnees = (depuis = 0) => etat.journal.filter((r) => r.t >= depuis && /^\?v=/.test(r.query) && (/^app\//.test(r.rel) || r.rel === "styles.css"));

test.describe("sans worker : l'ordre, le parallélisme, la reprise, l'arrêt", () => {
  test.use({ serviceWorkers: "block" });
  test.beforeEach(async ({ page }) => { await sansDonneesDistantes(page); });

  test("① 9 scripts téléchargés en parallèle, exécutés dans l'ordre du bloc — même quand le premier arrive en dernier", async ({ page }) => {
    expect(nomsA(), "prémisse : l'artefact charge 9 scripts").toHaveLength(9);
    etat.fautes = { [nomsA()[0]]: { retard: 1500 } };
    await page.goto(adresse());
    await page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 });

    const ordre = await page.evaluate(() => window.__ordre);
    expect(ordre, "exécution dans l'ordre du bloc, puis UN seul passio:app-ready").toEqual([...nomsA(), "ready"]);
    // Parallèle : les 8 autres sont demandés AVANT que le premier soit rendu — un
    // chargement en série aurait attendu son `load`.
    const libere = etat.liberes[nomsA()[0]];
    expect(libere, "prémisse : le premier script a bien été retenu").toBeTruthy();
    for (const nom of nomsA().slice(1)) {
      const r = etat.journal.find((x) => x.rel === "app/" + nom);
      expect(r, nom + " a été demandé").toBeTruthy();
      expect(r.t, nom + " demandé avant que le premier arrive").toBeLessThan(libere);
    }
    expect(await page.evaluate(() => typeof boot)).toBe("function");
    // Et l'application a réellement démarré sur ses 9 scripts : le fil est peint.
    await page.waitForSelector("#screen-feed.active", { state: "attached", timeout: 30000 });
    expect(referencesManquantes()).toEqual([]);
  });

  test("② un script qui ne se charge pas est retenté : l'application démarre quand même", async ({ page }) => {
    etat.fautes = { [SOURCE_MODIFIEE]: { echecs: 2 } };
    await page.goto(adresse());
    await page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 });
    expect(await page.evaluate(() => window.__ordre)).toEqual([...nomsA(), "ready"]);
    expect(etat.essais[SOURCE_MODIFIEE], "deux refus, puis le script : il a fallu le redemander").toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => typeof boot)).toBe("function");
    await page.waitForSelector("#screen-feed.active", { state: "attached", timeout: 30000 });
    expect(referencesManquantes()).toEqual([]);
  });

  // ⑤ Comme l'ancien app.js unique : rien ne s'exécute avant que TOUT soit arrivé.
  // Sinon un minuteur de démarrage armé par app-04 (files de rejeu, 4 s) courrait
  // pendant qu'app-08 se télécharge encore, et rendrait la main sans se réarmer
  // (relecture de la PR #801). Mutation : partir dès le premier script reçu → rouge.
  test("⑤ rien ne s'exécute avant l'arrivée du DERNIER script, puis les 9 s'enchaînent", async ({ page }) => {
    const dernier = nomsA()[nomsA().length - 1];
    etat.fautes = { [dernier]: { retard: 1500 } };
    await page.goto(adresse());
    await page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 });
    expect(await page.evaluate(() => window.__ordre)).toEqual([...nomsA(), "ready"]);
    const debut = await page.evaluate(() => window.__debut);
    expect(etat.liberes[dernier], "prémisse : le dernier script a bien été retenu").toBeTruthy();
    expect(debut, "le premier script ne s'exécute qu'une fois le dernier arrivé").toBeGreaterThanOrEqual(etat.liberes[dernier]);
    expect(referencesManquantes()).toEqual([]);
  });

  test("③ un script introuvable ARRÊTE le chargement : rien ne s'exécute après lui", async ({ page }) => {
    etat.fautes = { [SOURCE_MODIFIEE]: { toujours: true } };
    const abandon = page.waitForEvent("console", { predicate: (m) => /ne se charge pas/.test(m.text()), timeout: 20000 });
    await page.goto(adresse());
    await abandon;
    await page.waitForTimeout(500);
    const i = nomsA().indexOf(SOURCE_MODIFIEE);
    expect(await page.evaluate(() => window.__ordre), "seuls les scripts d'AVANT ont tourné, et aucun signal « prête »")
      .toEqual(nomsA().slice(0, i));
    // `boot` est défini par app-08 : il n'existe pas, donc app-09 n'a rien démarré.
    expect(await page.evaluate(() => [typeof boot, window.__appPrete === true])).toEqual(["undefined", false]);
    expect(etat.essais[SOURCE_MODIFIEE], "trois essais au moins avant d'abandonner").toBeGreaterThanOrEqual(3);
    expect(referencesManquantes()).toEqual([]);
  });
});

// ⚠️ ICI, AUCUN `page.route` — DONC PAS DE `sansDonneesDistantes`. Playwright COUPE
// le cache HTTP du navigateur dès qu'une route est posée : la première version de ce
// cas voyait les 9 scripts repartir à chaque réouverture, et ce n'était pas
// l'application (mesuré le 2026-11-09 sans route : 0 requête sous Chromium, worker
// ou non, à la navigation comme au rechargement). L'isolation vient d'ailleurs : la
// cible Supabase des artefacts n'existe pas et le proxy est mort — aucune requête ne
// quitte le poste.
// ⚠️ SOUS WEBKIT, LE `fetch` DU WORKER NE VOIT PAS LE CACHE OÙ LA PAGE A RANGÉ SES
// SCRIPTS (mesuré le même jour : premier chargement contrôlé = 9 requêtes, et une
// mise à jour d'UN fichier = 9 requêtes avec le worker d'avant ce lot, et la feuille de
// style repartait à chaque version). D'où la recopie à l'installation (sw.js,
// `FICHIERS_VERSION`) : ce cas ne dépend plus d'aucun cache HTTP, et il passe sur les
// DEUX moteurs (socle WebKit, playwright.config.js).
test.describe("avec le vrai worker : ce qui part sur le réseau", () => {
  const controleur = () => !!navigator.serviceWorker.controller;
  const lireBuild = (page) => page.evaluate(() => (window.PASSIO_RELEASE && window.__appPrete === true) ? window.PASSIO_RELEASE.buildId : null).catch(() => null);

  test("④ une version qui ne change qu'un script ne fait retélécharger QUE lui", async ({ page }) => {
    // Première visite : les 9 scripts et la feuille de style, rien d'autre de
    // versionné. Chacun part une fois pour la page (le preload sert l'exécution), et
    // au plus une fois de plus pour l'installation du worker : sous WebKit, son
    // `fetch` ne voit pas le cache de la page (sous Chromium, il le voit).
    await page.goto(adresse());
    await page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 });
    await page.waitForFunction(controleur, null, { polling: 50, timeout: 20000 });
    const versionnesA = [...artefacts.A.scripts.map((s) => "app/" + s.nom + "?v=" + s.v), artefacts.A.css].sort();
    const premiere = {};
    for (const r of requetesVersionnees()) premiere[r.rel + r.query] = (premiere[r.rel + r.query] || 0) + 1;
    expect(Object.keys(premiere).sort(), "première visite : les fichiers versionnés de A, rien d'autre").toEqual(versionnesA);
    for (const [u, n] of Object.entries(premiere)) expect(n, u + " : au plus page + installation").toBeLessThanOrEqual(2);
    const enCache = await page.evaluate((n) => caches.open(n).then((c) => c.keys()).then((k) => k.map((r) => r.url)), "passio-v" + artefacts.A.release.buildId);
    expect(enCache.map((u) => u.replace(/^https?:\/\/[^/]+\//, "")).filter((u) => /\?v=/.test(u)).sort(),
      "l'installation a mis les fichiers versionnés de A dans le cache du worker").toEqual(versionnesA);

    // Réouverture, le worker aux commandes : rien de versionné ne repart.
    const avantReouverture = Date.now();
    await page.reload();
    await page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 });
    expect(await page.evaluate(controleur), "prémisse : le worker contrôle la page").toBe(true);
    expect(requetesVersionnees(avantReouverture).map((r) => r.rel), "réouverture : rien ne repart").toEqual([]);

    // Le déploiement de B, puis ce que fait `majSilencieuse` toutes les 60 s : le
    // worker B s'installe, VIDE l'ancien cache, et la page recharge sur B.
    const changes = artefacts.B.scripts.filter((s, i) => s.v !== artefacts.A.scripts[i].v);
    expect(changes.map((s) => s.nom), "prémisse : B ne change qu'un script").toEqual([SOURCE_MODIFIEE]);
    const avantB = Date.now();
    etat.dossier = artefacts.b;
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()).catch(() => {})).catch(() => {});
    await expect.poll(() => lireBuild(page), { timeout: 30000, intervals: [100] }).toBe(artefacts.B.release.buildId);
    expect(await page.evaluate(() => window.__versionServie)).toBe("B");
    expect(await page.evaluate(() => caches.keys()), "prémisse : le cache de A a été vidé")
      .toEqual(["passio-v" + artefacts.B.release.buildId]);

    expect(artefacts.B.css, "prémisse : B garde la même feuille de style").toBe(artefacts.A.css);
    expect(requetesVersionnees(avantB).map((r) => r.rel + r.query), "seul le script modifié repart sur le réseau — ni les 8 autres, ni la feuille de style")
      .toEqual(["app/" + SOURCE_MODIFIEE + "?v=" + changes[0].v]);
    expect(referencesManquantes()).toEqual([]);
  });
});

// Témoin du banc : les empreintes que la page cite sont celles du contenu servi.
test("témoin : chaque ?v= de l'artefact est l'empreinte de son fichier", async () => {
  for (const [dossier, scripts] of [[artefacts.a, artefacts.A.scripts], [artefacts.b, artefacts.B.scripts]]) {
    for (const s of scripts) {
      const h = crypto.createHash("sha1").update(fs.readFileSync(path.join(dossier, "app", s.nom))).digest("hex").slice(0, 10);
      expect(s.v, s.nom).toBe(h);
    }
  }
});
