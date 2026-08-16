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
| **Confidentialité — base** | ✅ **PROUVÉ** | RLS sur 34/34 tables. Comptes privés, blocage réellement révocant, isolation à la déconnexion vérifiée par **invariant** (aucune clé de compte ne survit) et non par liste de clés |
| **Confidentialité — médias** | ⚠️ **TROU CONNU** | La suppression d'un compte **n'emporte pas ses médias** : vérifié le 2026-08-16 en récupérant l'URL publique d'une photo d'un compte disparu, sans aucun jeton → `200`, 249 Ko. 19 fichiers (81 Mo) dans ce cas. Arbitrage produit à trancher (`MEDIA-COMPTE-SUPPRIME-010`) |
| **Intégrité des données** | ✅ **PROUVÉ** | Identité d'affichage réécrite par trigger (INSERT **et** UPDATE), référentiel de passions avec clés étrangères, suppressions qui tiennent au redémarrage |
| **Cross-compte** | ✅ **PROUVÉ** | 13 tests sur base réelle : messagerie, vocal, realtime, réactions, blocage, usurpation. 0 compte résiduel après purge |
| **Observabilité** | ✅ **RÉTABLIE** | La fenêtre pré-auth était perdue à 100 % (20 envois → 20 × HTTP 401) ; désormais 1 → 201. Table purgée de 79 % de bruit de test. Score de santé = pire domaine critique, plus une moyenne |
| **Performance — chargement** | ✅ **SAIN** | 355 Ko transférés. FCP **296 ms**, landing **1 501 ms**, aucune tâche > 145 ms sous bridage CPU ×4, machine au repos, médiane de 3 |
| **Performance — base** | ✅ **TRAITÉ** | 10 policies réellement coûteuses corrigées (11,6 → 1,1 ms mesuré). 7 clés étrangères indexées |
| **Résilience au déploiement** | ✅ **GARDÉ** | `index.html` non cacheable + assets à hash de contenu ; garde-fou mutation-testé contre la dégradation de cet équilibre |
| **Tests** | ⚠️ **SOLIDE, couverture mesurée à 15,2 %** | 175 e2e passés (1 flaky, 1 skipped) + 94 backend, 4 audits statiques dont un contre les tests creux. La couverture fonctionnelle est désormais **mesurée** : 66 interactions sur 435 s'exécutent pendant la suite — et c'est un **plafond**, un appel interne y comptant autant qu'un clic |
| **Latence perçue** | ⚠️ **INSTRUMENTÉE, pas encore observée** | Chaque clic transporte désormais son délai jusqu'à la **première image peinte** (`meta.ms`, deux `requestAnimationFrame` depuis la phase de capture), vérifié par deux tests dont un tueur de mutant. Mais **aucun p50/p95 n'est encore calculé** : il faut du trafic réel. 28 ms relevés en local ne disent rien d'un téléphone sur réseau mobile |
| **Montée en charge** | ⚠️ **PARTIEL** | Requêtes chaudes vérifiées par plan d'exécution réel. Mais aucun test à volume : les tables comptent des dizaines de lignes, pas des dizaines de milliers |
| **Récupération** | ⚠️ **SAUVEGARDÉ, non restauré** | Archive complète produisible et vérifiée : 32 tables (1 104 lignes), 4 comptes, 220 fichiers Storage (173,6 Mo), décomptes confrontés au serveur. Mais **aucune restauration n'a été exécutée**, et la reconstruction du schéma repose sur des migrations connues pour diverger de la production. `docs/RECUPERATION.md` |

## Ce qui ferait passer à PUBLIC BETA READY

1. **Latence perçue mesurée** sur du trafic réel. L'**instrumentation est en place** depuis le 2026-08-16 (délai tap → première peinture, joint à chaque clic) ; ne manque plus que l'observation. Requête de dépouillement : `meta->>'ms'` sur `telemetry_events` où `type='click'` et `env='production'`.
2. ~~Couverture fonctionnelle établie~~ — **fait le 2026-08-16 : 15,2 %** (66/435), méthode et limites dans `PASSIO_FUNCTIONAL_MAP.md` §5. Reste à décider ce qu'on veut en faire : ce chiffre est une base de discussion, pas un objectif à remonter pour lui-même.
3. **Une restauration de sauvegarde réellement exécutée.** La sauvegarde, elle, existe et est vérifiée depuis le 2026-08-16 ; ce qui manque est une **base cible** pour recharger l'archive — un second projet Supabase ou Docker. C'est une décision, pas du développement.
4. **Un test à volume** : 10 k à 100 k lignes sur les chemins chauds, pour vérifier que les plans tiennent. Le script est écrit (`scripts/test-volume.sql`, transaction annulée, jamais sur la production).

Aucun des quatre ne demande de refactoring. Tous demandent du temps, ou des données que seule la beta produira.

**Et deux d'entre eux — 3 et 4 — sont bloqués par exactement la même chose : une base qui ne soit pas la production.** Un second projet Supabase (gratuit, à détruire après) ou Docker Desktop débloquerait les deux d'un coup, et rien d'autre ne les débloquera. C'est une décision, pas du développement — et la seule de cette liste qui ne s'achète pas avec du temps.

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
