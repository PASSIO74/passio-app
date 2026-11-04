// ═══════════════════════════════════════════════════════════════════════════
// ÉVALUATEUR MINIMAL DES EXPRESSIONS GITHUB ACTIONS, POUR REJOUER UN `if:` RÉEL.
//
// ⚠️ POURQUOI IL EXISTE. Le `if:` de .github/workflows/claude-code.yml décide seul
// si un événement lance un agent. Depuis `queue: max`, chaque événement éligible
// s'exécute au lieu d'être remplacé : une condition trop large ne coûte plus un
// agent de trop, elle en coûte un par événement. Or un événement `issues` ne se
// déclenche que depuis la branche par défaut : on ne peut pas éprouver ce `if:`
// avant sa fusion. On le rejoue donc ici sur le texte réel, et les règles de ce
// lecteur sont ancrées sur des verdicts rendus par GitHub lui-même (le banc de la
// fiche « LE CANAL NE PERD PLUS UN ORDRE », rejoué par sentinelle-workflows.test.mjs).
//
// Sous-ensemble couvert : `||`, `&&`, `==`, `!=`, `!`, parenthèses, chaînes simple
// quote, `true`/`false`/`null`, entiers, chemins pointés et `contains()`. Tout le
// reste LÈVE : une expression lue à moitié qui passe est pire qu'une erreur (même
// doctrine que yaml-mini.mjs). Sémantique : docs.github.com, « Evaluate expressions
// in workflows and actions » :
//   · `&&` et `||` rendent un de leurs opérandes, jamais un booléen forcé ;
//   · sont faux : false, 0, -0, "", '', null ; un objet est vrai ;
//   · deux chaînes se comparent sans tenir compte de la casse ;
//   · types différents : coercition en nombre (null → 0, booléen → 0/1, "" → 0,
//     autre chaîne → NaN si elle n'est pas numérique, objet → NaN) ;
//   · `contains(chaîne, x)` : sous-chaîne sans casse, null → "" ;
//     `contains(tableau, x)` : égalité d'un élément.
// ═══════════════════════════════════════════════════════════════════════════

function lexer(source) {
  const jetons = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    const deux = source.slice(i, i + 2);
    if (["&&", "||", "==", "!="].includes(deux)) { jetons.push({ t: deux }); i += 2; continue; }
    if (c === "(" || c === ")" || c === "," || c === "!") { jetons.push({ t: c }); i++; continue; }
    if (c === "'") {
      let j = i + 1, s = "";
      for (;;) {
        if (j >= source.length) throw new Error("chaîne non fermée : " + source.slice(i, i + 40));
        if (source[j] === "'") {
          if (source[j + 1] === "'") { s += "'"; j += 2; continue; }
          break;
        }
        s += source[j++];
      }
      jetons.push({ t: "valeur", v: s });
      i = j + 1;
      continue;
    }
    const m = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*/);
    if (m) { jetons.push({ t: "mot", v: m[0] }); i += m[0].length; continue; }
    const n = source.slice(i).match(/^\d+/);
    if (n) { jetons.push({ t: "valeur", v: Number(n[0]) }); i += n[0].length; continue; }
    throw new Error("caractère hors sous-ensemble : " + source.slice(i, i + 40));
  }
  return jetons;
}

const estVrai = (v) => !(v === false || v === null || v === undefined || v === 0 || v === "" || Number.isNaN(v));

function versNombre(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.trim() === "" ? 0 : Number(v);
  return NaN;
}

function egal(a, b) {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  const objet = (x) => x !== null && typeof x === "object";
  if (objet(a) || objet(b)) return a === b;
  return versNombre(a) === versNombre(b);
}

const versChaine = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? "" : String(v));

function contains(recherche, element) {
  if (Array.isArray(recherche)) return recherche.some((x) => egal(x, element));
  return versChaine(recherche).toLowerCase().includes(versChaine(element).toLowerCase());
}

/** Évalue `source` ; rend la VALEUR de l'expression, comme GitHub. `contexte` : { github: {...} }. */
export function evaluer(source, contexte) {
  const jetons = lexer(String(source));
  let p = 0;
  const voir = () => jetons[p];
  const prendre = (t) => {
    if (!voir() || voir().t !== t) throw new Error(`attendu « ${t} », lu « ${voir() ? voir().t : "fin"} »`);
    return jetons[p++];
  };
  const chemin = (texte) => {
    let v = contexte;
    for (const morceau of texte.split(".")) {
      if (v === null || v === undefined || typeof v !== "object") return null;
      v = v[morceau];
    }
    return v === undefined ? null : v;
  };
  function ou() {
    let v = et();
    while (voir() && voir().t === "||") { p++; const d = et(); v = estVrai(v) ? v : d; }
    return v;
  }
  function et() {
    let v = egalite();
    while (voir() && voir().t === "&&") { p++; const d = egalite(); v = estVrai(v) ? d : v; }
    return v;
  }
  function egalite() {
    let v = unaire();
    while (voir() && (voir().t === "==" || voir().t === "!=")) {
      const op = jetons[p++].t;
      const d = unaire();
      v = op === "==" ? egal(v, d) : !egal(v, d);
    }
    return v;
  }
  function unaire() {
    if (voir() && voir().t === "!") { p++; return !estVrai(unaire()); }
    return primaire();
  }
  function primaire() {
    const j = voir();
    if (!j) throw new Error("expression tronquée");
    if (j.t === "(") { p++; const v = ou(); prendre(")"); return v; }
    if (j.t === "valeur") { p++; return j.v; }
    if (j.t === "mot") {
      p++;
      if (j.v === "true") return true;
      if (j.v === "false") return false;
      if (j.v === "null") return null;
      if (voir() && voir().t === "(") {
        if (j.v !== "contains") throw new Error("fonction hors sous-ensemble : " + j.v);
        p++;
        const a = ou(); prendre(",");
        const b = ou(); prendre(")");
        return contains(a, b);
      }
      return chemin(j.v);
    }
    throw new Error("jeton inattendu : " + j.t);
  }
  const resultat = ou();
  if (p !== jetons.length) throw new Error("reste non lu : " + JSON.stringify(jetons[p]));
  return resultat;
}

/** Ce que décide un `if:` : la valeur de l'expression, ramenée à vrai/faux. */
export const decide = (source, contexte) => estVrai(evaluer(source, contexte));
