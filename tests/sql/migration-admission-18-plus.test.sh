#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC « ADMISSION 18+ » — fondation serveur de l'accès aux rencontres.
#
# Monte un PostgreSQL JETABLE, y reconstitue la partie de la prod PASSIO que
# la migration touche (socle #136 + addendum), applique #136 PUIS la migration
# d'admission, et joue les scénarios EN TANT QUE comptes distincts via
# `set local role authenticated` + le claim JWT.
#
# Ce que le banc prouve, dans cet ordre :
#   ① ATOMICITÉ   : une policy inconnue sur les surfaces IRL refuse TOUT ;
#   ② ÉTEINT      : interrupteur à l'état d'application = comportement d'avant,
#                   pour tout le monde (c'est ce qui rend la migration
#                   applicable sans casser les comptes non déclarés) ;
#   ③ IDEMPOTENCE : rejouée, elle ne rétrograde jamais un interrupteur allumé ;
#   ④ ALLUMÉ      : majeur admis, mineur / inconnu / neuf refusés, la porte
#                   s'ouvre par `declare_birth_year`, le RETRAIT reste permis,
#                   la conversation d'événement suit, le statut dit la porte ;
#   ⑤ FAIL-CLOSED : ligne d'interrupteur supprimée = admission EXIGÉE ;
#   ⑥ MUTATIONS   : chaque garde retirée rend son test ROUGE ;
#   ⑦ CONTRÔLES   : les contrôles d'exploitation sortent 0 ÉCHEC sur une base
#                   saine et rougissent sur chaque faux vert connu.
#
# ⚠️ Chaque refus attendu est précédé de sa PRÉMISSE (le cas légitime
# équivalent, qui doit passer) — sans elle un socle cassé ferait passer tous
# les « refusé » pour la mauvaise raison.
#
#   bash tests/sql/migration-admission-18-plus.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIG_136="$RACINE/migrations/migration_ts_serveur_age_blocage.sql"
MIGRATION="$RACINE/migrations/migration_admission_18_plus.sql"
PREFLIGHT="$RACINE/migrations/preflight_admission_18_plus.sql"
CONTROLES="$RACINE/migrations/controles_post_admission_18_plus.sql"
SOCLE="$RACINE/tests/sql/socle-prod.sql"
SOCLE_PLUS="$RACINE/tests/sql/socle-prod-admission.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$MIG_136" "$MIGRATION" "$PREFLIGHT" "$CONTROLES" "$SOCLE" "$SOCLE_PLUS"; do
  [ -f "$f" ] || { echo "❌ fichier introuvable : $f"; exit 1; }
done

PORT=$(( 5400 + RANDOM % 150 ))

# `initdb` et `postgres` refusent de tourner en root (conteneur CI) : on
# bascule sur un compte de service dédié, comme le banc #136.
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

