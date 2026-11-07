// ═══════════════════════════════════════════════════════════════════════════
// GARDES DU WORKER IA (audit de sécurité du 2026-11-06, F-03). Sans effet de bord : éprouvables.
//
// Le worker lance un agent sur le poste à partir d'une branche `ai/request/*` d'un dépôt PUBLIC.
// Pousser une branche servait à la fois de transport et d'autorisation : tout jeton capable
// d'écrire dans le dépôt, y compris celui d'un job CI lancé par une issue, exécutait des
// instructions sur le poste, sans sandbox. Trois verrous :
//   1. ADHÉSION : `PASSIO_AI_WORKER` absent = worker inactif ;
//   2. SIGNATURE : le dernier commit de la demande doit être signé par une clé SSH listée dans
//      `.passio/ai-worker/signataires`, fichier hors dépôt. `sans-signature` lève ce verrou,
//      en connaissance de cause : c'est le seul mode compatible avec un commit fait par le
//      connecteur GitHub de ChatGPT, qu'aucune clé locale ne signe ;
//   3. CONFINEMENT : liste blanche d'outils, sans shell ni MCP, et écriture limitée au worktree.
//      `--safe-mode` retire aussi les hooks, qui s'exécuteraient depuis ce même worktree.
// ═══════════════════════════════════════════════════════════════════════════

/** `on` | `sans-signature` | `off`. Toute autre valeur vaut `off`. */
export function modeWorker(valeur) {
  const v = String(valeur || "").trim().toLowerCase();
  return v === "on" || v === "sans-signature" ? v : "off";
}

export const OUTILS_AGENT = "Read,Grep,Glob,Edit,Write";

export function argsClaude(modele, maxTours) {
  return [
    "-p", "--output-format", "json", "--model", modele,
    "--max-turns", String(maxTours), "--no-session-persistence",
    "--safe-mode", "--strict-mcp-config", "--no-chrome",
    "--permission-mode", "acceptEdits", "--tools", OUTILS_AGENT,
  ];
}

/**
 * Ce que le résultat d'une demande n'a pas le droit de toucher. `scripts/` en fait partie parce
 * que le worker EXÉCUTE ensuite `scripts/dossier-revue.js` et `scripts/chatgpt.js` depuis ce
 * worktree : les laisser modifiables rendrait au modèle le shell qu'on vient de lui retirer.
 */
export const CHEMIN_INTERDIT = /(^|\/)(?:\.env(?:\.|$)|settings\.local\.json$)|^\.passio\/|^node_modules\/|^\.github\/|^\.claude\/|^\.githooks\/|^migrations\/|^supabase\/|^netlify\/|^scripts\/|^package(?:-lock)?\.json$|^playwright\.config\.js$|^render\.yaml$|^tests\/ci\/|^tests\/e2e\/(?:authz-critical\.spec|compte-e2e|global-teardown|cible-supabase|gate-helper)\.js$|^dashboard\/aiworker|^dashboard\/supervise/i;
