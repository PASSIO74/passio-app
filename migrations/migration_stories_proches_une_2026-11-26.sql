-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- STORIES « AMIS PROCHES » ET « À LA UNE » (2026-11-26)
-- Demande de Benjamin : « copie Instagram » pour les stories. Texte, polices, dessin, stickers,
-- sondage, filtres, compte à rebours sont faits ; restent deux fonctions qui touchent la sécurité
-- serveur, livrées ici en un lot dédié (docs/lots-ui/32-STORY-CREER-2026-11-26.md, lot E).
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun prérequis client : le client servi
-- n'envoie pas `audience` et ne lit pas les tables neuves tant que ses drapeaux sont éteints
-- (STORY_PROCHES_ACTIF, STORY_UNE_ACTIF, app-08) ; il tolère leur absence (42P01 / PGRST205 /
-- 42703 / PGRST204).
--
-- CE QUI CHANGE :
--   ① `stories.audience` ('tous' | 'proches', défaut 'tous') : un ancien client publie pour tous.
--      Aucune policy UPDATE sur `stories` : l'audience ne change pas après publication.
--   ② `amis_proches` (owner_id, ami_id) : la liste de l'AUTEUR, lue, écrite et vidée par lui SEUL.
--      L'ami ne lit pas la liste (il ne lit que les stories qu'elle lui ouvre). INSERT par la seule
--      colonne `ami_id` (owner_id et created_at prennent leur défaut, règle C-04). 1 000 au plus.
--   ③ Lecture d'une story « proches » : DEUX policies RESTRICTIVES sur `stories`, une par rôle —
--      anon : `audience = 'tous'` ; authenticated : `audience = 'tous' or story_proches_autorise(id)`
--      (l'auteur, ou un compte de SA liste qu'il n'a pas bloqué / qui ne l'a pas bloqué). La policy
--      permissive « Lecture stories respectant les comptes prives » N'EST PAS TOUCHÉE : son empreinte
--      (111ac554…, figée par migration_medias_proteges_go_2026-11-16.sql) reste la même ; une story
--      « proches » d'un compte privé reste réservée à ses abonnés acceptés ET à la liste.
--      Une fonction par rôle : anon n'a pas EXECUTE sur une fonction réservée à authenticated (le
--      contrôle de droit se fait à l'initialisation, même dans une branche OR non évaluée).
--   ④ `story_visible` (SECURITY DEFINER, recopie de la policy) applique la même règle : j'aime,
--      commentaires, vues et votes de sondage d'une story « proches » sont fermés hors de la liste.
--   ⑤ Médias : `media_assets_anon` / `media_assets_user` relisent `stories` SOUS LA RLS DE
--      L'APPELANT (media_resoudre est INVOKER) — une story « proches » n'est donc résolue
--      (`/private-media/stories/...`) que pour l'auteur et la liste, sans règle de plus. Elles
--      gagnent une branche : une story À LA UNE reste résolue au-delà de 24 h.
--   ⑥ `stories_une` (story_id, groupe, owner_id) : l'auteur épingle SES stories en groupes titrés
--      (24 caractères, 30 groupes, 100 stories par groupe, 500 au total). Une ligne n'est lue que si
--      la story l'est (sous la RLS de l'appelant : compte privé, « proches », blocage).
--   ⑦ Purge (`rencontres_prive.purger_socle`) : une story à la une n'est plus effacée à 48 h, ni ses
--      vues ; ses fichiers restent donc référencés (`medias:orphelins` lit `stories.media_url`).
--      Désépinglée, elle part à la purge suivante.
--
-- RÉSIDUS ASSUMÉS :
--   · un ami de la liste SAIT qu'il y est (anneau vert, comme Instagram) ; il ne voit pas la liste.
--   · un compte PUBLIC sans blocage : la policy permissive ne regarde pas le blocage (préexistant,
--     hors lot) ; `story_visible` et `media_assets_user` le regardent, et la règle « proches » aussi.
--   · `amis_proches` et `stories_une` ne sont pas dans l'export RGPD (comme `story_likes`) : elles
--     partent avec le profil (ON DELETE CASCADE), voir scripts/audit-tables-compte.js.
--   · rejouer migration_medias_proteges_go_2026-11-16.sql APRÈS celle-ci : son prérequis voit les
--     deux policies restrictives et refuse (« Policies source supplementaires : revue requise ») —
--     fermé, voulu : le socle demande une revue, il ne se rouvre pas.
--
-- RETOUR ARRIÈRE (éditeur SQL) — rend les stories « proches » LISIBLES PAR TOUS : supprimer d'abord
-- les stories proches (`delete from public.stories where audience = 'proches';`), puis :
--| begin;
--| drop policy if exists stories_audience_anon on public.stories;
--| drop policy if exists stories_audience_authenticated on public.stories;
--| drop function if exists public.story_proches_autorise(text);
--| drop table if exists public.stories_une;
--| drop table if exists public.amis_proches;
--| -- puis rejouer les définitions d'origine de story_visible (migration_story_interactions_2026-11-14.sql),
--| -- des policies media_assets_* (migration_medias_proteges_go_2026-11-16.sql) et de purger_socle
--| -- (tests/sql/fixtures/purger-socle-prod-2026-11-26.sql), et enfin :
--| alter table public.stories drop column if exists audience;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── PRÉREQUIS : ce que cette migration remplace est ce qui a été lu en production le 2026-11-26 ──
do $prerequis$
declare n integer;
begin
  if to_regclass('public.stories') is null or to_regclass('public.media_assets') is null
     or to_regclass('public.story_views') is null or to_regclass('public.profiles') is null then
    raise exception 'Tables prerequises absentes (stories, story_views, media_assets, profiles)';
  end if;
  if to_regprocedure('public.is_blocked_with(text)') is null
     or to_regprocedure('public.story_est_a_moi(text)') is null
     or to_regprocedure('public.suppression_de_mon_compte()') is null
     or to_regprocedure('public.debit_par_compte()') is null
     or to_regprocedure('public.refuser_ecriture_compte_en_suppression()') is null
     or to_regprocedure('public.abonne_accepte_non_bloque(text)') is null
     or to_regprocedure('rencontres_prive.purger_socle()') is null then
    raise exception 'Fonctions prerequises absentes';
  end if;
  -- La policy permissive de lecture des stories : celle que le socle des médias a figée.
  if not exists (select 1 from pg_policy q where q.polrelid = 'public.stories'::regclass
                  and q.polname = 'Lecture stories respectant les comptes prives' and q.polcmd = 'r'
                  and q.polpermissive and q.polroles = '{0}'::oid[]
                  and md5(pg_get_expr(q.polqual, q.polrelid)) = '111ac554780891654f2632a1b469f676') then
    raise exception 'Policy prerequise differente : stories.Lecture stories respectant les comptes prives';
  end if;
  -- Aucune autre source de lecture que la permissive et, au rejeu, nos deux restrictives.
  select count(*) into n from pg_policy where polrelid = 'public.stories'::regclass and polcmd in ('r', '*')
     and not (polname in ('stories_audience_anon', 'stories_audience_authenticated') and not polpermissive);
  if n <> 1 then raise exception 'Policies de lecture supplementaires sur stories : revue requise'; end if;
  -- Corps remplacés : version lue en production (md5 brut) ou version de cette migration (rejeu).
  if md5(pg_get_functiondef('rencontres_prive.purger_socle()'::regprocedure)) <> 'a73992a8c1628a71e33d6f39b1fbe10a'
     and pg_get_functiondef('rencontres_prive.purger_socle()'::regprocedure) not like '%stories_une%' then
    raise exception 'Corps prerequis different : rencontres_prive.purger_socle()';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.media_assets'::regclass and polname = 'media_assets_anon'
                  and not polpermissive and (md5(pg_get_expr(polqual, polrelid)) = '79596dd0076ba143a7e7905e035c8a04'
                                             or pg_get_expr(polqual, polrelid) like '%stories_une%'))
     or not exists (select 1 from pg_policy where polrelid = 'public.media_assets'::regclass and polname = 'media_assets_user'
                  and not polpermissive and (md5(pg_get_expr(polqual, polrelid)) = 'dd8b21a043e79a30018d504c6bef70c6'
                                             or pg_get_expr(polqual, polrelid) like '%stories_une%')) then
    raise exception 'Policies prerequises differentes : media_assets_anon / media_assets_user';
  end if;
  -- story_visible : corps lu en production le 2026-11-26 (md5 brut) ou celui de cette migration (rejeu).
  if md5(pg_get_functiondef('public.story_visible(text)'::regprocedure)) <> '2faa83a444cf0c854806d319c5b85d61'
     and pg_get_functiondef('public.story_visible(text)'::regprocedure) not like '%amis_proches%' then
    raise exception 'Corps prerequis different : public.story_visible(text)';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Roles clients incompatibles';
  end if;
