#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_search_path_fonctions.sql
#
# Même méthode que les bancs de sécurité des 08, 10 et 11/09 : on reconstitue
# l'état RÉEL de la production sur un PostgreSQL jetable, on MESURE D'ABORD le
# défaut, on applique, on REJOUE, puis on retire chaque garde et on exige que
# le banc — et le TABLEAU DE VERDICT du fichier — rougissent.
#
# ⚠️ CE BANC NE MESURE PAS QUE `proconfig`. Trois lignes de `ALTER FUNCTION`
# sont triviales à écrire et triviales à vérifier ; ce qui peut RÉELLEMENT mal
# tourner, c'est que le chemin figé empêche une fonction de résoudre ses
# propres appels. Le cœur du banc est donc ⑤ : `rechercher_passions` répond
# encore, et le chemin naïf `''` la CASSE — mesuré, pas supposé.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_search_path_fonctions.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

# ⚠️ TOUT LE BANC REPOSE SUR pg_trgm : sans lui, `similarity` n'existe nulle
# part et les contrôles ⑤/⑦/⑧ mesureraient le vide en restant verts — le pire
# des états. On le dit ICI, en clair, plutôt que de laisser une erreur SQL
# obscure plus bas. Sur Ubuntu, l'extension est fournie par `postgresql-NN`
# lui-même (mesuré sur 24.04) ; si ce message paraît en CI, ajouter
# `sudo apt-get install -y postgresql-contrib` au job.
ls /usr/share/postgresql/*/extension/pg_trgm.control >/dev/null 2>&1 \
  || { echo "❌ pg_trgm introuvable : ce banc ne peut RIEN prouver sans lui (voir le commentaire ci-dessus)"; exit 1; }

PORT=$(( 6050 + RANDOM % 120 ))
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

DB=searchpath
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `psql -q` AVALE les étiquettes de commande : cette aide rend « OK » quand
# rien n'a levé, et le message d'erreur sinon — lisible dans le rapport.
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
# ⚠️ Sans ON_ERROR_STOP, et TOUJOURS appelée en position d'ARGUMENT : une
# affectation `m="$(LIBRE …)"` tuerait le banc sous `set -e` au premier refus
# SQL — or ici le refus EST ce qu'on mesure (CLAUDE.md, banc du 11/09).
LIBRE() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$1" 2>&1; }

# ⚠️ Le verdict est EXTRAIT du fichier de migration, jamais réécrit ici : deux
# constructions du même verdict finissent toujours par diverger (leçon de la
# dédup de la sentinelle, 2026-09-10).
VERDICT="$(awk '/^with v\(ordre, correctif, ok\) as \(/{f=1} f{print} /^from v order by ordre;/{f=0}' "$MIGRATION")"
verdict_de() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$VERDICT" 2>&1 | grep "^$1|" | awk -F'|' '{print $3}'; }

ok=0; ko=0
verifier() { # libellé, attendu, obtenu
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi
}
contient() { # libellé, motif, texte
  if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi
}

# ── SOCLE : l'état RÉEL de la production, mesuré le 2026-09-12 ──────────────
# Les trois fonctions sont recopiées de `pg_get_functiondef` en production :
# mêmes corps, mêmes signatures, AUCUN `set search_path` — c'est le défaut.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema auth;
create schema storage;
-- Le schéma `extensions` EXISTE en production, même si pg_trgm n'y est pas
-- (encore). C'est ce qui rend le chemin de ③ valable dans les deux états.
create schema extensions;
-- ⚠️ pg_trgm est installé dans `public` en production (mesuré) : `similarity`
-- n'existe QUE là. C'est toute la raison d'être du contrôle ⑤.
create extension pg_trgm with schema public;

create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
create function storage.foldername(name text) returns text[] language sql immutable as
  $fn$ select string_to_array(name, '/') $fn$;

create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));
create function public.is_conv_member(_conv_id text, _uid text)
  returns boolean language sql stable security definer set search_path = '' as
  $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;

create table public.passions (
  id text primary key, label text, emoji text, color text, popularity int default 0,
  sort_order int, status text default 'active', normalized_label text, aliases text[] default '{}',
  is_broad boolean default false);

-- ── Les TROIS fonctions maison, telles quelles, SANS search_path ──
create function public.unaccent_immutable(txt text) returns text language sql immutable strict as
$fn$
  select translate(
    lower(txt),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
    'aaaaaaceeeeiiiinooooouuuuyyoa'
  );
$fn$;

create function public.storage_chemin_autorise(_bucket text, _name text) returns boolean language sql stable as
$fn$
  select
    (_bucket = 'content'
      and (storage.foldername(_name))[2] = (select auth.uid())::text)
    or
    (_bucket = 'attachments'
      and public.is_conv_member((storage.foldername(_name))[2], (select auth.uid())::text));
$fn$;

create function public.rechercher_passions(q text, lim integer default 20)
returns table(id text, label text, emoji text, color text, popularity integer, score integer)
language plpgsql stable as
$fn$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
  trgm boolean := exists (select 1 from pg_extension where extname = 'pg_trgm');
begin
  if n = '' then
    return query
      select p.id, p.label, p.emoji, p.color, p.popularity, 0
        from public.passions p
       where p.status = 'active'
       order by p.popularity desc, p.sort_order
       limit least(greatest(coalesce(lim, 20), 1), 50);
    return;
  end if;
  return query
    select p.id, p.label, p.emoji, p.color, p.popularity,
           (case
              when p.normalized_label = n then 0
              when p.normalized_label like n || '%' then 10
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) = n) then 20
              else 60
            end + case when p.is_broad then 5 else 0 end)::int as score
      from public.passions p
     where p.status = 'active'
       and (p.normalized_label like '%' || n || '%'
            or exists (select 1 from unnest(p.aliases) a
                        where public.unaccent_immutable(a) like '%' || n || '%')
            or (trgm and similarity(p.normalized_label, n) > 0.3))
     order by score, p.popularity desc, p.sort_order
     limit least(greatest(coalesce(lim, 20), 1), 50);
end $fn$;

-- Les DEUX triggers arrivés avec le lot d'ouverture (2026-09-11), que
-- `get_advisors` signale depuis. Ils ne touchent aucune relation : ils lisent
-- `old`/`new` et lèvent. Une table porteuse pour les EXERCER après la migration
-- — un chemin figé qui les casserait ne se verrait nulle part ailleurs.
create function public.identifiants_figes() returns trigger language plpgsql as
$fn$
declare col text; avant text; apres text;
begin
  foreach col in array TG_ARGV loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into avant, apres using old, new;
    if avant is distinct from apres then
      raise exception '% : la colonne % ne se modifie pas', TG_TABLE_NAME, col using errcode = '42501';
    end if;
  end loop;
  return new;
end $fn$;

create function public.follows_identifiants_figes() returns trigger language plpgsql as
$fn$
begin
  if new.follower_id <> old.follower_id or new.following_id <> old.following_id then
    raise exception 'follows : les identifiants d''un abonnement ne se modifient pas' using errcode = '42501';
  end if;
  return new;
end $fn$;

create table public.follows (follower_id text, following_id text, status text);
create trigger trg_follows_figes before update on public.follows
  for each row execute function public.follows_identifiants_figes();

create table public.conv_messages (id text primary key, conv_id text, corps text);
create trigger trg_identifiants_figes before update on public.conv_messages
  for each row execute function public.identifiants_figes('conv_id');

insert into public.follows values ('u_a', 'u_b', 'accepted');
insert into public.conv_messages values ('m1', 'conv_a', 'coucou');

insert into public.passions (id, label, emoji, color, popularity, sort_order, normalized_label, aliases)
values ('randonnee', 'Randonnée', '🥾', '#7c3aed', 900, 1, 'randonnee', '{"rando","trek"}'),
       ('astronomie', 'Astronomie', '🔭', '#7c3aed', 800, 2, 'astronomie', '{"astro"}');
insert into public.conv_members values ('conv_a', '11111111-1111-1111-1111-111111111111');
SQL

# ═══════════════════════════════════════════════════════════════════════════
echo "── ① LE DÉFAUT, MESURÉ AVANT TOUT ───────────────────────────────────"
verifier "les cinq fonctions maison n'ont AUCUN search_path" "5" \
  "$(Q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proconfig is null
          and p.proname in ('unaccent_immutable','storage_chemin_autorise','rechercher_passions',
                            'identifiants_figes','follows_identifiants_figes');")"
verifier "…et la recherche de passions fonctionne (état de départ)" "1" \
  "$(Q "select count(*) from public.rechercher_passions('randonnee', 5);")"
# ⚠️ Le nombre de fonctions pg_trgm n'est pas figé : il dépend de la version de
# l'extension (31 en production). On mesure qu'il y en a PLUSIEURS, et surtout
# que la migration n'y touchera pas — c'est le contrôle ⑥.
avant_trgm="$(Q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 join pg_depend d on d.objid = p.oid and d.deptype = 'e'
                 where n.nspname='public' and p.proconfig is null;")"
if [ "$avant_trgm" -ge 10 ]; then ok=$((ok+1)); printf '  ✅ %s\n' "pg_trgm apporte $avant_trgm fonctions sans search_path (elles ne sont pas à nous)"
else ko=$((ko+1)); printf '  ❌ socle inattendu : %s fonction(s) d extension\n' "$avant_trgm"; fi

echo "── ② APPLICATION DE LA MIGRATION ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "❌ la migration a échoué :"; echo "$sortie"; exit 1; }
echo "  ✅ appliquée sans erreur"; ok=$((ok+1))
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
verifier "le tableau de verdict rend 6 OK et 0 ECHEC" "6/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  && { echo "  ✅ rejouable (idempotente)"; ok=$((ok+1)); } \
  || { echo "  ❌ non rejouable :"; echo "$sortie2" | tail -3; ko=$((ko+1)); }

echo "── ③ LES CHEMINS SONT CEUX QU'ON A VOULUS ───────────────────────────"
verifier "unaccent_immutable : chemin VIDE" 'search_path=""' \
  "$(Q "select array_to_string(proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='unaccent_immutable';")"
verifier "storage_chemin_autorise : chemin VIDE" 'search_path=""' \
  "$(Q "select array_to_string(proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='storage_chemin_autorise';")"
verifier "rechercher_passions : public, extensions, pg_temp" "search_path=public, extensions, pg_temp" \
  "$(Q "select array_to_string(proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='rechercher_passions';")"
verifier "identifiants_figes : chemin VIDE" 'search_path=""' \
  "$(Q "select array_to_string(proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='identifiants_figes';")"
verifier "follows_identifiants_figes : chemin VIDE" 'search_path=""' \
  "$(Q "select array_to_string(proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='follows_identifiants_figes';")"

echo "── ④ LES CINQ FONCTIONS RÉPONDENT ENCORE ────────────────────────────"
verifier "unaccent_immutable rend toujours le texte sans accent" "randonnee" \
  "$(Q "select public.unaccent_immutable('Randonnée');")"
verifier "storage_chemin_autorise dit OUI au membre de la conversation" "t" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
     -c "set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
         select public.storage_chemin_autorise('attachments', 'attachments/conv_a/photo.jpg');" 2>&1)"
verifier "…et NON à un tiers (le prédicat n'est pas devenu permissif)" "f" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
     -c "set local request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
         select public.storage_chemin_autorise('attachments', 'attachments/conv_a/photo.jpg');" 2>&1)"
verifier "rechercher_passions trouve encore, y compris par ALIAS" "1" \
  "$(Q "select count(*) from public.rechercher_passions('trek', 5);")"
verifier "…et par approximation (similarity de pg_trgm, le chemin sert ICI)" "1" \
  "$(Q "select count(*) from public.rechercher_passions('randonee', 5);")"
# ⚠️ LES DEUX TRIGGERS SONT EXERCÉS, PAS SEULEMENT LUS. Un chemin figé qui les
# casserait laisserait les contrôles de `proconfig` ci-dessus au VERT et la
# garde d'intégrité muette — c'est-à-dire un message déplaçable par UPDATE, le
# défaut que la red team du 11/09 avait trouvé. Vérifier l'attribut ne vérifie
# pas le comportement.
verifier "identifiants_figes laisse passer une modification légitime" "OK" \
  "$(_ok_ou_erreur "$(LIBRE "update public.conv_messages set corps='edit' where id='m1';")")"
contient "…et REFUSE toujours de déplacer le message de conversation" "ne se modifie pas" \
  "$(LIBRE "update public.conv_messages set conv_id='conv_b' where id='m1';")"
contient "follows_identifiants_figes refuse toujours de réassigner l'abonné" "ne se modifient pas" \
  "$(LIBRE "update public.follows set follower_id='u_x' where following_id='u_b';")"

echo "── ⑤ LE CHEMIN VIDE CASSE LA RECHERCHE — mesuré, pas supposé ────────"
# C'est le contrôle qui justifie le choix de ③. Supabase recommande `''` partout ;
# ici, il rendrait la page Rechercher muette.
Q "alter function public.rechercher_passions(text, integer) set search_path = '';" >/dev/null
contient "avec search_path='' : « function similarity … does not exist »" "similarity" \
  "$(LIBRE "select count(*) from public.rechercher_passions('randonee', 5);")"
# ⚠️ Le verdict ne rend alors AUCUNE ligne : sa ligne ④ APPELLE la fonction,
# donc elle LÈVE et toute la requête échoue. C'est voulu — voir ⑧.
contient "  …et le tableau de verdict LÈVE au lieu de dire OK" "similarity" \
  "$(LIBRE "$VERDICT")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "rejouer la migration répare la mutation" "1" \
  "$(Q "select count(*) from public.rechercher_passions('randonee', 5);")"

echo "── ⑥ CE QUI N'EST PAS À NOUS N'EST PAS TOUCHÉ ───────────────────────"
verifier "les fonctions de pg_trgm gardent leur chemin d'origine (aucun)" "$avant_trgm" \
  "$(Q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        join pg_depend d on d.objid = p.oid and d.deptype = 'e'
        where n.nspname='public' and p.proconfig is null;")"

echo "── ⑦ LE JOUR OÙ pg_trgm SORTIRA DE public (l'autre constat du linter) ──"
# ⚠️ Le rapport `get_advisors` demande AUSSI de déplacer pg_trgm hors de
# `public`. Sans `extensions` dans le chemin de ③, appliquer CE conseil-là
# casserait la recherche. On le joue pour de vrai.
Q "alter extension pg_trgm set schema extensions;" >/dev/null
verifier "pg_trgm déplacé dans extensions : la recherche répond TOUJOURS" "1" \
  "$(Q "select count(*) from public.rechercher_passions('randonee', 5);")"
# Contre-épreuve : un chemin qui ne nommerait que `public` la casserait.
Q "alter function public.rechercher_passions(text, integer) set search_path = public, pg_temp;" >/dev/null
contient "  …alors qu'un chemin « public, pg_temp » seul la casserait" "similarity" \
  "$(LIBRE "select count(*) from public.rechercher_passions('randonee', 5);")"
Q "alter extension pg_trgm set schema public;" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1

echo "── ⑧ LA MIGRATION REFUSE DE S'APPLIQUER SI ELLE CASSE LA RECHERCHE ──"
# ⚠️ LE CONTRÔLE LE PLUS IMPORTANT DU BANC. La ligne ④ du verdict n'est pas un
# rapport, c'est une GARDE : elle APPELLE `rechercher_passions`. Sur une base où
# le chemin choisi ne résoudrait pas `similarity`, elle lève, la transaction est
# annulée, et les trois `ALTER` sont DÉFAITS. Un correctif d'hygiène ne doit
# jamais pouvoir laisser le produit muet — on le prouve en retirant pg_trgm.
Q "alter function public.unaccent_immutable(text) reset search_path;
   alter function public.storage_chemin_autorise(text, text) reset search_path;
   alter function public.rechercher_passions(text, integer) reset search_path;
   drop extension pg_trgm;" >/dev/null
verifier "socle de la mutation : les trois chemins sont de nouveau absents" "3" \
  "$(Q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proconfig is null
          and p.proname in ('unaccent_immutable','storage_chemin_autorise','rechercher_passions');")"
if psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then
  ko=$((ko+1)); printf '  ❌ %s\n' "la migration s'est appliquée alors que la recherche est cassée"
else
  ok=$((ok+1)); printf '  ✅ %s\n' "sans pg_trgm, la migration ÉCHOUE au lieu de commiter"
fi
verifier "  …et AUCUN chemin n'a été laissé derrière (transaction annulée)" "3" \
  "$(Q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proconfig is null
          and p.proname in ('unaccent_immutable','storage_chemin_autorise','rechercher_passions');")"

echo
echo "───────────────────────────────────────────────────────────────────────"
echo "  $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ] || { echo "❌ BANC ROUGE"; exit 1; }
echo "✅ BANC VERT — les trois chemins sont figés, et la recherche survit aux deux états de pg_trgm"
