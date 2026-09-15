#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_blocage_lecture_privee_2026-09-15.sql (MOD-04)
#
# Ce qu'il prouve, sur un PostgreSQL JETABLE, avec les policies de PRODUCTION
# d'avant (celles de la migration d'ouverture du 11/09) comme point de départ :
#   ⓪ AVANT : A (privé) bloque B, mais B reste abonné accepté → B lit encore
#      les posts et stories de A, et `post_is_visible` dit vrai (le défaut)
#   ① la migration s'applique, 5 OK, et se rejoue
#   ② APRÈS : B ne lit plus rien, `post_is_visible` dit faux ; sans blocage un
#      abonné accepté lit ; un non-abonné (C) ne lit pas ; un visiteur sans
#      compte n'a AUCUNE erreur (0 ligne) ; le contenu d'un compte PUBLIC reste
#      lisible (le périmètre est le contenu privé)
#   ③ MUTATION : une policy remise sur `follows` seule fait dire ECHEC au verdict
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_blocage_lecture_privee_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5820 + RANDOM % 120 ))
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

DB=blocage
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # compte PRIVÉ, auteur
B=22222222-2222-2222-2222-222222222222   # abonné accepté de A, puis BLOQUÉ par A
C=33333333-3333-3333-3333-333333333333   # abonné accepté de A, jamais bloqué
D=44444444-4444-4444-4444-444444444444   # sans lien avec A
P=55555555-5555-5555-5555-555555555555   # compte PUBLIC, a bloqué B

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : le minimum de la production, policies du 11/09 comprises ────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -v a="$A" -v b="$B" -v c="$C" -v d="$D" -v p="$P" >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;

create table public.profiles (id text primary key, username text, is_private boolean default false);
create table public.follows (follower_id text, following_id text, status text default 'accepted', primary key (follower_id, following_id));
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.posts (id text primary key, author_id text, content text);
create table public.stories (id text primary key, author_id text, content text);
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.stories enable row level security;
grant select on public.profiles, public.follows, public.blocks, public.posts, public.stories to anon, authenticated;
create policy profils_lecture on public.profiles for select using (true);
create policy follows_lecture on public.follows for select using (status = 'accepted' or follower_id = auth.uid()::text or following_id = auth.uid()::text);
-- Comme en production : chacun ne voit que SES lignes de blocage — c'est
-- pourquoi une policy qui lirait `blocks` au rôle courant ne verrait pas le
-- blocage qui vise l'appelant.
create policy blocks_propres on public.blocks for select using (blocker_id = auth.uid()::text);
-- Les policies de PRODUCTION d'avant (migration d'ouverture, 2026-09-11).
create policy "Lecture respectant les comptes prives" on public.posts for select using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = posts.author_id and pr.is_private = true)
  or exists (select 1 from public.follows f where f.follower_id = (select auth.uid())::text and f.following_id = posts.author_id and f.status = 'accepted'));
create policy "Lecture stories respectant les comptes prives" on public.stories for select using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = stories.author_id and pr.is_private = true)
  or exists (select 1 from public.follows f where f.follower_id = (select auth.uid())::text and f.following_id = stories.author_id and f.status = 'accepted'));
create or replace function public.post_is_visible(pid text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when pid is null then true
    when not exists (select 1 from posts where id = pid) then true
    else exists (select 1 from posts p where p.id = pid and (
      p.author_id = (select auth.uid())::text
      or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
      or exists (select 1 from follows f where f.follower_id = (select auth.uid())::text and f.following_id = p.author_id and f.status = 'accepted'))) end $$;

insert into public.profiles values (:'a', 'A privé', true), (:'b', 'B', false), (:'c', 'C', false), (:'d', 'D', false), (:'p', 'P public', false);
insert into public.follows values (:'b', :'a', 'accepted'), (:'c', :'a', 'accepted'), (:'b', :'p', 'accepted');
insert into public.blocks values (:'a', :'b'), (:'p', :'b');
insert into public.posts values ('post_a', :'a', 'privé de A'), ('post_p', :'p', 'public de P');
insert into public.stories values ('story_a', :'a', 'story de A');
SQL

echo "── ⓪ AVANT : le défaut (B bloqué par A, encore abonné accepté) ─────"
verifier "B lit encore le post de A malgré le blocage (le défaut)" "1" "$(EN "$B" "select count(*) from public.posts where id='post_a';")"
verifier "…et sa story" "1" "$(EN "$B" "select count(*) from public.stories where id='story_a';")"
verifier "…et post_is_visible dit vrai à B" "t" "$(EN "$B" "select public.post_is_visible('post_a');")"

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "le tableau de verdict rend 5 OK et 0 ECHEC" "5/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 5 OK" "5" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ② APRÈS : bloquer ferme l'accès privé, et rien d'autre ne bouge ───"
verifier "B (bloqué, abonnement intact) ne lit plus le post de A" "0" "$(EN "$B" "select count(*) from public.posts where id='post_a';")"
verifier "…ni sa story" "0" "$(EN "$B" "select count(*) from public.stories where id='story_a';")"
verifier "…et post_is_visible dit faux à B" "f" "$(EN "$B" "select public.post_is_visible('post_a');")"
verifier "C (abonné accepté, non bloqué) lit toujours" "1" "$(EN "$C" "select count(*) from public.posts where id='post_a';")"
verifier "…post_is_visible vrai pour C" "t" "$(EN "$C" "select public.post_is_visible('post_a');")"
verifier "D (sans lien) ne lit pas" "0" "$(EN "$D" "select count(*) from public.posts where id='post_a';")"
verifier "A lit son propre contenu" "1" "$(EN "$A" "select count(*) from public.posts where id='post_a';")"
verifier "le contenu d'un compte PUBLIC reste lisible par le bloqué (périmètre : le privé)" "1" "$(EN "$B" "select count(*) from public.posts where id='post_p';")"
verifier "un visiteur sans compte : aucune erreur, 0 ligne privée, 1 publique" "0|1" \
  "$(ANON "select count(*) from public.posts where id='post_a';")|$(ANON "select count(*) from public.posts where id='post_p';")"
verifier "l'aide ne répond que sur l'appelant : FALSE sans compte" "f" "$(ANON "select public.abonne_accepte_non_bloque('$A');")"
verifier "le sens inverse aussi : B bloque P → B ne lit plus le privé de P s'il l'était (symétrie de blocks)" "f" \
  "$(Q "update public.profiles set is_private = true where id='$P'; delete from public.blocks where blocker_id='$P'; insert into public.blocks values ('$B','$P');" >/dev/null; EN "$B" "select public.abonne_accepte_non_bloque('$P');")"

echo "── ③ MUTATION : une policy remise sur follows seule ─────────────────"
Q "alter policy \"Lecture respectant les comptes prives\" on public.posts using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = posts.author_id and pr.is_private = true)
  or exists (select 1 from public.follows f where f.follower_id = (select auth.uid())::text and f.following_id = posts.author_id and f.status = 'accepted'))" >/dev/null
verifier "prémisse : B relit le post de A" "1" "$(EN "$B" "select count(*) from public.posts where id='post_a';")"
verifier "…et le verdict ③ dirait ECHEC" "ECHEC" \
  "$(Q "select case when exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='Lecture respectant les comptes prives' and qual like '%abonne_accepte_non_bloque%' and qual not like '%accepted%') then 'OK' else 'ECHEC' end")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "rejeu après mutation : B ne lit plus" "0" "$(EN "$B" "select count(*) from public.posts where id='post_a';")"

echo
echo "RÉSULTAT : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
