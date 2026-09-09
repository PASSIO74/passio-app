-- ══════════════════════════════════════════════════════════════════════════
-- MODÉRATION DES PASSIONS CRÉÉES, ET QUOTA PAR COMPTE  (2026-09-09)
--
-- Deux manques, comblés ensemble parce qu'ils touchent la même fonction :
--
-- ① MODÉRATION. Depuis le 2026-09-08, n'importe quel compte peut écrire un nom
--    dans le référentiel COMMUN. Rien ne permettait de le signaler, ni de le
--    retirer autrement qu'à la main dans le SQL Editor.
--    ⚠️ AUCUNE TABLE NOUVELLE : `public.reports` existe et porte déjà
--    `target_type` / `target_id`. Le signalement d'une passion est un
--    `target_type = 'passion'`, et il passe par `supaReport` (app-08), le
--    moteur qui sert déjà aux comptes et aux publications. Deux files de
--    signalement auraient divergé au premier correctif.
--
-- ② QUOTA PAR COMPTE. « Sur mon compte j'ai l'option passions illimitées,
--    intègre aussi la création de passions, c'est pour mes tests. »
--    ⚠️ UN DRAPEAU CLIENT NE PEUT PAS LEVER UN PLAFOND SERVEUR, et c'est le
--    point : `passio_passions_illimitees_v1` (localStorage) ouvre les gardes
--    de l'écran, mais `creer_passion` refusera toujours la 4ᵉ création — le
--    plafond est tenu là où il doit l'être. Il faut donc un droit CÔTÉ BASE,
--    porté par une table, et c'est aussi la brique du futur paiement : le jour
--    où une formule payante existera, elle écrira une ligne ici.
--
-- IDEMPOTENTE. Vérifiée par `scripts/verifier-migration-creation-passion.sh`.
--
-- Retour arrière :
--   drop table if exists public.passion_quotas;
--   -- puis réappliquer migrations/migration_passion_creations_offertes.sql
-- ══════════════════════════════════════════════════════════════════════════

-- ── ① Anti-doublon de signalement, BORNÉ AUX PASSIONS ─────────────────────
-- ⚠️ L'index est PARTIEL, et ce n'est pas un détail : un index unique sur les
-- trois colonnes toutes cibles confondues changerait le comportement du
-- signalement de COMPTE et de PUBLICATION, qui tolèrent aujourd'hui plusieurs
-- envois. On ne modifie que ce que ce lot introduit.
create unique index if not exists reports_passion_unique_par_personne
  on public.reports (reporter_id, target_id)
  where target_type = 'passion';

-- Revue : retrouver les signalements d'une passion sans balayer la table.
create index if not exists reports_passion_idx
  on public.reports (target_id, created_at desc)
  where target_type = 'passion';

-- ── ② Le droit de créer, par compte ───────────────────────────────────────
-- `creations_max` : NULL = ILLIMITÉ, un entier = ce plafond-là.
-- Aucune ligne = le défaut du produit (3).
create table if not exists public.passion_quotas (
  user_id       uuid primary key,
  creations_max int,
  note          text,
  created_at    timestamptz not null default now()
);

alter table public.passion_quotas enable row level security;

-- Chacun peut LIRE son propre droit (pour que l'écran puisse le dire un jour).
-- Personne ne peut l'écrire : ni INSERT, ni UPDATE, ni DELETE — pas de policy,
-- donc pas de droit. Seul le `service_role` (canal ② d'ADR-012) l'accorde.
drop policy if exists passion_quotas_select_own on public.passion_quotas;
create policy passion_quotas_select_own on public.passion_quotas
  for select using (user_id = auth.uid());

comment on table public.passion_quotas is
  'Droit de création de passions par compte. creations_max NULL = illimité ; aucune ligne = défaut produit (3). Écriture réservée au service_role.';

-- ── ③ La fonction lit le droit du compte ──────────────────────────────────
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
  v_max    int;
  v_a_droit boolean := false;
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

  -- Le dédoublonnage passe AVANT le plafond : une passion qui existe déjà ne
  -- crée rien, donc elle ne consomme rien et reste accessible au plafond.
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

  -- ── Le droit de ce compte ───────────────────────────────────────────────
  -- ⚠️ « PAS DE LIGNE » ET « LIGNE À NULL » SONT DEUX ÉTATS DIFFÉRENTS, et les
  -- confondre donnerait l'illimité à tout le monde : `found` tranche, jamais
  -- un `coalesce` sur la valeur.
  select q.creations_max into v_max from public.passion_quotas q where q.user_id = v_uid;
  v_a_droit := found;

  if not (v_a_droit and v_max is null) then
    select count(*) into v_total from public.passions where created_by = v_uid;
    if v_total >= coalesce(case when v_a_droit then v_max end, c_offertes) then
      raise exception 'quota_creation' using errcode = '53400';
    end if;
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
-- projet réaccordent EXECUTE à `anon` par un grant NOMINATIF (mesuré en
-- production le 2026-09-08), qu'un `revoke ... from public` ne retire pas.
revoke all on function public.creer_passion(text, text) from public;
revoke all on function public.creer_passion(text, text) from anon;
grant execute on function public.creer_passion(text, text) to authenticated;

comment on function public.creer_passion(text, text) is
  'Crée une passion du référentiel au nom de auth.uid(). Seul point d''écriture client sur public.passions. Dédoublonne (libellé + alias), plafonne à 3 créations par compte — ou au droit inscrit dans public.passion_quotas (NULL = illimité).';