Q() { psql -h "$BASE" -p "$PORT" -U postgres -d adm -tA -q -v ON_ERROR_STOP=1 "$@" 2>&1; }
AS() { psql -h "$BASE" -p "$PORT" -U postgres -d adm -tA -q -v ON_ERROR_STOP=1 \
       -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d adm -tA -q -v ON_ERROR_STOP=1 \
         -c "set local role anon; $1" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # majeur déclaré
B=22222222-2222-2222-2222-222222222222   # majeur, BLOQUÉ par A
C=33333333-3333-3333-3333-333333333333   # MINEUR déclaré (majorité 2030)
D=44444444-4444-4444-4444-444444444444   # majeur, organisateur
X=99999999-9999-9999-9999-999999999999   # aucune ligne user_safety
N=55555555-5555-5555-5555-555555555555   # compte NEUF : déclare pendant le banc

recreer_base() {
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 \
    -c "drop database if exists adm" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 \
    -c "drop role if exists anon; drop role if exists authenticated" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1 \
    -c "create database adm" >/dev/null
  Q -f "$SOCLE" >/dev/null
  Q -f "$SOCLE_PLUS" >/dev/null
  Q -f "$MIG_136" >/dev/null
}
appliquer_migration() { Q -f "$MIGRATION" >/dev/null; }
allumer()  { Q -c "update public.access_policies set enabled = true,  updated_at = now() where key = 'irl_adult_only';" >/dev/null; }
eteindre() { Q -c "update public.access_policies set enabled = false, updated_at = now() where key = 'irl_adult_only';" >/dev/null; }

semer() {
  Q -c "insert into public.user_safety(user_id,majority_at) values
        ('$A','2010-01-01'),('$B','2011-01-01'),('$C','2030-01-01'),('$D','2012-01-01')
        on conflict (user_id) do update set majority_at=excluded.majority_at;" >/dev/null
  Q -c "insert into public.blocks(blocker_id,blocked_id) values ('$A','$B') on conflict do nothing;" >/dev/null
}
# Une rencontre canonique organisée par D, avec sa conversation de groupe.
evenement() { # $1=id $2=organisateur
  AS "$2" "insert into public.events(id,author_id,title,conv_id) values ('$1','$2','Sortie','evgrp_$1');" >/dev/null
  AS "$2" "insert into public.conversations(id,created_by,is_group) values ('evgrp_$1','$2',true);" >/dev/null
  AS "$2" "insert into public.conv_members values ('evgrp_$1','$2');" >/dev/null
}
preparer() { # $1=SQL de mutation (optionnel), appliqué APRÈS la migration
  recreer_base
  appliquer_migration
  if [ -n "${1:-}" ]; then Q -c "$1" >/dev/null; fi
  semer
}

OK=0; KO=0
verifier() { # $1=libellé  $2=attendu  $3=obtenu
  if [ "$3" = "$2" ]; then OK=$((OK+1)); printf '  ✅ %s\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s — attendu «%s», obtenu «%s»\n' "$1" "$2" "$3"; fi
}
# Rend "refuse" si l'écriture viole la RLS, "accepte" sur succès franc. Tout le
# reste est une PANNE, jamais un « accepte » par défaut.
ecrit() {
  local sortie; sortie="$(AS "$1" "$2" || true)"
  case "$sortie" in
    *"violates row-level security"*|*"permission denied"*) echo refuse ;;
    *"connection to server"*|*"could not connect"*) echo PANNE-CONNEXION ;;
    *ERROR*|*error:*) echo erreur ;;
    *) echo accepte ;;
  esac
}
# Un UPDATE filtré par USING ne lève pas : il touche 0 ligne. On exige donc la
# ligne renvoyée par RETURNING, sinon c'est un refus.
modifie() { # $1=compte $2=UPDATE ... RETURNING rsvp
  local sortie; sortie="$(AS "$1" "$2" || true)"
  case "$sortie" in
    *"violates row-level security"*|*"permission denied"*) echo refuse ;;
    *ERROR*|*error:*) echo erreur ;;
    "") echo refuse ;;
    *) echo accepte ;;
  esac
}
anon_exec() { # $1=SQL
  local sortie; sortie="$(ANON "$1" || true)"
  case "$sortie" in *"permission denied"*) echo interdit;; *ERROR*|*error:*) echo erreur;; *) echo execute;; esac
}

echo "═══ Admission 18+ — banc de la fondation serveur ═══"

echo
echo "── ① ATOMICITÉ : une policy inconnue sur une surface IRL annule TOUT ──"
recreer_base
Q -c "create policy \"derive_inconnue\" on public.event_attendees for update to authenticated using (true) with check (true);" >/dev/null
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "policy UPDATE inconnue sur event_attendees : migration REFUSÉE" refusee "$r"
verifier "rollback : access_policies n'existe pas" t "$(Q -c "select to_regclass('public.access_policies') is null;")"
verifier "rollback : la policy INSERT d'origine de events reste" 1 \
  "$(Q -c "select count(*) from pg_policies where schemaname='public' and tablename='events' and policyname='Ecriture propre';")"
verifier "rollback : aucune policy d'admission n'a fui" 0 \
  "$(Q -c "select count(*) from pg_policies where schemaname='public' and policyname like '%_adult';")"
verifier "rollback : can_join_event_conversation est encore celle de #136" f \
  "$(Q -c "select pg_get_functiondef('public.can_join_event_conversation(text)'::regprocedure) like '%adult_access_allowed%';")"

recreer_base
Q -c "drop table public.user_safety cascade;" >/dev/null 2>&1 || true
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "#136 absente (pas de user_safety) : migration REFUSÉE" refusee "$r"

