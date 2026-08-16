-- ═══════════════════════════════════════════════════════════════════════════
-- user_state.updated_at DEVIENT AUTORITAIRE CÔTÉ SERVEUR
-- Incident SYNC-CLOCK-012 (2026-08-16). Revue croisée ChatGPT du même jour.
--
-- ✅ APPLIQUÉE EN PRODUCTION le 2026-08-16, puis vérifiée par A/B immédiat :
--    trigger désactivé → 3 653 jours d'avance acceptés (test ROUGE)
--    trigger actif     → 0 jour (test VERT)
--    Garde permanente : tests/e2e/user-state-horodatage.spec.js.
--
-- LE PROBLÈME
-- `user_state` porte l'état personnel du compte, synchronisé entre appareils.
-- La colonne `updated_at` a bien DEFAULT now(), mais le client la RENSEIGNE
-- explicitement (`new Date().toISOString()`, app-02) — et rien ne la réécrit.
-- La valeur du client gagne donc, et c'est elle qui arbitre la fusion au
-- démarrage : `if (serverTs > localTs) restaurer`.
--
-- Conséquence mesurée par lecture du code :
--   - appareil A, horloge en avance d'1 h, écrit T+1h ;
--   - B restaure, mémorise T+1h, puis écrit son état réel à T ;
--   - la garde monotone locale rejette T < T+1h : le drapeau « état sale » de B
--     n'est JAMAIS abaissé → réémission perpétuelle ;
--   - A rouvre, voit T < T+1h, NE RESTAURE PAS les changements de B et les
--     écrase. Un appareil à l'horloge rapide gagne définitivement.
--
-- Aucune dérive positive n'était observée en production le 2026-08-16 : le
-- défaut est RÉEL et NON DÉCLENCHÉ. C'est précisément ce qui le rend sournois —
-- il attend un utilisateur au téléphone mal réglé.
--
-- POURQUOI UN TRIGGER, ET PAS UNE CORRECTION CLIENT SEULE
-- ① Un correctif client ne protège que les clients MIS À JOUR. Ce dépôt déploie
--    à chaque push, sans staging : un onglet ouvert peut faire tourner la
--    version précédente pendant des heures. Le trigger ferme la porte pour tout
--    le monde, immédiatement, y compris pour les binaires déjà distribués.
-- ② Il n'y a pas qu'un chemin d'écriture. `supaSaveUserState` passe par le SDK,
--    mais `supaSaveUserStateBeacon` fait un POST REST BRUT au `pagehide`. Deux
--    producteurs, une seule frontière : la base.
-- ③ Une fois la colonne authentiquement serveur, elle devient utilisable comme
--    jeton de compare-et-remplace — ce que le chemin de rejeu fait déjà avec
--    `.lt("updated_at", …)`, mais en comparant contre une horloge client.
--
-- POURQUOI C'EST SANS RUPTURE
-- Un client ancien continue d'envoyer son `updated_at` : il est simplement
-- ignoré. Aucune colonne ajoutée, aucune supprimée, aucun type changé. Un client
-- qui ne lit pas la valeur de retour fonctionne exactement comme avant — en
-- mieux, puisqu'il ne peut plus mentir. Il n'y a donc pas de fenêtre
-- expand/contract à gérer.
--
-- CE QUE ÇA NE RÈGLE PAS — à écrire ici plutôt que de le laisser croire
-- L'écriture reste un « dernier écrivain gagne » sur un blob. Deux appareils qui
-- modifient deux champs indépendants au même moment : le second écrase toujours
-- le premier. Horodater côté serveur supprime l'AUTORITÉ FAUSSE, pas le besoin
-- d'un contrôle d'ancienneté (compare-et-remplace par révision). Ce dernier est
-- documenté dans .passio/adr/ADR-009 et volontairement NON fait ici : il change
-- la sémantique d'écriture du chemin le plus sensible de l'app.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.user_state_horodatage_serveur()
returns trigger
language plpgsql
-- Pas de SECURITY DEFINER : la fonction ne lit aucune table, elle ne fait
-- qu'écraser un champ de NEW. Lui donner des droits élevés serait gratuit — et
-- les advisors de sécurité signalent à raison toute fonction qui en abuse.
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_state_horodatage on public.user_state;

-- BEFORE INSERT **OR UPDATE** : ne couvrir que l'INSERT laisserait le chemin
-- UPDATE (celui du rejeu conditionnel) libre de reposer une valeur client.
create trigger trg_user_state_horodatage
  before insert or update on public.user_state
  for each row execute function public.user_state_horodatage_serveur();

-- ── Vérification à exécuter juste après l'application ──────────────────────
-- Doit renvoyer une dérive proche de zéro, quelle que soit la valeur envoyée :
--
--   insert into user_state (user_id, data, updated_at)
--   values ('verif-trigger', '{}'::jsonb, now() + interval '10 years')
--   on conflict (user_id) do update set data = excluded.data,
--                                       updated_at = excluded.updated_at
--   returning updated_at, now() - updated_at as derive;
--   delete from user_state where user_id = 'verif-trigger';
--
-- `derive` doit être de l'ordre de la milliseconde. Si elle vaut 10 ans, le
-- trigger n'est pas actif et le correctif client seul ne suffira pas.
