-- ═══════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE de `migration_rencontrer_activites_2026-11-28.sql`
--
-- `npm run migration:appliquer -- migrations/migration_rencontrer_activites_retour_2026-11-28.sql --projet <ref>`
-- UNE transaction, REJOUABLE. Remet, OCTET POUR OCTET, les trois définitions
-- de PRODUCTION relues au catalogue le 2026-11-28 (empreintes vérifiées au
-- verdict), et retire les trois fonctions ajoutées (`amis_qui_y_vont`,
-- `etat_redemande_sortie`, `rencontres_prive.redemande_permise`).
--
-- ⚠️ CE RETOUR RECRÉE LES DÉFAUTS : une activité supprimée laisse de nouveau sa
-- carte du fil, les liens `posts.event_id` et une discussion `evgrp_` sans
-- `conv_id` ; un avis aux inscrits manqué redevient muet ; une demande refusée
-- se renvoie de nouveau sans limite (une notification à l'organisation à
-- chaque fois) ; « X et Y y vont » s'éteint pour qui n'est pas inscrit. Le
-- client en ligne tient sans les deux RPC (PGRST202 : il retombe sur son
-- comportement d'avant). Ce qu'il NE défait PAS : les cartes, liens et
-- discussions déjà purgés (des lignes, pas de la structure).
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
    ('rencontres_prive.activite_supprimee()', '37d2060f3814d51e3259ad7d27c0d936', 'bcb6f58e97b241104cd5be00055d5946'),
    ('public.events_prevenir_suppression()', '8eb718235eb04b2de4190245d6c4f42c', 'e0d2d69b70b8a54317e08d2b8b453710'),
    ('rencontres_prive.inscription_gardee()', '2264a362f103da28aa9a7da56523a76b', 'e16353adf84bfd2042041c6bcab5bd57')
  ) as v(sig, avant, migration) loop
    if to_regprocedure(r.sig) is null then
      raise exception 'retour rencontrer_activites : % absente', r.sig;
    end if;
    select md5(replace(p.prosrc, chr(13), '')) into emp from pg_proc p where p.oid = to_regprocedure(r.sig);
    if emp is distinct from r.avant and emp is distinct from r.migration then
      raise exception 'retour rencontrer_activites : % n''est ni la version de la migration ni celle d''avant (md5 %) — rien n''est retiré', r.sig, emp;
    end if;
  end loop;
end
$garde$;

-- Définitions de PRODUCTION du 2026-11-28, à l'identique.
create or replace function rencontres_prive.activite_supprimee()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare discussion text;
begin
 insert into rencontres_prive.identifiants_retires values(old.id) on conflict do nothing;
 -- Les anciennes collisions de nom ne prouvent pas le lien avec l'activité.
 -- Même provenance que can_join_event_conversation, verrouillée jusqu'à la purge.
 select c.id into discussion from public.conversations c
 where c.id = old.conv_id and c.id = 'evgrp_' || old.id
   and c.created_by in(old.author_id,old.organizer_id) and c.created_at >= old.created_at
 for update;
 if found then
   delete from public.conv_messages where conv_id = discussion;
   delete from public.conv_reads where conv_id = discussion;
   delete from public.conv_members where conv_id = discussion;
   delete from public.conversations where id = discussion;
 end if;
 return old;
end $$;

create or replace function public.events_prevenir_suppression()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
-- PASSIO prevenir-inscrits v4
declare
  orga     text := coalesce(old.organizer_id, old.author_id);
  nom      text;
  prec_srv text := pg_catalog.current_setting('passio.notification_serveur', true);
  prec_dif text := pg_catalog.current_setting('passio.diffusion_inscrits', true);
