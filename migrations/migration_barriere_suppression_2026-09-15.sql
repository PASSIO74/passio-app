-- ═══════════════════════════════════════════════════════════════════════════
-- SUPPRESSION DE COMPTE — la barrière, version 2
-- (ASTRA-25, quatrième contre-revue · ASTRA-39 / 40 / 41 / 42, cinquième
-- contre-revue indépendante, 2026-09-15 · AUTH-05 / SUP-10)
--
-- ⚠️ CE FICHIER REMPLACE LA VERSION 1 DU MÊME NOM, qui n'a JAMAIS été appliquée
-- ailleurs que sur des bases jetables (git en garde le texte). Il est REJOUABLE
-- sur une base vierge comme sur une base où la v1 aurait été jouée.
--
-- LE DÉFAUT D'ORIGINE (ASTRA-25). `purgerCompte` efface, RELIT, ré-efface :
-- c'est une passe de plus, pas une barrière. Une écriture arrivée APRÈS le
-- comptage de sa table et AVANT la relecture finale survit, et « supprimer mon
-- compte » répond `ok`. La v1 marquait le compte dans `comptes_en_suppression`
-- et faisait lire cette marque par les policies d'ÉCRITURE de l'appelant.
--
-- CE QUE LA CINQUIÈME CONTRE-REVUE A MONTRÉ, ET QUE CETTE VERSION CORRIGE :
--
--   ASTRA-39 — la liste des tables durcies OMETTAIT quatre tables de la purge
--   (`passion_quotas`, `client_errors`, `analytics_events`, `telemetry_events`).
--   Et un prédicat borné à `auth.uid()` ne voit QUE l'appelant : il est aveugle
--   à une écriture d'UN TIERS qui vise le compte (B suit A → `follows.following_id`,
--   B notifie A → `notifications.user_id`, B invite A → `call_invites.to_id`, B
--   ajoute A comme collaborateur…), à une écriture SANS SESSION (`client_errors`
--   accepte l'anonyme avec `uid` libre), et à une écriture PRIVILÉGIÉE (le
--   trigger `follows_notifier`, SECURITY DEFINER, écrit `notifications` pour la
--   cible en contournant la RLS ; `plafond.js` écrit `analytics_events` avec
--   la clé de service). → UN TRIGGER `before insert or update` SUR CHAQUE TABLE
--   DE LA PURGE, qui teste TOUTES les colonnes portant un identifiant de compte
--   contre le marqueur, POUR TOUS LES RÔLES. La clause de policy de la v1 est
--   conservée (défense en profondeur, elle refuse plus tôt) et étendue.
--
--   ASTRA-40 — deux purges du même compte partageaient UNE ligne, et une
--   tentative échouée la RETIRAIT sans vérifier qu'elle la possédait encore :
--   A échoue tard et retire la marque posée entre-temps par B, une écriture
--   passe, B répond ok. → UN ÉTAT DURABLE PAR TENTATIVE (`jeton`, `statut`),
--   une RÉCLAMATION SÉRIALISÉE par compte (`reclamer_suppression`, verrou
--   consultatif + statut), un RETRAIT CONDITIONNEL (`terminer_suppression` ne
--   touche la ligne que si le jeton est le sien). Une tentative échouée passe
--   la ligne en `echec` — elle ne l'efface plus : le marqueur ne bloque que les
--   statuts `en_cours`, `purgee` et `supprimee`.
--
--   ASTRA-41 — une écriture ENGAGÉE avant la marque (policy franchie,
--   transaction ouverte) reste invisible aux comptages puis valide après eux.
--   Reproduit sur PostgreSQL réel, deux connexions
--   (`tests/sql/ecriture-en-vol-suppression.test.sh`). → `attendre_ecritures_en_vol()`
--   relève, juste après la marque, les transactions EN COURS à cet instant
--   (`pg_current_snapshot()`), et attend leur fin (`pg_xact_status`). La purge
--   l'appelle avant tout effacement ; s'il en reste au délai, elle ÉCHOUE.
--   ⚠️ Limite dite : une transaction qui n'a pas encore écrit (pas de xid) n'est
--   pas dans l'instantané ; en READ COMMITTED (PostgREST) son premier ordre
--   d'écriture relira la marque et sera refusé. Une session en REPEATABLE READ
--   ouverte avant la marque et qui écrit ensuite échappe aux deux — ce n'est
--   pas un chemin client (PostgREST ne l'offre pas), c'est un chemin opérateur.
--
--   ASTRA-42 — l'absence de cette infrastructure était annoncée par une NOTE
--   que le handler jetait : HTTP 200 `ok:true`. C'est côté fonction que ça se
--   corrige (`delete-account` refuse désormais en 503 sans barrière) ; ici, la
--   présence des quatre fonctions est ce que la fonction VÉRIFIE en s'en servant.
--
-- CE QUE LA SIXIÈME CONTRE-REVUE A MONTRÉ (ASTRA-56, 2026-09-16), ET QUE CETTE
-- VERSION 3 CORRIGE — un entrelacement rejoué avec les vraies fonctions :
--   A termine sa purge et pose `purgee` ; A attend encore la suppression Auth.
--   B réclame : la v2 lui DONNAIT le marqueur (« `purgee` est reprenable »).
--   B échoue à attendre les écritures en vol et pose `echec` : la v2 LEVAIT la
--   protection. Une ligne `user_state` est écrite. A finit Auth, son jeton ne
--   peut plus finaliser (`jeton_perime`) — et le handler annonçait quand même
--   `garantie:"barriere"`. Résultat : marqueur `echec`, une ligne restante.
--   Trois règles, ici :
--   ① UNE TENTATIVE VIVANTE N'EST PAS REPRENABLE, QUEL QUE SOIT SON STATUT.
--      `tentative_vivante` est posé à la réclamation et RESTE vrai après
--      `purgee` (la tentative continue : deleteUser). Il ne tombe qu'à un
--      événement TERMINAL (`echec`, `auth_echec`, `supprimee`) ou par
--      péremption (`p_perime`, 15 min — une fonction Edge vit ~150 s).
--   ② LA PROTECTION D'UN COMPTE DONT LES DONNÉES SONT PARTIES NE SE LÈVE JAMAIS.
--      `echec` demandé sur une ligne où `purge_terminee_le` est posé →
--      statut `purgee`, pas `echec`. Il n'existe plus de transition
--      purgee → echec.
--   ③ UN ÉCHEC D'AUTH EST UN ÉVÉNEMENT NOMMÉ (`auth_echec`) : statut `purgee`,
--      tentative TERMINÉE (reprenable tout de suite, sans attendre 15 min),
--      erreur conservée. La v2 laissait la ligne `purgee` sans rien dire de
--      la tentative.
--   Et côté fonction : une finalisation refusée (`jeton_perime` après
--   deleteUser) ne produit plus `garantie:"barriere"` — elle rend l'état RÉEL
--   du marqueur, lu dans la réponse SQL, sous un code distinct.
--
-- RÉTENTION DU MARQUEUR (décision documentée, pas devinée) :
--   · pendant la purge : `en_cours`, indispensable ;
--   · après la purge et AVANT la suppression Auth : `purgee` — la protection est
--     CONSERVÉE (c'est le cas « deleteUser échoue après une purge réussie ») ;
--   · après la suppression Auth : `supprimee`, conservé. Un jeton d'accès déjà
--     signé reste valide jusqu'à son `exp` (PostgREST ne demande rien à GoTrue) ;
--     le renouvellement, lui, s'arrête à la suppression Auth (les sessions et
--     jetons de rafraîchissement sont emportés avec `auth.users` — schéma
--     GoTrue, `on delete cascade` ; NON MESURÉ sur la cible, à confirmer). Et
--     une RESTAURATION d'une sauvegarde antérieure recréerait les données du
--     compte : le trigger refuse ces lignes tant que le marqueur existe. Les
--     artefacts de sauvegarde vivent 30 jours (`sauvegarde.yml`). La borne
--     basse de rétention est donc max(durée des jetons d'accès, 30 jours de
--     sauvegardes) ; `purger_marqueurs_suppression(interval)` existe pour
--     l'appliquer, et N'EST PAS PLANIFIÉE ICI : la durée est une décision du
--     responsable de traitement (proposition : 45 jours), et on ne retire pas
--     une protection pour faire baisser un compteur.
--
-- CE QUI NE CHANGE PAS : aucun oracle. `suppression_de_mon_compte()` ne prend
-- aucun argument ; le marqueur est illisible pour `anon` et `authenticated` ;
-- le trigger REFUSE avec le message et le code d'un refus RLS (42501), pour
-- qu'un tiers ne distingue pas « en suppression » d'un refus ordinaire. DELETE
-- reste libre (la purge doit effacer, la personne doit pouvoir se retirer).
-- ⚠️ La purge elle-même (service_role) n'écrit que des DELETE : le trigger ne
-- la concerne pas. Une RESTAURATION qui réinsère des lignes d'un compte marqué
-- est refusée : c'est voulu (`docs/RESTAURATION.md` → conflit à trancher).
--
-- Rejouable. Verdict en fin. Retour arrière :
--   drop function if exists public.attendre_ecritures_en_vol(integer),
--     public.reclamer_suppression(text, uuid, text, interval),
--     public.terminer_suppression(text, uuid, text, jsonb),
--     public.purger_marqueurs_suppression(interval);
--   -- pour chaque table : drop trigger if exists zz_barriere_suppression on public.<t>;
--   drop function if exists public.refuser_ecriture_compte_en_suppression();
--   -- retirer la clause des policies (idempotente), puis :
--   drop function if exists public.suppression_de_mon_compte();
--   drop table if exists public.comptes_en_suppression;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ① Le marqueur, avec un ÉTAT ──────────────────────────────────────────────
create table if not exists public.comptes_en_suppression (
  user_id     text primary key,
  demandee_le timestamptz not null default now(),
  motif       text
);
-- Colonnes de la v2 (idempotent sur une base v1).
alter table public.comptes_en_suppression
  add column if not exists statut            text        not null default 'en_cours',
  add column if not exists jeton             uuid,
  add column if not exists tentatives        integer     not null default 0,
  add column if not exists tentative_debut   timestamptz,
  add column if not exists tentative_fin     timestamptz,
  add column if not exists purge_terminee_le timestamptz,
  add column if not exists supprimee_le      timestamptz,
  add column if not exists derniere_erreur   jsonb;
-- v3 (ASTRA-56) : la tentative est-elle encore VIVANTE ? Posée à la
-- réclamation, conservée après `purgee`, retirée par un événement terminal.
-- Sur une base v2, la colonne naît ici : une ligne `en_cours` y est réputée
-- vivante (sa péremption la rendra reprenable), une ligne `purgee` v2 n'a pas
-- de tentative en vol connue → reprenable, comme en v2.
do $$
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.comptes_en_suppression'::regclass
                    and attname = 'tentative_vivante' and not attisdropped) then
    alter table public.comptes_en_suppression add column tentative_vivante boolean not null default false;
    update public.comptes_en_suppression set tentative_vivante = (statut = 'en_cours');
  end if;
