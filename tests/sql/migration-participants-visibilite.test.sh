#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_participants_visibilite_2026-11-03.sql (C-04)
#
# PostgreSQL jetable, socle = `events` / `event_attendees` / `follows` avec les
# policies et GRANTs de production tels que mesurés au canal ① le 2026-11-03
# (SELECT `true` pour authenticated, `anon` avec DELETE). On MESURE D'ABORD le
# défaut (un tiers lit la liste nominative, la note et le texte libre de
# chacun), on applique, puis on éprouve chaque branche du lien : soi,
# organisation (auteur / organisateur / co-organisateur), co-inscrit,
# personne suivie (abonnement accepté seulement), « declined » jamais public ;
# les colonnes de retour illisibles ; les compteurs et l'agrégat publics parmi
# les connectés ; les retours réservés à l'organisation ; anon sans rien.
#
#   bash tests/sql/migration-participants-visibilite.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_participants_visibilite_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6200 + RANDOM % 120 ))
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

DB=participants
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
# Liste triée des inscrits que `$1` voit sur l'activité `$2` (lettre du compte, pas l'uuid).
VOIT() { AUTH "$1" "select string_agg(substr(user_id, 1, 1), ',' order by user_id) from public.event_attendees where event_id = '$2';"; }

ORGA=11111111-1111-1111-1111-111111111111
COORG=22222222-2222-2222-2222-222222222222
A=33333333-3333-3333-3333-333333333333   # inscrit (going), suivi par T
B=44444444-4444-4444-4444-444444444444   # inscrit (maybe)
C=55555555-5555-5555-5555-555555555555   # a refusé (declined)
D=66666666-6666-6666-6666-666666666666   # liste d'attente, compte PRIVÉ (demande de T en attente)
T=77777777-7777-7777-7777-777777777777   # tiers : ni inscrit, ni organisation ; suit A, demande D
X=88888888-8888-8888-8888-888888888888   # tiers sans aucun lien

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

create table public.events (id text primary key, author_id text not null, organizer_id text, title text, status text default 'active',
  max_attendees integer, date_at timestamp, end_at timestamp, co_organizers jsonb default '[]');
create table public.event_attendees (event_id text not null, user_id text not null, created_at timestamptz default now(),
  rsvp text not null default 'going', checked_in_at timestamp, rating smallint, feedback text, rated_at timestamptz,
  primary key (event_id, user_id));
create table public.follows (follower_id text not null, following_id text not null, status text not null default 'accepted',
  created_at timestamptz default now(), primary key (follower_id, following_id));
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.follows enable row level security;
-- Production, 2026-11-03 (canal ①) : events lisibles, event_attendees SELECT `true` pour authenticated,
-- écriture « ma ligne », follows lisibles si acceptés ou si l'on en est partie.
create policy "Lecture publique" on public.events for select using (true);
create policy event_attendees_select_authentifie on public.event_attendees for select to authenticated using (true);
create policy event_attendees_insert_own on public.event_attendees for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy event_attendees_update_own on public.event_attendees for update to authenticated using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy "Suppression propre" on public.event_attendees for delete using (user_id = (select auth.uid())::text);
create policy follows_lecture on public.follows for select to anon, authenticated
  using (status = 'accepted' or follower_id = (select auth.uid())::text or following_id = (select auth.uid())::text);
grant select on public.events to anon, authenticated;
grant select, insert, update, delete on public.event_attendees to authenticated;
grant delete on public.event_attendees to anon;   -- le droit de table superflu mesuré en production
grant select on public.follows to anon, authenticated;

insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, co_organizers) values
  ('ev_rando', '11111111-1111-1111-1111-111111111111', null, 'Rando', 10, now() + interval '2 days', '["22222222-2222-2222-2222-222222222222"]'),
  ('ev_passee', '11111111-1111-1111-1111-111111111111', null, 'Passée', null, now() - interval '10 days', '[]'),
  ('ev_vide', '11111111-1111-1111-1111-111111111111', null, 'Sans inscrit', 5, now() + interval '5 days', '[]');
