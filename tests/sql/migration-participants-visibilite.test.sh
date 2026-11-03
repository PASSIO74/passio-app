#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_participants_visibilite_2026-11-03.sql (C-04)
#
# PostgreSQL jetable, socle = `events` / `event_attendees` / `follows` /
# `blocks` avec les policies, GRANTs et triggers de production tels que mesurés
# au canal ① le 2026-11-03 (SELECT `true` pour authenticated, `anon` avec
# DELETE / TRUNCATE / REFERENCES / TRIGGER, garde de capacité
# `event_attendees_capacite_gardee` et `is_blocked_with` recopiées de
# `pg_get_functiondef`). On MESURE D'ABORD le défaut (un tiers lit la liste
# nominative, la note et le texte libre de chacun ; il s'écrit « peut-être »
# sur une activité passée ou annulée), on applique, puis on éprouve chaque
# branche du lien : soi, organisation (auteur / organisateur /
# co-organisateur), VENANT (« going » seulement), suivi MUTUEL, blocages dans
# les deux sens, « declined » jamais public ; le contournement des deux
# contre-revues (s'écrire « maybe » / « waitlist » sur une activité passée,
# annulée ou complète pour lire la liste) ; les colonnes de retour illisibles ;
# les compteurs et l'agrégat publics parmi les connectés, avec le seuil de 3
# notes ; les retours réservés à l'organisation ; anon sans AUCUN droit ; et un
# verdict qui ne peut pas imprimer OK sur un privilège resté en place.
#
#   bash tests/sql/migration-participants-visibilite.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_participants_visibilite_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6200 + RANDOM % 120 ))
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

DB=participants
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
# Liste triée des inscrits que `$1` voit sur l'activité `$2` (lettre du compte, pas l'uuid).
VOIT() { AUTH "$1" "select string_agg(substr(user_id, 1, 1), ',' order by user_id) from public.event_attendees where event_id = '$2';"; }
# `$1` écrit SA ligne sur l'activité `$2` dans l'état `$3` (le geste du client, par l'API brute).
INSCRIT() { AUTH "$1" "insert into public.event_attendees (event_id, user_id, rsvp) values ('$2', '$1', '$3') returning 1;"; }
CHANGE()  { AUTH "$1" "update public.event_attendees set rsvp = '$3' where event_id = '$2' and user_id = '$1' returning rsvp;"; }
RETIRE()  { AUTH "$1" "delete from public.event_attendees where event_id = '$2' and user_id = '$1' returning 1;"; }
# Moyenne et nombre rendus par `notes_evenement` à `$1` (`null` quand la moyenne est retenue).
NOTES()   { AUTH "$1" "select coalesce(j->>'avg', 'null') || '|' || (j->>'count') from (select public.notes_evenement('$2') j) s;"; }
# OK/ECHEC du tableau de verdict d'une sortie de migration.
BILAN()   { printf '%s/%s' "$(printf '%s\n' "$1" | grep -cE '\|\s*OK\s*$' || true)" "$(printf '%s\n' "$1" | grep -cE '\|\s*ECHEC\s*$' || true)"; }

ORGA=11111111-1111-1111-1111-111111111111
COORG=22222222-2222-2222-2222-222222222222
A=33333333-3333-3333-3333-333333333333   # inscrit (going) ; T et lui se suivent MUTUELLEMENT
B=44444444-4444-4444-4444-444444444444   # inscrit (maybe)
C=55555555-5555-5555-5555-555555555555   # a refusé (declined)
D=66666666-6666-6666-6666-666666666666   # liste d'attente, compte PRIVÉ (demande de T en attente)
T=77777777-7777-7777-7777-777777777777   # tiers : ni inscrit, ni organisation ; ami mutuel de A, demande D
X=88888888-8888-8888-8888-888888888888   # tiers sans aucun lien — l'attaquant des contre-revues
S=99999999-9999-9999-9999-999999999999   # suit A SANS retour (profil public : accepté d'office)

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.events (id text primary key, author_id text not null, organizer_id text, title text, status text not null default 'active',
  max_attendees integer, date_at timestamp, end_at timestamp, co_organizers jsonb not null default '[]');
