-- ═══════════════════════════════════════════════════════════════════════════
-- CATALOGUE HIÉRARCHIQUE DES PASSIONS — univers · passions · spécialités
-- Lot TAXO-1. Kill switch applicatif : `passion_taxonomy_v1`.
--
-- ⚠️ FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
--    Source : js/passion-catalog.js
--    Régénérer : node scripts/generer-migration-catalogue.js
--    Vérifier  : npm run valider:catalogue  (échoue si les deux divergent)
--
-- PROPRIÉTÉS DE CETTE MIGRATION
--   · ADDITIVE     — elle ne supprime ni ne renomme aucune colonne, aucune
--                    ligne, aucune contrainte existante. `profiles.passions`,
--                    `posts.passion_id` et les cinq clés étrangères posées le
--                    2026-08-15 restent en place et gardent leur sens.
--   · IDEMPOTENTE  — `create ... if not exists`, `add column if not exists`,
--                    `insert ... on conflict do update`, `drop policy if exists`.
--                    La rejouer n'a aucun effet observable.
--   · RÉVERSIBLE   — le bloc de retour arrière en fin de fichier rend l'état
--                    d'avant sans toucher aux données de contenu.
--
-- ⚠️ LES 19 IDENTIFIANTS CANONIQUES NE BOUGENT PAS. Les `insert` sur
--    `public.passions` sont des upserts : `musique`, `photo`, `voyage`,
--    `cuisine`, `sport`, `litterature`, `cinema`, `tech`, `art`, `jardinage`,
--    `metier`, `jeuxvideo`, `yoga`, `mode`, `danse`, `podcast`, `moto`,
--    `animaux`, `actu` conservent leur `id`, leur libellé, leur emoji et leur
--    couleur ; seuls `universe_id`, `synonyms`, `popular` et `sort_order`
--    (nouveaux) sont renseignés. Aucune publication existante ne change de
--    classement.
--
-- ⚠️ AUCUN CONTENU N'EST MODIFIÉ. `specialty_id` naît `null` partout : une
--    publication, une story ou une activité d'avant ce lot reste parfaitement
--    valide et reste visible sous sa passion principale.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Les univers ─────────────────────────────────────────────────────────
-- Niveau de NAVIGATION seulement. Aucune colonne de contenu ne le référence :
-- il n'apparaît ni dans une identité, ni sur une carte, ni sur une publication.
create table if not exists public.passion_universes (
  id         text primary key,
  emoji      text not null,
  label      text not null,
  sort_order int  not null default 0,
  is_active  boolean not null default true
);

insert into public.passion_universes (id, emoji, label, sort_order, is_active) values
  ('sports', '🏃', 'Sports et mouvement', 1, true),
  ('scene', '🎵', 'Musique et scène', 2, true),
  ('arts', '🎨', 'Arts et création', 3, true),
  ('mobilite', '🌍', 'Voyages et mobilité', 4, true),
  ('techno', '💻', 'Technologie et sciences', 5, true),
  ('maison', '🍳', 'Cuisine et art de vivre', 6, true),
  ('vivant', '🌿', 'Nature et animaux', 7, true),
  ('culture', '📚', 'Culture et savoirs', 8, true),
  ('bienetre', '🧘', 'Bien-être et santé', 9, true),
  ('social', '🤝', 'Vie sociale et projets', 10, true)
on conflict (id) do update set
  emoji = excluded.emoji, label = excluded.label,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- ── 2. `passions` reste le référentiel des passions PRINCIPALES ────────────
-- La table existe déjà (migration_passions_referentiel, appliquée le
-- 2026-08-15) et porte les cinq clés étrangères de contenu. On l'ÉTEND ;
-- on ne la remplace pas.
alter table public.passions add column if not exists universe_id text;
alter table public.passions add column if not exists synonyms    jsonb not null default '[]'::jsonb;
alter table public.passions add column if not exists popular     boolean not null default false;
alter table public.passions add column if not exists is_active   boolean not null default true;

alter table public.passions drop constraint if exists passions_universe_fk;
alter table public.passions add  constraint passions_universe_fk
  foreign key (universe_id) references public.passion_universes(id) not valid;

insert into public.passions (id, emoji, label, color, sort_order, universe_id, synonyms, popular, is_active) values
  ('sport', '🏋️', 'Sport', '#8b5cf6', 1, 'sports', '["sports","activité physique","athlétisme"]'::jsonb, true, true),
  ('combat', '🥊', 'Sports de combat', '#8b5cf6', 2, 'sports', '["arts martiaux","combat","ring"]'::jsonb, true, true),
  ('collectif', '⚽', 'Sports collectifs', '#7c3aed', 3, 'sports', '["sport co","équipe","club"]'::jsonb, true, true),
  ('glisse', '🏄', 'Glisse et board', '#8b5cf6', 4, 'sports', '["board","ride","glisse"]'::jsonb, false, true),
  ('outdoor', '🥾', 'Montagne et outdoor', '#7c3aed', 5, 'sports', '["plein air","nature","montagne","rando"]'::jsonb, false, true),
  ('running', '🏃', 'Course à pied', '#8b5cf6', 6, 'sports', '["running","jogging","course","run","footing"]'::jsonb, true, true),
  ('fitness', '💪', 'Musculation et fitness', '#7c3aed', 7, 'sports', '["muscu","musculation","gym","fitness","salle"]'::jsonb, true, true),
  ('cyclisme', '🚴', 'Vélo et cyclisme', '#8b5cf6', 8, 'sports', '["vélo","velo","bike","cyclisme","bicyclette"]'::jsonb, false, true),
  ('musique', '🎸', 'Musique', '#8b5cf6', 9, 'scene', '["music","zik","son","instrument"]'::jsonb, true, true),
  ('danse', '💃', 'Danse', '#8b5cf6', 10, 'scene', '["dance","danser","chorégraphie"]'::jsonb, true, true),
  ('theatre', '🎭', 'Théâtre et scène', '#7c3aed', 11, 'scene', '["scène","spectacle","planches"]'::jsonb, false, true),
  ('photo', '📷', 'Photo', '#8b5cf6', 12, 'arts', '["photo","photographie","photographe","appareil photo"]'::jsonb, true, true),
  ('art', '🎨', 'Art', '#8b5cf6', 13, 'arts', '["arts visuels","art","créer","artiste"]'::jsonb, true, true),
  ('mode', '👗', 'Mode', '#7c3aed', 14, 'arts', '["fashion","style","vêtements","look"]'::jsonb, true, true),
  ('metier', '🛠', 'Artisanat', '#6d28d9', 15, 'arts', '["artisanat","fait main","craft","métier d''art"]'::jsonb, false, true),
  ('video', '🎥', 'Vidéo et montage', '#7c3aed', 16, 'arts', '["video","vidéo","montage","filmer"]'::jsonb, false, true),
  ('design', '🖌️', 'Design et graphisme', '#8b5cf6', 17, 'arts', '["design","graphisme","graphiste","ui","ux"]'::jsonb, false, true),
  ('voyage', '🌍', 'Voyage', '#8b5cf6', 18, 'mobilite', '["voyage","travel","partir","découverte"]'::jsonb, true, true),
  ('moto', '🏍', 'Moto', '#64748b', 19, 'mobilite', '["moto","motard","deux-roues","2 roues"]'::jsonb, true, true),
  ('auto', '🚗', 'Auto et mécanique', '#7c3aed', 20, 'mobilite', '["auto","voiture","bagnole","mécanique"]'::jsonb, false, true),
  ('tech', '💻', 'Tech / IA', '#7c3aed', 21, 'techno', '["tech","technologie","informatique","geek"]'::jsonb, true, true),
  ('jeuxvideo', '🎮', 'Jeux vidéo', '#8b5cf6', 22, 'techno', '["gaming","jeux video","jeu vidéo","gamer"]'::jsonb, true, true),
  ('ia', '🤖', 'Intelligence artificielle', '#7c3aed', 23, 'techno', '["ia","ai","intelligence artificielle"]'::jsonb, false, true),
  ('dev', '👨‍💻', 'Développement et code', '#8b5cf6', 24, 'techno', '["dev","code","coder","programmation","développeur"]'::jsonb, false, true),
  ('sciences', '🔬', 'Sciences', '#7c3aed', 25, 'techno', '["science","sciences","savoir scientifique"]'::jsonb, false, true),
  ('cuisine', '🍳', 'Cuisine', '#7c3aed', 26, 'maison', '["cuisine","cuisiner","recette","food","manger"]'::jsonb, true, true),
  ('oenologie', '🍷', 'Vin et spiritueux', '#6d28d9', 27, 'maison', '["vin","oenologie","œnologie","dégustation"]'::jsonb, false, true),
  ('bricolage', '🔧', 'Bricolage, déco et maison', '#8b5cf6', 28, 'maison', '["bricolage","bricoler","diy","travaux","déco"]'::jsonb, false, true),
  ('jardinage', '🌱', 'Jardinage', '#8b5cf6', 29, 'vivant', '["jardin","jardiner","plantes","potager"]'::jsonb, true, true),
  ('animaux', '🐾', 'Animaux', '#a78bfa', 30, 'vivant', '["animaux","animal","pets","compagnon"]'::jsonb, true, true),
  ('peche', '🎣', 'Pêche', '#64748b', 31, 'vivant', '["pêche","peche","pêcher","pecheur"]'::jsonb, false, true),
  ('litterature', '📚', 'Littérature', '#8b5cf6', 32, 'culture', '["livre","livres","lecture","lire","bouquin","écriture"]'::jsonb, true, true),
  ('cinema', '🎬', 'Cinéma', '#7c3aed', 33, 'culture', '["cinéma","cinema","film","films","séries"]'::jsonb, true, true),
  ('podcast', '🎙', 'Podcast', '#7c3aed', 34, 'culture', '["podcast","podcasts","radio","audio"]'::jsonb, false, true),
  ('actu', '🌍', 'Actualité', '#7c3aed', 35, 'culture', '["actu","actualité","news","info","société"]'::jsonb, false, true),
  ('histoire', '🏛️', 'Histoire et patrimoine', '#6d28d9', 36, 'culture', '["histoire","patrimoine","passé"]'::jsonb, false, true),
  ('jeux', '🎲', 'Jeux de société', '#8b5cf6', 37, 'culture', '["jeux","jeu de société","plateau","société"]'::jsonb, false, true),
  ('yoga', '🧘', 'Yoga / Bien-être', '#8b5cf6', 38, 'bienetre', '["yoga","bien-être","bien etre","zen","méditation"]'::jsonb, true, true),
  ('sante', '🥗', 'Santé et nutrition', '#7c3aed', 39, 'bienetre', '["santé","sante","nutrition","forme"]'::jsonb, false, true),
  ('entrepreneuriat', '🚀', 'Entrepreneuriat', '#7c3aed', 40, 'social', '["entrepreneur","business","boîte","startup","projet"]'::jsonb, false, true),
  ('finance', '💰', 'Finance et investissement', '#6d28d9', 41, 'social', '["finance","argent","investir","épargne","bourse"]'::jsonb, false, true),
  ('parentalite', '👶', 'Parentalité et famille', '#a78bfa', 42, 'social', '["parent","parents","famille","enfant","enfants","bébé"]'::jsonb, false, true)
on conflict (id) do update set
  emoji = excluded.emoji, label = excluded.label, color = excluded.color,
  sort_order = excluded.sort_order, universe_id = excluded.universe_id,
  synonyms = excluded.synonyms, popular = excluded.popular, is_active = excluded.is_active;

alter table public.passions validate constraint passions_universe_fk;

-- ── 3. Les spécialités ─────────────────────────────────────────────────────
-- ⚠️ UNE SPÉCIALITÉ APPARTIENT À UNE SEULE PASSION. C'est `passion_id` qui le
-- dit, et la contrainte unique `(id, passion_id)` juste dessous est ce qui
-- permet aux tables de contenu de le VÉRIFIER — pas une validation en
-- JavaScript, qu'un client modifié contournerait en une ligne.
create table if not exists public.passion_specialties (
  id         text primary key,
  passion_id text not null references public.passions(id),
  label      text not null,
  synonyms   jsonb not null default '[]'::jsonb,
  sort_order int  not null default 0,
  is_active  boolean not null default true
);

-- La cible des clés étrangères COMPOSITES des tables de contenu.
alter table public.passion_specialties
  drop constraint if exists passion_specialties_id_passion_key;
alter table public.passion_specialties
  add  constraint passion_specialties_id_passion_key unique (id, passion_id);

create index if not exists idx_passion_specialties_passion
  on public.passion_specialties (passion_id);
create index if not exists idx_passion_specialties_actif
  on public.passion_specialties (passion_id, sort_order) where is_active;

