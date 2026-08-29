# PASSIO — Master Control

> **Tableau de bord humain de la qualification production.** Source de vérité machine : `passio_qa_registry.json`. Vue temps réel : `dashboard/`.
> Ce fichier ne duplique PAS `.passio/` (plan de contrôle : contexte, ADR, risques) ni `PASSIO_REPOSITORY_AUDIT.md` (état des lieux 2026-08-07). Il les chapeaute avec des **mesures datées**.
> Règle de ce document : **rien d'affirmé sans preuve exécutée**. Une case non mesurée s'écrit `NON MESURÉ`, jamais « OK ».

## STATUT GLOBAL

| Champ | Valeur | Source |
|---|---|---|
| Date | **2026-08-29** (remesuré ; l'en-tête datait du 2026-08-15, onze jours et une douzaine de PR en arrière) | — |
| Commit | `c2e3e1b` | `git log -1` |
| Branche | `main`, dépôt propre, synchro `origin` (0/0) | `git status`, `git rev-list` |
| Environnement | prod Netlify `passio-app.netlify.app` + Supabase `njkiyoklssvefstljemx` (West EU) | `supabase projects list` |
| Global Health Score | **NON CALCULÉ** — composantes non encore arrêtées (cf. audit conjoint à venir) | — |
| Functional Score | **NON MESURÉ** — la cartographie fonctionnelle n'existe pas encore | — |
| Performance Score | **NON MESURÉ** — aucune mesure p50/p95 d'interaction à ce jour | — |
| Security Score | **PARTIEL** — RLS active sur 34/34 tables ; pas de test d'intrusion applicatif rejoué ce jour | requête `pg_class`/`pg_policies` |
| Test Score | **521 passés / 1 flaky / 19 skippés** en CI sur `c2e3e1b` (15,5 min) + 6 sur l'artefact `dist`. Les cross-compte n'ont PAS été rejoués — voir la baseline. | Playwright (CI) |

## BASELINE MESURÉE (2026-08-29)

> Remesurée ce jour sur `c2e3e1b`. **Ce qui n'a pas pu être exécuté porte `NON MESURÉ` et sa raison** — jamais une estimation.

| Vérification | Commande | Résultat |
|---|---|---|
| Syntaxe des 37 fichiers JS | `node --check js/*.js` | ✅ 0 erreur |
| Collisions de globals | `npm run audit:globals` | ✅ 1411 déclarations, 37 fichiers, 0 collision |
| Handlers inline fantômes | `npm run audit:handlers` | ✅ 0 fantôme |
| Échappement contextuel | `npm run audit:echappement` | ✅ 75 signalements, tous dans le socle relu |
| Tests creux | `npm run audit:tests` | ✅ 65 specs, aucun autoréférentiel |
| Stub Supabase hors ligne | `npm run audit:supa-stub` | ✅ 44 membres, tous couverts |
| Clés de télémétrie vs filtre PII | `npm run audit:telemetry-keys` | ✅ 78 clés, toutes filtrées |
| Build prod | `node scripts/build.js` | ✅ index 609 346 o + app.js 2 034 891 o + css 403 410 o |
| Tests e2e par défaut | CI, `npx playwright test` | ✅ **521 passés, 1 flaky, 19 skippés**, 15,5 min |
| Gate artefact production | CI, `PASSIO_CIBLE=dist` | ✅ 6 passés, 5,9 s |
| Flake `interactions.spec.js` | `--repeat-each=3 --retries=0` | ✅ **51/51, 0 flaky** (9,4 min) — cf. `RACE-LIKE-003` |
| Déploiement production | GitHub Actions → Netlify | ✅ « Deploy is live », `c2e3e1b` |
| Tests cross-compte réels | `PASSIO_E2E_MULTI=1` | ⛔ **NON MESURÉ** — le proxy réseau de l'environnement d'exécution refuse `njkiyoklssvefstljemx.supabase.co` (`connect_rejected`, politique d'organisation). Ni vert, ni rouge : **non lancé**. |
| RLS prod | `pg_class` / `pg_policies` | ⛔ **NON MESURÉ** — Supabase injoignable (même cause). |
| Accueil prod | `curl` | ⛔ **NON MESURÉ** — le proxy refuse `passio-app.netlify.app`. La mise en ligne est prouvée par le job Actions, pas par une requête d'ici. |
| Tests backend dashboard | `cd dashboard && npm test` | ⛔ **NON MESURÉ** — non lancé ce jour. |

## BASELINE MESURÉE (2026-08-15 — historique)

| Vérification | Commande | Résultat |
|---|---|---|
| Syntaxe des 19 fichiers JS | `node --check js/*.js` | ✅ OK |
| Collisions de globals | `npm run audit:globals` | ✅ 1330 déclarations, 19 fichiers, 0 collision |
| Handlers inline fantômes | `npm run audit:handlers` | ✅ 796 handlers, 1265 appels, 1937 définitions, 0 fantôme |
| Échappement contextuel | `npm run audit:echappement` | ✅ 75 signalements, tous dans le socle relu |
| Build prod | `node scripts/build.js dist/index.html` | ✅ index 205 827 o + app.js 1 835 114 o + styles.css 305 265 o |
| Tests e2e par défaut | `npx playwright test` | ⚠️ 146 passés, **1 flaky**, **12 skippés**, 4,3 min |
| Tests cross-compte réels | `PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite` | ✅ 11 passés, 3,5 min, nettoyage vérifié (0 compte e2e résiduel) |
| Tests backend dashboard | `cd dashboard && npm test` | ✅ 89 passés, 0 échec |
| RLS prod | `pg_class` / `pg_policies` | ✅ **34/34 tables avec RLS activée**, 1 à 5 policies chacune |
| Accueil prod | `curl` | ✅ HTTP 200, 123 864 octets, 0,76 s |
| Volume télémétrie | `telemetry_events` | ~20 565 lignes |

## INCIDENTS ACTIFS

| ID | Sév. | Domaine | Problème | Cause racine | Statut | Correctif | Test |
|---|---|---|---|---|---|---|---|
| `CI-GATE-001` | **P1** | CI / release gate | La CI valide chaque déploiement prod avec une suite qui **n'exerce ni les RLS, ni le cross-compte, ni le realtime, ni la confidentialité**. | `.github/workflows/deploy.yml` lance `npx playwright test` sans `PASSIO_E2E_MULTI` / `PASSIO_QA_CAMPAIGN` → `multi-comptes.spec.js`, `confidentialite.spec.js`, `qa-campaign.spec.js` sont skippés (les 12 « skipped »). | **FIXED_LOCALLY** | Noyau `tests/e2e/authz-critical.spec.js` : 9 invariants d'autorisation, non skippable, **aucun secret CI requis** (inscription par la clé anon). Étape dédiée en tête du workflow. | ✅ vert en 2,7 s contre la base réelle |
| `TEL-IDENT-002` | **P1** | Télémétrie / observabilité | **Fenêtre pré-auth 100 % perdue** (mesuré : 20 envois → 20 × HTTP 401), **empoisonnement de lot** (l'événement `null` légitime meurt avec le poison dans le même insert multi-lignes), et **l'alarme `server_reject` rejetée par la cause qu'elle signale**. | L'app se forge une identité locale `u_xxxx` avant toute authentification (`getMyUserId` app-08, puis `emoji-misc` à 100 ms). `telemetry.js` la recopiait dans `user_id`. Un tel id n'est ni `NULL` ni `auth.uid()` : il ne satisfait jamais `WITH CHECK (user_id IS NULL OR user_id = auth.uid()::text)`. | **FIXED_LOCALLY** | `js/telemetry.js` : ne transmettre qu'un UUID d'authentification, tout le reste à `NULL` ; désinfection aussi **au flush** (couvre le backlog rejoué sous un autre compte). | ✅ `tests/e2e/telemetrie-preauth.spec.js` — après : 1 envoi, HTTP 201, les 2 événements sauvés |
| `TEL-NOISE-004` | **P2** | Télémétrie / hygiène des données | **79 % de la table de télémétrie était du bruit de test** : `development` 40 625 événements contre `production` 10 532 (mesuré le 2026-08-16). | Une seule base Supabase, et la télémétrie **active par défaut** sur localhost : les ~15 specs e2e écrivaient en production à chaque exécution. Aggravé par le correctif `TEL-IDENT-002`, qui a transformé du bruit *rejeté* en bruit *stocké*. | **✅ CLOS le 2026-08-16** | En local, opt-in explicite (`?telemetry=1`). **Purge exécutée : 44 960 lignes `development` supprimées**, `production = 10 532` intacte, vacuum passé. | ✅ 2 tests en sens inverse : un envoi forcé part (201) / aucun envoi non sollicité |
| `SYNC-B64-005` | **P1** | Performance / synchro d'état | `user_state` : p95 = 2 844 ms, **max 43 199 ms** sur le 2ᵉ endpoint le plus appelé (757 appels). État médian 1 288 o, **plus gros état 4 731 kB** — facteur 3 700×. | `avatarPhoto` + `coverPhoto` stockées en **base64** (2 352 kB chacune) dans l'état synchronisé, soit 99,7 % du blob renvoyé à chaque synchro. Violation d'ADR-004. `_syncableState()` expurgeait déjà le base64 **mais seulement pour les profils passion**, pas pour les photos du compte. | **FIXED_LOCALLY** | Expurgation étendue aux photos du compte, à la frontière de synchronisation (un seul endroit, couvre tous les producteurs). Aucune mutation de données : la prochaine synchro réécrit l'état expurgé. | ✅ `tests/e2e/etat-sync-base64.spec.js`, **mutation-testé** (échoue sans le correctif) |
| `CONV-RESUR-006` | **P2** | Messagerie / persistance | **Une conversation et un message privé supprimés reviennent** après redémarrage. Reproduit : `{"secretRevenu":true,"conv2Revenue":true}`. | Deux stores : `localStorage` (écriture synchrone) et IndexedDB (**asynchrone, best-effort, résultat jamais lu**). Au boot, `_unionConvsById` fusionne **sans pierre tombale**. Si l'onglet se ferme entre les deux écritures, la suppression n'existe que d'un côté et l'union la défait. | **✅ CORRIGÉ le 2026-08-16** — journal de suppressions borné (TTL 30 j, 2 000 entrées), filtrage en un seul point à la sortie de la fusion, clé inscrite dans `ACCOUNT_SCOPED_KEYS`. `.passio/adr/ADR-008`. | ✅ `tests/e2e/conv-suppression.spec.js` — 3 tests : le supprimé ne revient pas, **le non-supprimé n'est pas perdu** (contre-épreuve), bornes appliquées. **Mutation-testé** |
| `FWD-SILENT-010` | **P2** | Messagerie / écriture silencieuse | **Un message transféré dont l'écriture échoue restait affiché comme envoyé** — aucun statut d'échec, aucune mise en file de renvoi, disparition au rechargement. Mutation-testé : sans correctif, `statut: undefined`. | `_forwardTo` avalait les deux callbacks (`.then(function(){}, function(){})`). Le SDK ne lève pas sur un refus RLS : sans lire `{ error }`, l'échec est invisible. | **FIXED_LOCALLY** — même traitement que le chemin d'envoi principal (statut « failed » + outbox + renvoi), qui est vingt lignes plus bas dans le même fichier et le faisait déjà correctement. | ✅ `tests/e2e/transfert-message.spec.js` — échec **et** succès (une correction qui marquerait tout en échec passerait le premier test seul) |
| `NOTIF-FORGE-009` | **P1** | Intégrité / usurpation | **N'importe quel compte peut fabriquer une notification vers n'importe qui, au nom de n'importe qui.** `notifications` est scellée en SELECT/UPDATE/DELETE (`user_id = auth.uid()`) mais son **INSERT vaut `true`** — en double. Colonnes exposées : destinataire, auteur revendiqué, contenu libre, lien. | Une notification est cross-compte par nature (A aime le post de B → A écrit la ligne dont B est le destinataire). Contraindre `user_id` étant impossible, la contrainte a été abandonnée — alors que c'était l'**auteur** qu'il fallait contraindre. | **MIGRATION PRÊTE, NON APPLIQUÉE** — `migration_notifications_auteur.sql` : `with check (from_id = (select auth.uid())::text)`. **Sans rupture, vérifié** : `supaInsertNotif` est le seul insert de l'app et renseigne déjà `from_id = MY_UID`. | test d'intrusion à ajouter **en même temps** que la migration, pas avant |
| `BLOC-ACCES-008` | **P1** | Confidentialité / Trust & Safety | **Bloquer quelqu'un ne lui retirait pas l'accès.** Sur un compte privé, la personne bloquée continuait de voir tous les posts. Prouvé en A/B : sans correctif, après blocage, `Received: 1` — le post reste visible. | `blockUser` supprimait **mon** abonnement vers elle, jamais **le sien** vers moi. Or `post_is_visible` accorde l'accès à un compte privé sur exactement `follows.follower_id = auth.uid() AND following_id = author`. Le blocage était donc purement cosmétique là où il compte le plus. | **FIXED_LOCALLY** — `supaBlockUser` retire aussi l'abonné. **La base l'autorisait déjà** : `follows` porte une policy `DELETE (following_id = auth.uid())` faite pour ça ; le client ne s'en servait pas. Aucun changement de RLS nécessaire. | ✅ `tests/e2e/blocage-acces.spec.js` — cross-compte réel, **précondition vérifiée** (B voyait le post avant), appelle la **vraie** `supaBlockUser`. **Mutation-testé** |
| `FEED-RT-007` | **P3** | Fil / temps réel | Un post reçu en temps réel **s'affichait puis s'effaçait** jusqu'au cycle de rafraîchissement suivant. Prouvé en A/B : sans correctif le post est perdu, avec il survit. | `startFeedRefreshLoop` fait `state.supabasePosts = posts.concat(extra)`, où `posts` est un instantané serveur pris **avant** l'arrivée du post et `extra` ne contient que `_feedExtraPosts`. Le handler temps réel n'alimentait pas ce tableau de garde. Auto-réparant au cycle suivant, donc jamais signalé comme une perte. | **FIXED_LOCALLY** — logique extraite dans `feedAddRealtimePost()`, qui alimente les deux tableaux. L'extraction n'est pas cosmétique : tant que la logique vivait dans le callback `postgres_changes`, un test ne pouvait que la recopier — et un test qui recopie le code qu'il vérifie ne garde rien. | ✅ `tests/e2e/feed-realtime-course.spec.js` — survie, idempotence, non-duplication sur 3 cycles. **Mutation-testé A/B** |
| `RACE-LIKE-003` | **P3** | Fil / affichage optimiste | `interactions.spec.js` flaky : `element was detached from the DOM`. | **ÉTABLIE** : fragilité de la MISE EN PLACE du test, pas une race applicative — rendus différés du boot, animation `like-pop`, et transitions de l'en-tête rétractable qui déplacent la carte sous le curseur. Le harnais `attendreFilStable` les couvre toutes les trois. | **✅ CLOS le 2026-08-29** | harnais stabilisé (`tests/e2e/interactions.spec.js`) | ✅ **51 exécutions consécutives, `--retries=0` : 51 passés, 0 flaky.** Ne prouve pas l'absence définitive de flake ; prouve qu'il ne se reproduit pas en 51 tirages **sans filet de retry**. |
| `SHARE-PASSION-011` | **P2** | Publication / partage d'expérience | Partager le souvenir d'une activité dont la passion n'est pas l'une des siennes publiait le post **sans passion** → **invisible dans le fil de son propre auteur** (le fil est filtré par défaut sur les passions des profils) et sans provenance en base. | `shareEventExperience` faisait `sel.value = ev.passion`. **Affecter `select.value` avec une valeur sans `<option>` correspondante NE LÈVE PAS** : le select passe silencieusement à `""`. Le `try/catch` qui entourait la ligne ne pouvait rien attraper. | **✅ EN PROD le 2026-08-29** (`c2e3e1b`) | On ne force que si l'option existe ; sinon on garde l'identité active. Filet à la publication. | ✅ `tests/e2e/partage-experience-passion.spec.js`, **mutation-testé** (2 des 3 rougissent sans le correctif ; le 3ᵉ passe dans les deux sens et interdit un « correctif » qui ne forcerait plus rien) |
| `CONV-FLAKY-012` | **P3** | Tests / messagerie | `conv-suppression.spec.js:33` remonte **flaky** dans la CI du 2026-08-29. | **NON ÉTABLIE** — une seule occurrence, aucune mesure répétée. Ne pas conclure. | DETECTED | — | à rejouer en `--repeat-each` sans retries, comme `RACE-LIKE-003` |

### Issus de l'analyse croisée (détail : `PASSIO_INITIAL_JOINT_AUDIT.md`)

| ID | Sév. | Sujet | Statut |
|---|---|---|---|
| `F4` | P2 élevé | Usurpation par champs d'affichage dénormalisés (`author_name`, `author_photo`) — texte libre non recoupé avec `profiles`, affiché tel quel | **✅ APPLIQUÉ EN PROD le 2026-08-16.** 4 triggers d'écriture + 1 de propagation + 4 index + 2 fonctions vérifiés en base. Backfill passé : **22 lignes réalignées** (video_lives 5, event_comments 15, step_interactions 2). Invariant ajouté au gate : usurpation neutralisée à l'INSERT **et** à l'UPDATE |
| `F5` | P1–P2 | Version skew PWA — tout push déploie, donc un onglet ouvert traverse le déploiement | **COUVERT** — `tests/e2e/version-skew.spec.js`, 5 assertions, 1,8 s. L'architecture était déjà saine ; le test empêche sa dégradation. Assertions mutation-testées (4 mutations détectées) |
| `F6` | — | Provenance du profil passionnel : `passion_id` existe sur les contenus, absent de **toutes** les tables d'interaction, et sans aucune contrainte | **✅ OPTION C APPLIQUÉE le 2026-08-16** (ADR-007). Référentiel `passions` créé : 19 entrées, **5 clés étrangères**, RLS lecture seule (aucune policy d'écriture → un client ne peut pas déclarer une passion pour la légitimer ensuite). L'extension aux tables d'interaction reste volontairement non faite |
| `F7` | P1 | Score de santé en moyenne pondérée : 3 bugs critiques ouverts affichaient encore 75/100, aucun facteur d'autorisation | **CORRIGÉ** — `santé = pire domaine critique` + second chiffre CONFIANCE |

**Correction d'une affirmation antérieure sur `TEL-IDENT-002`** : j'avais écrit que la perte n'était pas silencieuse, un `server_reject` étant émis. C'est **faux** — cet événement emprunte la même file, la même auth et la même policy, et se faisait donc rejeter par la cause exacte qu'il signalait. Vérifié par observation réseau.

## COUVERTURE FONCTIONNELLE

**NON ÉTABLIE.** `PASSIO_FUNCTIONAL_MAP.md` et la matrice d'interactions UI n'existent pas encore. Aucun pourcentage de couverture ne sera affiché ici avant qu'un inventaire réel des écrans/actions ne soit produit — un chiffre inventé serait pire que l'absence de chiffre.

Ce qui est couvert par des tests aujourd'hui (par nom de spec, sans prétendre à l'exhaustivité fonctionnelle) : smoke, access-gate, navigation, cadrage, contextual-nav, feed ranking, feed malformé, interactions, profils-types, échappement, audit identité/emoji, dist-build, IRL, CDV, **multi-comptes** (opt-in), **confidentialité** (opt-in), campagne QA (opt-in).

## PERFORMANCE

**Mesuré le 2026-08-16.** Le chiffre « 1,84 Mo de JS » qui circulait dans l'audit conjoint était la **source non minifiée** — il ne décrivait rien de ce que l'utilisateur télécharge.

### Ce qui est réellement servi en production

| Ressource | Brut (minifié) | **Transféré (compressé)** |
|---|---|---|
| `index.html` | 124 194 o | **33 466 o** |
| `app.js` | 1 109 340 o | **287 164 o** |
| `styles.css` | 199 224 o | **34 221 o** |
| **Total** | 1,43 Mo | **≈ 355 Ko** |

355 Ko pour une application sociale complète : **le téléchargement n'est pas le problème.** Aucune optimisation de poids ne se justifie sur cette base.

### Coût processeur — ⚠️ CHIFFRES CORRIGÉS le 2026-08-16

**Les valeurs publiées ici pendant plusieurs heures étaient fausses, gonflées d'environ 3,5×.** La mesure d'origine tournait pendant que la suite complète s'exécutait en arrière-plan : elle mesurait la charge de la machine autant que celle de l'application.

Baseline réelle, **machine au repos**, bridage CPU ×4, **médiane de 3 mesures** :

| Indicateur | Publié à tort | **Réel** |
|---|---|---|
| Landing affichée | 3 946 ms | **1 501 ms** |
| DOMContentLoaded | 2 064 ms | **623 ms** |
| First Contentful Paint | — | **296 ms** |
| Tâches longues | 11 | **6** |
| Cumul | 2 575 ms | **728 ms** |
| Plus longue tâche | 496 ms | **145 ms** |

**Conséquence : il n'y a pas de problème de démarrage à traiter.** Sous bridage ×4 — soit un mobile modeste — l'app peint en 296 ms et atteint la landing en 1,5 s, sans aucune tâche dépassant 145 ms. Toute la piste « 2,5 s de fil principal bloqué » reposait sur une mesure contaminée.

**Ce que cette erreur a coûté** : deux investigations complètes menées sur une prémisse fausse — la couverture JS (levier annoncé « massif », puis mesuré à 24 ms) et l'hypothèse CSS (infirmée par A/B, retirer le CSS *dégrade* de 1 488 ms). Aucune n'aurait eu lieu avec la bonne baseline.

**Règle qui en découle** : une mesure de performance n'a de valeur que sur machine au repos, répétée, et médiane — jamais une exécution unique en parallèle d'autre chose.

**Conséquence pour la suite** : toute optimisation doit viser le **découpage du travail de démarrage**, pas la réduction du poids.

### Couverture JS au démarrage — mesurée le 2026-08-16, et elle rouvre le sujet

J'avais déclaré ce sujet **clos** au motif que le profilage CPU ne désignait aucune fonction coupable. La revue croisée a objecté que je l'avais fermé « parce que la solution évidente était risquée, pas parce que le problème était insignifiant ». La mesure lui donne raison :

| Fichier | Taille | Exécuté avant le 1ᵉʳ écran |
|---|---|---|
| `app-06-reels-partage` | 134 Ko | **12 %** |
| `app-04-comments-shop` | 251 Ko | **13 %** |
| `app-08-ui-modals-tour` | 281 Ko | **13 %** |
| `app-03-posts-vlogs` | 261 Ko | 16 % |
| `app-05-config-profil` | 180 Ko | 16 % |
| `app-02-state-utils` | 161 Ko | 17 % |
| `app-07-ia-explore-irl` | 268 Ko | 18 % |
| `app-09-boot-pwa` | 80 Ko | 26 % |
| `app-01-diag-seed` | 96 Ko | 98 % |
| **Total** | **1 714 Ko** | **20 % — soit 1 367 Ko jamais exécutés** |

**⚠️ Correction — j'ai écrit ici que « le levier existe, et il est massif ». C'était faux, et la mesure suivante l'a démenti.**

Coût d'injection réel, fichier par fichier (CPU ×4, réseau chaud, cache de code neutralisé) :

```
cumul des 9 fichiers = 133 ms
   24 ms  app-06-reels-partage      ← le candidat au découpage
   19 ms  app-01-diag-seed
   15 ms  app-03-posts-vlogs
    8 ms  app-08-ui-modals-tour     (281 Ko, et 8 ms)
```

**133 ms sur 2 575 ms de tâches longues, soit 5 %.** Extraire `app-06` économiserait au mieux **24 ms**.

La raison tient à V8 : le **pré-parse est paresseux**. Une fonction n'est analysée en profondeur qu'au premier appel — donc les 1 367 Ko jamais exécutés ne coûtent presque rien. La couverture à 20 % est un chiffre **exact mais non actionnable** : elle mesure ce qui n'est pas exécuté, pas ce qui coûte.

**Sujet du découpage : CLOS, cette fois sur une preuve.** C'était exactement le critère demandé par la revue croisée — « si retirer ce chunk ne déplace pas les 2 575 ms, tu auras une vraie raison de fermer le sujet ».

**Ce qui reste ouvert** : les ~2 440 ms restants ne viennent donc **pas** du chargement des scripts. Ils sont dans le travail de démarrage lui-même — construction du DOM, calcul de styles, mise en page, et le `boot()` de l'app. C'est là qu'il faudra chercher, et nulle part ailleurs.

⚠️ **Piège de mesure rencontré** : un premier calcul annonçait « 100 % exécuté » sur tous les fichiers. Les plages de couverture V8 sont **imbriquées** — additionner les plages `count > 0` compte l'enveloppe du fichier entier. Il faut une carte d'octets et démarquer les plages `count === 0`.

### Latences réelles des appels API (télémétrie de production)

| Endpoint | n | p50 | p95 | max | Verdict |
|---|---|---|---|---|---|
| `/rest/v1/user_state` | 757 | 156 ms | **2 844 ms** | **43 199 ms** | ❌ défaut réel → `SYNC-B64-005`, corrigé |
| `/functions/v1/notify-call` | 70 | 894 ms | 4 337 ms | 4 674 ms | ✅ **pas un défaut** — appelé en *fire-and-forget*, en complément du ring realtime qui couvre le cas app ouverte. Ce chemin ne sert qu'à réveiller une app fermée, où la latence de la push domine de toute façon |
| `/rest/v1/follows` | 351 | 99 ms | 1 275 ms | 6 438 ms | à surveiller |
| `/rest/v1/profiles` | 773 | 80 ms | 1 130 ms | 8 849 ms | à surveiller |

### Advisors Supabase (mesurés le 2026-08-16)

**Sécurité — 9 avertissements, tous déjà documentés comme délibérés** (2026-08-09) : 4 helpers de policies RLS × 2 rôles (`authenticated` doit garder `EXECUTE`, sinon les policies cassent) + `auth_leaked_password_protection`, un simple bascule Auth gratuit encore à activer.

**Vérification de mes propres migrations** : mes deux fonctions `SECURITY DEFINER` de cette nuit (`identite_affichage_canonique`, `propager_identite_affichage`) **n'apparaissent pas** — le `revoke execute` a bien pris. La table `passions` non plus : RLS active avec sa policy.

**Performance — 147 avertissements** :

| Type | Nb | Traitement |
|---|---|---|
| `auth_rls_initplan` | **85** | ⏳ **Scale readiness, non fait.** `auth.uid()` réévalué à chaque ligne au lieu d'une fois. Correctif mécanique — envelopper en `(select auth.uid())` — mais il touche ~85 policies, la seule frontière de sécurité de l'app. Impact **nul aujourd'hui** (tables minuscules), réel à l'échelle. À faire sous supervision, suite cross-compte après CHAQUE table |
| `multiple_permissive_policies` | 42 | même chantier, même prudence |
| `unindexed_foreign_keys` | 7 | ✅ **corrigé** — `migration_index_cles_etrangeres.sql`. Dont **5 introduites par ma propre migration des passions**, posée sans index de couverture |
| `unused_index` | 13 | ❌ **volontairement non traité.** Sur une beta à faible trafic, « inutilisé » = « pas encore utilisé » : `pg_stat_user_indexes` est quasi vide. Supprimer sur cette base, c'est supprimer sur une absence de preuve, pas une preuve d'absence |

### Toujours non mesuré

La latence **perçue** des interactions (temps entre le tap et le retour visuel pour un like, un commentaire, une publication) — distincte de la latence réseau ci-dessus, qui est masquée par l'affichage optimiste. Aucun p50/p95 n'existe sur ce ressenti ; toute affirmation de réactivité resterait non fondée.

## TESTS DE SYNCHRONISATION A ↔ B ↔ C

Exécutés réellement le 2026-08-15 (base prod, comptes créés puis purgés) : 11 scénarios cross-compte verts, dont like de commentaire cross-compte avec vérification **en base**, like + réaction d'événement cross-compte, règle « 1 réaction par personne » vérifiée en base, messagerie entre 2 comptes réels.

**Non prouvé à ce jour** : la latence de propagation (aucune mesure), le multi-appareil réel (les tests utilisent deux contextes de navigateur, pas deux appareils), le rôle d'un troisième compte témoin C sur l'ensemble des interactions.

## DETTE D'INFRASTRUCTURE (signalée, non traitée)

| Sujet | Détail | Pourquoi non traité |
|---|---|---|
| `auth_rls_initplan` × 85 | `auth.uid()` réévalué à chaque ligne. Correctif mécanique : `(select auth.uid())`. Impact **nul** aux volumes actuels, **réel à l'échelle** | Touche ~85 policies, la seule frontière de sécurité de l'app. Se fait table par table, avec la suite cross-compte après chacune |
| Node 20 déprécié en CI | `actions/checkout@v4` et `actions/setup-node@v4` visent Node 20, forcés sur Node 24 par GitHub. Le repli disparaîtra | Modifier les actions, c'est modifier le **chemin de déploiement**. Le bump se vérifie sur une PR, pas en fin de nuit |
| `unused_index` × 13 | Signalés par les advisors | Sur une beta à faible trafic, « inutilisé » = « pas encore utilisé ». Ce serait agir sur une absence de preuve |

## PROCHAINES PRIORITÉS

1. **Débloquer la boucle croisée ChatGPT** (prérequis du fondateur : connecter l'extension Claude-in-Chrome). Le dossier est prêt.
2. `CI-GATE-001` — décider comment faire tourner les tests cross-compte en CI sans polluer la prod.
3. `TEL-IDENT-002` — réconcilier l'identité au flush.
4. Cartographie fonctionnelle réelle (`PASSIO_FUNCTIONAL_MAP.md`) — préalable à tout score de couverture.
5. Instrumentation des latences d'interaction — préalable à tout score de performance.
6. `RACE-LIKE-003` — trancher entre fragilité de test et vraie race.
