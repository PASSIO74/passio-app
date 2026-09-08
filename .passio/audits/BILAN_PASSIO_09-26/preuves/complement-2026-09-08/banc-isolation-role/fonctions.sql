CREATE OR REPLACE FUNCTION public.can_edit_post(pid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = pid AND p.author_id = auth.uid()::text)
      OR EXISTS (SELECT 1 FROM post_collaborators c WHERE c.post_id = pid AND c.user_id = auth.uid()::text);
$function$;
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT CASE WHEN auth.uid() IS NULL OR _other IS NULL OR _other = (auth.uid())::text THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other) OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)) END
$function$;
CREATE OR REPLACE FUNCTION public.can_join_event_conversation(_conv_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT CASE WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.events e JOIN public.event_attendees a ON a.event_id = e.id AND a.user_id = (auth.uid())::text JOIN public.conversations c ON c.id = e.conv_id
       WHERE e.conv_id = _conv_id AND e.conv_id = ('evgrp_' || e.id) AND c.created_by = e.author_id AND e.status = 'active' AND a.rsvp IN ('going', 'maybe') AND NOT public.is_blocked_with(e.author_id)) END
$function$;
CREATE OR REPLACE FUNCTION public.post_is_visible(pid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select case when pid is null then true when not exists (select 1 from posts where id = pid) then true
    else exists (select 1 from posts p where p.id = pid and (p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or exists (select 1 from follows f where f.follower_id = (select auth.uid())::text and f.following_id = p.author_id))) end
$function$;
CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select case when cid is null then true
    when exists (select 1 from posts where id = cid) then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid) then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    else true end
