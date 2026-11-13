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
//   ⑤ comme avec l'ancien app.js unique, l'application s'exécute AVANT l'événement
//     `load` de la page, même quand le dernier script tarde ;
//   ④ LE BUT, avec le vrai worker : la première visite télécharge chaque script UNE
//     fois (le preload sert l'exécution), une réouverture n'en télécharge AUCUN, et
//     une version qui ne change qu'un fichier ne retélécharge QUE LUI — alors même
//     que le nouveau worker vide son cache à l'activation (le cache HTTP, immutable,
//     rend les autres) ;
//   ⑥ un 404 « immutable » (celui de la production pour une adresse absente sous
//     /app/) resté dans le cache du navigateur après un retour arrière ne l'empêche
//     plus de démarrer une fois l'adresse rétablie : la reprise redemande l'adresse
//     au réseau (`cache: "reload"`) avant de réinsérer le script ;
//   ⑦ ⑧ un retour arrière entre deux versions d'APRÈS le découpage (Netlify ignore le
//     `?v=`) range l'ANCIEN contenu d'un script sous sa NOUVELLE adresse, en 200
//     immutable — dans le cache HTTP (⑦), dans celui du worker (⑧). Une fois la
//     nouvelle version rétablie, ce script périmé n'est plus exécuté : l'attribut
//     `integrity` le refuse, la reprise le redemande au réseau, et le worker honore
//     la redemande au lieu de resservir son cache ;
//   ⑪ ⑫ dans l'ordre ORDINAIRE de la production, le bloc tourne APRÈS les modules de fin
//     de page : la barre du bas v2 est déjà construite, avec ses écouteurs, quand app-08
//     branche la barre historique. Un toucher sur l'une ou l'autre = UN `goTo`, UNE entrée
//     d'historique, et un retour revient au fil (⑪ barre v2, ⑫ barre historique).
//
// ⚠️ LA SONDE EST DANS LA PAGE, PAS DANS LES SCRIPTS (2026-11-10) : un écouteur `load`
// en capture sur `document` note chaque script du bloc quand il a tourné (`__ordre`),
// AVANT le `onload` du chargeur — l'ordre d'exécution se lit sans toucher ni aux
// sources ni aux octets servis. Jusqu'au 2026-11-10 le serveur l'ajoutait au contenu
// de chaque script : depuis l'attribut `integrity` (⑦ ⑧), un octet de plus et le
// navigateur refuse le script. ⚠️ Sur `document`, pas sur `window` : un événement
// `load` ne remonte jamais jusqu'à `window` (DOM, « get the parent » d'un Document).
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

const PROXY_MORT = { server: "http://127.0.0.1:9", bypass: "127.0.0.1,localhost" };
test.use({ proxy: PROXY_MORT });

const RACINE = path.join(__dirname, "..", "..");
const UID_MOI = "6d0c2b9e-41f7-4a8e-9b3d-5e2f1a7c8d90";
const SOURCE_MODIFIEE = "app-04-comments-shop.js";
// La règle que C ajoute à la feuille de style de A (⑨ ⑩) : lue par `getComputedStyle`.
const MARQUE_FEUILLE_C = '\n:root{--passio-version-feuille:"C"}\n';

// ── Les artefacts : B ne diffère de A que par UN fichier du bloc, C que par la
//    feuille de style ───────────────────────────────────────────────────────────
let artefacts = null;
let serveur = null;
// `basculeApresPage` : le dossier que sert le site JUSTE APRÈS la page (un retour
// arrière qui tombe entre la page et ses scripts, ⑦). `swDe` : le dossier dont vient
// `sw.js`, quand il n'est pas celui du reste du site (le worker d'une version
// installé pendant le retour arrière vers une autre, ⑧).
const etat = { dossier: null, basculeApresPage: null, swDe: null, journal: [], fautes: {}, essais: {}, liberes: {} };

function construire(arbre, sortie) {
  const env = {
    ...process.env, COMMIT_REF: "c".repeat(40),
    PASSIO_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    PASSIO_SUPABASE_ANON: "cle-de-banc",
  };
  delete env.GITHUB_SHA;
  delete env.PASSIO_BUILD_TIME;
  // L'arbre jetable n'a pas de node_modules : un build qui minifierait (variable héritée
  // du poste ou d'une passe « Gates artefact ») n'y trouverait ni terser ni clean-css.
  delete env.PASSIO_MINIFIER_APP;
  execFileSync(process.execPath, ["scripts/build.js", path.join(sortie, "index.html")], { cwd: arbre, env, stdio: "pipe" });
  for (const f of ["manifest.json", "icon-192.png", "icon-512.png"]) fs.copyFileSync(path.join(arbre, f), path.join(sortie, f));
  const page = fs.readFileSync(path.join(sortie, "index.html"), "utf8");
  const scripts = [...page.matchAll(/"app\/(app-0\d[\w-]*\.js)\?v=([0-9a-f]+)"/g)].map((m) => ({ nom: m[1], v: m[2] }));
  const css = "styles.css" + (/"styles\.css(\?v=[0-9a-f]+)"/.exec(page) || [])[1];
  return { release: JSON.parse(fs.readFileSync(path.join(sortie, "release.json"), "utf8")), scripts, css };
}

