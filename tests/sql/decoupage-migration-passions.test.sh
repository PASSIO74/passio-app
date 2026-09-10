#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LE DÉCOUPAGE DONNE-T-IL LA MÊME BASE QUE LE FICHIER ENTIER ? (2026-09-10)
# ──────────────────────────────────────────────────────────────────────────
# `scripts/decouper-migration-passions.js` vérifie déjà qu'aucune instruction
# n'est perdue. Ce contrôle-là est sur le TEXTE. Il ne dit rien de l'exécution :
# une instruction peut être intacte et le découpage faux quand même — un `begin;`
# mal replacé, une fonction coupée d'un `grant` qui la suivait, un ordre inversé.
#
# ⚠️ C'EST LE DÉFAUT DE FAMILLE DU DÉPÔT : un contrôle qui rassure sur la forme
#   pendant que le fond est faux. Ici on EXÉCUTE les deux chemins sur deux
#   bases jetables et on compare ce qu'ils produisent réellement.
#
# Ce que le banc prouve :
#   ① les 7 parties s'appliquent dans l'ordre, sans erreur ;
#   ② la base obtenue est IDENTIQUE à celle du fichier entier : mêmes lignes de
#      `passions` (empreinte ligne à ligne), mêmes relations, mêmes fonctions ;
#   ③ le découpage est idempotent lui aussi : rejouer les parties ne change rien ;
#   ④ une partie appliquée SEULE et HORS ORDRE échoue ou n'abîme rien — on ne
#      promet pas que l'ordre soit facultatif, on vérifie qu'un faux pas se voit.
#
# Usage : bash tests/sql/decoupage-migration-passions.test.sh
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$RACINE/migrations/migration_passions_plat.sql"
PARTIES="$RACINE/migrations/parties"
BASE="${PGDATA_TEST:-${TMPDIR:-/tmp}/passio-pg-decoupe}"
SOCK="${PGSOCK_TEST:-/tmp/ppgd-$$}"
PORT="${PGPORT_TEST:-55437}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"

echec=0
titre() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
ok()    { printf '   ✅ %s\n' "$1"; }
ko()    { printf '   ❌ %s\n' "$1"; echec=1; }

command -v initdb >/dev/null || { echo "PostgreSQL introuvable — installer le paquet postgresql."; exit 2; }

# Le découpage doit être à jour : un miroir régénéré sans redécoupage ferait
# appliquer l'ANCIENNE version, en silence. Même garde que le miroir lui-même.
node "$RACINE/scripts/decouper-migration-passions.js" >/dev/null 2>&1 \
  || { echo "le découpage a échoué"; exit 2; }

rm -rf "$BASE" "$SOCK"; mkdir -p "$BASE/data" "$SOCK"
if [ "$(id -u)" = "0" ]; then
  for r in "$BASE" "$SOCK"; do p="$r"; while [ "$p" != "/" ]; do chmod o+rx "$p" 2>/dev/null; p=$(dirname "$p"); done; done
  chown -R postgres "$BASE" "$SOCK"; chmod 755 "$BASE" "$SOCK"
  COMME="su postgres -c"
else
  COMME="bash -c"
fi
$COMME "PATH='$PATH' initdb -D '$BASE/data' -U postgres -A trust" >/dev/null 2>&1 || { echo "initdb a échoué"; exit 2; }
$COMME "PATH='$PATH' pg_ctl -D '$BASE/data' -o '-k $SOCK -h \"\" -p $PORT' -l '$BASE/log' start -w" >/dev/null 2>&1 \
  || { echo "démarrage impossible"; tail -20 "$BASE/log"; exit 2; }
trap '$COMME "PATH=$PATH pg_ctl -D $BASE/data stop -m immediate" >/dev/null 2>&1; rm -rf "$SOCK"' EXIT

Q() { $COMME "psql -h '$SOCK' -p $PORT -U postgres -d '$1' -v ON_ERROR_STOP=1 -tA -c \"$2\"" 2>&1; }
F() { $COMME "psql -h '$SOCK' -p $PORT -U postgres -d '$1' -v ON_ERROR_STOP=1 -q -f '$2'" 2>&1; }
NEUVE() { $COMME "psql -h '$SOCK' -p $PORT -U postgres -tAc 'drop database if exists $1'" >/dev/null 2>&1
          $COMME "psql -h '$SOCK' -p $PORT -U postgres -tAc 'create database $1'" >/dev/null 2>&1; }

