# Attestations de revue préalable des migrations — ASTRA-33

`scripts/appliquer-migration.mjs` refuse d'écrire sur une **cible protégée**
(`njkiyoklssvefstljemx` = production, `fcksxofaelcdmmifnwjo` = staging de la CI)
tant que le contenu EXACT du fichier n'est pas attesté ici.

## Ce qu'une entrée dit, et ce qu'elle ne dit pas

```json
{
  "fichier":   "migrations/migration_xxx.sql",
  "empreinte": "<sha256 du fichier, fins de ligne normalisées en \\n>",
  "cibles":    ["fcksxofaelcdmmifnwjo"],
  "pr":        "#451",
  "relecteur": "<qui a relu le contenu exact>",
  "revue_le":  "2026-09-15",
  "source":    "<où lire la revue : URL de la revue, dossier .passio/reviews/…>"
}
```

- l'empreinte porte sur le **contenu**, pas sur le nom : **toute modification
  après la revue invalide l'attestation du contenu précédent**, et l'outil
  refuse en nommant les deux empreintes. Une revue postérieure ne répare pas
  l'ordre des gestes ;
- une attestation ne vaut **que pour les cibles qu'elle nomme**. Attester pour
  le staging n'attese pas la production ;
- `pr`, `relecteur`, `revue_le` et `source` sont **obligatoires** : une
  attestation sans origine n'atteste rien, et l'outil la refuse.

## Poser une attestation

```bash
node scripts/attester-migration.mjs migrations/<fichier>.sql \
  --cible <ref> --pr '#451' --relecteur '<nom>' --source '<url ou chemin>'
```

L'outil calcule l'empreinte du fichier tel qu'il est sur le disque et REFUSE
d'écraser une attestation existante sans `--remplacer` (une réattestation est un
geste, pas un effet de bord). Il n'applique rien et ne parle à aucun projet.

## Ce qu'une preuve exige depuis ASTRA-61 (16/09/2026)

- une revue GitHub à l'état **`APPROVED`** — un commentaire (`COMMENTED`), même
  conforme dans sa forme, n'approuve rien ; un refus commenté non plus ;
- un relecteur **distinct de l'auteur de la PR** (l'auteur doit être lisible,
  sinon la preuve est non vérifiable) ;
- un relecteur inscrit dans **`relecteurs-autorises.json`** (ce dossier) — la
  liste vide n'autorise personne ; l'ajout d'un compte passe par une PR ;
- le lien au **SHA** (`commit_id` de la revue), au **contenu** (empreinte du
  fichier à ce commit = empreinte envoyée) et à la **cible** (`cible: <ref>`
  dans le corps) est inchangé ;
- un **fournisseur réel** : `gh` du PATH et dépôt `origin`. Les overrides de
  banc (`PASSIO_GH_BIN`, `PASSIO_DEPOT`) sont refusés sur une cible protégée —
  les tests mesurent les refus du CLI et la décision pure, jamais un
  « envoyable » servi par un faux.

**Exception ASTRA-61 bis (21/09/2026, décision de Benjamin).** PASSIO n'a qu'un
compte humain. Pour le seul `mainteneur_unique` de `relecteurs-autorises.json`,
sur sa propre PR, une revue `COMMENTED` est admise (GitHub interdit de
s'approuver soi-même). Son corps doit porter le marqueur « Contre-revue technique
indépendante », la phrase « revue de mainteneur unique : j'assume l'application
de cette migration », le fichier et `cible: <ref>`. L'attestation et le journal
d'application l'inscrivent (`auto_revue_mainteneur_unique: true`). **Ce n'est
pas une revue indépendante, c'est une décision tracée** : AGENTS.md, et
`scripts/lib/barriere-migration.js`. Exemples : les deux attestations de R25
(04/11/2026). Retirer le champ `mainteneur_unique` rétablit la règle stricte.

**Un retour arrière n'a pas de tableau de verdict.** Le bloc `--|` d'une
migration se termine par `commit;` sans requête de contrôle. Envoyé par
`appliquer-migration.mjs`, il serait validé, PUIS l'outil sortirait en code 1
(« aucune ligne de verdict rendue »), et il lui faudrait en plus une attestation
de sa propre empreinte. Il se joue donc à l'éditeur SQL du tableau de bord
(canal ③), puis il se MESURE au canal ① : la migration donne, dans son en-tête,
l'état d'arrivée attendu.

## Appliquer depuis le poste (Windows, PowerShell)

Le script lit le fichier, l'attestation et la revue **dans le clone où il est
lancé** : depuis `C:\Users\BENJAMIN`, `git` et `npm` ne trouvent rien (vécu le
04/11, rien n'est parti). Pour ne toucher ni à la branche du clone ni à une
session qui y travaille, un worktree détaché de `main` (fait le 04/11 pour R24) :

```bash
cd C:/Users/BENJAMIN/Desktop/PASSIO
git fetch origin main
git worktree add --detach C:/Users/BENJAMIN/Desktop/PASSIO-wt/migration-<lot> origin/main
cd C:/Users/BENJAMIN/Desktop/PASSIO-wt/migration-<lot>
node scripts/appliquer-migration.mjs migrations/<fichier>.sql --projet njkiyoklssvefstljemx
```

`node` directement plutôt que `npm run migration:appliquer -- …` : sous
PowerShell, le passage du `--` à npm dépend des versions, et sans `--projet` la
barrière refuse (rien ne part, rien n'est appliqué). Ensuite : mesurer au
canal ①, jamais le tableau ; puis `git worktree remove` du dossier, depuis le clone.

## Éprouver une migration avant la production

Le job « Suites production (comptes réels) » vise le **staging**, jamais la production : le relancer après une application en production ne prouve rien. Pour éprouver une migration en conditions réelles, attester aussi `fcksxofaelcdmmifnwjo` (la revue doit nommer cette cible), l'y appliquer, puis laisser ce job tourner sur la tête de la PR. Fait pour R25 le 04/11. Le staging a dérivé (`docs/STAGING.md`) : un contrôle de publication de son verdict peut y dire ECHEC sans défaut de la migration.

⚠️ **Une migration à prérequis client (règle ④), une fois au staging, y fait rougir toute PR dont la base précède ce client** : la suite teste l'ancien client contre la base migrée. Vécu le 2026-11-04 : deux rouges de `multi-comptes` sur #709, le second sur un run créé 14 minutes après la fusion du client, encore fusionné sur l'ancienne base. Avant de chercher un défaut, lire `HEAD is now at … into <base>` dans le journal du job. Le remède est une relance sur une base à jour ; `gh run rerun` garde la fusion du run d'origine. Appliquer au staging juste avant de fusionner le client, pas avant.

## Ce que la barrière ne fait pas

Elle ne remplace pas la revue : elle empêche seulement d'appliquer autre chose
que ce qui a été revu, ailleurs que là où la revue le permettait. Le contrôle
humain de la contre-revue des PR portant une migration reste entier.