end $prerequis$;

-- ── ① Audience d'une story ───────────────────────────────────────────────────────────────────────
alter table public.stories add column if not exists audience text not null default 'tous';
do $c$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.stories'::regclass and conname = 'stories_audience_check') then
    alter table public.stories add constraint stories_audience_check check (audience in ('tous', 'proches'));
  end if;
end $c$;
-- Droits par colonne (la production a des droits de TABLE ; une base aux droits par colonne n'ouvrirait
-- pas la colonne neuve). Lecture pour tous les rôles clients, écriture à la création seulement :
-- aucun UPDATE de colonne n'est accordé ici (et aucune policy UPDATE n'existe sur `stories`).
grant select (audience) on public.stories to anon, authenticated;
grant insert (audience) on public.stories to authenticated;

-- ── ② La liste « Amis proches » ──────────────────────────────────────────────────────────────────
create table if not exists public.amis_proches (
  owner_id   text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  ami_id     text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, ami_id),
  constraint amis_proches_pas_soi check (owner_id <> ami_id)
);
-- « Suis-je dans la liste de X ? » est la question de chaque lecture de story : index côté ami.
create index if not exists amis_proches_ami_idx on public.amis_proches (ami_id, owner_id);
alter table public.amis_proches enable row level security;
revoke all on public.amis_proches from public, anon, authenticated;
grant select, delete on public.amis_proches to authenticated;
grant insert (ami_id) on public.amis_proches to authenticated;

