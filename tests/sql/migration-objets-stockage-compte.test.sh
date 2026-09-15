#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_objets_stockage_compte_2026-09-15.sql (ASTRA-11 / ASTRA-12)
#
# Ce qu'il prouve, sur un PostgreSQL JETABLE :
#   ① la migration s'applique, son verdict rend 5 OK, et elle se REJOUE
#   ② la fonction rend EXACTEMENT les objets dont le compte est propriétaire
#      (`owner` OU `owner_id`), tous seaux, et rien de l'autre compte — même
#      quand un message du compte porte le chemin d'un fichier d'autrui
#   ③ `anon` et `authenticated` ne peuvent PAS l'appeler (un compte ne liste
#      pas les fichiers d'un autre) ; `service_role` le peut
#   ④ MUTATION : un EXECUTE rendu à `anon` fait dire ECHEC au verdict ③, et
#      le rejeu de la migration le reprend
#
# ⚠️ Comme sur Supabase, le socle donne EXECUTE à anon/authenticated par
# défaut sur toute fonction créée dans public (`alter default privileges`) :
# un `revoke … from public` seul ne fermerait rien — c'est ce que ③ mesure.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_objets_stockage_compte_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5700 + RANDOM % 120 ))
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
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=objets
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role $1; $2" 2>&1; }

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : le minimum de Supabase que la migration touche ─────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -v a="$A" -v b="$B" >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
-- Les privilèges par défaut du projet : EXECUTE à tout le monde sur toute
-- fonction créée dans public (c'est ce qui rend `revoke … from public` inerte).
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null, name text not null,
  owner uuid, owner_id text,
  created_at timestamptz default now());
-- Les objets de A (owner posé par la plateforme), ceux de B, un objet ancien
-- qui ne porte que `owner_id`, et un sans propriétaire.
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('attachments', 'attachments/conv_1/1_photo_A.jpg', :'a', :'a'),
  ('attachments', 'attachments/conv_1/2_voice_A.webm', :'a', :'a'),
  ('content',     'avatars/' || :'a' || '/a.jpg', :'a', :'a'),
  ('content',     'photos/'  || :'a' || '/ancien.jpg', null, :'a'),
  ('attachments', 'attachments/conv_1/3_secret_B.jpg', :'b', :'b'),
  ('content',     'avatars/' || :'b' || '/b.jpg', :'b', :'b'),
  ('content',     'photos/sans_proprietaire.jpg', null, null);
-- Le message de A qui porte le chemin du fichier de B — la contre-épreuve
-- d'Astra. Il ne doit peser sur RIEN.
create table public.conv_messages (id text primary key, from_id text, content text);
insert into public.conv_messages values ('m1', :'a', '{"type":"media","url":"https://x.supabase.co/storage/v1/object/public/attachments/attachments/conv_1/3_secret_B.jpg"}');
SQL

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "le tableau de verdict rend 5 OK et 0 ECHEC" "5/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 5 OK" "5" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ② LA PROPRIÉTÉ, ET RIEN D'AUTRE ───────────────────────────────────"
verifier "A : ses 4 objets (owner ou owner_id), deux seaux" "4" "$(Q "select count(*) from public.objets_stockage_du_compte('$A')")"
verifier "…et pas un seul de B, malgré le message de A qui vise 3_secret_B.jpg" "0" \
  "$(Q "select count(*) from public.objets_stockage_du_compte('$A') where name like '%secret_B%'")"
verifier "B : ses 2 objets" "2" "$(Q "select count(*) from public.objets_stockage_du_compte('$B')")"
verifier "l'objet sans propriétaire n'appartient à personne" "0" \
  "$(Q "select count(*) from public.objets_stockage_du_compte('$A') where name like '%sans_proprietaire%'")"
verifier "un compte inconnu : rien" "0" "$(Q "select count(*) from public.objets_stockage_du_compte('99999999-9999-4999-8999-999999999999')")"
verifier "ordre stable (seau, nom) — une pagination s'y fie" "attachments|attachments/conv_1/1_photo_A.jpg" \
  "$(Q "select bucket_id || '|' || name from public.objets_stockage_du_compte('$A') limit 1")"

echo "── ③ QUI PEUT L'APPELER ──────────────────────────────────────────────"
contient "anon : permission denied" "permission denied" "$(EN anon "select count(*) from public.objets_stockage_du_compte('$A')")"
contient "authenticated : permission denied (un compte ne liste pas les fichiers d'un autre)" "permission denied" \
  "$(EN authenticated "select count(*) from public.objets_stockage_du_compte('$B')")"
verifier "service_role : 4" "4" "$(EN service_role "select count(*) from public.objets_stockage_du_compte('$A')")"
verifier "security definer, search_path vide" "t|t" \
  "$(Q "select prosecdef || '|' || (proconfig @> array['search_path=\"\"']) from pg_proc where oid = 'public.objets_stockage_du_compte(uuid)'::regprocedure")"

echo "── ④ MUTATION : EXECUTE rendu à anon ─────────────────────────────────"
Q "grant execute on function public.objets_stockage_du_compte(uuid) to anon" >/dev/null
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)"
# La migration rejouée révoque à nouveau : le verdict lu APRÈS est OK. Ce qu'on
# mesure, c'est que le verdict SAIT dire ECHEC — en lisant l'état AVANT rejeu.
Q "grant execute on function public.objets_stockage_du_compte(uuid) to anon" >/dev/null
verdict_mut="$(Q "select has_function_privilege('anon', 'public.objets_stockage_du_compte(uuid)', 'EXECUTE')")"
verifier "après la mutation, anon exécute (prémisse de la mutation)" "t" "$verdict_mut"
contient "…et le verdict ③ le dirait ECHEC" "ECHEC" \
  "$(Q "select case when not has_function_privilege('anon', 'public.objets_stockage_du_compte(uuid)', 'EXECUTE') then 'OK' else 'ECHEC' end")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "rejeu après mutation : anon ne l'exécute plus" "f" "$(Q "select has_function_privilege('anon', 'public.objets_stockage_du_compte(uuid)', 'EXECUTE')")"
verifier "…et le rejeu intermédiaire rendait bien 5 OK" "5" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*OK\s*$' || true)"

echo
echo "RÉSULTAT : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
