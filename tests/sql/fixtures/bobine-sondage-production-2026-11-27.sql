-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- PRODUCTION DU 2026-11-27, POSTÉRIEURE AU SOCLE DU 06/11 — pour le banc
-- tests/sql/migration-bobine-sondage.test.sh. Ne s'applique JAMAIS à un projet.
--
-- Le socle (`socle-production-2026-11-06.sql`) précède les lots de sécurité du 06/11, le blocage
-- des lectures du 22/11 et les activités privées du 26-27/11 : sa `post_is_visible` ignore le
-- blocage d'un compte public et le masquage. Or la migration du sondage des bobines DÉLÈGUE la
-- visibilité à cette fonction. Ce fichier pose donc, mot pour mot, ce que le catalogue de
-- production rendait le 2026-11-27 (canal ①, `pg_get_functiondef` / `pg_policies` /
-- `has_column_privilege`) — et rien d'autre que ce dont la migration dépend :
--   · débit : `debit_ecritures`, `debit_jour`, `compte_recent`, `debit_jour_compter`,
--     `debit_compter`, `debit_par_compte` ;
--   · `suppression_de_mon_compte` (barrière de suppression ET compte suspendu) ;
--   · `posts` : colonne `edited_at`, un client ne modifie que `content` ;
--   · activités privées : `events.visibilite`, `event_invites`, `activite_de_partage`,
--     `activite_privee_fermee_pour_moi`, `activite_masquee_pour_moi` ;
--   · lecture de `posts` : `publication_masquee_pour_moi`, `publication_privee_pour_visiteur`,
--     `post_is_visible`, les restrictives `posts_lecture_hors_blocage` et
--     `posts_privee_lecture_anon`.
-- Le bloc final COMPARE l'empreinte de chaque fonction (md5 du corps, retours chariot retirés) à
-- celle lue en production, et les quatre règles de lecture de `posts` : si ce fichier dérive de
-- la production mesurée, il LÈVE — le banc n'éprouve pas une copie approximative.
-- REJOUABLE (le banc le rejoue pour rendre la définition après la garde ⑤).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
set client_min_messages = warning;

-- ── Débit (lots 2 du 06/11 et « plafonds » du 15/11) ─────────────────────────────────────────────
create table if not exists public.debit_ecritures (
  minute timestamptz not null, table_nom text not null, source text not null, n integer not null,
  primary key (minute, table_nom, source));
alter table public.debit_ecritures enable row level security;
revoke all on public.debit_ecritures from public, anon, authenticated;
create table if not exists public.debit_jour (
  jour date not null, cle text not null, source text not null, n bigint not null,
  primary key (jour, cle, source));
alter table public.debit_jour enable row level security;
revoke all on public.debit_jour from public, anon, authenticated;

create or replace function public.compte_recent(p_source text) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare cree timestamptz;
begin
  if p_source is null or p_source !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  select u.created_at into cree from auth.users u where u.id = p_source::uuid;
  return cree is null or cree > pg_catalog.now() - interval '7 days';
end $fn$;
revoke all on function public.compte_recent(text) from public, anon, authenticated;

create or replace function public.debit_jour_compter(p_cle text, p_source text, p_n bigint, p_plafond bigint) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v bigint;
begin
  insert into public.debit_jour as d (jour, cle, source, n)
  values ((pg_catalog.now() at time zone 'UTC')::date, p_cle, p_source, p_n)
  on conflict (jour, cle, source) do update set n = d.n + excluded.n
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: plafond journalier atteint sur %', p_cle using errcode = 'P0001';
  end if;
end $fn$;
revoke all on function public.debit_jour_compter(text, text, bigint, bigint) from public, anon, authenticated;

create or replace function public.debit_compter(p_table text, p_source text, p_plafond integer) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v integer;
begin
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (pg_catalog.date_trunc('minute', pg_catalog.now()), p_table, p_source, 1)
  on conflict (minute, table_nom, source) do update set n = d.n + 1
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: max % insertions/minute sur %', p_plafond, p_table using errcode = 'P0001';
  end if;
  -- Le plafond du jour : × 60 pour un compte installé, × 15 la première semaine.
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated') then
    perform public.debit_jour_compter(p_table, p_source, 1,
      p_plafond::bigint * case when public.compte_recent(p_source) then 15 else 60 end);
  end if;
end $fn$;
revoke all on function public.debit_compter(text, text, integer) from public, anon, authenticated;

create or replace function public.debit_par_compte() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare moi text := (auth.uid())::text;
begin
  if moi is null then return new; end if;
  perform public.debit_compter(tg_table_name, moi, tg_argv[0]::int);
  return new;
end $fn$;
revoke all on function public.debit_par_compte() from public, anon, authenticated;