function construireArtefacts() {
  const arbre = fs.mkdtempSync(path.join(os.tmpdir(), "passio-app-scripts-"));
  fs.mkdirSync(path.join(arbre, "scripts"));
  for (const d of ["js", "data"]) fs.cpSync(path.join(RACINE, d), path.join(arbre, d), { recursive: true });
  for (const f of ["index.html", "styles.css", "sw.js", "manifest.json", "icon-192.png", "icon-512.png", "scripts/build.js"]) {
    fs.copyFileSync(path.join(RACINE, f), path.join(arbre, f));
  }
  const a = path.join(arbre, "dist-a");
  const b = path.join(arbre, "dist-b");
  const c = path.join(arbre, "dist-c");
  const A = construire(arbre, a);
  // C : la feuille de style de A plus UNE règle, les 9 scripts de A (⑨ ⑩).
  const feuille = path.join(arbre, "styles.css");
  const feuilleA = fs.readFileSync(feuille);
  fs.appendFileSync(feuille, MARQUE_FEUILLE_C);
  const C = construire(arbre, c);
  fs.writeFileSync(feuille, feuilleA);
  fs.appendFileSync(path.join(arbre, "js", SOURCE_MODIFIEE), '\nwindow.__versionServie = "B";\n');
  const B = construire(arbre, b);
  return { arbre, a, b, c, A, B, C };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png" };

// Le 404 que la PRODUCTION rend pour une adresse absente sous /app/ (mesuré le
// 2026-11-09 sur passio-app.netlify.app) : Netlify y applique la règle `/app/*` de
// `_headers`, donc `public,max-age=31536000,immutable`, avec une page HTML d'environ
// 3,7 Ko et un ETag sans guillemets (⑥).
const ENTETES_404_PRODUCTION = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public,max-age=31536000,immutable", "ETag": "1779914909-ssl" };
const PAGE_404 = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\" /><title>Page not found</title></head><body><h1>Page not found</h1><p>"
  + "This page does not exist on this site. ".repeat(90) + "</p></body></html>";

// Les en-têtes de production qui comptent ici (`_headers`) : les scripts app/ un an,
// immutable ; la page, le worker et le contrat jamais en cache.
function servir() {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const chemin = decodeURIComponent(url.pathname);
    const rel = chemin === "/" ? "index.html" : chemin.replace(/^\/+/, "");
    const dossier = (rel === "sw.js" && etat.swDe) || etat.dossier;
    // Le retour arrière tombe juste après la page : ses scripts viendront de l'autre version (⑦).
    if (rel === "index.html" && etat.basculeApresPage) {
      etat.dossier = etat.basculeApresPage;
      etat.basculeApresPage = null;
    }
    const f = path.join(dossier, rel);
    const scriptApp = /^app\/(app-0\d[\w-]*\.js)$/.exec(rel);
    const nom = scriptApp && scriptApp[1];
    // `reload` : la demande vient d'un `fetch(…, { cache: "reload" })`, que le navigateur
    // annonce par `Cache-Control: no-cache` et `Pragma: no-cache` (Fetch, « HTTP-network-or-cache
    // fetch »). `statut` : ce que le banc a répondu (⑥). `version` : l'artefact qui a
    // répondu, quelle que soit l'empreinte demandée — Netlify ignore le `?v=` (⑦ ⑧).
    // `dest` (`Sec-Fetch-Dest`) : `script` pour le preload et la balise, `empty` pour un
    // `fetch` — la redemande de la reprise, avec ou sans `cache: "reload"` (⑦ ⑧).
    const version = dossier === artefacts.a ? "A" : dossier === artefacts.b ? "B" : dossier === artefacts.c ? "C" : "?";
    const entree = { rel, query: url.search, version, dest: String(req.headers["sec-fetch-dest"] || ""), t: Date.now(), reload: /no-cache/i.test(String(req.headers["cache-control"] || "") + " " + String(req.headers.pragma || "")) };
    etat.journal.push(entree);
    if (!f.startsWith(dossier) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      entree.statut = 404;
      res.writeHead(404, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    const faute = (nom && etat.fautes[nom]) || {};
    if (nom) etat.essais[nom] = (etat.essais[nom] || 0) + 1;
    if (faute.toujours || (faute.echecs && etat.essais[nom] <= faute.echecs)) {
      entree.statut = 503;
      res.writeHead(503, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    // Le retour arrière vers un déploiement d'avant le découpage : l'adresse n'existe
    // plus, et le 404 qui le dit est celui de la production — un an, immutable (⑥).
    if (faute.introuvable) {
      entree.statut = 404;
      res.writeHead(404, ENTETES_404_PRODUCTION);
      res.end(PAGE_404);
      return;
    }
    // Les octets du build, tels quels : la sonde est dans la page (`preparer`).
    const corps = fs.readFileSync(f);
    const envoyer = () => {
      if (nom) etat.liberes[nom] = Date.now();
      entree.statut = 200;
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
  artefacts = construireArtefacts();
  serveur = await servir();
});

test.afterAll(async () => {
  if (serveur) await new Promise((ok) => serveur.close(ok));
  if (artefacts) fs.rmSync(artefacts.arbre, { recursive: true, force: true });
});

let erreurs = [];
// Chaque page du banc : la sonde d'ordre et de « prête », un compte déjà inscrit.
async function preparer(page) {
  page.on("pageerror", (e) => erreurs.push(String(e && e.message)));
  await page.addInitScript(({ local, uid }) => {
    window.__ordre = window.__ordre || [];
    // La sonde : chaque script du bloc, quand il a tourné (son `load` part après son
    // exécution), avant le `onload` du chargeur (capture) — et l'état du document au
    // premier (⑤). Un script refusé (réseau, `integrity`) ne déclenche que `error`.
    document.addEventListener("load", (e) => {
      const m = e.target && e.target.tagName === "SCRIPT" && /\/app\/(app-0\d[\w-]*\.js)(\?|$)/.exec(e.target.src || "");
      if (!m) return;
      window.__etatAuDebut = window.__etatAuDebut || document.readyState;
      window.__ordre.push(m[1]);
    }, true);
    // La feuille de style (⑨ ⑩) : chaque `load` ou `error` d'un <link> vers styles.css,
    // quand, et si ce lien portait une empreinte — la durée d'une page sans styles se lit ici.
    window.__feuille = window.__feuille || [];
    for (const type of ["load", "error"]) {
      document.addEventListener(type, (e) => {
        const l = e.target;
        if (!l || l.tagName !== "LINK" || !/\/styles\.css(\?|$)/.test(l.href || "")) return;
        window.__feuille.push({ type, t: Math.round(performance.now()), empreinte: l.hasAttribute("integrity") });
      }, true);
    }
    window.addEventListener("passio:app-ready", () => { window.__ordre.push("ready"); window.__appPrete = true; });
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_uid", uid);
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(local));
  }, { local: onboardedState(1), uid: UID_MOI });
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90000);
  etat.dossier = artefacts.a;
  etat.basculeApresPage = null;
  etat.swDe = null;
  etat.journal = [];
  etat.fautes = {};
  etat.essais = {};
  etat.liberes = {};
  erreurs = [];
  await preparer(page);
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
    // Chaque script part UNE fois : le preload sert l'exécution. ⚠️ Il porte la même
    // empreinte `integrity` que la balise (2026-11-10) : sans elle, Chromium ne le
    // réutilise pas et redemande chaque script (mesuré : 18 demandes au lieu de 9 ;
    // WebKit le réutilise dans les deux cas). Les routes de ce bloc coupent le cache
    // HTTP : un second téléchargement atteint le serveur, et se voit ici.
    for (const nom of nomsA()) {
      expect(requetesApp().filter((r) => r.rel === "app/" + nom).map((r) => r.dest), nom + " : une seule demande, celle du preload").toEqual(["script"]);
    }
    // La feuille de style aussi, qui porte son empreinte depuis le 2026-11-10 (⑨ ⑩) : UNE
    // demande, celle du <link> (le pré-chargement spéculatif du navigateur lit l'empreinte
    // avec l'adresse), et pas de reprise — la feuille servie est la bonne.
    expect(requetesVersionnees().filter((r) => r.rel === "styles.css").map((r) => r.dest), "styles.css : une seule demande, celle du <link>").toEqual(["style"]);
    expect(await page.evaluate(() => window.__feuille.map((e) => e.type + (e.empreinte ? "+empreinte" : ""))), "la feuille s'applique du premier coup, avec son empreinte").toEqual(["load+empreinte"]);
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

  // ⑤ Comme avec l'ancien app.js unique, l'application s'exécute AVANT l'événement
  // `load` de la page — même quand le dernier script tarde. Un `<script>` inséré
  // retarde `load`, un `<link rel=preload>` non : un chargeur qui attendait l'arrivée
  // des 9 avant d'insérer quoi que ce soit (essayé le 2026-11-09) laissait la page
  // déclarer `load` à 100 ms, l'application après — et tout ce qui se fie à `load`
  // (l'enregistrement du worker, les bancs qui attendent `goto`) partait trop tôt.
  // Mutation : ce chargeur-là → rouge (mesuré sous Chromium et WebKit).
  test("⑤ l'application s'exécute avant l'événement load de la page, même quand le dernier script tarde", async ({ page }) => {
    const dernier = nomsA()[nomsA().length - 1];
    etat.fautes = { [dernier]: { retard: 1500 } };
    await page.addInitScript(() => {
      window.addEventListener("load", () => { window.__appAuLoad = window.__appPrete === true; });
    });
    await page.goto(adresse());
    await page.waitForFunction(() => window.__appPrete === true && "__appAuLoad" in window, null, { polling: 50, timeout: 30000 });
    expect(etat.liberes[dernier], "prémisse : le dernier script a bien été retenu").toBeTruthy();
    expect(await page.evaluate(() => window.__ordre)).toEqual([...nomsA(), "ready"]);
    // ⚠️ « loading » OU « interactive », jamais « complete » (2026-11-13). Ce qui est
    // mesuré ici, c'est que le premier script a tourné AVANT `load` — pas lequel des deux
    // états. Le chargeur insère le premier script dès le gate franchi, en microtâche, et
    // la page continue de parser-exécuter les ~20 modules inlinés APRÈS lui : savoir qui
    // des deux finit le premier est une course de quelques millisecondes, que la taille
    // de ces modules fait pencher d'un côté ou de l'autre. Figée sur « interactive »,
    // cette mesure a rougi le déploiement du 2026-11-13 (exécution 43433603440, les trois
    // essais) alors que l'application démarrait bien avant `load` — et « loading », c'est
    // exactement ce que faisait l'ancien `app.js`, parseur-bloquant. Un `<script>` inséré
    // retardant `load`, « complete » ne peut sortir d'ici que si le chargeur n'a RIEN
    // inséré avant : la mutation (attendre les 9 avant d'insérer) rougit les deux mesures.
    const [etatAuPremier, preteAuLoad] = await page.evaluate(() => [window.__etatAuDebut, window.__appAuLoad]);
    expect(["loading", "interactive"], "le premier script a tourné avant `load` — readyState : " + etatAuPremier).toContain(etatAuPremier);
    expect(preteAuLoad, "application prête quand `load` part").toBe(true);
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

  // ⑨ CHAQUE SCRIPT N'AVANCE LA CHAÎNE QU'UNE FOIS (2026-11-10, audit de stabilisation).
  // Mesuré en production le 10/11 à 12:18 UTC (version 7dade60f, `client_errors` 211 à 220,
  // 19 `window_error` en télémétrie) : dans une page DÉJÀ démarrée, les `load` des 9 scripts
  // ont été rejoués ~25 s plus tard (un robot de prévisualisation arrivé par `?fbclid=`, écran
  // 2000 × 2000 ; la mesure `page_load` de la page est repartie à l'identique au même instant).
  // Chaque `onload` refaisait `i++` puis `suivant()` : `i` dépassait le nombre de scripts, la
  // garde `i === scripts.length` ne tenait plus, et `scripts[i][0]` levait « Cannot read
  // properties of undefined (reading '0') » — 9 fois par page, comptées comme des erreurs de
  // la production. Un `error` rejoué retirait de la page le script déjà exécuté, et sa
  // reprise levait la même erreur une seconde plus tard.
  // Mutation : sans le désarmement des deux écouteurs (scripts/build.js) → 18 erreurs pour
  // 9 `load` et 9 `error` rejoués, rouge (mesuré avant le correctif, sous Chromium).
  test("⑨ un load ou un error rejoué sur un script déjà traité ne relance pas le chargeur", async ({ page }) => {
    await page.goto(adresse());
    await page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 });
    await page.waitForSelector("#screen-feed.active", { state: "attached", timeout: 30000 });
    const selecteur = 'script[src*="app/app-0"]';
    expect(await page.evaluate((s) => document.querySelectorAll(s).length, selecteur), "prémisse : les 9 scripts du bloc sont dans la page").toBe(9);
    erreurs = [];
    const depuis = Date.now();
    await page.evaluate((s) => {
      document.querySelectorAll(s).forEach((el) => {
        el.dispatchEvent(new Event("load"));
        el.dispatchEvent(new Event("error"));
      });
    }, selecteur);
    // La reprise d'un `error` part au bout d'une seconde : on attend au-delà.
    await page.waitForTimeout(1600);
    expect(erreurs, "aucune erreur levée par le chargeur").toEqual([]);
    expect(await page.evaluate((s) => document.querySelectorAll(s).length, selecteur), "aucun script retiré ni inséré de nouveau").toBe(9);
    expect(requetesApp(depuis), "aucune redemande d'un script").toEqual([]);
    expect((await page.evaluate(() => window.__ordre)).filter((x) => x === "ready"), "le signal passio:app-ready n'est parti qu'une fois").toHaveLength(1);
    expect(referencesManquantes()).toEqual([]);
  });

  // ⑪ ⑫ UN TOUCHER SUR LA BARRE DU BAS = UNE NAVIGATION (2026-11-12).
  // Dans l'ordre ORDINAIRE de la production, les 9 scripts tournent APRÈS les modules de fin
  // de page : `ui-v2-shell.js` (inliné) a construit `#appNavV2` et branché SES écouteurs à
  // DOMContentLoaded quand app-08 branche la barre historique. app-08 prenait `.nav-item` sans
  // le borner : il branchait AUSSI les boutons v2. Mesuré en production (b918d9a9, puis 0677abc2)
  // et sur cet artefact, Chromium et WebKit, à chaque ouverture : un toucher = deux `goTo`, deux entrées
  // d'historique, et le premier retour restait sur l'écran ; Entrée = deux `goTo` ; Entrée ou
  // Espace sur « Créer » (bouton natif) n'ouvraient plus la feuille — le `keydown` d'app-08 en
  // empêchait l'activation. En développement, les 9 fichiers précèdent ui-v2 : rien de tout
  // cela, et ui-v2-shell.spec.js restait verte.
  // Le banc RETIENT app-08 jusqu'à DOMContentLoaded : l'ordre de la production, rendu
  // déterministe (une page qui arrive lentement peut l'inverser, ⑤ bis — la barre v2 naît
  // alors après app-08, et n'a qu'un écouteur, avant comme après le correctif).
  // Mutations, mesurées sous Chromium et WebKit : app-08 sur `.nav-item` au lieu de
  // `#appNav .nav-item` → ⑪ rouge sur ses huit mesures, ⑫ vert ; un sélecteur qui ne trouve
  // plus `#appNav` → ⑫ rouge (la barre historique ne navigue plus), ⑪ vert.
  async function ordreDeProduction(page) {
    let liberer;
    const dcl = new Promise((ok) => { liberer = ok; });
    await page.exposeFunction("__passioDcl", () => liberer());
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => { window.__passioDcl(); }, { once: true });
      // Le `load` d'un script part juste après son exécution (même tâche) : on y lit ce
      // qu'app-08 a trouvé dans la page.
      document.addEventListener("load", (e) => {
        const t = e.target;
        if (t && t.tagName === "SCRIPT" && /\/app\/app-08[\w-]*\.js(\?|$)/.test(t.src || "")) {
          window.__barreV2AuApp08 = !!document.getElementById("appNavV2");
        }
      }, true);
    });
    await page.route(/\/app\/app-08[\w-]*\.js/, async (route) => { await dcl; await route.continue(); });
  }

  // Démarre l'application, retire la landing (banc sans session : un compte connecté ne la
  // voit pas, cf. ui-v2-shell.spec.js), puis compte chaque `goTo`, chaque `pushState` et
  // chaque `popstate` — `goTo` est relu au global à chaque appel, par app-08 comme par ui-v2.
  async function demarrerEtCompter(page) {
    await page.goto(adresse());
    await page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 });
    await page.waitForSelector("#screen-feed.active", { state: "attached", timeout: 30000 });
    await page.evaluate(() => {
      const l = document.getElementById("landing");
      if (l) l.classList.remove("active");
      const goTo = window.goTo;
      window.__goTo = [];
      window.goTo = function (ecran) { window.__goTo.push(ecran); return goTo.apply(this, arguments); };
      const pushState = history.pushState;
      window.__push = [];
      history.pushState = function (etatHist, titre, url) { window.__push.push(String(url)); return pushState.apply(this, arguments); };
      window.__pops = 0;
      window.addEventListener("popstate", () => { window.__pops++; });
    });
  }
  const ecranActif = (page) => page.evaluate(() => (document.querySelector(".screen.active") || {}).id || null);
  // Ce que le dernier geste a produit, puis remise à zéro.
  const releve = (page) => page.evaluate(() => {
    const r = { goTo: window.__goTo.slice(), push: window.__push.slice(), longueur: history.length };
    window.__goTo.length = 0;
    window.__push.length = 0;
    return r;
  });
  // Un toucher quand le gabarit est tactile (iPhone, socle WebKit), un clic sinon.
  // ⚠️ `force` : sans l'attente « stable » de Playwright, qui compte sur
  // `requestAnimationFrame`. Au banc local, sous WebKit sans tête et sur un poste chargé,
  // elle n'a jamais rendu la main (3 cas sur 10, `tap` arrêté 15 s sur « waiting for
  // element to be visible, enabled and stable », sans une relance). La visibilité est
  // vérifiée d'abord ; le geste reste un vrai toucher au centre de l'élément, et le moteur
  // fait son propre test de cible : un élément recouvert ne navigue pas, le cas rougit.
  async function toucher(locator, hasTouch) {
    await expect(locator).toBeVisible();
    return hasTouch ? locator.tap({ force: true }) : locator.click({ force: true });
  }
  async function retour(page) {
    const avant = await page.evaluate(() => window.__pops);
    await page.evaluate(() => history.back());
    // 15 s, pas 5 : au banc local, sous WebKit et sur un poste chargé, deux retours sur
    // ~70 n'avaient pas atterri en 5 s (cas à ~19 s au lieu de 4 à 9). La mutation n'en
    // dépend pas : sous le défaut, le retour atterrit bien — sur l'entrée en double.
    try {
      await page.waitForFunction((n) => window.__pops > n, avant, { polling: 50, timeout: 15000 });
    } catch (e) {
      const ou = await page.evaluate(() => ({ etat: document.readyState, adresse: location.href, longueur: history.length, pops: window.__pops, ecran: (document.querySelector(".screen.active") || {}).id || null })).catch(() => null);
      throw new Error("un retour sans popstate en 15 s — la page : " + JSON.stringify(ou) + " — " + e.message);
    }
  }

  test("⑪ barre du bas v2, dans l'ordre de la production : un toucher = un goTo et une entrée d'historique, un retour revient au fil, « Créer » s'ouvre au clavier", async ({ page, hasTouch }) => {
    await ordreDeProduction(page);
    await demarrerEtCompter(page);
    expect(await page.evaluate(() => window.__barreV2AuApp08), "prémisse : la barre v2 était construite quand app-08 a tourné (l'ordre de la production)").toBe(true);
    const longueur = (await releve(page)).longueur;

    // `expect.soft` : un rouge dit TOUT ce que le double branchement casse, pas sa première ligne.
    await toucher(page.locator('#appNavV2 .nav-item[data-screen="irl"]'), hasTouch);
    await expect.poll(() => ecranActif(page), { message: "la barre v2 mène à Rencontrer" }).toBe("screen-irl");
    const geste = await releve(page);
    expect.soft(geste.goTo, "un toucher, une navigation (deux : la barre v2 est branchée deux fois)").toEqual(["irl"]);
    expect.soft(geste.push, "une entrée d'historique").toEqual(["#irl"]);
    expect.soft(geste.longueur - longueur, "history.length +1").toBe(1);

    await retour(page);
    expect.soft(await ecranActif(page), "un retour revient au fil (avec deux entrées, il restait sur Rencontrer)").toBe("screen-feed");
    await releve(page);

    // Au clavier : Entrée sur un onglet…
    await page.focus('#appNavV2 .nav-item[data-screen="irl"]');
    await page.keyboard.press("Enter");
    await expect.poll(() => ecranActif(page), { message: "Entrée sur l'onglet v2 mène à Rencontrer" }).toBe("screen-irl");
    const entree = await releve(page);
    expect.soft(entree.goTo, "Entrée sur un onglet : une navigation").toEqual(["irl"]);
    expect.soft(entree.push, "Entrée sur un onglet : une entrée d'historique").toEqual(["#irl"]);

    // …et sur « Créer », un bouton natif : son activation au clavier n'est empêchée par personne.
    const feuille = page.locator("#v2CreateSheet");
    for (const [touche, nom] of [["Enter", "Entrée"], [" ", "Espace"]]) {
      await page.focus('#appNavV2 [data-v2-action="create"]');
      await page.keyboard.press(touche);
      await expect.soft(feuille, "« Créer » s'ouvre au clavier (" + nom + ")").toBeVisible();
      await page.evaluate(() => window.PassioUIV2.closeCreateSheet());
      await expect(feuille).toBeHidden();
    }
    expect(referencesManquantes()).toEqual([]);
  });

  test("⑫ barre historique (coupure de la v2), même ordre : un toucher = un goTo et une entrée d'historique, un retour revient au fil", async ({ page, hasTouch }) => {
    await page.addInitScript(() => { localStorage.setItem("passio_ui_v2", "0"); });
    await ordreDeProduction(page);
    await demarrerEtCompter(page);
    expect(await page.evaluate(() => [window.__barreV2AuApp08, !!document.getElementById("appNavV2")]), "prémisse : la v2 est coupée, aucune barre v2").toEqual([false, false]);
    const longueur = (await releve(page)).longueur;

    await toucher(page.locator('#appNav .nav-item[data-screen="irl"]'), hasTouch);
    await expect.poll(() => ecranActif(page), { message: "la barre historique mène à Rencontrer" }).toBe("screen-irl");
    const geste = await releve(page);
    expect(geste.goTo, "la barre historique navigue, une fois").toEqual(["irl"]);
    expect(geste.push, "une entrée d'historique").toEqual(["#irl"]);
    expect(geste.longueur - longueur, "history.length +1").toBe(1);

    await retour(page);
    expect(await ecranActif(page), "un retour revient au fil").toBe("screen-feed");
    await releve(page);

    await page.focus('#appNav .nav-item[data-screen="irl"]');
    await page.keyboard.press("Enter");
    await expect.poll(() => ecranActif(page), { message: "Entrée sur l'onglet historique mène à Rencontrer" }).toBe("screen-irl");
    expect((await releve(page)).goTo, "Entrée sur un onglet historique : une navigation").toEqual(["irl"]);
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

// ⑥ UN 404 « IMMUTABLE » RESTÉ EN CACHE NE BLOQUE PLUS LE DÉMARRAGE (2026-11-09).
// Netlify applique la règle `/app/*` de `_headers` aux 404 aussi (mesuré en
// production) : une adresse du lot demandée pendant un RETOUR ARRIÈRE vers un
// déploiement d'avant le découpage (aucun `app/`) revient en 404
// `public,max-age=31536000,immutable`. Quand un redéploiement la rétablit à
// l'identique (fichier inchangé, même `?v=`), le navigateur relit ce 404 — et la
// reprise du chargeur aussi : l'application ne démarrait plus sur cet appareil.
// Le remède (scripts/build.js) : avant chaque reprise, redemander l'adresse en
// `fetch(…, { cache: "reload" })`, qui va au réseau et range la réponse.
// Mutation : sans cette redemande → rouge (la seconde visite relit son 404 trois
// fois, puis le chargeur s'arrête — sans une seule requête au serveur).
// ⚠️ AUCUNE ROUTE ICI NON PLUS (cf. ④) : Playwright couperait le cache HTTP, le 404
// ne serait jamais relu, et le cas passerait sans le remède.
// ⚠️ UN PROFIL PERSISTANT, PAS LE CONTEXTE ÉPHÉMÈRE DU BANC (mesuré le 2026-11-09) :
// sous WebKit, un contexte éphémère de Playwright n'a pas de cache réseau — la
// seconde visite redemandait le script au serveur, et le cas passait sans le remède.
// Un vrai Safari, un vrai Chrome ont un profil et son cache disque : c'est lui qu'on
// éprouve, sur les deux moteurs.
// ⚠️ LA PRÉMISSE EST ASSERTÉE : la seconde visite n'envoie AUCUNE demande ordinaire
// de ce script au serveur (ni son preload, ni son `<script>`) — elle a donc relu le
// 404 en cache. Sans elle, un moteur qui ne garderait pas le 404 rendrait ce cas
// vert sans rien prouver.
test.describe("un 404 immutable resté en cache : la reprise redemande l'adresse au réseau", () => {
  const demandes = (nom, depuis = 0) => etat.journal
    .filter((r) => r.t >= depuis && r.rel === "app/" + nom)
    .map((r) => ({ statut: r.statut, reload: r.reload }));

  test("⑥ un 404 « immutable » mis en cache pendant un retour arrière n'empêche plus l'application de démarrer", async ({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }) => {
    const profil = fs.mkdtempSync(path.join(os.tmpdir(), "passio-profil-"));
    const contexte = await playwright[browserName].launchPersistentContext(profil, {
      ...launchOptions, headless, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale,
      serviceWorkers: "block", proxy: PROXY_MORT,
    });
    try {
      const page = contexte.pages()[0] || await contexte.newPage();
      await preparer(page);

      // 1. Le retour arrière : l'adresse n'existe plus, la production rend son 404 d'un an.
      etat.fautes = { [SOURCE_MODIFIEE]: { introuvable: true } };
      const abandonPendantRetour = page.waitForEvent("console", { predicate: (m) => /ne se charge pas/.test(m.text()), timeout: 30000 });
      await page.goto(adresse());
      await abandonPendantRetour;
      const pendantRetour = demandes(SOURCE_MODIFIEE);
      expect(pendantRetour.length, "prémisse : le script a été demandé pendant le retour arrière").toBeGreaterThan(0);
      expect(pendantRetour.every((r) => r.statut === 404), "prémisse : chaque demande a reçu le 404 de production — " + JSON.stringify(pendantRetour)).toBe(true);

      // 2. Le redéploiement rétablit l'adresse à l'identique (même fichier, même `?v=`),
      //    et l'appareil rouvre l'application.
      etat.fautes = {};
      const depuis = Date.now();
      const abandon = page.waitForEvent("console", { predicate: (m) => /ne se charge pas/.test(m.text()), timeout: 30000 })
        .then(() => "le chargeur abandonne", () => "délai dépassé");
      await page.goto(adresse());
      const prete = page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 })
        .then(() => "application prête", () => "délai dépassé");
      const issue = await Promise.race([prete, abandon]);
      const apres = demandes(SOURCE_MODIFIEE, depuis);
      expect(issue, "l'application démarre sur l'adresse rétablie — demandes reçues par le serveur : " + JSON.stringify(apres)).toBe("application prête");
      // La prémisse : ni le preload ni le `<script>` de la nouvelle page ne sont allés au
      // réseau — ils ont relu le 404 en cache —, et la seule demande est la redemande.
      expect(apres.filter((r) => !r.reload), "prémisse : la nouvelle page a relu le 404 EN CACHE (aucune demande ordinaire de " + SOURCE_MODIFIEE + " au serveur)").toEqual([]);
      expect(apres, "une seule demande au réseau, la redemande `cache: \"reload\"`, qui reçoit le script").toEqual([{ statut: 200, reload: true }]);

      expect(await page.evaluate(() => window.__ordre)).toEqual([...nomsA(), "ready"]);
      expect(await page.evaluate(() => typeof boot)).toBe("function");
      await page.waitForSelector("#screen-feed.active", { state: "attached", timeout: 30000 });
      expect(referencesManquantes()).toEqual([]);
    } finally {
      await contexte.close().catch(() => {});
      try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* profil verrouillé sous Windows : le dossier temporaire le reprendra */ }
    }
  });
});

