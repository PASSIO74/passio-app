-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS IRL — la capacité, le statut et les bornes sont tenus PAR LA BASE
-- (IRL-05 + IRL-11, contre-revue Astra, 2026-09-14)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (6 lignes).
--
-- LE DÉFAUT, mesuré en base le 2026-09-14 : `event_attendees` n'a ni CHECK sur
-- `rsvp` (n'importe quel texte passe), ni borne de capacité, ni garde de
-- statut — INSERT/UPDATE ne vérifient que `user_id = auth.uid()`. Le banc de
-- chaos de l'audit a montré 2 POST + 2 PATCH concurrents acceptés au-delà de
-- `max_attendees` ; la capacité n'était tenue que par le CLIENT qui s'inscrit
-- (donc contournable en REST, et jamais atomique). `events.price` et
-- `events.max_attendees` n'avaient aucune borne (prix -5 → « Gratuit »).
-- Données actuelles : 0 prix négatif, 0 capacité < 1, 0 rsvp hors liste,
-- 0 activité déjà au-delà de sa capacité — rien à réparer, tout à protéger.
--
-- CE QUI CHANGE, et rien d'autre :
--   · CHECK `event_attendees.rsvp ∈ {going, maybe, declined, waitlist}` ;
--   · CHECK `events.price >= 0`, `events.max_attendees IS NULL OR >= 1` ;
--   · trigger BEFORE INSERT OR UPDATE `trg_event_attendees_capacite` : passer
--     à `going` est REFUSÉ (exception, message stable pour le client) si
--     l'activité est annulée (`status = 'cancelled'`), passée (`end_at`, sinon
--     `date_at + 3 h`, antérieur à maintenant) ou COMPLÈTE (`max_attendees`
--     atteint par les autres `going`). Le décompte se fait sous verrou de la
--     ligne `events` (`FOR UPDATE`) : deux inscriptions concurrentes sont
--     sérialisées, la seconde voit la première — c'est l'atomicité qui manquait.
--     `maybe`, `waitlist`, `declined` passent toujours ; rester `going` quand
--     on l'était déjà (pointage, note) passe toujours.
--   · sans session (postgres, service_role) la règle ne s'applique pas, comme
--     `event_attendees_admission_gardee` : une mesure d'administration ne doit
--     pas être refusée par une règle de courtoisie.
-- Le client (`setEventRsvp`, ROB-02) annule déjà l'optimiste sur un refus ; il
-- lit désormais le motif (`complet` / `annulee` / `passee`) pour le dire.
-- À COLLER À TOUT MOMENT : le client d'avant fonctionne (un refus = « inscription
-- non enregistrée »), celui d'après nomme la raison.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- 1. Bornes déclaratives.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_attendees_rsvp_valeurs') then
    alter table public.event_attendees add constraint event_attendees_rsvp_valeurs
      check (rsvp in ('going', 'maybe', 'declined', 'waitlist'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_price_positif') then
    alter table public.events add constraint events_price_positif check (price is null or price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_max_attendees_min1') then
    alter table public.events add constraint events_max_attendees_min1 check (max_attendees is null or max_attendees >= 1);
  end if;
end $$;

-- 2. La capacité, le statut et la date, tenus par un trigger sous verrou.
create or replace function public.event_attendees_capacite_gardee()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ev record;
  inscrits integer;
begin
  -- Aucune session (postgres, service_role, tâches d'administration) : la règle
  -- ne s'applique pas — même sortie que `event_attendees_admission_gardee`.
  if auth.uid() is null then return new; end if;
  -- Seul le PASSAGE à « going » est gardé : rester inscrit (pointage, note),
  -- passer en « peut-être », en attente ou se retirer ne consomment rien.
  if new.rsvp is distinct from 'going' then return new; end if;
  if tg_op = 'UPDATE' and old.rsvp = 'going' then return new; end if;

  -- Verrou de la ligne parente : deux inscriptions concurrentes se suivent,
  -- la seconde compte APRÈS la première (READ COMMITTED : nouvel instantané
  -- par instruction une fois le verrou obtenu).
  select id, status, max_attendees, end_at, date_at into ev
    from public.events where id = new.event_id for update;
  if not found then
    raise exception 'activite_introuvable' using errcode = 'P0001';
  end if;
  if ev.status = 'cancelled' then
    raise exception 'activite_annulee' using errcode = 'P0001';
  end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then
    raise exception 'activite_passee' using errcode = 'P0001';
  end if;
  if ev.max_attendees is not null then
    select count(*) into inscrits from public.event_attendees a
      where a.event_id = new.event_id and a.rsvp = 'going' and a.user_id <> new.user_id;
    if inscrits >= ev.max_attendees then
      raise exception 'activite_complete' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_event_attendees_capacite on public.event_attendees;
create trigger trg_event_attendees_capacite
  before insert or update on public.event_attendees
  for each row execute function public.event_attendees_capacite_gardee();

-- (Pas de REVOKE : une fonction trigger ne peut pas être appelée directement —
-- « trigger functions can only be called as triggers » — le GRANT par défaut
-- est inerte, comme pour `event_attendees_admission_gardee`.)

-- 3. Verdict (6 lignes attendues, toutes OK).
select 'CHECK rsvp' as controle, case when exists (select 1 from pg_constraint where conname = 'event_attendees_rsvp_valeurs') then 'OK' else 'ECHEC' end as valeur
union all select 'CHECK price >= 0', case when exists (select 1 from pg_constraint where conname = 'events_price_positif') then 'OK' else 'ECHEC' end
union all select 'CHECK max_attendees >= 1', case when exists (select 1 from pg_constraint where conname = 'events_max_attendees_min1') then 'OK' else 'ECHEC' end
union all select 'trigger capacité posé', case when exists (select 1 from pg_trigger where tgname = 'trg_event_attendees_capacite' and tgrelid = 'public.event_attendees'::regclass) then 'OK' else 'ECHEC' end
union all select 'fonction search_path figé', case when (select array_to_string(proconfig, ',') from pg_proc where proname = 'event_attendees_capacite_gardee') like '%search_path=%' then 'OK' else 'ECHEC' end
union all select 'aucune activité déjà au-delà de sa capacité', case when exists (select 1 from public.events e join public.event_attendees a on a.event_id = e.id and a.rsvp = 'going' where e.max_attendees is not null group by e.id, e.max_attendees having count(*) > e.max_attendees) then 'ECHEC' else 'OK' end;

commit;
