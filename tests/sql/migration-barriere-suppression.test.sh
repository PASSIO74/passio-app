#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_barriere_suppression_2026-09-15.sql (v2)
# ASTRA-25 (4e passe) · ASTRA-39 / ASTRA-40 (5e passe, 2026-09-15)
#
# CE QUE CE BANC MESURE, ET CONTRE QUOI :
#   · le SOCLE est CONSTRUIT DEPUIS `TABLES_COMPTE` (purge-compte.js), pas depuis
#     la liste de la migration : c'est le contrôle de couverture INDÉPENDANT
#     qu'ASTRA-39 exige. Chaque table de la purge existe ici avec ses colonnes
#     d'identifiant, RLS active, et une policy d'écriture pour `authenticated`.
#     Trois tables (`user_state`, `profiles`, `conv_reads`) gardent leurs
#     policies de production ; les autres reçoivent `with check (true)`, c'est-
#     à-dire « un client peut écrire cette ligne » — le cas d'un TIERS qui vise
#     le compte (B suit A, B notifie A…) ;
#   · l'appelant lui-même (second appareil, ancien jeton, requête tardive) ;
#   · un TIERS authentifié qui écrit une ligne portant l'identifiant de A ;
#   · une écriture SANS SESSION (anonyme sur `client_errors`, trigger
#     privilégié SECURITY DEFINER, clé de service) ;
#   · l'ÉTAT PAR TENTATIVE (ASTRA-40) : deux réclamations, un retrait avec le
#     mauvais jeton, une tentative morte reprise, `echec` qui ne bloque plus ;
#   · trois MUTATIONS qui doivent faire rougir le banc.
# L'écriture DÉJÀ ENGAGÉE (ASTRA-41) a son propre banc, à deux connexions :
# `tests/sql/ecriture-en-vol-suppression.test.sh`.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_barriere_suppression_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable (le socle est dérivé de TABLES_COMPTE)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

# ── Le socle, DÉRIVÉ de TABLES_COMPTE ─────────────────────────────────────
# `node` rend deux choses : le DDL des tables génériques, et la liste
# `table|colonne` que le banc parcourt ensuite. Rien ici ne lit la migration.
SOCLE_JS='
import { pathToFileURL } from "node:url";
const { TABLES_COMPTE } = await import(pathToFileURL(process.argv[1]).href);
const speciales = new Set(["user_state", "profiles", "conv_reads"]);
const parTable = new Map();
for (const [t, c] of TABLES_COMPTE) { if (!parTable.has(t)) parTable.set(t, []); parTable.get(t).push(c); }
const ddl = [];
for (const [t, cols] of parTable) {
  if (speciales.has(t)) continue;
  ddl.push(`create table public.${t} (id serial primary key, ${cols.map((c) => c + " text").join(", ")}, blob text);`);
  ddl.push(`alter table public.${t} enable row level security;`);
  ddl.push(`create policy ${t}_ins on public.${t} for insert to authenticated with check (true);`);
  ddl.push(`create policy ${t}_upd on public.${t} for update to authenticated using (true) with check (true);`);
  ddl.push(`create policy ${t}_sel on public.${t} for select to authenticated using (true);`);
}
// `client_errors` accepte aussi l ANONYME (production : with check (true) to public).
ddl.push("create policy client_errors_anon on public.client_errors for insert to anon with check (true);");
if (process.argv[2] === "ddl") console.log(ddl.join("\n"));
else console.log(TABLES_COMPTE.map(([t, c]) => t + "|" + c).join("\n"));
'
DDL="$(node --input-type=module -e "$SOCLE_JS" "$RACINE/supabase/functions/_shared/purge-compte.js" ddl 2>/dev/null)"
PAIRES="$(node --input-type=module -e "$SOCLE_JS" "$RACINE/supabase/functions/_shared/purge-compte.js" paires 2>/dev/null)"
[ -n "$DDL" ] && [ -n "$PAIRES" ] || { echo "❌ impossible de dériver le socle de TABLES_COMPTE"; exit 1; }

PORT=$(( 6650 + RANDOM % 120 ))
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

