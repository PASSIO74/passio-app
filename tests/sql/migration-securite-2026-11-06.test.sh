#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — AUDIT DE SÉCURITÉ 2026-11-06, migrations du lot 1 et du lot 2
#
# Sur un PostgreSQL jetable, avec la STRUCTURE de production (tests/sql/fixtures/socle-
# production-2026-11-06.sql, lue au catalogue : aucune donnée) et des identités simulées :
#   ① AVANT : chaque défaut est MESURÉ (un cas qui ne rougirait pas sans correctif ne prouve rien) ;
#   ② APRÈS : chaque défaut est fermé, et ce que le client fait reste accepté ;
#   ③ les migrations se rejouent, et leur tableau de verdict ne porte aucun ÉCHEC.
#
#   bash tests/sql/migration-securite-2026-11-06.test.sh
#
# Prérequis : binaires serveur PostgreSQL. Ne touche AUCUNE base réelle (127.0.0.1, cluster neuf).
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SOCLE="$RACINE/tests/sql/fixtures/socle-production-2026-11-06.sql"
CAS="$RACINE/tests/sql/fixtures/cas-securite-2026-11-06.sql"
LOT1="$RACINE/migrations/migration_securite_lot1_2026-11-06.sql"
LOT2="$RACINE/migrations/migration_securite_lot2_2026-11-06.sql"
LOT3="$RACINE/migrations/migration_securite_lot3_2026-11-06.sql"
LOT4="$RACINE/migrations/migration_securite_lot4_2026-11-07.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$SOCLE" "$CAS" "$LOT1"; do [ -f "$f" ] || { echo "❌ fichier introuvable : $f"; exit 1; }; done

PORT=$(( 5940 + RANDOM % 50 ))
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
# Le socket par défaut (/var/run/postgresql) n'est pas accessible sur un runner ; Git Bash n'a pas ce chemin.
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

