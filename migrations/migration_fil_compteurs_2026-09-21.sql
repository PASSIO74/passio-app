-- ═══════════════════════════════════════════════════════════════════════════
-- FIL — COMPTEURS EXACTS, MON LIKE ET DEUX APERÇUS EN UNE SEULE LECTURE
-- (capacité sans investir, 2026-09-21)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (5 lignes).
--
-- LE DÉFAUT, mesuré dans le client le 2026-09-21 : pour peindre une page de
-- fil, `supaLoadPosts` (app-08) téléchargeait TOUTES les lignes de `post_likes`
-- des publications chargées (pour compter et savoir si j'ai aimé), jusqu'à
-- 200 commentaires AVEC leur contenu (pour n'en afficher que deux et compter
-- les autres), les réactions, puis les profils des auteurs — quatre requêtes
-- après celle des publications, et un volume qui grandit avec le SUCCÈS d'une
-- publication, pas avec ce que le lecteur regarde. Un `count` PostgREST
-- n'existe pas ici : ni `post_likes` ni `post_comments` ne portent de clé
-- étrangère vers `posts`, et les agrégats REST sont désactivés (PGRST123).
--
-- CE QUI CHANGE, et rien d'autre :
--   · une fonction `public.fil_compteurs(_post_ids text[])`, SECURITY INVOKER :
--     elle s'exécute avec les droits de l'APPELANT, donc sous les policies RLS
--     de `post_likes`, `post_comments` et `comment_interactions`
--     telles qu'elles sont — un compte privé, un blocage, un compte en
--     suppression donnent EXACTEMENT ce qu'un GET direct aurait donné ;
--   · pour chaque identifiant (60 au plus, le reste est ignoré : la page du
--     fil fait 20, celle d'un profil visité 60) : `likes` (compte exact),
--     `aime` (ma propre ligne), `commentaires` (compte exact des commentaires
--     de premier niveau), `apercus` (les DEUX plus récents : id, auteur,
--     contenu, date), `reactions` (les réactions emoji/GIF portées par la
--     publication elle-même — convention `comment_id = post_id`) ;
--   · aucune table, aucune colonne, aucune policy ne change ; la fonction est
--     exposée à `anon` et `authenticated` comme le sont les tables qu'elle lit.
--
-- CE QUE LA FONCTION NE FAIT PAS : elle ne lit pas `posts` (l'appelant les a
-- déjà) et ne décide d'aucune visibilité — c'est la RLS de chaque table qui
-- tranche, ligne par ligne, comme avant. Un identifiant inconnu ou invisible
-- rend simplement 0 / faux / [] : jamais une erreur, jamais une ligne absente.
--
-- À COLLER À TOUT MOMENT : le client d'avant ne l'appelle pas ; celui d'après
-- retombe sur les quatre lectures d'avant tant qu'elle n'existe pas (PGRST202).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.fil_compteurs(_post_ids text[])
returns table (
  post_id text,
  likes integer,
  aime boolean,
  commentaires integer,
  apercus jsonb,
  reactions jsonb
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cibles as (
    -- 60 identifiants au plus, dédupliqués, sans NULL : la borne est celle de
    -- la plus grande page du produit (profil visité). Au-delà, on ignore.
    -- ⚠️ Bornée APRÈS aplatissement : une tranche [1:60] posée avant `unnest`
    -- ne bornait que la première dimension — un tableau imbriqué (accepté par
    -- la conversion JSON → text[] de PostgREST) passait entier (contre-revue).
    select distinct s.pid
      from (
        select u.pid
          from unnest(coalesce(_post_ids, '{}'::text[])) with ordinality as u(pid, n)
         where u.pid is not null
         order by u.n
         limit 60
      ) s
  )
  select
    c.pid as post_id,
    (select count(*)::integer from public.post_likes l where l.post_id = c.pid) as likes,
    exists (
      select 1 from public.post_likes l
       where l.post_id = c.pid and l.user_id = (select auth.uid())::text
    ) as aime,
    (select count(*)::integer from public.post_comments k where k.post_id = c.pid) as commentaires,
    -- Les deux plus récents, SANS le profil de l'auteur : `profiles.passions`
    -- pèse ~1 Ko par ligne (mesuré, jusqu'à 2,9 Ko) et le client tient déjà un
    -- cache de profils (`_resolveProfilesByIds`) qui ne redemande que les
    -- manquants. Recopier l'identité ici doublerait ce que le cache évite.
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
           where k.post_id = c.pid
           order by k.created_at desc, k.id desc
           limit 2
        ) a
    ), '[]'::jsonb) as apercus,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', i.user_id, 'kind', i.kind,
                 'payload', i.payload, 'created_at', i.created_at)
               order by i.created_at)
        from public.comment_interactions i
       where i.comment_id = c.pid
         and i.kind in ('emoji', 'gif')
         and i.payload is not null
    ), '[]'::jsonb) as reactions
  from cibles c;
$function$;

comment on function public.fil_compteurs(text[]) is
  'Fil : compteurs exacts de likes/commentaires, mon like, deux aperçus et réactions, pour 60 publications au plus. SECURITY INVOKER : la RLS de chaque table s''applique telle quelle.';

revoke all on function public.fil_compteurs(text[]) from public;
grant execute on function public.fil_compteurs(text[]) to anon, authenticated;

-- Garde : la fonction lit des tables sous RLS avec les droits de l'APPELANT.
-- En SECURITY DEFINER elle contournerait ces policies (un compte bloqué
-- compterait les likes d'un post qu'il ne voit pas). Le verdict ne suffit pas
-- à l'empêcher — il est lu par un humain — donc la transaction s'ANNULE.
do $$
begin
  if (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.fil_compteurs(text[])')) then
    raise exception 'fil_compteurs doit rester SECURITY INVOKER : en DEFINER elle contournerait la RLS de post_likes / post_comments / comment_interactions — transaction annulée';
  end if;
end $$;

-- Verdict (5 lignes attendues, toutes OK).
-- Verdict CIBLÉ PAR SIGNATURE (`to_regprocedure`) : une seconde surcharge
-- `fil_compteurs` ferait rendre deux lignes à une sous-requête par nom seul.
select 'fonction présente' as controle,
       case when to_regprocedure('public.fil_compteurs(text[])') is not null then 'OK' else 'ECHEC' end as valeur
union all select 'SECURITY INVOKER (jamais DEFINER)',
       case when (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.fil_compteurs(text[])')) = false then 'OK' else 'ECHEC' end
union all select 'search_path figé',
       case when (select array_to_string(p.proconfig, ',') from pg_proc p where p.oid = to_regprocedure('public.fil_compteurs(text[])')) like '%search_path=%' then 'OK' else 'ECHEC' end
union all select 'STABLE (lecture seule, appelable en GET)',
       case when (select p.provolatile from pg_proc p where p.oid = to_regprocedure('public.fil_compteurs(text[])')) = 's' then 'OK' else 'ECHEC' end
union all select 'exposée à anon et authenticated, pas à PUBLIC',
       case when has_function_privilege('anon', 'public.fil_compteurs(text[])', 'execute')
             and has_function_privilege('authenticated', 'public.fil_compteurs(text[])', 'execute')
             and not has_function_privilege('public', 'public.fil_compteurs(text[])', 'execute') then 'OK' else 'ECHEC' end;

commit;
