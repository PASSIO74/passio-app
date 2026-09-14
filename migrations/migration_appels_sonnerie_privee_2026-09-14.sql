-- ═══════════════════════════════════════════════════════════════════════════
-- APPELS — la sonnerie d'un compte ne se lit que par lui (MSG-01 / SUP-06,
-- contre-revue Astra, 2026-09-14)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012),
-- UNE transaction, REJOUABLE, tableau de verdict en fin (4 lignes).
--
-- ⚠️ À COLLER APRÈS que le job « Déploiement production » du lot client
-- (PR « MSG-01/SUP-06 : l'invitation part par HTTP ») soit VERT. Avant ce
-- client, l'appelant S'ABONNAIT à `ring:<pair>` pour y émettre, et Realtime
-- refuse un abonnement privé sans droit de lecture : collée avant, cette
-- migration couperait TOUS les appels sortants — c'est exactement le piège
-- que la migration d'ouverture (2026-09-11) avait dû contourner en laissant
-- tout compte lire toute sonnerie. Le client émet désormais en REST
-- (`httpSend`, gouverné par la policy d'ÉMISSION seule) : la réception peut
-- être resserrée.
--
-- CE QUI CHANGE, et rien d'autre :
--   `passio_rt_recevoir` (SELECT sur realtime.messages, rôle authenticated) :
--     · `ring:<uid>` : lisible UNIQUEMENT si <uid> = auth.uid(). Avant : tout
--       compte non bloqué pouvait s'abonner à la sonnerie de n'importe qui —
--       donc observer qui appelle qui (callId, kind, from), et présenter une
--       invitation sous un autre nom (le client affiche désormais le profil
--       serveur de `from`, mais l'observation restait).
--     · le reste de la policy est repris À L'IDENTIQUE (call:, vlive:,
--       realtime:db, typing:, conv:, conv_specific:).
--   `passio_rt_emettre` et `passio_rt_recevoir_visiteur` : INCHANGÉES. Sonner
--     exige toujours un compte non bloqué (le bloqueur est dans le TOPIC).
--
-- RÉSIDUS ASSUMÉS, écrits pour ne pas être redécouverts :
--   · `call:<id>` reste lisible par tout compte : l'identifiant est un uuid
--     aléatoire (`_callIdAleatoire`) connu des seules deux parties (invitation
--     désormais privée + push chiffré). Le lier aux participants demanderait
--     une table d'appels — autre lot.
--   · l'identité de l'appelant DANS la charge utile reste déclarative : la
--     policy ne voit que le topic. Le client ne l'affiche plus (profil de
--     `from` relu au serveur) ; `from` lui-même n'est pas lié au jeton — une
--     table d'appels le ferait, même lot que ci-dessus.
--
-- Retour arrière : recoller la définition de `passio_rt_recevoir` de
-- `migration_ouverture_publique_2026-09-11.sql` (partie ⑤).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

drop policy if exists "passio_rt_recevoir" on realtime.messages;
create policy "passio_rt_recevoir" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%'
      and substr(realtime.topic(), 6) = (select auth.uid())::text)
  or realtime.topic() like 'call:%'
  or realtime.topic() like 'vlive:%'
  or realtime.topic() = 'realtime:db'
  or (realtime.topic() like 'typing:%'
      and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%'
      and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
  or (realtime.topic() like 'conv_specific:%'
      and public.is_conv_member(substr(realtime.topic(), 15), (select auth.uid())::text))
);

-- ── VERDICT ───────────────────────────────────────────────────────────────
with v(ordre, correctif, ok) as (
  select 1, '① passio_rt_recevoir présente (authenticated)',
         exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                 and policyname = 'passio_rt_recevoir' and roles = '{authenticated}'::name[])
  union all select 2, '① ring:<uid> réservé à son destinataire',
         coalesce((select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                   and policyname = 'passio_rt_recevoir'), '') like '%substr(realtime.topic(), 6) = %auth.uid()%'
         and coalesce((select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                       and policyname = 'passio_rt_recevoir'), '') not like '%ring:%is_blocked_with%'
  union all select 3, '① le reste de la réception est intact (call, vlive, realtime:db, typing, conv, conv_specific)',
         (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'
          and policyname = 'passio_rt_recevoir') like '%call:%'
         and (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'
              and policyname = 'passio_rt_recevoir') like '%realtime:db%'
         and (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'
              and policyname = 'passio_rt_recevoir') like '%conv_specific:%'
  union all select 4, '② émission inchangée : sonner exige un compte non bloqué',
         coalesce((select with_check from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                   and policyname = 'passio_rt_emettre'), '') like '%ring:%'
         and coalesce((select with_check from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                       and policyname = 'passio_rt_emettre'), '') like '%is_blocked_with%'
)
select ordre, correctif, case when ok then 'OK' else 'ECHEC' end as verdict
from v order by ordre;

commit;
