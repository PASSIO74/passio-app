#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC #136 — Trust & Safety serveur.
# PostgreSQL jetable, comptes distincts, prémisses positives et mutations.
# Aucune base réelle n'est touchée.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_ts_serveur_age_blocage.sql"
SOCLE="$RACINE/tests/sql/socle-prod.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "ERREUR: binaires PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "ERREUR: migration introuvable"; exit 1; }

PORT=$((5400 + RANDOM % 150))
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
[ "$demarre" -eq 1 ] || { echo "ERREUR: PostgreSQL de test indisponible"; exit 1; }

Q() { psql -h "$BASE" -p "$PORT" -U postgres -d ts -tA -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
AS() { psql -h "$BASE" -p "$PORT" -U postgres -d ts -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
C=33333333-3333-3333-3333-333333333333
D=44444444-4444-4444-4444-444444444444
X=99999999-9999-9999-9999-999999999999

preparer() {
  psql -h "$BASE" -p "$PORT" -U postgres -tA -q -c "drop database if exists ts" >/dev/null 2>&1
  psql -h "$BASE" -p "$PORT" -U postgres -tA -q -c "drop role if exists anon; drop role if exists authenticated" >/dev/null 2>&1
  psql -h "$BASE" -p "$PORT" -U postgres -tA -q -c "create database ts" >/dev/null 2>&1
  Q -f "$SOCLE" >/dev/null
  Q -f "$MIGRATION" >/dev/null
  [ -n "${1:-}" ] && Q -c "$1" >/dev/null
  Q -c "insert into public.user_safety(user_id,majority_at) values
    ('$A','2010-01-01'),('$B','2011-01-01'),('$C','2030-01-01'),('$D','2012-01-01')
    on conflict (user_id) do update set majority_at=excluded.majority_at;" >/dev/null
  Q -c "insert into public.blocks(blocker_id,blocked_id) values ('$A','$B') on conflict do nothing;" >/dev/null
}

OK=0; KO=0
verifier() {
  if [ "$3" = "$2" ]; then OK=$((OK+1)); printf '  OK  %s\n' "$1"
  else KO=$((KO+1)); printf '  KO  %s -- attendu <%s>, obtenu <%s>\n' "$1" "$2" "$3"; fi
}

commande() {
  local sortie; sortie="$(AS "$1" "$2")"
  case "$sortie" in
    *"violates row-level security"*|*"permission denied"*) echo refuse ;;
    *"connection to server"*|*"could not connect"*) echo panne ;;
    *ERROR*|*error:*) echo erreur ;;
    *) echo accepte ;;
  esac
}

conv() {
  local creator="$1" id="$2"
  [ "$(commande "$creator" "insert into public.conversations(id,created_by) values ('$id','$creator');")" = accepte ] || return 1
  [ "$(commande "$creator" "insert into public.conv_members(conv_id,user_id) values ('$id','$creator');")" = accepte ] || return 1
}

echo "=== #136 banc T&S serveur ==="
preparer

echo "-- Premisses"
verifier "conversation creee uniquement par son auteur" accepte "$(commande "$D" "insert into public.conversations(id,created_by) values ('prem','$D');")"
verifier "usurpation created_by refusee" refuse "$(commande "$C" "insert into public.conversations(id,created_by) values ('fake','$D');")"
conv "$D" cvp || { echo "KO: le createur ne peut pas initialiser sa membership"; exit 1; }
verifier "createur ajoute un tiers non bloque" accepte "$(commande "$D" "insert into public.conv_members values ('cvp','$A');")"
verifier "membre peut ecrire dans sa conversation" accepte "$(commande "$D" "insert into public.conv_messages(id,conv_id,from_id,text) values ('pm1','cvp','$D','ok');")"
verifier "deux majeurs non bloques: IRL autorise" t "$(AS "$A" "select public.irl_interaction_allowed('$D');")"
verifier "chacun lit seulement sa ligne age" 1 "$(AS "$A" "select count(*) from public.user_safety;")"

echo "-- Age prive et oppose"
verifier "mineur vers majeur refuse" f "$(AS "$C" "select public.irl_interaction_allowed('$A');")"
verifier "majeur vers mineur refuse" f "$(AS "$A" "select public.irl_interaction_allowed('$C');")"
verifier "age inconnu fail-closed" f "$(AS "$A" "select public.irl_interaction_allowed('$X');")"
verifier "age autre compte illisible" 0 "$(AS "$A" "select count(*) from public.user_safety where user_id='$C';")"
verifier "INSERT direct age forge refuse" refuse "$(commande "$X" "insert into public.user_safety(user_id,majority_at) values ('$X','2000-01-01');")"
verifier "UPDATE direct age permissif refuse" refuse "$(commande "$C" "update public.user_safety set majority_at='2010-01-01' where user_id='$C';")"
verifier "RPC premiere declaration mineure fail-closed" f "$(AS "$X" "select public.declare_birth_year(extract(year from current_date)::int - 10);")"
stored_before="$(AS "$X" "select majority_at from public.user_safety where user_id='$X';")"
AS "$X" "select public.declare_birth_year(2000);" >/dev/null
stored_after="$(AS "$X" "select majority_at from public.user_safety where user_id='$X';")"
verifier "RPC ne permet pas de se vieillir apres declaration" "$stored_before" "$stored_after"

