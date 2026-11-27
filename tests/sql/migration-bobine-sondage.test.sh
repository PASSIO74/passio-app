#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_bobine_sondage_2026-11-27.sql
# Sticker sondage des BOBINES : un vote par compte, résultats après le vote, l'auteur voit tout.
#
# Sur un PostgreSQL jetable, avec la STRUCTURE de production (socle-production-2026-11-06.sql,
# aucune donnée), PUIS ce que la production portait de plus le 2026-11-27 et dont la migration
# dépend (bobine-sondage-production-2026-11-27.sql : `post_is_visible` et ses aides, les
# restrictives de lecture de `posts`, le débit, la suspension — empreintes COMPARÉES à celles
# lues en production, le fichier lève s'il en dérive), et des identités simulées (auteur public,
# auteur privé, abonné accepté, abonné en attente, inconnus, bloqué dans chaque sens, compte en
# suppression, compte suspendu, invité d'une activité privée, visiteur) :
#   ① la migration s'applique, son tableau de verdict ne porte aucun ÉCHEC, elle se rejoue ;
#   ② chaque règle de lecture / écriture est éprouvée sous l'identité concernée ;
#   ③ MUTATIONS sur la base migrée : la visibilité retirée d'une aide → la sonde VOIT le trou,
#      et rejouer la migration le referme ; des droits rouverts → rejouer les retire ; une policy
#      ajoutée à la main → le verdict LÈVE ;
#   ④ RETOUR ARRIÈRE : le bloc `--|` de l'en-tête s'exécute tel quel, ne laisse rien ;
#   ⑤ GARDES, depuis une base sans rien : `post_is_visible` sans la règle attendue, une aide
#      absente, une table publiée, `posts.overlays` modifiable → la migration refuse et RIEN
#      n'est posé ; puis elle se réapplique sur la base rendue à la production, cette fois sous
#      les privilèges par défaut de la PRODUCTION (rien pour anon ni authenticated sous
#      `postgres`) : ①-③ éprouvent ses retraits, ⑤ ses octrois.
#
#   bash tests/sql/migration-bobine-sondage.test.sh
#
# Prérequis : binaires serveur PostgreSQL. Ne touche AUCUNE base réelle (127.0.0.1, cluster neuf).
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SOCLE="$RACINE/tests/sql/fixtures/socle-production-2026-11-06.sql"
PRODUCTION="$RACINE/tests/sql/fixtures/bobine-sondage-production-2026-11-27.sql"
CAS="$RACINE/tests/sql/fixtures/cas-bobine-sondage-2026-11-27.sql"
MIGRATION="$RACINE/migrations/migration_bobine_sondage_2026-11-27.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$SOCLE" "$PRODUCTION" "$CAS" "$MIGRATION"; do [ -f "$f" ] || { echo "❌ fichier introuvable : $f"; exit 1; }; done

PORT=$(( 7600 + RANDOM % 100 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
  chmod -R a+rX "$RACINE/tests/sql/fixtures" "$RACINE/migrations" 2>/dev/null || true
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8 --locale=C" >/dev/null 2>&1
case "$(uname -s)" in MINGW*|MSYS*) SOCKET="" ;; *) SOCKET="-k $BASE" ;; esac
lancer "pg_ctl -D '$BASE/data' -o \"-p $PORT $SOCKET -c listen_addresses=127.0.0.1 -c timezone=UTC -c fsync=off\" -l '$BASE/pg.log' start" >/dev/null 2>&1 &
demarre=0
for _ in $(seq 1 60); do
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tA -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

