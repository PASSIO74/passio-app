#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_broadcast_bloque_2026-09-15.sql (ASTRA-22 / MSG-10)
#
# ⚠️ CE BANC EXÉCUTE LE TRIGGER, il ne lit pas `prosrc`. `realtime.broadcast_changes`
# n'existe pas sur un PostgreSQL nu : on en pose un DOUBLE qui ENREGISTRE le
# topic servi. On mesure donc « QUI a reçu la trame », c'est-à-dire exactement
# ce qu'un WebSocket verrait — pas une chaîne trouvée dans une définition.
# (Même discipline que `migration-search-path`, qui APPELLE la fonction figée.)
#
# Socle = la messagerie de production réduite : conv_members, conv_messages,
# blocks, is_conv_member, is_blocked_with, la policy SELECT de MSG-10 telle
# qu'elle est en production (relue le 15/09), et le trigger de diffusion tel
# qu'il est en production (migration_realtime_user_topic.sql, sans filtre).
#
# On mesure AVANT (B reçoit la trame d'un message de A qui l'a bloqué, alors
# que son GET ne rend rien), on applique, on rejoue, puis on éprouve les deux
# sens, le tiers, le déblocage, l'écho à l'auteur — et DEUX mutations, dont
# celle qui montre que `is_blocked_with` filtre sur le chemin client et CESSE
# de filtrer, en silence, sur les chemins sans session (service_role…).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_broadcast_bloque_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6050 + RANDOM % 120 ))
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

DB=astra22
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa; B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb; C=cccccccc-cccc-4ccc-8ccc-cccccccccccc

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated;
create schema auth; create schema realtime;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
-- ⚠️ LE DOUBLE DE REALTIME : il ENREGISTRE ce qui aurait été diffusé. C'est ce
-- journal qui est mesuré, donc le comportement, pas une définition de fonction.
create table realtime.trames (topic text, charge text, at timestamptz default now());
create function realtime.broadcast_changes(_topic text, _ev text, _op text, _table text, _schema text, _new record, _old record)
returns void language plpgsql as $fn$ begin insert into realtime.trames (topic, charge) values (_topic, _new::text); end $fn$;

create table public.conv_members (conv_id text, user_id text, primary key (conv_id, user_id));
create table public.blocks (blocker_id text, blocked_id text, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create table public.conv_messages (id text primary key, conv_id text not null, from_id text not null, content text, created_at timestamptz default now());
alter table public.conv_members enable row level security; alter table public.blocks enable row level security; alter table public.conv_messages enable row level security;
create function public.is_conv_member(_conv text, _uid text) returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.conv_members m where m.conv_id = _conv and m.user_id = _uid) $fn$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
  else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other) or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end $fn$;
create function public.conv_1a1_bloquee(_conv text) returns boolean language sql stable security definer set search_path = '' as $fn$ select false $fn$;
-- La policy SELECT telle qu'elle est EN PRODUCTION depuis MSG-10 (relue le 15/09).
create policy conv_messages_select_member on public.conv_messages for select to authenticated
  using (public.is_conv_member(conv_id, (select auth.uid())::text) and not public.is_blocked_with(from_id));
create policy conv_messages_insert_member on public.conv_messages for insert to authenticated
  with check (from_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text) and not public.conv_1a1_bloquee(conv_id));
-- Le trigger de diffusion TEL QU'IL EST EN PRODUCTION : aucun filtre de blocage.
create function public.broadcast_conv_message_to_users() returns trigger language plpgsql security definer set search_path = public, realtime as $fn$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
    PERFORM realtime.broadcast_changes('user:' || m.user_id, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD);
  END LOOP;
  RETURN NEW;
END $fn$;
create trigger broadcast_conv_message_users_trigger after insert on public.conv_messages
  for each row execute function public.broadcast_conv_message_to_users();

