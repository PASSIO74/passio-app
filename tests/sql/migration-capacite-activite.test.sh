#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_capacite_activite_2026-09-14.sql (IRL-05 / IRL-11)
#
# PostgreSQL jetable, socle = `events` / `event_attendees` avec leurs policies
# et le trigger d'admission TELS QU'EN PRODUCTION. On MESURE D'ABORD : deux
# inscriptions au-delà de la capacité acceptées, `going` sur une activité
# annulée accepté, `rsvp = 'bidon'` accepté, prix -5 accepté. On applique, on
# rejoue, puis les deux sens : complet / annulée / passée refusés avec un
# message stable ; maybe, waitlist, declined et « rester going » passent ;
# DEUX SESSIONS CONCURRENTES ne dépassent pas la capacité ; sans session la
# règle ne s'applique pas ; les bornes tiennent.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_capacite_activite_2026-09-14.sql"
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

DB=irl05
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }

ORGA=11111111-1111-1111-1111-111111111111
A=22222222-2222-2222-2222-222222222222
B=33333333-3333-3333-3333-333333333333
C=44444444-4444-4444-4444-444444444444

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : la production telle quelle ──────────────────────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.events (id text primary key, author_id text not null, title text, status text default 'active',
  max_attendees integer, price double precision, date_at timestamp, end_at timestamp);
create table public.event_attendees (event_id text not null, user_id text not null, created_at timestamptz default now(),
  rsvp text default 'going', checked_in_at timestamp, rating smallint, feedback text, rated_at timestamptz,
  primary key (event_id, user_id), constraint event_attendees_rating_range check (rating is null or (rating >= 1 and rating <= 5)));
create function public.adult_access_allowed() returns boolean language sql stable security definer set search_path to '' as $$ select auth.uid() is not null $$;
-- Le trigger d'admission de prod, tel quel (il laisse tout passer ici : adult_access_allowed = vrai).
create function public.event_attendees_admission_gardee() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then return new; end if;
  if public.adult_access_allowed() then return new; end if;
  return new;
end $$;
create trigger trg_event_attendees_admission before insert or update on public.event_attendees for each row execute function public.event_attendees_admission_gardee();
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
create policy "lecture" on public.events for select using (true);
create policy "lecture" on public.event_attendees for select using (true);
create policy "event_attendees_insert_own_adult" on public.event_attendees for insert with check (user_id = (select auth.uid())::text and (adult_access_allowed() or rsvp = 'declined'));
create policy "event_attendees_update_own_adult" on public.event_attendees for update using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text and (adult_access_allowed() or rsvp = 'declined'));
create policy "Suppression propre" on public.event_attendees for delete using (user_id = auth.uid()::text);
create policy "events_insert" on public.events for insert with check (author_id = auth.uid()::text);
grant select, insert, update, delete on public.event_attendees to authenticated;
grant select, insert on public.events to authenticated;

insert into public.events values
  ('ev_cap', '11111111-1111-1111-1111-111111111111', 'Rando (2 places)', 'active', 2, 0, now() + interval '3 days', null),
  ('ev_ann', '11111111-1111-1111-1111-111111111111', 'Annulée', 'cancelled', null, 0, now() + interval '3 days', null),
  ('ev_pas', '11111111-1111-1111-1111-111111111111', 'Passée', 'active', null, 0, now() - interval '2 days', null),
  ('ev_lib', '11111111-1111-1111-1111-111111111111', 'Sans limite', 'active', null, 0, now() + interval '3 days', null);
SQL

INS() { AUTH_OK "$1" "insert into public.event_attendees (event_id, user_id, rsvp) values ('$2', '$1', '$3');"; }
UPD() { AUTH_OK "$1" "update public.event_attendees set rsvp = '$3' where event_id = '$2' and user_id = '$1';"; }
GOING() { Q "select count(*) from public.event_attendees where event_id='$1' and rsvp='going';"; }