-- spécialités 1 à 200 (sur 790)
insert into public.passion_specialties (id, passion_id, label, synonyms, sort_order, is_active) values
  ('sport-athletisme', 'sport', 'Athlétisme', '["athlé"]'::jsonb, 1, true),
  ('sport-gymnastique', 'sport', 'Gymnastique', '["gym artistique"]'::jsonb, 2, true),
  ('sport-escalade', 'sport', 'Escalade', '["grimpe"]'::jsonb, 3, true),
  ('sport-equitation', 'sport', 'Équitation', '["cheval","poney"]'::jsonb, 4, true),
  ('sport-tir-a-l-arc', 'sport', 'Tir à l''arc', '[]'::jsonb, 5, true),
  ('sport-escrime', 'sport', 'Escrime', '[]'::jsonb, 6, true),
  ('sport-tennis', 'sport', 'Tennis', '[]'::jsonb, 7, true),
  ('sport-padel', 'sport', 'Padel', '[]'::jsonb, 8, true),
  ('sport-badminton', 'sport', 'Badminton', '["badm"]'::jsonb, 9, true),
  ('sport-tennis-de-table', 'sport', 'Tennis de table', '["ping-pong","pingpong"]'::jsonb, 10, true),
  ('sport-squash', 'sport', 'Squash', '[]'::jsonb, 11, true),
  ('sport-triathlon', 'sport', 'Triathlon', '["ironman"]'::jsonb, 12, true),
  ('sport-marche-sportive', 'sport', 'Marche sportive', '["marche rapide"]'::jsonb, 13, true),
  ('sport-handisport', 'sport', 'Handisport', '["sport adapté"]'::jsonb, 14, true),
  ('sport-coaching-sportif', 'sport', 'Coaching sportif', '["coach"]'::jsonb, 15, true),
  ('sport-preparation-physique', 'sport', 'Préparation physique', '["prépa physique"]'::jsonb, 16, true),
  ('sport-arbitrage', 'sport', 'Arbitrage', '[]'::jsonb, 17, true),
  ('sport-patinage', 'sport', 'Patinage', '["patin à glace"]'::jsonb, 18, true),
  ('sport-roller', 'sport', 'Roller', '["rollers","patin à roulettes"]'::jsonb, 19, true),
  ('sport-parkour', 'sport', 'Parkour', '["freerun"]'::jsonb, 20, true),
  ('sport-sport-en-salle', 'sport', 'Sport en salle', '[]'::jsonb, 21, true),
  ('sport-competition', 'sport', 'Compétition', '[]'::jsonb, 22, true),
  ('combat-boxe', 'combat', 'Boxe anglaise', '["boxe"]'::jsonb, 1, true),
  ('combat-boxe-thai', 'combat', 'Boxe thaï', '["muay thai","muay-thaï"]'::jsonb, 2, true),
  ('combat-kickboxing', 'combat', 'Kickboxing', '["kick boxing"]'::jsonb, 3, true),
  ('combat-mma', 'combat', 'MMA', '["arts martiaux mixtes","free fight"]'::jsonb, 4, true),
  ('combat-judo', 'combat', 'Judo', '[]'::jsonb, 5, true),
  ('combat-jujitsu', 'combat', 'Ju-jitsu', '[]'::jsonb, 6, true),
  ('combat-jjb', 'combat', 'Jiu-jitsu brésilien', '["jjb","bjj"]'::jsonb, 7, true),
  ('combat-karate', 'combat', 'Karaté', '[]'::jsonb, 8, true),
  ('combat-taekwondo', 'combat', 'Taekwondo', '[]'::jsonb, 9, true),
  ('combat-aikido', 'combat', 'Aïkido', '[]'::jsonb, 10, true),
  ('combat-lutte', 'combat', 'Lutte', '[]'::jsonb, 11, true),
  ('combat-krav-maga', 'combat', 'Krav-maga', '[]'::jsonb, 12, true),
  ('combat-kung-fu', 'combat', 'Kung-fu', '["wushu"]'::jsonb, 13, true),
  ('combat-capoeira', 'combat', 'Capoeira', '[]'::jsonb, 14, true),
  ('combat-sambo', 'combat', 'Sambo', '[]'::jsonb, 15, true),
  ('combat-self-defense', 'combat', 'Self-défense', '["défense personnelle"]'::jsonb, 16, true),
  ('combat-savate', 'combat', 'Savate', '["boxe française"]'::jsonb, 17, true),
  ('collectif-football', 'collectif', 'Football', '["foot","soccer"]'::jsonb, 1, true),
  ('collectif-futsal', 'collectif', 'Futsal', '["foot en salle"]'::jsonb, 2, true),
  ('collectif-rugby', 'collectif', 'Rugby', '["rugby à XV"]'::jsonb, 3, true),
  ('collectif-rugby-a-7', 'collectif', 'Rugby à 7', '["seven"]'::jsonb, 4, true),
  ('collectif-basketball', 'collectif', 'Basketball', '["basket"]'::jsonb, 5, true),
  ('collectif-handball', 'collectif', 'Handball', '["hand"]'::jsonb, 6, true),
  ('collectif-volleyball', 'collectif', 'Volleyball', '["volley"]'::jsonb, 7, true),
  ('collectif-beach-volley', 'collectif', 'Beach-volley', '["volley de plage"]'::jsonb, 8, true),
  ('collectif-hockey-sur-gazon', 'collectif', 'Hockey sur gazon', '[]'::jsonb, 9, true),
  ('collectif-hockey-sur-glace', 'collectif', 'Hockey sur glace', '[]'::jsonb, 10, true),
  ('collectif-water-polo', 'collectif', 'Water-polo', '[]'::jsonb, 11, true),
  ('collectif-baseball', 'collectif', 'Baseball', '[]'::jsonb, 12, true),
  ('collectif-football-americain', 'collectif', 'Football américain', '["foot us"]'::jsonb, 13, true),
  ('collectif-ultimate', 'collectif', 'Ultimate frisbee', '["frisbee"]'::jsonb, 14, true),
  ('glisse-skateboard', 'glisse', 'Skateboard', '["skate"]'::jsonb, 1, true),
  ('glisse-longboard', 'glisse', 'Longboard', '[]'::jsonb, 2, true),
  ('glisse-surf', 'glisse', 'Surf', '[]'::jsonb, 3, true),
  ('glisse-bodyboard', 'glisse', 'Bodyboard', '[]'::jsonb, 4, true),
  ('glisse-paddle', 'glisse', 'Paddle', '["stand up paddle","sup"]'::jsonb, 5, true),
  ('glisse-snowboard', 'glisse', 'Snowboard', '["snow"]'::jsonb, 6, true),
  ('glisse-ski-alpin', 'glisse', 'Ski alpin', '["ski"]'::jsonb, 7, true),
  ('glisse-ski-de-fond', 'glisse', 'Ski de fond', '[]'::jsonb, 8, true),
  ('glisse-ski-de-randonnee', 'glisse', 'Ski de randonnée', '["ski de rando"]'::jsonb, 9, true),
  ('glisse-freeride', 'glisse', 'Freeride', '["hors-piste"]'::jsonb, 10, true),
  ('glisse-kitesurf', 'glisse', 'Kitesurf', '["kite"]'::jsonb, 11, true),
  ('glisse-windsurf', 'glisse', 'Windsurf', '["planche à voile"]'::jsonb, 12, true),
  ('glisse-wingfoil', 'glisse', 'Wingfoil', '["wing"]'::jsonb, 13, true),
  ('glisse-wakeboard', 'glisse', 'Wakeboard', '[]'::jsonb, 14, true),
  ('glisse-ski-nautique', 'glisse', 'Ski nautique', '[]'::jsonb, 15, true),
  ('glisse-trottinette-freestyle', 'glisse', 'Trottinette freestyle', '["trott"]'::jsonb, 16, true),
  ('outdoor-randonnee', 'outdoor', 'Randonnée', '["rando","marche"]'::jsonb, 1, true),
  ('outdoor-trekking', 'outdoor', 'Trekking', '["trek"]'::jsonb, 2, true),
  ('outdoor-alpinisme', 'outdoor', 'Alpinisme', '["haute montagne"]'::jsonb, 3, true),
  ('outdoor-via-ferrata', 'outdoor', 'Via ferrata', '[]'::jsonb, 4, true),
  ('outdoor-canyoning', 'outdoor', 'Canyoning', '["canyon"]'::jsonb, 5, true),
  ('outdoor-speleologie', 'outdoor', 'Spéléologie', '["spéléo","grotte"]'::jsonb, 6, true),
  ('outdoor-bivouac', 'outdoor', 'Bivouac', '[]'::jsonb, 7, true),
  ('outdoor-camping', 'outdoor', 'Camping', '[]'::jsonb, 8, true),
  ('outdoor-bushcraft', 'outdoor', 'Bushcraft', '[]'::jsonb, 9, true),
  ('outdoor-survie', 'outdoor', 'Survie', '["survivalisme"]'::jsonb, 10, true),
  ('outdoor-course-orientation', 'outdoor', 'Course d''orientation', '["orientation"]'::jsonb, 11, true),
  ('outdoor-raquettes-a-neige', 'outdoor', 'Raquettes à neige', '[]'::jsonb, 12, true),
  ('outdoor-cascade-de-glace', 'outdoor', 'Cascade de glace', '[]'::jsonb, 13, true),
  ('outdoor-slackline', 'outdoor', 'Slackline', '[]'::jsonb, 14, true),
  ('outdoor-geocaching', 'outdoor', 'Géocaching', '[]'::jsonb, 15, true),
  ('outdoor-cueillette', 'outdoor', 'Cueillette', '["champignons"]'::jsonb, 16, true),
  ('outdoor-escalade-bloc', 'outdoor', 'Escalade de bloc', '["bloc","bouldering"]'::jsonb, 17, true),
  ('outdoor-parapente', 'outdoor', 'Parapente', '["vol libre"]'::jsonb, 18, true),
  ('running-jogging', 'running', 'Jogging', '["footing"]'::jsonb, 1, true),
  ('running-trail', 'running', 'Trail', '["trail running"]'::jsonb, 2, true),
  ('running-marathon', 'running', 'Marathon', '[]'::jsonb, 3, true),
  ('running-semi-marathon', 'running', 'Semi-marathon', '["semi"]'::jsonb, 4, true),
  ('running-dix-km', 'running', '10 km', '[]'::jsonb, 5, true),
  ('running-ultra-trail', 'running', 'Ultra-trail', '["ultra"]'::jsonb, 6, true),
  ('running-cross', 'running', 'Cross', '["cross-country"]'::jsonb, 7, true),
  ('running-piste', 'running', 'Course sur piste', '[]'::jsonb, 8, true),
  ('running-course-obstacles', 'running', 'Course à obstacles', '["spartan","ocr"]'::jsonb, 9, true),
  ('running-running-urbain', 'running', 'Running urbain', '[]'::jsonb, 10, true),
  ('running-fractionne', 'running', 'Fractionné', '["interval"]'::jsonb, 11, true),
  ('running-preparation-course', 'running', 'Préparation de course', '["plan d''entraînement"]'::jsonb, 12, true),
  ('running-course-nature', 'running', 'Course nature', '[]'::jsonb, 13, true),
  ('running-relais', 'running', 'Relais', '["ekiden"]'::jsonb, 14, true),
  ('fitness-musculation', 'fitness', 'Musculation', '["muscu"]'::jsonb, 1, true),
  ('fitness-crossfit', 'fitness', 'CrossFit', '["cross training"]'::jsonb, 2, true),
  ('fitness-halterophilie', 'fitness', 'Haltérophilie', '["haltéro"]'::jsonb, 3, true),
  ('fitness-street-workout', 'fitness', 'Street workout', '[]'::jsonb, 4, true),
  ('fitness-calisthenics', 'fitness', 'Callisthénie', '["calisthenics","poids du corps"]'::jsonb, 5, true),
  ('fitness-hiit', 'fitness', 'HIIT', '[]'::jsonb, 6, true),
  ('fitness-cardio', 'fitness', 'Cardio', '[]'::jsonb, 7, true),
  ('fitness-renforcement-musculaire', 'fitness', 'Renforcement musculaire', '["renfo"]'::jsonb, 8, true),
  ('fitness-powerlifting', 'fitness', 'Powerlifting', '["force athlétique"]'::jsonb, 9, true),
  ('fitness-bodybuilding', 'fitness', 'Bodybuilding', '["culturisme"]'::jsonb, 10, true),
  ('fitness-kettlebell', 'fitness', 'Kettlebell', '[]'::jsonb, 11, true),
  ('fitness-trx', 'fitness', 'TRX', '["sangles"]'::jsonb, 12, true),
  ('fitness-spinning', 'fitness', 'Spinning', '["biking","rpm"]'::jsonb, 13, true),
  ('fitness-aquagym', 'fitness', 'Aquagym', '[]'::jsonb, 14, true),
  ('fitness-stretching', 'fitness', 'Stretching', '["étirements","souplesse"]'::jsonb, 15, true),
  ('fitness-fitness-maison', 'fitness', 'Fitness à la maison', '["home gym"]'::jsonb, 16, true),
  ('fitness-prise-de-masse', 'fitness', 'Prise de masse', '[]'::jsonb, 17, true),
  ('fitness-seche', 'fitness', 'Sèche', '[]'::jsonb, 18, true),
  ('cyclisme-route', 'cyclisme', 'Vélo de route', '["route"]'::jsonb, 1, true),
  ('cyclisme-vtt', 'cyclisme', 'VTT', '["vtt","mountain bike"]'::jsonb, 2, true),
  ('cyclisme-gravel', 'cyclisme', 'Gravel', '[]'::jsonb, 3, true),
  ('cyclisme-bmx', 'cyclisme', 'BMX', '[]'::jsonb, 4, true),
  ('cyclisme-piste-velo', 'cyclisme', 'Piste', '[]'::jsonb, 5, true),
  ('cyclisme-cyclocross', 'cyclisme', 'Cyclo-cross', '[]'::jsonb, 6, true),
  ('cyclisme-descente', 'cyclisme', 'Descente', '["dh","downhill"]'::jsonb, 7, true),
  ('cyclisme-velo-electrique', 'cyclisme', 'Vélo électrique', '["vae","vélo élec"]'::jsonb, 8, true),
  ('cyclisme-cyclotourisme', 'cyclisme', 'Cyclotourisme', '["cyclo"]'::jsonb, 9, true),
  ('cyclisme-bikepacking', 'cyclisme', 'Bikepacking', '[]'::jsonb, 10, true),
  ('cyclisme-velotaf', 'cyclisme', 'Vélotaf', '["vélo au travail"]'::jsonb, 11, true),
  ('cyclisme-fixie', 'cyclisme', 'Fixie', '["pignon fixe"]'::jsonb, 12, true),
  ('cyclisme-mecanique-velo', 'cyclisme', 'Mécanique vélo', '[]'::jsonb, 13, true),
  ('cyclisme-course-sur-route', 'cyclisme', 'Course sur route', '[]'::jsonb, 14, true),
  ('cyclisme-enduro-vtt', 'cyclisme', 'Enduro VTT', '[]'::jsonb, 15, true),
  ('cyclisme-trial-velo', 'cyclisme', 'Trial vélo', '[]'::jsonb, 16, true),
  ('musique-guitare', 'musique', 'Guitare', '["gratte"]'::jsonb, 1, true),
  ('musique-guitare-electrique', 'musique', 'Guitare électrique', '[]'::jsonb, 2, true),
  ('musique-basse', 'musique', 'Basse', '["guitare basse"]'::jsonb, 3, true),
  ('musique-piano', 'musique', 'Piano', '["clavier"]'::jsonb, 4, true),
  ('musique-batterie', 'musique', 'Batterie', '["drums"]'::jsonb, 5, true),
  ('musique-chant', 'musique', 'Chant', '["voix","chanter"]'::jsonb, 6, true),
  ('musique-violon', 'musique', 'Violon', '[]'::jsonb, 7, true),
  ('musique-violoncelle', 'musique', 'Violoncelle', '[]'::jsonb, 8, true),
  ('musique-saxophone', 'musique', 'Saxophone', '["sax"]'::jsonb, 9, true),
  ('musique-trompette', 'musique', 'Trompette', '[]'::jsonb, 10, true),
  ('musique-flute', 'musique', 'Flûte', '[]'::jsonb, 11, true),
  ('musique-ukulele', 'musique', 'Ukulélé', '["ukulele"]'::jsonb, 12, true),
  ('musique-harmonica', 'musique', 'Harmonica', '[]'::jsonb, 13, true),
  ('musique-accordeon', 'musique', 'Accordéon', '[]'::jsonb, 14, true),
  ('musique-dj', 'musique', 'DJ', '["mix","platines","deejay"]'::jsonb, 15, true),
  ('musique-mao', 'musique', 'MAO', '["musique assistée par ordinateur","production"]'::jsonb, 16, true),
  ('musique-beatmaking', 'musique', 'Beatmaking', '["prod","instru"]'::jsonb, 17, true),
  ('musique-mixage', 'musique', 'Mixage', '["mix audio"]'::jsonb, 18, true),
  ('musique-mastering', 'musique', 'Mastering', '[]'::jsonb, 19, true),
  ('musique-composition', 'musique', 'Composition', '["compo"]'::jsonb, 20, true),
  ('musique-solfege', 'musique', 'Solfège', '["théorie musicale"]'::jsonb, 21, true),
  ('musique-groupe', 'musique', 'Groupe et répétitions', '["band","répète"]'::jsonb, 22, true),
  ('musique-home-studio', 'musique', 'Home studio', '["studio maison"]'::jsonb, 23, true),
  ('musique-rap', 'musique', 'Rap', '["hip-hop","hiphop"]'::jsonb, 24, true),
  ('musique-rock', 'musique', 'Rock', '[]'::jsonb, 25, true),
  ('musique-jazz', 'musique', 'Jazz', '[]'::jsonb, 26, true),
  ('musique-musique-classique', 'musique', 'Musique classique', '["classique"]'::jsonb, 27, true),
  ('musique-electro', 'musique', 'Électro', '["electro","edm","techno"]'::jsonb, 28, true),
  ('musique-metal', 'musique', 'Metal', '["métal"]'::jsonb, 29, true),
  ('musique-reggae', 'musique', 'Reggae', '[]'::jsonb, 30, true),
  ('musique-chanson-francaise', 'musique', 'Chanson française', '["variété"]'::jsonb, 31, true),
  ('musique-blues', 'musique', 'Blues', '[]'::jsonb, 32, true),
  ('danse-hip-hop', 'danse', 'Hip-hop', '["hiphop"]'::jsonb, 1, true),
  ('danse-classique-danse', 'danse', 'Danse classique', '["ballet"]'::jsonb, 2, true),
  ('danse-contemporaine', 'danse', 'Danse contemporaine', '["contemporain"]'::jsonb, 3, true),
  ('danse-salsa', 'danse', 'Salsa', '[]'::jsonb, 4, true),
  ('danse-bachata', 'danse', 'Bachata', '[]'::jsonb, 5, true),
  ('danse-kizomba', 'danse', 'Kizomba', '[]'::jsonb, 6, true),
  ('danse-rock-swing', 'danse', 'Rock et swing', '["lindy hop"]'::jsonb, 7, true),
  ('danse-tango', 'danse', 'Tango', '[]'::jsonb, 8, true),
  ('danse-valse', 'danse', 'Valse', '[]'::jsonb, 9, true),
  ('danse-breakdance', 'danse', 'Breakdance', '["break","bboying"]'::jsonb, 10, true),
  ('danse-house-dance', 'danse', 'House dance', '[]'::jsonb, 11, true),
  ('danse-danse-orientale', 'danse', 'Danse orientale', '[]'::jsonb, 12, true),
  ('danse-danse-africaine', 'danse', 'Danse africaine', '[]'::jsonb, 13, true),
  ('danse-zumba', 'danse', 'Zumba', '[]'::jsonb, 14, true),
  ('danse-modern-jazz', 'danse', 'Modern jazz', '[]'::jsonb, 15, true),
  ('danse-claquettes', 'danse', 'Claquettes', '[]'::jsonb, 16, true),
  ('danse-pole-dance', 'danse', 'Pole dance', '[]'::jsonb, 17, true),
  ('danse-danse-country', 'danse', 'Danse country', '[]'::jsonb, 18, true),
  ('danse-kpop-dance', 'danse', 'K-pop dance', '["kpop"]'::jsonb, 19, true),
  ('theatre-improvisation', 'theatre', 'Improvisation', '["impro"]'::jsonb, 1, true),
  ('theatre-theatre-classique', 'theatre', 'Théâtre classique', '[]'::jsonb, 2, true),
  ('theatre-comedie', 'theatre', 'Comédie', '[]'::jsonb, 3, true),
  ('theatre-stand-up', 'theatre', 'Stand-up', '["standup"]'::jsonb, 4, true),
  ('theatre-one-man-show', 'theatre', 'One-man-show', '[]'::jsonb, 5, true),
  ('theatre-mise-en-scene', 'theatre', 'Mise en scène', '[]'::jsonb, 6, true),
  ('theatre-cirque', 'theatre', 'Cirque', '[]'::jsonb, 7, true),
  ('theatre-jonglage', 'theatre', 'Jonglage', '[]'::jsonb, 8, true),
  ('theatre-magie', 'theatre', 'Magie', '["prestidigitation"]'::jsonb, 9, true),
  ('theatre-marionnettes', 'theatre', 'Marionnettes', '[]'::jsonb, 10, true),
  ('theatre-cabaret', 'theatre', 'Cabaret', '[]'::jsonb, 11, true),
  ('theatre-comedie-musicale', 'theatre', 'Comédie musicale', '[]'::jsonb, 12, true),
  ('theatre-slam', 'theatre', 'Slam', '[]'::jsonb, 13, true),
  ('theatre-conte', 'theatre', 'Conte', '[]'::jsonb, 14, true)
