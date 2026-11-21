// ═══════════════════════════════════════════════════════════════════════════
// LE LECTEUR D'IMPORTS — ce qu'un fichier JavaScript ou TypeScript importe,
// lu dans son CODE (2026-11-07 ; sorti du banc des verrous le 2026-11-21).
//
// UN lecteur, DEUX emplois, pour qu'ils ne puissent pas diverger :
//   · tests/unit/edge-functions-verrous.test.mjs — la clôture des imports de
//     chaque `supabase/functions/<nom>/index.ts` dit quelles suites doivent
//     tourner avant « Déployer » ;
//   · scripts/fonctions-a-deployer.mjs — la même clôture dit quelles fonctions
//     un changement concerne : celles-là seules sont vérifiées et déployées.
// Un lecteur plus faible du côté de la sélection laisserait une fonction servir
// un module périmé, sans rien dire. Le banc ⑪ compare les deux clôtures.
// ═══════════════════════════════════════════════════════════════════════════
import path from "node:path";

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
export function imports(src) {
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
export function resoudre(depuis, spec) {
  if (!/^\.\.?\//.test(spec)) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(depuis), spec.split(/[?#]/)[0]));
}

// ── Ce que chaque fonction emporte ──────────────────────────────────────────
const ENTREE_FONCTION = /^supabase\/functions\/([^/_][^/]*)\/index\.(?:ts|js)$/;

/**
 * La clôture des imports relatifs de chaque `supabase/functions/<nom>/index.ts` :
 * ce que la CLI met dans le bundle de la fonction. `fichiers` : { chemin relatif à
 * la racine du dépôt → source }.
 * Rend `parFonction` (nom → chemins triés, entrée comprise) et `incertaines`
 * (nom → raisons) : un import au chemin calculé ou une cible introuvable rendent
 * la clôture INCALCULABLE — ce n'est jamais lu comme « rien d'autre n'est emporté ».
 */
export function clotureFonctions(fichiers) {
  const parFonction = new Map();
  const incertaines = new Map();
  for (const entree of Object.keys(fichiers).sort()) {
    const m = ENTREE_FONCTION.exec(entree);
    if (!m) continue;
    const nom = m[1];
    const vus = new Set();
    const raisons = [];
    for (const pile = [entree]; pile.length;) {
      const f = pile.pop();
      if (vus.has(f)) continue;
      vus.add(f);
      const { specs, calcules } = imports(fichiers[f]);
      if (calcules > 0) raisons.push(`${f} : import() ou require() au chemin calculé`);
      for (const spec of specs) {
        const cible = resoudre(f, spec);
        if (cible === null) continue;
        if (!(cible in fichiers)) { raisons.push(`${f} : importe « ${spec} », introuvable`); continue; }
        pile.push(cible);
      }
    }
    parFonction.set(nom, [...vus].sort());
    if (raisons.length) incertaines.set(nom, raisons);
  }
  return { parFonction, incertaines };
}
