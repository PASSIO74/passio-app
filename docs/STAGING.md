# PASSIO — Le staging, et comment le viser

> Ouvert le 2026-09-14 (SUP-04 / TCI-04 / EXP-11 de la contre-revue Astra). Un seul projet Supabase servait au développement, aux aperçus de PR, aux tests à comptes réels — qui **écrivent** en production avec la clé de service et y purgent des comptes — et à la production elle-même. Le projet de pré-production existait depuis le 17/08 et n'avait jamais servi.

## Le projet

| | Production | Staging |
|---|---|---|
| ref | `njkiyoklssvefstljemx` | `fcksxofaelcdmmifnwjo` (« PASSIO staging ») |
| région / PG | eu-west-1 / 17.6 | eu-west-1 / 17.6 |
| structure | — | **identique** (16 compteurs d'objets égaux, `npm run schema:executable` + `npm run restaurer -- --schema`, voir `docs/RECUPERATION.md`) |
| données | réelles | **aucune donnée personnelle** : `passions`, `passion_relations`, `access_policies` seulement (`npm run restaurer -- --tables passions,passion_relations,access_policies`) ; les comptes qui y vivent sont ceux des bancs, purgés par `npm run purge:e2e:rest` |
| Edge Functions | 4 déployées | **aucune** (à déployer avec `supabase functions deploy --project-ref fcksxofaelcdmmifnwjo` quand un banc en aura besoin) |
| réglages auth | confirmation d'e-mail, captcha, mot de passe 8 | défaut Supabase — le banc de comptes n'y passe pas (`generate_link` + `verifyOtp`) |
| coût | plan Pro | second projet : calcul facturé ; `POST /v1/projects/<ref>/pause` le remet en pause |

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

## Ce qui reste (lot suivant, `.github` donc contre-revue)

- `deploy.yml` : faire tourner les suites `prod` **sur le staging** (secrets `STAGING_SERVICE_ROLE_KEY`, variables d'URL/anon), et ne garder sur la production que `authz-critical` comme barrière de déploiement — ou rien.
- `sentinelle-distante.yml` (le canari toutes les 4 h) : sur le staging.
- Aperçus de PR construits avec la cible staging.
- Déployer les 4 Edge Functions sur le staging quand `suppression-compte` (delete-account) y tournera.

Tant que ce lot n'est pas fusionné, la CI écrit toujours en production : ce document décrit la **capacité**, pas l'état de la chaîne.
