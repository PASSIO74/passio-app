-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS : PAS DE NOTIFICATION SANS ÉVÉNEMENT MÉTIER (2026-11-13, SRV-02, reste)
--
-- Une transaction, FERMÉE SUR ÉCHEC (SQLSTATE 55000 avant `commit;`).
--
-- LE DÉFAUT RESTANT (audit de stabilisation du 10/11, SRV-02). La migration du
-- 12/11 (`trg_notifications_texte`) pose le nom et la phrase côté serveur et
-- exige les liens métier de `message`, `event_update` et `event_cancelled`.
-- Pour les autres genres, rien n'exigeait l'ÉVÉNEMENT : un compte écrivait
-- « X a aimé ton post » dans la cloche de n'importe qui, sans avoir aimé — sous
-- son vrai nom, avec une phrase fixe, mais sans aucun fait derrière.
--
-- LE CORRECTIF : un déclencheur BEFORE INSERT, pour les seules lignes d'origine
-- CLIENT (`trg_notifications_origine` pose `origine` juste avant : ordre
-- alphabétique, « origine » < « preuve » < « texte »). Il exige le FAIT qui lie
-- l'émetteur (`from_id`) au destinataire (`user_id`) à propos de `ref_id` — la
-- règle de `lienEvenement` (supabase/functions/_shared/lien-metier.js), appliquée
-- à la cloche, élargie à ce que l'application notifie réellement (j'aime et
-- réponses de commentaire, réactions, commentaires d'activité) :
--   · like          → `post_likes` (émetteur, ref) et le destinataire est l'auteur
--                     de la publication ; OU une interaction `like`/`emoji` de
--                     l'émetteur dans le fil ref dont la CIBLE, elle-même DANS ce
--                     fil (publication, commentaire, commentaire d'activité,
--                     réponse — « srep_ » compris), a pour auteur le destinataire ;
--                     OU une `event_reactions` de l'émetteur sur l'activité ref,
--                     que le destinataire ORGANISE ;
--   · comment       → `post_comments` (émetteur, ref) sur une publication du
--                     destinataire ; OU une réponse (`comment_interactions`
--                     'reply') de l'émetteur dans le fil ref, adressée à l'auteur
--                     du commentaire visé ou à celui du fil ; OU un
--                     `event_comments` de l'émetteur sur une activité qu'ORGANISE
--                     le destinataire (GIF posté dans la discussion d'une activité) ;
--   · event_join    → `event_attendees` (émetteur, ref, 'going'), destinataire organisateur ;
--   · event_comment → `event_comments` (émetteur, ref), destinataire organisateur ;
--   · event_feedback→ `event_attendees` (émetteur, ref) NOTÉE, destinataire organisateur ;
--   · event_invite  → l'activité ref existe, n'est pas annulée, et l'émetteur
--                     SUIT le destinataire, abonnement ACCEPTÉ (on n'invite que
--                     ses abonnements : `_eventInvitables`, app-07) ;
--   · live_video    → un `video_lives` ref de l'émetteur, en cours (ni terminé, ni
--                     muet depuis dix minutes), et le destinataire le suit (accepté) ;
--   · event_cancelled → en plus du lien du 12/11 : l'activité est ANNULÉE, et
--                     l'émetteur l'organise (un simple inscrit ne l'annonce pas) ;
--   · reaction, event_reminder, cdv_live_step : aucun client ne les écrit
--     (mesuré le 13/11 dans js/ et en base) — refusés.
-- « Organise », pour les interactions REÇUES : `organizer_id` / `author_id`, jamais
-- `co_organizers`, que l'auteur remplit seul — nommer vingt inconnus
-- co-organisateurs leur aurait ouvert sa cloche (relecture adversariale du 13/11, P1).
-- LE FAIT SE CONSOMME : une notification passe s'il y a plus de faits que de
-- notifications client du même couple, genre et référence sur 24 h. Un j'aime ne
-- vaut qu'un « a aimé », deux commentaires valent deux notifications.
-- Refus = 42501. `message` et `event_update` gardent le contrôle du 12/11.
-- RESTE (assumé) : l'invitation affiche le titre de l'activité, texte choisi par
-- son auteur et public (comme une publication) ; elle exige un abonnement accepté.
--
-- LE PIÈGE, et pourquoi le CLIENT d'abord. Les notifications partaient EN
-- PARALLÈLE de leur écriture métier (16 sites, mesurés le 13/11) ; la file des
-- commentaires peut aboutir des minutes plus tard. Exiger l'événement seul aurait
-- REFUSÉ des notifications légitimes arrivées avant leur fait. Le client de la
-- même PR notifie au VERDICT de l'écriture (`notifierApresEcriture`, app-08 ; la
-- file des commentaires notifie à la confirmation, `_cmtObNotifier`, app-04).
-- PREREQUIS-CLIENT: notifications:apres-ecriture
-- ORDRE : APRÈS le déploiement en production du client qui porte ce motif (la
-- barrière de `scripts/appliquer-migration.mjs` le vérifie sur la page servie).
-- Un ancien client resté en cache perd, jusqu'à sa mise à jour, les notifications
-- qu'il envoyait avant leur fait — c'est le prix assumé de la transition.
--
-- Canal ③ d'ADR-012 : `npm run migration:appliquer -- migrations/migration_notifications_preuve_evenement_2026-11-13.sql`
-- RETOUR ARRIÈRE :
--   begin;
--   drop trigger if exists trg_notifications_preuve on public.notifications;
--   drop function if exists public.notifications_preuve_evenement();
--   commit;
-- ═══════════════════════════════════════════════════════════
begin;

