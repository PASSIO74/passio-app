#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — LA RETENUE DU DÉPLOIEMENT DES EDGE FUNCTIONS (ASTRA-64, 2026-09-16),
# sur PostgreSQL RÉEL jetable : `scripts/verifier-prerequis-fonctions.mjs`
# lit le catalogue de la base et RETIENT (code 1) tant qu'une migration
# obligatoire n'y est pas ; il autorise (code 0) dès qu'elle y est, et DIT un
# prérequis facultatif absent sans bloquer.
#   ① base sans migration : delete-account RETENUE (objets nommés) ;
#   ② barrière v2 seule (colonne `tentative_vivante` retirée, `auth_echec`
#      absent du source) : encore RETENUE — v3 exigée, pas « une barrière » ;
#   ③ v3 appliquée : autorisé ; export-account facultatif absent : ⚠️ dit, code 0 ;
#   ④ lecture seule : la requête ne peut pas écrire (read only) ;
#   ⑤ une fonction hors manifeste ne se déploie pas ;
#   ⑥ MUTATION : retirer l'objet obligatoire du manifeste → le banc rougit ici
#      (le manifeste est ce qui rend la retenue mécanique).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_barriere_suppression_2026-09-15.sql"
M_OBJETS="$RACINE/migrations/migration_objets_stockage_compte_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable"; exit 1; }
[ -f "$MIGRATION" ] && [ -f "$M_OBJETS" ] || { echo "❌ migration introuvable"; exit 1; }

DDL="$(node --input-type=module -e '
import { pathToFileURL } from "node:url";
const { TABLES_COMPTE } = await import(pathToFileURL(process.argv[1]).href);
const parTable = new Map();
for (const [t, c] of TABLES_COMPTE) { if (!parTable.has(t)) parTable.set(t, []); parTable.get(t).push(c); }
const ddl = [];
for (const [t, cols] of parTable) ddl.push(`create table public.${t} (${cols.includes("id") ? "" : "id serial primary key, "}${cols.map((c) => c + " text").join(", ")}, blob text);`);
console.log(ddl.join("\n"));
' "$RACINE/supabase/functions/_shared/purge-compte.js" 2>/dev/null)"
[ -n "$DDL" ] || { echo "❌ socle non dérivable"; exit 1; }

PORT=$(( 6950 + RANDOM % 120 ))
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

DB=astra64
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
CONN="host=$BASE port=$PORT user=postgres dbname=$DB"
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as \$fn\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$fn\$;
create schema storage;
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
grant usage on schema public to anon, authenticated, service_role;
$DDL
SQL

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
JOUER() { set +e; SORTIE="$(cd "$RACINE" && node scripts/verifier-prerequis-fonctions.mjs --fonctions "$1" --psql "$CONN" 2>&1)"; CODE=$?; set -e; }

echo "── ① SANS MIGRATION : delete-account est RETENUE ────────────────────────"
JOUER "delete-account"
verifier "code 1 (retenue)" "1" "$CODE"
verifier "…delete-account nommée RETENUE" "1" "$(printf '%s\n' "$SORTIE" | grep -c "❌ delete-account : RETENUE" || true)"
verifier "…l'objet manquant est nommé" "1" "$(printf '%s\n' "$SORTIE" | grep -c "function:public.reclamer_suppression(text,uuid,text,interval)" || true)"
verifier "…et la migration à appliquer aussi" "1" "$(printf '%s\n' "$SORTIE" | grep -c "migration_barriere_suppression_2026-09-15.sql" || true)"

echo "── ② BARRIÈRE v2 SEULE : encore RETENUE (v3 exigée) ─────────────────────"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$M_OBJETS" >/dev/null 2>&1 || true
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" >/dev/null 2>&1 || true
# On « rétrograde » la v3 en v2 : colonne retirée, terminer_suppression sans auth_echec.
Q "alter table public.comptes_en_suppression drop column tentative_vivante;" >/dev/null
Q "create or replace function public.terminer_suppression(p_uid text, p_jeton uuid, p_statut text, p_detail jsonb default null) returns jsonb language sql security definer set search_path = '' as \$m\$ select jsonb_build_object('ok', false) \$m\$;" >/dev/null
JOUER "delete-account"
verifier "code 1 : une barrière v2 ne suffit pas" "1" "$CODE"
verifier "…la colonne v3 manque" "1" "$(printf '%s\n' "$SORTIE" | grep -c "column:public.comptes_en_suppression.tentative_vivante" || true)"
verifier "…et le source de terminer_suppression n'a pas auth_echec" "1" "$(printf '%s\n' "$SORTIE" | grep -c "source:public.terminer_suppression~auth_echec" || true)"

echo "── ③ v3 APPLIQUÉE : autorisé ; facultatif absent : dit, pas bloquant ────"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" >/dev/null 2>&1 || true
JOUER "delete-account"
verifier "code 0 : delete-account peut partir" "0" "$CODE"
verifier "…prérequis présents" "1" "$(printf '%s\n' "$SORTIE" | grep -c "✅ delete-account : prérequis présents" || true)"
JOUER "delete-account export-account notify-call"
verifier "export-account (instantané absent) : dégradée, code 0" "0" "$CODE"
verifier "…⚠️ dit" "1" "$(printf '%s\n' "$SORTIE" | grep -c "⚠️ export-account : dégradée" || true)"
verifier "…et notify-call (mentions serveur absentes) aussi" "1" "$(printf '%s\n' "$SORTIE" | grep -c "⚠️ notify-call : dégradée" || true)"

echo "── ④ LECTURE SEULE ───────────────────────────────────────────────────────"
verifier "une écriture dans la même forme de transaction est refusée" "REFUSE" "$(if psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -1 -v ON_ERROR_STOP=1 -c "set transaction read only; create table public.tentative_ecriture (x int);" >/dev/null 2>&1; then echo OK; else echo REFUSE; fi)"
verifier "…la table n'existe pas" "" "$(Q "select 1 from information_schema.tables where table_name='tentative_ecriture';")"

echo "── ⑤ UNE FONCTION HORS MANIFESTE NE SE DÉPLOIE PAS ────────────────────"
JOUER "fonction-inconnue"
verifier "code 2" "2" "$CODE"
verifier "…nommée" "1" "$(printf '%s\n' "$SORTIE" | grep -c "fonction inconnue du manifeste" || true)"

echo "── ⑥ MUTATION : un manifeste sans l'objet obligatoire laisserait partir la fonction ─"
MUT="$BASE/prerequis-mute.json"
node -e '
const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
j.fonctions["delete-account"].objets = j.fonctions["delete-account"].objets.filter((s) => !/reclamer_suppression|tentative_vivante|auth_echec/.test(s));
require("fs").writeFileSync(process.argv[2], JSON.stringify(j));
' "$RACINE/.passio/deploiement/prerequis-fonctions.json" "$MUT"
Q "alter table public.comptes_en_suppression drop column tentative_vivante;" >/dev/null
set +e; SORTIE="$(cd "$RACINE" && PASSIO_PREREQUIS="$MUT" node scripts/verifier-prerequis-fonctions.mjs --fonctions delete-account --psql "$CONN" 2>&1)"; CODE=$?; set -e
verifier "mutation « manifeste amputé » : la retenue disparaît (code 0) — un banc qui exige la retenue rougit" "0" "$CODE"
JOUER "delete-account"
verifier "…rétabli avec le vrai manifeste : retenue" "1" "$CODE"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
