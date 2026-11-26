-- Un refus de demande est distinct du retrait d'un participant déjà confirmé.
-- Repli : désactiver refus_demande_membre pour arrêter les nouveaux avis.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table rencontres_prive.decisions
  add column if not exists refus_en_cours boolean not null default false;

create or replace function rencontres_prive.signaler_refus_demande()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare
  precedent text := current_setting('passio.notification_serveur', true);
begin
  -- valider_participant a verrouillé la ligne et n'a pas encore retiré l'accord.
  if new.user_id = new.decideur_id
     or not exists (select 1 from public.event_attendees a where a.event_id = new.event_id
                    and a.user_id = new.user_id and a.rsvp = 'going')
     or exists (select 1 from rencontres_prive.accords v where v.event_id = new.event_id and v.user_id = new.user_id)
     or rencontres_prive.bloque(new.event_id, new.user_id)
     or exists (select 1 from public.blocks b where (b.blocker_id,b.blocked_id)
                in ((new.user_id,new.decideur_id),(new.decideur_id,new.user_id))) then
    return new;
  end if;
  new.refus_en_cours := true;
  perform set_config('passio.notification_serveur','1',true);
  insert into public.notifications(id,user_id,kind,from_id,ref_id,content,seen)
  select 'n_pi_refus_' || new.id, new.user_id, 'event_update', new.decideur_id, e.id,
         'Ta demande de participation à « ' || public.passio_echapper_html(left(coalesce(e.title,'cette sortie'),80))
         || ' » n’a pas été acceptée.', false
  from public.events e where e.id = new.event_id;
  perform set_config('passio.notification_serveur',coalesce(precedent,''),true);
  return new;
end $f$;
revoke all on function rencontres_prive.signaler_refus_demande() from public, anon, authenticated, service_role;
drop trigger if exists refus_demande_membre on rencontres_prive.decisions;
create trigger refus_demande_membre before insert on rencontres_prive.decisions
for each row when (not new.accepter) execute function rencontres_prive.signaler_refus_demande();

create index if not exists decisions_refus_demande_membre
  on rencontres_prive.decisions(user_id,event_id) where refus_en_cours;

-- La réinscription clôt le refus, même après un retrait volontaire ou la purge
-- du journal des inscriptions. L'avis historique demeure dans la cloche.
create or replace function rencontres_prive.clore_refus_demande()
returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  update rencontres_prive.decisions set refus_en_cours = false
    where event_id = new.event_id and user_id = new.user_id and refus_en_cours;
  return null;
end $f$;
revoke all on function rencontres_prive.clore_refus_demande() from public, anon, authenticated, service_role;
drop trigger if exists clore_refus_demande on rencontres_prive.inscriptions;
create trigger clore_refus_demande after insert on rencontres_prive.inscriptions
for each row when (new.rsvp is not null) execute function rencontres_prive.clore_refus_demande();

create or replace function public.mon_refus_demande_sortie(p_event_id text)
returns boolean language sql stable security definer set search_path = '' as $f$
  select exists (
    select 1 from rencontres_prive.decisions d
    where d.user_id = (select auth.uid())::text and d.event_id = p_event_id and d.refus_en_cours
  )
$f$;
revoke all on function public.mon_refus_demande_sortie(text) from public, anon, service_role;
grant execute on function public.mon_refus_demande_sortie(text) to authenticated;

do $controle$
begin
  if not public.identifiant_reserve_au_serveur('n_pi_refus_test')
     or has_function_privilege('anon','public.mon_refus_demande_sortie(text)','execute')
     or not has_function_privilege('authenticated','public.mon_refus_demande_sortie(text)','execute')
     or not exists (select 1 from pg_trigger where tgrelid = 'rencontres_prive.decisions'::regclass
                    and tgname = 'refus_demande_membre' and tgenabled = 'O')
  then raise exception 'Préconditions du refus de demande non satisfaites'; end if;
end $controle$;
select 'refus de demande individuel' as controle, 'OK' as valeur;
commit;
