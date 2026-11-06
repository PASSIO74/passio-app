#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_discussions_activite_2026-11-06.sql
# (C-02 / R41 : `is_conv_member` ne répond plus sur autrui ; RV-44 : le créateur
# d'une discussion d'activité en voit — donc en retire — tous les membres)
#
# PostgreSQL jetable, en `wal_level = logical`. Socle = la PRODUCTION du
# 2026-11-06 (canal ①, pg_get_functiondef / pg_policies / pg_get_triggerdef,
# fins de ligne CRLF ramenées à LF), CONTRÔLÉE PAR EMPREINTE en ⓪ — corps des
# fonctions (md5 de prosrc) et déparsage des policies (md5, `public.` ôté) :
#   · fonctions : is_conv_member, is_conversation_creator, is_blocked_with,
#     conv_1a1_bloquee, can_join_event_conversation, organise_activite,
#     adult_access_allowed, suppression_de_mon_compte,
#     refuser_ecriture_compte_en_suppression, storage_chemin_autorise,
#     trg_reports_preuve_message, reports_statut_initial, diffuser_ajout_membre,
#     rid_opaque_garde, rate_limit_insert, identifiants_figes, auth.uid(),
#     realtime.topic(), storage.foldername() ;
#   · les 11 policies qui appellent is_conv_member, les deux policies de
#     storage.objects qui passent par storage_chemin_autorise, les autres policies
#     de conv_members, conversations, conv_messages, blocks, reports, et celles
#     de realtime.messages ;
#   · les déclencheurs utiles : conv_members (trg_diffuser_ajout_membre,
#     trg_rid_opaque, zz_barriere_suppression), conv_messages (ses trois
#     déclencheurs BEFORE : trg_rate_limit, zz_barriere_suppression,
#     trg_identifiants_figes — relevés le 06/11 vers 15:00 UTC), conv_reads (rid,
#     barrière), profiles et blocks (barrière), reports
#     (trg_reports_statut_initial, trg_reports_preuve_message avec sa clause WHEN) ;
#   · `realtime.send` FACTICE : il fait ce que fait celui de production (pose
#     `realtime.topic` en local, écrit dans realtime.messages) ET consigne
#     chaque poussée dans `banc.poussees` ;
#   · les rôles de la production : `postgres` (qui bâtit le socle et applique la
#     migration) n'est PAS superutilisateur, a BYPASSRLS, est membre (SET)
#     d'anon, authenticated et service_role ; search_path « "$user", public,
#     extensions » ; auth.uid() lit `request.jwt.claim.sub` PUIS
#     `request.jwt.claims` (définition de production).
#
# On MESURE D'ABORD LE DÉFAUT (⓪bis) : X, connecté et sans lien, reconstitue
# par is_conv_member la liste des venants de la discussion d'une activité, et
# l'appartenance d'autrui à un groupe ordinaire et à une conversation 1-à-1 ; K,
# créateur, ne voit pas le membre qu'il a bloqué et son DELETE touche 0 ligne.
# Puis : la réinjection (la migration SANS sa correction est REFUSÉE par son
# propre verdict) ; l'application (fichier, requête unique, CRLF) et le rejeu ;
# le comportement — oracle fermé (1-à-1 comprise), sa propre appartenance, sans
# session, service_role, anon, la forme claims seule — ; un appel sur AUTRUI ne
# LIT PAS conv_members (pg_stat_xact_user_tables : 0 lecture, témoin sur soi :
# 50), ce que le verdict ne peut pas voir (l'ordre d'avant y passe 17/17 : ici,
# 100 lectures) ; les 11 policies et storage_chemin_autorise mesurés AVANT et
# APRÈS sur deux copies de la même base (signature identique) ;
# trg_reports_preuve_message (signalant membre : preuve ; non-membre : rien ;
# service_role : preuve) ; RV-44 (le créateur voit et RETIRE, un autre membre
# ne voit pas) ; le décodage logique (aucune trace du décor, et le témoin
# positif) ; le retour arrière À L'OCTET (md5) puis la réapplication ; des
# dérives de la base (refusées, base inchangée) ; et des RÉINJECTIONS dans le
# fichier, dont les trois exigées — clause `_uid` retirée, branche créateur
# retirée, ACL rendue à anon — et une policy RÉCURSIVE (R3 : 42P17 levée sous
# authenticated, que l'ancien verdict rangeait en « panne du décor » non
# bloquante), qui doivent faire LEVER le verdict (55000, lignes nommées) et
# laisser la base inchangée ; un décor en panne lève aussi (ligne 1 bloquante).
#
# CE QUE CE BANC NE PROUVE PAS, dit tel quel :
#   · la production est en PostgreSQL 17.6 ; ce banc tourne sur la version
#     installée (16 ici). Le déparsage de la policy de C-04 est identique sur les
#     deux (md5 de15394b… mesuré en production ET ici, en ⓪), ce qui fonde
#     l'attente du texte neuf ; le reste est analytique ;
#   · aucun PostgREST, aucun Realtime, aucun Storage : leurs requêtes sont
#     simulées (rôle, `request.jwt.claims`, `realtime.topic`) ;
#   · « rien n'est livré » se prouve ici sur un slot logique `test_decoding` (le
#     tampon de réordonnancement, commun à tout greffon de sortie, wal2json et
#     pgoutput compris, écarte une sous-transaction annulée) — pas sur le
#     Realtime de Supabase lui-même ;
#   · events et event_attendees n'ont pas leurs policies ni leurs déclencheurs
#     de production (lus en SECURITY DEFINER par can_join seulement) ;
#     conv_messages a ses trois déclencheurs BEFORE de production, pas sa
#     diffusion AFTER INSERT (broadcast_conv_message_users_trigger) ; reports
#     n'a ni trg_rate_limit ni trg_reports_pretri ;
#     profiles a une policy de lecture simplifiée ; realtime.messages et
#     storage.objects sont réduits aux colonnes que lisent les policies, et leurs
#     schémas appartiennent à `postgres` (supabase_realtime_admin et
#     supabase_storage_admin en production) ; adult_access_enforced() rend
#     faux (adult_access_allowed garde son corps de production) ;
#   · le COÛT du corps et le canal de TEMPS (une ligne de conv_members lue sous
#     RLS dit si elle existe), chiffrés dans l'en-tête de la migration, sont
#     mesurés à part sur un PostgreSQL 16 jetable, pas par ce banc : ici, l'ordre
#     des conjonctions se prouve par le compteur de lectures, pas par des durées.
#
#   bash tests/sql/migration-discussions-activite.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur, test_decoding), python3.
# Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_discussions_activite_2026-11-06.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v python3 >/dev/null || { echo "❌ python3 introuvable (mutations du banc)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

# ── Empreintes mesurées en production le 2026-11-06 (canal ①) ──────────────
MD5_FONCTION_PROD=da6bf4bb1054d608cbb0f246d70ddb39     # md5(prosrc) d'is_conv_member, 101 octets
MD5_POLICY_C04=de15394b190609eb2ae3302f7710dd18        # déparsage de conv_members_select_member (C-04)
ACL_PROD="authenticated:EXECUTE,postgres:EXECUTE,service_role:EXECUTE"
# Fonctions : md5(prosrc), CRLF → LF.
declare -A MD5_PROD=(
  ["auth.uid()"]=cdef18c69c4f4cbbced2eaf81e628b49
  ["realtime.topic()"]=f482262ce4c8bd9e6c426b998c0b7a0e
  ["storage.foldername(text)"]=d74c9ac376970bf5b265ecb58e855df9
  ["public.is_conv_member(text,text)"]=da6bf4bb1054d608cbb0f246d70ddb39
  ["public.is_conversation_creator(text)"]=04b54df0075ee2131a307795ca92d31c
  ["public.is_blocked_with(text)"]=25b7ca8e81031951cb241316f7cfdd64
  ["public.conv_1a1_bloquee(text)"]=e11c1f65048997f233cc9a4f9eabbb1a
  ["public.can_join_event_conversation(text)"]=956f53c928c3b02ea7098a28f7858b72
  ["public.organise_activite(text)"]=144cba40ebaa14f326ca8193530840b6
  ["public.adult_access_allowed()"]=8aa32a4a969c08fb3b1829f2973563ca
  ["public.suppression_de_mon_compte()"]=60aa519cc72bc4ebfd95d7f7bea17553
  ["public.refuser_ecriture_compte_en_suppression()"]=8ea40f715280c2867524dab576ab32b8
  ["public.storage_chemin_autorise(text,text)"]=0ab32680a710a7f4f04783459337386f
  ["public.trg_reports_preuve_message()"]=816c7ac73b5a948c99ee15c212e34810
  ["public.reports_statut_initial()"]=cbe22f0aeaa3a0465b40c5aeb32a6fe2
  ["public.diffuser_ajout_membre()"]=e897ec03269346b97577bd14aa2008e5
  ["public.rid_opaque_garde()"]=4bf585c53ddb2b44e4b70a46e8b780cc
  ["public.rate_limit_insert()"]=fb1b26118dee1c38bfd66c9c106809e2
  ["public.identifiants_figes()"]=283686cca23a670e2a00145a50561ce7
)
# Policies : md5 de « USING#WITH CHECK » déparsés, `public.` ôté (canal ①, search_path « "$user", public »).
declare -A MD5_POLICIES_PROD=(
  ["public.conv_members·Ecriture propre"]=794401e094cc31423de0c9cf746fdf77
  ["public.conv_members·Suppression admin"]=bb42c1faff2d67c91d4a543a2ff792cc
  ["public.conv_members·conv_members_select_member"]=4a1904a03ba446494250fc7ae0d4cc16
  ["public.conv_messages·Suppression propre"]=a3f253e8ba2abe2bd6bdd4affa1cc69e
  ["public.conv_messages·Update propre"]=d4c76be252d07d63fc12597a994e030f
  ["public.conv_messages·conv_messages_insert_member"]=0112611042cf6210527197a6024d5683
  ["public.conv_messages·conv_messages_select_member"]=55384a7987756ed2db4ebe40e2054da3
  ["public.conv_reads·reads_select"]=0c657e964cff078f95059bd2b3558a43
  ["public.conv_reads·reads_update"]=331b7e8f296fbda123196eb8d668b741
  ["public.conv_reads·reads_upsert"]=10c67c70c1695faf13bc700253e9bb3e
  ["public.conversations·Suppression conversation orpheline"]=110a18c13d71002eeeb0ec5f6faef631
  ["public.conversations·conversations_insert_creator"]=2e291ce1fa5471a733b3370481baffb2
  ["public.conversations·conversations_select_member"]=f65329d32f3498ca6adb75cb6d56362a
  ["public.blocks·blocks_delete_own"]=0c6dfb03adf351600249681fdcdf29d4
  ["public.blocks·blocks_insert_own"]=678fbf98bdfb23d015d93ffe674bbe5c
  ["public.blocks·blocks_select_own"]=0c6dfb03adf351600249681fdcdf29d4
  ["public.reports·reports_insert"]=b7f589dc7b75119d508ca5d518c57a7f
  ["realtime.messages·Utilisateur reçoit ses messages"]=b3601d913a47e5c76167fa9450feb2e6
  ["realtime.messages·passio_rt_emettre"]=f166bc7132dadb11749ff03f00e79907
  ["realtime.messages·passio_rt_recevoir"]=2aecfbbdee4a3dc629f8e3d0f1d70bcd
  ["realtime.messages·passio_rt_recevoir_visiteur"]=a0bf84c7e6f6b64bb9de79cc10502db9
  ["storage.objects·passio_attachments_read_membre"]=8f14bd1965b57d2856e0dcab8a6d7b30
  ["storage.objects·passio_media_insert_cloisonne"]=b80047be7d057d53911eef86daffaed6
  ["storage.objects·passio_media_update_cloisonne"]=3da646f07ab9e18a53296f9a3ffab747
)

PORT=$(( 6700 + RANDOM % 120 ))
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

lancer "initdb -D '$BASE/data' -A trust -U supabase_admin" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c wal_level=logical -c max_replication_slots=6 -c max_wal_senders=6\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U supabase_admin -d postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=discussions
SQLDIR="$BASE/sql"; mkdir -p "$SQLDIR"; chmod 755 "$SQLDIR"

