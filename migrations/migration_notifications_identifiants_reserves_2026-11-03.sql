-- ═════════════════════════════════════════════════
-- AUDIT 2026-11-02, REVUE INDÉPENDANTE point 2 et risque R5 (2026-11-03) :
-- LES IDENTIFIANTS DE NOTIFICATION QUE LE SERVEUR FABRIQUE LUI SONT RÉSERVÉS
--
-- ① L'INSERT. `identifiant_reserve_au_serveur(p_id)` ne réservait que `n_m_%`
-- (messages). Or trois autres familles sont DÉTERMINISTES et écrites par des
-- fonctions SECURITY DEFINER avec `on conflict (id) do update` :
--   · `n_pa_<activité12>_<promu8>` — promotion depuis la liste d'attente (`promouvoir_attente`) ;
--   · `n_fw_<acteur8>_<cible8>` / `n_fr_…` / `n_fa_…` — suivi, demande, acceptation
--     (`follows_notifier`).
-- Un compte pouvait donc INSÉRER d'avance une notification sous l'un de ces
-- identifiants (la policy INSERT n'exige que `from_id = moi`, et n'importe qui
-- peut notifier n'importe qui — like, commentaire…) : le `do update` du serveur
-- réécrivait ensuite SA ligne — `from_id` restant celui du squatteur, la cible
-- lisait « <squatteur> a commencé à te suivre » à la place du vrai abonné. La
-- migration de promotion s'en protège déjà par une clause `where` ; ici on ferme
-- la porte à la source : ces préfixes sont refusés à TOUT client.
-- Les identifiants CLIENT ne sont pas concernés : `n_x<aléa>` (uid()) et
-- `n_msg_<id>_<8>` (notification de message côté client) ne commencent par
-- aucun de ces préfixes — `n_msg_` n'est pas `n_m_` (le `_` suit le `m`).
--
-- ② L'UPDATE, LA PORTE DE CÔTÉ (deux contre-revues indépendantes, 2026-11-03,
-- reproduit sur copie de banc par chacune). Fermer l'INSERT ne suffisait pas :
-- « Update propre » ne regarde que `user_id = moi`, et `authenticated` tenait
-- l'UPDATE au niveau de la TABLE — toutes colonnes, `id` compris. Le squat
-- passait donc en deux temps : une notification banale `n_x…` À SOI-MÊME, puis
-- `update … set id = 'n_fr_<A8>_<V8>'` (les 8 premiers caractères d'un uuid
-- sont publics). Quand A demandait à suivre V (compte privé), le `do update`
-- de `follows_notifier`, SANS clause `where`, réécrivait la ligne du
-- squatteur : LUI lisait « A souhaite s'abonner à ton compte privé », et V ne
-- recevait jamais la demande. Même chose avec `n_fw_` : suivre quelqu'un sans
-- qu'il en soit prévenu. Trois fermetures :
--   · PRIVILÈGES DE COLONNE. Le client ne met à jour QUE `seen`
--     (`supaMarkNotifSeen` / `supaMarkNotifsSeen`, app-08 : `update({ seen: true })`,
--     sans RETURNING) ; ses deux INSERT sont des insert simples, aucun upsert
--     sous un jeton utilisateur (`scripts/moderation.js` écrit en `service_role`,
--     qui garde ses propres droits). `authenticated` perd l'UPDATE de TABLE et
--     garde `update (seen)` : `id`, `user_id`, `from_id`, `kind`, `content`,
--     `origine`… ne se réécrivent plus (42501). `anon` perd TOUT droit
--     d'écriture (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, et
--     MAINTAIN en 17) ; son SELECT reste : la policy de lecture ne lui rend rien,
--     et un REVOKE changerait le `[]` d'une lecture de visiteur en erreur.
--   · `follows_notifier`. Son `do update` ne touche plus que la ligne du MÊME
--     destinataire ET du MÊME émetteur (la garde de `notifier_mentions` et de
--     `promouvoir_attente`) ; et il pose `passio.notification_serveur` comme
--     elles, que lit `trg_notifications_origine` : ses lignes naissent
--     `origine = 'serveur'` (les 13 lignes n_fa_/n_fr_/n_fw_ de la production
--     portaient toutes `client`). Rien d'autre ne change dans la fonction. Une
--     ligne d'autrui sous l'identifiant (collision de préfixes de 8 caractères)
--     n'est plus réécrite : la notification n'est alors pas écrite, l'abonnement
--     reste.
--   · PURGE des squats déjà posés : une ligne sous un préfixe réservé dont
--     l'identifiant n'est pas celui que la fonction serveur aurait fabriqué pour
--     SES propres colonnes est supprimée. Formats, lus dans les fonctions de
--     production (pg_get_functiondef, 2026-11-03) :
--       n_fw_ / n_fr_ / n_fa_ : préfixe || left(from_id, 8) || '_' || left(user_id, 8)
--         (from_id = l'acteur — l'abonné, le demandeur, ou pour n_fa_ celui qui
--         accepte —, user_id = la cible) ;
--       n_pa_ : 'n_pa_' || left(ref_id, 12) || '_' || left(user_id, 8) (l'activité,
--         le promu), ou le repli 'n_pa_' || 20 hexadécimaux, d'origine serveur,
--         genre event_update ;
--       n_m_  : 'n_m_' || left(md5(genre || '|' || ref_id || '|' || from_id || '|' || user_id), 20)
--         (genre = commentaire | message), ou le repli 'n_m_' || 20 hexadécimaux,
--         d'origine serveur, genre mention.
--     Mesuré en production le 2026-11-03 (canal ①, agrégats seuls) : 13 lignes
--     sous un préfixe réservé, 0 contraire — la purge ne supprime rien
--     aujourd'hui ; elle reste pour le cas où un squat serait posé d'ici
--     l'application. Le verdict imprime le nombre supprimé par CETTE exécution.
--
-- Rejouable ; verdict en fin (banc : tests/sql/migration-notifications-identifiants-reserves.test.sh).
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue et
-- contrôle l'empreinte) ; la purge n'en a pas (0 ligne en production) :
--| begin;
--| create or replace function public.identifiant_reserve_au_serveur(p_id text) returns boolean
--|   language sql immutable set search_path = '' as $$ select p_id like 'n\_m\_%' $$;
--| revoke update (seen) on public.notifications from authenticated;
--| grant update on public.notifications to authenticated;
--| grant insert, update, delete, truncate, references, trigger on public.notifications to anon;
--| do $$ begin if current_setting('server_version_num')::int >= 170000 then execute 'grant maintain on public.notifications to anon'; end if; end $$;
--| -- follows_notifier : la définition de PRODUCTION lue le 2026-11-03 (pg_get_functiondef),
--| -- md5(prosrc) = af56dfee1bf82b669bf68e4bb8a1422b, recopiée à l'octet près.
--| CREATE OR REPLACE FUNCTION public.follows_notifier()
--|  RETURNS trigger
--|  LANGUAGE plpgsql
--|  SECURITY DEFINER
--|  SET search_path TO 'public', 'pg_temp'
--| AS $function$
--| declare acteur text; cible text; genre text; texte text; ident text; nom text;
--| begin
--|   if TG_OP = 'INSERT' then
--|     if new.follower_id = new.following_id then return new; end if;
--|     acteur := new.follower_id; cible := new.following_id;
--|     if new.status = 'pending' then
--|       genre := 'follow_request'; texte := 'souhaite s''abonner à ton compte privé';
--|       ident := 'n_fr_' || left(acteur, 8) || '_' || left(cible, 8);
--|     else
--|       genre := 'follow'; texte := 'a commencé à te suivre';
--|       ident := 'n_fw_' || left(acteur, 8) || '_' || left(cible, 8);
--|     end if;
--|   elsif TG_OP = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
--|     acteur := new.following_id; cible := new.follower_id;
--|     genre := 'follow'; texte := 'a accepté ta demande d''abonnement';
--|     ident := 'n_fa_' || left(acteur, 8) || '_' || left(cible, 8);
--|   else
--|     return new;
--|   end if;
--|   select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = acteur;
--|   begin
--|     insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
--|     values (ident, cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now())
--|     on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now();
--|   exception when others then
--|     raise warning 'follows_notifier : notification non écrite (%) — l''abonnement est conservé', sqlerrm;
--|   end;
--|   return new;
--| end $function$;
--| commit;
-- ═════════════════════════════════════════════════
begin;

