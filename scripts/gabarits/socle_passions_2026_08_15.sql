-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE DE PRODUCTION AU 2026-08-15 — reconstitution MINIMALE pour les tests
-- ───────────────────────────────────────────────────────────────────────────
-- Ce fichier N'EST PAS une migration : il ne s'applique jamais en production.
-- Il reconstitue, sur un PostgreSQL jetable, l'état que la vraie base porte
-- déjà — table `passions` à 19 lignes, cinq tables de contenu, et les clés
-- étrangères posées par `migration_passions_referentiel.sql`.
--
-- ⚠️ SANS LUI, LE TEST DE MIGRATION NE PROUVE RIEN. Appliquer une migration
-- sur une base vide dit seulement qu'elle est syntaxiquement correcte. Ce qui
-- casse une production, c'est la rencontre avec l'existant : une colonne déjà
-- là, une contrainte déjà posée, des lignes déjà référencées.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.passions (
  id         text primary key,
  emoji      text not null,
  label      text not null,
  color      text,
  sort_order int  not null default 0
);

insert into public.passions (id, emoji, label, color, sort_order) values
  ('musique','🎸','Musique','#8b5cf6',1), ('photo','📷','Photo','#8b5cf6',2),
  ('voyage','🌍','Voyage','#8b5cf6',3),   ('cuisine','🍳','Cuisine','#7c3aed',4),
  ('sport','🏋','Sport','#8b5cf6',5),     ('litterature','📚','Littérature','#8b5cf6',6),
  ('cinema','🎬','Cinéma','#7c3aed',7),   ('tech','💻','Tech / IA','#7c3aed',8),
  ('art','🎨','Art','#8b5cf6',9),         ('jardinage','🌱','Jardinage','#8b5cf6',10),
  ('metier','🛠','Artisanat','#6d28d9',11),('jeuxvideo','🎮','Jeux vidéo','#8b5cf6',12),
  ('yoga','🧘','Yoga / Bien-être','#8b5cf6',13), ('mode','👗','Mode','#7c3aed',14),
  ('danse','💃','Danse','#8b5cf6',15),    ('podcast','🎙','Podcast','#7c3aed',16),
  ('moto','🏍','Moto','#64748b',17),      ('animaux','🐾','Animaux','#a78bfa',18),
  ('actu','🌍','Actualité','#7c3aed',19)
on conflict (id) do nothing;

create table if not exists public.posts         (id text primary key, passion_id text, content text);
create table if not exists public.stories       (id text primary key, passion_id text);
create table if not exists public.events        (id text primary key, passion_id text);
create table if not exists public.conversations (id text primary key, passion_id text);
create table if not exists public.profiles      (id text primary key, passion_id text, passions jsonb);

do $$
declare t text;
begin
  foreach t in array array['posts','stories','events','conversations','profiles'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_passion_fk') then
      execute format('alter table public.%I add constraint %I foreign key (passion_id) references public.passions(id)', t, t || '_passion_fk');
    end if;
  end loop;
end $$;

-- Du contenu réel, classé dans des passions historiques : la migration ne doit
-- ni le déplacer, ni le perdre, ni casser sa clé étrangère.
insert into public.posts (id, passion_id, content) values
  ('p_a','moto','Sortie du dimanche'), ('p_b','musique','Nouveau morceau'),
  ('p_c','cuisine','Recette du soir'), ('p_d',null,'Sans passion')
on conflict (id) do nothing;
