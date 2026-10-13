-- ═══════════════════════════════════════════════════════════════════════════
-- RÉGLAGES DISTANTS, AUDIENCE EXACTE ET SIGNAUX DE LA VEILLE (2026-10-11,
-- revu le 2026-10-13 après contre-revue adversariale)
--
-- ① `public.reglages_distants` — l'interrupteur que toute la production écoute.
--    Trois lignes au plus (`delestage`, `coupures`, `bandeau`), LUES par chaque
--    appareil toutes les 5 min (js/reglages-distants.js) et ÉCRITES par la
--    seule fonction `pilotage` (clé service_role) : à la main depuis le
--    téléphone, ou par la veille pg_cron quand la charge monte (délestage
--    automatique). Ferme EXP-03 : « aucun interrupteur serveur ne coupe une
--    fonctionnalité chez tout le monde » (docs/RECUPERATION.md).
--    · anon et authenticated : SELECT sur (cle, valeur, maj) SEULEMENT — le
--      motif et l'auteur du geste restent côté pilote ; aucune écriture.
--      ⚠️ Supabase accorde ALL par défaut sur toute nouvelle table de `public`
--      à anon et authenticated : on REVOKE la table, puis on GRANT colonne
--      par colonne (journal serveur-securite-base : on ne retire pas une
--      colonne d'un GRANT de table).
--    · les valeurs sont validées par la fonction (_shared/reglages.js) ET
--      revalidées par le client ; la base borne la forme (clé, auteur, motif).
--
-- ② `public.pilotage_audience(p_secondes)` — comptes, appareils et connexions
--    d'une fenêtre, comptés DISTINCTS en base (PostgREST plafonne une lecture
--    de lignes à 1 000 : la jauge se figeait sous le mur qu'elle annonce).
--    MÊME règle que `compterAudience` (_shared/pilotage.js) pour `comptes` /
--    `appareils` / `hors_public`. Sur une fenêtre COURTE (≤ 15 min, celle de
--    la veille) elle rend aussi les signaux de la veille :
--    · `comptes_connectes` : comptes distincts (`auth_uid`) actifs — la charge ;
--    · `comptes_5xx_15min` : comptes distincts touchés par une réponse ≥ 500 ;
--    · `comptes_echecs_30min` : comptes distincts touchés par un échec
--      (`pilotage_famille_echec`) en 30 min — le réveil de la Sentinelle ;
--    · `saturation_minute_max` : lignes reçues par minute, au pire des
--      5 dernières — au plafond global (3 000/min), la télémétrie est AVEUGLE
--      et la veille ne lève plus une protection sur des mesures muettes.
--    Sur 24 h, ces signaux valent NULL : personne ne les lit, et chaque passe
--    sur un jour entier coûte (statement_timeout de 8 s à l'échelle).
--
-- ③ `public.pilotage_familles_erreurs(p_version, p_depuis)` — la proposition de
--    retour arrière : par famille d'échec, les comptes distincts touchés sur
--    la version servie depuis sa mise en ligne, et sur une AUTRE version dans
--    les 24 h. Comptée en base : une lecture de lignes tronquée à 1 000, qu'un
--    seul appareil en boucle remplit, cachait la vraie régression.
--
-- ⚠️ CE QUI DÉCIDE N'EST PAS FALSIFIABLE À BON MARCHÉ (contre-revue du
-- 2026-10-13). La télémétrie est écrite par le navigateur : `type`,
-- `http_status`, `message` se forgent ; seule l'identité (`auth_uid`, posée
-- par le trigger serveur depuis le jeton) ne se forge pas. Mais des comptes se
-- créent en une minute : dix comptes neufs qui envoyaient une ligne « 503 »
-- suffisaient à délester TOUTE la production. Les signaux qui agissent ne
-- comptent donc que des comptes RÉELS ET ANCIENS, lus dans `auth.users`
-- (date posée par le serveur, jamais `profiles.created_at` qu'un client
-- écrit) : e-mail confirmé, pas anonyme, créés depuis 7 jours (pannes,
-- familles) ou 24 h (réveil). `comptes_connectes` reste la charge brute : la
-- forger exige des centaines de comptes actifs, c'est-à-dire la charge même.
-- Un délestage posé à tort se lève d'un toucher (« Normal » dans le pilotage).
--
-- SECURITY DEFINER, exécutables par service_role SEULEMENT.
--
-- COÛT MESURÉ (2026-10-13, PostgreSQL 16 aux réglages d'une instance Micro :
-- shared_buffers 224 Mo, work_mem 2 Mo, jit off ; 1,5 M lignes sur 24 h, soit
-- ~1 000/min, 20 000 comptes) : audience 5 min 1 à 3 ms ; audience 24 h 3,5 s ;
-- familles d'une version 2,3 s. Au plafond global (3 000/min), la passe de
-- 24 h dépassera le statement_timeout de 8 s : la fonction `pilotage` l'isole
-- (« non mesurée ») sans perdre le reste. Rendre la fonction auxiliaire
-- inlinable (sans `set search_path`) ne gagne que 10 à 20 % : non retenu.
--
-- ORDRE : le client et la fonction `pilotage` sont déjà en production et
-- tolèrent l'absence (404 = aucun réglage ; 503 nommant ce fichier ; repli
-- par lignes « tronqué » ; signaux absents = rien ne bouge). Appliquer ce
-- fichier les ALLUME, sans redéploiement.
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_reglages_distants_2026-10-11.sql`
--
-- REJOUABLE. RETOUR ARRIÈRE — EN DEUX TEMPS, JAMAIS D'UN COUP :
--   1) delete from public.reglages_distants;
--      puis ATTENDRE au moins 15 min : chaque appareil relit la table toutes
--      les 5 min et rend les coupures qu'il avait posées. Un `drop table`
--      direct laisserait une coupure en place chez qui l'a déjà lue.
--   2) drop function if exists public.pilotage_familles_erreurs(text, timestamptz);
--      drop function if exists public.pilotage_audience(integer);
--      drop function if exists public.pilotage_famille_echec(text, text, integer, text, text, jsonb);
--      drop index if exists public.idx_tel_type_received;
--      drop table if exists public.reglages_distants;
-- BANC : tests/sql/migration-reglages-distants.test.sh
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.reglages_distants (
  cle      text primary key check (cle in ('delestage', 'coupures', 'bandeau')),
  valeur   jsonb not null check (jsonb_typeof(valeur) = 'object' and octet_length(valeur::text) <= 4096),
  pose_par text not null check (pose_par in ('pilote', 'veille')),
  motif    text check (motif is null or char_length(motif) <= 300),
  maj      timestamptz not null default now()
);

alter table public.reglages_distants enable row level security;

revoke all on table public.reglages_distants from public;
revoke all on table public.reglages_distants from anon;
revoke all on table public.reglages_distants from authenticated;
grant select (cle, valeur, maj) on table public.reglages_distants to anon, authenticated;
grant select, insert, update, delete on table public.reglages_distants to service_role;

drop policy if exists reglages_distants_lecture on public.reglages_distants;
create policy reglages_distants_lecture on public.reglages_distants
  for select to anon, authenticated using (true);

-- Les signaux de la veille ne lisent que les lignes `error` et `api` d'une
-- fenêtre : un index (type, received_at) leur évite de parcourir tout le reste.
create index if not exists idx_tel_type_received on public.telemetry_events (type, received_at);

-- Famille d'un ÉCHEC, ou NULL si la ligne n'en est pas un. Une seule définition
-- pour le réveil et pour la proposition (même grain que estDuBruitApi de
-- scripts/sentinelle-detecter.mjs) :
--   · `error` avec un message → 'error:' || message ;
--   · `api` en échec, 400 à 599, hors refus attendu (meta.refus_attendu) et
--     hors /auth/v1/token en 4xx (session expirée, pas une régression)
--     → 'api:<statut> <chemin>' (l'hôte et la requête sont retirés).
-- Le statut 0 (réseau) n'en est pas une : c'est le réseau de l'appareil.
-- ⚠️ La clé porte du texte écrit par le navigateur : elle reste côté serveur
-- et pilote, jamais vers GitHub (la fonction `pilotage` n'en sort qu'une empreinte).
create or replace function public.pilotage_famille_echec(
  p_type text, p_status text, p_http integer, p_endpoint text, p_message text, p_meta jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
  select case
    when p_type = 'error' and coalesce(p_message, '') <> '' then 'error:' || left(p_message, 500)
    when p_type = 'api' and p_status = 'error' and p_http between 400 and 599
         and not (p_http < 500 and coalesce(p_meta->>'refus_attendu', '') = 'true')
         and not (p_http < 500 and coalesce(p_endpoint, '') like '%/auth/v1/token%')
      then 'api:' || p_http || ' ' || coalesce(nullif(regexp_replace(split_part(coalesce(p_endpoint, ''), '?', 1), '^[^/]*', ''), ''), '/')
  end
$fn$;

create or replace function public.pilotage_audience(p_secondes integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
-- La borne est une variable : sans plan sur mesure, le planificateur estime
-- toute fenêtre à un tiers de la table et parcourt tout (contre-revue).
set plan_cache_mode = force_custom_plan
as $fn$
declare
  v_s      integer     := greatest(60, least(coalesce(p_secondes, 300), 86400));
  v_depuis timestamptz := now() - make_interval(secs => v_s);
  v_out    jsonb;
begin
  with l as (
    -- `hors` ne vaut jamais NULL : une ligne `platform` NULL est du public,
    -- comme dans traficHorsPublic (logique à trois valeurs, contre-revue).
    select nullif(t.user_id, '') as user_id, nullif(t.device_id, '') as device_id,
           (coalesce(t.meta->>'trafic', '') in ('robot', 'emulation', 'equipe')
             or (coalesce(t.platform = 'ios', false) and coalesce(t.connection, '') <> '')) as hors
      from public.telemetry_events t
     where t.env = 'production' and t.received_at >= v_depuis
  ),
  hp as (
    select distinct device_id from l where hors and device_id is not null
  ),
  pub as (
    select l.user_id, l.device_id from l
     where not l.hors
       and (l.device_id is null or not exists (select 1 from hp where hp.device_id = l.device_id))
  )
  select jsonb_build_object(
    'comptes',     (select count(distinct user_id) from pub),
    'appareils',   (select count(distinct device_id) from pub),
    'hors_public', (select count(*) from hp),
    'secondes',    v_s
  ) into v_out;

  if v_s > 900 then
    return v_out || jsonb_build_object('comptes_connectes', null, 'comptes_5xx_15min', null,
                                       'comptes_echecs_30min', null, 'saturation_minute_max', null);
  end if;

  return v_out || jsonb_build_object(
    'comptes_connectes', (
      select count(distinct t.auth_uid) from public.telemetry_events t
       where t.env = 'production' and t.auth_uid is not null and t.received_at >= v_depuis),
    'comptes_5xx_15min', (
      select count(distinct t.auth_uid) from public.telemetry_events t
        join auth.users u on u.id = t.auth_uid
       where t.env = 'production' and t.type = 'api' and t.http_status >= 500
         and t.received_at >= now() - interval '15 minutes'
         and u.created_at < now() - interval '7 days'
         and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)),
    'comptes_echecs_30min', (
      select count(distinct t.auth_uid) from public.telemetry_events t
        join auth.users u on u.id = t.auth_uid
       where t.env = 'production' and t.type in ('error', 'api')
         and t.received_at >= now() - interval '30 minutes'
         and public.pilotage_famille_echec(t.type, t.status, t.http_status, t.endpoint, t.message, t.meta) is not null
         and u.created_at < now() - interval '24 hours'
         and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)),
    -- TOUTES les lignes, tous environnements : c'est ce que compte le plafond global.
    'saturation_minute_max', (
      select coalesce(max(c), 0) from (
        select count(*) as c from public.telemetry_events t
         where t.received_at >= now() - interval '5 minutes'
         group by date_trunc('minute', t.received_at)) m)
  );
end
$fn$;

create or replace function public.pilotage_familles_erreurs(p_version text, p_depuis timestamptz)
returns table (famille text, comptes integer, n integer, comptes_ailleurs integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
set plan_cache_mode = force_custom_plan
as $fn$
declare
  -- Jamais plus de 24 h en arrière, jamais dans le futur.
  v_depuis timestamptz := least(now(), greatest(coalesce(p_depuis, now()), now() - interval '24 hours'));
  -- Comptes créés 7 jours au moins AVANT la mise en ligne.
  v_avant  timestamptz := v_depuis - interval '7 days';
begin
  if p_version is null or p_version !~ '^[0-9a-f]{7,40}$' then
    return;
  end if;
  return query
  with ici as (
    select public.pilotage_famille_echec(t.type, t.status, t.http_status, t.endpoint, t.message, t.meta) as f, t.auth_uid
      from public.telemetry_events t
      join auth.users u on u.id = t.auth_uid
     where t.env = 'production' and t.type in ('error', 'api')
       and t.app_version = p_version and t.received_at >= v_depuis
       and u.created_at < v_avant and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
  ),
  g as (
    select ici.f, count(distinct ici.auth_uid)::integer as c, count(*)::integer as k
      from ici where ici.f is not null
     group by ici.f
    having count(distinct ici.auth_uid) >= 2
  ),
  ailleurs as (
    select x.f, count(distinct x.auth_uid)::integer as c from (
      select public.pilotage_famille_echec(t.type, t.status, t.http_status, t.endpoint, t.message, t.meta) as f, t.auth_uid
        from public.telemetry_events t
        join auth.users u on u.id = t.auth_uid
       where t.env = 'production' and t.type in ('error', 'api')
         and t.received_at >= now() - interval '24 hours'
         and t.app_version is distinct from p_version
         and u.created_at < v_avant and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    ) x
     where x.f in (select g.f from g)
     group by x.f
  )
  -- Les familles NOUVELLES d'abord : une régression partielle ne se cache pas
  -- derrière le bruit de fond déjà vu sur les autres versions.
  select g.f, g.c, g.k, coalesce(a.c, 0)
    from g left join ailleurs a on a.f = g.f
   order by (coalesce(a.c, 0) >= 2), g.c desc, g.k desc
   limit 20;
end
$fn$;

revoke all on function public.pilotage_famille_echec(text, text, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.pilotage_audience(integer) from public, anon, authenticated;
revoke all on function public.pilotage_familles_erreurs(text, timestamptz) from public, anon, authenticated;
grant execute on function public.pilotage_famille_echec(text, text, integer, text, text, jsonb) to service_role;
grant execute on function public.pilotage_audience(integer) to service_role;
grant execute on function public.pilotage_familles_erreurs(text, timestamptz) to service_role;

-- ─── Verdict : la transaction s'annule si l'état final n'est pas le bon ─────
-- Chaque rôle client contre chaque colonne réservée et chaque écriture, colonne
-- par colonne comprise (has_table_privilege ignore un GRANT de colonne).
do $v$
declare
  r text; c text; p text; f text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.reglages_distants'::regclass) then
    raise exception 'ECHEC : RLS inactive sur reglages_distants';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach c in array array['motif', 'pose_par'] loop
      if has_column_privilege(r, 'public.reglages_distants', c, 'SELECT') then
        raise exception 'ECHEC : % lit la colonne réservée %', r, c;
      end if;
    end loop;
    foreach p in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege(r, 'public.reglages_distants', p) then
        raise exception 'ECHEC : % a % sur reglages_distants', r, p;
      end if;
    end loop;
    foreach p in array array['DELETE', 'TRUNCATE', 'TRIGGER'] loop
      if has_table_privilege(r, 'public.reglages_distants', p) then
        raise exception 'ECHEC : % a % sur reglages_distants', r, p;
      end if;
    end loop;
    if not has_column_privilege(r, 'public.reglages_distants', 'valeur', 'SELECT') then
      raise exception 'ECHEC : % ne peut pas lire les réglages', r;
    end if;
    foreach f in array array['public.pilotage_audience(integer)', 'public.pilotage_familles_erreurs(text, timestamptz)',
                             'public.pilotage_famille_echec(text, text, integer, text, text, jsonb)'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'ECHEC : % exécute %', r, f;
      end if;
    end loop;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reglages_distants') <> 1
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reglages_distants' and cmd = 'SELECT') <> 1 then
    raise exception 'ECHEC : reglages_distants doit porter UNE politique, de lecture';
  end if;
  -- Une table préexistante d'une autre forme serait gardée par `if not exists`.
  if (select count(*) from pg_constraint where conrelid = 'public.reglages_distants'::regclass and contype = 'c') < 4 then
    raise exception 'ECHEC : reglages_distants sans ses contraintes de forme (table préexistante ?)';
  end if;
end
$v$;

select 'reglages_distants' as controle, 'OK' as verdict, 'lecture (cle, valeur, maj) pour tous, écriture service_role seule' as detail
union all
select 'pilotage_audience', 'OK', 'comptage distinct ; signaux de la veille sur comptes anciens ; service_role seul'
union all
select 'pilotage_familles_erreurs', 'OK', 'familles d''échec par version, comptes anciens ; service_role seul';

commit;
