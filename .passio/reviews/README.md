# Revue indépendante par un second modèle

Protocole adopté le 2026-08-13. Objectif : faire relire les **changements à risque** par un
modèle indépendant, sans jamais lui donner d'accès au dépôt, à la branche `main` ni à la
production.

## Répartition des rôles

| | Agent principal (Claude Code) | Relecteur indépendant (2ᵉ modèle) |
| --- | --- | --- |
| Dépôt git | écriture | **aucun accès** |
| Branche `main` | commit / push | **aucun accès** |
| Supabase prod | lecture + migrations | **aucun accès** |
| Tests, build, déploiement | exécute | **n'exécute rien** |
| Rôle | conçoit, implémente, teste, livre | **lecture seule** : cherche les effets de bord, failles, tests manquants, incohérences |
| Décision de fusion | tranche après examen des remarques | ne décide pas |

Une remarque du relecteur n'est **jamais appliquée telle quelle** : elle est examinée, vérifiée
contre le code réel et les conventions, puis retenue ou écartée avec une raison.

## Quand déclencher une revue

Systématiquement pour un changement qui touche :

- l'authentification, l'identité, l'isolation entre comptes ;
- les policies RLS ou une migration Supabase ;
- l'affichage de contenu produit par un autre utilisateur (surface XSS) ;
- le stockage ou la transmission de données personnelles ;
- le paiement, la modération, les signalements.

Inutile pour du CSS, un libellé, un ajustement local sans effet transverse.

## Générer le dossier

```bash
npm run revue -- --titre "Ce que fait le changement" --tests
```

Options : `--spec <fichier.md>` pour joindre une spécification déjà écrite, `--base <ref>` pour
choisir la référence de comparaison, `--sortie <dossier>` pour la destination. Sans `--tests`,
seuls les audits rapides tournent et le dossier le signale explicitement — un dossier sans
Playwright ne vaut pas validation de bout en bout.

Le dossier produit contient la spécification, le diff, **les fichiers concernés en entier**, les
vérifications réellement exécutées avec leurs sorties brutes (échecs compris), les migrations
touchées, les conventions du projet, et les pièges connus détectés mécaniquement dans le diff.

`DOSSIER-COMPLET.md` regroupe le tout en un seul fichier à coller dans le chat du relecteur.

## Ce qui n'est pas dans le dossier

Aucune clé, aucun jeton, aucune donnée de production, aucun contenu utilisateur réel. Le
générateur ne lit que le dépôt. Si un secret apparaît dans un diff, c'est un bug à corriger
dans le code, pas dans le générateur.

Les dossiers générés sont ignorés par git (voir `.gitignore`) : ce sont des photographies
transitoires du code. Seul le générateur, `scripts/dossier-revue.js`, est versionné.
