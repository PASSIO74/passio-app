-- Assertions sur PostgreSQL reel, roles/RLS/triggers reels ; aucun HTTP fournisseur.
do $stockage$
declare acteur text; cat text; variante text; cle text; attendu text; compteur integer:=0;
begin
 foreach acteur in array array['authenticated','service_role','postgres'] loop
  foreach cat in array array['photos','videos','audios','posts','inconnue'] loop
   perform banc_heritage.cas('storage INSERT ferme '||acteur||' '||cat,banc_heritage.sous(acteur,1,format(
    'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content'',%L,%L::uuid,%L,''{"size":8}'')',
    cat||'/'||banc_heritage.uid(1)||'/'||acteur||'.webp',banc_heritage.uid(1),banc_heritage.uid(1))),'err:42501');
  end loop;
  foreach cat in array array['avatars','covers','passion_photos','passion_covers','events'] loop
   foreach variante in array array['original.webp','original.v720.webp'] loop
    compteur:=compteur+1;cle:=cat||'/'||banc_heritage.uid(1)||'/'||acteur||'-'||variante;
    perform banc_heritage.cas('storage public INSERT '||acteur||' '||cat||' '||variante,banc_heritage.sous(acteur,1,format(
     'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content'',%L,%L::uuid,%L,''{"size":8}'')',cle,banc_heritage.uid(1),banc_heritage.uid(1))),'ok:1');
    perform banc_heritage.cas('storage public UPDATE '||acteur||' '||cat||' '||variante,banc_heritage.sous(acteur,1,format(
     'update storage.objects set metadata=''{"size":9}'' where bucket_id=''content'' and name=%L',cle)),'ok:1');
   end loop;
  end loop;
  attendu:=case when acteur='authenticated' then 'ok:0' else 'err:42501' end;
  perform banc_heritage.cas('placeholder avant fence finaliseur UPDATE ferme '||acteur,banc_heritage.sous(acteur,1,format(
   'update storage.objects set metadata=''{"size":16}'' where bucket_id=''content'' and name=%L','photos/'||banc_heritage.uid(1)||'/ancien.webp')),attendu);
  perform banc_heritage.cas('OLD personnel vers NEW public ferme '||acteur,banc_heritage.sous(acteur,1,format(
   'update storage.objects set name=%L where bucket_id=''content'' and name=%L','avatars/'||banc_heritage.uid(1)||'/deplace.webp','photos/'||banc_heritage.uid(1)||'/ancien.webp')),attendu);
  perform banc_heritage.cas('public vers personnel ferme '||acteur,banc_heritage.sous(acteur,1,format(
   'update storage.objects set name=%L where bucket_id=''content'' and name=%L','photos/'||banc_heritage.uid(1)||'/deplace.webp','avatars/'||banc_heritage.uid(1)||'/'||acteur||'-original.webp')),'err:42501');
  perform banc_heritage.cas('UPSERT placeholder heritage ferme '||acteur,banc_heritage.sous(acteur,1,format(
   'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content'',%L,%L::uuid,%L,''{"size":16}'') on conflict(bucket_id,name) do update set metadata=excluded.metadata',
   'photos/'||banc_heritage.uid(1)||'/ancien.webp',banc_heritage.uid(1),banc_heritage.uid(1))),'err:42501');
 end loop;
end $stockage$;

do $chemins_stockage$
declare chemin text; acteur text; i integer:=0;
begin
 foreach chemin in array array['avatars/'||banc_heritage.uid(1)||'/../photos/a.webp','avatars/'||banc_heritage.uid(1)||'/a%2fb.webp',
  'avatars/'||banc_heritage.uid(1)||'/a%252fb.webp','avatars/'||banc_heritage.uid(1)||'/a%5cb.webp',
  'avatars/'||banc_heritage.uid(1)||'//a.webp','avatars/'||banc_heritage.uid(1)||E'/a\\b.webp',
  'avatars/'||banc_heritage.uid(1)||E'/a\tb.webp'] loop
  foreach acteur in array array['authenticated','service_role','postgres'] loop
   i:=i+1;perform banc_heritage.cas('Storage chemin ambigu ferme '||i,banc_heritage.sous(acteur,1,format(
    'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content'',%L,%L::uuid,%L,''{"size":8}'')',chemin,banc_heritage.uid(1),banc_heritage.uid(1))),'err:42501');
  end loop;
 end loop;
