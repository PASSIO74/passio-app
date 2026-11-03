#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_conv_members_reparation_2026-11-03.sql
#
# PostgreSQL JETABLE, données SYNTHÉTIQUES : `profiles`, `conversations`,
# `conv_members` (clés étrangères, policy INSERT « Ecriture propre » réduite à
# sa branche créateur, barrière `zz_barriere_suppression` de production),
# `conv_messages`, `blocks`, `comptes_en_suppression`, et `conv_reads` portant
# la policy INSERT que pose `migration_audit_2026-11-02_oracles_et_privileges.sql`
# (identité ET appartenance). Onze conversations, une par cas :
#   c1  1:1, le pair a écrit, sa ligne manque            → RÉPARÉ (pair)
#   c2  1:1 sans aucun membre, les deux ont écrit         → RÉPARÉ (les deux)
#   c3  1:1, le créateur a écrit, sa ligne manque         → RÉPARÉ (créateur)
#   c4  1:1 complet + un TIERS qui a écrit (cas de prod)  → intouché
#   c5  groupe dont le créateur est PARTI                 → intouché
#   c6  evgrp_ (is_group faux : le préfixe suffit)        → intouché
#   c7  1:1 ambigu (deux autres émetteurs, aucun membre)  → intouché
#   c8  1:1, le pair est en cours de suppression          → intouché, sans faire tomber la transaction
#   c9  1:1, le pair a bloqué le créateur                 → intouché
#   c10 1:1, le pair n'a jamais écrit                     → intouché
#   c11 1:1 sans créateur                                  → intouché
# Ce qu'il prouve :
#   ⓪ LE DÉFAUT D'ABORD : le pair de c1 ne pose pas son accusé de lecture
#      (policy des oracles), et ne peut pas se réinscrire lui-même (seul le
#      créateur peut) ;
#   ① la migration s'applique, verdict 2 OK / 0 ECHEC, et ses NOMBRES ;
#   ② exactement les 4 lignes attendues sont posées, rien d'autre ; le pair
#      réparé pose son accusé, le tiers non ;
#   ③ REJEU : 0 ligne, verdict toujours vert ;
#   ④ RETOUR ARRIÈRE de l'en-tête, exécuté tel quel : il refuse un compte
#      faux, puis efface les 4 lignes de la transaction et elles seules (une
#      ligne posée APRÈS par le créateur reste) ; ré-application : 4 de nouveau ;
#   ⑤ MUTATIONS (base neuve chacune) : sans la règle du tiers, le tiers est
#      inscrit ; sans la règle du genre, un créateur PARTI de son groupe et de
#      sa discussion d'activité est réinscrit ; sans l'exclusion des comptes en
#      suppression, la barrière fait tomber toute la migration.
# ⚠️ `set local role` et sa requête partent dans le MÊME appel psql (ADR-012).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_conv_members_reparation_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6400 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
TRAVAIL="$(mktemp -d)"
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE" "$TRAVAIL"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=reparation
QS() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
Q()  { QS "$DB" "$1"; }
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v VERBOSITY=verbose -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_ok() { if printf '%s' "$1" | grep -q "ERROR"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
# Applique la migration (ou une variante) : sortie non alignée « contrôle|valeur ».
appliquer() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -q -tA -F '|' -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
valeur() { printf '%s\n' "$1" | grep -F -- "$2" | head -1 | awk -F'|' '{print $NF}'; }
rouges() { printf '%s\n' "$1" | grep -cE '\|ECHEC$' || true; }
verts()  { printf '%s\n' "$1" | grep -cE '\|OK$' || true; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qF -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

# Identifiants synthétiques : k = créateur, p = pair, t = tiers… (uuid valides pour auth.uid()).
u() { printf '%08d-0000-4000-8000-000000000000' "$1"; }
K1=$(u 101); P1=$(u 201); K2=$(u 102); P2=$(u 202); K3=$(u 103); P3=$(u 203)
K4=$(u 104); P4=$(u 204); T4=$(u 304); K5=$(u 105); M5=$(u 205); K6=$(u 106); V6=$(u 206)
K7=$(u 107); X7=$(u 207); Y7=$(u 307); K8=$(u 108); P8=$(u 208); K9=$(u 109); P9=$(u 209)
K10=$(u 110); P10=$(u 210); A11=$(u 111); B11=$(u 211)

socle() {
psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -q -v ON_ERROR_STOP=1 \
  -v K1="$K1" -v P1="$P1" -v K2="$K2" -v P2="$P2" -v K3="$K3" -v P3="$P3" -v K4="$K4" -v P4="$P4" -v T4="$T4" \
  -v K5="$K5" -v M5="$M5" -v K6="$K6" -v V6="$V6" -v K7="$K7" -v X7="$X7" -v Y7="$Y7" -v K8="$K8" -v P8="$P8" \
  -v K9="$K9" -v P9="$P9" -v K10="$K10" -v P10="$P10" -v A11="$A11" -v B11="$B11" >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;

create table public.profiles (id text primary key);
create table public.conversations (id text primary key, is_group boolean default false, created_by text, created_at timestamp default now());
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null references public.profiles(id),
  primary key (conv_id, user_id));
create table public.conv_messages (id text primary key, conv_id text references public.conversations(id), from_id text references public.profiles(id),
  content text, created_at timestamp without time zone default now());
create table public.blocks (blocker_id text, blocked_id text);
create table public.comptes_en_suppression (user_id text, statut text);
create table public.conv_reads (conv_id text not null, user_id text not null, last_read_at timestamptz, primary key (conv_id, user_id));

create function public.is_conv_member(_conv_id text, _uid text) returns boolean language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
create function public.is_conversation_creator(_conv_id text) returns boolean language sql stable security definer set search_path to ''
as $fn$ select case when auth.uid() is null or _conv_id is null then false
  else exists (select 1 from public.conversations c where c.id = _conv_id and c.created_by = (auth.uid())::text) end $fn$;
-- Barrière de PRODUCTION (pg_get_functiondef, 2026-11-03).
create function public.refuser_ecriture_compte_en_suppression() returns trigger language plpgsql security definer set search_path to ''
as $fn$
declare col text; val text; ligne jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := ligne ->> col;
    if val is not null and exists (select 1 from public.comptes_en_suppression c where c.user_id = val and c.statut in ('en_cours', 'purgee', 'supprimee')) then
      raise exception 'new row violates row-level security policy for table "%"', tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end $fn$;
create trigger zz_barriere_suppression before insert or update on public.conv_members
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');

alter table public.conv_members enable row level security;
alter table public.conv_reads enable row level security;
-- « Ecriture propre » de production, sans sa branche d'activité (aucun événement ici) :
-- seul le CRÉATEUR inscrit quelqu'un dans un 1:1.
create policy "Ecriture propre" on public.conv_members for insert to authenticated with check (public.is_conversation_creator(conv_id));
create policy conv_members_select_member on public.conv_members for select to authenticated using (public.is_conv_member(conv_id, (select auth.uid())::text));
-- La policy INSERT de conv_reads APRÈS migration_audit_2026-11-02_oracles_et_privileges.sql.
create policy reads_upsert on public.conv_reads for insert to authenticated
  with check (user_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text));

insert into public.profiles (id) values (:'K1'), (:'P1'), (:'K2'), (:'P2'), (:'K3'), (:'P3'), (:'K4'), (:'P4'), (:'T4'), (:'K5'), (:'M5'),
  (:'K6'), (:'V6'), (:'K7'), (:'X7'), (:'Y7'), (:'K8'), (:'P8'), (:'K9'), (:'P9'), (:'K10'), (:'P10'), (:'A11'), (:'B11');
insert into public.conversations (id, is_group, created_by) values
  ('conv_c1', false, :'K1'), ('conv_c2', null, :'K2'), ('conv_c3', false, :'K3'), ('conv_c4', false, :'K4'),
  ('grp_c5', true, :'K5'), ('evgrp_c6', false, :'K6'), ('conv_c7', false, :'K7'), ('conv_c8', false, :'K8'),
  ('conv_c9', false, :'K9'), ('conv_c10', false, :'K10'), ('conv_c11', false, null);
insert into public.conv_members (conv_id, user_id) values
  ('conv_c1', :'K1'), ('conv_c3', :'P3'), ('conv_c4', :'K4'), ('conv_c4', :'P4'), ('grp_c5', :'M5'),
  ('conv_c8', :'K8'), ('conv_c9', :'K9'), ('conv_c10', :'K10');
insert into public.conv_messages (id, conv_id, from_id, content) values
  ('m1a', 'conv_c1', :'K1', 'x'), ('m1b', 'conv_c1', :'P1', 'x'), ('m1c', 'conv_c1', :'P1', 'x'),
  ('m2a', 'conv_c2', :'K2', 'x'), ('m2b', 'conv_c2', :'P2', 'x'),
  ('m3a', 'conv_c3', :'K3', 'x'), ('m3b', 'conv_c3', :'P3', 'x'),
  ('m4a', 'conv_c4', :'K4', 'x'), ('m4b', 'conv_c4', :'P4', 'x'), ('m4c', 'conv_c4', :'T4', 'x'),
  ('m5a', 'grp_c5', :'K5', 'x'), ('m5b', 'grp_c5', :'M5', 'x'),
  ('m6a', 'evgrp_c6', :'K6', 'x'), ('m6b', 'evgrp_c6', :'V6', 'x'),
  ('m7a', 'conv_c7', :'K7', 'x'), ('m7b', 'conv_c7', :'X7', 'x'), ('m7c', 'conv_c7', :'Y7', 'x'),
  ('m8a', 'conv_c8', :'K8', 'x'), ('m8b', 'conv_c8', :'P8', 'x'),
  ('m9a', 'conv_c9', :'K9', 'x'), ('m9b', 'conv_c9', :'P9', 'x'),
  ('m10a', 'conv_c10', :'K10', 'x'),
  ('m11a', 'conv_c11', :'A11', 'x'), ('m11b', 'conv_c11', :'B11', 'x');
insert into public.comptes_en_suppression (user_id, statut) values (:'P8', 'en_cours');
insert into public.blocks (blocker_id, blocked_id) values (:'P9', :'K9');
SQL
}

