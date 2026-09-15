#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_messages_bloques_2026-09-15.sql (MSG-10, résidu Astra)
#
# PostgreSQL jetable, socle = la messagerie de production réduite à ce que la
# policy lit (conv_members, conv_messages, blocks, is_conv_member,
# is_blocked_with, les quatre policies du 11/09). Mesure AVANT (A qui a bloqué
# B lit encore B, et B lit A), applique, rejoue, puis : A ne lit plus B, B ne
# lit plus A, C lit tout, B écrit toujours (membre), débloquer rend tout, anon
# rien.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_messages_bloques_2026-09-15.sql"
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

DB=msg10
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa; B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb; C=cccccccc-cccc-4ccc-8ccc-cccccccccccc

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# Socle = la messagerie de production réduite à ce que la policy lit : membres,
# messages, blocages, et les deux aides SECURITY DEFINER telles qu'en prod.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
create table public.conv_members (conv_id text, user_id text, primary key (conv_id, user_id));
create table public.blocks (blocker_id text, blocked_id text, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create table public.conv_messages (id text primary key, conv_id text not null, from_id text not null, content text, created_at timestamptz default now());
alter table public.conv_members enable row level security; alter table public.blocks enable row level security; alter table public.conv_messages enable row level security;
create function public.is_conv_member(_conv text, _uid text) returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.conv_members m where m.conv_id = _conv and m.user_id = _uid) $fn$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
  else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other) or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end $fn$;
create function public.conv_1a1_bloquee(_conv text) returns boolean language sql stable security definer set search_path = '' as $fn$ select false $fn$;
-- Les quatre policies de production (11/09 + red team), telles quelles.
create policy conv_messages_select_member on public.conv_messages for select to authenticated using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy conv_messages_insert_member on public.conv_messages for insert to authenticated with check (from_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text) and not public.conv_1a1_bloquee(conv_id));
create policy "Update propre" on public.conv_messages for update to authenticated using (from_id = (select auth.uid())::text) with check (from_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text) and not public.conv_1a1_bloquee(conv_id));
create policy "Suppression propre" on public.conv_messages for delete using (from_id = (select auth.uid())::text);
-- Un groupe de trois : A, B, C ; A a bloqué B. Chacun a écrit ; un message système sans expéditeur humain.
insert into public.conv_members values ('grp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('grp', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), ('grp', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.conv_messages (id, conv_id, from_id, content) values
  ('m_a', 'grp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'de A'), ('m_b', 'grp', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'de B'), ('m_c', 'grp', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'de C'),
  ('m_sys', 'grp', 'system', 'C a rejoint');
insert into public.blocks (blocker_id, blocked_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SQL
VOIT() { AUTH "$1" "select string_agg(id, ',' order by id) from public.conv_messages where conv_id='grp';"; }

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : A (bloqueur) lit encore le message de B" "m_a,m_b,m_c,m_sys" "$(VOIT "$A")"
verifier "avant : B (bloqué) lit encore le message de A" "m_a,m_b,m_c,m_sys" "$(VOIT "$B")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "verdict 4 OK / 0 ECHEC" "4/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 4 OK" "4" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ CE QUI CHANGE ───────────────────────────────────────────────────"
verifier "A ne lit plus B ; ses messages, ceux de C et le système restent" "m_a,m_c,m_sys" "$(VOIT "$A")"
verifier "B ne lit plus A (symétrique, comme partout ailleurs)" "m_b,m_c,m_sys" "$(VOIT "$B")"
verifier "C, tiers, lit tout" "m_a,m_b,m_c,m_sys" "$(VOIT "$C")"
verifier "B reste membre : il écrit toujours dans le groupe" "OK" "$(_ok_ou_erreur "$(AUTH "$B" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_b2', 'grp', '$B', 'encore B');")")"
verifier "…et A ne le voit pas" "m_a,m_c,m_sys" "$(VOIT "$A")"
Q "delete from public.blocks;" >/dev/null
verifier "débloquer rend tout : rien n'a été supprimé" "m_a,m_b,m_b2,m_c,m_sys" "$(VOIT "$A")"
verifier "anon : aucune ligne (policy authenticated seule)" "" "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; select string_agg(id, ',') from public.conv_messages;" 2>&1 | tail -1)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
