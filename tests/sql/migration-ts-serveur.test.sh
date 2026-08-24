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
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_ts_serveur_age_blocage.sql"
SOCLE="$RACINE/tests/sql/socle-prod.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)"
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

Q() { psql -h "$BASE" -p "$PORT" -U postgres -d ts -tA -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
# Exécute en tant que compte authentifié $1.
AS() { psql -h "$BASE" -p "$PORT" -U postgres -d ts -tA -q \
       -v ON_ERROR_STOP=1 \
       -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d ts -tA -q \
         -v ON_ERROR_STOP=1 -c "set local role anon; $1" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # majeur
B=22222222-2222-2222-2222-222222222222   # majeur, BLOQUÉ par A
C=33333333-3333-3333-3333-333333333333   # MINEUR
D=44444444-4444-4444-4444-444444444444   # majeur, aucun blocage
X=99999999-9999-9999-9999-999999999999   # aucune ligne user_safety (inconnu)
N=55555555-5555-5555-5555-555555555555   # compte NEUF : rien de declare
E=66666666-6666-6666-6666-666666666666   # majeur, participant `maybe`
F=77777777-7777-7777-7777-777777777777   # majeur, scenarios adversariaux evenement
Y=88888888-8888-8888-8888-888888888888   # compte neuf, derivee d'annee ancienne

recreer_base() {
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 \
    -c "drop database if exists ts" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 \
    -c "drop role if exists anon; drop role if exists authenticated" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 \
    -c "create database ts" >/dev/null
  Q -f "$SOCLE" >/dev/null
}

appliquer_migration() {
  Q -f "$MIGRATION" >/dev/null
}

semer() {
  Q -c "insert into public.user_safety(user_id,majority_at) values
        ('$A','2010-01-01'),('$B','2011-01-01'),('$C','2030-01-01'),('$D','2012-01-01'),
        ('$E','2013-01-01'),('$F','2014-01-01')
        on conflict (user_id) do update set majority_at=excluded.majority_at;" >/dev/null
  Q -c "insert into public.blocks(blocker_id,blocked_id) values ('$A','$B') on conflict do nothing;" >/dev/null
  # Conversation privee A<->D, socle des sondes d'auto-invitation et d'injection.
  AS "$A" "insert into public.conversations(id,created_by) values ('cvpriv','$A');" >/dev/null
  AS "$A" "insert into public.conv_members values ('cvpriv','$A');" >/dev/null
  AS "$A" "insert into public.conv_members values ('cvpriv','$D');" >/dev/null
}

preparer() {
  recreer_base
  appliquer_migration
  if [ -n "${1:-}" ]; then
    Q -c "$1" >/dev/null
  fi
  semer
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
  local sortie; sortie="$(AS "$1" "$2" || true)"
  case "$sortie" in
    *"violates row-level security"*|*"permission denied"*) echo refuse ;;
    *"connection to server"*|*"could not connect"*) echo PANNE-CONNEXION ;;
    *ERROR*|*error:*) echo erreur ;;
    *) echo accepte ;;
  esac
}

rpc_absent() {
  local sortie; sortie="$(AS "$1" "$2" || true)"
  case "$sortie" in
    *"function public.declare_majority"*"does not exist"*) echo absent ;;
    *ERROR*|*error:*) echo erreur ;;
    *) echo presente ;;
  esac
}

conv() { # $1=créateur $2=id  → crée la conv et y met le créateur
  AS "$1" "insert into public.conversations(id,created_by) values ('$2','$1');" >/dev/null
  AS "$1" "insert into public.conv_members values ('$2','$1');" >/dev/null
}

echo "═══ #136 — banc Trust & Safety serveur ═══"

echo
echo "── ATOMICITÉ : une dérive tardive annule TOUTE la migration ──"
recreer_base
# La dérive est volontairement sur la DERNIÈRE table traitée. La migration a
# déjà remplacé les policies conversations/conv_members quand le garde la voit :
# sans BEGIN/rollback, ces changements resteraient partiellement appliqués.
Q -c "create policy \"derive_inconnue\" on public.conv_messages
        for insert to authenticated with check (true);" >/dev/null
