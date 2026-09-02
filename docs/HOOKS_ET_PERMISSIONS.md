# HOOKS_ET_PERMISSIONS

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

## Hooks & permissions (`.claude/settings.json`)

Trois hooks, chacun pour un problème distinct :

| Hook | Script | Rôle |
|---|---|---|
| `PreToolUse` (Bash\|PowerShell) | `.claude/scripts/garde-commandes.js` | seul mécanisme capable de voir le **milieu** d'une commande (`… && rm -rf /`, `DELETE` sans `WHERE`, `DROP TABLE`, `git add .env`). Une règle de permission ne matche qu'un préfixe. |
| `PostToolUse` (Edit\|Write) | `.claude/stage-edited-file.js` | `git add` du seul fichier modifié. |
| `SessionStart` | `.claude/scripts/compact-permissions.js --quiet` | empêche l'allowlist de regonfler (voir ci-dessous). |

**Architecture des permissions : `allow` large + garde-fou étroit.** Des `allow`
étroits interrompent sur l'ordinaire (`npm test`) *et* ratent quand même le
dangereux caché en milieu de ligne. Le couple allow-large + `garde-commandes.js`
donne zéro friction sur l'ordinaire et attrape le destructif réel.

⚠️ **Piège mesuré le 2026-08-15** : `settings.local.json` avait atteint 654 règles /
71 Ko, dont **542 commandes littérales complètes** — inutiles, car sur `Bash`/
`PowerShell` l'argument est une commande *libre* : un littéral ne re-matche jamais
la commande suivante, l'allowlist gonflait sans jamais réduire les interruptions
(9 entrées portaient un JWT en clair). Distinction à garder en tête :
`Skill(nom)`, `Read(chemin)`, `mcp__…` ont un argument **identifiant stable** → un
littéral y est parfaitement réutilisable. `npm run permissions:compact` applique
la règle (70 → 6 Ko) et tourne au `SessionStart`.

**Capitalisation** : quand une procédure se révèle réutilisable, ou quand une
instruction doit être répétée, la transformer en outil durable plutôt qu'en
rappel — skill, script, hook ou règle selon la portée : `/skill-optimizer`
(`npm run skills:lint` pour l'état factuel de la bibliothèque).

---

Le hook `PostToolUse` (Edit|Write) exécute `.claude/stage-edited-file.js`, qui fait **uniquement** `git add <le fichier qui vient d'être modifié>`. Il remplace l'ancien `git add -A && git commit -m "auto: …" && git push origin main`, dangereux à deux titres : ① `git add -A` indexait TOUT le dépôt — quand deux sessions Claude travaillent en parallèle sur ce dossier, chacune ramassait les fichiers en cours de l'autre (le 2026-07-21, trois commits ont mélangé des travaux CDV et IRL distincts) ; ② le `push origin main` **déployait en production à chaque frappe**, seul le garde `commit-msg` (qui refuse les messages « auto: ») l'empêchant — une protection fragile et non intentionnelle. Le script ignore silencieusement tout fichier hors dépôt (scratchpad) et tout payload illisible. **Committer et pousser restent des gestes explicites.**

⚠️ **Une session démarrée AVANT ce correctif tourne encore avec l'ancienne configuration** (les réglages sont lus au démarrage) : elle continuera à faire `git add -A` jusqu'à sa relance. Le filet de dernier recours reste `.git/hooks/commit-msg` (**local, non versionné**), qui refuse tout message de commit commençant par « auto: » — il ne testait que la chaîne exacte « auto: mise à jour app », il couvre désormais toutes les variantes. Conséquence pratique tant qu'une vieille session tourne : **committer son propre travail au fil de l'eau** plutôt que de laisser des fichiers modifiés en attente, sinon ils partent dans le commit de l'autre session.

### Sessions concurrentes (skill `/passio-multi-session`, 2026-08-16)

L'index git n'est que le premier des quatre biens partagés entre deux sessions Claude Code lancées sur ce dossier. Les trois autres : le **port 8080** — `playwright.config.js` a `reuseExistingServer: true`, donc une suite de tests réutilise le serveur de l'AUTRE session et mesure ses octets, vert ou rouge sur le mauvais code sans un mot ; la **prod Supabase** — `global-teardown` purge *tous* les comptes `%@passio-e2e.test`, la fin de suite de l'un supprimant les comptes d'une suite encore en cours ailleurs ; et les **documents partagés** (`.passio/*`, `MEMORY.md`, `dashboard/data/`) où le dernier écrivain gagne. `npm run sessions` (`.claude/scripts/session-registre.js`, registre local hors git) déclare un périmètre de fichiers, montre les autres sessions actives et les collisions présentes, et fournit `commiter` = `git commit -- <périmètre>` : le travail indexé par autrui reste indexé mais **n'entre pas dans le commit**. Interdits tant que deux sessions partagent un worktree : `git commit -a`, `git add -A/.`, `git stash`, `git reset --hard`, `git checkout -- .`. Isolation forte pour un même fichier = **worktree** (`EnterWorktree`), qui isole l'arbre, l'index et la branche — mais ni les ports, ni la prod.
