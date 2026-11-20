#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — SÉCURITÉ P1 du 2026-11-20 (D10-01, D10-02, B06-N1, D10-03/D10-04)
#
# Sur un PostgreSQL natif jetable (socket privé, aucune cible distante) :
#   ① AVANT : chaque défaut de la contre-vérification du 2026-11-20 est MESURÉ sur le socle
#      (budget remis à zéro par la suppression du profil, contenu long recopié par membre,
#      accusés sans plafond propre, réécritures sans plafond, remplacement de fichier hors
#      quota, enveloppe précédée d'un BOM acceptée, imbrication anonyme, recherche non bornée) ;
#   ② les cinq migrations se jouent DEUX fois, sans ÉCHEC dans leur tableau de verdict ;
#   ③ APRÈS : chaque défaut est fermé, et l'usage ordinaire reste accepté.
#
#   bash tests/sql/migration-securite-p1-2026-11-20.test.sh
#
# Socle : tests/sql/fixtures/cas-realtime-budget-socle.sql (messagerie, diffuseurs du catalogue)
#       + tests/sql/fixtures/socle-securite-p1-2026-11-20.sql (le reste, relu en production).
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo 'ECHEC : PostgreSQL natif requis pour ce banc'; exit 1; }
PORT=$((7100 + RANDOM % 100))
if [ "$(id -u)" -eq 0 ]; then
 id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
 BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU='su pgbanc -c'
else BASE="$(mktemp -d)"; SU='bash -c'; fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c timezone=UTC\" -l '$BASE/pg.log' start -w" >/dev/null
DB=passio_test_realtime_budget
createdb -h "$BASE" -p "$PORT" -U postgres "$DB"
PSQL=(psql -X -h "$BASE" -p "$PORT" -U postgres -d "$DB" -qAt -v ON_ERROR_STOP=1)
Q() { "${PSQL[@]}" -c "$1"; }
F() { "${PSQL[@]}" -f "$1"; }
# EN <rôle> <compte> <sql> : une requête sous un rôle client, avec l'identité d'un compte.
EN() { "${PSQL[@]}" -c "set request.jwt.claim.sub = '$2'" -c "set role $1" -c "$3"; }
cd "$RACINE"

A=11111111-1111-4111-8111-111111111111
B=22222222-2222-4222-8222-222222222222
C=33333333-3333-4333-8333-333333333333
ok=0; ko=0
verifier() {
 if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "  OK     $1"
 else ko=$((ko+1)); echo "  ECHEC  $1 — attendu [$3], obtenu [$2]"; fi
}
issue() { if "$@" >"$BASE/issue.log" 2>&1; then echo accepte; else echo refuse; fi; }

F tests/sql/fixtures/cas-realtime-budget-socle.sql
F tests/sql/fixtures/socle-securite-p1-2026-11-20.sql
# L'état de production avant ce lot : budget du 16/11 et forme des messages du 16/11.
F migrations/migration_realtime_budget_2026-11-16.sql >/dev/null
F migrations/migration_conv_messages_forme_2026-11-16.sql >/dev/null

# Fichiers de stockage : A dépasse déjà 2 Gio ; B a modifié 120 objets dans l'heure ; C est ordinaire.
Q "insert into storage.objects(bucket_id,name,owner,metadata,created_at,updated_at) values
 ('content','avatars/$A/gros.bin','$A','{\"size\":2147483648}',now()-interval '2 days',now()-interval '2 days'),
 ('content','avatars/$A/petit.jpg','$A','{\"size\":1024}',now()-interval '2 days',now()-interval '2 days'),
 ('content','avatars/$A/vieux.jpg','$A','{\"size\":1024}',now()-interval '2 days',now()-interval '2 days'),
 ('content','avatars/$B/cible.jpg','$B','{\"size\":1024}',now()-interval '2 days',now()-interval '2 days'),
 ('content','avatars/$C/photo.jpg','$C','{\"size\":1024}',now()-interval '2 days',now()-interval '2 days')"
