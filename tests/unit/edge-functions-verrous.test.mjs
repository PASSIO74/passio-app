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
//   ② chaque suite de tests/unit qui importe un module emporté, ou qui LIT le
//     code d'une fonction (son index.ts), est listée : une ligne ne se retire
//     pas en silence, une suite neuve ne s'oublie pas ;
//     ②' une suite qui charge par un chemin CALCULÉ et nomme `supabase/` ou
//     `_shared`, ou qui NOMME l'index.ts d'une fonction sans que sa lecture se
//     voie, est listée aussi, ou déclarée : le banc ne peut dire quoi ;
//   ③ chaque suite listée existe, une seule fois, et importe un module emporté
//     ou lit le code d'une fonction ; ce banc est listé, en tête : sur un push
//     direct, que la CI parallèle ne retient pas, une ligne retirée rougit quand
//     même avant « Déployer » ;
//   ④ l'étape précède CHAQUE étape qui déploie, sans `if:`, sans
//     `continue-on-error`, dans le shell par défaut (`bash -e`, `defaults:` du
//     job et du workflow compris), sans variable NODE_* dans aucun `env:` qui
//     l'atteint ni écriture de $GITHUB_ENV avant elle, et ne lance que des
//     `node --test <suite>` ; aucune étape qui déploie n'a de fonction d'état
//     (always, failure, cancelled, success) dans son `if:` ;
//   ⑤ le Node installé avant les verrous a la version majeure du job de
//     deploy.yml qui éprouve tests/unit/*.test.mjs (sans node_modules, comme ici) ;
//     une version illisible de ce côté-là rougit aussi ;
//   ⑨ chaque fonction est EXÉCUTÉE par une suite listée — elle lit son index.ts
//     et le charge (`stripTypeScriptTypes`, dans la suite ou une aide de
//     tests/unit : le gabarit de notify-call-chemins, lib/executer-fonction.mjs) —,
//     ou son écart est déclaré : une fonction neuve sans banc qui l'exécute rougit.
// « Importer », c'est un import statique, un `import()` ou un `require()` dont le
// chemin s'écrit, dans la suite ou dans une aide de tests/unit qu'elle importe.
// Une suite qui n'atteint un module qu'à travers un script éprouve le script. Un
// écart VOLONTAIRE (module sans suite, suite non listée) se déclare dans ECARTS
// avec sa raison ; un écart qui n'a plus d'objet rougit.
// « Lire le code d'une fonction » (2026-11-09), c'est un `readFileSync(…)` ou un
// `readFile(…)` dont le chemin s'écrit — littéral, relatif à la racine (l'étape
// lance `node --test` depuis la racine du dépôt) ; `new URL("…", import.meta.url)` ;
// `path.join(RACINE, "…")` — et désigne `supabase/functions/<nom>/index.ts`. C'est
// ainsi qu'un banc EXÉCUTE le vrai gestionnaire (notify-call-chemins.test.mjs) :
// de #753 au 09/11, `uid`, jamais déclaré, rendait 500 à toute push sociale, et
// aucune suite d'un module partagé ne pouvait le voir — seul un banc qui exécute
// le site d'appel le voit. Sans import, la règle ③ le refusait (« ne garde rien »).
//
// ⑥ joue le bloc `run:` réel sous `bash -e` contre un faux `node`. ⑦ rejoue les
// mutations sur le texte réel : retirer n'importe quelle ligne, ajouter un import
// `_shared` sans suite (accentué, derrière un commentaire de bloc, anti-cache…),
// déplacer l'étape, changer Node, contourner par `if:`, `defaults:` ou `env:`…
// Chacune rougit, et le remède (la suite listée) redevient vert.
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
// ⚠️ Une raison se PROUVE, elle ne se lit pas (contre-revue du 2026-11-07).
// « Le module est éprouvé avant « Déployer » par X » veut dire que la mutation
// du module qu'attrape la suite écartée rougit aussi une suite LISTÉE. Deux
// raisons ne tenaient pas : retirer "emulation" de TRAFICS_HORS_PUBLIC, ou
// `|e[0-9]+` d'EXPRESSION_EXEMPLE (la purge), passait les dix-huit verrous.
// pilotage ⑯ éprouve désormais les trois valeurs, et identifiants-exemple.test.mjs
// (ce que la purge tient pour un exemple, contre la base) est listée.
const ECARTS = Object.freeze({
  // ⑨ — plus aucun écart d'exécution : pilotage, la dernière fonction qu'aucun banc n'exécutait
  // (2026-11-09), a le sien depuis le 2026-11-12 (pilotage-chemins.test.mjs).
  "supabase/functions/_shared/revision.js":
    "écrit par l'étape « Révision » de ce workflow juste avant « Déployer » (une ligne : le SHA déployé) ; la fumée relit ce qu'il sert sur chaque fonction (X-Passio-Revision)",
  "tests/unit/audit-contrats-actions.test.mjs":
    "éprouve la garde scripts/audit-contrats-actions.mjs et l'accord du client (js/*.js, package.json) avec le registre ; contrats-actions.js est éprouvé avant « Déployer » par parcours.test.mjs (validerContrats, contratDe, contratsCritiques)",
  "tests/unit/audit-tables-compte.test.mjs":
    "éprouve la gate scripts/audit-tables-compte.js (migrations et référentiel du schéma contre TABLES_COMPTE) ; la purge et l'export sont éprouvés avant « Déployer » par purge-compte, suppression-compte, suppression-entrelacement et export-compte",
  "tests/unit/politique-autonomie-executants.test.mjs":
    "éprouve deploy.yml, sentinelle-autonome.yml, scripts/sentinelle-detecter.mjs et js/app-04 contre la politique, et l'existence de chaque « appliquePar » ; la fonction ne décide que par autoriser() (circuit, autonome, mode, pause : politique-autonomie.test.mjs ③, avant « Déployer ») et n'affiche aucune borne (resumerPolitique) — une borne qui diverge de son exécutant ne change rien à ce qui part, la CI de main la rougit",
  "tests/unit/sentinelle-detecter.test.mjs":
    "éprouve scripts/sentinelle-detecter.mjs, que la Sentinelle exécute chez GitHub ; REVEIL n'y est qu'une référence croisée (MAX_ENQUETES) — autonomie.js est éprouvé avant « Déployer » par autonomie et autonomie-seuils-sql",
  "tests/unit/trafic-hors-public.test.mjs":
    "éprouve l'accord de trois lecteurs (dashboard/server/trafic.js, scripts/veille-production.mjs, js/telemetry.js) avec pilotage.js, et la syntaxe du client pour un vieux Safari ; ce que la fonction compte (les trois valeurs de TRAFICS_HORS_PUBLIC, traficHorsPublic, compterAudience) est éprouvé avant « Déployer » par pilotage.test.mjs (⑯)",
});
const RAISON_MIN = 40;

/** Ce que le banc lit : tout supabase/functions, tout tests/unit (suites et aides de tests/unit/lib). */
function depot() {
  const fichiers = {};
  const parcourir = (dir) => {
    for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
      const p = dir + "/" + e.name;
      if (e.isDirectory()) parcourir(p);
      else if (/\.(ts|js|mjs)$/.test(e.name)) fichiers[p] = lire(p);
    }
  };
  parcourir(FONCTIONS);
  parcourir(SUITES);
  return { workflow: lire(WORKFLOW), reference: lire(REFERENCE), fichiers };
}

