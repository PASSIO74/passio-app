-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — enveloppe `(select auth.uid())` sur les 7 policies de LECTURE restantes.
--
-- ⚠️ PRÉPARÉE, NON APPLIQUÉE. Changement de RLS sur 7 tables : à passer sous
-- supervision, avec la suite cross-compte derrière.
--
-- POURQUOI SEULEMENT 7, ALORS QUE L'ADVISOR EN SIGNALE 85
--
-- Décompte réel après les 3 policies de messagerie déjà corrigées :
--   80 policies portent encore `auth.uid()` nu
--     ├─  7 sont des SELECT  ← les seules qui coûtent
--     └─ 73 sont des écritures
--
-- Une écriture touche UNE ligne : « réévalué par ligne » y signifie « évalué une
-- fois ». Les 73 sont donc un non-sujet, et les toucher serait 73 occasions de
-- se tromper pour zéro gain. Une lecture, elle, balaie autant de lignes que la
-- table en contient — c'est là que la réévaluation se paie, linéairement.
--
-- CE QUE J'AI CRU, ET QUI ÉTAIT FAUX
-- J'ai d'abord écrit que le planificateur remontait déjà `auth.uid()` en
-- InitPlan « parce que la fonction est STABLE », en m'appuyant sur le plan de
-- `posts`. Faux : la policy de `posts` utilisait DÉJÀ `(select auth.uid())`.
-- La contre-épreuve l'a montré — `stories`, même forme mais appel nu, n'a
-- AUCUN InitPlan et développe l'expression inline dans le filtre.
-- C'est l'enveloppe qui produit l'InitPlan, pas le planificateur.
--
-- GAIN MESURÉ sur le cas équivalent déjà traité (conv_messages, 50 lignes) :
--   avant 11,636 ms  →  après 1,136 ms
--
-- SÉMANTIQUE STRICTEMENT IDENTIQUE : `(select auth.uid())` renvoie la même
-- valeur. Seul le moment de l'évaluation change. Aucune ligne ne devient
-- visible ou invisible — c'est vérifiable table par table par la suite
-- cross-compte, qui couvre blocs, stories privées, notifications et user_state.
--
-- ⚠️ SUPPRIMER PAR LE VRAI NOM. Les policies portent ici des noms français avec
-- espaces (« Lecture propre », « Lecture stories respectant les comptes
-- privés »). Un `drop policy` sur un nom deviné ne supprime rien, laisse
-- l'ancienne en place, et comme les permissives se combinent en OU le bénéfice
-- est nul — erreur commise quelques heures plus tôt sur la messagerie.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Contrôle AVANT : doit lister exactement les 7 ───────────────────────────
-- select tablename, policyname, qual from pg_policies
--  where schemaname='public' and cmd='SELECT'
--    and qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%';

-- ── Réécriture générique : on relit la définition réelle et on n'y remplace
--    que la forme d'appel. Aucune expression n'est retapée à la main, donc
--    aucune chance d'en altérer la logique par recopie.
do $$
declare p record; nouvelle text;
begin
  for p in
    select tablename, policyname, qual, roles
      from pg_policies
     where schemaname='public' and cmd='SELECT'
       and qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%'
  loop
    nouvelle := replace(p.qual, 'auth.uid()', '( select auth.uid() )');
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute format('create policy %I on public.%I for select to %s using (%s)',
                   p.policyname, p.tablename,
                   array_to_string(p.roles, ','), nouvelle);
    raise notice 'reecrite : %.%', p.tablename, p.policyname;
  end loop;
end $$;

-- ── Contrôle APRÈS ──────────────────────────────────────────────────────────
-- Doit renvoyer ZÉRO ligne :
-- select tablename, policyname from pg_policies
--  where schemaname='public' and cmd='SELECT'
--    and qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%';
--
-- Puis vérifier qu'un InitPlan apparaît, par exemple sur stories :
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- explain (analyze) select id from public.stories limit 50;
--
-- ET SURTOUT, la seule preuve qui compte :
--   PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite authz-critical blocage-acces
-- Ces suites couvrent précisément les tables touchées — stories de comptes
-- privés, notifications, blocs, état utilisateur.
--
-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
-- Même bloc, en remplaçant '( select auth.uid() )' par 'auth.uid()' dans le
-- sens inverse. Noter les définitions AVANT application pour pouvoir comparer.
-- ═══════════════════════════════════════════════════════════════════════════
