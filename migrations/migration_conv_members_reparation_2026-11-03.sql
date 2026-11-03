-- ═══════════════════════════════════════════════════════════════════════════
-- MESSAGERIE — LES PARTICIPANTS D'UN 1:1 RETROUVENT LEUR LIGNE `conv_members`
-- AVANT QUE `conv_reads` NE SE FERME AUX NON-MEMBRES (revue 10b, R6, 2026-11-03)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (11 lignes : neuf
-- NOMBRES et deux contrôles OK/ECHEC). Rien de personnel dans ce fichier ni
-- dans son verdict : des comptes de lignes et un numéro de transaction.
--
-- ⚠️ ORDRE : à appliquer AVANT `migration_audit_2026-11-02_oracles_et_privileges.sql`.
-- Celle-ci ajoute `is_conv_member(conv_id, auth.uid())` aux policies INSERT et
-- UPDATE de `conv_reads` : un participant sans ligne `conv_members` y verra
-- chacun de ses accusés de lecture refusé. Le client sait réparer — mais
-- `_reparerAppartenanceConv` (app-04) passe par la policy INSERT « Ecriture
-- propre » de `conv_members`, qui n'admet que le CRÉATEUR de la conversation
-- (ou l'inscription à une discussion d'activité) : le PAIR d'un 1:1 ne peut pas
-- se réinscrire lui-même. Le réparer, c'est le travail du serveur.
--
-- MESURÉ EN PRODUCTION le 2026-11-03 au canal ① (lecture seule, agrégats) :
--   · aucune conversation de groupe (`is_group`) hors discussions d'activité ;
--     2 discussions d'activité (`evgrp_<événement>`) ; 125 conversations 1:1,
--     dont 115 SANS AUCUN membre ni message (l'héritage d'avant le
--     2026-06-11 : rien à réparer — personne n'y a écrit, et le pair n'y est
--     déclaré nulle part) et 10 qui portent leurs deux membres ;
--   · UN SEUL couple (conversation, émetteur) sans ligne `conv_members`, dans
--     un 1:1 qui porte DÉJÀ ses deux membres (créateur et pair) : l'émetteur
--     est un TROISIÈME compte (2 messages, mi-août), ni créateur ni pair
--     déclaré. Il n'est PAS réinscrit : lui rendre l'appartenance lui rouvrirait
--     la lecture d'une conversation entre deux autres personnes. Ses accusés
--     de lecture seront refusés après la migration des oracles — c'est
--     exactement ce qu'elle veut (l'une des 9 lignes « non membre » qu'elle a
--     mesurées). Cette migration-ci n'insère donc AUCUNE ligne aujourd'hui :
--     elle est le filet de l'état à l'instant de l'application, et son verdict
--     le dira.
--
-- LA RÈGLE (et rien d'autre ne reçoit de ligne) :
--   · conversation 1:1 seulement : `coalesce(is_group, false) = false` ET
--     identifiant hors `evgrp_%`. Jamais un groupe ni une discussion
--     d'activité : quelqu'un qui en est PARTI (`leaveGroup`,
--     `supaLeaveEventConversation`, ou retiré par le créateur) ne doit pas y
--     être réinscrit ;
--   · conversation au créateur connu (`created_by` non nul) et LISIBLE comme un
--     1:1 : au plus UN membre autre que le créateur, et — si aucun n'est
--     inscrit — au plus UN émetteur autre que lui. Au-delà, ce n'est plus un
--     1:1 qu'on sait lire : on n'y touche pas (`ambigu`) ;
--   · le PAIR DÉCLARÉ est ce membre autre que le créateur (c'est la ligne que
--     `supaCreateConversation` écrit à la création) ; à défaut de membre, le
--     seul autre émetteur de la conversation ;
--   · on n'inscrit que le CRÉATEUR ou ce PAIR, et seulement s'il a écrit au
--     moins un message dans CETTE conversation ;
--   · jamais un compte en suppression (même liste de statuts que la barrière
--     `zz_barriere_suppression`, qui ferait sinon tomber toute la
--     transaction), jamais sans profil, jamais quand l'un a BLOQUÉ l'autre ;
--   · `on conflict do nothing` (un client qui répare au même instant n'est pas
--     une erreur).
--
-- RETOUR ARRIÈRE (exact). `conv_members` ne porte AUCUNE colonne de date : une
-- ligne réparée est, après coup, indiscernable d'une ligne d'origine par son
-- contenu. Elle l'est par sa transaction : toutes les lignes insérées ici
-- portent le même `xmin`, celui de CETTE transaction, que le verdict imprime
-- (« transaction … ») et que `public.migrations_appliquees.verdict` conserve
-- quand la migration passe par `npm run migration:appliquer`. Le retour arrière
-- efface les lignes de ce `xmin` — et REFUSE si leur nombre n'est pas celui du
-- verdict (une ligne réécrite, une restauration par dump, un numéro de
-- transaction recyclé changent ce nombre : on ne devine pas, on s'arrête).
-- Remplacer <XID> et <N> par les valeurs du verdict, puis exécuter :
--| do $$
--| declare
--|   x       xid := '<XID>';
--|   attendu int := <N>;
--|   n       int;
--| begin
--|   select count(*) into n from public.conv_members where xmin = x;
--|   if n <> attendu then
--|     raise exception 'retour arrière refusé : % ligne(s) portent ce xmin, % attendue(s) — rien n''est effacé', n, attendu;
--|   end if;
--|   delete from public.conv_members where xmin = x;
--| end $$;
-- Le retour arrière recrée le défaut : le participant retrouve des accusés de
-- lecture refusés dès que la migration des oracles est en place.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── ① Les couples (conversation, émetteur) sans appartenance, classés ──
create temp table _cmr_couples on commit drop as
with conv as (
  select c.id, c.created_by,
         case when c.id like 'evgrp\_%' then 'evgrp'
              when coalesce(c.is_group, false) then 'groupe'
              else '1a1' end as genre
    from public.conversations c
), autres_membres as (
  select cm.conv_id, count(*) as n, min(cm.user_id) as seul
    from public.conv_members cm
    join conv on conv.id = cm.conv_id
   where cm.user_id is distinct from conv.created_by
   group by cm.conv_id
), autres_emetteurs as (
  select m.conv_id, count(distinct m.from_id) as n, min(m.from_id) as seul
    from public.conv_messages m
    join conv on conv.id = m.conv_id
   where m.from_id is not null and m.from_id is distinct from conv.created_by
   group by m.conv_id
), un_a_un as (
  select conv.id as conv_id,
         coalesce(am.n, 0) as n_membres,
         coalesce(ae.n, 0) as n_emetteurs,
         case when coalesce(am.n, 0) = 1 then am.seul
              when coalesce(am.n, 0) = 0 and coalesce(ae.n, 0) = 1 then ae.seul end as pair
    from conv
    left join autres_membres am on am.conv_id = conv.id
    left join autres_emetteurs ae on ae.conv_id = conv.id
   where conv.genre = '1a1'
), manquants as (
  select distinct m.conv_id, m.from_id as user_id
    from public.conv_messages m
   where m.from_id is not null
     and not exists (select 1 from public.conv_members cm where cm.conv_id = m.conv_id and cm.user_id = m.from_id)
)
select x.conv_id, x.user_id,
       case
         when conv.id is null then 'sans_conversation'
         when conv.genre <> '1a1' then conv.genre
         when conv.created_by is null then 'sans_createur'
         when u.n_membres >= 2 or (u.n_membres = 0 and u.n_emetteurs >= 2) then 'ambigu'
         when x.user_id is distinct from conv.created_by and x.user_id is distinct from u.pair then 'tiers'
         when not exists (select 1 from public.profiles p where p.id = x.user_id) then 'profil_absent'
         when exists (select 1 from public.comptes_en_suppression s where s.user_id = x.user_id and s.statut in ('en_cours', 'purgee', 'supprimee')) then 'compte_en_suppression'
         when u.pair is not null and exists (select 1 from public.blocks b where (b.blocker_id = conv.created_by and b.blocked_id = u.pair) or (b.blocker_id = u.pair and b.blocked_id = conv.created_by)) then 'blocage'
         else 'reparable'
       end as issue
  from manquants x
  left join conv on conv.id = x.conv_id
  left join un_a_un u on u.conv_id = x.conv_id;

-- ── ② La réparation : le créateur ou le pair déclaré d'un 1:1, rien d'autre ──
insert into public.conv_members (conv_id, user_id)
select conv_id, user_id from _cmr_couples where issue = 'reparable'
on conflict (conv_id, user_id) do nothing;

-- ── Verdict (nombres seulement) ──
select 'couples (conversation, émetteur) sans appartenance, AVANT' as controle, (select count(*) from _cmr_couples)::text as valeur
union all select 'dont réparables (1:1, créateur ou pair déclaré, compte vivant, sans blocage)', (select count(*) from _cmr_couples where issue = 'reparable')::text
union all select 'laissés : groupes', (select count(*) from _cmr_couples where issue = 'groupe')::text
union all select 'laissés : discussions d''activité evgrp_', (select count(*) from _cmr_couples where issue = 'evgrp')::text
union all select 'laissés : tiers d''un 1:1 (ni créateur ni pair déclaré)', (select count(*) from _cmr_couples where issue = 'tiers')::text
union all select 'laissés : 1:1 ambigu, sans créateur, profil absent, compte en suppression ou blocage', (select count(*) from _cmr_couples where issue not in ('reparable', 'groupe', 'evgrp', 'tiers'))::text
union all select 'lignes conv_members insérées par cette transaction', (select count(*) from public.conv_members where xmin = pg_current_xact_id()::xid)::text
union all select 'couples (conversation, émetteur) sans appartenance, APRÈS',
       (select count(*) from (select distinct m.conv_id, m.from_id from public.conv_messages m
                               where m.from_id is not null
                                 and not exists (select 1 from public.conv_members cm where cm.conv_id = m.conv_id and cm.user_id = m.from_id)) s)::text
union all select 'aucun couple réparable ne reste sans appartenance',
       case when not exists (select 1 from _cmr_couples t where t.issue = 'reparable'
                              and not exists (select 1 from public.conv_members cm where cm.conv_id = t.conv_id and cm.user_id = t.user_id))
            then 'OK' else 'ECHEC' end
union all select 'toute ligne insérée est un couple réparable (aucun groupe, evgrp_, tiers)',
       case when not exists (select 1 from public.conv_members cm where cm.xmin = pg_current_xact_id()::xid
                              and not exists (select 1 from _cmr_couples t where t.conv_id = cm.conv_id and t.user_id = cm.user_id and t.issue = 'reparable'))
            then 'OK' else 'ECHEC' end
union all select 'transaction (xmin des lignes insérées, pour le retour arrière)', pg_current_xact_id()::xid::text;

commit;
