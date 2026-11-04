"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// JSON EXACT — lire et recopier un JSON sans arrondir ses nombres (revue R25,
// 2026-11-04).
//
// `JSON.parse` lit chaque nombre comme un flottant 64 bits. Au-delà de 2^53, un
// entier est ARRONDI : 2906581903110193585 devient 2906581903110193700. Un
// `numeric` à plus de 15 chiffres significatifs l'est aussi, et 1e400 devient
// Infinity, que `JSON.stringify` écrit `null`. La sauvegarde faisait `r.json()`
// puis `JSON.stringify`, donc l'archive portait une valeur que la base n'a
// jamais contenue. Deux valeurs distinctes pouvaient s'y confondre : à la
// restauration, c'est une collision sur une clé unique, que
// `on conflict do nothing` règle en JETANT une ligne. La vérification ne le
// voyait pas, puisqu'elle arrondissait les deux côtés de la même façon.
//
// DEUX OUTILS :
//   • `decouperLignes(page)` — l'export n'interprète plus ses lignes : il
//     découpe le tableau JSON que rend PostgREST en textes de lignes, par un
//     balayage LINÉAIRE (profondeur, chaînes, échappements), et les écrit tels
//     quels. Exact par construction : aucun nombre n'est relu par JavaScript.
//   • `lireJsonExact(texte)` — pour COMPARER (vérification de la reprise). Un
//     nombre que JavaScript lit en dénotant la même valeur décimale que son
//     texte reste un nombre (10.00, 1e-07, 0.1 : une archive d'avant ce
//     correctif se compare toujours à l'identique) ; un nombre que la lecture
//     changerait garde son texte source (`JSON.rawJSON`, que `JSON.stringify`
//     réécrit tel quel).
//
// ⚠️ PAS DE RÉCURSION SANS NÉCESSITÉ (contre-revue finale, 2026-11-04). Un
// `reviver` de `JSON.parse` est RÉCURSIF : il casse vers 2 836 niveaux
// d'imbrication (RangeError), là où `JSON.parse` seul en lit des dizaines de
// milliers. Or un compte écrit le jsonb qu'il veut dans SA ligne (`user_state`) :
// 6 Ko de crochets suffisaient à faire échouer la sauvegarde de chaque nuit.
// D'où le découpage linéaire à l'export, et, à la lecture, un balayage préalable
// des jetons numériques : sans nombre « à risque », `JSON.parse` est appelé SANS
// reviver.
// ⚠️ SANS `JSON.rawJSON` (Node < 21), un nombre à risque fait ÉCHOUER la
// lecture, quel qu'il soit : une lecture qui arrondit en silence ment.
//
// Verrous : tests/unit/restaurer-donnees.test.mjs (⑤ et suivants).
// ═══════════════════════════════════════════════════════════════════════════

const LITTERAL = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** Forme canonique d'un littéral numérique JSON : « [-]chiffres e exposant », sans zéro inutile. */
function canonique(texte) {
  const m = LITTERAL.exec(String(texte));
  if (!m) return null;
  const fraction = m[3] || "";
  let chiffres = (m[2] + fraction).replace(/^0+/, "");
  if (!chiffres) return "0";
  let exposant = Number(m[4] || 0) - fraction.length;
  const zeros = /0+$/.exec(chiffres);
  if (zeros) { exposant += zeros[0].length; chiffres = chiffres.slice(0, -zeros[0].length); }
  return (m[1] ? "-" : "") + chiffres + "e" + exposant;
}

/** Vrai si le nombre lu par JavaScript dénote exactement la valeur écrite dans la source. */
function memeValeur(source, valeur) {
  const a = canonique(source);
  return a !== null && a === canonique(String(valeur));
}

/** Un jeton numérique que JavaScript ne relirait pas à l'identique (précision, ou hors des flottants). */
function estRisque(jeton) {
  const v = Number(jeton);
  return !Number.isFinite(v) || !memeValeur(jeton, v);
}

const estBlanc = (c) => c === 32 || c === 10 || c === 13 || c === 9;

/** Saute une chaîne JSON qui commence à `i` (un guillemet) ; rend l'indice du guillemet fermant, ou -1. */
function finDeChaine(texte, i) {
  const n = texte.length;
  for (let j = i + 1; j < n; j++) {
    const c = texte.charCodeAt(j);
    if (c === 92) { j++; continue; }
    if (c === 34) return j;
  }
  return -1;
}

