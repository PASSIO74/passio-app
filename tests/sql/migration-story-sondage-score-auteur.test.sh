#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_story_sondage_score_auteur_2026-11-27.sql
# Le score du sondage des stories se compte du point de vue de l'AUTEUR, plus de l'appelant
# (oracle trouvé par la red team du sondage des bobines, 2026-11-27).
#
# Sur un PostgreSQL jetable, avec la STRUCTURE de production (même socle et mêmes compléments que
# tests/sql/migration-story-sondage.test.sh) :
#   ① la migration du 2026-11-26 PUIS le correctif s'appliquent, verdicts sans ÉCHEC, rejeu ;
#   ② les 26 cas du sondage des stories tiennent toujours, et l'oracle par blocage est fermé ;
#   ③ le retour arrière de l'en-tête s'exécute tel quel et ROUVRE l'oracle (il remet bien
#      l'ancienne définition), puis le correctif se réapplique ;
#   ④ la garde refuse une base sans le sondage des stories.
#
#   bash tests/sql/migration-story-sondage-score-auteur.test.sh
#
# Prérequis : binaires serveur PostgreSQL. Ne touche AUCUNE base réelle (127.0.0.1, cluster neuf).
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SOCLE="$RACINE/tests/sql/fixtures/socle-production-2026-11-06.sql"
CAS="$RACINE/tests/sql/fixtures/cas-story-sondage-2026-11-26.sql"
PREALABLE="$RACINE/migrations/migration_story_interactions_2026-11-14.sql"
MIGRATION="$RACINE/migrations/migration_story_sondage_2026-11-26.sql"
CORRECTIF="$RACINE/migrations/migration_story_sondage_score_auteur_2026-11-27.sql"
CAS_CORRECTIF="$RACINE/tests/sql/fixtures/cas-story-sondage-score-auteur-2026-11-27.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$SOCLE" "$CAS" "$PREALABLE" "$MIGRATION" "$CORRECTIF" "$CAS_CORRECTIF"; do [ -f "$f" ] || { echo "❌ fichier introuvable : $f"; exit 1; }; done

PORT=$(( 6240 + RANDOM % 50 ))
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

# Prérequis appliqué en production le 2026-11-14 : story_visible, story_est_a_moi.
if ! sortie="$(FICHIER banc "$PREALABLE")"; then echo "❌ prérequis story_interactions : $sortie" | head -5; exit 1; fi

# Le bloc de retour arrière de l'en-tête du correctif, tel quel, `--|` ôté.
RETOUR_ARRIERE() { sed -n 's/^--| \{0,1\}//p' "$CORRECTIF" | psql -h 127.0.0.1 -p "$PORT" -U postgres -d banc -tA -q -v ON_ERROR_STOP=1 2>&1; }
DEFINITION_OUVERTE() { QD banc "select (pg_get_functiondef('public.story_sondage_resultats(text)'::regprocedure) like '%is_blocked_with(v.user_id)%')::text"; }

echo "══ ① Le sondage des stories, puis le correctif ══"
sortie="$(FICHIER banc "$MIGRATION")"; code=$?
verifier "la migration du 2026-11-26 s'applique (5 OK)" "$code/$(printf '%s\n' "$sortie" | grep -c 'OK$' || true)" "0/5"
verifier "prémisse : l'ancienne définition compte selon les blocages de l'appelant" "$(DEFINITION_OUVERTE)" "true"
sortie="$(FICHIER banc "$CORRECTIF")"; code=$?
verifier "le correctif s'applique" "$code" "0"
[ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
verifier "aucun ÉCHEC à son verdict" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
verifier "son verdict porte ses 4 lignes OK" "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "4"
verifier "la définition ne dépend plus des blocages de l'appelant" "$(DEFINITION_OUVERTE)" "false"
sortie2="$(FICHIER banc "$CORRECTIF")"; code2=$?
verifier "le correctif se rejoue (4 OK)" "$code2/$(printf '%s\n' "$sortie2" | grep -c '§OK$' || true)" "0/4"

echo "══ ② Les règles du sondage tiennent, l'oracle est fermé ══"
if ! sortie="$(FICHIER banc "$CAS")"; then echo "❌ cas : $sortie" | head -8; ko=$((ko+1)); fi
if ! sortie="$(FICHIER banc "$CAS_CORRECTIF")"; then echo "❌ cas du correctif : $sortie" | head -8; ko=$((ko+1)); fi
total="$(QD banc "select count(*) from banc.resultats")"
ecarts="$(QD banc "select count(*) from banc.resultats where not ok")"
verifier "$total cas (ceux du 2026-11-26 et ceux du correctif), 0 écart" "$ecarts" "0"
[ "$ecarts" != "0" ] && QD banc "select '     · ' || cas || ' — attendu ' || attendu || ', obtenu ' || coalesce(obtenu, 'nul') from banc.resultats where not ok order by n"
verifier "au moins 34 cas ont tourné" "$([ "${total:-0}" -ge 34 ] && echo oui || echo "non ($total)")" "oui"

echo "══ ③ Retour arrière ══"
# Les votes du banc : B Plage, M Montagne sur sA ; plus aucun blocage entre eux.
QD banc "delete from public.blocks where blocker_id in (banc.id('A'), banc.id('B'), banc.id('M')) and blocked_id in (banc.id('A'), banc.id('B'), banc.id('M'))" >/dev/null
sortie="$(RETOUR_ARRIERE)"; code=$?
verifier "le bloc --| de l'en-tête s'exécute tel quel" "$code" "0"
[ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -5
verifier "il remet l'ancienne définition" "$(DEFINITION_OUVERTE)" "true"
QD banc "insert into public.blocks (blocker_id, blocked_id) values (banc.id('B'), banc.id('M'))" >/dev/null
verifier "… et l'oracle avec elle (B bloque M : le score de B perd le vote de M)" "$(QD banc "select banc.val(banc.id('B'), \$s\$select (public.story_sondage_resultats('sA') ->> 'a') || '/' || (public.story_sondage_resultats('sA') ->> 'b')\$s\$)")" "1/0"
sortie="$(FICHIER banc "$CORRECTIF")"; code=$?
verifier "le correctif se réapplique (4 OK)" "$code/$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "0/4"
verifier "… et referme l'oracle" "$(QD banc "select banc.val(banc.id('B'), \$s\$select (public.story_sondage_resultats('sA') ->> 'a') || '/' || (public.story_sondage_resultats('sA') ->> 'b')\$s\$)")" "1/1"

echo "══ ④ Garde ══"
QD postgres "create database banc_vide" >/dev/null
if ! sortie="$(FICHIER banc_vide "$SOCLE")"; then echo "❌ socle (base vide) : $sortie" | head -5; ko=$((ko+1)); fi
sortie="$(FICHIER banc_vide "$CORRECTIF")"; code=$?
verifier "sans le sondage des stories : la garde refuse" "$code/$(printf '%s\n' "$sortie" | grep -c 'prérequis absent' || true)" "3/1"
verifier "… et rien n'est posé" "$(QD banc_vide "select coalesce(to_regprocedure('public.story_sondage_resultats(text)')::text, 'absente')")" "absente"

echo
echo "verts : $ok · rouges : $ko"
[ "$ko" -eq 0 ]
