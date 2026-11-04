#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_audit_2026-11-02_oracles_et_privileges.sql
#
# Ce qu'il prouve, sur un PostgreSQL JETABLE portant les tables, policies et
# fonctions d'appui telles qu'elles sont EN PRODUCTION le 2026-11-02 (lues au
# canal ①, pg_policies / pg_get_functiondef) :
#   ⓪ LE DÉFAUT D'ABORD : avant la migration, un compte NON MEMBRE pose un accusé
#      de lecture dans la conversation d'autrui (INSERT accepté, ligne lisible
#      par les membres) et le modifie ; et TRUNCATE est accordé aux rôles clients ;
#   ① la migration s'applique, 8 OK / 0 ECHEC, et se REJOUE ;
#   ② un MEMBRE pose et met à jour son accusé (le produit n'a pas bougé) ;
#      un NON-MEMBRE est refusé à l'INSERT et son UPDATE ne touche aucune ligne ;
#      un membre ne réécrit pas l'accusé d'un AUTRE membre (identité) ;
#      un visiteur (anon) n'écrit rien ;
#   ③ TRUNCATE / REFERENCES / TRIGGER sont retirés à anon et authenticated sur
#      TOUTES les tables, et SELECT/INSERT/UPDATE/DELETE restent ;
#   ④ `post_masque` reste exécutable (la RESTRICTIVE de `posts` l'exige) ;
#   ⑤ MUTATIONS : (a) la clause d'appartenance retirée de l'INSERT → le non-membre
#      repasse ; (b) le REVOKE retiré → TRUNCATE revient ; dans les deux cas le
#      tableau de verdict doit ROUGIR (une migration qui dit OK quoi qu'il
#      arrive est pire que pas de verdict).
# ⚠️ `set local role` et sa requête partent dans le MÊME appel psql (ADR-012).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_audit_2026-11-02_oracles_et_privileges.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6800 + RANDOM % 120 ))
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

DB=audit1102
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
EN()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
# « OK » si l'ordre passe, sinon le message d'erreur (psql -q avale « INSERT 0 1 »).
EN_OK() { local r; r="$(EN "$1" "$2")"; [ -z "$r" ] && echo OK || echo "$r"; }
ANON_OK() { local r; r="$(ANON "$1")"; [ -z "$r" ] && echo OK || echo "$r"; }

A=11111111-1111-1111-1111-111111111111   # membre du 1:1 c_ab et du groupe
B=22222222-2222-2222-2222-222222222222   # membre du 1:1 c_ab
C=33333333-3333-3333-3333-333333333333   # NON membre de c_ab ; membre du groupe
D=44444444-4444-4444-4444-444444444444   # compte en suppression (barrière)

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { case "$2" in *"$1"*) echo 1;; *) echo 0;; esac; }

# ── SOCLE : tables, fonctions et policies DE PRODUCTION (2026-11-02) ──────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -v a="$A" -v b="$B" -v c="$C" -v d="$D" >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;

create table public.profiles (id text primary key, username text, is_private boolean default false);
create table public.conversations (id text primary key, is_group boolean default false, group_name text, created_by text, created_at timestamp default now());
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null, primary key (conv_id, user_id));
create table public.conv_reads (conv_id text not null, user_id text not null, last_read_at timestamptz not null default now(), primary key (conv_id, user_id));
create table public.posts (id text primary key, author_id text, content text);
create table public.contenus_masques (target_type text, target_id text, signaleurs integer, decision text, primary key (target_type, target_id));
create table public.comptes_en_suppression (user_id text primary key, statut text);
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conv_members enable row level security;
alter table public.conv_reads enable row level security;
alter table public.posts enable row level security;
alter table public.contenus_masques enable row level security;
alter table public.comptes_en_suppression enable row level security;
-- Défaut Supabase : GRANT ALL aux rôles clients (sauf les tables fermées).
grant all on public.profiles, public.conversations, public.conv_members, public.conv_reads, public.posts to anon, authenticated;

-- Fonctions d'appui, telles qu'elles sont EN PRODUCTION (pg_get_functiondef, 2026-11-02).
create function public.is_conv_member(_conv_id text, _uid text) returns boolean language sql stable security definer set search_path to '' as
  $$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $$;