// ── Les imports d'un fichier ────────────────────────────────────────────────
// Un LEXEUR, pas une expression régulière (contre-revue du 2026-11-07 : la
// première version, ligne à ligne, ratait `import { a as vérifier } from …` —
// classe de caractères ASCII — et `/* … */ import …`, et comptait un import
// écrit dans un bloc de commentaire ou un gabarit). Commentaires de ligne et de
// bloc, chaînes, gabarits et leurs `${…}`, expressions régulières : un import
// n'est lu que dans le CODE, et un identifiant peut être accentué.
// Rend `specs` (les chemins lus), `calcules` (les `import()`/`require()` dont le
// chemin ne se lit pas) et `nomme` (une chaîne du fichier nomme `supabase/` ou
// `_shared`). Un chemin se lit : en littéral (chaîne, gabarit sans `${}`), suivi
// d'un calcul après `?` ou `#` (anti-cache : `"…/m.js?t=" + Date.now()`), ou en
// `new URL("…", import.meta.url)`.
// Et (2026-11-09) `lectures` : les `readFileSync(…)`/`readFile(…)` dont le chemin
// se lit (`cheminLu`), avec sa base — la racine, ou le fichier pour `new URL` ;
// `noms` : les chaînes du CODE qui désignent un `index.ts`/`index.js` ; `charge` :
// le code appelle ou importe `stripTypeScriptTypes` (il EXÉCUTE ce qu'il lit).
const ESPACE = /\s+/y;
const IDENT = /[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/uy;
const NOMBRE = /\.?[0-9][0-9A-Za-z_.]*/y;
const AVANT_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

function lexer(src) {
  const flux = [];                  // le code, puis chaque `${…}` de gabarit : lus chacun pour lui-même
  const n = src.length;
  let i = 0;
  const colle = (re) => { re.lastIndex = i; const m = re.exec(src); return m ? m[0].length : 0; };
  function chaine(q) {              // i sur le guillemet ouvrant
    let v = "";
    for (i++; i < n && src[i] !== q && src[i] !== "\n"; i++) {
      if (src[i] === "\\") i++;
      v += src[i] ?? "";
    }
    i++;
    return v;
  }
  function regex() {                // i sur « / » ; rend la fin, ou -1 (ce n'était pas une expression)
    let classe = false;
    for (let j = i + 1; j < n && src[j] !== "\n"; j++) {
      if (src[j] === "\\") { j++; continue; }
      if (classe) { if (src[j] === "]") classe = false; } else if (src[j] === "[") classe = true;
      else if (src[j] === "/") { j++; while (j < n && /[A-Za-z]/.test(src[j])) j++; return j; }
    }
    return -1;
  }
  function gabarit() {              // i sur l'accent grave ouvrant
    let q = "", premier = null, tout = "";
    for (i++; i < n && src[i] !== "`";) {
      if (src[i] === "\\") { q += src[i + 1] ?? ""; i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") { if (premier === null) premier = q; tout += q; q = ""; i += 2; lire(true); continue; }
      q += src[i++];
    }
    i++;
    return { k: "tpl", v: premier === null ? q : premier, sub: premier !== null, tout: tout + q };
  }
  function lire(dansGabarit) {
    const t = [];
    flux.push(t);
    let prof = 0;
    const regexPermise = () => {
      const d = t[t.length - 1];
      if (!d) return true;
      if (d.k === "id") return AVANT_REGEX.has(d.v);
      return d.k === "p" && d.v !== ")" && d.v !== "]";
    };
    while (i < n) {
      const c = src[i];
      let l;
      if ((l = colle(ESPACE))) { i += l; continue; }
      if (c === "/" && src[i + 1] === "/") { const j = src.indexOf("\n", i); i = j < 0 ? n : j; continue; }
      if (c === "/" && src[i + 1] === "*") { const j = src.indexOf("*/", i + 2); i = j < 0 ? n : j + 2; continue; }
      if (c === "'" || c === '"') { t.push({ k: "str", v: chaine(c) }); continue; }
      if (c === "`") { t.push(gabarit()); continue; }
      if (c === "/" && regexPermise()) { const j = regex(); if (j > 0) { t.push({ k: "re" }); i = j; continue; } }
      if ((l = colle(IDENT))) { t.push({ k: "id", v: src.slice(i, i + l) }); i += l; continue; }
      if ((l = colle(NOMBRE))) { t.push({ k: "num" }); i += l; continue; }
      if (dansGabarit && c === "}" && prof === 0) { i++; return; }
      if (dansGabarit && c === "{") prof++;
      if (dansGabarit && c === "}") prof--;
      t.push({ k: "p", v: c });
      i++;
    }
  }
  lire(false);
  return flux;
}

const est = (j, k, v) => !!j && j.k === k && (v === undefined || j.v === v);
const litteral = (j) => est(j, "str") || (est(j, "tpl") && !j.sub);
/** `new URL("…", import.meta.url)` à partir du jeton p : le chemin, ou `null`. */
const NEW_URL = ["new", "URL", "(", null, ",", "import", ".", "meta", ".", "url", ")"];
const newUrl = (t, p) => (NEW_URL.every((v, k) => (v === null ? est(t[p + k], "str") : !!t[p + k] && t[p + k].v === v)) ? t[p + 3].v : null);
/** Le chemin d'un `import(…)`/`require(…)` dont l'argument commence au jeton p ; `null` s'il ne se lit pas. */
function chemin(t, p) {
  const a = t[p], b = t[p + 1];
  if (litteral(a)) {
    if (est(b, "p", ")") || est(b, "p", ",")) return a.v;
    if (/[?#]/.test(a.v) && est(b, "p", "+")) return a.v;
  }
  if (est(a, "tpl") && a.sub && /[?#]/.test(a.v)) return a.v;
  return newUrl(t, p);
}
/**
 * Le chemin d'un `readFileSync(…)`/`readFile(…)` dont l'argument commence au jeton p,
 * et ce contre quoi il se résout ; `null` s'il ne se lit pas. Un littéral se lit
 * depuis le répertoire courant — la racine : l'étape et la CI lancent `node --test`
 * depuis la racine du dépôt ; `new URL` depuis le fichier ; `path.join(X, "…")` et
 * `path.resolve(X, "…")` depuis X, la racine du dépôt par convention (RACINE).
 */
function cheminLu(t, p) {
  if (litteral(t[p]) && (est(t[p + 1], "p", ")") || est(t[p + 1], "p", ","))) return { v: t[p].v, base: "racine" };
  const url = newUrl(t, p);
  if (url !== null) return { v: url, base: "fichier" };
  const q = est(t[p], "id") && est(t[p + 1], "p", ".") ? p + 2 : p;
  if ((est(t[q], "id", "join") || est(t[q], "id", "resolve")) && est(t[q + 1], "p", "(") && est(t[q + 2], "id") && est(t[q + 3], "p", ",")
    && litteral(t[q + 4]) && est(t[q + 5], "p", ")") && (est(t[q + 6], "p", ")") || est(t[q + 6], "p", ","))) return { v: t[q + 4].v, base: "racine" };
  return null;
}
const LECTURE = new Set(["readFileSync", "readFile"]);
const NOM_ENTREE = /(?:^|\/)index\.(?:ts|js)$/;
const CLAUSE = new Set(["{", "}", ",", "*"]);

// Chaque mutation ne change qu'un fichier ou deux : les autres sont relus du cache.
const DEJA_LUS = new Map();
function imports(src) {
  const texte = String(src);
  if (!DEJA_LUS.has(texte)) DEJA_LUS.set(texte, lireImports(texte));
  return DEJA_LUS.get(texte);
}
function lireImports(src) {
  const specs = [], lectures = [], noms = [];
  let calcules = 0, nomme = false, charge = false;
  for (const t of lexer(src)) {
    for (let k = 0; k < t.length; k++) {
      const j = t[k];
      if ((j.k === "str" && /supabase\/|_shared/.test(j.v)) || (j.k === "tpl" && /supabase\/|_shared/.test(j.tout))) nomme = true;
      if (litteral(j) && NOM_ENTREE.test(j.v)) noms.push(j.v);
      if (est(j, "id", "stripTypeScriptTypes")) charge = true;   // ⑨ : le code lu est chargé, pas seulement relu
      // `fs.readFileSync(…)`, `readFile(…)` : une lecture (une déclaration n'a pas de chemin écrit en argument).
      if (j.k === "id" && LECTURE.has(j.v) && est(t[k + 1], "p", "(")) {
        const l = cheminLu(t, k + 2);
        if (l) lectures.push(l);
        continue;
      }
      if (j.k !== "id" || !["import", "export", "require"].includes(j.v)) continue;
      const avant = t[k - 1], suiv = t[k + 1];
      if (est(avant, "p", ".") || est(avant, "id", "function")) continue;   // une propriété, une déclaration
      if (j.v !== "export" && est(suiv, "p", "(")) {
        const s = chemin(t, k + 2);
        if (s === null) calcules++; else specs.push(s);
        continue;
      }
      if (j.v === "require") continue;
      if (j.v === "import" && est(suiv, "str")) { specs.push(suiv.v); continue; }   // import "x"
      if (j.v === "import" && est(suiv, "p", ".")) continue;                         // import.meta
      if (j.v === "export" && !(est(suiv, "p", "*") || est(suiv, "p", "{") || est(suiv, "id", "type"))) continue;
      for (let m = k + 1; m < t.length; m++) {                                       // … from "x"
        const x = t[m];
        if (est(x, "id", "from") && est(t[m + 1], "str")) { specs.push(t[m + 1].v); break; }
        if (!(x.k === "id" || x.k === "str" || (x.k === "p" && CLAUSE.has(x.v)))) break;
      }
    }
  }
  return { specs, calcules, nomme, lectures, noms, charge };
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
// Une fonction d'état dans un `if:` RETIRE le `success()` implicite (documentation
// GitHub, « status check functions ») : `success() || github.event_name == …`
// part aussi derrière un verrou rouge.
const FONCTION_ETAT = /\b(?:always|failure|cancelled|success)\s*\(/;
const ECRIT_ENV = /\bGITHUB_(?:ENV|PATH)\b/;
const UNITAIRES_CI = /node --test "?tests\/unit\/\*\.test\.mjs"?|node scripts\/tests-unit\.mjs|npm run test:unit/;

const nomEtape = (s, i) => s.name || s.uses || `étape ${i + 1}`;
function versionNode(etape) {
  const w = etape && etape.with;
  if (w && typeof w === "object") return String(w["node-version"] ?? "").trim();
  const m = /node-version:\s*['"]?([\w.*/-]+)/.exec(String(w || "")); // `with: { … }` rendu tel quel par le lecteur
  return m ? m[1] : "";
}
const majeure = (v) => (/\d+/.exec(String(v)) || [String(v)])[0];
/** Les noms d'un bloc `env:` (objet, ou `{ … }` rendu tel quel par le lecteur). */
const nomsEnv = (env) => (env && typeof env === "object" ? Object.keys(env) : [...String(env || "").matchAll(/([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]));
/** Le `shell` d'un bloc `defaults:` (objets, ou `{ … }` rendu tel quel). */
function shellDefaut(d) {
  const run = d && typeof d === "object" ? d.run : d;
  if (run && typeof run === "object") return run.shell;
  const m = /shell\s*:\s*([^,}\n]+)/.exec(String(run || ""));
  return m ? m[1].trim() : undefined;
}

function lireEtape(texte, defauts) {
  let doc;
  try { doc = parse(texte); } catch (e) { defauts.push(`${WORKFLOW} illisible : ${e.message}`); return null; }
  const jobs = Object.entries((doc && doc.jobs) || {}).filter(([, j]) => (j.steps || []).some((s) => DEPLOIE.test(String(s.run || ""))));
  if (jobs.length !== 1) { defauts.push(`${jobs.length} job(s) lancent « supabase functions deploy » : le banc en attend exactement un`); return null; }
  const job = jobs[0][1];
  const etapes = job.steps;
  // CHAQUE étape qui déploie, pas seulement la première : un « nouvel essai »
  // en `if: failure()` partirait justement quand un verrou a rougi.
  const deploiements = etapes.map((s, i) => [s, i]).filter(([s]) => DEPLOIE.test(String(s.run || "")));
  const iDeploie = deploiements[0][1];
  const deploie = `« ${nomEtape(etapes[iDeploie], iDeploie)} »`;
  for (const [s, i] of deploiements) {
    if (s.if !== undefined && FONCTION_ETAT.test(String(s.if))) {
      defauts.push(`« ${nomEtape(s, i)} » : if: ${s.if} — une fonction d'état retire le success() implicite : le déploiement partirait derrière un verrou rouge`);
    }
  }
  // Ce qui atteint l'étape sans y être écrit : le shell par défaut, et les
  // variables que `node --test` lit (NODE_OPTIONS=--test-only ou
  // --test-skip-pattern : sortie 0 sur une suite rouge, mesuré sous Node 22).
  for (const [niveau, env] of [["du workflow", doc.env], ["du job", job.env]]) {
    for (const k of nomsEnv(env)) if (/^NODE_/.test(k)) defauts.push(`${k} dans l'env ${niveau} — node --test y lit ses options : --test-only ou --test-skip-pattern le font sortir en 0 sur une suite rouge`);
  }
  const shellJob = shellDefaut(job.defaults), shellWf = shellDefaut(doc.defaults);
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
    const shell = s.shell ?? shellJob ?? shellWf;
    if (shell !== undefined && String(shell) !== "bash") {
      const d = s.shell !== undefined ? "" : shellJob !== undefined ? " (defaults du job)" : " (defaults du workflow)";
      defauts.push(`${ou} : shell: ${shell}${d} — seul le shell par défaut (bash -e) ou « bash » arrête l'étape à la première suite rouge`);
    }
    for (const k of nomsEnv(s.env)) if (/^NODE_/.test(k)) defauts.push(`${ou} : ${k} dans son env — node --test y lit ses options : --test-only ou --test-skip-pattern le font sortir en 0 sur une suite rouge`);
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
  etapes.slice(0, premier).forEach((s, i) => {
    if (ECRIT_ENV.test(String(s.run || ""))) defauts.push(`« ${nomEtape(s, i)} » : écrit dans $GITHUB_ENV ou $GITHUB_PATH avant les verrous — une option de Node ou un autre « node » leur parviendraient`);
  });
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
    const version = versionNode(node);
    if (!version) defauts.push(`${REFERENCE} (job ${job}) : aucune version de Node lisible avant tests/unit/*.test.mjs (pas d'actions/setup-node, ou node-version-file) — ⑤ ne prouverait plus rien`);
    return { job, version };
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
    const { specs, calcules } = imports(fichiers[f]);
    if (calcules > 0) defauts.push(`${f} : import() ou require() au chemin calculé — ce qu'emporte ${fn} devient incalculable`);
    for (const spec of specs) {
      const cible = resoudre(f, spec);
      if (cible === null) continue;
      if (!(cible in fichiers)) { defauts.push(`${f} : importe « ${spec} », introuvable`); continue; }
      if (!emportes.has(cible)) emportes.set(cible, new Set());
      emportes.get(cible).add(fn);
      pile.push([cible, fn]);
    }
  }

  // Le code d'une fonction : le chemin d'une lecture, ou une chaîne, qui désigne
  // l'index.ts d'une fonction déployée — `null` sinon (un module partagé lu comme
  // du texte n'est pas le code d'une fonction : il s'éprouve en l'important).
  const ENTREES = new Set(entrees);
  const entreeDe = (f, v, base) => {
    const brut = String(v).split(/[?#]/)[0];
    if (brut.startsWith("/")) return null;
    const c = path.posix.normalize(base === "fichier" ? path.posix.join(path.posix.dirname(f), brut) : brut);
    return ENTREES.has(c) ? c : null;
  };

  // Les suites, et les modules emportés qu'elles importent : elles-mêmes, ou par
  // une aide de tests/unit (lib/faux-admin-purge.mjs importe purge-compte.js) —
  // une aide fait partie du test ; un script, lui, est ce que la suite éprouve.
  // Même parcours pour le code des fonctions qu'elles LISENT.
  const importsDe = new Map();
  const lecturesDe = new Map();    // suite → index.ts qu'elle lit (readFileSync d'un chemin écrit)
  const executionsDe = new Map();  // suite → index.ts qu'elle lit ET charge (stripTypeScriptTypes)
  const nommeesSeules = new Map(); // suite → index.ts qu'elle nomme, sans lecture que le banc voie
  const aveugles = new Set();   // un chemin calculé, dans un fichier qui nomme supabase/ ou _shared
  for (const s of Object.keys(fichiers).filter((f) => /^tests\/unit\/[^/]+\.test\.mjs$/.test(f)).sort()) {
    const mods = new Set(), lit = new Set(), nommees = new Set();
    let calcules = 0, nomme = false, charge = false;
    const lus = new Set([s]);
    for (const file = [s]; file.length;) {
      const f = file.pop();
      const r = imports(fichiers[f]);
      calcules += r.calcules;
      nomme = nomme || r.nomme;
      charge = charge || r.charge;
      for (const spec of r.specs) {
        const c = resoudre(f, spec);
        if (c && emportes.has(c)) mods.add(c);
        else if (c && c.startsWith(SUITES + "/") && c in fichiers && !lus.has(c)) { lus.add(c); file.push(c); }
      }
      for (const l of r.lectures) { const c = entreeDe(f, l.v, l.base); if (c) lit.add(c); }
      for (const v of r.noms) { const c = entreeDe(f, v, "racine") || (/^\.\.?\//.test(v) ? entreeDe(f, v, "fichier") : null); if (c) nommees.add(c); }
    }
    if (mods.size) importsDe.set(s, [...mods].sort());
    if (lit.size) lecturesDe.set(s, [...lit].sort());
    if (lit.size && charge) executionsDe.set(s, [...lit].sort());
    const seules = [...nommees].filter((c) => !lit.has(c)).sort();
    if (seules.length) nommeesSeules.set(s, seules);
    if (calcules && nomme) aveugles.add(s);
  }
  const garde = (s) => importsDe.has(s) || lecturesDe.has(s);
  const listees = new Set();
  for (const s of etape.listees) { if (listees.has(s)) defauts.push(`${s} : listée deux fois`); listees.add(s); }
  const couvert = (m) => [...listees].some((s) => (importsDe.get(s) || []).includes(m));
  const executee = (e) => [...listees].some((s) => (executionsDe.get(s) || []).includes(e));

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
  // ② chaque suite qui importe un module emporté, ou lit le code d'une fonction, est listée.
  for (const s of [...new Set([...importsDe.keys(), ...lecturesDe.keys()])].sort()) {
    if (listees.has(s) || s in ecarts) continue;
    const quoi = [
      importsDe.has(s) ? `importe ${importsDe.get(s).join(", ")} (emportés)` : "",
      lecturesDe.has(s) ? `lit ${lecturesDe.get(s).join(", ")} (le code d'une fonction déployée)` : "",
    ].filter(Boolean).join(", ");
    defauts.push(`${s} : ${quoi} et ne tourne pas avant « Déployer » — la lister dans l'étape, ou déclarer l'écart avec sa raison`);
  }
  // ②' ce que le banc ne sait pas lire se dit : un chemin calculé, là où un module des fonctions est nommé ;
  // le code d'une fonction nommé sans lecture visible (une aide qui lit un chemin reçu, un chemin dans une constante).
  for (const s of [...aveugles].sort()) {
    if (listees.has(s) || s in ecarts || garde(s)) continue;
    defauts.push(`${s} : charge un module par un chemin calculé (import()/require()) et nomme supabase/ ou _shared — le banc ne peut dire lequel : écrire le chemin en littéral, la lister, ou déclarer l'écart`);
  }
  for (const [s, cs] of nommeesSeules) {
    if (listees.has(s) || s in ecarts || garde(s) || aveugles.has(s)) continue;
    defauts.push(`${s} : nomme ${cs.join(", ")} sans que le banc en voie la lecture — l'écrire en readFileSync("…"), la lister, ou déclarer l'écart`);
  }
  // ③ chaque suite listée existe et garde quelque chose ; ce banc y tourne (il
  // n'importe aucun module : il vérifie la liste elle-même, avant « Déployer »,
  // y compris sur un push direct que la CI parallèle ne retient pas).
  for (const s of listees) {
    if (!(s in fichiers)) defauts.push(`${s} : listée, introuvable — « node --test » sortirait en 1 et retiendrait tout déploiement`);
    else if (!garde(s) && s !== CE_BANC) {
      const indice = nommeesSeules.has(s) ? ` (elle nomme ${nommeesSeules.get(s).join(", ")} : en écrire la lecture en readFileSync("…"))` : "";
      defauts.push(`${s} : listée, n'importe aucun module emporté ni ne lit le code d'une fonction — elle ne garde rien ici${indice}`);
    }
  }
  if (!listees.has(CE_BANC)) defauts.push(`${CE_BANC} : absent de l'étape — la liste ne se vérifie plus avant « Déployer », seulement dans la CI qui tourne en parallèle`);
  // Les écarts : une raison, et un objet.
  for (const [cible, raison] of Object.entries(ecarts)) {
    if (typeof raison !== "string" || raison.trim().length < RAISON_MIN) defauts.push(`écart ${cible} : sans raison (${RAISON_MIN} caractères au moins)`);
    if (cible.startsWith(SUITES + "/")) {
      if (!(cible in fichiers)) defauts.push(`écart ${cible} : sans objet — la suite n'existe pas`);
      else if (!garde(cible) && !aveugles.has(cible) && !nommeesSeules.has(cible)) defauts.push(`écart ${cible} : sans objet — elle n'importe aucun module emporté ni ne lit le code d'une fonction`);
      else if (listees.has(cible)) defauts.push(`écart ${cible} : sans objet — elle est listée`);
    } else if (ENTREES.has(cible)) {
      if (executee(cible)) defauts.push(`écart ${cible} : sans objet — une suite listée l'exécute`);
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
  // ⑨ chaque fonction est exécutée avant « Déployer » — relire son code ne suffit pas :
  // `uid`, jamais déclaré, passait toutes les relectures de notify-call (#753).
  for (const e of entrees) {
    if (executee(e) || e in ecarts) continue;
    defauts.push(`${e} : aucune suite listée ne l'exécute — une variable jamais déclarée dans son gestionnaire partirait en production (#753) : lui écrire son banc (tests/unit/lib/executer-fonction.mjs), ou déclarer l'écart avec sa raison`);
  }
  return { defauts, emportes, importsDe, lecturesDe, executionsDe, nommeesSeules, listees, version: etape.version, reference: ref, verrous: etape.verrous };
}

const REEL = depot();
const AUDIT = auditer(REEL);
const S = (nom) => SHARED + nom;
const INDEX_PILOTAGE = FONCTIONS + "/pilotage/index.ts";
const INDEX_NOTIFY = FONCTIONS + "/notify-call/index.ts";
const NOTIFY_CHEMINS = SUITES + "/notify-call-chemins.test.mjs";

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
  // …et par une aide de tests/unit/lib : la purge n'arrive ici que par faux-admin-purge.mjs.
  assert.ok(!REEL.fichiers[SUITES + "/suppression-entrelacement.test.mjs"].includes("_shared/purge-compte.js"), "prémisse : pas d'import direct");
  assert.ok(AUDIT.importsDe.get(SUITES + "/suppression-entrelacement.test.mjs").includes(S("purge-compte.js")));
  // Ce banc n'importe aucun module : ses textes de mutation sont des chaînes.
  assert.equal(AUDIT.importsDe.has(CE_BANC), false);
  // …et ne lit le code d'aucune fonction (ses chemins se composent) ; il n'en nomme plus
  // aucun : l'écart ⑨ de pilotage, dont la clé portait le chemin, est levé (2026-11-12).
  assert.equal(AUDIT.lecturesDe.has(CE_BANC), false);
  assert.equal(AUDIT.nommeesSeules.has(CE_BANC), false);
  // Les LECTURES du code des fonctions (2026-11-09) : le banc qui exécute notify-call,
  // les deux gestionnaires relus par connexion-recente, et la forme
  // `(await import("node:fs")).readFileSync(…)` de plafond.test.mjs.
  assert.deepEqual(AUDIT.lecturesDe.get(NOTIFY_CHEMINS), [INDEX_NOTIFY]);
  assert.deepEqual(AUDIT.lecturesDe.get(SUITES + "/connexion-recente.test.mjs"), [FONCTIONS + "/delete-account/index.ts", FONCTIONS + "/export-account/index.ts"]);
  assert.deepEqual(AUDIT.lecturesDe.get(SUITES + "/plafond.test.mjs"), [INDEX_PILOTAGE]);
  // Une lecture par une aide locale (`lire("…")`) ne se voit pas : le chemin, nommé, se dit.
  assert.deepEqual(AUDIT.nommeesSeules.get(SUITES + "/battement.test.mjs"), [INDEX_PILOTAGE]);
  // ⑨ EXÉCUTER, ce n'est pas relire : appels.test.mjs relit notify-call, notify-call-chemins
  // l'exécute (son propre chargeur) ; les quatre autres bancs, par l'aide lib/executer-fonction.mjs.
  assert.ok(AUDIT.lecturesDe.get(SUITES + "/appels.test.mjs").includes(INDEX_NOTIFY) && !AUDIT.executionsDe.has(SUITES + "/appels.test.mjs"));
  assert.deepEqual(AUDIT.executionsDe.get(NOTIFY_CHEMINS), [INDEX_NOTIFY]);
  for (const fn of ["ask-ai", "delete-account", "export-account", "pilotage"]) {
    assert.deepEqual(AUDIT.executionsDe.get(`${SUITES}/${fn}-chemins.test.mjs`), [`${FONCTIONS}/${fn}/index.ts`], fn);
  }
  assert.deepEqual([...new Set([...AUDIT.executionsDe.values()].flat())].sort(), fonctions.slice().sort(), "chaque fonction est exécutée par un banc : plus aucun écart ⑨");
  assert.ok(AUDIT.listees.has(CE_BANC), "ce banc tourne dans l'étape");
  assert.ok(AUDIT.listees.size >= 10 && AUDIT.verrous.length === 1, "prémisse : l'étape est lue");
  assert.equal(majeure(AUDIT.version), majeure(AUDIT.reference.version));
});

test("le lexeur : un import ne se lit que dans le CODE — accents, commentaires de bloc, chaînes, gabarits, expressions régulières", () => {
  const lit = (src) => imports(src).specs;
  assert.deepEqual(lit('import { a as vérifier } from "./m.js";'), ["./m.js"]);
  assert.deepEqual(lit('import {\n  règle, // la règle\n  /* une autre */ autre,\n} from "./m.js";'), ["./m.js"]);
  assert.deepEqual(lit('/* x */ import a from "./m.js";'), ["./m.js"]);
  assert.deepEqual(lit('/*\nimport a from "./m.js";\n*/'), []);
  assert.deepEqual(lit('const t = `\nimport a from "./m.js";\n`;'), []);
  assert.deepEqual(lit("const s = \"import a from './m.js'\";"), []);
  assert.deepEqual(lit('const r = /import a from "x"/; import b from "./m.js";'), ["./m.js"]);
  assert.deepEqual(lit('const q = a / b; import c from "./m.js"; const d = e / f;'), ["./m.js"]);
  assert.deepEqual(lit('const u = `${await import("./m.js")}`;'), ["./m.js"]);
  assert.deepEqual(lit('export * as n from "./m.js"; export { x } from "./n.js"; export const y = 1;'), ["./m.js", "./n.js"]);
  assert.deepEqual(lit('import "./m.js"; import.meta.url; x.import("./faux.js");'), ["./m.js"]);
  assert.deepEqual(lit('import type { T } from "./t.ts"; import x = require("./r.js");'), ["./t.ts", "./r.js"]);
  // Les chemins qui se lisent encore : anti-cache, gabarit sans ${}, new URL, attributs d'import.
  assert.deepEqual(lit('await import("./m.js?t=" + Date.now());'), ["./m.js?t="]);
  assert.deepEqual(lit("await import(`./m.js`); await import(`./n.js?v=${v}`);"), ["./m.js", "./n.js?v="]);
  assert.deepEqual(lit('await import(new URL("./m.js", import.meta.url).href);'), ["./m.js"]);
  assert.deepEqual(lit('await import("./m.json", { with: { type: "json" } });'), ["./m.json"]);
  // …et ceux qui ne se lisent pas, comptés.
  assert.equal(imports('await import(dossier + "m.js"); require(nom); await import(`${d}m.js`);').calcules, 3);
  assert.equal(imports('import { a } from "./m.js";').calcules, 0);
  assert.equal(imports('const d = "../../supabase/functions/_shared/";').nomme, true);
  assert.equal(imports('// "../../supabase/functions/_shared/"').nomme, false, "un commentaire ne nomme rien");
});

test("le lexeur : une LECTURE de code ne se lit que dans le CODE, par un chemin écrit — littéral, new URL, path.join ; le reste est nommé, ou rien", () => {
  const lu = (src) => imports(src).lectures;
  const E = "supabase/functions/x/index.ts";   // une fonction qui n'existe pas : ce banc ne nomme aucune entrée réelle
  assert.deepEqual(lu(`const s = fs.readFileSync("${E}", "utf8");`), [{ v: E, base: "racine" }]);
  assert.deepEqual(lu(`const s = readFileSync(\`./${E}\`);`), [{ v: "./" + E, base: "racine" }]);
  assert.deepEqual(lu(`const s = fs.readFileSync(new URL("../../${E}", import.meta.url), "utf8");`), [{ v: "../../" + E, base: "fichier" }]);
  assert.deepEqual(lu(`const s = fs.readFileSync(path.join(RACINE, "${E}"), "utf8");`), [{ v: E, base: "racine" }]);
  assert.deepEqual(lu(`const s = await fsp.readFile(resolve(racine, "${E}"));`), [{ v: E, base: "racine" }]);
  assert.deepEqual(lu(`const s = (await import("node:fs")).readFileSync("${E}", "utf8");`), [{ v: E, base: "racine" }]);
  // Ce qui ne se lit pas : un chemin calculé, une lecture citée en commentaire, en chaîne ou en gabarit, une déclaration.
  assert.deepEqual(lu('fs.readFileSync(chemin, "utf8"); fs.readFileSync(D + "/index.ts"); fs.readFileSync(path.join(R, "a", "index.ts"));'), []);
  assert.deepEqual(lu(`// fs.readFileSync("${E}")\n/* readFileSync("${E}") */\nconst c = 'fs.readFileSync("${E}")';\nconst g = \`readFileSync("${E}")\`;`), []);
  assert.deepEqual(lu("function readFileSync(p) { return p; }"), []);
  // Nommés : les chaînes du code qui désignent un index.ts — pas un message, pas un commentaire.
  assert.deepEqual(imports(`charger("${E}"); const m = "x/index.ts : introuvable"; // "${E}"`).noms, [E]);
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
// Les textes de mutation sont des chaînes : le lexeur ne les lit pas comme des
// imports de ce banc. Le premier lecteur, ligne à ligne, s'y laissait prendre
// (il y voyait « ./neuf.js » et quatre import() calculés) ; l'assemblage de
// VERS_SHARED en garde la trace, il ne coûte rien.
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
    for (const s of l.split(" ").slice(2)) {
      rougit(avec({ workflow: sans }), s === CE_BANC
        ? new RegExp("^" + echapper(CE_BANC) + " : absent de l'étape")
        : new RegExp("^" + echapper(s) + " : (?:importe|lit) .* ne tourne pas avant « Déployer »"));
    }
  }
});

test("⑦ un import _shared sans suite rougit : dans une fonction, sur plusieurs lignes, accentué, derrière un commentaire de bloc, dans un module emporté, en import() ; listée, sa suite remet au vert", () => {
  const ancre = 'import { REVISION } from "../_shared/revision.js";\n';
  const neuf = { [S("neuf.js")]: "export const neuf = 1;\n" };
  const motif = /^supabase\/functions\/_shared\/neuf\.js : emporté par pilotage, aucune suite listée ne l'importe — aucune suite ne l'importe$/;
  const index = (ligne) => muter(REEL.fichiers[INDEX_PILOTAGE], ancre, ancre + ligne);
  const direct = index('import { neuf } from "../_shared/neuf.js";\n');
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: direct } }), motif);
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: index('import {\n  neuf, // le geste neuf\n} from "../_shared/neuf.js";\n') } }), motif);
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: index('import { neuf as règleNeuve } from "../_shared/neuf.js";\n') } }), motif);
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: index('/* le geste neuf */ import { neuf } from "../_shared/neuf.js";\n') } }), motif);
  rougit(avec({ fichiers: { ...neuf, [S("parcours.js")]: 'import { neuf } from "./neuf.js";\n' + REEL.fichiers[S("parcours.js")] } }), motif);
  rougit(avec({ fichiers: { ...neuf, [S("battement.js")]: REEL.fichiers[S("battement.js")] + 'export const charger = () => import("./neuf.js");\n' } }), motif);
  // Hors de _shared, ⓪ ne dit rien : seul ① voit le module local, s'il lit l'import.
  rougit(avec({ fichiers: { [FONCTIONS + "/pilotage/regles.js"]: "export const règle = 1;\n", [INDEX_PILOTAGE]: index('import { règle } from "./regles.js";\n') } }),
    /^supabase\/functions\/pilotage\/regles\.js : emporté par pilotage, aucune suite listée ne l'importe/);
  // Un import cité dans un bloc de commentaire ou un gabarit d'une suite LISTÉE ne couvre rien.
  const B = SUITES + "/battement.test.mjs";
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: direct, [B]: REEL.fichiers[B] + `/*\nimport { neuf } from "${VERS_SHARED}neuf.js";\n*/\n` } }), motif);
  rougit(avec({ fichiers: { ...neuf, [INDEX_PILOTAGE]: direct, [B]: REEL.fichiers[B] + "const exemple = `\nimport { neuf } from \"" + VERS_SHARED + "neuf.js\";\n`;\n" } }), motif);
  // Ce qu'on ne sait pas suivre se dit : un chemin calculé, un fichier absent.
  rougit(avec({ fichiers: { [S("battement.js")]: REEL.fichiers[S("battement.js")] + 'export const charger = (n) => import("./" + n + ".js");\n' } }),
    /^supabase\/functions\/_shared\/battement\.js : import\(\) ou require\(\) au chemin calculé — ce qu'emporte pilotage devient incalculable$/);
  rougit(avec({ fichiers: { [INDEX_PILOTAGE]: muter(REEL.fichiers[INDEX_PILOTAGE], ancre, ancre + 'import { x } from "../_shared/absent.js";\n') } }),
    /^supabase\/functions\/pilotage\/index\.ts : importe « \.\.\/_shared\/absent\.js », introuvable$/);
  // Le remède : la suite du module neuf, listée.
  const remede = avec({
    workflow: muter(REEL.workflow, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + "node --test tests/unit/neuf.test.mjs\n"),
    fichiers: { ...neuf, [INDEX_PILOTAGE]: direct, [SUITES + "/neuf.test.mjs"]: `import { neuf } from "${VERS_SHARED}neuf.js";\n` },
  });
  assert.deepEqual(auditer(remede).defauts, []);
});