# La seule porte d'entrée dans l'admission est `declare_birth_year`. Poser la
# frontière sans elle donnerait une règle sans issue : personne ne pourrait
# jamais devenir admis.
recreer_base
Q -c "drop function public.declare_birth_year(integer);" >/dev/null 2>&1 || true
if Q -f "$MIGRATION" >/dev/null 2>&1; then r=acceptee; else r=refusee; fi
verifier "porte de déclaration absente : migration REFUSÉE" refusee "$r"

echo
echo "── ② ÉTEINT à l'application : rien ne change pour personne ──"
preparer
verifier "PREFLIGHT : aucun BLOQUANT sur le socle" 0 "$(Q -tA -f "$PREFLIGHT" | grep -c '|BLOQUANT|' || true)"
verifier "l'interrupteur existe et est ÉTEINT" f "$(Q -c "select enabled from public.access_policies where key='irl_adult_only';")"
verifier "statut : 'off' pour un majeur"     off "$(AS "$A" "select public.adult_access_status();")"
verifier "statut : 'off' pour un MINEUR"     off "$(AS "$C" "select public.adult_access_status();")"
verifier "statut : 'off' pour un INCONNU"    off "$(AS "$X" "select public.adult_access_status();")"
verifier "majeur organise : accepté"          accepte "$(ecrit "$A" "insert into public.events(id,author_id,title) values ('off_a','$A','T');")"
verifier "MINEUR organise : accepté (éteint)" accepte "$(ecrit "$C" "insert into public.events(id,author_id,title) values ('off_c','$C','T');")"
verifier "INCONNU organise : accepté (éteint)" accepte "$(ecrit "$X" "insert into public.events(id,author_id,title) values ('off_x','$X','T');")"
verifier "MINEUR s'inscrit : accepté (éteint)" accepte "$(ecrit "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('off_a','$C','going');")"
verifier "organiser au nom d'un AUTRE : toujours refusé" refuse "$(ecrit "$A" "insert into public.events(id,author_id,title) values ('forge','$D','T');")"
verifier "s'inscrire au nom d'un AUTRE : toujours refusé" refuse "$(ecrit "$A" "insert into public.event_attendees(event_id,user_id,rsvp) values ('off_a','$D','going');")"
verifier "anon n'écrit plus dans events (INSERT révoqué)" refuse \
  "$(case "$(ANON "insert into public.events(id,author_id,title) values ('anon','$A','T');" || true)" in
       *"permission denied"*|*"violates row-level security"*) echo refuse;; *) echo accepte;; esac)"
# ⚠️ CE QUE LE RESSERREMENT NE FAIT PAS, dit explicitement. La prod accorde à
# `anon` TOUS les droits sur ces deux tables ; la migration ne lui retire que
# l'INSERT. UPDATE et DELETE lui restent, couverts par la seule RLS (leurs
# policies exigent `auth.uid()`, NULL sans session). Un banc qui tairait ce
# reliquat ferait passer le lot pour plus complet qu'il n'est.
verifier "reliquat assumé : anon garde UPDATE/DELETE (RLS seule les couvre)" t \
  "$(Q -c "select has_table_privilege('anon','public.events','update') and has_table_privilege('anon','public.event_attendees','delete');")"
verifier "…et la RLS les rend inopérants : anon ne modifie aucun événement" 0 \
  "$(ANON "update public.events set title='pirate' returning 1;" | grep -c 1 || true)"
verifier "anon n'exécute pas adult_access_status" interdit "$(anon_exec "select public.adult_access_status();")"
verifier "anon n'exécute pas adult_access_allowed" interdit "$(anon_exec "select public.adult_access_allowed();")"
verifier "le client ne lit pas l'interrupteur" refuse \
  "$(case "$(AS "$A" "select count(*) from public.access_policies;" || true)" in *"permission denied"*) echo refuse;; *) echo accepte;; esac)"
verifier "le client ne bascule pas l'interrupteur" refuse \
  "$(case "$(AS "$A" "update public.access_policies set enabled=true;" || true)" in *"permission denied"*) echo refuse;; *) echo accepte;; esac)"
verifier "les aides internes ne sont pas des RPC (authenticated sans EXECUTE)" f \
  "$(Q -c "select has_function_privilege('authenticated','public.adult_access_enforced()','execute') or has_function_privilege('authenticated','public.is_adult_declared()','execute');")"

