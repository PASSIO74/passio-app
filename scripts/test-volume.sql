-- VOLUME GO LOCAL — lancer avec node scripts/volume-go.mjs --plan, puis --executer.
-- Uniquement PostgreSQL natif jetable, TCP loopback, base passio_volume_go_<suffixe>.
-- Schéma courant SANS données (socle synthétique + migrations), jamais une archive client.
-- 100000 profils applicatifs publics, 100000 publications, 300000 likes, 200000 commentaires.
-- ZÉRO compte Auth créé, UNE connexion, aucune preuve de capacité Supabase hébergée.
-- Fixtures écrites par le propriétaire local ; lectures mesurées sous authenticated/RLS.
-- Les triggers et policies restent actifs. Tout refus est un échec, jamais contourné.
-- Plans SQL représentatifs du client ; ni PostgREST, ni réseau, ni rendu, ni concurrence.
-- Cas public uniforme : toutes les créations sont simultanées dans cette transaction.
-- Ce cas exerce aussi le tri secondaire id quand created_at est identique (rafale locale).
-- Trois répétitions minimum, caches déjà sollicités par la préparation/les assertions.
-- ROLLBACK annule les lignes, pas nécessairement statistiques, séquences ou espace disque :
-- cette base doit rester jetable. Le wrapper borne aussi la durée totale de psql.
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
\pset pager off
\if :{?volume_go_local}
\else
  \echo 'ECHEC : utiliser scripts/volume-go.mjs (paramètres locaux obligatoires)'
  \quit 3
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '3s';
set local idle_in_transaction_session_timeout = '10s';
set local row_security = on;
set local search_path = public, pg_catalog;
select set_config('volume_go.repetitions', :'repetitions', true) as preparation \gset

do $garde$
declare t record; requis record; presente boolean;
begin
  if inet_server_addr() is null or host(inet_server_addr()) not in ('127.0.0.1', '::1')
     or inet_client_addr() is null or host(inet_client_addr()) not in ('127.0.0.1', '::1')
     or current_database() !~ '^passio_volume_go_[a-z0-9_]{1,32}$' then
    raise exception 'VOLUME GO : cible TCP locale dédiée requise';
  end if;
  if current_setting('volume_go.repetitions') !~ '^[3-9]$' then
    raise exception 'VOLUME GO : 3 à 9 répétitions requises';
  end if;
  if exists (select 1 from pg_extension where extname in
       ('pg_net', 'http', 'dblink', 'postgres_fdw', 'plpython3u', 'plperlu'))
     or exists (select 1 from pg_foreign_server) then
    raise exception 'VOLUME GO : transports externes interdits sur ce banc local';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated'
                  and not rolsuper and not rolbypassrls and not rolcanlogin) then
    raise exception 'VOLUME GO : rôle client authenticated non privilégié requis';
  end if;
  if to_regprocedure('public.fil_compteurs(text[])') is null
     or to_regprocedure('auth.uid()') is null
     or not exists (select 1 from pg_attribute
                     where attrelid = 'public.posts'::regclass and attname = 'edited_at' and not attisdropped) then
    raise exception 'VOLUME GO : schéma applicatif courant incomplet';
  end if;
  if exists (select 1 from pg_class where oid in
      ('public.profiles'::regclass, 'public.posts'::regclass,
       'public.post_likes'::regclass, 'public.post_comments'::regclass)
       and (not relrowsecurity or pg_has_role('authenticated', relowner, 'USAGE'))) then
    raise exception 'VOLUME GO : RLS active et rôle client sans droits de propriétaire requis';
  end if;
  -- Index historiques déjà déclarés dans le dépôt, jamais des index inventés pour le banc.
  -- Nom, colonnes/ordre, prédicat, méthode et état sont vérifiés AVANT les insertions.
  for requis in select * from (values
    ('idx_posts_created_at', 'posts', array['created_at DESC'], ''),
    ('idx_posts_author', 'posts', array['author_id'], ''),
    ('idx_posts_passion', 'posts', array['passion_id'], ''),
    ('idx_posts_event', 'posts', array['event_id'], 'event_idisnotnull'),
    ('idx_comments_post', 'post_comments', array['post_id', 'created_at DESC'], ''),
    ('idx_post_comments_author', 'post_comments', array['author_id'], ''),
    ('idx_likes_post', 'post_likes', array['post_id'], ''),
    ('idx_profiles_passion', 'profiles', array['passion_id'], ''),
    ('idx_ci_comment', 'comment_interactions', array['comment_id'], ''),
    ('idx_ci_user_created', 'comment_interactions', array['user_id', 'created_at'], ''),
    ('idx_ci_post', 'comment_interactions', array['post_id'], '')
  ) r(nom, table_nom, colonnes, predicat)
  loop
    if not exists (
      select 1 from pg_index x join pg_class i on i.oid = x.indexrelid
        join pg_namespace n on n.oid = i.relnamespace join pg_am a on a.oid = i.relam
       where n.nspname = 'public' and i.relname = requis.nom
         and x.indrelid = format('public.%I', requis.table_nom)::regclass
         and a.amname = 'btree' and x.indisvalid and x.indisready and not x.indisunique
         and x.indexprs is null and x.indnatts = cardinality(requis.colonnes)
         and array(select pg_get_indexdef(i.oid, k, true)
                     || case when pg_index_column_has_property(i.oid, k, 'desc') then ' DESC' else '' end
                     || case when pg_index_column_has_property(i.oid, k, 'nulls_first')
                                  is distinct from pg_index_column_has_property(i.oid, k, 'desc')
                             then case when pg_index_column_has_property(i.oid, k, 'nulls_first')
                                       then ' NULLS FIRST' else ' NULLS LAST' end else '' end
                     from generate_series(1, x.indnkeyatts) k) = requis.colonnes
         and lower(regexp_replace(coalesce(pg_get_expr(x.indpred, x.indrelid), ''), '[()[:space:]]', '', 'g')) = requis.predicat
    ) then raise exception 'VOLUME GO : index prerequisite absent ou different : %', requis.nom; end if;
  end loop;
  -- Aucune donnée utilisateur, même sur une cible locale mal nommée. Les seuls contenus
  -- permis sont les références passions et la configuration technique feature_flags.
  for t in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r', 'p') and
              (n.nspname in ('public', 'rencontres_prive', 'passio_realtime_budget', 'auth')
               and not (n.nspname = 'public' and c.relname in ('passions', 'feature_flags')))
  loop
    execute format('select exists(select 1 from %I.%I limit 1)', t.nspname, t.relname) into presente;
    if presente then raise exception 'VOLUME GO : table non vide interdite : %.%', t.nspname, t.relname; end if;
  end loop;