create table public.event_attendees (event_id text not null references public.events(id) on delete cascade, user_id text not null,
  created_at timestamptz default now(), rsvp text not null default 'going'
    check (rsvp = any (array['going', 'maybe', 'declined', 'waitlist'])),
  checked_in_at timestamp, rating smallint check (rating is null or (rating >= 1 and rating <= 5)), feedback text, rated_at timestamptz,
  primary key (event_id, user_id));
create table public.follows (follower_id text not null, following_id text not null, status text not null default 'accepted',
  created_at timestamptz not null default now(), primary key (follower_id, following_id));
create table public.blocks (blocker_id text not null, blocked_id text not null, created_at timestamptz default now(),
  primary key (blocker_id, blocked_id));
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
-- Production, 2026-11-03 (canal ①) : events lisibles, event_attendees SELECT `true` pour authenticated,
-- écriture « ma ligne », follows lisibles si acceptés ou si l'on en est partie, blocks « les miens ».
create policy "Lecture publique" on public.events for select using (true);
create policy event_attendees_select_authentifie on public.event_attendees for select to authenticated using (true);
create policy event_attendees_insert_own on public.event_attendees for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy event_attendees_update_own on public.event_attendees for update to authenticated using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy "Suppression propre" on public.event_attendees for delete using (user_id = (select auth.uid())::text);
create policy follows_lecture on public.follows for select to anon, authenticated
  using (status = 'accepted' or follower_id = (select auth.uid())::text or following_id = (select auth.uid())::text);
create policy blocks_select_own on public.blocks for select using (blocker_id = (select auth.uid())::text);
grant select on public.events to anon, authenticated;
grant all on public.event_attendees to authenticated;
-- Les droits de table superflus mesurés en production (`anon=dDxtm/postgres` ; MAINTAIN n'existe
-- qu'en PostgreSQL 17, il n'est donc pas posable sur ce banc).
grant delete, truncate, references, trigger on public.event_attendees to anon;
grant select on public.follows to anon, authenticated;

-- `is_blocked_with`, copie de production (pg_get_functiondef, 2026-11-03).
create function public.is_blocked_with(_other text) returns boolean
language sql stable security definer set search_path to ''
as $fn$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.blocks b
       WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
          OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$fn$;
revoke all on function public.is_blocked_with(text) from public, anon;
grant execute on function public.is_blocked_with(text) to authenticated;

-- Garde de capacité, copie de production (pg_get_functiondef, 2026-11-03) :
-- seul le PASSAGE à « going » est gardé — c'est la brèche des contre-revues.
create function public.event_attendees_capacite_gardee() returns trigger
language plpgsql security definer set search_path to ''
as $fn$
declare
  ev record;
  inscrits integer;
begin
  if auth.uid() is null then return new; end if;
  if new.rsvp is distinct from 'going' then return new; end if;
  if tg_op = 'UPDATE' and old.rsvp = 'going' then return new; end if;
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
$fn$;
revoke all on function public.event_attendees_capacite_gardee() from public, anon, authenticated;
create trigger trg_event_attendees_capacite before insert or update on public.event_attendees
  for each row execute function public.event_attendees_capacite_gardee();

insert into public.events (id, author_id, organizer_id, title, status, max_attendees, date_at, end_at, co_organizers) values
  ('ev_rando', '11111111-1111-1111-1111-111111111111', null, 'Rando', 'active', 10, now() + interval '2 days', null, '["22222222-2222-2222-2222-222222222222"]'),
  ('ev_passee', '11111111-1111-1111-1111-111111111111', null, 'Passée', 'active', null, now() - interval '10 days', null, '[]'),
  ('ev_vide', '11111111-1111-1111-1111-111111111111', null, 'Sans inscrit', 'active', 5, now() + interval '5 days', null, '[]'),
  ('ev_annulee', '11111111-1111-1111-1111-111111111111', null, 'Annulée', 'cancelled', 10, now() + interval '3 days', null, '[]'),
  ('ev_complete', '11111111-1111-1111-1111-111111111111', null, 'Complète', 'active', 1, now() + interval '4 days', null, '[]'),
  ('ev_en_cours', '11111111-1111-1111-1111-111111111111', null, 'En cours', 'active', null, now() - interval '1 hour', null, '[]'),
  ('ev_notes', '11111111-1111-1111-1111-111111111111', null, 'Deux notes', 'active', null, now() - interval '5 days', now() - interval '5 days' + interval '2 hours', '[]');
