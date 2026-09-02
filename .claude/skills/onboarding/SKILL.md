---
name: onboarding
description: "Tunnel d'inscription et d'activation : première expérience, abandon, time-to-value. Dire : onboarding, les nouveaux partent."
---

# /onboarding — Tunnel d'activation PASSIO

L'objectif FB/IG : amener l'utilisateur à sa **première valeur** le plus vite possible (voir du contenu qui l'intéresse, faire sa première action), et éviter tout écran mort.

## Contexte PASSIO
- Auth par **e-mail** (l'anonyme est désactivé en prod). « Confirm email » a été constaté désactivé (pas de SMTP) → **configurer un SMTP AVANT de réactiver** (sinon inscription bloquée).
- Onboarding = choix de passions → profils. ⚠️ Pièges connus : `initApp()` (emoji-misc) ne doit JAMAIS tourner pour un non-onboardé (garde `state.onboarded`) ; le tour ne doit pas écraser l'onboarding.
- Gate beta (code `2125`) en amont — friction assumée, à arbitrer.

## Points à auditer
1. **Time-to-value** : combien d'écrans/champs avant de voir du contenu ? Réduire au strict nécessaire, différer le reste (compléter le profil plus tard).
2. **Fil non vide dès l'arrivée** : un nouveau compte avec 1 passion voyait peu de contenu (cf. filtres IRL pré-cochés, corrigé). Vérifier que le feed/explore montre du contenu riche immédiatement.
3. **Première action guidée** : pousser vers 1 like / 1 follow / 1 post dans les 60 premières secondes (activation).
4. **États vides pédagogiques** : chaque écran vide doit expliquer + proposer une action (déjà fait sur CDV/IRL — vérifier partout).
5. **Mesure du funnel** : instrumenter chaque étape (`/telemetry-event`) pour voir où ça décroche.

## Méthode
Reproduire l'inscription d'un nouveau compte dans le preview (skill `/preview`), noter chaque friction/écran mort, mesurer le funnel via télémétrie, corriger le maillon le plus faible d'abord.

## Rapport
Étapes du funnel + taux de passage estimé, frictions identifiées, 1-3 correctifs priorisés par impact sur l'activation.
