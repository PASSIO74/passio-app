-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS IRL — le pointage a une valeur : code SECRET par activité, fenêtre
-- horaire tenue par la base, inscription préalable exigée (IRL-12,
-- contre-revue Astra, 2026-09-14)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (6 lignes).
--
-- LE DÉFAUT. Le code d'accueil était un HACHAGE DE L'ID PUBLIC de l'activité
-- (`_eventCheckinCode`, app-07) : quiconque lit la liste des rencontres peut le
-- calculer et « pointer » depuis son canapé. Aucune fenêtre horaire côté
-- serveur (`checked_in_at` s'écrit à toute heure), pointage possible SANS
-- inscription (le client forçait `rsvp = going`), et sans GPS le client
-- pointait quand même. Le pointage ne conditionne encore que des badges — mais
-- un badge de fiabilité qui se gagne sans venir ne vaut rien.
--
-- CE QUI CHANGE, et rien d'autre :
--   · `event_checkin_secrets(event_id, secret)` : un code de 6 caractères tiré
--     au hasard (alphabet sans 0/O/1/I), posé par trigger à la création de
--     chaque activité, rempli pour les activités existantes. RLS : seuls
--     l'AUTEUR et les CO-ORGANISATEURS le lisent ; personne ne l'écrit depuis
--     un client. Aucune colonne ajoutée à `events` (dont les GRANT sont
--     colonne par colonne pour `anon`).
--   · RPC `pointer_par_code(p_event_id, p_code)` (SECURITY DEFINER) : compare
--     le code, exige un compte, une activité active, la fenêtre
--     [début − 1 h, fin] (fin = `end_at`, sinon début + 3 h), et une
--     INSCRIPTION préalable (`going` ou `maybe` ; `waitlist` refusé) ; pose
--     `checked_in_at`, et passe un « peut-être » en `going` si la capacité le
--     permet (sinon il reste pointé en « peut-être »). Rend un verdict texte
--     stable : ok · deja_pointe · code_incorrect · hors_fenetre · annulee ·
--     non_inscrit · liste_attente.
--   · trigger `trg_event_attendees_pointage` : un `checked_in_at` posé par
--     UPDATE direct (chemin GPS du client) est refusé hors fenêtre ou sur une
--     activité annulée — la règle vaut pour les deux chemins.
-- À COLLER À TOUT MOMENT : le client d'avant continue de pointer par GPS dans
-- la fenêtre ; son code dérivé devient simplement faux pour le serveur (et il
-- ne l'envoyait pas au serveur de toute façon).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- 1. Le secret par activité.
create table if not exists public.event_checkin_secrets (
  event_id text primary key references public.events(id) on delete cascade,
  secret   text not null,
  created_at timestamptz not null default now()
);
alter table public.event_checkin_secrets enable row level security;
drop policy if exists "secret_lisible_par_organisateurs" on public.event_checkin_secrets;
create policy "secret_lisible_par_organisateurs" on public.event_checkin_secrets for select
  using (exists (
    select 1 from public.events e
     where e.id = event_checkin_secrets.event_id
       and (e.author_id = (auth.uid())::text
            or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
                and e.co_organizers ? (auth.uid())::text))));
grant select on public.event_checkin_secrets to authenticated;
revoke all on public.event_checkin_secrets from anon;

create or replace function public.checkin_secret_generer()
returns text
language plpgsql
volatile
set search_path to ''
as $function$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  octets bytea := extensions.gen_random_bytes(6);
  out text := '';
  i integer;
begin
  for i in 0..5 loop
    out := out || substr(alphabet, (get_byte(octets, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end
$function$;
revoke execute on function public.checkin_secret_generer() from public, anon, authenticated;

create or replace function public.events_poser_secret_pointage()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.event_checkin_secrets (event_id, secret)
    values (new.id, public.checkin_secret_generer())
    on conflict (event_id) do nothing;
  return new;
end
$function$;
drop trigger if exists trg_events_secret_pointage on public.events;
create trigger trg_events_secret_pointage
  after insert on public.events
  for each row execute function public.events_poser_secret_pointage();

insert into public.event_checkin_secrets (event_id, secret)
  select e.id, public.checkin_secret_generer() from public.events e
   where not exists (select 1 from public.event_checkin_secrets s where s.event_id = e.id);

-- 2. La fenêtre et le statut, pour le chemin GPS (UPDATE direct de checked_in_at).
create or replace function public.event_attendees_pointage_garde()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ev record;
begin
  if auth.uid() is null then return new; end if;
  if new.checked_in_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.checked_in_at is not null then return new; end if;
  select status, date_at, end_at into ev from public.events where id = new.event_id;
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'pointage_annulee' using errcode = 'P0001';
  end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then
    raise exception 'pointage_hors_fenetre' using errcode = 'P0001';
  end if;
  return new;
end
$function$;
drop trigger if exists trg_event_attendees_pointage on public.event_attendees;
create trigger trg_event_attendees_pointage
  before insert or update on public.event_attendees
  for each row execute function public.event_attendees_pointage_garde();

-- 3. Le pointage par code, côté serveur.
create or replace function public.pointer_par_code(p_event_id text, p_code text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  moi text := (auth.uid())::text;
  ev record;
  secret_att text;
  ligne record;
begin
  if auth.uid() is null then return 'non_connecte'; end if;
  select id, status, date_at, end_at into ev from public.events where id = p_event_id;
  if not found then return 'introuvable'; end if;
  select secret into secret_att from public.event_checkin_secrets where event_id = p_event_id;
  if secret_att is null or upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')) <> secret_att then return 'code_incorrect'; end if;
  if ev.status = 'cancelled' then return 'annulee'; end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then return 'hors_fenetre'; end if;
  select rsvp, checked_in_at into ligne from public.event_attendees where event_id = p_event_id and user_id = moi;
  if not found then return 'non_inscrit'; end if;
  if ligne.checked_in_at is not null then return 'deja_pointe'; end if;
  if ligne.rsvp = 'waitlist' or ligne.rsvp = 'declined' then return 'liste_attente'; end if;
  update public.event_attendees set checked_in_at = now() where event_id = p_event_id and user_id = moi;
  if ligne.rsvp = 'maybe' then
    -- Un « peut-être » présent devient inscrit si une place reste (le trigger de
    -- capacité tranche) ; sinon il reste pointé en « peut-être ».
    begin
      update public.event_attendees set rsvp = 'going' where event_id = p_event_id and user_id = moi;
    exception when others then null;
    end;
  end if;
  return 'ok';
end
$function$;
revoke execute on function public.pointer_par_code(text, text) from public, anon;
grant execute on function public.pointer_par_code(text, text) to authenticated;

-- 4. Verdict (6 lignes attendues, toutes OK).
select 'secrets : une ligne par activité' as controle,
       case when (select count(*) from public.events) = (select count(*) from public.event_checkin_secrets) then 'OK' else 'ECHEC' end as valeur
union all select 'secret : 6 caractères de l''alphabet', case when exists (select 1 from public.event_checkin_secrets where secret !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$') then 'ECHEC' else 'OK' end
union all select 'anon sans lecture des secrets', case when has_table_privilege('anon', 'public.event_checkin_secrets', 'SELECT') then 'ECHEC' else 'OK' end
union all select 'trigger secret à la création', case when exists (select 1 from pg_trigger where tgname = 'trg_events_secret_pointage') then 'OK' else 'ECHEC' end
union all select 'trigger fenêtre de pointage', case when exists (select 1 from pg_trigger where tgname = 'trg_event_attendees_pointage') then 'OK' else 'ECHEC' end
union all select 'RPC pointer_par_code : authenticated oui, anon non', case when has_function_privilege('authenticated', 'public.pointer_par_code(text,text)', 'EXECUTE') and not has_function_privilege('anon', 'public.pointer_par_code(text,text)', 'EXECUTE') then 'OK' else 'ECHEC' end;

commit;
