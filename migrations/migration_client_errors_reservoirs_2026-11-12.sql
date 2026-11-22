-- ═══════════════════════════════════════════════════════════
-- client_errors : UN VISITEUR NE PEUT PLUS FAIRE TAIRE LA REMONTÉE D'ERREURS (2026-11-12, SRV-08)
--
-- Une transaction, FERMÉE SUR ÉCHEC : une ligne de contrôle en ECHEC lève une
-- exception avant `commit;` (SQLSTATE 55000) et RIEN n'est appliqué.
--
-- LE DÉFAUT (audit de stabilisation du 10/11, SRV-08, P3). `client_errors` accepte
-- l'INSERT de tout rôle (`anon` compris) et n'a qu'un plafond GLOBAL :
-- `trg_debit_global` = `limiter_debit_global('created_at', 120)`, 120 lignes par minute
-- TOUTES SOURCES CONFONDUES. 120 insertions anonymes par minute suffisent donc à faire
-- refuser (P0001) toute erreur d'un vrai compte : un angle mort de surveillance
-- provoqué à bas coût. Mesuré au canal ① le 12/11 : 16 lignes en 30 jours, pointe à
-- 11 par minute — les plafonds ci-dessous ne gênent aucun usage réel.
--
-- LE CORRECTIF : trois réservoirs au lieu d'un seul, sur l'identité que la base pose
-- elle-même (`auth_uid`, `client_errors_pose_identite`, déclencheur qui passe AVANT
-- celui-ci par ordre alphabétique) :
--   · visiteurs (auth_uid NULL), tous ensemble : 60 par minute ;
--   · chaque compte : 20 par minute ;
--   · tous les comptes ensemble : 120 par minute.
-- Une rafale anonyme ne touche plus que le réservoir des visiteurs. L'heure reste
-- celle du serveur (ASTRA-02), quoi que le client envoie.
-- CE QUI NE CHANGE PAS : la policy d'INSERT, les droits, les bornes de taille
-- (`aa_ligne_bornee`, `aa_table_bornee`), la barrière de suppression de compte.
--
-- ÉPROUVÉ DANS LA MIGRATION : sous les vrais rôles (`anon`, `authenticated` + jeton),
-- dans une sous-transaction ANNULÉE (aucune ligne d'essai ne reste) : rafale anonyme
-- jusqu'au refus, puis un compte écrit quand même ; un compte seul est arrêté à 20 ;
-- un second compte écrit encore.
--
-- Canal ③ d'ADR-012 : `node scripts/appliquer-migration.mjs migrations/migration_client_errors_reservoirs_2026-11-12.sql --projet <ref>`
-- (staging puis production, après la contre-revue de la PR et son attestation).
-- RETOUR ARRIÈRE :
--   begin;
--   drop trigger if exists trg_debit_reservoirs on public.client_errors;
--   create trigger trg_debit_global before insert on public.client_errors
--     for each row execute function public.limiter_debit_global('created_at', '120');
--   drop function if exists public.client_errors_limiter_debit();
--   commit;
-- (l'index `idx_client_errors_auth_created` peut rester : il ne gêne rien.)
-- ═══════════════════════════════════════════════════════════
begin;

-- ── ⓪ PRÉREQUIS : la base est celle que ce correctif suppose ──
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.client_errors'::regclass and tgname = 'trg_client_errors_identite' and not tgisinternal) then
    raise exception 'client_errors : le déclencheur d''identité manque — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_errors' and column_name = 'auth_uid') then
    raise exception 'client_errors : la colonne auth_uid manque — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

-- ── ① LA FONCTION ──
create or replace function public.client_errors_limiter_debit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n int;
begin
  -- ASTRA-02 : la date est celle du serveur, quoi que le client ait envoyé.
  new.created_at := now();
  if new.auth_uid is null then
    select count(*) into n from public.client_errors
     where auth_uid is null and created_at > now() - interval '1 minute';
    if n >= 60 then
      raise exception 'rate limit: plafond des visiteurs (60 erreurs/minute) atteint sur client_errors' using errcode = 'P0001';
    end if;
  else
    select count(*) into n from public.client_errors
     where auth_uid = new.auth_uid and created_at > now() - interval '1 minute';
    if n >= 20 then
      raise exception 'rate limit: plafond par compte (20 erreurs/minute) atteint sur client_errors' using errcode = 'P0001';
    end if;
    select count(*) into n from public.client_errors
     where auth_uid is not null and created_at > now() - interval '1 minute';
    if n >= 120 then
      raise exception 'rate limit: plafond des comptes (120 erreurs/minute) atteint sur client_errors' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$fn$;

revoke all on function public.client_errors_limiter_debit() from public, anon, authenticated;

create index if not exists idx_client_errors_auth_created on public.client_errors (auth_uid, created_at desc);

-- ── ② LE REMPLACEMENT DU PLAFOND GLOBAL ──
drop trigger if exists trg_debit_global on public.client_errors;
drop trigger if exists trg_debit_reservoirs on public.client_errors;
create trigger trg_debit_reservoirs before insert on public.client_errors
  for each row execute function public.client_errors_limiter_debit();

-- ── ③ L'ÉPREUVE, sous les vrais rôles, ANNULÉE ──
-- Les mesures sortent de la sous-transaction annulée par un réglage de transaction.
do $epreuve$
declare
  a constant text := '00000000-0000-4000-8000-0000000ce801';
  b constant text := '00000000-0000-4000-8000-0000000ce802';
  mes jsonb := '{}'::jsonb;
  i int;
  refus_anon int := null;
  refus_a int := null;
  etat text;
begin
  begin
    -- a. Rafale anonyme jusqu'au refus (au plus 61 essais).
    execute 'set local role anon';
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    for i in 1..61 loop
      begin
        insert into public.client_errors (message, source) values ('zz_srv08 rafale ' || i, 'zz_srv08');
      exception when others then
        refus_anon := i; mes := mes || jsonb_build_object('anon_code', sqlstate); exit;
      end;
    end loop;
    mes := mes || jsonb_build_object('refus_anon', refus_anon);

    -- b. Un compte écrit malgré la rafale.
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', a, true);
    begin
      insert into public.client_errors (message, source) values ('zz_srv08 compte A apres rafale', 'zz_srv08');
      etat := 'ok';
    exception when others then etat := sqlstate || ' ' || sqlerrm;
    end;
    mes := mes || jsonb_build_object('a_apres_rafale', etat);

    -- c. Le même compte est arrêté à 20 (une ligne déjà écrite ci-dessus).
    for i in 2..21 loop
      begin
        insert into public.client_errors (message, source) values ('zz_srv08 compte A ' || i, 'zz_srv08');
      exception when others then
        refus_a := i; exit;
      end;
    end loop;
    mes := mes || jsonb_build_object('refus_a', refus_a);
    -- Compté sous le rôle de la migration : `authenticated` ne lit pas cette table.
    execute 'reset role';
    mes := mes || jsonb_build_object('auth_uid_pose', (select count(*) from public.client_errors where source = 'zz_srv08' and auth_uid = a::uuid));

    -- d. Un second compte écrit encore.
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', b, true);
    begin
      insert into public.client_errors (message, source) values ('zz_srv08 compte B', 'zz_srv08');
      etat := 'ok';
    exception when others then etat := sqlstate || ' ' || sqlerrm;
    end;
    mes := mes || jsonb_build_object('b_ecrit', etat);

    raise exception 'zz_srv08_annule';
  exception when others then
    -- La sous-transaction est annulée : ses lignes ET ses réglages. Les mesures
    -- vivent dans la variable `mes`, qui survit ; on les pose ICI, après l'annulation.
    if sqlerrm <> 'zz_srv08_annule' then
      mes := mes || jsonb_build_object('erreur', sqlstate || ' ' || sqlerrm);
    end if;
  end;
  perform set_config('passio.verdict_srv08', mes::text, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $epreuve$;

-- ── ④ VERDICT ──
create temp table passio_srv08_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
insert into pg_temp.passio_srv08_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout (aucune erreur imprévue)',
       case when current_setting('passio.verdict_srv08', true)::jsonb ? 'erreur'
            then 'ECHEC — ' || (current_setting('passio.verdict_srv08', true)::jsonb ->> 'erreur') else 'OK' end
union all select 2, true, 'une rafale anonyme est arrêtée au plus tard à la 61ᵉ ligne, en P0001',
       (select case when (v ->> 'refus_anon') is not null and (v ->> 'refus_anon')::int <= 61 and v ->> 'anon_code' = 'P0001'
                    then 'OK' else 'ECHEC — ' || coalesce(v ->> 'refus_anon', 'jamais') || ' / ' || coalesce(v ->> 'anon_code', '-') end
          from (select current_setting('passio.verdict_srv08', true)::jsonb v) x)
union all select 3, true, 'un compte écrit malgré la rafale anonyme (le défaut d''origine)',
       (select case when v ->> 'a_apres_rafale' = 'ok' then 'OK' else 'ECHEC — ' || coalesce(v ->> 'a_apres_rafale', '-') end
          from (select current_setting('passio.verdict_srv08', true)::jsonb v) x)
union all select 4, true, 'un compte seul est arrêté à sa 21ᵉ ligne de la minute',
       (select case when (v ->> 'refus_a')::int = 21 then 'OK' else 'ECHEC — ' || coalesce(v ->> 'refus_a', 'jamais') end
          from (select current_setting('passio.verdict_srv08', true)::jsonb v) x)
union all select 5, true, 'l''identité des lignes du compte est bien posée par la base (20 lignes de A)',
       (select case when (v ->> 'auth_uid_pose')::int = 20 then 'OK' else 'ECHEC — ' || coalesce(v ->> 'auth_uid_pose', '-') end
          from (select current_setting('passio.verdict_srv08', true)::jsonb v) x)
union all select 6, true, 'un second compte écrit encore',
       (select case when v ->> 'b_ecrit' = 'ok' then 'OK' else 'ECHEC — ' || coalesce(v ->> 'b_ecrit', '-') end
          from (select current_setting('passio.verdict_srv08', true)::jsonb v) x)
union all select 7, true, 'aucune ligne d''essai ne reste',
       (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.client_errors where source = 'zz_srv08')
union all select 8, true, 'l''ancien plafond global est retiré, le nouveau est en place, avant la barrière de suppression',
       (select case when not exists (select 1 from pg_trigger where tgrelid = 'public.client_errors'::regclass and tgname = 'trg_debit_global')
                     and exists (select 1 from pg_trigger where tgrelid = 'public.client_errors'::regclass and tgname = 'trg_debit_reservoirs' and tgenabled = 'O')
                    then 'OK' else 'ECHEC' end)
union all select 9, false, 'information — lignes en base',
       (select count(*)::text from public.client_errors);

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_srv08_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'client_errors, réservoirs : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_srv08_verdict order by n;

commit;