if Q -f "$MIGRATION" >/dev/null 2>&1; then
  migration_derive=acceptee
else
  migration_derive=refusee
fi
verifier "policy inconnue préexistante : migration REFUSÉE" refusee "$migration_derive"
verifier "rollback : user_safety n'existe pas" t \
  "$(Q -c "select to_regclass('public.user_safety') is null;")"
verifier "rollback : les 2 policies conversations d'origine restent" 2 \
  "$(Q -c "select count(*) from pg_policies where schemaname='public' and tablename='conversations' and cmd='INSERT' and policyname in ('Ecriture propre','Insert conversations');")"
verifier "rollback : la policy restrictive conversations n'a pas fui" 0 \
  "$(Q -c "select count(*) from pg_policies where schemaname='public' and tablename='conversations' and policyname='conversations_insert_creator';")"
verifier "rollback : la policy conv_members d'origine reste" 1 \
  "$(Q -c "select count(*) from pg_policies where schemaname='public' and tablename='conv_members' and policyname='Ecriture propre';")"
verifier "rollback : message d'origine + dérive restent intacts" 2 \
  "$(Q -c "select count(*) from pg_policies where schemaname='public' and tablename='conv_messages' and policyname in ('Ecriture propre','derive_inconnue');")"

preparer
echo
echo "── PRÉMISSES (si l'une échoue, tout le reste est sans valeur) ──"
verifier "deux majeurs sans blocage : interaction AUTORISÉE" t "$(AS "$A" "select public.irl_interaction_allowed('$D');")"
conv "$D" cvp
verifier "ajout d'un tiers non bloqué : ACCEPTÉ"           accepte "$(insere "$D" "insert into public.conv_members values ('cvp','$A');")"
verifier "chacun lit SA ligne user_safety"                 1 "$(AS "$A" "select count(*) from public.user_safety;")"
appliquer_migration
verifier "migration relancée : idempotente, données conservées" 6 \
  "$(Q -c "select count(*) from public.user_safety;")"

echo
echo "── A. Âge : fail-closed, et jamais lisible par autrui ──"
verifier "majeur → MINEUR : refusé"                        f "$(AS "$A" "select public.irl_interaction_allowed('$C');")"
verifier "MINEUR → majeur : refusé"                        f "$(AS "$C" "select public.irl_interaction_allowed('$A');")"
verifier "âge INCONNU (aucune ligne) : refusé"             f "$(AS "$A" "select public.irl_interaction_allowed('$X');")"
verifier "soi-même : refusé"                               f "$(AS "$A" "select public.irl_interaction_allowed('$A');")"
verifier "l'âge d'autrui reste illisible"                  0 "$(AS "$A" "select count(*) from public.user_safety where user_id='$C';")"
verifier "anon ne lit aucune donnée d'âge"                 refuse \
  "$(case "$(ANON "select count(*) from public.user_safety;" || true)" in
       *"permission denied"*|*"violates row-level security"*) echo refuse;; *) echo accepte;; esac)"
verifier "la policy d'âge cible explicitement authenticated" t \
  "$(Q -c "select roles = '{authenticated}'::name[] from pg_policies where schemaname='public' and tablename='user_safety' and policyname='user_safety_select_own';")"
# Les règles d'ÉCRITURE de l'âge sont éprouvées en section D, à travers le RPC
# qui est désormais leur seul chemin. Ici on ne garde que ce qui relève de la
# section : la table elle-même refuse toute écriture directe, y compris sur la
# ligne d'un tiers.
verifier "écrire directement dans la ligne d'un AUTRE : refusé" refuse \
  "$(insere "$C" "update public.user_safety set majority_at='2030-01-01' where user_id='$A';")"
verifier "…et la ligne de l'autre est intacte"             2010-01-01 "$(AS "$A" "select majority_at from public.user_safety where user_id='$A';")"