revoke execute on function public.is_conv_member(text, text) from public;
grant execute on function public.is_conv_member(text, text) to authenticated;
create function public.suppression_de_mon_compte() returns boolean language sql stable security definer set search_path to '' as
  $$ select case when auth.uid() is null then false
       else exists (select 1 from public.comptes_en_suppression c where c.user_id = (auth.uid())::text and c.statut in ('en_cours', 'purgee', 'supprimee')) end $$;
grant execute on function public.suppression_de_mon_compte() to anon, authenticated;
create function public.post_masque(p_id text) returns boolean language sql stable security definer set search_path to '' as
  $$ select exists (select 1 from public.contenus_masques m where m.target_type = 'post' and m.target_id = p_id and m.decision is distinct from 'retabli') $$;
grant execute on function public.post_masque(text) to anon, authenticated;

-- Policies DE PRODUCTION (pg_policies, 2026-11-02).
create policy "Lecture publique" on public.profiles for select using (true);
create policy conversations_select_member on public.conversations for select to authenticated using (public.is_conv_member(id, (select auth.uid())::text));
create policy conv_members_select_member on public.conv_members for select to authenticated using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy reads_select on public.conv_reads for select to authenticated using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy reads_upsert on public.conv_reads for insert to public with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
create policy reads_update on public.conv_reads for update to public using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
create policy "Lecture respectant les comptes prives" on public.posts for select using (true);
create policy "Masquage apres signalements" on public.posts as restrictive for select using (author_id = (select auth.uid())::text or not public.post_masque(id));

insert into public.profiles values (:'a', 'A', false), (:'b', 'B', false), (:'c', 'C', false), (:'d', 'D', false);
insert into public.conversations (id, is_group, created_by) values ('c_ab', false, :'a'), ('grp_1', true, :'a');
insert into public.conv_members values ('c_ab', :'a'), ('c_ab', :'b'), ('grp_1', :'a'), ('grp_1', :'c');
insert into public.posts values ('post_1', :'a', 'visible'), ('post_m', :'a', 'masqué');
insert into public.contenus_masques values ('post', 'post_m', 3, null);
insert into public.comptes_en_suppression values (:'d', 'en_cours');
SQL

echo "── ⓪ LE DÉFAUT, MESURÉ AVANT LA MIGRATION ───────────────────────────"
verifier "AVANT : C (non membre) pose un accusé de lecture dans le 1:1 de A et B" "OK" \
  "$(EN_OK "$C" "insert into public.conv_reads (conv_id, user_id) values ('c_ab', '$C');")"
verifier "AVANT : …et A, membre, VOIT cet accusé d'un inconnu (lu par la policy SELECT des membres)" "1" \
  "$(EN "$A" "select count(*) from public.conv_reads where conv_id = 'c_ab' and user_id = '$C';")"
# ⚠️ L'UPDATE EN PLACE de la ligne intruse est DÉJÀ refusé avant la migration :
# dès qu'un UPDATE LIT une colonne (WHERE, RETURNING d'une colonne), PostgreSQL
# applique aussi les policies SELECT à la ligne ÉCRITE, et `reads_select` exige
# l'appartenance. Le défaut UPDATE est donc étroit : un UPDATE SANS filtre et
# SANS lecture (`PATCH /conv_reads` sans paramètre, `Prefer: return=minimal` →
# PostgREST émet `UPDATE … SET … RETURNING 1`) n'est contrôlé que par
# `reads_update` : USING `user_id = me`, WITH CHECK `user_id = me` — il DÉPLACE
# tous mes accusés légitimes vers la conversation d'autrui.
verifier "AVANT : C (non membre) ne met pas à jour sa ligne intruse par un UPDATE filtré — la policy SELECT la lui cache déjà (0 ligne)" "0" \
  "$(EN "$C" "with u as (update public.conv_reads set last_read_at = now() where conv_id = 'c_ab' and user_id = '$C' returning 1) select count(*) from u;")"
Q "delete from public.conv_reads where user_id = '$C';" >/dev/null
Q "insert into public.conv_reads (conv_id, user_id) values ('grp_1', '$C');" >/dev/null
verifier "AVANT : C (membre de grp_1) DÉPLACE son accusé vers c_ab par un UPDATE NON filtré (seul user_id est contrôlé : passe)" "OK" \
  "$(EN_OK "$C" "update public.conv_reads set conv_id = 'c_ab';")"
verifier "AVANT : …et A voit un accusé de C dans son 1:1" "1" \
  "$(EN "$A" "select count(*) from public.conv_reads where conv_id = 'c_ab' and user_id = '$C';")"
