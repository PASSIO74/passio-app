// LE buildId COUVRE TOUT CE QUE LA PAGE EXÉCUTE (2026-11-04).
//
// Trouvé en livrant le correctif du bug des contrôles vidéo de Safari : `buildId`
// était calculé AVANT l'inlining des `<script src="js/…">`. Une version qui ne
// changeait que `platform.js`, `telemetry.js`, `first-run.js` ou un `ui-v*` gardait
// donc le même identifiant, le même nom de cache et les mêmes octets de `dist/sw.js` :
// aucun worker ne se réinstallait, une application restée ouverte ne se rechargeait
// pas, et le release-guard ne voyait aucun décalage de version. Le commentaire de
// l'étape « Service worker » de `scripts/build.js` affirmait le contraire.
//
// Le banc exécute le VRAI `scripts/build.js`, avec un `fs` en mémoire : une source
// réellement modifiée resterait salie si le test était interrompu, et un build par
// script sur le disque coûtait 148 s sur le poste (47 builds).
//   ① chaque script que l'artefact embarque change le buildId ET le cache du worker
//     — la liste vient de l'artefact lui-même, jamais d'une liste écrite à la main,
//     sinon un script ajouté demain échapperait au verrou ;
//   ② cette liste n'est pas vide de sens : tout ce qu'`index.html` déclare y est,
//     ainsi que les deux gardes que seul le build ajoute ;
//   ③ le CSS et le HTML le changent toujours ;
//   ④ le commit, la date de build et la cible Supabase n'y entrent PAS. C'est la
//     dépendance circulaire à éviter, et surtout : si le commit y entrait, un commit
//     de documentation réinstallerait le worker et rechargerait toutes les pages
//     ouvertes (`reloadOnce`, js/pwa-detect.js) ;
//   ⑤ la page, `release.json` et le worker désignent le même build, et le contrat
//     reste posé juste avant `telemetry.js`, qui le lit à son initialisation ;
//   ⑥ TÉMOIN DU BANC : un vrai build, sur le disque, rend le même buildId. Sans lui,
//     un `fs` en mémoire qui ne ressemblerait plus au vrai rendrait les autres verts.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_BUILD = path.join(RACINE, "scripts", "build.js");
const require = createRequire(import.meta.url);

const executerBuild = vm.compileFunction(
  fs.readFileSync(SCRIPT_BUILD, "utf8"),
  ["require", "process", "__dirname", "console"],
  { filename: SCRIPT_BUILD },
);

const sources = new Map();
function source(rel) {
  if (!sources.has(rel)) sources.set(rel, fs.readFileSync(path.join(RACINE, rel), "utf8"));
  return sources.get(rel);
}

// `existsSync` faux : les étapes qui recopient data/, js/vendor/ et pilotage/ sont
// sautées, elles n'entrent pas dans le calcul. `variables` est TOUT l'environnement
// du build : le GITHUB_SHA que la CI pose partout ne peut pas s'y glisser.
function construire({ muter = null, variables = {} } = {}) {
  const ecrits = new Map();
  const fauxFs = {
    readFileSync(chemin) {
      const rel = path.relative(RACINE, chemin).split(path.sep).join("/");
      return rel === muter ? source(rel) + "\n/* mutation */\n" : source(rel);
    },
    writeFileSync(chemin, contenu) { ecrits.set(path.basename(chemin), contenu); },
    mkdirSync() {},
    existsSync() { return false; },
  };
  executerBuild(
    (nom) => (nom === "fs" ? fauxFs : require(nom)),
    { argv: ["node", "scripts/build.js", "dist/index.html"], env: variables },
    path.dirname(SCRIPT_BUILD),
    { log() {} },
  );
  const page = ecrits.get("index.html");
  const cache = /const CACHE = "passio-v([a-f0-9]+)"/.exec(ecrits.get("sw.js"));
  assert.ok(cache, "dist/sw.js doit porter son nom de cache");
  const embarque = /window\.PASSIO_RELEASE=(\{.*?\});<\/script>/.exec(page);
  assert.ok(embarque, "dist/index.html doit porter le contrat de release");
  return {
    page,
    app: ecrits.get("app.js"),
    contrat: JSON.parse(ecrits.get("release.json")),
    embarque: JSON.parse(embarque[1]),
    cache: cache[1],
  };
}

let temoin;

