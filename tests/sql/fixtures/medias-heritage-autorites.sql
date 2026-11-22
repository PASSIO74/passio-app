-- Autorites que WHATWG normalise vers la meme origine ; jamais des GIF tiers.
do $autorites$
declare ligne record; surface text; i integer:=0; valeur text; colonne text; acteur integer;
begin
 for ligne in select * from(values
  ('canonique','https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/a.webp'),
  ('trois slashs','https:///njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/a.webp'),
  ('quatre slashs','https:////njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/photos/u/a.webp'),
  ('lettres pleine chasse','https://ＮＪＫＩＹＯＫＬＳＳＶＥＦＳＴＬＪＥＭＸ.supabase.co/storage/v1/object/public/content/photos/u/a.webp'),
  ('points ideographiques','https://njkiyoklssvefstljemx。supabase。co/storage/v1/object/public/content/photos/u/a.webp'),
  ('points pleine chasse','https://njkiyoklssvefstljemx．supabase．co/storage/v1/object/public/content/photos/u/a.webp')
 ) as x(nom,url) loop
  perform banc_heritage.cas('autorite classification '||ligne.nom,public.media_heritage_ref_categorie(ligne.url),'refusee');
  foreach surface in array array['media_url','shared_data','overlays'] loop
   i:=i+1;colonne:=surface;acteur:=3+(i%4);
   valeur:=case surface when 'media_url' then ligne.url
    when 'shared_data' then jsonb_build_object('media',ligne.url)::text
    else jsonb_build_array(jsonb_build_object('type','gif','url',ligne.url))::text end;
   perform banc_heritage.cas('autorite insertion '||ligne.nom||' '||surface,banc_heritage.sous('authenticated',acteur,format(
    'insert into public.posts(id,author_id,%I) values(%L,%L,%L)',colonne,'heritage_autorite_'||i,banc_heritage.uid(acteur),valeur),false,true),
    'err:42501:medias_heritage_reference_fermee');
  end loop;
 end loop;
 foreach valeur in array array[
  'https:njkiyoklssvefstljemx.supabase.co/a.webp','https:/njkiyoklssvefstljemx.supabase.co/a.webp',
  'https://','https://?host=njkiyoklssvefstljemx.supabase.co','https:///','//',
  'https://media..giphy.com/a.gif','https://.media.giphy.com/a.gif','https://media.giphy.com./a.gif',
  'https://-media.giphy.com/a.gif','https://media-.giphy.com/a.gif',
  'https://media.giphy.com:65536/a.gif','https://media.giphy.com:000443/a.gif',
  'https://media_giphy.com/a.gif','https://media.giphy.com:abc/a.gif',
  'https://'||repeat('a',64)||'.giphy.com/a.gif'
 ] loop
  i:=i+1;perform banc_heritage.cas('autorite malformee '||i,public.media_heritage_ref_categorie(valeur),'refusee');
 end loop;
 foreach valeur in array array['https://media.giphy.com/media/synthetique/giphy.gif',
  'https://cdn.klipy.com/synthetique.gif','https://MEDIA.GIPHY.COM:443/media/synthetique.gif',
  'https://cdn-1.example.org:8443/media/a.gif'] loop
  i:=i+1;perform banc_heritage.cas('autorite tierce canonique '||i,public.media_heritage_ref_categorie(valeur),'tierce');
 end loop;
end $autorites$;
