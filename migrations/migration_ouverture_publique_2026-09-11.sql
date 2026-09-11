-- ═══════════════════════════════════════════════════════════════════════════
-- OUVERTURE PUBLIQUE — ce que la base doit tenir quand N'IMPORTE QUI peut
-- créer un compte (2026-09-11)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012),
-- UNE transaction (une erreur annule tout), REJOUABLE, et il finit par un
-- tableau de verdict qui dit OK / ECHEC par correctif (13 lignes).
--
-- ⚠️ À COLLER APRÈS que le job « Déploiement production » du lot client soit
-- VERT. La partie ⑥ (seau `attachments` privé) suppose que le client sait
-- signer les URL des pièces jointes ; collée avant, elle ferait disparaître
-- toutes les pièces jointes des conversations jusqu'au déploiement.
--
-- Tout ce qui suit a été MESURÉ en production le 2026-09-11 (canal ①), pas
-- déduit d'un fichier du dépôt :
--
--  ① `is_conv_member(conv_id, uid)` est SECURITY DEFINER et exécutable par
--     `anon` : un oracle d'appartenance sans compte. Combiné à `events.conv_id`
--     (colonne accordée à `anon`) et à `profiles.id` (public), la liste
--     NOMINATIVE des membres d'une conversation de rencontre se reconstitue
--     sans compte — la porte fermée le 08/09 sur `event_attendees`, rouverte
--     par une autre table.
--  ② Bloquer quelqu'un ne l'empêchait NI de vous suivre, NI de vous écrire en
--     privé, NI de commenter vos publications, NI de vous notifier. Seul
--     `conv_members` (rejoindre une conversation) connaissait `is_blocked_with`.
--  ③ Trois tables seulement ont une limite de débit (comment_interactions,
--     event_reactions, reports). Rien sur posts, post_comments, conv_messages,
--     stories, events, follows, notifications, analytics_events — et rien sur les
--     INSERT ANONYMES de client_errors et telemetry_events : un script sans
--     compte pouvait remplir la base jusqu'au mur lecture seule du plan.
--  ④ `reports` n'a aucun statut : impossible de savoir si un signalement a été
--     lu. Et `analytics_events` n'a aucune purge alors que la politique de
--     confidentialité promet « 13 mois au maximum ».
--  ⑤ Les canaux Realtime d'appel, de frappe et de live (`ring:`, `call:`,
--     `typing:`, `vlive:`) sont PUBLICS : sans compte, on peut écouter qui appelle
--     qui, faire sonner un téléphone sous une fausse identité, couper un appel.
--     Le mécanisme privé existe déjà pour `user:<uid>`.
--  ⑥ Le seau `attachments` est `public = true` : une pièce jointe de
--     conversation privée reste lisible À VIE par son URL exacte (l'énumération,
--     elle, est fermée depuis le 08/09).
--  ⑦ « Compte privé » sans approbation : `follows` n'a que deux colonnes, tout
--     compte s'abonne d'un tap et la RLS de `posts`/`stories` ouvre le contenu à
--     TOUT abonné. La promesse à l'écran (« Seuls tes abonnés peuvent voir… »)
--     était vraie au sens technique et fausse au sens du produit.
--
-- ⚠️ INVARIANTS DE CE FICHIER
--  · `revoke … from public` NE FERME RIEN SUR SUPABASE (grants NOMINATIFS à
--    anon/authenticated) : chaque retrait nomme `anon`.
--  · On ne peut pas retirer une colonne d'un GRANT de table : `events` reçoit
--    un REVOKE de table puis un GRANT colonne par colonne — liste EXHAUSTIVE,
--    identique à `_EVENT_COLS_PUBLIC` (app-08) moins `conv_id`. Le banc compare
--    les deux listes à l'octet près.
--  · Les policies qui appellent une fonction SECURITY DEFINER passent au rôle
--    `authenticated` : pour `anon`, « aucune policy » rend ZÉRO ligne sans
--    erreur, là où « permission denied for function » ferait du bruit dans le
--    tableau de bord.
--  · `WITH CHECK` ne voit que la ligne FINALE : ce qui doit voir OLD passe par
--    un trigger (statut d'un abonnement, identifiants figés).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RED TEAM du même jour (revue adversariale en lecture seule du lot, puis
-- vérification en production) — quatre trous de plus, refermés ici :
--  ⑧ `conv_messages."Update propre"` et `post_comments."Update propre"` étaient
--     `USING (auteur = moi)` SANS `WITH CHECK` et rien ne figeait `conv_id` /
--     `post_id` : un message se DÉPLAÇAIT par UPDATE dans n'importe quelle
--     conversation (le 1:1 d'un compte qui vous a bloqué, le groupe d'une
--     rencontre dont on n'est pas membre — `events.conv_id = 'evgrp_' || id`,
--     ids publics), un commentaire vers la publication d'un compte privé. ② ne
--     gardait que l'INSERT.
--  ⑨ Un compte BLOQUÉ pouvait encore faire sonner (`ring:%` ouvert à tout
--     compte) : le bloqueur est dans le TOPIC, la policy peut le lire.
--  ⑩ Les demandes d'abonnement EN ATTENTE étaient lisibles sans compte
--     (`follows` : deux policies SELECT `true`) — « qui veut suivre quel compte
--     privé », par un simple GET.
--  ⑪ `realtime:db` et `conv_specific:<conv>` restaient des canaux PUBLICS sans
--     policy : le geste « Allow public access OFF » du tableau de bord les
--     aurait tués (accusés de lecture, arrivée dans une conversation) sans
--     erreur. Le client les crée désormais en privé, avec repli.
-- Et un lot de robustesse : la ligne `notifications` d'un abonnement (demande,
-- suivi, acceptation) est écrite par le SERVEUR (`follows_notifier`) avec un
-- identifiant déterministe — plus par le client qui vient de s'abonner.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- ① L'ORACLE D'APPARTENANCE, ET LA COLONNE QUI LE RENDAIT EXPLOITABLE
-- ───────────────────────────────────────────────────────────────────────────
revoke execute on function public.is_conv_member(text, text) from public, anon;
grant  execute on function public.is_conv_member(text, text) to authenticated;

