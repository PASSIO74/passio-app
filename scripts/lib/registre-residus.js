"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// REGISTRE STRUCTURÉ DES RÉSIDUS — cinquième contre-revue Astra (2026-09-15,
// mandat §9 : « une phrase "autre lot" ou une issue créée ne prouve pas le
// traitement »).
//
// UN SEUL fichier, `.passio/residus/registre-residus.json`, porte chaque
// résidu avec son identifiant, sa gravité, son propriétaire, le scénario qui
// reste possible, la raison du maintien, ses dépendances, sa CONDITION DE
// RÉEXAMEN (évaluable par une machine), son critère de fermeture, la preuve
// attendue, la prochaine étape, et QUATRE ÉTATS SÉPARÉS : corrigé, testé,
// déployé, relu sur la cible. Aucune fermeture sans les quatre à « oui ».
//
// Ce module ne lit ni réseau ni base : `lireRegistre` valide le texte,
// `evaluer` confronte chaque condition à une SONDE (des faits sur le dépôt —
// un fichier présent, un objet SQL déclaré dans une migration, la date du
// jour, un autre résidu fermé) et rend les ÉCARTS entre ce que le registre
// déclare et ce que le dépôt montre. La sonde du dépôt réel est dans
// `sondeDepot` ; les tests en fournissent une autre.
//
// ⚠️ « Déclaré dans une migration du dépôt » n'est PAS « présent sur la
// cible » : le dépôt ne sait pas ce qui a été appliqué (le journal
// `migrations_appliquees` vit dans la base). Une condition `objet_sql` dit
// donc « le chantier dont ce résidu dépend EXISTE dans le code » — c'est le
// signal demandé (« une PR créant cette dépendance doit déclencher un
// réexamen explicite ») — pas « il est en service ».
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("node:fs");
const path = require("node:path");

const FORMAT = "passio-residus/1";
const CHEMIN_REGISTRE = ".passio/residus/registre-residus.json";

const GRAVITES = ["P0", "P1", "P2", "P3"];
const ETATS = ["oui", "non", "partiel", "non mesuré", "sans objet"];
const CLES_ETATS = ["corrige", "teste", "deploye", "relu_sur_cible"];
const STATUTS_REEXAMEN = ["en_attente", "traitable", "planifie", "ferme"];
const TYPES_CONDITION = ["date", "fichier_present", "fichier_absent", "objet_sql", "residu_ferme", "manuel", "toutes", "une"];
const GENRES_SQL = ["table", "function", "policy", "trigger", "index", "column"];

const CHAMPS_TEXTE = [
  "titre", "proprietaire", "scenario_residuel", "raison_du_maintien",
  "critere_de_fermeture", "preuve_attendue", "prochaine_etape",
];

class ErreurRegistre extends Error {
  constructor(message, erreurs) { super(message); this.name = "ErreurRegistre"; this.erreurs = erreurs || [message]; }
}

const estTexte = (v) => typeof v === "string" && v.trim().length > 0;
const estDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));

// ── Validation d'une condition (récursive, ensemble FERMÉ de formes) ───────
function validerCondition(c, ou, erreurs, profondeur = 0) {
  if (!c || typeof c !== "object" || Array.isArray(c)) { erreurs.push(`${ou} : condition absente ou non-objet`); return; }
  if (!TYPES_CONDITION.includes(c.type)) { erreurs.push(`${ou} : type de condition inconnu « ${c.type} »`); return; }
  if (profondeur > 2) { erreurs.push(`${ou} : condition imbriquée trop profonde`); return; }
  switch (c.type) {
    case "date": if (!estDate(c.le)) erreurs.push(`${ou} : condition date sans « le » (AAAA-MM-JJ)`); break;
    case "fichier_present":
    case "fichier_absent": if (!estTexte(c.chemin) || path.isAbsolute(c.chemin) || c.chemin.includes("..")) erreurs.push(`${ou} : condition ${c.type} sans chemin relatif au dépôt`); break;
    case "objet_sql":
      if (!GENRES_SQL.includes(c.genre)) erreurs.push(`${ou} : genre SQL inconnu « ${c.genre} »`);
      if (!estTexte(c.nom) || !/^[a-z_][a-z0-9_.]*$/i.test(c.nom)) erreurs.push(`${ou} : nom d'objet SQL invalide « ${c.nom} »`);
      break;
    case "residu_ferme": if (!estTexte(c.id)) erreurs.push(`${ou} : condition residu_ferme sans id`); break;
    case "manuel": if (!estTexte(c.quand)) erreurs.push(`${ou} : condition manuelle sans « quand » (ce qui doit être observé, par qui)`); break;
    case "toutes":
    case "une":
      if (!Array.isArray(c.de) || c.de.length < 2) erreurs.push(`${ou} : condition ${c.type} exige au moins deux sous-conditions`);
      else c.de.forEach((s, i) => validerCondition(s, `${ou}.de[${i}]`, erreurs, profondeur + 1));
      break;
  }
}

