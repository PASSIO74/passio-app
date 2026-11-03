#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_index_realtime_2026-11-03.sql (F-05 / F-06 / F-07)
#
# PostgreSQL jetable avec pg_trgm, socle = `passions` portant les DEUX index
# trigram (le doublon mesuré en production), `telemetry_events` sans index
# (env, received_at), et un `realtime.messages` factice portant les deux policies
# jumelles « reçoit / recoit » écrites en `auth.uid()` nu. On mesure l'avant, on
# applique, on rejoue, puis : le doublon est parti et la recherche trigram
# répond toujours par l'index survivant ; l'index partiel de télémétrie est là
# et PORTE la requête du pilotage (EXPLAIN) ; une seule policy realtime, en
# initplan, même prédicat — un compte reçoit SON topic, pas celui d'un autre.
# Enfin le RETOUR ARRIÈRE de l'en-tête, exécuté tel quel, rend l'état d'avant
# à l'identique : les DEUX policies jumelles (nom, rôle, commande, prédicat) et
# les index (revue du 2026-11-03 : la première version ne recréait que la
# jumelle sans accent) ; la migration se ré-applique ensuite.
#
#   bash tests/sql/migration-index-realtime.test.sh
#
# Prérequis : PostgreSQL 14+ avec contrib (pg_trgm). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_index_realtime_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6460 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=indexrt
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# Un compte connecté qui reçoit sur un topic : la policy realtime se lit comme une table.
RETOUR_ARRIERE() { sed -n 's/^--| //p' "$MIGRATION"; }
# L'empreinte de ce que le retour arrière doit rendre : les policies « user:<uid> » et les index touchés.
POLICIES_USER() { Q "select coalesce(string_agg(policyname || ' | ' || permissive || ' | ' || roles::text || ' | ' || cmd || ' | ' || coalesce(qual, '-') || ' | ' || coalesce(with_check, '-'), ' ;; ' order by policyname), '-')
                     from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'Utilisateur re%oit ses messages';"; }
INDEX_TOUCHES() { Q "select coalesce(string_agg(indexdef, ' ;; ' order by indexname), '-') from pg_indexes
                     where schemaname = 'public' and tablename in ('passions', 'telemetry_events');"; }
RECOIT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
           -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2'; select count(*) from realtime.messages;" 2>&1; }

A=33333333-3333-3333-3333-333333333333
B=44444444-4444-4444-4444-444444444444

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

if ! Q "create extension if not exists pg_trgm;" >/dev/null 2>&1; then
  echo "❌ pg_trgm indisponible sur ce PostgreSQL (paquet contrib) — banc non exploitable"; exit 1
fi

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- passions : le doublon mesuré en production (même colonne, même opclass) + l'index jamais lu.
create table public.passions (id text primary key, label text, normalized_label text, aliases text[], recherche text);
create index passions_normalized_trgm on public.passions using gin (normalized_label gin_trgm_ops);
create index passions_trgm_idx on public.passions using gin (normalized_label gin_trgm_ops);
create index passions_aliases_gin on public.passions using gin (aliases);
create index passions_recherche_trgm on public.passions using gin (recherche gin_trgm_ops);
insert into public.passions select 'p' || g, 'Passion ' || g, 'passion ' || g, array['alias' || g], 'passion ' || g || ' alias' || g from generate_series(1, 3000) g;

-- telemetry_events : la table du pilotage, avec son seul index d'identité.
create table public.telemetry_events (id bigserial primary key, env text not null default 'production', user_id text,
  received_at timestamptz not null default now(), kind text);
create index idx_tel_user on public.telemetry_events (user_id);
insert into public.telemetry_events (env, user_id, received_at)
  select case when g % 10 = 0 then 'e2e' else 'production' end,
         case when g % 3 = 0 then null else 'u' || (g % 50) end,
         now() - (g || ' seconds')::interval
  from generate_series(1, 20000) g;
analyze public.passions; analyze public.telemetry_events;

-- realtime.messages factice : la table de Supabase et sa fonction topic(), telles
-- que les policies les voient (le topic de la souscription vient d'un réglage).
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text not null, payload jsonb);
create function realtime.topic() returns text language sql stable as $f$ select current_setting('realtime.topic', true) $f$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select on realtime.messages to anon, authenticated;
-- Les policies de production (canal ①, 2026-11-03) : les deux jumelles en auth.uid() nu, plus les trois autres.
create policy "Utilisateur reçoit ses messages" on realtime.messages for select to authenticated
  using (realtime.topic() = ('user:' || (auth.uid())::text));
create policy "Utilisateur recoit ses messages" on realtime.messages for select to authenticated
  using (realtime.topic() = ('user:' || (auth.uid())::text));
create policy passio_rt_recevoir_visiteur on realtime.messages for select to anon using (realtime.topic() = 'realtime:db');
create policy passio_rt_recevoir on realtime.messages for select to authenticated using (realtime.topic() = 'realtime:db' or realtime.topic() like 'call:%');
create policy passio_rt_emettre on realtime.messages for insert to authenticated with check (realtime.topic() like 'call:%');
insert into realtime.messages (topic, payload) values ('user:33333333-3333-3333-3333-333333333333', '{}'), ('user:44444444-4444-4444-4444-444444444444', '{}'), ('realtime:db', '{}');
SQL

echo "── ⓪ AVANT : l'état mesuré en production ────────────────────────────"
verifier "passions : trois index trigram/aliases, dont le doublon strict" "passions_aliases_gin,passions_normalized_trgm,passions_recherche_trgm,passions_trgm_idx" \
  "$(Q "select string_agg(indexname, ',' order by indexname) from pg_indexes where tablename='passions' and indexname <> 'passions_pkey';")"
verifier "realtime.messages : deux policies jumelles « reçoit / recoit » en auth.uid() nu" "2|2" \
  "$(Q "select count(*) || '|' || count(*) filter (where qual not like '%( SELECT auth.uid()%') from pg_policies where schemaname='realtime' and tablename='messages' and policyname like 'Utilisateur re%oit ses messages';")"
# La policy n'est pas un filtre de lignes : elle OUVRE ou FERME la souscription au topic (tout ou rien).
verifier "A, abonné à son topic, reçoit (3 lignes) ; abonné au topic de B, rien (contrat d'avant, à conserver)" "3|0" "$(RECOIT "$A" "user:$A")|$(RECOIT "$A" "user:$B")"
verifier "telemetry_events : la requête du pilotage ne dispose d'aucun index (env, received_at)" "0" \
  "$(Q "select count(*) from pg_indexes where tablename='telemetry_events' and indexdef like '%(env, received_at DESC)%';")"
POLICIES_AVANT="$(POLICIES_USER)"; INDEX_AVANT="$(INDEX_TOUCHES)"

echo "── ① APPLICATION ───────────────────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 4 OK et 0 ECHEC" "4/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejouée : même verdict (idempotente)" "4/0" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie2" | grep -cE '\|\s*ECHEC\s*$' || true)"

echo "── ② F-05 : le doublon est parti, la recherche répond toujours par l'index ──"
verifier "index restants sur passions" "passions_normalized_trgm,passions_recherche_trgm" \
  "$(Q "select string_agg(indexname, ',' order by indexname) from pg_indexes where tablename='passions' and indexname <> 'passions_pkey';")"
Q "set enable_seqscan = off;" >/dev/null
contient "la recherche trigram sur normalized_label utilise passions_normalized_trgm" "passions_normalized_trgm" \
  "$(Q "set enable_seqscan = off; explain (costs off) select id from public.passions where normalized_label % 'passion 42';")"
verifier "…et rend bien la passion cherchée" "p42" "$(Q "select id from public.passions where normalized_label % 'passion 42' order by similarity(normalized_label, 'passion 42') desc limit 1;")"

echo "── ③ F-06 : l'index partiel porte la requête du pilotage ──────────"
verifier "idx_tel_env_received_identifies : (env, received_at desc) include (user_id) where user_id is not null" "1" \
  "$(Q "select count(*) from pg_indexes where indexname='idx_tel_env_received_identifies' and indexdef like '%(env, received_at DESC) INCLUDE (user_id) WHERE (user_id IS NOT NULL)';")"
plan="$(Q "explain (costs off) select user_id, received_at from public.telemetry_events where env = 'production' and user_id is not null and received_at > now() - interval '30 days' order by received_at desc limit 1000;")"
contient "EXPLAIN de la requête kpi.js / retention.js : Index Scan sur idx_tel_env_received_identifies" "idx_tel_env_received_identifies" "$plan"
verifier "…sans nœud de tri (l'ordre vient de l'index)" "0" "$(printf '%s\n' "$plan" | grep -ci 'sort' || true)"
verifier "…et le résultat est le même qu'avant (comptage sur la fenêtre)" "$(Q "set enable_indexscan = off; set enable_bitmapscan = off; select count(*) from (select 1 from public.telemetry_events where env = 'production' and user_id is not null and received_at > now() - interval '30 days' order by received_at desc limit 1000) s;")" \
  "$(Q "select count(*) from (select 1 from public.telemetry_events where env = 'production' and user_id is not null and received_at > now() - interval '30 days' order by received_at desc limit 1000) s;")"

echo "── ④ F-07 : une seule policy, en initplan, même contrat ────────────"
verifier "realtime.messages : une seule « Utilisateur reçoit ses messages », en (select auth.uid())" "1|1" \
  "$(Q "select count(*) || '|' || count(*) filter (where qual like '%( SELECT auth.uid()%') from pg_policies where schemaname='realtime' and tablename='messages' and policyname like 'Utilisateur re%oit ses messages';")"
verifier "A reçoit toujours sur son topic, et toujours pas sur celui de B" "3|0" "$(RECOIT "$A" "user:$A")|$(RECOIT "$A" "user:$B")"
verifier "B reçoit sur le sien" "3" "$(RECOIT "$B" "user:$B")"
verifier "les trois autres policies sont intactes" "3" "$(Q "select count(*) from pg_policies where schemaname='realtime' and tablename='messages' and policyname in ('passio_rt_emettre','passio_rt_recevoir','passio_rt_recevoir_visiteur');")"
verifier "realtime:db reste reçu par un compte (passio_rt_recevoir)" "3" "$(RECOIT "$A" "realtime:db")"

echo "── ⑤ RETOUR ARRIÈRE de l'en-tête, exécuté tel quel : l'état d'avant ──"
verifier "l'en-tête porte un retour arrière exécutable (begin; … commit;)" "oui" \
  "$(RETOUR_ARRIERE | head -1 | grep -qx 'begin;' && RETOUR_ARRIERE | tail -1 | grep -qx 'commit;' && echo oui || echo non)"
sortie_ra="$(RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1)" || {
  echo "  ❌ le retour arrière ne s'exécute pas :"; echo "$sortie_ra" | tail -5; exit 1; }
verifier "les DEUX policies « reçoit / recoit » sont rendues à l'identique (nom, PERMISSIVE, rôle, commande, auth.uid() nu)" "$POLICIES_AVANT" "$(POLICIES_USER)"
verifier "…aucune des deux ne reste en initplan" "2|0" \
  "$(Q "select count(*) || '|' || count(*) filter (where qual like '%( SELECT auth.uid()%') from pg_policies where schemaname='realtime' and tablename='messages' and policyname like 'Utilisateur re%oit ses messages';")"
verifier "les index de passions et de telemetry_events sont rendus à l'identique (doublon et index d'alias revenus, index partiel parti)" "$INDEX_AVANT" "$(INDEX_TOUCHES)"
verifier "le contrat d'avant est intact : A reçoit son topic, pas celui de B" "3|0" "$(RECOIT "$A" "user:$A")|$(RECOIT "$A" "user:$B")"
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration ré-appliquée a échoué"; echo "$sortie3" | tail -5; exit 1; }
verifier "la migration se ré-applique après le retour arrière : 4 OK / 0 ECHEC" "4/0" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie3" | grep -cE '\|\s*ECHEC\s*$' || true)"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
