-- Identites, claims et objets ENTIEREMENT synthetiques ; SET ROLE reel, aucun service Storage HTTP.
set client_min_messages=warning;
create function banc_medias.uid(i integer) returns text language sql immutable as $$
  select '00000000-0000-4000-8000-'||lpad(i::text,12,'0') $$;
create function banc_medias.asset(i integer) returns uuid language sql immutable as $$
  select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid $$;
create function banc_medias.sous(i integer,requete text,sid text default null) returns text language plpgsql security invoker as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims',case when i is null then '{}' else jsonb_build_object('sub',banc_medias.uid(i),'role','authenticated',
    'session_id',coalesce(sid,'10000000-0000-4000-8000-'||lpad(i::text,12,'0')))::text end,true);
  execute case when i is null then 'set local role anon' else 'set local role authenticated' end;
  execute requete; get diagnostics n=row_count; reset role; return 'ok:'||n;
exception when others then reset role; return 'err:'||sqlstate;
end $$;
create function banc_medias.val(i integer,requete text,sid text default null) returns text language plpgsql security invoker as $$
declare valeur text;
begin
  perform set_config('request.jwt.claims',case when i is null then '{}' else jsonb_build_object('sub',banc_medias.uid(i),'role','authenticated',
    'session_id',coalesce(sid,'10000000-0000-4000-8000-'||lpad(i::text,12,'0')))::text end,true);
  execute case when i is null then 'set local role anon' else 'set local role authenticated' end;
  execute requete into valeur; reset role; return valeur;
exception when others then reset role; return 'err:'||sqlstate;
end $$;
create function banc_medias.cas(cas text,obtenu text,attendu text) returns void language sql as $$
  insert into banc_medias.resultats(cas,ok,obtenu,attendu) values(cas,obtenu is not distinct from attendu,obtenu,attendu) $$;
create function banc_medias.reserver(i integer,cible text,aid integer,genre text default 'posts',variantes jsonb default '[{"variant":"original","mime_type":"image/webp","byte_size":8}]')
returns void language plpgsql as $$ begin
  perform banc_medias.cas('reservation '||aid,banc_medias.sous(i,format('select public.media_reserver(%L,%L,%L::jsonb,%L::uuid)',genre,cible,variantes,banc_medias.asset(aid))),'ok:1');
end $$;
create function banc_medias.objet(i integer,aid integer,variante text default 'original',mime text default 'image/webp',taille bigint default 8)
returns void language plpgsql as $$ begin
  perform banc_medias.cas('upload '||aid||' '||variante,banc_medias.sous(i,format(
    'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content-protected'',%L,%L::uuid,%L,%L::jsonb)',
    banc_medias.uid(i)||'/'||banc_medias.asset(aid)||'/'||variante||'.'||public.media_mime_extension(mime),banc_medias.uid(i),banc_medias.uid(i),jsonb_build_object('mimetype',mime,'size',taille))),'ok:1');
end $$;
create function banc_medias.publier(i integer,cible text,aid integer,genre text default 'posts') returns void language plpgsql as $$ begin
  perform banc_medias.cas('publication atomique '||aid,banc_medias.sous(i,format(
    'insert into public.%I(id,author_id,media_url) values(%L,%L,%L)',genre,cible,banc_medias.uid(i),
    'https://media.passio.invalid/private-media/'||genre||'/'||cible||'/'||banc_medias.asset(aid)||'/original')),'ok:1');
end $$;
create function banc_medias.lire(i integer,cible text,aid integer,genre text default 'posts',variante text default 'original',sid text default null)
returns text language sql as $$ select banc_medias.val(i,format('select count(*) from public.media_resoudre(%L,%L,%L::uuid,%L)',genre,cible,banc_medias.asset(aid),variante),sid) $$;

