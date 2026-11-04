-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT 2026-11-02, RISQUE RÉSIDUEL R31 (2026-11-04) : SUPPRIMER UNE
-- PUBLICATION — OU SON COMPTE — NE REND PLUS SES COMMENTAIRES, « J'AIME » ET
-- INTERACTIONS LISIBLES PAR TOUS. ILS PARTENT AVEC ELLE.
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (20 lignes : dix-sept
-- contrôles OK/ECHEC et trois NOMBRES). Rien de personnel dans ce fichier ni
-- dans son verdict : des nombres, des formes d'identifiants, des définitions.
--
-- LE DÉFAUT (contre-revue finale de R25, 2026-11-04 ; confirmé sur deux bancs
-- PostgreSQL 16 aux corps et policies de production) :
--   · aucune clé étrangère ne relie `post_comments`, `post_likes` ni
--     `comment_interactions` à `posts` ; `deletePost` (`_delObRun`, app-04) et
--     la purge de compte (`supabase/functions/_shared/purge-compte.js`)
--     n'effacent que la publication ;
--   · `post_is_visible(pid)` rend VRAI quand la ligne `posts` manque (« pas de
--     ligne posts = contenu seed/local → public », écrit le 2026-07-20 pour le
--     contenu de démonstration) ; `comment_target_visible(cid)` rend VRAI sur
--     toute cible inconnue ;
--   · M (compte privé) publie P ; V, abonné accepté, commente et aime P ; M
--     répond à V. Sans compte et pour un non-abonné : 0 / 0 / 0. M supprime P,
--     ou son compte : sans compte, avec la clé publique et sans filtre, on lit
--     le commentaire de V (`author_id`, `content`), son « j'aime », la réponse
--     de M. Même chose quand V supprime SON commentaire : la réponse de M
--     devient publique. Et, sans AUCUNE suppression, les réactions aux RÉPONSES
--     d'une publication privée (`comment_id = srep_<date>`, une cible qu'aucune
--     table ne porte) sont lisibles par tous.
--
-- MESURÉ EN PRODUCTION le 2026-11-04 au canal ① (execute_sql, lecture seule,
-- catalogue et agrégats) :
--   · `post_is_visible(text)` : md5(prosrc) 5ff0bf778b27a7ee4f817dcaecb238c1 ;
--     `comment_target_visible(text)` : f02f0f69b94607d16e39c18851d058d8 ; les
--     deux SECURITY DEFINER, search_path=public, sans CR, EXECUTE à PUBLIC,
--     anon, authenticated, service_role ; trois policies seulement les appellent
--     (lecture de `post_comments`, `post_likes`, `comment_interactions`) ;
--   · 37 publications, 91 commentaires, 76 « j'aime », 389 interactions ;
--     identifiants des publications 37/37 et des activités 10/10 au format que
--     le client fabrique pour le contenu RÉEL (`x…` 17, `reel_x…` 22,
--     `post_<13 chiffres>_<9>`) ; AUCUN au format d'un exemple ;
--   · orphelins (aucune ligne `posts`) : 59 commentaires — 19 d'exemples, 26 de
--     l'ancien `p_vlog_…` (que le client ne fabrique plus), 14 au format réel —
--     et 42 « j'aime » (17 / 9 / 16) ; 0 co-auteur ;
--   · interactions par FIL (`post_id`) : 144 dans une publication existante,
--     1 dans une activité, 121 dans un exemple, 123 dans un fil disparu
--     (61 `p_vlog_…`, 6 lives et étapes de carnet retirés, 50 au format réel :
--     publications et activités supprimées, la plus récente le 2026-09-01) ;
--     0 interaction sans `post_id` ; 0 dont la cible (publication ou
--     commentaire) contredit le fil ;
--   · 1 publication d'un compte privé porte aujourd'hui 1 commentaire et
--     2 « j'aime » de tiers : rien d'orphelin, la règle actuelle les cache —
--     c'est leur suppression FUTURE que ① et ② gardent ;
--   · déclencheurs de `posts`, `post_comments`, `post_likes`,
--     `comment_interactions` : tous BEFORE INSERT/UPDATE, aucun effet externe
--     (ni pg_net, ni http, ni notify), aucun sur DELETE ; tables à `postgres`,
--     RLS non forcée ; `postgres` a BYPASSRLS et peut prendre `anon` et
--     `authenticated` (le verdict ④ en dépend).
--
-- MODÈLE DE MENACE : un visiteur sans compte, ou un compte quelconque, qui parle
-- à PostgREST en direct avec la clé publique et lit tout ce que les policies lui
-- laissent ; il peut créer des comptes, des publications et des activités dont
-- il choisit l'identifiant.
--
-- POURQUOI DES DÉCLENCHEURS, ET NI DES CLÉS ÉTRANGÈRES NI UNE RPC :
--   · une clé étrangère `post_id → posts` refuserait tout commentaire sur un
--     EXEMPLE (aucune ligne `posts`, par construction : 19 commentaires
--     d'exemples en base, et le client continue d'en écrire), et
--     `comment_interactions` vise trois sortes de cibles (publication,
--     commentaire, réponse) : aucune clé ne les décrit ;
--   · une RPC de suppression ne couvrirait que le chemin qui l'appelle : le
--     DELETE direct reste permis par « Suppression propre » (et tout client
--     déjà installé l'emploie), la purge de compte passe par la clé de
--     service, la modération et les scripts par SQL ;
--   · un déclencheur AFTER DELETE couvre TOUS les chemins, sans changer le
--     client : `deletePost` garde son DELETE vérifié par relecture.
--
-- CE QUI CHANGE (et rien d'autre) :
--  ① LA VISIBILITÉ D'UNE CIBLE ABSENTE. `est_identifiant_exemple(id)` (nouvelle,
--     IMMUTABLE, sans droit pour les rôles clients) reconnaît les identifiants
--     que le client fabrique pour son contenu de DÉMONSTRATION — `buildSeed()`
--     (app-01) et `getSeedReelPostsWithComments()` (app-05) : publications
--     `p<n>`, `pm|pp|pv<n>`, `pn_<thème>_<n>`, `pac_<thème>`, `p_ev_<thème>`,
--     `p_ev<n>_e<n>`, bobines `reel_seed_…`, activités `e<n>`. Liste FERMÉE,
--     ancrée ; `tests/unit/identifiants-exemple.test.mjs` la confronte à
--     `buildSeed()` (tout exemple y entre) et aux générateurs du contenu réel
--     (aucun n'y entre).
--     · `post_is_visible(pid)` : sans ligne `posts`, VRAI seulement pour un
--       exemple ; FAUX pour une publication supprimée, un identifiant inconnu
--       ou nul (0 ligne nulle aujourd'hui). La règle d'une publication qui
--       existe ne change pas d'un caractère.
--     · `comment_target_visible(cid, pid)`, NOUVELLE surcharge, celle de la
--       policy : une interaction se lit comme son FIL — `post_id`, que le client
--       pose toujours (la publication ou l'activité où elle est écrite) ; c'est
--       lui seul qui rattache une réaction à une RÉPONSE. Publication existante
--       → sa règle ; activité existante → publique (comme `events` et
--       `event_comments`, en lecture publique) ; exemple → public ; tout autre
--       fil (supprimé, inconnu, live ou carnet retirés) → personne. Sans fil :
--       la CIBLE, par `comment_target_visible(cid)`, réécrite — publication →
--       sa règle ; commentaire → la règle de sa publication ; commentaire
--       d'activité → public ; exemple → public ; sinon personne.
--     · la policy « Lecture selon visibilite de la cible » de
--       `comment_interactions` appelle `comment_target_visible(comment_id,
--       post_id)`. L'auteur d'une ligne la lit toujours (`user_id = auth.uid()`).
--  ② LA PURGE AVEC LA CIBLE. Deux déclencheurs AFTER DELETE, par INSTRUCTION
--     (table de transition : une suppression en nombre est un seul passage),
--     fonctions SECURITY DEFINER, search_path vide, sans EXECUTE client :
--     · `trg_purger_cibles_publication` (`posts`) : commentaires, « j'aime »,
--       co-auteurs et interactions (réactions de la publication, réponses,
--       réactions aux réponses — tout ce dont elle est le fil ou la cible) des
--       publications supprimées, par QUELQUE chemin que ce soit ;
--     · `trg_purger_cibles_commentaire` (`post_comments`) : réponses et
--       réactions d'un commentaire supprimé — le client essayait déjà
--       (`_supaDeleteCommentRow`, app-04), mais la RLS ne lui laisse effacer
--       que SES lignes.
--     Index `idx_ci_post` sur `comment_interactions (post_id)` : le prédicat du
--     déclencheur et de la policy (389 lignes : construction instantanée).
--  ③ LE PASSÉ. Les orphelins dont le fil est une publication ou une activité
--     SUPPRIMÉE — identifiant au format RÉEL du client, sans ligne `posts` (ni
--     `events`, pour une interaction) — sont effacés : ce que ② aurait fait. Ni
--     un exemple, ni l'ancien `p_vlog_…`, ni un live ou une étape de carnet
--     (`live_…`, `carnetstep:…`) n'y entrent : ceux-là restent, et seuls les
--     exemples restent lisibles par d'autres que leur auteur. PLAFOND : au-delà
--     de 300 lignes à effacer, la migration REFUSE et rien n'est appliqué —
--     mesuré : 80 (14 commentaires, 16 « j'aime », 50 interactions). Re-mesurer
--     le jour même (requête ③ ci-dessous, canal ①) ; une hausse expliquée se
--     pose juste après `begin;` :
--       `select set_config('passio.r31_plafond_purge', '<N>', true);`
--     — un changement du fichier, donc une PR et sa contre-revue.
--     Requête ③ (lecture seule, des nombres) :
--       with f as (select '^(x[0-9a-z]{8,16}|reel_x[0-9a-z]{8,16}|post_[0-9]{13}_[0-9a-z]{1,9})$'::text as r)
--       select (select count(*) from post_comments c where c.post_id ~ (select r from f)
--                 and not exists (select 1 from posts p where p.id = c.post_id)) as commentaires,
--              (select count(*) from post_likes l where l.post_id ~ (select r from f)
--                 and not exists (select 1 from posts p where p.id = l.post_id)) as jaime,
--              (select count(*) from post_collaborators k where k.post_id ~ (select r from f)
--                 and not exists (select 1 from posts p where p.id = k.post_id)) as coauteurs,
--              (select count(*) from comment_interactions i where (i.post_id ~ (select r from f)
--                 and not exists (select 1 from posts p where p.id = i.post_id)
--                 and not exists (select 1 from events e where e.id = i.post_id))
--                 or exists (select 1 from post_comments c where c.id = i.comment_id and c.post_id ~ (select r from f)
--                            and not exists (select 1 from posts p where p.id = c.post_id))) as interactions;
--
-- CE QUI N'EST PAS FERMÉ ICI, dit tel quel :
--  · un orphelin peut encore NAÎTRE : un « j'aime », un commentaire ou une
--    interaction écrit APRÈS la suppression (client resté ouvert sur la
--    publication, file hors-ligne, ou dans la fenêtre de la suppression même) —
--    les policies INSERT ne vérifient pas que la cible existe. Il n'est lisible
--    que par son auteur ; il ne le redeviendrait par d'autres que si quelqu'un
--    recrée une publication SOUS LE MÊME IDENTIFIANT (choisi par le client : il
--    faut le connaître). Proposition : `post_is_visible(post_id)` dans le WITH
--    CHECK des INSERT de `post_comments` / `post_likes`, et
--    `comment_target_visible(comment_id, post_id)` dans celui de
--    `comment_interactions` (risque résiduel consigné) ;
--  · les réactions aux RÉPONSES d'un commentaire supprimé (`srep_<date>`, que
--    seul le fil rattache) restent dans une publication qui existe : lisibles
--    par son seul public, affichées nulle part, effacées avec la publication ;
--  · un commentaire d'ACTIVITÉ supprimé laisse ses interactions : contenu public
--    par conception (`event_comments`), aucune lecture ne s'ouvre ; les
--    notifications qui citent une publication supprimée restent chez leur seul
--    destinataire ;
--  · une publication créée SOUS un identifiant d'exemple (le client n'en
--    fabrique pas ; 0 en base) prendrait la place de l'exemple : sa règle
--    s'appliquerait à ses commentaires — rien ne s'ouvre, l'exemple se ferme ;
--  · TRUNCATE ne déclenche pas DELETE (administration seulement) ;
--  · chaque ligne effacée par ② ou ③ part en événement DELETE du temps réel. Tant
--    que R25 (#692) n'est pas appliquée, celui de `post_likes` porte sa clé
--    primaire (`post_id`, `user_id`) à tout abonné : qui avait aimé, une fois,
--    au lieu d'une lecture permanente par la clé publique aujourd'hui.
--    Appliquer R25 AVANT, de préférence.
--
-- ORDRE : indépendante. Elle ne touche ni l'identité de réplication (R25,
-- #692), ni `promouvoir_attente`, ni C-04 ; avant ou après #692, les
-- définitions obtenues sont les mêmes. De préférence APRÈS R25 (voir
-- ci-dessus). Aucun client à déployer d'abord : le chemin de suppression ne
-- change pas, et la confirmation « Le post et ses commentaires seront
-- supprimés » (app-04) devient vraie côté serveur.
--
-- VERDICT : chaque affirmation est MESURÉE. Le comportement (bloc ④) par une
-- publication privée SYNTHÉTIQUE et ses dépendances, lues sous les rôles
-- `anon` et `authenticated` (identités simulées par `request.jwt.claim.sub`,
-- la lecture même d'`auth.uid()`), supprimées par leur AUTEUR sous son rôle,
-- puis annulées : la sous-transaction finit en levant `passio_verdict_annule`
-- (rien n'en reste — ligne, notification, diffusion temps réel : une
-- sous-transaction annulée n'est jamais décodée). Les définitions et les
-- droits par le catalogue.
--
-- Rejouable ; banc : tests/sql/migration-publications-supprimees.test.sh.
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue et
-- contrôle l'empreinte des deux fonctions et le texte de la policy). Il rend
-- l'état exact d'avant CETTE migration : les définitions de PRODUCTION de
-- `post_is_visible` et `comment_target_visible(text)` (pg_get_functiondef,
-- 2026-11-04, md5(prosrc) ci-dessus, recopiées à l'octet près ; `create or
-- replace` garde leurs ACL dans les deux sens), la policy d'avant, et retire ce
-- que la migration a créé. ⚠️ Les orphelins effacés par ③ ne reviennent pas :
-- les rendre rouvrirait la lecture qu'ils donnaient à tous.
--| begin;
--| set local lock_timeout = '5s';
--| -- post_is_visible et comment_target_visible(text) : les définitions de PRODUCTION lues le
--| -- 2026-11-04 (pg_get_functiondef), md5(prosrc) 5ff0bf77… et f02f0f69…, recopiées à l'octet près.
--| CREATE OR REPLACE FUNCTION public.post_is_visible(pid text)
--|  RETURNS boolean
--|  LANGUAGE sql
--|  STABLE SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--|   select case
--|     when pid is null then true
--|     -- Pas de ligne posts = contenu seed/local → public (contenu démo beta)
--|     when not exists (select 1 from posts where id = pid) then true
--|     else exists (
--|       select 1 from posts p
--|       where p.id = pid and (
--|         p.author_id = (select auth.uid())::text
--|         or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
--|         or public.abonne_accepte_non_bloque(p.author_id)
--|       )
--|     )
--|   end
--| $function$;
--| CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text)
--|  RETURNS boolean
--|  LANGUAGE sql
--|  STABLE SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--|   select case
--|     when cid is null then true
--|     when exists (select 1 from posts where id = cid)
--|       then public.post_is_visible(cid)
--|     when exists (select 1 from post_comments where id = cid)
--|       then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
--|     else true
--|   end
--| $function$;
--| -- La policy d'avant (pg_policies, 2026-11-04) — AVANT de retirer la surcharge qu'elle appelle.
--| alter policy "Lecture selon visibilite de la cible" on public.comment_interactions
--|   using ((user_id = (( select auth.uid() as uid))::text) or public.comment_target_visible(comment_id));
--| -- Ce que la migration a créé.
--| drop trigger if exists trg_purger_cibles_publication on public.posts;
--| drop trigger if exists trg_purger_cibles_commentaire on public.post_comments;
--| drop function if exists public.purger_cibles_publications();
--| drop function if exists public.purger_cibles_commentaires();
--| drop function if exists public.comment_target_visible(text, text);
--| drop function if exists public.est_identifiant_exemple(text);
--| drop index if exists public.idx_ci_post;
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- Un verrou qui ne vient pas en 5 s fait ÉCHOUER la migration (rien n'est
-- appliqué, elle se relance) au lieu de mettre en file, derrière elle, toutes
-- les écritures de `posts`, `post_comments` et `comment_interactions`.
set local lock_timeout = '5s';

-- ── ① LES IDENTIFIANTS D'EXEMPLE ─────────────────────────────────────────────
create or replace function public.est_identifiant_exemple(_id text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- Le contenu de DÉMONSTRATION que le client fabrique et qu'aucune table ne porte :
  -- `buildSeed()` (app-01) et `getSeedReelPostsWithComments()` (app-05). Publications
  -- p<n>, pm|pp|pv<n>, pn_<thème>_<n>, pac_<thème>, p_ev_<thème>, p_ev<n>_e<n> ;
  -- bobines reel_seed_<thème>_<n> ; activités e<n>. Liste FERMÉE et ancrée :
  -- tests/unit/identifiants-exemple.test.mjs la confronte à buildSeed() et aux
  -- générateurs du contenu réel. Un exemple nouveau qui n'y entre pas a ses
  -- commentaires lisibles par leur seul auteur — le test le dit avant la mise en ligne.
  select coalesce(_id ~ '^(p[0-9]+|p[mpv][0-9]+|pn_[a-z0-9]+_[0-9]+|pac_[a-z]+|p_ev_[a-z]+|p_ev[0-9]+_e[0-9]+|reel_seed_[a-z0-9_]+|e[0-9]+)$', false)
$$;
comment on function public.est_identifiant_exemple(text) is
  'R31 (2026-11-04) : l''identifiant est-il celui d''un contenu de DÉMONSTRATION du client (aucune ligne en base) ? Seule exception à « une cible absente n''est visible par personne ». Liste fermée, confrontée à buildSeed() par tests/unit/identifiants-exemple.test.mjs.';
-- Appelée par des fonctions SECURITY DEFINER (droits de leur propriétaire) : aucun
-- rôle client n'en a besoin. PUBLIC, anon ET authenticated (sur Supabase, révoquer
-- PUBLIC seul ne ferme rien).
revoke all on function public.est_identifiant_exemple(text) from public, anon, authenticated;

-- post_is_visible : la branche « pas de ligne posts » ne vaut plus que pour un
-- exemple. Mêmes attributs qu'en production (SECURITY DEFINER, search_path=public :
-- voir la fiche « search_path FIGÉ » du journal) ; `create or replace` garde l'ACL.
create or replace function public.post_is_visible(pid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or public.abonne_accepte_non_bloque(p.author_id)
      )
    )
  end
$$;

-- comment_target_visible(cid) : la CIBLE seule, pour une interaction SANS fil.
create or replace function public.comment_target_visible(cid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- La CIBLE seule, pour une interaction sans fil (`post_id` nul : aucune ligne aujourd'hui,
  -- le client le pose toujours). Avec un fil, comment_target_visible(cid, pid) décide.
  select case
    when cid is null then false
    when exists (select 1 from posts where id = cid)
      then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid)
      then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    -- Un commentaire d'activité : public, comme `event_comments` (lecture : true).
    when exists (select 1 from event_comments where id = cid) then true
    -- Un exemple reste public ; une cible supprimée ou inconnue, personne (R31 : rendait VRAI).
    else public.est_identifiant_exemple(cid)
  end
$$;

-- comment_target_visible(cid, pid) : le FIL décide. La surcharge de la policy.
create or replace function public.comment_target_visible(cid text, pid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Une interaction se lit comme son FIL : `post_id`, que le client pose toujours — la
  -- publication ou l'activité où elle a été écrite. Lui seul rattache une réaction à une
  -- RÉPONSE (`comment_id = srep_<date>`, une cible qu'aucune table ne porte).
  select case
    when pid is null then public.comment_target_visible(cid)
    when exists (select 1 from posts where id = pid) then public.post_is_visible(pid)
    -- Une activité : publique, comme `events` et `event_comments`.
    when exists (select 1 from events where id = pid) then true
    -- Un fil d'exemple reste public ; un fil supprimé ou inconnu n'est lisible par personne.
    else public.est_identifiant_exemple(pid)
  end
$$;
comment on function public.comment_target_visible(text, text) is
  'R31 (2026-11-04) : une interaction (comment_interactions) se lit comme son FIL (post_id) — publication existante : sa règle ; activité : publique ; exemple : public ; fil disparu ou inconnu : personne. Sans fil : comment_target_visible(cid). Ne répond que sur l''appelant (auth.uid() lu en interne).';
-- La policy l'appelle sous le rôle de l'appelant : anon et authenticated en ont
-- besoin ; PUBLIC, non.
revoke all on function public.comment_target_visible(text, text) from public;
grant execute on function public.comment_target_visible(text, text) to anon, authenticated, service_role;

alter policy "Lecture selon visibilite de la cible" on public.comment_interactions
  using ((user_id = (( select auth.uid() as uid))::text) or public.comment_target_visible(comment_id, post_id));

-- ── ② LA PURGE AVEC LA CIBLE ─────────────────────────────────────────────────
create or replace function public.purger_cibles_publications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Les commentaires des publications supprimées ; leur propre déclencheur
  -- (`trg_purger_cibles_commentaire`) emporte leurs réponses et réactions.
  delete from public.post_comments c
   using publications_supprimees s
   where c.post_id = s.id;
  delete from public.post_likes l
   using publications_supprimees s
   where l.post_id = s.id;
  delete from public.post_collaborators k
   using publications_supprimees s
   where k.post_id = s.id;
  -- Les interactions dont la publication est le FIL (réactions, réponses, réactions aux
  -- réponses) ou la CIBLE (une réaction de publication écrite sans fil).
  delete from public.comment_interactions i
   using publications_supprimees s
   where i.post_id = s.id or i.comment_id = s.id;
  return null;
end
$$;
comment on function public.purger_cibles_publications() is
  'R31 (2026-11-04) : déclencheur AFTER DELETE (par instruction) de posts — une publication supprimée emporte ses commentaires, « j''aime », co-auteurs et interactions, quel que soit le chemin de la suppression.';
revoke all on function public.purger_cibles_publications() from public, anon, authenticated;

create or replace function public.purger_cibles_commentaires()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Les réponses et réactions des commentaires supprimés, de QUI qu'elles soient
  -- (la RLS ne laissait au client effacer que les siennes).
  delete from public.comment_interactions i
   using commentaires_supprimes s
   where i.comment_id = s.id;
  return null;
end
$$;
comment on function public.purger_cibles_commentaires() is
  'R31 (2026-11-04) : déclencheur AFTER DELETE (par instruction) de post_comments — un commentaire supprimé emporte ses réponses et réactions.';
revoke all on function public.purger_cibles_commentaires() from public, anon, authenticated;

create or replace trigger trg_purger_cibles_publication
  after delete on public.posts
  referencing old table as publications_supprimees
  for each statement execute function public.purger_cibles_publications();
create or replace trigger trg_purger_cibles_commentaire
  after delete on public.post_comments
  referencing old table as commentaires_supprimes
  for each statement execute function public.purger_cibles_commentaires();

create index if not exists idx_ci_post on public.comment_interactions (post_id);

-- ── ③ LE PASSÉ : les orphelins d'une publication ou d'une activité SUPPRIMÉE ──
-- Ce que ② aurait effacé s'il avait existé. Le format réel est celui que le
-- client fabrique pour le contenu RÉEL — `uid()` (app-02), `"reel_" + uid()`
-- (app-08), `"post_" + Date.now() + "_" + …` (app-03/05/07) — publications ET
-- activités. Ni un exemple, ni l'ancien `p_vlog_…`, ni `live_…` / `carnetstep:…`.
do $purge$
declare
  forme   constant text := '^(x[0-9a-z]{8,16}|reel_x[0-9a-z]{8,16}|post_[0-9]{13}_[0-9a-z]{1,9})$';
  plafond constant integer := coalesce(nullif(current_setting('passio.r31_plafond_purge', true), ''), '300')::integer;
  n_c integer; n_l integer; n_k integer; n_i integer;
  t_c integer; t_l integer; t_k integer; t_i integer;
begin
  select count(*) into n_c from public.post_comments c
   where c.post_id ~ forme and not exists (select 1 from public.posts p where p.id = c.post_id);
  select count(*) into n_l from public.post_likes l
   where l.post_id ~ forme and not exists (select 1 from public.posts p where p.id = l.post_id);
  select count(*) into n_k from public.post_collaborators k
   where k.post_id ~ forme and not exists (select 1 from public.posts p where p.id = k.post_id);
  select count(*) into n_i from public.comment_interactions i
   where (i.post_id ~ forme
          and not exists (select 1 from public.posts p where p.id = i.post_id)
          and not exists (select 1 from public.events e where e.id = i.post_id))
      or exists (select 1 from public.post_comments c
                  where c.id = i.comment_id and c.post_id ~ forme
                    and not exists (select 1 from public.posts p where p.id = c.post_id));
  if n_c + n_l + n_k + n_i > plafond then
    raise exception 'R31 : % ligne(s) orpheline(s) à effacer pour un plafond de % — rien n''est appliqué', n_c + n_l + n_k + n_i, plafond
      using errcode = 'P0001',
            detail = format('commentaires %s, « j''aime » %s, co-auteurs %s, interactions %s (mesuré le 2026-11-04 : 14, 16, 0, 50)', n_c, n_l, n_k, n_i),
            hint = 'Re-mesurer au canal ① (requête ③ de l''en-tête) ; si la hausse s''explique, poser le plafond juste après begin; (voir l''en-tête) — un changement du fichier, donc une PR et sa contre-revue.';
  end if;
  select count(*) into t_c from public.post_comments;
  select count(*) into t_l from public.post_likes;
  select count(*) into t_k from public.post_collaborators;
  select count(*) into t_i from public.comment_interactions;
  -- Les interactions d'abord (leur fil est la publication ou l'activité supprimée, ou leur
  -- cible un commentaire orphelin), puis les commentaires — leur déclencheur ne trouve
  -- plus rien —, les « j'aime », les co-auteurs.
  delete from public.comment_interactions i
   where (i.post_id ~ forme
          and not exists (select 1 from public.posts p where p.id = i.post_id)
          and not exists (select 1 from public.events e where e.id = i.post_id))
      or exists (select 1 from public.post_comments c
                  where c.id = i.comment_id and c.post_id ~ forme
                    and not exists (select 1 from public.posts p where p.id = c.post_id));
  delete from public.post_comments c
   where c.post_id ~ forme and not exists (select 1 from public.posts p where p.id = c.post_id);
  delete from public.post_likes l
   where l.post_id ~ forme and not exists (select 1 from public.posts p where p.id = l.post_id);
  delete from public.post_collaborators k
   where k.post_id ~ forme and not exists (select 1 from public.posts p where p.id = k.post_id);
  -- Ce qui est PARTI, compté par différence (le déclencheur des commentaires compris).
  perform set_config('passio.r31_purge', jsonb_build_object(
    'prevu', jsonb_build_object('commentaires', n_c, 'jaime', n_l, 'coauteurs', n_k, 'interactions', n_i),
    'efface', jsonb_build_object(
      'commentaires', t_c - (select count(*) from public.post_comments),
      'jaime', t_l - (select count(*) from public.post_likes),
      'coauteurs', t_k - (select count(*) from public.post_collaborators),
      'interactions', t_i - (select count(*) from public.comment_interactions)),
    'plafond', plafond)::text, true);
end
$purge$;

-- ── ④ LE COMPORTEMENT, MESURÉ : une publication privée synthétique, une sous-transaction ANNULÉE ──
-- Décor : M (PRIVÉ) publie P, Q, R1, R2 ; V, abonné ACCEPTÉ de M, commente et
-- aime ; M répond ; N n'a aucun lien. Des comptes FICTIFS
-- (`00000000-0000-4000-8000-0000000031xx` : aucun compte réel n'a cette forme),
-- des identifiants `zz_r31_…` (ni exemple, ni format réel). Le décor s'écrit
-- SANS session (comme toute écriture d'administration) ; les lectures se font
-- sous les rôles `anon` et `authenticated`, les suppressions par leur AUTEUR sous
-- son rôle (la policy « Suppression propre » joue), la suppression en nombre
-- comme la purge de compte (sans session). Le bloc finit en levant
-- `passio_verdict_annule` : tout ce qu'il a écrit disparaît. Seules les mesures,
-- tenues dans une variable, survivent (réglage de transaction
-- `passio.verdict_r31`). Une erreur IMPRÉVUE du décor n'annule pas la migration :
-- elle s'écrit au tableau (ECHEC, avec son code), et on mesure au canal ①.
do $verdict$
declare
  sfx constant text := left(md5(clock_timestamp()::text || random()::text), 10);
  m   constant text := '00000000-0000-4000-8000-000000003101';   -- M : compte PRIVÉ, auteur
  v   constant text := '00000000-0000-4000-8000-000000003102';   -- V : abonné ACCEPTÉ de M
  n   constant text := '00000000-0000-4000-8000-000000003103';   -- N : aucun lien avec M
  p   constant text := 'zz_r31_p_' || sfx;     -- publication privée de M, supprimée par M
  q   constant text := 'zz_r31_q_' || sfx;     -- publication de M dont un COMMENTAIRE est supprimé
  r1  constant text := 'zz_r31_r1_' || sfx;    -- r1, r2 (et q) : supprimées EN NOMBRE
  r2  constant text := 'zz_r31_r2_' || sfx;
  c   constant text := 'zz_r31_c_' || sfx;     -- commentaire de V sur P
  d   constant text := 'zz_r31_d_' || sfx;     -- commentaire de V sur Q, supprimé par V
  ex  constant text := 'zz_r31_x_' || sfx;     -- commentaire de V sur l'exemple p1
  ev  constant text := 'zz_r31_e_' || sfx;     -- une activité
  rep constant text := 'srep_zz_r31_' || sfx;  -- une RÉPONSE (cible qu'aucune table ne porte)
  inconnu constant text := 'x' || left(md5(sfx || 'inconnu'), 16);   -- format réel, jamais publié
  mes jsonb := '{}'::jsonb;
  k   bigint;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private)
      values (m, 'zz_r31_m_' || sfx, true), (v, 'zz_r31_v_' || sfx, false), (n, 'zz_r31_n_' || sfx, false);
    -- V suit M : « en attente » (compte privé, `trg_follows_statut`), puis acceptée.
    insert into public.follows (follower_id, following_id) values (v, m);
    update public.follows set status = 'accepted' where follower_id = v and following_id = m;
    insert into public.posts (id, author_id, content) values
      (p, m, 'mesure R31 : P'), (q, m, 'mesure R31 : Q'), (r1, m, 'mesure R31 : R1'), (r2, m, 'mesure R31 : R2');
    insert into public.post_comments (id, post_id, author_id, content) values
      (c, p, v, 'commentaire de V sur P'), (d, q, v, 'commentaire de V sur Q'),
      ('zz_r31_c1_' || sfx, r1, v, 'sur R1'), ('zz_r31_c2_' || sfx, r2, v, 'sur R2'),
      (ex, 'p1', v, 'commentaire de V sur un exemple');
    insert into public.post_likes (post_id, user_id) values (p, v), (q, n), (r1, v), (r2, v);
    insert into public.post_collaborators (post_id, user_id, added_by) values (p, v, m);
    insert into public.events (id, author_id, title) values (ev, n, 'mesure R31 : activité');
    insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values
      ('zz_r31_i1_' || sfx, c,   p,   v, 'like',  null),          -- V aime son commentaire
      ('zz_r31_i2_' || sfx, c,   p,   m, 'reply', 'réponse de M'),-- M répond à V
      ('zz_r31_i3_' || sfx, rep, p,   v, 'emoji', '👍'),          -- V réagit à la RÉPONSE de M
      ('zz_r31_i4_' || sfx, p,   p,   v, 'emoji', '😍'),          -- V réagit à P
      ('zz_r31_i5_' || sfx, d,   q,   m, 'reply', 'réponse de M sur Q'),
      ('zz_r31_i6_' || sfx, d,   q,   n, 'like',  null),
      ('zz_r31_i7_' || sfx, q,   q,   m, 'emoji', '🔥'),          -- M réagit à Q (reste)
      ('zz_r31_i8_' || sfx, ex,  'p1', n, 'like', null),          -- dans un fil d'EXEMPLE
      ('zz_r31_i9_' || sfx, 'ec_zz_r31_' || sfx, ev, v, 'like', null);  -- dans une ACTIVITÉ

    -- a. AVANT toute suppression : sans session, puis N, puis V (l'abonné).
    execute 'set local role anon';
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'select count(*) from public.post_comments where post_id = $1' into k using p;      mes := mes || jsonb_build_object('a_anon_c', k);
    execute 'select count(*) from public.post_likes where post_id = $1' into k using p;         mes := mes || jsonb_build_object('a_anon_l', k);
    execute 'select count(*) from public.comment_interactions where post_id = $1' into k using p; mes := mes || jsonb_build_object('a_anon_i', k);
    execute 'select count(*) from public.comment_interactions where comment_id = $1' into k using rep; mes := mes || jsonb_build_object('a_anon_rep', k);
    -- …et l'exemple, l'activité : publics.
    execute 'select count(*) from public.post_comments where id = $1' into k using ex;           mes := mes || jsonb_build_object('a_anon_ex_c', k);
    execute 'select count(*) from public.comment_interactions where comment_id = $1' into k using ex; mes := mes || jsonb_build_object('a_anon_ex_i', k);
    execute 'select count(*) from public.comment_interactions where post_id = $1' into k using ev; mes := mes || jsonb_build_object('a_anon_ev_i', k);
    execute 'reset role';
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', n, true);
    execute 'select count(*) from public.post_comments where post_id = $1' into k using p;      mes := mes || jsonb_build_object('a_n_c', k);
    execute 'select count(*) from public.post_likes where post_id = $1' into k using p;         mes := mes || jsonb_build_object('a_n_l', k);
    execute 'select count(*) from public.comment_interactions where post_id = $1' into k using p; mes := mes || jsonb_build_object('a_n_i', k);
    perform set_config('request.jwt.claim.sub', v, true);
    -- V lit la réponse de M (une ligne qui n'est pas à lui) : la règle d'une publication existante.
    execute 'select count(*) from public.comment_interactions where post_id = $1 and user_id = $2' into k using p, m; mes := mes || jsonb_build_object('a_v_reponse_m', k);
    -- M, l'auteur, lit la réaction de V à SA réponse : une cible qu'aucune table ne porte,
    -- que seul le fil rattache (la cible seule la cacherait à tous).
    perform set_config('request.jwt.claim.sub', m, true);
    execute 'select count(*) from public.comment_interactions where comment_id = $1' into k using rep; mes := mes || jsonb_build_object('a_m_rep', k);
    execute 'reset role';

    -- b. M supprime P, sous SON rôle : la policy « Suppression propre » joue, le déclencheur emporte le reste.
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', m, true);
    execute 'delete from public.posts where id = $1' using p;
    get diagnostics k = row_count;  mes := mes || jsonb_build_object('b_supprimee', k);
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    mes := mes || jsonb_build_object(
      'b_restes_c', (select count(*) from public.post_comments x where x.post_id = p),
      'b_restes_l', (select count(*) from public.post_likes x where x.post_id = p),
      'b_restes_k', (select count(*) from public.post_collaborators x where x.post_id = p),
      'b_restes_i', (select count(*) from public.comment_interactions x where x.post_id = p or x.comment_id in (p, c, rep)));
    -- c. Une cible absente au format réel (la publication supprimée, un identifiant jamais publié) :
    --    les trois fonctions disent FAUX — sans session comme pour l'auteur.
    mes := mes || jsonb_build_object('c_anon', jsonb_build_array(
      public.post_is_visible(p), public.post_is_visible(inconnu), public.comment_target_visible(c),
      public.comment_target_visible(c, p), public.comment_target_visible(rep, p), public.comment_target_visible(inconnu, inconnu)));
    perform set_config('request.jwt.claim.sub', m, true);
    mes := mes || jsonb_build_object('c_auteur', jsonb_build_array(
      public.post_is_visible(p), public.comment_target_visible(c, p), public.comment_target_visible(p)));
    perform set_config('request.jwt.claim.sub', '', true);

    -- d. V supprime SON commentaire sur Q : ses réponses et réactions partent, rien d'autre.
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', v, true);
    execute 'delete from public.post_comments where id = $1' using d;
    get diagnostics k = row_count;  mes := mes || jsonb_build_object('d_supprime', k);
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    mes := mes || jsonb_build_object(
      'd_restes_i', (select count(*) from public.comment_interactions x where x.comment_id = d),
      'd_q', (select count(*) from public.posts x where x.id = q),
      'd_q_like', (select count(*) from public.post_likes x where x.post_id = q),
      'd_q_reaction', (select count(*) from public.comment_interactions x where x.comment_id = q));

    -- e. Suppression EN NOMBRE, comme la purge de compte (une instruction, sans session).
    delete from public.posts where author_id = m;
    get diagnostics k = row_count;  mes := mes || jsonb_build_object('e_supprimees', k);
    mes := mes || jsonb_build_object(
      'e_restes', (select count(*) from public.post_comments x where x.post_id in (q, r1, r2))
                + (select count(*) from public.post_likes x where x.post_id in (q, r1, r2))
                + (select count(*) from public.comment_interactions x where x.post_id in (q, r1, r2) or x.comment_id in (q, r1, r2)));

    -- f. Les exemples, sans session : publications, bobines, activités, et leurs fils.
    mes := mes || jsonb_build_object('f_exemples', jsonb_build_array(
      public.post_is_visible('p1'), public.post_is_visible('pm1'), public.post_is_visible('pn_trail_1'),
      public.post_is_visible('pac_music'), public.post_is_visible('p_ev_jam'), public.post_is_visible('p_ev2_e9'),
      public.post_is_visible('reel_seed_cuisine_1'), public.post_is_visible('e1'),
      public.comment_target_visible('c1', 'p1'), public.comment_target_visible('cp_ev2_e9_0', 'p_ev2_e9'),
      public.comment_target_visible('comment_reel_seed_cuisine_1_0', 'reel_seed_cuisine_1'),
      public.comment_target_visible('ecdemo_e1_0', 'e1'), public.comment_target_visible('pac_music')));
    -- …et l'ancien exemple que le client ne fabrique plus : caché comme un inconnu.
    mes := mes || jsonb_build_object('f_ancien_vlog', public.post_is_visible('p_vlog_marrakech'));

    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';
  exception when others then
    if sqlerrm is distinct from 'passio_verdict_annule' then
      mes := mes || jsonb_build_object('erreur', left(sqlstate || ' ' || sqlerrm, 160));
    end if;
  end;
  -- Après l'annulation : rien ne doit rester du décor.
  mes := mes || jsonb_build_object('restes',
      (select count(*) from public.profiles x where x.id in (m, v, n))
    + (select count(*) from public.follows x where x.follower_id = v or x.following_id = m)
    + (select count(*) from public.posts x where x.id like 'zz\_r31\_%' or x.author_id = m)
    + (select count(*) from public.post_comments x where x.id like 'zz\_r31\_%')
    + (select count(*) from public.post_likes x where x.post_id like 'zz\_r31\_%')
    + (select count(*) from public.post_collaborators x where x.post_id like 'zz\_r31\_%')
    + (select count(*) from public.comment_interactions x where x.id like 'zz\_r31\_%')
    + (select count(*) from public.events x where x.id = 'zz_r31_e_' || sfx)
    + (select count(*) from public.notifications x where x.user_id in (m, v, n) or x.from_id in (m, v, n)));
  if to_regclass('public.event_checkin_secrets') is not null then
    execute 'select count(*) from public.event_checkin_secrets s where s.event_id = $1' into k using 'zz_r31_e_' || sfx;
    mes := mes || jsonb_build_object('restes_secret', k);
  end if;
  perform set_config('passio.verdict_r31', mes::text, true);
end
$verdict$;

-- ── Verdict ──
-- Chaque ligne MESURE ce qu'elle affirme : le comportement par le bloc ④ (lectures
-- sous rôle, suppressions par leur auteur, puis annulées), la purge du passé par
-- différence de comptes (bloc ③), les définitions et les droits par le catalogue.
with v as (select coalesce(nullif(current_setting('passio.verdict_r31', true), ''), '{}')::jsonb as j),
     pu as (select coalesce(nullif(current_setting('passio.r31_purge', true), ''), '{}')::jsonb as j),
     f as (select '^(x[0-9a-z]{8,16}|reel_x[0-9a-z]{8,16}|post_[0-9]{13}_[0-9a-z]{1,9})$'::text as r)
select 'R31 · mesure exécutée : publication privée synthétique, lectures sous anon / authenticated, suppressions par l''auteur, sous-transaction ANNULÉE' as controle,
       (select case when j ? 'erreur' then 'ECHEC — ' || (j->>'erreur')
                    when j ? 'f_exemples' and j ? 'b_restes_i' then 'OK' else 'ECHEC — mesure absente' end from v) as valeur
union all select 'R31 · AVANT suppression : sans compte et pour un non-abonné, 0 commentaire, 0 « j''aime », 0 interaction de la publication privée ; l''abonné accepté lit la réponse de l''auteur (règle inchangée)',
       (select case when (j->>'a_anon_c', j->>'a_anon_l', j->>'a_anon_i', j->>'a_n_c', j->>'a_n_l', j->>'a_n_i', j->>'a_v_reponse_m')
                         = ('0', '0', '0', '0', '0', '0', '1') then 'OK' else 'ECHEC' end from v)
union all select 'R31 · une réaction à une RÉPONSE d''une publication privée (comment_id = srep_…) : illisible sans compte, lue par l''auteur de la publication — le fil décide, pas la cible',
       (select case when (j->>'a_anon_rep', j->>'a_m_rep') = ('0', '1') then 'OK' else 'ECHEC' end from v)
union all select 'R31 · l''auteur supprime sa publication sous SON rôle : commentaires, « j''aime », co-auteurs et interactions (réactions, réponses, réactions aux réponses) partent avec elle — 0 ligne restante',
       (select case when j->>'b_supprimee' = '1' and (j->>'b_restes_c', j->>'b_restes_l', j->>'b_restes_k', j->>'b_restes_i') = ('0', '0', '0', '0') then 'OK' else 'ECHEC' end from v)
union all select 'R31 · une cible absente au format réel (publication supprimée, identifiant jamais publié) : post_is_visible, comment_target_visible(cid) et (cid, pid) disent FAUX, sans compte comme pour l''auteur',
       (select case when j->'c_anon' = '[false, false, false, false, false, false]'::jsonb and j->'c_auteur' = '[false, false, false]'::jsonb then 'OK' else 'ECHEC' end from v)
union all select 'R31 · un commentaire supprimé par son auteur emporte ses réponses et réactions, et rien d''autre (la publication, ses « j''aime », ses autres réactions restent)',
       (select case when j->>'d_supprime' = '1' and (j->>'d_restes_i', j->>'d_q', j->>'d_q_like', j->>'d_q_reaction') = ('0', '1', '1', '1') then 'OK' else 'ECHEC' end from v)
union all select 'R31 · une suppression EN NOMBRE (purge de compte : toutes les publications d''un auteur en une instruction) n''oublie rien',
       (select case when j->>'e_supprimees' = '3' and j->>'e_restes' = '0' then 'OK' else 'ECHEC' end from v)
union all select 'exemples : publications, bobines et activités d''exemple restent publiques sans compte, leurs fils aussi ; un commentaire écrit sur un exemple se lit sans compte, son interaction aussi',
       (select case when j->'f_exemples' = '[true, true, true, true, true, true, true, true, true, true, true, true, true]'::jsonb
                     and (j->>'a_anon_ex_c', j->>'a_anon_ex_i') = ('1', '1') then 'OK' else 'ECHEC' end from v)
union all select 'fil d''activité : une interaction écrite dans une activité existante reste lisible sans compte ; l''ancien exemple p_vlog_… (plus fabriqué) est caché comme un inconnu',
       (select case when j->>'a_anon_ev_i' = '1' and j->>'f_ancien_vlog' = 'false' then 'OK' else 'ECHEC' end from v)
union all select 'aucune trace du décor : profils, abonnement, publications, commentaires, « j''aime », co-auteurs, interactions, activité, notifications, secret de pointage',
       (select case when j->>'restes' = '0' and coalesce(j->>'restes_secret', '0') = '0' then 'OK' else 'ECHEC' end from v)
union all select 'passé · orphelins d''une publication ou activité SUPPRIMÉE effacés — commentaires / « j''aime » / co-auteurs / interactions (plafond)',
       (select (j->'efface'->>'commentaires') || ' / ' || (j->'efface'->>'jaime') || ' / ' || (j->'efface'->>'coauteurs') || ' / ' || (j->'efface'->>'interactions')
               || ' (plafond ' || (j->>'plafond') || ')' from pu)
union all select 'passé · ce qui est parti est exactement ce qui était prévu (aucune autre ligne, rien d''oublié)',
       (select case when j ? 'prevu' and j->'prevu' = j->'efface' then 'OK' else 'ECHEC' end from pu)
union all select 'passé · plus aucun orphelin au format réel : commentaire, « j''aime » ou co-auteur sans publication ; interaction sans publication ni activité',
       case when not exists (select 1 from public.post_comments c where c.post_id ~ (select r from f) and not exists (select 1 from public.posts p where p.id = c.post_id))
             and not exists (select 1 from public.post_likes l where l.post_id ~ (select r from f) and not exists (select 1 from public.posts p where p.id = l.post_id))
             and not exists (select 1 from public.post_collaborators k where k.post_id ~ (select r from f) and not exists (select 1 from public.posts p where p.id = k.post_id))
             and not exists (select 1 from public.comment_interactions i where i.post_id ~ (select r from f)
                               and not exists (select 1 from public.posts p where p.id = i.post_id)
                               and not exists (select 1 from public.events e where e.id = i.post_id)) then 'OK' else 'ECHEC' end
union all select 'laissés · commentaires / « j''aime » sans publication : d''exemples (lisibles) | autres (ancien p_vlog_… : leur seul auteur)',
       (select count(*) from public.post_comments c where not exists (select 1 from public.posts p where p.id = c.post_id) and public.est_identifiant_exemple(c.post_id))::text
       || ' / ' || (select count(*) from public.post_likes l where not exists (select 1 from public.posts p where p.id = l.post_id) and public.est_identifiant_exemple(l.post_id))::text
       || ' | ' || (select count(*) from public.post_comments c where not exists (select 1 from public.posts p where p.id = c.post_id) and not public.est_identifiant_exemple(c.post_id))::text
       || ' / ' || (select count(*) from public.post_likes l where not exists (select 1 from public.posts p where p.id = l.post_id) and not public.est_identifiant_exemple(l.post_id))::text
union all select 'laissés · interactions dans un fil disparu : d''exemples (lisibles) | autres (ancien p_vlog_…, lives et étapes de carnet retirés : leur seul auteur)',
       (select count(*) from public.comment_interactions i where not exists (select 1 from public.posts p where p.id = i.post_id)
          and not exists (select 1 from public.events e where e.id = i.post_id) and public.est_identifiant_exemple(i.post_id))::text
       || ' | ' || (select count(*) from public.comment_interactions i where not exists (select 1 from public.posts p where p.id = i.post_id)
          and not exists (select 1 from public.events e where e.id = i.post_id) and not coalesce(public.est_identifiant_exemple(i.post_id), false))::text
union all select 'définitions : post_is_visible et comment_target_visible(text) ne rendent plus VRAI sur une cible absente hors exemple ; mêmes attributs (SECURITY DEFINER, search_path=public)',
       case when (select count(*) from pg_proc p
                   where p.oid in (to_regprocedure('public.post_is_visible(text)'), to_regprocedure('public.comment_target_visible(text)'), to_regprocedure('public.comment_target_visible(text,text)'))
                     and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=public'
                     and p.prosrc like '%public.est_identifiant_exemple(%'
                     and p.prosrc not like '%then true%' || chr(10) || '    else exists%'
                     and p.prosrc not like '%else true%') = 3 then 'OK' else 'ECHEC' end
union all select 'droits : est_identifiant_exemple et les deux fonctions de purge sans EXECUTE pour PUBLIC, anon ni authenticated ; comment_target_visible(text, text) exécutable par anon et authenticated (la policy l''appelle sous leur rôle), pas par PUBLIC',
       case when (select count(*) from pg_proc p
                   where p.oid in (to_regprocedure('public.est_identifiant_exemple(text)'), to_regprocedure('public.purger_cibles_publications()'), to_regprocedure('public.purger_cibles_commentaires()'))
                     and p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)) = 3
             and not has_function_privilege('anon', 'public.est_identifiant_exemple(text)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.est_identifiant_exemple(text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.purger_cibles_publications()', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.purger_cibles_commentaires()', 'EXECUTE')
             and has_function_privilege('anon', 'public.comment_target_visible(text,text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.comment_target_visible(text,text)', 'EXECUTE')
             and (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
                    from pg_proc p where p.oid = to_regprocedure('public.comment_target_visible(text,text)')) then 'OK' else 'ECHEC' end
union all select 'policy « Lecture selon visibilite de la cible » (comment_interactions) : l''auteur, ou comment_target_visible(comment_id, post_id)',
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comment_interactions'
                          and policyname = 'Lecture selon visibilite de la cible' and cmd = 'SELECT'
                          and qual like '%comment_target_visible(comment_id, post_id)%' and qual like '%user_id = %auth.uid()%') then 'OK' else 'ECHEC' end
union all select 'déclencheurs AFTER DELETE par instruction, actifs : trg_purger_cibles_publication (posts), trg_purger_cibles_commentaire (post_comments)',
       case when (select count(*) from pg_trigger t
                   where not t.tgisinternal and t.tgenabled = 'O'
                     and ((t.tgrelid = 'public.posts'::regclass and t.tgname = 'trg_purger_cibles_publication' and t.tgfoid = to_regprocedure('public.purger_cibles_publications()'))
                       or (t.tgrelid = 'public.post_comments'::regclass and t.tgname = 'trg_purger_cibles_commentaire' and t.tgfoid = to_regprocedure('public.purger_cibles_commentaires()')))
                     and pg_get_triggerdef(t.oid) like '%AFTER DELETE ON public.%REFERENCING OLD TABLE AS %FOR EACH STATEMENT%') = 2 then 'OK' else 'ECHEC' end
union all select 'index idx_ci_post sur comment_interactions (post_id)',
       case when exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.idx_ci_post')
                          and i.indrelid = 'public.comment_interactions'::regclass
                          and pg_get_indexdef(i.indexrelid) like '%(post_id)') then 'OK' else 'ECHEC' end;

commit;
