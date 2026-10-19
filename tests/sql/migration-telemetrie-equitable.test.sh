#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_telemetrie_equitable_2026-10-16.sql
#
# Ce qu'il protège :
#   ① l'ancien plafond par ligne est parti ; les trois déclencheurs du
#     limiteur sont posés ;
#   ② `received_at` reste posé par le SERVEUR (ASTRA-02) : un client qui
#     antidate sa ligne n'en sort pas la fenêtre ;
#   ③ un lot est compté UNE fois, à sa taille ; plus de 120 lignes par
#     instruction = refus PT413 ;
#   ④ réservoirs : les anciens ont 1 800 à eux seuls ; neufs et anonymes
#     partagent 2 400, 1 600 au plus chacun (l'un ne prive jamais l'autre de
#     800) ; 150 lignes/min par compte ;
#   ⑤ un réservoir déjà plein refuse AVANT d'écrire (trg_debit_avant), en
#     PT429 (HTTP 429) ; un lot qui le fait déborder est annulé en entier,
#     lignes et compteur ;
#   ⑥ un compte non confirmé ou anonyme n'est pas « ancien » ;
#   ⑦ service_role n'est pas limité ;
#   ⑧ ni anon ni authenticated ne lisent ou n'écrivent les compteurs, ni
#     n'appellent une fonction du limiteur ;
#   ⑨ la migration est rejouable ;
#   ⑩ la purge des compteurs est planifiée, et elle purge ;
#   ⑪ les mutants dangereux font LEVER le verdict, par SON message (pas par
#     une erreur de syntaxe) : heure du client (ligne retirée, ligne
#     commentée), déclencheur d'identité non reposé, ancien plafond laissé
#     en place, purge oubliée.
# pg_cron n'existe pas dans un PostgreSQL nu : un schéma `cron` minimal le
# remplace (job, schedule, unschedule).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_telemetrie_equitable_2026-10-16.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 6820 + RANDOM % 120 ))
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

DB=telemetrie
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# Une instruction jouée SOUS un rôle et une identité (comme PostgREST), dans sa transaction.
SOUS() { # $1 rôle, $2 uid ou "", $3 sql
  psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c \
    "begin; set local role $1; set local request.jwt.claim.role = '$1'; set local request.jwt.claim.sub = '$2'; $3; commit;" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

# ── Le décor de la production : rôles, droits par défaut, auth, table, anciens déclencheurs ──
Q "
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, created_at timestamptz not null default now(), email_confirmed_at timestamptz, is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
create function auth.role() returns text language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.role', true), '') \$\$;
create table public.telemetry_events (
  id uuid primary key default gen_random_uuid(), received_at timestamptz not null default now(), env text not null default 'production',
  type text not null default 'action', user_id text, device_id text, auth_uid uuid, meta jsonb not null default '{}'::jsonb
);
alter table public.telemetry_events enable row level security;
create policy telemetry_insert_own on public.telemetry_events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid()::text);
-- L'état d'avant (ouverture publique + ASTRA-02/06), tel qu'en production.
create or replace function public.limiter_debit_global() returns trigger language plpgsql security definer set search_path = public, pg_temp as \$\$
declare col_temps text := TG_ARGV[0]; max_par_min int := TG_ARGV[1]::int; cnt int;
begin
  new := json_populate_record(new, json_build_object(col_temps, now()));
  execute format('select count(*) from %I.%I where %I > now() - interval ''1 minute''', TG_TABLE_SCHEMA, TG_TABLE_NAME, col_temps) into cnt;
  if cnt >= max_par_min then raise exception 'rate limit' using errcode = 'P0001'; end if;
  return new;
end \$\$;
create trigger trg_debit_global before insert on public.telemetry_events for each row execute function public.limiter_debit_global('received_at', '3000');
create or replace function public.telemetry_pose_identite() returns trigger language plpgsql security definer set search_path = public, pg_temp as \$\$
begin new.auth_uid := auth.uid(); return new; end \$\$;
create trigger trg_telemetry_identite before insert on public.telemetry_events for each row execute function public.telemetry_pose_identite();
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(p_nom text, p_horaire text, p_commande text) returns bigint language sql as \$\$
  insert into cron.job(jobname, schedule, command) values (p_nom, p_horaire, p_commande)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid \$\$;
create function cron.unschedule(p_id bigint) returns boolean language sql as \$\$ delete from cron.job where jobid = p_id returning true \$\$;
" >/dev/null

