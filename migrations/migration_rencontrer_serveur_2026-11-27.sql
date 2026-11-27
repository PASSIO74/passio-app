-- ═══════════════════════════════════════════════════════════════════════════
-- RENCONTRER — LES SIX FERMETURES CÔTÉ SERVEUR (2026-11-27)
--
-- `npm run migration:appliquer -- migrations/migration_rencontrer_serveur_2026-11-27.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict LÈVE si une
-- seule ligne est en ECHEC. AUCUN PRÉREQUIS CLIENT : l'ancien client garde un
-- comportement juste (ses refus nouveaux tombent sur son message générique ;
-- son appel `promouvoir_attente` après un départ répond « complete » quand la
-- base a déjà promu). Retour arrière : `migration_rencontrer_serveur_retour_2026-11-27.sql`.
--
-- Défauts fermés, tous mesurés (vérification contradictoire, et simulation à
-- dix comptes réels du staging, `npm run village:rencontrer`) ; définitions de
-- PRODUCTION relues au catalogue en lecture seule le 2026-11-27 :
--
-- ① PLACE LIBÉRÉE SANS PROMOTION. Seul le client de celui qui part appelait
--    `promouvoir_attente`. Un refus ou un retrait par l'organisation
--    (`valider_participant(false)`, `retirer_invite_activite`), une pose de
--    blocage, une purge, ou une HAUSSE de `max_attendees` laissaient la place
--    vide et la file figée. Désormais la BASE promeut : déclencheur AFTER
--    (sortie de « going » ou suppression d'une ligne « going ») et AFTER UPDATE
--    OF max_attendees (hausse), qui appellent `rencontres_prive.promouvoir_file`
--    — la logique de `promouvoir_attente` (verrou de l'activité, premier arrivé
--    par `created_at` puis `user_id`, mise à jour sous les déclencheurs de la
--    session, notification `n_pa_` déterministe) remplie jusqu'à la capacité.
--    Une tête de file non promouvable (plafond du jour, compte en suppression,
--    verrou de paire pris) est SAUTÉE au lieu de bloquer la file (20 essais au
--    plus). PAS DE DOUBLE PROMOTION : tout se fait sous le verrou de l'activité ;
--    l'appel client qui suit trouve « complete » (ou promeut la place suivante,
--    s'il en reste une, ce qui est juste). La notification dit enfin la vérité :
--    la personne promue reste à valider (l'ancien « tu es inscrit·e ! » mentait).
--
-- ② RETRAIT SANS AVIS. Retirer une participation déjà VALIDÉE (ou une ligne
--    « peut-être » / en liste d'attente) n'écrivait rien chez la personne : seul
--    le refus d'une demande en attente était annoncé (`signaler_refus_demande`).
--    `valider_participant(false)` écrit maintenant `n_pi_retrait_<uuid>`
--    (origine serveur, titre échappé, AUCUN contenu libre) ; `retirer_invite_activite`
--    prévient une personne qui avait répondu, SANS le titre (il ne doit pas
--    rester chez elle — règle du 2026-11-27, « restes »).
--
-- ③ NOTE ET AVIS HORS PARTICIPATION. `rating`, `feedback`, `rated_at`
--    s'écrivaient par UPDATE direct avant la fin et sans participation
--    (simulation A6 : ACCEPTÉ). `event_attendees_note_garde` refuse
--    `note_avant_fin` (activité annulée ou pas terminée) et
--    `note_sans_participation` (ni pointé·e, ni « going » validé ; l'organisation
--    ne note pas sa propre activité) ; `rated_at` devient l'heure du serveur.
--    Effacer sa note reste possible.
--
-- ④ POINTAGE PAR ÉCRITURE DIRECTE. `checked_in_at` s'écrivait pour une ligne
--    « je ne peux pas », en attente, ou une demande non validée (simulation C4 :
--    ACCEPTÉ). `event_attendees_pointage_garde` exige désormais l'organisation,
--    ou un « going » VALIDÉ ; le pointage PAR CODE (`pointer_par_code`, le code
--    est remis sur place) garde son contrat (going ou maybe) par un réglage
--    transactionnel posé autour de sa seule écriture. La valeur devient l'heure
--    du serveur, et un pointage posé ne se réécrit plus.
--
-- ⑤ VALIDÉ HORS DE LA DISCUSSION. Une personne validée n'entrait dans
--    `evgrp_<id>` qu'en ouvrant l'app (le client s'ajoute lui-même). La branche
--    d'acceptation de `valider_participant` l'ajoute à `conv_members`
--    (on conflict do nothing) si la discussion existe ; et ouvrir la discussion
--    (`events.conv_id` posé) y fait entrer les personnes DÉJÀ validées. Gardes
--    relues : `conv_members_garde` (créateur = organisation, groupe `evgrp_`
--    hors plafond de 256), `membre_garde` (accord posé juste avant),
--    `trg_debit_compte` (60/min, compté à l'organisation), `trg_rid_opaque`
--    (rid tiré par la base), `zz_barriere_suppression`, FK `profiles` (l'accord
--    l'exige déjà). Un refus de l'une d'elles n'empêche JAMAIS la validation
--    (bloc d'exception, avertissement) : la personne entrera en ouvrant l'app.
--
-- ⑥ COUVERTURE SERVIE PAR N'IMPORTE QUEL HÔTE. `events.cover_url` acceptait
--    tout `https://` : une image tierce lit l'adresse IP de chaque lecteur.
--    Contrainte `events_cover_url_hote` : Storage du projet (production ou
--    staging, `/storage/v1/object|render/image/public/`) ou l'ancien relais
--    de l'app (`passio-app.netlify.app/media/`, même origine que l'app).
--    Mesuré en production le 2026-11-27 (count agrégé par hôte, aucune ligne
--    lue) : 10 sans couverture, 2 sur le Storage du projet, 1 sur le relais
--    `/media/` — AUCUNE hors hôte : la contrainte est posée VALIDE. Si une base
--    en porte (le staging a dérivé), elle est posée `not valid` et le verdict
--    le DIT (ligne 9, valeur « OK (not valid : N) ») : les lignes existantes
--    restent lisibles, toute écriture neuve est jugée.
--
-- VERROUS : `lock_timeout` 3 s, `statement_timeout` 30 s.
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── GARDE : prérequis et empreintes des définitions REMPLACÉES ──────────────
-- md5 du corps, CR retirés (la production porte parfois du CRLF). Une
-- définition qui n'est ni celle mesurée le 2026-11-27, ni celle qu'écrit cette
-- migration (rejeu), ARRÊTE tout : relire avant de réécrire.
do $garde$
declare
  r record;
  emp text;