begin
  if orga is null then return old; end if;
  select p.username into nom from public.profiles p where p.id = orga;
  begin
    perform pg_catalog.set_config('passio.notification_serveur', '1', true);
    perform pg_catalog.set_config('passio.diffusion_inscrits', '1', true);
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
    select 'n_sup_' || left(md5(old.id || a.user_id), 20), a.user_id, 'event_cancelled', orga, old.id,
           public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'))
             || ' a supprimé « ' || public.passio_echapper_html(left(coalesce(old.title, 'une activité'), 60)) || ' »',
           false
      from public.event_attendees a
     where a.event_id = old.id and a.user_id is distinct from orga
       and a.rsvp in ('going', 'maybe', 'waitlist')
       -- Le blocage se lit par rapport à l'ORGANISATION, pas à qui supprime (une purge
       -- d'administration n'a pas d'`auth.uid()`).
       and not exists (select 1 from public.blocks b
                        where (b.blocker_id = orga and b.blocked_id = a.user_id)
                           or (b.blocker_id = a.user_id and b.blocked_id = orga))
       and not exists (select 1 from public.comptes_en_suppression c
                        where c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee'))
    on conflict (id) do nothing;
    perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
    perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
  exception when others then
    perform pg_catalog.set_config('passio.diffusion_inscrits', coalesce(prec_dif, ''), true);
    perform pg_catalog.set_config('passio.notification_serveur', coalesce(prec_srv, ''), true);
  end;
  return old;
end
$function$;

create or replace function rencontres_prive.inscription_gardee()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
 -- UPDATE tient déjà la ligne : ne jamais attendre un verrou de paire ici.
 perform rencontres_prive.verrou_paire(new.user_id, personne)
   from public.events e cross join lateral
     (select e.author_id as personne union select e.organizer_id) o
   where e.id = new.event_id and personne is not null order by personne;
 if new.rsvp <> 'declined' and rencontres_prive.bloque(new.event_id,new.user_id) then
   raise exception 'organisateur_bloque' using errcode = '42501';
 end if;
 if auth.uid() is not null and new.rsvp <> 'declined'
   and (tg_op = 'INSERT' or new.rsvp is distinct from old.rsvp) then
   perform pg_advisory_xact_lock(hashtextextended('rencontres:' || new.user_id,0));
   if (select count(*) from rencontres_prive.inscriptions where user_id = new.user_id
       and created_at >= now() - interval '1 day' and rsvp is not null and rsvp <> 'declined') >= 20 then
     raise exception 'inscriptions_jour_limite' using errcode = 'P0001';
   end if;
 end if;
 return new;
end $$;
-- ── FIN DES DÉFINITIONS DE PRODUCTION ──

drop function if exists public.amis_qui_y_vont(text);
drop function if exists public.etat_redemande_sortie(text);
drop function if exists rencontres_prive.redemande_permise(text, text);

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_rencontrer_activites_retour on commit drop as
select * from (values
  (1, 'les trois définitions de production d''avant, octet pour octet',
     (select string_agg(md5(replace(p.prosrc, chr(13), '')), '|' order by v.o)
        from (values (1, 'rencontres_prive.activite_supprimee()'), (2, 'public.events_prevenir_suppression()'),
                     (3, 'rencontres_prive.inscription_gardee()')) v(o, s)
        join pg_proc p on p.oid = to_regprocedure(v.s))
     = '37d2060f3814d51e3259ad7d27c0d936|8eb718235eb04b2de4190245d6c4f42c|2264a362f103da28aa9a7da56523a76b'),
  (2, 'les trois fonctions ajoutées sont retirées',
     to_regprocedure('public.amis_qui_y_vont(text)') is null
     and to_regprocedure('public.etat_redemande_sortie(text)') is null
     and to_regprocedure('rencontres_prive.redemande_permise(text,text)') is null),
  (3, 'déclencheurs toujours branchés sur ces définitions',
     (select count(*) from pg_trigger t where t.tgenabled = 'O' and (
        (t.tgrelid = 'public.events'::regclass and t.tgname = 'zz_rencontres_suppression' and t.tgfoid = 'rencontres_prive.activite_supprimee()'::regprocedure)
     or (t.tgrelid = 'public.events'::regclass and t.tgname = 'trg_events_prevenir_suppression' and t.tgfoid = 'public.events_prevenir_suppression()'::regprocedure)
     or (t.tgrelid = 'public.event_attendees'::regclass and t.tgname = 'aa_rencontres_inscription' and t.tgfoid = 'rencontres_prive.inscription_gardee()'::regprocedure))) = 3)
) as v(n, controle, ok_bool);

alter table _verdict_rencontrer_activites_retour add column verdict text;
update _verdict_rencontrer_activites_retour set verdict = case when ok_bool then 'OK' else 'ECHEC' end;

select n, controle, verdict from _verdict_rencontrer_activites_retour order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_rencontrer_activites_retour where verdict like 'ECHEC%') then
    raise exception 'retour rencontrer_activites : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_rencontrer_activites_retour where verdict like 'ECHEC%');
  end if;
end
$verdict$;

commit;