on conflict (id) do update set
  passion_id = excluded.passion_id, label = excluded.label, synonyms = excluded.synonyms,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- spécialités 201 à 400 (sur 790)
insert into public.passion_specialties (id, passion_id, label, synonyms, sort_order, is_active) values
  ('photo-portrait', 'photo', 'Portrait', '[]'::jsonb, 1, true),
  ('photo-paysage', 'photo', 'Paysage', '[]'::jsonb, 2, true),
  ('photo-argentique', 'photo', 'Argentique', '["pellicule","film"]'::jsonb, 3, true),
  ('photo-studio', 'photo', 'Studio', '[]'::jsonb, 4, true),
  ('photo-street-photo', 'photo', 'Street photo', '["photo de rue"]'::jsonb, 5, true),
  ('photo-animalier', 'photo', 'Animalier', '["photo animalière"]'::jsonb, 6, true),
  ('photo-macro', 'photo', 'Macro', '["macrophotographie"]'::jsonb, 7, true),
  ('photo-astrophoto', 'photo', 'Astrophotographie', '["astrophoto"]'::jsonb, 8, true),
  ('photo-mariage', 'photo', 'Mariage', '[]'::jsonb, 9, true),
  ('photo-mode-photo', 'photo', 'Photo de mode', '[]'::jsonb, 10, true),
  ('photo-reportage', 'photo', 'Reportage', '["photojournalisme"]'::jsonb, 11, true),
  ('photo-noir-et-blanc', 'photo', 'Noir et blanc', '["nb","n&b"]'::jsonb, 12, true),
  ('photo-developpement', 'photo', 'Développement', '["labo","tirage"]'::jsonb, 13, true),
  ('photo-retouche', 'photo', 'Retouche', '["photoshop"]'::jsonb, 14, true),
  ('photo-lightroom', 'photo', 'Lightroom', '["catalogage"]'::jsonb, 15, true),
  ('photo-drone', 'photo', 'Photo par drone', '["drone"]'::jsonb, 16, true),
  ('photo-sport-photo', 'photo', 'Photo de sport', '[]'::jsonb, 17, true),
  ('photo-culinaire-photo', 'photo', 'Photo culinaire', '["food photo"]'::jsonb, 18, true),
  ('photo-urbex', 'photo', 'Urbex', '["exploration urbaine"]'::jsonb, 19, true),
  ('photo-longue-exposition', 'photo', 'Longue exposition', '["pose longue"]'::jsonb, 20, true),
  ('photo-photo-mobile', 'photo', 'Photo au smartphone', '["photo mobile"]'::jsonb, 21, true),
  ('photo-nature-morte', 'photo', 'Nature morte', '[]'::jsonb, 22, true),
  ('art-peinture', 'art', 'Peinture', '["peindre"]'::jsonb, 1, true),
  ('art-aquarelle', 'art', 'Aquarelle', '[]'::jsonb, 2, true),
  ('art-huile', 'art', 'Peinture à l''huile', '[]'::jsonb, 3, true),
  ('art-acrylique', 'art', 'Acrylique', '[]'::jsonb, 4, true),
  ('art-dessin', 'art', 'Dessin', '["dessiner"]'::jsonb, 5, true),
  ('art-croquis', 'art', 'Croquis', '["sketch"]'::jsonb, 6, true),
  ('art-illustration', 'art', 'Illustration', '[]'::jsonb, 7, true),
  ('art-bd', 'art', 'Bande dessinée', '["bd","comics"]'::jsonb, 8, true),
  ('art-manga-dessin', 'art', 'Dessin manga', '["manga"]'::jsonb, 9, true),
  ('art-sculpture', 'art', 'Sculpture', '[]'::jsonb, 10, true),
  ('art-ceramique', 'art', 'Céramique', '[]'::jsonb, 11, true),
  ('art-gravure', 'art', 'Gravure', '[]'::jsonb, 12, true),
  ('art-street-art', 'art', 'Street art', '[]'::jsonb, 13, true),
  ('art-graffiti', 'art', 'Graffiti', '["graff","tag"]'::jsonb, 14, true),
  ('art-calligraphie', 'art', 'Calligraphie', '["lettering"]'::jsonb, 15, true),
  ('art-collage', 'art', 'Collage', '[]'::jsonb, 16, true),
  ('art-pastel', 'art', 'Pastel', '[]'::jsonb, 17, true),
  ('art-encre', 'art', 'Encre', '[]'::jsonb, 18, true),
  ('art-art-numerique', 'art', 'Art numérique', '["digital art"]'::jsonb, 19, true),
  ('art-land-art', 'art', 'Land art', '[]'::jsonb, 20, true),
  ('art-mosaique', 'art', 'Mosaïque', '[]'::jsonb, 21, true),
  ('art-portrait-dessin', 'art', 'Portrait au crayon', '[]'::jsonb, 22, true),
  ('mode-couture', 'mode', 'Couture', '["coudre","machine à coudre"]'::jsonb, 1, true),
  ('mode-stylisme', 'mode', 'Stylisme', '[]'::jsonb, 2, true),
  ('mode-upcycling', 'mode', 'Upcycling', '["surcyclage"]'::jsonb, 3, true),
  ('mode-tricot', 'mode', 'Tricot', '["tricoter"]'::jsonb, 4, true),
  ('mode-crochet', 'mode', 'Crochet', '[]'::jsonb, 5, true),
  ('mode-broderie', 'mode', 'Broderie', '[]'::jsonb, 6, true),
  ('mode-vintage', 'mode', 'Vintage', '["friperie","seconde main"]'::jsonb, 7, true),
  ('mode-sneakers', 'mode', 'Sneakers', '["baskets"]'::jsonb, 8, true),
  ('mode-streetwear', 'mode', 'Streetwear', '[]'::jsonb, 9, true),
  ('mode-maquillage', 'mode', 'Maquillage', '["makeup"]'::jsonb, 10, true),
  ('mode-coiffure', 'mode', 'Coiffure', '[]'::jsonb, 11, true),
  ('mode-nail-art', 'mode', 'Nail art', '["ongles"]'::jsonb, 12, true),
  ('mode-accessoires', 'mode', 'Accessoires', '[]'::jsonb, 13, true),
  ('mode-mode-durable', 'mode', 'Mode durable', '["éthique"]'::jsonb, 14, true),
  ('mode-shopping', 'mode', 'Shopping', '[]'::jsonb, 15, true),
  ('mode-lookbook', 'mode', 'Lookbook', '[]'::jsonb, 16, true),
  ('mode-patronage', 'mode', 'Patronage', '[]'::jsonb, 17, true),
  ('mode-teinture', 'mode', 'Teinture', '["tie and dye"]'::jsonb, 18, true),
  ('metier-menuiserie', 'metier', 'Menuiserie', '["bois"]'::jsonb, 1, true),
  ('metier-ebenisterie', 'metier', 'Ébénisterie', '[]'::jsonb, 2, true),
  ('metier-poterie', 'metier', 'Poterie', '["tour"]'::jsonb, 3, true),
  ('metier-ceramique-artisanat', 'metier', 'Céramique d''art', '[]'::jsonb, 4, true),
  ('metier-forge', 'metier', 'Forge', '["forgeron"]'::jsonb, 5, true),
  ('metier-coutellerie', 'metier', 'Coutellerie', '["couteau"]'::jsonb, 6, true),
  ('metier-maroquinerie', 'metier', 'Maroquinerie', '["cuir"]'::jsonb, 7, true),
  ('metier-vitrail', 'metier', 'Vitrail', '[]'::jsonb, 8, true),
  ('metier-verrerie', 'metier', 'Verrerie', '["soufflage de verre"]'::jsonb, 9, true),
  ('metier-bijouterie', 'metier', 'Bijouterie', '["bijoux"]'::jsonb, 10, true),
  ('metier-tapisserie', 'metier', 'Tapisserie', '[]'::jsonb, 11, true),
  ('metier-restauration-meubles', 'metier', 'Restauration de meubles', '[]'::jsonb, 12, true),
  ('metier-tournage-bois', 'metier', 'Tournage sur bois', '[]'::jsonb, 13, true),
  ('metier-sculpture-bois', 'metier', 'Sculpture sur bois', '[]'::jsonb, 14, true),
  ('metier-savonnerie', 'metier', 'Savonnerie', '["savon"]'::jsonb, 15, true),
  ('metier-bougies', 'metier', 'Bougies', '[]'::jsonb, 16, true),
  ('metier-vannerie', 'metier', 'Vannerie', '["osier"]'::jsonb, 17, true),
  ('metier-reliure', 'metier', 'Reliure', '[]'::jsonb, 18, true),
  ('metier-cordonnerie', 'metier', 'Cordonnerie', '[]'::jsonb, 19, true),
  ('metier-ferronnerie', 'metier', 'Ferronnerie', '[]'::jsonb, 20, true),
  ('video-montage', 'video', 'Montage', '["editing","premiere","davinci"]'::jsonb, 1, true),
  ('video-tournage', 'video', 'Tournage', '[]'::jsonb, 2, true),
  ('video-court-metrage', 'video', 'Court-métrage', '["court métrage"]'::jsonb, 3, true),
  ('video-documentaire', 'video', 'Documentaire', '["docu"]'::jsonb, 4, true),
  ('video-motion-design', 'video', 'Motion design', '[]'::jsonb, 5, true),
  ('video-vlog', 'video', 'Vlog', '[]'::jsonb, 6, true),
  ('video-youtube', 'video', 'YouTube', '[]'::jsonb, 7, true),
  ('video-drone-video', 'video', 'Vidéo par drone', '[]'::jsonb, 8, true),
  ('video-colorimetrie', 'video', 'Colorimétrie', '["étalonnage"]'::jsonb, 9, true),
  ('video-sound-design', 'video', 'Sound design', '[]'::jsonb, 10, true),
  ('video-storyboard', 'video', 'Storyboard', '[]'::jsonb, 11, true),
  ('video-streaming', 'video', 'Streaming', '["live"]'::jsonb, 12, true),
  ('video-twitch', 'video', 'Twitch', '[]'::jsonb, 13, true),
  ('video-podcast-video', 'video', 'Podcast vidéo', '[]'::jsonb, 14, true),
  ('video-effets-speciaux', 'video', 'Effets spéciaux', '["vfx"]'::jsonb, 15, true),
  ('video-cadrage', 'video', 'Cadrage et lumière', '[]'::jsonb, 16, true),
  ('design-graphisme', 'design', 'Graphisme', '[]'::jsonb, 1, true),
  ('design-ui-design', 'design', 'UI design', '["interface"]'::jsonb, 2, true),
  ('design-ux-design', 'design', 'UX design', '["expérience utilisateur"]'::jsonb, 3, true),
  ('design-typographie', 'design', 'Typographie', '["typo","police"]'::jsonb, 4, true),
  ('design-identite-visuelle', 'design', 'Identité visuelle', '["branding"]'::jsonb, 5, true),
  ('design-logo', 'design', 'Logo', '[]'::jsonb, 6, true),
  ('design-affiche', 'design', 'Affiche', '["poster"]'::jsonb, 7, true),
  ('design-illustration-vectorielle', 'design', 'Illustration vectorielle', '["vectoriel"]'::jsonb, 8, true),
  ('design-design-produit', 'design', 'Design produit', '[]'::jsonb, 9, true),
  ('design-design-3d', 'design', 'Design 3D', '["3d","blender"]'::jsonb, 10, true),
  ('design-packaging', 'design', 'Packaging', '[]'::jsonb, 11, true),
  ('design-print', 'design', 'Print', '["impression"]'::jsonb, 12, true),
  ('design-web-design', 'design', 'Web design', '[]'::jsonb, 13, true),
  ('design-direction-artistique', 'design', 'Direction artistique', '["da"]'::jsonb, 14, true),
  ('design-figma', 'design', 'Figma', '[]'::jsonb, 15, true),
  ('design-illustrator', 'design', 'Illustrator et Photoshop', '["adobe"]'::jsonb, 16, true),
  ('voyage-road-trip', 'voyage', 'Road trip', '["roadtrip"]'::jsonb, 1, true),
  ('voyage-backpacking', 'voyage', 'Backpacking', '["sac à dos","routard"]'::jsonb, 2, true),
  ('voyage-city-break', 'voyage', 'City break', '["week-end en ville"]'::jsonb, 3, true),
  ('voyage-randonnee-voyage', 'voyage', 'Voyage en randonnée', '[]'::jsonb, 4, true),
  ('voyage-voyage-solo', 'voyage', 'Voyage en solo', '["solo"]'::jsonb, 5, true),
  ('voyage-expatriation', 'voyage', 'Expatriation', '["expat"]'::jsonb, 6, true),
  ('voyage-aviation', 'voyage', 'Aviation', '["avion","vol"]'::jsonb, 7, true),
  ('voyage-croisiere', 'voyage', 'Croisière', '[]'::jsonb, 8, true),
  ('voyage-train', 'voyage', 'Voyage en train', '["interrail"]'::jsonb, 9, true),
  ('voyage-camping-car', 'voyage', 'Camping-car', '[]'::jsonb, 10, true),
  ('voyage-vanlife', 'voyage', 'Vanlife', '["van","fourgon aménagé"]'::jsonb, 11, true),
  ('voyage-tour-du-monde', 'voyage', 'Tour du monde', '[]'::jsonb, 12, true),
  ('voyage-voyage-famille', 'voyage', 'Voyage en famille', '[]'::jsonb, 13, true),
  ('voyage-voyage-budget', 'voyage', 'Voyage petit budget', '["pas cher"]'::jsonb, 14, true),
  ('voyage-plongee-voyage', 'voyage', 'Plongée', '["plongée sous-marine","scuba"]'::jsonb, 15, true),
  ('voyage-culture-locale', 'voyage', 'Culture locale', '[]'::jsonb, 16, true),
  ('voyage-gastronomie-voyage', 'voyage', 'Gastronomie du monde', '[]'::jsonb, 17, true),
  ('voyage-photographie-voyage', 'voyage', 'Photo de voyage', '[]'::jsonb, 18, true),
  ('voyage-europe', 'voyage', 'Europe', '[]'::jsonb, 19, true),
  ('voyage-asie', 'voyage', 'Asie', '[]'::jsonb, 20, true),
  ('voyage-amerique-latine', 'voyage', 'Amérique latine', '[]'::jsonb, 21, true),
  ('voyage-afrique', 'voyage', 'Afrique', '[]'::jsonb, 22, true),
  ('voyage-france', 'voyage', 'France', '[]'::jsonb, 23, true),
  ('moto-route-moto', 'moto', 'Route', '["balade route"]'::jsonb, 1, true),
  ('moto-balade', 'moto', 'Balade', '["ride"]'::jsonb, 2, true),
  ('moto-circuit', 'moto', 'Circuit', '["piste"]'::jsonb, 3, true),
  ('moto-motocross', 'moto', 'Motocross', '["moto cross","mx","cross"]'::jsonb, 4, true),
  ('moto-enduro', 'moto', 'Enduro', '["tout-terrain"]'::jsonb, 5, true),
  ('moto-trial', 'moto', 'Trial', '[]'::jsonb, 6, true),
  ('moto-mecanique', 'moto', 'Mécanique', '["entretien","garage"]'::jsonb, 7, true),
  ('moto-roadster', 'moto', 'Roadster', '[]'::jsonb, 8, true),
  ('moto-sportive', 'moto', 'Sportive', '[]'::jsonb, 9, true),
  ('moto-trail-moto', 'moto', 'Trail', '[]'::jsonb, 10, true),
  ('moto-custom', 'moto', 'Custom', '[]'::jsonb, 11, true),
  ('moto-cafe-racer', 'moto', 'Café racer', '[]'::jsonb, 12, true),
  ('moto-voyage-moto', 'moto', 'Voyage à moto', '["moto voyage"]'::jsonb, 13, true),
  ('moto-supermotard', 'moto', 'Supermotard', '["supermot"]'::jsonb, 14, true),
  ('moto-permis', 'moto', 'Permis moto', '[]'::jsonb, 15, true),
  ('moto-equipement', 'moto', 'Équipement', '["casque","protections"]'::jsonb, 16, true),
  ('moto-scooter', 'moto', 'Scooter', '[]'::jsonb, 17, true),
  ('moto-restauration-moto', 'moto', 'Restauration de moto', '[]'::jsonb, 18, true),
  ('auto-mecanique-auto', 'auto', 'Mécanique auto', '[]'::jsonb, 1, true),
  ('auto-restauration-auto', 'auto', 'Restauration', '[]'::jsonb, 2, true),
  ('auto-youngtimer', 'auto', 'Youngtimer', '[]'::jsonb, 3, true),
  ('auto-voiture-ancienne', 'auto', 'Voiture ancienne', '["collection","ancêtre"]'::jsonb, 4, true),
  ('auto-tuning', 'auto', 'Tuning', '[]'::jsonb, 5, true),
  ('auto-circuit-auto', 'auto', 'Circuit', '[]'::jsonb, 6, true),
  ('auto-rallye', 'auto', 'Rallye', '[]'::jsonb, 7, true),
  ('auto-karting', 'auto', 'Karting', '["kart"]'::jsonb, 8, true),
  ('auto-drift', 'auto', 'Drift', '[]'::jsonb, 9, true),
  ('auto-electrique', 'auto', 'Voiture électrique', '["ev"]'::jsonb, 10, true),
  ('auto-quatre-quatre', 'auto', '4x4 et off-road', '["4x4","tout-terrain"]'::jsonb, 11, true),
  ('auto-detailing', 'auto', 'Detailing', '["esthétique auto"]'::jsonb, 12, true),
  ('auto-preparation-auto', 'auto', 'Préparation', '[]'::jsonb, 13, true),
  ('auto-sport-auto', 'auto', 'Sport automobile', '[]'::jsonb, 14, true),
  ('auto-formule-1', 'auto', 'Formule 1', '["f1"]'::jsonb, 15, true),
  ('auto-road-trip-auto', 'auto', 'Road trip en voiture', '[]'::jsonb, 16, true),
  ('auto-entretien-auto', 'auto', 'Entretien', '[]'::jsonb, 17, true),
  ('auto-utilitaire', 'auto', 'Utilitaire et aménagement', '[]'::jsonb, 18, true),
  ('tech-gadgets', 'tech', 'Gadgets', '[]'::jsonb, 1, true),
  ('tech-smartphones', 'tech', 'Smartphones', '["téléphone","mobile"]'::jsonb, 2, true),
  ('tech-domotique', 'tech', 'Domotique', '["maison connectée"]'::jsonb, 3, true),
  ('tech-hardware', 'tech', 'Hardware', '["matériel","montage pc"]'::jsonb, 4, true),
  ('tech-pc-gaming', 'tech', 'PC gaming', '["config"]'::jsonb, 5, true),
  ('tech-impression-3d', 'tech', 'Impression 3D', '["imprimante 3d"]'::jsonb, 6, true),
  ('tech-raspberry-pi', 'tech', 'Raspberry Pi', '[]'::jsonb, 7, true),
  ('tech-arduino', 'tech', 'Arduino', '[]'::jsonb, 8, true),
  ('tech-electronique', 'tech', 'Électronique', '[]'::jsonb, 9, true),
  ('tech-reseaux', 'tech', 'Réseaux', '["network"]'::jsonb, 10, true),
  ('tech-cybersecurite', 'tech', 'Cybersécurité', '["sécurité","hacking"]'::jsonb, 11, true),
  ('tech-linux', 'tech', 'Linux', '[]'::jsonb, 12, true),
  ('tech-open-source', 'tech', 'Open source', '["logiciel libre"]'::jsonb, 13, true),
  ('tech-self-hosting', 'tech', 'Auto-hébergement', '["self hosting","homelab"]'::jsonb, 14, true),
  ('tech-retro-informatique', 'tech', 'Rétro-informatique', '["retro"]'::jsonb, 15, true),
  ('tech-drones', 'tech', 'Drones', '[]'::jsonb, 16, true),
  ('tech-realite-virtuelle', 'tech', 'Réalité virtuelle', '["vr","casque vr"]'::jsonb, 17, true),
  ('tech-objets-connectes', 'tech', 'Objets connectés', '["iot"]'::jsonb, 18, true),
  ('tech-veille-tech', 'tech', 'Veille techno', '[]'::jsonb, 19, true),
  ('tech-reparation', 'tech', 'Réparation', '["réparer"]'::jsonb, 20, true),
  ('jeuxvideo-fps', 'jeuxvideo', 'FPS', '["shooter"]'::jsonb, 1, true),
  ('jeuxvideo-rpg', 'jeuxvideo', 'RPG', '["jeu de rôle"]'::jsonb, 2, true),
  ('jeuxvideo-mmorpg', 'jeuxvideo', 'MMORPG', '["mmo"]'::jsonb, 3, true),
  ('jeuxvideo-moba', 'jeuxvideo', 'MOBA', '[]'::jsonb, 4, true),
  ('jeuxvideo-strategie', 'jeuxvideo', 'Stratégie', '["rts","4x"]'::jsonb, 5, true),
  ('jeuxvideo-plateforme', 'jeuxvideo', 'Plateforme', '["platformer"]'::jsonb, 6, true),
  ('jeuxvideo-simulation', 'jeuxvideo', 'Simulation', '["simu"]'::jsonb, 7, true)
