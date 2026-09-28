#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_pilotage_veille_2026-09-28.sql
#
# Ce qu'il protège :
#   ① la migration s'applique et planifie la veille UNE fois ;
#   ② elle est REJOUABLE (toujours une seule planification) ;
#   ③ pilotage_mesures() rend la taille de la base et du stockage par seau ;
#   ④ ni anon ni authenticated ne peuvent l'exécuter — MALGRÉ les grants par
#      défaut que Supabase pose (reproduits ici : un PostgreSQL nu n'a pas ce
#      piège, et un banc sans lui serait vert par accident) ;
#   ⑤ la variante qui oublierait le revoke nominatif fait LEVER le verdict et
#      n'applique rien.
# pg_cron, pg_net et storage sont des extensions Supabase : leur API est
# simulée (schémas cron/net/storage), et la ligne `create extension pg_net`
# est retirée — le banc mesure la migration, pas l'extension.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_pilotage_veille_2026-09-28.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 6580 + RANDOM % 120 ))
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

DB=pilot
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

Q "
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions; create schema storage; create schema cron; create schema net;
create table storage.objects (bucket_id text, metadata jsonb);
insert into storage.objects values ('content','{\"size\":1000}'),('content','{\"size\":500}'),('attachments','{\"size\":7}');
create table cron.job (jobid serial primary key, jobname text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns int language sql as \$\$ insert into cron.job(jobname,schedule,command) values (n,s,c) returning jobid \$\$;
create function cron.unschedule(id int) returns boolean language sql as \$\$ delete from cron.job where jobid = id returning true \$\$;
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as \$\$ select 1::bigint \$\$;
alter default privileges in schema public grant execute on functions to anon, authenticated;
" >/dev/null

ok=0; ko=0
verif() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 — attendu « $3 », obtenu « $2 »"; ko=$((ko+1)); fi; }

SANS_EXT="$BASE/migration.sql"
grep -v "create extension if not exists pg_net" "$MIGRATION" > "$SANS_EXT"; chmod a+r "$SANS_EXT"

FICHIER "$SANS_EXT" >/dev/null
verif "① veille planifiée une fois" "$(Q "select count(*) from cron.job where jobname='pilotage_veille'")" "1"
verif "① toutes les 5 min" "$(Q "select schedule from cron.job where jobname='pilotage_veille'")" "*/5 * * * *"
verif "① appelle l'action veille" "$(Q "select (command like '%''action'', ''veille''%')::text from cron.job where jobname='pilotage_veille'")" "true"
FICHIER "$SANS_EXT" >/dev/null
verif "② rejouable : toujours une planification" "$(Q "select count(*) from cron.job where jobname='pilotage_veille'")" "1"
verif "③ stockage par seau" "$(Q "select (public.pilotage_mesures()->'stockage'->>'content')")" "1500"
verif "③ taille de la base" "$(Q "select ((public.pilotage_mesures()->>'base_octets')::bigint > 0)::text")" "true"
verif "④ anon ne peut pas exécuter" "$(Q "select has_function_privilege('anon','public.pilotage_mesures()','EXECUTE')::text")" "false"
verif "④ authenticated ne peut pas exécuter" "$(Q "select has_function_privilege('authenticated','public.pilotage_mesures()','EXECUTE')::text")" "false"
verif "④ service_role peut exécuter" "$(Q "select has_function_privilege('service_role','public.pilotage_mesures()','EXECUTE')::text")" "true"

# ⑤ Mutation : sans le revoke nominatif d'anon, le verdict doit LEVER.
Q "drop function public.pilotage_mesures(); delete from cron.job;" >/dev/null
MUTANT="$BASE/mutant.sql"
grep -v "from anon;" "$SANS_EXT" > "$MUTANT"; chmod a+r "$MUTANT"
if FICHIER "$MUTANT" >/dev/null 2>&1; then verif "⑤ mutant refusé" "appliqué" "levé"; else verif "⑤ mutant refusé" "levé" "levé"; fi
verif "⑤ rien d'appliqué" "$(Q "select count(*) from cron.job")" "0"

echo "Banc pilotage-veille : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
