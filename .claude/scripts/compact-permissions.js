#!/usr/bin/env node
/**
 * compact-permissions.js — garde l'allowlist de permissions UTILE et COURTE.
 *
 * Le problème qu'il corrige (mesuré le 2026-08-15 sur ce dépôt) :
 * `.claude/settings.local.json` avait grossi à 647 règles / 71 Ko, dont 538 étaient
 * des commandes LITTÉRALES complètes (« Bash(node -e "let s='';process.stdin...") »).
 * Une règle littérale ne re-matche JAMAIS la commande suivante, même quasi identique :
 * l'allowlist gonflait à chaque session sans jamais réduire les interruptions.
 * 9 entrées contenaient en clair un JWT / une clé service_role.
 *
 * Une règle n'est gardée que si elle peut encore SERVIR :
 *   - « Outil » seul (WebSearch, PowerShell…)                → gardée
 *   - « Outil(prefixe *) » avec un préfixe court             → gardée
 *   - tout le reste (littéral exact, préfixe à rallonge)     → jetée
 *   - toute entrée portant un secret                         → jetée, toujours
 * Puis on réinjecte le SOCLE : les règles à joker qui couvrent le travail réel.
 *
 * Idempotent : relancer ne change rien. Appelé automatiquement au SessionStart.
 *
 *   node .claude/scripts/compact-permissions.js [--dry] [--quiet] [fichier]
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const QUIET = args.includes("--quiet");
const target =
  args.find((a) => !a.startsWith("--")) ||
  path.join(__dirname, "..", "settings.local.json");

/** Longueur max du préfixe littéral avant le joker. Au-delà, la règle est trop
 *  spécifique pour re-matcher un jour (ex. un message de commit entier). */
const PREFIXE_MAX = 60;

/** Le point fait partie d'un JWT (`header.payload.signature`) : l'exclure de la
 *  classe laissait passer un jeton à en-tête court. Constaté sur fixture le
 *  2026-08-15 — les 9 vrais jetons du dépôt matchaient par chance. */
const SECRET = /eyJhbGciOi[A-Za-z0-9_.\-]{20,}|sb_secret_|service_role|SUPABASE_SERVICE_ROLE|ghp_[A-Za-z0-9]{20,}|sbp_[a-f0-9]{20,}/;

/** Socle : ce que Benjamin fait réellement tous les jours sur PASSIO.
 *  Large volontairement — le garde-fou destructif est le hook PreToolUse
 *  `garde-commandes.js` + la liste `deny`, pas l'étroitesse de ces règles. */
const SOCLE = [
  // --- lecture / navigation dépôt ---
  "Bash(ls *)", "Bash(cat *)", "Bash(head *)", "Bash(tail *)", "Bash(wc *)",
  "Bash(grep *)", "Bash(rg *)", "Bash(find *)", "Bash(sed *)", "Bash(awk *)",
  "Bash(cut *)", "Bash(sort *)", "Bash(uniq *)", "Bash(diff *)", "Bash(echo *)",
  "Bash(which *)", "Bash(file *)", "Bash(stat *)", "Bash(basename *)", "Bash(dirname *)",
  "Bash(mkdir *)", "Bash(cp *)", "Bash(mv *)", "Bash(touch *)", "Bash(true)",
  // --- node / outils du projet ---
  "Bash(node *)", "Bash(npm run *)", "Bash(npm test*)", "Bash(npm ci*)",
  "Bash(npm install*)", "Bash(npm ls*)", "Bash(npm audit*)", "Bash(npx *)",
  // --- git : lecture + écriture locale (le destructif est en deny) ---
  "Bash(git status *)", "Bash(git log *)", "Bash(git diff *)", "Bash(git show *)",
  "Bash(git add *)", "Bash(git commit *)", "Bash(git push *)", "Bash(git pull *)",
  "Bash(git fetch *)", "Bash(git branch *)", "Bash(git checkout *)", "Bash(git switch *)",
  "Bash(git stash *)", "Bash(git rev-parse *)", "Bash(git ls-files *)",
  "Bash(git ls-tree *)", "Bash(git check-ignore *)", "Bash(git config *)",
  "Bash(git blame *)", "Bash(git remote *)", "Bash(git tag *)", "Bash(git worktree *)",
  // --- plateforme ---
  "Bash(gh run *)", "Bash(gh pr *)", "Bash(gh issue *)", "Bash(gh api *)", "Bash(gh auth *)",
  "Bash(supabase db *)", "Bash(supabase projects *)", "Bash(supabase functions *)",
  "Bash(supabase migration *)", "Bash(supabase link *)", "Bash(supabase --version*)",
  // --- vérification prod / CI (lecture seule) ---
  "Bash(curl *)", "Bash(jq *)",
  // --- outils Claude Code : une skill ou une lecture ne doit jamais interrompre ---
  "Skill", "Read", "Glob", "Grep", "WebSearch", "TodoWrite",
  // --- PowerShell : mêmes usages, l'autre shell de la machine ---
  "PowerShell(Get-Content *)", "PowerShell(Get-ChildItem *)", "PowerShell(Select-String *)",
  "PowerShell(Test-Path *)", "PowerShell(Get-Command *)", "PowerShell(Get-Item *)",
  "PowerShell(Measure-Object *)", "PowerShell(Invoke-WebRequest *)",
  "PowerShell(Invoke-RestMethod *)", "PowerShell(node *)", "PowerShell(npm *)",
  "PowerShell(npx *)", "PowerShell(git *)", "PowerShell(gh *)", "PowerShell(supabase *)",
];

