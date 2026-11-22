-- Données synthétiques du banc PostgreSQL local uniquement.
do $test$
declare
  auteur text := banc_heritage.uid(1);
  nom text := 'fixture_cloture_profil';
  image_publique text := 'https://passio-app.netlify.app/media/content/avatars/fixture/image.webp';
  ancien_lien text := 'https://passio-app.netlify.app/media/content/photos/fixture/image.webp';
  modifier text := 'update public.profiles set avatar_url=%L where id=%L';
  resultat text;
begin
  resultat := banc_heritage.sous('authenticated',1,format(modifier,image_publique,auteur));
  if resultat <> 'ok:1' then raise exception 'avatar_public_refuse %', resultat; end if;
  resultat := banc_heritage.sous('authenticated',1,format(modifier,ancien_lien,auteur),false,true);
  if resultat <> 'err:42501:medias_heritage_ecriture_fermee' then raise exception 'cloture_avatar_absente %', resultat; end if;
  insert into public.events (id,author_id,title,cover_url) values (nom,auteur,'Test',image_publique);
  begin
    insert into public.events (id,author_id,title,cover_url) values (nom||'_refus',auteur,'Test',ancien_lien);
    raise exception 'cloture_evenement_absente';
  exception when insufficient_privilege then
    if sqlerrm <> 'medias_heritage_ecriture_fermee' then raise; end if;
  end;
  if (select cover_url from public.events where id=nom) is distinct from image_publique then
    raise exception 'couverture_modifiee';
  end if;
end
$test$;
