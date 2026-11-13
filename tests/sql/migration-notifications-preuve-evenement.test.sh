#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_notifications_preuve_evenement_2026-11-13.sql (SRV-02, reste)
#
# Socle = `notifications` avec sa policy d'INSERT de production
# (`from_id = auth.uid()`) et son déclencheur d'origine, les tables métier aux
# colonnes relevées en production le 13/11 (post_likes, post_comments,
# comment_interactions, events, event_attendees, event_reactions,
# event_comments, video_lives, follows), puis la migration du 12/11 (texte
# serveur) APPLIQUÉE TELLE QUELLE. On mesure D'ABORD le défaut (un « a aimé ton
# post » sans j'aime est accepté), on éprouve trois MUTATIONS de la migration
# (chacune doit être refusée par son propre verdict), on applique, puis on
# mesure de l'extérieur, sous le rôle `authenticated`.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_notifications_preuve_evenement_2026-11-13.sql"
TEXTE="$RACINE/migrations/migration_notifications_texte_serveur_2026-11-12.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] && [ -f "$TEXTE" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 7300 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
TMPM="$(mktemp -d)"
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE" "$TMPM"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; exit 1; }

DB=srv02b
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1 || true; }
_v()   { if printf '%s' "$1" | grep -qi "error"; then echo REFUSE; else echo OK; fi; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa   # autrice de la publication, organisatrice
B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb   # a vraiment aimé
D=dddddddd-dddd-4ddd-8ddd-dddddddddddd   # n'a rien fait

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as \$fn\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$fn\$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;

create table public.profiles (id text primary key, username text not null, is_private boolean default false);
create table public.posts (id text primary key, author_id text, content text, created_at timestamp default now());
create table public.post_comments (id text primary key, post_id text, author_id text, content text, created_at timestamp default now());
create table public.post_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
create table public.comment_interactions (id text primary key, comment_id text not null, post_id text, user_id text not null, kind text not null, payload text, created_at timestamptz default now());
create table public.events (id text primary key, organizer_id text, author_id text, title text, status text default 'active', co_organizers jsonb, created_at timestamp default now());
create table public.event_attendees (event_id text not null references public.events(id) on delete cascade, user_id text not null, rsvp text, rating smallint, rated_at timestamptz, created_at timestamptz default now(), primary key (event_id, user_id));
create table public.event_reactions (event_id text not null references public.events(id) on delete cascade, user_id text not null, emoji text not null, created_at timestamptz default now());
create table public.event_comments (id text primary key, event_id text not null references public.events(id) on delete cascade, author_id text not null, text text, created_at timestamptz default now());
create table public.video_lives (id text primary key, author_id text not null, title text, status text, started_at timestamptz);
create table public.follows (follower_id text not null, following_id text not null, status text default 'accepted', created_at timestamptz default now(), primary key (follower_id, following_id));
create table public.conversations (id text primary key, is_group boolean default false, created_by text, group_name text);
create table public.conv_members (conv_id text, user_id text, primary key (conv_id, user_id));
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text, seen boolean default false,
  created_at timestamptz default now(), origine text, push_le timestamptz);
alter table public.notifications enable row level security;
create policy notifications_insert_own_author on public.notifications for insert to public with check (from_id = (select auth.uid())::text);
create policy notifications_select_own on public.notifications for select to public using (user_id = (select auth.uid())::text);
-- Le déclencheur d'origine de PRODUCTION (relevé le 13/11), sans son plafond de débit.
create or replace function public.notifications_origine() returns trigger language plpgsql security definer set search_path = '' as \$fn\$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  if new.origine = 'client' and auth.uid() is not null then new.push_le := null; end if;
  return new;
end \$fn\$;
create trigger trg_notifications_origine before insert on public.notifications for each row execute function public.notifications_origine();

insert into public.profiles (id, username) values ('$A', 'Alice'), ('$B', 'Bruno'), ('$D', 'Dan');
insert into public.posts (id, author_id, content) values ('p1', '$A', 'ma publication');
insert into public.post_likes values ('p1', '$B');
insert into public.events (id, organizer_id, author_id, title) values ('e1', '$A', '$A', 'Rando');
insert into public.event_attendees (event_id, user_id, rsvp) values ('e1', '$B', 'going');
SQL

echo "── ⓪ LE SOCLE : la migration du 12/11 (texte serveur), telle quelle ──"
sortie="$(APPLIQUER "$TEXTE")" || { echo "  ❌ la migration du 12/11 a échoué sur le socle :"; echo "$sortie" | tail -8; exit 1; }
verifier "12/11 appliquée, verdict sans ECHEC" "0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC' || true)"