-- Les autres SECURITY DEFINER qu'un visiteur n'a aucune raison d'appeler.
-- ⚠️ PAS `post_is_visible` ni `comment_target_visible` : les policies SELECT de
-- post_comments / post_likes / comment_interactions les appellent au rôle
-- courant, et un visiteur sans compte LIT les commentaires d'une publication
-- publique. Les fermer à `anon` casserait cette lecture.
revoke execute on function public.can_edit_post(text) from public, anon;
grant  execute on function public.can_edit_post(text) to authenticated;
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'passion_request_auto_creer') then
    execute 'revoke execute on function public.passion_request_auto_creer() from public, anon, authenticated';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'trg_sync_profil_passions') then
    execute 'revoke execute on function public.trg_sync_profil_passions() from public, anon, authenticated';
  end if;
end $$;

-- Les policies qui appellent `is_conv_member` : rôle `authenticated`. Un
-- visiteur n'a plus de policy → zéro ligne, aucune erreur, aucun appel.
alter policy "conv_members_select_member"  on public.conv_members  to authenticated;
alter policy "conv_messages_select_member" on public.conv_messages to authenticated;
alter policy "conversations_select_member" on public.conversations to authenticated;
alter policy "reads_select"                on public.conv_reads    to authenticated;
alter policy "Update propre"               on public.posts         to authenticated;
do $$
begin
  -- Storage : les policies d'écriture évaluent `storage_chemin_autorise`, qui
  -- appelle `is_conv_member`. Elles ne valent que pour un compte connecté.
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'passio_media_insert_cloisonne') then
    execute 'alter policy "passio_media_insert_cloisonne" on storage.objects to authenticated';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'passio_media_update_cloisonne') then
    execute 'alter policy "passio_media_update_cloisonne" on storage.objects to authenticated';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'passio_media_delete') then
    execute 'alter policy "passio_media_delete" on storage.objects to authenticated';
  end if;
end $$;