DB=astra25
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1 || true; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1 || true; }
SVC()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role service_role; $1" 2>&1 || true; }
_v()   { if printf '%s' "$1" | grep -qi "error"; then echo REFUSE; else echo OK; fi; }
AUTH_V() { _v "$(AUTH "$1" "$2")"; }
ANON_V() { _v "$(ANON "$1")"; }
json()   { printf '%s' "$1" | sed -n "s/.*\"$2\": *\"\{0,1\}\([^,}\"]*\)\"\{0,1\}.*/\1/p"; }

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
J1=11111111-1111-4111-8111-111111111111
J2=22222222-2222-4222-8222-222222222222

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as \$fn\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$fn\$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

-- Les trois tables aux policies de PRODUCTION (celles mesurées par la 4e passe).
-- ⚠️ user_state N'A AUCUNE FK vers auth.users : rien côté base ne l'emporte avec le compte.
create table public.user_state (user_id text primary key, blob jsonb, updated_at timestamptz default now());
create table public.profiles   (id text primary key, username text);
create table public.conv_reads (conv_id text, user_id text, lu_le timestamptz, primary key (conv_id, user_id));
alter table public.user_state enable row level security;
alter table public.profiles   enable row level security;
alter table public.conv_reads enable row level security;
create policy user_state_insert_own on public.user_state for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy user_state_update_own on public.user_state for update to authenticated using (user_id = (select auth.uid())::text);
create policy user_state_delete_own on public.user_state for delete to authenticated using (user_id = (select auth.uid())::text);
create policy user_state_select_own on public.user_state for select to authenticated using (user_id = (select auth.uid())::text);
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy reads_select on public.conv_reads for select to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = (select auth.uid())::text);
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())::text) with check (id = (select auth.uid())::text);
create policy reads_insert_own on public.conv_reads for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy reads_update_own on public.conv_reads for update to authenticated using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);

-- Les autres tables de la purge, dérivées de TABLES_COMPTE.
$DDL

-- Le trigger PRIVILÉGIÉ de production (follows_notifier) : SECURITY DEFINER,
-- propriétaire postgres, écrit une notification POUR LA CIBLE et avale l'erreur.
create or replace function public.follows_notifier() returns trigger language plpgsql security definer set search_path = '' as \$t\$
begin
  begin
    insert into public.notifications (user_id, from_id, blob) values (new.following_id, new.follower_id, 'a commencé à te suivre');
  exception when others then
    raise warning 'follows_notifier : notification non écrite (%)', sqlerrm;
  end;
  return new;
end \$t\$;
create trigger trg_follows_notifier after insert on public.follows for each row execute function public.follows_notifier();

insert into public.profiles values ('$A','A'), ('$B','B');
insert into public.user_state values ('$A','{"v":1}');
SQL

ECRIRE_ETAT() { AUTH_V "$1" "insert into public.user_state (user_id, blob) values ('$1','{\"v\":2}') on conflict (user_id) do update set blob = '{\"v\":2}';"; }
RESTE()       { Q "select count(*)::int from public.user_state where user_id='$A';"; }

echo "── ① LE DÉFAUT : une écriture après le comptage survit à la purge ────"
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "la purge a effacé l'état de A" "0" "$(RESTE)"
verifier "…mais l'application encore ouverte de A réécrit : ACCEPTÉ" "OK" "$(ECRIRE_ETAT "$A")"
verifier "la ligne est revenue : « supprimer mon compte » répondrait ok avec elle" "1" "$(RESTE)"
verifier "et un TIERS (B) écrit une ligne qui porte A (B suit A) : ACCEPTÉ" "OK" "$(AUTH_V "$B" "insert into public.follows (follower_id, following_id) values ('$B','$A');")"
verifier "…que le trigger privilégié double d'une notification POUR A" "1" "$(Q "select count(*)::int from public.notifications where user_id='$A';")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -10; exit 1; }
nOK="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"; nKO="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "verdict : aucun ECHEC, et au moins dix contrôles OK" "oui" "$([ "$nKO" -eq 0 ] && [ "$nOK" -ge 10 ] && echo oui || echo "non ($nOK OK / $nKO ECHEC)")"
verifier "aucune table de la purge n'est absente du socle (le trigger couvre TOUT)" "" "$(printf '%s\n' "$sortie" | grep -o 'absentes ici : {[^}]*}' | sed 's/absentes ici : {}//')"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ rejeu en échec"; exit 1; }
verifier "rejeu : toujours aucun ECHEC" "0" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "la clause n'apparaît qu'UNE fois par policy après deux passages" "0" "$(Q "select count(*)::int from pg_policies where (length(with_check) - length(replace(with_check, 'suppression_de_mon_compte', ''))) / length('suppression_de_mon_compte') > 1;")"
Q "delete from public.follows; delete from public.notifications;" >/dev/null

