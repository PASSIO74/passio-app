#!/usr/bin/env bash
# Vraie migration + vraie injection du journal, PostgreSQL natif JETABLE.
# Vault, pg_cron et pg_net sont des doubles locaux : aucun HTTP ne peut partir.
# Ce banc ne prouve ni une cle reelle ni le transport Supabase/Edge/GitHub.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
for outil in initdb pg_ctl psql createdb node; do
  command -v "$outil" >/dev/null || { echo "ECHEC : $outil absent, banc natif non execute"; exit 1; }
done
PORT=$((6400 + RANDOM % 150))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
  BASE="$(su pgbanc -c 'mktemp -d /tmp/passio-veille-secret.XXXXXXXX')"
  lancer() { su pgbanc -c "PATH='$PATH' $*"; }
else
  BASE="$(mktemp -d /tmp/passio-veille-secret.XXXXXXXX)"
  lancer() { bash -c "PATH='$PATH' $*"; }
fi
case "$BASE" in /tmp/passio-veille-secret.*) ;; *) echo 'ECHEC : chemin temporaire inattendu'; exit 1 ;; esac
nettoyer() {
  lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true
  case "$BASE" in /tmp/passio-veille-secret.*) [ ! -d "$BASE/data" ] || rm -rf -- "$BASE" ;; esac
}
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8 --locale=C" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses='' -c timezone=UTC\" -l '$BASE/pg.log' start" >/dev/null
createdb -h "$BASE" -p "$PORT" -U postgres passio_test_veille_secret
Q() { psql -X -h "$BASE" -p "$PORT" -U postgres -d passio_test_veille_secret -tA -q -v ON_ERROR_STOP=1 -c "$1"; }
F() { psql -X -h "$BASE" -p "$PORT" -U postgres -d passio_test_veille_secret -tA -q -v ON_ERROR_STOP=1 -f "$1"; }

# Les fichiers envoyes sont produits par les aides reelles du script officiel.
# La seule mutation est une copie locale destinee a prouver le refus de cible.
node - "$RACINE" "$BASE" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const [racine, base] = process.argv.slice(2);
const journal = require(path.join(racine, 'scripts/lib/journal-migrations.js'));
const barriere = require(path.join(racine, 'scripts/lib/barriere-migration.js'));
const fichier = 'migrations/migration_pilotage_veille_secret_2026-11-16.sql';
const sql = fs.readFileSync(path.join(racine, fichier), 'utf8');
fs.writeFileSync(path.join(base, 'journal.sql'), journal.sqlCreation() + '\n' + barriere.sqlColonnesJournal());
for (const [nom, cible] of [['prod', 'njkiyoklssvefstljemx'], ['staging', 'fcksxofaelcdmmifnwjo']]) {
  fs.writeFileSync(path.join(base, nom + '.sql'), barriere.sqlAvecJournal(sql, { fichier, cible, outil: 'appliquer-migration.mjs' }));
}
fs.writeFileSync(path.join(base, 'sans-journal.sql'), sql);
fs.writeFileSync(path.join(base, 'autre-outil.sql'), barriere.sqlAvecJournal(sql, {
  fichier, cible: 'njkiyoklssvefstljemx', outil: 'outil-synthetique-non-officiel'
}));
const garde = 'if projet is distinct from cible_migration then';
if (sql.split(garde).length !== 2) throw new Error('Garde de cible unique introuvable : relire la mutation');
fs.writeFileSync(path.join(base, 'mutant-cible.sql'), barriere.sqlAvecJournal(sql.replace(garde, 'if false then'), {
  fichier, cible: 'fcksxofaelcdmmifnwjo', outil: 'appliquer-migration.mjs'
}));
JS
F "$RACINE/tests/sql/fixtures/cas-pilotage-veille-secret-socle.sql" >/dev/null
F "$BASE/journal.sql" >/dev/null

n=0
verifier() {
  Q "select banc_veille.verifier(($2), '$1')" >/dev/null
  n=$((n+1)); echo "OK $n : $1"
}
reinitialiser() {
  Q "select banc_veille.configurer('njkiyoklssvefstljemx'); select banc_veille.ancien_cron()" >/dev/null
}
refus_migration() {
  local cas="$1" fichier="$2" motif="$3" avant_journal avant_cron avant_http
  avant_journal="$(Q 'select count(*) from public.migrations_appliquees')"
  avant_cron="$(Q "select md5(command) from cron.job where jobname='pilotage_veille'")"
  avant_http="$(Q 'select count(*) from banc_veille.http')"
  if F "$fichier" > "$BASE/refus.log" 2>&1; then echo "ECHEC : $cas a ete accepte"; exit 1; fi
  grep -Fq "$motif" "$BASE/refus.log" || { cat "$BASE/refus.log"; echo "ECHEC : mauvais refus pour $cas"; exit 1; }
  verifier "$cas : journal et cron annules, aucun HTTP" \
    "(select count(*) from public.migrations_appliquees)=$avant_journal and (select md5(command) from cron.job where jobname='pilotage_veille')='$avant_cron' and (select count(*) from banc_veille.http)=$avant_http"
}
refus_tick() {
  local cas="$1" motif="$2" avant_http
  avant_http="$(Q 'select count(*) from banc_veille.http')"
  if Q 'select banc_veille.executer_cron()' > "$BASE/tick-refuse.log" 2>&1; then echo "ECHEC : $cas a emis"; exit 1; fi
  grep -Fq "$motif" "$BASE/tick-refuse.log" || { cat "$BASE/tick-refuse.log"; exit 1; }
  verifier "$cas : aucune emission" "(select count(*) from banc_veille.http)=$avant_http"
}

