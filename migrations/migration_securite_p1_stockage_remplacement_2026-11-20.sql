-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 (suite du 2026-11-20) — REMPLACER UN FICHIER : TAILLE NOUVELLE ET NOMBRE D'OPÉRATIONS
--
-- POURQUOI : la revue par un second modèle de la PR #986 a trouvé deux trous dans
-- `passio_media_update_quota` (migration_securite_p1_debit_maj_2026-11-20.sql) :
--   1. la policy appelle `quota_stockage_maj_ok()` sans argument. Sa lecture de `storage.objects`
--      voit l'état d'AVANT l'UPDATE : remplacer un petit objet par un gros n'était pas mesuré sur
--      la taille nouvelle (dépassement borné par la limite de taille du seau, mais réel) ;
--   2. « 120 objets modifiés par heure » comptait des objets DISTINCTS récents (`updated_at`),
--      pas des opérations : remplacer mille fois le même objet laissait le compteur à 1.
--
-- CE QUI CHANGE :
--   (a) `stockage_remplacement_borne()`, déclencheur BEFORE UPDATE sur `storage.objects`, ne joue
--       que pour un rôle client (`authenticated`/`anon`), avec un compte, quand le CONTENU change
--       (`metadata` différente : un remplacement change l'eTag et la taille ; la lecture d'un objet
--       ne change pas `metadata`). Archiver ou marquer une suppression SANS toucher `metadata` reste
--       libre ; poser un marqueur ne dispense JAMAIS une réécriture de `metadata` (revue second modèle) :
--         · nombre : `debit_compter('storage_objects:maj', <compte>, 20)` — un compteur ATOMIQUE
--           (insert … on conflict) : 20 par minute, 1 200 par jour (300 la première semaine). Il
--           remplace « 120 objets distincts par heure », qui ne comptait pas les opérations ;
--         · taille : verrou transactionnel par compte, puis total des AUTRES objets du compte
--           + taille NOUVELLE ≤ 2 Gio (même plafond que `quota_stockage_ok`).
--   (b) `quota_stockage_maj_ok()` garde le quota d'avant (état courant) et perd son compteur
--       d'objets distincts, remplacé par (a).
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| drop trigger if exists aa_stockage_remplacement_borne on storage.objects;
--| drop function if exists public.stockage_remplacement_borne();
--| create or replace function public.quota_stockage_maj_ok() returns boolean
--|  language sql stable security definer set search_path = '' as $fn$
--|   select public.quota_stockage_ok()
--|      and (select count(*) from storage.objects o
--|            where o.owner = (select auth.uid()) and o.updated_at > now() - interval '1 hour') < 120
--| $fn$;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$ begin
 if to_regprocedure('public.quota_stockage_maj_ok()') is null
 or to_regprocedure('public.debit_compter(text,text,integer)') is null then
  raise exception 'la migration debit_maj du 2026-11-20 est requise avant celle-ci';
 end if;
 if (select prosrc from pg_proc where oid='public.debit_compter(text,text,integer)'::regprocedure) not like '%debit_jour_compter%' then
  raise exception 'debit_compter different du catalogue relu';
 end if;
end $g$;

create or replace function public.stockage_remplacement_borne() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  moi uuid := auth.uid();
  autres bigint;
  taille bigint;
begin
  if moi is null
     or pg_catalog.current_setting('role', true) not in ('anon', 'authenticated')
     or new.metadata is not distinct from old.metadata then
    return new;
  end if;
  perform public.debit_compter('storage_objects:maj', moi::text, 20);
  begin
    taille := nullif(new.metadata->>'size', '')::bigint;
  exception when others then
    taille := null;
  end;
  if taille is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('passio_quota_stockage:' || moi::text, 0));
    select coalesce(sum((o.metadata->>'size')::bigint), 0) into autres
      from storage.objects o
     where o.owner = moi and o.id <> new.id;
    if autres + taille > 2147483648 then
      raise exception 'quota de stockage atteint (2 Gio par compte)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$fn$;
revoke all on function public.stockage_remplacement_borne() from public, anon, authenticated;

drop trigger if exists aa_stockage_remplacement_borne on storage.objects;
create trigger aa_stockage_remplacement_borne before update on storage.objects
 for each row execute function public.stockage_remplacement_borne();

create or replace function public.quota_stockage_maj_ok() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select public.quota_stockage_ok()
$fn$;
revoke all on function public.quota_stockage_maj_ok() from public, anon;
grant execute on function public.quota_stockage_maj_ok() to authenticated, service_role;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'remplacement : déclencheur posé avant chaque UPDATE de storage.objects' as controle,
       case when exists (select 1 from pg_trigger t
                          where t.tgrelid = 'storage.objects'::regclass and t.tgname = 'aa_stockage_remplacement_borne'
                            and not t.tgisinternal and t.tgenabled = 'O'
                            and t.tgfoid = 'public.stockage_remplacement_borne()'::regprocedure)
            then 'OK' else 'ECHEC' end as valeur
union all select 'remplacement : compteur atomique par compte (debit_compter) et taille nouvelle mesurée',
       case when (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) like '%debit_compter(''storage_objects:maj''%'
             and (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) like '%o.id <> new.id%'
             and (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) like '%pg_advisory_xact_lock%'
            then 'OK' else 'ECHEC' end
union all select 'remplacement : fonction fermée aux rôles clients',
       case when not has_function_privilege('authenticated','public.stockage_remplacement_borne()','execute')
             and not has_function_privilege('anon','public.stockage_remplacement_borne()','execute')
            then 'OK' else 'ECHEC' end
union all select 'quota : plus de compteur d''objets distincts dans la policy',
       case when (select prosrc from pg_proc where oid='public.quota_stockage_maj_ok()'::regprocedure) not like '%updated_at%'
            then 'OK' else 'ECHEC' end;
commit;