echo
echo "── B. Blocage : bidirectionnel, sans révéler la direction ni servir d'oracle ──"
verifier "le BLOQUEUR voit le blocage"                     t "$(AS "$A" "select public.is_blocked_with('$B');")"
verifier "le BLOQUÉ aussi (sans lire la ligne)"            t "$(AS "$B" "select public.is_blocked_with('$A');")"
verifier "la table brute reste invisible au bloqué"        0 "$(AS "$B" "select count(*) from public.blocks;")"
verifier "un TIERS ne peut pas sonder la paire A↔B"        f "$(AS "$C" "select public.is_blocked_with('$A');")"
verifier "aucun blocage : faux"                            f "$(AS "$A" "select public.is_blocked_with('$D');")"
verifier "anon n'exécute aucune primitive SECURITY DEFINER du lot" t \
  "$(Q -c "select not has_function_privilege('anon','public.is_blocked_with(text)','execute')
                  and not has_function_privilege('anon','public.irl_interaction_allowed(text)','execute')
                  and not has_function_privilege('anon','public.declare_birth_year(integer)','execute')
                  and has_function_privilege('authenticated','public.is_blocked_with(text)','execute');")"

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
echo "── D. ÉCRITURE DE L'ÂGE : le RPC est le SEUL chemin ──"
# Contre-revue du 2026-08-23 : le trigger n'empêchait que de RECULER majority_at
# sur un UPDATE. Un compte NEUF, sans ligne, faisait `INSERT ... '2000-01-01'`
# et se déclarait majeur dans la seconde. `authenticated` n'a donc plus aucun
# droit d'écriture directe. Le RPC ne reçoit désormais qu'une ANNÉE et calcule
# lui-même le 31 décembre de l'année des 18 ans.
verifier "compte neuf : INSERT direct d'une date passée REFUSÉ" refuse \
  "$(insere "$N" "insert into public.user_safety(user_id,majority_at) values ('$N','2000-01-01');")"
verifier "UPDATE direct permissif REFUSÉ"                       refuse \
  "$(insere "$C" "update public.user_safety set majority_at='2000-01-01' where user_id='$C';")"
verifier "l'ancien RPC acceptant une DATE n'existe plus"        absent \
  "$(rpc_absent "$N" "select public.declare_majority(date '2000-01-01');")"
verifier "PRÉMISSE — le RPC accepte la 1re ANNÉE déclarée"      t \
  "$(AS "$N" "select public.declare_birth_year(2005);")"
verifier "la date est dérivée côté serveur au 31 décembre"      2023-12-31 \
  "$(AS "$N" "select majority_at from public.user_safety where user_id='$N';")"
verifier "année ancienne valide : le client ne choisit toujours pas la date" t \
  "$(AS "$Y" "select public.declare_birth_year(1900);")"
verifier "…la dérivée prudente est exacte"                      1918-12-31 \
  "$(AS "$Y" "select majority_at from public.user_safety where user_id='$Y';")"
verifier "2e déclaration PERMISSIVE (se vieillir) refusée"      f \
  "$(AS "$N" "select public.declare_birth_year(1990);")"
verifier "…et la valeur d'origine est intacte"                  2023-12-31 \
  "$(AS "$N" "select majority_at from public.user_safety where user_id='$N';")"
verifier "déclaration RESTRICTIVE (année plus récente) acceptée" t \
  "$(AS "$N" "select public.declare_birth_year(2015);")"
verifier "…et la nouvelle dérivée reste prudente"               2033-12-31 \
  "$(AS "$N" "select majority_at from public.user_safety where user_id='$N';")"
verifier "année invraisemblable (1800) refusée"                 f \
  "$(AS "$N" "select public.declare_birth_year(1800);")"
verifier "année future refusée"                                 f \
  "$(AS "$N" "select public.declare_birth_year(2999);")"
verifier "on ne déclare que pour SOI (le RPC ignore tout id externe)" 1 \
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
echo "── F. Self-join événement : preuves serveur complètes ──"
AS "$D" "insert into public.events(id,author_id,title,conv_id) values ('ev1','$D','Sortie','evgrp_ev1');" >/dev/null
AS "$D" "insert into public.conversations(id,created_by,is_group) values ('evgrp_ev1','$D',true);" >/dev/null
AS "$D" "insert into public.conv_members values ('evgrp_ev1','$D');" >/dev/null
AS "$A" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$A','going');" >/dev/null
AS "$E" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$E','maybe');" >/dev/null
AS "$X" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$X','declined');" >/dev/null
AS "$N" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$N','waitlist');" >/dev/null
verifier "un inscrit RSVP going rejoint la conversation"        accepte \
  "$(insere "$A" "insert into public.conv_members values ('evgrp_ev1','$A');")"