end $$;
-- Une ligne héritée de la v1 (sans jeton) ne peut être qu'un compte déjà purgé
-- et conservé : elle prend le statut correspondant. (La v1 n'a été jouée nulle
-- part ailleurs que sur des bancs ; ceci est de la ceinture.)
update public.comptes_en_suppression set statut = 'supprimee', supprimee_le = coalesce(supprimee_le, demandee_le), tentative_vivante = false
 where jeton is null and statut = 'en_cours';
alter table public.comptes_en_suppression drop constraint if exists comptes_en_suppression_statut_check;
alter table public.comptes_en_suppression
  add constraint comptes_en_suppression_statut_check check (statut in ('en_cours', 'echec', 'purgee', 'supprimee'));
alter table public.comptes_en_suppression enable row level security;
-- Aucune policy, aucun GRANT client : `anon` et `authenticated` n'y accèdent
-- JAMAIS. Son inaccessibilité EST sa protection (même patron qu'`access_policies`).
-- Et le client de service n'y touche plus DIRECTEMENT non plus : tout passe par
-- les fonctions ci-dessous, qui portent la règle (jeton, statut, sérialisation).
revoke all on public.comptes_en_suppression from public;
revoke all on public.comptes_en_suppression from anon;
revoke all on public.comptes_en_suppression from authenticated;
revoke all on public.comptes_en_suppression from service_role;
grant select on public.comptes_en_suppression to service_role;   -- lecture (diagnostic), pas d'écriture directe

-- ② Le prédicat, borné à l'appelant ───────────────────────────────────────
create or replace function public.suppression_de_mon_compte()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false          -- postgres, service_role, purge, restauration
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text
                    and c.statut in ('en_cours', 'purgee', 'supprimee'))
  end