/** Valide le texte JSON du registre. Rend le registre, ou lève ErreurRegistre (toutes les erreurs). */
function lireRegistre(texte) {
  let r;
  try { r = JSON.parse(String(texte).replace(/^﻿/, "")); } catch (e) { throw new ErreurRegistre("registre illisible : " + e.message); }
  const erreurs = [];
  if (!r || typeof r !== "object" || Array.isArray(r)) throw new ErreurRegistre("registre : objet attendu");
  if (r.format !== FORMAT) erreurs.push(`format attendu « ${FORMAT} », lu « ${r.format} »`);
  if (!estDate(r.mis_a_jour_le)) erreurs.push("mis_a_jour_le absent ou mal formé (AAAA-MM-JJ)");
  if (!Array.isArray(r.residus)) erreurs.push("residus : tableau attendu");
  if (r.nuances_acceptees !== undefined && !Array.isArray(r.nuances_acceptees)) erreurs.push("nuances_acceptees : tableau attendu");
  if (erreurs.length) throw new ErreurRegistre("registre invalide", erreurs);

  const ids = new Set();
  for (const [i, x] of r.residus.entries()) {
    const ou = `residus[${i}]` + (x && x.id ? ` (${x.id})` : "");
    if (!x || typeof x !== "object") { erreurs.push(`${ou} : objet attendu`); continue; }
    if (!estTexte(x.id) || !/^RES-\d{2,}$/.test(x.id)) erreurs.push(`${ou} : id attendu de la forme RES-NN`);
    else if (ids.has(x.id)) erreurs.push(`${ou} : id en double`);
    else ids.add(x.id);
    for (const ch of CHAMPS_TEXTE) if (!estTexte(x[ch])) erreurs.push(`${ou} : ${ch} manquant`);
    if (!GRAVITES.includes(x.gravite)) erreurs.push(`${ou} : gravité hors ${GRAVITES.join("/")}`);
    if (!Array.isArray(x.origine) || !x.origine.length || !x.origine.every(estTexte)) erreurs.push(`${ou} : origine (identifiants de constats) manquante`);
    if (!Array.isArray(x.dependances) || !x.dependances.every(estTexte)) erreurs.push(`${ou} : dependances : tableau de textes attendu`);
    validerCondition(x.condition_de_reexamen, `${ou}.condition_de_reexamen`, erreurs);
    if (!x.etats || typeof x.etats !== "object") erreurs.push(`${ou} : etats manquants`);
    else {
      for (const k of CLES_ETATS) if (!ETATS.includes(x.etats[k])) erreurs.push(`${ou} : etats.${k} hors ${ETATS.join("/")}`);
      for (const k of Object.keys(x.etats)) if (!CLES_ETATS.includes(k)) erreurs.push(`${ou} : etats.${k} inconnu`);
    }
    if (!x.reexamen || typeof x.reexamen !== "object") erreurs.push(`${ou} : reexamen manquant`);
    else {
      if (!STATUTS_REEXAMEN.includes(x.reexamen.statut)) erreurs.push(`${ou} : reexamen.statut hors ${STATUTS_REEXAMEN.join("/")}`);
      if (!estDate(x.reexamen.le)) erreurs.push(`${ou} : reexamen.le absent (date de la dernière décision)`);
      if (!estTexte(x.reexamen.note)) erreurs.push(`${ou} : reexamen.note manquante`);
      if ((x.reexamen.statut === "planifie" || x.reexamen.statut === "ferme") && !estTexte(x.reexamen.chantier)) erreurs.push(`${ou} : reexamen.chantier (PR, branche ou commit) exigé pour « ${x.reexamen.statut} »`);
    }
  }
  // Les dépendances entre résidus doivent viser des résidus existants.
  for (const x of r.residus) {
    if (!x || !Array.isArray(x.dependances)) continue;
    for (const d of x.dependances) if (/^RES-\d+$/.test(d) && !ids.has(d)) erreurs.push(`${x.id} : dépendance vers un résidu inconnu ${d}`);
    const refs = [];
    (function collecter(c) { if (!c || typeof c !== "object") return; if (c.type === "residu_ferme") refs.push(c.id); if (Array.isArray(c.de)) c.de.forEach(collecter); })(x.condition_de_reexamen);
    for (const id of refs) { if (!ids.has(id)) erreurs.push(`${x.id} : condition residu_ferme vers un résidu inconnu ${id}`); if (id === x.id) erreurs.push(`${x.id} : condition residu_ferme sur lui-même`); }
  }
  for (const [i, n] of (r.nuances_acceptees || []).entries()) {
    if (!n || !estTexte(n.id) || !estTexte(n.resume)) erreurs.push(`nuances_acceptees[${i}] : id et resume attendus`);
  }
  if (erreurs.length) throw new ErreurRegistre("registre invalide", erreurs);
  return r;
}

