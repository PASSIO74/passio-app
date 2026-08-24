#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC #136 — Trust & Safety serveur : âge fiable, blocage bidirectionnel,
# conversation non forçable.
#
# Monte un PostgreSQL JETABLE, y reconstitue la partie de la prod PASSIO que
# la migration touche (tests/sql/socle-prod.sql, policies recopiées du schéma
# de référence), applique la migration, puis joue les scénarios EN TANT QUE
# comptes distincts via `set local role authenticated` + le claim JWT.
#
# ⚠️ Chaque garde est éprouvée par MUTATION : la garde est retirée, et le test
# correspondant DOIT redevenir rouge. Une assertion qui reste verte sans sa
# garde ne prouve rien — c'est le seul moyen de le savoir.
#
# ⚠️ Chaque refus attendu est précédé de sa PRÉMISSE (le cas légitime
# équivalent, qui doit passer). Sans elle, un socle cassé ferait passer tous
# les « refusé » sans qu'aucune garde n'y soit pour rien — c'est arrivé en
# écrivant ce banc : sans la policy SELECT de `conversations`, AUCUN ajout de
# tiers ne passait, et « un compte bloqué ne peut pas être ajouté » était vert
# pour la mauvaise raison.
#
#   ./tests/sql/migration-ts-serveur.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_ts_serveur_age_blocage.sql"
SOCLE="$RACINE/tests/sql/socle-prod.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5400 + RANDOM % 150 ))

# ⚠️ `initdb` et `postgres` REFUSENT de tourner en root. En conteneur CI on est
# souvent root : on bascule alors sur un compte de service dédié. Sans ça le
# serveur ne démarre jamais — et un banc dont le serveur est absent rend des
# erreurs de connexion, pas des échecs francs (cf. `insere` plus bas).
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
# ⚠️ Un banc qui continue sans serveur produit des FAUX VERTS : la première
# version de ce script a rendu « ✅ un membre légitime passe toujours » alors
# qu'aucune base ne tournait. On s'arrête net.
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

ADMIN() { psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d ts -tA -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
# Exécute en tant que compte authentifié $1.
AS() { psql -h "$BASE" -p "$PORT" -U postgres -d ts -tA -q \
       -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # majeur
B=22222222-2222-2222-2222-222222222222   # majeur, BLOQUÉ par A
C=33333333-3333-3333-3333-333333333333   # MINEUR
D=44444444-4444-4444-4444-444444444444   # majeur, aucun blocage
X=99999999-9999-9999-9999-999999999999   # aucune ligne user_safety (inconnu)
N=55555555-5555-5555-5555-555555555555   # compte NEUF : rien de declare

fatal() {
  printf '❌ %s\n' "$1" >&2
  [ -z "${2:-}" ] || printf '%s\n' "$2" >&2
  exit 1
}

exiger_admin() {
  local libelle="$1"; shift
  local sortie
  if ! sortie="$(ADMIN "$@")"; then fatal "$libelle" "$sortie"; fi
}

exiger_q() {
  local libelle="$1"; shift
  local sortie
  if ! sortie="$(Q "$@")"; then fatal "$libelle" "$sortie"; fi
}

recreer_base() {
  exiger_admin "suppression de la base de test impossible" -c "drop database if exists ts"
  exiger_admin "suppression des roles de test impossible" -c "drop role if exists anon; drop role if exists authenticated"
  exiger_admin "creation de la base de test impossible" -c "create database ts"
  exiger_q "le socle PostgreSQL ne s'applique pas : banc interrompu" -f "$SOCLE"
}

preparer() {
  recreer_base
  exiger_q "la migration T&S ne s'applique pas : banc interrompu" -f "$MIGRATION"
  [ -z "${1:-}" ] || exiger_q "la mutation de test ne s'applique pas : banc interrompu" -c "$1"
  exiger_q "les donnees de securite du banc ne se chargent pas" -c "insert into public.user_safety(user_id,majority_at) values
        ('$A','2010-01-01'),('$B','2011-01-01'),('$C','2030-01-01'),('$D','2012-01-01')
        on conflict (user_id) do update set majority_at=excluded.majority_at;"
  exiger_q "le blocage du banc ne se charge pas" -c "insert into public.blocks(blocker_id,blocked_id) values ('$A','$B') on conflict do nothing"
  # Conversation privee A<->D, socle des sondes d'auto-invitation et d'injection.
  AS "$A" "insert into public.conversations(id,created_by) values ('cvpriv','$A');" >/dev/null
  AS "$A" "insert into public.conv_members values ('cvpriv','$A');" >/dev/null
  AS "$A" "insert into public.conv_members values ('cvpriv','$D');" >/dev/null
}

OK=0; KO=0
verifier() { # $1=libellé  $2=attendu  $3=obtenu
  if [ "$3" = "$2" ]; then OK=$((OK+1)); printf '  ✅ %s\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s — attendu «%s», obtenu «%s»\n' "$1" "$2" "$3"; fi
}
# Rend "refuse" si l'insertion viole la RLS, "accepte" sinon.
# ⚠️ Le cas par défaut ne doit JAMAIS être « accepte » : une erreur de connexion
# ou de syntaxe y tombait, et un banc sans serveur affichait « ✅ accepté ».
# Tout ce qui n'est ni un refus RLS explicite ni un succès franc est une panne.
insere() {
  local sortie; sortie="$(AS "$1" "$2")"
  case "$sortie" in
    *"violates row-level security"*) echo refuse ;;
    *"connection to server"*|*"could not connect"*) echo PANNE-CONNEXION ;;
    *ERROR*|*error:*) echo erreur ;;
    *) echo accepte ;;
  esac
}

