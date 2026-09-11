#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — ADRESSE, CONTACT ET PARTICIPANTS D'UNE RENCONTRE
#
# Monte un PostgreSQL JETABLE, y reconstitue les policies et les GRANTs RÉELS de
# production sur `events` et `event_attendees`, applique la migration, puis joue
# les scénarios en tant que visiteur sans compte et en tant que compte connecté.
#
# Ce qu'il prouve :
#   ① ÉTAT D'AVANT : un visiteur SANS COMPTE lit l'adresse, le téléphone et la
#                    liste nominative des participants (le défaut IRL-01/03) ;
#   ② ATOMICITÉ    : une policy SELECT inconnue refuse toute la migration ;
#   ③ APRÈS        : le visiteur garde le titre, la ville, la carte — et perd
#                    l'adresse, le contact et les participants ; un compte
#                    connecté garde tout ;
#   ④ LE PIÈGE     : `select *` échoue pour le visiteur, et c'est pour ça que le
#                    client demande des colonnes EXPLICITES ;
#   ⑤ MUTATIONS    : chaque garde retirée rend son test ROUGE.
#
#   bash tests/sql/migration-irl-donnees-privees.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_irl_donnees_privees.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5690 + RANDOM % 120 ))
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

Q() { psql -h "$BASE" -p "$PORT" -U postgres -d irl -tA -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
AS() { psql -h "$BASE" -p "$PORT" -U postgres -d irl -tA -q -v ON_ERROR_STOP=1 \
       -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d irl -tA -q -v ON_ERROR_STOP=1 \
         -c "set local role anon; $1" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # compte connecté

# Les colonnes que le client demande. Recopiées de `_EVENT_COLS_PUBLIC`
# (js/app-08-ui-modals-tour.js) : si les deux listes divergent, le banc cesse de
# mesurer ce que l'application fait réellement — d'où le contrôle ④ ter.
# ⚠️ `conv_id` a quitté la liste PUBLIQUE le 2026-09-11 (migration
# `migration_ouverture_publique_2026-09-11.sql`) : combiné à `is_conv_member`,
# exécutable par anon, il permettait de reconstituer sans compte la liste
# nominative des membres de la conversation d'une rencontre. La migration du
# 08/09 (celle-ci) l'accordait encore ; celle du 11/09 le retire, et son banc
# compare la MÊME liste client au nouveau GRANT.
COLS_PUBLIC="id,author_id,title,passion_id,lat,lng,city,description,emoji,max_attendees,date_at,created_at,venue,postal_code,price,external_link,event_type,cover_url,organizer_id,end_at,status,updated_at,co_organizers,series_id,recurrence"

socle() {
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 -c "drop database if exists irl" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 -c "drop role if exists anon; drop role if exists authenticated" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 -c "create database irl" >/dev/null
  Q -c "
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as \$\$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
    grant usage on schema auth to anon, authenticated;

    -- Colonnes RECOPIÉES du schéma réel de production (2026-09-08).
    create table public.events (
      id text primary key, author_id text, title text, passion_id text,
      lat double precision, lng double precision, city text, description text,
      emoji text, max_attendees integer, date_at timestamp, created_at timestamp default now(),
      venue text, address text, postal_code text, price double precision,
      contact text, external_link text, event_type text, cover_url text,
      organizer_id text, end_at timestamp, status text default 'active',
      updated_at timestamp, co_organizers jsonb default '[]'::jsonb,
      series_id text, recurrence text, conv_id text);
    alter table public.events enable row level security;
    create policy \"Lecture publique\" on public.events for select using (true);
    create policy \"Read events\" on public.events for select using (true);

    create table public.event_attendees (
      event_id text not null, user_id text not null, rsvp text not null default 'going',
      created_at timestamptz default now(), primary key (event_id, user_id));
    alter table public.event_attendees enable row level security;
    -- LA POLICY RÉELLE DE PRODUCTION : c'est le défaut qu'on ferme.
    create policy \"Lecture publique\" on public.event_attendees for select using (true);

    -- LES GRANTS RÉELS : anon a tout (arwdDxtm) sur les deux tables.
    grant select, insert, update, delete on public.events, public.event_attendees to anon, authenticated;
  " >/dev/null
  Q -c "
    insert into public.events (id, author_id, title, city, lat, lng, address, contact)
      values ('ev1','$A','Sortie photo','Annecy',45.9,6.12,'12 rue des Marronniers','06 12 34 56 78');
    insert into public.event_attendees (event_id, user_id) values ('ev1','$A');
  " >/dev/null
}

OK=0; KO=0
verifier() { # $1=libellé  $2=attendu  $3=obtenu
  if [ "$3" = "$2" ]; then OK=$((OK+1)); printf '  ✅ %s\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s — attendu «%s», obtenu «%s»\n' "$1" "$2" "$3"; fi
}
# « lit » / « refuse » — toute autre sortie est une PANNE, jamais un
# cloisonnement réussi par accident.
lecture() { # $1=rôle ("" = anon)  $2=SQL
  local sortie
  if [ -z "$1" ]; then sortie="$(ANON "$2" || true)"; else sortie="$(AS "$1" "$2" || true)"; fi
  case "$sortie" in
    *"permission denied"*) echo refuse ;;
    *ERROR*|*error:*) echo erreur ;;
    "") echo vide ;;
    *) echo "$sortie" ;;
  esac
}

echo "═══ Rencontres — adresse, contact et participants ═══"

echo
echo "── ① L'ÉTAT D'AVANT : le défaut existe bel et bien ──"
socle
verifier "un visiteur SANS COMPTE lit l'adresse exacte" "12 rue des Marronniers" \
  "$(lecture "" "select address from public.events where id='ev1';")"
