-- ═════════════════════════════════════════════════
-- AUDIT 2026-11-02 (agent F — performance), DÉCISIONS F-05 / F-06 / F-07
-- tranchées le 2026-11-03 : DDL seulement, aucune donnée touchée.
--
-- Mesuré en production au canal ① (pg_stat_user_indexes sur 173 jours, advisors) :
--  F-05 · `passions_trgm_idx` (2 136 Ko, 1 scan) est le DOUBLON STRICT de
--         `passions_normalized_trgm` (736 Ko, 11 743 scans) — même définition
--         `gin (normalized_label gin_trgm_ops)`. `passions_aliases_gin` (928 Ko) :
--         0 scan depuis le 13/05, la recherche passe par la colonne `recherche`
--         (`passions_recherche_trgm`). Les deux coûtent ~3 Mo de maintien à
--         chacun des 8 259 UPDATE de `passions`, pour rien. Les AUTRES index
--         « jamais lus » (events, reports, moderation_actions) ne sont PAS
--         touchés : tables quasi vides, 0 scan ne prouve pas 0 usage futur.
--  F-06 · La 2ᵉ requête CPU de la base est celle du pilotage sur
--         `telemetry_events` (`kpi.js`, `retention.js` : `env = … and user_id is
--         not null and received_at > … order by received_at desc`, 103 035 appels,
--         54,6 ms de moyenne) : le plan balaie `idx_tel_user` entier puis filtre.
--         Un index partiel `(env, received_at desc) include (user_id) where
--         user_id is not null` la rend bornée par son LIMIT (à remesurer au
--         canal ① après application : EXPLAIN de la requête, § 3.2 du rapport F).
--  F-07 · `realtime.messages` porte DEUX policies SELECT identiques — « Utilisateur
--         reçoit ses messages » et sa jumelle sans accent — écrites `auth.uid()`
--         nu, évalué PAR LIGNE DIFFUSÉE (advisor `auth_rls_initplan` ×2) ; le
--         décodage WAL est le poste CPU n° 1. On garde une seule policy, en
--         `(select auth.uid())`, même prédicat.
--
-- Rejouable ; verdict en fin. RETOUR ARRIÈRE :
--   create index passions_trgm_idx on public.passions using gin (normalized_label gin_trgm_ops);
--   create index passions_aliases_gin on public.passions using gin (aliases);
--   drop index if exists public.idx_tel_env_received_identifies;
--   create policy "Utilisateur recoit ses messages" on realtime.messages for select to authenticated
--     using (realtime.topic() = ('user:' || (auth.uid())::text));
-- ═════════════════════════════════════════════════
begin;

-- ── F-05 : index doublon et index jamais lu ─────────────────────────────────
drop index if exists public.passions_trgm_idx;
drop index if exists public.passions_aliases_gin;

-- ── F-06 : la lecture du pilotage bornée par son LIMIT ──────────────────────
create index if not exists idx_tel_env_received_identifies
  on public.telemetry_events (env, received_at desc) include (user_id)
  where user_id is not null;

-- ── F-07 : une seule policy « user:<uid> », en initplan ─────────────────────
drop policy if exists "Utilisateur recoit ses messages" on realtime.messages;
drop policy if exists "Utilisateur reçoit ses messages" on realtime.messages;
create policy "Utilisateur reçoit ses messages" on realtime.messages
  for select to authenticated
  using (realtime.topic() = ('user:' || (select auth.uid())::text));

-- ── Verdict ──
select 'passions : le doublon et l''index jamais lu sont partis, passions_normalized_trgm reste' as controle,
       case when not exists (select 1 from pg_indexes where schemaname = 'public' and indexname in ('passions_trgm_idx', 'passions_aliases_gin'))
             and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'passions_normalized_trgm') then 'OK' else 'ECHEC' end as valeur
union all select 'telemetry_events : index partiel (env, received_at desc) include (user_id) where user_id is not null',
       case when (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_tel_env_received_identifies')
                 like '%(env, received_at DESC) INCLUDE (user_id) WHERE (user_id IS NOT NULL)' then 'OK' else 'ECHEC' end
union all select 'realtime.messages : une seule policy « user:<uid> », en (select auth.uid())',
       case when (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'Utilisateur re%oit ses messages') = 1
             and (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'Utilisateur reçoit ses messages') like '%( SELECT auth.uid() AS uid)%'
             and (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'Utilisateur reçoit ses messages') like '%realtime.topic() = (''user:''%' then 'OK' else 'ECHEC' end
union all select 'realtime.messages : les autres policies (émettre, recevoir, visiteur) sont intactes',
       case when (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname in ('passio_rt_emettre', 'passio_rt_recevoir', 'passio_rt_recevoir_visiteur')) = 3 then 'OK' else 'ECHEC' end;

commit;
