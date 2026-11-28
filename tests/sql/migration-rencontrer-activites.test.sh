#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_rencontrer_activites_2026-11-28.sql (et son retour arrière)
#
# Sur un PostgreSQL JETABLE, avec les définitions de PRODUCTION relues au
# catalogue le 2026-11-28 (corps recopiés à l'identique : le banc vérifie leurs
# empreintes md5 contre celles du catalogue) — suppression d'activité, avis aux
# inscrits, garde d'inscription, journal, refus d'une demande, clôture du
# refus, validation (`valider_participant`, prise de la migration du 27/11),
# visibilité d'une activité (blocage, activité privée) :
#   ⓪ AVANT : les défauts se REPRODUISENT (n° 227 : discussion sans conv_id,
#      carte du fil et lien `event_id` survivent, avis manqué MUET ; n° 212 :
#      une demande refusée se renvoie aussitôt, une notification à chaque fois ;
#      n° 198 : aucune lecture des amis qui y vont)
#   ① la migration s'applique (verdict OK), se REJOUE
#   ② APRÈS : chaque défaut est fermé, et ce qui marchait marche encore (une
#      première demande, une redemande après 24 h, « peut-être » et « je ne
#      peux pas » libres, promotion de la file, discussion d'autrui épargnée,
#      avis normal des inscrits) ; `amis_qui_y_vont` ne rend jamais un inconnu,
#      un bloqué, un suivi à sens unique, une demande non validée, ni une
#      activité qu'on ne peut pas lire
#   ③ MUTATION : retirer le suivi en retour, la garde de redemande, ou la purge
#      sans conv_id fait revenir le défaut (le banc le voit) ; une définition
#      changée ARRÊTE la migration (garde d'empreinte)
#   ④ RETOUR ARRIÈRE : rend les définitions d'avant (empreintes), le défaut
#      revient, et la migration se réapplique ensuite
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$RACINE/migrations/migration_rencontrer_activites_2026-11-28.sql"
RETOUR="$RACINE/migrations/migration_rencontrer_activites_retour_2026-11-28.sql"
# `valider_participant` de production = celle qu'écrit la migration du 27/11 (appliquée).
SRV27="$RACINE/migrations/migration_rencontrer_serveur_2026-11-27.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$MIG" "$RETOUR" "$SRV27"; do [ -f "$f" ] || { echo "❌ introuvable : $f"; exit 1; }; done

PORT=$(( 6440 + RANDOM % 120 ))
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

DB=rencontrer_activites
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
# Une requête SOUS un compte, validée. ⚠️ `set local role` et sa requête partent
# dans le MÊME appel (ADR-012) : séparés, le rôle retomberait sans erreur.
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1'; $2; commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$' || true; }
# Une ÉCRITURE sous un compte : rend « ok » (validée) ou le message du refus.
ESSAI() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1';
  do \$x\$ begin $2; raise notice 'ETAT=ok'; exception when others then raise notice 'ETAT=%', sqlerrm; end \$x\$; commit;" 2>&1 | sed -n 's/.*ETAT=//p'; }
# Une écriture sous un compte, SANS rattrapage : rend tout ce que le serveur
# imprime, avertissements compris (ce que lirait le journal de production).
JOURNAL() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1'; $2; commit;" 2>&1 || true; }
# Un appel sous `anon` (visiteur sans compte).
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -c "begin; set local role anon; $1; commit;" 2>&1 || true; }

LEA=11111111-1111-4111-8111-111111111111     # organise
HUGO=22222222-2222-4222-8222-222222222222    # demande, refusé
CHLOE=33333333-3333-4333-8333-333333333333   # première demande ; bloquée par Alice
ALICE=44444444-4444-4444-8444-444444444444   # celle qui regarde « qui y va »
INES=55555555-5555-4555-8555-555555555555    # amie validée
TOM=66666666-6666-4666-8666-666666666666     # suivi à sens unique
MARC=77777777-7777-4777-8777-777777777777    # « peut-être »
KEVIN=88888888-8888-4888-8888-888888888888   # compte en suppression
NINA=99999999-9999-4999-8999-999999999999    # suivi pas encore accepté (compte privé)
PAUL=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa    # liste d'attente
ZOE=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb     # inconnue
F1=c1111111-1111-4111-8111-111111111111; F2=c2222222-2222-4222-8222-222222222222; F3=c3333333-3333-4333-8333-333333333333
F4=c4444444-4444-4444-8444-444444444444; F5=c5555555-5555-4555-8555-555555555555

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
# Une préparation (sans session) : refusée = le banc s'arrête en le DISANT.
PREP() { local s; s="$(Q "$1")" || { echo "❌ préparation refusée :"; echo "$s"; exit 1; }; }
# Un texte qui CONTIENT (refuse) / ne contient PAS (absent) le motif attendu.
refuse() { case "$3" in *"$2"*) ok=$((ok+1)); printf '  ✅ %s\n' "$1";; *) ko=$((ko+1)); printf '  ❌ %s\n     attendu : un texte contenant « %s »\n     obtenu  : %s\n' "$1" "$2" "$3";; esac; }
absent() { case "$3" in *"$2"*) ko=$((ko+1)); printf '  ❌ %s\n     attendu : aucun « %s »\n     obtenu  : %s\n' "$1" "$2" "$3";; *) ok=$((ok+1)); printf '  ✅ %s\n' "$1";; esac; }

# ── SOCLE (définitions de production, 2026-11-28) ───────────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema rencontres_prive;

create table public.profiles (id text primary key, username text, emoji text, color text, avatar_url text, is_private boolean default false);
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.follows (follower_id text not null, following_id text not null, status text not null default 'accepted',
  created_at timestamptz default now(), primary key (follower_id, following_id));
