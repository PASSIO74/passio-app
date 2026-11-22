-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ 2026-11-15 — LOT 4 « ABUS, PLAFONDS, CAPACITÉ » : LECTURES COÛTEUSES
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Indépendante du client (aucun
-- PREREQUIS-CLIENT) : les signatures et les réponses ne changent pas.
-- Banc : tests/sql/migration-securite-2026-11-06.test.sh (étape « lot du 2026-11-15 »),
--        cas dans tests/sql/fixtures/cas-securite-lot5-2026-11-15.sql.
--
-- CE QUI COÛTAIT :
--   ① `rechercher_passions` acceptait un terme d'une ou deux lettres : le seul cas où elle note
--     presque tout le référentiel. Le client ne l'appelle jamais sous trois caractères.
--   ② La recherche de personnes (`profiles`, `username` / `bio` en expression régulière insensible
--     à la casse) parcourait toute la table : aucun index utilisable.
--   ③ `fil_compteurs` comptait sous la règle de lecture de `post_likes` / `post_comments` /
--     `comment_interactions`, c'est-à-dire une fonction de visibilité appelée POUR CHAQUE LIGNE
--     comptée. C'est l'appel de chaque page du fil, puis de chaque tour du filet, visiteurs compris.
--
-- CE QUI CHANGE :
--   ① Sous trois caractères (après normalisation), `rechercher_passions` ne rend rien ; vide, elle
--     rend toujours les plus populaires.
--   ② Deux index trigrammes, `profiles.username` et `profiles.bio`.
--   ③ `fil_compteurs` devient SECURITY DEFINER et décide la visibilité UNE fois par publication
--     (et une fois par couple publication/fil pour les réactions), avec EXACTEMENT les règles de
--     lecture : « la ligne est à moi OU post_is_visible(post_id) » pour les « j'aime » et les
--     commentaires, « la ligne est à moi OU comment_target_visible(comment_id, post_id) » pour les
--     réactions. Mêmes colonnes, mêmes bornes (60 publications, 2 aperçus, 200 réactions).
--   RÉSIDU NOMMÉ : le compteur de « j'aime » des cartes à l'écran (comptes connectés, `HEAD
--   count=exact` sur `post_likes`) reste soumis à la règle ligne par ligne ; il n'est pas touché ici.
--
-- RETOUR ARRIÈRE (éditeur SQL) : corps d'origine de `rechercher_passions` et `fil_compteurs` dans
-- tests/sql/fixtures/socle-production-2026-11-06.sql (lot 3) ; puis :
--| begin;
--| drop index if exists public.profiles_username_trgm;
--| drop index if exists public.profiles_bio_trgm;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $g$ begin
  if to_regprocedure('public.post_is_visible(text)') is null
     or to_regprocedure('public.comment_target_visible(text,text)') is null
     or to_regprocedure('public.unaccent_immutable(text)') is null then
    raise exception 'fonctions de visibilité ou de normalisation absentes : relire le schéma';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    raise exception 'pg_trgm requis';
  end if;
end $g$;

-- ── ① Pas de recherche de passion sous trois caractères ─────────────────────────────────────────
create or replace function public.rechercher_passions(q text, lim integer default 20)
 returns table(id text, label text, emoji text, color text, popularity integer, score integer)
 language plpgsql stable
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(left(coalesce(q, ''), 100)), '[^a-z0-9]+', ' ', 'g'));
begin
  if n = '' then
    return query
      select p.id, p.label, p.emoji, p.color, p.popularity, 0
        from public.passions p
       where p.status = 'active'
       order by p.popularity desc, p.sort_order
       limit least(greatest(coalesce(lim, 20), 1), 50);
    return;
  end if;
  -- Sous trois caractères, le terme retient presque tout le référentiel et la note se calcule sur
  -- chaque ligne : le client cherche localement ces frappes-là, le serveur ne répond rien.
  if char_length(n) < 3 then
    return;
  end if;
  return query
    select p.id, p.label, p.emoji, p.color, p.popularity,
           (case
              when p.normalized_label = n then 0
              when p.normalized_label like n || '%' then 10
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) = n) then 20
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) like n || '%') then 30
              when p.normalized_label like '%' || n || '%' then 40
              else 60
            end + case when p.is_broad then 5 else 0 end)::int as score
      from public.passions p
     where p.status = 'active'
       -- `%` = l'opérateur de similarité de pg_trgm (seuil 0,3 par défaut, le même
       -- que l'ancien `similarity() > 0.3`) : lui SEUL lit l'index, la fonction non.
       and (p.recherche like '%' || n || '%' or p.normalized_label % n)
     order by score, p.popularity desc, p.sort_order
     limit least(greatest(coalesce(lim, 20), 1), 50);
end $function$;

-- ── ② Recherche de personnes : index trigrammes ─────────────────────────────────────────────────
set local search_path = public, extensions, pg_catalog;
create index if not exists profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);
create index if not exists profiles_bio_trgm on public.profiles using gin (bio gin_trgm_ops);

-- ── ③ Compter sans refaire la règle de lecture ligne par ligne ──────────────────────────────────
create or replace function public.fil_compteurs(_post_ids text[])
 returns table(post_id text, likes integer, aime boolean, commentaires integer, apercus jsonb, reactions jsonb)
 language sql stable security definer
 set search_path to ''
