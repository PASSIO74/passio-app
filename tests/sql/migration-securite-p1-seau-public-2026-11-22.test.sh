#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — SÉCURITÉ P1 du 2026-11-22 (D10-04) : le seau public `content` ne reçoit
# plus que des images de 8 Mio au plus.
#
# Sur un PostgreSQL natif jetable (socket privé, aucune cible distante) :
#   ① AVANT : la configuration relue en production le 2026-11-22 est posée, et le
#      défaut est MESURÉ (types vidéo/audio admis, borne à 26 Mio) ;
#   ② la migration se joue DEUX fois, sans ÉCHEC dans son tableau de verdict ;
#   ③ APRÈS : images seulement, 8 Mio, seau toujours public, seaux privés intacts ;
#   ④ la garde refuse de serrer si un dépôt récent sort de la nouvelle borne.
# Storage applique ces bornes au dépôt : la preuve de bout en bout (dépôt refusé
# par l'API, image ordinaire acceptée) se fait avec de vrais comptes sur le staging.
#
#   bash tests/sql/migration-securite-p1-seau-public-2026-11-22.test.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo 'ECHEC : PostgreSQL natif requis pour ce banc'; exit 1; }
PORT=$((7300 + RANDOM % 100))
if [ "$(id -u)" -eq 0 ]; then
 id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
 BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU='su pgbanc -c'
else BASE="$(mktemp -d)"; SU='bash -c'; fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c timezone=UTC\" -l '$BASE/pg.log' start -w" >/dev/null
DB=passio_test_seau_public
createdb -h "$BASE" -p "$PORT" -U postgres "$DB"
PSQL=(psql -X -h "$BASE" -p "$PORT" -U postgres -d "$DB" -qAt -v ON_ERROR_STOP=1)
Q() { "${PSQL[@]}" -c "$1"; }
cd "$RACINE"
MIG=migrations/migration_securite_p1_seau_public_2026-11-22.sql

ok=0; ko=0
verifier() {
 if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "  OK     $1"
 else ko=$((ko+1)); echo "  ECHEC  $1 — attendu [$3], obtenu [$2]"; fi
}

# Socle : les deux tables de Storage que lit la migration, et les quatre seaux tels que relus en
# production le 2026-11-22 (catalogue, lecture seule).
Q "create schema storage;
create table storage.buckets(id text primary key, name text, public boolean not null default false,
 file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text,
 owner uuid, metadata jsonb, created_at timestamptz default now());
insert into storage.buckets values
 ('content','content',true,27262976,array['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','image/bmp','video/mp4','video/webm','video/quicktime','video/3gpp','video/x-m4v','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/webm','audio/ogg','audio/wav','audio/x-wav','audio/flac']),
 ('attachments','attachments',false,27262976,array['image/jpeg','application/pdf']),
 ('content-protected','content-protected',false,27262976,array['image/jpeg','video/mp4']),
 ('content-heritage-prive','content-heritage-prive',false,null,null);
insert into storage.objects(bucket_id,name,metadata,created_at) values
 ('content','avatars/a/1.jpg','{\"mimetype\":\"image/jpeg\",\"size\":\"91585\"}',now()-interval '8 days'),
 ('content','events/a/2.jpg','{\"mimetype\":\"image/jpeg\",\"size\":\"1275933\"}',now()-interval '7 days'),
 ('content','videos/a/3.mp4','{\"mimetype\":\"video/mp4\",\"size\":\"20000000\"}',now()-interval '90 days');" >/dev/null

echo "① AVANT : le défaut est mesuré"
verifier "seau public : types vidéo admis" "$(Q "select 'video/mp4' = any(allowed_mime_types) from storage.buckets where id='content'")" "t"
verifier "seau public : borne à 26 Mio" "$(Q "select file_size_limit from storage.buckets where id='content'")" "27262976"

echo "② la migration, deux fois"
for passe in 1 2; do
 sortie="$("${PSQL[@]}" -f "$MIG")"
 verifier "passe $passe : aucune ligne ECHEC au verdict" "$(printf '%s\n' "$sortie" | grep -c 'ECHEC' || true)" "0"
 verifier "passe $passe : quatre lignes OK" "$(printf '%s\n' "$sortie" | grep -c '|OK$' || true)" "4"
done

echo "③ APRÈS"
verifier "seau public : toujours public" "$(Q "select public from storage.buckets where id='content'")" "t"
verifier "seau public : 8 Mio" "$(Q "select file_size_limit from storage.buckets where id='content'")" "8388608"
verifier "seau public : aucun type hors image" "$(Q "select count(*) from storage.buckets b, unnest(b.allowed_mime_types) m where b.id='content' and m not like 'image/%'")" "0"
verifier "seau public : les neuf types d'image gardés (HEIC compris)" "$(Q "select count(*) from storage.buckets b, unnest(b.allowed_mime_types) m where b.id='content' and m in ('image/jpeg','image/jpg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','image/bmp')")" "9"
verifier "seaux privés : bornes inchangées" "$(Q "select string_agg(id||':'||coalesce(file_size_limit::text,'-')||':'||public,',' order by id) from storage.buckets where id<>'content'")" "attachments:27262976:false,content-heritage-prive:-:false,content-protected:27262976:false"
verifier "fichier ancien hors borne : intact" "$(Q "select count(*) from storage.objects where name='videos/a/3.mp4'")" "1"

echo "④ la garde : un dépôt récent hors borne arrête la migration"
Q "update storage.buckets set file_size_limit=27262976 where id='content';
insert into storage.objects(bucket_id,name,metadata,created_at) values
 ('content','avatars/b/4.mp4','{\"mimetype\":\"video/mp4\",\"size\":\"4194304\"}',now()-interval '1 day');" >/dev/null
if "${PSQL[@]}" -f "$MIG" >"$BASE/garde.log" 2>&1; then garde=accepte; else garde=refuse; fi
verifier "dépôt vidéo récent : migration refusée" "$garde" "refuse"
verifier "dépôt vidéo récent : message de la garde" "$(grep -c 'sort de la nouvelle borne' "$BASE/garde.log" || true)" "1"
verifier "rien n'a bougé (transaction annulée)" "$(Q "select file_size_limit from storage.buckets where id='content'")" "27262976"
Q "delete from storage.objects where name='avatars/b/4.mp4';
insert into storage.objects(bucket_id,name,metadata,created_at) values
 ('content','covers/b/5.png','{\"mimetype\":\"image/png\",\"size\":\"9000000\"}',now()-interval '1 day');" >/dev/null
if "${PSQL[@]}" -f "$MIG" >"$BASE/garde.log" 2>&1; then garde=accepte; else garde=refuse; fi
verifier "image récente de plus de 8 Mio : migration refusée" "$garde" "refuse"

echo
echo "banc seau public : $ok OK, $ko ECHEC"
[ "$ko" -eq 0 ]
