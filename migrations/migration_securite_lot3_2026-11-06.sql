-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT DE SÉCURITÉ DU 2026-11-06, LOT 3 — saturation et abus sans compte, journal de modération.
-- À appliquer APRÈS les lots 1 et 2. Non appliqué : `npm run migration:appliquer`, staging d'abord.
--
-- ① H-01 : la télémétrie et les erreurs étaient bornées en LIGNES, jamais en octets. Avec la seule
--    clé anon, 1 600 lignes/min de 1 Mo atteignaient le disque de 8 Go en cinq minutes, et à 95 % le
--    projet entier passe en lecture seule. Ligne bornée, volume de table borné.
-- ② H-02 : un UPDATE de `profiles` est diffusé à tous les connectés, sans plafond. Un compte pouvait
--    faire dépasser 500 messages/s, et le projet déconnecte alors tout le monde.
-- ③ H-03 : un visiteur n'ouvre plus de socket (garde de `_creerCanalDb`) : la policy n'a plus d'usage
--    et elle offrait le quota de 500 connexions à la clé anon. Reste à couper « Allow public access ».
-- ④ H-05 : 1 Ko de texte coûtait 2 s à `rechercher_passions`, sans compte. Un libellé fait 60 caractères.
-- ⑤ H-17 : `fil_compteurs` agrégeait toutes les réactions d'une publication : 50 Mo en UNE ligne,
--    que `max-rows` ne voit pas.
-- ⑥ H-18 : `attachments` n'avait aucune liste de types (`content` l'a depuis le lot 1). La liste reprend ce que
--    propose l'écran : à éprouver sur le staging, types à paramètres (`;codecs=`) et `file.type` vide compris.
-- ⑦ H-10 : un masquage s'écrit sans laisser de trace, et le masque ne couvrait ni les commentaires ni
--    les « j'aime » : un journal d'origine serveur, et `post_is_visible` suit la règle de `posts`.
-- ⑧ H-08 : `user_passions` sans cardinalité (chaque ligne réécrit et diffuse le profil).
-- ⑨ H-09 : `events.status` sans valeurs fermées : une valeur inconnue sortait de la discussion, pas
--    des inscriptions.
--
-- PRÉREQUIS-CLIENT : aucun ; le lot 2 doit être passé (garde en tête). Mesuré le 2026-11-06 en production : ligne de télémétrie 733 o au plus,
-- 640 o pour `analytics_events`, 312 o pour `comment_interactions`, 16 passions par compte au plus,
-- `events.status` tout à `active`, pièces jointes : image/jpeg, video/mp4, audio/webm.
--
-- ⚠️ `to anon` : une ligne trop grosse est refusée en 22001, un 400 que le client jette sans le
-- renvoyer. Une table pleine est refusée en PT429, que le client attend (`telemetry.js`).
--
-- RETOUR ARRIÈRE (lignes `--|`, à jouer dans l'ordre) :
--| drop trigger if exists aa_ligne_bornee on public.telemetry_events;
--| drop trigger if exists aa_table_bornee on public.telemetry_events;
--| drop trigger if exists aa_ligne_bornee on public.client_errors;
--| drop trigger if exists aa_table_bornee on public.client_errors;
--| drop trigger if exists aa_ligne_bornee on public.analytics_events;
--| drop trigger if exists aa_ligne_bornee on public.comment_interactions;
--| drop trigger if exists aa_ligne_bornee on public.event_comments;
--| drop trigger if exists aa_ligne_bornee on public.event_reactions;
--| drop trigger if exists aa_ligne_bornee on public.video_lives;
--| drop trigger if exists aa_ligne_bornee on public.stories;
--| drop trigger if exists aa_ligne_bornee on public.events;
--| drop trigger if exists trg_debit_maj on public.profiles;
--| drop trigger if exists trg_debit_maj on public.video_lives;
--| drop trigger if exists trg_debit_maj on public.user_passions;
--| drop trigger if exists aa_ligne_bornee on public.posts;
--| drop trigger if exists aa_ligne_bornee on public.profiles;
--| drop trigger if exists aa_ligne_bornee on public.notifications;
--| drop trigger if exists aa_ligne_bornee on public.reports;
--| drop trigger if exists ab_debit_octets on public.conv_messages;
--| drop trigger if exists ab_debit_octets on public.posts;
--| drop trigger if exists ab_debit_octets on public.post_comments;
--| drop trigger if exists ab_debit_octets on public.stories;
--| drop trigger if exists ab_debit_octets on public.events;
--| drop trigger if exists ab_debit_octets on public.profiles;
--| drop trigger if exists ab_debit_octets on public.user_state;
--| drop function if exists public.debit_octets_par_compte();
--| drop trigger if exists aa_user_passions_borne on public.user_passions;
--| drop trigger if exists trg_contenus_masques_journal on public.contenus_masques;
--| drop function if exists public.ligne_bornee();
--| drop function if exists public.table_bornee();
--| drop function if exists public.debit_maj_par_compte();
--| drop function if exists public.user_passions_borne();
--| drop function if exists public.contenus_masques_journal();
--| drop function if exists public.retirer_co_organisateur(text);
--| alter table public.events drop constraint if exists events_status_valeurs;
--| update storage.buckets set allowed_mime_types = null where id = 'attachments';
--| create policy "passio_rt_recevoir_visiteur" on realtime.messages for select to anon using (realtime.topic() = 'realtime:db');
--| -- rechercher_passions, fil_compteurs, post_is_visible : corps d'origine dans tests/sql/fixtures/socle-production-2026-11-06.sql.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $g$ begin
  if to_regprocedure('public.debit_compter(text,text,integer)') is null then
    raise exception 'lot 2 requis avant le lot 3 : sans lui, tout UPDATE de profil échouerait';
  end if;
end $g$;

-- ── ① Les octets, pas seulement les lignes ──────────────────────────────────
create or replace function public.ligne_bornee() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated')
     and pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text) > tg_argv[0]::integer then
    raise exception 'ligne trop volumineuse sur %', tg_table_name using errcode = '22001';
  end if;
  return new;
