#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_notifications_serveur_2026-09-15.sql (ASTRA-24)
#
# Socle = `notifications` avec sa policy d'INSERT de production
# (`from_id = auth.uid()`), `profiles` (DEUX HOMONYMES « Lea »), `posts`,
# `post_comments`, `conversations`, `conv_members`, `conv_messages`, `blocks`
# et `is_blocked_with` tels qu'en production. On mesure D'ABORD le défaut (un
# client écrit une 'mention' à texte libre vers qui il veut), on applique, puis :
# la policy refuse les genres du serveur, le client ne peut pas se dire
# 'serveur', `notifier_mentions` exige l'événement, porte des IDENTIFIANTS (les
# homonymes ne sont plus un problème : c'est l'id qui désigne), écarte bloqués
# et non-membres SANS le dire, dérive le texte, est idempotente, et trois
# mutations font rougir.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_notifications_serveur_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 7100 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; exit 1; }

DB=astra24
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1 || true; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1 || true; }
_v()   { if printf '%s' "$1" | grep -qi "error"; then echo REFUSE; else echo OK; fi; }
json() { printf '%s' "$1" | sed -n "s/.*\"$2\": *\([0-9]*\).*/\1/p"; }

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa   # l'auteur
L1=11111111-1111-4111-8111-111111111111  # Lea (1)
L2=22222222-2222-4222-8222-222222222222  # Lea (2), homonyme
B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb   # bloque A
C=cccccccc-cccc-4ccc-8ccc-cccccccccccc   # pas membre du groupe

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as \$fn\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$fn\$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;

create table public.profiles (id text primary key, username text);
create table public.posts (id text primary key, author_id text, created_at timestamptz default now());
create table public.post_comments (id text primary key, post_id text, author_id text, content text, created_at timestamptz default now());
create table public.conversations (id text primary key, is_group boolean default false, name text);
create table public.conv_members (conv_id text, user_id text, primary key (conv_id, user_id));
create table public.conv_messages (id text primary key, conv_id text, from_id text, content text, created_at timestamptz default now());
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text, seen boolean default false, created_at timestamptz default now());
alter table public.notifications enable row level security;
alter table public.post_comments enable row level security;
alter table public.conv_messages enable row level security;
-- Les policies de PRODUCTION (origine du 17/08 + messages-bloqués du 15/09, forme résumée).
create policy notifications_insert_own_author on public.notifications for insert to public with check (from_id = (select auth.uid())::text);
create policy notifications_select_own on public.notifications for select to public using (user_id = (select auth.uid())::text);
create policy comments_insert_own on public.post_comments for insert to public with check (author_id = (select auth.uid())::text);
create policy comments_select on public.post_comments for select to public using (true);
create policy messages_insert_own on public.conv_messages for insert to public with check (from_id = (select auth.uid())::text);
create policy messages_select on public.conv_messages for select to public using (true);
create or replace function public.is_blocked_with(_other text) returns boolean language sql security definer stable set search_path = '' as \$b\$
  select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
    else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other) or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end \$b\$;
revoke execute on function public.is_blocked_with(text) from public, anon; grant execute on function public.is_blocked_with(text) to authenticated;

insert into public.profiles values ('$A','Alex'), ('$L1','Lea'), ('$L2','Lea'), ('$B','Bruno'), ('$C','Chloe');
insert into public.posts values ('p1', '$L1');
insert into public.conversations values ('g1', true, 'Les grimpeurs');
insert into public.conv_members values ('g1','$A'), ('g1','$L1'), ('g1','$L2'), ('g1','$B');
insert into public.blocks values ('$B','$A');
SQL

echo "── ① LE DÉFAUT, MESURÉ AVANT ──────────────────────────────────────────"
verifier "un client écrit une 'mention' à TEXTE LIBRE vers n'importe qui : ACCEPTÉ" "OK" "$(_v "$(AUTH "$A" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_libre', '$C', 'mention', '$A', 'p1', 'texte sans rapport, vers quelqu''un que rien ne lie');")")"
verifier "…et la ligne existe, sans événement métier derrière" "1" "$(Q "select count(*)::int from public.notifications where id='n_libre';")"
Q "delete from public.notifications;" >/dev/null

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -10; exit 1; }
verifier "verdict : aucun ECHEC" "0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 && verifier "rejeu sans erreur" "oui" "oui" || verifier "rejeu sans erreur" "oui" "non"
verifier "la clause des genres réservés n'est posée qu'une fois" "1" "$(Q "select (length(with_check) - length(replace(with_check, 'genres_reserves_au_serveur', ''))) / length('genres_reserves_au_serveur') from pg_policies where policyname='notifications_insert_own_author';")"

