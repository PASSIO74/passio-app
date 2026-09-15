-- ═══════════════════════════════════════════════════════════════════════════
-- BLOQUER RETIRE L'ACCÈS AU CONTENU PRIVÉ, CÔTÉ SERVEUR (MOD-04, contre-revue
-- Astra du 2026-09-15)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012), ou
-- `npm run migration:appliquer -- migrations/migration_blocage_lecture_privee_2026-09-15.sql`.
-- UNE transaction, REJOUABLE, tableau de verdict en fin (5 lignes).
--
-- LE DÉFAUT. Les policies de lecture des comptes PRIVÉS (`posts`, `stories`) et
-- `post_is_visible` (commentaires, j'aime, réactions) ouvrent le contenu à tout
-- abonnement `accepted`. Bloquer un abonné (`blocks`) ne touchait à rien de
-- cela : le client tentait de RETIRER la ligne `follows` du bloqué — geste
-- best-effort dont l'échec (réseau, refus) laissait l'abonné accepté, et donc
-- lisant tout. Astra : « le blocage peut annoncer une réussite malgré l'échec
-- du retrait de l'abonné ; les règles de lecture privées continuent d'autoriser
-- l'abonné accepté ».
--
-- LA RÈGLE. Une seule aide, `abonne_accepte_non_bloque(auteur)` — abonnement
-- accepté ET aucun blocage entre les deux comptes — remplace les trois copies
-- de la condition (deux policies + la fonction). `blocks` est protégée par RLS
-- (chacun ne voit que ses lignes) : la lecture doit être SECURITY DEFINER,
-- sinon le bloqué ne « verrait » pas le blocage qui le vise. EXECUTE est donné
-- à `anon` ET `authenticated` : la fonction rend FALSE sans compte (auth.uid()
-- null) et ne répond que sur l'APPELANT, jamais sur un tiers — ce n'est pas un
-- oracle (voir la fiche « aucun second oracle » de CLAUDE.md). Sans ce grant à
-- anon, une policy qui l'appelle ferait lever « permission denied » à chaque
-- visiteur sur `posts`.
--
-- RETOUR ARRIÈRE : rejouer la partie « policies » de
-- migration_ouverture_publique_2026-09-11.sql (leur définition précédente).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.abonne_accepte_non_bloque(_auteur text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or _auteur is null then false
    else exists (
      select 1 from public.follows f
      where f.follower_id = (auth.uid())::text
        and f.following_id = _auteur
        and f.status = 'accepted'
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = _auteur and b.blocked_id = (auth.uid())::text)
         or (b.blocker_id = (auth.uid())::text and b.blocked_id = _auteur)
    )
  end
$$;
comment on function public.abonne_accepte_non_bloque(text) is
  'L''appelant suit-il cet auteur (abonnement accepté) SANS blocage entre eux ? Répond sur l''appelant seulement ; FALSE sans compte. Seule condition d''accès au contenu d''un compte privé (MOD-04).';
revoke execute on function public.abonne_accepte_non_bloque(text) from public;
grant execute on function public.abonne_accepte_non_bloque(text) to anon, authenticated;

alter policy "Lecture respectant les comptes prives" on public.posts using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = posts.author_id and pr.is_private = true)
  or public.abonne_accepte_non_bloque(posts.author_id)
);
alter policy "Lecture stories respectant les comptes prives" on public.stories using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = stories.author_id and pr.is_private = true)
  or public.abonne_accepte_non_bloque(stories.author_id)
);
create or replace function public.post_is_visible(pid text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when pid is null then true
    -- Pas de ligne posts = contenu seed/local → public (contenu démo beta)
    when not exists (select 1 from posts where id = pid) then true
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or public.abonne_accepte_non_bloque(p.author_id)
      )
    )
  end
$$;

-- ── Verdict ────────────────────────────────────────────────────────────────
select '① aide présente, security definer, search_path vide' as controle,
       case when exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.abonne_accepte_non_bloque(text)')
                          and p.prosecdef and p.proconfig @> array['search_path=""']) then 'OK' else 'ECHEC' end as verdict
union all
select '② anon et authenticated peuvent l''appeler (FALSE sans compte)',
       case when has_function_privilege('anon', 'public.abonne_accepte_non_bloque(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.abonne_accepte_non_bloque(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select '③ policy posts : passe par l''aide, plus par follows seule',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='Lecture respectant les comptes prives'
                          and qual like '%abonne_accepte_non_bloque%' and qual not like '%accepted%') then 'OK' else 'ECHEC' end
union all
select '④ policy stories : idem',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Lecture stories respectant les comptes prives'
                          and qual like '%abonne_accepte_non_bloque%' and qual not like '%accepted%') then 'OK' else 'ECHEC' end
union all
select '⑤ post_is_visible : idem',
       case when pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%abonne_accepte_non_bloque%'
             and pg_get_functiondef('public.post_is_visible(text)'::regprocedure) not like '%accepted%' then 'OK' else 'ECHEC' end;

commit;