Q "insert into storage.objects(bucket_id,name,owner,metadata,created_at,updated_at)
 select 'content','avatars/$B/o'||i||'.jpg','$B','{\"size\":10}',now()-interval '2 days',now() from generate_series(1,120) i"

echo "══ ① AVANT : les défauts sont mesurés ══"
EN authenticated "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values('av_1','g','$A','bonjour')"
verifier "D10-01 : le budget de A est tenu" "$(Q "select count(*) from passio_realtime_budget.compteurs where compte='$A'")" "3"
EN authenticated "$A" "delete from public.profiles where id='$A'"
verifier "D10-01 : supprimer son profil REMET LE BUDGET À ZÉRO (défaut)" \
 "$(Q "select count(*) from passio_realtime_budget.compteurs where compte='$A'")" "0"
EN authenticated "$A" "insert into public.profiles values('$A')"

Q "truncate realtime.trames"
EN authenticated "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values('av_long','g','$A',repeat('x',5000))"
verifier "D10-01 : un message de 5 000 caractères est RECOPIÉ ENTIER pour chaque membre (défaut)" \
 "$(Q "select count(*)||'/'||min(char_length(charge->'record'->>'content')) from realtime.trames where charge->'record'->>'id'='av_long'")" "3/5000"

Q "truncate realtime.trames"
EN authenticated "$A" "insert into public.conv_reads(conv_id,user_id,last_read_at) values('g','$A',now()-interval '1 hour')"
for _ in 1 2 3 4 5 6; do EN authenticated "$A" "update public.conv_reads set last_read_at=clock_timestamp() where conv_id='g' and user_id='$A'"; done
verifier "D10-01 : sept accusés rapprochés sont TOUS poussés (défaut)" \
 "$(Q "select count(*) from realtime.trames where event='conv_reads:UPSERT'")" "14"

verifier "D10-02 : 25 réécritures d'une publication en une minute (défaut)" \
 "$(issue EN authenticated "$A" "do \$\$ begin for i in 1..25 loop update public.posts set content='texte' where id='p1'; end loop; end \$\$")" "accepte"
verifier "D10-02 : 650 réécritures de l'état du compte en une minute (défaut)" \
 "$(issue EN authenticated "$A" "do \$\$ begin for i in 1..650 loop update public.user_state set data='{\"v\":1}' where user_id=auth.uid()::text; end loop; end \$\$")" "accepte"
verifier "D10-02 : A, au-delà de 2 Gio, remplace un fichier (défaut)" \
 "$(issue EN authenticated "$A" "update storage.objects set metadata='{\"size\":1048576}' where name='avatars/$A/petit.jpg'")" "accepte"
verifier "D10-02 : B, après 120 modifications dans l'heure, en fait une autre (défaut)" \
 "$(issue EN authenticated "$B" "update storage.objects set metadata='{\"size\":2048}' where name='avatars/$B/cible.jpg'")" "accepte"

verifier "B06-N1 : une enveloppe cassée précédée d'un BOM passe pour du texte (défaut)" \
 "$(Q "select public.conv_message_forme_valide(chr(65279)||'{\"type\":\"media\",\"fileType\":1}')")" "t"

verifier "D10-03 : un visiteur lit passion_relations (défaut)" \
 "$("${PSQL[@]}" -c "set role anon" -c "select count(*) from public.passion_relations")" "350"
verifier "D10-03 : la recherche note tous les candidats (« yion », alias exact impopulaire, en tête)" \
 "$(Q "select id from public.rechercher_passions('ion',5) with ordinality r order by ordinality limit 1")" "yion"

