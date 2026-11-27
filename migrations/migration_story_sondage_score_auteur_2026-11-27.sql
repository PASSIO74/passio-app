-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SONDAGE DES STORIES : LE SCORE SE COMPTE DU POINT DE VUE DE L'AUTEUR (2026-11-27)
-- Correctif de sécurité de `story_sondage_resultats` (migration_story_sondage_2026-11-26.sql,
-- appliquée en production le 2026-11-26). Trouvé par la red team du sondage des BOBINES, qui avait
-- recopié la même règle.
--
-- LE DÉFAUT — un oracle qui désanonymise les votants :
--   Le score excluait les votes des comptes « en blocage avec moi » : `not is_blocked_with(v.user_id)`,
--   évalué sous l'APPELANT. Or chacun pose et retire ses blocages lui-même (règle C-04) :
--     1. un votant V lit le score de la story : {"a":12,"b":7} ;
--     2. V bloque X (`blocks` n'a pas de clé étrangère, aucune notification ne part) ;
--     3. V relit : {"a":11,"b":7} — X a voté la première réponse ;
--     4. V débloque X.
--   La story reste visible pour V (X n'en est pas l'auteur). 60 blocages par minute : toute la liste
--   des votants se lisait en quelques minutes. Mesuré en production le 2026-11-27 (canal ①) :
--   définition en place (md5(prosrc) 802080b2e971296ce870f16341ed8ebf), 0 vote en base, client
--   allumé (`STORY_SONDAGE_ACTIF = true`).
--
-- LE CORRECTIF : les votes comptés sont ceux que l'AUTEUR de la story lit (hors comptes en blocage
--   avec LUI, dans un sens ou l'autre) — le même score pour tous les spectateurs, qu'aucun geste
--   d'un spectateur ne fait bouger. Une anti-jointure sur `blocks_pkey`, plus un appel de fonction
--   par vote. Rien d'autre ne change : mêmes réponses `null` / `{a_vote:false}`, même forme JSON,
--   mêmes droits. Aucun prérequis client.
--
-- Une transaction, REJOUABLE, tableau de verdict en fin — il LÈVE si une ligne est en ÉCHEC.
--
-- RETOUR ARRIÈRE (éditeur SQL) — remet la définition du 2026-11-26, oracle compris :
--| begin;
--| set local lock_timeout = '3s';
--| create or replace function public.story_sondage_resultats(_story_id text) returns jsonb
--| language sql stable security definer set search_path = '' as $fn$
--|   select case
--|     when auth.uid() is null or not public.story_visible(_story_id) then null
--|     when not public.story_est_a_moi(_story_id)
--|          and not exists (select 1 from public.story_sondage_votes v
--|                           where v.story_id = _story_id and v.user_id = (auth.uid())::text)
--|       then jsonb_build_object('a_vote', false)
--|     else jsonb_build_object(
--|       'a_vote', true,
--|       'mon_choix', (select v.choix from public.story_sondage_votes v
--|                      where v.story_id = _story_id and v.user_id = (auth.uid())::text),
--|       'a', (select count(*) from public.story_sondage_votes v where v.story_id = _story_id and v.choix = 0
--|              and not public.is_blocked_with(v.user_id)),
--|       'b', (select count(*) from public.story_sondage_votes v where v.story_id = _story_id and v.choix = 1
--|              and not public.is_blocked_with(v.user_id)))
--|   end
--| $fn$;
--| commit;
-- État d'arrivée attendu : `pg_get_functiondef('public.story_sondage_resultats(text)'::regprocedure)`
-- contient de nouveau `is_blocked_with(v.user_id)`.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── GARDE : ce que la fonction lit doit exister tel qu'attendu ───────────────────────────────────
do $garde$
begin
  if to_regclass('public.story_sondage_votes') is null
     or to_regclass('public.stories') is null
     or to_regclass('public.blocks') is null
     or to_regprocedure('public.story_sondage_resultats(text)') is null
     or to_regprocedure('public.story_visible(text)') is null
     or to_regprocedure('public.story_est_a_moi(text)') is null then
    raise exception 'story_sondage_score_auteur : prérequis absent (story_sondage_votes, stories, blocks, story_sondage_resultats, story_visible, story_est_a_moi) — migration_story_sondage_2026-11-26.sql est-elle appliquée ?';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'blocks' and column_name in ('blocker_id', 'blocked_id')) <> 2
     or (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'stories' and column_name = 'author_id') <> 1 then
    raise exception 'story_sondage_score_auteur : colonnes attendues absentes (blocks.blocker_id / blocked_id, stories.author_id)';
  end if;
