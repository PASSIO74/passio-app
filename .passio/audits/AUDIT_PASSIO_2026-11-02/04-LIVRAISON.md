# Éléments de livraison — audit PASSIO 2026-11-02

Branche `audit/2026-11-02-qualite-securite`, PR **#681**, 13 commits, un par domaine puis coordination.
Base : `main` à `6ea94e1`. `npm run verif` vert à chaque commit.

## 0. Journal de livraison (2026-11-03)

| Heure (UTC) | Geste | Preuve |
|---|---|---|
| 07:22 | Contre-revue de Benjamin (revue GitHub n°5748485931, `COMMENTED`, ancrée sur `5e9367d`, marqueur + phrase de mainteneur unique + chemins des deux migrations + `cible: njkiyoklssvefstljemx`) | `gh api …/pulls/681/reviews` |
| 07:22 | Re-run du check « Gouvernance critique » de la PR → vert (run 41552574294) | job 125782937327 `success` |
| 07:23 | Fusion dans `main` : commit `89bf6f4` | `gh api …/pulls/681` `merged: true` |
| 07:23–07:34 | Run de `main` 41596025846, tentative 1 : 13 jobs verts (dont « Suites production (comptes réels) », cas 12 d'`authz-critical` compris), **« Gouvernance critique » rouge** — l'index « commit → PR » de GitHub n'était pas encore à jour 2 s après la fusion (« Aucune pull request n'est associée à 89bf6f4… ») ; déploiement SAUTÉ | log du job 125783469288 |
| 07:35 | `gh run rerun 41596025846 --failed` (tentative 2) : gouvernance verte, **« Déploiement production » vert, « Deploy is live! » à 07:37** | job 125788004518 ; deploy Netlify `6ae98f3a1c9cb0cb5f591ca9` |
| 07:4x | Attestation de `migration_promotion_attente_2026-11-02.sql` consignée (revue n°5748485931 relue par `gh`, empreinte `0e61ef3b…`) ; barrière `--verifier` : « envoyable » | `.passio/migrations/attestations.json` (PR suivante : `main` refuse le push direct) |
| — | Application de la migration : **depuis le poste de Benjamin** (jeton personnel), à mesurer ensuite en base (canal ①) | en attente de « c'est fait » |

La course de l'index est corrigée dans `deploy.yml` (bloc `GOUVERNANCE-INDEX`, PR suivante) ; fiche dans
`docs/journal/telemetrie-pilotage-sentinelle.md` (2026-11-03).

## 1. Ce qui est prêt à fusionner (code + tests, sans migration)

| Commit | Contenu | Précaution |
|---|---|---|
| `c28ef62` B | `ask-ai` réponse neutre, `supabase-js@2.118.0` épinglé ×4, worker CDN neutralisé, bancs aperçus/en-têtes | Edge redéployées par `edge-functions.yml` au merge : vérifier la fumée (`X-Passio-Revision`) |
| `38c1f1c` D | purge locale au logout (P1), `_cssUrl`, course de lectures du fil, cibles 44 px, champs 16 px, noms accessibles, 6 specs | `styles.css` modifié en ajout CRLF (vérifié) ; `index.html` structure identique (195 erreurs html.parser avant/après) |
| `731a516` G | veille : `purge_telemetrie_paliers` reconnue | prochain run de `veille-production.yml` : l'alerte « aucune purge » doit disparaître |
| `98a5459` H | `repair.js` en-têtes `---/+++` (P1, **périmètre critique**), SSE cloisonné, `meta.ech` non forgeable, `pilotage-nuage` | dashboard local : `npm test` 604/604 ; redémarrer le pilotage sur le poste |
| `d2cb3af` E | faux serveur + 10 parcours, cas ajoutés aux suites `prod` | `authz-critical` cas 12 tourne contre la production au push sur `main` : lire le résultat du premier déploiement |
| `a9964ee` F | `charge.mjs` seuils d'arrêt, `p95Tous`, garde `CI`, bancs dérives/dist | — |
| `30bfa43` coord P1 | B-01 marqueur échappé, F-03 pagination messages, B-02 client + migration préparée | voir § 2 |
| `ddaec2a` coord P2 | F-01 carte à l'ouverture, G-02 `＠`, E-05 motif obligatoire, squat `n_pa_`, `verif` élargi | G-02 : une enquête `[SENTINELLE]` fermée dont la clé portait un `@` sera rouverte **une fois** |
| `aa07330` CI | cas C-01 de `confidentialite.spec.js` en verrou ordinaire | — |