echo "── ① LES DÉFAUTS, MESURÉS AVANT ──────────────────────────────────────"
INS "$ORGA" ev_cap going >/dev/null; INS "$A" ev_cap going >/dev/null; INS "$B" ev_cap going >/dev/null
verifier "avant : 3 « going » acceptés sur une activité à 2 places" "3" "$(GOING ev_cap)"
verifier "avant : « going » accepté sur une activité ANNULÉE" "OK" "$(INS "$A" ev_ann going)"
verifier "avant : rsvp = 'bidon' accepté" "OK" "$(INS "$A" ev_lib bidon)"
verifier "avant : prix -5 accepté" "OK" "$(AUTH_OK "$ORGA" "insert into public.events values ('ev_neg', '$ORGA', 'Prix négatif', 'active', -3, -5, now() + interval '1 day', null);")"
Q "delete from public.event_attendees; delete from public.events where id = 'ev_neg';" >/dev/null

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 6 OK et 0 ECHEC" "6/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 6 OK" "6" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ CE QUI EST REFUSÉ, AVEC UN MOTIF STABLE ─────────────────────────"
verifier "l'organisateur prend la 1re place" "OK" "$(INS "$ORGA" ev_cap going)"
verifier "A prend la 2e place" "OK" "$(INS "$A" ev_cap going)"
contient "B est REFUSÉ : activité complète" "activite_complete" "$(INS "$B" ev_cap going)"
verifier "…et la base compte toujours 2 « going »" "2" "$(GOING ev_cap)"
contient "« going » sur une activité ANNULÉE refusé" "activite_annulee" "$(INS "$A" ev_ann going)"
contient "« going » sur une activité PASSÉE refusé" "activite_passee" "$(INS "$A" ev_pas going)"
contient "rsvp = 'bidon' refusé (CHECK)" "event_attendees_rsvp_valeurs" "$(INS "$A" ev_lib bidon)"
contient "prix négatif refusé (CHECK)" "events_price_positif" "$(AUTH_OK "$ORGA" "insert into public.events values ('ev_neg', '$ORGA', 'Prix négatif', 'active', 2, -5, now() + interval '1 day', null);")"
contient "capacité 0 refusée (CHECK)" "events_max_attendees_min1" "$(AUTH_OK "$ORGA" "insert into public.events values ('ev_zero', '$ORGA', 'Zéro place', 'active', 0, 0, now() + interval '1 day', null);")"

echo "── ④ CE QUI PASSE TOUJOURS ───────────────────────────────────────────"
verifier "B entre en liste d'attente (complet n'interdit pas waitlist)" "OK" "$(INS "$B" ev_cap waitlist)"
verifier "C dit « peut-être » (pas compté)" "OK" "$(INS "$C" ev_cap maybe)"
verifier "A reste « going » en pointant (UPDATE sans changement de rsvp)" "OK" "$(AUTH_OK "$A" "update public.event_attendees set checked_in_at = now() where event_id='ev_cap' and user_id='$A';")"
verifier "A se retire (declined)" "OK" "$(UPD "$A" ev_cap declined)"
verifier "…et B est promu depuis la liste d'attente (une place s'est libérée)" "OK" "$(UPD "$B" ev_cap going)"
contient "…mais C ne peut plus passer « going » : complet à nouveau" "activite_complete" "$(UPD "$C" ev_cap going)"
verifier "sans session (administration), la règle ne s'applique pas" "0" "$(Q "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_ann', '$C', 'going'); select 0;" | tail -1)"
Q "delete from public.event_attendees where event_id='ev_ann';" >/dev/null

echo "── ⑤ DEUX INSCRIPTIONS CONCURRENTES SUR LA DERNIÈRE PLACE ─────────────"
Q "delete from public.event_attendees where event_id='ev_cap'; insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_cap', '$ORGA', 'going');" >/dev/null
# Session 1 prend le verrou et garde sa transaction ouverte 2 s ; session 2 arrive pendant ce temps.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$A'; insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_cap', '$A', 'going'); select pg_sleep(2); commit;" >/dev/null 2>&1 &
sleep 0.5
res2="$(INS "$B" ev_cap going)"
wait
contient "la seconde session attend la première et est REFUSÉE (complet)" "activite_complete" "$res2"
verifier "exactement 2 « going » — jamais 3" "2" "$(GOING ev_cap)"

echo
echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
