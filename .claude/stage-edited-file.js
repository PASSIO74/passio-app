#!/usr/bin/env node
/**
 * Hook PostToolUse (Edit|Write) — indexe UNIQUEMENT le fichier qui vient d'être
 * modifié.
 *
 * Pourquoi ce script existe
 * -------------------------
 * L'ancien hook faisait :
 *     git add -A && git commit -m "auto: …" && git push origin main
 *
 * Deux problèmes graves :
 *  1. `git add -A` indexe TOUT le dépôt. Quand deux sessions Claude travaillent
 *     en parallèle sur ce dossier, chacune ramasse les fichiers en cours de
 *     l'autre — le 2026-07-21, trois commits ont ainsi mélangé les travaux CDV
 *     et IRL de deux sessions distinctes.
 *  2. Le `git push origin main` déployait en PRODUCTION à chaque frappe (le
 *     dépôt est branché sur un pipeline Netlify). Seul le garde `commit-msg`,
 *     qui refuse les messages « auto: », empêchait aujourd'hui des dizaines de
 *     déploiements par session — une protection fragile et non intentionnelle.
 *
 * Ce script ne fait donc QUE `git add <le fichier édité>` : le travail reste
 * prêt à être committé, sans jamais toucher aux fichiers d'une autre session ni
 * publier quoi que ce soit. Le commit et le push restent des gestes explicites.
 *
 * Entrée : le JSON du hook sur stdin ({ tool_input: { file_path }, … }).
 * Sortie : rien. Toute erreur est avalée — un hook ne doit jamais casser une
 * édition (fichier hors dépôt, chemin exotique, git indisponible…).
 */
"use strict";

const { execFile } = require("child_process");
const path = require("path");

const REPO = path.resolve(__dirname, "..");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { raw += d; });
process.stdin.on("end", () => {
  let file = "";
  try {
    const j = JSON.parse(raw);
    file = (j.tool_response && j.tool_response.filePath)
      || (j.tool_input && j.tool_input.file_path)
      || "";
  } catch (e) { /* payload illisible → on ne fait rien */ }

  if (!file) return;

  // Ne jamais sortir du dépôt (scratchpad, fichiers temporaires, autres projets).
  const abs = path.resolve(file);
  const rel = path.relative(REPO, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;

  execFile("git", ["-C", REPO, "add", "--", abs], () => { /* silencieux */ });
});
