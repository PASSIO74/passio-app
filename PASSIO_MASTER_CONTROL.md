# PASSIO — Master Control

> **Tableau de bord humain de la qualification production.** Source de vérité machine : `passio_qa_registry.json`. Vue temps réel : `dashboard/`.
> Ce fichier ne duplique PAS `.passio/` (plan de contrôle : contexte, ADR, risques) ni `PASSIO_REPOSITORY_AUDIT.md` (état des lieux 2026-08-07). Il les chapeaute avec des **mesures datées**.
> Règle de ce document : **rien d'affirmé sans preuve exécutée**. Une case non mesurée s'écrit `NON MESURÉ`, jamais « OK ».

## STATUT GLOBAL

| Champ | Valeur | Source |
|---|---|---|
| Date | 2026-08-15 | — |
| Commit | `f3684a9` | `git log -1` |
| Branche | `main`, dépôt propre, synchro `origin` (0/0) | `git status`, `git rev-list` |
| Environnement | prod Netlify `passio-app.netlify.app` + Supabase `njkiyoklssvefstljemx` (West EU) | `supabase projects list` |
| Global Health Score | **NON CALCULÉ** — composantes non encore arrêtées (cf. audit conjoint à venir) | — |
| Functional Score | **NON MESURÉ** — la cartographie fonctionnelle n'existe pas encore | — |
| Performance Score | **NON MESURÉ** — aucune mesure p50/p95 d'interaction à ce jour | — |
| Security Score | **PARTIEL** — RLS active sur 34/34 tables ; pas de test d'intrusion applicatif rejoué ce jour | requête `pg_class`/`pg_policies` |
| Test Score | **146 / 159 exécutés par défaut** (1 flaky, 12 skippés) + 11 cross-compte réels lancés à la main | Playwright |

## BASELINE MESURÉE (2026-08-15)

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
| `CONV-RESUR-006` | **P2** | Messagerie / persistance | **Une conversation et un message privé supprimés reviennent** après redémarrage. Reproduit : `{"secretRevenu":true,"conv2Revenue":true}`. | Deux stores : `localStorage` (écriture synchrone) et IndexedDB (**asynchrone, best-effort, résultat jamais lu**). Au boot, `_unionConvsById` fusionne **sans pierre tombale**. Si l'onglet se ferme entre les deux écritures, la suppression n'existe que d'un côté et l'union la défait. | **DOCUMENTÉ, non corrigé** — `.passio/adr/ADR-008`. Ce n'est pas une erreur de conception : l'union corrigeait l'inverse (des messages disparaissaient). Le défaut est qu'aucun store ne distingue « jamais existé » de « supprimé ». | reproduit par script, non versionné (le test définitif accompagnera le correctif) |
| `RACE-LIKE-003` | **P3** | Fil / affichage optimiste | `interactions.spec.js:126` flaky : `element was detached from the DOM`. Le test porte sur l'annulation d'un affichage optimiste pendant que le fil est reconstruit et qu'une écriture est en vol. | non établie — peut être une fragilité du test OU une vraie race re-render / rollback | DETECTED | — | le test existe |

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

### Le vrai coût est sur le processeur

Mesuré avec un bridage CPU ×4 (approximation d'un mobile milieu de gamme) :

| Indicateur | Valeur |
|---|---|
| Landing affichée | 3 946 ms |
| DOMContentLoaded | 2 064 ms |
| Chargement complet | 2 966 ms |
| Durée de chargement des JS | 1 297 ms |
| **Tâches longues** | **11, cumulant 2 575 ms** |
| **Plus longue tâche** | **496 ms** |

C'est là qu'est le sujet : le fil principal est bloqué ~2,5 s cumulées au démarrage, avec une tâche de près d'une demi-seconde. Sur un mobile modeste, l'app paraît figée pendant ce temps.

**Conséquence pour la suite** : toute optimisation doit viser le **découpage du travail de démarrage**, pas la réduction du poids. Mesurer d'abord quelle tâche coûte 496 ms avant de toucher à quoi que ce soit.

### Latences réelles des appels API (télémétrie de production)

| Endpoint | n | p50 | p95 | max | Verdict |
|---|---|---|---|---|---|
| `/rest/v1/user_state` | 757 | 156 ms | **2 844 ms** | **43 199 ms** | ❌ défaut réel → `SYNC-B64-005`, corrigé |
| `/functions/v1/notify-call` | 70 | 894 ms | 4 337 ms | 4 674 ms | ✅ **pas un défaut** — appelé en *fire-and-forget*, en complément du ring realtime qui couvre le cas app ouverte. Ce chemin ne sert qu'à réveiller une app fermée, où la latence de la push domine de toute façon |
| `/rest/v1/follows` | 351 | 99 ms | 1 275 ms | 6 438 ms | à surveiller |
| `/rest/v1/profiles` | 773 | 80 ms | 1 130 ms | 8 849 ms | à surveiller |

### Toujours non mesuré

La latence **perçue** des interactions (temps entre le tap et le retour visuel pour un like, un commentaire, une publication) — distincte de la latence réseau ci-dessus, qui est masquée par l'affichage optimiste. Aucun p50/p95 n'existe sur ce ressenti ; toute affirmation de réactivité resterait non fondée.

## TESTS DE SYNCHRONISATION A ↔ B ↔ C

Exécutés réellement le 2026-08-15 (base prod, comptes créés puis purgés) : 11 scénarios cross-compte verts, dont like de commentaire cross-compte avec vérification **en base**, like + réaction d'événement cross-compte, règle « 1 réaction par personne » vérifiée en base, messagerie entre 2 comptes réels.

**Non prouvé à ce jour** : la latence de propagation (aucune mesure), le multi-appareil réel (les tests utilisent deux contextes de navigateur, pas deux appareils), le rôle d'un troisième compte témoin C sur l'ensemble des interactions.

## PROCHAINES PRIORITÉS

1. **Débloquer la boucle croisée ChatGPT** (prérequis du fondateur : connecter l'extension Claude-in-Chrome). Le dossier est prêt.
2. `CI-GATE-001` — décider comment faire tourner les tests cross-compte en CI sans polluer la prod.
3. `TEL-IDENT-002` — réconcilier l'identité au flush.
4. Cartographie fonctionnelle réelle (`PASSIO_FUNCTIONAL_MAP.md`) — préalable à tout score de couverture.
5. Instrumentation des latences d'interaction — préalable à tout score de performance.
6. `RACE-LIKE-003` — trancher entre fragilité de test et vraie race.
