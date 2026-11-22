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
#   ③ v3 appliquée : autorisé ; export médias absent : retenu ; notify-call reste facultatif ;
#   ③ bis `--partiel` (2026-11-21) : la retenue d'UNE fonction ne retient plus les
#      autres — code 0, le plan part dans $GITHUB_OUTPUT (deployables, retenues) ;
#   ③ ter une cible SANS la table `reglages_distants` n'est pas une cible illisible :
#      la fonction qui exige le réglage est retenue, les autres partent ; l'état du
#      réglage se lit à chaque passage, même sans fonction à vérifier ;
#   ③ quater `--en-service` : les prérequis d'une fonction servie non redéployée sont
#      RELUS — absents, rien n'est retenu, mais c'est dit (`sans_prerequis`) ;
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
verifier "export-account (instantané médias absent) : retenu, code 1" "1" "$CODE"
verifier "…retenue dite" "1" "$(printf '%s\n' "$SORTIE" | grep -c "❌ export-account : RETENUE" || true)"
verifier "…et notify-call (mentions serveur absentes) aussi" "1" "$(printf '%s\n' "$SORTIE" | grep -c "⚠️ notify-call : dégradée" || true)"
JOUER "delete-account notify-call"
verifier "notify-call facultatif reste non bloquant" "0" "$CODE"

echo "── ③ bis --partiel : UNE FONCTION RETENUE NE RETIENT PLUS LES AUTRES ────"
# Le défaut du 20/11 (run 44831711346) : un prérequis absent pour une fonction retenait les six.
PLAN="$BASE/plan.txt"
JOUER_PARTIEL() { : > "$PLAN"; set +e; SORTIE="$(cd "$RACINE" && GITHUB_OUTPUT="$PLAN" node scripts/verifier-prerequis-fonctions.mjs --fonctions "$1" --psql "$CONN" --partiel 2>&1)"; CODE=$?; set -e; }
JOUER_PARTIEL "delete-account export-account notify-call"
verifier "code 0 : la cible a été lue, le job tranche après le déploiement des autres" "0" "$CODE"
verifier "…export-account retenue, dite" "1" "$(printf '%s\n' "$SORTIE" | grep -c "❌ export-account : RETENUE" || true)"
verifier "…le plan : delete-account et notify-call partent" "deployables=delete-account notify-call" "$(grep '^deployables=' "$PLAN")"
verifier "…export-account ne part pas" "retenues=export-account" "$(grep '^retenues=' "$PLAN")"
verifier "…et c'est dit : le run finira rouge" "1" "$(printf '%s\n' "$SORTIE" | grep -c "RETENUE PARTIELLE : export-account" || true)"
JOUER_PARTIEL "delete-account notify-call"
verifier "sans retenue : code 0, tout part" "deployables=delete-account notify-call|retenues=" "$(grep '^deployables=' "$PLAN")|$(grep '^retenues=' "$PLAN")"
JOUER "delete-account export-account notify-call"
verifier "sans --partiel, le contrat d'avant tient : code 1" "1" "$CODE"
JOUER_PARTIEL "fonction-inconnue"
verifier "--partiel n'ouvre rien : une fonction hors manifeste sort en 2, sans plan" "2|" "$CODE|$(cat "$PLAN")"

echo "── ③ ter SANS reglages_distants : UN RÉGLAGE ABSENT, PAS UNE CIBLE ILLISIBLE ─"
# Écrite en clair dans la requête, une table absente la faisait échouer EN ENTIER : la retenue d'une fonction
# redevenait totale sur une cible neuve (relecture adverse du 21/11). Elle est nommée dans une requête différée.
verifier "prémisse : cette base n'a pas la table" "" "$(Q "select to_regclass('public.reglages_distants');")"
JOUER_PARTIEL "delete-account private-media"
verifier "code 0 : la lecture n'échoue pas en entier" "0" "$CODE"
verifier "…private-media retenue, le réglage nommé parmi ce qui manque" "1" "$(printf '%s\n' "$SORTIE" | grep -c "❌ private-media : RETENUE — manque : reglage:medias_proteges.actif:booleen" || true)"
verifier "…delete-account part" "deployables=delete-account" "$(grep '^deployables=' "$PLAN")"
verifier "…l'état est lu « false » : absent vaut fermé, comme pour le serveur" "etat_medias_proteges_actif=false" "$(grep '^etat_' "$PLAN")"
Q "create table public.reglages_distants (cle text primary key, valeur jsonb not null); insert into public.reglages_distants values ('medias_proteges', '{\"actif\": true}');" >/dev/null
JOUER_PARTIEL ""
verifier "rien n'est en retard (--fonctions \"\") : aucune fonction — jamais « toutes » —, l'état est lu pour la fumée" "0|deployables=|retenues=|etat_medias_proteges_actif=true" "$CODE|$(grep '^deployables=' "$PLAN")|$(grep '^retenues=' "$PLAN")|$(grep '^etat_' "$PLAN")"
verifier "…et aucune fonction n'est dite vérifiée" "0" "$(printf '%s\n' "$SORTIE" | grep -c "prérequis présents\|RETENUE" || true)"
JOUER_PARTIEL "private-media"
verifier "réglage posé à true : il ne manque plus à private-media (restent ses registres)" "0" "$(printf '%s\n' "$SORTIE" | grep "❌ private-media : RETENUE" | grep -c "reglage:medias_proteges.actif:booleen" || true)"
Q "update public.reglages_distants set valeur = '{\"actif\": \"true\"}' where cle = 'medias_proteges';" >/dev/null
JOUER_PARTIEL "private-media"
verifier "une chaîne « true » n'est pas un booléen : le réglage manque, et l'état est lu « false »" "1|etat_medias_proteges_actif=false" "$(printf '%s\n' "$SORTIE" | grep "❌ private-media : RETENUE" | grep -c "reglage:medias_proteges.actif:booleen" || true)|$(grep '^etat_' "$PLAN")"
Q "drop table public.reglages_distants;" >/dev/null