begin
  if to_regclass('rencontres_prive.accords') is null
     or to_regclass('rencontres_prive.decisions') is null
     or to_regclass('public.event_invites_retires') is null
     or to_regprocedure('public.promouvoir_attente(text,text)') is null
     or to_regprocedure('public.passio_echapper_html(text)') is null
     or to_regprocedure('rencontres_prive.bloque(text,text)') is null then
    raise exception 'rencontrer_serveur : prérequis absents (validation de l''organisation, activités privées, retraits)';
  end if;
  for r in select * from (values
    ('public.valider_participant(text,text,boolean)', 'e7ca3212181f3daffb584582fb343d85', '6e3088fa44521cdc3ecb55c52d0eb941'),
    ('public.pointer_par_code(text,text)', '6f85eba6af8165ec1aba8da2ff4d0ee0', '72ea92116cb82459f14f30d27723b06f'),
    ('public.event_attendees_pointage_garde()', '82f0ddfb437c732aa9527d6c56511ef8', 'c514ea3778e55c670c2f886dac73f976'),
    ('public.retirer_invite_activite(text,text)', '95b00925397b8d0cf8c040a51e172179', '20bb9d048a0d5d9bd4c2cbda48663f38')
  ) as v(sig, avant, apres) loop
    if to_regprocedure(r.sig) is null then
      raise exception 'rencontrer_serveur : % absente', r.sig;
    end if;
    select md5(replace(p.prosrc, chr(13), '')) into emp from pg_proc p where p.oid = to_regprocedure(r.sig);
    if emp is distinct from r.avant and emp is distinct from r.apres then
      raise exception 'rencontrer_serveur : % a changé depuis la mesure du 2026-11-27 (md5 %) — relire avant de réécrire', r.sig, emp;
    end if;
  end loop;
