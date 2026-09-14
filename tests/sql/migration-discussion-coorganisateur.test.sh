#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_discussion_coorganisateur_2026-09-14.sql (IRL-10)
#
# PostgreSQL jetable, socle = `can_join_event_conversation` et la policy INSERT
# de `conv_members` TELLES QU'EN PRODUCTION (relues le 2026-09-14). On MESURE
# D'ABORD le défaut : la discussion créée par un co-organisateur refuse tout
# inscrit. On applique, on rejoue, puis on vérifie les deux sens : l'inscrit
# rejoint une discussion créée par l'auteur OU par un co-organisateur ; une
# discussion créée par un tiers reste fermée ; un non-inscrit reste dehors ;
# anon n'exécute pas la fonction.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_discussion_coorganisateur_2026-09-14.sql"
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

DB=irl10
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }

AUTEUR=11111111-1111-1111-1111-111111111111
COORG=22222222-2222-2222-2222-222222222222
INSCRIT=33333333-3333-3333-3333-333333333333
TIERS=44444444-4444-4444-4444-444444444444
CURIEUX=55555555-5555-5555-5555-555555555555

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : la production telle quelle ──────────────────────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.events (id text primary key, author_id text not null, title text, status text default 'active', conv_id text, co_organizers jsonb default '[]');
create table public.event_attendees (id uuid primary key default gen_random_uuid(), event_id text not null, user_id text not null, rsvp text);
create table public.conversations (id text primary key, is_group boolean default true, group_name text, created_by text not null);
create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));

-- Aides, telles qu'en production (les deux dernières réduites à leur verdict pour le banc).
create function public.is_conversation_creator(_conv_id text) returns boolean language sql stable security definer set search_path to '' as $$
  select case when auth.uid() is null or _conv_id is null then false
  else exists (select 1 from public.conversations c where c.id = _conv_id and c.created_by = (auth.uid())::text) end $$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path to '' as $$ select false $$;
create function public.adult_access_allowed() returns boolean language sql stable security definer set search_path to '' as $$ select auth.uid() is not null $$;
create function public.can_join_event_conversation(_conv_id text) returns boolean language sql stable security definer set search_path to '' as $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.events e
        JOIN public.event_attendees a ON a.event_id = e.id AND a.user_id = (auth.uid())::text
        JOIN public.conversations c ON c.id = e.conv_id
       WHERE e.conv_id = _conv_id
         AND e.conv_id = ('evgrp_' || e.id)
         AND c.created_by = e.author_id
         AND e.status = 'active'
         AND a.rsvp IN ('going', 'maybe')
         AND NOT public.is_blocked_with(e.author_id)
         AND public.adult_access_allowed()
    )
  END
$function$;
revoke execute on function public.can_join_event_conversation(text) from public, anon;
grant execute on function public.can_join_event_conversation(text) to authenticated;
grant execute on function public.is_conversation_creator(text), public.is_blocked_with(text), public.adult_access_allowed() to authenticated;

alter table public.conv_members enable row level security;
create policy "Ecriture propre" on public.conv_members for insert
  with check ((is_conversation_creator(conv_id) or ((user_id = (select auth.uid())::text) and can_join_event_conversation(conv_id))) and not is_blocked_with(user_id));
grant select, insert on public.conv_members to authenticated;
grant select on public.events, public.event_attendees, public.conversations to authenticated;

-- ev_a : discussion créée par l'AUTEUR. ev_c : discussion créée par le CO-ORGANISATEUR. ev_t : par un TIERS (usurpation de nom).
insert into public.events values
  ('ev_a', '11111111-1111-1111-1111-111111111111', 'Rando', 'active', 'evgrp_ev_a', '["22222222-2222-2222-2222-222222222222"]'),
  ('ev_c', '11111111-1111-1111-1111-111111111111', 'Concert', 'active', 'evgrp_ev_c', '["22222222-2222-2222-2222-222222222222"]'),
  ('ev_t', '11111111-1111-1111-1111-111111111111', 'Expo', 'active', 'evgrp_ev_t', '["22222222-2222-2222-2222-222222222222"]');
insert into public.conversations values
  ('evgrp_ev_a', true, 'Rando', '11111111-1111-1111-1111-111111111111'),
  ('evgrp_ev_c', true, 'Concert', '22222222-2222-2222-2222-222222222222'),
  ('evgrp_ev_t', true, 'Expo', '44444444-4444-4444-4444-444444444444');
insert into public.event_attendees (event_id, user_id, rsvp) values
  ('ev_a', '33333333-3333-3333-3333-333333333333', 'going'),
  ('ev_c', '33333333-3333-3333-3333-333333333333', 'going'),
  ('ev_t', '33333333-3333-3333-3333-333333333333', 'going');
SQL

REJOINDRE() { AUTH_OK "$1" "insert into public.conv_members values ('$2', '$1');"; }
NETTOYER() { Q "delete from public.conv_members where user_id='$1';" >/dev/null; }

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : l'inscrit rejoint la discussion créée par l'auteur" "OK" "$(REJOINDRE "$INSCRIT" evgrp_ev_a)"
contient "avant : la MÊME personne est REFUSÉE dans la discussion créée par le co-organisateur" "row-level security" "$(REJOINDRE "$INSCRIT" evgrp_ev_c)"
NETTOYER "$INSCRIT"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 3 OK et 0 ECHEC" "3/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 3 OK" "3" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ LES DEUX SENS ───────────────────────────────────────────────────"
verifier "l'inscrit rejoint la discussion créée par l'auteur (inchangé)" "OK" "$(REJOINDRE "$INSCRIT" evgrp_ev_a)"
verifier "l'inscrit rejoint la discussion créée par le CO-ORGANISATEUR" "OK" "$(REJOINDRE "$INSCRIT" evgrp_ev_c)"
contient "une discussion créée par un TIERS (ni auteur ni co-organisateur) reste fermée" "row-level security" "$(REJOINDRE "$INSCRIT" evgrp_ev_t)"
contient "un NON-inscrit reste dehors, même chez le co-organisateur" "row-level security" "$(REJOINDRE "$CURIEUX" evgrp_ev_c)"
contient "personne n'entre SOUS L'IDENTITÉ d'un autre" "row-level security" "$(AUTH_OK "$CURIEUX" "insert into public.conv_members values ('evgrp_ev_c', '$INSCRIT');")"
verifier "le créateur (co-organisateur) entre dans sa propre discussion" "OK" "$(REJOINDRE "$COORG" evgrp_ev_c)"
verifier "anon n'exécute toujours pas la fonction" "f" "$(Q "select has_function_privilege('anon', 'public.can_join_event_conversation(text)', 'EXECUTE');")"
Q "update public.events set co_organizers = null where id = 'ev_c';" >/dev/null
NETTOYER "$INSCRIT"
contient "co_organizers NULL : la fonction ne lève pas, elle refuse" "row-level security" "$(REJOINDRE "$INSCRIT" evgrp_ev_c)"

echo
echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
