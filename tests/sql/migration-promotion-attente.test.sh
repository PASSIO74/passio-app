#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_promotion_attente_2026-11-02.sql (B-02 / E-01)
#
# PostgreSQL jetable, socle = `events` / `event_attendees` / `notifications`
# avec les policies ET les triggers de production (capacité sous verrou,
# origine des notifications). On MESURE D'ABORD le défaut : la promotion par
# UPDATE de la ligne d'autrui touche 0 ligne, même pour l'organisateur. On
# applique, on rejoue, puis : premier arrivé premier servi, capacité tenue
# sous concurrence, promotion choisie réservée à l'organisation, motifs
# stables, notification d'origine serveur sans doublon, anon sans accès.
#
#   bash tests/sql/migration-promotion-attente.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_promotion_attente_2026-11-02.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6050 + RANDOM % 120 ))
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

DB=attente
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }
# Un SEUL appel par mesure (une CTE) : rend le motif d'un refus, ou le compte promu.
MOTIF()  { AUTH "$1" "with r as (select public.promouvoir_attente('$2'${3:-}) as j) select coalesce(j->>'motif', j->>'user_id') from r;"; }

ORGA=11111111-1111-1111-1111-111111111111
COORG=22222222-2222-2222-2222-222222222222
A=33333333-3333-3333-3333-333333333333
B=44444444-4444-4444-4444-444444444444
C=55555555-5555-5555-5555-555555555555
D=66666666-6666-6666-6666-666666666666

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.events (id text primary key, author_id text not null, title text, status text default 'active',
  max_attendees integer, date_at timestamp, end_at timestamp, co_organizers jsonb default '[]');
create table public.event_attendees (event_id text not null, user_id text not null, created_at timestamptz default now(),
  rsvp text not null default 'going', checked_in_at timestamp, rating smallint, feedback text, rated_at timestamptz,
  primary key (event_id, user_id));
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now(), origine text not null default 'client');
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.notifications enable row level security;
create policy "lecture" on public.events for select using (true);
create policy "lecture" on public.event_attendees for select using (true);
create policy "insert_own" on public.event_attendees for insert with check (user_id = (select auth.uid())::text);
-- La policy UPDATE de production : PROPRIÉTAIRE seulement.
create policy "update_own" on public.event_attendees for update using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy "notif_lecture" on public.notifications for select using (user_id = (select auth.uid())::text);
grant select on public.events to anon, authenticated;
grant select, insert, update on public.event_attendees to authenticated;
grant select on public.notifications to authenticated;

-- Trigger de capacité de production (recopié de pg_get_functiondef, 2026-11-02).
create function public.event_attendees_capacite_gardee() returns trigger language plpgsql security definer set search_path to '' as $t$
declare ev record; inscrits integer;
begin
  if auth.uid() is null then return new; end if;
  if new.rsvp is distinct from 'going' then return new; end if;
  if tg_op = 'UPDATE' and old.rsvp = 'going' then return new; end if;
  select id, status, max_attendees, end_at, date_at into ev from public.events where id = new.event_id for update;
  if not found then raise exception 'activite_introuvable' using errcode = 'P0001'; end if;
  if ev.status = 'cancelled' then raise exception 'activite_annulee' using errcode = 'P0001'; end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then raise exception 'activite_passee' using errcode = 'P0001'; end if;
  if ev.max_attendees is not null then
    select count(*) into inscrits from public.event_attendees a where a.event_id = new.event_id and a.rsvp = 'going' and a.user_id <> new.user_id;
    if inscrits >= ev.max_attendees then raise exception 'activite_complete' using errcode = 'P0001'; end if;
  end if;
  return new;
end $t$;
create trigger trg_event_attendees_capacite before insert or update on public.event_attendees
  for each row execute function public.event_attendees_capacite_gardee();
-- Origine des notifications (production).
create function public.notifications_origine() returns trigger language plpgsql security definer set search_path to '' as $t$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  return new;
end $t$;
create trigger trg_notifications_origine before insert on public.notifications for each row execute function public.notifications_origine();

