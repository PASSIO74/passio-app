#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — l'écriture DÉJÀ ENGAGÉE au moment de la purge (ASTRA-41, cinquième
# contre-revue, 2026-09-15) · migrations/migration_barriere_suppression_2026-09-15.sql
#
# CE QUE LA CONTRE-REVUE OBJECTAIT, SANS L'AVOIR REPRODUIT. Le banc « requête en
# vol » de la quatrième passe posait la marque PUIS lançait une écriture neuve :
# il ne gardait jamais une écriture ANTÉRIEURE, non validée, pendant la purge.
# Or une écriture peut avoir franchi sa policy AVANT la marque, rester invisible
# aux comptages parce qu'elle n'est pas validée, puis valider APRÈS eux.
#
# ICI : DEUX CONNEXIONS POSTGRESQL RÉELLES, SYNCHRONISÉES PAR LE PROTOCOLE.
#   · S1 = l'application de A : `begin; insert into user_state …` et elle
#     S'ARRÊTE LÀ (la transaction reste ouverte, rien n'est validé) ;
#   · S2 = la purge (service_role) : pose la marque, efface, compte → 0 ;
#   · S1 valide ; S2 recompte.
# Chaque étape attend la RÉPONSE de la précédente (marqueur `__FIN__` lu sur la
# sortie de psql) : aucune attente arbitraire ne sert de preuve.
#
# ATTENDU AVANT CORRECTION : la ligne apparaît APRÈS le comptage → la purge
# aurait répondu ok avec une ligne restante (le constat est CONFIRMÉ).
# ATTENDU APRÈS : `attendre_ecritures_en_vol()` (appelée par la purge juste
# après la marque) ne rend la main qu'une fois S1 terminée — et rend le nombre
# de transactions qu'elle a attendues, ou celles qui restent au bout du délai.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_barriere_suppression_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6800 + RANDOM % 120 ))
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

DB=astra41
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# Socle : `user_state`, SANS clé étrangère vers auth.users — la table pertinente
# et sans FK protectrice que la contre-revue demande.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
create table public.user_state (user_id text primary key, blob jsonb, updated_at timestamptz default now());
alter table public.user_state enable row level security;
create policy user_state_insert_own on public.user_state for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy user_state_update_own on public.user_state for update to authenticated using (user_id = (select auth.uid())::text);
create policy user_state_select_own on public.user_state for select to authenticated using (user_id = (select auth.uid())::text);
SQL
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -10; exit 1; }

# ── S1 est une session PERSISTANTE (coproc) : chaque commande est suivie d'un
#    `select '__FIN__'` et on lit la sortie jusqu'à ce marqueur — c'est la
#    synchronisation. (Un `\echo` ne conviendrait pas : sur un tube, psql le
#    garde en tampon ; un résultat de requête est vidé après chaque ordre.)
#    ⚠️ UN SEUL coproc : bash n'en supporte qu'un, un second invalide les
#    descripteurs du premier. La purge (S2) n'a pas besoin de persistance :
#    chacun de ses ordres est une connexion autocommit distincte, comme le sont
#    les requêtes PostgREST de la vraie purge.
coproc S1 { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_ROLLBACK=on 2>&1; }
envoyer() { # $1 = fd écriture, $2 = fd lecture, $3 = SQL
  printf '%s\nselect %s;\n' "$3" "'__FIN__'" >&"$1"
  local out="" line
  # `${line%$'\r'}` : psql sous Windows termine ses lignes par CRLF ; sans effet ailleurs.
  while IFS= read -r -u "$2" line; do line="${line%$'\r'}"; [ "$line" = "__FIN__" ] && break; out+="$line"$'\n'; done
  printf '%s' "${out%$'\n'}"
}
s1() { envoyer "${S1[1]}" "${S1[0]}" "$1"; }
s2() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$1" 2>&1 || true; }
fermer_sessions() { exec {S1[1]}>&- 2>/dev/null || true; }
vu_au_moins_un() { local n; n="$(printf '%s' "$1" | sed -n 's/.*"en_vol_initial": *\([0-9]*\).*/\1/p')"; if [ -n "$n" ] && [ "$n" -ge 1 ]; then echo oui; else echo "non ($1)"; fi; }

echo "── ① L'ÉCRITURE EST ENGAGÉE AVANT LA MARQUE, ET NON VALIDÉE ─────────"
s1 "begin;" >/dev/null
s1 "set local role authenticated; set local request.jwt.claim.sub='$A';" >/dev/null
r="$(s1 "insert into public.user_state (user_id, blob) values ('$A','{\"v\":2}');")"
verifier "S1 (l'application de A) a franchi sa policy : INSERT accepté, transaction OUVERTE" "" "$r"
verifier "S1 porte bien un xid en cours (elle a écrit)" "1" "$(Q "select count(*)::int from pg_stat_activity where backend_xid is not null and state = 'idle in transaction';")"