select banc_medias.cas('drapeau initial false invoker anon',banc_medias.val(null,'select public.media_proteges_actifs()'),'false');
select banc_medias.cas('drapeau initial false reservation',banc_medias.sous(1,format('select public.media_reserver(''posts'',''flag_disabled'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(999))),'err:42501');
select banc_medias.cas('client sans UPDATE drapeau',banc_medias.sous(1,'update public.reglages_distants set valeur=''{}'' where cle=''medias_proteges'''),'err:42501');
select banc_medias.cas('anon sans INSERT drapeau',banc_medias.sous(null,'insert into public.reglages_distants(cle,valeur,pose_par) values(''medias_proteges'',''{}'',''pilote'')'),'err:42501');
select banc_medias.cas('helper budget non expose',has_function_privilege('authenticated','public.media_budget_occupe(text)','EXECUTE')::text,'false');
update public.reglages_distants set valeur='{"actif":"true"}' where cle='medias_proteges';
select banc_medias.cas('drapeau chaine true refusee',banc_medias.val(1,'select public.media_proteges_actifs()'),'false');
update public.reglages_distants set valeur='{}' where cle='medias_proteges';
select banc_medias.cas('drapeau incomplet refuse',banc_medias.val(null,'select public.media_proteges_actifs()'),'false');
update public.reglages_distants set valeur='{"actif":true}' where cle='medias_proteges';
select banc_medias.cas('activation operateur synthetique',banc_medias.val(null,'select public.media_proteges_actifs()'),'true');

select banc_medias.reserver(1,'media_private',1,'posts','[{"variant":"original","mime_type":"image/webp","byte_size":8},{"variant":"v720","mime_type":"image/webp","byte_size":4},{"variant":"poster","mime_type":"image/webp","byte_size":4}]');
select banc_medias.objet(1,1); select banc_medias.objet(1,1,'v720','image/webp',4); select banc_medias.objet(1,1,'poster','image/webp',4);
select banc_medias.publier(1,'media_private',1);
select banc_medias.reserver(2,'media_public',2); select banc_medias.objet(2,2); select banc_medias.publier(2,'media_public',2);
select banc_medias.reserver(1,'story_private',3,'stories'); select banc_medias.objet(1,3); select banc_medias.publier(1,'story_private',3,'stories');
select banc_medias.reserver(2,'story_public',4,'stories'); select banc_medias.objet(2,4); select banc_medias.publier(2,'story_public',4,'stories');

select banc_medias.cas('source privee auteur',banc_medias.lire(1,'media_private',1),'1');
select banc_medias.cas('source privee abonne accepte',banc_medias.lire(3,'media_private',1),'1');
select banc_medias.cas('source privee demande pending',banc_medias.lire(4,'media_private',1),'0');
select banc_medias.cas('source privee bloque',banc_medias.lire(5,'media_private',1),'0');
select banc_medias.cas('source privee etranger',banc_medias.lire(6,'media_private',1),'0');
select banc_medias.cas('source privee anon',banc_medias.lire(null,'media_private',1),'0');
select banc_medias.cas('source publique anon reel',banc_medias.lire(null,'media_public',2),'1');
select banc_medias.cas('story publique anon reel',banc_medias.lire(null,'story_public',4,'stories'),'1');
select banc_medias.cas('story privee anon',banc_medias.lire(null,'story_private',3,'stories'),'0');
select banc_medias.cas('story privee accepte',banc_medias.lire(3,'story_private',3,'stories'),'1');
select banc_medias.cas('story privee pending',banc_medias.lire(4,'story_private',3,'stories'),'0');
select banc_medias.cas('variante v720 liee',banc_medias.lire(3,'media_private',1,'posts','v720'),'1');
select banc_medias.cas('variante poster liee',banc_medias.lire(3,'media_private',1,'posts','poster'),'1');
select banc_medias.cas('variante inconnue',banc_medias.lire(1,'media_private',1,'posts','arbitrary'),'0');
select banc_medias.cas('mauvais asset pour source visible',banc_medias.lire(3,'media_public',1),'0');
select banc_medias.cas('session absente claim',banc_medias.lire(1,'media_private',1,'posts','original',''),'0');
select banc_medias.cas('session autre sujet',banc_medias.lire(1,'media_private',1,'posts','original','10000000-0000-4000-8000-000000000006'),'0');
select banc_medias.cas('session malformed',banc_medias.val(1,'select public.media_session_active()','not-a-uuid'),'false');
select banc_medias.cas('anon sans droit helper session',banc_medias.val(null,'select public.media_session_active()'),'err:42501');
select banc_medias.cas('aucun SELECT sessions',banc_medias.sous(1,'select id from auth.sessions'),'err:42501');
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where user_id=banc_medias.uid(1)::uuid;
select banc_medias.cas('session expiree et source publique sans fallback',banc_medias.lire(1,'media_public',2),'0');
update auth.sessions set not_after=null where user_id=banc_medias.uid(1)::uuid;
delete from auth.sessions where user_id=banc_medias.uid(3)::uuid;
select banc_medias.cas('session revoquee accepte ferme',banc_medias.lire(3,'media_private',1),'0');
insert into auth.sessions(id,user_id) values('10000000-0000-4000-8000-000000000003',banc_medias.uid(3)::uuid);

