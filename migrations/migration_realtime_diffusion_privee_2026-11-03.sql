-- ═══════════════════════════════════════════════════════════════════════════
-- R25 — LE TEMPS RÉEL DIFFUSAIT CHAQUE SUPPRESSION DE `conv_members` ET DE
-- `notifications` À TOUS LES ABONNÉS, SANS RLS
-- (audit 2026-11-02, risque résiduel R25 ; lot du 2026-11-03)
--
-- CE QUI A ÉTÉ MESURÉ (canal ① d'ADR-012, production, 2026-11-03) :
--   · `realtime.apply_rls`, code de production : pour une action DELETE, la
--     souscription est retenue SANS évaluer la RLS (« if RLS enabled, we can't
--     secure deletes so filter to pkey ») ; l'ancienne ligne part réduite à sa
--     clé primaire, vers TOUT abonné dont le filtre la laisse passer. Le filtre
--     et l'action (`action_filter`) sont choisis par le CLIENT au join : un
--     abonné `event: "DELETE"` (ou `"*"`) sans filtre les reçoit TOUTES ;
--   · `conv_members` : PK (conv_id, user_id), identité de réplica par défaut →
--     `(evgrp_<activité>, compte)` à chaque départ d'une discussion d'activité ;
--     247 DELETE depuis la remise à zéro des compteurs (2026-05-07) ;
--   · `notifications` : PK `id`, qui ENCODE ses parties — `n_pa_<activité12>_
--     <compte8>` (promotion d'une liste d'attente), `n_fr_<A8>_<V8>` (demande
--     de suivi d'un compte privé) ; 2 895 DELETE pour 3 082 INSERT sur la même
--     période : presque chaque notification finit effacée, donc diffusée ;
--   · les deux tables n'étaient publiées que pour UNE écoute chacune : l'INSERT
--     filtré `user_id=eq.<moi>` d'app-08 (ajout à une conversation,
--     notification entrante).
--
-- LE REMÈDE — LE SERVEUR POUSSE, LE CLIENT N'ÉCOUTE PLUS LA TABLE :
--   ① deux triggers AFTER INSERT (SECURITY DEFINER, search_path vide) envoient
--     la ligne au SEUL destinataire, sur son topic privé `user:<user_id>` — le
--     topic du canal v3 des messages (`broadcast_conv_message_to_users`). La
--     policy « Utilisateur reçoit ses messages » ne l'ouvre qu'à son titulaire
--     (`(select auth.uid())`), et AUCUNE policy n'y laisse émettre un client :
--     une charge reçue sur `user:` vient du serveur ;
--   ② les deux tables SORTENT de `supabase_realtime` : plus de décodage WAL pour
--     elles (`realtime.list_changes` ne passe à wal2json que les tables de la
--     publication), donc plus d'événement DELETE pour personne. C'est ② qui
--     ferme la fuite ; ① garde la fonction.
--
-- ⚠️ LES NOMS D'ÉVÉNEMENT NE SONT PAS « INSERT », ET C'EST LE PIÈGE DU LOT.
-- Le client v3 écoute `user:<moi>` sur l'événement `INSERT` et traite toute
-- charge porteuse d'un `conv_id` comme un MESSAGE. Une ligne `conv_members` en
-- porte un : diffusée sous `INSERT`, chaque onglet encore sur l'ancien code
-- aurait peint un message fantôme (sans texte ni auteur), joué le son et
-- affiché « Passionné t'a envoyé un message ». D'où `conv_members:INSERT` et
-- `notifications:INSERT` : supabase-js compare le nom d'une liaison broadcast
-- par ÉGALITÉ (insensible à la casse), aucun ancien client ne les reçoit.
--
-- ⚠️ LA CHARGE EST ÉCRITE COLONNE PAR COLONNE, jamais `to_jsonb(new)` : une
-- colonne ajoutée demain ne partira pas d'elle-même sur un canal. `origine`
-- (provenance, posée par `trg_notifications_origine`) n'y est pas : le client
-- ne la lit pas.
--
-- ⚠️ LA POUSSÉE NE PEUT PAS FAIRE ÉCHOUER L'ÉCRITURE. `realtime.send` rattrape
-- déjà ses propres erreurs (WARNING) mais pas son ABSENCE ni un changement de
-- sa signature : sans le bloc `exception` ci-dessous, une évolution du schéma
-- `realtime` rendrait impossible toute notification et tout ajout à une
-- conversation. Une poussée manquée se rattrape (le client relit au démarrage,
-- au réveil du socket, à l'ouverture de la cloche ; une conversation neuve
-- apparaît à son premier message) ; une écriture refusée, non. Coût : une
-- sous-transaction par ligne — aucun chemin n'insère des dizaines de lignes
-- d'un coup dans ces tables.
--
-- ⚠️ ORDRE D'APPLICATION — NON NÉGOCIABLE :
--   ① le client de ce lot est EN LIGNE (job « Déploiement production » vert) :
--     il n'écoute plus `postgres_changes` sur ces deux tables, et reçoit
--     `conv_members:INSERT` / `notifications:INSERT` sur `user:<moi>` ;
--   ② SEULEMENT ENSUITE cette migration, dans la foulée.
--   Lu dans le code du serveur Realtime (`PostgresCdcRls.Subscriptions.create`,
--   `RealtimeChannel`) : les liaisons `postgres_changes` d'un canal sont créées
--   dans UNE transaction, et une table hors publication (0 ligne insérée)
--   l'annule ENTIÈRE (« Unable to subscribe to changes with given
--   parameters »), réessayée toutes les 5 à 10 s, le canal restant ouvert. Un
--   onglet encore sur l'ancien code perdrait donc à son prochain join TOUT le
--   direct de `realtime:db` (fil, commentaires, accusés de lecture, lives) —
--   pas seulement ces deux tables. La PWA recharge un onglet visible dans la
--   minute qui suit un déploiement (`js/pwa-detect.js`) : ① puis ② réduit ce
--   risque à un onglet resté en arrière-plan, rechargé à son retour.
--   Entre ① et ②, ces deux tables n'ont pas de direct (les relectures
--   ci-dessus en tiennent lieu) : d'où « dans la foulée ».
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, ET LE REGISTRE LE DIT (R27) :
--   · `conv_reads` (PK conv_id, user_id ; 129 DELETE) et `post_likes` (PK
--     post_id, user_id ; 114 DELETE, lecture « selon visibilité du post »)
--     portent le MÊME défaut et restent publiées : la première porte les accusés
--     de lecture en direct, la seconde n'a plus d'abonné produit (les seuls
--     bancs de charge l'écoutent). Lot suivant ;
--   · aucune donnée, aucune policy de table, aucun GRANT de table ne bouge ;
--   · le canal des MESSAGES (`broadcast_conv_message_users_trigger`) est intact.
--
-- Rejouable ; verdict en fin. Banc : tests/sql/migration-realtime-diffusion-privee.test.sh,
-- qui REPRODUIT d'abord la fuite avec le `realtime.apply_rls` de production.
-- RETOUR ARRIÈRE — EXACT, exécutable tel quel en ôtant « --| » (le banc le
-- rejoue et compare à l'état d'avant). ⚠️ Il ROUVRE R25, et il ne rend PAS le
-- direct à lui seul : le client de ce lot n'écoute plus ces tables. Retour
-- arrière complet = ce bloc D'ABORD, puis le client d'avant (revert du commit
-- client) — l'ordre inverse de ①/② : un ancien client face à des tables hors
-- publication perdrait tout `realtime:db` (voir l'ordre d'application).
--| begin;
--| drop trigger if exists trg_diffuser_notification on public.notifications;
--| drop trigger if exists trg_diffuser_ajout_membre on public.conv_members;
--| drop function if exists public.diffuser_notification();
--| drop function if exists public.diffuser_ajout_membre();
--| alter publication supabase_realtime add table public.conv_members, public.notifications;
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── ① Une notification : à son SEUL destinataire, sur son topic privé ───────
create or replace function public.diffuser_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', 'notifications',
        'operation', 'INSERT',
        'record', jsonb_build_object(
          'id', new.id,
          'user_id', new.user_id,
          'kind', new.kind,
          'from_id', new.from_id,
          'ref_id', new.ref_id,
          'content', new.content,
          'seen', new.seen,
          'created_at', new.created_at
        )
      ),
      'notifications:INSERT',
      'user:' || new.user_id,
      true
    );
  exception when others then
    raise warning 'diffuser_notification : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- ── ② Un ajout à une conversation : au SEUL membre ajouté ───────────────────