insert into public.event_attendees (event_id, user_id, rsvp, created_at, checked_in_at, rating, feedback, rated_at) values
  ('ev_rando', '33333333-3333-3333-3333-333333333333', 'going',    now() - interval '3 hours', now(), null, null, null),
  ('ev_rando', '44444444-4444-4444-4444-444444444444', 'maybe',    now() - interval '2 hours', null, null, null, null),
  ('ev_rando', '55555555-5555-5555-5555-555555555555', 'declined', now() - interval '1 hour',  null, null, null, null),
  ('ev_rando', '66666666-6666-6666-6666-666666666666', 'waitlist', now() - interval '30 minutes', null, null, null, null),
  ('ev_passee', '33333333-3333-3333-3333-333333333333', 'going', now() - interval '12 days', now() - interval '10 days', 5, 'Super soirée, à refaire', now() - interval '9 days'),
  ('ev_passee', '44444444-4444-4444-4444-444444444444', 'going', now() - interval '12 days', null, 3, 'Un peu long', now() - interval '9 days'),
  ('ev_passee', '77777777-7777-7777-7777-777777777777', 'going', now() - interval '12 days', null, null, null, null);
insert into public.follows (follower_id, following_id, status) values
  ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'accepted'),
  ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'pending');
SQL

echo "── ⓪ AVANT : le défaut mesuré en production ──────────────────────────"
verifier "un tiers sans lien lit la liste nominative entière (A, B, C, D), refus compris" "3,4,5,6" "$(VOIT "$X" ev_rando)"
verifier "…et la note comme le texte libre d'autrui" "5|Super soirée, à refaire" "$(AUTH "$X" "select rating || '|' || feedback from public.event_attendees where event_id='ev_passee' and user_id='$A';")"
verifier "anon tient un DELETE de table (sans policy : 0 ligne, mais le droit est là)" "t" "$(Q "select has_table_privilege('anon', 'public.event_attendees', 'DELETE');")"

echo "── ① APPLICATION ───────────────────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 4 OK et 0 ECHEC" "4/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejouée : même verdict (idempotente)" "4/0" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie2" | grep -cE '\|\s*ECHEC\s*$' || true)"

echo "── ② LA LISTE SUIT LE LIEN ────────────────────────────────────────"
verifier "tiers sans aucun lien : rien" "" "$(VOIT "$X" ev_rando)"
verifier "tiers qui SUIT A (accepté) : voit A seulement — D (demande en attente) reste invisible" "3" "$(VOIT "$T" ev_rando)"
verifier "co-inscrit B (peut-être) : voit A, B, D — jamais le refus de C" "3,4,6" "$(VOIT "$B" ev_rando)"
verifier "D (liste d'attente) est co-inscrit : voit A, B, D" "3,4,6" "$(VOIT "$D" ev_rando)"
verifier "C, qui a refusé, n'est pas co-inscrit : ne voit que sa propre ligne" "5" "$(VOIT "$C" ev_rando)"
verifier "l'auteur voit tout, refus compris" "3,4,5,6" "$(VOIT "$ORGA" ev_rando)"
verifier "le co-organisateur voit tout, refus compris" "3,4,5,6" "$(VOIT "$COORG" ev_rando)"
Q "update public.events set organizer_id = '$X' where id = 'ev_vide';" >/dev/null
Q "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_vide', '$A', 'going');" >/dev/null
verifier "l'organisateur désigné (organizer_id) voit la liste de son activité" "3" "$(VOIT "$X" ev_vide)"
verifier "activité passée : A y était, il voit encore qui y était (A, B, T)" "3,4,7" "$(VOIT "$A" ev_passee)"
verifier "activité passée : X n'y était pas, il ne voit personne" "" "$(VOIT "$X" ev_passee)"
verifier "anon : aucun droit de lecture (42501)" "1" "$(ANON "select count(*) from public.event_attendees;" | grep -c "permission denied" || true)"

echo "── ③ COLONNES DE RETOUR : illisibles, mais toujours inscriptibles sur SA ligne ──"
contient "même un co-inscrit ne lit pas le feedback d'autrui (42501 colonne)" "permission denied" "$(AUTH "$A" "select feedback from public.event_attendees where event_id='ev_passee';")"
contient "…ni la note" "permission denied" "$(AUTH "$A" "select rating from public.event_attendees where event_id='ev_passee';")"
contient "…ni la sienne par lecture directe (c'est l'agrégat ou le miroir local qui servent)" "permission denied" "$(AUTH "$A" "select rating from public.event_attendees where event_id='ev_passee' and user_id='$A';")"
verifier "les cinq colonnes du client se lisent (event_id,user_id,rsvp,created_at,checked_in_at)" "3|going|true" "$(AUTH "$A" "select substr(user_id,1,1) || '|' || rsvp || '|' || (checked_in_at is not null) from public.event_attendees where event_id='ev_rando' and user_id='$A';")"
verifier "T note son activité passée : UPDATE de sa ligne avec RETURNING event_id (le geste du client)" "ev_passee" "$(AUTH "$T" "update public.event_attendees set rating = 4, feedback = 'Chouette', rated_at = now() where event_id='ev_passee' and user_id='$T' returning event_id;")"
contient "le même UPDATE avec RETURNING * est refusé : c'est pourquoi le client ne demande plus select()" "permission denied" "$(AUTH "$T" "update public.event_attendees set rating = 4 where event_id='ev_passee' and user_id='$T' returning *;")"
verifier "T s'inscrit à la rando (INSERT) : accepté" "1" "$(AUTH "$T" "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_rando', '$T', 'going') returning 1;")"
verifier "…et devient co-inscrit : il voit maintenant A, B, D et lui-même" "3,4,6,7" "$(VOIT "$T" ev_rando)"
verifier "T se désinscrit (DELETE de sa ligne) : accepté" "1" "$(AUTH "$T" "delete from public.event_attendees where event_id='ev_rando' and user_id='$T' returning 1;")"
verifier "…et ne voit plus que A, qu'il suit" "3" "$(VOIT "$T" ev_rando)"