-- `events.conv_id` sort de la liste publique. ⚠️ Cette liste est EXHAUSTIVE et
-- doit rester IDENTIQUE à `_EVENT_COLS_PUBLIC` (js/app-08) : une colonne ajoutée
-- demain est privée tant que personne ne l'a déclarée publique.
revoke select on table public.events from anon;
grant select (
  id, author_id, title, passion_id, lat, lng, city, description, emoji,
  max_attendees, date_at, created_at, venue, postal_code, price, external_link,
  event_type, cover_url, organizer_id, end_at, status, updated_at, co_organizers,
  series_id, recurrence
) on public.events to anon;

-- ───────────────────────────────────────────────────────────────────────────
-- ② BLOQUER QUELQU'UN DOIT AVOIR UN EFFET — partout où il peut vous atteindre
-- ───────────────────────────────────────────────────────────────────────────
-- Trois aides SECURITY DEFINER : elles lisent posts / events / conv_members
-- SANS être soumises à leur RLS (un commentaire vise parfois une publication
-- que la policy de lecture ne rend pas au rôle courant), et elles s'appuient
-- TOUTES sur `is_blocked_with`, la SEULE définition du blocage (symétrique).
create or replace function public.post_auteur_bloque(_post_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.posts p
                 where p.id = _post_id and public.is_blocked_with(p.author_id));
$$;
create or replace function public.event_auteur_bloque(_event_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.events e
                 where e.id = _event_id and public.is_blocked_with(e.author_id));
$$;
-- Une conversation 1:1 dont l'autre membre m'a bloqué (ou que j'ai bloqué).
-- ⚠️ Bornée aux 1:1 : dans un groupe, la personne bloquée reste un membre du
-- groupe — c'est le retrait du groupe qui relève de l'organisateur.
create or replace function public.conv_1a1_bloquee(_conv_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.conv_members m
    join public.conversations c on c.id = m.conv_id
    where m.conv_id = _conv_id
      and coalesce(c.is_group, false) = false
      and m.user_id <> (select auth.uid())::text
      and public.is_blocked_with(m.user_id));
$$;
revoke execute on function public.post_auteur_bloque(text)  from public, anon;
revoke execute on function public.event_auteur_bloque(text) from public, anon;
revoke execute on function public.conv_1a1_bloquee(text)    from public, anon;
grant  execute on function public.post_auteur_bloque(text)  to authenticated;
grant  execute on function public.event_auteur_bloque(text) to authenticated;
grant  execute on function public.conv_1a1_bloquee(text)    to authenticated;

-- follows : on ne peut pas suivre quelqu'un qui vous a bloqué.
drop policy if exists "Ecriture propre" on public.follows;
create policy "Ecriture propre" on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid())::text
              and not public.is_blocked_with(following_id));

-- conv_messages : on ne peut plus écrire dans un 1:1 avec quelqu'un qui vous a
-- bloqué. La condition d'appartenance ne bouge pas.
drop policy if exists "conv_messages_insert_member" on public.conv_messages;
create policy "conv_messages_insert_member" on public.conv_messages for insert to authenticated
  with check (from_id = (select auth.uid())::text
              and public.is_conv_member(conv_id, (select auth.uid())::text)
              and not public.conv_1a1_bloquee(conv_id));

-- ⑧ L'UPDATE reprend la condition d'INSERT (WITH CHECK), et un trigger FIGE les
-- identifiants — `WITH CHECK` ne voit que la ligne finale, il ne sait pas
-- qu'elle a changé de conversation. Le seul UPDATE client est l'édition du
-- TEXTE d'un commentaire (`_supaUpdateCommentRow`, app-04) : `content` n'est
-- pas figé, et le WITH CHECK est le même que celui de l'INSERT.
drop policy if exists "Update propre" on public.conv_messages;
create policy "Update propre" on public.conv_messages for update to authenticated
  using (from_id = (select auth.uid())::text)
  with check (from_id = (select auth.uid())::text
              and public.is_conv_member(conv_id, (select auth.uid())::text)
              and not public.conv_1a1_bloquee(conv_id));
create or replace function public.identifiants_figes()
returns trigger language plpgsql as $$
declare col text; avant text; apres text;
begin
  foreach col in array TG_ARGV loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into avant, apres using old, new;
    if avant is distinct from apres then
      raise exception '% : la colonne % ne se modifie pas', TG_TABLE_NAME, col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.identifiants_figes() from public, anon, authenticated;
