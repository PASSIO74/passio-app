-- ═══════════════════════════════════════════════════════════════════════
-- LIVE VIDÉO (façon Instagram/TikTok) — 2026-07-19
-- Table d'annuaire des directs en cours. La VIDÉO elle-même ne passe PAS par
-- Supabase : elle est diffusée en WebRTC P2P (maille diffuseur → spectateurs),
-- signalisation par Realtime Broadcast sur le canal `vlive:<id>`.
-- Cette table ne sert qu'à : découvrir les lives actifs (bulles du fil),
-- vérifier qu'un live est encore vivant (heartbeat `last_seen`), et cibler
-- les notifications aux abonnés.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.video_lives (
  id text primary key,
  author_id text not null,
  author_name text,
  author_emoji text,
  author_photo text,
  title text,
  status text not null default 'live',      -- 'live' | 'ended'
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(), -- heartbeat du diffuseur (25 s)
  ended_at timestamptz
);

alter table public.video_lives enable row level security;

-- Lecture ouverte (tout compte authentifié voit les lives actifs).
drop policy if exists video_lives_select on public.video_lives;
create policy video_lives_select on public.video_lives
  for select using (true);

-- Écriture réservée au diffuseur.
drop policy if exists video_lives_insert on public.video_lives;
create policy video_lives_insert on public.video_lives
  for insert with check (author_id = auth.uid()::text);

drop policy if exists video_lives_update on public.video_lives;
create policy video_lives_update on public.video_lives
  for update using (author_id = auth.uid()::text);

drop policy if exists video_lives_delete on public.video_lives;
create policy video_lives_delete on public.video_lives
  for delete using (author_id = auth.uid()::text);

create index if not exists idx_video_lives_active
  on public.video_lives (status, last_seen desc);

-- Realtime : apparition/fin d'un live poussée instantanément aux clients
-- (binding sur le canal unique `realtime:db`).
do $$
begin
  alter publication supabase_realtime add table public.video_lives;
exception when duplicate_object then null;
end $$;