verifier "AVANT : TRUNCATE est accordé à authenticated sur conv_reads (défaut GRANT ALL)" "t" \
  "$(Q "select has_table_privilege('authenticated', 'public.conv_reads', 'TRUNCATE');")"
Q "delete from public.conv_reads where user_id = '$C';" >/dev/null

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "le tableau de verdict rend 8 OK et 0 ECHEC" "8/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 8 OK" "8" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ② conv_reads : le membre écrit, le non-membre non ──────────────────"
verifier "A (membre) pose son accusé de lecture dans c_ab" "OK" \
  "$(EN_OK "$A" "insert into public.conv_reads (conv_id, user_id) values ('c_ab', '$A');")"
verifier "A (membre) le met à jour (1 ligne)" "1" \
  "$(EN "$A" "with u as (update public.conv_reads set last_read_at = now() where conv_id = 'c_ab' and user_id = '$A' returning 1) select count(*) from u;")"
verifier "B (membre) voit l'accusé de A" "1" "$(EN "$B" "select count(*) from public.conv_reads where conv_id = 'c_ab' and user_id = '$A';")"
verifier "C (NON membre) est REFUSÉ à l'INSERT dans c_ab" "1" \
  "$(contient 'row-level security' "$(EN "$C" "insert into public.conv_reads (conv_id, user_id) values ('c_ab', '$C');")")"
verifier "C (membre du groupe) pose son accusé dans grp_1 : le produit n'a pas bougé pour lui" "OK" \
  "$(EN_OK "$C" "insert into public.conv_reads (conv_id, user_id) values ('grp_1', '$C');")"
# L'UPDATE NON filtré qui DÉPLAÇAIT l'accusé vers une conv dont on n'est pas membre : WITH CHECK refuse désormais.
verifier "C ne déplace plus son accusé de grp_1 vers c_ab par UPDATE non filtré (WITH CHECK : appartenance)" "1" \
  "$(contient 'row-level security' "$(EN "$C" "update public.conv_reads set conv_id = 'c_ab';")")"
verifier "…et son accusé est resté dans grp_1" "1" "$(EN "$C" "select count(*) from public.conv_reads where conv_id = 'grp_1' and user_id = '$C';")"
verifier "B ne réécrit pas l'accusé de A (identité : 0 ligne touchée, pas d'erreur)" "0" \
  "$(EN "$B" "with u as (update public.conv_reads set last_read_at = now() where conv_id = 'c_ab' and user_id = '$A' returning 1) select count(*) from u;")"
verifier "B ne pose pas un accusé AU NOM de A (identité)" "1" \
  "$(contient 'row-level security' "$(EN "$B" "insert into public.conv_reads (conv_id, user_id) values ('grp_1', '$A');")")"
verifier "D (compte en suppression, membre de rien) est refusé" "1" \
  "$(contient 'row-level security' "$(EN "$D" "insert into public.conv_reads (conv_id, user_id) values ('c_ab', '$D');")")"
verifier "visiteur (anon) : aucun INSERT possible (policy au rôle authenticated)" "1" \
  "$(contient 'row-level security' "$(ANON "insert into public.conv_reads (conv_id, user_id) values ('c_ab', '$A');")")"
verifier "visiteur (anon) : aucune lecture" "0" "$(ANON "select count(*) from public.conv_reads;")"

echo "── ③ privilèges hors RLS ─────────────────────────────────────────────"
verifier "TRUNCATE retiré à authenticated sur conv_reads" "f" "$(Q "select has_table_privilege('authenticated', 'public.conv_reads', 'TRUNCATE');")"
verifier "TRUNCATE retiré à anon sur profiles" "f" "$(Q "select has_table_privilege('anon', 'public.profiles', 'TRUNCATE');")"
verifier "REFERENCES et TRIGGER retirés (posts, authenticated)" "false|false" \
  "$(Q "select has_table_privilege('authenticated', 'public.posts', 'REFERENCES') || '|' || has_table_privilege('authenticated', 'public.posts', 'TRIGGER');")"
verifier "aucune table de public ne garde TRUNCATE pour un rôle client" "0" \
  "$(Q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));")"
verifier "un TRUNCATE au rôle authenticated est désormais REFUSÉ" "1" \
  "$(contient 'permission denied' "$(EN "$A" "truncate public.conv_reads;")")"
