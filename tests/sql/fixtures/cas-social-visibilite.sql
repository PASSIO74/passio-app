-- Donnees ENTIEREMENT synthetiques. RLS sous SET ROLE anon/authenticated,
-- jamais sous postgres pour les actions ou lectures dont on affirme le droit.
-- Les helpers sont SECURITY INVOKER ; seule la preparation du decor est admin.
set client_min_messages = warning;
create schema banc_social;
create table banc_social.resultats (n serial primary key, cas text not null, obtenu text, attendu text, ok boolean not null);
create function banc_social.sous(uid text, requete text) returns text language plpgsql as $b$
declare n bigint;
begin
  begin
    perform set_config('request.jwt.claims', case when uid is null then '{}' else json_build_object('sub',uid,'role','authenticated')::text end, true);
    execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute requete;
    get diagnostics n = row_count;
    execute 'reset role';
    perform set_config('request.jwt.claims','',true);
    return 'ok:' || n;
  exception when others then
    execute 'reset role';
    return 'err:' || sqlstate;
  end;
end $b$;
create function banc_social.val(uid text, requete text, sujet text default null) returns text language plpgsql as $b$
declare v text;
begin
  begin
    perform set_config('request.jwt.claims', case when uid is null then '{}' else json_build_object('sub',uid,'role','authenticated')::text end, true);
    perform set_config('realtime.topic',coalesce(sujet,''),true);
    execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
    execute requete into v;
    execute 'reset role';
    perform set_config('request.jwt.claims','',true);
    return coalesce(v,'nul');
  exception when others then
    execute 'reset role';
    return 'err:' || sqlstate;
  end;
end $b$;
create function banc_social.cas(nom text, obtenu text, attendu text) returns void language sql as $b$
  insert into banc_social.resultats(cas,obtenu,attendu,ok) values(nom,obtenu,attendu,obtenu is not distinct from attendu);
$b$;
create function banc_social.id(nom text) returns text language sql immutable as $b$
  select case nom when 'A' then 'aaaaaaaa-0000-4000-8000-000000000001'
    when 'P' then 'bbbbbbbb-0000-4000-8000-000000000002'
    when 'F' then 'cccccccc-0000-4000-8000-000000000003'
    when 'D' then 'dddddddd-0000-4000-8000-000000000004'
    when 'O' then 'eeeeeeee-0000-4000-8000-000000000005'
    when 'B' then 'ffffffff-0000-4000-8000-000000000006' end;
$b$;
-- Aucun e-mail ni donnee personnelle, les UUID ne sont ceux d'aucun utilisateur.
insert into auth.users(id,created_at,email_confirmed_at)
  select banc_social.id(n)::uuid,now()-interval '30 days',now() from unnest(array['A','P','F','D','O','B']) n;
insert into public.profiles(id,username,is_private)
  select banc_social.id(n),'social_fixture_'||n,n='P' from unnest(array['A','P','F','D','O','B']) n;
insert into public.follows(follower_id,following_id,status)
  values(banc_social.id('F'),banc_social.id('P'),'pending'),(banc_social.id('D'),banc_social.id('P'),'pending');
select banc_social.cas('P accepte reellement F et D',banc_social.sous(banc_social.id('P'),$s$update public.follows set status='accepted' where following_id=auth.uid()::text$s$),'ok:2');
insert into public.posts(id,author_id,content) values
  ('social_public',banc_social.id('A'),'texte public'),
  ('social_private',banc_social.id('P'),'texte prive'),
  ('social_collision',banc_social.id('P'),'publication privee homonyme'),
  ('social_editable',banc_social.id('A'),'texte a corriger'),
  ('social_collab',banc_social.id('A'),'collaboration'),
  ('social_moderated',banc_social.id('A'),'masquage automatique'),
  ('social_garde',banc_social.id('A'),'decision garder'),
  ('social_retabli',banc_social.id('A'),'decision retablir');
insert into public.post_collaborators(post_id,user_id,added_by)
  values('social_collab',banc_social.id('F'),banc_social.id('A'));
insert into public.post_comments(id,post_id,author_id,content) values
  ('social_cp','social_private',banc_social.id('P'),'commentaire du proprietaire'),
  ('social_ca','social_public',banc_social.id('A'),'commentaire public');