membre() { QS "${3:-$DB}" "select count(*) from public.conv_members where conv_id = '$1' and user_id = '$2';"; }

psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
socle "$DB"
LIGNES_AVANT="$(Q "select count(*) from public.conv_members;")"

echo "── ⓪ LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
contient "avant : le pair de c1 ne pose pas son accusé de lecture (42501, policy des oracles)" "42501" \
  "$(EN "$P1" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('conv_c1', '$P1', now());")"
contient "avant : le pair ne peut pas se réinscrire lui-même (seul le créateur peut)" "42501" \
  "$(EN "$P1" "insert into public.conv_members (conv_id, user_id) values ('conv_c1', '$P1');")"

echo "── ① APPLICATION ET VERDICT ──────────────────────────────────────────"
s1="$(appliquer "$DB" "$MIGRATION")" || { echo "  ❌ la migration a échoué :"; echo "$s1" | tail -5; exit 1; }
verifier "verdict 2 OK / 0 ECHEC" "2/0" "$(verts "$s1")/$(rouges "$s1")"
verifier "AVANT : 15 couples sans appartenance" "15" "$(valeur "$s1" "couples (conversation, émetteur) sans appartenance, AVANT")"
verifier "dont réparables : 4" "4" "$(valeur "$s1" "dont réparables")"
verifier "laissés : groupes 1" "1" "$(valeur "$s1" "laissés : groupes")"
verifier "laissés : evgrp_ 2" "2" "$(valeur "$s1" "laissés : discussions d'activité evgrp_")"
verifier "laissés : tiers 1" "1" "$(valeur "$s1" "laissés : tiers d'un 1:1")"
verifier "laissés : autres 7 (3 ambigus, 1 suppression, 1 blocage, 2 sans créateur)" "7" "$(valeur "$s1" "laissés : 1:1 ambigu")"
verifier "lignes insérées : 4" "4" "$(valeur "$s1" "lignes conv_members insérées par cette transaction")"
verifier "APRÈS : 11 couples sans appartenance" "11" "$(valeur "$s1" "couples (conversation, émetteur) sans appartenance, APRÈS")"
XID1="$(valeur "$s1" "transaction (xmin des lignes insérées")"
verifier "le numéro de transaction est imprimé" "oui" "$(printf '%s' "$XID1" | grep -qE '^[0-9]+$' && echo oui || echo "non ($XID1)")"
absent_perso="$(printf '%s\n' "$s1" | grep -cE '[0-9]{8}-0000-4000' || true)"
verifier "le verdict ne porte aucun identifiant de compte" "0" "$absent_perso"

echo "── ② EXACTEMENT LES LIGNES ATTENDUES ─────────────────────────────────"
verifier "c1 : le pair est réinscrit" "1" "$(membre conv_c1 "$P1")"
verifier "c2 : le créateur ET le pair sont réinscrits" "1|1" "$(membre conv_c2 "$K2")|$(membre conv_c2 "$P2")"
verifier "c3 : le créateur est réinscrit" "1" "$(membre conv_c3 "$K3")"
verifier "c4 : le TIERS n'est pas inscrit (cas mesuré en production)" "0" "$(membre conv_c4 "$T4")"
verifier "c5 : le créateur PARTI de son groupe n'est pas réinscrit" "0" "$(membre grp_c5 "$K5")"
verifier "c6 : ni l'organisateur ni le participant PARTIS de la discussion d'activité" "0|0" "$(membre evgrp_c6 "$K6")|$(membre evgrp_c6 "$V6")"
verifier "c7 : 1:1 ambigu, personne" "0" "$(Q "select count(*) from public.conv_members where conv_id = 'conv_c7';")"
verifier "c8 : le compte en suppression n'est pas inscrit (et la transaction n'est pas tombée)" "0" "$(membre conv_c8 "$P8")"
verifier "c9 : blocage, le pair n'est pas inscrit" "0" "$(membre conv_c9 "$P9")"
verifier "c10 : le pair qui n'a jamais écrit n'est pas inscrit" "0" "$(membre conv_c10 "$P10")"
verifier "c11 : sans créateur, personne" "0" "$(Q "select count(*) from public.conv_members where conv_id = 'conv_c11';")"
verifier "au total, 4 lignes de plus et pas une de plus" "$((LIGNES_AVANT + 4))" "$(Q "select count(*) from public.conv_members;")"
verifier "le pair réparé de c1 pose son accusé de lecture" "OK" "$(_ok "$(EN "$P1" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('conv_c1', '$P1', now());")")"
contient "le tiers de c4, lui, reste refusé (ce que veut la migration des oracles)" "42501" \
  "$(EN "$T4" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('conv_c4', '$T4', now());")"

