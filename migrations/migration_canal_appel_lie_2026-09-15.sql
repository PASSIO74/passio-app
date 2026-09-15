-- ═══════════════════════════════════════════════════════════════════════════
-- APPELS — le canal `call:<id>` est lié à SES DEUX PARTIES (ASTRA-23)
--
-- LE DÉFAUT, MESURÉ EN PRODUCTION LE 2026-09-15 (canal ① d'ADR-012) :
--   passio_rt_emettre  : « realtime.topic() like 'call:%' » — SANS condition.
--   passio_rt_recevoir : « realtime.topic() like 'call:%' » — SANS condition.
-- Tout compte authentifié qui connaît un `callId` peut donc LIRE le canal
-- d'appel (l'offre SDP et ses candidats ICE, c'est-à-dire les ADRESSES IP des
-- deux correspondants) ET y ÉMETTRE (`hangup` pour couper la communication,
-- `offer`/`answer` pour tenter de s'y substituer). Ce ne sont pas deux défauts :
-- c'est le même topic laissé sans propriétaire.
--
-- ⚠️ CE LOT NE DÉCOUVRE RIEN : IL FAIT LE « LOT SUIVANT » QUI AVAIT ÉTÉ NOMMÉ.
-- `migration_appels_sonnerie_privee_2026-09-14.sql` écrit le résidu en toutes
-- lettres : « `call:<id>` reste lisible par tout compte […] Le lier aux
-- participants demanderait une table d'appels — autre lot. » Cette table est
-- née le lendemain (`public.call_invites`, MSG-01/SUP-06) et elle est EN
-- PRODUCTION (table, RLS, `appel_autorise`, trigger de sonnerie : mesurés).
-- La matière qui manquait existe ; ce qui restait, c'est de s'en servir.
--
-- ⚠️ L'ALÉA DE L'IDENTIFIANT N'ÉTAIT PAS UN CONTRÔLE, ET NE POUVAIT PAS L'ÊTRE.
-- `_callIdAleatoire()` (2026-09-11) a fermé la DEVINETTE — l'ancien
-- `<uid>_<horodatage>` se reconstituait. Il ne ferme pas la CONNAISSANCE : le
-- callId est, par construction, communiqué au destinataire (invitation, push).
-- Un secret partagé avec un tiers n'est plus un secret ; il protégeait contre
-- celui qui devine, jamais contre celui à qui on l'a dit. Le contrôle, lui,
-- tient quoi qu'il arrive à l'identifiant.
--
-- CE QUE FAIT CETTE MIGRATION :
--   ① `public.call_partie_prenante(_id)` — « SUIS-JE partie à cet appel ? ».
--   ② `passio_rt_emettre` et `passio_rt_recevoir` : le membre `call:%` porte
--      désormais ce prédicat. Tout le reste est repris À L'IDENTIQUE.
--
-- ⚠️ CE N'EST PAS UN ORACLE, ET LA DISTINCTION EST CELLE DÉJÀ ÉCRITE POUR
-- `can_edit_post` : un oracle répond sur la CIBLE, ce prédicat répond sur
-- l'APPELANT. Un tiers obtient `false` pour tout identifiant, existant ou non —
-- il n'apprend donc ni qu'un appel existe, ni qui y participe. Les deux seules
-- personnes à qui il répond `true` sont celles qui le savaient déjà.
--
-- ⚠️ ORDRE D'ALLUMAGE, ET IL N'EST PAS NÉGOCIABLE : LE CLIENT D'ABORD.
-- Jusqu'ici l'appelant S'ABONNAIT à `call:<id>` AVANT de déposer son invitation
-- — donc avant que la ligne qui l'autorise existe. Sous cette policy, cet
-- ordre-là fait REFUSER l'abonnement de l'appelant lui-même : l'appel ne part
-- plus du tout. Le client du même lot dépose l'invitation D'ABORD et s'abonne
-- ENSUITE ; il fonctionne AVANT comme APRÈS cette migration. Appliquer avant
-- de déployer casserait tout appel émis par un `app.js` encore en cache, le
-- temps que le service worker se mette à jour.
--   Les trois chemins du DESTINATAIRE (accepter, refuser, occupé) sont déjà
--   dans le bon ordre : c'est la ligne qui les a fait sonner.
--
-- CE QUE CETTE MIGRATION NE FERME PAS, écrit pour ne pas être redécouvert :
--   · `vlive:%` reste sans condition — résidu déjà écrit le 11/09 (« `from`
--     reste déclaratif entre comptes dans un live »). Autre lot, autre surface.
--   · Un tiers qui DEVINERAIT un uuid non encore utilisé pourrait le réserver
--     (INSERT) et faire échouer l'appel qui l'emploierait (23505). Coût :
--     deviner un uuid v4 ET partager un 1:1 avec la cible. Non traité.
--   · La purge quotidienne (`purge_call_invites`, > 1 jour) retirerait le canal
--     d'un appel commencé la veille. Aucun appel ne dure un jour.
--
-- Rejouable. Verdict en fin. RETOUR ARRIÈRE : recoller les deux policies de
-- `migration_appels_invitations_attestees_2026-09-15.sql` (③) et de
-- `migration_appels_sonnerie_privee_2026-09-14.sql`, puis
-- `drop function public.call_partie_prenante(text)`.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ① « SUIS-JE partie à cet appel ? » — jamais « qui est partie à cet appel ».
create or replace function public.call_partie_prenante(_id text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1 from public.call_invites ci
        where ci.id = _id
          and (select auth.uid())::text in (ci.from_id, ci.to_id)
     );
$$;

-- ⚠️ `revoke ... from public` NE FERME RIEN SUR SUPABASE : les privilèges par
-- défaut du projet accordent EXECUTE à `anon` et `authenticated` par des grants
-- NOMINATIFS, que le retrait du pseudo-rôle PUBLIC laisse entiers. D'où le
-- retrait nommé pour `anon`.
-- ⚠️ `authenticated` GARDE EXECUTE, et ce n'est pas un oubli : les policies
-- l'appellent AU RÔLE COURANT. SECURITY DEFINER change le rôle DANS la
-- fonction, pas le droit de l'APPELER — le lui retirer ferait lever
-- « permission denied » sur tout abonnement (suggestion de red team déjà
-- mesurée fausse le 2026-09-11).
revoke all on function public.call_partie_prenante(text) from public;
revoke all on function public.call_partie_prenante(text) from anon;
grant execute on function public.call_partie_prenante(text) to authenticated;

-- ② Émission : `call:` devient conditionnel. Le reste est REPRIS À L'IDENTIQUE
-- de `migration_appels_invitations_attestees_2026-09-15.sql` (③).
drop policy if exists passio_rt_emettre on realtime.messages;
create policy passio_rt_emettre on realtime.messages
  for insert to authenticated
  with check (
    (realtime.topic() like 'call:%' and public.call_partie_prenante(substr(realtime.topic(), 6)))
    or realtime.topic() like 'vlive:%'
    or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
    or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
  );

-- ② Réception : idem. Le reste est REPRIS À L'IDENTIQUE de
-- `migration_appels_sonnerie_privee_2026-09-14.sql`.
drop policy if exists "passio_rt_recevoir" on realtime.messages;
create policy "passio_rt_recevoir" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%'
      and substr(realtime.topic(), 6) = (select auth.uid())::text)
  or (realtime.topic() like 'call:%' and public.call_partie_prenante(substr(realtime.topic(), 6)))
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
-- ⚠️ IL MESURE DES PROPRIÉTÉS, PAS DES PRÉSENCES. « la policy contient
-- call_partie_prenante » serait vrai avec un membre `call:%` inconditionnel
-- laissé À CÔTÉ — et deux membres PERMISSIFS s'additionnent par OU, donc la
-- barrière ne fermerait rien. Les lignes ② et ④ COMPTENT donc : autant de
-- gardes que de membres `call:%`, et au moins un. Un « ne contient pas tel
-- texte » se serait cassé au premier reformatage de PostgreSQL ; un compte
-- d'appariement dit la structure, pas l'orthographe.
create or replace function pg_temp.occurrences(_texte text, _motif text)
returns int language sql immutable as $occ$
  select (length(_texte) - length(replace(_texte, _motif, ''))) / greatest(length(_motif), 1);