end
$garde$;

select jsonb_agg(jsonb_build_object('nom', i.relname, 'table', t.relname, 'methode', a.amname,
  'valide', x.indisvalid, 'pret', x.indisready,
  'colonnes', array(select pg_get_indexdef(i.oid, k, true)
    || case when pg_index_column_has_property(i.oid, k, 'desc') then ' DESC' else '' end
    || case when pg_index_column_has_property(i.oid, k, 'nulls_first')
                 is distinct from pg_index_column_has_property(i.oid, k, 'desc')
            then case when pg_index_column_has_property(i.oid, k, 'nulls_first')
                      then ' NULLS FIRST' else ' NULLS LAST' end else '' end
    from generate_series(1, x.indnkeyatts) k),
  'predicat', lower(regexp_replace(coalesce(pg_get_expr(x.indpred, x.indrelid), ''), '[()[:space:]]', '', 'g')))
  order by i.relname) as volume_go_indexes
  from pg_index x join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid join pg_namespace n on n.oid = t.relnamespace
    join pg_am a on a.oid = i.relam
 where n.nspname = 'public' and i.relname in ('idx_posts_created_at', 'idx_posts_author',
   'idx_posts_passion', 'idx_posts_event', 'idx_comments_post', 'idx_post_comments_author',
   'idx_likes_post', 'idx_profiles_passion', 'idx_ci_comment', 'idx_ci_user_created', 'idx_ci_post') \gset

insert into public.profiles (id, username, bio, is_private)
select 'f1000000-0000-4000-8000-' || lpad(g::text, 12, '0'),
       'VolumeGO' || lpad(g::text, 6, '0'), 'Profil synthétique volume local ' || g, false
  from generate_series(1, 100000) g;

insert into public.posts (id, author_id, content, created_at, likes)
select 'volume_go_p_' || lpad(g::text, 6, '0'),
       'f1000000-0000-4000-8000-' || lpad(g::text, 12, '0'),
       'Publication synthétique locale ' || g, now(), 3
  from generate_series(1, 100000) g;

insert into public.post_likes (post_id, user_id)
select 'volume_go_p_' || lpad(g::text, 6, '0'),
       'f1000000-0000-4000-8000-' || lpad((1 + ((g + decalage) % 100000))::text, 12, '0')
  from generate_series(1, 100000) g cross join generate_series(0, 2) decalage;

insert into public.post_comments (id, post_id, author_id, content, created_at)
select 'volume_go_c_' || lpad(g::text, 6, '0') || '_' || decalage,
       'volume_go_p_' || lpad(g::text, 6, '0'),
       'f1000000-0000-4000-8000-' || lpad((1 + ((g + decalage) % 100000))::text, 12, '0'),
       'Commentaire synthétique local ' || g || '/' || decalage, now()
  from generate_series(1, 100000) g cross join generate_series(0, 1) decalage;

analyze public.profiles;
analyze public.posts;
analyze public.post_likes;
analyze public.post_comments;

do $cardinalites$
begin
  if (select count(*) from public.profiles) <> 100000
     or (select count(distinct id) from public.profiles) <> 100000
     or (select count(*) from public.posts) <> 100000
     or (select count(distinct author_id) from public.posts) <> 100000
     or (select count(*) from public.post_likes) <> 300000
     or (select count(*) from public.post_comments) <> 200000
     or (select count(*) from auth.users) <> 0 then
    raise exception 'VOLUME GO : cardinalités synthétiques incorrectes';
  end if;
