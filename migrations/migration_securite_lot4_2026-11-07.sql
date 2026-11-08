-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- AUDIT DE SÉCURITÉ 2026-11-06 — LOT 4 : LE LIEU D'UNE ACTIVITÉ
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Le client doit être en ligne d'abord.
-- PREREQUIS-CLIENT: adresses_activites
-- Banc : tests/sql/migration-securite-2026-11-06.test.sh.
--
-- LES DÉFAUTS (B-17, G-07) :
--   ① `lat` et `lng` se lisent sans compte, au mètre près, avec la date : retirer `address` à `anon`
--     le 08/09 ne protégeait rien. Une activité organisée chez soi donne son domicile.
--   ② `address` et `contact` se lisent par tout compte, sans s'inscrire : 7 adresses et un téléphone.
--
-- CE QUI CHANGE :
--   ① Le point d'une activité est arrondi à environ 1 km, pour tout le monde, à l'écriture. Il sert aux
--     cartes et aux distances, qui n'ont pas besoin de plus. L'adresse exacte reste du texte.
--   ② `address` et `contact` se lisent par `adresses_activites`, pour l'organisation et pour qui vient.
--     Ni « peut-être » ni la liste d'attente : la place n'est pas tenue. S'inscrire exige déjà un compte
--     confirmé, l'admission 18+, et laisse une trace à l'organisation.
--   L'écriture de ces colonnes ne change pas : l'organisation les modifie comme avant.
--
-- RÉSIDU ASSUMÉ : un compte peut s'inscrire pour lire. Il est alors visible et plafonné. Un petit
-- village reste identifiable à 1 km. `venue`, `postal_code` et `city` restent publics.
--
-- RETOUR ARRIÈRE (éditeur SQL). Les coordonnées arrondies ne reviennent pas : les exactes sont dans la
-- sauvegarde du 2026-11-07.
--| begin;
--| grant select on public.events to authenticated;
--| drop trigger if exists aa_events_coordonnees on public.events;
--| drop function if exists public.events_coordonnees_arrondies();
--| drop function if exists public.adresses_activites(text[]);
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── ① Un point à 1 km, à l'écriture ──────────────────────────────────────────────────────────────
create or replace function public.events_coordonnees_arrondies() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if new.lat is not null then new.lat := pg_catalog.round(new.lat::numeric, 2)::double precision; end if;
  if new.lng is not null then new.lng := pg_catalog.round(new.lng::numeric, 2)::double precision; end if;
  return new;
end $fn$;
revoke all on function public.events_coordonnees_arrondies() from public, anon, authenticated;
drop trigger if exists aa_events_coordonnees on public.events;
create trigger aa_events_coordonnees before insert or update of lat, lng on public.events
  for each row execute function public.events_coordonnees_arrondies();
update public.events set lat = lat, lng = lng
 where (lat is not null and lat <> round(lat::numeric, 2)::double precision)
    or (lng is not null and lng <> round(lng::numeric, 2)::double precision);

-- ── ② L'adresse et le contact, à qui vient ───────────────────────────────────────────────────────
create or replace function public.adresses_activites(p_event_ids text[])
returns table (event_id text, address text, contact text)
language sql stable security definer set search_path = '' as $fn$
  select e.id, e.address, e.contact
    from public.events e
   where (select auth.uid()) is not null
     and e.id = any (p_event_ids[1:200])
     and (public.organise_activite(e.id)
          or (not public.is_blocked_with(e.author_id)
              and exists (select 1 from public.event_attendees a
                           where a.event_id = e.id
                             and a.user_id = (select auth.uid())::text
                             and a.rsvp = 'going')))
$fn$;
revoke all on function public.adresses_activites(text[]) from public, anon;
grant execute on function public.adresses_activites(text[]) to authenticated, service_role;

-- ⚠️ `authenticated` tient SELECT sur la TABLE : un `revoke select (address, contact)` n'y retire rien, sans la moindre
-- erreur. On retire le droit de table, puis on rend chaque colonne, sauf ces deux-là. Vu au tableau de verdict du staging
-- le 07/11 : le banc écrivait ces droits colonne par colonne, et passait.
revoke select on public.events from authenticated;
do $do$
declare colonnes text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into strict colonnes
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.events'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname not in ('address', 'contact');
  execute format('grant select (%s) on public.events to authenticated', colonnes);
end $do$;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'coordonnées : arrondies à l''écriture, aucune ligne au mètre' as controle,
       case when exists (select 1 from pg_trigger where tgname = 'aa_events_coordonnees' and tgenabled = 'O')
             and not exists (select 1 from public.events where lat <> round(lat::numeric, 2)::double precision or lng <> round(lng::numeric, 2)::double precision)
            then 'OK' else 'ECHEC' end as valeur
union all select 'adresse et contact : plus de lecture directe',
       case when not has_column_privilege('authenticated', 'public.events', 'address', 'select')
             and not has_column_privilege('authenticated', 'public.events', 'contact', 'select')
             and not has_column_privilege('anon', 'public.events', 'address', 'select')
             and not has_column_privilege('anon', 'public.events', 'contact', 'select') then 'OK' else 'ECHEC' end
union all select 'les autres colonnes : toujours lisibles par un compte',
       case when not exists (select 1 from pg_catalog.pg_attribute a
                              where a.attrelid = 'public.events'::regclass and a.attnum > 0 and not a.attisdropped
                                and a.attname not in ('address', 'contact')
                                and not has_column_privilege('authenticated', 'public.events', a.attname, 'select'))
            then 'OK' else 'ECHEC' end
union all select 'adresse et contact : écriture de l''organisation conservée',
       case when has_column_privilege('authenticated', 'public.events', 'address', 'update')
             and has_column_privilege('authenticated', 'public.events', 'contact', 'update') then 'OK' else 'ECHEC' end
union all select 'adresses_activites : comptes seuls',
       case when has_function_privilege('authenticated', 'public.adresses_activites(text[])', 'execute')
             and not has_function_privilege('anon', 'public.adresses_activites(text[])', 'execute') then 'OK' else 'ECHEC' end;

commit;
