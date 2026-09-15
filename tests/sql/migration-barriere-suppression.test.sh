#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_barriere_suppression_2026-09-15.sql (ASTRA-25)
#
# Il joue les cinq situations que la contre-revue nomme :
#   · une requête DÉJÀ EN VOL au moment de la purge ;
#   · un SECOND APPAREIL qui écrit après le comptage de sa table ;
#   · une REPRISE après interruption ;
#   · un ANCIEN JETON encore valide ;
#   · une TABLE SANS FK vers `auth.users` (`user_state`, le cas mesuré).
#
# Le socle porte `user_state`, `profiles` et `conv_reads` avec leurs policies
# d'écriture de production, plus une policy DELETE et une policy SELECT — pour
# vérifier que la barrière ne les touche PAS.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_barriere_suppression_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6650 + RANDOM % 120 ))
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

DB=astra25
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_v()   { if printf '%s' "$1" | grep -qi "error"; then echo REFUSE; else echo OK; fi; }
AUTH_V() { _v "$(AUTH "$1" "$2")"; }

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;

-- ⚠️ `user_state` N'A AUCUNE FK vers auth.users — c'est le cas mesuré par la
-- contre-revue : rien, côté base, ne l'emporte avec le compte.
create table public.user_state (user_id text primary key, blob jsonb, updated_at timestamptz default now());
create table public.profiles   (id text primary key, username text);
create table public.conv_reads (conv_id text, user_id text, lu_le timestamptz, primary key (conv_id, user_id));
alter table public.user_state enable row level security;
alter table public.profiles   enable row level security;
alter table public.conv_reads enable row level security;

create policy user_state_insert_own on public.user_state for insert to authenticated with check (user_id = (select auth.uid())::text);
-- ⚠️ UPDATE SANS `with_check` : PostgreSQL y utilise le USING. La migration doit
-- poser un WITH CHECK qui PRÉSERVE ce contrôle, sinon l'UPDATE deviendrait libre.
create policy user_state_update_own on public.user_state for update to authenticated using (user_id = (select auth.uid())::text);
create policy user_state_delete_own on public.user_state for delete to authenticated using (user_id = (select auth.uid())::text);
create policy user_state_select_own on public.user_state for select to authenticated using (user_id = (select auth.uid())::text);
-- ⚠️ SANS POLICY SELECT, UN `UPDATE … WHERE` NE VOIT AUCUNE LIGNE : il rend
-- « UPDATE 0 », sans erreur. Le banc croirait alors mesurer un refus de la
-- barrière alors qu'il mesure un socle incomplet. La production a ces policies.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy reads_select on public.conv_reads for select to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = (select auth.uid())::text);
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())::text) with check (id = (select auth.uid())::text);
create policy reads_insert_own on public.conv_reads for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy reads_update_own on public.conv_reads for update to authenticated using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);

insert into public.profiles values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B');
insert into public.user_state values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"v":1}');
SQL

ECRIRE_ETAT() { AUTH_V "$1" "insert into public.user_state (user_id, blob) values ('$1','{\"v\":2}') on conflict (user_id) do update set blob = '{\"v\":2}';"; }
RESTE()       { Q "select count(*)::int from public.user_state where user_id='$A';"; }

echo "── ① LE DÉFAUT : une écriture après le comptage survit à la purge ────"
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "la purge a effacé l'état de A" "0" "$(RESTE)"
verifier "…mais l'application encore ouverte de A réécrit : ACCEPTÉ" "OK" "$(ECRIRE_ETAT "$A")"
verifier "la ligne est revenue : « supprimer mon compte » répondrait ok avec elle" "1" "$(RESTE)"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -10; exit 1; }
verifier "verdict 9 OK / 0 ECHEC" "9/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ rejeu en échec"; exit 1; }
verifier "rejeu : toujours 9 OK (la clause n'est pas ajoutée deux fois)" "9" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"
verifier "la clause n'apparaît qu'UNE fois par policy après deux passages" "0" "$(Q "select count(*)::int from pg_policies where (length(with_check) - length(replace(with_check, 'suppression_de_mon_compte', ''))) / length('suppression_de_mon_compte') > 1;")"

echo "── ③ SANS BARRIÈRE POSÉE, RIEN NE CHANGE ─────────────────────────────"
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "A écrit normalement tant que son compte n'est pas marqué" "OK" "$(ECRIRE_ETAT "$A")"
verifier "B aussi, et il n'est concerné en rien" "OK" "$(AUTH_V "$B" "insert into public.conv_reads (conv_id, user_id, lu_le) values ('c1','$B', now());")"