conv() { # $1=créateur $2=id  → crée la conv et y met le créateur
  AS "$1" "insert into public.conversations(id,created_by) values ('$2','$1');" >/dev/null
  AS "$1" "insert into public.conv_members values ('$2','$1');" >/dev/null
}

verifier_atomicite() {
  recreer_base
  exiger_q "impossible d'installer la policy inconnue de la sonde atomique" -c     "create policy \"policy_insert_inconnue\" on public.conv_members
       for insert to authenticated with check (true);"

  local sortie verdict
  if sortie="$(Q -f "$MIGRATION")"; then
    verdict=accepte
  else
    case "$sortie" in
      *"policy INSERT conv_members inattendue"*) verdict=refuse ;;
      *) verdict=erreur-inattendue ;;
    esac
  fi

  verifier "policy INSERT inconnue préexistante : migration REFUSÉE" refuse "$verdict"
  verifier "rollback : user_safety n'existe pas après l'échec" ""     "$(Q -c "select to_regclass('public.user_safety');")"
  verifier "rollback : les 2 policies conversations de prod sont intactes" 2     "$(Q -c "select count(*) from pg_catalog.pg_policies
              where schemaname='public' and tablename='conversations' and cmd='INSERT'
                and policyname in ('Ecriture propre','Insert conversations');")"
  verifier "rollback : policy conv_members d'origine + inconnue intactes" 2     "$(Q -c "select count(*) from pg_catalog.pg_policies
              where schemaname='public' and tablename='conv_members' and cmd='INSERT'
                and policyname in ('Ecriture propre','policy_insert_inconnue');")"
}

echo "═══ #136 — banc Trust & Safety serveur ═══"
echo
echo "── ATOMICITÉ : dérive préexistante = échec et rollback complet ──"
verifier_atomicite
preparer
echo
echo "── PRÉMISSES (si l'une échoue, tout le reste est sans valeur) ──"
verifier "deux majeurs sans blocage : interaction AUTORISÉE" t "$(AS "$A" "select public.irl_interaction_allowed('$D');")"
conv "$D" cvp
verifier "ajout d'un tiers non bloqué : ACCEPTÉ"           accepte "$(insere "$D" "insert into public.conv_members values ('cvp','$A');")"
verifier "chacun lit SA ligne user_safety"                 1 "$(AS "$A" "select count(*) from public.user_safety;")"

