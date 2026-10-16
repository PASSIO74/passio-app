#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_telemetrie_equitable_2026-10-16.sql
#
# Ce qu'il protège :
#   ① l'ancien plafond par ligne est parti, le compteur par instruction est là ;
#   ② `received_at` reste posé par le SERVEUR (ASTRA-02) : un client qui
#     antidate sa ligne n'en sort pas la fenêtre ;
#   ③ un lot est compté UNE fois, à sa taille ;
#   ④ trois réservoirs étanches : un flot anonyme remplit les 600 lignes/min
#     des anonymes, une armée de comptes neufs les 600 des neufs — et les
#     comptes anciens gardent leurs 1 800 ; 300 lignes/min par compte ;
#   ⑤ un lot refusé n'écrit rien, ni ses lignes ni son compteur ;
#   ⑥ un compte non confirmé ou anonyme n'est pas « ancien » ;
#   ⑦ service_role n'est pas limité ;
#   ⑧ ni anon ni authenticated ne lisent ou n'écrivent les compteurs ;
#   ⑨ la migration est rejouable ;
#   ⑩ les mutants dangereux font LEVER le verdict : heure du client rendue
#     possible, ancien plafond laissé en place.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_telemetrie_equitable_2026-10-16.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 6820 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && break; sleep 0.5; done

DB=telemetrie
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# Une instruction jouée SOUS un rôle et une identité (comme PostgREST), dans sa transaction.
SOUS() { # $1 rôle, $2 uid ou "", $3 sql
  psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c \
    "begin; set local role $1; set local request.jwt.claim.role = '$1'; set local request.jwt.claim.sub = '$2'; $3; commit;" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

# ── Le décor de la production : rôles, droits par défaut, auth, table, anciens déclencheurs ──
Q "
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, created_at timestamptz not null default now(), email_confirmed_at timestamptz, is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
create function auth.role() returns text language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.role', true), '') \$\$;
create table public.telemetry_events (
  id uuid primary key default gen_random_uuid(), received_at timestamptz not null default now(), env text not null default 'production',
  type text not null default 'action', user_id text, device_id text, auth_uid uuid, meta jsonb not null default '{}'::jsonb
);
alter table public.telemetry_events enable row level security;
create policy telemetry_insert_own on public.telemetry_events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid()::text);
-- L'état d'avant (ouverture publique + ASTRA-02/06), tel qu'en production.
create or replace function public.limiter_debit_global() returns trigger language plpgsql security definer set search_path = public, pg_temp as \$\$
declare col_temps text := TG_ARGV[0]; max_par_min int := TG_ARGV[1]::int; cnt int;
begin
  new := json_populate_record(new, json_build_object(col_temps, now()));
  execute format('select count(*) from %I.%I where %I > now() - interval ''1 minute''', TG_TABLE_SCHEMA, TG_TABLE_NAME, col_temps) into cnt;
  if cnt >= max_par_min then raise exception 'rate limit' using errcode = 'P0001'; end if;
  return new;
end \$\$;
create trigger trg_debit_global before insert on public.telemetry_events for each row execute function public.limiter_debit_global('received_at', '3000');
create or replace function public.telemetry_pose_identite() returns trigger language plpgsql security definer set search_path = public, pg_temp as \$\$
begin new.auth_uid := auth.uid(); return new; end \$\$;
create trigger trg_telemetry_identite before insert on public.telemetry_events for each row execute function public.telemetry_pose_identite();
" >/dev/null

ok=0; ko=0
verif() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 — attendu « $3 », obtenu « $2 »"; ko=$((ko+1)); fi; }
refuse() { if SOUS "$2" "$3" "$4" >/dev/null 2>&1; then verif "$1" "accepté" "refusé"; else verif "$1" "refusé" "refusé"; fi; }
passe()  { if SOUS "$2" "$3" "$4" >/dev/null 2>&1; then verif "$1" "accepté" "accepté"; else verif "$1" "refusé" "accepté"; fi; }
lignes() { echo "insert into public.telemetry_events(type) select 'action' from generate_series(1, $1)"; }
compteur() { Q "select coalesce(sum(n), 0) from public.telemetrie_debit where minute = date_trunc('minute', now()) and reservoir = '$1' and source = '$2'"; }

FICHIER "$MIGRATION" >/dev/null
verif "① le compteur par instruction est en place" "$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_lot' and not tgisinternal")" "1"
verif "① l'ancien plafond par ligne est parti" "$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_global'")" "0"

# Les comptes : anciens (30 j, confirmés), neufs (1 h), un ancien non confirmé, un ancien anonyme.
O="eeeeeeee-0000-4000-8000-0000000000"; N="bbbbbbbb-0000-4000-8000-0000000000"
NC=cccccccc-0000-4000-8000-000000000001; AN=cccccccc-0000-4000-8000-000000000002
Q "insert into auth.users(id, created_at, email_confirmed_at) select ('$O' || lpad(g::text, 2, '0'))::uuid, now() - interval '30 days', now() - interval '30 days' from generate_series(1, 7) g;
   insert into auth.users(id, created_at, email_confirmed_at) select ('$N' || lpad(g::text, 2, '0'))::uuid, now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 3) g;
   insert into auth.users(id, created_at, email_confirmed_at) values ('$NC', now() - interval '30 days', null);
   insert into auth.users(id, created_at, email_confirmed_at, is_anonymous) values ('$AN', now() - interval '30 days', now(), true)" >/dev/null

