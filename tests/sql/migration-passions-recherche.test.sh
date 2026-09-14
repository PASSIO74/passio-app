#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_passions_recherche_index_2026-09-15.sql (PERF-01)
#
# Ce qu'on prouve, sur un PostgreSQL jetable avec le VRAI référentiel
# (migration_passions_plat.sql, 5 001 passions) :
#   ① la migration s'applique, verdict tout OK, et se REJOUE sans erreur ;
#   ② LES RÉSULTATS NE CHANGENT PAS : pour un jeu de requêtes (exactes, préfixe,
#      alias, faute de frappe, accents, vide, inconnu), la liste ordonnée
#      rendue par la fonction d'AVANT est celle rendue par la fonction d'APRÈS
#      — c'est le contrat, l'index n'est qu'un moyen ;
#   ③ la colonne suit l'écriture : renommer / ajouter un alias la recalcule
#      par trigger, et la recherche trouve la nouvelle valeur ;
#   ④ le plan lit l'index (Bitmap Index Scan sur passions_recherche_trgm) :
#      une fonction qui « marche » sans l'index serait le défaut d'avant, à
#      l'identique ;
#   ⑤ les privilèges d'EXECUTE de rechercher_passions sont conservés.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_passions_recherche_index_2026-09-15.sql"
PLAT="$RACINE/migrations/migration_passions_plat.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }
[ -f "$PLAT" ] || { echo "❌ référentiel introuvable : $PLAT"; exit 1; }

PORT=$(( 5930 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"; exit 1; }

DB=recherche
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
F() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : rôles Supabase + le référentiel plat réel ───────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select null::uuid $fn$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
SQL
if ! F "$PLAT" >/dev/null 2>"$BASE/plat.err"; then echo "❌ le référentiel plat ne s'applique pas :"; tail -3 "$BASE/plat.err"; exit 1; fi
n_passions=$(Q "select count(*) from public.passions where status='active'")
echo "socle : $n_passions passions actives"
if ! Q "select 1 from pg_extension where extname='pg_trgm'" | grep -q 1; then echo "❌ pg_trgm indisponible sur ce banc : la mesure n'aurait pas de sens"; exit 1; fi

REQUETES=("rando" "randonee" "jogging" "ski alpin" "guitare" "GUITARE" "vélo" "escalade" "x" "zzzzqqq" "photo")
resultat() { Q "select coalesce(string_agg(id || ':' || score, ' ' order by score, popularity desc, id), '(vide)') from (select * from public.rechercher_passions('$1', 12)) x"; }

echo "── ⓪ résultats d'AVANT (référence)"
declare -A AVANT
for q in "${REQUETES[@]}"; do AVANT["$q"]="$(resultat "$q")"; done
AVANT_VIDE="$(resultat "")"
verifier "« rando » rend des passions avant la migration" "1" "$( [ "${AVANT[rando]}" != "(vide)" ] && echo 1 || echo 0 )"

echo "── ① application"
out=$(F "$MIGRATION")
verifier "aucune erreur" "0" "$(printf '%s' "$out" | grep -ci 'ERROR' || true)"
verifier "verdict : colonne, remplissage, index, trigger, recherche, alias — 6 OK" "6" "$(printf '%s' "$out" | grep -c ' | OK' || true)"
verifier "aucun ECHEC au verdict" "0" "$(printf '%s' "$out" | grep -c 'ECHEC' || true)"
verifier "la colonne est remplie pour toutes les passions" "0" "$(Q "select count(*) from public.passions where recherche is null")"

echo "── ② les résultats n'ont pas changé"
for q in "${REQUETES[@]}"; do
  verifier "« $q » : même liste, même ordre, mêmes scores" "${AVANT[$q]}" "$(resultat "$q")"
done

verifier "requête vide : les plus populaires, comme avant" "${AVANT_VIDE}" "$(resultat "")"

echo "── ③ la colonne suit l'écriture"
Q "update public.passions set aliases = array_append(coalesce(aliases,'{}'), 'xylophonagecomplet') where id = (select id from public.passions where status='active' order by sort_order limit 1)" >/dev/null
contient "un alias ajouté est cherchable aussitôt" "xylophonagecomplet" "$(Q "select recherche from public.passions where 'xylophonagecomplet' = any(aliases)")"
verifier "…et la recherche le trouve" "1" "$(Q "select count(*) from public.rechercher_passions('xylophonagecomplet', 5)")"
Q "update public.passions set label = 'Zébulonnerie' where id = (select id from public.passions where status='active' order by sort_order limit 1)" >/dev/null
contient "un libellé renommé est recalculé sans accent" "zebulonnerie" "$(Q "select recherche from public.passions where label='Zébulonnerie'")"

echo "── ④ le plan lit l'index"
plan=$(Q "explain select * from public.passions p where p.status='active' and (p.recherche like '%rando%' or p.normalized_label % 'rando')")
contient "Bitmap Index Scan sur passions_recherche_trgm" "passions_recherche_trgm" "$plan"
contient "…et sur passions_normalized_trgm (le flou)" "passions_normalized_trgm" "$plan"

echo "── ⑤ privilèges et rejeu"
verifier "anon exécute encore rechercher_passions" "t" "$(Q "select has_function_privilege('anon', 'public.rechercher_passions(text,integer)', 'EXECUTE')")"
verifier "authenticated aussi" "t" "$(Q "select has_function_privilege('authenticated', 'public.rechercher_passions(text,integer)', 'EXECUTE')")"
out2=$(F "$MIGRATION")
verifier "rejouée sans erreur" "0" "$(printf '%s' "$out2" | grep -ci 'ERROR' || true)"
verifier "…verdict encore 6 OK" "6" "$(printf '%s' "$out2" | grep -c ' | OK' || true)"

echo
echo "$ok vérification(s) OK, $ko en échec."
[ "$ko" -eq 0 ]
