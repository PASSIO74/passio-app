-- Contrôles sociaux complémentaires. Rejouable, aucune fonction serveur modifiée.
-- Catalogue et corps de fonctions relus sur la photographie du 16/11/2026.
-- Compatible avec le client existant ; déployer le client corrigé puis cette migration.
-- Le gel d'édition porte sur TOUT passage en modération, y compris après rétablissement.
-- Retour arrière : retirer les policies *_visibilite_* et posts_edition_sans_moderation,
-- ainsi que post_comments_select_auteur_publication et post_comments_delete_auteur_publication,
-- restaurer story_comments_select et passio_rt_recevoir_fil depuis leurs migrations sources,
-- retirer moderation_cible_propre puis REVOKE SELECT(target_type,target_id) sur contenus_masques.
begin;

-- Refus AVANT toute écriture si le staging n'est pas aligné. Ces empreintes
-- portent sur les définitions publiques relues, avec espaces normalisés.
-- Ne pas rejouer un ancien DDL après ce fichier : il écraserait les policies.
do $prerequis$
declare f record;
begin
  if to_regclass('public.story_comments') is null
     or to_regclass('public.story_likes') is null
     or to_regclass('public.contenus_masques') is null
     or not exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='posts' and column_name='edited_at') then
    raise exception 'Socle social incomplet : aligner les migrations 06/11, 09/11, 13/11 et stories 14/11 AVANT ce fichier';
  end if;
  for f in select * from (values
      ('public.post_is_visible(text)', '5436027b007b74604d08e4fef2a50f25'),
      ('public.comment_target_visible(text)', '2091a6a109dba1ed66c256188f74b48e'),
      ('public.comment_target_visible(text,text)', '8a4f8c9b27f5f7e20e58d376db03af8a'),
      ('public.post_auteur_bloque(text)', '86ee25d4810edc521ab88e57d5470753'),
      ('public.story_visible(text)', '9ab4f5b623ca5e6549a2de1da1f891d2'),
      ('public.story_est_a_moi(text)', '38b4aa5e048a4a60107dd4e589ead9a9'),
      ('public.fil_temps_reel_visible(text)', 'ac018df5562b85b35a422d9917f272ea'),
      ('public.can_edit_post(text)', '617686f72b8df51cb1a9eb6538bf40aa'),
      ('public.is_blocked_with(text)', '7e102ba262f182e44bb7ac1bb6fa6e2b')
    ) as attendu(signature, empreinte)
  loop
    if to_regprocedure(f.signature) is null then
      raise exception 'Fonction prerequisite absente : %', f.signature;
    end if;
    if md5(regexp_replace(btrim(pg_get_functiondef(to_regprocedure(f.signature))), '[[:space:]]+', ' ', 'g')) <> f.empreinte then
      raise exception 'Corps prerequisite different du catalogue relu : %', f.signature;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.posts', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.posts', 'content', 'UPDATE')
     or has_column_privilege('authenticated', 'public.posts', 'edited_at', 'UPDATE') then
    raise exception 'Droits posts incompatibles : edition du texte seul requise (13/11)';
  end if;
end $prerequis$;

-- Des policies restrictives complètent les contrôles d'identité/blocage existants.
drop policy if exists post_comments_visibilite_insert on public.post_comments;
create policy post_comments_visibilite_insert on public.post_comments as restrictive
  for insert to authenticated with check (public.post_is_visible(post_id));
drop policy if exists post_comments_visibilite_update on public.post_comments;
create policy post_comments_visibilite_update on public.post_comments as restrictive
  for update to authenticated using (public.post_is_visible(post_id))
  with check (public.post_is_visible(post_id));
drop policy if exists post_likes_visibilite_insert on public.post_likes;
create policy post_likes_visibilite_insert on public.post_likes as restrictive
  for insert to authenticated with check (public.post_is_visible(post_id));
drop policy if exists comment_likes_visibilite_insert on public.comment_likes;
create policy comment_likes_visibilite_insert on public.comment_likes as restrictive
  for insert to authenticated with check (public.comment_target_visible(comment_id));
drop policy if exists ci_visibilite_insert on public.comment_interactions;
create policy ci_visibilite_insert on public.comment_interactions as restrictive
  for insert to authenticated with check (public.comment_target_visible(comment_id, post_id));
drop policy if exists story_views_visibilite_insert on public.story_views;
create policy story_views_visibilite_insert on public.story_views as restrictive
  for insert to authenticated with check (public.story_visible(story_id));

-- L'auteur de la publication peut retirer un commentaire reçu, y compris ancien.
-- Le SELECT correspondant est nécessaire au DELETE filtré par identifiant.
drop policy if exists post_comments_select_auteur_publication on public.post_comments;
create policy post_comments_select_auteur_publication on public.post_comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id
    and p.author_id = (select auth.uid())::text));
drop policy if exists post_comments_delete_auteur_publication on public.post_comments;
create policy post_comments_delete_auteur_publication on public.post_comments for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id
    and p.author_id = (select auth.uid())::text));

-- La lecture est nécessaire au DELETE filtré de PostgREST. L'auteur de la story
-- garde la maîtrise des commentaires même après un blocage dans l'un ou l'autre sens.
drop policy if exists story_comments_select on public.story_comments;
create policy story_comments_select on public.story_comments for select to authenticated
  using (public.story_est_a_moi(story_id)
         or (public.story_visible(story_id) and not public.is_blocked_with(author_id)));

-- Le prédicat existant comment_target_visible teste la publication AVANT l'activité.
-- Le combiner au prédicat temps réel ferme le cas homonyme sans toucher aux fonctions.
drop policy if exists passio_rt_recevoir_fil on realtime.messages;
create policy passio_rt_recevoir_fil on realtime.messages for select to authenticated
  using (realtime.topic() like 'fil:%'
    and public.fil_temps_reel_visible(substr(realtime.topic(), 5))
    and public.comment_target_visible(null::text, substr(realtime.topic(), 5))
    and not public.post_auteur_bloque(substr(realtime.topic(), 5)));

-- Seule la clé d'une cible éditable par moi devient lisible ; aucune décision, aucun
-- signaleur ni horodatage n'est exposé. Aucune écriture cliente n'est accordée.
grant select (target_type, target_id) on public.contenus_masques to authenticated;
drop policy if exists moderation_cible_propre on public.contenus_masques;
create policy moderation_cible_propre on public.contenus_masques for select to authenticated
  using (target_type = 'post' and public.can_edit_post(target_id));
drop policy if exists posts_edition_sans_moderation on public.posts;
create policy posts_edition_sans_moderation on public.posts as restrictive for update to authenticated
  using (not exists (select 1 from public.contenus_masques m
    where m.target_type = 'post' and m.target_id = posts.id))
  with check (not exists (select 1 from public.contenus_masques m
    where m.target_type = 'post' and m.target_id = posts.id));

-- Échouer explicitement si un prérequis de sécurité manque.
do $verdict$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.contenus_masques'::regclass)
     or has_table_privilege('authenticated', 'public.contenus_masques', 'INSERT')
     or has_table_privilege('authenticated', 'public.contenus_masques', 'UPDATE')
     or has_table_privilege('authenticated', 'public.contenus_masques', 'DELETE')
     or has_column_privilege('authenticated', 'public.contenus_masques', 'decision', 'SELECT')
     or has_any_column_privilege('anon', 'public.contenus_masques', 'SELECT') then
    raise exception 'Droits de moderation incompatibles';
  end if;
end $verdict$;
commit;