end $chemins_stockage$;
select banc_heritage.cas('Storage public espaces et UTF8 autorises',banc_heritage.sous('authenticated',1,format(
 'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content'',%L,%L::uuid,%L,''{"size":8}'')','avatars/'||banc_heritage.uid(1)||'/été image.webp',banc_heritage.uid(1),banc_heritage.uid(1))),'ok:1');

select banc_heritage.cas('public ecriture tiers toujours refusee',banc_heritage.sous('authenticated',2,format(
 'insert into storage.objects(bucket_id,name,owner,metadata) values(''content'',%L,%L::uuid,''{"size":8}'')','avatars/'||banc_heritage.uid(1)||'/tiers.webp',banc_heritage.uid(2))),'err:42501');
select banc_heritage.cas('public anon toujours refuse',banc_heritage.sous('anon',null,format(
 'insert into storage.objects(bucket_id,name,metadata) values(''content'',%L,''{"size":8}'')','avatars/'||banc_heritage.uid(1)||'/anon.webp')),'err:42501');
select banc_heritage.cas('DM membre toujours accepte',banc_heritage.sous('authenticated',1,format(
 'insert into storage.objects(bucket_id,name,owner,metadata) values(''attachments'',''attachments/heritage_conversation/a.pdf'',%L::uuid,''{"size":8}'')',banc_heritage.uid(1))),'ok:1');
select banc_heritage.cas('DM tiers toujours refuse',banc_heritage.sous('authenticated',2,format(
 'insert into storage.objects(bucket_id,name,owner,metadata) values(''attachments'',''attachments/heritage_conversation/b.pdf'',%L::uuid,''{"size":8}'')',banc_heritage.uid(2))),'err:42501');
select banc_heritage.cas('objet heritage toujours present', (select count(*)::text from storage.objects where bucket_id='content' and name='photos/'||banc_heritage.uid(1)||'/ancien.webp'),'1');
do $deplacement_interbucket$
declare acteur text;
begin
 foreach acteur in array array['authenticated','service_role','postgres'] loop
  perform banc_heritage.cas('DM vers ancien content ferme '||acteur,banc_heritage.sous(acteur,1,format(
   'update storage.objects set bucket_id=''content'',name=%L where bucket_id=''attachments'' and name=''attachments/heritage_conversation/a.pdf''','photos/'||banc_heritage.uid(1)||'/copie-dm.pdf')),'err:42501');
 end loop;
end $deplacement_interbucket$;
select banc_heritage.cas('copie DM autorisee reste privee',banc_heritage.sous('authenticated',1,
 'insert into storage.objects(bucket_id,name,owner,metadata) select bucket_id,''attachments/heritage_conversation/copie.pdf'',owner,metadata from storage.objects where bucket_id=''attachments'' and name=''attachments/heritage_conversation/a.pdf'''),'ok:1');