drop trigger if exists trg_identifiants_figes on public.conv_messages;
create trigger trg_identifiants_figes before update on public.conv_messages
  for each row execute function public.identifiants_figes('conv_id', 'from_id');
drop trigger if exists trg_identifiants_figes on public.post_comments;
create trigger trg_identifiants_figes before update on public.post_comments
  for each row execute function public.identifiants_figes('post_id', 'author_id');

-- post_comments / post_likes / event_comments : pas d'interaction avec le
-- contenu de quelqu'un qui vous a bloqué.
drop policy if exists "Ecriture propre" on public.post_comments;
create policy "Ecriture propre" on public.post_comments for insert to authenticated
  with check (author_id = (select auth.uid())::text and not public.post_auteur_bloque(post_id));
drop policy if exists "Update propre" on public.post_comments;
create policy "Update propre" on public.post_comments for update to authenticated
  using (author_id = (select auth.uid())::text)
  with check (author_id = (select auth.uid())::text and not public.post_auteur_bloque(post_id));
drop policy if exists "Ecriture propre" on public.post_likes;
create policy "Ecriture propre" on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid())::text and not public.post_auteur_bloque(post_id));
drop policy if exists "event_comments_insert_own" on public.event_comments;
create policy "event_comments_insert_own" on public.event_comments for insert to authenticated
  with check (author_id = (select auth.uid())::text and not public.event_auteur_bloque(event_id));

-- notifications : une personne bloquée ne fait plus sonner votre cloche.
drop policy if exists "notifications_insert_own_author" on public.notifications;
create policy "notifications_insert_own_author" on public.notifications for insert to authenticated
  with check (from_id = (select auth.uid())::text and not public.is_blocked_with(user_id));

-- ───────────────────────────────────────────────────────────────────────────
-- ③ LE DÉBIT EST BORNÉ — par compte là où il y a un compte, globalement sinon
-- ───────────────────────────────────────────────────────────────────────────
-- `rate_limit_insert(colonne, max/min)` existe déjà (comment_interactions,
-- event_reactions, reports) : il pose `created_at = now()` (l'horodatage
-- serveur fait foi, sinon un client antidaterait pour échapper au compte) puis
-- compte les lignes de la dernière minute pour cet utilisateur.
-- ⚠️ `follows` n'avait PAS de `created_at` : on l'ajoute, sinon le trigger
-- lèverait « record new has no field created_at » à CHAQUE abonnement.
alter table public.follows add column if not exists created_at timestamptz not null default now();

drop trigger if exists trg_rate_limit on public.posts;
create trigger trg_rate_limit before insert on public.posts
  for each row execute function public.rate_limit_insert('author_id', '10');
drop trigger if exists trg_rate_limit on public.stories;
create trigger trg_rate_limit before insert on public.stories
  for each row execute function public.rate_limit_insert('author_id', '10');
drop trigger if exists trg_rate_limit on public.events;
create trigger trg_rate_limit before insert on public.events
  for each row execute function public.rate_limit_insert('author_id', '5');
drop trigger if exists trg_rate_limit on public.post_comments;
create trigger trg_rate_limit before insert on public.post_comments
  for each row execute function public.rate_limit_insert('author_id', '30');
drop trigger if exists trg_rate_limit on public.event_comments;
create trigger trg_rate_limit before insert on public.event_comments
  for each row execute function public.rate_limit_insert('author_id', '30');
drop trigger if exists trg_rate_limit on public.conv_messages;
create trigger trg_rate_limit before insert on public.conv_messages
  for each row execute function public.rate_limit_insert('from_id', '60');
drop trigger if exists trg_rate_limit on public.notifications;
create trigger trg_rate_limit before insert on public.notifications
  for each row execute function public.rate_limit_insert('from_id', '60');
drop trigger if exists trg_rate_limit on public.follows;
create trigger trg_rate_limit before insert on public.follows
  for each row execute function public.rate_limit_insert('follower_id', '30');
drop trigger if exists trg_rate_limit on public.analytics_events;
create trigger trg_rate_limit before insert on public.analytics_events
  for each row execute function public.rate_limit_insert('user_id', '120');