echo "══ ② Les migrations, deux fois chacune ══"
for m in migration_securite_p1_budget_realtime_2026-11-20.sql migration_securite_p1_diffusion_tronquee_2026-11-20.sql \
         migration_securite_p1_debit_maj_2026-11-20.sql migration_securite_p1_forme_message_2026-11-20.sql \
         migration_securite_p1_lectures_anonymes_2026-11-20.sql; do
 for passe in 1 2; do
  if ! F "migrations/$m" >"$BASE/verdict.log" 2>&1; then
   ko=$((ko+1)); echo "  ECHEC  $m (passe $passe) :"; sed 's/^/         /' "$BASE/verdict.log" | head -8; continue
  fi
  if grep -q 'ECHEC' "$BASE/verdict.log"; then
   ko=$((ko+1)); echo "  ECHEC  $m (passe $passe), verdict :"; grep 'ECHEC' "$BASE/verdict.log" | sed 's/^/         /'
  else ok=$((ok+1)); echo "  OK     $m (passe $passe) : $(grep -c '|OK$' "$BASE/verdict.log") contrôle(s) OK"; fi
 done
done
verifier "le budget du 16/11 rejoué par erreur est REFUSÉ (pas de retour silencieux)" \
 "$(issue F migrations/migration_realtime_budget_2026-11-16.sql)" "refuse"

echo "══ ③ APRÈS : les défauts sont fermés, l'usage ordinaire passe ══"
EN authenticated "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values('ap_1','g','$A','bonjour')"
AVANT_SUPPR="$(Q "select count(*)||'/'||sum(effets) from passio_realtime_budget.compteurs where compte='$A'")"
EN authenticated "$A" "delete from public.profiles where id='$A'"
verifier "D10-01 : le budget SURVIT à la suppression du profil" \
 "$(Q "select count(*)||'/'||sum(effets) from passio_realtime_budget.compteurs where compte='$A'")" "$AVANT_SUPPR"
EN authenticated "$A" "insert into public.profiles values('$A')"
verifier "D10-01 : un auteur sans compte d'authentification n'a pas de budget" \
 "$(issue Q "select passio_realtime_budget.consommer('u_visiteur',1,1)")" "refuse"

Q "truncate realtime.trames"
OCTETS_AVANT="$(Q "select coalesce(sum(octets),0) from passio_realtime_budget.compteurs where compte='$A' and fenetre=3")"
EN authenticated "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values
 ('ap_long','g','$A',repeat('x',5000)),
 ('ap_env','g','$A','{\"type\":\"text\",\"text\":\"'||repeat('y',3000)||'\"}'),
 ('ap_court','g','$A','court')"
verifier "D10-01 : texte long → 500 caractères et drapeau, pour chaque membre" \
 "$(Q "select count(*)||'/'||max(char_length(charge->'record'->>'content'))||'/'||bool_and((charge->'record'->>'tronque')::boolean) from realtime.trames where charge->'record'->>'id'='ap_long'")" "3/500/true"
verifier "D10-01 : enveloppe longue → contenu vide et drapeau" \
 "$(Q "select count(*)||'/'||max(char_length(charge->'record'->>'content'))||'/'||bool_and((charge->'record'->>'tronque')::boolean) from realtime.trames where charge->'record'->>'id'='ap_env'")" "3/0/true"
verifier "D10-01 : message court → charge inchangée, sans drapeau" \
 "$(Q "select count(*)||'/'||min(charge->'record'->>'content')||'/'||bool_or(charge->'record' ? 'tronque') from realtime.trames where charge->'record'->>'id'='ap_court'")" "3/court/false"
verifier "D10-01 : même enveloppe (événement, table, opération) pour les trois" \
 "$(Q "select count(*) from realtime.trames where event='INSERT' and charge->>'table'='conv_messages' and charge->>'operation'='INSERT' and charge ? 'old_record'")" "9"
verifier "D10-01 : le budget compte la taille ENTIÈRE (chaque membre relira la ligne), pas l'extrait" \
 "$(Q "select (sum(octets) - $OCTETS_AVANT >= 3*(5000+3000))::text from passio_realtime_budget.compteurs where compte='$A' and fenetre=3")" "true"
verifier "D10-01 : le message en base reste ENTIER" \
 "$(Q "select char_length(content) from public.conv_messages where id='ap_long'")" "5000"