on conflict (id) do update set
  passion_id = excluded.passion_id, label = excluded.label, synonyms = excluded.synonyms,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- spécialités 401 à 600 (sur 790)
insert into public.passion_specialties (id, passion_id, label, synonyms, sort_order, is_active) values
  ('jeuxvideo-course-jeu', 'jeuxvideo', 'Course', '["racing"]'::jsonb, 8, true),
  ('jeuxvideo-sport-jeu', 'jeuxvideo', 'Sport', '["fifa","nba"]'::jsonb, 9, true),
  ('jeuxvideo-aventure', 'jeuxvideo', 'Aventure', '[]'::jsonb, 10, true),
  ('jeuxvideo-indie', 'jeuxvideo', 'Jeux indés', '["indé"]'::jsonb, 11, true),
  ('jeuxvideo-retrogaming', 'jeuxvideo', 'Rétrogaming', '["retro gaming"]'::jsonb, 12, true),
  ('jeuxvideo-speedrun', 'jeuxvideo', 'Speedrun', '[]'::jsonb, 13, true),
  ('jeuxvideo-esport', 'jeuxvideo', 'Esport', '["e-sport","compétitif"]'::jsonb, 14, true),
  ('jeuxvideo-streaming-jeu', 'jeuxvideo', 'Streaming de jeu', '[]'::jsonb, 15, true),
  ('jeuxvideo-nintendo', 'jeuxvideo', 'Nintendo', '["switch"]'::jsonb, 16, true),
  ('jeuxvideo-playstation', 'jeuxvideo', 'PlayStation', '["ps5"]'::jsonb, 17, true),
  ('jeuxvideo-xbox', 'jeuxvideo', 'Xbox', '[]'::jsonb, 18, true),
  ('jeuxvideo-pc-gaming-jeu', 'jeuxvideo', 'Jeu sur PC', '[]'::jsonb, 19, true),
  ('jeuxvideo-mobile-gaming', 'jeuxvideo', 'Jeu mobile', '[]'::jsonb, 20, true),
  ('jeuxvideo-vr-gaming', 'jeuxvideo', 'Jeu en VR', '[]'::jsonb, 21, true),
  ('jeuxvideo-modding', 'jeuxvideo', 'Modding', '["mods"]'::jsonb, 22, true),
  ('jeuxvideo-game-design', 'jeuxvideo', 'Game design', '["création de jeu"]'::jsonb, 23, true),
  ('ia-ia-generative', 'ia', 'IA générative', '["gen ai"]'::jsonb, 1, true),
  ('ia-llm', 'ia', 'Modèles de langage', '["llm","gpt","claude"]'::jsonb, 2, true),
  ('ia-prompt-engineering', 'ia', 'Prompt engineering', '["prompt"]'::jsonb, 3, true),
  ('ia-machine-learning', 'ia', 'Machine learning', '["ml","apprentissage automatique"]'::jsonb, 4, true),
  ('ia-deep-learning', 'ia', 'Deep learning', '["réseaux de neurones"]'::jsonb, 5, true),
  ('ia-vision-par-ordinateur', 'ia', 'Vision par ordinateur', '["computer vision"]'::jsonb, 6, true),
  ('ia-nlp', 'ia', 'Traitement du langage', '["nlp"]'::jsonb, 7, true),
  ('ia-robotique', 'ia', 'Robotique', '["robot"]'::jsonb, 8, true),
  ('ia-automatisation', 'ia', 'Automatisation', '["automation","n8n"]'::jsonb, 9, true),
  ('ia-agents', 'ia', 'Agents autonomes', '["agents ia"]'::jsonb, 10, true),
  ('ia-image-generative', 'ia', 'Génération d''images', '["midjourney","stable diffusion"]'::jsonb, 11, true),
  ('ia-voix-synthese', 'ia', 'Synthèse vocale', '["tts","voix"]'::jsonb, 12, true),
  ('ia-data-science', 'ia', 'Data science', '["données"]'::jsonb, 13, true),
  ('ia-mlops', 'ia', 'MLOps', '[]'::jsonb, 14, true),
  ('ia-ethique-ia', 'ia', 'Éthique de l''IA', '[]'::jsonb, 15, true),
  ('ia-ia-locale', 'ia', 'IA locale', '["on device"]'::jsonb, 16, true),
  ('ia-no-code-ia', 'ia', 'IA sans code', '["no code"]'::jsonb, 17, true),
  ('ia-chatbots', 'ia', 'Chatbots', '["assistants"]'::jsonb, 18, true),
  ('dev-javascript', 'dev', 'JavaScript', '["js"]'::jsonb, 1, true),
  ('dev-python', 'dev', 'Python', '[]'::jsonb, 2, true),
  ('dev-web', 'dev', 'Développement web', '[]'::jsonb, 3, true),
  ('dev-front-end', 'dev', 'Front-end', '["frontend"]'::jsonb, 4, true),
  ('dev-back-end', 'dev', 'Back-end', '["backend"]'::jsonb, 5, true),
  ('dev-mobile-dev', 'dev', 'Développement mobile', '["ios","android"]'::jsonb, 6, true),
  ('dev-jeux-dev', 'dev', 'Développement de jeux', '["gamedev","unity","godot"]'::jsonb, 7, true),
  ('dev-devops', 'dev', 'DevOps', '[]'::jsonb, 8, true),
  ('dev-bases-de-donnees', 'dev', 'Bases de données', '["sql","postgres"]'::jsonb, 9, true),
  ('dev-api', 'dev', 'API', '[]'::jsonb, 10, true),
  ('dev-rust', 'dev', 'Rust', '[]'::jsonb, 11, true),
  ('dev-go', 'dev', 'Go', '[]'::jsonb, 12, true),
  ('dev-java', 'dev', 'Java', '[]'::jsonb, 13, true),
  ('dev-php', 'dev', 'PHP', '[]'::jsonb, 14, true),
  ('dev-typescript', 'dev', 'TypeScript', '["ts"]'::jsonb, 15, true),
  ('dev-cloud', 'dev', 'Cloud', '["aws","azure"]'::jsonb, 16, true),
  ('dev-tests', 'dev', 'Tests automatisés', '["tests"]'::jsonb, 17, true),
  ('dev-architecture', 'dev', 'Architecture logicielle', '[]'::jsonb, 18, true),
  ('dev-open-source-dev', 'dev', 'Contribution open source', '[]'::jsonb, 19, true),
  ('dev-freelance-dev', 'dev', 'Freelance tech', '[]'::jsonb, 20, true),
  ('dev-algorithmes', 'dev', 'Algorithmes', '["algo"]'::jsonb, 21, true),
  ('dev-securite-dev', 'dev', 'Sécurité applicative', '[]'::jsonb, 22, true),
  ('sciences-astronomie', 'sciences', 'Astronomie', '["astro","étoiles","télescope"]'::jsonb, 1, true),
  ('sciences-astrophysique', 'sciences', 'Astrophysique', '[]'::jsonb, 2, true),
  ('sciences-physique', 'sciences', 'Physique', '[]'::jsonb, 3, true),
  ('sciences-chimie', 'sciences', 'Chimie', '[]'::jsonb, 4, true),
  ('sciences-biologie', 'sciences', 'Biologie', '["bio"]'::jsonb, 5, true),
  ('sciences-geologie', 'sciences', 'Géologie', '["minéraux"]'::jsonb, 6, true),
  ('sciences-mathematiques', 'sciences', 'Mathématiques', '["maths"]'::jsonb, 7, true),
  ('sciences-neurosciences', 'sciences', 'Neurosciences', '["cerveau"]'::jsonb, 8, true),
  ('sciences-medecine', 'sciences', 'Médecine', '[]'::jsonb, 9, true),
  ('sciences-genetique', 'sciences', 'Génétique', '[]'::jsonb, 10, true),
  ('sciences-ecologie-science', 'sciences', 'Écologie scientifique', '[]'::jsonb, 11, true),
  ('sciences-meteorologie', 'sciences', 'Météorologie', '["météo"]'::jsonb, 12, true),
  ('sciences-paleontologie', 'sciences', 'Paléontologie', '["dinosaures","fossiles"]'::jsonb, 13, true),
  ('sciences-vulgarisation', 'sciences', 'Vulgarisation', '[]'::jsonb, 14, true),
  ('sciences-espace', 'sciences', 'Espace', '["spatial","fusée","nasa"]'::jsonb, 15, true),
  ('sciences-oceanographie', 'sciences', 'Océanographie', '[]'::jsonb, 16, true),
  ('sciences-botanique', 'sciences', 'Botanique', '[]'::jsonb, 17, true),
  ('sciences-microscopie', 'sciences', 'Microscopie', '[]'::jsonb, 18, true),
  ('sciences-statistiques', 'sciences', 'Statistiques', '["stats"]'::jsonb, 19, true),
  ('sciences-philosophie-sciences', 'sciences', 'Philosophie des sciences', '[]'::jsonb, 20, true),
  ('cuisine-patisserie', 'cuisine', 'Pâtisserie', '["pâtisser","gâteau"]'::jsonb, 1, true),
  ('cuisine-boulangerie', 'cuisine', 'Boulangerie', '["pain"]'::jsonb, 2, true),
  ('cuisine-viennoiserie', 'cuisine', 'Viennoiserie', '["croissant"]'::jsonb, 3, true),
  ('cuisine-chocolat', 'cuisine', 'Chocolat', '["chocolaterie"]'::jsonb, 4, true),
  ('cuisine-cuisine-italienne', 'cuisine', 'Cuisine italienne', '["pasta","pizza"]'::jsonb, 5, true),
  ('cuisine-cuisine-asiatique', 'cuisine', 'Cuisine asiatique', '["asiatique","wok"]'::jsonb, 6, true),
  ('cuisine-cuisine-japonaise', 'cuisine', 'Cuisine japonaise', '["sushi","ramen"]'::jsonb, 7, true),
  ('cuisine-cuisine-francaise', 'cuisine', 'Cuisine française', '["terroir"]'::jsonb, 8, true),
  ('cuisine-cuisine-indienne', 'cuisine', 'Cuisine indienne', '["curry"]'::jsonb, 9, true),
  ('cuisine-cuisine-orientale', 'cuisine', 'Cuisine orientale', '["couscous","tajine"]'::jsonb, 10, true),
  ('cuisine-street-food', 'cuisine', 'Street food', '[]'::jsonb, 11, true),
  ('cuisine-barbecue', 'cuisine', 'Barbecue', '["bbq","plancha","grillade"]'::jsonb, 12, true),
  ('cuisine-vegetarien', 'cuisine', 'Végétarien', '["végé"]'::jsonb, 13, true),
  ('cuisine-vegan', 'cuisine', 'Vegan', '["végétalien"]'::jsonb, 14, true),
  ('cuisine-sans-gluten', 'cuisine', 'Sans gluten', '[]'::jsonb, 15, true),
  ('cuisine-meal-prep', 'cuisine', 'Batch cooking', '["meal prep"]'::jsonb, 16, true),
  ('cuisine-fermentation', 'cuisine', 'Fermentation', '["kombucha","kimchi"]'::jsonb, 17, true),
  ('cuisine-conserves', 'cuisine', 'Conserves et bocaux', '[]'::jsonb, 18, true),
  ('cuisine-pain-au-levain', 'cuisine', 'Pain au levain', '["levain"]'::jsonb, 19, true),
  ('cuisine-glaces', 'cuisine', 'Glaces et sorbets', '[]'::jsonb, 20, true),
  ('cuisine-cocktails', 'cuisine', 'Cocktails', '["mixologie"]'::jsonb, 21, true),
  ('cuisine-cafe', 'cuisine', 'Café', '["coffee","espresso"]'::jsonb, 22, true),
  ('cuisine-the', 'cuisine', 'Thé', '["thé","infusion"]'::jsonb, 23, true),
  ('cuisine-epices', 'cuisine', 'Épices', '[]'::jsonb, 24, true),
  ('cuisine-poissons', 'cuisine', 'Poissons et fruits de mer', '[]'::jsonb, 25, true),
  ('cuisine-viandes', 'cuisine', 'Viandes', '[]'::jsonb, 26, true),
  ('cuisine-desserts', 'cuisine', 'Desserts', '[]'::jsonb, 27, true),
  ('cuisine-brunch', 'cuisine', 'Brunch', '[]'::jsonb, 28, true),
  ('oenologie-degustation', 'oenologie', 'Dégustation', '[]'::jsonb, 1, true),
  ('oenologie-vins-rouges', 'oenologie', 'Vins rouges', '[]'::jsonb, 2, true),
  ('oenologie-vins-blancs', 'oenologie', 'Vins blancs', '[]'::jsonb, 3, true),
  ('oenologie-champagne', 'oenologie', 'Champagne et bulles', '[]'::jsonb, 4, true),
  ('oenologie-biere-artisanale', 'oenologie', 'Bière artisanale', '["craft","bière"]'::jsonb, 5, true),
  ('oenologie-brassage', 'oenologie', 'Brassage amateur', '["brasser"]'::jsonb, 6, true),
  ('oenologie-whisky', 'oenologie', 'Whisky', '[]'::jsonb, 7, true),
  ('oenologie-rhum', 'oenologie', 'Rhum', '[]'::jsonb, 8, true),
  ('oenologie-cocktails-spiritueux', 'oenologie', 'Cocktails et spiritueux', '[]'::jsonb, 9, true),
  ('oenologie-accords-mets-vins', 'oenologie', 'Accords mets et vins', '[]'::jsonb, 10, true),
  ('oenologie-viticulture', 'oenologie', 'Viticulture', '["vigne","vendanges"]'::jsonb, 11, true),
  ('oenologie-cave', 'oenologie', 'Cave et conservation', '[]'::jsonb, 12, true),
  ('oenologie-sommellerie', 'oenologie', 'Sommellerie', '["sommelier"]'::jsonb, 13, true),
  ('oenologie-spiritueux-francais', 'oenologie', 'Spiritueux français', '["cognac","armagnac"]'::jsonb, 14, true),
  ('bricolage-renovation', 'bricolage', 'Rénovation', '["rénover","travaux"]'::jsonb, 1, true),
  ('bricolage-peinture-murale', 'bricolage', 'Peinture murale', '[]'::jsonb, 2, true),
  ('bricolage-plomberie', 'bricolage', 'Plomberie', '[]'::jsonb, 3, true),
  ('bricolage-electricite', 'bricolage', 'Électricité', '[]'::jsonb, 4, true),
  ('bricolage-carrelage', 'bricolage', 'Carrelage', '[]'::jsonb, 5, true),
  ('bricolage-parquet', 'bricolage', 'Parquet et sols', '[]'::jsonb, 6, true),
  ('bricolage-isolation', 'bricolage', 'Isolation', '[]'::jsonb, 7, true),
  ('bricolage-meubles-diy', 'bricolage', 'Meubles faits maison', '["diy meuble"]'::jsonb, 8, true),
  ('bricolage-decoration', 'bricolage', 'Décoration', '["déco"]'::jsonb, 9, true),
  ('bricolage-home-staging', 'bricolage', 'Home staging', '[]'::jsonb, 10, true),
  ('bricolage-amenagement', 'bricolage', 'Aménagement', '[]'::jsonb, 11, true),
  ('bricolage-rangement', 'bricolage', 'Rangement et organisation', '[]'::jsonb, 12, true),
  ('bricolage-jardin-terrasse', 'bricolage', 'Terrasse et extérieur', '[]'::jsonb, 13, true),
  ('bricolage-outillage', 'bricolage', 'Outillage', '["outils"]'::jsonb, 14, true),
  ('bricolage-recuperation', 'bricolage', 'Récup et upcycling', '[]'::jsonb, 15, true),
  ('bricolage-palettes', 'bricolage', 'Palettes', '[]'::jsonb, 16, true),
  ('bricolage-luminaires', 'bricolage', 'Luminaires', '[]'::jsonb, 17, true),
  ('bricolage-papier-peint', 'bricolage', 'Papier peint', '[]'::jsonb, 18, true),
  ('bricolage-salle-de-bain', 'bricolage', 'Salle de bain', '[]'::jsonb, 19, true),
  ('bricolage-cuisine-amenagement', 'bricolage', 'Cuisine aménagée', '[]'::jsonb, 20, true),
  ('bricolage-tiny-house', 'bricolage', 'Tiny house', '[]'::jsonb, 21, true),
  ('bricolage-autoconstruction', 'bricolage', 'Auto-construction', '[]'::jsonb, 22, true),
  ('jardinage-potager', 'jardinage', 'Potager', '["légumes"]'::jsonb, 1, true),
  ('jardinage-permaculture', 'jardinage', 'Permaculture', '[]'::jsonb, 2, true),
  ('jardinage-plantes-interieur', 'jardinage', 'Plantes d''intérieur', '["plantes vertes"]'::jsonb, 3, true),
  ('jardinage-succulentes', 'jardinage', 'Succulentes et cactus', '["cactus"]'::jsonb, 4, true),
  ('jardinage-bonsai', 'jardinage', 'Bonsaï', '[]'::jsonb, 5, true),
  ('jardinage-verger', 'jardinage', 'Verger et fruitiers', '[]'::jsonb, 6, true),
  ('jardinage-compost', 'jardinage', 'Compost', '["composter"]'::jsonb, 7, true),
  ('jardinage-semis', 'jardinage', 'Semis et bouturage', '["bouture"]'::jsonb, 8, true),
  ('jardinage-jardin-japonais', 'jardinage', 'Jardin japonais', '[]'::jsonb, 9, true),
  ('jardinage-aromatiques', 'jardinage', 'Plantes aromatiques', '["herbes"]'::jsonb, 10, true),
  ('jardinage-orchidees', 'jardinage', 'Orchidées', '[]'::jsonb, 11, true),
  ('jardinage-hydroponie', 'jardinage', 'Hydroponie', '[]'::jsonb, 12, true),
  ('jardinage-rosiers', 'jardinage', 'Rosiers', '["roses"]'::jsonb, 13, true),
  ('jardinage-arbustes', 'jardinage', 'Arbres et arbustes', '[]'::jsonb, 14, true),
  ('jardinage-gazon', 'jardinage', 'Pelouse et gazon', '[]'::jsonb, 15, true),
  ('jardinage-jardin-sec', 'jardinage', 'Jardin sec', '[]'::jsonb, 16, true),
  ('jardinage-balcon', 'jardinage', 'Balcon et petits espaces', '[]'::jsonb, 17, true),
  ('jardinage-serre', 'jardinage', 'Serre', '[]'::jsonb, 18, true),
  ('jardinage-greffage', 'jardinage', 'Greffage et taille', '[]'::jsonb, 19, true),
  ('jardinage-ecologie-jardin', 'jardinage', 'Jardin écologique', '["biodiversité"]'::jsonb, 20, true),
  ('animaux-chiens', 'animaux', 'Chiens', '["chien","toutou"]'::jsonb, 1, true),
  ('animaux-chats', 'animaux', 'Chats', '["chat"]'::jsonb, 2, true),
  ('animaux-education-canine', 'animaux', 'Éducation canine', '["dressage"]'::jsonb, 3, true),
  ('animaux-chevaux', 'animaux', 'Chevaux', '["cheval"]'::jsonb, 4, true),
  ('animaux-aquariophilie', 'animaux', 'Aquariophilie', '["aquarium","poissons"]'::jsonb, 5, true),
  ('animaux-terrariophilie', 'animaux', 'Terrariophilie', '["reptiles","terrarium"]'::jsonb, 6, true),
  ('animaux-oiseaux', 'animaux', 'Oiseaux', '[]'::jsonb, 7, true),
  ('animaux-rongeurs', 'animaux', 'Rongeurs', '["lapin","hamster"]'::jsonb, 8, true),
  ('animaux-apiculture', 'animaux', 'Apiculture', '["abeilles","ruche"]'::jsonb, 9, true),
  ('animaux-poules', 'animaux', 'Poules', '[]'::jsonb, 10, true),
  ('animaux-refuge', 'animaux', 'Refuges et adoption', '["adoption"]'::jsonb, 11, true),
  ('animaux-comportement-animal', 'animaux', 'Comportement animal', '["éthologie"]'::jsonb, 12, true),
  ('animaux-toilettage', 'animaux', 'Toilettage', '[]'::jsonb, 13, true),
  ('animaux-agility', 'animaux', 'Agility', '[]'::jsonb, 14, true),
  ('animaux-protection-animale', 'animaux', 'Protection animale', '[]'::jsonb, 15, true),
  ('animaux-faune-sauvage', 'animaux', 'Faune sauvage', '[]'::jsonb, 16, true),
  ('animaux-ornithologie', 'animaux', 'Ornithologie', '["observation des oiseaux"]'::jsonb, 17, true),
  ('animaux-elevage', 'animaux', 'Élevage', '[]'::jsonb, 18, true),
  ('animaux-veterinaire', 'animaux', 'Santé animale', '["véto"]'::jsonb, 19, true),
  ('animaux-nac', 'animaux', 'NAC', '["nouveaux animaux de compagnie"]'::jsonb, 20, true),
  ('peche-peche-en-mer', 'peche', 'Pêche en mer', '[]'::jsonb, 1, true),
  ('peche-peche-en-riviere', 'peche', 'Pêche en rivière', '[]'::jsonb, 2, true),
  ('peche-carpe', 'peche', 'Carpe', '[]'::jsonb, 3, true),
  ('peche-truite', 'peche', 'Truite', '[]'::jsonb, 4, true),
  ('peche-silure', 'peche', 'Silure', '[]'::jsonb, 5, true),
  ('peche-brochet', 'peche', 'Brochet et carnassiers', '["carnassier"]'::jsonb, 6, true),
  ('peche-mouche', 'peche', 'Pêche à la mouche', '["mouche"]'::jsonb, 7, true),
  ('peche-leurre', 'peche', 'Pêche aux leurres', '["leurre"]'::jsonb, 8, true),
  ('peche-surfcasting', 'peche', 'Surfcasting', '[]'::jsonb, 9, true),
  ('peche-peche-a-pied', 'peche', 'Pêche à pied', '[]'::jsonb, 10, true),
  ('peche-peche-sportive', 'peche', 'Pêche sportive', '[]'::jsonb, 11, true),
  ('peche-montage', 'peche', 'Montages et bas de ligne', '[]'::jsonb, 12, true),
  ('peche-materiel-peche', 'peche', 'Matériel', '["cannes","moulinet"]'::jsonb, 13, true),
  ('peche-no-kill', 'peche', 'No-kill', '[]'::jsonb, 14, true),
  ('litterature-romans', 'litterature', 'Romans', '[]'::jsonb, 1, true),
  ('litterature-polar', 'litterature', 'Polar et thriller', '["policier"]'::jsonb, 2, true),
  ('litterature-science-fiction', 'litterature', 'Science-fiction', '["sf"]'::jsonb, 3, true),
  ('litterature-fantasy', 'litterature', 'Fantasy', '["fantastique"]'::jsonb, 4, true),
  ('litterature-poesie', 'litterature', 'Poésie', '[]'::jsonb, 5, true),
  ('litterature-essais', 'litterature', 'Essais', '[]'::jsonb, 6, true)
