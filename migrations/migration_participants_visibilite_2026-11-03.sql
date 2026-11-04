-- ═════════════════════════════════════════════════
-- AUDIT 2026-11-02, DÉCISION PRODUIT C-04 (tranchée le 2026-11-03, durcie le
-- même jour après deux contre-revues indépendantes) :
-- LA LISTE NOMINATIVE DES PARTICIPANTS D'UNE ACTIVITÉ N'EST PLUS PUBLIQUE
--
-- Mesuré en production au canal ① (lecture seule) : `event_attendees` portait
-- une policy SELECT `USING (true)` pour `authenticated` — tout compte connecté
-- lisait QUI va à QUELLE rencontre physique (événements passés compris), avec
-- la note `rating`, le texte libre `feedback` et l'heure de pointage de chacun.
-- Pour une application qui s'ouvre à des inconnus, c'est l'adresse et l'heure
-- où trouver une personne, offertes à n'importe quel compte.
--
-- MODÈLE DE MENACE : un compte adulte quelconque, qui parle à PostgREST en
-- direct (pas par l'interface), veut la liste de QUI va (ou est allé) à une
-- activité donnée, l'heure de pointage de chacun, ou la note d'une personne
-- précise. Il peut créer des comptes, écrire SA ligne d'inscription dans
-- n'importe quel état, la retirer aussitôt, et suivre n'importe quel profil
-- public (abonnement accepté d'office par `trg_follows_statut`).
--
-- CE QUI CHANGE (et ce qui est gardé) :
--  ① LA LISTE suit le LIEN. Un compte lit une ligne d'inscription si c'est la
--     sienne ; s'il organise l'activité (auteur, organisateur, co-organisateur :
--     pointage, liste d'attente, promotion) ; s'il y VIENT lui-même (sa ligne
--     en « going » : les venants se voient entre eux — hors « declined », qui
--     n'est jamais public) ; ou si la personne inscrite et lui se suivent
--     MUTUELLEMENT (deux abonnements acceptés) : « ton ami y va » reste visible,
--     l'inconnu ne l'est plus. Un blocage, dans un sens ou dans l'autre
--     (`is_blocked_with`), ferme ces deux dernières branches.
--  ② LE NOMBRE reste public parmi les connectés : RPC `participants_compte`
--     (venants, peut-être, liste d'attente, pointés) — preuve sociale, places
--     restantes, tri par popularité continuent de fonctionner pour tous.
--  ③ `rating`, `feedback` et `rated_at` ne sont plus LISIBLES par le rôle
--     (révocation de colonne) : la moyenne vient de la RPC `notes_evenement`
--     (agrégat, jamais « qui a mis quoi »), et SEULEMENT à partir de 3 notes
--     hors organisation ; les retours écrits se lisent par `retours_evenement`,
--     réservée à l'organisation de l'activité — c'est à elle qu'ils sont
--     adressés. Chacun écrit toujours sa propre note (policy UPDATE « ma
--     ligne », intacte).
--  ④ `anon` perd TOUT droit de table sur `event_attendees` (il tenait DELETE,
--     TRUNCATE, REFERENCES, TRIGGER et MAINTAIN, sans SELECT ni policy utile) :
--     défense en profondeur.
--  ⑤ NOUVELLE GARDE `trg_event_attendees_etat` : une inscription (INSERT, ou
--     UPDATE qui CHANGE `rsvp` OU `event_id`) vers tout état autre que
--     « declined » est refusée sur une activité ANNULÉE (`activite_annulee`) ou
--     PASSÉE (`activite_passee`) — mêmes motifs, même définition de « passée »
--     que la garde de capacité, qui ne tient que le passage à « going ».
--  ⑥ LA DISCUSSION D'ACTIVITÉ (`evgrp_<id>`) suit la même règle : on n'y entre
--     qu'en venant ou en organisant, un membre bloqué n'y est pas montré, et
--     ceux qui n'y ont plus droit en sortent (voir le bloc ⑥).
--
-- CE QUE LES CONTRE-REVUES ONT FERMÉ (la première version de ce fichier) :
--  · CONTOURNEMENT PAR « PEUT-ÊTRE » : la branche co-inscrit s'ouvrait à tout
--    état hors « declined ». La garde de capacité ne tenant que « going », un
--    compte s'écrivait « maybe » ou « waitlist » sur n'importe quelle activité
--    — passée, annulée ou complète comprises —, lisait la liste entière avec
--    les heures de pointage, puis effaçait sa ligne. Désormais la branche
--    demande « going » (`vient_a_activite`, qui remplace `inscrit_a_activite`)
--    et ⑤ refuse « maybe » / « waitlist » sur une activité passée ou annulée.
--  · SUIVI EN UN CLIC : suivre un profil PUBLIC est accepté d'office ; la
--    branche « je le suis » livrait donc tout l'historique de présence d'une
--    personne à quiconque appuyait sur « Suivre ». Elle exige maintenant la
--    réciprocité, que la personne suivie est seule à pouvoir accorder.
--  · BLOCAGES : bloquer quelqu'un ne l'empêchait pas de lire où l'on va.
--  · ORACLE DIFFÉRENTIEL SUR LES NOTES : avec 1 note, la moyenne EST la note
--    de quelqu'un ; avec 2, un participant qui connaît la sienne déduit celle
--    de l'autre. Sous 3 notes, la moyenne reste nulle (le nombre est donné),
--    sauf pour l'organisation, qui lit de toute façon chaque retour. Ne
--    comptent que les notes de participants (« going » ou pointés, la règle
--    même de `_canRateEvent` côté client) : sans cela, deux comptes jetables
--    écrits « declined » sur l'activité passée (toujours permis, c'est un
--    retrait) suffisaient à franchir le seuil et à lire la note isolée.
--  · `anon` : seul DELETE était retiré ; le verdict ne contrôlait que SELECT et
--    DELETE — il aurait imprimé OK avec TRUNCATE encore en place. Il contrôle
--    maintenant CHAQUE privilège (MAINTAIN à partir de PostgreSQL 17).
--  · DÉPLACER UNE LIGNE (troisième revue) : la garde d'état sortait sur « rsvp
--    inchangé » — un UPDATE qui DÉPLACE une ligne « going » vers une AUTRE
--    activité (passée, annulée) garde son rsvp, et passait. La capacité sort de
--    même (`old.rsvp = 'going'`) : seul `trg_event_attendees_figes` (ASTRA-35,
--    « une inscription ne change ni d'activité ni de compte ») l'arrêtait, et
--    rien ici ne le disait. La sortie exige désormais la MÊME activité, et le
--    verdict exige `trg_event_attendees_figes` présent et actif : c'est lui
--    seul qui tient le déplacement vers une activité COMPLÈTE à venir.
--
-- RISQUE RÉSIDUEL, dit tel quel :
--  · S'inscrire « going » à une activité À VENIR et non complète révèle ses
--    co-inscrits : c'est la fonctionnalité (les participants se voient entre
--    eux). Un compte peut le faire par l'API puis se retirer ; la notification
--    à l'organisation étant écrite par le CLIENT, une inscription faite à l'API
--    brute n'en laisse aucune — l'organisation ne la voit que dans sa liste,
--    tant que la ligne existe. Une activité sans capacité (`max_attendees`
--    nul) n'est jamais complète.
--  · Au-delà de 3 notes, suivre la moyenne dans le temps révèle la note du
--    dernier arrivé (agrégat différentiel) : le seuil retire l'oracle immédiat,
--    pas celui de l'observation patiente ; des comptes inscrits « going » AVANT
--    la fin peuvent encore peser sur l'agrégat.
--  · Un compte qui suit MUTUELLEMENT une personne voit où elle va : c'est le
--    sens de la réciprocité, qu'elle seule peut accorder ou retirer.
--
-- ORDRE DE DÉPLOIEMENT : LE CLIENT D'ABORD (PR de l'audit, 2026-11-03), fusionné
-- et SERVI par https://passio-app.netlify.app avant que cette migration parte.
-- Il lit les compteurs par la RPC quand elle existe, retombe sur la liste
-- sinon ; il ne demande plus jamais `select *` sur cette table (un RETURNING *
-- demanderait les colonnes retirées et PostgREST refuserait l'UPDATE entier,
-- 42501) ; il reconnaît `activite_passee` / `activite_annulee` pour TOUS les
-- états (`_motifRefusRsvp`, app-08, lit le même message que la capacité) ; et il
-- doit lire `avg: null` comme « pas encore de moyenne », jamais comme 0.
-- ⚠️ « SERVI » NE SUFFIT PAS : une PWA installée restée ouverte garde l'ANCIEN
-- code jusqu'à son prochain rechargement. Sur ces appareils, l'ancien
-- `.select()` de l'inscription (RETURNING *) prendrait 42501 (« Inscription non
-- enregistrée ») et l'ancienne lecture des notes poserait le mémo de refus des
-- participants pour la session. Attendre 48 h après le job « Déploiement
-- production » avant d'appliquer cette migration.
--
-- PIÈGE ÉVITÉ : une policy qui interroge SA PROPRE table (« suis-je inscrit ? »)
-- déclenche « infinite recursion detected in policy » — d'où les deux helpers
-- SECURITY DEFINER `vient_a_activite` / `organise_activite`, qui ne parlent
-- que de l'APPELANT (aucun oracle sur autrui), comme `is_conv_member`.
--
-- Rejouable (idempotent) ; verdict en fin. RETOUR ARRIÈRE (dans une transaction) :
--   drop trigger if exists trg_event_attendees_etat on public.event_attendees;
--   drop function if exists public.event_attendees_etat_garde();
--   drop policy if exists event_attendees_select_lien on public.event_attendees;
--   drop function if exists public.vient_a_activite(text);
--   create policy event_attendees_select_authentifie on public.event_attendees for select to authenticated using (true);
--   grant select on public.event_attendees to authenticated;
--   ⑥ : recréer `can_join_event_conversation` avec `AND a.rsvp IN ('going', 'maybe')`
--   à la place de la ligne C-04 (texte de production dans le bloc ⑥ ci-dessous) ;
--   drop policy if exists conv_members_select_member on public.conv_members;
--   create policy conv_members_select_member on public.conv_members for select to authenticated
--     using (public.is_conv_member(conv_id, (select auth.uid())::text));
--   (les membres retirés des discussions d'activité ne se rendent pas : 0 mesuré)
--   (les RPC et `organise_activite` peuvent rester : sans appelant, elles sont
--   inertes ; les droits d'`anon` ne se rendent pas — aucun n'était utilisé)
-- ═════════════════════════════════════════════════
begin;

-- ── Helpers : ne parlent que de l'appelant ──────────────────────────────────
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

-- « J'y VIENS » : ma ligne en « going », et rien d'autre. « peut-être » et
-- « liste d'attente » ne coûtent rien (la capacité ne les garde pas) : ils
-- n'ouvrent donc pas la liste.
create or replace function public.vient_a_activite(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.event_attendees a
    where a.event_id = p_event_id
      and a.user_id = (select auth.uid())::text
      and a.rsvp = 'going'
  );
$$;
revoke all on function public.vient_a_activite(text) from public, anon;
grant execute on function public.vient_a_activite(text) to authenticated;

-- ── ① La liste suit le lien ─────────────────────────────────────────────────
drop policy if exists event_attendees_select_authentifie on public.event_attendees;
drop policy if exists event_attendees_select_lien on public.event_attendees;
-- L'ancien helper (première version de ce fichier, jamais appliquée en
-- production) s'ouvrait à « maybe » / « waitlist » : il part, APRÈS la policy
-- qui pouvait encore en dépendre.
drop function if exists public.inscrit_a_activite(text);
create policy event_attendees_select_lien on public.event_attendees
  for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or public.organise_activite(event_id)
    or (
      rsvp is distinct from 'declined'
      and not public.is_blocked_with(event_attendees.user_id)
      and (
        public.vient_a_activite(event_id)
        or (
          exists (
            select 1 from public.follows f
            where f.follower_id = (select auth.uid())::text
              and f.following_id = event_attendees.user_id
              and f.status = 'accepted'
          )
          and exists (
            select 1 from public.follows r
            where r.follower_id = event_attendees.user_id
              and r.following_id = (select auth.uid())::text
              and r.status = 'accepted'
          )
        )
      )
    )
  );

-- ── ⑤ Pas d'inscription sur une activité passée ou annulée ──────────────────
-- Fonction NEUVE, à côté de `event_attendees_capacite_gardee` (qui reste telle
-- quelle et tranche toujours le passage à « going », complet compris). Mêmes
-- motifs, même définition de « passée », même sortie sans session. Un UPDATE
-- qui GARDE son `rsvp` ET son activité (pointage par `pointer_par_code`, note,
-- retour écrit) n'est pas une inscription : il passe, même après la fin. Se
-- retirer (« declined ») passe toujours.
create or replace function public.event_attendees_etat_garde()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  -- Aucune session (postgres, service_role, tâches d'administration) : la règle
  -- ne s'applique pas — même sortie que `event_attendees_capacite_gardee`.
  if auth.uid() is null then return new; end if;
  if new.rsvp = 'declined' then return new; end if;
  -- ⚠️ « rsvp inchangé » ne suffit pas : déplacer une ligne « going » vers une
  -- autre activité (passée, annulée) garde son rsvp. C'est une inscription à
  -- l'activité d'arrivée, jugée comme telle — sans compter sur la seule garde
  -- `trg_event_attendees_figes` (exigée au verdict, voir plus bas).
  if tg_op = 'UPDATE' and new.rsvp is not distinct from old.rsvp
     and new.event_id is not distinct from old.event_id then return new; end if;

  select status, date_at, end_at into ev from public.events where id = new.event_id;
  -- Activité inconnue : la clé étrangère tranche (23503), pas cette garde.
  if not found then return new; end if;
  if ev.status = 'cancelled' then
    raise exception 'activite_annulee' using errcode = 'P0001';
  end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then
    raise exception 'activite_passee' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.event_attendees_etat_garde() from public, anon, authenticated;
drop trigger if exists trg_event_attendees_etat on public.event_attendees;
create trigger trg_event_attendees_etat
  before insert or update on public.event_attendees
  for each row execute function public.event_attendees_etat_garde();

-- ── ③ Colonnes de retour d'expérience retirées à la lecture directe ─────────
revoke select on public.event_attendees from authenticated;
grant select (event_id, user_id, rsvp, created_at, checked_in_at) on public.event_attendees to authenticated;
-- ── ④ anon : plus aucun droit de table (aucune policy ne lui en ouvrait) ────
revoke all on public.event_attendees from anon;

-- ── ② Le nombre reste public parmi les connectés ────────────────────────────
-- Même lecture que le client : « going » = tout ce qui n'est ni peut-être, ni
-- attente, ni refus ; « pointés » = une heure de pointage posée.
create or replace function public.participants_compte(p_event_ids text[])
returns table (event_id text, going integer, maybe integer, waitlist integer, checked_in integer)
language sql stable security definer set search_path = ''
as $$
  select a.event_id,
         count(*) filter (where coalesce(a.rsvp, 'going') not in ('maybe', 'waitlist', 'declined'))::integer,
         count(*) filter (where a.rsvp = 'maybe')::integer,
         count(*) filter (where a.rsvp = 'waitlist')::integer,
         count(*) filter (where a.checked_in_at is not null)::integer
  from public.event_attendees a
  where auth.uid() is not null
    and a.event_id = any (p_event_ids[1:200])
  group by a.event_id;
$$;
revoke all on function public.participants_compte(text[]) from public, anon;
grant execute on function public.participants_compte(text[]) to authenticated;

-- Moyenne et nombre de notes : l'agrégat, jamais qui a noté quoi.
-- ⚠️ ORACLE DIFFÉRENTIEL : avec 1 note, la moyenne EST la note de quelqu'un ;
-- avec 2, un participant qui connaît la sienne lit celle de l'autre. Sous 3
-- notes, `avg` reste nul (le nombre est donné) — sauf pour l'organisation, qui
-- lit déjà chaque retour par `retours_evenement`. `avg` nul = « pas de moyenne
-- publiable », jamais 0.
-- Ne comptent que les notes de PARTICIPANTS (« going » ou pointés, la règle de
-- `_canRateEvent`) : une ligne « declined » s'écrit encore sur une activité
-- passée (c'est un retrait) et peut porter une note ; deux comptes jetables
-- auraient sinon suffi à franchir le seuil et à isoler la note d'autrui.
create or replace function public.notes_evenement(p_event_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is null then null
    else (
      select jsonb_build_object(
        'avg', case when n.nb >= 3 or public.organise_activite(p_event_id) then n.moyenne end,
        'count', n.nb)
      from (
        select count(*)::integer as nb, avg(a.rating)::numeric(4,2) as moyenne
        from public.event_attendees a
        where a.event_id = p_event_id
          and a.rating is not null
          and (a.rsvp = 'going' or a.checked_in_at is not null)
      ) n)
  end;
$$;
revoke all on function public.notes_evenement(text) from public, anon;
grant execute on function public.notes_evenement(text) to authenticated;

-- Les retours écrits, pour l'organisation seulement (c'est à elle qu'ils sont adressés).
create or replace function public.retours_evenement(p_event_id text)
returns table (user_id text, rating smallint, feedback text, rated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.user_id, a.rating, a.feedback, a.rated_at
  from public.event_attendees a
  where public.organise_activite(p_event_id)
    and a.event_id = p_event_id
    and (a.rating is not null or nullif(btrim(a.feedback), '') is not null)
  order by a.rated_at desc nulls last;
$$;
revoke all on function public.retours_evenement(text) from public, anon;
grant execute on function public.retours_evenement(text) to authenticated;

-- ── ⑥ La discussion d'activité suit la même règle (troisième contre-revue) ──
-- Mesuré au banc avec les définitions de PRODUCTION : `can_join_event_conversation`
-- laissait entrer un « peut-être » — même sur une activité COMPLÈTE (la
-- capacité ne garde que « going »), même pour un compte bloqué par un venant
-- (seul le blocage avec l'AUTEUR était regardé) —, et `conv_members_select_member`
-- montre TOUS les membres à tout membre. Le client inscrivant d'office chaque
-- venant à `evgrp_<id>`, la liste nominative revenait par la discussion, en
-- un geste. Désormais :
--   · on n'y entre qu'en VENANT (« going », la règle de `vient_a_activite`) ou
--     en organisant (`organise_activite`) — le reste de la fonction est celui
--     de production, mot pour mot (discussion créée par l'auteur ou un
--     co-organisateur, activité active, pas de blocage avec l'auteur, accès
--     adulte) ;
--   · dans une discussion d'activité, un membre bloqué (dans un sens ou dans
--     l'autre) n'est pas MONTRÉ — comme la liste elle-même ;
--   · les membres actuels qui n'y ont plus droit en sortent. Mesuré au canal ①
--     le 2026-11-03 : 2 membres dans 2 discussions d'activité, tous deux
--     organisation — 0 ligne retirée attendue.
-- Résidu, dit tel quel : un venant qui repasse « peut-être » par l'API brute
-- sans quitter la discussion y reste (le client la quitte, `_leaveEventConversation`) :
-- il a vu la liste en venant, et peut redevenir venant tant qu'il reste une place.
create or replace function public.can_join_event_conversation(_conv_id text)
returns boolean
language sql stable security definer set search_path to ''
as $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.events e
        JOIN public.event_attendees a
          ON a.event_id = e.id
         AND a.user_id = (auth.uid())::text
        JOIN public.conversations c
          ON c.id = e.conv_id
       WHERE e.conv_id = _conv_id
         AND e.conv_id = ('evgrp_' || e.id)
         -- IRL-10 : l'auteur OU un co-organisateur a pu créer la discussion.
         AND (c.created_by = e.author_id
              OR (e.co_organizers IS NOT NULL
                  AND jsonb_typeof(e.co_organizers) = 'array'
                  AND e.co_organizers ? c.created_by))
         AND e.status = 'active'
         -- C-04 : « going » seul, ou l'organisation — jamais « maybe ».
         AND (a.rsvp = 'going' OR public.organise_activite(e.id))
         AND NOT public.is_blocked_with(e.author_id)
         AND public.adult_access_allowed()
    )
  END
$$;

drop policy if exists conv_members_select_member on public.conv_members;
create policy conv_members_select_member on public.conv_members
  for select to authenticated
  using (
    public.is_conv_member(conv_id, (select auth.uid())::text)
    and (
      left(conv_id, 6) <> 'evgrp_'
      or user_id = (select auth.uid())::text
      or not public.is_blocked_with(conv_members.user_id)
    )
  );

delete from public.conv_members cm
 using public.events e
 where e.conv_id = cm.conv_id
   and cm.conv_id = 'evgrp_' || e.id
   and cm.user_id is distinct from e.author_id
   and cm.user_id is distinct from e.organizer_id
   and not (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array' and e.co_organizers ? cm.user_id)
   and not exists (select 1 from public.conversations c where c.id = cm.conv_id and c.created_by = cm.user_id)
   and not exists (select 1 from public.event_attendees a
                    where a.event_id = e.id and a.user_id = cm.user_id and a.rsvp = 'going');

-- ── Verdict ──
-- Chaque ligne MESURE ce qu'elle affirme : un privilège non nommé ici n'est pas
-- contrôlé, d'où la liste complète pour `anon` (MAINTAIN n'existe qu'à partir de
-- PostgreSQL 17 : le CASE ne l'évalue que là — un OR n'a pas d'ordre garanti).
select 'event_attendees SELECT : une seule policy, par lien (soi, organisation, venant, suivi MUTUEL, blocages exclus)' as controle,
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and cmd = 'SELECT') = 1
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') like '%organise_activite%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') like '%vient_a_activite%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') like '%is_blocked_with%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') like '%follows%follows%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') not like '%inscrit_a_activite%'
             and to_regprocedure('public.inscrit_a_activite(text)') is null then 'OK' else 'ECHEC' end as valeur
union all select 'event_attendees : garde d''état (passée / annulée) BEFORE INSERT OR UPDATE, à côté de la capacité',
       case when exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                         where t.tgrelid = 'public.event_attendees'::regclass and t.tgname = 'trg_event_attendees_etat'
                           and p.proname = 'event_attendees_etat_garde' and t.tgenabled = 'O'
                           and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16
                           and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""')
             and exists (select 1 from pg_trigger t where t.tgrelid = 'public.event_attendees'::regclass
                           and t.tgname = 'trg_event_attendees_capacite' and t.tgenabled = 'O') then 'OK' else 'ECHEC' end
-- ⚠️ La garde d'état juge un déplacement vers une activité passée ou annulée ;
-- vers une activité COMPLÈTE à venir, ni elle ni la capacité (qui sort sur
-- `old.rsvp = 'going'`) ne disent rien : `trg_event_attendees_figes` (ASTRA-35)
-- est le seul verrou, d'où cette ligne. Actif = « O » (origine) ou « A »
-- (toujours) : un déclencheur « R » ne part qu'en réplication, donc jamais pour
-- une requête PostgREST — `<> 'D'` imprimerait OK sur un verrou qui ne joue pas.
-- Le corps est lu aussi : un déclencheur de ce nom qui ne compare plus
-- `event_id` ne fige rien.
union all select 'event_attendees : trg_event_attendees_figes actif (une inscription ne change ni d''activité ni de compte — seul verrou d''un déplacement vers une activité complète)',
       case when exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                         where t.tgrelid = 'public.event_attendees'::regclass and t.tgname = 'trg_event_attendees_figes'
                           and p.proname = 'event_attendees_figes' and t.tgenabled in ('O', 'A')
                           and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16
                           and p.prosrc ilike '%new.event_id is distinct from old.event_id%') then 'OK' else 'ECHEC' end
union all select 'event_attendees : feedback / rating / rated_at illisibles par authenticated, les 5 autres colonnes lisibles',
       case when not has_column_privilege('authenticated', 'public.event_attendees', 'feedback', 'SELECT')
             and not has_column_privilege('authenticated', 'public.event_attendees', 'rating', 'SELECT')
             and not has_column_privilege('authenticated', 'public.event_attendees', 'rated_at', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'event_id', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'user_id', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'rsvp', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'created_at', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'checked_in_at', 'SELECT') then 'OK' else 'ECHEC' end
union all select 'event_attendees : INSERT / UPDATE / DELETE d''authenticated intacts, anon sans AUCUN droit (table et colonnes)',
       case when has_table_privilege('authenticated', 'public.event_attendees', 'INSERT')
             and has_table_privilege('authenticated', 'public.event_attendees', 'UPDATE')
             and has_table_privilege('authenticated', 'public.event_attendees', 'DELETE')
             and not has_table_privilege('anon', 'public.event_attendees', 'SELECT')
             and not has_table_privilege('anon', 'public.event_attendees', 'INSERT')
             and not has_table_privilege('anon', 'public.event_attendees', 'UPDATE')
             and not has_table_privilege('anon', 'public.event_attendees', 'DELETE')
             and not has_table_privilege('anon', 'public.event_attendees', 'TRUNCATE')
             and not has_table_privilege('anon', 'public.event_attendees', 'REFERENCES')
             and not has_table_privilege('anon', 'public.event_attendees', 'TRIGGER')
             and not has_any_column_privilege('anon', 'public.event_attendees', 'SELECT')
             and not has_any_column_privilege('anon', 'public.event_attendees', 'INSERT')
             and not has_any_column_privilege('anon', 'public.event_attendees', 'UPDATE')
             and not has_any_column_privilege('anon', 'public.event_attendees', 'REFERENCES')
             and case when current_setting('server_version_num')::int >= 170000
                      then not has_table_privilege('anon', 'public.event_attendees', 'MAINTAIN')
                      else true end then 'OK' else 'ECHEC' end
union all select 'cinq fonctions SECURITY DEFINER à search_path vide, les RPC exécutables par authenticated seul',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in ('participants_compte', 'notes_evenement', 'retours_evenement', 'organise_activite', 'vient_a_activite')
                    and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""') = 5
             and has_function_privilege('authenticated', 'public.participants_compte(text[])', 'execute')
             and has_function_privilege('authenticated', 'public.notes_evenement(text)', 'execute')
             and has_function_privilege('authenticated', 'public.retours_evenement(text)', 'execute')
             and not has_function_privilege('anon', 'public.participants_compte(text[])', 'execute')
             and not has_function_privilege('anon', 'public.notes_evenement(text)', 'execute')
             and not has_function_privilege('anon', 'public.retours_evenement(text)', 'execute')
             and not has_function_privilege('anon', 'public.vient_a_activite(text)', 'execute')
             and not has_function_privilege('anon', 'public.organise_activite(text)', 'execute') then 'OK' else 'ECHEC' end
union all select 'discussion d''activité : on n''y entre qu''en venant (« going ») ou en organisant, et un membre bloqué n''y est pas montré',
       case when (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.can_join_event_conversation(text)')) like '%a.rsvp = ''going'' OR public.organise_activite(e.id)%'
             and (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.can_join_event_conversation(text)')) not like '%''maybe''%'
             and (select p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""' from pg_proc p where p.oid = to_regprocedure('public.can_join_event_conversation(text)'))
             and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'conv_members' and cmd = 'SELECT') = 1
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'conv_members' and policyname = 'conv_members_select_member') like '%is_conv_member%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'conv_members' and policyname = 'conv_members_select_member') like '%evgrp\_%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'conv_members' and policyname = 'conv_members_select_member') like '%is_blocked_with%'
             and (select roles::text from pg_policies where schemaname = 'public' and tablename = 'conv_members' and policyname = 'conv_members_select_member') = '{authenticated}' then 'OK' else 'ECHEC' end
union all select 'discussion d''activité : aucun membre hors organisation, créateur ou venant',
       case when not exists (
         select 1 from public.conv_members cm join public.events e on e.conv_id = cm.conv_id and cm.conv_id = 'evgrp_' || e.id
          where cm.user_id is distinct from e.author_id and cm.user_id is distinct from e.organizer_id
            and not (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array' and e.co_organizers ? cm.user_id)
            and not exists (select 1 from public.conversations c where c.id = cm.conv_id and c.created_by = cm.user_id)
            and not exists (select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = cm.user_id and a.rsvp = 'going')
       ) then 'OK' else 'ECHEC' end;

commit;
