#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# VÉRIFICATION DE LA MIGRATION SUR UN VRAI POSTGRESQL
# ──────────────────────────────────────────────────────────────────────────
# Elle l'EXÉCUTE. Relire une migration ne dit rien de son idempotence : le lot
# précédent (PR #231) a livré une migration non idempotente que trois relectures
# n'avaient pas vue, et qu'un `psql` a trouvée en huit secondes.
#
# Ce que le script prouve, dans cet ordre :
#   ① la migration passe sur un socle VIDE ;
#   ② elle passe sur le socle du 2026-08-15 (table `passions` à 19 lignes,
#      avec les clés étrangères des cinq tables de contenu) ;
#   ③ elle est IDEMPOTENTE : deux exécutions de suite, aucune erreur, mêmes
#      décomptes ;
#   ④ les 19 identifiants historiques sont là, et le contenu qui les référence
#      n'a pas bougé ;
#   ⑤ la recherche serveur rend ce qu'on attend, y compris par alias ;
#   ⑥ le retour arrière documenté s'exécute.
#
# Usage : bash scripts/verifier-migration-passions.sh
# Prérequis : PostgreSQL local (paquet postgresql), lancé par ce script.
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$RACINE/migrations/migration_passions_plat.sql"
BASE="${PGDATA_TEST:-${TMPDIR:-/tmp}/passio-pg-verif}"
# ⚠️ Le socket ne vit PAS avec les données : un chemin de socket Unix est
# plafonné à 107 octets par le noyau, et un répertoire de travail de session
# suffit à le dépasser (mesuré). D'où un chemin court, dédié.
SOCK="${PGSOCK_TEST:-/tmp/ppg-$$}"
PORT="${PGPORT_TEST:-55432}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"

echec=0
titre() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
ok()    { printf '   ✅ %s\n' "$1"; }
ko()    { printf '   ❌ %s\n' "$1"; echec=1; }

command -v initdb >/dev/null || { echo "PostgreSQL introuvable — installer le paquet postgresql."; exit 2; }

# ── Démarrage d'un cluster jetable ────────────────────────────────────────
rm -rf "$BASE" "$SOCK"; mkdir -p "$BASE/data" "$SOCK"
if [ "$(id -u)" = "0" ]; then
  # initdb refuse de tourner en root : on emprunte l'utilisateur `postgres`.
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
NEUVE() { $COMME "psql -h '$SOCK' -p $PORT -U postgres -tAc 'drop database if exists $1' " >/dev/null 2>&1
          $COMME "psql -h '$SOCK' -p $PORT -U postgres -tAc 'create database $1'" >/dev/null 2>&1; }


# ── ① Socle VIDE ──────────────────────────────────────────────────────────
titre "① Application sur une base vierge"
NEUVE vierge
F vierge "$RACINE/scripts/gabarits/socle_supabase_test.sql" >/dev/null
out=$(F vierge "$MIG")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "migration appliquée"; else ko "échec :"; echo "$out" | grep -i error | head -5; fi
n=$(Q vierge "select count(*) from public.passions where status='active'")
[ "$n" -gt 1000 ] 2>/dev/null && ok "passions actives : $n" || ko "passions actives : $n"

# ── ② Socle de PRODUCTION (19 passions + FK des cinq tables) ──────────────
titre "② Application sur le socle du 2026-08-15 (19 passions, FK posées)"
NEUVE prod
F prod "$RACINE/scripts/gabarits/socle_supabase_test.sql" >/dev/null
F prod "$RACINE/scripts/gabarits/socle_passions_2026_08_15.sql" >/dev/null
avant=$(Q prod "select count(*) from public.posts")
out=$(F prod "$MIG")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "migration appliquée sur le socle existant"; else ko "échec :"; echo "$out" | grep -i error | head -5; fi
apres=$(Q prod "select count(*) from public.posts")
{ [ "$avant" = "$apres" ] && [ "$apres" -ge 1 ] 2>/dev/null; } && ok "contenu intact ($apres publications)" || ko "le contenu a bougé : $avant → $apres"
legacy=$(Q prod "select count(*) from public.passions where source='legacy'")
[ "$legacy" = "19" ] && ok "les 19 identifiants historiques gardent source='legacy'" || ko "source='legacy' : $legacy au lieu de 19"

