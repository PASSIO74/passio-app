-- Regressions fournisseur/compte : uniquement dans la base synthetique du runner.
begin;
delete from public.media_reservations where owner_id=banc_medias.uid(6) and linked_at is null;
select banc_medias.reserver(6,'provider_final',201);
select banc_medias.cas('provider preauth contentLength sans size',banc_medias.val(6,format(
  'select public.media_upload_autorise(%L,null,%L,''{"mimetype":"image/webp","contentLength":8,"contentEncoding":null}'')',
  banc_medias.uid(6)||'/'||banc_medias.asset(201)||'/original.webp',banc_medias.uid(6))),'true');
-- Le fournisseur peut effectuer ce INSERT de preautorisation dans une transaction annulee.
do $preauth$
declare resultat text;
begin
  begin
    resultat:=banc_medias.sous(6,format(
      'insert into storage.objects(bucket_id,name,owner_id,metadata) values(''content-protected'',%L,%L,''{"mimetype":"image/webp","contentLength":8}'')',
      banc_medias.uid(6)||'/'||banc_medias.asset(201)||'/original.webp',banc_medias.uid(6)));
    raise exception using errcode='ZX001',message='rollback fournisseur synthetique';
  exception when sqlstate 'ZX001' then null; end;
  perform banc_medias.cas('provider INSERT placeholder rollback savepoint',resultat,'ok:1');
end $preauth$;
select banc_medias.cas('preauth rollback ne libere pas reservation',(select count(*)::text from public.media_reservations where id=banc_medias.asset(201)),'1');
select banc_medias.objet(6,201);
select banc_medias.publier(6,'provider_final',201);
select banc_medias.cas('finalisation apres preauth annulee',banc_medias.lire(6,'provider_final',201),'1');

-- Meme MIME, declaration minuscule : le provider final peut differer, jamais publier.
select banc_medias.reserver(6,'provider_mismatch',202,'posts','[{"variant":"original","mime_type":"image/webp","byte_size":1}]');
select banc_medias.cas('provider taille non fiable ne reduit pas provision',banc_medias.val(6,format(
  'select public.media_upload_autorise(%L,null,%L,''{"mimetype":"image/webp","contentLength":27262976}'')',
  banc_medias.uid(6)||'/'||banc_medias.asset(202)||'/original.webp',banc_medias.uid(6))),'true');
insert into storage.objects(bucket_id,name,owner_id,metadata) values('content-protected',
  banc_medias.uid(6)||'/'||banc_medias.asset(202)||'/original.webp',banc_medias.uid(6),'{"mimetype":"image/webp","size":27262976}');
select banc_medias.cas('taille finale mismatch rollback parent',banc_medias.sous(6,format(
  'insert into public.posts(id,author_id,media_url) values(''provider_mismatch'',%L,%L)',banc_medias.uid(6),
  'https://media.passio.invalid/private-media/posts/provider_mismatch/'||banc_medias.asset(202)||'/original')),'err:42501');
select banc_medias.cas('aucun parent apres mismatch',(select count(*)::text from public.posts where id='provider_mismatch'),'0');
select banc_medias.cas('aucun asset apres mismatch',(select count(*)::text from public.media_assets where id=banc_medias.asset(202)),'0');

-- Session Auth vivante : le helper canonique doit fermer toutes les voies authentifiees.
do $comptes$
declare etat text;
begin
  foreach etat in array array['en_cours','purgee','supprimee','ban'] loop
    if etat='ban' then update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=banc_medias.uid(6)::uuid;
    else insert into public.comptes_en_suppression(user_id,statut) values(banc_medias.uid(6),etat); end if;
    perform banc_medias.cas('compte '||etat||' helper session',banc_medias.val(6,'select public.media_session_active()'),'false');
    perform banc_medias.cas('compte '||etat||' lecture propre',banc_medias.lire(6,'provider_final',201),'0');
    perform banc_medias.cas('compte '||etat||' registre ferme',banc_medias.val(6,'select count(*) from public.media_assets'),'0');
    perform banc_medias.cas('compte '||etat||' reservation fermee',banc_medias.sous(6,format('select public.media_reserver(''posts'',''denied_account'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(203))),'err:42501');
    perform banc_medias.cas('compte '||etat||' upload ferme',banc_medias.val(6,format('select public.media_upload_autorise(%L,null,%L,''{"mimetype":"image/webp","contentLength":8}'')',banc_medias.uid(6)||'/'||banc_medias.asset(202)||'/original.webp',banc_medias.uid(6))),'false');
    delete from public.comptes_en_suppression where user_id=banc_medias.uid(6);
    update auth.users set banned_until=null where id=banc_medias.uid(6)::uuid;
  end loop;
