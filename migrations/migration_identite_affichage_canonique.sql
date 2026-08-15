-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTITÉ D'AFFICHAGE CANONIQUE — ferme l'usurpation par champs dénormalisés.
-- Incident F4 (analyse croisée du 2026-08-15).
--
-- ⚠️ PRÉPARÉE, NON APPLIQUÉE. À passer sous supervision (une policy ou un
--    trigger fautif sur la beta ne se voit qu'au réveil).
--
-- LE PROBLÈME
-- Les policies d'insertion ne contraignent QUE l'identifiant :
--     video_lives INSERT WITH CHECK (author_id = auth.uid()::text)
-- Or ces tables portent aussi des champs d'AFFICHAGE dénormalisés
-- (author_name, author_photo, author_emoji) qui sont du texte libre écrit par
-- le client, jamais recoupés avec `profiles`, et rendus tels quels par l'app.
--
-- Conséquence : tout compte authentifié peut publier avec SON author_id et le
-- NOM et la PHOTO de quelqu'un d'autre. La RLS est satisfaite, l'échappement
-- fait son travail (ce n'est pas une XSS) — et l'affichage ment quand même.
-- L'échappement empêche l'injection, pas l'usurpation.
--
-- LE CORRECTIF
-- Le serveur cesse d'accepter une assertion d'identité venant d'un client
-- hostile : il la RÉÉCRIT depuis la source canonique (`profiles`).
--
-- BEFORE INSERT **OR UPDATE** — et c'est essentiel. Ne fermer que l'INSERT
-- laisserait la séquence : créer correctement, puis UPDATE author_name vers
-- l'identité de la victime. On fermerait la porte en laissant la fenêtre.
--
-- CE QU'IL FAUT TRANCHER AVANT D'APPLIQUER (décision produit, pas technique)
-- `author_name` signifie-t-il « le nom AU MOMENT de la publication » (instantané
-- historique) ou « le nom ACTUEL du profil » ? Les deux sont légitimes :
--   • instantané  → ce trigger suffit, il fige le nom canonique à l'écriture ;
--   • nom actuel  → il faudrait en plus une jointure à l'affichage, ou une
--                   propagation lors du renommage d'un profil.
-- Ce fichier implémente l'INSTANTANÉ : il fige la valeur canonique à l'écriture,
-- sans toucher aux lectures (donc sans ajouter de jointure sur les chemins chauds).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fonction : réécrit les champs d'affichage depuis le profil propriétaire ──
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
  proprietaire := coalesce(
    to_jsonb(new) ->> 'author_id',
    to_jsonb(new) ->> 'user_id'
  );

  if proprietaire is null then
    return new;                       -- rien à rattacher : on laisse la RLS trancher
  end if;

  select username, avatar_url, emoji into p
  from public.profiles where id = proprietaire;

  if not found then
    return new;                       -- pas de profil (compte incomplet) : on ne fabrique rien
  end if;

  -- Réécriture inconditionnelle : ce que le client a proposé n'est jamais retenu.
  if to_jsonb(new) ? 'author_name'  then new.author_name  := p.username;   end if;
  if to_jsonb(new) ? 'author_photo' then new.author_photo := p.avatar_url; end if;
  if to_jsonb(new) ? 'author_emoji' then new.author_emoji := p.emoji;      end if;

  return new;
end;
$$;

revoke execute on function public.identite_affichage_canonique() from public, anon, authenticated;

-- ── Application aux 4 tables qui portent une identité d'affichage ───────────
-- (posts, stories, events, cdv_lives ne portent QUE author_id : rien à réécrire.)
drop trigger if exists trg_identite_affichage on public.video_lives;
create trigger trg_identite_affichage
  before insert or update on public.video_lives
  for each row execute function public.identite_affichage_canonique();

drop trigger if exists trg_identite_affichage on public.event_comments;
create trigger trg_identite_affichage
  before insert or update on public.event_comments
  for each row execute function public.identite_affichage_canonique();

drop trigger if exists trg_identite_affichage on public.cdv_live_comments;
create trigger trg_identite_affichage
  before insert or update on public.cdv_live_comments
  for each row execute function public.identite_affichage_canonique();

drop trigger if exists trg_identite_affichage on public.step_interactions;
create trigger trg_identite_affichage
  before insert or update on public.step_interactions
  for each row execute function public.identite_affichage_canonique();

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL — séparé, à lancer APRÈS validation des triggers.
-- Le trigger ne répare pas l'existant : il empêche la suite. Ces UPDATE
-- réalignent l'historique sur la source canonique. À passer table par table,
-- en vérifiant le nombre de lignes touchées avant de continuer.
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
--   drop trigger if exists trg_identite_affichage on public.video_lives;
--   drop trigger if exists trg_identite_affichage on public.event_comments;
--   drop trigger if exists trg_identite_affichage on public.cdv_live_comments;
--   drop trigger if exists trg_identite_affichage on public.step_interactions;
--   drop function if exists public.identite_affichage_canonique();
-- Le backfill, lui, n'est pas réversible : faire une sauvegarde avant.
-- ═══════════════════════════════════════════════════════════════════════════
