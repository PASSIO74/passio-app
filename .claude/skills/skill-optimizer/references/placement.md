# Où placer un comportement réutilisable

Référence chargée à la demande. Le tableau de décision est dans SKILL.md ; ici le
détail, les mécanismes exacts et les pièges constatés sur cette machine.

## Les sept emplacements

### 1. Réglages utilisateur — `~/.claude/settings.json`
Pour ce qui vaut dans **tous** les projets : mode de permissions par défaut,
plugins, budget de listing des skills, `skillOverrides`, deny globaux.
Portée maximale, coût de contexte nul (ce n'est pas du prompt).

⚠ Certaines clés sensibles ne sont honorées **que** depuis les réglages
utilisateur / managed / `--settings` — jamais depuis un fichier de projet
(`sandbox.network.strictAllowlist`, `sandbox.filesystem.disabled`,
`credentials.*`, `footerLinksRegexes`…). Un fichier versionné dans un dépôt ne
doit pas pouvoir s'auto-accorder des droits : c'est délibéré. Si un réglage
« ne prend pas » depuis `.claude/settings.json`, vérifier d'abord cette liste.

### 2. Instructions projet — `CLAUDE.md`
Conventions, invariants, architecture. Chargé dans **chaque** conversation du
projet → chaque ligne se paie à chaque tour. N'y mettre que ce qui est vrai
partout dans le projet et court. Le détail va dans `docs/` et n'est lu qu'au besoin
(c'est ce qui a fait passer CLAUDE.md de 110 Ko à 18 Ko le 2026-08-07).

### 3. Skill — `.claude/skills/<nom>/SKILL.md`
Un workflow spécialisé, chargé **uniquement quand son déclencheur matche**.
C'est le mécanisme de *progressive disclosure* : seule la `description` (~300
caractères) reste en contexte en permanence ; le corps n'est lu qu'à l'invocation.

Coût réel : `description` × nombre de skills, plafonné par
`skillListingBudgetFraction`. Au-delà du plafond, les descriptions sont
**tronquées silencieusement** → déclenchement dégradé sans message d'erreur.
`skills-lint.js` surveille ce seuil.

### 4. Référence — `.claude/skills/<nom>/references/*.md`
Connaissance volumineuse et occasionnelle. Coût de contexte **nul** tant que le
modèle ne l'ouvre pas. Dès qu'un SKILL.md dépasse ~6 Ko, le volume descend ici.

### 5. Script — `.claude/scripts/*.js`
Toute procédure **déterministe**. Un script remplace des milliers de tokens de
raisonnement ré-expliqué, et il est *fiable* : il donne le même résultat à chaque
fois. Règle : si l'étape peut être calculée, elle ne doit pas être raisonnée.

Exemples en place : `compact-permissions.js` (hygiène de l'allowlist),
`skills-lint.js` (audit de la bibliothèque), `garde-commandes.js` (détection du
destructif), `stage-edited-file.js` (indexation git).

### 6. Hook — `.claude/settings.json` → `hooks`
Une action déclenchée par un **évènement**, pas par une intention. Ni la mémoire
ni une préférence ne peuvent le faire : le harnais exécute les hooks, pas le modèle.

Évènements utiles ici : `PreToolUse` (garde-fou avant exécution),
`PostToolUse` (indexation, formatage), `SessionStart` (auto-réparation),
`UserPromptSubmit`, `PreCompact`.

Un hook `PreToolUse` peut renvoyer
`{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask|deny|allow"}}`
— c'est le **seul** mécanisme capable d'inspecter le milieu d'une commande. Une
règle de permission, elle, ne matche qu'un préfixe : elle ne verra jamais le
`&& rm -rf /` en fin de ligne.

### 7. Règle de permission — `permissions.allow` / `deny` / `ask`
Pour supprimer une interruption **répétitive**.

Syntaxe : `Outil(prefixe *)` — préfixe uniquement, le joker est **final**.
`Bash(git *)` matche `git status`, `git commit`… ; `Bash(npm test)` ne matche que
la commande exacte.

⚠ Piège majeur constaté le 2026-08-15 : `.claude/settings.local.json` avait
atteint 654 règles / 71 Ko, dont **542 commandes littérales complètes**. Une
règle littérale sur `Bash`/`PowerShell` ne re-matche jamais la commande suivante
— l'allowlist gonflait sans jamais réduire les interruptions, et 9 entrées
contenaient un JWT en clair. Distinction à retenir :

- `Bash(…)` / `PowerShell(…)` → argument = commande **libre** → un littéral est mort-né.
- `Skill(nom)`, `Read(chemin)`, `mcp__serveur__outil` → argument = **identifiant
  stable** → un littéral est parfaitement réutilisable.

`compact-permissions.js` applique cette distinction et tourne au `SessionStart`.

## Architecture retenue : allow large + garde-fou étroit

Élargir les `allow` **et** poser un hook qui refuse le destructif vaut mieux que
des `allow` étroits :

- les `allow` étroits interrompent sur l'ordinaire (`npm test`, `git status`) et
  ratent quand même le dangereux caché en milieu de commande ;
- l'allow large + `garde-commandes.js` ne coûte aucune interruption sur
  l'ordinaire et attrape `rm -rf`, `git push --force`, `DELETE` sans `WHERE`,
  `DROP TABLE`, l'indexation d'un `.env`.

Zéro friction inutile ≠ zéro sécurité.