select banc_medias.cas('auteur Storage direct ferme',banc_medias.val(1,'select count(*) from storage.objects where bucket_id=''content-protected'''),'0');
select banc_medias.cas('anon Storage direct ferme',banc_medias.val(null,'select count(*) from storage.objects where bucket_id=''content-protected'''),'0');
select banc_medias.cas('etranger Storage direct ferme',banc_medias.val(6,'select count(*) from storage.objects where bucket_id=''content-protected'''),'0');
create policy fixture_large_select on storage.objects for all to anon,authenticated using(true) with check(true);
create policy fixture_large_assets on public.media_assets for select to anon,authenticated using(true);
select banc_medias.cas('permissive Storage ne reouvre pas auteur',banc_medias.val(1,'select count(*) from storage.objects where bucket_id=''content-protected'''),'0');
select banc_medias.cas('permissive registre ne reouvre pas source',banc_medias.lire(null,'media_private',1),'0');
select banc_medias.cas('Storage immuable UPDATE zero',banc_medias.sous(1,'update storage.objects set name=name where bucket_id=''content-protected'''),'ok:0');
select banc_medias.cas('Storage DELETE zero',banc_medias.sous(1,'delete from storage.objects where bucket_id=''content-protected'''),'ok:0');
select banc_medias.cas('Storage INSERT anon ferme',banc_medias.sous(null,format('insert into storage.objects(bucket_id,name,metadata) values(''content-protected'',%L,''{}'')',banc_medias.uid(1)||'/arbitrary/original.webp')),'err:42501');
drop policy fixture_large_select on storage.objects; drop policy fixture_large_assets on public.media_assets;
select banc_medias.cas('DML registre client ferme',banc_medias.sous(1,'update public.media_objects set byte_size=9'),'err:42501');
select banc_medias.cas('fonction trigger non appelable',has_function_privilege('authenticated','public.media_lier_source()','EXECUTE')::text,'false');

-- Reposts : identite de l'affichant ET lien SQL vers source, jamais shared_data.
insert into public.posts(id,author_id,shared_from_post_id,shared_data) values
 ('media_repost_public',banc_medias.uid(2),'media_private',null),
 ('media_repost_chain',banc_medias.uid(2),'media_repost_public',null),
 ('media_repost_fake',banc_medias.uid(2),null,'{"media_url":"reference forged"}'),
 ('media_repost_private',banc_medias.uid(6),'media_public',null),
 ('media_cycle_a',banc_medias.uid(2),'media_cycle_b',null),('media_cycle_b',banc_medias.uid(2),'media_cycle_a',null);
select banc_medias.cas('repost public source privee anon ferme',banc_medias.lire(null,'media_repost_public',1),'0');
select banc_medias.cas('repost accepte deux ACL',banc_medias.lire(3,'media_repost_public',1),'1');
select banc_medias.cas('repost chaine accepte',banc_medias.lire(3,'media_repost_chain',1),'1');
select banc_medias.cas('snapshot sans lien ne prouve rien',banc_medias.lire(3,'media_repost_fake',1),'0');
select banc_medias.cas('affichant prive source publique anon ferme',banc_medias.lire(null,'media_repost_private',2),'0');
select banc_medias.cas('affichant prive son auteur public source',banc_medias.lire(6,'media_repost_private',2),'1');
select banc_medias.cas('cycle refuse',banc_medias.lire(null,'media_cycle_a',2),'0');
-- Ne pas desactiver le rate limit metier : un auteur public distinct par maillon.
insert into public.posts(id,author_id,shared_from_post_id) select 'media_depth_'||i,banc_medias.uid(i+6),case when i=1 then 'media_public' else 'media_depth_'||(i-1) end from generate_series(1,9) i;
select banc_medias.cas('chaine huit sources admise',banc_medias.lire(null,'media_depth_7',2),'1');
select banc_medias.cas('chaine plus de huit refusee',banc_medias.lire(null,'media_depth_8',2),'0');

update public.profiles set is_private=true where id=banc_medias.uid(2);
select banc_medias.cas('profil public devenu prive',banc_medias.lire(null,'media_public',2),'0');
update public.profiles set is_private=false where id=banc_medias.uid(2);
update public.stories set created_at=(clock_timestamp()-interval '25 hours') at time zone 'UTC' where id='story_private';
select banc_medias.cas('story expiree auteur ferme',banc_medias.lire(1,'story_private',3,'stories'),'0');
update public.stories set created_at=clock_timestamp() at time zone 'UTC' where id='story_private';
update public.media_assets set created_at=clock_timestamp()-interval '25 hours' where id=banc_medias.asset(3);
select banc_medias.cas('horloge serveur asset borne story',banc_medias.lire(1,'story_private',3,'stories'),'0');
update public.media_assets set created_at=clock_timestamp() where id=banc_medias.asset(3);

