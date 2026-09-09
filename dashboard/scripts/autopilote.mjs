// ═══════════════════════════════════════════════════════════════════════════
// AUTOPILOTE — interrupteur unique (2026-09-09).
//
// La chaîne « alerte → diagnostic → correctif → vérification → promotion dans
// la branche locale » existait entièrement dans le code, mais restait ÉTEINTE :
// trois variables d'environnement non documentées la commandaient, absentes de
// `.env.example`. Personne ne pouvait donc l'allumer sans lire le code.
//
// Ce script pose (ou retire) ces trois variables dans `dashboard/.env`, et RIEN
// d'autre. Il ne touche à aucune autre clé, ne crée pas de secret, et laisse
// intactes les valeurs existantes non concernées.
//
// ⚠️ CE QU'IL N'OUVRE PAS, ET NE PEUT PAS OUVRIR : le déploiement en
// production. `sentinel-autopilot.js` porte `productionDeploy: false` EN DUR,
// sans interrupteur, et l'exécuteur refuse toute promotion si `config.isProd`.
// L'autopilote s'arrête à la branche locale ; `git push` reste un geste humain.
//
// ⚠️ CE QU'IL FAUT SAVOIR AVANT D'ALLUMER : la promotion fusionne dans le `main`
// LOCAL du dépôt, et revient par `git reset --hard` au SHA d'avant si une suite
// échoue. L'exécuteur refuse de démarrer si l'arbre de travail est sale ou si
// la branche courante n'est pas la cible — mais si tu codes en permanence sur
// `main`, choisis une autre cible (DASH_AUTOPILOT_TARGET_BRANCH).
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(ICI, "..", ".env");

// Les marches de la chaîne. `bascule: true` = ce que l'interrupteur ÉTEINT.
//
// ⚠️ `DASH_ALLOW_MUTATIONS` n'est PAS basculé à l'extinction, et c'est
// délibéré : l'éteindre couperait aussi l'étage ② (écrire le correctif dans un
// worktree isolé et le vérifier). « Autopilote éteint » doit vouloir dire
// « la sentinelle propose un correctif prêt à fusionner », pas « elle
// redevient un observateur muet ». On ne l'ALLUME que dans le sens ON.
export const CLES = [
  { cle: "DASH_ALLOW_MUTATIONS", valeur: "true", bascule: false },      // ② écrire le correctif
  { cle: "DASH_SENTINEL_AUTOPILOT", valeur: "true", bascule: true },    // ③ promotion locale
  { cle: "DASH_SENTINEL_LOCAL_GATE_V2", valeur: "true", bascule: true },// ③ bis barrière de preuves
];

// ④ MISE EN LIGNE AUTOMATIQUE — séparée des trois précédentes À DESSEIN.
// C'est la seule marche dont le résultat est visible par les UTILISATEURS :
// elle mérite un geste distinct, pas d'être emportée par un « active tout ».
export const CLES_PRODUCTION = [
  { cle: "DASH_SENTINEL_PRODUCTION", valeur: "true", bascule: true },
];

/**
 * Pose ou retire les clés dans le TEXTE d'un .env, sans réordonner le reste ni
 * toucher une seule autre ligne. Exporté pour être verrouillé par un test :
 * c'est le SEUL endroit du dépôt qui écrit dans un `.env`.
 */
export function appliquer(texte, actif, cles = CLES) {
  let out = String(texte || "");
  for (const { cle, valeur, bascule } of cles) {
    if (!actif && !bascule) continue;
    const cible = `${cle}=${actif ? valeur : "false"}`;
    const re = new RegExp(`^${cle}=.*$`, "m");
    if (re.test(out)) out = out.replace(re, cible);
    else out = out.replace(/\s*$/, "\n") + cible + "\n";
  }
  return out;
}

function principal() {
  const mode = (process.argv[2] || "on").toLowerCase();
  if (!["on", "off", "etat", "production-on", "production-off"].includes(mode)) {
    console.error("Usage : node scripts/autopilote.mjs [on|off|etat|production-on|production-off]");
    process.exit(2);
  }
  if (!fs.existsSync(ENV_PATH)) {
    console.error("Fichier .env introuvable : " + ENV_PATH);
    console.error("Copie d'abord .env.example en .env, puis relance.");
    process.exit(1);
  }
  const avant = fs.readFileSync(ENV_PATH, "utf8");
  if (mode === "etat") {
    for (const { cle } of [...CLES, ...CLES_PRODUCTION]) {
      const m = avant.match(new RegExp(`^${cle}=(.*)$`, "m"));
      console.log(`  ${cle} = ${m ? m[1].trim() || "(vide)" : "(absente)"}`);
    }
    const jeton = avant.match(/^GITHUB_TOKEN=(.*)$/m);
    // On n'affiche JAMAIS la valeur d'un jeton, seulement s'il est renseigné.
    console.log(`  GITHUB_TOKEN = ${jeton && jeton[1].trim() ? "(renseigne)" : "(VIDE - la mise en ligne auto ne peut pas fonctionner)"}`);
    return;
  }

  if (mode.startsWith("production-")) {
    const actif = mode === "production-on";
    // ⚠️ ON REFUSE D'ARMER UN MODE QUI NE PEUT PAS FONCTIONNER. Sans jeton, la
    // sentinelle se déclarerait active et n'ouvrirait jamais rien : c'est la
    // panne silencieuse que tout ce chantier corrige.
    if (actif && !/^GITHUB_TOKEN=.+$/m.test(avant)) {
      console.error("REFUS : GITHUB_TOKEN est vide dans .env.");
      console.error("La mise en ligne automatique a besoin d'un jeton GitHub (scope repo)");
      console.error("pour ouvrir la PR et armer l'auto-merge. Renseigne-le, puis relance.");
      process.exit(1);
    }
    // La mise en ligne suppose les trois marches precedentes.
    let out = actif ? appliquer(avant, true) : avant;
    out = appliquer(out, actif, CLES_PRODUCTION);
    if (out === avant) { console.log("Rien à changer."); return; }
    fs.writeFileSync(ENV_PATH, out, "utf8");
    console.log(actif
      ? "MISE EN LIGNE AUTOMATIQUE ACTIVE. Les correctifs verifies partiront en PR,\net GitHub fusionnera seul quand toute la CI sera verte."
      : "Mise en ligne automatique DESACTIVEE (l'autopilote local reste tel quel).");
    return;
  }

  const apres = appliquer(avant, mode === "on");
  if (apres === avant) { console.log("Rien à changer."); return; }
  fs.writeFileSync(ENV_PATH, apres, "utf8");
  console.log(mode === "on"
    ? "Autopilote ACTIVE. Redemarre le pilotage pour qu'il prenne effet."
    : "Autopilote DESACTIVE (la sentinelle continue d'analyser et de proposer).");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) principal();