insert into public.stories(id,author_id,content)
  values('social_sa',banc_social.id('A'),'story publique'),('social_sp',banc_social.id('P'),'story privee');
insert into public.events(id,author_id,title) values
  ('social_collision',banc_social.id('A'),'activite homonyme publique'),
  ('social_event',banc_social.id('A'),'activite sans homonyme');
insert into realtime.messages(id,topic,extension,event,private)
  values('00000000-0000-4000-8000-000000000101','banc','broadcast','fixture',true);

-- Roles et droits reels, controles positifs ET negatifs.
select banc_social.cas('role visiteur reel',banc_social.val(null,'select current_user'),'anon');
select banc_social.cas('role authentifie reel',banc_social.val(banc_social.id('F'),'select current_user'),'authenticated');
select banc_social.cas('uid authentifie reel',banc_social.val(banc_social.id('F'),'select auth.uid()::text'),banc_social.id('F'));
select banc_social.cas('uid visiteur absent',banc_social.val(null,'select auth.uid()::text'),'nul');
select banc_social.cas('RLS active sur les 10 tables',
  (select bool_and(relrowsecurity)::text from pg_class where oid=any(array['public.posts'::regclass,'public.post_comments'::regclass,'public.post_likes'::regclass,'public.comment_likes'::regclass,'public.comment_interactions'::regclass,'public.story_views'::regclass,'public.story_comments'::regclass,'public.story_likes'::regclass,'public.contenus_masques'::regclass,'realtime.messages'::regclass])),'true');
