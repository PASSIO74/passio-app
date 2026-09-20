#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_realtime_telemetry_2026-09-20.sql
#
# La migration retire `telemetry_events` de la publication `supabase_realtime`.
# Elle produisait **481 554 changements sur 526 756** (91,4 %) pour UN abonné,
# le Centre de pilotage, alors que le décodage WAL est le premier poste de CPU
# de la base. C'est le plus gros levier de capacité du projet.
#
# ⚠️ CE QUE CE BANC PROTÈGE, CE N'EST PAS « UN DROP TABLE ». C'est :
#   ① que la migration ne retire QUE cette table (son verdict LÈVE sinon) ;
#   ② qu'elle est REJOUABLE (contrairement à celle du 2026-09-19) ;
#   ③ que l'état final est EXACTEMENT `scripts/realtime-publication.json`,
#      la source que la gate `audit:realtime` compare au code du dépôt.
#      Sans ce dernier contrôle, la base et la gate pourraient diverger —
#      et une souscription à une table non publiée passe `SUBSCRIBED` sans
#      jamais rien livrer : le défaut MUET que toute cette chaîne combat.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_realtime_telemetry_2026-09-20.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6450 + RANDOM % 120 ))
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
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c wal_level=logical\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=rttel
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
LIBRE() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$1" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

ok=0; ko=0
verifier() {
  if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "  ✅ $1";
  else ko=$((ko+1)); echo "  ❌ $1 — attendu « $2 », obtenu « $3 »"; fi
}

# ── SOCLE : la publication RÉELLE de la production, mesurée le 2026-09-20 ──
PUBLIEES="comment_interactions conv_members conv_messages conv_reads event_comments
notifications post_comments post_likes posts profiles telemetry_events video_lives"

socle() {
  Q "drop publication if exists supabase_realtime" >/dev/null
  for t in $PUBLIEES; do Q "drop table if exists public.$t cascade" >/dev/null; done
  for t in $PUBLIEES; do Q "create table public.$t (id text primary key)" >/dev/null; done
  Q "create publication supabase_realtime for table $(echo $PUBLIEES | tr ' ' '\n' | sed 's/^/public./' | paste -sd,)" >/dev/null
}
compte() { Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'"; }
liste()  { Q "select string_agg(c.relname, ' ' order by c.relname) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid join pg_class c on c.oid=pr.prrelid where p.pubname='supabase_realtime'"; }

echo "── Socle : la publication de production (12 tables) ──"
socle
verifier "① le socle reproduit les 12 tables publiées d'avant ce lot" "12" "$(compte)"

echo "── Application de la migration ──"
sortie="$(FICHIER "$MIGRATION" || true)"
echo "$sortie" | grep -E "NOTICE|ECHEC" | sed 's/^/     /'
verifier "② la migration s'applique sans erreur" "0" "$(echo "$sortie" | grep -ci 'ERROR' || true)"
verifier "③ il reste 11 tables publiées" "11" "$(compte)"
verifier "④ telemetry_events n'est PLUS publiée" "0" \
  "$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid join pg_class c on c.oid=pr.prrelid where p.pubname='supabase_realtime' and c.relname='telemetry_events'")"

echo "── ⑤ L'état final EST la source que lit la gate CI ──"
# ⚠️ C'est le contrôle qui empêche la base et le dépôt de diverger. La gate
# `audit:realtime` compare ce JSON au CODE ; ce banc compare le même JSON à la
# BASE. Sans les deux, une table pourrait rester publiée sans abonné (du WAL
# décodé pour personne) ou, bien pire, être écoutée sans être publiée —
# `SUBSCRIBED` et jamais rien, indiscernable de « il ne s'est rien passé ».
attendu=$(node -e "const d=require('$RACINE/scripts/realtime-publication.json');console.log(d.publiees.slice().sort().join(' '))")
verifier "⑤ la liste en base = scripts/realtime-publication.json" "$attendu" "$(liste)"

echo "── ⑥ REJOUABLE : un second passage ne casse rien et ne change rien ──"
sortie2="$(FICHIER "$MIGRATION" || true)"
verifier "⑥ la seconde application ne lève pas" "0" "$(echo "$sortie2" | grep -ci 'ERROR' || true)"
verifier "⑥ bis l'état reste à 11 tables" "11" "$(compte)"
verifier "⑥ ter elle DIT qu'il n'y avait rien à faire" "1" \
  "$(echo "$sortie2" | grep -ci "n'était plus membre" || true)"

echo "── ⑦ RÉINJECTION : si la migration emportait une table du PRODUIT, elle doit REFUSER ──"
socle
VARIANTE="$BASE/hostile.sql"
# ⚠️ La mutation retire AUSSI `posts` — une table que l'app écoute vraiment.
# Le verdict doit ANNULER la transaction : une migration de capacité ne doit
# jamais pouvoir éteindre le fil en silence.
sed "s|execute 'alter publication supabase_realtime drop table public.telemetry_events';|execute 'alter publication supabase_realtime drop table public.telemetry_events'; execute 'alter publication supabase_realtime drop table public.posts';|" "$MIGRATION" > "$VARIANTE"
grep -q "drop table public.posts" "$VARIANTE" || { echo "  ❌ la mutation n'a pas été posée"; ko=$((ko+1)); }
# ⚠️ `|| true` OBLIGATOIRE en ASSIGNATION sous `set -e` : le refus EST la mesure.
sortieH="$(LIBRE "$(cat "$VARIANTE")" || true)"
verifier "⑦ la variante hostile LÈVE en nommant la table disparue" "1" "$(echo "$sortieH" | grep -ci 'posts a disparu' || true)"
verifier "⑦ bis rien n'est appliqué : les 12 tables sont intactes" "12" "$(compte)"

echo "── ⑧ RÉINJECTION : un verdict qui ne vérifierait RIEN doit se voir ──"
socle
VIDE="$BASE/sansgarde.sql"
# On neutralise la garde « telemetry_events est-elle encore publiée ? » et on
# empêche le retrait : sans garde, le fichier dirait OK sur une base INCHANGÉE.
sed "s|execute 'alter publication supabase_realtime drop table public.telemetry_events';|null;|" "$MIGRATION" > "$VIDE"
sortieV="$(LIBRE "$(cat "$VIDE")" || true)"
verifier "⑧ sans le retrait, le verdict REFUSE (il ne dit pas OK sur une base inchangée)" "1" \
  "$(echo "$sortieV" | grep -ci 'TOUJOURS publiée' || true)"

echo
echo "── Bilan : $ok OK, $ko ÉCHEC(S) ──"
[ "$ko" -eq 0 ] || exit 1
