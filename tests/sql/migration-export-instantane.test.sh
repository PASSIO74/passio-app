#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_export_instantane_2026-09-15.sql (ASTRA-44)
#
# LA REPRODUCTION D'ASTRA, SUR POSTGRESQL RÉEL : 1 001 publications ; PENDANT
# l'export, une ligne déjà lue disparaît, une autre naît, et une table lue
# PLUS TARD est modifiée aussi. L'export doit rendre le monde TEL QU'IL ÉTAIT à
# l'instant de la prise — toutes tables confondues — et le dire.
#
# SYNCHRONISATION SANS ATTENTE ARBITRAIRE : S2 (session en arrière-plan) prend
# le verrou consultatif 42 ; S1 lance l'export avec `p_verrou = 42` et se bloque
# sur ce verrou APRÈS avoir lu la première table ; S2 attend de VOIR S1 bloquée
# (pg_locks), modifie les tables, valide, libère ; S1 finit. Chaque étape est
# conditionnée par l'état observé de l'autre session, jamais par une durée.
#
# Le socle est DÉRIVÉ de `tablesExport()` (export-compte.js), pas de la
# migration : c'est le contrôle de couverture indépendant.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_export_instantane_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

SOCLE_JS='
import { pathToFileURL } from "node:url";
const { tablesExport } = await import(pathToFileURL(process.argv[1]).href);
const parTable = new Map();
for (const [t, c] of tablesExport()) { if (!parTable.has(t)) parTable.set(t, []); parTable.get(t).push(c); }
if (process.argv[2] === "ddl") {
  const ddl = [];
  for (const [t, cols] of parTable) {
    const avecId = t !== "conv_reads" && !cols.includes("id");   // conv_reads : sans `id`, ordre partiel, dit ; profiles : `id` EST la colonne du compte
    ddl.push(`create table public.${t} (${avecId ? "id text primary key, " : ""}${cols.map((c) => c + " text" + (c === "id" ? " primary key" : "")).join(", ")}, created_at timestamptz default now(), blob text);`);
  }
  console.log(ddl.join("\n"));
} else console.log(tablesExport().map(([t, c]) => t + "|" + c).join("\n"));
'
DDL="$(node --input-type=module -e "$SOCLE_JS" "$RACINE/supabase/functions/_shared/export-compte.js" ddl 2>/dev/null)"
PAIRES="$(node --input-type=module -e "$SOCLE_JS" "$RACINE/supabase/functions/_shared/export-compte.js" paires 2>/dev/null)"
[ -n "$DDL" ] && [ -n "$PAIRES" ] || { echo "❌ impossible de dériver le socle de tablesExport()"; exit 1; }

PORT=$(( 6900 + RANDOM % 120 ))
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

DB=astra44
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
QF() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$1" 2>&1 || true; }
A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
create role anon; create role authenticated; create role service_role;
grant usage on schema public to anon, authenticated, service_role;
$DDL
insert into public.posts (id, author_id, created_at, blob)
  select 'r' || lpad(g::text, 4, '0'), '$A', '2026-01-01', 'x' from generate_series(0, 1000) g;
insert into public.post_comments (id, author_id, blob) values ('c1', '$A', 'un'), ('c2', '$A', 'deux'), ('c3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pas moi');
insert into public.conv_reads (user_id, blob) values ('$A', 'lu');
SQL

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -10; exit 1; }
verifier "verdict : aucun ECHEC" "0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 && verifier "rejeu sans erreur" "oui" "oui" || verifier "rejeu sans erreur" "oui" "non"

echo "── ② COUVERTURE : chaque paire de tablesExport() est dans le dossier ──"
dossier="$(Q "select public.export_compte_instantane('$A', 5000)::text;")"
manque=""
while IFS='|' read -r t c; do [ -n "$t" ] || continue; printf '%s' "$dossier" | grep -q "\"$t.$c\": {" || manque="$manque $t.$c"; done <<< "$PAIRES"
verifier "toutes les paires sont lues ($(printf '%s\n' "$PAIRES" | grep -c .))" "" "$manque"
verifier "aucune paire absente du socle" "[]" "$(Q "select (public.export_compte_instantane('$A', 5000)->'absentes')::text;")"
verifier "le dossier porte l'instantané (xmin:xmax:xip)" "oui" "$(printf '%s' "$dossier" | grep -qE '"instantane": "[0-9]+:[0-9]+:' && echo oui || echo non)"
verifier "posts : 1 001 lignes attendues, 1 001 rendues, non tronqué, ordre total" "1001|1001|false|created_at, id|true" "$(Q "select d->'attendu', jsonb_array_length(d->'lignes'), d->'tronque', d->>'ordre', d->'ordre_total' from (select public.export_compte_instantane('$A', 5000)->'tables'->'posts.author_id' d) x;")"
verifier "conv_reads (sans id) : ordre partiel, dit" "created_at|false" "$(Q "select d->>'ordre', d->'ordre_total' from (select public.export_compte_instantane('$A', 5000)->'tables'->'conv_reads.user_id' d) x;")"
verifier "les lignes d'autrui n'y sont pas (post_comments : 2, pas 3)" "2" "$(Q "select jsonb_array_length(public.export_compte_instantane('$A', 5000)->'tables'->'post_comments.author_id'->'lignes');")"
verifier "un plafond de 10 tronque et le dit (attendu reste 1 001)" "10|true|1001" "$(Q "select jsonb_array_length(d->'lignes'), d->'tronque', d->'attendu' from (select public.export_compte_instantane('$A', 10)->'tables'->'posts.author_id' d) x;")"

