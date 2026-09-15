-- ═══════════════════════════════════════════════════════════════════════════
-- IRL — DÉPLACER UNE INSCRIPTION CONTOURNAIT LA CAPACITÉ ET L'ANNULATION
-- (ASTRA-35, quatrième contre-revue indépendante, 2026-09-15 · IRL-05)
--
-- CE QUI A ÉTÉ MESURÉ EN PRODUCTION le 2026-09-15 (canal ① d'ADR-012) :
--   · `event_attendees_capacite_gardee` porte bien la sortie précoce
--     `if tg_op = 'UPDATE' and old.rsvp = 'going' then return new; end if;` ;
--   · AUCUN des trois triggers d'`event_attendees` (admission, capacité,
--     pointage) ne regarde `event_id`.
--
-- LE CHEMIN. La sortie précoce dit « rester inscrit ne consomme rien » — et
-- c'est juste tant que l'inscription reste sur LA MÊME activité. Elle rend
-- `new` AVANT le verrou de la ligne parente, donc avant tout contrôle de
-- capacité, de statut et de date. Il suffit alors, en étant déjà `going` sur
-- une activité E1 qui a de la place :
--
--     PATCH /rest/v1/event_attendees?id=eq.<mon inscription>
--     { "event_id": "<E2>" }
--
-- pour se retrouver `going` sur E2 — **pleine, annulée ou passée**. La policy
-- `event_attendees_update_own_adult` ne voit que `user_id`, et un `WITH CHECK`
-- ne voit que la ligne FINALE : aucune des deux ne peut voir que la ligne a
-- CHANGÉ D'ACTIVITÉ.
--
-- LE REMÈDE : `event_id` (et `user_id`) sont FIGÉS. Un déplacement n'est pas
-- une modification d'inscription, c'est une inscription NOUVELLE — elle passe
-- donc par un DELETE puis un INSERT, et l'INSERT, lui, est intégralement gardé
-- (capacité, statut, date, admission). Aucun chemin du produit ne déplace une
-- inscription : `grep event_id` sur le client ne rend AUCUNE écriture.
--
-- ⚠️ POURQUOI FIGER PLUTÔT QUE RE-CONTRÔLER. Re-contrôler au déplacement aurait
-- voulu dire rejouer, dans la branche UPDATE, la capacité, le statut, la date
-- ET l'admission — c'est-à-dire dupliquer trois triggers dans un quatrième.
-- Deux copies d'une règle finissent toujours par diverger, et c'est la seconde
-- qu'on oublie (fiche « une levée sans appelant », 12/09). Figer supprime le
-- chemin au lieu de le garder.
--
-- ⚠️ `user_id` EST FIGÉ POUR LA MÊME RAISON, et elle est plus grave : réassigner
-- `user_id` sur SA PROPRE ligne la donne à quelqu'un d'autre — la policy
-- `WITH CHECK (user_id = auth.uid())` l'interdit aujourd'hui, mais elle est la
-- SEULE à le faire, et un `USING` sans `WITH CHECK` est très exactement le
-- défaut que la red team du 11/09 a trouvé sur `conv_messages`.
--
-- ⚠️ AUCUNE SESSION (postgres, service_role, restauration, purge) : la règle ne
-- s'applique pas — même sortie que les trois triggers voisins. Sans elle, un
-- rejeu de restauration ou une purge se ferait refuser ses écritures.
--
-- Rejouable ; verdict en fin. Retour arrière :
--   drop trigger if exists trg_event_attendees_figes on public.event_attendees;
--   drop function if exists public.event_attendees_figes();
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.event_attendees_figes()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.event_id is distinct from old.event_id then
    raise exception 'inscription_activite_figee' using errcode = 'P0001',
      hint = 'Une inscription ne se déplace pas : se désinscrire, puis s''inscrire à l''autre activité.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'inscription_compte_fige' using errcode = 'P0001',
      hint = 'Une inscription ne change pas de compte.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_attendees_figes on public.event_attendees;
-- ⚠️ `BEFORE UPDATE OF event_id, user_id` NE SUFFIRAIT PAS : la clause `OF` se
-- déclenche sur les colonnes MENTIONNÉES par l'UPDATE, pas sur celles qui
-- CHANGENT. On garde donc le déclenchement sur toute la ligne : une garde
-- d'intégrité ne doit pas dépendre de la FORME de la requête.
--
-- ⚠️ L'ORDRE D'EXÉCUTION NE COMPTE PAS ICI, et il ne faut pas prétendre le
-- contraire. PostgreSQL trie les triggers BEFORE par NOM, et
-- `trg_event_attendees_figes` arrive APRÈS `…_admission` et `…_capacite`.
-- Ça n'a aucune importance : ce trigger `raise exception`, donc il ANNULE la
-- transaction quoi qu'aient rendu les précédents — y compris la sortie précoce
-- de la capacité, qui est justement le chemin qu'on ferme. Une première
-- rédaction affirmait qu'il s'ordonnait en premier ; c'était faux, et le banc
-- l'a dit.
-- ⚠️ BEFORE UPDATE SEULEMENT : un INSERT n'a pas d'`old`, la comparaison y
-- lèverait.
create trigger trg_event_attendees_figes
  before update on public.event_attendees
  for each row execute function public.event_attendees_figes();

-- ── VERDICT ────────────────────────────────────────────────────────────────
select 'trigger posé sur event_attendees' as controle,
       case when exists (select 1 from pg_trigger
                          where tgname = 'trg_event_attendees_figes' and not tgisinternal
                            and tgrelid = 'public.event_attendees'::regclass) then 'OK' else 'ECHEC' end as valeur
union all select 'il fige event_id ET user_id',
       case when (select prosrc from pg_proc where proname = 'event_attendees_figes') like '%new.event_id is distinct from old.event_id%'
             and (select prosrc from pg_proc where proname = 'event_attendees_figes') like '%new.user_id is distinct from old.user_id%'
            then 'OK' else 'ECHEC' end
union all select 'SECURITY DEFINER, search_path vide',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""'
                    from pg_proc where proname = 'event_attendees_figes') then 'OK' else 'ECHEC' end
union all select 'il s''efface sans session (restauration, purge)',
       case when (select prosrc from pg_proc where proname = 'event_attendees_figes') like '%auth.uid() is null then return new%' then 'OK' else 'ECHEC' end
union all select 'les trois gardes voisines sont intactes',
       case when (select count(*) from pg_trigger
                   where tgrelid = 'public.event_attendees'::regclass and not tgisinternal
                     and tgname in ('trg_event_attendees_admission', 'trg_event_attendees_capacite', 'trg_event_attendees_pointage')) = 3
            then 'OK' else 'ECHEC' end
-- ⚠️ LES BITS DE `tgtype` : 1 = ROW, 2 = BEFORE, 4 = INSERT, 8 = DELETE,
-- 16 = UPDATE. Une première rédaction prenait 4 pour BEFORE : la ligne rendait
-- ECHEC sur une migration pourtant juste, et c'est le banc qui l'a dit. Un
-- verdict faux au rouge coûte autant qu'un verdict faux au vert.
union all select 'il est BEFORE UPDATE seulement (un INSERT n''a pas d''old)',
       case when (select tgtype & 2 = 2 and tgtype & 16 = 16 and tgtype & 4 = 0 and tgtype & 8 = 0
                    from pg_trigger where tgname = 'trg_event_attendees_figes' and not tgisinternal)
            then 'OK' else 'ECHEC' end;

commit;
