#!/usr/bin/env bash
# Une socket dans un dossier propre à ce test ; aucun TCP ni service hébergé.
set -euo pipefail
racine="$(cd "$(dirname "$0")/../.." && pwd)"
pgbin="$(pg_config --bindir)"
base="$(mktemp -d /tmp/passio-reprise-medias.XXXXXXXX)"
lancer=()
if [ "$(id -u)" = 0 ]; then
  chown postgres "$base"
  lancer=(runuser -u postgres --)
fi
nettoyer() {
  "${lancer[@]}" "$pgbin/pg_ctl" -D "$base/data" -m immediate stop >/dev/null 2>&1 || true
  case "$base" in /tmp/passio-reprise-medias.????????) rm -rf -- "$base" ;; esac
}
trap nettoyer EXIT
"${lancer[@]}" "$pgbin/initdb" -D "$base/data" -U postgres -A trust --locale=C >/dev/null
"${lancer[@]}" "$pgbin/pg_ctl" -D "$base/data" -o "-k '$base' -c listen_addresses=''" -l "$base/postgres.log" start >/dev/null
node "$racine/tests/sql/reprise-identites-medias-runner.mjs" "$pgbin/psql" "$base"