# Tous les comptes d'une minute doivent tomber dans la MÊME minute : on attend un début de minute.
while [ "$(date +%S | sed 's/^0//')" -gt 30 ]; do sleep 1; done

# ② l'heure est celle du serveur, pas celle du client
SOUS anon "" "insert into public.telemetry_events(type, received_at) values ('antidate', '2000-01-01')" >/dev/null
verif "② received_at antidaté par le client : remplacé par l'heure du serveur" "$(Q "select (received_at > now() - interval '1 minute')::text from public.telemetry_events where type = 'antidate'")" "true"

# ③ un lot est compté une fois, à sa taille
passe "③ un lot anonyme de 99 lignes passe" anon "" "$(lignes 99)"
verif "③ … et le compteur des anonymes dit 100 (99 + la ligne antidatée)" "$(compteur anonymes '*')" "100"

# ④ réservoirs étanches
passe "④ anonymes : jusqu'à 600 par minute" anon "" "$(lignes 500)"
refuse "④ anonymes : la 601ᵉ ligne est refusée" anon "" "$(lignes 1)"
passe "④ un compte neuf passe pendant que les anonymes sont pleins" authenticated "${N}01" "$(lignes 300)"
refuse "④ 300 par compte : la 301ᵉ ligne d'un compte est refusée" authenticated "${N}01" "$(lignes 1)"
passe "④ un deuxième compte neuf : 300" authenticated "${N}02" "$(lignes 300)"
refuse "④ neufs : le réservoir de 600 est plein pour un troisième compte neuf" authenticated "${N}03" "$(lignes 1)"
refuse "⑥ un compte ancien NON CONFIRMÉ est un « neuf »" authenticated "$NC" "$(lignes 1)"
refuse "⑥ un compte ancien ANONYME est un « neuf »" authenticated "$AN" "$(lignes 1)"
for g in 01 02 03 04 05 06; do
  passe "④ un compte ancien ($g) passe malgré anonymes et neufs pleins" authenticated "${O}$g" "$(lignes 300)"
done
refuse "④ anciens : le réservoir de 1 800 est plein pour un septième compte" authenticated "${O}07" "$(lignes 1)"

# ⑤ un lot refusé n'écrit rien
AVANT="$(Q "select count(*) from public.telemetry_events")"; CPT="$(compteur anonymes '*')"
refuse "⑤ un lot anonyme refusé…" anon "" "$(lignes 50)"
verif "⑤ … n'écrit aucune ligne" "$(Q "select count(*) from public.telemetry_events")" "$AVANT"
verif "⑤ … et ne gonfle pas le compteur" "$(compteur anonymes '*')" "$CPT"
verif "③ le total de la minute (jauge) suit les lots acceptés" "$(compteur tous '*')" "$(Q "select count(*) from public.telemetry_events where received_at >= date_trunc('minute', now())")"

# ⑦ service_role n'est pas limité
passe "⑦ service_role écrit même réservoirs pleins" service_role "" "$(lignes 50)"

# ⑧ les compteurs ne sont ni lisibles ni écrivables par un client
refuse "⑧ anon ne lit pas les compteurs" anon "" "select count(*) from public.telemetrie_debit"
refuse "⑧ authenticated n'écrit pas un compteur" authenticated "${O}01" "insert into public.telemetrie_debit values (now(), 'anciens', '*', 0)"
refuse "⑧ authenticated n'efface pas un compteur" authenticated "${O}01" "delete from public.telemetrie_debit"
refuse "⑧ anon n'appelle pas la fonction du déclencheur" anon "" "select public.telemetrie_debit_lot()"

# ⑨ rejouable
FICHIER "$MIGRATION" >/dev/null
verif "⑨ rejouable : un seul compteur par instruction" "$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_lot' and not tgisinternal")" "1"
verif "⑨ rejouable : les compteurs survivent" "$(Q "select (count(*) > 0)::text from public.telemetrie_debit")" "true"

# ⑩ mutants : le verdict doit LEVER, et rien n'est appliqué
MUTANT="$BASE/mutant.sql"
mutant() { # $1 libellé
  chmod a+r "$MUTANT"
  Q "drop trigger if exists trg_debit_lot on public.telemetry_events; drop table if exists public.telemetrie_debit;
     create or replace function public.telemetry_pose_identite() returns trigger language plpgsql security definer set search_path = public, pg_temp as \$\$ begin new.auth_uid := auth.uid(); return new; end \$\$;
     drop trigger if exists trg_debit_global on public.telemetry_events;
     create trigger trg_debit_global before insert on public.telemetry_events for each row execute function public.limiter_debit_global('received_at', '3000');" >/dev/null
  if FICHIER "$MUTANT" >/dev/null 2>&1; then verif "⑩ $1 : verdict" "appliqué" "levé"; else verif "⑩ $1 : verdict" "levé" "levé"; fi
  verif "⑩ $1 : l'état d'avant est intact" "$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_global'")/$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_lot'")" "1/0"
}
grep -v "new.received_at := now();" "$MIGRATION" > "$MUTANT"
mutant "heure du client possible"
grep -v "^drop trigger if exists trg_debit_global on public.telemetry_events;" "$MIGRATION" > "$MUTANT"
mutant "ancien plafond laissé en place"

echo "Banc telemetrie-equitable : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