echo
echo "── ③ IDEMPOTENCE : rejouée, elle ne rétrograde jamais l'interrupteur ──"
allumer
appliquer_migration
verifier "seconde exécution : l'interrupteur ALLUMÉ le reste" t "$(Q -c "select enabled from public.access_policies where key='irl_adult_only';")"
verifier "seconde exécution : une seule policy INSERT sur events" 1 \
  "$(Q -c "select count(*) from pg_policies where schemaname='public' and tablename='events' and cmd='INSERT';")"
verifier "seconde exécution : données d'âge conservées" 4 "$(Q -c "select count(*) from public.user_safety;")"

echo
echo "── ④ ALLUMÉ : l'admission décide ──"
preparer; allumer
verifier "statut majeur : 'admitted'"   admitted   "$(AS "$A" "select public.adult_access_status();")"
verifier "statut MINEUR : 'minor'"      minor      "$(AS "$C" "select public.adult_access_status();")"
verifier "statut INCONNU : 'undeclared'" undeclared "$(AS "$X" "select public.adult_access_status();")"
verifier "PRÉMISSE — majeur organise : accepté" accepte "$(ecrit "$D" "insert into public.events(id,author_id,title,conv_id) values ('ev1','$D','Sortie','evgrp_ev1');")"
AS "$D" "insert into public.conversations(id,created_by,is_group) values ('evgrp_ev1','$D',true);" >/dev/null
AS "$D" "insert into public.conv_members values ('evgrp_ev1','$D');" >/dev/null
verifier "MINEUR organise : refusé"     refuse "$(ecrit "$C" "insert into public.events(id,author_id,title) values ('ev_c','$C','T');")"
verifier "INCONNU organise : refusé"    refuse "$(ecrit "$X" "insert into public.events(id,author_id,title) values ('ev_x','$X','T');")"
verifier "PRÉMISSE — majeur s'inscrit : accepté" accepte "$(ecrit "$A" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$A','going');")"
verifier "MINEUR s'inscrit : refusé"    refuse "$(ecrit "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$C','going');")"
verifier "MINEUR « peut-être » : refusé aussi" refuse "$(ecrit "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$C','maybe');")"
verifier "INCONNU s'inscrit : refusé"   refuse "$(ecrit "$X" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$X','going');")"
verifier "majeur admis, mais au nom d'un AUTRE : refusé" refuse "$(ecrit "$A" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$D','going');")"

echo "   · la porte s'ouvre par la déclaration, et par elle seule"
verifier "compte NEUF avant déclaration : refusé"  refuse "$(ecrit "$N" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$N','going');")"
verifier "…statut 'undeclared'"                     undeclared "$(AS "$N" "select public.adult_access_status();")"
verifier "déclare 2000 (majeur) : RPC accepté"      t "$(AS "$N" "select public.declare_birth_year(2000);")"
verifier "…statut 'admitted'"                       admitted "$(AS "$N" "select public.adult_access_status();")"
verifier "…et l'inscription passe"                  accepte "$(ecrit "$N" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$N','going');")"
verifier "un compte neuf qui déclare une année MINEURE reste dehors" refuse \
  "$(AS "$X" "select public.declare_birth_year($(date +%Y) - 15);" >/dev/null; ecrit "$X" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$X','going');")"
verifier "…statut 'minor'"                          minor "$(AS "$X" "select public.adult_access_status();")"
verifier "…et se « vieillir » ensuite ne change rien (#136 tient)" minor \
  "$(AS "$X" "select public.declare_birth_year(1990);" >/dev/null; AS "$X" "select public.adult_access_status();")"
# ⚠️ PRÉMISSE de la mutation « comparaison relâchée à l'année ». La borne
# prudente de #136 est le 31 DÉCEMBRE : un compte dont la majorité tombe cette
# année-ci ne l'a pas encore atteinte. Une comparaison qui ne regarderait que
# l'année l'admettrait — c'est la porte que la mutation ouvre plus bas.
#
# ⚠️ Le 31 décembre, cette date EST atteinte : la prémisse comme la mutation
# perdent leur sens ce jour-là. On ne l'écrit pas en dur et on ne fait pas
# semblant — `$DERNIER_JOUR` vaut 1 ce jour-là, et les deux contrôles le disent.
DERNIER_JOUR="$(Q -c "select case when current_date = make_date(extract(year from current_date)::int,12,31) then 1 else 0 end;")"
Q -c "insert into public.user_safety(user_id,majority_at) values ('66666666-6666-6666-6666-666666666666', make_date($(date +%Y),12,31))
      on conflict (user_id) do update set majority_at = excluded.majority_at;" >/dev/null
