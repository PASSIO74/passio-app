# Pourquoi la réinjection — étape 7

## Les deux pièges de vérification du 2026-08-16

Ce jour-là, deux pièges ont fait croire à un **succès** là où il n'y en avait pas :

1. un test qui recopiait les deux lignes du correctif qu'il était censé garder — il serait resté vert après suppression du correctif ;
2. une couverture V8 additionnée à plat qui annonçait 100 %.

Ces pièges-là ne se signalent jamais seuls. D'où l'étape non négociable du workflow : **remettre le défaut, voir le test redevenir rouge.** Un test qui ne rougit pas sans le correctif ne garde rien.

## La procédure, en détail

```bash
# 1. le test est vert avec le correctif
npx playwright test tests/e2e/<spec>.spec.js

# 2. retirer le correctif (édition manuelle, ou git stash du seul hunk)
# 3. relancer : le test DOIT être rouge
npx playwright test tests/e2e/<spec>.spec.js

# 4. remettre le correctif, revérifier le vert
```

**Si le test reste vert sans le correctif, le test est creux.** Le réécrire — il ne garde rien.

Écrire dans le rapport le **résultat des deux exécutions**, pas seulement du vert final.

## Limite de l'outillage

`npm run audit:tests` attrape une partie de ces cas en CI, pas tous. La réinjection manuelle reste la seule preuve complète.
