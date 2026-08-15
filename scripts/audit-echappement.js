#!/usr/bin/env node
/**
 * audit-echappement.js — traque les données interpolées dans du HTML SANS passer
 * par un des trois helpers d'échappement du projet.
 *
 * Pourquoi un détecteur plutôt qu'une relecture : deux fonctions de rendu pèsent
 * à elles seules 322 Ko (openVlogViewer 3 779 lignes, openEventDetails 2 501).
 * Aucune relecture humaine ni aucun modèle ne les lit sérieusement d'un bout à
 * l'autre, et les découper en fragments ferait juger la forme au lieu du fond.
 * Ce qui est mécanique — « cette expression atteint-elle le DOM sans helper ? » —
 * se vérifie exhaustivement par balayage. Le jugement, lui, reste humain : le
 * script CLASSE par contexte et ne prétend jamais qu'un signalement est une faille.
 *
 * Les trois helpers ne sont PAS interchangeables (cf. CLAUDE.md) :
 *   escapeHtml   → texte inséré dans du HTML
 *   escapeJsArg  → argument de chaîne JS simple-quotée dans un attribut onclick
 *   safeUrlAttr  → URL fournie par un autre utilisateur, dans src/href/poster
 *
 * Usage :
 *   node scripts/audit-echappement.js            # signalements probables
 *   node scripts/audit-echappement.js --tout     # + ceux jugés sûrs (contrôle)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
// ⚠️ N'inscrire ici que ce qui DÉSINFECTE réellement. `passioThumb` y figurait à
// tort : il TRANSFORME une URL Storage et renvoie l'entrée INCHANGÉE quand ce n'en
// est pas une (js/app-02:602). Le compter comme une protection masquait les sites
// où une URL hostile traversait intacte — un outil qui rassure à tort est pire
// qu'aucun outil. `encodeURIComponent`, lui, pourcent-encode les guillemets et
// ferme donc bien la sortie d'attribut.
const HELPERS = /\b(escapeHtml|escapeJsArg|safeUrlAttr|encodeURIComponent)\s*\(/;

/**
 * Expressions considérées comme sûres SANS helper. Chacune est justifiée :
 * on ne met ici que ce dont la valeur ne peut pas venir d'un autre utilisateur.
 */
const SURES = [
  /^[0-9]+$/,                          // littéral numérique
  /^["'`][^"'`]*["'`]$/,               // littéral chaîne
  /^(true|false|null|undefined)$/,
  /\.length$/,                          // une taille
  /^(i|j|n|idx|index)$/,                // compteur de boucle
  /^Math\./,
  /^Date\.now\(\)$/,
  /^[A-Z_][A-Z0-9_]*$/,                 // CONSTANTE du projet
];

function estSure(expr) {
  const e = expr.trim();
  if (!e) return true;
  if (HELPERS.test(e)) return true;
  return SURES.some((r) => r.test(e));
}

/** Devine le contexte d'insertion à partir de ce qui précède l'interpolation. */
function contexte(avant) {
  const q = avant.slice(-260);
  if (/\bon[a-z]+\s*=\s*["'][^"']*$/i.test(q)) return { nom: "attribut onclick/on*", helper: "escapeJsArg" };
  if (/\b(src|href|poster|action|formaction|data|xlink:href)\s*=\s*["'`][^"'`]*$/i.test(q)) {
    return { nom: "attribut d'URL", helper: "safeUrlAttr" };
  }
  if (/\bstyle\s*=\s*["'`][^"'`]*$/i.test(q)) return { nom: "attribut style", helper: "à neutraliser (CSS)" };
  if (/<[a-z][^>]*$/i.test(q)) return { nom: "autre attribut", helper: "escapeHtml" };
  return { nom: "texte HTML", helper: "escapeHtml" };
}

/** Le bloc ressemble-t-il à du HTML ? (sinon l'interpolation n'atteint pas le DOM) */
function ressembleAHtml(s) {
  return /<[a-z!\/][^>]*>/i.test(s) || /\b(class|style|src|href|onclick)\s*=/i.test(s);
}

function analyser(fichier) {
  const src = fs.readFileSync(path.join(RACINE, fichier), "utf8");
  const lignes = src.split(/\r?\n/);
  const trouves = [];

  // 1) Littéraux gabarits : `… ${expr} …`
  const gabarit = /`(?:[^`\\]|\\.)*`/gs;
  let m;
  while ((m = gabarit.exec(src)) !== null) {
    const bloc = m[0];
    if (!ressembleAHtml(bloc)) continue;
    const interp = /\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let x;
    while ((x = interp.exec(bloc)) !== null) {
      const expr = x[1];
      if (estSure(expr)) continue;
      const posAbs = m.index + x.index;
      trouves.push({
        ligne: src.slice(0, posAbs).split(/\r?\n/).length,
        expr: expr.trim().slice(0, 90),
        ...contexte(bloc.slice(0, x.index)),
      });
    }
  }

  // 2) Concaténations : "…<div …" + expr + "…"
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (!ressembleAHtml(l)) continue;
    const conc = /["']\s*\+\s*([A-Za-z_$][\w$.\[\]()'"]*)\s*\+\s*["']/g;
    let c;
    while ((c = conc.exec(l)) !== null) {
      const expr = c[1];
      if (estSure(expr)) continue;
      trouves.push({ ligne: i + 1, expr: expr.slice(0, 90), ...contexte(l.slice(0, c.index)) });
    }
  }
  return trouves;
}

function main() {
  const tout = process.argv.includes("--tout");
  const fichiers = fs.readdirSync(path.join(RACINE, "js"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => "js/" + f);

  let total = 0;
  const parHelper = {};
  console.log("\n  Audit d'échappement — données interpolées dans du HTML\n");

  for (const f of fichiers) {
    const t = analyser(f);
    if (!t.length) continue;
    total += t.length;
    console.log(`  ${f}  (${t.length})`);
    for (const r of t) {
      parHelper[r.helper] = (parHelper[r.helper] || 0) + 1;
      console.log(`    ${String(r.ligne).padStart(5)}  [${r.helper}]  ${r.nom}\n           ${r.expr}`);
    }
    console.log("");
  }

  console.log(`  ${total} signalement(s) — répartition par helper attendu :`);
  for (const [h, n] of Object.entries(parHelper).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${h}`);
  }
  console.log(
    "\n  ⚠️ Un signalement n'est PAS une faille : beaucoup d'expressions portent des\n" +
    "  valeurs internes (identifiants générés, constantes, contenu déjà échappé en\n" +
    "  amont). Ce script dit OÙ REGARDER, il ne conclut pas à ta place.\n" +
    (tout ? "" : "  (--tout pour inclure les expressions jugées sûres)\n")
  );
}

main();