if [ "$DERNIER_JOUR" = "1" ]; then
  printf '  ⏭️  majorité au 31/12 : sans objet aujourd''hui (nous SOMMES le 31 décembre)\n'
else
  verifier "majorité au 31/12 de cette année : pas encore atteinte, refusé" f \
    "$(AS "66666666-6666-6666-6666-666666666666" "select public.adult_access_allowed();")"
fi

echo "   · une inscription rattrapée par la règle : retrait permis, retour interdit"
eteindre
AS "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$C','going');" >/dev/null
AS "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$C','going') on conflict do nothing;" >/dev/null 2>&1 || true
allumer
verifier "PRÉMISSE — le mineur est inscrit d'avant l'allumage" going "$(Q -c "select rsvp from public.event_attendees where event_id='ev1' and user_id='$C';")"
verifier "MINEUR passe en « peut-être » : refusé"      refuse  "$(modifie "$C" "update public.event_attendees set rsvp='maybe' where event_id='ev1' and user_id='$C' returning rsvp;")"
verifier "MINEUR pointe son arrivée (check-in) : refusé" refuse "$(modifie "$C" "update public.event_attendees set checked_in_at=now(), rsvp='going' where event_id='ev1' and user_id='$C' returning rsvp;")"
verifier "MINEUR se RETIRE (declined) : accepté"       accepte "$(modifie "$C" "update public.event_attendees set rsvp='declined' where event_id='ev1' and user_id='$C' returning rsvp;")"
verifier "MINEUR revient (going) : refusé"             refuse  "$(modifie "$C" "update public.event_attendees set rsvp='going' where event_id='ev1' and user_id='$C' returning rsvp;")"
verifier "MINEUR se désinscrit (DELETE) : accepté"     1 \
  "$(AS "$C" "delete from public.event_attendees where event_id='ev1' and user_id='$C' returning 1;" | grep -c 1 || true)"
verifier "PRÉMISSE — le majeur change d'avis librement" accepte "$(modifie "$A" "update public.event_attendees set rsvp='maybe' where event_id='ev1' and user_id='$A' returning rsvp;")"
verifier "…et pointe son arrivée"                      accepte "$(modifie "$A" "update public.event_attendees set checked_in_at=now(), rsvp='going' where event_id='ev1' and user_id='$A' returning rsvp;")"
verifier "un majeur ne modifie pas la ligne d'un AUTRE" refuse \
  "$(modifie "$A" "update public.event_attendees set rsvp='declined' where event_id='ev1' and user_id='$N' returning rsvp;")"

echo "   · la conversation de la rencontre suit l'admission"
verifier "PRÉMISSE — inscrit majeur rejoint la conversation" accepte "$(ecrit "$A" "insert into public.conv_members values ('evgrp_ev1','$A');")"
eteindre
AS "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('ev1','$C','going');" >/dev/null
allumer
verifier "inscrit MINEUR (d'avant l'allumage) ne la rejoint pas" refuse "$(ecrit "$C" "insert into public.conv_members values ('evgrp_ev1','$C');")"
verifier "…et ne lit pas la conversation"                     0 "$(AS "$C" "select count(*) from public.conversations where id='evgrp_ev1';")"
verifier "le blocage de #136 tient toujours (B bloqué par A)"  f "$(AS "$A" "select public.irl_interaction_allowed('$B');")"
verifier "l'organisateur peut encore ajouter un membre (créateur, #136)" accepte "$(ecrit "$D" "insert into public.conv_members values ('evgrp_ev1','$N');")"
# ⚠️ Un tiers non inscrit ne rejoint toujours pas : l'admission s'AJOUTE aux
# preuves de #136, elle ne les remplace pas.
verifier "majeur NON inscrit ne rejoint pas la conversation"  refuse "$(ecrit "$B" "insert into public.conv_members values ('evgrp_ev1','$B');")"