create or replace function public.diffuser_ajout_membre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', 'conv_members',
        'operation', 'INSERT',
        'record', jsonb_build_object('conv_id', new.conv_id, 'user_id', new.user_id)
      ),
      'conv_members:INSERT',
      'user:' || new.user_id,
      true
    );
  exception when others then
    raise warning 'diffuser_ajout_membre : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- Aucun client ne les appelle (ce sont des fonctions de trigger) ; les droits
-- par défaut de Supabase accordent EXECUTE à `anon` et `authenticated` par des
-- grants NOMINATIFS qu'un `revoke ... from public` laisse entiers (mesuré le
-- 2026-09-08). Le trigger, lui, ne vérifie pas EXECUTE au déclenchement : le
-- banc l'éprouve en insérant sous `authenticated`.
revoke all on function public.diffuser_notification() from public;
revoke all on function public.diffuser_notification() from anon;
revoke all on function public.diffuser_notification() from authenticated;
revoke all on function public.diffuser_ajout_membre() from public;
revoke all on function public.diffuser_ajout_membre() from anon;
revoke all on function public.diffuser_ajout_membre() from authenticated;

drop trigger if exists trg_diffuser_notification on public.notifications;
create trigger trg_diffuser_notification
  after insert on public.notifications
  for each row execute function public.diffuser_notification();

drop trigger if exists trg_diffuser_ajout_membre on public.conv_members;
create trigger trg_diffuser_ajout_membre
  after insert on public.conv_members
  for each row execute function public.diffuser_ajout_membre();

