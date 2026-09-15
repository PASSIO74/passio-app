#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_moderation_journal_2026-09-14.sql (chantier 5)
#
# PostgreSQL jetable, socle = `reports` avec sa contrainte de type et sa
# policy INSERT de prod. Mesure AVANT (une story ne se signale pas), applique,
# rejoue, puis : `story` admis, le journal existe, RLS sans policy, aucun droit
# client (un compte connecté ne lit ni n'écrit le journal), et un enregistrement
# du journal survit à la suppression de son signalement.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_moderation_journal_2026-09-14.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5930 + RANDOM % 120 ))
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
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; exit 1; }

DB=mod5
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }
A=33333333-3333-3333-3333-333333333333

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
-- Les privilèges par défaut de Supabase : tout nouvel objet de public est accordé aux rôles clients.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
create table public.reports (id text primary key, reporter_id text, target_type text, target_id text, reason text,
  created_at timestamptz default now(), status text default 'open', handled_at timestamptz, handled_note text,
  constraint reports_target_type_chk check (target_type is null or target_type in ('user','post','comment','event','passion','message')));
alter table public.reports enable row level security;
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid()::text);
grant insert on public.reports to authenticated;
SQL

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
contient "avant : une story ne se signale pas (CHECK)" "reports_target_type_chk" "$(AUTH_OK "$A" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_s', '$A', 'story', 'st1', 'x');")"
verifier "avant : aucun journal" "0" "$(Q "select count(*) from information_schema.tables where table_name='moderation_actions';")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "verdict 4 OK / 0 ECHEC" "4/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 4 OK" "4" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ CE QUI CHANGE ───────────────────────────────────────────────────"
verifier "une story se signale" "OK" "$(AUTH_OK "$A" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_s', '$A', 'story', 'st1', 'x');")"
contient "un type inconnu reste refusé" "reports_target_type_chk" "$(AUTH_OK "$A" "insert into public.reports (id, reporter_id, target_type, target_id) values ('r_z', '$A', 'bidon', 'x');")"
verifier "le journal s'écrit sans session (service_role) avec un id ma_…" "1" "$(Q "insert into public.moderation_actions (report_id, action, target_type, target_id, note) values ('r_s', 'retrait', 'story', 'st1', 'ok'); select count(*) from public.moderation_actions where id like 'ma_%';" | tail -1)"
contient "un compte connecté ne LIT pas le journal" "permission denied" "$(AUTH_OK "$A" "select count(*) from public.moderation_actions;")"
contient "un compte connecté n'ÉCRIT pas le journal" "permission denied" "$(AUTH_OK "$A" "insert into public.moderation_actions (report_id, action) values ('r_s', 'note');")"
verifier "anon : aucun droit" "f" "$(Q "select has_table_privilege('anon', 'public.moderation_actions', 'SELECT');")"
contient "une action inconnue est refusée" "moderation_actions_action_check" "$(_ok_ou_erreur "$(Q "insert into public.moderation_actions (report_id, action) values ('r_s', 'bannir');")")"
Q "delete from public.reports where id='r_s';" >/dev/null
verifier "la trace survit à la suppression du signalement (report_id → null)" "1" "$(Q "select count(*) from public.moderation_actions where report_id is null and target_id='st1';")"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
