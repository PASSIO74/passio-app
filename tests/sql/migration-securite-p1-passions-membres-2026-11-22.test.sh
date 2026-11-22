#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — SÉCURITÉ P1 du 2026-11-22 (D10-03) : les passions d'un membre ne se
# lisent plus que par lui, et plus du tout sans compte.
#
# Sur un PostgreSQL natif jetable (socket privé, aucune cible distante) :
#   ① AVANT : droits et règles relus en production le 2026-11-22 ; le défaut est
#      MESURÉ (un visiteur lit toutes les lignes et les imbrique avec le référentiel ;
#      un compte lit celles des autres) ;
#   ② la migration se joue DEUX fois, sans ÉCHEC dans son tableau de verdict ;
#   ③ APRÈS : le visiteur est refusé (42501), un compte ne lit que ses lignes, et
#      les deux écritures du client (`upsert … on conflict`, `delete` filtré) passent ;
#      une fonction SECURITY DEFINER lit toujours tout ;
#   ④ la garde refuse de fermer si une vue lit la table sous l'identité de l'appelant.
#
#   bash tests/sql/migration-securite-p1-passions-membres-2026-11-22.test.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo 'ECHEC : PostgreSQL natif requis pour ce banc'; exit 1; }
PORT=$((7400 + RANDOM % 100))
if [ "$(id -u)" -eq 0 ]; then
 id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
 BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU='su pgbanc -c'
else BASE="$(mktemp -d)"; SU='bash -c'; fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c timezone=UTC\" -l '$BASE/pg.log' start -w" >/dev/null
DB=passio_test_passions_membres
createdb -h "$BASE" -p "$PORT" -U postgres "$DB"
PSQL=(psql -X -h "$BASE" -p "$PORT" -U postgres -d "$DB" -qAt -v ON_ERROR_STOP=1)
Q() { "${PSQL[@]}" -c "$1"; }
# EN <rôle> <compte> <sql> : une requête sous un rôle client, avec l'identité d'un compte.
EN() { "${PSQL[@]}" -c "set request.jwt.claim.sub = '$2'" -c "set role $1" -c "$3"; }
issue() { if "$@" >"$BASE/issue.log" 2>&1; then echo accepte; else echo refuse; fi; }
cd "$RACINE"
MIG=migrations/migration_securite_p1_passions_membres_2026-11-22.sql

A=11111111-1111-4111-8111-111111111111
B=22222222-2222-4222-8222-222222222222
ok=0; ko=0
verifier() {
 if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "  OK     $1"
 else ko=$((ko+1)); echo "  ECHEC  $1 — attendu [$3], obtenu [$2]"; fi
}

# Socle : rôles, identité, référentiel, et `user_passions` avec les droits et les quatre règles
# relus en production le 2026-11-22 (anon=arwd, authenticated=arwd ; lecture `true` pour tous).
Q "create role anon; create role authenticated;
create schema auth; grant usage on schema auth to anon, authenticated;
create function auth.uid() returns uuid language sql stable as
 \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
create table public.passions(id text primary key, label text);
grant select on public.passions to anon, authenticated;
create table public.user_passions(user_id text not null, passion_id text not null references public.passions(id) on delete cascade,
 position integer not null default 0, archived boolean not null default false, created_at timestamptz not null default now(),
 primary key (user_id, passion_id));
alter table public.user_passions enable row level security;
grant select, insert, update, delete on public.user_passions to anon, authenticated;
create policy user_passions_select_all on public.user_passions for select to public using (true);
create policy user_passions_insert_own on public.user_passions for insert to public with check (user_id = (select auth.uid())::text);
create policy user_passions_update_own on public.user_passions for update to public using (user_id = (select auth.uid())::text);
create policy user_passions_delete_own on public.user_passions for delete to public using (user_id = (select auth.uid())::text);
-- Une fonction du catalogue, SECURITY DEFINER, qui lit la table pour un compte donné.
create function public.nombre_passions_de(_u text) returns bigint language sql stable security definer set search_path = ''
 as \$\$ select count(*) from public.user_passions where user_id = _u \$\$;
grant execute on function public.nombre_passions_de(text) to authenticated;
insert into public.passions values ('peche','Pêche'),('poterie','Poterie'),('escalade','Escalade');
insert into public.user_passions(user_id, passion_id, position) values
 ('$A','peche',0),('$A','poterie',1),('$B','peche',0),('$B','escalade',1);" >/dev/null