echo "── ③ COUVERTURE : chaque (table, colonne) de TABLES_COMPTE est gardée ──"
# Pour CHAQUE paire de la liste de la purge — pas de la migration — : un tiers
# authentifié qui écrit A dans cette colonne est REFUSÉ, B y est accepté.
Q "select public.reclamer_suppression('$A', '$J1');" >/dev/null
manque=""; couvertes=0
while IFS='|' read -r t c; do
  [ -n "$t" ] || continue
  if [ "$t" = "user_state" ] || [ "$t" = "profiles" ] || [ "$t" = "conv_reads" ]; then
    # policies « own » : seule la personne peut écrire → on teste A par A
    case "$t" in
      user_state) ra="$(AUTH_V "$A" "insert into public.user_state (user_id, blob) values ('$A','{}') on conflict (user_id) do update set blob='{}';")"; rb="$(AUTH_V "$B" "insert into public.user_state (user_id, blob) values ('$B','{}') on conflict (user_id) do update set blob='{}';")" ;;
      profiles)   ra="$(AUTH_V "$A" "update public.profiles set username='x' where id='$A';")"; rb="$(AUTH_V "$B" "update public.profiles set username='x' where id='$B';")" ;;
      conv_reads) ra="$(AUTH_V "$A" "insert into public.conv_reads values ('c_$RANDOM','$A', now());")"; rb="$(AUTH_V "$B" "insert into public.conv_reads values ('c_$RANDOM','$B', now());")" ;;
    esac
  else
    ra="$(AUTH_V "$B" "insert into public.$t ($c, blob) values ('$A','par B');")"
    rb="$(AUTH_V "$B" "insert into public.$t ($c, blob) values ('$B','par B');")"
  fi
  if [ "$ra" = "REFUSE" ] && [ "$rb" = "OK" ]; then couvertes=$((couvertes+1)); else manque="$manque $t.$c(A=$ra,B=$rb)"; fi
done <<< "$PAIRES"
verifier "toutes les paires sont gardées (A refusé, B accepté) : $couvertes/$(printf '%s\n' "$PAIRES" | grep -c .)" "" "$manque"
# (les lignes de A posées par le socle — profil, état — ne comptent pas : on
#  cherche celles que B aurait pu écrire pendant la suppression)
verifier "et aucune ligne « par B » ne porte A après tout ça" "0" "$(Q "$(printf '%s\n' "$PAIRES" | grep -v '^user_state|\|^profiles|\|^conv_reads|' | awk -F'|' '{printf "select count(*) from public.%s where %s=\x27'"$A"'\x27 and blob=\x27par B\x27 union all ", $1, $2}' | sed 's/ union all $//; s/^/select sum(n)::int from (/; s/$/) x(n);/')")"