test("⑦ une suite neuve qui importe un module emporté rougit tant qu'elle n'est pas listée — quelle que soit la forme de l'import ; un import cité en commentaire ou en gabarit ne compte pas", () => {
  const neuve = SUITES + "/neuve.test.mjs";
  const motif = /^tests\/unit\/neuve\.test\.mjs : importe supabase\/functions\/_shared\/plafond\.js \(emportés\) et ne tourne pas avant « Déployer »/;
  const P = VERS_SHARED + "plafond.js";
  for (const src of [
    `import { verdictDepuisComptes } from "${P}";\n`,
    `import { verdictDepuisComptes as vérifier } from "${P}";\n`,
    `/* le plafond */ import { verdictDepuisComptes } from "${P}";\n`,
    `const { verdictDepuisComptes } = require("${P}");\n`,
    `const m = await import("${P}");\n`,
    `const m = await import("${P}?t=" + Date.now());\n`,
    "const m = await import(`" + P + "`);\n",
    "const m = await import(`" + P + "?t=${Date.now()}`);\n",
    `const m = await import(new URL("${P}", import.meta.url));\n`,
  ]) rougit(avec({ fichiers: { [neuve]: src } }), motif);
  // Par une aide de tests/unit/lib : l'aide fait partie du test.
  const aide = SUITES + "/lib/aide-neuve.mjs";
  rougit(avec({ fichiers: { [aide]: `export { verdictDepuisComptes } from "../${P}";\n`, [neuve]: 'import { verdictDepuisComptes } from "./lib/aide-neuve.mjs";\n' } }), motif);
  // Un chemin calculé, là où un module des fonctions est nommé : le banc ne peut dire lequel.
  const calcule = `const V = "${VERS_SHARED}";\nconst m = await import(V + "plafond.js");\n`;
  rougit(avec({ fichiers: { [neuve]: calcule } }), /^tests\/unit\/neuve\.test\.mjs : charge un module par un chemin calculé \(import\(\)\/require\(\)\) et nomme supabase\/ ou _shared/);
  assert.deepEqual(auditer(avec({ fichiers: { [neuve]: calcule } }), { ...ECARTS, [neuve]: "charge un module de démonstration par un chemin calculé, sans rien éprouver des fonctions" }).defauts, []);
  // …et n'importe où ailleurs, rien : build-id.test.mjs charge `require(nom)`.
  assert.deepEqual(auditer(avec({ fichiers: { [neuve]: 'const m = require(nom);\n' } })).defauts, []);
  for (const cite of [`// import { verdictDepuisComptes } from "${P}";\n`, `/*\nimport { verdictDepuisComptes } from "${P}";\n*/\n`, "const t = `\nimport { verdictDepuisComptes } from \"" + P + "\";\n`;\n"]) {
    assert.deepEqual(auditer(avec({ fichiers: { [neuve]: cite } })).defauts, [], cite);
  }
  const listee = muter(REEL.workflow, LIGNE_PLAFOND, "node --test tests/unit/plafond.test.mjs tests/unit/neuve.test.mjs\n");
  assert.deepEqual(auditer(avec({ workflow: listee, fichiers: { [neuve]: `import { verdictDepuisComptes } from "${P}";\n` } })).defauts, []);
});