end $fn$;

create or replace function public.table_bornee() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated')
     and pg_catalog.pg_total_relation_size(tg_relid) > tg_argv[0]::bigint then
    raise exception 'table pleine : %', tg_table_name using errcode = 'PT429';
  end if;
  return null;
end $fn$;
revoke all on function public.ligne_bornee(), public.table_bornee() from public, anon, authenticated;

drop trigger if exists aa_ligne_bornee on public.telemetry_events;
create trigger aa_ligne_bornee before insert or update on public.telemetry_events for each row execute function public.ligne_bornee('4096');
drop trigger if exists aa_table_bornee on public.telemetry_events;
create trigger aa_table_bornee before insert on public.telemetry_events for each statement execute function public.table_bornee('2147483648');
drop trigger if exists aa_ligne_bornee on public.client_errors;
create trigger aa_ligne_bornee before insert or update on public.client_errors for each row execute function public.ligne_bornee('8192');
drop trigger if exists aa_table_bornee on public.client_errors;
create trigger aa_table_bornee before insert on public.client_errors for each statement execute function public.table_bornee('268435456');
drop trigger if exists aa_ligne_bornee on public.analytics_events;
create trigger aa_ligne_bornee before insert or update on public.analytics_events for each row execute function public.ligne_bornee('16384');
drop trigger if exists aa_ligne_bornee on public.comment_interactions;
create trigger aa_ligne_bornee before insert or update on public.comment_interactions for each row execute function public.ligne_bornee('16384');
drop trigger if exists aa_ligne_bornee on public.event_comments;
create trigger aa_ligne_bornee before insert or update on public.event_comments for each row execute function public.ligne_bornee('16384');
drop trigger if exists aa_ligne_bornee on public.event_reactions;
create trigger aa_ligne_bornee before insert or update on public.event_reactions for each row execute function public.ligne_bornee('16384');
drop trigger if exists aa_ligne_bornee on public.video_lives;
create trigger aa_ligne_bornee before insert or update on public.video_lives for each row execute function public.ligne_bornee('16384');
drop trigger if exists aa_ligne_bornee on public.stories;
create trigger aa_ligne_bornee before insert or update on public.stories for each row execute function public.ligne_bornee('65536');
drop trigger if exists aa_ligne_bornee on public.events;
create trigger aa_ligne_bornee before insert or update on public.events for each row execute function public.ligne_bornee('65536');
drop trigger if exists aa_ligne_bornee on public.posts;
create trigger aa_ligne_bornee before insert or update on public.posts for each row execute function public.ligne_bornee('262144');
drop trigger if exists aa_ligne_bornee on public.profiles;
create trigger aa_ligne_bornee before insert or update on public.profiles for each row execute function public.ligne_bornee('262144');
drop trigger if exists aa_ligne_bornee on public.notifications;
create trigger aa_ligne_bornee before insert or update on public.notifications for each row execute function public.ligne_bornee('16384');
drop trigger if exists aa_ligne_bornee on public.reports;
create trigger aa_ligne_bornee before insert or update on public.reports for each row execute function public.ligne_bornee('16384');

