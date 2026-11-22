#!/usr/bin/env bash
# Serveur PostgreSQL natif jetable, socket privé seulement. Jamais de cible externe.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo 'ECHEC : PostgreSQL natif requis pour le budget et ses verrous'; exit 1; }
PORT=$((6900 + RANDOM % 100))
if [ "$(id -u)" -eq 0 ]; then
 id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
 BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU='su pgbanc -c'
else BASE="$(mktemp -d)"; SU='bash -c'; fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null
DB=passio_test_realtime_budget
createdb -h "$BASE" -p "$PORT" -U postgres "$DB"
Q() { psql -X -h "$BASE" -p "$PORT" -U postgres -d "$DB" -qAt -v ON_ERROR_STOP=1 -c "$1"; }
F() { psql -X -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1"; }
cd "$RACINE"
F tests/sql/fixtures/cas-realtime-budget-socle.sql
AUID=11111111-1111-4111-8111-111111111111
BUID=22222222-2222-4222-8222-222222222222
# Avant : 130 avancées sans limite, deux destinataires non bloqués par accusé.
Q "select set_config('request.jwt.claim.sub','$AUID',false); set role authenticated; do \$\$ begin for i in 1..130 loop insert into public.conv_reads(conv_id,user_id,last_read_at) values('g',auth.uid()::text,clock_timestamp()-interval '1 day'+i*interval '1 second') on conflict(conv_id,user_id) do update set last_read_at=excluded.last_read_at; end loop; end \$\$;" >/dev/null
[ "$(Q 'select count(*) from realtime.trames')" = 260 ]
Q 'truncate public.conv_reads,realtime.trames' >/dev/null
F migrations/migration_realtime_budget_2026-11-16.sql
F migrations/migration_realtime_budget_2026-11-16.sql
F tests/sql/fixtures/cas-realtime-budget.sql

# Restaurer les profils synthétiques supprimés par le cas de purge, puis
# mettre DEUX connexions en contention sur la même dernière unité de budget.
Q "insert into public.profiles values('$AUID') on conflict do nothing; truncate passio_realtime_budget.compteurs,realtime.trames; insert into passio_realtime_budget.compteurs values('$AUID',1,(date_trunc('minute',clock_timestamp() at time zone 'UTC') at time zone 'UTC')+interval '1 minute',119,0,0);" >/dev/null
cat > "$BASE/a.sql" <<SQL
\set ON_ERROR_STOP on
set application_name='budget_a';
set statement_timeout='8s';
begin;
select set_config('request.jwt.claim.sub','$AUID',true);
set local role authenticated;
insert into public.conv_messages(id,conv_id,from_id,content) values('race_a','g',auth.uid()::text,'a');
reset role;
do \$\$ declare attend boolean:=false; begin
 for i in 1..200 loop
  perform pg_stat_clear_snapshot();
  if exists(select 1 from pg_stat_activity where application_name='budget_b'
    and wait_event_type='Lock' and pg_backend_pid() = any(pg_blocking_pids(pid))) then attend:=true;exit;end if;
  perform pg_sleep(0.02);
 end loop;
 if not attend then raise exception 'pas de contention observee';end if;
end \$\$;
commit;
SQL
F "$BASE/a.sql" >"$BASE/a.log" 2>&1 & PID_A=$!
PRET=0
for _ in $(seq 1 150); do
 if [ "$(Q "select count(*) from pg_stat_activity where application_name='budget_a' and wait_event='PgSleep'")" = 1 ]; then PRET=1; break; fi
 sleep 0.02
done
[ "$PRET" = 1 ] || { cat "$BASE/a.log"; exit 1; }
if Q "set application_name='budget_b';set statement_timeout='8s';select set_config('request.jwt.claim.sub','$AUID',false);set role authenticated;insert into public.conv_messages(id,conv_id,from_id,content) values('race_b','g',auth.uid()::text,'b');" >"$BASE/b.log" 2>&1; then
 echo 'ECHEC : deux transactions ont consomme la derniere unite'; exit 1
fi
wait "$PID_A" || { cat "$BASE/a.log"; exit 1; }
grep -q 'rate limit realtime' "$BASE/b.log" || { cat "$BASE/b.log"; exit 1; }
[ "$(Q "select count(*) from public.conv_messages where id in ('race_a','race_b')")" = 1 ]
[ "$(Q 'select count(*) from realtime.trames')" = 3 ]
[ "$(Q "select effets from passio_realtime_budget.compteurs where compte='$AUID' and fenetre=1")" = 120 ]
! grep -q '40P01' "$BASE/a.log" "$BASE/b.log"
echo 'OK : budget partage sous contention, un refus, pas de ligne ni diffusion partielle'

# L'horloge d'une requête est échantillonnée AVANT son attente sur la ligne.
# A avance la fenêtre sous verrou ; B, déjà en attente, ne peut la rétrograder.
Q "truncate passio_realtime_budget.compteurs,realtime.trames;insert into passio_realtime_budget.compteurs values('$AUID',1,date_trunc('minute',clock_timestamp() at time zone 'UTC') at time zone 'UTC',0,0,0);insert into public.conv_members values('capture','$AUID'),('capture','$BUID');" >/dev/null
CIBLE_FENETRE="$(Q "select extract(epoch from ((date_trunc('minute',clock_timestamp() at time zone 'UTC') at time zone 'UTC')+interval '1 minute'))::bigint")"
cat > "$BASE/fenetre.sql" <<SQL
set application_name='fenetre_a';set statement_timeout='8s';begin;
select 1 from passio_realtime_budget.compteurs where compte='$AUID' and fenetre=1 for update;
do \$\$ declare attend boolean:=false; begin
 for i in 1..200 loop
  perform pg_stat_clear_snapshot();
  if exists(select 1 from pg_stat_activity where application_name='fenetre_b'
    and wait_event_type='Lock' and pg_backend_pid() = any(pg_blocking_pids(pid))) then attend:=true;exit;end if;
  perform pg_sleep(0.02);
 end loop;
 if not attend then raise exception 'pas de contention fenetre';end if;
end \$\$;
update passio_realtime_budget.compteurs set debut=to_timestamp($CIBLE_FENETRE) where compte='$AUID' and fenetre=1;
insert into public.conv_members values('capture','44444444-4444-4444-8444-444444444444');
commit;
SQL
F "$BASE/fenetre.sql" >"$BASE/fenetre-a.log" 2>&1 & PID_A=$!
PRET=0
for _ in $(seq 1 150); do
 if [ "$(Q "select count(*) from pg_stat_activity where application_name='fenetre_a' and wait_event='PgSleep'")" = 1 ]; then PRET=1;break;fi
 sleep 0.02
done
[ "$PRET" = 1 ] || { cat "$BASE/fenetre-a.log";exit 1; }
Q "set application_name='fenetre_b';set statement_timeout='8s';select set_config('request.jwt.claim.sub','$AUID',false);set role authenticated;insert into public.conv_messages(id,conv_id,from_id,content) values('capture','capture',auth.uid()::text,'capture');" >"$BASE/fenetre-b.log" 2>&1 & PID_B=$!
wait "$PID_A" || { cat "$BASE/fenetre-a.log";exit 1; }
wait "$PID_B" || { cat "$BASE/fenetre-b.log";exit 1; }
[ "$(Q "select (extract(epoch from debut)::bigint=$CIBLE_FENETRE)::text from passio_realtime_budget.compteurs where compte='$AUID' and fenetre=1")" = true ]
[ "$(Q 'select count(*) from realtime.trames')" = 2 ]
[ "$(Q "select trames from passio_realtime_budget.compteurs where compte='$AUID' and fenetre=1")" = 2 ]
[ "$(Q "select count(*) from realtime.trames where topic='user:44444444-4444-4444-8444-444444444444'")" = 0 ]
echo 'OK : fenetre jamais retrogradee et liste de destinataires figee avant attente'

# Rejeu préserve les données de compteurs. Une liaison désactivée est refusée.
AVANT="$(Q 'select md5(string_agg(row(compte,fenetre,debut,effets,trames,octets)::text,chr(10) order by compte,fenetre)) from passio_realtime_budget.compteurs')"
F migrations/migration_realtime_budget_2026-11-16.sql
[ "$(Q 'select md5(string_agg(row(compte,fenetre,debut,effets,trames,octets)::text,chr(10) order by compte,fenetre)) from passio_realtime_budget.compteurs')" = "$AVANT" ]
Q 'alter table public.conv_reads disable trigger trg_diffuser_lecture' >/dev/null
if F migrations/migration_realtime_budget_2026-11-16.sql >"$BASE/derive.log" 2>&1; then echo 'ECHEC : liaison desactivee acceptee';exit 1;fi
grep -q 'liaison de diffusion differente' "$BASE/derive.log"
echo 'OK : migration rejouable, compteurs preserves, derive refusee'
