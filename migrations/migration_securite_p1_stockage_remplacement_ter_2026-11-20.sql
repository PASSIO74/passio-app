-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 (suite du 2026-11-20) — LE PLAFOND DE REMPLACEMENT SUIT LE PROPRIÉTAIRE DE L'OBJET
--
-- POURQUOI : la version « bis » a été mesurée au staging par le banc à rôles réels (25 remplacements
-- acceptés sur 25, compteur vide), puis tracée ligne à ligne. Un remplacement, par x-upsert ou par
-- PUT, est bien un UPDATE de la même ligne, avec une nouvelle `version` et une nouvelle taille. Mais
-- l'écriture finale de l'API Storage ne porte AUCUN jeton : `auth.role()` y est vide, et le test
-- « rôle du jeton client » sautait tout. La RLS, elle, est éprouvée à part, dans une transaction
-- annulée : un compteur écrit là disparaît.
--
-- CE QUI CHANGE : le déclencheur compte le PROPRIÉTAIRE de l'objet (`new.owner`) dès que la version
-- ou la `metadata` change. Il ne s'efface que devant un jeton `service_role` explicite. Un dépôt par
-- la clé de service n'a pas de propriétaire et n'est donc jamais compté. Limite connue : une tâche
-- de maintenance qui réécrirait plus de 20 objets d'UN même propriétaire en une minute serait
-- freinée ; elle doit étaler son rythme. Le SQL du propriétaire de la base (session `postgres` :
-- migrations, éditeur SQL) n'est jamais compté.
--
-- RETOUR ARRIÈRE :
--| begin; drop trigger if exists aa_stockage_remplacement_borne on storage.objects; commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$ begin
 if to_regprocedure('public.stockage_remplacement_borne()') is null
 or to_regprocedure('auth.role()') is null
 or not exists (select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='aa_stockage_remplacement_borne') then
  raise exception 'migration_securite_p1_stockage_remplacement_bis_2026-11-20 requise avant celle-ci';
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
  if role_jeton = 'service_role'
     or session_user = 'postgres'
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
select 'remplacement : compté sur le propriétaire, même sans jeton (écriture finale de Storage)' as controle,
       case when (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) like '%role_jeton = ''service_role''%'
             and (select prosrc from pg_proc where oid='public.stockage_remplacement_borne()'::regprocedure) not like '%role_jeton not in%'
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
