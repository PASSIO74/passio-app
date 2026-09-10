-- DEUX FUITES MESURÉES EN PRODUCTION LE 2026-09-10, AVANT L'OUVERTURE AUX TESTEURS
--
-- Trouvées par l'audit go/no-go de commercialisation. Les deux sont vérifiées
-- sur la base RÉELLE, pas déduites du dépôt.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A. `conv_reads` EST LISIBLE PAR N'IMPORTE QUI, SANS COMPTE
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré : policy « reads_select », rôle {public}, `qual = true`, plus le GRANT
-- SELECT à `anon`. La clé anon est dans le JavaScript livré : un simple appel
-- REST rend TOUTE la table — `conv_id`, `user_id`, `last_read_at`.
--
-- Deux `user_id` sur un même `conv_id`, c'est : ces deux personnes ont une
-- conversation privée, et voici quand elles l'ont lue pour la dernière fois.
-- Croisé avec `profiles` (lecture publique assumée), ce ne sont plus des uuid
-- mais des PSEUDOS. Contenu mesuré au moment du constat : 37 lignes,
-- 24 `user_id` distincts, 21 `conv_id` distincts.
--
-- ⚠️ LE CONTENU DES MESSAGES, LUI, EST BIEN PROTÉGÉ (`conv_messages`,
-- `conv_members` et `conversations` passent par `is_conv_member`). Ce qui fuit
-- est le GRAPHE SOCIAL : qui parle à qui, et quand. Dans une application qui
-- fait se rencontrer des inconnus, c'est souvent l'information la plus sensible
-- de la messagerie — plus que le texte lui-même.
--
-- Aucun prédicat nouveau n'est inventé : on pose celui qui gouverne déjà les
-- trois autres tables de la messagerie. Le client lit `conv_reads` en tant que
-- MEMBRE (recalcul du compteur non lu, `supaLoadMyConversations`), donc rien ne
-- casse côté application.

-- ⚠️ UNE POLICY N'A D'EFFET QUE SI RLS EST ACTIVE. Sans ce `enable`, la policy
-- existe dans `pg_policies` — donc le contrôle plus bas serait VERT — pendant
-- que le GRANT SELECT à `anon` continuerait de rendre les 37 lignes. C'est un
-- faux vert de la même famille que le `SET LOCAL role` séparé de son `SELECT`
-- (ADR-012). Idempotent.
alter table public.conv_reads enable row level security;

alter policy "reads_select" on public.conv_reads
  using (public.is_conv_member(conv_id, (select auth.uid())::text));

-- ═══════════════════════════════════════════════════════════════════════════
-- B. `client_errors` EST ÉCRIVABLE SANS COMPTE, ET CE TEXTE PILOTE UN AGENT
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré : policy « Insert erreurs », cmd INSERT, rôle {public}, `with_check`
-- vrai sans condition, plus le GRANT INSERT à `anon`.
--
-- Ce n'est pas un défaut de confidentialité, c'est un défaut de CHAÎNE. Les
-- colonnes `message` et `stack` de cette table étaient recopiées dans le corps
-- ET le titre d'une issue `[SENTINELLE]`, ouverte au nom du propriétaire avec
-- le label `sentinelle` — les trois conditions exactes qui arment l'auto-fusion
-- de `claude-code.yml`. Un texte choisi par un inconnu devenait le prompt d'un
-- agent qui écrit dans `js/*.js` et déploie en production.
--
-- ⚠️ LE CORRECTIF CLIENT EST DÉJÀ EN PLACE ET NE DÉPEND PAS DE CETTE MIGRATION
-- (`desamorcer()` dans `scripts/sentinelle-detecter.mjs`, 6 verrous unitaires) :
-- le titre porte l'empreinte normalisée, et le corps est neutralisé. Cette
-- migration ferme la porte en amont, elle ne la remplace pas.
--
-- ⚠️ ON NE FERME PAS L'ÉCRITURE ANONYME, ET C'EST DÉLIBÉRÉ. Depuis la
-- « première visite » (2026-09-01), un visiteur SANS COMPTE parcourt toute
-- l'application : ses erreurs sont précisément celles qu'il faut voir. Interdire
-- l'insert à `anon` rendrait aveugle sur le parcours d'entrée — on perdrait un
-- diagnostic pour fermer une porte qu'on peut fermer autrement.
--
-- On ajoute donc une colonne que le CLIENT NE PEUT PAS ÉCRIRE : elle est
-- remplie par le serveur avec `auth.uid()`. Elle vaut NULL pour un visiteur, et
-- l'identité réelle pour un compte. La sentinelle n'enquêtera plus que sur des
-- erreurs portant une identité vérifiée — un inconnu ne peut plus atteindre la
-- chaîne, tandis que le tableau de bord continue de tout voir.
--
-- ⚠️ `uid` (la colonne existante) NE PROUVE RIEN : elle est écrite par le
-- client, et `getMyUserId()` fabrique un `u_<aléatoire>` pour tout visiteur.
-- Pire, les uuid des comptes sont PUBLICS (`profiles` est en lecture publique) :
-- filtrer sur « `uid` ressemble à un uuid » se contournerait en recopiant
-- l'identifiant de n'importe quel membre. Seule une valeur posée par le SERVEUR
-- tranche.

