#!/usr/bin/env node
// Agrège les mesures automatiques de TOUTES les fiches de capture (tous domaines) :
// cibles tactiles sous 44 px, champs sous 16 px, contrastes sous AA, commandes sans
// nom, débordements, erreurs JavaScript. Écrit donnees/synthese-mesures.json et
// 05-MESURES.md. Les mesures sont des INDICES relevés sur la zone visible de chaque
// capture « avant » ; les constats des domaines disent lesquels ont été vérifiés à l'œil.
//   node docs/audit-ux-ui-2026-11-10/outils/synthese-mesures.js
"use strict";
const fs = require("fs");
const path = require("path");
const AUDIT = path.resolve(__dirname, "..");
const dirCap = path.join(AUDIT, "donnees", "captures");

const fiches = [];
if (fs.existsSync(dirCap)) for (const dom of fs.readdirSync(dirCap)) {
  const d = path.join(dirCap, dom);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) { try { fiches.push(JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))); } catch (e) {} }
}
const avecMesures = fiches.filter((f) => f.mesures && !f.mesures.erreur);
const parVue = {};
const cibles = new Map(), champs = new Map(), contrastes = new Map(), paires = new Map(), sansNom = new Map(), sansEtiquette = new Map();
const debordements = [], erreursJs = new Map();
const noter = (map, cle, valeur, id) => { const e = map.get(cle) || Object.assign({ captures: new Set() }, valeur); e.captures.add(id); map.set(cle, e); return e; };

for (const f of avecMesures) {
  const m = f.mesures, id = f.id + "/" + f.vue;
  const v = (parVue[f.vue] = parVue[f.vue] || { captures: 0, avecPetiteCible: 0, petitesCibles: 0, avecChampSous16: 0, avecContraste: 0, contrastes: 0, debordePage: 0 });
  v.captures++;
  const petites = (m.cibles.sous44 || []).filter((c) => !c.enLigne);
  if (petites.length) v.avecPetiteCible++;
  v.petitesCibles += petites.length;
  for (const c of petites) {
    const e = noter(cibles, c.el + " ¦ " + (c.texte || ""), { el: c.el, texte: c.texte, w: c.w, h: c.h }, id);
    if (c.w * c.h < e.w * e.h) { e.w = c.w; e.h = c.h; }
  }
  if ((m.champs.sous16 || []).length) v.avecChampSous16++;
  for (const c of m.champs.sous16 || []) noter(champs, c.el, { el: c.el, texte: c.texte, px: c.px }, id);
  if ((m.contraste.sousSeuil || []).length) v.avecContraste++;
  v.contrastes += (m.contraste.sousSeuil || []).length;
  for (const c of m.contraste.sousSeuil || []) {
    noter(contrastes, c.texte + " ¦ " + c.couleur + " ¦ " + c.fond, { texte: c.texte, ratio: c.ratio, seuil: c.seuil, couleur: c.couleur, fond: c.fond, px: c.px, el: c.el }, id);
    const p = noter(paires, c.couleur + " sur " + c.fond, { couleur: c.couleur, fond: c.fond, ratio: c.ratio, occurrences: 0, exemples: [] }, id);
    p.occurrences++; if (p.exemples.length < 4 && !p.exemples.includes(c.texte)) p.exemples.push(c.texte);
  }
  for (const c of m.sansNom || []) noter(sansNom, c.el, { el: c.el, html: c.html }, id);
  for (const c of m.champsSansEtiquette || []) noter(sansEtiquette, c.el, { el: c.el, placeholder: c.placeholder }, id);
  if (m.debordement && m.debordement.page) { v.debordePage++; debordements.push({ capture: id, largeur: m.debordement.largeurDocument, fenetre: m.fenetre.w, elements: (m.debordement.elements || []).slice(0, 4).map((x) => x.el) }); }
}
for (const f of fiches) for (const e of (f.erreurs && f.erreurs.js) || []) noter(erreursJs, e.slice(0, 200), { message: e.slice(0, 200) }, f.id + "/" + f.vue);

const liste = (map, tri) => [...map.values()].map((e) => Object.assign({}, e, { captures: [...e.captures].slice(0, 12), nbCaptures: e.captures.size })).sort(tri);
const sortie = {
  genereLe: new Date().toISOString(),
  fiches: fiches.length, fichesMesurees: avecMesures.length, parVue,
  cibles: liste(cibles, (a, b) => b.nbCaptures - a.nbCaptures || a.w * a.h - b.w * b.h),
  champs: liste(champs, (a, b) => a.px - b.px),
  pairesDeContraste: liste(paires, (a, b) => b.occurrences - a.occurrences),
  contrastes: liste(contrastes, (a, b) => a.ratio - b.ratio).slice(0, 200),
  sansNom: liste(sansNom, (a, b) => b.nbCaptures - a.nbCaptures),
  champsSansEtiquette: liste(sansEtiquette, (a, b) => b.nbCaptures - a.nbCaptures),
  debordements, erreursJs: liste(erreursJs, (a, b) => b.nbCaptures - a.nbCaptures),
};
fs.writeFileSync(path.join(AUDIT, "donnees", "synthese-mesures.json"), JSON.stringify(sortie, null, 1));