echo "── ③ REJEU ───────────────────────────────────────────────────────────"
s2="$(appliquer "$DB" "$MIGRATION")" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$s2" | tail -5; exit 1; }
verifier "rejeu : verdict 2 OK / 0 ECHEC" "2/0" "$(verts "$s2")/$(rouges "$s2")"
verifier "rejeu : 0 réparable, 0 ligne insérée, 11 couples laissés" "0|0|11" \
  "$(valeur "$s2" "dont réparables")|$(valeur "$s2" "lignes conv_members insérées par cette transaction")|$(valeur "$s2" "couples (conversation, émetteur) sans appartenance, AVANT")"
verifier "rejeu : le total ne bouge pas" "$((LIGNES_AVANT + 4))" "$(Q "select count(*) from public.conv_members;")"

echo "── ④ LE RETOUR ARRIÈRE DE L'EN-TÊTE, EXÉCUTÉ TEL QUEL ────────────────"
grep '^--| ' "$MIGRATION" | sed 's/^--| //' > "$TRAVAIL/retour.sql"
verifier "l'en-tête porte un bloc de retour arrière" "oui" "$(grep -q 'delete from public.conv_members where xmin = x' "$TRAVAIL/retour.sql" && echo oui || echo non)"
# Une ligne posée APRÈS la migration, par la voie normale (le créateur de c10 inscrit son pair).
verifier "après coup, le créateur de c10 inscrit son pair (voie normale)" "OK" "$(_ok "$(EN "$K10" "insert into public.conv_members (conv_id, user_id) values ('conv_c10', '$P10');")")"
sed -e "s/<XID>/$XID1/" -e "s/<N>/3/" "$TRAVAIL/retour.sql" > "$TRAVAIL/retour_faux.sql"
contient "un compte faux : le retour arrière REFUSE" "retour arrière refusé : 4 ligne(s) portent ce xmin, 3 attendue(s)" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -f "$TRAVAIL/retour_faux.sql" 2>&1)"
verifier "… et n'efface rien" "$((LIGNES_AVANT + 5))" "$(Q "select count(*) from public.conv_members;")"
sed -e "s/<XID>/$XID1/" -e "s/<N>/4/" "$TRAVAIL/retour.sql" > "$TRAVAIL/retour_juste.sql"
verifier "le compte du verdict : le retour arrière passe" "OK" "$(_ok "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -f "$TRAVAIL/retour_juste.sql" 2>&1)")"
verifier "les 4 lignes réparées sont parties" "0|0|0|0" "$(membre conv_c1 "$P1")|$(membre conv_c2 "$K2")|$(membre conv_c2 "$P2")|$(membre conv_c3 "$K3")"
verifier "la ligne posée après la migration est restée" "1" "$(membre conv_c10 "$P10")"
verifier "l'état d'avant est rendu (+ la ligne d'après)" "$((LIGNES_AVANT + 1))" "$(Q "select count(*) from public.conv_members;")"
s3="$(appliquer "$DB" "$MIGRATION")" || { echo "  ❌ la ré-application a échoué"; echo "$s3" | tail -5; exit 1; }
verifier "ré-application : 4 lignes de nouveau, verdict vert" "4|2/0" "$(valeur "$s3" "lignes conv_members insérées par cette transaction")|$(verts "$s3")/$(rouges "$s3")"