drop policy if exists amis_proches_select on public.amis_proches;
create policy amis_proches_select on public.amis_proches for select to authenticated
  using (owner_id = (select auth.uid())::text);
drop policy if exists amis_proches_insert on public.amis_proches;
create policy amis_proches_insert on public.amis_proches for insert to authenticated
  with check (owner_id = (select auth.uid())::text
              and not public.is_blocked_with(ami_id)
              and not public.suppression_de_mon_compte());
drop policy if exists amis_proches_delete on public.amis_proches;
create policy amis_proches_delete on public.amis_proches for delete to authenticated
  using (owner_id = (select auth.uid())::text);

-- Plafond : 1 000 amis proches par compte (verrou par propriétaire : deux INSERT simultanés ne
-- franchissent pas la borne ensemble).
create or replace function public.amis_proches_plafond() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('amis_proches:' || new.owner_id));
  if (select count(*) from public.amis_proches a where a.owner_id = new.owner_id) >= 1000 then
    raise exception 'liste amis proches pleine (1000)' using errcode = 'P0001';
  end if;
  return new;
end $fn$;
revoke all on function public.amis_proches_plafond() from public, anon, authenticated;
drop trigger if exists amis_proches_plafond on public.amis_proches;
create trigger amis_proches_plafond before insert on public.amis_proches
  for each row execute function public.amis_proches_plafond();
drop trigger if exists trg_debit_compte on public.amis_proches;
create trigger trg_debit_compte before insert on public.amis_proches
  for each row execute function public.debit_par_compte('120');