# L'empreinte d'une base : toutes les colonnes que la migration écrit, ligne à
# ligne, plus les relations. Comparer des DÉCOMPTES ne prouverait rien — deux
# bases peuvent avoir 5001 lignes et des contenus différents.
EMPREINTE="select md5(string_agg(x, chr(10) order by x)) from (
  select id || '|' || label || '|' || normalized_label || '|' ||
         array_to_string(aliases, ',') || '|' || status || '|' || source || '|' ||
         is_broad::text || '|' || popularity::text || '|' || sort_order::text || '|' ||
         emoji || '|' || color as x
  from public.passions
  union all
  select 'REL|' || source_passion_id || '|' || target_passion_id || '|' || relation_type
  from public.passion_relations) t"

# ── ① Le fichier ENTIER, comme référence ──────────────────────────────────
titre "① Référence : le fichier entier sur un socle de production"
NEUVE entier
F entier "$RACINE/scripts/gabarits/socle_supabase_test.sql" >/dev/null 2>&1
out=$(F entier "$MIG")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "fichier entier appliqué"; else ko "échec du fichier entier"; echo "$out" | grep -i error | head -3; fi
ref=$(Q entier "$EMPREINTE")
nref=$(Q entier "select count(*) from public.passions")
ok "empreinte de référence : ${ref:0:16}… ($nref passions)"

# ── ② Les PARTIES, dans l'ordre ───────────────────────────────────────────
titre "② Les parties appliquées dans l'ordre"
NEUVE parties
F parties "$RACINE/scripts/gabarits/socle_supabase_test.sql" >/dev/null 2>&1
n=0
for p in "$PARTIES"/partie-*.sql; do
  n=$((n+1))
  out=$(F parties "$p")
  if [ $? -ne 0 ] || grep -qi "^ERROR" <<<"$out"; then
    ko "$(basename "$p") a échoué"; echo "$out" | grep -i error | head -3; break
  fi
done
[ "$echec" = "0" ] && ok "$n partie(s) appliquées sans erreur"
obt=$(Q parties "$EMPREINTE")
nobt=$(Q parties "select count(*) from public.passions")
if [ "$obt" = "$ref" ]; then
  ok "base IDENTIQUE au fichier entier ($nobt passions, même empreinte)"
else
  ko "base DIFFÉRENTE : $nobt passions, empreinte ${obt:0:16}… au lieu de ${ref:0:16}…"
fi

# La recherche serveur vient des fonctions : si une fonction avait été coupée,
# l'empreinte des DONNÉES ne le verrait pas.
r=$(Q parties "select id from public.rechercher_passions('jogging', 5) limit 1")
[ "$r" = "running" ] && ok "les fonctions sont là : « jogging » → running" || ko "recherche cassée : « jogging » → « $r »"

# ── ③ Idempotence du découpage ────────────────────────────────────────────
titre "③ Rejouer les parties ne change rien"
for p in "$PARTIES"/partie-*.sql; do
  out=$(F parties "$p")
  if [ $? -ne 0 ] || grep -qi "^ERROR" <<<"$out"; then ko "$(basename "$p") a échoué au second passage"; break; fi
done
obt2=$(Q parties "$EMPREINTE")
[ "$obt2" = "$ref" ] && ok "second passage : empreinte inchangée" || ko "second passage : la base a bougé"

# ── ④ Un faux pas se voit ─────────────────────────────────────────────────
# On ne promet PAS que l'ordre soit facultatif. On vérifie que sauter la
# première partie — celle qui crée la table et les colonnes — ÉCHOUE bruyamment
# au lieu de laisser une base à moitié faite qu'on croirait bonne.
titre "④ Sauter la première partie échoue, au lieu de passer en silence"
NEUVE horsordre
F horsordre "$RACINE/scripts/gabarits/socle_supabase_test.sql" >/dev/null 2>&1
out=$(F horsordre "$PARTIES/partie-02.sql")
if [ $? -ne 0 ] || grep -qi "^ERROR" <<<"$out"; then
  ok "la partie 2 seule refuse de s'appliquer"
else
  ko "la partie 2 seule s'est appliquée : l'ordre n'est plus garanti par rien"
fi

echo ""
if [ "$echec" = "0" ]; then
  v=$(Q entier "select version()"); echo "✅ Découpage vérifié sur ${v%% on *}."
else
  echo "❌ Découpage NON vérifié."
fi
exit $echec