// ── Évaluation d'une condition contre une sonde ────────────────────────────
// La sonde : { aujourdhui: "AAAA-MM-JJ", fichierPresent(chemin)→bool,
// objetSql(genre, nom)→bool, residuFerme(id)→bool }. Rend
// { satisfaite: true|false|null, detail } — null = non mesurable (manuel).
function evaluerCondition(c, sonde) {
  switch (c.type) {
    case "date": {
      const ok = sonde.aujourdhui >= c.le;
      return { satisfaite: ok, detail: ok ? `échéance ${c.le} atteinte (${sonde.aujourdhui})` : `échéance ${c.le} (aujourd'hui ${sonde.aujourdhui})` };
    }
    case "fichier_present": { const ok = !!sonde.fichierPresent(c.chemin); return { satisfaite: ok, detail: `${c.chemin} ${ok ? "présent" : "absent"}` }; }
    case "fichier_absent": { const ok = !sonde.fichierPresent(c.chemin); return { satisfaite: ok, detail: `${c.chemin} ${ok ? "absent" : "présent"}` }; }
    case "objet_sql": { const ok = !!sonde.objetSql(c.genre, c.nom); return { satisfaite: ok, detail: `${c.genre} ${c.nom} ${ok ? "déclaré dans le dépôt" : "non déclaré dans le dépôt"}` }; }
    case "residu_ferme": { const ok = !!sonde.residuFerme(c.id); return { satisfaite: ok, detail: `${c.id} ${ok ? "fermé" : "ouvert"}` }; }
    case "manuel": return { satisfaite: null, detail: `à observer : ${c.quand}` };
    case "toutes": {
      const sous = c.de.map((s) => evaluerCondition(s, sonde));
      const satisfaite = sous.some((s) => s.satisfaite === false) ? false : sous.every((s) => s.satisfaite === true) ? true : null;
      return { satisfaite, detail: "toutes : " + sous.map((s) => s.detail).join(" ; ") };
    }
    case "une": {
      const sous = c.de.map((s) => evaluerCondition(s, sonde));
      const satisfaite = sous.some((s) => s.satisfaite === true) ? true : sous.every((s) => s.satisfaite === false) ? false : null;
      return { satisfaite, detail: "une : " + sous.map((s) => s.detail).join(" ; ") };
    }
    default: return { satisfaite: null, detail: "type inconnu" };
  }
}

/**
 * Confronte le registre à la sonde. Rend, pour chaque résidu, la condition
 * évaluée et les ÉCARTS — un écart est ce que la CI refuse :
 *   · condition satisfaite et statut déclaré « en_attente » : le résidu est
 *     devenu traitable et personne ne l'a écrit (le signal demandé par §9) ;
 *   · statut « ferme » sans les quatre états à « oui » : fermeture sans
 *     déploiement ni mesure de la cible ;
 *   · statut « planifie » ou « ferme » dont une dépendance-résidu est encore
 *     ouverte : on ne planifie pas par-dessus une dépendance ouverte sans le
 *     dire (note obligatoire, mais l'écart est rendu pour lecture).
 */
function evaluer(registre, sonde) {
  const parId = new Map(registre.residus.map((x) => [x.id, x]));
  const estFerme = (id) => { const x = parId.get(id); return !!x && x.reexamen.statut === "ferme"; };
  const sondeComplete = Object.assign({ residuFerme: estFerme }, sonde, { residuFerme: sonde.residuFerme || estFerme });
  const lignes = registre.residus.map((x) => {
    const cond = evaluerCondition(x.condition_de_reexamen, sondeComplete);
    const ecarts = [];
    if (cond.satisfaite === true && x.reexamen.statut === "en_attente") ecarts.push(`devenu traitable (${cond.detail}) mais toujours « en_attente » — réexamen explicite exigé`);
    if (x.reexamen.statut === "ferme") {
      const manquants = CLES_ETATS.filter((k) => x.etats[k] !== "oui" && x.etats[k] !== "sans objet");
      if (manquants.length) ecarts.push(`déclaré fermé alors que ${manquants.map((k) => `${k}=${x.etats[k]}`).join(", ")} — aucune fermeture sans déploiement et relecture de la cible`);
    }
    const depsOuvertes = x.dependances.filter((d) => /^RES-\d+$/.test(d) && !estFerme(d));
    if (x.reexamen.statut === "ferme" && depsOuvertes.length) ecarts.push(`fermé avec des dépendances ouvertes : ${depsOuvertes.join(", ")}`);
    const traitable = cond.satisfaite === true || x.reexamen.statut === "traitable" || x.reexamen.statut === "planifie";
    return { id: x.id, titre: x.titre, gravite: x.gravite, proprietaire: x.proprietaire, statut: x.reexamen.statut, condition: cond, traitable, etats: x.etats, ecarts };
  });
  const ecarts = lignes.flatMap((l) => l.ecarts.map((e) => `${l.id} : ${e}`));
  return {
    format: registre.format, mis_a_jour_le: registre.mis_a_jour_le, aujourdhui: sondeComplete.aujourdhui,
    total: lignes.length,
    ouverts: lignes.filter((l) => l.statut !== "ferme").length,
    traitables: lignes.filter((l) => l.traitable && l.statut !== "ferme").map((l) => l.id),
    non_mesurables: lignes.filter((l) => l.condition.satisfaite === null && l.statut !== "ferme").map((l) => l.id),
    ecarts, lignes,
  };
}

