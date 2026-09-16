-- ═══════════════════════════════════════════════════════════════════════════
-- EXPORT DU COMPTE — un INSTANTANÉ, pas une suite de pages
-- (ASTRA-44, cinquième contre-revue indépendante, 2026-09-15 · EXP-08 / ASTRA-28)
--
-- LE DÉFAUT. `export-compte.js` lisait chaque table par pages (`range`) sur un
-- ordre total, demandait un compte exact et détectait les doublons. Reproduit :
-- 1 001 lignes ; première page lue ; une ligne DÉJÀ LUE supprimée et une autre
-- ajoutée en fin ; la seconde page, lue par POSITION, commence une ligne trop
-- loin — une ligne présente du début à la fin est OMISE. Compte initial et
-- final égaux (1 001), 1 001 identifiants distincts, `complet: true`.
-- Une pagination par clé aurait évité ce cas précis, mais aucune pagination
-- ne donne un instantané de TOUTES les tables : entre deux requêtes PostgREST,
-- le monde bouge.
--
-- LE CONTRAT TEMPOREL DE L'EXPORT, désormais : « toutes les lignes du dossier
-- proviennent d'UN SEUL instantané PostgreSQL (`pg_current_snapshot()`,
-- reporté dans le dossier). Toute écriture validée AVANT cet instant y est ;
-- aucune écriture validée APRÈS n'y est. » C'est exactement ce qu'offre une
-- fonction STABLE : toutes les requêtes qu'elle exécute — SPI comprises — se
-- font sous le snapshot de l'ordre appelant (docs/xfunc-volatility). Une
-- fonction VOLATILE prendrait un snapshot par requête et ne le garantirait pas.
--
-- ⚠️ `p_verrou` N'EST PAS UNE OPTION DE PRODUCTION : c'est la prise de la
-- contre-épreuve (`tests/sql/migration-export-instantane.test.sh`). Quand il est
-- fourni, la fonction attend ce verrou consultatif APRÈS la lecture de la
-- première table — le banc modifie alors les tables pendant l'attente, et
-- vérifie que le dossier n'en voit rien. Sans lui (tous les appels réels),
-- rien n'attend. Prendre un verrou dans une fonction STABLE est permis (ce
-- n'est pas une écriture) et ne change pas le snapshot.
--
-- La LISTE (table, colonne) est la copie SQL de `tablesExport()`
-- (export-compte.js = TABLES_COMPTE − EXCLUS_EXPORT). Deux contrôles la
-- comparent à l'original : `tests/unit/export-compte.test.mjs` (« couverture »)
-- et le banc SQL, dont le socle est dérivé de `tablesExport()`.
--
-- Rejouable. Verdict en fin. Retour arrière :
--   drop function if exists public.export_compte_instantane(text, integer, bigint);
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.export_compte_instantane(p_uid text, p_plafond integer default 5000, p_verrou bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  paires   text[][] := array[
    ['posts', 'author_id'],
    ['post_likes', 'user_id'],
    ['post_comments', 'author_id'],
    ['post_collaborators', 'user_id'],
    ['comment_interactions', 'user_id'],
    ['comment_likes', 'user_id'],
    ['stories', 'author_id'],
    ['story_views', 'user_id'],
    ['events', 'author_id'],
    ['event_attendees', 'user_id'],
    ['event_comments', 'author_id'],
    ['event_reactions', 'user_id'],
    ['conv_messages', 'from_id'],
    ['conv_members', 'user_id'],
    ['conv_reads', 'user_id'],
    ['call_invites', 'from_id'],
    ['call_invites', 'to_id'],
    ['notifications', 'user_id'],
    ['follows', 'follower_id'],
    ['blocks', 'blocker_id'],
    ['push_subscriptions', 'user_id'],
    ['user_state', 'user_id'],
    ['user_safety', 'user_id'],
    ['user_passions', 'user_id'],
    ['passion_quotas', 'user_id'],
    ['passion_requests', 'user_id'],
    ['step_interactions', 'user_id'],
    ['video_lives', 'author_id'],
    ['cdv_lives', 'author_id'],
    ['cdv_live_steps', 'author_id'],
    ['cdv_live_comments', 'author_id'],
    ['cdv_live_reactions', 'user_id'],
    ['cdv_live_followers', 'user_id'],
    ['cdv_live_collaborators', 'user_id'],
    ['profiles', 'id']
  ];
  i         integer;
  t         text;
  c         text;
  a_created boolean;
  a_id      boolean;
  ordre     text;
  lignes    jsonb;
  attendu   bigint;
  tables    jsonb := '{}'::jsonb;
  absentes  text[] := '{}';
  plafond   integer := greatest(coalesce(p_plafond, 5000), 1);
begin
  if p_uid is null or p_uid = '' then raise exception 'export_compte_instantane : uid obligatoire'; end if;
  for i in 1 .. array_length(paires, 1) loop
    t := paires[i][1]; c := paires[i][2];
    if to_regclass('public.' || t) is null then
      absentes := absentes || (t || '.' || c);
      continue;
    end if;
    if not exists (select 1 from pg_attribute where attrelid = to_regclass('public.' || t) and attname = c and not attisdropped) then
      absentes := absentes || (t || '.' || c);
      continue;
    end if;
    a_created := exists (select 1 from pg_attribute where attrelid = to_regclass('public.' || t) and attname = 'created_at' and not attisdropped);
    a_id      := exists (select 1 from pg_attribute where attrelid = to_regclass('public.' || t) and attname = 'id' and not attisdropped);
    ordre := case when a_created and a_id then 'created_at, id' when a_id then 'id' when a_created then 'created_at' else null end;
    -- Le compte et les lignes viennent du MÊME snapshot : ils ne peuvent pas
    -- diverger. `attendu` est rendu quand même, pour que le client le confronte.
    execute format('select count(*) from public.%I where %I::text = $1', t, c) into attendu using p_uid;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select * from public.%I where %I::text = $1 %s limit $2) x',
      t, c, case when ordre is null then '' else 'order by ' || ordre end)
      into lignes using p_uid, plafond;
    tables := tables || jsonb_build_object(t || '.' || c, jsonb_build_object(
      'lignes', lignes,
      'attendu', attendu,
      'tronque', attendu > plafond,
      'ordre', ordre,
      'ordre_total', a_id));
    -- La prise du banc : après la PREMIÈRE table lue, on attend le verrou. Le
    -- snapshot, lui, est déjà pris depuis le début de l'ordre appelant.
    if p_verrou is not null and i = 1 then perform pg_advisory_xact_lock(p_verrou); end if;
  end loop;
  return jsonb_build_object(
    'instantane', pg_current_snapshot()::text,
    'prise_le', now(),
    'plafond', plafond,
    'tables', tables,
    'absentes', absentes);