-- ── Barrière de suppression ET compte suspendu (lot 1 du 06/11) ──────────────────────────────────
create or replace function public.suppression_de_mon_compte() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null then false
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text and c.statut in ('en_cours','purgee','supprimee'))
      or exists (select 1 from auth.users u
                  where u.id = auth.uid() and u.banned_until is not null and u.banned_until > now())
  end
$fn$;

-- ── posts : un client ne modifie que le texte (publication modifiable, 13/11) ────────────────────
alter table public.posts add column if not exists edited_at timestamptz;
revoke update on public.posts from authenticated, anon;
grant update (content) on public.posts to authenticated;

-- ── Activités privées (26/11) : ce que `publication_masquee_pour_moi` lit ────────────────────────
alter table public.events add column if not exists visibilite text not null default 'publique';
create table if not exists public.event_invites (
  event_id   text not null references public.events(id) on delete cascade,
  user_id    text not null references public.profiles(id) on delete cascade,
  invited_by text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_invites enable row level security;
revoke all on public.event_invites from public, anon, authenticated;

create or replace function public.activite_de_partage(p_shared_data text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_shared_data is null or p_shared_data !~ '"kind"\s*:\s*"event"' then null
    else substring(p_shared_data from '"id"\s*:\s*"([^"\\]{1,200})"')
  end
$$;
revoke execute on function public.activite_de_partage(text) from public, anon;
grant execute on function public.activite_de_partage(text) to authenticated, service_role;

create or replace function public.activite_privee_fermee_pour_moi(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
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
revoke all on function public.activite_privee_fermee_pour_moi(text) from public, anon;
grant execute on function public.activite_privee_fermee_pour_moi(text) to authenticated, service_role;

create or replace function public.activite_masquee_pour_moi(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
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
revoke execute on function public.activite_masquee_pour_moi(text) from public, anon;
grant execute on function public.activite_masquee_pour_moi(text) to authenticated, service_role;

-- ── Lecture de `posts` (blocage bis du 22/11, visiteur du 27/11) ─────────────────────────────────
create or replace function public.publication_masquee_pour_moi(p_post_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and p_post_id is not null and exists (
    select 1 from public.posts p
     where p.id = p_post_id
       and p.author_id is distinct from (select auth.uid())::text
       and (
         public.is_blocked_with(p.author_id)
         or (p.event_id is not null and public.activite_masquee_pour_moi(p.event_id))
         or (p.shared_data is not null and public.activite_masquee_pour_moi(public.activite_de_partage(p.shared_data)))
         or (p.shared_from_post_id is not null and exists (
               select 1 from public.posts c
                where c.id = p.shared_from_post_id
                  and c.author_id is distinct from (select auth.uid())::text
                  and (
                    public.is_blocked_with(c.author_id)
                    or (c.event_id is not null and public.activite_masquee_pour_moi(c.event_id))
                    or (c.shared_data is not null and public.activite_masquee_pour_moi(public.activite_de_partage(c.shared_data)))
                  )))
       )
  )
$$;
revoke execute on function public.publication_masquee_pour_moi(text) from public, anon;
grant execute on function public.publication_masquee_pour_moi(text) to authenticated, service_role;

create or replace function public.publication_privee_pour_visiteur(p_post_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_post_id is not null and exists (
    select 1 from public.posts p
     where p.id = p_post_id
       and (
         exists (select 1 from public.events e
                  where e.visibilite = 'privee'
                    and e.id in (p.event_id, public.activite_de_partage(p.shared_data)))
         or (p.shared_from_post_id is not null and exists (
               select 1 from public.posts c join public.events e
                 on e.visibilite = 'privee' and e.id in (c.event_id, public.activite_de_partage(c.shared_data))
                where c.id = p.shared_from_post_id))
       )
  )
$$;
revoke all on function public.publication_privee_pour_visiteur(text) from public;
grant execute on function public.publication_privee_pour_visiteur(text) to anon, authenticated, service_role;

create or replace function public.post_is_visible(pid text)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select case
    when pid is null then false
    -- Pas de ligne posts : PUBLIC seulement pour un identifiant d'EXEMPLE (le contenu de
    -- démonstration du client n'est dans aucune table). Une publication SUPPRIMÉE, ou un
    -- identifiant inconnu, n'est visible par personne (R31, 2026-11-04 : rendait VRAI).
    when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        -- Même règle que la policy restrictive de `posts` : masquée, une publication ne se lit plus
        -- par ses commentaires ni par ses « j'aime », sauf pour son auteur.
        or (not public.post_masque(p.id) and (
              not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
              or public.abonne_accepte_non_bloque(p.author_id))
            -- Ni en blocage avec moi, ni portant ou citant ce qui l'est (BLOC-ACT bis, 2026-11-22).
            and not public.publication_masquee_pour_moi(p.id)
            -- Sans compte : ni portant ni citant une activité PRIVÉE (2026-11-27).
            and not ((select auth.uid()) is null and public.publication_privee_pour_visiteur(p.id)))
      )
    )
  end
$function$;

drop policy if exists posts_lecture_hors_blocage on public.posts;
create policy posts_lecture_hors_blocage on public.posts
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or not public.publication_masquee_pour_moi(id)
  );
drop policy if exists posts_privee_lecture_anon on public.posts;
create policy posts_privee_lecture_anon on public.posts
  as restrictive for select to anon
  using (not public.publication_privee_pour_visiteur(id));

-- ── CE FICHIER EST-IL LA PRODUCTION MESURÉE ? ────────────────────────────────────────────────────
do $controle$
declare
  r record;
  ecarts text := '';
  n int;
begin
  for r in
    select a.sig, a.attendu, md5(replace(p.prosrc, chr(13), '')) as obtenu
      from (values
        ('public.post_is_visible(text)',                        'e11c546d027e91a98519e646244b3085'),
        ('public.publication_masquee_pour_moi(text)',           'f38e08ced4130449c721daccf89f6d8c'),
        ('public.publication_privee_pour_visiteur(text)',       'e143fcb3e4a74a6975b0378289dd1d59'),
        ('public.activite_masquee_pour_moi(text)',              '02a2d18279a547ca6fee389b57ffdf35'),
        ('public.activite_privee_fermee_pour_moi(text)',        'da1c6bec324db6ea577f463505e630e1'),
        ('public.activite_de_partage(text)',                    'd170b6d880e77cc5882d43c491240a3d'),
        ('public.abonne_accepte_non_bloque(text)',              'cba7d22730f9a4192c321e11b306a586'),
        ('public.is_blocked_with(text)',                        '25b7ca8e81031951cb241316f7cfdd64'),
        ('public.post_masque(text)',                            'be243eac44c940255ffe18e77c37162f'),
        ('public.est_identifiant_exemple(text)',                '816ad5cd6f34ad3bf22ddd21e4ac1889'),
        ('public.suppression_de_mon_compte()',                  '18b5fa41cbcdd4ee61c95766e4bc2957'),
        ('public.refuser_ecriture_compte_en_suppression()',     '8ea40f715280c2867524dab576ab32b8'),
        ('public.debit_par_compte()',                           'd4097ac615be8d08972ac2d2dc9fd8fd'),
        ('public.debit_compter(text,text,integer)',             '4da8f75b036c7c3c00737d9cb156d241'),
        ('public.debit_jour_compter(text,text,bigint,bigint)',  '572c2b2968f071efb96adb520c0f2f38'),
        ('public.compte_recent(text)',                          '070f8b5ef8bac893dd42b6471d5c858f')
      ) as a(sig, attendu)
      left join pg_proc p on p.oid = to_regprocedure(a.sig)
  loop
    if r.obtenu is distinct from r.attendu then
      ecarts := ecarts || ' ' || r.sig || '=' || coalesce(r.obtenu, 'ABSENTE');
    end if;
  end loop;
  if ecarts <> '' then
    raise exception 'le socle du banc n''est pas la production du 2026-11-27 — fonctions :%', ecarts;
  end if;

  -- Les quatre règles de lecture de `posts`, par nom, nature et rôle (production, 2026-11-27).
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'posts' and cmd = 'SELECT'
     and (   (policyname = 'Lecture respectant les comptes prives' and permissive = 'PERMISSIVE'  and roles = '{public}'
              and qual like '%abonne_accepte_non_bloque(author_id)%' and qual like '%is_private = true%')
          or (policyname = 'Masquage apres signalements'           and permissive = 'RESTRICTIVE' and roles = '{public}'
              and qual like '%post_masque(id)%')
          or (policyname = 'posts_lecture_hors_blocage'            and permissive = 'RESTRICTIVE' and roles = '{authenticated}'
              and qual like '%publication_masquee_pour_moi(id)%')
          or (policyname = 'posts_privee_lecture_anon'             and permissive = 'RESTRICTIVE' and roles = '{anon}'
              and qual like '%publication_privee_pour_visiteur(id)%'));
  if n <> 4 or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'posts' and cmd = 'SELECT') <> 4 then
    raise exception 'le socle du banc n''a pas les quatre règles de lecture de posts de la production du 2026-11-27 (% reconnues)', n;
  end if;

  -- Un client ne modifie que `posts.content` (mesuré : seule colonne en UPDATE pour authenticated).
  if has_column_privilege('authenticated', 'public.posts', 'overlays', 'update')
     or has_column_privilege('authenticated', 'public.posts', 'is_reel', 'update')
     or not has_column_privilege('authenticated', 'public.posts', 'content', 'update') then
    raise exception 'le socle du banc n''a pas les droits de modification de posts de la production du 2026-11-27';
  end if;
end
$controle$;
