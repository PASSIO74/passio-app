# PASSIO — Le staging, et comment le viser

> Ouvert le 2026-09-14 (SUP-04 / TCI-04 / EXP-11 de la contre-revue Astra). Un seul projet Supabase servait au développement, aux aperçus de PR, aux tests à comptes réels — qui **écrivent** en production avec la clé de service et y purgent des comptes — et à la production elle-même. Le projet de pré-production existait depuis le 17/08 et n'avait jamais servi.

## Le projet

| | Production | Staging |
|---|---|---|
| ref | `njkiyoklssvefstljemx` | `fcksxofaelcdmmifnwjo` (« PASSIO staging ») |
| région / PG | eu-west-1 / 17.6 | eu-west-1 / 17.6 |
| structure | — | identique le 2026-09-14 (16 compteurs d'objets égaux, `npm run schema:executable` + `npm run restaurer -- --schema`, voir `docs/RECUPERATION.md`). ⚠️ **A dérivé depuis**, mesuré le 2026-11-04 : 48 tables contre 52, publication plus large (`cdv_*`), et son journal ne porte que les deux couches de R25. Les migrations récentes n'y passent pas d'office : une suite à comptes réels n'éprouve une migration que si on l'y a appliquée d'abord |
| données | réelles | **aucune donnée personnelle** : `passions`, `passion_relations`, `access_policies` seulement (`npm run restaurer -- --tables passions,passion_relations,access_policies`) ; les comptes qui y vivent sont ceux des bancs, purgés par `npm run purge:e2e:rest` |
| Edge Functions | 4 déployées | **aucune** (à déployer avec `supabase functions deploy --project-ref fcksxofaelcdmmifnwjo` quand un banc en aura besoin) |
| réglages auth | confirmation d'e-mail, captcha, mot de passe 8 | défaut Supabase — le banc de comptes n'y passe pas (`generate_link` + `verifyOtp`) |
| coût | plan Pro | second projet : calcul facturé ; `POST /v1/projects/<ref>/pause` le remet en pause |

⚠️ **Recalé le 2026-11-07** sur la structure de la production, empreintes égales, puis lots de l'audit appliqués. La tâche `pilotage_veille` qui appelait la production depuis ce projet est retirée. **Il ne suit pas tout seul** : une migration appliquée à la production sans lui le fait dériver, et ses suites vertes ne disent plus rien.

## Comment le client vise un projet

`js/app-08` lit **`window.PASSIO_SUPABASE_CIBLE = { url, anon }`** s'il est posé avant lui ; sinon, la production. Une cible partielle ou mal formée (URL qui n'est pas `https://<ref>.supabase.co`, clé absente) est **ignorée** : jamais une production à moitié détournée. Tout suit : SDK, REST direct, télémétrie (`window.PASSIO_SUPABASE`), jeton `sb-<ref>-auth-token` (dérivé de l'URL ; la purge de déconnexion cherche le jeton par motif, plus par nom de projet).

Trois façons de poser la cible :

1. **Les suites `prod` de Playwright** — `tests/e2e/cible-supabase.js` lit `PASSIO_SUPABASE_URL` + `PASSIO_SUPABASE_ANON` et pose le script d'initialisation avant chaque `page.goto` (les cinq suites directes + `qa-helper`) ; `compte-e2e.js` prend la clé `service_role` du même projet dans `SUPABASE_SERVICE_ROLE_KEY`. Verrou à la source : `tests/e2e/cible-supabase.spec.js` ④.

   ```bash
   PASSIO_SUPABASE_URL=https://fcksxofaelcdmmifnwjo.supabase.co \
   PASSIO_SUPABASE_ANON=<anon du staging> \
   SUPABASE_SERVICE_ROLE_KEY=<service_role du staging> \
   npx playwright test --project=prod
   ```

   **Mesuré le 14/09 à 21 h 27** : `authz-critical`, `blocage-acces`, `user-state-horodatage` **verts contre le staging** — comptes créés là-bas (`auth.users` : 5, tous `e2e`), production intacte (8 comptes, dernier du 12/09). Puis `npm run purge:e2e:rest` avec les mêmes variables : 0 compte.

2. **Un artefact** — `scripts/build.js` avec les deux mêmes variables écrit le script dans `dist/index.html` (une seule des deux = erreur, pas un silence). C'est le chemin des aperçus de PR sur le staging ; la CSP (`netlify.toml`, `_headers`) admet l'hôte du staging en `connect-src`.

3. **À la main** dans une page : `window.PASSIO_SUPABASE_CIBLE = {...}` avant les scripts de l'app.

## Les comptes de test : un jeu PERSISTANT (ADR-013 décision 4, D16-01, 2026-11-23)

Le staging partage les quotas de l'**organisation** Supabase avec la production. Au 20/11 il en consommait 35 % des utilisateurs actifs mensuels (MAU) : un compte créé puis connecté est un MAU, même supprimé dans la minute.

**Mesuré avant (lecture seule, journaux de 69 jobs « Suites production » du 17 au 22/11)** : **48 comptes créés par passage** — 21,7 par `signupUser` (journal `prêt (session…`), 16,9 par `signupAnonymous`, 9 par appel direct (authz 2, blocage 2, irl-ts 3, horodatage 1, suppression 1) ; la purge du teardown en retrouvait 39,9, les autres se supprimaient eux-mêmes. 82 passages non sautés en 7 jours : **~3 900 comptes par semaine**, plus 2 par passage du canari de la sentinelle (6 par jour).

**Après** : `creerCompteE2E` prend un compte du jeu `e2e_<couloir>_<parallèle>_<rang>@fixe.passio-e2e.test` (`tests/e2e/comptes-persistants.js`) dès que le banc vise explicitement un autre projet que la production (`PASSIO_SUPABASE_URL`/`ANON`). Le jeu s'amorce au premier passage (6 comptes au plus en CI : 2 workers × 3 comptes par test), puis **aucun compte n'est créé** ; seul `suppression-compte` prend encore un jetable, qu'il détruit — **1 par passage**. Chaque passage écrit son bilan (`[comptes-e2e] passage … : N créé(s), J jetable(s), R réutilisé(s)`, aussi dans le résumé du job) : c'est la mesure « après ».

- **Jamais supprimés.** Le sous-domaine `fixe.` échappe aux purges par motif, qui exigent le suffixe EXACT `@passio-e2e.test`. Un nettoyage de fin de suite passe par `supprimerComptesJetables`, qui épargne le jeu.
- **Repris neufs.** À chaque acquisition : 38 tables purgées pour ce compte (dont `user_safety` : une majorité déclarée ne recule jamais), conversations qu'il a créées comprises, et `user_metadata` vidé (nom, année, CGU, invitation). Le teardown purge aussi les contenus du jeu, **de son seul couloir** (`ci` en CI) : il ne vide jamais un village en séance ; `purge:storage` rend ses fichiers de moins de 1 Ko éligibles. La liste des tables couvre celle de la suppression de compte du produit (`TABLES_COMPTE`), journaux exceptés : le verrou compare les deux.
- **Le verrou.** Dans un passage, la partition (index parallèle, rang dans le test) interdit qu'un compte serve deux fois ; entre passages CI, le groupe `passio-e2e-prod` ; hors CI, un bail `app_metadata.e2e_bail` (15 min, relu après écriture) fait échouer en nommant le passage qui tient le compte. En CI un bail vivant est repris (le groupe garantit que son passage est mort) ; en local, celui d'un processus disparu du même poste aussi.
- **Production** : la barrière `rls-prod` (sans cible explicite) garde ses 2 comptes jetables par déploiement — un compte persistant y serait un profil de test durable parmi les vrais. `PASSIO_E2E_COMPTES_JETABLES=1` rend l'ancien comportement partout.
- **Les villages** prennent leurs propres couloirs, avec un bail qui couvre la séance : `village` (les 10 personnages, `e2e_village_0_<i>`, bail 40 min) et `village100` (les 4 yeux en parallèle 0, les 96 figurants en parallèle 1, bail 70 min, pris d'un coup par `acquerirLot`, purgés par paquets de 40). Avant : 10 et 100 comptes créés par séance, soit autant de MAU. Après : 10 et 100 comptes amorcés UNE fois, puis 0. En fin de séance, leurs contenus sont purgés (jamais les comptes) et la purge se prouve par relecture : plus aucune ligne `profiles`. Le manifeste du village à 100 garde son rôle (reliquat d'une séance tombée) ; une adresse de campagne d'avant le jeu (`@passio-capacite.test`) y est encore supprimée, comme avant.
- **Budget de diffusion temps réel** : il est compté PAR COMPTE (`passio_realtime_budget.consommer` : 120 effets/min, 2 000/h, 6 000/jour). Un compte du jeu l'accumule sur la journée ; à ~12 passages par jour et quelques messages par test, la marge est large, mais c'est le premier plafond à regarder si un test temps réel du staging rougit sur un refus.

Verrou : `tests/unit/comptes-persistants.test.mjs` — trois passages CI simulés sur un faux Supabase, le deuxième et les suivants à **0 compte créé** ; 96 figurants repris sans création ; les seuls jetables sont inscrits avec leur raison, et aucune suite ni module de banc ne crée de compte en direct. Banc réel depuis le poste : `node scripts/banc-comptes-persistants.mjs` (deux passages des suites sans `PASSIO_E2E_MULTI`, aucune purge par motif) — mesuré le 23/11 : 8 comptes amorcés, puis 0 créé et 8 réutilisés, 4/4 verts les deux fois.

## Ce qui reste (lot suivant, `.github` donc contre-revue)

- `deploy.yml` : faire tourner les suites `prod` **sur le staging** (secrets `STAGING_SERVICE_ROLE_KEY`, variables d'URL/anon), et ne garder sur la production que `authz-critical` comme barrière de déploiement — ou rien.
- `sentinelle-distante.yml` (le canari toutes les 4 h) : sur le staging.
- Aperçus de PR construits avec la cible staging.
- Déployer les 4 Edge Functions sur le staging quand `suppression-compte` (delete-account) y tournera.

Tant que ce lot n'est pas fusionné, la CI écrit toujours en production : ce document décrit la **capacité**, pas l'état de la chaîne.