insert into public.event_attendees (event_id, user_id, rsvp, created_at, checked_in_at, rating, feedback, rated_at) values
  ('ev_rando', '33333333-3333-3333-3333-333333333333', 'going',    now() - interval '3 hours', now(), null, null, null),
  ('ev_rando', '44444444-4444-4444-4444-444444444444', 'maybe',    now() - interval '2 hours', null, null, null, null),
  ('ev_rando', '55555555-5555-5555-5555-555555555555', 'declined', now() - interval '1 hour',  null, null, null, null),
  ('ev_rando', '66666666-6666-6666-6666-666666666666', 'waitlist', now() - interval '30 minutes', null, null, null, null),
  ('ev_passee', '33333333-3333-3333-3333-333333333333', 'going', now() - interval '12 days', now() - interval '10 days', 5, 'Super soirée, à refaire', now() - interval '9 days'),
  ('ev_passee', '44444444-4444-4444-4444-444444444444', 'going', now() - interval '12 days', null, 3, 'Un peu long', now() - interval '9 days'),
  ('ev_passee', '77777777-7777-7777-7777-777777777777', 'going', now() - interval '12 days', null, null, null, null),
  ('ev_annulee', '33333333-3333-3333-3333-333333333333', 'going', now() - interval '1 day', null, null, null, null),
  ('ev_complete', '33333333-3333-3333-3333-333333333333', 'going', now() - interval '1 day', null, null, null, null),
  ('ev_en_cours', '44444444-4444-4444-4444-444444444444', 'maybe', now() - interval '1 day', null, null, null, null),
  ('ev_notes', '33333333-3333-3333-3333-333333333333', 'going', now() - interval '6 days', null, 5, null, now() - interval '4 days'),
  ('ev_notes', '44444444-4444-4444-4444-444444444444', 'going', now() - interval '6 days', null, 3, null, now() - interval '4 days'),
  ('ev_notes', '77777777-7777-7777-7777-777777777777', 'going', now() - interval '6 days', null, null, null, null);
insert into public.follows (follower_id, following_id, status) values
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'accepted'),
  ('33333333-3333-3333-3333-333333333333', '77777777-7777-7777-7777-777777777777', 'accepted'),
  ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'pending'),
  ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', 'accepted');
SQL

echo "── ⓪ AVANT : le défaut mesuré en production ──────────────────────────"
verifier "un tiers sans lien lit la liste nominative entière (A, B, C, D), refus compris" "3,4,5,6" "$(VOIT "$X" ev_rando)"
verifier "…et la note comme le texte libre d'autrui" "5|Super soirée, à refaire" "$(AUTH "$X" "select rating || '|' || feedback from public.event_attendees where event_id='ev_passee' and user_id='$A';")"
verifier "anon tient DELETE, TRUNCATE, REFERENCES, TRIGGER de table (sans policy : 0 ligne, mais les droits sont là)" "true|true|true|true" \
  "$(Q "select has_table_privilege('anon', 'public.event_attendees', 'DELETE') || '|' || has_table_privilege('anon', 'public.event_attendees', 'TRUNCATE') || '|' || has_table_privilege('anon', 'public.event_attendees', 'REFERENCES') || '|' || has_table_privilege('anon', 'public.event_attendees', 'TRIGGER');")"
verifier "la capacité ne garde que « going » : X s'écrit « maybe » sur l'activité PASSÉE — accepté" "1" "$(INSCRIT "$X" ev_passee maybe)"
verifier "…et « waitlist » sur l'activité ANNULÉE — accepté" "1" "$(INSCRIT "$X" ev_annulee waitlist)"
Q "delete from public.event_attendees where user_id = '$X';" >/dev/null

echo "── ① APPLICATION ───────────────────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 5 OK et 0 ECHEC" "5/0" "$(BILAN "$sortie")"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejouée : même verdict (idempotente)" "5/0" "$(BILAN "$sortie2")"

