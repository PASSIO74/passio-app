#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_realtime_publication_2026-09-19.sql
#
# On reconstitue la publication RÉELLE de la production (25 tables, mesurée au
# canal ① le 2026-09-19) sur un PostgreSQL jetable, on mesure D'ABORD l'état,
# on applique, on REJOUE, puis on éprouve la garde par réinjection.
#
# ⚠️ CE QUE CE BANC PROTÈGE VRAIMENT, ce n'est pas « 13 DROP TABLE » — c'est la
# GARDE du verdict. Le lot a failli retirer `telemetry_events`, à laquelle le
# Centre de pilotage s'abonne depuis son backend pour tout son flux SSE : la
# retirer aurait éteint le direct du tableau de bord SANS UNE ERREUR (repli
# silencieux sur son polling de secours). Le contrôle ④ exige donc que la
# transaction soit ANNULÉE si cette table venait à quitter la publication.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_realtime_publication_2026-09-19.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6300 + RANDOM % 120 ))
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

DB=rtpub
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
LIBRE() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$1" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

ok=0; ko=0
verifier() { # nom, attendu, obtenu
  if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "  ✅ $1";
  else ko=$((ko+1)); echo "  ❌ $1 — attendu « $2 », obtenu « $3 »"; fi
}

# ── SOCLE : la publication RÉELLE de la production, mesurée le 2026-09-19 ──
PUBLIEES="cdv_live_collaborators cdv_live_comments cdv_live_followers cdv_live_reactions
cdv_live_steps cdv_lives comment_interactions comment_likes conv_members conv_messages
conv_reads conversations event_comments event_reactions events notifications
post_collaborators post_comments post_likes posts profiles step_interactions stories
telemetry_events video_lives"

socle() {
  Q "drop publication if exists supabase_realtime" >/dev/null
  for t in $PUBLIEES; do Q "drop table if exists public.$t cascade" >/dev/null; done
  for t in $PUBLIEES; do Q "create table public.$t (id text primary key)" >/dev/null; done
  Q "create publication supabase_realtime for table $(echo $PUBLIEES | tr ' ' '\n' | sed 's/^/public./' | paste -sd,)" >/dev/null
}

echo "── Socle : la publication de production (25 tables) ──"
socle
n0=$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'")
verifier "① le socle reproduit bien les 25 tables publiées" "25" "$n0"

echo "── Application de la migration ──"
sortie="$(FICHIER "$MIGRATION" || true)"
echo "$sortie" | grep -E "NOTICE|ECHEC" | sed 's/^/     /'
verifier "② la migration s'applique sans erreur" "0" "$(echo "$sortie" | grep -ci 'ERROR' || true)"

n1=$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'")
verifier "③ il reste 12 tables publiées" "12" "$n1"
ncdv=$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid join pg_class c on c.oid=pr.prrelid where p.pubname='supabase_realtime' and c.relname like 'cdv\\_%'")
verifier "④ plus aucune table cdv_* (ADR-011)" "0" "$ncdv"
ntel=$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid join pg_class c on c.oid=pr.prrelid where p.pubname='supabase_realtime' and c.relname='telemetry_events'")
verifier "⑤ telemetry_events est TOUJOURS publiée (flux SSE du pilotage)" "1" "$ntel"
nreads=$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid join pg_class c on c.oid=pr.prrelid where p.pubname='supabase_realtime' and c.relname='conv_reads'")
verifier "⑥ conv_reads est toujours publiée (le ✓✓ de _creerCanalDb)" "1" "$nreads"

echo "── ⑦ Les 12 restantes sont EXACTEMENT les tables abonnées du dépôt ──"
# ⚠️ `telemetry_events` EST AJOUTÉE À L'ATTENDU, ET CE N'EST PAS UNE EXCEPTION
# DE COMPLAISANCE. Ce banc mesure l'état que CETTE migration vise (2026-09-19),
# où la table est encore publiée — son contrôle ⑤ ci-dessus l'exige même
# explicitement, parce que la retirer alors aurait éteint le direct du pilotage
# SANS une erreur. `scripts/realtime-publication.json`, lui, décrit l'état
# COURANT du dépôt, et la migration du 2026-09-20 l'en a retirée depuis (elle
# portait 91,4 % des changements répliqués, pour un seul abonné).
# Comparer l'état d'une migration ANCIENNE au fichier d'aujourd'hui reviendrait
# à lui reprocher de ne pas contenir l'avenir. C'est le banc
# `migration-realtime-telemetry.test.sh` ⑤ qui compare l'état FINAL au JSON.
restantes=$(Q "select string_agg(c.relname, ' ' order by c.relname) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid join pg_class c on c.oid=pr.prrelid where p.pubname='supabase_realtime'")
attendu=$(node -e "const d=require('$RACINE/scripts/realtime-publication.json');const l=d.publiees.slice();if(!l.includes('telemetry_events'))l.push('telemetry_events');console.log(l.sort().join(' '))")
verifier "⑦ la liste en base = le JSON de la gate + telemetry_events (retirée le 2026-09-20)" "$attendu" "$restantes"

echo "── ⑧ Rejouabilité : une seconde application ne doit pas tout casser ──"
# ⚠️ `|| true` OBLIGATOIRE : sous `set -e`, une ASSIGNATION dont la
# substitution échoue tue le banc — or ici le refus EST ce qu'on mesure
# (piège documenté dans CLAUDE.md, banc du 11/09). En argument de fonction
# le même `$(…)` ne tue rien ; en assignation, si.
LIBRE "$(cat "$MIGRATION")" > /dev/null 2>&1 || true
# Rejouée telle quelle, elle échoue (les tables ne sont plus membres) — c'est
# ATTENDU et sans danger : la transaction est annulée, l'état reste bon.
n2=$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'")
verifier "⑧ après un second passage, l'état reste à 12 tables (transaction annulée)" "12" "$n2"

echo "── ⑨ RÉINJECTION : si telemetry_events quittait la publication, la migration doit REFUSER ──"
socle
# On fabrique une variante hostile : elle retire AUSSI telemetry_events.
VARIANTE="$BASE/hostile.sql"
sed 's|^alter publication supabase_realtime drop table public.stories;|alter publication supabase_realtime drop table public.stories;\nalter publication supabase_realtime drop table public.telemetry_events;|' "$MIGRATION" > "$VARIANTE"
grep -q "drop table public.telemetry_events" "$VARIANTE" || { echo "  ❌ la mutation n'a pas été posée"; ko=$((ko+1)); }
sortieH="$(LIBRE "$(cat "$VARIANTE")" || true)"
verifier "⑨ la variante hostile LÈVE (le pilotage perdrait son flux)" "1" "$(echo "$sortieH" | grep -ci 'perdrait son flux' || true)"
n3=$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid where p.pubname='supabase_realtime'")
verifier "⑨ bis et RIEN n'a été appliqué : les 25 tables sont intactes" "25" "$n3"

echo
echo "───────────────────────────────────────────"
echo "  $ok contrôle(s) OK, $ko en échec"
[ "$ko" -eq 0 ] || exit 1
echo "  ✅ banc vert"
