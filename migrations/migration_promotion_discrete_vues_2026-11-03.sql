-- ═════════════════════════════════════════════════
-- AUDIT 2026-11-02, RISQUES RÉSIDUELS R24 ET R26 (2026-11-03) :
-- LA PROMOTION NE DIT PLUS À UN INCONNU QUI A ÉTÉ PROMU, L'ORGANISATION EST
-- CELLE DE LA LISTE DES PARTICIPANTS, ET LES TROIS VUES PERDENT LES DROITS
-- QUE C-03 A RETIRÉS AUX TABLES
--
-- Mesuré en production le 2026-11-03 au canal ① (execute_sql, lecture seule) :
--   · `promouvoir_attente(text, text)` : la définition de
--     `migration_promotion_attente_2026-11-02.sql`, md5(prosrc) =
--     1a4a2c4dcc01309b6235d1a2c42c3383 (4 154 caractères, sans CR), SECURITY
--     DEFINER, search_path vide, EXECUTE à authenticated et service_role seuls ;
--   · `organise_activite(text)` : ABSENTE — elle naît avec
--     `migration_participants_visibilite_2026-11-03.sql` (C-04), pas encore
--     appliquée (pas avant le 2026-11-05 18:40 UTC, 04-LIVRAISON § 6.3) ;
--   · `events` : 0 activité sans auteur, 0 dont `organizer_id` diffère de
--     l'auteur, 0 avec co-organisateurs ; `event_attendees` : 0 ligne en liste
--     d'attente. Aucune victime aujourd'hui : c'est une fermeture préventive ;
--   · `client_errors_par_heure`, `client_errors_top_24h`, `telemetry_last24h` :
--     vues `security_invoker`, non modifiables (agrégats : is_insertable_into =
--     is_updatable = NO, aucun déclencheur, aucune règle) ; `anon` comme
--     `authenticated` y tiennent les HUIT privilèges (arwdDxtm), dont TRUNCATE,
--     REFERENCES, TRIGGER et MAINTAIN — que C-03 a retirés aux 52 tables
--     (0 restant, mesuré).
--
-- MODÈLE DE MENACE : un compte connecté quelconque, qui parle à PostgREST en
-- direct, veut savoir QUI va à une activité dont il n'est ni l'organisation ni
-- un venant. Il peut appeler toute RPC ouverte à `authenticated`, autant de
-- fois qu'il le veut, et créer des comptes.
--
-- CE QUI CHANGE (et rien d'autre) :
--  ① R24, LE NOM DU PROMU. En mode automatique (`p_user_id` nul), la RPC est
--     ouverte à tout compte connecté — c'est voulu : celui qui libère une place
--     ne voit plus la file depuis C-04, et l'effet est exactement celui que
--     produirait le prochain retrait. Mais elle RENDAIT `user_id` de la
--     personne promue : une place libre et une file suffisaient à un inconnu
--     pour apprendre, un appel à la fois, qui vient — précisément la liste que
--     C-04 ferme. Désormais `user_id` n'est rendu qu'à l'ORGANISATION de
--     l'activité, ou à la personne promue elle-même ; tout autre appelant
--     reçoit `{"ok": true}` SEUL. Les motifs de refus ne changent pas (ils ne
--     portent aucune identité : date, capacité, file vide…), la promotion et sa
--     notification d'origine serveur non plus.
--  ② R24, QUI EST L'ORGANISATION. La promotion CHOISIE (`p_user_id` renseigné)
--     n'acceptait que l'auteur et les co-organisateurs, et comparait elle-même :
--     elle oubliait `organizer_id`, qu'acceptent `organise_activite` (C-04) et le
--     client (`_canManageEvent`) — sur une activité dont l'organisateur n'est pas
--     l'auteur, le bouton « Inscrire » de la liste d'attente échouait (refus
--     honnête, aucune écriture). Et sur une activité SANS auteur, `moi <> null`
--     est nul, donc jamais vrai : n'importe qui désignait le promu (0 activité
--     concernée, mesuré). La RPC appelle désormais
--     `public.organise_activite(p_event_id)` : UNE définition de l'organisation,
--     pour la liste, la discussion d'activité et la promotion.
--     ⚠️ `organise_activite` n'existe pas encore en production : cette migration
--     la crée, COPIE À L'OCTET PRÈS du bloc de C-04 (le banc compare les deux
--     fichiers). `create or replace` dans les deux : dans n'importe quel ordre,
--     le résultat est le même. Seule, sans la policy de C-04, elle ne dit à son
--     appelant que ce qu'il lit déjà dans `events` (auteur, organisateur,
--     co-organisateurs de l'activité) : rien de neuf n'est ouvert.
--     ⚠️ Après cette migration, `organise_activite` A un appelant : le retour
--     arrière de C-04 la laisse en place (« elle peut rester ») et c'est juste ;
--     elle ne se supprime plus sans rendre d'abord l'ancienne `promouvoir_attente`
--     (retour arrière ci-dessous) — sinon la promotion lève 42883.
--  ③ R26, LES VUES. TRUNCATE, REFERENCES, TRIGGER — et MAINTAIN en 17 — sont
--     retirés à `anon` et `authenticated` sur toute vue de `public` (les trois
--     ci-dessus, aujourd'hui), comme C-03 l'a fait pour les tables. Sans effet
--     fonctionnel : rien ne les exerce par PostgREST. Le plus concret des
--     quatre est TRIGGER : il laisse un rôle client qui parlerait SQL poser un
--     déclencheur INSTEAD OF sur une vue qui n'est pas à lui (le banc le montre,
--     puis le voit refusé). SELECT, INSERT, UPDATE et DELETE restent, comme sur
--     les tables (C-03) : SELECT ne rend rien aux rôles clients (security_invoker
--     + RLS des tables de base sans policy de lecture) ; les trois autres sont
--     inertes (vues non modifiables, mesuré au verdict). CE QUI N'EST PAS FERMÉ
--     ICI, dit tel quel : UPDATE et DELETE suffisent encore à un `LOCK TABLE`
--     sur la vue, comme sur chaque table depuis toujours (C-03 les garde) — hors
--     de portée de PostgREST, et ce n'est pas le risque R26.
--
-- ORDRE : indépendante de toutes les autres. Avant C-04, la liste des
-- participants est encore lisible par tout connecté, et `user_id` n'y ajoutait
-- rien : c'est APRÈS C-04 qu'il devient la seule fuite — à appliquer donc AVANT
-- `participants_visibilite` (au plus tard juste après). Le client du 2026-11-03
-- (même PR) lit `{"ok": true}` sans nom comme un succès : il RELIT l'activité
-- sous ses propres droits (compteurs justes, visages que la base accepte de
-- montrer) et ne désigne personne. Un client d'avant le lit comme un refus :
-- rien d'annoncé, compteurs en retard d'un chargement — d'où le client d'abord.
--
-- VERDICT : chaque affirmation est MESURÉE. Le comportement de la RPC par
-- treize appels sous des identités SIMULÉES (`request.jwt.claim.sub`, la
-- lecture même d'`auth.uid()`), sur une activité SYNTHÉTIQUE créée dans une
-- sous-transaction ANNULÉE (bloc ④ : rien n'en reste, ni ligne, ni
-- notification, ni diffusion temps réel — une sous-transaction annulée n'est
-- jamais décodée) ; les droits et les définitions par le catalogue.
--
-- Rejouable ; banc : tests/sql/migration-promotion-discrete-vues.test.sh.
-- RETOUR ARRIÈRE — exécutable tel quel en ôtant « --| » (le banc le rejoue et
-- contrôle l'empreinte de la fonction ET des droits des vues). Il rend l'état
-- exact d'avant CETTE migration : la définition de PRODUCTION de
-- `promouvoir_attente` (pg_get_functiondef, 2026-11-03, md5(prosrc) ci-dessus,
-- recopiée à l'octet près) et les quatre droits des trois vues. Son ACL
-- n'a pas bougé (`create or replace` la garde, et ① la redit à l'identique).
-- `organise_activite` reste : C-04 la crée à l'identique et sa policy en
-- dépend ; sans appelant, elle est inerte.
--| begin;
--| -- promouvoir_attente : la définition de PRODUCTION lue le 2026-11-03 (pg_get_functiondef),
--| -- md5(prosrc) = 1a4a2c4dcc01309b6235d1a2c42c3383, recopiée à l'octet près.
--| CREATE OR REPLACE FUNCTION public.promouvoir_attente(p_event_id text, p_user_id text DEFAULT NULL::text)
--|  RETURNS jsonb
--|  LANGUAGE plpgsql
--|  SECURITY DEFINER
--|  SET search_path TO ''
--| AS $function$
--| declare
--|   moi      text := (auth.uid())::text;
--|   ev       record;
--|   inscrits integer;
--|   cible    text;
--|   nb       integer;
--| begin
--|   if auth.uid() is null then return jsonb_build_object('ok', false, 'motif', 'non_connecte'); end if;
--|   -- Verrou de l'activité : deux promotions (ou une promotion et une inscription)
--|   -- concurrentes se suivent, la seconde compte APRÈS la première.
--|   select id, status, max_attendees, date_at, end_at, author_id, title, co_organizers
--|     into ev from public.events where id = p_event_id for update;
--|   if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
--|   if ev.status = 'cancelled' then return jsonb_build_object('ok', false, 'motif', 'annulee'); end if;
--|   if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then return jsonb_build_object('ok', false, 'motif', 'passee'); end if;
--|   if ev.max_attendees is null then return jsonb_build_object('ok', false, 'motif', 'sans_capacite'); end if;
--|
--|   if p_user_id is not null then
--|     -- Promotion CHOISIE : réservée à l'organisation.
--|     if moi <> ev.author_id
--|        and not (coalesce(ev.co_organizers, '[]'::jsonb) ? moi) then
--|       return jsonb_build_object('ok', false, 'motif', 'non_autorise');
--|     end if;
--|     cible := p_user_id;
--|   end if;
--|
--|   select count(*) into inscrits from public.event_attendees a
--|     where a.event_id = p_event_id and a.rsvp = 'going';
--|   if inscrits >= ev.max_attendees then return jsonb_build_object('ok', false, 'motif', 'complete'); end if;
--|
--|   if cible is null then
--|     -- Premier arrivé, premier servi.
--|     select a.user_id into cible from public.event_attendees a
--|       where a.event_id = p_event_id and a.rsvp = 'waitlist'
--|       order by a.created_at asc, a.user_id asc limit 1;
--|     if cible is null then return jsonb_build_object('ok', false, 'motif', 'personne_en_attente'); end if;
--|   end if;
--|
--|   begin
--|     update public.event_attendees set rsvp = 'going'
--|       where event_id = p_event_id and user_id = cible and rsvp = 'waitlist';
--|     get diagnostics nb = row_count;
--|   exception when others then
--|     -- Capacité tranchée par le trigger entre-temps, compte en suppression,
--|     -- admission : le refus est un verdict, pas une erreur.
--|     return jsonb_build_object('ok', false, 'motif', 'refuse', 'detail', left(sqlerrm, 80));
--|   end;
--|   if nb = 0 then return jsonb_build_object('ok', false, 'motif', 'pas_en_attente'); end if;
--|
--|   -- Notification d'origine serveur, identifiant déterministe (rejeu sans doublon).
--|   -- ⚠️ `n_pa_` n'est PAS réservé au serveur : un compte peut pré-insérer cet
--|   -- identifiant à SON nom (policy client : `from_id = auth.uid()` seulement) —
--|   -- le piège de la 6ᵉ contre-revue du 16/09 sur `n_m_`. Le `on conflict` ne
--|   -- met donc à jour que la ligne du VRAI destinataire ; sinon on ré-insère sous
--|   -- un identifiant neuf (revue indépendante du 2026-11-02, point 3e).
--|   perform set_config('passio.notification_serveur', '1', true);
--|   begin
--|     insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
--|     values ('n_pa_' || left(p_event_id, 12) || '_' || left(cible, 8), cible, 'event_update', ev.author_id, p_event_id,
--|             'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
--|             false, now())
--|     on conflict (id) do update set content = excluded.content, seen = false, created_at = now()
--|       where public.notifications.user_id = excluded.user_id and public.notifications.kind = 'event_update';
--|     if not found then
--|       insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
--|       values ('n_pa_' || left(md5(p_event_id || '|' || cible || '|' || clock_timestamp()::text), 20), cible, 'event_update', ev.author_id, p_event_id,
--|               'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
--|               false, now());
--|     end if;
--|   exception when others then
--|     raise warning 'promouvoir_attente : notification non écrite (%) — la promotion est conservée', sqlerrm;
--|   end;
--|   return jsonb_build_object('ok', true, 'user_id', cible);
--| end
--| $function$;
--| -- Les quatre droits des trois vues, tels que mesurés le 2026-11-03 (concédant : postgres).
--| grant truncate, references, trigger on table public.client_errors_par_heure, public.client_errors_top_24h,
--|   public.telemetry_last24h to anon, authenticated;
--| do $$
--| begin
--|   if current_setting('server_version_num')::int >= 170000 then
--|     execute 'grant maintain on table public.client_errors_par_heure, public.client_errors_top_24h, public.telemetry_last24h to anon, authenticated';
--|   end if;
--| end $$;
--| commit;
-- ═════════════════════════════════════════════════
begin;

-- ── ② L'organisation : la définition de C-04, à l'octet près ──
create or replace function public.organise_activite(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text))
  );
