-- ============================================================================
-- IRL — Retour d'expérience après un événement (2026-07-21)
-- ----------------------------------------------------------------------------
-- Boucle standard d'Eventbrite/Meetup : une fois l'événement terminé, on demande
-- aux participants une note (1-5) et un mot libre. C'est ce qui donne à
-- l'organisateur une raison de recommencer, et aux futurs inscrits un signal de
-- qualité — l'absence totale de retour était le trou noir du cycle IRL.
--
-- Aucune table nouvelle : `event_attendees` a déjà EXACTEMENT une ligne par
-- (événement, participant), et sa policy UPDATE « owner » (migration_irl_v2)
-- autorise déjà chacun à modifier SA ligne. Deux colonnes suffisent.
--
-- Additif et idempotent : réexécutable sans risque.
-- ============================================================================

alter table public.event_attendees
  add column if not exists rating      smallint,
  add column if not exists feedback    text,
  add column if not exists rated_at    timestamptz;

-- Garde-fou : une note hors barème n'a aucun sens et fausserait les moyennes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_attendees_rating_range'
  ) then
    alter table public.event_attendees
      add constraint event_attendees_rating_range
      check (rating is null or (rating >= 1 and rating <= 5));
  end if;
end $$;

-- Lecture : la policy SELECT existante de event_attendees reste inchangée (les
-- participants d'un événement sont déjà visibles). La moyenne est donc calculable
-- côté client sans fonction dédiée.