$function$;
CREATE OR REPLACE FUNCTION public.declare_birth_year(_birth_year integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid TEXT; v_candidate DATE; v_applied BOOLEAN;
BEGIN
  v_uid := (auth.uid())::text;
  IF v_uid IS NULL OR _birth_year IS NULL THEN RETURN FALSE; END IF;
  IF _birth_year < 1900 OR _birth_year > EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN RETURN FALSE; END IF;
  v_candidate := make_date(_birth_year + 18, 12, 31);
  INSERT INTO public.user_safety AS s (user_id, majority_at) VALUES (v_uid, v_candidate)
  ON CONFLICT (user_id) DO UPDATE SET majority_at = EXCLUDED.majority_at, updated_at = NOW()
    WHERE s.majority_at IS NULL OR EXCLUDED.majority_at > s.majority_at
  RETURNING TRUE INTO v_applied;
  RETURN COALESCE(v_applied, FALSE);
END $function$;
CREATE OR REPLACE FUNCTION public.identite_affichage_canonique() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare proprietaire text; p record;
begin
  proprietaire := coalesce(to_jsonb(new) ->> 'author_id', to_jsonb(new) ->> 'user_id');
  if proprietaire is null then return new; end if;
  select username, avatar_url, emoji into p from public.profiles where id = proprietaire;
  if not found then return new; end if;
  if to_jsonb(new) ? 'author_name'  then new.author_name  := p.username;   end if;
  if to_jsonb(new) ? 'author_photo' then new.author_photo := p.avatar_url; end if;
  if to_jsonb(new) ? 'author_emoji' then new.author_emoji := p.emoji;      end if;
  return new;
end; $function$;
CREATE OR REPLACE FUNCTION public.irl_interaction_allowed(_other text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT CASE WHEN auth.uid() IS NULL OR _other IS NULL OR _other = (auth.uid())::text THEN FALSE
    WHEN public.is_blocked_with(_other) THEN FALSE
    ELSE (COALESCE((SELECT s.majority_at <= CURRENT_DATE FROM public.user_safety s WHERE s.user_id = (auth.uid())::text), FALSE)
      AND COALESCE((SELECT s.majority_at <= CURRENT_DATE FROM public.user_safety s WHERE s.user_id = _other), FALSE)) END
$function$;
CREATE OR REPLACE FUNCTION public.is_conv_member(_conv_id text, _uid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $function$;
CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conv_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT CASE WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE ELSE EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = _conv_id AND c.created_by = (auth.uid())::text) END
$function$;
CREATE OR REPLACE FUNCTION public.posts_freeze_author() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN NEW.author_id := OLD.author_id; END IF; RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.propager_identite_affichage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  update public.video_lives set author_name = new.username, author_photo = new.avatar_url, author_emoji = new.emoji where author_id = new.id;
  update public.event_comments set author_name = new.username where author_id = new.id;
  update public.cdv_live_comments set author_name = new.username where author_id = new.id;
  update public.step_interactions set author_name = new.username, author_emoji = new.emoji where user_id = new.id;
  return new;
end; $function$;
CREATE OR REPLACE FUNCTION public.rate_limit_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE user_col text := TG_ARGV[0]; max_per_min int := TG_ARGV[1]::int; uid text; cnt int;
BEGIN
  NEW.created_at := now();
  EXECUTE format('SELECT ($1).%I', user_col) INTO uid USING NEW;
  IF uid IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - interval ''1 minute''', TG_TABLE_SCHEMA, TG_TABLE_NAME, user_col) INTO cnt USING uid;
  IF cnt >= max_per_min THEN RAISE EXCEPTION 'rate limit: max % insertions/minute sur %', max_per_min, TG_TABLE_NAME USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.storage_chemin_autorise(_bucket text, _name text) RETURNS boolean LANGUAGE sql STABLE AS $function$
  select (_bucket = 'content' and (storage.foldername(_name))[2] = (select auth.uid())::text)
    or (_bucket = 'attachments' and public.is_conv_member((storage.foldername(_name))[2], (select auth.uid())::text));
$function$;
CREATE OR REPLACE FUNCTION public.unaccent_immutable(txt text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $function$
  select translate(lower(txt), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa');
$function$;
CREATE OR REPLACE FUNCTION public.user_safety_majorite_non_avancable() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN
  IF OLD.majority_at IS NOT NULL AND (NEW.majority_at IS NULL OR NEW.majority_at < OLD.majority_at) THEN
    RAISE EXCEPTION 'majority_at ne peut pas etre avancee (%->%)', OLD.majority_at, NEW.majority_at USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW(); RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.user_state_horodatage_serveur() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
begin new.updated_at := now(); return new; end; $function$;
-- Grants EXECUTE tels que relevés en production le 2026-09-08 (has_function_privilege)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_post(text), public.comment_target_visible(text), public.is_conv_member(text,text), public.post_is_visible(text), public.storage_chemin_autorise(text,text), public.unaccent_immutable(text), public.user_state_horodatage_serveur() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_event_conversation(text), public.declare_birth_year(integer), public.irl_interaction_allowed(text), public.is_blocked_with(text), public.is_conversation_creator(text) TO authenticated;
-- Triggers réels (le broadcast realtime est remplacé par un stub : hors périmètre RLS)
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.comment_interactions FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('user_id', '60');
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.event_reactions FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('user_id', '30');
CREATE TRIGGER trg_rate_limit BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION rate_limit_insert('reporter_id', '10');
CREATE TRIGGER trg_posts_freeze_author BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION posts_freeze_author();
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.video_lives FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.event_comments FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.cdv_live_comments FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER trg_identite_affichage BEFORE INSERT OR UPDATE ON public.step_interactions FOR EACH ROW EXECUTE FUNCTION identite_affichage_canonique();
CREATE TRIGGER trg_propager_identite AFTER UPDATE OF username, avatar_url, emoji ON public.profiles FOR EACH ROW WHEN (((old.username IS DISTINCT FROM new.username) OR (old.avatar_url IS DISTINCT FROM new.avatar_url) OR (old.emoji IS DISTINCT FROM new.emoji))) EXECUTE FUNCTION propager_identite_affichage();
CREATE TRIGGER trg_user_state_horodatage BEFORE INSERT OR UPDATE ON public.user_state FOR EACH ROW EXECUTE FUNCTION user_state_horodatage_serveur();
CREATE TRIGGER trg_user_safety_majorite BEFORE UPDATE ON public.user_safety FOR EACH ROW EXECUTE FUNCTION user_safety_majorite_non_avancable();