-- ── ⓪ PRÉREQUIS ──
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notifications_origine' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_notifications_texte' and not tgisinternal) then
    raise exception 'notifications : les déclencheurs d''origine et de texte (12/11) manquent — RIEN n''est appliqué' using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

-- ── ① LA PREUVE ──
-- Chaque branche COMPTE les faits qui lient l'émetteur au destinataire à propos
-- de `ref` (n_faits) ; la notification passe s'il y en a plus que de
-- notifications client du même couple, genre et référence écrites dans les
-- 24 dernières heures (n_deja). Un fait ne s'annonce donc qu'une fois : un seul
-- j'aime ne vaut pas mille « a aimé ton post », un j'aime retiré puis remis ne
-- renotifie pas dans la journée, mais deux commentaires valent deux notifications
-- (relecture adversariale du 13/11, P2 « le fait n'est jamais consommé »).
-- Toute CIBLE d'interaction doit appartenir au fil `ref` (P3) ; les interactions
-- d'activité ne notifient que son ORGANISATION — organizer_id / author_id, jamais
-- `co_organizers`, que l'auteur remplit seul sans l'accord des intéressés (P1).
create or replace function public.notifications_preuve_evenement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  de      text := new.from_id;
  a       text := new.user_id;
  ref     text := new.ref_id;
  n_faits bigint := 0;
  n_deja  bigint := 0;
begin
  -- Les lignes du serveur (follows_notifier, notifier_mentions, avis de suppression…) ne passent pas ici.
  if new.origine is distinct from 'client' or auth.uid() is null then
    return new;
  end if;

  -- `message` et `event_update` : le lien du 12/11 (trg_notifications_texte) suffit.
  if new.kind in ('message', 'event_update') then
    return new;
  end if;

  if ref is null or de is null or a is null then
    raise exception 'notification sans événement métier (référence absente)' using errcode = '42501';
  end if;

  if new.kind = 'like' then
    n_faits :=
        (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id
          where l.post_id = ref and l.user_id = de and p.author_id = a)
      + (select count(*) from public.comment_interactions ci
          where ci.user_id = de and ci.kind in ('like', 'emoji') and ci.post_id = ref
            and (   (ci.comment_id = ref and exists (select 1 from public.posts p where p.id = ref and p.author_id = a))
                 or exists (select 1 from public.post_comments pc where pc.id = ci.comment_id and pc.post_id = ref and pc.author_id = a)
                 or exists (select 1 from public.event_comments ec where ec.id = ci.comment_id and ec.event_id = ref and ec.author_id = a)
                 or exists (select 1 from public.comment_interactions r where r.id = ci.comment_id and r.post_id = ref and r.kind = 'reply' and r.user_id = a)
                 -- Une réponse lue du serveur porte l'identifiant « srep_<date> » (app-08,
                 -- app-04), qu'aucune table ne porte : sa cible se résout dans le fil.
                 or (ci.comment_id like 'srep\_%' and exists (select 1 from public.comment_interactions r
                                                               where r.post_id = ref and r.kind = 'reply' and r.user_id = a))))
      + (select count(*) from public.event_reactions r
          where r.event_id = ref and r.user_id = de
            and exists (select 1 from public.events e where e.id = ref and (e.organizer_id = a or e.author_id = a)));

  elsif new.kind = 'comment' then
    n_faits :=
        (select count(*) from public.post_comments c join public.posts p on p.id = c.post_id
          where c.post_id = ref and c.author_id = de and p.author_id = a)
      + (select count(*) from public.comment_interactions ci
          where ci.user_id = de and ci.kind = 'reply' and ci.post_id = ref
            and (   exists (select 1 from public.post_comments pc where pc.id = ci.comment_id and pc.post_id = ref and pc.author_id = a)
                 or exists (select 1 from public.event_comments ec where ec.id = ci.comment_id and ec.event_id = ref and ec.author_id = a)
                 or exists (select 1 from public.comment_interactions r where r.id = ci.comment_id and r.post_id = ref and r.kind = 'reply' and r.user_id = a)
                 or (ci.comment_id like 'srep\_%' and exists (select 1 from public.comment_interactions r
                                                               where r.post_id = ref and r.kind = 'reply' and r.user_id = a))
                 -- Une réponse prévient aussi l'auteur du FIL (réponse de bobine, app-05).
                 or exists (select 1 from public.posts p where p.id = ref and p.author_id = a)))
      + (select count(*) from public.event_comments c
          where c.event_id = ref and c.author_id = de
            and exists (select 1 from public.events e where e.id = ref and (e.organizer_id = a or e.author_id = a)));

  elsif new.kind in ('event_join', 'event_comment', 'event_feedback') then
    if exists (select 1 from public.events e where e.id = ref and (e.organizer_id = a or e.author_id = a)) then
      n_faits := case new.kind
        when 'event_join' then (select count(*) from public.event_attendees x where x.event_id = ref and x.user_id = de and x.rsvp = 'going')
        when 'event_comment' then (select count(*) from public.event_comments x where x.event_id = ref and x.author_id = de)
        else (select count(*) from public.event_attendees x where x.event_id = ref and x.user_id = de and x.rating is not null)
      end;
    end if;

  elsif new.kind = 'event_invite' then
    -- On n'invite que ses abonnements (`_eventInvitables`, app-07) — ACCEPTÉS : une
    -- demande en attente vers un compte privé ne vaut pas lien (P2).
    if exists (select 1 from public.events e where e.id = ref and e.status is distinct from 'cancelled')
       and exists (select 1 from public.follows f where f.follower_id = de and f.following_id = a
                     and coalesce(f.status, 'accepted') = 'accepted') then
      n_faits := 1;
    end if;

  elsif new.kind = 'live_video' then
    -- Un direct EN COURS : ni terminé, ni muet depuis dix minutes (le battement est de 25 s).
    if exists (select 1 from public.video_lives v where v.id = ref and v.author_id = de and v.status = 'live'
                 and v.ended_at is null and coalesce(v.last_seen, v.started_at) > now() - interval '10 minutes')
       and exists (select 1 from public.follows f where f.follower_id = a and f.following_id = de
                     and coalesce(f.status, 'accepted') = 'accepted') then
      n_faits := 1;
    end if;

  elsif new.kind = 'event_cancelled' then
    -- Le lien aux inscrits est exigé par trg_notifications_texte ; ici, le FAIT
    -- (l'activité est annulée) et son AUTEUR (l'organisation, pas un inscrit).
    if exists (select 1 from public.events e where e.id = ref and e.status = 'cancelled'
                 and (e.organizer_id = de or e.author_id = de or coalesce(e.co_organizers, '[]'::jsonb) ? de)) then
      n_faits := 1;
    end if;

  else
    n_faits := 0;   -- reaction, event_reminder, cdv_live_step : aucun client ne les écrit
  end if;

  if n_faits > 0 then
    select count(*) into n_deja from public.notifications n
     where n.user_id = a and n.from_id = de and n.kind = new.kind and n.ref_id = ref
       and n.origine = 'client' and n.created_at > now() - interval '24 hours';
  end if;

  if n_faits = 0 or n_deja >= n_faits then
    raise exception 'notification sans événement métier (%)', new.kind using errcode = '42501';
  end if;
  return new;
