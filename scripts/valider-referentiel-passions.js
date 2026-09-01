#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// VALIDATEUR DU RÉFÉRENTIEL PLAT DES PASSIONS
// ──────────────────────────────────────────────────────────────────────────
// Il échoue (code 1) plutôt que de laisser passer un référentiel qui casserait
// la production. Les contrôles sont ordonnés du plus grave au plus cosmétique,
// et chaque message NOMME le fichier et l'entrée : un rapport qu'on ne peut
// pas suivre jusqu'à la ligne fautive ne sert à rien.
//
// ⚠️ LE CONTRÔLE QUI COMPTE VRAIMENT est « les 19 identifiants historiques
// existent ». Ils sont référencés par clé étrangère depuis cinq tables de
// production : en perdre un ne casse pas la recherche, il casse toutes les
// publications qui le portent.
//
// ⚠️ UN ALIAS QUI EST LE LIBELLÉ D'UNE AUTRE PASSION EST UNE ERREUR, pas une
// coquetterie : la frappe remonte alors deux entrées différentes pour le même
// mot, et le classement décide au hasard laquelle passe devant.
// ══════════════════════════════════════════════════════════════════════════
"use strict";
const { charger, norme, normeIdentite, CANONIQUES } = require("./referentiel-passions.js");

const CTRL = /[\u0000-\u001f\u007f]/;

const erreurs = [];
const alertes = [];
function err(m) { erreurs.push(m); }
function warn(m) { alertes.push(m); }

const ref = charger();
const { passions, relations } = ref;
const parId = {};
passions.forEach(p => { parId[p.id] = p; });

// ── 1. Identifiants ────────────────────────────────────────────────────────
const vusId = new Map();
passions.forEach(function (p) {
  const ou = p._fichier + " · " + (p.label || "(sans libellé)");
  if (!p.id) return err("identifiant VIDE dans " + ou);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id)) err("identifiant non conforme « " + p.id + " » (" + ou + ") — minuscules, chiffres et tirets seulement");
  if (p.id.length > 64) err("identifiant trop long « " + p.id + " » (" + ou + ")");
  if (vusId.has(p.id)) err("identifiant EN DOUBLE « " + p.id + " » : " + vusId.get(p.id) + " et " + ou);
  else vusId.set(p.id, ou);
});

// ── 2. Les 19 identifiants historiques ─────────────────────────────────────
CANONIQUES.forEach(function (id) {
  if (!parId[id]) err("⛔ IDENTIFIANT HISTORIQUE ABSENT : « " + id + " ». Il est référencé par clé étrangère en production (posts, stories, events, conversations, profiles).");
});

// ── 3. Libellés ────────────────────────────────────────────────────────────
const vusLabel = new Map();      // identité : deux libellés distincts à l'oeil
const labelRecherche = new Map(); // pliage de RECHERCHE : ce que la frappe atteint
passions.forEach(function (p) {
  const ou = p._fichier + " · " + p.id;
  if (!String(p.label).trim()) return err("libellé VIDE (" + ou + ")");
  if (p.label.length > 60) err("libellé trop long (" + p.label.length + " caractères) : « " + p.label + " » (" + ou + ")");
  if (p.label.length < 2) err("libellé trop court : « " + p.label + " » (" + ou + ")");
  if (CTRL.test(p.label)) err("caractère de contrôle dans le libellé (" + ou + ")");
  if (p.label !== p.label.trim()) err("libellé avec espaces en trop : « " + p.label + " » (" + ou + ")");
  const n = normeIdentite(p.label);
  if (!n) return err("libellé vide après normalisation : « " + p.label + " » (" + ou + ")");
  if (vusLabel.has(n)) err("libellé EN DOUBLE après normalisation « " + p.label + " » : " + vusLabel.get(n) + " et " + ou);
  else vusLabel.set(n, ou);
  if (!labelRecherche.has(norme(p.label))) labelRecherche.set(norme(p.label), ou);
});

