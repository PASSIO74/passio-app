# Verdict commercial final — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (main, 2026-09-04, déployé en production par le run CI 2494). Modèle : Claude Fable 5.1 (orchestrateur, 16 auditeurs de domaine, relecteurs adversariaux). Ce verdict applique strictement les critères de l'ordre de mission ; il ne pèse ni l'ambition du produit ni la qualité du travail accompli, seulement ce qui est prouvé au SHA audité.

## 1. Verdict

# ⛔ NO-GO pour la commercialisation à grande échelle — **BÊTA FERMÉE UNIQUEMENT**

L'application peut continuer à fonctionner comme aujourd'hui, avec un petit nombre de personnes connues et prévenues (5 comptes réels au moment de l'audit). Elle ne doit pas être ouverte au public — ni « lancement limité » — tant que les huit P0 ne sont pas fermés et que quatre preuves manquantes n'ont pas été apportées (restauration, capacité, isolation sous rôle, staging).

## 2. Application des critères d'interdiction du GO grande échelle

L'ordre de mission interdit le GO grande échelle si l'un des sept critères suivants est vrai. **Les sept sont vrais.**

| Critère d'interdiction | Constat | Preuve principale |
|---|---|---|
| Un P0 ouvert | **8 P0 ouverts** | Rapport 11 §1 |
| Isolation des comptes non prouvée | La RLS par propriétaire est **conforme par inspection** sur les 128 policies, et le job CI « Suites production » (authz-critical) est vert sur ce SHA ; mais la preuve **sous rôle** n'a pas pu être faite ici (SET ROLE refusé, REST bloqué), et trois fuites transverses sont **prouvées** : accusés de lecture de toutes les conversations privées lisibles par anon (SUP-02/MSG-05), participants aux rencontres lisibles par anon (IRL-03), pièces jointes vocales privées listables et lisibles sans compte (SUP-01/MSG-03/CONT-11), et sur l'appareil, file de messages du compte A rejouée sous l'identité du compte B (AUTH-06) | Rapports 06, 04 |
| Restauration non prouvée | **Jamais exécutée** (docs/RECUPERATION.md le dit lui-même) ; sauvegarde manuelle, locale, non chiffrée, dernière connue le 2026-08-16, sans les mots de passe ; schéma non reconstructible (4 migrations enregistrées sur 64) | EXP-01, EXP-02, EXP-04, TCI-03 — rapport 10 |
| Capacité non mesurée | **Aucune mesure** ; aucun staging pour la faire ; plafonds connus (60 connexions PostgreSQL, 78 policies non optimisées, Realtime diffusé à tous) | PERF-01 — rapport 07 |
| Fonction critique invisible du Pilotage ET de la Sentinelle | Confirmation d'e-mail (SMTP), push, suppression de compte, refus Storage, signalements, sauvegardes, coûts : **aucun signal** ; et aucune alerte ne sort du dashboard s'il n'est pas ouvert | PIL-01, PIL-04, PIL-10, MOD-11 — rapport 08 |
| Sécurité IRL ou modération insuffisante | **Les deux** : aucun traitement des signalements ni moyen de retirer un contenu illicite (MOD-01), publications/stories/messages non signalables (MOD-02), adresse exacte + téléphone + liste des participants d'une rencontre lisibles par tout visiteur (IRL-01/03), aucune protection des mineurs sur l'IRL (IRL-02), aucune CGU ni point de contact (MOD-09) | Rapports 10, 04 |
| Staging et prod non séparés | **Un seul projet Supabase** pour le développement, les previews de PR, les tests CI à comptes réels, le canari horaire et la production | SUP-04, EXP-11, TCI-04 |

## 3. Les huit P0

| Id | Problème | Pourquoi P0 |
|---|---|---|
| SUP-01 / MSG-03 / CONT-11 | Pièces jointes vocales de conversations privées dans un bucket public, listables et lisibles avec la seule clé anon, jamais purgées | Confidentialité des messages privés rompue sans authentification ; risque connu depuis le 2026-08-08 (R2) et toujours ouvert |
| MSG-01 | XSS DOM par invitation d'appel forgée sur un canal Realtime public (emoji non échappé) | Exécution de code dans la session de n'importe quel utilisateur connecté, depuis n'importe quel compte |
| MOD-01 | Aucune chaîne de traitement des signalements, aucun moyen applicatif de retirer un contenu illicite | Obligation légale (notice & action) impossible à tenir ; critère « modération insuffisante » |
| SUP-04 | Un seul projet Supabase pour dev, previews, CI à comptes réels et production | Critère « staging non séparé » ; six incidents d'isolation en quatre jours début septembre en sont la conséquence |
| EXP-01 | Restauration jamais exécutée, schéma non reconstructible | Critère « restauration non prouvée » ; une erreur de migration ou un incident Supabase peut être irrécupérable |
| PERF-01 | Capacité non prouvée : aucune mesure, aucun environnement pour la faire | Critère « capacité non mesurée » ; aucune promesse chiffrée n'est tenable |

## 4. Ce qui sépare « bêta fermée » d'un « lancement limité »

Un LANCEMENT LIMITÉ (quelques centaines de personnes, invitation, une ville, une passion) deviendrait défendable quand, et seulement quand :

1. Les 8 P0 sont fermés et re-vérifiés (bucket `attachments` privé + URL signées + listing anon retiré ; échappement de l'invitation d'appel et canaux Realtime autorisés ; chaîne de signalement avec retrait de contenu et journal ; staging séparé ; restauration exercée et documentée ; capacité mesurée au moins à 1 000 comptes / 200 simultanés).
2. Les P1 de **sécurité IRL et de modération** sont fermés : adresse/téléphone/participants réservés aux inscrits (IRL-01/03), garde de majorité appliquée (IRL-02, AUTH-02, MOD-08), contenus signalables (MOD-02), rate-limits serveur (CONT-08, MOD-06, SUP-07), blocage effectif côté serveur (MOD-04/05, MSG-10).
3. Les P1 **juridiques** sont fermés : CGU + mentions légales + consentement à l'inscription (AUTH-03, MOD-09, EXP-09), politique de confidentialité exacte (EXP-08, AUTH-10), télémétrie avec consentement et interrupteur (AUTH-04), effacement complet (AUTH-05, SUP-10), point de contact réel (EXP-07, AUTH-11), allégation « contrôle d'âge IA » retirée (UXO-07, AUTH-02).
4. Le **Centre de pilotage** notifie hors page (PIL-01) et voit la confirmation d'e-mail, la suppression de compte et les signalements (PIL-04, PIL-10, MOD-11) ; la console d'administration exige un mot de passe fort et un second facteur (PIL-02).
5. Le dépôt cesse d'exposer publiquement le dossier investisseur, les finances et les documents internes (EXP-10), ou devient privé.

Un GO COMMERCIAL À GRANDE ÉCHELLE exigerait en plus : tous les P1 fermés, la capacité mesurée à 10 000 puis 100 000 comptes sur staging, une recette sur appareils réels (iOS Safari, Android, tablettes), une restauration exercée trimestriellement, et un second administrateur (EXP-05).

## 5. Ce qui est solide et ne doit pas être défait

- La RLS par propriétaire sur les 39 tables, l'auteur gelé des publications, la confirmation d'e-mail, la propriété de l'état local par compte, la déconnexion réelle, l'échappement systématique du contenu utilisateur (aucune XSS trouvée hors MSG-01/MSG-02), la position GPS jamais persistée.
- L'expérience de première visite (« l'application est le pitch »), le référentiel plat de 1 908 passions, le fil additif, la page Mes passions — parcours mesurés verts en émulation.
- La chaîne CI : 13 jobs, `main` protégée, déploiement uniquement sur CI verte, 1 103 tests locaux, Sentinelle distante.
- Les performances sur appareil rapide (fil actif en 154 ms, 500 cartes en 14 ms, aucune fuite mémoire).

