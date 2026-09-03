-- ═══════════════════════════════════════════════════════════════════════════
-- SORTIR LES QUATRE AIDES RLS DU SCHÉMA EXPOSÉ — migration RÉVERSIBLE
--
--   post_is_visible · comment_target_visible · can_edit_post · is_conv_member
--
-- ⚠️ NON APPLIQUÉE. Écrite le 2026-09-03, jamais exécutée : le canal de lecture
--    d'ADR-012 est en `read_only`, et une migration relève du canal ③ (psql
--    depuis un poste, ou le SQL Editor). Voir docs/APPLIQUER_MIGRATION_PASSIONS.md.
--
-- ⚠️ ELLE TOUCHE AUX POLICIES QUI GARDENT LES CONVERSATIONS PRIVÉES.
--    Ne pas l'appliquer sans dérouler le bloc de VÉRIFICATION en fin de fichier,
--    dans la même session, AVANT de valider la transaction.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LE DÉFAUT
--
-- `get_advisors` (2026-09-03) relève quatre fonctions `SECURITY DEFINER`
-- appelables par le rôle `anon` via `/rest/v1/rpc/…`, donc SANS être connecté :
--
--   post_is_visible(pid)              comment_target_visible(cid)
--   can_edit_post(pid)                is_conv_member(_conv_id, _uid)
--
-- `SECURITY DEFINER` veut dire qu'elles s'exécutent en contournant les RLS. Ce
-- sont des aides internes aux policies ; exposées à l'API publique, elles
-- deviennent des ORACLES. La plus parlante est `is_conv_member(conv, uid)` : un
-- inconnu peut demander « ce compte est-il membre de cette conversation ? » et
-- obtenir oui/non. Aucun contenu ne fuit — de la structure sociale, si.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POURQUOI LE REMÈDE ÉVIDENT EST LE MAUVAIS
--
-- L'avis propose « Revoke EXECUTE ». **Ce serait une panne, pas un correctif.**
--
-- Les quatre fonctions sont appelées par HUIT policies, et sept d'entre elles
-- s'appliquent au rôle `{public}` — donc à `anon` compris. Or PASSIO fait
-- entrer un visiteur SANS COMPTE directement dans le fil (`js/first-run.js`,
-- « PREMIÈRE VISITE ») : ce visiteur lit sous le rôle `anon`. PostgreSQL exige
-- le privilège EXECUTE du rôle APPELANT pour évaluer une policy qui appelle une
-- fonction. Révoquer `EXECUTE` à `anon`, c'est donc rendre `post_comments` et
-- `post_likes` illisibles à tout visiteur — la fonctionnalité phare du produit.
--
-- Le bon geste est le troisième que l'avis mentionne : **sortir les fonctions du
-- schéma exposé**. PostgREST ne publie que les schémas exposés (`public`) ; une
-- fonction dans un autre schéma n'a plus de route `/rest/v1/rpc/…`, tout en
-- restant parfaitement appelable par une policy.
--
-- ───────────────────────────────────────────────────────────────────────────
-- CE QUE CETTE MIGRATION NE FAIT PAS
--
--   · Elle ne change AUCUNE règle de visibilité. Les corps des quatre fonctions
--     sont recopiés à l'octet près ; seul leur schéma change, et les appels
--     internes sont requalifiés en conséquence.
--   · Elle ne touche pas aux neuf fonctions appelables par `authenticated`
--     seulement (`declare_birth_year`, `irl_interaction_allowed`, …) : être
--     appelable par un compte connecté est un choix, pas un défaut.
--   · Elle ne règle pas les trois `search_path` mutables, ni `pg_trgm` dans
--     `public`, ni la protection contre les mots de passe compromis (une case à
--     cocher dans Auth, pas du SQL).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① Un schéma que PostgREST n'expose pas.
CREATE SCHEMA IF NOT EXISTS passio_private;
COMMENT ON SCHEMA passio_private IS
  'Aides internes aux policies RLS. HORS du schéma exposé par PostgREST : aucune route /rest/v1/rpc/ ne doit mener ici. Voir migration_fonctions_rls_hors_schema_expose.sql.';

-- Les rôles doivent traverser le schéma pour que les policies s'évaluent,
-- mais USAGE sur un schéma ne publie rien : c'est PostgREST qui décide de
-- l'exposition, et il ne connaît que `public`.
GRANT USAGE ON SCHEMA passio_private TO anon, authenticated, service_role;