echo
echo "── A. Âge : fail-closed, et jamais lisible par autrui ──"
verifier "majeur → MINEUR : refusé"                        f "$(AS "$A" "select public.irl_interaction_allowed('$C');")"
verifier "MINEUR → majeur : refusé"                        f "$(AS "$C" "select public.irl_interaction_allowed('$A');")"
verifier "âge INCONNU (aucune ligne) : refusé"             f "$(AS "$A" "select public.irl_interaction_allowed('$X');")"
verifier "soi-même : refusé"                               f "$(AS "$A" "select public.irl_interaction_allowed('$A');")"
verifier "l'âge d'autrui reste illisible"                  0 "$(AS "$A" "select count(*) from public.user_safety where user_id='$C';")"
# Les règles d'ÉCRITURE de l'âge sont éprouvées en section D, à travers le RPC
# qui est désormais leur seul chemin. Ici on ne garde que ce qui relève de la
# section : la table elle-même refuse toute écriture directe, y compris sur la
# ligne d'un tiers.
verifier "écrire directement dans la ligne d'un AUTRE : refusé" refuse \
  "$(case "$(AS "$C" "update public.user_safety set majority_at='2030-01-01' where user_id='$A';")" in
       *"permission denied"*|*"violates row-level security"*) echo refuse;; *) echo accepte;; esac)"
verifier "…et la ligne de l'autre est intacte"             2010-01-01 "$(AS "$A" "select majority_at from public.user_safety where user_id='$A';")"

echo
echo "── B. Blocage : bidirectionnel, sans révéler la direction ni servir d'oracle ──"
verifier "le BLOQUEUR voit le blocage"                     t "$(AS "$A" "select public.is_blocked_with('$B');")"
verifier "le BLOQUÉ aussi (sans lire la ligne)"            t "$(AS "$B" "select public.is_blocked_with('$A');")"
verifier "la table brute reste invisible au bloqué"        0 "$(AS "$B" "select count(*) from public.blocks;")"
verifier "un TIERS ne peut pas sonder la paire A↔B"        f "$(AS "$C" "select public.is_blocked_with('$A');")"
verifier "aucun blocage : faux"                            f "$(AS "$A" "select public.is_blocked_with('$D');")"

echo
echo "── C. Conversation non forçable, dans les DEUX sens ──"
conv "$B" cv1
verifier "le BLOQUÉ ne peut pas ajouter celui qui l'a bloqué" refuse "$(insere "$B" "insert into public.conv_members values ('cv1','$A');")"
conv "$A" cv2
verifier "le BLOQUEUR ne peut pas ajouter celui qu'il a bloqué" refuse "$(insere "$A" "insert into public.conv_members values ('cv2','$B');")"
verifier "un membre légitime passe toujours"               accepte "$(insere "$A" "insert into public.conv_members values ('cv2','$D');")"

echo
echo
echo "── C bis. Une conversation ne peut pas être attribuée à un AUTRE ──"
verifier "PRÉMISSE — créer une conversation pour SOI : accepté" accepte \
  "$(insere "$D" "insert into public.conversations(id,created_by) values ('cvforge_ok','$D');")"
verifier "créer une conversation au nom d'un AUTRE : refusé"    refuse \
  "$(insere "$D" "insert into public.conversations(id,created_by) values ('cvforge_ko','$A');")"
echo
echo "── D. ÂGE DÉCLARÉ : année en entrée, date dérivée côté serveur ──"
verifier "compte neuf : INSERT direct d'une date passée REFUSÉ" refuse \
  "$(case "$(AS "$N" "insert into public.user_safety(user_id,majority_at) values ('$N','2000-01-01');")" in
       *"permission denied"*|*"violates row-level security"*) echo refuse;; *) echo accepte;; esac)"
verifier "UPDATE direct permissif REFUSÉ"                       refuse \
  "$(case "$(AS "$C" "update public.user_safety set majority_at='2000-01-01' where user_id='$C';")" in
       *"permission denied"*|*"violates row-level security"*) echo refuse;; *) echo accepte;; esac)"
verifier "l'ancien RPC acceptant une DATE a disparu"            "" \
  "$(Q -c "select to_regprocedure('public.declare_majority(date)');")"
verifier "appel direct de l'ancien RPC DATE : fonction absente" absent \
  "$(case "$(AS "$N" "select public.declare_majority(date '2000-01-01');")" in
       *"does not exist"*) echo absent;; *) echo presente;; esac)"
verifier "PRÉMISSE — le RPC année accepte la 1re déclaration"   t \
  "$(AS "$N" "select public.declare_birth_year(2005);")"
verifier "la majorité est dérivée au 31/12 des 18 ans"          2023-12-31 \
  "$(AS "$N" "select majority_at from public.user_safety where user_id='$N';")"