on conflict (id) do update set
  passion_id = excluded.passion_id, label = excluded.label, synonyms = excluded.synonyms,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- spécialités 601 à 790 (sur 790)
insert into public.passion_specialties (id, passion_id, label, synonyms, sort_order, is_active) values
  ('litterature-biographie', 'litterature', 'Biographies', '[]'::jsonb, 7, true),
  ('litterature-bd-litterature', 'litterature', 'Bande dessinée', '[]'::jsonb, 8, true),
  ('litterature-manga', 'litterature', 'Manga', '[]'::jsonb, 9, true),
  ('litterature-classiques', 'litterature', 'Classiques', '[]'::jsonb, 10, true),
  ('litterature-club-lecture', 'litterature', 'Club de lecture', '[]'::jsonb, 11, true),
  ('litterature-ecriture', 'litterature', 'Écriture', '["écrire","écrivain"]'::jsonb, 12, true),
  ('litterature-ecriture-creative', 'litterature', 'Écriture créative', '[]'::jsonb, 13, true),
  ('litterature-nouvelle', 'litterature', 'Nouvelles', '[]'::jsonb, 14, true),
  ('litterature-roman-en-cours', 'litterature', 'Mon roman en cours', '[]'::jsonb, 15, true),
  ('litterature-edition', 'litterature', 'Édition', '[]'::jsonb, 16, true),
  ('litterature-auto-edition', 'litterature', 'Auto-édition', '[]'::jsonb, 17, true),
  ('litterature-librairie', 'litterature', 'Librairies', '[]'::jsonb, 18, true),
  ('litterature-bibliotheque', 'litterature', 'Bibliothèques', '[]'::jsonb, 19, true),
  ('litterature-litterature-jeunesse', 'litterature', 'Littérature jeunesse', '[]'::jsonb, 20, true),
  ('litterature-theatre-texte', 'litterature', 'Textes de théâtre', '[]'::jsonb, 21, true),
  ('litterature-philosophie', 'litterature', 'Philosophie', '["philo"]'::jsonb, 22, true),
  ('cinema-series', 'cinema', 'Séries', '["série","serie"]'::jsonb, 1, true),
  ('cinema-films-cultes', 'cinema', 'Films cultes', '[]'::jsonb, 2, true),
  ('cinema-cinema-francais', 'cinema', 'Cinéma français', '[]'::jsonb, 3, true),
  ('cinema-cinema-asiatique', 'cinema', 'Cinéma asiatique', '[]'::jsonb, 4, true),
  ('cinema-documentaires', 'cinema', 'Documentaires', '["docu"]'::jsonb, 5, true),
  ('cinema-animation', 'cinema', 'Animation', '[]'::jsonb, 6, true),
  ('cinema-horreur', 'cinema', 'Horreur', '["épouvante"]'::jsonb, 7, true),
  ('cinema-thriller', 'cinema', 'Thriller', '[]'::jsonb, 8, true),
  ('cinema-comedie-film', 'cinema', 'Comédie', '[]'::jsonb, 9, true),
  ('cinema-sf-film', 'cinema', 'Science-fiction', '[]'::jsonb, 10, true),
  ('cinema-festival', 'cinema', 'Festivals', '[]'::jsonb, 11, true),
  ('cinema-critique', 'cinema', 'Critique de films', '[]'::jsonb, 12, true),
  ('cinema-realisation', 'cinema', 'Réalisation', '[]'::jsonb, 13, true),
  ('cinema-courts-metrages', 'cinema', 'Courts-métrages', '[]'::jsonb, 14, true),
  ('cinema-streaming-series', 'cinema', 'Plateformes et streaming', '["netflix"]'::jsonb, 15, true),
  ('cinema-super-heros', 'cinema', 'Super-héros', '["marvel","dc"]'::jsonb, 16, true),
  ('cinema-studio-ghibli', 'cinema', 'Studio Ghibli', '["ghibli"]'::jsonb, 17, true),
  ('cinema-western', 'cinema', 'Western', '[]'::jsonb, 18, true),
  ('cinema-film-noir', 'cinema', 'Film noir', '[]'::jsonb, 19, true),
  ('cinema-cinema-independant', 'cinema', 'Cinéma indépendant', '[]'::jsonb, 20, true),
  ('podcast-true-crime', 'podcast', 'True crime', '["faits divers"]'::jsonb, 1, true),
  ('podcast-interviews', 'podcast', 'Interviews', '[]'::jsonb, 2, true),
  ('podcast-culture-podcast', 'podcast', 'Culture', '[]'::jsonb, 3, true),
  ('podcast-actualite-podcast', 'podcast', 'Actualité', '[]'::jsonb, 4, true),
  ('podcast-humour-podcast', 'podcast', 'Humour', '[]'::jsonb, 5, true),
  ('podcast-histoire-podcast', 'podcast', 'Histoire', '[]'::jsonb, 6, true),
  ('podcast-science-podcast', 'podcast', 'Science', '[]'::jsonb, 7, true),
  ('podcast-business-podcast', 'podcast', 'Business', '[]'::jsonb, 8, true),
  ('podcast-fiction-audio', 'podcast', 'Fiction audio', '[]'::jsonb, 9, true),
  ('podcast-radio', 'podcast', 'Radio', '[]'::jsonb, 10, true),
  ('podcast-creation-podcast', 'podcast', 'Créer son podcast', '[]'::jsonb, 11, true),
  ('podcast-montage-audio', 'podcast', 'Montage audio', '[]'::jsonb, 12, true),
  ('podcast-micro', 'podcast', 'Micro et matériel', '[]'::jsonb, 13, true),
  ('podcast-diffusion', 'podcast', 'Diffusion et audience', '[]'::jsonb, 14, true),
  ('actu-politique', 'actu', 'Politique', '[]'::jsonb, 1, true),
  ('actu-geopolitique', 'actu', 'Géopolitique', '[]'::jsonb, 2, true),
  ('actu-economie', 'actu', 'Économie', '[]'::jsonb, 3, true),
  ('actu-societe', 'actu', 'Société', '[]'::jsonb, 4, true),
  ('actu-medias', 'actu', 'Médias', '[]'::jsonb, 5, true),
  ('actu-journalisme', 'actu', 'Journalisme', '[]'::jsonb, 6, true),
  ('actu-environnement-actu', 'actu', 'Environnement', '[]'::jsonb, 7, true),
  ('actu-europe-actu', 'actu', 'Europe', '[]'::jsonb, 8, true),
  ('actu-international', 'actu', 'International', '[]'::jsonb, 9, true),
  ('actu-local', 'actu', 'Actualité locale', '[]'::jsonb, 10, true),
  ('actu-debat', 'actu', 'Débats', '[]'::jsonb, 11, true),
  ('actu-decryptage', 'actu', 'Décryptage', '[]'::jsonb, 12, true),
  ('actu-fact-checking', 'actu', 'Fact-checking', '["vérification"]'::jsonb, 13, true),
  ('actu-presse', 'actu', 'Presse écrite', '[]'::jsonb, 14, true),
  ('actu-opinion', 'actu', 'Tribunes et opinions', '[]'::jsonb, 15, true),
  ('actu-elections', 'actu', 'Élections', '[]'::jsonb, 16, true),
  ('histoire-antiquite', 'histoire', 'Antiquité', '["rome","grèce"]'::jsonb, 1, true),
  ('histoire-moyen-age', 'histoire', 'Moyen Âge', '["médiéval"]'::jsonb, 2, true),
  ('histoire-renaissance', 'histoire', 'Renaissance', '[]'::jsonb, 3, true),
  ('histoire-revolution', 'histoire', 'Révolution française', '[]'::jsonb, 4, true),
  ('histoire-premiere-guerre', 'histoire', 'Première Guerre mondiale', '["14-18"]'::jsonb, 5, true),
  ('histoire-seconde-guerre', 'histoire', 'Seconde Guerre mondiale', '["39-45"]'::jsonb, 6, true),
  ('histoire-histoire-locale', 'histoire', 'Histoire locale', '[]'::jsonb, 7, true),
  ('histoire-genealogie', 'histoire', 'Généalogie', '["arbre généalogique"]'::jsonb, 8, true),
  ('histoire-archeologie', 'histoire', 'Archéologie', '[]'::jsonb, 9, true),
  ('histoire-patrimoine', 'histoire', 'Patrimoine', '[]'::jsonb, 10, true),
  ('histoire-chateaux', 'histoire', 'Châteaux', '[]'::jsonb, 11, true),
  ('histoire-musees', 'histoire', 'Musées', '[]'::jsonb, 12, true),
  ('histoire-histoire-de-l-art', 'histoire', 'Histoire de l''art', '[]'::jsonb, 13, true),
  ('histoire-histoire-militaire', 'histoire', 'Histoire militaire', '[]'::jsonb, 14, true),
  ('histoire-egyptologie', 'histoire', 'Égyptologie', '["égypte"]'::jsonb, 15, true),
  ('histoire-prehistoire', 'histoire', 'Préhistoire', '[]'::jsonb, 16, true),
  ('histoire-histoire-contemporaine', 'histoire', 'Histoire contemporaine', '[]'::jsonb, 17, true),
  ('histoire-reconstitution', 'histoire', 'Reconstitution historique', '[]'::jsonb, 18, true),
  ('jeux-jeux-de-plateau', 'jeux', 'Jeux de plateau', '["board game"]'::jsonb, 1, true),
  ('jeux-jeux-de-cartes', 'jeux', 'Jeux de cartes', '[]'::jsonb, 2, true),
  ('jeux-jeux-de-role', 'jeux', 'Jeux de rôle', '["jdr","donjons et dragons"]'::jsonb, 3, true),
  ('jeux-echecs', 'jeux', 'Échecs', '["echecs","chess"]'::jsonb, 4, true),
  ('jeux-dames', 'jeux', 'Dames', '[]'::jsonb, 5, true),
  ('jeux-go', 'jeux', 'Go', '[]'::jsonb, 6, true),
  ('jeux-poker', 'jeux', 'Poker', '[]'::jsonb, 7, true),
  ('jeux-tarot', 'jeux', 'Tarot', '[]'::jsonb, 8, true),
  ('jeux-belote', 'jeux', 'Belote', '[]'::jsonb, 9, true),
  ('jeux-escape-game', 'jeux', 'Escape game', '[]'::jsonb, 10, true),
  ('jeux-enigmes', 'jeux', 'Énigmes', '[]'::jsonb, 11, true),
  ('jeux-jeux-cooperatifs', 'jeux', 'Jeux coopératifs', '["coop"]'::jsonb, 12, true),
  ('jeux-wargames', 'jeux', 'Wargames', '[]'::jsonb, 13, true),
  ('jeux-figurines', 'jeux', 'Figurines et peinture', '["warhammer"]'::jsonb, 14, true),
  ('jeux-puzzles', 'jeux', 'Puzzles', '[]'::jsonb, 15, true),
  ('jeux-quiz', 'jeux', 'Quiz et culture générale', '["blind test"]'::jsonb, 16, true),
  ('jeux-jeux-de-des', 'jeux', 'Jeux de dés', '[]'::jsonb, 17, true),
  ('jeux-murder-party', 'jeux', 'Murder party', '[]'::jsonb, 18, true),
  ('yoga-hatha', 'yoga', 'Hatha yoga', '[]'::jsonb, 1, true),
  ('yoga-vinyasa', 'yoga', 'Vinyasa', '[]'::jsonb, 2, true),
  ('yoga-ashtanga', 'yoga', 'Ashtanga', '[]'::jsonb, 3, true),
  ('yoga-yin', 'yoga', 'Yin yoga', '[]'::jsonb, 4, true),
  ('yoga-yoga-nidra', 'yoga', 'Yoga nidra', '[]'::jsonb, 5, true),
  ('yoga-meditation', 'yoga', 'Méditation', '["méditer"]'::jsonb, 6, true),
  ('yoga-pleine-conscience', 'yoga', 'Pleine conscience', '["mindfulness"]'::jsonb, 7, true),
  ('yoga-respiration', 'yoga', 'Respiration', '["cohérence cardiaque"]'::jsonb, 8, true),
  ('yoga-pilates', 'yoga', 'Pilates', '[]'::jsonb, 9, true),
  ('yoga-sophrologie', 'yoga', 'Sophrologie', '[]'::jsonb, 10, true),
  ('yoga-relaxation', 'yoga', 'Relaxation', '[]'::jsonb, 11, true),
  ('yoga-massage', 'yoga', 'Massage', '[]'::jsonb, 12, true),
  ('yoga-spa', 'yoga', 'Spa et thermalisme', '[]'::jsonb, 13, true),
  ('yoga-aromatherapie', 'yoga', 'Aromathérapie', '["huiles essentielles"]'::jsonb, 14, true),
  ('yoga-sommeil', 'yoga', 'Sommeil', '[]'::jsonb, 15, true),
  ('yoga-gestion-stress', 'yoga', 'Gestion du stress', '[]'::jsonb, 16, true),
  ('yoga-qi-gong', 'yoga', 'Qi gong', '[]'::jsonb, 17, true),
  ('yoga-tai-chi', 'yoga', 'Tai-chi', '[]'::jsonb, 18, true),
  ('yoga-etirements', 'yoga', 'Étirements', '[]'::jsonb, 19, true),
  ('yoga-retraite', 'yoga', 'Retraites et stages', '[]'::jsonb, 20, true),
  ('sante-nutrition', 'sante', 'Nutrition', '[]'::jsonb, 1, true),
  ('sante-alimentation-equilibree', 'sante', 'Alimentation équilibrée', '[]'::jsonb, 2, true),
  ('sante-jeune-intermittent', 'sante', 'Jeûne intermittent', '["jeûne"]'::jsonb, 3, true),
  ('sante-sport-sante', 'sante', 'Sport santé', '[]'::jsonb, 4, true),
  ('sante-prevention', 'sante', 'Prévention', '[]'::jsonb, 5, true),
  ('sante-sante-mentale', 'sante', 'Santé mentale', '[]'::jsonb, 6, true),
  ('sante-therapie', 'sante', 'Thérapies', '["psy"]'::jsonb, 7, true),
  ('sante-addictions', 'sante', 'Addictions et sevrage', '["arrêter de fumer"]'::jsonb, 8, true),
  ('sante-sommeil-sante', 'sante', 'Sommeil et récupération', '[]'::jsonb, 9, true),
  ('sante-hydratation', 'sante', 'Hydratation', '[]'::jsonb, 10, true),
  ('sante-complements', 'sante', 'Compléments alimentaires', '[]'::jsonb, 11, true),
  ('sante-medecine-douce', 'sante', 'Médecines douces', '[]'::jsonb, 12, true),
  ('sante-phytotherapie', 'sante', 'Phytothérapie', '["plantes médicinales"]'::jsonb, 13, true),
  ('sante-dietetique', 'sante', 'Diététique', '[]'::jsonb, 14, true),
  ('sante-perte-de-poids', 'sante', 'Perte de poids', '["maigrir","régime"]'::jsonb, 15, true),
  ('sante-sante-femme', 'sante', 'Santé de la femme', '[]'::jsonb, 16, true),
  ('sante-premiers-secours', 'sante', 'Premiers secours', '["psc1"]'::jsonb, 17, true),
  ('sante-don-du-sang', 'sante', 'Don du sang', '[]'::jsonb, 18, true),
  ('entrepreneuriat-creation-entreprise', 'entrepreneuriat', 'Création d''entreprise', '[]'::jsonb, 1, true),
  ('entrepreneuriat-freelance', 'entrepreneuriat', 'Freelance', '["indépendant"]'::jsonb, 2, true),
  ('entrepreneuriat-startup', 'entrepreneuriat', 'Startup', '[]'::jsonb, 3, true),
  ('entrepreneuriat-e-commerce', 'entrepreneuriat', 'E-commerce', '["boutique en ligne"]'::jsonb, 4, true),
  ('entrepreneuriat-marketing', 'entrepreneuriat', 'Marketing', '[]'::jsonb, 5, true),
  ('entrepreneuriat-reseaux-sociaux', 'entrepreneuriat', 'Réseaux sociaux', '["social media"]'::jsonb, 6, true),
  ('entrepreneuriat-personal-branding', 'entrepreneuriat', 'Personal branding', '[]'::jsonb, 7, true),
  ('entrepreneuriat-vente', 'entrepreneuriat', 'Vente', '[]'::jsonb, 8, true),
  ('entrepreneuriat-levee-de-fonds', 'entrepreneuriat', 'Levée de fonds', '[]'::jsonb, 9, true),
  ('entrepreneuriat-gestion', 'entrepreneuriat', 'Gestion et compta', '["comptabilité"]'::jsonb, 10, true),
  ('entrepreneuriat-no-code', 'entrepreneuriat', 'No-code', '[]'::jsonb, 11, true),
  ('entrepreneuriat-side-project', 'entrepreneuriat', 'Side project', '[]'::jsonb, 12, true),
  ('entrepreneuriat-productivite', 'entrepreneuriat', 'Productivité', '[]'::jsonb, 13, true),
  ('entrepreneuriat-negociation', 'entrepreneuriat', 'Négociation', '[]'::jsonb, 14, true),
  ('entrepreneuriat-strategie', 'entrepreneuriat', 'Stratégie', '[]'::jsonb, 15, true),
  ('entrepreneuriat-artisanat-business', 'entrepreneuriat', 'Vivre de son artisanat', '[]'::jsonb, 16, true),
  ('entrepreneuriat-association', 'entrepreneuriat', 'Association', '["asso"]'::jsonb, 17, true),
  ('entrepreneuriat-franchise', 'entrepreneuriat', 'Franchise', '[]'::jsonb, 18, true),
  ('finance-bourse', 'finance', 'Bourse', '["actions"]'::jsonb, 1, true),
  ('finance-epargne', 'finance', 'Épargne', '[]'::jsonb, 2, true),
  ('finance-immobilier', 'finance', 'Immobilier', '[]'::jsonb, 3, true),
  ('finance-budget', 'finance', 'Budget', '[]'::jsonb, 4, true),
  ('finance-retraite-finance', 'finance', 'Retraite', '[]'::jsonb, 5, true),
  ('finance-fiscalite', 'finance', 'Fiscalité', '["impôts"]'::jsonb, 6, true),
  ('finance-independance-financiere', 'finance', 'Indépendance financière', '["fire"]'::jsonb, 7, true),
  ('finance-etf', 'finance', 'ETF', '[]'::jsonb, 8, true),
  ('finance-assurance-vie', 'finance', 'Assurance-vie', '[]'::jsonb, 9, true),
  ('finance-credit', 'finance', 'Crédit', '[]'::jsonb, 10, true),
  ('finance-immobilier-locatif', 'finance', 'Immobilier locatif', '["locatif"]'::jsonb, 11, true),
  ('finance-education-financiere', 'finance', 'Éducation financière', '[]'::jsonb, 12, true),
  ('finance-frugalite', 'finance', 'Frugalité', '["minimalisme"]'::jsonb, 13, true),
  ('finance-revenus-passifs', 'finance', 'Revenus passifs', '[]'::jsonb, 14, true),
  ('finance-analyse-financiere', 'finance', 'Analyse financière', '[]'::jsonb, 15, true),
  ('finance-patrimoine', 'finance', 'Patrimoine', '[]'::jsonb, 16, true),
  ('parentalite-grossesse', 'parentalite', 'Grossesse', '[]'::jsonb, 1, true),
  ('parentalite-bebe', 'parentalite', 'Bébé', '["nourrisson"]'::jsonb, 2, true),
  ('parentalite-education', 'parentalite', 'Éducation', '[]'::jsonb, 3, true),
  ('parentalite-adolescence', 'parentalite', 'Adolescence', '["ado"]'::jsonb, 4, true),
  ('parentalite-activites-enfants', 'parentalite', 'Activités enfants', '[]'::jsonb, 5, true),
  ('parentalite-ecole', 'parentalite', 'École et scolarité', '[]'::jsonb, 6, true),
  ('parentalite-sorties-famille', 'parentalite', 'Sorties en famille', '[]'::jsonb, 7, true),
  ('parentalite-allaitement', 'parentalite', 'Allaitement', '[]'::jsonb, 8, true),
  ('parentalite-sommeil-enfant', 'parentalite', 'Sommeil de l''enfant', '[]'::jsonb, 9, true),
  ('parentalite-jeux-enfants', 'parentalite', 'Jeux et jouets', '[]'::jsonb, 10, true),
  ('parentalite-parent-solo', 'parentalite', 'Parent solo', '[]'::jsonb, 11, true),
  ('parentalite-famille-recomposee', 'parentalite', 'Famille recomposée', '[]'::jsonb, 12, true),
  ('parentalite-garde', 'parentalite', 'Modes de garde', '[]'::jsonb, 13, true),
  ('parentalite-alimentation-enfant', 'parentalite', 'Alimentation de l''enfant', '["diversification"]'::jsonb, 14, true),
  ('parentalite-developpement-enfant', 'parentalite', 'Développement de l''enfant', '[]'::jsonb, 15, true),
  ('parentalite-lecture-enfant', 'parentalite', 'Lecture aux enfants', '[]'::jsonb, 16, true)