select banc_social.cas('pas UPDATE de table posts',has_table_privilege('authenticated','public.posts','UPDATE')::text,'false');
select banc_social.cas('UPDATE content seul',has_column_privilege('authenticated','public.posts','content','UPDATE')::text,'true');
select banc_social.cas('pas UPDATE edited_at',has_column_privilege('authenticated','public.posts','edited_at','UPDATE')::text,'false');
select banc_social.cas('visiteur ne voit pas la publication privee',banc_social.val(null,$s$select count(*) from public.posts where id='social_private'$s$),'0');
select banc_social.cas('visiteur voit le commentaire public',banc_social.val(null,$s$select count(*) from public.post_comments where id='social_ca'$s$),'1');
select banc_social.cas('visiteur ne voit pas le commentaire prive',banc_social.val(null,$s$select count(*) from public.post_comments where id='social_cp'$s$),'0');
select banc_social.cas('tiers ne voit pas le commentaire prive',banc_social.val(banc_social.id('O'),$s$select count(*) from public.post_comments where id='social_cp'$s$),'0');
select banc_social.cas('abonne voit le commentaire prive',banc_social.val(banc_social.id('F'),$s$select count(*) from public.post_comments where id='social_cp'$s$),'1');
select banc_social.cas('F commente le prive',banc_social.sous(banc_social.id('F'),$s$insert into public.post_comments(id,post_id,author_id,content) values('social_cf','social_private',auth.uid()::text,'accord')$s$),'ok:1');
select banc_social.cas('D commente avant refus',banc_social.sous(banc_social.id('D'),$s$insert into public.post_comments(id,post_id,author_id,content) values('social_cd','social_private',auth.uid()::text,'avant refus')$s$),'ok:1');
select banc_social.cas('F modifie son commentaire autorise',banc_social.sous(banc_social.id('F'),$s$update public.post_comments set content='corrige' where id='social_cf'$s$),'ok:1');
select banc_social.cas('F aime la publication privee',banc_social.sous(banc_social.id('F'),$s$insert into public.post_likes(post_id,user_id) values('social_private',auth.uid()::text)$s$),'ok:1');
select banc_social.cas('F aime le commentaire prive',banc_social.sous(banc_social.id('F'),$s$insert into public.comment_likes(comment_id,user_id) values('social_cp',auth.uid()::text)$s$),'ok:1');
select banc_social.cas('F reagit au commentaire prive',banc_social.sous(banc_social.id('F'),$s$insert into public.comment_interactions(id,comment_id,post_id,user_id,kind) values('social_ci_f','social_cp','social_private',auth.uid()::text,'like')$s$),'ok:1');
select banc_social.cas('F marque la story privee vue',banc_social.sous(banc_social.id('F'),$s$insert into public.story_views(story_id,user_id) values('social_sp',auth.uid()::text)$s$),'ok:1');
select banc_social.cas('F aime la story privee',banc_social.sous(banc_social.id('F'),$s$insert into public.story_likes(story_id,user_id) values('social_sp',auth.uid()::text)$s$),'ok:1');
select banc_social.cas('F commente la story privee',banc_social.sous(banc_social.id('F'),$s$insert into public.story_comments(id,story_id,author_id,content) values('social_scf','social_sp',auth.uid()::text,'accord')$s$),'ok:1');
select banc_social.cas('RT abonne accepte admis avant blocage',banc_social.val(banc_social.id('F'),'select count(*) from realtime.messages','fil:social_private'),'1');
select banc_social.cas('P retire la relation D',banc_social.sous(banc_social.id('P'),$s$delete from public.follows where follower_id='dddddddd-0000-4000-8000-000000000004'$s$),'ok:1');
select banc_social.cas('apres refus D ne voit pas le commentaire de P',banc_social.val(banc_social.id('D'),$s$select count(*) from public.post_comments where id='social_cp'$s$),'0');
select banc_social.cas('apres refus D ne commente plus',banc_social.sous(banc_social.id('D'),$s$insert into public.post_comments(id,post_id,author_id,content) values('social_cd_refus','social_private',auth.uid()::text,'refus')$s$),'err:42501');
select banc_social.cas('apres refus D ne modifie plus son ancien commentaire',banc_social.sous(banc_social.id('D'),$s$update public.post_comments set content='refus' where id='social_cd'$s$),'ok:0');
select banc_social.cas('apres refus D ne like plus publication',banc_social.sous(banc_social.id('D'),$s$insert into public.post_likes(post_id,user_id) values('social_private',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('apres refus D ne like plus commentaire',banc_social.sous(banc_social.id('D'),$s$insert into public.comment_likes(comment_id,user_id) values('social_cp',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('apres refus D ne reagit plus',banc_social.sous(banc_social.id('D'),$s$insert into public.comment_interactions(id,comment_id,post_id,user_id,kind) values('social_ci_d_refus','social_cp','social_private',auth.uid()::text,'like')$s$),'err:42501');
select banc_social.cas('apres refus D ne marque pas la story vue',banc_social.sous(banc_social.id('D'),$s$insert into public.story_views(story_id,user_id) values('social_sp',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('tiers ne like pas story privee',banc_social.sous(banc_social.id('O'),$s$insert into public.story_likes(story_id,user_id) values('social_sp',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('tiers ne commente pas story privee',banc_social.sous(banc_social.id('O'),$s$insert into public.story_comments(story_id,author_id,content) values('social_sp',auth.uid()::text,'non')$s$),'err:42501');

-- Matrice anonyme : verifie les ecritures, pas seulement has_*_privilege.
select banc_social.cas('anon ne commente pas',banc_social.sous(null,$s$insert into public.post_comments(id,post_id,author_id,content) values('social_anon','social_public','eeeeeeee-0000-4000-8000-000000000005','non')$s$),'err:42501');
select banc_social.cas('anon ne like pas publication',banc_social.sous(null,$s$insert into public.post_likes(post_id,user_id) values('social_public','eeeeeeee-0000-4000-8000-000000000005')$s$),'err:42501');
select banc_social.cas('anon ne like pas commentaire',banc_social.sous(null,$s$insert into public.comment_likes(comment_id,user_id) values('social_ca','eeeeeeee-0000-4000-8000-000000000005')$s$),'err:42501');
select banc_social.cas('anon ne reagit pas',banc_social.sous(null,$s$insert into public.comment_interactions(id,comment_id,post_id,user_id,kind) values('social_ci_anon','social_ca','social_public','eeeeeeee-0000-4000-8000-000000000005','like')$s$),'err:42501');
select banc_social.cas('anon ne marque pas story vue',banc_social.sous(null,$s$insert into public.story_views(story_id,user_id) values('social_sa','eeeeeeee-0000-4000-8000-000000000005')$s$),'err:42501');
select banc_social.cas('anon ne lit pas story_comments',banc_social.val(null,'select count(*) from public.story_comments'),'err:42501');

-- Commentaires recus AVANT blocage : maitrise par l'auteur de story dans les DEUX sens.
select banc_social.cas('F commente story publique avant blocage',banc_social.sous(banc_social.id('F'),$s$insert into public.story_comments(id,story_id,author_id,content) values('social_sca_f','social_sa',auth.uid()::text,'avant blocage')$s$),'ok:1');
select banc_social.cas('O commente story publique avant blocage',banc_social.sous(banc_social.id('O'),$s$insert into public.story_comments(id,story_id,author_id,content) values('social_sca_o','social_sa',auth.uid()::text,'avant blocage inverse')$s$),'ok:1');
select banc_social.cas('A bloque F',banc_social.sous(banc_social.id('A'),$s$insert into public.blocks(blocker_id,blocked_id) values(auth.uid()::text,'cccccccc-0000-4000-8000-000000000003')$s$),'ok:1');
select banc_social.cas('O bloque A',banc_social.sous(banc_social.id('O'),$s$insert into public.blocks(blocker_id,blocked_id) values(auth.uid()::text,'aaaaaaaa-0000-4000-8000-000000000001')$s$),'ok:1');
select banc_social.cas('auteur story lit commentaire recu de F bloque',banc_social.val(banc_social.id('A'),$s$select count(*) from public.story_comments where id='social_sca_f'$s$),'1');
select banc_social.cas('auteur story lit commentaire recu de O qui le bloque',banc_social.val(banc_social.id('A'),$s$select count(*) from public.story_comments where id='social_sca_o'$s$),'1');
select banc_social.cas('auteur story supprime commentaire de F bloque par ID',banc_social.sous(banc_social.id('A'),$s$delete from public.story_comments where id='social_sca_f'$s$),'ok:1');
select banc_social.cas('auteur story supprime commentaire de O qui le bloque par ID',banc_social.sous(banc_social.id('A'),$s$delete from public.story_comments where id='social_sca_o'$s$),'ok:1');
select banc_social.cas('F bloque ne voit plus story',banc_social.val(banc_social.id('F'),$s$select count(*) from public.story_comments where story_id='social_sa'$s$),'0');
select banc_social.cas('F bloque ne commente plus story',banc_social.sous(banc_social.id('F'),$s$insert into public.story_comments(story_id,author_id,content) values('social_sa',auth.uid()::text,'non')$s$),'err:42501');
select banc_social.cas('F bloque ne marque plus story vue',banc_social.sous(banc_social.id('F'),$s$insert into public.story_views(story_id,user_id) values('social_sa',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('F bloque ne commente plus publication',banc_social.sous(banc_social.id('F'),$s$insert into public.post_comments(id,post_id,author_id,content) values('social_c_refus_bloc','social_public',auth.uid()::text,'non')$s$),'err:42501');
select banc_social.cas('F bloque ne like plus publication',banc_social.sous(banc_social.id('F'),$s$insert into public.post_likes(post_id,user_id) values('social_public',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('F bloque ne like plus commentaire auteur',banc_social.sous(banc_social.id('F'),$s$insert into public.comment_likes(comment_id,user_id) values('social_ca',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('F bloque ne reagit plus publication',banc_social.sous(banc_social.id('F'),$s$insert into public.comment_interactions(id,comment_id,post_id,user_id,kind) values('social_ci_bloc','social_ca','social_public',auth.uid()::text,'like')$s$),'err:42501');
select banc_social.cas('blocage inverse refuse likes O',banc_social.sous(banc_social.id('O'),$s$insert into public.post_likes(post_id,user_id) values('social_public',auth.uid()::text)$s$),'err:42501');

-- Prive apres blocage meme pour un abonne anciennement accepte.
select banc_social.cas('P bloque F ancien abonne',banc_social.sous(banc_social.id('P'),$s$insert into public.blocks(blocker_id,blocked_id) values(auth.uid()::text,'cccccccc-0000-4000-8000-000000000003')$s$),'ok:1');
select banc_social.cas('F bloque ne lit plus commentaire de P',banc_social.val(banc_social.id('F'),$s$select count(*) from public.post_comments where id='social_cp'$s$),'0');
select banc_social.cas('F bloque ne modifie plus commentaire prive',banc_social.sous(banc_social.id('F'),$s$update public.post_comments set content='non' where id='social_cf'$s$),'ok:0');
select banc_social.cas('F bloque ne like plus publication privee',banc_social.sous(banc_social.id('F'),$s$insert into public.post_likes(post_id,user_id) values('social_private',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('F bloque ne like plus commentaire prive',banc_social.sous(banc_social.id('F'),$s$insert into public.comment_likes(comment_id,user_id) values('social_cp',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('F bloque ne reagit plus commentaire prive',banc_social.sous(banc_social.id('F'),$s$insert into public.comment_interactions(id,comment_id,post_id,user_id,kind) values('social_ci_prive_bloc','social_cp','social_private',auth.uid()::text,'like')$s$),'err:42501');
select banc_social.cas('F bloque ne marque plus story privee vue',banc_social.sous(banc_social.id('F'),$s$insert into public.story_views(story_id,user_id) values('social_sp',auth.uid()::text)$s$),'err:42501');
select banc_social.cas('P lit le commentaire recu malgre blocage',banc_social.val(banc_social.id('P'),$s$select count(*) from public.post_comments where id='social_cf'$s$),'1');
select banc_social.cas('P efface le commentaire recu malgre blocage',banc_social.sous(banc_social.id('P'),$s$delete from public.post_comments where id='social_cf'$s$),'ok:1');
select banc_social.cas('tiers ne supprime pas commentaire de D',banc_social.sous(banc_social.id('B'),$s$delete from public.post_comments where id='social_cd'$s$),'ok:0');

-- Realtime : stub de transport, mais SELECT reel sous RLS du role abonne.
select banc_social.cas('RT public positif',banc_social.val(banc_social.id('B'),'select count(*) from realtime.messages','fil:social_public'),'1');
select banc_social.cas('RT auteur prive positif',banc_social.val(banc_social.id('P'),'select count(*) from realtime.messages','fil:social_private'),'1');
select banc_social.cas('RT prive tiers refuse',banc_social.val(banc_social.id('B'),'select count(*) from realtime.messages','fil:social_private'),'0');
select banc_social.cas('RT apres refus relation D',banc_social.val(banc_social.id('D'),'select count(*) from realtime.messages','fil:social_private'),'0');
select banc_social.cas('RT apres blocage F',banc_social.val(banc_social.id('F'),'select count(*) from realtime.messages','fil:social_public'),'0');
select banc_social.cas('RT apres blocage inverse O',banc_social.val(banc_social.id('O'),'select count(*) from realtime.messages','fil:social_public'),'0');
select banc_social.cas('RT fonction historique voit event homonyme',banc_social.val(banc_social.id('B'),$s$select public.fil_temps_reel_visible('social_collision')$s$),'true');
select banc_social.cas('RT event public + post prive homonymes refuse',banc_social.val(banc_social.id('B'),'select count(*) from realtime.messages','fil:social_collision'),'0');
select banc_social.cas('RT homonyme auteur post admis',banc_social.val(banc_social.id('P'),'select count(*) from realtime.messages','fil:social_collision'),'1');
select banc_social.cas('RT event sans collision admis',banc_social.val(banc_social.id('B'),'select count(*) from realtime.messages','fil:social_event'),'1');
select banc_social.cas('RT fil inexistant refuse',banc_social.val(banc_social.id('B'),'select count(*) from realtime.messages','fil:social_absent'),'0');
select banc_social.cas('RT anonyme refuse',banc_social.val(null,'select count(*) from realtime.messages','fil:social_public'),'0');
select banc_social.cas('RT autre sujet refuse',banc_social.val(banc_social.id('B'),'select count(*) from realtime.messages','autre:social_public'),'0');
select banc_social.cas('RT client ne peut emettre fil',banc_social.sous(banc_social.id('B'),$s$insert into realtime.messages(topic,extension,event,private) values('fil:social_public','broadcast','forge',true)$s$),'err:42501');

-- Moderation : aucun detail prive expose, aucune ecriture cliente accordee.
insert into public.contenus_masques(target_type,target_id,signaleurs,decision) values
  ('post','social_moderated',3,null),('post','social_garde',3,'garde'),('post','social_retabli',3,'retabli');
select banc_social.cas('auteur peut encore editer post sans moderation',banc_social.sous(banc_social.id('A'),$s$update public.posts set content='texte corrige' where id='social_editable'$s$),'ok:1');
select banc_social.cas('edited_at pose par serveur',banc_social.val(banc_social.id('A'),$s$select (edited_at is not null)::text from public.posts where id='social_editable'$s$),'true');
select banc_social.cas('texte corrige conserve',banc_social.val(banc_social.id('A'),$s$select content from public.posts where id='social_editable'$s$),'texte corrige');
select banc_social.cas('tiers ne modifie pas texte auteur',banc_social.sous(banc_social.id('B'),$s$update public.posts set content='non' where id='social_editable'$s$),'ok:0');
select banc_social.cas('collaborateur ne modifie pas texte auteur',banc_social.sous(banc_social.id('F'),$s$update public.posts set content='non' where id='social_collab'$s$),'ok:0');
select banc_social.cas('edition masquage sans decision refusee',banc_social.sous(banc_social.id('A'),$s$update public.posts set content='non' where id='social_moderated'$s$),'ok:0');
select banc_social.cas('edition decision garde refusee',banc_social.sous(banc_social.id('A'),$s$update public.posts set content='non' where id='social_garde'$s$),'ok:0');
select banc_social.cas('edition apres retablissement refusee',banc_social.sous(banc_social.id('A'),$s$update public.posts set content='non' where id='social_retabli'$s$),'ok:0');
select banc_social.cas('auteur lit cles de ses trois cibles',banc_social.val(banc_social.id('A'),$s$select count(target_id) from public.contenus_masques where target_type='post'$s$),'3');
select banc_social.cas('tiers ne lit aucune cle de moderation',banc_social.val(banc_social.id('B'),$s$select count(target_id) from public.contenus_masques$s$),'0');
select banc_social.cas('anon aucun droit de colonne moderation',banc_social.val(null,$s$select target_id from public.contenus_masques limit 1$s$),'err:42501');
select banc_social.cas('auteur ne lit pas decision',banc_social.val(banc_social.id('A'),$s$select decision from public.contenus_masques limit 1$s$),'err:42501');
select banc_social.cas('auteur ne lit pas signaleurs',banc_social.val(banc_social.id('A'),$s$select signaleurs from public.contenus_masques limit 1$s$),'err:42501');
select banc_social.cas('auteur ne lit pas toutes colonnes',banc_social.val(banc_social.id('A'),$s$select * from public.contenus_masques limit 1$s$),'err:42501');
select banc_social.cas('auteur ne retire pas moderation',banc_social.sous(banc_social.id('A'),$s$delete from public.contenus_masques where target_id='social_garde'$s$),'err:42501');
select banc_social.cas('auteur ne change pas decision',banc_social.sous(banc_social.id('A'),$s$update public.contenus_masques set decision='retabli' where target_id='social_garde'$s$),'err:42501');
select banc_social.cas('auteur ne forge pas moderation',banc_social.sous(banc_social.id('A'),$s$insert into public.contenus_masques(target_type,target_id,signaleurs) values('post','social_editable',3)$s$),'err:42501');
select banc_social.cas('auteur ne forge pas edited_at',banc_social.sous(banc_social.id('A'),$s$update public.posts set edited_at=null where id='social_editable'$s$),'err:42501');
select banc_social.cas('auteur ne change pas media',banc_social.sous(banc_social.id('A'),$s$update public.posts set media_url='non' where id='social_editable'$s$),'err:42501');
select banc_social.cas('auteur ne change pas compteur',banc_social.sous(banc_social.id('A'),$s$update public.posts set likes=999 where id='social_editable'$s$),'err:42501');
select banc_social.cas('anon ne modifie pas texte',banc_social.sous(null,$s$update public.posts set content='non' where id='social_editable'$s$),'err:42501');
select banc_social.cas('moderation conserve les textes',banc_social.val(banc_social.id('A'),$s$select count(*) from public.posts where id in ('social_moderated','social_garde','social_retabli') and content <> 'non'$s$),'3');