echo
echo "── ⑤ FAIL-CLOSED : la ligne d'interrupteur supprimée EXIGE l'admission ──"
Q -c "delete from public.access_policies where key='irl_adult_only';" >/dev/null
verifier "ligne absente : majeur toujours admis"   t "$(AS "$A" "select public.adult_access_allowed();")"
verifier "ligne absente : INCONNU refusé"           f "$(AS "$X" "select public.adult_access_allowed();")"
verifier "ligne absente : MINEUR n'organise pas"    refuse "$(ecrit "$C" "insert into public.events(id,author_id,title) values ('ev_c2','$C','T');")"
verifier "ligne absente : les contrôles le DISENT (≥ 1 ÉCHEC)" t \
  "$([ "$(Q -tA -f "$CONTROLES" | grep -c '|ECHEC|' || true)" -ge 1 ] && echo t || echo f)"
appliquer_migration
verifier "la migration rejouée recrée la ligne, ÉTEINTE" f "$(Q -c "select enabled from public.access_policies where key='irl_adult_only';")"

echo
echo "── ⑥ MUTATIONS : chaque garde retirée doit rendre son test ROUGE ──"
sonde_mineur_organise()   { allumer; ecrit "$C" "insert into public.events(id,author_id,title) values ('m1','$C','T');"; }
sonde_mineur_inscrit()    { allumer; evenement m2 "$D"; ecrit "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('m2','$C','going');"; }
sonde_mineur_revient()    {
  evenement m3 "$D"
  AS "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('m3','$C','declined');" >/dev/null
  allumer
  modifie "$C" "update public.event_attendees set rsvp='going' where event_id='m3' and user_id='$C' returning rsvp;"
}
sonde_inconnu_admis()     { allumer; AS "$X" "select public.adult_access_allowed();"; }
sonde_ligne_absente()     { Q -c "delete from public.access_policies;" >/dev/null; AS "$X" "select public.adult_access_allowed();"; }
sonde_mineur_conversation() {
  evenement m4 "$D"
  AS "$C" "insert into public.event_attendees(event_id,user_id,rsvp) values ('m4','$C','going');" >/dev/null
  allumer
  ecrit "$C" "insert into public.conv_members values ('evgrp_m4','$C');"
}
sonde_anon_execute()      { anon_exec "select public.adult_access_status();"; }
sonde_client_lit_interrupteur() {
  case "$(AS "$A" "select count(*) from public.access_policies;" || true)" in *"permission denied"*) echo refuse;; *) echo accepte;; esac
}
sonde_majorite_future()   {
  # Majorité au 31/12 de CETTE année : même ANNÉE que la date du jour, mais pas
  # encore atteinte → doit rester dehors. C'est exactement ce qu'une comparaison
  # relâchée à l'année laisserait passer.
  # ⚠️ INSERT ... ON CONFLICT, jamais un UPDATE seul : X n'a AUCUNE ligne
  # user_safety, l'UPDATE touchait zéro ligne sans lever, la sonde mesurait un
  # compte inconnu (donc « f » = refusé) et la mutation avait l'air détectée
  # alors que rien n'était éprouvé. Défaut trouvé en exécutant le banc.
  Q -c "insert into public.user_safety(user_id,majority_at)
        values ('$X', make_date($(date +%Y),12,31))
        on conflict (user_id) do update set majority_at = excluded.majority_at;" >/dev/null
  allumer
  AS "$X" "select public.adult_access_allowed();"
}

mutation() { # $1=libellé  $2=SQL de mutation  $3=sonde  $4=valeur qui SIGNALE le défaut
  preparer "$2"
  local obtenu; obtenu="$("$3")"
  if [ "$obtenu" = "$4" ]; then OK=$((OK+1)); printf '  ✅ %s → défaut détecté\n' "$1"
  else KO=$((KO+1)); printf '  ❌ %s → LA MUTATION SURVIT (obtenu «%s») : le test ne garde rien\n' "$1" "$obtenu"; fi
}

mutation "admission retirée de la policy INSERT de events" \
  "drop policy \"events_insert_author_adult\" on public.events;
   create policy \"events_insert_author_adult\" on public.events for insert to authenticated
     with check (author_id = ((select auth.uid()))::text);" \
  sonde_mineur_organise accepte

mutation "policy INSERT d'origine restaurée à côté (OU permissif) sur events" \
  "create policy \"Ecriture propre\" on public.events for insert with check (author_id = (auth.uid())::text);" \
  sonde_mineur_organise accepte

mutation "admission retirée de la policy INSERT de event_attendees" \
  "drop policy \"event_attendees_insert_own_adult\" on public.event_attendees;
   create policy \"event_attendees_insert_own_adult\" on public.event_attendees for insert to authenticated
     with check (user_id = ((select auth.uid()))::text);" \
  sonde_mineur_inscrit accepte