// ⑦ ⑧ UN RETOUR ARRIÈRE ENTRE DEUX VERSIONS D'APRÈS LE DÉCOUPAGE (2026-11-10).
// Netlify ignore le `?v=` (mesuré le 2026-11-09 : `app/app-04-comments-shop.js?v=0000000000`
// → 200, contenu courant). Pendant un retour arrière de B vers A (restauration
// instantanée, scripts/rollback-netlify.mjs — « réversible par le même geste »), une
// demande de l'adresse de B reçoit le contenu de A, en 200 `immutable` : une page B
// partie juste avant la bascule (⑦), ou le worker de B qui s'installe (⑧). Quand B est
// rétabli à l'identique (même fichier, même `?v=`), l'appareil exécutait l'ANCIEN
// script avec les 8 autres de B — sans que rien n'échoue, donc sans que la reprise du
// 404 (⑥) ne le voie.
// ⚠️ AUCUNE ROUTE, UN PROFIL PERSISTANT : mêmes raisons que ⑥.
// ⚠️ LES PRÉMISSES SONT ASSERTÉES : le contenu de A a bien été servi sous l'adresse de
// B, puis relu SANS aller au serveur (cache HTTP en ⑦, cache du worker en ⑧).

// Un profil persistant (⑦ ⑧ ⑨ ⑩), avec ou sans worker : son cache disque est celui
// d'un vrai navigateur.
async function ouvrirProfil({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }, serviceWorkers) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), "passio-profil-"));
  const contexte = await playwright[browserName].launchPersistentContext(profil, {
    ...launchOptions, headless, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale,
    serviceWorkers, proxy: PROXY_MORT,
  });
  const page = contexte.pages()[0] || await contexte.newPage();
  await preparer(page);
  const fermer = async () => {
    await contexte.close().catch(() => {});
    try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* profil verrouillé sous Windows : le dossier temporaire le reprendra */ }
  };
  return { page, fermer };
}