do $references$
declare src text; cas text; i integer:=0; ligne record; genre text; acteur text; refuse text;
begin
 for ligne in select * from(values
  ('direct photos',banc_heritage.url('photos')),('direct videos',banc_heritage.url('videos')),('direct audios',banc_heritage.url('audios')),
  ('categorie inconnue',banc_heritage.url('posts')),('alias relatif','/media/content/photos/u/a.webp'),
  ('alias APP','https://passio-app.netlify.app/media/content/photos/u/a.webp'),
  ('alias preview','https://deploy-preview-7--passio-app.netlify.app/media/content/photos/u/a.webp'),
  ('hote casse','https://NJKIYOKLSSVEFSTLJEMX.supabase.co/storage/v1/object/public/content/photos/u/a.webp'),
  ('port443','https://njkiyoklssvefstljemx.supabase.co:443/storage/v1/object/public/content/photos/u/a.webp'),
  ('port zero','https://njkiyoklssvefstljemx.supabase.co:0443/storage/v1/object/public/content/avatars/u/a.webp'),
  ('hote point','https://njkiyoklssvefstljemx.supabase.co./storage/v1/object/public/content/avatars/u/a.webp'),
  ('hote encode','https://%6ejkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/a.webp'),
  ('render','https://fcksxofaelcdmmifnwjo.supabase.co/storage/v1/render/image/public/content/photos/u/a.webp?width=720'),
  ('sign','https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/sign/content/photos/u/a.webp?token=synthetique'),
  ('bucket protege brut','https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content-protected/u/a.webp'),
  ('categorie encodee','https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/%70hotos/u/a.webp'),
  ('separateur encode','https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/avatars/u/a%2f..%2fphotos/a.webp'),
  ('double encodage','https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/avatars/u/a%252fb.webp'),
  ('dot segment','https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/avatars/u/../../photos/u/a.webp'),
  ('backslash',E'https://njkiyoklssvefstljemx.supabase.co\\storage/v1/object/public/content/photos/u/a.webp'),
  -- Userinfo synthetique construit comme URL : aucune adresse de personne.
  ('credentials','https://x'||chr(64)||'njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/avatars/u/a.webp'),
  ('controle',E'https://njkiyoklssvefstljemx.supabase.co/sto\trage/v1/object/public/content/photos/u/a.webp'),
  ('HTTP interne','http://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/avatars/u/a.webp'),
  ('relative storage','/storage/v1/object/public/content/photos/u/a.webp'),
  ('logique malformed','https://media.passio.invalid/private-media/posts/p/id/original')
 ) as x(nom,url) loop
  perform banc_heritage.cas('classification fermee '||ligne.nom,public.media_heritage_ref_categorie(ligne.url),'refusee');
  foreach genre in array array['posts','stories'] loop
   refuse:=case when ligne.nom in('alias relatif','HTTP interne','relative storage') then 'err:23514' else 'err:42501' end;
   i:=i+1;perform banc_heritage.cas('reference INSERT fermee '||genre||' '||ligne.nom,banc_heritage.sous('authenticated',1,format(
    'insert into public.%I(id,author_id,media_url) values(%L,%L,%L)',genre,'heritage_ref_'||i,banc_heritage.uid(1),ligne.url)),refuse);
  end loop;
 end loop;
 foreach cas in array array['media','image','photo','video','audio','cover','poster','coverUrl','coverPhotoUrl'] loop
  i:=i+1;perform banc_heritage.cas('shared_data texte '||cas,banc_heritage.sous('authenticated',1,format(
   'insert into public.posts(id,author_id,shared_data) values(%L,%L,%L)','heritage_partage_'||i,banc_heritage.uid(1),jsonb_build_object(cas,banc_heritage.url('photos'))::text)),'err:42501');
 end loop;
 perform banc_heritage.cas('poster type nouveau refuse',banc_heritage.sous('authenticated',1,format(
  'insert into public.posts(id,author_id,shared_data) values(''heritage_poster'',%L,%L)',banc_heritage.uid(1),jsonb_build_object('passio_media',jsonb_build_object('protocol',1,'poster',banc_heritage.url('photos')))::text)),'err:42501');
 foreach genre in array array['posts','stories'] loop
  perform banc_heritage.cas('overlays GIF ferme '||genre,banc_heritage.sous('authenticated',1,format(
   'insert into public.%I(id,author_id,overlays) values(%L,%L,%L::jsonb)',genre,'heritage_overlay_'||genre,banc_heritage.uid(1),jsonb_build_array(jsonb_build_object('type','gif','url',banc_heritage.url('photos'))))),'err:42501');
 end loop;
end $references$;

select banc_heritage.cas('ancien post texte seul accepte',banc_heritage.sous('authenticated',1,
 'update public.posts set content=''texte modifie'' where id=''heritage_ancien'''),'ok:1');
select banc_heritage.cas('ancienne story texte seul accepte',banc_heritage.sous('authenticated',1,
 'update public.stories set content=''texte modifie'' where id=''heritage_story_ancienne'''),'ok:0');
select banc_heritage.cas('ancienne story backend texte seul accepte',banc_heritage.sous('service_role',1,
 'update public.stories set content=''texte modifie'' where id=''heritage_story_ancienne'''),'ok:1');
