-- ═══════════════════════════════════════════════════════════════════════════
-- SUPPRESSION DE COMPTE — une écriture arrivée APRÈS le comptage survivait
-- (ASTRA-25, quatrième contre-revue indépendante, 2026-09-15 · AUTH-05 / SUP-10)
--
-- LE DÉFAUT. `purgerCompte` efface, RELIT, et — quand une ligne est réapparue —
-- efface une seconde fois puis relit. C'est une passe de plus, pas une barrière.
-- Une écriture qui arrive APRÈS le comptage de SA table et AVANT la relecture
-- finale survit à la purge, et « supprimer mon compte » répond `ok`.
-- Reproduit par la contre-revue : écrire `user_state` après son comptage, au
-- moment où `profiles` est relu → `ok: true`, ligne restante.
--
-- ⚠️ AUCUN NOMBRE DE PASSES NE FERME CETTE FENÊTRE. Le gel posé côté client
-- (`_accountPurged`, `purgeAccountScopedData`) ne vaut que pour CE navigateur :
-- un second appareil, un onglet resté ouvert, une requête déjà en vol, un
-- ancien jeton encore valide (PostgREST ne vérifie que la signature, pas le
-- bannissement GoTrue, jusqu'à l'expiration) écrivent quand même. Et
-- `user_state` n'a AUCUNE clé étrangère vers `auth.users` : rien, côté base, ne
-- l'emporte avec le compte. Ajouter une boucle ou une attente arbitraire
-- déplacerait la fenêtre sans la fermer — c'est ce que la contre-revue interdit
-- explicitement.
--
-- LA BARRIÈRE. `public.comptes_en_suppression` marque le compte AVANT le
-- premier comptage ; les policies d'écriture la consultent et REFUSENT. À
-- partir de là, la seconde relecture est SUFFISANTE : plus aucune écriture
-- nouvelle ne peut arriver. Ce qui est encore là vient d'une requête partie
-- avant la barrière, la relecture la voit, et la purge est RELANÇABLE — chaque
-- geste est idempotent.
--
-- ⚠️ `suppression_de_mon_compte()` NE RÉPOND QUE SUR L'APPELANT — jamais sur un
-- compte quelconque. Une fonction `suppression_en_cours(uid)` aurait été un
-- ORACLE (« ce compte est-il en cours de suppression ? »), c'est-à-dire
-- exactement la fuite fermée sur `is_conv_member` le 11/09. Elle est donc
-- bornée à `auth.uid()`, et `authenticated` a le droit de l'appeler parce que
-- les policies l'évaluent AU RÔLE COURANT (la suggestion inverse de la red team
-- du 11/09 était fausse : SECURITY DEFINER change le rôle DANS la fonction,
-- l'APPEL exige toujours EXECUTE).
--
-- ⚠️ ELLE S'EFFACE SANS SESSION. `auth.uid()` NULL (postgres, service_role,
-- restauration, purge elle-même) → `false`. Sans cette sortie, la purge se
-- ferait refuser SES PROPRES écritures, et une restauration ne pourrait plus
-- recharger un compte marqué.
--
-- ⚠️ LA BARRIÈRE NE BLOQUE PAS LA SUPPRESSION. Seuls INSERT et UPDATE sont
-- gardés : DELETE reste libre, sinon la purge ne pourrait rien effacer et un
-- retrait légitime (se désinscrire, retirer sa ligne) serait bloqué pendant la
-- fenêtre.
--
-- ⚠️ LE MARQUAGE EST RÉVERSIBLE, ET C'EST INDISPENSABLE : une purge
-- interrompue (réseau, plafond, refus) doit pouvoir être RELANCÉE, et un compte
-- dont la suppression échoue définitivement doit redevenir utilisable. Le
-- retrait du marqueur est un geste de `service_role`, jamais du client.
--
-- Rejouable. Verdict en fin. Retour arrière :
--   -- retirer la clause des policies (elle est idempotente, la re-jouer ne
--   -- l'ajoute pas deux fois), puis :
--   drop function if exists public.suppression_de_mon_compte();
--   drop table if exists public.comptes_en_suppression;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ① Le marqueur ───────────────────────────────────────────────────────────
create table if not exists public.comptes_en_suppression (
  user_id     text primary key,
  demandee_le timestamptz not null default now(),
  motif       text
);
alter table public.comptes_en_suppression enable row level security;
-- Aucune policy, aucun GRANT : `anon` et `authenticated` n'y accèdent JAMAIS.
-- Son inaccessibilité EST sa protection — même patron qu'`access_policies`
-- (interrupteur 18+), et l'avertissement `rls_enabled_no_policy` du linter est
-- attendu, pas un défaut.
revoke all on public.comptes_en_suppression from public;
revoke all on public.comptes_en_suppression from anon;
revoke all on public.comptes_en_suppression from authenticated;
grant select, insert, delete on public.comptes_en_suppression to service_role;
-- ⚠️ LA LIGNE SURVIT À LA PURGE RÉUSSIE, ET C'EST DÉLIBÉRÉ. Un jeton d'accès
-- déjà émis reste signé valide jusqu'à son expiration : PostgREST n'interroge
-- pas GoTrue. Lever la barrière au succès rouvrirait donc exactement la fenêtre
-- qu'elle ferme. Elle n'est levée QUE si la purge n'aboutit pas
-- (`leverBarriere`, purge-compte.js), pour qu'un compte non supprimé redevienne
-- utilisable et que la purge soit relançable.
-- ⚠️ CE QUI RESTE EST DONC UN IDENTIFIANT ORPHELIN, SANS RÈGLE DE PURGE. Il ne
-- porte ni e-mail, ni contenu, ni lien lisible vers une donnée — la ligne
-- `auth.users` a disparu — mais c'est un uuid conservé sans échéance, et aucune
-- décision de rétention n'a été prise. Elle appartient au propriétaire : la
-- borne naturelle est l'expiration du dernier jeton possible (durée de vie du
-- jeton de rafraîchissement). Écrit ici pour être décidé, pas deviné.

