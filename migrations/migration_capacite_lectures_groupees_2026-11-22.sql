-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- CAPACITÉ 2026-11-22 — D14-01 (suite) : LES RÉACTIONS ET LES STORIES SE LISENT EN UN APPEL GROUPÉ
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun PREREQUIS-CLIENT : ces fonctions
-- s'ajoutent ; le client les appelle quand elles existent et garde sa lecture d'avant sinon
-- (`_erreurFonctionAbsente`, app-08). Rien n'est retiré, aucune règle ne change.
-- Banc : tests/sql/migration-capacite-lectures-groupees-2026-11-22.test.sh.
--
-- CE QUI COÛTAIT (relu en production le 2026-11-22, lecture seule) : trois lectures du client
-- passent par une règle de lecture qui appelle une fonction SECURITY DEFINER POUR CHAQUE LIGNE,
-- même quand toutes les lignes visent la même publication ou la même story :
--   · `comment_interactions` (réactions, « j'aime » et réponses d'une discussion ; vérification des
--     réactions affichées) : `comment_target_visible(comment_id, post_id)` → `post_is_visible`,
--     soit cinq à six lectures d'index par ligne. 233 000 appels en production, 4 ms en moyenne sur
--     une table de 250 lignes ;
--   · `story_likes` et `story_views` (activité de MA story, jusqu'à 1 000 et 500 lignes) :
--     `story_est_a_moi(story_id)` par ligne ;
--   · `story_comments` (liste et compte exact) : `story_est_a_moi` ET `story_visible` par ligne.
-- C'est le reste de D14-01 après `fil_compteurs` (2026-11-15) et le recul du client (2026-11-20).
--
-- CE QUI CHANGE : quatre fonctions SECURITY DEFINER qui appliquent EXACTEMENT ces règles, mais
-- décident la visibilité UNE fois par cible, comme `fil_compteurs` :
--   · `interactions_cibles(ids, genres, limite)` : une fois par couple (commentaire, fil) présent ;
--   · `story_activite(story)` : `story_est_a_moi` une fois ;
--   · `story_commentaires_lire(story, limite)`, `story_nb_commentaires(story)` : `story_est_a_moi`
--     et `story_visible` une fois.
-- Le contrôle de blocage reste par ligne : il porte sur l'AUTEUR de chaque ligne, pas sur la cible.
-- Elles appellent les fonctions de visibilité EXISTANTES (jamais une copie) : une évolution de
-- `comment_target_visible` ou `story_visible` s'y applique d'elle-même.
-- ⚠️ La garde compare les règles de lecture des quatre tables à celles relues le 2026-11-22 : une
-- règle ajoutée ou modifiée depuis rendrait ces fonctions non équivalentes ; on s'arrête.
--
-- RETOUR ARRIÈRE (éditeur SQL) — le client retombe seul sur sa lecture d'avant :
--| begin;
--| drop function if exists public.interactions_cibles(text[], text[], integer);
--| drop function if exists public.story_activite(text);
--| drop function if exists public.story_commentaires_lire(text, integer);
--| drop function if exists public.story_nb_commentaires(text);
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$
declare
 attendu constant text :=
  'comment_interactions|Lecture selon visibilite de la cible|PERMISSIVE|{public}|((user_id = (( SELECT auth.uid() AS uid))::text) OR comment_target_visible(comment_id, post_id))'
  || chr(10) || 'story_comments|story_comments_select|PERMISSIVE|{authenticated}|(story_est_a_moi(story_id) OR (story_visible(story_id) AND (NOT is_blocked_with(author_id))))'
  || chr(10) || 'story_likes|story_likes_select|PERMISSIVE|{authenticated}|((user_id = (( SELECT auth.uid() AS uid))::text) OR (story_est_a_moi(story_id) AND (NOT is_blocked_with(user_id))))'
  || chr(10) || 'story_views|story_views_select_auteur_story|PERMISSIVE|{authenticated}|(story_est_a_moi(story_id) AND (NOT is_blocked_with(user_id)))'
  || chr(10) || 'story_views|story_views_select_own|PERMISSIVE|{public}|(user_id = (( SELECT auth.uid() AS uid))::text)';
 lu text;
begin
 if to_regprocedure('public.comment_target_visible(text,text)') is null
 or to_regprocedure('public.story_est_a_moi(text)') is null
 or to_regprocedure('public.story_visible(text)') is null
 or to_regprocedure('public.is_blocked_with(text)') is null then
  raise exception 'fonctions de visibilite absentes : relire le catalogue';
 end if;
 select string_agg(tablename || '|' || policyname || '|' || permissive || '|' || roles::text || '|' || coalesce(qual, ''),
                   chr(10) order by tablename, policyname)
   into lu
   from pg_policies
  where schemaname = 'public'
    and tablename in ('comment_interactions', 'story_comments', 'story_likes', 'story_views')
    and cmd in ('SELECT', 'ALL');
 if lu is distinct from attendu then
  raise exception 'regles de lecture differentes de celles relues le 2026-11-22 : les fonctions groupees ne seraient plus equivalentes';
 end if;
end $g$;

-- ── Réactions, « j'aime » et réponses : la visibilité une fois par couple (commentaire, fil) ──
create or replace function public.interactions_cibles(_comment_ids text[], _kinds text[] default null, _limite integer default 1000)
 returns table(id text, comment_id text, post_id text, user_id text, kind text, payload text, created_at timestamptz)
 language sql stable security definer set search_path = '' as $f$
  with cibles as materialized (
    -- 300 identifiants au plus, dédupliqués, sans NULL, bornés APRÈS aplatissement.
    select distinct s.cid
      from (select u.cid from unnest(coalesce(_comment_ids, '{}'::text[])) with ordinality as u(cid, n)
             where u.cid is not null order by u.n limit 300) s
  ),
  lignes as (
    select i.id, i.comment_id, i.post_id, i.user_id, i.kind, i.payload, i.created_at
      from public.comment_interactions i
      join cibles c on c.cid = i.comment_id
     where _kinds is null or i.kind = any(_kinds)
  ),
  -- ⚠️ La règle de lecture, « user_id = moi OR comment_target_visible(comment_id, post_id) »,
  -- décidée ici pour chaque couple présent au lieu de l'être pour chaque ligne.
  fils as materialized (
    select d.comment_id, d.post_id, coalesce(public.comment_target_visible(d.comment_id, d.post_id), false) as visible
      from (select distinct l.comment_id, l.post_id from lignes l) d
  )
  select l.id, l.comment_id, l.post_id, l.user_id, l.kind, l.payload, l.created_at
    from lignes l
   where l.user_id = (select auth.uid())::text
      or exists (select 1 from fils f
                  where f.comment_id = l.comment_id and f.post_id is not distinct from l.post_id and f.visible)
   order by l.created_at, l.id
   limit greatest(1, least(coalesce(_limite, 1000), 1000));
$f$;

-- ── Activité de MA story : vues et « j'aime », la propriété une fois ─────────────────────────
-- Règles : story_views « user_id = moi » OU « story_est_a_moi ET NOT is_blocked_with(user_id) » ;
-- story_likes : la même. Mêmes bornes que le client (500 vues, 1 000 « j'aime »).
create or replace function public.story_activite(_story_id text)
 returns jsonb
 language sql stable security definer set search_path = '' as $f$
  with s as materialized (
    select (select auth.uid())::text as moi, public.story_est_a_moi(_story_id) as mien
  )
  select jsonb_build_object(
    'vues', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', v.user_id, 'seen_at', v.seen_at) order by v.seen_at desc)
        from (select v.user_id, v.seen_at
                from public.story_views v, s
               where v.story_id = _story_id
                 and (v.user_id = s.moi or (s.mien and not public.is_blocked_with(v.user_id)))
               order by v.seen_at desc
               limit 500) v), '[]'::jsonb),
    'jaime', coalesce((
      select jsonb_agg(l.user_id order by l.user_id)
        from (select l.user_id
                from public.story_likes l, s
               where l.story_id = _story_id
                 and (l.user_id = s.moi or (s.mien and not public.is_blocked_with(l.user_id)))
               order by l.user_id
               limit 1000) l), '[]'::jsonb));