-- Un budget d'octets par compte et par minute, toutes tables confondues. Une ligne bornée ne suffit pas :
-- un message de 1 Mo, 60 fois par minute, emplit 8 Go en deux heures depuis un seul compte gratuit.
create or replace function public.debit_octets_par_compte() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare moi text := (auth.uid())::text; v integer;
begin
  if moi is null then return new; end if;
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (pg_catalog.date_trunc('minute', pg_catalog.now()), 'octets', moi, pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text))
  on conflict (minute, table_nom, source) do update set n = d.n + excluded.n
  returning d.n into v;
  if v > tg_argv[0]::integer then
    raise exception 'trop de données écrites en une minute' using errcode = 'P0001';
  end if;
  return new;
end $fn$;
revoke all on function public.debit_octets_par_compte() from public, anon, authenticated;
drop trigger if exists ab_debit_octets on public.conv_messages;
create trigger ab_debit_octets before insert or update on public.conv_messages for each row execute function public.debit_octets_par_compte('4194304');
drop trigger if exists ab_debit_octets on public.posts;
create trigger ab_debit_octets before insert or update on public.posts for each row execute function public.debit_octets_par_compte('4194304');
drop trigger if exists ab_debit_octets on public.post_comments;
create trigger ab_debit_octets before insert or update on public.post_comments for each row execute function public.debit_octets_par_compte('4194304');
drop trigger if exists ab_debit_octets on public.stories;
create trigger ab_debit_octets before insert or update on public.stories for each row execute function public.debit_octets_par_compte('4194304');
drop trigger if exists ab_debit_octets on public.events;
create trigger ab_debit_octets before insert or update on public.events for each row execute function public.debit_octets_par_compte('4194304');
drop trigger if exists ab_debit_octets on public.profiles;
create trigger ab_debit_octets before insert or update on public.profiles for each row execute function public.debit_octets_par_compte('4194304');
drop trigger if exists ab_debit_octets on public.user_state;
create trigger ab_debit_octets before insert or update on public.user_state for each row execute function public.debit_octets_par_compte('4194304');

-- ── ② Un plafond sur les UPDATE diffusés ────────────────────────────────────
-- L'UPDATE de `profiles` que pose `sync_profil_passions` compte à part, plus large : ajouter vingt passions
-- d'un coup à l'inscription n'est pas un abus, mais le passer sans compter contournait tout le plafond
-- (`PATCH user_passions` réécrit et diffuse le profil, une fois par ligne).
create or replace function public.debit_maj_par_compte() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare moi text := (auth.uid())::text;
begin
  if moi is not null then
    if pg_catalog.pg_trigger_depth() > 1 then
      perform public.debit_compter(tg_table_name || ':maj:chaine', moi, 150);
    else
      perform public.debit_compter(tg_table_name || ':maj', moi, tg_argv[0]::int);
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $fn$;
revoke all on function public.debit_maj_par_compte() from public, anon, authenticated;
drop trigger if exists trg_debit_maj on public.profiles;
create trigger trg_debit_maj before update on public.profiles for each row execute function public.debit_maj_par_compte('20');
drop trigger if exists trg_debit_maj on public.video_lives;
create trigger trg_debit_maj before update on public.video_lives for each row execute function public.debit_maj_par_compte('30');
drop trigger if exists trg_debit_maj on public.user_passions;
create trigger trg_debit_maj before update or delete on public.user_passions for each row execute function public.debit_maj_par_compte('120');

