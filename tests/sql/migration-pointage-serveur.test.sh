#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_pointage_serveur_2026-09-14.sql (IRL-12)
#
# PostgreSQL jetable, socle = `events` / `event_attendees` avec policies de
# prod. On MESURE D'ABORD : `checked_in_at` s'écrit hors fenêtre et sans
# inscription. On applique, on rejoue, puis : un secret par activité (6 car.,
# alphabet sans 0/O/1/I), lisible par l'auteur et le co-organisateur SEULS ;
# `pointer_par_code` rend un verdict stable pour chaque cas ; le chemin GPS
# (UPDATE direct) est borné à la fenêtre ; une activité créée reçoit son secret.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_pointage_serveur_2026-09-14.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5930 + RANDOM % 120 ))
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

DB=irl12
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }

ORGA=11111111-1111-1111-1111-111111111111
COORG=22222222-2222-2222-2222-222222222222
A=33333333-3333-3333-3333-333333333333
B=44444444-4444-4444-4444-444444444444

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create schema extensions;
create extension pgcrypto schema extensions;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant usage on schema extensions to anon, authenticated;

create table public.events (id text primary key, author_id text not null, title text, status text default 'active',
  max_attendees integer, date_at timestamp, end_at timestamp, co_organizers jsonb default '[]');
create table public.event_attendees (event_id text not null, user_id text not null, created_at timestamptz default now(),
  rsvp text default 'going', checked_in_at timestamp, primary key (event_id, user_id));
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
create policy "lecture" on public.events for select using (true);
create policy "events_insert" on public.events for insert with check (author_id = auth.uid()::text);
create policy "lecture" on public.event_attendees for select using (true);
create policy "insert_own" on public.event_attendees for insert with check (user_id = (select auth.uid())::text);
create policy "update_own" on public.event_attendees for update using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
grant select, insert, update on public.event_attendees to authenticated;
grant select, insert on public.events to authenticated;

insert into public.events values
  ('ev_now', '11111111-1111-1111-1111-111111111111', 'En cours', 'active', null, now() - interval '30 minutes', null, '["22222222-2222-2222-2222-222222222222"]'),
  ('ev_past', '11111111-1111-1111-1111-111111111111', 'Passée', 'active', null, now() - interval '2 days', null, '[]'),
  ('ev_ann', '11111111-1111-1111-1111-111111111111', 'Annulée', 'cancelled', null, now() - interval '30 minutes', null, '[]');
insert into public.event_attendees (event_id, user_id, rsvp) values
  ('ev_now', '33333333-3333-3333-3333-333333333333', 'going'),
  ('ev_now', '44444444-4444-4444-4444-444444444444', 'waitlist'),
  ('ev_past', '33333333-3333-3333-3333-333333333333', 'going'),
  ('ev_ann', '33333333-3333-3333-3333-333333333333', 'going');
SQL

SECRET() { Q "select secret from public.event_checkin_secrets where event_id='$1';"; }
POINTER() { AUTH "$1" "select public.pointer_par_code('$2', '$3');"; }

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : checked_in_at s'écrit sur une activité PASSÉE" "OK" "$(AUTH_OK "$A" "update public.event_attendees set checked_in_at = now() where event_id='ev_past' and user_id='$A';")"
verifier "avant : aucun secret par activité (table absente)" "0" "$(Q "select count(*) from information_schema.tables where table_name='event_checkin_secrets';")"
Q "update public.event_attendees set checked_in_at = null;" >/dev/null

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 6 OK et 0 ECHEC" "6/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
s1="$(SECRET ev_now)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 6 OK" "6" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"
verifier "rejeu : le secret d'une activité NE CHANGE PAS" "$s1" "$(SECRET ev_now)"

