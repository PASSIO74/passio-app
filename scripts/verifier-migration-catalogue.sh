#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# VÉRIFICATION EXÉCUTÉE DE LA MIGRATION DU CATALOGUE — lot TAXO-1
# ──────────────────────────────────────────────────────────────────────────
# Applique `migrations/migration_passion_taxonomy.sql` TROIS FOIS sur un
# PostgreSQL jetable, sur un socle qui mime la production, puis éprouve les
# invariants et le retour arrière.
#
# ⚠️ POURQUOI L'EXÉCUTER PLUTÔT QUE LA RELIRE. C'est ce harnais qui a trouvé
# le défaut d'idempotence du 2026-09-01 : le patron habituel du dépôt
# (`drop constraint if exists` puis `add`) est inapplicable à
# `passion_specialties_id_passion_key`, parce que quatre clés étrangères
# s'appuient sur l'index unique qu'elle crée. Au second passage PostgreSQL
# sortait « cannot drop constraint … because other objects depend on it » et
# la migration s'arrêtait au tiers. Aucune relecture ne l'aurait vu.
#
# ⚠️ NE TOUCHE JAMAIS LA PRODUCTION. Base jetable, port 5433, socket /tmp.
#
# Usage : bash scripts/verifier-migration-catalogue.sh
# Prérequis : postgresql-16 installé localement (initdb, pg_ctl, psql).
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/postgresql/taxo-verif}"
PORT="${PORT:-5433}"
DB=taxo_verif
RACINE="$(cd "$(dirname "$0")/.." && pwd)"

[ -x "$PGBIN/initdb" ] || { echo "✗ PostgreSQL introuvable dans $PGBIN"; exit 2; }

# ⚠️ PostgreSQL REFUSE de démarrer en root, et c'est délibéré de sa part. Sur
# une machine où l'on est root (conteneur de CI, session distante), on se
# relance sous l'utilisateur `postgres` plutôt que d'échouer sur un « initdb »
# laconique — le message ne dit pas la cause, et on a perdu un aller-retour
# dessus le 2026-09-01.
if [ "$(id -u)" = "0" ]; then
  if id -u postgres >/dev/null 2>&1; then
    mkdir -p "$(dirname "$PGDATA")"
    chown postgres "$(dirname "$PGDATA")" 2>/dev/null
    exec su postgres -c "PGBIN='$PGBIN' PGDATA='$PGDATA' PORT='$PORT' bash '$0'"
  fi
  echo "✗ lancé en root et aucun utilisateur « postgres » : PostgreSQL refusera de démarrer."
  exit 2
fi

echo "── PostgreSQL jetable ──────────────────────────────────────"
"$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null 2>&1
rm -rf "$PGDATA"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null 2>&1 || { echo "✗ initdb"; exit 2; }
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/pg.log" -o "-p $PORT -k /tmp" start >/dev/null 2>&1
sleep 2
psql -p "$PORT" -h /tmp -U postgres -tAc 'select 1' >/dev/null 2>&1 || { echo "✗ serveur injoignable"; exit 2; }
psql -p "$PORT" -h /tmp -U postgres -q -c "create database $DB;" >/dev/null

j() { psql -p "$PORT" -h /tmp -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null 2>&1; }

echo "── Socle qui mime la production ────────────────────────────"
j "$RACINE/migrations/verification/prelude_socle_prod.sql" || { echo "✗ prélude"; exit 1; }
echo "  ✓ 5 tables porteuses de passion_id, les 19 canoniques, du contenu d'avant"

echo "── Migration, appliquée TROIS fois ─────────────────────────"
for i in 1 2 3; do
  if j "$RACINE/migrations/migration_passion_taxonomy.sql"; then
    echo "  ✓ passage $i"
  else
    echo "  ✗ passage $i — la migration n'est PAS idempotente :"
    psql -p "$PORT" -h /tmp -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q \
         -f "$RACINE/migrations/migration_passion_taxonomy.sql" 2>&1 | grep -v NOTICE | head -8
    exit 1
  fi
done

echo "── Invariants ──────────────────────────────────────────────"
psql -p "$PORT" -h /tmp -U postgres -d "$DB" -f "$RACINE/migrations/verification/invariants.sql" 2>&1 \
  | grep -E "ERROR|UPDATE [0-9]|^ *[0-9]+ \|" | sed 's/^/  /'

echo ""
echo "  Lecture : les quatre ERROR attendues sont les REFUS —"
echo "    · spécialité d'une autre passion   → posts_specialty_fk"
echo "    · spécialité inventée              → posts_specialty_fk"
echo "    · spécialité sans passion          → posts_specialty_needs_passion"
echo "                                         (la clé étrangère seule l'acceptait :"
echo "                                          c'est ce qui prouve que le check sert)"
echo "    · spécialité croisée sur events    → events_specialty_fk"

"$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null 2>&1
echo ""
echo "✓ vérification terminée."
