#!/usr/bin/env bash
# Même patron PostgreSQL jetable que les bancs SQL existants, aucun cloud.
# Le *.test.sh est découvert par scripts/bancs-sql-restants.sh.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PASSIO_REPRISE_URLS_PGBIN:-/usr/lib/postgresql/18/bin}"
if [ -z "${PASSIO_REPRISE_URLS_PGBIN:-}" ] && [ ! -x "$PGBIN/initdb" ] && [ -x /usr/lib/postgresql/17/bin/initdb ]; then PGBIN=/usr/lib/postgresql/17/bin; fi
for outil in initdb pg_ctl psql pg_isready; do [ -x "$PGBIN/$outil" ] || { echo "ECHEC : outil PostgreSQL local manquant : $outil"; exit 1; }; done
command -v node >/dev/null || { echo 'ECHEC : Node requis'; exit 1; }
PG_VERSION="$("$PGBIN/initdb" --version)"
[[ "$PG_VERSION" =~ PostgreSQL\)\ (17|18)\. ]] || { echo 'ECHEC : PostgreSQL17 ou18 requis'; exit 1; }
printf 'Banc reprise URLs : %s\n' "$PG_VERSION"
[[ "$(node -p 'process.versions.node')" == 22.* ]] || { echo 'ECHEC : Node22 requis'; exit 1; }
PORT=55472
set +e
"$PGBIN/pg_isready" -h 127.0.0.1 -p "$PORT" -t 1 >/dev/null 2>&1
disponibilite=$?
set -e
[ "$disponibilite" -eq 2 ] || { echo 'ECHEC : port reserve occupe ou etat inconnu'; exit 1; }
TMPBASE="$(realpath "${TMPDIR:-/tmp}")"
BASE="$(mktemp -d "$TMPBASE/passio-reprise-urls-ci.XXXXXX")"
BASE="$(realpath "$BASE")"
MARQUEUR="PASSIO_REPRISE_URLS_CI_$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
printf '%s\n' "$MARQUEUR" > "$BASE/PASSIO_REPRISE_URLS_CI"
chmod 600 "$BASE/PASSIO_REPRISE_URLS_CI"
ROOT=0; [ "$(id -u)" -ne 0 ] || ROOT=1
DEMARRAGE_TENTE=0
lancer() {
  if [ "$ROOT" -eq 1 ]; then su pgbanc -s /bin/bash -c "$(printf '%q ' "$@")"; else "$@"; fi
}
nettoyer() {
  code=$?; trap - EXIT; set +e
  # Aucun rm récursif sans chemin canonique, répertoire parent et marqueur exacts.
  if [ "$(dirname "$BASE")" != "$TMPBASE" ] || [[ "$(basename "$BASE")" != passio-reprise-urls-ci.* ]] \
    || [ "$(cat "$BASE/PASSIO_REPRISE_URLS_CI" 2>/dev/null)" != "$MARQUEUR" ]; then
    echo 'ECHEC : cible de nettoyage non attestee'; exit 1
  fi
  if [ "$DEMARRAGE_TENTE" -eq 1 ]; then
    lancer "$PGBIN/pg_ctl" -D "$BASE/data" stop -m fast -w -t 10 >/dev/null 2>&1 || { echo 'ECHEC : arret cluster non prouve, dossier conserve'; exit 1; }
  fi
  rm -rf -- "$BASE"
  [ ! -e "$BASE" ] || code=1
  exit "$code"
}
trap nettoyer EXIT
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex")+"\n")' > "$BASE/password"
chmod 600 "$BASE/password"
printf '127.0.0.1:%s:*:postgres:%s\n' "$PORT" "$(cat "$BASE/password")" > "$BASE/pgpass"
chmod 600 "$BASE/pgpass"
if [ "$ROOT" -eq 1 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
  chown -R pgbanc "$BASE"
fi
lancer "$PGBIN/initdb" -D "$BASE/data" -U postgres --auth=scram-sha-256 --pwfile="$BASE/password" >/dev/null
DEMARRAGE_TENTE=1
lancer "$PGBIN/pg_ctl" -D "$BASE/data" -o "-h 127.0.0.1 -p $PORT -k $BASE" -l "$BASE/pg.log" start -w -t 15 >/dev/null
cd "$RACINE"
node tests/sql/reprise-medias-portables-runner.mjs --psql "$PGBIN/psql" --password-file "$BASE/pgpass" \
  --data-directory "$BASE/data" --cluster-marker "$BASE/PASSIO_REPRISE_URLS_CI" --output "$BASE/preuve.json"
node -e 'const p=require(process.argv[1]); if(p.ok!==true||p.nettoyage_absence!==true||p.cluster_directory_checked!==true||![17,18].includes(Math.floor(p.postgres_version_num/10000))||p.checks.length!==52||p.checks.some(c=>c.ok!==true))process.exit(1)' "$BASE/preuve.json"