ok=0; ko=0
verif() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 — attendu « $3 », obtenu « $2 »"; ko=$((ko+1)); fi; }
refuse() { if SOUS "$2" "$3" "$4" >/dev/null 2>&1; then verif "$1" "accepté" "refusé"; else verif "$1" "refusé" "refusé"; fi; }
passe()  { if SOUS "$2" "$3" "$4" >/dev/null 2>&1; then verif "$1" "accepté" "accepté"; else verif "$1" "refusé" "accepté"; fi; }
# L'erreur complète (SQLSTATE et CONTEXT) d'une instruction refusée.
ERREUR() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c \
  "begin; set local role $1; set local request.jwt.claim.role = '$1'; set local request.jwt.claim.sub = '$2'; $3; commit;" 2>&1 || true; }
# refus « $1 » : SQLSTATE $5 levé par la fonction $6
refus_par() { local e; e="$(ERREUR "$2" "$3" "$4")"
  if printf '%s' "$e" | grep -q "$5" && printf '%s' "$e" | grep -q "$6"; then verif "$1" "$5 par $6" "$5 par $6"
  else verif "$1" "$(printf '%s' "$e" | grep -oE 'PT[0-9]{3}|function [a-z_.]+\(\)' | sort -u | tr '\n' ' ')" "$5 par $6"; fi; }
lignes() { echo "insert into public.telemetry_events(type) select 'action' from generate_series(1, $1)"; }
# n lignes en lots de 100 au plus (le plafond d'une instruction est 120)
remplir() { # $1 rôle, $2 uid, $3 n
  local reste=$3 k
  while [ "$reste" -gt 0 ]; do k=$(( reste > 100 ? 100 : reste )); SOUS "$1" "$2" "$(lignes $k)" >/dev/null || return 1; reste=$((reste-k)); done; }
remplit() { if remplir "$2" "$3" "$4"; then verif "$1" "accepté" "accepté"; else verif "$1" "refusé" "accepté"; fi; }
compteur() { Q "select coalesce(sum(n), 0) from public.telemetrie_debit where minute = date_trunc('minute', now()) and reservoir = '$1' and source = '$2'"; }
# Pose l'état des compteurs de la minute (lot de contrôles indépendant du précédent).
poser() { Q "delete from public.telemetrie_debit where minute = date_trunc('minute', now()); $1" >/dev/null; }
cpt() { echo "insert into public.telemetrie_debit values (date_trunc('minute', now()), '$1', '$2', $3)"; }

FICHIER "$MIGRATION" >/dev/null
for t in trg_debit_lot trg_debit_avant trg_debit_taille; do
  verif "① $t est en place" "$(Q "select count(*) from pg_trigger where tgname = '$t' and not tgisinternal")" "1"
done
verif "① l'ancien plafond par ligne est parti" "$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_global'")" "0"

# Les comptes : 13 anciens (30 j, confirmés), 9 neufs (1 h), un ancien non confirmé, un ancien anonyme.
O="eeeeeeee-0000-4000-8000-0000000000"; N="bbbbbbbb-0000-4000-8000-0000000000"
NC=cccccccc-0000-4000-8000-000000000001; AN=cccccccc-0000-4000-8000-000000000002
Q "insert into auth.users(id, created_at, email_confirmed_at) select ('$O' || lpad(g::text, 2, '0'))::uuid, now() - interval '30 days', now() - interval '30 days' from generate_series(1, 13) g;
   insert into auth.users(id, created_at, email_confirmed_at) select ('$N' || lpad(g::text, 2, '0'))::uuid, now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 9) g;
   insert into auth.users(id, created_at, email_confirmed_at) values ('$NC', now() - interval '30 days', null);
   insert into auth.users(id, created_at, email_confirmed_at, is_anonymous) values ('$AN', now() - interval '30 days', now(), true)" >/dev/null

# Tous les contrôles d'une même série doivent tomber dans la MÊME minute : on attend un début de minute.
while [ "$(date +%S | sed 's/^0//')" -gt 15 ]; do sleep 1; done

# ② l'heure est celle du serveur, pas celle du client
SOUS anon "" "insert into public.telemetry_events(type, received_at) values ('antidate', '2000-01-01')" >/dev/null
verif "② received_at antidaté par le client : remplacé par l'heure du serveur" "$(Q "select (received_at > now() - interval '1 minute')::text from public.telemetry_events where type = 'antidate'")" "true"

# ③ un lot est compté une fois, à sa taille ; une instruction a 120 lignes au plus
passe "③ un lot anonyme de 99 lignes passe" anon "" "$(lignes 99)"
verif "③ … et le compteur des anonymes dit 100 (99 + la ligne antidatée)" "$(compteur anonymes '*')" "100"
refus_par "③ 121 lignes dans une instruction : refus" anon "" "$(lignes 121)" PT413 telemetrie_taille_lot
passe "③ 120 lignes passent" anon "" "$(lignes 120)"

