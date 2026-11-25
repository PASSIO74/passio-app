#!/usr/bin/env bash
# PostgreSQL jetable. Deux auteurs, les droits de colonne de posts et les aides
# du catalogue dont dépend le contrat du Studio.
set -euo pipefail
racine="$(cd "$(dirname "$0")/../.." && pwd)"
migration="$racine/migrations/migration_lier_publication_sortie_2026-11-25.sql"
if ! command -v initdb >/dev/null; then
  PATH="$(pg_config --bindir):$PATH"
fi
base="$(mktemp -d)"
port=$(( 7400 + RANDOM % 900 ))
serveur=()
if [[ "$(id -u)" == 0 ]]; then
  chown postgres "$base"
  serveur=(runuser -u postgres --)
fi
nettoyer() {
  "${serveur[@]}" pg_ctl -D "$base/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$base"
}
trap nettoyer EXIT
"${serveur[@]}" initdb -A trust -U postgres -D "$base/data" >/dev/null
"${serveur[@]}" pg_ctl -D "$base/data" -o "-k '$base' -p $port -c listen_addresses=''" -l "$base/journal" -w start >/dev/null
sql=(psql -X -qAt -v ON_ERROR_STOP=1 -h "$base" -p "$port" -U postgres -d postgres)
"${sql[@]}" <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
create function public.adult_access_allowed() returns boolean language sql stable as $$
  select current_setting('test.admission',true) is distinct from 'refuse'
$$;
create function public.suppression_de_mon_compte() returns boolean language sql stable as $$
  select current_setting('test.suppression',true) is not distinct from 'oui'
$$;
create function public.post_masque(text) returns boolean language sql stable as $$
  select $1 = 'masque'
$$;
create function public.activite_de_partage(text) returns text language sql immutable as $$
  select case when ($1::jsonb)->>'kind' = 'event' then ($1::jsonb)->>'id' end
$$;
create table public.events(id text primary key, author_id text, organizer_id text, status text);
create table public.posts(id text primary key, author_id text, mood text, content text default 'Mon texte',
  is_reel boolean default false, shared_from_post_id text, shared_data text, event_id text);
grant select on public.posts, public.events to authenticated;
grant update(content) on public.posts to authenticated;
alter table public.posts enable row level security;
alter table public.events enable row level security;
insert into public.events values
  ('sortie','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','active'),
  ('seconde','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','active'),
  ('annulee','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','cancelled'),
  ('organisateur-tiers','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','active'),
  ('tiers','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','active');
insert into public.posts(id, author_id, mood)
  select nom,'00000000-0000-4000-8000-000000000001','irl'
    from unnest(array['source','concurrent','masque','conseil','bobine','repartage','carte','photo']) nom;
update public.posts set mood='learn' where id='conseil';
update public.posts set is_reel=true where id='bobine';
update public.posts set shared_from_post_id='source' where id='repartage';
update public.posts set shared_data='{"kind":"event","id":"sortie"}' where id='carte';
update public.posts set shared_data='{"passio_media":{"protocol":1,"type":"photo"}}' where id='photo';
SQL
for tentative in 1 2; do
  verdict="$("${sql[@]}" -f "$migration")"
  [[ "$verdict" == *'|OK' && "$verdict" != *ECHEC* ]]
done

"${sql[@]}" <<'SQL'
set role authenticated;
do $$ begin
  assert public.relier_publication_sortie('source','sortie') is false, 'session sans identité';
end $$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$ declare ident text; begin
  foreach ident in array array['masque','conseil','bobine','repartage','carte','absent'] loop
    assert public.relier_publication_sortie(ident,'sortie') is false, ident;
  end loop;
  foreach ident in array array['tiers','organisateur-tiers','annulee','absente'] loop
    assert public.relier_publication_sortie('source',ident) is false, ident;
  end loop;
  perform set_config('test.admission','refuse',true);
  assert public.relier_publication_sortie('source','sortie') is false, 'admission';
  perform set_config('test.admission','admis',true);
  perform set_config('test.suppression','oui',true);
  assert public.relier_publication_sortie('source','sortie') is false, 'suppression';
end $$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin
  assert public.relier_publication_sortie('source','tiers') is false, 'post d’un tiers';
end $$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$ begin
  assert public.relier_publication_sortie('source','sortie') is true, 'premier rattachement';
  assert public.relier_publication_sortie('source','sortie') is true, 'rejeu identique';
  assert public.relier_publication_sortie('source','seconde') is false, 'écrasement';
  assert public.relier_publication_sortie('photo','sortie') is true, 'photo native';
  assert not has_column_privilege(current_user,'public.posts','event_id','UPDATE');
end $$;
reset role;
do $$ begin
  assert not exists(select 1 from public.posts where content <> 'Mon texte');
  assert (select event_id from public.posts where id='source') = 'sortie';
  assert (select count(*) from public.posts where event_id is not null) = 2;
end $$;
SQL

# Le premier client détient la ligne jusqu'au commit ; la seconde transaction
# revoit alors la version gagnante. Le signal du client psql suit la RPC.
appel="set local role authenticated; set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';"
"${sql[@]}" >"$base/premier" <<SQL &
begin;
$appel
select public.relier_publication_sortie('concurrent','sortie');
\! touch '$base/verrou'
select pg_sleep(1);
commit;
SQL
premier=$!
for _ in {1..200}; do [[ -e "$base/verrou" ]] && break; sleep 0.02; done
[[ -e "$base/verrou" ]]
second="$("${sql[@]}" -c "begin; $appel select public.relier_publication_sortie('concurrent','seconde'); commit;")"
wait "$premier"
grep -qx t "$base/premier"
[[ "$second" == f ]]

sed -n 's/^--| //p' "$migration" | "${sql[@]}"
[[ "$("${sql[@]}" -c "select to_regprocedure('public.relier_publication_sortie(text,text)') is null and (select event_id='sortie' from public.posts where id='source')")" == t ]]
echo "OK : accès, liaison, idempotence, concurrence et retour arrière."
