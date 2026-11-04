-- ═══════════════════════════════════════════════════════════════════════════
-- PASSION_REQUESTS — UNE DEMANDE SE DÉPOSE DE NOUVEAU : LA POLICY D'INSERT NE
-- LIT PLUS SA PROPRE TABLE (42P17), ET UNE GARDE JUGE CE QUE LE CLIENT ÉCRIT,
-- AVANT trg_passion_request_auto (2026-11-04, version 2 après contre-revue)
--
-- MESURÉ EN PRODUCTION le 2026-11-04 au canal ① (catalogue, journaux et
-- agrégats seuls — aucune ligne d'utilisateur lue) :
--   · postgres_logs, 24 h : 162 erreurs `42P17 infinite recursion detected in
--     policy for relation "passion_requests"` au dernier relevé (vers 15 h 50
--     UTC), toutes ERROR au stade PARSE, application `postgrest`, connexion
--     `authenticator`, UNE seule forme de requête : l'INSERT que PostgREST bâtit
--     pour `supa.from("passion_requests").insert({...})` (`deposerDemande`,
--     js/passions-flat.js) — `WITH pgrst_source AS (INSERT … RETURNING 1) …`,
--     recopiée dans le verdict. Second témoin, indépendant :
--     `extensions.pg_stat_statements` ne connaît qu'UNE forme d'INSERT PostgREST
--     sur la table, 785 caractères une fois ses constantes normalisées, md5
--     daa27ef69523d836d159fd50b234d9d2 (2 exécutions, sous authenticated : les
--     deux demandes de septembre — une 42P17, levée au PARSE, n'y entre jamais)
--     — celle que le banc retrouve en exécutant la requête du verdict. Aucune
--     autre relation ne lève 42P17.
--   · edge_logs, même fenêtre : 158 POST /rest/v1/passion_requests, TOUS en
--     HTTP 500, TOUS sous le jeton anon (aucun sous un jeton de compte), TOUS de
--     HeadlessChrome, référent http://127.0.0.1:8080, 81 adresses, toutes aux
--     États-Unis : selon toute vraisemblance les suites e2e de la CI (un
--     référent local n'est pas l'application servie), qui jouaient le chemin du
--     VISITEUR — `deposerDemande` envoyait sous `MY_UID`, qu'un visiteur porte
--     en `u_<aléatoire>`. Aucun compte dans la fenêtre ; une demande de COMPTE
--     (repli de `creerPassion` quand la RPC `creer_passion` échoue) lèverait la
--     même erreur.
--   · la table : 2 lignes, toutes deux du 2026-09-08 et résolues (approved,
--     duplicate) ; RLS active, non forcée ; anon et authenticated tiennent
--     SELECT, INSERT, UPDATE, DELETE de TABLE, aucun droit de colonne
--     (aclexplode) — le client écrit donc aussi `id`, `created_at`,
--     `updated_at`, `normalized_label` ; aucune policy UPDATE ni DELETE.
--   · les deux policies (pg_get_expr, search_path « "$user", public ») :
--       passion_requests_insert_own, FOR INSERT TO public, WITH CHECK
--         ((user_id = (( SELECT auth.uid() AS uid))::text) AND (status =
--         'pending'::text) AND (resolved_passion_id IS NULL) AND (( SELECT
--         count(*) AS count FROM passion_requests r WHERE ((r.user_id = ((
--         SELECT auth.uid() AS uid))::text) AND (r.created_at > (now() -
--         '24:00:00'::interval)))) < 5) AND (NOT suppression_de_mon_compte()))
--         — md5 b820957dd9d3a9a0fd6afa2128f1a71a ;
--       passion_requests_select_own, FOR SELECT TO public, USING
--         (user_id = (( SELECT auth.uid() AS uid))::text)
--         — md5 100a0f66aba7ecd4089717fbbdb9fefd.
--   · deux déclencheurs BEFORE INSERT, dans l'ordre de leurs noms :
--       trg_passion_request_auto → passion_request_auto_creer() (SECURITY
--         DEFINER, search_path public, md5(prosrc)
--         b6649fc280c14d20c28880edcada2604) : `creer_passion(new.label, null)`
--         (qui CRÉE la passion — une des trois créations du compte — ou rend
--         l'existante, md5 88975eea… pour la forme à trois arguments), puis
--         rattache la passion dans user_passions POUR new.user_id, et pose
--         new.status := 'approved', new.resolved_passion_id := <la passion>,
--         new.updated_at := now(). Né HORS DÉPÔT (aucune migration ne le
--         porte) ; son OID (29332) précède celui des policies réécrites le
--         2026-09-14 (30162, 30163) ;
--       zz_barriere_suppression → refuser_ecriture_compte_en_suppression('user_id').
--   · rôles : `postgres` (propriétaire de tout ce qui est en jeu) n'est PAS
--     superutilisateur mais a BYPASSRLS, membre d'anon, authenticated et
--     service_role avec SET ; search_path « "$user", public, extensions » ;
--     PostgreSQL 17.6.
--
-- LA CAUSE — prouvée au banc (PostgreSQL 16, définitions de production
-- recopiées, empreintes contrôlées). DEUX défauts empilés, et un trou :
--  ① LA RÉCURSION, depuis le 2026-09-14. La WITH CHECK de l'INSERT compte les
--     demandes de l'appelant par une sous-requête SUR passion_requests. Le
--     réécrivain (fireRIRrules, rewriteHandler.c) développe cette sous-requête
--     avec passion_requests DÉJÀ dans sa pile (activeRIRs) ; il lui applique la
--     policy SELECT de la table et, dès que CELLE-CI porte une sous-requête, il
--     lève 42P17. `migration_rls_initplan_2026-09-14.sql` (l. 251-263) a écrit
--     `auth.uid()` en `(select auth.uid())` dans les deux policies : la policy
--     SELECT a reçu sa sous-requête, et toute INSERT est morte — au PARSE, avant
--     la moindre ligne, pour tout rôle soumis à la RLS, visiteur compris. La
--     même policy SELECT avec `auth.uid()` nu (migration_passions_plat.sql,
--     l. 15790) ne la lève pas : le banc mesure les deux.
--  ② LA CONTRADICTION, latente — masquée par ①. La WITH CHECK est évaluée
--     APRÈS les déclencheurs BEFORE (ExecInsert : ExecBRInsertTriggers, puis
--     ExecWithCheckOptions) : elle voit la ligne que trg_passion_request_auto
--     vient de poser « approved » et résolue, et `status = 'pending' AND
--     resolved_passion_id IS NULL` la refuse (42501). TOUJOURS. C'est ce que
--     rendrait la correction naïve (policy SELECT rendue à `auth.uid()` nu) — le
--     banc le mesure : plus de 42P17, et pas une demande conforme ne passe —, et,
--     par déduction (NON mesuré : ni la date de naissance du déclencheur ni les
--     refus d'alors ne se lisent encore), l'état de la production entre cette
--     naissance et le 2026-09-14. Cette correction naïve ROUVRIRAIT aussi un
--     ORACLE : sur une demande au nom d'un autre compte, trg_passion_request_auto
--     écrit dans user_passions POUR LUI avant que la policy ne juge ; la barrière
--     de suppression de user_passions refuse alors en nommant « user_passions »
--     si ce compte est en cours de suppression, la policy en nommant
--     « passion_requests » sinon — un compte connecté apprenait qui supprime son
--     compte (mesuré au banc).
--  ③ LE TROU DE LA LIMITE, préexistant : `created_at` est écrit par le client
--     (droit d'INSERT de table) ; une demande antidatée sortait de la fenêtre
--     de 24 h, et la limite de 5 ne comptait plus rien (mesuré au banc,
--     déclencheur automatique coupé). Rien ne sérialisait le compte : deux
--     dépôts simultanés pouvaient lire tous deux « 4 sur 5 » (course mesurée au
--     banc sur la garde privée de son verrou, mutation M11). Et la contre-revue
--     de la version 1 a trouvé le dernier : `normalized_label`, seule colonne de
--     l'index unique avec user_id, était écrit par le client ; un dépôt en
--     conflit sous `Prefer: resolution=ignore-duplicates` (ON CONFLICT DO
--     NOTHING) n'était écarté qu'APRÈS les déclencheurs BEFORE — creer_passion
--     avait tourné, la passion était rattachée, et le quota ne bougeait jamais.
--
-- LE CHOIX — une GARDE : le déclencheur BEFORE INSERT `aa_passion_requests_garde`
-- (« aa_ » : PostgreSQL ordonne les déclencheurs par nom, celui-ci passe AVANT
-- trg_passion_request_auto, comme `zz_` fait passer la barrière en dernier), sur
-- `public.passion_requests_garde()`, SECURITY DEFINER, search_path vide, que ni
-- PUBLIC, ni anon, ni authenticated n'exécutent. Elle :
--   · REFUSE (42501, le message même d'un refus RLS) toute écriture d'un rôle
--     CLIENT sans identité (`current_setting('role')` vaut anon ou authenticated,
--     auth.uid() nul : un visiteur, ou un jeton sans compte) — la garde ne
--     dépend plus de creer_passion pour refuser le visiteur, et le refus est le
--     même quel que soit le compte visé ; l'administration (rôle « none » de la
--     migration, service_role, restauration) n'est pas jugée ;
--   · pour une session à identité, REFUSE (42501) une demande dont user_id n'est
--     pas l'appelant, dont status n'est pas 'pending', ou dont
--     resolved_passion_id n'est pas nul — le contrat de l'ancienne WITH CHECK,
--     jugé sur les valeurs du CLIENT et AVANT trg_passion_request_auto : plus
--     rien n'est écrit pour autrui, et le refus est le même pour tous ;
--   · pose `id`, `created_at`, `updated_at` et `normalized_label`
--     (`public.passion_plier(label)`) : les valeurs du SERVEUR ;
--   · sous un verrou consultatif de TRANSACTION du compte (il tombe au commit
--     comme à l'annulation, quel que soit le pool de connexions), refuse une
--     demande en DOUBLE (23505, le message de l'index unique) avant tout effet
--     de creer_passion — un ON CONFLICT DO NOTHING n'absorbe pas une exception
--     levée par un déclencheur —, puis compte les demandes de l'appelant sur
--     24 h et refuse la 6ᵉ (42501, indice « quota ») — exacte sous deux dépôts
--     simultanés (READ COMMITTED : le second compte APRÈS le premier).
-- La policy d'INSERT garde ce qui lui revient — le compte appelant, la barrière
-- de suppression — et ne lit plus sa table :
--   WITH CHECK ((user_id = (select auth.uid())::text) AND (NOT suppression_de_mon_compte()))
-- — la forme même de user_passions_insert_own. La policy SELECT ne change pas.
-- AUCUNE fonction appelable n'est ajoutée : rien ne compte pour un autre
-- compte, rien ne se demande par une RPC. trg_passion_request_auto,
-- creer_passion et la barrière ne changent pas d'un octet.
-- Effet pour le client : la demande d'un compte PASSE, et elle est RÉSOLUE dans
-- le même INSERT — trg_passion_request_auto la confie à creer_passion (qui crée
-- ou retrouve la passion, comme la RPC), puis la RATTACHE dans user_passions, ce
-- que la RPC ne fait pas. Un visiteur reçoit 42501 au lieu de 42P17 (HTTP 401
-- pour le jeton anon, correspondance mesurée en production le 2026-09-13 sur
-- user_state — js/app-02-state-utils.js) ; avec le client de ce lot, il
-- n'envoie d'ailleurs plus rien.
--
-- PRÉREQUIS CLIENT — la migration ne s'applique qu'APRÈS le client qui sait lire
-- une demande approuvée. L'ancien client insérait sans lire la réponse,
-- annonçait « en vérification », ne sélectionnait rien — et son prochain
-- enregistrement des passions (`_supaSavePassionStateMaintenant`, app-08), qui
-- réécrit profiles.passions depuis l'état LOCAL et retire de user_passions tout
-- ce qui y manque, défaisait le rattachement fait par le serveur ; ses refus
-- disaient tous « elle partira à la prochaine connexion », sans rejeu. Le client
-- de ce lot (js/passions-flat.js, js/passion-selector.js) n'envoie que pour un
-- vrai compte, lit `status, resolved_passion_id`, traite une demande approuvée
-- comme une création et nomme chaque refus. Il porte la chaîne ci-dessous ;
-- scripts/appliquer-migration.mjs refuse la production tant que la page SERVIE
-- ne la porte pas (règle ④ de scripts/lib/barriere-migration.js, qui lit le
-- bundle app.js ET la page : passions-flat.js est inliné dans la page).
-- PREREQUIS-CLIENT: passion_requests:reponse-lue
--
-- FERMÉ SUR ÉCHEC. Le tableau a deux parties. Le COMPORTEMENT (lignes 1 à 16)
-- se mesure sur un décor synthétique. Le CATALOGUE (lignes 17 à 23) dit si la
-- base est celle que ce correctif suppose : policy d'INSERT et policy SELECT,
-- présence et RANG de la garde, son corps et ses droits, les corps de
-- production de passion_request_auto_creer, de la barrière et des deux
-- creer_passion, la RLS. Une ligne de catalogue en ECHEC (hors la 23,
-- d'information) — ou, dès que le décor a MESURÉ (ligne 1 OK), une ligne de
-- comportement en ECHEC — LÈVE une exception avant `commit;` (SQLSTATE 55000,
-- les lignes en échec nommées) : RIEN n'est appliqué, ni le correctif, ni une
-- trace du décor, ni la ligne de journal de l'outil, et la production reste
-- dans son état d'avant — fermée (42P17, tout est refusé) plutôt qu'à moitié
-- ouverte. Seule une PANNE du décor (ligne 1 en ECHEC : il n'a rien mesuré) ne
-- bloque pas — la contre-revue l'a voulu ainsi : la migration passe alors sans
-- mesure de comportement, et l'on mesure au canal ① avant toute autre chose.
--
-- ALTERNATIVES ÉCARTÉES :
--   · rendre `auth.uid()` nu à la policy SELECT : guérit ① seul — ② refuse
--     toujours, l'oracle rouvre, l'avis auth_rls_initplan revient, et
--     scripts/generer-migration-initplan.mjs le recasserait au prochain passage ;
--   · une fonction SECURITY DEFINER sans paramètre qui compte les demandes de
--     l'appelant, appelée dans la WITH CHECK : guérit ① (le réécrivain ne
--     développe pas un appel de fonction) ; mais la WITH CHECK reste jugée APRÈS
--     trg_passion_request_auto — ② et l'oracle demeurent, la 6ᵉ demande fait
--     tourner creer_passion avant d'être refusée, deux dépôts simultanés passent
--     tous deux, et la fonction s'ajoute à l'API ;
--   · passer trg_passion_request_auto en AFTER INSERT : réécrit une fonction née
--     hors dépôt, ajoute une seconde écriture par demande, et RETURNING rendrait
--     « pending » pour une ligne écrite « approved » ;
--   · des droits de COLONNE pour created_at et normalized_label : rompent tout
--     client qui enverrait ces colonnes, et ne règlent ni ①, ni ②.
--
-- CE QUI N'EST PAS FERMÉ ICI, dit tel quel :
--   · le contrat « en attente, non résolue » ne vit plus dans la WITH CHECK
--     (qui ne peut pas le juger : elle voit la ligne après
--     trg_passion_request_auto) mais dans la garde ; il tient à son nom
--     (« aa_ ») et à sa présence. Le verdict les contrôle À L'APPLICATION ; rien
--     ne les contrôle ENSUITE — une vérification permanente du catalogue (veille
--     ou Sentinelle, en lecture seule) est à faire ailleurs, ou, quand
--     trg_passion_request_auto sera versionné, lui faire refuser lui-même
--     `new.user_id is distinct from auth.uid()::text` ;
--   · creer_passion (lot à part) : sa branche de création passe en `approved`
--     les demandes EN ATTENTE de TOUS les comptes du même nom, et la barrière
--     de suppression en fait un oracle (inaccessible tant qu'aucune demande ne
--     reste en attente) ; elle ignore la barrière de suppression par la RPC et
--     accepte des caractères de contrôle ; le commentaire de
--     passion_request_auto_creer annonce des quotas qui n'existent pas
--     (« 5 créations / 24 h, 30 au total » : la règle est passion_quotas, 3 par
--     défaut) ;
--   · le miroir GÉNÉRÉ `migration_passions_plat.sql` (et sa partie 7) porte
--     encore les policies du 2026-09-01 — `drop policy` puis `create policy`,
--     `auth.uid()` nu, sans barrière : rejoué EN ENTIER sur la production, il
--     rendrait à passion_requests_insert_own la WITH CHECK de ② (la garde, elle,
--     resterait : l'oracle ne rouvrirait pas, mais plus une demande ne
--     passerait), et défairait aussi l'initplan et la barrière de user_passions.
--     Les vagues du référentiel passent par un DELTA (generer-delta-passions.js)
--     qui ne touche pas aux policies ; aligner le miroir est un autre lot ;
--   · les suites e2e de la CI jouent le client du DÉPÔT : avec ce lot, le
--     visiteur n'envoie plus rien ; mais tests/e2e/app-helper.js ne détourne
--     toujours pas passion_requests — une suite qui simulerait un compte (uuid
--     factice, sans session) sans détourner la table enverrait encore une
--     demande, refusée en 42501 ;
--   · une session SANS identité sous un rôle d'administration (postgres,
--     service_role) n'est pas jugée : elle écrit ce qu'elle veut
--     (trg_passion_request_auto la refuse d'ailleurs déjà : creer_passion exige
--     un compte) ;
--   · le verrou rend la limite exacte en READ COMMITTED (PostgREST) ; une
--     session REPEATABLE READ ouverte avant un dépôt concurrent ne le verrait
--     pas — chemin d'opérateur, pas de client (aucun default_transaction_isolation
--     posé pour anon, authenticated ni authenticator, mesuré) ;
--   · trg_passion_request_auto et passion_request_auto_creer restent HORS DÉPÔT :
--     ce lot les suppose (le verdict ferme sur leur empreinte), il ne les
--     versionne pas ; une demande d'un nom NOUVEAU consomme l'une des créations
--     du compte (passion_quotas, 3 par défaut) — leur comportement, inchangé.
--
-- SURVIVANTS (canal ①, 2026-11-04) : aucune autre policy de public, storage ou
-- realtime ne lit sa propre table, et aucune ne forme de cycle de lectures par
-- sous-requête entre tables — parcours des expressions DÉPARSÉES (FROM / JOIN),
-- jusqu'à six tables ; une vue citée n'y est pas suivie. Seules les
-- sous-requêtes ÉCRITES dans une policy comptent : une fonction n'est pas
-- développée par le réécrivain. Et postgres_logs ne montre aucune autre 42P17.
--
-- ORDRE : APRÈS le client de ce lot (PREREQUIS-CLIENT ci-dessus) ; sinon
-- indépendante des autres migrations.
--
-- VERDICT : 23 lignes, chaque affirmation MESURÉE. Le comportement par des
-- INSERT sous `authenticated` puis `anon`, aux identités SIMULÉES
-- (`request.jwt.claims`, la lecture même d'`auth.uid()`), rôle et identité
-- RELEVÉS à chaque étape, avec la requête MÊME de PostgREST — sur un décor
-- SYNTHÉTIQUE (huit passions `zz-verdict-pr-…`, des comptes
-- `00000000-0000-4000-8000-0000000042xx` qu'aucun compte réel n'a, un marqueur
-- de suppression) créé dans une sous-transaction ANNULÉE : rien n'en reste
-- (aucune de ces tables n'est publiée en temps réel ; profiles l'est, mais
-- aucune de ses lignes n'est touchée), et aucun verrou consultatif ne survit.
-- Les 23 lignes sont relevées UNE fois, dans une table temporaire détruite au
-- commit : le garde-fou et le tableau lisent les mêmes. Appliquée, la
-- migration rend 23 « OK » ; si la ligne 1 dit ECHEC (le décor n'a pas pu
-- mesurer), elle est passée sans mesure de comportement : mesurer au canal ①
-- avant toute autre chose, et jouer le retour arrière au moindre doute.
--
-- APRÈS APPLICATION — mesurer au canal ①, jamais ce tableau : la WITH CHECK de
-- passion_requests_insert_own (pg_get_expr) et les déclencheurs de la table
-- (aa_passion_requests_garde en tête) ; dans postgres_logs, 0 nouvelle 42P17 ;
-- dans edge_logs, un POST /rest/v1/passion_requests sous le jeton anon rend 401
-- (plus 500) ; pour les comptes, lire le SQLSTATE dans postgres_logs (42501
-- garde ou quota, 23505 doublon, 22023 nom refusé, 53400 plafond des créations)
-- plutôt que le seul code HTTP.
--
-- CONTRE-REVUE du 2026-11-04 (trois revues indépendantes : sécurité, exactitude,
-- valeur du banc) — tout est intégré ici : le prérequis client (EXP-01) ; le
-- doublon refusé avant tout effet et normalized_label du serveur (SEC-01,
-- SEC-02) ; le catalogue fermé sur échec (SEC-04 — et, au-delà de ce qu'elle
-- demandait, le comportement MESURÉ aussi : une mesure qui dit qu'une porte
-- s'ouvre, ou que le décor laisserait une trace, n'est jamais validée) ; la garde autonome pour le
-- visiteur et l'empreinte de creer_passion (VB-03) ; au verdict, la fenêtre de
-- 24 h, le quota par compte, les rôles du décor, le verrou de transaction
-- (VB-01, VB-02, VB-04, VB-05) ; l'ancienne ligne « aucune policy ne lit sa
-- table » (une expression régulière) est retirée, le texte exact de la policy
-- la couvre (VB-06) ; le contrôle d'après application (EXP-02). Au banc, en
-- plus : la connexion restée ouverte, le rôle postgres de production, l'envoi
-- en une requête, en LF et en CRLF (VB-02, EXP-03), et les points VB-07 à VB-10.
--
-- Rejouable ; banc : tests/sql/migration-passion-requests-recursion.test.sh.
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue et
-- contrôle les empreintes). Il rend l'état exact d'avant CETTE migration : la
-- WITH CHECK de PRODUCTION de passion_requests_insert_own, recopiée de
-- pg_get_expr (noms qualifiés `public.` pour ne pas dépendre du search_path :
-- elle se déparse À L'OCTET comme celle de production, md5 b820957d…), puis la
-- garde retirée. La policy SELECT n'a pas bougé. Il rend AUSSI le défaut : 42P17.
-- Par scripts/appliquer-migration.mjs, il demande un fichier sous migrations/
-- attesté (--sans-attestation est refusé sur une cible protégée) ; dans l'éditeur
-- SQL, il se colle tel quel.
--| begin;
--| set local lock_timeout = '3s';
--| alter policy passion_requests_insert_own on public.passion_requests
--|   with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (status = 'pending'::text) AND (resolved_passion_id IS NULL) AND (( SELECT count(*) AS count
--|    FROM public.passion_requests r
--|   WHERE ((r.user_id = (( SELECT auth.uid() AS uid))::text) AND (r.created_at > (now() - '24:00:00'::interval)))) < 5) AND (NOT public.suppression_de_mon_compte())));
--| drop trigger if exists aa_passion_requests_garde on public.passion_requests;
--| drop function if exists public.passion_requests_garde();
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '3s';

-- ── ① LA GARDE : ce que le client dépose, jugé AVANT trg_passion_request_auto ──
create or replace function public.passion_requests_garde()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  moi      text := (auth.uid())::text;
  recentes integer;
begin
  -- Sans identité : un rôle CLIENT (un visiteur, ou un jeton sans compte) est
  -- refusé ICI — la garde ne dépend d'aucune autre fonction pour le visiteur, et
  -- le refus ne dit rien du compte visé. L'administration (rôle « none » d'une
  -- migration, service_role, restauration) n'est pas jugée.
  if moi is null then
    if pg_catalog.current_setting('role', true) in ('anon', 'authenticated') then
      raise exception 'new row violates row-level security policy for table "passion_requests"'
        using errcode = '42501';
    end if;
    return new;
  end if;
  -- Ce que le CLIENT dépose : une demande à SON nom, en attente, non résolue.
  -- Jugé ICI, sur SES valeurs : la policy ne voit la ligne qu'après
  -- trg_passion_request_auto, qui la pose « approved » et résolue — et qui
  -- écrit dans user_passions pour new.user_id : refusée plus tard, une demande
  -- au nom d'autrui laissait l'erreur dire si ce compte est en suppression.
  if new.user_id is distinct from moi
     or new.status is distinct from 'pending'
     or new.resolved_passion_id is not null then
    raise exception 'new row violates row-level security policy for table "passion_requests"'
      using errcode = '42501';
  end if;
  -- Ce que le serveur pose : l'identifiant, l'heure (une date fournie ne fait
  -- plus sortir la demande de la fenêtre de 24 h) et le libellé replié — la
  -- seule colonne de l'index unique avec user_id, et la seule que lisent les
  -- outils d'opérateur.
  new.id               := pg_catalog.gen_random_uuid();
  new.created_at       := pg_catalog.now();
  new.updated_at       := pg_catalog.now();
  new.normalized_label := public.passion_plier(new.label);
  -- Le verrou consultatif du compte, de TRANSACTION : il sérialise deux dépôts
  -- simultanés (le second compte APRÈS le premier — READ COMMITTED : chaque
  -- instruction prend un nouvel instantané) et tombe au commit comme à
  -- l'annulation, quelle que soit la connexion qui le portait.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('passion_requests:' || moi));
  -- Une demande en DOUBLE est refusée ici, avant trg_passion_request_auto : un
  -- ON CONFLICT DO NOTHING (Prefer: resolution=ignore-duplicates) n'écarte la
  -- ligne qu'APRÈS les déclencheurs BEFORE — creer_passion aurait tourné, la
  -- passion aurait été rattachée, et le quota n'aurait jamais compté le dépôt.
  if exists (select 1 from public.passion_requests r
              where r.user_id = moi and r.normalized_label = new.normalized_label) then
    raise exception 'duplicate key value violates unique constraint "passion_requests_unique_par_personne"'
      using errcode = '23505';
  end if;
  -- Cinq demandes par compte et par 24 h.
  select count(*) into recentes
    from public.passion_requests r
   where r.user_id = moi
     and r.created_at > pg_catalog.now() - interval '24 hours';
  if recentes >= 5 then
    raise exception 'new row violates row-level security policy for table "passion_requests"'
      using errcode = '42501', hint = 'quota : 5 demandes par compte et par 24 h';
  end if;
  return new;
end
$fn$;
-- Les droits par défaut de `public` donnent EXECUTE à anon et authenticated :
-- retirés. Un déclencheur s'exécute sans que l'écrivain tienne ce droit.
revoke all on function public.passion_requests_garde() from public, anon, authenticated;

drop trigger if exists aa_passion_requests_garde on public.passion_requests;
create trigger aa_passion_requests_garde
  before insert on public.passion_requests
  for each row execute function public.passion_requests_garde();

-- ── ② LA POLICY D'INSERT NE LIT PLUS SA TABLE : plus de récursion possible ──
alter policy passion_requests_insert_own on public.passion_requests
  with check ((user_id = ((select auth.uid()))::text) and (not public.suppression_de_mon_compte()));

-- ── ③ LE COMPORTEMENT, MESURÉ : un décor synthétique, une sous-transaction ANNULÉE ──
-- Le décor s'écrit SANS session (passions synthétiques, marqueur de
-- suppression) ; puis les rôles CLIENTS, aux identités simulées, déposent par la
-- requête même de PostgREST (relevée dans postgres_logs). Le bloc finit en
-- levant `passio_verdict_annule` : la sous-transaction est annulée — rôle,
-- réglages de session et verrous consultatifs de transaction compris — et tout
-- ce qu'elle a écrit avec elle. Seules les mesures, tenues dans des variables,
-- survivent : posées en réglage de transaction (`passio.verdict_passion_requests`),
-- elles nourrissent le tableau. Une erreur IMPRÉVUE du décor n'annule pas la
-- migration : elle s'écrit au tableau (ECHEC), et on mesure au canal ①.
do $verdict$
declare
  a     constant text := '00000000-0000-4000-8000-000000004201';   -- cinq demandes, puis une sixième
  b     constant text := '00000000-0000-4000-8000-000000004202';   -- dépose au nom d'autrui
  c     constant text := '00000000-0000-4000-8000-000000004205';   -- un second compte : quota PAR compte, doublon
  k     constant text := '00000000-0000-4000-8000-000000004206';   -- la fenêtre de 24 h
  v     constant text := '00000000-0000-4000-8000-000000004203';   -- compte visé, EN SUPPRESSION
  w     constant text := '00000000-0000-4000-8000-000000004204';   -- compte visé, ordinaire
  role0 constant text := current_user;                            -- le rôle de la migration
  sel   constant text := left(md5(clock_timestamp()::text || random()::text), 10);
  pgrst constant text := $q$WITH pgrst_source AS (INSERT INTO "public"."passion_requests"("label", "normalized_label", "status", "user_id") SELECT "pgrst_body"."label", "pgrst_body"."normalized_label", "pgrst_body"."status", "pgrst_body"."user_id" FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "label", "normalized_label", "status", "user_id" FROM json_to_record(pgrst_payload.json_data) AS _("label" text, "normalized_label" text, "status" text, "user_id" text) ) pgrst_body  RETURNING 1) SELECT '' AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, array[]::text[] AS header, ''::text AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM (SELECT * FROM pgrst_source) _postgrest_t$q$;
  lib   text[] := '{}';
  nor   text[] := '{}';
  ids   text[] := '{}';
  etats text[] := '{}';
  roles jsonb := '{}'::jsonb;
  mes   jsonb := '{}'::jsonb;
  verrous_avant bigint := (select count(*) from pg_catalog.pg_locks l
                            where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid());
  reculees bigint;
  r     record;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    for i in 1 .. 8 loop
      lib := lib || ('Zzverdict pr ' || sel || ' ' || i);
      nor := nor || public.passion_plier(lib[i]);
      ids := ids || ('zz-verdict-pr-' || sel || '-' || i);
      insert into public.passions (id, label, normalized_label, status, source)
        values (ids[i], lib[i], nor[i], 'active', 'curated');
    end loop;
    insert into public.comptes_en_suppression (user_id, statut) values (v, 'en_cours');

    -- a. A : une demande DIRECTE, antidatée, à identifiant et normalized_label
    -- choisis ; puis cinq par la requête de PostgREST (la 6ᵉ dépasse le quota).
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', a, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('a', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      execute 'insert into public.passion_requests (id, user_id, label, normalized_label, status, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $6)'
        using '00000000-0000-4000-8000-0000000042ff'::uuid, a, lib[1], '<b>choisi par le client</b>', 'pending', '2000-01-01 00:00:00+00'::timestamptz;
      etats := etats || 'ok'::text;
    exception when others then
      etats := etats || sqlstate::text;
    end;
    for i in 2 .. 6 loop
      begin
        execute pgrst into r using json_build_object('label', lib[i], 'normalized_label', nor[i], 'status', 'pending', 'user_id', a);
        etats := etats || 'ok'::text;
      exception when others then
        etats := etats || sqlstate::text;
      end;
    end loop;
    mes := mes || jsonb_build_object('a_etats', to_jsonb(etats));
    -- Ce que A lit de SES demandes (sa policy SELECT), et ses passions rattachées.
    begin
      mes := mes || jsonb_build_object('a_lignes', (
        select jsonb_build_object(
                 'n', count(*),
                 'approuvees', count(*) filter (where x.status = 'approved' and x.resolved_passion_id = any (ids)),
                 'heure_serveur', count(*) filter (where x.created_at = pg_catalog.now() and x.updated_at = pg_catalog.now()),
                 'antidatees', count(*) filter (where x.created_at < pg_catalog.now() - interval '1 day'
                                                   or x.updated_at < pg_catalog.now() - interval '1 day'),
                 'id_fourni', count(*) filter (where x.id = '00000000-0000-4000-8000-0000000042ff'::uuid),
                 'pli_serveur', count(*) filter (where x.normalized_label = public.passion_plier(x.label)))
          from public.passion_requests x),
        'a_rattachees', (select count(*) from public.user_passions u where u.user_id = a and u.passion_id = any (ids)));
    exception when others then
      mes := mes || jsonb_build_object('a_lecture', sqlstate::text);
    end;

    -- c. C, un SECOND compte : sa 1ʳᵉ demande passe — le quota est par compte.
    -- C range la passion obtenue (archived) ; la même demande, redéposée sous
    -- ON CONFLICT DO NOTHING (ignore-duplicates) avec un normalized_label de son
    -- choix, est refusée avant tout effet : trg_passion_request_auto, s'il
    -- tournait, ressortirait la passion (archived = false).
    perform set_config('request.jwt.claim.sub', c, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('c', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      execute pgrst into r using json_build_object('label', lib[8], 'normalized_label', nor[8], 'status', 'pending', 'user_id', c);
      mes := mes || jsonb_build_object('c_premiere', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('c_premiere', sqlstate::text);
    end;
    begin
      update public.user_passions u set archived = true where u.user_id = c;
      mes := mes || jsonb_build_object('c_rattachees_avant', (select count(*) from public.user_passions u where u.user_id = c and u.archived));
    exception when others then
      mes := mes || jsonb_build_object('c_rattachees_avant', sqlstate::text);
    end;
    begin
      execute 'insert into public.passion_requests (user_id, label, normalized_label, status) values ($1, $2, $3, $4) on conflict (user_id, normalized_label) do nothing'
        using c, lib[8], 'une autre forme', 'pending';
      mes := mes || jsonb_build_object('c_doublon', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('c_doublon', sqlstate::text);
    end;
    begin
      mes := mes || jsonb_build_object(
        'c_lignes', (select count(*) from public.passion_requests),
        'c_rattachees_apres', (select count(*) from public.user_passions u where u.user_id = c),
        'c_rangees_apres', (select count(*) from public.user_passions u where u.user_id = c and u.archived));
    exception when others then
      mes := mes || jsonb_build_object('c_lecture', sqlstate::text);
    end;

    -- k. K : la FENÊTRE de 24 h. Cinq demandes ; puis, sous le rôle de la
    -- migration, quatre reculées de 23 h 30 et une de 24 h 30 ; la suivante passe
    -- (quatre dans la fenêtre), la 6ᵉ de la fenêtre est refusée.
    perform set_config('request.jwt.claim.sub', k, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', k, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('k', jsonb_build_array(current_user::text, (auth.uid())::text));
    etats := '{}';
    for i in 1 .. 5 loop
      begin
        execute pgrst into r using json_build_object('label', lib[i], 'normalized_label', nor[i], 'status', 'pending', 'user_id', k);
        etats := etats || 'ok'::text;
      exception when others then
        etats := etats || sqlstate::text;
      end;
    end loop;
    perform set_config('role', role0, true);
    begin
      update public.passion_requests x
         set created_at = pg_catalog.now() - case when x.label = lib[1] then interval '24 hours 30 minutes'
                                                  else interval '23 hours 30 minutes' end
       where x.user_id = k;
      get diagnostics reculees = row_count;
      mes := mes || jsonb_build_object('k_reculees', reculees);
    exception when others then
      mes := mes || jsonb_build_object('k_reculees', sqlstate::text);
    end;
    perform set_config('role', 'authenticated', true);
    for i in 6 .. 7 loop
      begin
        execute pgrst into r using json_build_object('label', lib[i], 'normalized_label', nor[i], 'status', 'pending', 'user_id', k);
        etats := etats || 'ok'::text;
      exception when others then
        etats := etats || sqlstate::text;
      end;
    end loop;
    mes := mes || jsonb_build_object('k_etats', to_jsonb(etats));

    -- b. B : au nom d'un compte en suppression (V), d'un compte ordinaire (W) ;
    -- puis à son nom, avec un statut ou une résolution choisis.
    perform set_config('request.jwt.claim.sub', b, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('b', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      execute pgrst into r using json_build_object('label', lib[7], 'normalized_label', nor[7], 'status', 'pending', 'user_id', v);
      mes := mes || jsonb_build_object('autrui_v', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('autrui_v', sqlstate || ' ' || sqlerrm);
    end;
    begin
      execute pgrst into r using json_build_object('label', lib[7], 'normalized_label', nor[7], 'status', 'pending', 'user_id', w);
      mes := mes || jsonb_build_object('autrui_w', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('autrui_w', sqlstate || ' ' || sqlerrm);
    end;
    begin
      execute pgrst into r using json_build_object('label', lib[5], 'normalized_label', nor[5], 'status', 'approved', 'user_id', b);
      mes := mes || jsonb_build_object('statut_fourni', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('statut_fourni', sqlstate::text);
    end;
    begin
      execute 'insert into public.passion_requests (user_id, label, normalized_label, status, resolved_passion_id) values ($1, $2, $3, $4, $5)'
        using b, lib[6], nor[6], 'pending', ids[6];
      mes := mes || jsonb_build_object('resolution_fournie', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('resolution_fournie', sqlstate::text);
    end;
    begin
      mes := mes || jsonb_build_object('b_lignes', (select count(*) from public.passion_requests));
    exception when others then
      mes := mes || jsonb_build_object('b_lignes', sqlstate::text);
    end;

    -- d. Un VISITEUR (anon) : au nom du compte en suppression, puis du compte
    -- ordinaire — le refus doit être le même, message compris.
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role": "anon"}', true);
    roles := roles || jsonb_build_object('d', jsonb_build_array(current_user::text, (auth.uid())::text));
    begin
      execute pgrst into r using json_build_object('label', lib[7], 'normalized_label', nor[7], 'status', 'pending', 'user_id', v);
      mes := mes || jsonb_build_object('visiteur_v', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('visiteur_v', sqlstate || ' ' || sqlerrm);
    end;
    begin
      execute pgrst into r using json_build_object('label', lib[7], 'normalized_label', nor[7], 'status', 'pending', 'user_id', w);
      mes := mes || jsonb_build_object('visiteur_w', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('visiteur_w', sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform count(*) from public.passion_requests;
      mes := mes || jsonb_build_object('lecture_visiteur', 'ok');
    exception when others then
      mes := mes || jsonb_build_object('lecture_visiteur', sqlstate::text);
    end;
    -- Le rôle et l'identité de la migration, rendus AVANT l'annulation (qui les
    -- rendrait aussi) : si elle venait à manquer, la suite ne tournerait pas
    -- sous un rôle client.
    perform set_config('role', role0, true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';
  exception when others then
    if sqlerrm is distinct from 'passio_verdict_annule' then
      mes := mes || jsonb_build_object('erreur', left(sqlstate || ' ' || sqlerrm, 160));
    end if;
  end;
  mes := mes || jsonb_build_object('roles', roles);
  -- Après l'annulation (rôle de la migration rendu) : rien ne doit rester du
  -- décor, et aucun verrou consultatif de cette session ne doit lui survivre.
  mes := mes || jsonb_build_object('restes',
      (select count(*) from public.passion_requests x where x.user_id in (a, b, c, k, v, w))
    + (select count(*) from public.user_passions u where u.user_id in (a, b, c, k, v, w))
    + (select count(*) from public.passions p where p.id like 'zz-verdict-pr-' || sel || '-%')
    + (select count(*) from public.comptes_en_suppression s where s.user_id = v));
  mes := mes || jsonb_build_object('verrous', jsonb_build_array(verrous_avant,
    (select count(*) from pg_catalog.pg_locks l where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid())));
  perform set_config('passio.verdict_passion_requests', mes::text, true);
end
$verdict$;

-- ── ④ LE TABLEAU, relevé UNE fois : 23 lignes dans une table temporaire détruite
-- au commit, lues par le garde-fou ⑤ et par le verdict. Les lignes 1 à 16 lisent
-- les mesures du bloc ③ (hors de cette transaction : « mesure absente », aucun
-- OK sans mesure) ; les lignes 17 à 23, le catalogue. `bloquant` :
--   « oui »       — le catalogue que ce correctif suppose (17 à 22) ;
--   « si_mesure » — le comportement (2 à 16), dès que le décor a MESURÉ (ligne 1 OK) ;
--   « non »       — la mesure elle-même (1 : une panne du décor ne bloque pas) et
--                   l'information (23).
create temp table passio_pr_verdict on commit drop as
with v as (select coalesce(nullif(current_setting('passio.verdict_passion_requests', true), ''), '{}')::jsonb as j)
select 1 as n, 'non'::text as bloquant, 'mesure exécutée : quatre comptes synthétiques sous authenticated (A, C, K, B), puis un visiteur sous anon — rôle et identité relevés à chaque étape —, sous-transaction ANNULÉE'::text as controle,
       (select case when j ? 'erreur' then 'ECHEC — ' || (j->>'erreur')
                    when j ? 'a_etats' and j ? 'a_lignes' and j ? 'c_doublon' and j ? 'k_etats' and j ? 'visiteur_w' and j ? 'restes'
                         and j->'roles'->'a' = '["authenticated", "00000000-0000-4000-8000-000000004201"]'::jsonb
                         and j->'roles'->'c' = '["authenticated", "00000000-0000-4000-8000-000000004205"]'::jsonb
                         and j->'roles'->'k' = '["authenticated", "00000000-0000-4000-8000-000000004206"]'::jsonb
                         and j->'roles'->'b' = '["authenticated", "00000000-0000-4000-8000-000000004202"]'::jsonb
                         and j->'roles'->'d' = '["anon", null]'::jsonb then 'OK'
                    else 'ECHEC — mesure absente, ou décor sous un autre rôle' end from v) as valeur
union all select 2, 'si_mesure', 'aucune 42P17 (récursion de policy) : ni la requête de PostgREST, ni une INSERT directe, ni une lecture — sous authenticated comme sous anon',
       (select case when j ? 'a_etats' and j ? 'visiteur_w' and position('42P17' in j::text) = 0 then 'OK' else 'ECHEC' end from v)
union all select 3, 'si_mesure', 'une INSERT CONFORME passe : les cinq premières demandes de A (la 1ʳᵉ directe, les quatre suivantes par la requête même de PostgREST) sont acceptées',
       (select case when (select jsonb_agg(e.x order by e.n) from jsonb_array_elements(j->'a_etats') with ordinality as e(x, n) where e.n <= 5)
                         = '["ok", "ok", "ok", "ok", "ok"]'::jsonb then 'OK' else 'ECHEC' end from v)
union all select 4, 'si_mesure', '…et écrites : A a exactement CINQ demandes, chacune résolue par trg_passion_request_auto (approved, resolved_passion_id) et sa passion rattachée (user_passions)',
       (select case when j->'a_lignes'->>'n' = '5' and j->'a_lignes'->>'approuvees' = '5' and j->>'a_rattachees' = '5' then 'OK' else 'ECHEC' end from v)
union all select 5, 'si_mesure', 'la 6ᵉ demande de A en 24 h est REFUSÉE (42501) — après cinq acceptées, la 1ʳᵉ eût-elle été antidatée',
       (select case when j->'a_etats' = '["ok", "ok", "ok", "ok", "ok", "42501"]'::jsonb then 'OK' else 'ECHEC' end from v)
union all select 6, 'si_mesure', 'le quota est PAR COMPTE : A au plafond (sa 6ᵉ refusée), la 1ʳᵉ demande d''un autre compte (C) passe',
       (select case when j->'a_etats'->>5 = '42501' and j->>'c_premiere' = 'ok' then 'OK' else 'ECHEC' end from v)
union all select 7, 'si_mesure', 'la fenêtre est de 24 h : quatre demandes de K reculées de 23 h 30 comptent, une reculée de 24 h 30 ne compte plus — la suivante passe, la 6ᵉ de la fenêtre est refusée',
       (select case when j->>'k_reculees' = '5'
                         and j->'k_etats' = '["ok", "ok", "ok", "ok", "ok", "ok", "42501"]'::jsonb then 'OK' else 'ECHEC' end from v)
union all select 8, 'si_mesure', 'un dépôt EN DOUBLE, même sous ON CONFLICT DO NOTHING (Prefer: resolution=ignore-duplicates) et avec un normalized_label de son choix, est REFUSÉ (23505) avant tout effet : ni ligne, ni passion ressortie (C l''avait rangée)',
       (select case when j->>'c_doublon' = '23505' and j->>'c_lignes' = '1' and j->>'c_rattachees_avant' = '1'
                         and j->>'c_rattachees_apres' = '1' and j->>'c_rangees_apres' = '1' then 'OK' else 'ECHEC' end from v)
union all select 9, 'si_mesure', 'normalized_label est celui du SERVEUR (passion_plier du libellé) : celui que le client fournit est remplacé',
       (select case when (j->'a_lignes'->>'n')::int > 0 and j->'a_lignes'->>'pli_serveur' = j->'a_lignes'->>'n' then 'OK' else 'ECHEC' end from v)
union all select 10, 'si_mesure', 'l''identifiant et l''heure sont ceux du SERVEUR : la date antidatée (2000-01-01) et l''identifiant fournis sont remplacés',
       (select case when j->'a_etats'->>0 = 'ok' and (j->'a_lignes'->>'n')::int > 0
                         and j->'a_lignes'->>'heure_serveur' = j->'a_lignes'->>'n'
                         and j->'a_lignes'->>'antidatees' = '0' and j->'a_lignes'->>'id_fourni' = '0' then 'OK' else 'ECHEC' end from v)
union all select 11, 'si_mesure', 'une demande au nom d''un AUTRE compte est REFUSÉE (42501)',
       (select case when j->>'autrui_v' like '42501 %' and j->>'autrui_w' like '42501 %' then 'OK' else 'ECHEC' end from v)
union all select 12, 'si_mesure', 'aucun oracle : ce refus est IDENTIQUE (code et message) que le compte visé soit en cours de suppression ou non',
       (select case when j->>'autrui_v' like '42501 %' and j->>'autrui_v' = j->>'autrui_w' then 'OK' else 'ECHEC' end from v)
union all select 13, 'si_mesure', 'le client ne choisit ni le statut ni la résolution : « approved » ou un resolved_passion_id fournis sont REFUSÉS (42501), rien n''est écrit',
       (select case when j->>'statut_fourni' = '42501' and j->>'resolution_fournie' = '42501' and j->>'b_lignes' = '0' then 'OK' else 'ECHEC' end from v)
union all select 14, 'si_mesure', 'un VISITEUR (anon) est refusé PAR LA GARDE (42501), au même mot que le compte visé soit en suppression ou non ; sa lecture ne lève rien',
       (select case when j->>'visiteur_v' = '42501 new row violates row-level security policy for table "passion_requests"'
                         and j->>'visiteur_w' = j->>'visiteur_v' and j->>'lecture_visiteur' = 'ok' then 'OK' else 'ECHEC' end from v)
union all select 15, 'si_mesure', 'le verrou du compte est de TRANSACTION : aucun verrou consultatif de cette session ne survit au décor (pg_locks, avant = après)',
       (select case when jsonb_array_length(j->'verrous') = 2 and j->'verrous'->0 = j->'verrous'->1 then 'OK' else 'ECHEC' end from v)
union all select 16, 'si_mesure', 'aucune trace du décor : demandes, passions rattachées, passions synthétiques, marqueur de suppression (sous-transaction annulée)',
       (select case when j->>'restes' = '0' then 'OK' else 'ECHEC' end from v)
union all select 17, 'oui', 'passion_requests_insert_own : FOR INSERT TO public, WITH CHECK = le compte appelant ET la barrière de suppression (la forme de user_passions_insert_own) — elle ne lit plus sa table',
       case when exists (select 1 from pg_catalog.pg_policy p
                          where p.polrelid = 'public.passion_requests'::regclass and p.polname = 'passion_requests_insert_own'
                            and p.polcmd = 'a' and p.polpermissive and p.polroles = '{0}'::oid[] and p.polqual is null
                            and regexp_replace(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\mpublic\.', '', 'g')
                                = '((user_id = (( SELECT auth.uid() AS uid))::text) AND (NOT suppression_de_mon_compte()))') then 'OK' else 'ECHEC' end
union all select 18, 'oui', 'passion_requests_select_own : INCHANGÉE (FOR SELECT TO public, empreinte de production), et la table ne porte que ces deux policies',
       case when exists (select 1 from pg_catalog.pg_policy p
                          where p.polrelid = 'public.passion_requests'::regclass and p.polname = 'passion_requests_select_own'
                            and p.polcmd = 'r' and p.polpermissive and p.polroles = '{0}'::oid[] and p.polwithcheck is null
                            and md5(regexp_replace(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\mpublic\.', '', 'g')) = '100a0f66aba7ecd4089717fbbdb9fefd')
             and (select count(*) from pg_catalog.pg_policy p where p.polrelid = 'public.passion_requests'::regclass) = 2 then 'OK' else 'ECHEC' end
union all select 19, 'oui', 'aa_passion_requests_garde : BEFORE INSERT, par ligne, actif, sans WHEN ni argument — le PREMIER des déclencheurs BEFORE INSERT de la table',
       case when exists (select 1 from pg_catalog.pg_trigger t
                          where t.tgrelid = 'public.passion_requests'::regclass and t.tgname = 'aa_passion_requests_garde'
                            and not t.tgisinternal and t.tgfoid = to_regprocedure('public.passion_requests_garde()')
                            and t.tgenabled in ('O', 'A') and t.tgqual is null and t.tgnargs = 0 and t.tgtype = 7)
             and (select t.tgname from pg_catalog.pg_trigger t
                   where t.tgrelid = 'public.passion_requests'::regclass and not t.tgisinternal
                     and (t.tgtype & 7) = 7 and (t.tgtype & 64) = 0 and t.tgenabled in ('O', 'A')
                   order by t.tgname collate "C" limit 1) = 'aa_passion_requests_garde' then 'OK' else 'ECHEC' end
union all select 20, 'oui', 'passion_requests_garde() : SECURITY DEFINER, search_path vide, corps de cette migration à l''octet (md5, fins de ligne normalisées) ; ni PUBLIC, ni anon, ni authenticated ne l''exécutent',
       case when exists (select 1 from pg_catalog.pg_proc p
                          where p.oid = to_regprocedure('public.passion_requests_garde()')
                            and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""'
                            and p.prorettype = 'trigger'::regtype
                            and p.prolang = (select l.oid from pg_catalog.pg_language l where l.lanname = 'plpgsql')
                            and md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) = '6a382282a795bbb99884ebab61c3d306'
                            and p.proacl is not null
                            and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
                            and not has_function_privilege('anon', p.oid, 'EXECUTE')
                            and not has_function_privilege('authenticated', p.oid, 'EXECUTE')) then 'OK' else 'ECHEC' end
union all select 21, 'oui', 'ce que le correctif suppose, À L''OCTET : trg_passion_request_auto et zz_barriere_suppression actifs, les corps de production de passion_request_auto_creer, de la barrière et des deux creer_passion',
       case when exists (select 1 from pg_catalog.pg_trigger t
                          where t.tgrelid = 'public.passion_requests'::regclass and t.tgname = 'trg_passion_request_auto'
                            and not t.tgisinternal and t.tgenabled in ('O', 'A') and t.tgtype = 7 and t.tgqual is null
                            and t.tgfoid = to_regprocedure('public.passion_request_auto_creer()'))
             and exists (select 1 from pg_catalog.pg_trigger t
                          where t.tgrelid = 'public.passion_requests'::regclass and t.tgname = 'zz_barriere_suppression'
                            and not t.tgisinternal and t.tgenabled in ('O', 'A') and t.tgtype = 23 and t.tgqual is null
                            and t.tgnargs = 1 and position('user_id' in encode(t.tgargs, 'escape')) = 1
                            and t.tgfoid = to_regprocedure('public.refuser_ecriture_compte_en_suppression()'))
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.passion_request_auto_creer()')) = 'b6649fc280c14d20c28880edcada2604'
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.refuser_ecriture_compte_en_suppression()')) = '8ea40f715280c2867524dab576ab32b8'
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.creer_passion(text,text,text[])')) = '88975eeaf66297bdfd51b7d4cf14fc49'
             and (select md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) from pg_catalog.pg_proc p
                   where p.oid = to_regprocedure('public.creer_passion(text,text)')) = 'a6882163774c79b1121277f48cac9980'
            then 'OK' else 'ECHEC' end
union all select 22, 'oui', 'passion_requests : RLS active',
       case when (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.passion_requests'::regclass) then 'OK' else 'ECHEC' end
union all select 23, 'non', 'information — droits de passion_requests inchangés : anon et authenticated SELECT, INSERT, UPDATE, DELETE de table, aucun droit de colonne',
       case when (select string_agg(pg_catalog.pg_get_userbyid(a.grantee) || ':' || a.privilege_type, ','
                                     order by pg_catalog.pg_get_userbyid(a.grantee), a.privilege_type)
                    from pg_catalog.pg_class c cross join lateral aclexplode(c.relacl) a
                   where c.oid = 'public.passion_requests'::regclass
                     and pg_catalog.pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
                 = 'anon:DELETE,anon:INSERT,anon:SELECT,anon:UPDATE,authenticated:DELETE,authenticated:INSERT,authenticated:SELECT,authenticated:UPDATE'
             and not exists (select 1 from pg_catalog.pg_attribute at where at.attrelid = 'public.passion_requests'::regclass and at.attacl is not null)
            then 'OK' else 'ECHEC' end;

-- ── ⑤ FERMÉ SUR ÉCHEC : une ligne bloquante en ECHEC annule TOUT ──
-- Rien n'est alors appliqué — ni le correctif, ni une trace du décor, ni la
-- ligne de journal de l'outil d'application (même transaction) — et la base
-- reste dans son état d'avant.
do $$
declare
  numeros text;
  details text;
begin
  select string_agg(c.n::text, ',' order by c.n), string_agg(c.n || '. ' || c.controle, ' ; ' order by c.n)
    into numeros, details
    from pg_temp.passio_pr_verdict c
   where c.valeur is distinct from 'OK'
     and (c.bloquant = 'oui'
          or (c.bloquant = 'si_mesure'
              and (select m.valeur from pg_temp.passio_pr_verdict m where m.n = 1) = 'OK'));
  if numeros is not null then
    raise exception 'passion_requests : la base n''est pas celle que ce correctif suppose, ou il ne s''y comporte pas comme il le doit — RIEN n''est appliqué. Lignes en échec : %', numeros
      using errcode = 'object_not_in_prerequisite_state', detail = details;
  end if;
end $$;

-- ── Verdict ──
select controle, valeur from pg_temp.passio_pr_verdict order by n;

commit;
