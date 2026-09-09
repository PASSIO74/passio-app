#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# VÉRIFICATION DE `migration_creation_passion_utilisateur.sql`
# ──────────────────────────────────────────────────────────────────────────
# Même principe que `verifier-migration-passions.sh` : on l'EXÉCUTE sur un
# PostgreSQL jetable. Une migration relue n'est pas une migration éprouvée.
#
# Ce que le script prouve, dans cet ordre :
#   ① elle s'applique par-dessus le référentiel plat, et deux fois de suite ;
#   ② sans compte, `creer_passion` REFUSE ;
#   ③ avec un compte, elle crée une passion ACTIVE, publiable (la clé étrangère
#      de `posts.passion_id` l'accepte), d'identifiant dérivé du nom ;
#   ④ un nom déjà connu — libellé ou ALIAS, avec ou sans accents — rend
#      l'existante au lieu d'en créer une variante ;
#   ⑤ les noms invalides (trop court, chiffres seuls, URL) sont refusés ;
#   ⑥ trois créations offertes par compte, ensuite `quota_creation` — et
#      archiver ne rend PAS un droit de création ;
#   ⑦ ⚠️ LE RÉFÉRENTIEL RESTE EN LECTURE SEULE pour un client : INSERT et
#      DELETE directs sont toujours refusés (la création passe UNIQUEMENT par
#      la fonction `SECURITY DEFINER`) ;
#   ⑧ le retour arrière documenté s'exécute.
#
# Usage : bash scripts/verifier-migration-creation-passion.sh
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
MIG_PLAT="$RACINE/migrations/migration_passions_plat.sql"
MIG="$RACINE/migrations/migration_creation_passion_utilisateur.sql"
# ⚠️ LE LOT COMPTE DEUX MIGRATIONS, ET LA SECONDE REMPLACE LA FONCTION. Les
# éprouver séparément laisserait le plafond produit (3 créations offertes) sans
# banc : on les applique donc DANS L'ORDRE, comme la production les a reçues.
MIG2="$RACINE/migrations/migration_passion_creations_offertes.sql"
BASE="${PGDATA_TEST:-${TMPDIR:-/tmp}/passio-pg-creation}"
SOCK="${PGSOCK_TEST:-/tmp/ppgc-$$}"
PORT="${PGPORT_TEST:-55433}"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"

echec=0
titre() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
ok()    { printf '   ✅ %s\n' "$1"; }
ko()    { printf '   ❌ %s\n' "$1"; echec=1; }

command -v initdb >/dev/null || { echo "PostgreSQL introuvable — installer le paquet postgresql."; exit 2; }

rm -rf "$BASE" "$SOCK"; mkdir -p "$BASE/data" "$SOCK"
if [ "$(id -u)" = "0" ]; then
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

UID_A="11111111-1111-4111-8111-111111111111"
UID_B="22222222-2222-4222-8222-222222222222"
# `auth.uid()` du socle de test rend `null` en dur : on la remplace par une
# version pilotable, exactement comme Supabase la calcule depuis le jeton.
# Exécute une requête AU NOM d'un compte : `set local` dans la transaction,
# exactement comme PostgREST pose les claims du jeton.
# ⚠️ On filtre BEGIN/SET/COMMIT : psql les imprime, et une comparaison de
# chaîne sur la sortie BRUTE échouerait sur une requête pourtant juste — un
# rouge qui envoie chercher au mauvais endroit.
QA() { Q creation "begin; set local request.jwt.claim.sub = '$1'; $2; commit;" \
        | grep -vE '^(BEGIN|SET|COMMIT|INSERT [0-9]+ [0-9]+|UPDATE [0-9]+)$' | grep -v '^$'; }