mutation "policy UPDATE d'origine (sans admission) restaurée" \
  "drop policy \"event_attendees_update_own_adult\" on public.event_attendees;
   create policy \"Maj de sa propre participation\" on public.event_attendees for update
     using (user_id = (auth.uid())::text) with check (user_id = (auth.uid())::text);" \
  sonde_mineur_revient accepte

mutation "exception « declined » élargie à tout état" \
  "drop policy \"event_attendees_update_own_adult\" on public.event_attendees;
   create policy \"event_attendees_update_own_adult\" on public.event_attendees for update to authenticated
     using (user_id = ((select auth.uid()))::text)
     with check (user_id = ((select auth.uid()))::text and (public.adult_access_allowed() or rsvp is not null));" \
  sonde_mineur_revient accepte

mutation "COALESCE fail-closed retiré de is_adult_declared (inconnu → NULL → ?)" \
  "create or replace function public.is_adult_declared() returns boolean
   language sql security definer stable set search_path = '' as \$f\$
     select coalesce((select s.majority_at <= current_date from public.user_safety s
                       where s.user_id = (auth.uid())::text), true) \$f\$;" \
  sonde_inconnu_admis t

mutation "interrupteur rendu fail-OPEN (ligne absente = éteint)" \
  "create or replace function public.adult_access_enforced() returns boolean
   language sql security definer stable set search_path = '' as \$f\$
     select coalesce((select p.enabled from public.access_policies p where p.key='irl_adult_only'), false) \$f\$;" \
  sonde_ligne_absente t

# ⚠️ Le 31 décembre, la date-témoin est atteinte et la mutation est
# indétectable : la sauter ce jour-là, plutôt que compter un faux vert.
if [ "${DERNIER_JOUR:-0}" = "1" ]; then
  printf '  ⏭️  comparaison de majorité relâchée : sans objet le 31 décembre\n'
else
mutation "comparaison de majorité relâchée (jour ignoré, année seule comparée)" \
  "create or replace function public.is_adult_declared() returns boolean
   language sql security definer stable set search_path = '' as \$f\$
     select coalesce((select extract(year from s.majority_at) <= extract(year from current_date)
                        from public.user_safety s where s.user_id = (auth.uid())::text), false) \$f\$;" \
  sonde_majorite_future t
fi

mutation "admission retirée de can_join_event_conversation (corps #136)" \
  "create or replace function public.can_join_event_conversation(_conv_id text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select case when auth.uid() is null or _conv_id is null then false else exists (
       select 1 from public.events e
       join public.event_attendees a on a.event_id=e.id and a.user_id=(auth.uid())::text
       join public.conversations c on c.id=e.conv_id
       where e.conv_id=_conv_id and e.conv_id=('evgrp_'||e.id) and c.created_by=e.author_id
         and e.status='active' and a.rsvp in ('going','maybe')
         and not public.is_blocked_with(e.author_id)) end \$f\$;" \
  sonde_mineur_conversation accepte

mutation "EXECUTE rendu à anon sur le statut" \
  "grant execute on function public.adult_access_status() to anon;" \
  sonde_anon_execute execute

mutation "lecture de l'interrupteur rendue au client" \
  "grant select on public.access_policies to authenticated;
   create policy \"lecture\" on public.access_policies for select to authenticated using (true);" \
  sonde_client_lit_interrupteur accepte

echo
echo "── ⑦ CONTRÔLES D'EXPLOITATION (migrations/controles_post_admission_18_plus.sql) ──"
echecs_controles() { Q -tA -f "$CONTROLES" 2>/dev/null | grep -c '|ECHEC|' || true; }
preparer
verifier "base correctement migrée : aucun ÉCHEC" 0 "$(echecs_controles)"
verifier "…et l'état de l'interrupteur est dit (INFO éteint)" 1 "$(Q -tA -f "$CONTROLES" | grep -c 'irl_adult_only = eteint' || true)"
allumer
verifier "…allumé : toujours 0 ÉCHEC, INFO allumé" "0/1" \
  "$(printf '%s/%s' "$(echecs_controles)" "$(Q -tA -f "$CONTROLES" | grep -c 'irl_adult_only = ALLUME' || true)")"