$occ$;
with p as (
  select
    coalesce((select with_check from pg_policies where schemaname='realtime' and tablename='messages' and policyname='passio_rt_emettre'), '') as emettre,
    coalesce((select qual from pg_policies where schemaname='realtime' and tablename='messages' and policyname='passio_rt_recevoir'), '') as recevoir
), v(ordre, correctif, ok) as (
  select 1, '① call_partie_prenante : SECURITY DEFINER, search_path vide, anon sans EXECUTE',
         (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""' from pg_proc where proname = 'call_partie_prenante')
         and not has_function_privilege('anon', 'public.call_partie_prenante(text)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.call_partie_prenante(text)', 'EXECUTE')
  union all select 2, '② émission : aucun membre call: n''est resté sans garde',
         (select pg_temp.occurrences(emettre, 'call:%') from p) >= 1
         and (select pg_temp.occurrences(emettre, 'call:%') from p) = (select pg_temp.occurrences(emettre, 'call_partie_prenante') from p)
  union all select 3, '③ émission : le reste est intact (vlive, typing, conv) et ring: toujours interdit au client',
         (select emettre from p) like '%vlive:%' and (select emettre from p) like '%typing:%'
         and (select emettre from p) like '%conv:%' and (select emettre from p) not like '%ring:%'
  union all select 4, '④ réception : aucun membre call: n''est resté sans garde',
         (select pg_temp.occurrences(recevoir, 'call:%') from p) >= 1
         and (select pg_temp.occurrences(recevoir, 'call:%') from p) = (select pg_temp.occurrences(recevoir, 'call_partie_prenante') from p)
  union all select 5, '⑤ réception : ring: toujours borné à son destinataire, et le reste intact',
         (select recevoir from p) like '%substr(realtime.topic(), 6) = %auth.uid()%'
         and (select recevoir from p) like '%realtime:db%'
         and (select recevoir from p) like '%conv_specific:%'
  union all select 6, '⑥ la ligne qui autorise existe toujours et reste infalsifiable',
         exists (select 1 from pg_policies where tablename='call_invites' and policyname='call_invites_update_propre'
                 and qual like '%from_id = %auth.uid()%')
         and exists (select 1 from pg_trigger where tgname='trg_call_invites_figes' and not tgisinternal)
)
select ordre, correctif, case when ok then 'OK' else 'ECHEC' end as verdict from v order by ordre;

commit;
