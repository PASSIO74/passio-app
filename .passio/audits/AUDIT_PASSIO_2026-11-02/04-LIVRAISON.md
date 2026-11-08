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

## 6. Lot « décisions produit » (2026-11-03, branche `ccr-ee10535f-52nyhx`)

Décisions déléguées par Benjamin et tranchées le 03/11 : C-04 (qui voit les participants), C-14 (dossier
investisseurs hors du dépôt public), E-08 (signaler un message), F-05/F-06/F-07 (index, realtime), R5 (identifiants
de notification réservés), R6 (accusé de lecture avant `oracles_et_privileges`). Trois tours de contre-revue
indépendante (RV-01…RV-10 au registre). Le code client est déployable **seul** : chaque appel nouveau retombe sur
l'ancien chemin tant que la migration manque (PGRST202, mémo d'une heure).

### 6.1 Migrations — ordre d'application (après que le client est servi en production ; la n° 3 attend 48 h de plus)

| # | Fichier | Objet | Banc | Pourquoi à ce rang |
|---|---|---|---|---|
| 1 | `migration_conv_members_reparation_2026-11-03.sql` | rajoute le créateur / le pair déclaré des 1:1 sans ambiguïté qui ont écrit (0 ligne mesurée en prod) | `migration-conv-members-reparation` 56/0 | AVANT `oracles_et_privileges`, qui conditionne `conv_reads` à l'appartenance ; s'arrête si un couple réparable est apparu depuis la revue (plafond 0, `passio.conv_members_plafond`) |
| 2 | `migration_audit_2026-11-02_oracles_et_privileges.sql` | C-01 / C-03 (revue #681 n°5748485931, commit `5e9367d`) | 38/38 | `supaMarkRead` répare déjà l'appartenance (R6) |
| 3 | `migration_participants_visibilite_2026-11-03.sql` | C-04 : liste par lien, compte par RPC `participants_compte`, notes en agrégat ≥ 3 (`notes_evenement`), garde d'état d'inscription, discussion d'activité réservée aux venants | `migration-participants-visibilite` 128/0 | client d'abord, **et 48 h après le déploiement** : une PWA restée ouverte garde l'ancien code (son `RETURNING *` prendrait 42501) |
| 4 | `migration_notifications_identifiants_reserves_2026-11-03.sql` | R5 : 5 familles d'identifiants réservées au serveur, UPDATE client limité à `seen`, `follows_notifier` gardé | `migration-notifications-identifiants-reserves` 77/0 | indépendante |
| 5 | `migration_index_realtime_2026-11-03.sql` | F-05/F-06/F-07 (DDL seul) | `migration-index-realtime` 24/0 | indépendante ; > 1 M lignes de télémétrie le jour J → index en `concurrently` à l'éditeur |
| 6 | `migration_signalements_preuves_2026-11-03.sql` | E-08 : copie serveur du message signalé, lisible du seul `service_role` | `migration-signalements-preuves` 82/0 | indépendante ; sans elle, `moderation.js voir` retombe sur `conv_messages` |

Chaque fichier porte son retour arrière en tête. ⚠️ Celui de `participants_visibilite` dit qu'`organise_activite` « peut rester : sans appelant » : c'est faux depuis R24 — `promouvoir_attente` l'appelle (RV-41). Elle reste, et ne se supprime JAMAIS sans rendre d'abord l'ancienne promotion. Après chaque application : mesurer l'état en base au canal ①
(policies, GRANTs par `aclexplode`, fonctions), jamais le tableau de verdict ; remesurer l'EXPLAIN F-06.

### 6.2 Contrôles après livraison du lot

1. `deploy.yml` vert jusqu'à « Déploiement production » ; le fichier servi porte `participants_compte`.
2. Après la migration 3 : une activité vue par un compte sans lien montre le NOMBRE d'inscrits, aucun visage ;
   sous 3 notes de participants, les notes affichent « N avis » seul (ni étoile ni moyenne) ; la moyenne
   apparaît à partir de 3.
3. Après la migration 4 : `notifications` — `update` limité à `seen` pour `authenticated` (canal ①, `aclexplode`).
4. Après la migration 6 : un signalement de message de test crée sa preuve (`signalements_preuves`), lue par
   `node scripts/moderation.js voir <id>` — avec un compte synthétique, jamais un vrai utilisateur.
5. Consigner les attestations dans une PR suivante (`main` refuse le push direct).

### 6.3 Journal d'application (2026-11-03)

| Heure (UTC) | Geste | Preuve |
|---|---|---|
| 18:23 | Contre-revue de Benjamin sur #684 (revue n°5757438499, `COMMENTED`, ancrée sur `70d0967`, marqueur, phrase de mainteneur unique, cinq chemins, `cible: njkiyoklssvefstljemx`) | `get_reviews` de #684 |
| 18:24 | « Gouvernance critique » relancé → vert ; fusion de #684 dans `main` (`7286569`) | run 41668132855, tentative 2 |
| 18:39 | Run de `main` 41693566731 : 15 jobs verts, « Barrière RLS de la production » comprise ; **« Deploy is live! »** (déploiement Netlify `6aea2a5d88e733d2727927a4`) | job 126125355608 |
| ~18:50 | Depuis le poste de Benjamin : attestations vérifiées (six), puis application de `conv_members_reparation`, `oracles_et_privileges`, `notifications_identifiants_reserves`, `index_realtime`, `signalements_preuves` — chacune journalisée dans sa transaction | sortie de `appliquer-migration.mjs` |
| après | **Mesuré au canal ①** (et non lu dans les tableaux de verdict) : `conv_reads` INSERT/UPDATE exigent `is_conv_member` ; aucune TABLE de `public` ne donne TRUNCATE/REFERENCES/TRIGGER à `anon`/`authenticated` (trois VUES en gardent, voir R26) ; `notifications` : `anon` SELECT seul, `authenticated` SELECT/INSERT/DELETE + `update (seen)` seul ; `identifiant_reserve_au_serveur` couvre les cinq préfixes ; repli de `follows_notifier` présent ; `passions_trgm_idx` et `passions_aliases_gin` absents, `idx_tel_env_received_identifies` présent ; une seule policy `user:<uid>` sur `realtime.messages`, en `(select auth.uid())` ; `signalements_preuves` en RLS sans policy, aucun droit client, `service_role` SELECT/DELETE, déclencheur `trg_reports_preuve_message` actif ; `conv_members` : 0 couple réparable, 0 ligne insérée | `execute_sql` en lecture seule |
| après | **F-06 remesuré** : la lecture du pilotage (`env = 'production' and user_id is not null and received_at > now() - 7 j order by received_at desc limit 1000`) passe en *Index Only Scan* sur `idx_tel_env_received_identifies`, bornée par sa limite : 81 tampons, 15 ms (lecture partiellement à froid), contre 54,6 ms de moyenne mesurés avant | `explain (analyze, buffers)` |
| 06/11, ~06:00–06:30 | **Avant l'application** (canal ①, journaux, dépôt). C-04 n'est PAS appliquée : `event_attendees_select_authentifie` `USING (true)` toujours en place, aucune `event_attendees_select_lien`, ni `vient_a_activite`, ni les trois RPC. Empreinte attestée = fichier de `main` = fichier au commit revu (`6e4969f7…`) ; revue n°5757438499 relue (`COMMENTED`, `70d0967`, marqueur, phrase de mainteneur unique, fichier, `cible: njkiyoklssvefstljemx`). `organise_activite` de production = celle du fichier (`144cba40…` : le `create or replace` ne change rien) ; `can_join_event_conversation` de production = celle du fichier, à la ligne C-04 près (comparées octet par octet, fins de ligne normalisées) ; `trg_event_attendees_figes` actif. 12 inscriptions, toutes `going`, 0 note ; 2 membres de discussions d'activité, 0 à retirer par la purge ⑥ ; PostgreSQL 17.6 (la ligne MAINTAIN du verdict s'évalue). Client : la production appelle `rpc/participants_compte` (404 tant que la RPC manque, le repli prévu ; dernier appel le 05/11 à 19:54) ; la dernière version antérieure à #684 vue avec un compte date du 03/11 à 19:08 (sans compte : 04/11 à 18:31). Consommateurs : fonctions Edge, pilotage et sauvegardes en `service_role` ; `authz-critical` (sur la production) ne lit que sa propre ligne (`select=rsvp`) et écrit en `return=minimal` ; le client ne demande plus que des colonnes accordées, la lecture directe de `rating` n'étant qu'un repli sans RPC, et son 42501 ne pose pas le mémo de refus ; `event_attendees` n'est pas publiée | `execute_sql`, `query_logs`, `get_reviews`, `git` |
| 06/11 | **R27 tranché : assumé par écrit** (`05-RISQUES-RESIDUELS.md`) ; C-04 part telle qu'attestée. Le staging reste sur l'ancienne policy : l'y aligner demande une attestation pour `fcksxofaelcdmmifnwjo` | — |
| 06/11, ~06:40–07:30 | **Contre-vérification indépendante** (quatre agents en lecture seule, chacun chargé de RÉFUTER « C-04 peut partir maintenant » : verdict, consommateurs, exploitation, R27). **Aucun bloquant.** Verdict prédit ligne par ligne sur le catalogue mesuré : 8 × OK, aucune instruction qui lève. Le PostgREST de production traduit `select=` en `RETURNING` des seules colonnes demandées plus la clé primaire — lu dans `postgres_logs` (texte des requêtes refusées : `RETURNING "user_state"."updated_at", "user_state"."user_id"` × 444, `RETURNING 1` sans `select`, `RETURNING <table>.*` seulement sur un `return=representation` sans `select=`) : les écritures du client (`select("event_id")`) renverront `event_id, user_id`, deux colonnes que C-04 garde lisibles. `authz-critical` reste verte (12c sauté en production, nettoyage non lu). Trouvé et consigné : la raison ③ de R27 était en partie fausse (corrigée, suite décidée), R39 (seuil des notes contournable par pointage), R40 (compteurs et blocages), RV-40 (12c, faux verrou à venir), RV-41 (retour arrière : `organise_activite` a un appelant), RV-42 (ni `lock_timeout` ni ordre de verrous sûr face au rechargement du cache de PostgREST : un interblocage annulerait la migration entière, à relancer) ; au plus une heure de compteurs bas sur un appareil qui a mémorisé « RPC absente » | workflow `c04-contre-verification`, `execute_sql`, `query_logs` |
| 06/11, avant 09:17 | Premier essai depuis le poste de Benjamin : arrêté au `git pull --ff-only`, `.passio/migrations/attestations.json` étant modifié en local — l'attestation de R38, écrite par le bloc du 05/11 qui ne la rendait pas après coup, et déjà consignée par #724. **Rien n'est parti** | sortie PowerShell |
| 06/11, 09:17:12 | **Appliquée** depuis le poste de Benjamin (`main` à `02d76757`) : copie du fichier local dans `%TEMP%`, fichier rendu à `main`, `git pull --ff-only` ; barrière franchie (attestation `6e4969f7…` ; revue n°5757438499 relue par `gh`, « AUTO-REVUE DE MAINTENEUR UNIQUE » affichée) ; verdict **8 × OK** ; journalisée dans sa transaction (`migrations_appliquees`, 09:17:12 UTC, empreinte `6e4969f7…`) | sortie de `appliquer-migration.mjs` |
| 06/11, 09:17:40 | **Mesuré au canal ①**, et non lu dans le tableau. `event_attendees_select_lien` seule policy SELECT, pour `authenticated`, avec les cinq branches (soi, organisation, venant, suivi mutuel, blocages exclus) ; `event_attendees_select_authentifie` partie ; INSERT, UPDATE et DELETE inchangés. Les sept fonctions à l'octet du fichier (`md5(prosrc)` : `organise_activite` `144cba40…` inchangée, `vient_a_activite` `f70158c8…`, `event_attendees_etat_garde` `1ad0c0eb…`, `participants_compte` `c2da6ea2…`, `notes_evenement` `23b15d3e…`, `retours_evenement` `c264652b…`, `can_join_event_conversation` `956f53c9…`), toutes `SECURITY DEFINER` à `search_path` vide, EXECUTE ni à `anon` ni à PUBLIC (la garde : à personne) ; `inscrit_a_activite` absente ; `promouvoir_attente` inchangée (`3edef536…`). Droits : ACL `authenticated=awd`, `anon` sans aucun droit, `authenticated` ne LIT que `event_id`, `user_id`, `created_at`, `rsvp`, `checked_in_at` (UPDATE gardé sur toutes) ; `service_role` intact. `trg_event_attendees_etat` actif (BEFORE INSERT OR UPDATE). `conv_members_select_member` masque les membres bloqués d'`evgrp_`. 2 membres dans 2 discussions d'activité (0 retiré) ; 12 inscriptions, toutes `going`, 0 note | `execute_sql` en lecture seule |
| 06/11, 09:10–09:25 | **Journaux** : aucune erreur Postgres de 09:10 à 09:23:30, puis 26 ERROR jusqu'à 09:25, toutes des refus attendus des pages de test de la CI (`127.0.0.1`, rôle `anon` : 42501 sur `event_attendees`, `profiles`, `user_state`) — ⚠️ **relu le 07/11** : la première lecture filtrait `log_attributes['error_severity']`, clé qui n'existe pas (c'est `parsed.error_severity`), et rendait vide quoi qu'il arrive ; aucune attente de verrou ni interblocage (filtre sur le message, éprouvé sur l'attente du 05/11 ; RV-42 ne s'est pas produit) ; PostgREST recharge son cache à 09:17:12 et expose « 67 Functions » (63 avant : les quatre RPC nouvelles), requête de cache en 1 467 ms | `query_logs` |
| 06/11, ~09:20–10:07 | **Contre-vérification de l'état d'après** (trois agents en lecture seule : structure et privilèges, comportement par les journaux, régression ailleurs). Aucun bloquant. Confirmé : sept corps à l'octet du fichier, texte exécuté = fichier (journal DDL), UNE seule transaction structurelle depuis R38 (balayage des catalogues par `xmin`), rien d'autre n'a bougé (publication à 9 tables, identités de R25, déclencheurs de `conv_members`), les dix fonctions qui lisent `event_attendees` en `SECURITY DEFINER`, aucune vue ni policy d'une autre table qui la lise ; verdict rejoué en direct 8 × OK ; la page de la barrière RLS (comptes synthétiques, run 42197459162) a obtenu 200 sur `rpc/participants_compte` et sur la liste partielle à 09:51 — le premier usage authentifié de C-04 en production. Trouvé : **R41** (`is_conv_member`, C-02, reconstitue la liste des venants par la discussion d'activité — la voie que C-04 ⑥ dit fermer), **RV-44** (un membre bloqué d'une discussion d'activité ne peut plus être retiré par le créateur, et le client l'annonce retiré), **RV-43** (`SCHEMA_PROD_REFERENCE.sql` décrit encore une lecture publique) ; avis 0029 attendu sur les six RPC ; aucune écriture d'inscription, de note ni de retour exécutée en production (aucune activité à venir en base) | workflow `c04-apres-application`, `execute_sql`, `query_logs`, `get_advisors` |
| 06/11 09:17:12 → 07/11 09:17:12 | **Journaux des 24 h** (relus le 07/11 vers 09:35 ; `postgres_logs` lu sur `parsed.error_severity`, 9 846 lignes, et `edge_logs`). Erreurs Postgres : 8 272 × 42501, 62 × 23505 (`analytics_events_pkey`) et 22 erreurs de nos propres lectures au canal ① (`mgmt-api`). Les 42501 : `profiles` 3 484 et `user_state` 3 465 (RLS à l'écriture), `event_attendees` 677, `conv_reads` 325, `notifications` 119 + 13, `conversations` 80, `storage.objects` 65, `events`, `posts` et `conv_members` 13 chacun — côté passerelle, **tous** les refus viennent de `127.0.0.1` (pages de test de la CI, qui parlent à la production avec la clé publique, et une suite à comptes synthétiques dont les écritures interdites sont refusées : même nombre sur cinq tables), aucun de `passio-app.netlify.app`. Les refus sur `event_attendees` sont des lectures ANONYMES (`select=event_id,rsvp,checked_in_at`, `supaLoadMyRsvps`, app-08) : `anon` n'a plus aucun droit depuis C-04, c'est voulu, et le client les garde par `_compteAuthReel()` puis par le mémo `_attendeesRefusMemorise` — des pages de test qui posent un identifiant sans session, une fois par session. Aucune P0001 (`activite_passee`, `annulee`), aucun interblocage ; une seule attente de verrou (1 s, `realtime_rls`, sur une transaction, le 06/11 à 21:00:04 : ni une migration, ni `event_attendees`). **Trafic réel** (`passio-app.netlify.app`, `authenticated`) : `event_attendees` GET 200 × 39, `conv_members` GET 200 × 60, `rpc/participants_compte` 200 × 14 ; aucun appel réel de `notes_evenement`, `retours_evenement` ni `promouvoir_attente`. La veille (fonction Edge, clé secrète) lit `event_attendees` (`user_id,created_at`) 48 fois, en 200. **Non éprouvé par un vrai client** : l'inscription, la note, le retour et la promotion depuis la liste d'attente (0 activité à venir, 12 inscriptions toutes `going`). Préexistant et sans lien : un `HEAD /rest/v1/conversations` en 400 d'un script `node` en `service_role`, une ou deux fois par heure de CI, déjà le 05/11. ⚠️ C-02 a réécrit `conv_members_select_member` au milieu de la fenêtre (21:38:05, § 9.8) | `query_logs` |
| 07/11, ~09:40 | **Remesuré au canal ①** : `event_attendees_select_lien` seule policy SELECT (`{authenticated}`, cinq branches : soi, organisation, venant non `declined` hors blocage, suivi mutuel accepté ; déparsage md5 `cdfea0f7…`), INSERT, UPDATE et DELETE inchangés ; colonnes lisibles par `authenticated` : `event_id`, `user_id`, `created_at`, `rsvp`, `checked_in_at` (ni `rating`, ni `feedback`, ni `rated_at`) ; table : `authenticated` INSERT, UPDATE, DELETE, rien pour `anon` ni PUBLIC ; les sept fonctions et `promouvoir_attente` aux empreintes du 06/11 (`144cba40…`, `f70158c8…`, `1ad0c0eb…`, `c2da6ea2…`, `23b15d3e…`, `c264652b…`, `956f53c9…`, `3edef536…`), toutes SECURITY DEFINER à `search_path` vide, `event_attendees_etat_garde` exécutable par `postgres` et `service_role` seulement ; `inscrit_a_activite` absente ; six déclencheurs actifs ; 12 inscriptions, toutes `going`, 0 activité à venir. Depuis C-04, deux migrations seulement : C-02 (id 33) et RV-38 (id 34, 07/11 08:33) | `execute_sql` en lecture seule |
| **reste** | **C-02 / R41 d'abord** (migration : `is_conv_member` ne répond plus que sur l'appelant connecté) ; RV-44 ; le staging, toujours sur l'ancienne policy (l'aligner demande une attestation pour `fcksxofaelcdmmifnwjo`) ; le contrôle 2 du § 6.2 (un compte sans lien voit le NOMBRE et aucun visage ; « N avis » sous 3 notes), éprouvé au banc et par les suites locales, pas en production avec un vrai compte ; la suite `participants_visibilite` v2 (R27, R28, R39, R40) | — |

