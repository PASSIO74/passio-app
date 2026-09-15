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

## Ce que la barrière ne fait pas

Elle ne remplace pas la revue : elle empêche seulement d'appliquer autre chose
que ce qui a été revu, ailleurs que là où la revue le permettait. Le contrôle
humain de la contre-revue des PR portant une migration reste entier.
