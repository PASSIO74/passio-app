#!/usr/bin/env bash
# PostgreSQL jetable seulement ; aucune connexion à une base distante.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo 'PostgreSQL serveur absent : banc non exécuté'; exit 1; }
BASE="$(mktemp -d)"
PORT=$((6500 + RANDOM % 100))
nettoyer() { pg_ctl -D "$BASE/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
initdb -D "$BASE/data" -A trust -U postgres >/dev/null
pg_ctl -D "$BASE/data" -o "-k $BASE -p $PORT -c listen_addresses=''" -l "$BASE/pg.log" start >/dev/null
Q() { psql -X -h "$BASE" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }
Q -q <<'SQL'
create role anon;
create role authenticated;
create table public.conv_messages(id text primary key, content text);
grant insert, update, select on public.conv_messages to authenticated;
insert into public.conv_messages values ('historique', '{"type":"media","fileType":1}');
SQL
# Reproduire AVANT : mêmes rôles, le contenu toxique passe.
Q -q -c "set role authenticated; insert into public.conv_messages values ('avant', '{\"type\":\"audio\",\"filename\":1}');"
Q -q -f "$RACINE/migrations/migration_conv_messages_forme_2026-11-16.sql"
Q -q -f "$RACINE/migrations/migration_conv_messages_forme_2026-11-16.sql"
Q -q -f "$RACINE/tests/sql/fixtures/cas-conv-messages-forme.sql"
echo 'OK : reproduction avant, rejeu, INSERT/UPDATE après, rôles et historique'