verifier "un inscrit RSVP maybe rejoint aussi (contrat client)" accepte \
  "$(insere "$E" "insert into public.conv_members values ('evgrp_ev1','$E');")"
verifier "un RSVP declined ne rejoint pas"                      refuse \
  "$(insere "$X" "insert into public.conv_members values ('evgrp_ev1','$X');")"
verifier "un RSVP waitlist ne rejoint pas"                      refuse \
  "$(insere "$N" "insert into public.conv_members values ('evgrp_ev1','$N');")"
verifier "un NON-INSCRIT ne la rejoint pas"                     refuse "$(insere "$B" "insert into public.conv_members values ('evgrp_ev1','$B');")"

# B est bloqué par l'organisateur A dans le socle de test.
AS "$A" "insert into public.events(id,author_id,title,conv_id) values ('evblock','$A','Bloquee','evgrp_evblock');" >/dev/null
AS "$A" "insert into public.conversations(id,created_by,is_group) values ('evgrp_evblock','$A',true);" >/dev/null
AS "$A" "insert into public.conv_members values ('evgrp_evblock','$A');" >/dev/null
AS "$B" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evblock','$B','going');" >/dev/null
verifier "participant bloqué par l'organisateur : refusé"        refuse \
  "$(insere "$B" "insert into public.conv_members values ('evgrp_evblock','$B');")"

AS "$D" "insert into public.events(id,author_id,title,conv_id,status) values ('evcancel','$D','Annule','evgrp_evcancel','cancelled');" >/dev/null
AS "$D" "insert into public.conversations(id,created_by,is_group) values ('evgrp_evcancel','$D',true);" >/dev/null
AS "$D" "insert into public.conv_members values ('evgrp_evcancel','$D');" >/dev/null
AS "$F" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evcancel','$F','going');" >/dev/null
verifier "événement annulé : self-join refusé"                  refuse \
  "$(insere "$F" "insert into public.conv_members values ('evgrp_evcancel','$F');")"

# Attaque 1 : faux événement CANONIQUE pointant vers une conversation créée par A.
AS "$A" "insert into public.conversations(id,created_by,is_group) values ('evgrp_faux','$A',true);" >/dev/null
AS "$A" "insert into public.conv_members values ('evgrp_faux','$A');" >/dev/null
AS "$F" "insert into public.events(id,author_id,title,conv_id) values ('faux','$F','Faux','evgrp_faux');" >/dev/null
AS "$F" "insert into public.event_attendees(event_id,user_id,rsvp) values ('faux','$F','going');" >/dev/null
verifier "faux événement : créateur de conversation incohérent" refuse \
  "$(insere "$F" "insert into public.conv_members values ('evgrp_faux','$F');")"

# Attaque 2 : l'organisateur pointe son événement vers une conversation privée
# qu'il a lui-même créée, mais dont l'id n'est pas l'id canonique de l'événement.
AS "$D" "insert into public.conversations(id,created_by,is_group) values ('cible_privee','$D',true);" >/dev/null
AS "$D" "insert into public.conv_members values ('cible_privee','$D');" >/dev/null
AS "$D" "insert into public.events(id,author_id,title,conv_id) values ('evmod','$D','Modifie','cible_privee');" >/dev/null
AS "$F" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evmod','$F','going');" >/dev/null
verifier "conv_id modifié vers une conversation non canonique"  refuse \
  "$(insere "$F" "insert into public.conv_members values ('cible_privee','$F');")"