$f$;

-- ── Commentaires d'une story : propriété et visibilité une fois ─────────────────────────────
-- Règle : « story_est_a_moi(story_id) OR (story_visible(story_id) AND NOT is_blocked_with(author_id)) ».
create or replace function public.story_commentaires_lire(_story_id text, _limite integer default 300)
 returns table(id text, author_id text, content text, created_at timestamptz)
 language sql stable security definer set search_path = '' as $f$
  with s as materialized (
    select public.story_est_a_moi(_story_id) as mien, public.story_visible(_story_id) as visible
  )
  select c.id, c.author_id, c.content, c.created_at
    from public.story_comments c, s
   where c.story_id = _story_id
     and (s.mien or (s.visible and not public.is_blocked_with(c.author_id)))
   order by c.created_at, c.id
   limit greatest(1, least(coalesce(_limite, 300), 300));
$f$;

create or replace function public.story_nb_commentaires(_story_id text)
 returns integer
 language sql stable security definer set search_path = '' as $f$
  with s as materialized (
    select public.story_est_a_moi(_story_id) as mien, public.story_visible(_story_id) as visible
  )
  select count(*)::integer
    from public.story_comments c, s
   where c.story_id = _story_id
     and (s.mien or (s.visible and not public.is_blocked_with(c.author_id)));
