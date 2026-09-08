-- ══════════════════════════════════════════════════════════════════════════
-- CRÉER UNE PASSION DEPUIS L'APPLICATION  (2026-09-08)
--
-- « Chacun peut créer une passion » — premier reproche des testeurs : le
-- référentiel plat compte 1 908 entrées, mais quand la recherche ne trouve
-- rien, l'application ne savait que DÉPOSER UNE DEMANDE (`passion_requests`,
-- état « en vérification »), jamais créer. Une passion demandée n'est pas
-- publiable : `estPassionCanonique` la refuse et la clé étrangère de
-- `posts.passion_id` la refuserait de toute façon. Autrement dit, la porte
-- existait et ne menait nulle part.
--
-- ⚠️ LE RÉFÉRENTIEL RESTE NON INSCRIPTIBLE PAR UN CLIENT. Aucune policy
-- INSERT/UPDATE/DELETE n'est ajoutée sur `public.passions` : la vérification
-- ⑥ de `scripts/verifier-migration-passions.sh` (un `authenticated` ne peut ni
-- insérer ni supprimer) doit rester VERTE après cette migration. La création
-- passe par UNE fonction `SECURITY DEFINER`, seule à connaître l'identifiant,
-- le statut, la source et le pliage — un client ne choisit que le NOM.
--   • pas d'`id` fourni par le client (il aurait pu écraser « musique ») ;
--   • pas de `status`/`source`/`popularity` fournis (pas d'auto-promotion) ;
--   • dédoublonnage sur `normalized_label` ET sur les alias, avant insertion ;
--   • plafond par personne (5 / 24 h, 30 au total) : sans lui, une boucle
--     remplit le référentiel de 10 000 lignes en une minute.
--
-- IDEMPOTENTE : `add column if not exists`, `create or replace function`,
-- `create index if not exists`. Vérifiée par
-- `scripts/verifier-migration-creation-passion.sh` (exécutée en CI).
--
-- Retour arrière :
--   drop function if exists public.creer_passion(text, text);
--   update public.passions set status='archived' where source='user_suggested';
--   -- (la colonne `created_by` peut rester : elle ne gêne rien)
-- ══════════════════════════════════════════════════════════════════════════

-- ── ① Qui a créé la passion ───────────────────────────────────────────────
-- Sans référence à `auth.users` : la table du schéma `auth` n'existe pas sur
-- le socle de test, et une passion doit SURVIVRE à la suppression du compte
-- qui l'a créée (les publications des autres la référencent).
alter table public.passions add column if not exists created_by uuid;

create index if not exists passions_created_by_idx
  on public.passions (created_by, created_at desc);

-- ── ② La fonction de création ─────────────────────────────────────────────
create or replace function public.creer_passion(p_label text, p_emoji text default null)
returns table (id text, label text, emoji text, color text, cree boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_brut   text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_norme  text;
  v_slug   text;
  v_essai  text;
  v_i      int := 1;
  v_emoji  text;
  v_exist  public.passions%rowtype;
  v_recent int;
  v_total  int;
begin
  -- Il faut un compte. La porte cliente double cette garde, mais c'est ICI que
  -- la règle est tenue : une garde d'affichage n'a jamais été une garde.
  if v_uid is null then
    raise exception 'auth_requise' using errcode = '42501';
  end if;

  v_brut  := left(v_brut, 60);
  v_norme := btrim(regexp_replace(public.unaccent_immutable(v_brut), '[^a-z0-9]+', ' ', 'g'));

  -- Le MÊME pliage que `norme()` (js/passions-flat.js) et que `normalized_label`
  -- en base. Trois pliages différents, c'est « moto cross » qui trouve
  -- « Motocross » d'un côté et pas de l'autre.
  if char_length(v_norme) < 2 or char_length(v_norme) > 60 then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if v_norme !~ '[a-z]' then                      -- « 2025 », « 4 4 » : non
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if array_length(regexp_split_to_array(v_norme, ' '), 1) > 6 then
    raise exception 'nom_trop_long' using errcode = '22023';
  end if;
  -- Une passion n'est pas une adresse : sans ça le référentiel devient un mur
  -- de liens. (Le pliage a déjà retiré les « . » et « / », on regarde le brut.)
  if v_brut ~* '(https?:|www\.|@|\.[a-z]{2,4}/)' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  -- ⚠️ `passions.label` DEVIENT UN CONTENU INSÉRABLE PAR TOUT COMPTE, et il est
  -- lu par tout le monde : même famille que `comment_interactions` et
  -- `event_reactions`. Les surfaces qui l'affichent doivent échapper — et
  -- elles le font — mais on refuse ici ce qui n'a aucune raison d'exister dans
  -- un nom de passion, plutôt que de compter sur le dernier rempart.
  -- (L'apostrophe reste admise : « Généalogie d''Alsace » est un nom légitime.)
  if v_brut ~ '[<>&"\\`]' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;

  -- ── Déjà là ? On rend l'existante, on n'en crée pas une variante ─────────
  select * into v_exist from public.passions p
   where p.normalized_label = v_norme
      -- ⚠️ L'ALIAS SE PLIE COMME LA FRAPPE, sinon 386 des 1 578 alias — tous
      -- ceux qui portent un tiret ou un accent composé (« ping-pong »,
      -- « muay-thaï », « hors-piste ») — ne dédoublonnent RIEN : taper
      -- « ping pong » créait un doublon de « Tennis de table » dans le
      -- référentiel COMMUN.
      or exists (select 1 from unnest(p.aliases) a
                  where btrim(regexp_replace(public.unaccent_immutable(a), '[^a-z0-9]+', ' ', 'g')) = v_norme)
   order by (p.status = 'active') desc, p.popularity desc
   limit 1;

  if found then
    if v_exist.status <> 'active' then
      -- Retirée du référentiel (doublon fusionné, modération) : on ne la
      -- ressuscite pas depuis le client, et on le DIT — un refus muet se lit
      -- comme une panne.
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
    return query select v_exist.id, v_exist.label, v_exist.emoji, v_exist.color, false;
    return;
  end if;

  -- ── Plafonds par personne ───────────────────────────────────────────────
  select count(*) into v_recent from public.passions
   where created_by = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'quota_jour' using errcode = '53400';
  end if;
  select count(*) into v_total from public.passions where created_by = v_uid;
  if v_total >= 30 then
    raise exception 'quota_total' using errcode = '53400';
  end if;

  -- ── Identifiant ─────────────────────────────────────────────────────────
  -- Dérivé du nom, jamais fourni par le client. Le suffixe numérique ne sert
  -- qu'aux collisions de SLUG sans collision de LIBELLÉ (le doublon a déjà été
  -- écarté plus haut) — par exemple un identifiant historique homonyme.
  v_slug  := replace(v_norme, ' ', '-');
  v_essai := v_slug;
  while exists (select 1 from public.passions p where p.id = v_essai) loop
    v_i := v_i + 1;
    v_essai := v_slug || '-' || v_i::text;
    if v_i > 50 then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
  end loop;

  -- ── Emoji ───────────────────────────────────────────────────────────────
  -- Facultatif, et strictement décoratif : on refuse tout ce qui pourrait être
  -- du texte (donc du balisage) plutôt que de tenter de le nettoyer.
  v_emoji := btrim(coalesce(p_emoji, ''));
  if v_emoji = '' or char_length(v_emoji) > 4 or v_emoji ~ '[a-zA-Z0-9<>&"''/\\]' then
    v_emoji := '✨';
  end if;

  insert into public.passions
    (id, label, emoji, color, sort_order, normalized_label, aliases,
     status, source, is_broad, popularity, created_by)
  values
    (v_essai,
     -- Première lettre en capitale : « guitare jazz » saisi en minuscules
     -- s'affiche à côté de « Guitare » et de « Jazz », dans les mêmes rails.
     upper(left(v_brut, 1)) || substr(v_brut, 2),
     v_emoji, '#7c3aed', 5000, v_norme, '{}',
     'active', 'user_suggested', false, 0, v_uid);

  -- Les demandes en attente qui portaient ce nom sont satisfaites : sans ça,
  -- « Mes passions » afficherait « en vérification » à côté de la passion
  -- vivante qui vient d'être créée.
  update public.passion_requests r
     set status = 'approved'
   where r.normalized_label = v_norme and r.status = 'pending';

  return query
    select p.id, p.label, p.emoji, p.color, true
      from public.passions p where p.id = v_essai;
end $$;

revoke all on function public.creer_passion(text, text) from public;
grant execute on function public.creer_passion(text, text) to authenticated;

comment on function public.creer_passion(text, text) is
  'Crée une passion du référentiel au nom de auth.uid(). Seul point d''écriture client sur public.passions (RLS : lecture seule). Dédoublonne, plafonne (5/24h, 30/compte), dérive l''identifiant.';
