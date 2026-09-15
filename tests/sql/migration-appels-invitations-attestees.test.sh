#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_appels_invitations_attestees_2026-09-15.sql (MSG-01 / SUP-06, résidu)
#
# PostgreSQL jetable, socle Realtime tel que laissé par la migration du 14/09
# (sonnerie privée), plus un realtime.send FACTICE qui consigne ce que la base
# émet. Mesure AVANT (un client émet lui-même sur ring:<B> avec un from déclaré ;
# aucune table d'invitations), applique, rejoue, puis : A invite B (1:1 commun)
# → la BASE fait sonner ring:<B> avec from = A ; C sans 1:1, usurpation,
# destinataire qui a bloqué : refusés ; répétition = seconde sonnerie ;
# identifiants figés ; un client n'émet plus sur ring: mais toujours sur call: ;
# chacun lit ses invitations ; anon rien.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_appels_invitations_attestees_2026-09-15.sql"
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

DB=invit
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
ANONRT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
           -c "set local role anon; set local realtime.topic='$1'; $2" 2>&1; }
# Realtime évalue ses policies avec le TOPIC posé dans la session.
RT()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2'; $3" 2>&1; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
RT_OK() { _ok_ou_erreur "$(RT "$1" "$2" "$3")"; }

A=11111111-1111-1111-1111-111111111111   # appelé
B=22222222-2222-2222-2222-222222222222   # a bloqué C
C=33333333-3333-3333-3333-333333333333   # tiers curieux, bloqué par B
D=44444444-4444-4444-4444-444444444444   # sans lien

ok=0; ko=0
verifier() { # libellé, attendu, obtenu
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi
}
contient() { # libellé, motif, texte
  if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi
}

# ── SOCLE : Realtime tel que laissé par la migration du 2026-09-14 (sonnerie
# privée), plus un `realtime.send` FACTICE qui consigne ce que la base émet. ──
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
     -v a="$A" -v b="$B" -v c="$C" -v d="$D" >/dev/null <<'SQL'
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
create table public.blocks (blocker_id text not null, blocked_id text not null, primary key (blocker_id, blocked_id));
create table public.conversations (id text primary key, is_group boolean default false);
create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));
create function public.is_conv_member(_conv_id text, _uid text) returns boolean language sql stable security definer set search_path = '' as
  $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as
  $fn$ select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
       else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other)
                    or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end $fn$;
create schema realtime;
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text, extension text, payload jsonb, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $fn$ select current_setting('realtime.topic', true) $fn$;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
-- Le faux `send` : ce que la BASE émet est consigné (topic, payload, private).
create table realtime.envois (topic text, event text, payload jsonb, private boolean, quand timestamptz default now());
create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as
  $fn$ insert into realtime.envois (topic, event, payload, private) values (topic, event, payload, private) $fn$;
create policy "passio_rt_recevoir" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%' and substr(realtime.topic(), 6) = (select auth.uid())::text)
  or realtime.topic() like 'call:%' or realtime.topic() like 'vlive:%' or realtime.topic() = 'realtime:db');
create policy "passio_rt_emettre" on realtime.messages for insert to authenticated with check (
     (realtime.topic() like 'ring:%' and not public.is_blocked_with(substr(realtime.topic(), 6)))
  or realtime.topic() like 'call:%' or realtime.topic() like 'vlive:%');
-- A et B partagent un 1:1 ; C n'a qu'un GROUPE en commun avec B ; D a bloqué A.
insert into public.conversations values ('conv_ab', false), ('grp_abc', true), ('conv_ad', false);
insert into public.conv_members values ('conv_ab', :'a'), ('conv_ab', :'b'), ('grp_abc', :'a'), ('grp_abc', :'b'), ('grp_abc', :'c'), ('conv_ad', :'a'), ('conv_ad', :'d');
insert into public.blocks values (:'d', :'a');
SQL

AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }
PAYLOAD_A='{"from":"'"$A"'"}'

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : un client émet lui-même sur ring:<B>, from déclaré" "OK" "$(RT_OK "$C" "ring:$B" "insert into realtime.messages (topic, extension, payload) values ('ring:$B', 'broadcast', '$PAYLOAD_A');")"
verifier "avant : aucune table d'invitations" "0" "$(Q "select count(*) from information_schema.tables where table_name='call_invites';")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "verdict 7 OK / 0 ECHEC" "7/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 7 OK" "7" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ CE QUI CHANGE ───────────────────────────────────────────────────"
verifier "A invite B (1:1 commun) : la ligne passe" "OK" "$(AUTH_OK "$A" "insert into public.call_invites (id, from_id, to_id, kind) values ('call_ab_000001', '$A', '$B', 'voice');")"
verifier "…et la BASE fait sonner ring:<B> : from = A, atteste, privé" "ring:$B|invite|$A|true|true" "$(Q "select topic || '|' || event || '|' || (payload->>'from') || '|' || (payload->>'atteste') || '|' || private::text from realtime.envois order by quand desc limit 1;")"
contient "C (rien en 1:1 avec B) : refusé" "row-level security" "$(AUTH_OK "$C" "insert into public.call_invites (id, from_id, to_id, kind) values ('call_cb_000001', '$C', '$B', 'voice');")"
contient "A qui signe « C » : refusé" "row-level security" "$(AUTH_OK "$A" "insert into public.call_invites (id, from_id, to_id, kind) values ('call_usurpe_01', '$C', '$B', 'voice');")"
contient "A appelle D qui l'a bloqué : refusé" "row-level security" "$(AUTH_OK "$A" "insert into public.call_invites (id, from_id, to_id, kind) values ('call_ad_000001', '$A', '$D', 'voice');")"
AUTH "$A" "update public.call_invites set repete_le = now() where id = 'call_ab_000001';" >/dev/null
verifier "répétition (UPDATE repete_le) : seconde sonnerie" "2" "$(Q "select count(*) from realtime.envois where topic = 'ring:$B';")"
contient "déplacer l'invitation vers C : refusé (identifiants figés)" "figés" "$(AUTH_OK "$A" "update public.call_invites set to_id = '$C' where id = 'call_ab_000001';")"
contient "un client n'émet plus sur ring:<B>" "row-level security" "$(RT_OK "$A" "ring:$B" "insert into realtime.messages (topic, extension, payload) values ('ring:$B', 'broadcast', '$PAYLOAD_A');")"
# ⚠️ CE CONTRÔLE MESURE UN RÉSIDU, PAS UNE PROPRIÉTÉ VOULUE. À ce stade
# `call:%` est encore ouvert à TOUT compte, y compris un tiers étranger à
# l'appel (ASTRA-23) : ce qui est exigé ici, c'est seulement que CETTE
# migration ne l'ait pas cassé. La fermeture est le lot suivant,
# `migration_canal_appel_lie_2026-09-15.sql`, et son banc mesure le défaut
# avant de le refermer. Ne pas relire cette ligne comme « c'est normal ».
verifier "résidu ASTRA-23 : call: reste ouvert à tout compte après CETTE migration" "OK" "$(RT_OK "$A" "call:8f1c" "insert into realtime.messages (topic, extension) values ('call:8f1c', 'broadcast');")"
verifier "chacun lit ses invitations : A et B la voient, C non" "1|1|0" "$(AUTH "$A" "select count(*) from public.call_invites;" | tail -1)|$(AUTH "$B" "select count(*) from public.call_invites;" | tail -1)|$(AUTH "$C" "select count(*) from public.call_invites;" | tail -1)"
verifier "anon : aucun droit sur call_invites" "f" "$(Q "select has_table_privilege('anon', 'public.call_invites', 'SELECT');")"
contient "un genre inconnu est refusé" "call_invites_kind_check" "$(AUTH_OK "$A" "insert into public.call_invites (id, from_id, to_id, kind) values ('call_ab_000002', '$A', '$B', 'holo');")"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
