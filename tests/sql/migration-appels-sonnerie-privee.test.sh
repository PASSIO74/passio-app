#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_appels_sonnerie_privee_2026-09-14.sql
#
# Même méthode que les bancs de sécurité de septembre : un PostgreSQL jetable,
# le socle Realtime tel que la migration d'ouverture (2026-09-11) l'a laissé en
# production, on MESURE D'ABORD le défaut (un tiers lit la sonnerie d'un autre
# compte), on applique, on REJOUE (idempotence), on vérifie les deux sens (ce
# qui doit être refusé l'est, ce qui doit encore passer passe), puis on remet
# l'ancienne policy et on exige que le banc ET le tableau de verdict rougissent.
#
# Ce que ce banc ne prouve PAS : que le client émet bien en REST sans
# s'abonner — c'est `tests/e2e/appels-sonnerie-privee.spec.js` qui le mesure.
# Les deux ensemble disent que la migration peut être collée après le client.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_appels_sonnerie_privee_2026-09-14.sql"
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

DB=appels
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

# ── SOCLE : l'état Realtime laissé par la migration d'ouverture (2026-09-11) ──
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
     -v a="$A" -v b="$B" -v c="$C" -v d="$D" >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.blocks (blocker_id text not null, blocked_id text not null, primary key (blocker_id, blocked_id));
create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));
create function public.is_conv_member(_conv_id text, _uid text)
  returns boolean language sql stable security definer set search_path = '' as
  $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
grant execute on function public.is_conv_member(text, text) to authenticated;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as
  $fn$ select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
       else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other)
                    or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end $fn$;
revoke execute on function public.is_blocked_with(text) from public;
grant execute on function public.is_blocked_with(text) to authenticated;

create schema realtime;
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text, extension text, payload jsonb, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $fn$ select current_setting('realtime.topic', true) $fn$;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;

-- Les trois policies de l'ouverture, TELLES QUELLES (partie ⑤ de la migration du 2026-09-11).
create policy "passio_rt_recevoir" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%' and not public.is_blocked_with(substr(realtime.topic(), 6)))
  or realtime.topic() like 'call:%'
  or realtime.topic() like 'vlive:%'
  or realtime.topic() = 'realtime:db'
  or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
  or (realtime.topic() like 'conv_specific:%' and public.is_conv_member(substr(realtime.topic(), 15), (select auth.uid())::text))
);
create policy "passio_rt_recevoir_visiteur" on realtime.messages for select to anon using (realtime.topic() = 'realtime:db');
create policy "passio_rt_emettre" on realtime.messages for insert to authenticated with check (
     (realtime.topic() like 'ring:%' and not public.is_blocked_with(substr(realtime.topic(), 6)))
  or realtime.topic() like 'call:%'
  or realtime.topic() like 'vlive:%'
  or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
);

insert into public.blocks values (:'b', :'c');                       -- B a bloqué C
insert into public.conv_members values ('conv_ab', :'a'), ('conv_ab', :'b');
insert into realtime.messages (topic, extension) values
  ('ring:' || :'a', 'broadcast'), ('ring:' || :'b', 'broadcast'), ('call:8f1c', 'broadcast'),
  ('vlive:L1', 'broadcast'), ('typing:conv_ab', 'broadcast'), ('conv:conv_ab', 'broadcast'),
  ('conv_specific:conv_ab', 'postgres_changes'), ('realtime:db', 'postgres_changes');
SQL

# Dans ce banc `realtime.topic()` est un réglage de SESSION : la policy s'évalue
# sur TOUTES les lignes avec ce topic — on compte donc, comme l'ouverture.
N="$(Q "select count(*) from realtime.messages;")"

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : C (tiers) lit la sonnerie de A — qui appelle A est visible de tout compte" "$N" "$(RT "$C" "ring:$A" "select count(*) from realtime.messages;")"
verifier "avant : D lit la sonnerie de B" "$N" "$(RT "$D" "ring:$B" "select count(*) from realtime.messages;")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "le tableau de verdict rend 4 OK et 0 ECHEC" "4/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 4 OK" "4" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ RÉCEPTION : sa sonnerie et rien d'autre ─────────────────────────"
verifier "A reçoit sur SA sonnerie ring:A" "$N" "$(RT "$A" "ring:$A" "select count(*) from realtime.messages;")"
verifier "C ne reçoit RIEN sur ring:A" "0" "$(RT "$C" "ring:$A" "select count(*) from realtime.messages;")"
verifier "D ne reçoit RIEN sur ring:B" "0" "$(RT "$D" "ring:$B" "select count(*) from realtime.messages;")"
verifier "…ni A sur ring:B : l'appelant n'a plus besoin de lire la sonnerie du pair" "0" "$(RT "$A" "ring:$B" "select count(*) from realtime.messages;")"
verifier "un visiteur ne lit aucune sonnerie" "0" "$(ANONRT "ring:$A" "select count(*) from realtime.messages;")"

