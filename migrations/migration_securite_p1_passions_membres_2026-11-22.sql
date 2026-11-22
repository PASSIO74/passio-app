-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ P1 2026-11-22 — D10-03 : LES PASSIONS D'UN MEMBRE NE SE LISENT PLUS QUE PAR LUI
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun PREREQUIS-CLIENT : le client ne LIT
-- jamais `user_passions` (relu le 2026-11-22 : js/ n'y fait qu'un `upsert` et un `delete` filtrés
-- sur son propre compte, `supaMiroirUserPassions`, app-08). Les fonctions qui la lisent pour un
-- autre compte sont toutes SECURITY DEFINER, sans droit d'exécution pour `anon` ; aucune policy ni
-- aucune vue ne la nomme ; elle n'est pas publiée en temps réel.
-- Banc : tests/sql/migration-securite-p1-passions-membres-2026-11-22.test.sh.
--
-- POURQUOI : `user_passions` est la table qui grossit avec le nombre de membres (une ligne par
-- passion et par membre), et elle était lisible EN ENTIER, sans compte, par une règle `true`. Une
-- lecture imbriquée sans compte qui la traverse coûte d'autant plus que l'audience grandit — c'est
-- la plus chère qui restait ouverte après la fermeture des liens du référentiel (2026-11-20).
-- pg_stat_statements (cumul depuis le 13/05) : 6 appels de `anon` sur cette table, tous des sondes
-- d'audit ; aucun de l'application.
--
-- CE QUI CHANGE :
--   ① `anon` perd tout droit sur `user_passions` : une imbrication sans compte qui la traverse est
--     refusée en entier (42501).
--   ② la règle de lecture `user_passions_select_all` (`true`, pour tous les rôles) devient
--     `user_passions_select_own` : un compte connecté ne lit que SES lignes. C'est tout ce dont
--     l'`upsert … on conflict` et le `delete` du client ont besoin.
--   Écriture, mise à jour et suppression gardent leurs règles (sur son propre compte).
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| drop policy if exists user_passions_select_own on public.user_passions;
--| create policy user_passions_select_all on public.user_passions for select to public using (true);
--| grant select on public.user_passions to anon;
--| commit;
-- (SELECT seul pour `anon` : il n'a jamais eu à écrire dans cette table.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $g$ begin
 if to_regclass('public.user_passions') is null then
  raise exception 'user_passions absente : relire le schema';
 end if;
 if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_passions'
                 and policyname in ('user_passions_select_all', 'user_passions_select_own') and cmd = 'SELECT') then
  raise exception 'regle de lecture de user_passions inconnue : relire le catalogue';
 end if;
 -- Une policy d'une AUTRE table, ou une vue, qui lirait user_passions sous l'identité de l'appelant
 -- se mettrait à rendre vide (ou 42501) sans un mot : on s'arrête plutôt.
 if exists (select 1 from pg_policies where tablename <> 'user_passions'
             and coalesce(qual, '') || coalesce(with_check, '') ilike '%user_passions%')
 or exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('v', 'm')
               and pg_get_viewdef(c.oid) ilike '%user_passions%')
 or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and not p.prosecdef and p.prosrc ilike '%user_passions%') then
  raise exception 'un objet lit user_passions sous l identite de l appelant : relire avant de fermer';
 end if;
end $g$;

-- ── ① Aucune lecture ni écriture sans compte ───────────────────────────────────────────────────
revoke all on public.user_passions from anon;

-- ── ② Un compte ne lit que ses propres lignes ───────────────────────────────────────────────────
drop policy if exists user_passions_select_all on public.user_passions;
drop policy if exists user_passions_select_own on public.user_passions;
create policy user_passions_select_own on public.user_passions for select to authenticated
 using (user_id = (select auth.uid())::text);

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'user_passions : aucun droit pour anon' as controle,
       case when not has_table_privilege('anon', 'public.user_passions', 'SELECT')
             and not has_table_privilege('anon', 'public.user_passions', 'INSERT,UPDATE,DELETE')
            then 'OK' else 'ECHEC' end as valeur
union all select 'user_passions : lecture de ses seules lignes',
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_passions' and cmd = 'SELECT') = 1
             and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_passions'
                          and policyname = 'user_passions_select_own' and cmd = 'SELECT'
                          and roles = '{authenticated}' and qual like '%auth.uid()%')
            then 'OK' else 'ECHEC' end
union all select 'user_passions : écriture du client inchangée',
       case when has_table_privilege('authenticated', 'public.user_passions', 'SELECT')
             and has_table_privilege('authenticated', 'public.user_passions', 'INSERT')
             and has_table_privilege('authenticated', 'public.user_passions', 'UPDATE')
             and has_table_privilege('authenticated', 'public.user_passions', 'DELETE')
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_passions'
                   and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 3
            then 'OK' else 'ECHEC' end
union all select 'user_passions : RLS active',
       case when (select relrowsecurity from pg_class where oid = 'public.user_passions'::regclass) then 'OK' else 'ECHEC' end;

commit;
