-- ═════════════════════════════════════════════════
-- MODÉRATION — la suspension d'un compte est une décision consignée
-- (MOD-01, résidu « pas de suspension de compte », 2026-09-15)
--
-- Le journal `moderation_actions` (14/09) n'admettait que retrait / rejet /
-- note : suspendre un compte n'avait ni geste, ni trace. La suspension
-- elle-même vit dans `auth.users.banned_until` (API d'administration GoTrue,
-- `ban_duration`) — ce n'est pas une colonne de `public`, rien à créer ici.
-- Cette migration ouvre le journal à deux actions : `suspension` (compte
-- banni N jours) et `levee` (ban retiré avant terme). Rejouable ; verdict en fin.
-- Retour arrière : remettre la contrainte à ('retrait','rejet','note') — les
-- lignes `suspension`/`levee` devraient être supprimées d'abord.
-- ═════════════════════════════════════════════════
begin;

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions
  add constraint moderation_actions_action_check
  check (action in ('retrait', 'rejet', 'note', 'suspension', 'levee'));

select 'journal : suspension et levee admises' as controle,
       case when pg_get_constraintdef((select oid from pg_constraint where conname = 'moderation_actions_action_check')) like '%suspension%'
             and pg_get_constraintdef((select oid from pg_constraint where conname = 'moderation_actions_action_check')) like '%levee%' then 'OK' else 'ECHEC' end as valeur
union all select 'journal : une action inconnue reste refusée',
       case when pg_get_constraintdef((select oid from pg_constraint where conname = 'moderation_actions_action_check')) like '%action = ANY%' then 'OK' else 'ECHEC' end
union all select 'journal : toujours sans droit client',
       case when has_table_privilege('anon', 'public.moderation_actions', 'SELECT') or has_table_privilege('authenticated', 'public.moderation_actions', 'INSERT') then 'ECHEC' else 'OK' end;

commit;