echo "── ③ LE CLIENT NE PEUT PLUS ÉCRIRE LES GENRES DU SERVEUR, NI SE DIRE SERVEUR ──"
verifier "'mention' par un client : REFUSÉ" "REFUSE" "$(_v "$(AUTH "$A" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n2', '$L1', 'mention', '$A', 'p1', 'x');")")"
verifier "'follow' par un client : REFUSÉ" "REFUSE" "$(_v "$(AUTH "$A" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n3', '$L1', 'follow', '$A', '$A', 'x');")")"
verifier "'comment' par un client : toujours accepté (genre encore client)" "OK" "$(_v "$(AUTH "$A" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content, origine) values ('n4', '$L1', 'comment', '$A', 'p1', 'Alex a commenté', 'serveur');")")"
verifier "…mais son origine est FORCÉE à 'client', quoi qu'il ait envoyé" "client" "$(Q "select origine from public.notifications where id='n4';")"

echo "── ④ notifier_mentions : L'ÉVÉNEMENT D'ABORD ─────────────────────────"
verifier "sans commentaire récent de l'appelant : REFUSÉ (P0002)" "REFUSE" "$(_v "$(AUTH "$A" "select public.notifier_mentions('commentaire', 'p1', array['$L1']);")")"
verifier "anon : REFUSÉ" "REFUSE" "$(_v "$(ANON "select public.notifier_mentions('commentaire', 'p1', array['$L1']);")")"
verifier "genre inconnu : REFUSÉ" "REFUSE" "$(_v "$(AUTH "$A" "select public.notifier_mentions('like', 'p1', array['$L1']);")")"
AUTH "$A" "insert into public.post_comments (id, post_id, author_id, content) values ('c1', 'p1', '$A', 'Bonjour @Lea');" >/dev/null
r="$(AUTH "$A" "select public.notifier_mentions('commentaire', 'p1', array['$L2', '$L2', '$A'])::text;")"
verifier "commentaire récent, mention de Lea (2) PAR SON IDENTIFIANT : 1 notifiée (doublon et soi-même écartés)" "1" "$(json "$r" notifiees)"
verifier "…c'est Lea (2) qui est notifiée, pas l'homonyme Lea (1) : l'id désigne, pas le nom" "$L2" "$(Q "select user_id from public.notifications where kind='mention';")"
verifier "…le TEXTE est dérivé par le serveur, pas celui du client" "Alex t'a mentionné dans un commentaire" "$(Q "select content from public.notifications where kind='mention';")"
verifier "…origine = serveur" "serveur" "$(Q "select origine from public.notifications where kind='mention';")"
verifier "…et ref_id = la publication" "p1" "$(Q "select ref_id from public.notifications where kind='mention';")"
r2="$(AUTH "$A" "select public.notifier_mentions('commentaire', 'p1', array['$L2'])::text;")"
verifier "rejouée (renvoi) : idempotente, toujours UNE ligne" "1" "$(Q "select count(*)::int from public.notifications where kind='mention';")"
verifier "…et le compte rendu reste 1" "1" "$(json "$r2" notifiees)"

echo "── ⑤ DESTINATAIRES AUTORISÉS, ÉCARTÉS SANS LE DIRE ───────────────────"
r3="$(AUTH "$A" "select public.notifier_mentions('commentaire', 'p1', array['$B', '$L1', 'zzzz-inconnu'])::text;")"
verifier "Bruno (bloque A) et un id inconnu sont écartés, Lea (1) notifiée : notifiees = 1, demandees = 3" "1|3" "$(json "$r3" notifiees)|$(json "$r3" demandees)"
verifier "…aucune ligne vers Bruno (le blocage tient dans les DEUX sens)" "0" "$(Q "select count(*)::int from public.notifications where user_id='$B';")"
AUTH "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m1', 'g1', '$A', 'coucou @Chloe @Lea');" >/dev/null
r4="$(AUTH "$A" "select public.notifier_mentions('message', 'g1', array['$C', '$L1'])::text;")"
verifier "message de groupe : Chloe (NON membre) écartée, Lea (1) notifiée" "1" "$(json "$r4" notifiees)"
verifier "…texte dérivé avec le nom du groupe" "Alex t'a mentionné dans « Les grimpeurs »" "$(Q "select content from public.notifications where kind='mention' and ref_id='g1';")"
verifier "…aucune ligne vers Chloe" "0" "$(Q "select count(*)::int from public.notifications where user_id='$C';")"
verifier "plus de 20 identifiants : REFUSÉ" "REFUSE" "$(_v "$(AUTH "$A" "select public.notifier_mentions('message', 'g1', array(select 'x' || g::text from generate_series(1, 21) g));")")"
verifier "une mention sur une conversation où l'appelant n'a PAS écrit récemment : REFUSÉ" "REFUSE" "$(_v "$(AUTH "$L1" "select public.notifier_mentions('message', 'g1', array['$A']);")")"

echo "── ⑤ bis UN IDENTIFIANT PRÉEXISTANT, À UN AUTRE DESTINATAIRE, AVANT ON CONFLICT (16/09) ──"
# L'identifiant déterministe de « A mentionne Lea (1) sur p1 » est calculable par
# quiconque connaît la règle. On pose D'ABORD, sous cet identifiant, une ligne
# qui appartient à Chloe (un autre destinataire, un autre genre) — comme le
# ferait un squat avant la migration, ou une collision.
IDENT_L1="$(Q "select 'n_m_' || left(md5('commentaire' || '|' || 'p1' || '|' || '$A' || '|' || '$L1'), 20);")"
Q "delete from public.notifications where kind='mention' and ref_id='p1' and user_id='$L1';" >/dev/null
Q "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('$IDENT_L1', '$C', 'like', '$B', 'autre', 'la ligne de Chloe');" >/dev/null
r6="$(AUTH "$A" "select public.notifier_mentions('commentaire', 'p1', array['$L1'])::text;")"
verifier "la mention est comptée (notifiees = 1)" "1" "$(json "$r6" notifiees)"
verifier "la ligne de Chloe est INTACTE (destinataire, genre, texte)" "$C|like|la ligne de Chloe" "$(Q "select user_id || '|' || kind || '|' || content from public.notifications where id='$IDENT_L1';")"
verifier "…et Lea (1) reçoit quand même sa mention, sous un identifiant NEUF" "1" "$(Q "select count(*)::int from public.notifications where kind='mention' and ref_id='p1' and user_id='$L1' and id <> '$IDENT_L1' and id like 'n\\_m\\_%';")"
verifier "…d'origine serveur, texte dérivé" "serveur|Alex t'a mentionné dans un commentaire" "$(Q "select origine || '|' || content from public.notifications where kind='mention' and ref_id='p1' and user_id='$L1';")"
verifier "un client ne peut PAS écrire un identifiant de l'espace serveur (n_m_…)" "REFUSE" "$(_v "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_m_squat_' || md5('x'), '$B', 'like', '$B', 'p9', 'squat');")")"
verifier "…mais un identifiant ordinaire, oui (genre client)" "OK" "$(_v "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_ordinaire', '$L1', 'like', '$B', 'p9', 'ok');")")"
Q "delete from public.notifications where id in ('$IDENT_L1', 'n_ordinaire');" >/dev/null

echo "── ⑥ MUTATIONS : le banc doit ROUGIR ─────────────────────────────────"
Q "alter policy notifications_insert_own_author on public.notifications with check (from_id = (select auth.uid())::text);" >/dev/null
verifier "mutation « clause retirée » : 'mention' par un client repasse" "OK" "$(_v "$(AUTH "$A" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_mut', '$L1', 'mention', '$A', 'p1', 'x');")")"
Q "delete from public.notifications where id='n_mut';" >/dev/null
Q "alter table public.notifications disable trigger trg_notifications_origine;" >/dev/null
verifier "mutation « trigger d'origine coupé » : un client se dit 'serveur'" "serveur" "$(AUTH "$A" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content, origine) values ('n_mut2', '$L1', 'comment', '$A', 'p1', 'x', 'serveur');" >/dev/null; Q "select origine from public.notifications where id='n_mut2';")"
Q "delete from public.notifications where id='n_mut2';" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" >/dev/null 2>&1 || true
Q "alter table public.notifications enable trigger trg_notifications_origine;" >/dev/null
verifier "…rejouée : 'mention' client refusée de nouveau" "REFUSE" "$(_v "$(AUTH "$A" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_mut3', '$L1', 'mention', '$A', 'p1', 'x');")")"
Q "create or replace function public.notifier_mentions(p_genre text, p_ref_id text, p_mentionnes text[]) returns jsonb language plpgsql security definer set search_path = '' as \$m\$ declare c text; n int := 0; begin perform set_config('passio.notification_serveur','1',true); foreach c in array p_mentionnes loop insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_x' || c, c, 'mention', (auth.uid())::text, p_ref_id, 'x') on conflict (id) do nothing; n := n + 1; end loop; return jsonb_build_object('notifiees', n); end \$m\$;" >/dev/null
r5="$(AUTH "$A" "select public.notifier_mentions('commentaire', 'p1', array['$B'])::text;")"
verifier "mutation « plus de contrôle des destinataires » : Bruno (bloqueur) est notifié → un banc qui exige 0 rougit" "1" "$(json "$r5" notifiees)"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" >/dev/null 2>&1 || true
Q "delete from public.notifications where user_id='$B';" >/dev/null
verifier "…rétabli : Bruno n'est plus notifié" "0" "$(json "$(AUTH "$A" "select public.notifier_mentions('commentaire', 'p1', array['$B'])::text;")" notifiees)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
