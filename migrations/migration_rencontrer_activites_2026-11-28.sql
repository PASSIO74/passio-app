-- ═══════════════════════════════════════════════════════════════════════════
-- RENCONTRER — SUPPRESSION SANS RÉSIDU, REDEMANDE BORNÉE, AMIS QUI Y VONT
-- (2026-11-28)
--
-- `npm run migration:appliquer -- migrations/migration_rencontrer_activites_2026-11-28.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict LÈVE si une
-- seule ligne est en ECHEC. AUCUN PRÉREQUIS CLIENT : l'ancien client garde un
-- comportement juste (une redemande refusée par la garde tombe sur son message
-- générique « réessaie », l'optimiste est annulé ; il n'appelle ni
-- `amis_qui_y_vont` ni `etat_redemande_sortie`). Retour arrière :
-- `migration_rencontrer_activites_retour_2026-11-28.sql`.
--
-- Définitions de PRODUCTION relues au catalogue en lecture seule le
-- 2026-11-28 (identiques au staging), md5 du corps CR retirés :
--   rencontres_prive.activite_supprimee()    37d2060f3814d51e3259ad7d27c0d936
--   public.events_prevenir_suppression()     8eb718235eb04b2de4190245d6c4f42c
--   rencontres_prive.inscription_gardee()    2264a362f103da28aa9a7da56523a76b
--
-- ① n° 227 — UNE ACTIVITÉ SUPPRIMÉE LAISSAIT TROIS RÉSIDUS. `posts` n'a aucune
--    clé étrangère vers `events` (`event_id` est un texte libre) :
--    · la carte du fil `post_ev_<id>` restait, dans le fil des abonnés, pour
--      une activité qui n'existe plus — elle est SUPPRIMÉE, si son auteur est
--      l'auteur ou l'organisateur de l'activité (un identifiant se choisit
--      côté client : une carte d'autrui sous ce nom n'est pas la sienne) ;
--    · `posts.event_id` pointait sur un identifiant mort — remis à NULL, ligne
--      par ligne, sous un bloc d'exception (une garde de `posts` qui refuse,
--      compte en suppression ou débit, n'empêche JAMAIS la suppression) ;
--    · la discussion `evgrp_<id>` n'était purgée que si `events.conv_id` la
--      citait : une discussion créée sans que le lien soit posé (ou dont le
--      lien a été effacé par une édition, sujet 145) survivait. Les mêmes
--      preuves de provenance que `can_join_event_conversation` suffisent
--      (nom `evgrp_<id>`, créée par l'auteur ou l'organisateur, APRÈS
--      l'activité) — `conv_id` n'est plus exigé.
--    `events_prevenir_suppression` AVALAIT son échec (`exception when others`
--    sans un mot) : les inscrits pouvaient ne pas être prévenus sans que rien
--    ne le dise. Il lève désormais un AVERTISSEMENT (journal Postgres) — la
--    suppression elle-même n'est toujours pas bloquée par un avis manqué.
--    Le Storage (couverture) n'est PAS touché ici.
--
-- ② n° 212 — UNE DEMANDE REFUSÉE SE RENVOYAIT SANS FIN. `valider_participant
--    (false)` supprime la ligne ; un nouvel INSERT « going » repassait la garde
--    et réécrivait une notification `event_join` à l'organisation, jusqu'à 20
--    fois par jour. RÈGLE (décision produit déléguée, 2026-11-28) : UNE seule
--    redemande après un refus, et pas avant 24 h ; après un second refus, plus
--    de redemande pour cette activité. Un « refus » est une décision
--    `accepter = false` de l'organisation dans `rencontres_prive.decisions`
--    (refus d'une demande OU retrait d'une participation : les deux sont une
--    exclusion par l'organisation). `inscription_gardee` lève, AVANT toute
--    écriture (déclencheur BEFORE : `inscription_tracee`, AFTER, n'écrit donc
--    aucune notification) :
--      `redemande_trop_tot`  (P0001) — un refus il y a moins de 24 h ;
--      `redemande_epuisee`   (P0001) — deux refus ou plus.
--    Gardé : l'entrée en « going » ou en liste d'attente (INSERT, ou UPDATE
--    depuis une autre réponse). Libres : « peut-être », « je ne peux pas », la
--    promotion de la liste d'attente (waitlist → going, déjà admise), et tout
--    écrit sans session (administration). La règle vit dans UNE fonction,
--    `rencontres_prive.redemande_permise`, lue par la garde ET par la RPC
--    `etat_redemande_sortie(p_event_id)` (le client sait AVANT d'appuyer si
--    redemander est possible, et à partir de quand) — qui ne parle QUE de
--    l'appelant.
--
-- ③ n° 198 — « X ET Y Y VONT » ÉTAIT ÉTEINT. La policy `event_attendees_select_lien`
--    ne rend plus les lignes d'autrui qu'aux participants VALIDÉS et à
--    l'organisation (la clause « suivi mutuel » est partie le 16/11) : un
--    membre non inscrit ne voyait jamais ses amis — avant la décision que le
--    bandeau devait aider à prendre. On NE rouvre PAS la policy. RPC
--    `amis_qui_y_vont(p_event_id)` (SECURITY DEFINER) : au plus 3 personnes
--    (id, pseudo, emoji, couleur, photo — des colonnes déjà publiques de
--    `profiles`) et leur nombre total, seulement :
--      · si l'appelant peut LIRE l'activité (`activite_masquee_pour_moi` :
--        ni blocage avec l'organisation, ni activité privée fermée), active ;
--      · des participations « going » VALIDÉES (accord de l'organisation) —
--        ou l'organisation elle-même ;
--      · en SUIVI MUTUEL accepté : je la suis ET elle me suit. Suivre un compte
--        public s'écrit seul (accepté d'office) : un état que l'appelant ÉCRIT
--        lui-même n'est pas une frontière (C-04) — c'est le suivi EN RETOUR,
--        écrit par l'autre, qui ouvre sa présence. Un compte privé ne passe
--        qu'avec ses deux suivis acceptés ;
--      · hors blocage dans un sens ou dans l'autre (`is_blocked_with`), hors
--        compte en suppression, jamais l'appelant.
--    Ni « peut-être », ni liste d'attente, ni demande en attente : la liste
--    fermée ne ressort par aucun de ces chemins.
--
-- VERROUS : `lock_timeout` 3 s, `statement_timeout` 30 s.
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── GARDE : prérequis et empreintes des définitions REMPLACÉES ──────────────
do $garde$
declare
  r record;
  emp text;
begin
  if to_regclass('rencontres_prive.accords') is null
     or to_regclass('rencontres_prive.decisions') is null
     or to_regclass('rencontres_prive.identifiants_retires') is null
     or to_regclass('public.follows') is null
     or to_regclass('public.comptes_en_suppression') is null
     or to_regprocedure('public.activite_masquee_pour_moi(text)') is null
     or to_regprocedure('public.is_blocked_with(text)') is null
     or to_regprocedure('public.suppression_de_mon_compte()') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'zz_rencontres_suppression')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'trg_events_prevenir_suppression')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.event_attendees'::regclass and tgname = 'aa_rencontres_inscription') then
    raise exception 'rencontrer_activites : prérequis absents (validation de l''organisation, suivis, déclencheurs d''activité)';
  end if;
  for r in select * from (values
    ('rencontres_prive.activite_supprimee()', '37d2060f3814d51e3259ad7d27c0d936', 'bcb6f58e97b241104cd5be00055d5946'),
    ('public.events_prevenir_suppression()', '8eb718235eb04b2de4190245d6c4f42c', 'e0d2d69b70b8a54317e08d2b8b453710'),
    ('rencontres_prive.inscription_gardee()', '2264a362f103da28aa9a7da56523a76b', 'e16353adf84bfd2042041c6bcab5bd57')
  ) as v(sig, avant, apres) loop
    if to_regprocedure(r.sig) is null then
      raise exception 'rencontrer_activites : % absente', r.sig;
    end if;
    select md5(replace(p.prosrc, chr(13), '')) into emp from pg_proc p where p.oid = to_regprocedure(r.sig);
    if emp is distinct from r.avant and emp is distinct from r.apres then
      raise exception 'rencontrer_activites : % a changé depuis la mesure du 2026-11-28 (md5 %) — relire avant de réécrire', r.sig, emp;
    end if;
  end loop;
end
$garde$;

-- ── ① LA SUPPRESSION EMPORTE LA CARTE, LES LIENS ET LA DISCUSSION ───────────
create or replace function rencontres_prive.activite_supprimee()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  discussion text;
  lien text;
begin
 insert into rencontres_prive.identifiants_retires values(old.id) on conflict do nothing;
 -- Les anciennes collisions de nom ne prouvent pas le lien avec l'activité.
 -- Même provenance que can_join_event_conversation, verrouillée jusqu'à la purge.
 -- ⚠️ `conv_id` N'EST PLUS EXIGÉ (2026-11-28, sujet 227) : une discussion dont le
 -- lien n'a jamais été posé, ou a été effacé, survivait à son activité.
 select c.id into discussion from public.conversations c
 where c.id = 'evgrp_' || old.id
   and c.created_by in(old.author_id,old.organizer_id) and c.created_at >= old.created_at
 for update;
 if found then
   delete from public.conv_messages where conv_id = discussion;
   delete from public.conv_reads where conv_id = discussion;
   delete from public.conv_members where conv_id = discussion;
   delete from public.conversations where id = discussion;
 end if;
 -- La carte du fil de l'activité — celle de son organisation seulement :
 -- l'identifiant se choisit côté client.
 begin
   delete from public.posts p where p.id = 'post_ev_' || old.id
     and p.author_id in (old.author_id, old.organizer_id);
 exception when others then
   raise warning 'activite_supprimee(%) : carte du fil non retirée (%)', old.id, left(sqlerrm, 120);
 end;
 -- Les publications liées ne pointent plus sur un identifiant mort. Une garde
 -- de `posts` qui refuse (compte en suppression, débit) n'arrête rien.
 for lien in select p.id from public.posts p where p.event_id = old.id order by p.id limit 500 loop
   begin
     update public.posts set event_id = null where id = lien and event_id = old.id;
   exception when others then
     raise warning 'activite_supprimee(%) : lien de la publication % non effacé (%)', old.id, left(lien, 24), left(sqlerrm, 120);
   end;
 end loop;
 return old;
end $$;

-- ── ① (bis) UN AVIS AUX INSCRITS MANQUÉ SE DIT ──────────────────────────────
create or replace function public.events_prevenir_suppression()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
-- PASSIO prevenir-inscrits v5
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
    -- ⚠️ (2026-11-28, sujet 227) L'échec était AVALÉ sans un mot : la suppression
    -- passe toujours, mais le journal le dit.
    raise warning 'events_prevenir_suppression(%) : inscrits NON prévenus (% %)', old.id, sqlstate, left(sqlerrm, 160);
  end;
  return old;
end
$function$;

-- ── ② LA REDEMANDE BORNÉE : une règle, une fonction ─────────────────────────
create or replace function rencontres_prive.redemande_permise(p_event_id text, p_user_id text,
  out refus integer, out motif text, out possible_le timestamptz)
language sql stable security definer set search_path = ''
as $$
  -- UNE redemande après un refus, pas avant 24 h ; plus aucune après deux refus.
  select r.n,
         case when r.n >= 2 then 'redemande_epuisee'
              when r.n = 1 and r.dernier > now() - interval '24 hours' then 'redemande_trop_tot' end,
         case when r.n = 1 and r.dernier > now() - interval '24 hours' then r.dernier + interval '24 hours' end
    from (select count(*)::integer as n, max(d.created_at) as dernier
            from rencontres_prive.decisions d
           where d.event_id = p_event_id and d.user_id = p_user_id
             and not d.accepter and d.decideur_id is distinct from d.user_id) r
$$;
revoke all on function rencontres_prive.redemande_permise(text, text) from public, anon, authenticated;

create or replace function rencontres_prive.inscription_gardee()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  frein text;
begin
 -- UPDATE tient déjà la ligne : ne jamais attendre un verrou de paire ici.
 perform rencontres_prive.verrou_paire(new.user_id, personne)
   from public.events e cross join lateral
     (select e.author_id as personne union select e.organizer_id) o
   where e.id = new.event_id and personne is not null order by personne;
 if new.rsvp <> 'declined' and rencontres_prive.bloque(new.event_id,new.user_id) then
   raise exception 'organisateur_bloque' using errcode = '42501';
 end if;
 -- ⚠️ UNE DEMANDE REFUSÉE NE SE RENVOIE PAS SANS FIN (2026-11-28, sujet 212) :
 -- entrer en « going » ou en liste d'attente après un refus de l'organisation.
 -- BEFORE : refusée ici, aucune notification `event_join` ne part.
 if auth.uid() is not null and new.rsvp in ('going', 'waitlist')
   and (tg_op = 'INSERT' or old.rsvp not in ('going', 'waitlist')) then
   select r.motif into frein from rencontres_prive.redemande_permise(new.event_id, new.user_id) r;
   if frein is not null then
     raise exception '%', frein using errcode = 'P0001',
       hint = 'Une seule redemande après un refus de l''organisation, 24 h après ; aucune après deux refus.';
   end if;
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

-- Ce que l'APPELANT peut encore faire pour CETTE activité — rien sur autrui.
create or replace function public.etat_redemande_sortie(p_event_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is null or p_event_id is null then null else
    (select jsonb_build_object('refus', r.refus, 'motif', r.motif, 'possible_le', r.possible_le)
       from rencontres_prive.redemande_permise(p_event_id, (select auth.uid())::text) r) end
$$;
revoke all on function public.etat_redemande_sortie(text) from public, anon;
grant execute on function public.etat_redemande_sortie(text) to authenticated;

-- ── ③ LES AMIS QUI Y VONT : la preuve sociale, sans rouvrir la liste ────────
create or replace function public.amis_qui_y_vont(p_event_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with moi as (select (select auth.uid())::text as uid),
  amis as (
    select a.user_id, a.created_at
      from public.event_attendees a
      join public.events e on e.id = a.event_id
      cross join moi
     where moi.uid is not null
       and a.event_id = p_event_id
       and a.rsvp = 'going'
       and a.user_id <> moi.uid
       and e.status = 'active'
       and not public.suppression_de_mon_compte()
       and not public.activite_masquee_pour_moi(p_event_id)
       -- une participation VALIDÉE, ou l'organisation elle-même
       and (exists (select 1 from rencontres_prive.accords v where v.event_id = a.event_id and v.user_id = a.user_id)
            or a.user_id = e.author_id or a.user_id = e.organizer_id)
       and exists (select 1 from public.follows f
                    where f.follower_id = moi.uid and f.following_id = a.user_id and f.status = 'accepted')
       and exists (select 1 from public.follows f  -- réciproque : c'est ELLE qui me suit
                    where f.follower_id = a.user_id and f.following_id = moi.uid and f.status = 'accepted')
       and not public.is_blocked_with(a.user_id)
       and not exists (select 1 from public.comptes_en_suppression c
                        where c.user_id = a.user_id and c.statut in ('en_cours', 'purgee', 'supprimee'))
  )
  select jsonb_build_object(
    'total', (select count(*) from amis),
    'amis', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'emoji', p.emoji,
                                                          'color', p.color, 'avatar_url', p.avatar_url)
                                       order by x.created_at, x.user_id)
                        from (select * from amis order by created_at, user_id limit 3) x
                        join public.profiles p on p.id = x.user_id), '[]'::jsonb))
$$;
revoke all on function public.amis_qui_y_vont(text) from public, anon;
grant execute on function public.amis_qui_y_vont(text) to authenticated;

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_rencontrer_activites on commit drop as
select * from (values
  (1, 'suppression : discussion evgrp_ purgée sans conv_id, carte post_ev_ retirée, liens event_id effacés',
     pg_get_functiondef('rencontres_prive.activite_supprimee()'::regprocedure) not like '%old.conv_id%'
     and pg_get_functiondef('rencontres_prive.activite_supprimee()'::regprocedure) like '%''post_ev_'' || old.id%'
     and pg_get_functiondef('rencontres_prive.activite_supprimee()'::regprocedure) like '%set event_id = null%'
     and exists (select 1 from pg_trigger t where t.tgrelid = 'public.events'::regclass and t.tgname = 'zz_rencontres_suppression'
                  and t.tgenabled = 'O' and t.tgfoid = 'rencontres_prive.activite_supprimee()'::regprocedure)),
  (2, 'avis de suppression : un échec lève un avertissement, toujours BEFORE DELETE',
     pg_get_functiondef('public.events_prevenir_suppression()'::regprocedure) like '%raise warning%'
     and exists (select 1 from pg_trigger t where t.tgrelid = 'public.events'::regclass and t.tgname = 'trg_events_prevenir_suppression'
                  and t.tgenabled = 'O' and t.tgfoid = 'public.events_prevenir_suppression()'::regprocedure)),
  (3, 'inscription : la redemande est bornée (redemande_permise), déclencheur BEFORE actif',
     pg_get_functiondef('rencontres_prive.inscription_gardee()'::regprocedure) like '%rencontres_prive.redemande_permise%'
     and exists (select 1 from pg_trigger t where t.tgrelid = 'public.event_attendees'::regclass and t.tgname = 'aa_rencontres_inscription'
                  and t.tgenabled = 'O' and t.tgfoid = 'rencontres_prive.inscription_gardee()'::regprocedure)),
  (4, 'redemande_permise : SECURITY DEFINER, search_path figé, sans EXECUTE client',
     exists (select 1 from pg_proc where oid = 'rencontres_prive.redemande_permise(text,text)'::regprocedure
              and prosecdef and proconfig @> array['search_path=""'])
     and not has_function_privilege('authenticated', 'rencontres_prive.redemande_permise(text,text)', 'execute')
     and not has_function_privilege('anon', 'rencontres_prive.redemande_permise(text,text)', 'execute')),
  (5, 'etat_redemande_sortie : SECURITY DEFINER, comptes connectés seulement',
     exists (select 1 from pg_proc where oid = 'public.etat_redemande_sortie(text)'::regprocedure
              and prosecdef and proconfig @> array['search_path=""'])
     and has_function_privilege('authenticated', 'public.etat_redemande_sortie(text)', 'execute')
     and not has_function_privilege('anon', 'public.etat_redemande_sortie(text)', 'execute')),
  (6, 'amis_qui_y_vont : SECURITY DEFINER, suivi mutuel et validation exigés, comptes connectés seulement',
     exists (select 1 from pg_proc where oid = 'public.amis_qui_y_vont(text)'::regprocedure
              and prosecdef and proconfig @> array['search_path=""'])
     and pg_get_functiondef('public.amis_qui_y_vont(text)'::regprocedure) like '%f.following_id = moi.uid%'
     and pg_get_functiondef('public.amis_qui_y_vont(text)'::regprocedure) like '%rencontres_prive.accords%'
     and pg_get_functiondef('public.amis_qui_y_vont(text)'::regprocedure) like '%activite_masquee_pour_moi%'
     and has_function_privilege('authenticated', 'public.amis_qui_y_vont(text)', 'execute')
     and not has_function_privilege('anon', 'public.amis_qui_y_vont(text)', 'execute')),
  (7, 'les trois définitions remplacées : SECURITY DEFINER, search_path figé',
     (select count(*) from pg_proc p where p.oid in ('rencontres_prive.activite_supprimee()'::regprocedure,
        'public.events_prevenir_suppression()'::regprocedure, 'rencontres_prive.inscription_gardee()'::regprocedure)
        and p.prosecdef and p.proconfig @> array['search_path=""']) = 3),
  (8, 'events_prevenir_suppression : toujours hors d''atteinte des clients (ni anon, ni authenticated)',
     not has_function_privilege('anon', 'public.events_prevenir_suppression()', 'execute')
     and not has_function_privilege('authenticated', 'public.events_prevenir_suppression()', 'execute'))
) as v(n, controle, ok_bool);

alter table _verdict_rencontrer_activites add column verdict text;
update _verdict_rencontrer_activites set verdict = case when ok_bool then 'OK' else 'ECHEC' end;

select n, controle, verdict from _verdict_rencontrer_activites order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_rencontrer_activites where verdict like 'ECHEC%') then
    raise exception 'rencontrer_activites : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_rencontrer_activites where verdict like 'ECHEC%');
  end if;
end
$verdict$;

commit;