-- Idempotence, fichier manquant et reservation ciblee : rollback complet du vrai INSERT.
select banc_medias.reserver(2,'media_public',2);
select banc_medias.cas('idempotence un asset', (select count(*)::text from public.media_assets where id=banc_medias.asset(2)),'1');
select banc_medias.cas('cle idempotente autre owner refuse',banc_medias.sous(6,format('select public.media_reserver(''posts'',''media_public'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(2))),'err:42501');
select banc_medias.reserver(1,'media_missing',10);
select banc_medias.cas('INSERT media sans objet rollback',banc_medias.sous(1,format('insert into public.posts(id,author_id,media_url) values(''media_missing'',%L,%L)',banc_medias.uid(1),'https://media.passio.invalid/private-media/posts/media_missing/'||banc_medias.asset(10)||'/original')),'err:42501');
select banc_medias.cas('aucune source apres rollback',(select count(*)::text from public.posts where id='media_missing'),'0');
select banc_medias.cas('aucun asset apres rollback',(select count(*)::text from public.media_assets where id=banc_medias.asset(10)),'0');
select banc_medias.cas('reservation conservee non liee',(select (linked_at is null)::text from public.media_reservations where id=banc_medias.asset(10)),'true');
select banc_medias.cas('autre auteur ne vole pas reservation',banc_medias.sous(6,format('insert into public.posts(id,author_id,media_url) values(''media_missing'',%L,%L)',banc_medias.uid(6),'https://media.passio.invalid/private-media/posts/media_missing/'||banc_medias.asset(10)||'/original')),'err:42501');
select banc_medias.reserver(1,'media_expired',11);
update public.media_reservations set created_at=statement_timestamp()-interval '16 minutes',expires_at=statement_timestamp()-interval '1 minute' where id=banc_medias.asset(11);
select banc_medias.cas('reservation expiree upload refuse',banc_medias.sous(1,format('insert into storage.objects(bucket_id,name,owner,metadata) values(''content-protected'',%L,%L::uuid,''{"size":8,"mimetype":"image/webp"}'')',banc_medias.uid(1)||'/'||banc_medias.asset(11)||'/original.webp',banc_medias.uid(1))),'err:42501');

-- Reutiliser l'ancienne source ne finalise pas apres publication.
select banc_medias.reserver(1,'media_private',12); select banc_medias.objet(1,12);
grant update(media_url) on public.posts to authenticated;
select banc_medias.cas('nouveau rattachement UPDATE refuse',banc_medias.sous(1,format('update public.posts set media_url=%L where id=''media_private''','https://media.passio.invalid/private-media/posts/media_private/'||banc_medias.asset(12)||'/original')),'err:42501');
revoke update(media_url) on public.posts from authenticated;
select banc_medias.cas('ancien lien preserve',(select id::text from public.media_assets where post_id='media_private'),banc_medias.asset(1)::text);
select banc_medias.cas('nouveau lien absent',(select count(*)::text from public.media_assets where id=banc_medias.asset(12)),'0');

