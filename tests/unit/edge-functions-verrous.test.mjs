// ═══════════════════════════════════════════════════════════════════════════
// LES VERROUS QUI PRÉCÈDENT `supabase functions deploy` SE DÉDUISENT DES
// IMPORTS RÉELS, JAMAIS D'UNE MÉMOIRE (2026-11-07).
//
// `.github/workflows/edge-functions.yml` part sur un push de `main` EN PARALLÈLE
// de la CI de deploy.yml et déploie sans attendre son verdict : seuls les verrous
// de sa propre étape gardent ce chemin. Cette étape était une liste tenue à la
// main, qui dérivait à chaque module. #745 a fait passer toute push de
// `notify-call` par `_shared/appels.js` (qui importe `_shared/reception.js`) sans
// que leurs suites rejoignent la liste (#748). Cinq modules emportés par
// `pilotage` partaient sans leur suite (battement, parcours, croissance,
// contrats-actions, politique-autonomie). Et le job installait Node 20, quand la
// CI éprouve les suites sous Node 22.
//
// Ce banc lit l'étape TELLE QU'ELLE EST (lecteur YAML du dépôt) et la confronte
// au graphe d'imports. Un module est « emporté » par une fonction s'il est dans
// la clôture des imports relatifs de son `supabase/functions/<nom>/index.ts` :
// c'est ce que la CLI met dans le bundle. Les règles :
//   ⓪ chaque fichier de `_shared/` est emporté par au moins une fonction (sinon :
//     du code mort, ou un import que ce lecteur n'a pas su lire — les deux se
//     disent, aucun ne passe pour un vert) ;
//   ① chaque module emporté est importé par au moins une suite listée ;
//   ② chaque suite de tests/unit qui importe un module emporté est listée : une
//     ligne ne se retire pas en silence, une suite neuve ne s'oublie pas ;
//   ③ chaque suite listée existe, une seule fois, et importe un module emporté ;
//   ④ l'étape précède « Déployer », sans `if:`, sans `continue-on-error`, dans le
//     shell par défaut (`bash -e`), et ne lance que des `node --test <suite>` ;
//     « Déployer » n'a pas d'`if:` qui passerait outre un échec ;
//   ⑤ le Node installé avant les verrous a la version majeure du job de
//     deploy.yml qui éprouve tests/unit/*.test.mjs (sans node_modules, comme ici).
// « Importer », c'est un import statique, un `import("…")` ou un `require("…")`
// LITTÉRAL écrit dans la suite elle-même. Une suite qui n'atteint un module qu'à
// travers un script éprouve le script. Un écart VOLONTAIRE (module sans suite,
// suite non listée) se déclare dans ECARTS avec sa raison ; un écart qui n'a plus
// d'objet rougit.
//
// ⑥ joue le bloc `run:` réel sous `bash -e` contre un faux `node`. ⑦ rejoue les
// mutations sur le texte réel : retirer n'importe quelle ligne, ajouter un import
// `_shared` sans suite, déplacer l'étape, changer Node… Chacune rougit, et le
// remède (la suite listée) redevient vert.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "./lib/yaml-mini.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").split("\r\n").join("\n");
const WORKFLOW = ".github/workflows/edge-functions.yml";
const REFERENCE = ".github/workflows/deploy.yml";
const FONCTIONS = "supabase/functions";
const SHARED = FONCTIONS + "/_shared/";
const SUITES = "tests/unit";
const CE_BANC = SUITES + "/edge-functions-verrous.test.mjs";

