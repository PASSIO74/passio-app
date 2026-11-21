-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- TÉLÉMÉTRIE 2026-11-21 — LA TABLE FAIT DE LA PLACE SEULE : BORNE PAR CLASSE, PURGE COURTE, LECTURE
-- DU REMPLISSAGE (audit « la surveillance tient-elle à 100 000 utilisateurs ? » du 20/11, trou T2)
--
-- Une transaction, REJOUABLE, FERMÉE SUR ÉCHEC : tableau de verdict de 10 lignes (8 contrôles
-- OK/ECHEC, 2 informations). Une ligne de contrôle en ECHEC lève avant `commit;` (SQLSTATE 55000) :
-- RIEN n'est appliqué. Indépendante du client (aucun PREREQUIS-CLIENT) : un lot dont des lignes
-- sont écartées est ACCEPTÉ (HTTP 201), tous les clients déjà en cache vident leur file comme
-- avant. Aucune donnée personnelle dans ce fichier ni dans son verdict : des nombres et des noms.
-- Banc : tests/sql/migration-telemetrie-classes.test.sh (PostgreSQL jetable, structure de production).
--
-- LE DÉFAUT. Depuis le 15/11 (migration_securite_lot4_telemetrie), `telemetry_events` est bornée
-- en lignes vivantes : 800 000 pour les visiteurs, 1 200 000 pour les comptes. Atteinte, la borne
-- refuse le lot ENTIER — erreurs, parcours et canari compris — et la purge ne retire rien avant
-- J-3 : la table reste fermée l'essentiel du temps, et tout signal de panne meurt avec le reste.
-- MESURÉ EN PRODUCTION au canal ① (lecture seule, 21/11 à 08:30 UTC ; le trafic y est surtout le
-- nôtre, 73,8 % d'appareils d'équipe : des ordres de grandeur) :
--   · 14 760 lignes, soit 1,8 % de la borne des visiteurs ; 43 Mo index compris ;
--   · 10,5 % de lignes « protégées » (définition ci-dessous), 84,5 % dans la classe courte
--     (perf, click, action, lifecycle non protégés), dont les `perf` seules : 60 % du flux d'un jour ;
--   · 60,1 % de la table (8 867 lignes) est de la classe courte ET a plus de 26 heures : aucun
--     lecteur ne les relit (Sentinelle et audience : 24 h au plus ; la croissance est agrégée),
--     SAUF la médiane du flux sur 9 jours du chien de garde GitHub (`fluxHeures`,
--     scripts/veille-production.mjs), dont le critère « journée ouvrée quasi vide » cesse de jouer
--     dès l'application — jamais une fausse alerte, une alerte en moins : voir la fiche, limite 9.
--
-- CE QUI CHANGE (et rien d'autre) :
--  ① `telemetrie_protegee(type, action, status, severity, http_status, correlation_id)` : UNE
--     définition de ce qui ne s'écarte ni ne se purge tôt — les types que le client n'échantillonne
--     jamais (error, connectivity, flow, link, rt_recv), les preuves (push, release), les sessions
--     (lues par la croissance), toute ligne corrélée (elle voyage avec son flow), tout échec
--     (statut error, HTTP ≥ 400, gravité warn et au-delà), l'inscription (acq_signup) et le
--     canari. Même contrat que `_estPrioritaire` (js/telemetry.js) et que le prédicat d'échec de
--     la purge du 15/11. Lue par la borne ② ET par la purge ③.
--  ② `zz_classe_bornee` (BEFORE INSERT, PAR LIGNE, le DERNIER : la ligne a d'abord subi la taille,
--     les 120 lignes par lot, l'identité et la barrière de suppression). Il ÉCARTE la ligne
--     (RETURN NULL), il ne refuse pas le lot — un lot mêlé garde ses lignes critiques :
--       · palier 1, au-delà de 60 % de la borne du rôle (480 000 / 720 000) : les `perf` non
--         protégées ne sont plus écrites. Aucun lecteur n'apparie une perf à autre chose ;
--       · palier 2, au-delà de 90 % (720 000 / 1 080 000) : seul le protégé est écrit ;
--       · 100 % : le refus du lot entier (`aa_table_bornee`, inchangé).
--     Les seuils sont des ARGUMENTS du déclencheur, comme ceux de `aa_table_bornee` : une seule
--     source, que ④ relit. La clé de service et les tâches planifiées ne sont jamais délestées.
--     Seules les lignes ÉCRITES comptent au débit (`trg_debit_lot` compte la table de transition).
--  ③ `purge_telemetrie_breve()`, chaque heure à :52 : les perf, click, action et lifecycle NON
--     protégés de plus de 26 heures (24 h de fenêtre des lecteurs + 2 h de marge) partent, par
--     lots de 5 000. Elle AGRÈGE D'ABORD les deux jours qu'elle entame (`agreger_croissance`) et
--     ne supprime que dans ces deux jours : la règle du 15/11 — jamais une ligne ne part sans
--     avoir été comptée — tient par construction ; ce qui est plus vieux reste à la purge
--     quotidienne. Le budget de 45 s ne borne que les suppressions, et un lot part toujours.
--     Cette migration N'APPELLE PAS la purge : le premier passage est celui de la tâche.
--  ④ `telemetrie_remplissage()` (clé de service seule) : lignes vivantes, estimation du
--     catalogue, bornes et seuils relus des deux déclencheurs, taille. En temps constant — le
--     pilotage n'a plus à compter la table (fonction `pilotage`, `lireRemplissage`).
-- NON TOUCHÉS, et le verdict le vérifie : `aa_table_bornee` / `telemetrie_bornee('800000','1200000')`,
-- les déclencheurs de débit et d'identité, `purge_telemetrie_paliers`, `purge_telemetrie_rattrapage`,
-- `telemetrie_purge_etat`, `agreger_croissance`.
--
-- LIMITES (détail : docs/journal/telemetrie-pilotage-sentinelle.md, fiche du 2026-11-21) :
--   · le délestage est SILENCIEUX côté client (201) : pendant qu'il joue, audience et comptages
--     pondérés sous-estiment ; l'écran du pilotage le dit, aucun compteur ne dit combien ;
--   · la classe n'est pas une frontière de sécurité : un flot de lignes « error » forgées remplit
--     la table jusqu'à sa borne comme avant — ce qui change, c'est que cela se voit et sonne ;
--   · borne et classe jugent sur les statistiques du serveur, qui repartent de zéro après un
--     arrêt brutal jusqu'au prochain passage de l'autovacuum.
--
-- RETOUR ARRIÈRE (éditeur SQL). Rien d'autre à restaurer : le pilotage retombe seul sur un compte.
--| begin;
--| select cron.unschedule('purge_telemetrie_breve');
--| drop trigger if exists zz_classe_bornee on public.telemetry_events;
--| drop function if exists public.telemetrie_classe_bornee();
--| drop function if exists public.purge_telemetrie_breve();
--| drop function if exists public.telemetrie_remplissage();
--| drop function if exists public.telemetrie_protegee(text, text, text, text, integer, text);
--| notify pgrst, 'reload schema';
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- ── GARDE : cette migration se pose sur l'état du 15/11, pas sur autre chose ────────────────────
do $g$ begin
  if to_regclass('public.telemetry_events') is null
     or to_regclass('public.telemetrie_purge_etat') is null
     or to_regprocedure('public.telemetrie_bornee()') is null
     or to_regprocedure('public.telemetrie_purger_lots(timestamptz,timestamptz,interval)') is null
     or to_regprocedure('public.agreger_croissance(date)') is null then
    raise exception 'état du 2026-11-15 absent (telemetrie_bornee, telemetrie_purger_lots, telemetrie_purge_etat, agreger_croissance) : appliquer d''abord migration_securite_lot4_telemetrie_2026-11-15.sql'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
                  where t.tgrelid = 'public.telemetry_events'::regclass and not t.tgisinternal
                    and t.tgname = 'aa_table_bornee' and t.tgenabled = 'O' and t.tgnargs = 2
                    and t.tgfoid = 'public.telemetrie_bornee()'::regprocedure) then
    raise exception 'aa_table_bornee n''est pas la borne à deux seuils du 2026-11-15 : application refusée'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if (select count(*) from cron.job j
       where j.jobname in ('agreger_croissance', 'purge_telemetrie_paliers', 'purge_telemetrie_rattrapage')) <> 3 then
    raise exception 'planification absente (agreger_croissance, purge_telemetrie_paliers, purge_telemetrie_rattrapage) : sans elles, rien n''agrège ni ne purge au-delà des deux jours de la purge courte'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $g$;

-- ── ① Ce qui ne s'écarte ni ne se purge tôt : UNE définition ────────────────────────────────────
create or replace function public.telemetrie_protegee(
  p_type text, p_action text, p_status text, p_severity text, p_http integer, p_correlation text)
returns boolean
language sql immutable set search_path = '' as $fn$
  select coalesce(p_type, '') in ('error', 'connectivity', 'flow', 'link', 'rt_recv', 'push', 'release', 'session')
      or coalesce(p_correlation, '') <> ''
      or coalesce(p_status, '') = 'error'
      or coalesce(p_http, 0) >= 400
      or coalesce(p_severity, '') in ('warn', 'warning', 'error', 'fatal', 'critical')
      or coalesce(p_action, '') in ('acq_signup', 'sentinel_observation_canary')
$fn$;
revoke all on function public.telemetrie_protegee(text, text, text, text, integer, text) from public, anon, authenticated;

-- ── ③ La purge courte : agréger, PUIS supprimer, dans les deux jours agrégés seulement ──────────
create or replace function public.purge_telemetrie_breve() returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  borne timestamptz := pg_catalog.now() - interval '26 hours';
  jour date := (borne at time zone 'UTC')::date;
  plancher timestamptz := ((jour - 1)::timestamp at time zone 'UTC');
  n integer := 0;
  k integer;
  lot constant integer := 5000;
  debut timestamptz;
begin
  -- Agréger AVANT de purger : jamais une ligne ne part sans avoir été comptée. Si l'agrégation
  -- lève, rien n'est supprimé (la table se remplit, et le pilotage le montre).
  perform public.agreger_croissance(jour - 1);
  perform public.agreger_croissance(jour);
  -- Le budget ne borne QUE les suppressions : il démarre après les agrégations, et la sortie est
  -- jugée APRÈS le lot — un passage retire toujours au moins un lot, quelle qu'ait été leur durée.
  debut := pg_catalog.clock_timestamp();
  loop
    delete from public.telemetry_events t
     where t.ctid = any (array(
       select x.ctid from public.telemetry_events x
        where x.received_at >= plancher and x.received_at < borne
          and x.type in ('perf', 'click', 'action', 'lifecycle')
          and not public.telemetrie_protegee(x.type, x.action, x.status, x.severity, x.http_status, x.correlation_id)
        order by x.received_at
        limit lot));
    get diagnostics k = row_count; n := n + k;
    exit when k < lot or pg_catalog.clock_timestamp() - debut > interval '45 seconds';
  end loop;
  return n;
end $fn$;
revoke all on function public.purge_telemetrie_breve() from public, anon, authenticated;
grant execute on function public.purge_telemetrie_breve() to service_role;

do $c$ begin
  perform cron.schedule('purge_telemetrie_breve', '52 * * * *', $q$select public.purge_telemetrie_breve()$q$);
end $c$;

-- ── ④ Le remplissage, en temps constant ─────────────────────────────────────────────────────────
-- Les seuils sont RELUS des arguments des deux déclencheurs (une seule source). Un argument qui
-- n'est pas un entier rend NULL : le pilotage ignore alors les classes, il ne lit pas une erreur.
-- Pas de `min(received_at)` : après une purge, l'extrémité ancienne de l'index porte des entrées
-- mortes, et la lecture cesserait d'être en temps constant.
create or replace function public.telemetrie_remplissage() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  with d as (
    select t.tgname, pg_catalog.string_to_array(pg_catalog.encode(t.tgargs, 'escape'), '\000') as a
      from pg_catalog.pg_trigger t
     where t.tgrelid = 'public.telemetry_events'::pg_catalog.regclass
       and not t.tgisinternal and t.tgenabled = 'O'
       and t.tgname in ('aa_table_bornee', 'zz_classe_bornee')
  ), s as (
    select max(case when d.tgname = 'aa_table_bornee' and d.a[1] ~ '^[0-9]{1,15}$' then d.a[1]::bigint end) as borne_visiteurs,
           max(case when d.tgname = 'aa_table_bornee' and d.a[2] ~ '^[0-9]{1,15}$' then d.a[2]::bigint end) as borne_comptes,
           max(case when d.tgname = 'zz_classe_bornee' and d.a[1] ~ '^[0-9]{1,15}$' then d.a[1]::bigint end) as confort_visiteurs,
           max(case when d.tgname = 'zz_classe_bornee' and d.a[2] ~ '^[0-9]{1,15}$' then d.a[2]::bigint end) as confort_comptes,
           max(case when d.tgname = 'zz_classe_bornee' and d.a[3] ~ '^[0-9]{1,15}$' then d.a[3]::bigint end) as reserve_visiteurs,
           max(case when d.tgname = 'zz_classe_bornee' and d.a[4] ~ '^[0-9]{1,15}$' then d.a[4]::bigint end) as reserve_comptes
      from d
  )
  select pg_catalog.jsonb_build_object(
    'vivantes', pg_catalog.pg_stat_get_live_tuples('public.telemetry_events'::pg_catalog.regclass),
    'estimees', (select greatest(c.reltuples, 0)::bigint from pg_catalog.pg_class c
                  where c.oid = 'public.telemetry_events'::pg_catalog.regclass),
    'borne_visiteurs', s.borne_visiteurs, 'borne_comptes', s.borne_comptes,
    'confort_visiteurs', s.confort_visiteurs, 'confort_comptes', s.confort_comptes,
    'reserve_visiteurs', s.reserve_visiteurs, 'reserve_comptes', s.reserve_comptes,
    'octets', pg_catalog.pg_total_relation_size('public.telemetry_events'::pg_catalog.regclass))
    from s
$fn$;
revoke all on function public.telemetrie_remplissage() from public, anon, authenticated;
grant execute on function public.telemetrie_remplissage() to service_role;

-- ── Information du verdict, relevée AVANT de verrouiller la table (le déclencheur vient après) ──
create temp table passio_tc_info on commit drop as
select (select count(*) from public.telemetry_events x
         where x.received_at >= ((((pg_catalog.now() - interval '26 hours') at time zone 'UTC')::date - 1)::timestamp at time zone 'UTC')
           and x.received_at < pg_catalog.now() - interval '26 hours'
           and x.type in ('perf', 'click', 'action', 'lifecycle')
           and not public.telemetrie_protegee(x.type, x.action, x.status, x.severity, x.http_status, x.correlation_id)) as premier_passage;

-- ── ② La borne par classe : écarter la ligne, jamais le lot ─────────────────────────────────────
create or replace function public.telemetrie_classe_bornee() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  r text := pg_catalog.current_setting('role', true);
  vivantes bigint;
  confort bigint;
  reserve bigint;
begin
  -- La clé de service (fonctions Edge, canari de secours) et les tâches planifiées : jamais délestées.
  if r is null or r not in ('anon', 'authenticated') then return new; end if;
  vivantes := pg_catalog.pg_stat_get_live_tuples(tg_relid);
  if r = 'anon' then confort := tg_argv[0]::bigint; reserve := tg_argv[2]::bigint;
  else confort := tg_argv[1]::bigint; reserve := tg_argv[3]::bigint;
  end if;
  if vivantes <= confort then return new; end if;
  if public.telemetrie_protegee(new.type, new.action, new.status, new.severity, new.http_status, new.correlation_id) then
    return new;
  end if;
  -- Palier 2 : tout le non-protégé. Palier 1 : les mesures de performance seulement — les
  -- battements (`lifecycle`) restent, ils font le compte des comptes connectés.
  if vivantes > reserve or coalesce(new.type, '') = 'perf' then return null; end if;
  return new;
end $fn$;
revoke all on function public.telemetrie_classe_bornee() from public, anon, authenticated;

drop trigger if exists zz_classe_bornee on public.telemetry_events;
create trigger zz_classe_bornee before insert on public.telemetry_events
  for each row execute function public.telemetrie_classe_bornee('480000', '720000', '720000', '1080000');

-- La fonction neuve n'est visible de PostgREST qu'après rechargement de son cache de schéma.
notify pgrst, 'reload schema';

-- ── LE TABLEAU, relevé UNE fois (table temporaire détruite au commit), lu par le garde-fou et ──
-- par le verdict. `bloquant` : les lignes 1 à 8 ; les lignes 9 et 10 sont des informations.
create temp table passio_tc_verdict on commit drop as
with dec as (
  select t.tgname::text as nom, t.tgtype::integer as typ, t.tgenabled::text as actif, t.tgnargs::integer as nargs,
         p.proname::text as fonction, pg_catalog.string_to_array(pg_catalog.encode(t.tgargs, 'escape'), '\000') as a
    from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.telemetry_events'::regclass and not t.tgisinternal
), r as (select public.telemetrie_remplissage() as j),
taches as (select j.jobname, j.schedule, j.command, coalesce(j.active, true) as active from cron.job j)
select 1 as n, true as bloquant,
       'zz_classe_bornee : posé, actif, BEFORE INSERT par ligne, 4 seuils, et DERNIER des déclencheurs par ligne avant insertion (une ligne écartée a d''abord subi tous les refus)'::text as controle,
       case when exists (select 1 from dec d where d.nom = 'zz_classe_bornee' and d.typ = 7 and d.actif = 'O' and d.nargs = 4 and d.fonction = 'telemetrie_classe_bornee')
             and not exists (select 1 from dec d where (d.typ & 71) = 7 and d.nom collate "C" > 'zz_classe_bornee' collate "C")
            then 'OK' else 'ECHEC — ' || coalesce((select string_agg(d.nom || ':' || d.typ, ',' order by d.nom collate "C") from dec d where (d.typ & 71) = 7), 'aucun déclencheur') end as valeur
union all select 2, true,
       'aa_table_bornee : inchangé — telemetrie_bornee(''800000'', ''1200000''), par instruction, actif',
       case when exists (select 1 from dec d where d.nom = 'aa_table_bornee' and d.typ = 6 and d.actif = 'O' and d.nargs = 2
                           and d.fonction = 'telemetrie_bornee' and d.a[1] = '800000' and d.a[2] = '1200000')
            then 'OK' else 'ECHEC' end
union all select 3, true,
       'seuils ordonnés par rôle : confort < réserve ≤ borne (visiteurs 480 000 < 720 000 ≤ 800 000 ; comptes 720 000 < 1 080 000 ≤ 1 200 000)',
       (select case when (r.j->>'confort_visiteurs')::bigint < (r.j->>'reserve_visiteurs')::bigint
                     and (r.j->>'reserve_visiteurs')::bigint <= (r.j->>'borne_visiteurs')::bigint
                     and (r.j->>'confort_comptes')::bigint < (r.j->>'reserve_comptes')::bigint
                     and (r.j->>'reserve_comptes')::bigint <= (r.j->>'borne_comptes')::bigint
                    then 'OK' else 'ECHEC — ' || r.j::text end from r)
union all select 4, true,
       'telemetrie_protegee, éprouvée par appels directs : erreur, canari, session, inscription, HTTP 500, ligne corrélée, perf et clic lents, accusé de push = protégés ; perf, action, clic, navigation, battement ordinaires = non',
       case when public.telemetrie_protegee('error', 'js_error', null, 'error', null, null)
             and public.telemetrie_protegee('lifecycle', 'sentinel_observation_canary', 'ok', 'info', null, null)
             and public.telemetrie_protegee('session', 'start', null, 'info', null, null)
             and public.telemetrie_protegee('action', 'acq_signup', null, 'info', null, null)
             and public.telemetrie_protegee('api', 'GET x', null, 'info', 500, null)
             and public.telemetrie_protegee('api', 'GET x', 'ok', 'info', 200, 'f_1')
             and public.telemetrie_protegee('perf', 'inp', null, 'warn', null, null)
             and public.telemetrie_protegee('click', 'btn', null, 'warning', null, null)
             and public.telemetrie_protegee('action', 'x', 'error', 'info', null, null)
             and public.telemetrie_protegee('push', 'recu', null, 'info', null, null)
             and public.telemetrie_protegee('release', 'version_skew', null, 'info', null, null)
             and public.telemetrie_protegee('connectivity', 'offline', null, 'info', null, null)
             and public.telemetrie_protegee('flow', 'step', null, 'info', null, null)
             and public.telemetrie_protegee('link', 'link_open', null, 'info', null, null)
             and public.telemetrie_protegee('rt_recv', 'x', null, 'info', null, null)
             and public.telemetrie_protegee('perf', 'lcp', null, 'info', null, null) is false
             and public.telemetrie_protegee('action', 'ui_open', 'ok', 'info', 200, '') is false
             and public.telemetrie_protegee('click', 'btn', null, 'info', null, null) is false
             and public.telemetrie_protegee('nav', 'feed', null, 'info', null, null) is false
             and public.telemetrie_protegee('lifecycle', 'heartbeat', null, 'info', null, null) is false
             and public.telemetrie_protegee('api', 'GET x', 'ok', 'info', 200, null) is false
             and public.telemetrie_protegee(null, null, null, null, null, null) is false
            then 'OK' else 'ECHEC' end
union all select 5, true,
       'débit et identité : trg_debit_avant, trg_debit_taille, trg_debit_lot et trg_telemetry_identite toujours posés et actifs',
       case when (select count(*) from dec d where d.actif = 'O' and (d.nom, d.typ, d.fonction) in (
                    ('trg_debit_avant', 6, 'telemetrie_debit_avant'), ('trg_debit_taille', 7, 'telemetrie_taille_lot'),
                    ('trg_debit_lot', 4, 'telemetrie_debit_lot'), ('trg_telemetry_identite', 7, 'telemetry_pose_identite'))) = 4
            then 'OK' else 'ECHEC' end
union all select 6, true,
       'tâches : purge_telemetrie_breve UNE fois, chaque heure à :52, active, à sa commande exacte ; agreger_croissance, purge_telemetrie_paliers, purge_telemetrie_rattrapage et purge_telemetrie_debit toujours là, actives',
       (select case when count(*) filter (where t.jobname = 'purge_telemetrie_breve' and t.schedule = '52 * * * *' and t.active
                                               and t.command = 'select public.purge_telemetrie_breve()') = 1
                     and count(*) filter (where t.jobname = 'purge_telemetrie_breve') = 1
                     and count(*) filter (where t.active and t.jobname in ('agreger_croissance', 'purge_telemetrie_paliers', 'purge_telemetrie_rattrapage', 'purge_telemetrie_debit')) = 4
                    then 'OK' else 'ECHEC — ' || coalesce(string_agg(t.jobname || ' [' || t.schedule || ']', ', ' order by t.jobname)
                                                           filter (where t.jobname like 'purge_telemetrie%' or t.jobname = 'agreger_croissance'), 'aucune tâche') end
          from taches t)
union all select 7, true,
       'droits : aucune des quatre fonctions n''est exécutable par PUBLIC, anon ni authenticated ; telemetrie_remplissage et purge_telemetrie_breve le sont par service_role',
       case when not exists (
               select 1 from pg_catalog.pg_proc p cross join (values ('anon'), ('authenticated')) as c(role)
                where p.oid in ('public.telemetrie_protegee(text,text,text,text,integer,text)'::regprocedure, 'public.telemetrie_classe_bornee()'::regprocedure,
                                'public.purge_telemetrie_breve()'::regprocedure, 'public.telemetrie_remplissage()'::regprocedure)
                  and (has_function_privilege(c.role, p.oid, 'EXECUTE') or p.proacl is null
                       or exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0)))
             and has_function_privilege('service_role', 'public.telemetrie_remplissage()', 'EXECUTE')
             and has_function_privilege('service_role', 'public.purge_telemetrie_breve()', 'EXECUTE')
            then 'OK' else 'ECHEC' end