echo "── ④ LA BARRIÈRE FERME LA FENÊTRE ────────────────────────────────────"
Q "insert into public.comptes_en_suppression (user_id, motif) values ('$A','demande de la personne');" >/dev/null
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "requête en vol / second appareil / ancien jeton de A : REFUSÉ" "REFUSE" "$(ECRIRE_ETAT "$A")"
verifier "la ligne ne revient PAS" "0" "$(RESTE)"
verifier "…et son profil non plus" "REFUSE" "$(AUTH_V "$A" "update public.profiles set username='encore moi' where id='$A';")"
verifier "…ni un accusé de lecture" "REFUSE" "$(AUTH_V "$A" "insert into public.conv_reads (conv_id, user_id, lu_le) values ('c2','$A', now());")"
verifier "B, lui, écrit toujours : la barrière ne répond que sur l'appelant" "OK" "$(AUTH_V "$B" "insert into public.conv_reads (conv_id, user_id, lu_le) values ('c3','$B', now());")"

echo "── ⑤ CE QUE LA BARRIÈRE NE BLOQUE PAS, ET IL LE FAUT ─────────────────"
Q "insert into public.user_state (user_id, blob) values ('$A','{\"v\":9}');" >/dev/null
verifier "la purge (sans session) écrit et efface : elle ne se refuse pas à elle-même" "OK" "$(_v "$(Q "delete from public.user_state where user_id='$A';")")"
Q "insert into public.user_state (user_id, blob) values ('$A','{\"v\":9}');" >/dev/null
verifier "A peut encore SUPPRIMER sa propre ligne (le retrait n'est jamais bloqué)" "OK" "$(AUTH_V "$A" "delete from public.user_state where user_id='$A';")"
verifier "A peut encore LIRE (aucune policy SELECT n'est touchée)" "OK" "$(AUTH_V "$A" "select count(*) from public.user_state;")"
# ⚠️ « 0 LIGNE » N'EST PAS UN REFUS, et un helper qui ne regarde que l'erreur
# confond les deux — c'est la faute que le dépôt connaît déjà sous la forme
# « un UPDATE qui touche 0 ligne = RLS manquante ». On mesure donc la VALEUR.
Q "delete from public.comptes_en_suppression;" >/dev/null
Q "insert into public.user_state values ('$B','{\"a_moi\":true}') on conflict (user_id) do update set blob='{\"a_moi\":true}';" >/dev/null
AUTH "$A" "update public.user_state set blob='{\"vol\":1}' where user_id='$B';" >/dev/null 2>&1 || true
verifier "l'UPDATE sans with_check garde son contrôle d'origine : la ligne de B est INTACTE" '{"a_moi": true}' "$(Q "select blob::text from public.user_state where user_id='$B';")"

echo "── ⑥ REPRISE APRÈS INTERRUPTION ──────────────────────────────────────"
Q "insert into public.comptes_en_suppression (user_id) values ('$A') on conflict do nothing;" >/dev/null
Q "insert into public.comptes_en_suppression (user_id) values ('$A') on conflict do nothing;" >/dev/null
verifier "marquer deux fois ne casse rien : la purge est relançable" "1" "$(Q "select count(*)::int from public.comptes_en_suppression where user_id='$A';")"
Q "delete from public.comptes_en_suppression where user_id='$A';" >/dev/null
verifier "la levée rend l'écriture : une purge abandonnée ne condamne pas le compte" "OK" "$(ECRIRE_ETAT "$A")"

echo "── ⑦ AUCUN ORACLE ────────────────────────────────────────────────────"
verifier "anon ne peut pas appeler le prédicat" "f" "$(Q "select has_function_privilege('anon','public.suppression_de_mon_compte()','EXECUTE');")"
verifier "le marqueur est illisible pour authenticated" "f" "$(Q "select has_table_privilege('authenticated','public.comptes_en_suppression','SELECT');")"
verifier "le prédicat ne prend AUCUN argument : impossible d'interroger un autre compte" "0" "$(Q "select pronargs::int from pg_proc where proname='suppression_de_mon_compte';")"

echo "── ⑧ MUTATION : le banc doit ROUGIR ──────────────────────────────────"
Q "alter policy user_state_insert_own on public.user_state with check (user_id = (select auth.uid())::text);" >/dev/null
Q "insert into public.comptes_en_suppression (user_id) values ('$A');" >/dev/null
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "mutation « clause retirée d'une policy » : A réécrit, la fenêtre se rouvre" "OK" "$(ECRIRE_ETAT "$A")"
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" 2>&1)" || true
verifier "…la migration la repose" "9" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*OK\s*$' || true)"
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "rétabli : A est de nouveau refusé" "REFUSE" "$(ECRIRE_ETAT "$A")"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