end
$garde$;

-- ── ① LA BASE PROMEUT LA FILE ───────────────────────────────────────────────
create or replace function rencontres_prive.promouvoir_file(p_event_id text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  ev        record;
  libres    integer;
  cible     text;
  essayes   text[] := '{}';
  nb        integer;
  promus    integer := 0;
  precedent text;
begin
  -- Le verrou de `promouvoir_attente` et de la garde de capacité : deux
  -- promotions (la base, puis l'appel client) se suivent, la seconde compte
  -- APRÈS la première — jamais deux personnes pour une place.
  select id, status, max_attendees, date_at, end_at, author_id, title
    into ev from public.events where id = p_event_id for update;
  if not found or ev.status is distinct from 'active' or ev.max_attendees is null
     or coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then
    return 0;
  end if;
  loop
    select ev.max_attendees - count(*) into libres from public.event_attendees a
      where a.event_id = p_event_id and a.rsvp = 'going';
    exit when libres <= 0;
    -- Premier arrivé, premier servi — en sautant qui vient d'être refusé.
    cible := null;
    select a.user_id into cible from public.event_attendees a
      where a.event_id = p_event_id and a.rsvp = 'waitlist' and not (a.user_id = any(essayes))
      order by a.created_at asc, a.user_id asc limit 1;
    exit when cible is null;
    essayes := essayes || cible;
    exit when cardinality(essayes) > 20;
    nb := 0;
    begin
      -- Sous les déclencheurs de la SESSION, comme `promouvoir_attente` :
      -- capacité, plafond du jour, verrou de paire, compte en suppression.
      update public.event_attendees set rsvp = 'going'
        where event_id = p_event_id and user_id = cible and rsvp = 'waitlist';
      get diagnostics nb = row_count;
    exception when others then
      raise warning 'promouvoir_file(%) : % sautée (%)', p_event_id, left(cible, 8), left(sqlerrm, 80);
      nb := 0;
    end;
    continue when nb = 0;
    promus := promus + 1;
    -- Même identifiant que `promouvoir_attente` (rejeu sans doublon, et le
    -- client le reconnaît) ; texte JUSTE : la personne promue reste à valider.
    precedent := current_setting('passio.notification_serveur', true);
    perform set_config('passio.notification_serveur', '1', true);
    begin
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values ('n_pa_' || left(p_event_id, 12) || '_' || left(cible, 8), cible, 'event_update', ev.author_id, p_event_id,
              'Une place s''est libérée pour « ' || public.passio_echapper_html(left(coalesce(ev.title, 'une activité'), 60))
              || ' ». L’organisation doit valider ta participation pour la confirmer.',
              false, now())
      on conflict (id) do update set content = excluded.content, seen = false, created_at = now()
        where public.notifications.user_id = excluded.user_id and public.notifications.kind = 'event_update';
      if not found then
        insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
        values ('n_pa_' || left(md5(p_event_id || '|' || cible || '|' || clock_timestamp()::text), 20), cible, 'event_update',
                ev.author_id, p_event_id,
                'Une place s''est libérée pour « ' || public.passio_echapper_html(left(coalesce(ev.title, 'une activité'), 60))
                || ' ». L’organisation doit valider ta participation pour la confirmer.',
                false, now());
      end if;
    exception when others then
      raise warning 'promouvoir_file : notification non écrite (%) — la promotion est conservée', sqlerrm;
    end;
    perform set_config('passio.notification_serveur', coalesce(precedent, ''), true);
  end loop;
  return promus;
end
$$;
revoke all on function rencontres_prive.promouvoir_file(text) from public, anon, authenticated;

create or replace function rencontres_prive.place_liberee()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (old.rsvp is distinct from 'going' or new.rsvp = 'going') then return null; end if;
  if tg_op = 'DELETE' and old.rsvp is distinct from 'going' then return null; end if;
  -- Une promotion qui échoue ne défait JAMAIS le départ qui l'a provoquée.
  begin
    perform rencontres_prive.promouvoir_file(old.event_id);
  exception when others then
    raise warning 'place_liberee(%) : promotion sautée (%)', old.event_id, left(sqlerrm, 80);
  end;
  return null;
end
$$;
revoke all on function rencontres_prive.place_liberee() from public, anon, authenticated;

drop trigger if exists zz_rencontres_place_liberee on public.event_attendees;
create trigger zz_rencontres_place_liberee
  after delete or update of rsvp on public.event_attendees
  for each row execute function rencontres_prive.place_liberee();

create or replace function rencontres_prive.places_ajoutees()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.max_attendees is null or old.max_attendees is null or new.max_attendees <= old.max_attendees then
    return null;
  end if;
  begin
    perform rencontres_prive.promouvoir_file(new.id);
  exception when others then
    raise warning 'places_ajoutees(%) : promotion sautée (%)', new.id, left(sqlerrm, 80);
  end;
  return null;
end
$$;
revoke all on function rencontres_prive.places_ajoutees() from public, anon, authenticated;

drop trigger if exists zz_rencontres_places_ajoutees on public.events;
create trigger zz_rencontres_places_ajoutees
  after update of max_attendees on public.events
  for each row execute function rencontres_prive.places_ajoutees();

-- ── ⑤ (bis) OUVRIR LA DISCUSSION Y FAIT ENTRER LES PERSONNES DÉJÀ VALIDÉES ──
create or replace function rencontres_prive.discussion_ouverte()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  qui text;
begin
  if new.conv_id is null or new.conv_id is not distinct from old.conv_id then return null; end if;
  if not exists (select 1 from public.conversations c where c.id = new.conv_id) then return null; end if;
  for qui in select v.user_id from rencontres_prive.accords v
               join public.event_attendees a using (event_id, user_id)
              where v.event_id = new.id and a.rsvp = 'going' loop
    begin
      insert into public.conv_members (conv_id, user_id) values (new.conv_id, qui) on conflict do nothing;
    exception when others then
      raise warning 'discussion_ouverte(%) : % non ajouté·e (%)', new.id, left(qui, 8), left(sqlerrm, 80);
    end;
  end loop;
  return null;
end
$$;
revoke all on function rencontres_prive.discussion_ouverte() from public, anon, authenticated;

drop trigger if exists zz_rencontres_discussion_ouverte on public.events;
create trigger zz_rencontres_discussion_ouverte
  after update of conv_id on public.events
  for each row execute function rencontres_prive.discussion_ouverte();

-- ── ②⑤ VALIDER / RETIRER : la discussion à l'acceptation, l'avis au retrait ─
create or replace function public.valider_participant(p_event_id text, p_user_id text, p_accepter boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  reponse   text;
  valide    boolean;
  retire    boolean;
  precedent text;
begin
 if auth.uid() is null or public.suppression_de_mon_compte() or not public.organise_activite(p_event_id) then
   raise exception 'organisation_requise' using errcode = '42501';
 end if;
 -- Même ordre que l'UPDATE RSVP et sa capacité : inscription, paire, activité.
 select rsvp into reponse from public.event_attendees where event_id = p_event_id and user_id = p_user_id for update;
 if not found then return false; end if;
 perform rencontres_prive.verrou_paire(p_user_id, personne)
   from public.events e cross join lateral
     (select e.author_id as personne union select e.organizer_id) o
   where e.id = p_event_id and personne is not null order by personne;
 perform 1 from public.events where id = p_event_id and status = 'active' for update;
 if not found then return false; end if;
 if p_accepter then
   if rencontres_prive.bloque(p_event_id,p_user_id) then raise exception 'organisateur_bloque' using errcode = '42501'; end if;
   perform 1 from public.event_attendees where event_id = p_event_id and user_id = p_user_id and rsvp = 'going' for update;
   if not found then return false; end if;
   insert into rencontres_prive.accords values(p_event_id,p_user_id) on conflict do nothing;
   if found then
     insert into rencontres_prive.decisions(event_id,user_id,decideur_id,accepter)
       values(p_event_id,p_user_id,auth.uid()::text,true);
   end if;
   -- ⑤ La discussion de l'activité, si elle existe, sans attendre que la
   -- personne ouvre l'app. Un refus d'une garde n'empêche pas la validation.
   begin
     insert into public.conv_members (conv_id, user_id)
       select e.conv_id, p_user_id from public.events e
        where e.id = p_event_id and e.conv_id is not null
          and exists (select 1 from public.conversations c where c.id = e.conv_id)
     on conflict do nothing;
   exception when others then
     raise warning 'valider_participant : discussion non rejointe (%)', left(sqlerrm, 80);
   end;
 else
   if exists(select 1 from public.events where id = p_event_id and p_user_id in(author_id,organizer_id)) then
     raise exception 'organisateur_non_retirable' using errcode = '42501';
   end if;
   valide := exists(select 1 from rencontres_prive.accords where event_id = p_event_id and user_id = p_user_id);
   insert into rencontres_prive.decisions(event_id,user_id,decideur_id,accepter)
     values(p_event_id,p_user_id,auth.uid()::text,false);
   delete from rencontres_prive.accords where event_id = p_event_id and user_id = p_user_id;
   delete from public.conv_members where conv_id = 'evgrp_' || p_event_id and user_id = p_user_id;
   delete from public.event_attendees where event_id = p_event_id and user_id = p_user_id;
   retire := found;
   -- ② Une demande EN ATTENTE est déjà annoncée par `signaler_refus_demande`.
   -- Tout autre retrait (participation validée, « peut-être », liste d'attente)
   -- l'est ici ; « je ne peux pas » part en silence. Aucun contenu libre.
   if retire and reponse is distinct from 'declined' and (valide or reponse is distinct from 'going')
      and not rencontres_prive.bloque(p_event_id, p_user_id)
      and not exists (select 1 from public.blocks b where (b.blocker_id, b.blocked_id)
                      in ((p_user_id, auth.uid()::text), (auth.uid()::text, p_user_id))) then
     precedent := current_setting('passio.notification_serveur', true);
     perform set_config('passio.notification_serveur', '1', true);
     begin
       insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
       select 'n_pi_retrait_' || gen_random_uuid()::text, p_user_id, 'event_update', auth.uid()::text, e.id,
              'Ta participation à « ' || public.passio_echapper_html(left(coalesce(e.title, 'cette sortie'), 80))
              || ' » a été retirée par l’organisation.', false
       from public.events e where e.id = p_event_id;
     exception when others then
       raise warning 'valider_participant : avis de retrait non écrit (%)', left(sqlerrm, 80);
     end;
     perform set_config('passio.notification_serveur', coalesce(precedent, ''), true);
   end if;
   return retire;
 end if;
 return true;
end $$;

create or replace function public.retirer_invite_activite(p_event_id text, p_user_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  e record;
  reponse text;
  precedent text;
begin
  if auth.uid() is null or p_event_id is null or p_user_id is null
     or not public.organise_activite(p_event_id) then
    return false;
  end if;
  select author_id, organizer_id, co_organizers, visibilite into e from public.events where id = p_event_id;
  if not found or e.visibilite is distinct from 'privee' then return false; end if;
  -- Jamais un membre de l'organisation (ni soi-même).
  if p_user_id = e.author_id or p_user_id = e.organizer_id
     or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array' and e.co_organizers ? p_user_id) then
    return false;
  end if;
  select rsvp into reponse from public.event_attendees where event_id = p_event_id and user_id = p_user_id;
  delete from public.event_invites where event_id = p_event_id and user_id = p_user_id;
  delete from public.event_attendees where event_id = p_event_id and user_id = p_user_id;
  delete from public.conv_members where conv_id = 'evgrp_' || p_event_id and user_id = p_user_id;
  -- Le titre ne reste pas chez la personne retirée.
  delete from public.notifications where user_id = p_user_id and kind = 'event_invite' and ref_id = p_event_id;
  -- Le lien d'invitation ne le fera pas revenir (profil requis par la clé étrangère).
  if exists (select 1 from public.profiles where id = p_user_id) then
    insert into public.event_invites_retires (event_id, user_id) values (p_event_id, p_user_id)
      on conflict (event_id, user_id) do update set retire_le = now();
  end if;
  -- ② Qui avait répondu (hors « je ne peux pas ») est prévenu — SANS le titre.
  if reponse is not null and reponse is distinct from 'declined' then
    precedent := current_setting('passio.notification_serveur', true);
    perform set_config('passio.notification_serveur', '1', true);
    begin
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
      values ('n_pi_retrait_' || gen_random_uuid()::text, p_user_id, 'event_update', auth.uid()::text, p_event_id,
              'Tu ne fais plus partie d’une activité privée : l’organisation t’en a retiré·e.', false);
    exception when others then
      raise warning 'retirer_invite_activite : avis de retrait non écrit (%)', left(sqlerrm, 80);
    end;
    perform set_config('passio.notification_serveur', coalesce(precedent, ''), true);
  end if;
  return true;
end
$$;

-- ── ④ POINTAGE : l'organisation, ou un « going » validé ; le code garde son contrat ─
create or replace function public.event_attendees_pointage_garde()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  if auth.uid() is null then return new; end if;
  -- Un pointage posé ne se réécrit pas (la valeur était libre et réécrivable).
  if tg_op = 'UPDATE' and old.checked_in_at is not null then
    new.checked_in_at := old.checked_in_at;
    return new;
  end if;
  if new.checked_in_at is null then return new; end if;
  select status, date_at, end_at, author_id, organizer_id into ev from public.events where id = new.event_id;
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'pointage_annulee' using errcode = 'P0001';
  end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then
    raise exception 'pointage_hors_fenetre' using errcode = 'P0001';
  end if;
  -- Qui peut pointer : l'organisation ; une participation VALIDÉE ; et, par le
  -- seul chemin du code d'accueil (`pointer_par_code`, qui a déjà refusé
  -- liste d'attente et « je ne peux pas »), un « going » ou un « peut-être ».
  if not (
       new.user_id is not distinct from ev.author_id or new.user_id is not distinct from ev.organizer_id
       or (new.rsvp = 'going' and exists (select 1 from rencontres_prive.accords v
                                           where v.event_id = new.event_id and v.user_id = new.user_id))
       or (current_setting('passio.pointage_par_code', true) = '1' and new.rsvp in ('going', 'maybe'))
     ) then
    raise exception 'pointage_non_valide' using errcode = 'P0001';
  end if;
  -- L'heure du serveur fait foi (UTC, comme l'écrit le client).
  new.checked_in_at := now() at time zone 'UTC';
  return new;
end
$$;

create or replace function public.pointer_par_code(p_event_id text, p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  moi text := (auth.uid())::text;
  ev record;
  secret_att text;
  ligne record;
  n integer;
begin
  if auth.uid() is null then return 'non_connecte'; end if;
  select id, status, date_at, end_at into ev from public.events where id = p_event_id;
  if not found then return 'introuvable'; end if;
  insert into public.pointage_essais as e (event_id, user_id, essais) values (p_event_id, moi, 1)
  on conflict (event_id, user_id) do update
    set essais = case when e.fenetre < now() - interval '10 minutes' then 1 else e.essais + 1 end,
        fenetre = case when e.fenetre < now() - interval '10 minutes' then now() else e.fenetre end
  returning essais into n;
  if n > 10 then return 'trop_d_essais'; end if;
  select secret into secret_att from public.event_checkin_secrets where event_id = p_event_id;
  if secret_att is null or upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')) <> secret_att then return 'code_incorrect'; end if;
  if ev.status = 'cancelled' then return 'annulee'; end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then return 'hors_fenetre'; end if;
  select rsvp, checked_in_at into ligne from public.event_attendees where event_id = p_event_id and user_id = moi;
  if not found then return 'non_inscrit'; end if;
  if ligne.checked_in_at is not null then return 'deja_pointe'; end if;
  if ligne.rsvp = 'waitlist' or ligne.rsvp = 'declined' then return 'liste_attente'; end if;
  -- Le code remis sur place est la preuve : la garde de pointage le reconnaît
  -- par ce réglage, posé autour de CETTE écriture seulement.
  perform set_config('passio.pointage_par_code', '1', true);
  update public.event_attendees set checked_in_at = now() where event_id = p_event_id and user_id = moi;
  perform set_config('passio.pointage_par_code', '', true);
  if ligne.rsvp = 'maybe' then
    -- Un « peut-être » présent devient inscrit si une place reste (le trigger de
    -- capacité tranche) ; sinon il reste pointé en « peut-être ».
    begin
      update public.event_attendees set rsvp = 'going' where event_id = p_event_id and user_id = moi;
    exception when others then null;
    end;
  end if;
  return 'ok';
end
$$;

-- ── ③ NOTE ET AVIS : après la fin, et seulement pour qui a participé ────────
create or replace function public.event_attendees_note_garde()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  if auth.uid() is null then return new; end if;
  -- Effacer sa note, ou ne pas y toucher, passe toujours.
  if new.rating is null and new.feedback is null then return new; end if;
  if tg_op = 'UPDATE' and new.rating is not distinct from old.rating
     and new.feedback is not distinct from old.feedback
     and new.rated_at is not distinct from old.rated_at then
    return new;
  end if;
  select status, date_at, end_at, author_id, organizer_id into ev from public.events where id = new.event_id;
  if not found then return new; end if;   -- la clé étrangère tranche
  if ev.status = 'cancelled' or coalesce(ev.end_at, ev.date_at + interval '3 hours') is null
     or coalesce(ev.end_at, ev.date_at + interval '3 hours') >= now() then
    raise exception 'note_avant_fin' using errcode = 'P0001';
  end if;
  if new.user_id is not distinct from ev.author_id or new.user_id is not distinct from ev.organizer_id
     or not (new.checked_in_at is not null
             or (new.rsvp = 'going' and exists (select 1 from rencontres_prive.accords v
                                                 where v.event_id = new.event_id and v.user_id = new.user_id))) then
    raise exception 'note_sans_participation' using errcode = 'P0001';
  end if;
  new.rated_at := now();
  return new;
end
$$;
revoke all on function public.event_attendees_note_garde() from public, anon, authenticated;

drop trigger if exists trg_event_attendees_note on public.event_attendees;
create trigger trg_event_attendees_note
  before insert or update on public.event_attendees
  for each row execute function public.event_attendees_note_garde();

-- ── ⑥ COUVERTURE : le Storage du projet, ou le relais de l'app ──────────────
do $couverture$
declare
  hors integer;
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_cover_url_hote') then
    return;
  end if;
  select count(*) into hors from public.events
   where cover_url is not null
     and cover_url !~ '^https://((njkiyoklssvefstljemx|fcksxofaelcdmmifnwjo)\.supabase\.co/storage/v1/(object|render/image)/public/|passio-app\.netlify\.app/media/)';
  if hors = 0 then
    alter table public.events add constraint events_cover_url_hote check (
      cover_url is null
      or cover_url ~ '^https://((njkiyoklssvefstljemx|fcksxofaelcdmmifnwjo)\.supabase\.co/storage/v1/(object|render/image)/public/|passio-app\.netlify\.app/media/)');
  else
    alter table public.events add constraint events_cover_url_hote check (
      cover_url is null
      or cover_url ~ '^https://((njkiyoklssvefstljemx|fcksxofaelcdmmifnwjo)\.supabase\.co/storage/v1/(object|render/image)/public/|passio-app\.netlify\.app/media/)')
      not valid;
    raise notice 'events_cover_url_hote posée NOT VALID : % couverture(s) existante(s) hors hôte', hors;
  end if;
end
$couverture$;

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_rencontrer_serveur on commit drop as
select * from (values
  (1, 'promotion par la base : déclencheur de sortie de « going » sur event_attendees',
     exists (select 1 from pg_trigger t where t.tgrelid = 'public.event_attendees'::regclass
              and t.tgname = 'zz_rencontres_place_liberee' and t.tgenabled = 'O'
              and t.tgfoid = 'rencontres_prive.place_liberee()'::regprocedure)),
  (2, 'promotion par la base : hausse de max_attendees, et discussion ouverte aux validés',
     (select count(*) from pg_trigger t where t.tgrelid = 'public.events'::regclass and t.tgenabled = 'O'
       and t.tgname in ('zz_rencontres_places_ajoutees', 'zz_rencontres_discussion_ouverte')) = 2),
  (3, 'fonctions de la file : SECURITY DEFINER, search_path figé, sans EXECUTE client',
     (select count(*) from pg_proc p where p.oid in ('rencontres_prive.promouvoir_file(text)'::regprocedure,
        'rencontres_prive.place_liberee()'::regprocedure, 'rencontres_prive.places_ajoutees()'::regprocedure,
        'rencontres_prive.discussion_ouverte()'::regprocedure)
        and p.prosecdef and p.proconfig @> array['search_path=""']) = 4
     and not has_function_privilege('authenticated', 'rencontres_prive.promouvoir_file(text)', 'execute')
     and not has_function_privilege('anon', 'rencontres_prive.promouvoir_file(text)', 'execute')),
  (4, 'valider_participant : discussion à l''acceptation, avis de retrait, toujours sans anon',
     pg_get_functiondef('public.valider_participant(text,text,boolean)'::regprocedure) like '%insert into public.conv_members%'
     and pg_get_functiondef('public.valider_participant(text,text,boolean)'::regprocedure) like '%n_pi_retrait_%'
     and exists (select 1 from pg_proc where oid = 'public.valider_participant(text,text,boolean)'::regprocedure
                  and prosecdef and proconfig @> array['search_path=""'])
     and not has_function_privilege('anon', 'public.valider_participant(text,text,boolean)', 'execute')),
  (5, 'retirer_invite_activite : avis de retrait sans titre, toujours sans anon',
     pg_get_functiondef('public.retirer_invite_activite(text,text)'::regprocedure) like '%n_pi_retrait_%'
     and pg_get_functiondef('public.retirer_invite_activite(text,text)'::regprocedure) like '%event_invites_retires%'
     and not has_function_privilege('anon', 'public.retirer_invite_activite(text,text)', 'execute')),
  (6, 'pointage : participation validée exigée, code d''accueil reconnu, heure du serveur',
     pg_get_functiondef('public.event_attendees_pointage_garde()'::regprocedure) like '%pointage_non_valide%'
     and pg_get_functiondef('public.pointer_par_code(text,text)'::regprocedure) like '%passio.pointage_par_code%'
     and exists (select 1 from pg_trigger t where t.tgrelid = 'public.event_attendees'::regclass
                  and t.tgname = 'trg_event_attendees_pointage' and t.tgenabled = 'O')
     and not has_function_privilege('anon', 'public.pointer_par_code(text,text)', 'execute')),
  (7, 'note et avis : après la fin, pour qui a participé (déclencheur BEFORE INSERT OR UPDATE)',
     exists (select 1 from pg_trigger t where t.tgrelid = 'public.event_attendees'::regclass
              and t.tgname = 'trg_event_attendees_note' and t.tgenabled = 'O'
              and t.tgfoid = 'public.event_attendees_note_garde()'::regprocedure
              and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16)),
  (8, 'les quatre définitions remplacées : SECURITY DEFINER, search_path figé',
     (select count(*) from pg_proc p where p.oid in ('public.valider_participant(text,text,boolean)'::regprocedure,
        'public.pointer_par_code(text,text)'::regprocedure, 'public.event_attendees_pointage_garde()'::regprocedure,
        'public.retirer_invite_activite(text,text)'::regprocedure)
        and p.prosecdef and p.proconfig @> array['search_path=""']) = 4)
) as v(n, controle, ok_bool);

alter table _verdict_rencontrer_serveur add column verdict text;
update _verdict_rencontrer_serveur set verdict = case when ok_bool then 'OK' else 'ECHEC' end;

-- ⑥ : la contrainte existe ; « not valid » se DIT dans la valeur, sans être un échec.
insert into _verdict_rencontrer_serveur (n, controle, ok_bool, verdict)
select 9, 'couverture d''activité : Storage du projet ou relais de l''app seulement (events_cover_url_hote)',
       c.conname is not null,
       case when c.conname is null then 'ECHEC'
            when c.convalidated then 'OK'
            else 'OK (not valid : ' || (select count(*) from public.events
                   where cover_url is not null
                     and cover_url !~ '^https://((njkiyoklssvefstljemx|fcksxofaelcdmmifnwjo)\.supabase\.co/storage/v1/(object|render/image)/public/|passio-app\.netlify\.app/media/)')::text
                 || ' ligne(s) existante(s) hors hôte)' end
from (select 1) x
left join pg_constraint c on c.conrelid = 'public.events'::regclass and c.conname = 'events_cover_url_hote';

select n, controle, verdict from _verdict_rencontrer_serveur order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_rencontrer_serveur where verdict like 'ECHEC%') then
    raise exception 'rencontrer_serveur : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_rencontrer_serveur where verdict like 'ECHEC%');
  end if;
end
$verdict$;

commit;