$$;
revoke all on function public.organise_activite(text) from public, anon;
grant execute on function public.organise_activite(text) to authenticated;

-- ── ① ② promouvoir_attente : la définition de production, l'organisation par
-- `organise_activite`, et le nom du promu réservé à l'organisation ou au promu ──
create or replace function public.promouvoir_attente(p_event_id text, p_user_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  moi      text := (auth.uid())::text;
  ev       record;
  inscrits integer;
  cible    text;
  nb       integer;
  orga     boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'motif', 'non_connecte'); end if;
  -- Verrou de l'activité : deux promotions (ou une promotion et une inscription)
  -- concurrentes se suivent, la seconde compte APRÈS la première.
  select id, status, max_attendees, date_at, end_at, author_id, title
    into ev from public.events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
  if ev.status = 'cancelled' then return jsonb_build_object('ok', false, 'motif', 'annulee'); end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then return jsonb_build_object('ok', false, 'motif', 'passee'); end if;
  if ev.max_attendees is null then return jsonb_build_object('ok', false, 'motif', 'sans_capacite'); end if;

  -- L'ORGANISATION A UNE DÉFINITION (R24, 2026-11-03) : auteur, organisateur
  -- (`organizer_id`) ou co-organisateur — celle de la liste des participants et
  -- de la discussion d'activité (C-04), lue sous le verrou ci-dessus. La
  -- comparaison qu'on faisait ici oubliait `organizer_id`, et laissait passer
  -- n'importe qui sur une activité sans auteur (`moi <> null` n'est jamais vrai).
  orga := coalesce(public.organise_activite(p_event_id), false);

  if p_user_id is not null then
    -- Promotion CHOISIE : réservée à l'organisation.
    if not orga then
      return jsonb_build_object('ok', false, 'motif', 'non_autorise');
    end if;
    cible := p_user_id;
  end if;

  select count(*) into inscrits from public.event_attendees a
    where a.event_id = p_event_id and a.rsvp = 'going';
  if inscrits >= ev.max_attendees then return jsonb_build_object('ok', false, 'motif', 'complete'); end if;

  if cible is null then
    -- Premier arrivé, premier servi.
    select a.user_id into cible from public.event_attendees a
      where a.event_id = p_event_id and a.rsvp = 'waitlist'
      order by a.created_at asc, a.user_id asc limit 1;
    if cible is null then return jsonb_build_object('ok', false, 'motif', 'personne_en_attente'); end if;
  end if;

  begin
    update public.event_attendees set rsvp = 'going'
      where event_id = p_event_id and user_id = cible and rsvp = 'waitlist';
    get diagnostics nb = row_count;
  exception when others then
    -- Capacité tranchée par le trigger entre-temps, compte en suppression,
    -- admission : le refus est un verdict, pas une erreur.
    return jsonb_build_object('ok', false, 'motif', 'refuse', 'detail', left(sqlerrm, 80));
  end;
  if nb = 0 then return jsonb_build_object('ok', false, 'motif', 'pas_en_attente'); end if;

  -- Notification d'origine serveur, identifiant déterministe (rejeu sans doublon).
  -- ⚠️ `n_pa_` n'est PAS réservé au serveur : un compte peut pré-insérer cet
  -- identifiant à SON nom (policy client : `from_id = auth.uid()` seulement) —
  -- le piège de la 6ᵉ contre-revue du 16/09 sur `n_m_`. Le `on conflict` ne
  -- met donc à jour que la ligne du VRAI destinataire ; sinon on ré-insère sous
  -- un identifiant neuf (revue indépendante du 2026-11-02, point 3e).
  perform set_config('passio.notification_serveur', '1', true);
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values ('n_pa_' || left(p_event_id, 12) || '_' || left(cible, 8), cible, 'event_update', ev.author_id, p_event_id,
            'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
            false, now())
    on conflict (id) do update set content = excluded.content, seen = false, created_at = now()
      where public.notifications.user_id = excluded.user_id and public.notifications.kind = 'event_update';
    if not found then
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values ('n_pa_' || left(md5(p_event_id || '|' || cible || '|' || clock_timestamp()::text), 20), cible, 'event_update', ev.author_id, p_event_id,
              'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
              false, now());
    end if;
  exception when others then
    raise warning 'promouvoir_attente : notification non écrite (%) — la promotion est conservée', sqlerrm;
  end;
  -- QUI a été promu ne se dit qu'à l'organisation, ou à la personne promue
  -- (R24, 2026-11-03). La promotion automatique est ouverte à tout compte
  -- connecté — celui qui libère une place ne voit plus la file depuis C-04 — et
  -- rendre le nom à n'importe quel appelant lui livrait, un appel à la fois,
  -- la liste de qui vient : celle que C-04 ferme. Les autres apprennent que la
  -- place est donnée, pas à qui.
  if orga or cible = moi then
    return jsonb_build_object('ok', true, 'user_id', cible);
  end if;
  return jsonb_build_object('ok', true);