// L'appareil va chercher le worker de la version en ligne, et attend qu'il ait pris la
// main (son cache, seul). ⚠️ LA MISE À JOUR EST REDEMANDÉE À CHAQUE TOUR, comme le fait
// `majSilencieuse` toutes les 60 s (pwa-detect.js) : un `update()` demandé pendant une autre
// tâche de la registration peut s'y fondre et ne jamais lire le nouveau `sw.js` (vu une
// fois sur deux passes de ⑩ sous Chromium : 30 s sans que le worker change).
async function installerWorker(page, cache) {
  const majour = () => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {})).catch(() => {});
  await expect.poll(async () => {
    const cles = await page.evaluate(() => caches.keys()).catch(() => []);
    if (cles.join() !== cache) await majour();
    return cles;
  }, { timeout: 30000, intervals: [1000] }).toEqual([cache]);
}

// Une ouverture de l'application, et son issue : prête, ou le chargeur qui abandonne.
async function ouvrir(page) {
  const abandon = page.waitForEvent("console", { predicate: (m) => /ne se charge pas/.test(m.text()), timeout: 30000 })
    .then(() => "le chargeur abandonne", () => "délai dépassé");
  await page.goto(adresse());
  const prete = page.waitForFunction(() => window.__appPrete === true, null, { polling: 50, timeout: 30000 })
    .then(() => "application prête", () => "délai dépassé");
  return Promise.race([prete, abandon]);
}

