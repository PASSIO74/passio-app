# PASSIO — Analyse générale conjointe Claude Code + ChatGPT

> **Analyse croisée réelle**, menée le 2026-08-15 sur le dépôt et la prod réels (Claude Code) confrontés à une revue adversariale indépendante (ChatGPT, compte LADAME Business, 2 tours complets).
> Répartition : Claude Code détient le dépôt, la prod Supabase, la CI et les tests — il **vérifie**. ChatGPT n'a aucun accès — il **challenge**. Aucune hypothèse de ChatGPT n'est reprise ici sans vérification.
> Ne remplace pas `.passio/` (plan de contrôle) ni `PASSIO_REPOSITORY_AUDIT.md` (état des lieux 2026-08-07). Mesures : `PASSIO_MASTER_CONTROL.md`. Source machine : `passio_qa_registry.json`.

## EXECUTIVE SUMMARY

PASSIO est une application **mûre et bien gardée** : 34/34 tables sous RLS, 3 audits statiques verts, 146 tests e2e passants, 11 scénarios cross-compte prouvés en base réelle, un centre de pilotage de 61 routes réellement connecté.

Le travail de qualification ne porte donc pas sur des fonctionnalités cassées. Il porte sur **ce que le système est capable de PROUVER**. Et c'est là que l'analyse croisée a mordu : les deux défauts majeurs identifiés ne sont pas des bugs visibles, ce sont **deux trous dans la chaîne de preuve** — la CI ne vérifie pas les propriétés critiques avant de déployer, et le cockpit qui sert à juger la santé du produit repose sur une télémétrie dont l'attribution est partiellement perdue.

Aucun P0 ouvert. Aucune fuite de données. Deux P1, un P2 élevé, deux axes à instruire.

## CE QUE L'ANALYSE CROISÉE A RÉELLEMENT CHANGÉ

Sans le second regard, trois erreurs seraient passées :

| Mon constat initial | Ce que ChatGPT a objecté | Verdict après vérification |
|---|---|---|
| F3 : flaky = vraie race condition (P3) | « `element detached` ne prouve rien : distingue l'identité du nœud DOM de l'invariant métier » | **INFIRMÉ.** Les assertions du test portent bien sur l'invariant ; le flake s'est produit sur le **clic de setup**, avant le scénario. Fragilité de test, pas bug produit. |
| F2 : « la perte n'est pas silencieuse, un `server_reject` est émis » | « Si `server_reject` emprunte la même file, la même auth et la même policy, l'alarme dépend du canal en panne » | **CONFIRMÉ.** Même `track()` → `enqueue()` → même file → même flush → même policy. Affirmation retirée. |
| F2 : « 49 % des événements ont perdu leur attribution » | « Certains sont légitimement anonymes. Ventile par type avant de conclure » | **MON AFFIRMATION ÉTAIT FAUSSE.** Voir ci-dessous. |

Inversement, l'hypothèse principale de ChatGPT (injection d'un `profile_id` d'autrui) était **fausse dans son mécanisme** — cette colonne n'existe nulle part — mais elle m'a conduit à la vraie porte, ailleurs.

## FUNCTIONAL HEALTH — les 5 constats retenus

### F1 — La CI ne prouve pas les propriétés critiques avant de déployer · **P1**

`.github/workflows/deploy.yml` lance `npx playwright test` sans `PASSIO_E2E_MULTI` ni `PASSIO_QA_CAMPAIGN`. Les specs `multi-comptes`, `confidentialite` et `qa-campaign` s'auto-skippent : ce sont exactement les 12 tests « skipped ». Chaque déploiement en production est donc validé sans jamais exercer la séparation entre comptes, la confidentialité, ni la livraison realtime cross-compte.

*Formulation corrigée par ChatGPT, à raison* : les 146 tests prouvent beaucoup de choses réelles. Ce qui n'est pas prouvé, c'est **la séparation entre sujets distincts** — la propriété la plus dangereuse à casser.

*Correctif convergent* : ne PAS pousser les 11 tests destructifs sur la prod à chaque commit (ce serait remplacer un risque par un autre). Créer un noyau court **AUTHZ-CRITICAL**, déterministe, impossible à skipper sur `main`.

### F2 — La télémétrie ne garantit ni l'attribution ni la complétude · **P1**

