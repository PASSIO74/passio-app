#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// DÉDUPLICATION DES ALIAS — outil d'entretien du référentiel
// ──────────────────────────────────────────────────────────────────────────
// Il RÉÉCRIT `data/passions/*.js` pour qu'un même mot ne désigne plus qu'une
// seule passion. À lancer après un ajout massif, puis à relire au diff : il
// n'invente rien, il ne fait que RETIRER des alias.
//
// ⚠️ POURQUOI C'EST UNE ERREUR ET PAS UN DÉTAIL. Le référentiel est plat :
// taper « cheval » doit désigner UNE passion. Si « cheval » est alias de
// « Équitation » ET de « Chevaux », le classement départage sur l'ordre du
// fichier — donc au hasard du jour où quelqu'un a réorganisé le référentiel.
// Deux réponses pour un mot, c'est une recherche qui ment.
//
// LES DEUX RÈGLES, dans cet ordre :
//
//   ① Un alias qui est le LIBELLÉ d'une autre passion est simplement RETIRÉ.
//      Il ne sert à rien : la frappe atteint déjà cette passion par son nom,
//      et en tête de classement puisqu'une correspondance de libellé prime.
//
//   ② Un alias partagé par plusieurs passions est gardé sur UNE seule :
//        a. une passion PRÉCISE l'emporte sur un terme général (`is_broad`) —
//           « muscu » doit mener à « Musculation », pas à la grande famille
//           « Musculation et fitness » ;
//        b. à égalité, celle dont le libellé partage le plus de mots avec
//           l'alias (« armagnac » reste sur « Cognac et armagnac ») ;
//        c. à égalité encore, la première rencontrée — arbitraire, mais
//           STABLE : deux exécutions donnent le même référentiel.
// ══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");
const { charger, norme, DOSSIER } = require("./referentiel-passions.js");

const ref = charger();
const { passions } = ref;

// Index des libellés (pliage de recherche) et des alias.
const parLabel = new Map();
passions.forEach(p => { const n = norme(p.label); if (!parLabel.has(n)) parLabel.set(n, p.id); });

const porteurs = new Map();   // alias normalisé → [ids]
passions.forEach(function (p) {
  p.aliases.forEach(function (a) {
    const n = norme(a);
    if (!n) return;
    if (!porteurs.has(n)) porteurs.set(n, []);
    if (porteurs.get(n).indexOf(p.id) < 0) porteurs.get(n).push(p.id);
  });
});

const parId = {};
passions.forEach(p => { parId[p.id] = p; });

function motsCommuns(alias, label) {
  const A = new Set(norme(alias).split(" ").filter(Boolean));
  return norme(label).split(" ").filter(m => A.has(m)).length;
}

// aRetirer : id → Set d'alias normalisés à supprimer
const aRetirer = new Map();
function retirer(id, aliasNorm) {
  if (!aRetirer.has(id)) aRetirer.set(id, new Set());
  aRetirer.get(id).add(aliasNorm);
}

let n0 = 0, n1 = 0, n2 = 0;

// ⓪ Un alias identique à son PROPRE libellé n'ajoute rien à la recherche et
//    encombre la relecture. On le retire d'abord, sinon il compterait comme un
//    « partage » avec lui-même à la règle ②.
passions.forEach(function (p) {
  const nl = norme(p.label);
  p.aliases.forEach(function (a) { if (norme(a) === nl) { retirer(p.id, nl); n0++; } });
});

porteurs.forEach(function (ids, n) {
  // ① alias = libellé d'une autre passion
  const proprietaire = parLabel.get(n);
  if (proprietaire) {
    ids.forEach(function (id) { if (id !== proprietaire) { retirer(id, n); n1++; } });
    return;
  }
  // ② alias partagé
  if (ids.length < 2) return;
  const gagnant = ids.slice().sort(function (a, b) {
    const A = parId[a], B = parId[b];
    if (!!A.is_broad !== !!B.is_broad) return A.is_broad ? 1 : -1;
    const d = motsCommuns(n, B.label) - motsCommuns(n, A.label);
    if (d) return d;
    return A.sort_order - B.sort_order;
  })[0];
  ids.forEach(function (id) { if (id !== gagnant) { retirer(id, n); n2++; } });
});

// ── Réécriture des fichiers ────────────────────────────────────────────────
// On réécrit LIGNE PAR LIGNE, en ne touchant qu'au 3ᵉ champ. Réémettre le
// fichier depuis les objets chargés perdrait les commentaires de section et
// produirait un diff illisible.
let fichiersTouches = 0, aliasRetires = 0;
fs.readdirSync(DOSSIER).filter(f => f.endsWith(".js") && f !== "relations.js").forEach(function (f) {
  const p = path.join(DOSSIER, f);
  const src = fs.readFileSync(p, "utf8");
  let change = false;
  const out = src.split("\n").map(function (ligne) {
    const m = ligne.match(/^(\s*\["([a-z0-9-]+)", (?:"(?:[^"\\]|\\.)*"), ")((?:[^"\\]|\\.)*)(".*)$/);
    if (!m) return ligne;
    const id = m[2];
    const set = aRetirer.get(id);
    if (!set || !set.size) return ligne;
    const gardes = m[3].split(",").map(x => x.trim()).filter(function (a) {
      if (!a) return false;
      if (set.has(norme(a))) { aliasRetires++; return false; }
      return true;
    });
    const neuve = m[1] + gardes.join(",") + m[4];
    if (neuve !== ligne) change = true;
    return neuve;
  }).join("\n");
  if (change) { fs.writeFileSync(p, out); fichiersTouches++; }
});

console.log("Alias retirés parce qu'ils redisaient leur propre libellé        : " + n0);
console.log("Alias retirés parce qu'ils étaient le libellé d'une autre passion : " + n1);
console.log("Alias retirés parce qu'ils étaient partagés                      : " + n2);
console.log("→ " + aliasRetires + " alias supprimés dans " + fichiersTouches + " fichier(s).");
console.log("Relancer `npm run passions:valider` pour confirmer.");
