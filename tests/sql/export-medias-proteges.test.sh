#!/usr/bin/env bash
# Exécuté automatiquement par bancs-sql-restants.sh ; aucun service hébergé.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "export-medias: PostgreSQL absent"; exit 1; }
command -v node >/dev/null || { echo "export-medias: Node absent"; exit 1; }
PORT=$(( 8900 + RANDOM % 100 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
if ! lancer "initdb -D '$BASE/data' -A trust -U postgres" >"$BASE/initdb.log" 2>&1; then
  echo "export-medias: echec initialisation PostgreSQL local"; exit 1
fi
# Le runner non privilegie ne doit pas creer son socket dans /var/run/postgresql.
# Comme le banc export-instantane, conserver ce socket dans sa cible privee.
if ! lancer "pg_ctl -D '$BASE/data' -o \"-h 127.0.0.1 -k '$BASE' -p $PORT\" -l '$BASE/pg.log' start" >"$BASE/demarrage.log" 2>&1; then
  echo "export-medias: echec demarrage PostgreSQL local"; exit 1
fi
pret=0
for _ in $(seq 1 30); do
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c 'select 1' >/dev/null 2>&1 && { pret=1; break; }
  sleep 0.1
done
[ "$pret" -eq 1 ] || { echo "export-medias: PostgreSQL non disponible"; exit 1; }
node "$RACINE/tests/sql/export-medias-proteges-runner.mjs" --psql "$(command -v psql)" --port "$PORT" --output "$BASE/export-medias-resultat.json"