## 6. Compteurs

| | P0 | P1 | P2 | P3 | Réfutés | Total rapporté |
|---|---|---|---|---|---|---|
| Retenus | **8** | **57** | **66** | **58** | 3 | 192 |

Relecture adversariale : 104 confirmés, 4 incertains, 3 réfutés, 81 non relus (crédits épuisés — à confier en priorité à la contre-revue).

## 7. Réserves de l'auditeur

- Cinq domaines (irl, profils-passions, robustesse-pannes, perf-capacite-couts, appareils-a11y) ont été reconstitués par l'orchestrateur après interruption des sous-agents, et trois autres (auth-rgpd, exploitation-continuite, tests-ci) n'ont pas été relus ; leurs problèmes n'ont pas été attaqués par des relecteurs indépendants. Ils peuvent être surestimés ou sous-estimés, jamais inventés : chacun cite une preuve déposée dans `preuves/`.
- Aucune mesure n'a été faite sur la production ni sur un appareil réel. Tout ce qui est écrit « émulation » vaut pour Chromium 141 headless.
- Le verdict ne changerait pas si les 81 problèmes non relus étaient tous réfutés : les huit P0 et les sept critères d'interdiction reposent sur des problèmes CONFIRMÉS par la relecture (SUP-01, MSG-01, MSG-03, MOD-01, SUP-04, CONT-11) ou sur des faits documentés par le dépôt lui-même (restauration jamais exécutée, aucune mesure de charge).