create table public.comptes_en_suppression (user_id text primary key, statut text not null);
create table public.events (id text primary key, author_id text, organizer_id text, title text,
  status text not null default 'active', max_attendees integer, date_at timestamp, end_at timestamp,
  created_at timestamp default now(), co_organizers jsonb not null default '[]'::jsonb,
  visibilite text not null default 'publique', conv_id text,
  constraint events_conv_id_forme check ((conv_id is null) or (conv_id = ('evgrp_'::text || id))));
create table public.event_attendees (event_id text not null references public.events(id) on delete cascade, user_id text not null,
  created_at timestamptz default now(), rsvp text not null default 'going', checked_in_at timestamp, primary key (event_id, user_id));
create table public.event_invites (event_id text not null references public.events(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade, invited_by text, primary key (event_id, user_id));
create table public.conversations (id text primary key, is_group boolean default false, created_by text, created_at timestamp default now());
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null,
  primary key (conv_id, user_id));
create table public.conv_messages (id text primary key, conv_id text not null references public.conversations(id), from_id text, content text);
create table public.conv_reads (conv_id text not null references public.conversations(id), user_id text not null, primary key (conv_id, user_id));
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now());
create table public.posts (id text primary key, author_id text, content text, event_id text, created_at timestamp default now());
create table rencontres_prive.identifiants_retires (event_id text primary key);
create table rencontres_prive.accords (event_id text not null references public.events(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade, primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.event_attendees(event_id, user_id) on delete cascade);
create table rencontres_prive.decisions (id uuid primary key default gen_random_uuid(), event_id text references public.events(id) on delete set null,
  user_id text not null references public.profiles(id) on delete cascade, decideur_id text references public.profiles(id) on delete set null,
  accepter boolean not null, created_at timestamptz not null default now(), refus_en_cours boolean not null default false);
create table rencontres_prive.inscriptions (id uuid primary key default gen_random_uuid(), event_id text references public.events(id) on delete set null,
  user_id text not null references public.profiles(id) on delete cascade, rsvp text, created_at timestamptz not null default now());

-- Droits et policies réduits à leur contrat (sa ligne ; l'auteur pour l'activité).
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
grant select, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_attendees to authenticated;
create policy events_lecture on public.events for select using (true);
create policy events_suppression on public.events for delete to authenticated using (author_id = (select auth.uid())::text);
create policy ea_lecture on public.event_attendees for select to authenticated using (user_id = (select auth.uid())::text);
create policy ea_insert on public.event_attendees for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy ea_maj on public.event_attendees for update to authenticated
  using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy ea_suppression on public.event_attendees for delete to authenticated using (user_id = (select auth.uid())::text);

create function public.suppression_de_mon_compte() returns boolean language sql stable as $f$ select false $f$;

create or replace function public.passio_echapper_html(s text)
returns text language sql immutable set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(s, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

create or replace function public.is_blocked_with(_other text)
returns boolean language sql stable security definer set search_path = ''
as $$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.blocks b
       WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
          OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$$;

create or replace function public.activite_privee_fermee_pour_moi(p_event_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_event_id is not null and exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.visibilite = 'privee'
       and not coalesce((select auth.uid()) is not null and (
             e.author_id = (select auth.uid())::text
          or e.organizer_id = (select auth.uid())::text
          or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
              and e.co_organizers ? (select auth.uid())::text)
          or exists (select 1 from public.event_invites i
                      where i.event_id = e.id and i.user_id = (select auth.uid())::text)
          or exists (select 1 from public.event_attendees a
                      where a.event_id = e.id and a.user_id = (select auth.uid())::text)
       ), false)
  )
$$;

create or replace function public.activite_masquee_pour_moi(p_event_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_event_id is not null and (
    exists (
      select 1 from public.events e
       where e.id = p_event_id
         and e.author_id is distinct from (select auth.uid())::text
         and e.organizer_id is distinct from (select auth.uid())::text
         and (public.is_blocked_with(e.author_id)
              or (e.organizer_id is not null and e.organizer_id is distinct from e.author_id
                  and public.is_blocked_with(e.organizer_id)))
    )
    or public.activite_privee_fermee_pour_moi(p_event_id)
  )
$$;

create or replace function public.organise_activite(p_event_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text))
  );
$$;

create or replace function rencontres_prive.bloque(p_event text, p_user text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.events e join public.blocks b
    on (b.blocker_id = p_user and (b.blocked_id = e.author_id or b.blocked_id = e.organizer_id))
    or (b.blocked_id = p_user and (b.blocker_id = e.author_id or b.blocker_id = e.organizer_id))
    where e.id = p_event)
$$;

create or replace function rencontres_prive.verrou_paire(a text, b text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('rencontre-paire:' || least(a,b) || ':' || greatest(a,b),0)) then
   raise exception 'rencontre_concurrente_reessayer' using errcode = '40001';
 end if;
end $$;

