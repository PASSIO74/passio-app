-- ════════════════════════════════════════════════════════════════════════
-- COMPTES PRIVÉS — RLS ÉTENDUE AUX COMMENTAIRES / LIKES / RÉACTIONS — 2026-07-20
-- ════════════════════════════════════════════════════════════════════════
-- Suite de migration_posts_privacy_rls.sql : `posts` était durci mais
-- post_comments / post_likes / comment_interactions restaient en lecture
-- ouverte (`USING (true)`) → l'API exposait les commentaires, likes et
-- réactions des posts de comptes privés à n'importe quel compte.
--
-- ⚠️ CONTRAINTE BETA : ~50 % des lignes sont « orphelines » (parent = post
-- SEED démo local, AUCUNE ligne dans `posts` : 36/72 commentaires, 27/53
-- likes au 2026-07-20). Ces lignes doivent RESTER visibles par tous (le
-- cross-compte sur le contenu démo en dépend). On ne masque donc que les
-- lignes dont le parent EXISTE dans `posts` ET n'est pas visible.
--
-- ⚠️ Une sous-requête dans une policy s'exécute SOUS la RLS de l'appelant :
-- elle ne distingue pas « le post n'existe pas » (seed → visible) de « le
-- post m'est masqué » (privé → invisible). D'où les fonctions SECURITY
-- DEFINER (owner postgres = bypass RLS) : elles voient la vraie table et
-- réappliquent la règle de visibilité de migration_posts_privacy_rls.sql.
-- Elles ne prennent PAS l'uid en paramètre (auth.uid() lu en interne) →
-- impossible de sonder la visibilité d'un autre compte.

create or replace function public.post_is_visible(pid text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when pid is null then true
    -- Pas de ligne posts = contenu seed/local → public (contenu démo beta)
    when not exists (select 1 from posts where id = pid) then true
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or exists (
          select 1 from follows f
          where f.follower_id = (select auth.uid())::text
            and f.following_id = p.author_id
        )
      )
    )
  end
$$;

-- comment_interactions.comment_id peut cibler : un POST (convention
-- comment_id === post_id pour les réactions de post), un COMMENTAIRE
-- (post_comments.id), ou un id seed/local inconnu (→ visible).
create or replace function public.comment_target_visible(cid text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when cid is null then true
    when exists (select 1 from posts where id = cid)
      then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid)
      then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    else true
  end
$$;

drop policy if exists "Lecture publique" on public.post_comments;
drop policy if exists "Read post_comments" on public.post_comments;
create policy "Lecture selon visibilite du post" on public.post_comments
for select using (
  author_id = (select auth.uid())::text
  or public.post_is_visible(post_id)
);

drop policy if exists "Lecture publique" on public.post_likes;
drop policy if exists "Read post_likes" on public.post_likes;
create policy "Lecture selon visibilite du post" on public.post_likes
for select using (
  user_id = (select auth.uid())::text
  or public.post_is_visible(post_id)
);

drop policy if exists "ci_select" on public.comment_interactions;
create policy "Lecture selon visibilite de la cible" on public.comment_interactions
for select using (
  user_id = (select auth.uid())::text
  or public.comment_target_visible(comment_id)
);
