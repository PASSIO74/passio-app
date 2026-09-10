-- ═══════════════════════════════════════════════════════════════════════════
-- ALIAS À LA CRÉATION D'UNE PASSION — 2026-09-10
--
-- ⚠️ CE QUE CE LOT RÉPARE, ET COMMENT ON L'A SU.
-- Le rattrapage du 2026-09-10 a porté le référentiel à 3 674 alias : plus une
-- seule des 2 088 passions curées n'est sans alias. En vérifiant le résultat
-- EN BASE, il restait pourtant six lignes à zéro alias — les passions créées
-- depuis l'application. `creer_passion` écrivait `aliases = '{}'` EN DUR.
--
-- Ce n'est pas un oubli cosmétique : c'est une INÉGALITÉ STRUCTURELLE. Une
-- passion curée est atteinte par deux ou trois formulations ; une passion
-- créée par quelqu'un n'est atteinte que par son orthographe exacte. « GRS »
-- (créée le 2026-09-09, bien réelle) est introuvable en tapant « gymnastique
-- rythmique ». La personne qui la crée est justement celle qui sait comment on
-- la nomme autrement — on ne le lui demandait jamais.
--
-- ⚠️ LE LIBELLÉ SEUL DÉCIDE DU DOUBLON, UN ALIAS N'A JAMAIS CE POUVOIR.
-- Tentant de dire « ton alias correspond à une passion existante, donc c'est
-- un doublon » — et faux : créer « Course nocturne » avec l'alias « running »
-- ne fait pas d'elle un doublon de Running, l'alias y est plus général. Un
-- alias qui percute l'existant est donc ÉCARTÉ, jamais un motif de refus. Une
-- seule règle, explicable en une phrase.
--
-- ⚠️ ET IL EST ÉCARTÉ, PAS ACCEPTÉ EN SILENCE. Un alias qui est le LIBELLÉ
-- d'une autre passion fait remonter deux entrées pour le même mot, et le
-- classement de `rechercher_passions` (score, popularité, sort_order) départage
-- alors sur un critère que personne n'a choisi. C'est exactement l'erreur que
-- `scripts/valider-referentiel-passions.js` refuse dans le dépôt depuis
-- toujours ; la base ne la refusait nulle part. La fonction RETOURNE donc les
-- alias RETENUS, pour que le client puisse dire la vérité plutôt que laisser
-- croire que tout a été gardé.
--
-- ⚠️ COMPATIBILITÉ : ON AJOUTE UNE SURCHARGE, ON NE REMPLACE PAS.
-- Le client déployé appelle `creer_passion(p_label, p_emoji)`. Un troisième
-- paramètre `default null` sur la MÊME fonction rendrait tout appel à deux
-- arguments AMBIGU (« function is not unique ») dès que les deux coexistent —
-- et un appel ambigu, côté PostgREST, se lit comme « la fonction n'existe
-- pas », donc comme un repli sur la demande non publiable. La forme à deux
-- arguments SURVIT donc, en délégant à la forme à trois.
--
-- ⚠️ LE TYPE DE RETOUR CHANGE (une colonne `aliases` s'ajoute), et PostgreSQL
-- refuse un `create or replace` qui modifie les colonnes rendues. Les deux
-- signatures sont donc SUPPRIMÉES puis recréées — ce qui EFFACE LEURS GRANTS.
-- Les `revoke`/`grant` sont rejoués pour les deux, et nommément pour `anon` :
-- les privilèges par défaut de Supabase redonnent EXECUTE à `anon` sur toute
-- fonction créée dans `public`, par un grant NOMINATIF qu'un
-- `revoke ... from public` laisse entier (mesuré en production le 2026-09-08).
--
-- Idempotente, rejouable. Aucune donnée existante n'est modifiée.
--
-- RETOUR ARRIÈRE :
--   drop function if exists public.creer_passion(text, text, text[]);
--   drop function if exists public.creer_passion(text, text);
--   puis réappliquer migration_passion_creations_offertes.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① Le pliage, UNE SEULE FOIS ───────────────────────────────────────────
-- Le même que `norme()` (js/passions-flat.js), que `normalized_label` en base
-- et que le dédoublonnage de `creer_passion`. Trois pliages différents, c'est
-- « moto cross » qui trouve « Motocross » d'un côté et pas de l'autre — le
-- défaut déjà rencontré sur les alias ponctués (386 des 1 578 de l'époque).
create or replace function public.passion_plier(p_texte text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    public.unaccent_immutable(coalesce(p_texte, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

comment on function public.passion_plier(text) is
  'Pliage de recherche commun (accents, ponctuation, casse). MÊME règle que norme() côté client et que normalized_label.';

-- ── ② La fonction, avec alias ─────────────────────────────────────────────
drop function if exists public.creer_passion(text, text, text[]);
drop function if exists public.creer_passion(text, text);

create function public.creer_passion(p_label text, p_emoji text, p_aliases text[])
returns table (id text, label text, emoji text, color text, cree boolean, aliases text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_brut    text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_norme   text;
  v_slug    text;
  v_essai   text;
  v_i       int := 1;
  v_emoji   text;
  v_exist   public.passions%rowtype;
  v_total   int;
  v_max     int;
  v_a       text;
  v_an      text;
  v_gardes  text[] := '{}';
  v_plies   text[] := '{}';
begin
  if v_uid is null then
    raise exception 'auth_requise' using errcode = '42501';
  end if;

  v_brut  := left(v_brut, 60);
  v_norme := public.passion_plier(v_brut);

  if char_length(v_norme) < 2 or char_length(v_norme) > 60 then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if v_norme !~ '[a-z]' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if array_length(regexp_split_to_array(v_norme, ' '), 1) > 6 then
    raise exception 'nom_trop_long' using errcode = '22023';
  end if;
  if v_brut ~* '(https?:|www\.|@|\.[a-z]{2,4}/)' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if v_brut ~ '[<>&"\\`]' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;

  -- ── Déjà là ? On rend l'existante ───────────────────────────────────────
  -- ⚠️ Le LIBELLÉ seul est interrogé ici, et les alias de l'EXISTANT. Les
  -- alias PROPOSÉS n'entrent pas dans ce test : voir l'en-tête.
  select * into v_exist from public.passions p
   where p.normalized_label = v_norme
      or exists (select 1 from unnest(p.aliases) a
                  where public.passion_plier(a) = v_norme)
   order by (p.status = 'active') desc, p.popularity desc
   limit 1;

  if found then
    if v_exist.status <> 'active' then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
    return query select v_exist.id, v_exist.label, v_exist.emoji, v_exist.color,
                        false, v_exist.aliases;
    return;
  end if;

  -- ── Plafond de créations par compte ─────────────────────────────────────
  -- `passion_quotas` : aucune ligne = le défaut (3) ; une ligne à NULL =
  -- illimité. On tranche sur `found`, JAMAIS sur un coalesce de la valeur —
  -- sinon la table donnerait l'illimité à tout le monde par le seul fait
  -- d'exister.
  select q.creations_max into v_max from public.passion_quotas q where q.user_id = v_uid;
  if not found then v_max := 3; end if;
  if v_max is not null then
    select count(*) into v_total from public.passions where created_by = v_uid;
    if v_total >= v_max then
      raise exception 'quota_creation' using errcode = '53400';
    end if;
  end if;

  -- ── Identifiant ─────────────────────────────────────────────────────────
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
  v_emoji := btrim(coalesce(p_emoji, ''));
  if v_emoji = '' or char_length(v_emoji) > 4 or v_emoji ~ '[a-zA-Z0-9<>&"''/\\]' then
    v_emoji := '✨';
  end if;

  -- ── Alias : on garde ce qui sert, on écarte le reste ────────────────────
  -- Cinq au plus. Au-delà, ce n'est plus un synonyme, c'est du référencement.
  foreach v_a in array coalesce(p_aliases, '{}'::text[]) loop
    exit when cardinality(v_gardes) >= 5;
    v_a  := left(regexp_replace(btrim(coalesce(v_a, '')), '\s+', ' ', 'g'), 60);
    v_an := public.passion_plier(v_a);

    continue when char_length(v_an) < 2;          -- vide ou trop court
    continue when v_an !~ '[a-z]';                -- « 2025 » n'aide personne
    continue when v_a ~ '[<>&"\\`]';              -- même refus que le libellé
    continue when v_a ~* '(https?:|www\.|@|\.[a-z]{2,4}/)';
    continue when v_an = v_norme;                 -- l'alias de son propre nom
    continue when v_an = any (v_plies);           -- doublon dans la liste
    -- ⚠️ LE CONTRÔLE QUI COMPTE : un alias qui est déjà le LIBELLÉ ou l'ALIAS
    -- d'une autre passion ferait remonter deux entrées pour le même mot.
    continue when exists (
      select 1 from public.passions p
       where p.normalized_label = v_an
          or exists (select 1 from unnest(p.aliases) x
                      where public.passion_plier(x) = v_an));

    v_gardes := v_gardes || v_a;
    v_plies  := v_plies  || v_an;
  end loop;

  insert into public.passions
    (id, label, emoji, color, sort_order, normalized_label, aliases,
     status, source, is_broad, popularity, created_by)
  values
    (v_essai,
     upper(left(v_brut, 1)) || substr(v_brut, 2),
     v_emoji, '#7c3aed', 5000, v_norme, v_gardes,
     'active', 'user_suggested', false, 0, v_uid);

  update public.passion_requests r
     set status = 'approved'
   where r.normalized_label = v_norme and r.status = 'pending';

  return query
    select p.id, p.label, p.emoji, p.color, true, p.aliases
      from public.passions p where p.id = v_essai;
end $$;

-- ── ③ La forme historique SURVIT, en déléguant ────────────────────────────
-- Le client déployé appelle deux arguments. Sans cette surcharge, il tomberait
-- en « la fonction n'existe pas » — donc en repli sur la demande non
-- publiable, sans un message utile.
create function public.creer_passion(p_label text, p_emoji text default null)
returns table (id text, label text, emoji text, color text, cree boolean, aliases text[])
language sql
security definer
set search_path = public
as $$
  select * from public.creer_passion(p_label, p_emoji, null::text[]);
$$;

comment on function public.creer_passion(text, text, text[]) is
  'Crée une passion du référentiel au nom de auth.uid(), avec ses alias. Les alias qui percutent une passion existante sont ÉCARTÉS (jamais un motif de refus) et la colonne aliases rendue dit lesquels ont été retenus.';
comment on function public.creer_passion(text, text) is
  'Forme historique (deux arguments) : délègue à creer_passion(text,text,text[]). Conservée pour le client déployé — un troisième paramètre à défaut rendrait tout appel à deux arguments ambigu.';

-- ── ④ Les grants, effacés par le DROP, sont rejoués ───────────────────────
revoke all on function public.creer_passion(text, text, text[]) from public;
revoke all on function public.creer_passion(text, text, text[]) from anon;
grant execute on function public.creer_passion(text, text, text[]) to authenticated;
revoke all on function public.creer_passion(text, text) from public;
revoke all on function public.creer_passion(text, text) from anon;
grant execute on function public.creer_passion(text, text) to authenticated;
revoke all on function public.passion_plier(text) from public;
revoke all on function public.passion_plier(text) from anon;
