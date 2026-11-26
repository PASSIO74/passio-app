-- L'accord, la décision et la notification sont validés ensemble.
-- Repli : retirer le trigger confirmation_membre sur rencontres_prive.decisions.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function rencontres_prive.notifier_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare
  origine_precedente text := current_setting('passio.notification_serveur', true);
begin
  perform set_config('passio.notification_serveur', '1', true);
  insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
  select 'n_pi_confirmation_' || new.id, new.user_id, 'event_accepted', new.decideur_id, e.id,
         'Ta participation à « ' || public.passio_echapper_html(left(coalesce(e.title,'cette sortie'), 80)) || ' » est confirmée.', false
  from public.events e where e.id = new.event_id;
  perform set_config('passio.notification_serveur', coalesce(origine_precedente, ''), true);
  return new;
end $f$;
revoke all on function rencontres_prive.notifier_confirmation() from public, anon, authenticated, service_role;
drop trigger if exists confirmation_membre on rencontres_prive.decisions;
create trigger confirmation_membre after insert on rencontres_prive.decisions
for each row when (new.accepter and new.decideur_id <> new.user_id)
execute function rencontres_prive.notifier_confirmation();

alter table public.notifications add column if not exists confirmation_essai_apres timestamptz;
create index if not exists notifications_confirmations_en_attente
on public.notifications (confirmation_essai_apres nulls first, created_at, id)
where kind = 'event_accepted' and origine = 'serveur' and push_le is null;

-- La même file sert au signal immédiat et au rattrapage de la veille. Un ancien accord
-- révoqué ne redevient pas livrable quand une nouvelle inscription est validée.
create or replace function public.confirmations_a_pousser(p_sortie text, p_emetteur text, p_membre text)
returns table(id text, event_id text, emetteur text, membre text)
language sql volatile security definer set search_path = '' as $f$
  with prochaines as (
  select n.id
  from public.notifications n
  join public.events e on e.id = n.ref_id and e.status = 'active' and e.date_at > now()
  join rencontres_prive.accords a on a.event_id = e.id and a.user_id = n.user_id
  where n.kind = 'event_accepted' and n.origine = 'serveur' and n.push_le is null
    and n.created_at >= now() - interval '1 day'
    and (n.confirmation_essai_apres is null or n.confirmation_essai_apres <= now())
    and n.id = (select 'n_pi_confirmation_' || d.id from rencontres_prive.decisions d
                where d.event_id = e.id and d.user_id = n.user_id and d.accepter
                order by d.created_at desc, d.id desc limit 1)
    and (p_sortie is null or n.ref_id = p_sortie)
    and (p_emetteur is null or n.from_id = p_emetteur)
    and (p_membre is null or n.user_id = p_membre)
    and not rencontres_prive.bloque(e.id, n.user_id)
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id,b.blocked_id) in ((n.from_id,n.user_id),(n.user_id,n.from_id)))
    and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
  order by n.confirmation_essai_apres nulls first, n.created_at, n.id
  limit 20 for update of n skip locked
  )
  update public.notifications n set confirmation_essai_apres = now() + interval '5 minutes'
  from prochaines p where n.id = p.id
  returning n.id, n.ref_id, n.from_id, n.user_id
$f$;
revoke all on function public.confirmations_a_pousser(text,text,text) from public, anon, authenticated;
grant execute on function public.confirmations_a_pousser(text,text,text) to service_role;
do $controle$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'rencontres_prive.decisions'::regclass
                 and tgname = 'confirmation_membre' and tgenabled = 'O')
     or not public.genres_reserves_au_serveur('event_accepted')
     or not public.identifiant_reserve_au_serveur('n_pi_confirmation_test')
     or has_function_privilege('authenticated','public.confirmations_a_pousser(text,text,text)','execute')
     or has_function_privilege('anon','public.confirmations_a_pousser(text,text,text)','execute')
  then raise exception 'Préconditions de la confirmation non satisfaites'; end if;
end $controle$;
select 'confirmation à la validation' as controle, 'OK' as valeur;
commit;
