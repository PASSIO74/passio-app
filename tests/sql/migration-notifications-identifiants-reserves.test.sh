#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_notifications_identifiants_reserves_2026-11-03.sql (R5)
#
# PostgreSQL jetable, socle = `notifications` avec ses policies, ses droits
# (GRANT ALL à anon et authenticated, comme en production), le trigger
# d'origine, et `follows_notifier` pris dans le RETOUR ARRIÈRE de la migration
# — dont on contrôle l'empreinte contre celle mesurée en production
# (md5(prosrc), canal ①, 2026-11-03) : le socle EST la définition de prod.
# On MESURE D'ABORD les deux squats : par INSERT (un compte pré-insère
# l'identifiant déterministe `n_fw_<acteur8>_<cible8>`) et par UPDATE (une
# notification banale À SOI, puis `set id = 'n_fr_<A8>_<V8>'` : le demandeur
# écrit chez le squatteur, la cible ne reçoit rien). On applique, on rejoue :
# les cinq préfixes serveur sont refusés à l'INSERT client, l'UPDATE client
# ne touche plus que `seen` (42501 sur toute autre colonne), anon n'écrit plus
# rien mais lit toujours `[]`, les squats déjà posés sont purgés (les lignes
# conformes restent), et `follows_notifier` ne réécrit plus la ligne d'autrui
# tout en écrivant, d'origine serveur, celle du vrai couple. Enfin la fonction
# migrée ne diffère de la production que des lignes voulues, et le retour
# arrière rend l'état d'avant.
#
#   bash tests/sql/migration-notifications-identifiants-reserves.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_notifications_identifiants_reserves_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

# Empreintes mesurées en production le 2026-11-03 (canal ①) : md5(prosrc).
MD5_PROD_FOLLOWS_NOTIFIER=af56dfee1bf82b669bf68e4bb8a1422b
MD5_PROD_IDENTIFIANT_RESERVE=3aac645fc842c45d820e8a2391cd0a7d

PORT=$(( 6330 + RANDOM % 120 ))
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

DB=identifiants
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# VERBOSITY verbose : un refus imprime son SQLSTATE (« ERROR:  42501: … »).
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v VERBOSITY=verbose \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v VERBOSITY=verbose -c "set local role anon; $1" 2>&1; }
INSERE() { AUTH "$1" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('$2', '$3', 'like', '$1', 'x', 'client') returning 1;"; }
# Un UPDATE mesuré en UNE requête : le nombre de lignes touchées, ou l'erreur.
MAJ()  { AUTH "$1" "with u as (update public.notifications set $2 where $3 returning 1) select count(*) from u;"; }
RETOUR_ARRIERE() { sed -n 's/^--| //p' "$MIGRATION"; }

A=33333333-3333-3333-3333-333333333333   # alice, la vraie abonnée / demandeuse
V=44444444-4444-4444-4444-444444444444   # vic, la cible (compte privé)
S=55555555-5555-5555-5555-555555555555   # le squatteur
B=66666666-6666-6666-6666-666666666666   # bob, un second demandeur
W=77777777-7777-7777-7777-777777777777   # wendy, une destinataire sans histoire
A8=${A:0:8}; V8=${V:0:8}; S8=${S:0:8}; B8=${B:0:8}; W8=${W:0:8}

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }
compte_verdict() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -cE '\|\s*OK\s*$' || true)" "$(printf '%s\n' "$1" | grep -cE '\|\s*ECHEC\s*$' || true)"; }
purgees() { printf '%s\n' "$1" | awk -F'|' '/squats purgés/ { gsub(/ /, "", $NF); print $NF }'; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (id text primary key, username text);
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now(), origine text not null default 'client');
create table public.follows (follower_id text not null, following_id text not null, status text not null default 'accepted',
  primary key (follower_id, following_id));
alter table public.notifications enable row level security;
-- Production (canal ①, 2026-11-03) : le défaut Supabase, GRANT ALL aux deux rôles clients.
grant all on public.notifications to anon, authenticated, service_role;

create function public.genres_reserves_au_serveur(p_kind text) returns boolean
  language sql immutable set search_path = '' as $f$ select p_kind in ('mention', 'follow', 'follow_request', 'follow_accept') $f$;
create function public.is_blocked_with(p_other text) returns boolean language sql stable as $f$ select false $f$;
create function public.suppression_de_mon_compte() returns boolean language sql stable as $f$ select false $f$;
-- identifiant_reserve_au_serveur et follows_notifier viennent du RETOUR ARRIÈRE (plus bas).
create function public.identifiant_reserve_au_serveur(p_id text) returns boolean
  language sql immutable set search_path = '' as $f$ select false $f$;