end
$function$;
revoke execute on function public.promouvoir_attente(text, text) from public, anon;
grant execute on function public.promouvoir_attente(text, text) to authenticated;

-- ── ③ R26 : les privilèges hors RLS quittent les vues, comme les tables (C-03) ──
-- SELECT / INSERT / UPDATE / DELETE intacts (voir l'en-tête).
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm') loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', r.relname);
    -- MAINTAIN n'existe qu'à partir de PostgreSQL 17 : le banc tourne sur 16, la prod sur 17.6.
    if current_setting('server_version_num')::int >= 170000 then
      execute format('revoke maintain on table public.%I from anon, authenticated', r.relname);
    end if;
  end loop;
end $$;

-- ── ④ LE COMPORTEMENT, MESURÉ : une activité synthétique, une sous-transaction ANNULÉE ──
-- Décor : capacité 9, neuf personnes en file (W1 la plus ancienne), des comptes
-- FICTIFS (`00000000-0000-4000-8000-0000000024xx` : aucun compte réel n'a cette
-- forme). Le décor s'écrit SANS session (les gardes clientes ne jouent pas,
-- comme pour toute écriture d'administration) ; la RPC est ensuite appelée sous
-- des identités simulées. Le bloc finit en levant `passio_verdict_annule` : la
-- sous-transaction est annulée et tout ce qu'elle a écrit avec elle (activité,
-- inscriptions, secret de pointage, notifications, réglages de session)
-- disparaît. Seules les mesures, tenues dans une variable, survivent : posées
-- en réglage de transaction (`passio.verdict_promotion`), elles nourrissent le
-- tableau. Une erreur IMPRÉVUE du décor n'annule pas la migration : elle
-- s'écrit au tableau (ECHEC), et on mesure au canal ①.
do $verdict$
declare
  ev   constant text := 'zz_verdict_r24_' || left(md5(clock_timestamp()::text || random()::text), 12);
  aut  constant text := '00000000-0000-4000-8000-000000002401';   -- auteur
  org  constant text := '00000000-0000-4000-8000-000000002402';   -- organisateur : ni auteur, ni co-organisateur
  coo  constant text := '00000000-0000-4000-8000-000000002403';   -- co-organisateur
  inc  constant text := '00000000-0000-4000-8000-000000002404';   -- un inconnu
  w    constant text[] := array(select '00000000-0000-4000-8000-00000000241' || i from generate_series(1, 9) i);
  mes  jsonb := '{}'::jsonb;
  r    jsonb;
  reste integer;
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.events (id, author_id, organizer_id, title, status, max_attendees, date_at, co_organizers)
      values (ev, aut, org, 'Mesure du verdict R24', 'active', 9, now() + interval '2 days', jsonb_build_array(coo));
    insert into public.event_attendees (event_id, user_id, rsvp, created_at)
      select ev, w[i], 'waitlist', now() - make_interval(hours => 10 - i) from generate_series(1, 9) i;

    -- ⚠️ L'état écrit par la RPC se lit dans une instruction À PART : une lecture
    -- placée dans la même instruction que l'appel voit l'instantané d'AVANT lui
    -- (une fonction VOLATILE n'est pas vue de la requête qui l'appelle).
    -- a. un INCONNU libère la file (automatique) : W1 promue, nom tu
    perform set_config('request.jwt.claim.sub', inc, true);
    r := public.promouvoir_attente(ev);
    mes := mes || jsonb_build_object('a', r,
      'a_w1', (select x.rsvp from public.event_attendees x where x.event_id = ev and x.user_id = w[1]));
    -- b. W3, en file mais PAS la première (W2 l'est) : W2 promue, nom tu
    perform set_config('request.jwt.claim.sub', w[3], true);
    r := public.promouvoir_attente(ev);
    mes := mes || jsonb_build_object('b', r,
      'b_w2', (select x.rsvp from public.event_attendees x where x.event_id = ev and x.user_id = w[2]));
    -- c. W3, désormais la première : son propre nom
    mes := mes || jsonb_build_object('c', public.promouvoir_attente(ev));
    -- d, e, f. l'auteur, l'organisateur, le co-organisateur (automatique) : W4, W5, W6, nommées
    perform set_config('request.jwt.claim.sub', aut, true);
    mes := mes || jsonb_build_object('d', public.promouvoir_attente(ev));
    perform set_config('request.jwt.claim.sub', org, true);
    mes := mes || jsonb_build_object('e', public.promouvoir_attente(ev));
    perform set_config('request.jwt.claim.sub', coo, true);
    mes := mes || jsonb_build_object('f', public.promouvoir_attente(ev));
    -- g. l'inconnu DÉSIGNE W9 : refusé, rien n'est écrit
    perform set_config('request.jwt.claim.sub', inc, true);
    r := public.promouvoir_attente(ev, w[9]);
    mes := mes || jsonb_build_object('g', r,
      'g_w9', (select x.rsvp from public.event_attendees x where x.event_id = ev and x.user_id = w[9]));
    -- h. l'ORGANISATEUR seul (organizer_id) désigne W9, qui n'est pas la première (W7) : accepté — R24 ②
    perform set_config('request.jwt.claim.sub', org, true);
    mes := mes || jsonb_build_object('h', public.promouvoir_attente(ev, w[9]));
    -- i, j. le co-organisateur désigne W8, l'auteur W7 : acceptés (inchangé)
    perform set_config('request.jwt.claim.sub', coo, true);
    mes := mes || jsonb_build_object('i', public.promouvoir_attente(ev, w[8]));
    perform set_config('request.jwt.claim.sub', aut, true);
    mes := mes || jsonb_build_object('j', public.promouvoir_attente(ev, w[7]));
    -- k. complet (9 / 9) : l'inconnu lit « complete » ; une activité absente : « introuvable »
    perform set_config('request.jwt.claim.sub', inc, true);
    mes := mes || jsonb_build_object('k', public.promouvoir_attente(ev), 'k_absente', public.promouvoir_attente(ev || '_absente'));
    -- l. sans session : « non_connecte »
    perform set_config('request.jwt.claim.sub', '', true);
    mes := mes || jsonb_build_object('l', public.promouvoir_attente(ev));
    -- m. `organise_activite`, la définition de l'organisation, sous chaque identité
    perform set_config('request.jwt.claim.sub', aut, true);
    mes := mes || jsonb_build_object('orga_auteur', public.organise_activite(ev));
    perform set_config('request.jwt.claim.sub', org, true);
    mes := mes || jsonb_build_object('orga_organisateur', public.organise_activite(ev));
    perform set_config('request.jwt.claim.sub', coo, true);
    mes := mes || jsonb_build_object('orga_coorganisateur', public.organise_activite(ev));
    perform set_config('request.jwt.claim.sub', inc, true);
    mes := mes || jsonb_build_object('orga_inconnu', public.organise_activite(ev));
    perform set_config('request.jwt.claim.sub', w[1], true);
    mes := mes || jsonb_build_object('orga_promue', public.organise_activite(ev));
    perform set_config('request.jwt.claim.sub', '', true);
    mes := mes || jsonb_build_object('orga_sans_session', public.organise_activite(ev));
    -- n. ce qui a été écrit : les venants, la file, les notifications
    mes := mes || jsonb_build_object(
      'venants', (select coalesce(jsonb_agg(x.user_id order by x.user_id), '[]'::jsonb) from public.event_attendees x where x.event_id = ev and x.rsvp = 'going'),
      'en_file', (select count(*) from public.event_attendees x where x.event_id = ev and x.rsvp = 'waitlist'),
      'notifications', (select jsonb_build_object('lignes', count(*), 'destinataires', count(distinct y.user_id),
                                                  'serveur', count(*) filter (where y.origine = 'serveur'),
                                                  'event_update', count(*) filter (where y.kind = 'event_update'),
                                                  'de_l_auteur', count(*) filter (where y.from_id = aut))
                          from public.notifications y where y.ref_id = ev));
    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';
  exception when others then
    if sqlerrm is distinct from 'passio_verdict_annule' then
      mes := mes || jsonb_build_object('erreur', left(sqlstate || ' ' || sqlerrm, 160));
    end if;
  end;
  -- Après l'annulation : rien ne doit rester du décor.
  mes := mes || jsonb_build_object('restes',
    (select count(*) from public.events x where x.id = ev)
    + (select count(*) from public.event_attendees x where x.event_id = ev)
    + (select count(*) from public.notifications y where y.ref_id = ev));
  if to_regclass('public.event_checkin_secrets') is not null then
    execute 'select count(*) from public.event_checkin_secrets s where s.event_id = $1' into reste using ev;
    mes := mes || jsonb_build_object('restes_secret', reste);
  end if;
  mes := mes || jsonb_build_object('ok_w', (select jsonb_agg(jsonb_build_object('ok', true, 'user_id', u) order by n) from unnest(w) with ordinality as t(u, n)));
  perform set_config('passio.verdict_promotion', mes::text, true);
end
$verdict$;

-- ── Verdict ──
-- Chaque ligne MESURE ce qu'elle affirme : le comportement par le bloc ④
-- (réponses rendues, états écrits, puis annulés), les droits et les
-- définitions par le catalogue. `ok_w[i]` = la réponse attendue quand la base
-- NOMME Wi : {"ok": true, "user_id": Wi}.
with v as (select coalesce(nullif(current_setting('passio.verdict_promotion', true), ''), '{}')::jsonb as j)
select 'R24 · mesure exécutée : activité synthétique, treize appels sous identités simulées, sous-transaction ANNULÉE' as controle,
       (select case when j ? 'erreur' then 'ECHEC — ' || (j->>'erreur')
                    when j ? 'venants' and j ? 'ok_w' then 'OK' else 'ECHEC — mesure absente' end from v) as valeur
union all select 'R24 · AUTOMATIQUE, déclenchée par un inconnu : la plus ancienne de la file est promue, la réponse est {"ok": true} SEULE (aucun user_id)',
       (select case when j->'a' = '{"ok": true}'::jsonb and j->>'a_w1' = 'going' then 'OK' else 'ECHEC' end from v)
union all select 'R24 · AUTOMATIQUE, déclenchée par une personne de la file qui n''est PAS la promue : {"ok": true} seule',
       (select case when j->'b' = '{"ok": true}'::jsonb and j->>'b_w2' = 'going' then 'OK' else 'ECHEC' end from v)
union all select 'R24 · AUTOMATIQUE, déclenchée par la personne promue : SON user_id',
       (select case when j->'c' = j->'ok_w'->2 then 'OK' else 'ECHEC' end from v)
union all select 'R24 · AUTOMATIQUE, déclenchée par l''auteur, l''organisateur (organizer_id), le co-organisateur : le user_id de la personne promue, dans l''ordre d''arrivée',
       (select case when j->'d' = j->'ok_w'->3 and j->'e' = j->'ok_w'->4 and j->'f' = j->'ok_w'->5 then 'OK' else 'ECHEC' end from v)
union all select 'R24 · CHOISIE par un inconnu : non_autorise, et la personne désignée attend toujours',
       (select case when j->'g' = '{"ok": false, "motif": "non_autorise"}'::jsonb and j->>'g_w9' = 'waitlist' then 'OK' else 'ECHEC' end from v)
union all select 'R24 · CHOISIE par l''ORGANISATEUR (organizer_id, ni auteur ni co-organisateur) : acceptée, la personne désignée et non la première',
       (select case when j->'h' = j->'ok_w'->8 then 'OK' else 'ECHEC' end from v)
union all select 'R24 · CHOISIE par le co-organisateur, puis par l''auteur : acceptées (inchangé)',
       (select case when j->'i' = j->'ok_w'->7 and j->'j' = j->'ok_w'->6 then 'OK' else 'ECHEC' end from v)
union all select 'capacité tenue : 9 venants pour 9 places, file vide, puis « complete » ; « introuvable » et « non_connecte » inchangés',
       (select case when jsonb_array_length(j->'venants') = 9 and j->'venants' = (select jsonb_agg(x->'user_id' order by x->>'user_id') from jsonb_array_elements(j->'ok_w') x)
                     and j->>'en_file' = '0' and j->'k' = '{"ok": false, "motif": "complete"}'::jsonb
                     and j->'k_absente' = '{"ok": false, "motif": "introuvable"}'::jsonb
                     and j->'l' = '{"ok": false, "motif": "non_connecte"}'::jsonb then 'OK' else 'ECHEC' end from v)
union all select 'une notification d''origine serveur par personne promue (9), event_update, au nom de l''auteur ; aucune autre',
       (select case when j->'notifications' = '{"lignes": 9, "destinataires": 9, "serveur": 9, "event_update": 9, "de_l_auteur": 9}'::jsonb then 'OK' else 'ECHEC' end from v)
union all select 'organise_activite : auteur, organisateur, co-organisateur → vrai ; inconnu, personne promue, sans session → faux',
       (select case when j->'orga_auteur' = 'true'::jsonb and j->'orga_organisateur' = 'true'::jsonb and j->'orga_coorganisateur' = 'true'::jsonb
                     and j->'orga_inconnu' = 'false'::jsonb and j->'orga_promue' = 'false'::jsonb and j->'orga_sans_session' = 'false'::jsonb then 'OK' else 'ECHEC' end from v)
union all select 'aucune trace du décor : activité, inscriptions, notifications, secret de pointage (sous-transaction annulée)',
       (select case when j->>'restes' = '0' and coalesce(j->>'restes_secret', '0') = '0' then 'OK' else 'ECHEC' end from v)
union all select 'promouvoir_attente s''en remet à organise_activite : plus aucune comparaison d''auteur ni de co-organisateurs à elle',
       case when (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.promouvoir_attente(text,text)')) like '%orga := coalesce(public.organise_activite(p_event_id), false);%'
             and (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.promouvoir_attente(text,text)')) not like '%co_organizers%'
             and (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.promouvoir_attente(text,text)')) not like '%moi <> ev.author_id%' then 'OK' else 'ECHEC' end
union all select 'promouvoir_attente et organise_activite : SECURITY DEFINER, search_path vide, exécutables par authenticated seul (ni anon, ni PUBLIC)',
       case when (select count(*) from pg_proc p
                   where p.oid in (to_regprocedure('public.promouvoir_attente(text,text)'), to_regprocedure('public.organise_activite(text)'))
                     and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""'
                     and p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)) = 2
             and has_function_privilege('authenticated', 'public.promouvoir_attente(text,text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.organise_activite(text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.promouvoir_attente(text,text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.organise_activite(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all select 'R26 · aucune relation de public (table, vue, vue matérialisée) ne donne TRUNCATE, REFERENCES, TRIGGER — ni MAINTAIN en 17 — à anon ou authenticated',
       case when not exists (
         select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join (values ('anon'), ('authenticated')) r(role)
          where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
            and (has_table_privilege(r.role, c.oid, 'TRUNCATE') or has_table_privilege(r.role, c.oid, 'REFERENCES')
                 or has_table_privilege(r.role, c.oid, 'TRIGGER')
                 or case when current_setting('server_version_num')::int >= 170000
                         then has_table_privilege(r.role, c.oid, 'MAINTAIN') else false end)) then 'OK' else 'ECHEC' end
union all select 'R26 · rien d''autre ne change : les trois vues gardent SELECT, INSERT, UPDATE, DELETE pour anon et authenticated, et service_role TRUNCATE, REFERENCES, TRIGGER',
       case when (select count(*) from (values ('public.client_errors_par_heure'), ('public.client_errors_top_24h'), ('public.telemetry_last24h')) t(vue)
                    cross join (values ('anon'), ('authenticated')) r(role)
                   where to_regclass(t.vue) is not null
                     and has_table_privilege(r.role, t.vue, 'SELECT') and has_table_privilege(r.role, t.vue, 'INSERT')
                     and has_table_privilege(r.role, t.vue, 'UPDATE') and has_table_privilege(r.role, t.vue, 'DELETE')
                     and has_table_privilege('service_role', t.vue, 'TRUNCATE') and has_table_privilege('service_role', t.vue, 'REFERENCES')
                     and has_table_privilege('service_role', t.vue, 'TRIGGER')) = 6 then 'OK' else 'ECHEC' end
union all select 'R26 · les trois vues restent security_invoker et NON modifiables (sans déclencheur ni règle) : INSERT, UPDATE, DELETE y sont inertes',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   join information_schema.views iv on iv.table_schema = n.nspname and iv.table_name = c.relname
                  where n.nspname = 'public' and c.relname in ('client_errors_par_heure', 'client_errors_top_24h', 'telemetry_last24h')
                    and c.relkind = 'v' and c.reloptions::text[] && array['security_invoker=on', 'security_invoker=true']
                    and iv.is_insertable_into = 'NO' and iv.is_updatable = 'NO'
                    and iv.is_trigger_insertable_into = 'NO' and iv.is_trigger_updatable = 'NO' and iv.is_trigger_deletable = 'NO'
                    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid)
                    and not exists (select 1 from pg_rewrite w where w.ev_class = c.oid and w.rulename <> '_RETURN')) = 3 then 'OK' else 'ECHEC' end;

commit;