QD()    { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
FICHIER() { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$3" "$2"; fi; }

# Une base, le socle chargé.
preparer() {
  QD postgres "create database $1" >/dev/null
  if ! sortie="$(FICHIER "$1" "$SOCLE")"; then echo "❌ socle : $sortie" | head -5; exit 1; fi
  QD postgres "alter database $1 set banc.phase = '$2'" >/dev/null
}
# Les cas d'une base : rend le nombre de cas et chaque écart.
jouer_cas() {
  if ! sortie="$(FICHIER "$1" "$CAS")"; then echo "❌ cas ($1) : $sortie" | head -8; ko=$((ko+1)); return; fi
  total="$(QD "$1" "select count(*) from banc.resultats")"
  ecarts="$(QD "$1" "select count(*) from banc.resultats where not ok")"
  verifier "$2 : $total cas, 0 écart" "$ecarts" "0"
  if [ "$ecarts" != "0" ]; then QD "$1" "select '     · ' || cas || ' — attendu ' || attendu || ', obtenu ' || coalesce(obtenu, 'nul') from banc.resultats where not ok order by n"; fi
}

echo "══ ① AVANT : les défauts sont mesurés sur la structure de production ══"
preparer banc_avant avant
jouer_cas banc_avant "avant toute migration, chaque défaut est là"

echo "══ ② APRÈS le lot 1 : les défauts sont fermés, le client passe toujours ══"
preparer banc_apres apres
sortie="$(FICHIER banc_apres "$LOT1")"; code=$?
verifier "le lot 1 s'applique" "$code" "0"
[ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
verifier "le lot 1 : aucun ÉCHEC au tableau de verdict" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
verifier "le lot 1 : le verdict porte des lignes OK" "$([ "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" -ge 10 ] && echo oui || echo non)" "oui"
sortie2="$(FICHIER banc_apres "$LOT1")"; code2=$?
verifier "le lot 1 se rejoue" "$code2" "0"
[ "$code2" -ne 0 ] && printf '%s\n' "$sortie2" | head -8
jouer_cas banc_apres "après le lot 1"

if [ -f "$LOT2" ]; then
  echo "══ ③ APRÈS le lot 2 (sur le lot 1) ══"
  CAS2="$RACINE/tests/sql/fixtures/cas-securite-lot2-2026-11-06.sql"
  sortie="$(FICHIER banc_apres "$LOT2")"; code=$?
  verifier "le lot 2 s'applique" "$code" "0"
  [ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
  verifier "le lot 2 : aucun ÉCHEC au tableau de verdict" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
  sortie2="$(FICHIER banc_apres "$LOT2")"; code2=$?
  verifier "le lot 2 se rejoue" "$code2" "0"
  [ "$code2" -ne 0 ] && printf '%s\n' "$sortie2" | head -8
  if [ -f "$CAS2" ]; then
    if ! sortie="$(FICHIER banc_apres "$CAS2")"; then echo "❌ cas lot 2 : $sortie" | head -8; ko=$((ko+1)); else
      total="$(QD banc_apres "select count(*) from banc.resultats_lot2")"
      ecarts="$(QD banc_apres "select count(*) from banc.resultats_lot2 where not ok")"
      verifier "après le lot 2 : $total cas, 0 écart" "$ecarts" "0"
      [ "$ecarts" != "0" ] && QD banc_apres "select '     · ' || cas || ' — attendu ' || attendu || ', obtenu ' || coalesce(obtenu, 'nul') from banc.resultats_lot2 where not ok order by n"
    fi
  fi
fi

if [ -f "$LOT3" ]; then
  echo "══ ④ APRÈS le lot 3 (sur les lots 1 et 2) ══"
  CAS3="$RACINE/tests/sql/fixtures/cas-securite-lot3-2026-11-06.sql"
  sortie="$(FICHIER banc_apres "$LOT3")"; code=$?
  verifier "le lot 3 s'applique" "$code" "0"
  [ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
  verifier "le lot 3 : aucun ÉCHEC au tableau de verdict" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
  sortie2="$(FICHIER banc_apres "$LOT3")"; code2=$?
  verifier "le lot 3 se rejoue" "$code2" "0"
  [ "$code2" -ne 0 ] && printf '%s\n' "$sortie2" | head -8
  if [ -f "$CAS3" ]; then
    if ! sortie="$(FICHIER banc_apres "$CAS3")"; then echo "❌ cas lot 3 : $sortie" | head -8; ko=$((ko+1)); else
      total="$(QD banc_apres "select count(*) from banc.resultats_lot3")"
      ecarts="$(QD banc_apres "select count(*) from banc.resultats_lot3 where not ok")"
      verifier "après le lot 3 : $total cas, 0 écart" "$ecarts" "0"
      [ "$ecarts" != "0" ] && QD banc_apres "select '     · ' || cas || ' — attendu ' || attendu || ', obtenu ' || coalesce(obtenu, 'nul') from banc.resultats_lot3 where not ok order by n"
    fi
  fi
fi

if [ -f "$LOT4" ]; then
  echo "══ ④ bis APRÈS le lot 4 (sur les lots 1, 2 et 3) ══"
  CAS4="$RACINE/tests/sql/fixtures/cas-securite-lot4-2026-11-07.sql"
  # Le socle écrit colonne par colonne ce que la production tient sur la table : `authenticated=arwd` sur `events`. Un
  # `revoke select (colonne)` y passait donc, et ne retirait rien en production. On pose ici le droit réel.
  QD banc_apres "grant select on public.events to authenticated" >/dev/null
  sortie="$(FICHIER banc_apres "$LOT4")"; code=$?
  verifier "le lot 4 s'applique" "$code" "0"
  [ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
  verifier "le lot 4 : aucun ÉCHEC au tableau de verdict" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
  sortie2="$(FICHIER banc_apres "$LOT4")"; code2=$?
  verifier "le lot 4 se rejoue" "$code2" "0"
  [ "$code2" -ne 0 ] && printf '%s\n' "$sortie2" | head -8
  if ! sortie="$(FICHIER banc_apres "$CAS4")"; then echo "❌ cas lot 4 : $sortie" | head -8; ko=$((ko+1)); else
    total="$(QD banc_apres "select count(*) from banc.resultats_lot4")"
    ecarts="$(QD banc_apres "select count(*) from banc.resultats_lot4 where not ok")"
    verifier "après le lot 4 : $total cas, 0 écart" "$ecarts" "0"
    [ "$ecarts" != "0" ] && QD banc_apres "select '     · ' || cas || ' — attendu ' || attendu || ', obtenu ' || coalesce(obtenu, 'nul') from banc.resultats_lot4 where not ok"
  fi
fi

echo "══ ⑤ Fins de ligne Windows sur les fonctions réécrites, comme en production ══"
# Le socle normalise les fins de ligne ; la production, elle, porte des CRLF : le lot 1 s'y est arrêté le 07/11 sur un
# motif de deux lignes, alors qu'il passait partout ailleurs.
preparer banc_crlf apres
sortie="$(FICHIER banc_crlf "$RACINE/tests/sql/fixtures/fonctions-crlf.sql")"; verifier "les fonctions passent en CRLF" "$?" "0"
for lot in "$LOT1" "$LOT2" "$LOT3"; do
  sortie="$(FICHIER banc_crlf "$lot")"; code=$?
  verifier "$(basename "$lot") s'applique sur des fonctions en CRLF" "$code" "0"
  [ "$code" -ne 0 ] && printf '%s\n' "$sortie" | tail -3
done

echo
echo "Bilan : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