insert into public.conv_members values ('grp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('grp', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), ('grp', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.blocks (blocker_id, blocked_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SQL

# Qui a reçu la trame du message <id> ? (les topics, triés)
RECU()  { Q "select coalesce(string_agg(distinct replace(topic,'user:',''), ',' order by replace(topic,'user:','')),'') from realtime.trames where charge like '%' || '$1' || '%';"; }
# Que rend le GET REST de <uid> sur le groupe ?
VOIT()  { AUTH "$1" "select coalesce(string_agg(id, ',' order by id),'') from public.conv_messages where conv_id='grp';"; }
ECRIRE(){ AUTH "$1" "insert into public.conv_messages (id, conv_id, from_id, content) values ('$2','grp','$1','texte');" >/dev/null; }

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
ECRIRE "$A" "m_av1"
verifier "avant : la LECTURE REST de B est bien fermée (MSG-10 fait son office)" "" "$(VOIT "$B")"
verifier "avant : mais B REÇOIT la trame du message de A — le broadcast contourne" "$A,$B,$C" "$(RECU m_av1)"
ECRIRE "$B" "m_av2"
verifier "avant : et A reçoit la trame de B, qu'il a pourtant bloqué" "$A,$B,$C" "$(RECU m_av2)"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
verifier "verdict 7 OK / 0 ECHEC" "7/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -8; exit 1; }
verifier "rejeu : toujours 7 OK" "7" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ CE QUI CHANGE — mesuré sur les TRAMES, pas sur une définition ───"
ECRIRE "$A" "m_ap1"
verifier "A écrit : B ne reçoit plus rien ; A (écho) et C oui" "$A,$C" "$(RECU m_ap1)"
ECRIRE "$B" "m_ap2"
verifier "B écrit : A ne reçoit plus rien ; B (écho) et C oui — symétrique" "$B,$C" "$(RECU m_ap2)"
ECRIRE "$C" "m_ap3"
verifier "C écrit : les trois reçoivent, le blocage A/B n'y est pour rien" "$A,$B,$C" "$(RECU m_ap3)"
verifier "l'auteur reçoit toujours son propre écho" "oui" "$(case "$(RECU m_ap1)" in *"$A"*) echo oui;; *) echo non;; esac)"
verifier "la lecture REST n'a pas bougé : B lit les siens et ceux de C, jamais A" "m_ap2,m_ap3,m_av2" "$(VOIT "$B")"

echo "── ④ DÉBLOQUER REND TOUT ─────────────────────────────────────────────"
Q "delete from public.blocks;" >/dev/null
ECRIRE "$A" "m_ap4"
verifier "après déblocage : B reçoit de nouveau les trames de A" "$A,$B,$C" "$(RECU m_ap4)"
verifier "et rien n'avait été supprimé : B relit tout l'historique" "m_ap1,m_ap2,m_ap3,m_ap4,m_av1,m_av2" "$(VOIT "$B")"
Q "insert into public.blocks (blocker_id, blocked_id) values ('$A','$B');" >/dev/null

echo "── ⑤ L'ORACLE N'EST PAS OUVERT ───────────────────────────────────────"
verifier "anon ne peut pas appeler blocage_entre" "f" "$(Q "select has_function_privilege('anon','public.blocage_entre(text,text)','EXECUTE');")"
verifier "authenticated non plus — ce serait un oracle sur un couple quelconque" "f" "$(Q "select has_function_privilege('authenticated','public.blocage_entre(text,text)','EXECUTE');")"

echo "── ⑥ MUTATIONS : le banc doit ROUGIR ────────────────────────────────"
# Mutation 1 : le filtre purement et simplement retiré (l'état d'AVANT).
Q "create or replace function public.broadcast_conv_message_to_users() returns trigger language plpgsql security definer set search_path = public, realtime as \$fn\$
DECLARE m RECORD; BEGIN FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
  PERFORM realtime.broadcast_changes('user:' || m.user_id, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD); END LOOP; RETURN NEW; END \$fn\$;" >/dev/null
ECRIRE "$A" "m_mut1"
verifier "mutation « filtre retiré » : B reçoit de nouveau → le banc le voit" "$A,$B,$C" "$(RECU m_mut1)"

# ══════════════════════════════════════════════════════════════════════════
# Mutation 2 — CELLE QUI COMPTE, ET ELLE CORRIGE LA CONTRE-REVUE.
# Astra écrit « ne pas utiliser aveuglément une fonction basée sur auth.uid()
# dans un trigger privilégié », en laissant entendre qu'elle testerait le
# mauvais couple. MESURÉ ici : ce n'est pas si simple, et la nuance décide du
# test à écrire.
#   · quand l'AUTEUR insère depuis SA session — le chemin client, celui que la
#     policy INSERT impose (from_id = auth.uid()) — `is_blocked_with` teste le
#     BON couple et filtre CORRECTEMENT ;
#   · quand l'insertion vient d'une session SANS jeton (service_role, Edge
#     Function, message système, rejeu de restauration), `auth.uid()` est NULL,
#     `is_blocked_with` rend FALSE, et le filtre DISPARAÎT EN SILENCE.
# Le piège n'est donc pas « ça ne filtre jamais » mais « ça filtre pendant les
# tests et cesse de filtrer sur les chemins serveur » — pire, car muet.
# ══════════════════════════════════════════════════════════════════════════
Q "create or replace function public.broadcast_conv_message_to_users() returns trigger language plpgsql security definer set search_path = public, realtime as \$fn\$
DECLARE m RECORD; BEGIN FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
  IF NOT public.is_blocked_with(m.user_id) THEN
    PERFORM realtime.broadcast_changes('user:' || m.user_id, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD); END IF; END LOOP; RETURN NEW; END \$fn\$;" >/dev/null
ECRIRE "$A" "m_mut2a"
verifier "is_blocked_with, chemin CLIENT (auteur en session) : filtre bien — la nuance" "$A,$C" "$(RECU m_mut2a)"
# Chemin SERVEUR : pas de jeton. C'est là que la variante « facile » meurt.
Q "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_mut2b','grp','$A','texte serveur');" >/dev/null
verifier "is_blocked_with, chemin SERVEUR (sans session) : NE FILTRE PLUS, en silence" "$A,$B,$C" "$(RECU m_mut2b)"

# Et la migration, elle, tient sur les DEUX chemins.
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" 2>&1)" || true
verifier "…la migration rétablit le bon prédicat" "7" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*OK\s*$' || true)"
ECRIRE "$A" "m_mut3"
verifier "rétabli, chemin CLIENT : B ne reçoit plus" "$A,$C" "$(RECU m_mut3)"
Q "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_mut4','grp','$A','texte serveur');" >/dev/null
verifier "rétabli, chemin SERVEUR : B ne reçoit plus NON PLUS — c'est tout l'objet" "$A,$C" "$(RECU m_mut4)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