end $comptes$;
select banc_medias.cas('retablissement compte session encore vivante',banc_medias.lire(6,'provider_final',201),'1');
-- Les tests suivants verifient le plafond global sous des metadonnees, sans gros fichier.
delete from storage.objects where owner_id=banc_medias.uid(6) or owner=banc_medias.uid(6)::uuid;
delete from public.posts where id='provider_final';
delete from public.media_reservations where owner_id=banc_medias.uid(6);
insert into storage.objects(bucket_id,name,owner_id,metadata) values('attachments','provider_budget_fixture',banc_medias.uid(6),'{"size":2120220673}');
select banc_medias.cas('moins de 26MiB libres refuse meme un octet',banc_medias.sous(6,format('select public.media_reserver(''posts'',''budget_small'',''[{"variant":"original","mime_type":"image/webp","byte_size":1}]'',%L::uuid)',banc_medias.asset(204))),'err:54000');
delete from storage.objects where name='provider_budget_fixture';
select banc_medias.reserver(6,'budget_expired',205);
select banc_medias.cas('reservation reserve plafond entier',public.media_budget_occupe(banc_medias.uid(6))::text,'27262976');
select banc_medias.cas('provider placeholder accepte',banc_medias.sous(6,format(
  'insert into storage.objects(bucket_id,name,owner_id,metadata) values(''content-protected'',%L,%L,''{"mimetype":"image/webp","contentLength":8}'')',
  banc_medias.uid(6)||'/'||banc_medias.asset(205)||'/original.webp',banc_medias.uid(6))),'ok:1');
select banc_medias.cas('placeholder pas de double provision',public.media_budget_occupe(banc_medias.uid(6))::text,'27262976');
update storage.objects set metadata='{"mimetype":"image/webp","size":8}' where name=banc_medias.uid(6)||'/'||banc_medias.asset(205)||'/original.webp';
select banc_medias.cas('taille finale remplace provision',public.media_budget_occupe(banc_medias.uid(6))::text,'8');
update storage.objects set metadata='{"mimetype":"image/webp","size":4}' where name=banc_medias.uid(6)||'/'||banc_medias.asset(205)||'/original.webp';
select banc_medias.cas('mismatch garde provision sans double compte',public.media_budget_occupe(banc_medias.uid(6))::text,'27262976');
delete from storage.objects where name=banc_medias.uid(6)||'/'||banc_medias.asset(205)||'/original.webp';
update public.media_reservations set created_at=created_at-interval '2 hours',expires_at=expires_at-interval '2 hours' where id=banc_medias.asset(205);
insert into storage.objects(bucket_id,name,owner,metadata) values('attachments','provider_budget_fixture',banc_medias.uid(6)::uuid,'{"size":2092957697}');
select banc_medias.cas('expiration ne restitue pas provision inflight',banc_medias.sous(6,format('select public.media_reserver(''posts'',''budget_after_expired'',''[{"variant":"original","mime_type":"image/webp","byte_size":1}]'',%L::uuid)',banc_medias.asset(206))),'err:54000');
delete from storage.objects where name='provider_budget_fixture';
-- Conserver les preuves, annuler seulement les fixtures additionnelles de cette transaction.
-- Les cas additionnels restent dans la base de test pour le rapport du runner.
update public.reglages_distants set valeur='{"actif":false}' where cle='medias_proteges';
select banc_medias.cas('coupure resolver auteur',banc_medias.lire(1,'media_private',1),'0');
select banc_medias.cas('coupure registre auteur',banc_medias.val(1,'select count(*) from public.media_assets'),'0');
select banc_medias.cas('coupure resolver anon',banc_medias.lire(null,'story_public',4,'stories'),'0');
select banc_medias.cas('coupure reservation directe',banc_medias.sous(6,format('select public.media_reserver(''posts'',''disabled_direct'',''[{"variant":"original","mime_type":"image/webp","byte_size":8}]'',%L::uuid)',banc_medias.asset(207))),'err:42501');
select banc_medias.cas('coupure Storage INSERT direct',banc_medias.sous(6,format(
  'insert into storage.objects(bucket_id,name,owner_id,metadata) values(''content-protected'',%L,%L,''{"mimetype":"image/webp","contentLength":8}'')',
  banc_medias.uid(6)||'/'||banc_medias.asset(205)||'/original.webp',banc_medias.uid(6))),'err:42501');
update public.reglages_distants set valeur='{"actif":true}' where cle='medias_proteges';
commit;
