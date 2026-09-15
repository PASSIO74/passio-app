#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_canal_appel_lie_2026-09-15.sql (ASTRA-23)
#
# PostgreSQL jetable. Le socle monte Realtime tel que laissé par la migration du
# 2026-09-14, PUIS applique la VRAIE migration des invitations attestées du
# 15/09 : l'état mesuré en production le jour même, pas une reconstitution.
# C'est là que le défaut se mesure — `call:%` sans condition, en lecture comme
# en émission — avant d'appliquer le correctif, de le rejouer, et de le muter.
#
# ⚠️ CE BANC MESURE UN TIERS, PAS UNE SYNTAXE. « la policy contient
# call_partie_prenante » serait vrai avec un membre `call:%` inconditionnel
# laissé à côté — et deux membres PERMISSIFS s'additionnent par OU. Ce qui est
# exigé ici, c'est que C ne lise ni n'écrive RIEN sur le canal de A et B.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_canal_appel_lie_2026-09-15.sql"
AMONT="$RACINE/migrations/migration_appels_invitations_attestees_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }
[ -f "$AMONT" ] || { echo "❌ migration amont introuvable : $AMONT"; exit 1; }

PORT=$(( 6070 + RANDOM % 120 ))
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

DB=canalappel
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
RT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
       -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2'; $3" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
# ⚠️ « OK » ou le message d'erreur : `psql -q` avale les étiquettes de commande
# (« INSERT 0 1 »), donc un banc qui attend ce texte lit une chaîne vide et
# accuse la migration.
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
RT_OK()   { _ok_ou_erreur "$(RT "$1" "$2" "$3")"; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }

A=11111111-1111-1111-1111-111111111111   # appelant
B=22222222-2222-2222-2222-222222222222   # appelé
C=33333333-3333-3333-3333-333333333333   # tiers qui CONNAÎT le callId
D=44444444-4444-4444-4444-444444444444   # a bloqué A

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : Realtime au 2026-09-14, plus un realtime.send factice. ──
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
create table realtime.envois (topic text, event text, payload jsonb, private boolean, quand timestamptz default now());
create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as
  $fn$ insert into realtime.envois (topic, event, payload, private) values (topic, event, payload, private) $fn$;
-- Les DEUX policies telles que laissées le 2026-09-14.
create policy "passio_rt_recevoir" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%' and substr(realtime.topic(), 6) = (select auth.uid())::text)
  or realtime.topic() like 'call:%' or realtime.topic() like 'vlive:%' or realtime.topic() = 'realtime:db'
  or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
  or (realtime.topic() like 'conv_specific:%' and public.is_conv_member(substr(realtime.topic(), 15), (select auth.uid())::text)));
create policy "passio_rt_emettre" on realtime.messages for insert to authenticated with check (
     (realtime.topic() like 'ring:%' and not public.is_blocked_with(substr(realtime.topic(), 6)))
  or realtime.topic() like 'call:%' or realtime.topic() like 'vlive:%'
  or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text)));
insert into public.conversations values ('conv_ab', false), ('conv_ac', false), ('conv_ad', false);
insert into public.conv_members values ('conv_ab', :'a'), ('conv_ab', :'b'), ('conv_ac', :'a'), ('conv_ac', :'c'), ('conv_ad', :'a'), ('conv_ad', :'d');
insert into public.blocks values (:'d', :'a');
SQL

# L'ÉTAT DE LA PRODUCTION : la migration des invitations attestées, la vraie.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$AMONT" >/dev/null 2>&1 \
  || { echo "❌ la migration amont (invitations attestées) a échoué — le socle ne vaut rien"; exit 1; }

ID=call_ab_000001
TOPIC="call:$ID"
AUTH "$A" "insert into public.call_invites (id, from_id, to_id, kind) values ('$ID', '$A', '$B', 'voice');" >/dev/null
# Une trame déjà sur le canal : c'est ce qu'un tiers lirait (offre SDP, ICE).
Q "insert into realtime.messages (topic, extension, payload) values ('$TOPIC', 'broadcast', '{\"event\":\"offer\",\"sdp\":\"candidat ICE : 192.0.2.44\"}');" >/dev/null

echo "── ① LE DÉFAUT, MESURÉ SUR L'ÉTAT DE LA PRODUCTION ───────────────────"
verifier "la ligne d'invitation existe et nomme A et B" "$A|$B" "$(Q "select from_id || '|' || to_id from public.call_invites where id = '$ID';")"
verifier "avant : C, étranger à l'appel, LIT la trame (offre SDP, adresses IP)" "1" "$(RT "$C" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
verifier "avant : C ÉMET sur le canal (un hangup coupe la communication)" "OK" "$(RT_OK "$C" "$TOPIC" "insert into realtime.messages (topic, extension, payload) values ('$TOPIC', 'broadcast', '{\"event\":\"hangup\"}');")"
verifier "avant : même un compte SANS aucun lien (D) y entre" "OK" "$(RT_OK "$D" "$TOPIC" "insert into realtime.messages (topic, extension) values ('$TOPIC', 'broadcast');")"
Q "delete from realtime.messages where payload->>'event' in ('hangup') or payload is null;" >/dev/null

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
verifier "verdict 6 OK / 0 ECHEC" "6/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 6 OK" "6" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ LES DEUX PARTIES GARDENT LEUR APPEL ─────────────────────────────"
verifier "A (appelant) lit son canal" "1" "$(RT "$A" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
verifier "B (appelé) lit le même canal" "1" "$(RT "$B" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
verifier "A y émet (offre SDP)" "OK" "$(RT_OK "$A" "$TOPIC" "insert into realtime.messages (topic, extension) values ('$TOPIC', 'broadcast');")"
verifier "B y émet (réponse SDP)" "OK" "$(RT_OK "$B" "$TOPIC" "insert into realtime.messages (topic, extension) values ('$TOPIC', 'broadcast');")"