echo "── ② LA LISTE SUIT LE LIEN ────────────────────────────────────────"
verifier "tiers sans aucun lien : rien" "" "$(VOIT "$X" ev_rando)"
verifier "S suit A SANS retour (accepté d'office, profil public) : rien — un clic ne livre plus l'agenda de A" "" "$(VOIT "$S" ev_rando)"
verifier "T et A se suivent MUTUELLEMENT : T voit A seulement — D (demande en attente) reste invisible" "3" "$(VOIT "$T" ev_rando)"
verifier "A, qui VIENT (going) : voit A, B, D — jamais le refus de C" "3,4,6" "$(VOIT "$A" ev_rando)"
verifier "B (peut-être) ne voit que sa propre ligne : « maybe » n'ouvre plus la liste" "4" "$(VOIT "$B" ev_rando)"
verifier "D (liste d'attente) ne voit que sa propre ligne" "6" "$(VOIT "$D" ev_rando)"
verifier "C, qui a refusé, ne voit que sa propre ligne" "5" "$(VOIT "$C" ev_rando)"
verifier "l'auteur voit tout, refus compris" "3,4,5,6" "$(VOIT "$ORGA" ev_rando)"
verifier "le co-organisateur voit tout, refus compris" "3,4,5,6" "$(VOIT "$COORG" ev_rando)"
Q "update public.events set organizer_id = '$X' where id = 'ev_vide';" >/dev/null
Q "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_vide', '$A', 'going');" >/dev/null
verifier "l'organisateur désigné (organizer_id) voit la liste de son activité" "3" "$(VOIT "$X" ev_vide)"
verifier "activité passée : A y était, il voit encore qui y était (A, B, T)" "3,4,7" "$(VOIT "$A" ev_passee)"
verifier "activité passée : X n'y était pas, il ne voit personne" "" "$(VOIT "$X" ev_passee)"
verifier "anon : aucun droit de lecture (42501)" "1" "$(ANON "select count(*) from public.event_attendees;" | grep -c "permission denied" || true)"

echo "── ②bis LE CONTOURNEMENT DES CONTRE-REVUES EST FERMÉ ──────────────"
contient "X s'écrit « maybe » sur l'activité PASSÉE : refusé (activite_passee)" "activite_passee" "$(INSCRIT "$X" ev_passee maybe)"
contient "…« waitlist » : refusé (activite_passee)" "activite_passee" "$(INSCRIT "$X" ev_passee waitlist)"
contient "…« going » : refusé (activite_passee, par la capacité)" "activite_passee" "$(INSCRIT "$X" ev_passee going)"
verifier "…et X ne voit toujours personne sur l'activité passée" "" "$(VOIT "$X" ev_passee)"
verifier "« declined » sur l'activité passée reste permis (un retrait n'est pas une inscription)" "1" "$(INSCRIT "$X" ev_passee declined)"
verifier "…sans rien ouvrir : X ne voit que sa propre ligne" "8" "$(VOIT "$X" ev_passee)"
contient "…et X ne la change pas en « maybe » (UPDATE qui change rsvp : activite_passee)" "activite_passee" "$(CHANGE "$X" ev_passee maybe)"
contient "…ni en « waitlist »" "activite_passee" "$(CHANGE "$X" ev_passee waitlist)"
verifier "X retire sa ligne (DELETE) : accepté" "1" "$(RETIRE "$X" ev_passee)"
contient "activité ANNULÉE : « maybe » refusé (activite_annulee)" "activite_annulee" "$(INSCRIT "$X" ev_annulee maybe)"
contient "…« waitlist » refusé (activite_annulee)" "activite_annulee" "$(INSCRIT "$X" ev_annulee waitlist)"
contient "…« going » refusé (activite_annulee, par la capacité)" "activite_annulee" "$(INSCRIT "$X" ev_annulee going)"
verifier "…« declined » accepté" "1" "$(INSCRIT "$X" ev_annulee declined)"
verifier "…X ne voit que sa ligne, pas A" "8" "$(VOIT "$X" ev_annulee)"
RETIRE "$X" ev_annulee >/dev/null
verifier "A se retire d'une activité annulée (going → declined) : accepté" "declined" "$(CHANGE "$A" ev_annulee declined)"
verifier "activité COMPLÈTE à venir : X s'écrit en liste d'attente — accepté (c'est la liste d'attente)" "1" "$(INSCRIT "$X" ev_complete waitlist)"
verifier "…mais la liste reste fermée : X ne voit que sa ligne, pas A" "8" "$(VOIT "$X" ev_complete)"
contient "…il ne passe pas « going » (activite_complete, par la capacité)" "activite_complete" "$(CHANGE "$X" ev_complete going)"
verifier "…« maybe » accepté (à venir), toujours sans la liste" "maybe|8" "$(CHANGE "$X" ev_complete maybe)|$(VOIT "$X" ev_complete)"
RETIRE "$X" ev_complete >/dev/null
verifier "activité À VENIR : X s'écrit « maybe » — accepté" "1" "$(INSCRIT "$X" ev_rando maybe)"
verifier "…mais « peut-être » n'ouvre pas la liste : X ne voit que sa ligne" "8" "$(VOIT "$X" ev_rando)"
verifier "…X passe « going » (place libre, à venir) : accepté" "going" "$(CHANGE "$X" ev_rando going)"
verifier "…et voit les venants, peut-être et attente — jamais le refus de C (résiduel assumé : la fonctionnalité)" "3,4,6,8" "$(VOIT "$X" ev_rando)"
Q "insert into public.blocks (blocker_id, blocked_id) values ('$A', '$X');" >/dev/null
verifier "A bloque X : X, venant, ne voit plus A" "4,6,8" "$(VOIT "$X" ev_rando)"
Q "insert into public.blocks (blocker_id, blocked_id) values ('$X', '$D');" >/dev/null
verifier "X bloque D : D disparaît aussi (le blocage vaut dans les deux sens)" "4,8" "$(VOIT "$X" ev_rando)"
verifier "…et A, venant, ne voit plus X (blocage vu de l'autre côté)" "3,4,6" "$(VOIT "$A" ev_rando)"
verifier "…l'auteur, lui, voit toujours tout (l'organisation n'est pas filtrée)" "3,4,5,6,8" "$(VOIT "$ORGA" ev_rando)"
Q "delete from public.blocks;" >/dev/null
verifier "blocages levés : X revoit A, B, D" "3,4,6,8" "$(VOIT "$X" ev_rando)"
RETIRE "$X" ev_rando >/dev/null
verifier "X retiré : il ne voit plus rien" "" "$(VOIT "$X" ev_rando)"
verifier "un UPDATE qui GARDE rsvp passe après la fin (pointage posé par B — la fenêtre reste l'affaire de trg_event_attendees_pointage, hors banc)" "ev_passee" \
  "$(AUTH "$B" "update public.event_attendees set checked_in_at = now() where event_id='ev_passee' and user_id='$B' returning event_id;")"