$$;
comment on function public.suppression_de_mon_compte() is
  'Le compte APPELANT est-il en cours de suppression (ou supprimé et retenu) ? Ne répond jamais sur un autre compte (ASTRA-25).';
revoke execute on function public.suppression_de_mon_compte() from public;
-- ⚠️ `anon` DOIT pouvoir l'appeler (changement par rapport à la v1, mesuré au
-- banc) : la clause est posée dans des policies `to public` qui ADMETTENT
-- l'anonyme (`client_errors`, `telemetry_events` avec `user_id` nul). Sans
-- EXECUTE, ces écritures échouent en « permission denied for function » — une
-- régression, pas une protection. Sans session la fonction rend `false` et ne
-- prend aucun argument : l'ouvrir à `anon` n'ouvre aucun oracle.
grant execute on function public.suppression_de_mon_compte() to anon;
grant execute on function public.suppression_de_mon_compte() to authenticated;
grant execute on function public.suppression_de_mon_compte() to service_role;

-- ③ LA LISTE DES TABLES ET COLONNES DE LA PURGE ────────────────────────────
-- ⚠️ C'EST LA COPIE SQL DE `TABLES_COMPTE` (supabase/functions/_shared/purge-compte.js).
-- Deux contrôles INDÉPENDANTS de cette copie la comparent à l'original :
--   · `tests/unit/purge-compte.test.mjs` (« couverture ») lit les deux listes ;
--   · `tests/sql/migration-barriere-suppression.test.sh` construit son socle
--     DEPUIS `TABLES_COMPTE` et vérifie qu'un trigger couvre chaque colonne.
create temporary table _colonnes_compte (t text, c text) on commit drop;
insert into _colonnes_compte values
    ('posts', 'author_id'),
    ('post_likes', 'user_id'),
    ('post_comments', 'author_id'),
    ('post_collaborators', 'user_id'),
    ('post_collaborators', 'added_by'),
    ('comment_interactions', 'user_id'),
    ('comment_likes', 'user_id'),
    ('stories', 'author_id'),
    ('story_views', 'user_id'),
    ('events', 'author_id'),
    ('event_attendees', 'user_id'),
    ('event_comments', 'author_id'),
    ('event_reactions', 'user_id'),
    ('conv_messages', 'from_id'),
    ('conv_members', 'user_id'),
    ('conv_reads', 'user_id'),
    ('call_invites', 'from_id'),
    ('call_invites', 'to_id'),
    ('notifications', 'user_id'),
    ('notifications', 'from_id'),
    ('follows', 'follower_id'),
    ('follows', 'following_id'),
    ('blocks', 'blocker_id'),
    ('blocks', 'blocked_id'),
    ('push_subscriptions', 'user_id'),
    ('user_state', 'user_id'),
    ('user_safety', 'user_id'),
    ('user_passions', 'user_id'),
    ('passion_quotas', 'user_id'),
    ('passion_requests', 'user_id'),
    ('step_interactions', 'user_id'),
    ('video_lives', 'author_id'),
    ('cdv_lives', 'author_id'),
    ('cdv_live_steps', 'author_id'),
    ('cdv_live_comments', 'author_id'),
    ('cdv_live_reactions', 'user_id'),
    ('cdv_live_followers', 'user_id'),
    ('cdv_live_collaborators', 'user_id'),
    ('cdv_live_collaborators', 'added_by'),
    ('client_errors', 'uid'),
    ('client_errors', 'auth_uid'),
    ('analytics_events', 'user_id'),
    ('telemetry_events', 'user_id'),
    ('telemetry_events', 'auth_uid'),
    ('profiles', 'id');