echo
echo "── G. Un groupe ne peut pas forcer une cible en blocage ──"
AS "$B" "insert into public.conversations(id,created_by,is_group,group_name) values ('grp1','$B',true,'G');" >/dev/null
AS "$B" "insert into public.conv_members values ('grp1','$B');" >/dev/null
verifier "PRÉMISSE — le groupe accepte un membre non bloqué"    accepte "$(insere "$B" "insert into public.conv_members values ('grp1','$D');")"
verifier "le groupe REFUSE la cible en blocage bidirectionnel"  refuse "$(insere "$B" "insert into public.conv_members values ('grp1','$A');")"

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
# Passe par le RPC, pas par un UPDATE direct. Un UPDATE client est refusé par les
# GRANTs quoi qu'il arrive et ne prouverait donc rien sur la règle du RPC.
sonde_vieillissement() {
  AS "$C" "select public.declare_birth_year(1990);" >/dev/null 2>&1 || true
  AS "$C" "select majority_at from public.user_safety where user_id='$C';"
}

sonde_forge_age() {
  insere "$N" "insert into public.user_safety(user_id,majority_at) values ('$N','2000-01-01');"
}
sonde_rpc_date() {
  local sortie; sortie="$(AS "$N" "select public.declare_majority(date '2000-01-01');" || true)"
  case "$sortie" in *"does not exist"*) echo absent;; *ERROR*|*error:*) echo erreur;; *) echo accepte;; esac
}
sonde_derivee_prudente() {
  AS "$N" "select public.declare_birth_year(2005);" >/dev/null
  AS "$N" "select majority_at from public.user_safety where user_id='$N';"
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

sonde_event_bloque() {
  AS "$A" "insert into public.events(id,author_id,title,conv_id) values ('evb','$A','B','evgrp_evb');" >/dev/null
  AS "$A" "insert into public.conversations(id,created_by,is_group) values ('evgrp_evb','$A',true);" >/dev/null
  AS "$A" "insert into public.conv_members values ('evgrp_evb','$A');" >/dev/null
  AS "$B" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evb','$B','going');" >/dev/null
  insere "$B" "insert into public.conv_members values ('evgrp_evb','$B');"
}

sonde_event_rsvp_interdit() {
  AS "$D" "insert into public.events(id,author_id,title,conv_id) values ('evr','$D','R','evgrp_evr');" >/dev/null
  AS "$D" "insert into public.conversations(id,created_by,is_group) values ('evgrp_evr','$D',true);" >/dev/null
  AS "$D" "insert into public.conv_members values ('evgrp_evr','$D');" >/dev/null
  AS "$X" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evr','$X','declined');" >/dev/null
  AS "$N" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evr','$N','waitlist');" >/dev/null
  printf '%s/%s\n' \
    "$(insere "$X" "insert into public.conv_members values ('evgrp_evr','$X');")" \
    "$(insere "$N" "insert into public.conv_members values ('evgrp_evr','$N');")"
}

sonde_event_noncanonique() {
  AS "$D" "insert into public.conversations(id,created_by,is_group) values ('cible_evt','$D',true);" >/dev/null
  AS "$D" "insert into public.conv_members values ('cible_evt','$D');" >/dev/null
  AS "$D" "insert into public.events(id,author_id,title,conv_id) values ('evnc','$D','NC','cible_evt');" >/dev/null
  AS "$F" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evnc','$F','going');" >/dev/null
  insere "$F" "insert into public.conv_members values ('cible_evt','$F');"
}

sonde_event_createur_incoherent() {
  AS "$A" "insert into public.conversations(id,created_by,is_group) values ('evgrp_evci','$A',true);" >/dev/null
  AS "$A" "insert into public.conv_members values ('evgrp_evci','$A');" >/dev/null
  AS "$F" "insert into public.events(id,author_id,title,conv_id) values ('evci','$F','CI','evgrp_evci');" >/dev/null
  AS "$F" "insert into public.event_attendees(event_id,user_id,rsvp) values ('evci','$F','going');" >/dev/null
  insere "$F" "insert into public.conv_members values ('evgrp_evci','$F');"
}

sonde_event_annule() {
  AS "$D" "insert into public.events(id,author_id,title,conv_id,status) values ('eva','$D','A','evgrp_eva','cancelled');" >/dev/null
  AS "$D" "insert into public.conversations(id,created_by,is_group) values ('evgrp_eva','$D',true);" >/dev/null
  AS "$D" "insert into public.conv_members values ('evgrp_eva','$D');" >/dev/null
  AS "$F" "insert into public.event_attendees(event_id,user_id,rsvp) values ('eva','$F','going');" >/dev/null
  insere "$F" "insert into public.conv_members values ('evgrp_eva','$F');"
}

sonde_anon_execute() {
  local sortie; sortie="$(ANON "select public.is_blocked_with('$A');" || true)"
  case "$sortie" in *"permission denied"*) echo interdit;; *ERROR*|*error:*) echo erreur;; *) echo execute;; esac
}