echo "── ④ LES ÉCRITURES QUE LA POLICY NE VOIT PAS ─────────────────────────"
verifier "ANONYME sur client_errors avec uid = A : REFUSÉ" "REFUSE" "$(ANON_V "insert into public.client_errors (uid, auth_uid, blob) values ('$A', null, 'x');")"
verifier "…mais l'anonyme écrit toujours pour un autre" "OK" "$(ANON_V "insert into public.client_errors (uid, auth_uid, blob) values ('$B', null, 'x');")"
r="$(AUTH "$B" "insert into public.follows (follower_id, following_id) values ('$B','$A');")"
verifier "B suit A : refusé à la SOURCE (follows.following_id)" "REFUSE" "$(_v "$r")"
Q "alter table public.follows disable trigger zz_barriere_suppression;" >/dev/null
r="$(AUTH "$B" "insert into public.follows (follower_id, following_id) values ('$B','$A');")"
Q "alter table public.follows enable trigger zz_barriere_suppression;" >/dev/null
verifier "…et même si la ligne follows passait, le trigger PRIVILÉGIÉ ne peut plus écrire la notification pour A" "0" "$(Q "select count(*)::int from public.notifications where user_id='$A';")"
verifier "(le warning du trigger de production est bien ce qui s'est produit)" "oui" "$(printf '%s' "$r" | grep -q "follows_notifier : notification non écrite" && echo oui || echo "non : $r")"
Q "delete from public.follows;" >/dev/null
verifier "la CLÉ DE SERVICE elle-même ne peut pas recréer une ligne de A (plafond.js → analytics_events)" "REFUSE" "$(_v "$(SVC "insert into public.analytics_events (user_id, blob) values ('$A','ask-ai');")")"
verifier "le refus a le CODE d'un refus RLS (42501) : aucun oracle nouveau" "42501" "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$B'; insert into public.follows (follower_id, following_id) values ('$B','$A');" 2>&1 | grep -o "42501" | head -1 || Q "do \$x\$ begin insert into public.follows (follower_id, following_id) values ('$B','$A'); exception when others then raise notice '%', sqlstate; end \$x\$;" | grep -o "42501")"
verifier "le DELETE reste libre (la purge efface, la personne se retire)" "OK" "$(AUTH_V "$A" "delete from public.user_state where user_id='$A';")"
verifier "A peut encore LIRE (aucune policy SELECT n'est touchée)" "OK" "$(AUTH_V "$A" "select count(*) from public.profiles;")"
verifier "la purge (sans session) efface toujours" "OK" "$(_v "$(Q "delete from public.conv_reads where user_id='$A';")")"
Q "insert into public.user_state values ('$B','{\"a_moi\":true}') on conflict (user_id) do update set blob='{\"a_moi\":true}';" >/dev/null
AUTH "$A" "update public.user_state set blob='{\"vol\":1}' where user_id='$B';" >/dev/null 2>&1 || true
verifier "l'UPDATE sans with_check garde son contrôle d'origine : la ligne de B est INTACTE" '{"a_moi": true}' "$(Q "select blob::text from public.user_state where user_id='$B';")"

echo "── ⑤ ASTRA-40 : UN ÉTAT PAR TENTATIVE, UN RETRAIT PAR JETON ──────────"
r2="$(Q "select public.reclamer_suppression('$A', '$J2')::text;")"
verifier "une seconde tentative (jeton J2) pendant que J1 est vivante : NON acquise" "false" "$(json "$r2" acquise)"
verifier "…et elle voit le statut en_cours" "en_cours" "$(json "$r2" statut)"
verifier "le retrait par J2 (mauvais jeton) N'ÉCRIT RIEN et le dit" "jeton_perime" "$(json "$(Q "select public.terminer_suppression('$A', '$J2', 'echec')::text;")" motif)"
verifier "…la protection de J1 tient toujours : A refusé" "REFUSE" "$(ECRIRE_ETAT "$A")"
verifier "J1 termine en echec : accepté" "true" "$(json "$(Q "select public.terminer_suppression('$A', '$J1', 'echec', '{\"restes\":[\"x\"]}')::text;")" ok)"
verifier "…la ligne reste (état durable) mais ne bloque plus : A réécrit" "OK" "$(ECRIRE_ETAT "$A")"
verifier "…et l'erreur est conservée" '{"restes": ["x"]}' "$(Q "select derniere_erreur::text from public.comptes_en_suppression where user_id='$A';")"
r3="$(Q "select public.reclamer_suppression('$A', '$J2')::text;")"
verifier "après echec, une nouvelle tentative (J2) est acquise" "true" "$(json "$r3" acquise)"
verifier "…tentatives = 2" "2" "$(json "$r3" tentatives)"
Q "update public.comptes_en_suppression set tentative_debut = now() - interval '20 minutes' where user_id='$A';" >/dev/null
verifier "une tentative en_cours MORTE (20 min) est reprise par J1" "true" "$(json "$(Q "select public.reclamer_suppression('$A', '$J1')::text;")" acquise)"
verifier "…et J2, périmé, ne peut plus rien retirer" "jeton_perime" "$(json "$(Q "select public.terminer_suppression('$A', '$J2', 'echec')::text;")" motif)"
verifier "purge faite, Auth pas encore parti : 'purgee' CONSERVE la protection" "REFUSE" "$(Q "select public.terminer_suppression('$A', '$J1', 'purgee');" >/dev/null; ECRIRE_ETAT "$A")"
verifier "…et la tentative J1 reste VIVANTE (deleteUser suit)" "t" "$(Q "select tentative_vivante from public.comptes_en_suppression where user_id='$A';")"
r4="$(Q "select public.reclamer_suppression('$A', '$J2')::text;")"
verifier "ASTRA-56 ① : une reprise depuis 'purgee' VIVANTE est REFUSÉE (J2)" "false" "$(json "$r4" acquise)"
verifier "…avec le motif" "vivante" "$(json "$r4" motif)"
verifier "…et J2 ne peut rien terminer" "jeton_perime" "$(json "$(Q "select public.terminer_suppression('$A', '$J2', 'echec')::text;")" motif)"
verifier "'supprimee' : protection CONSERVÉE (rétention)" "REFUSE" "$(Q "select public.terminer_suppression('$A', '$J1', 'supprimee');" >/dev/null; ECRIRE_ETAT "$A")"
verifier "…et plus AUCUNE réclamation possible" "false" "$(json "$(Q "select public.reclamer_suppression('$A', '$J1')::text;")" acquise)"
verifier "la rétention refuse une durée < 30 jours (les sauvegardes vivent 30 jours)" "REFUSE" "$(_v "$(Q "select public.purger_marqueurs_suppression(interval '7 days');")")"
verifier "…et ne retire rien avant l'échéance" "0" "$(Q "select public.purger_marqueurs_suppression(interval '45 days');")"
Q "update public.comptes_en_suppression set supprimee_le = now() - interval '50 days' where user_id='$A';" >/dev/null
verifier "…puis retire le marqueur échu" "1" "$(Q "select public.purger_marqueurs_suppression(interval '45 days');")"
verifier "le service ne peut PAS écrire le marqueur directement (tout passe par les fonctions)" "REFUSE" "$(_v "$(SVC "insert into public.comptes_en_suppression (user_id) values ('$A');")")"

