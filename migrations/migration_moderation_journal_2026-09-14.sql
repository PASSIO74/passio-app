-- ═══════════════════════════════════════════════════════════════════════════
-- MODÉRATION — les stories se signalent, et chaque décision laisse une trace
-- (MOD-01 / MOD-03 / AUTH-11 / MOD-09, contre-revue Astra, 2026-09-14)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (4 lignes).
--
-- CE QUI MANQUAIT (mesuré le 2026-09-14) : `reports.target_type` n'admet pas
-- `story` — aucune story ne pouvait être signalée (la porte n'existait pas
-- côté client non plus) ; aucune table `moderation_actions` : une décision
-- (retrait, rejet) ne laissait que `reports.status` + une note, sans journal
-- de CE QUI a été fait sur QUELLE cible — le DSA (art. 17) et la conservation
-- promise par la politique de confidentialité (« le temps de traiter l'affaire
-- et d'en garder la trace ») supposent ce journal.
--
-- CE QUI CHANGE, et rien d'autre :
--   · `reports_target_type_chk` admet `story` ;
--   · `moderation_actions` : journal des décisions — signalement, action
--     (retrait · rejet · note), cible, note, date. RLS active, AUCUNE policy,
--     aucun GRANT client : seul `service_role` (l'outil `scripts/moderation.js`,
--     canal ② d'ADR-012) y écrit et y lit. Un signalement supprimé ne supprime
--     pas la trace (`on delete set null`).
-- Les notifications de décision au signalant sont des lignes `notifications`
-- ordinaires (kind `moderation`), écrites par l'outil avec `service_role`.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table public.reports drop constraint if exists reports_target_type_chk;
alter table public.reports add constraint reports_target_type_chk
  check (target_type is null or target_type in ('user', 'post', 'comment', 'event', 'passion', 'message', 'story'));

create table if not exists public.moderation_actions (
  id          text primary key default ('ma_' || replace(gen_random_uuid()::text, '-', '')),
  report_id   text references public.reports(id) on delete set null,
  action      text not null check (action in ('retrait', 'rejet', 'note')),
  target_type text check (target_type is null or char_length(target_type) <= 40),
  target_id   text check (target_id is null or char_length(target_id) <= 120),
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;
create index if not exists moderation_actions_report_idx on public.moderation_actions (report_id);

select 'story signalable' as controle,
       case when pg_get_constraintdef((select oid from pg_constraint where conname = 'reports_target_type_chk')) like '%story%' then 'OK' else 'ECHEC' end as valeur
union all select 'journal moderation_actions', case when exists (select 1 from information_schema.tables where table_name = 'moderation_actions') then 'OK' else 'ECHEC' end
union all select 'journal : RLS active, aucune policy', case when (select relrowsecurity from pg_class where relname = 'moderation_actions') and not exists (select 1 from pg_policies where tablename = 'moderation_actions') then 'OK' else 'ECHEC' end
union all select 'journal : aucun droit client', case when has_table_privilege('anon', 'public.moderation_actions', 'SELECT') or has_table_privilege('authenticated', 'public.moderation_actions', 'SELECT') then 'ECHEC' else 'OK' end;

commit;