create or replace function rencontres_prive.inscription_tracee()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ev text; qui text; reponse text; orga text; precedent text;
begin
 if tg_op = 'UPDATE' and new.rsvp is not distinct from old.rsvp then return null; end if;
 if tg_op = 'DELETE' then ev := old.event_id; qui := old.user_id; reponse := null;
 else ev := new.event_id; qui := new.user_id; reponse := new.rsvp; end if;
 select coalesce(organizer_id,author_id) into orga from public.events where id = ev;
 if not found or not exists(select 1 from public.profiles where id = qui) then return null; end if;
 insert into rencontres_prive.inscriptions(event_id,user_id,rsvp) values(ev,qui,reponse);
 if reponse is distinct from 'going' then
   delete from rencontres_prive.accords where event_id = ev and user_id = qui;
   delete from public.conv_members where conv_id = 'evgrp_' || ev and user_id = qui
     and qui is distinct from orga;
 end if;
 if reponse = 'going' and qui is distinct from orga and orga is not null then
   precedent := current_setting('passio.notification_serveur',true);
   perform set_config('passio.notification_serveur','1',true);
   insert into public.notifications(id,user_id,kind,from_id,ref_id,content,seen)
   values('n_rv_' || gen_random_uuid()::text,orga,'event_join',qui,ev,'demande à participer à ton activité',false);
   perform set_config('passio.notification_serveur',coalesce(precedent,''),true);
 end if;
 return null;
end $$;

create or replace function rencontres_prive.signaler_refus_demande()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  precedent text := current_setting('passio.notification_serveur', true);
begin
  -- valider_participant a verrouillé la ligne et n'a pas encore retiré l'accord.
  if new.user_id = new.decideur_id
     or not exists (select 1 from public.event_attendees a where a.event_id = new.event_id
                    and a.user_id = new.user_id and a.rsvp = 'going')
     or exists (select 1 from rencontres_prive.accords v where v.event_id = new.event_id and v.user_id = new.user_id)
     or rencontres_prive.bloque(new.event_id, new.user_id)
     or exists (select 1 from public.blocks b where (b.blocker_id,b.blocked_id)
                in ((new.user_id,new.decideur_id),(new.decideur_id,new.user_id))) then
    return new;
  end if;
  new.refus_en_cours := true;
  perform set_config('passio.notification_serveur','1',true);
  insert into public.notifications(id,user_id,kind,from_id,ref_id,content,seen)
  select 'n_pi_refus_' || new.id, new.user_id, 'event_update', new.decideur_id, e.id,
         'Ta demande de participation à « ' || public.passio_echapper_html(left(coalesce(e.title,'cette sortie'),80))
         || ' » n’a pas été acceptée.', false
  from public.events e where e.id = new.event_id;
  perform set_config('passio.notification_serveur',coalesce(precedent,''),true);
  return new;
end $$;

create or replace function rencontres_prive.clore_refus_demande()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update rencontres_prive.decisions set refus_en_cours = false
    where event_id = new.event_id and user_id = new.user_id and refus_en_cours;
  return null;
end $$;

create or replace function public.mon_refus_demande_sortie(p_event_id text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from rencontres_prive.decisions d
    where d.user_id = (select auth.uid())::text and d.event_id = p_event_id and d.refus_en_cours
  )
$$;

-- Deux gardes du BANC (pas de production) : un avis aux inscrits qu'on fait
-- échouer exprès, et une garde de `posts` qui refuse une mise à jour (comme
-- `zz_barriere_suppression` le ferait pour un compte en suppression).
create function public.banc_casser_avis() returns trigger language plpgsql as $f$
begin
  if current_setting('banc.casser_avis', true) = '1' and new.kind = 'event_cancelled' then
    raise exception 'banc : avis refusé';
  end if;
  return new;
end $f$;
create trigger banc_casser_avis before insert on public.notifications
  for each row execute function public.banc_casser_avis();
create function public.banc_garde_posts() returns trigger language plpgsql as $f$
begin
  if new.author_id = '88888888-8888-4888-8888-888888888888' then
    raise exception 'banc : écriture refusée (compte en suppression)';
  end if;
  return new;
end $f$;
create trigger banc_garde_posts before update on public.posts
  for each row execute function public.banc_garde_posts();
SQL

# Les trois définitions que la migration remplace : celles de PRODUCTION, prises
# du fichier de retour arrière (une seule copie dans le dépôt) ; puis
# `valider_participant`, prise de la migration du 27/11.
awk '/^-- Définitions de PRODUCTION du 2026-11-28/{p=1;next} /^-- ── FIN DES DÉFINITIONS DE PRODUCTION/{p=0} p' "$RETOUR" > "$BASE/prod.sql"
awk '/^create or replace function public.valider_participant\(/{p=1} p{print} p&&/^end \$\$;/{exit}' "$SRV27" >> "$BASE/prod.sql"
SOCLE="$(APPLIQUER "$BASE/prod.sql")" || { echo "$SOCLE"; echo "❌ définitions de production non posées"; exit 1; }
PREP "create trigger trg_events_prevenir_suppression before delete on public.events
     for each row execute function public.events_prevenir_suppression();
   create trigger zz_rencontres_suppression after delete on public.events
     for each row execute function rencontres_prive.activite_supprimee();
   create trigger aa_rencontres_inscription before insert or update on public.event_attendees
     for each row execute function rencontres_prive.inscription_gardee();
   create trigger zz_rencontres_trace after insert or delete or update on public.event_attendees
     for each row execute function rencontres_prive.inscription_tracee();
   create trigger refus_demande_membre before insert on rencontres_prive.decisions
     for each row when ((not new.accepter)) execute function rencontres_prive.signaler_refus_demande();
   create trigger clore_refus_demande after insert on rencontres_prive.inscriptions
     for each row when ((new.rsvp is not null)) execute function rencontres_prive.clore_refus_demande();
   revoke all on function public.events_prevenir_suppression(), rencontres_prive.activite_supprimee() from public;
   grant execute on function public.events_prevenir_suppression() to service_role;
   revoke all on function public.valider_participant(text,text,boolean) from public;
   grant execute on function public.valider_participant(text,text,boolean) to authenticated, service_role;"