echo "── ⑤ bis ASTRA-56 : L'ENTRELACEMENT DE DEUX TENTATIVES, SUR POSTGRESQL RÉEL ──"
# Le contre-exemple de la sixième contre-revue, transition par transition. Le
# marqueur de A vient d'être retiré par la rétention : on repart d'une base
# sans ligne. `SUPP()` est ce que purge-compte.js fait entre deux appels SQL
# (ici : rien à effacer, la purge est un DELETE sans session).
STATUT() { Q "select statut || '/' || tentative_vivante::text || '/' || coalesce(jeton::text,'-') from public.comptes_en_suppression where user_id='$1';"; }
verifier "A (J1) réclame" "true" "$(json "$(Q "select public.reclamer_suppression('$A', '$J1')::text;")" acquise)"
verifier "…et attend les écritures en vol : aucune" "0" "$(json "$(Q "select public.attendre_ecritures_en_vol(200)::text;")" restantes)"
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "A termine sa purge : 'purgee', vivante, J1" "purgee/true/$J1" "$(Q "select public.terminer_suppression('$A', '$J1', 'purgee');" >/dev/null; STATUT "$A")"
verifier "B (J2) réclame PENDANT que A attend Auth : REFUSÉ" "false" "$(json "$(Q "select public.reclamer_suppression('$A', '$J2')::text;")" acquise)"
verifier "B tente quand même 'echec' (comme la v2 le laissait faire) : rien n'est écrit" "jeton_perime" "$(json "$(Q "select public.terminer_suppression('$A', '$J2', 'echec', '{\"echecs\":[\"en_vol\"]}')::text;")" motif)"
verifier "…le marqueur n'a pas bougé" "purgee/true/$J1" "$(STATUT "$A")"
verifier "…une ligne user_state écrite par le client pendant l'attente Auth : REFUSÉE" "REFUSE" "$(ECRIRE_ETAT "$A")"
verifier "…et il n'en reste aucune" "0" "$(RESTE)"
r5="$(Q "select public.terminer_suppression('$A', '$J1', 'supprimee')::text;")"
verifier "A termine Auth et finalise avec SON jeton : accepté" "true" "$(json "$r5" ok)"
verifier "…la réponse porte l'état ÉCRIT (supprimee) et la protection" "supprimee" "$(json "$r5" statut)"
verifier "…protection = true" "true" "$(json "$r5" protection)"
verifier "…marqueur final : supprimee, tentative terminée" "supprimee/false/$J1" "$(STATUT "$A")"
Q "delete from public.comptes_en_suppression where user_id='$A';" >/dev/null