-- ② Le prédicat, borné à l'appelant ───────────────────────────────────────
create or replace function public.suppression_de_mon_compte()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false          -- postgres, service_role, purge, restauration
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text)
  end
$$;

comment on function public.suppression_de_mon_compte() is
  'Le compte APPELANT est-il en cours de suppression ? Ne répond jamais sur un autre compte : ce serait un oracle (ASTRA-25).';

revoke execute on function public.suppression_de_mon_compte() from public;
revoke execute on function public.suppression_de_mon_compte() from anon;
grant execute on function public.suppression_de_mon_compte() to authenticated;
grant execute on function public.suppression_de_mon_compte() to service_role;

-- ③ La clause, ajoutée aux policies d'ÉCRITURE des tables du compte ────────
-- ⚠️ ON RÉÉCRIT LES POLICIES EXISTANTES, on n'en ajoute pas : deux policies
-- PERMISSIVES sur la même commande s'additionnent par OU — une policy neuve
-- « et pas en suppression » n'aurait RIEN bloqué, elle aurait ouvert une
-- seconde porte. C'est le piège central de ce lot.
-- ⚠️ IDEMPOTENT : on saute toute policy qui porte déjà la clause.
-- ⚠️ UPDATE SANS `with_check` : PostgreSQL y utilise le `USING`. On pose donc
-- `with check (<qual> and not …)`, ce qui PRÉSERVE le contrôle implicite et
-- ajoute la barrière — l'omettre laisserait l'UPDATE libre.
do $$
declare
  r record;
  expr text;
  n integer := 0;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname, p.cmd, p.qual, p.with_check
      from pg_policies p
     -- ⚠️ PARENTHÈSES OBLIGATOIRES : `and` lie plus fort qu'`or`. Écrite sans
     -- elles, cette clause n'appliquait le filtre `cmd` qu'à la branche
     -- `storage` — toutes les policies SELECT et DELETE de `public` entraient
     -- dans la boucle. La garde interne les écartait, mais une garde qui
     -- rattrape une requête fausse est une garde qu'on finira par retirer en
     -- croyant simplifier.
     where p.cmd in ('INSERT','UPDATE','ALL')
       and ((p.schemaname = 'public' and p.tablename in (
             'posts','post_likes','post_comments','post_collaborators','comment_interactions','comment_likes',
             'stories','story_views','events','event_attendees','event_comments','event_reactions',
             'conv_messages','conv_members','conv_reads','call_invites','notifications','follows','blocks',
             'push_subscriptions','user_state','user_safety','user_passions','passion_requests',
             'step_interactions','video_lives','profiles',
             'cdv_lives','cdv_live_steps','cdv_live_comments','cdv_live_reactions','cdv_live_followers','cdv_live_collaborators'))
            or (p.schemaname = 'storage' and p.tablename = 'objects'))
  loop
    -- Garde de ceinture : `alter policy … with check` LÈVE sur une policy
    -- SELECT ou DELETE. La requête ne doit plus en rendre, celle-ci le confirme.
    if r.cmd not in ('INSERT','UPDATE','ALL') then continue; end if;
    expr := coalesce(r.with_check, r.qual);
    if expr is null then continue; end if;                       -- rien à durcir
    if position('suppression_de_mon_compte' in expr) > 0 then continue; end if;  -- déjà posée
    execute format('alter policy %I on %I.%I with check (%s and not public.suppression_de_mon_compte())',
                   r.policyname, r.schemaname, r.tablename, expr);
    n := n + 1;
  end loop;
  raise notice 'barrière posée sur % policy(ies) d''écriture', n;
