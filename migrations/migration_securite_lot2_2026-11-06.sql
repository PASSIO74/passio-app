-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- AUDIT DE SÉCURITÉ 2026-11-06 — LOT 2 : DÉBIT, BORNES, MASQUAGE, ACTIVITÉS, TEMPS RÉEL
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Se joue APRÈS le lot 1. Serveur seul.
-- NON APPLIQUÉE : contre-revue, attestation, puis mesure au canal ①.
-- Banc : tests/sql/migration-securite-2026-11-06.test.sh.
--
-- LES DÉFAUTS :
--   ① `trg_rate_limit` compte les lignes récentes : insérer puis supprimer, ou dater en 2000, ou
--     écrire en parallèle, le contourne. 22 tables n'ont aucun plafond (`conv_members` : ajouts forcés).
--   ② Aucun chemin client ne fait d'UPDATE sur `posts` ni `conv_messages` : réécriture et antidatage
--     silencieux restaient ouverts, y compris d'un message signalé. Dates et tailles sans borne.
--   ③ Trois comptes de 7 jours masquaient 600 publications par heure, sans que l'auteur le sache.
--   ④ R28 (ordre de la file écrit par le client), R18 (un venant sorti reste dans la discussion),
--     R39 (une note comptée sans place), R40 (les comptes bloqués comptés), C-09 (code de pointage
--     sans plafond d'essais).
--   ⑤ `irl_interaction_allowed` : oracle de majorité d'un tiers.
--   ⑥ Canaux `vlive:` et `call:` ouverts à tout connecté. Ce lot ferme l'abonnement (ligne réelle,
--     blocage, compte privé, parties d'un appel). Il ne ferme PAS le `from` forgé par un spectateur
--     autorisé (décision à prendre : couper les Lives, sans usage depuis le 30/08).
--   ⑦ `cdv_*` (fonction retirée) encore lisibles et écrivables ; `comment_likes` d'une publication
--     privée lisibles ; réactions possibles sur le contenu d'un compte qui vous a bloqué.
--   ⑧ Une notification rejouée repoussait une push à volonté (`push_le`, voir lien-metier.js).
--
-- RETOUR ARRIÈRE (éditeur SQL). Corps et policies d'origine : tests/sql/fixtures/socle-production-2026-11-06.sql.
--| begin;

--| select cron.unschedule('purge_debit_ecritures');
--| drop trigger if exists trg_debit_compte on public.conv_members;
--| drop trigger if exists trg_debit_compte on public.post_likes;
--| drop trigger if exists trg_debit_compte on public.comment_likes;
--| drop trigger if exists trg_debit_compte on public.story_views;
--| drop trigger if exists trg_debit_compte on public.video_lives;
--| drop trigger if exists trg_debit_compte on public.post_collaborators;
--| drop trigger if exists trg_debit_compte on public.user_passions;
--| drop trigger if exists trg_debit_compte on public.push_subscriptions;
--| drop trigger if exists trg_debit_compte on public.blocks;
--| drop trigger if exists trg_debit_compte on public.call_invites;
--| drop trigger if exists aa_video_lives_horodatage on public.video_lives;
--| drop trigger if exists aa_profiles_figes on public.profiles;
--| drop trigger if exists trg_rate_limit on public.event_attendees;
--| drop trigger if exists trg_event_attendees_sortie_discussion on public.event_attendees;
--| -- les 9 bornes de taille, les 4 colonnes figées et les droits `cdv_*` : leurs instructions d'origine sont au socle.
--| -- puis : fonctions et policies d'origine depuis le socle ; `notifications.push_le` peut rester, inerte.
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;

do $g$ begin
  if to_regprocedure('public.plafond_consommer(uuid,text,integer,integer)') is null and to_regprocedure('public.quota_stockage_ok()') is null then
    raise exception 'lot 1 requis avant le lot 2';
  end if;
end $g$;

-- ── ① Un compteur que l'attaquant ne peut pas effacer ────────────────────────────────────────
create table if not exists public.debit_ecritures (
  minute timestamptz not null, table_nom text not null, source text not null, n integer not null,
  primary key (minute, table_nom, source));
alter table public.debit_ecritures enable row level security;
revoke all on public.debit_ecritures from public, anon, authenticated;
grant select, insert, update, delete on public.debit_ecritures to service_role;

create or replace function public.debit_compter(p_table text, p_source text, p_plafond integer) returns void
language plpgsql security definer set search_path = '' as $fn$
declare v integer;
begin
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (date_trunc('minute', now()), p_table, p_source, 1)
  on conflict (minute, table_nom, source) do update set n = d.n + 1
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: max % insertions/minute sur %', p_plafond, p_table using errcode = 'P0001';
  end if;
end $fn$;
revoke all on function public.debit_compter(text, text, integer) from public, anon, authenticated;

create or replace function public.rate_limit_insert() returns trigger
language plpgsql security definer set search_path = 'public', 'pg_temp' as $fn$
declare user_col text := TG_ARGV[0]; max_per_min int := TG_ARGV[1]::int; uid text;
begin
  NEW.created_at := now();
  execute format('select ($1).%I', user_col) into uid using NEW;
  if uid is null then return NEW; end if;
  perform public.debit_compter(TG_TABLE_NAME, uid, max_per_min);
  return NEW;
end $fn$;

create or replace function public.debit_par_compte() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare moi text := (auth.uid())::text;
begin
  if moi is null then return new; end if;
  perform public.debit_compter(tg_table_name, moi, tg_argv[0]::int);
  return new;
end $fn$;
revoke all on function public.debit_par_compte() from public, anon, authenticated;

drop trigger if exists trg_debit_compte on public.conv_members;
create trigger trg_debit_compte before insert on public.conv_members for each row execute function public.debit_par_compte('60');
drop trigger if exists trg_debit_compte on public.post_likes;
create trigger trg_debit_compte before insert on public.post_likes for each row execute function public.debit_par_compte('120');
drop trigger if exists trg_debit_compte on public.comment_likes;
create trigger trg_debit_compte before insert on public.comment_likes for each row execute function public.debit_par_compte('120');
drop trigger if exists trg_debit_compte on public.story_views;
create trigger trg_debit_compte before insert on public.story_views for each row execute function public.debit_par_compte('240');
drop trigger if exists trg_debit_compte on public.video_lives;
create trigger trg_debit_compte before insert on public.video_lives for each row execute function public.debit_par_compte('5');
drop trigger if exists trg_debit_compte on public.post_collaborators;
create trigger trg_debit_compte before insert on public.post_collaborators for each row execute function public.debit_par_compte('30');
drop trigger if exists trg_debit_compte on public.user_passions;
create trigger trg_debit_compte before insert on public.user_passions for each row execute function public.debit_par_compte('120');
drop trigger if exists trg_debit_compte on public.push_subscriptions;
create trigger trg_debit_compte before insert on public.push_subscriptions for each row execute function public.debit_par_compte('20');
drop trigger if exists trg_debit_compte on public.blocks;
create trigger trg_debit_compte before insert on public.blocks for each row execute function public.debit_par_compte('60');
drop trigger if exists trg_debit_compte on public.call_invites;
create trigger trg_debit_compte before insert on public.call_invites for each row execute function public.debit_par_compte('60');

do $c$ begin
  perform cron.schedule('purge_debit_ecritures', '*/15 * * * *', $q$delete from public.debit_ecritures where minute < now() - interval '1 hour'; delete from public.pointage_essais where fenetre < now() - interval '1 day'$q$);
end $c$;

-- ── ② Pas de réécriture sans usage ; dates du serveur ; bornes ───────────────────────────────
drop policy if exists "Update propre" on public.posts;
drop policy if exists "Update propre" on public.conv_messages;
drop trigger if exists trg_identifiants_figes on public.post_comments;
create trigger trg_identifiants_figes before update on public.post_comments for each row
  execute function public.identifiants_figes('id', 'post_id', 'author_id', 'created_at');

create or replace function public.video_lives_horodatage() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.started_at := now(); new.last_seen := now();
  else new.started_at := old.started_at; new.last_seen := least(new.last_seen, now());
  end if;
  return new;
end $fn$;
drop trigger if exists aa_video_lives_horodatage on public.video_lives;
create trigger aa_video_lives_horodatage before insert or update on public.video_lives
  for each row execute function public.video_lives_horodatage();

create or replace function public.profiles_figes() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.created_at := now();
  else new.created_at := old.created_at; new.id := old.id;
  end if;
  return new;
end $fn$;
drop trigger if exists aa_profiles_figes on public.profiles;
create trigger aa_profiles_figes before insert or update on public.profiles
  for each row execute function public.profiles_figes();

alter table public.profiles drop constraint if exists profiles_bio_borne;
alter table public.profiles add constraint profiles_bio_borne check (char_length(bio) <= 1000) not valid;
alter table public.profiles validate constraint profiles_bio_borne;
alter table public.conv_messages drop constraint if exists conv_messages_content_borne;
alter table public.conv_messages add constraint conv_messages_content_borne check (octet_length(content) <= 1048576) not valid;
alter table public.conv_messages validate constraint conv_messages_content_borne;
alter table public.posts drop constraint if exists posts_content_borne;
alter table public.posts add constraint posts_content_borne check (char_length(content) <= 20000) not valid;
alter table public.posts validate constraint posts_content_borne;
alter table public.post_comments drop constraint if exists post_comments_content_borne;
alter table public.post_comments add constraint post_comments_content_borne check (char_length(content) <= 5000) not valid;
alter table public.post_comments validate constraint post_comments_content_borne;
alter table public.event_comments drop constraint if exists event_comments_text_borne;
alter table public.event_comments add constraint event_comments_text_borne check (char_length(text) <= 5000) not valid;
alter table public.event_comments validate constraint event_comments_text_borne;
alter table public.events drop constraint if exists events_textes_bornes;
alter table public.events add constraint events_textes_bornes check (char_length(title) <= 300 and char_length(description) <= 10000) not valid;
alter table public.events validate constraint events_textes_bornes;
alter table public.conversations drop constraint if exists conversations_textes_bornes;
alter table public.conversations add constraint conversations_textes_bornes check (char_length(group_name) <= 200 and char_length(description) <= 2000) not valid;
alter table public.conversations validate constraint conversations_textes_bornes;
alter table public.event_attendees drop constraint if exists event_attendees_feedback_borne;
alter table public.event_attendees add constraint event_attendees_feedback_borne check (char_length(feedback) <= 2000) not valid;
alter table public.event_attendees validate constraint event_attendees_feedback_borne;
alter table public.user_state drop constraint if exists user_state_taille;
alter table public.user_state add constraint user_state_taille check (pg_column_size(data) <= 2097152) not valid;
alter table public.user_state validate constraint user_state_taille;

-- ── ③ Masquage : un crédit par signaleur, et l'auteur prévenu ────────────────────────────────
do $m$
declare src text;
  ligne text := 'and u.created_at < now() - interval ''7 days'';';
  insere text := 'where public.contenus_masques.decision is null;';
begin
  select pg_get_functiondef('public.trg_reports_pretri()'::regprocedure) into src;
  if position('interval ''24 hours''' in src) > 0 then return; end if;
  if position(ligne in src) = 0 or position(insere in src) = 0 then
    raise exception 'trg_reports_pretri : la forme attendue a changé, relire la fonction';
  end if;
  src := replace(src, ligne, $add$and u.created_at < now() - interval '7 days'
     -- Un compte ne compte que pour 5 publications par 24 h : trois comptes ne censurent plus en série.
     and (select count(distinct r2.target_id) from public.reports r2
           where r2.reporter_id = r.reporter_id and r2.target_type = 'post'
             and r2.created_at > now() - interval '24 hours') <= 5;$add$);
  src := replace(src, insere, insere || $add$
    -- L'auteur sait que sa publication a disparu pour les autres : une fois, d'origine serveur.
    -- Dans son propre bloc : un auteur au plafond de notifications annulait sinon le signalement et le masque.
    begin
      perform set_config('passio.notification_serveur', '1', true);
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values ('n_m_' || left(md5('masque|' || new.target_id), 20), auteur, 'moderation', auteur, new.target_id,
              'Ta publication a été masquée après plusieurs signalements, le temps d''une vérification. Elle reste visible pour toi.', false, now())
      on conflict (id) do nothing;
    exception when others then
      raise warning 'masquage : notification de l''auteur non écrite (%)', sqlstate;
    end;$add$);
  execute src;
end $m$;

-- ── ④ Activités ──────────────────────────────────────────────────────────────────────────────
-- R28 : l'ordre de la file est celui du serveur.
create or replace function public.event_attendees_figes() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then return new; end if;
  if new.event_id is distinct from old.event_id then
    raise exception 'inscription_activite_figee' using errcode = 'P0001',
      hint = 'Une inscription ne se déplace pas : se désinscrire, puis s''inscrire à l''autre activité.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'inscription_compte_fige' using errcode = 'P0001', hint = 'Une inscription ne change pas de compte.';
  end if;
  new.created_at := old.created_at;
  return new;
end $fn$;
drop trigger if exists trg_rate_limit on public.event_attendees;
create trigger trg_rate_limit before insert on public.event_attendees
  for each row execute function public.rate_limit_insert('user_id', '30');

-- R18 : qui ne vient plus sort de la discussion, sauf l'organisation.
create or replace function public.event_attendees_sortie_discussion() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare ev text := coalesce(old.event_id, new.event_id); qui text := coalesce(old.user_id, new.user_id);
begin
  if tg_op = 'UPDATE' and (new.rsvp = 'going' or old.rsvp is distinct from 'going') then return null; end if;
  delete from public.conv_members m where m.conv_id = 'evgrp_' || ev and m.user_id = qui
     and not exists (select 1 from public.events e where e.id = ev
                      and (e.author_id = qui or e.organizer_id = qui or e.co_organizers ? qui));
  return null;
end $fn$;
revoke all on function public.event_attendees_sortie_discussion() from public, anon, authenticated;
drop trigger if exists trg_event_attendees_sortie_discussion on public.event_attendees;
create trigger trg_event_attendees_sortie_discussion after update of rsvp or delete on public.event_attendees
  for each row execute function public.event_attendees_sortie_discussion();

-- R39 : une note ne compte que pour une place tenue. R40 : un compte bloqué n'est pas compté.
do $m$
declare src text;
begin
  select pg_get_functiondef('public.notes_evenement(text)'::regprocedure) into src;
  if position('(a.rsvp = ''going'' or a.checked_in_at is not null)' in src) > 0 then
    execute replace(src, '(a.rsvp = ''going'' or a.checked_in_at is not null)', 'a.rsvp = ''going''');
  elsif position('and a.rsvp = ''going''' in src) = 0 then
    raise exception 'notes_evenement : la forme attendue a changé, relire la fonction';
  end if;
  select pg_get_functiondef('public.participants_compte(text[])'::regprocedure) into src;
  if position('is_blocked_with' in src) = 0 then
    if position('and a.event_id = any (p_event_ids[1:200])' in src) = 0 then
      raise exception 'participants_compte : la forme attendue a changé, relire la fonction';
    end if;
    execute replace(src, 'and a.event_id = any (p_event_ids[1:200])', 'and a.event_id = any (p_event_ids[1:200])
    and not public.is_blocked_with(a.user_id)');
  end if;
end $m$;

-- C-09 : dix essais de code par activité et par compte, sur dix minutes.
create table if not exists public.pointage_essais (
  event_id text not null references public.events(id) on delete cascade,
  user_id text not null, essais integer not null default 0,
  fenetre timestamptz not null default now(), primary key (event_id, user_id));
alter table public.pointage_essais enable row level security;
revoke all on public.pointage_essais from public, anon, authenticated;
grant select, insert, update, delete on public.pointage_essais to service_role;
do $m$
declare src text;
  ligne text := 'if not found then return ''introuvable''; end if;';
begin
  select pg_get_functiondef('public.pointer_par_code(text,text)'::regprocedure) into src;
  if position('pointage_essais' in src) > 0 then return; end if;
  if position(ligne in src) = 0 or position('ligne record;' in src) = 0 then
    raise exception 'pointer_par_code : la forme attendue a changé, relire la fonction';
  end if;
  src := replace(src, 'ligne record;', 'ligne record;
  n integer;');
  src := replace(src, ligne, ligne || $add$
  insert into public.pointage_essais as e (event_id, user_id, essais) values (p_event_id, moi, 1)
  on conflict (event_id, user_id) do update
    set essais = case when e.fenetre < now() - interval '10 minutes' then 1 else e.essais + 1 end,
        fenetre = case when e.fenetre < now() - interval '10 minutes' then now() else e.fenetre end
  returning essais into n;
  if n > 10 then return 'trop_d_essais'; end if;$add$);
  execute src;
end $m$;

-- ── ⑤ L'oracle de majorité ───────────────────────────────────────────────────────────────────
create or replace function public.irl_interaction_allowed(_other text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
    when public.is_blocked_with(_other) then false
    when not exists (
      select 1 from public.conv_members a
        join public.conv_members b on b.conv_id = a.conv_id and b.user_id = _other
        join public.conversations c on c.id = a.conv_id and not coalesce(c.is_group, false)
       where a.user_id = (auth.uid())::text
         -- Une conversation se crée sans l'accord de l'autre : seule SA réponse prouve un échange, sinon
         -- on pouvait ajouter un compte, lire sa majorité, puis le retirer.
         and exists (select 1 from public.conv_messages m where m.conv_id = a.conv_id and m.from_id = _other)) then false
    else coalesce((select s.majority_at <= current_date from public.user_safety s where s.user_id = (auth.uid())::text), false)
     and coalesce((select s.majority_at <= current_date from public.user_safety s where s.user_id = _other), false)
  end
$fn$;

-- ── ⑥ Canaux ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.call_partie_prenante(_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select (select auth.uid()) is not null and exists (
    select 1 from public.call_invites ci
     where ci.id = _id and (select auth.uid())::text in (ci.from_id, ci.to_id))
$fn$;
create or replace function public.peut_voir_live(_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select (select auth.uid()) is not null and exists (
    select 1 from public.video_lives v
     where v.id = _id
       and (v.author_id = (select auth.uid())::text
            or (v.status = 'live' and not public.is_blocked_with(v.author_id)
                and (not exists (select 1 from public.profiles p where p.id = v.author_id and p.is_private)
                     or public.abonne_accepte_non_bloque(v.author_id)))))
$fn$;
revoke all on function public.call_partie_prenante(text), public.peut_voir_live(text) from public, anon;
grant execute on function public.call_partie_prenante(text), public.peut_voir_live(text) to authenticated, service_role;
drop policy if exists passio_rt_emettre on realtime.messages;
create policy passio_rt_emettre on realtime.messages for insert to authenticated with check (
     (realtime.topic() like 'call:%'   and public.call_partie_prenante(substr(realtime.topic(), 6)))
  or (realtime.topic() like 'vlive:%'  and public.peut_voir_live(substr(realtime.topic(), 7)))
  or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%'   and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text)));
drop policy if exists passio_rt_recevoir on realtime.messages;
create policy passio_rt_recevoir on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%'   and substr(realtime.topic(), 6) = (select auth.uid())::text)
  or (realtime.topic() like 'call:%'   and public.call_partie_prenante(substr(realtime.topic(), 6)))
  or (realtime.topic() like 'vlive:%'  and public.peut_voir_live(substr(realtime.topic(), 7)))
  or realtime.topic() = 'realtime:db'
  or (realtime.topic() like 'typing:%' and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or (realtime.topic() like 'conv:%'   and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
  or (realtime.topic() like 'conv_specific:%' and public.is_conv_member(substr(realtime.topic(), 15), (select auth.uid())::text)));

-- ── ⑦ Fonctions retirées, lectures et réactions ──────────────────────────────────────────────
revoke all on public.cdv_lives from anon, authenticated;
revoke all on public.cdv_live_steps from anon, authenticated;
revoke all on public.cdv_live_comments from anon, authenticated;
revoke all on public.cdv_live_reactions from anon, authenticated;
revoke all on public.cdv_live_followers from anon, authenticated;
revoke all on public.cdv_live_collaborators from anon, authenticated;
revoke all on public.step_interactions from anon, authenticated;
drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes for select to anon, authenticated
  using (user_id = (select auth.uid())::text or public.comment_target_visible(comment_id));
drop policy if exists ci_insert on public.comment_interactions;
create policy ci_insert on public.comment_interactions for insert to authenticated
  with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte()
              and not public.post_auteur_bloque(post_id) and not public.event_auteur_bloque(post_id)
              -- La cible se lit aussi par `comment_id` : `post_id` nul passait, et `fil_compteurs` lit `comment_id`.
              and not public.post_auteur_bloque(comment_id) and not public.event_auteur_bloque(comment_id)
              -- L'épingle est l'acte du propriétaire du fil, jugé par `ci_epingle_garde` : il doit pouvoir la
              -- retirer d'un commentaire dont il a bloqué l'auteur, en écrivant « 0 ».
              and (kind = 'pin' or not exists (select 1 from public.post_comments k where k.id = comment_id and public.is_blocked_with(k.author_id))));
drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own" on public.comment_likes for insert to public
  with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte()
              and not exists (select 1 from public.post_comments k where k.id = comment_id and public.is_blocked_with(k.author_id)));
drop policy if exists event_reactions_insert on public.event_reactions;
create policy event_reactions_insert on public.event_reactions for insert to authenticated
  with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte()
              and not public.event_auteur_bloque(event_id));

-- ── ⑧ Une push par notification ──────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists push_le timestamptz;
-- ⚠️ Droits par colonne sur cette table : sans ce GRANT, le `select("*")` du client (app-08) rendrait 42501, et
-- PostgREST refuse alors la requête ENTIÈRE. En écriture, la colonne reste fermée : l'INSERT client est une liste.
grant select (push_le) on public.notifications to anon, authenticated;
-- La marque n'appartient qu'au serveur : forgée à l'INSERT, une date lointaine comptait sans fin dans le budget
-- d'une cible et coupait ses push. Même fonction qu'au lot 1, la remise à zéro en plus.
create or replace function public.notifications_origine() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  if new.origine = 'client' and auth.uid() is not null then
    new.push_le := null;
    -- Le plafond de `trg_rate_limit` est par émetteur : une cible se noie sous 60 lignes par minute.
    if (select count(*) from public.notifications n
         where n.from_id = new.from_id and n.user_id = new.user_id
           and n.created_at > now() - interval '1 minute') >= 10 then
      raise exception 'rate limit: max 10 notifications/minute vers un même compte' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $fn$;
create index if not exists notifications_push_recents on public.notifications (user_id, push_le) where push_le is not null;

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────
select 'debit_ecritures : RLS active, aucun droit client' as controle,
       case when (select relrowsecurity from pg_class where oid = 'public.debit_ecritures'::regclass)
             and not has_table_privilege('anon', 'public.debit_ecritures', 'select')
             and not has_table_privilege('authenticated', 'public.debit_ecritures', 'select') then 'OK' else 'ECHEC' end as valeur
union all select 'rate_limit_insert : compteur à part, plus de lecture de la table visée',
       case when (select prosrc from pg_proc where oid = 'public.rate_limit_insert()'::regprocedure) like '%debit_compter%' then 'OK' else 'ECHEC' end
union all select 'plafonds posés sur les dix tables sans borne',
       case when (select count(*) from pg_trigger where tgname = 'trg_debit_compte' and tgenabled = 'O') = 10 then 'OK' else 'ECHEC' end
union all select 'purge du compteur planifiée',
       case when exists (select 1 from cron.job where jobname = 'purge_debit_ecritures') then 'OK' else 'ECHEC' end
union all select 'posts et conv_messages : plus de policy UPDATE',
       case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('posts','conv_messages') and cmd = 'UPDATE') then 'OK' else 'ECHEC' end
union all select 'bornes de taille validées',
       case when (select count(*) from pg_constraint where connamespace = 'public'::regnamespace and contype = 'c' and convalidated
                   and conname in ('profiles_bio_borne','conv_messages_content_borne','posts_content_borne','post_comments_content_borne','event_comments_text_borne','events_textes_bornes','conversations_textes_bornes','event_attendees_feedback_borne','user_state_taille')) = 9 then 'OK' else 'ECHEC' end
union all select 'masquage : crédit de 5 publications par signaleur, auteur prévenu',
       case when (select prosrc from pg_proc where oid = 'public.trg_reports_pretri()'::regprocedure) like '%interval ''24 hours''%'
             and (select prosrc from pg_proc where oid = 'public.trg_reports_pretri()'::regprocedure) like '%''moderation''%' then 'OK' else 'ECHEC' end
union all select 'activités : date de file figée, sortie de discussion, notes, compteurs, essais de code',
       case when (select prosrc from pg_proc where oid = 'public.event_attendees_figes()'::regprocedure) like '%new.created_at := old.created_at%'
             and exists (select 1 from pg_trigger where tgname = 'trg_event_attendees_sortie_discussion' and tgenabled = 'O')
             and (select prosrc from pg_proc where oid = 'public.notes_evenement(text)'::regprocedure) not like '%checked_in_at%'
             and (select prosrc from pg_proc where oid = 'public.participants_compte(text[])'::regprocedure) like '%is_blocked_with%'
             and (select prosrc from pg_proc where oid = 'public.pointer_par_code(text,text)'::regprocedure) like '%trop_d_essais%' then 'OK' else 'ECHEC' end
union all select 'irl_interaction_allowed : la majorité d''un tiers n''est dite qu''à son correspondant',
       case when (select prosrc from pg_proc where oid = 'public.irl_interaction_allowed(text)'::regprocedure) like '%conv_members%' then 'OK' else 'ECHEC' end
union all select 'canaux call: et vlive: : conditionnés',
       case when (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'passio_rt_recevoir') like '%call_partie_prenante%'
             and (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'passio_rt_recevoir') like '%peut_voir_live%'
             and (select with_check from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'passio_rt_emettre') like '%peut_voir_live%' then 'OK' else 'ECHEC' end
union all select 'cdv_* : aucun droit client',
       case when not has_table_privilege('anon', 'public.cdv_lives', 'select') and not has_table_privilege('authenticated', 'public.cdv_lives', 'insert') then 'OK' else 'ECHEC' end
union all select 'notifications.push_le présente',
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'push_le') then 'OK' else 'ECHEC' end;

commit;