-- Les tables à INSERT ANONYME n'ont pas de colonne d'identité fiable : un
-- plafond GLOBAL par minute, sur toute la table. Il borne la CROISSANCE, pas
-- l'usage légitime (mesuré : ~2 événements de télémétrie par minute en moyenne
-- sur 7 jours, pour 7 comptes). Un attaquant qui sature le plafond fait perdre
-- de la télémétrie, jamais la base. Les deux colonnes de temps sont indexées
-- (`idx_client_errors_created`, `idx_tel_received_at`) : le compte est immédiat.
create or replace function public.limiter_debit_global()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  col_temps   text := TG_ARGV[0];
  max_par_min int  := TG_ARGV[1]::int;
  cnt         int;
begin
  execute format('select count(*) from %I.%I where %I > now() - interval ''1 minute''',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME, col_temps) into cnt;
  if cnt >= max_par_min then
    raise exception 'rate limit: plafond global de % insertions/minute atteint sur %', max_par_min, TG_TABLE_NAME
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.limiter_debit_global() from public, anon, authenticated;

drop trigger if exists trg_debit_global on public.client_errors;
create trigger trg_debit_global before insert on public.client_errors
  for each row execute function public.limiter_debit_global('created_at', '120');
drop trigger if exists trg_debit_global on public.telemetry_events;
create trigger trg_debit_global before insert on public.telemetry_events
  for each row execute function public.limiter_debit_global('received_at', '3000');

-- ───────────────────────────────────────────────────────────────────────────
-- ④ UN SIGNALEMENT A UN STATUT ; les analytics ont une durée de vie
-- ───────────────────────────────────────────────────────────────────────────
alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists handled_at timestamptz;
alter table public.reports add column if not exists handled_note text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_status_chk') then
    alter table public.reports add constraint reports_status_chk
      check (status in ('open', 'handled', 'dismissed'));
  end if;
end $$;
create index if not exists reports_ouverts_idx on public.reports (created_at) where status = 'open';
-- `target_type` finit (via une liste blanche) dans une issue GitHub publique : la
-- base n'accepte que les cinq cibles que le client connaît (+ message, réservé).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_target_type_chk') then
    alter table public.reports add constraint reports_target_type_chk
      check (target_type is null or target_type in ('user', 'post', 'comment', 'event', 'passion', 'message'));
  end if;
end $$;

-- Le client ne décide pas du statut : un signalement NAÎT ouvert, quoi qu'il
-- envoie. Seul l'opérateur (service_role, `npm run moderation traiter`) le ferme.
create or replace function public.reports_statut_initial()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.status := 'open';
  new.handled_at := null;
  new.handled_note := null;
  return new;
end $$;
revoke execute on function public.reports_statut_initial() from public, anon, authenticated;
drop trigger if exists trg_reports_statut_initial on public.reports;
create trigger trg_reports_statut_initial before insert on public.reports
  for each row execute function public.reports_statut_initial();