# ── ① Application ─────────────────────────────────────────────────────────
titre "① Application par-dessus le référentiel plat"
NEUVE creation
F creation "$RACINE/scripts/gabarits/socle_supabase_test.sql" >/dev/null
F creation "$RACINE/scripts/gabarits/socle_passions_2026_08_15.sql" >/dev/null
F creation "$MIG_PLAT" >/dev/null
# ⚠️ Passer par un FICHIER, pas par `psql -c` : la définition traverse
# `su postgres -c "..."` puis `psql -c "..."`, et les `$$` d'un corps de
# fonction n'y survivent pas — la redéfinition échouait en silence et tout le
# reste du script mesurait un visiteur non connecté.
cat > "$BASE/authuid.sql" <<'EOF'
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;
EOF
chmod a+r "$BASE/authuid.sql"
F creation "$BASE/authuid.sql" >/dev/null
# ⚠️ ON SIMULE LES PRIVILÈGES PAR DÉFAUT DE SUPABASE. Le projet accorde EXECUTE
# à `anon` et `authenticated` sur toute fonction créée dans `public`, par des
# grants NOMINATIFS qu'un `revoke ... from public` ne retire pas. Un PostgreSQL
# nu n'a pas cette règle : sans cette ligne, la vérification ⑦ « la fonction est
# fermée à anon » serait verte PAR ACCIDENT — elle l'a été, pendant que la
# production portait `anon=X`. On pose donc le grant AVANT, pour que le test
# mesure ce que la migration RETIRE.
Q creation "alter default privileges in schema public grant execute on functions to anon, authenticated;" >/dev/null 2>&1
out=$(F creation "$MIG")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "migration appliquée"; else ko "échec :"; echo "$out" | grep -i error | head -5; fi
acl=$(Q creation "select has_function_privilege('anon', 'public.creer_passion(text,text)', 'EXECUTE')::text")
[ "$acl" = "false" ] && ok "anon n'a PAS le droit d'exécuter creer_passion" || ko "anon garde EXECUTE sur creer_passion : $acl"
acl=$(Q creation "select has_function_privilege('authenticated', 'public.creer_passion(text,text)', 'EXECUTE')::text")
[ "$acl" = "true" ] && ok "authenticated peut l'exécuter" || ko "authenticated n'a pas EXECUTE : $acl"
out=$(F creation "$MIG")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "seconde exécution : idempotente"; else ko "NON IDEMPOTENTE :"; echo "$out" | grep -i error | head -5; fi
out=$(F creation "$MIG2")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "plafond des créations offertes appliqué"; else ko "échec :"; echo "$out" | grep -i error | head -5; fi
out=$(F creation "$MIG2")
if [ $? -eq 0 ] && ! grep -qi "^ERROR" <<<"$out"; then ok "seconde exécution : idempotente"; else ko "NON IDEMPOTENTE :"; echo "$out" | grep -i error | head -5; fi
acl=$(Q creation "select has_function_privilege('anon', 'public.creer_passion(text,text)', 'EXECUTE')::text")
[ "$acl" = "false" ] && ok "anon reste sans EXECUTE après le remplacement" || ko "le remplacement a rendu EXECUTE à anon : $acl"
col=$(Q creation "select count(*) from information_schema.columns where table_name='passions' and column_name='created_by'")
[ "$col" = "1" ] && ok "colonne created_by présente" || ko "colonne created_by absente"

# ── ② Sans compte ─────────────────────────────────────────────────────────
titre "② Sans compte, la création est refusée"
res=$(Q creation "select * from public.creer_passion('Sculpture sur glace')")
grep -qi "auth_requise" <<<"$res" && ok "refus explicite (auth_requise)" || ko "réponse inattendue : $res"

# ── ③ Création réelle ─────────────────────────────────────────────────────
titre "③ Création par un compte connecté"
res=$(QA "$UID_A" "select id||'|'||label||'|'||emoji||'|'||cree from public.creer_passion('sculpture sur glace', '🧊')")
[ "$res" = "sculpture-sur-glace|Sculpture sur glace|🧊|true" ] \
  && ok "créée : $res" || ko "résultat inattendu : $res"
st=$(Q creation "select status||'|'||source||'|'||popularity||'|'||coalesce(created_by::text,'-') from public.passions where id='sculpture-sur-glace'")
[ "$st" = "active|user_suggested|0|$UID_A" ] && ok "active, source=user_suggested, popularité 0, attribuée" || ko "état inattendu : $st"
res=$(Q creation "select id from public.rechercher_passions('sculpture sur glace', 5) limit 1")
[ "$res" = "sculpture-sur-glace" ] && ok "trouvable par la recherche serveur" || ko "introuvable : « $res »"
# Publiable : c'est TOUT l'objet du lot. Une passion « en vérification » ne
# passait pas la clé étrangère de posts.passion_id.
res=$(Q creation "insert into public.posts (id, passion_id, content) values ('p_creation', 'sculpture-sur-glace', 'essai') returning passion_id" | head -1)
[ "$res" = "sculpture-sur-glace" ] && ok "publication acceptée par la clé étrangère" || ko "publication refusée : $res"

# ── ④ Dédoublonnage ───────────────────────────────────────────────────────
titre "④ Un nom déjà connu ne crée pas une variante"
verif_doublon() {
  res=$(QA "$UID_B" "select id||'|'||cree from public.creer_passion('$1')")
  [ "$res" = "$2|false" ] && ok "« $1 » → $2 (existante)" || ko "« $1 » → « $res » (attendu $2, cree=false)"
}
verif_doublon "Sculpture sur glace" "sculpture-sur-glace"
verif_doublon "SCULPTURE SUR GLÂCE"  "sculpture-sur-glace"
verif_doublon "Musique"              "musique"
verif_doublon "jogging"              "running"          # alias du référentiel
# ⚠️ ALIAS PONCTUÉ : 386 des 1 578 alias portent un tiret ou un accent composé.
# Sans pliage des DEUX côtés, « ping pong » créait un doublon de « Tennis de
# table » dans le référentiel commun — et le test à « jogging » seul, sans
# ponctuation, restait vert dessus.
verif_doublon "ping pong"            "sport-tennis-de-table"
verif_doublon "hors piste"           "glisse-freeride"
n=$(Q creation "select count(*) from public.passions where normalized_label='sculpture sur glace'")
[ "$n" = "1" ] && ok "une seule ligne pour ce nom" || ko "$n lignes pour le même nom"

