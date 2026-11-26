-- Le rafraîchissement des trois cartes visibles ne consomme que post_id et likes.
-- La lecture complète du fil conserve fil_compteurs et ses aperçus.
-- Retour arrière après repli du client :
--| begin;
--| drop function if exists public.fil_likes_visibles(text[]);
--| commit;
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_catalog;

-- Le DEFINER décide la visibilité une fois par publication. Il doit rendre
-- exactement ce que la lecture directe autorise, y compris mon propre « J'aime »
-- sur un post devenu invisible. Arrêter si la règle relue le 24/11 a changé.
do $g$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.post_likes'::regclass)
     or (select count(*) <> 1
             or not bool_and(policyname = 'Lecture selon visibilite du post'
                         and cmd = 'SELECT' and permissive = 'PERMISSIVE' and roles = array['public']::name[]
                         and qual is not distinct from '((user_id = (( SELECT auth.uid() AS uid))::text) OR post_is_visible(post_id))')
           from pg_policies where schemaname = 'public' and tablename = 'post_likes'
                             and cmd in ('SELECT', 'ALL')) then
    raise exception 'règles de lecture de post_likes différentes : contrôler la visibilité avant application';
  end if;
end $g$;

create or replace function public.fil_likes_visibles(_post_ids text[])
returns table(post_id text, likes integer)
language sql stable security definer set search_path = ''
as $fonction$
  with cibles as (
    -- LIMIT porte sur les premières entrées aplaties avant DISTINCT, même si
    -- l'appel contient des doublons, des valeurs nulles ou plusieurs dimensions.
    select distinct premiers.pid
      from (select unnest(_post_ids) as pid limit 3) premiers
     where premiers.pid is not null
  ),
  lecteur as materialized (
    select auth.uid()::text as uid
  )
  select c.pid,
         case when public.post_is_visible(c.pid) then
           (select count(*)::integer from public.post_likes l where l.post_id = c.pid)
         else
           (select count(*)::integer from public.post_likes l where l.post_id = c.pid and l.user_id = lecteur.uid)
         end
    from cibles c cross join lecteur
   where lecteur.uid is not null;
$fonction$;

revoke all on function public.fil_likes_visibles(text[]) from public, anon, authenticated, service_role;
grant execute on function public.fil_likes_visibles(text[]) to authenticated;

select 'fonction de comptage stable, search_path vide' as controle,
       case when (select p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']
                    from pg_proc p where p.oid = 'public.fil_likes_visibles(text[])'::regprocedure)
            then 'OK' else 'ECHEC' end as valeur
union all select 'lecture réservée aux comptes authentifiés',
       case when has_function_privilege('authenticated', 'public.fil_likes_visibles(text[])', 'execute')
             and not has_function_privilege('anon', 'public.fil_likes_visibles(text[])', 'execute')
             and not has_function_privilege('service_role', 'public.fil_likes_visibles(text[])', 'execute')
            then 'OK' else 'ECHEC' end;
commit;
