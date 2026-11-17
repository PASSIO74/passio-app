-- DDL des trois registres repris du candidat media, sans fonctions ni donnees.
create table if not exists public.media_reservations (
  id uuid primary key,
  owner_id text not null references public.profiles(id) on delete cascade,
  source_type text not null check(source_type in ('posts','stories')),
  source_id text not null check(source_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  variants jsonb not null check(jsonb_typeof(variants)='array' and jsonb_array_length(variants) between 1 and 3),
  created_at timestamptz not null,
  expires_at timestamptz not null check(expires_at=created_at+interval '15 minutes'),
  linked_at timestamptz
);
create index if not exists media_reservations_owner_created on public.media_reservations(owner_id,created_at);
create table if not exists public.media_assets (
  id uuid primary key references public.media_reservations(id) on delete cascade,
  owner_id text not null references public.profiles(id) on delete cascade,
  post_id text unique references public.posts(id) on delete cascade,
  story_id text unique references public.stories(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  constraint media_assets_source_unique check(num_nonnulls(post_id,story_id)=1)
);
create index if not exists media_assets_owner on public.media_assets(owner_id);
create table if not exists public.media_objects (
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  variant text not null check(variant in ('original','v720','poster')),
  storage_object_id uuid not null unique,
  bucket_id text not null default 'content-protected' check(bucket_id='content-protected'),
  object_key text not null unique,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mp4','audio/webm','audio/ogg','audio/mpeg')),
  byte_size bigint not null check(byte_size between 1 and 27262976),
  primary key(asset_id,variant),
  check(variant='original' or mime_type like 'image/%'),
  check(object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(original|v720|poster)\.(jpg|png|webp|gif|mp4|webm|m4a|ogg|mp3)$')
);
comment on table public.media_reservations is 'PASSIO protected-media v1 2026-11-16';
comment on table public.media_assets is 'PASSIO protected-media v1 2026-11-16';
comment on table public.media_objects is 'PASSIO protected-media v1 2026-11-16';

alter table public.media_reservations enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_objects enable row level security;
revoke all on public.media_reservations,public.media_assets,public.media_objects from public,anon,authenticated;
grant select on public.media_reservations to authenticated;
grant select on public.media_assets,public.media_objects to anon,authenticated;
grant all on public.media_reservations,public.media_assets,public.media_objects to service_role;