# ④ anonymes : 1 600 au plus ; un réservoir plein refuse AVANT d'écrire, en 429
remplit "④ anonymes : jusqu'à 1 600 par minute" anon "" 1380
verif "④ … compteur des anonymes" "$(compteur anonymes '*')" "1600"
refus_par "⑤ anonymes pleins : la ligne suivante est refusée avant écriture, en 429" anon "" "$(lignes 1)" PT429 telemetrie_debit_avant
# neufs : 150 par compte, et 800 restent aux neufs sous un flot anonyme
remplit "④ un compte neuf passe pendant que les anonymes sont pleins (150)" authenticated "${N}01" 150
refus_par "④ 150 par compte : la 151ᵉ ligne d'un compte est refusée" authenticated "${N}01" "$(lignes 1)" PT429 telemetrie_debit_avant
for g in 02 03 04 05; do remplit "④ compte neuf $g : 150" authenticated "${N}$g" 150; done
remplit "④ compte neuf 06 : 50 (neufs + anonymes = 2 400)" authenticated "${N}06" 50
verif "④ … les neufs ont eu leurs 800 sous un flot anonyme" "$(compteur neufs '*')" "800"
refus_par "④ neufs + anonymes : 2 400 atteints, la ligne suivante est refusée" authenticated "${N}07" "$(lignes 1)" PT429 telemetrie_debit_avant
refuse "⑥ un compte ancien NON CONFIRMÉ est un « neuf »" authenticated "$NC" "$(lignes 1)"
refuse "⑥ un compte ancien ANONYME est un « neuf »" authenticated "$AN" "$(lignes 1)"
# anciens : 1 800 à eux seuls, quoi que fassent les autres
for g in 01 02 03 04 05 06 07 08 09 10 11 12; do
  remplit "④ compte ancien $g passe malgré neufs et anonymes pleins (150)" authenticated "${O}$g" 150
done
refus_par "④ anciens : 1 800 atteints, un treizième compte est refusé" authenticated "${O}13" "$(lignes 1)" PT429 telemetrie_debit_avant

# ④ l'autre sens du partage : les neufs ne prennent pas plus de 1 600, et laissent 800 aux anonymes
poser "$(cpt neufs '*' 1600)"
refus_par "④ neufs à 1 600 : refusés" authenticated "${N}08" "$(lignes 1)" PT429 telemetrie_debit_avant
passe "④ … les anonymes passent encore" anon "" "$(lignes 100)"
poser "$(cpt neufs '*' 799); $(cpt anonymes '*' 1600)"
passe "④ 799 + 1 600 : une ligne de neuf passe (2 400)" authenticated "${N}08" "$(lignes 1)"
refuse "④ … la suivante non" authenticated "${N}09" "$(lignes 1)"

# ⑤ un lot qui fait DÉBORDER est écrit puis annulé en entier : lignes et compteur
poser "$(cpt anciens '*' 1790)"
AVANT="$(Q "select count(*) from public.telemetry_events")"
refus_par "⑤ anciens à 1 790 : un lot de 20 déborde, refusé après décompte" authenticated "${O}13" "$(lignes 20)" PT429 telemetrie_debit_lot
verif "⑤ … n'écrit aucune ligne" "$(Q "select count(*) from public.telemetry_events")" "$AVANT"
verif "⑤ … et ne gonfle pas le compteur" "$(compteur anciens '*')" "1790"
passe "⑤ un lot de 10 tient encore (1 800)" authenticated "${O}13" "$(lignes 10)"
verif "⑤ … compté au réservoir et au compte" "$(compteur anciens '*')/$(compteur anciens "u:${O}13")" "1800/10"

# ⑦ service_role n'est pas limité, ni en débit ni en taille
passe "⑦ service_role écrit 150 lignes d'un coup, réservoirs pleins" service_role "" "$(lignes 150)"

# ⑧ les compteurs ne sont ni lisibles ni écrivables par un client
refuse "⑧ anon ne lit pas les compteurs" anon "" "select count(*) from public.telemetrie_debit"
refuse "⑧ authenticated n'écrit pas un compteur" authenticated "${O}01" "insert into public.telemetrie_debit values (now(), 'anciens', '*', 0)"
refuse "⑧ authenticated n'efface pas un compteur" authenticated "${O}01" "delete from public.telemetrie_debit"
refuse "⑧ anon n'appelle pas la fonction du déclencheur" anon "" "select public.telemetrie_debit_lot()"
refuse "⑧ authenticated ne lit pas les plafonds" authenticated "${O}01" "select public.telemetrie_plafond('anciens')"
refuse "⑧ anon ne se classe pas lui-même" anon "" "select public.telemetrie_reservoir()"

# ⑨ rejouable
FICHIER "$MIGRATION" >/dev/null
verif "⑨ rejouable : un seul compteur par instruction" "$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_lot' and not tgisinternal")" "1"
verif "⑨ rejouable : les compteurs survivent" "$(Q "select (count(*) > 0)::text from public.telemetrie_debit")" "true"
verif "⑨ rejouable : la sonde du verdict n'a laissé aucune ligne" "$(Q "select count(*) from public.telemetry_events where type = 'verdict_migration'")" "0"