/** Seuls Bash/PowerShell prennent une commande LIBRE en argument : c'est là qu'un
 *  littéral est mort-né. Pour Skill(nom), Read(chemin), WebFetch(domain:…), mcp__…,
 *  l'argument est un IDENTIFIANT stable — un littéral y re-matche parfaitement. */
const SHELL = /^(Bash|PowerShell)$/;

function estReutilisable(regle) {
  if (SECRET.test(regle)) return false;
  // « WebSearch », « PowerShell » : outil seul, pas de parenthèses
  if (!/[()]/.test(regle)) return true;
  const m = /^([A-Za-z_][\w-]*)\((.*)\)$/.exec(regle);
  if (!m) return false;
  const [, outil, motif] = m;
  if (!SHELL.test(outil)) return true; // identifiant stable → toujours utile

  if (!motif.endsWith("*")) {
    // Littéral shell : mort, SAUF l'invocation nue et stable (`env`, `printenv`…)
    return /^[\w.\/-]{1,12}$/.test(motif);
  }
  const prefixe = motif.slice(0, -1);
  if (prefixe.length > PREFIXE_MAX) return false; // trop spécifique
  // un préfixe qui contient déjà un guillemet ouvert = fragment de commande unique
  if (/["'][^"']{25,}$/.test(prefixe)) return false;
  return true;
}

function compacter(fichier) {
  if (!fs.existsSync(fichier)) return null;
  let conf;
  try {
    conf = JSON.parse(fs.readFileSync(fichier, "utf8"));
  } catch {
    return null; // fichier illisible : on ne touche à rien
  }
  const avant = conf.permissions && Array.isArray(conf.permissions.allow)
    ? conf.permissions.allow
    : [];
  if (!avant.length) return null;

  const gardees = avant.filter(estReutilisable);
  const secrets = avant.filter((r) => SECRET.test(r)).length;
  const apres = [...new Set([...gardees, ...SOCLE])].sort();

  const stats = {
    fichier,
    avant: avant.length,
    apres: apres.length,
    jetees: avant.length - gardees.length,
    secrets,
    octetsAvant: fs.statSync(fichier).size,
  };

  if (!DRY && apres.length !== avant.length) {
    conf.permissions.allow = apres;
    fs.writeFileSync(fichier, JSON.stringify(conf, null, 2) + "\n", "utf8");
    stats.octetsApres = fs.statSync(fichier).size;
  }
  return stats;
}

const s = compacter(target);
if (!s) process.exit(0);

if (s.jetees === 0) {
  if (!QUIET) console.log(`Permissions déjà compactes : ${s.apres} règles.`);
  process.exit(0);
}
if (QUIET) {
  // Sortie hook : une ligne visible par Benjamin, rien de plus.
  console.log(JSON.stringify({
    systemMessage: `Permissions compactées : ${s.avant} → ${s.apres} règles (${s.jetees} littérales jetées${s.secrets ? `, ${s.secrets} porteuses de secret` : ""}).`,
    suppressOutput: true,
  }));
} else {
  console.log(`${s.fichier}`);
  console.log(`  règles      : ${s.avant} → ${s.apres}`);
  console.log(`  jetées      : ${s.jetees} (littérales, non ré-utilisables)`);
  console.log(`  secrets     : ${s.secrets} entrée(s) purgée(s)`);
  console.log(`  taille      : ${Math.round(s.octetsAvant / 1024)} Ko → ${Math.round((s.octetsApres || s.octetsAvant) / 1024)} Ko`);
  if (DRY) console.log("  (--dry : rien n'a été écrit)");
}
