#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_debit_et_identite_serveur_2026-09-14.sql
#
# Même méthode que les bancs de septembre : PostgreSQL jetable, socle = l'état
# laissé par l'ouverture publique (plafond global qui compte une date que le
# client peut fournir, télémétrie sans identité serveur), on MESURE D'ABORD
# les deux défauts, on applique, on rejoue, on vérifie les deux sens, puis on
# remet l'ancienne fonction et on exige que le banc ET le verdict rougissent.
# Les plafonds du socle sont PETITS (3/min) pour mesurer vite ; la migration ne
# touche pas aux plafonds, seulement à la fonction.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_debit_et_identite_serveur_2026-09-14.sql"
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

DB=debit
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
ANON_OK() { _ok_ou_erreur "$(ANON "$1")"; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : l'état laissé par l'ouverture publique (fonction TELLE QUELLE) ──
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.client_errors (id uuid primary key default gen_random_uuid(), message text, uid text,
  auth_uid uuid, created_at timestamptz not null default now());
create table public.telemetry_events (id uuid primary key default gen_random_uuid(), type text, user_id text,
  received_at timestamptz not null default now(), client_ts timestamptz);
alter table public.client_errors enable row level security;
alter table public.telemetry_events enable row level security;
create policy "Insert erreurs" on public.client_errors for insert to public with check (true);
create policy "Insert telemetrie" on public.telemetry_events for insert to public with check (true);
grant insert on public.client_errors, public.telemetry_events to anon, authenticated;
grant select on public.client_errors, public.telemetry_events to authenticated;

-- L'identité serveur de client_errors (depuis le 2026-09-10) : la référence.
create function public.client_errors_pose_identite() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin new.auth_uid := auth.uid(); return new; end $$;
create trigger trg_client_errors_identite before insert on public.client_errors for each row execute function public.client_errors_pose_identite();

-- Le plafond global de l'ouverture publique, TEL QUEL — plafonds réduits à 3/min pour le banc.
create or replace function public.limiter_debit_global()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  col_temps   text := TG_ARGV[0];
  max_par_min int  := TG_ARGV[1]::int;
  cnt         int;
begin
  execute format('select count(*) from %I.%I where %I > now() - interval ''1 minute''',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME, col_temps) into cnt;
  if cnt >= max_par_min then
    raise exception 'rate limit: plafond global de % insertions/minute atteint sur %', max_par_min, TG_TABLE_NAME
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_debit_global before insert on public.client_errors
  for each row execute function public.limiter_debit_global('created_at', '3');
create trigger trg_debit_global before insert on public.telemetry_events
  for each row execute function public.limiter_debit_global('received_at', '3');
SQL

INS_ANTIDATE="insert into public.telemetry_events (type, user_id, received_at) values ('api', null, now() - interval '2 hours');"
INS_NORMAL="insert into public.telemetry_events (type, user_id) values ('api', null);"

echo "── ① LES DÉFAUTS, MESURÉS AVANT ──────────────────────────────────────"
for i in 1 2 3 4 5; do ANON "$INS_ANTIDATE" >/dev/null 2>&1; done
verifier "avant : 5 lignes ANTIDATÉES passent le plafond de 3/min (aucune n'est dans la fenêtre)" "5" "$(Q "select count(*) from public.telemetry_events;")"
verifier "avant : la télémétrie n'a pas de colonne auth_uid" "0" "$(Q "select count(*) from information_schema.columns where table_name='telemetry_events' and column_name='auth_uid';")"
Q "truncate public.telemetry_events;" >/dev/null

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "le tableau de verdict rend 4 OK et 0 ECHEC" "4/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 4 OK" "4" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ ASTRA-02 : la date est celle du serveur, le plafond borne vraiment ──"
for i in 1 2 3; do ANON "$INS_ANTIDATE" >/dev/null 2>&1; done
verifier "3 insertions antidatées acceptées (sous le plafond)…" "3" "$(Q "select count(*) from public.telemetry_events;")"
verifier "…et toutes RE-DATÉES par le serveur (dans la dernière minute)" "3" "$(Q "select count(*) from public.telemetry_events where received_at > now() - interval '1 minute';")"
contient "la 4ᵉ, antidatée, est REFUSÉE : le plafond compte l'heure du serveur" "plafond global" "$(ANON "$INS_ANTIDATE")"
contient "…et une insertion normale aussi (même fenêtre)" "plafond global" "$(ANON "$INS_NORMAL")"
Q "truncate public.telemetry_events;" >/dev/null
for i in 1 2 3; do ANON "insert into public.client_errors (message, created_at) values ('x', now() - interval '3 hours');" >/dev/null 2>&1; done
contient "client_errors : même garde, 4ᵉ antidatée refusée" "plafond global" "$(ANON "insert into public.client_errors (message, created_at) values ('x', now() - interval '3 hours');")"
verifier "client_errors : les 3 acceptées sont re-datées" "3" "$(Q "select count(*) from public.client_errors where created_at > now() - interval '1 minute';")"
Q "truncate public.telemetry_events; truncate public.client_errors;" >/dev/null

echo "── ④ ASTRA-06 : l'identité est posée par le serveur ──────────────────"
verifier "compte A : auth_uid = A, quoi que le client envoie (ici rien)" "OK" "$(AUTH_OK "$A" "insert into public.telemetry_events (type, user_id) values ('api', 'ce-que-le-client-dit');")"
verifier "  …auth_uid lu = A" "$A" "$(Q "select auth_uid from public.telemetry_events limit 1;")"
verifier "  …et user_id du client est conservé (compatibilité), mais ne fait plus foi" "ce-que-le-client-dit" "$(Q "select user_id from public.telemetry_events limit 1;")"
Q "truncate public.telemetry_events;" >/dev/null
verifier "compte A qui FORGE auth_uid = B : le serveur l'écrase" "OK" "$(AUTH_OK "$A" "insert into public.telemetry_events (type, user_id, auth_uid) values ('api', 'x', '$B');")"
verifier "  …auth_uid lu = A, pas B" "$A" "$(Q "select auth_uid from public.telemetry_events limit 1;")"
Q "truncate public.telemetry_events;" >/dev/null
verifier "visiteur : auth_uid NULL" "OK" "$(ANON_OK "insert into public.telemetry_events (type, user_id) values ('api', '$A');")"
verifier "  …même s'il recopie l'uuid public de A dans user_id" "" "$(Q "select coalesce(auth_uid::text, '') from public.telemetry_events limit 1;")"
Q "truncate public.telemetry_events;" >/dev/null

echo "── ⑤ MUTATION : l'ancienne fonction remise → le banc ET le verdict rougissent ──"
Q "create or replace function public.limiter_debit_global()
returns trigger language plpgsql security definer set search_path = public, pg_temp as \$\$
declare col_temps text := TG_ARGV[0]; max_par_min int := TG_ARGV[1]::int; cnt int;
begin
  execute format('select count(*) from %I.%I where %I > now() - interval ''1 minute''', TG_TABLE_SCHEMA, TG_TABLE_NAME, col_temps) into cnt;
  if cnt >= max_par_min then raise exception 'rate limit: plafond global' using errcode = 'P0001'; end if;
  return new;
end \$\$;" >/dev/null
for i in 1 2 3 4 5; do ANON "$INS_ANTIDATE" >/dev/null 2>&1; done
m="$(Q "select count(*) from public.telemetry_events;")"
if [ "$m" = "5" ]; then echo "  ✅ mutation : avec l'ancienne fonction, 5 antidatées repassent — le contrôle est réel"; ok=$((ok+1)); else echo "  ❌ mutation : $m lignes au lieu de 5"; ko=$((ko+1)); fi
verdict_mut="$(Q "select pg_get_functiondef('public.limiter_debit_global()'::regprocedure) like '%json_populate_record(new, json_build_object(col_temps, now()))%';")"
verifier "verdict ① : ECHEC sur l'ancienne fonction" "f" "$verdict_mut"
Q "truncate public.telemetry_events;" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
for i in 1 2 3 4; do ANON "$INS_ANTIDATE" >/dev/null 2>&1; done
verifier "rejeu après mutation : 3 acceptées, la 4ᵉ refusée" "3" "$(Q "select count(*) from public.telemetry_events;")"

echo
echo "RÉSULTAT : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