Quatre mécanismes distincts, tous vérifiés :

1. **Empoisonnement de lot** — le client POSTe un tableau de 60 événements ; PostgREST en fait un seul INSERT multi-lignes : une violation RLS sur **une** ligne annule les 60. *(Confirmé par construction, non prouvé empiriquement — je n'ai pas voulu injecter de faux événements en prod.)*
2. **Conflit d'identité irréconciliable** — `user_id` estampillé à la mise en file, jeton lu au flush. Au changement de compte, aucun rafraîchissement de jeton ne réconciliera jamais deux identités : le lot brûle ses retries puis est abandonné.
3. **Alarme non indépendante** — `server_reject` emprunte le canal en panne.
4. **Identité fabriquée en pré-auth** — `getMyUserId()` ([app-08:2258](js/app-08-ui-modals-tour.js:2258)) et [emoji-misc.js:676](js/emoji-misc.js:676) forgent un id local `u_xxxx` avant toute authentification. Un tel id n'est ni `NULL` ni `auth.uid()` : sous la policy, tout événement le portant est rejeté. Zéro ligne `u_%` en base — cohérent avec « jamais envoyés » **comme** avec « tous rejetés ». **Non tranché.**

**Correction importante de ma propre analyse.** J'ai écrit « 49 % des événements ont perdu leur attribution ». C'est faux. La ventilation par type le montre :

| Type | Total | `user_id` NULL |
|---|---|---|
| `api` | 10 522 | 27 (0,3 %) |
| `session` | 7 891 | **7 806 (99 %)** |
| `perf` | 4 276 | **4 276 (100 %)** |
| `click` | 794 | 0 |
| `nav` | 297 | 0 |
| `action` | 213 | 0 |
| `flow` | 126 | 0 |
| `rt_recv` | 27 | 0 |

Les NULL ne sont pas répandus : ils sont **concentrés sur deux familles qui se déclenchent au démarrage**. L'attribution comportementale (`click`, `nav`, `action`, `flow`, `rt_recv`) est parfaite — 0 % de NULL.

Ce qui reste un vrai problème, et qui est plus précis que mon affirmation initiale : **`session` est anonyme à 99 %** — or l'entonnoir « Visiteurs → lien → compte » du dashboard repose sur ces événements ; et **`perf` est anonyme à 100 %** — la performance ne pourra jamais être segmentée par utilisateur.

### F4 — Usurpation d'identité par champs d'affichage dénormalisés · **P2 élevé**

Les policies INSERT vérifiées (`posts`, `video_lives`, `event_comments`, `cdv_live_comments`, `step_interactions`) ne contraignent **que** l'identifiant :

```
video_lives INSERT (author_id = auth.uid()::text)
```

Or ces tables portent aussi `author_name`, `author_photo`, `author_emoji` — **texte libre écrit par le client, jamais recoupé avec `profiles`**, et affiché tel quel ([app-05:2871](js/app-05-config-profil.js:2871)). Tout compte authentifié peut publier avec son propre `author_id` et **le nom et la photo d'un tiers**.

L'échappement est correct (`escapeHtml`, `safeUrlAttr`) : ce n'est **pas** une XSS, la discipline maison tient. Mais l'échappement empêche l'injection, pas l'usurpation.

*Cotation convergente* : P2 élevé, pas P0 — aucun accès aux données d'autrui, l'attribution serveur reste vraie via `author_id`. Mauvais pour la confiance et la modération, pas une compromission d'autorisation.

*Correctif retenu* : trigger `BEFORE INSERT OR UPDATE` réécrivant les champs d'affichage depuis la source canonique — **et pas seulement INSERT** (sinon on ferme la création et on laisse l'UPDATE), plutôt qu'une jointure sur les chemins chauds. Backfill séparé. Décision produit à trancher au passage : `author_name` doit-il être un **instantané historique** ou **l'identité actuelle** ?

### F6 — Provenance du profil passionnel · **partiellement résolu, périmètre à trancher**

ChatGPT a soulevé le point le plus structurel : pour un produit dont le concept central est le multi-profil, **le backend peut-il prouver quelle identité passionnelle a produit un objet ?**

Vérification : `passion_id` **existe** sur `posts`, `stories`, `events`, `conversations`, `profiles`. Son pire scénario est donc infirmé — la provenance est persistée pour les objets de **contenu**.

