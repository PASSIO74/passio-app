-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- STICKER SONDAGE DES BOBINES (2026-11-27)
-- Le sticker 📊 des stories (`migration_story_sondage_2026-11-26.sql`) s'ouvre aux BOBINES. Une
-- bobine est une ligne de `public.posts` marquée `is_reel` ; son sticker vit dans `posts.overlays`
-- (`{"type":"sondage","q":…,"a":…,"b":…}`), comme celui d'une story dans `stories.overlays`.
-- Même contrat : chaque spectateur vote UNE fois, voit alors les pourcentages ; l'auteur voit les
-- pourcentages et QUI a voté quoi.
--
-- Une transaction, REJOUABLE, tableau de verdict en fin — il LÈVE si une seule ligne est en ECHEC :
-- rien n'est alors validé. Aucun prérequis client : un client qui ne connaît pas la table ne
-- l'appelle pas, et un client qui la connaît avant l'application lit 42P01 / PGRST205.
--
-- CE QUI CHANGE :
--   ① `bobine_sondage_votes` (post_id, user_id, choix 0|1, created_at) : un vote par compte et par
--      bobine, jamais modifié ni retiré (aucun droit UPDATE / DELETE). Écrit par son auteur, sur
--      une bobine qu'il VOIT, qui PORTE un sondage, et qui n'est pas la sienne. INSERT par colonne
--      `(post_id, choix)` : `user_id` et `created_at` prennent leur défaut (règle C-04).
--      Lu par le votant (le sien) et par l'AUTEUR DE LA BOBINE (hors comptes bloqués).
--   ② `bobine_sondage_resultats(_post_id)` : les comptes 0 / 1 et mon choix — rendus SEULEMENT à
--      qui a voté ou à l'auteur (on ne voit pas la tendance avant de voter).
--   Bornes : débit par compte (120 / minute), barrière de suppression de compte, compte suspendu —
--      comme `post_likes` et `story_sondage_votes`.
--
-- « UNE BOBINE QUE JE VOIS » — la règle n'est PAS recopiée, elle est LUE : `post_is_visible(text)`.
--   Mesuré en production le 2026-11-27 (canal ①, md5(prosrc) e11c546d027e91a98519e646244b3085,
--   définition de `migration_activites_privees_visiteur_2026-11-27.sql`) : elle rend, pour un
--   compte, exactement le ET des quatre policies de lecture de `posts` —
--     · « Lecture respectant les comptes prives » (permissive) : auteur, OU compte non privé, OU
--       `abonne_accepte_non_bloque(author_id)` (`follows.status = 'accepted'`, aucun blocage) ;
--     · « Masquage apres signalements » (restrictive) : auteur OU `not post_masque(id)` ;
--     · `posts_lecture_hors_blocage` (restrictive, authenticated) : auteur OU
--       `not publication_masquee_pour_moi(id)` — blocage dans les DEUX sens avec l'auteur, activité
--       portée ou citée masquée ou PRIVÉE pour moi ;
--     · `posts_privee_lecture_anon` (restrictive, anon) : sans objet ici, un visiteur n'entre pas.
--   C'est déjà elle qui juge `post_likes` et `post_comments` (`post_likes_visibilite_insert`,
--   « Lecture selon visibilite du post »). Une règle de lecture ajoutée demain à `posts` y entre
--   (leçon du 2026-11-27) et vaut alors ici sans migration. La GARDE refuse une base où elle ne
--   porte ni le compte privé, ni le blocage, ni le masquage.
--   ⚠️ `post_is_visible` rend VRAI pour un identifiant d'EXEMPLE absent de `posts` : les aides
--   ci-dessous exigent donc la LIGNE (sinon « exemple inexistant » et « bobine privée au même
--   identifiant » ne répondraient pas pareil — un oracle d'existence).
--
-- AUCUN ORACLE : `bobine_sondage_visible` et `bobine_est_a_moi` sont appelées par les policies,
--   donc exécutables en RPC par tout compte (la policy exige EXECUTE). Elles vérifient la
--   visibilité DEDANS : bobine privée, bloquée, masquée, sans sondage, pas une bobine, identifiant
--   inconnu → la MÊME réponse (faux ; `null` pour les résultats ; 42501 pour un vote).
--
-- MESURÉ EN PRODUCTION AVANT D'ÉCRIRE (canal ①, 2026-11-27) : `posts.id` et `profiles.id` sont
--   `text` ; `posts.is_reel boolean`, `posts.overlays jsonb` ; un client ne peut modifier QUE
--   `posts.content` (ni `is_reel`, ni `overlays` : le sondage voté ne change pas après coup —
--   ligne de verdict) ; aucune table de `public` n'est publiée en temps réel ; ni la table ni les
--   fonctions de ce fichier n'existent.
--
-- RÉSIDUS ASSUMÉS (les mêmes que `story_sondage_votes`) :
--   · table NON publiée en temps réel (les résultats se relisent à l'ouverture) ;
--   · le votant relit SA ligne même après avoir perdu la vue de la bobine (bloqué, désabonné) :
--     elle lui dit que la bobine existe encore — comme son « j'aime » dans `post_likes` ;
--   · le score d'un spectateur exclut les comptes en blocage avec LUI (même filtre que la liste
--     de l'auteur) : deux spectateurs peuvent lire deux totaux ;
--   · votes hors export de compte, emportés par les clés étrangères à la suppression.
--
-- RETOUR ARRIÈRE (éditeur SQL ; la table d'abord : ses policies tiennent les fonctions) :
--| begin;
--| drop function if exists public.bobine_sondage_resultats(text);
--| drop table if exists public.bobine_sondage_votes;
--| drop function if exists public.bobine_sondage_visible(text);
--| drop function if exists public.bobine_est_a_moi(text);
--| commit;
-- État d'arrivée attendu : `to_regclass('public.bobine_sondage_votes')` nul, aucune fonction
-- `bobine_%` dans `public`.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;
-- La clé étrangère prend un verrou sur `posts` et `profiles` : une table occupée fait ÉCHOUER la
-- migration au lieu de retenir les écritures de la production.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── GARDE : les aides de production dont tout dépend ─────────────────────────────────────────────
do $garde$
declare
  def text;
begin
  if to_regprocedure('public.post_is_visible(text)') is null
     or to_regprocedure('public.is_blocked_with(text)') is null
     or to_regprocedure('public.suppression_de_mon_compte()') is null
     or to_regprocedure('public.debit_par_compte()') is null
     or to_regprocedure('public.refuser_ecriture_compte_en_suppression()') is null then
    raise exception 'bobine_sondage : une aide de production manque (post_is_visible, is_blocked_with, suppression_de_mon_compte, debit_par_compte, refuser_ecriture_compte_en_suppression)';
  end if;
  -- La visibilité est DÉLÉGUÉE : elle doit porter le compte privé, le blocage et le masquage.
  def := pg_get_functiondef('public.post_is_visible(text)'::regprocedure);
  if def not like '%abonne_accepte_non_bloque(p.author_id)%'
     or def not like '%publication_masquee_pour_moi(p.id)%'
     or def not like '%post_masque(p.id)%' then
    raise exception 'bobine_sondage : post_is_visible n''a pas la définition attendue (compte privé, blocage, masquage) — relire la production avant d''y adosser le vote';
  end if;
end
$garde$;

-- ── La bobine est-elle à moi ? ───────────────────────────────────────────────────────────────────
-- SECURITY DEFINER : lue par la policy de lecture des votes. Ne dit que ce que l'appelant sait
-- déjà (ses propres bobines) ; FAUX sans compte, pour un identifiant nul ou inconnu.
create or replace function public.bobine_est_a_moi(_post_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _post_id is null then false else exists (
    select 1 from public.posts p
     where p.id = _post_id and p.is_reel is true and p.author_id = (auth.uid())::text
  ) end
$fn$;
revoke all on function public.bobine_est_a_moi(text) from public, anon;
grant execute on function public.bobine_est_a_moi(text) to authenticated;

-- ── Est-ce une bobine à sondage QUE JE VOIS ? ────────────────────────────────────────────────────
-- ⚠️ Visibilité vérifiée DEDANS : la policy l'appelle avec les droits de l'appelant (EXECUTE
-- requis), donc tout compte peut l'appeler en RPC. Sans cette garde, elle dirait qu'une bobine
-- PRIVÉE existe et porte un sondage (red team du sondage des stories, 2026-11-26).
-- La LIGNE est exigée (`post_is_visible` seule dit VRAI d'un identifiant d'exemple absent).
-- Le blocage avec l'auteur est relu ICI, sur la ligne, en plus de `post_is_visible` — comme
-- `post_likes` porte `post_auteur_bloque` ET `post_is_visible`.
create or replace function public.bobine_sondage_visible(_post_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case when auth.uid() is null or _post_id is null then false else
    exists (
      select 1 from public.posts p
       where p.id = _post_id
         and p.is_reel is true
         and not public.is_blocked_with(p.author_id)
         and exists (
           select 1 from jsonb_array_elements(
                    case when jsonb_typeof(p.overlays) = 'array' then p.overlays else '[]'::jsonb end) e
            where e ->> 'type' = 'sondage'))
    and public.post_is_visible(_post_id)
  end
$fn$;
revoke all on function public.bobine_sondage_visible(text) from public, anon;
grant execute on function public.bobine_sondage_visible(text) to authenticated;

-- ── ① Les votes ──────────────────────────────────────────────────────────────────────────────────
-- Clés ALIGNÉES sur la production : `posts.id text`, `profiles.id text`. `on delete cascade` des
-- deux côtés : une bobine supprimée emporte ses votes, un profil purgé emporte les siens
-- (exception déclarée dans `scripts/audit-tables-compte.js`).
create table if not exists public.bobine_sondage_votes (
  post_id    text not null references public.posts(id) on delete cascade,
  user_id    text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  choix      smallint not null constraint bobine_sondage_votes_choix check (choix in (0, 1)),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists bobine_sondage_votes_user_idx on public.bobine_sondage_votes (user_id);
alter table public.bobine_sondage_votes enable row level security;
-- Les privilèges par défaut dépendent de QUI crée la table (mesuré le 2026-11-27 : rien pour anon
-- ni authenticated sous `postgres`, TOUT sous `supabase_admin`) : on retire d'abord, quel que soit
-- le créateur, puis on ne rend que la lecture et l'INSERT de deux colonnes.
revoke all on public.bobine_sondage_votes from public, anon, authenticated;
grant select on public.bobine_sondage_votes to authenticated;
grant insert (post_id, choix) on public.bobine_sondage_votes to authenticated;

drop policy if exists bobine_sondage_votes_select on public.bobine_sondage_votes;
create policy bobine_sondage_votes_select on public.bobine_sondage_votes for select to authenticated
  using (user_id = (select auth.uid())::text
         or (public.bobine_est_a_moi(post_id) and not public.is_blocked_with(user_id)));
drop policy if exists bobine_sondage_votes_insert on public.bobine_sondage_votes;
create policy bobine_sondage_votes_insert on public.bobine_sondage_votes for insert to authenticated
  with check (user_id = (select auth.uid())::text
              and public.bobine_sondage_visible(post_id)
              and not public.bobine_est_a_moi(post_id)
              and not public.suppression_de_mon_compte());

drop trigger if exists trg_debit_compte on public.bobine_sondage_votes;
create trigger trg_debit_compte before insert on public.bobine_sondage_votes
  for each row execute function public.debit_par_compte('120');
drop trigger if exists zz_barriere_suppression on public.bobine_sondage_votes;
create trigger zz_barriere_suppression before insert or update on public.bobine_sondage_votes
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');

-- ── ② Les résultats ──────────────────────────────────────────────────────────────────────────────
-- `null` : pas de compte, ou pas une bobine à sondage que je vois (privée, bloquée, masquée,
-- inconnue : la même réponse). `{a_vote:false}` : je la vois, je n'ai pas voté, elle n'est pas à
-- moi. Sinon les comptes — hors comptes en blocage avec moi, comme la liste que l'auteur lit.
create or replace function public.bobine_sondage_resultats(_post_id text) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null or not public.bobine_sondage_visible(_post_id) then null
    when not public.bobine_est_a_moi(_post_id)
         and not exists (select 1 from public.bobine_sondage_votes v
                          where v.post_id = _post_id and v.user_id = (auth.uid())::text)
      then jsonb_build_object('a_vote', false)
    else (
      select jsonb_build_object(
               'a_vote', true,
               'mon_choix', (select m.choix from public.bobine_sondage_votes m
                              where m.post_id = _post_id and m.user_id = (auth.uid())::text),
               'a', count(*) filter (where v.choix = 0),
               'b', count(*) filter (where v.choix = 1))
        from public.bobine_sondage_votes v
       where v.post_id = _post_id and not public.is_blocked_with(v.user_id))
  end
$fn$;
revoke all on function public.bobine_sondage_resultats(text) from public, anon;
grant execute on function public.bobine_sondage_resultats(text) to authenticated;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
create temp table _verdict_bobine_sondage on commit drop as
select * from (values
  (1, 'bobine_sondage_votes : RLS active, 2 policies (lecture, insertion), aucune autre',
     (select relrowsecurity from pg_class where oid = 'public.bobine_sondage_votes'::regclass)
     and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'bobine_sondage_votes') = 2
     and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'bobine_sondage_votes'
           and roles = '{authenticated}' and permissive = 'PERMISSIVE'
           and ((policyname = 'bobine_sondage_votes_select' and cmd = 'SELECT')
             or (policyname = 'bobine_sondage_votes_insert' and cmd = 'INSERT'))) = 2),
  (2, 'aucun UPDATE, DELETE ni TRUNCATE pour authenticated, sur aucune colonne',
     not has_table_privilege('authenticated', 'public.bobine_sondage_votes', 'update')
     and not has_table_privilege('authenticated', 'public.bobine_sondage_votes', 'delete')
     and not has_table_privilege('authenticated', 'public.bobine_sondage_votes', 'truncate')
     and not has_any_column_privilege('authenticated', 'public.bobine_sondage_votes', 'update')),
  (3, 'INSERT limité à (post_id, choix) : user_id et created_at ne se fournissent pas',
     has_column_privilege('authenticated', 'public.bobine_sondage_votes', 'post_id', 'insert')
     and has_column_privilege('authenticated', 'public.bobine_sondage_votes', 'choix', 'insert')
     and not has_column_privilege('authenticated', 'public.bobine_sondage_votes', 'user_id', 'insert')
     and not has_column_privilege('authenticated', 'public.bobine_sondage_votes', 'created_at', 'insert')
     and not has_table_privilege('authenticated', 'public.bobine_sondage_votes', 'insert')),
  (4, 'anon et public : aucun droit sur la table, aucune des trois fonctions',
     not has_table_privilege('anon', 'public.bobine_sondage_votes', 'select, insert, update, delete, truncate, references, trigger')
     and not has_any_column_privilege('anon', 'public.bobine_sondage_votes', 'select, insert, update, references')
     and not has_table_privilege('public', 'public.bobine_sondage_votes', 'select, insert, update, delete, truncate, references, trigger')
     and not has_function_privilege('anon', 'public.bobine_sondage_resultats(text)', 'execute')
     and not has_function_privilege('anon', 'public.bobine_sondage_visible(text)', 'execute')
     and not has_function_privilege('anon', 'public.bobine_est_a_moi(text)', 'execute')
     and not has_function_privilege('public', 'public.bobine_sondage_resultats(text)', 'execute')
     and not has_function_privilege('public', 'public.bobine_sondage_visible(text)', 'execute')
     and not has_function_privilege('public', 'public.bobine_est_a_moi(text)', 'execute')),
  (5, 'les trois fonctions : SECURITY DEFINER, search_path vide, exécutables par authenticated',
     (select count(*) from pg_proc p
       where p.oid in ('public.bobine_sondage_resultats(text)'::regprocedure,
                       'public.bobine_sondage_visible(text)'::regprocedure,
                       'public.bobine_est_a_moi(text)'::regprocedure)
         and p.prosecdef and p.proconfig @> array['search_path=""']
         and has_function_privilege('authenticated', p.oid, 'execute')) = 3),
  (6, 'clés : (post_id, user_id) primaire ; posts(id) et profiles(id) en ON DELETE CASCADE ; choix 0|1',
     (select count(*) from pg_constraint c
       where c.conrelid = 'public.bobine_sondage_votes'::regclass
         and ((c.contype = 'p' and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (post_id, user_id)')
           or (c.contype = 'f' and c.confrelid = 'public.posts'::regclass and c.confdeltype = 'c')
           or (c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'c')
           or (c.contype = 'c' and c.conname = 'bobine_sondage_votes_choix'))) = 4),
  (7, 'débit par compte et barrière de suppression posés',
     (select count(*) from pg_trigger t
       where t.tgrelid = 'public.bobine_sondage_votes'::regclass and not t.tgisinternal and t.tgenabled = 'O'
         and ((t.tgname = 'trg_debit_compte' and t.tgfoid = 'public.debit_par_compte()'::regprocedure)
           or (t.tgname = 'zz_barriere_suppression'
               and t.tgfoid = 'public.refuser_ecriture_compte_en_suppression()'::regprocedure))) = 2),
  (8, 'table hors de toute publication (temps réel compris)',
     not exists (select 1 from pg_publication_tables
                  where schemaname = 'public' and tablename = 'bobine_sondage_votes')),
  (9, 'la visibilité est celle de post_is_visible : compte privé, blocage, masquage',
     pg_get_functiondef('public.bobine_sondage_visible(text)'::regprocedure) like '%public.post_is_visible(_post_id)%'
     and pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%abonne_accepte_non_bloque(p.author_id)%'
     and pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%publication_masquee_pour_moi(p.id)%'
     and pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%post_masque(p.id)%'),
  (10, 'le sondage voté ne change pas : un client ne modifie ni posts.is_reel ni posts.overlays',
     not has_column_privilege('authenticated', 'public.posts', 'is_reel', 'update')
     and not has_column_privilege('authenticated', 'public.posts', 'overlays', 'update')
     and not has_column_privilege('anon', 'public.posts', 'is_reel', 'update')
     and not has_column_privilege('anon', 'public.posts', 'overlays', 'update'))
) as v(n, controle, ok_bool);

alter table _verdict_bobine_sondage add column valeur text;
update _verdict_bobine_sondage set valeur = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, valeur from _verdict_bobine_sondage order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_bobine_sondage where valeur is distinct from 'OK') then
    raise exception 'bobine_sondage : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ' order by n) from _verdict_bobine_sondage where valeur is distinct from 'OK');
  end if;
end
$verdict$;

commit;
