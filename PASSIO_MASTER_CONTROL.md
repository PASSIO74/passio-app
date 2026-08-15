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
| `CI-GATE-001` | **P1** | CI / release gate | La CI valide chaque déploiement prod avec une suite qui **n'exerce ni les RLS, ni le cross-compte, ni le realtime, ni la confidentialité**. | `.github/workflows/deploy.yml` lance `npx playwright test` sans `PASSIO_E2E_MULTI` / `PASSIO_QA_CAMPAIGN` → `multi-comptes.spec.js`, `confidentialite.spec.js`, `qa-campaign.spec.js` sont skippés (les 12 « skipped »). | ROOT_CAUSE_FOUND | à concevoir (nécessite des identifiants de test en secrets CI + décision sur l'écriture en base depuis la CI) | les specs existent déjà et sont vertes en local |
| `TEL-IDENT-002` | **P2** | Télémétrie / observabilité | Lots de télémétrie rejetés (`42501`) et abandonnés au **changement d'identité** (déconnexion, changement de compte, expiration). Angle mort exactement sur les scénarios multi-compte/multi-appareil que le pilotage doit prouver. | `js/telemetry.js` : `user_id` estampillé **à la mise en file** (`window.MY_UID`), jeton d'`Authorization` lu **au flush**. Policy réelle : `WITH CHECK (user_id IS NULL OR user_id = auth.uid()::text)`. Si l'identité change entre les deux, aucun rafraîchissement de jeton ne réconciliera jamais les deux identités : le lot brûle ses `AUTH_MAX_RETRIES` puis est abandonné. | ROOT_CAUSE_FOUND | piste : au flush, remettre `user_id` à `NULL` (autorisé par la policy) pour tout événement dont l'auteur ne correspond plus à la session courante — l'événement survit, attribué par appareil/session | à écrire |
| `RACE-LIKE-003` | **P3** | Fil / affichage optimiste | `interactions.spec.js:126` flaky : `element was detached from the DOM`. Le test porte sur l'annulation d'un affichage optimiste pendant que le fil est reconstruit et qu'une écriture est en vol. | non établie — peut être une fragilité du test OU une vraie race re-render / rollback | DETECTED | — | le test existe |

**Observation honnête sur `TEL-IDENT-002`** : la perte n'est pas silencieuse — un événement `connectivity/server_reject` est émis avec le nombre d'événements abandonnés. Le défaut est l'abandon lui-même, pas l'opacité.

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