// ── 4. Alias ───────────────────────────────────────────────────────────────
const vusAlias = new Map();
passions.forEach(function (p) {
  const ou = p._fichier + " · " + p.id;
  p.aliases.forEach(function (a) {
    if (CTRL.test(a)) err("caractère de contrôle dans un alias (" + ou + ")");
    if (a.length > 60) err("alias trop long « " + a + " » (" + ou + ")");
    const n = norme(a);
    if (!n) return err("alias vide après normalisation (" + ou + ")");
    if (n === norme(p.label)) return warn("alias identique à son propre libellé : « " + a + " » (" + ou + ")");
    const proprietaire = labelRecherche.get(n);
    if (proprietaire && proprietaire !== ou) err("alias « " + a + " » (" + ou + ") est le LIBELLÉ de " + proprietaire);
    const autre = vusAlias.get(n);
    if (autre && autre !== ou) err("alias « " + a + " » partagé par " + autre + " et " + ou);
    else vusAlias.set(n, ou);
  });
});

// ── 5. Relations ───────────────────────────────────────────────────────────
relations.forEach(function (r) {
  if (!parId[r.source_passion_id]) err("relation ORPHELINE : source « " + r.source_passion_id + " » inconnue");
  if (!parId[r.target_passion_id]) err("relation ORPHELINE : cible « " + r.target_passion_id + " » inconnue");
  if (r.source_passion_id === r.target_passion_id) err("relation réflexive sur « " + r.source_passion_id + " »");
});
passions.forEach(function (p) {
  if (p.broader && !parId[p.broader]) err("« " + p.id + " » (" + p._fichier + ") pointe vers un broader inconnu : « " + p.broader + " »");
  // Boucle de `broader` : elle ferait tourner l'héritage d'emoji à l'infini.
  let cur = p, n = 0;
  const vus = new Set([p.id]);
  while (cur && cur.broader && n++ < 20) {
    if (vus.has(cur.broader)) { err("BOUCLE de broader autour de « " + p.id + " »"); break; }
    vus.add(cur.broader);
    cur = parId[cur.broader];
  }
});

// ── 6. Emoji et couleur ────────────────────────────────────────────────────
passions.forEach(function (p) {
  if (!p.broader && !p.emoji) err("« " + p.id + " » n'a pas de broader : elle DOIT porter un emoji");
  if (p.color && !/^#[0-9a-fA-F]{6}$/.test(p.color)) err("couleur non conforme « " + p.color + " » (" + p.id + ")");
});

// ── 7. Décomptes ───────────────────────────────────────────────────────────
const nbAlias = passions.reduce((a, p) => a + p.aliases.length, 0);
const nbPop = passions.filter(p => p.popular).length;
const nbBroad = passions.filter(p => p.is_broad).length;

console.log("── Référentiel plat des passions ──────────────────────────────");
console.log("  passions            : " + passions.length);
console.log("  alias               : " + nbAlias);
console.log("  relations           : " + relations.length
  + " (broader/narrower " + relations.filter(r => r.relation_type !== "related").length
  + ", related " + relations.filter(r => r.relation_type === "related").length + ")");
console.log("  proposées au repos  : " + nbPop);
console.log("  termes généraux     : " + nbBroad);
console.log("  identifiants légués : " + CANONIQUES.filter(id => parId[id]).length + "/" + CANONIQUES.length);
console.log("  fichiers sources    : " + new Set(passions.map(p => p._fichier)).size);

if (alertes.length) {
  console.log("\n⚠️  " + alertes.length + " alerte(s) :");
  alertes.slice(0, 40).forEach(m => console.log("   · " + m));
  if (alertes.length > 40) console.log("   … et " + (alertes.length - 40) + " autres");
}
if (erreurs.length) {
  console.error("\n❌ " + erreurs.length + " erreur(s) :");
  erreurs.slice(0, 80).forEach(m => console.error("   · " + m));
  if (erreurs.length > 80) console.error("   … et " + (erreurs.length - 80) + " autres");
  process.exit(1);
}
console.log("\n✅ Référentiel valide.");