# ── Les helpers. Une sortie de psql n'est un succès que si psql l'a dit ──
QA()   { psql -h "$BASE" -p "$PORT" -U supabase_admin -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
QD()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
Q()    { QD "$DB" "$1"; }
# Le préambule d'une identité CLIENTE (PostgREST : set local role, puis les claims du jeton).
PRE() {
  case "$1" in
    anon)          printf '%s' "set local role anon; set local request.jwt.claims = '{\"role\": \"anon\"}';" ;;
    service_role)  printf '%s' "set local role service_role; set local request.jwt.claims = '{\"role\": \"service_role\"}';" ;;
    authenticated) printf '%s' "set local role authenticated; set local request.jwt.claim.sub = '$2'; set local request.jwt.claims = '{\"sub\": \"$2\", \"role\": \"authenticated\"}';" ;;
    claims_seuls)  printf '%s' "set local role authenticated; set local request.jwt.claims = '{\"sub\": \"$2\", \"role\": \"authenticated\"}';" ;;
    *)             printf '%s' "do \$\$ begin raise exception 'rôle inconnu du banc : $1'; end \$\$;" ;;
  esac
}
# Exécute du SQL sous une identité CLIENTE. Rend « OK », « <SQLSTATE> <message> »
# de la première erreur, ou « ECHEC_PSQL … » — jamais « OK » sans que psql ait réussi.
SOUS() {  # $1 base, $2 rôle, $3 sub, $4 SQL
  local sortie code=0
  sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "$(PRE "$2" "$3") $4" 2>&1)" || code=$?
  if printf '%s\n' "$sortie" | grep -q '^ERROR:'; then
    printf '%s\n' "$sortie" | grep -m1 '^ERROR:' | sed -E 's/^ERROR: +([0-9A-Z]{5}): /\1 /'
  elif [ "$code" -ne 0 ] || printf '%s\n' "$sortie" | grep -qE '(^|: )(FATAL|PANIC):|psql: error'; then
    printf 'ECHEC_PSQL (sortie %s) %s\n' "$code" "$(printf '%s' "$sortie" | head -1)"
  else
    echo OK
  fi
}
# Une LECTURE sous une identité cliente : sa sortie (lignes de commande ôtées), ou « ECHEC_PSQL … ».
LIT() {  # $1 base, $2 rôle, $3 sub, $4 SQL
  local sortie code=0
  sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$(PRE "$2" "$3") $4" 2>&1)" || code=$?
  if [ "$code" -ne 0 ] || printf '%s\n' "$sortie" | grep -qE '^(ERROR|FATAL|PANIC):|psql: error'; then
    printf 'ECHEC_PSQL (sortie %s) %s\n' "$code" "$(printf '%s' "$sortie" | grep -m1 -E '^(ERROR|FATAL|PANIC|psql)' || printf '%s' "$sortie" | head -1)"
  else
    printf '%s\n' "$sortie" | grep -vE '^(INSERT|UPDATE|DELETE) [0-9]' || true
  fi
}
# Applique un fichier à une base, instruction par instruction (psql -f) : le tableau
# de verdict, une ligne « contrôle§valeur » par contrôle, ou l'erreur qui a tout arrêté.
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -F '§' -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f "$2" 2>&1; }
# …ou en UNE requête simple, la forme de l'API de gestion et de l'éditeur SQL.
APPLIQUER_REQUETE() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -F '§' -q -v VERBOSITY=verbose -c "$(cat "$2")" 2>&1; }
compte_verdict() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -c '§OK$' || true)" "$(printf '%s\n' "$1" | grep -c '§ECHEC' || true)"; }
# Le vecteur des lignes du verdict, dans l'ordre : O = OK, E = ECHEC.
vecteur() { printf '%s\n' "$1" | grep '§' | awk -F'§' '{ v = $NF; if (v ~ /^OK$/) printf "O"; else if (v ~ /^ECHEC/) printf "E"; else printf "?" }'; }
ligne() { printf '%s\n' "$1" | grep '§' | sed -n "${2}p" | awk -F'§' '{ print $NF }'; }
# Une migration REFUSÉE par son garde-fou : « REFUSEE <SQLSTATE> lignes <n,…> », sinon « APPLIQUEE ».
REFUS() {
  local e
  e="$(printf '%s\n' "$1" | grep -m1 'ERROR: ' || true)"
  if [ -z "$e" ]; then echo APPLIQUEE; return 0; fi
  printf 'REFUSEE %s lignes %s\n' "$(printf '%s' "$e" | grep -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || echo '?')" \
    "$(printf '%s' "$e" | grep -oE 'Lignes en échec : [0-9,]+' | grep -oE '[0-9,]+$' || echo '-')"
}
# Le retour arrière de la migration (les lignes « --| »).
RETOUR_ARRIERE() { sed -n -e 's/^--| //p' -e 's/^--|$//p' "$MIGRATION"; }
MD5_FONCTION() { QD "${2:-$DB}" "select coalesce((select md5(replace(prosrc, chr(13) || chr(10), chr(10))) from pg_proc where oid = to_regprocedure('$1')), '-');"; }
MD5_POLICY_SELECT() { QD "${1:-$DB}" "select coalesce((select md5(regexp_replace(pg_get_expr(polqual, polrelid), '\\mpublic\\.', '', 'g')) from pg_policy where polrelid = 'public.conv_members'::regclass and polname = 'conv_members_select_member'), '-');"; }
ACL_FONCTION() { QD "${1:-$DB}" "select coalesce((select string_agg(x.d, ',' order by x.d collate \"C\") from (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' || a.privilege_type as d from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid = 'public.is_conv_member(text,text)'::regprocedure) x), '-');"; }
# L'état de la base vis-à-vis du correctif : « <md5 du corps>|<md5 de la policy>|<ACL> ».
ETAT() { printf '%s|%s|%s' "$(MD5_FONCTION "public.is_conv_member(text,text)" "$1")" "$(MD5_POLICY_SELECT "$1")" "$(ACL_FONCTION "$1")"; }
INCHANGEE="$MD5_FONCTION_PROD|$MD5_POLICY_C04|$ACL_PROD"
nouvelle_base() { QD postgres "create database $1 template avant" >/dev/null; }
TOUT_VERT="$(printf 'O%.0s' $(seq 1 17))"
vec_sauf() { local v="$TOUT_VERT" p; for p in "$@"; do v="${v:0:$((p-1))}E${v:$p}"; done; printf '%s' "$v"; }

K=11111111-1111-4111-8111-111111111111   # auteur de l'activité, créateur de sa discussion ; a bloqué W
B=22222222-2222-4222-8222-222222222222   # venant, entre de lui-même dans la discussion ; W l'a bloqué
C=33333333-3333-4333-8333-333333333333   # « peut-être » : jamais membre de la discussion
W=44444444-4444-4444-8444-444444444444   # venant, membre ; bloqué par K APRÈS être entré
X=55555555-5555-4555-8555-555555555555   # tiers connecté, sans aucun lien — l'attaquant de R41
D=66666666-6666-4666-8666-666666666666   # crée un groupe ordinaire avec B et W, et une conversation 1-à-1 avec B
TOUS="$K $B $C $W $X $D"
EVGRP=evgrp_ev_r41
GRP=grp_bdw
UNA=conv_bd_1a1   # conversation 1-à-1 (is_group faux) entre D et B : un oracle laissé ouvert sur les `conv_…` se verrait
LETTRES="translate(substr(user_id, 1, 1), '123456', 'KBCWXD')"
REFUS_RLS='42501 new row violates row-level security policy'

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# Les membres de `$3` que `$2` voit (lettres), sous le rôle `$1` (authenticated par défaut).
MEMBRES() { LIT "$1" "${4:-authenticated}" "$2" "select coalesce(string_agg($LETTRES, ',' order by $LETTRES), '') from public.conv_members where conv_id = '$3';"; }
# Ce que `$2` (sous le rôle `$3`) apprend d'is_conv_member sur `$4` pour chacun des six comptes : les lettres des « membres ».
ORACLE() {  # $1 base, $2 sub, $3 rôle, $4 conversation
  local sql="select coalesce(string_agg(translate(substr(u, 1, 1), '123456', 'KBCWXD'), ',' order by translate(substr(u, 1, 1), '123456', 'KBCWXD')) filter (where public.is_conv_member('$4', u)), '') from unnest(array['$K','$B','$C','$W','$X','$D']) u;"
  if [ "$3" = "sans_session" ]; then QD "$1" "$sql"; else LIT "$1" "$3" "$2" "$sql"; fi
}
# Les LECTURES de conv_members (pg_stat_xact_user_tables : seq_scan + idx_scan, compteurs
# de la transaction) pendant 50 appels d'is_conv_member('$4', u) pour chaque uid u donné,
# sous l'identité `$3` (rôle `$2`) — appel PAR LIGNE (agrégat FILTER), dans un bloc DO.
LECTURES() {  # $1 base, $2 rôle, $3 sub, $4 conversation, $5… uids visés
  local b="$1" r="$2" sub="$3" conv="$4" appels="" u
  shift 4
  for u in "$@"; do appels+="perform count(*) filter (where public.is_conv_member('$conv', '$u')) from generate_series(1, 50); "; done
  LIT "$b" "$r" "$sub" "do \$\$ begin $appels end \$\$; select coalesce(seq_scan, 0) + coalesce(idx_scan, 0) from pg_stat_xact_user_tables where relid = 'public.conv_members'::regclass;"
}

# ── LES RÔLES DE LA PRODUCTION ──────────────────────────────────────────────
psql -h "$BASE" -p "$PORT" -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role postgres login nosuperuser bypassrls createrole createdb inherit;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres with admin true, inherit true, set true;
alter role postgres set search_path to "$user", public, extensions;
create database socle owner postgres;
SQL

# ── LE SOCLE : la production du 2026-11-06, bâtie par `postgres` ────────────
psql -h "$BASE" -p "$PORT" -U postgres -d socle -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema auth;
create schema realtime;
create schema storage;
create schema banc;
grant usage on schema public, auth, realtime, storage to anon, authenticated, service_role;
-- Les droits par défaut du projet (pg_default_acl, propriétaire postgres, schéma
-- public) : toute fonction neuve est exécutable par anon, authenticated,
-- service_role — et PUBLIC. Toute table : arwd pour les rôles clients.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

-- ── Tables (colonnes de production, pg_attribute, 2026-11-06) ──
create table public.profiles (id text primary key, username text not null, emoji text default '✨', color text default '#8b5cf6',
  passion_id text, bio text, created_at timestamp default now(), avatar_url text, cover_url text, passions jsonb default '[]'::jsonb,
  is_private boolean not null default false, rs_links jsonb);
create table public.conversations (id text primary key, is_group boolean default false, group_name text, passion_id text,
  created_by text, created_at timestamp default now(), description text);
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null references public.profiles(id),
  rid bigint not null default (((('x'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 17, 16)))::bit(64))::bigint & '9007199254740991'::bigint),
  primary key (conv_id, user_id));
create table public.conv_messages (id text primary key, conv_id text references public.conversations(id), from_id text references public.profiles(id),
  content text, created_at timestamp default now());
create table public.conv_reads (conv_id text not null, user_id text not null, last_read_at timestamptz not null default now(),
  rid bigint not null default (((('x'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 17, 16)))::bit(64))::bigint & '9007199254740991'::bigint),
  primary key (conv_id, user_id));
create table public.blocks (blocker_id text not null, blocked_id text not null, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create table public.reports (id text primary key, reporter_id text, target_type text, target_id text, reason text,
  created_at timestamptz default now(), status text not null default 'open', handled_at timestamptz, handled_note text,
  constraint reports_status_chk check (status = any (array['open'::text, 'handled'::text, 'dismissed'::text])),
  constraint reports_target_type_chk check (target_type is null or target_type = any (array['user'::text, 'post'::text, 'comment'::text, 'event'::text, 'passion'::text, 'message'::text, 'story'::text])));
create table public.signalements_preuves (report_id text primary key references public.reports(id) on delete cascade, message_id text not null,
  conv_id text, auteur_id text, contenu text, envoye_le timestamp, copie_le timestamptz not null default now());
create table public.comptes_en_suppression (user_id text primary key, statut text not null default 'en_cours');
-- Lues par can_join_event_conversation / organise_activite (SECURITY DEFINER) seulement : sans RLS ici.
create table public.events (id text primary key, author_id text not null, organizer_id text, status text not null default 'active',
  date_at timestamp, end_at timestamp, co_organizers jsonb not null default '[]', conv_id text);
create table public.event_attendees (event_id text not null references public.events(id), user_id text not null, rsvp text not null default 'going',
  created_at timestamptz default now(), checked_in_at timestamp, primary key (event_id, user_id));
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast',
  payload jsonb, event text, private boolean default false, inserted_at timestamp not null default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
-- Ce que la base a POUSSÉ (realtime.send factice) : une ligne par poussée.
create table banc.poussees (topic text, event text, payload jsonb, private boolean, quand timestamptz default clock_timestamp());

-- Droits de table (relacl de production, 2026-11-06).
revoke all on public.profiles, public.conversations, public.conv_members, public.conv_messages, public.conv_reads, public.blocks,
  public.reports, public.signalements_preuves, public.comptes_en_suppression, public.events, public.event_attendees from anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.conv_reads, public.blocks, public.reports to anon, authenticated;
grant select, update, delete on public.conversations, public.conv_members, public.conv_messages to anon;
grant select, insert, update, delete on public.conversations, public.conv_members, public.conv_messages to authenticated;
grant all on public.profiles, public.conversations, public.conv_members, public.conv_messages, public.conv_reads, public.blocks, public.reports to service_role;
grant select, delete on public.signalements_preuves to service_role;
grant select, insert, update on realtime.messages to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.objects to service_role;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conv_members enable row level security;
alter table public.conv_messages enable row level security;
alter table public.conv_reads enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.signalements_preuves enable row level security;
alter table public.comptes_en_suppression enable row level security;
alter table realtime.messages enable row level security;
alter table storage.objects enable row level security;

-- ── Fonctions : définitions de PRODUCTION (pg_get_functiondef, 2026-11-06 ; CRLF → LF) ──
CREATE OR REPLACE FUNCTION realtime.topic()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
select nullif(current_setting('realtime.topic', true), '')::text;
$function$;
-- realtime.send FACTICE : la forme de production (topic posé en local, ligne dans
-- realtime.messages, une panne n'est qu'un avertissement), et la poussée consignée.
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $fn$
begin
  begin
    execute format('SET LOCAL realtime.topic TO %L', topic);
    insert into realtime.messages (payload, event, topic, private, extension) values (payload, event, topic, private, 'broadcast');
    insert into banc.poussees (topic, event, payload, private) values (topic, event, payload, private);
  exception when others then
    raise warning 'WarnSendingBroadcastMessage: %', sqlerrm;
  end;
end $fn$;
CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$;

CREATE OR REPLACE FUNCTION public.is_conv_member(_conv_id text, _uid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $function$;
CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conv_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.conversations c
       WHERE c.id = _conv_id
         AND c.created_by = (auth.uid())::text
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.blocks b
       WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
          OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.conv_1a1_bloquee(_conv_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.conv_members m
    join public.conversations c on c.id = m.conv_id
    where m.conv_id = _conv_id
      and coalesce(c.is_group, false) = false
      and m.user_id <> (select auth.uid())::text
      and public.is_blocked_with(m.user_id));
$function$;
create function public.adult_access_enforced() returns boolean language sql stable as $fn$ select false $fn$;
create function public.is_adult_declared() returns boolean language sql stable as $fn$ select true $fn$;
CREATE OR REPLACE FUNCTION public.adult_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    WHEN NOT public.adult_access_enforced() THEN TRUE
    ELSE public.is_adult_declared()
  END
$function$;
CREATE OR REPLACE FUNCTION public.organise_activite(p_event_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text))
  );