-- ④ La clause dans les policies d'ÉCRITURE de l'appelant (v1, étendue) ─────
-- ⚠️ ON RÉÉCRIT LES POLICIES EXISTANTES, on n'en ajoute pas : deux policies
-- PERMISSIVES sur la même commande s'additionnent par OU. Idempotent : on saute
-- toute policy qui porte déjà la clause. UPDATE sans `with_check` : PostgreSQL y
-- utilise le `USING`, on pose `with check (<qual> and not …)` pour PRÉSERVER ce
-- contrôle. Les policies `storage.objects` (uploads du compte) sont durcies aussi.
do $$
declare
  r record;
  expr text;
  n integer := 0;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname, p.cmd, p.qual, p.with_check
      from pg_policies p
     where p.cmd in ('INSERT','UPDATE','ALL')
       and ((p.schemaname = 'public' and p.tablename in (select distinct t from _colonnes_compte))
            or (p.schemaname = 'storage' and p.tablename = 'objects'))
  loop
    if r.cmd not in ('INSERT','UPDATE','ALL') then continue; end if;
    expr := coalesce(r.with_check, r.qual);
    if expr is null then continue; end if;
    if position('suppression_de_mon_compte' in expr) > 0 then continue; end if;
    execute format('alter policy %I on %I.%I with check (%s and not public.suppression_de_mon_compte())',
                   r.policyname, r.schemaname, r.tablename, expr);
    n := n + 1;
  end loop;
  raise notice 'clause posée sur % policy(ies) d''écriture', n;
