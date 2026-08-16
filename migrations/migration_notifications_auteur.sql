-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS — contraindre l'AUTEUR, pas le destinataire.
--
-- ⚠️ PRÉPARÉE, NON APPLIQUÉE. Changement de RLS : à passer sous supervision.
--
-- LE DÉFAUT (constaté le 2026-08-16)
-- La table est parfaitement scellée en lecture… et grande ouverte en écriture :
--
--   SELECT (user_id = auth.uid())    ✅ personne ne lit les notifications d'autrui
--   UPDATE (user_id = auth.uid())    ✅
--   DELETE (user_id = auth.uid())    ✅
--   INSERT  true                     ❌ aucune contrainte, et en double
--
-- Colonnes : id, user_id (destinataire), kind, from_id (auteur revendiqué),
-- ref_id, content (texte libre), seen, created_at.
--
-- Conséquence : n'importe quel compte authentifié peut insérer une notification
-- VERS n'importe qui, AU NOM de n'importe qui, avec un contenu arbitraire. Ce
-- n'est pas une fuite — on ne peut toujours pas LIRE les notifications d'autrui —
-- mais c'est une usurpation dans le seul canal où l'utilisateur fait confiance
-- à ce qu'il voit, et un vecteur d'hameçonnage (`ref_id` mène où l'on veut).
--
-- POURQUOI C'ÉTAIT `true`
-- Une notification est cross-compte PAR NATURE : quand A aime le post de B, c'est
-- A qui écrit la ligne dont le destinataire est B. Contraindre `user_id` était
-- donc impossible, et la contrainte a simplement été abandonnée. Or ce n'est pas
-- le destinataire qu'il fallait contraindre : c'est l'AUTEUR.
--
-- SANS RUPTURE POUR L'APP — vérifié
-- `supa.from("notifications").insert(...)` n'apparaît qu'à UN endroit
-- (app-08, `supaInsertNotif`) et renseigne déjà `from_id: MY_UID`.
--
-- Cette policy est le pendant exact de celle des messages, des posts et des
-- blocages : on contraint toujours le côté ACTEUR de la relation.
-- ═══════════════════════════════════════════════════════════════════════════

-- Les deux policies INSERT sont des doublons (`true` et `true`) : permissives,
-- elles se combinent en OU, donc en laisser une seule suffirait à tout rouvrir.
-- Il faut retirer LES DEUX avant d'en poser une contrainte.
drop policy if exists "notifications_insert" on public.notifications;
drop policy if exists "notifications_insert_any" on public.notifications;
drop policy if exists "Insert notifications" on public.notifications;

-- Purge défensive : on ne connaît pas les noms exacts, et une policy permissive
-- oubliée annulerait silencieusement tout le bénéfice de celle qu'on ajoute.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='notifications' and cmd='INSERT'
  loop
    execute format('drop policy if exists %I on public.notifications', p.policyname);
  end loop;
end $$;

create policy notifications_insert_own_author
  on public.notifications for insert
  with check (from_id = (select auth.uid())::text);
-- `(select auth.uid())` et non `auth.uid()` : la forme enveloppée permet à
-- Postgres d'évaluer la valeur UNE fois (initPlan) au lieu de la recalculer par
-- ligne — c'est le motif des 85 avertissements `auth_rls_initplan`. Autant poser
-- la nouvelle policy directement sous la bonne forme.

-- ── CONTRÔLE APRÈS APPLICATION ──────────────────────────────────────────────
-- Doit renvoyer EXACTEMENT une ligne INSERT, contrainte sur from_id :
-- select cmd, permissive, with_check from pg_policies
--  where schemaname='public' and tablename='notifications' order by cmd;
--
-- Et le test d'intrusion, à ajouter à tests/e2e/authz-critical.spec.js EN MÊME
-- TEMPS que cette migration (pas avant : un rouge connu dans le gate finit par
-- faire désactiver le gate) :
--   B insère une notification avec from_id = A.uid  →  doit être REFUSÉ (403)
--   B insère une notification avec from_id = B.uid  →  doit être ACCEPTÉ
--
-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
--   drop policy if exists notifications_insert_own_author on public.notifications;
--   create policy notifications_insert on public.notifications for insert with check (true);
-- ═══════════════════════════════════════════════════════════════════════════