on conflict (id) do update set
  passion_id = excluded.passion_id, label = excluded.label, synonyms = excluded.synonyms,
  sort_order = excluded.sort_order, is_active = excluded.is_active;

-- ── 4. Les sélections de l'utilisateur ─────────────────────────────────────
-- ⚠️ CE N'EST PAS UN PROFIL PAR PASSION (ADR-010 §7). Aucune identité, aucun
-- pseudo, aucun abonné : deux tables de liaison, rien d'autre. Le pseudo,
-- l'avatar, la bio et les abonnés restent sur l'unique ligne `profiles`.
--
-- `profiles.passions` (jsonb) n'est NI supprimée NI remplacée : elle reste la
-- vitrine publique et la sauvegarde relue au démarrage d'un appareil neuf. Ces
-- tables la doublent le temps de la transition ; laquelle des deux fait
-- autorité sera tranché par un lot ultérieur, une fois le catalogue validé.
create table if not exists public.user_passions (
  user_id    text not null,
  passion_id text not null references public.passions(id),
  sort_order int  not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, passion_id)
);
create index if not exists idx_user_passions_user on public.user_passions (user_id);
create index if not exists idx_user_passions_passion on public.user_passions (passion_id);

create table if not exists public.user_passion_specialties (
  user_id      text not null,
  specialty_id text not null,
  passion_id   text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, specialty_id),
  -- La spécialité ET sa passion, ensemble : impossible d'enregistrer
  -- « Enduro » sous « Cuisine ».
  constraint user_passion_specialties_paire_fk
    foreign key (specialty_id, passion_id)
    references public.passion_specialties (id, passion_id)
);
create index if not exists idx_user_pspec_user on public.user_passion_specialties (user_id);
create index if not exists idx_user_pspec_specialty on public.user_passion_specialties (specialty_id);
create index if not exists idx_user_pspec_passion on public.user_passion_specialties (passion_id);