echo "── ④ LE RESTE DE LA RÉCEPTION EST INTACT ─────────────────────────────"
verifier "call:<id> reste lisible par un compte (identifiant aléatoire)" "$N" "$(RT "$D" "call:8f1c" "select count(*) from realtime.messages;")"
verifier "vlive:<id> reste lisible par un compte" "$N" "$(RT "$D" "vlive:L1" "select count(*) from realtime.messages;")"
verifier "realtime:db reste ouvert à un compte" "$N" "$(RT "$D" "realtime:db" "select count(*) from realtime.messages;")"
verifier "realtime:db reste ouvert à un visiteur" "$N" "$(ANONRT "realtime:db" "select count(*) from realtime.messages;")"
verifier "typing:conv_ab : membre A reçoit" "$N" "$(RT "$A" "typing:conv_ab" "select count(*) from realtime.messages;")"
verifier "typing:conv_ab : non-membre D ne reçoit rien" "0" "$(RT "$D" "typing:conv_ab" "select count(*) from realtime.messages;")"
verifier "conv_specific:conv_ab : membre B reçoit" "$N" "$(RT "$B" "conv_specific:conv_ab" "select count(*) from realtime.messages;")"
verifier "conv_specific:conv_ab : non-membre C ne reçoit rien" "0" "$(RT "$C" "conv_specific:conv_ab" "select count(*) from realtime.messages;")"

echo "── ⑤ ÉMISSION INCHANGÉE : sonner exige un compte non bloqué ──────────"
verifier "C sonne A (aucun blocage) : accepté" "OK" "$(RT_OK "$C" "ring:$A" "insert into realtime.messages (topic, extension) values ('ring:$A', 'broadcast');")"
contient "C, bloqué par B, ne peut pas sonner B" "row-level security" "$(RT "$C" "ring:$B" "insert into realtime.messages (topic, extension) values ('ring:$B', 'broadcast');")"
contient "B ne peut pas sonner C non plus (les deux sens)" "row-level security" "$(RT "$B" "ring:$C" "insert into realtime.messages (topic, extension) values ('ring:$C', 'broadcast');")"
contient "un visiteur ne sonne personne" "row-level security" "$(ANONRT "ring:$A" "insert into realtime.messages (topic, extension) values ('ring:$A', 'broadcast');")"

echo "── ⑥ MUTATION : l'ancienne policy remise → le banc ET le verdict rougissent ──"
Q "drop policy \"passio_rt_recevoir\" on realtime.messages;
   create policy \"passio_rt_recevoir\" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%' and not public.is_blocked_with(substr(realtime.topic(), 6)))
     or realtime.topic() like 'call:%' or realtime.topic() = 'realtime:db');" >/dev/null
m="$(RT "$C" "ring:$A" "select count(*) from realtime.messages;")"
if [ "$m" != "0" ]; then echo "  ✅ mutation : avec l'ancienne policy, C lit de nouveau la sonnerie de A — le contrôle est réel"; ok=$((ok+1)); else echo "  ❌ mutation : C ne lit toujours rien ($m)"; ko=$((ko+1)); fi
# Le tableau de verdict du fichier doit dire ECHEC sur la ligne ② dans cet état :
# on ne rejoue que sa requête, jamais le fichier entier (qui réparerait).
verdict_mut="$(Q "select coalesce((select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'passio_rt_recevoir'), '') like '%substr(realtime.topic(), 6) = %auth.uid()%';")"
verifier "verdict ② : ECHEC sur l'ancienne policy (il mesure bien la restriction)" "f" "$verdict_mut"
# ⑦ la migration REJOUÉE répare la mutation : c'est ce qui rend une relance sûre.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "rejeu après mutation : C ne lit plus la sonnerie de A" "0" "$(RT "$C" "ring:$A" "select count(*) from realtime.messages;")"

echo
echo "RÉSULTAT : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
