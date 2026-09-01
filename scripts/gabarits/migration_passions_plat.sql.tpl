-- ═══════════════════════════════════════════════════════════════════════════
-- RÉFÉRENTIEL PLAT DES PASSIONS — migration ADDITIVE, IDEMPOTENTE, RÉVERSIBLE
--
--   %%NB_PASSIONS%% passions · %%NB_ALIAS%% alias · %%NB_RELATIONS%% relations
--   empreinte du référentiel : %%EMPREINTE%%
--
-- ⚠️ FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
--    Source : data/passions/*.js  ·  Générateur : npm run passions:construire
--    `npm run passions:verifier` échoue si le fichier et la source divergent.
--
-- ⚠️ NON APPLIQUÉE EN PRODUCTION. Elle attend la validation visuelle de la
--    preview. Tant qu'elle n'est pas passée, l'application fonctionne sur le
--    référentiel local (lecture seule) et REFUSE de publier sous une passion
--    que le serveur ne connaît pas — voir `estPassionCanonique` (app-02).
--
-- ───────────────────────────────────────────────────────────────────────────
-- CE QUE CETTE MIGRATION NE FAIT PAS, ET POURQUOI
--
-- ⛔ Aucune table `passion_universes`, aucune `passion_specialties`, aucune
--    colonne `specialty_id`. La décision produit du 2026-09-01 est qu'il n'y a
--    QU'UN SEUL NIVEAU : « Enduro » est une passion, au même rang que « Moto ».
--    Un lien plus général existe, mais dans `passion_relations` — invisible,
--    et jamais un passage obligé.
--
-- ⛔ Aucun DROP, aucun DELETE, aucun TRUNCATE, aucun renommage de colonne.
--    Les 19 identifiants historiques (`musique`, `photo`, `voyage`, `cuisine`,
--    `sport`, `litterature`, `cinema`, `tech`, `art`, `jardinage`, `metier`,
--    `jeuxvideo`, `yoga`, `mode`, `danse`, `podcast`, `moto`, `animaux`,
--    `actu`) sont mis à jour sur place et gardent `source = 'legacy'` : ils
--    sont référencés par clé étrangère depuis posts, stories, events,
--    conversations et profiles. En perdre un casserait toutes les publications
--    qui le portent.
--
-- ⛔ Elle ne touche pas `profiles.passions` (jsonb). La table normalisée
--    `user_passions` est CRÉÉE et remplie par l'application au fil de l'eau ;
--    le jsonb reste la source de vérité tant que la bascule n'est pas décidée.
--    Deux écritures, une seule lecture faisant foi : c'est le seul moyen de
--    revenir en arrière sans perdre les choix des comptes existants.
--
-- ⚠️ SI UNE MIGRATION HIÉRARCHIQUE A DÉJÀ ÉTÉ APPLIQUÉE quelque part (lot
--    TAXO-1, PR #231), la section 7 la neutralise SANS RIEN DÉTRUIRE : les
--    spécialités deviennent des passions à part entière (leurs identifiants
--    sont les mêmes), et les tables hiérarchiques sont laissées en place,
--    simplement plus lues par personne.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══ 0. NORMALISATION ══════════════════════════════════════════════════════
-- ⚠️ DÉFINIE EN PREMIER, ET C'EST NÉCESSAIRE : la section 2 s'en sert dans son
-- filet de rattrapage. Tout est dans une seule transaction — une fonction
-- créée plus bas n'existerait pas encore au moment de cet UPDATE.
--
-- ⚠️ POURQUOI PAS `unaccent()` : l'extension n'est pas garantie disponible, et
-- sa fonction n'est pas IMMUTABLE (elle dépend d'un dictionnaire chargeable),
-- donc pas indexable. `normalized_label` est calculé une fois par le
-- générateur et STOCKÉ ; cette fonction n'est qu'un repli pour les lignes
-- antérieures et pour la recherche serveur.
create or replace function public.unaccent_immutable(txt text)
returns text language sql immutable strict as $$
  select translate(
    lower(txt),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
    'aaaaaaceeeeiiiinooooouuuuyyoa'
  );
$$;

-- ═══ 1. EXTENSION DE LA TABLE EXISTANTE `public.passions` ═══════════════════
-- `create table if not exists` : le socle du 2026-08-15 existe peut-être déjà
-- (id, emoji, label, color, sort_order). On ne le recrée pas, on l'étend.
create table if not exists public.passions (
  id         text primary key,
  emoji      text not null default '✨',
  label      text not null,
  color      text,
  sort_order int  not null default 0
);

alter table public.passions add column if not exists normalized_label text;
alter table public.passions add column if not exists aliases          text[] not null default '{}'::text[];
alter table public.passions add column if not exists status           text   not null default 'active';
alter table public.passions add column if not exists source           text   not null default 'legacy';
alter table public.passions add column if not exists is_broad         boolean not null default false;
alter table public.passions add column if not exists popularity       int    not null default 0;
alter table public.passions add column if not exists created_at       timestamptz not null default now();
alter table public.passions add column if not exists updated_at       timestamptz not null default now();

-- `emoji` était `not null` sans défaut : un insert sans emoji échouait.
alter table public.passions alter column emoji set default '✨';

-- ⚠️ Contraintes en NOT VALID puis VALIDATE : la pose est immédiate et ne
-- verrouille pas la table pendant la vérification de l'existant.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'passions_status_chk') then
    alter table public.passions add constraint passions_status_chk
      check (status in ('active', 'archived', 'pending')) not valid;
    alter table public.passions validate constraint passions_status_chk;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'passions_source_chk') then
    alter table public.passions add constraint passions_source_chk
      check (source in ('legacy', 'curated', 'imported', 'user_suggested')) not valid;
    alter table public.passions validate constraint passions_source_chk;
  end if;
end $$;

-- ═══ 2. LES DONNÉES ════════════════════════════════════════════════════════
-- ⚠️ `on conflict do update` PROTÈGE DEUX CHOSES : une passion archivée par un
-- opérateur reste archivée (on ne la ressuscite pas dans le dos de la
-- modération), et `source = 'legacy'` ne se dégrade jamais — c'est la marque
-- des 19 identifiants historiques.
%%INSERTS_PASSIONS%%

-- Filet : toute ligne antérieure sans `normalized_label` en reçoit un.
update public.passions
   set normalized_label = lower(regexp_replace(unaccent_immutable(label), '[^a-z0-9]+', ' ', 'g'))
 where normalized_label is null;

-- ═══ 3. RELATIONS SÉMANTIQUES — TECHNIQUES ET INVISIBLES ═══════════════════
-- ⚠️ Elles ne créent AUCUN niveau dans l'interface. Elles servent à suggérer,
-- jamais à filtrer, et rien à l'écran ne les nomme.
create table if not exists public.passion_relations (
  source_passion_id text not null references public.passions(id) on delete cascade,
  target_passion_id text not null references public.passions(id) on delete cascade,
  relation_type     text not null,
  weight            int  not null default 1,
  created_at        timestamptz not null default now(),
  primary key (source_passion_id, target_passion_id, relation_type),
  constraint passion_relations_type_chk check (relation_type in ('related', 'broader', 'narrower')),
  constraint passion_relations_pas_reflexive check (source_passion_id <> target_passion_id)
);

%%INSERTS_RELATIONS%%

-- ═══ 4. PASSIONS D'UN COMPTE — table normalisée, en DOUBLE ÉCRITURE ════════
-- ⚠️ `profiles.passions` (jsonb) reste la source de vérité de l'affichage.
-- Cette table est remplie en parallèle. Tant que la bascule n'est pas décidée,
-- perdre cette table ne perd RIEN : c'est ce qui rend le retour arrière sûr.
create table if not exists public.user_passions (
  user_id    text not null,
  passion_id text not null references public.passions(id) on delete cascade,
  position   int  not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, passion_id)
);

-- ═══ 5. DEMANDES D'AJOUT ═══════════════════════════════════════════════════
-- ⚠️ Une demande N'EST PAS une passion. Elle vit dans sa propre table, elle
-- n'entre jamais dans `public.passions`, et l'application refuse de publier
-- sous un identifiant qui n'est pas dans le référentiel — la clé étrangère de
-- `posts.passion_id` le refuserait de toute façon.
create table if not exists public.passion_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  label            text not null,
  normalized_label text not null,
  status           text not null default 'pending',
  resolved_passion_id text references public.passions(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint passion_requests_status_chk check (status in ('pending', 'approved', 'rejected', 'duplicate')),
  constraint passion_requests_label_chk check (char_length(label) between 2 and 60)
);

-- Une même personne ne dépose pas deux fois le même terme.
create unique index if not exists passion_requests_unique_par_personne
  on public.passion_requests (user_id, normalized_label);

-- ═══ 6. INDEX ══════════════════════════════════════════════════════════════
create index if not exists passions_normalized_idx  on public.passions (normalized_label);
create index if not exists passions_status_idx      on public.passions (status);
create index if not exists passions_popularity_idx  on public.passions (popularity desc);
create index if not exists passions_aliases_gin     on public.passions using gin (aliases);
create index if not exists passion_relations_src_idx on public.passion_relations (source_passion_id);
-- Index de RLS : les policies de la section 8 filtrent sur `user_id`.
create index if not exists user_passions_user_idx    on public.user_passions (user_id);
create index if not exists passion_requests_user_idx on public.passion_requests (user_id);
create index if not exists passion_requests_statut_idx on public.passion_requests (status, created_at desc);

-- ⚠️ `pg_trgm` sert UNIQUEMENT à la recherche approximative. S'il n'est pas
-- disponible, la migration continue : la recherche exacte, par préfixe et par
-- alias fonctionne sans lui, et `rechercher_passions` teste sa présence avant
-- de s'en servir. Une extension manquante ne doit pas faire échouer un
-- déploiement de référentiel.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception when others then
    raise notice 'pg_trgm indisponible (%). La recherche approximative sera désactivée.', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists passions_trgm_idx on public.passions using gin (normalized_label gin_trgm_ops)';
  end if;
end $$;

-- ═══ 7. NEUTRALISATION D'UNE ÉVENTUELLE MIGRATION HIÉRARCHIQUE ═════════════
-- Corrective et ADDITIVE : si le lot TAXO-1 (PR #231) a été appliqué sur une
-- base, ses `passion_specialties` portent EXACTEMENT les identifiants que la
-- section 2 vient d'insérer comme passions à part entière. Il n'y a donc rien
-- à convertir — seulement à cesser de lire les tables hiérarchiques, qu'on
-- laisse en place plutôt que de détruire des données.
do $$
declare n int;
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'passion_specialties') then
    select count(*) into n from public.passion_specialties s
      where not exists (select 1 from public.passions p where p.id = s.id);
    raise notice 'Modèle hiérarchique détecté. Spécialités sans équivalent plat : %. Les tables passion_universes/passion_specialties sont CONSERVÉES et ne sont plus lues.', n;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'posts' and column_name = 'specialty_id') then
    -- La colonne reste : la détruire perdrait un classement déjà écrit. Elle
    -- n'est simplement plus lue, et la section 2 garantit que sa valeur existe
    -- désormais aussi comme passion à part entière.
    raise notice 'posts.specialty_id existe. Colonne CONSERVÉE, plus lue par l''application.';
  end if;
end $$;

-- ═══ 8. RLS ════════════════════════════════════════════════════════════════
-- ⚠️ LE RÉFÉRENTIEL EST EN LECTURE SEULE POUR L'APPLICATION. Aucune policy
-- INSERT/UPDATE/DELETE sur `passions` ni sur `passion_relations` : c'est
-- exactement ce qui empêche un client d'inventer une passion, donc de
-- contourner la modération et de fabriquer des passions fantômes.
alter table public.passions          enable row level security;
alter table public.passion_relations enable row level security;
alter table public.user_passions     enable row level security;
alter table public.passion_requests  enable row level security;

drop policy if exists passions_select_all on public.passions;
create policy passions_select_all on public.passions
  for select using (true);

drop policy if exists passion_relations_select_all on public.passion_relations;
create policy passion_relations_select_all on public.passion_relations
  for select using (true);

-- `user_passions` : le propriétaire, et lui seul, en écriture.
-- ⚠️ La lecture est publique parce que les passions d'un compte sont DÉJÀ
-- publiques (elles s'affichent sous le pseudo, cf. `identitePassionsHTML`).
-- Restreindre ici et pas là donnerait une fausse impression de protection.
drop policy if exists user_passions_select_all on public.user_passions;
create policy user_passions_select_all on public.user_passions
  for select using (true);
drop policy if exists user_passions_insert_own on public.user_passions;
create policy user_passions_insert_own on public.user_passions
  for insert with check (user_id = auth.uid()::text);
drop policy if exists user_passions_update_own on public.user_passions;
create policy user_passions_update_own on public.user_passions
  for update using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
drop policy if exists user_passions_delete_own on public.user_passions;
create policy user_passions_delete_own on public.user_passions
  for delete using (user_id = auth.uid()::text);

-- `passion_requests` : chacun voit et crée SES demandes. Personne ne peut les
-- approuver depuis le client — le passage au référentiel se fait par migration
-- ou par un rôle opérateur (service_role), jamais par une session navigateur.
drop policy if exists passion_requests_select_own on public.passion_requests;
create policy passion_requests_select_own on public.passion_requests
  for select using (user_id = auth.uid()::text);
drop policy if exists passion_requests_insert_own on public.passion_requests;
create policy passion_requests_insert_own on public.passion_requests
  for insert with check (
    user_id = auth.uid()::text
    and status = 'pending'
    and resolved_passion_id is null
    -- Limitation de fréquence : 5 demandes par personne et par 24 h. Le
    -- contrôle vit dans la POLICY et non dans le client, sinon il ne contrôle
    -- rien : une requête REST directe s'en passerait.
    and (select count(*) from public.passion_requests r
          where r.user_id = auth.uid()::text
            and r.created_at > now() - interval '24 hours') < 5
  );
-- Pas de policy UPDATE ni DELETE : une demande déposée n'est plus modifiable
-- par son auteur. Sinon « status » deviendrait un champ que le client écrit.

-- ═══ 9. RECHERCHE SERVEUR ══════════════════════════════════════════════════
-- Recherche unique, plafonnée, ordonnée. Elle rend AU PLUS `lim` lignes.
-- ⚠️ SECURITY INVOKER (le défaut) : elle ne lit que `public.passions`, qui est
-- en select public. Lui donner SECURITY DEFINER n'apporterait rien et
-- ouvrirait une porte.
create or replace function public.rechercher_passions(q text, lim int default 20)
returns table (id text, label text, emoji text, color text, popularity int, score int)
language plpgsql stable as $$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
  trgm boolean := exists (select 1 from pg_extension where extname = 'pg_trgm');
begin
  if n = '' then
    return query
      select p.id, p.label, p.emoji, p.color, p.popularity, 0
        from public.passions p
       where p.status = 'active'
       order by p.popularity desc, p.sort_order
       limit least(greatest(coalesce(lim, 20), 1), 50);
    return;
  end if;
  return query
    select p.id, p.label, p.emoji, p.color, p.popularity,
           (case
              when p.normalized_label = n then 0
              when p.normalized_label like n || '%' then 10
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) = n) then 20
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) like n || '%') then 30
              when p.normalized_label like '%' || n || '%' then 40
              else 60
            end + case when p.is_broad then 5 else 0 end)::int as score
      from public.passions p
     where p.status = 'active'
       and (p.normalized_label like '%' || n || '%'
            or exists (select 1 from unnest(p.aliases) a
                        where public.unaccent_immutable(a) like '%' || n || '%')
            or (trgm and similarity(p.normalized_label, n) > 0.3))
     order by score, p.popularity desc, p.sort_order
     limit least(greatest(coalesce(lim, 20), 1), 50);
end $$;

-- ⚠️ `anon` et `authenticated` sont des rôles de la PLATEFORME Supabase. Sur un
-- PostgreSQL nu — celui d'un test, d'une preview, d'une réplique locale — ils
-- n'existent pas, et un `grant` inconditionnel fait échouer TOUTE la migration
-- (elle est dans une seule transaction). On accorde à ceux qui existent.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.rechercher_passions(text, int) to %I', r);
    else
      raise notice 'Rôle % absent : grant ignoré (base hors Supabase).', r;
    end if;
  end loop;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLES APRÈS APPLICATION — à exécuter et à LIRE
--
--   select count(*) from public.passions where status = 'active';
--     → attendu : %%NB_PASSIONS%%
--   select count(*) from public.passion_relations;
--     → attendu : %%NB_RELATIONS%%
--   select id from unnest(ARRAY['musique','photo','voyage','cuisine','sport',
--     'litterature','cinema','tech','art','jardinage','metier','jeuxvideo',
--     'yoga','mode','danse','podcast','moto','animaux','actu']) id
--     where id not in (select p.id from public.passions p);
--     → attendu : ZÉRO ligne. Une seule ligne ici = des publications cassées.
--   select * from public.rechercher_passions('enduro', 5);
--     → attendu : « Enduro » en première ligne, score 0.
--   select * from public.rechercher_passions('jogging', 5);
--     → attendu : « Course à pied » (correspondance par alias).
--
-- RETOUR ARRIÈRE (aucune donnée applicative détruite : ces tables ne portent
-- que du référentiel et des préférences répliquées depuis `profiles.passions`)
--
--   drop function if exists public.rechercher_passions(text, int);
--   drop table if exists public.passion_requests;
--   drop table if exists public.user_passions;
--   drop table if exists public.passion_relations;
--   -- `public.passions` n'est PAS supprimée : les 19 identifiants historiques
--   -- y sont référencés par clé étrangère. Pour revenir au socle du
--   -- 2026-08-15, retirer seulement les lignes ajoutées :
--   -- ⚠️ Ce DELETE échoue (23503) si une publication référence déjà l'une des
--   -- passions ajoutées — c'est le comportement voulu : on ne retire pas sous
--   -- les pieds d'un contenu son classement. Les passer en 'archived' plutôt
--   -- que les supprimer :
--   --   update public.passions set status = 'archived' where source <> 'legacy';
--   delete from public.passions where source <> 'legacy';
--   alter table public.passions drop column if exists normalized_label;
--   alter table public.passions drop column if exists aliases;
--   alter table public.passions drop column if exists status;
--   alter table public.passions drop column if exists source;
--   alter table public.passions drop column if exists is_broad;
--   alter table public.passions drop column if exists popularity;
-- ═══════════════════════════════════════════════════════════════════════════
