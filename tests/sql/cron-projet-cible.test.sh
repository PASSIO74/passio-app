#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — scripts/schema-executable.js : une tâche cron qui APPELLE un projet
# Supabase n'est recopiée que sur CE projet (2026-11-06).
#
# Le défaut : le DDL de reprise recopiait chaque tâche cron telle quelle, URL
# comprise. La restauration du 2026-10-21 (RES-14) a ainsi installé sur le
# staging la veille du pilotage avec l'URL de la PRODUCTION : deux veilles par
# tick pendant seize jours, un rappel d'activité envoyé deux fois au même
# compte (mesuré en production le 2026-11-06).
#
# Ce banc exécute le DDL RENDU par le générateur sur un PostgreSQL jetable
# (schéma `cron` simulé : `cron.job` + `cron.schedule`) :
#   ① sans projet déclaré : la tâche qui appelle la production est SAUTÉE, et
#      un avis le dit ; la purge en SQL est recopiée ;
#   ② projet déclaré = le staging : même chose ;
#   ③ projet déclaré = celui que la tâche appelle : recopiée, commande à
#      l'octet ;
#   ④ rejoué : rien ne se double ;
#   ⑤ RÉINJECTION : le rendu d'origine (sans garde) recopie la tâche sur le
#      staging — le défaut se reproduit, le banc sait le voir.
#
#   bash tests/sql/cron-projet-cible.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur), Node 18+. Ne touche AUCUNE
# base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
GENERATEUR="$RACINE/scripts/schema-executable.js"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable"; exit 1; }
[ -f "$GENERATEUR" ] || { echo "❌ générateur introuvable : $GENERATEUR"; exit 1; }

PORT=$(( 6700 + RANDOM % 100 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
OUTILS="$(mktemp -d)"
chmod 755 "$OUTILS"
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE" "$OUTILS"; }
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U postgres -X -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }
SQL() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }

# Un projet neuf : `cron.job` et `cron.schedule` simulés (même signature).
projet_neuf() {
  psql -h "$BASE" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -c "create database $1" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQLN'
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $fn$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $fn$;
SQLN
}

# Les deux tâches de la production, rendues par le générateur (commande de la
# veille : forme réelle, CRLF compris ; la clé est remplacée par un marqueur).
node -e '
const { rendreTacheCron } = require(process.argv[1]);
const veille = "\r\n    select net.http_post(\r\n      url := '"'"'https://njkiyoklssvefstljemx.supabase.co/functions/v1/pilotage'"'"',\r\n      headers := jsonb_build_object('"'"'Content-Type'"'"', '"'"'application/json'"'"', '"'"'Authorization'"'"', '"'"'Bearer CLE'"'"'),\r\n      body := jsonb_build_object('"'"'action'"'"', '"'"'veille'"'"'),\r\n      timeout_milliseconds := 30000\r\n    );\r\n  ";
const purge = "DELETE FROM public.client_errors WHERE created_at < now() - interval '"'"'30 days'"'"'";
const fs = require("fs");
fs.writeFileSync(process.argv[2] + "/ddl.sql", [rendreTacheCron({ jobname: "pilotage_veille", schedule: "*/5 * * * *", command: veille }), rendreTacheCron({ jobname: "purge_client_errors", schedule: "0 3 * * *", command: purge })].join("\n") + "\n");
fs.writeFileSync(process.argv[2] + "/veille.txt", veille);
// Le rendu d origine, sans garde (réinjection ⑤).
const litt = (s) => "'"'"'" + String(s).replace(/'"'"'/g, "'"'"''"'"'") + "'"'"'";
fs.writeFileSync(process.argv[2] + "/ddl-origine.sql", "do $$ begin if not exists (select 1 from cron.job where jobname=" + litt("pilotage_veille") + ") then perform cron.schedule(" + litt("pilotage_veille") + ", " + litt("*/5 * * * *") + ", " + litt(veille) + "); end if; end $$;\n");
' "$GENERATEUR" "$OUTILS"

appliquer() { # <base> <projet déclaré ou vide> <fichier ddl> → avis + erreurs
  local decl=""
  [ -n "$2" ] && decl="select set_config('passio.projet', '$2', true);"
  { echo "begin;"; echo "$decl"; cat "$3"; echo "commit;"; } | psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -q -v ON_ERROR_STOP=1 2>&1
}
taches() { SQL "$1" "select coalesce(string_agg(jobname, ',' order by jobname), '') from cron.job"; }

echo "① sans projet déclaré"
projet_neuf sans
avis="$(appliquer sans "" "$OUTILS/ddl.sql")"
verifier "seule la purge est recopiée" "purge_client_errors" "$(taches sans)"
contient "un avis dit pourquoi la veille ne l'est pas" "pilotage_veille NON recopiée" "$avis"

echo "② projet déclaré = le staging"
projet_neuf staging
avis="$(appliquer staging fcksxofaelcdmmifnwjo "$OUTILS/ddl.sql")"
verifier "la veille de la production n'est pas recopiée sur le staging" "purge_client_errors" "$(taches staging)"
contient "l'avis nomme le projet déclaré" "« fcksxofaelcdmmifnwjo »" "$avis"

echo "③ projet déclaré = celui que la tâche appelle"
projet_neuf meme
appliquer meme njkiyoklssvefstljemx "$OUTILS/ddl.sql" >/dev/null
verifier "les deux tâches sont recopiées" "pilotage_veille,purge_client_errors" "$(taches meme)"
verifier "la commande est recopiée à l'octet (CRLF compris)" "$(od -An -tx1 "$OUTILS/veille.txt" | tr -d ' \n')" "$(SQL meme "select encode(convert_to(command, 'UTF8'), 'hex') from cron.job where jobname = 'pilotage_veille'")"

echo "④ rejoué"
appliquer meme njkiyoklssvefstljemx "$OUTILS/ddl.sql" >/dev/null
verifier "rien ne se double" "2" "$(SQL meme "select count(*) from cron.job")"

echo "⑤ réinjection : le rendu d'origine, sans garde"
projet_neuf origine
appliquer origine fcksxofaelcdmmifnwjo "$OUTILS/ddl-origine.sql" >/dev/null
verifier "le défaut se reproduit : la veille de la production est installée sur le staging" "pilotage_veille" "$(taches origine)"

echo
echo "Bilan : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