echo "── ④ LE TIERS EST DEHORS, EN LECTURE COMME EN ÉMISSION ───────────────"
verifier "C ne lit RIEN — et sans erreur : un refus légitime ne fait pas de bruit" "0" "$(RT "$C" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
contient "C n'émet plus (pas de hangup, pas de substitution)" "row-level security" "$(RT_OK "$C" "$TOPIC" "insert into realtime.messages (topic, extension) values ('$TOPIC', 'broadcast');")"
verifier "D non plus" "0" "$(RT "$D" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
contient "un identifiant qui n'existe pas n'ouvre rien, même pour A" "row-level security" "$(RT_OK "$A" "call:inconnu-0000" "insert into realtime.messages (topic, extension) values ('call:inconnu-0000', 'broadcast');")"

echo "── ⑤ LE RESTE DE LA POLICY EST INTACT ────────────────────────────────"
verifier "ring:<B> : toujours lisible par B seul" "0" "$(RT "$C" "ring:$B" "select count(*) from realtime.messages where topic = 'ring:$B';" | tail -1)"
contient "ring: : toujours interdit à l'émission d'un client" "row-level security" "$(RT_OK "$A" "ring:$B" "insert into realtime.messages (topic, extension) values ('ring:$B', 'broadcast');")"
verifier "typing:<conv> : un membre émet toujours" "OK" "$(RT_OK "$A" "typing:conv_ab" "insert into realtime.messages (topic, extension) values ('typing:conv_ab', 'broadcast');")"
verifier "conv:<conv> : un NON-membre reste dehors" "0" "$(RT "$C" "conv:conv_ab" "select count(*) from realtime.messages where topic = 'conv:conv_ab';" | tail -1)"
verifier "realtime:db : toujours ouvert (chaque table garde sa RLS)" "OK" "$(RT_OK "$C" "realtime:db" "select 1;")"

echo "── ⑥ AUCUN ORACLE ───────────────────────────────────────────────────"
verifier "anon ne peut pas appeler le prédicat" "f" "$(Q "select has_function_privilege('anon', 'public.call_partie_prenante(text)', 'EXECUTE');")"
# ⚠️ Le prédicat répond sur l'APPELANT, jamais sur la CIBLE : C obtient `false`
# pour un appel qui EXISTE comme pour un identifiant inventé — il ne peut donc
# pas distinguer les deux, et n'apprend ni qu'un appel a lieu, ni qui l'a passé.
verifier "C obtient le MÊME verdict pour un appel réel et un identifiant inventé" "false|false" "$(AUTH "$C" "select public.call_partie_prenante('$ID')::text || '|' || public.call_partie_prenante('jamais-vu')::text;" | tail -1)"
verifier "…et A obtient bien true sur le sien" "true" "$(AUTH "$A" "select public.call_partie_prenante('$ID')::text;" | tail -1)"

echo "── ⑦ MUTATIONS : le banc doit ROUGIR ─────────────────────────────────"
# ⚠️ On remet EXACTEMENT le défaut : un membre `call:%` inconditionnel, laissé
# À CÔTÉ du membre gardé. C'est la forme la plus trompeuse — la policy contient
# toujours `call_partie_prenante`, et pourtant elle n'interdit plus rien.
Q "drop policy \"passio_rt_recevoir\" on realtime.messages;
   create policy \"passio_rt_recevoir\" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'call:%' and public.call_partie_prenante(substr(realtime.topic(), 6)))
     or realtime.topic() like 'call:%');" >/dev/null
# ⚠️ On compare C à A, jamais à un nombre écrit d'avance : les cas ③ ont ajouté
# des trames, et un banc qui compte en dur mesurerait l'histoire du fichier
# plutôt que la propriété (« C voit ce que A voit »).
vu_a="$(RT "$A" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
verifier "mutation « membre inconditionnel laissé à côté » : C revoit tout ce que voit A" "$vu_a" "$(RT "$C" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)"
verifier "…la migration la referme" "0" "$(RT "$C" "$TOPIC" "select count(*) from realtime.messages where topic = '$TOPIC';" | tail -1)"
# Seconde mutation : l'invitation déplacée vers C ne doit PAS lui ouvrir le canal
# (les identifiants sont figés — la garde est en amont, on vérifie qu'elle tient).
contient "on ne s'invite pas dans un appel en réécrivant la ligne" "figés" "$(AUTH_OK "$A" "update public.call_invites set to_id = '$C' where id = '$ID';")"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
