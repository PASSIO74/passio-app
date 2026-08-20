# PASSIO — Onboarding V2 / Lot 1

Source produit : issue #69 + docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md.

## Règle de départ obligatoire
Avant toute modification, confirme dans le diff/état du dépôt que cette branche part bien de `product/passio-core-simplification-2026-08-20`, elle-même à jour par rapport au `main` observé lors de la préparation. Ne modifie pas `main`.

## Objectif de ce lot
Livrer le premier incrément sûr de l’Onboarding V2 sur la vraie base produit actuelle, sans attendre la refonte visuelle complète.

### À implémenter maintenant
1. Corriger le First Feed : les passions choisies pendant l’onboarding doivent immédiatement alimenter le Feed.
2. Faire de `state.selectedFeedPassions` la source persistante des intérêts Feed et restaurer `_activeFeedPassions` au boot/reload.
3. Découpler intérêts Feed et profils passion : plusieurs passions sélectionnées = plusieurs intérêts Feed, mais un seul profil passion de départ automatique.
4. Ne pas rejouer l’onboarding pour un compte existant correctement configuré.
5. Supprimer du parcours utilisateur V2 toute dépendance au tour investisseur actuel ; aucun Wallet/Passia/CDV/gamification ne doit apparaître dans ce parcours.
6. Ne jamais demander la géolocalisation pendant l’onboarding.
7. Ajouter l’instrumentation minimale d’activation : `signup_completed`, `passions_selected`, `personalized_feed_viewed`, sans PII.
8. Préparer un feature flag global pour pouvoir désactiver ce lot proprement sans casser l’ancien flux.
9. Relier les nouveaux événements/erreurs/états au mécanisme de télémétrie existant de façon compatible Centre de pilotage/Sentinelle.

## Tests obligatoires
Couvrir au minimum :
- ONB-01 nouveau compte + 1 passion → Feed pertinent, jamais écran « Choisis une passion » si fixture disponible ;
- ONB-02 3 passions → 3 intérêts Feed, 1 seul profil initial ;
- ONB-04 reload → intérêts restaurés ;
- ONB-10 compte existant → Feed direct ;
- ONB-11 aucun appel géolocalisation pendant onboarding ;
- ONB-12 aucune ancienne feature Wallet/Passia/CDV dans le parcours ;
- ONB-15 modification filtre → runtime + état persistant ;
- ONB-16 analytics sans nom/e-mail/date de naissance/GPS.

## Garde-fous
- Respecter `AGENTS.md` et `CLAUDE.md`.
- Vanilla JS, pas de framework/bundler ajouté.
- Pas de migration/destruction de données dans ce lot sauf nécessité démontrée et testée.
- Ne pas pousser en production directement.
- Exécuter les audits statiques pertinents et les tests Playwright ciblés ; si faisable, suite complète.
- Le changement doit rester réversible derrière feature flag.

## Livrable attendu
Un diff minimal mais fonctionnel, tests verts, et aucun changement hors périmètre. Ne modifie pas ce fichier de tâche.