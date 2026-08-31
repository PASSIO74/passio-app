#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   VALIDATION DU CATALOGUE DES PASSIONS — lot TAXO-1
   ──────────────────────────────────────────────────────────────────────────
   Un catalogue de ~850 entrées ne se relit pas à l'œil. Ce script est le seul
   contrôle qui tienne : il tourne en CI et refuse la fusion.

   Ce qu'il PROUVE (et pas ce qu'il suppose) :
     · les 19 identifiants canoniques sont tous présents, avec leur libellé,
       leur emoji et leur couleur d'origine — c'est la compatibilité des clés
       étrangères de production qui en dépend ;
     · aucun doublon d'identifiant, à aucun des trois niveaux ;
     · aucun orphelin : toute passion pointe un univers réel, toute spécialité
       pointe une passion réelle ;
     · une spécialité appartient à UNE passion (son identifiant porte le
       préfixe de sa passion — la base, elle, l'impose par clé composite) ;
     · les volumes tiennent la promesse produit (univers, passions,
       spécialités, synonymes) ;
     · le miroir SQL est à jour vis-à-vis du fichier source.

   Usage : node scripts/valider-catalogue.js  ·  npm run valider:catalogue
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const cat = require(path.join(RACINE, "js", "passion-catalog.js"));

const erreurs = [];
const avert = [];
const ko = (m) => erreurs.push(m);
const attention = (m) => avert.push(m);

// ── Bornes produit ──────────────────────────────────────────────────────────
const BORNES = {
  universes:   [8, 10],
  passions:    [35, 45],
  specialties: [600, 1000]
};

// ── 1. Les 19 canoniques, à l'identique ─────────────────────────────────────
// Copiés de `js/app-01-diag-seed.js` (const PASSIONS). C'est une DEUXIÈME
// écriture volontaire : si quelqu'un modifie app-01, la divergence se voit ici
// au lieu de partir en production.
const CANONIQUES = {
  musique:     { emoji: "🎸",  label: "Musique",           color: "#8b5cf6" },
  photo:       { emoji: "📷",  label: "Photo",             color: "#8b5cf6" },
  voyage:      { emoji: "🌍",  label: "Voyage",            color: "#8b5cf6" },
  cuisine:     { emoji: "🍳",  label: "Cuisine",           color: "#7c3aed" },
  sport:       { emoji: "🏋️", label: "Sport",             color: "#8b5cf6" },
  litterature: { emoji: "📚",  label: "Littérature",       color: "#8b5cf6" },
  cinema:      { emoji: "🎬",  label: "Cinéma",            color: "#7c3aed" },
  tech:        { emoji: "💻",  label: "Tech / IA",         color: "#7c3aed" },
  art:         { emoji: "🎨",  label: "Art",               color: "#8b5cf6" },
  jardinage:   { emoji: "🌱",  label: "Jardinage",         color: "#8b5cf6" },
  metier:      { emoji: "🛠",  label: "Artisanat",         color: "#6d28d9" },
  jeuxvideo:   { emoji: "🎮",  label: "Jeux vidéo",        color: "#8b5cf6" },
  yoga:        { emoji: "🧘",  label: "Yoga / Bien-être",  color: "#8b5cf6" },
  mode:        { emoji: "👗",  label: "Mode",              color: "#7c3aed" },
  danse:       { emoji: "💃",  label: "Danse",             color: "#8b5cf6" },
  podcast:     { emoji: "🎙",  label: "Podcast",           color: "#7c3aed" },
  moto:        { emoji: "🏍",  label: "Moto",              color: "#64748b" },
  animaux:     { emoji: "🐾",  label: "Animaux",           color: "#a78bfa" },
  actu:        { emoji: "🌍",  label: "Actualité",         color: "#7c3aed" }
};

const parId = {};
cat.passions.forEach(p => { parId[p.id] = p; });

Object.keys(CANONIQUES).forEach(id => {
  const attendu = CANONIQUES[id];
  const reel = parId[id];
  if (!reel) {
    ko(`CANONIQUE MANQUANTE : « ${id} » a disparu du catalogue. Des lignes de posts/stories/events/conversations/profiles la référencent en production par clé étrangère.`);
    return;
  }
  ["emoji", "label", "color"].forEach(champ => {
    if (reel[champ] !== attendu[champ]) {
      ko(`CANONIQUE MODIFIÉE : « ${id} ».${champ} vaut ${JSON.stringify(reel[champ])}, attendu ${JSON.stringify(attendu[champ])} (valeur d'app-01-diag-seed.js).`);
    }
  });
});

// La liste `canoniques` exportée doit dire la même chose.
const exportees = (cat.canoniques || []).slice().sort().join(",");
const referenceees = Object.keys(CANONIQUES).sort().join(",");
if (exportees !== referenceees) {
  ko("La liste `canoniques` exportée par le catalogue ne correspond pas aux 19 identifiants de production.");
}

// Elle doit aussi correspondre au fichier app-01 RÉEL, pas seulement à la copie ci-dessus.
try {
  const app01 = fs.readFileSync(path.join(RACINE, "js", "app-01-diag-seed.js"), "utf8");
  const bloc = app01.slice(app01.indexOf("const PASSIONS = ["));
  const idsApp = [];
  const re = /\{\s*id:\s*"([a-z0-9]+)"/g;
  let m, garde = 0;
  const fin = bloc.indexOf("\n];");
  const zone = bloc.slice(0, fin > 0 ? fin : 4000);
  while ((m = re.exec(zone)) && garde++ < 100) idsApp.push(m[1]);
  if (idsApp.length !== 19) {
    attention(`app-01-diag-seed.js expose ${idsApp.length} passions au lieu de 19 — le socle embarqué a changé, vérifier que c'est voulu.`);
  }
  idsApp.forEach(id => {
    if (!parId[id]) ko(`« ${id} » est dans PASSIONS (app-01) mais absente du catalogue : le socle embarqué ne peut pas dépasser le catalogue.`);
  });
} catch (e) {
  attention("Impossible de relire js/app-01-diag-seed.js : " + e.message);
}

// ── 2. Doublons ─────────────────────────────────────────────────────────────
function doublons(liste, quoi) {
  const vus = new Set();
  liste.forEach(x => {
    if (vus.has(x.id)) ko(`DOUBLON ${quoi} : « ${x.id} » apparaît plusieurs fois.`);
    vus.add(x.id);
  });
  return vus;
}
const idsUnivers = doublons(cat.universes, "univers");
const idsPassions = doublons(cat.passions, "passion");
doublons(cat.specialties, "spécialité");

// Un identifiant ne doit jamais être à la fois une passion et un univers : les
// deux voyagent dans les mêmes URL de preview et le même paramètre de filtre.
cat.universes.forEach(u => {
  if (idsPassions.has(u.id)) ko(`COLLISION : « ${u.id} » est à la fois un univers et une passion.`);
});

// ── 3. Orphelins et appartenance ────────────────────────────────────────────
cat.passions.forEach(p => {
  if (!idsUnivers.has(p.universe_id)) {
    ko(`ORPHELINE : la passion « ${p.id} » pointe l'univers « ${p.universe_id} », qui n'existe pas.`);
  }
});
cat.specialties.forEach(s => {
  if (!idsPassions.has(s.passion_id)) {
    ko(`ORPHELINE : la spécialité « ${s.id} » pointe la passion « ${s.passion_id} », qui n'existe pas.`);
  }
  // Le préfixe rend l'appartenance lisible dans la base ; la clé composite la
  // rend obligatoire. Les deux doivent dire la même chose.
  if (s.id !== s.passion_id + "-" + s.id.slice(s.passion_id.length + 1) ||
      s.id.indexOf(s.passion_id + "-") !== 0) {
    ko(`PRÉFIXE : la spécialité « ${s.id} » ne commence pas par « ${s.passion_id}- ».`);
  }
});

// ── 4. Forme des identifiants ───────────────────────────────────────────────
// Une passion ne peut PAS contenir de tiret : c'est ce qui rend le préfixe des
// spécialités non ambigu (« a-b » + « c » ne peut pas se confondre avec
// « a » + « b-c »).
cat.passions.forEach(p => {
  if (!/^[a-z0-9]+$/.test(p.id)) ko(`IDENTIFIANT : la passion « ${p.id} » doit être en minuscules sans tiret ni accent.`);
  if (!p.label || !p.label.trim()) ko(`LIBELLÉ VIDE : passion « ${p.id} ».`);
  if (!p.emoji) ko(`EMOJI MANQUANT : passion « ${p.id} ».`);
});
cat.universes.forEach(u => {
  if (!/^[a-z0-9]+$/.test(u.id)) ko(`IDENTIFIANT : l'univers « ${u.id} » doit être en minuscules sans tiret.`);
});
cat.specialties.forEach(s => {
  if (!/^[a-z0-9-]+$/.test(s.id)) ko(`IDENTIFIANT : la spécialité « ${s.id} » doit être en minuscules, chiffres et tirets uniquement.`);
  if (!s.label || !s.label.trim()) ko(`LIBELLÉ VIDE : spécialité « ${s.id} ».`);
});

// Un libellé de spécialité en double DANS la même passion est une erreur ;
// entre passions différentes c'est légitime (« Route » existe en moto et en vélo).
const parPassion = {};
cat.specialties.forEach(s => {
  (parPassion[s.passion_id] = parPassion[s.passion_id] || []).push(s);
});
Object.keys(parPassion).forEach(pid => {
  const vus = new Set();
  parPassion[pid].forEach(s => {
    const k = cat.norme(s.label);
    if (vus.has(k)) ko(`LIBELLÉ EN DOUBLE : « ${s.label} » apparaît deux fois dans la passion « ${pid} ».`);
    vus.add(k);
  });
});

// Une passion sans aucune spécialité serait un cul-de-sac à l'écran.
cat.passions.forEach(p => {
  const n = (parPassion[p.id] || []).length;
  if (n === 0) ko(`SANS SPÉCIALITÉ : la passion « ${p.id} » n'en a aucune — l'écran « Affiner » y serait vide.`);
  else if (n < 8) attention(`La passion « ${p.id} » n'a que ${n} spécialités.`);
});

// ── 5. Volumes ──────────────────────────────────────────────────────────────
function borne(nom, n, [min, max]) {
  if (n < min || n > max) ko(`VOLUME : ${nom} = ${n}, attendu entre ${min} et ${max}.`);
}
borne("univers", cat.universes.length, BORNES.universes);
borne("passions", cat.passions.length, BORNES.passions);
borne("spécialités", cat.specialties.length, BORNES.specialties);

let nbSyn = 0;
cat.passions.forEach(p => { nbSyn += p.synonyms.length; });
cat.specialties.forEach(s => { nbSyn += s.synonyms.length; });
if (nbSyn < 100) ko(`VOLUME : ${nbSyn} synonymes seulement — la recherche par appellation courante ne tiendrait pas.`);

const populaires = cat.populaires().length;
if (populaires < 8 || populaires > 24) {
  ko(`VOLUME : ${populaires} passions « populaires », attendu entre 8 et 24 (c'est la première grille de l'onboarding).`);
}

// Un univers vide n'a aucune raison d'exister.
cat.universes.forEach(u => {
  if (cat.passionsOf(u.id).length === 0) ko(`UNIVERS VIDE : « ${u.id} » ne contient aucune passion.`);
});

// ── 6. La recherche trouve ce qu'elle promet ────────────────────────────────
// Les quatre exemples de la spécification, plus les pièges d'accent.
const ATTENDUS = [
  ["running", "running"], ["jogging", "running"], ["muscu", "fitness"],
  ["moto cross", "moto-motocross"], ["photo", "photo"], ["velo", "cyclisme"],
  ["echecs", "jeux-echecs"], ["Échecs", "jeux-echecs"], ["patisserie", "cuisine-patisserie"],
  ["ping-pong", "sport-tennis-de-table"], ["ia", "ia"], ["guitare", "musique-guitare"]
];
ATTENDUS.forEach(([q, id]) => {
  const r = cat.chercher(q, 8);
  if (!r.some(x => x.id === id)) {
    ko(`RECHERCHE : « ${q} » ne trouve pas « ${id} » dans les 8 premiers résultats (obtenu : ${r.slice(0, 4).map(x => x.id).join(", ") || "rien"}).`);
  }
});

// ── 7. Le miroir SQL est à jour ─────────────────────────────────────────────
try {
  const { generer, CIBLE } = require(path.join(RACINE, "scripts", "generer-migration-catalogue.js"));
  const attendu = generer();
  const surDisque = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, "utf8") : "";
  if (surDisque !== attendu) {
    ko("MIROIR SQL DÉSYNCHRONISÉ : migrations/migration_passion_taxonomy.sql ne correspond plus à js/passion-catalog.js. Lancer `node scripts/generer-migration-catalogue.js`.");
  }
} catch (e) {
  ko("Impossible de vérifier le miroir SQL : " + e.message);
}

// ── Rapport ─────────────────────────────────────────────────────────────────
console.log("── Catalogue des passions ─────────────────────────────────");
console.log(`  univers      ${cat.universes.length}`);
console.log(`  passions     ${cat.passions.length}   (dont ${populaires} populaires, 19 canoniques)`);
console.log(`  spécialités  ${cat.specialties.length}`);
console.log(`  synonymes    ${nbSyn}`);
console.log(`  index        ${cat.index.length} entrées de recherche`);
console.log("");
avert.forEach(m => console.log("  ⚠ " + m));
if (avert.length) console.log("");

if (erreurs.length) {
  console.error(`✗ ${erreurs.length} erreur(s) :`);
  erreurs.forEach(m => console.error("  · " + m));
  process.exit(1);
}
console.log("✓ catalogue valide.");