test("⑦ les écarts : retiré, il rougit ; sans objet, sans raison ou hors cible, aussi", () => {
  const sauf = (cle) => Object.fromEntries(Object.entries(ECARTS).filter(([k]) => k !== cle));
  const raison = "une raison écrite, assez longue pour passer le seuil du banc";
  rougit(REEL, /^supabase\/functions\/_shared\/revision\.js : emporté par .*, aucune suite listée ne l'importe — aucune suite ne l'importe$/, sauf(S("revision.js")));
  rougit(REEL, /^tests\/unit\/sentinelle-detecter\.test\.mjs : importe supabase\/functions\/_shared\/autonomie\.js/, sauf(SUITES + "/sentinelle-detecter.test.mjs"));
  const listee = muter(REEL.workflow, LIGNE_PLAFOND, "node --test tests/unit/plafond.test.mjs tests/unit/sentinelle-detecter.test.mjs\n");
  rougit(avec({ workflow: listee }), /^écart tests\/unit\/sentinelle-detecter\.test\.mjs : sans objet — elle est listée$/);
  rougit(REEL, /^écart tests\/unit\/fantome\.test\.mjs : sans objet — la suite n'existe pas$/, { ...ECARTS, [SUITES + "/fantome.test.mjs"]: raison });
  rougit(REEL, /^écart tests\/unit\/bornes-ci\.test\.mjs : sans objet — elle n'importe aucun module emporté ni ne lit le code d'une fonction$/, { ...ECARTS, [SUITES + "/bornes-ci.test.mjs"]: raison });
  rougit(REEL, /^écart supabase\/functions\/_shared\/plafond\.js : sans objet — une suite listée l'importe$/, { ...ECARTS, [S("plafond.js")]: raison });
  rougit(REEL, /^écart supabase\/functions\/notify-call\/index\.ts : sans objet — une suite listée l'exécute$/, { ...ECARTS, [INDEX_NOTIFY]: raison });
  const aide = FONCTIONS + "/pilotage/aide.ts";
  rougit(avec({ fichiers: { [aide]: "export const a = 1;\n" } }), /^écart supabase\/functions\/pilotage\/aide\.ts : sans objet — ce n'est pas un module$/, { ...ECARTS, [aide]: raison });
  rougit(REEL, /^écart tests\/unit\/sentinelle-detecter\.test\.mjs : sans raison/, { ...ECARTS, [SUITES + "/sentinelle-detecter.test.mjs"]: "parce que" });
  rougit(REEL, /^écart docs\/x\.md : ni une suite de tests\/unit, ni un fichier de supabase\/functions$/, { ...ECARTS, "docs/x.md": raison });
});

test("⑦ ④ ce qui contourne l'étape sans y toucher : une fonction d'état sur un déploiement, un second déploiement, defaults:, env: NODE_*, $GITHUB_ENV", () => {
  const W = REEL.workflow;
  const NOM = "      - name: Verrous unitaires des modules partagés\n";
  const DEP = "      - name: Déployer\n";
  const JOB = "    timeout-minutes: 15\n";
  const etat = /— une fonction d'état retire le success\(\) implicite : le déploiement partirait derrière un verrou rouge$/;
  rougit(avec({ workflow: muter(W, DEP, DEP + "        if: always()\n") }), new RegExp("^« Déployer » : if: always\\(\\) " + etat.source));
  rougit(avec({ workflow: muter(W, DEP, DEP + "        if: success() || github.event_name == 'workflow_dispatch'\n") }), new RegExp("^« Déployer » : if: success\\(\\) \\|\\| github\\.event_name == 'workflow_dispatch' " + etat.source));
  rougit(avec({ workflow: muter(W, DEP, DEP + "        if: ${{ !cancelled() }}\n") }), etat);
  // Un « nouvel essai » qui ne part QUE sur un échec : précisément derrière un verrou rouge.
  const FUMEE = "      - name: Test de fumée (CORS, porte d'authentification)\n";
  const essai = [
    "      - name: Déployer — nouvel essai",
    "        if: failure()",
    "        run: |",
    '          supabase functions deploy pilotage --project-ref "$PROJECT_REF" --yes',
    "",
  ].join("\n") + "\n";
  rougit(avec({ workflow: muter(W, FUMEE, essai + FUMEE) }), new RegExp("^« Déployer — nouvel essai » : if: failure\\(\\) " + etat.source));
  // Un `if:` sans fonction d'état garde le success() implicite : il ne passe outre rien.
  assert.deepEqual(auditer(avec({ workflow: muter(W, DEP, DEP + "        if: github.repository == 'PASSIO74/passio-app'\n") })).defauts, []);
  // Le shell par défaut, posé plus haut que l'étape : sans -e, une suite rouge en tête passe (⑥).
  rougit(avec({ workflow: muter(W, JOB, JOB + "    defaults:\n      run:\n        shell: bash {0}\n") }), /^« Verrous unitaires des modules partagés » : shell: bash \{0\} \(defaults du job\)/);
  rougit(avec({ workflow: muter(W, "\njobs:\n", "\ndefaults:\n  run:\n    shell: bash {0}\n\njobs:\n") }), /^« Verrous unitaires des modules partagés » : shell: bash \{0\} \(defaults du workflow\)/);
  assert.deepEqual(auditer(avec({ workflow: muter(W, JOB, JOB + "    defaults:\n      run:\n        shell: bash\n") })).defauts, [], "« bash » nommé : -eo pipefail");
  // Les options que `node --test` lit dans l'environnement, à chaque niveau.
  rougit(avec({ workflow: muter(W, NOM, NOM + "        env:\n          NODE_OPTIONS: --test-skip-pattern=.\n") }), /^« Verrous unitaires des modules partagés » : NODE_OPTIONS dans son env/);
  rougit(avec({ workflow: muter(W, NOM, NOM + "        env: { NODE_OPTIONS: --test-only }\n") }), /^« Verrous unitaires des modules partagés » : NODE_OPTIONS dans son env/);
  rougit(avec({ workflow: muter(W, JOB, JOB + "    env:\n      NODE_OPTIONS: --test-only\n") }), /^NODE_OPTIONS dans l'env du job/);
  rougit(avec({ workflow: muter(W, "\nenv:\n", "\nenv:\n  NODE_OPTIONS: --test-only\n") }), /^NODE_OPTIONS dans l'env du workflow/);
  // …ou qu'une étape d'avant pose pour elles.
  rougit(avec({ workflow: muter(W, NOM, '      - name: Préparer\n        run: echo "NODE_OPTIONS=--test-only" >> "$GITHUB_ENV"\n\n' + NOM) }), /^« Préparer » : écrit dans \$GITHUB_ENV ou \$GITHUB_PATH avant les verrous/);
});

test("⑦ ④ la forme de l'étape : après « Déployer », || true, motif, filtre, set +e, continue-on-error, if, shell", () => {
  const W = REEL.workflow;
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, "node --test tests/unit/plafond.test.mjs || true\n") }), /ligne non reconnue « node --test tests\/unit\/plafond\.test\.mjs \|\| true »/);
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, 'node --test "tests/unit/*.test.mjs"\n') }), /ligne non reconnue « node --test "tests\/unit\/\*\.test\.mjs" »/);
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, "node --test --test-name-pattern=① tests/unit/plafond.test.mjs\n") }), /ligne non reconnue « node --test --test-name-pattern/);
  rougit(avec({ workflow: muter(W, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + "set +e\n") }), /ligne non reconnue « set \+e »/);
  const NOM = "      - name: Verrous unitaires des modules partagés\n";
  rougit(avec({ workflow: muter(W, NOM, NOM + "        continue-on-error: true\n") }), /^« Verrous unitaires des modules partagés » : continue-on-error/);
  rougit(avec({ workflow: muter(W, NOM, NOM + "        if: github.event_name == 'workflow_dispatch'\n") }), /^« Verrous unitaires des modules partagés » : if: .* un verrou conditionnel/);
  rougit(avec({ workflow: muter(W, NOM, NOM + "        shell: bash {0}\n") }), /^« Verrous unitaires des modules partagés » : shell: bash \{0\} — /);
  // L'étape déplacée APRÈS « Déployer » : ses suites ne retiennent plus rien.
  const debut = W.indexOf(NOM);
  const fin = W.search(/^      - uses: supabase\/setup-cli@/m);   // épinglée par SHA (#780) : lue, jamais recopiée
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