end
$fn$;

revoke all on function public.notifications_preuve_evenement() from public, anon, authenticated;

drop trigger if exists trg_notifications_preuve on public.notifications;
create trigger trg_notifications_preuve before insert on public.notifications
  for each row execute function public.notifications_preuve_evenement();

-- ── ② L'ÉPREUVE, sous le vrai rôle `authenticated`, ANNULÉE ──
do $epreuve$
declare
  sfx  constant text := left(md5(clock_timestamp()::text || random()::text), 8);
  a    constant text := '00000000-0000-4000-8000-0000000c0301';   -- autrice : publication, activités, direct
  b    constant text := '00000000-0000-4000-8000-0000000c0302';   -- agit vraiment (aime, commente, s'inscrit…)
  c3   constant text := '00000000-0000-4000-8000-0000000c0303';   -- auteur d'un commentaire ; réagit par emoji seulement
  d    constant text := '00000000-0000-4000-8000-0000000c0304';   -- étranger à tout : n'a rien fait
  pst  constant text := 'zz_srv02b_post_' || sfx;
  cm1  constant text := 'zz_srv02b_cm1_' || sfx;    -- commentaire de c3 sur pst
  cm2  constant text := 'zz_srv02b_cm2_' || sfx;    -- commentaire de b sur pst
  evt  constant text := 'zz_srv02b_evt_' || sfx;    -- activité active de a
  evx  constant text := 'zz_srv02b_evx_' || sfx;    -- activité annulée de a
  ecm  constant text := 'zz_srv02b_ecm_' || sfx;
  liv  constant text := 'zz_srv02b_liv_' || sfx;
  mes  jsonb := '{}'::jsonb;
  t    record;
  etat text;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.profiles (id, username, is_private) values
      (a, 'zz Alice ' || sfx, false), (b, 'zz Bob ' || sfx, false), (c3, 'zz Carol ' || sfx, false), (d, 'zz Dan ' || sfx, false);
    insert into public.posts (id, author_id, content) values (pst, a, 'publication d''essai');
    insert into public.post_comments (id, post_id, author_id, content) values (cm1, pst, c3, 'commentaire de Carol'), (cm2, pst, b, 'commentaire de Bob');
    insert into public.post_likes (post_id, user_id) values (pst, b);
    insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values
      ('zz_srv02b_ci1_' || sfx, cm1, pst, b, 'like', null),
      ('zz_srv02b_ci2_' || sfx, cm1, pst, b, 'reply', 'réponse de Bob'),
      ('zz_srv02b_ci3_' || sfx, pst, pst, c3, 'emoji', '🔥'),
      ('zz_srv02b_ci4_' || sfx, cm2, pst, c3, 'reply', 'réponse de Carol'),
      -- Le j'aime d'une réponse lue du serveur vise « srep_<date> » (app-08), qu'aucune table ne porte.
      ('zz_srv02b_ci5_' || sfx, 'srep_2026-11-13T10:00:00.000+00:00', pst, b, 'like', null);
    -- Carol est nommée co-organisatrice par Alice seule, sans son accord (relecture du 13/11, P1).
    insert into public.events (id, organizer_id, author_id, title, status, co_organizers) values
      (evt, a, a, 'Rando du lac', 'active', jsonb_build_array(c3)), (evx, a, a, 'Rando annulée', 'cancelled', null);
    insert into public.event_attendees (event_id, user_id, rsvp, rating) values (evt, b, 'going', 4), (evx, b, 'going', null), (evx, c3, 'going', null);
    insert into public.event_reactions (event_id, user_id, emoji) values (evt, b, '❤️');
    insert into public.event_comments (id, event_id, author_id, text) values (ecm, evt, b, 'Je viens');
    insert into public.video_lives (id, author_id, status, started_at) values (liv, a, 'live', now());
    insert into public.follows (follower_id, following_id) values (b, a), (b, c3);
    -- ⚠️ `follows_notifier` pose `passio.notification_serveur` sans le remettre (relecture
    -- du 13/11, P1) : sans cette remise à zéro, toute la boucle serait « d'origine serveur »
    -- et ne prouverait rien. Elle est AUSSI refaite avant chaque essai.
    perform set_config('passio.notification_serveur', '', true);

    for t in
      select x.* from jsonb_to_recordset(jsonb_build_array(
        -- j'aime
        jsonb_build_object('cle', 'like_post',      'de', b,  'a', a,  'kind', 'like',  'ref', pst, 'texte', 'x a aimé ton post'),
        jsonb_build_object('cle', 'like_post_faux', 'de', d,  'a', a,  'kind', 'like',  'ref', pst, 'texte', 'x a aimé ton post'),
        jsonb_build_object('cle', 'like_post_dest', 'de', b,  'a', d,  'kind', 'like',  'ref', pst, 'texte', 'x a aimé ton post'),
        jsonb_build_object('cle', 'like_post_bis',  'de', b,  'a', a,  'kind', 'like',  'ref', pst, 'texte', 'x a aimé ton post'),
        jsonb_build_object('cle', 'like_cmt',       'de', b,  'a', c3, 'kind', 'like',  'ref', pst, 'texte', 'x a aimé ton commentaire'),
        jsonb_build_object('cle', 'like_srep',      'de', b,  'a', c3, 'kind', 'like',  'ref', pst, 'texte', 'x a aimé ta réponse'),
        jsonb_build_object('cle', 'emoji_post',     'de', c3, 'a', a,  'kind', 'like',  'ref', pst, 'texte', 'x a réagi 🔥 à ton post'),
        jsonb_build_object('cle', 'like_evt',       'de', b,  'a', a,  'kind', 'like',  'ref', evt, 'texte', 'x a aimé ton événement'),
        jsonb_build_object('cle', 'like_evt_faux',  'de', d,  'a', a,  'kind', 'like',  'ref', evt, 'texte', 'x a aimé ton événement'),
        jsonb_build_object('cle', 'co_orga',        'de', b,  'a', c3, 'kind', 'like',  'ref', evt, 'texte', 'x a aimé ton événement'),
        -- commentaires
        jsonb_build_object('cle', 'cmt_post',       'de', b,  'a', a,  'kind', 'comment', 'ref', pst, 'texte', 'x a commenté ton post'),
        jsonb_build_object('cle', 'cmt_post_bis',   'de', b,  'a', a,  'kind', 'comment', 'ref', pst, 'texte', 'x a commenté ton post'),
        jsonb_build_object('cle', 'cmt_post_ter',   'de', b,  'a', a,  'kind', 'comment', 'ref', pst, 'texte', 'x a commenté ton post'),
        jsonb_build_object('cle', 'cmt_post_faux',  'de', d,  'a', a,  'kind', 'comment', 'ref', pst, 'texte', 'x a commenté ton post'),
        jsonb_build_object('cle', 'reponse',        'de', b,  'a', c3, 'kind', 'comment', 'ref', pst, 'texte', 'x a répondu à ton commentaire'),
        jsonb_build_object('cle', 'reponse_faux',   'de', d,  'a', c3, 'kind', 'comment', 'ref', pst, 'texte', 'x a répondu à ton commentaire'),
        jsonb_build_object('cle', 'gif_evt',        'de', b,  'a', a,  'kind', 'comment', 'ref', evt, 'texte', 'x a commenté avec un GIF'),
        -- activités
        jsonb_build_object('cle', 'join',           'de', b,  'a', a,  'kind', 'event_join',     'ref', evt, 'texte', 'x a rejoint ton événement'),
        jsonb_build_object('cle', 'join_faux',      'de', d,  'a', a,  'kind', 'event_join',     'ref', evt, 'texte', 'x a rejoint ton événement'),
        jsonb_build_object('cle', 'ecmt',           'de', b,  'a', a,  'kind', 'event_comment',  'ref', evt, 'texte', 'x a commenté ton événement'),
        jsonb_build_object('cle', 'ecmt_faux',      'de', d,  'a', a,  'kind', 'event_comment',  'ref', evt, 'texte', 'x a commenté ton événement'),
        jsonb_build_object('cle', 'avis',           'de', b,  'a', a,  'kind', 'event_feedback', 'ref', evt, 'texte', 'x a noté <b>x</b> 4/5'),
        jsonb_build_object('cle', 'avis_sans_note', 'de', b,  'a', a,  'kind', 'event_feedback', 'ref', evx, 'texte', 'x a noté <b>x</b> 5/5'),
        jsonb_build_object('cle', 'invite',         'de', b,  'a', c3, 'kind', 'event_invite',   'ref', evt, 'texte', 'x t''invite à <b>x</b>'),
        jsonb_build_object('cle', 'invite_faux',    'de', d,  'a', c3, 'kind', 'event_invite',   'ref', evt, 'texte', 'x t''invite à <b>x</b>'),
        jsonb_build_object('cle', 'annule',         'de', a,  'a', b,  'kind', 'event_cancelled','ref', evx, 'texte', 'x a annulé un événement auquel tu participais'),
        jsonb_build_object('cle', 'annule_actif',   'de', a,  'a', b,  'kind', 'event_cancelled','ref', evt, 'texte', 'x a annulé un événement auquel tu participais'),
        jsonb_build_object('cle', 'annule_inscrit', 'de', b,  'a', c3, 'kind', 'event_cancelled','ref', evx, 'texte', 'x a annulé un événement auquel tu participais'),
        jsonb_build_object('cle', 'maj',            'de', a,  'a', b,  'kind', 'event_update',   'ref', evt, 'texte', 'x a modifié un événement auquel tu participes'),
        -- direct
        jsonb_build_object('cle', 'live',           'de', a,  'a', b,  'kind', 'live_video', 'ref', liv, 'texte', 'x est en direct — rejoins le live !'),
        jsonb_build_object('cle', 'live_non_abonne','de', a,  'a', d,  'kind', 'live_video', 'ref', liv, 'texte', 'x est en direct — rejoins le live !'),
        jsonb_build_object('cle', 'live_usurpe',    'de', b,  'a', c3, 'kind', 'live_video', 'ref', liv, 'texte', 'x est en direct — rejoins le live !'),
        -- genres qu'aucun client n'écrit
        jsonb_build_object('cle', 'reaction',       'de', b,  'a', a,  'kind', 'reaction',   'ref', pst, 'texte', 'x a réagi à ta publication')
      )) as x(cle text, de text, a text, kind text, ref text, texte text)
    loop
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', jsonb_build_object('sub', t.de, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', t.de, true);
      perform set_config('passio.notification_serveur', '', true);
      begin
        insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
          values ('zz_srv02b_' || t.cle || '_' || sfx, t.a, t.kind, t.de, t.ref, t.texte, false);
        etat := 'ok';
      exception when others then etat := sqlstate;
      end;
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      mes := mes || jsonb_build_object(t.cle, etat);
    end loop;

    -- Une ligne d'origine SERVEUR n'est pas soumise à la preuve.
    perform set_config('passio.notification_serveur', '1', true);
    begin
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
        values ('zz_srv02b_serveur_' || sfx, d, 'like', a, 'zz_inexistant', 'texte serveur', false);
      etat := 'ok';
    exception when others then etat := sqlstate;
    end;
    perform set_config('passio.notification_serveur', '', true);
    mes := mes || jsonb_build_object('serveur', etat);
    raise exception 'zz_srv02b_annule';
  exception when others then
    if sqlerrm <> 'zz_srv02b_annule' then
      mes := mes || jsonb_build_object('erreur', sqlstate || ' ' || sqlerrm);
    end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('passio.notification_serveur', '', true);
  perform set_config('passio.verdict_srv02b', mes::text, true);