-- ② Les quatre fonctions, corps INCHANGÉS.

CREATE OR REPLACE FUNCTION passio_private.post_is_visible(pid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case
    when pid is null then true
    -- Pas de ligne posts = contenu seed/local → public (contenu démo beta)
    when not exists (select 1 from posts where id = pid) then true
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or exists (
          select 1 from follows f
          where f.follower_id = (select auth.uid())::text
            and f.following_id = p.author_id
        )
      )
    )
  end
$function$;

-- ⚠️ L'appel interne était `public.post_is_visible` : il DOIT suivre le
--    déplacement, sinon cette fonction pointerait la version qu'on s'apprête à
--    supprimer — et tomberait à l'étape ④ sans qu'aucune policy ne le dise.
CREATE OR REPLACE FUNCTION passio_private.comment_target_visible(cid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case
    when cid is null then true
    when exists (select 1 from posts where id = cid)
      then passio_private.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid)
      then passio_private.post_is_visible((select post_id from post_comments where id = cid limit 1))
    else true
  end
$function$;

CREATE OR REPLACE FUNCTION passio_private.can_edit_post(pid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = pid AND p.author_id = auth.uid()::text)
      OR EXISTS (SELECT 1 FROM post_collaborators c WHERE c.post_id = pid AND c.user_id = auth.uid()::text);
$function$;

