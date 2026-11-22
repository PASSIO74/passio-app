-- ═══════════════════════════════════════════════════════════
-- CLI-01, CÔTÉ SERVEUR : UN PSEUDO SANS CARACTÈRE D'INJECTION, DES CO-ORGANISATEURS
-- QUI SONT DES IDENTIFIANTS (2026-11-12)
-- -- PREREQUIS-CLIENT : nomCompteCaracteresInterdits (app-02, même PR) — le client
--    refuse ces caractères AVANT la base, en français.
--
-- Une transaction, FERMÉE SUR ÉCHEC (SQLSTATE 55000 avant `commit;`).
--
-- LE DÉFAUT (audit de stabilisation du 10/11, CLI-01, P0). Le client a été corrigé et
-- déployé le 10/11 (#823) : l'identifiant d'un profil visité est échappé, et
-- `supaLoadEvents` ne garde que les co-organisateurs de forme uuid. Mais la base
-- laissait passer les deux PRÉMISSES du scénario :
--   · `profiles_username_forme` borne la longueur, les caractères de contrôle et les
--     mots réservés — pas `" < > \` \` ni la barre oblique inverse, qui permettaient
--     un pseudo comme `x" onclick="…` ;
--   · `events_co_organizers_tableau` n'exige que `jsonb_typeof = 'array'` : ses
--     ÉLÉMENTS sont libres, n'importe quelle chaîne y entre.
-- Un client plus ancien, ou un autre client à venir, retrouverait l'injection.
--
-- MESURÉ AU CANAL ① le 12/11 : aucun pseudo ne contient ces caractères ; 10
-- activités, aucun co-organisateur. Les contraintes sont donc posées VALIDÉES.
--
-- CE QUI CHANGE :
--  ① `profiles_username_forme` refuse en plus `"`, `<`, `>`, l'accent grave et `\`
--    (l'apostrophe reste permise : « Zoé d'Annecy ») ;
--  ② `events_co_organizers_tableau` exige un tableau de 0 à 20 chaînes de forme uuid
--    (fonction IMMUTABLE `jsonb_tableau_uuid`, une contrainte ne pouvant pas lire
--    les éléments d'un tableau sans elle).
--
-- Canal ③ d'ADR-012 : `node scripts/appliquer-migration.mjs migrations/migration_forme_pseudo_coorganisateurs_2026-11-12.sql --projet <ref>`
-- RETOUR ARRIÈRE :
--   begin;
--   alter table public.profiles drop constraint profiles_username_forme;
--   alter table public.profiles add constraint profiles_username_forme check (
--     char_length(username) between 1 and 40 and username !~ '[[:cntrl:]]'
--     and public.passion_plier(username) !~ '\m(passio|moderation|moderateur|administrateur|admin|support|securite)\M');
--   alter table public.events drop constraint events_co_organizers_tableau;
--   alter table public.events add constraint events_co_organizers_tableau check (jsonb_typeof(co_organizers) = 'array');
--   commit;
-- ═══════════════════════════════════════════════════════════
begin;

-- ── ⓪ PRÉREQUIS ──
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_forme' and conrelid = 'public.profiles'::regclass) then
    raise exception 'profiles_username_forme absente — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_co_organizers_tableau' and conrelid = 'public.events'::regclass) then
    raise exception 'events_co_organizers_tableau absente — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

-- ── ① LE PSEUDO ──
alter table public.profiles drop constraint profiles_username_forme;
alter table public.profiles add constraint profiles_username_forme check (
  char_length(username) between 1 and 40
  and username !~ '[[:cntrl:]]'
  and username !~ '["<>`\\]'
  and public.passion_plier(username) !~ '\m(passio|moderation|moderateur|administrateur|admin|support|securite)\M'
);

-- ── ② LES CO-ORGANISATEURS ──
create or replace function public.jsonb_tableau_uuid(j jsonb, maxi int)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select jsonb_typeof(j) = 'array'
     and jsonb_array_length(j) <= maxi
     and not exists (
       select 1 from jsonb_array_elements(j) x
        where jsonb_typeof(x) <> 'string'
           or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
$fn$;

alter table public.events drop constraint events_co_organizers_tableau;
alter table public.events add constraint events_co_organizers_tableau
  check (co_organizers is null or public.jsonb_tableau_uuid(co_organizers, 20));

-- ── ÉPREUVE : de VRAIES écritures, dans une sous-transaction ANNULÉE ──
do $epreuve$
declare
  sfx  constant text := left(md5(clock_timestamp()::text || random()::text), 8);
  u    constant text := '00000000-0000-4000-8000-0000000c1101';
  mes  jsonb := '{}'::jsonb;
  t    record;
  etat text;
begin
  begin
    insert into public.profiles (id, username, is_private) values (u, 'zz cli01 ' || sfx, false);
    for t in select * from (values
        ('guillemet', 'x" onclick="a'), ('chevron', 'a<b ' || sfx), ('grave', 'a`b ' || sfx), ('barre', 'a\b ' || sfx),
        ('apostrophe', 'Zoé d''Annecy ' || sfx)) as x(cle, v)
    loop
      begin
        update public.profiles set username = t.v where id = u;
        etat := 'ok';
      exception when others then etat := sqlstate;
      end;
      mes := mes || jsonb_build_object(t.cle, etat);
    end loop;
    for t in select * from (values
        ('co_vide', '[]'), ('co_uuid', '["3e7d1c9a-5b2f-4a8e-9c6d-0f1e2d3c4b5a"]'),
        ('co_pseudo', '["x\" onclick=\"alert(1)"]'), ('co_majuscules', '["3E7D1C9A-5B2F-4A8E-9C6D-0F1E2D3C4B5A"]'),
        ('co_nombre', '[1]')) as x(cle, v)
    loop
      begin
        insert into public.events (id, organizer_id, author_id, title, co_organizers)
          values ('zz_cli01_' || t.cle || '_' || sfx, u, u, 'Banc', t.v::jsonb);
        etat := 'ok';
      exception when others then etat := sqlstate;
      end;
      mes := mes || jsonb_build_object(t.cle, etat);
    end loop;
    raise exception 'zz_cli01_annule';
  exception when others then
    if sqlerrm <> 'zz_cli01_annule' then mes := mes || jsonb_build_object('erreur', sqlstate || ' ' || sqlerrm); end if;
  end;
  perform set_config('passio.verdict_cli01', mes::text, true);
end $epreuve$;

-- ── VERDICT ──
create temp table passio_cli01_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
with v as (select current_setting('passio.verdict_cli01', true)::jsonb j)
insert into pg_temp.passio_cli01_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout', case when j ? 'erreur' then 'ECHEC — ' || (j ->> 'erreur') else 'OK' end from v
union all select 2, true, 'un pseudo à guillemet droit, chevron, accent grave ou barre oblique inverse est refusé (23514)',
  case when j ->> 'guillemet' = '23514' and j ->> 'chevron' = '23514' and j ->> 'grave' = '23514' and j ->> 'barre' = '23514'
       then 'OK' else 'ECHEC — ' || j::text end from v
union all select 3, true, 'un pseudo à apostrophe et accents reste permis',
  case when j ->> 'apostrophe' = 'ok' then 'OK' else 'ECHEC — ' || coalesce(j ->> 'apostrophe', '-') end from v
union all select 4, true, 'co-organisateurs : tableau vide et uuid acceptés',
  case when j ->> 'co_vide' = 'ok' and j ->> 'co_uuid' = 'ok' then 'OK' else 'ECHEC — ' || j::text end from v
union all select 5, true, 'co-organisateurs : pseudo, majuscules et nombre refusés (23514)',
  case when j ->> 'co_pseudo' = '23514' and j ->> 'co_majuscules' = '23514' and j ->> 'co_nombre' = '23514'
       then 'OK' else 'ECHEC — ' || j::text end from v
union all select 6, true, 'au plus 20 co-organisateurs',
  (select case when not public.jsonb_tableau_uuid((select jsonb_agg('3e7d1c9a-5b2f-4a8e-9c6d-0f1e2d3c4b5a'::text) from generate_series(1, 21)), 20)
                and public.jsonb_tableau_uuid((select jsonb_agg('3e7d1c9a-5b2f-4a8e-9c6d-0f1e2d3c4b5a'::text) from generate_series(1, 20)), 20)
               then 'OK' else 'ECHEC' end)
union all select 7, true, 'les deux contraintes sont VALIDÉES sur les lignes existantes',
  (select case when count(*) filter (where convalidated) = 2 then 'OK' else 'ECHEC' end
     from pg_constraint where conname in ('profiles_username_forme', 'events_co_organizers_tableau'))
union all select 8, true, 'aucune ligne d''essai ne reste',
  (select case when (select count(*) from public.events where id like 'zz\_cli01\_%') + (select count(*) from public.profiles where username like 'zz cli01 %') = 0
               then 'OK' else 'ECHEC' end)
union all select 9, false, 'information — profils ; activités',
  (select (select count(*) from public.profiles) || ' ; ' || (select count(*) from public.events));

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_cli01_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'forme du pseudo et co-organisateurs : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_cli01_verdict order by n;

commit;