test("⑦ ② ③ le banc qui EXÉCUTE notify-call : retiré de l'étape, il rougit ; listé sans lire le code d'une fonction, il rougit encore — le remède est une lecture écrite", () => {
  const src = REEL.fichiers[NOTIFY_CHEMINS];
  assert.equal(AUDIT.importsDe.has(NOTIFY_CHEMINS), false, "prémisse : il n'importe aucun module emporté — seule sa lecture le garde");
  assert.ok(AUDIT.listees.has(NOTIFY_CHEMINS), "prémisse : il tourne dans l'étape");
  // Retiré de l'étape : il rougit, en nommant le code qu'il lit.
  const sans = muter(REEL.workflow, "\n" + INDENT + "node --test " + NOTIFY_CHEMINS + "\n", "\n");
  const absent = new RegExp("^" + echapper(NOTIFY_CHEMINS) + " : lit " + echapper(INDEX_NOTIFY) + " \\(le code d'une fonction déployée\\) et ne tourne pas avant « Déployer »");
  rougit(avec({ workflow: sans }), absent);
  // Listé, sans lire le code d'une fonction : il ne garde rien.
  const LECTURE = 'fs.readFileSync("' + INDEX_NOTIFY + '", "utf8")';
  const rien = new RegExp("^" + echapper(NOTIFY_CHEMINS) + " : listée, n'importe aucun module emporté ni ne lit le code d'une fonction — elle ne garde rien ici");
  const lisant = (lecture, avant = "") => avec({ fichiers: { [NOTIFY_CHEMINS]: avant + muter(src, LECTURE, lecture) } });
  for (const autre of [
    '"Deno.serve(async () => new Response(null));"',                                 // une source écrite à la main
    'fs.readFileSync("' + S("appels.js") + '", "utf8")',                              // un module partagé, lu comme du texte
    'fs.readFileSync("' + FONCTIONS + '/fantome/index.ts", "utf8")',                 // une fonction qui n'existe pas
    'fs.readFileSync(["supabase", "functions", "notify-call", "index.ts"].join("/"), "utf8")',   // un chemin calculé
    '"" /* fs.readFileSync("' + INDEX_NOTIFY + '", "utf8") */',                       // une lecture citée en commentaire
  ]) rougit(lisant(autre), rien);
  // Le chemin dans une constante : nommé, pas lu. Listé, le message dit quoi écrire ; retiré, ②' le dit.
  const constante = lisant('fs.readFileSync(CHEMIN, "utf8")', 'const CHEMIN = "' + INDEX_NOTIFY + '";\n');
  rougit(constante, new RegExp(rien.source + " \\(elle nomme " + echapper(INDEX_NOTIFY) + " : en écrire la lecture"));
  rougit({ ...constante, workflow: sans }, new RegExp("^" + echapper(NOTIFY_CHEMINS) + " : nomme " + echapper(INDEX_NOTIFY) + " sans que le banc en voie la lecture"));
  // Le remède, sous chaque forme écrite — et par une aide de tests/unit/lib, que le banc suit.
  for (const forme of [
    'fs.readFileSync(new URL("../../' + INDEX_NOTIFY + '", import.meta.url), "utf8")',
    'fs.readFileSync(path.join(RACINE, "' + INDEX_NOTIFY + '"), "utf8")',
  ]) assert.deepEqual(auditer(lisant(forme)).defauts, [], forme);
  const aide = SUITES + "/lib/source-notify.mjs";
  const parAide = {
    [aide]: 'import fs from "node:fs";\nexport const SOURCE = ' + LECTURE + ";\n",
    [NOTIFY_CHEMINS]: 'import { SOURCE } from "./lib/source-notify.mjs";\n' + muter(src, "const SOURCE = " + LECTURE + ";\n", ""),
  };
  assert.deepEqual(auditer(avec({ fichiers: parAide })).defauts, []);
  rougit(avec({ workflow: sans, fichiers: parAide }), absent);
});