do $m$
declare src text; fin text;
begin
  select pg_get_functiondef('public.sync_profil_passions(text)'::regprocedure) into src;
  src := replace(src, E'\r\n', E'\n');
  if position('is distinct from' in src) > 0 then return; end if;
  fin := 'where pr.id = p_uid';
  if position(fin in src) = 0 then raise exception 'sync_profil_passions : la forme attendue a changé, relire la fonction'; end if;
  -- Calcul du JSON une seconde fois pour la comparaison : la fonction reste courte, et elle n'écrit plus pour rien.
  execute regexp_replace(src, 'set passions = (coalesce\(\(.*?\), ''\[\]''::jsonb\))\s*' || fin,
    E'set passions = \\1\n   ' || fin || E'\n     and pr.passions is distinct from \\1');
end $m$;

-- ── ③ La clé anon ne rejoint plus le temps réel ─────────────────────────────
drop policy if exists "passio_rt_recevoir_visiteur" on realtime.messages;

-- ── ④ et ⑤ Deux lectures offertes sans compte, bornées ──────────────────────
do $m$
declare src text;
  avant text := 'public.unaccent_immutable(coalesce(q, ''''))';
begin
  select pg_get_functiondef('public.rechercher_passions(text,integer)'::regprocedure) into src;
  if position('left(coalesce(q' in src) > 0 then return; end if;
  if position(avant in src) = 0 then raise exception 'rechercher_passions : la forme attendue a changé, relire la fonction'; end if;
  execute replace(src, avant, 'public.unaccent_immutable(left(coalesce(q, ''''), 100))');
end $m$;

do $m$
declare src text;
  avant text := $a$coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', i.user_id, 'kind', i.kind,
                 'payload', i.payload, 'created_at', i.created_at)
               order by i.created_at)
        from public.comment_interactions i
       where i.comment_id = c.pid
         and i.kind in ('emoji', 'gif')
         and i.payload is not null
    ), '[]'::jsonb) as reactions$a$;
begin
  select pg_get_functiondef('public.fil_compteurs(text[])'::regprocedure) into src;
  src := replace(src, E'\r\n', E'\n');
  if position('limit 200' in src) > 0 then return; end if;
  if position(avant in src) = 0 then raise exception 'fil_compteurs : la forme attendue a changé, relire la fonction'; end if;
  execute replace(src, avant, $n$coalesce((
      -- Les 200 plus récentes : au-delà, l'écran compte déjà par `likes`, et ceci n'est pas paginé.
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', r.user_id, 'kind', r.kind,
                 'payload', r.payload, 'created_at', r.created_at)
               order by r.created_at)
        from (
          select i.user_id, i.kind, i.payload, i.created_at
            from public.comment_interactions i
           where i.comment_id = c.pid
             and i.kind in ('emoji', 'gif')
             and i.payload is not null
           order by i.created_at desc
           limit 200
        ) r
    ), '[]'::jsonb) as reactions$n$);
end $m$;

-- ── ⑥ Les pièces jointes ont leur liste de types ────────────────────────────
update storage.buckets set allowed_mime_types = array[
  'image/jpeg','image/jpg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','image/bmp',
  'video/mp4','video/webm','video/quicktime','video/3gpp','video/x-m4v',
  'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/webm','audio/ogg','audio/wav','audio/x-wav','audio/flac',
  -- Les documents que propose l'écran de pièce jointe (`#attachDocFile`). Ni HTML, ni SVG, ni script.
  'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','application/zip','application/x-zip-compressed'
] where id = 'attachments';

-- ── ⑦ Modération : une trace, et un masque qui couvre le fil ────────────────
create or replace function public.contenus_masques_journal() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.moderation_actions (action, target_type, target_id, note)
  values ('note', new.target_type, new.target_id,
          left('contenus_masques ' || tg_op || ' decision=' || coalesce(new.decision, 'null') || ' signaleurs=' || new.signaleurs, 500));
  return null;
end $fn$;
revoke all on function public.contenus_masques_journal() from public, anon, authenticated;
drop trigger if exists trg_contenus_masques_journal on public.contenus_masques;
create trigger trg_contenus_masques_journal after insert or update on public.contenus_masques
  for each row execute function public.contenus_masques_journal();

do $m$
declare src text;
  avant text := $a$p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or public.abonne_accepte_non_bloque(p.author_id)$a$;
