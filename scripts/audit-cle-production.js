#!/usr/bin/env node
"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// LA CLÉ DE SERVICE DE LA PRODUCTION N'EST JAMAIS À PORTÉE D'UNE PULL REQUEST
//
// LE DÉFAUT QUI MOTIVE CETTE GATE (EXP-11, mesuré le 2026-09-15). SUP-04 /
// TCI-04 avaient déplacé les suites à comptes réels vers le staging. DEUX
// étapes de `deploy.yml` étaient restées derrière avec
// `secrets.SUPABASE_SERVICE_ROLE_KEY` — la clé de PRODUCTION — et SANS aucune
// condition : elles partaient donc sur chaque pull request. L'une créait deux
// comptes réels en production à chaque poussée d'une branche.
//
// ⚠️ ET LE COMMENTAIRE DISAIT DÉJÀ LE CONTRAIRE : « une fois par déploiement,
// c'est l'exception assumée, pas 48 par jour ». La règle était écrite, comprise,
// et rien ne l'imposait. UN COMMENTAIRE N'EST PAS UNE GARDE — c'est la même
// famille que « la barrière est posée » sans dire QUAND, et que la taille de
// réparation annoncée à la Sentinelle sans être mesurée.
//
// LA PROPRIÉTÉ EXIGÉE. Dans tout workflow déclenché par `pull_request`, chaque
// endroit qui nomme la clé de production doit être conditionné à un `push`
// (ou exclure explicitement les pull requests) — au niveau de l'étape ou du job.
//
// ⚠️ CE QUE CETTE GATE NE VOIT PAS, et ça se dit plutôt que de laisser croire à
// un vert total : elle lit le TEXTE des workflows, pas ce que GitHub exécute.
// Une clé transmise à un workflow appelé (`workflow_call`), reconstruite à
// partir de morceaux, ou lue depuis un `vars.` lui échappent. Elle couvre le
// chemin par lequel le défaut est réellement arrivé : une étape oubliée.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..");
const DOSSIER = path.join(RACINE, ".github", "workflows");

// La clé de PRODUCTION. `STAGING_SERVICE_ROLE_KEY` est un autre secret, et un
// autre projet : la confondre avec celle-ci ferait rougir le correctif SUP-04.
const CLE_PROD = /secrets\.SUPABASE_SERVICE_ROLE_KEY/;
// Les deux formes employées dans le dépôt, et rien d'autre : une condition qui
// ne nomme pas le déclencheur ne prouve pas qu'une pull request est exclue.
const HORS_PR = /github\.event_name\s*(?:==\s*'push'|!=\s*'pull_request')/;

const indentDe = (l) => l.length - l.replace(/^\s*/, "").length;

/** Les workflows du dossier, avec leur texte. */
function workflows() {
  if (!fs.existsSync(DOSSIER)) return [];
  return fs.readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ nom: f, lignes: fs.readFileSync(path.join(DOSSIER, f), "utf8").split("\n") }));
}

/** Un workflow est-il déclenché par une pull request ? */
function declencheParPullRequest(lignes) {
  let dansOn = false;
  for (const l of lignes) {
    if (/^on:\s*$/.test(l)) { dansOn = true; continue; }
    if (dansOn && /^\S/.test(l)) break;            // fin du bloc `on:`
    if (dansOn && /^\s{2}pull_request(_target)?:/.test(l)) return true;
  }
  return false;
}

/**
 * Le bloc qui gouverne la ligne `i` : l'étape qui la contient si elle en a une,
 * sinon le job. Rend les lignes du bloc ET celles de l'en-tête de job, car un
 * `if:` de job couvre toutes ses étapes.
 */
function gouvernance(lignes, i) {
  // L'étape : la plus proche ligne « - name: » / « - uses: » AU-DESSUS, dont
  // l'indentation est strictement inférieure à celle de la ligne visée.
  let debutEtape = -1, indentEtape = -1;
  for (let j = i; j >= 0; j--) {
    const l = lignes[j];
    if (!l.trim()) continue;
    if (/^\s*-\s+(name|uses|run):/.test(l) && indentDe(l) < indentDe(lignes[i])) { debutEtape = j; indentEtape = indentDe(l); break; }
    if (/^\s{2}\S.*:\s*$/.test(l)) break;          // on a atteint l'en-tête de job sans croiser d'étape
  }
  const bloc = [];
  if (debutEtape >= 0) {
    for (let j = debutEtape; j < lignes.length; j++) {
      if (j > debutEtape && lignes[j].trim() && indentDe(lignes[j]) <= indentEtape && /^\s*-\s/.test(lignes[j])) break;
      if (j > debutEtape && lignes[j].trim() && indentDe(lignes[j]) < indentEtape) break;
      bloc.push(lignes[j]);
    }
  }
  // Le job : de son en-tête jusqu'à `steps:`.
  const entete = [];
  for (let j = i; j >= 0; j--) {
    if (/^\s{2}[A-Za-z0-9_-]+:\s*$/.test(lignes[j])) {
      for (let k = j; k < lignes.length && !/^\s*steps:\s*$/.test(lignes[k]); k++) entete.push(lignes[k]);
      break;
    }
  }
  return { bloc, entete };
}

function auditer() {
  const manques = [];
  let occurrences = 0, fichiersPr = 0;
  for (const { nom, lignes } of workflows()) {
    if (!declencheParPullRequest(lignes)) continue;
    fichiersPr++;
    for (let i = 0; i < lignes.length; i++) {
      if (!CLE_PROD.test(lignes[i])) continue;
      if (/^\s*#/.test(lignes[i])) continue;       // un commentaire ne porte aucune clé
      occurrences++;
      const { bloc, entete } = gouvernance(lignes, i);
      const garde = [...bloc, ...entete].some((l) => /^\s*if:/.test(l) && HORS_PR.test(l));
      if (!garde) manques.push({ nom, ligne: i + 1, texte: lignes[i].trim() });
    }
  }
  return { manques, occurrences, fichiersPr };
}

module.exports = { auditer, declencheParPullRequest, gouvernance, CLE_PROD, HORS_PR };

if (require.main === module) {
  const { manques, occurrences, fichiersPr } = auditer();
  console.log(`clé de service PRODUCTION : ${occurrences} emploi(s) dans ${fichiersPr} workflow(s) déclenché(s) par pull request`);
  for (const m of manques) {
    console.error(`❌ ${m.nom}:${m.ligne} emporte la clé de PRODUCTION sans exclure les pull requests.`);
    console.error(`   ${m.texte}`);
    console.error(`   Poser « if: github.event_name == 'push' » sur l'étape (ou sur le job).`);
  }
  if (manques.length) process.exit(1);
  console.log("✅ aucun emploi de la clé de production n'est atteignable depuis une pull request.");
  console.log("ℹ Portée : le TEXTE des workflows. Une clé passée à un workflow appelé, ou reconstruite, échappe à cette gate.");
}
