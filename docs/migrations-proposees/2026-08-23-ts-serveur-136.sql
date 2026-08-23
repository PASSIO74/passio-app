-- ═══════════════════════════════════════════════════════════════════════════
-- #136 — T&S SERVEUR : âge fiable + blocage bidirectionnel + conversation
--        non forçable.
--
-- ⚠️⚠️  CE FICHIER N'EST PAS UNE MIGRATION APPLIQUÉE, ET N'EST PAS DANS
--       `migrations/`.  ⚠️⚠️
--
-- L'agent d'implémentation distant (workflow `.github/workflows/claude-code.yml`)
-- a INTERDICTION d'écrire dans `migrations/` : la marche « Chemins interdits »
-- refuse de publier toute branche qui y touche, précisément parce que ces
-- fichiers « se changent à la main, avec contre-revue ». Le lot #136 est
-- pourtant, par nature, un lot de migration/RLS.
--
-- Ce fichier est donc une PROPOSITION relue, inerte tant qu'un humain ne l'a
-- pas :
--   ① relue avec un second modèle / une contre-revue (exigée par la spéc) ;
--   ② déplacée à la main dans `migrations/migration_ts_serveur_136.sql` ;
--   ③ exécutée dans le SQL Editor Supabase (comme toutes les migrations du
--      dépôt — rien ici n'est appliqué automatiquement) ;
--   ④ reportée dans `migrations/SCHEMA_PROD_REFERENCE.sql` (que l'agent ne peut
--      pas non plus modifier — le gate `migration-checker` prod↔repo restera
--      donc en écart tant que ce report n'est pas fait à la main).
--
-- Tant que ce SQL n'est pas exécuté, le code client livré avec lui reste dans
-- son comportement d'aujourd'hui : les RPC sont absentes, le client le détecte
-- (PGRST202) et retombe sur le chemin existant pour la messagerie, tandis que
-- les décisions IRL sensibles restent REFUSÉES (fail-closed). Aucune régression,
-- aucune permission nouvelle.
--
-- Ordre de déploiement recommandé : SQL d'abord, code client ensuite. L'inverse
-- fonctionne aussi (le client tolère l'absence des RPC), mais la fenêtre où la
-- conversation reste forçable dure alors plus longtemps.
--
-- Idempotent : ré-exécutable sans effet de bord. Aucune suppression de donnée.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- A. ÂGE / MINORITÉ SERVEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DÉCISION 1 — la donnée d'âge n'entre PAS dans `profiles`. `profiles` est la
-- surface de publication (lecture large : pseudo, photo, bio) ; y ajouter une
-- donnée d'âge, même dérivée, l'exposerait par construction. Table privée
-- dédiée, sans AUCUNE policy : personne ne lit `account_safety` en direct, ni
-- la sienne ni celle d'un autre. Seules les fonctions SECURITY DEFINER
-- ci-dessous y touchent, et elles ne renvoient jamais qu'un booléen de
-- décision.
--
-- DÉCISION 2 — on stocke le DÉRIVÉ (`is_minor`), pas la date ni l'année de
-- naissance. C'est la donnée minimale qui permet d'appliquer les règles T&S.
-- Ce que le champ vaut, écrit ici pour qu'aucune PR ne puisse prétendre le
-- contraire : c'est une DÉCLARATION rendue autoritaire et persistante côté
-- serveur — PASSIO empêche le contournement par effacement du `localStorage`
-- et applique la règle côté base. Ce n'est **pas** une vérification d'identité
-- ni d'âge réel : PASSIO ne dispose d'aucun mécanisme externe de vérification
-- et ne doit jamais l'affirmer.
--
-- DÉCISION 3 — les comptes existants ne sont PAS inventés. Aucune ligne n'est
-- créée pour eux : leur état est « inconnu », et « inconnu » vaut REFUS pour
-- les fonctions IRL sensibles (cf. `irl_interaction_allowed`). On ne devine
-- l'âge de personne.

create table if not exists public.account_safety (
  user_id      text primary key,
  is_minor     boolean     not null,
  source       text        not null default 'self_declared',
  declared_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.account_safety is
  'T&S #136 — minorité DÉCLARÉE (dérivé booléen), rendue autoritaire côté serveur. '
  'Aucune policy RLS : table inaccessible en direct, uniquement via les fonctions '
  'SECURITY DEFINER declare_account_minority / irl_interaction_allowed. '
  'Déclaration, PAS une vérification d''âge légale.';

alter table public.account_safety enable row level security;

-- Aucune policy n'est créée : RLS activée + zéro policy = aucun SELECT, INSERT,
-- UPDATE ni DELETE possible pour `anon` et `authenticated`. La révocation des
-- privilèges de table est une seconde barrière (Supabase accorde par défaut les
-- privilèges de table à ces deux rôles) : si une policy était ajoutée par
-- mégarde un jour, elle ne suffirait pas à ouvrir la table.
revoke all on table public.account_safety from anon, authenticated;


-- ── Déclaration de minorité — écriture BORNÉE, jamais un UPDATE libre ───────
--
-- Règle explicite, pensée contre le contournement par bascule répétée :
--   · aucune ligne          → la déclaration est enregistrée ;
--   · ligne `true`  → `false` → REFUSÉE en silence (on ne perd jamais une
--                              restriction ; sortir de la minorité passe par le
--                              support, pas par un aller-retour d'onboarding) ;
--   · ligne `false` → `true`  → ACCEPTÉE (toujours accepter le plus restrictif) ;
--   · valeur identique       → no-op.
-- La fonction renvoie l'état EFFECTIVEMENT retenu : le client ne peut donc pas
-- croire qu'il a changé quelque chose qui n'a pas changé.
create or replace function public.declare_account_minority(_is_minor boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid     text := (select auth.uid())::text;
  _courant boolean;
begin
  if _uid is null or _uid = '' then
    raise exception 'PASSIO_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if _is_minor is null then
    raise exception 'PASSIO_INVALID_DECLARATION' using errcode = '22023';
  end if;

  select s.is_minor into _courant
    from public.account_safety s
   where s.user_id = _uid;

  if _courant is null then
    insert into public.account_safety (user_id, is_minor)
         values (_uid, _is_minor)
    on conflict (user_id) do nothing;   -- course entre deux onglets : la 1re gagne
    select s.is_minor into _courant from public.account_safety s where s.user_id = _uid;
    return _courant;
  end if;

  -- Seul le durcissement est accepté.
  if _courant = false and _is_minor = true then
    update public.account_safety
       set is_minor = true, updated_at = now()
     where user_id = _uid;
    return true;
  end if;

  return _courant;
end;
$$;

revoke execute on function public.declare_account_minority(boolean) from public, anon;
grant  execute on function public.declare_account_minority(boolean) to authenticated;


-- ── Mon propre état, pour l'UI seulement ───────────────────────────────────
-- Renvoie NULL si aucune déclaration n'existe (« inconnu »), jamais `false` :
-- confondre « majeur » et « on ne sait pas » est exactement le défaut que ce
-- lot ferme. Ne lit QUE la ligne de l'appelant.
create or replace function public.my_account_minority()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select s.is_minor
    from public.account_safety s
   where s.user_id = (select auth.uid())::text;
$$;

revoke execute on function public.my_account_minority() from public, anon;
grant  execute on function public.my_account_minority() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- B. BLOCAGE BIDIRECTIONNEL SERVEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `blocks` reste en `blocks_select_own` : la table brute n'est PAS exposée à
-- l'autre partie, et rien ici ne l'ouvre. La fonction ne renvoie qu'un booléen
-- et ne dit JAMAIS qui a bloqué qui — c'est tout l'intérêt.
--
-- ⚠️ L'appelant doit être l'une des deux parties. Sans cette borne, la fonction
-- deviendrait un oracle : n'importe quel compte pourrait cartographier les
-- blocages entre deux tiers. Elle est appelée depuis les policies avec
-- `auth.uid()` en premier argument, donc la borne ne gêne aucun usage légitime.
create or replace function public.is_blocked_between(_a text, _b text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  _uid text := (select auth.uid())::text;
begin
  if _a is null or _b is null or _a = '' or _b = '' then
    return true;                       -- entrée inexploitable → fail-closed
  end if;
  if _uid is null or _uid not in (_a, _b) then
    raise exception 'PASSIO_NOT_A_PARTY' using errcode = '42501';
  end if;
  if _a = _b then
    return false;                      -- on ne se bloque pas soi-même
  end if;
  return exists (
    select 1 from public.blocks b
     where (b.blocker_id = _a and b.blocked_id = _b)
        or (b.blocker_id = _b and b.blocked_id = _a)
  );
end;
$$;

revoke execute on function public.is_blocked_between(text, text) from public, anon;
grant  execute on function public.is_blocked_between(text, text) to authenticated;


-- ── Décision d'éligibilité IRL, sans jamais exposer l'âge ───────────────────
--
-- FAIL-CLOSED intégral. Renvoie `true` uniquement si TOUT est établi :
--   · l'appelant est authentifié et vise quelqu'un d'autre ;
--   · aucun blocage dans l'un ou l'autre sens ;
--   · les DEUX comptes ont une déclaration de minorité connue ;
--   · aucun des deux n'est mineur.
-- Un état inconnu, une cible inexistante, une erreur → `false`. Le motif n'est
-- jamais renvoyé : un motif est un canal d'inférence (« pourquoi ce refus ? »
-- répondrait « parce que l'autre est mineur », ou « parce qu'il m'a bloqué »).
create or replace function public.irl_interaction_allowed(_other_user_id text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  _uid        text := (select auth.uid())::text;
  _moi_mineur boolean;
  _lui_mineur boolean;
begin
  if _uid is null or _uid = '' then return false; end if;
  if _other_user_id is null or _other_user_id = '' then return false; end if;
  if _other_user_id = _uid then return false; end if;

  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = _uid and b.blocked_id = _other_user_id)
        or (b.blocker_id = _other_user_id and b.blocked_id = _uid)
  ) then
    return false;
  end if;

  select s.is_minor into _moi_mineur from public.account_safety s where s.user_id = _uid;
  select s.is_minor into _lui_mineur from public.account_safety s where s.user_id = _other_user_id;

  -- « inconnu » (NULL) vaut refus : on n'invente l'âge de personne.
  if _moi_mineur is null or _lui_mineur is null then return false; end if;
  if _moi_mineur or _lui_mineur then return false; end if;

  return true;
end;
$$;

revoke execute on function public.irl_interaction_allowed(text) from public, anon;
grant  execute on function public.irl_interaction_allowed(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- C. CONVERSATION NON FORÇABLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- État constaté avant ce lot (SCHEMA_PROD_REFERENCE.sql) :
--   · `conversations` porte DEUX policies INSERT permissives, toutes deux
--     `check: true` — `created_by` n'était même pas contraint ;
--   · `conv_members` INSERT « Ecriture propre » laisse le créateur d'une
--     conversation insérer N'IMPORTE QUEL `user_id`.
-- Conséquence : n'importe quel compte authentifié ouvrait un DM avec n'importe
-- qui, y compris avec quelqu'un qui l'avait bloqué.
--
-- ⚠️ Les policies permissives se combinent en OR : ajouter une policy stricte
-- À CÔTÉ des permissives ne fermerait RIEN. On REMPLACE donc les policies
-- existantes, on n'en ajoute pas une de plus.

-- ── C.1 `conversations` : le créateur déclaré doit être l'appelant ──────────
drop policy if exists "Ecriture propre"      on public.conversations;
drop policy if exists "Insert conversations" on public.conversations;
create policy "conversations_insert_own" on public.conversations
  for insert with check (created_by = (select auth.uid())::text);
-- Aucun impact sur le code existant : supaCreateConversation, supaCreateGroup et
-- supaCreateEventConversation posent déjà `created_by: MY_UID`.

-- ── C.2 `conv_members` : le point d'ouverture réel, durci EN PLACE ──────────
-- On garde la structure de `migration_fix_conv_members_insert.sql` (s'ajouter
-- soi-même, ou être le créateur de la conversation) et on lui impose l'absence
-- de blocage bidirectionnel. `is_blocked_between` est SECURITY DEFINER : elle
-- lit `blocks` sans buter sur `blocks_select_own`, et sans révéler la direction.
drop policy if exists "Ecriture propre"             on public.conv_members;
drop policy if exists "conv_members_insert_guarded" on public.conv_members;
create policy "conv_members_insert_guarded" on public.conv_members
  for insert with check (
    (
      user_id = (select auth.uid())::text
      or exists (
        select 1 from public.conversations c
         where c.id = conv_members.conv_id
           and c.created_by = (select auth.uid())::text
      )
    )
    and not public.is_blocked_between((select auth.uid())::text, conv_members.user_id)
  );
-- Frontière assumée : cette clause vaut aussi pour les GROUPES (le créateur ne
-- peut plus y ajouter quelqu'un qui l'a bloqué). Ce n'est pas une régression du
-- comportement légitime — seul le cas bloqué change — mais c'est un effet à
-- vérifier en revue. Rejoindre un groupe SOI-MÊME reste toujours possible :
-- `is_blocked_between(uid, uid)` renvoie `false`.

-- ── C.3 Création atomique (chemin préféré du client) ────────────────────────
-- Supprime la fenêtre `INSERT conversation` → `INSERT conv_members` et les
-- conversations orphelines qu'elle laissait derrière elle en cas d'échec
-- partiel. Réutilise une conversation directe existante plutôt que d'en
-- empiler une nouvelle.
-- Périmètre : DM 1-à-1 uniquement. Les groupes restent sur le chemin
-- policy-only (C.2), volontairement : les couvrir ici doublerait le lot.
create or replace function public.create_direct_conversation(_with_user_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid      text := (select auth.uid())::text;
  _existant text;
  _conv_id  text;
begin
  if _uid is null or _uid = '' then
    raise exception 'PASSIO_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if _with_user_id is null or _with_user_id = '' or _with_user_id = _uid then
    raise exception 'PASSIO_INVALID_TARGET' using errcode = '22023';
  end if;

  -- La garde. Même message dans les deux sens : le refus ne dit pas qui a bloqué.
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = _uid and b.blocked_id = _with_user_id)
        or (b.blocker_id = _with_user_id and b.blocked_id = _uid)
  ) then
    raise exception 'PASSIO_BLOCKED' using errcode = '42501';
  end if;

  select c.id into _existant
    from public.conversations c
    join public.conv_members m1 on m1.conv_id = c.id and m1.user_id = _uid
    join public.conv_members m2 on m2.conv_id = c.id and m2.user_id = _with_user_id
   where c.is_group is not true
   order by c.created_at
   limit 1;
  if _existant is not null then
    return _existant;
  end if;

  -- `md5(random() || clock_timestamp())` plutôt que `gen_random_uuid()` : avec
  -- `search_path = ''`, l'extension pgcrypto vit dans le schéma `extensions` et
  -- devrait être qualifiée ; `md5`/`random` sont dans `pg_catalog`, toujours
  -- résolu. Même forme d'identifiant que le client (`conv_` + suffixe).
  _conv_id := 'conv_' || md5(random()::text || clock_timestamp()::text);

  insert into public.conversations (id, is_group, passion_id, created_by)
       values (_conv_id, false, null, _uid);
  insert into public.conv_members (conv_id, user_id)
       values (_conv_id, _uid), (_conv_id, _with_user_id);

  return _conv_id;
end;
$$;

revoke execute on function public.create_direct_conversation(text) from public, anon;
grant  execute on function public.create_direct_conversation(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS (à exécuter APRÈS, et à coller dans la PR)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) `account_safety` : RLS active, ZÉRO policy, aucun privilège de table.
--    select relrowsecurity from pg_class where relname = 'account_safety';        -- t
--    select count(*) from pg_policies where tablename = 'account_safety';         -- 0
--    select count(*) from information_schema.role_table_grants
--      where table_name = 'account_safety' and grantee in ('anon','authenticated'); -- 0
--
-- 2) Une SEULE policy INSERT sur chaque table (pas de permissive résiduelle) :
--    select policyname, cmd, with_check from pg_policies
--     where tablename in ('conversations','conv_members') and cmd = 'INSERT';
--    → attendu : conversations_insert_own, conv_members_insert_guarded. Rien d'autre.
--
-- 3) `blocks` intact :
--    select policyname, cmd, qual from pg_policies where tablename = 'blocks';
--    → blocks_select_own / blocks_insert_own / blocks_delete_own inchangées.
--
-- 4) Les cinq fonctions sont SECURITY DEFINER avec search_path verrouillé :
--    select p.proname, p.prosecdef, p.proconfig
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('is_blocked_between','irl_interaction_allowed',
--                         'declare_account_minority','my_account_minority',
--                         'create_direct_conversation');
--    → prosecdef = t et proconfig = {"search_path="} pour les cinq.
--
-- 5) `anon` n'exécute rien :
--    select has_function_privilege('anon','public.create_direct_conversation(text)','execute'); -- f
--
-- 6) Test adversarial (exigé par la spéc) : rejouer C.2 en retirant la clause
--    `and not public.is_blocked_between(...)`. Le test « B bloque A → A ne peut
--    pas forcer une conversation » DOIT redevenir vert côté attaquant, donc
--    rouge côté suite. S'il reste rouge dans les deux cas, le test ne prouve
--    rien — c'est la garde qui doit le faire échouer, pas un hasard de fixture.


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (explicite, sans perte de données)
-- ═══════════════════════════════════════════════════════════════════════════
-- Revenir en arrière = restaurer les policies telles qu'elles étaient, et
-- retirer les fonctions. `account_safety` est CONSERVÉE (aucune suppression de
-- donnée) : inaccessible sans ses fonctions, elle est inerte.
--
--   drop policy if exists "conv_members_insert_guarded" on public.conv_members;
--   create policy "Ecriture propre" on public.conv_members for insert with check (
--     user_id = auth.uid()::text
--     OR EXISTS (SELECT 1 FROM public.conversations c
--                 WHERE c.id = conv_members.conv_id AND c.created_by = auth.uid()::text)
--   );
--   drop policy if exists "conversations_insert_own" on public.conversations;
--   create policy "Ecriture propre" on public.conversations for insert with check (true);
--   -- (l'état d'origine portait DEUX policies `check true` ; une seule suffit
--   --  à restaurer le comportement, la seconde était un doublon historique)
--
--   drop function if exists public.create_direct_conversation(text);
--   drop function if exists public.irl_interaction_allowed(text);
--   drop function if exists public.declare_account_minority(boolean);
--   drop function if exists public.my_account_minority();
--   drop function if exists public.is_blocked_between(text, text);
--
-- ⚠️ Retirer `is_blocked_between` AVANT la policy C.2 casserait tout INSERT sur
-- `conv_members` (la policy référencerait une fonction absente) : la messagerie
-- tomberait. Suivre l'ordre ci-dessus — policies d'abord, fonctions ensuite.
