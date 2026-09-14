#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_evenements_cascade_2026-09-14.sql (IRL-06)
#
# PostgreSQL jetable, socle = les quatre tables de production TELLES QUELLES
# (aucune clé étrangère, policies DELETE « ses lignes seulement »). On MESURE
# D'ABORD le défaut : l'organisateur supprime son activité, les inscriptions
# des autres restent. On applique, on rejoue, puis on vérifie les deux sens :
# la suppression du parent emporte les lignes filles sous le compte de
# l'organisateur ; un autre compte ne peut toujours pas supprimer l'activité ;
# un participant peut toujours retirer SA seule inscription.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_evenements_cascade_2026-09-14.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5930 + RANDOM % 120 ))
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

DB=irl06
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }

ORGA=11111111-1111-1111-1111-111111111111
PART=22222222-2222-2222-2222-222222222222
TIERS=33333333-3333-3333-3333-333333333333

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : les tables de production, sans clé étrangère, policies telles quelles ──
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.events (id text primary key, author_id text not null, title text);
create table public.event_attendees (id uuid primary key default gen_random_uuid(), event_id text not null, user_id text not null, status text);
create table public.event_comments  (id uuid primary key default gen_random_uuid(), event_id text not null, author_id text not null, content text);
create table public.event_reactions (id uuid primary key default gen_random_uuid(), event_id text not null, user_id text not null, emoji text);
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_comments enable row level security;
alter table public.event_reactions enable row level security;
create policy "Suppression propre" on public.events for delete using (author_id = auth.uid()::text);
create policy "Suppression propre" on public.event_attendees for delete using (user_id = auth.uid()::text);
create policy "event_comments_delete_own" on public.event_comments for delete using (author_id = auth.uid()::text);
create policy "event_reactions_delete" on public.event_reactions for delete using (user_id = auth.uid()::text);
create policy "lecture" on public.events for select using (true);
create policy "lecture" on public.event_attendees for select using (true);
create policy "lecture" on public.event_comments for select using (true);
create policy "lecture" on public.event_reactions for select using (true);
grant select, delete on public.events, public.event_attendees, public.event_comments, public.event_reactions to authenticated;

insert into public.events values ('ev1', '11111111-1111-1111-1111-111111111111', 'Rando');
insert into public.events values ('ev2', '11111111-1111-1111-1111-111111111111', 'Concert');
insert into public.event_attendees (event_id, user_id, status) values
  ('ev1', '11111111-1111-1111-1111-111111111111', 'going'),
  ('ev1', '22222222-2222-2222-2222-222222222222', 'going'),
  ('ev1', '33333333-3333-3333-3333-333333333333', 'maybe'),
  ('ev2', '22222222-2222-2222-2222-222222222222', 'going'),
  ('ev_disparu', '22222222-2222-2222-2222-222222222222', 'going');
insert into public.event_comments (event_id, author_id, content) values ('ev1', '22222222-2222-2222-2222-222222222222', 'hâte'), ('ev_disparu', '33333333-3333-3333-3333-333333333333', 'orphelin');
insert into public.event_reactions (event_id, user_id, emoji) values ('ev1', '33333333-3333-3333-3333-333333333333', '🔥'), ('ev_disparu', '33333333-3333-3333-3333-333333333333', '🔥');
SQL

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : aucune clé étrangère vers events" "0" "$(Q "select count(*) from pg_constraint where contype='f' and confrelid='public.events'::regclass;")"
verifier "avant : 3 lignes orphelines (ev_disparu) dans les tables filles" "3" "$(Q "select (select count(*) from event_attendees where event_id='ev_disparu')+(select count(*) from event_comments where event_id='ev_disparu')+(select count(*) from event_reactions where event_id='ev_disparu');")"
AUTH "$ORGA" "delete from public.event_attendees where event_id='ev2';" >/dev/null 2>&1 || true
AUTH "$ORGA" "delete from public.events where id='ev2';" >/dev/null 2>&1 || true
verifier "avant : l'organisateur a supprimé ev2…" "0" "$(Q "select count(*) from events where id='ev2';")"
verifier "…mais l'inscription du participant reste (policy : ses lignes seulement) — l'orphelin naît ici" "1" "$(Q "select count(*) from event_attendees where event_id='ev2';")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "verdict : 3 FK en cascade" "3" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*cascade\s*$' || true)"
verifier "verdict : 0 orphelin restant" "1" "$(printf '%s\n' "$sortie" | grep -cE 'orphelins restants\s*\|\s*0\s*$' || true)"
verifier "les 4 orphelins (ev_disparu ×3 + ev2) ont été retirés" "0" "$(Q "select count(*) from event_attendees a where not exists (select 1 from events e where e.id=a.event_id);")"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 3 FK en cascade, sans erreur" "3" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*cascade\s*$' || true)"

echo "── ③ LA SUPPRESSION EMPORTE LES LIGNES FILLES, ET SEULEMENT SOUS L'ORGANISATEUR ──"
AUTH "$TIERS" "delete from public.events where id='ev1';" >/dev/null 2>&1 || true
verifier "un autre compte ne supprime pas ev1 (policy inchangée)" "1" "$(Q "select count(*) from events where id='ev1';")"
verifier "…et ses 3 inscriptions sont intactes" "3" "$(Q "select count(*) from event_attendees where event_id='ev1';")"
AUTH "$PART" "delete from public.event_attendees where event_id='ev1' and user_id='$PART';" >/dev/null 2>&1 || true
verifier "un participant retire SA seule inscription (2 restent)" "2" "$(Q "select count(*) from event_attendees where event_id='ev1';")"
AUTH "$ORGA" "delete from public.events where id='ev1';" >/dev/null 2>&1 || true
verifier "l'organisateur supprime ev1" "0" "$(Q "select count(*) from events where id='ev1';")"
verifier "…les inscriptions des AUTRES sont parties avec (cascade, hors policies filles)" "0" "$(Q "select count(*) from event_attendees where event_id='ev1';")"
verifier "…commentaires et réactions aussi" "0" "$(Q "select (select count(*) from event_comments where event_id='ev1')+(select count(*) from event_reactions where event_id='ev1');")"

echo
echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