## 7. R24 et R26 — la promotion ne nomme plus le promu à n'importe qui, les vues perdent leurs droits hors RLS (2026-11-03, le soir)

`migrations/migration_promotion_discrete_vues_2026-11-03.sql` (banc `migration-promotion-discrete-vues` 79/0) et le client de
la même PR (`supaPromoteFromWaitlist`, `_promoteNextWaitlisted`, `_appliquerPromotionAnonyme`, `supaLireParticipants`).
Indépendante des six du § 6.1, **à appliquer AVANT `participants_visibilite`** : avant C-04, le nom rendu par
`promouvoir_attente` n'ajoute rien (la liste est lisible par tout connecté) ; après, c'en est la voie SANS inscription (un venant, lui, lit la file : R27). Fiche :
`docs/journal/serveur-securite-base.md` (« 🔕 LA PROMOTION NE NOMME PLUS LE PROMU… »).

| # | Geste | Preuve attendue |
|---|---|---|
| 1 | fusion de la PR ; le client est servi (« Déploiement production » vert ; le `app.js` servi porte `supaLireParticipants`) | job vert, fichier servi |
| 2 | contre-revue humaine de la PR (revue GitHub portant le marqueur, le fichier et `cible: njkiyoklssvefstljemx`), puis `node scripts/attester-migration.mjs migrations/migration_promotion_discrete_vues_2026-11-03.sql --cible njkiyoklssvefstljemx --pr … --commit … --revue … --relecteur … --source …` (`.passio/migrations/README.md`) | entrée dans `attestations.json`, PR suivante |
| 3 | depuis le poste de Benjamin, jamais la CI : `npm run migration:appliquer -- migrations/migration_promotion_discrete_vues_2026-11-03.sql --projet njkiyoklssvefstljemx` | tableau : 17 × OK (dont la mesure comportementale, sous-transaction annulée) |
| 4 | **mesure au canal ①**, pas le tableau : `md5(prosrc)` de `promouvoir_attente` ≠ `1a4a2c4dcc01309b6235d1a2c42c3383` et `prosrc` appelle `organise_activite` ; `organise_activite(text)` présente, SECURITY DEFINER, `search_path` vide, EXECUTE à `authenticated` (ni `anon` ni PUBLIC) ; `aclexplode` des trois vues : plus de TRUNCATE / REFERENCES / TRIGGER / MAINTAIN pour `anon` / `authenticated`, SELECT / INSERT / UPDATE / DELETE intacts ; aucune ligne `zz_verdict_r24_%` dans `events` / `notifications` | `execute_sql` en lecture seule |
| 5 | `participants_visibilite` à son heure (§ 6.3) : son `create or replace` d'`organise_activite` ne change rien (copie à l'octet près, banc ⓪) | — |

