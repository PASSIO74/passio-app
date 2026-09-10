#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_fuites_2026-09-10.sql
#
# Même méthode que les trois bancs de sécurité du 2026-09-08 : on reconstitue
# l'état RÉEL de la production sur un PostgreSQL jetable, on MESURE D'ABORD le
# défaut (sinon on ne prouve pas qu'on l'a refermé), on applique la migration,
# on vérifie, puis on éprouve les MUTATIONS — c'est-à-dire qu'on retire chaque
# garde une par une et qu'on exige que le banc rougisse.
#
# ⚠️ CE BANC EXISTE PARCE QUE SON ABSENCE A LAISSÉ PASSER UN DÉFAUT. La première
# version de la migration posait `revoke insert (auth_uid) … from anon` — or
# PostgreSQL ne soustrait pas un privilège de COLONNE à un privilège de TABLE :
# le `revoke` réussissait sans le moindre effet, et un client pouvait continuer à
# se donner une identité « vérifiée ». Le piège est déjà documenté dans CLAUDE.md
# pour `migration_irl_donnees_privees.sql`. La mutation ③ le rejoue.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_fuites_2026-09-10.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5810 + RANDOM % 120 ))
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

DB=fuites
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

# ⚠️ `-c` EST OBLIGATOIRE : sans lui, psql prend la requête pour un nom de base
# et rend une chaîne VIDE, sans erreur — donc chaque `verifier` échouait en
# annonçant « obtenu : (vide) », ce qui ressemble à un défaut du produit et n'est
# qu'un défaut du banc. Un banc qui se trompe sur lui-même ne prouve rien.
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel : séparés,
# le rôle retombe au défaut SANS ERREUR et l'audit rend un faux vert (ADR-012).
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role anon; $1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222

ok=0; ko=0
verifier() { # libellé, attendu, obtenu
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi
}
contient() { # libellé, motif, texte
  if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi
}

# ── SOCLE : l'état RÉEL de la production, mesuré le 2026-09-10 ──────────────
# ⚠️ HEREDOC CITÉ (<<'SQL') : sans les quotes, bash interprète `$$`, `$(` et les
# antislashs du corps des fonctions — la première version de ce banc exécutait
# `is_conv_member` comme une commande shell. Les identifiants passent donc par
# des variables psql (-v), jamais par une interpolation bash.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
     -v a="$A" -v b="$B" >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

create table public.conv_reads (
  conv_id text not null, user_id text not null, last_read_at timestamptz default now(),
  primary key (conv_id, user_id));
-- ⚠️ L'APPARTENANCE VIT DANS UNE AUTRE TABLE, comme en production. Faire lire
-- `conv_reads` à `is_conv_member` ferait s'appeler la policy elle-même : la
-- première version de ce banc rendait « stack depth limit exceeded ».
create table public.conv_members (conv_id text not null, user_id text not null);
create table public.client_errors (
  id text primary key default gen_random_uuid()::text,
  message text, source text, line int, stack text, url text, uid text,
  created_at timestamptz default now());

-- SECURITY DEFINER, comme la vraie : sans cela elle serait elle-même soumise à
-- la RLS des tables qu'elle interroge.
create function public.is_conv_member(_conv_id text, _uid text)
  returns boolean language sql stable security definer
  set search_path = public, pg_temp as
  $fn$ select exists (select 1 from public.conv_members m
        where m.conv_id = _conv_id and m.user_id = _uid) $fn$;

-- L'état de production : RLS active, policy PERMISSIVE, et le GRANT de TABLE.
alter table public.conv_reads enable row level security;
create policy "reads_select" on public.conv_reads for select to public using (true);
create policy "reads_upsert" on public.conv_reads for insert to public with check (true);
create policy "reads_update" on public.conv_reads for update to public
  using (user_id = (auth.uid())::text);
grant select, insert, update on public.conv_reads to anon, authenticated;

alter table public.client_errors enable row level security;
create policy "Insert erreurs" on public.client_errors for insert to public with check (true);
grant insert on public.client_errors to anon, authenticated;   -- GRANT DE TABLE, le piège

-- Deux personnes dans une conversation privée, plus un tiers ailleurs.
insert into public.conv_members (conv_id, user_id) values
  ('conv_prive', :'a'), ('conv_prive', :'b'), ('conv_autre', :'a');