Mais elle est absente partout ailleurs : `post_comments`, `comment_interactions`, `post_likes`, `event_comments`, `event_reactions`, `cdv_*`, `step_interactions`, `follows`, `notifications`. Conséquence : **« Benjamin motard a publié » est prouvable en base ; « Benjamin motard a commenté » ne l'est pas.** À trancher comme décision de modélisation (ADR), pas comme correctif.

### F5 — Version skew PWA · **à instruire, P1–P2**

Aucune preuve à ce jour que HTML / JS / CSS / service worker / schéma DB restent compatibles pendant et après un déploiement. Or **tout push sur `main` déploie** : le décalage de version est garanti par construction dès qu'un utilisateur garde PASSIO ouvert pendant un déploiement — sans même qu'un bug de service worker soit nécessaire.

*Premier scénario retenu* : version N ouverte dans un onglet, déploiement N+1, puis interaction realtime entre un client N et un client N+1 ; relever les versions des deux côtés, les payloads, l'état DB et les deux UI finales. L'invariant : un client N vivant cohabite avec N+1 sans corruption ni divergence.

## POINT DE MÉTHODE — score de santé

Désaccord tranché, et ChatGPT a raison : **une moyenne pondérée est à proscrire.** `RLS 0 %` noyé dans une moyenne donnerait « 78/100 » alors que le système est ROUGE.

Modèle retenu : `santé = pire domaine critique` (disponibilité, parcours critiques, autorisation, intégrité, convergence), la performance ne pouvant produire qu'un AMBER, l'autorisation un ROUGE immédiat. Plus un **second chiffre, CONFIANCE**, pour que « 0 erreur remontée » ne se lise jamais comme « tout va bien » quand la réalité est « on ne voit rien ».

Corollaire immédiat, tant que F2 n'est pas corrigé : le principe maison « aucune donnée fictive » doit s'étendre à **« aucune précision fictive »**. Une valeur issue de vraies lignes SQL peut être une métrique fausse. « Visiteurs : 1 284 » doit devenir « Visiteurs observés 1 284 · couverture identité 51 % · fiabilité pré-auth NON VÉRIFIÉE ».

## ACTION PLAN

| # | Action | Priorité |
|---|---|---|
| 1 | Noyau **AUTHZ-CRITICAL** en gate CI, non skippable sur `main` | P1 |
| 2 | Télémétrie : ventiler les NULL, trancher le cas `u_xxxx` par observation réseau sur navigateur vierge, partitionner la file par identité, rendre l'alarme indépendante | P1 |
| 3 | Marquer comme DÉGRADÉES, dans le dashboard, les métriques dépendant de `session` et `perf` | P1 |
| 4 | Trigger de réécriture des champs d'affichage (INSERT **et** UPDATE) + backfill | P2 élevé |
| 5 | Décision de modélisation sur la provenance `passion_id` des interactions (ADR) | P2 |
| 6 | Test de version skew « onglet ancien pendant déploiement » | P1–P2 |
| 7 | Scénarios déterministes multi-appareil (8 à 12, pas 100) | P2 |
| 8 | Performance — **après** mesure réelle sur mobile bas de gamme, jamais avant | P3 |

## CE QU'IL NE FAUT PAS FAIRE

Position commune, sans réserve : pas de bundler, pas de migration ES modules, pas de framework, pas de réécriture des 1,84 Mo, pas de refonte générale des policies, pas de 200 nouveaux tests, pas de 40 métriques supplémentaires au cockpit, pas de tests destructifs lourds sur la prod à chaque push, pas d'optimisation CSS avant mesure.

Le monolithe est une dette. Ce n'est pas un incident de production. **Ne pas chercher à rendre PASSIO élégant avant de le rendre prouvablement correct.**

## VERDICT

**CONTROLLED BETA READY.** L'application fonctionne et est correctement défendue au niveau des données. Ce qui manque pour aller plus loin n'est pas fonctionnel : c'est la **chaîne de preuve** — un gate CI qui vérifie les propriétés critiques, et un cockpit dont les métriques sont fiables au point de servir de source de vérité. Tant que ces deux points ne sont pas réglés, tout jugement de santé porté sur PASSIO reste partiellement invérifiable.