Retour arrière : le bloc `--|` de l'en-tête (définition de production à l'octet près, et les quatre droits des trois vues) ;
`organise_activite` reste — elle a désormais un appelant, elle ne se supprime plus sans rendre d'abord l'ancienne promotion.

**Journal (2026-11-04)**

| Heure (UTC) | Geste | Preuve |
|---|---|---|
| 06:43 | Contre-revue n°5764341120 (`COMMENTED`, ancrée sur `9abfaba`, marqueur, phrase de mainteneur unique, fichier, `cible: njkiyoklssvefstljemx`) — **rédigée et postée par Claude Code depuis le compte PASSIO74, à la demande explicite de Benjamin** (« Fait la contre revue toi même ») : décision tracée du mainteneur unique, PAS une relecture humaine indépendante (AGENTS.md, ASTRA-61 bis) | `get_reviews` de #690 |
| 06:44 | « Gouvernance critique » relancé → vert ; prévisualisation Netlify déployée | run 41721152209, tentative 2 |
| ~06:46 | Fusion de #690 dans `main` par commit de fusion (`4da2a8e`) : le commit revu `9abfaba` reste dans l'historique | `merge_pull_request` |
| ensuite | Attestation consignée (empreinte `5e1b4c45…`, PR suivante), validée hors ligne par `verifierAttestation` et `verifierPreuveRevue` sur la revue relue par l'API GitHub ; la barrière la relira avec `gh` au moment d'appliquer | `.passio/migrations/attestations.json` |
| 06:58 | Run de `main` 41787670317 (`4da2a8e`) : tous les jobs verts, **« Déploiement production » vert** — le client R24 est servi AVANT la migration. Le `app.js` servi n'a pas été relu : `passio-app.netlify.app` est refusé par le réseau de la session, la preuve est le job | job 126437501725 |
| 07:00 | Fusion de #691 (attestation et journal) dans `main` (`1fbd853`) ; run 41789275072 vert | `merge_pull_request` |
| ~07:19 | Attestation revérifiée sur les fichiers EXACTS de `main` (`choisirCible`, `verifierAttestation`) : production → exigée, trouvée (#690, revue 5764341120, commit `9abfaba`), empreinte identique | barrière, hors ligne |
| 07:41 | Premier essai lancé depuis `C:\Users\BENJAMIN`, hors du clone : `git` et `npm` refusent, **rien n'est parti** | sortie PowerShell |
| 07:47 | **Appliquée** depuis le poste de Benjamin, dans un worktree détaché d'`origin/main` (`PASSIO-wt/migration-r24`), par `node scripts/appliquer-migration.mjs … --projet njkiyoklssvefstljemx` : barrière franchie (attestation ; revue n°5764341120 relue par `gh`, « AUTO-REVUE DE MAINTENEUR UNIQUE » affichée), verdict **17 × OK**, journalisée dans sa transaction (`migrations_appliquees`, 07:47:27 UTC, empreinte `5e1b4c45…`) | sortie de `appliquer-migration.mjs` |
| 07:48 | **Mesuré au canal ①** (et non lu dans le tableau) : `md5(prosrc)` de `promouvoir_attente` = `3edef536245e92950486226daf712c01`, celui du corps du fichier revu (était `1a4a2c4d…`), sans `\r` ; `prosrc` appelle `organise_activite`, réserve le nom (`if orga or cible = moi`), ne lit plus `co_organizers` ; SECURITY DEFINER, `search_path` vide ; EXECUTE : `authenticated`, `service_role`, `postgres` — ni `anon` ni PUBLIC. `organise_activite(text)` présente, `md5` = `144cba40…` (= fichier), STABLE, SECURITY DEFINER, `search_path` vide, même ACL. Vues de `public` : **aucun** TRUNCATE / REFERENCES / TRIGGER / MAINTAIN pour `anon` / `authenticated` (24 avant) ; SELECT / INSERT / UPDATE / DELETE intacts (24) ; `service_role` garde TRUNCATE / REFERENCES / TRIGGER. 0 ligne `zz_verdict_r24_%` dans `events` / `notifications` | `execute_sql` en lecture seule |
| **reste** | `participants_visibilite` (§ 6.3) : son `create or replace` d'`organise_activite` ne change rien (copie à l'octet près, banc ⓪ ; remesuré le 06/11 : `144cba40…` en production comme dans le fichier). R27 tranché le 06/11 : assumé par écrit, C-04 part telle qu'attestée | — |

## 8. R25 — un effacement publié par le temps réel ne dit plus ni qui ni quoi ; reprise et sauvegarde fidèles (2026-11-04)

Le dernier résidu ouvert de la contre-revue du 03/11 (R25), plus trois défauts trouvés en le corrigeant : le DDL de reprise
rouvrait R25 (identités de réplication et droits de séquence non rendus, séquences d'identité doublées), la sauvegarde
arrondissait tout entier au-delà de 2^53, et trois anciens fichiers de vues effaçaient `security_invoker` s'ils étaient
rejoués (suite de R26, § 7). Deux revues indépendantes sur la première version de R25 (registre RV-14…RV-17) : `rid` tiré
d'un compteur, donc ORDONNÉ (un abonné encadrait la ligne d'une victime entre deux de ses propres `rid`), `rid` inscriptible
par le client, verrou bloquant sur cinq tables, index supprimable sans garde. Tout est corrigé ; R24/R26 restent ceux du § 7.

### 8.1 Migration

| Fichier | Objet | Banc | Quand |
|---|---|---|---|
| `migration_realtime_identite_opaque_2026-11-03.sql` | `rid` aléatoire de 53 bits (chiffres 17 à 32 d'un UUID v4, masque 2^53 − 1 : exact en JSON), index unique `<table>_rid_key` et `replica identity using index` sur `conv_members`, `notifications`, `conv_reads`, `post_likes` ; `comment_interactions` en identité DEFAULT (l'oracle du filtre se ferme) ; garde `trg_rid_opaque` (le `rid` n'est écrit que par la base) ; verrous NOWAIT en boucle ; verdict en 10 lignes | `migration-realtime-identite-opaque` 239/0 (`realtime.apply_rls` de production recopiée à l'octet, nourrie du WAL réel du banc ; attaque par encadrement rejouée ; verdict sous verrous concurrents ; retour arrière pendant que le temps réel décode ; vingt mutations rouges) — fichier sha256 `9f48ffe1…` | **appliquée le 04/11** (staging 12:06, production 12:45:52 UTC, § 8.6) : serveur seul, aucun changement client. Rejouable sans effet sur les données, mais son verdict dit ECHEC à la ligne 10 depuis la seconde couche (§ 8.7, neuf tables publiées) |

Ordre à partir du 04/11 : `promotion_discrete_vues` (§ 7) est APPLIQUÉE (07:47 UTC, mesurée au canal ①), R25 aussi
(12:45:52 UTC, § 8.6) et sa seconde couche (14:25:07 UTC, § 8.7) ; reste `participants_visibilite` (§ 6, à partir du 2026-11-05 18:40 UTC). R25 est indépendante
des deux autres ; la nouvelle `promouvoir_attente` nomme les colonnes de son INSERT dans `notifications` (canal ①, 04/11),
comme `follows_notifier` et `notifier_mentions` : le `rid` y prend son défaut et sa garde.

Les trois anciens fichiers qui recréent les vues de statistiques (`migration_monitoring_view.sql`, `APPLY_ALL_scaling.sql`,
`migration_telemetry.sql`) ne sont PAS à appliquer : ils posent désormais `with (security_invoker = on)`, parce qu'un
`create or replace view` sans l'option rend la vue aux droits de son propriétaire (mesuré sur PostgreSQL 16) — et le SELECT
que la R26 du § 7 laisse à `anon` deviendrait une lecture des erreurs client.

### 8.2 Hors migration (servi au déploiement, sans geste)

- `scripts/schema-executable.js` (DDL de reprise) : identité de réplication de chaque table, séquences d'identité laissées
  à leur colonne (elles étaient doublées en `*_seq1`, l'orpheline gardant `rwU`), `OWNED BY` des `serial`, droits de
  séquence ; banc `schema-executable-identite` 40/0 avec la forme finale du `rid`, rouge sur le générateur d'avant
  (25 ✅ / 15 ❌) ; procédure d'après reconstruction dans `docs/RECUPERATION.md`.
- `scripts/sauvegarde-donnees.js` et `scripts/restaurer-donnees.js` (`scripts/lib/json-exact.js`) : l'export
  écrit le texte de chaque ligne tel que la base l'a rendu (découpage linéaire, aucune profondeur ne l'arrête) ;
  la vérification relit archive et cible au chiffre près, la VALIDATION d'une archive ne fait que compter (sans
  lecture exacte) ; la reprise exige Node 21 ou plus récent, et le dit ; une table partitionnée ou étrangère rend un
  DDL qui lève à la reprise : la nuit dépose ses données, puis le run passe au rouge ;
  `tests/unit/restaurer-donnees.test.mjs` 23/23, `restaurer-phases` 14/14, `reprise-verdicts` 31/31, rouges sur
  huit réinjections.
- `scripts/audit-identite-replication.js` dans `npm run verif` (test unitaire 24/24) : une migration qui supprime un
  index `*_rid_key`, ou la colonne `rid`, tant qu'il porte l'identité est refusée, retour arrière compris ; et, sauf
  marqueur motivé, tout ce qui le contourne — index renommé ou retouché, `drop constraint`, table supprimée, renommée
  ou déplacée, colonne `rid` renommée, garde retirée ou désarmée, `replica identity` FULL ou `using index` sur une
  table publiée (y compris dans le fichier qui la publie), action ou nom calculé.