-- Les policies de production (rôles : PUBLIC, sauf l'INSERT à authenticated).
create policy notifications_insert_own_author on public.notifications for insert to authenticated
  with check (from_id = (select auth.uid())::text and not public.is_blocked_with(user_id)
    and not public.suppression_de_mon_compte() and not public.genres_reserves_au_serveur(kind)
    and not public.identifiant_reserve_au_serveur(id));
create policy "Lecture propre" on public.notifications for select using (user_id = (select auth.uid())::text);
create policy "Suppression propre" on public.notifications for delete using (user_id = (select auth.uid())::text);
create policy "Update propre" on public.notifications for update using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());

-- L'origine, posée par le seul serveur (production : trg_notifications_origine, BEFORE INSERT).
create function public.notifications_origine() returns trigger language plpgsql security definer set search_path to '' as $t$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  return new;
end $t$;
create trigger trg_notifications_origine before insert on public.notifications for each row execute function public.notifications_origine();

create function public.follows_notifier() returns trigger language plpgsql as $t$ begin return new; end $t$;
create trigger trg_follows_notifier after insert or update of status on public.follows for each row execute function public.follows_notifier();
insert into public.profiles values
  ('33333333-3333-3333-3333-333333333333', 'alice'), ('44444444-4444-4444-4444-444444444444', 'vic'),
  ('55555555-5555-5555-5555-555555555555', 'squatteur'), ('66666666-6666-6666-6666-666666666666', 'bob'),
  ('77777777-7777-7777-7777-777777777777', 'wendy');
SQL

echo "── ⓪ LE SOCLE EST LA PRODUCTION : le retour arrière de la migration, empreintes contrôlées ──"
sortie_ra="$(RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1)" || {
  echo "  ❌ le retour arrière de l'en-tête ne s'exécute pas :"; echo "$sortie_ra" | tail -5; exit 1; }
verifier "follows_notifier du retour arrière = la définition de production, à l'octet près (md5(prosrc))" "$MD5_PROD_FOLLOWS_NOTIFIER" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.follows_notifier()'::regprocedure;")"
verifier "identifiant_reserve_au_serveur du retour arrière = celle de production (md5(prosrc))" "$MD5_PROD_IDENTIFIANT_RESERVE" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.identifiant_reserve_au_serveur(text)'::regprocedure;")"

echo "── ⓪ AVANT : les squats mesurés ─────────────────────────────────────"
# a) par INSERT : l'identifiant déterministe d'un futur abonnement, posé d'avance.
verifier "INSERT : le squatteur pré-insère l'identifiant de l'abonnement d'A → V" "1" "$(INSERE "$S" "n_fw_${A8}_${V8}" "$V")"
Q "insert into public.follows (follower_id, following_id, status) values ('$A', '$V', 'accepted');" >/dev/null
verifier "…le trigger réécrit la ligne du squatteur : V lit « squatteur » comme expéditeur du vrai abonnement d'alice" "$S|alice a commencé à te suivre" \
  "$(Q "select from_id || '|' || content from public.notifications where id = 'n_fw_${A8}_${V8}';")"
# b) par UPDATE : une notification banale À SOI, puis l'identifiant réservé.
verifier "UPDATE : le squatteur s'écrit une notification banale n_x…" "1" "$(INSERE "$S" "n_xsquatfr" "$S")"
verifier "…puis la renomme n_fr_<B8>_<V8> (UPDATE de la colonne id, permis par le GRANT de table)" "1" \
  "$(MAJ "$S" "id = 'n_fr_${B8}_${V8}'" "id = 'n_xsquatfr'")"
Q "insert into public.follows (follower_id, following_id, status) values ('$B', '$V', 'pending');" >/dev/null
verifier "…bob demande à suivre vic : c'est le SQUATTEUR qui lit la demande" "bob souhaite s'abonner à ton compte privé" \
  "$(AUTH "$S" "select content from public.notifications where id = 'n_fr_${B8}_${V8}';")"
verifier "…et vic ne la reçoit jamais" "0" "$(AUTH "$V" "select count(*) from public.notifications where id like 'n\_fr\_%';")"
# c) même porte : suivre quelqu'un sans qu'il en soit prévenu.
verifier "UPDATE : le squatteur renomme une notification à lui en n_fw_<S8>_<V8>" "1" \
  "$( INSERE "$S" "n_xsquatfw" "$S" >/dev/null; MAJ "$S" "id = 'n_fw_${S8}_${V8}'" "id = 'n_xsquatfw'")"