union all select 8, true,
       'telemetrie_remplissage() : rend les deux bornes, les quatre seuils, les lignes vivantes, l''estimation et la taille',
       (select case when (r.j->>'borne_visiteurs', r.j->>'borne_comptes', r.j->>'confort_visiteurs', r.j->>'confort_comptes', r.j->>'reserve_visiteurs', r.j->>'reserve_comptes')
                         = ('800000', '1200000', '480000', '720000', '720000', '1080000')
                     and (r.j->>'vivantes')::bigint >= 0 and (r.j->>'estimees')::bigint >= 0 and (r.j->>'octets')::bigint >= 0
                    then 'OK' else 'ECHEC — ' || r.j::text end from r)
union all select 9, false,
       'information — lignes vivantes (statistiques du serveur), estimation du catalogue, taille',
       (select (r.j->>'vivantes') || ' vivantes · ' || (r.j->>'estimees') || ' estimées · '
               || pg_catalog.pg_size_pretty((r.j->>'octets')::bigint) from r)
union all select 10, false,
       'information — ce que le premier passage de :52 retirera (classe courte de plus de 26 h, dans les deux jours agrégés)',
       (select i.premier_passage::text || ' ligne(s)' from pg_temp.passio_tc_info i);

-- ── FERMÉ SUR ÉCHEC : une ligne de contrôle en ECHEC annule TOUT ────────────────────────────────
do $$
declare
  numeros text;
  details text;
begin
  select string_agg(c.n::text, ',' order by c.n), string_agg(c.n || '. ' || c.controle || ' → ' || coalesce(c.valeur, 'NULL'), ' ; ' order by c.n)
    into numeros, details
    from pg_temp.passio_tc_verdict c
   where c.bloquant and c.valeur is distinct from 'OK';
  if numeros is not null then
    raise exception 'classes de télémétrie : la base n''est pas celle que cette migration suppose — RIEN n''est appliqué. Lignes en échec : %', numeros
      using errcode = 'object_not_in_prerequisite_state', detail = details;
  end if;
end $$;

-- ── Verdict ──
select controle, valeur from pg_temp.passio_tc_verdict order by n;

commit;
