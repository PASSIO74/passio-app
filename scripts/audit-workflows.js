#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DES WORKFLOWS — ce qui ne doit pas revenir dans .github/workflows (audit de sécurité 2026-11-06).
//
// Gate statique, sans réseau, inscrit dans `npm run verif`. Chaque règle a un résultat réel derrière :
//   · un outil non figé qui écrit ce qui part en production (`npx --yes`, `npm install --no-save`) ;
//   · une action sans SHA, ou un binaire en `version: latest`, qui reçoit un secret ;
//   · du texte d'un événement interpolé dans un `run:` (injection shell : edge-functions.yml) ;
//   · un jeton personnel dans une étape qui exécute le code du dépôt, dans le job de l'agent :
//     l'agent venait d'y écrire, et `node scripts/…` lançait ce qu'il avait laissé (E-02) ;
//   · une auto-fusion dans le canal de l'agent : du texte d'un inconnu jusqu'à la production (E-01) ;
//   · un shell de l'agent CI sur `git log`, `git diff`, `git show` (`--output=` écrit un fichier).
//
// Résoudre un refus : corriger le workflow. Une action nouvelle s'épingle par SHA, l'étiquette en
// commentaire : `gh api repos/<action>/git/ref/tags/<tag>`. Aucune exception n'est prévue ici.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const DOSSIER = path.join(__dirname, "..", ".github", "workflows");

/** Règles sur un texte de workflow : rend la liste des défauts, sans lire le disque. */
function auditerWorkflow(nom, texte) {
  const defauts = [];
  const lignes = texte.split(/\r?\n/);
  lignes.forEach((brute, i) => {
    if (/^\s*#/.test(brute)) return;
    const l = brute.replace(/\s+#.*$/, "");
    const ou = `${nom}:${i + 1}`;
    if (/npx --yes\b/.test(l)) defauts.push(`${ou} : \`npx --yes\` installe la dernière version publiée`);
    if (/npm install --no-save\b/.test(l)) defauts.push(`${ou} : \`npm install --no-save\` ignore le lockfile`);
    if (/^\s*version:\s*latest\b/.test(l)) defauts.push(`${ou} : \`version: latest\` n'est pas figé`);
    const m = /^\s*(?:-\s*)?uses:\s*([^\s]+)/.exec(l);
    if (m && !m[1].startsWith("./") && !/@[0-9a-f]{40}$/.test(m[1])) defauts.push(`${ou} : action non épinglée par SHA (${m[1]})`);
  });

  // Une interpolation d'événement ne doit jamais entrer dans le texte d'un `run:`.
  let enRun = null;
  lignes.forEach((brute, i) => {
    const indent = brute.length - brute.trimStart().length;
    if (enRun !== null && brute.trim() && indent <= enRun) enRun = null;
    if (enRun !== null && !/^\s*#/.test(brute)) {
      const m = /\$\{\{\s*(github\.event\.(?!number\b)[^}]*?|github\.head_ref)\s*\}\}/.exec(brute);
      if (m && !/\.number\b|\.id\b/.test(m[1])) defauts.push(`${nom}:${i + 1} : \`${m[1].trim()}\` interpolé dans un run: (passer par env:)`);
    }
    const r = /^(\s*)(?:-\s*)?run:\s*[|>]/.exec(brute);
    if (r) enRun = r[1].length;
  });
  return defauts;
}

/** Règles propres au job de l'agent de `claude-code.yml`. */
function auditerCanalAgent(texte) {
  const defauts = [];
  const iPublier = texte.indexOf("id: publier");
  if (iPublier < 0) return ["claude-code.yml : marche `publier` introuvable"];
  const finEnv = texte.indexOf("        run: |", iPublier);
  const envPublier = texte.slice(iPublier, finEnv).split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
  if (/secrets\.SENTINELLE_TOKEN/.test(envPublier)) defauts.push("claude-code.yml : `publier` porte un jeton personnel et exécute scripts/ dans le runner de l'agent (E-02)");
  if (!/JETON_PERSONNEL:\s*non\b/.test(envPublier)) defauts.push("claude-code.yml : `publier` doit rester sans jeton personnel, donc sans auto-fusion (E-01)");
  const tools = /--allowedTools "([^"]*)"/.exec(texte);
  if (!tools) defauts.push("claude-code.yml : liste --allowedTools introuvable");
  else for (const interdit of ["git log", "git diff", "git show", "git remote", "gh issue", "gh pr", "cat:", "git commit:", "Write,", "Edit,"]) {
    if (tools[1].includes(interdit)) defauts.push(`claude-code.yml : l'agent CI ne doit pas avoir \`${interdit}\` (E-03)`);
  }
  if (!/git clean -fdxq/.test(texte)) defauts.push("claude-code.yml : les audits doivent tourner sur un arbre remis au commit contrôlé (E-02)");
  return defauts;
}

function auditerDepot(dossier = DOSSIER) {
  const fichiers = fs.readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f));
  const defauts = [];
  for (const f of fichiers) {
    const t = fs.readFileSync(path.join(dossier, f), "utf8");
    defauts.push(...auditerWorkflow(f, t));
    if (f === "claude-code.yml") defauts.push(...auditerCanalAgent(t));
  }
  return { defauts, fichiers };
}

if (require.main === module) {
  const { defauts, fichiers } = auditerDepot();
  if (defauts.length) {
    console.error(`✗ audit-workflows : ${defauts.length} défaut(s)\n` + defauts.map((d) => "  " + d).join("\n"));
    process.exit(1);
  }
  console.log(`✓ audit-workflows : ${fichiers.length} workflows, aucune action flottante, aucune injection, canal de l'agent sans jeton personnel`);
}

module.exports = { auditerWorkflow, auditerCanalAgent, auditerDepot };