test("⑦ ⑨ chaque fonction est EXÉCUTÉE avant « Déployer » : un banc retiré, un banc qui ne fait plus que relire, une fonction neuve sans banc, le banc de pilotage retiré, un écart redéclaré pour une fonction exécutée — chacun rougit", () => {
  const ASK = FONCTIONS + "/ask-ai/index.ts";
  const nonExecutee = (e) => new RegExp("^" + echapper(e) + " : aucune suite listée ne l'exécute — une variable jamais déclarée");
  const bancDe = (cible) => 'import fs from "node:fs";\nimport { chargerFonction } from "./lib/executer-fonction.mjs";\n'
    + 'const SOURCE = fs.readFileSync("' + cible + '", "utf8");\nawait chargerFonction(SOURCE, { modules: {}, env: () => undefined });\n';
  const listant = (suite) => muter(REEL.workflow, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + "node --test " + suite + "\n");
  // Le banc d'ask-ai retiré de l'étape : ② le nomme, ⑨ dit ce qui n'est plus exécuté.
  rougit(avec({ workflow: muter(REEL.workflow, "\n" + INDENT + "node --test " + SUITES + "/ask-ai-chemins.test.mjs\n", "\n") }), nonExecutee(ASK));
  // notify-call, relu par trois suites listées, n'est exécuté que par une : qu'elle cesse de charger, il rougit.
  const relue = REEL.fichiers[NOTIFY_CHEMINS].split("stripTypeScriptTypes").join("retirerLesTypes");
  rougit(avec({ fichiers: { [NOTIFY_CHEMINS]: relue } }), nonExecutee(INDEX_NOTIFY));
  // …de même par l'aide partagée : les trois bancs qui la chargent cessent d'exécuter.
  const AIDE = SUITES + "/lib/executer-fonction.mjs";
  const d = rougit(avec({ fichiers: { [AIDE]: REEL.fichiers[AIDE].split("stripTypeScriptTypes").join("retirerLesTypes") } }), nonExecutee(ASK));
  for (const fn of ["delete-account", "export-account"]) assert.ok(d.some((x) => nonExecutee(FONCTIONS + "/" + fn + "/index.ts").test(x)), fn);
  // Une fonction neuve, sans banc : elle rougit ; son banc, listé, la remet au vert.
  const NEUVE = FONCTIONS + "/neuve/index.ts";
  const neuve = { [NEUVE]: 'import { REVISION } from "../_shared/revision.js";\nDeno.serve(() => new Response(REVISION));\n' };
  rougit(avec({ fichiers: neuve }), nonExecutee(NEUVE));
  const bancNeuf = SUITES + "/neuve-chemins.test.mjs";
  assert.deepEqual(auditer(avec({ workflow: listant(bancNeuf), fichiers: { ...neuve, [bancNeuf]: bancDe(NEUVE) } })).defauts, []);
  // pilotage a son banc depuis le 2026-11-12 : retiré de l'étape, pilotage rougit comme les autres ;
  // et un écart redéclaré pour une fonction qu'un banc exécute rougit — sans objet.
  const bancPilotage = SUITES + "/pilotage-chemins.test.mjs";
  rougit(avec({ workflow: muter(REEL.workflow, "\n" + INDENT + "node --test " + bancPilotage + "\n", "\n") }), nonExecutee(INDEX_PILOTAGE));
  rougit(REEL, /^écart supabase\/functions\/pilotage\/index\.ts : sans objet — une suite listée l'exécute$/,
    { ...ECARTS, [INDEX_PILOTAGE]: "une raison écrite, assez longue pour passer le seuil du banc" });
});