echo "── ③ quater --en-service : CE QUI TOURNE EST RELU, JAMAIS RETENU ─────────"
# Ne vérifier que ce qui part cessait de relire les prérequis des autres : une dérive en base sous une
# fonction en service ne se voyait plus (seconde contre-revue du 21/11).
JOUER_SERVIES() { : > "$PLAN"; set +e; SORTIE="$(cd "$RACINE" && GITHUB_OUTPUT="$PLAN" node scripts/verifier-prerequis-fonctions.mjs --fonctions "$1" --en-service "$2" --psql "$CONN" --partiel 2>&1)"; CODE=$?; set -e; }
JOUER_SERVIES "delete-account" "export-account notify-call"
verifier "code 0 : delete-account part, rien n'est retenu" "0|deployables=delete-account|retenues=" "$CODE|$(grep '^deployables=' "$PLAN")|$(grep '^retenues=' "$PLAN")"
verifier "…export-account, en service sans son instantané, est dite" "sans_prerequis=export-account" "$(grep '^sans_prerequis=' "$PLAN")"
verifier "…nommée avec ce qui manque" "1" "$(printf '%s\n' "$SORTIE" | grep -c "❌ export-account (en service, non redéployée) : PRÉREQUIS ABSENT" || true)"
verifier "…notify-call (facultatif absent) : dite, sans compter" "1" "$(printf '%s\n' "$SORTIE" | grep -c "⚠️ notify-call (en service, non redéployée) : facultatif absent" || true)"
verifier "…et le run finira rouge, c'est annoncé" "1" "$(printf '%s\n' "$SORTIE" | grep -c "EN SERVICE SANS PRÉREQUIS : export-account" || true)"
JOUER_SERVIES "" "delete-account"
verifier "rien à déployer, delete-account en service et en règle : plan vide, rien à signaler" "0|deployables=|retenues=|sans_prerequis=" "$CODE|$(grep '^deployables=' "$PLAN")|$(grep '^retenues=' "$PLAN")|$(grep '^sans_prerequis=' "$PLAN")"
verifier "…le plan porte son témoin" "plan=lu" "$(grep '^plan=' "$PLAN")"

echo "── ④ LECTURE SEULE ───────────────────────────────────────────────────────"
verifier "une écriture dans la même forme de transaction est refusée" "REFUSE" "$(if psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -1 -v ON_ERROR_STOP=1 -c "set transaction read only; create table public.tentative_ecriture (x int);" >/dev/null 2>&1; then echo OK; else echo REFUSE; fi)"
verifier "…la table n'existe pas" "" "$(Q "select 1 from information_schema.tables where table_name='tentative_ecriture';")"

echo "── ⑤ UNE FONCTION HORS MANIFESTE NE SE DÉPLOIE PAS ────────────────────"
JOUER "fonction-inconnue"
verifier "code 2" "2" "$CODE"
# Sous GitHub Actions le refus est dit DEUX fois (le journal, et l'annotation `::error` de la page du run) : on compte chacune.
verifier "…nommée" "1" "$(printf '%s\n' "$SORTIE" | grep -c "^❌ fonction inconnue du manifeste" || true)"
verifier "…et sous GitHub Actions, dite aussi sur la page du run" "1" "$(cd "$RACINE" && GITHUB_ACTIONS=true node scripts/verifier-prerequis-fonctions.mjs --fonctions fonction-inconnue --psql "$CONN" 2>&1 | grep -c "^::error title=Retenue — cible non vérifiable::fonction inconnue du manifeste" || true)"

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
