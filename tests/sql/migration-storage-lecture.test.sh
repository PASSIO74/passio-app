#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — CLOISONNEMENT DE LA LECTURE DES PIÈCES JOINTES
#
# Monte un PostgreSQL JETABLE, y reconstitue le minimum de `storage` que la
# migration touche (schéma, `objects`, `foldername`, les policies RÉELLES de
# production), applique la migration, et joue les scénarios en tant que comptes
# distincts via `set local role authenticated` + le claim JWT.
#
# Ce qu'il prouve :
#   ① ÉTAT D'AVANT : la policy de production laisse un INCONNU tout lister ;
#   ② ATOMICITÉ    : une policy SELECT inconnue refuse toute la migration ;
#   ③ APRÈS        : un membre lit SA conversation, un tiers ne lit rien, un
#                    visiteur sans compte ne lit rien, `content` reste public ;
#   ④ MUTATIONS    : chaque garde retirée rend son test ROUGE.
#
# ⚠️ Chaque refus attendu est précédé de sa PRÉMISSE (le cas légitime
# équivalent, qui doit passer) — sans elle, un socle cassé ferait passer tous
# les « refusé » pour la mauvaise raison.
#
#   bash tests/sql/migration-storage-lecture.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_storage_lecture_cloisonnee.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5560 + RANDOM % 120 ))
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
# Un banc qui continue sans serveur produit des FAUX VERTS : on s'arrête net.
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

Q() { psql -h "$BASE" -p "$PORT" -U postgres -d sto -tA -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
AS() { psql -h "$BASE" -p "$PORT" -U postgres -d sto -tA -q -v ON_ERROR_STOP=1 \
       -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d sto -tA -q -v ON_ERROR_STOP=1 \
         -c "set local role anon; $1" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # membre de conv_a
B=22222222-2222-2222-2222-222222222222   # membre de conv_a également
T=33333333-3333-3333-3333-333333333333   # TIERS : membre d'aucune des deux

socle() {
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 -c "drop database if exists sto" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 -c "drop role if exists anon; drop role if exists authenticated" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 -c "create database sto" >/dev/null
  Q -c "
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as \$\$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
    grant usage on schema auth to anon, authenticated;

    -- Le minimum de la plateforme Storage que la migration touche.
    create schema storage;
    grant usage on schema storage to anon, authenticated;
    -- ⚠️ RECOPIÉE de Supabase : elle découpe le chemin en segments SANS le
    -- dernier (le nom de fichier). Une approximation ici déplacerait l'indice
    -- [2] et le banc mesurerait autre chose que la production.
    create or replace function storage.foldername(name text)
    returns text[] language plpgsql immutable as \$f\$
    declare _parts text[];
    begin
      select string_to_array(name, '/') into _parts;
      return _parts[1:array_length(_parts,1)-1];
    end \$f\$;
    grant execute on function storage.foldername(text) to anon, authenticated;

    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null, name text not null, owner uuid,
      created_at timestamptz default now());
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to anon, authenticated;

    create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));
    alter table public.conv_members enable row level security;
    create policy \"conv_members_select_member\" on public.conv_members for select using (true);
    grant select on public.conv_members to anon, authenticated;

    create or replace function public.is_conv_member(_conv_id text, _uid text)
    returns boolean language sql security definer stable set search_path = '' as \$m\$
      select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) \$m\$;
    revoke execute on function public.is_conv_member(text, text) from public;
    grant execute on function public.is_conv_member(text, text) to anon, authenticated;

    -- LA POLICY RÉELLE DE PRODUCTION, telle quelle : c'est le défaut qu'on ferme.
    create policy \"passio_media_read\" on storage.objects for select
      using (bucket_id = any (array['content','attachments']));
  " >/dev/null
  Q -c "
    insert into public.conv_members values ('conv_a','$A'), ('conv_a','$B'), ('conv_b','$T');
    insert into storage.objects (bucket_id, name) values
      ('attachments','attachments/conv_a/1_vocal.webm'),
      ('attachments','attachments/conv_a/2_photo.jpg'),
      ('attachments','attachments/conv_b/3_fichier.pdf'),
      ('content','photos/$A/photo.jpg'),
      ('content','avatars/$B/avatar.png');
  " >/dev/null
}

OK=0; KO=0
verifier() { # $1=libellé  $2=attendu  $3=obtenu
  if [ "$3" = "$2" ]; then OK=$((OK+1)); printf '  ✅ %s\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s — attendu «%s», obtenu «%s»\n' "$1" "$2" "$3"; fi
}
# Nombre d'objets `attachments` visibles par un rôle. Toute erreur est une PANNE,
# jamais un « 0 » qu'on prendrait pour un cloisonnement réussi.
vus() { # $1=compte ("" = anon)
  local sortie
  if [ -z "$1" ]; then sortie="$(ANON "select count(*) from storage.objects where bucket_id='attachments';" || true)"
  else sortie="$(AS "$1" "select count(*) from storage.objects where bucket_id='attachments';" || true)"; fi
  case "$sortie" in ''|*[!0-9]*) echo "PANNE:$sortie";; *) echo "$sortie";; esac
}
vus_content() {
  local sortie; sortie="$(ANON "select count(*) from storage.objects where bucket_id='content';" || true)"
  case "$sortie" in ''|*[!0-9]*) echo "PANNE:$sortie";; *) echo "$sortie";; esac
}