verifier "…et le téléphone de l'organisateur"           "06 12 34 56 78" \
  "$(lecture "" "select contact from public.events where id='ev1';")"
verifier "…et la liste nominative des participants"      "$A" \
  "$(lecture "" "select user_id from public.event_attendees where event_id='ev1';")"

echo
echo "── ② ATOMICITÉ : une policy SELECT inconnue annule toute la migration ──"
socle
Q -c "create policy \"derive_lecture\" on public.event_attendees for select using (true);" >/dev/null
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "policy SELECT inconnue : migration REFUSÉE" refusee "$r"
verifier "rollback : anon lit encore l'adresse (rien n'a été appliqué)" "12 rue des Marronniers" \
  "$(lecture "" "select address from public.events where id='ev1';")"

socle
Q -c "create policy \"derive_all\" on public.events for all using (true) with check (true);" >/dev/null
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "policy FOR ALL (cmd = 'ALL') : migration REFUSÉE aussi" refusee "$r"

echo
echo "── ③ APRÈS : ce qui reste public, ce qui ne l'est plus ──"
socle
Q -f "$MIGRATION" >/dev/null
verifier "PRÉMISSE — le visiteur voit toujours le titre"   "Sortie photo" \
  "$(lecture "" "select title from public.events where id='ev1';")"
verifier "…la ville"                                        "Annecy" \
  "$(lecture "" "select city from public.events where id='ev1';")"
verifier "…et les coordonnées de la carte (décision assumée)" "45.9" \
  "$(lecture "" "select lat from public.events where id='ev1';")"
verifier "l'adresse exacte lui est REFUSÉE"                 refuse \
  "$(lecture "" "select address from public.events where id='ev1';")"
verifier "le téléphone aussi"                                refuse \
  "$(lecture "" "select contact from public.events where id='ev1';")"
verifier "les participants aussi"                            refuse \
  "$(lecture "" "select user_id from public.event_attendees where event_id='ev1';")"
verifier "PRÉMISSE — un compte connecté lit l'adresse"      "12 rue des Marronniers" \
  "$(lecture "$A" "select address from public.events where id='ev1';")"
verifier "…le téléphone"                                     "06 12 34 56 78" \
  "$(lecture "$A" "select contact from public.events where id='ev1';")"
verifier "…et les participants"                              "$A" \
  "$(lecture "$A" "select user_id from public.event_attendees where event_id='ev1';")"
verifier "migration rejouée : idempotente"                   refuse \
  "$(Q -f "$MIGRATION" >/dev/null; lecture "" "select address from public.events where id='ev1';")"

echo
echo "── ④ LE PIÈGE : pourquoi le client ne demande plus « * » ──"
# ⚠️ C'est LE point qui rend le lot client obligatoire : PostgREST refuse la
# requête ENTIÈRE dès qu'une colonne manque au rôle. Un `select *` ne masque pas
# deux champs, il fait disparaître TOUTES les rencontres pour tout visiteur.
verifier "« select * » est REFUSÉ au visiteur"               refuse \
  "$(lecture "" "select * from public.events where id='ev1';")"
verifier "la liste EXPLICITE du client, elle, passe"         "Sortie photo" \
  "$(lecture "" "select title from (select $COLS_PUBLIC from public.events where id='ev1') t;")"
# ④ ter — les deux listes doivent rester la MÊME. Un ajout de colonne fait ici
# et pas là-bas (ou l'inverse) rendrait ce banc vert sur un client cassé.
CLIENT_COLS="$(sed -n '/_EVENT_COLS_PUBLIC = \[/,/\].join/p' "$RACINE/js/app-08-ui-modals-tour.js" \
  | grep -o '"[a-z_]*"' | tr -d '"' | paste -sd, -)"
verifier "la liste du banc est CELLE du client, à l'octet près" "$COLS_PUBLIC" "$CLIENT_COLS"

echo
echo "── ⑤ MUTATIONS : chaque garde retirée doit rendre son test ROUGE ──"
mutation() { # $1=libellé  $2=SQL après migration  $3=sonde  $4=valeur qui SIGNALE le défaut
  socle
  Q -f "$MIGRATION" >/dev/null
  Q -c "$2" >/dev/null
  local obtenu; obtenu="$(eval "$3")"
  if [ "$obtenu" = "$4" ]; then OK=$((OK+1)); printf '  ✅ %s → défaut détecté\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s → LA MUTATION SURVIT (obtenu «%s»)\n' "$1" "$obtenu"; fi
}

mutation "GRANT SELECT de table rendu à anon (le grant de colonne ne borne plus rien)" \
  "grant select on public.events to anon;" \
  'lecture "" "select address from public.events where id='"'"'ev1'"'"';"' \
  "12 rue des Marronniers"

mutation "policy publique rétablie sur les participants" \
  "create policy \"Lecture publique\" on public.event_attendees for select using (true);
   grant select on public.event_attendees to anon;" \
  'lecture "" "select user_id from public.event_attendees where event_id='"'"'ev1'"'"';"' \
  "$A"

mutation "policy des participants rouverte à public (le GRANT seul ne suffit pas)" \
  "drop policy \"event_attendees_select_authentifie\" on public.event_attendees;
   create policy \"event_attendees_select_authentifie\" on public.event_attendees for select using (true);
   grant select on public.event_attendees to anon;" \
  'lecture "" "select user_id from public.event_attendees where event_id='"'"'ev1'"'"';"' \
  "$A"

echo
echo "═══ $OK OK · $KO KO ═══"
[ "$KO" -eq 0 ]