insert into public.conv_reads (conv_id, user_id) values
  ('conv_prive', :'a'), ('conv_prive', :'b'), ('conv_autre', :'a');
SQL

echo "── ① LE DÉFAUT, MESURÉ AVANT TOUT ────────────────────────────────────"
avant_qual="$(Q "select qual from pg_policies where schemaname='public' and tablename='conv_reads' and cmd='SELECT';")"
verifier "conv_reads est lisible sans condition (qual = true)" "true" "$avant_qual"
avant_lignes="$(ANON "select count(*) from public.conv_reads;")"
verifier "un visiteur SANS COMPTE lit les 3 lignes du graphe social" "3" "$avant_lignes"
avant_graphe="$(ANON "select count(distinct user_id) from public.conv_reads where conv_id='conv_prive';")"
verifier "…et voit QUI parle à QUI dans une conversation privée" "2" "$avant_graphe"
avant_col="$(Q "select count(*) from information_schema.columns where table_name='client_errors' and column_name='auth_uid';")"
verifier "client_errors n'a aucune identité posée par le serveur" "0" "$avant_col"

echo "── ② APPLICATION DE LA MIGRATION ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "❌ la migration a échoué :"; echo "$sortie"; exit 1; }
echo "  ✅ appliquée sans erreur"; ok=$((ok+1))
# Rejouable : une migration qu'on ne peut pas relancer est une migration qu'on
# n'ose pas appliquer.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 \
  && { echo "  ✅ rejouable (idempotente)"; ok=$((ok+1)); } \
  || { echo "  ❌ non rejouable"; ko=$((ko+1)); }

echo "── ③ A. conv_reads : le graphe social est refermé ────────────────────"
verifier "RLS toujours ACTIVE (une policy seule ne protège rien)" "t" \
  "$(Q "select relrowsecurity from pg_class where oid='public.conv_reads'::regclass;")"
contient "le prédicat est celui des trois autres tables de messagerie" "is_conv_member" \
  "$(Q "select qual from pg_policies where schemaname='public' and tablename='conv_reads' and cmd='SELECT';")"
verifier "un visiteur sans compte ne lit plus RIEN" "0" \
  "$(ANON "select count(*) from public.conv_reads;")"
verifier "un membre lit toujours sa conversation" "2" \
  "$(AUTH "$A" "select count(*) from public.conv_reads where conv_id='conv_prive';")"
verifier "un tiers connecté ne lit pas une conversation dont il n'est pas membre" "0" \
  "$(AUTH "33333333-3333-3333-3333-333333333333" "select count(*) from public.conv_reads where conv_id='conv_prive';")"

echo "── ④ B. client_errors : l'identité vient du SERVEUR ──────────────────"
verifier "la colonne auth_uid existe" "1" \
  "$(Q "select count(*) from information_schema.columns where table_name='client_errors' and column_name='auth_uid';")"
verifier "le trigger d'identité est posé et actif" "O" \
  "$(Q "select tgenabled from pg_trigger where tgrelid='public.client_errors'::regclass and tgname='trg_client_errors_identite';")"
verifier "il agit AVANT l'insertion (sinon il ne voit pas la ligne)" "t" \
  "$(Q "select (tgtype & 2) > 0 from pg_trigger where tgrelid='public.client_errors'::regclass and tgname='trg_client_errors_identite';")"
# ⚠️ `revoke … from public` NE FERME RIEN SUR SUPABASE : les privilèges par
# défaut du projet accordent EXECUTE à `anon` et `authenticated` par des grants
# NOMINATIFS, que le retrait du pseudo-rôle PUBLIC laisse entiers. On interroge
# donc le privilège EFFECTIF, rôle par rôle, jamais la liste des grants.
verifier "la fonction n'est pas exécutable par anon" "f" \
  "$(Q "select has_function_privilege('anon', 'public.client_errors_pose_identite()', 'execute');")"
verifier "…ni par authenticated" "f" \
  "$(Q "select has_function_privilege('authenticated', 'public.client_errors_pose_identite()', 'execute');")"