-- ── ③ Les deux tables sortent de la publication : la fuite se ferme ICI ─────
do $$
declare
  t text;
begin
  foreach t in array array['conv_members', 'notifications'] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
      raise notice '% retiree de supabase_realtime', t;
    else
      raise notice '% n''etait plus publiee : rien a faire', t;
    end if;
  end loop;
end $$;

-- ── VERDICT ────────────────────────────────────────────────────────────────
-- ⚠️ On mesure ensuite l'état en base au canal ①, jamais ce tableau seul.
select 'conv_members et notifications sont HORS de supabase_realtime (plus aucun DELETE décodé pour elles)' as controle,
       case when not exists (select 1 from pg_publication_tables
                              where pubname = 'supabase_realtime' and schemaname = 'public'
                                and tablename in ('conv_members', 'notifications')) then 'OK' else 'ECHEC' end as valeur
union all select 'les neuf autres tables du produit restent publiées (ce lot n''en retire que deux)',
       case when (select count(*) from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public'
                     and tablename in ('comment_interactions', 'conv_messages', 'conv_reads', 'event_comments',
                                       'post_comments', 'post_likes', 'posts', 'profiles', 'video_lives')) = 9 then 'OK' else 'ECHEC' end
union all select 'trg_diffuser_notification : AFTER INSERT, par ligne, actif, sur notifications',
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'public.notifications'::regclass and tgname = 'trg_diffuser_notification'
                            and not tgisinternal and tgtype = 5 and tgenabled = 'O'
                            and tgfoid = 'public.diffuser_notification()'::regprocedure) then 'OK' else 'ECHEC' end
union all select 'trg_diffuser_ajout_membre : AFTER INSERT, par ligne, actif, sur conv_members',
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'public.conv_members'::regclass and tgname = 'trg_diffuser_ajout_membre'
                            and not tgisinternal and tgtype = 5 and tgenabled = 'O'
                            and tgfoid = 'public.diffuser_ajout_membre()'::regprocedure) then 'OK' else 'ECHEC' end
union all select 'les deux fonctions : SECURITY DEFINER, search_path vide',
       case when (select count(*) from pg_proc
                   where oid in ('public.diffuser_notification()'::regprocedure, 'public.diffuser_ajout_membre()'::regprocedure)
                     and prosecdef and array_to_string(proconfig, ';') = 'search_path=""') = 2 then 'OK' else 'ECHEC' end
union all select 'aucun client (anon, authenticated) ne peut les exécuter',
       case when not has_function_privilege('anon', 'public.diffuser_notification()', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.diffuser_notification()', 'EXECUTE')
             and not has_function_privilege('anon', 'public.diffuser_ajout_membre()', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.diffuser_ajout_membre()', 'EXECUTE') then 'OK' else 'ECHEC' end
union all select 'chaque poussée vise user:<destinataire>, sous un événement distinct de « INSERT »',
       case when (select prosrc from pg_proc where oid = 'public.diffuser_notification()'::regprocedure)
                 like '%''notifications:INSERT'',%''user:'' || new.user_id,%'
             and (select prosrc from pg_proc where oid = 'public.diffuser_ajout_membre()'::regprocedure)
                 like '%''conv_members:INSERT'',%''user:'' || new.user_id,%' then 'OK' else 'ECHEC' end
union all select 'user:<uid> ne s''ouvre en lecture qu''à son titulaire (« Utilisateur reçoit ses messages », en initplan)',
       case when exists (select 1 from pg_policies
                          where schemaname = 'realtime' and tablename = 'messages' and policyname = 'Utilisateur reçoit ses messages'
                            and cmd = 'SELECT' and qual like '%realtime.topic() = (''user:''::text || (( SELECT auth.uid() AS uid))::text)%')
             and not exists (select 1 from pg_policies
                              where schemaname = 'realtime' and tablename = 'messages' and cmd in ('SELECT', 'ALL')
                                and policyname <> 'Utilisateur reçoit ses messages'
                                and (qual is null or qual = 'true' or qual like '%user:%')) then 'OK' else 'ECHEC' end
union all select 'aucune policy ne laisse un client ÉMETTRE sur user: (la charge reçue vient du serveur)',
       case when not exists (select 1 from pg_policies
                              where schemaname = 'realtime' and tablename = 'messages' and cmd in ('INSERT', 'ALL')
                                and (coalesce(with_check, qual) is null or coalesce(with_check, qual) = 'true'
                                     or coalesce(with_check, qual) like '%user:%')) then 'OK' else 'ECHEC' end
union all select 'realtime.send(jsonb, text, text, boolean) existe (sans elle, chaque poussée serait sautée)',
       case when to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then 'OK' else 'ECHEC' end
union all select 'le canal des messages est intact (broadcast_conv_message_users_trigger actif)',
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'public.conv_messages'::regclass and tgname = 'broadcast_conv_message_users_trigger'
                            and not tgisinternal and tgenabled = 'O') then 'OK' else 'ECHEC' end;

commit;
