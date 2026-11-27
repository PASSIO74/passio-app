#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_stories_proches_une_2026-11-26.sql
# Stories « Amis proches » (liste de l'auteur, lecture restreinte) et « À la une » (épingles au-delà
# de 24 h, médias résolus, purge épargnée).
#
# Sur un PostgreSQL jetable, avec la STRUCTURE de production (medias-proteges-socle.sql : socle du
# 06/11 + lots sociaux + stories, sessions et Storage simulés ; aucune donnée réelle), puis les
# migrations des médias protégés et du sondage, et le corps de `purger_socle` relu en production :
#   ① la migration REFUSE une base dont la policy de lecture des stories a dérivé ;
#   ② elle s'applique, son tableau de verdict ne porte aucun ÉCHEC, elle se rejoue ;
#   ③ chaque règle est éprouvée sous l'identité concernée : auteur, ami proche, abonné non proche,
#      inconnu, compte bloqué, visiteur (anon), compte privé.
#
#   bash tests/sql/migration-stories-proches-une.test.sh
#
# Prérequis : binaires serveur PostgreSQL. Ne touche AUCUNE base réelle (127.0.0.1, cluster neuf).
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SOCLE="$RACINE/tests/sql/fixtures/medias-proteges-socle.sql"
CAS="$RACINE/tests/sql/fixtures/cas-stories-proches-une-2026-11-26.sql"
MEDIAS="$RACINE/migrations/migration_medias_proteges_go_2026-11-16.sql"
SONDAGE="$RACINE/migrations/migration_story_sondage_2026-11-26.sql"
PURGE="$RACINE/tests/sql/fixtures/purger-socle-prod-2026-11-26.sql"
MIGRATION="$RACINE/migrations/migration_stories_proches_une_2026-11-26.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$SOCLE" "$CAS" "$MEDIAS" "$SONDAGE" "$PURGE" "$MIGRATION"; do [ -f "$f" ] || { echo "❌ fichier introuvable : $f"; exit 1; }; done

PORT=$(( 6100 + RANDOM % 50 ))
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

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$3" "$2"; fi; }

QD postgres "create database banc" >/dev/null
if ! sortie="$(FICHIER banc "$SOCLE")"; then echo "❌ socle : $sortie" | head -5; exit 1; fi

# Fonctions de production postérieures au socle (relues au catalogue le 2026-11-14).
QD banc "$(cat <<'SQL'
create table if not exists public.debit_ecritures (minute timestamptz not null, table_nom text not null, source text not null, n integer not null default 0, primary key (minute, table_nom, source));
create or replace function public.debit_compter(p_table text, p_source text, p_plafond integer) returns void
language plpgsql security definer set search_path to '' as $function$
declare v integer;
begin
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (date_trunc('minute', now()), p_table, p_source, 1)
  on conflict (minute, table_nom, source) do update set n = d.n + 1
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: max % insertions/minute sur %', p_plafond, p_table using errcode = 'P0001';
  end if;
end $function$;
create or replace function public.debit_par_compte() returns trigger
language plpgsql security definer set search_path to '' as $function$
declare moi text := (auth.uid())::text;
begin
  if moi is null then return new; end if;
  perform public.debit_compter(tg_table_name, moi, tg_argv[0]::int);
  return new;
end $function$;
create or replace function public.ligne_bornee() returns trigger
language plpgsql set search_path to '' as $function$
begin
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated')
     and pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text) > tg_argv[0]::integer then
    raise exception 'ligne trop volumineuse sur %', tg_table_name using errcode = '22001';
  end if;
  return new;
end $function$;
SQL
)" >/dev/null || { echo "❌ fonctions de production postérieures au socle"; exit 1; }

# Prérequis en production : médias protégés (11-16), sondage (11-26), purge (corps relu le 26/11).
if ! sortie="$(FICHIER banc "$MEDIAS")"; then echo "❌ prérequis médias protégés : $sortie" | head -5; exit 1; fi
if ! sortie="$(FICHIER banc "$SONDAGE")"; then echo "❌ prérequis sondage : $sortie" | head -5; exit 1; fi
if ! sortie="$(FICHIER banc "$PURGE")"; then echo "❌ prérequis purge : $sortie" | head -5; exit 1; fi

echo "══ ① Les empreintes du banc sont celles de la production (relues le 2026-11-26) ══"
verifier "purger_socle = corps de production" "$(QD banc "select md5(pg_get_functiondef('rencontres_prive.purger_socle()'::regprocedure))")" "a73992a8c1628a71e33d6f39b1fbe10a"
verifier "policy de lecture des stories = production" "$(QD banc "select md5(pg_get_expr(polqual, polrelid)) from pg_policy where polrelid = 'public.stories'::regclass and polcmd = 'r'")" "111ac554780891654f2632a1b469f676"
verifier "media_assets_anon = production" "$(QD banc "select md5(pg_get_expr(polqual, polrelid)) from pg_policy where polrelid = 'public.media_assets'::regclass and polname = 'media_assets_anon'")" "79596dd0076ba143a7e7905e035c8a04"
verifier "media_assets_user = production" "$(QD banc "select md5(pg_get_expr(polqual, polrelid)) from pg_policy where polrelid = 'public.media_assets'::regclass and polname = 'media_assets_user'")" "dd8b21a043e79a30018d504c6bef70c6"

echo "══ ② Une base qui a dérivé est refusée, sans rien laisser ══"
QD banc "create policy banc_source_non_revue on public.stories for select to anon using (true)" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "une policy de lecture de plus sur stories : refus" "$([ "$code" -ne 0 ] && echo refus || echo applique)" "refus"
verifier "… et rien n'est posé" "$(QD banc "select (to_regclass('public.amis_proches') is null and not exists (select 1 from information_schema.columns where table_name = 'stories' and column_name = 'audience'))::text")" "true"
QD banc "drop policy banc_source_non_revue on public.stories" >/dev/null
QD banc "create or replace function rencontres_prive.purger_socle() returns jsonb language sql as \$\$ select '{}'::jsonb \$\$" >/dev/null
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "un corps de purge différent : refus" "$([ "$code" -ne 0 ] && echo refus || echo applique)" "refus"
if ! sortie="$(FICHIER banc "$PURGE")"; then echo "❌ purge : $sortie" | head -5; exit 1; fi

echo "══ ③ La migration s'applique, se vérifie, se rejoue ══"
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "la migration s'applique" "$code" "0"
[ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
verifier "aucun ÉCHEC au tableau de verdict" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
verifier "le verdict porte ses 8 lignes OK" "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "8"
sortie2="$(FICHIER banc "$MIGRATION")"; code2=$?
verifier "la migration se rejoue" "$code2" "0"
[ "$code2" -ne 0 ] && printf '%s\n' "$sortie2" | head -8
verifier "au rejeu, le verdict reste entier" "$(printf '%s\n' "$sortie2" | grep -c '§OK$' || true)" "8"

echo "══ ④ Les règles, sous chaque identité ══"
if ! sortie="$(FICHIER banc "$CAS")"; then echo "❌ cas : $sortie" | head -8; ko=$((ko+1)); else
  total="$(QD banc "select count(*) from banc_sp.resultats")"
  ecarts="$(QD banc "select count(*) from banc_sp.resultats where not ok")"
  verifier "$total cas, 0 écart" "$ecarts" "0"
  [ "$ecarts" != "0" ] && QD banc "select '     · ' || cas || ' — attendu ' || attendu || ', obtenu ' || coalesce(obtenu, 'nul') from banc_sp.resultats where not ok order by n"
fi

echo
echo "verts : $ok · rouges : $ko"
[ "$ko" -eq 0 ]