$f$;

-- Droits : les réactions se lisent sans compte (règle « public »), les stories non (règles
-- « authenticated », et aucun droit de table pour `anon` sur story_likes / story_comments).
revoke all on function public.interactions_cibles(text[], text[], integer) from public, anon, authenticated;
revoke all on function public.story_activite(text) from public, anon, authenticated;
revoke all on function public.story_commentaires_lire(text, integer) from public, anon, authenticated;
revoke all on function public.story_nb_commentaires(text) from public, anon, authenticated;
grant execute on function public.interactions_cibles(text[], text[], integer) to anon, authenticated, service_role;
grant execute on function public.story_activite(text) to authenticated, service_role;
grant execute on function public.story_commentaires_lire(text, integer) to authenticated, service_role;
grant execute on function public.story_nb_commentaires(text) to authenticated, service_role;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'quatre fonctions groupées, SECURITY DEFINER, search_path vide' as controle,
       case when (select count(*) from pg_proc p
                   where p.oid in (to_regprocedure('public.interactions_cibles(text[],text[],integer)'),
                                   to_regprocedure('public.story_activite(text)'),
                                   to_regprocedure('public.story_commentaires_lire(text,integer)'),
                                   to_regprocedure('public.story_nb_commentaires(text)'))
                     and p.prosecdef and p.provolatile = 's'
                     and p.proconfig = array['search_path=""']) = 4
            then 'OK' else 'ECHEC' end as valeur
union all select 'réactions : exécutables sans compte comme la table',
       case when has_function_privilege('anon', 'public.interactions_cibles(text[],text[],integer)', 'execute')
             and has_function_privilege('authenticated', 'public.interactions_cibles(text[],text[],integer)', 'execute')
            then 'OK' else 'ECHEC' end
union all select 'stories : réservées aux comptes',
       case when not has_function_privilege('anon', 'public.story_activite(text)', 'execute')
             and not has_function_privilege('anon', 'public.story_commentaires_lire(text,integer)', 'execute')
             and not has_function_privilege('anon', 'public.story_nb_commentaires(text)', 'execute')
             and has_function_privilege('authenticated', 'public.story_activite(text)', 'execute')
             and has_function_privilege('authenticated', 'public.story_commentaires_lire(text,integer)', 'execute')
             and has_function_privilege('authenticated', 'public.story_nb_commentaires(text)', 'execute')
            then 'OK' else 'ECHEC' end
union all select 'règles de lecture inchangées (5 règles, aucune restrictive)',
       case when (select count(*) from pg_policies where schemaname = 'public'
                   and tablename in ('comment_interactions', 'story_comments', 'story_likes', 'story_views')
                   and cmd in ('SELECT', 'ALL')) = 5
             and not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename in ('comment_interactions', 'story_comments', 'story_likes', 'story_views')
                   and cmd in ('SELECT', 'ALL') and permissive = 'RESTRICTIVE')
            then 'OK' else 'ECHEC' end;

commit;
