#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — les tables de compte, lues dans le CATALOGUE d'une base CONSTRUITE
# (ASTRA-63, sixième contre-revue Astra, 2026-09-16).
#
# CE QUE CE BANC MESURE : trois formes de DDL qui échappaient EN SILENCE au
# lecteur statique du dépôt — un `create table` dans un bloc `do $$…$$`, une
# table TYPÉE (`create table … of <type>`), une table DÉPLACÉE par `set
# schema` — sont CONSTRUITES sur un PostgreSQL réel, puis :
#   ① la requête en lecture seule `SQL_CATALOGUE` les VOIT (par le nom de la
#      colonne, ou par la clé étrangère vers auth.users quel que soit le nom) ;
#   ② `comparerCatalogue` les nomme comme OUBLIS tant qu'elles ne sont ni dans
#      TABLES_COMPTE ni dans les exceptions — et le CLI sort 1 ;
#   ③ le lecteur STATIQUE (schema-resultant.js) sur le MÊME texte SQL ne se
#      tait plus : il les rend INDÉTERMINÉES (la gate du dépôt rougit) ;
#   ④ le schéma réel des tables de TABLES_COMPTE, construit ici comme le banc de
#      la barrière (dérivé de purge-compte.js), est COUVERT à 100 % ;
#   ⑤ MUTATION : une colonne `member_id` (nom hors liste) liée à auth.users par
#      FK est vue par la FK ; sans FK et hors liste, elle est HORS PORTÉE — dit.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable"; exit 1; }

DDL="$(node --input-type=module -e '
import { pathToFileURL } from "node:url";
const { TABLES_COMPTE } = await import(pathToFileURL(process.argv[1]).href);
const parTable = new Map();
for (const [t, c] of TABLES_COMPTE) { if (!parTable.has(t)) parTable.set(t, []); parTable.get(t).push(c); }
const ddl = [];
for (const [t, cols] of parTable) ddl.push(`create table public.${t} (${cols.includes("id") ? "" : "id serial primary key, "}${cols.map((c) => c + " text").join(", ")}, blob text);`);
console.log(ddl.join("\n"));
' "$RACINE/supabase/functions/_shared/purge-compte.js")"
[ -n "$DDL" ] || { echo "❌ impossible de dériver le socle de TABLES_COMPTE"; exit 1; }