end $$;

-- ⑤ LE TRIGGER : toutes les colonnes, tous les rôles ──────────────────────
-- Il lit `NEW` en jsonb et teste chaque colonne reçue en argument contre le
-- marqueur. Il REFUSE avec le message et le code d'un refus RLS : un tiers ne
-- peut pas distinguer « ce compte est en suppression » d'un refus ordinaire.
-- Nommé `zz_…` pour passer APRÈS les autres triggers BEFORE (PostgreSQL les
-- ordonne par nom) : il voit la ligne TELLE QU'ELLE SERA écrite.
create or replace function public.refuser_ecriture_compte_en_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  col   text;
  val   text;
  ligne jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := ligne ->> col;
    if val is not null and exists (
         select 1 from public.comptes_en_suppression c
          where c.user_id = val and c.statut in ('en_cours', 'purgee', 'supprimee'))
    then
      raise exception 'new row violates row-level security policy for table "%"', tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.refuser_ecriture_compte_en_suppression() from public, anon, authenticated;

do $$
declare
  r record;
  n integer := 0;
  absentes text[] := '{}';
begin
  for r in select t, string_agg(quote_literal(c), ', ' order by c) as args from _colonnes_compte group by t order by t loop
    if to_regclass('public.' || r.t) is null then
      -- Une table absente de CET environnement (staging, base de reprise) n'est
      -- pas une erreur de migration : elle est NOMMÉE, jamais tue.
      absentes := absentes || r.t;
      continue;
    end if;
    execute format('drop trigger if exists zz_barriere_suppression on public.%I', r.t);
    execute format('create trigger zz_barriere_suppression before insert or update on public.%I for each row execute function public.refuser_ecriture_compte_en_suppression(%s)', r.t, r.args);
    n := n + 1;
  end loop;
  raise notice 'trigger posé sur % table(s) ; absentes ici : %', n, absentes;
end $$;

-- ⑥ L'ÉTAT DURABLE, RÉCLAMÉ ET RENDU PAR JETON (service_role seul) ─────────
-- `reclamer_suppression` : UNE tentative à la fois par compte. Verrou
-- consultatif de transaction sur l'identifiant → deux appels simultanés se
-- sérialisent ; le second lit le statut posé par le premier et n'obtient rien.
-- Une tentative VIVANTE (`tentative_vivante`, moins vieille que `p_perime`)
-- n'est JAMAIS reprise — qu'elle soit `en_cours` (purge) ou `purgee` (Auth en
-- cours) : c'est la règle ① d'ASTRA-56. Une tentative plus vieille que
-- `p_perime` est réputée morte (fonction interrompue) et reprise. `echec`,
-- `purgee` terminée (`auth_echec`) sont reprenables ; `supprimee` ne l'est jamais.
-- La reprise d'une ligne `purgee` GARDE `purge_terminee_le` : c'est lui qui
-- interdit ensuite toute levée de protection (règle ②).
create or replace function public.reclamer_suppression(
  p_uid text, p_jeton uuid, p_motif text default 'delete-account', p_perime interval default interval '15 minutes')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.comptes_en_suppression%rowtype;
  acquise boolean := false;
  motif   text := null;