echo "═══ Storage — cloisonnement de la lecture des pièces jointes ═══"

echo
echo "── ① L'ÉTAT D'AVANT : le défaut existe bel et bien ──"
socle
verifier "policy de production : un INCONNU liste TOUTES les pièces jointes" 3 "$(vus "$T")"
verifier "…et même un visiteur SANS COMPTE"                                  3 "$(vus "")"

echo
echo "── ② ATOMICITÉ : une policy SELECT inconnue annule toute la migration ──"
socle
Q -c "create policy \"derive_lecture\" on storage.objects for select using (true);" >/dev/null
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "policy SELECT inconnue : migration REFUSÉE" refusee "$r"
verifier "rollback : la policy d'origine est intacte" 1 \
  "$(Q -c "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='passio_media_read';")"
verifier "rollback : aucune policy du lot n'a fui"    0 \
  "$(Q -c "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'passio_attachments%';")"

# Une policy FOR ALL couvre le SELECT tout en portant cmd = 'ALL' : le garde doit
# la voir, sinon elle annulerait le cloisonnement en silence.
socle
Q -c "create policy \"derive_all\" on storage.objects for all using (true) with check (true);" >/dev/null
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "policy FOR ALL (cmd = 'ALL') : migration REFUSÉE aussi" refusee "$r"

socle
Q -c "drop function public.is_conv_member(text, text);" >/dev/null
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "aide d'appartenance absente : migration REFUSÉE" refusee "$r"

echo
echo "── ③ APRÈS : la lecture suit la règle de l'écriture ──"
socle
Q -f "$MIGRATION" >/dev/null
verifier "PRÉMISSE — un MEMBRE lit les pièces jointes de SA conversation" 2 "$(vus "$A")"
verifier "…l'autre membre aussi"                                          2 "$(vus "$B")"
verifier "un TIERS ne voit que celles de SA conversation"                 1 "$(vus "$T")"
verifier "un visiteur SANS COMPTE ne voit plus RIEN"                      0 "$(vus "")"
verifier "PRÉMISSE — le seau content reste lisible par tous (le fil d'un visiteur)" 2 "$(vus_content)"
verifier "le tiers ne lit pas le fichier précis d'une conversation d'autrui" 0 \
  "$(AS "$T" "select count(*) from storage.objects where name='attachments/conv_a/1_vocal.webm';")"
verifier "…et le membre, lui, le lit"                                     1 \
  "$(AS "$A" "select count(*) from storage.objects where name='attachments/conv_a/1_vocal.webm';")"
verifier "migration rejouée : idempotente"                                2 \
  "$(Q -f "$MIGRATION" >/dev/null; vus "$A")"
verifier "une seule policy SELECT par seau, pas de résidu"                2 \
  "$(Q -c "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and cmd='SELECT';")"
verifier "l'ancienne policy permissive a bien disparu"                    0 \
  "$(Q -c "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='passio_media_read';")"
verifier "la policy des pièces jointes est réservée à authenticated"      t \
  "$(Q -c "select roles = '{authenticated}'::name[] from pg_policies where schemaname='storage' and tablename='objects' and policyname='passio_attachments_read_membre';")"

echo
echo "── ④ MUTATIONS : chaque garde retirée doit rendre son test ROUGE ──"
mutation() { # $1=libellé  $2=SQL après migration  $3=attendu qui SIGNALE le défaut
  socle
  Q -f "$MIGRATION" >/dev/null
  Q -c "$2" >/dev/null
  local obtenu; obtenu="$(vus "$T")"
  if [ "$obtenu" = "$3" ]; then OK=$((OK+1)); printf '  ✅ %s → défaut détecté\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s → LA MUTATION SURVIT (obtenu «%s»)\n' "$1" "$obtenu"; fi
}

mutation "ancienne policy permissive rétablie à côté (OU permissif)" \
  "create policy \"passio_media_read\" on storage.objects for select using (bucket_id = any (array['content','attachments']));" \
  3
mutation "appartenance retirée du prédicat" \
  "drop policy \"passio_attachments_read_membre\" on storage.objects;
   create policy \"passio_attachments_read_membre\" on storage.objects for select to authenticated
     using (bucket_id = 'attachments');" \
  3
mutation "mauvais segment de chemin ([1] au lieu de [2])" \
  "drop policy \"passio_attachments_read_membre\" on storage.objects;
   create policy \"passio_attachments_read_membre\" on storage.objects for select to authenticated
     using (bucket_id = 'attachments'
            and public.is_conv_member((storage.foldername(name))[1], ((select auth.uid()))::text));" \
  0

# Le cas anon mérite sa propre mutation : il est la porte la plus grande ouverte.
socle
Q -f "$MIGRATION" >/dev/null
Q -c "drop policy \"passio_attachments_read_membre\" on storage.objects;
      create policy \"passio_attachments_read_membre\" on storage.objects for select
        using (bucket_id = 'attachments');" >/dev/null
if [ "$(vus "")" = "3" ]; then OK=$((OK+1)); printf '  ✅ policy rouverte à public : le visiteur relit tout → défaut détecté\n'
else KO=$((KO+1)); printf '  ❌ policy rouverte à public : la mutation SURVIT\n'; fi

echo
echo "═══ $OK OK · $KO KO ═══"
[ "$KO" -eq 0 ]