begin
  select pg_get_functiondef('public.post_is_visible(text)'::regprocedure) into src;
  src := replace(src, E'\r\n', E'\n');
  if position('post_masque' in src) > 0 then return; end if;
  if position(avant in src) = 0 then raise exception 'post_is_visible : la forme attendue a changé, relire la fonction'; end if;
  execute replace(src, avant, $n$p.author_id = (select auth.uid())::text
        -- Même règle que la policy restrictive de `posts` : masquée, une publication ne se lit plus
        -- par ses commentaires ni par ses « j'aime », sauf pour son auteur.
        or (not public.post_masque(p.id) and (
              not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
              or public.abonne_accepte_non_bloque(p.author_id)))$n$);
end $m$;

-- ── ⑧ Une cardinalité sur les passions d'un compte ──────────────────────────
create or replace function public.user_passions_borne() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is not null and (select count(*) from public.user_passions u where u.user_id = new.user_id) >= 200 then
    raise exception 'trop de passions sur ce compte' using errcode = 'P0001';
  end if;
  return new;
end $fn$;
revoke all on function public.user_passions_borne() from public, anon, authenticated;
drop trigger if exists aa_user_passions_borne on public.user_passions;
create trigger aa_user_passions_borne before insert on public.user_passions for each row execute function public.user_passions_borne();

-- ── ⑨ Le statut d'une activité : deux valeurs ───────────────────────────────
alter table public.events drop constraint if exists events_status_valeurs;
alter table public.events add constraint events_status_valeurs check (status in ('active', 'cancelled')) not valid;
alter table public.events validate constraint events_status_valeurs;

-- ── ⑩ A-15 : retirer un compte supprimé des co-organisations ────────────────
create or replace function public.retirer_co_organisateur(p_uid text) returns void
language sql security definer set search_path = '' as $fn$
  update public.events set co_organizers = co_organizers - p_uid where co_organizers ? p_uid;
$fn$;
revoke all on function public.retirer_co_organisateur(text) from public, anon, authenticated;
grant execute on function public.retirer_co_organisateur(text) to service_role;

-- ── TABLEAU DE VERDICT ──────────────────────────────────────────────────────
select 'télémétrie et erreurs : ligne et table bornées' as controle,
       case when (select count(*) from pg_trigger where tgname in ('aa_ligne_bornee', 'aa_table_bornee') and tgenabled = 'O'
                   and tgrelid in ('public.telemetry_events'::regclass, 'public.client_errors'::regclass)) = 4 then 'OK' else 'ECHEC' end as valeur
union all select 'tables de contenu : ligne bornée',
       case when (select count(*) from pg_trigger where tgname = 'aa_ligne_bornee' and tgenabled = 'O') = 13 then 'OK' else 'ECHEC' end
union all select 'UPDATE diffusés plafonnés',
       case when (select count(*) from pg_trigger where tgname = 'trg_debit_maj' and tgenabled = 'O') = 3 then 'OK' else 'ECHEC' end
union all select 'la clé anon ne rejoint plus le temps réel',
       case when not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'passio_rt_recevoir_visiteur') then 'OK' else 'ECHEC' end
union all select 'rechercher_passions : texte borné',
       case when (select prosrc from pg_proc where oid = 'public.rechercher_passions(text,integer)'::regprocedure) like '%left(coalesce(q%' then 'OK' else 'ECHEC' end
union all select 'fil_compteurs : réactions bornées',
       case when (select prosrc from pg_proc where oid = 'public.fil_compteurs(text[])'::regprocedure) like '%limit 200%' then 'OK' else 'ECHEC' end
union all select 'attachments : liste de types',
       case when (select allowed_mime_types is not null from storage.buckets where id = 'attachments') then 'OK' else 'ECHEC' end
union all select 'masquage journalisé, masque propagé',
       case when exists (select 1 from pg_trigger where tgname = 'trg_contenus_masques_journal' and tgenabled = 'O')
             and (select prosrc from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure) like '%post_masque%' then 'OK' else 'ECHEC' end
union all select 'user_passions bornée, statut d''activité fermé',
       case when exists (select 1 from pg_trigger where tgname = 'aa_user_passions_borne' and tgenabled = 'O')
             and exists (select 1 from pg_constraint where conname = 'events_status_valeurs' and convalidated) then 'OK' else 'ECHEC' end;

commit;