echo "── ⑤ MUTATIONS : LE BANC VOIT CE QU'ON RETIRE ────────────────────────"
muter() { # $1 = base, $2 = expression sed, $3 = fichier muté
  psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $1" >/dev/null
  socle "$1"
  sed "$2" "$MIGRATION" > "$3"
  cmp -s "$MIGRATION" "$3" && { echo "  ❌ mutation sans effet sur $1 : la ligne visée a changé"; ko=$((ko+1)); }
  return 0
}
muter mut_tiers "/then 'tiers'$/d" "$TRAVAIL/mut_tiers.sql"
appliquer mut_tiers "$TRAVAIL/mut_tiers.sql" >/dev/null 2>&1 || true
verifier "(a) sans la règle du tiers : le TIERS de c4 serait inscrit" "1" "$(membre conv_c4 "$T4" mut_tiers)"
muter mut_genre "/then conv.genre$/d" "$TRAVAIL/mut_genre.sql"
appliquer mut_genre "$TRAVAIL/mut_genre.sql" >/dev/null 2>&1 || true
verifier "(b) sans la règle du genre : le créateur PARTI de son groupe et de sa discussion d'activité serait réinscrit" "1|1" \
  "$(membre grp_c5 "$K5" mut_genre)|$(membre evgrp_c6 "$K6" mut_genre)"
muter mut_supp "/then 'compte_en_suppression'$/d" "$TRAVAIL/mut_supp.sql"
sm="$(appliquer mut_supp "$TRAVAIL/mut_supp.sql" || true)"
contient "(c) sans l'exclusion des comptes en suppression : la barrière fait TOMBER la migration" "violates row-level security policy" "$sm"
verifier "(c) … et rien n'est réparé du tout" "0" "$(membre conv_c1 "$P1" mut_supp)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