# ── ⑤ Noms refusés ────────────────────────────────────────────────────────
titre "⑤ Noms refusés"
verif_refus() {
  res=$(QA "$UID_B" "select id from public.creer_passion('$1')")
  grep -qi "$2" <<<"$res" && ok "« $1 » refusé ($2)" || ko "« $1 » → $res"
}
verif_refus "a"                                   "nom_invalide"
verif_refus "2025"                                "nom_invalide"
verif_refus "https://exemple.fr"                  "nom_invalide"
verif_refus "contact@exemple.fr"                  "nom_invalide"
verif_refus "<img src=x onerror=1>"               "nom_invalide"
verif_refus "un nom vraiment beaucoup trop bavard pour etre une passion" "nom_trop_long"

# ── ⑥ Plafond ─────────────────────────────────────────────────────────────
titre "⑥ Trois créations offertes, ensuite le paywall"
# ③ en a déjà créé UNE pour $UID_A : deux de plus atteignent le plafond.
for i in 1 2; do
  QA "$UID_A" "select id from public.creer_passion('passion essai numero $i')" >/dev/null
done
n=$(Q creation "select count(*) from public.passions where created_by='$UID_A'")
[ "$n" = "3" ] && ok "trois passions créées par ce compte" || ko "décompte inattendu : $n"
res=$(QA "$UID_A" "select id from public.creer_passion('une quatrieme passion')")
grep -qi "quota_creation" <<<"$res" && ok "la 4ᵉ création est refusée (quota_creation → paywall)" || ko "plafond non tenu : $res"

# ⚠️ ARCHIVER NE REND PAS UN DROIT DE CRÉATION. Sans cette mesure, il suffirait
# d'archiver pour repartir de zéro — la porte dérobée que le quota de
# changements a dû fermer le 2026-09-02, rouverte par le bas.
Q creation "update public.passions set status='archived' where created_by='$UID_A'" >/dev/null
res=$(QA "$UID_A" "select id from public.creer_passion('une cinquieme passion')")
grep -qi "quota_creation" <<<"$res" && ok "archiver ne rend pas un droit de création" || ko "le quota s'est rouvert par l'archivage : $res"
Q creation "update public.passions set status='active' where created_by='$UID_A'" >/dev/null

# ⚠️ UN NOM DÉJÀ CONNU RESTE GRATUIT, MÊME AU PLAFOND : il ne CRÉE rien. Le
# refuser ferait payer pour un nom que le référentiel connaissait déjà.
res=$(QA "$UID_A" "select id||'|'||cree from public.creer_passion('Musique')")
[ "$res" = "musique|false" ] && ok "au plafond, une passion existante reste accessible" || ko "le plafond bloque une passion existante : $res"

res=$(QA "$UID_B" "select id||'|'||cree from public.creer_passion('tricot islandais')")
[ "$res" = "tricot-islandais|true" ] && ok "le plafond est par personne, pas global" || ko "un autre compte est bloqué : $res"

# ── ⑦ Le référentiel reste en lecture seule ───────────────────────────────
titre "⑦ RLS : aucune écriture directe sur le référentiel"
Q creation "grant usage on schema public to anon, authenticated;
            grant select on all tables in schema public to anon, authenticated;
            grant insert, update, delete on public.user_passions, public.passion_requests to authenticated;" >/dev/null 2>&1
res=$(Q creation "set role authenticated; insert into public.passions (id,label) values ('pirate','Pirate');")
grep -qi "policy\|denied\|permission" <<<"$res" && ok "INSERT direct toujours refusé" || ko "le client a pu écrire dans le référentiel : $res"
res=$(Q creation "set role authenticated; delete from public.passions where id='musique';")
grep -qi "policy\|denied\|permission" <<<"$res" && ok "DELETE direct toujours refusé" || ko "le client a pu supprimer une passion : $res"
res=$(Q creation "set role authenticated; update public.passions set label='Pirate' where id='musique';")
grep -qi "policy\|denied\|permission" <<<"$res" && ok "UPDATE direct toujours refusé" || ko "le client a pu renommer une passion : $res"
res=$(Q creation "set role anon; select public.creer_passion('anonyme');")
grep -qi "denied\|permission\|auth_requise" <<<"$res" && ok "la fonction est fermée à anon" || ko "anon a pu créer : $res"

# ── ⑧ Retour arrière ──────────────────────────────────────────────────────
titre "⑧ Retour arrière documenté"
out=$(Q creation "drop function if exists public.creer_passion(text,text);
                  update public.passions set status='archived' where source='user_suggested';")
grep -qi "^ERROR" <<<"$out" && { ko "le retour arrière échoue :"; echo "$out" | head -3; } || ok "retour arrière exécuté"
n=$(Q creation "select count(*) from public.passions where source='user_suggested' and status='active'")
[ "$n" = "0" ] && ok "plus aucune passion créée par un compte n'est active" || ko "$n encore active(s)"

printf '\n'
[ $echec -eq 0 ] && { echo "✅ Création de passion vérifiée sur PostgreSQL $(Q creation 'show server_version')."; exit 0; }
echo "❌ Vérification en échec."; exit 1
