#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_rencontrer_serveur_2026-11-27.sql (et son retour arrière)
#
# Sur un PostgreSQL JETABLE, avec les définitions de PRODUCTION relues au
# catalogue le 2026-11-27 (corps recopiés à l'identique : le banc vérifie leurs
# empreintes md5 contre celles de la garde) — inscription, capacité, état,
# pointage, verrou de paire, plafond du jour, journal, validation, refus,
# confirmation, discussion (`conv_members_garde`, `membre_garde`), promotion
# (`promouvoir_attente`), retrait d'invité, pointage par code :
#   ⓪ AVANT : les six défauts se REPRODUISENT (refus d'un validé : personne
#      promu, personne prévenu ; note avant la fin ; pointage d'un « je ne peux
#      pas » ; validé hors discussion ; couverture d'un hôte tiers)
#   ① la migration s'applique (verdict OK), se REJOUE
#   ② APRÈS : chaque défaut est fermé, et ce qui marchait marche encore (code
#      d'accueil pour une demande et un « peut-être », pointage d'un validé et de
#      l'organisation, note d'un validé ou d'un pointé après la fin, effacer sa
#      note, promotion client sans doublon, suppression d'activité)
#   ③ MUTATION : retirer la garde de note, ou le déclencheur de promotion, fait
#      revenir le défaut (le banc le voit) ; une définition changée ARRÊTE la
#      migration (garde d'empreinte)
#   ④ RETOUR ARRIÈRE : rend les définitions d'avant (empreintes), le défaut
#      revient, et la migration se réapplique ensuite
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$RACINE/migrations/migration_rencontrer_serveur_2026-11-27.sql"
RETOUR="$RACINE/migrations/migration_rencontrer_serveur_retour_2026-11-27.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$MIG" "$RETOUR"; do [ -f "$f" ] || { echo "❌ introuvable : $f"; exit 1; }; done

PORT=$(( 6320 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=rencontrer_serveur
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
# Une requête SOUS un compte, validée. ⚠️ `set local role` et sa requête partent
# dans le MÊME appel (ADR-012) : séparés, le rôle retomberait sans erreur.
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1'; $2; commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$' || true; }
# Une ÉCRITURE sous un compte : rend « ok » (validée) ou le message du refus.
ESSAI() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1';
  do \$x\$ begin $2; raise notice 'ETAT=ok'; exception when others then raise notice 'ETAT=%', sqlerrm; end \$x\$; commit;" 2>&1 | sed -n 's/.*ETAT=//p'; }

LEA=11111111-1111-4111-8111-111111111111     # organise
INES=22222222-2222-4222-8222-222222222222    # validée
HUGO=33333333-3333-4333-8333-333333333333    # demande en attente
CHLOE=44444444-4444-4444-8444-444444444444   # première de la file
TOM=55555555-5555-4555-8555-555555555555     # second de la file
KEVIN=66666666-6666-4666-8666-666666666666   # le fâcheux ; tête de file bloquée
MARC=77777777-7777-4777-8777-777777777777    # « peut-être »

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
# Un refus dont le message CONTIENT le motif attendu.
# Une préparation (sans session) : refusée = le banc s'arrête en le DISANT.
PREP() { local s; s="$(Q "$1")" || { echo "❌ préparation refusée :"; echo "$s"; exit 1; }; }
refuse() { case "$3" in *"$2"*) ok=$((ok+1)); printf '  ✅ %s\n' "$1";; *) ko=$((ko+1)); printf '  ❌ %s\n     attendu : un refus « %s »\n     obtenu  : %s\n' "$1" "$2" "$3";; esac; }

# ── SOCLE (définitions de production, 2026-11-27) ───────────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema rencontres_prive;

create table public.profiles (id text primary key);
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.events (id text primary key, author_id text, organizer_id text, title text,
  status text not null default 'active', max_attendees integer, date_at timestamp, end_at timestamp,
  created_at timestamp default now(), co_organizers jsonb not null default '[]'::jsonb,
  visibilite text not null default 'publique', conv_id text, cover_url text,
  constraint events_cover_url_forme check ((cover_url is null) or ((cover_url ~ '^https://'::text) and (char_length(cover_url) <= 2048))),
  constraint events_conv_id_forme check ((conv_id is null) or (conv_id = ('evgrp_'::text || id))));
create table public.event_attendees (event_id text not null references public.events(id) on delete cascade, user_id text not null,
  created_at timestamptz default now(), rsvp text not null default 'going', checked_in_at timestamp,
  rating smallint, feedback text, rated_at timestamptz, primary key (event_id, user_id),
  constraint event_attendees_rating_range check ((rating is null) or ((rating >= 1) and (rating <= 5))));
create table public.conversations (id text primary key, is_group boolean default false, created_by text, created_at timestamp default now());
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null references public.profiles(id),
  muted boolean not null default false, primary key (conv_id, user_id));
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now(), origine text, push_le timestamptz);
create table public.event_invites (event_id text not null references public.events(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade, invited_by text, primary key (event_id, user_id));
create table public.event_invites_retires (event_id text not null references public.events(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade, retire_le timestamptz not null default now(), primary key (event_id, user_id));
create table public.event_checkin_secrets (event_id text primary key references public.events(id) on delete cascade, secret text not null);
create table public.pointage_essais (event_id text not null, user_id text not null, essais integer not null default 1,
  fenetre timestamptz not null default now(), primary key (event_id, user_id));
create table rencontres_prive.accords (event_id text not null references public.events(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade, primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.event_attendees(event_id, user_id) on delete cascade);
create table rencontres_prive.decisions (id uuid primary key default gen_random_uuid(), event_id text references public.events(id) on delete set null,
  user_id text not null references public.profiles(id) on delete cascade, decideur_id text references public.profiles(id) on delete set null,
  accepter boolean not null, created_at timestamptz not null default now(), refus_en_cours boolean not null default false);
create table rencontres_prive.inscriptions (id uuid primary key default gen_random_uuid(), event_id text references public.events(id) on delete set null,
  user_id text not null references public.profiles(id) on delete cascade, rsvp text, created_at timestamptz not null default now());

-- Droits et policies réduits à leur contrat (sa ligne ; l'auteur pour l'activité).
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
grant select, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_attendees to authenticated;
create policy events_lecture on public.events for select using (true);
create policy events_maj on public.events for update to authenticated
  using (author_id = (select auth.uid())::text) with check (author_id = (select auth.uid())::text);
create policy events_suppression on public.events for delete to authenticated using (author_id = (select auth.uid())::text);
create policy ea_lecture on public.event_attendees for select to authenticated using (user_id = (select auth.uid())::text);
create policy ea_insert on public.event_attendees for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy ea_maj on public.event_attendees for update to authenticated
  using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy ea_suppression on public.event_attendees for delete to authenticated using (user_id = (select auth.uid())::text);

create function public.suppression_de_mon_compte() returns boolean language sql stable as $f$ select false $f$;
create function public.adult_access_allowed() returns boolean language sql stable as $f$ select true $f$;
create function public.organise_activite(p_event_id text) returns boolean language sql stable security definer set search_path = '' as $f$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text)));
$f$;

