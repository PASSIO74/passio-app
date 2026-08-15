-- ═══════════════════════════════════════════════════════════════════════════
-- RÉFÉRENTIEL DES PASSIONS — supprime les passions fantômes.
-- Application de l'ADR-007, option C (décision du 2026-08-15).
--
-- ⚠️ PRÉPARÉE, NON APPLIQUÉE.
--
-- LE PROBLÈME
-- `passion_id` est un slug de TEXTE LIBRE sur posts, stories, events,
-- conversations et profiles. Aucune clé étrangère, aucune contrainte. Une faute
-- de frappe crée silencieusement une passion qui n'existe pas — invisible des
-- filtres, invisible des statistiques, et impossible à retrouver autrement qu'en
-- balayant la table.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
-- Elle n'étend PAS `passion_id` aux tables d'interaction (commentaires,
-- réactions, likes, follows, notifications). C'est l'option B de l'ADR-007,
-- volontairement remise à plus tard : dix colonnes écrites « au cas où », pour
-- une fonctionnalité qui n'existe pas encore, seraient de la sur-ingénierie.
-- À rouvrir le jour où le produit doit segmenter PAR PROFIL et non par compte.
--
-- Elle ne vérifie PAS non plus que la passion appartient au compte qui écrit.
-- Une passion n'appartient à personne : c'est une taxonomie partagée, pas un
-- objet possédé. Contraindre cela changerait le comportement produit (publier
-- dans une passion qu'on vient d'ajouter), sans fermer aucune faille.
--
-- SÛRETÉ VÉRIFIÉE AVANT ÉCRITURE (2026-08-15)
-- Valeurs réellement présentes en prod, toutes tables confondues :
--   art, cuisine, mode, moto, musique, photo, podcast, tech, voyage, yoga
-- Soit 10 valeurs, toutes incluses dans les 19 de la liste canonique de l'app
-- (`PASSIONS` dans js/app-01-diag-seed.js). AUCUN orphelin : les clés étrangères
-- peuvent être posées sans nettoyage préalable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Le référentiel ───────────────────────────────────────────────────────
create table if not exists public.passions (
  id         text primary key,
  emoji      text not null,
  label      text not null,
  color      text,
  sort_order int  not null default 0
);

-- Miroir exact de PASSIONS (js/app-01-diag-seed.js). Toute passion ajoutée dans
-- l'app doit l'être ici AVANT déploiement, sinon la publication échouera.
insert into public.passions (id, emoji, label, color, sort_order) values
  ('musique',     '🎸', 'Musique',            '#8b5cf6',  1),
  ('photo',       '📷', 'Photo',              '#8b5cf6',  2),
  ('voyage',      '🌍', 'Voyage',             '#8b5cf6',  3),
  ('cuisine',     '🍳', 'Cuisine',            '#7c3aed',  4),
  ('sport',       '🏋', 'Sport',              '#8b5cf6',  5),
  ('litterature', '📚', 'Littérature',        '#8b5cf6',  6),
  ('cinema',      '🎬', 'Cinéma',             '#7c3aed',  7),
  ('tech',        '💻', 'Tech / IA',          '#7c3aed',  8),
  ('art',         '🎨', 'Art',                '#8b5cf6',  9),
  ('jardinage',   '🌱', 'Jardinage',          '#8b5cf6', 10),
  ('metier',      '🛠', 'Artisanat',          '#6d28d9', 11),
  ('jeuxvideo',   '🎮', 'Jeux vidéo',         '#8b5cf6', 12),
  ('yoga',        '🧘', 'Yoga / Bien-être',   '#8b5cf6', 13),
  ('mode',        '👗', 'Mode',               '#7c3aed', 14),
  ('danse',       '💃', 'Danse',              '#8b5cf6', 15),
  ('podcast',     '🎙', 'Podcast',            '#7c3aed', 16),
  ('moto',        '🏍', 'Moto',               '#64748b', 17),
  ('animaux',     '🐾', 'Animaux',            '#a78bfa', 18),
  ('actu',        '🌍', 'Actualité',          '#7c3aed', 19)