test.describe("un retour arrière entre deux versions d'après le découpage : le script périmé n'est plus exécuté", () => {
  const vDe = (artefact) => artefact.scripts.find((s) => s.nom === SOURCE_MODIFIEE).v;
  const adresseB = () => "app/" + SOURCE_MODIFIEE + "?v=" + vDe(artefacts.B);
  // Les demandes reçues pour l'adresse de B du script modifié, et l'artefact qui y a répondu.
  const demandesB = (depuis = 0) => etat.journal
    .filter((r) => r.t >= depuis && r.rel === "app/" + SOURCE_MODIFIEE && r.query === "?v=" + vDe(artefacts.B))
    .map((r) => ({ statut: r.statut, reload: r.reload, version: r.version, dest: r.dest }));

  test("⑦ sans worker : l'ancien script rangé sous la nouvelle adresse (cache HTTP) n'est plus exécuté quand la nouvelle version revient", async ({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }) => {
    const { page, fermer } = await ouvrirProfil({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }, "block");
    try {
      expect(vDe(artefacts.B), "prémisse : B change l'empreinte du script modifié").not.toBe(vDe(artefacts.A));

      // 1. B est en ligne ; une page B part, et le retour arrière vers A tombe juste après elle.
      etat.dossier = artefacts.b;
      etat.basculeApresPage = artefacts.a;
      const pendant = await ouvrir(page);
      const servisPendant = demandesB();
      expect(servisPendant.length, "prémisse : la page B a demandé " + SOURCE_MODIFIEE + " sous son adresse").toBeGreaterThan(0);
      expect(servisPendant.every((r) => r.statut === 200 && r.version === "A"), "prémisse : chaque demande a reçu le contenu de A, en 200 immutable — " + JSON.stringify(servisPendant)).toBe(true);
      expect(servisPendant.some((r) => r.dest === "script"), "prémisse : le banc reconnaît une demande du preload ou de la balise (Sec-Fetch-Dest) — " + JSON.stringify(servisPendant)).toBe(true);
      // Pendant la bascule, la page B n'exécute jamais le script de A : elle s'arrête
      // comme devant un script manquant (③) — un rechargement sert la version en ligne.
      expect.soft(await page.evaluate(() => window.__ordre), "pendant la bascule : le script de A n'est jamais exécuté par la page B").not.toContain(SOURCE_MODIFIEE);
      expect.soft(pendant, "pendant la bascule").toBe("le chargeur abandonne");

      // 2. B est rétabli à l'identique (même fichier, même `?v=`) ; l'appareil rouvre l'application.
      etat.dossier = artefacts.b;
      const depuis = Date.now();
      const issue = await ouvrir(page);
      const apres = demandesB(depuis);
      expect(apres.filter((r) => r.dest === "script"), "prémisse : la page B a relu le contenu de A EN CACHE (ni son preload ni sa balise ne sont allés au serveur)").toEqual([]);
      expect.soft(issue, "B rétabli : l'application démarre").toBe("application prête");
      expect.soft(await page.evaluate(() => window.__versionServie), "B rétabli : le script exécuté est celui de B, pas celui de A resté en cache").toBe("B");
      expect.soft(apres, "une seule demande au réseau, la redemande `cache: \"reload\"`, qui reçoit le script de B").toEqual([{ statut: 200, reload: true, version: "B", dest: "empty" }]);
      expect.soft(await page.evaluate(() => window.__ordre)).toEqual([...nomsA(), "ready"]);
      expect(referencesManquantes()).toEqual([]);
    } finally {
      await fermer();
    }
  });

  test("⑧ avec le worker : l'ancien script rangé par le worker sous la nouvelle adresse n'est plus exécuté quand la nouvelle version revient", async ({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }) => {
    const { page, fermer } = await ouvrirProfil({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }, "allow");
    try {
      // 0. A est en ligne : l'appareil ouvre l'application, le worker de A prend la main.
      etat.dossier = artefacts.a;
      expect(await ouvrir(page), "prémisse : A démarre").toBe("application prête");
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { polling: 50, timeout: 20000 });

      // 1. B est déployé, l'appareil va chercher le worker de B (`majSilencieuse`) — et le
      //    retour arrière vers A tombe juste après `sw.js` : le worker de B s'installe avec
      //    les fichiers que sert A.
      etat.swDe = artefacts.b;
      const cacheB = "passio-v" + artefacts.B.release.buildId;
      await installerWorker(page, cacheB);
      const servisPendant = demandesB();
      expect(servisPendant.length, "prémisse : le worker de B a demandé " + SOURCE_MODIFIEE + " sous son adresse").toBeGreaterThan(0);
      expect(servisPendant.every((r) => r.statut === 200 && r.version === "A"), "prémisse : chaque demande a reçu le contenu de A — " + JSON.stringify(servisPendant)).toBe(true);
      const range = await page.evaluate(([c, u]) => caches.open(c).then((k) => k.match(u)).then((r) => (r ? r.text() : null)), [cacheB, adresseB()]);
      expect(range, "prémisse : le worker de B a rangé un script sous l'adresse de B").toBeTruthy();
      expect(range.includes('window.__versionServie = "B"'), "prémisse : ce script est celui de A").toBe(false);

      // 2. B est rétabli à l'identique : même `sw.js`, le worker de B reste en place, et
      //    l'appareil rouvre l'application.
      etat.swDe = null;
      etat.dossier = artefacts.b;
      const depuis = Date.now();
      const issue = await ouvrir(page);
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), "prémisse : un worker contrôle la page").toBe(true);
      expect(await page.evaluate(() => caches.keys()), "prémisse : c'est toujours le worker de B").toEqual([cacheB]);
      const apres = demandesB(depuis);
      expect(apres.filter((r) => r.dest === "script"), "prémisse : le worker a servi son cache (ni le preload ni la balise ne sont allés au serveur)").toEqual([]);
      expect.soft(issue, "B rétabli : l'application démarre").toBe("application prête");
      expect.soft(await page.evaluate(() => window.__versionServie), "B rétabli : le script exécuté est celui de B, pas celui de A resté dans le cache du worker").toBe("B");
      expect.soft(apres, "une seule demande au réseau, la redemande `cache: \"reload\"`, que le worker laisse passer").toEqual([{ statut: 200, reload: true, version: "B", dest: "empty" }]);
      expect.soft(await page.evaluate(() => window.__ordre)).toEqual([...nomsA(), "ready"]);
      // Et le worker a remplacé ce qu'il gardait : la prochaine ouverture n'a plus rien à réparer.
      const rangeApres = await page.evaluate(([c, u]) => caches.open(c).then((k) => k.match(u)).then((r) => (r ? r.text() : null)), [cacheB, adresseB()]);
      expect.soft(!!rangeApres && rangeApres.includes('window.__versionServie = "B"'), "le cache du worker porte désormais le script de B").toBe(true);
      expect(referencesManquantes()).toEqual([]);
    } finally {
      await fermer();
    }
  });
});

