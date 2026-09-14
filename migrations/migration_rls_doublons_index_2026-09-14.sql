-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — policies en double fusionnées, clés étrangères indexées (PERF-03,
-- contre-revue Astra, 2026-09-14)
--
-- Une transaction, REJOUABLE, verdict en fin (4 lignes). Complète
-- `migration_rls_initplan_2026-09-14.sql` (générée). Ce qui est fait ici a été
-- LU en production avant d'être écrit :
--   · events « Read events » et profiles « Read profiles » : copies exactes
--     (`USING (true)`, SELECT, public) de « Lecture publique » → retirées.
--     Rien ne change : la même lecture publique reste ouverte par l'autre.
--   · conv_members « Suppression propre » (`user_id = moi`) est INCLUSE dans
--     « Suppression admin » (`user_id = moi OR créateur de la conversation`)
--     → retirée. Même ensemble de lignes supprimables.
--   · follows : « Suppression propre » (`follower_id = moi`) et « Suppression
--     cote suivi » (`following_id = moi`) sont deux conditions distinctes →
--     FUSIONNÉES en une seule policy avec OR. Deux permissives = OR : même
--     sémantique, une seule évaluation.
--   · trois clés étrangères sans index (passion_relations.target_passion_id,
--     passion_requests.resolved_passion_id, user_passions.passion_id) : index.
-- Les 13 « index inutilisés » sont laissés : plusieurs viennent d'être créés
-- (moderation_actions) ou servent des chemins rares (rapports, séries) ; en
-- retirer sur une base de 100 lignes n'apporte rien et pourrait manquer.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

drop policy if exists "Read events" on public.events;
drop policy if exists "Read profiles" on public.profiles;
drop policy if exists "Suppression propre" on public.conv_members;

drop policy if exists "Suppression cote suivi" on public.follows;
drop policy if exists "Suppression propre" on public.follows;
create policy "Suppression propre" on public.follows
  as permissive for delete to public
  using ((follower_id = ((select auth.uid()))::text) or (following_id = ((select auth.uid()))::text));

create index if not exists passion_relations_target_idx on public.passion_relations (target_passion_id);
create index if not exists passion_requests_resolved_idx on public.passion_requests (resolved_passion_id);
create index if not exists user_passions_passion_idx on public.user_passions (passion_id);

select 'lecture publique toujours ouverte (events, profiles)' as controle,
       case when (select count(*) from pg_policies where tablename in ('events','profiles') and policyname = 'Lecture publique' and cmd = 'SELECT') = 2 then 'OK' else 'ECHEC' end as valeur
union all select 'plus de doublon SELECT/DELETE sur events, profiles, conv_members, follows',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename in ('events','profiles','conv_members','follows') and permissive = 'PERMISSIVE' group by tablename, cmd having count(*) > 1) then 'ECHEC' else 'OK' end
union all select 'follows : suppression des deux côtés en une policy',
       case when (select qual from pg_policies where tablename='follows' and policyname='Suppression propre') like '%follower_id%' and (select qual from pg_policies where tablename='follows' and policyname='Suppression propre') like '%following_id%' then 'OK' else 'ECHEC' end
union all select '3 index de clés étrangères', case when (select count(*) from pg_indexes where indexname in ('passion_relations_target_idx','passion_requests_resolved_idx','user_passions_passion_idx')) = 3 then 'OK' else 'ECHEC' end;

commit;