select banc_heritage.cas('reaffectation legacy nouvelle valeur refusee',banc_heritage.sous('postgres',1,format(
 'update public.posts set media_url=%L where id=''heritage_ancien''',banc_heritage.url('videos'))),'err:42501');
select banc_heritage.cas('ancienne valeur chemin inchangee conservee',banc_heritage.sous('postgres',1,format(
 'update public.posts set shared_data=%L where id=''heritage_ancien''',jsonb_build_object('media',banc_heritage.url('photos'),'text','modification sans media')::text)),'ok:1');
select banc_heritage.cas('copie valeur dans nouveau chemin refusee',banc_heritage.sous('postgres',1,format(
 'update public.posts set shared_data=%L where id=''heritage_ancien''',jsonb_build_object('media',banc_heritage.url('photos'),'poster',banc_heritage.url('photos'))::text)),'err:42501');
select banc_heritage.cas('texte libre url preserve',banc_heritage.sous('authenticated',1,format(
 'insert into public.posts(id,author_id,content,shared_data) values(''heritage_texte_libre'',%L,%L,%L)',banc_heritage.uid(1),banc_heritage.url('photos'),jsonb_build_object('text',banc_heritage.url('photos'))::text)),'ok:1');
select banc_heritage.cas('overlay texte url inactive preservee',banc_heritage.sous('authenticated',1,format(
 'insert into public.posts(id,author_id,overlays) values(''heritage_overlay_texte'',%L,%L::jsonb)',banc_heritage.uid(1),jsonb_build_array(jsonb_build_object('type','text','url',banc_heritage.url('photos'))))),'ok:1');
select banc_heritage.cas('tiers GIF actuel conserve',banc_heritage.sous('authenticated',1,format(
 'insert into public.stories(id,author_id,overlays) values(''heritage_gif_tiers'',%L,''[{"type":"gif","url":"https://media.giphy.com/media/synthetique/giphy.gif"}]'')',banc_heritage.uid(1))),'ok:1');
select banc_heritage.cas('query tiers pas une origine interne',public.media_heritage_ref_categorie('https://media.giphy.com/media/synthetique.gif?texte=media.passio.invalid'),'tierce');

do $publics$
declare cat text; i integer:=0; u text; attendu text; acteur integer;
begin
 foreach cat in array array['avatars','covers','passion_photos','passion_covers','events'] loop
  foreach u in array array[banc_heritage.url(cat),'/media/content/'||cat||'/u/a.webp','https://njkiyoklssvefstljemx.supabase.co:443/storage/v1/object/public/content/'||cat||'/u/a%20image.webp'] loop
   i:=i+1;perform banc_heritage.cas('classification publique '||i,public.media_heritage_ref_categorie(u),'publique');
   attendu:=case when u like '/%' then 'err:23514' else 'ok:1' end;
   -- Repartir les vrais succes sur les quatre comptes prepares conserve le quota10/min.
   acteur:=3+(i%4);
   perform banc_heritage.cas('reference publique connue '||i,banc_heritage.sous('authenticated',acteur,format('insert into public.posts(id,author_id,media_url) values(%L,%L,%L)','heritage_public_'||i,banc_heritage.uid(acteur),u)),attendu);
  end loop;
 end loop;
end $publics$;

-- Un BEFORE qui change une valeur apres sa normalisation ne peut depasser la garde AFTER.
create function banc_heritage.before_storage() returns trigger language plpgsql as $$begin if new.name like '%normaliseur%' then new.name:='photos/'||banc_heritage.uid(1)||'/normalise.webp';end if;return new;end$$;
create trigger z_heritage_before_storage before insert on storage.objects for each row execute function banc_heritage.before_storage();
select banc_heritage.cas('BEFORE Storage hostile privilege refuse',banc_heritage.sous('postgres',1,format(
 'insert into storage.objects(bucket_id,name,metadata) values(''content'',%L,''{"size":8}'')','avatars/'||banc_heritage.uid(1)||'/normaliseur.webp'),false,true),'err:42501:medias_heritage_ecriture_fermee');