verifier "activité EN COURS : B (peut-être) pointe, puis passe « going » — le chemin de pointer_par_code" "ev_en_cours|going" \
  "$(AUTH "$B" "update public.event_attendees set checked_in_at = now() where event_id='ev_en_cours' and user_id='$B' returning event_id;")|$(CHANGE "$B" ev_en_cours going)"
verifier "sans session (postgres, administration) : la garde ne s'applique pas" "maybe" \
  "$(Q "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_passee', '$S', 'maybe') returning rsvp;")"
Q "delete from public.event_attendees where user_id = '$S';" >/dev/null

echo "── ③ COLONNES DE RETOUR : illisibles, mais toujours inscriptibles sur SA ligne ──"
contient "même un co-venant ne lit pas le feedback d'autrui (42501 colonne)" "permission denied" "$(AUTH "$A" "select feedback from public.event_attendees where event_id='ev_passee';")"
contient "…ni la note" "permission denied" "$(AUTH "$A" "select rating from public.event_attendees where event_id='ev_passee';")"
contient "…ni la sienne par lecture directe (c'est l'agrégat ou le miroir local qui servent)" "permission denied" "$(AUTH "$A" "select rating from public.event_attendees where event_id='ev_passee' and user_id='$A';")"
verifier "les cinq colonnes du client se lisent (event_id,user_id,rsvp,created_at,checked_in_at)" "3|going|true" "$(AUTH "$A" "select substr(user_id,1,1) || '|' || rsvp || '|' || (checked_in_at is not null) from public.event_attendees where event_id='ev_rando' and user_id='$A';")"
verifier "T note son activité passée : UPDATE de sa ligne avec RETURNING event_id (le geste du client)" "ev_passee" "$(AUTH "$T" "update public.event_attendees set rating = 4, feedback = 'Chouette', rated_at = now() where event_id='ev_passee' and user_id='$T' returning event_id;")"
contient "le même UPDATE avec RETURNING * est refusé : c'est pourquoi le client ne demande plus select()" "permission denied" "$(AUTH "$T" "update public.event_attendees set rating = 4 where event_id='ev_passee' and user_id='$T' returning *;")"
verifier "T s'inscrit à la rando (INSERT) : accepté" "1" "$(INSCRIT "$T" ev_rando going)"
verifier "…et devient venant : il voit maintenant A, B, D et lui-même" "3,4,6,7" "$(VOIT "$T" ev_rando)"
verifier "T se désinscrit (DELETE de sa ligne) : accepté" "1" "$(RETIRE "$T" ev_rando)"
verifier "…et ne voit plus que A, son ami mutuel" "3" "$(VOIT "$T" ev_rando)"
Q "insert into public.blocks (blocker_id, blocked_id) values ('$T', '$A');" >/dev/null
verifier "T bloque A : même mutuels, T ne voit plus A" "" "$(VOIT "$T" ev_rando)"
verifier "…et A, co-venant de T sur l'activité passée, ne voit plus T" "3,4" "$(VOIT "$A" ev_passee)"
Q "delete from public.blocks;" >/dev/null