create or replace function public.passio_echapper_html(s text)
returns text language sql immutable set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(s, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

create or replace function rencontres_prive.bloque(p_event text, p_user text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.events e join public.blocks b
    on (b.blocker_id = p_user and (b.blocked_id = e.author_id or b.blocked_id = e.organizer_id))
    or (b.blocked_id = p_user and (b.blocker_id = e.author_id or b.blocker_id = e.organizer_id))
    where e.id = p_event)
$$;

create or replace function rencontres_prive.verrou_paire(a text, b text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('rencontre-paire:' || least(a,b) || ':' || greatest(a,b),0)) then
   raise exception 'rencontre_concurrente_reessayer' using errcode = '40001';
 end if;
end $$;

create or replace function rencontres_prive.inscription_gardee()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 -- UPDATE tient déjà la ligne : ne jamais attendre un verrou de paire ici.
 perform rencontres_prive.verrou_paire(new.user_id, personne)
   from public.events e cross join lateral
     (select e.author_id as personne union select e.organizer_id) o
   where e.id = new.event_id and personne is not null order by personne;
 if new.rsvp <> 'declined' and rencontres_prive.bloque(new.event_id,new.user_id) then
   raise exception 'organisateur_bloque' using errcode = '42501';
 end if;
 if auth.uid() is not null and new.rsvp <> 'declined'
   and (tg_op = 'INSERT' or new.rsvp is distinct from old.rsvp) then
   perform pg_advisory_xact_lock(hashtextextended('rencontres:' || new.user_id,0));
   if (select count(*) from rencontres_prive.inscriptions where user_id = new.user_id
       and created_at >= now() - interval '1 day' and rsvp is not null and rsvp <> 'declined') >= 20 then
     raise exception 'inscriptions_jour_limite' using errcode = 'P0001';
   end if;
 end if;
 return new;
end $$;

create or replace function public.event_attendees_capacite_gardee()
returns trigger language plpgsql security definer set search_path = ''
as $$
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
$$;

create or replace function public.event_attendees_etat_garde()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  -- Aucune session (postgres, service_role, tâches d'administration) : la règle
  -- ne s'applique pas — même sortie que `event_attendees_capacite_gardee`.
  if auth.uid() is null then return new; end if;
  if new.rsvp = 'declined' then return new; end if;
  -- ⚠️ « rsvp inchangé » ne suffit pas : déplacer une ligne « going » vers une
  -- autre activité (passée, annulée) garde son rsvp. C'est une inscription à
  -- l'activité d'arrivée, jugée comme telle — sans compter sur la seule garde
  -- `trg_event_attendees_figes` (exigée au verdict, voir plus bas).
  if tg_op = 'UPDATE' and new.rsvp is not distinct from old.rsvp
     and new.event_id is not distinct from old.event_id then return new; end if;

  select status, date_at, end_at into ev from public.events where id = new.event_id;
  -- Activité inconnue : la clé étrangère tranche (23503), pas cette garde.
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'activite_annulee' using errcode = 'P0001';
  end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then
    raise exception 'activite_passee' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create or replace function public.event_attendees_figes()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.event_id is distinct from old.event_id then
    raise exception 'inscription_activite_figee' using errcode = 'P0001',
      hint = 'Une inscription ne se déplace pas : se désinscrire, puis s''inscrire à l''autre activité.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'inscription_compte_fige' using errcode = 'P0001', hint = 'Une inscription ne change pas de compte.';
  end if;
  new.created_at := old.created_at;
  return new;
end $$;

create or replace function public.event_attendees_sortie_discussion()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ev text := coalesce(old.event_id, new.event_id); qui text := coalesce(old.user_id, new.user_id);
begin
  if tg_op = 'UPDATE' and (new.rsvp = 'going' or old.rsvp is distinct from 'going') then return null; end if;
  delete from public.conv_members m where m.conv_id = 'evgrp_' || ev and m.user_id = qui
     and not exists (select 1 from public.events e where e.id = ev
                      and (e.author_id = qui or e.organizer_id = qui or e.co_organizers ? qui));
  return null;
end $$;

create or replace function rencontres_prive.inscription_tracee()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ev text; qui text; reponse text; orga text; precedent text;
begin
 if tg_op = 'UPDATE' and new.rsvp is not distinct from old.rsvp then return null; end if;
 if tg_op = 'DELETE' then ev := old.event_id; qui := old.user_id; reponse := null;
 else ev := new.event_id; qui := new.user_id; reponse := new.rsvp; end if;
 select coalesce(organizer_id,author_id) into orga from public.events where id = ev;
 if not found or not exists(select 1 from public.profiles where id = qui) then return null; end if;
 insert into rencontres_prive.inscriptions(event_id,user_id,rsvp) values(ev,qui,reponse);
 if reponse is distinct from 'going' then
   delete from rencontres_prive.accords where event_id = ev and user_id = qui;
   delete from public.conv_members where conv_id = 'evgrp_' || ev and user_id = qui
     and qui is distinct from orga;
 end if;
 if reponse = 'going' and qui is distinct from orga and orga is not null then
   precedent := current_setting('passio.notification_serveur',true);
   perform set_config('passio.notification_serveur','1',true);
   insert into public.notifications(id,user_id,kind,from_id,ref_id,content,seen)
   values('n_rv_' || gen_random_uuid()::text,orga,'event_join',qui,ev,'demande à participer à ton activité',false);
   perform set_config('passio.notification_serveur',coalesce(precedent,''),true);
 end if;
 return null;
end $$;

create or replace function rencontres_prive.membre_garde()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if left(new.conv_id,6) = 'evgrp_' and not exists(
   select 1 from public.events e join public.conversations c on c.id = e.conv_id
   where e.id = substr(new.conv_id,7) and e.conv_id = new.conv_id and e.status = 'active'
     and c.created_at >= e.created_at and c.created_by in(e.author_id,e.organizer_id)
     and (new.user_id in(e.author_id,e.organizer_id) or
       (not rencontres_prive.bloque(e.id,new.user_id) and exists(
         select 1 from public.event_attendees a join rencontres_prive.accords v using(event_id,user_id)
         where a.event_id = e.id and a.user_id = new.user_id and a.rsvp = 'going')))) then
   raise exception 'acces_activite_non_valide' using errcode = '42501';
 end if;
 return new;
end $$;

create or replace function public.conv_members_garde()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare moi text := (auth.uid())::text; c record; autres integer;
begin
  if moi is null then return new; end if;              -- service_role, purge, restauration
  select id, is_group, created_by into c from public.conversations where id = new.conv_id;
  if not found or c.created_by is distinct from moi then return new; end if;  -- FK et RLS tranchent
  perform 1 from public.conversations where id = new.conv_id for update;      -- ajouts concurrents
  select count(*) into autres from public.conv_members m
   where m.conv_id = new.conv_id and m.user_id <> new.user_id;
  if coalesce(c.is_group, false) then
    if left(c.id, 6) <> 'evgrp_' and autres >= 256 then
      raise exception 'new row violates row-level security policy for table "conv_members"'
        using errcode = '42501', hint = 'groupe complet';
    end if;
    return new;
  end if;
  if autres >= 2 or (new.user_id <> moi and not exists (
        select 1 from public.conv_members m where m.conv_id = new.conv_id and m.user_id = moi)) then
    raise exception 'new row violates row-level security policy for table "conv_members"'
      using errcode = '42501', hint = 'conversation privée : deux membres, créateur compris';
  end if;
  return new;
end $$;

create or replace function public.notifications_origine()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  if new.origine = 'client' and auth.uid() is not null then
    new.push_le := null;
    -- Le plafond de `trg_rate_limit` est par émetteur : une cible se noie sous 60 lignes par minute.
    if (select count(*) from public.notifications n
         where n.from_id = new.from_id and n.user_id = new.user_id
           and n.created_at > now() - interval '1 minute') >= 10 then
      raise exception 'rate limit: max 10 notifications/minute vers un même compte' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create or replace function rencontres_prive.signaler_refus_demande()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  precedent text := current_setting('passio.notification_serveur', true);
begin
  -- valider_participant a verrouillé la ligne et n'a pas encore retiré l'accord.
  if new.user_id = new.decideur_id
     or not exists (select 1 from public.event_attendees a where a.event_id = new.event_id
                    and a.user_id = new.user_id and a.rsvp = 'going')
     or exists (select 1 from rencontres_prive.accords v where v.event_id = new.event_id and v.user_id = new.user_id)
     or rencontres_prive.bloque(new.event_id, new.user_id)
     or exists (select 1 from public.blocks b where (b.blocker_id,b.blocked_id)
                in ((new.user_id,new.decideur_id),(new.decideur_id,new.user_id))) then
    return new;
  end if;
  new.refus_en_cours := true;
  perform set_config('passio.notification_serveur','1',true);
  insert into public.notifications(id,user_id,kind,from_id,ref_id,content,seen)
  select 'n_pi_refus_' || new.id, new.user_id, 'event_update', new.decideur_id, e.id,
         'Ta demande de participation à « ' || public.passio_echapper_html(left(coalesce(e.title,'cette sortie'),80))
         || ' » n’a pas été acceptée.', false
  from public.events e where e.id = new.event_id;
  perform set_config('passio.notification_serveur',coalesce(precedent,''),true);
  return new;
end $$;

create or replace function rencontres_prive.notifier_confirmation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  origine_precedente text := current_setting('passio.notification_serveur', true);
begin
  perform set_config('passio.notification_serveur', '1', true);
  insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
  select 'n_pi_confirmation_' || new.id, new.user_id, 'event_accepted', new.decideur_id, e.id,
         'Ta participation à « ' || public.passio_echapper_html(left(coalesce(e.title,'cette sortie'), 80)) || ' » est confirmée.', false
  from public.events e where e.id = new.event_id;
  perform set_config('passio.notification_serveur', coalesce(origine_precedente, ''), true);
  return new;
end $$;

create or replace function public.promouvoir_attente(p_event_id text, p_user_id text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  moi      text := (auth.uid())::text;
  ev       record;
  inscrits integer;
  cible    text;
  nb       integer;
  orga     boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'motif', 'non_connecte'); end if;
  -- Verrou de l'activité : deux promotions (ou une promotion et une inscription)
  -- concurrentes se suivent, la seconde compte APRÈS la première.
  select id, status, max_attendees, date_at, end_at, author_id, title
    into ev from public.events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
  if ev.status = 'cancelled' then return jsonb_build_object('ok', false, 'motif', 'annulee'); end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then return jsonb_build_object('ok', false, 'motif', 'passee'); end if;
  if ev.max_attendees is null then return jsonb_build_object('ok', false, 'motif', 'sans_capacite'); end if;

  -- L'ORGANISATION A UNE DÉFINITION (R24, 2026-11-03) : auteur, organisateur
  -- (`organizer_id`) ou co-organisateur — celle de la liste des participants et
  -- de la discussion d'activité (C-04), lue sous le verrou ci-dessus. La
  -- comparaison qu'on faisait ici oubliait `organizer_id`, et laissait passer
  -- n'importe qui sur une activité sans auteur (`moi <> null` n'est jamais vrai).
  orga := coalesce(public.organise_activite(p_event_id), false);

  if p_user_id is not null then
    -- Promotion CHOISIE : réservée à l'organisation.
    if not orga then
      return jsonb_build_object('ok', false, 'motif', 'non_autorise');
    end if;
    cible := p_user_id;
  end if;

  select count(*) into inscrits from public.event_attendees a
    where a.event_id = p_event_id and a.rsvp = 'going';
  if inscrits >= ev.max_attendees then return jsonb_build_object('ok', false, 'motif', 'complete'); end if;

  if cible is null then
    -- Premier arrivé, premier servi.
    select a.user_id into cible from public.event_attendees a
      where a.event_id = p_event_id and a.rsvp = 'waitlist'
      order by a.created_at asc, a.user_id asc limit 1;
    if cible is null then return jsonb_build_object('ok', false, 'motif', 'personne_en_attente'); end if;
  end if;

  begin
    update public.event_attendees set rsvp = 'going'
      where event_id = p_event_id and user_id = cible and rsvp = 'waitlist';
    get diagnostics nb = row_count;
  exception when others then
    -- Capacité tranchée par le trigger entre-temps, compte en suppression,
    -- admission : le refus est un verdict, pas une erreur.
    return jsonb_build_object('ok', false, 'motif', 'refuse', 'detail', left(sqlerrm, 80));
  end;
  if nb = 0 then return jsonb_build_object('ok', false, 'motif', 'pas_en_attente'); end if;

  -- Notification d'origine serveur, identifiant déterministe (rejeu sans doublon).
  -- ⚠️ `n_pa_` n'est PAS réservé au serveur : un compte peut pré-insérer cet
  -- identifiant à SON nom (policy client : `from_id = auth.uid()` seulement) —
  -- le piège de la 6ᵉ contre-revue du 16/09 sur `n_m_`. Le `on conflict` ne
  -- met donc à jour que la ligne du VRAI destinataire ; sinon on ré-insère sous
  -- un identifiant neuf (revue indépendante du 2026-11-02, point 3e).
  perform set_config('passio.notification_serveur', '1', true);
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values ('n_pa_' || left(p_event_id, 12) || '_' || left(cible, 8), cible, 'event_update', ev.author_id, p_event_id,
            'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
            false, now())
    on conflict (id) do update set content = excluded.content, seen = false, created_at = now()
      where public.notifications.user_id = excluded.user_id and public.notifications.kind = 'event_update';
    if not found then
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values ('n_pa_' || left(md5(p_event_id || '|' || cible || '|' || clock_timestamp()::text), 20), cible, 'event_update', ev.author_id, p_event_id,
              'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
              false, now());
    end if;
  exception when others then
    raise warning 'promouvoir_attente : notification non écrite (%) — la promotion est conservée', sqlerrm;
  end;
  -- QUI a été promu ne se dit qu'à l'organisation, ou à la personne promue
  -- (R24, 2026-11-03). La promotion automatique est ouverte à tout compte
  -- connecté — celui qui libère une place n'a plus de lien avec l'activité une
  -- fois parti (C-04) — et rendre le nom à n'importe quel appelant lui livrait,
  -- un appel à la fois et sans s'inscrire, qui vient. Les autres apprennent que
  -- la place est donnée, pas à qui.
  if orga or cible = moi then
    return jsonb_build_object('ok', true, 'user_id', cible);
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Déclencheurs, sous leurs noms de production (l'ordre alphabétique compte).
create trigger aa_rencontres_inscription before insert or update on public.event_attendees
  for each row execute function rencontres_prive.inscription_gardee();
create trigger trg_event_attendees_capacite before insert or update on public.event_attendees
  for each row execute function public.event_attendees_capacite_gardee();
create trigger trg_event_attendees_etat before insert or update on public.event_attendees
  for each row execute function public.event_attendees_etat_garde();
create trigger trg_event_attendees_figes before update on public.event_attendees
  for each row execute function public.event_attendees_figes();
create trigger trg_event_attendees_sortie_discussion after delete or update of rsvp on public.event_attendees
  for each row execute function public.event_attendees_sortie_discussion();
create trigger zz_rencontres_trace after insert or delete or update on public.event_attendees
  for each row execute function rencontres_prive.inscription_tracee();
create trigger confirmation_membre after insert on rencontres_prive.decisions
  for each row when ((new.accepter and (new.decideur_id <> new.user_id))) execute function rencontres_prive.notifier_confirmation();
create trigger refus_demande_membre before insert on rencontres_prive.decisions
  for each row when ((not new.accepter)) execute function rencontres_prive.signaler_refus_demande();
create trigger aa_conv_members_garde before insert on public.conv_members
  for each row execute function public.conv_members_garde();
create trigger aa_rencontres_membre before insert or update on public.conv_members
  for each row execute function rencontres_prive.membre_garde();
create trigger trg_notifications_origine before insert on public.notifications
  for each row execute function public.notifications_origine();
SQL

# Les quatre définitions que la migration remplace : celles de PRODUCTION, prises
# du fichier de retour arrière (une seule copie dans le dépôt) — puis le
# déclencheur de pointage qui les attend.
awk '/^-- Définitions de PRODUCTION du 2026-11-27/{p=1;next} /^-- ── VERDICT/{p=0} p' "$RETOUR" > "$BASE/prod.sql"
SOCLE="$(APPLIQUER "$BASE/prod.sql")" || { echo "$SOCLE"; echo "❌ définitions de production non posées"; exit 1; }
PREP "create trigger trg_event_attendees_pointage before insert or update on public.event_attendees
     for each row execute function public.event_attendees_pointage_garde();
   revoke all on function public.valider_participant(text,text,boolean), public.pointer_par_code(text,text),
     public.retirer_invite_activite(text,text), public.promouvoir_attente(text,text) from public;
   grant execute on function public.valider_participant(text,text,boolean), public.pointer_par_code(text,text),
     public.retirer_invite_activite(text,text), public.promouvoir_attente(text,text) to authenticated, service_role;"

echo "── ⓪ Le socle porte les corps de PRODUCTION ──"
verifier "empreintes des quatre définitions remplacées = celles mesurées au catalogue le 2026-11-27" \
  "e7ca3212181f3daffb584582fb343d85|6f85eba6af8165ec1aba8da2ff4d0ee0|82f0ddfb437c732aa9527d6c56511ef8|95b00925397b8d0cf8c040a51e172179" \
  "$(Q "select string_agg(md5(replace(prosrc, chr(13), '')), '|' order by o) from (values (1,'public.valider_participant(text,text,boolean)'),(2,'public.pointer_par_code(text,text)'),(3,'public.event_attendees_pointage_garde()'),(4,'public.retirer_invite_activite(text,text)')) v(o,s) join pg_proc p on p.oid = to_regprocedure(v.s);")"
verifier "empreintes du socle recopié (promotion, journal, discussion, refus, capacité)" \
  "3edef536245e92950486226daf712c01|389375f034d0fbbaa0cc608137c6cfe6|582c1956bbf75b19eddc87c82b707eb3|4c505e05ccda0de4b4890a20c264271e|1c4f215ae3de8b160eb0aace30b843cc|fdda4349bda51e7804727a1262dff8c8|2264a362f103da28aa9a7da56523a76b" \
  "$(Q "select string_agg(md5(replace(prosrc, chr(13), '')), '|' order by o) from (values (1,'public.promouvoir_attente(text,text)'),(2,'rencontres_prive.inscription_tracee()'),(3,'rencontres_prive.membre_garde()'),(4,'public.conv_members_garde()'),(5,'rencontres_prive.signaler_refus_demande()'),(6,'public.event_attendees_capacite_gardee()'),(7,'rencontres_prive.inscription_gardee()')) v(o,s) join pg_proc p on p.oid = to_regprocedure(v.s);")"

# Un jeu de lignes posé SANS session (comme une restauration : les gardes
# laissent passer), pour une activité de suffixe $1.
#   cap_$1  : 3 places — Léa, Inès (validée), Hugo (en attente) ; Chloé puis Tom en file
#   fini_$1 : terminée — Inès validée, Hugo en attente, Chloé « je ne peux pas » pointée, Léa
#   now_$1  : commence dans 30 min — Inès validée, Hugo en attente, Chloé « je ne peux pas »,
#             Tom en file, Marc « peut-être », Léa ; code d'accueil ABC234
#   conv_$1 : discussion ouverte par Léa ; Hugo en attente
peupler() {
  PREP "insert into public.profiles values ('$LEA'),('$INES'),('$HUGO'),('$CHLOE'),('$TOM'),('$KEVIN'),('$MARC') on conflict do nothing;
     insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, end_at, created_at) values
       ('cap_$1',  '$LEA', '$LEA', 'Atelier <b>poterie</b>', 3, now() + interval '2 days', now() + interval '2 days 2 hours', now() - interval '1 day'),
       ('fini_$1', '$LEA', '$LEA', 'Soirée finie', 10, now() - interval '5 hours', now() - interval '2 hours', now() - interval '3 days'),
       ('now_$1',  '$LEA', '$LEA', 'Ça commence', 10, now() + interval '30 minutes', now() + interval '3 hours', now() - interval '1 day'),
       ('conv_$1', '$LEA', '$LEA', 'Avec discussion', 10, now() + interval '3 days', null, now() - interval '1 day');
     insert into public.event_attendees (event_id, user_id, rsvp, created_at) values
       ('cap_$1', '$LEA', 'going', now() - interval '5 hours'), ('cap_$1', '$INES', 'going', now() - interval '4 hours'),
       ('cap_$1', '$HUGO', 'going', now() - interval '3 hours'), ('cap_$1', '$CHLOE', 'waitlist', now() - interval '2 hours'),
       ('cap_$1', '$TOM', 'waitlist', now() - interval '1 hour'),
       ('fini_$1', '$LEA', 'going', now() - interval '3 days'), ('fini_$1', '$INES', 'going', now() - interval '3 days'),
       ('fini_$1', '$HUGO', 'going', now() - interval '3 days'), ('fini_$1', '$CHLOE', 'declined', now() - interval '3 days'),
       ('now_$1', '$LEA', 'going', now() - interval '1 day'), ('now_$1', '$INES', 'going', now() - interval '1 day'),
       ('now_$1', '$HUGO', 'going', now() - interval '1 day'), ('now_$1', '$CHLOE', 'declined', now() - interval '1 day'),
       ('now_$1', '$TOM', 'waitlist', now() - interval '1 day'), ('now_$1', '$MARC', 'maybe', now() - interval '1 day'),
       ('conv_$1', '$LEA', 'going', now() - interval '1 day'), ('conv_$1', '$HUGO', 'going', now() - interval '1 day');
     update public.event_attendees set checked_in_at = now() - interval '4 hours' where event_id = 'fini_$1' and user_id = '$CHLOE';
     insert into rencontres_prive.accords values ('cap_$1', '$INES'), ('fini_$1', '$INES'), ('now_$1', '$INES');
     insert into public.event_checkin_secrets values ('now_$1', 'ABC234');
     insert into public.conversations (id, is_group, created_by, created_at) values ('evgrp_conv_$1', true, '$LEA', now());
     update public.events set conv_id = 'evgrp_conv_$1' where id = 'conv_$1';
     insert into public.conv_members (conv_id, user_id) values ('evgrp_conv_$1', '$LEA');"
}
rsvp() { Q "select coalesce((select rsvp from public.event_attendees where event_id = '$1' and user_id = '$2'), '—');"; }
avis_retrait() { Q "select count(*) from public.notifications where user_id = '$2' and ref_id = '$1' and id like 'n_pi_retrait_%' and origine = 'serveur';"; }
going() { Q "select count(*) from public.event_attendees where event_id = '$1' and rsvp = 'going';"; }

# ══ ⓪ AVANT : les défauts se reproduisent ═══════════════════════════════════
echo "── ⓪ AVANT la migration : les six défauts ──"
peupler av
EN "$LEA" "select public.valider_participant('cap_av', '$INES', false)" >/dev/null
verifier "AVANT ① l'organisation retire Inès (validée) : Chloé reste en file, la place reste vide" "waitlist|2" "$(rsvp cap_av "$CHLOE")|$(going cap_av)"
verifier "AVANT ② Inès, retirée, n'en est pas prévenue" "0" "$(Q "select count(*) from public.notifications where user_id = '$INES' and ref_id = 'cap_av';")"
verifier "AVANT ③ Hugo (en attente) note une activité à venir : ACCEPTÉ" "ok" "$(ESSAI "$HUGO" "update public.event_attendees set rating = 1, feedback = 'nul' where event_id = 'cap_av' and user_id = '$HUGO'")"
verifier "AVANT ④ Chloé (« je ne peux pas ») se pointe en écrivant sa ligne : ACCEPTÉ" "ok" "$(ESSAI "$CHLOE" "update public.event_attendees set checked_in_at = now() where event_id = 'now_av' and user_id = '$CHLOE'")"
EN "$LEA" "select public.valider_participant('conv_av', '$HUGO', true)" >/dev/null
verifier "AVANT ⑤ Hugo, validé, n'est pas dans la discussion" "0" "$(Q "select count(*) from public.conv_members where conv_id = 'evgrp_conv_av' and user_id = '$HUGO';")"
verifier "AVANT ⑥ une couverture servie par un hôte tiers : ACCEPTÉE" "ok" "$(ESSAI "$LEA" "update public.events set cover_url = 'https://pixel.example/x.png' where id = 'cap_av'")"
PREP "update public.events set cover_url = null where id = 'cap_av';"

# ══ ① LA MIGRATION ══════════════════════════════════════════════════════════
echo "── ① La migration s'applique, se rejoue ──"
SORTIE="$(APPLIQUER "$MIG")" || { echo "$SORTIE"; echo "❌ la migration ne s'applique pas"; exit 1; }
verifier "neuf lignes de verdict, aucune en ECHEC" "9|0" "$(printf '%s\n' "$SORTIE" | grep -c -E '^ *[0-9]+ \|' || true)|$(printf '%s\n' "$SORTIE" | grep -c 'ECHEC' || true)"
SORTIE2="$(APPLIQUER "$MIG")" || { echo "$SORTIE2"; echo "❌ la migration ne se rejoue pas"; exit 1; }
verifier "rejeu : verdict sans ECHEC" "0" "$(printf '%s\n' "$SORTIE2" | grep -c 'ECHEC' || true)"
verifier "couverture : contrainte posée VALIDE (aucune ligne hors hôte)" "t" "$(Q "select convalidated from pg_constraint where conname = 'events_cover_url_hote';")"

# ══ ② APRÈS ═════════════════════════════════════════════════════════════════
echo "── ② APRÈS : ① la base promeut ──"
peupler ap
EN "$LEA" "select public.valider_participant('cap_ap', '$INES', false)" >/dev/null
verifier "l'organisation retire Inès (validée) : Chloé (première arrivée) reçoit la place, Tom attend" "going|waitlist|3" "$(rsvp cap_ap "$CHLOE")|$(rsvp cap_ap "$TOM")|$(going cap_ap)"
verifier "Chloé est prévenue par la base — et le texte dit qu'il reste à valider" "1" "$(Q "select count(*) from public.notifications where user_id = '$CHLOE' and ref_id = 'cap_ap' and id like 'n_pa_%' and origine = 'serveur' and content like '%doit valider%' and content like '%&lt;b&gt;%';")"
verifier "l'appel client qui suit (promouvoir_attente) ne promeut personne de plus : « complete »" "complete|3" \
  "$(EN "$HUGO" "select public.promouvoir_attente('cap_ap', null)->>'motif'")|$(going cap_ap)"
verifier "Hugo se retire lui-même : Tom reçoit la place (et une seule)" "ok|going|3" \
  "$(ESSAI "$HUGO" "delete from public.event_attendees where event_id = 'cap_ap' and user_id = '$HUGO'")|$(rsvp cap_ap "$TOM")|$(going cap_ap)"

# Hausse de capacité, et tête de file non promouvable (plafond du jour atteint).
PREP "insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, created_at) values
     ('plus_ap', '$LEA', '$LEA', 'Plus de places', 2, now() + interval '4 days', now() - interval '1 day');
   insert into public.event_attendees (event_id, user_id, rsvp, created_at) values
     ('plus_ap', '$LEA', 'going', now() - interval '6 hours'), ('plus_ap', '$INES', 'going', now() - interval '5 hours'),
     ('plus_ap', '$KEVIN', 'waitlist', now() - interval '4 hours'), ('plus_ap', '$CHLOE', 'waitlist', now() - interval '3 hours'),
     ('plus_ap', '$TOM', 'waitlist', now() - interval '2 hours');
   insert into rencontres_prive.inscriptions (event_id, user_id, rsvp) select null, '$KEVIN', 'going' from generate_series(1, 20);"
verifier "Léa passe de 2 à 3 places : Kevin (tête, plafond du jour atteint) est SAUTÉ, Chloé promue, Tom attend" "ok|waitlist|going|waitlist" \
  "$(ESSAI "$LEA" "update public.events set max_attendees = 3 where id = 'plus_ap'")|$(rsvp plus_ap "$KEVIN")|$(rsvp plus_ap "$CHLOE")|$(rsvp plus_ap "$TOM")"
verifier "Léa passe à 5 places : Tom est promu, Kevin toujours sauté, jamais plus que la capacité" "going|4" \
  "$( ESSAI "$LEA" "update public.events set max_attendees = 5 where id = 'plus_ap'" >/dev/null; rsvp plus_ap "$TOM")|$(going plus_ap)"

echo "── ② APRÈS : ② le retrait est annoncé ──"
verifier "Inès, validée puis retirée, reçoit l'avis de retrait (origine serveur)" "1" "$(avis_retrait cap_ap "$INES")"
verifier "…sans contenu libre : la phrase fixe, titre échappé" "1" "$(Q "select count(*) from public.notifications where user_id = '$INES' and id like 'n_pi_retrait_%' and content = 'Ta participation à « Atelier &lt;b&gt;poterie&lt;/b&gt; » a été retirée par l’organisation.';")"
EN "$LEA" "select public.valider_participant('conv_ap', '$HUGO', false)" >/dev/null
verifier "Hugo (demande en attente) refusé : UN seul avis, celui du refus (pas de doublon de retrait)" "1|0" \
  "$(Q "select count(*) from public.notifications where user_id = '$HUGO' and ref_id = 'conv_ap' and id like 'n_pi_refus_%';")|$(avis_retrait conv_ap "$HUGO")"
PREP "insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, created_at) values
     ('ret_ap', '$LEA', '$LEA', 'Retraits', 5, now() + interval '3 days', now() - interval '1 day');
   insert into public.event_attendees (event_id, user_id, rsvp) values
     ('ret_ap', '$LEA', 'going'), ('ret_ap', '$CHLOE', 'declined'), ('ret_ap', '$TOM', 'waitlist');"
EN "$LEA" "select public.valider_participant('ret_ap', '$CHLOE', false)" >/dev/null
verifier "Chloé (« je ne peux pas ») retirée : aucun avis" "0|—" "$(avis_retrait ret_ap "$CHLOE")|$(rsvp ret_ap "$CHLOE")"
EN "$LEA" "select public.valider_participant('ret_ap', '$TOM', false)" >/dev/null
verifier "Tom (en liste d'attente) retiré : prévenu" "1|—" "$(avis_retrait ret_ap "$TOM")|$(rsvp ret_ap "$TOM")"
# Activité privée : retrait d'un invité validé — prévenu SANS le titre, et sa place promeut la file.
PREP "insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, visibilite, created_at) values
     ('priv_ap', '$LEA', '$LEA', 'Dîner secret', 2, now() + interval '5 days', 'privee', now() - interval '1 day');
   insert into public.event_invites (event_id, user_id, invited_by) values ('priv_ap', '$HUGO', '$LEA'), ('priv_ap', '$CHLOE', '$LEA'), ('priv_ap', '$MARC', '$LEA');
   insert into public.event_attendees (event_id, user_id, rsvp, created_at) values
     ('priv_ap', '$LEA', 'going', now() - interval '3 hours'), ('priv_ap', '$HUGO', 'going', now() - interval '2 hours'),
     ('priv_ap', '$CHLOE', 'waitlist', now() - interval '1 hour');
   insert into rencontres_prive.accords values ('priv_ap', '$HUGO');"
verifier "retrait d'un invité validé : true, prévenu, la file avance" "t|1|going" \
  "$(EN "$LEA" "select public.retirer_invite_activite('priv_ap', '$HUGO')")|$(avis_retrait priv_ap "$HUGO")|$(rsvp priv_ap "$CHLOE")"
verifier "…et l'avis ne porte PAS le titre de l'activité privée" "0" "$(Q "select count(*) from public.notifications where user_id = '$HUGO' and content like '%secret%';")"
verifier "un invité qui n'avait pas répondu (Marc) est retiré en silence" "t|0" \
  "$(EN "$LEA" "select public.retirer_invite_activite('priv_ap', '$MARC')")|$(avis_retrait priv_ap "$MARC")"

echo "── ② APRÈS : ③ note et avis ──"
refuse "Hugo (en attente) note une activité À VENIR : refusé" "note_avant_fin" "$(ESSAI "$HUGO" "update public.event_attendees set rating = 1, feedback = 'nul' where event_id = 'now_ap' and user_id = '$HUGO'")"
refuse "Inès (validée) note une activité À VENIR : refusé" "note_avant_fin" "$(ESSAI "$INES" "update public.event_attendees set rating = 5 where event_id = 'now_ap' and user_id = '$INES'")"
refuse "Hugo (demande jamais validée) note une activité TERMINÉE : refusé" "note_sans_participation" "$(ESSAI "$HUGO" "update public.event_attendees set rating = 1 where event_id = 'fini_ap' and user_id = '$HUGO'")"
refuse "Léa (organisatrice) note sa propre activité : refusé" "note_sans_participation" "$(ESSAI "$LEA" "update public.event_attendees set rating = 5 where event_id = 'fini_ap' and user_id = '$LEA'")"
verifier "Inès (validée) note l'activité terminée : accepté, rated_at = heure du serveur" "ok|5|t" \
  "$(ESSAI "$INES" "update public.event_attendees set rating = 5, feedback = 'super', rated_at = '2000-01-01' where event_id = 'fini_ap' and user_id = '$INES'")|$(Q "select rating from public.event_attendees where event_id = 'fini_ap' and user_id = '$INES';")|$(Q "select rated_at > now() - interval '1 minute' from public.event_attendees where event_id = 'fini_ap' and user_id = '$INES';")"
verifier "Chloé (pointée, puis « je ne peux pas ») note : acceptée — elle était là" "ok" "$(ESSAI "$CHLOE" "update public.event_attendees set rating = 4 where event_id = 'fini_ap' and user_id = '$CHLOE'")"
verifier "Inès efface sa note : accepté" "ok|" "$(ESSAI "$INES" "update public.event_attendees set rating = null, feedback = null where event_id = 'fini_ap' and user_id = '$INES'")|$(Q "select rating from public.event_attendees where event_id = 'fini_ap' and user_id = '$INES';")"
refuse "une ligne neuve ne naît pas notée (Marc, activité à venir)" "note_avant_fin" "$(ESSAI "$MARC" "insert into public.event_attendees (event_id, user_id, rsvp, rating) values ('cap_ap', '$MARC', 'maybe', 5)")"

echo "── ② APRÈS : ④ pointage ──"
refuse "Chloé (« je ne peux pas ») se pointe en direct : refusé" "pointage_non_valide" "$(ESSAI "$CHLOE" "update public.event_attendees set checked_in_at = now() where event_id = 'now_ap' and user_id = '$CHLOE'")"
refuse "Hugo (demande non validée) se pointe en direct : refusé" "pointage_non_valide" "$(ESSAI "$HUGO" "update public.event_attendees set checked_in_at = now() where event_id = 'now_ap' and user_id = '$HUGO'")"
refuse "Marc (« peut-être ») se pointe en direct : refusé" "pointage_non_valide" "$(ESSAI "$MARC" "update public.event_attendees set checked_in_at = now() where event_id = 'now_ap' and user_id = '$MARC'")"
verifier "Inès (validée) se pointe, avec une heure forgée : accepté, heure du SERVEUR" "ok|t" \
  "$(ESSAI "$INES" "update public.event_attendees set checked_in_at = '2000-01-01' where event_id = 'now_ap' and user_id = '$INES'")|$(Q "select checked_in_at > (now() at time zone 'UTC') - interval '1 minute' from public.event_attendees where event_id = 'now_ap' and user_id = '$INES';")"
AVANT_P="$(Q "select checked_in_at from public.event_attendees where event_id = 'now_ap' and user_id = '$INES';")"
ESSAI "$INES" "update public.event_attendees set checked_in_at = '2001-01-01' where event_id = 'now_ap' and user_id = '$INES'" >/dev/null
verifier "un pointage posé ne se réécrit pas" "$AVANT_P" "$(Q "select checked_in_at from public.event_attendees where event_id = 'now_ap' and user_id = '$INES';")"
verifier "Léa (organisatrice) se pointe : accepté" "ok" "$(ESSAI "$LEA" "update public.event_attendees set checked_in_at = now() where event_id = 'now_ap' and user_id = '$LEA'")"
verifier "par le CODE d'accueil, Hugo (demande) et Marc (« peut-être ») pointent toujours" "ok|ok" \
  "$(EN "$HUGO" "select public.pointer_par_code('now_ap', 'abc 234')")|$(EN "$MARC" "select public.pointer_par_code('now_ap', 'ABC234')")"
verifier "…tous deux pointés en base" "t" \
  "$(Q "select count(*) = 2 from public.event_attendees where event_id = 'now_ap' and user_id in ('$HUGO', '$MARC') and checked_in_at is not null;")"
verifier "par le code, la liste d'attente reste refusée" "liste_attente" "$(PREP "insert into public.event_attendees (event_id, user_id, rsvp) values ('now_ap', '$KEVIN', 'waitlist');"; EN "$KEVIN" "select public.pointer_par_code('now_ap', 'ABC234')")"
PREP "insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, created_at) values
     ('now2_ap', '$LEA', '$LEA', 'Ça commence aussi', 10, now() + interval '20 minutes', now() - interval '1 day');"
refuse "un INSERT ne naît pas pointé (Marc, activité qui commence)" "pointage_non_valide" "$(ESSAI "$MARC" "insert into public.event_attendees (event_id, user_id, rsvp, checked_in_at) values ('now2_ap', '$MARC', 'maybe', now())")"

echo "── ② APRÈS : ⑤ la discussion ──"
PREP "insert into public.event_attendees (event_id, user_id, rsvp) values ('conv_ap', '$INES', 'going');"
EN "$LEA" "select public.valider_participant('conv_ap', '$INES', true)" >/dev/null
verifier "Inès validée : membre de la discussion sans ouvrir l'app, accord posé" "1|1" \
  "$(Q "select count(*) from public.conv_members where conv_id = 'evgrp_conv_ap' and user_id = '$INES';")|$(Q "select count(*) from rencontres_prive.accords where event_id = 'conv_ap' and user_id = '$INES';")"
verifier "valider deux fois ne double rien" "t|1" \
  "$(EN "$LEA" "select public.valider_participant('conv_ap', '$INES', true)")|$(Q "select count(*) from public.conv_members where conv_id = 'evgrp_conv_ap' and user_id = '$INES';")"
verifier "sans discussion ouverte, valider marche toujours (Chloé, promue sur cap_ap)" "t|0" \
  "$(EN "$LEA" "select public.valider_participant('cap_ap', '$CHLOE', true)")|$(Q "select count(*) from public.conv_members where user_id = '$CHLOE';")"
verifier "Léa ouvre ENSUITE la discussion de cap_ap : Chloé, déjà validée, y entre" "ok|1" \
  "$(PREP "insert into public.conversations (id, is_group, created_by, created_at) values ('evgrp_cap_ap', true, '$LEA', now());"; ESSAI "$LEA" "update public.events set conv_id = 'evgrp_cap_ap' where id = 'cap_ap'")|$(Q "select count(*) from public.conv_members where conv_id = 'evgrp_cap_ap' and user_id = '$CHLOE';")"
verifier "Tom (promu, pas validé) n'y entre pas" "0" "$(Q "select count(*) from public.conv_members where conv_id = 'evgrp_cap_ap' and user_id = '$TOM';")"

echo "── ② APRÈS : ⑥ la couverture ──"
refuse "couverture d'un hôte tiers : refusée" "events_cover_url_hote" "$(ESSAI "$LEA" "update public.events set cover_url = 'https://pixel.example/x.png' where id = 'cap_ap'")"
refuse "hôte déguisé (sous-domaine d'un tiers) : refusé" "events_cover_url_hote" "$(ESSAI "$LEA" "update public.events set cover_url = 'https://njkiyoklssvefstljemx.supabase.co.pixel.example/storage/v1/object/public/m/x.jpg' where id = 'cap_ap'")"
verifier "Storage du projet (production, staging) et relais de l'app : acceptés" "ok|ok|ok" \
  "$(ESSAI "$LEA" "update public.events set cover_url = 'https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/media/content/events/a.jpg' where id = 'cap_ap'")|$(ESSAI "$LEA" "update public.events set cover_url = 'https://fcksxofaelcdmmifnwjo.supabase.co/storage/v1/object/public/media/b.jpg' where id = 'cap_ap'")|$(ESSAI "$LEA" "update public.events set cover_url = 'https://passio-app.netlify.app/media/content/events/c.jpg' where id = 'cap_ap'")"

echo "── ② APRÈS : ce qui marchait ──"
verifier "Léa supprime une activité pleine avec file : supprimée, sans erreur" "ok|0" \
  "$(ESSAI "$LEA" "delete from public.events where id = 'plus_ap'")|$(Q "select count(*) from public.event_attendees where event_id = 'plus_ap';")"
verifier "Kevin (sans lien) ne promeut personne de son choix" "non_autorise" "$(EN "$KEVIN" "select public.promouvoir_attente('now_ap', '$MARC')->>'motif'")"

# ══ ③ MUTATIONS ═════════════════════════════════════════════════════════════
echo "── ③ MUTATION : chaque garde retirée fait revenir son défaut ──"
peupler mu
PREP "drop trigger trg_event_attendees_note on public.event_attendees;"
verifier "sans trg_event_attendees_note : la note avant la fin repasse (le banc le voit)" "ok" "$(ESSAI "$HUGO" "update public.event_attendees set rating = 1 where event_id = 'now_mu' and user_id = '$HUGO'")"
PREP "drop trigger zz_rencontres_place_liberee on public.event_attendees;"
EN "$LEA" "select public.valider_participant('cap_mu', '$INES', false)" >/dev/null
verifier "sans zz_rencontres_place_liberee : Chloé reste en file (le banc le voit)" "waitlist" "$(rsvp cap_mu "$CHLOE")"
SORTIE3="$(APPLIQUER "$MIG")" || { echo "$SORTIE3"; echo "❌ la migration ne se réapplique pas après mutation"; exit 1; }
refuse "migration réappliquée : la garde de note est de retour" "note_avant_fin" "$(ESSAI "$TOM" "update public.event_attendees set rating = 1 where event_id = 'now_mu' and user_id = '$TOM'")"

# ══ ④ RETOUR ARRIÈRE ════════════════════════════════════════════════════════
echo "── ④ Retour arrière ──"
SORTIE4="$(APPLIQUER "$RETOUR")" || { echo "$SORTIE4"; echo "❌ le retour arrière ne s'applique pas"; exit 1; }
verifier "retour : trois lignes de verdict, aucune en ECHEC" "3|0" "$(printf '%s\n' "$SORTIE4" | grep -c -E '^ *[0-9]+ \|' || true)|$(printf '%s\n' "$SORTIE4" | grep -c 'ECHEC' || true)"
verifier "retour : le défaut ④ revient (Chloé « je ne peux pas » se pointe)" "ok" "$(ESSAI "$CHLOE" "update public.event_attendees set checked_in_at = now() where event_id = 'now_mu' and user_id = '$CHLOE'")"
SORTIE5="$(APPLIQUER "$MIG")" || { echo "$SORTIE5"; echo "❌ la migration ne se réapplique pas après le retour"; exit 1; }
verifier "la migration se réapplique après le retour" "0" "$(printf '%s\n' "$SORTIE5" | grep -c 'ECHEC' || true)"

# ══ ③ bis GARDE D'EMPREINTE (en dernier : elle altère une définition) ════════
echo "── ③ bis Garde : une définition changée arrête tout ──"
PREP "create or replace function public.pointer_par_code(p_event_id text, p_code text) returns text language plpgsql security definer set search_path = '' as \$f\$ begin return 'ok'; end \$f\$;"
if SORTIE6="$(APPLIQUER "$MIG")"; then GARDE="appliquée"; else GARDE="arrêtée"; fi
verifier "pointer_par_code réécrit ailleurs : la migration est ARRÊTÉE" "arrêtée" "$GARDE"
refuse "…et le dit" "a changé depuis la mesure" "$SORTIE6"

echo
echo "banc rencontrer_serveur : $ok ✅ · $ko ❌"
[ "$ko" -eq 0 ]
