-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- AUDIT UX/UI DU 2026-11-10 — CRE-C16 / FIL-C24 : CORRIGER LE TEXTE D'UNE PUBLICATION
-- Décision de Benjamin du 2026-11-13 : « 1 : a » — modifier le TEXTE seul, mention « modifié ».
--
-- Une transaction, REJOUABLE, tableau de verdict en fin. Aucun prérequis client : la colonne neuve
-- est nulle par défaut, le client qui ne connaît pas encore le geste n'est pas gêné, et le geste
-- tolère une base pas encore migrée (refus dit, rien de perdu).
--
-- LE DÉFAUT : une coquille obligeait à supprimer puis republier — j'aime et discussion perdus. Un
-- commentaire, lui, se modifie. `posts` n'a AUCUNE policy UPDATE : `authenticated` tient UPDATE de
-- table, qui ne sert à rien.
--
-- CE QUI CHANGE :
--   ① `posts.edited_at` (timestamptz, nul par défaut) : posé par le SERVEUR quand le texte change.
--   ② L'auteur peut modifier le TEXTE (`content`) de SA publication, et rien d'autre : le droit
--      UPDATE de table est retiré à `authenticated` et `anon`, puis rendu sur la seule colonne
--      `content` ; policy UPDATE « auteur seulement ». Passion, média, type, date, compteur, auteur
--      restent hors d'atteinte (`author_id` est déjà figé par `trg_posts_freeze_author`).
--   ③ `edited_at` n'est écrit que par un trigger (le client n'a pas le droit de colonne) : la
--      mention « modifié » ne se forge pas, et ne s'efface pas.
--   Bornes inchangées : `posts_content_borne` (20 000), `aa_ligne_bornee`, `ab_debit_octets`,
--   `zz_barriere_suppression` valent aussi pour l'UPDATE.
--
-- RÉSIDU ASSUMÉ : le texte d'avant n'est pas conservé (comme pour un commentaire modifié). Une
-- publication masquée après signalements le reste (le masquage porte sur l'identifiant). La table
-- n'est pas publiée en temps réel : les autres lecteurs voient la correction à leur prochaine
-- lecture du fil.
--
-- RETOUR ARRIÈRE (éditeur SQL) :
--| begin;
--| drop trigger if exists ac_posts_edited_at on public.posts;
--| drop function if exists public.posts_marquer_modifie();
--| drop policy if exists posts_modifier_texte_auteur on public.posts;
--| revoke update (content) on public.posts from authenticated;
--| grant update on public.posts to authenticated;
--| alter table public.posts drop column if exists edited_at;
--| commit;
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── ① La colonne ─────────────────────────────────────────────────────────────────────────────────
alter table public.posts add column if not exists edited_at timestamptz;

-- ── ③ Posée par le serveur, quand le texte change ────────────────────────────────────────────────
create or replace function public.posts_marquer_modifie() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if new.content is distinct from old.content then
    new.edited_at := pg_catalog.now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $fn$;
revoke all on function public.posts_marquer_modifie() from public, anon, authenticated;
drop trigger if exists ac_posts_edited_at on public.posts;
create trigger ac_posts_edited_at before update on public.posts
  for each row execute function public.posts_marquer_modifie();

-- ── ② Qui peut écrire quoi ───────────────────────────────────────────────────────────────────────
-- ⚠️ `authenticated` tient UPDATE sur la TABLE : on retire le droit de table, puis on rend la seule
-- colonne `content`.
revoke update on public.posts from authenticated, anon;
grant update (content) on public.posts to authenticated;

drop policy if exists posts_modifier_texte_auteur on public.posts;
create policy posts_modifier_texte_auteur on public.posts
  for update to authenticated
  using (author_id = (select auth.uid())::text)
  with check (author_id = (select auth.uid())::text);

-- ── TABLEAU DE VERDICT ───────────────────────────────────────────────────────────────────────────
select 'colonne edited_at : timestamptz, nulle par défaut' as controle,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'posts' and column_name = 'edited_at'
                            and data_type = 'timestamp with time zone' and is_nullable = 'YES' and column_default is null)
            then 'OK' else 'ECHEC' end as valeur
union all select 'un compte n''écrit que le texte',
       case when has_column_privilege('authenticated', 'public.posts', 'content', 'update')
             and not has_column_privilege('authenticated', 'public.posts', 'edited_at', 'update')
             and not has_column_privilege('authenticated', 'public.posts', 'passion_id', 'update')
             and not has_column_privilege('authenticated', 'public.posts', 'media_url', 'update')
             and not has_column_privilege('authenticated', 'public.posts', 'author_id', 'update')
             and not has_column_privilege('authenticated', 'public.posts', 'likes', 'update')
             and not has_table_privilege('anon', 'public.posts', 'update') then 'OK' else 'ECHEC' end
union all select 'policy UPDATE : l''auteur seulement',
       case when exists (select 1 from pg_policies where tablename = 'posts' and policyname = 'posts_modifier_texte_auteur'
                          and cmd = 'UPDATE' and qual like '%author_id = (( SELECT auth.uid() AS uid))::text%'
                          and with_check like '%author_id = (( SELECT auth.uid() AS uid))::text%') then 'OK' else 'ECHEC' end
union all select 'edited_at posé par le serveur (trigger actif)',
       case when exists (select 1 from pg_trigger where tgname = 'ac_posts_edited_at' and tgrelid = 'public.posts'::regclass and tgenabled = 'O')
            then 'OK' else 'ECHEC' end
union all select 'lecture, insertion et suppression inchangées',
       case when has_table_privilege('authenticated', 'public.posts', 'select')
             and has_table_privilege('authenticated', 'public.posts', 'insert')
             and has_table_privilege('authenticated', 'public.posts', 'delete') then 'OK' else 'ECHEC' end;

commit;