// ── Sonde du dépôt réel ────────────────────────────────────────────────────
// Objets SQL : déclarés par une migration du dépôt (create, alter add column).
// Lecture textuelle, ensemble fermé de formes ; un objet créé par une forme
// non reconnue est « non déclaré » (fail-closed : le résidu reste en attente,
// ce qui se voit dans le rapport, plutôt que traitable à tort).
function normaliserNom(nom) { return String(nom).toLowerCase().replace(/"/g, "").replace(/^public\./, ""); }
function objetsSqlDeclares(sqls) {
  const trouves = new Set();
  const add = (genre, nom) => trouves.add(genre + ":" + normaliserNom(nom));
  const N = String.raw`(?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?`;
  for (const sql of sqls) {
    const s = String(sql).replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of s.matchAll(new RegExp(String.raw`create\s+table\s+(if\s+not\s+exists\s+)?(${N})`, "gi"))) add("table", m[2]);
    for (const m of s.matchAll(new RegExp(String.raw`create\s+(or\s+replace\s+)?function\s+(${N})\s*\(`, "gi"))) add("function", m[2]);
    for (const m of s.matchAll(/create\s+policy\s+"([^"]+)"/gi)) add("policy", m[1]);
    for (const m of s.matchAll(new RegExp(String.raw`create\s+(or\s+replace\s+)?(constraint\s+)?trigger\s+(${N})`, "gi"))) add("trigger", m[3]);
    for (const m of s.matchAll(new RegExp(String.raw`create\s+(unique\s+)?index\s+(concurrently\s+)?(if\s+not\s+exists\s+)?(${N})`, "gi"))) add("index", m[4]);
    for (const m of s.matchAll(new RegExp(String.raw`create\s+table\s+(if\s+not\s+exists\s+)?(${N})\s*\(([\s\S]*?)\)\s*;`, "gi"))) {
      for (const col of m[3].split(/,(?![^()]*\))/)) { const c = col.trim().match(/^"?([a-z_][a-z0-9_]*)"?\s/i); if (c && !/^(constraint|primary|unique|check|foreign)$/i.test(c[1])) add("column", normaliserNom(m[2]) + "." + c[1]); }
    }
    for (const m of s.matchAll(new RegExp(String.raw`alter\s+table\s+(if\s+exists\s+)?(only\s+)?(${N})\s+add\s+(column\s+)?(if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?`, "gi"))) add("column", normaliserNom(m[3]) + "." + m[6]);
  }
  return trouves;
}

function sondeDepot(racine, { aujourdhui } = {}) {
  const dossierMigrations = path.join(racine, "migrations");
  const sqls = fs.existsSync(dossierMigrations)
    ? fs.readdirSync(dossierMigrations).filter((f) => f.endsWith(".sql")).sort().map((f) => fs.readFileSync(path.join(dossierMigrations, f), "utf8"))
    : [];
  const objets = objetsSqlDeclares(sqls);
  return {
    aujourdhui: aujourdhui || new Date().toISOString().slice(0, 10),
    fichierPresent: (chemin) => fs.existsSync(path.join(racine, chemin)),
    objetSql: (genre, nom) => objets.has(genre + ":" + normaliserNom(nom)),
  };
}

function lireRegistreDepot(racine) {
  return lireRegistre(fs.readFileSync(path.join(racine, CHEMIN_REGISTRE), "utf8"));
}

module.exports = {
  FORMAT, CHEMIN_REGISTRE, GRAVITES, ETATS, CLES_ETATS, STATUTS_REEXAMEN, TYPES_CONDITION, ErreurRegistre,
  lireRegistre, lireRegistreDepot, evaluerCondition, evaluer, objetsSqlDeclares, sondeDepot,
};
