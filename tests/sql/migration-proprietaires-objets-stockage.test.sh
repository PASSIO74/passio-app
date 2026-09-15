#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_proprietaires_objets_stockage_2026-09-15.sql
# (ASTRA-26 / EXP-01 / AUTH-05 / SUP-10)
#
# ⚠️ IL EXERCE L'EXERCICE QUE LA CONTRE-REVUE DEMANDE, sur un PostgreSQL
# jetable : deux comptes A et B déposent des objets (dont une PIÈCE JOINTE
# rangée par CONVERSATION, qu'aucun chemin ne rattache à un compte), on simule
# une reprise qui les renvoie sous `service_role` — donc SANS propriétaire — et
# on mesure ce que la purge par compte retrouve AVANT, puis APRÈS restitution.
# Enfin on supprime A et on vérifie que SES fichiers partent et que ceux de B
# restent. Un objet de propriétaire INCONNU y figure, avec un verdict explicite.
#
# `objets_stockage_du_compte` (ASTRA-11) est posée telle qu'en production : c'est
# elle qui donne son sens au défaut.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_proprietaires_objets_stockage_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6500 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; exit 1; }

DB=astra26
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role;
create table storage.objects (bucket_id text, name text, owner uuid, owner_id text, metadata jsonb default '{}'::jsonb, primary key (bucket_id, name));
-- L'autorité de purge de production (ASTRA-11), telle quelle.
create function public.objets_stockage_du_compte(p_uid uuid) returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $fn$
  select o.bucket_id, o.name from storage.objects o
   where o.owner = p_uid or o.owner_id = p_uid::text order by o.bucket_id, o.name $fn$;

-- Ce que A et B ont déposé. ⚠️ La PIÈCE JOINTE est rangée par CONVERSATION :
-- son chemin ne porte AUCUN identifiant de compte. C'est tout l'enjeu.
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('content',     'photos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a.jpg', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('attachments', 'attachments/conv_ab/vocal_de_A.webm',                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('attachments', 'attachments/conv_ab/photo_de_B.jpg',                 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('content',     'systeme/banniere.png',                               null, null);
SQL

COMPTE_A() { Q "select count(*)::int from public.objets_stockage_du_compte('$A');"; }
COMPTE_B() { Q "select count(*)::int from public.objets_stockage_du_compte('$B');"; }

echo "── ① CE QUE LA PURGE RETROUVE AVANT TOUTE REPRISE ────────────────────"
verifier "A : ses deux objets, dont la pièce jointe rangée par conversation" "2" "$(COMPTE_A)"
verifier "B : son objet" "1" "$(COMPTE_B)"

echo "── ② LE DÉFAUT : une reprise renvoie tout sous service_role ──────────"
# C'est exactement ce que fait `restaurer-donnees.js` : POST /storage/v1/object
# avec la clé service_role. La plateforme pose alors l'owner du SERVICE — ici,
# aucun. Les chemins et les octets, eux, sont intacts.
Q "update storage.objects set owner = null, owner_id = null;" >/dev/null
verifier "après reprise SANS les propriétaires : la purge de A ne retrouve RIEN" "0" "$(COMPTE_A)"
verifier "…ni celle de B" "0" "$(COMPTE_B)"
verifier "les objets sont pourtant tous là : ce sont des ORPHELINS" "4" "$(Q "select count(*)::int from storage.objects;")"

echo "── ③ APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
verifier "verdict 6 OK / 0 ECHEC" "6/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ rejeu en échec"; exit 1; }
verifier "rejeu : toujours 6 OK" "6" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"
verifier "anon ne peut pas lire les propriétaires" "f" "$(Q "select has_function_privilege('anon','public.proprietaires_objets_stockage()','EXECUTE');")"
verifier "authenticated non plus" "f" "$(Q "select has_function_privilege('authenticated','public.proprietaires_objets_stockage()','EXECUTE');")"
verifier "service_role, oui — c'est la sauvegarde qui appelle" "t" "$(Q "select has_function_privilege('service_role','public.proprietaires_objets_stockage()','EXECUTE');")"

echo "── ④ LA REPRISE REND LES PROPRIÉTAIRES, ET ON LES RELIT ──────────────"
# Ce que `restaurer-donnees.js` écrit désormais, depuis `_storage_proprietaires.json`.
Q "update storage.objects set owner='$A'::uuid, owner_id='$A' where name in ('photos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a.jpg','attachments/conv_ab/vocal_de_A.webm');" >/dev/null
Q "update storage.objects set owner='$B'::uuid, owner_id='$B' where name = 'attachments/conv_ab/photo_de_B.jpg';" >/dev/null
verifier "A retrouve ses deux objets — la pièce jointe comprise" "2" "$(COMPTE_A)"
verifier "B retrouve le sien" "1" "$(COMPTE_B)"
verifier "l'objet de propriétaire INCONNU n'en a pas reçu un au hasard" "1" "$(Q "select count(*)::int from storage.objects where owner is null and owner_id is null;")"
verifier "…et il est bien celui qu'on attend, nommé" "content/systeme/banniere.png" "$(Q "select bucket_id || '/' || name from storage.objects where owner is null and owner_id is null;")"

echo "── ⑤ L'EXERCICE DEMANDÉ : supprimer A, B doit rester intact ──────────"
Q "delete from storage.objects o using public.objets_stockage_du_compte('$A') c where o.bucket_id = c.bucket_id and o.name = c.name;" >/dev/null
verifier "les fichiers de A sont partis, la pièce jointe comprise" "0" "$(COMPTE_A)"
verifier "ceux de B sont INTACTS" "1" "$(COMPTE_B)"
verifier "l'objet sans propriétaire n'a pas été emporté" "1" "$(Q "select count(*)::int from storage.objects where owner is null and owner_id is null;")"
verifier "il reste exactement deux objets" "2" "$(Q "select count(*)::int from storage.objects;")"

echo "── ⑥ MUTATION : le banc doit ROUGIR ──────────────────────────────────"
Q "create or replace function public.proprietaires_objets_stockage() returns table (bucket_id text, name text, owner uuid, owner_id text)
   language sql stable security definer set search_path = '' as \$fn\$ select o.bucket_id, o.name, null::uuid, null::text from storage.objects o \$fn\$;" >/dev/null
verifier "mutation « la fonction ne rend plus les propriétaires » : elle ne dit plus rien" "0" "$(Q "select count(*)::int from public.proprietaires_objets_stockage() where owner is not null;")"
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" 2>&1)" || true
verifier "…la migration la rétablit" "6" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*OK\s*$' || true)"
verifier "et les propriétaires sont de nouveau lisibles" "1" "$(Q "select count(*)::int from public.proprietaires_objets_stockage() where owner is not null;")"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