CREATE OR REPLACE FUNCTION passio_private.is_conv_member(_conv_id text, _uid text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $function$;

-- ③ EXECUTE aux rôles qui évaluent les policies. `anon` en fait partie : c'est
--    tout l'objet de la note ci-dessus. On ne donne rien à PUBLIC, alors que
--    deux des versions `public` le faisaient (ACL `=X/postgres`).
REVOKE ALL ON FUNCTION passio_private.post_is_visible(text)              FROM PUBLIC;
REVOKE ALL ON FUNCTION passio_private.comment_target_visible(text)       FROM PUBLIC;
REVOKE ALL ON FUNCTION passio_private.can_edit_post(text)                FROM PUBLIC;
REVOKE ALL ON FUNCTION passio_private.is_conv_member(text, text)         FROM PUBLIC;

GRANT EXECUTE ON FUNCTION passio_private.post_is_visible(text)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION passio_private.comment_target_visible(text)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION passio_private.can_edit_post(text)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION passio_private.is_conv_member(text, text)      TO anon, authenticated, service_role;

-- ④ Les huit policies, repointées. Expressions identiques à celles lues dans
--    `pg_policies` le 2026-09-03 ; seul le schéma de l'appel change.
--    ⚠️ Les rôles sont reproduits tels quels : sept en `public`, UNE seule en
--       `authenticated` (conv_messages_insert_member). Les uniformiser
--       changerait la sûreté.

DROP POLICY IF EXISTS "Lecture selon visibilite de la cible" ON public.comment_interactions;
CREATE POLICY "Lecture selon visibilite de la cible" ON public.comment_interactions
  FOR SELECT TO public
  USING ((user_id = (SELECT auth.uid())::text) OR passio_private.comment_target_visible(comment_id));

DROP POLICY IF EXISTS conv_members_select_member ON public.conv_members;
CREATE POLICY conv_members_select_member ON public.conv_members
  FOR SELECT TO public
  USING (passio_private.is_conv_member(conv_id, (SELECT auth.uid())::text));

DROP POLICY IF EXISTS conv_messages_select_member ON public.conv_messages;
CREATE POLICY conv_messages_select_member ON public.conv_messages
  FOR SELECT TO public
  USING (passio_private.is_conv_member(conv_id, (SELECT auth.uid())::text));

DROP POLICY IF EXISTS conv_messages_insert_member ON public.conv_messages;
CREATE POLICY conv_messages_insert_member ON public.conv_messages
  FOR INSERT TO authenticated
  WITH CHECK ((from_id = (SELECT auth.uid())::text)
              AND passio_private.is_conv_member(conv_id, (SELECT auth.uid())::text));

DROP POLICY IF EXISTS conversations_select_member ON public.conversations;
CREATE POLICY conversations_select_member ON public.conversations
  FOR SELECT TO public
  USING (passio_private.is_conv_member(id, (SELECT auth.uid())::text));

DROP POLICY IF EXISTS "Lecture selon visibilite du post" ON public.post_comments;
CREATE POLICY "Lecture selon visibilite du post" ON public.post_comments
  FOR SELECT TO public
  USING ((author_id = (SELECT auth.uid())::text) OR passio_private.post_is_visible(post_id));

DROP POLICY IF EXISTS "Lecture selon visibilite du post" ON public.post_likes;
CREATE POLICY "Lecture selon visibilite du post" ON public.post_likes
  FOR SELECT TO public
  USING ((user_id = (SELECT auth.uid())::text) OR passio_private.post_is_visible(post_id));

DROP POLICY IF EXISTS "Update propre" ON public.posts;
CREATE POLICY "Update propre" ON public.posts
  FOR UPDATE TO public
  USING (passio_private.can_edit_post(id))
  WITH CHECK (passio_private.can_edit_post(id));

-- ⑤ Les versions exposées disparaissent. `DROP` échouerait si une policy y
--    tenait encore : c'est le filet — un échec ici signifie qu'une policy a été
--    oubliée à l'étape ④, et la transaction entière est annulée.
DROP FUNCTION IF EXISTS public.comment_target_visible(text);
DROP FUNCTION IF EXISTS public.post_is_visible(text);
DROP FUNCTION IF EXISTS public.can_edit_post(text);
DROP FUNCTION IF EXISTS public.is_conv_member(text, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION — à dérouler AVANT le COMMIT, dans la même session.
--
--   (a) Plus aucune des quatre dans le schéma exposé. Doit rendre 0 ligne :
--
--       SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--       WHERE n.nspname='public' AND p.proname IN
--         ('post_is_visible','comment_target_visible','can_edit_post','is_conv_member');
--
--   (b) Les huit policies pointent le schéma privé. Doit rendre 8 lignes :
--
--       SELECT tablename, policyname FROM pg_policies
--       WHERE schemaname='public'
--         AND (COALESCE(qual,'')||COALESCE(with_check,'')) LIKE '%passio_private.%';
--
--   (c) Aucune policy ne référence encore une aide non qualifiée. Doit rendre
--       0 ligne. (Écrite en `NOT LIKE` et non en contrainte de recul : une
--       requête de contrôle ne doit dépendre d'aucune subtilité de moteur.)
--
--       SELECT tablename, policyname FROM pg_policies
--       WHERE schemaname='public'
--         AND (COALESCE(qual,'')||COALESCE(with_check,''))
--             ~ '(post_is_visible|comment_target_visible|can_edit_post|is_conv_member)'
--         AND (COALESCE(qual,'')||COALESCE(with_check,'')) NOT LIKE '%passio_private.%';
--
--   (d) ÉPREUVE FONCTIONNELLE, la seule qui compte vraiment. Les trois
--       précédentes disent que le SQL est cohérent, pas que le produit marche.
--       En navigation privée, sans compte : le fil doit s'afficher AVEC ses
--       commentaires et ses compteurs de j'aime. Puis, connecté : une
--       conversation privée doit s'ouvrir et se répondre.
--       Si (d) échoue, ROLLBACK — pas de correctif à chaud sur les policies des
--       messages privés.
--
-- COMMIT;   -- ← à décommenter seulement après (a), (b), (c) ET (d).
-- ═══════════════════════════════════════════════════════════════════════════

ROLLBACK;  -- Filet par défaut : ce fichier ne valide RIEN tant qu'on ne l'a pas
           -- édité sciemment. Remplacer par COMMIT une fois les quatre
           -- vérifications passées.

-- ═══════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE
--
-- Si la migration a été validée et qu'il faut revenir : rejouer les quatre
-- `CREATE OR REPLACE FUNCTION public.…` avec les corps d'origine (ils sont
-- recopiés ci-dessus, seul le préfixe de schéma change, et l'appel interne de
-- `comment_target_visible` redevient `public.post_is_visible`), recréer les huit
-- policies sans le préfixe `passio_private.`, puis :
--
--   DROP SCHEMA passio_private CASCADE;
--
-- Le retour arrière RÉTABLIT le défaut signalé par get_advisors. Il se justifie
-- par une panne constatée, jamais par prudence.
-- ═══════════════════════════════════════════════════════════════════════════
