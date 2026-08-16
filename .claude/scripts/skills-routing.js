#!/usr/bin/env node
/**
 * skills-routing.js — test de non-régression du DÉCLENCHEMENT des skills.
 *
 * Benjamin ne doit jamais avoir à connaître le nom du skill à utiliser : il écrit
 * son intention en français, le bon skill doit se sélectionner seul. Ce qui rend
 * la sélection possible, c'est la `description` — et une description se dégrade
 * silencieusement dès qu'on la réécrit sans y penser.
 *
 * Ce test rejoue des intentions RÉELLES et vérifie que le skill attendu arrive en
 * tête au recouvrement de vocabulaire.
 *
 * ⚠️ Portée honnête : c'est un PROXY lexical, pas la sélection du modèle (qui
 * comprend le sens, pas seulement les mots). Un test vert ne prouve pas que le
 * routage est parfait ; un test ROUGE prouve qu'une description a perdu le
 * vocabulaire par lequel Benjamin désigne la chose — ça, c'est toujours un bug.
 *
 *   node .claude/scripts/skills-routing.js
 */

const fs = require("fs");
const path = require("path");

/** SKILLS_DIR permet de pointer une copie — indispensable pour vérifier que ce
 *  test sait ROUGIR (un test qui ne peut pas échouer ne prouve rien). */
const RACINE = process.env.SKILLS_DIR || path.join(__dirname, "..", "skills");

/** Intentions telles que Benjamin les formule réellement → skill attendu. */
const CAS = [
  ["il y a un bug, le fil s'affiche pas, debug ça", "diag"],
  ["déploie en prod", "ship"],
  ["lance les tests, vérifie que rien n'est cassé", "test"],
  ["ajoute une colonne à la table posts", "migration"],
  ["quelles colonnes a la table conv_messages ?", "schema"],
  ["vérifie les droits, qui peut voir quoi", "rls-audit"],
  ["cet écran est moche, refais le design", "design"],
  ["l'app rame, c'est lent", "perf"],
  ["les messages n'arrivent pas en direct", "realtime"],
  ["la vidéo uploadée ne s'affiche pas", "storage"],
  ["vérifie l'échappement, injection XSS", "xss-audit"],
  ["relis mon code avant de pousser", "review"],
  ["je bosse en parallèle sur plusieurs sessions, ne mélange pas", "passio-multi-session"],
  ["montre-moi dans le navigateur que ça marche", "preview"],
  ["y a des erreurs en prod ?", "prod-errors"],
  ["les gens reviennent pas, churn", "retention"],
  ["faire venir des gens, viralité, parrainage", "growth"],
  ["combien d'utilisateurs actifs, métriques", "kpi"],
  ["améliore l'ordre des posts dans le fil", "feed-tuning"],
  ["traiter les signalements, contenu abusif", "moderation"],
  ["l'installation PWA et le hors-ligne", "pwa"],
  ["contraste et lisibilité, accessibilité", "a11y"],
  ["ajoute un panneau au dashboard", "dashboard-widget"],
  ["instrumente cette action, mesure-la", "telemetry-event"],
  ["écris un test pour couvrir ça", "new-test"],
  // Depuis le 2026-08-16 le canal (/chatgpt) et le protocole d'audit
  // (/revue-croisee) sont deux skills distinctes : le routage doit les séparer.
  ["demande à ChatGPT ce qu'il en pense, second avis", "chatgpt"],
  ["analyse croisée complète, audit à double regard avant jalon", "revue-croisee"],
  ["fais-en un skill, capitalise ça", "skill-optimizer"],
  ["range les skills, audite ma bibliothèque", "skill-optimizer"],
];

const VIDES = new Set(
  ("de des du la le les un une et ou a à au aux en dans pour par sur avec sans que qui " +
   "quoi dont ce cette ces mon ma mes son sa ses est sont être avoir fais fait ça cela " +
   "y il elle on nous vous plus moins tout toute tous très bien mal pas ne me te se " +
   "utiliser quand benjamin dit veut passio skill niveau vérifie montre ajoute lance").split(/\s+/)
);

const mots = (s) =>
  new Set(
    s.toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((m) => m.length > 2 && !VIDES.has(m))
  );

const skills = fs
  .readdirSync(RACINE)
  .map((nom) => {
    const p = path.join(RACINE, nom, "SKILL.md");
    if (!fs.existsSync(p)) return null;
    const t = fs.readFileSync(p, "utf8");
    const d = (/^description:\s*(.*)$/m.exec(t) || [, ""])[1];
    return { nom, mots: mots(d + " " + nom.replace(/-/g, " ")) };
  })
  .filter(Boolean);

let echecs = 0;
const details = [];

for (const [intention, attendu] of CAS) {
  const mi = mots(intention);
  const scores = skills
    .map((s) => ({ nom: s.nom, score: [...mi].filter((m) => s.mots.has(m)).length }))
    .sort((a, b) => b.score - a.score);

  const top = scores[0];
  const rang = scores.findIndex((s) => s.nom === attendu) + 1;
  const scoreAttendu = scores.find((s) => s.nom === attendu);

  if (!scoreAttendu || scoreAttendu.score === 0) {
    echecs++;
    details.push(`  ✗ « ${intention} »\n      → « ${attendu} » ne partage AUCUN mot : il ne se déclenchera pas.`);
  } else if (top.nom !== attendu && top.score > scoreAttendu.score) {
    echecs++;
    details.push(
      `  ✗ « ${intention} »\n      → attendu « ${attendu} » (rang ${rang}, ${scoreAttendu.score}), devancé par « ${top.nom} » (${top.score}).`
    );
  }
}

console.log(`Routage : ${CAS.length - echecs}/${CAS.length} intentions dirigées vers le bon skill.`);
if (echecs) {
  console.log("");
  details.forEach((d) => console.log(d));
  console.log("\nCorriger la description du skill attendu (y remettre les mots que Benjamin emploie).");
  process.exit(1);
}