insert into public.events (id, author_id, title, status, max_attendees, date_at, end_at, co_organizers) values
  ('ev_cap2', '11111111-1111-1111-1111-111111111111', 'Rando capacité 2', 'active', 2, now() + interval '2 days', null, '["22222222-2222-2222-2222-222222222222"]'),
  ('ev_libre', '11111111-1111-1111-1111-111111111111', 'Sans capacité', 'active', null, now() + interval '2 days', null, '[]'),
  ('ev_ann', '11111111-1111-1111-1111-111111111111', 'Annulée', 'cancelled', 2, now() + interval '2 days', null, '[]'),
  ('ev_past', '11111111-1111-1111-1111-111111111111', 'Passée', 'active', 2, now() - interval '2 days', null, '[]');
-- Capacité 2 : A inscrit ; B puis C en liste d'attente (B le plus ancien).
insert into public.event_attendees (event_id, user_id, rsvp, created_at) values
  ('ev_cap2', '33333333-3333-3333-3333-333333333333', 'going', now() - interval '3 hours'),
  ('ev_cap2', '44444444-4444-4444-4444-444444444444', 'waitlist', now() - interval '2 hours'),
  ('ev_cap2', '55555555-5555-5555-5555-555555555555', 'waitlist', now() - interval '1 hour'),
  ('ev_ann',  '44444444-4444-4444-4444-444444444444', 'waitlist', now() - interval '1 hour'),
  ('ev_past', '44444444-4444-4444-4444-444444444444', 'waitlist', now() - interval '1 hour');
SQL

RSVP() { Q "select rsvp from public.event_attendees where event_id='$1' and user_id='$2';"; }
GOING() { Q "select count(*) from public.event_attendees where event_id='$1' and rsvp='going';"; }

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : l'UPDATE de l'ORGANISATEUR sur la ligne de B touche 0 ligne (policy propriétaire)" "0" \
  "$(AUTH "$ORGA" "with u as (update public.event_attendees set rsvp='going' where event_id='ev_cap2' and user_id='$B' returning 1) select count(*) from u;")"
verifier "avant : celui qui se retire (A) ne promeut pas B davantage" "0" \
  "$(AUTH "$A" "with u as (update public.event_attendees set rsvp='going' where event_id='ev_cap2' and user_id='$B' returning 1) select count(*) from u;")"
verifier "avant : B est toujours en liste d'attente" "waitlist" "$(RSVP ev_cap2 "$B")"
verifier "avant : aucune RPC promouvoir_attente" "0" "$(Q "select count(*) from pg_proc where proname='promouvoir_attente';")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 4 OK et 0 ECHEC" "4/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 4 OK" "4" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

# ⚠️ Ce banc éprouve le fichier du 02/11 TEL QU'IL A ÉTÉ APPLIQUÉ : ici un compte
# quelconque (D) apprend QUI est promu, et la promotion choisie ignore
# `organizer_id` — le risque R24, fermé par
# `migration_promotion_discrete_vues_2026-11-03.sql` (banc
# `migration-promotion-discrete-vues.test.sh`, qui part de cette définition).
echo "── ③ PREMIER ARRIVÉ, PREMIER SERVI — et la capacité tient ───────────"
verifier "une place libre (1/2) : un compte quelconque (D) déclenche la promotion → B (le plus ancien)" "$B" "$(MOTIF "$D" ev_cap2)"
verifier "B est passé en going" "going" "$(RSVP ev_cap2 "$B")"
verifier "C attend toujours" "waitlist" "$(RSVP ev_cap2 "$C")"
verifier "2 inscrits : la capacité est atteinte" "2" "$(GOING ev_cap2)"
verifier "nouvel appel : complete (C n'est PAS promu au-delà de la capacité)" "complete" "$(MOTIF "$D" ev_cap2)"
verifier "notification d'origine SERVEUR pour B, une seule" "1|serveur|event_update" \
  "$(Q "select count(*) || '|' || min(origine) || '|' || min(kind) from public.notifications where user_id='$B' and ref_id='ev_cap2';")"
