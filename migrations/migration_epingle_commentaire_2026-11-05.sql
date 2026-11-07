-- ═══════════════════════════════════════════════════════════════════════════
-- RV-38 (registre de l'audit du 2026-11-02, trouvé pendant le lot R37, 05/11) :
-- ÉPINGLER UN COMMENTAIRE ATTEINT ENFIN LA BASE — ET SEUL LE PROPRIÉTAIRE DU FIL
-- Y ÉPINGLE.
--
-- Une transaction, REJOUABLE, FERMÉE SUR ÉCHEC : tableau de verdict de 22 lignes
-- (21 contrôles OK/ECHEC, une information). Une seule ligne de contrôle en ECHEC
-- lève une exception avant `commit;` (SQLSTATE 55000) : RIEN n'est appliqué.
-- Rien de personnel dans ce fichier ni dans son verdict : des nombres, des codes
-- d'erreur, des définitions.
--
-- LE DÉFAUT. `togglePinComment` (js/app-04-comments-shop.js) écrit l'épingle dans
-- `comment_interactions` (`kind = 'pin'`, charge « 1 » / « 0 »). La contrainte de
-- production `ci_kind_check` n'admet que like, reply, emoji et gif : TOUTE
-- épingle est refusée (23514). Jusqu'au client de RV-38 (#727), le refus était
-- avalé et l'écran disait « Commentaire épinglé » : l'épingle restait locale à
-- l'appareil du propriétaire du fil. Depuis, le client dit « L'épingle n'est pas
-- encore disponible » — c'est cette migration qui la rend disponible.
--
-- MESURÉ EN PRODUCTION au canal ① (execute_sql et query_logs, lecture seule :
-- catalogue, agrégats et journaux, aucune ligne d'utilisateur) :
--   · 05/11 — ci_kind_check : CHECK ((kind = ANY (ARRAY['like'::text,
--     'reply'::text, 'emoji'::text, 'gif'::text]))) ; ci_payload_len_check
--     (≤ 500) et ci_ids_len_check (≤ 120) ; clé primaire `id` ; 339
--     interactions (188 like, 77 reply, 72 emoji, 2 gif, 0 pin), toutes avec
--     leur fil (`post_id`) ;
--   · policies de comment_interactions (pg_policy, md5 de pg_get_expr) :
--       ci_insert, INSERT, WITH CHECK ((user_id = (( SELECT auth.uid() AS
--         uid))::text) AND (NOT suppression_de_mon_compte())) — 72198d79… ;
--         ni le FIL ni son PROPRIÉTAIRE n'y sont ;
--       ci_delete, DELETE, USING (user_id = auth.uid()) — 100a0f66… ;
--       « Lecture selon visibilite de la cible », SELECT, USING (user_id =
--         auth.uid()) OR comment_target_visible(comment_id, post_id) — 4fc9fe8f… ;
--     aucune policy UPDATE : un UPDATE client touche 0 ligne ;
--   · déclencheurs BEFORE INSERT : trg_rate_limit → rate_limit_insert('user_id',
--     '60'), zz_barriere_suppression ; table publiée (supabase_realtime),
--     identité DEFAULT ;
--   · 06/11 — 0 identifiant commun à posts et events, 0 commun à post_comments
--     et event_comments (les deux formats de publication et d'activité sont
--     pourtant les mêmes : un homonyme ne peut venir que d'un geste délibéré) ;
--     0 activité dont `organizer_id` est vide ou diffère de `author_id` ;
--     toujours 0 épingle ;
--   · les corps et policies des quatre tables du décor (posts, post_comments,
--     events, event_comments) — purges R31, `identifiants_figes`,
--     `events_admission_gardee` — sont ceux que rejoue le banc, md5 à l'appui ;
--   · PostgreSQL 17.6 ; `postgres` est membre d'anon, authenticated et
--     service_role avec SET (le verdict en dépend).
--
-- MODÈLE DE MENACE : un compte quelconque qui parle à PostgREST en direct avec la
-- clé publique. Il CHOISIT les identifiants de ce qu'il crée : une publication
-- peut porter l'identifiant d'une activité d'autrui (et l'inverse), un
-- commentaire celui d'un commentaire de l'autre table, et un commentaire de
-- publication peut être RENOMMÉ (`identifiants_figes` fige son fil et son auteur,
-- pas son `id`). Ce qu'une garde juge à l'écriture, un identifiant réutilisé
-- PLUS TARD peut le faire désigner autre chose.
--
-- CE QUI CHANGE (et rien d'autre) :
--  ① `ci_kind_check` admet `pin`. Les quatre autres genres sont inchangés.
--  ② `ci_pin_payload_check` : la charge d'une épingle est « 0 » ou « 1 », jamais
--     absente. Une contrainte : elle vaut pour tous les chemins, administration
--     comprise.
--  ③ La GARDE `trg_ci_epingle_garde` : BEFORE INSERT OR UPDATE, par ligne,
--     `WHEN (new.kind = 'pin')` (les autres genres ne la déclenchent pas), sur
--     `public.ci_epingle_garde()`, SECURITY DEFINER, search_path vide, que ni
--     PUBLIC, ni anon, ni authenticated n'exécutent. Pour un rôle CLIENT, une
--     épingle n'est admise que si :
--       · l'appelant a une identité, épingle à SON nom (`user_id`), dans un fil
--         annoncé (`post_id`), avec la charge « 0 » ou « 1 » — la garde juge la
--         charge AVANT la contrainte : une charge invalide est un refus comme
--         les autres, pas un 23514 qui dirait que la garde a admis le reste ;
--       · le GENRE du fil se lit dans `post_id` : une publication (`posts`) ou
--         une activité (`events`). Son PROPRIÉTAIRE : l'auteur de la publication
--         (`posts.author_id`, figé par trg_posts_freeze_author), ou
--         l'organisateur de l'activité (`coalesce(nullif(organizer_id, ''),
--         author_id)` — la définition même du client : `organizer_id ||
--         author_id`, app-08) ;
--       · le commentaire appartient à CE fil, dans la table de CE genre
--         (post_comments.post_id, event_comments.event_id) — un homonyme dans
--         l'autre table n'y change rien ;
--       · l'appelant est ce propriétaire ;
--       · un « 1 » exige un fil SANS homonyme : un identifiant présent à la fois
--         dans posts ET dans events n'a pas de propriétaire sûr, aucun « 1 » n'y
--         passe. Un « 0 », lui, passe pour le propriétaire du fil où se trouve le
--         commentaire, homonyme ou non : il n'affiche rien, et un homonyme créé
--         APRÈS une épingle ne doit pas la verrouiller.
--     Sinon : UN SEUL refus, au mot près — 42501, le message d'un refus RLS, un
--     indice qui nomme l'épingle — quelle que soit la raison. L'administration
--     (rôle « none » d'une migration, service_role, restauration, purge) n'est
--     pas jugée : elle reprend des lignes déjà jugées à leur écriture (le
--     mécanisme de passion_requests_garde, RV-36).
--
-- POURQUOI UNE GARDE, ET NI LA POLICY NI LA SEULE CONTRAINTE :
--   · ① seul ouvrirait l'épingle à TOUS : la WITH CHECK de ci_insert ne connaît
--     ni le fil ni son propriétaire — n'importe quel compte épinglerait le
--     commentaire de son choix chez n'importe qui (le banc le rejoue) ;
--   · une WITH CHECK qui appellerait une fonction SECURITY DEFINER exposerait
--     cette fonction à `/rest/v1/rpc` et ne couvrirait pas un UPDATE futur ; la
--     garde n'est exécutable par aucun rôle client, couvre INSERT et UPDATE, et
--     ne coûte rien aux autres genres (WHEN).
--
-- POURQUOI LE GENRE PAR `post_id`, ET UN « 1 » REFUSÉ DANS UN FIL HOMONYME (red
-- team du 06/11, P2) : une première version lisait le fil dans la table du
-- COMMENTAIRE. Un compte publiait alors sous l'identifiant de l'activité d'autrui,
-- y commentait, épinglait — la garde l'admettait, propriétaire de « sa »
-- publication — et tout client qui résolvait le propriétaire par l'identifiant
-- (publications d'abord) affichait son épingle sur l'activité. Dans un fil
-- homonyme, AUCUN « 1 » ; le client (#727, `_filAmbigu`) n'y lit, n'y reçoit ni
-- n'y propose aucune épingle. Prix assumé : quiconque reprend l'identifiant
-- d'une publication ou d'une activité pour créer l'autre genre empêche d'y
-- épingler (il faut le faire exprès ; les épingles déjà posées s'y retirent).
--
-- ⚠️ L'ANCIEN LECTEUR — PRÉREQUIS CLIENT. Le client d'avant #727 applique une
-- ligne « pin » par son seul `comment_id`, de qui qu'elle soit, dans n'importe
-- quel fil. Aucune garde n'y peut rien : elle juge l'écriture, pas ce qu'un
-- identifiant désignera plus tard — une épingle posée dans son propre fil, puis
-- un commentaire du même identifiant écrit (ou renommé) dans le fil d'autrui,
-- et l'ancien lecteur affiche l'épingle chez autrui (red team du 06/11, P1).
-- Le client de #727 lit l'épingle par FIL et par PROPRIÉTAIRE : ces lignes ne
-- s'y affichent nulle part ailleurs que dans leur fil. Il porte la chaîne
-- ci-dessous (`EPINGLE_DU_FIL`, js/app-04-comments-shop.js) ;
-- scripts/appliquer-migration.mjs refuse la production tant que le client SERVI
-- ne la porte pas (règle ④ de scripts/lib/barriere-migration.js). Il reste les
-- sessions d'avant le déploiement, le temps qu'elles se rechargent : le client
-- vérifie sa version toutes les 60 s quand il est visible et se recharge seul
-- (js/pwa-detect.js).
-- PREREQUIS-CLIENT: comment_interactions:epingle-du-fil
--
-- CE QUI N'EST PAS FERMÉ ICI, dit tel quel :
--   · « un seul épinglé par fil » n'est pas un invariant du serveur : le client
--     écrit « 0 » pour l'épinglé qu'il connaît ; deux appareils du propriétaire
--     peuvent en poser deux. Le lecteur du client garde le plus récent ;
--   · l'épingle est un JOURNAL (« 1 » / « 0 », une ligne par geste), borné par
--     trg_rate_limit (60 par minute et par compte), effacé avec son commentaire
--     de publication ou sa publication (R31 : trg_purger_cibles_*, sauf
--     homonyme) ; les lignes d'un commentaire d'ACTIVITÉ supprimé restent
--     (comme ses autres interactions, R31) — le lecteur, borné au fil, n'en
--     montre rien ;
--   · les identifiants homonymes entre tables sœurs (publication/activité,
--     commentaire de l'une/de l'autre) restent possibles : leur effet sur les
--     autres genres d'interaction et sur la discussion d'une activité est une
--     ligne du registre (RV-45), hors de ce correctif ;
--   · un co-organisateur peut réécrire `organizer_id` (préexistant, registre) :
--     il devient alors le propriétaire du fil, pour la garde comme pour le
--     client ; les épingles de l'ancien organisateur ne s'affichent plus.
--
-- ORDRE : APRÈS le client de #727 (PREREQUIS-CLIENT ci-dessus) ; sinon
-- indépendante. Elle ne touche ni l'identité de réplication (R25), ni les
-- policies, ni la publication : une contrainte et un déclencheur ne changent pas
-- la forme des lignes décodées.
--
-- VERDICT : chaque affirmation est MESURÉE. Le comportement par un décor
-- SYNTHÉTIQUE (comptes `00000000-0000-4000-8000-0000000038xx`, identifiants
-- `zz_rv38_…` : ni format réel, ni exemple), écrit SANS session ; chaque essai
-- d'épingle part sous son rôle (authenticated à identité simulée, anon, ou
-- l'administration), et les lectures aussi. Le bloc finit en levant
-- `passio_verdict_annule` : tout ce qu'il a écrit disparaît (une sous-transaction
-- annulée n'est jamais décodée par le temps réel). Les définitions et les droits
-- par le catalogue.
--
-- Rejouable ; banc : tests/sql/migration-epingle-commentaire.test.sh.
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue). Il
-- rend l'état exact d'avant CETTE migration : ci_kind_check à quatre genres,
-- sans ci_pin_payload_check, sans garde. ⚠️ Il EFFACE les épingles écrites
-- depuis : la contrainte d'avant ne les admet pas. Les spectateurs reçoivent ces
-- retraits en direct, et le client relit l'épingle du fil affiché
-- (`_epingleRetiree`) ; le propriétaire lit de nouveau « pas encore
-- disponible ». Il se joue à l'éditeur SQL (canal ③), puis se MESURE au canal ① :
-- `select pg_get_constraintdef(oid) from pg_constraint where conname =
-- 'ci_kind_check'` rend les quatre genres, et `trg_ci_epingle_garde` n'existe plus.
--| begin;
--| set local lock_timeout = '5s';
--| drop trigger if exists trg_ci_epingle_garde on public.comment_interactions;
--| drop function if exists public.ci_epingle_garde();
--| -- Les épingles écrites depuis l'application : la contrainte d'avant ne les admet pas.
--| delete from public.comment_interactions where kind = 'pin';
--| alter table public.comment_interactions
--|   drop constraint if exists ci_pin_payload_check,
--|   drop constraint if exists ci_kind_check,
--|   add constraint ci_kind_check check (kind = any (array['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text]));
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- Un verrou qui ne vient pas en 5 s fait ÉCHOUER la migration (rien n'est
-- appliqué, elle se relance) au lieu de mettre en file, derrière elle, toutes
-- les écritures de `comment_interactions`.
set local lock_timeout = '5s';

-- ── ① et ② LES CONTRAINTES : `pin` admis, sa charge bornée à « 0 » / « 1 » ──
-- Une instruction, un verrou ; la validation relit les lignes (instantané).
alter table public.comment_interactions
  drop constraint if exists ci_kind_check,
  add constraint ci_kind_check check (kind = any (array['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text, 'pin'::text])),
  drop constraint if exists ci_pin_payload_check,
  add constraint ci_pin_payload_check check (kind <> 'pin'::text or (payload is not null and payload = any (array['0'::text, '1'::text])));

-- ── ③ LA GARDE : seul le propriétaire du fil épingle, un commentaire de ce fil ──
create or replace function public.ci_epingle_garde()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  moi              text := (auth.uid())::text;
  publication      boolean;
  activite         boolean;
  proprio_pub      text;
  proprio_activite text;
begin
  -- L'administration n'est pas jugée : le rôle « none » d'une migration,
  -- service_role, une restauration ou une purge reprennent des lignes déjà
  -- jugées à leur écriture. Seuls les rôles CLIENTS le sont.
  if coalesce(pg_catalog.current_setting('role', true), 'none') not in ('anon', 'authenticated') then
    return new;
  end if;
  if moi is not null
     and new.user_id is not distinct from moi
     and new.post_id is not null
     and new.payload is not null and new.payload in ('0', '1') then
    -- Le GENRE du fil se lit dans post_id ; le commentaire doit être de CE fil,
    -- dans la table de CE genre. Un identifiant présent dans les DEUX tables de
    -- fils est un fil HOMONYME.
    publication := exists (select 1 from public.posts p where p.id = new.post_id);
    activite := exists (select 1 from public.events e where e.id = new.post_id);
    if publication then
      select p.author_id into proprio_pub from public.posts p
       where p.id = new.post_id
         and exists (select 1 from public.post_comments c
                      where c.id = new.comment_id and c.post_id = new.post_id);
    end if;
    if activite then
      select coalesce(nullif(e.organizer_id, ''), e.author_id) into proprio_activite from public.events e
       where e.id = new.post_id
         and exists (select 1 from public.event_comments ec
                      where ec.id = new.comment_id and ec.event_id = new.post_id);
    end if;
    -- Le propriétaire de CE fil, sur un commentaire de CE fil ; un « 1 » hors
    -- d'un fil homonyme. Un « 0 » n'affiche rien : il passe, homonyme ou non.
    if (proprio_pub is not distinct from moi or proprio_activite is not distinct from moi)
       and (new.payload = '0' or not (publication and activite)) then
      return new;
    end if;
  end if;
  -- UN SEUL REFUS, au mot près, quelle que soit la raison — sans identité, au nom
  -- d'autrui, sans fil, charge invalide, commentaire d'un autre fil ou inconnu,
  -- fil homonyme, appelant qui n'en est pas le propriétaire.
  raise exception 'new row violates row-level security policy for table "comment_interactions"'
    using errcode = '42501',
          hint = 'épingle : réservée au propriétaire du fil, sur un commentaire de ce fil';
end
$fn$;
comment on function public.ci_epingle_garde() is
  'RV-38 (2026-11-05, révisée le 06/11) : déclencheur BEFORE INSERT OR UPDATE de comment_interactions, WHEN kind = pin — seul le propriétaire du fil (auteur de la publication, organisateur de l''activité) épingle un commentaire de ce fil ; genre du fil lu dans post_id ; aucun « 1 » dans un fil homonyme ; charge « 0 »/« 1 » ; un refus unique (42501). L''administration n''est pas jugée.';
-- Les droits par défaut de `public` donnent EXECUTE à anon et authenticated :
-- retirés. Un déclencheur s'exécute sans que l'écrivain tienne ce droit.
revoke all on function public.ci_epingle_garde() from public, anon, authenticated;

create or replace trigger trg_ci_epingle_garde
  before insert or update on public.comment_interactions
  for each row
  when (new.kind = 'pin')
  execute function public.ci_epingle_garde();

-- ── ④ LE COMPORTEMENT, MESURÉ : un décor synthétique, une sous-transaction ANNULÉE ──
-- Décor (sans session) : M publie P (publique) et H1, organise E et H2, écrit E3
-- (organisée par K) et E4 (organisateur vide) ; V commente ; M2, compte PRIVÉ,
-- publie Q et la commente. N, sans lien, organise EN et crée les HOMONYMES : une
-- activité sous l'identifiant de H1 (il y commente HD), une publication sous
-- celui de H2 (il y commente W — le scénario de la red team), et dans EN un
-- commentaire sous l'identifiant de C2. Puis chaque essai part sous SON rôle et
-- SON identité (`request.jwt.claim.sub` et `request.jwt.claims`, la lecture
-- même d'`auth.uid()`), rôle et identité relevés à chaque fois. Seules les
-- mesures, tenues dans des variables, survivent à l'annulation (réglage de
-- transaction `passio.verdict_rv38`).
do $verdict$
declare
  sfx   constant text := left(md5(clock_timestamp()::text || random()::text), 10);
  m     constant text := '00000000-0000-4000-8000-000000003801';   -- M : publie P et H1, organise E et H2
  v     constant text := '00000000-0000-4000-8000-000000003802';   -- V : commente
  n     constant text := '00000000-0000-4000-8000-000000003803';   -- N : aucun lien ; organise EN, crée les homonymes
  m2    constant text := '00000000-0000-4000-8000-000000003804';   -- M2 : compte PRIVÉ, publie Q
  k     constant text := '00000000-0000-4000-8000-000000003805';   -- K : organise E3, que M a écrite
  p     constant text := 'zz_rv38_p_' || sfx;      -- publication publique de M
  q     constant text := 'zz_rv38_q_' || sfx;      -- publication de M2 (compte privé)
  h1    constant text := 'zz_rv38_h1_' || sfx;     -- publication de M ; N crée une ACTIVITÉ sous ce nom
  e     constant text := 'zz_rv38_e_' || sfx;      -- activité de M
  e3    constant text := 'zz_rv38_e3_' || sfx;     -- activité écrite par M, organisée par K
  e4    constant text := 'zz_rv38_e4_' || sfx;     -- activité de M, organizer_id vide
  h2    constant text := 'zz_rv38_h2_' || sfx;     -- activité de M ; N crée une PUBLICATION sous ce nom
  en    constant text := 'zz_rv38_en_' || sfx;     -- activité de N
  c1    constant text := 'zz_rv38_c1_' || sfx;     -- V sur P
  c2    constant text := 'zz_rv38_c2_' || sfx;     -- V sur P ; N en écrit un homonyme dans EN
  cq    constant text := 'zz_rv38_cq_' || sfx;     -- M2 sur Q
  cx    constant text := 'zz_rv38_cx_' || sfx;     -- V sur l'exemple p1
  hc    constant text := 'zz_rv38_hc_' || sfx;     -- V sur la publication H1
  hd    constant text := 'zz_rv38_hd_' || sfx;     -- N dans son activité homonyme H1
  ec2   constant text := 'zz_rv38_ec2_' || sfx;    -- V sur E
  ek    constant text := 'zz_rv38_ek_' || sfx;     -- V sur E3
  e4c   constant text := 'zz_rv38_e4c_' || sfx;    -- V sur E4
  h2c   constant text := 'zz_rv38_h2c_' || sfx;    -- V sur l'activité H2
  w     constant text := 'zz_rv38_w_' || sfx;      -- N dans sa publication homonyme H2
  rep   constant text := 'srep_zz_rv38_' || sfx;   -- une RÉPONSE : aucune table ne la porte
  role0 constant text := current_user;
  mes   jsonb := '{}'::jsonb;
  roles jsonb := '{}'::jsonb;
  refus jsonb := '[]'::jsonb;
  t     record;
  indice text;
  k_lu  bigint;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private) values
      (m, 'zz_rv38_m_' || sfx, false), (v, 'zz_rv38_v_' || sfx, false), (n, 'zz_rv38_n_' || sfx, false),
      (m2, 'zz_rv38_m2_' || sfx, true), (k, 'zz_rv38_k_' || sfx, false);
    insert into public.posts (id, author_id, content) values
      (p, m, 'mesure RV-38 : P'), (q, m2, 'mesure RV-38 : Q, compte privé'), (h1, m, 'mesure RV-38 : H1');
    insert into public.post_comments (id, post_id, author_id, content) values
      (c1, p, v, 'C1'), (c2, p, v, 'C2'), (cq, q, m2, 'CQ'), (cx, 'p1', v, 'sur un exemple'), (hc, h1, v, 'HC');
    insert into public.events (id, author_id, organizer_id, title) values
      (e, m, m, 'mesure RV-38 : E'), (e3, m, k, 'mesure RV-38 : E3, organisée par K'),
      (e4, m, '', 'mesure RV-38 : E4, organisateur vide'), (h2, m, m, 'mesure RV-38 : H2'), (en, n, n, 'mesure RV-38 : EN');
    insert into public.event_comments (id, event_id, author_id, text) values
      (ec2, e, v, 'EC2'), (ek, e3, v, 'EK'), (e4c, e4, v, 'E4C'), (h2c, h2, v, 'H2C');
    -- Les homonymes de N : une activité sous le nom de H1, une publication sous
    -- le nom de H2, un commentaire d'activité sous le nom de C2.
    insert into public.events (id, author_id, organizer_id, title) values (h1, n, n, 'homonyme de H1');
    insert into public.event_comments (id, event_id, author_id, text) values (hd, h1, n, 'HD'), (c2, en, n, 'homonyme de C2');
    insert into public.posts (id, author_id, content) values (h2, n, 'homonyme de H2');
    insert into public.post_comments (id, post_id, author_id, content) values (w, h2, n, 'W');

    -- a. Les essais. `qui` : l'identité (uuid), « anon », ou « admin » (le rôle
    --    de la migration, sans identité).
    for t in
      select x.* from jsonb_to_recordset(jsonb_build_array(
        -- le propriétaire d'une publication : pose, retire, repose
        jsonb_build_object('cle', 'm_pose',          'qui', m,      'cid', c1,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_retire',        'qui', m,      'cid', c1,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', '0'),
        jsonb_build_object('cle', 'm_repose',        'qui', m,      'cid', c1,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', '1'),
        -- l'organisateur d'une activité ; organizer_id s'il est posé, sinon l'auteur
        jsonb_build_object('cle', 'm_activite',      'qui', m,      'cid', ec2, 'pid', e,    'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'k_organisateur',  'qui', k,      'cid', ek,  'pid', e3,   'uid', k,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_auteur_seul',   'qui', m,      'cid', ek,  'pid', e3,   'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_organisateur_vide', 'qui', m,  'cid', e4c, 'pid', e4,   'uid', m,  'genre', 'pin',   'charge', '1'),
        -- qui n'est pas le propriétaire : l'auteur du commentaire, un inconnu
        jsonb_build_object('cle', 'v_pose',          'qui', v,      'cid', c1,  'pid', p,    'uid', v,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'n_pose',          'qui', n,      'cid', c1,  'pid', p,    'uid', n,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'v_activite',      'qui', v,      'cid', ec2, 'pid', e,    'uid', v,  'genre', 'pin',   'charge', '1'),
        -- le propriétaire, hors de son fil
        jsonb_build_object('cle', 'm_autre_fil',     'qui', m,      'cid', c1,  'pid', e,    'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_reponse',       'qui', m,      'cid', rep, 'pid', p,    'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_exemple',       'qui', m,      'cid', cx,  'pid', 'p1', 'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_sans_fil',      'qui', m,      'cid', c1,               'uid', m,  'genre', 'pin',   'charge', '1'),
        -- l'identité
        jsonb_build_object('cle', 'm_pour_v',        'qui', m,      'cid', c1,  'pid', p,    'uid', v,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'anon',            'qui', 'anon', 'cid', c1,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', '1'),
        -- FIL HOMONYME : aucun « 1 », ni d'un côté ni de l'autre…
        jsonb_build_object('cle', 'n_fil_homonyme_pub', 'qui', n,   'cid', hd,  'pid', h1,   'uid', n,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_fil_homonyme_pub', 'qui', m,   'cid', hc,  'pid', h1,   'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'n_fil_homonyme_act', 'qui', n,   'cid', w,   'pid', h2,   'uid', n,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_fil_homonyme_act', 'qui', m,   'cid', h2c, 'pid', h2,   'uid', m,  'genre', 'pin',   'charge', '1'),
        -- … mais le « 0 » du propriétaire du fil où se trouve le commentaire passe ; celui d'un tiers, non
        jsonb_build_object('cle', 'm_retire_homonyme', 'qui', m,    'cid', hc,  'pid', h1,   'uid', m,  'genre', 'pin',   'charge', '0'),
        jsonb_build_object('cle', 'n_retire_homonyme', 'qui', n,    'cid', hd,  'pid', h1,   'uid', n,  'genre', 'pin',   'charge', '0'),
        jsonb_build_object('cle', 'v_retire_homonyme', 'qui', v,    'cid', hc,  'pid', h1,   'uid', v,  'genre', 'pin',   'charge', '0'),
        -- COMMENTAIRE HOMONYME dans l'autre table : chacun épingle et retire dans SON fil
        jsonb_build_object('cle', 'm_pose_c2',       'qui', m,      'cid', c2,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'm_retire_c2',     'qui', m,      'cid', c2,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', '0'),
        jsonb_build_object('cle', 'n_pose_c2',       'qui', n,      'cid', c2,  'pid', en,   'uid', n,  'genre', 'pin',   'charge', '1'),
        -- la charge, jugée par la garde ; un genre inconnu, par ci_kind_check
        jsonb_build_object('cle', 'm_charge_2',      'qui', m,      'cid', c1,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', '2'),
        jsonb_build_object('cle', 'm_charge_vrai',   'qui', m,      'cid', c1,  'pid', p,    'uid', m,  'genre', 'pin',   'charge', 'true'),
        jsonb_build_object('cle', 'm_charge_nulle',  'qui', m,      'cid', c1,  'pid', p,    'uid', m,  'genre', 'pin'),
        jsonb_build_object('cle', 'm_genre_inconnu', 'qui', m,      'cid', c1,  'pid', p,    'uid', m,  'genre', 'epingle', 'charge', '1'),
        -- les autres genres, inchangés
        jsonb_build_object('cle', 'v_jaime',         'qui', v,      'cid', c1,  'pid', p,    'uid', v,  'genre', 'like'),
        jsonb_build_object('cle', 'v_reponse',       'qui', v,      'cid', c1,  'pid', p,    'uid', v,  'genre', 'reply', 'charge', 'réponse de V'),
        jsonb_build_object('cle', 'v_emoji',         'qui', v,      'cid', p,   'pid', p,    'uid', v,  'genre', 'emoji', 'charge', '😍'),
        jsonb_build_object('cle', 'v_gif',           'qui', v,      'cid', c1,  'pid', p,    'uid', v,  'genre', 'gif',   'charge', 'https://media.passio.test/x.gif'),
        -- un compte privé épingle chez lui
        jsonb_build_object('cle', 'm2_pose',         'qui', m2,     'cid', cq,  'pid', q,    'uid', m2, 'genre', 'pin',   'charge', '1'),
        -- l'administration : non jugée par la garde ; la contrainte, si
        jsonb_build_object('cle', 'admin_pose',      'qui', 'admin', 'cid', c1, 'pid', p,    'uid', n,  'genre', 'pin',   'charge', '1'),
        jsonb_build_object('cle', 'admin_charge',    'qui', 'admin', 'cid', c1, 'pid', p,    'uid', m,  'genre', 'pin',   'charge', '2')
      )) as x(cle text, qui text, cid text, pid text, uid text, genre text, charge text)
    loop
      if t.qui = 'anon' then
        execute 'set local role anon';
      elsif t.qui <> 'admin' then
        execute 'set local role authenticated';
        perform set_config('request.jwt.claim.sub', t.qui, true);
        perform set_config('request.jwt.claims', jsonb_build_object('sub', t.qui, 'role', 'authenticated')::text, true);
      end if;
      roles := roles || jsonb_build_object(t.cle, jsonb_build_array(current_user::text, (auth.uid())::text));
      begin
        execute 'insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ($1, $2, $3, $4, $5, $6)'
          using 'zz_rv38_' || t.cle || '_' || sfx, t.cid, t.pid, t.uid, t.genre, t.charge;
        mes := mes || jsonb_build_object(t.cle, 'ok');
      exception when others then
        get stacked diagnostics indice = pg_exception_hint;
        mes := mes || jsonb_build_object(t.cle, sqlstate);
        if sqlstate = '42501' then
          refus := refus || to_jsonb(sqlstate || '|' || sqlerrm || '|' || coalesce(indice, ''));
        end if;
      end;
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', true);
      perform set_config('request.jwt.claims', '', true);
    end loop;

    -- b. Le PARTAGE : qui lit les épingles de M sur P (publique), et celle de M2
    --    sur Q (compte privé) — par la policy SELECT, inchangée.
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', n, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', n, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('lecture_n', jsonb_build_array(current_user::text, (auth.uid())::text));
    execute 'select count(*) from public.comment_interactions where post_id = $1 and kind = ''pin'' and user_id = $2' into k_lu using p, m;
    mes := mes || jsonb_build_object('lit_n_p', k_lu);
    execute 'select count(*) from public.comment_interactions where post_id = $1 and kind = ''pin''' into k_lu using q;
    mes := mes || jsonb_build_object('lit_n_q', k_lu);
    perform set_config('request.jwt.claim.sub', m2, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', m2, 'role', 'authenticated')::text, true);
    roles := roles || jsonb_build_object('lecture_m2', jsonb_build_array(current_user::text, (auth.uid())::text));
    execute 'select count(*) from public.comment_interactions where post_id = $1 and kind = ''pin''' into k_lu using q;
    mes := mes || jsonb_build_object('lit_m2_q', k_lu);
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    roles := roles || jsonb_build_object('lecture_anon', jsonb_build_array(current_user::text, (auth.uid())::text));
    execute 'select count(*) from public.comment_interactions where post_id = $1 and kind = ''pin'' and user_id = $2' into k_lu using p, m;
    mes := mes || jsonb_build_object('lit_anon_p', k_lu);
    execute 'select count(*) from public.comment_interactions where post_id = $1 and kind = ''pin''' into k_lu using q;
    mes := mes || jsonb_build_object('lit_anon_q', k_lu);
    execute 'reset role';

    -- Le rôle et l'identité de la migration, rendus AVANT l'annulation (qui les
    -- rendrait aussi).
    perform set_config('role', role0, true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';
  exception when others then
    if sqlerrm is distinct from 'passio_verdict_annule' then
      mes := mes || jsonb_build_object('erreur', left(sqlstate || ' ' || sqlerrm, 160));
    end if;
  end;
  mes := mes || jsonb_build_object('roles', roles, 'refus', refus);
  -- Après l'annulation : rien ne doit rester du décor.
  mes := mes || jsonb_build_object('restes',
      (select count(*) from public.profiles x where x.id in (m, v, n, m2, k))
    + (select count(*) from public.posts x where x.id like 'zz\_rv38\_%')
    + (select count(*) from public.post_comments x where x.id like 'zz\_rv38\_%')
    + (select count(*) from public.events x where x.id like 'zz\_rv38\_%')
    + (select count(*) from public.event_comments x where x.id like 'zz\_rv38\_%')
    + (select count(*) from public.comment_interactions x where x.id like 'zz\_rv38\_%' or x.user_id in (m, v, n, m2, k))
    + (select count(*) from public.notifications x where x.user_id in (m, v, n, m2, k) or x.from_id in (m, v, n, m2, k)));
  if to_regclass('public.event_checkin_secrets') is not null then
    execute 'select count(*) from public.event_checkin_secrets s where s.event_id like ''zz\_rv38\_%''' into k_lu;
    mes := mes || jsonb_build_object('restes_secret', k_lu);
  end if;
  perform set_config('passio.verdict_rv38', mes::text, true);
end
$verdict$;

-- ── ⑤ LE TABLEAU, relevé UNE fois dans une table temporaire détruite au commit,
-- lu par le garde-fou ⑥ et par le verdict. `bloquant` : toute ligne de contrôle
-- (1 à 21) ; la 22 est une information.
create temp table passio_rv38_verdict on commit drop as
with v as (select coalesce(nullif(current_setting('passio.verdict_rv38', true), ''), '{}')::jsonb as j),
     u as (select '00000000-0000-4000-8000-0000000038'::text as pre)
select 1 as n, true as bloquant, 'RV-38 · mesure exécutée : décor synthétique, chaque essai sous SON rôle (authenticated à identité simulée, anon, administration), sous-transaction ANNULÉE'::text as controle,
       (select case when j ? 'erreur' then 'ECHEC — ' || (j->>'erreur')
                    when j ? 'm_pose' and j ? 'admin_charge' and j ? 'lit_anon_q'
                         and j->'roles'->'m_pose' = jsonb_build_array('authenticated', (select pre from u) || '01')
                         and j->'roles'->'v_pose' = jsonb_build_array('authenticated', (select pre from u) || '02')
                         and j->'roles'->'n_pose' = jsonb_build_array('authenticated', (select pre from u) || '03')
                         and j->'roles'->'m2_pose' = jsonb_build_array('authenticated', (select pre from u) || '04')
                         and j->'roles'->'k_organisateur' = jsonb_build_array('authenticated', (select pre from u) || '05')
                         and j->'roles'->'anon' = '["anon", null]'::jsonb
                         and j->'roles'->'lecture_n' = jsonb_build_array('authenticated', (select pre from u) || '03')
                         and j->'roles'->'lecture_m2' = jsonb_build_array('authenticated', (select pre from u) || '04')
                         and j->'roles'->'lecture_anon' = '["anon", null]'::jsonb
                         and j->'roles'->'admin_pose'->>1 is null
                         and j->'roles'->'admin_pose'->>0 not in ('anon', 'authenticated') then 'OK'
                    else 'ECHEC — mesure absente, ou essai sous un autre rôle' end from v) as valeur
union all select 2, true, 'le propriétaire d''une publication épingle un commentaire de SON fil, retire l''épingle, la repose : trois écritures acceptées',
       (select case when (j->>'m_pose', j->>'m_retire', j->>'m_repose') = ('ok', 'ok', 'ok') then 'OK' else 'ECHEC' end from v)
union all select 3, true, 'l''organisateur d''une activité épingle un commentaire de SON activité',
       (select case when j->>'m_activite' = 'ok' then 'OK' else 'ECHEC' end from v)
union all select 4, true, 'l''organisateur, c''est organizer_id s''il est posé, sinon l''auteur (la définition du client) : K, organisateur, épingle ; M, auteur sans l''être, est REFUSÉ (42501) ; organizer_id vide, l''auteur épingle',
       (select case when (j->>'k_organisateur', j->>'m_auteur_seul', j->>'m_organisateur_vide') = ('ok', '42501', 'ok') then 'OK' else 'ECHEC' end from v)
union all select 5, true, 'qui n''est pas le propriétaire est REFUSÉ (42501) : l''auteur du commentaire et un inconnu sur la publication, l''auteur du commentaire sur l''activité',
       (select case when (j->>'v_pose', j->>'n_pose', j->>'v_activite') = ('42501', '42501', '42501') then 'OK' else 'ECHEC' end from v)
union all select 6, true, 'le propriétaire est REFUSÉ hors de son fil (42501) : un commentaire de sa publication annoncé dans son activité, une réponse (srep_…, aucune table), un commentaire d''un fil d''exemple, une épingle sans fil',
       (select case when (j->>'m_autre_fil', j->>'m_reponse', j->>'m_exemple', j->>'m_sans_fil') = ('42501', '42501', '42501', '42501') then 'OK' else 'ECHEC' end from v)
union all select 7, true, 'une épingle au nom d''un AUTRE compte, ou sans identité (anon), est REFUSÉE (42501)',
       (select case when (j->>'m_pour_v', j->>'anon') = ('42501', '42501') then 'OK' else 'ECHEC' end from v)
union all select 8, true, 'FIL HOMONYME (une publication et une activité sous le même identifiant) : aucun « 1 » — ni par l''auteur de la publication, ni par l''organisateur de l''activité homonyme, dans les deux sens (42501)',
       (select case when (j->>'n_fil_homonyme_pub', j->>'m_fil_homonyme_pub', j->>'n_fil_homonyme_act', j->>'m_fil_homonyme_act')
                         = ('42501', '42501', '42501', '42501') then 'OK' else 'ECHEC' end from v)
union all select 9, true, '…mais le « 0 » du propriétaire du fil où se trouve le commentaire passe (un homonyme créé après une épingle ne la verrouille pas) ; celui d''un tiers est REFUSÉ',
       (select case when (j->>'m_retire_homonyme', j->>'n_retire_homonyme', j->>'v_retire_homonyme') = ('ok', 'ok', '42501') then 'OK' else 'ECHEC' end from v)
union all select 10, true, 'COMMENTAIRE HOMONYME dans l''autre table de commentaires : rien ne change — le propriétaire épingle et retire dans SON fil, l''autre dans le sien',
       (select case when (j->>'m_pose_c2', j->>'m_retire_c2', j->>'n_pose_c2') = ('ok', 'ok', 'ok') then 'OK' else 'ECHEC' end from v)
union all select 11, true, 'un refus ne dit pas pourquoi : les 18 refus de la garde portent le MÊME code, le même message et le même indice — une charge invalide comprise',
       (select case when jsonb_array_length(j->'refus') = 18
                         and (select count(distinct x) from jsonb_array_elements_text(j->'refus') x) = 1
                         and j->'refus'->>0 = '42501|new row violates row-level security policy for table "comment_interactions"|épingle : réservée au propriétaire du fil, sur un commentaire de ce fil'
                    then 'OK' else 'ECHEC' end from v)
union all select 12, true, 'la charge d''une épingle est « 0 » ou « 1 » : « 2 », « true » et l''absence sont REFUSÉS par la garde (42501) ; un genre inconnu, par ci_kind_check (23514)',
       (select case when (j->>'m_charge_2', j->>'m_charge_vrai', j->>'m_charge_nulle', j->>'m_genre_inconnu')
                         = ('42501', '42501', '42501', '23514') then 'OK' else 'ECHEC' end from v)
union all select 13, true, 'l''épingle est PARTAGÉE : sur une publication publique, un autre compte et un visiteur lisent les cinq lignes du propriétaire',
       (select case when (j->>'lit_n_p', j->>'lit_anon_p') = ('5', '5') then 'OK' else 'ECHEC' end from v)
union all select 14, true, '…et suit la visibilité du fil : sur la publication d''un compte privé, ni un non-abonné ni un visiteur ne la lisent ; son auteur, si',
       (select case when j->>'m2_pose' = 'ok' and (j->>'lit_n_q', j->>'lit_anon_q', j->>'lit_m2_q') = ('0', '0', '1') then 'OK' else 'ECHEC' end from v)
union all select 15, true, 'les autres genres sont INCHANGÉS : « j''aime », réponse, emoji (sur la publication), GIF passent comme avant — la garde ne les voit pas',
       (select case when (j->>'v_jaime', j->>'v_reponse', j->>'v_emoji', j->>'v_gif') = ('ok', 'ok', 'ok', 'ok') then 'OK' else 'ECHEC' end from v)
union all select 16, true, 'l''administration n''est pas jugée par la garde (reprise, purge, service_role) : une épingle écrite sans rôle client passe — la contrainte de charge, elle, vaut aussi pour elle (23514)',
       (select case when (j->>'admin_pose', j->>'admin_charge') = ('ok', '23514') then 'OK' else 'ECHEC' end from v)
union all select 17, true, 'aucune trace du décor : profils, publications, commentaires, activités et leurs secrets de pointage, interactions, notifications',
       (select case when j->>'restes' = '0' and coalesce(j->>'restes_secret', '0') = '0' then 'OK' else 'ECHEC' end from v)
union all select 18, true, 'ci_kind_check : like, reply, emoji, gif ET pin — validée',
       case when exists (select 1 from pg_catalog.pg_constraint c
                          where c.conrelid = 'public.comment_interactions'::regclass and c.conname = 'ci_kind_check'
                            and c.contype = 'c' and c.convalidated
                            and pg_catalog.pg_get_constraintdef(c.oid)
                                = 'CHECK ((kind = ANY (ARRAY[''like''::text, ''reply''::text, ''emoji''::text, ''gif''::text, ''pin''::text])))') then 'OK' else 'ECHEC' end
union all select 19, true, 'ci_pin_payload_check : une épingle porte « 0 » ou « 1 », jamais rien — validée',
       case when exists (select 1 from pg_catalog.pg_constraint c
                          where c.conrelid = 'public.comment_interactions'::regclass and c.conname = 'ci_pin_payload_check'
                            and c.contype = 'c' and c.convalidated
                            and pg_catalog.pg_get_constraintdef(c.oid)
                                = 'CHECK (((kind <> ''pin''::text) OR ((payload IS NOT NULL) AND (payload = ANY (ARRAY[''0''::text, ''1''::text])))))') then 'OK' else 'ECHEC' end
union all select 20, true, 'trg_ci_epingle_garde : BEFORE INSERT OR UPDATE, par ligne, actif, WHEN (new.kind = ''pin''), sans argument, sur ci_epingle_garde()',
       case when exists (select 1 from pg_catalog.pg_trigger t
                          where t.tgrelid = 'public.comment_interactions'::regclass and t.tgname = 'trg_ci_epingle_garde'
                            and not t.tgisinternal and t.tgenabled = 'O' and t.tgtype = 23 and t.tgnargs = 0
                            and t.tgfoid = to_regprocedure('public.ci_epingle_garde()')
                            and pg_catalog.pg_get_triggerdef(t.oid) like '% FOR EACH ROW WHEN ((new.kind = ''pin''::text)) EXECUTE FUNCTION %') then 'OK' else 'ECHEC' end
union all select 21, true, 'ci_epingle_garde() : SECURITY DEFINER, search_path vide, corps de cette migration à l''octet (md5, fins de ligne normalisées) ; ni PUBLIC, ni anon, ni authenticated ne l''exécutent — et RLS active sur comment_interactions',
       case when exists (select 1 from pg_catalog.pg_proc p
                          where p.oid = to_regprocedure('public.ci_epingle_garde()')
                            and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""'
                            and p.prorettype = 'trigger'::regtype
                            and p.prolang = (select l.oid from pg_catalog.pg_language l where l.lanname = 'plpgsql')
                            and md5(replace(p.prosrc, chr(13) || chr(10), chr(10))) = '9078992e4fdd194a5b9e9afae4ada3e6'
                            and p.proacl is not null
                            and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
                            and not has_function_privilege('anon', p.oid, 'EXECUTE')
                            and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
             and (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.comment_interactions'::regclass) then 'OK' else 'ECHEC' end
union all select 22, false, 'information — épingles en base après application (0 attendu le jour même : aucune ne pouvait s''écrire avant)',
       (select count(*) from public.comment_interactions where kind = 'pin')::text;

-- ── ⑥ FERMÉ SUR ÉCHEC : une ligne de contrôle en ECHEC annule TOUT ──
-- Rien n'est alors appliqué — ni les contraintes, ni la garde, ni une trace du
-- décor, ni la ligne de journal de l'outil d'application (même transaction).
do $$
declare
  numeros text;
  details text;
begin
  select string_agg(c.n::text, ',' order by c.n), string_agg(c.n || '. ' || c.controle, ' ; ' order by c.n)
    into numeros, details
    from pg_temp.passio_rv38_verdict c
   where c.bloquant and c.valeur is distinct from 'OK';
  if numeros is not null then
    raise exception 'RV-38 : la base n''est pas celle que ce correctif suppose, ou il ne s''y comporte pas comme il le doit — RIEN n''est appliqué. Lignes en échec : %', numeros
      using errcode = 'object_not_in_prerequisite_state', detail = details;
  end if;
end $$;

-- ── Verdict ──
select controle, valeur from pg_temp.passio_rv38_verdict order by n;

commit;