// ── Les écarts DÉCLARÉS, chacun avec sa raison ──────────────────────────────
// Les suites d'ici importent un module emporté pour éprouver AUTRE CHOSE (un
// script, une gate, le client, un autre exécutant). Les lister lierait le
// déploiement d'une fonction à la forme de ces fichiers : un correctif retenu
// pour une dérive qu'il ne touche pas. Toutes tournent dans deploy.yml
// (tests/unit/*.test.mjs, à chaque PR et sur main) ; ⑤ rougit si cette
// étape-là disparaît.
const ECARTS = Object.freeze({
  "supabase/functions/_shared/revision.js":
    "écrit par l'étape « Révision » de ce workflow juste avant « Déployer » (une ligne : le SHA déployé) ; la fumée relit ce qu'il sert sur chaque fonction (X-Passio-Revision)",
  "tests/unit/audit-contrats-actions.test.mjs":
    "éprouve la garde scripts/audit-contrats-actions.mjs et l'accord du client (js/*.js, package.json) avec le registre ; contrats-actions.js est éprouvé avant « Déployer » par parcours.test.mjs (validerContrats, contratDe, contratsCritiques)",
  "tests/unit/audit-tables-compte.test.mjs":
    "éprouve la gate scripts/audit-tables-compte.js (migrations et référentiel du schéma contre TABLES_COMPTE) ; la purge et l'export sont éprouvés avant « Déployer » par purge-compte, suppression-compte, suppression-entrelacement et export-compte",
  "tests/unit/identifiants-exemple.test.mjs":
    "éprouve la migration R31 contre les générateurs du client (app-01 exécuté en bac, app-02 à app-08 relus) ; EXPRESSION_EXEMPLE y est comparée au texte de la migration, et son effet sur la purge est éprouvé avant « Déployer » par purge-compte.test.mjs (R31 ⑨)",
  "tests/unit/politique-autonomie-executants.test.mjs":
    "éprouve deploy.yml, sentinelle-autonome.yml, scripts/sentinelle-detecter.mjs et js/app-04 contre la politique, et l'existence de chaque « appliquePar » ; le module est éprouvé avant « Déployer » par politique-autonomie.test.mjs",
  "tests/unit/sentinelle-detecter.test.mjs":
    "éprouve scripts/sentinelle-detecter.mjs, que la Sentinelle exécute chez GitHub ; REVEIL n'y est qu'une référence croisée (MAX_ENQUETES) — autonomie.js est éprouvé avant « Déployer » par autonomie et autonomie-seuils-sql",
  "tests/unit/trafic-hors-public.test.mjs":
    "éprouve l'accord de trois lecteurs (dashboard/server/trafic.js, scripts/veille-production.mjs, js/telemetry.js) avec pilotage.js ; compterAudience et traficHorsPublic sont éprouvés avant « Déployer » par pilotage.test.mjs (⑯)",
});
const RAISON_MIN = 40;

/** Ce que le banc lit : tout supabase/functions, toutes les suites de tests/unit. */
function depot() {
  const fichiers = {};
  (function parcourir(dir) {
    for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
      const p = dir + "/" + e.name;
      if (e.isDirectory()) parcourir(p);
      else if (/\.(ts|js|mjs)$/.test(e.name)) fichiers[p] = lire(p);
    }
  })(FONCTIONS);
  for (const f of fs.readdirSync(path.join(RACINE, SUITES))) if (/\.test\.mjs$/.test(f)) fichiers[SUITES + "/" + f] = lire(SUITES + "/" + f);
  return { workflow: lire(WORKFLOW), reference: lire(REFERENCE), fichiers };
}