-- ── 5. Classement facultatif du contenu ────────────────────────────────────
-- ⚠️ LA COHÉRENCE EST VÉRIFIÉE PAR LA BASE, PAS PAR LE CLIENT. La clé
-- étrangère porte sur le COUPLE `(specialty_id, passion_id)` : une
-- publication classée « Moto » ne peut pas porter la spécialité
-- « moto-enduro » d'une autre passion, ni « cuisine-patisserie ».
--
-- ⚠️ ET LA CONTRAINTE `check` EST INDISPENSABLE. En `match simple` — le
-- défaut — une clé étrangère composite dont UNE colonne est nulle est
-- considérée satisfaite SANS VÉRIFICATION. Une ligne portant
-- `specialty_id = 'moto-enduro'` et `passion_id = null` passerait donc la
-- clé étrangère : le `check` est la seule chose qui l'interdit.
alter table public.posts add column if not exists specialty_id text;
alter table public.posts drop constraint if exists posts_specialty_fk;
alter table public.posts add  constraint posts_specialty_fk
  foreign key (specialty_id, passion_id)
  references public.passion_specialties (id, passion_id) not valid;
alter table public.posts validate constraint posts_specialty_fk;
alter table public.posts drop constraint if exists posts_specialty_needs_passion;
alter table public.posts add  constraint posts_specialty_needs_passion
  check (specialty_id is null or passion_id is not null) not valid;
