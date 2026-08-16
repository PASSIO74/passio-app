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
| `TEL-NOISE-004` | **P2** | Télémétrie / hygiène des données | **79 % de la table de télémétrie était du bruit de test** : `development` 40 625 événements contre `production` 10 532 (mesuré le 2026-08-16). | Une seule base Supabase, et la télémétrie **active par défaut** sur localhost : les ~15 specs e2e écrivaient en production à chaque exécution. Aggravé par le correctif `TEL-IDENT-002`, qui a transformé du bruit *rejeté* en bruit *stocké*. | **FIXED_LOCALLY** | En local, opt-in explicite (`?telemetry=1`). Purge de l'accumulé préparée (`purge_telemetry_development.sql`), **non exécutée** — à passer APRÈS déploiement, sinon la suite e2e la reconstitue. | ✅ 2 tests en sens inverse : un envoi forcé part (201) / aucun envoi non sollicité |
| `RACE-LIKE-003` | **P3** | Fil / affichage optimiste | `interactions.spec.js:126` flaky : `element was detached from the DOM`. Le test porte sur l'annulation d'un affichage optimiste pendant que le fil est reconstruit et qu'une écriture est en vol. | non établie — peut être une fragilité du test OU une vraie race re-render / rollback | DETECTED | — | le test existe |

### Issus de l'analyse croisée (détail : `PASSIO_INITIAL_JOINT_AUDIT.md`)

| ID | Sév. | Sujet | Statut |
|---|---|---|---|
| `F4` | P2 élevé | Usurpation par champs d'affichage dénormalisés (`author_name`, `author_photo`) — texte libre non recoupé avec `profiles`, affiché tel quel | **Migration PRÊTE, NON APPLIQUÉE** — `migrations/migration_identite_affichage_canonique.sql`. Décision produit obtenue : **nom ACTUEL du profil** → 2 triggers (réécriture à l'écriture + propagation au renommage) plutôt qu'une jointure sur les chemins chauds. Index manquants ajoutés |
| `F5` | P1–P2 | Version skew PWA — tout push déploie, donc un onglet ouvert traverse le déploiement | **COUVERT** — `tests/e2e/version-skew.spec.js`, 5 assertions, 1,8 s. L'architecture était déjà saine ; le test empêche sa dégradation. Assertions mutation-testées (4 mutations détectées) |
| `F6` | — | Provenance du profil passionnel : `passion_id` existe sur les contenus, absent de **toutes** les tables d'interaction, et sans aucune contrainte | **DÉCISION PRODUIT EN ATTENTE** — `.passio/adr/ADR-007` |
| `F7` | P1 | Score de santé en moyenne pondérée : 3 bugs critiques ouverts affichaient encore 75/100, aucun facteur d'autorisation | **CORRIGÉ** — `santé = pire domaine critique` + second chiffre CONFIANCE |

**Correction d'une affirmation antérieure sur `TEL-IDENT-002`** : j'avais écrit que la perte n'était pas silencieuse, un `server_reject` étant émis. C'est **faux** — cet événement emprunte la même file, la même auth et la même policy, et se faisait donc rejeter par la cause exacte qu'il signalait. Vérifié par observation réseau.

## COUVERTURE FONCTIONNELLE

**NON ÉTABLIE.** `PASSIO_FUNCTIONAL_MAP.md` et la matrice d'interactions UI n'existent pas encore. Aucun pourcentage de couverture ne sera affiché ici avant qu'un inventaire réel des écrans/actions ne soit produit — un chiffre inventé serait pire que l'absence de chiffre.

Ce qui est couvert par des tests aujourd'hui (par nom de spec, sans prétendre à l'exhaustivité fonctionnelle) : smoke, access-gate, navigation, cadrage, contextual-nav, feed ranking, feed malformé, interactions, profils-types, échappement, audit identité/emoji, dist-build, IRL, CDV, **multi-comptes** (opt-in), **confidentialité** (opt-in), campagne QA (opt-in).

## PERFORMANCE

| Flux | Actuel | Cible | Statut |
|---|---|---|---|
| Chargement de la page d'accueil prod | 123 864 o / 0,76 s | à définir | mesuré |
| Poids JS applicatif servi | app.js 1,84 Mo avant minification CI (terser) — **poids réellement servi non mesuré** | à définir | NON MESURÉ |
| Démarrage app, navigation, fil, like, commentaire, publication, message | — | — | **NON MESURÉ** |

Aucun p50/p75/p95 d'interaction n'existe à ce jour. Toute affirmation de rapidité serait non fondée.

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
