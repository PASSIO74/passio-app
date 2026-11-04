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

Chaque fichier porte son retour arrière en tête. Après chaque application : mesurer l'état en base au canal ①
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
| **reste** | `migration_participants_visibilite_2026-11-03.sql` : **à partir du 2026-11-05 18:40 UTC** (48 h après le déploiement, pour les PWA restées ouvertes), puis mesure au canal ① | rappel programmé |

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
| **reste** | `participants_visibilite` à son heure (§ 6.3, à partir du 05/11 18:40 UTC) : son `create or replace` d'`organise_activite` ne change rien (copie à l'octet près, banc ⓪). R27 se tranche AVANT elle si la branche « venant » doit se limiter à « going » | — |

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
| `migration_realtime_identite_opaque_2026-11-03.sql` | `rid` aléatoire de 53 bits (chiffres 17 à 32 d'un UUID v4, masque 2^53 − 1 : exact en JSON), index unique `<table>_rid_key` et `replica identity using index` sur `conv_members`, `notifications`, `conv_reads`, `post_likes` ; `comment_interactions` en identité DEFAULT (l'oracle du filtre se ferme) ; garde `trg_rid_opaque` (le `rid` n'est écrit que par la base) ; verrous NOWAIT en boucle ; verdict en 10 lignes | `migration-realtime-identite-opaque` 239/0 (`realtime.apply_rls` de production recopiée à l'octet, nourrie du WAL réel du banc ; attaque par encadrement rejouée ; verdict sous verrous concurrents ; retour arrière pendant que le temps réel décode ; vingt mutations rouges) — fichier sha256 `9f48ffe1…` | **dès la fusion** : serveur seul, aucun changement client. De préférence AVANT `participants_visibilite`, dont la purge efface des lignes `conv_members` qui partiront alors opaques |

Ordre à partir du 04/11 : `promotion_discrete_vues` (§ 7) est APPLIQUÉE (07:47 UTC, mesurée au canal ①) ; reste R25
(ici, dès la fusion), puis `participants_visibilite` (§ 6, à partir du 2026-11-05 18:40 UTC). R25 est indépendante
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
  la vérification relit archive et cible au chiffre près ; sans `JSON.rawJSON`, un nombre à risque fait échouer
  la lecture ; le DDL de reprise refuse une table partitionnée ou étrangère ; `tests/unit/restaurer-donnees.test.mjs`
  22/22, rouge sur six réinjections.
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
2. Relancer le job « Suites production (comptes réels) » du dernier run de `main` (`PASSIO_E2E_MULTI=1`, comptes
   synthétiques) : un « j'aime » retiré, une notification effacée, un départ de conversation — un UPDATE ou un DELETE
   refusé faute d'identité y tomberait au rouge.
3. Consigner l'attestation dans une PR suivante.

### 8.4 Retour arrière

Le bloc `--|` de l'en-tête, exécutable tel quel : l'identité d'abord, puis la garde, puis l'index (dans l'autre ordre,
tout UPDATE et DELETE des tables publiées est refusé ; la gate le refuse aussi). Il rend à `comment_interactions` son
identité FULL d'origine. **La colonne `rid` RESTE**, inerte : la supprimer pendant que le temps réel n'a pas tout décodé
fait lever `apply_rls` et perd le lot en cours (contre-revue finale, mesuré) — la retirer se fait à part, après drainage du
slot, selon l'en-tête. Code : revert du merge ; aucun état local touché.

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