drop trigger if exists zz_barriere_suppression on public.amis_proches;
create trigger zz_barriere_suppression before insert or update on public.amis_proches
  for each row execute function public.refuser_ecriture_compte_en_suppression('owner_id');

-- ── ③ Qui lit une story « proches » ──────────────────────────────────────────────────────────────
-- Vrai SEULEMENT pour une story « proches » que l'appelant a le droit de lire (liste ET, pour un compte
-- privé, abonnement accepté) : pour toute autre
-- (inexistante, « tous », privée…) elle rend faux — pas d'oracle d'existence (leçon de
-- story_a_un_sondage, red team du 2026-11-26).
create or replace function public.story_proches_autorise(_story_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _story_id is null then false else exists (
    select 1 from public.stories s
     where s.id = _story_id and s.audience = 'proches'
       and (   s.author_id = (auth.uid())::text
            or (    exists (select 1 from public.amis_proches a
                             where a.owner_id = s.author_id and a.ami_id = (auth.uid())::text)
                and not public.is_blocked_with(s.author_id)
                -- Recopie de la policy permissive : un compte PRIVÉ n'est lu que par ses abonnés
                -- acceptés (sinon la RPC confirmait une story que la table ne rend pas).
                and (   not exists (select 1 from public.profiles pr where pr.id = s.author_id and pr.is_private = true)
                     or public.abonne_accepte_non_bloque(s.author_id))))
  ) end
$fn$;
revoke all on function public.story_proches_autorise(text) from public, anon;
grant execute on function public.story_proches_autorise(text) to authenticated;

drop policy if exists stories_audience_anon on public.stories;
create policy stories_audience_anon on public.stories as restrictive for select to anon
  using (audience = 'tous');
drop policy if exists stories_audience_authenticated on public.stories;
-- La branche AUTEUR se lit SUR LA LIGNE : le client publie par INSERT … RETURNING, et la policy de
-- lecture est alors évaluée sur la ligne neuve, INVISIBLE à une fonction qui relit la table (red team
-- du 2026-11-26 : toute story « proches » était refusée en 42501).
create policy stories_audience_authenticated on public.stories as restrictive for select to authenticated
  using (audience = 'tous' or author_id = (select auth.uid())::text or public.story_proches_autorise(id));

-- ── ④ story_visible : la même règle pour les j'aime, commentaires, vues et votes ─────────────────
create or replace function public.story_visible(_story_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _story_id is null then false else exists (
    select 1 from public.stories s
     where s.id = _story_id
       and (   s.author_id = (auth.uid())::text
            or (    not exists (select 1 from public.profiles pr where pr.id = s.author_id and pr.is_private = true)
                and not public.is_blocked_with(s.author_id))
            or public.abonne_accepte_non_bloque(s.author_id))
       -- « proches » : l'auteur, ou un compte de SA liste, hors blocage dans un sens ou l'autre.
       and (   s.audience = 'tous'
            or s.author_id = (auth.uid())::text
            or (    exists (select 1 from public.amis_proches a
                             where a.owner_id = s.author_id and a.ami_id = (auth.uid())::text)
                and not public.is_blocked_with(s.author_id)))
  ) end
$fn$;
revoke all on function public.story_visible(text) from public, anon;
grant execute on function public.story_visible(text) to authenticated;

-- ── ⑥ Stories à la une ───────────────────────────────────────────────────────────────────────────
create table if not exists public.stories_une (
  story_id   text not null references public.stories(id) on delete cascade,
  groupe     text not null constraint stories_une_groupe check (
               char_length(groupe) between 1 and 24 and groupe = btrim(groupe) and groupe !~ '[[:cntrl:]]'
               -- ni contrôle de direction ni caractère de largeur nulle (titre trompeur, red team)
               and groupe !~ '[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]'),
  owner_id   text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, groupe)
);
create index if not exists stories_une_owner_idx on public.stories_une (owner_id, groupe, created_at);
alter table public.stories_une enable row level security;
revoke all on public.stories_une from public, anon, authenticated;
grant select on public.stories_une to anon;
grant select, delete on public.stories_une to authenticated;
grant insert (story_id, groupe) on public.stories_une to authenticated;

-- Lecture : la story épinglée est lisible PAR L'APPELANT (sous SA RLS de `stories` : compte privé,
-- « proches ») et elle est bien de l'épingleur ; hors blocage pour un compte connecté.
drop policy if exists stories_une_select_anon on public.stories_une;
create policy stories_une_select_anon on public.stories_une for select to anon
  using (exists (select 1 from public.stories s where s.id = story_id and s.author_id = owner_id));
