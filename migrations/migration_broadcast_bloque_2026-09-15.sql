-- ═══════════════════════════════════════════════════════════════════════════
-- MESSAGERIE — le BROADCAST contournait le blocage que la lecture REST refuse
-- (ASTRA-22, quatrième contre-revue indépendante, 2026-09-15 · MSG-10)
--
-- CE QUI A ÉTÉ MESURÉ EN PRODUCTION le 2026-09-15 (canal ① d'ADR-012) :
--   · `conv_messages_select_member` porte bien
--     `is_conv_member(conv_id, auth.uid()) AND NOT is_blocked_with(from_id)` —
--     la migration MSG-10 du 15/09 est appliquée, la LECTURE REST est fermée ;
--   · `broadcast_conv_message_to_users` est SECURITY DEFINER, diffuse `NEW`
--     COMPLET (contenu du message compris) sur `user:<uid>` de CHAQUE membre,
--     et `prosrc` ne contient AUCUNE mention de blocage.
--
-- Autrement dit : A bloque B, A écrit dans un groupe A/B/C. Le `GET` de B ne
-- rend rien — et sa trame WebSocket porte le message entier. Le filtre client
-- (#378) arrive APRÈS : il masque à l'affichage ce que le serveur a déjà livré.
-- Une porte fermée sur une table se rouvre par un canal, exactement comme elle
-- se rouvrait par une fonction (fiche « ouverture publique », is_conv_member).
--
-- ⚠️ LE PIÈGE QUI REND CE CORRECTIF NON ÉVIDENT — ET LA CONTRE-REVUE LE DÉCRIT
-- UN CRAN TROP FORT, CE QUI IMPORTE PARCE QUE ÇA CHANGE LE TEST À ÉCRIRE.
-- La contre-revue dit : « ne pas utiliser aveuglément une fonction basée sur
-- auth.uid() dans un trigger privilégié », en supposant que `auth.uid()` y
-- désignerait le mauvais compte. MESURÉ sur PostgreSQL 16 (banc
-- `tests/sql/migration-broadcast-bloque.test.sh`, cas ⑥) :
--   · quand l'AUTEUR insère depuis SA session — le chemin client normal, celui
--     que la policy INSERT impose (`from_id = auth.uid()`) — `auth.uid()` EST
--     l'auteur, donc `is_blocked_with(destinataire)` teste le BON couple et
--     filtre CORRECTEMENT. La variante « facile » marche là ;
--   · quand l'insertion vient d'une session SANS jeton — `service_role`, une
--     Edge Function, un message système, un rejeu de restauration —
--     `auth.uid()` est NULL, `is_blocked_with` rend FALSE par construction, et
--     le filtre DISPARAÎT EN SILENCE. Mesuré : le compte bloqué reçoit la trame.
-- Autrement dit le piège n'est pas « ça ne filtre jamais » mais « ça filtre
-- pendant les tests et ça cesse de filtrer sur les chemins serveur » — ce qui
-- est pire, parce que rien ne le dit. D'où le prédicat sur le COUPLE EXPLICITE,
-- `blocage_entre(_a, _b)`, qui ne lit AUCUN état de session.
--
-- ⚠️ ET `blocage_entre` NE DOIT PAS DEVENIR UN ORACLE. Répondre « ces deux
-- comptes se bloquent-ils ? » pour un couple quelconque est précisément la
-- fuite qu'on a fermée sur `is_conv_member` le 11/09. Elle est donc révoquée
-- NOMMÉMENT à `anon` ET `authenticated` (les privilèges par défaut de Supabase
-- accordent EXECUTE par des grants nominatifs qu'un `revoke ... from public`
-- laisse entiers — mesuré le 2026-09-08). Le trigger, lui, l'appelle sous son
-- propre propriétaire : SECURITY DEFINER change le rôle DANS la fonction, donc
-- l'appel ne demande rien au rôle de l'appelant.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, ET C'EST VOULU :
--   · l'APPARTENANCE au groupe ne change pas — exclure relève de l'organisateur ;
--   · l'HISTORIQUE n'est pas supprimé : débloquer rend tout, des deux côtés ;
--   · les messages de l'auteur vers lui-même passent toujours
--     (`blocage_entre(x, x)` est faux par construction) ;
--   · les canaux de RÉACTIONS et d'ACCUSÉS DE LECTURE (`realtime:db`,
--     `conv_specific:<conv>`, émis par le CLIENT) ne sont PAS traités ici :
--     ils relèvent des policies de `realtime.messages` et d'une décision de
--     contrat produit. Ils restent OUVERTS et le registre le dit.
--
-- Rejouable. Verdict en fin. Retour arrière : recréer
-- `broadcast_conv_message_to_users` sans le `if not public.blocage_entre(...)`
-- (le corps d'origine est dans `migrations/migration_realtime_user_topic.sql`),
-- et `drop function public.blocage_entre(text, text)`.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ① Le prédicat sur le COUPLE, jamais sur l'appelant ────────────────────────
create or replace function public.blocage_entre(_a text, _b text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when _a is null or _b is null or _a = _b then false
    else exists (
      select 1 from public.blocks b
       where (b.blocker_id = _a and b.blocked_id = _b)
          or (b.blocker_id = _b and b.blocked_id = _a)
    )
  end
$$;

-- Aucun client ne l'appelle : ce serait un oracle sur un couple quelconque.
revoke all on function public.blocage_entre(text, text) from public;
revoke all on function public.blocage_entre(text, text) from anon;
revoke all on function public.blocage_entre(text, text) from authenticated;

-- ② Le trigger filtre DESTINATAIRE PAR DESTINATAIRE ─────────────────────────
create or replace function public.broadcast_conv_message_to_users()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
    -- ⚠️ LE COUPLE EXPLICITE (auteur, destinataire), et aucun état de session :
    -- voir l'en-tête pour ce que l'autre aide perd sur les chemins serveur.
    IF NOT public.blocage_entre(NEW.from_id, m.user_id) THEN
      PERFORM realtime.broadcast_changes(
        'user:' || m.user_id,
        TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_conv_message_users_trigger ON public.conv_messages;
CREATE TRIGGER broadcast_conv_message_users_trigger
AFTER INSERT ON public.conv_messages
FOR EACH ROW EXECUTE FUNCTION public.broadcast_conv_message_to_users();

-- ── VERDICT ────────────────────────────────────────────────────────────────
select 'le trigger filtre sur le couple explicite' as controle,
       case when (select prosrc from pg_proc where proname = 'broadcast_conv_message_to_users')
                 like '%blocage_entre(NEW.from_id, m.user_id)%' then 'OK' else 'ECHEC' end as valeur
-- ⚠️ ON MESURE L'APPEL, PAS LA MENTION : la première rédaction cherchait la
-- chaîne `is_blocked_with` dans `prosrc` et se piégeait sur son PROPRE
-- commentaire — un verdict ECHEC sur une migration pourtant juste.
union all select 'le trigger n''APPELLE pas is_blocked_with (muet sur les chemins sans session)',
       case when (select prosrc from pg_proc where proname = 'broadcast_conv_message_to_users')
                 not like '%public.is_blocked_with(%' then 'OK' else 'ECHEC' end
union all select 'blocage_entre : SECURITY DEFINER, search_path vide',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""'
                    from pg_proc where proname = 'blocage_entre') then 'OK' else 'ECHEC' end
union all select 'blocage_entre : aucun oracle pour anon ni authenticated',
       case when not has_function_privilege('anon', 'public.blocage_entre(text,text)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.blocage_entre(text,text)', 'EXECUTE')
            then 'OK' else 'ECHEC' end
union all select 'le trigger est bien posé sur conv_messages',
       case when exists (select 1 from pg_trigger
                          where tgname = 'broadcast_conv_message_users_trigger' and not tgisinternal) then 'OK' else 'ECHEC' end
union all select 'la lecture REST reste fermée au blocage (MSG-10 intacte)',
       case when (select qual from pg_policies where tablename = 'conv_messages' and policyname = 'conv_messages_select_member')
                 like '%is_blocked_with(from_id)%' then 'OK' else 'ECHEC' end
union all select 'blocage_entre est symétrique et faux sur un même compte',
       case when public.blocage_entre('u_x', 'u_x') = false
             and public.blocage_entre(null, 'u_y') = false then 'OK' else 'ECHEC' end;

commit;
