-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS IRL — la liste d'attente a enfin une sortie : la promotion est
-- faite PAR LA BASE (audit 2026-11-02, B-02 / E-01, P1)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (4 lignes).
--
-- LE DÉFAUT. Quand une place se libère, le client qui se retire (ou
-- l'organisateur, à la main) tentait `UPDATE event_attendees SET rsvp='going'`
-- sur la ligne de QUELQU'UN D'AUTRE. La seule policy UPDATE de la table est
-- `user_id = auth.uid()` : l'UPDATE touche 0 ligne, toujours — et le client,
-- honnête depuis IRL-04, ne l'annonce pas. Résultat : aucune promotion n'a
-- jamais pu aboutir en base réelle, ni automatique ni manuelle. La liste
-- d'attente était une impasse (prouvé bout en bout sur le faux serveur de
-- l'agent E, et par la policy elle-même).
--
-- CE QUI CHANGE, et rien d'autre :
--   · RPC `promouvoir_attente(p_event_id, p_user_id default null)`
--     (SECURITY DEFINER) : verrouille l'activité (`for update`), vérifie
--     qu'elle est active, à venir et à capacité, qu'une place est libre, puis
--     passe en `going` le PREMIER de la liste d'attente (ordre d'arrivée) —
--     ou, si `p_user_id` est donné, cette personne-là, à condition que
--     l'appelant soit l'auteur ou un co-organisateur de l'activité. L'UPDATE
--     repasse par les triggers de la table : `event_attendees_capacite_gardee`
--     (la capacité est tranchée sous le MÊME verrou), la barrière de
--     suppression, la garde d'admission. La notification « une place s'est
--     libérée » est écrite ici, d'origine SERVEUR (identifiant déterministe
--     `n_pa_<activité>_<compte>` : pas de doublon au rejeu).
--     Rend un JSON : {ok:true,user_id} ou {ok:false,motif} avec un motif
--     stable : non_connecte · introuvable · annulee · passee · sans_capacite ·
--     complete · personne_en_attente · non_autorise · pas_en_attente · refuse.
--   · Qui peut l'appeler : tout compte connecté, SANS `p_user_id` — l'effet est
--     exactement celui que produirait le prochain retrait (premier arrivé,
--     capacité respectée) ; rien de plus n'est accordé. Avec `p_user_id`,
--     l'organisation seule.
-- CLIENT : `supaPromoteFromWaitlist` (app-08) appelle cette RPC d'abord et ne
-- retombe sur l'UPDATE d'avant que si la fonction est absente (PGRST202,
-- migration pas encore appliquée) — à coller à tout moment, dans n'importe
-- quel ordre avec le déploiement du client.
-- RETOUR ARRIÈRE : `drop function if exists public.promouvoir_attente(text, text);`
-- — le client retombe sur le chemin d'avant (impasse, mais sans erreur).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

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
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'motif', 'non_connecte'); end if;
  -- Verrou de l'activité : deux promotions (ou une promotion et une inscription)
  -- concurrentes se suivent, la seconde compte APRÈS la première.
  select id, status, max_attendees, date_at, end_at, author_id, title, co_organizers
    into ev from public.events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'motif', 'introuvable'); end if;
  if ev.status = 'cancelled' then return jsonb_build_object('ok', false, 'motif', 'annulee'); end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then return jsonb_build_object('ok', false, 'motif', 'passee'); end if;
  if ev.max_attendees is null then return jsonb_build_object('ok', false, 'motif', 'sans_capacite'); end if;

  if p_user_id is not null then
    -- Promotion CHOISIE : réservée à l'organisation.
    if moi <> ev.author_id
       and not (coalesce(ev.co_organizers, '[]'::jsonb) ? moi) then
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
  perform set_config('passio.notification_serveur', '1', true);
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values ('n_pa_' || left(p_event_id, 12) || '_' || left(cible, 8), cible, 'event_update', ev.author_id, p_event_id,
            'Une place s''est libérée pour « ' || left(coalesce(ev.title, 'une activité'), 60) || ' » : tu es inscrit·e !',
            false, now())
    on conflict (id) do update set content = excluded.content, seen = false, created_at = now();
  exception when others then
    raise warning 'promouvoir_attente : notification non écrite (%) — la promotion est conservée', sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'user_id', cible);
end
$function$;
revoke execute on function public.promouvoir_attente(text, text) from public, anon;
grant execute on function public.promouvoir_attente(text, text) to authenticated;

-- Verdict (4 lignes attendues, toutes OK).
select 'RPC promouvoir_attente présente' as controle,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'promouvoir_attente') then 'OK' else 'ECHEC' end as valeur
union all select 'SECURITY DEFINER, search_path figé',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'promouvoir_attente'
                            and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=%') then 'OK' else 'ECHEC' end
union all select 'authenticated exécute, anon non',
       case when has_function_privilege('authenticated', 'public.promouvoir_attente(text,text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.promouvoir_attente(text,text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all select 'la policy UPDATE de event_attendees reste propriétaire (rien d''ouvert)',
       case when not exists (select 1 from pg_policies where tablename = 'event_attendees' and cmd = 'UPDATE'
                               and (qual is null or qual = 'true')) then 'OK' else 'ECHEC' end;

commit;
