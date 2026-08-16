-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — remonter auth.uid() en InitPlan sur les TROIS policies de messagerie.
--
-- CE QUE CETTE MIGRATION N'EST PAS : le traitement des 85 avertissements
-- `auth_rls_initplan`. Ces 85 ne sont pas 85 problèmes. Mesuré le 2026-08-16 :
--
--   posts         → le planificateur remonte DÉJÀ auth.uid() en InitPlan
--                   (« Filter: author_id = ((InitPlan 1).col1)::text »), parce
--                   que la fonction est STABLE et comparée directement à une
--                   colonne. L'avertissement est théoriquement juste, mais sans
--                   effet ici.
--
--   conv_messages → AUCUN InitPlan. `auth.uid()` est développé À L'INTÉRIEUR du
--                   filtre, parce qu'il est ARGUMENT d'une fonction qui prend
--                   aussi une colonne (`conv_id`) : le planificateur ne peut
--                   rien remonter.
--                   « Filter: is_conv_member(conv_id, <auth.uid() inline>) »
--                   50 lignes → 11,6 ms, soit ~0,23 ms par ligne.
--
-- Sur les 7 policies qui appellent un helper avec une colonne, QUATRE utilisent
-- déjà `(select auth.uid())` — comment_interactions, post_comments, post_likes.
-- Trois ont gardé la forme nue, et ce sont les trois de la messagerie : le
-- correctif avait été appliqué à un endroit sur deux. Même motif que le base64
-- de `_syncableState`, expurgé pour les profils passion et pas pour le compte.
--
-- SÉMANTIQUE STRICTEMENT IDENTIQUE : `(select auth.uid())` renvoie la même
-- valeur que `auth.uid()`. Seul le moment de l'évaluation change — une fois au
-- lieu d'une par ligne. Aucune ligne ne devient visible ou invisible.
--
-- CE QUE ÇA NE RÉGLE PAS : `is_conv_member(conv_id, …)` reste appelée par ligne,
-- puisque `conv_id` varie. Pour l'éliminer il faudrait réécrire la policy en
-- semi-jointure (`EXISTS (select 1 from conv_members …)`) afin que le
-- planificateur puisse utiliser un index. C'est un autre chantier, avec un vrai
-- risque sémantique — celui-ci n'en a aucun.
--
-- ⚠️ Table des MESSAGES PRIVÉS : à vérifier par la suite cross-compte après
-- application (multi-comptes couvre messagerie texte + vocal + realtime).
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ Supprimer les policies SELECT existantes PAR LEUR VRAI NOM, pas par un nom
-- deviné. Premier essai : j'avais écrit `drop policy if exists
-- conv_messages_select_member` — nom inventé, qui n'a rien supprimé. Les
-- anciennes ("Membres lisent les messages", en français, avec espaces) sont
-- restées, et comme les policies permissives se combinent en OU, la forme nue
-- continuait de s'exécuter : bénéfice nul, et un doublon de plus.
--
-- Le bloc balaie donc ce qui existe réellement, quel que soit son nom.
do $$
declare t text; p record;
begin
  foreach t in array array['conv_messages','conv_members','conversations'] loop
    for p in select policyname from pg_policies
             where schemaname='public' and tablename=t and cmd='SELECT'
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy conv_messages_select_member on public.conv_messages
  for select using (is_conv_member(conv_id, ((select auth.uid()))::text));

create policy conv_members_select_member on public.conv_members
  for select using (is_conv_member(conv_id, ((select auth.uid()))::text));

create policy conversations_select_member on public.conversations
  for select using (is_conv_member(id, ((select auth.uid()))::text));

-- ── RÉSULTAT MESURÉ (50 lignes, même requête, même rôle) ────────────────────
--   avant : Filter: is_conv_member(conv_id, <auth.uid() développé inline>)
--           Execution Time: 11,636 ms
--   après : InitPlan 1
--           Filter: is_conv_member(conv_id, ((InitPlan 1).col1)::text)
--           Execution Time:  1,136 ms
-- Soit 10× sur un jeu minuscule. L'InitPlan est structurel, pas une variation
-- de mesure : il apparaît dans le plan.

-- ── CONTRÔLE APRÈS APPLICATION ──────────────────────────────────────────────
-- Les trois doivent afficher « SELECT auth.uid() » et non « auth.uid() » nu :
-- select tablename, qual from pg_policies
--  where schemaname='public' and tablename in ('conv_messages','conv_members','conversations')
--    and cmd='SELECT';
--
-- Puis re-mesurer le plan — un InitPlan doit apparaître :
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- explain (analyze) select id from public.conv_messages limit 50;
--
-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
--   drop policy if exists conv_messages_select_member on public.conv_messages;
--   create policy conv_messages_select_member on public.conv_messages
--     for select using (is_conv_member(conv_id, (auth.uid())::text));
--   (idem conv_members et conversations)
-- ═══════════════════════════════════════════════════════════════════════════
