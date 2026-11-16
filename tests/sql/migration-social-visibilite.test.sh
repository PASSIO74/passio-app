#!/usr/bin/env bash
# PostgreSQL JETABLE uniquement. Aucun projet, secret, compte reel ni acces reseau.
# bash tests/sql/migration-social-visibilite.test.sh
# Local sans PostgreSQL natif (PGlite deja installe, aucun telechargement) :
# bash tests/sql/migration-social-visibilite.test.sh --pglite /chemin/package/dist
# Socle 06/11 + definitions EXACTES du catalogue Lead + stories 14/11 + droits recents.
# Limites : auth.uid/jwt et transport Realtime, pg_net/cron sont les stubs du socle.
# SET ROLE et RLS sont reels ; aucune signature JWT ni livraison websocket n'est prouvee.
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURES="$RACINE/tests/sql/fixtures"
MIGRATION="$RACINE/migrations/migration_social_visibilite_2026-11-16.sql"

if [ "${1:-}" = "--pglite" ]; then
  [ -n "${2:-}" ] || { echo 'Chemin dist de PGlite requis'; exit 2; }
  node --input-type=module - "$RACINE" "$2" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [racine, runtime] = process.argv.slice(2);
const charger = (p) => import(pathToFileURL(path.resolve(runtime, p)).href);
const { PGlite } = await charger('index.js');
const { pgcrypto } = await charger('contrib/pgcrypto.js');
const { pg_trgm } = await charger('contrib/pg_trgm.js');
const { uuid_ossp } = await charger('contrib/uuid_ossp.js');
const db = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');
const fixture = (p) => lire('tests/sql/fixtures/' + p);
const migration = lire('migrations/migration_social_visibilite_2026-11-16.sql');
function verdicts(resultats, attendu, nom) {
  const lignes = resultats.flatMap((r) => r.rows ?? []).filter((r) => Object.hasOwn(r, 'valeur') || Object.hasOwn(r, 'verdict'));
  if (lignes.length !== attendu || lignes.some((r) => (r.valeur ?? r.verdict) !== 'OK')) {
    throw new Error(nom + ' : verdict absent, incomplet ou rouge : ' + JSON.stringify(lignes));
  }
  console.log(nom + ' : ' + lignes.length + ' verdict(s) OK');
}
try {
  await db.exec(fixture('socle-production-2026-11-06.sql'));
  await db.exec(fixture('cas-social-visibilite-definitions.sql'));
  verdicts(await db.exec(lire('migrations/migration_story_interactions_2026-11-14.sql')), 5, 'stories prerequisite');
  await db.exec(fixture('cas-social-visibilite-socle-recent.sql'));
  // La fixture doit etre refusee avant TOUT changement si un corps derive.
  const original = (await db.query("select pg_get_functiondef('public.post_is_visible(text)'::regprocedure) as ddl")).rows[0].ddl;
  await db.exec("create or replace function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path to 'public' as $$ select true $$;");
  let refuse = false;
  try { await db.exec(migration); } catch (e) {
    await db.exec('rollback');
    refuse = /Corps prerequisite different/.test(e.message);
  }
  if (!refuse) throw new Error('La migration accepte une empreinte differente');
  if ((await db.query("select count(*)::int as n from pg_policies where policyname='posts_edition_sans_moderation'")).rows[0].n !== 0) throw new Error('Le refus a laisse des policies appliquees');
  await db.exec(original);
  console.log('empreinte divergente : refus et aucune policy appliquee');
  await db.exec('grant update on public.posts to authenticated');
  let droitsRefuses = false;
  try { await db.exec(migration); } catch (e) {
    await db.exec('rollback');
    droitsRefuses = /Droits posts incompatibles/.test(e.message);
  }
  await db.exec('revoke update on public.posts from authenticated');
  await db.exec('grant update(content) on public.posts to authenticated');
  if (!droitsRefuses) throw new Error('La migration accepte UPDATE sur toute la table');
  console.log('droits UPDATE excessifs : refus');
  verdicts(await db.exec(migration), 1, 'application');
  verdicts(await db.exec(migration), 1, 'rejeu');
  await db.exec(fixture('cas-social-visibilite.sql'));
  const { rows } = await db.query('select cas, obtenu, attendu from banc_social.resultats where not ok order by n');
  const total = (await db.query('select count(*)::int as n from banc_social.resultats')).rows[0].n;
  if (rows.length || total < 60) throw new Error(total + ' cas, ecarts : ' + JSON.stringify(rows));
  console.log(total + ' cas de privileges/RLS : OK');
  verdicts(await db.exec(migration), 1, 'rejeu apres les donnees et blocages');
} catch (e) {
  console.error('ECHEC : ' + e.message + (e.code ? ' [' + e.code + ']' : '') + (e.detail ? ' — ' + e.detail : ''));
  process.exitCode = 1;
} finally { await db.close(); }
JS
  exit $?
