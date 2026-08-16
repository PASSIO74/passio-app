# PASSIO — Production Readiness

> Évaluation du 2026-08-16, sur commit `9c97409`. Chaque verdict s'appuie sur une vérification exécutée, citée. Les domaines sans mesure portent `NON MESURÉ` — jamais une appréciation.
> Détail : `PASSIO_MASTER_CONTROL.md` (mesures), `passio_qa_registry.json` (machine), `PASSIO_FUNCTIONAL_MAP.md` (inventaire), `PASSIO_ENGINEERING_LOG.md` (journal).

# VERDICT : CONTROLLED BETA READY

L'application est **utilisable, défendue au niveau des données, et vérifiée sur ses propriétés critiques**. Ce qui l'empêche de monter d'un cran n'est pas du code : c'est du **temps d'observation**. `PUBLIC BETA READY` exige des données de trafic réel que la beta n'a pas encore produites — et je ne le décrète pas sur une session de corrections.

Ce qui a changé, c'est ce sur quoi ce verdict repose. Avant : « aucun bug évident ». Maintenant : un gate qui vérifie 13 invariants d'autorisation avant chaque déploiement, des mesures reproductibles, et dix défauts trouvés puis corrigés — dont aucun n'était évident.

## Domaine par domaine

| Domaine | Verdict | Preuve |
|---|---|---|
| **Autorisation** | ✅ **PROUVÉ** | 13 invariants en gate CI non skippable, par appels REST bruts, verts depuis un runner GitHub. Couvre écriture sous identité d'autrui, modification/suppression cross-compte, notifications, messages privés, télémétrie, client anonyme |
| **Confidentialité** | ✅ **PROUVÉ** | RLS sur 34/34 tables. Comptes privés, blocage réellement révocant, isolation à la déconnexion vérifiée par **invariant** (aucune clé de compte ne survit) et non par liste de clés |
| **Intégrité des données** | ✅ **PROUVÉ** | Identité d'affichage réécrite par trigger (INSERT **et** UPDATE), référentiel de passions avec clés étrangères, suppressions qui tiennent au redémarrage |
| **Cross-compte** | ✅ **PROUVÉ** | 13 tests sur base réelle : messagerie, vocal, realtime, réactions, blocage, usurpation. 0 compte résiduel après purge |
| **Observabilité** | ✅ **RÉTABLIE** | La fenêtre pré-auth était perdue à 100 % (20 envois → 20 × HTTP 401) ; désormais 1 → 201. Table purgée de 79 % de bruit de test. Score de santé = pire domaine critique, plus une moyenne |
| **Performance — chargement** | ✅ **SAIN** | 355 Ko transférés. FCP **296 ms**, landing **1 501 ms**, aucune tâche > 145 ms sous bridage CPU ×4, machine au repos, médiane de 3 |
| **Performance — base** | ✅ **TRAITÉ** | 10 policies réellement coûteuses corrigées (11,6 → 1,1 ms mesuré). 7 clés étrangères indexées |
| **Résilience au déploiement** | ✅ **GARDÉ** | `index.html` non cacheable + assets à hash de contenu ; garde-fou mutation-testé contre la dégradation de cet équilibre |
| **Tests** | ⚠️ **SOLIDE, non quantifié** | 164 e2e + 13 cross-compte + 94 backend, 4 audits statiques dont un contre les tests creux. Mais le **taux de couverture fonctionnelle** n'est pas mesuré |
| **Latence perçue** | ❌ **NON MESURÉ** | Aucun p50/p95 entre le tap et le retour visuel. Toute affirmation de réactivité serait non fondée |
| **Montée en charge** | ⚠️ **PARTIEL** | Requêtes chaudes vérifiées par plan d'exécution réel. Mais aucun test à volume : les tables comptent des dizaines de lignes, pas des dizaines de milliers |
| **Récupération** | ❌ **NON VÉRIFIÉ** | Aucune restauration de sauvegarde n'a été testée. « Supabase fait des backups » n'est pas une procédure éprouvée |

## Ce qui ferait passer à PUBLIC BETA READY

1. **Latence perçue mesurée** sur du trafic réel — instrumentation puis observation, pas un test synthétique.
2. **Couverture fonctionnelle établie** : relier les 445 interactions aux tests qui les exercent. Sans ce dénominateur, « bien testé » reste une impression.
3. **Une restauration de sauvegarde réellement exécutée.** C'est le seul domaine à zéro preuve, et son coût d'échec est total.
4. **Un test à volume** : 10 k à 100 k lignes sur les chemins chauds, pour vérifier que les plans tiennent.

Aucun des quatre ne demande de refactoring. Tous demandent du temps, ou des données que seule la beta produira.

## Ce qui a été délibérément NON fait

| Sujet | Motif |
|---|---|
| 73 policies d'écriture `auth.uid()` nu | Une écriture touche une ligne : « par ligne » y signifie « une fois ». 73 occasions de se tromper pour zéro gain |
| 13 index « inutilisés » | Sur une beta à faible trafic, `pg_stat_user_indexes` est quasi vide : ce serait agir sur une absence de preuve |
| Découpage du JS au démarrage | **Fermé sur mesure** : 133 ms d'injection pour les 9 fichiers, dont 24 pour le meilleur candidat. V8 pré-parse paresseusement |
| `passion_id` sur les tables d'interaction | Dix colonnes pour une fonctionnalité qui n'existe pas. ADR-007, à rouvrir si le produit segmente par profil |
| Bump des actions CI | Modifier les actions, c'est modifier le chemin de déploiement : ça se vérifie sur une PR |

## Ce que cette qualification a appris sur elle-même

Sur dix défauts trouvés, **un seul était visible en lisant le code**. Quatre étaient le **survivant d'un correctif incomplet** — quelqu'un avait traité la classe de problème à un endroit sur deux. Trois venaient de données de production, deux de la revue croisée.

Et **trois de mes propres conclusions ont dû être corrigées**, toutes par la mesure : une baseline de performance gonflée 3,5× par la charge machine, un levier de découpage annoncé « massif » puis mesuré à 24 ms, un `InitPlan` attribué au planificateur alors qu'il venait d'une enveloppe déjà présente.

Neuf pièges de vérification sont consignés (`passio_qa_registry.json`). Deux d'entre eux ne faisaient pas croire à un échec mais à un **succès** — un test qui recopie le code qu'il vérifie, et une couverture V8 additionnée à plat. Ceux-là ne se signalent jamais seuls ; c'est pourquoi chaque correctif de cette session est mutation-testé.

**La conclusion opérationnelle** : sur ce projet, une anomalie a une chance sérieuse d'être un artefact de mesure, et un correctif existant a une chance sérieuse de n'avoir pas été appliqué partout. Les deux réflexes sont outillés — `chercher-survivants` et les garde-fous en CI.