QD()      { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
FICHIER() { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
# Une valeur lue SOUS une identité (aides du fichier de cas : `set local role` et la requête dans le même appel).
SOUS()    { QD banc "select banc.val(banc.id('$1'), \$banc\$$2\$banc\$)"; }
# Le bloc de retour arrière de l'en-tête, tel quel, `--|` ôté.
RETOUR_ARRIERE() { sed -n 's/^--| \{0,1\}//p' "$MIGRATION" | psql -h 127.0.0.1 -p "$PORT" -U postgres -d banc -tA -q -v ON_ERROR_STOP=1 2>&1; }
OBJETS()  { QD banc "select coalesce(to_regclass('public.bobine_sondage_votes')::text, 'aucune table') || ' / ' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'bobine\\_%') || ' fonction(s)'"; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$3" "$2"; fi; }
# verifier_refus <libellé> <code de sortie> <sortie> <motif attendu dans la sortie>
verifier_refus() {
  local dit="non"; printf '%s\n' "$3" | grep -q -- "$4" && dit="oui"
  if [ "$2" -ne 0 ] && [ "$dit" = "oui" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     attendu : un refus citant « %s »\n     obtenu  : code %s — %s\n' "$1" "$4" "$2" "$(printf '%s\n' "$3" | grep -E 'ERROR|ERREUR' | head -2)"; fi
}

QD postgres "create database banc" >/dev/null
if ! sortie="$(FICHIER banc "$SOCLE")"; then echo "❌ socle : $sortie" | head -5; exit 1; fi
# La production du 2026-11-27 : le fichier LÈVE si une empreinte s'écarte de celle lue au catalogue.
if ! sortie="$(FICHIER banc "$PRODUCTION")"; then echo "❌ production du 2026-11-27 : $sortie" | head -5; exit 1; fi

echo "══ ① La migration s'applique, se vérifie, se rejoue ══"
verifier "avant : ni table ni fonction" "$(OBJETS)" "aucune table / 0 fonction(s)"
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "la migration s'applique" "$code" "0"
[ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
verifier "aucun ÉCHEC au tableau de verdict" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
verifier "le verdict porte ses 10 lignes OK" "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "10"
verifier "après : la table et ses trois fonctions" "$(OBJETS)" "bobine_sondage_votes / 3 fonction(s)"
sortie2="$(FICHIER banc "$MIGRATION")"; code2=$?
verifier "la migration se rejoue" "$code2" "0"
[ "$code2" -ne 0 ] && printf '%s\n' "$sortie2" | head -8
verifier "rejouée : toujours 10 lignes OK" "$(printf '%s\n' "$sortie2" | grep -c '§OK$' || true)" "10"

echo "══ ② Les règles, sous chaque identité ══"
if ! sortie="$(FICHIER banc "$CAS")"; then echo "❌ cas : $sortie" | head -8; ko=$((ko+1)); else
  total="$(QD banc "select count(*) from banc.resultats")"
  ecarts="$(QD banc "select count(*) from banc.resultats where not ok")"
  verifier "$total cas, 0 écart" "$ecarts" "0"
  [ "$ecarts" != "0" ] && QD banc "select '     · ' || cas || ' — attendu ' || attendu || ', obtenu ' || coalesce(obtenu, 'nul') from banc.resultats where not ok order by n"
  # Un fichier de cas tronqué resterait « 0 écart » : le nombre de cas est une borne basse.
  verifier "au moins 85 cas ont tourné" "$([ "${total:-0}" -ge 85 ] && echo oui || echo "non ($total)")" "oui"
fi

echo "══ ③ Mutations sur la base migrée ══"
# W est abonné EN ATTENTE du compte privé P : il ne voit pas `bP`.
verifier "prémisse : l'abonné en attente ne voit pas le sondage de la bobine privée" "$(SOUS W "select public.bobine_sondage_visible('bP')::text")" "false"
QD banc "create or replace function public.bobine_sondage_visible(_post_id text) returns boolean
  language sql stable security definer set search_path = '' as \$fn\$
    select exists (select 1 from public.posts p where p.id = _post_id and p.is_reel is true)
  \$fn\$" >/dev/null
verifier "mutation (aide sans visibilité) : la sonde VOIT le trou" "$(SOUS W "select public.bobine_sondage_visible('bP')::text")" "true"
verifier "mutation : le vote sur la bobine privée passerait" "$(QD banc "select banc.sous(banc.id('W'), \$s\$insert into public.bobine_sondage_votes (post_id, choix) values ('bP', 0)\$s\$)")" "ok:1"
QD banc "delete from public.bobine_sondage_votes where post_id = 'bP' and user_id = banc.id('W')" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "rejouer la migration remet l'aide" "$code/$(SOUS W "select public.bobine_sondage_visible('bP')::text")" "0/false"

QD banc "grant all on public.bobine_sondage_votes to anon, authenticated" >/dev/null
verifier "mutation (droits rouverts) : un compte pourrait modifier, un visiteur lire" "$(QD banc "select has_table_privilege('authenticated', 'public.bobine_sondage_votes', 'update')::text || '/' || has_table_privilege('anon', 'public.bobine_sondage_votes', 'select')::text")" "true/true"
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "rejouer la migration retire ces droits" "$code/$(QD banc "select has_table_privilege('authenticated', 'public.bobine_sondage_votes', 'update')::text || '/' || has_table_privilege('authenticated', 'public.bobine_sondage_votes', 'delete')::text || '/' || has_column_privilege('authenticated', 'public.bobine_sondage_votes', 'user_id', 'insert')::text || '/' || has_table_privilege('anon', 'public.bobine_sondage_votes', 'select')::text")" "0/false/false/false/false"

QD banc "create policy lecture_de_trop on public.bobine_sondage_votes for select to authenticated using (true)" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier_refus "mutation (policy ajoutée à la main) : le verdict LÈVE" "$code" "$sortie" "verdict en ECHEC"
verifier "… et nomme la ligne 1" "$(printf '%s\n' "$sortie" | grep -c '^1§.*§ECHEC$' || true)" "1"
QD banc "drop policy lecture_de_trop on public.bobine_sondage_votes" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "la policy retirée, la migration repasse (10 OK)" "$code/$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "0/10"

echo "══ ④ Retour arrière ══"
sortie="$(RETOUR_ARRIERE)"; code=$?
verifier "le bloc --| de l'en-tête s'exécute tel quel" "$code" "0"
[ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -5
verifier "il ne laisse ni table ni fonction" "$(OBJETS)" "aucune table / 0 fonction(s)"
sortie="$(RETOUR_ARRIERE)"; code=$?
verifier "il se rejoue sans erreur" "$code" "0"

echo "══ ⑤ Gardes : la migration refuse, et rien n'est posé ══"
QD banc "create or replace function public.post_is_visible(pid text) returns boolean
  language sql stable security definer set search_path to 'public' as \$fn\$
    select exists (select 1 from posts p where p.id = pid and (p.author_id = (select auth.uid())::text
      or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
      or public.abonne_accepte_non_bloque(p.author_id)))
  \$fn\$" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier_refus "post_is_visible sans blocage ni masquage (celle du socle du 06/11) : refus" "$code" "$sortie" "post_is_visible n'a pas la définition attendue"
verifier "… rien n'est posé" "$(OBJETS)" "aucune table / 0 fonction(s)"
if ! sortie="$(FICHIER banc "$PRODUCTION")"; then echo "❌ production (rejeu) : $sortie" | head -5; ko=$((ko+1)); fi

QD banc "drop function public.debit_par_compte()" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier_refus "une aide de production absente (debit_par_compte) : refus" "$code" "$sortie" "une aide de production manque"
verifier "… rien n'est posé" "$(OBJETS)" "aucune table / 0 fonction(s)"
if ! sortie="$(FICHIER banc "$PRODUCTION")"; then echo "❌ production (rejeu) : $sortie" | head -5; ko=$((ko+1)); fi

QD banc "create publication banc_tout for all tables" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier_refus "une publication qui emporterait la table : le verdict LÈVE" "$code" "$sortie" "verdict en ECHEC"
verifier "… et nomme la ligne 8" "$(printf '%s\n' "$sortie" | grep -c '^8§.*§ECHEC$' || true)" "1"
verifier "… rien n'est validé" "$(OBJETS)" "aucune table / 0 fonction(s)"
QD banc "drop publication banc_tout" >/dev/null

QD banc "grant update (overlays) on public.posts to authenticated" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier_refus "posts.overlays modifiable par un client : le verdict LÈVE" "$code" "$sortie" "verdict en ECHEC"
verifier "… et nomme la ligne 10" "$(printf '%s\n' "$sortie" | grep -c '^10§.*§ECHEC$' || true)" "1"
verifier "… rien n'est validé" "$(OBJETS)" "aucune table / 0 fonction(s)"
QD banc "revoke update (overlays) on public.posts from authenticated" >/dev/null

# Jusqu'ici, les privilèges par défaut du socle (TOUT à anon et authenticated) : ce sont les
# RETRAITS de la migration qui ont été éprouvés. Ceux de la PRODUCTION (mesurés le 2026-11-27,
# `pg_default_acl`) ne donnent rien sous `postgres` : ce sont ses OCTROIS qu'il faut éprouver.
QD banc "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
         alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
         alter default privileges for role postgres revoke execute on functions from public" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "la base rendue à la production, privilèges par défaut de production : la migration se réapplique (10 OK)" "$code/$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "0/10"
verifier "… la bobine privée reste fermée à l'abonné en attente" "$(SOUS W "select public.bobine_sondage_visible('bP')::text")" "false"
verifier "… un compte vote (octrois suffisants : colonnes, aides des policies)" "$(QD banc "select banc.sous(banc.id('I'), \$s\$insert into public.bobine_sondage_votes (post_id, choix) values ('bE', 0)\$s\$)")" "ok:1"
verifier "… et lit ses résultats" "$(SOUS I "select public.bobine_sondage_resultats('bE')::text")" '{"a": 1, "b": 0, "a_vote": true, "mon_choix": 0}'
verifier "… un visiteur n'appelle toujours rien" "$(QD banc "select banc.val(null, \$s\$select public.bobine_sondage_resultats('bE')::text\$s\$) || '/' || banc.val(null, \$s\$select count(*)::text from public.bobine_sondage_votes\$s\$)")" "err:42501/err:42501"

echo
echo "verts : $ok · rouges : $ko"
[ "$ko" -eq 0 ]