drop policy if exists stories_une_select on public.stories_une;
create policy stories_une_select on public.stories_une for select to authenticated
  using (owner_id = (select auth.uid())::text
         or (exists (select 1 from public.stories s where s.id = story_id and s.author_id = owner_id)
             and not public.is_blocked_with(owner_id)));
drop policy if exists stories_une_insert on public.stories_une;
create policy stories_une_insert on public.stories_une for insert to authenticated
  with check (owner_id = (select auth.uid())::text
              and public.story_est_a_moi(story_id)
              and not public.suppression_de_mon_compte());
drop policy if exists stories_une_delete on public.stories_une;
create policy stories_une_delete on public.stories_une for delete to authenticated
  using (owner_id = (select auth.uid())::text);

create or replace function public.stories_une_plafond() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('stories_une:' || new.owner_id));
  if (select count(*) from public.stories_une u where u.owner_id = new.owner_id) >= 500 then
    raise exception 'a la une : 500 stories au plus' using errcode = 'P0001';
  end if;
  if (select count(*) from public.stories_une u where u.owner_id = new.owner_id and u.groupe = new.groupe) >= 100 then
    raise exception 'a la une : 100 stories par groupe au plus' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.stories_une u where u.owner_id = new.owner_id and u.groupe = new.groupe)
     and (select count(distinct u.groupe) from public.stories_une u where u.owner_id = new.owner_id) >= 30 then
    raise exception 'a la une : 30 groupes au plus' using errcode = 'P0001';
  end if;
  return new;
end $fn$;
revoke all on function public.stories_une_plafond() from public, anon, authenticated;
drop trigger if exists stories_une_plafond on public.stories_une;
create trigger stories_une_plafond before insert on public.stories_une
  for each row execute function public.stories_une_plafond();
drop trigger if exists trg_debit_compte on public.stories_une;
create trigger trg_debit_compte before insert on public.stories_une
  for each row execute function public.debit_par_compte('120');
drop trigger if exists zz_barriere_suppression on public.stories_une;
create trigger zz_barriere_suppression before insert or update on public.stories_une
  for each row execute function public.refuser_ecriture_compte_en_suppression('owner_id');

-- ── ⑤ Médias : une story à la une reste résolue au-delà de 24 h ──────────────────────────────────
-- Recopie des policies de migration_medias_proteges_go_2026-11-16.sql ; seule la branche story
-- change. Le sous-SELECT de `stories` (et de `stories_une`) s'exécute sous la RLS de l'appelant :
-- une story « proches » n'y apparaît que pour l'auteur et la liste.
drop policy if exists media_assets_anon on public.media_assets;
create policy media_assets_anon on public.media_assets as restrictive for select to anon using(
  (select public.media_proteges_actifs()) and ((post_id is not null and exists(select 1 from public.posts p where p.id=post_id and p.author_id=owner_id and (p.vlog is null or p.vlog='null'::jsonb)))
  or (story_id is not null and created_at>statement_timestamp()-interval '24 hours' and exists(select 1 from public.stories s
    where s.id=story_id and s.author_id=owner_id and s.created_at at time zone 'UTC'>statement_timestamp()-interval '24 hours'
      and s.created_at at time zone 'UTC'<=statement_timestamp()+interval '5 minutes'))
  or (story_id is not null and exists(select 1 from public.stories_une u join public.stories s on s.id=u.story_id
    where u.story_id=media_assets.story_id and u.owner_id=media_assets.owner_id and s.author_id=media_assets.owner_id))));