alter table public.client_errors
  add column if not exists auth_uid uuid;

-- ⚠️ UN `DEFAULT` NE PROTÈGE RIEN, ET `REVOKE INSERT (colonne)` NON PLUS.
-- Un défaut ne s'applique qu'aux insertions qui ne NOMMENT pas la colonne : un
-- client qui l'envoie explicitement écrirait ce qu'il veut. Et PostgreSQL ne
-- soustrait pas un privilège de COLONNE à un privilège de TABLE — le même piège
-- que `migration_irl_donnees_privees.sql` a déjà documenté : le `revoke`
-- réussirait sans le moindre effet, et le filtre de la sentinelle retomberait.
-- Or le client insère bien dans cette table, donc `anon` a nécessairement un
-- INSERT de table.
--
-- Seul un TRIGGER voit la ligne avant qu'elle n'existe et ne peut être contourné
-- par aucun grant. Même mécanique que `trg_event_attendees_admission`, et
-- insensible à l'ajout d'une colonne future.
create or replace function public.client_errors_pose_identite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.auth_uid := auth.uid();   -- NULL pour un visiteur, l'identité réelle sinon
  return new;
end;
$$;

revoke execute on function public.client_errors_pose_identite() from public, anon, authenticated;

drop trigger if exists trg_client_errors_identite on public.client_errors;
create trigger trg_client_errors_identite
  before insert on public.client_errors
  for each row execute function public.client_errors_pose_identite();

comment on column public.client_errors.auth_uid is
  'Identité posée par le SERVEUR (auth.uid()), NULL pour un visiteur sans compte. '
  'La sentinelle autonome n''enquête que sur les lignes où elle est renseignée : '
  'la colonne `uid`, elle, est écrite par le client et ne prouve rien.';

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lire APRÈS application
-- ═══════════════════════════════════════════════════════════════════════════
-- ① RLS réellement ACTIVE, pas seulement une policy présente :
-- select relrowsecurity from pg_class where oid = 'public.conv_reads'::regclass;
--   → true
--
-- ② et le prédicat posé :
-- select policyname, roles, qual from pg_policies
--   where schemaname='public' and tablename='conv_reads' and cmd='SELECT';
--   → qual doit contenir is_conv_member, plus jamais « true »
--
-- ③ le trigger d'identité existe et il est BEFORE INSERT :
-- select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.client_errors'::regclass and not tgisinternal;
--   → trg_client_errors_identite, tgenabled = 'O'
--
-- ④ MUTATION à éprouver : insérer en se donnant explicitement un `auth_uid`
--    choisi doit quand même rendre NULL sous le rôle anon.
--    set local role anon;
--    insert into public.client_errors (message, auth_uid)
--      values ('essai', '00000000-0000-4000-8000-000000000000'::uuid);
--    → la ligne écrite porte auth_uid NULL, pas la valeur envoyée.
--    (⚠️ le `set local role` et son `insert` doivent partir dans le MÊME appel :
--     séparés, le rôle retombe au défaut sans erreur — ADR-012.)