### 8.3 Contrôles après application (canal ①, jamais le tableau de verdict)

1. `relreplident` = `i` sur les quatre tables, `d` sur `comment_interactions` ; `indisreplident` sur les quatre
   `<table>_rid_key` ; aucune table de `supabase_realtime` en FULL ; défaut de `rid` identique sur les quatre tables
   (`pg_get_expr`, chiffres 17 à 32, masque `9007199254740991`) ; `trg_rid_opaque` actif, sans clause WHEN ;
   `rid_opaque_garde()` non exécutable par `anon`/`authenticated` ; par table, `max(rid) <= 9007199254740991` et
   `count(distinct rid) = count(*)` (agrégats seuls).
2. **Le fonctionnel se prouve sur le STAGING, AVANT la production** (réserve de la contre-revue n°5767930760) : le
   job « Suites production (comptes réels) » vise le STAGING (`fcksxofaelcdmmifnwjo`, SUP-04), jamais la production —
   le relancer après une application en production ne prouve rien. Donc : appliquer d'abord au staging (l'attestation
   doit nommer cette cible aussi ; la ligne 10 du verdict y dira ECHEC, sa publication ayant dérivé, et c'est
   attendu), relancer ce job (`PASSIO_E2E_MULTI=1`, comptes synthétiques : un « j'aime » retiré, une notification
   effacée, un départ de conversation — un UPDATE ou un DELETE refusé faute d'identité y tomberait au rouge), puis
   appliquer en production. En production ensuite : le point 1, la « Barrière RLS de la production »
   (`authz-critical`) du prochain run de `main`, et `client_errors` sans erreur « replica identity » sur 24 h.
3. Consigner l'attestation dans une PR suivante.

### 8.4 Retour arrière

Le bloc `--|` de l'en-tête, en ôtant « --| » (`sed -n 's/^--| //p'`, comme le banc ; JAMAIS les lignes `--|+` qui le
suivent, réservées à une base sans temps réel vivant) : l'identité d'abord, puis la garde, puis l'index (dans l'autre ordre,
tout UPDATE et DELETE des tables publiées est refusé ; la gate le refuse aussi). Il rend à `comment_interactions` son
identité FULL d'origine. **La colonne `rid` RESTE**, inerte : la supprimer pendant que le temps réel n'a pas tout décodé
fait lever `apply_rls` et perd le lot en cours (contre-revue finale, mesuré) — la retirer se fait à part, après drainage du
slot, selon l'en-tête.

Vérification finale (04/11, registre RV-33) — trois précisions :
- le bloc n'a **pas de tableau de verdict** : il se joue à l'éditeur SQL (canal ③), jamais par `appliquer-migration.mjs`,
  qui sortirait en code 1 APRÈS validation ; l'état d'arrivée se MESURE ensuite au canal ① (`relreplident` `d` sur les
  quatre tables et `f` sur `comment_interactions`, aucun `trg_rid_opaque`, aucune `rid_opaque_garde`, aucun `*_rid_key`,
  colonne `rid` présente) ;
- il laisse les **commentaires de colonne** de `rid` (« tiré par la base seule… »), faux une fois la garde retirée : les
  remettre à NULL (`comment on column public.<table>.rid is null`) dans la même séance ;
- **depuis la seconde couche** (§ 8.7, `diffusion_privee`), `conv_members` et `notifications` sont hors publication :
  défaire R25 seule y rend une identité DEFAULT sans effet sur le temps réel ; le retour arrière de la seconde couche est
  le SIEN, à jouer d'abord si l'on défait tout.

Code : **rien à revenir**, R25 ne touche aucune ligne de `js/`. Ne PAS revenir la fusion #692 : elle porte aussi la
sauvegarde exacte, l'identité du DDL de reprise, la suite de R26 (`security_invoker`), la gate, et le seul texte qui
documente la colonne `rid` laissée en base et sa procédure de retrait.

### 8.5 Contre-revue finale (2026-11-04)

Trois relecteurs indépendants, en lecture seule, sur la version finale (fuite temps réel, sûreté de la migration et de sa
gate, reprise et sauvegarde), chaque constat P1/P2 soumis à un vérificateur chargé de le réfuter. **Aucune fuite ouverte,
aucune casse à l'application** : le banc rejoué (202/0 sur la version relue), et contre-éprouvé avec le VRAI wal2json et l'`apply_rls` de
production. Corrigés dans la PR, puis éprouvés par deux vérificateurs adverses (gate : conforme ; migration : quatre P3
résiduels, corrigés à leur tour — un retour chariot seul dans un commentaire, l'en-tête sur les identifiants
horodatés, le prérequis PostgreSQL 15) : RV-20 à RV-24 — verdict sans verrou ni comparaison par morceaux, retour
arrière qui garde la colonne et réapplication qui tire les `rid` de nouveau, gate étendue, en-tête exact. Côté reprise et sauvegarde (même revue) : la lecture exacte est juste (aller-retour réel sur
PostgreSQL 16 : 0 écart ; archive ancienne : 0 fausse divergence), le recoupement du DDL reconstruit avec la R25
finale rejoué (10 OK) — mais RV-25 (une sauvegarde qu'un compte fait échouer par un jsonb très imbriqué écrit chez
lui — préexistant vers 4 171 niveaux, abaissé à ≈ 2 847 par la première version de ce lot ; l'export n'a désormais
plus de plafond), RV-26 et RV-27, corrigés. Trouvés à côté et consignés, hors
lot : R31 (P2, confirmé — supprimer une publication rend ses commentaires et « j'aime » publics), R32, R33, R34.
La revue du correctif de sauvegarde (même jour) : rien ne casse la sauvegarde de la nuit ni ne fausse son archive
(découpage éprouvé sur 20 000 pages, 300 000 jetons numériques, aller-retour PostgreSQL 16 sans écart) — mais RV-28
(**P2**, introduit par ce lot puis corrigé : la validation par lecture exacte faisait refuser une archive entière sur
une seule ligne écrite par un compte), RV-29, et R35 (les `float8` archivés sur 15 chiffres, préexistant). Dernière
passe sur l'état final (cinq commits non relus, cohérence d'ensemble) : aucun P1 ni P2, migration applicable le jour
même ; deux P3 traités (une archive au DDL incomplet était dite « complète » ; ce paragraphe).

### 8.6 Application (2026-11-04)

