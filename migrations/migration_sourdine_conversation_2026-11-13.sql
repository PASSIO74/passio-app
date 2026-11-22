-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- AUDIT UX/UI DU 2026-11-10 — MSG-C02, VOLET SERVEUR : LA SOURDINE D'UNE CONVERSATION
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun prérequis client : la colonne a une
-- valeur par défaut (`false`), le client qui ne l'écrit pas encore n'est pas gêné, et la fonction
-- `notify-call` la lit en tolérant son absence (_shared/lien-metier.js, `membreEnSourdine`).
--
-- LE DÉFAUT : « Couper les notifications » d'une conversation n'existe que sur l'appareil qui l'a
-- posé (`_muted`, app-04/app-08, LOT-7). L'EXPÉDITEUR, lui, déclenche `notify-call`, qui pousse vers
-- tous les appareils du destinataire : la conversation coupée sonne quand même sur le téléphone
-- verrouillé, et sur tous ses autres appareils.
--
-- CE QUI CHANGE :
--   ① `conv_members.muted` (booléen, faux par défaut) : la sourdine d'UN membre pour UNE conversation.
--   ② Un membre ne peut modifier QUE cette colonne, et QUE sur sa propre ligne : le droit UPDATE de
--      table est retiré à `authenticated` et `anon` (aucune policy UPDATE n'existait : il ne servait
--      à rien), puis rendu sur la seule colonne `muted` ; une policy UPDATE limite à `user_id = moi`.
--      `conv_id`, `user_id` et `rid` restent hors d'atteinte (rien ne change à l'appartenance).
--   ③ `notify-call` ne pousse plus un message (ni une mention) vers un membre en sourdine — refus
--      silencieux, même réponse qu'un blocage. Le message, lui, est livré comme avant.
--
-- RÉSIDU ASSUMÉ : la sourdine est lisible par les autres membres (SELECT de table, comme l'appartenance
-- elle-même). Elle ne dit rien d'autre que « ne me réveille pas pour cette conversation ».
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| drop policy if exists conv_members_sourdine_propre on public.conv_members;
--| revoke update (muted) on public.conv_members from authenticated;
--| grant update on public.conv_members to authenticated;
--| alter table public.conv_members drop column if exists muted;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── ① La colonne ─────────────────────────────────────────────────────────────────────────────────
alter table public.conv_members add column if not exists muted boolean not null default false;

-- ── ② Qui peut l'écrire ──────────────────────────────────────────────────────────────────────────
-- ⚠️ `authenticated` tient UPDATE sur la TABLE : un `grant update (muted)` seul n'y retirerait rien.
-- On retire le droit de table, puis on rend la seule colonne.
revoke update on public.conv_members from authenticated, anon;
grant update (muted) on public.conv_members to authenticated;

drop policy if exists conv_members_sourdine_propre on public.conv_members;
create policy conv_members_sourdine_propre on public.conv_members
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'colonne muted : booléen, faux par défaut, non nul' as controle,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'conv_members' and column_name = 'muted'
                            and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false')
            then 'OK' else 'ECHEC' end as valeur
union all select 'un compte n''écrit que muted',
       case when has_column_privilege('authenticated', 'public.conv_members', 'muted', 'update')
             and not has_column_privilege('authenticated', 'public.conv_members', 'conv_id', 'update')
             and not has_column_privilege('authenticated', 'public.conv_members', 'user_id', 'update')
             and not has_column_privilege('authenticated', 'public.conv_members', 'rid', 'update')
             and not has_table_privilege('anon', 'public.conv_members', 'update') then 'OK' else 'ECHEC' end
union all select 'policy UPDATE : sa propre ligne seulement',
       case when exists (select 1 from pg_policies where tablename = 'conv_members' and policyname = 'conv_members_sourdine_propre'
                          and cmd = 'UPDATE' and qual like '%user_id = (( SELECT auth.uid() AS uid))::text%'
                          and with_check like '%user_id = (( SELECT auth.uid() AS uid))::text%') then 'OK' else 'ECHEC' end
union all select 'lecture et insertion inchangées',
       case when has_table_privilege('authenticated', 'public.conv_members', 'select')
             and has_table_privilege('authenticated', 'public.conv_members', 'insert') then 'OK' else 'ECHEC' end;

commit;