select banc_medias.cas('MIME upload forge refuse',banc_medias.sous(1,format('insert into storage.objects(bucket_id,name,owner,metadata) values(''content-protected'',%L,%L::uuid,''{"size":8,"mimetype":"image/svg+xml"}'')',banc_medias.uid(1)||'/'||banc_medias.asset(10)||'/original.webp',banc_medias.uid(1))),'err:42501');
select banc_medias.cas('taille upload autre que reservation refusee',banc_medias.sous(1,format('insert into storage.objects(bucket_id,name,owner,metadata) values(''content-protected'',%L,%L::uuid,''{"size":9,"mimetype":"image/webp"}'')',banc_medias.uid(1)||'/'||banc_medias.asset(10)||'/original.webp',banc_medias.uid(1))),'err:42501');
select banc_medias.cas('owner Storage forge refuse',banc_medias.sous(1,format('insert into storage.objects(bucket_id,name,owner,metadata) values(''content-protected'',%L,%L::uuid,''{"size":8,"mimetype":"image/webp"}'')',banc_medias.uid(1)||'/'||banc_medias.asset(10)||'/original.webp',banc_medias.uid(2))),'err:42501');
select banc_medias.cas('variante non declaree refusee',banc_medias.sous(1,format('insert into storage.objects(bucket_id,name,owner,metadata) values(''content-protected'',%L,%L::uuid,''{"size":8,"mimetype":"image/webp"}'')',banc_medias.uid(1)||'/'||banc_medias.asset(10)||'/poster.webp',banc_medias.uid(1))),'err:42501');
select banc_medias.objet(1,10); select banc_medias.publier(1,'media_missing',10);
select banc_medias.cas('reprise apres upload manquant',banc_medias.lire(1,'media_missing',10),'1');
select banc_medias.reserver(1,'media_partial',13,'posts','[{"variant":"original","mime_type":"image/webp","byte_size":8},{"variant":"v720","mime_type":"image/webp","byte_size":4}]');
select banc_medias.objet(1,13);
select banc_medias.cas('toutes variantes requises atomiquement',banc_medias.sous(1,format('insert into public.posts(id,author_id,media_url) values(''media_partial'',%L,%L)',banc_medias.uid(1),'https://media.passio.invalid/private-media/posts/media_partial/'||banc_medias.asset(13)||'/original')),'err:42501');
select banc_medias.cas('aucun objet registre partiel',(select count(*)::text from public.media_objects where asset_id=banc_medias.asset(13)),'0');
select banc_medias.cas('upload prive conserve pour reprise',(select count(*)::text from storage.objects where bucket_id='content-protected' and name=banc_medias.uid(1)||'/'||banc_medias.asset(13)||'/original.webp'),'1');
select banc_medias.reserver(1,'media_owner_id',14);
select banc_medias.cas('owner_id seul accepte sans owner deprecie',banc_medias.sous(1,format('insert into storage.objects(bucket_id,name,owner_id,metadata) values(''content-protected'',%L,%L,''{"size":8,"mimetype":"image/webp"}'')',banc_medias.uid(1)||'/'||banc_medias.asset(14)||'/original.webp',banc_medias.uid(1))),'ok:1');
select banc_medias.publier(1,'media_owner_id',14);
select banc_medias.cas('source owner_id seul resolue',banc_medias.lire(1,'media_owner_id',14),'1');