Q 'select banc_veille.ancien_cron()' >/dev/null
F "$BASE/prod.sql" >/dev/null
verifier 'Vault absent ferme la veille ancienne' "not exists(select 1 from cron.job where jobname='pilotage_veille') and not exists(select 1 from banc_veille.http)"
Q 'call banc_veille.installer_vault(); select banc_veille.ancien_cron()' >/dev/null
F "$BASE/prod.sql" >/dev/null
verifier 'Vault vide ne planifie aucun appel' "not exists(select 1 from cron.job where jobname='pilotage_veille')"

for nom in pilotage_veille_projet pilotage_veille_edge_disponible; do
  reinitialiser
  Q "delete from vault.decrypted_secrets where name='$nom'" >/dev/null
  F "$BASE/prod.sql" >/dev/null
  verifier "$nom absent refuse activation" "not exists(select 1 from cron.job where jobname='pilotage_veille')"
  reinitialiser
  Q "insert into vault.decrypted_secrets select * from vault.decrypted_secrets where name='$nom'" >/dev/null
  F "$BASE/prod.sql" >/dev/null
  verifier "$nom ambigu refuse activation" "not exists(select 1 from cron.job where jobname='pilotage_veille')"
done
reinitialiser
Q "update vault.decrypted_secrets set decrypted_secret='0' where name='pilotage_veille_edge_disponible'" >/dev/null
F "$BASE/prod.sql" >/dev/null
verifier 'Edge non disponible retire ancien cron sans HTTP' "not exists(select 1 from cron.job where jobname='pilotage_veille') and not exists(select 1 from banc_veille.http)"

for role in anon authenticated; do
  reinitialiser
  Q "grant select on vault.decrypted_secrets to $role" >/dev/null
  refus_migration "Vault lisible par $role" "$BASE/prod.sql" 'Vault accessible aux roles clients'
  Q "revoke select on vault.decrypted_secrets from $role" >/dev/null
done
reinitialiser
refus_migration 'configuration production sur cible staging' "$BASE/staging.sql" 'Projet Vault different de la cible du script officiel'
refus_migration 'journal dune transaction ancienne ne suffit pas' "$BASE/sans-journal.sql" 'query returned no rows'
refus_migration 'outil non officiel refuse' "$BASE/autre-outil.sql" 'query returned no rows'

reinitialiser
Q "update vault.decrypted_secrets set decrypted_secret='projet-inconnu' where name='pilotage_veille_projet'" >/dev/null
refus_migration 'projet hors liste' "$BASE/prod.sql" 'Projet Vault hors liste autorisee'
reinitialiser
Q "update vault.decrypted_secrets set decrypted_secret='https://fcksxofaelcdmmifnwjo.supabase.co' where name='pilotage_veille_base_url'" >/dev/null
refus_migration 'URL dun autre projet' "$BASE/prod.sql" 'URL Vault differente du projet cible declare'
for nom in pilotage_veille_secret pilotage_veille_anon_key; do
  reinitialiser
  Q "insert into vault.decrypted_secrets select * from vault.decrypted_secrets where name='$nom'" >/dev/null
  refus_migration "$nom duplique" "$BASE/prod.sql" 'Configuration Vault de la veille absente ou ambigue'
  reinitialiser
  Q "update vault.decrypted_secrets set decrypted_secret=' ' where name='$nom'" >/dev/null
  refus_migration "$nom vide" "$BASE/prod.sql" 'Configuration Vault de la veille absente ou ambigue'
  reinitialiser
  Q "insert into vault.decrypted_secrets(name,decrypted_secret) values('$nom',' ')" >/dev/null
  refus_migration "$nom valide avec doublon vide" "$BASE/prod.sql" 'Configuration Vault de la veille absente ou ambigue'
done
reinitialiser
Q "insert into vault.decrypted_secrets select * from vault.decrypted_secrets where name='pilotage_veille_base_url'" >/dev/null
refus_migration 'URL dupliquee' "$BASE/prod.sql" 'query returned more than one row'