alter table public.posts validate constraint posts_specialty_needs_passion;
create index if not exists idx_posts_specialty on public.posts (specialty_id) where specialty_id is not null;

alter table public.stories add column if not exists specialty_id text;
alter table public.stories drop constraint if exists stories_specialty_fk;
alter table public.stories add  constraint stories_specialty_fk
  foreign key (specialty_id, passion_id)
  references public.passion_specialties (id, passion_id) not valid;
alter table public.stories validate constraint stories_specialty_fk;
alter table public.stories drop constraint if exists stories_specialty_needs_passion;
alter table public.stories add  constraint stories_specialty_needs_passion
  check (specialty_id is null or passion_id is not null) not valid;
alter table public.stories validate constraint stories_specialty_needs_passion;
create index if not exists idx_stories_specialty on public.stories (specialty_id) where specialty_id is not null;

alter table public.events add column if not exists specialty_id text;
alter table public.events drop constraint if exists events_specialty_fk;
alter table public.events add  constraint events_specialty_fk
  foreign key (specialty_id, passion_id)
  references public.passion_specialties (id, passion_id) not valid;
alter table public.events validate constraint events_specialty_fk;
alter table public.events drop constraint if exists events_specialty_needs_passion;
alter table public.events add  constraint events_specialty_needs_passion
  check (specialty_id is null or passion_id is not null) not valid;
alter table public.events validate constraint events_specialty_needs_passion;
create index if not exists idx_events_specialty on public.events (specialty_id) where specialty_id is not null;

-- ── 6. Row Level Security ──────────────────────────────────────────────────
-- LE CATALOGUE : lisible par l'application, écrit par PERSONNE.
-- Aucune policy insert/update/delete n'est créée. Avec la RLS active et
-- aucune policy d'écriture, `anon` et `authenticated` sont refusés — c'est
-- ce qui empêche un client, même authentifié, de fabriquer une passion ou
-- une spécialité, et donc de contourner la liste blanche.
alter table public.passion_universes enable row level security;
drop policy if exists passion_universes_select_all on public.passion_universes;
create policy passion_universes_select_all on public.passion_universes for select using (true);
alter table public.passion_specialties enable row level security;
drop policy if exists passion_specialties_select_all on public.passion_specialties;
create policy passion_specialties_select_all on public.passion_specialties for select using (true);

-- `passions` a déjà `passions_select_all` (2026-08-15) ; on la repose pour
-- que cette migration soit auto-portante si elle est rejouée sur une base neuve.
alter table public.passions enable row level security;
drop policy if exists passions_select_all on public.passions;
create policy passions_select_all on public.passions for select using (true);

-- LES SÉLECTIONS : chacun n'écrit que les siennes.
-- ⚠️ `auth.uid()::text` — la convention du dépôt : les colonnes
-- d'identifiant sont en `text`, pas en `uuid`. Comparer un `uuid` à un
-- `text` sans cast échoue à l'exécution, pas à la création de la policy.
--
-- ⚠️ `(select auth.uid())` et non `auth.uid()` : la forme non enveloppée est
-- réévaluée PAR LIGNE (initplan), ce que les migrations
-- `migration_rls_initplan_*` du dépôt ont déjà corrigé ailleurs.
alter table public.user_passions enable row level security;
drop policy if exists user_passions_select_own on public.user_passions;
create policy user_passions_select_own on public.user_passions for select using (user_id = (select auth.uid())::text);
drop policy if exists user_passions_insert_own on public.user_passions;
create policy user_passions_insert_own on public.user_passions for insert with check (user_id = (select auth.uid())::text);
drop policy if exists user_passions_update_own on public.user_passions;
create policy user_passions_update_own on public.user_passions for update using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
drop policy if exists user_passions_delete_own on public.user_passions;
create policy user_passions_delete_own on public.user_passions for delete using (user_id = (select auth.uid())::text);

alter table public.user_passion_specialties enable row level security;
drop policy if exists user_passion_specialties_select_own on public.user_passion_specialties;
create policy user_passion_specialties_select_own on public.user_passion_specialties for select using (user_id = (select auth.uid())::text);
drop policy if exists user_passion_specialties_insert_own on public.user_passion_specialties;
create policy user_passion_specialties_insert_own on public.user_passion_specialties for insert with check (user_id = (select auth.uid())::text);
drop policy if exists user_passion_specialties_update_own on public.user_passion_specialties;
create policy user_passion_specialties_update_own on public.user_passion_specialties for update using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
drop policy if exists user_passion_specialties_delete_own on public.user_passion_specialties;
create policy user_passion_specialties_delete_own on public.user_passion_specialties for delete using (user_id = (select auth.uid())::text);

-- ⚠️ LA LECTURE EST VOLONTAIREMENT LIMITÉE À SOI. Les sélections d'un TIERS
-- ne passent pas par ces tables : elles restent servies par la vitrine
-- `profiles.passions`, déjà soumise aux règles de visibilité du profil
-- (compte privé, blocage). Ouvrir `user_passions` en lecture publique
-- court-circuiterait ces règles — un compte privé y verrait ses centres
-- d'intérêt exposés. À rouvrir seulement avec une policy qui rejoue la
-- visibilité de `profiles`, jamais avec `using (true)`.

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPOSITION AU DATA API (à vérifier après application)
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public'
--      and tablename in ('passion_universes','passion_specialties',
--                        'user_passions','user_passion_specialties');
--   -> rowsecurity doit valoir true sur les quatre.
--
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' and tablename like 'passion%'
--       or tablename like 'user_passion%' order by tablename, cmd;
--   -> catalogue : SELECT seulement. Sélections : 4 policies, toutes
--      ancrées sur auth.uid().
--
-- RETOUR ARRIÈRE COMPLET (aucune donnée de contenu perdue : `specialty_id`
-- vaut `null` partout tant que le lot n'a pas tourné en production)
--   begin;
--     alter table public.posts drop constraint if exists posts_specialty_fk;
--     alter table public.posts drop constraint if exists posts_specialty_needs_passion;
--     drop index if exists public.idx_posts_specialty;
--     alter table public.posts drop column if exists specialty_id;
--     alter table public.stories drop constraint if exists stories_specialty_fk;
--     alter table public.stories drop constraint if exists stories_specialty_needs_passion;
--     drop index if exists public.idx_stories_specialty;
--     alter table public.stories drop column if exists specialty_id;
--     alter table public.events drop constraint if exists events_specialty_fk;
--     alter table public.events drop constraint if exists events_specialty_needs_passion;
--     drop index if exists public.idx_events_specialty;
--     alter table public.events drop column if exists specialty_id;
--     drop table if exists public.user_passion_specialties;
--     drop table if exists public.user_passions;
--     drop table if exists public.passion_specialties;
--     alter table public.passions drop constraint if exists passions_universe_fk;
--     alter table public.passions drop column if exists universe_id;
--     alter table public.passions drop column if exists synonyms;
--     alter table public.passions drop column if exists popular;
--     alter table public.passions drop column if exists is_active;
--     delete from public.passions where id not in (
--       'musique', 'photo', 'voyage', 'cuisine', 'sport', 'litterature', 'cinema', 'tech', 'art', 'jardinage', 'metier', 'jeuxvideo', 'yoga', 'mode', 'danse', 'podcast', 'moto', 'animaux', 'actu'
--     );   -- refusé par la clé étrangère si une publication en référence une
--     drop table if exists public.passion_universes;
--   commit;
-- ⚠️ Le `delete` ci-dessus ne rend PAS leur `sort_order` d'origine aux 19
--    canoniques : rejouer `migrations/migration_passions_referentiel.sql`
--    le fait, et c'est le seul geste restant.
-- ═══════════════════════════════════════════════════════════════════════════
