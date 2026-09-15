-- ═════════════════════════════════════════════════
-- MESSAGERIE — un message d'un compte bloqué ne sort plus du serveur
-- (MSG-10, résidu Astra « ce masquage local ne supprime ni l'appartenance
-- au groupe ni les accès serveur », 2026-09-15)
--
-- Depuis #378, le CLIENT masque dans un groupe commun les messages d'un membre
-- que j'ai bloqué (fil, aperçu, @mentions). Mais la policy de LECTURE de
-- `conv_messages` ne connaissait que l'appartenance : un client sans ce filtre
-- (ancienne version en cache, appel REST direct) lisait tout, et le bloqué
-- continuait de lire ce que le bloqueur écrivait dans le groupe.
--
-- CE QUE FAIT CETTE MIGRATION : la policy SELECT exige aussi
-- `not is_blocked_with(from_id)` — l'aide SECURITY DEFINER déjà posée par
-- l'ouverture publique (posts, stories, 1:1), symétrique : ni l'un ni l'autre
-- ne lit les messages de l'autre, mes propres messages et les messages
-- système (from_id = moi ou hors blocage) restent. Débloquer rend tout : rien
-- n'est supprimé, la ligne reste au serveur. L'appartenance au groupe ne
-- change pas (c'est l'organisateur qui exclut) ; l'INSERT n'est borné au
-- blocage que dans les 1:1 (`conv_1a1_bloquee`), décision inchangée.
-- Rejouable ; verdict en fin. Retour arrière : recréer la policy avec
-- `is_conv_member(conv_id, auth.uid()::text)` seul.
-- ═════════════════════════════════════════════════
begin;

drop policy if exists conv_messages_select_member on public.conv_messages;
create policy conv_messages_select_member on public.conv_messages
  for select to authenticated
  using (
    public.is_conv_member(conv_id, (select auth.uid())::text)
    and not public.is_blocked_with(from_id)
  );

select 'policy SELECT : appartenance ET non bloqué' as controle,
       case when (select qual from pg_policies where tablename = 'conv_messages' and policyname = 'conv_messages_select_member') like '%is_blocked_with(from_id)%'
             and (select qual from pg_policies where tablename = 'conv_messages' and policyname = 'conv_messages_select_member') like '%is_conv_member%' then 'OK' else 'ECHEC' end as valeur
union all select 'policy SELECT : rôle authenticated seul',
       case when (select roles::text from pg_policies where tablename = 'conv_messages' and policyname = 'conv_messages_select_member') = '{authenticated}' then 'OK' else 'ECHEC' end
union all select 'INSERT / UPDATE / DELETE : intacts',
       case when (select count(*) from pg_policies where tablename = 'conv_messages' and cmd in ('INSERT','UPDATE','DELETE')) = 3 then 'OK' else 'ECHEC' end
union all select 'is_blocked_with : SECURITY DEFINER, search_path vide',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""' from pg_proc where proname = 'is_blocked_with' limit 1) then 'OK' else 'ECHEC' end;

commit;