echo "   · tentative INTERROMPUE après 'purgee' (A meurt, 15 min passent)"
Q "select public.reclamer_suppression('$A', '$J1'); select public.terminer_suppression('$A', '$J1', 'purgee');" >/dev/null
verifier "trop tôt : B refusé" "false" "$(json "$(Q "select public.reclamer_suppression('$A', '$J2')::text;")" acquise)"
Q "update public.comptes_en_suppression set tentative_debut = now() - interval '20 minutes' where user_id='$A';" >/dev/null
r6="$(Q "select public.reclamer_suppression('$A', '$J2')::text;")"
verifier "20 min plus tard : B reprend la tentative morte" "true" "$(json "$r6" acquise)"
verifier "…et SAIT que les données sont déjà parties" "true" "$(json "$r6" donnees_deja_purgees)"
verifier "…la protection tient pendant la reprise" "REFUSE" "$(ECRIRE_ETAT "$A")"
r7="$(Q "select public.terminer_suppression('$A', '$J2', 'echec', '{\"echecs\":[\"en_vol\"]}')::text;")"
verifier "ASTRA-56 ② : B échoue en vol → 'echec' demandé s'ÉCRIT 'purgee' (jamais de levée après une purge)" "purgee" "$(json "$r7" statut)"
verifier "…la réponse le dit (demande=echec, protection=true)" "echec/true" "$(json "$r7" demande)/$(json "$r7" protection)"
verifier "…le client reste refusé" "REFUSE" "$(ECRIRE_ETAT "$A")"
verifier "…et la tentative de B est TERMINÉE (reprenable aussitôt)" "purgee/false/$J2" "$(STATUT "$A")"
verifier "…l'erreur est conservée" '{"echecs": ["en_vol"]}' "$(Q "select derniere_erreur::text from public.comptes_en_suppression where user_id='$A';")"
verifier "A, revenue tard, ne peut plus finaliser : jeton_perime, état RÉEL rendu (purgee, protégé)" "jeton_perime/purgee/true" "$(r="$(Q "select public.terminer_suppression('$A', '$J1', 'supprimee')::text;")"; echo "$(json "$r" motif)/$(json "$r" statut)/$(json "$r" protection)")"
Q "delete from public.comptes_en_suppression where user_id='$A';" >/dev/null

echo "   · ÉCHEC AUTH (deleteUser en erreur après la purge)"
Q "select public.reclamer_suppression('$A', '$J1'); select public.terminer_suppression('$A', '$J1', 'purgee');" >/dev/null
r8="$(Q "select public.terminer_suppression('$A', '$J1', 'auth_echec', '{\"auth\":\"GoTrue indisponible\"}')::text;")"
verifier "ASTRA-56 ③ : 'auth_echec' → statut purgee, tentative terminée" "purgee/false/$J1" "$(STATUT "$A")"
verifier "…protection conservée, dite" "true" "$(json "$r8" protection)"
verifier "…le client est refusé" "REFUSE" "$(ECRIRE_ETAT "$A")"
verifier "…B reprend AUSSITÔT (sans attendre 15 min)" "true" "$(json "$(Q "select public.reclamer_suppression('$A', '$J2')::text;")" acquise)"
verifier "…tentatives = 2" "2" "$(Q "select tentatives from public.comptes_en_suppression where user_id='$A';")"
verifier "…B finalise : supprimee" "supprimee/false/$J2" "$(Q "select public.terminer_suppression('$A', '$J2', 'supprimee');" >/dev/null; STATUT "$A")"
verifier "un événement inconnu est refusé" "REFUSE" "$(_v "$(Q "select public.terminer_suppression('$A', '$J2', 'n_importe_quoi');")")"
Q "delete from public.comptes_en_suppression where user_id='$A';" >/dev/null

