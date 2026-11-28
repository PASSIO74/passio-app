-- ════════════════════════════════════════════════════════════════════════
-- RENCONTRER — CORRECTIF DE LA GARDE DE POINTAGE (2026-11-28)
--
-- `node scripts/appliquer-migration.mjs migrations/migration_rencontrer_pointage_coalesce_2026-11-28.sql --projet <ref>`
-- UNE transaction, REJOUABLE, sans prérequis client.
--
-- LE DÉFAUT (trouvé par le banc SQL en CI, puis REPRODUIT au staging dans une
-- transaction annulée) : la garde posée par migration_rencontrer_serveur_2026-11-27
-- lisait `current_setting('passio.pointage_par_code', true) = '1'`. Hors du
-- chemin du code d'accueil, le réglage n'existe pas : `current_setting` rend
-- NULL, la comparaison NULL, et pour un « peut-être » ou une demande NON
-- validée (rsvp in going/maybe) toute la condition devient NULL. `IF NOT (NULL)`
-- ne lève pas : ces personnes se pointaient encore en écrivant leur ligne en
-- direct. (« je ne peux pas » et la liste d'attente étaient bien refusés : la
-- branche y vaut FALSE, pas NULL — c'est ce que la simulation C4 mesurait.)
--
-- LE CORRECTIF : `coalesce(current_setting(…, true), '')`. Rien d'autre ne change.
-- Garde : la définition remplacée doit être celle mesurée en production et au
-- staging le 2026-11-28 (md5 du corps, CR retirés : c514ea3778e55c670c2f886dac73f976),
-- ou déjà celle-ci (rejeu).
-- Retour arrière : rejouer le bloc de event_attendees_pointage_garde de
-- migration_rencontrer_serveur_2026-11-27.sql (la version d'avant ce correctif).
-- ════════════════════════════════════════════════════════════════════════
begin;

do $garde$
declare emp text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into emp from pg_proc p
   where p.oid = to_regprocedure('public.event_attendees_pointage_garde()');
  if emp is null then
    raise exception 'pointage_coalesce : event_attendees_pointage_garde absente — appliquer d''abord migration_rencontrer_serveur_2026-11-27';
  end if;
  if emp <> 'c514ea3778e55c670c2f886dac73f976'
     and position('coalesce(current_setting(''passio.pointage_par_code''' in pg_get_functiondef('public.event_attendees_pointage_garde()'::regprocedure)) = 0 then
    raise exception 'pointage_coalesce : la garde a changé depuis la mesure du 2026-11-28 (md5 %) — relire avant de réécrire', emp;
  end if;
end
$garde$;

create or replace function public.event_attendees_pointage_garde()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  if auth.uid() is null then return new; end if;
  -- Un pointage posé ne se réécrit pas (la valeur était libre et réécrivable).
  if tg_op = 'UPDATE' and old.checked_in_at is not null then
    new.checked_in_at := old.checked_in_at;
    return new;
  end if;
  if new.checked_in_at is null then return new; end if;
  select status, date_at, end_at, author_id, organizer_id into ev from public.events where id = new.event_id;
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'pointage_annulee' using errcode = 'P0001';
  end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then
    raise exception 'pointage_hors_fenetre' using errcode = 'P0001';
  end if;
  -- Qui peut pointer : l'organisation ; une participation VALIDÉE ; et, par le
  -- seul chemin du code d'accueil (`pointer_par_code`, qui a déjà refusé
  -- liste d'attente et « je ne peux pas »), un « going » ou un « peut-être ».
  if not (
       new.user_id is not distinct from ev.author_id or new.user_id is not distinct from ev.organizer_id
       or (new.rsvp = 'going' and exists (select 1 from rencontres_prive.accords v
                                           where v.event_id = new.event_id and v.user_id = new.user_id))
       or (coalesce(current_setting('passio.pointage_par_code', true), '') = '1' and new.rsvp in ('going', 'maybe'))
     ) then
    raise exception 'pointage_non_valide' using errcode = 'P0001';
  end if;
  -- L'heure du serveur fait foi (UTC, comme l'écrit le client).
  new.checked_in_at := now() at time zone 'UTC';
  return new;
end
$$;

-- Verdict.
do $v$
begin
  if position('coalesce(current_setting(''passio.pointage_par_code'', true), '''') = ''1''' in pg_get_functiondef('public.event_attendees_pointage_garde()'::regprocedure)) = 0 then
    raise exception 'pointage_coalesce : ECHEC — la garde ne porte pas le coalesce';
  end if;
end
$v$;
select 'garde de pointage : un réglage absent vaut « hors code d''accueil » (coalesce)' as controle,
  case when position('coalesce(current_setting(''passio.pointage_par_code'', true), '''') = ''1''' in pg_get_functiondef('public.event_attendees_pointage_garde()'::regprocedure)) > 0
       then 'OK' else 'ECHEC' end as valeur
union all
select 'garde de pointage : SECURITY DEFINER, search_path figé',
  case when (select prosecdef and proconfig::text like '%search_path=%' from pg_proc where oid = 'public.event_attendees_pointage_garde()'::regprocedure)
       then 'OK' else 'ECHEC' end;

commit;
