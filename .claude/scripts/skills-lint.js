#!/usr/bin/env node
/**
 * skills-lint.js — audit déterministe de la bibliothèque de skills.
 *
 * Ce qui est MESURABLE ne doit pas coûter de raisonnement : chevauchement de
 * déclencheurs, budget de listing, SKILL.md obèse, frontmatter absent. Le modèle
 * lit le rapport et décide (fusionner / améliorer / laisser) au lieu de relire
 * 42 fichiers à chaque session.
 *
 *   node .claude/scripts/skills-lint.js [--json]
 */

const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..", "skills");
const JSON_OUT = process.argv.includes("--json");

/** Budget de listing = skillListingBudgetFraction × fenêtre de contexte.
 *  Lu dans les réglages utilisateur pour rester synchronisé avec le réel. */
const FENETRE_TOKENS = 200000;
const FRACTION = (() => {
  try {
    const p = path.join(process.env.USERPROFILE || process.env.HOME, ".claude", "settings.json");
    const f = JSON.parse(fs.readFileSync(p, "utf8")).skillListingBudgetFraction;
    return typeof f === "number" ? f : 0.01;
  } catch {
    return 0.01; // défaut Claude Code
  }
})();
const BUDGET_CAR = FENETRE_TOKENS * FRACTION * 3.5;

/** Mots vides français/techniques : ne distinguent aucun skill. */
const VIDES = new Set(
  ("de des du la le les un une et ou a à au aux en dans pour par sur avec sans " +
   "que qui quoi dont ce cette ces son sa ses leur leurs est sont être avoir " +
   "utiliser quand benjamin dit veut faut passio skill à utiliser ou dit " +
   "niveau plus tout toute tous les d l s n y il elle on nous vous").split(/\s+/)
);

function lire() {
  if (!fs.existsSync(RACINE)) return [];
  return fs
    .readdirSync(RACINE)
    .map((nom) => {
      const p = path.join(RACINE, nom, "SKILL.md");
      if (!fs.existsSync(p)) return null;
      const texte = fs.readFileSync(p, "utf8");
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texte);
      const bloc = fm ? fm[1] : "";
      const desc = (/^description:\s*(.*)$/m.exec(bloc) || [, ""])[1].trim();
      const declare = (/^name:\s*(.*)$/m.exec(bloc) || [, ""])[1].trim();
      return {
        nom,
        declare,
        desc,
        octets: Buffer.byteLength(texte),
        aFrontmatter: !!fm,
        fichiers: fs.readdirSync(path.join(RACINE, nom)),
      };
    })
    .filter(Boolean);
}

function motsCles(desc) {
  return new Set(
    desc
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((m) => m.length > 3 && !VIDES.has(m))
  );
}

function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

const skills = lire();
const problemes = [];

// 1. Frontmatter et cohérence du nom
for (const s of skills) {
  if (!s.aFrontmatter) problemes.push({ gravite: "haute", skill: s.nom, souci: "SKILL.md sans frontmatter : jamais chargé." });
  else if (s.declare && s.declare !== s.nom) problemes.push({ gravite: "haute", skill: s.nom, souci: `name: « ${s.declare} » ≠ dossier « ${s.nom} ».` });
  if (!s.desc) problemes.push({ gravite: "haute", skill: s.nom, souci: "description vide : ne se déclenchera jamais tout seul." });
  else if (s.desc.length < 80) problemes.push({ gravite: "moyenne", skill: s.nom, souci: `description trop courte (${s.desc.length} car.) : déclenchement imprécis.` });
}

// 2. SKILL.md obèse → sortir le volume en références chargées à la demande
for (const s of skills) {
  if (s.octets > 6000 && s.fichiers.length === 1) {
    problemes.push({ gravite: "moyenne", skill: s.nom, souci: `${Math.round(s.octets / 1024)} Ko en un seul fichier : déplacer le détail dans references/.` });
  }
}

// 3. Chevauchement de déclencheurs — la vraie cause d'une mauvaise sélection
const paires = [];
for (let i = 0; i < skills.length; i++) {
  for (let j = i + 1; j < skills.length; j++) {
    const score = jaccard(motsCles(skills[i].desc), motsCles(skills[j].desc));
    if (score >= 0.2) paires.push({ a: skills[i].nom, b: skills[j].nom, score: +score.toFixed(2) });
  }
}
paires.sort((x, y) => y.score - x.score);
for (const p of paires) {
  problemes.push({
    gravite: p.score >= 0.35 ? "haute" : "moyenne",
    skill: `${p.a} ↔ ${p.b}`,
    souci: `déclencheurs proches (${Math.round(p.score * 100)} %) : préciser les descriptions ou fusionner.`,
  });
}

// 4. Budget de listing
const listing = skills.reduce((n, s) => n + s.desc.length + s.nom.length + 4, 0);

const rapport = {
  skills: skills.length,
  listingCaracteres: listing,
  listingTokensApprox: Math.round(listing / 3.5),
  budgetCaracteres: Math.round(BUDGET_CAR),
  margeUtilisee: +((listing / BUDGET_CAR) * 100).toFixed(1),
  problemes,
};

if (JSON_OUT) {
  console.log(JSON.stringify(rapport, null, 2));
  process.exit(0);
}

console.log(`Bibliothèque : ${rapport.skills} skills`);
console.log(
  `Listing      : ${rapport.listingCaracteres} car. (~${rapport.listingTokensApprox} tokens) = ${rapport.margeUtilisee} % du budget`
);
if (rapport.margeUtilisee > 90)
  console.log("  ⚠ budget saturé : les descriptions vont être tronquées → déclenchement dégradé.");
console.log("");
if (!problemes.length) {
  console.log("Aucun problème détecté.");
} else {
  for (const g of ["haute", "moyenne"]) {
    const l = problemes.filter((p) => p.gravite === g);
    if (!l.length) continue;
    console.log(`— gravité ${g} (${l.length}) —`);
    for (const p of l) console.log(`  ${p.skill} : ${p.souci}`);
    console.log("");
  }
}
