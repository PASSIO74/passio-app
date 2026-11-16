-- Cas du lot « abus, plafonds, capacité » du 2026-11-15, joués sur la base des lots du 2026-11-06 et
-- 2026-11-07 (schéma `banc` et comptes déjà là). Joués DEUX fois par le banc : AVANT les trois
-- migrations du lot (chaque défaut est mesuré) et APRÈS (il est fermé, le client passe toujours).
-- La phase se lit sur le schéma : `debit_jour_compter` n'existe qu'après. Le banc vérifie à part que
-- la seconde passe est bien « après ».
set client_min_messages = warning;
create table if not exists banc.resultats_lot5 (n serial primary key, phase text, cas text not null, obtenu text, attendu text, ok boolean);
create or replace function banc.phase5() returns text language sql stable as $f$
  select case when to_regprocedure('public.debit_jour_compter(text,text,bigint,bigint)') is null then 'avant' else 'apres' end
$f$;
create or replace function banc.c5(p_cas text, p_obtenu text, p_avant text, p_apres text) returns void language plpgsql as $f$
declare attendu text := case when banc.phase5() = 'avant' then p_avant else p_apres end;
begin
  insert into banc.resultats_lot5 (phase, cas, obtenu, attendu, ok) values (banc.phase5(), p_cas, p_obtenu, attendu, p_obtenu is not distinct from attendu);
