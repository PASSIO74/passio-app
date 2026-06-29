-- Likes & réactions emoji sur les événements IRL (charte d'engagement unifiée).
-- UNE seule table : un "like" = une réaction avec emoji '❤️' (toggle) ; toute
-- autre valeur = une réaction emoji. PK (event_id,user_id,emoji) → un compte ne
-- peut poser qu'une fois chaque emoji (le like est donc idempotent/togglable).
-- RLS : lecture ouverte (compteurs publics), insert/delete réservés au
-- propriétaire de la ligne (user_id = auth.uid()). Modèle calqué sur
-- comment_likes / post_likes.

create table if not exists public.event_reactions (
  event_id   text        not null,
  user_id    text        not null,
  emoji      text        not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, emoji)
);

alter table public.event_reactions enable row level security;

drop policy if exists "event_reactions_select" on public.event_reactions;
create policy "event_reactions_select" on public.event_reactions
  for select using (true);

drop policy if exists "event_reactions_insert" on public.event_reactions;
create policy "event_reactions_insert" on public.event_reactions
  for insert with check (user_id = auth.uid()::text);

drop policy if exists "event_reactions_delete" on public.event_reactions;
create policy "event_reactions_delete" on public.event_reactions
  for delete using (user_id = auth.uid()::text);

-- Realtime (best-effort : ignore si déjà publiée)
do $$
begin
  begin
    alter publication supabase_realtime add table public.event_reactions;
  exception when duplicate_object then null;
  end;
end $$;