test("⑦ ② une suite NEUVE qui lit le code d'une fonction rougit tant qu'elle n'est pas listée ; nommé par une aide qui reçoit le chemin, ②' le dit", () => {
  const neuve = SUITES + "/neuve.test.mjs";
  const ASK = FONCTIONS + "/ask-ai/index.ts";
  const avecNeuve = (w) => muter(w, LIGNE_PLAFOND, LIGNE_PLAFOND + INDENT + "node --test " + neuve + "\n");
  const lit = { [neuve]: 'import fs from "node:fs";\nconst SOURCE = fs.readFileSync("' + ASK + '", "utf8");\n' };
  rougit(avec({ fichiers: lit }), new RegExp("^" + echapper(neuve) + " : lit " + echapper(ASK) + " \\(le code d'une fonction déployée\\) et ne tourne pas avant « Déployer »"));
  assert.deepEqual(auditer(avec({ workflow: avecNeuve(REEL.workflow), fichiers: lit })).defauts, []);
  // Une aide qui lit le chemin qu'on lui passe : le banc ne voit qu'un nom.
  const nommee = {
    [SUITES + "/lib/charger.mjs"]: 'import fs from "node:fs";\nexport const charger = (c) => fs.readFileSync(c, "utf8");\n',
    [neuve]: 'import { charger } from "./lib/charger.mjs";\nconst SOURCE = charger("' + ASK + '");\n',
  };
  rougit(avec({ fichiers: nommee }), new RegExp("^" + echapper(neuve) + " : nomme " + echapper(ASK) + " sans que le banc en voie la lecture"));
  rougit(avec({ workflow: avecNeuve(REEL.workflow), fichiers: nommee }), new RegExp("^" + echapper(neuve) + " : listée, n'importe aucun module emporté ni ne lit le code d'une fonction — elle ne garde rien ici \\(elle nomme " + echapper(ASK)));
  assert.deepEqual(auditer(avec({ fichiers: nommee }), { ...ECARTS, [neuve]: "une raison écrite, assez longue pour passer le seuil du banc" }).defauts, []);
});

