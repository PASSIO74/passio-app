#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_notifications_identifiants_reserves_2026-11-03.sql (R5)
#
# PostgreSQL jetable, socle = `notifications` avec la policy INSERT de production
# (`notifications_insert_own_author`, qui appelle `identifiant_reserve_au_serveur`)
# et le trigger `follows_notifier` recopié. On MESURE D'ABORD le squat : un compte
# pré-insère l'identifiant déterministe `n_fw_<acteur8>_<cible8>` d'un futur
# abonnement, le trigger serveur réécrit SA ligne. On applique, on rejoue :
# les cinq préfixes serveur sont refusés au client (42501), les identifiants
# client (`n_x…`, `n_msg_…`) passent, et le trigger serveur écrit toujours.
#
#   bash tests/sql/migration-notifications-identifiants-reserves.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_notifications_identifiants_reserves_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6330 + RANDOM % 120 ))
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

DB=identifiants
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
INSERE() { AUTH "$1" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('$2', '$3', 'like', '$1', 'x', 'client') returning 1;"; }

A=33333333-3333-3333-3333-333333333333   # le vrai abonné
V=44444444-4444-4444-4444-444444444444   # la cible (victime du squat)
S=55555555-5555-5555-5555-555555555555   # le squatteur

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

create table public.profiles (id text primary key, username text);
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now());
create table public.follows (follower_id text not null, following_id text not null, status text not null default 'accepted',
  primary key (follower_id, following_id));
alter table public.notifications enable row level security;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert on public.follows to authenticated;

-- Production (canal ①, 2026-11-03) : la fonction d'AVANT ne réserve que n_m_.
create function public.identifiant_reserve_au_serveur(p_id text) returns boolean
  language sql immutable set search_path = '' as $f$ select p_id like 'n\_m\_%' $f$;
create function public.genres_reserves_au_serveur(p_kind text) returns boolean
  language sql immutable set search_path = '' as $f$ select p_kind in ('mention', 'follow', 'follow_request', 'follow_accept') $f$;
create function public.is_blocked_with(p_other text) returns boolean language sql stable as $f$ select false $f$;
create function public.suppression_de_mon_compte() returns boolean language sql stable as $f$ select false $f$;
create policy notifications_insert_own_author on public.notifications for insert to authenticated
  with check (from_id = (select auth.uid())::text and not public.is_blocked_with(user_id)
    and not public.suppression_de_mon_compte() and not public.genres_reserves_au_serveur(kind)
    and not public.identifiant_reserve_au_serveur(id));
create policy "Lecture propre" on public.notifications for select using (user_id = (select auth.uid())::text);

-- follows_notifier, recopié de la production (SECURITY DEFINER : il écrit malgré la RLS).
create function public.follows_notifier() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $t$
declare acteur text; cible text; genre text; texte text; ident text; nom text;
begin
  if TG_OP = 'INSERT' then
    if new.follower_id = new.following_id then return new; end if;
    acteur := new.follower_id; cible := new.following_id;
    if new.status = 'pending' then
      genre := 'follow_request'; texte := 'souhaite s''abonner à ton compte privé';
      ident := 'n_fr_' || left(acteur, 8) || '_' || left(cible, 8);
    else
      genre := 'follow'; texte := 'a commencé à te suivre';
      ident := 'n_fw_' || left(acteur, 8) || '_' || left(cible, 8);
    end if;
  else
    return new;
  end if;
  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = acteur;
  insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
  values (ident, cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now())
  on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now();
  return new;
end $t$;
create trigger trg_follows_notifier after insert on public.follows for each row execute function public.follows_notifier();
insert into public.profiles values ('33333333-3333-3333-3333-333333333333', 'alice'), ('55555555-5555-5555-5555-555555555555', 'squatteur');
SQL

IDENT="n_fw_$(echo "$A" | cut -c1-8)_$(echo "$V" | cut -c1-8)"

echo "── ⓪ AVANT : le squat mesuré ────────────────────────────────────────"
verifier "le squatteur pré-insère l'identifiant déterministe de l'abonnement d'A → V" "1" "$(INSERE "$S" "$IDENT" "$V")"
Q "insert into public.follows (follower_id, following_id, status) values ('$A', '$V', 'accepted');" >/dev/null
verifier "le trigger réécrit la ligne du squatteur : V lit « squatteur » comme expéditeur du vrai abonnement d'alice" "$S|alice a commencé à te suivre" \
  "$(Q "select from_id || '|' || content from public.notifications where id = '$IDENT';")"
Q "delete from public.notifications; delete from public.follows;" >/dev/null

echo "── ① APPLICATION ───────────────────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 3 OK et 0 ECHEC" "3/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejouée : même verdict (idempotente)" "3/0" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie2" | grep -cE '\|\s*ECHEC\s*$' || true)"

echo "── ② LES PRÉFIXES SERVEUR SONT REFUSÉS AU CLIENT ──────────────────"
for prefixe in n_fw_ n_fr_ n_fa_ n_pa_ n_m_; do
  contient "un client ne peut pas insérer ${prefixe}… (42501)" "row-level security" "$(INSERE "$S" "${prefixe}abc_def" "$V")"
done
verifier "les identifiants CLIENT passent : n_x<aléa>" "1" "$(INSERE "$S" "n_xk3j2h1g9abc" "$V")"
verifier "…et n_msg_<id>_<8> (la notification de message côté client : n_msg_ n'est pas n_m_)" "1" "$(INSERE "$S" "n_msg_xk3j2h1g9abc_44444444" "$V")"
verifier "…et un identifiant qui commence par n_m sans soulignement (n_mabc)" "1" "$(INSERE "$S" "n_mabc" "$V")"

echo "── ③ LE SERVEUR ÉCRIT TOUJOURS, ET PLUS PERSONNE NE PEUT L'ATTENDRE ──"
Q "insert into public.follows (follower_id, following_id, status) values ('$A', '$V', 'accepted');" >/dev/null
verifier "l'abonnement d'A écrit sa notification n_fw_ chez V, au nom d'A" "$A|alice a commencé à te suivre" \
  "$(Q "select from_id || '|' || content from public.notifications where id = '$IDENT';")"
verifier "V lit cette notification (policy de lecture intacte)" "1" "$(AUTH "$V" "select count(*) from public.notifications where id = '$IDENT';")"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