echo "── ④ LE NOMBRE RESTE PUBLIC PARMI LES CONNECTÉS ───────────────────"
verifier "participants_compte pour un tiers sans lien : 1 venant, 1 peut-être, 1 en attente, 1 pointé (le refus ne compte pas)" "ev_rando|1|1|1|1" \
  "$(AUTH "$X" "select event_id || '|' || going || '|' || maybe || '|' || waitlist || '|' || checked_in from public.participants_compte(array['ev_rando','ev_inconnue']);")"
verifier "plusieurs activités d'un coup, l'activité sans inscrit n'apparaît pas (le client lit 0)" "ev_passee:3|ev_rando:1" \
  "$(AUTH "$X" "select string_agg(event_id || ':' || going, '|' order by event_id) from public.participants_compte(array['ev_rando','ev_passee','ev_sans']);")"
verifier "notes_evenement : moyenne et nombre, sans dire qui (A 5, B 3, T 4 → 4.00 sur 3)" "4.00|3" "$(NOTES "$X" ev_passee)"
verifier "notes_evenement sur une activité sans note : pas de moyenne, 0 note" "null|0" "$(NOTES "$X" ev_rando)"
verifier "SEUIL : 2 notes (A 5, B 3) — un participant (A) lit le nombre, pas la moyenne (il en déduirait la note de B)" "null|2" "$(NOTES "$A" ev_notes)"
verifier "…un tiers non plus" "null|2" "$(NOTES "$X" ev_notes)"
verifier "…l'organisation, si (elle lit déjà chaque retour)" "4.00|2" "$(NOTES "$ORGA" ev_notes)"
verifier "X s'écrit « declined » sur l'activité passée et y pose une note de 1 : accepté…" "1|ev_notes" \
  "$(INSCRIT "$X" ev_notes declined)|$(AUTH "$X" "update public.event_attendees set rating = 1, rated_at = now() where event_id='ev_notes' and user_id='$X' returning event_id;")"
verifier "…mais une note hors participant ne compte pas : le seuil n'est pas franchi" "null|2" "$(NOTES "$A" ev_notes)"
verifier "T, venu, note 4 : 3 notes de participants — la moyenne se lit (5, 3, 4 → 4.00)" "ev_notes|4.00|3" \
  "$(AUTH "$T" "update public.event_attendees set rating = 4, rated_at = now() where event_id='ev_notes' and user_id='$T' returning event_id;")|$(NOTES "$A" ev_notes)"
contient "anon ne peut appeler ni participants_compte…" "permission denied" "$(ANON "select * from public.participants_compte(array['ev_rando']);")"
contient "…ni notes_evenement" "permission denied" "$(ANON "select public.notes_evenement('ev_passee');")"

echo "── ⑤ LES RETOURS ÉCRITS VONT À L'ORGANISATION ────────────────────"
verifier "l'auteur lit les retours de son activité passée (3 lignes, texte compris)" "3|Super soirée, à refaire" \
  "$(AUTH "$ORGA" "select count(*) || '|' || max(feedback) filter (where user_id='$A') from public.retours_evenement('ev_passee');")"
verifier "un participant (A) n'en lit aucun" "0" "$(AUTH "$A" "select count(*) from public.retours_evenement('ev_passee');")"
verifier "un tiers n'en lit aucun" "0" "$(AUTH "$X" "select count(*) from public.retours_evenement('ev_passee');")"
contient "anon ne peut pas l'appeler" "permission denied" "$(ANON "select * from public.retours_evenement('ev_passee');")"