verifier "année arbitrairement ancienne : seule la date dérivée est stockée" t \
  "$(AS "$X" "select public.declare_birth_year(1900);")"
verifier "…et cette date est calculée côté serveur"             1918-12-31 \
  "$(AS "$X" "select majority_at from public.user_safety where user_id='$X';")"
verifier "2e déclaration PERMISSIVE (se vieillir) refusée"      f \
  "$(AS "$N" "select public.declare_birth_year(1990);")"
verifier "…et la valeur d'origine est intacte"                  2023-12-31 \
  "$(AS "$N" "select majority_at from public.user_safety where user_id='$N';")"
verifier "déclaration RESTRICTIVE (se rajeunir) acceptée"       t \
  "$(AS "$N" "select public.declare_birth_year(2017);")"
verifier "…et la nouvelle date reste une dérivation serveur"    2035-12-31 \
  "$(AS "$N" "select majority_at from public.user_safety where user_id='$N';")"
verifier "année invraisemblable (1899) refusée"                 f \
  "$(AS "$N" "select public.declare_birth_year(1899);")"
verifier "année future refusée"                                 f \
  "$(AS "$N" "select public.declare_birth_year(2099);")"
verifier "on ne déclare que pour SOI (aucun user_id externe)"   1 \
  "$(AS "$N" "select count(*) from public.user_safety where user_id='$N';")"
echo
echo "── E. AUTO-INVITATION : un tiers ne s'ajoute pas à une conversation A↔B ──"
AS "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values ('m1','cvpriv','$A','secret');" >/dev/null
verifier "PRÉMISSE — un membre lit bien la conversation"        1 "$(AS "$D" "select count(*) from public.conv_messages where conv_id='cvpriv';")"
verifier "le tiers C ne peut PAS s'ajouter"                     refuse "$(insere "$C" "insert into public.conv_members values ('cvpriv','$C');")"
verifier "…et ne lit toujours pas les messages"                 0 "$(AS "$C" "select count(*) from public.conv_messages where conv_id='cvpriv';")"
verifier "…ni la conversation elle-même"                        0 "$(AS "$C" "select count(*) from public.conversations where id='cvpriv';")"

verifier "un NON-MEMBRE ne peut pas INJECTER un message"    refuse \
  "$(insere "$C" "insert into public.conv_messages(id,conv_id,from_id,content) values ('inj','cvpriv','$C','intrus');")"
verifier "…et un MEMBRE écrit toujours (la garde ne déborde pas)" accepte \
  "$(insere "$D" "insert into public.conv_messages(id,conv_id,from_id,content) values ('ok1','cvpriv','$D','bonjour');")"

echo
echo "── F. Le SEUL self-join légitime : rejoindre l'événement où l'on est inscrit ──"
AS "$D" "insert into public.events(id,author_id,title,conv_id) values ('ev1','$D','Sortie','evgrp_ev1');" >/dev/null
AS "$D" "insert into public.conversations(id,created_by,is_group) values ('evgrp_ev1','$D',true);" >/dev/null
AS "$D" "insert into public.conv_members values ('evgrp_ev1','$D');" >/dev/null
AS "$C" "insert into public.event_attendees(event_id,user_id) values ('ev1','$C');" >/dev/null
verifier "un INSCRIT rejoint la conversation de l'événement"    accepte "$(insere "$C" "insert into public.conv_members values ('evgrp_ev1','$C');")"
verifier "un NON-INSCRIT ne la rejoint pas"                     refuse "$(insere "$B" "insert into public.conv_members values ('evgrp_ev1','$B');")"

echo
echo "── G. Un groupe ne peut pas forcer une cible en blocage ──"
AS "$B" "insert into public.conversations(id,created_by,is_group,group_name) values ('grp1','$B',true,'G');" >/dev/null
AS "$B" "insert into public.conv_members values ('grp1','$B');" >/dev/null
verifier "PRÉMISSE — le groupe accepte un membre non bloqué"    accepte "$(insere "$B" "insert into public.conv_members values ('grp1','$D');")"
verifier "le groupe REFUSE la cible en blocage bidirectionnel"  refuse "$(insere "$B" "insert into public.conv_members values ('grp1','$A');")"

