-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉ-TRI DES SIGNALEMENTS — MASQUER SANS SUPPRIMER (2026-11-01)
--
-- docs/PASSIO_100K_AUTONOMIE.md §5.10 : à 100 000 inscrits, la modération est
-- le seul goulot qui reste HUMAIN. Une publication signalée par plusieurs
-- comptes reste visible de tous jusqu'à ce que l'éditeur ouvre son téléphone.
--
-- Règle : une PUBLICATION signalée par au moins 3 comptes DISTINCTS, chacun
-- confirmé, créé depuis plus de 7 jours, et qui n'en est pas l'auteur, est
-- MASQUÉE pour tous sauf son auteur, en attendant la décision de l'éditeur
-- (pilotage : « Rétablir » ou « Laisser masquée »). Jamais une suppression.
--
-- Pourquoi ces garde-fous : un signalement s'écrit en une ligne par n'importe
-- quel compte (policy `reports_insert`). Sans ancienneté, trois comptes créés
-- dans la minute feraient disparaître n'importe quelle publication — même
-- leçon que la contre-revue du 13/10 sur le délestage. Une publication
-- RÉTABLIE par l'éditeur n'est jamais remasquée par la machine.
--
-- Mécanique :
--   · `contenus_masques` (service_role seul) : l'état du masquage ;
--   · `trg_reports_pretri` (AFTER INSERT sur reports) : compte et masque ;
--   · `post_masque(id)` + policy RESTRICTIVE sur `posts` : la lecture des
--     autres comptes s'arrête là. La policy permissive existante (comptes
--     privés) n'est PAS réécrite : la restrictive s'y ajoute par un ET.
-- Portée : les publications (`target_type = 'post'`) seulement. Commentaires,
-- profils, stories et activités restent au traitement manuel.
--
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_moderation_pretri_2026-11-01.sql`
-- REJOUABLE. RETOUR ARRIÈRE :
--   drop policy if exists "Masquage apres signalements" on public.posts;
--   drop trigger if exists trg_reports_pretri on public.reports;
--   drop function if exists public.trg_reports_pretri(), public.post_masque(text);
--   drop table if exists public.contenus_masques;
-- BANC : tests/sql/migration-croissance-pretri.test.sh
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.contenus_masques (
  target_type text not null,
  target_id text not null,
  signaleurs integer not null,
  masque_le timestamptz not null default now(),
  decision text check (decision in ('retabli', 'garde')),
  decide_le timestamptz,
  primary key (target_type, target_id)
);
alter table public.contenus_masques enable row level security;
revoke all on public.contenus_masques from public, anon, authenticated;
grant select, insert, update, delete on public.contenus_masques to service_role;

-- Masquée = masquée et pas rétablie. « garde » reste masquée.
create or replace function public.post_masque(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contenus_masques m
     where m.target_type = 'post' and m.target_id = p_id
       and m.decision is distinct from 'retabli'
  );
$$;
-- La policy s'évalue sous le rôle du lecteur : il doit pouvoir l'exécuter.
-- Elle ne révèle qu'un booléen sur un identifiant qu'il connaît déjà.
grant execute on function public.post_masque(text) to anon, authenticated, service_role;

create or replace function public.trg_reports_pretri()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auteur text;
  n integer;
begin
  if new.target_type is distinct from 'post' then return new; end if;
  select p.author_id into auteur from public.posts p where p.id = new.target_id;
  if auteur is null then return new; end if;
  select count(distinct r.reporter_id) into n
    from public.reports r
    join auth.users u on u.id::text = r.reporter_id
   where r.target_type = 'post' and r.target_id = new.target_id
     and coalesce(r.status, 'open') = 'open'
     and r.reporter_id is distinct from auteur
     and u.deleted_at is null
     and u.email_confirmed_at is not null
     and u.created_at < now() - interval '7 days';
  if n >= 3 then
    insert into public.contenus_masques (target_type, target_id, signaleurs)
    values ('post', new.target_id, n)
    on conflict (target_type, target_id) do update
      set signaleurs = excluded.signaleurs
      where public.contenus_masques.decision is null;
  end if;
  return new;
end $$;
revoke execute on function public.trg_reports_pretri() from public, anon, authenticated;

drop trigger if exists trg_reports_pretri on public.reports;
create trigger trg_reports_pretri after insert on public.reports
  for each row execute function public.trg_reports_pretri();

drop policy if exists "Masquage apres signalements" on public.posts;
create policy "Masquage apres signalements" on public.posts
  as restrictive for select to public
  using (author_id = (select auth.uid())::text or not public.post_masque(id));

-- ── VERDICT ─────────────────────────────────────────────────────────────────
do $v$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts'
                  and policyname = 'Masquage apres signalements' and permissive = 'RESTRICTIVE' and cmd = 'SELECT') then
    raise exception 'ECHEC : la policy restrictive de masquage est absente de posts';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts'
                  and policyname = 'Lecture respectant les comptes prives' and permissive = 'PERMISSIVE') then
    raise exception 'ECHEC : la lecture des comptes privés a disparu (une restrictive seule ne laisse rien lire)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_reports_pretri' and tgrelid = 'public.reports'::regclass) then
    raise exception 'ECHEC : le déclencheur de pré-tri est absent';
  end if;
  if has_table_privilege('anon', 'public.contenus_masques', 'select')
     or has_table_privilege('authenticated', 'public.contenus_masques', 'select')
     or has_table_privilege('authenticated', 'public.contenus_masques', 'insert') then
    raise exception 'ECHEC : un client lit ou écrit contenus_masques';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.contenus_masques'::regclass) then
    raise exception 'ECHEC : RLS absente sur contenus_masques';
  end if;
  raise notice 'OK : pré-tri actif (3 signaleurs confirmés de plus de 7 jours masquent une publication, jamais ne la suppriment)';
end $v$;

commit;