end
$cardinalites$;
select jsonb_build_object('volume_go', 'fixtures', 'profils_applicatifs', count(*),
  'auteurs_distincts', (select count(distinct author_id) from public.posts),
  'posts', (select count(*) from public.posts), 'likes', (select count(*) from public.post_likes),
  'commentaires', (select count(*) from public.post_comments), 'comptes_auth_crees', 0,
  'connexions', 1, 'created_at_distincts', (select count(distinct created_at) from public.posts),
  'index_catalogue', :'volume_go_indexes'::jsonb,
  'postgres_version', current_setting('server_version'), 'database', current_database(),
  'server_addr', host(inet_server_addr()), 'server_port', inet_server_port()) from public.profiles;

-- SECURITY INVOKER, fonction temporaire : EXPLAIN et le contrôle de résultat sont bien
-- exécutés avec le rôle client. Aucun remplacement de fil_compteurs ni de sa visibilité.
create function pg_temp.volume_go_mesurer(nom text, iteration integer, requete text, attendu integer)
returns jsonb language plpgsql security invoker as $mesurer$
declare plan json; lignes bigint;
begin
  if current_user <> 'authenticated' or current_setting('row_security') <> 'on'
     or exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
     or auth.uid()::text is distinct from 'f1000000-0000-4000-8000-000000000001' then
    raise exception 'VOLUME GO : identité/RLS client perdue';
  end if;
  execute 'select count(*) from (' || requete || ') resultat' into lignes;
  if lignes <> attendu then raise exception 'VOLUME GO : % renvoie %, attendu %', nom, lignes, attendu; end if;
  execute 'explain (analyze, buffers, format json) ' || requete into plan;
  return jsonb_build_object('volume_go', 'mesure', 'requete', nom, 'iteration', iteration,
                           'role', current_user, 'lignes', lignes, 'explain', plan);
end
$mesurer$;
do $temp$ begin
  execute format('grant usage on schema %I to authenticated',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end $temp$;
grant execute on function pg_temp.volume_go_mesurer(text, integer, text, integer) to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true) as identite \gset
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true) as identite_sub \gset
set local role authenticated;

-- Le client transmet au RPC les IDs déjà reçus du fil. Cette préparation est hors
-- mesure : inclure son SELECT dans EXPLAIN mesurerait une seconde lecture du fil.
select array(select id from public.posts order by created_at desc, id desc limit 20)::text as volume_go_post_ids \gset
select set_config('volume_go.post_ids', :'volume_go_post_ids', true) as preparation_ids \gset
do $compteurs$
begin
  if exists (select 1 from public.fil_compteurs(current_setting('volume_go.post_ids')::text[])
       where likes is distinct from 3 or commentaires is distinct from 2
          or jsonb_array_length(apercus) is distinct from 2) then
    raise exception 'VOLUME GO : RPC compteurs ne restitue pas les fixtures';
  end if;
end
$compteurs$;

select pg_temp.volume_go_mesurer('fil', i, $sql$
  select p.id, p.author_id, p.passion_id, p.mood, p.content, p.media_url,
         p.created_at, p.edited_at, p.is_reel, p.overlays, p.vlog,
         p.shared_from_post_id, p.shared_data, p.event_id,
         jsonb_build_object('username', pr.username, 'emoji', pr.emoji, 'color', pr.color,
                           'avatar_url', pr.avatar_url, 'is_private', pr.is_private) as profiles
    from public.posts p left join public.profiles pr on pr.id = p.author_id
   order by p.created_at desc, p.id desc limit 20
$sql$, 20) from generate_series(1, current_setting('volume_go.repetitions')::integer) i;

select pg_temp.volume_go_mesurer('profils', i, $sql$
  select id, username, emoji, color, passion_id, passions, bio, avatar_url
    from public.profiles where username ~* '099999' or bio ~* '099999' limit 30
$sql$, 1) from generate_series(1, current_setting('volume_go.repetitions')::integer) i;

-- EXPLAIN du RPC peut n'afficher que Function Scan : pas de preuve des plans internes.
select pg_temp.volume_go_mesurer('compteurs', i,
  format('select * from public.fil_compteurs(%L::text[])', :'volume_go_post_ids'),
  20) from generate_series(1, current_setting('volume_go.repetitions')::integer) i;

reset role;
rollback;

-- Le marqueur final n'est émis qu'après ROLLBACK et vérification depuis la même session.
do $annulation$
begin
  if exists (select 1 from public.profiles where id like 'f1000000-0000-4000-8000-%')
     or exists (select 1 from public.posts where id like 'volume_go_p_%')
     or exists (select 1 from public.post_likes where post_id like 'volume_go_p_%')
     or exists (select 1 from public.post_comments where id like 'volume_go_c_%') then
    raise exception 'VOLUME GO : fixtures présentes après ROLLBACK';
  end if;
end
$annulation$;
select jsonb_build_object('volume_go', 'termine', 'rollback_verifie', true);
