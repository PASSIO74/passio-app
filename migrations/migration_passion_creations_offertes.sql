-- ══════════════════════════════════════════════════════════════════════════
-- CRÉER UNE PASSION : TROIS OFFERTES, ENSUITE C'EST PAYANT  (2026-09-08, soir)
--
-- « Il faut limiter la création de passion à 3, ensuite c'est payant. »
-- — Benjamin, le jour même de la mise en ligne du lot creation_passion_v1.
--
-- Le premier jet plafonnait le RYTHME (5 par 24 h) et le VOLUME (30 par
-- compte) : deux garde-fous anti-abus, pas une règle produit. La règle produit
-- est celle du reste de l'application — `PASSIONS_OFFERTES = 3` (app-06) : on
-- reçoit trois passions, au-delà on passe par `openPassionPaywall()`. Créer une
-- passion EST une acquisition ; elle doit compter comme telle.
--
-- ⚠️ TROIS CRÉATIONS PAR COMPTE, À VIE, ET C'EST DIFFÉRENT DE « TROIS PASSIONS
-- VIVANTES ». Archiver une passion créée ne rend PAS un droit de création :
-- sans quoi il suffirait d'archiver pour repartir de zéro, exactement la porte
-- dérobée que le quota de changements a dû fermer le 2026-09-02. Le compteur
-- est `count(*) where created_by = auth.uid()`, sans condition de statut.
--
-- ⚠️ AUCUN MONTANT N'EST ÉCRIT ICI, ni nulle part (ADR-009) : le serveur dit
-- `quota_creation`, le client ouvre le paywall, et le paywall n'affiche aucun
-- prix tant que le paiement n'existe pas. Le jour où il existera, c'est ce
-- plafond-là qu'un droit acheté relèvera — d'où un seul nombre, ici.
--
-- IDEMPOTENTE (`create or replace`). Vérifiée par
-- `scripts/verifier-migration-creation-passion.sh` (exécutée en CI).
--
-- Retour arrière : réappliquer `migrations/migration_creation_passion_utilisateur.sql`.
-- ══════════════════════════════════════════════════════════════════════════

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
  v_total  int;
  -- Le MÊME nombre que `PASSIONS_OFFERTES` (app-06). Les deux plafonds sont
  -- distincts — celui-ci compte les CRÉATIONS, l'autre les passions VIVANTES —
  -- mais ils racontent la même promesse, et un jour la même offre payante.
  c_offertes constant int := 3;
begin
  if v_uid is null then
    raise exception 'auth_requise' using errcode = '42501';
  end if;

  v_brut  := left(v_brut, 60);
  v_norme := btrim(regexp_replace(public.unaccent_immutable(v_brut), '[^a-z0-9]+', ' ', 'g'));

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

  -- ⚠️ LE DÉDOUBLONNAGE PASSE AVANT LE PLAFOND, ET C'EST VOULU. Rendre une
  -- passion qui existe déjà ne CRÉE rien : la refuser au motif du quota ferait
  -- payer un compte pour un nom que le référentiel connaissait déjà.
  select * into v_exist from public.passions p
   where p.normalized_label = v_norme
      or exists (select 1 from unnest(p.aliases) a
                  where btrim(regexp_replace(public.unaccent_immutable(a), '[^a-z0-9]+', ' ', 'g')) = v_norme)
   order by (p.status = 'active') desc, p.popularity desc
   limit 1;

  if found then
    if v_exist.status <> 'active' then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
    return query select v_exist.id, v_exist.label, v_exist.emoji, v_exist.color, false;
    return;
  end if;

  -- ── TROIS CRÉATIONS OFFERTES, ENSUITE LE PAYWALL ────────────────────────
  -- Sans condition de statut : archiver ne rend pas un droit de création.
  select count(*) into v_total from public.passions where created_by = v_uid;
  if v_total >= c_offertes then
    raise exception 'quota_creation' using errcode = '53400';
  end if;

  v_slug  := replace(v_norme, ' ', '-');
  v_essai := v_slug;
  while exists (select 1 from public.passions p where p.id = v_essai) loop
    v_i := v_i + 1;
    v_essai := v_slug || '-' || v_i::text;
    if v_i > 50 then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
  end loop;

  v_emoji := btrim(coalesce(p_emoji, ''));
  if v_emoji = '' or char_length(v_emoji) > 4 or v_emoji ~ '[a-zA-Z0-9<>&"''/\\]' then
    v_emoji := '✨';
  end if;

  insert into public.passions
    (id, label, emoji, color, sort_order, normalized_label, aliases,
     status, source, is_broad, popularity, created_by)
  values
    (v_essai,
     upper(left(v_brut, 1)) || substr(v_brut, 2),
     v_emoji, '#7c3aed', 5000, v_norme, '{}',
     'active', 'user_suggested', false, 0, v_uid);

  update public.passion_requests r
     set status = 'approved'
   where r.normalized_label = v_norme and r.status = 'pending';

  return query
    select p.id, p.label, p.emoji, p.color, true
      from public.passions p where p.id = v_essai;
end $$;

-- ⚠️ À REFAIRE À CHAQUE `create or replace` : les privilèges par défaut du
-- projet Supabase réaccordent EXECUTE à `anon` et `authenticated` sur toute
-- fonction créée dans `public`, par des grants NOMINATIFS qu'un
-- `revoke ... from public` ne retire pas (mesuré en production le 2026-09-08).
revoke all on function public.creer_passion(text, text) from public;
revoke all on function public.creer_passion(text, text) from anon;
grant execute on function public.creer_passion(text, text) to authenticated;

comment on function public.creer_passion(text, text) is
  'Crée une passion du référentiel au nom de auth.uid(). Seul point d''écriture client sur public.passions (RLS : lecture seule). Dédoublonne (libellé + alias), plafonne à 3 CRÉATIONS par compte (quota_creation → paywall), dérive l''identifiant.';