end
$garde$;

-- ── Les résultats, du point de vue de l'auteur ───────────────────────────────────────────────────
-- `null` : pas de compte, ou pas une story que je vois. `{a_vote:false}` : je la vois, je n'ai pas
-- voté, elle n'est pas à moi. Sinon les comptes — hors comptes en blocage avec l'AUTEUR (la liste
-- qu'il lit), jamais selon les blocages de l'appelant (voir l'en-tête : c'était un oracle).
create or replace function public.story_sondage_resultats(_story_id text) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null or not public.story_visible(_story_id) then null
    when not public.story_est_a_moi(_story_id)
         and not exists (select 1 from public.story_sondage_votes v
                          where v.story_id = _story_id and v.user_id = (auth.uid())::text)
      then jsonb_build_object('a_vote', false)
    else (
      select jsonb_build_object(
               'a_vote', true,
               'mon_choix', (select m.choix from public.story_sondage_votes m
                              where m.story_id = _story_id and m.user_id = (auth.uid())::text),
               'a', count(*) filter (where v.choix = 0),
               'b', count(*) filter (where v.choix = 1))
        from public.stories s
        join public.story_sondage_votes v on v.story_id = s.id
       where s.id = _story_id
         and not exists (select 1 from public.blocks b
                          where (b.blocker_id = s.author_id and b.blocked_id = v.user_id)
                             or (b.blocker_id = v.user_id and b.blocked_id = s.author_id)))
  end
$fn$;
revoke all on function public.story_sondage_resultats(text) from public, anon;
grant execute on function public.story_sondage_resultats(text) to authenticated;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
create temp table _verdict_story_score on commit drop as
select * from (values
  (1, 'story_sondage_resultats : SECURITY DEFINER, search_path vide',
     (select p.prosecdef and p.proconfig @> array['search_path=""']
        from pg_proc p where p.oid = 'public.story_sondage_resultats(text)'::regprocedure)),
  (2, 'exécutable par authenticated, ni par anon ni par public',
     has_function_privilege('authenticated', 'public.story_sondage_resultats(text)', 'execute')
     and not has_function_privilege('anon', 'public.story_sondage_resultats(text)', 'execute')
     and not has_function_privilege('public', 'public.story_sondage_resultats(text)', 'execute')),
  (3, 'le score ne dépend plus des blocages de l''appelant : anti-jointure sur l''auteur',
     pg_get_functiondef('public.story_sondage_resultats(text)'::regprocedure) not like '%is_blocked_with(v.user_id)%'
     and pg_get_functiondef('public.story_sondage_resultats(text)'::regprocedure) like '%b.blocker_id = s.author_id and b.blocked_id = v.user_id%'
     and pg_get_functiondef('public.story_sondage_resultats(text)'::regprocedure) like '%b.blocker_id = v.user_id and b.blocked_id = s.author_id%'),
  (4, 'story_sondage_votes inchangée : RLS active, 2 policies, hors publication',
     (select relrowsecurity from pg_class where oid = 'public.story_sondage_votes'::regclass)
     and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'story_sondage_votes') = 2
     and not exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'story_sondage_votes'))
) as v(n, controle, ok_bool);

alter table _verdict_story_score add column valeur text;
update _verdict_story_score set valeur = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, valeur from _verdict_story_score order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_story_score where valeur is distinct from 'OK') then
    raise exception 'story_sondage_score_auteur : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ' order by n) from _verdict_story_score where valeur is distinct from 'OK');
  end if;
end
$verdict$;

commit;
