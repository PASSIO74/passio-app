#!/usr/bin/env bash
# Banc d'isolation sous rôle — PostgreSQL JETABLE, policies RÉELLES de prod (2026-09-08). Ne touche aucune base réelle.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"; PATH="$PGBIN:$PATH"
PORT=$(( 5500 + RANDOM % 150 ))
if [ "$(id -u)" -eq 0 ]; then id pgbanc >/dev/null 2>&1 || useradd -m pgbanc; BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"; chmod -R a+rX "$S"; else BASE="$(mktemp -d)"; SU="bash -c"; fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
ok=0; for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { ok=1; break; }; sleep 0.5; done
[ $ok = 1 ] || { echo "❌ serveur non démarré"; tail -5 "$BASE/pg.log"; exit 1; }
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d banc -tA -q -v ON_ERROR_STOP=1 "$@"; }
psql -h "$BASE" -p "$PORT" -U postgres -d postgres -q -c "create database banc" 
Q -f "$S/schema.sql" >/dev/null || { echo "❌ schéma"; exit 1; }
echo "policies créées : $(Q -c "select count(*) from pg_policies where schemaname in ('public','storage')")"
Q -f "$S/seed.sql" >/dev/null || { echo "❌ seed"; exit 1; }
echo "== MATRICE =="
Q -f "$S/mesures.sql" 2>&1 | grep -v '^$' > "$S/matrice.txt"; wc -l < "$S/matrice.txt"
echo "== SONDES =="
Q -f "$S/sondes.sql" 2>&1 | grep -v '^$' | tee "$S/sondes.txt"
echo "== MUTATIONS (le banc doit changer de verdict quand on retire la garde) =="
Q -f "$S/mutations.sql" 2>&1 | grep -v '^$' | tee "$S/mutations.txt"