echo "── ④ LE NOMBRE RESTE PUBLIC PARMI LES CONNECTÉS ───────────────────"
verifier "participants_compte pour un tiers sans lien : 1 venant, 1 peut-être, 1 en attente, 1 pointé (le refus ne compte pas)" "ev_rando|1|1|1|1" \
  "$(AUTH "$X" "select event_id || '|' || going || '|' || maybe || '|' || waitlist || '|' || checked_in from public.participants_compte(array['ev_rando','ev_inconnue']);")"
verifier "plusieurs activités d'un coup, l'activité sans inscrit n'apparaît pas (le client lit 0)" "ev_passee:3|ev_rando:1" \
  "$(AUTH "$X" "select string_agg(event_id || ':' || going, '|' order by event_id) from public.participants_compte(array['ev_rando','ev_passee','ev_sans']);")"
verifier "notes_evenement : moyenne et nombre, sans dire qui (A 5, B 3, T 4 → 4.00 sur 3)" "4.00|3" "$(AUTH "$X" "select (j->>'avg') || '|' || (j->>'count') from (select public.notes_evenement('ev_passee') j) s;")"
verifier "notes_evenement sur une activité sans note : 0 sur 0" "0|0" "$(AUTH "$X" "select (j->>'avg') || '|' || (j->>'count') from (select public.notes_evenement('ev_rando') j) s;")"
contient "anon ne peut appeler ni participants_compte…" "permission denied" "$(ANON "select * from public.participants_compte(array['ev_rando']);")"
contient "…ni notes_evenement" "permission denied" "$(ANON "select public.notes_evenement('ev_passee');")"

echo "── ⑤ LES RETOURS ÉCRITS VONT À L'ORGANISATION ────────────────────"
verifier "l'auteur lit les retours de son activité passée (3 lignes, texte compris)" "3|Super soirée, à refaire" \
  "$(AUTH "$ORGA" "select count(*) || '|' || max(feedback) filter (where user_id='$A') from public.retours_evenement('ev_passee');")"
verifier "un participant (A) n'en lit aucun" "0" "$(AUTH "$A" "select count(*) from public.retours_evenement('ev_passee');")"
verifier "un tiers n'en lit aucun" "0" "$(AUTH "$X" "select count(*) from public.retours_evenement('ev_passee');")"
contient "anon ne peut pas l'appeler" "permission denied" "$(ANON "select * from public.retours_evenement('ev_passee');")"

echo "── ⑥ LES HELPERS NE PARLENT QUE DE L'APPELANT ────────────────────"
verifier "organise_activite : auteur oui, co-organisateur oui, tiers non" "t|t|f" \
  "$(AUTH "$ORGA" "select public.organise_activite('ev_rando');")|$(AUTH "$COORG" "select public.organise_activite('ev_rando');")|$(AUTH "$X" "select public.organise_activite('ev_rando');")"
verifier "inscrit_a_activite : B (peut-être) oui, C (refus) non, X non" "t|f|f" \
  "$(AUTH "$B" "select public.inscrit_a_activite('ev_rando');")|$(AUTH "$C" "select public.inscrit_a_activite('ev_rando');")|$(AUTH "$X" "select public.inscrit_a_activite('ev_rando');")"
verifier "sans session (postgres) : les deux helpers rendent faux, jamais une erreur" "false|false" "$(Q "select public.organise_activite('ev_rando') || '|' || public.inscrit_a_activite('ev_rando');")"
verifier "anon : DELETE de table retiré" "f" "$(Q "select has_table_privilege('anon', 'public.event_attendees', 'DELETE');")"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
