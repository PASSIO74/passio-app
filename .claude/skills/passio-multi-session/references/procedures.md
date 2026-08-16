# Procédures — sessions concurrentes sur PASSIO

## 1. Isolation forte : le worktree

À utiliser dès que deux sessions doivent toucher **le même fichier**, ou pour un
chantier long (refonte, migration, expérimentation).

L'outil `EnterWorktree` du harnais le fait proprement (worktree + branche
dédiée, dans `.claude/worktrees/`, ignoré par git). À la main :

```bash
git worktree add ../PASSIO-<sujet> -b travail/<sujet>
```

Ce qu'un worktree isole vraiment : l'arbre de travail, l'index (`.git/index` est
**par worktree**), la branche. Ce qu'il n'isole **pas** :

- les **ports** (8080, 4610) — toujours à répartir ;
- la **prod Supabase** — une seule suite multi-comptes à la fois, quel que soit
  le worktree ;
- `node_modules` — absent du nouveau worktree. Le lier plutôt que réinstaller
  (`repair.js` du pilotage pose une jonction Windows ; `mklink /J`).

Fusion : `git merge travail/<sujet>` depuis le dépôt principal, puis
`git worktree remove ../PASSIO-<sujet>`.

⚠️ **Ne jamais faire de `git checkout` de branche dans le dossier principal**
pendant qu'une autre session y travaille : elle verrait ses fichiers changer sous
ses pieds (incident du 2026-07-21). C'est précisément pourquoi `repair.js` refuse
d'opérer ailleurs que dans un worktree.

## 2. Rattraper un commit déjà mélangé

**Non poussé** — défaire l'assemblage, pas le travail :

```bash
git reset --soft HEAD~1
```

L'arbre de travail est intact, tout revient dans l'index. Recommitter ensuite
avec pathspec (`session-registre.js commiter -m "…"`), puis laisser l'autre
session committer sa part.

**Déjà poussé** — `main` est une branche **protégée** côté GitHub : ni
`--force`, ni réécriture. Le seul recours est un commit de suite :

```bash
git revert --no-commit <sha> -- <les chemins qui n'auraient pas dû partir>
git commit -m "revert(portée): retirer les fichiers d'une autre session du commit <sha court>"
```

Et prévenir Benjamin : un déploiement Netlify a déjà eu lieu avec le mélange.

## 3. Cas limites du registre

- **Session tuée sans `fermer`** : l'entrée est purgée automatiquement dès que
  son PID est mort, ou après 12 h sans signe de vie. Aucun nettoyage manuel.
- **Périmètre non déclaré** : `commiter` refuse de tourner. C'est voulu — sans
  périmètre, la commande n'aurait aucun moyen de borner le commit et vaudrait un
  `git commit -a`.
- **Fichier ajouté hors périmètre** : `commiter` ne l'emporte pas. Le déclarer
  d'abord (`fichiers <chemin>`).
- **Nouveau fichier (non suivi)** : `git commit -- <chemin>` échoue sur un
  fichier jamais indexé. Faire un `git add <chemin>` explicite d'abord — le hook
  `PostToolUse` l'a normalement déjà fait à la création.
- **Le registre est local** (`.claude/sessions/`, ignoré par git) : il décrit
  cette machine, pas le projet. Il n'a pas à être committé ni synchronisé.

## 4. Ce que le registre ne peut pas voir

Une session qui ne s'enregistre pas reste invisible du registre — mais pas de
ses effets. Les trois signaux qui trahissent une session non déclarée :

1. des fichiers indexés que je n'ai pas édités (`git diff --cached --name-only`) ;
2. un port 8080 ou 4610 occupé sans propriétaire déclaré ;
3. un fichier modifié dans `git status` alors que je ne l'ai pas ouvert.

Devant l'un des trois : appliquer le protocole complet malgré tout (commit borné,
serveur sur un autre port). Le registre est une aide, **la discipline du
pathspec est la garantie**.

## 5. Répartition raisonnable entre sessions

Ce qui se parallélise bien : des domaines disjoints (CDV vs IRL vs pilotage), un
audit en lecture seule pendant un développement, la rédaction de documentation.

Ce qui ne se parallélise pas : deux chantiers dans `index.html` ou `styles.css`
(fichiers-monolithes, conflits garantis), deux suites e2e, deux migrations
Supabase, deux `ship`. Pour ces cas : sérialiser, ou worktree + fusion.