$function$;
CREATE OR REPLACE FUNCTION public.can_join_event_conversation(_conv_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.events e
        JOIN public.event_attendees a
          ON a.event_id = e.id
         AND a.user_id = (auth.uid())::text
        JOIN public.conversations c
          ON c.id = e.conv_id
       WHERE e.conv_id = _conv_id
         AND e.conv_id = ('evgrp_' || e.id)
         -- IRL-10 : l'auteur OU un co-organisateur a pu créer la discussion.
         AND (c.created_by = e.author_id
              OR (e.co_organizers IS NOT NULL
                  AND jsonb_typeof(e.co_organizers) = 'array'
                  AND e.co_organizers ? c.created_by))
         AND e.status = 'active'
         -- C-04 : « going » seul, ou l'organisation — jamais « maybe ».
         AND (a.rsvp = 'going' OR public.organise_activite(e.id))
         AND NOT public.is_blocked_with(e.author_id)
         AND public.adult_access_allowed()
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.suppression_de_mon_compte()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then false          -- postgres, service_role, purge, restauration
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text
                    and c.statut in ('en_cours', 'purgee', 'supprimee'))
  end
$function$;
CREATE OR REPLACE FUNCTION public.refuser_ecriture_compte_en_suppression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  col   text;
  val   text;
  ligne jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := ligne ->> col;
    if val is not null and exists (
         select 1 from public.comptes_en_suppression c
          where c.user_id = val and c.statut in ('en_cours', 'purgee', 'supprimee'))
    then
      raise exception 'new row violates row-level security policy for table "%"', tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.storage_chemin_autorise(_bucket text, _name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    (_bucket = 'content'
      and (storage.foldername(_name))[2] = (select auth.uid())::text)
    or
    -- `is_conv_member` est SECURITY DEFINER (vérifié). Un `select … from
    -- conv_members` serait soumis à la RLS de cette table DANS la sous-requête :
    -- une policy de lecture plus stricte demain renverrait un ensemble vide,
    -- c'est-à-dire les pièces jointes cassées pour tous, sans un mot en journal.
    (_bucket = 'attachments'
      and public.is_conv_member((storage.foldername(_name))[2], (select auth.uid())::text));
$function$;
CREATE OR REPLACE FUNCTION public.trg_reports_preuve_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  begin
    insert into public.signalements_preuves (report_id, message_id, conv_id, auteur_id, contenu, envoye_le)
    select new.id, m.id, m.conv_id, m.from_id, m.content, m.created_at
      from public.conv_messages m
     where m.id = new.target_id
       and new.reporter_id is not null
       and public.is_conv_member(m.conv_id, new.reporter_id)
    on conflict (report_id) do nothing;
  exception when others then
    -- Le signalement passe quoi qu'il arrive ; l'absence de preuve, elle, se DIT.
    raise warning 'signalements_preuves : preuve non copiée pour le signalement % (SQLSTATE %, %)', new.id, sqlstate, sqlerrm;
  end;
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.reports_statut_initial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.status := 'open';
  new.handled_at := null;
  new.handled_note := null;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.diffuser_ajout_membre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.user_id is null
     or new.user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', 'conv_members',
        'operation', 'INSERT',
        'record', jsonb_build_object('conv_id', new.conv_id, 'user_id', new.user_id)
      ),
      'conv_members:INSERT',
      'user:' || new.user_id,
      true
    );
  exception when others then
    raise warning 'diffuser_ajout_membre : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rid_opaque_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- `rid` n'appartient qu'à la base. Un INSERT reçoit TOUJOURS une valeur
  -- aléatoire neuve — l'expression du défaut de colonne, recopiée : une valeur
  -- fournie par l'appelant (client, upsert, PostgREST) est ignorée, aucun
  -- appelant ne connaît le rid d'une ligne qu'il ne lit pas. Un UPDATE ne le
  -- change jamais.
  if tg_op = 'INSERT' then
    new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
  else
    new.rid := old.rid;
  end if;
  return new;
end
$function$;
-- Les déclencheurs BEFORE de conv_messages (canal ①, 2026-11-06 vers 15:00 UTC) :
-- le message refusé du témoin négatif du verdict passe par eux avant la WITH CHECK.
CREATE OR REPLACE FUNCTION public.rate_limit_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  user_col    text := TG_ARGV[0];
  max_per_min int  := TG_ARGV[1]::int;
  uid         text;
  cnt         int;