drop trigger z_heritage_before_storage on storage.objects;
create function banc_heritage.before_post() returns trigger language plpgsql as $$begin if new.id='heritage_normaliseur' then new.media_url:=banc_heritage.url('photos');end if;return new;end$$;
create trigger z_heritage_before_post before insert on public.posts for each row execute function banc_heritage.before_post();
select banc_heritage.cas('BEFORE references hostile privilege refuse',banc_heritage.sous('postgres',1,format(
 'insert into public.posts(id,author_id,media_url) values(''heritage_normaliseur'',%L,''https://media.giphy.com/media/synthetique/giphy.gif'')',banc_heritage.uid(1)),false,true),'err:42501:medias_heritage_reference_fermee');
drop trigger z_heritage_before_post on public.posts;

-- Le nouveau chemin prive garde le binder et sa RLS ; aucun shared_data ne cree de droits.
update public.reglages_distants set valeur='{"actif":true}' where cle='medias_proteges';
select banc_heritage.cas('reservation privee conservee',banc_heritage.sous('authenticated',1,
 'select public.media_reserver(''posts'',''heritage_prive'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',''20000000-0000-4000-8000-000000009001''::uuid)'),'ok:1');
select banc_heritage.cas('upload prive conserve',banc_heritage.sous('authenticated',1,format(
 'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content-protected'',%L,%L::uuid,%L,''{"size":8,"mimetype":"image/webp"}'')',banc_heritage.uid(1)||'/20000000-0000-4000-8000-000000009001/original.webp',banc_heritage.uid(1),banc_heritage.uid(1))),'ok:1');
select banc_heritage.cas('liaison privee conservee',banc_heritage.sous('authenticated',1,format(
 'insert into public.posts(id,author_id,media_url) values(''heritage_prive'',%L,''https://media.passio.invalid/private-media/posts/heritage_prive/20000000-0000-4000-8000-000000009001/original'')',banc_heritage.uid(1))),'ok:1');
select banc_heritage.cas('lecture privee auteur',banc_heritage.sous('authenticated',1,
 'select count(*) from public.media_resoudre(''posts'',''heritage_prive'',''20000000-0000-4000-8000-000000009001'',''original'')',true),'1');
select banc_heritage.cas('lecture privee tiers sans accord reste fermee',banc_heritage.sous('authenticated',6,
 'select count(*) from public.media_resoudre(''posts'',''heritage_prive'',''20000000-0000-4000-8000-000000009001'',''original'')',true),'0');
select banc_heritage.cas('repartage SQL conserve',banc_heritage.sous('authenticated',1,format(
 'insert into public.posts(id,author_id,shared_from_post_id,shared_data) values(''heritage_repartage'',%L,''heritage_prive'',''{"media":"https://media.passio.invalid/private-media/posts/heritage_prive/20000000-0000-4000-8000-000000009001/original"}'')',banc_heritage.uid(1))),'ok:1');
select banc_heritage.cas('repartage auteur lu par contexte SQL',banc_heritage.sous('authenticated',1,
 'select count(*) from public.media_resoudre(''posts'',''heritage_repartage'',''20000000-0000-4000-8000-000000009001'',''original'')',true),'1');
select banc_heritage.cas('presentation sans lien SQL aucun droit',banc_heritage.sous('authenticated',6,format(
 'insert into public.posts(id,author_id,shared_data) values(''heritage_presentation_fausse'',%L,''{"media":"https://media.passio.invalid/private-media/posts/heritage_prive/20000000-0000-4000-8000-000000009001/original"}'')',banc_heritage.uid(6))),'ok:1');
select banc_heritage.cas('presentation falsifiee refus broker',banc_heritage.sous('authenticated',6,
 'select count(*) from public.media_resoudre(''posts'',''heritage_presentation_fausse'',''20000000-0000-4000-8000-000000009001'',''original'')',true),'0');

select banc_heritage.cas('reservation story privee conservee',banc_heritage.sous('authenticated',1,
 'select public.media_reserver(''stories'',''heritage_story_privee'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',''20000000-0000-4000-8000-000000009003''::uuid)'),'ok:1');
select banc_heritage.cas('upload story prive conserve',banc_heritage.sous('authenticated',1,format(
 'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content-protected'',%L,%L::uuid,%L,''{"size":8,"mimetype":"image/webp"}'')',banc_heritage.uid(1)||'/20000000-0000-4000-8000-000000009003/original.webp',banc_heritage.uid(1),banc_heritage.uid(1))),'ok:1');
