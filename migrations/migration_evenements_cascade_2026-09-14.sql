-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS IRL — la suppression d'une activité emporte ses participations,
-- commentaires et réactions (IRL-06, contre-revue Astra, 2026-09-14)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012),
-- UNE transaction, REJOUABLE, tableau de verdict en fin (7 lignes).
--
-- LE DÉFAUT, mesuré en base le 2026-09-14 : aucune clé étrangère entre
-- `event_attendees` / `event_comments` / `event_reactions` et `events`. Les
-- policies DELETE de ces trois tables ne permettent qu'à chacun d'effacer SES
-- lignes ; l'organisateur qui supprime son activité ne peut donc pas retirer
-- les inscriptions des autres — et le client (`supaDeleteEvent`) « nettoyait »
-- en silence ses seules lignes. Résultat : 15 participations orphelines sur
-- 25, 35 commentaires et 47 réactions rattachés à des activités qui
-- n'existent plus.
--
-- CE QUI CHANGE, et rien d'autre :
--   · les lignes orphelines actuelles sont retirées (elles pointent vers des
--     activités supprimées : rien à afficher, rien à notifier) ;
--   · trois clés étrangères `event_id → events(id) ON DELETE CASCADE` : la
--     suppression du parent (policy « Suppression propre » : `author_id =
--     auth.uid()`) emporte les lignes filles, sous n'importe quel compte —
--     le CASCADE ne passe pas par les policies des tables filles.
-- Aucune policy modifiée. Aucune colonne ajoutée. Le client n'a plus besoin
-- de nettoyer les tables filles avant le parent (il continue de le faire
-- pour ses propres lignes : inoffensif).
--
-- À COLLER À TOUT MOMENT : le client d'avant comme celui d'après fonctionnent
-- avec ou sans ces clés.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- 1. Orphelins : mesurés avant retrait (rendus dans le verdict).
create temp table _irl06_avant on commit drop as
select 'event_attendees' as tbl, count(*)::int as orphelins from event_attendees a where not exists (select 1 from events e where e.id = a.event_id)
union all
select 'event_comments', count(*)::int from event_comments c where not exists (select 1 from events e where e.id = c.event_id)
union all
select 'event_reactions', count(*)::int from event_reactions r where not exists (select 1 from events e where e.id = r.event_id);

delete from event_attendees a where not exists (select 1 from events e where e.id = a.event_id);
delete from event_comments  c where not exists (select 1 from events e where e.id = c.event_id);
delete from event_reactions r where not exists (select 1 from events e where e.id = r.event_id);

-- 2. Clés étrangères en cascade (rejouable : on ne les recrée pas si présentes).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_attendees_event_id_fkey') then
    alter table event_attendees add constraint event_attendees_event_id_fkey
      foreign key (event_id) references events(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_comments_event_id_fkey') then
    alter table event_comments add constraint event_comments_event_id_fkey
      foreign key (event_id) references events(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_reactions_event_id_fkey') then
    alter table event_reactions add constraint event_reactions_event_id_fkey
      foreign key (event_id) references events(id) on delete cascade;
  end if;
end $$;

-- 3. Verdict (7 lignes attendues : 3 « orphelins retirés », 3 « FK … cascade », 1 « orphelins restants 0 »).
select 'orphelins retirés ' || tbl as controle, orphelins::text as valeur from _irl06_avant
union all
select 'FK ' || conrelid::regclass::text, case confdeltype when 'c' then 'cascade' else 'SANS CASCADE — anomalie' end
  from pg_constraint where conname in ('event_attendees_event_id_fkey','event_comments_event_id_fkey','event_reactions_event_id_fkey')
union all
select 'orphelins restants', (
  (select count(*) from event_attendees a where not exists (select 1 from events e where e.id = a.event_id)) +
  (select count(*) from event_comments  c where not exists (select 1 from events e where e.id = c.event_id)) +
  (select count(*) from event_reactions r where not exists (select 1 from events e where e.id = r.event_id)))::text;

commit;
