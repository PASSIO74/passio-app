# Sentinel Autopilot V2 — protocole d'activation locale

Statut : **PREPARED / FLAG OFF BY DEFAULT / NO PRODUCTION DEPLOY**.

## But

Autoriser à terme une promotion **locale, bornée et réversible** d'une réparation Sentinel lorsqu'un incident causal précis bloque lui-même le Release Guardian complet, sans jamais transformer `GO_LOCAL` en autorisation de release production.

## Chaîne de preuve préparée

La revue doit traiter la chaîne empilée complète, pas un module isolé :

- #11 : identité causale Incident Packet → diagnostic → réparateur ;
- #12 : policy locale pure, fail-closed ;
- #13 : inventaire d'incidents non exhaustif par défaut ;
- #14 : rétention prouvable, legacy non trusted, overflow critique ;
- #15 : contexte causal propagé jusqu'à Autopilot ;
- #16 : adaptateur read-only initial ;
- #18 : flag local-gate V2 OFF par défaut ;
- #19 : convergence fraîcheur Guardian + preuve diagnostic scellée, supersédant #17 ;
- #21 : runtime CI/build Node 22 cohérent ;
- branche de ce protocole : verrou transactionnel process-local intégré à l'exécuteur.

## Conditions obligatoires avant toute activation réelle

1. Tous les HEADs de la chaîne réellement retenue ont une CI exacte `COMPLETED SUCCESS`.
2. Revue indépendante Claude Code + Codex ; toute divergence est résolue par code/test/preuve, jamais par vote.
3. `main` impose réellement les required status checks/ruleset ; protection `off`/vide => NO_GO.
4. `DASH_SENTINEL_LOCAL_GATE_V2` reste OFF jusqu'à la décision explicite de revue.
5. `DASH_SENTINEL_AUTOPILOT` reste un opt-in séparé ; aucun flag implicite.
6. Guardian frais à la décision ; timestamp absent, futur ou > âge maximal => HOLD.
7. `diagnosisEvidence` provient du diagnostic canonique scellé au bootstrap ; absence/mismatch => HOLD.
8. `diagnosisId`, `incidentId` et cluster causal concordent avec le repair context.
9. Inventaire incidents `complete:true` seulement via preuve de rétention fiable + lecture complète.
10. Registre legacy `historyTrusted:false` => HOLD tant qu'une procédure explicite de baseline n'a pas établi une nouvelle frontière de confiance.
11. `criticalOverflow:true` => HOLD ; aucune réinitialisation silencieuse de ce marqueur.
12. Incident causal toujours open high/critical au moment exact de l'évaluation.
13. Zéro autre incident high/critical ouvert.
14. Réparation déjà vérifiée, branche `sentinelle/*`, taille/fichiers dans les bornes, pattern non quarantiné.
15. Dépôt propre et branche cible exacte.
16. Verrou de promotion acquis avant le premier accès git ; concurrence => HOLD.
17. Pour plusieurs processus/instances : instance unique prouvée OU lease durable externe. Le verrou process-local seul ne suffit pas.
18. SHA pré-promotion capturé avant merge.
19. Suites post-promotion configurées toutes vertes ; échec/throw/timeout => rollback exact.
20. HEAD doit réellement avancer ; sinon rollback.
21. Watch de récidive armée uniquement après `PROMOTED_LOCAL` ; récidive répétée => quarantaine.
22. Production reste protégée par `config.isProd` / mutation interdite et par le Release Guardian complet.

## Scénarios de chaos obligatoires

- Guardian stale, absent ou futur => HOLD.
- Diagnostic scellé absent => HOLD.
- mismatch diagnosisId / incidentId / cluster => HOLD.
- incident causal clôturé entre diagnostic et décision => HOLD.
- nouvel incident high/critical non causal => HOLD.
- inventaire partiel ou lecture incomplète => HOLD.
- registre legacy non trusted => HOLD.
- overflow critique historique => HOLD.
- deuxième promotion concurrente => refus avant tout accès git.
- token de verrou incorrect => verrou conservé ; token jamais exposé dans snapshot/diagnostic.
- worktree sale / mauvaise branche cible => HOLD et verrou libéré.
- merge échoue => abort ; aucune promotion déclarée.
- suite post-promotion rouge/exception/timeout => rollback au `beforeSha` exact.
- rollback échoue => état `REJECTED`/incident opérateur, jamais PASS.
- HEAD inchangé après merge => rollback.
- signal identique revient après promotion => récidive enregistrée une seule fois, puis quarantaine selon seuil.

## Observabilité minimale

Chaque tentative doit rendre visibles sans secret :

- décision et blockers ;
- incidentId / diagnosisId / cluster ;
- âge du Guardian ;
- état de complétude inventaire + raisons ;
- repair branch/SHA ;
- état du verrou **sans token** ;
- beforeSha / afterSha ;
- suites et verdicts ;
- rollback et raison ;
- récidive / quarantaine ;
- flag V2 actif ou non.

Aucun contenu sensible du diagnostic ni token de verrou ne doit être exposé aux événements opérateur.

## Frontière production

`GO_LOCAL`, `PROMOTE_LOCAL`, `PROMOTED_LOCAL` ou une réparation vérifiée ne valent **JAMAIS** autorisation production.

Le déploiement production exige séparément :

- Release Guardian complet `GO` ;
- preuves fraîches sur le HEAD exact ;
- `main` avec required checks réellement enforced ;
- revue/ordre de fusion validés ;
- preuve publique de release alignée ;
- aucun blocker critique restant.

## Rollback de l'activation V2

Le mode V2 doit rester derrière `DASH_SENTINEL_LOCAL_GATE_V2=true`. Désactiver le flag restaure immédiatement le comportement historique `Release Guardian complet GO obligatoire`, sans migration et sans modifier le Guardian.

Si la coordination multi-processus n'est pas prouvée, le flag doit rester OFF même si tous les tests unitaires sont verts.
