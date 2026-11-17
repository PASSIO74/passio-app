#!/usr/bin/env bash
# PostgreSQL natif jetable uniquement ; jamais DATABASE_URL ni connexion distante.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$RACINE/tests/sql/medias-proteges-runner.mjs"
if [ "${1:-}" = "--existing-local" ]; then
  shift
  # Le runner refuse un nom de base non jetable et force 127.0.0.1 ; tous PG* herites sont retires.
  exec node "$RUNNER" "$@"
fi
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
for outil in initdb pg_ctl createdb psql node; do
  command -v "$outil" >/dev/null || { echo "ECHEC medias natif : outil absent $outil"; exit 1; }
done
for variable in $(env | sed -n 's/^\(PG[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$variable"; done
PORT=$((6500+RANDOM%400))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
  PARENT="$(su pgbanc -c 'cd ~ && pwd -P')"
  BASE="$(su pgbanc -c 'mktemp -d -p ~ passio-medias.XXXXXXXX')"
  lancer() { su pgbanc -c "PATH='$PATH' $*"; }
else
  PARENT="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
  BASE="$(mktemp -d "$PARENT/passio-medias.XXXXXXXX")"
  lancer() { bash -c "PATH='$PATH' $*"; }
fi
BASE="$(cd "$BASE" && pwd -P)"
case "$BASE" in "$PARENT"/passio-medias.*) ;; *) echo 'ECHEC cible temporaire'; exit 1 ;; esac
nettoyer() {
  lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true
  # Re-verification avant suppression recursive du seul cluster cree par ce banc.
  case "$BASE" in "$PARENT"/passio-medias.*) rm -rf -- "$BASE" ;; esac
}
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8 --locale=C" >/dev/null
case "$(uname -s)" in MINGW*|MSYS*) SOCKET="" ;; *) SOCKET="-k $BASE" ;; esac
lancer "pg_ctl -D '$BASE/data' -o '-p $PORT $SOCKET -c listen_addresses=127.0.0.1 -c timezone=UTC -c fsync=off' -l '$BASE/pg.log' start" >/dev/null
DB=passio_medias_go_20261116_ci
createdb -h 127.0.0.1 -p "$PORT" -U postgres "$DB"
node "$RUNNER" --database "$DB" --port "$PORT" --psql "$(command -v psql)"