test("⑦ ⓪ un fichier de _shared qu'aucune fonction n'emporte rougit — et c'est ce qui trahirait un import mal lu", () => {
  rougit(avec({ fichiers: { [S("orphelin.js")]: "export const orphelin = 1;\n" } }), /^supabase\/functions\/_shared\/orphelin\.js : aucune fonction ne l'emporte/);
  // Un lecteur qui raterait les imports de pilotage.js (celui de dix lignes, et
  // celui d'une ligne venu avec le second facteur) ne le perdrait pas en silence.
  const IMPORT_PILOTAGE = /^import \{[^}]*\} from "\.\.\/_shared\/pilotage\.js";$/gm;
  assert.ok((REEL.fichiers[INDEX_PILOTAGE].match(IMPORT_PILOTAGE) || []).length >= 1);
  const aveugle = REEL.fichiers[INDEX_PILOTAGE].replace(IMPORT_PILOTAGE, "");
  const importePilotage = (t) => imports(t).specs.some((s) => /(^|\/)pilotage\.js$/.test(s));
  assert.equal(importePilotage(aveugle), false, "prémisse : plus aucun import de pilotage.js");
  assert.ok(Object.entries(REEL.fichiers).every(([f, t]) => f === INDEX_PILOTAGE || !f.startsWith(FONCTIONS + "/") || !importePilotage(t)), "prémisse : index.ts est son seul importeur");
  rougit(avec({ fichiers: { [INDEX_PILOTAGE]: aveugle } }), /^supabase\/functions\/_shared\/pilotage\.js : aucune fonction ne l'emporte/);
});

test("⑦ ⑤ Node : un autre majeur que deploy.yml rougit ; une installation absente, une référence disparue ou illisible aussi", () => {
  const ref = AUDIT.reference;
  const autre = String(Number(majeure(ref.version)) - 2);
  const ici = (v) => muter(REEL.workflow, `node-version: ${AUDIT.version}\n`, `node-version: ${v}\n`);
  rougit(avec({ workflow: ici(autre) }), new RegExp(`^Node ${autre} avant les verrous, Node ${ref.version} dans deploy\\.yml \\(job ${ref.job}\\)`));
  // Les actions sont épinglées par SHA (#780) : les lignes se lisent dans le texte réel, jamais recopiées.
  const SETUP_ICI = /^        uses: actions\/setup-node@[^\n]*\n/m.exec(REEL.workflow)[0];
  rougit(avec({ workflow: muter(REEL.workflow, SETUP_ICI, "        uses: actions/cache@v4\n") }), /^aucune installation de Node \(actions\/setup-node\) avant les verrous$/);
  rougit(avec({ reference: muter(REEL.reference, 'run: node --test "tests/unit/*.test.mjs"\n', "run: echo rien\n") }), /^deploy\.yml : aucun job n'y lance tests\/unit\/\*\.test\.mjs/);
  // Une référence qu'on ne lit plus ne vaut pas accord : ici repassé sous un autre Node, elle rougit encore.
  const INSTALLE = new RegExp(`      - uses: actions/setup-node@[^\\n]*\\n        with:\\n          node-version: ${ref.version}\\n\\n      - name: Audits statiques \\(collisions de globals\\)`).exec(REEL.reference)[0];
  const illisible = new RegExp(`^\\.github\\/workflows\\/deploy\\.yml \\(job ${ref.job}\\) : aucune version de Node lisible avant tests\\/unit\\/\\*\\.test\\.mjs`);
  rougit(avec({ workflow: ici(autre), reference: muter(REEL.reference, INSTALLE, "      - name: Audits statiques (collisions de globals)") }), illisible);
  rougit(avec({ workflow: ici(autre), reference: muter(REEL.reference, INSTALLE, INSTALLE.replace(`node-version: ${ref.version}`, "node-version-file: .nvmrc")) }), illisible);
});

test("⑧ npm run verif porte ce banc", () => {
  const pkg = JSON.parse(lire("package.json"));
  assert.match(pkg.scripts.verif, /node --test tests\/unit\/edge-functions-verrous\.test\.mjs/);
});