const c = (x) => String(x == null ? "" : x).replace(/\|/g, "∣").replace(/\r?\n/g, " ");
let md = "# Mesures automatiques — synthèse\n\n";
md += "> Généré par `outils/synthese-mesures.js` le " + sortie.genereLe.slice(0, 10) + ", à partir de " + avecMesures.length + " captures « avant » mesurées (" + fiches.length + " fiches).\n";
md += "> Ce sont des **indices** relevés sur la zone visible de chaque capture, en émulation Chromium : une cible « en ligne » dans un texte est exclue, un texte posé sur une image n'est pas jugé, une opacité portée par un ancêtre n'est pas composée. Les constats des domaines indiquent ce qui a été vérifié à l'œil.\n\n";
md += "## Par gabarit\n\n| Gabarit | Captures mesurées | … avec au moins une cible < 44 px | Cibles < 44 px relevées | … avec un champ < 16 px | … avec un contraste < AA | Contrastes < AA relevés | Page qui déborde en largeur |\n|---|---|---|---|---|---|---|---|\n";
for (const k of ["m320", "m360", "m390", "m430", "t768", "d1440"]) { const v = parVue[k]; if (v) md += "| " + [k, v.captures, v.avecPetiteCible, v.petitesCibles, v.avecChampSous16, v.avecContraste, v.contrastes, v.debordePage].join(" | ") + " |\n"; }
md += "\n## Cibles tactiles sous 44 px — les plus répandues (" + sortie.cibles.length + " cibles distinctes)\n\n| Élément | Libellé | Plus petite zone mesurée | Captures concernées |\n|---|---|---|---|\n";
for (const x of sortie.cibles.slice(0, 60)) md += "| `" + c(x.el) + "` | " + c(x.texte) + " | " + x.w + " × " + x.h + " px | " + x.nbCaptures + " |\n";
md += "\n## Champs de saisie sous 16 px (" + sortie.champs.length + ")\n\n| Élément | Libellé | Taille | Captures |\n|---|---|---|---|\n";
for (const x of sortie.champs.slice(0, 40)) md += "| `" + c(x.el) + "` | " + c(x.texte) + " | " + x.px + " px | " + x.nbCaptures + " |\n";
md += "\n## Contrastes sous le seuil AA — par couple de couleurs (" + sortie.pairesDeContraste.length + " couples)\n\n| Texte | Fond | Ratio | Occurrences | Captures | Exemples |\n|---|---|---|---|---|---|\n";
for (const x of sortie.pairesDeContraste.slice(0, 40)) md += "| `" + x.couleur + "` | `" + x.fond + "` | " + x.ratio + ":1 | " + x.occurrences + " | " + x.nbCaptures + " | " + c(x.exemples.join(" · ")) + " |\n";
md += "\n## Commandes sans nom accessible (" + sortie.sansNom.length + ")\n\n| Élément | Captures | Extrait |\n|---|---|---|\n";
for (const x of sortie.sansNom.slice(0, 40)) md += "| `" + c(x.el) + "` | " + x.nbCaptures + " | `" + c((x.html || "").slice(0, 90)) + "` |\n";
md += "\n## Champs sans étiquette (" + sortie.champsSansEtiquette.length + ")\n\n| Élément | Indication affichée | Captures |\n|---|---|---|\n";
for (const x of sortie.champsSansEtiquette.slice(0, 40)) md += "| `" + c(x.el) + "` | " + c(x.placeholder) + " | " + x.nbCaptures + " |\n";
md += "\n## Débordements horizontaux de la page (" + debordements.length + ")\n\n" + (debordements.length ? "| Capture | Largeur du document | Fenêtre | Éléments |\n|---|---|---|---|\n" + debordements.slice(0, 40).map((x) => "| " + x.capture + " | " + x.largeur + " px | " + x.fenetre + " px | " + c(x.elements.map((e) => "`" + e + "`").join(", ")) + " |").join("\n") + "\n" : "Aucun débordement de page relevé.\n");
md += "\n## Erreurs JavaScript vues pendant les captures (" + sortie.erreursJs.length + ")\n\n" + (sortie.erreursJs.length ? "| Message | Captures |\n|---|---|\n" + sortie.erreursJs.slice(0, 30).map((x) => "| `" + c(x.message) + "` | " + x.nbCaptures + " (" + c(x.captures.slice(0, 4).join(", ")) + ") |").join("\n") + "\n" : "Aucune.\n");
fs.writeFileSync(path.join(AUDIT, "05-MESURES.md"), md);
console.log("Fiches : " + fiches.length + " (mesurées " + avecMesures.length + ") — cibles < 44 px distinctes : " + sortie.cibles.length + " — champs < 16 px : " + sortie.champs.length + " — couples de contraste < AA : " + sortie.pairesDeContraste.length + " — sans nom : " + sortie.sansNom.length + " — débordements : " + debordements.length + " — erreurs JS distinctes : " + sortie.erreursJs.length);