echo "── ③ LA REPRODUCTION D'ASTRA, PENDANT L'EXPORT ───────────────────────"
# S2 : prend le verrou, attend de VOIR S1 bloquée dessus, modifie, valide, libère.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >"$BASE/s2.log" 2>&1 <<SQL &
select pg_advisory_lock(42);
do \$\$ begin
  loop
    if exists (select 1 from pg_locks where locktype = 'advisory' and objid = 42 and not granted) then exit; end if;
    perform pg_sleep(0.02);
  end loop;
end \$\$;
delete from public.posts where id = 'r0000';
insert into public.posts (id, author_id, created_at, blob) values ('r9999', '$A', '2026-01-01', 'née pendant');
delete from public.post_comments where id = 'c1';
insert into public.post_comments (id, author_id, blob) values ('c4', '$A', 'né pendant');
select pg_advisory_unlock(42);
SQL
S2=$!
# On attend que S2 TIENNE le verrou (état observé, pas durée).
for _ in $(seq 1 200); do [ "$(QF "select count(*) from pg_locks where locktype='advisory' and objid=42 and granted;")" = "1" ] && break; sleep 0.02; done
verifier "S2 tient le verrou avant que l'export ne parte" "1" "$(QF "select count(*) from pg_locks where locktype='advisory' and objid=42 and granted;")"
# S1 : l'export, qui lit `posts`, puis se bloque sur le verrou jusqu'à ce que S2 ait modifié et libéré.
export_pendant="$(Q "select public.export_compte_instantane('$A', 5000, 42)::text;")"
wait "$S2" || true
verifier "S2 a bien modifié pendant (deux suppressions, deux naissances : 1 001 posts dont r9999, sans r0000)" "1001|0|1|c2 c4" "$(Q "select (select count(*) from public.posts where author_id='$A') || '|' || (select count(*) from public.posts where id='r0000') || '|' || (select count(*) from public.posts where id='r9999') || '|' || (select string_agg(id, ' ' order by id) from public.post_comments where author_id='$A');")"
p_ids="$(printf '%s' "$export_pendant" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);const p=d.tables["posts.author_id"];const ids=new Set(p.lignes.map(l=>l.id));const c=d.tables["post_comments.author_id"];console.log([p.lignes.length,p.attendu,ids.has("r0000"),ids.has("r1000"),ids.has("r9999"),c.lignes.map(l=>l.id).sort().join(" ")].join("|"));});')"
verifier "posts : 1 001 lignes = attendu ; r0000 (supprimée pendant) PRÉSENTE ; r1000 PRÉSENTE ; r9999 (née pendant) ABSENTE" "1001|1001|true|true|false|c1 c2" "$p_ids"
verifier "…et post_comments, lue APRÈS les modifications, montre l'état d'AVANT : c1 présente, c4 absente (même instantané pour toutes les tables)" "oui" "$(printf '%s' "$p_ids" | grep -q '|c1 c2$' && echo oui || echo non)"
apres="$(Q "select jsonb_array_length(d->'tables'->'posts.author_id'->'lignes') || '|' || (d->'tables'->'posts.author_id'->'attendu') || '|' || (select string_agg(x->>'id', ' ' order by x->>'id') from jsonb_array_elements(d->'tables'->'post_comments.author_id'->'lignes') x) from (select public.export_compte_instantane('$A', 5000) d) y;")"
verifier "un export APRÈS voit le nouveau monde (1 001 posts = attendu, c2 c4)" "1001|1001|c2 c4" "$apres"

echo "── ④ MUTATION : une fonction VOLATILE prend un snapshot par requête ─────"
Q "alter function public.export_compte_instantane(text, integer, bigint) volatile;" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >"$BASE/s2b.log" 2>&1 <<SQL &
select pg_advisory_lock(42);
do \$\$ begin loop if exists (select 1 from pg_locks where locktype = 'advisory' and objid = 42 and not granted) then exit; end if; perform pg_sleep(0.02); end loop; end \$\$;
delete from public.post_comments where id = 'c2';
select pg_advisory_unlock(42);
SQL
S2=$!
for _ in $(seq 1 200); do [ "$(QF "select count(*) from pg_locks where locktype='advisory' and objid=42 and granted;")" = "1" ] && break; sleep 0.02; done
mut="$(Q "select (select string_agg(x->>'id', ' ' order by x->>'id') from jsonb_array_elements(public.export_compte_instantane('$A', 5000, 42)->'tables'->'post_comments.author_id'->'lignes') x);")"
wait "$S2" || true
verifier "mutant VOLATILE : post_comments montre c4 seule (c2 partie pendant) — l'instantané est PERDU, le banc le voit" "c4" "$mut"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 || true
verifier "…la migration rejouée la remet STABLE" "s" "$(Q "select provolatile from pg_proc where proname = 'export_compte_instantane';")"

echo "── ⑤ AUCUN ACCÈS CLIENT ──────────────────────────────────────────────"
# (sortie capturée AVANT le grep : avec pipefail, un `grep -q` qui coupe le tube fait échouer la chaîne)
r5="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set role authenticated; select public.export_compte_instantane('$A');" 2>&1 || true)"
verifier "authenticated ne peut pas appeler la fonction" "REFUSE" "$(printf '%s' "$r5" | grep -qi error && echo REFUSE || echo OK)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
