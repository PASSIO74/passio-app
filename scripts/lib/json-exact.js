"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// JSON EXACT — lire un JSON sans arrondir ses nombres (revue R25, 2026-11-04).
//
// `JSON.parse` lit chaque nombre comme un flottant 64 bits. Au-delà de 2^53, un
// entier est ARRONDI : 2906581903110193585 devient 2906581903110193700. Un
// `numeric` à plus de 15 chiffres significatifs l'est aussi. La sauvegarde
// faisait `r.json()` puis `JSON.stringify`, donc l'archive portait une valeur
// que la base n'a jamais contenue. Deux valeurs distinctes pouvaient s'y
// confondre : à la restauration, c'est une collision sur une clé unique, que
// `on conflict do nothing` règle en JETANT une ligne. La vérification ne le
// voyait pas, puisqu'elle arrondissait les deux côtés de la même façon.
//
// La règle :
//   • un nombre que JavaScript lit en dénotant la MÊME valeur décimale que son
//     texte source reste un nombre (10.00, 1e-07, 0.1 : rien ne se perd, et une
//     archive d'avant ce correctif se compare toujours à l'identique) ;
//   • un nombre que la lecture changerait garde son texte source, au moyen de
//     `JSON.rawJSON`, que `JSON.stringify` réécrit tel quel.
// Sans accès au texte source (Node < 21), un entier au-delà de 2^53 fait
// ÉCHOUER la lecture : une sauvegarde qui arrondit en silence ment.
//
// Verrous : tests/unit/restaurer-donnees.test.mjs (⑳ et suivants).
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

const estBrut = (v) => typeof JSON.isRawJSON === "function" && JSON.isRawJSON(v);

/** `JSON.parse`, sauf qu'un nombre que la lecture changerait garde son texte source. */
function lireJsonExact(texte) {
  return JSON.parse(texte, function (cle, valeur, contexte) {
    if (typeof valeur !== "number") return valeur;
    const source = contexte && typeof contexte.source === "string" ? contexte.source : null;
    if (source === null || typeof JSON.rawJSON !== "function") {
      if (Number.isInteger(valeur) && !Number.isSafeInteger(valeur)) {
        throw new Error(`nombre au-delà de 2^53 (« ${cle} » ≈ ${valeur}) : lecture exacte impossible sans JSON.rawJSON — Node 21 ou plus récent requis`);
      }
      return valeur;
    }
    return memeValeur(source, valeur) ? valeur : JSON.rawJSON(source);
  });
}

/** Le texte d'une valeur lue par `lireJsonExact`, nombre gardé brut compris (pour une clé de comparaison). */
function texteValeur(v) { return estBrut(v) ? v.rawJSON : String(v); }

module.exports = { lireJsonExact, texteValeur, estBrut, canonique, memeValeur };
