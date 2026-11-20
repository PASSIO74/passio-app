-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 2026-11-20 — D10-02 : LES RÉÉCRITURES ET LES REMPLACEMENTS DE FICHIERS ONT UN PLAFOND
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Se joue APRÈS
-- migration_securite_lot4_plafonds_2026-11-15.sql (plafonds du jour de `debit_compter`).
-- Aucun PREREQUIS-CLIENT : aucune réponse ne change sous les plafonds.
-- Banc : tests/sql/migration-securite-p1-2026-11-20.test.sh.
--
-- CE QUI MANQUAIT (contre-vérification du 2026-11-20) :
--   (a) `posts` (colonne `content`), `post_comments`, `events` et `user_state` acceptent des UPDATE
--       sans aucun compteur de NOMBRE : le budget d'octets du jour ne compte que l'écart de taille,
--       et 160 réécritures à taille constante d'une publication sont passées sur le staging.
--   (b) La policy UPDATE de `storage.objects` (`passio_media_update_cloisonne`) n'appelle pas
--       `quota_stockage_ok()` : remplacer un petit fichier par un gros contournait le total de
--       2 Gio par compte (dépôt de 1 Kio, puis remplacement par 1 Mio, accepté).
--
-- CE QUI CHANGE :
--   (a) `trg_debit_maj` (la fonction existante `debit_maj_par_compte`, déjà posée sur `profiles`,
--       `video_lives` et `user_passions`) sur ces quatre tables, avant chaque UPDATE. Par minute,
--       puis × 60 par jour (× 15 la première semaine), par `debit_compter` :
--         posts 10/min (600/jour) · post_comments 30/min (1 800/jour) · events 15/min (900/jour)
--         · user_state 120/min (7 200/jour ; le client n'écrit qu'après 2,5 s de calme).
--       Seuls les rôles `anon`/`authenticated` sont comptés (service et tâches : rien ne change).
--   (b) Policy RESTRICTIVE `passio_media_update_quota` : un remplacement doit tenir dans le quota
--       (`quota_stockage_ok()`, 2 Gio et 120 dépôts par heure) ET dans 120 objets modifiés par heure
--       (`updated_at`, posé par Storage à chaque UPDATE). Archiver ou marquer une suppression reste
--       permis au-delà : un compte plein doit pouvoir se vider.
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| drop trigger if exists trg_debit_maj on public.posts;
--| drop trigger if exists trg_debit_maj on public.post_comments;
--| drop trigger if exists trg_debit_maj on public.events;
--| drop trigger if exists trg_debit_maj on public.user_state;
--| drop policy if exists passio_media_update_quota on storage.objects;
--| drop function if exists public.quota_stockage_maj_ok();
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$ begin
 if to_regprocedure('public.debit_maj_par_compte()') is null
 or to_regprocedure('public.debit_compter(text,text,integer)') is null
 or to_regprocedure('public.quota_stockage_ok()') is null then
  raise exception 'les lots de securite du 2026-11-06 et du 2026-11-15 sont requis avant celui-ci';
 end if;
 -- La fonction lit son plafond par minute dans son premier argument.
 if (select prosrc from pg_proc where oid='public.debit_maj_par_compte()'::regprocedure) not like '%tg_argv[0]%'
 or (select prosrc from pg_proc where oid='public.debit_compter(text,text,integer)'::regprocedure) not like '%debit_jour_compter%' then
  raise exception 'debit_maj_par_compte ou debit_compter different du catalogue relu';
 end if;
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='passio_media_update_cloisonne' and cmd='UPDATE') then
  raise exception 'policy passio_media_update_cloisonne absente : relire le catalogue';
 end if;
end $g$;

-- ── (a) Un plafond de NOMBRE sur les réécritures ───────────────────────────────────────────────
drop trigger if exists trg_debit_maj on public.posts;
create trigger trg_debit_maj before update on public.posts
 for each row execute function public.debit_maj_par_compte('10');
drop trigger if exists trg_debit_maj on public.post_comments;
create trigger trg_debit_maj before update on public.post_comments
 for each row execute function public.debit_maj_par_compte('30');
drop trigger if exists trg_debit_maj on public.events;
create trigger trg_debit_maj before update on public.events
 for each row execute function public.debit_maj_par_compte('15');
drop trigger if exists trg_debit_maj on public.user_state;
create trigger trg_debit_maj before update on public.user_state
 for each row execute function public.debit_maj_par_compte('120');

-- ── (b) Un remplacement de fichier tient dans le quota ─────────────────────────────────────────
create or replace function public.quota_stockage_maj_ok() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select public.quota_stockage_ok()
     and (select count(*) from storage.objects o
           where o.owner = (select auth.uid()) and o.updated_at > now() - interval '1 hour') < 120
$fn$;
revoke all on function public.quota_stockage_maj_ok() from public, anon;
grant execute on function public.quota_stockage_maj_ok() to authenticated, service_role;

drop policy if exists passio_media_update_quota on storage.objects;
create policy passio_media_update_quota on storage.objects as restrictive for update to authenticated
 using (true)
 with check (archived_at is not null or coalesce(is_delete_marker, false) or public.quota_stockage_maj_ok());

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'réécritures : plafond de nombre sur posts, post_comments, events, user_state' as controle,
       case when (select count(*) from pg_trigger t
                   where t.tgname='trg_debit_maj' and not t.tgisinternal and t.tgenabled='O'
                     and t.tgfoid='public.debit_maj_par_compte()'::regprocedure
                     and t.tgtype=19
                     and t.tgrelid in ('public.posts'::regclass,'public.post_comments'::regclass,
                                       'public.events'::regclass,'public.user_state'::regclass)) = 4
            then 'OK' else 'ECHEC' end as valeur
union all select 'réécritures : plafond du jour via debit_compter (rôles clients)',
       case when (select prosrc from pg_proc where oid='public.debit_compter(text,text,integer)'::regprocedure) like '%debit_jour_compter%'
            then 'OK' else 'ECHEC' end
union all select 'stockage : un remplacement appelle le quota',
       case when exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                          and policyname='passio_media_update_quota' and permissive='RESTRICTIVE' and cmd='UPDATE'
                          and with_check like '%quota_stockage_maj_ok()%')
             and (select prosrc from pg_proc where oid='public.quota_stockage_maj_ok()'::regprocedure) like '%quota_stockage_ok()%'
            then 'OK' else 'ECHEC' end
union all select 'stockage : quota exécutable par les comptes, pas par anon',
       case when has_function_privilege('authenticated','public.quota_stockage_maj_ok()','execute')
             and not has_function_privilege('anon','public.quota_stockage_maj_ok()','execute') then 'OK' else 'ECHEC' end;

commit;