Q "truncate realtime.trames, passio_realtime_budget.accuses"
EN authenticated "$A" "update public.conv_reads set last_read_at=clock_timestamp() where conv_id='g' and user_id='$A'"
Q "select pg_sleep(1)" >/dev/null
EN authenticated "$A" "update public.conv_reads set last_read_at=clock_timestamp() where conv_id='g' and user_id='$A'"
verifier "D10-01 : deux accusés à une seconde d'écart (conversation vive) → les DEUX poussés" \
 "$(Q "select count(*) from realtime.trames where event='conv_reads:UPSERT'")" "4"
for _ in 1 2 3 4 5; do EN authenticated "$A" "update public.conv_reads set last_read_at=clock_timestamp() where conv_id='g' and user_id='$A'"; done
verifier "D10-01 : sept accusés rapprochés → CINQ poussés (2 destinataires chacun)" \
 "$(Q "select count(*) from realtime.trames where event='conv_reads:UPSERT'")" "10"
verifier "D10-01 : la lecture la plus récente est quand même ENREGISTRÉE" \
 "$(Q "select (r.last_read_at > a.debut)::text||'/'||a.nombre from public.conv_reads r join passio_realtime_budget.accuses a on a.compte::text=r.user_id and a.conv_id=r.conv_id where r.conv_id='g' and r.user_id='$A'")" "true/5"
# La fenêtre de 10 s s'écoule (reculée en base plutôt qu'attendue).
Q "update passio_realtime_budget.accuses set debut=debut-interval '11 seconds'"
EN authenticated "$A" "update public.conv_reads set last_read_at=clock_timestamp() where conv_id='g' and user_id='$A'"
verifier "D10-01 : la fenêtre passée, l'accusé suivant repart" \
 "$(Q "select count(*) from realtime.trames where event='conv_reads:UPSERT'")" "12"

verifier "D10-02 : 25 réécritures d'une publication → refusées" \
 "$(issue EN authenticated "$A" "do \$\$ begin for i in 1..25 loop update public.posts set content='texte' where id='p1'; end loop; end \$\$")" "refuse"
grep -q 'rate limit' "$BASE/issue.log" || { ko=$((ko+1)); echo "  ECHEC  D10-02 : le refus n'est pas un plafond"; cat "$BASE/issue.log"; }
verifier "D10-02 : une correction de publication ordinaire passe" \
 "$(issue EN authenticated "$A" "update public.posts set content='texte corrigé' where id='p1'")" "accepte"
verifier "D10-02 : une séance d'état ordinaire (200 écritures) passe" \
 "$(issue EN authenticated "$A" "do \$\$ begin for i in 1..200 loop update public.user_state set data='{\"v\":2}' where user_id=auth.uid()::text; end loop; end \$\$")" "accepte"
verifier "D10-02 : 650 réécritures de l'état du compte → refusées" \
 "$(issue EN authenticated "$A" "do \$\$ begin for i in 1..650 loop update public.user_state set data='{\"v\":1}' where user_id=auth.uid()::text; end loop; end \$\$")" "refuse"
verifier "D10-02 : 35 réécritures d'un commentaire → refusées" \
 "$(issue EN authenticated "$A" "do \$\$ begin for i in 1..35 loop update public.post_comments set content='texte' where id='c1'; end loop; end \$\$")" "refuse"
verifier "D10-02 : 20 réécritures d'une activité → refusées" \
 "$(issue EN authenticated "$A" "do \$\$ begin for i in 1..20 loop update public.events set title='titre' where id='e1'; end loop; end \$\$")" "refuse"
verifier "D10-02 : le service n'est pas compté" \
 "$(issue Q "do \$\$ begin for i in 1..50 loop update public.posts set content='texte' where id='p1'; end loop; end \$\$")" "accepte"

verifier "D10-02 : A, au-delà de 2 Gio, ne remplace plus un fichier" \
 "$(issue EN authenticated "$A" "update storage.objects set metadata='{\"size\":2097152}' where name='avatars/$A/petit.jpg'")" "refuse"
