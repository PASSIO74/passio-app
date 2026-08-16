# PASSIO — Cartographie fonctionnelle

> **Inventaire mesuré** du 2026-08-16, produit par lecture du dépôt réel (`index.html`, `js/app-0*.js`, `tests/e2e/`, schéma Supabase de production). Aucun chiffre n'est estimé.
>
> **Ce document ne prétend PAS donner un taux de couverture fonctionnelle.** Établir qu'une interaction est « couverte » exige de relier chaque interaction au test qui l'exerce — travail qui n'a pas été fait. Annoncer un pourcentage sur la base du nombre de specs serait exactement le genre de chiffre que le reste de cette qualification s'interdit. Voir « Ce qui reste non mesuré ».

## 1. Surface applicative

| Élément | Compté | Source |
|---|---|---|
| Écrans | **8** | `id="screen-*"` dans `index.html` |
| Interactions distinctes | **445** | fonctions appelées depuis un handler inline (`onclick`, `onchange`, `oninput`, `onsubmit`, `onkeyup`, `onkeydown`) |
| Tables en production | **34** | `information_schema`, toutes sous RLS |
| Specs e2e | **25** | `tests/e2e/*.spec.js` |
| Tests déclarés | **175** | dont 12 opt-in (cross-compte, confidentialité, campagne QA) |

Les 8 écrans : `feed` · `profiles` · `studio` · `explore` · `irl` · `messages` · `cdv` · `wallet`.

## 2. Interactions par module

L'ordre de chargement `app-01` → `app-09` **est** la gestion des dépendances (hoisting) : cette table décrit où vit le comportement, pas une architecture en couches.

| Module | Interactions | Domaine |
|---|---|---|
| `app-03-posts-vlogs` | **89** | publication, posts, vlogs, médias |
| `app-07-ia-explore-irl` | **76** | IA, explore, événements IRL |
| `app-05-config-profil` | **55** | configuration, profils, lives vidéo |
| `app-04-comments-shop` | **53** | commentaires, réactions, messagerie |
| `app-06-reels-partage` | **45** | bobines, partage |
| `app-02-state-utils` | **40** | état, navigation, helpers |
| `app-08-ui-modals-tour` | **35** | modales, tour, client Supabase |
| `app-09-boot-pwa` | **27** | démarrage, PWA, pièces jointes |
| `emoji-misc` | 10 | emoji, GIF |
| `app-01-diag-seed` · `contextual-nav` | 2 | diagnostic, navigation contextuelle |
| *(non localisées par l'analyse)* | 13 | — |

⚠️ Les 13 « non localisées » ne sont **pas** des fonctions fantômes : `npm run audit:handlers` vérifie à chaque CI que tout handler inline référence une fonction définie, et il est vert. C'est mon extraction par motif qui est incomplète (fonctions déclarées autrement que par `function X` ou `window.X =`).

## 3. Ce qui est réellement prouvé, et par quoi

Cette section liste des propriétés **vérifiées**, pas des fonctionnalités présumées correctes.

### Autorisation et confidentialité — `authz-critical.spec.js`, gate CI non skippable

13 invariants, vérifiés par **appels REST bruts** (passer par l'UI testerait la politesse du client, pas la RLS) :

`AUTHZ-01` un compte ne peut pas se fabriquer un profil sous l'identité d'un autre · `AUTHZ-02` ni écrire un post sous son `author_id` · `AUTHZ-03/04` ni modifier ou supprimer son contenu (**0 ligne touchée** — un refus RLS ne lève pas, il renvoie 200) · `AUTHZ-05` le contenu de la victime survit intact · `AUTHZ-06` les notifications d'autrui sont invisibles · `AUTHZ-07` les messages privés aussi *(non-régression de la fuite critique du 2026-08-09)* · `AUTHZ-08` la télémétrie n'est lisible par aucun client · `AUTHZ-09/10` l'identité d'affichage est réécrite à l'INSERT **et** à l'UPDATE · `AUTHZ-11/12` une notification signée du nom d'autrui est refusée, une notification légitime passe · `AUTHZ-13` un client sans session n'atteint aucune donnée privée.

### Autres propriétés prouvées

| Propriété | Preuve |
|---|---|
| Bloquer **retire l'accès** (compte privé) | `blocage-acces.spec.js` — cross-compte, précondition vérifiée, mutation-testé |
| Une suppression de message **tient** au redémarrage | `conv-suppression.spec.js` — et la contre-épreuve : le non-supprimé n'est pas perdu |
| Un transfert échoué est **marqué et remis en file** | `transfert-message.spec.js` — les deux issues |
| Aucun base64 ne part dans l'état synchronisé | `etat-sync-base64.spec.js` — mutation-testé |
| Rien ne survit à une déconnexion sauf les clés d'**appareil** | `audit-identite-emoji.spec.js` — invariant, pas liste de clés |
| Un post temps réel survit à une requête plus ancienne | `feed-realtime-course.spec.js` |
| Pas de mélange de versions au déploiement | `version-skew.spec.js` — assertions mutation-testées |
| Aucune télémétrie non sollicitée depuis localhost | `telemetrie-preauth.spec.js` — les deux sens |
| Messagerie, vocal, realtime, réactions cross-compte | `multi-comptes.spec.js` — base réelle |

### Couverture par domaine (nombre de tests, pas de pourcentage)

`cdv` 52 · `irl` 29 · `interactions` 17 · `multi-comptes` 9 · `profils-types` 8 · `contextual-nav` 7 · `access-gate` 6 · `version-skew` 5 · `smoke` 5 · `feed-ranking` 5 · le reste ≤ 4.

## 4. Données

34 tables, **toutes sous RLS**. Contraintes d'identité vérifiées : `posts.author_id → profiles(id)`, `passion_id → passions(id)` sur 5 tables, et les champs d'affichage (`author_name`, `author_photo`, `author_emoji`) réécrits par trigger depuis la source canonique.

Provenance du profil passionnel : `passion_id` est présent sur `posts`, `stories`, `events`, `conversations`, `profiles` — et **sur aucune table d'interaction**. « X a publié en tant que motard » est donc prouvable en base ; « X a commenté en tant que motard » ne l'est pas. Décision assumée : `.passio/adr/ADR-007`.

## 5. Ce qui reste non mesuré

**Le taux de couverture fonctionnelle.** Il faudrait relier chacune des 445 interactions au test qui l'exerce. Le nombre de specs ne s'y substitue pas : 52 tests sur CDV ne disent rien du nombre d'interactions CDV couvertes.

**La latence perçue** — le temps entre le tap et le retour visuel. Distincte de la latence réseau, que l'affichage optimiste masque précisément. Elle demande d'instrumenter puis d'observer du trafic réel.

Ces deux blancs sont écrits ici plutôt que comblés par une estimation. C'est la même règle que partout ailleurs dans cette qualification : `NON MESURÉ` vaut mieux qu'un chiffre de complaisance.