| Étape | UTC | Résultat |
|---|---|---|
| Contre-revues | 12:05, 12:17 | n°5767930760 sur `7b83a86`, attestation pour le STAGING (relecture et mesures au canal ①, Claude Code, sur le « Oui » de Benjamin) ; n°5768092517 sur `0133b05`, la tête fusionnée, attestation pour la PRODUCTION. Deux auto-revues de mainteneur unique (ASTRA-61 bis), pas des revues indépendantes. Même fichier, empreinte `9f48ffe1…` |
| Staging | 12:06 | 9 lignes OK ; la ligne 10 dit ECHEC, c'est attendu : la publication du staging a dérivé (`cdv_*`). Suite à comptes réels du run 41828027145, partie à 12:18, après l'application : 18 réussis, 3 ignorés |
| Fusion, déploiement | 12:31, 12:44 | #692, `b9ba01b6`, job « Déploiement production » vert |
| Production | 12:45:52 | 10 lignes OK, journalisée dans sa transaction |
| Mesure au canal ① | 12:46 | identité `i` et index `<table>_rid_key` sur les quatre tables, `d` sur `comment_interactions` ; un seul défaut de `rid` ; quatre gardes actives sans clause WHEN ; fonction non exécutable par `anon` et `authenticated` ; `count(distinct rid) = count(*)` (22, 169, 31, 76) et `rid` dans [0, 2^53 − 1] ; 11 tables publiées, aucune en FULL. Lecture `anon` par PostgREST (hors canal ①) en `select=*` : HTTP 200, `rid` rendu |
| Barrière RLS | après l'application | `authz-critical` verte à 12:49:20 (run 41831787191 de `main`, sur la production) ; aucune ligne dans `client_errors` depuis l'application à 12:49 |
| Remesure au canal ① | 13:10 | identique à 12:46 (mêmes comptes, mêmes bornes, un seul défaut de `rid`) ; garde `SECURITY DEFINER` à `search_path` vide ; toujours aucune ligne dans `client_errors` depuis 12:45:52 (5 sur les 24 h d'avant) |

**Journaux des 24 h, relus le 06/11** — de 2026-11-04 12:45:52 à 2026-11-05 12:45:52 UTC, `postgres_logs` et `edge_logs`, PAS `client_errors`, qui ne voit pas un refus PostgREST (il ne reçoit que les exceptions de `window`) :

- `postgres_logs` (10 918 lignes) : AUCUNE ligne ERROR, WARNING ou FATAL ne parle d'identité de réplication, de `rid`, d'un `*_rid_key`, de `rid_opaque_garde`, d'`apply_rls` ni de la publication — ces mots n'apparaissent que dans des LOG du décodage logique (démarrages de slot). 23505 × 11, tous sur `profiles_pkey`, aucun sur un `*_rid_key`. 42P17 × 78 jusqu'à 20:45:10 : `passion_requests` (R38, corrigée le 05/11 ; aucune depuis 07:23:32, relu jusqu'au 06/11 06:05). 42501 × 9 282 : des refus de droit ou de RLS. Le reste (26 lignes : 42725, 42703, 42804, 42P01, 42702) vient du rôle de lecture du canal ①, nos requêtes, plus un 57014 isolé (14:56:53).
- `edge_logs`, les cinq tables : DELETE 200 sur les cinq (`conv_members` 38, `notifications` 38, `conv_reads` 19, `post_likes` 19, `comment_interactions` 18), POST 201 sur `conv_members` et `notifications` (19 chacune), GET 200 partout. Un seul 5xx : un PATCH 502 sur `notifications`, le 05/11 entre 06:00 et 07:00 (passerelle). Les 401 et 403 viennent TOUS de `127.0.0.1` (Chrome sans tête, à 47 requêtes près d'un navigateur local) — nos suites locales, qui écrivent en `anon` pour se faire refuser, et la barrière RLS (POST 403 × 19) — et aucun d'un navigateur sur `passio-app.netlify.app`. Sur toute l'API REST, seuls 6 POST de télémétrie (401 : jeton refusé par PostgREST, aucune requête en base) et 2 lectures sans origine viennent d'ailleurs. Mêmes familles et mêmes ordres de grandeur que les 24 h d'avant : DELETE 200 × 38/38/19/19/19, POST 403 × 19 de la barrière.
- Remesuré au canal ① le 06/11 à 06:05 UTC : identique au 04/11. Identité `i` par `<table>_rid_key` (unique sur `rid` seul, `indisreplident`) sur les quatre tables, `d` sur `comment_interactions` ; défaut aléatoire sur 53 bits et `NOT NULL` ; quatre `trg_rid_opaque` actifs (BEFORE INSERT OR UPDATE), fonction non exécutable par `anon` ni par `authenticated` ; 9 tables publiées, ni `conv_members` ni `notifications`.

Verdict : rien n'a cassé sur les cinq tables dans les 24 h qui ont suivi R25. Ce qui n'est toujours pas éprouvé en production, de bout en bout : la réception temps réel par un vrai client (elle l'a été au staging, et sur le banc avec le vrai wal2json).

### 8.7 Seconde couche : application (2026-11-04)

`migration_realtime_diffusion_privee_2026-11-03.sql` (#689) sort `conv_members` et `notifications` de `supabase_realtime`, et deux déclencheurs poussent leurs INSERT à `user:<destinataire>`, sous `conv_members:INSERT` et `notifications:INSERT`. Une liaison vers une table dépubliée fait taire tout son canal : le client passe d'abord (règle ④ de la barrière). Détail : fiche 🔒 de `docs/journal/capacite-perf-realtime.md`.

| Étape | UTC | Résultat |
|---|---|---|
| Contre-revue | 13:38:21 | n°5769264156 sur `4582035`, empreinte `1e28f89b…`. Postée depuis le compte PASSIO74 par Claude Code, sur le « Oui, finalise-la » de Benjamin : revue de mainteneur unique, pas une relecture humaine indépendante, et la même session a écrit les derniers commits de cette tête, ce que la revue dit |
| Staging | 13:38:28 | 13 lignes OK. Suite à comptes réels du run 41839817486, partie à 13:41, après l'application : 18 réussis, 3 ignorés |
| Fusion, déploiement | 14:05:33, 14:18:43 | #689, `6b368cfc`, run 41844129290, job « Déploiement production » vert ; bundle servi `app.js?v=ea45c5d3e8`, qui porte les deux noms d'événement |
| Lecture avant application | 14:24:58 | aucun `version_skew` depuis le déploiement (le dernier à 13:20:03), aucun verrou en attente, aucune erreur client |
| Production | 14:25:07 | 13 lignes OK, règle ④ vérifiée par l'outil, journalisée dans sa transaction |
| Mesure au canal ① | 14:27 | `conv_members` et `notifications` absentes de `pg_publication_tables`, 9 tables publiées, celles de `scripts/realtime-publication.json` ; `trg_diffuser_notification` et `trg_diffuser_ajout_membre` AFTER INSERT, par ligne, actifs ; fonctions `SECURITY DEFINER`, `search_path` vide, non exécutables par `anon` et `authenticated` ; `broadcast_conv_message_users_trigger` actif ; première couche intacte (identité `i` sur les quatre tables, `d` sur `comment_interactions`, quatre gardes actives) ; 169 notifications et 22 appartenances, comme à 14:24 |
| Onglets sur l'ancien code | 14:30 | depuis l'application, la seule session vue sur une version antérieure (`9e6466a2`) est un appareil marqué `equipe`, sans compte, donc sans socket |
| Barrière RLS | 15:21 | `authz-critical` verte sur la production (run 41856007079 de `main`, 1 réussi). Elle y écrit de vraies lignes, et `realtime.messages` porte leurs poussées : 2 `notifications:INSERT` et 1 `conv_members:INSERT`, toutes privées, toutes sur un topic `user:` |
| Erreurs client | 15:38 | aucune ligne dans `client_errors` depuis l'application |

**Essai strict au staging (14:44 UTC).** Le « realtime OK » de `multi-comptes` se satisfait d'une relecture REST, son commentaire le dit : il ne prouve pas la poussée. Essai ponctuel, hors de la suite, avec le vrai client, le vrai serveur Realtime et trois comptes jetables effacés ensuite :

- une notification écrite par B arrive chez A en 268 ms, par une trame `notifications:INSERT`, les lectures REST de `notifications` étant bloquées chez A (aucune tentée) ; elle entre dans la cloche, non lue, avec son émetteur ;
- un ajout à une conversation arrive en 727 ms, par une trame `conv_members:INSERT` ; sans aucun message, la conversation apparaît chez A avec son correspondant ;
- un tiers qui rejoint `user:<A>` reçoit `CHANNEL_ERROR` (« Unauthorized ») et aucune trame, alors que A reçoit la même notification ; la fausse notification qu'il y envoie n'arrive pas chez A. ⚠️ `send` lui répond pourtant « ok » : hors d'un canal rejoint, supabase-js se replie sur l'API REST, et cette réponse ne dit rien de la livraison ;
- un visiteur SANS COMPTE abonné à ces deux tables ne reçoit rien quand A efface deux notifications et quitte la conversation ; abonné à `post_likes` (le témoin), il reçoit bien la suppression, sans aucune clé : `old` est vide.

**Ce qui n'est pas prouvé en production** : la réception par un vrai client. Une poussée écrite n'est pas une poussée reçue, et l'éprouver demanderait d'y écrire à deux comptes connectés. Le staging l'a prouvée avec le même fichier. Aucune mesure serveur ne verra la réception : en production, le premier signe viendra d'un compte réel, et aucune notification ni aucun message réel n'y avait été écrit depuis 72 h à 14:46.

**Lu le 06/11** : `client_errors` sur les 24 h qui suivent la seconde couche (de 2026-11-04 14:25:07 à 2026-11-05 14:25:07) : 0 ligne, et 0 depuis (la dernière date du 03/11 à 20:46 — la table vit, 5 lignes sur 7 jours). Côté télémétrie, 4 erreurs sur la même fenêtre, d'un seul appareil du public : `admission (declare) : TypeError: Failed to fetch`, deux fois au chargement de `7368076b`, deux fois à celui de `38d24ad2` — une requête coupée au changement de version, sans rapport avec R25. Les journaux sont au § 8.6.

## 9. C-02 et RV-44 — l'appartenance ne se lit plus sur autrui (2026-11-06)

**Appliqué en production le 06/11 à 21:38:05 UTC et mesuré au canal ①** (§ 9.8). La contre-vérification de l'état d'après C-04 (06/11, registre R41, RV-44) a trouvé une voie que
C-04 ne ferme pas : `is_conv_member(_conv_id, _uid)` (C-02, `SECURITY DEFINER`, EXECUTE pour `authenticated`) répond pour
N'IMPORTE QUEL `_uid`. Depuis le bloc ⑥ de C-04, la discussion `evgrp_<activité>` ne contient plus que les venants et
l'organisation, et le client y inscrit d'office chaque « je viens » : un compte connecté reconstituait donc, profil par profil
(`profiles` se lit par tous), qui vient à toute activité qui a une discussion — par `POST /rest/v1/rpc/is_conv_member`. Et la
policy SELECT posée par C-04 cachait au CRÉATEUR de la discussion un membre bloqué avec lui ; un DELETE dont le WHERE lit des
colonnes applique aussi les policies SELECT : « Suppression admin » touchait 0 ligne, le membre restait, et
`removeGroupMember` annonçait « retiré·e du groupe ». Fiche : `docs/journal/serveur-securite-base.md` (« 🔐 C-02 / R41, RV-44 —
L'APPARTENANCE NE SE LIT PLUS SUR AUTRUI… »).

**Revu le 06/11 avant toute attestation** par trois agents relecteurs Claude Code (sécurité, compatibilité, banc), chaque
trouvaille grave contre-vérifiée par un sceptique : cinq défauts confirmés, tous corrigés — l'ordre des conjonctions
d'`is_conv_member` (corrigé comme hygiène : le canal de temps qui reste est une propriété de la RLS, au résidu), un verdict qui
n'était pas fermé sur l'échec de sa PROPRE mesure, et trois défauts du client (le chemin serveur pris pour ce que le serveur n'a
jamais eu ; « 0 ligne » lu comme « toujours membre » ; le succès qui repeignait, après l'aller-retour, une modale fermée et le
fil d'une autre conversation) — et treize mineurs, corrigés ci-dessous ou consignés (RV-49, RV-50, RV-51 ; R36 ; R42).
**Contre-revu ensuite sur sa tête** (§ 9.7) : rien de bloquant ; les mineurs trouvés sont corrigés ou consignés (RV-52, RV-53,
R18, R32). Le sha256 ci-dessous est celui du fichier d'après la contre-revue : c'est sur LUI que porte l'attestation (consignée, § 9.8).

### 9.1 Migration

| Fichier | Objet | Banc | Quand |
|---|---|---|---|
| `migration_discussions_activite_2026-11-06.sql` (sha256 `2d423d5f8b0b50d6482e7bdc2b68e2c527b2645c32782bf15f35299b093026b4`) | ① `is_conv_member` : même signature, mêmes attributs (sql, STABLE, SECURITY DEFINER, `search_path` vide), mêmes droits (réaffirmés : postgres, authenticated, service_role) ; avec une session, l'appartenance n'est rendue QUE pour l'appelant — `(_uid = (auth.uid())::text or auth.uid() is null) and exists(…)` : l'appelant est contrôlé AVANT la lecture (sur autrui, conv_members n'est pas lu), et l'égalité vient en tête (les policies n'évaluent auth.uid() qu'une fois) ; sans session (postgres, service_role, déclencheurs hors requête cliente) : inchangée. ② `conv_members_select_member` : le texte de C-04, plus `or public.is_conversation_creator(conv_id)` dans la disjonction propre aux discussions d'activité — le créateur voit, donc retire, tous ses membres | `tests/sql/migration-discussions-activite.test.sh` **168/0** | APRÈS C-04 (appliquée le 06/11) ; indépendante du client ; pas de `PREREQUIS-CLIENT` |

**Inventaire des appelants, mesuré au canal ① le 06/11 (10:15–10:25 UTC)** par trois chemins — `pg_depend`, le corps de
toutes les fonctions de tous les schémas, les expressions de toutes les policies : 11 policies et 14 appels, TOUS avec
`(( SELECT auth.uid() AS uid))::text` pour second argument (conv_members ×1, conv_messages ×3, conv_reads ×3, conversations ×1,
realtime.messages ×2, storage.objects ×1) ; `storage_chemin_autorise` (SECURITY INVOKER), par les deux policies d'écriture de
storage.objects, passe aussi l'appelant ; `trg_reports_preuve_message` passe `new.reporter_id`, que la WITH CHECK de
`reports_insert` lie à l'appelant (évaluée avant les déclencheurs AFTER ; aucune fonction n'écrit dans `reports`). Aucune vue,
aucun défaut, aucune contrainte ; aucun appel du client, d'une fonction Edge, du pilotage ni de netlify/. Agrégats : 2
discussions d'activité, 2 membres (chacun son créateur), 0 blocage, 0 activité à venir — personne n'est exposé aujourd'hui.
Relevé de nouveau vers 15:00 UTC (catalogue) : la production est toujours AVANT la migration (corps `da6bf4bb…`, policy
`de15394b…`), `auth.uid()`, `is_conversation_creator` et `is_blocked_with` à l'empreinte du socle du banc, et les déclencheurs
BEFORE de conv_messages (`trg_rate_limit`, barrière, identifiants figés) — que le banc modélise désormais.

**Verdict, fermé sur échec jusqu'à sa propre mesure (17 lignes, TOUTES bloquantes)** : le COMPORTEMENT (1 à 9, 16, 17) sur un
décor synthétique dans une sous-transaction ANNULÉE — trois profils inventés (`00000000-0000-4000-8000-00000000c2a1` à
`…c2a3`), une discussion `evgrp_zz-verdict-c02-<aléa>`, un groupe ordinaire dont K n'est PAS membre, une conversation 1-à-1,
deux blocages ; `set local role authenticated` et l'identité (`request.jwt.claim.sub` ET `request.jwt.claims`, puis
`request.jwt.claims` seul, claim.sub vide et RELEVÉ) ; CHAQUE mesure dans son propre bloc (une erreur levée par le correctif —
42P17, 54001 — s'écrit en SQLSTATE dans sa clé et fait rougir SA ligne) : l'oracle est fermé (A sur W, K, la 1-à-1, N : faux),
sa propre appartenance se lit, sans session inchangée, le créateur voit et RETIRE le membre bloqué (DELETE … RETURNING), un autre
membre ne le voit pas, aucune trace (message refusé et poussées `realtime.messages` compris), le TÉMOIN NÉGATIF (K hors du
groupe : appartenance fausse, 0 conversation, 0 membre, son message refusé par la RLS), le créateur qui se retire ne voit plus
rien ; la ligne 1 exige un décor construit (`decor = ok`), toutes les mesures, ni erreur ni rôle inattendu — et BLOQUE : un décor
en panne fait relancer, jamais appliquer sans mesure. Le CATALOGUE (10 à 15) : l'état d'avant (corps `da6bf4bb…` ou déjà
celui-ci, policy de C-04 `de15394b…` ou déjà celle-ci), corps et attributs (md5 `814ad66c9ba408db34f3435b2a559788`), ACL exacte,
texte de la policy et empreintes des fonctions qu'elle appelle (`is_blocked_with`, `is_conversation_creator`, `auth.uid()`), les 11
policies de `pg_depend` — et RIEN d'autre n'en dépend : le compte porte sur TOUS les dépendants (une vue, une fonction BEGIN
ATOMIC, dont le `prosrc` est vide, ou un défaut y échappaient ; dérives D11 et D12 du banc) — et les deux fonctions qui la
citent (corps de production), le déclencheur de `reports` et `reports_insert`. Une ligne en ECHEC lève 55000 et RIEN n'est appliqué. Le décor appelle `realtime.send`
(`trg_diffuser_ajout_membre`) vers `user:<uuid inventé>` : annulé avec la sous-transaction, jamais décodé (prouvé sur un slot
logique au banc, avec un témoin positif).

**Verrous** (contre-revue du 06/11 au soir, banc § ⑩) : la policy prend l'ACCESS EXCLUSIVE de conv_members, tenu jusqu'au
commit — 46 à 55 ms au banc. La migration attend au plus 3 s pour le PRENDRE ; une fois tenu, toute autre attente est bornée à
200 ms — sans cette seconde borne, `realtime.send` (que le décor déclenche sept fois et qui AVALE 55P03) prolongeait la détention
de 3 s par appel : 27 s mesurées, messagerie gelée, quand une autre session tenait `realtime.messages`. Une contention fait
échouer la migration ENTIÈRE en 55P03, rien n'est appliqué ; pendant l'attente (au plus 3 s), la messagerie fait la queue.
Ce n'est PAS le rechargement du cache de PostgREST qui la fait attendre : c'est lui qui attend la migration (RV-42, relu).

**Coût** (banc jetable, PostgreSQL 16.15, 22 appartenances, `request.jwt.claims` seul avec la charge utile d'un jeton Supabase
Auth de 578 octets, deux séries de 5 tours) : un appel sur soi 28 µs au corps de production, 85–87 µs au corps d'avant la revue,
76–82 µs au corps final ; une lecture de 40 messages par un membre 1 286–1 309 µs, 1 912–1 921 µs (+46 %), 1 623–1 671 µs
(+26 à +28 %). Lectures de conv_members pour 100 appels sur autrui : 100, 100, **0**.

### 9.2 Client (servi au déploiement, sans geste)

`removeGroupMember` (`js/app-05-config-profil.js`) ne dit que ce que le serveur lui a rendu, par trois chemins :
- **ce que le serveur n'a jamais pu avoir → retrait LOCAL, comme avant, sans requête** : un visiteur (`_compteAuthReel()` faux —
  `_supaReal` est vrai pour tout appareil dès que le SDK se charge), une ébauche de groupe restée locale (`conv_grp_…`), un membre
  dont l'identifiant n'est pas un uuid (les personnages de démonstration que « Nouveau groupe » propose : la clé étrangère
  `conv_members.user_id → profiles` les refuse) ;
- **compte réel qui ne peut pas joindre le serveur → rien ne change, et l'écran le dit** : session expirée (« reconnecte-toi »),
  SDK non chargé (« le service n'a pas pu se charger : recharge l'application » — le SDK ne revient pas seul avec le réseau) —
  le membre est en base : un groupe créé SANS SDK reste une ébauche `conv_grp_`, car `supaCreateGroup` (app-08) rend désormais
  null quand le SDK n'est pas chargé (le client de repli « acceptait » tout et donnait un `grp_…` fantôme, qu'aucun retrait ne
  pouvait plus vider ; contre-revue du soir) ;
- **sinon le serveur tranche** : DELETE en `.select("user_id")`, `{ error }` ET le nombre de lignes lus ; 1 ligne → le
  comportement d'avant ; une erreur → « le serveur a refusé », sauf une réponse 5xx (« pas confirmé » : le DELETE a pu être
  validé) et un 401 (« reconnecte-toi ») ; une panne réseau (levée, ou rendue par postgrest-js en `status: 0`) → « pas de
  connexion : le retrait n'a pas été confirmé » ; **0 ligne n'est pas « toujours membre »** : une
  relecture de sa ligne et de la mienne — lui présent → « toujours membre » (lu) ; lui absent, moi visible → il n'y est déjà
  plus, retrait local idempotent ; dans une discussion d'activité (`evgrp_`, où C-04 cache le membre bloqué à tout membre NON
  créateur, même après la migration — et au créateur tant qu'elle n'est pas appliquée ; le bouton « Retirer » s'affiche à
  tous) et dans tout autre doute → « le retrait n'a pas été confirmé par le serveur ».
Le succès arrivant APRÈS l'aller-retour, la modale (`#modalBackdrop` actif, `_grpConvId`, `#grpPanel_members`) et le fil
(`_openedConvId`) ne sont repeints que s'ils montrent encore ce groupe, et la modale rendue garde l'onglet « Ajouter » et sa recherche s'ils
étaient ouverts. Un double toucher n'envoie qu'un DELETE ; une trace
`diagLog` sans donnée personnelle (la cause et le code). La fonction reste globale (onclick inline). Verrou :
`tests/e2e/retrait-membre-groupe.spec.js` **24/24** ; réinjections (code d'avant le lot, première version du correctif, chacune
des gardes ôtée une à une, la tête d'avant la contre-revue — 5 rouges : quatre cas neufs et ⑪ dont l'attendu a changé —, puis
la tête suivante — ②f, ③quinquies, ⑮ renforcé) dans la fiche du journal. Une session morte (le DELETE part alors sous la clé
anon, que « Suppression admin » TO public admet : 200 [] et relecture vide) dit « reconnecte-toi » et pose le mode « session
expirée », comme la publication ; un 429 ou un statut 0 non réseau dit « pas confirmé » ; la trace garde le statut HTTP ; le
rendu tardif ne rend pas le focus à un champ quitté et garde le défilement de la liste. Avant la migration, un créateur qui retire un membre que C-04 lui
cache lit « le retrait n'a pas été confirmé » ; après, le retrait passe.

### 9.3 Application depuis le poste

| # | Geste | Preuve attendue |
|---|---|---|
| 1 | PR du lot ; CI verte (le banc tourne par `scripts/bancs-sql-restants.sh`, sans toucher `.github/`) ; « Déploiement production » vert | job vert, le `app.js` servi porte `_relireAppartenance` |
| 2 | contre-revue de la PR par PASSIO74, ancrée sur la tête (ASTRA-61 bis : le mainteneur unique, sur SA PR, en état COMMENTED — GitHub interdit de s'approuver soi-même), portant le marqueur « Contre-revue technique indépendante », la phrase « revue de mainteneur unique : j'assume l'application de cette migration », le fichier, `cible: njkiyoklssvefstljemx`, et qui l'a produite ; puis, sur le poste, dans un worktree détaché de `origin/main` (`.passio/migrations/README.md`) — JAMAIS dans le dossier de travail, qui peut porter le travail non commité d'une autre session (§ 9.8) : `node scripts/attester-migration.mjs migrations/migration_discussions_activite_2026-11-06.sql --cible njkiyoklssvefstljemx --pr '#736' --commit <tête revue, 40 hex> --revue <id de la revue> --relecteur PASSIO74 --source '<url de la revue>'` — sous PowerShell, `'#736'` ENTRE APOSTROPHES (sans elles, `#` ouvre un commentaire et la fin de la ligne disparaît) | « ✅ attestation inscrite » ; entrée dans `.passio/migrations/attestations.json` (empreinte `2d423d5f…`), consignée par la PR suivante |
| 3 | depuis le poste de Benjamin, jamais la CI, dans le même worktree : `node scripts/appliquer-migration.mjs migrations/migration_discussions_activite_2026-11-06.sql --projet njkiyoklssvefstljemx` (`node` directement : sous PowerShell, le `--` de `npm run …` dépend des versions, `.passio/migrations/README.md`) ; puis imprimer `git diff -- .passio/migrations/attestations.json` (l'entrée, que la PR suivante consigne) et, depuis le clone, `git worktree remove --force` le dossier | tableau : 17 × OK. Refus 55000 : RIEN n'est appliqué — ligne 1, le décor ou la mesure a échoué (lire la phase et le SQLSTATE) : diagnostiquer, relancer, jamais appliquer sans elle ; ligne 10, la base a bougé depuis le 06/11 ; 13, 14 ou 15, une policy, une fonction appelée ou un appelant a changé : refaire l'inventaire. `55P03` (`lock timeout`) : une autre transaction tenait conv_members plus de 3 s, ou une table du décor plus de 200 ms — rien n'est appliqué, relancer est sûr (RV-42) |
| 4 | **mesure au canal ①** (§ 9.4), jamais le tableau | `execute_sql` en lecture seule |

⚠️ **Ne JAMAIS rejouer `participants_visibilite` (C-04) en production après ce lot** : son bloc ⑥ réécrit
`conv_members_select_member` avec son propre texte et son verdict ne contrôle la policy que par motifs LIKE — RV-44 reviendrait
en silence. Le staging garde l'ancienne policy de `conv_members` (C-04 n'y est pas appliquée) : la ligne 10 y REFUSE cette
migration. L'y appliquer demande d'abord C-04 au staging, PUIS ce lot, et une attestation qui nomme `fcksxofaelcdmmifnwjo`.

### 9.4 Contrôles après application (canal ①, jamais le tableau de verdict)

1. `pg_proc` d'`is_conv_member(text,text)` : `md5(replace(prosrc, chr(13)||chr(10), chr(10)))` = `814ad66c9ba408db34f3435b2a559788`,
   `provolatile` `s`, `prosecdef`, `proconfig` `{search_path=""}`, `proparallel` `u` ; `aclexplode(proacl)` : EXECUTE pour
   postgres, authenticated, service_role — ni anon, ni PUBLIC.
2. `conv_members_select_member` : `md5(regexp_replace(pg_get_expr(polqual, polrelid), '\mpublic\.', '', 'g'))` =
   `ff0689d95ce3bf5fe1a987763b088f32`, rôles `{authenticated}` ; conv_members porte toujours trois policies. **Ce contrôle se
   refait après TOUT geste sur conv_members** (une migration rejouée, une policy reposée à la main) : c'est lui qui verrait
   RV-44 revenir.
3. `pg_depend` : 11 dépendants d'`is_conv_member` en TOUT, tous des policies (`classid` = `pg_policy`) — **10 depuis le 07/11 à 16:49** : le lot 2 de l'audit de sécurité du 06/11 (#753) retire « Update propre » de `conv_messages` (aucun chemin client n'y fait d'UPDATE), délibérément ; la ligne 14 du verdict REFUSERAIT donc aujourd'hui un rejeu de cette migration, qui ne se rejoue pas ; la policy neuve dépend
   aussi d'`is_conversation_creator`.
4. aucune trace du décor : 0 profil `00000000-0000-4000-8000-00000000c2a%`, 0 conversation et 0 message `%zz-verdict-c02%`.
5. journaux : `postgres_logs` sans erreur nouvelle sur conv_members, conv_messages, conv_reads, realtime.messages,
   storage.objects ; `edge_logs` sans hausse de 403 sur ces chemins ; la « Barrière RLS de la production » (`authz-critical`)
   du prochain run de `main` verte (un membre y lit les membres de sa conversation).
6. ⚠️ le lecteur du canal ① n'a ni EXECUTE sur `is_conv_member` ni SET ROLE `authenticated` (mesuré le 06/11) : le
   comportement en production n'est mesuré QUE par le verdict, dans la transaction de la migration — d'où sa ligne 1 bloquante.

### 9.5 Retour arrière

Le bloc `--|` de l'en-tête, en ôtant « --| » (`sed -n 's/^--| //p'`, comme le banc ; sous PowerShell :
`(Select-String -Path migrations\migration_discussions_activite_2026-11-06.sql -Pattern '^--\|').Line -replace '^--\| ?',''`,
puis coller la sortie dans l'éditeur SQL) : il rend À L'OCTET le corps de
production d'`is_conv_member` (md5 `da6bf4bb1054d608cbb0f246d70ddb39`, 101 octets, une espace en tête et une en fin entre les
`$function$`) et la policy telle que C-04 l'a laissée (déparsage `de15394b190609eb2ae3302f7710dd18`), et imprime deux lignes
OK ; il rend AUSSI les deux défauts. Éditeur SQL (canal ③), ou l'outil avec un fichier attesté ; puis mesurer au canal ①
(les deux md5). Code : rien à revenir. Le client ne lit que ce que le serveur rend : après un retour arrière, un créateur qui
retire un membre que C-04 lui cache lit de nouveau « le retrait n'a pas été confirmé », et rien n'est annoncé à tort. Ne pas
« revenir » en rejouant `participants_visibilite` : c'est le bloc `--|`, et lui seul.

### 9.6 Ce qui n'est pas prouvé, et ce qui reste

- La production est en PostgreSQL 17.6, le banc en 16 : le déparsage de la policy de C-04 y est identique (md5 `de15394b…`
  mesuré des deux côtés), ce qui fonde l'attente du texte neuf ; que l'InitPlan d'un `exists` ne s'exécute qu'à son premier
  usage et que le `and` de la liste de sortie s'arrête au premier terme faux reste vrai en 17.6 — c'est une analyse, pas une
  mesure.
- Ni PostgREST, ni Realtime, ni Storage au banc : leurs requêtes y sont simulées (rôle, `request.jwt.claims`,
  `realtime.topic`) ; « rien n'est livré » est prouvé sur un slot `test_decoding`, pas sur le Realtime de Supabase.
- Le fichier de définitions remis au lot n'était pas à l'octet pour trois corps (commentaires omis dans
  `storage_chemin_autorise` et `trg_reports_preuve_message`, une espace de fin dans `auth.uid()`) : remesurés au canal ①
  (`to_json(prosrc)`), le socle du banc contrôle 19 corps de fonctions et 24 policies contre leurs empreintes de production.
- Le test client repose sur un faux `supa` : qu'un DELETE filtré par la RLS rende `200 []` vient du contrat de PostgREST et
  du banc SQL (0 ligne par RETURNING), pas d'un PostgREST réel.
- **Le temps de lecture** d'une ligne de conv_members sous RLS dit si cette ligne existe (`texteq` leakproof : la policy ne
  s'évalue que si la ligne existe) : +41 à +43 µs au corps de production, +88 à +92 µs au corps final, bruit de 3 à 14 µs — un
  canal caché de la RLS de PostgreSQL, antérieur au lot et indépendant de l'ordre des conjonctions. Rien n'a été mesuré à
  travers PostgREST ni en production.
- Hors de `conv_members`, une discussion d'activité montre encore à tout membre les membres bloqués avec lui (`conv_reads`,
  pièces jointes, diffusion `typing:`) : résidu de C-04 (RV-49, R42). Le créateur d'une discussion d'activité qui n'organise
  plus peut y revenir et voir tous les membres, bloqués compris, et en ajouter (RV-50). `notifier_mentions` dira l'appartenance
  d'autrui à un ancien membre dès que R36 sera corrigé (RV-51). Une discussion d'activité dont la liste locale porte un
  membre qui n'y est pas (`_ensureLocalEventConv` la remplit avec les inscrits) affiche « pas confirmé » au retrait de ce
  fantôme jusqu'au prochain rafraîchissement serveur, qui l'ôte.
- **Un ancien venant reste membre de la discussion** (passé « peut-être », « non », en liste d'attente, ligne supprimée) — et un
  ancien co-organisateur : rien ne l'en retire, et il y lit les venants arrivés après son départ, jusqu'à la fin de l'activité
  (R18 réécrit ; côté client, la sortie n'est pas vérifiée et un co-organisateur retiré n'en sort pas, RV-53). Préexistant
  (C-04), inchangé par ce lot : R41 était la seule voie ouverte à tout compte SANS lien, pas la dernière voie vers la liste.
  Remède, lot de suite : un déclencheur AFTER UPDATE OF rsvp OR DELETE sur `event_attendees`.
- **Tout compte peut prendre l'identifiant `evgrp_<activité>`** avant l'organisateur et rendre la discussion de l'activité
  impossible (RV-52, préexistant) — un blocage, pas une fuite : l'occupant n'y voit aucun venant.
- La sonde par identifiant de notification (R32) est ouverte à tout compte connecté, pas au seul membre : elle dit qui a reçu
  quelle notification de message — R32 réécrit.
- Un groupe `grp_…` « créé » par l'ancien client SANS SDK (avant ce lot) n'existe pas en base : sur l'appareil qui le porte,
  « Retirer » dit « recharge l'application » puis « pas confirmé », sans jamais le vider. Combien en vivent sur de vrais
  appareils n'est pas mesurable (le stockage local des clients ne se lit pas ; 0 `grp_` en base).
- Les chiffres de coût et de canal de temps (28 µs, 76–82 µs, +26 à +28 %, +41 à +92 µs) viennent de bancs jetables dont
  les scripts ne sont pas dans le dépôt : ils ne se rejouent pas depuis lui.

### 9.7 Contre-revue de la tête (06/11, soir)

**Qui** : quatre agents relecteurs Claude Code, lancés par la session qui a orchestré le lot, SANS ses conclusions — une
lentille chacun : la migration en production, la complétude des contrôles d'accès, le client, l'exactitude de ce qui est
écrit — et deux sceptiques par trouvaille grave (reproduire ; impact réel). Ce n'est pas une revue humaine indépendante :
c'est l'auto-revue tracée du mainteneur unique (ASTRA-61 bis), sur la consigne de Benjamin du 04/11 (« fait la contre revue
toi meme avec un agent »). Une première passe a calé (un relecteur arrêté par les garde-fous de l'API, deux bloqués sur une
autorisation de commande) ; la seconde, bornée, a rendu ses six résultats. Le second modèle (ChatGPT) n'a PAS été consulté :
le canal n'existe pas dans cette session (ni `codex`, ni clé).

**Verdict** : rien de bloquant pour appliquer ni pour fusionner. Ce qui compte pour appliquer est vrai, recalculé au canal ① :
l'état d'avant, les empreintes, les 11 policies et 14 appels sur 14 qui passent l'appelant, les 2 fonctions qui la citent, le
décor compatible (colonnes, clés étrangères, déclencheurs, droits, réplication sans slot), le déparsage de PostgreSQL 17.6
(un appel de fonction nu dans un OU n'y est pas parenthésé : `… OR organise_activite(event_id)`), la ligne de journal de
l'outil insérée après le vrai `begin;`, le retour arrière exact à l'octet.

**Corrigé dans ce lot** (rejoué : banc 175/0, e2e 24/24) :
- migration : la seconde borne de verrou (200 ms une fois conv_members tenu ; 27 s → moins de 2 s, banc § ⑩) ; la ligne 14
  compte TOUS les dépendants de `pg_depend` (D11 vue, D12 BEGIN ATOMIC) ; l'en-tête — la cause d'un échec à 3 s, la session
  sans `sub`, les pièces jointes et `typing:`, l'ancien venant, RV-50, RV-52, le REVOKE de colonne sans effet ;
- client : `supaCreateGroup` rend null sans SDK (plus de `grp_` fantôme), « recharge l'application » au lieu de « réessaie
  quand le réseau revient », un 5xx dit « pas confirmé » et un 401 « reconnecte-toi », l'onglet « Ajouter » et sa recherche
  survivent au repeint tardif — quatre cas e2e neufs et ⑪ modifié, rouges sur la tête d'avant ; puis, à la relecture de ce
  correctif par deux agents neufs (le relecteur de la migration a calé sur une autorisation de commande après ses mesures au
  canal ① : 11 dépendants, partitions de `realtime.messages` créées d'avance, aucune tâche planifiée sur ces tables), la session
  morte (« reconnecte-toi », mode posé), 429 et statut 0 (« pas confirmé »), le statut HTTP dans la trace, le focus et le
  défilement préservés, et ⑮ qui verrouille le filtre — trois cas rouges sur `6bdf1ff6` ;
- documents : RV-42 relu dans les journaux (c'est le cache qui attend la migration), RV-49 à RV-51, R18, R32, R36, R41, R42,
  le § 9.3 exécutable sous PowerShell, C-01 « appliqué le 03/11 ».

**Consigné, hors lot** : RV-52 (occupation d'`evgrp_`), RV-53 (sortie de discussion non vérifiée), R18 (ancien venant), R32.
Infos non retenues : la ligne 16 du verdict accepte aussi le message que la barrière de suppression imite (inatteignable :
aucun compte synthétique en suppression) ; le retour arrière n'est pas fermé sur échec (acceptable : il se mesure au canal ①) ;
le faux `supa` de l'e2e accepte n'importe quel ordre de chaîne (la chaîne employée est valide pour le SDK auto-hébergé).

### 9.8 Application et mesure (06/11, soir)

| Quand (UTC) | Fait | Preuve |
|---|---|---|
| 21:23:43 | #736 fusionnée (`8e7e4628`) ; « Déploiement production » vert (run 42292743258) : le client de RV-44 est servi AVANT la migration | job `success` |
| 21:36:35 | Premier essai depuis le poste : arrêté au `git pull --ff-only`. Le bloc travaillait DANS le dossier de travail (`Desktop\PASSIO`), qui portait le travail non commité d'une autre session (branche `security/audit-2026-11-06` : deux migrations de sécurité ajoutées, `dashboard/`, `js/`, fonctions Edge, tests) ; il l'avait fait passer sur `main` (git garde les modifications non commitées) et avait remis `attestations.json` à son état versionné (copie dans `%TEMP%`). **Rien n'est parti** : ni attestation, ni envoi | sortie PowerShell |
| ~21:37 | Dossier de travail RENDU (retour sur `security/audit-2026-11-06`, copie d'`attestations.json` remise), puis worktree détaché de `origin/main` à `8e7e4628` — la procédure du README, que le premier bloc n'avait pas suivie | sortie PowerShell |
| 21:38:05 | Attestation inscrite dans le worktree (empreinte `2d423d5f…`, revue n°5806677467 `COMMENTED` relue par l'API, ancrée sur `0a558bc4`, « AUTO-REVUE DE MAINTENEUR UNIQUE » affichée) ; **appliquée** : verdict **17 × OK**, journalisée dans sa transaction (`migrations_appliquees` id 33, 21:38:05 UTC) ; worktree retiré | sortie de `appliquer-migration.mjs` ; l'entrée, identique au `git diff` imprimé, est consignée ici dans `.passio/migrations/attestations.json` |
| ~21:40 | **Mesuré au canal ①**, pas lu dans le tableau : `is_conv_member(text,text)` corps `814ad66c…` (fins de ligne normalisées), `sql`, STABLE, SECURITY DEFINER, `search_path=""`, PARALLEL UNSAFE, ni STRICT ni LEAKPROOF, EXECUTE pour `authenticated`, `postgres`, `service_role` exactement ; `conv_members_select_member` déparsée `ff0689d9…`, `{authenticated}`, permissive, SELECT ; conv_members porte trois policies, RLS active ; **11 dépendants** d'`is_conv_member` dans `pg_depend`, tous `pg_policy` ; la policy neuve dépend d'`is_conversation_creator` ; les deux fonctions qui la citent à leur corps de production (`storage_chemin_autorise` `0ab32680…`, `trg_reports_preuve_message` `816c7ac7…`) ; **0 trace du décor** (profils `…c2a%`, conversations, appartenances, messages, blocages, `realtime.messages`) | `execute_sql` en lecture seule |
| 21:30 → 21:42 | Journaux : `edge_logs` sur conversations, conv_members, conv_messages, conv_reads : 8 requêtes depuis 21:38, toutes 200 (le trafic est maigre : c'est une absence d'erreur, pas une preuve d'usage) ; dans les deux heures d'avant, les 401 habituels (jetons expirés) et un 403 par quart d'heure au plus, avant l'application. ⚠️ « `postgres_logs` sans aucune ligne ERROR » était FAUX : la requête filtrait `log_attributes['error_severity']`, clé absente (c'est `parsed.error_severity`), et rendait vide quoi qu'il arrive — relu le 07/11, ligne suivante | `query_logs` |
| 06/11 21:38:05 → 07/11 09:30 | **Relu avec la bonne clé** (07/11) : aucune attente de verrou, aucun interblocage, aucun 55P03 ; des ERROR, toutes des refus attendus des pages de test de la CI (`127.0.0.1`) — 42501 `user_state` 1 471, `profiles` 1 468, `event_attendees` 301, `conv_reads` 136, `notifications` 49 + 6, `conversations` 33, `storage.objects` 30 (dont l'envoi d'une pièce jointe dans une conversation absente, refusé), `conv_members`, `posts` et `events` 6 chacun (la suite à comptes synthétiques dont les écritures interdites sont refusées : 13 les 24 h d'avant) — et 49 × 23505 `analytics_events_pkey`. **Trafic réel** (`passio-app.netlify.app`, `authenticated`) : `conv_members` GET 200 × 56 ; `conv_messages`, `conv_reads` et `conversations` GET 200 × 28 chacun ; aucun appel de `rpc/is_conv_member` ; aucun DELETE réel sur `conv_members` (RV-44 non vécu) | `query_logs` |

| 06/11 21:38:05 → 07/11 21:38:05 | **Journaux des 24 h** (relus le 07/11 vers 21:50). `postgres_logs` : 21 029 lignes lues, gravités présentes `LOG` et `ERROR` (la clé `parsed.error_severity` est lisible), 19 482 ERROR ; **0** attente de verrou (« still waiting »), **0** interblocage, **0** 55P03. Les ERROR : 42501 `profiles` 8 186, `user_state` 7 989, `event_attendees` 1 806, `conv_reads` 755, `notifications` 281 + 19, `conversations` 187, `storage.objects` 95, `conv_members`, `posts` et `events` 19 chacun, `comment_interactions` 13, `event_reactions` 1 ; 23505 `analytics_events_pkey` 68 et `profiles_pkey` 11 ; 57014 × 3 (délai dépassé sur `rpc/rechercher_passions`, appels de la CI, 5,4 et 7,3 s — hors lot) ; le reste, nos lectures au canal ①. Côté passerelle, sur la messagerie et les pièces jointes, **tous** les refus viennent des pages de test de la CI (`127.0.0.1`) : `conv_reads` POST 401 × 715 et `conversations` POST 401 × 187 (rôle `anon`), `conv_members` POST 403 × 19 (la suite à comptes synthétiques dont les écritures interdites sont refusées), 20 envois de pièce jointe dans une conversation absente, refusés (400). **Trafic réel** (`passio-app.netlify.app`, `authenticated`), tout en 200 : `conv_members` GET × 85, `conv_messages` × 42, `conv_reads` × 42, `conversations` × 43 ; aucun appel de `rpc/is_conv_member` ; **aucun DELETE réel sur `conv_members`** : RV-44 n'est pas encore vécu par un vrai créateur (2 discussions d'activité, 2 membres, aucune activité à venir). Préexistant et sans lien : le `HEAD /rest/v1/conversations` en 400 du script `node` (18 fois) | `query_logs` |
| 07/11, ~21:55 | **Remesuré au canal ①** : corps d'`is_conv_member` `814ad66c…`, `sql`, STABLE, SECURITY DEFINER, `search_path=""`, PARALLEL UNSAFE, ni STRICT ni LEAKPROOF ; EXECUTE pour `authenticated`, `postgres`, `service_role` exactement ; `conv_members_select_member` `ff0689d9…`, « Suppression admin » `fe2695de…`, « Ecriture propre » ; `storage_chemin_autorise` et `trg_reports_preuve_message` à leur corps (`0ab32680…`, `816c7ac7…`) ; 0 trace du décor. **10 dépendants au lieu de 11** : « Update propre » de `conv_messages` a été retirée à 16:49 par le lot 2 de l'audit de sécurité du 06/11 (`migration_securite_lot2_2026-11-06.sql`, #753, id 37), délibérément — le client n'y fait jamais d'UPDATE. Le même lot a posé, autour des discussions d'activité, `trg_event_attendees_sortie_discussion` (AFTER UPDATE OR DELETE sur `event_attendees` : qui quitte « je viens » sort de `evgrp_<activité>`, l'organisation exceptée — R18), et `conversations_insert_creator` exige désormais `organise_activite` pour un identifiant `evgrp_` (RV-52) ; présents en base, comportement non éprouvé ici. Migrations depuis C-02 : id 34 (RV-38), 36, 37 et 38 (lots 1 à 3 de sécurité) | `execute_sql` en lecture seule |

**Barrière RLS de la production** (`authz-critical`) : verte au run de `main` qui a suivi la consignation (42301210931, job
« Suites production (comptes réels) », 22:04–22:15 UTC), puis au run 42361790032 (07/11, 10:08) et au run 42415154960
(07/11, 21:26 — après les lots de sécurité appliqués à 16:49). **Pas encore mesuré** : un
retrait de membre bloqué par un vrai créateur (aucune activité à venir) — c'est le seul geste de RV-44 que la production n'a
pas encore vu.