echo
echo "── H. PRIVILÈGES : SECURITY DEFINER et policies au minimum explicite ──"
verifier "anon/PUBLIC n'exécute aucune fonction privilégiée du lot" 0 \
  "$(Q -c "select count(*)
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public'
             and p.prosecdef
             and p.proname in ('declare_birth_year','is_blocked_with',
                               'irl_interaction_allowed','is_conversation_creator',
                               'can_join_event_conversation')
             and has_function_privilege('anon',p.oid,'EXECUTE');")"
verifier "authenticated exécute les 5 fonctions privilégiées du lot" 5 \
  "$(Q -c "select count(*)
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public'
             and p.prosecdef
             and p.proname in ('declare_birth_year','is_blocked_with',
                               'irl_interaction_allowed','is_conversation_creator',
                               'can_join_event_conversation')
             and has_function_privilege('authenticated',p.oid,'EXECUTE');")"
verifier "les 4 nouvelles policies ciblent seulement authenticated" 4 \
  "$(Q -c "select count(*) from pg_catalog.pg_policies
            where schemaname='public' and roles::text='{authenticated}'
              and (tablename,policyname) in (
                ('user_safety','user_safety_select_own'),
                ('conversations','conversations_insert_creator'),
                ('conv_members','Ecriture propre'),
                ('conv_messages','conv_messages_insert_member')
              );")"

echo
echo "── MUTATIONS : chaque garde retirée doit rendre son test ROUGE ──"
#
# ⚠️ PAS D'`eval` ICI. La première version passait la commande sous forme de
# chaîne, et ses guillemets doubles arrivaient tels quels dans le SQL — où ils
# désignent des IDENTIFIANTS, pas des chaînes. Les quatre mutations rendaient
# « column "1111…" does not exist » et étaient comptées comme survivantes.
# Chaque sonde est donc une vraie fonction, avec un vrai quotage.
sonde_conv_forcee()  { conv "$B" cvm >/dev/null; insere "$B" "insert into public.conv_members values ('cvm','$A');"; }
sonde_blocage_sens() { AS "$B" "select public.is_blocked_with('$A');"; }
sonde_age_inconnu()  { AS "$A" "select public.irl_interaction_allowed('$X');"; }
# ⚠️ PASSE PAR LE RPC, pas par un UPDATE direct. Depuis que `authenticated` n'a
# plus le droit d'écrire sur `user_safety`, un UPDATE direct est refusé par les
# GRANTs quoi qu'il arrive : la sonde restait verte même sans trigger ni règle,
# et ne prouvait donc plus rien sur la garde qu'elle prétend éprouver.
sonde_vieillissement() {
  AS "$C" "select public.declare_birth_year(1990);" >/dev/null
  AS "$C" "select majority_at from public.user_safety where user_id='$C';"
}

sonde_forge_age() {
  case "$(AS "$N" "insert into public.user_safety(user_id,majority_at) values ('$N','2000-01-01');")" in
    *"permission denied"*|*"violates row-level security"*) echo refuse ;;
    *ERROR*|*error:*) echo erreur ;;
    *) echo accepte ;;
  esac
}
sonde_auto_invitation() {
  conv "$A" cvx >/dev/null
  insere "$C" "insert into public.conv_members values ('cvx','$C');"
}

sonde_forge_conversation() {
  insere "$D" "insert into public.conversations(id,created_by) values ('cvf','$A');"
}

sonde_injection_message() {
  insere "$C" "insert into public.conv_messages(id,conv_id,from_id,content) values ('inj2','cvpriv','$C','intrus');"
}
sonde_exec_anon() {
  Q -c "select has_function_privilege('anon','public.is_blocked_with(text)','EXECUTE');"
}

mutation() { # $1=libellé  $2=SQL de mutation  $3=fonction sonde  $4=valeur qui SIGNALE le défaut
  preparer "$2"
  local obtenu; obtenu="$("$3")"
  if [ "$obtenu" = "$4" ]; then OK=$((OK+1)); printf '  ✅ %s → défaut détecté\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s → LA MUTATION SURVIT (obtenu «%s») : le test ne garde rien\n' "$1" "$obtenu"; fi
}

mutation "policy conv_members d'origine restaurée" \
  "drop policy \"Ecriture propre\" on public.conv_members;
   create policy \"Ecriture propre\" on public.conv_members for insert with check (
     (user_id = (auth.uid())::text)
     or (exists (select 1 from public.conversations c
                 where c.id = conv_members.conv_id and c.created_by = (auth.uid())::text)));" \
  sonde_conv_forcee accepte