echo "── ① LE DÉFAUT, MESURÉ AVANT ──────────────────────────────────────────"
verifier "« a aimé ton post » sans j'aime, vers l'autrice : ACCEPTÉ" "OK" "$(_v "$(AUTH "$D" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_faux', '$A', 'like', '$D', 'p1', 'x a aimé ton post');")")"
verifier "« a rejoint » sans inscription : ACCEPTÉ" "OK" "$(_v "$(AUTH "$D" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_faux2', '$A', 'event_join', '$D', 'e1', 'x a rejoint ton événement');")")"
Q "delete from public.notifications;" >/dev/null

echo "── ② MUTATIONS : chacune doit être REFUSÉE par le verdict de la migration ──"
muter() {   # $1 = libellé, $2 = texte à remplacer, $3 = remplacement
  local f="$TMPM/m.sql"
  python3 - "$MIGRATION" "$f" "$2" "$3" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
assert s.count(sys.argv[3]) >= 1, "motif de mutation introuvable : " + sys.argv[3]
open(sys.argv[2], "w", encoding="utf-8").write(s.replace(sys.argv[3], sys.argv[4], 1))
PY
  if APPLIQUER "$f" >/dev/null 2>&1; then verifier "mutation « $1 » : refusée" "refusée" "APPLIQUÉE"; else verifier "mutation « $1 » : refusée" "refusée" "refusée"; fi
  verifier "…et rien n'en reste" "0" "$(Q "select count(*)::int from pg_trigger where tgname = 'trg_notifications_preuve';")"
}
muter "un genre qu'aucun client n'écrit passe" "ok := false;   -- reaction" "ok := true;   -- reaction"
muter "un j'aime vaut pour n'importe quel destinataire" "where l.post_id = ref and l.user_id = de and p.author_id = a)" "where l.post_id = ref and l.user_id = de)"
muter "l'annulation n'exige plus l'état annulé" "where e.id = ref and e.status = 'cancelled');" "where e.id = ref);"

echo "── ③ APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(APPLIQUER "$MIGRATION")" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -10; exit 1; }
verifier "verdict : aucun ECHEC" "0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC' || true)"
verifier "verdict : 31 contrôles OK" "31" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
APPLIQUER "$MIGRATION" >/dev/null 2>&1 && verifier "rejeu sans erreur" "oui" "oui" || verifier "rejeu sans erreur" "oui" "non"
verifier "un seul déclencheur de preuve" "1" "$(Q "select count(*)::int from pg_trigger where tgname = 'trg_notifications_preuve';")"

echo "── ④ MESURÉ DE L'EXTÉRIEUR, sous authenticated ──────────────────────"
verifier "« a aimé ton post » sans j'aime : REFUSÉ" "REFUSE" "$(_v "$(AUTH "$D" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n1', '$A', 'like', '$D', 'p1', 'x a aimé ton post');")")"
verifier "…refusé par la preuve de l'événement, pas par une autre garde" "1" "$(AUTH "$D" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n1', '$A', 'like', '$D', 'p1', 'x');" | grep -c 'événement métier' || true)"
verifier "le VRAI j'aime de Bruno notifie Alice" "OK" "$(_v "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n2', '$A', 'like', '$B', 'p1', 'x a aimé ton post');")")"
verifier "…sous le nom serveur (12/11 toujours en place)" "Bruno a aimé ton post" "$(Q "select content from public.notifications where id = 'n2';")"
verifier "le vrai j'aime de Bruno ne notifie pas Dan (pas l'auteur)" "REFUSE" "$(_v "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n3', '$D', 'like', '$B', 'p1', 'x');")")"
verifier "« a rejoint » sans inscription : REFUSÉ" "REFUSE" "$(_v "$(AUTH "$D" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n4', '$A', 'event_join', '$D', 'e1', 'x');")")"
verifier "l'inscription RÉELLE de Bruno notifie Alice" "OK" "$(_v "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n5', '$A', 'event_join', '$B', 'e1', 'x a rejoint ton événement');")")"
Q "delete from public.post_likes where user_id = '$B';" >/dev/null
verifier "j'aime RETIRÉ avant la notification : REFUSÉ (la notification ne précède pas son fait)" "REFUSE" "$(_v "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n6', '$A', 'like', '$B', 'p1', 'x');")")"
verifier "une ligne d'origine SERVEUR n'est pas soumise à la preuve" "OK" "$(_v "$(Q "begin; set local passio.notification_serveur = '1'; insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n7', '$A', 'like', '$D', 'zz', 'serveur'); commit;")")"
verifier "le déclencheur n'est pas exécutable par un client" "f" "$(Q "select has_function_privilege('authenticated', 'public.notifications_preuve_evenement()', 'execute');")"

echo
echo "bilan : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