verifier "SELECT / INSERT / UPDATE / DELETE restent accordés (conv_reads, authenticated)" "true|true|true|true" \
  "$(Q "select has_table_privilege('authenticated', 'public.conv_reads', 'SELECT') || '|' || has_table_privilege('authenticated', 'public.conv_reads', 'INSERT') || '|' || has_table_privilege('authenticated', 'public.conv_reads', 'UPDATE') || '|' || has_table_privilege('authenticated', 'public.conv_reads', 'DELETE');")"
verifier "les tables FERMÉES le restent (contenus_masques : aucun droit client)" "false|false" \
  "$(Q "select has_table_privilege('anon', 'public.contenus_masques', 'SELECT') || '|' || has_table_privilege('authenticated', 'public.contenus_masques', 'SELECT');")"

echo "── ④ post_masque : exécutable, et la RESTRICTIVE de posts fonctionne ──"
verifier "post_masque reste exécutable par anon et authenticated (délibéré)" "true|true" \
  "$(Q "select has_function_privilege('anon', 'public.post_masque(text)', 'execute') || '|' || has_function_privilege('authenticated', 'public.post_masque(text)', 'execute');")"
verifier "B ne voit pas le post masqué, voit l'autre" "post_1" "$(EN "$B" "select string_agg(id, ',') from public.posts;")"
verifier "A (auteur) voit ses deux posts, masqué compris" "post_1,post_m" "$(EN "$A" "select string_agg(id, ',' order by id) from public.posts;")"
verifier "visiteur : le post masqué n'apparaît pas" "post_1" "$(ANON "select string_agg(id, ',') from public.posts;")"

echo "── ⑤ MUTATIONS : le verdict doit ROUGIR ──────────────────────────────"
mutant_a="$(mktemp)"; mutant_b="$(mktemp)"; trap 'rm -f "$mutant_a" "$mutant_b"; nettoyer' EXIT
# (a) la clause d'appartenance retirée de l'INSERT.
python3 - "$MIGRATION" "$mutant_a" <<'PY'
import sys
src = open(sys.argv[1], encoding="utf-8").read()
bloc = "  for insert to authenticated\n  with check (\n    user_id = (select auth.uid())::text\n    and public.is_conv_member(conv_id, (select auth.uid())::text)\n"
assert src.count(bloc) == 1, "bloc INSERT introuvable : la mutation n'a pas porté"
open(sys.argv[2], "w", encoding="utf-8").write(src.replace(bloc, "  for insert to authenticated\n  with check (\n    user_id = (select auth.uid())::text\n"))
PY
verifier "(a) le mutant diffère de la migration" "1" "$([ -n "$(diff "$MIGRATION" "$mutant_a")" ] && echo 1 || echo 0)"
sortie_a="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$mutant_a" 2>&1)" || true
verifier "(a) INSERT sans appartenance : le verdict ROUGIT" "1" "$(printf '%s\n' "$sortie_a" | grep -cE 'conv_reads INSERT[^|]*\|\s*ECHEC' || true)"
verifier "(a) …et le non-membre repasse (le défaut est bien celui que la clause ferme)" "OK" \
  "$(EN_OK "$C" "insert into public.conv_reads (conv_id, user_id) values ('c_ab', '$C');")"
Q "delete from public.conv_reads where user_id = '$C' and conv_id = 'c_ab';" >/dev/null
# (b) le REVOKE retiré.
sed -E "s/execute format\('revoke truncate, references, trigger on table public\.%I from anon, authenticated', r\.relname\);/null;/" "$MIGRATION" > "$mutant_b"
verifier "(b) le mutant diffère de la migration" "1" "$([ -n "$(diff "$MIGRATION" "$mutant_b")" ] && echo 1 || echo 0)"
Q "grant truncate on all tables in schema public to anon, authenticated;" >/dev/null
sortie_b="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$mutant_b" 2>&1)" || true
verifier "(b) sans REVOKE, TRUNCATE revient et le verdict ROUGIT" "1" "$(printf '%s\n' "$sortie_b" | grep -cE 'TRUNCATE[^|]*\|\s*ECHEC' || true)"
# La version revue, réappliquée, referme tout.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "réappliquée : le non-membre est de nouveau refusé" "1" \
  "$(contient 'row-level security' "$(EN "$C" "insert into public.conv_reads (conv_id, user_id) values ('c_ab', '$C');")")"
verifier "réappliquée : TRUNCATE de nouveau retiré" "f" "$(Q "select has_table_privilege('authenticated', 'public.conv_reads', 'TRUNCATE');")"

echo
echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