select banc_heritage.cas('liaison story privee conservee',banc_heritage.sous('authenticated',1,format(
 'insert into public.stories(id,author_id,media_url) values(''heritage_story_privee'',%L,''https://media.passio.invalid/private-media/stories/heritage_story_privee/20000000-0000-4000-8000-000000009003/original'')',banc_heritage.uid(1))),'ok:1');
select banc_heritage.cas('lecture story privee auteur',banc_heritage.sous('authenticated',1,
 'select count(*) from public.media_resoudre(''stories'',''heritage_story_privee'',''20000000-0000-4000-8000-000000009003'',''original'')',true),'1');
select banc_heritage.cas('lecture story privee tiers refusee',banc_heritage.sous('authenticated',6,
 'select count(*) from public.media_resoudre(''stories'',''heritage_story_privee'',''20000000-0000-4000-8000-000000009003'',''original'')',true),'0');

-- Une corruption apres binder doit annuler aussi le registre lie et la publication.
select banc_heritage.cas('reservation rollback preparee',banc_heritage.sous('authenticated',1,
 'select public.media_reserver(''posts'',''heritage_rollback'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',''20000000-0000-4000-8000-000000009002''::uuid)'),'ok:1');
select banc_heritage.cas('objet rollback prepare',banc_heritage.sous('authenticated',1,format(
 'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content-protected'',%L,%L::uuid,%L,''{"size":8,"mimetype":"image/webp"}'')',banc_heritage.uid(1)||'/20000000-0000-4000-8000-000000009002/original.webp',banc_heritage.uid(1),banc_heritage.uid(1))),'ok:1');
create function banc_heritage.after_corruption() returns trigger language plpgsql security definer set search_path='' as $$begin if new.id='heritage_rollback' then update public.posts set media_url=banc_heritage.url('photos') where id=new.id;end if;return new;end$$;
create trigger z_heritage_after_corruption after insert on public.posts for each row execute function banc_heritage.after_corruption();
select banc_heritage.cas('post binder corruption refusee',banc_heritage.sous('authenticated',1,format(
 'insert into public.posts(id,author_id,media_url) values(''heritage_rollback'',%L,''https://media.passio.invalid/private-media/posts/heritage_rollback/20000000-0000-4000-8000-000000009002/original'')',banc_heritage.uid(1)),false,true),'err:42501:medias_heritage_reference_fermee');
select banc_heritage.cas('post rollback zero',(select count(*)::text from public.posts where id='heritage_rollback'),'0');
select banc_heritage.cas('asset rollback zero',(select count(*)::text from public.media_assets where id='20000000-0000-4000-8000-000000009002'),'0');
select banc_heritage.cas('reservation rollback non liee',(select (linked_at is null)::text from public.media_reservations where id='20000000-0000-4000-8000-000000009002'),'true');
drop trigger z_heritage_after_corruption on public.posts;

-- Le quota d'insertion existant est aussi exerce, sans vieillissement des succes.
do $quota_posts$
declare i integer;
begin
 for i in 1..11 loop
  perform banc_heritage.cas('quota posts preserve '||i,banc_heritage.sous('authenticated',2,format(
   'insert into public.posts(id,author_id,content) values(%L,%L,''quota synthetique'')','heritage_quota_'||i,banc_heritage.uid(2))),case when i<=10 then 'ok:1' else 'err:P0001' end);
 end loop;
end $quota_posts$;

select banc_heritage.cas('DELETE nettoyage tiers ne touche rien',banc_heritage.sous('authenticated',1,format(
 'delete from storage.objects where bucket_id=''content'' and name=%L','photos/'||banc_heritage.uid(2)||'/tiers-ancien.webp')),'ok:0');
select banc_heritage.cas('DELETE nettoyage propre conserve',banc_heritage.sous('authenticated',1,format(
 'delete from storage.objects where bucket_id=''content'' and name=%L','photos/'||banc_heritage.uid(1)||'/ancien.webp')),'ok:1');
select banc_heritage.cas('tiers reste apres nettoyage',(select count(*)::text from storage.objects where bucket_id='content' and name='photos/'||banc_heritage.uid(2)||'/tiers-ancien.webp'),'1');
