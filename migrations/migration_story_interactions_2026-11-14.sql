-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- STORIES FAÇON INSTAGRAM — J'AIME, « VU PAR », COMMENTAIRES (2026-11-14)
-- Demande de Benjamin : « l'auteur ne voit ni le nombre de j'aime ni "Vu par" ; les commentaires
-- visibles par tout le monde sous la story ne sont pas faits. Mets en place, je veux la même chose
-- qu'Instagram. »
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun prérequis client : le client servi
-- depuis le 2026-11-14 détecte l'absence des tables (42P01 / PGRST205) et garde son repli (j'aime et
-- réactions envoyés en message direct) ; il bascule de lui-même dès que la migration est appliquée.
--
-- CE QUI CHANGE :
--   ① `story_likes` (story_id, user_id) : un j'aime par compte et par story. Lu par son AUTEUR
--      (le j'aimeur) et par l'AUTEUR DE LA STORY — personne d'autre (comme Instagram : les j'aime
--      d'une story ne sont pas publics).
--   ② `story_comments` : commentaires PUBLICS d'une story, lus par quiconque peut voir la story
--      (mêmes règles que `stories` : compte privé → abonnés acceptés ; blocage dans les deux sens →
--      rien). Écrits par leur auteur ; effacés par leur auteur OU par l'auteur de la story. Jamais
--      modifiés (aucun droit UPDATE). 1 à 500 caractères.
--   ③ `story_views` : l'auteur d'une story lit QUI l'a vue (« Vu par »). Chaque compte continuait
--      de ne lire que ses propres lignes : la policy existante est gardée, une seconde s'ajoute.
--   Les deux tables neuves suivent la story : `on delete cascade` sur `stories(id)` (une story
--   supprimée emporte j'aime et commentaires) et sur `profiles(id)`.
--   Bornes : débit par compte, ligne bornée, barrière de suppression de compte — comme
--   `post_likes` / `post_comments`.
--
-- RÉSIDUS ASSUMÉS :
--   · aucune notification « X a aimé / commenté ta story » : `notifications_preuve_evenement`
--     refuse les genres qu'il ne prouve pas ; l'auteur voit tout dans l'« Activité » de sa story ;
--   · tables NON publiées en temps réel : la liste se relit à l'ouverture de la feuille.
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| drop policy if exists story_views_select_auteur_story on public.story_views;
--| drop table if exists public.story_comments;
--| drop table if exists public.story_likes;
--| drop function if exists public.story_visible(text);
--| drop function if exists public.story_est_a_moi(text);
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── Fonctions de visibilité (SECURITY DEFINER : la RLS de `stories` ne s'applique pas à l'intérieur,
--    la règle est donc RECOPIÉE de la policy « Lecture stories respectant les comptes prives »,
--    plus le blocage dans les deux sens) ─────────────────────────────────────────────────────────
create or replace function public.story_visible(_story_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _story_id is null then false else exists (
    select 1 from public.stories s
     where s.id = _story_id
       and (   s.author_id = (auth.uid())::text
            or (    not exists (select 1 from public.profiles pr where pr.id = s.author_id and pr.is_private = true)
                and not public.is_blocked_with(s.author_id))
            or public.abonne_accepte_non_bloque(s.author_id))
  ) end
$fn$;
revoke all on function public.story_visible(text) from public, anon;
grant execute on function public.story_visible(text) to authenticated;

create or replace function public.story_est_a_moi(_story_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _story_id is null then false else exists (
    select 1 from public.stories s where s.id = _story_id and s.author_id = (auth.uid())::text
  ) end
$fn$;
revoke all on function public.story_est_a_moi(text) from public, anon;
grant execute on function public.story_est_a_moi(text) to authenticated;

-- ── ① story_likes ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.story_likes (
  story_id   text not null references public.stories(id) on delete cascade,
  user_id    text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists story_likes_user_idx on public.story_likes (user_id);
alter table public.story_likes enable row level security;
revoke all on public.story_likes from anon, authenticated;
grant select, insert, delete on public.story_likes to authenticated;

drop policy if exists story_likes_select on public.story_likes;
create policy story_likes_select on public.story_likes for select to authenticated
  using (user_id = (select auth.uid())::text or public.story_est_a_moi(story_id));
drop policy if exists story_likes_insert on public.story_likes;
create policy story_likes_insert on public.story_likes for insert to authenticated
  with check (user_id = (select auth.uid())::text and public.story_visible(story_id)
              and not public.suppression_de_mon_compte());
drop policy if exists story_likes_delete on public.story_likes;
create policy story_likes_delete on public.story_likes for delete to authenticated
  using (user_id = (select auth.uid())::text);

drop trigger if exists trg_debit_compte on public.story_likes;
create trigger trg_debit_compte before insert on public.story_likes
  for each row execute function public.debit_par_compte('120');
drop trigger if exists zz_barriere_suppression on public.story_likes;
create trigger zz_barriere_suppression before insert or update on public.story_likes
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');

-- ── ② story_comments ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.story_comments (
  id         text primary key default (gen_random_uuid())::text,
  story_id   text not null references public.stories(id) on delete cascade,
  author_id  text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  content    text not null constraint story_comments_content_borne
               check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists story_comments_story_idx on public.story_comments (story_id, created_at);
create index if not exists story_comments_author_idx on public.story_comments (author_id);
alter table public.story_comments enable row level security;
revoke all on public.story_comments from anon, authenticated;
grant select, insert, delete on public.story_comments to authenticated;

drop policy if exists story_comments_select on public.story_comments;
create policy story_comments_select on public.story_comments for select to authenticated
  using (public.story_visible(story_id) and not public.is_blocked_with(author_id));
drop policy if exists story_comments_insert on public.story_comments;
create policy story_comments_insert on public.story_comments for insert to authenticated
  with check (author_id = (select auth.uid())::text and public.story_visible(story_id)
              and not public.suppression_de_mon_compte());
drop policy if exists story_comments_delete on public.story_comments;
create policy story_comments_delete on public.story_comments for delete to authenticated
  using (author_id = (select auth.uid())::text or public.story_est_a_moi(story_id));

drop trigger if exists aa_ligne_bornee on public.story_comments;
create trigger aa_ligne_bornee before insert or update on public.story_comments
  for each row execute function public.ligne_bornee('4096');
drop trigger if exists trg_rate_limit on public.story_comments;
create trigger trg_rate_limit before insert on public.story_comments
  for each row execute function public.rate_limit_insert('author_id', '30');
drop trigger if exists zz_barriere_suppression on public.story_comments;
create trigger zz_barriere_suppression before insert or update on public.story_comments
  for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');

-- ── ③ « Vu par » : l'auteur d'une story lit qui l'a vue ────────────────────────────────────────────
drop policy if exists story_views_select_auteur_story on public.story_views;
create policy story_views_select_auteur_story on public.story_views for select to authenticated
  using (public.story_est_a_moi(story_id));

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'story_likes : RLS active, 3 policies' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.story_likes'::regclass)
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'story_likes') = 3
            then 'OK' else 'ECHEC' end as valeur
union all select 'story_comments : RLS active, 3 policies, aucun UPDATE',
       case when (select relrowsecurity from pg_class where oid = 'public.story_comments'::regclass)
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'story_comments') = 3
             and not has_table_privilege('authenticated', 'public.story_comments', 'update')
            then 'OK' else 'ECHEC' end
union all select 'anon ne lit rien',
       case when not has_table_privilege('anon', 'public.story_likes', 'select')
             and not has_table_privilege('anon', 'public.story_comments', 'select')
            then 'OK' else 'ECHEC' end
union all select 'story_views : « Vu par » pour l''auteur, la policy propre gardée',
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'story_views' and policyname = 'story_views_select_auteur_story')
             and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'story_views' and policyname = 'story_views_select_own')
            then 'OK' else 'ECHEC' end
union all select 'tables neuves hors publication temps réel',
       case when not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                              and tablename in ('story_likes', 'story_comments'))
            then 'OK' else 'ECHEC' end;

commit;