end $$;

comment on function public.export_compte_instantane(text, integer, bigint) is
  'Export d''un compte sous UN snapshot (fonction STABLE) : toutes les tables lues au même instant (ASTRA-44). p_verrou = prise de banc, jamais en production.';

revoke execute on function public.export_compte_instantane(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.export_compte_instantane(text, integer, bigint) to service_role;

-- ── VERDICT ────────────────────────────────────────────────────────────────
select 'la fonction existe, STABLE (un seul snapshot pour toutes ses requêtes)' as controle,
       case when (select provolatile from pg_proc where proname = 'export_compte_instantane') = 's' then 'OK' else 'ECHEC' end as valeur
union all select 'SECURITY DEFINER, search_path vide',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""' from pg_proc where proname = 'export_compte_instantane') then 'OK' else 'ECHEC' end
union all select 'service_role seul peut l''appeler',
       case when has_function_privilege('service_role', 'public.export_compte_instantane(text, integer, bigint)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.export_compte_instantane(text, integer, bigint)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.export_compte_instantane(text, integer, bigint)', 'EXECUTE')
            then 'OK' else 'ECHEC' end
union all select 'le dossier porte le snapshot et l''heure de prise',
       case when (select prosrc from pg_proc where proname = 'export_compte_instantane') like '%pg_current_snapshot()::text%' then 'OK' else 'ECHEC' end;

commit;