end $$;

-- ── VERDICT ────────────────────────────────────────────────────────────────
select 'table du marqueur posée, sans droit client' as controle,
       case when exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'comptes_en_suppression')
             and not has_table_privilege('anon', 'public.comptes_en_suppression', 'SELECT')
             and not has_table_privilege('authenticated', 'public.comptes_en_suppression', 'SELECT')
            then 'OK' else 'ECHEC' end as valeur
union all select 'RLS active sur le marqueur',
       case when (select relrowsecurity from pg_class where oid = 'public.comptes_en_suppression'::regclass) then 'OK' else 'ECHEC' end
union all select 'le prédicat ne répond que sur l''appelant (aucun argument)',
       case when (select count(*) from pg_proc where proname = 'suppression_de_mon_compte' and pronargs = 0) = 1 then 'OK' else 'ECHEC' end
union all select 'SECURITY DEFINER, search_path vide',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""'
                    from pg_proc where proname = 'suppression_de_mon_compte') then 'OK' else 'ECHEC' end
union all select 'il s''efface sans session (purge, restauration)',
       case when (select prosrc from pg_proc where proname = 'suppression_de_mon_compte') like '%auth.uid() is null then false%' then 'OK' else 'ECHEC' end
union all select 'anon ne peut pas l''appeler ; authenticated oui (les policies l''évaluent au rôle courant)',
       case when not has_function_privilege('anon', 'public.suppression_de_mon_compte()', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.suppression_de_mon_compte()', 'EXECUTE')
            then 'OK' else 'ECHEC' end
-- ⚠️ UNE PROPRIÉTÉ RELATIVE, JAMAIS UN NOMBRE. Une première rédaction exigeait
-- « au moins 15 policies gardées » : elle rendait ECHEC sur une base de banc
-- qui n'en a que six, c'est-à-dire sur une migration parfaitement appliquée.
-- Un verdict qui mesure la TAILLE de l'environnement au lieu de l'EFFET de la
-- migration ment dans les deux sens. Ce qui compte : qu'il n'en reste AUCUNE
-- sans barrière.
union all select 'aucune policy d''écriture des tables du compte n''est restée sans barrière',
       case when not exists (
         select 1 from pg_policies p
          where p.cmd in ('INSERT','UPDATE','ALL')
            and ((p.schemaname = 'public' and p.tablename in (
                   'posts','post_likes','post_comments','post_collaborators','comment_interactions','comment_likes',
                   'stories','story_views','events','event_attendees','event_comments','event_reactions',
                   'conv_messages','conv_members','conv_reads','call_invites','notifications','follows','blocks',
                   'push_subscriptions','user_state','user_safety','user_passions','passion_requests',
                   'step_interactions','video_lives','profiles',
                   'cdv_lives','cdv_live_steps','cdv_live_comments','cdv_live_reactions','cdv_live_followers','cdv_live_collaborators'))
                 or (p.schemaname = 'storage' and p.tablename = 'objects'))
            and coalesce(p.with_check, p.qual) is not null
            and coalesce(p.with_check, '') not like '%suppression_de_mon_compte%'
       ) then 'OK' else 'ECHEC' end
union all select 'aucune policy DELETE n''est gardée (la purge doit pouvoir effacer)',
       case when (select count(*) from pg_policies
                   where cmd = 'DELETE' and coalesce(with_check, qual, '') like '%suppression_de_mon_compte%') = 0 then 'OK' else 'ECHEC' end
union all select 'user_state, profiles et conv_reads sont gardées (les trois mesurées par la contre-revue)',
       case when (select count(distinct tablename) from pg_policies
                   where tablename in ('user_state','profiles','conv_reads')
                     and coalesce(with_check, '') like '%suppression_de_mon_compte%') = 3 then 'OK' else 'ECHEC' end;

commit;