drop policy if exists media_assets_user on public.media_assets;
create policy media_assets_user on public.media_assets as restrictive for select to authenticated using(
  (select public.media_proteges_actifs()) and (select public.media_session_active()) and not public.is_blocked_with(owner_id) and (
  (post_id is not null and exists(select 1 from public.posts p where p.id=post_id and p.author_id=owner_id and (p.vlog is null or p.vlog='null'::jsonb)))
  or (story_id is not null and created_at>statement_timestamp()-interval '24 hours' and exists(select 1 from public.stories s
    where s.id=story_id and s.author_id=owner_id and s.created_at at time zone 'UTC'>statement_timestamp()-interval '24 hours'
      and s.created_at at time zone 'UTC'<=statement_timestamp()+interval '5 minutes'))
  or (story_id is not null and exists(select 1 from public.stories_une u join public.stories s on s.id=u.story_id
    where u.story_id=media_assets.story_id and u.owner_id=media_assets.owner_id and s.author_id=media_assets.owner_id))));

-- ── ⑦ Purge : une story à la une n'est pas effacée à 48 h ────────────────────────────────────────
-- Recopie du corps lu en production le 2026-11-26 (md5 a73992a8…) ; seule la catégorie ② change.
CREATE OR REPLACE FUNCTION rencontres_prive.purger_socle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n_conv int; n_stories int; n_vues_stories int; n_lives int; n_notifs int; n_reads int; n_vues_orph int;
begin
  -- ① conversations vides et anciennes
  with cibles as (
    select c.id from public.conversations c
     where c.created_at < now() - interval '7 days'
       and not exists (select 1 from public.conv_members m where m.conv_id = c.id)
       and not exists (select 1 from public.conv_messages x where x.conv_id = c.id)
       -- la discussion d'une activité reste, même vide : `events.conv_id` la vise
       and not exists (select 1 from public.events e where e.conv_id = c.id)
     limit 5000)
  delete from public.conversations c using cibles where c.id = cibles.id;
  get diagnostics n_conv = row_count;

  -- ② stories de plus de 48 h, et leurs vues — SAUF une story à la une (stories_une, 2026-11-26)
  with cibles as (
    select s.id from public.stories s where s.created_at < now() - interval '48 hours'
       and not exists (select 1 from public.stories_une u where u.story_id = s.id) limit 5000),
  vues as (
    delete from public.story_views v using cibles where v.story_id = cibles.id returning 1)
  select count(*) into n_vues_stories from vues;
  -- La garde est RÉPÉTÉE dans le DELETE : une épingle posée entre le choix des cibles et
  -- l'effacement (verrou de clé étrangère) est revue après l'attente et épargne la story.
  with cibles as (
    select s.id from public.stories s where s.created_at < now() - interval '48 hours'
       and not exists (select 1 from public.stories_une u where u.story_id = s.id) limit 5000)
  delete from public.stories s using cibles where s.id = cibles.id
     and not exists (select 1 from public.stories_une u where u.story_id = s.id);
  get diagnostics n_stories = row_count;

  -- ③ directs abandonnés : clos, pas effacés
  update public.video_lives v set status = 'ended', ended_at = coalesce(v.ended_at, coalesce(v.last_seen, v.started_at))
   where v.status = 'live' and coalesce(v.last_seen, v.started_at) < now() - interval '1 hour';
  get diagnostics n_lives = row_count;

  -- ④ notifications LUES de plus de 90 jours
  with cibles as (
    select n.id from public.notifications n
     where n.seen and n.created_at < now() - interval '90 days' limit 5000)
  delete from public.notifications n using cibles where n.id = cibles.id;
  get diagnostics n_notifs = row_count;

  -- ⑤ restes sans cible
  delete from public.conv_reads r
   where not exists (select 1 from public.conv_members m where m.conv_id = r.conv_id and m.user_id = r.user_id);
  get diagnostics n_reads = row_count;
  delete from public.story_views v
   where not exists (select 1 from public.stories s where s.id = v.story_id);
  get diagnostics n_vues_orph = row_count;

  return jsonb_build_object('conversations', n_conv, 'stories', n_stories, 'vues_stories', n_vues_stories + n_vues_orph,
                            'lives_clos', n_lives, 'notifications', n_notifs, 'conv_reads', n_reads);