# ⚠️ LE CŒUR DU BANC. Un visiteur écrit son erreur, ET tente de se donner une
# identité vérifiée en NOMMANT la colonne. Le trigger doit l'écraser.
ANON "insert into public.client_errors (message, auth_uid) values ('erreur visiteur', '$B'::uuid);" >/dev/null
verifier "un visiteur qui NOMME auth_uid n'obtient quand même aucune identité" "0" \
  "$(Q "select count(*) from public.client_errors where message='erreur visiteur' and auth_uid is not null;")"
AUTH "$A" "insert into public.client_errors (message) values ('erreur compte');" >/dev/null
verifier "un compte connecté obtient SON identité, posée par le serveur" "$A" \
  "$(Q "select auth_uid::text from public.client_errors where message='erreur compte';")"
AUTH "$A" "insert into public.client_errors (message, auth_uid) values ('usurpation', '$B'::uuid);" >/dev/null
verifier "…et ne peut pas se faire passer pour quelqu'un d'autre" "$A" \
  "$(Q "select auth_uid::text from public.client_errors where message='usurpation';")"
verifier "la sentinelle n'enquête que sur des erreurs d'origine vérifiée" "2" \
  "$(Q "select count(*) from public.client_errors where auth_uid is not null;")"
verifier "…et l'erreur du visiteur reste collectée pour le tableau de bord" "1" \
  "$(Q "select count(*) from public.client_errors where auth_uid is null;")"

echo "── ⑤ MUTATIONS : chaque garde retirée doit faire ROUGIR ──────────────"
# ① RLS désactivée : la policy existe toujours, et ne protège plus rien.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "alter table public.conv_reads disable row level security;" >/dev/null
mut1="$(ANON "select count(*) from public.conv_reads;")"
if [ "$mut1" = "0" ]; then echo "  ❌ mutation ① : RLS désactivée et pourtant rien ne fuit — le banc ne mesure pas ce qu'il croit"; ko=$((ko+1));
else echo "  ✅ mutation ① : RLS désactivée → le graphe refuit ($mut1 lignes), le contrôle ③ est réel"; ok=$((ok+1)); fi
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "alter table public.conv_reads enable row level security;" >/dev/null

# ② prédicat rendu permissif : le contrôle du prédicat doit être réel.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "alter policy \"reads_select\" on public.conv_reads using (true);" >/dev/null
mut2="$(ANON "select count(*) from public.conv_reads;")"
if [ "$mut2" = "0" ]; then echo "  ❌ mutation ② : prédicat permissif et rien ne fuit"; ko=$((ko+1));
else echo "  ✅ mutation ② : prédicat rendu permissif → le graphe refuit ($mut2 lignes)"; ok=$((ok+1)); fi
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "alter policy \"reads_select\" on public.conv_reads using (public.is_conv_member(conv_id, (select auth.uid())::text));" >/dev/null

# ③ ⚠️ LA MUTATION QUI COMPTE : on remplace le trigger par ce que la PREMIÈRE
#   version de la migration faisait — un `default` + un `revoke` de colonne —
#   et on exige que l'usurpation redevienne possible. C'est la preuve que le
#   trigger n'est pas décoratif.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q >/dev/null <<SQL
drop trigger trg_client_errors_identite on public.client_errors;
alter table public.client_errors alter column auth_uid set default auth.uid();
revoke insert (auth_uid) on public.client_errors from anon, authenticated;
SQL
ANON "insert into public.client_errors (message, auth_uid) values ('mutation', '$B'::uuid);" >/dev/null 2>&1
mut3="$(Q "select coalesce(auth_uid::text,'NULL') from public.client_errors where message='mutation';")"
if [ "$mut3" = "$B" ]; then
  echo "  ✅ mutation ③ : sans le trigger, « revoke insert (colonne) » ne retient RIEN — l'usurpation passe"; ok=$((ok+1));
else
  echo "  ❌ mutation ③ : l'usurpation n'a pas réussi ($mut3) — le banc ne prouve pas l'utilité du trigger"; ko=$((ko+1)); fi

echo
echo "───────────────────────────────────────────────────────────────────────"
echo "  $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ] || { echo "❌ BANC ROUGE"; exit 1; }
echo "✅ BANC VERT — les deux fuites sont refermées, et chaque garde est éprouvée"
