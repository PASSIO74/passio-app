-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- STICKER SONDAGE DES STORIES (2026-11-26)
-- Demande de Benjamin : « améliore la story, copie Instagram » puis « fais tout et mets tout en
-- ligne ». Le sticker 📊 pose une question à deux réponses ; chaque spectateur vote UNE fois, voit
-- alors les pourcentages ; l'auteur voit les pourcentages et QUI a voté quoi (comme Instagram).
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun prérequis client : le client servi
-- détecte l'absence de la table (42P01 / PGRST205) et dit « bientôt disponible ».
--
-- CE QUI CHANGE :
--   ① `story_sondage_votes` (story_id, user_id, choix 0|1) : un vote par compte et par story,
--      jamais modifié ni retiré (aucun droit UPDATE / DELETE). Écrit par son auteur, sur une story
--      qu'il VOIT (`story_visible`), qui PORTE un sondage, et qui n'est pas la sienne.
--      Lu par son auteur (le votant) et par l'AUTEUR DE LA STORY (hors comptes bloqués).
--   ② `story_sondage_resultats(_story_id)` : les comptes 0 / 1 et mon choix — rendus SEULEMENT à
--      qui a voté ou à l'auteur (on ne voit pas la tendance avant de voter), et à qui voit la story.
--   Bornes : débit par compte, barrière de suppression de compte — comme `story_likes`.
--
-- RÉSIDUS ASSUMÉS : table NON publiée en temps réel (les résultats se relisent à l'ouverture).
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| drop function if exists public.story_sondage_resultats(text);
--| drop function if exists public.story_a_un_sondage(text);
--| drop table if exists public.story_sondage_votes;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- La story porte-t-elle un sticker sondage ? (SECURITY DEFINER : lit `overlays` sans dépendre de la
-- RLS de `stories` ; la visibilité est vérifiée À CÔTÉ par `story_visible`.)
create or replace function public.story_a_un_sondage(_story_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  -- ⚠️ Visibilité vérifiée DEDANS : la policy l'appelle avec les droits de l'appelant (EXECUTE
  -- requis), donc tout compte peut l'appeler en RPC — sans ce garde, elle disait qu'une story
  -- PRIVÉE existait et portait un sondage (red team du 2026-11-26).
  select case when _story_id is null or not public.story_visible(_story_id) then false else exists (
    select 1 from public.stories s
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(s.overlays) = 'array' then s.overlays else '[]'::jsonb end) e
     where s.id = _story_id and e ->> 'type' = 'sondage'
  ) end
$fn$;
revoke all on function public.story_a_un_sondage(text) from public, anon;
grant execute on function public.story_a_un_sondage(text) to authenticated;

create table if not exists public.story_sondage_votes (
  story_id   text not null references public.stories(id) on delete cascade,
  user_id    text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  choix      smallint not null constraint story_sondage_votes_choix check (choix in (0, 1)),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists story_sondage_votes_user_idx on public.story_sondage_votes (user_id);
alter table public.story_sondage_votes enable row level security;
revoke all on public.story_sondage_votes from anon, authenticated;
-- INSERT par colonne : `user_id` et `created_at` prennent leur défaut, jamais une valeur fournie
-- (un horodatage de vote forgé était lu par l'auteur — red team du 2026-11-26 ; règle C-04).
grant select on public.story_sondage_votes to authenticated;
grant insert (story_id, choix) on public.story_sondage_votes to authenticated;

drop policy if exists story_sondage_votes_select on public.story_sondage_votes;
create policy story_sondage_votes_select on public.story_sondage_votes for select to authenticated
  using (user_id = (select auth.uid())::text
         or (public.story_est_a_moi(story_id) and not public.is_blocked_with(user_id)));
drop policy if exists story_sondage_votes_insert on public.story_sondage_votes;
create policy story_sondage_votes_insert on public.story_sondage_votes for insert to authenticated
  with check (user_id = (select auth.uid())::text
              and public.story_visible(story_id)
              and not public.story_est_a_moi(story_id)
              and public.story_a_un_sondage(story_id)
              and not public.suppression_de_mon_compte());

drop trigger if exists trg_debit_compte on public.story_sondage_votes;
create trigger trg_debit_compte before insert on public.story_sondage_votes
  for each row execute function public.debit_par_compte('120');
drop trigger if exists zz_barriere_suppression on public.story_sondage_votes;
create trigger zz_barriere_suppression before insert or update on public.story_sondage_votes
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');

create or replace function public.story_sondage_resultats(_story_id text) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null or not public.story_visible(_story_id) then null
    when not public.story_est_a_moi(_story_id)
         and not exists (select 1 from public.story_sondage_votes v
                          where v.story_id = _story_id and v.user_id = (auth.uid())::text)
      then jsonb_build_object('a_vote', false)
    else jsonb_build_object(
      'a_vote', true,
      'mon_choix', (select v.choix from public.story_sondage_votes v
                     where v.story_id = _story_id and v.user_id = (auth.uid())::text),
      -- Hors comptes bloqués (dans un sens ou l'autre) : le score correspond à la liste que l'auteur lit.
      'a', (select count(*) from public.story_sondage_votes v where v.story_id = _story_id and v.choix = 0
             and not public.is_blocked_with(v.user_id)),
      'b', (select count(*) from public.story_sondage_votes v where v.story_id = _story_id and v.choix = 1
             and not public.is_blocked_with(v.user_id)))
  end
$fn$;
revoke all on function public.story_sondage_resultats(text) from public, anon;
grant execute on function public.story_sondage_resultats(text) to authenticated;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'story_sondage_votes : RLS active, 2 policies' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.story_sondage_votes'::regclass)
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'story_sondage_votes') = 2
            then 'OK' else 'ECHEC' end as valeur
union all select 'aucun UPDATE ni DELETE pour authenticated',
       case when not has_table_privilege('authenticated', 'public.story_sondage_votes', 'update')
             and not has_table_privilege('authenticated', 'public.story_sondage_votes', 'delete')
            then 'OK' else 'ECHEC' end
union all select 'INSERT limité à (story_id, choix) : user_id et created_at ne se fournissent pas',
       case when has_column_privilege('authenticated', 'public.story_sondage_votes', 'choix', 'insert')
             and not has_column_privilege('authenticated', 'public.story_sondage_votes', 'created_at', 'insert')
             and not has_column_privilege('authenticated', 'public.story_sondage_votes', 'user_id', 'insert')
            then 'OK' else 'ECHEC' end
union all select 'anon ne lit rien et n''appelle rien',
       case when not has_table_privilege('anon', 'public.story_sondage_votes', 'select')
             and not has_function_privilege('anon', 'public.story_sondage_resultats(text)', 'execute')
            then 'OK' else 'ECHEC' end
union all select 'table hors publication temps réel',
       case when not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                              and tablename = 'story_sondage_votes')
            then 'OK' else 'ECHEC' end;

commit;