echo "── ③ LE SECRET : tiré au hasard, lisible par les organisateurs seuls ──"
verifier "6 caractères de l'alphabet (ni 0, O, 1, I)" "1" "$(Q "select count(*) from public.event_checkin_secrets where event_id='ev_now' and secret ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$';")"
verifier "trois activités, trois secrets distincts" "3" "$(Q "select count(distinct secret) from public.event_checkin_secrets;")"
verifier "l'AUTEUR lit le secret" "$s1" "$(AUTH "$ORGA" "select secret from public.event_checkin_secrets where event_id='ev_now';")"
verifier "le CO-ORGANISATEUR lit le secret" "$s1" "$(AUTH "$COORG" "select secret from public.event_checkin_secrets where event_id='ev_now';")"
verifier "un PARTICIPANT ne lit rien (0 ligne, sans erreur)" "0" "$(AUTH "$A" "select count(*) from public.event_checkin_secrets;")"
contient "un participant ne peut pas écrire un secret (aucun GRANT INSERT : refus de privilège, avant même la RLS)" "permission denied"" "$(AUTH_OK "$A" "insert into public.event_checkin_secrets values ('ev_now', 'AAAAAA');")"
verifier "anon : aucun privilège sur la table" "f" "$(Q "select has_table_privilege('anon', 'public.event_checkin_secrets', 'SELECT');")"
verifier "une activité CRÉÉE reçoit son secret par trigger" "1" "$(AUTH "$ORGA" "insert into public.events (id, author_id, title, date_at) values ('ev_new', '$ORGA', 'Neuve', now() + interval '1 day'); select count(*) from public.event_checkin_secrets where event_id='ev_new';" | tail -1)"

echo "── ④ POINTER PAR CODE : un verdict par cas ───────────────────────────"
verifier "code faux → code_incorrect" "code_incorrect" "$(POINTER "$A" ev_now ZZZZZZ)"
verifier "code juste, minuscules et espaces tolérés → ok" "ok" "$(POINTER "$A" ev_now " $(echo "$s1" | tr 'A-Z' 'a-z') ")"
verifier "…checked_in_at est posé" "1" "$(Q "select count(*) from public.event_attendees where event_id='ev_now' and user_id='$A' and checked_in_at is not null;")"
verifier "…rsvp inchangé (going)" "going" "$(Q "select rsvp from public.event_attendees where event_id='ev_now' and user_id='$A';")"
verifier "deuxième fois → deja_pointe" "deja_pointe" "$(POINTER "$A" ev_now "$s1")"
verifier "en liste d'attente → liste_attente" "liste_attente" "$(POINTER "$B" ev_now "$s1")"
verifier "NON inscrit → non_inscrit (pas d'inscription forcée)" "non_inscrit" "$(POINTER "$COORG" ev_now "$s1")"
verifier "…et aucune ligne n'a été créée pour lui" "0" "$(Q "select count(*) from public.event_attendees where event_id='ev_now' and user_id='$COORG';")"
verifier "activité passée → hors_fenetre" "hors_fenetre" "$(POINTER "$A" ev_past "$(SECRET ev_past)")"
verifier "activité annulée → annulee" "annulee" "$(POINTER "$A" ev_ann "$(SECRET ev_ann)")"
Q "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_now', '$COORG', 'maybe');" >/dev/null
verifier "un « peut-être » présent pointe → ok" "ok" "$(POINTER "$COORG" ev_now "$s1")"
verifier "…et devient going (place disponible)" "going" "$(Q "select rsvp from public.event_attendees where event_id='ev_now' and user_id='$COORG';")"
verifier "anon n'exécute pas la RPC" "f" "$(Q "select has_function_privilege('anon', 'public.pointer_par_code(text,text)', 'EXECUTE');")"
verifier "la génération du secret n'est pas exposée aux clients" "f" "$(Q "select has_function_privilege('authenticated', 'public.checkin_secret_generer()', 'EXECUTE');")"

echo "── ⑤ CHEMIN GPS (UPDATE direct) : la fenêtre tient aussi ─────────────"
contient "checked_in_at sur une activité PASSÉE refusé" "pointage_hors_fenetre" "$(AUTH_OK "$A" "update public.event_attendees set checked_in_at = now() where event_id='ev_past' and user_id='$A';")"
contient "checked_in_at sur une activité ANNULÉE refusé" "pointage_annulee" "$(AUTH_OK "$A" "update public.event_attendees set checked_in_at = now() where event_id='ev_ann' and user_id='$A';")"
Q "update public.event_attendees set checked_in_at = null where event_id='ev_now' and user_id='$A';" >/dev/null
verifier "checked_in_at dans la fenêtre accepté" "OK" "$(AUTH_OK "$A" "update public.event_attendees set checked_in_at = now() where event_id='ev_now' and user_id='$A';")"
verifier "sans session (administration) : hors fenêtre accepté" "OK" "$(_ok_ou_erreur "$(Q "update public.event_attendees set checked_in_at = now() where event_id='ev_past' and user_id='$A';")")"

echo
echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