select banc_medias.cas('reservation sans original invalide',banc_medias.sous(1,format('select public.media_reserver(''posts'',''invalid_variants'',''[{"variant":"v720","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(21))),'err:22023');
select banc_medias.cas('reservation MIME actif invalide',banc_medias.sous(1,format('select public.media_reserver(''posts'',''invalid_variants'',''[{"variant":"original","mime_type":"image/svg+xml","byte_size":8}]'',%L::uuid)',banc_medias.asset(21))),'err:22023');
select banc_medias.cas('reservation au dela 26MiB invalide',banc_medias.sous(1,format('select public.media_reserver(''posts'',''invalid_variants'',''[{"variant":"original","mime_type":"image/webp","byte_size":27262977}]'',%L::uuid)',banc_medias.asset(21))),'err:22023');
select banc_medias.cas('reservation taille chaine invalide',banc_medias.sous(1,format('select public.media_reserver(''posts'',''invalid_variants'',''[{"variant":"original","mime_type":"image/webp","byte_size":"8"}]'',%L::uuid)',banc_medias.asset(21))),'err:22023');
select banc_medias.cas('reservation variantes dupliquees invalides',banc_medias.sous(1,format('select public.media_reserver(''posts'',''invalid_variants'',''[{"variant":"original","mime_type":"image/webp","byte_size":8},{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(21))),'err:22023');
select banc_medias.cas('reservation cle arbitraire non interpretee',banc_medias.sous(1,format('select public.media_reserver(''posts'',''invalid_variants'',''[{"variant":"original","mime_type":"image/webp","byte_size":8,"url":"https://other.invalid"}]'',%L::uuid)',banc_medias.asset(21))),'err:22023');

select banc_medias.cas('retrait abonnement reel',banc_medias.sous(3,format('delete from public.follows where follower_id=%L and following_id=%L',banc_medias.uid(3),banc_medias.uid(1))),'ok:1');
select banc_medias.cas('nouvelle requete apres retrait follow',banc_medias.lire(3,'media_private',1),'0');
select banc_medias.cas('nouvelle demande follow',banc_medias.sous(3,format('insert into public.follows(follower_id,following_id,status) values(%L,%L,''pending'')',banc_medias.uid(3),banc_medias.uid(1))),'ok:1');
select banc_medias.cas('retablissement follow accepte',banc_medias.sous(1,format('update public.follows set status=''accepted'' where follower_id=%L and following_id=%L',banc_medias.uid(3),banc_medias.uid(1))),'ok:1');
select banc_medias.cas('blocage public auteur reel',banc_medias.sous(2,format('insert into public.blocks(blocker_id,blocked_id) values(%L,%L)',banc_medias.uid(2),banc_medias.uid(6))),'ok:1');
select banc_medias.cas('nouvelle requete authentifiee bloquee public',banc_medias.lire(6,'media_public',2),'0');
select banc_medias.cas('anon garde vraie source publique',banc_medias.lire(null,'media_public',2),'1');
delete from public.blocks where blocker_id=banc_medias.uid(2) and blocked_id=banc_medias.uid(6);

-- Plafonds comptes : donnees metadata synthetiques, aucun flux reel de 2 Gio.
insert into storage.objects(bucket_id,name,owner,metadata) select 'content','quota_fixture/'||i,banc_medias.uid(6)::uuid,'{"size":1}'::jsonb from generate_series(1,120) i;
select banc_medias.cas('120 objets heure preserve',banc_medias.sous(6,format('select public.media_reserver(''posts'',''quota_post'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(20))),'err:54000');
delete from storage.objects where bucket_id='content' and name like 'quota_fixture/%' and owner=banc_medias.uid(6)::uuid;
insert into storage.objects(bucket_id,name,owner_id,metadata) select 'content','quota_fixture/owner_id_'||i,banc_medias.uid(6),'{"size":1}'::jsonb from generate_series(1,120) i;
select banc_medias.cas('120 objets owner_id comptes aussi',banc_medias.sous(6,format('select public.media_reserver(''posts'',''quota_post'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(20))),'err:54000');
delete from storage.objects where bucket_id='content' and name like 'quota_fixture/owner_id_%' and owner_id=banc_medias.uid(6);
insert into storage.objects(bucket_id,name,owner,metadata) values('content','quota_fixture/bytes',banc_medias.uid(6)::uuid,'{"size":2147483648}');
select banc_medias.cas('2 Gio preserve',banc_medias.sous(6,format('select public.media_reserver(''posts'',''quota_post'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(20))),'err:54000');
delete from storage.objects where bucket_id='content' and name='quota_fixture/bytes' and owner=banc_medias.uid(6)::uuid;
select banc_medias.reserver(6,'capacity_'||i,30+i) from generate_series(1,8) i;
select banc_medias.cas('huit reservations maximum',banc_medias.sous(6,format('select public.media_reserver(''posts'',''capacity_9'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(39))),'err:54000');
delete from public.media_reservations where owner_id=banc_medias.uid(6) and linked_at is null;

select banc_medias.cas('grants colonnes sources conserves',has_column_privilege('anon','public.posts','id','SELECT')::text,'true');
select banc_medias.cas('absence grant table complet preservee',has_table_privilege('anon','public.posts','SELECT')::text,'false');
select banc_medias.cas('resolver SECURITY INVOKER',(select prosecdef::text from pg_proc where oid='public.media_resoudre(text,text,uuid,text)'::regprocedure),'false');
select banc_medias.cas('bucket legacy public preserve',(select public::text from storage.buckets where id='content'),'true');
select banc_medias.cas('attachments prive preserve',(select public::text from storage.buckets where id='attachments'),'false');

insert into public.contenus_masques(target_type,target_id,signaleurs,decision) values('post','media_public',3,null);
select banc_medias.cas('masquage canonique anon',banc_medias.lire(null,'media_public',2),'0');
select banc_medias.cas('masquage canonique auteur lit encore',banc_medias.lire(2,'media_public',2),'1');

delete from public.posts where id='media_public';
select banc_medias.cas('source supprimee plus resolue',banc_medias.lire(null,'media_public',2),'0');
select banc_medias.cas('repost source supprimee ferme',banc_medias.lire(6,'media_repost_private',2),'0');
select banc_medias.cas('FK source cascade asset',(select count(*)::text from public.media_assets where id=banc_medias.asset(2)),'0');
select banc_medias.cas('FK source cascade variantes',(select count(*)::text from public.media_objects where asset_id=banc_medias.asset(2)),'0');

select count(*) as cas, count(*) filter(where not ok) as rouges from banc_medias.resultats;
do $$ begin if exists(select 1 from banc_medias.resultats where not ok) then raise exception 'Banc medias rouge'; end if; end $$;
