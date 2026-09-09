#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — LE SCRIPT D'APPLICATION LUI-MÊME
#
# `scripts/appliquer-securite-2026-09.sh` est ce que Benjamin lancera sur la
# VRAIE base. Un script d'application qui n'a jamais été exécuté est un pari :
# celui-ci est donc joué de bout en bout sur un PostgreSQL jetable, monté avec
# les policies et les GRANTs réels de production.
#
# Ce qu'il prouve :
#   ① sans DATABASE_URL, le script refuse de partir (et ne touche à rien) ;
#   ② `--verifier` ne change RIEN, et dit ce qui manque ;
#   ③ l'application complète passe, et les trois lots sont réellement en place ;
#   ④ elle est IDEMPOTENTE : relancée, elle ne casse rien et ne rallume rien ;
#   ⑤ l'interrupteur 18+ reste ÉTEINT (le script n'allume jamais) ;
#   ⑥ un préflight BLOQUANT ARRÊTE tout — et les lots suivants ne passent pas.
#
#   bash tests/sql/appliquer-securite.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$RACINE/scripts/appliquer-securite-2026-09.sh"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$SCRIPT" ] || { echo "❌ script introuvable : $SCRIPT"; exit 1; }

PORT=$(( 5810 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
# ⚠️ Le script réel se connecte par URL, donc par TCP : ce serveur-ci doit
# écouter sur la boucle locale, contrairement aux autres bancs qui passent par
# un socket Unix. Sans ça le banc testerait un chemin que la production n'a pas.
# ⚠️ `-k "$BASE"` en plus du TCP : sans lui, PostgreSQL tente d'écrire son
# socket dans le dossier système par défaut, que le compte de service ne peut
# pas écrire — le serveur ne démarre alors jamais, et le banc s'arrête sur un
# « serveur non démarré » qui n'a rien à voir avec ce qu'il mesure.
lancer "pg_ctl -D '$BASE/data' -o \"-p $PORT -h 127.0.0.1 -k $BASE\" -l '$BASE/pg.log' start -w" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql "postgresql://postgres@127.0.0.1:$PORT/postgres" -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

URL="postgresql://postgres@127.0.0.1:$PORT/secu"
ADMIN="postgresql://postgres@127.0.0.1:$PORT/postgres"
Q() { psql "$URL" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }

# Le socle : les mêmes fichiers que les bancs de chaque lot, plus le minimum de
# `storage` et d'`auth.users`, plus #136 (prérequis de l'admission).
socle() {
  psql "$ADMIN" -tA -q -c "drop database if exists secu" >/dev/null 2>&1
  psql "$ADMIN" -tA -q -c "drop role if exists anon; drop role if exists authenticated" >/dev/null 2>&1
  psql "$ADMIN" -tA -q -c "create database secu" >/dev/null 2>&1
  psql "$URL" -tA -q -v ON_ERROR_STOP=1 -f "$RACINE/tests/sql/socle-prod.sql" >/dev/null 2>&1
  psql "$URL" -tA -q -v ON_ERROR_STOP=1 -f "$RACINE/tests/sql/socle-prod-admission.sql" >/dev/null 2>&1
  Q "create schema if not exists storage;
     grant usage on schema storage to anon, authenticated;
     create or replace function storage.foldername(name text)
     returns text[] language plpgsql immutable as \$f\$
     declare _p text[]; begin select string_to_array(name,'/') into _p;
       return _p[1:array_length(_p,1)-1]; end \$f\$;
     grant execute on function storage.foldername(text) to anon, authenticated;
     create table if not exists storage.objects (
       id uuid primary key default gen_random_uuid(),
       bucket_id text not null, name text not null, owner uuid);
     alter table storage.objects enable row level security;
     grant select, insert, update, delete on storage.objects to anon, authenticated;
     create policy \"passio_media_read\" on storage.objects for select
       using (bucket_id = any (array['content','attachments']));
     -- Les GRANTs reels de prod : anon lit tout.
     grant select on public.events, public.event_attendees to anon;
     insert into auth.users (id) values (gen_random_uuid()) on conflict do nothing;" >/dev/null 2>&1
  # #136, prérequis de l'admission.
  psql "$URL" -tA -q -v ON_ERROR_STOP=1 -f "$RACINE/migrations/migration_ts_serveur_age_blocage.sql" >/dev/null 2>&1
}

OK=0; KO=0
verifier() { # $1=libellé $2=attendu $3=obtenu
  if [ "$3" = "$2" ]; then OK=$((OK+1)); printf '  ✅ %s\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s — attendu «%s», obtenu «%s»\n' "$1" "$2" "$3"; fi
}
# Les trois lots sont-ils en place ? (0 à 3)
lots_en_place() {
  Q "select
      (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
        and policyname='passio_attachments_read_membre')
    + (not has_column_privilege('anon','public.events','address','SELECT'))::int
    + (to_regclass('public.access_policies') is not null)::int;"
}

echo "═══ Banc du script d'application ═══"

echo
echo "── ⓪ Le fichier unique est le MIROIR des trois migrations ──"
# ⚠️ `APPLIQUER_TOUT_2026-09-08.sql` est ce que Benjamin colle dans l'éditeur SQL.
# C'est un miroir, jamais une source : corriger une migration puis oublier de
# régénérer laisserait un fichier qui applique l'ANCIENNE version, en silence.
if python3 "$RACINE/scripts/generer-appliquer-tout.py" --verifier >/dev/null 2>&1; then
  OK=$((OK+1)); printf '  ✅ le fichier unique est à jour\n'
else
  KO=$((KO+1)); printf '  ❌ le fichier unique a DÉRIVÉ — python3 scripts/generer-appliquer-tout.py\n'
fi

echo
echo "── ① Sans DATABASE_URL, le script refuse de partir ──"
socle
sortie="$(env -u DATABASE_URL bash "$SCRIPT" 2>&1)"; code=$?
verifier "code de sortie 2 (refus explicite)" 2 "$code"
verifier "il explique où trouver l'URL" 1 "$(printf '%s' "$sortie" | grep -c 'Connection string')"
verifier "il met en garde contre la divulgation" 1 "$(printf '%s' "$sortie" | grep -c 'ne la colle')"
verifier "et il n'a RIEN appliqué" 0 "$(lots_en_place)"

echo
echo "── ② « --verifier » ne change rien, mais dit ce qui manque ──"
socle
sortie="$(DATABASE_URL="$URL" bash "$SCRIPT" --verifier 2>&1)"
verifier "il annonce le mode vérification" 1 "$(printf '%s' "$sortie" | grep -c 'MODE VÉRIFICATION')"
verifier "il signale les trois lots non appliqués" 3 "$(printf '%s' "$sortie" | grep -c 'NON APPLIQUÉ')"
verifier "et la base n'a PAS bougé" 0 "$(lots_en_place)"

echo
echo "── ③ L'application complète ──"
socle
sortie="$(DATABASE_URL="$URL" bash "$SCRIPT" 2>&1)"; code=$?
verifier "code de sortie 0" 0 "$code"
verifier "les trois lots sont en place" 3 "$(lots_en_place)"
verifier "l'ancienne règle permissive du storage a disparu" 0 \
  "$(Q "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='passio_media_read';")"
verifier "les participants ne sont plus publics" f \
  "$(Q "select has_table_privilege('anon','public.event_attendees','SELECT');")"
verifier "PRÉMISSE — le titre reste lisible sans compte" t \
  "$(Q "select has_column_privilege('anon','public.events','title','SELECT');")"
verifier "aucun contrôle en ÉCHEC n'est rapporté" 0 "$(printf '%s' "$sortie" | grep -c 'ÉCHEC —')"
verifier "il rappelle la suite dans le bon ordre" 1 "$(printf '%s' "$sortie" | grep -c 'Déploiement production')"

echo
echo "── ④ Idempotence : relancé, il ne casse rien ──"
sortie="$(DATABASE_URL="$URL" bash "$SCRIPT" 2>&1)"; code=$?
verifier "code de sortie 0" 0 "$code"
verifier "il reconnaît les trois lots déjà appliqués" 3 "$(printf '%s' "$sortie" | grep -c 'déjà appliqué')"
verifier "les trois lots sont toujours en place" 3 "$(lots_en_place)"

echo
echo "── ⑤ Il n'allume JAMAIS l'admission 18+ ──"
verifier "interrupteur éteint après application" f \
  "$(Q "select enabled from public.access_policies where key='irl_adult_only';")"
# Et s'il était allumé, une relance ne doit pas l'éteindre non plus.
Q "update public.access_policies set enabled=true where key='irl_adult_only';" >/dev/null
DATABASE_URL="$URL" bash "$SCRIPT" >/dev/null 2>&1
verifier "un interrupteur ALLUMÉ n'est pas rétrogradé par une relance" t \
  "$(Q "select enabled from public.access_policies where key='irl_adult_only';")"

echo
echo "── ⑥ Un préflight BLOQUANT arrête tout ──"
# ⚠️ Le lot 3 est le seul à avoir un préflight. On le fait échouer en posant une
# policy INSERT inconnue sur `event_attendees` : le préflight la voit, le script
# doit s'arrêter AVANT d'appliquer — et les lots ① et ② restent, eux, appliqués,
# puisqu'ils passent avant. C'est le comportement voulu : on ne défait rien.
socle
Q "create policy \"derive_inconnue\" on public.event_attendees for insert with check (true);" >/dev/null
sortie="$(DATABASE_URL="$URL" bash "$SCRIPT" 2>&1)"; code=$?
verifier "code de sortie 1 (arrêt)" 1 "$code"
verifier "il dit qu'il s'arrête" 1 "$(printf '%s' "$sortie" | grep -c 'ARRÊT')"
# `grep -c` compte les LIGNES, et « BLOQUANT » paraît deux fois : dans la ligne
# de diagnostic recopiée, et dans le motif d'arrêt. On exige donc « au moins une ».
verifier "il nomme le point bloquant" oui \
  "$([ "$(printf '%s' "$sortie" | grep -c 'BLOQUANT')" -ge 1 ] && echo oui || echo non)"
verifier "l'admission n'a PAS été appliquée" false \
  "$(Q "select (to_regclass('public.access_policies') is not null)::text;")"

echo
echo "── ⑥ bis. Une migration qui échoue arrête aussi (et n'applique rien) ──"
socle
# #136 retirée : l'admission a un prérequis manquant, sa migration DOIT lever.
Q "drop table public.user_safety cascade;" >/dev/null
sortie="$(DATABASE_URL="$URL" bash "$SCRIPT" 2>&1)"; code=$?
verifier "code de sortie 1" 1 "$code"
verifier "l'admission n'est pas en place" false \
  "$(Q "select (to_regclass('public.access_policies') is not null)::text;")"
verifier "mais les deux premiers lots, eux, sont bien appliqués" t \
  "$(Q "select (not has_column_privilege('anon','public.events','address','SELECT'));")"

echo
echo "═══ $OK OK · $KO KO ═══"
[ "$KO" -eq 0 ]