mutation() { # $1=libellé  $2=SQL de mutation  $3=fonction sonde  $4=valeur qui SIGNALE le défaut
  preparer "$2"
  local obtenu; obtenu="$("$3")"
  if [ "$obtenu" = "$4" ]; then OK=$((OK+1)); printf '  ✅ %s → défaut détecté\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s → LA MUTATION SURVIT (obtenu «%s») : le test ne garde rien\n' "$1" "$obtenu"; fi
}

# ── Les contrôles d'exploitation valent-ils quelque chose ? ────────────────
# `migrations/controles_post_ts_serveur_age_blocage.sql` est ce que Benjamin
# joue sur la VRAIE base après application. Un contrôle qui sort vert sur une
# base cassée est pire que pas de contrôle : il transforme une frontière absente
# en frontière prouvée. On le fait donc tourner ici sur une base fraîchement
# migrée (0 ÉCHEC attendu), puis on le confronte à une régression réelle.
echo
echo "── Contrôles d'exploitation (migrations/controles_post_*.sql) ──"
CONTROLES="$RACINE/migrations/controles_post_ts_serveur_age_blocage.sql"
echecs_controles() { Q -t -A -f "$CONTROLES" 2>/dev/null | grep -c '|ECHEC|' || true; }

preparer ""
verifier "base correctement migrée : aucun ÉCHEC" 0 "$(echecs_controles)"

# La régression la plus coûteuse du lot : une seconde policy INSERT permissive
# sur `conversations`. Les policies permissives se combinent en OU — en laisser
# une annule le verrou en silence. Si le contrôle ne la voit pas, il ne sert à rien.
preparer "create policy \"Insert conversations\" on public.conversations for insert with check (true);"
[ "$(echecs_controles)" -ge 1 ] \
  && { OK=$((OK+1)); printf '  ✅ policy permissive rétablie → contrôle ROUGE\n'; } \
  || { KO=$((KO+1)); printf '  ❌ policy permissive rétablie → contrôle resté VERT : il ne garde rien\n'; }

# Une policy filtre l'accès, elle ne l'accorde pas : le GRANT est l'autre moitié
# de la frontière, et c'est celle qu'on oublie.
preparer "grant insert on public.user_safety to authenticated;"
[ "$(echecs_controles)" -ge 1 ] \
  && { OK=$((OK+1)); printf '  ✅ écriture directe rendue à authenticated → contrôle ROUGE\n'; } \
  || { KO=$((KO+1)); printf '  ❌ écriture directe rendue à authenticated → contrôle resté VERT\n'; }

echo
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

mutation "ancienne interface RPC acceptant une DATE rétablie" \
  "create or replace function public.declare_majority(_majority_at date)
   returns boolean language plpgsql security definer set search_path = '' as \$f\$
   begin
     insert into public.user_safety(user_id,majority_at)
       values ((auth.uid())::text,_majority_at)
       on conflict (user_id) do update set majority_at=excluded.majority_at;
     return true;
   end \$f\$;
   grant execute on function public.declare_majority(date) to authenticated;" \
  sonde_rpc_date accepte

mutation "dérivation prudente du 31 décembre remplacée par le 1er janvier" \
  "create or replace function public.declare_birth_year(_birth_year integer)
   returns boolean language plpgsql security definer set search_path = '' as \$f\$
   begin
     insert into public.user_safety(user_id,majority_at)
       values ((auth.uid())::text,make_date(_birth_year+18,1,1))
       on conflict (user_id) do update set majority_at=excluded.majority_at;
     return true;
   end \$f\$;" \
  sonde_derivee_prudente 2023-01-01