end $f$;
-- Pose un compteur du jour (sans effet avant : la table n'existe pas).
create or replace function banc.jour(p_cle text, p_source text, p_n bigint) returns void language plpgsql as $f$
begin
  if to_regclass('public.debit_jour') is null then return; end if;
  execute 'delete from public.debit_jour where cle = $1 and source = $2' using p_cle, p_source;
  execute 'insert into public.debit_jour (jour, cle, source, n) values ((now() at time zone ''UTC'')::date, $1, $2, $3)' using p_cle, p_source, p_n;
end $f$;
-- Lit une valeur par SQL dynamique : avant le lot, une table ou une fonction absente rend « absent »
-- (une référence directe ferait échouer l'analyse de toute l'instruction, même dans une branche morte).
create or replace function banc.dyn(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'nul');
exception when undefined_table or undefined_function then
  return 'absent';
end $f$;
delete from public.debit_ecritures;

-- Un compte créé à l'instant (N), à côté des comptes de 30 jours du décor.
create or replace function banc.idn() returns text language sql immutable as $f$ select '44444444-0000-4000-8000-000000000010' $f$;
insert into auth.users (id, email, email_confirmed_at, created_at)
  values (banc.idn()::uuid, 'n@passio-e2e.test', now(), now()) on conflict (id) do nothing;
insert into public.profiles (id, username) values (banc.idn(), 'comptenouveau') on conflict (id) do nothing;
insert into public.user_safety (user_id, majority_at) values (banc.idn(), date '2000-01-01') on conflict do nothing;

-- ═══ ① Un plafond par jour, plus strict la première semaine ═══════════════════════════════════
select banc.jour('posts', banc.idn(), 150);
select banc.c5('Compte neuf, 150 publications déjà aujourd''hui : la suivante',
  banc.sous(banc.idn(), $s$insert into public.posts (id, author_id, content) values ('p5_n1', (auth.uid())::text, 'x')$s$), 'ok:1', 'err:P0001');
select banc.jour('posts', banc.id('A'), 150);
select banc.c5('Compte de 30 jours, 150 aujourd''hui : la suivante passe',
  banc.sous(banc.id('A'), $s$insert into public.posts (id, author_id, content) values ('p5_a1', (auth.uid())::text, 'x')$s$), 'ok:1', 'ok:1');
select banc.jour('posts', banc.id('A'), 600);
select banc.c5('Compte de 30 jours, 600 aujourd''hui : la suivante',
  banc.sous(banc.id('A'), $s$insert into public.posts (id, author_id, content) values ('p5_a2', (auth.uid())::text, 'x')$s$), 'ok:1', 'err:P0001');
select banc.c5('Le refus porte « rate limit » : le client le classe en « limite », pas en défaut',
  banc.dyn($s$select (prosrc like '%rate limit: plafond journalier%')::text from pg_proc where oid = to_regprocedure('public.debit_jour_compter(text,text,bigint,bigint)')$s$),
  'nul', 'true');
select banc.sous(banc.id('B'), $s$insert into public.posts (id, author_id, content) values ('p5_b1', (auth.uid())::text, 'x')$s$);
select banc.c5('Le compteur du jour avance à chaque écriture acceptée',
  banc.dyn(format($s$select n::text from public.debit_jour where cle = 'posts' and source = %L$s$, banc.id('B'))), 'absent', '1');
do $d$
declare r text;
begin
  begin
    insert into public.posts (id, author_id, content) values ('p5_srv', banc.id('A'), 'écriture de service');
    r := 'ok';
  exception when others then r := 'err:' || sqlstate;
  end;
  perform banc.c5('Une écriture de service (restauration, tâche) n''est pas plafonnée au jour', r, 'ok', 'ok');
  perform banc.c5('… et ne touche pas le compteur du jour du compte',
    banc.dyn(format($s$select n::text from public.debit_jour where cle = 'posts' and source = %L$s$, banc.id('A'))), 'absent', '600');
end $d$;

-- ═══ ② Les octets du jour, pour ce qui s'accumule ═══════════════════════════════════════════════
select banc.jour('octets', banc.idn(), 16777216);
select banc.c5('Compte neuf, 16 Mio écrits aujourd''hui : un commentaire de plus',
  banc.sous(banc.idn(), $s$insert into public.post_comments (id, post_id, author_id, content) values ('pc5_n1', 'post_banc_a', (auth.uid())::text, 'encore')$s$), 'ok:1', 'err:P0001');
select banc.jour('octets', banc.id('B'), 67108864);
select banc.c5('Compte installé, 64 Mio aujourd''hui : son état (réécrit sur une ligne) passe encore',
  banc.sous(banc.id('B'), $s$insert into public.user_state (user_id, data) values ((auth.uid())::text, '{"a":1}'::jsonb) on conflict (user_id) do update set data = excluded.data$s$), 'ok:1', 'ok:1');
select banc.c5('… et son profil aussi',
  banc.sous(banc.id('B'), $s$update public.profiles set bio = 'bio du jour' where id = (auth.uid())::text$s$), 'ok:1', 'ok:1');
select banc.c5('… mais pas une publication de plus',
  banc.sous(banc.id('B'), $s$insert into public.posts (id, author_id, content) values ('p5_b2', (auth.uid())::text, 'x')$s$), 'ok:1', 'err:P0001');
select banc.c5('analytics_events entre dans le budget d''octets',
  (select count(*)::text from pg_trigger where tgname = 'ab_debit_octets' and tgrelid = 'public.analytics_events'::regclass), '0', '1');

-- ═══ ③ Une adresse de média est une adresse https ══════════════════════════════════════════════
delete from public.debit_ecritures;
select banc.c5('Publication avec une image embarquée (data:)',
  banc.sous(banc.id('M'), $s$insert into public.posts (id, author_id, content, media_url) values ('p5_d1', (auth.uid())::text, 'x', 'data:image/png;base64,AAAA')$s$), 'ok:1', 'err:23514');
select banc.c5('Client : publication avec une adresse https',
  banc.sous(banc.id('M'), $s$insert into public.posts (id, author_id, content, media_url) values ('p5_h1', (auth.uid())::text, 'x', 'https://exemple.test/a.jpg')$s$), 'ok:1', 'ok:1');
select banc.c5('Photo de profil embarquée (data:)',
  banc.sous(banc.id('M'), $s$update public.profiles set avatar_url = 'data:image/png;base64,AAAA' where id = (auth.uid())::text$s$), 'ok:1', 'err:23514');
select banc.c5('Client : photo de profil https',
  banc.sous(banc.id('M'), $s$update public.profiles set avatar_url = 'https://exemple.test/p.jpg' where id = (auth.uid())::text$s$), 'ok:1', 'ok:1');
select banc.c5('Adresse de média de plus de 2 048 caractères',
  banc.sous(banc.id('M'), format($s$insert into public.posts (id, author_id, content, media_url) values ('p5_l1', (auth.uid())::text, 'x', %L)$s$, 'https://exemple.test/' || repeat('a', 2100))), 'ok:1', 'err:23514');

-- ═══ ④ Quota Storage existant conservé, aucun cache permissif ═══
select banc.c5('Quota Storage : fonction STABLE conservée',
  (select provolatile::text from pg_proc where oid = 'public.quota_stockage_ok()'::regprocedure), 's', 's');

-- ═══ ⑤ Recherche de passions : rien sous trois caractères ═══════════════════════════════════════
insert into public.passions (id, label, normalized_label, recherche, status, popularity)
  values ('p5_guitare', 'Guitare', 'guitare', 'guitare', 'active', 10),
         ('p5_gateau', 'Gâteau', 'gateau', 'gateau', 'active', 5)
  on conflict (id) do nothing;
select banc.c5('Visiteur : « ga » (deux lettres)',
  banc.val(null, $s$select count(*)::text from public.rechercher_passions('ga', 20) where id like 'p5_%'$s$), '1', '0');
select banc.c5('Visiteur : « gui » (trois lettres) trouve toujours',
  banc.val(null, $s$select string_agg(id, ',') from public.rechercher_passions('gui', 20) where id like 'p5_%'$s$), 'p5_guitare', 'p5_guitare');
select banc.c5('Visiteur : vide rend toujours les populaires',
  banc.val(null, $s$select (count(*) > 0)::text from public.rechercher_passions('', 20)$s$), 'true', 'true');

-- ═══ ⑥ fil_compteurs : mêmes réponses, visibilité décidée une fois par publication ═════════════
-- P est privé, K le suit (décor). Une publication publique de A, une privée de P.
do $d$ begin
  perform set_config('session_replication_role', 'replica', true);
  insert into public.posts (id, author_id, content) values ('p5_pub', banc.id('A'), 'publique'), ('p5_priv', banc.id('P'), 'privée') on conflict (id) do nothing;
  insert into public.post_likes (post_id, user_id) values ('p5_pub', banc.id('A')), ('p5_pub', banc.id('B')), ('p5_pub', banc.id('M')),
    ('p5_priv', banc.id('P')), ('p5_priv', banc.id('K')), ('p5_priv', banc.id('M')) on conflict do nothing;
  insert into public.post_comments (id, post_id, author_id, content) values ('pc5_1', 'p5_pub', banc.id('B'), 'un'), ('pc5_2', 'p5_pub', banc.id('M'), 'deux'),
    ('pc5_3', 'p5_priv', banc.id('K'), 'abonné'), ('pc5_4', 'p5_priv', banc.id('M'), 'moi') on conflict (id) do nothing;
  insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values
    ('ci5_1', 'p5_pub', 'p5_pub', banc.id('B'), 'emoji', '👍'),
    ('ci5_2', 'p5_priv', 'p5_priv', banc.id('K'), 'emoji', '🔥'),
    ('ci5_3', 'p5_priv', 'p5_priv', banc.id('M'), 'emoji', '❤️') on conflict (id) do nothing;
  perform set_config('session_replication_role', 'origin', true);
end $d$;
create or replace function banc.compteurs(p_uid text, p_post text) returns text language sql as $f$
  select banc.val(p_uid, format($s$select likes || '/' || commentaires || '/' || aime || '/' || jsonb_array_length(apercus) || '/' || jsonb_array_length(reactions) from public.fil_compteurs(array[%L])$s$, p_post))
$f$;
select banc.c5('Visiteur, publication publique', banc.compteurs(null, 'p5_pub'), '3/2/false/2/1', '3/2/false/2/1');
select banc.c5('Visiteur, publication d''un compte privé', banc.compteurs(null, 'p5_priv'), '0/0/false/0/0', '0/0/false/0/0');
select banc.c5('Abonné accepté, publication privée', banc.compteurs(banc.id('K'), 'p5_priv'), '3/2/true/2/2', '3/2/true/2/2');
select banc.c5('Non-abonné qui a aimé : seulement ses propres lignes', banc.compteurs(banc.id('M'), 'p5_priv'), '1/1/true/1/1', '1/1/true/1/1');
select banc.c5('L''autrice', banc.compteurs(banc.id('P'), 'p5_priv'), '3/2/true/2/2', '3/2/true/2/2');
select banc.c5('Identifiant inconnu : zéro partout', banc.compteurs(banc.id('M'), 'p5_inconnu'), '0/0/false/0/0', '0/0/false/0/0');
select banc.c5('fil_compteurs : définisseur après le lot',
  (select prosecdef::text from pg_proc where oid = 'public.fil_compteurs(text[])'::regprocedure), 'false', 'true');

-- ═══ ⑦ Télémétrie : purge identique, par lots, borne notée ═════════════════════════════════════
delete from public.telemetry_events where session_id = 'banc5';
-- Import historique du décor seulement : le trigger d'identité remet autrement
-- received_at à maintenant, même pour postgres. Les tests de purge doivent lire
-- de vraies lignes anciennes, sans modifier cette frontière côté application.
do $historique$ begin
perform set_config('session_replication_role', 'replica', true);
insert into public.telemetry_events (type, session_id, severity, received_at) values
  ('nav', 'banc5', 'info', now() - interval '8 days'),
  ('error', 'banc5', 'error', now() - interval '8 days'),
  ('nav', 'banc5', 'info', now() - interval '4 days'),
  ('error', 'banc5', 'error', now() - interval '4 days'),
  ('api', 'banc5', 'warn', now() - interval '4 days'),
  ('nav', 'banc5', 'info', now() - interval '1 day');
perform set_config('session_replication_role', 'origin', true);
end $historique$;
select public.purge_telemetrie_paliers();
select banc.c5('Purge : ce qui reste (erreurs de 4 jours, ligne d''hier)',
  (select string_agg(type || ':' || severity, ',' order by type, severity) from public.telemetry_events where session_id = 'banc5'),
  'api:warn,error:error,nav:info', 'api:warn,error:error,nav:info');
select banc.c5('Purge : la borne du rattrapage est notée',
  banc.dyn($s$select count(*)::text from public.telemetrie_purge_etat$s$), 'absent', '1');
select banc.c5('Rattrapage : rien au-delà de la borne',
  banc.dyn($s$select public.purge_telemetrie_rattrapage()::text$s$), 'absent', '0');
select banc.c5('Télémétrie anonyme ordinaire : toujours acceptée',
  banc.anon($s$insert into public.telemetry_events (type, screen, session_id, device_id, meta) values ('nav', 'feed', 's5', 'd', '{"a":1}'::jsonb)$s$), 'ok', 'ok');
select banc.c5('Le visiteur ne peut pas antidater une ligne après le décor historique',
  banc.anon($s$insert into public.telemetry_events (type, session_id, received_at) values ('nav', 'banc5_horloge', now() - interval '8 days')$s$), 'ok', 'ok');
select banc.c5('Le trigger d''horloge serveur est rétabli avant les vrais appels',
  (select (received_at > now() - interval '1 minute')::text from public.telemetry_events where session_id = 'banc5_horloge'), 'true', 'true');