# ── ③ IDEMPOTENCE ─────────────────────────────────────────────────────────
titre "③ Seconde exécution, à l'identique"
n1=$(Q prod "select count(*) from public.passions")
r1=$(Q prod "select count(*) from public.passion_relations")
out=$(F prod "$MIG")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "seconde exécution sans erreur"; else ko "NON IDEMPOTENTE :"; echo "$out" | grep -i error | head -5; fi
n2=$(Q prod "select count(*) from public.passions")
r2=$(Q prod "select count(*) from public.passion_relations")
[ "$n1" = "$n2" ] && [ "$r1" = "$r2" ] && ok "décomptes stables ($n2 passions, $r2 relations)" || ko "décomptes changés : $n1→$n2, $r1→$r2"

# ── ④ Les 19, et le contenu qui les référence ─────────────────────────────
titre "④ Identifiants historiques et intégrité référentielle"
manquants=$(Q prod "select count(*) from unnest(ARRAY['musique','photo','voyage','cuisine','sport','litterature','cinema','tech','art','jardinage','metier','jeuxvideo','yoga','mode','danse','podcast','moto','animaux','actu']) x where x not in (select id from public.passions)")
[ "$manquants" = "0" ] && ok "les 19 sont présents" || ko "$manquants identifiant(s) historique(s) ABSENT(S)"
orph=$(Q prod "select count(*) from public.posts p where p.passion_id is not null and not exists (select 1 from public.passions x where x.id=p.passion_id)")
[ "$orph" = "0" ] && ok "aucune publication orpheline" || ko "$orph publication(s) orpheline(s)"

# ── ⑤ Recherche serveur ───────────────────────────────────────────────────
titre "⑤ Recherche serveur"
verif_recherche() {
  res=$(Q prod "select id from public.rechercher_passions('$1', 5) limit 1")
  [ "$res" = "$2" ] && ok "« $1 » → $2" || ko "« $1 » → « $res » (attendu « $2 »)"
}
verif_recherche "enduro"       "moto-enduro"
verif_recherche "jogging"      "running"
verif_recherche "moto cross"   "moto-motocross"
verif_recherche "photo astro"  "photo-astrophoto"
verif_recherche "guitare elec" "musique-guitare-electrique"
verif_recherche "cuisine coreenne" "cuisine-coreenne"
n=$(Q prod "select count(*) from public.rechercher_passions('a', 20)")
[ "$n" -le 20 ] && ok "résultats plafonnés à 20 (obtenu $n)" || ko "plafond non respecté : $n"
n=$(Q prod "select count(*) from public.rechercher_passions('zzzzqqq', 20)")
[ "$n" = "0" ] && ok "une frappe sans correspondance ne rend rien" || ko "$n résultat(s) pour une frappe absurde"

# ── ⑥ Le référentiel n'est pas modifiable par un client ───────────────────
titre "⑥ RLS : le référentiel est en lecture seule"
Q prod "grant usage on schema public to anon, authenticated;
        grant select on all tables in schema public to anon, authenticated;
        grant insert, update, delete on public.user_passions, public.passion_requests to authenticated;" >/dev/null 2>&1
res=$(Q prod "set role authenticated; insert into public.passions (id,label) values ('pirate','Pirate');")
grep -qi "policy\|denied\|permission" <<<"$res" && ok "INSERT dans le référentiel refusé" || ko "le client a pu écrire dans le référentiel : $res"
res=$(Q prod "set role authenticated; delete from public.passions where id='moto';")
grep -qi "policy\|denied\|permission" <<<"$res" && ok "DELETE dans le référentiel refusé" || ko "le client a pu supprimer une passion : $res"

# ── ⑦ Retour arrière ──────────────────────────────────────────────────────
titre "⑦ Retour arrière documenté"
out=$(Q prod "drop function if exists public.rechercher_passions(text,int);
              drop table if exists public.passion_requests;
              drop table if exists public.user_passions;
              drop table if exists public.passion_relations;
              update public.passions set status='archived' where source <> 'legacy';")
grep -qi "^ERROR" <<<"$out" && { ko "le retour arrière échoue :"; echo "$out" | head -3; } || ok "retour arrière exécuté"
reste=$(Q prod "select count(*) from public.passions where status='active'")
[ "$reste" = "19" ] && ok "il reste exactement les 19 passions historiques actives" || ko "$reste passion(s) active(s) au lieu de 19"

printf '\n'
[ $echec -eq 0 ] && { echo "✅ Migration vérifiée sur PostgreSQL $(Q prod 'show server_version')."; exit 0; }
echo "❌ Vérification en échec."; exit 1
