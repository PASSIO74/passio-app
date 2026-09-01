-- Socle minimal qui MIME la production, assez pour que la migration s'applique
-- telle quelle : les cinq tables porteuses de `passion_id`, la table `passions`
-- telle que `migration_passions_referentiel.sql` l'a posée le 2026-08-15, et un
-- `auth.uid()` factice (Supabase le fournit ; un Postgres nu, non).
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.passions (
  id text primary key, emoji text not null, label text not null,
  color text, sort_order int not null default 0
);
insert into public.passions (id, emoji, label, color, sort_order) values
  ('musique','🎸','Musique','#8b5cf6',1), ('photo','📷','Photo','#8b5cf6',2),
  ('voyage','🌍','Voyage','#8b5cf6',3), ('cuisine','🍳','Cuisine','#7c3aed',4),
  ('sport','🏋','Sport','#8b5cf6',5), ('litterature','📚','Littérature','#8b5cf6',6),
  ('cinema','🎬','Cinéma','#7c3aed',7), ('tech','💻','Tech / IA','#7c3aed',8),
  ('art','🎨','Art','#8b5cf6',9), ('jardinage','🌱','Jardinage','#8b5cf6',10),
  ('metier','🛠','Artisanat','#6d28d9',11), ('jeuxvideo','🎮','Jeux vidéo','#8b5cf6',12),
  ('yoga','🧘','Yoga / Bien-être','#8b5cf6',13), ('mode','👗','Mode','#7c3aed',14),
  ('danse','💃','Danse','#8b5cf6',15), ('podcast','🎙','Podcast','#7c3aed',16),
  ('moto','🏍','Moto','#64748b',17), ('animaux','🐾','Animaux','#a78bfa',18),
  ('actu','🌍','Actualité','#7c3aed',19);
alter table public.passions enable row level security;
create policy passions_select_all on public.passions for select using (true);

create table public.profiles (id text primary key, username text, passion_id text,
  passions jsonb default '[]'::jsonb);
create table public.posts (id text primary key, author_id text, content text,
  passion_id text, created_at timestamp default now());
create table public.stories (id text primary key, author_id text, passion_id text);
create table public.events (id text primary key, title text, passion_id text);
create table public.conversations (id text primary key, passion_id text);

alter table public.posts         add constraint posts_passion_fk         foreign key (passion_id) references public.passions(id);
alter table public.stories       add constraint stories_passion_fk       foreign key (passion_id) references public.passions(id);
alter table public.events        add constraint events_passion_fk        foreign key (passion_id) references public.passions(id);
alter table public.conversations add constraint conversations_passion_fk foreign key (passion_id) references public.passions(id);
alter table public.profiles      add constraint profiles_passion_fk      foreign key (passion_id) references public.passions(id);

-- Du contenu D'AVANT le lot : c'est lui qui doit survivre intact.
insert into public.posts (id, author_id, content, passion_id) values
  ('p_ancien_1','u1','post d''avant','moto'),
  ('p_ancien_2','u2','sans passion',null);
insert into public.events (id, title, passion_id) values ('e_ancien','Sortie moto','moto');
insert into public.stories (id, author_id, passion_id) values ('s_ancien','u1','cuisine');