PORT=$(( 6800 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; exit 1; }

DB=astra63
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
CONN="host=$BASE port=$PORT user=postgres dbname=$DB"
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# Les trois formes fuyantes, telles qu'un opérateur ou une migration pourrait les écrire.
FUYANT="$BASE/fuyant.sql"
cat > "$FUYANT" <<'SQL'
-- ① un create table dans un bloc DO (conditionnel : « si absente »)
do $$ begin
  if to_regclass('public.hors_vue_do') is null then
    execute 'create table public.hors_vue_do (id serial primary key, user_id text, blob text)';
  end if;
end $$;
-- ② une table TYPÉE : les colonnes sont dans le type
create type public.t_ligne_typee as (id integer, author_id text, blob text);
create table public.hors_vue_typee of public.t_ligne_typee;
-- ③ une table créée ailleurs puis DÉPLACÉE dans public
create schema autre;
create table autre.hors_vue_deplacee (id serial primary key, from_id text, to_id text);
alter table autre.hors_vue_deplacee set schema public;
-- ④ une colonne au nom hors liste, mais liée à auth.users par clé étrangère
create table public.par_fk (id serial primary key, member uuid references auth.users(id));
-- ⑤ une colonne au nom hors liste, SANS clé étrangère : hors de portée du contrôle (dit)
create table public.hors_portee (id serial primary key, member_id text);
SQL

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
create schema auth;
create table auth.users (id uuid primary key);
$DDL
SQL
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FUYANT" >/dev/null

echo "── ① LE CATALOGUE VOIT LES TROIS FORMES (et la FK) ───────────────────"
verifier "table créée dans un bloc DO : vue" "hors_vue_do|user_id" "$(Q "select table_name || '|' || column_name from information_schema.columns where table_schema='public' and table_name='hors_vue_do' and column_name='user_id';")"
verifier "table typée : vue" "hors_vue_typee|author_id" "$(Q "select table_name || '|' || column_name from information_schema.columns where table_schema='public' and table_name='hors_vue_typee' and column_name='author_id';")"
verifier "table déplacée par set schema : vue dans public" "2" "$(Q "select count(*) from information_schema.columns where table_schema='public' and table_name='hors_vue_deplacee' and column_name in ('from_id','to_id');")"

echo "── ② LE CONTRÔLE NOMME LES OUBLIS, ET SORT 1 ─────────────────────────"
set +e
SORTIE="$(cd "$RACINE" && node scripts/controle-tables-compte-cible.js --psql "$CONN" 2>&1)"; CODE=$?
set -e
verifier "code de sortie 1 (des oublis)" "1" "$CODE"
for cle in hors_vue_do.user_id hors_vue_typee.author_id hors_vue_deplacee.from_id hors_vue_deplacee.to_id par_fk.member; do
  verifier "oubli nommé : $cle" "1" "$(printf '%s\n' "$SORTIE" | grep -c "❌ $cle " || true)"
done
verifier "par_fk.member est vu PAR LA CLÉ ÉTRANGÈRE (nom hors liste)" "1" "$(printf '%s\n' "$SORTIE" | grep -c "par_fk.member (uuid, fk_auth_users)" || true)"
verifier "hors_portee.member_id (sans FK, nom hors liste) n'est PAS vu — c'est la portée du contrôle" "0" "$(printf '%s\n' "$SORTIE" | grep -c "hors_portee" || true)"

echo "── ③ LE LECTEUR STATIQUE NE SE TAIT PLUS : indéterminées ───────────────"
INDET="$(cd "$RACINE" && node -e '
const { schemaResultant } = require("./scripts/lib/schema-resultant.js");
const r = schemaResultant([{ fichier: "fuyant.sql", sql: require("fs").readFileSync(process.argv[1], "utf8") }]);
console.log(r.indeterminees.map((x) => x.table + " :: " + x.motif.slice(0, 40)).join("\n"));
' "$FUYANT")"
verifier "DO + execute create table → indéterminé (SQL construit)" "1" "$(printf '%s\n' "$INDET" | grep -c "public.(bloc) :: SQL construit" || true)"
verifier "table typée → indéterminée" "1" "$(printf '%s\n' "$INDET" | grep -c "public.hors_vue_typee :: create table … of" || true)"
verifier "set schema → indéterminé" "1" "$(printf '%s\n' "$INDET" | grep -c "autre.hors_vue_deplacee :: alter table … set schema" || true)"

echo "── ④ LE SCHÉMA DES TABLES DE COMPTE EST COUVERT ─────────────────────────"
Q "drop table public.hors_vue_do, public.hors_vue_typee, public.hors_vue_deplacee, public.par_fk, public.hors_portee;" >/dev/null
set +e
SORTIE2="$(cd "$RACINE" && node scripts/controle-tables-compte-cible.js --psql "$CONN" 2>&1)"; CODE2=$?
set -e
verifier "sans les tables fuyantes : code 0" "0" "$CODE2"
verifier "…et le verdict est vert" "1" "$(printf '%s\n' "$SORTIE2" | grep -c "✅ toutes les colonnes" || true)"
N_ATTENDU="$(cd "$RACINE" && node -e 'const {lireTablesCompte}=require("./scripts/lib/tables-compte-catalogue.js");const {COLONNES_COMPTE}=require("./scripts/audit-tables-compte.js");console.log([...lireTablesCompte(".")].filter((c)=>COLONNES_COMPTE.test(c.split(".")[1])).length)')"
verifier "…toutes les colonnes de TABLES_COMPTE au nom d'identifiant ($N_ATTENDU ; profiles.id est hors motif, dit) sont vues et couvertes" "1" "$(printf '%s\n' "$SORTIE2" | grep -c "$N_ATTENDU purgée(s)/exportée(s)" || true)"

echo "── ⑤ MUTATION : retirer une colonne de TABLES_COMPTE rougit le contrôle ─"
MUT="$(cd "$RACINE" && node -e '
const { comparerCatalogue, lireTablesCompte } = require("./scripts/lib/tables-compte-catalogue.js");
const connues = lireTablesCompte("."); connues.delete("posts.author_id");
const r = comparerCatalogue([{ table: "posts", colonne: "author_id", type: "text", source: "nom" }], { connues });
console.log(r.oublis.map((o) => o.cle).join(","));
')"
verifier "posts.author_id retirée de la liste → oubli" "posts.author_id" "$MUT"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