// ── Les imports d'un fichier ────────────────────────────────────────────────
// Un import cité dans une ligne de commentaire n'en est pas un : ces lignes sont
// blanchies. `import … from "x"`, `import "x"`, `export … from "x"`, sur
// plusieurs lignes, commentaire de fin de ligne compris dans les accolades.
const LIGNE_COMMENTAIRE = /^\s*(\/\/|\/\*|\*)/;
const STATIQUE = /(?:^|[\n;])[ \t]*(?:import|export)\s+(?:type\s+)?(?:(?:[\w$*{},\s]|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+?\s*from\s*)?(["'])([^"'\n]+)\1/g;
const LITTERAL = /\b(?:import|require)\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g;
const IMPORT_LITTERAL = /\bimport\s*\(\s*(["'])[^"'\n]+\1\s*\)/g;
const IMPORT_APPEL = /\bimport\s*\(/g;

function imports(src) {
  const code = String(src).split("\n").map((l) => (LIGNE_COMMENTAIRE.test(l) ? "" : l)).join("\n");
  const specs = [...code.matchAll(STATIQUE), ...code.matchAll(LITTERAL)].map((m) => m[2]);
  const nonLitteraux = [...code.matchAll(IMPORT_APPEL)].length - [...code.matchAll(IMPORT_LITTERAL)].length;
  return { specs, nonLitteraux };
}

/** Un chemin relatif résolu dans le dépôt ; `null` pour une URL, `npm:`, `node:` ou un nom nu. */
function resoudre(depuis, spec) {
  if (!/^\.\.?\//.test(spec)) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(depuis), spec.split(/[?#]/)[0]));
}

// ── L'étape, telle que le runner la lit ─────────────────────────────────────
const DEPLOIE = /\bsupabase functions deploy\b/;
const LANCE_TESTS = /\bnode --test\b/;
const LIGNE_SUITES = /^node --test((?: tests\/unit\/[A-Za-z0-9._-]+\.test\.mjs)+)$/;
const LIGNE_SET = /^set -(?:e|eo pipefail|euo pipefail)$/;
const PASSE_OUTRE = /\b(?:always|failure|cancelled)\s*\(/;
const UNITAIRES_CI = /node --test "?tests\/unit\/\*\.test\.mjs"?|node scripts\/tests-unit\.mjs|npm run test:unit/;

const nomEtape = (s, i) => s.name || s.uses || `étape ${i + 1}`;
function versionNode(etape) {
  const w = etape && etape.with;
  if (w && typeof w === "object") return String(w["node-version"] ?? "").trim();
  const m = /node-version:\s*['"]?([\w.*/-]+)/.exec(String(w || "")); // `with: { … }` rendu tel quel par le lecteur
  return m ? m[1] : "";
}
const majeure = (v) => (/\d+/.exec(String(v)) || [String(v)])[0];

function lireEtape(texte, defauts) {
  let doc;
  try { doc = parse(texte); } catch (e) { defauts.push(`${WORKFLOW} illisible : ${e.message}`); return null; }
  const jobs = Object.entries((doc && doc.jobs) || {}).filter(([, j]) => (j.steps || []).some((s) => DEPLOIE.test(String(s.run || ""))));
  if (jobs.length !== 1) { defauts.push(`${jobs.length} job(s) lancent « supabase functions deploy » : le banc en attend exactement un`); return null; }
  const etapes = jobs[0][1].steps;
  const iDeploie = etapes.findIndex((s) => DEPLOIE.test(String(s.run || "")));
  const deploie = `« ${nomEtape(etapes[iDeploie], iDeploie)} »`;
  if (etapes[iDeploie].if !== undefined && PASSE_OUTRE.test(String(etapes[iDeploie].if))) {
    defauts.push(`${deploie} : if: ${etapes[iDeploie].if} — passe outre l'échec d'un verrou`);
  }
  const listees = [];
  const verrous = [];
  etapes.forEach((s, i) => {
    const run = String(s.run || "");
    if (!LANCE_TESTS.test(run)) return;
    const ou = `« ${nomEtape(s, i)} »`;
    if (i > iDeploie) { defauts.push(`${ou} : après ${deploie} — ses suites ne retiennent rien`); return; }
    verrous.push({ i, nom: nomEtape(s, i), run });
    if (s.if !== undefined) defauts.push(`${ou} : if: ${s.if} — un verrou conditionnel peut ne pas tourner`);
    if (s["continue-on-error"] !== undefined && String(s["continue-on-error"]) !== "false") {
      defauts.push(`${ou} : continue-on-error — une suite rouge ne retiendrait pas le déploiement`);
    }
    if (s.shell !== undefined && String(s.shell) !== "bash") {
      defauts.push(`${ou} : shell: ${s.shell} — seul le shell par défaut (bash -e) ou « bash » arrête l'étape à la première suite rouge`);
    }
    for (const brute of run.split("\n")) {
      const l = brute.trim();
      if (!l || l.startsWith("#") || LIGNE_SET.test(l)) continue;
      const m = LIGNE_SUITES.exec(l);
      if (!m) { defauts.push(`${ou} : ligne non reconnue « ${l} » — l'étape ne lance que des « node --test tests/unit/<suite>.test.mjs »`); continue; }
      listees.push(...m[1].trim().split(" "));
    }
  });
  if (!verrous.length) defauts.push(`aucune étape ne lance « node --test » avant ${deploie}`);
  const premier = verrous.length ? verrous[0].i : iDeploie;
  const node = etapes.slice(0, premier).filter((s) => /^actions\/setup-node@/.test(String(s.uses || ""))).pop();
  return { listees, verrous, version: versionNode(node), deploie };
}

/** Le job de deploy.yml qui éprouve TOUTES les suites unitaires, et son Node. */
function lireReference(texte, defauts) {
  let doc;
  try { doc = parse(texte); } catch (e) { defauts.push(`${REFERENCE} illisible : ${e.message}`); return null; }
  for (const [job, j] of Object.entries((doc && doc.jobs) || {})) {
    const etapes = j.steps || [];
    const k = etapes.findIndex((s) => UNITAIRES_CI.test(String(s.run || "")));
    if (k < 0) continue;
    const node = etapes.slice(0, k).filter((s) => /^actions\/setup-node@/.test(String(s.uses || ""))).pop();
    return { job, version: versionNode(node) };
  }
  defauts.push(`deploy.yml : aucun job n'y lance tests/unit/*.test.mjs — ni la version de référence ni la CI des écarts ne sont plus prouvées`);
  return null;
}

/** L'audit, PUR : { workflow, reference, fichiers } → défauts et graphe. */
function auditer({ workflow, reference, fichiers }, ecarts = ECARTS) {
  const defauts = [];
  const etape = lireEtape(workflow, defauts) || { listees: [], verrous: [], version: "" };
  const ref = lireReference(reference, defauts);

  // La clôture : ce que chaque fonction emporte.
  const entrees = Object.keys(fichiers).filter((f) => /^supabase\/functions\/[^/_][^/]*\/index\.(ts|js)$/.test(f)).sort();
  const emportes = new Map(); // module → Set(fonctions)
  const vus = new Set();
  const pile = entrees.map((e) => [e, e.split("/")[2]]);
  while (pile.length) {
    const [f, fn] = pile.pop();
    if (vus.has(f + "\u0000" + fn)) continue;
    vus.add(f + "\u0000" + fn);
    const { specs, nonLitteraux } = imports(fichiers[f]);
    if (nonLitteraux > 0) defauts.push(`${f} : import() non littéral — ce qu'emporte ${fn} devient incalculable`);
    for (const spec of specs) {
      const cible = resoudre(f, spec);
      if (cible === null) continue;
      if (!(cible in fichiers)) { defauts.push(`${f} : importe « ${spec} », introuvable`); continue; }
      if (!emportes.has(cible)) emportes.set(cible, new Set());
      emportes.get(cible).add(fn);
      pile.push([cible, fn]);
    }
  }

  // Les suites, et les modules emportés qu'elles importent elles-mêmes.
  const importsDe = new Map();
  for (const s of Object.keys(fichiers).filter((f) => /^tests\/unit\/[^/]+\.test\.mjs$/.test(f)).sort()) {
    const mods = new Set();
    for (const spec of imports(fichiers[s]).specs) { const c = resoudre(s, spec); if (c && emportes.has(c)) mods.add(c); }
    if (mods.size) importsDe.set(s, [...mods].sort());
  }
  const listees = new Set();
  for (const s of etape.listees) { if (listees.has(s)) defauts.push(`${s} : listée deux fois`); listees.add(s); }
  const couvert = (m) => [...listees].some((s) => (importsDe.get(s) || []).includes(m));

  // ⓪ chaque fichier de _shared est emporté.
  for (const f of Object.keys(fichiers).filter((x) => x.startsWith(SHARED)).sort()) {
    if (!emportes.has(f) && !(f in ecarts)) defauts.push(`${f} : aucune fonction ne l'emporte — code mort, ou un import que ce banc n'a pas su lire`);
  }
  // ① chaque module emporté a une suite listée qui l'importe.
  for (const [m, fns] of [...emportes].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (couvert(m) || m in ecarts) continue;
    const l = [...importsDe].filter(([, ms]) => ms.includes(m)).map(([s]) => s);
    defauts.push(`${m} : emporté par ${[...fns].sort().join(", ")}, aucune suite listée ne l'importe — ${l.length ? "l'importent : " + l.join(", ") : "aucune suite ne l'importe"}`);
  }
  // ② chaque suite qui importe un module emporté est listée.
  for (const [s, ms] of importsDe) {
    if (listees.has(s) || s in ecarts) continue;
    defauts.push(`${s} : importe ${ms.join(", ")} (emportés) et ne tourne pas avant « Déployer » — la lister dans l'étape, ou déclarer l'écart avec sa raison`);
  }
  // ③ chaque suite listée existe et garde quelque chose.
  for (const s of listees) {
    if (!(s in fichiers)) defauts.push(`${s} : listée, introuvable — « node --test » sortirait en 1 et retiendrait tout déploiement`);
    else if (!importsDe.has(s)) defauts.push(`${s} : listée, n'importe aucun module emporté — elle ne garde rien ici`);
  }
  // Les écarts : une raison, et un objet.
  for (const [cible, raison] of Object.entries(ecarts)) {
    if (typeof raison !== "string" || raison.trim().length < RAISON_MIN) defauts.push(`écart ${cible} : sans raison (${RAISON_MIN} caractères au moins)`);
    if (cible.startsWith(SUITES + "/")) {
      if (!(cible in fichiers)) defauts.push(`écart ${cible} : sans objet — la suite n'existe pas`);
      else if (!importsDe.has(cible)) defauts.push(`écart ${cible} : sans objet — elle n'importe aucun module emporté`);
      else if (listees.has(cible)) defauts.push(`écart ${cible} : sans objet — elle est listée`);
    } else if (cible.startsWith(FONCTIONS + "/")) {
      const utile = emportes.has(cible) ? !couvert(cible) : cible.startsWith(SHARED) && cible in fichiers;
      if (!utile) defauts.push(`écart ${cible} : sans objet — ${!(cible in fichiers) ? "le fichier n'existe pas" : emportes.has(cible) ? "une suite listée l'importe" : "ce n'est pas un module"}`);
    } else defauts.push(`écart ${cible} : ni une suite de tests/unit, ni un fichier de supabase/functions`);
  }
  // ⑤ le Node des verrous est celui qui éprouve les suites en CI.
  if (!etape.version) defauts.push("aucune installation de Node (actions/setup-node) avant les verrous");
  else if (ref && ref.version && majeure(etape.version) !== majeure(ref.version)) {
    defauts.push(`Node ${etape.version} avant les verrous, Node ${ref.version} dans deploy.yml (job ${ref.job}), qui éprouve tests/unit/*.test.mjs : une suite verte à la fusion peut rougir ici et retenir le déploiement, ou l'inverse`);
  }
  return { defauts, emportes, importsDe, listees, version: etape.version, reference: ref, verrous: etape.verrous };
}

const REEL = depot();
const AUDIT = auditer(REEL);
const S = (nom) => SHARED + nom;
const INDEX_PILOTAGE = FONCTIONS + "/pilotage/index.ts";

test("⓪ ① ② ③ ④ ⑤ le dépôt tel qu'il est : chaque module emporté a sa suite avant « Déployer », chaque suite d'un module emporté y tourne ou son écart est dit", () => {
  assert.deepEqual(AUDIT.defauts, []);
});

test("le lecteur voit ce que la CLI emporte : tout _shared, l'import de dix lignes, la transitivité, require()", () => {
  const shared = Object.keys(REEL.fichiers).filter((f) => f.startsWith(SHARED)).sort();
  assert.ok(shared.length >= 10, "prémisse : _shared est lu");
  assert.deepEqual([...AUDIT.emportes.keys()].sort(), shared, "chaque fichier de _shared est emporté");
  const fonctions = Object.keys(REEL.fichiers).filter((f) => /^supabase\/functions\/[^/_][^/]*\/index\.ts$/.test(f));
  assert.equal(AUDIT.emportes.get(S("revision.js")).size, fonctions.length, "chaque fonction sert sa révision");
  // pilotage/index.ts importe pilotage.js par une instruction de dix lignes.
  assert.match(REEL.fichiers[INDEX_PILOTAGE], /^import \{\n[\s\S]*?\n\} from "\.\.\/_shared\/pilotage\.js";$/m);
  assert.ok(AUDIT.emportes.get(S("pilotage.js")).has("pilotage"));
  // contrats-actions.js n'est importé par aucun index.ts : parcours.js l'emporte.
  assert.ok(fonctions.every((f) => !REEL.fichiers[f].includes("contrats-actions")));
  assert.deepEqual([...AUDIT.emportes.get(S("contrats-actions.js"))], ["pilotage"]);
  assert.deepEqual([...AUDIT.emportes.get(S("purge-compte.js"))].sort(), ["delete-account", "export-account"]);
  // Une suite qui importe par createRequire() est vue.
  assert.deepEqual(AUDIT.importsDe.get(SUITES + "/audit-tables-compte.test.mjs"), [S("export-compte.js"), S("purge-compte.js")]);
  // Ce banc n'importe aucun module : ses textes de mutation ne le font pas passer pour une suite.
  assert.equal(AUDIT.importsDe.has(CE_BANC), false);
  assert.ok(AUDIT.listees.size >= 10 && AUDIT.verrous.length === 1, "prémisse : l'étape est lue");
  assert.equal(majeure(AUDIT.version), majeure(AUDIT.reference.version));
});

// ── ⑥ Le bloc réel, joué par bash comme sur le runner, contre un faux `node` ─────
// Un `run:` sans `shell:` tourne sous `bash -e {0}` : la première commande en
// échec arrête l'étape, donc le job, donc « Déployer ». Le faux `node` journalise
// ses arguments et sort en 1 pour la suite désignée par ROUGE.
const BAC = fs.mkdtempSync(path.join(os.tmpdir(), "edge-verrous-"));
fs.mkdirSync(path.join(BAC, "bin"));
fs.writeFileSync(path.join(BAC, "bin", "node"), [
  "#!/usr/bin/env bash",
  'echo "$*" >> "$JOURNAL"',
  'for a in "$@"; do if [ "$a" = "$ROUGE" ]; then exit 1; fi; done',
  "exit 0",
].join("\n") + "\n");
fs.chmodSync(path.join(BAC, "bin", "node"), 0o755);

function jouer(script, rouge, options = ["-e"]) {
  const journal = path.join(BAC, "journal.txt");
  fs.writeFileSync(journal, "");
  fs.writeFileSync(path.join(BAC, "etape.sh"), script);
  const r = spawnSync("bash", [...options, path.join(BAC, "etape.sh")], {
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      PATH: path.join(BAC, "bin").replace(/^([A-Za-z]):/, (x, d) => "/" + d.toLowerCase()) + path.delimiter + process.env.PATH,
      JOURNAL: journal, ROUGE: rouge,
    },
  });
  return { code: r.status, sortie: String(r.stdout || "") + String(r.stderr || ""), lancees: fs.readFileSync(journal, "utf8").split("\n").filter(Boolean) };
}

test("⑥ le bloc run: réel sous bash -e : chaque suite listée tourne, dans l'ordre ; la première rouge arrête l'étape", () => {
  for (const { run } of AUDIT.verrous) {
    const appels = run.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("node --test ")).map((l) => l.slice("node ".length));
    const suite = (k) => appels[k].split(" ")[1];
    const vert = jouer(run, "");
    assert.equal(vert.code, 0, vert.sortie);
    assert.deepEqual(vert.lancees, appels);
    const tete = jouer(run, suite(0));
    assert.equal(tete.code, 1);
    assert.deepEqual(tete.lancees, [appels[0]], "après une suite rouge, plus rien ne tourne");
    const k = Math.floor(appels.length / 2);
    const milieu = jouer(run, suite(k));
    assert.equal(milieu.code, 1);
    assert.deepEqual(milieu.lancees, appels.slice(0, k + 1));
    // Le défaut que ④ refuse : hors de `bash -e` (un `shell:` maison), une suite
    // rouge en tête passe pour verte dès que la dernière l'est.
    const sansE = jouer(run, suite(0), []);
    assert.equal(sansE.code, 0);
    assert.deepEqual(sansE.lancees, appels);
  }
});

// ── ⑦ Mutations rejouées sur le texte réel ─────────────────────────────────────
// ⚠️ Les textes de mutation qui importent un module emporté sont ASSEMBLÉS
// (VERS_SHARED) : écrits en clair, ils feraient de ce banc une suite qui importe
// un module emporté, et ② le réclamerait dans l'étape.
const VERS_SHARED = "../../supabase/" + "functions/_shared/";
const INDENT = " ".repeat(10);
const LIGNE_PLAFOND = "node --test tests/unit/plafond.test.mjs\n";
const avec = (patch = {}) => ({
  workflow: patch.workflow ?? REEL.workflow,
  reference: patch.reference ?? REEL.reference,
  fichiers: { ...REEL.fichiers, ...(patch.fichiers || {}) },
});
function muter(texte, avant, apres) {
  assert.equal(texte.split(avant).length - 1, 1, `la mutation doit s'appliquer une fois : ${JSON.stringify(avant)}`);
  return texte.replace(avant, () => apres);
}
function rougit(etat, motif, ecarts = ECARTS) {
  const { defauts } = auditer(etat, ecarts);
  assert.ok(defauts.some((d) => motif.test(d)), `attendu ${motif}, lu : ${JSON.stringify(defauts, null, 1)}`);
  return defauts;
}
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("⑦ retirer N'IMPORTE QUELLE ligne de l'étape rougit, en nommant sa suite", () => {
  const lignes = AUDIT.verrous.flatMap((v) => v.run.split("\n")).map((l) => l.trim()).filter((l) => l.startsWith("node --test "));
  assert.ok(lignes.length >= 10);
  for (const l of lignes) {
    const sans = muter(REEL.workflow, "\n" + INDENT + l + "\n", "\n");
    for (const s of l.split(" ").slice(2)) rougit(avec({ workflow: sans }), new RegExp("^" + echapper(s) + " : importe .* ne tourne pas avant « Déployer »"));
  }
});

test("⑦ un import _shared sans suite rougit : dans une fonction, sur plusieurs lignes, dans un module emporté, en import() ; listée, sa suite remet au vert", () => {
  const ancre = 'import { REVISION } from "../_shared/revision.js";\n';
  const neuf = { [S("neuf.js")]: "export const neuf = 1;\n" };
  const motif = /^supabase\/functions\/_shared\/neuf\.js : emporté par pilotage, aucune suite listée ne l'importe — aucune suite ne l'importe$/;
  const direct = muter(REEL.fichiers[INDEX_PILOTAGE], ancre, ancre + 'import { neuf } from "../_shared/neuf.js";\n');
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: direct } }), motif);
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: muter(REEL.fichiers[INDEX_PILOTAGE], ancre, ancre + 'import {\n  neuf, // le geste neuf\n} from "../_shared/neuf.js";\n') } }), motif);
  rougit(avec({ fichiers: { ...neuf, [S("parcours.js")]: 'import { neuf } from "./neuf.js";\n' + REEL.fichiers[S("parcours.js")] } }), motif);
  rougit(avec({ fichiers: { ...neuf, [S("battement.js")]: REEL.fichiers[S("battement.js")] + 'export const charger = () => import("./neuf.js");\n' } }), motif);
  // Ce qu'on ne sait pas suivre se dit : un chemin calculé, un fichier absent.
  rougit(avec({ fichiers: { [S("battement.js")]: REEL.fichiers[S("battement.js")] + 'export const charger = (n) => import("./" + n + ".js");\n' } }),
    /^supabase\/functions\/_shared\/battement\.js : import\(\) non littéral — ce qu'emporte pilotage devient incalculable$/);
  rougit(avec({ fichiers: { [INDEX_PILOTAGE]: muter(REEL.fichiers[INDEX_PILOTAGE], ancre, ancre + 'import { x } from "../_shared/absent.js";\n') } }),
    /^supabase\/functions\/pilotage\/index\.ts : importe « \.\.\/_shared\/absent\.js », introuvable$/);
  // Le remède : la suite du module neuf, listée.
  const remede = avec({
    workflow: muter(REEL.workflow, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + "node --test tests/unit/neuf.test.mjs\n"),
    fichiers: { ...neuf, [INDEX_PILOTAGE]: direct, [SUITES + "/neuf.test.mjs"]: `import { neuf } from "${VERS_SHARED}neuf.js";\n` },
  });
  assert.deepEqual(auditer(remede).defauts, []);
});

test("⑦ une suite neuve qui importe un module emporté rougit tant qu'elle n'est pas listée ; un import cité en commentaire ne compte pas", () => {
  const neuve = SUITES + "/neuve.test.mjs";
  const motif = /^tests\/unit\/neuve\.test\.mjs : importe supabase\/functions\/_shared\/plafond\.js \(emportés\) et ne tourne pas avant « Déployer »/;
  rougit(avec({ fichiers: { [neuve]: `import { verdictDepuisComptes } from "${VERS_SHARED}plafond.js";\n` } }), motif);
  rougit(avec({ fichiers: { [neuve]: `const { verdictDepuisComptes } = require("${VERS_SHARED}plafond.js");\n` } }), motif);
  rougit(avec({ fichiers: { [neuve]: `const m = await import("${VERS_SHARED}plafond.js");\n` } }), motif);
  assert.deepEqual(auditer(avec({ fichiers: { [neuve]: `// import { verdictDepuisComptes } from "${VERS_SHARED}plafond.js";\n` } })).defauts, []);
  const listee = muter(REEL.workflow, LIGNE_PLAFOND, "node --test tests/unit/plafond.test.mjs tests/unit/neuve.test.mjs\n");
  assert.deepEqual(auditer(avec({ workflow: listee, fichiers: { [neuve]: `import { verdictDepuisComptes } from "${VERS_SHARED}plafond.js";\n` } })).defauts, []);
});

test("⑦ les écarts : retiré, il rougit ; sans objet, sans raison ou hors cible, aussi", () => {
  const sauf = (cle) => Object.fromEntries(Object.entries(ECARTS).filter(([k]) => k !== cle));
  const raison = "une raison écrite, assez longue pour passer le seuil du banc";
  rougit(REEL, /^supabase\/functions\/_shared\/revision\.js : emporté par .*, aucune suite listée ne l'importe — aucune suite ne l'importe$/, sauf(S("revision.js")));
  rougit(REEL, /^tests\/unit\/sentinelle-detecter\.test\.mjs : importe supabase\/functions\/_shared\/autonomie\.js/, sauf(SUITES + "/sentinelle-detecter.test.mjs"));
  const listee = muter(REEL.workflow, LIGNE_PLAFOND, "node --test tests/unit/plafond.test.mjs tests/unit/sentinelle-detecter.test.mjs\n");
  rougit(avec({ workflow: listee }), /^écart tests\/unit\/sentinelle-detecter\.test\.mjs : sans objet — elle est listée$/);
  rougit(REEL, /^écart tests\/unit\/fantome\.test\.mjs : sans objet — la suite n'existe pas$/, { ...ECARTS, [SUITES + "/fantome.test.mjs"]: raison });
  rougit(REEL, /^écart tests\/unit\/bornes-ci\.test\.mjs : sans objet — elle n'importe aucun module emporté$/, { ...ECARTS, [SUITES + "/bornes-ci.test.mjs"]: raison });
  rougit(REEL, /^écart supabase\/functions\/_shared\/plafond\.js : sans objet — une suite listée l'importe$/, { ...ECARTS, [S("plafond.js")]: raison });
  rougit(REEL, /^écart supabase\/functions\/pilotage\/index\.ts : sans objet — ce n'est pas un module$/, { ...ECARTS, [INDEX_PILOTAGE]: raison });
  rougit(REEL, /^écart tests\/unit\/sentinelle-detecter\.test\.mjs : sans raison/, { ...ECARTS, [SUITES + "/sentinelle-detecter.test.mjs"]: "parce que" });
  rougit(REEL, /^écart docs\/x\.md : ni une suite de tests\/unit, ni un fichier de supabase\/functions$/, { ...ECARTS, "docs/x.md": raison });
});

test("⑦ ④ la forme de l'étape : après « Déployer », || true, motif, filtre, set +e, continue-on-error, if, shell — et if: always() sur « Déployer »", () => {
  const W = REEL.workflow;
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, "node --test tests/unit/plafond.test.mjs || true\n") }), /ligne non reconnue « node --test tests\/unit\/plafond\.test\.mjs \|\| true »/);
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, 'node --test "tests/unit/*.test.mjs"\n') }), /ligne non reconnue « node --test "tests\/unit\/\*\.test\.mjs" »/);
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, "node --test --test-name-pattern=① tests/unit/plafond.test.mjs\n") }), /ligne non reconnue « node --test --test-name-pattern/);
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + "set +e\n") }), /ligne non reconnue « set \+e »/);
  const NOM = "      - name: Verrous unitaires des modules partagés\n";
  rougit(avec({ workflow: muter(W, NOM, NOM + "        continue-on-error: true\n") }), /^« Verrous unitaires des modules partagés » : continue-on-error/);
  rougit(avec({ workflow: muter(W, NOM, NOM + "        if: github.event_name == 'workflow_dispatch'\n") }), /^« Verrous unitaires des modules partagés » : if: .* un verrou conditionnel/);
  rougit(avec({ workflow: muter(W, NOM, NOM + "        shell: bash {0}\n") }), /^« Verrous unitaires des modules partagés » : shell: bash \{0\}/);
  const DEP = "      - name: Déployer\n";
  rougit(avec({ workflow: muter(W, DEP, DEP + "        if: always()\n") }), /^« Déployer » : if: always\(\) — passe outre l'échec d'un verrou$/);
  // L'étape déplacée APRÈS « Déployer » : ses suites ne retiennent plus rien.
  const debut = W.indexOf(NOM);
  const fin = W.indexOf("      - uses: supabase/setup-cli@v1\n");
  assert.ok(debut > 0 && fin > debut, "prémisse : l'étape précède l'installation de la CLI");
  const deplace = muter(W.slice(0, debut) + W.slice(fin), "      - name: Test de fumée", W.slice(debut, fin) + "      - name: Test de fumée");
  const d = rougit(avec({ workflow: deplace }), /^« Verrous unitaires des modules partagés » : après « Déployer » — ses suites ne retiennent rien$/);
  assert.ok(d.includes("aucune étape ne lance « node --test » avant « Déployer »"));
  assert.ok(d.some((x) => /^supabase\/functions\/_shared\/plafond\.js : emporté/.test(x)));
});