# Les deux gardes de non-vieillissement sont indépendantes : la règle du RPC et
# le trigger sous elle. Une seule mutation ne prouve rien tant que l'autre tient.
mutation "les DEUX gardes de non-vieillissement retirées" \
  "drop trigger if exists trg_user_safety_majorite on public.user_safety;
   create or replace function public.declare_birth_year(_birth_year integer)
   returns boolean language plpgsql security definer set search_path = '' as \$f\$
   begin
     insert into public.user_safety(user_id, majority_at)
       values ((auth.uid())::text, make_date(_birth_year+18,12,31))
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
       values ((auth.uid())::text, make_date(_birth_year+18,12,31))
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

mutation "garde blocage organisateur retirée du self-join événement" \
  "create or replace function public.can_join_event_conversation(_conv_id text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select exists (
       select 1 from public.events e
       join public.event_attendees a on a.event_id=e.id and a.user_id=(auth.uid())::text
       join public.conversations c on c.id=e.conv_id
       where e.conv_id=_conv_id
         and e.conv_id=('evgrp_'||e.id)
         and c.created_by=e.author_id
         and e.status='active'
         and a.rsvp in ('going','maybe'))
   \$f\$;" \
  sonde_event_bloque accepte

mutation "borne RSVP going/maybe retirée" \
  "create or replace function public.can_join_event_conversation(_conv_id text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select exists (
       select 1 from public.events e
       join public.event_attendees a on a.event_id=e.id and a.user_id=(auth.uid())::text
       join public.conversations c on c.id=e.conv_id
       where e.conv_id=_conv_id
         and e.conv_id=('evgrp_'||e.id)
         and c.created_by=e.author_id
         and e.status='active'
         and not public.is_blocked_with(e.author_id))
   \$f\$;" \
  sonde_event_rsvp_interdit accepte/accepte

mutation "identifiant canonique événement retiré" \
  "create or replace function public.can_join_event_conversation(_conv_id text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select exists (
       select 1 from public.events e
       join public.event_attendees a on a.event_id=e.id and a.user_id=(auth.uid())::text
       join public.conversations c on c.id=e.conv_id
       where e.conv_id=_conv_id
         and c.created_by=e.author_id
         and e.status='active'
         and a.rsvp in ('going','maybe')
         and not public.is_blocked_with(e.author_id))
   \$f\$;" \
  sonde_event_noncanonique accepte

mutation "cohérence créateur événement/conversation retirée" \
  "create or replace function public.can_join_event_conversation(_conv_id text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select exists (
       select 1 from public.events e
       join public.event_attendees a on a.event_id=e.id and a.user_id=(auth.uid())::text
       join public.conversations c on c.id=e.conv_id
       where e.conv_id=_conv_id
         and e.conv_id=('evgrp_'||e.id)
         and e.status='active'
         and a.rsvp in ('going','maybe')
         and not public.is_blocked_with(e.author_id))
   \$f\$;" \
  sonde_event_createur_incoherent accepte

mutation "état actif de l'événement non vérifié" \
  "create or replace function public.can_join_event_conversation(_conv_id text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select exists (
       select 1 from public.events e
       join public.event_attendees a on a.event_id=e.id and a.user_id=(auth.uid())::text
       join public.conversations c on c.id=e.conv_id
       where e.conv_id=_conv_id
         and e.conv_id=('evgrp_'||e.id)
         and c.created_by=e.author_id
         and a.rsvp in ('going','maybe')
         and not public.is_blocked_with(e.author_id))
   \$f\$;" \
  sonde_event_annule accepte

mutation "EXECUTE SECURITY DEFINER rendu à anon" \
  "grant execute on function public.is_blocked_with(text) to anon;" \
  sonde_anon_execute execute

echo
echo "═══ $OK OK · $KO KO ═══"
[ "$KO" -eq 0 ] || exit 1