on conflict (id) do update
  set emoji = excluded.emoji, label = excluded.label,
      color = excluded.color, sort_order = excluded.sort_order;

-- Taxonomie publique : lisible par tous, écrite par personne (migrations seules).
alter table public.passions enable row level security;
drop policy if exists passions_select_all on public.passions;
create policy passions_select_all on public.passions for select using (true);
-- Aucune policy INSERT/UPDATE/DELETE : le référentiel n'est pas modifiable par
-- un client, même authentifié. C'est précisément ce qui empêche de recréer une
-- passion fantôme en la déclarant d'abord.

-- ── 2. Contrôle avant de contraindre ────────────────────────────────────────
-- À exécuter et LIRE avant la section 3. Doit renvoyer zéro ligne.
-- select 'posts' t, passion_id from public.posts p
--   where passion_id is not null and not exists (select 1 from public.passions x where x.id = p.passion_id)
-- union all select 'stories', passion_id from public.stories p
--   where passion_id is not null and not exists (select 1 from public.passions x where x.id = p.passion_id)
-- union all select 'events', passion_id from public.events p
--   where passion_id is not null and not exists (select 1 from public.passions x where x.id = p.passion_id)
-- union all select 'conversations', passion_id from public.conversations p
--   where passion_id is not null and not exists (select 1 from public.passions x where x.id = p.passion_id)
-- union all select 'profiles', passion_id from public.profiles p
--   where passion_id is not null and not exists (select 1 from public.passions x where x.id = p.passion_id);

-- ── 3. Les clés étrangères ──────────────────────────────────────────────────
-- NOT VALID puis VALIDATE : la pose est immédiate et ne verrouille pas la table
-- en écriture pendant la vérification de l'existant. Inutile aux volumes
-- actuels (36 posts), indispensable plus tard — autant prendre l'habitude.
alter table public.posts         drop constraint if exists posts_passion_fk;
alter table public.posts         add  constraint posts_passion_fk
  foreign key (passion_id) references public.passions(id) not valid;
alter table public.posts         validate constraint posts_passion_fk;

alter table public.stories       drop constraint if exists stories_passion_fk;
alter table public.stories       add  constraint stories_passion_fk
  foreign key (passion_id) references public.passions(id) not valid;
alter table public.stories       validate constraint stories_passion_fk;

alter table public.events        drop constraint if exists events_passion_fk;
alter table public.events        add  constraint events_passion_fk
  foreign key (passion_id) references public.passions(id) not valid;
alter table public.events        validate constraint events_passion_fk;

alter table public.conversations drop constraint if exists conversations_passion_fk;
alter table public.conversations add  constraint conversations_passion_fk
  foreign key (passion_id) references public.passions(id) not valid;
alter table public.conversations validate constraint conversations_passion_fk;

alter table public.profiles      drop constraint if exists profiles_passion_fk;
alter table public.profiles      add  constraint profiles_passion_fk
  foreign key (passion_id) references public.passions(id) not valid;
alter table public.profiles      validate constraint profiles_passion_fk;

-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI CHANGE POUR L'APP
-- Publier avec une passion absente du référentiel échouera désormais (23503)
-- au lieu de créer une passion fantôme. C'est l'objectif — mais ça veut dire
-- qu'AJOUTER UNE PASSION DANS L'APP EXIGE DÉSORMAIS UNE MIGRATION D'ABORD.
-- À inscrire dans docs/PIEGES_CONNUS.md au moment d'appliquer.
--
-- RETOUR ARRIÈRE
--   alter table public.posts         drop constraint if exists posts_passion_fk;
--   alter table public.stories       drop constraint if exists stories_passion_fk;
--   alter table public.events        drop constraint if exists events_passion_fk;
--   alter table public.conversations drop constraint if exists conversations_passion_fk;
--   alter table public.profiles      drop constraint if exists profiles_passion_fk;
--   drop table if exists public.passions;
-- ═══════════════════════════════════════════════════════════════════════════