verifier "D10-02 : A peut encore archiver (se vider)" \
 "$(issue EN authenticated "$A" "update storage.objects set archived_at=now() where name='avatars/$A/vieux.jpg'")" "accepte"
verifier "D10-02 : B, après 120 modifications dans l'heure, est refusé" \
 "$(issue EN authenticated "$B" "update storage.objects set metadata='{\"size\":4096}' where name='avatars/$B/cible.jpg'")" "refuse"
verifier "D10-02 : C, compte ordinaire, remplace sa photo" \
 "$(issue EN authenticated "$C" "update storage.objects set metadata='{\"size\":2048}' where name='avatars/$C/photo.jpg'")" "accepte"

verifier "B06-N1 : l'enveloppe cassée précédée d'un BOM est refusée par la fonction" \
 "$(Q "select public.conv_message_forme_valide(chr(65279)||'{\"type\":\"media\",\"fileType\":1}')")" "f"
verifier "B06-N1 : … et à l'écriture" \
 "$(issue EN authenticated "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values('bom_env','g','$A',chr(65279)||'{\"type\":\"media\",\"fileType\":1}')")" "refuse"
grep -q 'forme de message invalide' "$BASE/issue.log" || { ko=$((ko+1)); echo "  ECHEC  B06-N1 : refus d'une autre nature"; cat "$BASE/issue.log"; }
verifier "B06-N1 : un TEXTE précédé d'un BOM reste accepté" \
 "$(issue EN authenticated "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values('bom_txt','g','$A',chr(65279)||'bonjour')")" "accepte"
verifier "B06-N1 : espace idéographique et séparateur de ligne (blancs du client) refusés devant une enveloppe" \
 "$(Q "select public.conv_message_forme_valide(chr(12288)||'[1,')::text||'/'||public.conv_message_forme_valide(chr(8232)||'{bad')::text")" "false/false"
verifier "B06-N1 : largeur nulle et word joiner, que le client ne saute pas, restent du texte (comme côté client)" \
 "$(Q "select public.conv_message_forme_valide(chr(8203)||'[1,')::text||'/'||public.conv_message_forme_valide(chr(8288)||'{bad')::text")" "true/true"
verifier "B06-N1 : un texte « largeur nulle + accolade » est accepté à l'écriture" \
 "$(issue EN authenticated "$A" "insert into public.conv_messages(id,conv_id,from_id,content) values('zw_txt','g','$A',chr(8203)||'{ clin d''oeil }')")" "accepte"

verifier "D10-03 : un visiteur ne lit plus passion_relations" \
 "$(issue "${PSQL[@]}" -c "set role anon" -c "select count(*) from public.passion_relations")" "refuse"
verifier "D10-03 : un compte non plus" \
 "$(issue EN authenticated "$A" "select count(*) from public.passion_relations")" "refuse"
verifier "D10-03 : le service, oui" \
 "$("${PSQL[@]}" -c "set role service_role" -c "select count(*) from public.passion_relations")" "350"
verifier "D10-03 : 300 candidats notés au plus (« yion », hors des 300 plus populaires, sort)" \
 "$(Q "select count(*)||'/'||bool_or(id='yion') from public.rechercher_passions('ion',5)")" "5/false"
verifier "D10-03 : un préfixe impopulaire reste en tête" \
 "$("${PSQL[@]}" -c "set role anon" -c "select id from public.rechercher_passions('gui',5) with ordinality r order by ordinality limit 1")" "guitare"
verifier "D10-03 : rien sous trois caractères, populaires sur terme vide" \
 "$(Q "select (select count(*) from public.rechercher_passions('ab',5))||'/'||(select count(*) from public.rechercher_passions('',5))")" "0/5"

Q "delete from auth.users where id='$A'"
verifier "D10-01 : la suppression RÉELLE du compte efface budget et accusés" \
 "$(Q "select (select count(*) from passio_realtime_budget.compteurs where compte='$A')+(select count(*) from passio_realtime_budget.accuses where compte='$A')")" "0"

echo "bilan : $ok OK, $ko ECHEC"
[ "$ko" -eq 0 ]
