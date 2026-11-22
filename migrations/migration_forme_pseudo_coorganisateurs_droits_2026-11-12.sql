-- ═══════════════════════════════════════════════════════════
-- CLI-01, CÔTÉ SERVEUR — LE DROIT D'EXÉCUTER LA FONCTION DE LA CONTRAINTE (2026-11-12)
--
-- Une transaction, FERMÉE SUR ÉCHEC (SQLSTATE 55000 avant `commit;`).
--
-- LE DÉFAUT, CRÉÉ PAR `migration_forme_pseudo_coorganisateurs_2026-11-12.sql` ET VU
-- PAR LA CI AU STAGING (12/11, ~14:38 UTC) : la contrainte `events_co_organizers_tableau`
-- appelle `public.jsonb_tableau_uuid`, et une contrainte CHECK s'évalue avec les
-- droits de CELUI QUI ÉCRIT. Le projet ne donne pas `execute` par défaut aux rôles
-- clients sur une fonction neuve : tout INSERT/UPDATE d'activité depuis l'application
-- échouait en 42501 « permission denied for function jsonb_tableau_uuid ».
-- L'épreuve de la migration écrivait sous `postgres` : elle ne pouvait pas le voir.
--
-- LE CORRECTIF : `grant execute` aux rôles qui écrivent des activités (la fonction
-- est IMMUTABLE, sans effet, sans lecture de table), et une épreuve SOUS LE RÔLE
-- `authenticated`, avec jeton, dans une sous-transaction annulée.
--
-- Canal ③ d'ADR-012 : `node scripts/appliquer-migration.mjs migrations/migration_forme_pseudo_coorganisateurs_droits_2026-11-12.sql --projet <ref>`
-- À appliquer APRÈS `migration_forme_pseudo_coorganisateurs_2026-11-12.sql`, sur chaque cible.
-- RETOUR ARRIÈRE : celui de la migration précédente (retirer la contrainte) — retirer
-- le droit seul recasserait l'écriture des activités.
-- ═══════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.jsonb_tableau_uuid(jsonb, integer)') is null then
    raise exception 'jsonb_tableau_uuid absente : appliquer d''abord migration_forme_pseudo_coorganisateurs_2026-11-12.sql — RIEN n''est appliqué'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

grant execute on function public.jsonb_tableau_uuid(jsonb, integer) to anon, authenticated, service_role;

-- ── ÉPREUVE : une activité écrite SOUS LE RÔLE `authenticated`, annulée ──
do $epreuve$
declare
  sfx constant text := left(md5(clock_timestamp()::text || random()::text), 8);
  u   constant text := '00000000-0000-4000-8000-0000000c1102';
  mes jsonb := '{}'::jsonb;
  t   record;
  etat text;
begin
  begin
    insert into public.profiles (id, username, is_private) values (u, 'zz cli01d ' || sfx, false);
    -- La policy d'INSERT exige la majorité déclarée (`adult_access_allowed`).
    insert into public.user_safety (user_id, majority_at) values (u, current_date - 7000);
    for t in select * from (values
        ('vide', '[]'), ('uuid', '["3e7d1c9a-5b2f-4a8e-9c6d-0f1e2d3c4b5a"]'), ('pseudo', '["x\" onclick=\"a"]')) as x(cle, v)
    loop
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', u, true);
      begin
        insert into public.events (id, organizer_id, author_id, title, co_organizers)
          values ('zz_cli01d_' || t.cle || '_' || sfx, u, u, 'Banc', t.v::jsonb);
        etat := 'ok';
      exception when others then etat := sqlstate;
      end;
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      mes := mes || jsonb_build_object(t.cle, etat);
    end loop;
    raise exception 'zz_cli01d_annule';
  exception when others then
    if sqlerrm <> 'zz_cli01d_annule' then mes := mes || jsonb_build_object('erreur', sqlstate || ' ' || sqlerrm); end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('passio.verdict_cli01d', mes::text, true);
end $epreuve$;

create temp table passio_cli01d_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
with v as (select current_setting('passio.verdict_cli01d', true)::jsonb j)
insert into pg_temp.passio_cli01d_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout', case when j ? 'erreur' then 'ECHEC — ' || (j ->> 'erreur') else 'OK' end from v
union all select 2, true, 'un compte crée une activité sans co-organisateur, et avec un uuid',
  case when j ->> 'vide' = 'ok' and j ->> 'uuid' = 'ok' then 'OK' else 'ECHEC — ' || j::text end from v
union all select 3, true, 'un compte ne peut pas glisser un pseudo comme co-organisateur (23514)',
  case when j ->> 'pseudo' = '23514' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'pseudo', '-') end from v
union all select 4, true, 'les rôles clients ont le droit d''exécuter la fonction de la contrainte',
  case when has_function_privilege('authenticated', 'public.jsonb_tableau_uuid(jsonb, integer)', 'execute')
        and has_function_privilege('anon', 'public.jsonb_tableau_uuid(jsonb, integer)', 'execute')
       then 'OK' else 'ECHEC' end
union all select 5, true, 'aucune ligne d''essai ne reste',
  (select case when (select count(*) from public.events where id like 'zz\_cli01d\_%') = 0 then 'OK' else 'ECHEC' end);

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_cli01d_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'droit de la contrainte des co-organisateurs : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_cli01d_verdict order by n;

commit;
