-- ════════════════════════════════════════════════════════════════════════
-- COMPTES PRIVÉS — DURCISSEMENT SERVEUR (RLS) — 2026-07-20
-- ════════════════════════════════════════════════════════════════════════
-- Avant : la lecture de `posts` était totalement ouverte (2 policies `USING (true)`).
-- Le masquage des posts des comptes privés (profiles.is_private) n'était qu'un
-- filet CLIENT dans supaLoadPosts → n'importe quel compte pouvait lire les posts
-- d'un compte privé en interrogeant l'API directement.
--
-- Après : un post est lisible si (au moins un) :
--   1. je suis l'auteur (mes posts, tous mes appareils) ;
--   2. l'auteur n'est PAS privé (ou n'a pas de ligne profiles) — inclut les
--      lecteurs sans session (auth.uid() NULL) : les posts publics restent publics ;
--   3. je SUIS abonné à l'auteur (ligne follows) — couvert par follows_pkey
--      (follower_id, following_id), coût par ligne ≈ 1 lookup d'index.
--
-- `(select auth.uid())` (et non `auth.uid()` nu) : évalué UNE fois par requête
-- (InitPlan) au lieu d'une fois par ligne.
--
-- ⚠️ Limites résiduelles (client inchangé, filet client conservé) :
--   - les MÉDIAS (Storage) des posts privés restent des URLs publiques ;
--   - post_comments / post_likes restent en lecture ouverte (sans le post
--     parent, le client ne les affiche nulle part) — durcissement futur possible.
--
-- Realtime : les INSERT de posts privés ne sont plus diffusés aux non-abonnés
-- (postgres_changes respecte la RLS).

drop policy if exists "Lecture publique" on public.posts;
drop policy if exists "Read posts" on public.posts;

create policy "Lecture respectant les comptes prives" on public.posts
for select using (
  author_id = (select auth.uid())::text
  or not exists (
    select 1 from public.profiles pr
    where pr.id = posts.author_id and pr.is_private = true
  )
  or exists (
    select 1 from public.follows f
    where f.follower_id = (select auth.uid())::text
      and f.following_id = posts.author_id
  )
);
