---
name: passio-multi-session
description: "Sessions Claude Code en parallèle : périmètre déclaré, commit borné. Dire : je bosse en parallèle."
---

# /passio-multi-session — Une session, un périmètre, un commit

Deux sessions Claude Code sur ce dossier partagent quatre ressources qui n'ont
**aucune notion de session**. Chacune mélange les travaux différemment.

| Ressource partagée | Ce qui se mélange | Preuve dans le dépôt |
|---|---|---|
| `.git/index` | le hook `PostToolUse` fait `git add <fichier>` à chaque édition des **deux** sessions ; un `git commit` sans pathspec emporte le travail de l'autre | incident du 2026-07-21, 3 commits mêlant CDV et IRL ([stage-edited-file.js](.claude/stage-edited-file.js)) |
| Port **8080** | `reuseExistingServer: true` → Playwright réutilise le serveur DE L'AUTRE session : tes tests mesurent **ses octets**, vert ou rouge sur le mauvais code, sans un mot | [playwright.config.js:36](playwright.config.js:36) |
| Prod Supabase | `global-teardown` purge **tous** les comptes `%@passio-e2e.test` : ta fin de suite supprime les comptes d'une suite encore en cours ailleurs | [tests/e2e/global-teardown.js](tests/e2e/global-teardown.js) |
| `.passio/`, `MEMORY.md`, `dashboard/data/` | dernier écrivain gagne, en silence | hazard vécu sur `.passio/context/` |

Le plus dangereux est le n°2 : les trois autres finissent par se voir, celui-là
produit un **résultat de test faux** qu'on croit vrai.

## Protocole

### 1. À l'ouverture — déclarer le périmètre

```bash
node .claude/scripts/session-registre.js ouvrir --sujet "ce que je fais" --fichiers "js/app-04.js,styles.css"
```

Le registre (local, hors git) affiche les autres sessions actives, leur
périmètre, et **les risques de mélange déjà présents**. Ajouter un fichier
découvert en cours de route : `… fichiers js/app-05.js`.

Si le périmètre croise celui d'une autre session : ne pas négocier au jugé —
**passer en worktree isolé** (`EnterWorktree`, ou `git worktree add`). C'est la
seule isolation qui vaut pour un même fichier ; le reste n'est que de la
discipline.

### 2. Pendant — ne jamais supposer que les ressources sont à soi

- **Serveur** : avant `npm test`, vérifier le port 8080. Occupé par une autre
  session → servir ailleurs (`http-server -p 8090 .` + `--base-url`) ou attendre.
  Un `npm test` lancé sur le serveur d'autrui **ne prouve rien**.
- **e2e multi-comptes** (`PASSIO_E2E_MULTI=1`) : une seule session à la fois. La
  purge finale est globale.
- **Pilotage** : un seul serveur sur 4610 (`dashboard/data/` est partagé).
- **Documents partagés** (`.passio/*`, `MEMORY.md`, `CLAUDE.md`) : relire juste
  avant d'écrire, et écrire par `Edit` ciblé — jamais un `Write` qui réécrit tout
  un fichier lu il y a dix minutes.

### 3. Au commit — pathspec obligatoire

```bash
node .claude/scripts/session-registre.js commiter -m "feat(x): …"
```

Elle exécute `git commit -- <périmètre déclaré>` : le travail indexé par l'autre
session **reste indexé mais n'entre pas dans le commit**. Message multi-lignes :
`-F fichier` (jamais la here-string `@'…'@`).

Ne jamais utiliser `git commit -a`, `git add -A`, `git add .`, `git stash`,
`git checkout -- .`, `git reset --hard` : tous portent sur l'arbre entier, donc
sur le travail d'autrui. `git stash` est le pire — il **retire** silencieusement
les modifications non committées de l'autre session.

### 4. À la fermeture

```bash
node .claude/scripts/session-registre.js fermer
```

## Réflexes

- L'état à tout moment : `node .claude/scripts/session-registre.js etat`.
- Un fichier modifié que je n'ai pas touché = une autre session travaille.
  Ne pas le « corriger », ne pas le committer, ne pas le restaurer.
- Un test qui échoue sur du code que je n'ai pas écrit : suspecter le port 8080
  avant de suspecter le code.
- Rapporter à Benjamin ce que j'ai laissé de côté parce que c'était à quelqu'un
  d'autre — c'est son arbitrage, pas le mien.

Détail des cas limites, récupération d'un commit déjà mélangé, et mise en place
d'un worktree : `references/procedures.md`.
