#!/usr/bin/env node
/**
 * garde-commandes.js — hook PreToolUse (Bash|PowerShell).
 *
 * Contrepartie indispensable des règles d'allow LARGES : au lieu d'interrompre
 * Benjamin sur `npm test` ou `git status`, on ne l'interrompt QUE sur ce qui est
 * réellement destructif ou irréversible. Une règle d'allow ne sait matcher qu'un
 * PRÉFIXE ; un motif dangereux se cache au MILIEU d'une commande (`… && rm -rf /`,
 * `supabase db query "DROP TABLE …"`). Seul un hook peut le voir. C'est pour ça que
 * la sécurité vit ici et pas dans l'allowlist.
 *
 * Sortie : permissionDecision "deny" (jamais) ou "ask" (confirmer), sinon rien.
 * Un motif inconnu passe : ce garde protège, il ne filtre pas par défaut.
 */

let brut = "";
process.stdin.on("data", (c) => (brut += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    const e = JSON.parse(brut);
    cmd = (e.tool_input && e.tool_input.command) || "";
  } catch {
    process.exit(0); // payload illisible → on ne bloque rien
  }
  if (!cmd) process.exit(0);

  for (const { motif, raison, decision } of REGLES) {
    if (motif.test(cmd)) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: decision,
            permissionDecisionReason: raison,
          },
        })
      );
      process.exit(0);
    }
  }
  process.exit(0);
});

const REGLES = [
  // --- destruction de masse du système de fichiers ---
  {
    motif: /\brm\s+(-[a-zA-Z]*\s+)*-?[a-zA-Z]*[rR][a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*[rR]/,
    raison: "Suppression récursive forcée (rm -rf).",
    decision: "ask",
  },
  {
    motif: /\bRemove-Item\b[^|;&]*-Recurse[^|;&]*-Force|\bRemove-Item\b[^|;&]*-Force[^|;&]*-Recurse/i,
    raison: "Suppression récursive forcée (Remove-Item -Recurse -Force).",
    decision: "ask",
  },
  // --- réécriture d'historique / perte de travail non commité ---
  {
    motif: /\bgit\s+push\b[^|;&]*(--force\b(?!-with-lease)|\s-f\b)/,
    raison: "git push --force : réécrit l'historique distant. main est protégée.",
    decision: "ask",
  },
  {
    motif: /\bgit\s+reset\s+--hard\b/,
    raison: "git reset --hard : jette les modifications non commitées.",
    decision: "ask",
  },
  {
    motif: /\bgit\s+clean\b[^|;&]*-[a-zA-Z]*[dfx]/,
    raison: "git clean : supprime des fichiers non suivis.",
    decision: "ask",
  },
  // --- base de données de PRODUCTION (Supabase est la prod, pas un bac à sable) ---
  {
    motif: /\b(DROP|TRUNCATE)\s+(TABLE|SCHEMA|DATABASE|POLICY)\b/i,
    raison: "DDL destructif sur la base de PRODUCTION.",
    decision: "ask",
  },
  {
    motif: /\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i,
    raison: "DELETE sans WHERE : vide la table en production.",
    decision: "ask",
  },
  {
    motif: /\bUPDATE\s+\w+\s+SET\b(?![\s\S]*\bWHERE\b)/i,
    raison: "UPDATE sans WHERE : réécrit toute la table en production.",
    decision: "ask",
  },
  {
    motif: /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/i,
    raison: "Suppression de colonne en production : perte de données définitive.",
    decision: "ask",
  },
  // --- fuite de secrets ---
  {
    motif: /(cat|type|Get-Content)\s+[^|;&]*\.env\b(?![.\w])|settings\.local\.json[^|;&]*\|\s*(curl|Invoke-)/i,
    raison: "Lecture d'un fichier de secrets vers une sortie potentiellement partagée.",
    decision: "ask",
  },
  {
    motif: /\bgit\s+add\b[^|;&]*(\.env\b|settings\.local\.json)/,
    raison: "Ces fichiers contiennent des clés en clair : ils ne doivent JAMAIS être indexés.",
    decision: "deny",
  },
  // --- irréversible côté plateforme ---
  {
    motif: /\bsupabase\s+projects\s+delete\b|\bgh\s+repo\s+delete\b|\bnetlify\s+sites:delete\b/,
    raison: "Suppression d'une ressource de plateforme : irréversible.",
    decision: "deny",
  },
];