begin
  if p_uid is null or p_jeton is null then raise exception 'reclamer_suppression : uid et jeton obligatoires'; end if;
  perform pg_advisory_xact_lock(hashtext('comptes_en_suppression:' || p_uid));
  select * into c from public.comptes_en_suppression where user_id = p_uid;
  if not found then
    insert into public.comptes_en_suppression (user_id, motif, statut, jeton, tentatives, tentative_debut, tentative_vivante)
    values (p_uid, p_motif, 'en_cours', p_jeton, 1, now(), true)
    returning * into c;
    acquise := true;
  elsif c.statut = 'supprimee' then
    acquise := false; motif := 'supprimee';
  elsif c.statut in ('en_cours', 'purgee') and c.jeton is distinct from p_jeton
        and c.tentative_vivante and c.tentative_debut > now() - p_perime then
    acquise := false; motif := 'vivante';                -- une autre tentative est VIVANTE (purge ou Auth en cours)
  else
    update public.comptes_en_suppression
       set statut = 'en_cours', jeton = p_jeton, motif = p_motif, tentatives = tentatives + 1,
           tentative_debut = now(), tentative_fin = null, tentative_vivante = true, derniere_erreur = null
     where user_id = p_uid
    returning * into c;
    acquise := true;
  end if;
  return jsonb_build_object('acquise', acquise, 'motif', motif, 'statut', c.statut, 'jeton', c.jeton, 'tentatives', c.tentatives,
                            'tentative_debut', c.tentative_debut, 'purge_terminee_le', c.purge_terminee_le,
                            'donnees_deja_purgees', c.purge_terminee_le is not null);
end $$;

