-- Vues de stories par utilisateur : synchronise l'état vu/non-vu (anneaux
-- Instagram de la barre des stories) entre les appareils d'un même compte.
-- PAS de FK vers stories : on stocke aussi les ids des stories seed (« s1 »…,
-- identiques sur tous les appareils → leur état vu se synchronise aussi), et
-- une story expirée/purgée ne doit pas casser l'historique de vues.
create table if not exists public.story_views (
  story_id text not null,
  user_id  text not null,
  seen_at  timestamptz not null default now(),
  primary key (story_id, user_id)
);

-- Chemin chaud : « toutes MES vues » au boot.
create index if not exists story_views_user_idx on public.story_views (user_id);

alter table public.story_views enable row level security;

-- Chacun ne lit QUE ses propres vues (l'auteur d'une story ne voit pas la
-- liste de ses spectateurs — ce serait une feature séparée avec sa policy).
create policy "story_views_select_own" on public.story_views
  for select using (user_id = auth.uid()::text);

create policy "story_views_insert_own" on public.story_views
  for insert with check (user_id = auth.uid()::text);

-- Hygiène RGPD : l'utilisateur peut effacer ses propres vues.
create policy "story_views_delete_own" on public.story_views
  for delete using (user_id = auth.uid()::text);