verifier "PREFLIGHT sur base déjà migrée : INFO idempotence, aucun BLOQUANT" "0/1" \
  "$(printf '%s/%s' "$(Q -tA -f "$PREFLIGHT" | grep -c '|BLOQUANT|' || true)" "$(Q -tA -f "$PREFLIGHT" | grep -c 'access_policies existe deja' || true)")"

controle_rouge() { # $1=libellé  $2=SQL de mutation
  preparer "$2"
  [ "$(echecs_controles)" -ge 1 ] \
    && { OK=$((OK+1)); printf '  ✅ %s → contrôle ROUGE\n' "$1"; } \
    || { KO=$((KO+1)); printf '  ❌ %s → contrôle resté VERT : faux vert\n' "$1"; }
}
controle_rouge "policy attendue affaiblie en WITH CHECK (true), même nom" \
  "drop policy \"events_insert_author_adult\" on public.events;
   create policy \"events_insert_author_adult\" on public.events for insert to authenticated with check (true);"
controle_rouge "admission retirée de la policy INSERT, nom et rôles inchangés" \
  "drop policy \"event_attendees_insert_own_adult\" on public.event_attendees;
   create policy \"event_attendees_insert_own_adult\" on public.event_attendees for insert to authenticated
     with check (user_id = ((select auth.uid()))::text);"
controle_rouge "seconde policy INSERT permissive laissée sur events" \
  "create policy \"Ecriture propre\" on public.events for insert with check (author_id = (auth.uid())::text);"
controle_rouge "policy ouverte à public au lieu de authenticated" \
  "drop policy \"event_attendees_update_own_adult\" on public.event_attendees;
   create policy \"event_attendees_update_own_adult\" on public.event_attendees for update
     using (user_id = ((select auth.uid()))::text)
     with check (user_id = ((select auth.uid()))::text and (public.adult_access_allowed() or rsvp = 'declined'));"
controle_rouge "exception « declined » retirée (le retrait devient impossible)" \
  "drop policy \"event_attendees_update_own_adult\" on public.event_attendees;
   create policy \"event_attendees_update_own_adult\" on public.event_attendees for update to authenticated
     using (user_id = ((select auth.uid()))::text)
     with check (user_id = ((select auth.uid()))::text and public.adult_access_allowed());"
controle_rouge "search_path d'une fonction SECURITY DEFINER passé à public" \
  "alter function public.adult_access_allowed() set search_path = public;"
controle_rouge "fonction rendue VOLATILE" \
  "alter function public.is_adult_declared() volatile;"
controle_rouge "EXECUTE rendu à anon" \
  "grant execute on function public.adult_access_allowed() to anon;"
controle_rouge "aide interne exposée en RPC à authenticated" \
  "grant execute on function public.adult_access_enforced() to authenticated;"
controle_rouge "interrupteur lisible par le client" \
  "grant select on public.access_policies to authenticated;"
controle_rouge "une policy posée sur access_policies" \
  "create policy \"fuite\" on public.access_policies for select to authenticated using (true);"
controle_rouge "interrupteur rendu fail-open" \
  "create or replace function public.adult_access_enforced() returns boolean
   language sql security definer stable set search_path = '' as \$f\$
     select coalesce((select p.enabled from public.access_policies p where p.key='irl_adult_only'), false) \$f\$;"
controle_rouge "admission retirée de can_join_event_conversation" \
  "create or replace function public.can_join_event_conversation(_conv_id text)
   returns boolean language sql security definer stable set search_path = '' as \$f\$
     select case when auth.uid() is null or _conv_id is null then false else exists (
       select 1 from public.events e
       join public.event_attendees a on a.event_id=e.id and a.user_id=(auth.uid())::text
       join public.conversations c on c.id=e.conv_id
       where e.conv_id=_conv_id and e.conv_id=('evgrp_'||e.id) and c.created_by=e.author_id
         and e.status='active' and a.rsvp in ('going','maybe')
         and not public.is_blocked_with(e.author_id)) end \$f\$;"
controle_rouge "INSERT rendu à anon sur events" \
  "grant insert on public.events to anon;"
controle_rouge "policy DELETE de event_attendees supprimée (retrait impossible)" \
  "drop policy \"Suppression propre\" on public.event_attendees;"

echo
echo "═══ $OK OK · $KO KO ═══"
[ "$KO" -eq 0 ]