as $function$
  with cibles as materialized (
    -- 60 identifiants au plus, dédupliqués, sans NULL, bornés APRÈS aplatissement (un tableau
    -- imbriqué passait entier quand la tranche précédait `unnest`).
    select distinct s.pid
      from (
        select u.pid
          from unnest(coalesce(_post_ids, '{}'::text[])) with ordinality as u(pid, n)
         where u.pid is not null
         order by u.n
         limit 60
      ) s
  ),
  -- ⚠️ LA VISIBILITÉ, UNE FOIS PAR PUBLICATION. C'est la règle de lecture de `post_likes` et de
  -- `post_comments` — « (user_id | author_id) = moi OR post_is_visible(post_id) » —, évaluée ici
  -- pour la publication au lieu de l'être pour chaque ligne comptée. `materialized` : une seule
  -- évaluation par ligne de `cibles`, jamais recopiée dans chaque sous-requête.
  vues as materialized (
    select c.pid, public.post_is_visible(c.pid) as visible, (select auth.uid())::text as moi
      from cibles c
  ),
  -- Même chose pour les réactions : « user_id = moi OR comment_target_visible(comment_id, post_id) »,
  -- décidée une fois par couple (publication, fil) présent.
  fils as materialized (
    select d.comment_id, d.post_id, coalesce(public.comment_target_visible(d.comment_id, d.post_id), false) as visible
      from (
        select distinct i.comment_id, i.post_id
          from public.comment_interactions i
          join cibles c on c.pid = i.comment_id
         where i.kind in ('emoji', 'gif') and i.payload is not null
      ) d
  )
  select
    v.pid as post_id,
    (select count(*)::integer from public.post_likes l
      where l.post_id = v.pid and (v.visible or l.user_id = v.moi)) as likes,
    exists (
      select 1 from public.post_likes l
       where l.post_id = v.pid and l.user_id = v.moi
    ) as aime,
    (select count(*)::integer from public.post_comments k
      where k.post_id = v.pid and (v.visible or k.author_id = v.moi)) as commentaires,
    -- Les deux plus récents, SANS le profil de l'auteur (le client tient un cache de profils).
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', a.id,
                 'author_id', a.author_id,
                 'content', a.content,
                 'created_at', a.created_at)
               order by a.created_at desc, a.id desc)
        from (
          select k.id, k.author_id, k.content, k.created_at
            from public.post_comments k
           where k.post_id = v.pid and (v.visible or k.author_id = v.moi)
           order by k.created_at desc, k.id desc
           limit 2
        ) a
    ), '[]'::jsonb) as apercus,
    coalesce((
      -- Les 200 plus récentes : au-delà, l'écran compte déjà par `likes`, et ceci n'est pas paginé.
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', r.user_id, 'kind', r.kind,
                 'payload', r.payload, 'created_at', r.created_at)
               order by r.created_at)
        from (
          select i.user_id, i.kind, i.payload, i.created_at
            from public.comment_interactions i
           where i.comment_id = v.pid
             and i.kind in ('emoji', 'gif')
             and i.payload is not null
             and (i.user_id = v.moi
                  or exists (select 1 from fils f
                              where f.comment_id = i.comment_id
                                and f.post_id is not distinct from i.post_id
                                and f.visible))
           order by i.created_at desc
           limit 200
        ) r
    ), '[]'::jsonb) as reactions
  from vues v;
$function$;
revoke all on function public.fil_compteurs(text[]) from public;
grant execute on function public.fil_compteurs(text[]) to anon, authenticated, service_role;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'rechercher_passions : rien sous trois caractères' as controle,
       case when (select prosrc from pg_proc where oid = 'public.rechercher_passions(text,integer)'::regprocedure) like '%char_length(n) < 3%'
             and (select count(*) from public.rechercher_passions('ab', 20)) = 0 then 'OK' else 'ECHEC' end as valeur
union all select 'rechercher_passions : toujours ouverte aux visiteurs',
       case when has_function_privilege('anon', 'public.rechercher_passions(text,integer)', 'execute') then 'OK' else 'ECHEC' end
union all select 'profiles : index trigrammes sur username et bio',
       case when (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'profiles'
                   and indexname in ('profiles_username_trgm', 'profiles_bio_trgm') and indexdef like '%gin_trgm_ops%') = 2 then 'OK' else 'ECHEC' end
union all select 'fil_compteurs : visibilité une fois par publication',
       case when (select prosecdef from pg_proc where oid = 'public.fil_compteurs(text[])'::regprocedure)
             and (select prosrc from pg_proc where oid = 'public.fil_compteurs(text[])'::regprocedure) like '%post_is_visible(c.pid)%'
             and (select prosrc from pg_proc where oid = 'public.fil_compteurs(text[])'::regprocedure) like '%limit 60%'
             and (select prosrc from pg_proc where oid = 'public.fil_compteurs(text[])'::regprocedure) like '%limit 200%' then 'OK' else 'ECHEC' end
union all select 'fil_compteurs : visiteurs et comptes',
       case when has_function_privilege('anon', 'public.fil_compteurs(text[])', 'execute')
             and has_function_privilege('authenticated', 'public.fil_compteurs(text[])', 'execute') then 'OK' else 'ECHEC' end;

commit;