Q "insert into public.follows (follower_id, following_id, status) values ('$S', '$V', 'accepted');" >/dev/null
verifier "…il suit vic, et vic n'en est pas prévenue" "0" "$(AUTH "$V" "select count(*) from public.notifications where id = 'n_fw_${S8}_${V8}';")"
# d) l'UPDATE de table ouvrait aussi content, kind et origine.
INSERE "$S" "n_xforge" "$S" >/dev/null
verifier "UPDATE : content, kind et origine se réécrivaient (origine 'serveur' forgée)" "1" \
  "$(MAJ "$S" "content = 'forgé', kind = 'mention', origine = 'serveur'" "id = 'n_xforge'")"
Q "delete from public.notifications where id = 'n_xforge';" >/dev/null

# Squats HISTORIQUES pré-posés (P), et lignes CONFORMES (L) — telles qu'en base avant la migration.
Q "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values
   ('n_pa_' || left('ev_squat_2026_x', 12) || '_${V8}', '$S', 'like', '$S', 'x', 'squat promotion'),
   ('n_m_' || left(md5('commentaire|post_1|$B|$V'), 20), '$S', 'like', '$S', 'post_1', 'squat mention'),
   ('n_m_' || left(md5('repli client'), 20), '$S', 'like', '$S', 'x', 'forme de repli, origine client'),
   ('n_fa_${V8}_${A8}', '$S', 'like', '$S', 'x', 'squat acceptation'),
   ('n_fw_${B8}_${W8}', '$W', 'follow', '$B', '$B', 'bob a commencé à te suivre'),
   ('n_pa_' || left('ev_legit_2026_x', 12) || '_${W8}', '$W', 'event_update', '$B', 'ev_legit_2026_x', 'Une place s''est libérée'),
   ('n_xbanale', '$W', 'like', '$B', 'x', 'bob a aimé ta publication');" >/dev/null
Q "set local passio.notification_serveur = '1';
   insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values
   ('n_m_' || left(md5('commentaire|post_1|$B|$W'), 20), '$W', 'mention', '$B', 'post_1', 'bob t''a mentionné'),
   ('n_m_' || left(md5('repli serveur'), 20), '$W', 'mention', '$B', 'post_2', 'bob t''a mentionné');" >/dev/null
SQUATS="'n_fw_${A8}_${V8}', 'n_fr_${B8}_${V8}', 'n_fw_${S8}_${V8}', 'n_pa_' || left('ev_squat_2026_x', 12) || '_${V8}',
        'n_m_' || left(md5('commentaire|post_1|$B|$V'), 20), 'n_m_' || left(md5('repli client'), 20), 'n_fa_${V8}_${A8}'"
CONFORMES="'n_fw_${B8}_${W8}', 'n_pa_' || left('ev_legit_2026_x', 12) || '_${W8}', 'n_xbanale',
           'n_m_' || left(md5('commentaire|post_1|$B|$W'), 20), 'n_m_' || left(md5('repli serveur'), 20)"
verifier "avant : 7 squats et 5 lignes conformes en base" "7|5" \
  "$(Q "select (select count(*) from public.notifications where id in ($SQUATS)) || '|' || (select count(*) from public.notifications where id in ($CONFORMES));")"

echo "── ① APPLICATION ───────────────────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 11 OK et 0 ECHEC" "11/0" "$(compte_verdict "$sortie")"
verifier "…et compte les 7 squats purgés par cette exécution" "7" "$(purgees "$sortie")"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejouée : même verdict (idempotente)" "11/0" "$(compte_verdict "$sortie2")"
verifier "…et plus rien à purger" "0" "$(purgees "$sortie2")"

echo "── ② LES PRÉFIXES SERVEUR SONT REFUSÉS À L'INSERT CLIENT ──────────"
for prefixe in n_fw_ n_fr_ n_fa_ n_pa_ n_m_; do
  contient "un client ne peut pas insérer ${prefixe}… (42501)" "42501.*row-level security" "$(INSERE "$S" "${prefixe}abc_def" "$V")"
done
verifier "les identifiants CLIENT passent : n_x<aléa>" "1" "$(INSERE "$S" "n_xk3j2h1g9abc" "$V")"
verifier "…et n_msg_<id>_<8> (la notification de message côté client : n_msg_ n'est pas n_m_)" "1" "$(INSERE "$S" "n_msg_xk3j2h1g9abc_44444444" "$V")"
verifier "…et un identifiant qui commence par n_m sans soulignement (n_mabc)" "1" "$(INSERE "$S" "n_mabc" "$V")"

