-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCAGE ET LECTURE DES ACTIVITÉS — SUITES DE LA RELECTURE ADVERSE (#1017)
-- (2026-11-22, après `migration_blocage_lecture_activites_2026-11-22.sql`,
-- appliquée au staging et en production le même jour)
--
-- `npm run migration:appliquer -- migrations/migration_blocage_lecture_activites_bis_2026-11-22.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict (19 lignes) LÈVE
-- si une seule ligne est en ECHEC : rien n'est alors validé. Aucun prérequis
-- client. PRÉREQUIS SERVEUR : la première migration (garde ci-dessous).
--
-- CE N'EST PAS UNE RÉGRESSION. Avant la première migration, un compte bloqué
-- lisait déjà TOUT ; celle-ci ferme ce que la première laissait ouvert.
--
-- QUATRE TROUS (relecture indépendante de la session « Stratégie de
-- simulation multi-compte », deux tours, mesurés ici) :
--
-- ① HOMONYMIE (bloquant, RV-45). Les identifiants de `posts`, `events`,
--    `post_comments` et `event_comments` sont CHOISIS par le client et ne sont
--    bornés que par leur forme. Or `comment_target_visible` et
--    `fil_temps_reel_visible` devinent le TYPE d'une cible d'après la table
--    où son identifiant existe. Un homonyme forgé y entre donc par la porte
--    de l'autre table : Kevin publie un post à l'identifiant de l'activité de
--    Léa et lit ses réponses (et `diffuser_interaction` les lui pousse sur
--    `user:<Kevin>`) ; Z crée une ACTIVITÉ à l'identifiant d'une publication
--    privée et l'ouvre à tous. Changer l'ordre des branches ne fait que
--    retourner le trou (premier essai de cette bis, refusé en relecture).
--    LE REMÈDE : il n'y a plus d'homonyme. Le déclencheur
--    `zz_identifiant_sans_homonyme` refuse, à l'insertion et au changement
--    d'identifiant, un identifiant déjà présent dans l'une des trois autres
--    tables, OU encore porté par un fil ou une cible ORPHELINS — réponses,
--    réactions (`comment_interactions.post_id` / `.comment_id`), commentaires
--    et « j'aime » (`post_comments.post_id`, `post_likes.post_id`,
--    `comment_likes.comment_id`) restés après la suppression de leur ligne :
--    215 réponses sur 39 fils et 10 fils de commentaires ou « j'aime »
--    mesurés en production le 2026-11-22 ; un post neuf à l'un de ces
--    identifiants (dont d'anciens identifiants d'EXEMPLE devinables) les
--    rendait lisibles par son auteur, voire par tous — OU retiré
--    (`rencontres_prive.identifiants_retires`). Sous un verrou consultatif par
--    identifiant (deux insertions concurrentes ne passent pas) ; « déjà dans
--    SA table » se lit sous `FOR KEY SHARE` : une suppression EN COURS de la
--    même ligne est attendue, puis les contrôles s'appliquent à l'état
--    validé (sinon la réinsertion d'une activité qu'on supprime passait,
--    fil orphelin compris). SQLSTATE
--    DÉDIÉ `PT409` (HTTP 409) : le client prend un 23505 pour « déjà en
--    base » (`supaPublishEvent`), un homonyme forgé ne doit jamais passer pour
--    un succès ; un REJEU dans la même table laisse répondre la clé primaire
--    (`<table>_pkey`, reconnu par `_conflitClePrimaire`). Un VISITEUR sans
--    compte est refusé AVANT tout contrôle, en 42501 comme la RLS : sinon
--    « pris » contre « refusé » lui dirait qu'un identifiant existe, même
--    privé (anon a le privilège INSERT sur posts, post_comments,
--    event_comments) — et une future policy d'écriture anonyme ne rouvrirait
--    pas l'homonymie. Une RÉACTION à mon propre commentaire arrivée avant lui
--    (`ci_visibilite_insert` juge par le fil) ne le refuse pas.
--    Mesuré le 2026-11-22 : 0 homonyme en production comme au staging ; la
--    garde le revérifie. `comment_target_visible` n'est PAS réécrite :
--    sans homonyme, son ordre d'origine (#951 : la publication avant
--    l'activité) est juste.
-- ② REPARTAGE À DEUX NIVEAUX. Hugo republie la carte d'Inès, qui partage
--    l'activité de Léa : son `shared_data` recopie le TEXTE de la carte
--    (titre, ville, heure). La première migration ne regardait que l'AUTEUR
--    de la publication citée ; elle applique désormais la règle entière à la
--    publication citée. (La phrase « le texte stocké du second ne cite
--    que… » de l'en-tête de la première migration était FAUSSE.)
-- ③ FILS DE DISCUSSION. `post_is_visible` ignorait le blocage pour un compte
--    public : sous la carte de Léa (`post_ev_<activité>`), sous une carte, un
--    album ou un repartage masqués, Kevin lisait commentaires, j'aime,
--    interactions, compteurs (`fil_compteurs`) et le canal `fil:`. Elle
--    applique désormais la même règle que la lecture de `posts`.
-- ④ L'ORGANISATRICE ne lisait plus ce qu'un compte qu'ELLE a bloqué avait
--    laissé sur SA propre activité : elle doit pouvoir le voir pour le
--    modérer. Seulement dans ce sens : un organisateur BLOQUÉ par l'auteur
--    d'un commentaire ne le relit pas (troisième relecture : la v2 le lui
--    rendait, régression). Même règle pour les RÉPONSES et RÉACTIONS
--    (`comment_interactions`) et les « j'aime » de commentaires
--    (`comment_likes`) d'un compte en blocage avec moi : je ne les lis plus,
--    sauf sur MON fil (activité ou publication) quand c'est moi qui ai bloqué.
--    La même règle entre dans `interactions_cibles` (#1023, SECURITY DEFINER,
--    appliquée en production le 2026-11-22) : c'est par elle que le client LIT
--    les réactions et réponses ; sans elle, la policy ne fermait que la
--    lecture directe de l'API.
--    PORTÉE : commentaires d'ACTIVITÉ, réactions d'activité, réponses et
--    « j'aime » de commentaires. PAS les commentaires de premier niveau ni
--    les « j'aime » d'une PUBLICATION (`post_comments`, `post_likes`) sur le
--    fil d'un TIERS — voir « reste hors lot ».
--
-- UNE DÉFINITION : `publication_masquee_pour_moi(id)` — l'auteur est en
-- blocage avec moi, OU l'activité portée (album, carte) est masquée pour moi,
-- OU la publication citée l'est (même règle, un niveau : un repartage de
-- repartage ne recopie que « A partagé une publication de … »). FAUX d'emblée
-- sans compte (aucun coût pour un visiteur). Lue par la policy de `posts` et
-- par `post_is_visible` — donc par `comment_target_visible`,
-- `fil_temps_reel_visible`, `fil_compteurs` et les lectures de
-- `post_comments` / `post_likes` / `comment_interactions` / `comment_likes`.
-- Appelable en RPC par un compte (EXECUTE à authenticated, jamais anon) : elle
-- dit si une publication est masquée POUR L'APPELANT — rien que la lecture de
-- `posts` et `post_auteur_bloque` / `is_blocked_with` ne lui disent déjà.
--
-- VERROUS. `CREATE POLICY` / `CREATE TRIGGER` prennent un verrou fort sur
-- `posts`, `events` et les commentaires : `lock_timeout` 3 s,
-- `statement_timeout` 30 s — une table occupée fait ÉCHOUER la migration.
--
-- TEMPS RÉEL. Aucune table n'est publiée (verdict ⑫) ; la policy
-- `realtime.passio_rt_recevoir_fil` passe par `comment_target_visible`
-- (verdict ⑪) : sans homonyme, la règle qui la ferme ici la ferme là.
--
-- RESTE HORS LOT (déclaré) :
--   · la lecture ANONYME des activités et publications publiques (clé anon) ;
--   · une carte CITÉE SUPPRIMÉE : `shared_from_post_id` n'a pas de clé
--     étrangère, et le repost de Hugo garde le texte recopié de la carte
--     d'Inès. Une fois cette carte supprimée, rien ne relie plus le repost à
--     l'activité de Léa : il redevient lisible par Kevin. Le fermer demande
--     de neutraliser `shared_data` des repartages à la suppression de
--     l'original — changement de produit (village A24), autre lot ;
--   · `participants_compte` (des nombres) ; une notification déjà écrite ;
--   · une expression régulière et un `JSON.parse` peuvent diverger sur un
--     `shared_data` forgé à deux clés `id` (le forgeur est l'auteur du post,
--     il ne cache que son propre contenu) ;
--   · `events.id` reste modifiable par l'organisateur (`posts.id` ne l'est
--     plus depuis #888, `post_comments.id` est figé, `event_comments` n'a pas
--     de policy UPDATE) : jamais vers un homonyme ;
--   · REJOUER APRÈS CETTE BIS `migration_capacite_lectures_groupees_2026-11-22.sql`
--     échoue (sa garde compare les règles de lecture de comment_interactions,
--     qui en ont une de plus) et écraserait `interactions_cibles` sans le
--     blocage : elle est appliquée ; ne pas la rejouer telle quelle ;
--   · REJOUER APRÈS CETTE BIS les épreuves embarquées de
--     `migration_epingle_commentaire_2026-11-05.sql` et de
--     `migration_publications_supprimees_2026-11-04.sql` échoue : elles
--     insèrent des homonymes exprès, que le déclencheur refuse (PT409). Ces
--     migrations sont appliquées ; ne pas les rejouer telles quelles ;
--   · `events.id` est FIGÉ par le déclencheur (un renommage libérait l'ancien
--     identifiant sans le retirer : Z le recréait et héritait des cartes qui le
--     citent). Pas par un `revoke update (id)` : le client met à jour une
--     activité en envoyant sa ligne ENTIÈRE, identifiant compris
--     (`supaUpdateEvent`, app-08) — inchangé, il passe ;
--   · la DIFFUSION temps réel d'une interaction (`diffuser_interaction`, sur
--     `fil:<id>`) et les réactions agrégées par `fil_compteurs` (SECURITY
--     DEFINER) ne regardent pas le blocage entre lecteur et AUTEUR de la
--     réaction (seulement la visibilité du fil) : un emoji ou un GIF d'un
--     compte bloqué peut encore s'y montrer — autre lot ;
--   · les COMMENTAIRES DE PREMIER NIVEAU et les « j'aime » d'une publication
--     (`post_comments`, `post_likes`) écrits par un compte en blocage avec moi,
--     sur le fil d'un TIERS, restent lisibles (leurs policies ne regardent que
--     `post_is_visible`), et `diffuser_commentaire_publication` les pousse sur
--     `fil:`. Ex. : Léa bloque Kevin ; sous la carte d'activité de Hugo, Léa
--     écrit « j'arrive à 18h au parking » ; Kevin le lit. Lot suivant : une
--     restrictive sur `post_comments` calquée sur `event_comments`, MAIS avec
--     la branche du propriétaire du fil valable DANS LES DEUX SENS (sinon,
--     quand Kevin bloque Léa, elle ne voit plus son insulte et ne peut plus la
--     supprimer : `post_comments_delete_auteur_publication` exige la lecture) ;
--   · l'identifiant DÉTERMINISTE d'une carte d'activité (`post_ev_<id>`) peut
--     être occupé d'avance dans `post_comments`, `event_comments`, ou comme
--     `comment_interactions.comment_id` sous un fil visible
--     (`ci_visibilite_insert` juge par le fil), pendant les 7 jours de
--     `rattraperActivitesAuFil` : la carte est alors refusée (PT409). Déni
--     limité à la carte automatique ;
--   · PT409 contre 23503 (`passion_id` invalide) dit, sans rien écrire, si un
--     identifiant existe quelque part — à un compte, jamais à un visiteur ;
--   · client : `_passioEchecPublication` est partagé entre publications (un
--     rejeu en PT409 peut classer « refusée » une publication neuve en panne
--     passagère) ; « Publie-la à nouveau » n'a pas de bouton et le média ne
--     survit pas au rechargement ; la file des commentaires réessaie un PT409
--     toutes les 15 s ;
--   · coût : `is_blocked_with` par ligne (piste : la liste des comptes en
--     blocage calculée une fois par requête, sans l'exposer) ;
--   · une activité RETIRÉE répond 23514 en production (`aa_rencontres_activite`
--     passe avant `zz_identifiant_sans_homonyme`), PT409 ailleurs ;
--   · 215 réponses et 10 fils orphelins restent en base (aucune lecture ne les
--     atteint sans un identifiant neuf égal, désormais refusé) : les purger est
--     une écriture de données (canal ②), décision de Benjamin.
--
-- RETOUR ARRIÈRE (éditeur SQL) — GARDÉ (il refuse si l'état en place n'est
-- pas celui que cette bis écrit), rend l'état laissé par la première
-- migration, octet pour octet :
--| begin;
--| set local lock_timeout = '3s';
--| set local statement_timeout = '30s';
--| do $retour$
--| begin
--|   if to_regprocedure('public.publication_masquee_pour_moi(text)') is null
--|      or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure) <> '3e3d52b23aac8d5e931d63f4a61288ee' then
--|     raise exception 'retour arrière refusé : l''état en place n''est pas celui qu''écrit la bis (post_is_visible ou publication_masquee_pour_moi)';
--|   end if;
--| end
--| $retour$;
--| drop policy if exists posts_lecture_hors_blocage on public.posts;
--| create policy posts_lecture_hors_blocage on public.posts
--|   as restrictive for select to authenticated
--|   using (
--|     author_id = (select auth.uid())::text
--|     or (
--|       not public.is_blocked_with(author_id)
--|       and (event_id is null or not public.activite_masquee_pour_moi(event_id))
--|       and (shared_from_post_id is null or not public.post_auteur_bloque(shared_from_post_id))
--|       and (shared_data is null or not public.activite_masquee_pour_moi(public.activite_de_partage(shared_data)))
--|     )
--|   );
--| drop policy if exists event_comments_lecture_hors_blocage on public.event_comments;
--| create policy event_comments_lecture_hors_blocage on public.event_comments
--|   as restrictive for select to authenticated
--|   using (
--|     author_id = (select auth.uid())::text
--|     or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(author_id))
--|   );
--| drop policy if exists event_reactions_lecture_hors_blocage on public.event_reactions;
--| create policy event_reactions_lecture_hors_blocage on public.event_reactions
--|   as restrictive for select to authenticated
--|   using (
--|     user_id = (select auth.uid())::text
--|     or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(user_id))
--|   );
--| CREATE OR REPLACE FUNCTION public.post_is_visible(pid text)
--|  RETURNS boolean
--|  LANGUAGE sql
--|  STABLE SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--|   select case
--|     when pid is null then false
--|     -- Pas de ligne posts : PUBLIC seulement pour un identifiant d'EXEMPLE (le contenu de
--|     -- démonstration du client n'est dans aucune table). Une publication SUPPRIMÉE, ou un
--|     -- identifiant inconnu, n'est visible par personne (R31, 2026-11-04 : rendait VRAI).
--|     when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
--|     else exists (
--|       select 1 from posts p
--|       where p.id = pid and (
--|         p.author_id = (select auth.uid())::text
--|         -- Même règle que la policy restrictive de `posts` : masquée, une publication ne se lit plus
--|         -- par ses commentaires ni par ses « j'aime », sauf pour son auteur.
--|         or (not public.post_masque(p.id) and (
--|               not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
--|               or public.abonne_accepte_non_bloque(p.author_id)))
--|       )
--|     )
--|   end
--| $function$;
--| drop policy if exists comment_interactions_lecture_hors_blocage on public.comment_interactions;
--| drop policy if exists comment_likes_lecture_hors_blocage on public.comment_likes;
--| CREATE OR REPLACE FUNCTION public.interactions_cibles(_comment_ids text[], _kinds text[] DEFAULT NULL::text[], _limite integer DEFAULT 1000)
--|  RETURNS TABLE(id text, comment_id text, post_id text, user_id text, kind text, payload text, created_at timestamp with time zone)
--|  LANGUAGE sql
--|  STABLE SECURITY DEFINER
--|  SET search_path TO ''
--| AS $function$
--|   with cibles as materialized (
--|     -- 300 identifiants au plus, dédupliqués, sans NULL, bornés APRÈS aplatissement.
--|     select distinct s.cid
--|       from (select u.cid from unnest(coalesce(_comment_ids, '{}'::text[])) with ordinality as u(cid, n)
--|              where u.cid is not null order by u.n limit 300) s
--|   ),
--|   lignes as (
--|     select i.id, i.comment_id, i.post_id, i.user_id, i.kind, i.payload, i.created_at
--|       from public.comment_interactions i
--|       join cibles c on c.cid = i.comment_id
--|      where _kinds is null or i.kind = any(_kinds)
--|   ),
--|   -- ⚠️ La règle de lecture, « user_id = moi OR comment_target_visible(comment_id, post_id) »,
--|   -- décidée ici pour chaque couple présent au lieu de l'être pour chaque ligne.
--|   fils as materialized (
--|     select d.comment_id, d.post_id, coalesce(public.comment_target_visible(d.comment_id, d.post_id), false) as visible
--|       from (select distinct l.comment_id, l.post_id from lignes l) d
--|   )
--|   select l.id, l.comment_id, l.post_id, l.user_id, l.kind, l.payload, l.created_at
--|     from lignes l
--|    where l.user_id = (select auth.uid())::text
--|       or exists (select 1 from fils f
--|                   where f.comment_id = l.comment_id and f.post_id is not distinct from l.post_id and f.visible)
--|    order by l.created_at, l.id
--|    limit greatest(1, least(coalesce(_limite, 1000), 1000));
--| $function$;
--| drop trigger if exists zz_identifiant_sans_homonyme on public.posts;
--| drop trigger if exists zz_identifiant_sans_homonyme on public.events;
--| drop trigger if exists zz_identifiant_sans_homonyme on public.post_comments;
--| drop trigger if exists zz_identifiant_sans_homonyme on public.event_comments;
--| drop function if exists public.identifiant_sans_homonyme();
--| drop function if exists public.publication_masquee_pour_moi(text);
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── Garde : prérequis, définitions mesurées, et aucun homonyme ─────────────
do $garde$
declare
  r record;
  n int := 0;
  h int;
begin
  if to_regprocedure('public.activite_masquee_pour_moi(text)') is null
     or to_regprocedure('public.activite_de_partage(text)') is null
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_lecture_hors_blocage') then
    raise exception 'prérequis absent : appliquer d''abord migration_blocage_lecture_activites_2026-11-22.sql';
  end if;
  for r in
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
           md5(replace(p.prosrc, chr(13), '')) as emp
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('comment_target_visible', 'post_is_visible', 'interactions_cibles')
  loop
    n := n + 1;
    if not (
         -- comment_target_visible : celles de la première migration, que cette bis NE réécrit PAS.
         (r.sig = 'comment_target_visible(cid text, pid text)' and r.emp = '3cf606d2b4bf8605e403643342c11f5d')
      or (r.sig = 'comment_target_visible(cid text)'           and r.emp = '0d830765c94045194263714b9b7f2bf9')
      or (r.sig = 'post_is_visible(pid text)'                  and r.emp in ('08d910fbe202c6aaa5e73dce487b6364', '3e3d52b23aac8d5e931d63f4a61288ee'))
      or (r.sig = 'interactions_cibles(_comment_ids text[], _kinds text[], _limite integer)'
                                                                and r.emp in ('25e050030451ee802007b063ae088f41', 'b85e5b725a7fbc1e8c4b424b9eb67178'))) then
      raise exception '% a changé depuis la mesure du 2026-11-22 (md5 %) : relire avant de réécrire', r.sig, r.emp;
    end if;
  end loop;
  if n <> 4 then
    raise exception '% définition(s) trouvée(s) parmi comment_target_visible(cid), comment_target_visible(cid, pid), post_is_visible(pid), interactions_cibles(…) : 4 attendues', n;
  end if;
  select count(*) into h from (
    select id from (select id from public.posts union all select id from public.events
                    union all select id from public.post_comments union all select id from public.event_comments) t
     group by id having count(*) > 1) d;
  if h > 0 then
    raise exception '% identifiant(s) homonyme(s) entre posts, events, post_comments et event_comments : les résoudre avant de poser le déclencheur', h;
  end if;
end
$garde$;

-- ── ① Plus d'homonyme entre les quatre tables ──────────────────────────────
-- SECURITY DEFINER : la ligne homonyme peut être invisible à l'appelant (une
-- publication privée), et c'est justement celle-là qu'il faut voir.
-- Verrou consultatif sur l'identifiant, pris par les quatre tables : deux
-- insertions concurrentes du même identifiant dans deux tables se
-- sérialisent, la seconde voit la première (nouvel instantané par requête).
create or replace function public.identifiant_sans_homonyme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if tg_op = 'UPDATE' and new.id is not distinct from old.id then
    return new;
  end if;
  -- Un visiteur sans compte : refusé AVANT tout contrôle, comme la RLS le ferait (42501). Un
  -- BEFORE passe avant la RLS : « identifiant pris » contre « refusé » serait un oracle
  -- d'existence, même d'une publication privée. Refuser par défaut : une future policy
  -- d'écriture anonyme ne rouvrirait pas l'homonymie.
  if current_setting('role', true) = 'anon' then
    raise exception using errcode = '42501',
      message = format('new row violates row-level security policy for table "%s"', tg_table_name);
  end if;
  -- L'identifiant d'une ACTIVITÉ est figé : un renommage libérerait l'ancien sans le retirer
  -- (`identifiants_retires`), et quiconque le recréerait hériterait des cartes qui le citent.
  -- Le client renvoie le même identifiant (sorti plus haut) : rien ne casse.
  if tg_op = 'UPDATE' and tg_table_name = 'events' then
    raise exception using errcode = 'PT409',
      message = 'identifiant d''activité figé',
      hint = 'BLOC-ACT bis : renommer une activité libérerait son identifiant sans le retirer.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('passio:identifiant:' || new.id, 0));
  -- Déjà dans SA table : un rejeu (ou un conflit de mise à jour). La clé primaire répond
  -- (`<table>_pkey`), que le client sait reconnaître comme « déjà en base ». FOR KEY SHARE :
  -- une SUPPRESSION en cours de cette ligne est attendue ; validée, la ligne n'est plus vue
  -- et les contrôles qui suivent s'appliquent (fil orphelin, identifiant retiré).
  execute format('select 1 from public.%I where id = $1 for key share', tg_table_name) using new.id;
  get diagnostics n = row_count;
  if n > 0 then
    return new;
  end if;
  if (tg_table_name <> 'posts'          and exists (select 1 from public.posts          where id = new.id))
  or (tg_table_name <> 'events'         and exists (select 1 from public.events         where id = new.id))
  or (tg_table_name <> 'post_comments'  and exists (select 1 from public.post_comments  where id = new.id))
  or (tg_table_name <> 'event_comments' and exists (select 1 from public.event_comments where id = new.id))
  -- Un fil ou une cible ORPHELINS : la ligne a disparu, ses réponses, réactions, commentaires
  -- et « j'aime » sont restés. Un identifiant neuf égal les rouvrirait (à son auteur, voire à
  -- tous). Une réaction de l'AUTEUR lui-même peut précéder son commentaire (le fil, pas la
  -- cible, juge l'écriture d'une interaction) : elle ne le refuse pas.
  or exists (select 1 from public.comment_interactions where post_id = new.id)
  or exists (select 1 from public.comment_interactions where comment_id = new.id and user_id is distinct from new.author_id)
  or exists (select 1 from public.comment_likes where comment_id = new.id)
  or exists (select 1 from public.post_comments where post_id = new.id)
  or exists (select 1 from public.post_likes where post_id = new.id) then
    raise exception using errcode = 'PT409',
      message = 'identifiant déjà utilisé par une autre publication, activité, commentaire ou fil',
      hint = 'BLOC-ACT bis : un identifiant est unique entre posts, events, post_comments et event_comments, fils orphelins compris (RV-45).';
  end if;
  -- Un identifiant d'activité RETIRÉ (supprimée) ne revient pas, sous aucune forme.
  if to_regclass('rencontres_prive.identifiants_retires') is not null then
    if exists (select 1 from rencontres_prive.identifiants_retires where event_id = new.id) then
      raise exception using errcode = 'PT409',
        message = 'identifiant retiré (activité supprimée)',
        hint = 'BLOC-ACT bis : un identifiant d''activité retiré ne se réutilise pas (RV-45).';
    end if;
  end if;
  return new;
end
$$;
comment on function public.identifiant_sans_homonyme() is
  'Refuse (PT409) un identifiant déjà présent dans posts, events, post_comments ou event_comments, porté par un fil orphelin ou retiré (RV-45 : comment_target_visible et fil_temps_reel_visible devinent le type d''une cible d''après sa table). Refuse un visiteur AVANT tout contrôle (42501, comme la RLS). Fige events.id. BLOC-ACT bis, 2026-11-22.';
revoke execute on function public.identifiant_sans_homonyme() from public, anon, authenticated;

drop trigger if exists aa_identifiant_sans_homonyme on public.posts;
drop trigger if exists zz_identifiant_sans_homonyme on public.posts;
create trigger zz_identifiant_sans_homonyme before insert or update of id on public.posts
  for each row execute function public.identifiant_sans_homonyme();
drop trigger if exists aa_identifiant_sans_homonyme on public.events;
drop trigger if exists zz_identifiant_sans_homonyme on public.events;
create trigger zz_identifiant_sans_homonyme before insert or update of id on public.events
  for each row execute function public.identifiant_sans_homonyme();
drop trigger if exists aa_identifiant_sans_homonyme on public.post_comments;
drop trigger if exists zz_identifiant_sans_homonyme on public.post_comments;
create trigger zz_identifiant_sans_homonyme before insert or update of id on public.post_comments
  for each row execute function public.identifiant_sans_homonyme();
drop trigger if exists aa_identifiant_sans_homonyme on public.event_comments;
drop trigger if exists zz_identifiant_sans_homonyme on public.event_comments;
create trigger zz_identifiant_sans_homonyme before insert or update of id on public.event_comments
  for each row execute function public.identifiant_sans_homonyme();

-- ── ② ③ La publication est-elle masquée pour l'appelant ? ──────────────────
-- SECURITY DEFINER : `posts` est filtrée pour l'appelant, `blocks` ne lui
-- montre que SES blocages. FAUX d'emblée sans compte, pour un identifiant nul
-- ou inconnu, et pour l'auteur. La publication CITÉE est jugée par la même
-- règle, écrite sur ses colonnes (un niveau).
create or replace function public.publication_masquee_pour_moi(p_post_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and p_post_id is not null and exists (
    select 1 from public.posts p
     where p.id = p_post_id
       and p.author_id is distinct from (select auth.uid())::text
       and (
         public.is_blocked_with(p.author_id)
         or (p.event_id is not null and public.activite_masquee_pour_moi(p.event_id))
         or (p.shared_data is not null and public.activite_masquee_pour_moi(public.activite_de_partage(p.shared_data)))
         or (p.shared_from_post_id is not null and exists (
               select 1 from public.posts c
                where c.id = p.shared_from_post_id
                  and c.author_id is distinct from (select auth.uid())::text
                  and (
                    public.is_blocked_with(c.author_id)
                    or (c.event_id is not null and public.activite_masquee_pour_moi(c.event_id))
                    or (c.shared_data is not null and public.activite_masquee_pour_moi(public.activite_de_partage(c.shared_data)))
                  )))
       )
  )
$$;
comment on function public.publication_masquee_pour_moi(text) is
  'La publication (son auteur, l''activité qu''elle porte, ou la publication qu''elle cite) est-elle en blocage avec l''appelant ? FAUX sans compte et pour son auteur. Ne dit rien que post_auteur_bloque / is_blocked_with ne disent déjà (BLOC-ACT bis, 2026-11-22).';
revoke execute on function public.publication_masquee_pour_moi(text) from public, anon;
grant execute on function public.publication_masquee_pour_moi(text) to authenticated, service_role;

-- ── posts : une seule règle, celle de l'aide ───────────────────────────────
drop policy if exists posts_lecture_hors_blocage on public.posts;
create policy posts_lecture_hors_blocage on public.posts
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or not public.publication_masquee_pour_moi(id)
  );

-- ── ④ event_comments / event_reactions : l'auteur et l'organisateur de
-- l'activité relisent ce qu'y a laissé un compte qu'ILS ont bloqué
-- (modération). Par `events` lue sous la RLS de l'appelant (ses propres
-- activités), pas par `organise_activite`, qui compterait un co-organisateur.
drop policy if exists event_comments_lecture_hors_blocage on public.event_comments;
create policy event_comments_lecture_hors_blocage on public.event_comments
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(author_id))
    -- Sur SA propre activité, l'organisatrice relit aussi un compte qu'ELLE a bloqué (`blocks`
    -- lue sous sa RLS : seulement ses blocages) — jamais l'inverse.
    or (exists (select 1 from public.events e where e.id = event_comments.event_id
                 and (e.author_id = (select auth.uid())::text or e.organizer_id = (select auth.uid())::text))
        and exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid())::text and b.blocked_id = event_comments.author_id))
  );
drop policy if exists event_reactions_lecture_hors_blocage on public.event_reactions;
create policy event_reactions_lecture_hors_blocage on public.event_reactions
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(user_id))
    -- Sur SA propre activité, l'organisatrice relit aussi un compte qu'ELLE a bloqué (`blocks`
    -- lue sous sa RLS : seulement ses blocages) — jamais l'inverse.
    or (exists (select 1 from public.events e where e.id = event_reactions.event_id
                 and (e.author_id = (select auth.uid())::text or e.organizer_id = (select auth.uid())::text))
        and exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid())::text and b.blocked_id = event_reactions.user_id))
  );

-- ── ④ comment_interactions / comment_likes : ce qu'a écrit un compte en
-- blocage avec moi ne se lit plus, sauf sur MON fil (activité ou publication)
-- quand c'est moi qui ai bloqué (modération). `events`, `posts` et `blocks`
-- lues sous la RLS de l'appelant : ses propres fils, ses propres blocages.
drop policy if exists comment_interactions_lecture_hors_blocage on public.comment_interactions;
create policy comment_interactions_lecture_hors_blocage on public.comment_interactions
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or not public.is_blocked_with(user_id)
    or ((exists (select 1 from public.events e where e.id = comment_interactions.post_id
                  and (e.author_id = (select auth.uid())::text or e.organizer_id = (select auth.uid())::text))
         or exists (select 1 from public.posts p where p.id = comment_interactions.post_id and p.author_id = (select auth.uid())::text))
        and exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid())::text and b.blocked_id = comment_interactions.user_id))
  );
drop policy if exists comment_likes_lecture_hors_blocage on public.comment_likes;
create policy comment_likes_lecture_hors_blocage on public.comment_likes
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or not public.is_blocked_with(user_id)
  );

-- ── ③ post_is_visible : la même règle que la lecture de `posts` ────────────
-- Corps identique à la définition mesurée, sauf les lignes marquées BLOC-ACT bis.
create or replace function public.post_is_visible(pid text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when pid is null then false
    -- Pas de ligne posts : PUBLIC seulement pour un identifiant d'EXEMPLE (le contenu de
    -- démonstration du client n'est dans aucune table). Une publication SUPPRIMÉE, ou un
    -- identifiant inconnu, n'est visible par personne (R31, 2026-11-04 : rendait VRAI).
    when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        -- Même règle que la policy restrictive de `posts` : masquée, une publication ne se lit plus
        -- par ses commentaires ni par ses « j'aime », sauf pour son auteur.
        or (not public.post_masque(p.id) and (
              not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
              or public.abonne_accepte_non_bloque(p.author_id))
            -- Ni en blocage avec moi, ni portant ou citant ce qui l'est (BLOC-ACT bis, 2026-11-22).
            and not public.publication_masquee_pour_moi(p.id))
      )
    )
  end
$function$;

-- ── interactions_cibles (#1023) : la lecture GROUPÉE du client suit la même règle ──
-- Corps identique à la définition mesurée, sauf le filtre marqué BLOC-ACT bis.
create or replace function public.interactions_cibles(_comment_ids text[], _kinds text[] DEFAULT NULL::text[], _limite integer DEFAULT 1000)
 RETURNS TABLE(id text, comment_id text, post_id text, user_id text, kind text, payload text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cibles as materialized (
    -- 300 identifiants au plus, dédupliqués, sans NULL, bornés APRÈS aplatissement.
    select distinct s.cid
      from (select u.cid from unnest(coalesce(_comment_ids, '{}'::text[])) with ordinality as u(cid, n)
             where u.cid is not null order by u.n limit 300) s
  ),
  lignes as (
    select i.id, i.comment_id, i.post_id, i.user_id, i.kind, i.payload, i.created_at
      from public.comment_interactions i
      join cibles c on c.cid = i.comment_id
     where _kinds is null or i.kind = any(_kinds)
  ),
  -- ⚠️ La règle de lecture, « user_id = moi OR comment_target_visible(comment_id, post_id) »,
  -- décidée ici pour chaque couple présent au lieu de l'être pour chaque ligne.
  fils as materialized (
    select d.comment_id, d.post_id, coalesce(public.comment_target_visible(d.comment_id, d.post_id), false) as visible
      from (select distinct l.comment_id, l.post_id from lignes l) d
  )
  select l.id, l.comment_id, l.post_id, l.user_id, l.kind, l.payload, l.created_at
    from lignes l
   where (l.user_id = (select auth.uid())::text
      or exists (select 1 from fils f
                  where f.comment_id = l.comment_id and f.post_id is not distinct from l.post_id and f.visible))
     -- Ce qu'a écrit un compte en blocage avec moi ne se lit plus, sauf sur MON fil quand c'est moi
     -- qui ai bloqué : la règle de comment_interactions_lecture_hors_blocage, que cette fonction
     -- SECURITY DEFINER contournerait sinon (BLOC-ACT bis, 2026-11-22).
     and (l.user_id = (select auth.uid())::text
          or not public.is_blocked_with(l.user_id)
          or ((exists (select 1 from public.events e where e.id = l.post_id
                        and (e.author_id = (select auth.uid())::text or e.organizer_id = (select auth.uid())::text))
               or exists (select 1 from public.posts p where p.id = l.post_id and p.author_id = (select auth.uid())::text))
              and exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid())::text and b.blocked_id = l.user_id)))
   order by l.created_at, l.id
   limit greatest(1, least(coalesce(_limite, 1000), 1000));
$function$;

-- ── Verdict : il LÈVE sur la moindre ligne en ECHEC ────────────────────────
create temp table _verdict_bloc_act_bis on commit drop as
select 1 as n, '① publication_masquee_pour_moi : security definer, search_path vide, FAUX sans compte (identifiant réel)' as controle,
       case when exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.publication_masquee_pour_moi(text)')
                          and p.prosecdef and p.proconfig @> array['search_path=""'])
             and (select auth.uid()) is null
             and not public.publication_masquee_pour_moi(coalesce((select id from public.posts limit 1), 'aucun'))
             and (select prosrc from pg_proc where oid = 'public.publication_masquee_pour_moi(text)'::regprocedure) like '%(select auth.uid()) is not null and p_post_id is not null%'
             then 'OK' else 'ECHEC' end as verdict
union all
select 2, '② publication_masquee_pour_moi : authenticated oui, anon non',
       case when has_function_privilege('authenticated', 'public.publication_masquee_pour_moi(text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.publication_masquee_pour_moi(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 3, '③ posts : une seule règle restrictive, par publication_masquee_pour_moi',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%publication_masquee_pour_moi(id)%') then 'OK' else 'ECHEC' end
union all
select 4, '④ event_comments / event_reactions : l''organisatrice relit ce qu''ELLE a bloqué, jamais l''inverse',
       case when (select count(*) from pg_policies where schemaname='public' and tablename in ('event_comments','event_reactions')
                   and policyname like '%_lecture_hors_blocage' and permissive='RESTRICTIVE' and roles = '{authenticated}'
                   and qual like '%organizer_id%' and qual like '%activite_masquee_pour_moi(event_id)%'
                   and qual like '%b.blocker_id = (( SELECT auth.uid() AS uid))::text%') = 2 then 'OK' else 'ECHEC' end
union all
select 5, '⑤ post_is_visible : applique publication_masquee_pour_moi, droits anon conservés',
       case when pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%and not public.publication_masquee_pour_moi(p.id)%'
             and has_function_privilege('anon', 'public.post_is_visible(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 6, '⑥ le déclencheur anti-homonyme est posé sur les QUATRE tables, seul de son nom',
       case when (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   where c.relnamespace = 'public'::regnamespace and c.relname in ('posts','events','post_comments','event_comments')
                     and t.tgname = 'zz_identifiant_sans_homonyme' and t.tgenabled = 'O'
                     and t.tgfoid = 'public.identifiant_sans_homonyme()'::regprocedure) = 4
             and not exists (select 1 from pg_trigger where tgname = 'aa_identifiant_sans_homonyme') then 'OK' else 'ECHEC' end
union all
select 15, '⑮ le déclencheur : SQLSTATE dédié, toutes les sources d''orphelins, identifiants retirés, visiteur refusé d''abord, rejeu laissé à la clé primaire sous FOR KEY SHARE',
       case when (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%errcode = ''PT409''%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%comment_interactions where post_id = new.id%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%comment_likes where comment_id = new.id%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%identifiants_retires%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%current_setting(''role'', true) = ''anon''%errcode = ''42501''%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%for key share%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%tg_op = ''UPDATE'' and tg_table_name = ''events''%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%comment_interactions where comment_id = new.id and user_id is distinct from new.author_id%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%post_comments where post_id = new.id%'
             and (select prosrc from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure) like '%post_likes where post_id = new.id%'
             and not exists (select 1 from pg_proc where oid = 'public.identifiant_sans_homonyme()'::regprocedure and prosrc like '%23505%')
             then 'OK' else 'ECHEC' end
union all
select 16, '⑯ comment_interactions / comment_likes : restrictives de lecture hors blocage, branche « mon fil, mon blocage »',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='comment_interactions' and policyname='comment_interactions_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%is_blocked_with(user_id)%'
                          and qual like '%b.blocker_id = (( SELECT auth.uid() AS uid))::text%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='comment_likes' and policyname='comment_likes_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%is_blocked_with(user_id)%') then 'OK' else 'ECHEC' end
union all
select 18, '⑱ les restrictives d''INSERT par visibilité sont là (une interaction, un commentaire ou un « j''aime » ne précède pas sa cible : pas de faux PT409)',
       case when (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE' and cmd = 'INSERT'
                   and (tablename, policyname) in (('comment_interactions', 'ci_visibilite_insert'), ('comment_likes', 'comment_likes_visibilite_insert'),
                                                   ('post_comments', 'post_comments_visibilite_insert'), ('post_likes', 'post_likes_visibilite_insert'))) = 4
             then 'OK' else 'ECHEC' end
union all
select 19, '⑲ interactions_cibles (lecture groupée du client) applique le blocage de comment_interactions, droits conservés',
       case when (select prosrc from pg_proc where oid = 'public.interactions_cibles(text[],text[],integer)'::regprocedure) like '%or not public.is_blocked_with(l.user_id)%'
             and (select prosrc from pg_proc where oid = 'public.interactions_cibles(text[],text[],integer)'::regprocedure) like '%b.blocker_id = (select auth.uid())::text and b.blocked_id = l.user_id%'
             and has_function_privilege('authenticated', 'public.interactions_cibles(text[],text[],integer)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 17, '⑰ ce que lisent le déclencheur et les policies existe : identifiants retirés, blocks lisible par authenticated',
       case when to_regclass('rencontres_prive.identifiants_retires') is not null
             and has_table_privilege('authenticated', 'public.blocks', 'SELECT') then 'OK' else 'ECHEC' end
union all
select 7, '⑦ aucun homonyme entre posts, events, post_comments, event_comments',
       case when not exists (select id from (select id from public.posts union all select id from public.events
                                              union all select id from public.post_comments union all select id from public.event_comments) t
                              group by id having count(*) > 1) then 'OK' else 'ECHEC' end
union all
select 8, '⑧ les aides appelées par les policies sont exécutables par authenticated ; le déclencheur par personne',
       case when has_function_privilege('authenticated', 'public.is_blocked_with(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.post_auteur_bloque(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.activite_masquee_pour_moi(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.activite_de_partage(text)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.identifiant_sans_homonyme()', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 9, '⑨ les policies de la première migration sont toujours là (events, event_attendees)',
       case when (select count(*) from pg_policies where schemaname='public' and tablename in ('events','event_attendees')
                   and policyname like '%_lecture_hors_blocage' and permissive='RESTRICTIVE') = 2 then 'OK' else 'ECHEC' end
union all
select 10, '⑩ lectures de post_comments / post_likes / comment_interactions / comment_likes : toujours par post_is_visible / comment_target_visible',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='post_comments' and cmd='SELECT' and qual like '%post_is_visible(post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='post_likes' and cmd='SELECT' and qual like '%post_is_visible(post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='comment_interactions' and cmd='SELECT' and qual like '%comment_target_visible(comment_id, post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='comment_likes' and cmd='SELECT' and qual like '%comment_target_visible(comment_id)%')
             then 'OK' else 'ECHEC' end
union all
select 11, '⑪ temps réel : realtime.passio_rt_recevoir_fil passe par comment_target_visible',
       case when exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='passio_rt_recevoir_fil'
                          and qual like '%fil:%' and qual like '%comment_target_visible(NULL::text, substr(realtime.topic(), 5))%') then 'OK' else 'ECHEC' end
union all
select 12, '⑫ aucune de ces tables n''est publiée en temps réel',
       case when not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
                              and tablename in ('events','event_attendees','event_comments','event_reactions','posts','post_comments','post_likes','comment_interactions','comment_likes')) then 'OK' else 'ECHEC' end
union all
select 13, '⑬ comment_target_visible n''est pas réécrite (ordre de #951 : la publication avant l''activité)',
       case when (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.comment_target_visible(text,text)'::regprocedure) = '3cf606d2b4bf8605e403643342c11f5d'
             and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.comment_target_visible(text)'::regprocedure) = '0d830765c94045194263714b9b7f2bf9'
             then 'OK' else 'ECHEC' end
union all
select 14, '⑭ la lecture publique des activités reste ouverte (permissive d''origine intacte)',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Lecture publique' and qual = 'true') then 'OK' else 'ECHEC' end;

do $verdict$
declare echecs text;
begin
  select string_agg(controle, ' ; ' order by n) into echecs from _verdict_bloc_act_bis where verdict <> 'OK';
  if echecs is not null then
    raise exception 'VERDICT EN ECHEC — rien n''est validé : %', echecs;
  end if;
end
$verdict$;

select controle, verdict from _verdict_bloc_act_bis order by n;

commit;
