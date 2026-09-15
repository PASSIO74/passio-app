-- ═══════════════════════════════════════════════════════════════════════════
-- SUPPRESSION DE COMPTE — les médias d'un compte se relèvent par leur
-- PROPRIÉTAIRE, jamais par un chemin écrit dans un message (ASTRA-11 / ASTRA-12,
-- contre-revue Astra, 2026-09-15)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012), ou
-- `npm run migration:appliquer -- migrations/migration_objets_stockage_compte_2026-09-15.sql`.
-- UNE transaction, REJOUABLE, tableau de verdict en fin (5 lignes).
--
-- LE DÉFAUT. `delete-account` relevait les pièces jointes à purger dans le
-- CONTENU des messages du compte (`{ "url": ".../attachments/<conv>/<fichier>" }`)
-- puis les supprimait avec la clé service_role. Or ce contenu est écrit par le
-- client, librement : un message de A portant le chemin d'une pièce jointe de B
-- faisait supprimer l'objet de B — contre-épreuve d'Astra, `ok: true`. Et le
-- client supprimait ses messages AVANT d'appeler la fonction : la seconde
-- tentative ne relevait plus rien et le fichier restait (ASTRA-12).
--
-- LA RÈGLE. `storage.objects.owner` est posé par la plateforme Storage à
-- l'upload, à partir du JWT de l'appelant — c'est la seule autorité sur « à qui
-- appartient ce fichier ». Mesuré en production le 15/09 : 12 pièces jointes
-- sur 12 et 55 médias sur 55 portent leur `owner`. Cette fonction rend les
-- objets d'un compte, seaux `content` ET `attachments`, et la purge s'y fonde :
-- un chemin venu d'un message ne fait plus rien supprimer.
--
-- POURQUOI UNE FONCTION. Le schéma `storage` n'est pas exposé par PostgREST
-- (406 sur `Accept-Profile: storage`, mesuré sur le staging) et `storage.objects`
-- ne se supprime pas en SQL (`storage.protect_delete`) : le serveur LISTE ici,
-- puis supprime par l'API Storage, puis RELIT ici. Elle ne s'exécute qu'avec
-- la clé service_role : EXECUTE est retiré nommément à `anon` et
-- `authenticated` (les privilèges par défaut du projet le leur donnent à la
-- création, et `revoke … from public` ne les reprend pas — fiche « Créer une
-- passion »). Un compte ne peut donc pas énumérer les fichiers d'un autre.
--
-- RETOUR ARRIÈRE : `drop function public.objets_stockage_du_compte(uuid);` —
-- la fonction déployée retombe alors sur l'échec nommé « objets:rpc » et refuse
-- de supprimer le compte plutôt que de purger sans autorité (fail-closed).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.objets_stockage_du_compte(p_uid uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.owner = p_uid
     or o.owner_id = p_uid::text
  order by o.bucket_id, o.name
$$;

comment on function public.objets_stockage_du_compte(uuid) is
  'Objets Storage dont le compte est le PROPRIÉTAIRE (owner posé à l''upload). Service_role seulement : c''est l''autorité de purge de delete-account (ASTRA-11).';

revoke execute on function public.objets_stockage_du_compte(uuid) from public;
revoke execute on function public.objets_stockage_du_compte(uuid) from anon;
revoke execute on function public.objets_stockage_du_compte(uuid) from authenticated;
grant execute on function public.objets_stockage_du_compte(uuid) to service_role;

-- ── Verdict ────────────────────────────────────────────────────────────────
select '① fonction présente' as controle,
       case when to_regprocedure('public.objets_stockage_du_compte(uuid)') is not null then 'OK' else 'ECHEC' end as verdict
union all
select '② security definer, search_path vide',
       case when exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.objets_stockage_du_compte(uuid)')
                          and p.prosecdef and p.proconfig @> array['search_path=""']) then 'OK' else 'ECHEC' end
union all
select '③ anon ne l''exécute pas',
       case when not has_function_privilege('anon', 'public.objets_stockage_du_compte(uuid)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select '④ authenticated ne l''exécute pas',
       case when not has_function_privilege('authenticated', 'public.objets_stockage_du_compte(uuid)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select '⑤ service_role l''exécute',
       case when has_function_privilege('service_role', 'public.objets_stockage_du_compte(uuid)', 'EXECUTE') then 'OK' else 'ECHEC' end;

commit;
