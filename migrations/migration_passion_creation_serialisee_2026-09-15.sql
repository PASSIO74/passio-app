-- ═════════════════════════════════════════════════
-- CRÉATION DE PASSION : le plafond est SÉRIALISÉ par compte (ASTRA-04, P2)
--
-- Constat de la contre-revue : `creer_passion` compte les créations du compte
-- puis insère, sans verrou — deux appels simultanés (double tap, deux
-- onglets) lisaient tous deux « 2 créations sur 3 » et créaient tous deux :
-- quatre passions pour un droit de trois. Ce fichier reprend la fonction de
-- PRODUCTION à l'identique (source : `pg_get_functiondef`, 2026-09-15) et y
-- ajoute UNE ligne, avant la lecture du compteur :
--   perform pg_advisory_xact_lock(hashtext('creer_passion:' || v_uid::text));
-- Un verrou consultatif transactionnel par compte : la seconde création
-- attend la première, relit le compteur, et le plafond tient. Rien d'autre ne
-- change (dédoublonnage, alias, grants, signature à deux arguments qui délègue).
-- Rejouable. Retour arrière : rejouer migration_passion_alias_creation.sql.
-- ═════════════════════════════════════════════════
begin;

CREATE OR REPLACE FUNCTION public.creer_passion(p_label text, p_emoji text, p_aliases text[])
 RETURNS TABLE(id text, label text, emoji text, color text, cree boolean, aliases text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- ⚠️ ASTRA-04 (2026-09-15) : le plafond se lisait puis s'insérait SANS
  -- sérialisation — deux créations simultanées du même compte lisaient toutes
  -- deux « 2 sur 3 » et passaient toutes deux. Un verrou consultatif par compte,
  -- tenu jusqu'à la fin de la transaction, met la seconde en attente derrière
  -- la première : elle relit alors « 3 sur 3 » et est refusée. Le verrou est
  -- par COMPTE (hashtext de l'uid) : deux comptes différents ne s'attendent pas.
  perform pg_advisory_xact_lock(hashtext('creer_passion:' || v_uid::text));
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
end $function$;

-- ═══ VERDICT ═══
select 'creer_passion sérialise par compte' as controle,
       case when pg_get_functiondef('public.creer_passion(text,text,text[])'::regprocedure) like '%pg_advisory_xact_lock(hashtext(''creer_passion:''%' then 'OK' else 'ECHEC' end as etat
union all
select 'la signature à deux arguments délègue toujours',
       case when pg_get_functiondef('public.creer_passion(text,text)'::regprocedure) like '%creer_passion(%' then 'OK' else 'ECHEC' end
union all
select 'anon sans EXECUTE (les deux signatures)',
       case when not has_function_privilege('anon', 'public.creer_passion(text,text,text[])', 'EXECUTE')
             and not has_function_privilege('anon', 'public.creer_passion(text,text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 'authenticated garde EXECUTE',
       case when has_function_privilege('authenticated', 'public.creer_passion(text,text,text[])', 'EXECUTE') then 'OK' else 'ECHEC' end;

commit;
