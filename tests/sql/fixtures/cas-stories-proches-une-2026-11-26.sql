-- Cas du banc tests/sql/migration-stories-proches-une.test.sh. Identités simulées, données synthétiques.
-- Tout passe par anon / authenticated (SET ROLE réel, claims avec session) : un test sous un compte
-- administrateur ne prouve rien.
--
-- Décor (profils et sessions posés par medias-proteges-socle.sql : 1,3,4,5,6 privés, 2 et 7+ publics,
-- 3→1 et 5→1 abonnés acceptés, 4→1 en attente, 1 bloque 5, sessions 1 à 6) :
--   A = 2  auteur PUBLIC            F = 3  ami proche de A (et de P, dont il est abonné accepté)
--   N = 4  abonné accepté de A, PAS dans la liste
--   U = 6  inconnu (dans la liste de P sans être son abonné)
--   K = 7  dans la liste de A, puis il BLOQUE A
--   P = 1  auteur PRIVÉ             anon = visiteur sans compte
set client_min_messages = warning;
create schema banc_sp;
create table banc_sp.resultats (n serial primary key, cas text not null, obtenu text, attendu text, ok boolean);
create function banc_sp.uid(i integer) returns text language sql immutable as $$
  select '00000000-0000-4000-8000-' || lpad(i::text, 12, '0') $$;
