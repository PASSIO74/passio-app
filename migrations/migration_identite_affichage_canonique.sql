-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTITÉ D'AFFICHAGE CANONIQUE — ferme l'usurpation ET suit le profil actuel.
-- Incident F4 (analyse croisée du 2026-08-15).
--
-- ⚠️ PRÉPARÉE, NON APPLIQUÉE. À passer sous supervision.
--
-- LE PROBLÈME
-- Les policies d'insertion ne contraignent QUE l'identifiant :
--     video_lives INSERT WITH CHECK (author_id = auth.uid()::text)
-- Or ces tables portent aussi des champs d'AFFICHAGE dénormalisés
-- (author_name, author_photo, author_emoji) : du texte libre écrit par le
-- client, jamais recoupé avec `profiles`, et rendu tel quel par l'app.
--
-- Tout compte authentifié peut donc publier avec SON author_id et le NOM et la
-- PHOTO de quelqu'un d'autre. La RLS est satisfaite, l'échappement fait son
-- travail (ce n'est pas une XSS) — et l'affichage ment quand même.
-- L'échappement empêche l'injection, pas l'usurpation.
--
-- DÉCISION PRODUIT (Benjamin, 2026-08-15) : **le nom actuel du profil**.
-- Un contenu doit afficher l'identité COURANTE de son auteur, pas celle figée
-- au moment de la publication. Renommer son profil met donc à jour tout
-- l'historique.
--
-- POURQUOI PAS UNE JOINTURE À L'AFFICHAGE
-- C'est l'implémentation naturelle de « nom actuel », mais elle ajouterait une
-- jointure sur les chemins les plus chauds (fil, commentaires, lives) alors que
-- les lectures écrasent en nombre les écritures, et les écritures écrasent les
-- renommages. On garde donc la dénormalisation — plus rapide en lecture — et on
-- la maintient VRAIE par deux triggers. Le client n'a rien à changer : il lit
-- déjà ces colonnes.
--
-- 1. À l'écriture   : la valeur proposée par le client est ÉCRASÉE par la
--                     valeur canonique (anti-usurpation).
-- 2. Au renommage   : toutes les lignes de l'auteur sont propagées
--                     (sémantique « nom actuel »).
--
-- BEFORE INSERT **OR UPDATE** — essentiel. Ne fermer que l'INSERT laisserait la
-- séquence : créer correctement, puis UPDATE author_name vers l'identité de la
-- victime. On fermerait la porte en laissant la fenêtre.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. À L'ÉCRITURE : réécriture depuis le profil propriétaire ──────────────
-- SECURITY DEFINER car un utilisateur n'a pas forcément le droit de lire tous
-- les profils ; search_path épinglé (durcissement advisor, cf. 2026-08-09).
create or replace function public.identite_affichage_canonique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proprietaire text;
  p            record;
begin
  -- Le propriétaire est `author_id` partout, sauf step_interactions (`user_id`).
  proprietaire := coalesce(to_jsonb(new) ->> 'author_id', to_jsonb(new) ->> 'user_id');
  if proprietaire is null then
    return new;                       -- rien à rattacher : on laisse la RLS trancher
  end if;

  select username, avatar_url, emoji into p from public.profiles where id = proprietaire;
  if not found then
    return new;                       -- pas de profil (compte incomplet) : on ne fabrique rien
  end if;

  -- Inconditionnel : ce que le client a proposé n'est jamais retenu.
  if to_jsonb(new) ? 'author_name'  then new.author_name  := p.username;   end if;
  if to_jsonb(new) ? 'author_photo' then new.author_photo := p.avatar_url; end if;
  if to_jsonb(new) ? 'author_emoji' then new.author_emoji := p.emoji;      end if;

  return new;
end;
$$;

revoke execute on function public.identite_affichage_canonique() from public, anon, authenticated;

drop trigger if exists trg_identite_affichage on public.video_lives;
create trigger trg_identite_affichage before insert or update on public.video_lives
  for each row execute function public.identite_affichage_canonique();

drop trigger if exists trg_identite_affichage on public.event_comments;
create trigger trg_identite_affichage before insert or update on public.event_comments
  for each row execute function public.identite_affichage_canonique();

drop trigger if exists trg_identite_affichage on public.cdv_live_comments;
create trigger trg_identite_affichage before insert or update on public.cdv_live_comments
  for each row execute function public.identite_affichage_canonique();

drop trigger if exists trg_identite_affichage on public.step_interactions;
create trigger trg_identite_affichage before insert or update on public.step_interactions
  for each row execute function public.identite_affichage_canonique();

-- ── 1bis. INDEX — sans eux, la propagation fait 4 scans séquentiels ─────────
-- Vérifié le 2026-08-15 : AUCUN index n'existe sur ces colonnes. À faible
-- volume c'est indolore, mais c'est précisément ce qui casse à l'échelle — et
-- la sémantique « nom actuel » rend le renommage écrivain, donc chaud.
-- ⚠️ Index SIMPLES, pas CONCURRENTLY : `supabase db query` enveloppe le fichier
-- dans une transaction, et `CREATE INDEX CONCURRENTLY` y est interdit (25001) —
-- le fichier entier était rejeté. Aux volumes actuels (la plus grosse de ces
-- tables porte 16 lignes) le verrou d'écriture dure des microsecondes, donc
-- l'index simple est sans conséquence.
-- Le jour où ces tables comptent des dizaines de milliers de lignes, il faudra
-- repasser en CONCURRENTLY et lancer ces quatre ordres UN PAR UN, hors fichier.
create index if not exists idx_video_lives_author       on public.video_lives(author_id);
create index if not exists idx_event_comments_author    on public.event_comments(author_id);
create index if not exists idx_cdv_live_comments_author on public.cdv_live_comments(author_id);
create index if not exists idx_step_interactions_user   on public.step_interactions(user_id);

-- ── 2. AU RENOMMAGE : propagation à tout l'historique ───────────────────────
-- C'est ce qui donne la sémantique « nom ACTUEL » sans jointure en lecture.
-- Ne se déclenche QUE si l'un des trois champs d'identité change : un simple
-- changement de bio ne doit pas réécrire des milliers de lignes.
create or replace function public.propager_identite_affichage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.video_lives
     set author_name = new.username, author_photo = new.avatar_url, author_emoji = new.emoji
   where author_id = new.id;

  update public.event_comments   set author_name = new.username where author_id = new.id;
  update public.cdv_live_comments set author_name = new.username where author_id = new.id;

  update public.step_interactions
     set author_name = new.username, author_emoji = new.emoji
   where user_id = new.id;

  return new;
end;
$$;

revoke execute on function public.propager_identite_affichage() from public, anon, authenticated;

drop trigger if exists trg_propager_identite on public.profiles;
create trigger trg_propager_identite
  after update of username, avatar_url, emoji on public.profiles
  for each row
  when (old.username is distinct from new.username
     or old.avatar_url is distinct from new.avatar_url
     or old.emoji      is distinct from new.emoji)
  execute function public.propager_identite_affichage();

-- ⚠️ Les triggers d'écriture (1) se redéclenchent sur ces UPDATE de propagation.
--    C'est SANS effet de bord : ils relisent le même profil et réécrivent les
--    mêmes valeurs. Pas de récursion — la propagation écrit dans les tables de
--    contenu, jamais dans `profiles`.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. BACKFILL — à lancer APRÈS validation des triggers, table par table, en
--    vérifiant le nombre de lignes touchées avant de continuer.
--    Le trigger empêche la suite ; ces UPDATE réparent l'existant.
-- ═══════════════════════════════════════════════════════════════════════════
-- update public.video_lives v set author_name = p.username, author_photo = p.avatar_url, author_emoji = p.emoji
--   from public.profiles p where p.id = v.author_id
--   and (v.author_name is distinct from p.username or v.author_photo is distinct from p.avatar_url);
--
-- update public.event_comments c set author_name = p.username
--   from public.profiles p where p.id = c.author_id and c.author_name is distinct from p.username;
--
-- update public.cdv_live_comments c set author_name = p.username
--   from public.profiles p where p.id = c.author_id and c.author_name is distinct from p.username;
--
-- update public.step_interactions s set author_name = p.username, author_emoji = p.emoji
--   from public.profiles p where p.id = s.user_id and s.author_name is distinct from p.username;

-- ═══════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE
--   drop trigger if exists trg_propager_identite on public.profiles;
--   drop trigger if exists trg_identite_affichage on public.video_lives;
--   drop trigger if exists trg_identite_affichage on public.event_comments;
--   drop trigger if exists trg_identite_affichage on public.cdv_live_comments;
--   drop trigger if exists trg_identite_affichage on public.step_interactions;
--   drop function if exists public.propager_identite_affichage();
--   drop function if exists public.identite_affichage_canonique();
-- Le backfill, lui, n'est pas réversible : sauvegarde avant.
--
-- COÛT À SURVEILLER
-- Un renommage écrit désormais dans 4 tables. Les index de la section 1bis le
-- rendent indolore aux volumes actuels. À l'échelle, si un profil très actif
-- porte des dizaines de milliers de contenus, la propagation devra passer en
-- ASYNCHRONE (file de travail) plutôt qu'en synchrone sur l'UPDATE du profil :
-- un renommage ne doit jamais faire attendre l'utilisateur qui se renomme.
-- Seuil indicatif à instrumenter : durée de l'UPDATE sur `profiles`.
-- ═══════════════════════════════════════════════════════════════════════════