test("⑦ ③ une suite listée absente, sans module emporté, ou deux fois : chacune rougit", () => {
  const sans = { ...REEL.fichiers };
  delete sans[SUITES + "/battement.test.mjs"];
  rougit({ ...REEL, fichiers: sans }, /^tests\/unit\/battement\.test\.mjs : listée, introuvable/);
  rougit(avec({ workflow: muter(REEL.workflow, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + "node --test tests/unit/bornes-ci.test.mjs\n") }), /^tests\/unit\/bornes-ci\.test\.mjs : listée, n'importe aucun module emporté/);
  rougit(avec({ workflow: muter(REEL.workflow, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + LIGNE_PLAFOND) }), /^tests\/unit\/plafond\.test\.mjs : listée deux fois$/);
});

test("⑦ ⓪ un fichier de _shared qu'aucune fonction n'emporte rougit — et c'est ce qui trahirait un import mal lu", () => {
  rougit(avec({ fichiers: { [S("orphelin.js")]: "export const orphelin = 1;\n" } }), /^supabase\/functions\/_shared\/orphelin\.js : aucune fonction ne l'emporte/);
  // Un lecteur qui raterait l'import de dix lignes ne perdrait pas pilotage.js en silence.
  const aveugle = REEL.fichiers[INDEX_PILOTAGE].replace(/^import \{\n[\s\S]*?\n\} from "\.\.\/_shared\/pilotage\.js";$/m, "");
  assert.notEqual(aveugle, REEL.fichiers[INDEX_PILOTAGE]);
  rougit(avec({ fichiers: { [INDEX_PILOTAGE]: aveugle } }), /^supabase\/functions\/_shared\/pilotage\.js : aucune fonction ne l'emporte/);
});

test("⑦ ⑤ Node : un autre majeur que deploy.yml rougit ; une installation absente, une référence disparue aussi", () => {
  const ref = AUDIT.reference;
  const autre = String(Number(majeure(ref.version)) - 2);
  rougit(avec({ workflow: muter(REEL.workflow, `node-version: ${AUDIT.version}\n`, `node-version: ${autre}\n`) }),
    new RegExp(`^Node ${autre} avant les verrous, Node ${ref.version} dans deploy\\.yml \\(job ${ref.job}\\)`));
  rougit(avec({ workflow: muter(REEL.workflow, "        uses: actions/setup-node@v4\n", "        uses: actions/cache@v4\n") }), /^aucune installation de Node \(actions\/setup-node\) avant les verrous$/);
  rougit(avec({ reference: muter(REEL.reference, 'run: node --test "tests/unit/*.test.mjs"\n', "run: echo rien\n") }), /^deploy\.yml : aucun job n'y lance tests\/unit\/\*\.test\.mjs/);
});

test("⑧ npm run verif porte ce banc", () => {
  const pkg = JSON.parse(lire("package.json"));
  assert.match(pkg.scripts.verif, /node --test tests\/unit\/edge-functions-verrous\.test\.mjs/);
});
