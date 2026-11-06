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
| **reste** | l'appliquer depuis le poste de Benjamin (bloc du 06/11), puis la mesurer au canal ① | — |

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