create function banc_sp.claims(i integer) returns text language sql immutable as $$
  select case when i is null then '{}' else jsonb_build_object('sub', banc_sp.uid(i), 'role', 'authenticated',
    'session_id', '10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::text end $$;
create function banc_sp.sous(i integer, p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  begin
    perform set_config('request.jwt.claims', banc_sp.claims(i), true);
    execute case when i is null then 'set local role anon' else 'set local role authenticated' end;
    execute p_sql;
    get diagnostics n = row_count;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return 'ok:' || n;
  exception when others then
    execute 'reset role';
    return 'err:' || sqlstate;
  end;
end $f$;
create function banc_sp.val(i integer, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  begin
    perform set_config('request.jwt.claims', banc_sp.claims(i), true);
    execute case when i is null then 'set local role anon' else 'set local role authenticated' end;
    execute p_sql into v;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v, 'nul');
  exception when others then
    execute 'reset role';
    return 'err:' || sqlstate;
  end;
end $f$;
create function banc_sp.cas(p_cas text, p_obtenu text, p_attendu text) returns void language sql as $f$
  insert into banc_sp.resultats (cas, obtenu, attendu, ok) values (p_cas, p_obtenu, p_attendu, p_obtenu is not distinct from p_attendu);
$f$;
-- Nombre de stories `id` lisibles par i.
create function banc_sp.voit(i integer, id text) returns text language sql as $f$
  select banc_sp.val(i, format('select count(*)::text from public.stories where id = %L', id)) $f$;
-- Nombre de variantes résolues par media_resoudre pour la story `id` (asset n).
create function banc_sp.media(i integer, id text, n integer) returns text language sql as $f$
  select banc_sp.val(i, format('select count(*)::text from public.media_resoudre(%L, %L, %L::uuid, %L)', 'stories', id,
    ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0')), 'original')) $f$;

insert into auth.sessions (id, user_id) values ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000007');
insert into public.follows (follower_id, following_id, status) values (banc_sp.uid(4), banc_sp.uid(2), 'accepted');
select banc_sp.cas('décor : N est abonné accepté de A', (select status from public.follows where follower_id = banc_sp.uid(4) and following_id = banc_sp.uid(2)), 'accepted');
update public.reglages_distants set valeur = '{"actif":true}' where cle = 'medias_proteges';

-- ── Stories (posées en administrateur : l'horodatage d'une story ancienne ne se forge pas) ──────
insert into public.stories (id, author_id, content, audience, created_at, overlays) values
  ('sT',    banc_sp.uid(2), 'pour tous',          'tous',    now() at time zone 'UTC', null),
  ('sC',    banc_sp.uid(2), 'pour les proches',   'proches', now() at time zone 'UTC',
     '[{"type":"sondage","q":"?","a":"Oui","b":"Non"}]'::jsonb),
  ('sPC',   banc_sp.uid(1), 'privé et proches',   'proches', now() at time zone 'UTC', null),
  ('sOld',  banc_sp.uid(2), 'ancienne, à la une', 'tous',    (now() - interval '3 days') at time zone 'UTC', null),
  ('sOldC', banc_sp.uid(2), 'ancienne proches',   'proches', (now() - interval '3 days') at time zone 'UTC', null),
  ('sOld2', banc_sp.uid(2), 'ancienne, oubliée',  'tous',    (now() - interval '3 days') at time zone 'UTC', null);
-- `rate_limit_insert` impose `created_at := now()` à l'insertion (l'horodatage d'un client ne passe
-- jamais) : les stories anciennes sont VIEILLIES ensuite, en administrateur.
update public.stories set created_at = (now() - interval '3 days') at time zone 'UTC' where id in ('sOld', 'sOldC', 'sOld2');
select banc_sp.cas('décor : trois stories de 3 jours', (select count(*)::text from public.stories where created_at < now() - interval '48 hours'), '3');
insert into public.story_views (story_id, user_id) values ('sOld', banc_sp.uid(4)), ('sOld2', banc_sp.uid(4));
-- Médias protégés : réservation → asset → objet (en administrateur ; la liaison réelle est éprouvée
-- par le banc des médias). Asset n ↔ story.
insert into public.media_reservations (id, owner_id, source_type, source_id, variants, created_at, expires_at)
  select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, banc_sp.uid(2), 'stories', sid,
         '[{"variant":"original","mime_type":"image/webp","byte_size":8}]'::jsonb, c, c + interval '15 minutes'
    from (values (1, 'sC', now()), (2, 'sOld', now() - interval '3 days'), (3, 'sOldC', now() - interval '3 days'),
                 (4, 'sOld2', now() - interval '3 days'), (5, 'sT', now())) v(n, sid, c);
insert into public.media_assets (id, owner_id, story_id, created_at)
  select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, banc_sp.uid(2), sid, c
    from (values (1, 'sC', now()), (2, 'sOld', now() - interval '3 days'), (3, 'sOldC', now() - interval '3 days'),
                 (4, 'sOld2', now() - interval '3 days'), (5, 'sT', now())) v(n, sid, c);
insert into public.media_objects (asset_id, variant, storage_object_id, object_key, mime_type, byte_size)
  select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'original',
         ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
         banc_sp.uid(2) || '/20000000-0000-4000-8000-' || lpad(n::text, 12, '0') || '/original.webp', 'image/webp', 8
    from generate_series(1, 5) n;

-- ── ① La liste « Amis proches » : à l'auteur SEUL ────────────────────────────────────────────────
select banc_sp.cas('A ajoute F à ses amis proches', banc_sp.sous(2, format('insert into public.amis_proches (ami_id) values (%L)', banc_sp.uid(3))), 'ok:1');
select banc_sp.cas('A ajoute K à ses amis proches', banc_sp.sous(2, format('insert into public.amis_proches (ami_id) values (%L)', banc_sp.uid(7))), 'ok:1');
select banc_sp.cas('P ajoute F (son abonné) et U (pas son abonné)', banc_sp.sous(1, format('insert into public.amis_proches (ami_id) values (%L), (%L)', banc_sp.uid(3), banc_sp.uid(6))), 'ok:2');
select banc_sp.cas('A ne s''ajoute pas lui-même', banc_sp.sous(2, format('insert into public.amis_proches (ami_id) values (%L)', banc_sp.uid(2))), 'err:23514');
select banc_sp.cas('A n''ajoute pas deux fois F', banc_sp.sous(2, format('insert into public.amis_proches (ami_id) values (%L)', banc_sp.uid(3))), 'err:23505');
select banc_sp.cas('U n''écrit pas dans la liste de A (owner_id non fourni)', banc_sp.sous(6, format('insert into public.amis_proches (owner_id, ami_id) values (%L, %L)', banc_sp.uid(2), banc_sp.uid(6))), 'err:42501');
select banc_sp.cas('A ne date pas une entrée', banc_sp.sous(2, format('insert into public.amis_proches (ami_id, created_at) values (%L, %L)', banc_sp.uid(9), '2000-01-01')), 'err:42501');
select banc_sp.cas('A lit sa liste (F, K)', banc_sp.val(2, 'select count(*)::text from public.amis_proches'), '2');
select banc_sp.cas('F ne lit PAS la liste de A (ni celle de P)', banc_sp.val(3, 'select count(*)::text from public.amis_proches'), '0');
select banc_sp.cas('N ne lit pas la liste de A', banc_sp.val(4, 'select count(*)::text from public.amis_proches'), '0');
select banc_sp.cas('un visiteur ne lit aucune liste', banc_sp.val(null, 'select count(*)::text from public.amis_proches'), 'err:42501');
select banc_sp.cas('F ne se retire pas de la liste de A', banc_sp.sous(3, 'delete from public.amis_proches'), 'ok:0');
select banc_sp.cas('aucun UPDATE de la liste', banc_sp.sous(2, format('update public.amis_proches set ami_id = %L', banc_sp.uid(9))), 'err:42501');
-- Un compte bloqué (dans un sens ou l'autre) ne s'ajoute pas.
insert into public.blocks (blocker_id, blocked_id) values (banc_sp.uid(2), banc_sp.uid(8));
select banc_sp.cas('A n''ajoute pas un compte qu''il a bloqué', banc_sp.sous(2, format('insert into public.amis_proches (ami_id) values (%L)', banc_sp.uid(8))), 'err:42501');
-- K, déjà dans la liste, bloque A ensuite.
insert into public.blocks (blocker_id, blocked_id) values (banc_sp.uid(7), banc_sp.uid(2));

-- ── ② Lire une story « proches » ─────────────────────────────────────────────────────────────────
select banc_sp.cas('A lit sa story proches', banc_sp.voit(2, 'sC'), '1');
select banc_sp.cas('F (ami proche) lit la story proches de A', banc_sp.voit(3, 'sC'), '1');
select banc_sp.cas('N (abonné, pas proche) ne la lit pas', banc_sp.voit(4, 'sC'), '0');
select banc_sp.cas('N lit la story « tous » de A', banc_sp.voit(4, 'sT'), '1');
select banc_sp.cas('U (inconnu) ne la lit pas', banc_sp.voit(6, 'sC'), '0');
select banc_sp.cas('K (dans la liste, a bloqué A) ne la lit pas', banc_sp.voit(7, 'sC'), '0');
select banc_sp.cas('un visiteur ne la lit pas', banc_sp.voit(null, 'sC'), '0');
select banc_sp.cas('un visiteur lit la story « tous » de A', banc_sp.voit(null, 'sT'), '1');
select banc_sp.cas('un visiteur : aucune story proches dans toute la table', banc_sp.val(null, $s$select count(*)::text from public.stories where audience = 'proches'$s$), '0');
select banc_sp.cas('N : aucune story proches dans toute la table', banc_sp.val(4, $s$select count(*)::text from public.stories where audience = 'proches'$s$), '0');
select banc_sp.cas('compte PRIVÉ : F (abonné + liste) lit la story proches de P', banc_sp.voit(3, 'sPC'), '1');
select banc_sp.cas('compte PRIVÉ : U (liste sans être abonné) ne la lit pas', banc_sp.voit(6, 'sPC'), '0');
select banc_sp.cas('compte PRIVÉ : N (abonné en attente) ne la lit pas', banc_sp.voit(4, 'sPC'), '0');
select banc_sp.cas('compte PRIVÉ : 5 (abonné accepté, bloqué par P, hors liste) ne la lit pas', banc_sp.voit(5, 'sPC'), '0');
-- Production : droits de TABLE, aucune policy UPDATE → 0 ligne ; banc : droits par colonne → 42501.
select banc_sp.cas('l''audience ne change pas après publication (aucun UPDATE)',
  case when banc_sp.sous(2, $s$update public.stories set audience = 'tous' where id = 'sC'$s$) in ('ok:0', 'err:42501')
       then (select audience from public.stories where id = 'sC') else 'modifiée' end, 'proches');
select banc_sp.cas('A publie une story proches', banc_sp.sous(2, format($s$insert into public.stories (id, author_id, content, audience) values ('sNew', %L, 'x', 'proches')$s$, banc_sp.uid(2))), 'ok:1');
select banc_sp.cas('A publie une story proches AVEC RETURNING, comme le client (red team P1)', banc_sp.val(2, format($s$with i as (insert into public.stories (id, author_id, content, audience) values ('sRet', %L, 'x', 'proches') returning id) select id from i$s$, banc_sp.uid(2))), 'sRet');
select banc_sp.cas('… et N ne la lit toujours pas', banc_sp.voit(4, 'sRet'), '0');
select banc_sp.cas('une audience hors liste est refusée', banc_sp.sous(2, format($s$insert into public.stories (id, author_id, content, audience) values ('sBad', %L, 'x', 'amis')$s$, banc_sp.uid(2))), 'err:23514');
select banc_sp.cas('sans audience, une story est pour tous (ancien client)', banc_sp.val(2, format($s$with i as (insert into public.stories (id, author_id, content) values ('sOldClient', %L, 'x') returning audience) select audience from i$s$, banc_sp.uid(2))), 'tous');

-- ── ③ Pas d'oracle ───────────────────────────────────────────────────────────────────────────────
select banc_sp.cas('story_proches_autorise : F sur sC', banc_sp.val(3, $s$select public.story_proches_autorise('sC')::text$s$), 'true');
select banc_sp.cas('story_proches_autorise : N sur sC', banc_sp.val(4, $s$select public.story_proches_autorise('sC')::text$s$), 'false');
select banc_sp.cas('story_proches_autorise : faux sur une story « tous » (pas d''oracle)', banc_sp.val(4, $s$select public.story_proches_autorise('sT')::text$s$), 'false');
select banc_sp.cas('story_proches_autorise : faux sur un identifiant inconnu', banc_sp.val(3, $s$select public.story_proches_autorise('nexistepas')::text$s$), 'false');
select banc_sp.cas('story_proches_autorise : U (liste de P, pas abonné) n''apprend rien (red team P3)', banc_sp.val(6, $s$select public.story_proches_autorise('sPC')::text$s$), 'false');
select banc_sp.cas('story_proches_autorise : F (liste de P ET abonné) — vrai', banc_sp.val(3, $s$select public.story_proches_autorise('sPC')::text$s$), 'true');
select banc_sp.cas('story_proches_autorise : anon n''exécute pas', banc_sp.val(null, $s$select public.story_proches_autorise('sC')::text$s$), 'err:42501');

-- ── ④ J'aime, vues, commentaires, sondage : story_visible applique la règle ──────────────────────
select banc_sp.cas('story_visible : F sur sC', banc_sp.val(3, $s$select public.story_visible('sC')::text$s$), 'true');
select banc_sp.cas('story_visible : N sur sC', banc_sp.val(4, $s$select public.story_visible('sC')::text$s$), 'false');
select banc_sp.cas('story_visible : K sur sC (bloqué)', banc_sp.val(7, $s$select public.story_visible('sC')::text$s$), 'false');
select banc_sp.cas('story_visible : A sur sC', banc_sp.val(2, $s$select public.story_visible('sC')::text$s$), 'true');
select banc_sp.cas('story_visible : N sur sT (inchangé)', banc_sp.val(4, $s$select public.story_visible('sT')::text$s$), 'true');
select banc_sp.cas('N n''aime pas la story proches', banc_sp.sous(4, $s$insert into public.story_likes (story_id) values ('sC')$s$), 'err:42501');
select banc_sp.cas('F aime la story proches', banc_sp.sous(3, $s$insert into public.story_likes (story_id) values ('sC')$s$), 'ok:1');
select banc_sp.cas('N ne marque pas « vue » la story proches', banc_sp.sous(4, format($s$insert into public.story_views (story_id, user_id) values ('sC', %L)$s$, banc_sp.uid(4))), 'err:42501');
select banc_sp.cas('F marque « vue » la story proches', banc_sp.sous(3, format($s$insert into public.story_views (story_id, user_id) values ('sC', %L)$s$, banc_sp.uid(3))), 'ok:1');
select banc_sp.cas('N ne commente pas la story proches', banc_sp.sous(4, format($s$insert into public.story_comments (story_id, author_id, content) values ('sC', %L, 'x')$s$, banc_sp.uid(4))), 'err:42501');
select banc_sp.cas('N ne vote pas au sondage de la story proches', banc_sp.sous(4, $s$insert into public.story_sondage_votes (story_id, choix) values ('sC', 0)$s$), 'err:42501');
select banc_sp.cas('F vote au sondage de la story proches', banc_sp.sous(3, $s$insert into public.story_sondage_votes (story_id, choix) values ('sC', 1)$s$), 'ok:1');
select banc_sp.cas('N ne lit pas les résultats du sondage', banc_sp.val(4, $s$select public.story_sondage_resultats('sC')::text$s$), 'nul');

-- ── ⑤ Stories à la une ───────────────────────────────────────────────────────────────────────────
select banc_sp.cas('A épingle sOld dans « Voyages »', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sOld', 'Voyages')$s$), 'ok:1');
select banc_sp.cas('A épingle sT dans « Voyages »', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sT', 'Voyages')$s$), 'ok:1');
select banc_sp.cas('A épingle sOldC (proches) dans « Amis »', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sOldC', 'Amis')$s$), 'ok:1');
select banc_sp.cas('P épingle sPC dans « Moi »', banc_sp.sous(1, $s$insert into public.stories_une (story_id, groupe) values ('sPC', 'Moi')$s$), 'ok:1');
select banc_sp.cas('F n''épingle pas la story de A', banc_sp.sous(3, $s$insert into public.stories_une (story_id, groupe) values ('sT', 'Vol')$s$), 'err:42501');
select banc_sp.cas('F n''épingle pas au nom de A (owner_id non fourni)', banc_sp.sous(3, format($s$insert into public.stories_une (story_id, groupe, owner_id) values ('sT', 'Vol', %L)$s$, banc_sp.uid(2))), 'err:42501');
select banc_sp.cas('un visiteur n''épingle rien', banc_sp.sous(null, $s$insert into public.stories_une (story_id, groupe) values ('sT', 'Vol')$s$), 'err:42501');
select banc_sp.cas('un titre de 25 caractères est refusé', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sT', repeat('x', 25))$s$), 'err:23514');
select banc_sp.cas('un titre vide est refusé', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sT', '')$s$), 'err:23514');
select banc_sp.cas('un titre à caractère de contrôle est refusé', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sT', E'a\nb')$s$), 'err:23514');
select banc_sp.cas('un titre à contrôle de direction est refusé (red team P3)', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sT', E'abc\u202Efed')$s$), 'err:23514');
select banc_sp.cas('un titre à caractère de largeur nulle est refusé', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sT', E'a\u200Bb')$s$), 'err:23514');
select banc_sp.cas('un titre accentué passe', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sT', 'Été 2026 ✈️')$s$), 'ok:1');
select banc_sp.cas('aucun UPDATE d''une épingle', banc_sp.sous(2, $s$update public.stories_une set groupe = 'Autre'$s$), 'err:42501');
select banc_sp.cas('A lit ses 4 épingles', banc_sp.val(2, format('select count(*)::text from public.stories_une where owner_id = %L', banc_sp.uid(2))), '4');
select banc_sp.cas('F (proche) lit les 4 épingles de A', banc_sp.val(3, format('select count(*)::text from public.stories_une where owner_id = %L', banc_sp.uid(2))), '4');
select banc_sp.cas('N lit 3 épingles (pas celle de la story proches)', banc_sp.val(4, format('select count(*)::text from public.stories_une where owner_id = %L', banc_sp.uid(2))), '3');
select banc_sp.cas('un visiteur lit 3 épingles', banc_sp.val(null, format('select count(*)::text from public.stories_une where owner_id = %L', banc_sp.uid(2))), '3');
select banc_sp.cas('K (a bloqué A) ne lit aucune épingle de A', banc_sp.val(7, format('select count(*)::text from public.stories_une where owner_id = %L', banc_sp.uid(2))), '0');
select banc_sp.cas('compte PRIVÉ : N (en attente) ne lit pas les épingles de P', banc_sp.val(4, format('select count(*)::text from public.stories_une where owner_id = %L', banc_sp.uid(1))), '0');
select banc_sp.cas('compte PRIVÉ : F lit l''épingle de P', banc_sp.val(3, format('select count(*)::text from public.stories_une where owner_id = %L', banc_sp.uid(1))), '1');
select banc_sp.cas('F ne retire pas l''épingle de A', banc_sp.sous(3, 'delete from public.stories_une'), 'ok:0');

-- ── ⑥ Médias : `/private-media/stories/...` ─────────────────────────────────────────────────────
select banc_sp.cas('média proches : A le résout', banc_sp.media(2, 'sC', 1), '1');
select banc_sp.cas('média proches : F le résout', banc_sp.media(3, 'sC', 1), '1');
select banc_sp.cas('média proches : N ne le résout pas', banc_sp.media(4, 'sC', 1), '0');
select banc_sp.cas('média proches : U ne le résout pas', banc_sp.media(6, 'sC', 1), '0');
select banc_sp.cas('média proches : K ne le résout pas', banc_sp.media(7, 'sC', 1), '0');
select banc_sp.cas('média proches : un visiteur ne le résout pas', banc_sp.media(null, 'sC', 1), '0');
select banc_sp.cas('média « tous » récent : N le résout (inchangé)', banc_sp.media(4, 'sT', 5), '1');
select banc_sp.cas('média « tous » récent : un visiteur le résout (inchangé)', banc_sp.media(null, 'sT', 5), '1');
select banc_sp.cas('média à la une, 3 jours : N le résout', banc_sp.media(4, 'sOld', 2), '1');
select banc_sp.cas('média à la une, 3 jours : un visiteur le résout', banc_sp.media(null, 'sOld', 2), '1');
select banc_sp.cas('média NON épinglé, 3 jours : N ne le résout pas (inchangé)', banc_sp.media(4, 'sOld2', 4), '0');
select banc_sp.cas('média NON épinglé, 3 jours : l''auteur non plus (inchangé)', banc_sp.media(2, 'sOld2', 4), '0');
select banc_sp.cas('média à la une ET proches : F le résout', banc_sp.media(3, 'sOldC', 3), '1');
select banc_sp.cas('média à la une ET proches : N ne le résout pas', banc_sp.media(4, 'sOldC', 3), '0');
select banc_sp.cas('média à la une ET proches : un visiteur ne le résout pas', banc_sp.media(null, 'sOldC', 3), '0');
select banc_sp.cas('média : une épingle sur un AUTRE asset ne l''ouvre pas (asset de sOld2 sous l''id sOld)', banc_sp.media(4, 'sOld', 4), '0');

-- ── ⑦ Purge : la une échappe, le reste part ──────────────────────────────────────────────────────
select banc_sp.cas('la purge efface la seule story ancienne non épinglée', (rencontres_prive.purger_socle() ->> 'stories'), '1');
select banc_sp.cas('sOld et sOldC (à la une) restent, sOld2 est partie',
  (select string_agg(id, ',' order by id) from public.stories where id in ('sOld', 'sOldC', 'sOld2')), 'sOld,sOldC');
select banc_sp.cas('les vues de la story à la une restent', (select count(*)::text from public.story_views where story_id = 'sOld'), '1');
select banc_sp.cas('désépinglée, elle part à la purge suivante',
  banc_sp.sous(2, $s$delete from public.stories_une where story_id = 'sOld'$s$) || '/' || (rencontres_prive.purger_socle() ->> 'stories'), 'ok:1/1');
select banc_sp.cas('A supprime sT, épinglée', banc_sp.sous(2, $s$delete from public.stories where id = 'sT'$s$), 'ok:1');
select banc_sp.cas('… ses épingles partent avec elle', (select count(*)::text from public.stories_une where story_id = 'sT'), '0');

-- ── ⑧ Plafond des groupes ────────────────────────────────────────────────────────────────────────
select banc_sp.cas('29 groupes de plus (30 en tout) passent',
  banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) select 'sNew', 'g' || i from generate_series(1, 29) i$s$), 'ok:29');
select banc_sp.cas('le 31ᵉ groupe est refusé', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sNew', 'g30')$s$), 'err:P0001');
select banc_sp.cas('un groupe existant accepte encore une story', banc_sp.sous(2, $s$insert into public.stories_une (story_id, groupe) values ('sOldClient', 'g1')$s$), 'ok:1');