reinitialiser
F "$BASE/prod.sql" >/dev/null
verifier 'bonne cible planifie exactement une veille authentifiee' "(select count(*) from cron.job where jobname='pilotage_veille' and username=current_user and schedule='*/5 * * * *')=1"
verifier 'cron ne stocke ni secret ni cle synthetiques' "not exists(select 1 from cron.job where jobname='pilotage_veille' and (position('secret-synthetique-initial' in command)>0 or position('cle-publique-synthetique-initiale' in command)>0))"
F "$BASE/prod.sql" >/dev/null
verifier 'rejeu reste unique' "(select count(*) from cron.job where jobname='pilotage_veille')=1"
Q 'select banc_veille.executer_cron()' >/dev/null
verifier 'tick utilise destination et headers Vault, corps et delai attendus' "(select count(*) from banc_veille.http)=1 and exists(select 1 from banc_veille.http where url='https://njkiyoklssvefstljemx.supabase.co/functions/v1/pilotage' and headers=jsonb_build_object('Content-Type','application/json','Authorization','Bearer cle-publique-synthetique-initiale','x-passio-veille','secret-synthetique-initial') and body=jsonb_build_object('action','veille') and timeout_milliseconds=30000)"
Q "create table banc_veille.commande_initiale as select command from cron.job where jobname='pilotage_veille'; update vault.decrypted_secrets set decrypted_secret='secret-synthetique-tourne' where name='pilotage_veille_secret'; update vault.decrypted_secrets set decrypted_secret='cle-publique-synthetique-tournee' where name='pilotage_veille_anon_key'; select banc_veille.executer_cron()" >/dev/null
verifier 'rotation relue au tick sans replanification' "(select count(*) from banc_veille.http)=2 and exists(select 1 from banc_veille.http where id=2 and headers->>'x-passio-veille'='secret-synthetique-tourne' and headers->>'Authorization'='Bearer cle-publique-synthetique-tournee') and (select command from banc_veille.commande_initiale)=(select command from cron.job where jobname='pilotage_veille')"

Q "update vault.decrypted_secrets set decrypted_secret='0' where name='pilotage_veille_edge_disponible'" >/dev/null
refus_tick 'Edge desactivee apres planification' 'Veille desactivee ou projet Vault modifie'
Q "update vault.decrypted_secrets set decrypted_secret='1' where name='pilotage_veille_edge_disponible'; update vault.decrypted_secrets set decrypted_secret='fcksxofaelcdmmifnwjo' where name='pilotage_veille_projet'" >/dev/null
refus_tick 'projet modifie apres planification' 'Veille desactivee ou projet Vault modifie'
Q "update vault.decrypted_secrets set decrypted_secret='njkiyoklssvefstljemx' where name='pilotage_veille_projet'; update vault.decrypted_secrets set decrypted_secret='https://fcksxofaelcdmmifnwjo.supabase.co' where name='pilotage_veille_base_url'" >/dev/null
refus_tick 'URL modifiee apres planification' 'URL Vault differente du projet cible'
Q "update vault.decrypted_secrets set decrypted_secret='https://njkiyoklssvefstljemx.supabase.co' where name='pilotage_veille_base_url'; update vault.decrypted_secrets set decrypted_secret='' where name='pilotage_veille_secret'" >/dev/null
refus_tick 'secret retire apres planification' 'Configuration Vault de la veille absente'
Q "update vault.decrypted_secrets set decrypted_secret='secret-synthetique-tourne' where name='pilotage_veille_secret'; insert into vault.decrypted_secrets select * from vault.decrypted_secrets where name='pilotage_veille_secret'" >/dev/null
refus_tick 'secret duplique apres planification' 'query returned more than one row'

# Reinjection : sans la comparaison a la cible du journal, le staging accepte
# une configuration de production. Le meme cas a ete refuse avec le vrai SQL.
reinitialiser
F "$BASE/mutant-cible.sql" >/dev/null
verifier 'reinjection sans garde reproduit la mauvaise cible' "exists(select 1 from cron.job where jobname='pilotage_veille' and position('njkiyoklssvefstljemx' in command)>0)"
Q "select banc_veille.configurer('fcksxofaelcdmmifnwjo')" >/dev/null
F "$BASE/staging.sql" >/dev/null
Q 'select banc_veille.executer_cron()' >/dev/null
verifier 'staging conforme emet uniquement vers sa cible locale simulee' "(select url from banc_veille.http order by id desc limit 1)='https://fcksxofaelcdmmifnwjo.supabase.co/functions/v1/pilotage'"
verifier 'autre cron preserve et aucun droit client sur journal' "(select count(*) from cron.job where jobname='purge_locale')=1 and not has_table_privilege('anon','public.migrations_appliquees','select') and not has_table_privilege('authenticated','public.migrations_appliquees','select')"
echo "Banc veille authentifiee : $n controles OK (PostgreSQL natif, aucun reseau)"