echo "① AVANT : le défaut est mesuré"
verifier "visiteur : lit toutes les lignes" "$(EN anon '' "select count(*) from public.user_passions")" "4"
verifier "visiteur : imbrique référentiel et membres" "$(EN anon '' "select count(*) from public.passions p join public.user_passions u on u.passion_id = p.id join public.user_passions v on v.passion_id = p.id")" "6"
verifier "A : lit les lignes de B" "$(EN authenticated "$A" "select count(*) from public.user_passions where user_id = '$B'")" "2"

echo "② la migration, deux fois"
for passe in 1 2; do
 sortie="$("${PSQL[@]}" -f "$MIG")"
 verifier "passe $passe : aucune ligne ECHEC au verdict" "$(printf '%s\n' "$sortie" | grep -c 'ECHEC' || true)" "0"
 verifier "passe $passe : quatre lignes OK" "$(printf '%s\n' "$sortie" | grep -c '|OK$' || true)" "4"
done

echo "③ APRÈS"
verifier "visiteur : lecture refusée" "$(issue EN anon '' "select count(*) from public.user_passions")" "refuse"
verifier "visiteur : refus = droit manquant (42501)" "$(grep -c 'permission denied' "$BASE/issue.log" || true)" "1"
verifier "visiteur : imbrication refusée en entier" "$(issue EN anon '' "select count(*) from public.passions p join public.user_passions u on u.passion_id = p.id")" "refuse"
verifier "visiteur : le référentiel reste lisible" "$(EN anon '' "select count(*) from public.passions")" "3"
verifier "A : ne voit plus les lignes de B" "$(EN authenticated "$A" "select count(*) from public.user_passions where user_id = '$B'")" "0"
verifier "A : voit ses deux lignes" "$(EN authenticated "$A" "select count(*) from public.user_passions where user_id = '$A'")" "2"
verifier "A : upsert du client (on conflict do update)" "$(issue EN authenticated "$A" "insert into public.user_passions(user_id, passion_id, position, archived) values ('$A','peche',0,true),('$A','escalade',2,false) on conflict (user_id, passion_id) do update set position = excluded.position, archived = excluded.archived")" "accepte"
verifier "A : l'upsert a bien réécrit sa ligne" "$(Q "select archived from public.user_passions where user_id = '$A' and passion_id = 'peche'")" "t"
verifier "A : delete filtré du client" "$(issue EN authenticated "$A" "delete from public.user_passions where user_id = '$A' and passion_id not in ('peche','escalade')")" "accepte"
verifier "A : ce delete n'a retiré que sa poterie" "$(Q "select string_agg(user_id || ':' || passion_id, ',' order by user_id, passion_id) from public.user_passions")" "$A:escalade,$A:peche,$B:escalade,$B:peche"
verifier "A : écrire au nom de B reste refusé" "$(issue EN authenticated "$A" "insert into public.user_passions(user_id, passion_id) values ('$B','poterie')")" "refuse"
verifier "A : supprimer les lignes de B ne touche rien" "$(EN authenticated "$A" "with d as (delete from public.user_passions where user_id = '$B' returning 1) select count(*) from d")" "0"
verifier "fonction SECURITY DEFINER : lit toujours tout" "$(EN authenticated "$A" "select public.nombre_passions_de('$B')")" "2"

echo "④ la garde : une vue qui lit la table sous l'identité de l'appelant arrête la migration"
Q "create policy user_passions_select_all on public.user_passions for select to public using (true);
create view public.membres_par_passion with (security_invoker = on) as select passion_id, count(*) n from public.user_passions group by passion_id;" >/dev/null
if "${PSQL[@]}" -f "$MIG" >"$BASE/garde.log" 2>&1; then garde=accepte; else garde=refuse; fi
verifier "vue lectrice : migration refusée" "$garde" "refuse"
verifier "vue lectrice : message de la garde" "$(grep -c 'sous l identite de l appelant' "$BASE/garde.log" || true)" "1"
verifier "rien n'a bougé (transaction annulée)" "$(Q "select count(*) from pg_policies where tablename = 'user_passions' and policyname = 'user_passions_select_all'")" "1"

echo
echo "banc passions des membres : $ok OK, $ko ECHEC"
[ "$ko" -eq 0 ]
