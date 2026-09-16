-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS ÉCRITES PAR LE SERVEUR — les mentions d'abord
-- (ASTRA-24, cinquième contre-revue indépendante, 2026-09-15 · MSG-04)
--
-- LE DÉFAUT. Une mention (« Bonjour @Lea ») faisait écrire PAR LE CLIENT une
-- ligne `notifications` (kind 'mention', texte LIBRE) vers le compte qu'il
-- désignait, puis `notify-call` poussait CE texte. Le contrôle serveur
-- (`lienEvenement`) réduisait les événements admissibles — un commentaire ou un
-- message récent de l'appelant contenant « @<username> » — mais :
--   · le TEXTE poussé et affiché restait celui de l'émetteur ;
--   · un `username` n'est pas une identité (aucun index unique : des homonymes
--     passent tous la garde, et le destinataire visé peut être un autre) ;
--   · la ligne in-app restait ouverte à tout compte non bloqué, à texte libre.
--
-- LE CHANTIER, ici :
--   ① `notifications.origine` ('client' | 'serveur'), posée par un TRIGGER
--      BEFORE INSERT depuis un réglage de transaction que seules les fonctions
--      du serveur posent (`passio.notification_serveur`) — un client ne peut
--      pas se dire serveur, quoi qu'il envoie ;
--   ② la policy d'INSERT des clients EXCLUT les genres réservés au serveur
--      ('mention', 'follow', 'follow_request', 'follow_accept') — écriture et
--      droits clients adaptés ;
--   ③ `notifier_mentions(genre, ref, ids[])` : le client porte des IDENTIFIANTS
--      DE COMPTES (résolus à la composition, jamais des noms) ; le serveur
--      VÉRIFIE l'événement métier (un commentaire / un message RÉCENT de
--      l'appelant sur cette référence), AUTORISE chaque destinataire (compte
--      existant, non bloqué dans les deux sens, membre de la conversation
--      pour un message, jamais soi-même, au plus 20), et ÉCRIT la ligne avec
--      un texte DÉRIVÉ (« <username> t'a mentionné dans … »), origine 'serveur',
--      idempotente (même événement → même ligne). Il ne rend qu'un COMPTE —
--      jamais quels destinataires ont été écartés (blocage = pas d'oracle).
--
-- TRANSITION (comportement explicite, dans les deux sens) :
--   · ancien client, migration appliquée : son INSERT 'mention' est REFUSÉ
--     (policy) — il l'ignore (fire-and-forget) — et aucune notification de
--     mention ne part de lui tant qu'il n'est pas rechargé ; les autres genres
--     continuent ;
--   · nouveau client, migration NON appliquée : `notifier_mentions` est absente
--     (PGRST202) → il ne fait RIEN d'autre (pas de repli vers l'écriture
--     client, qui est ce qu'on ferme) ; `notify-call` refuse une push 'mention'
--     dont la ligne n'est pas d'origine serveur (colonne absente = 'client') ;
--   · les genres encore écrits par le client ('message', 'like', 'comment',
--     event_*) restent adossés à `lienEvenement`, et leur TEXTE POUSSÉ est
--     désormais DÉRIVÉ côté serveur (lien-metier.js, `textePush`) — le texte
--     in-app de ces genres reste celui du client : prochain lot, même mécanique
--     (une fonction par genre, ou des triggers comme `follows_notifier`).
--   · notification de GROUPE sans mention : les destinataires sont les MEMBRES
--     (`conv_members`, vérifiés par `lienEvenement` genre 'message'), le texte
--     poussé est le gabarit « <nom> a écrit dans un groupe » — aucun nom n'y
--     est interprété.
--
-- Rejouable. Verdict en fin. Retour arrière :
--   drop function if exists public.notifier_mentions(text, text, text[]);
--   drop trigger if exists trg_notifications_origine on public.notifications;
--   drop function if exists public.notifications_origine();
--   -- la clause de policy est idempotente ; la retirer à la main si besoin
--   alter table public.notifications drop column if exists origine;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ① L'ORIGINE ──────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists origine text not null default 'client';
alter table public.notifications drop constraint if exists notifications_origine_check;
alter table public.notifications add constraint notifications_origine_check check (origine in ('client', 'serveur'));

create or replace function public.notifications_origine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Le réglage n'est posé que par les fonctions du serveur, dans LEUR
  -- transaction ; un client (PostgREST) ne peut pas l'atteindre.
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  return new;
end $$;
revoke execute on function public.notifications_origine() from public, anon, authenticated;
drop trigger if exists trg_notifications_origine on public.notifications;
create trigger trg_notifications_origine before insert on public.notifications
  for each row execute function public.notifications_origine();

-- Les genres que seul le serveur écrit. STABLE, sans argument sensible : c'est un référentiel.
create or replace function public.genres_reserves_au_serveur(p_kind text)
returns boolean
language sql
immutable
as $$ select p_kind in ('mention', 'follow', 'follow_request', 'follow_accept') $$;

-- ⚠️ Sixième contre-revue (16/09) — L'ESPACE D'IDENTIFIANTS DU SERVEUR. Les
-- mentions portent un identifiant DÉTERMINISTE (`n_m_<md5>`) pour être
-- idempotentes (ON CONFLICT). Si un client pouvait écrire une ligne avec cet
-- identifiant AVANT (à un autre destinataire, un autre genre), l'ON CONFLICT
-- « mettrait à jour » la ligne du squatteur : la personne mentionnée ne
-- recevrait rien, et le texte de la mention irait ailleurs. Le préfixe `n_m_`
-- est donc RÉSERVÉ au serveur (policy ②), ET `notifier_mentions` garde son
-- conflit par destinataire (③) — les deux, pas l'un ou l'autre.
create or replace function public.identifiant_reserve_au_serveur(p_id text)
returns boolean
language sql
immutable
as $$ select p_id like 'n\_m\_%' $$;
grant execute on function public.identifiant_reserve_au_serveur(text) to anon, authenticated, service_role;

-- ② LES GENRES RÉSERVÉS AU SERVEUR sortent de la policy d'INSERT des clients ─
-- On RÉÉCRIT la policy existante (deux policies permissives s'additionneraient).
do $$
declare
  r record;
  expr text;
  n integer := 0;
begin
  for r in select policyname, qual, with_check from pg_policies
            where schemaname = 'public' and tablename = 'notifications' and cmd in ('INSERT', 'ALL')
  loop
    expr := coalesce(r.with_check, r.qual);
    if expr is null then continue; end if;
    -- ⚠️ Sixième contre-revue (16/09) : la clause pose AUSSI la réserve d'identifiant
    -- (`n_m_…` est au serveur — voir ③). Idempotent : une policy qui a déjà les
    -- deux clauses est sautée ; une policy qui n'a que la première reçoit la seconde.
    if position('genres_reserves_au_serveur' in expr) > 0 and position('identifiant_reserve_au_serveur' in expr) > 0 then continue; end if;
    if position('genres_reserves_au_serveur' in expr) > 0 then
      execute format('alter policy %I on public.notifications with check (%s and not public.identifiant_reserve_au_serveur(id))', r.policyname, expr);
    else
      execute format('alter policy %I on public.notifications with check (%s and not public.genres_reserves_au_serveur(kind) and not public.identifiant_reserve_au_serveur(id))', r.policyname, expr);
    end if;
    n := n + 1;
  end loop;
  raise notice 'genres et identifiants réservés posés sur % policy(ies)', n;
end $$;

-- ③ LA MENTION, ÉCRITE PAR LE SERVEUR ──────────────────────────────────────
create or replace function public.notifier_mentions(p_genre text, p_ref_id text, p_mentionnes text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi        text := (auth.uid())::text;
  nom        text;
  contexte   text;
  cible      text;
  ids        text[];
  notifiees  integer := 0;
  ident      text;
begin
  if moi is null then raise exception 'notifier_mentions : session requise' using errcode = '42501'; end if;
  if p_genre not in ('commentaire', 'message') then raise exception 'notifier_mentions : genre inconnu' using errcode = '22023'; end if;
  if p_ref_id is null or p_ref_id = '' then raise exception 'notifier_mentions : référence requise' using errcode = '22023'; end if;
  ids := array(select distinct x from unnest(coalesce(p_mentionnes, '{}')) x where x is not null and x <> moi);
  if coalesce(array_length(ids, 1), 0) > 20 then raise exception 'notifier_mentions : au plus 20 mentions' using errcode = '22023'; end if;

  -- L'ÉVÉNEMENT MÉTIER : un commentaire / un message RÉCENT de l'appelant, ici.
  if p_genre = 'commentaire' then
    if not exists (select 1 from public.post_comments c where c.post_id = p_ref_id and c.author_id = moi and c.created_at > now() - interval '10 minutes') then
      raise exception 'notifier_mentions : aucun commentaire récent de l''appelant sur cette publication' using errcode = 'P0002';
    end if;
    contexte := 'un commentaire';
  else
    if not exists (select 1 from public.conv_messages m where m.conv_id = p_ref_id and m.from_id = moi and m.created_at > now() - interval '10 minutes') then
      raise exception 'notifier_mentions : aucun message récent de l''appelant dans cette conversation' using errcode = 'P0002';
    end if;
    select case when c.is_group then '« ' || coalesce(nullif(btrim(c.name), ''), 'un groupe') || ' »' else 'une conversation' end
      into contexte from public.conversations c where c.id = p_ref_id;
    contexte := coalesce(contexte, 'une conversation');
  end if;

  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = moi;
  perform set_config('passio.notification_serveur', '1', true);

  foreach cible in array ids loop
    -- AUTORISÉ ? compte existant, non bloqué (dans les deux sens), membre pour un message.
    if not exists (select 1 from public.profiles p where p.id = cible) then continue; end if;
    if public.is_blocked_with(cible) then continue; end if;
    if p_genre = 'message' and not exists (select 1 from public.conv_members cm where cm.conv_id = p_ref_id and cm.user_id = cible) then continue; end if;
    ident := 'n_m_' || left(md5(p_genre || '|' || p_ref_id || '|' || moi || '|' || cible), 20);
    -- ⚠️ ON CONFLICT GARDÉ PAR DESTINATAIRE (sixième contre-revue, 16/09) : la
    -- mise à jour ne touche la ligne existante QUE si c'est bien la mention de
    -- CE destinataire par CET émetteur. Une ligne préexistante sous cet
    -- identifiant qui appartient à quelqu'un d'autre (squat, collision) n'est
    -- ni réécrite ni comptée : on écrit alors la mention sous un identifiant
    -- neuf, pour que la personne mentionnée la reçoive quand même.
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values (ident, cible, 'mention', moi, p_ref_id, coalesce(nom, 'Quelqu''un') || ' t''a mentionné dans ' || contexte, false, now())
    on conflict (id) do update set content = excluded.content, seen = false, created_at = now()
      where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id and public.notifications.kind = 'mention';
    if not found then
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values ('n_m_' || left(md5(ident || '|' || clock_timestamp()::text || '|' || random()::text), 20), cible, 'mention', moi, p_ref_id,
              coalesce(nom, 'Quelqu''un') || ' t''a mentionné dans ' || contexte, false, now());
    end if;
    notifiees := notifiees + 1;
  end loop;
  -- Un COMPTE, jamais la liste : dire qui a été écarté révélerait un blocage.
  return jsonb_build_object('demandees', coalesce(array_length(ids, 1), 0), 'notifiees', notifiees);
end $$;
comment on function public.notifier_mentions(text, text, text[]) is
  'Mentions : le client porte des identifiants de comptes, le serveur vérifie l''événement, autorise chaque destinataire et écrit la ligne (origine serveur). Rend un compte, jamais les écartés (ASTRA-24).';

revoke execute on function public.notifier_mentions(text, text, text[]) from public, anon;
grant execute on function public.notifier_mentions(text, text, text[]) to authenticated, service_role;
grant execute on function public.genres_reserves_au_serveur(text) to anon, authenticated, service_role;

-- ── VERDICT ────────────────────────────────────────────────────────────────
select 'origine posée, contrainte, trigger BEFORE INSERT présent' as controle,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'origine')
             and exists (select 1 from pg_constraint where conname = 'notifications_origine_check')
             and exists (select 1 from pg_trigger where tgname = 'trg_notifications_origine' and not tgisinternal)
            then 'OK' else 'ECHEC' end as valeur
union all select 'aucune policy d''INSERT client sur notifications sans la clause des genres réservés',
       case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and cmd in ('INSERT', 'ALL')
                               and coalesce(with_check, qual) is not null and coalesce(with_check, '') not like '%genres_reserves_au_serveur%')
            then 'OK' else 'ECHEC' end
union all select 'notifier_mentions : SECURITY DEFINER, search_path vide, refusée à anon, ouverte à authenticated',
       case when (select prosecdef and array_to_string(proconfig, ';') = 'search_path=""' from pg_proc where proname = 'notifier_mentions')
             and not has_function_privilege('anon', 'public.notifier_mentions(text, text, text[])', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.notifier_mentions(text, text, text[])', 'EXECUTE')
            then 'OK' else 'ECHEC' end
union all select 'le trigger d''origine ne fait confiance qu''au réglage de transaction',
       case when (select prosrc from pg_proc where proname = 'notifications_origine') like '%passio.notification_serveur%' then 'OK' else 'ECHEC' end
union all select 'l''espace d''identifiants n_m_ est réservé au serveur (policies) et le conflit des mentions est gardé par destinataire',
       case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and cmd in ('INSERT', 'ALL')
                               and coalesce(with_check, qual) is not null and coalesce(with_check, '') not like '%identifiant_reserve_au_serveur%')
             and (select prosrc from pg_proc where proname = 'notifier_mentions') like '%where public.notifications.user_id = excluded.user_id%'
            then 'OK' else 'ECHEC' end;

commit;