-- analytics_events : 13 mois, comme la politique de confidentialité le promet.
-- (telemetry_events est déjà purgée à 7 jours, client_errors à 30.)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'passio_purge_analytics';
    perform cron.schedule('passio_purge_analytics', '30 4 * * *',
      $job$ delete from public.analytics_events where created_at < now() - interval '13 months' $job$);
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ LES CANAUX REALTIME DEVIENNENT PRIVÉS (réception ET émission)
-- ───────────────────────────────────────────────────────────────────────────
-- Le client crée désormais `ring:`, `call:`, `typing:`, `vlive:` avec
-- `{ private: true }` — un canal privé SANS policy est REFUSÉ, d'où ces deux
-- policies. Le client replie sur un canal public si la souscription privée est
-- refusée (migration pas encore appliquée), ce qui rend le lot déployable
-- dans les deux ordres.
--   · `ring:<uid>`   : on ne REÇOIT que sa propre sonnerie ; tout compte peut
--                      sonner (c'est un appel). Résidu assumé : l'identité de
--                      l'appelant dans la charge utile reste déclarative entre
--                      COMPTES ; ce qui est fermé, c'est le sans-compte et
--                      l'écoute de qui appelle qui.
--   · `call:<id>`    : identifiant aléatoire, réservé aux comptes.
--   · `typing:<conv>`/`conv:<conv>`/`conv_specific:<conv>` : membres seulement.
--   · `vlive:<id>`   : les lives sont publics (video_lives), réservés aux comptes.
--   · `realtime:db`  : le canal des `postgres_changes` — ouvert à anon ET
--                      authenticated : il n'ouvre RIEN par lui-même, chaque
--                      table garde sa RLS ; sans policy, il mourrait dès que le
--                      tableau de bord interdit les canaux publics.
--   ⚠️ SONNER quelqu'un qui vous a bloqué est refusé : le bloqueur est dans le
--      TOPIC (`ring:<uid>`), la policy peut le lire — la charge utile, jamais.
drop policy if exists "passio_rt_recevoir" on realtime.messages;
create policy "passio_rt_recevoir" on realtime.messages for select to authenticated using (
     realtime.topic() = 'ring:' || (select auth.uid())::text
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
drop policy if exists "passio_rt_recevoir_visiteur" on realtime.messages;
create policy "passio_rt_recevoir_visiteur" on realtime.messages for select to anon
  using (realtime.topic() = 'realtime:db');
drop policy if exists "passio_rt_emettre" on realtime.messages;
create policy "passio_rt_emettre" on realtime.messages for insert to authenticated with check (
     (realtime.topic() like 'ring:%'
      and not public.is_blocked_with(substr(realtime.topic(), 6)))
  or realtime.topic() like 'call:%'
  or realtime.topic() like 'vlive:%'
  or (realtime.topic() like 'typing:%'
      and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%'
      and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
);

-- ───────────────────────────────────────────────────────────────────────────
-- ⑦ UN COMPTE PRIVÉ S'ABONNE SUR DEMANDE
-- ───────────────────────────────────────────────────────────────────────────
-- `follows.status` : 'accepted' (le défaut, et l'état de toutes les lignes
-- existantes) ou 'pending'. C'est le SERVEUR qui tranche à l'insertion selon
-- `profiles.is_private` de la cible — le client ne peut pas se déclarer accepté.
alter table public.follows add column if not exists status text not null default 'accepted';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'follows_status_chk') then
    alter table public.follows add constraint follows_status_chk check (status in ('pending', 'accepted'));
  end if;
end $$;

create or replace function public.follows_statut_initial()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.follower_id <> new.following_id
     and exists (select 1 from public.profiles p where p.id = new.following_id and p.is_private = true) then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  return new;
end $$;
revoke execute on function public.follows_statut_initial() from public, anon, authenticated;
drop trigger if exists trg_follows_statut on public.follows;
create trigger trg_follows_statut before insert on public.follows
  for each row execute function public.follows_statut_initial();

-- Accepter = la CIBLE passe la ligne à 'accepted'. `WITH CHECK` ne voit que la
-- ligne finale : les deux identifiants sont FIGÉS par trigger, sinon la cible
-- pourrait réécrire `follower_id` et fabriquer un abonnement au nom d'un tiers.
create or replace function public.follows_identifiants_figes()
returns trigger language plpgsql as $$
begin
  if new.follower_id <> old.follower_id or new.following_id <> old.following_id then
    raise exception 'follows : les identifiants d''un abonnement ne se modifient pas' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.follows_identifiants_figes() from public, anon, authenticated;
drop trigger if exists trg_follows_figes on public.follows;
create trigger trg_follows_figes before update on public.follows
  for each row execute function public.follows_identifiants_figes();

drop policy if exists "follows_accepter" on public.follows;
create policy "follows_accepter" on public.follows for update to authenticated
  using (following_id = (select auth.uid())::text)
  with check (following_id = (select auth.uid())::text and status = 'accepted');

-- ⑩ Une demande EN ATTENTE ne se lit qu'à ses deux bouts. Les abonnements
-- acceptés restent publics (compteurs d'abonnés, profils) — y compris sans
-- compte, où `auth.uid()` est nul et seul `accepted` passe.
drop policy if exists "Lecture publique" on public.follows;
drop policy if exists "Read follows" on public.follows;
drop policy if exists "follows_lecture" on public.follows;
create policy "follows_lecture" on public.follows for select to anon, authenticated
  using (status = 'accepted'
         or follower_id = (select auth.uid())::text
         or following_id = (select auth.uid())::text);

-- La NOTIFICATION d'un abonnement est écrite par le serveur : demande
-- (`follow_request`, vers la cible), suivi (`follow`, vers la cible),
-- acceptation (`follow`, vers le demandeur). Identifiant DÉTERMINISTE par
-- couple — même famille que `_idNotifMessage` : c'est lui qui empêche le doublon,
-- et une relance (se désabonner puis se réabonner) rafraîchit la même ligne au
-- lieu d'en empiler une. Le client ne pousse plus que le PUSH. SECURITY DEFINER,
-- propriétaire `postgres` (BYPASSRLS sur Supabase) : c'est CELA qui rend l'UPSERT
-- possible — la branche `do update` touche une ligne `user_id = cible`, qu'aucune
-- policy client n'autoriserait, et la lecture de `profiles` ne dépend pas du
-- rôle courant. ⚠️ La notification est un À-CÔTÉ de l'abonnement, jamais son
-- contrat : `notifications` porte `trg_rate_limit` (60/min par `from_id`, tous
-- genres confondus) et un refus y ferait échouer l'INSERT `follows` lui-même
-- (« Impossible de suivre », pour une erreur qui parle de notifications). D'où
-- le bloc `exception` : on trace, on ne casse pas. Le nom n'est pas échappé en base : le client neutralise `< >` de
-- toute notification distante à l'entrée (`mergeSupaNotifs`).
create or replace function public.follows_notifier()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values (ident, cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now())
    on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now();
  exception when others then
    raise warning 'follows_notifier : notification non écrite (%) — l''abonnement est conservé', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.follows_notifier() from public, anon, authenticated;
drop trigger if exists trg_follows_notifier on public.follows;
create trigger trg_follows_notifier after insert or update of status on public.follows
  for each row execute function public.follows_notifier();

-- Seul un abonnement ACCEPTÉ ouvre le contenu d'un compte privé — dans les
-- deux policies ET dans `post_is_visible`, qui les double pour commentaires,
-- j'aime et réactions. Les trois doivent dire la même chose.
alter policy "Lecture respectant les comptes prives" on public.posts using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = posts.author_id and pr.is_private = true)
  or exists (select 1 from public.follows f
             where f.follower_id = (select auth.uid())::text
               and f.following_id = posts.author_id
               and f.status = 'accepted')
);
alter policy "Lecture stories respectant les comptes prives" on public.stories using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = stories.author_id and pr.is_private = true)
  or exists (select 1 from public.follows f
             where f.follower_id = (select auth.uid())::text
               and f.following_id = stories.author_id
               and f.status = 'accepted')
);
create or replace function public.post_is_visible(pid text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when pid is null then true
    -- Pas de ligne posts = contenu seed/local → public (contenu démo beta)
    when not exists (select 1 from posts where id = pid) then true
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or exists (
          select 1 from follows f
          where f.follower_id = (select auth.uid())::text
            and f.following_id = p.author_id
            and f.status = 'accepted'
        )
      )
    )
  end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ LE SEAU `attachments` DEVIENT PRIVÉ — EN DERNIER, ET APRÈS LE CLIENT
