-- ═════════════════════════════════════════════════
-- AUDIT 2026-11-02 (agent C — données et sécurité) : TROIS FERMETURES SERVEUR
--
-- Mesuré en production le 2026-11-02 au canal ① (execute_sql, lecture seule),
-- sous les rôles réels (set_config request.jwt.claims) :
--
-- ① `conv_reads` acceptait un INSERT (`reads_upsert`, WITH CHECK `user_id = me`)
--    SANS vérifier l'appartenance à la conversation : 9 lignes « non membre »
--    en base (comptes vivants, dernier accusé le 2026-09-03). Un compte pouvait
--    donc poser un accusé de lecture dans N'IMPORTE QUELLE conversation (dont
--    les `evgrp_<event>` publics) — et comme la policy SELECT des membres rend
--    cette ligne, chaque membre voyait un « lu par » d'un inconnu ; la
--    publication realtime `conv_reads` la poussait en direct. Nuisance, pas
--    fuite — mais une écriture dans l'espace privé d'autrui. UPDATE
--    (`reads_update`) : un UPDATE filtré est déjà rattrapé par la policy SELECT
--    (PostgreSQL l'applique à la ligne écrite dès que la requête lit une
--    colonne), mais un UPDATE SANS filtre ni lecture (`PATCH /conv_reads` nu,
--    `return=minimal` → `RETURNING 1`) DÉPLACE tous mes accusés vers la
--    conversation d'autrui (WITH CHECK ne regardait que `user_id`) — mesuré
--    par le banc ⓪. La clause
--    reprend l'autorité déjà en place sur `conv_messages` :
--    `is_conv_member(conv_id, auth.uid())`, et les deux policies passent au
--    rôle `authenticated` (un visiteur n'a rien à y écrire).
--
-- ② `post_masque(p_id)` est exécutable par `anon` et `authenticated` alors que la
--    table `contenus_masques` qu'elle lit est fermée (aucun grant) : un appel
--    RPC direct dit si un identifiant de post est masqué par la modération.
--    DÉCISION : ON NE TOUCHE PAS. La policy RESTRICTIVE « Masquage apres
--    signalements » de `posts` l'appelle au rôle courant — révoquer EXECUTE
--    ferait lever « permission denied » sur TOUTE lecture de `posts` (même
--    piège que `is_conv_member` le 11/09) ; et l'information révélée (« ce
--    post est masqué ») est déjà déductible : la ligne disparaît du fil pour
--    tous sauf l'auteur. Oracle assumé, consigné pour ne pas être redécouvert.
--    Le contrôle ② ci-dessous vérifie qu'elle RESTE exécutable (délibéré).
--
-- ③ Privilèges TRUNCATE / REFERENCES / TRIGGER / MAINTAIN accordés à `anon` et
--    `authenticated` sur ~40 tables (défaut Supabase : GRANT ALL). Aucun ne passe
--    par la RLS. PostgREST n'expose pas TRUNCATE, mais une connexion SQL au rôle
--    `authenticated` (fuite future du mot de passe `authenticator`, extension,
--    fonction SECURITY DEFINER faisant `set role`) viderait une table d'un
--    seul ordre. Défense en profondeur, sans effet fonctionnel : on retire ce
--    que l'application n'utilise pas. SELECT/INSERT/UPDATE/DELETE INTACTS.
--
-- Rejouable (idempotent) ; verdict en fin. RETOUR ARRIÈRE :
--   ① drop policy reads_upsert / reads_update ; recréer :
--      create policy reads_upsert on public.conv_reads for insert to public
--        with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
--      create policy reads_update on public.conv_reads for update to public
--        using (user_id = (select auth.uid())::text)
--        with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
--   ③ grant truncate, references, trigger, maintain on all tables in schema public to anon, authenticated;
-- ═════════════════════════════════════════════════
begin;

-- ── ① conv_reads : un accusé de lecture ne se pose que DANS une conversation dont on est membre ──
drop policy if exists reads_upsert on public.conv_reads;
create policy reads_upsert on public.conv_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())::text
    and public.is_conv_member(conv_id, (select auth.uid())::text)
    and not public.suppression_de_mon_compte()
  );

drop policy if exists reads_update on public.conv_reads;
create policy reads_update on public.conv_reads
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (
    user_id = (select auth.uid())::text
    and public.is_conv_member(conv_id, (select auth.uid())::text)
    and not public.suppression_de_mon_compte()
  );

-- ── ③ privilèges hors RLS retirés aux rôles clients (SELECT/INSERT/UPDATE/DELETE intacts) ──
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', r.relname);
    -- MAINTAIN n'existe qu'à partir de PostgreSQL 17 : le banc tourne sur 16, la prod sur 17.6.
    if current_setting('server_version_num')::int >= 170000 then
      execute format('revoke maintain on table public.%I from anon, authenticated', r.relname);
    end if;
  end loop;
end $$;

-- ── Verdict ──
select 'conv_reads INSERT : identité ET appartenance' as controle,
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'conv_reads' and policyname = 'reads_upsert') like '%is_conv_member(conv_id%'
             and (select with_check from pg_policies where schemaname = 'public' and tablename = 'conv_reads' and policyname = 'reads_upsert') like '%user_id = %auth.uid()%' then 'OK' else 'ECHEC' end as valeur
union all select 'conv_reads UPDATE : identité ET appartenance',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'conv_reads' and policyname = 'reads_update') like '%is_conv_member(conv_id%' then 'OK' else 'ECHEC' end
union all select 'conv_reads : les deux policies d''écriture au rôle authenticated seul',
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'conv_reads' and cmd in ('INSERT','UPDATE') and roles::text = '{authenticated}') = 2 then 'OK' else 'ECHEC' end
union all select 'conv_reads SELECT : intacte (membres)',
       case when (select qual from pg_policies where schemaname = 'public' and tablename = 'conv_reads' and policyname = 'reads_select') like '%is_conv_member%' then 'OK' else 'ECHEC' end
union all select 'is_conv_member : SECURITY DEFINER, search_path vide, exécutable par authenticated',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""' from pg_proc where proname = 'is_conv_member' limit 1)
             and has_function_privilege('authenticated', 'public.is_conv_member(text,text)', 'execute') then 'OK' else 'ECHEC' end
union all select 'post_masque : toujours exécutable par les rôles clients (la RESTRICTIVE de posts l''exige — délibéré, voir en-tête)',
       case when has_function_privilege('anon', 'public.post_masque(text)', 'execute') and has_function_privilege('authenticated', 'public.post_masque(text)', 'execute') then 'OK' else 'ECHEC' end
union all select 'aucune table de public ne donne TRUNCATE / REFERENCES / TRIGGER à anon ou authenticated',
       case when not exists (
         select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
             or has_table_privilege('anon', c.oid, 'REFERENCES') or has_table_privilege('authenticated', c.oid, 'REFERENCES')
             or has_table_privilege('anon', c.oid, 'TRIGGER') or has_table_privilege('authenticated', c.oid, 'TRIGGER'))) then 'OK' else 'ECHEC' end
union all select 'les droits applicatifs restent : authenticated lit et écrit posts, anon lit profiles',
       case when has_table_privilege('authenticated', 'public.posts', 'SELECT') and has_table_privilege('authenticated', 'public.posts', 'INSERT')
             and has_table_privilege('authenticated', 'public.posts', 'UPDATE') and has_table_privilege('authenticated', 'public.posts', 'DELETE')
             and has_table_privilege('anon', 'public.profiles', 'SELECT') then 'OK' else 'ECHEC' end;

commit;