echo "── ⓪ Le socle porte les corps de PRODUCTION ──"
verifier "empreintes des trois définitions remplacées = celles mesurées au catalogue le 2026-11-28" \
  "37d2060f3814d51e3259ad7d27c0d936|8eb718235eb04b2de4190245d6c4f42c|2264a362f103da28aa9a7da56523a76b" \
  "$(Q "select string_agg(md5(replace(prosrc, chr(13), '')), '|' order by o) from (values (1,'rencontres_prive.activite_supprimee()'),(2,'public.events_prevenir_suppression()'),(3,'rencontres_prive.inscription_gardee()')) v(o,s) join pg_proc p on p.oid = to_regprocedure(v.s);")"
verifier "empreintes du socle recopié (journal, refus, clôture, validation, visibilité, blocage, échappement, refus en cours)" \
  "389375f034d0fbbaa0cc608137c6cfe6|1c4f215ae3de8b160eb0aace30b843cc|652f0811b51b272471a0797acd20626a|6e3088fa44521cdc3ecb55c52d0eb941|02a2d18279a547ca6fee389b57ffdf35|da1c6bec324db6ea577f463505e630e1|25b7ca8e81031951cb241316f7cfdd64|52e65ee14d31883c87ed21c525dca0ba|8aadc5801675bd6e3fb9672c1190d9a1|144cba40ebaa14f326ca8193530840b6|6bf98f2a7e113d287e6b6bc9b395e159|29f0b3b6241535776d735841da34ae37" \
  "$(Q "select string_agg(md5(replace(prosrc, chr(13), '')), '|' order by o) from (values (1,'rencontres_prive.inscription_tracee()'),(2,'rencontres_prive.signaler_refus_demande()'),(3,'rencontres_prive.clore_refus_demande()'),(4,'public.valider_participant(text,text,boolean)'),(5,'public.activite_masquee_pour_moi(text)'),(6,'public.activite_privee_fermee_pour_moi(text)'),(7,'public.is_blocked_with(text)'),(8,'rencontres_prive.bloque(text,text)'),(9,'rencontres_prive.verrou_paire(text,text)'),(10,'public.organise_activite(text)'),(11,'public.passio_echapper_html(text)'),(12,'public.mon_refus_demande_sortie(text)')) v(o,s) join pg_proc p on p.oid = to_regprocedure(v.s);")"

PREP "insert into public.profiles (id, username) values ('$LEA','lea'),('$HUGO','hugo'),('$CHLOE','chloe'),('$ALICE','alice'),('$INES','ines'),
   ('$TOM','tom'),('$MARC','marc'),('$KEVIN','kevin'),('$NINA','nina'),('$PAUL','paul'),('$ZOE','zoe'),
   ('$F1','f1'),('$F2','f2'),('$F3','f3'),('$F4','f4'),('$F5','f5');
   insert into public.comptes_en_suppression values ('$KEVIN', 'en_cours');"

