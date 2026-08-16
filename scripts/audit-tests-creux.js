#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DES TESTS CREUX — un test qui n'exécute jamais le code de production
// ne garde rien, et il ne se signale JAMAIS tout seul.
//
// Vécu le 2026-08-16 : un spec écrit pour garder un correctif du fil RECOPIAIT
// les deux lignes du correctif dans son `page.evaluate` au lieu d'appeler la
// fonction de production. Il passait, et il serait resté vert après retrait de
// la correction. Repéré en relisant, pas en exécutant — d'où ce script.
//
// C'est le pire des pièges de vérification rencontrés : les autres font croire
// à un échec (on cherche, on trouve), celui-ci fait croire à un succès.
//
// MÉTHODE — volontairement grossière, et c'est assumé.
// Pour chaque spec, on relève les identifiants appelés à l'intérieur des
// `page.evaluate` / `waitForFunction` et on les croise avec les fonctions
// réellement définies dans `js/`. Un spec qui n'en touche AUCUNE ne peut, par
// construction, que vérifier ses propres constructions.
//
// Ce que ce script ne prétend PAS faire : mesurer la couverture. Un spec peut
// appeler une fonction de production et rester creux par ailleurs. Il attrape
// le cas franc — celui qui coûte le plus cher parce qu'il est invisible.
//
// Les specs qui pilotent l'UI (clics, remplissage, assertions sur le DOM)
// exercent le code de production sans le nommer : ils sont donc reconnus par
// leurs marqueurs d'interaction, sinon on croulerait sous les faux positifs.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CI = process.argv.includes("--ci");

// ── 1. Les fonctions réellement définies par l'application ──────────────────
const prod = new Set();
for (const f of fs.readdirSync(path.join(ROOT, "js")).filter((x) => x.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) prod.add(m[1]);
  for (const m of src.matchAll(/^window\.([A-Za-z_$][\w$]*)\s*=/gm)) prod.add(m[1]);
}

// Pilotage de l'UI : le code de production est exercé par le navigateur, pas
// nommé par le test. Ces marqueurs valent preuve d'exécution réelle.
const UI = /\.(click|fill|press|tap|selectOption|check|hover|dblclick)\s*\(|getByRole|getByText|locator\s*\(|toHaveText|toBeVisible|waitForSelector/;

// Helpers de test qui DÉMARRENT la vraie application : un spec qui les appelle
// exécute tout le boot, même s'il ne nomme ensuite aucune fonction applicative.
// C'est le cas de `cadrage.spec.js`, qui boote puis mesure du CSS calculé — le
// signaler serait un faux positif, et un outil qui crie au loup finit ignoré.
const BOOT = /\b(bootOnboarded|bootInteractions|signupAnonymous)\s*\(/;

// Specs dont l'objet est un ARTEFACT (build, en-têtes, service worker) et non
// l'application en train de tourner. Légitimement sans code de production.
const ARTEFACTS = new Set(["version-skew.spec.js"]);

// ── 2. Ce que chaque spec touche réellement ─────────────────────────────────
const dir = path.join(ROOT, "tests", "e2e");
const specs = fs.readdirSync(dir).filter((f) => f.endsWith(".spec.js"));
const suspects = [];
let total = 0;

for (const s of specs) {
  const src = fs.readFileSync(path.join(dir, s), "utf8");
  total++;

  if (ARTEFACTS.has(s)) continue;           // vérifie un artefact, pas l'app en marche
  if (UI.test(src)) continue;               // pilote l'UI → exerce la production
  if (BOOT.test(src)) continue;             // démarre la vraie app → l'exerce entièrement

  const touchees = new Set();
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) if (prod.has(m[1])) touchees.add(m[1]);
  // `state`, `conversationsState`… sont des liaisons de script, pas des fonctions :
  // les manipuler prouve aussi qu'on touche à l'application.
  const etat = /\b(state|conversationsState)\s*[.=[]/.test(src);

  if (!touchees.size && !etat) suspects.push({ spec: s, raison: "n'appelle aucune fonction de production et ne pilote pas l'UI" });
}

// ── 3. Rapport ──────────────────────────────────────────────────────────────
console.log(`Specs analysés : ${total} · fonctions de production recensées : ${prod.size}`);
if (!suspects.length) {
  console.log("OK — aucun spec ne vérifie uniquement ses propres constructions.");
  process.exit(0);
}
console.log(`\n⚠️  ${suspects.length} spec(s) à relire :`);
for (const s of suspects) console.log(`   ${s.spec} — ${s.raison}`);
console.log("\nUn spec listé ici n'est pas forcément creux : il peut vérifier un artefact");
console.log("(build, fichier de configuration) sans exécuter l'app. Le vérifier, puis");
console.log("l'inscrire dans l'allowlist du script si c'est légitime.");
process.exit(CI ? 1 : 0);