verifier "…le texte nomme l'activité" "1" "$(Q "select count(*) from public.notifications where user_id='$B' and content like '%Rando capacité 2%';")"
verifier "…l'expéditeur est l'organisateur (from_id)" "$ORGA" "$(Q "select from_id from public.notifications where user_id='$B' and ref_id='ev_cap2';")"

echo "── ④ UN INSCRIT SE RETIRE : le suivant monte ────────────────────────"
verifier "A se retire (sa propre ligne : policy propriétaire)" "OK" "$(AUTH_OK "$A" "update public.event_attendees set rsvp='declined' where event_id='ev_cap2' and user_id='$A';")"
verifier "A (celui qui part) déclenche la promotion : C est promu" "$C" "$(MOTIF "$A" ev_cap2)"
verifier "C est going, 2 inscrits" "going|2" "$(RSVP ev_cap2 "$C")|$(GOING ev_cap2)"
verifier "plus personne n'attend : personne_en_attente… une fois une place libre" "complete" "$(MOTIF "$D" ev_cap2)"
verifier "B se retire puis relance : personne_en_attente" "personne_en_attente" \
  "$(AUTH "$B" "update public.event_attendees set rsvp='declined' where event_id='ev_cap2' and user_id='$B';" >/dev/null; MOTIF "$D" ev_cap2)"

echo "── ⑤ PROMOTION CHOISIE : l'organisation seule ──────────────────────"
Q "insert into public.event_attendees (event_id, user_id, rsvp, created_at) values ('ev_cap2', '$B', 'waitlist', now() - interval '10 minutes') on conflict (event_id, user_id) do update set rsvp='waitlist';" >/dev/null
Q "insert into public.event_attendees (event_id, user_id, rsvp, created_at) values ('ev_cap2', '$D', 'waitlist', now() - interval '5 minutes') on conflict (event_id, user_id) do update set rsvp='waitlist';" >/dev/null
verifier "un participant (C) qui désigne quelqu'un : non_autorise" "non_autorise" "$(MOTIF "$C" ev_cap2 ", '$D'")"
verifier "…D attend toujours" "waitlist" "$(RSVP ev_cap2 "$D")"
verifier "une place libre : l'organisateur désigne quelqu'un qui n'attend pas (A, retiré) : pas_en_attente" "pas_en_attente" "$(MOTIF "$ORGA" ev_cap2 ", '$A'")"
verifier "…et personne n'a été promu à sa place" "1" "$(GOING ev_cap2)"
verifier "le CO-ORGANISATEUR désigne D (pas le plus ancien) : D est promu" "$D" "$(MOTIF "$COORG" ev_cap2 ", '$D'")"
verifier "…B, plus ancien, attend encore (le choix de l'organisation prime)" "waitlist" "$(RSVP ev_cap2 "$B")"
verifier "complet (2/2) : l'organisateur ne peut pas forcer B au-delà de la capacité → complete" "complete" "$(MOTIF "$ORGA" ev_cap2 ", '$B'")"
verifier "…toujours 2 inscrits" "2" "$(GOING ev_cap2)"

echo "── ⑥ MOTIFS STABLES ET PORTES ───────────────────────────────────────"
verifier "activité annulée : annulee" "annulee" "$(MOTIF "$D" ev_ann)"
verifier "activité passée : passee" "passee" "$(MOTIF "$D" ev_past)"
verifier "sans capacité : sans_capacite" "sans_capacite" "$(MOTIF "$D" ev_libre)"
verifier "activité inconnue : introuvable" "introuvable" "$(MOTIF "$D" ev_inconnue)"
verifier "sans session : non_connecte" "non_connecte" "$(Q "select public.promouvoir_attente('ev_cap2')->>'motif';")"
contient "anon : pas le droit d'exécuter" "permission denied" "$(ANON "select public.promouvoir_attente('ev_cap2');")"
verifier "la policy UPDATE de event_attendees est restée propriétaire" "1" \
  "$(Q "select count(*) from pg_policies where tablename='event_attendees' and cmd='UPDATE' and qual like '%auth.uid()%';")"

