# Sentinel Autopilot — protocole d'activation locale

Statut : PREPARED / NOT RUNTIME ACTIVATED / NO PRODUCTION DEPLOY.

## But

Autoriser à terme une promotion LOCALE réversible d'une réparation Sentinel sans transformer cette décision locale en autorisation de release production.

## Conditions obligatoires avant activation runtime

1. PRs causalité + policy + evidence sur leurs HEAD exacts avec CI complète SUCCESS.
2. Revue indépendante Claude Code et Codex ; toute divergence est résolue par preuve.
3. Guardian frais au moment de la décision ; timestamp absent, futur ou périmé => HOLD.
4. Ensemble d'incidents explicitement exhaustif ; preuve partielle => HOLD.
5. `diagnosisId` et `incidentId` causal exacts, cohérents avec la réparation.
6. Incident causal encore open et high/critical au moment de l'évaluation.
7. Zéro autre incident high/critical ouvert.
8. Réparation déjà vérifiée, branche strictement `sentinelle/*`, dépôt propre et branche cible exacte.
9. Verrou de promotion acquis ; concurrence => HOLD.
10. SHA pré-promotion capturé avant merge et rollback exact obligatoire au premier test rouge.
11. Suites post-promotion AUTHZ + globals + handlers + smoke toutes vertes.
12. Watch de récidive armée après promotion ; récidives répétées => quarantaine.

## Scénarios de chaos obligatoires

- Guardian devient stale avant décision => HOLD.
- timestamp Guardian absent/futur => HOLD.
- incident causal clôturé avant décision => HOLD.
- nouvel incident high/critical non causal => HOLD.
- liste d'incidents non exhaustive => HOLD.
- mismatch repair/diagnostic/incident => HOLD.
- deuxième promotion concurrente => HOLD.
- dépôt sale ou mauvaise branche cible => HOLD.
- merge échoue => abort, pas de promotion déclarée.
- une suite post-promotion échoue/throw/timeout => rollback au SHA capturé.
- HEAD n'avance pas après merge => rollback.
- même signal revient après promotion => récidive enregistrée et apprentissage pénalisé.

## Observabilité minimale

Chaque tentative devra rendre visibles : décision, blockers, incidentId, diagnosisId, repair branch/SHA, Guardian age, beforeSha, afterSha, suites exécutées, rollback, raison finale et état de récidive/quarantaine. Aucun contenu sensible de diagnostic ne doit être exposé dans les événements opérateur.

## Frontière production

`GO_LOCAL`, `PROMOTED_LOCAL` ou une réparation vérifiée ne valent JAMAIS autorisation production. La release/deploy production exige toujours le Release Guardian complet `GO`, des preuves fraîches sur le HEAD exact et les règles de gouvernance de `main` effectivement appliquées.

## Rollback de cette activation

L'activation runtime future doit être derrière un flag explicite OFF par défaut. Désactiver ce flag doit restaurer immédiatement le comportement HOLD sans migration de données ni modification du Release Guardian.