echo "-- Blocage bidirectionnel"
verifier "bloqueur voit relation" t "$(AS "$A" "select public.is_blocked_with('$B');")"
verifier "bloque voit relation" t "$(AS "$B" "select public.is_blocked_with('$A');")"
verifier "bloque ne lit pas ligne brute" 0 "$(AS "$B" "select count(*) from public.blocks;")"
verifier "tiers ne sonde pas paire A-B" f "$(AS "$C" "select public.is_blocked_with('$A');")"
verifier "absence blocage = faux" f "$(AS "$A" "select public.is_blocked_with('$D');")"

echo "-- Conversation non forcable"
conv "$B" cv1 || exit 1
verifier "bloque ne peut ajouter bloqueur" refuse "$(commande "$B" "insert into public.conv_members values ('cv1','$A');")"
conv "$A" cv2 || exit 1
verifier "bloqueur ne peut ajouter bloque" refuse "$(commande "$A" "insert into public.conv_members values ('cv2','$B');")"
verifier "membre legitime non bloque accepte" accepte "$(commande "$A" "insert into public.conv_members values ('cv2','$D');")"
conv "$D" private_ab || exit 1
verifier "tiers ne peut pas self-join un conv_id connu" refuse "$(commande "$C" "insert into public.conv_members values ('private_ab','$C');")"
verifier "tiers ne peut pas injecter message dans conv_id connu" refuse "$(commande "$C" "insert into public.conv_messages(id,conv_id,from_id,text) values ('evil','private_ab','$C','intrusion');")"
verifier "tiers reste incapable de lire conversation" 0 "$(AS "$C" "select count(*) from public.conversations where id='private_ab';")"
Q -c "insert into public.conv_messages(id,conv_id,from_id,text) values ('m1','private_ab','$D','secret');" >/dev/null
verifier "tiers reste incapable de lire message" 0 "$(AS "$C" "select count(*) from public.conv_messages where conv_id='private_ab';")"

verifier "creation groupe legitime" accepte "$(commande "$A" "insert into public.conversations(id,is_group,created_by) values ('grp1',true,'$A');")"
verifier "createur rejoint son groupe" accepte "$(commande "$A" "insert into public.conv_members values ('grp1','$A');")"
verifier "membre groupe non bloque accepte" accepte "$(commande "$A" "insert into public.conv_members values ('grp1','$D');")"
verifier "membre groupe bloque refuse" refuse "$(commande "$A" "insert into public.conv_members values ('grp1','$B');")"

echo "-- Mutations: chaque garde retiree doit exposer le defaut"
sonde_forge_age() { commande "$X" "insert into public.user_safety(user_id,majority_at) values ('$X','2000-01-01');"; }
sonde_update_age() { commande "$C" "update public.user_safety set majority_at='2010-01-01' where user_id='$C';"; }
sonde_self_join() { conv "$D" mutjoin >/dev/null; commande "$C" "insert into public.conv_members values ('mutjoin','$C');"; }
sonde_message_inject() { conv "$D" mutmsg >/dev/null; commande "$C" "insert into public.conv_messages(id,conv_id,from_id,text) values ('mutm','mutmsg','$C','x');"; }
sonde_blocage_conv() { conv "$B" mutblock >/dev/null; commande "$B" "insert into public.conv_members values ('mutblock','$A');"; }
sonde_blocage_sens() { AS "$B" "select public.is_blocked_with('$A');"; }
sonde_age_inconnu() { AS "$A" "select public.irl_interaction_allowed('$X');"; }

mutation() {
  preparer "$2"
  local obtenu; obtenu="$("$3")"
  if [ "$obtenu" = "$4" ]; then OK=$((OK+1)); printf '  OK  mutation %s detectee\n' "$1"
  else KO=$((KO+1)); printf '  KO  mutation %s survit -- <%s>\n' "$1" "$obtenu"; fi
}

mutation "INSERT direct user_safety" \
  "grant insert on public.user_safety to authenticated; create policy mut_age_insert on public.user_safety for insert with check (user_id=(auth.uid())::text);" \
  sonde_forge_age accepte
mutation "UPDATE direct user_safety" \
  "grant update on public.user_safety to authenticated; create policy mut_age_update on public.user_safety for update using (user_id=(auth.uid())::text) with check (user_id=(auth.uid())::text);" \
  sonde_update_age accepte
mutation "self-join conv_members" \
  "drop policy conv_members_insert_creator on public.conv_members; create policy conv_members_insert_creator on public.conv_members for insert with check (user_id=(auth.uid())::text or public.is_conversation_creator(conv_id));" \
  sonde_self_join accepte
mutation "garde membership message retiree" \
  "drop policy conv_messages_insert_member on public.conv_messages; create policy conv_messages_insert_member on public.conv_messages for insert with check (from_id=(auth.uid())::text);" \
  sonde_message_inject accepte
mutation "garde blocage conv_members retiree" \
  "drop policy conv_members_insert_creator on public.conv_members; create policy conv_members_insert_creator on public.conv_members for insert with check (public.is_conversation_creator(conv_id));" \
  sonde_blocage_conv accepte
mutation "blocage rendu unidirectionnel" \
  "create or replace function public.is_blocked_with(_other text) returns boolean language sql security definer stable set search_path='' as \$f\$ select exists(select 1 from public.blocks b where b.blocker_id=(auth.uid())::text and b.blocked_id=_other) \$f\$;" \
  sonde_blocage_sens f
mutation "age inconnu fail-open" \
  "create or replace function public.irl_interaction_allowed(_other text) returns boolean language sql security definer stable set search_path='' as \$f\$ select not public.is_blocked_with(_other) \$f\$;" \
  sonde_age_inconnu t

echo "=== $OK OK / $KO KO ==="
[ "$KO" -eq 0 ] || exit 1