/** Les jetons numériques d'un texte JSON, hors chaînes — balayage linéaire, sans récursion. */
function jetonsNumeriques(texte) {
  const out = [];
  const n = texte.length;
  for (let i = 0; i < n; i++) {
    const c = texte.charCodeAt(i);
    if (c === 34) { const f = finDeChaine(texte, i); if (f === -1) break; i = f; continue; }
    if (c === 45 || (c >= 48 && c <= 57)) {
      let j = i + 1;
      while (j < n) {
        const d = texte.charCodeAt(j);
        if ((d >= 48 && d <= 57) || d === 46 || d === 101 || d === 69 || d === 43 || d === 45) j++;
        else break;
      }
      out.push(texte.slice(i, j));
      i = j - 1;
    }
  }
  return out;
}

const estBrut = (v) => typeof JSON.isRawJSON === "function" && JSON.isRawJSON(v);

/** `JSON.parse`, sauf qu'un nombre que la lecture changerait garde son texte source. */
function lireJsonExact(texte) {
  const risque = jetonsNumeriques(texte).find(estRisque);
  // Rien qui perdrait sa valeur : la lecture ordinaire, sans reviver, donc sans
  // limite de profondeur propre à ce module.
  if (risque === undefined) return JSON.parse(texte);
  if (typeof JSON.rawJSON !== "function") {
    throw new Error(`nombre que JavaScript ne relit pas à l'identique (« ${risque.slice(0, 40)} ») : lecture exacte impossible sans JSON.rawJSON — Node 21 ou plus récent requis`);
  }
  try {
    return JSON.parse(texte, function (cle, valeur, contexte) {
      if (typeof valeur !== "number") return valeur;
      const source = contexte && typeof contexte.source === "string" ? contexte.source : null;
      if (source === null) throw new Error("lecture exacte impossible : le texte source d'un nombre n'est pas accessible à JSON.parse");
      return memeValeur(source, valeur) ? valeur : JSON.rawJSON(source);
    });
  } catch (e) {
    if (e instanceof RangeError) {
      throw new RangeError(`imbrication trop profonde pour une lecture exacte (un nombre à garder au texte près, dans un JSON de plusieurs milliers de niveaux) — ${e.message}`);
    }
    throw e;
  }
}

/**
 * Le tableau JSON d'une page PostgREST → le TEXTE de chacune de ses lignes, tel
 * que la base l'a écrit (blancs hors chaînes de début et de fin retirés ; un
 * saut de ligne hors chaîne, insignifiant en JSON, devient une espace : une
 * ligne NDJSON reste une ligne). Balayage linéaire : aucune profondeur ne le
 * fait échouer. Lève sur un texte qui n'est pas un tableau complet.
 */
function decouperLignes(page) {
  const n = page.length;
  let i = 0;
  while (i < n && estBlanc(page.charCodeAt(i))) i++;
  if (page.charCodeAt(i) !== 91) throw new Error("un tableau JSON était attendu");
  const lignes = [];
  let prof = 0;
  let debut = i + 1;
  const pousser = (fin, dernier) => {
    const el = page.slice(debut, fin).trim();
    if (!el) {
      if (dernier && lignes.length === 0) return; // « [] » : page vide
      throw new Error("élément vide dans le tableau JSON");
    }
    lignes.push(el.replace(/[\r\n]+/g, " "));
  };
  for (i = i + 1; i < n; i++) {
    const c = page.charCodeAt(i);
    if (c === 34) {
      const f = finDeChaine(page, i);
      if (f === -1) throw new Error("chaîne JSON non refermée (page tronquée)");
      i = f;
      continue;
    }
    if (c === 123 || c === 91) { prof++; continue; }
    if (c === 125 || c === 93) {
      if (prof > 0) { prof--; continue; }
      if (c !== 93) throw new Error("accolade fermante sans ouvrante au niveau du tableau");
      pousser(i, true);
      for (let j = i + 1; j < n; j++) if (!estBlanc(page.charCodeAt(j))) throw new Error("texte après le tableau JSON");
      return lignes;
    }
    if (c === 44 && prof === 0) { pousser(i, false); debut = i + 1; }
  }
  throw new Error("tableau JSON non refermé (page tronquée)");
}

/** Le texte d'une valeur lue par `lireJsonExact`, nombre gardé brut compris (pour une clé de comparaison). */
function texteValeur(v) { return estBrut(v) ? v.rawJSON : String(v); }

module.exports = { lireJsonExact, decouperLignes, jetonsNumeriques, estRisque, texteValeur, estBrut, canonique, memeValeur };