end $epreuve$;

-- ── ③ VERDICT ──
create temp table passio_srv02b_verdict (n int, bloquant boolean, controle text, valeur text) on commit drop;
with v as (select current_setting('passio.verdict_srv02b', true)::jsonb j),
attendus (n, cle, attendu, controle) as (values
  (2,  'like_post',       'ok',    'un j''aime RÉEL d''une publication notifie son autrice'),
  (3,  'like_post_faux',  '42501', 'un « a aimé ton post » sans j''aime est refusé'),
  (4,  'like_post_dest',  '42501', 'un vrai j''aime ne notifie pas un autre que l''autrice'),
  (5,  'like_cmt',        'ok',    'un j''aime réel d''un commentaire notifie son auteur'),
  (6,  'emoji_post',      'ok',    'une réaction emoji réelle sur une publication notifie son autrice'),
  (7,  'like_evt',        'ok',    'un j''aime réel d''une activité notifie son organisatrice'),
  (8,  'like_evt_faux',   '42501', 'un j''aime d''activité sans réaction est refusé'),
  (9,  'cmt_post',        'ok',    'un commentaire réel notifie l''autrice de la publication'),
  (10, 'cmt_post_faux',   '42501', 'un « a commenté » sans commentaire est refusé'),
  (11, 'reponse',         'ok',    'une réponse réelle notifie l''auteur du commentaire visé'),
  (12, 'reponse_faux',    '42501', 'une « réponse » sans réponse est refusée'),
  (13, 'gif_evt',         'ok',    'un commentaire réel dans une activité notifie son organisatrice'),
  (14, 'join',            'ok',    'une inscription réelle notifie l''organisatrice'),
  (15, 'join_faux',       '42501', 'un « a rejoint » sans inscription est refusé'),
  (16, 'ecmt',            'ok',    'un commentaire d''activité réel notifie l''organisatrice'),
  (17, 'ecmt_faux',       '42501', 'un « a commenté ton événement » sans commentaire est refusé'),
  (18, 'avis',            'ok',    'une note réelle notifie l''organisatrice'),
  (19, 'avis_sans_note',  '42501', 'un avis sans note posée est refusé'),
  (20, 'invite',          'ok',    'une invitation vers un abonnement passe'),
  (21, 'invite_faux',     '42501', 'une invitation vers quelqu''un qu''on ne suit pas est refusée'),
  (22, 'annule',          'ok',    'l''annonce d''une activité RÉELLEMENT annulée passe'),
  (23, 'annule_actif',    '42501', 'l''annonce d''annulation d''une activité active est refusée'),
  (24, 'maj',             'ok',    'la mise à jour d''un organisateur à un inscrit passe toujours (lien du 12/11)'),
  (25, 'live',            'ok',    'un direct en cours notifie un abonné'),
  (26, 'live_non_abonne', '42501', 'un direct ne notifie pas un non-abonné'),
  (27, 'live_usurpe',     '42501', 'on n''annonce pas le direct d''un autre'),
  (28, 'reaction',        '42501', 'un genre qu''aucun client n''écrit est refusé'),
  (29, 'serveur',         'ok',    'une ligne d''origine serveur n''est pas soumise à la preuve'),
  (30, 'like_post_bis',   '42501', 'un même j''aime ne s''annonce qu''une fois (le fait se consomme)'),
  (31, 'like_srep',       'ok',    'le j''aime d''une réponse « srep_ » notifie l''auteur de la réponse'),
  (32, 'co_orga',         '42501', 'une co-organisatrice nommée sans son accord ne reçoit pas les interactions'),
  (33, 'cmt_post_bis',    'ok',    'deux faits (commentaire + réponse dans le fil) valent deux notifications'),
  (34, 'cmt_post_ter',    '42501', 'une troisième, sans troisième fait, est refusée'),
  (35, 'annule_inscrit',  '42501', 'un simple inscrit n''annonce pas l''annulation'))