echo "── ② LA PURGE POSE LA MARQUE, EFFACE, COMPTE ──────────────────────────"
s2 "insert into public.comptes_en_suppression (user_id, motif) values ('$A','delete-account') on conflict (user_id) do nothing;" >/dev/null
s2 "delete from public.user_state where user_id='$A';" >/dev/null
verifier "le comptage de la purge rend 0 : la ligne de S1 lui est INVISIBLE" "0" "$(s2 "select count(*)::int from public.user_state where user_id='$A';")"

echo "── ③ LA PURGE ATTEND LES ÉCRITURES EN VOL — ou constate qu'elle ne peut pas ──"
# Sans la fonction (migration d'avant), cet appel est une erreur : le constat
# d'Astra est alors CONFIRMÉ par ④, puisque rien n'a retenu la purge.
attente="$(s2 "select public.attendre_ecritures_en_vol(1500)::text;")"
if printf '%s' "$attente" | grep -qi "error"; then
  echo "  ⚠️ attendre_ecritures_en_vol absente : $(printf '%s' "$attente" | head -1)"
  fonction_presente=0
else
  fonction_presente=1
  # `en_vol_initial` compte des XIDS, sous-transactions comprises (ici le savepoint
  # posé par ON_ERROR_ROLLBACK ; en production, un bloc `exception` PL/pgSQL) :
  # on exige « au moins la transaction de S1 », pas un nombre.
  verifier "elle a VU la transaction de S1 (en_vol_initial ≥ 1)" "oui" "$(vu_au_moins_un "$attente")"
  verifier "…et, S1 n'ayant pas fini, elle rend la main au délai avec 1 restante — la purge DOIT échouer, pas conclure" "1" "$(printf '%s' "$attente" | sed -n 's/.*"restantes": *\([0-9]*\).*/\1/p')"
fi

echo "── ④ S1 VALIDE APRÈS LE COMPTAGE ─────────────────────────────────────"
s1 "commit;" >/dev/null
apres="$(s2 "select count(*)::int from public.user_state where user_id='$A';")"
if [ "$fonction_presente" -eq 1 ]; then
  verifier "la ligne est là (1) : elle était engagée AVANT la marque — c'est exactement ce que l'attente a signalé" "1" "$apres"
  # Reprise : la purge relancée ré-efface, attend (plus rien en vol), recompte.
  s2 "delete from public.user_state where user_id='$A';" >/dev/null
  attente2="$(s2 "select public.attendre_ecritures_en_vol(1500)::text;")"
  verifier "reprise : plus rien en vol (restantes = 0)" "0" "$(printf '%s' "$attente2" | sed -n 's/.*"restantes": *\([0-9]*\).*/\1/p')"
  verifier "reprise : le comptage rend 0 et cette fois il est FIABLE" "0" "$(s2 "select count(*)::int from public.user_state where user_id='$A';")"
else
  verifier "CONSTAT ASTRA-41 : la ligne apparaît APRÈS le comptage (la purge aurait répondu ok avec elle)" "0" "$apres"
fi

echo "── ⑤ UNE ÉCRITURE QUI COMMENCE APRÈS LA MARQUE EST REFUSÉE (READ COMMITTED) ──"
s1 "begin;" >/dev/null
s1 "set local role authenticated; set local request.jwt.claim.sub='$A';" >/dev/null
r="$(s1 "insert into public.user_state (user_id, blob) values ('$A','{\"v\":3}');")"
s1 "rollback;" >/dev/null
verifier "la policy relit la marque à CHAQUE ordre : refusée" "REFUSE" "$(printf '%s' "$r" | grep -qi error && echo REFUSE || echo OK)"

echo "── ⑥ MUTATION : une attente qui ne regarde pas les xids en vol ne verrait rien ──"
if [ "$fonction_presente" -eq 1 ]; then
  s1 "begin;" >/dev/null
  s1 "set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';" >/dev/null
  s1 "insert into public.user_state (user_id, blob) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{}');" >/dev/null
  # On remplace la fonction par une version qui ne regarde rien : le banc doit ROUGIR.
  Q "create or replace function public.attendre_ecritures_en_vol(p_max_ms integer default 5000) returns jsonb language sql security definer set search_path = '' as \$m\$ select jsonb_build_object('en_vol_initial', 0, 'restantes', 0, 'attendu_ms', 0) \$m\$;" >/dev/null
  mut="$(s2 "select public.attendre_ecritures_en_vol(500)::text;")"
  verifier "mutant « ne regarde pas les xids » : il dit 0 en vol alors qu'il y en a une → l'exigence « 1 » de ③ le fait rougir" "0" "$(printf '%s' "$mut" | sed -n 's/.*"en_vol_initial": *\([0-9]*\).*/\1/p')"
  s1 "rollback;" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" >/dev/null 2>&1 || true
  s1 "begin;" >/dev/null
  s1 "set local role authenticated; set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';" >/dev/null
  s1 "insert into public.user_state (user_id, blob) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{}');" >/dev/null
  verifier "…et la migration rejouée la rétablit : la transaction en vol est vue de nouveau" "oui" "$(vu_au_moins_un "$(s2 "select public.attendre_ecritures_en_vol(300)::text;")")"
  s1 "rollback;" >/dev/null
fi

fermer_sessions
echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