echo "── ⑥ LES HELPERS NE PARLENT QUE DE L'APPELANT ────────────────────"
verifier "organise_activite : auteur oui, co-organisateur oui, tiers non" "t|t|f" \
  "$(AUTH "$ORGA" "select public.organise_activite('ev_rando');")|$(AUTH "$COORG" "select public.organise_activite('ev_rando');")|$(AUTH "$X" "select public.organise_activite('ev_rando');")"
verifier "vient_a_activite : A (going) oui ; B (peut-être), D (attente), C (refus), X non" "t|f|f|f|f" \
  "$(AUTH "$A" "select public.vient_a_activite('ev_rando');")|$(AUTH "$B" "select public.vient_a_activite('ev_rando');")|$(AUTH "$D" "select public.vient_a_activite('ev_rando');")|$(AUTH "$C" "select public.vient_a_activite('ev_rando');")|$(AUTH "$X" "select public.vient_a_activite('ev_rando');")"
verifier "l'ancien helper inscrit_a_activite (ouvert à maybe / waitlist) n'existe plus" "t" "$(Q "select to_regprocedure('public.inscrit_a_activite(text)') is null;")"
verifier "sans session (postgres) : les deux helpers rendent faux, jamais une erreur" "false|false" "$(Q "select public.organise_activite('ev_rando') || '|' || public.vient_a_activite('ev_rando');")"
verifier "la garde d'état n'est exécutable par personne (fonction de trigger)" "false|false" \
  "$(Q "select has_function_privilege('authenticated', 'public.event_attendees_etat_garde()', 'execute') || '|' || has_function_privilege('anon', 'public.event_attendees_etat_garde()', 'execute');")"
verifier "anon : plus AUCUN droit de table (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ; MAINTAIN en PG 17+) ni de colonne" "f,f,f,f,f,f,f,f|f" \
  "$(Q "select string_agg(has_table_privilege('anon', 'public.event_attendees', p)::text, ',' order by o) || ',' || (case when current_setting('server_version_num')::int >= 170000 then has_table_privilege('anon', 'public.event_attendees', 'MAINTAIN')::text else 'f' end) || '|' || has_any_column_privilege('anon', 'public.event_attendees', 'SELECT,INSERT,UPDATE,REFERENCES')::text
        from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) with ordinality u(p, o);" | sed 's/true/t/g; s/false/f/g')"

echo "── ⑦ LE VERDICT NE PEUT PAS MENTIR SUR LES DROITS D'ANON ──────────"
# Un droit accordé à `anon` par un AUTRE concédant survit au `revoke all` de la
# migration (PostgreSQL ne retire que les droits de son propre concédant) : la
# ligne de verdict doit alors dire ECHEC, privilège par privilège.
Q "create role tiers_concedant; grant all on public.event_attendees to tiers_concedant with grant option;" >/dev/null
for priv in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
  Q "set role tiers_concedant; grant $priv on public.event_attendees to anon;" >/dev/null
  s="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ migration en échec ($priv)"; echo "$s" | tail -3; exit 1; }
  verifier "anon garde $priv (autre concédant) : la migration passe, le verdict dit 4 OK / 1 ECHEC — la ligne d'anon" \
    "t|4/1|1" "$(Q "select has_table_privilege('anon', 'public.event_attendees', '$priv');" | sed 's/true/t/')|$(BILAN "$s")|$(printf '%s\n' "$s" | grep -E '\|\s*ECHEC\s*$' | grep -c "anon sans AUCUN droit" || true)"
  Q "set role tiers_concedant; revoke $priv on public.event_attendees from anon;" >/dev/null
done
Q "set role tiers_concedant; grant select (event_id) on public.event_attendees to anon;" >/dev/null
s="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ migration en échec (colonne)"; exit 1; }
verifier "anon garde un SELECT de COLONNE (autre concédant) : le verdict le voit aussi" "4/1" "$(BILAN "$s")"
Q "set role tiers_concedant; revoke select (event_id) on public.event_attendees from anon;" >/dev/null
s="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ migration en échec (retour)"; exit 1; }
verifier "droits rendus : 5 OK / 0 ECHEC" "5/0" "$(BILAN "$s")"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