insert into pg_temp.passio_srv02b_verdict
select 1, true, 'l''épreuve a tourné jusqu''au bout', case when j ? 'erreur' then 'ECHEC — ' || (j ->> 'erreur') else 'OK' end from v
union all
select at.n, true, at.controle, case when (v.j ->> at.cle) = at.attendu then 'OK' else 'ECHEC — ' || coalesce(v.j ->> at.cle, '-') end
  from attendus at cross join v
union all select 36, true, 'aucune ligne d''essai ne reste',
  (select case when count(*) = 0 then 'OK' else 'ECHEC — ' || count(*) end from public.notifications
    where id like 'zz\_srv02b\_%' or ref_id like 'zz\_srv02b\_%')
-- L'ordre RÉEL : PostgreSQL déclenche les BEFORE INSERT par nom ; on mesure la place
-- de chacun parmi eux, actifs (tgtype : 1 = ROW, 2 = BEFORE, 4 = INSERT).
union all select 37, true, 'le déclencheur de preuve est actif, après celui de l''origine et avant celui du texte',
  (select case when array_position(noms, 'trg_notifications_origine') < array_position(noms, 'trg_notifications_preuve')
                and array_position(noms, 'trg_notifications_preuve') < array_position(noms, 'trg_notifications_texte')
               then 'OK' else 'ECHEC — ' || coalesce(array_to_string(noms, ', '), '-') end
     from (select array_agg(tgname::text order by tgname) noms from pg_trigger
            where tgrelid = 'public.notifications'::regclass and not tgisinternal and tgenabled <> 'D'
              and tgtype & 7 = 7) x);

do $$
declare details text;
begin
  select string_agg(n || '. ' || controle || ' → ' || coalesce(valeur, 'NULL'), ' ; ' order by n) into details
    from pg_temp.passio_srv02b_verdict where bloquant and valeur is distinct from 'OK';
  if details is not null then
    raise exception 'notifications, preuve de l''événement : RIEN n''est appliqué — %', details
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

select controle, valeur from pg_temp.passio_srv02b_verdict order by n;

commit;