mutation "is_blocked_with rendue UNIDIRECTIONNELLE" \
  "create or replace function public.is_blocked_with(_other text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select exists (select 1 from public.blocks b
       where b.blocker_id = (auth.uid())::text and b.blocked_id = _other) \$f\$;" \
  sonde_blocage_sens f

mutation "COALESCE fail-closed retiré de l'âge" \
  "create or replace function public.irl_interaction_allowed(_other text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select not public.is_blocked_with(_other) \$f\$;" \
  sonde_age_inconnu t

# ⚠️ La sonde passe par le RPC, PAS par un UPDATE direct : depuis que
# `authenticated` n'a plus le droit d'écrire sur la table, un UPDATE direct est
# refusé quoi qu'il arrive — retirer le trigger ne changeait donc plus rien et
# la mutation « survivait » sans qu'aucun trou n'existe.
#
# Les deux gardes de non-vieillissement sont indépendantes : la règle du RPC, et
# le trigger sous elle. Une seule mutation ne prouve rien tant que l'autre tient,
# donc on retire les DEUX ; l'assertion de défense en profondeur juste après
# vérifie que le trigger seul suffirait.
mutation "les DEUX gardes de non-vieillissement retirées" \
  "drop trigger if exists trg_user_safety_majorite on public.user_safety;
   create or replace function public.declare_birth_year(_birth_year integer)
   returns boolean language plpgsql security definer set search_path = '' as \$f\$
   begin
     insert into public.user_safety(user_id, majority_at)
       values ((auth.uid())::text, make_date(_birth_year + 18, 12, 31))
       on conflict (user_id) do update set majority_at = excluded.majority_at;
     return true;
   end \$f\$;" \
  sonde_vieillissement 2008-12-31

# DÉFENSE EN PROFONDEUR : le RPC neutralisé mais le trigger EN PLACE — la
# tentative de se vieillir doit encore échouer. C'est ce qui distingue deux
# gardes réelles d'une garde unique écrite deux fois.
preparer "create or replace function public.declare_birth_year(_birth_year integer)
   returns boolean language plpgsql security definer set search_path = '' as \$f\$
   begin
     insert into public.user_safety(user_id, majority_at)
       values ((auth.uid())::text, make_date(_birth_year + 18, 12, 31))
       on conflict (user_id) do update set majority_at = excluded.majority_at;
     return true;
   end \$f\$;"
verifier "RPC neutralisé, trigger seul : se vieillir échoue encore" 2030-01-01 "$(sonde_vieillissement)"


mutation "INSERT/UPDATE direct rendu libre sur user_safety" \
  "grant insert, update on public.user_safety to authenticated;
   drop policy if exists \"user_safety_insert_own\" on public.user_safety;
   create policy \"user_safety_insert_own\" on public.user_safety
     for insert with check (user_id = ((select auth.uid()))::text);" \
  sonde_forge_age accepte

mutation "self-join arbitraire retabli sur conv_members" \
  "drop policy \"Ecriture propre\" on public.conv_members;
   create policy \"Ecriture propre\" on public.conv_members for insert with check (
     ((user_id = (auth.uid())::text)
      or (exists (select 1 from public.conversations c
                  where c.id = conv_members.conv_id and c.created_by = (auth.uid())::text)))
     and not public.is_blocked_with(user_id));" \
  sonde_auto_invitation accepte
mutation "une seule des deux policies INSERT permissives laissee" \
  "create policy \"Insert conversations\" on public.conversations for insert with check (true);" \
  sonde_forge_conversation accepte

mutation "policy conv_messages d'origine (sans appartenance) restauree" \
  "drop policy if exists \"conv_messages_insert_member\" on public.conv_messages;
   create policy \"Ecriture propre\" on public.conv_messages
     for insert with check (from_id = (auth.uid())::text);" \
  sonde_injection_message accepte

mutation "EXECUTE PUBLIC rétabli sur une fonction privilégiée" \
  "grant execute on function public.is_blocked_with(text) to PUBLIC;" \
  sonde_exec_anon t

echo
echo "═══ $OK OK · $KO KO ═══"
[ "$KO" -eq 0 ] || exit 1