fi

# En CI Linux : PostgreSQL natif obligatoire. Pas de SKIP silencieux.
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
for outil in initdb pg_ctl psql; do
  command -v "$outil" >/dev/null || { echo "ECHEC : $outil absent (utiliser --pglite pour le controle local)"; exit 1; }
done
PORT=$(( 6210 + RANDOM % 300 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
  PARENT="$(su pgbanc -c 'cd ~ && pwd -P')"
  BASE="$(su pgbanc -c 'mktemp -d -p ~ passio-social.XXXXXXXX')"
  lancer() { su pgbanc -c "PATH='$PATH' $*"; }
else
  PARENT="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
  BASE="$(mktemp -d "$PARENT/passio-social.XXXXXXXX")"
  lancer() { bash -c "PATH='$PATH' $*"; }
fi
BASE="$(cd "$BASE" && pwd -P)"
case "$BASE" in "$PARENT"/passio-social.*) ;; *) echo 'ECHEC : chemin temporaire hors perimetre'; exit 1 ;; esac
nettoyer() {
  lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true
  # Chemin absolu resolu et borne au parent temporaire, dans ce meme shell.
  case "$BASE" in "$PARENT"/passio-social.*) [ -d "$BASE/data" ] && rm -rf -- "$BASE" ;; esac
}
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8 --locale=C" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o '-p $PORT -k $BASE -c listen_addresses=127.0.0.1 -c timezone=UTC -c fsync=off' -l '$BASE/pg.log' start" >/dev/null
Q() { psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 -c "$1"; }
F() { psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tA -F '|' -q -v ON_ERROR_STOP=1 -f "$1"; }
verdict() {
  local fichier="$1" attendu="$2" sortie
  sortie="$(F "$fichier")" || { echo "ECHEC application : $fichier"; return 1; }
  if [ "$(printf '%s\n' "$sortie" | grep -c '|OK$' || true)" != "$attendu" ] || printf '%s\n' "$sortie" | grep -E '\|(ECHEC|anomalie)' >/dev/null; then
    printf 'ECHEC verdict : %s\n%s\n' "$fichier" "$sortie"; return 1
  fi
  printf '%s : %s verdict(s) OK\n' "$(basename "$fichier")" "$attendu"
}
F "$FIXTURES/socle-production-2026-11-06.sql" >/dev/null
F "$FIXTURES/cas-social-visibilite-definitions.sql" >/dev/null
verdict "$RACINE/migrations/migration_story_interactions_2026-11-14.sql" 5
F "$FIXTURES/cas-social-visibilite-socle-recent.sql" >/dev/null
# Empreinte divergente : vrai fichier de migration, jamais un fingerprint assoupli.
Q "select pg_get_functiondef('public.post_is_visible(text)'::regprocedure)" > "$BASE/original.sql"
Q "create or replace function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path to 'public' as \$\$ select true \$\$;"
if F "$MIGRATION" > "$BASE/refus.log" 2>&1; then echo 'ECHEC : empreinte divergente acceptee'; exit 1; fi
grep -q 'Corps prerequisite different' "$BASE/refus.log" || { cat "$BASE/refus.log"; exit 1; }
[ "$(Q "select count(*) from pg_policies where policyname='posts_edition_sans_moderation'")" = 0 ] || exit 1
F "$BASE/original.sql" >/dev/null
Q 'grant update on public.posts to authenticated'
if F "$MIGRATION" > "$BASE/droits.log" 2>&1; then echo 'ECHEC : UPDATE excessif accepte'; exit 1; fi
grep -q 'Droits posts incompatibles' "$BASE/droits.log" || { cat "$BASE/droits.log"; exit 1; }
Q 'revoke update on public.posts from authenticated'
Q 'grant update(content) on public.posts to authenticated'
echo 'Empreinte divergente et UPDATE excessif : refus avant application'
verdict "$MIGRATION" 1
verdict "$MIGRATION" 1
F "$FIXTURES/cas-social-visibilite.sql" >/dev/null
Q "select cas, obtenu, attendu from banc_social.resultats where not ok order by n"
[ "$(Q 'select count(*) from banc_social.resultats where not ok')" = 0 ] || exit 1
TOTAL="$(Q 'select count(*) from banc_social.resultats')"
[ "$TOTAL" -ge 60 ] || { echo 'ECHEC : cas manquants'; exit 1; }
echo "$TOTAL cas de privileges/RLS : OK (PostgreSQL natif jetable)"
verdict "$MIGRATION" 1
