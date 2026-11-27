-- ═══════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE de `migration_rencontrer_serveur_2026-11-27.sql`
--
-- `npm run migration:appliquer -- migrations/migration_rencontrer_serveur_retour_2026-11-27.sql --projet <ref>`
-- UNE transaction, REJOUABLE. Remet, OCTET POUR OCTET, les quatre définitions
-- de PRODUCTION relues au catalogue le 2026-11-27 (empreintes vérifiées au
-- verdict), retire les quatre déclencheurs et les quatre fonctions ajoutés, et
-- la contrainte `events_cover_url_hote`.
--
-- ⚠️ CE RETOUR RECRÉE LES SIX DÉFAUTS : la file ne se promeut plus côté serveur,
-- un retrait n'est plus annoncé, une note et un pointage s'écrivent de nouveau
-- sans participation, un participant validé n'entre plus dans la discussion
-- tant qu'il n'ouvre pas l'app, une couverture d'activité peut de nouveau
-- venir de n'importe quel hôte https. Ce qu'il NE défait PAS : les promotions,
-- avis, entrées de discussion déjà écrits (des lignes, pas de la structure).
--
-- Garde : une définition qui n'est ni celle de la migration, ni celle de la
-- production d'avant, arrête tout (quelqu'un l'a changée entre-temps).
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $garde$
declare
  r record;
  emp text;
begin
  for r in select * from (values
    ('public.valider_participant(text,text,boolean)', 'e7ca3212181f3daffb584582fb343d85', '6e3088fa44521cdc3ecb55c52d0eb941'),
    ('public.pointer_par_code(text,text)', '6f85eba6af8165ec1aba8da2ff4d0ee0', '72ea92116cb82459f14f30d27723b06f'),
    ('public.event_attendees_pointage_garde()', '82f0ddfb437c732aa9527d6c56511ef8', 'c514ea3778e55c670c2f886dac73f976'),
    ('public.retirer_invite_activite(text,text)', '95b00925397b8d0cf8c040a51e172179', '20bb9d048a0d5d9bd4c2cbda48663f38')
  ) as v(sig, avant, migration) loop
    if to_regprocedure(r.sig) is null then
      raise exception 'retour rencontrer_serveur : % absente', r.sig;
    end if;
    select md5(replace(p.prosrc, chr(13), '')) into emp from pg_proc p where p.oid = to_regprocedure(r.sig);
    if emp is distinct from r.avant and emp is distinct from r.migration then
      raise exception 'retour rencontrer_serveur : % n''est ni la version de la migration ni celle d''avant (md5 %) — rien n''est retiré', r.sig, emp;
    end if;
  end loop;
end
$garde$;

drop trigger if exists zz_rencontres_place_liberee on public.event_attendees;
drop trigger if exists trg_event_attendees_note on public.event_attendees;
drop trigger if exists zz_rencontres_places_ajoutees on public.events;
drop trigger if exists zz_rencontres_discussion_ouverte on public.events;
drop function if exists rencontres_prive.place_liberee();
drop function if exists rencontres_prive.places_ajoutees();
drop function if exists rencontres_prive.discussion_ouverte();
drop function if exists rencontres_prive.promouvoir_file(text);
drop function if exists public.event_attendees_note_garde();
alter table public.events drop constraint if exists events_cover_url_hote;

-- Définitions de PRODUCTION du 2026-11-27, à l'identique.
create or replace function public.valider_participant(p_event_id text, p_user_id text, p_accepter boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null or public.suppression_de_mon_compte() or not public.organise_activite(p_event_id) then
   raise exception 'organisation_requise' using errcode = '42501';
 end if;
 -- Même ordre que l'UPDATE RSVP et sa capacité : inscription, paire, activité.
 perform 1 from public.event_attendees where event_id = p_event_id and user_id = p_user_id for update;
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
 else
   if exists(select 1 from public.events where id = p_event_id and p_user_id in(author_id,organizer_id)) then
     raise exception 'organisateur_non_retirable' using errcode = '42501';
   end if;
   insert into rencontres_prive.decisions(event_id,user_id,decideur_id,accepter)
     values(p_event_id,p_user_id,auth.uid()::text,false);
   delete from rencontres_prive.accords where event_id = p_event_id and user_id = p_user_id;
   delete from public.conv_members where conv_id = 'evgrp_' || p_event_id and user_id = p_user_id;
   delete from public.event_attendees where event_id = p_event_id and user_id = p_user_id;
   return found;
 end if;
 return true;
end $$;

create or replace function public.retirer_invite_activite(p_event_id text, p_user_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  e record;
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
  return true;
end
$$;

create or replace function public.event_attendees_pointage_garde()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  if auth.uid() is null then return new; end if;
  if new.checked_in_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.checked_in_at is not null then return new; end if;
  select status, date_at, end_at into ev from public.events where id = new.event_id;
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'pointage_annulee' using errcode = 'P0001';
  end if;
  if now() < ev.date_at - interval '1 hour' or now() > coalesce(ev.end_at, ev.date_at + interval '3 hours') then
    raise exception 'pointage_hors_fenetre' using errcode = 'P0001';
  end if;
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
  update public.event_attendees set checked_in_at = now() where event_id = p_event_id and user_id = moi;
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

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_rencontrer_serveur_retour on commit drop as
select * from (values
  (1, 'les quatre définitions sont celles de la production d''avant (empreintes)',
     (select count(*) from pg_proc p where (p.oid, md5(replace(p.prosrc, chr(13), ''))) in (
        ('public.valider_participant(text,text,boolean)'::regprocedure::oid, 'e7ca3212181f3daffb584582fb343d85'),
        ('public.pointer_par_code(text,text)'::regprocedure::oid, '6f85eba6af8165ec1aba8da2ff4d0ee0'),
        ('public.event_attendees_pointage_garde()'::regprocedure::oid, '82f0ddfb437c732aa9527d6c56511ef8'),
        ('public.retirer_invite_activite(text,text)'::regprocedure::oid, '95b00925397b8d0cf8c040a51e172179'))) = 4),
  (2, 'déclencheurs et fonctions ajoutés retirés',
     not exists (select 1 from pg_trigger where tgname in ('zz_rencontres_place_liberee', 'trg_event_attendees_note',
                   'zz_rencontres_places_ajoutees', 'zz_rencontres_discussion_ouverte'))
     and to_regprocedure('rencontres_prive.promouvoir_file(text)') is null
     and to_regprocedure('public.event_attendees_note_garde()') is null),
  (3, 'contrainte events_cover_url_hote retirée',
     not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_cover_url_hote'))
) as v(n, controle, ok_bool);

alter table _verdict_rencontrer_serveur_retour add column verdict text;
update _verdict_rencontrer_serveur_retour set verdict = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, verdict from _verdict_rencontrer_serveur_retour order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_rencontrer_serveur_retour where verdict <> 'OK') then
    raise exception 'retour rencontrer_serveur : verdict en ECHEC — rien n''est validé';
  end if;
end
$verdict$;

commit;