// Les scripts dont le texte atteint réellement l'artefact, lus DANS l'artefact.
function scriptsEmbarques() {
  return fs.readdirSync(path.join(RACINE, "js"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => "js/" + f)
    .filter((rel) => {
      const texte = source(rel);
      return texte.trim() && (temoin.page.includes(texte) || temoin.app.includes(texte));
    });
}

before(() => {
  temoin = construire();
});

test("① chaque script que l'artefact embarque change le buildId et le cache du worker", () => {
  const inchanges = [];
  for (const rel of scriptsEmbarques()) {
    const mute = construire({ muter: rel });
    if (mute.contrat.buildId === temoin.contrat.buildId) inchanges.push(rel + " (buildId)");
    if (mute.cache !== mute.contrat.buildId) inchanges.push(rel + " (cache du worker)");
  }
  assert.deepEqual(inchanges, [], "ces scripts partiraient en production sans mise à jour silencieuse");
});

test("② la liste du ① contient tout ce qu'index.html déclare et les gardes ajoutés par le build", () => {
  const embarques = new Set(scriptsEmbarques());
  // Le filtre d'existence écarte le `<script src="js/…">` d'un commentaire d'index.html.
  const declares = [...source("index.html").matchAll(/<script\b[^>]*\bsrc="(js\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((rel) => fs.existsSync(path.join(RACINE, rel)));
  assert.ok(declares.length > 0, "index.html doit déclarer ses scripts");
  const attendus = [...declares, "js/platform.js", "js/telemetry.js", "js/identity-transition.js", "js/release-guard.js", "js/passion-context.js"];
  assert.deepEqual(attendus.filter((rel) => !embarques.has(rel)), []);
});

test("③ le CSS et le HTML changent toujours le buildId", () => {
  for (const rel of ["styles.css", "index.html"]) {
    assert.notEqual(construire({ muter: rel }).contrat.buildId, temoin.contrat.buildId, rel);
  }
});

test("④ le commit, la date de build et la cible Supabase n'entrent pas dans le buildId", () => {
  const commit = "a".repeat(40);
  const avecCommit = construire({ variables: { COMMIT_REF: commit, PASSIO_BUILD_TIME: "2026-11-04T10:00:00Z" } });
  assert.equal(avecCommit.embarque.commit, commit, "prémisse : le commit est bien dans le contrat");
  assert.equal(avecCommit.contrat.buildId, temoin.contrat.buildId, "COMMIT_REF + PASSIO_BUILD_TIME");

  const autreCommit = construire({ variables: { GITHUB_SHA: "b".repeat(40) } });
  assert.equal(autreCommit.embarque.commit, "b".repeat(40), "prémisse : le repli GITHUB_SHA est lu");
  assert.equal(autreCommit.contrat.buildId, temoin.contrat.buildId, "GITHUB_SHA");

  const cible = construire({ variables: { PASSIO_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", PASSIO_SUPABASE_ANON: "cle-anon-de-test" } });
  assert.match(cible.page, /window\.PASSIO_SUPABASE_CIBLE=/, "prémisse : la cible est bien dans la page");
  assert.equal(cible.contrat.buildId, temoin.contrat.buildId, "PASSIO_SUPABASE_*");
});

test("⑤ la page, release.json et le worker désignent le même build, contrat avant telemetry.js", () => {
  const b = construire({ variables: { COMMIT_REF: "c".repeat(40) } });
  assert.deepEqual(b.embarque, b.contrat);
  assert.equal(b.cache, b.contrat.buildId);

  const position = (rel) => {
    const i = b.page.indexOf(source(rel));
    assert.notEqual(i, -1, rel + " doit être inliné dans la page");
    return i;
  };
  const contrat = b.page.indexOf("window.PASSIO_RELEASE=");
  assert.ok(position("js/platform.js") < contrat, "platform.js reste devant le contrat");
  assert.ok(contrat < position("js/telemetry.js"), "telemetry.js lit le contrat à son initialisation");
  assert.ok(position("js/telemetry.js") < position("js/identity-transition.js"), "identity-transition suit telemetry.js");
  assert.ok(position("js/identity-transition.js") < position("js/release-guard.js"), "release-guard suit identity-transition");
});

test("⑥ témoin du banc : un vrai build, sur le disque, rend le même buildId et les mêmes octets", () => {
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), "passio-build-id-"));
  try {
    const env = { ...process.env };
    for (const k of ["COMMIT_REF", "GITHUB_SHA", "PASSIO_BUILD_TIME", "PASSIO_SUPABASE_URL", "PASSIO_SUPABASE_ANON"]) delete env[k];
    execFileSync(process.execPath, [SCRIPT_BUILD, path.join(sortie, "index.html")], { cwd: RACINE, env, stdio: "pipe", timeout: 120000 });
    const contrat = JSON.parse(fs.readFileSync(path.join(sortie, "release.json"), "utf8"));
    assert.equal(contrat.buildId, temoin.contrat.buildId);
    assert.equal(fs.readFileSync(path.join(sortie, "index.html"), "utf8"), temoin.page);
    assert.equal(fs.readFileSync(path.join(sortie, "app.js"), "utf8"), temoin.app);
    assert.equal(/const CACHE = "passio-v([a-f0-9]+)"/.exec(fs.readFileSync(path.join(sortie, "sw.js"), "utf8"))[1], contrat.buildId);
  } finally {
    fs.rmSync(sortie, { recursive: true, force: true });
  }
});
