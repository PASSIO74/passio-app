-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 (suite du 2026-11-20) — LE PLAFOND DE REMPLACEMENT SUIT LE JETON, PAS LE RÔLE SQL
--
-- POURQUOI : `migration_securite_p1_stockage_remplacement_2026-11-20.sql`, appliquée au staging,
-- n'a rien compté. Banc à rôles réels : un compte authentifié a remplacé 25 fois le même objet en
-- une minute, et les 25 remplacements ont été acceptés. Le compteur est resté vide. Cause : l'API
-- Storage
--   · éprouve la RLS dans une transaction ANNULÉE (un compteur écrit là disparaît avec elle) ;
--   · fait l'écriture finale (nouvelle `metadata`) sous son propre rôle, et non sous
--     `authenticated`. Le test `current_setting('role') in ('anon','authenticated')` sautait donc
--     tout. Le jeton de l'appelant, lui, reste posé (`request.jwt.claims`).
--
-- CE QUI CHANGE : `stockage_remplacement_borne()` décide sur le RÔLE DU JETON (`auth.role()`), plus
-- sur le rôle SQL. Il compte le propriétaire de l'objet (`new.owner`, sinon le sujet du jeton). Le
-- rôle de service (tâches de maintenance) et un appel sans jeton ne sont jamais comptés. Le reste
-- est inchangé : compteur atomique de 20 remplacements par minute, total des AUTRES objets + taille
-- NOUVELLE ≤ 2 Gio sous verrou par compte, aucune dispense quand `metadata` change.
--
-- RETOUR ARRIÈRE : réappliquer `migration_securite_p1_stockage_remplacement_2026-11-20.sql`, ou
--| begin; drop trigger if exists aa_stockage_remplacement_borne on storage.objects; commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$ begin
 if to_regprocedure('public.stockage_remplacement_borne()') is null
 or to_regprocedure('auth.role()') is null
 or not exists (select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='aa_stockage_remplacement_borne') then
  raise exception 'migration_securite_p1_stockage_remplacement_2026-11-20 requise avant celle-ci';
 end if;
end $g$;

create or replace function public.stockage_remplacement_borne() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  role_jeton text := coalesce(auth.role(), '');
  compte uuid := coalesce(new.owner, auth.uid());
  autres bigint;
  taille bigint;
begin
  if role_jeton not in ('anon', 'authenticated')
     or compte is null
     or (new.metadata is not distinct from old.metadata and new.version is not distinct from old.version) then
    return new;
  end if;
  perform public.debit_compter('storage_objects:maj', compte::text, 20);
  begin
    taille := nullif(new.metadata->>'size', '')::bigint;
  exception when others then
    taille := null;
  end;
  if taille is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('passio_quota_stockage:' || compte::text, 0));
    select coalesce(sum((o.metadata->>'size')::bigint), 0) into autres
      from storage.objects o
     where o.owner = compte and o.id <> new.id;
    if autres + taille > 2147483648 then
      raise exception 'quota de stockage atteint (2 Gio par compte)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$fn$;
revoke all on function public.stockage_remplacement_borne() from public, anon, authenticated;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'remplacement : décidé sur le rôle du jeton, pas sur le rôle SQL' as controle,
       case when (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) like '%auth.role()%'
             and (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) not like '%current_setting(''role''%'
            then 'OK' else 'ECHEC' end as valeur
union all select 'remplacement : propriétaire de l''objet compté, version ou metadata nouvelle',
       case when (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) like '%coalesce(new.owner, auth.uid())%'
             and (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) like '%new.version is not distinct from old.version%'
            then 'OK' else 'ECHEC' end
union all select 'remplacement : déclencheur actif et fonction fermée aux clients',
       case when exists (select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='aa_stockage_remplacement_borne' and tgenabled='O')
             and not has_function_privilege('authenticated','public.stockage_remplacement_borne()','execute')
            then 'OK' else 'ECHEC' end;
commit;