echo "   · MUTATION : réclamation v2 (ignore la vitalité) — la règle ② tient seule"
Q "select public.reclamer_suppression('$A', '$J1'); select public.terminer_suppression('$A', '$J1', 'purgee');" >/dev/null
Q "create or replace function public.reclamer_suppression(p_uid text, p_jeton uuid, p_motif text default 'delete-account', p_perime interval default interval '15 minutes') returns jsonb language plpgsql security definer set search_path = '' as \$m\$ declare c public.comptes_en_suppression%rowtype; begin update public.comptes_en_suppression set statut='en_cours', jeton=p_jeton, tentatives=tentatives+1, tentative_debut=now(), tentative_vivante=true where user_id=p_uid returning * into c; return jsonb_build_object('acquise', true, 'statut', c.statut, 'jeton', c.jeton); end \$m\$;" >/dev/null
verifier "mutation « purgee reprenable » : B obtient le marqueur de A vivante (un banc qui exige le refus rougit)" "true" "$(json "$(Q "select public.reclamer_suppression('$A', '$J2')::text;")" acquise)"
verifier "…mais son 'echec' s'écrit encore 'purgee' : la protection tient malgré la mutation" "purgee" "$(json "$(Q "select public.terminer_suppression('$A', '$J2', 'echec')::text;")" statut)"
verifier "…le client reste refusé" "REFUSE" "$(ECRIRE_ETAT "$A")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" >/dev/null 2>&1 || true
Q "delete from public.comptes_en_suppression where user_id='$A';" >/dev/null
Q "select public.reclamer_suppression('$A', '$J1'); select public.terminer_suppression('$A', '$J1', 'purgee');" >/dev/null
verifier "rétabli : B refusé sur une tentative vivante" "false" "$(json "$(Q "select public.reclamer_suppression('$A', '$J2')::text;")" acquise)"
Q "select public.terminer_suppression('$A', '$J1', 'supprimee');" >/dev/null
Q "delete from public.comptes_en_suppression where user_id='$A';" >/dev/null

echo "── ⑥ AUCUN ORACLE ────────────────────────────────────────────────────"
verifier "anon peut appeler le prédicat (policies to public) et n'obtient que false" "f" "$(ANON "select public.suppression_de_mon_compte();")"
verifier "le marqueur est illisible pour authenticated" "f" "$(Q "select has_table_privilege('authenticated','public.comptes_en_suppression','SELECT');")"
verifier "le prédicat ne prend AUCUN argument" "0" "$(Q "select pronargs::int from pg_proc where proname='suppression_de_mon_compte';")"
verifier "authenticated ne peut appeler aucune fonction d'état" "f" "$(Q "select has_function_privilege('authenticated','public.reclamer_suppression(text,uuid,text,interval)','EXECUTE') or has_function_privilege('authenticated','public.terminer_suppression(text,uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.attendre_ecritures_en_vol(integer)','EXECUTE');")"

echo "── ⑦ MUTATIONS : le banc doit ROUGIR ─────────────────────────────────"
Q "select public.reclamer_suppression('$A', '$J1');" >/dev/null
Q "drop trigger zz_barriere_suppression on public.follows;" >/dev/null
verifier "mutation « trigger retiré d'une table » : B suit A de nouveau — la fenêtre se rouvre" "OK" "$(AUTH_V "$B" "insert into public.follows (follower_id, following_id) values ('$B','$A');")"
Q "delete from public.follows;" >/dev/null
Q "alter policy user_state_insert_own on public.user_state with check (user_id = (select auth.uid())::text);" >/dev/null
Q "alter table public.user_state disable trigger zz_barriere_suppression;" >/dev/null
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "mutation « clause retirée + trigger inactif » : A réécrit" "OK" "$(ECRIRE_ETAT "$A")"
Q "alter table public.user_state enable trigger zz_barriere_suppression;" >/dev/null
Q "delete from public.user_state where user_id='$A';" >/dev/null
verifier "…le trigger seul suffit déjà : A refusé même sans la clause" "REFUSE" "$(ECRIRE_ETAT "$A")"
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" 2>&1)" || true
verifier "…la migration rejouée repose tout : aucun ECHEC" "0" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "rétabli : B ne suit plus A" "REFUSE" "$(AUTH_V "$B" "insert into public.follows (follower_id, following_id) values ('$B','$A');")"
Q "create or replace function public.terminer_suppression(p_uid text, p_jeton uuid, p_statut text, p_detail jsonb default null) returns jsonb language sql security definer set search_path = '' as \$m\$ update public.comptes_en_suppression set statut = p_statut where user_id = p_uid returning jsonb_build_object('ok', true, 'statut', statut) \$m\$;" >/dev/null
verifier "mutation « terminer sans vérifier le jeton » : J2 retire la protection de J1 → un banc qui exige jeton_perime rougit" "" "$(json "$(Q "select public.terminer_suppression('$A', '$J2', 'echec')::text;")" motif)"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" >/dev/null 2>&1 || true
Q "select public.reclamer_suppression('$A', '$J1');" >/dev/null
verifier "…rétabli : J2 ne retire plus rien" "jeton_perime" "$(json "$(Q "select public.terminer_suppression('$A', '$J2', 'echec')::text;")" motif)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
