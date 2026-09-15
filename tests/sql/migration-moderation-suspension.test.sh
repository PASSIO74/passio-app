#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_moderation_suspension_2026-09-15.sql (MOD-01, suspension)
#
# PostgreSQL jetable, socle = celui du banc du journal (14/09) PLUS la migration
# du journal. Mesure AVANT (une suspension ne se consigne pas : CHECK), applique,
# rejoue, puis : suspension et levée consignées, les trois actions d'avant
# intactes, une action inconnue toujours refusée, aucun droit client.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_moderation_suspension_2026-09-15.sql"
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
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }
A=33333333-3333-3333-3333-333333333333
JOURNAL="$RACINE/migrations/migration_moderation_journal_2026-09-14.sql"

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# Socle = celui du banc du journal (14/09), puis la migration du journal elle-même.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
create table public.reports (id text primary key, reporter_id text, target_type text, target_id text, reason text,
  created_at timestamptz default now(), status text default 'open', handled_at timestamptz, handled_note text,
  constraint reports_target_type_chk check (target_type is null or target_type in ('user','post','comment','event','passion','message')));
alter table public.reports enable row level security;
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid()::text);
grant insert on public.reports to authenticated;
SQL
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$JOURNAL" >/dev/null 2>&1 || { echo "❌ le socle (migration du journal) a échoué"; exit 1; }
Q "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_u', '$A', 'user', '44444444-4444-4444-4444-444444444444', 'harcèlement');" >/dev/null

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
contient "avant : une suspension ne se consigne pas" "moderation_actions_action_check" "$(_ok_ou_erreur "$(Q "insert into public.moderation_actions (report_id, action, target_type, target_id, note) values ('r_u', 'suspension', 'user', '4444', '7 j');")")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "verdict 3 OK / 0 ECHEC" "3/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 3 OK" "3" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ CE QUI CHANGE ───────────────────────────────────────────────────"
verifier "une suspension se consigne (service_role)" "1" "$(Q "insert into public.moderation_actions (report_id, action, target_type, target_id, note) values ('r_u', 'suspension', 'user', '4444', '7 j'); select count(*) from public.moderation_actions where action='suspension';" | tail -1)"
verifier "une levée aussi" "1" "$(Q "insert into public.moderation_actions (report_id, action, target_type, target_id) values ('r_u', 'levee', 'user', '4444'); select count(*) from public.moderation_actions where action='levee';" | tail -1)"
verifier "retrait / rejet / note : intacts" "3" "$(Q "insert into public.moderation_actions (report_id, action) values ('r_u','retrait'),('r_u','rejet'),('r_u','note'); select count(*) from public.moderation_actions where action in ('retrait','rejet','note');" | tail -1)"
contient "une action inconnue reste refusée" "moderation_actions_action_check" "$(_ok_ou_erreur "$(Q "insert into public.moderation_actions (report_id, action) values ('r_u', 'bannir');")")"
contient "un compte connecté n'écrit toujours pas le journal" "permission denied" "$(AUTH_OK "$A" "insert into public.moderation_actions (report_id, action) values ('r_u', 'suspension');")"
verifier "anon : aucun droit" "f" "$(Q "select has_table_privilege('anon', 'public.moderation_actions', 'SELECT');")"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
