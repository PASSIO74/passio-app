#!/usr/bin/env bash
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo 'ECHEC : PostgreSQL natif requis, aucune concurrence simulee'; exit 1; }
PORT=$((6100 + RANDOM % 200))
if [ "$(id -u)" -eq 0 ]; then
 id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
 BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU='su pgbanc -c'
else BASE="$(mktemp -d)"; SU='bash -c'; fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null
export PGHOST="$BASE" PGPORT="$PORT" PGUSER=postgres PGDATABASE=passio_test_rencontres
createdb "$PGDATABASE"
cd "$RACINE"
psql -X -q -v ON_ERROR_STOP=1 -f tests/sql/migration-rencontres-validation.test.sql
Q() { psql -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }
ORGA=11111111-1111-4111-8111-111111111111
USERID=22222222-2222-4222-8222-222222222222
# L'inscription UPDATE a déjà son verrou de ligne avant d'appeler ses triggers.
# A tient ce verrou, B exécute la vraie action puis attend. Aucun mock de verrou.
for CAS in blocage validation; do
 Q "delete from public.blocks; insert into public.events(id,author_id,organizer_id) values ('race_$CAS','$ORGA','$ORGA'); insert into public.event_attendees(event_id,user_id,rsvp) values ('race_$CAS','$USERID','maybe');" >/dev/null
 cat > "$BASE/a.sql" <<SQL
\set VERBOSITY verbose
set statement_timeout='8s';
set application_name='rencontres_a';
begin;
select set_config('request.jwt.claim.sub','$USERID',true);
select 1 from public.event_attendees where event_id='race_$CAS' and user_id='$USERID' for update;
do \$\$ declare fini boolean:=false; begin
 for i in 1..200 loop
  -- pg_stat_activity conserve son premier instantané pendant toute la transaction.
  perform pg_stat_clear_snapshot();
  if exists(select 1 from pg_stat_activity where application_name='rencontres_b'
    and wait_event_type='Lock' and pg_backend_pid() = any(pg_blocking_pids(pid))) then fini:=true;exit;end if;
  perform pg_sleep(0.02);
 end loop;
 if not fini then raise exception 'B ne contend pas'; end if;
end \$\$;
update public.event_attendees set rsvp='going' where event_id='race_$CAS' and user_id='$USERID';
commit;
SQL
 psql -X -q -v ON_ERROR_STOP=1 -f "$BASE/a.sql" >"$BASE/a.log" 2>&1 & A=$!
 PRET=0
 for _ in $(seq 1 150); do
  if [ "$(Q "select count(*) from pg_stat_activity where application_name='rencontres_a' and wait_event='PgSleep'")" = 1 ]; then PRET=1; break; fi
  sleep 0.02
 done
 [ "$PRET" = 1 ] || { cat "$BASE/a.log"; exit 1; }
 if [ "$CAS" = blocage ]; then ACTION="insert into public.blocks values('$ORGA','$USERID')";
 else ACTION="select public.valider_participant('race_$CAS','$USERID',true)"; fi
 Q "set application_name='rencontres_b'; set statement_timeout='8s'; select set_config('request.jwt.claim.sub','$ORGA',false); $ACTION;" >"$BASE/b.log" 2>&1 & B=$!
 if wait "$A"; then CODE_A=0; else CODE_A=$?; fi
 wait "$B" || { cat "$BASE/b.log"; exit 1; }
 if [ "$CAS" = blocage ]; then
  [ "$CODE_A" = 0 ] || { cat "$BASE/a.log"; exit 1; }
  [ "$(Q "select count(*) from public.event_attendees where event_id='race_$CAS'")" = 0 ]
 else
  [ "$CODE_A" = 0 ] || { cat "$BASE/a.log"; exit 1; }
  [ "$(Q "select count(*) from rencontres_prive.accords where event_id='race_$CAS'")" = 1 ]
 fi
 ! grep -q '40P01' "$BASE/a.log" "$BASE/b.log"
 echo "OK : deux sessions $CAS, triggers reels, contention observee"
done

# INSERT pas encore visible : blocage non commis et RSVP neuf doivent se sérialiser.
Q "delete from public.blocks; insert into public.events(id,author_id,organizer_id) values('race_insert','$ORGA','$ORGA');" >/dev/null
Q "set application_name='rencontres_insert_block'; begin; insert into public.blocks values('$ORGA','$USERID'); select pg_sleep(3); commit;" >"$BASE/c.log" 2>&1 & C=$!
PRET=0
for _ in $(seq 1 100); do
 if [ "$(Q "select count(*) from pg_stat_activity where application_name='rencontres_insert_block' and wait_event='PgSleep'")" = 1 ]; then PRET=1; break; fi
 sleep 0.02
done
[ "$PRET" = 1 ] || { cat "$BASE/c.log"; exit 1; }
if psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "select set_config('request.jwt.claim.sub','$USERID',false); insert into public.event_attendees(event_id,user_id) values('race_insert','$USERID');" >"$BASE/d.log" 2>&1; then
 echo 'ECHEC : inscription concurrente acceptee'; exit 1
fi
grep -q '40001' "$BASE/d.log"
wait "$C" || { cat "$BASE/c.log"; exit 1; }
[ "$(Q "select count(*) from public.event_attendees where event_id='race_insert'")" = 0 ]
echo 'OK : deux sessions INSERT/blocage, refus réessayable et aucune inscription résiduelle'