BEGIN
  NEW.created_at := now();
  EXECUTE format('SELECT ($1).%I', user_col) INTO uid USING NEW;
  IF uid IS NULL THEN RETURN NEW; END IF;
  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - interval ''1 minute''',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, user_col
  ) INTO cnt USING uid;
  IF cnt >= max_per_min THEN
    RAISE EXCEPTION 'rate limit: max % insertions/minute sur %', max_per_min, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.identifiants_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare col text; avant text; apres text;
begin
  foreach col in array TG_ARGV loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into avant, apres using old, new;
    if avant is distinct from apres then
      raise exception '% : la colonne % ne se modifie pas', TG_TABLE_NAME, col using errcode = '42501';
    end if;
  end loop;
  return new;
end $function$;

-- Les droits d'EXÉCUTION mesurés (proacl, 2026-11-06).
revoke all on function public.is_conv_member(text, text) from public, anon;
grant execute on function public.is_conv_member(text, text) to authenticated, service_role;
revoke all on function public.is_conversation_creator(text), public.is_blocked_with(text), public.conv_1a1_bloquee(text),
  public.can_join_event_conversation(text), public.adult_access_allowed(), public.organise_activite(text) from public, anon;
revoke all on function public.trg_reports_preuve_message(), public.reports_statut_initial(), public.diffuser_ajout_membre(),
  public.rid_opaque_garde(), public.refuser_ecriture_compte_en_suppression(), public.rate_limit_insert(),
  public.identifiants_figes() from public, anon, authenticated;
revoke all on function public.suppression_de_mon_compte() from public;

-- ── Policies : textes de PRODUCTION (pg_policies, 2026-11-06) ──
create policy profiles_lecture_banc on public.profiles for select using (true);   -- simplifiée (hors objet)
create policy "Ecriture propre" on public.conv_members for insert to authenticated
  with check ((public.is_conversation_creator(conv_id) or ((user_id = (select auth.uid())::text) and public.can_join_event_conversation(conv_id)))
    and (not public.is_blocked_with(user_id)) and (not public.suppression_de_mon_compte()));
create policy "Suppression admin" on public.conv_members for delete
  using ((user_id = (select auth.uid())::text) or (exists (select 1 from public.conversations c
    where ((c.id = conv_members.conv_id) and (c.created_by = (select auth.uid())::text)))));
-- La policy SELECT telle que C-04 l'a laissée (06/11, 09:17 UTC).
create policy conv_members_select_member on public.conv_members
  for select to authenticated
  using (
    public.is_conv_member(conv_id, (select auth.uid())::text)
    and (
      left(conv_id, 6) <> 'evgrp_'
      or user_id = (select auth.uid())::text
      or not public.is_blocked_with(conv_members.user_id)
    )
  );
create policy "Suppression propre" on public.conv_messages for delete using ((from_id = (select auth.uid())::text));
create policy "Update propre" on public.conv_messages for update to authenticated
  using ((from_id = (select auth.uid())::text))
  with check (((from_id = (select auth.uid())::text) and public.is_conv_member(conv_id, (select auth.uid())::text)
    and (not public.conv_1a1_bloquee(conv_id)) and (not public.suppression_de_mon_compte())));
create policy conv_messages_insert_member on public.conv_messages for insert to authenticated
  with check (((from_id = (select auth.uid())::text) and public.is_conv_member(conv_id, (select auth.uid())::text)
    and (not public.conv_1a1_bloquee(conv_id)) and (not public.suppression_de_mon_compte())));
create policy conv_messages_select_member on public.conv_messages for select to authenticated
  using ((public.is_conv_member(conv_id, (select auth.uid())::text) and (not public.is_blocked_with(from_id))));
create policy reads_select on public.conv_reads for select to authenticated using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy reads_update on public.conv_reads for update to authenticated
  using ((user_id = (select auth.uid())::text))
  with check (((user_id = (select auth.uid())::text) and public.is_conv_member(conv_id, (select auth.uid())::text) and (not public.suppression_de_mon_compte())));
create policy reads_upsert on public.conv_reads for insert to authenticated
  with check (((user_id = (select auth.uid())::text) and public.is_conv_member(conv_id, (select auth.uid())::text) and (not public.suppression_de_mon_compte())));
create policy "Suppression conversation orpheline" on public.conversations for delete
  using (((created_by = (select auth.uid())::text) and (not (exists (select 1 from public.conv_members m where (m.conv_id = conversations.id))))));
create policy conversations_insert_creator on public.conversations for insert to authenticated with check ((created_by = (select auth.uid())::text));
create policy conversations_select_member on public.conversations for select to authenticated using (public.is_conv_member(id, (select auth.uid())::text));
create policy blocks_delete_own on public.blocks for delete using ((blocker_id = (select auth.uid())::text));
create policy blocks_insert_own on public.blocks for insert with check (((blocker_id = (select auth.uid())::text) and (not public.suppression_de_mon_compte())));
create policy blocks_select_own on public.blocks for select using ((blocker_id = (select auth.uid())::text));
create policy reports_insert on public.reports for insert with check ((reporter_id = (select auth.uid())::text));
create policy "Utilisateur reçoit ses messages" on realtime.messages for select to authenticated
  using ((realtime.topic() = ('user:'::text || (select auth.uid())::text)));
create policy passio_rt_emettre on realtime.messages for insert to authenticated
  with check (((realtime.topic() ~~ 'call:%'::text) or (realtime.topic() ~~ 'vlive:%'::text)
    or ((realtime.topic() ~~ 'typing:%'::text) and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
    or ((realtime.topic() ~~ 'conv:%'::text) and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))));
create policy passio_rt_recevoir on realtime.messages for select to authenticated
  using ((((realtime.topic() ~~ 'ring:%'::text) and (substr(realtime.topic(), 6) = (select auth.uid())::text))
    or (realtime.topic() ~~ 'call:%'::text) or (realtime.topic() ~~ 'vlive:%'::text) or (realtime.topic() = 'realtime:db'::text)
    or ((realtime.topic() ~~ 'typing:%'::text) and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
    or ((realtime.topic() ~~ 'conv:%'::text) and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
    or ((realtime.topic() ~~ 'conv_specific:%'::text) and public.is_conv_member(substr(realtime.topic(), 15), (select auth.uid())::text))));
create policy passio_rt_recevoir_visiteur on realtime.messages for select to anon using ((realtime.topic() = 'realtime:db'::text));
create policy passio_attachments_read_membre on storage.objects for select to authenticated
  using (((bucket_id = 'attachments'::text) and public.is_conv_member((storage.foldername(name))[2], (select auth.uid())::text)));
create policy passio_media_insert_cloisonne on storage.objects for insert to authenticated
  with check ((public.storage_chemin_autorise(bucket_id, name) and (not public.suppression_de_mon_compte())));
create policy passio_media_update_cloisonne on storage.objects for update to authenticated
  using (((bucket_id = any (array['content'::text, 'attachments'::text])) and (owner = (select auth.uid()))))
  with check ((public.storage_chemin_autorise(bucket_id, name) and (not public.suppression_de_mon_compte())));

-- ── Déclencheurs de production (pg_get_triggerdef, 2026-11-06) ──
create trigger trg_diffuser_ajout_membre after insert on public.conv_members for each row execute function public.diffuser_ajout_membre();
create trigger trg_rid_opaque before insert or update of rid on public.conv_members for each row execute function public.rid_opaque_garde();
create trigger zz_barriere_suppression before insert or update on public.conv_members for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger trg_rid_opaque before insert or update of rid on public.conv_reads for each row execute function public.rid_opaque_garde();
create trigger zz_barriere_suppression before insert or update on public.conv_reads for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger zz_barriere_suppression before insert or update on public.profiles for each row execute function public.refuser_ecriture_compte_en_suppression('id');
create trigger zz_barriere_suppression before insert or update on public.blocks for each row execute function public.refuser_ecriture_compte_en_suppression('blocked_id', 'blocker_id');
create trigger trg_rate_limit before insert on public.conv_messages for each row execute function public.rate_limit_insert('from_id', '60');
create trigger zz_barriere_suppression before insert or update on public.conv_messages for each row execute function public.refuser_ecriture_compte_en_suppression('from_id');
create trigger trg_identifiants_figes before update on public.conv_messages for each row execute function public.identifiants_figes('conv_id', 'from_id');
create trigger trg_reports_statut_initial before insert on public.reports for each row execute function public.reports_statut_initial();
create trigger trg_reports_preuve_message after insert on public.reports for each row when ((new.target_type = 'message'::text))
  execute function public.trg_reports_preuve_message();
SQL

echo "── ⓪ LE SOCLE EST LA PRODUCTION, ET LE BANC NE MENT PAS ─────────────"
for f in "${!MD5_PROD[@]}"; do
  verifier "$f : la définition de production, à l'octet (md5 du corps)" "${MD5_PROD[$f]}" "$(MD5_FONCTION "$f" socle)"
done
for p in "${!MD5_POLICIES_PROD[@]}"; do
  tbl="${p%%·*}"; nom="${p#*·}"
  verifier "policy $p : le déparsage de production (md5)" "${MD5_POLICIES_PROD[$p]}" \
    "$(QD socle "select coalesce((select md5(regexp_replace(coalesce(pg_get_expr(polqual, polrelid), '') || '#' || coalesce(pg_get_expr(polwithcheck, polrelid), ''), '\\mpublic\\.', '', 'g')) from pg_policy where polrelid = '$tbl'::regclass and polname = '$nom'), '-');")"
done
verifier "conv_members_select_member (qual seul, la mesure du canal ①) : md5 de C-04, de15394b…, ici comme en production (PostgreSQL 17.6)" "$MD5_POLICY_C04" "$(MD5_POLICY_SELECT socle)"
verifier "is_conv_member : EXECUTE pour postgres, authenticated, service_role — ni PUBLIC ni anon (comme en production)" "$ACL_PROD" "$(ACL_FONCTION socle)"
verifier "le rôle de la migration est celui de la production : postgres, NI superutilisateur, BYPASSRLS, membre (SET) d'anon, authenticated, service_role" \
  "f|t|anon,authenticated,service_role" \
  "$(QD socle "select case when r.rolsuper then 't' else 'f' end || '|' || case when r.rolbypassrls then 't' else 'f' end || '|' || (select string_agg(m.roleid::regrole::text, ',' order by m.roleid::regrole::text) from pg_auth_members m where m.member = r.oid and m.set_option) from pg_roles r where r.rolname = current_user;")"
verifier "…et son search_path de production" '"$user", public, extensions' "$(QD socle "show search_path;")"
contient "le banc lui-même : SOUS sur une base INEXISTANTE ne rend pas « OK »" "^ECHEC_PSQL" "$(SOUS base_inexistante authenticated "$K" "select 1;")"
contient "…LIT non plus" "^ECHEC_PSQL" "$(LIT base_inexistante authenticated "$K" "select 1;")"
verifier "…et une erreur SQL rend son SQLSTATE et son message" "22012 division by zero" "$(SOUS socle authenticated "$K" "select 1/0;")"

# ── LE DÉCOR DU BANC, posé par les GESTES DU CLIENT (sous leurs identités) ──
QD postgres "create database avant template socle" >/dev/null
QD avant "insert into public.profiles (id, username) select u, 'banc-' || substr(u, 1, 1) from unnest(array['$K','$B','$C','$W','$X','$D']) u;" >/dev/null
QD avant "insert into public.events (id, author_id, status, date_at, conv_id) values ('ev_r41', '$K', 'active', now() + interval '2 days', '$EVGRP');
          insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_r41', '$B', 'going'), ('ev_r41', '$C', 'maybe'), ('ev_r41', '$W', 'going');" >/dev/null
verifier "K (auteur) crée la discussion de son activité et y entre (le geste du client)" "OK|OK" \
  "$(SOUS avant authenticated "$K" "insert into public.conversations (id, is_group, group_name, created_by) values ('$EVGRP', true, 'Rando', '$K');")|$(SOUS avant authenticated "$K" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$K');")"
verifier "B et W, venants, y entrent d'eux-mêmes (« je viens » : can_join_event_conversation)" "OK|OK" \
  "$(SOUS avant authenticated "$B" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$B');")|$(SOUS avant authenticated "$W" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$W');")"
contient "C (« peut-être ») n'y entre pas" "row-level security" "$(SOUS avant authenticated "$C" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$C');")"
verifier "D crée un groupe ordinaire et y ajoute B et W (créateur)" "OK|OK" \
  "$(SOUS avant authenticated "$D" "insert into public.conversations (id, is_group, group_name, created_by) values ('$GRP', true, 'Groupe', '$D');")|$(SOUS avant authenticated "$D" "insert into public.conv_members (conv_id, user_id) values ('$GRP', '$D'), ('$GRP', '$B'), ('$GRP', '$W');")"
verifier "D ouvre une conversation 1-à-1 avec B (is_group faux)" "OK|OK" \
  "$(SOUS avant authenticated "$D" "insert into public.conversations (id, is_group, created_by) values ('$UNA', false, '$D');")|$(SOUS avant authenticated "$D" "insert into public.conv_members (conv_id, user_id) values ('$UNA', '$D'), ('$UNA', '$B');")"
verifier "K bloque W, W bloque B (après leur entrée)" "OK|OK" \
  "$(SOUS avant authenticated "$K" "insert into public.blocks (blocker_id, blocked_id) values ('$K', '$W');")|$(SOUS avant authenticated "$W" "insert into public.blocks (blocker_id, blocked_id) values ('$W', '$B');")"
QD avant "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_k1', '$EVGRP', '$K', 'Rendez-vous à 9 h'), ('m_b1', '$EVGRP', '$B', 'Je serai là'), ('m_w1', '$EVGRP', '$W', 'Moi aussi'), ('m_d1', '$GRP', '$D', 'Salut'), ('m_bd1', '$UNA', '$D', 'Coucou');
          insert into public.conv_reads (conv_id, user_id) values ('$EVGRP', '$K');
          insert into realtime.messages (topic, extension, payload) values ('conv:$EVGRP', 'broadcast', '{}'), ('typing:$EVGRP', 'broadcast', '{}'), ('conv_specific:$EVGRP', 'broadcast', '{}');
          insert into storage.objects (bucket_id, name, owner) values ('attachments', '$K/$EVGRP/photo.jpg', '$K');" >/dev/null
verifier "trg_diffuser_ajout_membre a poussé chaque entrée à user:<membre> (le realtime.send factice consigne : 8 poussées)" "8" \
  "$(QD avant "select count(*) from banc.poussees where event = 'conv_members:INSERT' and topic like 'user:%';")"

echo "── ⓪bis LE DÉFAUT, MESURÉ AVANT, sur la production ────────────────────"
verifier "R41 : X, connecté et sans lien, reconstitue par is_conv_member les membres de la discussion de l'activité — K, B et W : qui vient" "B,K,W" \
  "$(ORACLE avant "$X" authenticated "$EVGRP")"
verifier "…et C-02 hors activité : qui est dans le groupe de D" "B,D,W" "$(ORACLE avant "$X" authenticated "$GRP")"
verifier "…et qui parle avec qui dans une conversation 1-à-1" "B,D" "$(ORACLE avant "$X" authenticated "$UNA")"
verifier "le corps de production LIT conv_members à chaque appel sur autrui : 100 lectures pour 50 appels de X sur B (membre) et 50 sur C (non-membre)" "100" \
  "$(LECTURES avant authenticated "$X" "$EVGRP" "$B" "$C")"
verifier "…alors que la ligne elle-même lui est fermée (conv_members : 0 ligne)" "" "$(MEMBRES avant "$X" "$EVGRP")"
verifier "…même par la forme de PostgREST 12 (request.jwt.claims seul)" "B,K,W" "$(ORACLE avant "$X" claims_seuls "$EVGRP")"
verifier "RV-44 : K, créateur, ne voit pas W, qu'il a bloqué — B et lui seulement" "B,K" "$(MEMBRES avant "$K" "$EVGRP")"
verifier "…et son DELETE … RETURNING (removeGroupMember) touche 0 ligne : W reste membre" "|1" \
  "$(LIT avant authenticated "$K" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$W' returning user_id;")|$(QD avant "select count(*) from public.conv_members where conv_id = '$EVGRP' and user_id = '$W';")"
verifier "C-04 : B (que W a bloqué) ne voit pas W ; W ne voit que lui-même" "B,K|W" "$(MEMBRES avant "$B" "$EVGRP")|$(MEMBRES avant "$W" "$EVGRP")"
verifier "…mais dans le groupe ordinaire, B et W se voient" "B,D,W" "$(MEMBRES avant "$B" "$GRP")"
DROITS_TABLES_AVANT="$(QD avant "select string_agg(c.oid::regclass::text || '=' || coalesce(c.relacl::text, '-'), ';' order by c.oid::regclass::text) from pg_class c where c.oid in ('public.conv_members'::regclass, 'public.conversations'::regclass, 'public.conv_messages'::regclass, 'public.conv_reads'::regclass, 'realtime.messages'::regclass, 'storage.objects'::regclass);")"

# Les 11 policies et storage_chemin_autorise, SIGNATURE de leurs effets — mesurée
# AVANT (base de production) et APRÈS (même base, migration appliquée).
signature_policies() {  # $1 base ; rend une ligne, une mesure par « | »
  local b="$1" s=""
  s+="$(MEMBRES "$b" "$B" "$EVGRP")|$(MEMBRES "$b" "$B" "$GRP")|$(MEMBRES "$b" "$X" "$EVGRP")|$(MEMBRES "$b" "$D" "$GRP")"
  s+="|$(LIT "$b" authenticated "$B" "select count(*) from public.conversations where id in ('$EVGRP', '$GRP');")|$(LIT "$b" authenticated "$X" "select count(*) from public.conversations;")"
  s+="|$(LIT "$b" authenticated "$B" "select string_agg(id, ',' order by id) from public.conv_messages;")|$(LIT "$b" authenticated "$X" "select count(*) from public.conv_messages;")"
  s+="|$(SOUS "$b" authenticated "$B" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_b2', '$EVGRP', '$B', 'Et un');")"
  s+="|$(SOUS "$b" authenticated "$X" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_x1', '$EVGRP', '$X', 'Intrus');" | cut -c1-5)"
  s+="|$(LIT "$b" authenticated "$B" "update public.conv_messages set content = 'Je serai là, à l''heure' where id = 'm_b1' returning id;")"
  s+="|$(LIT "$b" authenticated "$X" "update public.conv_messages set content = 'x' where id = 'm_b1' returning id;")"
  s+="|$(SOUS "$b" authenticated "$B" "insert into public.conv_reads (conv_id, user_id) values ('$EVGRP', '$B');")"
  s+="|$(SOUS "$b" authenticated "$X" "insert into public.conv_reads (conv_id, user_id) values ('$EVGRP', '$X');" | cut -c1-5)"
  s+="|$(LIT "$b" authenticated "$B" "update public.conv_reads set last_read_at = now() where conv_id = '$EVGRP' and user_id = '$B' returning $LETTRES;")"
  s+="|$(LIT "$b" authenticated "$B" "select string_agg($LETTRES, ',' order by $LETTRES) from public.conv_reads;")|$(LIT "$b" authenticated "$X" "select count(*) from public.conv_reads;")"
  for t in "conv:$EVGRP" "typing:$EVGRP" "conv_specific:$EVGRP"; do
    s+="|$(LIT "$b" authenticated "$B" "set local realtime.topic = '$t'; select count(*) from realtime.messages where topic = '$t';")"
    s+="|$(LIT "$b" authenticated "$X" "set local realtime.topic = '$t'; select count(*) from realtime.messages where topic = '$t';")"
  done
  for t in "typing:$EVGRP" "conv:$EVGRP"; do
    s+="|$(SOUS "$b" authenticated "$B" "set local realtime.topic = '$t'; insert into realtime.messages (topic, extension, payload) values ('$t', 'broadcast', '{}');")"
    s+="|$(SOUS "$b" authenticated "$X" "set local realtime.topic = '$t'; insert into realtime.messages (topic, extension, payload) values ('$t', 'broadcast', '{}');" | cut -c1-5)"
  done
  s+="|$(LIT "$b" authenticated "$B" "select count(*) from storage.objects where bucket_id = 'attachments';")|$(LIT "$b" authenticated "$X" "select count(*) from storage.objects where bucket_id = 'attachments';")"
  s+="|$(SOUS "$b" authenticated "$B" "insert into storage.objects (bucket_id, name, owner) values ('attachments', '$B/$EVGRP/b.jpg', '$B');")"
  s+="|$(SOUS "$b" authenticated "$X" "insert into storage.objects (bucket_id, name, owner) values ('attachments', '$X/$EVGRP/x.jpg', '$X');" | cut -c1-5)"
  s+="|$(LIT "$b" authenticated "$B" "update storage.objects set name = '$B/$EVGRP/b2.jpg' where name = '$B/$EVGRP/b.jpg' returning 1;")"
  # La conversation 1-à-1 : ses membres se voient et y écrivent ; X n'y voit ni n'écrit rien.
  s+="|$(MEMBRES "$b" "$B" "$UNA")|$(MEMBRES "$b" "$X" "$UNA")|$(LIT "$b" authenticated "$B" "select count(*) from public.conversations where id = '$UNA';")"
  s+="|$(SOUS "$b" authenticated "$B" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_bd2', '$UNA', '$B', 'Réponse');")"
  s+="|$(SOUS "$b" authenticated "$X" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_x2', '$UNA', '$X', 'Intrus');" | cut -c1-5)"
  printf '%s' "$s"
}
SIGNATURE_ATTENDUE="B,K|B,D,W||B,D,W|2|0|m_b1,m_bd1,m_d1,m_k1|0|OK|42501|m_b1||OK|42501|B|B,K|0|1|0|1|0|1|0|OK|42501|OK|42501|1|0|OK|42501|1|B,D||1|OK|42501"
QD postgres "create database sig_avant template avant" >/dev/null
SIG_AVANT="$(signature_policies sig_avant)"
verifier "les 11 policies et storage_chemin_autorise, AVANT (production) : membre lit, écrit, émet, dépose ; X rien — la signature de leurs effets" \
  "$SIGNATURE_ATTENDUE" "$SIG_AVANT"

# trg_reports_preuve_message, AVANT : rend « preuves copiées pour B (membre) | pour X (non-membre) | par service_role (sans identité) au nom de B ».
preuves() {  # $1 base
  local r1 r2 r3
  r1="$(SOUS "$1" authenticated "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('rep_b', '$B', 'message', 'm_k1', 'motif');")"
  r2="$(SOUS "$1" authenticated "$X" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('rep_x', '$X', 'message', 'm_k1', 'motif');")"
  r3="$(SOUS "$1" service_role "" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('rep_s', '$B', 'message', 'm_b1', 'motif');")"
  printf '%s,%s,%s|%s|%s|%s|%s' "$r1" "$r2" "$r3" \
    "$(QD "$1" "select count(*) from public.signalements_preuves where report_id = 'rep_b' and message_id = 'm_k1' and auteur_id = '$K' and contenu = 'Rendez-vous à 9 h';")" \
    "$(QD "$1" "select count(*) from public.signalements_preuves where report_id = 'rep_x';")" \
    "$(QD "$1" "select count(*) from public.signalements_preuves where report_id = 'rep_s' and message_id = 'm_b1';")" \
    "$(SOUS "$1" authenticated "$X" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('rep_usurpe', '$B', 'message', 'm_k1', 'motif');" | cut -c1-5)"
}
QD postgres "create database prv_avant template avant" >/dev/null
verifier "trg_reports_preuve_message, AVANT : B (membre) signale → preuve copiée ; X (non-membre) → signalement reçu, rien copié ; service_role au nom de B → preuve ; X au nom de B → refusé (reports_insert)" \
  "OK,OK,OK|1|0|1|42501" "$(preuves prv_avant)"

echo "── ① RÉINJECTION : la migration SANS sa correction, sur la production ──"
python3 -I - "$MIGRATION" "$SQLDIR/reinjecte.sql" "$SQLDIR/reinjecte_sans_gardefou.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
d1 = s.index("-- ── ① L'APPARTENANCE"); d3 = s.index("-- ── ③ LE COMPORTEMENT")
d5 = s.index("-- ── ⑤ FERMÉ SUR ÉCHEC"); dv = s.index("-- ── Verdict ──")
open(sys.argv[2], "w", encoding="utf-8").write(s[:d1] + s[d3:])
open(sys.argv[3], "w", encoding="utf-8").write(s[:d1] + s[d3:d5] + s[dv:])
PY
chmod 644 "$SQLDIR/reinjecte.sql" "$SQLDIR/reinjecte_sans_gardefou.sql"
nouvelle_base reinjecte; nouvelle_base reinjecte_vue
sortie_r="$(APPLIQUER reinjecte "$SQLDIR/reinjecte.sql" || true)"
verifier "réinjection : son garde-fou la REFUSE (55000) — l'oracle (2, 4), le créateur (6, 7), le corps (11) et la policy (13)" \
  "REFUSEE 55000 lignes 2,4,6,7,11,13" "$(REFUS "$sortie_r")"
verifier "…et RIEN n'est appliqué : la base est celle d'avant (corps de production, policy de C-04, droits)" "$INCHANGEE" "$(ETAT reinjecte)"
sortie_r="$(APPLIQUER reinjecte_vue "$SQLDIR/reinjecte_sans_gardefou.sql" || true)"
verifier "réinjection, garde-fou ôté pour LIRE le tableau : rougissent 2, 4, 6, 7, 11, 13 ; restent verts la mesure, sa propre appartenance, sans session, C-04 pour les autres, l'absence de trace, l'état d'avant, les droits, les appelants, les signalements" \
  "$(vec_sauf 2 4 6 7 11 13)" "$(vecteur "$sortie_r")"

echo "── ② APPLICATION (fichier, puis requête unique, LF et CRLF), VERDICT, REJEU ──"
QD postgres "create database $DB template avant" >/dev/null
sortie="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
printf '%s\n' "$sortie" | grep '§' | sed 's/^/     │ /'
verifier "le tableau de verdict rend 17 OK et 0 ECHEC (psql -f, instruction par instruction)" "17/0" "$(compte_verdict "$sortie")"
verifier "…dans l'ordre : comportement 1 à 9, catalogue 10 à 15" "$TOUT_VERT" "$(vecteur "$sortie")"
sortie2="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -8; exit 1; }
verifier "rejeu : toujours 17 OK, 0 ECHEC (idempotente)" "17/0" "$(compte_verdict "$sortie2")"
sortie_c="$(APPLIQUER_REQUETE "$DB" "$MIGRATION" || true)"
verifier "rejeu en UNE requête simple (psql -c : la forme de l'API de gestion et de l'éditeur SQL) : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie_c")"
python3 -I - "$MIGRATION" "$SQLDIR/crlf.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read().replace("\r\n", "\n")
open(sys.argv[2], "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
PY
chmod 644 "$SQLDIR/crlf.sql"
nouvelle_base crlf
sortie_crlf="$(APPLIQUER_REQUETE crlf "$SQLDIR/crlf.sql" || true)"
verifier "le fichier en CRLF (un poste Windows), en UNE requête, sur la base de production : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie_crlf")"
verifier "…et le CRLF a bien atteint le serveur : le corps stocké porte des CR (son empreinte normalise les fins de ligne)" "t" \
  "$(QD crlf "select position(chr(13) in prosrc) > 0 from pg_proc where oid = 'public.is_conv_member(text,text)'::regprocedure;")"
verifier "après application : corps de la migration (md5 de la ligne 11), policy neuve (md5 ff0689d9…), droits INCHANGÉS" \
  "814ad66c9ba408db34f3435b2a559788|ff0689d95ce3bf5fe1a987763b088f32|$ACL_PROD" "$(ETAT "$DB")"
verifier "…mêmes attributs que la production : sql, STABLE, SECURITY DEFINER, search_path vide, PARALLEL UNSAFE, coût 100, ni STRICT ni LEAKPROOF" \
  "sql|s|t|search_path=\"\"|u|100|f|f" \
  "$(Q "select l.lanname || '|' || p.provolatile::text || '|' || case when p.prosecdef then 't' else 'f' end || '|' || array_to_string(p.proconfig, ';') || '|' || p.proparallel::text || '|' || p.procost::int || '|' || case when p.proisstrict then 't' else 'f' end || '|' || case when p.proleakproof then 't' else 'f' end from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.is_conv_member(text,text)'::regprocedure;")"
verifier "les droits de TABLE n'ont pas bougé (conv_members, conversations, conv_messages, conv_reads, realtime.messages, storage.objects)" \
  "$DROITS_TABLES_AVANT" \
  "$(Q "select string_agg(c.oid::regclass::text || '=' || coalesce(c.relacl::text, '-'), ';' order by c.oid::regclass::text) from pg_class c where c.oid in ('public.conv_members'::regclass, 'public.conversations'::regclass, 'public.conv_messages'::regclass, 'public.conv_reads'::regclass, 'realtime.messages'::regclass, 'storage.objects'::regclass);")"
verifier "aucune autre policy n'a bougé (empreintes de production), et conv_members en porte toujours trois" "0|3" \
  "$(n=0; for p in "${!MD5_POLICIES_PROD[@]}"; do [ "$p" = "public.conv_members·conv_members_select_member" ] && continue; tbl="${p%%·*}"; nom="${p#*·}"; m="$(Q "select md5(regexp_replace(coalesce(pg_get_expr(polqual, polrelid), '') || '#' || coalesce(pg_get_expr(polwithcheck, polrelid), ''), '\\mpublic\\.', '', 'g')) from pg_policy where polrelid = '$tbl'::regclass and polname = '$nom';")"; [ "$m" = "${MD5_POLICIES_PROD[$p]}" ] || n=$((n+1)); done; printf '%s' "$n")|$(Q "select count(*) from pg_policy where polrelid = 'public.conv_members'::regclass;")"
verifier "aucune fonction de la production n'a bougé, hors is_conv_member (empreintes)" "0" \
  "$(n=0; for f in "${!MD5_PROD[@]}"; do [ "$f" = "public.is_conv_member(text,text)" ] && continue; [ "$(MD5_FONCTION "$f")" = "${MD5_PROD[$f]}" ] || n=$((n+1)); done; printf '%s' "$n")"
verifier "la policy neuve dépend d'is_conv_member ET d'is_conversation_creator (pg_depend) ; 11 policies dépendent toujours d'is_conv_member" "t|11" \
  "$(Q "select exists (select 1 from pg_depend d join pg_policy p on p.oid = d.objid where d.classid = 'pg_policy'::regclass and p.polname = 'conv_members_select_member' and d.refobjid = 'public.is_conversation_creator(text)'::regprocedure) || '|' || (select count(*) from pg_depend d where d.classid = 'pg_policy'::regclass and d.refobjid = 'public.is_conv_member(text,text)'::regprocedure);" | sed 's/true/t/g')"
{ cat "$MIGRATION"; echo "select 'temp=' || coalesce(to_regclass('pg_temp.passio_c02_verdict')::text, 'absente') || ',' || coalesce(to_regclass('pg_temp.passio_c02_avant')::text, 'absente') || '|topic=' || coalesce(current_setting('realtime.topic', true), '') || '|role=' || current_user;"; } > "$SQLDIR/apres_commit.sql"; chmod 644 "$SQLDIR/apres_commit.sql"
verifier "les tables temporaires ne survivent pas au commit, ni le realtime.topic posé par le décor, ni le rôle client (même session)" "temp=absente,absente|topic=|role=postgres" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -v ON_ERROR_STOP=1 -f "$SQLDIR/apres_commit.sql" 2>&1 | grep '^temp=')"
verifier "aucune trace du décor du verdict (quatre applications) : profils, conversations, appartenances, blocages, poussées, realtime.messages" "0|0|0|0|0|0" \
  "$(Q "select (select count(*) from public.profiles where id like '00000000-0000-4000-8000-00000000c2a%') || '|' || (select count(*) from public.conversations where id like '%zz-verdict-c02%') || '|' || (select count(*) from public.conv_members where user_id like '00000000-0000-4000-8000-00000000c2a%' or conv_id like '%zz-verdict-c02%') || '|' || (select count(*) from public.blocks where blocker_id like '00000000-0000-4000-8000-00000000c2a%') || '|' || (select count(*) from banc.poussees where topic like 'user:00000000-0000-4000-8000-00000000c2a%') || '|' || (select count(*) from realtime.messages where topic like 'user:00000000-0000-4000-8000-00000000c2a%');")"

echo "── ③ L'ORACLE EST FERMÉ (C-02, R41) ─────────────────────────────────"
verifier "X, connecté et sans lien, n'apprend PLUS rien de la discussion de l'activité (sur les six comptes : aucun « membre »)" "" "$(ORACLE "$DB" "$X" authenticated "$EVGRP")"
verifier "…ni du groupe ordinaire" "" "$(ORACLE "$DB" "$X" authenticated "$GRP")"
verifier "…ni de la conversation 1-à-1 de D et B" "" "$(ORACLE "$DB" "$X" authenticated "$UNA")"
verifier "…ni par la forme de PostgREST 12 (request.jwt.claims seul)" "" "$(ORACLE "$DB" "$X" claims_seuls "$EVGRP")"
verifier "un MEMBRE non plus n'interroge autrui : B, sur la discussion, ne lit que lui-même" "B" "$(ORACLE "$DB" "$B" authenticated "$EVGRP")"
verifier "…et K, le créateur, que lui-même" "K" "$(ORACLE "$DB" "$K" authenticated "$EVGRP")"
verifier "la réponse sur autrui est celle d'un non-membre : X sur B (membre) = X sur C (non membre) = faux" "f|f" \
  "$(LIT "$DB" authenticated "$X" "select public.is_conv_member('$EVGRP', '$B');")|$(LIT "$DB" authenticated "$X" "select public.is_conv_member('$EVGRP', '$C');")"
verifier "sa PROPRE appartenance se lit toujours : B sur la discussion et le groupe, D sur le groupe" "t|t|t" \
  "$(LIT "$DB" authenticated "$B" "select public.is_conv_member('$EVGRP', '$B');")|$(LIT "$DB" authenticated "$B" "select public.is_conv_member('$GRP', '$B');")|$(LIT "$DB" authenticated "$D" "select public.is_conv_member('$GRP', '$D');")"
verifier "…sous request.jwt.claims seul aussi (claim.sub vide)" "t|f" \
  "$(LIT "$DB" claims_seuls "$B" "select public.is_conv_member('$EVGRP', '$B');")|$(LIT "$DB" claims_seuls "$B" "select public.is_conv_member('$EVGRP', '$W');")"
verifier "SANS session (postgres : déclencheurs, administration) : inchangée — K, B, W membres de la discussion ; D, B, W du groupe ; D et B de la 1-à-1" "B,K,W|B,D,W|B,D" \
  "$(ORACLE "$DB" "" sans_session "$EVGRP")|$(ORACLE "$DB" "" sans_session "$GRP")|$(ORACLE "$DB" "" sans_session "$UNA")"
# ── L'ORDRE DES CONJONCTIONS (C-02, relecteur) : sur autrui, conv_members n'est PAS LU.
# Le verdict ne peut pas le voir (même table de vérité) ; la ligne 11 épingle le corps
# mesuré ici. Témoin : sur soi, la même mesure compte bien les lectures.
verifier "un appel sur AUTRUI ne lit pas conv_members : 0 lecture pour 50 appels de X sur B (membre) et 50 sur C (non-membre) — pg_stat_xact_user_tables" "0" \
  "$(LECTURES "$DB" authenticated "$X" "$EVGRP" "$B" "$C")"
verifier "…ni pour un MEMBRE qui interroge les autres membres (B sur K et W), ni sous request.jwt.claims seul (X sur B)" "0|0" \
  "$(LECTURES "$DB" authenticated "$B" "$EVGRP" "$K" "$W")|$(LECTURES "$DB" claims_seuls "$X" "$EVGRP" "$B")"
verifier "…témoin : sur SOI, chaque appel lit (50 appels de B sur B, 50 de X sur X) — le compteur n'est pas aveugle" "50|50" \
  "$(LECTURES "$DB" authenticated "$B" "$EVGRP" "$B")|$(LECTURES "$DB" authenticated "$X" "$EVGRP" "$X")"
verifier "…et sans session (le rôle de la migration), chaque appel lit, comme avant (50 sur B)" "50" \
  "$(QD "$DB" "do \$\$ begin perform count(*) filter (where public.is_conv_member('$EVGRP', '$B')) from generate_series(1, 50); end \$\$; select coalesce(seq_scan, 0) + coalesce(idx_scan, 0) from pg_stat_xact_user_tables where relid = 'public.conv_members'::regclass;")"
verifier "service_role (sans identité) : inchangée" "B,K,W" "$(ORACLE "$DB" "" service_role "$EVGRP")"
contient "anon : toujours aucun droit d'exécution (42501)" "^42501 permission denied for function is_conv_member" \
  "$(SOUS "$DB" anon "" "select public.is_conv_member('$EVGRP', '$B');")"
verifier "un rôle client SANS identité (jeton authenticated sans sub — Supabase Auth n'en émet pas) : la RPC répondrait encore sur tout uid (résidu dit dans l'en-tête)…" "t" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "set local role authenticated; set local request.jwt.claims = '{\"role\": \"authenticated\"}'; select public.is_conv_member('$EVGRP', '$B');" 2>&1)"
verifier "…mais par les policies, l'uid passé vaut NULL : rien ne se lit" "0|0" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "set local role authenticated; set local request.jwt.claims = '{\"role\": \"authenticated\"}'; select count(*) from public.conv_members;" 2>&1)|$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "set local role authenticated; set local request.jwt.claims = '{\"role\": \"authenticated\"}'; select count(*) from public.conv_messages;" 2>&1)"

echo "── ④ LES 11 POLICIES ET storage_chemin_autorise : MÊMES EFFETS AVANT ET APRÈS ──"
QD postgres "create database sig_apres template avant" >/dev/null
APPLIQUER sig_apres "$MIGRATION" >/dev/null
SIG_APRES="$(signature_policies sig_apres)"
verifier "APRÈS : la signature est IDENTIQUE à celle d'avant (membre lit, écrit, émet, dépose, lit ses accusés ; X rien)" "$SIG_AVANT" "$SIG_APRES"
QD postgres "create database prv_apres template avant" >/dev/null
APPLIQUER prv_apres "$MIGRATION" >/dev/null
verifier "trg_reports_preuve_message, APRÈS : identique — B (membre) → preuve ; X (non-membre) → rien ; service_role au nom de B → preuve ; X au nom de B → refusé" \
  "OK,OK,OK|1|0|1|42501" "$(preuves prv_apres)"
verifier "…et la preuve de B est exacte (message, auteur, conversation, contenu)" "m_k1|$K|$EVGRP|Rendez-vous à 9 h" \
  "$(QD prv_apres "select message_id || '|' || auteur_id || '|' || conv_id || '|' || contenu from public.signalements_preuves where report_id = 'rep_b';")"

echo "── ⑤ RV-44 : LE CRÉATEUR VOIT ET RETIRE UN MEMBRE BLOQUÉ ; LES AUTRES NE LE VOIENT PAS ──"
verifier "B (que W a bloqué) ne voit toujours pas W ; W ne voit que lui-même (C-04 tient)" "B,K|W" "$(MEMBRES "$DB" "$B" "$EVGRP")|$(MEMBRES "$DB" "$W" "$EVGRP")"
verifier "K, créateur, voit les TROIS membres, W — qu'il a bloqué — compris" "B,K,W" "$(MEMBRES "$DB" "$K" "$EVGRP")"
verifier "…et le RETIRE : DELETE … RETURNING user_id (la requête de removeGroupMember) → W ; il n'est plus membre" "W|0" \
  "$(LIT "$DB" authenticated "$K" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$W' returning $LETTRES;")|$(Q "select count(*) from public.conv_members where conv_id = '$EVGRP' and user_id = '$W';")"
contient "W, retiré, ne revient pas de lui-même (can_join refuse un compte bloqué avec l'auteur)" "row-level security" \
  "$(SOUS "$DB" authenticated "$W" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$W');")"
verifier "un membre qui n'est pas le créateur ne retire PERSONNE : B sur K → 0 ligne" "|1" \
  "$(LIT "$DB" authenticated "$B" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$K' returning user_id;")|$(Q "select count(*) from public.conv_members where conv_id = '$EVGRP' and user_id = '$K';")"
verifier "le créateur d'un GROUPE ORDINAIRE retire toujours un membre (D retire W)" "W" \
  "$(LIT "$DB" authenticated "$D" "delete from public.conv_members where conv_id = '$GRP' and user_id = '$W' returning $LETTRES;")"
verifier "un membre se retire lui-même (« Quitter », leaveGroup)" "B" \
  "$(LIT "$DB" authenticated "$B" "delete from public.conv_members where conv_id = '$GRP' and user_id = '$B' returning $LETTRES;")"
Q "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$K';" >/dev/null
verifier "le créateur qui a QUITTÉ sa discussion n'en voit plus rien, B y restant (la branche créateur est DANS la conjonction avec is_conv_member)" "|1" \
  "$(MEMBRES "$DB" "$K" "$EVGRP")|$(Q "select count(*) from public.conv_members where conv_id = '$EVGRP' and user_id = '$B';")"
Q "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$K');" >/dev/null
sortie3="$(APPLIQUER "$DB" "$MIGRATION")" || true
verifier "rejeu après ces gestes : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie3")"

echo "── ⑥ RIEN N'EST LIVRÉ : le décodage logique ne rend jamais le décor ──"
QD postgres "create database decodage template avant" >/dev/null
slot="$(QA decodage "select 1 from pg_create_logical_replication_slot('banc_c02', 'test_decoding');" || true)"
if [ "$slot" != "1" ]; then
  echo "❌ slot logique test_decoding impossible (wal_level = logical ? test_decoding installé ?) — aucun résultat n'est exploitable"
  echo "$slot" | tail -3
  exit 1
fi
sortie_d="$(APPLIQUER decodage "$MIGRATION" || true)"
verifier "la migration passe (17 OK) sur une base observée par un slot logique" "17/0" "$(compte_verdict "$sortie_d")"
FLUX="$(QA decodage "select coalesce(string_agg(data, E'\n'), '') from pg_logical_slot_get_changes('banc_c02', null, null);")"
verifier "le flux décodé de la transaction de la migration ne porte AUCUNE ligne de table (le décor, annulé, n'y est pas ; les tables temporaires ne s'y décodent pas)" "0" \
  "$(printf '%s\n' "$FLUX" | grep -c '^table ' || true)"
verifier "…aucun uuid synthétique, aucun identifiant de conversation du verdict, aucune poussée user:<synthétique>" "0" \
  "$(printf '%s\n' "$FLUX" | grep -cE '00000000-0000-4000-8000-00000000c2a|zz-verdict-c02' || true)"
verifier "…mais la transaction elle-même a bien été décodée (BEGIN, COMMIT)" "t" \
  "$(printf '%s\n' "$FLUX" | grep -q '^BEGIN' && printf '%s\n' "$FLUX" | grep -q '^COMMIT' && echo t || echo f)"
QA decodage "select pg_drop_replication_slot('banc_c02');" >/dev/null

echo "── ⑦ RETOUR ARRIÈRE : l'état exact d'avant, À L'OCTET, puis la migration rejouée ──"
RETOUR_ARRIERE > "$SQLDIR/retour.sql"; chmod 644 "$SQLDIR/retour.sql"
sortie_ra="$(APPLIQUER "$DB" "$SQLDIR/retour.sql" || true)"
verifier "le bloc de retour arrière passe et rend ses deux lignes OK" "2/0" "$(compte_verdict "$sortie_ra")"
verifier "retour : is_conv_member À L'OCTET (md5 brut da6bf4bb…, 101 octets, une espace en tête et en fin), policy de C-04 (md5 de15394b…), droits de production" \
  "$MD5_FONCTION_PROD|101|  |$MD5_POLICY_C04|$ACL_PROD" \
  "$(Q "select md5(prosrc) || '|' || length(prosrc) || '|' || left(prosrc, 1) || right(prosrc, 1) from pg_proc where oid = 'public.is_conv_member(text,text)'::regprocedure;")|$(MD5_POLICY_SELECT "$DB")|$(ACL_FONCTION "$DB")"
verifier "…mêmes attributs que la production" "sql|s|t|search_path=\"\"|u|100" \
  "$(Q "select l.lanname || '|' || p.provolatile::text || '|' || case when p.prosecdef then 't' else 'f' end || '|' || array_to_string(p.proconfig, ';') || '|' || p.proparallel::text || '|' || p.procost::int from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.is_conv_member(text,text)'::regprocedure;")"
verifier "retour : le défaut est REVENU — c'est bien l'état d'avant (X relit les membres de la discussion)" "B,K" "$(ORACLE "$DB" "$X" authenticated "$EVGRP")"
Q "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$W');" >/dev/null
verifier "…et RV-44 aussi : W remis (administration), K ne le voit plus et ne le retire pas" "B,K|" \
  "$(MEMBRES "$DB" "$K" "$EVGRP")|$(LIT "$DB" authenticated "$K" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$W' returning user_id;")"
sortie4="$(APPLIQUER "$DB" "$MIGRATION")" || true
verifier "la migration se rejoue après un retour arrière : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie4")"
verifier "…et le créateur retire de nouveau W" "W" "$(LIT "$DB" authenticated "$K" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$W' returning $LETTRES;")"

echo "── ⑧ FERMÉ SUR ÉCHEC : une base qui n'est pas celle que le correctif suppose → RIEN n'est appliqué ──"
deriver() {  # $1 nom, $2 SQL de la dérive (sous postgres, AVANT la migration) ; rend la sortie de l'application
  nouvelle_base "d_$1"
  QD "d_$1" "$2" >/dev/null
  printf '%s' "$(ETAT "d_$1")" > "$BASE/etat_d_$1.txt"
  APPLIQUER "d_$1" "$MIGRATION" || true
}
refusee_derive() {  # $1 libellé, $2 nom, $3 sortie, $4 lignes attendues
  verifier "$1 : REFUSÉE (55000, lignes $4) — et la base est restée celle d'avant la tentative" \
    "REFUSEE 55000 lignes $4|$(cat "$BASE/etat_d_$2.txt")" "$(REFUS "$3")|$(ETAT "d_$2")"
}
s_d="$(deriver fonction "create or replace function public.is_conv_member(_conv_id text, _uid text) returns boolean language sql stable security definer set search_path to '' as \$f\$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)  \$f\$;")"
refusee_derive "D1 is_conv_member déjà modifiée par quelqu'un d'autre (une espace de plus)" fonction "$s_d" 10
s_d="$(deriver avant_c04 "drop policy conv_members_select_member on public.conv_members; create policy conv_members_select_member on public.conv_members for select to authenticated using (public.is_conv_member(conv_id, (select auth.uid())::text));")"
refusee_derive "D2 C-04 absente (la policy d'avant le 06/11, celle du staging)" avant_c04 "$s_d" 10
s_d="$(deriver autre_uid "create policy reads_select_autrui on public.conv_reads for select to authenticated using (public.is_conv_member(conv_id, user_id));")"
refusee_derive "D3 une policy qui passe un AUTRE uid que l'appelant (conv_reads, user_id)" autre_uid "$s_d" 14
s_d="$(deriver preuve "do \$x\$ begin execute replace(pg_get_functiondef('public.trg_reports_preuve_message()'::regprocedure), 'new.reporter_id is not null', 'new.reporter_id is not null and true'); end \$x\$;")"
refusee_derive "D4 trg_reports_preuve_message a changé" preuve "$s_d" 14
s_d="$(deriver troisieme "create function public.appel_tiers(_c text, _u text) returns boolean language sql stable as \$f\$ select public.is_conv_member(_c, _u) \$f\$;")"
refusee_derive "D5 une troisième fonction appelle is_conv_member (sur un uid qu'on ne connaît pas)" troisieme "$s_d" 14
s_d="$(deriver signalement "alter policy reports_insert on public.reports with check (true);")"
refusee_derive "D6 reports_insert ne lie plus reporter_id à l'appelant" signalement "$s_d" 15
s_d="$(deriver preuve_coupee "alter table public.reports disable trigger trg_reports_preuve_message;")"
refusee_derive "D7 trg_reports_preuve_message désactivé" preuve_coupee "$s_d" 15
s_d="$(deriver quatrieme "create policy conv_members_tout on public.conv_members for select to authenticated using (true);")"
refusee_derive "D8 une seconde policy de lecture sur conv_members (qui ouvrirait tout) — 13, et le comportement le dit : l'oracle reste fermé (2), mais chacun voit tous les membres (8), K ceux d'un groupe dont il n'est pas (16) et ceux de la discussion qu'il a quittée (17)" quatrieme "$s_d" "8,13,16,17"
s_d="$(deriver bloque_invoker "alter function public.is_blocked_with(text) security invoker;")"
refusee_derive "D9 is_blocked_with passée SECURITY INVOKER (elle ne lirait plus que les blocages posés par l'appelant) — 13 (attributs des fonctions que la policy appelle), et le comportement le dit : A voit W, qui l'a bloqué (8)" bloque_invoker "$s_d" "8,13"
s_d="$(deriver uid_change "create or replace function auth.uid() returns uuid language sql stable as \$f\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$f\$;")"
refusee_derive "D10 auth.uid() réécrite (claim.sub seul : la forme de PostgREST 12 n'aurait plus d'identité) — 13 (corps de production), et la mesure le dit : sous claims seuls, A n'est plus personne (1, 4)" uid_change "$s_d" "1,4,13"
s_d="$(deriver vue_tiers "create view public.vue_tiers as select c.id from public.conversations c where public.is_conv_member(c.id, 'x');")"
refusee_derive "D11 une VUE appelle is_conv_member (sur un uid qu'on ne connaît pas) : ni policy, ni prosrc — seul le compte de TOUS les dépendants de pg_depend la voit (contre-revue du 06/11)" vue_tiers "$s_d" 14
s_d="$(deriver atomique "create function public.appel_atomique(_c text, _u text) returns boolean language sql stable begin atomic select public.is_conv_member(_c, _u); end;")"
refusee_derive "D12 une fonction SQL BEGIN ATOMIC appelle is_conv_member : son prosrc est VIDE (le corps est en prosqlbody) — seul le compte de pg_depend la voit" atomique "$s_d" 14
verifier "…et une base refusée reste dans son état d'avant : le défaut y est toujours (X relit les membres)" "B,K,W" "$(ORACLE d_fonction "$X" authenticated "$EVGRP")"

echo "── ⑨ RÉINJECTIONS DANS LE FICHIER — le verdict doit LEVER et la base rester inchangée ──"
# muter NOM DRAPEAUX AVANT APRES [AVANT APRES …] : remplace dans une copie de la
# migration ; « empreinte » recalcule le md5 du corps d'is_conv_member (lignes 10
# et 11) comme le ferait un développeur ; « sans_gardefou » ôte le ⑤ pour LIRE le
# tableau ; « tout » admet plusieurs occurrences. Applique sur une base neuve de
# production ; rend la sortie.
muter() {
  local nom="$1" drapeaux="$2"; shift 2
  python3 -I - "$MIGRATION" "$SQLDIR/m_$nom.sql" "$drapeaux" "$@" <<'PY'
import hashlib, sys
src, dst, drapeaux = sys.argv[1:4]
paires = sys.argv[4:]
assert len(paires) % 2 == 0, "paires impaires"
s = open(src, encoding="utf-8").read()
for avant, apres in zip(paires[0::2], paires[1::2]):
    n = s.count(avant)
    assert (n >= 1 if "tout" in drapeaux else n == 1), "mutation introuvable ou ambiguë : " + avant
    s = s.replace(avant, apres)
if "sans_gardefou" in drapeaux:
    d = s.index("-- ── ⑤ FERMÉ SUR ÉCHEC"); f = s.index("-- ── Verdict ──")
    s = s[:d] + s[f:]
if "empreinte" in drapeaux:
    d = s.index("create or replace function public.is_conv_member(_conv_id text, _uid text)\nreturns boolean")
    a = s.index("as $fn$", d) + len("as $fn$")
    f = s.index("$fn$;", a)
    h = hashlib.md5(s[a:f].replace("\r\n", "\n").encode("utf-8")).hexdigest()
    assert s.count("814ad66c9ba408db34f3435b2a559788") == 2, "empreinte du corps introuvable"
    s = s.replace("814ad66c9ba408db34f3435b2a559788", h)
open(dst, "w", encoding="utf-8").write(s)
PY
  chmod 644 "$SQLDIR/m_$nom.sql"
  nouvelle_base "m_$nom"
  APPLIQUER "m_$nom" "$SQLDIR/m_$nom.sql" || true
}
refusee() {  # $1 libellé, $2 nom, $3 sortie, $4 lignes attendues
  verifier "$1 : REFUSÉE (55000, lignes $4) — et la base est celle d'avant (corps de production, policy de C-04, droits)" \
    "REFUSEE 55000 lignes $4|$INCHANGEE" "$(REFUS "$3")|$(ETAT "m_$2")"
}
CLAUSE_UID="select (_uid = (auth.uid())::text or auth.uid() is null)
     and exists"
ORDRE_FINAL="  select (_uid = (auth.uid())::text or auth.uid() is null)
     and exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)
\$fn\$;"
ORDRE_AVANT="  select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)
     and (auth.uid() is null or _uid = (auth.uid())::text)
\$fn\$;"
BRANCHE_CREATEUR="
      -- RV-44 : le créateur voit tous ses membres, bloqués compris — il peut les
      -- retirer (« Suppression admin »), comme l'organisation voit toute la liste.
      or public.is_conversation_creator(conv_id)"
TEXTE_13_NEUF="OR (NOT is_blocked_with(user_id)) OR is_conversation_creator(conv_id)))')"
TEXTE_13_C04="OR (NOT is_blocked_with(user_id))))')"
# R3 (relecteur, 06/11) : la branche créateur réécrite en sous-requête sur conv_members
# ELLE-MÊME — la policy se lit dans sa propre expansion (42P17). Le texte attendu de la
# ligne 13 est ajusté au déparsage réel (relevé sur PostgreSQL 16, comme le ferait un
# développeur) : seule la MESURE peut alors l'arrêter.
BRANCHE_R3="      or exists (select 1 from public.conv_members m2 where m2.conv_id = conv_members.conv_id and m2.user_id = (select auth.uid())::text and public.is_conversation_creator(m2.conv_id))"
TEXTE_13_R3="OR (NOT is_blocked_with(user_id)) OR (EXISTS ( SELECT 1
   FROM conv_members m2
  WHERE ((m2.conv_id = conv_members.conv_id) AND (m2.user_id = (( SELECT auth.uid() AS uid))::text) AND is_conversation_creator(m2.conv_id))))))')"
GRANT_ACL="from public, anon;
grant execute on function public.is_conv_member(text, text) to authenticated, service_role;
"

s_m="$(muter uid "empreinte" "$CLAUSE_UID" "select exists")"
refusee "M1 « clause _uid retirée » (l'empreinte du corps recalculée, comme le ferait un développeur) — l'oracle rouvre : A lit W, K et la 1-à-1 (2), et sous claims seuls (4)" uid "$s_m" "2,4"
s_m="$(muter uid_brut "" "$CLAUSE_UID" "select exists")"
refusee "M1bis la même, empreinte NON recalculée : le corps est vu aussi (11)" uid_brut "$s_m" "2,4,11"
s_m="$(muter uid_sg "empreinte,sans_gardefou" "$CLAUSE_UID" "select exists")"
verifier "…sans garde-fou, le tableau ne rougit QUE 2 et 4" "$(vec_sauf 2 4)" "$(vecteur "$s_m")"
verifier "…et le banc voit la mutation à l'œuvre : X relit la discussion (R41 rouvert)" "B,K,W" "$(ORACLE m_uid_sg "$X" authenticated "$EVGRP")"
s_m="$(muter ordre_avant "empreinte" "$ORDRE_FINAL" "$ORDRE_AVANT")"
verifier "M1ter « l'ordre d'avant » (la lecture AVANT le contrôle de l'appelant, empreinte recalculée) : même table de vérité, le verdict PASSE (17/0) — il ne voit pas l'ordre…" \
  "APPLIQUEE|17/0" "$(REFUS "$s_m")|$(compte_verdict "$s_m")"
verifier "…mais ce banc le voit : 100 lectures de conv_members pour 100 appels de X sur autrui (0 avec le corps de la migration) — c'est lui, avec l'empreinte de la ligne 11, qui tient l'ordre" "100" \
  "$(LECTURES m_ordre_avant authenticated "$X" "$EVGRP" "$B" "$C")"
s_m="$(muter createur "" "$BRANCHE_CREATEUR" "" "$TEXTE_13_NEUF" "$TEXTE_13_C04")"
refusee "M2 « branche créateur retirée » (le texte attendu de la ligne 13 ajusté, comme le ferait un développeur) — RV-44 revient : le créateur ne voit (6) ni ne retire (7) le membre bloqué" createur "$s_m" "6,7"
s_m="$(muter createur_brut "" "$BRANCHE_CREATEUR" "")"
refusee "M2bis la même, texte attendu NON ajusté : la policy est vue aussi (13)" createur_brut "$s_m" "6,7,13"
s_m="$(muter createur_sg "sans_gardefou" "$BRANCHE_CREATEUR" "" "$TEXTE_13_NEUF" "$TEXTE_13_C04")"
verifier "…sans garde-fou, le tableau ne rougit QUE 6 et 7, et le banc voit RV-44 revenu (K ne voit pas W)" "$(vec_sauf 6 7)|B,K" "$(vecteur "$s_m")|$(MEMBRES m_createur_sg "$K" "$EVGRP")"
s_m="$(muter recursion "" "      or public.is_conversation_creator(conv_id)" "$BRANCHE_R3" "$TEXTE_13_NEUF" "$TEXTE_13_R3")"
refusee "R3 « branche créateur RÉCURSIVE » (sous-requête sur conv_members, texte de la ligne 13 ajusté) : la 42P17 levée SOUS authenticated rougit les lignes qui lisent conv_members — K ne voit (6) ni ne retire (7), A et W ne lisent rien (8), le témoin négatif et la sortie du créateur ne se mesurent plus (16, 17) — et BLOQUE (l'ancien verdict la rangeait en panne du décor)" recursion "$s_m" "6,7,8,16,17"
s_m="$(muter recursion_sg "sans_gardefou" "      or public.is_conversation_creator(conv_id)" "$BRANCHE_R3" "$TEXTE_13_NEUF" "$TEXTE_13_R3")"
verifier "…sans garde-fou, on LIT le tableau : la mesure a TOURNÉ (ligne 1 OK) et chaque ligne touchée porte la 42P17 de SA clé" "OK|t|t|t" \
  "$(ligne "$s_m" 1)|$(ligne "$s_m" 6 | grep -q '42P17' && echo t || echo f)|$(ligne "$s_m" 7 | grep -q '42P17' && echo t || echo f)|$(ligne "$s_m" 8 | grep -q '42P17' && echo t || echo f)"
contient "…et la base appliquée sans garde-fou montre ce que le verdict a arrêté : le créateur ne lit plus aucun membre (42P17)" "^ECHEC_PSQL.*infinite recursion" \
  "$(MEMBRES m_recursion_sg "$K" "$EVGRP")"
s_m="$(muter anon "" "$GRANT_ACL" "${GRANT_ACL}grant execute on function public.is_conv_member(text, text) to anon;
")"
refusee "M3 « ACL rendue à anon » (grant execute … to anon)" anon "$s_m" 12
s_m="$(muter anon_sg "sans_gardefou" "$GRANT_ACL" "${GRANT_ACL}grant execute on function public.is_conv_member(text, text) to anon;
")"
verifier "…sans garde-fou, le tableau ne rougit QUE 12, et anon exécute de nouveau la fonction" "$(vec_sauf 12)|t" \
  "$(vecteur "$s_m")|$(QD m_anon_sg "select has_function_privilege('anon', 'public.is_conv_member(text,text)', 'EXECUTE');" | sed 's/true/t/')"
s_m="$(muter public "" "$GRANT_ACL" "${GRANT_ACL}grant execute on function public.is_conv_member(text, text) to public;
")"
refusee "M4 « EXECUTE rendu à PUBLIC »" public "$s_m" 12
s_m="$(muter sans_session "empreinte,tout" "(_uid = (auth.uid())::text or auth.uid() is null)" "(_uid = (auth.uid())::text)")"
refusee "M5 « sans session fermée aussi » (empreinte recalculée) — les déclencheurs et service_role ne liraient plus rien (5)" sans_session "$s_m" "5"
s_m="$(muter invoker "" "language sql
stable
security definer
set search_path to ''
as \$fn\$" "language sql
stable
security invoker
set search_path to ''
as \$fn\$")"
refusee "M6 « SECURITY INVOKER » : la fonction relit conv_members sous la RLS de l'appelant, que la policy lui fait relire — sans fin (54001) dès que l'appelant y a SA ligne ; mesurée clé par clé, la panne rougit tout ce qui lit sa propre appartenance (3, 4, 6, 7, 8, 17) ; l'oracle sur autrui reste fermé (2 : l'appelant est contrôlé avant la lecture) et le témoin négatif tient (16 : K n'a pas de ligne dans le groupe, la récursion s'arrête au premier niveau) ; et les attributs (11)" invoker "$s_m" "3,4,6,7,8,11,17"
s_m="$(muter invoker_sg "sans_gardefou" "language sql
stable
security definer
set search_path to ''
as \$fn\$" "language sql
stable
security invoker
set search_path to ''
as \$fn\$")"
verifier "…sans garde-fou, on LIT le tableau : la mesure a tourné (1 OK) et la ligne 3 porte la 54001 de sa clé (la policy rappelle la fonction, qui relit conv_members sous RLS)" "OK|t" \
  "$(ligne "$s_m" 1)|$(ligne "$s_m" 3 | grep -q '54001' && echo t || echo f)"
s_m="$(muter public_role "" "drop policy if exists conv_members_select_member on public.conv_members;
create policy conv_members_select_member on public.conv_members
  for select to authenticated" "drop policy if exists conv_members_select_member on public.conv_members;
create policy conv_members_select_member on public.conv_members
  for select to public")"
refusee "M7 « policy TO public au lieu d'authenticated »" public_role "$s_m" 13
s_m="$(muter decor "" "    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';" "    null;")"
refusee "M8 « le décor n'est pas annulé » : 9 (ses lignes restent)" decor "$s_m" 9
verifier "…et le refus emporte le décor avec lui : rien n'en est resté" "0|0|0" \
  "$(QD m_decor "select (select count(*) from public.profiles where id like '00000000-0000-4000-8000-00000000c2a%') || '|' || (select count(*) from public.conversations where id like '%zz-verdict-c02%') || '|' || (select count(*) from realtime.messages where topic like 'user:00000000-0000-4000-8000-00000000c2a%');")"
QD postgres "create database m_decor_sg_obs template avant" >/dev/null
QA m_decor_sg_obs "select 1 from pg_create_logical_replication_slot('banc_temoin', 'test_decoding');" >/dev/null
python3 -I - "$MIGRATION" "$SQLDIR/m_decor_sg.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
a = "    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';"
assert s.count(a) == 1
s = s.replace(a, "    null;")
d = s.index("-- ── ⑤ FERMÉ SUR ÉCHEC"); f = s.index("-- ── Verdict ──")
open(sys.argv[2], "w", encoding="utf-8").write(s[:d] + s[f:])
PY
chmod 644 "$SQLDIR/m_decor_sg.sql"
APPLIQUER m_decor_sg_obs "$SQLDIR/m_decor_sg.sql" >/dev/null || true
verifier "…alors que SANS garde-fou le décor serait VALIDÉ en base (3 profils, 3 conversations, 5 appartenances après les deux retraits de K, 7 poussées dans realtime.messages)" "3|3|5|7" \
  "$(QD m_decor_sg_obs "select (select count(*) from public.profiles where id like '00000000-0000-4000-8000-00000000c2a%') || '|' || (select count(*) from public.conversations where id like '%zz-verdict-c02%') || '|' || (select count(*) from public.conv_members where user_id like '00000000-0000-4000-8000-00000000c2a%') || '|' || (select count(*) from realtime.messages where topic like 'user:00000000-0000-4000-8000-00000000c2a%');")"
TEMOIN="$(QA m_decor_sg_obs "select coalesce(string_agg(data, E'\n'), '') from pg_logical_slot_get_changes('banc_temoin', null, null);")"
verifier "…et LIVRÉ : le témoin positif du slot logique décode ces insertions (profils, appartenances, poussées user:<synthétique>) — le contrôle du § ⑥ n'est pas aveugle" "t|t|t" \
  "$(printf '%s\n' "$TEMOIN" | grep -q "^table public.profiles: INSERT.*00000000-0000-4000-8000-00000000c2a" && echo t || echo f)|$(printf '%s\n' "$TEMOIN" | grep -q "^table public.conv_members: INSERT.*00000000-0000-4000-8000-00000000c2a" && echo t || echo f)|$(printf '%s\n' "$TEMOIN" | grep -q "^table realtime.messages: INSERT.*user:00000000-0000-4000-8000-00000000c2a" && echo t || echo f)"
QA m_decor_sg_obs "select pg_drop_replication_slot('banc_temoin');" >/dev/null
s_m="$(muter decor_casse "" "insert into public.blocks (blocker_id, blocked_id) values (k, w), (w, a);" "insert into public.blocks (blocker_id, blocked_id) values (k, w), (w, a), (k, w);")"
refusee "M9 « le décor casse » (clé dupliquée) : la mesure (1) et tout le comportement (2 à 8, 16, 17) ROUGISSENT — aucun OK sans mesure ; l'absence de trace (9) reste vraie — et la panne BLOQUE désormais (relancer, jamais appliquer sans mesure)" decor_casse "$s_m" "1,2,3,4,5,6,7,8,16,17"
s_m="$(muter decor_casse_sg "sans_gardefou" "insert into public.blocks (blocker_id, blocked_id) values (k, w), (w, a);" "insert into public.blocks (blocker_id, blocked_id) values (k, w), (w, a), (k, w);")"
verifier "…sans garde-fou, la ligne 1 dit la phase et la cause (décor, 23505)" "t" \
  "$(ligne "$s_m" 1 | grep -q '^ECHEC — décor : 23505' && echo t || echo f)"
s_m="$(muter decor_role "" "    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', a, true);" "    perform set_config('request.jwt.claim.sub', a, true);")"
refusee "M10 « décor hors rôle client » : la ligne 1 le DIT (A, W, K relevés sous postgres) et BLOQUE ; le comportement mesuré sous un rôle qui contourne la RLS rougit ce qu'il fausse (8 : chacun voit tout ; 16 : K lit et écrit dans un groupe dont il n'est pas membre ; 17 : le créateur parti voit encore)" decor_role "$s_m" "1,8,16,17"
# ── Les témoins ajoutés au verdict le 06/11 (revue) : sans eux, chacune de ces trois
# réinjections passait les 15 lignes d'avant.
FIN_EXISTS="m.user_id = _uid)
\$fn\$;"
s_m="$(muter tout_membre "empreinte" "$CLAUSE_UID" "select coalesce(_uid = (auth.uid())::text, false) or (auth.uid() is null and exists" "$FIN_EXISTS" "m.user_id = _uid))
\$fn\$;")"
refusee "M11 « tout compte connecté est membre de TOUT » (empreinte recalculée) : l'oracle reste fermé et chacun lit sa propre appartenance — seuls le témoin négatif (16 : K lit et écrit dans un groupe dont il n'est pas) et la sortie du créateur (17 : parti, il voit encore) l'arrêtent" tout_membre "$s_m" "16,17"
s_m="$(muter claims_non_eprouves "" "    -- a2. A sous \`request.jwt.claims\` SEUL (claim.sub vide, relevé) : la forme de PostgREST 12.
    perform set_config('request.jwt.claim.sub', '', true);" "    -- a2. (réinjection : claim.sub n'est plus vidé)")"
refusee "M12 « la forme claims seuls n'est plus éprouvée » (claim.sub laissé posé au pas a2) : la ligne 4 mesure alors claim.sub, pas claims — seule la ligne 1, qui relève claim.sub = '' au pas a2, l'arrête" claims_non_eprouves "$s_m" "1"
OUVERT_1A1="select (_uid = (auth.uid())::text or auth.uid() is null or _conv_id like 'conv\\_%')
     and exists"
s_m="$(muter oracle_1a1 "empreinte" "$CLAUSE_UID" "$OUVERT_1A1")"
refusee "M13 « oracle laissé ouvert sur les conversations 1-à-1 » (identifiants \`conv_…\`, empreinte recalculée) : seule la 1-à-1 du décor l'arrête (2 : A lit W dans leur 1-à-1)" oracle_1a1 "$s_m" "2"
s_m="$(muter oracle_1a1_sg "empreinte,sans_gardefou" "$CLAUSE_UID" "$OUVERT_1A1")"
verifier "…sans garde-fou, le tableau ne rougit QUE 2, et le banc la voit à l'œuvre : X relit la 1-à-1 de D et B" "$(vec_sauf 2)|B,D" \
  "$(vecteur "$s_m")|$(ORACLE m_oracle_1a1_sg "$X" authenticated "$UNA")"

echo "── ⑩ VERROUS : PRENDRE conv_members attend au plus 3 s ; une fois tenu, toute attente est bornée à 200 ms ──"
# Contre-revue du 06/11 : lock_timeout borne CHAQUE attente, pas la détention ;
# realtime.send (déclenché sept fois par le décor) AVALE 55P03 — sans la seconde
# borne, la migration tenait l'ACCESS EXCLUSIVE de conv_members 27 s quand une
# autre session tenait realtime.messages. Une autre session tient ici le verrou
# en arrière-plan ; la migration doit soit passer, soit abandonner VITE, et
# n'appliquer RIEN quand elle abandonne.
ms() { echo $(( $(date +%s%N) / 1000000 )); }
tenir() {  # $1 base, $2 instruction de verrou, $3 secondes ; pid dans TENEUR
  ( psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -c "begin; $2; select pg_sleep($3); commit;" ) >/dev/null 2>&1 &
  TENEUR=$!
}
erreur_sql() { printf '%s\n' "$1" | grep -m1 -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || true; }

nouvelle_base v_libre
t0=$(ms); s_v="$(APPLIQUER v_libre "$MIGRATION" || true)"; d=$(( $(ms) - t0 ))
verifier "V1 sans contention : 17 OK, en moins de 5 s" "17/0|1" "$(compte_verdict "$s_v")|$(( d < 5000 ? 1 : 0 ))"

nouvelle_base v_lecteur
tenir v_lecteur "lock table public.conv_members in access share mode" 6; sleep 0.5
t0=$(ms); s_v="$(APPLIQUER v_lecteur "$MIGRATION" || true)"; d=$(( $(ms) - t0 )); wait "$TENEUR" 2>/dev/null || true
verifier "V2 une transaction tient conv_members 6 s : la migration abandonne en 55P03 au bout de ~3 s (2,5 à 4,5 s), RIEN n'est appliqué" \
  "55P03|1|$INCHANGEE" "$(erreur_sql "$s_v")|$(( d >= 2500 && d <= 4500 ? 1 : 0 ))|$(ETAT v_lecteur)"

nouvelle_base v_court
tenir v_court "lock table public.conv_members in access share mode" 1.5; sleep 0.3
t0=$(ms); s_v="$(APPLIQUER v_court "$MIGRATION" || true)"; d=$(( $(ms) - t0 )); wait "$TENEUR" 2>/dev/null || true
verifier "V3 la même transaction tient 1,5 s : la migration attend, puis passe (17 OK)" "17/0|1" "$(compte_verdict "$s_v")|$(( d >= 800 && d <= 4000 ? 1 : 0 ))"

nouvelle_base v_rt
tenir v_rt "lock table realtime.messages in access exclusive mode" 12; sleep 0.5
t0=$(ms); s_v="$(APPLIQUER v_rt "$MIGRATION" || true)"; d=$(( $(ms) - t0 )); wait "$TENEUR" 2>/dev/null || true
verifier "V4 une session tient realtime.messages : la migration abandonne en 55P03 en moins de 5 s (chaque attente, une fois conv_members tenu, bornée à 200 ms), RIEN n'est appliqué" \
  "55P03|1|$INCHANGEE" "$(erreur_sql "$s_v")|$(( d < 5000 ? 1 : 0 ))|$(ETAT v_rt)"

python3 -I - "$MIGRATION" "$SQLDIR/sans_seconde_borne.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
cible = "set local lock_timeout = '200ms';\n"
assert s.count(cible) == 1, "seconde borne introuvable"
open(sys.argv[2], "w", encoding="utf-8").write(s.replace(cible, ""))
PY
chmod 644 "$SQLDIR/sans_seconde_borne.sql"
nouvelle_base v_rt_avant
tenir v_rt_avant "lock table realtime.messages in access exclusive mode" 12; sleep 0.5
t0=$(ms); s_v="$(APPLIQUER v_rt_avant "$SQLDIR/sans_seconde_borne.sql" || true)"; d=$(( $(ms) - t0 )); wait "$TENEUR" 2>/dev/null || true
verifier "…réinjection, seconde borne ôtée : la migration TIENT conv_members tant que realtime.messages est tenu (plus de 9 s) — V4 n'est pas aveugle" "1" "$(( d > 9000 ? 1 : 0 ))"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