# ⑨ rejouer la migration du 14/09 APRÈS celle-ci ne rouvre pas ASTRA-02 (contre-revue du 2026-10-16)
FICHIER "$RACINE/migrations/migration_debit_et_identite_serveur_2026-09-14.sql" >/dev/null
SOUS service_role "" "insert into public.telemetry_events(type, received_at) values ('antidate_rejeu', '2000-01-01')" >/dev/null
verif "⑨ 14/09 rejouée après : l'heure reste celle du serveur" "$(Q "select (received_at > now() - interval '1 minute')::text from public.telemetry_events where type = 'antidate_rejeu'")" "true"
verif "⑨ 14/09 rejouée après : le limiteur par lot reste seul" "$(Q "select count(*) filter (where tgname = 'trg_debit_lot') || '/' || count(*) filter (where tgname = 'trg_debit_global') from pg_trigger where tgrelid = 'public.telemetry_events'::regclass")" "1/0"

# ⑩ la purge des compteurs : planifiée une fois, et elle purge ce qui a plus d'une heure
verif "⑩ purge planifiée une fois, toutes les 15 min" "$(Q "select count(*) || ' ' || max(schedule) from cron.job where jobname = 'purge_telemetrie_debit'")" "1 */15 * * * *"
Q "insert into public.telemetrie_debit values (date_trunc('minute', now()) - interval '2 hours', 'anciens', '*', 5)" >/dev/null
Q "$(Q "select command from cron.job where jobname = 'purge_telemetrie_debit'")" >/dev/null
verif "⑩ la commande planifiée retire ce qui a plus d'une heure, et garde la minute en cours" "$(Q "select count(*) filter (where minute < now() - interval '1 hour') || '/' || (count(*) > 0)::text from public.telemetrie_debit")" "0/true"

# ⑪ mutants : le verdict doit LEVER par son propre message, et rien n'est appliqué
MUTANT="$BASE/mutant.sql"
mutant() { # $1 libellé, $2 fragment attendu du message du verdict
  chmod a+r "$MUTANT"
  Q "drop trigger if exists trg_debit_lot on public.telemetry_events; drop trigger if exists trg_debit_avant on public.telemetry_events;
     drop trigger if exists trg_debit_taille on public.telemetry_events; drop table if exists public.telemetrie_debit;
     delete from cron.job;
     create or replace function public.telemetry_pose_identite() returns trigger language plpgsql security definer set search_path = public, pg_temp as \$\$ begin new.auth_uid := auth.uid(); return new; end \$\$;
     drop trigger if exists trg_telemetry_identite on public.telemetry_events;
     create trigger trg_telemetry_identite before insert on public.telemetry_events for each row execute function public.telemetry_pose_identite();
     drop trigger if exists trg_debit_global on public.telemetry_events;
     create trigger trg_debit_global before insert on public.telemetry_events for each row execute function public.limiter_debit_global('received_at', '3000');" >/dev/null
  local sortie; sortie="$(FICHIER "$MUTANT" 2>&1 || true)"
  if printf '%s' "$sortie" | grep -q "ECHEC : $2"; then verif "⑪ $1 : le verdict lève" "levé" "levé"
  else verif "⑪ $1 : le verdict lève" "$(printf '%s' "$sortie" | grep -m1 -oE 'ERROR:.*' || echo appliqué)" "levé"; fi
  verif "⑪ $1 : l'état d'avant est intact" "$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_global'")/$(Q "select count(*) from pg_trigger where tgname = 'trg_debit_lot'")" "1/0"
}
grep -v "ASTRA-02 : jamais l'heure du client" "$MIGRATION" > "$MUTANT"
mutant "heure du client (ligne retirée)" "received_at"
sed "s/^  new.received_at := now();     -- ASTRA-02 : jamais l'heure du client/  -- new.received_at := now();/" "$MIGRATION" > "$MUTANT"
mutant "heure du client (ligne commentée)" "received_at"
sed '/^create trigger trg_telemetry_identite$/,+2d' "$MIGRATION" > "$MUTANT"
mutant "déclencheur d'identité non reposé" "déclencheur trg_telemetry_identite"
grep -v "^drop trigger if exists trg_debit_global on public.telemetry_events;" "$MIGRATION" > "$MUTANT"
mutant "ancien plafond laissé en place" "l'ancien plafond"
sed "/perform cron.schedule('purge_telemetrie_debit'/,+1d" "$MIGRATION" > "$MUTANT"
mutant "purge oubliée" "la purge des compteurs"

echo "Banc telemetrie-equitable : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
