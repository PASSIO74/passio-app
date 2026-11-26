-- Utilise les publications et les comptes de migration-fil-compteurs.test.sh.
set role authenticated;
do $test$
declare
  compte record;
  ids constant text[] := array['post_a','post_p','post_vide'];
  n integer;
begin
  for compte in select * from (values
    ('11111111-1111-1111-1111-111111111111', 3), -- propriétaire privé
    ('22222222-2222-2222-2222-222222222222', 1), -- abonné bloqué, conserve son like
    ('33333333-3333-3333-3333-333333333333', 3), -- abonné accepté
    ('44444444-4444-4444-4444-444444444444', 1), -- tiers avec son like
    ('55555555-5555-5555-5555-555555555555', 0)  -- tiers sans like sur le post privé
  ) as cas(uid, likes_prives) loop
    perform set_config('request.jwt.claim.sub', compte.uid, true);
    -- Deux oracles indépendants de la nouvelle fonction : lecture sous RLS et
    -- réponse du client existant. FULL JOIN détecte également toute ligne perdue.
    if exists (
      with direct as (
        select p.id, (select count(*) from public.post_likes l where l.post_id = p.id) as likes
          from unnest(ids) as p(id)
      )
      select 1 from direct d
        full join public.fil_likes_visibles(ids) f on f.post_id = d.id
        full join public.fil_compteurs(ids) ancien on ancien.post_id = d.id
       where f.likes is distinct from d.likes or ancien.likes is distinct from d.likes
    ) then raise exception 'compteurs différents pour %', compte.uid; end if;
    select likes into strict n from public.fil_likes_visibles(array['post_a']);
    if n <> compte.likes_prives then raise exception 'compteur privé inattendu pour %', compte.uid; end if;
  end loop;

  select likes into strict n from public.fil_likes_visibles(array['inconnu']);
  if n <> 0 then raise exception 'compteur inconnu'; end if;
  if exists (select from public.fil_likes_visibles(null)) or exists (select from public.fil_likes_visibles('{}'))
     or (select count(*) from public.fil_likes_visibles(array['post_p', null, 'post_p'])) <> 1
     or (select array_agg(post_id order by post_id) from public.fil_likes_visibles(array[['a','b'],['c','d']]))
        is distinct from array['a','b','c'] then
    raise exception 'borne, doublons ou valeurs nulles mal gérés';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select from public.fil_likes_visibles(ids)) then raise exception 'identité absente'; end if;
end $test$;
reset role;

set role anon;
do $test$
begin
  perform * from public.fil_likes_visibles(array['post_p']);
  raise exception 'un visiteur a pu exécuter la fonction';
exception when insufficient_privilege then null;
end $test$;
reset role;

-- Prouve que le compteur reste autonome sans les tables de commentaires/réactions.
-- Le renommage est annulé dans ce banc PostgreSQL jetable.
begin;
alter table public.post_comments rename to commentaires_hors_du_compteur;
alter table public.comment_interactions rename to reactions_hors_du_compteur;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $test$ begin
  if (select likes from public.fil_likes_visibles(array['post_p'])) is distinct from 2 then
    raise exception 'le compteur seul ne rend pas le total public';
  end if;
end $test$;
rollback;