-- ── ① les identifiants serveur sont refusés à l'INSERT client ──
create or replace function public.identifiant_reserve_au_serveur(p_id text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_id like 'n\_m\_%'
      or p_id like 'n\_pa\_%'
      or p_id like 'n\_fw\_%'
      or p_id like 'n\_fr\_%'
      or p_id like 'n\_fa\_%'
$$;

-- ── ② l'UPDATE client ne touche plus que `seen` ; anon n'écrit plus rien ──
-- Un REVOKE de table retire aussi les droits de colonne correspondants :
-- rejouée, la séquence repart de zéro et rend le même état.
revoke update on public.notifications from authenticated, anon;
grant update (seen) on public.notifications to authenticated;
revoke insert, delete, truncate, references, trigger on public.notifications from anon;
do $$
begin
  -- MAINTAIN n'existe qu'à partir de PostgreSQL 17 : le banc tourne sur 16, la prod sur 17.6.
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on public.notifications from anon';
  end if;
end $$;

-- ── ③ follows_notifier : la définition de production, plus la garde du `do update` et l'origine serveur ──
create or replace function public.follows_notifier()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare acteur text; cible text; genre text; texte text; ident text; nom text;
begin
  if TG_OP = 'INSERT' then
    if new.follower_id = new.following_id then return new; end if;
    acteur := new.follower_id; cible := new.following_id;
    if new.status = 'pending' then
      genre := 'follow_request'; texte := 'souhaite s''abonner à ton compte privé';
      ident := 'n_fr_' || left(acteur, 8) || '_' || left(cible, 8);
    else
      genre := 'follow'; texte := 'a commencé à te suivre';
      ident := 'n_fw_' || left(acteur, 8) || '_' || left(cible, 8);
    end if;
  elsif TG_OP = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    acteur := new.following_id; cible := new.follower_id;
    genre := 'follow'; texte := 'a accepté ta demande d''abonnement';
    ident := 'n_fa_' || left(acteur, 8) || '_' || left(cible, 8);
  else
    return new;
  end if;
  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = acteur;
  -- Notification d'origine serveur (`trg_notifications_origine` lit ce réglage),
  -- comme `notifier_mentions` et `promouvoir_attente` (revue du 2026-11-03).
  perform set_config('passio.notification_serveur', '1', true);
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values (ident, cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now())
    on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now()
      -- Garde par destinataire ET émetteur (revue du 2026-11-03) : une ligne d'autrui
      -- sous cet identifiant (squat, collision de préfixes) n'est jamais réécrite.
      where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id;
  exception when others then
    raise warning 'follows_notifier : notification non écrite (%) — l''abonnement est conservé', sqlerrm;
  end;
  return new;
end $function$;

-- ── ④ purge des squats déjà posés (préfixe réservé contraire à ses propres colonnes) ──
-- Le prédicat est écrit UNE fois : il sert à la suppression puis à la re-mesure.
do $$
declare
  contraire constant text := $p$
    (n.id like 'n\_m\_%' or n.id like 'n\_pa\_%' or n.id like 'n\_fw\_%' or n.id like 'n\_fr\_%' or n.id like 'n\_fa\_%')
    and not coalesce(case
      when n.id like 'n\_fw\_%' or n.id like 'n\_fr\_%' or n.id like 'n\_fa\_%'
        then n.id = left(n.id, 5) || left(n.from_id, 8) || '_' || left(n.user_id, 8)
      when n.id like 'n\_pa\_%'
        then n.id = 'n_pa_' || left(n.ref_id, 12) || '_' || left(n.user_id, 8)
          or (n.id ~ '^n_pa_[0-9a-f]{20}$' and n.kind = 'event_update' and n.origine = 'serveur')
      else n.id in ('n_m_' || left(md5('commentaire|' || n.ref_id || '|' || n.from_id || '|' || n.user_id), 20),
                    'n_m_' || left(md5('message|' || n.ref_id || '|' || n.from_id || '|' || n.user_id), 20))
          or (n.id ~ '^n_m_[0-9a-f]{20}$' and n.kind = 'mention' and n.origine = 'serveur')
    end, false)$p$;
  purgees   integer;
  restantes integer;
begin
  execute 'delete from public.notifications n where ' || contraire;
  get diagnostics purgees = row_count;
  execute 'select count(*) from public.notifications n where ' || contraire into restantes;
  perform set_config('passio.squats_purges', purgees::text, true);
  perform set_config('passio.squats_restants', restantes::text, true);
end $$;

-- ── Verdict ──
select 'identifiants serveur réservés : n_m_, n_pa_, n_fw_, n_fr_, n_fa_' as controle,
       case when public.identifiant_reserve_au_serveur('n_m_abc')
             and public.identifiant_reserve_au_serveur('n_pa_abc')
             and public.identifiant_reserve_au_serveur('n_fw_12345678_87654321')
             and public.identifiant_reserve_au_serveur('n_fr_12345678_87654321')
             and public.identifiant_reserve_au_serveur('n_fa_12345678_87654321') then 'OK' else 'ECHEC' end as valeur
union all select 'identifiants client libres : n_x<aléa>, n_msg_<id>_<8>',
       case when not public.identifiant_reserve_au_serveur('n_xk3j2h1g9abc')
             and not public.identifiant_reserve_au_serveur('n_msg_xk3j2h1g9abc_12345678')
             and not public.identifiant_reserve_au_serveur('n_mabc') then 'OK' else 'ECHEC' end
union all select 'la policy INSERT de notifications appelle toujours identifiant_reserve_au_serveur',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_insert_own_author') like '%identifiant_reserve_au_serveur(id)%' then 'OK' else 'ECHEC' end
union all select 'authenticated : plus aucun UPDATE au niveau de la TABLE notifications',
       case when not has_table_privilege('authenticated', 'public.notifications', 'UPDATE') then 'OK' else 'ECHEC' end
union all select 'authenticated : UPDATE sur seen, et sur seen SEUL (id, user_id, from_id, kind, content, created_at, origine refusés)',
       case when has_column_privilege('authenticated', 'public.notifications', 'seen', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.notifications', 'id', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.notifications', 'user_id', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.notifications', 'from_id', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.notifications', 'kind', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.notifications', 'content', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.notifications', 'created_at', 'UPDATE')
             and case when exists (select 1 from pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'origine' and not attisdropped)
                      then not has_column_privilege('authenticated', 'public.notifications', 'origine', 'UPDATE') else true end
             and (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
                   where a.attrelid = 'public.notifications'::regclass and a.attnum > 0 and not a.attisdropped
                     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')) = 'seen' then 'OK' else 'ECHEC' end
union all select 'authenticated garde SELECT, INSERT, DELETE ; « Update propre » borne toujours le marquage lu au destinataire',
       case when has_table_privilege('authenticated', 'public.notifications', 'SELECT')
             and has_table_privilege('authenticated', 'public.notifications', 'INSERT')
             and has_table_privilege('authenticated', 'public.notifications', 'DELETE')
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'Update propre' and cmd = 'UPDATE') like '%user_id = %auth.uid()%' then 'OK' else 'ECHEC' end
union all select 'anon : plus aucun droit d''écriture (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN en 17)',
       case when not has_any_column_privilege('anon', 'public.notifications', 'INSERT')
             and not has_any_column_privilege('anon', 'public.notifications', 'UPDATE')
             and not has_any_column_privilege('anon', 'public.notifications', 'REFERENCES')
             and not has_table_privilege('anon', 'public.notifications', 'DELETE')
             and not has_table_privilege('anon', 'public.notifications', 'TRUNCATE')
             and not has_table_privilege('anon', 'public.notifications', 'TRIGGER')
             and case when current_setting('server_version_num')::int >= 170000
                      then not has_table_privilege('anon', 'public.notifications', 'MAINTAIN')
                      else true end then 'OK' else 'ECHEC' end
union all select 'anon garde SELECT (la policy ne lui rend rien : une lecture de visiteur rend [] et non une erreur)',
       case when has_table_privilege('anon', 'public.notifications', 'SELECT') then 'OK' else 'ECHEC' end
union all select 'follows_notifier : le do update ne réécrit que la ligne du même destinataire ET du même émetteur',
       case when (select prosrc from pg_proc where oid = 'public.follows_notifier()'::regprocedure)
                 like '%on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now()%where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id;%' then 'OK' else 'ECHEC' end
union all select 'follows_notifier : écrit en origine serveur, SECURITY DEFINER, search_path public, pg_temp ; trg_notifications_origine en place',
       case when (select p.prosrc like '%perform set_config(''passio.notification_serveur'', ''1'', true);%insert into public.notifications%'
                         and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=public, pg_temp'
                    from pg_proc p where p.oid = 'public.follows_notifier()'::regprocedure)
             and exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notifications_origine' and not tgisinternal) then 'OK' else 'ECHEC' end
union all select 'squats purgés par CETTE exécution (préfixe réservé contraire à ses propres user_id / from_id)',
       coalesce(nullif(current_setting('passio.squats_purges', true), ''), '?')
union all select 'aucune ligne sous un préfixe réservé ne contredit ses propres colonnes (re-mesuré après la purge)',
       case when current_setting('passio.squats_restants', true) = '0' then 'OK' else 'ECHEC' end;

commit;