echo "── ⑦ CONCURRENCE : la dernière place ne se donne qu'une fois ───────"
Q "update public.event_attendees set rsvp='declined' where event_id='ev_cap2' and user_id='$D';" >/dev/null
Q "insert into public.event_attendees (event_id, user_id, rsvp, created_at) values ('ev_cap2', '$A', 'waitlist', now() - interval '1 minute') on conflict (event_id, user_id) do update set rsvp='waitlist', created_at = now() - interval '1 minute';" >/dev/null
# État : C going ; B (waitlist, le plus ancien), A (waitlist) ; 1 place libre.
verifier "précondition : 1 inscrit, 2 en attente" "1|2" "$(GOING ev_cap2)|$(Q "select count(*) from public.event_attendees where event_id='ev_cap2' and rsvp='waitlist';")"
r1=""; r2=""
( AUTH "$ORGA" "select pg_sleep(0.05); select public.promouvoir_attente('ev_cap2')->>'motif';" > "$BASE/r1.txt" 2>&1 ) &
( AUTH "$COORG" "select pg_sleep(0.05); select public.promouvoir_attente('ev_cap2')->>'motif';" > "$BASE/r2.txt" 2>&1 ) &
wait
r1="$(tail -1 "$BASE/r1.txt")"; r2="$(tail -1 "$BASE/r2.txt")"
verifier "deux appels simultanés : UNE promotion, l'autre rend complete" "1" "$( [ "$r1" = "complete" ] && [ -z "$r2" ] && echo 1 || { [ "$r2" = "complete" ] && [ -z "$r1" ] && echo 1 || echo "0 ($r1 / $r2)"; } )"
verifier "capacité jamais dépassée : 2 inscrits, B (le plus ancien) promu" "2|going|waitlist" "$(GOING ev_cap2)|$(RSVP ev_cap2 "$B")|$(RSVP ev_cap2 "$A")"
verifier "la notification de B n'a pas été dupliquée au rejeu (identifiant déterministe)" "1" "$(Q "select count(*) from public.notifications where user_id='$B' and ref_id='ev_cap2';")"

echo "── ⑧ SQUAT D'IDENTIFIANT : la notification va au vrai destinataire ────"
# `n_pa_` n'est pas réservé au serveur : D pré-insère, à SON nom, l'identifiant
# déterministe que recevrait B. La promotion ne doit ni réécrire la ligne de D,
# ni laisser B sans notification (revue indépendante du 2026-11-02, point 3e).
Q "insert into public.events (id, author_id, title, status, max_attendees, date_at) values ('ev_squat', '$ORGA', 'Squat', 'active', 1, now() + interval '2 days');" >/dev/null
Q "insert into public.event_attendees (event_id, user_id, rsvp, created_at) values ('ev_squat', '$B', 'waitlist', now() - interval '1 hour');" >/dev/null
Q "insert into public.notifications (id, user_id, kind, from_id, ref_id, content, origine) values ('n_pa_' || left('ev_squat', 12) || '_' || left('$B', 8), '$D', 'like', '$D', 'x', 'ligne du squatteur', 'client');" >/dev/null
verifier "précondition : l'identifiant déterministe de B est occupé par D" "$D" "$(Q "select user_id from public.notifications where id = 'n_pa_' || left('ev_squat', 12) || '_' || left('$B', 8);")"
verifier "la promotion de B aboutit quand même" "$B" "$(MOTIF "$ORGA" ev_squat)"
verifier "la ligne du squatteur n'est PAS réécrite (contenu, destinataire intacts)" "$D|ligne du squatteur|like" "$(Q "select user_id || '|' || content || '|' || kind from public.notifications where id = 'n_pa_' || left('ev_squat', 12) || '_' || left('$B', 8);")"
verifier "B reçoit SA notification, sous un identifiant neuf, d'origine serveur" "1|serveur" "$(Q "select count(*) || '|' || min(origine) from public.notifications where user_id='$B' and ref_id='ev_squat' and kind='event_update';")"
verifier "…et personne d'autre n'en reçoit pour cette activité" "1" "$(Q "select count(*) from public.notifications where ref_id='ev_squat';")"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
