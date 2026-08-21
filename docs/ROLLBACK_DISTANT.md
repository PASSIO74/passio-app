# Rollback distant PASSIO

Le workflow `.github/workflows/rollback.yml` prépare un retour arrière depuis GitHub Actions, sans ordinateur allumé et sans agent IA.

## Utilisation

1. ouvrir **Actions → Préparer un rollback → Run workflow** ;
2. saisir le SHA du commit de `main` à annuler ;
3. expliquer la raison ;
4. écrire exactement `ROLLBACK`.

Le workflow vérifie que le SHA appartient à `main` et qu'il s'agit d'un commit à parent unique. Il crée ensuite une branche `rollback/<run_id>`, applique `git revert`, pousse uniquement cette branche et ouvre une PR en brouillon.

## Ce qu'il ne fait jamais

- aucune fusion automatique ;
- aucun push direct sur `main` ;
- aucun déploiement ;
- aucun contournement des tests ou de la contre-revue.

Un conflit ou un commit de merge provoque un échec explicite sans publication d'une branche approximative.

## Retour arrière du mécanisme

La suppression ou le revert de `.github/workflows/rollback.yml` retire le mécanisme. Il ne possède aucun état externe.