// ⑨ ⑩ LA FEUILLE DE STYLE : LE MÊME RETOUR ARRIÈRE (2026-11-10). `styles.css?v=` est la
// seule autre règle `immutable` de `_headers`, et Netlify y ignore le `?v=` aussi. Pendant
// un retour arrière de C vers A, la feuille de A est rangée sous l'adresse de C — par une
// page C partie juste avant la bascule (⑨, cache HTTP), ou par le worker de C qui s'installe
// (⑩, son cache, `FICHIERS_VERSION`). C rétabli à l'identique, l'appareil appliquait la
// feuille de A jusqu'au prochain changement de la feuille : des styles de C manquants, sans
// une erreur, sans une demande au serveur.
// Le remède (scripts/build.js, étape 2) : l'empreinte `integrity` de la feuille SERVIE sur
// son <link>, et une reprise — au refus, TOUT DE SUITE, un secours SANS empreinte à la même
// place (la feuille que gardent les caches : jamais une page sans styles), puis une
// redemande `cache: "reload"`, et un <link> AVEC l'empreinte posé juste après le secours,
// qui le retire s'il se charge (pendant la bascule elle-même, il est refusé à son tour, et
// la page C garde la feuille de A, comme avant le remède).
// ⚠️ AUCUNE ROUTE, UN PROFIL PERSISTANT : mêmes raisons que ⑥. Prémisses assertées : la
// feuille de A servie en 200 sous l'adresse de C, puis relue sans une demande `style`.
test.describe("un retour arrière qui change la feuille de style : la feuille périmée n'est plus appliquée", () => {
  // Les demandes reçues pour l'adresse de la feuille de C, et l'artefact qui y a répondu.
  const demandesFeuilleC = (depuis = 0) => etat.journal
    .filter((r) => r.t >= depuis && r.rel === "styles.css" && "styles.css" + r.query === artefacts.C.css)
    .map((r) => ({ statut: r.statut, reload: r.reload, version: r.version, dest: r.dest }));
  // La feuille que la page applique : une feuille (`--accent`), et si c'est celle de C.
  const feuille = (page) => page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { stylee: s.getPropertyValue("--accent").trim() !== "", c: s.getPropertyValue("--passio-version-feuille").trim() === '"C"' };
  }).catch(() => null);
  // Attend l'état `attendu` (la reprise est asynchrone) et rend le dernier état lu.
  async function feuilleFinale(page, attendu, delai = 10000) {
    const fin = Date.now() + delai;
    let v = await feuille(page);
    while (Date.now() < fin && JSON.stringify(v) !== JSON.stringify(attendu)) {
      await new Promise((ok) => setTimeout(ok, 100));
      v = await feuille(page);
    }
    return v;
  }
  const evenementsFeuille = (page) => page.evaluate(() => window.__feuille).catch(() => null);
  // La suite des événements de la feuille (`+` : le <link> portait l'empreinte), une fois
  // qu'il y en a `n` (ou au bout de 10 s). C'est elle qui dit « jamais sans styles » : le
  // refus, le SECOURS chargé tout de suite, et seulement ensuite le <link> avec l'empreinte.
  async function suiteFeuille(page, n) {
    const fin = Date.now() + 10000;
    let ev = await evenementsFeuille(page);
    while (Date.now() < fin && !(ev && ev.length >= n)) {
      await new Promise((ok) => setTimeout(ok, 100));
      ev = await evenementsFeuille(page);
    }
    return (ev || []).map((e) => e.type + (e.empreinte ? "+" : ""));
  }
  // Les instants d'une reprise, relevés dans le rapport du banc (annotation `feuille`,
  // reporter json ou html) : la page reste sans styles du refus au `load` du secours, puis
  // porte la feuille de l'autre version jusqu'au `load` du <link> avec l'empreinte. Ils ne
  // font pas le verdict.
  async function noterReprise(page, etape) {
    test.info().annotations.push({ type: "feuille", description: etape + " " + JSON.stringify(await evenementsFeuille(page)) });
  }
  // Le <link> de la feuille, une fois la reprise passée : UN seul, À LA PLACE de l'ancien
  // (juste après le script de la reprise, devant tout ce que le <head> a reçu depuis — les
  // surcharges de thème, police, taille et arrondi d'app-05 sont des <style> ajoutés au
  // <head> APRÈS la feuille, et la cascade les veut après elle), et s'il porte l'empreinte.
  // `suivi` est la prémisse de `aSaPlace` : sans élément après la feuille, un <link> rajouté
  // en fin de <head> serait lui aussi juste après la reprise, et la vérification ne
  // distinguerait rien. ⚠️ Il doit y être AU MOMENT DU REFUS : le refus part avant les
  // scripts du <body>, quand la feuille est encore le dernier élément du <head> — la mutation
  // « secours en fin de <head> » est restée verte sous Chromium tant que le banc ne posait
  // rien après elle. D'où `marquerApresFeuille`, qui pose un élément juste après la feuille
  // dès que le parseur l'insère (comme les <style> d'app-05, qui arrivent plus tard).
  const lienFeuille = (page) => page.evaluate(() => {
    const liens = [...document.querySelectorAll('link[rel="stylesheet"]')].filter((l) => /^styles\.css\?v=/.test(l.getAttribute("href") || ""));
    const avant = liens.length === 1 ? liens[0].previousElementSibling : null;
    const apres = liens.length === 1 ? liens[0].nextElementSibling : null;
    return {
      liens: liens.length,
      aSaPlace: !!avant && avant.tagName === "SCRIPT" && avant.textContent.includes('addEventListener("error"'),
      suivi: !!apres && apres.id === "banc-apres-feuille",
      empreinte: liens.length === 1 && liens[0].hasAttribute("integrity"),
    };
  }).catch(() => null);
  const marquerApresFeuille = () => {
    const obs = new MutationObserver(() => {
      const l = document.querySelector('link[rel="stylesheet"][href^="styles.css?v="]');
      if (!l || document.getElementById("banc-apres-feuille")) return;
      const m = document.createElement("meta");
      m.id = "banc-apres-feuille";
      l.parentNode.insertBefore(m, l.nextSibling);
      obs.disconnect();
    });
    obs.observe(document, { childList: true, subtree: true });
  };

  test("⑨ sans worker : la feuille d'une autre version rangée sous la nouvelle adresse (cache HTTP) n'est plus appliquée quand la nouvelle version revient", async ({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }) => {
    const { page, fermer } = await ouvrirProfil({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }, "block");
    try {
      await page.addInitScript(marquerApresFeuille);
      expect(artefacts.C.css, "prémisse : C change l'empreinte de la feuille").not.toBe(artefacts.A.css);
      expect(artefacts.C.scripts, "prémisse : C garde les 9 scripts de A").toEqual(artefacts.A.scripts);

      // 1. C est en ligne ; une page C part, et le retour arrière vers A tombe juste après elle.
      etat.dossier = artefacts.c;
      etat.basculeApresPage = artefacts.a;
      expect(await ouvrir(page), "pendant la bascule : l'application démarre (ses scripts sont ceux de A)").toBe("application prête");
      const pendant = await feuilleFinale(page, { stylee: true, c: false });
      const servisPendant = demandesFeuilleC();
      expect(servisPendant.length, "prémisse : la page C a demandé sa feuille sous son adresse").toBeGreaterThan(0);
      expect(servisPendant.every((r) => r.statut === 200 && r.version === "A"), "prémisse : chaque demande a reçu la feuille de A, en 200 immutable — " + JSON.stringify(servisPendant)).toBe(true);
      expect(servisPendant.some((r) => r.dest === "style"), "prémisse : le banc reconnaît la demande du <link> (Sec-Fetch-Dest) — " + JSON.stringify(servisPendant)).toBe(true);
      // Pendant la bascule, la page C est stylée — par la feuille de A : jamais une page sans
      // styles. Le refus, le secours chargé, puis le <link> avec l'empreinte refusé lui aussi
      // (le site sert encore A) : la page garde le secours.
      expect.soft(await suiteFeuille(page, 3), "pendant la bascule : refus, secours chargé, puis le <link> avec empreinte refusé").toEqual(["error+", "load", "error+"]);
      await noterReprise(page, "pendant la bascule");
      expect.soft(pendant, "pendant la bascule : une page stylée, par la feuille en ligne (celle de A) — " + JSON.stringify(await evenementsFeuille(page))).toEqual({ stylee: true, c: false });
      expect.soft(await lienFeuille(page), "pendant la bascule : le secours, SANS empreinte, seul et à la place de l'ancien").toEqual({ liens: 1, aSaPlace: true, suivi: true, empreinte: false });

      // 2. C est rétabli à l'identique (même feuille, même `?v=`) ; l'appareil rouvre l'application.
      etat.dossier = artefacts.c;
      const depuis = Date.now();
      const issue = await ouvrir(page);
      const finale = await feuilleFinale(page, { stylee: true, c: true });
      await noterReprise(page, "C rétabli");
      expect.soft(await suiteFeuille(page, 3), "C rétabli : refus, secours chargé tout de suite, puis le <link> avec empreinte chargé").toEqual(["error+", "load", "load+"]);
      const apres = demandesFeuilleC(depuis);
      expect(apres.filter((r) => r.dest === "style"), "prémisse : la page C a relu la feuille de A EN CACHE (son <link> n'est pas allé au serveur)").toEqual([]);
      expect.soft(issue, "C rétabli : l'application démarre").toBe("application prête");
      expect.soft(finale, "C rétabli : la feuille appliquée est celle de C, pas celle de A restée en cache — " + JSON.stringify(await evenementsFeuille(page))).toEqual({ stylee: true, c: true });
      expect.soft(apres, "une seule demande au réseau, la redemande `cache: \"reload\"`, qui reçoit la feuille de C").toEqual([{ statut: 200, reload: true, version: "C", dest: "empty" }]);
      expect.soft(await lienFeuille(page), "C rétabli : un seul <link>, AVEC son empreinte, à la place de l'ancien (le secours retiré)").toEqual({ liens: 1, aSaPlace: true, suivi: true, empreinte: true });
      expect(referencesManquantes()).toEqual([]);
    } finally {
      await fermer();
    }
  });

  test("⑩ avec le worker : la feuille d'une autre version rangée par le worker sous la nouvelle adresse n'est plus appliquée quand la nouvelle version revient", async ({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }) => {
    const { page, fermer } = await ouvrirProfil({ playwright, browserName, headless, launchOptions, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale }, "allow");
    try {
      // 0. A est en ligne : l'appareil ouvre l'application, le worker de A prend la main.
      etat.dossier = artefacts.a;
      expect(await ouvrir(page), "prémisse : A démarre").toBe("application prête");
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { polling: 50, timeout: 20000 });

      // 1. C est déployé, l'appareil va chercher le worker de C (`majSilencieuse`) — et le
      //    retour arrière vers A tombe juste après `sw.js` : le worker de C s'installe avec
      //    les fichiers que sert A.
      etat.swDe = artefacts.c;
      await page.addInitScript(marquerApresFeuille);
      const cacheC = "passio-v" + artefacts.C.release.buildId;
      await installerWorker(page, cacheC);
      const servisPendant = demandesFeuilleC();
      expect(servisPendant.length, "prémisse : le worker de C a demandé la feuille sous son adresse").toBeGreaterThan(0);
      expect(servisPendant.every((r) => r.statut === 200 && r.version === "A"), "prémisse : chaque demande a reçu la feuille de A — " + JSON.stringify(servisPendant)).toBe(true);
      const range = await page.evaluate(([c, u]) => caches.open(c).then((k) => k.match(u)).then((r) => (r ? r.text() : null)), [cacheC, artefacts.C.css]);
      expect(range, "prémisse : le worker de C a rangé une feuille sous l'adresse de C").toBeTruthy();
      expect(range.includes("--passio-version-feuille"), "prémisse : cette feuille est celle de A").toBe(false);

      // 2. C est rétabli à l'identique : même `sw.js`, le worker de C reste en place, et
      //    l'appareil rouvre l'application.
      etat.swDe = null;
      etat.dossier = artefacts.c;
      const depuis = Date.now();
      const issue = await ouvrir(page);
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), "prémisse : un worker contrôle la page").toBe(true);
      expect(await page.evaluate(() => caches.keys()), "prémisse : c'est toujours le worker de C").toEqual([cacheC]);
      const finale = await feuilleFinale(page, { stylee: true, c: true });
      await noterReprise(page, "C rétabli");
      expect.soft(await suiteFeuille(page, 3), "C rétabli : refus, secours chargé tout de suite, puis le <link> avec empreinte chargé").toEqual(["error+", "load", "load+"]);
      const apres = demandesFeuilleC(depuis);
      expect(apres.filter((r) => r.dest === "style"), "prémisse : le worker a servi son cache (le <link> n'est pas allé au serveur)").toEqual([]);
      expect.soft(issue, "C rétabli : l'application démarre").toBe("application prête");
      expect.soft(finale, "C rétabli : la feuille appliquée est celle de C, pas celle de A restée dans le cache du worker — " + JSON.stringify(await evenementsFeuille(page))).toEqual({ stylee: true, c: true });
      expect.soft(apres, "une seule demande au réseau, la redemande `cache: \"reload\"`, que le worker laisse passer").toEqual([{ statut: 200, reload: true, version: "C", dest: "empty" }]);
      expect.soft(await lienFeuille(page), "C rétabli : un seul <link>, AVEC son empreinte, à la place de l'ancien (le secours retiré)").toEqual({ liens: 1, aSaPlace: true, suivi: true, empreinte: true });
      // Et le worker a remplacé ce qu'il gardait : la prochaine ouverture n'a plus rien à réparer.
      const rangeApres = await page.evaluate(([c, u]) => caches.open(c).then((k) => k.match(u)).then((r) => (r ? r.text() : null)), [cacheC, artefacts.C.css]);
      expect.soft(!!rangeApres && rangeApres.includes("--passio-version-feuille"), "le cache du worker porte désormais la feuille de C").toBe(true);
      expect(referencesManquantes()).toEqual([]);
    } finally {
      await fermer();
    }
  });
});

// Témoin du banc : les empreintes que la page cite sont celles du contenu servi.
test("témoin : chaque ?v= de l'artefact est l'empreinte de son fichier", async () => {
  const h10 = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex").slice(0, 10);
  for (const [dossier, artefact] of [[artefacts.a, artefacts.A], [artefacts.b, artefacts.B], [artefacts.c, artefacts.C]]) {
    for (const s of artefact.scripts) expect(s.v, s.nom).toBe(h10(path.join(dossier, "app", s.nom)));
    expect(artefact.css, "styles.css").toBe("styles.css?v=" + h10(path.join(dossier, "styles.css")));
  }
});