Ordre conseillé : **tout fusionner d'un bloc** (les correctifs client vivent avec ou sans les migrations), après ta
contre-revue GitHub sur le SHA de tête (marqueur « Contre-revue technique indépendante »). Le déploiement passe par
`deploy.yml` comme d'habitude ; aucun drapeau à poser : F-01 et F-03 changent un comportement de chargement, pas un
écran ; en cas de doute visible sur la carte, `goTo("irl")` doit la construire — le témoin de `perf-dist` le mesure.

## 2. Migrations (canal ③, contre-revue humaine, puis `npm run migration:appliquer`)

| Fichier | Objet | Banc | Compatibilité client | Retour arrière |
|---|---|---|---|---|
| `migrations/migration_promotion_attente_2026-11-02.sql` | RPC `promouvoir_attente(p_event_id, p_user_id default null)` : promotion FIFO sous verrou, capacité par le trigger, notification serveur protégée du squat | `tests/sql/migration-promotion-attente.test.sh` **43/43** (concurrence, squat, portes) ; ramassé par `bancs-sql-restants.sh` | le client déployé l'appelle d'abord et retombe sur l'UPDATE d'avant (0 ligne, honnête) si PGRST202 : **n'importe quel ordre** d'application convient | `drop function if exists public.promouvoir_attente(text, text);` |
| `migrations/migration_audit_2026-11-02_oracles_et_privileges.sql` | `conv_reads` INSERT/UPDATE par appartenance (C-01) ; retrait de TRUNCATE/REFERENCES/TRIGGER à `anon`/`authenticated` (C-03) | `tests/sql/migration-audit-2026-11-02-oracles-et-privileges.test.sh` **38/38** | ⚠️ **avant de l'appliquer** : `supaMarkRead` (app-08) doit lire `{ error }` et réparer l'appartenance sur 42501 (revue 10b) — sinon les ~19 conversations historiques sans `conv_members` perdent l'accusé ✓✓ jusqu'au premier message | en commentaire dans le fichier |

Après application : mesurer l'état en base (canal ①), jamais le tableau de verdict ; puis `PASSIO_E2E_MULTI=1` sur
`multi-comptes.spec.js` (cas B-02) contre la cible.

## 3. Propositions NON appliquées (diffs dans les rapports)

- Serveur : CHECK `reports.reason` non vide (E-05, hors `reportPassion`) ; `identifiant_reserve_au_serveur` étendu à
  `n_pa_` et `n_f*_` ; `pilotage_audience` sans éditeur ni canari (H-03) ; champ « fenêtre non passée » pour la
  rétention (H-04) ; index `telemetry_events (env, user_id, received_at desc)` (F-06) ; suppression de l'index
  doublon (F-05) ; fusion des policies `realtime.messages` en initplan (F-07) ; anti-flood `conversations` (C-05).
- Client : `supaMarkRead` réparation d'appartenance (10b) ; curseur `(created_at,id)` pour `supaLoadMessages` (1a) ;
  `AbortSignal.timeout` global + `estEchecReseau` (B-10/F-11) ; 23505 = succès entre deux onglets (B-09) ;
  `_sessionExpiree` sur 401 en plein envoi (E-04) ; capacité relue après `activite_complete` (E-03) ;
  post devenu privé retiré du cache (E-02) ; `inert` sur les modales (D-08/D-09) ; contrastes (D-10).
- Dépendances : `maplibre-gl` 6.16.0 (B-04), `cd dashboard && npm audit fix` (B-07), `pilotage/index.ts` épinglé (B-12).

## 4. Contrôles après livraison

1. `deploy.yml` vert jusqu'à « Déploiement production » ; fumée Edge `X-Passio-Revision` = SHA.
2. Ouvrir `https://passio-app.netlify.app/?equipe=1` : fil, puis Rencontrer → la carte se construit (F-01) ; une
   conversation s'ouvre avec ses derniers messages (F-03).
3. `/pilotage/` : « erreurs depuis la dernière mise en ligne » à 0 ; `veille-production.yml` sans l'alerte « purge ».
4. `client_errors` / Sentinelle : aucune issue `[SENTINELLE]` nouvelle liée à `app-07`/`app-08` sous 24 h.
5. Après les migrations : banc `multi-comptes` B-02 sous `PASSIO_E2E_MULTI=1` ; `pg_policies` de `conv_reads`.

## 5. Retour arrière

- Code : `rollback.yml` / `npm run rollback:netlify` (sélection testée, jamais exercé en réel sur 30 j) ou revert du
  merge ; aucun changement d'état local irréversible (les clés `localStorage` existantes sont inchangées).
- Migrations : `drop function` (promotion) ; policies et GRANTs d'avant en commentaire de la migration C.