end
$function$;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'stories.audience : tous|proches, défaut tous' as controle,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stories'
                          and column_name = 'audience' and is_nullable = 'NO' and column_default like '%tous%')
             and exists (select 1 from pg_constraint where conrelid = 'public.stories'::regclass and conname = 'stories_audience_check')
            then 'OK' else 'ECHEC' end as valeur
union all select 'stories : la permissive intacte (111ac554…) + 2 restrictives par rôle',
       case when exists (select 1 from pg_policy where polrelid = 'public.stories'::regclass and polpermissive and polcmd = 'r'
                          and md5(pg_get_expr(polqual, polrelid)) = '111ac554780891654f2632a1b469f676')
             and (select count(*) from pg_policy where polrelid = 'public.stories'::regclass and polcmd in ('r', '*')) = 3
             and (select count(*) from pg_policy where polrelid = 'public.stories'::regclass and not polpermissive
                   and polname in ('stories_audience_anon', 'stories_audience_authenticated')) = 2
            then 'OK' else 'ECHEC' end
union all select 'amis_proches : RLS active, 3 policies propriétaire, INSERT (ami_id) seul, aucun UPDATE, anon rien',
       case when (select relrowsecurity from pg_class where oid = 'public.amis_proches'::regclass)
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'amis_proches') = 3
             and has_column_privilege('authenticated', 'public.amis_proches', 'ami_id', 'insert')
             and not has_column_privilege('authenticated', 'public.amis_proches', 'owner_id', 'insert')
             and not has_column_privilege('authenticated', 'public.amis_proches', 'created_at', 'insert')
             and not has_table_privilege('authenticated', 'public.amis_proches', 'update')
             and not has_table_privilege('anon', 'public.amis_proches', 'select')
            then 'OK' else 'ECHEC' end
union all select 'stories_une : RLS active, 4 policies, INSERT (story_id, groupe) seul, aucun UPDATE',
       case when (select relrowsecurity from pg_class where oid = 'public.stories_une'::regclass)
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stories_une') = 4
             and has_column_privilege('authenticated', 'public.stories_une', 'groupe', 'insert')
             and not has_column_privilege('authenticated', 'public.stories_une', 'owner_id', 'insert')
             and not has_table_privilege('authenticated', 'public.stories_une', 'update')
             and not has_table_privilege('anon', 'public.stories_une', 'insert')
            then 'OK' else 'ECHEC' end
union all select 'fonctions : anon n''exécute ni story_proches_autorise ni story_visible',
       case when not has_function_privilege('anon', 'public.story_proches_autorise(text)', 'execute')
             and not has_function_privilege('anon', 'public.story_visible(text)', 'execute')
             and has_function_privilege('authenticated', 'public.story_proches_autorise(text)', 'execute')
             and pg_get_functiondef('public.story_visible(text)'::regprocedure) like '%amis_proches%'
            then 'OK' else 'ECHEC' end
union all select 'médias : la branche « à la une » posée dans les deux policies',
       case when (select count(*) from pg_policy where polrelid = 'public.media_assets'::regclass and not polpermissive
                   and polname in ('media_assets_anon', 'media_assets_user') and pg_get_expr(polqual, polrelid) like '%stories_une%') = 2
            then 'OK' else 'ECHEC' end
union all select 'purge : une story à la une échappe à la purge des 48 h',
       case when pg_get_functiondef('rencontres_prive.purger_socle()'::regprocedure) like '%stories_une%'
            then 'OK' else 'ECHEC' end
union all select 'tables neuves hors publication temps réel',
       case when not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                              and tablename in ('amis_proches', 'stories_une', 'stories'))
            then 'OK' else 'ECHEC' end;

commit;