echo "── ③ L'UPDATE CLIENT NE TOUCHE PLUS QUE seen ───────────────────────"
verifier "le squatteur s'écrit encore une notification banale à lui" "1" "$(INSERE "$S" "n_xpriv" "$S")"
contient "UPDATE id → n_fr_<A8>_<W8> refusé (42501, permission denied)" "42501.*permission denied" \
  "$(MAJ "$S" "id = 'n_fr_${A8}_${W8}'" "id = 'n_xpriv'")"
for affectation in "content = 'forgé'" "kind = 'mention'" "user_id = '$V'" "from_id = '$A'" "origine = 'serveur'" "ref_id = 'autre'" "created_at = now()"; do
  contient "UPDATE ${affectation%% *} refusé (42501)" "42501.*permission denied" "$(MAJ "$S" "$affectation" "id = 'n_xpriv'")"
done
verifier "UPDATE seen accepté : le destinataire marque lu (forme de supaMarkNotifSeen)" "1" \
  "$(MAJ "$S" "seen = true" "id = 'n_xpriv' and user_id = '$S'")"
verifier "…et c'est écrit" "t" "$(Q "select seen from public.notifications where id = 'n_xpriv';")"
verifier "UPDATE seen groupé (forme de supaMarkNotifsSeen : id in (…) and user_id = moi)" "2" \
  "$(MAJ "$W" "seen = true" "id in ('n_fw_${B8}_${W8}', 'n_xbanale') and user_id = '$W'")"
verifier "UPDATE seen de la notification d'autrui : 0 ligne (« Update propre » intacte)" "0" \
  "$(MAJ "$S" "seen = true" "id = 'n_xbanale'")"
verifier "DELETE de sa propre notification : toujours permis" "1" \
  "$(AUTH "$S" "with d as (delete from public.notifications where id = 'n_xpriv' returning 1) select count(*) from d;")"
contient "anon : INSERT refusé (permission denied)" "42501.*permission denied" \
  "$(ANON "insert into public.notifications (id, user_id, kind, from_id, content) values ('n_xanon', '$V', 'like', '$S', 'x');")"
contient "anon : UPDATE seen refusé" "42501.*permission denied" "$(ANON "update public.notifications set seen = true;")"
contient "anon : DELETE refusé" "42501.*permission denied" "$(ANON "delete from public.notifications;")"
contient "anon : TRUNCATE refusé" "42501.*permission denied" "$(ANON "truncate public.notifications;")"
verifier "anon : SELECT rend [] sans erreur (une lecture de visiteur reste une liste vide)" "0" "$(ANON "select count(*) from public.notifications;")"

echo "── ④ LES SQUATS DÉJÀ POSÉS SONT PURGÉS, LES LIGNES CONFORMES RESTENT ──"
verifier "les 7 squats ont disparu (n_fw_, n_fr_, n_fa_, n_pa_, n_m_ contraires à leurs propres colonnes)" "0" \
  "$(Q "select count(*) from public.notifications where id in ($SQUATS);")"
verifier "les 5 lignes conformes sont là (abonnement, promotion, mention et son repli serveur, notification banale)" "5" \
  "$(Q "select count(*) from public.notifications where id in ($CONFORMES);")"

echo "── ⑤ follows_notifier : la ligne d'autrui n'est plus réécrite, le vrai couple reçoit ──"
Q "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_fw_${A8}_${W8}', '$S', 'like', '$S', 'x', 'ligne étrangère');" >/dev/null
Q "insert into public.follows (follower_id, following_id, status) values ('$A', '$W', 'accepted');" >/dev/null
verifier "une ligne étrangère sous l'identifiant (collision, résidu) n'est PAS réécrite" "$S|$S|like|ligne étrangère" \
  "$(Q "select user_id || '|' || from_id || '|' || kind || '|' || content from public.notifications where id = 'n_fw_${A8}_${W8}';")"
verifier "…et l'abonnement, lui, est conservé" "1" "$(Q "select count(*) from public.follows where follower_id = '$A' and following_id = '$W';")"
Q "insert into public.follows (follower_id, following_id, status) values ('$B', '$W', 'accepted');" >/dev/null
verifier "la ligne du MÊME couple est toujours rafraîchie (contenu serveur, de nouveau non lue)" "$W|$B|follow|bob a commencé à te suivre|false" \
  "$(Q "select user_id || '|' || from_id || '|' || kind || '|' || content || '|' || seen from public.notifications where id = 'n_fw_${B8}_${W8}';")"