# Une activité de LÉA, publique, dans deux jours.
activite() { PREP "insert into public.events (id, author_id, organizer_id, title, date_at, created_at, visibilite)
  values ('$1', '${2:-$LEA}', '${2:-$LEA}', 'Activité $1', now() + interval '2 days', now() - interval '1 day', '${3:-publique}');"; }
# Une activité supprimable : discussion `evgrp_` créée par Léa APRÈS l'activité mais
# SANS conv_id, un message dedans, sa carte du fil, une publication d'Inès qui la cite.
supprimable() {
  activite "$1"
  PREP "insert into public.conversations values ('evgrp_$1', true, '$LEA', now());
     insert into public.conv_members values ('evgrp_$1', '$LEA');
     insert into public.conv_messages values ('m_$1', 'evgrp_$1', '$LEA', 'salut');
     insert into public.conv_reads values ('evgrp_$1', '$LEA');
     insert into public.posts (id, author_id, content, event_id) values ('post_ev_$1', '$LEA', 'Viens !', '$1'), ('p_lie_$1', '$INES', 'J''y serai', '$1');
     insert into public.event_attendees (event_id, user_id, rsvp) values ('$1', '$LEA', 'going'), ('$1', '$INES', 'going');"
}
conv() { Q "select count(*) from public.conversations where id = 'evgrp_$1';"; }
carte() { Q "select count(*) from public.posts where id = 'post_ev_$1';"; }
lien() { Q "select coalesce((select event_id from public.posts where id = '$2'), '—');"; }
demandes() { Q "select count(*) from public.notifications where kind = 'event_join' and ref_id = '$1' and from_id = '$2';"; }
rsvp() { Q "select coalesce((select rsvp from public.event_attendees where event_id = '$1' and user_id = '$2'), '—');"; }
vieillir() { PREP "update rencontres_prive.decisions set created_at = created_at - interval '25 hours' where event_id = '$1' and user_id = '$2';"; }
demander() { ESSAI "$2" "insert into public.event_attendees (event_id, user_id, rsvp) values ('$1', '$2', '${3:-going}')"; }
# `amis_qui_y_vont` sous un compte : « total|id1,id2,… »
AMIS() { EN "$1" "select (r->>'total') || '|' || coalesce((select string_agg(x->>'id', ',' order by o) from jsonb_array_elements(r->'amis') with ordinality t(x, o)), '') from (select public.amis_qui_y_vont('$2') as r) s"; }
# `etat_redemande_sortie` sous un compte : « motif|refus » (motif « — » si redemander est permis)
ETAT() { EN "$1" "select coalesce(r->>'motif', '—') || '|' || (r->>'refus') from (select public.etat_redemande_sortie('$2') as r) s"; }
# Suivis acceptés : `mutuel A B` = A suit B et B suit A.
suit() { PREP "insert into public.follows (follower_id, following_id, status) values ('$1', '$2', '${3:-accepted}') on conflict do nothing;"; }
mutuel() { suit "$1" "$2"; suit "$2" "$1"; }
# Une participation (sans session) et, si « valide », l'accord de l'organisation.
vient() { PREP "insert into public.event_attendees (event_id, user_id, rsvp, created_at) values ('$1', '$2', '${3:-going}', now() - interval '${4:-1} hours');"
          if [ "${5:-}" = "valide" ]; then PREP "insert into rencontres_prive.accords values ('$1', '$2');"; fi; }

# ══ ⓪ AVANT : les défauts se reproduisent ═══════════════════════════════════
echo "── ⓪ AVANT la migration ──"
supprimable sup_av
SORTIE_AV="$(JOURNAL "$LEA" "set local banc.casser_avis = '1'; delete from public.events where id = 'sup_av'")"
verifier "AVANT n° 227 l'activité est bien supprimée" "0" "$(Q "select count(*) from public.events where id = 'sup_av';")"
verifier "AVANT n° 227 sans conv_id, sa discussion evgrp_ survit (et son message)" "1|1" "$(conv sup_av)|$(Q "select count(*) from public.conv_messages where conv_id = 'evgrp_sup_av';")"
verifier "AVANT n° 227 la carte du fil post_ev_ reste" "1" "$(carte sup_av)"
verifier "AVANT n° 227 la publication d'Inès cite encore l'activité morte" "sup_av" "$(lien sup_av p_lie_sup_av)"
verifier "AVANT n° 227 l'avis aux inscrits a échoué : Inès n'est pas prévenue" "0" "$(Q "select count(*) from public.notifications where user_id = '$INES' and ref_id = 'sup_av';")"
absent "AVANT n° 227 …et RIEN ne le dit (aucun avertissement)" "WARNING" "$SORTIE_AV"

activite dem_av
verifier "AVANT n° 212 Hugo demande" "ok" "$(demander dem_av "$HUGO")"
EN "$LEA" "select public.valider_participant('dem_av', '$HUGO', false)" >/dev/null
verifier "AVANT n° 212 Hugo, refusé, redemande AUSSITÔT : accepté" "ok" "$(demander dem_av "$HUGO")"
EN "$LEA" "select public.valider_participant('dem_av', '$HUGO', false)" >/dev/null
verifier "AVANT n° 212 …refusé une seconde fois, il redemande encore : accepté" "ok" "$(demander dem_av "$HUGO")"
verifier "AVANT n° 212 l'organisation a reçu trois demandes de Hugo" "3" "$(demandes dem_av "$HUGO")"
verifier "AVANT n° 198 aucune lecture des amis qui y vont (RPC absente)" "absente" \
  "$(Q "select coalesce(to_regprocedure('public.amis_qui_y_vont(text)')::text, 'absente');")"

# ══ ① LA MIGRATION ══════════════════════════════════════════════════════════
echo "── ① La migration s'applique, se rejoue ──"
SORTIE="$(APPLIQUER "$MIG")" || { echo "$SORTIE"; echo "❌ la migration ne s'applique pas"; exit 1; }
verifier "huit lignes de verdict, aucune en ECHEC" "8|0" "$(printf '%s\n' "$SORTIE" | grep -c -E '^ *[0-9]+ \|' || true)|$(printf '%s\n' "$SORTIE" | grep -c 'ECHEC' || true)"
SORTIE2="$(APPLIQUER "$MIG")" || { echo "$SORTIE2"; echo "❌ la migration ne se rejoue pas"; exit 1; }
verifier "rejeu : verdict sans ECHEC" "0" "$(printf '%s\n' "$SORTIE2" | grep -c 'ECHEC' || true)"
verifier "les droits d'exécution des déclencheurs sont restés ceux de la production" "f|f|t" \
  "$(Q "select has_function_privilege('authenticated', 'public.events_prevenir_suppression()', 'execute');")|$(Q "select has_function_privilege('authenticated', 'rencontres_prive.activite_supprimee()', 'execute');")|$(Q "select has_function_privilege('service_role', 'public.events_prevenir_suppression()', 'execute');")"

# ══ ② APRÈS ═════════════════════════════════════════════════════════════════
echo "── ② APRÈS : n° 227 la suppression ne laisse rien derrière elle ──"
supprimable sup_ap
SORTIE_AP="$(JOURNAL "$LEA" "set local banc.casser_avis = '1'; delete from public.events where id = 'sup_ap'")"
verifier "l'activité est supprimée — même quand l'avis aux inscrits échoue" "0" "$(Q "select count(*) from public.events where id = 'sup_ap';")"
verifier "sa discussion evgrp_ est purgée sans conv_id (conversation, membres, messages, lectures)" "0|0|0|0" \
  "$(conv sup_ap)|$(Q "select count(*) from public.conv_members where conv_id = 'evgrp_sup_ap';")|$(Q "select count(*) from public.conv_messages where conv_id = 'evgrp_sup_ap';")|$(Q "select count(*) from public.conv_reads where conv_id = 'evgrp_sup_ap';")"
verifier "sa carte du fil post_ev_ est supprimée" "0" "$(carte sup_ap)"
verifier "la publication d'Inès reste, sans lien vers l'activité morte" "1|—" \
  "$(Q "select count(*) from public.posts where id = 'p_lie_sup_ap' and event_id is null;")|$(Q "select coalesce((select event_id from public.posts where id = 'p_lie_sup_ap'), '—');")"
refuse "l'avis manqué n'est plus muet : un avertissement le dit" "events_prevenir_suppression(sup_ap) : inscrits NON prévenus" "$SORTIE_AP"
verifier "l'identifiant reste retiré" "1" "$(Q "select count(*) from rencontres_prive.identifiants_retires where event_id = 'sup_ap';")"

supprimable sup_ok
JOURNAL "$LEA" "delete from public.events where id = 'sup_ok'" >/dev/null
verifier "sans panne, les inscrits sont prévenus comme avant (Inès)" "1" "$(Q "select count(*) from public.notifications where user_id = '$INES' and ref_id = 'sup_ok' and kind = 'event_cancelled';")"

# La provenance tient : la discussion d'un AUTRE (même nom), une discussion créée
# AVANT l'activité, la carte d'un autre auteur sous ce nom — épargnées.
activite sup_autre
PREP "insert into public.conversations values ('evgrp_sup_autre', true, '$HUGO', now());
   insert into public.posts (id, author_id, content, event_id) values ('post_ev_sup_autre', '$HUGO', 'faux', 'sup_autre'),
     ('p_kevin_sup_autre', '$KEVIN', 'refusée', 'sup_autre'), ('p_ines_sup_autre', '$INES', 'ok', 'sup_autre');"
activite sup_vieille
PREP "insert into public.conversations values ('evgrp_sup_vieille', true, '$LEA', now() - interval '3 days');"
SORTIE_AUTRE="$(JOURNAL "$LEA" "delete from public.events where id in ('sup_autre', 'sup_vieille')")"
verifier "discussion du même nom créée par un autre : épargnée ; créée avant l'activité : épargnée" "1|1" "$(conv sup_autre)|$(conv sup_vieille)"
verifier "carte d'un autre auteur sous le nom post_ev_ : épargnée, mais déliée" "1|—" "$(carte sup_autre)|$(lien sup_autre post_ev_sup_autre)"
verifier "une garde de posts qui refuse (Kevin) n'arrête rien : activité supprimée, Inès déliée, Kevin reste lié" "0|—|sup_autre" \
  "$(Q "select count(*) from public.events where id = 'sup_autre';")|$(lien sup_autre p_ines_sup_autre)|$(lien sup_autre p_kevin_sup_autre)"
refuse "…et le refus est dit dans le journal" "lien de la publication p_kevin_sup_autre non effacé" "$SORTIE_AUTRE"

activite sup_lie
PREP "insert into public.conversations values ('evgrp_sup_lie', true, '$LEA', now());
   update public.events set conv_id = 'evgrp_sup_lie' where id = 'sup_lie';"
JOURNAL "$LEA" "delete from public.events where id = 'sup_lie'" >/dev/null
verifier "une discussion liée par conv_id est toujours purgée" "0" "$(conv sup_lie)"

echo "── ② APRÈS : n° 212 une redemande, pas avant 24 h, aucune après deux refus ──"
activite dem_ap
verifier "Chloé fait sa PREMIÈRE demande : acceptée, l'organisation est prévenue" "ok|1" "$(demander dem_ap "$CHLOE")|$(demandes dem_ap "$CHLOE")"
verifier "Hugo demande : accepté" "ok|1" "$(demander dem_ap "$HUGO")|$(demandes dem_ap "$HUGO")"
EN "$LEA" "select public.valider_participant('dem_ap', '$HUGO', false)" >/dev/null
verifier "Léa refuse : la ligne de Hugo part, le refus est en cours" "—|t" "$(rsvp dem_ap "$HUGO")|$(EN "$HUGO" "select public.mon_refus_demande_sortie('dem_ap')")"
verifier "etat_redemande_sortie (Hugo) : trop tôt, un refus, possible dans 24 h" "redemande_trop_tot|1|t" \
  "$(ETAT "$HUGO" dem_ap)|$(EN "$HUGO" "select ((public.etat_redemande_sortie('dem_ap')->>'possible_le')::timestamptz between now() + interval '23 hours 59 minutes' and now() + interval '24 hours')")"
refuse "Hugo redemande AUSSITÔT : refusé (redemande_trop_tot)" "redemande_trop_tot" "$(demander dem_ap "$HUGO")"
verifier "…aucune ligne, et AUCUNE nouvelle notification à l'organisation" "—|1" "$(rsvp dem_ap "$HUGO")|$(demandes dem_ap "$HUGO")"
refuse "…ni par la liste d'attente" "redemande_trop_tot" "$(demander dem_ap "$HUGO" waitlist)"
verifier "« peut-être » reste libre" "ok" "$(demander dem_ap "$HUGO" maybe)"
refuse "…mais passer de « peut-être » à « je viens » est une redemande : refusé" "redemande_trop_tot" \
  "$(ESSAI "$HUGO" "update public.event_attendees set rsvp = 'going' where event_id = 'dem_ap' and user_id = '$HUGO'")"
verifier "« je ne peux pas » reste libre" "ok|declined" \
  "$(ESSAI "$HUGO" "update public.event_attendees set rsvp = 'declined' where event_id = 'dem_ap' and user_id = '$HUGO'")|$(rsvp dem_ap "$HUGO")"
ESSAI "$HUGO" "delete from public.event_attendees where event_id = 'dem_ap' and user_id = '$HUGO'" >/dev/null
vieillir dem_ap "$HUGO"
verifier "25 h après : redemander est permis (etat_redemande_sortie)" "—|1" "$(ETAT "$HUGO" dem_ap)"
verifier "Hugo redemande : accepté, l'organisation est prévenue une seconde fois" "ok|2" "$(demander dem_ap "$HUGO")|$(demandes dem_ap "$HUGO")"
EN "$LEA" "select public.valider_participant('dem_ap', '$HUGO', false)" >/dev/null
vieillir dem_ap "$HUGO"
verifier "second refus : plus de redemande, même 25 h après" "redemande_epuisee|2" "$(ETAT "$HUGO" dem_ap)"
refuse "Hugo redemande : refusé (redemande_epuisee)" "redemande_epuisee" "$(demander dem_ap "$HUGO")"
verifier "…aucune nouvelle notification à l'organisation" "2" "$(demandes dem_ap "$HUGO")"
verifier "etat_redemande_sortie ne parle que de l'appelant (Chloé : aucun refus)" "—|0" "$(ETAT "$CHLOE" dem_ap)"
verifier "etat_redemande_sortie sans session : rien" "t" "$(Q "select public.etat_redemande_sortie('dem_ap') is null;")"
refuse "etat_redemande_sortie refusée à un visiteur (anon)" "permission denied" "$(ANON "select public.etat_redemande_sortie('dem_ap')")"
# Un RETRAIT (participation validée puis retirée) est aussi une exclusion.
PREP "insert into public.event_attendees (event_id, user_id, rsvp) values ('dem_ap', '$INES', 'going');"
EN "$LEA" "select public.valider_participant('dem_ap', '$INES', true)" >/dev/null
EN "$LEA" "select public.valider_participant('dem_ap', '$INES', false)" >/dev/null
refuse "Inès, validée puis retirée, redemande aussitôt : refusé" "redemande_trop_tot" "$(demander dem_ap "$INES")"
# La promotion de la liste d'attente (waitlist → going) n'est pas une redemande.
PREP "insert into public.event_attendees (event_id, user_id, rsvp) values ('dem_ap', '$PAUL', 'waitlist');
   insert into rencontres_prive.decisions (event_id, user_id, decideur_id, accepter) values ('dem_ap', '$PAUL', '$LEA', false);"
verifier "Paul (en file, refusé il y a peu) est promu : accepté" "ok|going" \
  "$(ESSAI "$PAUL" "update public.event_attendees set rsvp = 'going' where event_id = 'dem_ap' and user_id = '$PAUL'")|$(rsvp dem_ap "$PAUL")"
verifier "une écriture sans session (administration) n'est pas jugée" "going" \
  "$(PREP "insert into public.event_attendees (event_id, user_id, rsvp) values ('dem_ap', '$HUGO', 'going');"; rsvp dem_ap "$HUGO")"

echo "── ② APRÈS : n° 198 les amis qui y vont — jamais une liste fermée ──"
activite am_ap
mutuel "$ALICE" "$LEA";   vient am_ap "$LEA" going 10
mutuel "$ALICE" "$INES";  vient am_ap "$INES" going 9 valide
mutuel "$ALICE" "$HUGO";  vient am_ap "$HUGO" going 8                      # demande non validée
mutuel "$ALICE" "$CHLOE"; vient am_ap "$CHLOE" going 7 valide              # Alice l'a bloquée
PREP "insert into public.blocks values ('$ALICE', '$CHLOE');"
suit "$ALICE" "$TOM";     vient am_ap "$TOM" going 6 valide                # sens unique
mutuel "$ALICE" "$MARC";  vient am_ap "$MARC" maybe 5                      # « peut-être »
mutuel "$ALICE" "$KEVIN"; vient am_ap "$KEVIN" going 4 valide              # compte en suppression
suit "$NINA" "$ALICE"; suit "$ALICE" "$NINA" pending; vient am_ap "$NINA" going 3 valide   # suivi pas accepté
mutuel "$ALICE" "$PAUL";  vient am_ap "$PAUL" waitlist 2                   # liste d'attente
vient am_ap "$ALICE" going 1 valide
verifier "Alice voit l'organisatrice et son amie validée, rien d'autre (ordre d'arrivée)" "2|$LEA,$INES" "$(AMIS "$ALICE" am_ap)"
verifier "…avec un pseudo et sans l'appelante" "lea|ines" \
  "$(EN "$ALICE" "select string_agg(x->>'username', '|' order by o) from jsonb_array_elements(public.amis_qui_y_vont('am_ap')->'amis') with ordinality t(x, o)")"
verifier "une inconnue (aucun suivi) : rien" "0|" "$(AMIS "$ZOE" am_ap)"
verifier "Tom, que je suis mais qui ne me suit pas, ne me voit pas non plus… et Inès, amie, me voit" "0||1|$ALICE" "$(AMIS "$TOM" am_ap)|$(AMIS "$INES" am_ap)"
verifier "Chloé (bloquée par Alice) ne voit pas Alice" "0|" "$(AMIS "$CHLOE" am_ap)"
refuse "amis_qui_y_vont refusée à un visiteur (anon)" "permission denied" "$(ANON "select public.amis_qui_y_vont('am_ap')")"
verifier "sans session : rien" "0" "$(Q "select public.amis_qui_y_vont('am_ap')->>'total';")"

activite am_priv "$LEA" privee
vient am_priv "$LEA" going 5; vient am_priv "$INES" going 4 valide
verifier "activité privée où Alice n'est pas invitée : rien" "0|" "$(AMIS "$ALICE" am_priv)"
PREP "insert into public.event_invites values ('am_priv', '$ALICE', '$LEA');"
verifier "…une fois invitée, elle voit qui y va" "2|$LEA,$INES" "$(AMIS "$ALICE" am_priv)"

activite am_tom "$TOM"
vient am_tom "$TOM" going 5; vient am_tom "$INES" going 4 valide
verifier "activité de Tom : Alice y voit Inès" "1|$INES" "$(AMIS "$ALICE" am_tom)"
PREP "insert into public.blocks values ('$TOM', '$ALICE');"
verifier "…Tom bloque Alice : l'activité lui est masquée, rien" "0|" "$(AMIS "$ALICE" am_tom)"
PREP "delete from public.blocks where blocker_id = '$TOM';"

activite am_ann
vient am_ann "$INES" going 4 valide
PREP "update public.events set status = 'cancelled' where id = 'am_ann';"
verifier "activité annulée : rien" "0|" "$(AMIS "$ALICE" am_ann)"

activite am_nb
for f in "$F1:9" "$F2:8" "$F3:7" "$F4:6" "$F5:5"; do mutuel "$ALICE" "${f%%:*}"; vient am_nb "${f%%:*}" going "${f##*:}" valide; done
verifier "cinq amis validés : trois nommés (les premiers arrivés), cinq comptés" "5|$F1,$F2,$F3" "$(AMIS "$ALICE" am_nb)"

# ══ ③ MUTATIONS ═════════════════════════════════════════════════════════════
echo "── ③ MUTATION : chaque garde retirée fait revenir son défaut ──"
awk '/^create or replace function public.amis_qui_y_vont\(/{p=1} p{print} p&&/\$\$;[[:space:]]*$/{exit}' "$MIG" | sed '/réciproque/,+1d' > "$BASE/mut-amis.sql"
SORTIEM="$(APPLIQUER "$BASE/mut-amis.sql")" || { echo "$SORTIEM"; echo "❌ mutation non posée"; exit 1; }
verifier "sans le suivi en retour : Tom (sens unique) apparaît chez Alice (le banc le voit)" "3|$LEA,$INES,$TOM" "$(AMIS "$ALICE" am_ap)"
awk '/^create or replace function rencontres_prive.inscription_gardee\(\)/{p=1} p{print} p&&/\$\$;[[:space:]]*$/{exit}' "$RETOUR" > "$BASE/mut-garde.sql"
awk '/^create or replace function rencontres_prive.activite_supprimee\(\)/{p=1} p{print} p&&/\$\$;[[:space:]]*$/{exit}' "$RETOUR" > "$BASE/mut-sup.sql"
SORTIEM="$(APPLIQUER "$BASE/mut-garde.sql")" || { echo "$SORTIEM"; echo "❌ mutation non posée"; exit 1; }
activite dem_mu
demander dem_mu "$HUGO" >/dev/null
EN "$LEA" "select public.valider_participant('dem_mu', '$HUGO', false)" >/dev/null
verifier "sans la garde de redemande : Hugo redemande aussitôt (le banc le voit)" "ok" "$(demander dem_mu "$HUGO")"
SORTIEM="$(APPLIQUER "$BASE/mut-sup.sql")" || { echo "$SORTIEM"; echo "❌ mutation non posée"; exit 1; }
supprimable sup_mu
JOURNAL "$LEA" "delete from public.events where id = 'sup_mu'" >/dev/null
verifier "sans la purge élargie : la discussion sans conv_id survit (le banc le voit)" "1|1" "$(conv sup_mu)|$(carte sup_mu)"
SORTIE3="$(APPLIQUER "$MIG")" || { echo "$SORTIE3"; echo "❌ la migration ne se réapplique pas après mutation"; exit 1; }
EN "$LEA" "select public.valider_participant('dem_mu', '$HUGO', false)" >/dev/null
refuse "migration réappliquée : la garde est de retour (second refus : épuisée)" "redemande_epuisee" "$(demander dem_mu "$HUGO")"
verifier "…et le suivi en retour" "2|$LEA,$INES" "$(AMIS "$ALICE" am_ap)"

# ══ ④ RETOUR ARRIÈRE ════════════════════════════════════════════════════════
echo "── ④ Retour arrière ──"
SORTIE4="$(APPLIQUER "$RETOUR")" || { echo "$SORTIE4"; echo "❌ le retour arrière ne s'applique pas"; exit 1; }
verifier "retour : trois lignes de verdict, aucune en ECHEC" "3|0" "$(printf '%s\n' "$SORTIE4" | grep -c -E '^ *[0-9]+ \|' || true)|$(printf '%s\n' "$SORTIE4" | grep -c 'ECHEC' || true)"
activite dem_rt
demander dem_rt "$HUGO" >/dev/null
EN "$LEA" "select public.valider_participant('dem_rt', '$HUGO', false)" >/dev/null
verifier "retour : le défaut n° 212 revient (Hugo redemande aussitôt)" "ok" "$(demander dem_rt "$HUGO")"
verifier "retour : plus de RPC des amis" "absente" "$(Q "select coalesce(to_regprocedure('public.amis_qui_y_vont(text)')::text, 'absente');")"
SORTIE5="$(APPLIQUER "$MIG")" || { echo "$SORTIE5"; echo "❌ la migration ne se réapplique pas après le retour"; exit 1; }
verifier "la migration se réapplique après le retour" "0" "$(printf '%s\n' "$SORTIE5" | grep -c 'ECHEC' || true)"

# ══ ③ bis GARDE D'EMPREINTE (en dernier : elle altère une définition) ════════
echo "── ③ bis Garde : une définition changée arrête tout ──"
PREP "create or replace function rencontres_prive.activite_supprimee() returns trigger language plpgsql security definer set search_path = '' as \$f\$ begin return old; end \$f\$;"
if SORTIE6="$(APPLIQUER "$MIG")"; then GARDE="appliquée"; else GARDE="arrêtée"; fi
verifier "activite_supprimee réécrite ailleurs : la migration est ARRÊTÉE" "arrêtée" "$GARDE"
refuse "…et le dit" "a changé depuis la mesure" "$SORTIE6"

echo
echo "banc rencontrer_activites : $ok ✅ · $ko ❌"
[ "$ko" -eq 0 ]