-- `terminer_suppression` : ne touche la ligne QUE si le jeton est le sien et
-- que la tentative est encore `en_cours` ou `purgee`. Sinon rien n'est écrit et
-- la réponse le dit (`jeton_perime`) : une tentative tardive ne peut plus
-- retirer la protection posée par une autre (ASTRA-40). `p_statut` est
-- l'ÉVÉNEMENT demandé ; le statut ÉCRIT en découle, et il est rendu :
--   `echec`      → si les données ne sont PAS parties : `echec`, protection LEVÉE
--                  (compte utilisable, purge relançable), tentative terminée ;
--                  si `purge_terminee_le` est posé : `purgee` — la protection ne
--                  se lève JAMAIS sur un compte dont les données sont parties
--                  (ASTRA-56, règle ②), tentative terminée, erreur conservée ;
--   `purgee`     → données parties, compte Auth encore là : protection CONSERVÉE,
--                  la tentative RESTE vivante (deleteUser suit) ;
--   `auth_echec` → données parties, deleteUser a échoué : `purgee`, protection
--                  CONSERVÉE, tentative TERMINÉE (reprenable aussitôt), erreur conservée ;
--   `supprimee`  → compte Auth parti : protection CONSERVÉE (rétention), tentative terminée.
-- `protection` (booléen) dit ce que le marqueur FAIT après l'appel — c'est ce
-- que la fonction Edge rapporte, jamais un état supposé.
create or replace function public.terminer_suppression(p_uid text, p_jeton uuid, p_statut text, p_detail jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comptes_en_suppression%rowtype;
begin
  if p_statut not in ('echec', 'purgee', 'auth_echec', 'supprimee') then raise exception 'terminer_suppression : statut % inconnu', p_statut; end if;
  update public.comptes_en_suppression
     set statut = case when p_statut = 'supprimee' then 'supprimee'
                       when p_statut = 'echec' and purge_terminee_le is null then 'echec'
                       else 'purgee' end,
         tentative_vivante = (p_statut = 'purgee'),
         tentative_fin = case when p_statut = 'purgee' then null else now() end,
         derniere_erreur = case when p_statut in ('echec', 'auth_echec') then p_detail else null end,
         purge_terminee_le = case when p_statut in ('purgee', 'auth_echec', 'supprimee') then coalesce(purge_terminee_le, now()) else purge_terminee_le end,
         supprimee_le = case when p_statut = 'supprimee' then now() else supprimee_le end
   where user_id = p_uid and jeton = p_jeton and statut in ('en_cours', 'purgee')
  returning * into c;
  if not found then
    select * into c from public.comptes_en_suppression where user_id = p_uid;
    return jsonb_build_object('ok', false, 'motif', case when found then 'jeton_perime' else 'inconnu' end,
                              'statut', c.statut, 'jeton', c.jeton,
                              'protection', found and c.statut in ('en_cours', 'purgee', 'supprimee'),
                              'donnees_deja_purgees', found and c.purge_terminee_le is not null);
  end if;
  return jsonb_build_object('ok', true, 'demande', p_statut, 'statut', c.statut, 'jeton', c.jeton, 'supprimee_le', c.supprimee_le,
                            'protection', c.statut in ('en_cours', 'purgee', 'supprimee'),
                            'donnees_deja_purgees', c.purge_terminee_le is not null);
end $$;

-- `attendre_ecritures_en_vol` : les transactions EN COURS à l'instant de l'appel
-- (elles ont pu franchir leur policy AVANT la marque) — on attend leur fin, au
-- plus `p_max_ms`. Rend ce qu'elle a vu et ce qui reste : `restantes > 0`
-- signifie que la purge NE PEUT PAS conclure.
create or replace function public.attendre_ecritures_en_vol(p_max_ms integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snap      pg_snapshot := pg_current_snapshot();
  -- ⚠️ `xip` NE SUFFIT PAS. Il ne liste que les transactions en cours
  -- ANTÉRIEURES à `xmax`, et `xmax` est « dernier xid VALIDÉ + 1 » : une
  -- transaction en vol plus récente que tout ce qui a validé n'y figure pas.
  -- Mesuré sur PostgreSQL 17 (banc ⑥) : une écriture ouverte, `xip` vide.
  -- On s'attribue donc un xid (`pg_current_xact_id`) : tout xid déjà attribué
  -- lui est inférieur, et [xmax, moi) complète la liste.
  moi       xid8 := pg_current_xact_id();
  candidats xid8[] := array(select pg_snapshot_xip(snap))
                   || array(select x::text::xid8 from generate_series(pg_snapshot_xmax(snap)::text::bigint,
                                                                       least(moi::text::bigint - 1, pg_snapshot_xmax(snap)::text::bigint + 100000)) g(x));
  xids      xid8[];
  debut     timestamptz := clock_timestamp();
  restantes integer := 0;
begin
  -- Parmi les candidats, seuls ceux qui sont RÉELLEMENT en cours comptent
  -- (un xid de la plage peut être déjà validé ou annulé).
  xids := array(select x from unnest(candidats) x where pg_xact_status(x) = 'in progress');
  loop
    select count(*) into restantes from unnest(xids) x where pg_xact_status(x) = 'in progress';
    exit when restantes = 0 or clock_timestamp() >= debut + make_interval(secs => greatest(p_max_ms, 0) / 1000.0);
    perform pg_sleep(0.05);
  end loop;
  return jsonb_build_object('en_vol_initial', coalesce(array_length(xids, 1), 0), 'restantes', restantes,
                            'attendu_ms', (extract(epoch from clock_timestamp() - debut) * 1000)::integer);
end $$;

-- `purger_marqueurs_suppression` : la rétention, quand elle sera décidée.
-- Non planifiée ici (voir l'en-tête). Rend le nombre de marqueurs retirés.
create or replace function public.purger_marqueurs_suppression(p_retention interval)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if p_retention < interval '30 days' then
    raise exception 'purger_marqueurs_suppression : rétention < 30 jours refusée (les sauvegardes vivent 30 jours)';
  end if;
  delete from public.comptes_en_suppression where statut = 'supprimee' and supprimee_le < now() - p_retention;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.reclamer_suppression(text, uuid, text, interval) from public, anon, authenticated;
revoke execute on function public.terminer_suppression(text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.attendre_ecritures_en_vol(integer) from public, anon, authenticated;
revoke execute on function public.purger_marqueurs_suppression(interval) from public, anon, authenticated;
grant execute on function public.reclamer_suppression(text, uuid, text, interval) to service_role;
grant execute on function public.terminer_suppression(text, uuid, text, jsonb) to service_role;
grant execute on function public.attendre_ecritures_en_vol(integer) to service_role;
grant execute on function public.purger_marqueurs_suppression(interval) to service_role;

-- ── VERDICT ────────────────────────────────────────────────────────────────
select 'table du marqueur posée, sans droit client, sans écriture directe du service' as controle,
       case when exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'comptes_en_suppression')
             and not has_table_privilege('anon', 'public.comptes_en_suppression', 'SELECT')
             and not has_table_privilege('authenticated', 'public.comptes_en_suppression', 'SELECT')
             and not has_table_privilege('service_role', 'public.comptes_en_suppression', 'INSERT')
             and not has_table_privilege('service_role', 'public.comptes_en_suppression', 'DELETE')
            then 'OK' else 'ECHEC' end as valeur
union all select 'RLS active sur le marqueur',
       case when (select relrowsecurity from pg_class where oid = 'public.comptes_en_suppression'::regclass) then 'OK' else 'ECHEC' end
union all select 'le statut est contraint (en_cours, echec, purgee, supprimee)',
       case when exists (select 1 from pg_constraint where conname = 'comptes_en_suppression_statut_check') then 'OK' else 'ECHEC' end
union all select 'v3 : la tentative porte sa vitalité (tentative_vivante) et terminer_suppression connaît auth_echec',
       case when exists (select 1 from pg_attribute where attrelid = 'public.comptes_en_suppression'::regclass and attname = 'tentative_vivante' and not attisdropped)
             and (select prosrc from pg_proc where proname = 'terminer_suppression') like '%auth_echec%'
            then 'OK' else 'ECHEC' end
union all select 'le prédicat ne répond que sur l''appelant (aucun argument)',
       case when (select count(*) from pg_proc where proname = 'suppression_de_mon_compte' and pronargs = 0) = 1 then 'OK' else 'ECHEC' end
union all select 'SECURITY DEFINER, search_path vide (prédicat, trigger, quatre fonctions)',
       case when (select count(*) from pg_proc
                   where proname in ('suppression_de_mon_compte','refuser_ecriture_compte_en_suppression','reclamer_suppression','terminer_suppression','attendre_ecritures_en_vol','purger_marqueurs_suppression')
                     and prosecdef and array_to_string(proconfig, ';') = 'search_path=""') = 6 then 'OK' else 'ECHEC' end
union all select 'le prédicat s''efface sans session (purge, restauration)',
       case when (select prosrc from pg_proc where proname = 'suppression_de_mon_compte') like '%auth.uid() is null then false%' then 'OK' else 'ECHEC' end
union all select 'anon et authenticated peuvent appeler le prédicat (les policies to public l''évaluent au rôle courant)',
       case when has_function_privilege('anon', 'public.suppression_de_mon_compte()', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.suppression_de_mon_compte()', 'EXECUTE')
            then 'OK' else 'ECHEC' end
union all select 'les quatre fonctions d''état ne sont appelables que par service_role',
       case when not has_function_privilege('authenticated', 'public.reclamer_suppression(text, uuid, text, interval)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.terminer_suppression(text, uuid, text, jsonb)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.attendre_ecritures_en_vol(integer)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.purger_marqueurs_suppression(interval)', 'EXECUTE')
             and has_function_privilege('service_role', 'public.reclamer_suppression(text, uuid, text, interval)', 'EXECUTE')
             and has_function_privilege('service_role', 'public.attendre_ecritures_en_vol(integer)', 'EXECUTE')
            then 'OK' else 'ECHEC' end
-- ⚠️ UNE PROPRIÉTÉ RELATIVE, JAMAIS UN NOMBRE : ce qui compte, c'est qu'il ne
-- reste AUCUNE policy d'écriture sans clause, et AUCUNE table présente sans trigger.
union all select 'aucune policy d''écriture des tables du compte n''est restée sans clause',
       case when not exists (
         select 1 from pg_policies p
          where p.cmd in ('INSERT','UPDATE','ALL')
            and ((p.schemaname = 'public' and p.tablename in (select distinct t from _colonnes_compte))
                 or (p.schemaname = 'storage' and p.tablename = 'objects'))
            and coalesce(p.with_check, p.qual) is not null
            and coalesce(p.with_check, '') not like '%suppression_de_mon_compte%'
       ) then 'OK' else 'ECHEC' end
union all select 'chaque table de la purge PRÉSENTE ici porte le trigger, avec TOUTES ses colonnes',
       case when not exists (
         select 1 from _colonnes_compte cc
          where to_regclass('public.' || cc.t) is not null
            and not exists (
              select 1 from pg_trigger tg
               where tg.tgrelid = to_regclass('public.' || cc.t)
                 and tg.tgname = 'zz_barriere_suppression'
                 and not tg.tgisinternal
                 and position(quote_literal(cc.c) in pg_get_triggerdef(tg.oid)) > 0)
       ) then 'OK' else 'ECHEC' end
union all select 'le trigger est BEFORE, INSERT et UPDATE, par ligne',
       case when not exists (
         select 1 from pg_trigger tg where tg.tgname = 'zz_barriere_suppression' and not tg.tgisinternal
            and not ((tg.tgtype & 2) = 2 and (tg.tgtype & 4) = 4 and (tg.tgtype & 16) = 16 and (tg.tgtype & 1) = 1)
       ) then 'OK' else 'ECHEC' end
union all select 'aucune policy DELETE n''est gardée (la purge doit pouvoir effacer)',
       case when (select count(*) from pg_policies
                   where cmd = 'DELETE' and coalesce(with_check, qual, '') like '%suppression_de_mon_compte%') = 0 then 'OK' else 'ECHEC' end;

commit;