Q "delete from public.follows where following_id = '$V';" >/dev/null
Q "insert into public.follows (follower_id, following_id, status) values ('$A', '$V', 'accepted');" >/dev/null
verifier "alice suit vic : la notification va chez vic, au nom d'alice, d'origine serveur" "$V|$A|alice a commencé à te suivre|serveur" \
  "$(Q "select user_id || '|' || from_id || '|' || content || '|' || origine from public.notifications where id = 'n_fw_${A8}_${V8}';")"
verifier "…et vic la lit (policy de lecture intacte)" "1" "$(AUTH "$V" "select count(*) from public.notifications where id = 'n_fw_${A8}_${V8}';")"
Q "insert into public.follows (follower_id, following_id, status) values ('$B', '$V', 'pending');" >/dev/null
verifier "bob demande à suivre vic : vic reçoit la demande, d'origine serveur" "$V|$B|follow_request|bob souhaite s'abonner à ton compte privé|serveur" \
  "$(Q "select user_id || '|' || from_id || '|' || kind || '|' || content || '|' || origine from public.notifications where id = 'n_fr_${B8}_${V8}';")"
verifier "…et le squatteur n'en voit rien" "0" "$(AUTH "$S" "select count(*) from public.notifications where id like 'n\_fr\_%';")"
Q "update public.follows set status = 'accepted' where follower_id = '$B' and following_id = '$V';" >/dev/null
verifier "vic accepte : bob reçoit n_fa_<V8>_<B8>, au nom de vic, d'origine serveur" "$B|$V|vic a accepté ta demande d'abonnement|serveur" \
  "$(Q "select user_id || '|' || from_id || '|' || content || '|' || origine from public.notifications where id = 'n_fa_${V8}_${B8}';")"
Q "insert into public.follows (follower_id, following_id, status) values ('$S', '$V', 'accepted');" >/dev/null
verifier "le squatteur suit vic : cette fois vic en est prévenue" "1" "$(AUTH "$V" "select count(*) from public.notifications where id = 'n_fw_${S8}_${V8}' and from_id = '$S';")"

echo "── ⑥ LA FONCTION MIGRÉE = LA PRODUCTION + LES SEULES LIGNES VOULUES ──"
corps_prod="$(RETOUR_ARRIERE | awk '/^AS \$function\$$/ { f = 1; next } /^end \$function\$;$/ { f = 0 } f')"
corps_migre="$(awk '/^as \$function\$$/ { f = 1; next } /^end \$function\$;$/ { f = 0 } f' "$MIGRATION")"
ecarts="$(diff <(printf '%s\n' "$corps_prod") <(printf '%s\n' "$corps_migre") || true)"
verifier "une seule ligne de production retirée : le do update sans garde" \
  "<     on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now();" \
  "$(printf '%s\n' "$ecarts" | grep '^<' || true)"
verifier "trois lignes de code ajoutées (hors commentaires) : l'origine serveur, le do update, sa garde" \
  "$(printf '%s\n' \
     ">   perform set_config('passio.notification_serveur', '1', true);" \
     ">     on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now()" \
     ">       where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id;")" \
  "$(printf '%s\n' "$ecarts" | grep '^>' | grep -vE '^>\s*--' || true)"

echo "── ⑦ RETOUR ARRIÈRE : l'état d'avant, à l'octet près ──────────────"
sortie_ra="$(RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1)" || {
  echo "  ❌ le retour arrière ne s'exécute pas :"; echo "$sortie_ra" | tail -5; exit 1; }
verifier "follows_notifier rendu à la définition de production (md5(prosrc))" "$MD5_PROD_FOLLOWS_NOTIFIER" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.follows_notifier()'::regprocedure;")"
verifier "identifiant_reserve_au_serveur rendue (md5(prosrc))" "$MD5_PROD_IDENTIFIANT_RESERVE" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.identifiant_reserve_au_serveur(text)'::regprocedure;")"
verifier "droits rendus : UPDATE de table à authenticated, écriture à anon (INSERT, UPDATE, DELETE, TRUNCATE)" "t|t|t|t|t" \
  "$(Q "select has_table_privilege('authenticated', 'public.notifications', 'UPDATE') || '|' || has_table_privilege('anon', 'public.notifications', 'INSERT')
          || '|' || has_table_privilege('anon', 'public.notifications', 'UPDATE') || '|' || has_table_privilege('anon', 'public.notifications', 'DELETE')
          || '|' || has_table_privilege('anon', 'public.notifications', 'TRUNCATE');" | sed 's/true/t/g; s/false/f/g')"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
