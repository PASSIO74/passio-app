-- Studio : rattacher une sortie déjà créée au message « À faire ensemble » de son auteur.
-- Le client possède seulement UPDATE(content) sur posts. La RPC vérifie les deux objets
-- sous verrou et utilise exclusivement la colonne event_id déjà lue par le fil et l'album.
-- Retour arrière : les liens déjà confirmés restent lisibles.
--| begin;
--| drop function if exists public.relier_publication_sortie(text, text);
--| commit;

begin;

create or replace function public.relier_publication_sortie(p_post_id text, p_event_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fonction$
declare
  moi text := auth.uid()::text;
  lien text;
begin
  if moi is null or p_post_id is null or p_event_id is null
     or not coalesce(public.adult_access_allowed(), false)
     or public.suppression_de_mon_compte() then
    return false;
  end if;

  -- FOR SHARE bloque l'annulation et la suppression de la sortie pendant le rattachement.
  perform 1 from public.events e
    where e.id = p_event_id and e.author_id = moi and e.organizer_id = moi
      and e.status = 'active'
    for share;
  if not found then return false; end if;

  -- Deux onglets demandant des sorties différentes se départagent sur la même ligne.
  -- Un média natif peut avoir un shared_data de présentation sans être un repartage.
  select p.event_id into lien from public.posts p
    where p.id = p_post_id and p.author_id = moi and p.mood = 'irl'
      and p.is_reel is not true and p.shared_from_post_id is null
      and public.activite_de_partage(p.shared_data) is null
      and not public.post_masque(p.id)
    for update;
  if not found then return false; end if;
  if lien is not null then return lien = p_event_id; end if;

  update public.posts set event_id = p_event_id where id = p_post_id;
  return found;
end;
$fonction$;

revoke all on function public.relier_publication_sortie(text, text) from public, anon, authenticated, service_role;
grant execute on function public.relier_publication_sortie(text, text) to authenticated;

select 'rattachement du Studio réservé au compte connecté' as controle,
       case when pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                  and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
                  and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
                  and not pg_catalog.has_column_privilege('authenticated','public.posts','event_id','UPDATE')
                  and p.prosecdef and p.proconfig @> array['search_path=""']
            then 'OK' else 'ECHEC' end as valeur
  from pg_catalog.pg_proc p
 where p.oid = 'public.relier_publication_sortie(text,text)'::regprocedure;

commit;