-- ───────────────────────────────────────────────────────────────────────────
-- La route `/object/public/…` contournait la RLS. Le client lit désormais les
-- pièces jointes par URL SIGNÉE (membre de la conversation seulement, policy
-- `passio_attachments_read_membre` du 08/09) et replie sur l'URL publique tant
-- que le seau l'est encore. Le seau `content` reste public : ce sont les médias
-- du fil, qu'un visiteur sans compte doit voir.
update storage.buckets set public = false where id = 'attachments';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERDICT — un tableau, une ligne par correctif. Tout doit dire OK.
-- ═══════════════════════════════════════════════════════════════════════════
with v(ordre, correctif, ok) as (
  select 1, '① is_conv_member fermé à anon',
         not has_function_privilege('anon', 'public.is_conv_member(text,text)', 'execute')
  union all select 2, '① events.conv_id retiré à anon',
         not has_column_privilege('anon', 'public.events', 'conv_id', 'select')
         and has_column_privilege('anon', 'public.events', 'title', 'select')
  union all select 3, '① policies de messagerie au rôle authenticated',
         (select count(*) from pg_policies where schemaname = 'public'
            and policyname in ('conv_members_select_member','conv_messages_select_member',
                               'conversations_select_member','reads_select')
            and roles = '{authenticated}'::name[]) = 4
  union all select 4, '② blocage appliqué : follows, messages, commentaires, j''aime, notifications',
         (select count(*) from pg_policies where schemaname = 'public' and cmd = 'INSERT'
            and ((tablename = 'follows'        and with_check like '%is_blocked_with%')
              or (tablename = 'conv_messages'  and with_check like '%conv_1a1_bloquee%')
              or (tablename = 'post_comments'  and with_check like '%post_auteur_bloque%')
              or (tablename = 'post_likes'     and with_check like '%post_auteur_bloque%')
              or (tablename = 'event_comments' and with_check like '%event_auteur_bloque%')
              or (tablename = 'notifications'  and with_check like '%is_blocked_with%'))) = 6
  union all select 5, '③ débit borné par compte sur 9 tables',
         (select count(distinct tgrelid) from pg_trigger where tgname = 'trg_rate_limit' and not tgisinternal) >= 12
  union all select 6, '③ plafond global sur client_errors et telemetry_events',
         (select count(*) from pg_trigger where tgname = 'trg_debit_global' and not tgisinternal) = 2
  union all select 7, '④ reports.status posé et imposé à l''insertion',
         exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'reports' and column_name = 'status')
         and exists (select 1 from pg_trigger where tgname = 'trg_reports_statut_initial')
  union all select 8, '⑤ canaux Realtime : réception et émission sous policy',
         (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages'
            and policyname in ('passio_rt_recevoir', 'passio_rt_emettre', 'passio_rt_recevoir_visiteur')) = 3
         and (select with_check from pg_policies where schemaname = 'realtime' and tablename = 'messages'
              and policyname = 'passio_rt_emettre') like '%is_blocked_with%'
         and (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'
              and policyname = 'passio_rt_recevoir') like '%realtime:db%'
  union all select 9, '⑥ seau attachments privé',
         coalesce((select not public from storage.buckets where id = 'attachments'), false)
  union all select 10, '⑦ compte privé : abonnement sur demande (statut + triggers + policies)',
         exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'follows' and column_name = 'status')
         and exists (select 1 from pg_trigger where tgname = 'trg_follows_statut')
         and exists (select 1 from pg_trigger where tgname = 'trg_follows_figes')
         and (select qual from pg_policies where schemaname = 'public' and tablename = 'posts'
              and policyname = 'Lecture respectant les comptes prives') like '%accepted%'
         and (select qual from pg_policies where schemaname = 'public' and tablename = 'stories'
              and policyname = 'Lecture stories respectant les comptes prives') like '%accepted%'
         and pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%accepted%'
  union all select 11, '⑧ UPDATE gardés : conv_id / post_id figés, WITH CHECK posé',
         exists (select 1 from pg_trigger where tgname = 'trg_identifiants_figes' and tgrelid = 'public.conv_messages'::regclass)
         and exists (select 1 from pg_trigger where tgname = 'trg_identifiants_figes' and tgrelid = 'public.post_comments'::regclass)
         and coalesce((select with_check from pg_policies where schemaname = 'public' and tablename = 'conv_messages'
                       and policyname = 'Update propre'), '') like '%conv_1a1_bloquee%'
         and coalesce((select with_check from pg_policies where schemaname = 'public' and tablename = 'post_comments'
                       and policyname = 'Update propre'), '') like '%post_auteur_bloque%'
  union all select 12, '⑩ follows : une demande en attente ne se lit qu''à ses deux bouts',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'follows' and cmd = 'SELECT') = 1
         and coalesce((select qual from pg_policies where schemaname = 'public' and tablename = 'follows'
                       and policyname = 'follows_lecture'), '') like '%accepted%'
  union all select 13, '⑦ notification d''abonnement écrite par le serveur',
         exists (select 1 from pg_trigger where tgname = 'trg_follows_notifier' and not tgisinternal)
)
select ordre, correctif, case when ok then 'OK' else 'ECHEC' end as verdict
from v order by ordre;

commit;
