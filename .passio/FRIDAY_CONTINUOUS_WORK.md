# PASSIO — Continuous Optimization & Friday Handoff

Date de démarrage : 2026-08-18
Échéance de revue/déploiement : vendredi 2026-08-21

## Règle de fonctionnement jusqu'à vendredi

Chaque itération doit produire au moins un résultat concret parmi : code, test, instrumentation, audit, documentation de décision, correctif prêt à appliquer, amélioration du Control Center, amélioration de Sentinel, ou progression de la version mobile de pilotage.

Aucun travail important ne doit rester uniquement dans une conversation. Toute décision exploitable doit être enregistrée dans le dépôt avec sa preuve, son statut et sa dépendance de déploiement.

Ordre de priorité permanent :
1. intégrité/sécurité de l'application ;
2. observabilité réelle et absence de faux vert ;
3. autonomie de Sentinel ;
4. qualité du Control Center ;
5. expérience utilisateur et performance générale ;
6. version mobile de pilotage ;
7. optimisations produit mesurées.

## Règle d'or Sentinel

Sentinel doit tendre vers une boucle autonome :

DETECT → CONFIRM → CORRELATE → DIAGNOSE → PROPOSE/FIX → VERIFY → RESOLVE → LEARN

Principes non négociables :
- correction automatique uniquement si le correctif est réversible, borné et vérifiable ;
- aucun faux vert : une preuve UNKNOWN/STALE ne devient jamais PASS ;
- aucune mutation destructive non confirmée par des tests ou invariants ;
- tout incident doit enrichir la mémoire opérationnelle : cause, preuve, correctif, résultat, récidive ;
- les faux positifs/faux négatifs doivent entraîner un ajustement explicable des règles ;
- Claude/Codex servent de revue et de raisonnement complexe, jamais de dépendance vitale de l'observation ;
- si Claude est indisponible, Sentinel continue en mode déterministe ;
- une réparation qui échoue doit automatiquement être abandonnée/revertie ou isolée, jamais propagée ;
- une release ne peut être GO si AUTHZ, observation, parcours critiques, incidents critiques ou preuves de release sont absents/périmés.

## Travail déjà préparé

### PR #3 — Sentinel 2 Autonomous Core
Base de l'Observation Health, Incident Packets, Readiness critique et Release Recorder.
Statut : ouverte, à revoir avant fusion.

### PR #4 — Application Integrity Wave 2
- drain télémétrie avant transition d'identité ;
- contrat `release.json` ;
- buildId commun navigateur/service worker ;
- release guard navigateur ;
- gate CI sur artefact `dist`.
Statut : CI verte.

### PR #5 — Control Center Intelligence
- 5 domaines Produit / Technique / Sécurité / Observation / Release ;
- risques P0-P3 ;
- 3 actions prioritaires ;
- historique et « Qu'est-ce qui a changé ? » ;
- page Command Center autonome.
Statut : CI verte.

### PR #6 — Sentinel 3 Release Guardian
- vrai ACK navigateur SSE ;
- machine d'état d'incident ;
- clustering et consolidation de preuves ;
- anomaly engine médiane/MAD ;
- AUTHZ avec âge mesurable ;
- Release Guardian fail-closed GO/NO-GO ;
- API et UI Guardian.
Statut : CI à contrôler avant toute fusion.

### Branche `feat/product-passion-intelligence`
- instrumentation du contexte de passion active ;
- objectif : mesurer l'expérience et le ranking par passion avant toute migration historique ;
- aucune provenance historique ne doit être inventée.

## Version mobile du centre de pilotage

Objectif : rendre le Control Center et Sentinel réellement utilisables depuis un téléphone, sans exposer une console système.

Surface mobile cible :
- écran Santé globale / GO-NO-GO ;
- top 3 risques ;
- incidents ouverts avec phase Sentinel ;
- alertes critiques ;
- observation DB/SSE/canary ;
- Release Guardian ;
- historique « ce qui a changé » ;
- lancement des suites de tests autorisées ;
- acquittement d'alertes ;
- progression manuelle d'incident lorsque nécessaire ;
- actions sensibles derrière confirmation explicite et permissions existantes ;
- aucune mutation git arbitraire depuis le mobile.

Approche recommandée : PWA responsive installable sur iOS/Android d'abord, puis wrapper natif seulement si une capacité OS réelle le justifie. Réutiliser l'auth du dashboard et les API existantes ; ne pas créer un deuxième backend.

## File de travail continue jusqu'à vendredi

- vérifier et corriger la CI de Sentinel 3 ;
- brancher le contrat release navigateur au Release Recorder/Guardian côté dashboard ;
- finaliser Product Passion Intelligence et ses tests ;
- mesurer le ranking au lieu de modifier ses poids sans données ;
- réduire les monolithes JS progressivement par frontières de domaine testées ;
- enrichir l'apprentissage Sentinel avec résultat de réparation et récidive ;
- ajouter politique de rollback automatique pour réparations autorisées ;
- ajouter budgets de sécurité et de fréquence de self-heal ;
- ajouter journal de décisions autonome de Sentinel ;
- finir le cockpit mobile PWA ;
- vérifier observabilité réelle depuis mobile ;
- préparer prompts indépendants Claude Code et Codex ;
- produire ordre de fusion/déploiement vendredi.

## Format obligatoire pour chaque nouvelle optimisation

Chaque entrée doit préciser :
- problème mesuré ;
- preuve / source ;
- changement ;
- tests exécutés ;
- résultat ;
- risque restant ;
- rollback ;
- dépendances de déploiement ;
- besoin ou non de revue Claude/Codex.

## Politique de déploiement vendredi

Claude Code et Codex doivent relire indépendamment les changements sensibles. Les divergences de verdict doivent être résolues par preuve (tests, code, reproduction), pas par majorité.

Ordre de fusion final à déterminer vendredi à partir des HEAD réels et CI :
1. fondations d'intégrité ;
2. Sentinel/Observation ;
3. Control Center ;
4. Sentinel 3 / Release Guardian ;
5. Product Passion Intelligence ;
6. mobile ;
7. optimisations additionnelles validées.

Aucune PR ne doit être fusionnée uniquement parce qu'elle est mergeable : les preuves critiques doivent être vertes et fraîches.
