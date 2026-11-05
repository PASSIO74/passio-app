---
name: realtime
description: "Temps réel Supabase : canaux, broadcast, presence, cross-compte. Dire : realtime, n'arrivent pas en direct."
---

# /realtime — Temps réel PASSIO

## Architecture (à connaître avant de toucher)
- **Au repos, un compte a 3 canaux** : `user:<uid>`, `ring:<uid>` (appels), `realtime:db`. Un visiteur n'en ouvre aucun.
- **UN SEUL canal `realtime:db`** pour tous les `postgres_changes` de CONTENU PUBLIC (huit liaisons en v3 : conv_reads, comment_interactions ×2, profiles, posts, post_comments, event_comments, video_lives). Bindings multiples `.on().on()…` puis UN `.subscribe()`. Ne PAS recréer des canaux séparés. La liste exacte : `scripts/realtime-publication.json` (`npm run audit:realtime`).
- **`user:<MY_UID>`** (`_subscribeUserTopic`), topic privé alimenté par le SERVEUR, aucune émission client possible : les **messages** (événement `INSERT`, trigger `broadcast_conv_message_to_users`, lus en v3 seulement), les **ajouts à une conversation** (`conv_members:INSERT`) et les **notifications** (`notifications:INSERT`) — ces deux-là dans tous les modes depuis R25 (2026-11-03). Garde `_supaSubscribed` contre le double abonnement.
- ⚠️ **R25 — une table publiée livre ses DELETE (clé primaire) à TOUT abonné qui les demande, anon compris, sans RLS** (`realtime.apply_rls`). `conv_members` et `notifications` sont donc HORS publication, poussées sur `user:<uid>`. **Ne jamais les republier** pour « réparer » un direct manquant : vérifier les triggers `trg_diffuser_ajout_membre` / `trg_diffuser_notification`. Fiche : `docs/journal/capacite-perf-realtime.md` § R25.
- **Appels / Live vidéo** : Broadcast + Presence sur canaux publics (`call:<id>`, `ring:<uid>`, `vlive:<liveId>`) — pas de table.

## Débogage
1. **Notification ou ajout à une conversation qui n'arrive pas en direct ?** Ce n'est PAS la publication : vérifier que les triggers `trg_diffuser_notification` / `trg_diffuser_ajout_membre` existent et sont actifs, que le client lie `notifications:INSERT` / `conv_members:INSERT` sur `user:<uid>`, et que la migration R25 est appliquée. Pour une autre table : est-elle dans la **publication realtime** ? `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'` (skill `/schema`). ⚠️ Une liaison vers une table absente ne fait pas que se taire : Realtime annule TOUTES les liaisons de son canal (une transaction) — tout `realtime:db` devient muet. Et avant de republier une table, regarder sa clé primaire : si elle dit quelque chose (qui, avec qui), c'est une fuite (R25) — pousser sur `user:<uid>` à la place.
2. Le handler du binding filtre-t-il correctement (ex. notifications `user_id===MY_UID`) ? Un echo de sa propre action peut créer un double (cf. double-like corrigé par garde `r.user_id===MY_UID`).
3. Le canal est-il bien souscrit (pas dans du code mort) ? ⚠️ `supaInit` a un GROS bloc mort après `return;` — `supaSubscribe()` en a été extrait (un bug historique : personne ne recevait rien).
4. Jamais de requête Supabase dans `onAuthStateChange` (deadlock) → `setTimeout(...,0)`.
5. Pollings de secours suspendus si `document.hidden` (rattrapage au retour).
6. **Un DELETE qui arrive « vide » est voulu (R25, 2026-11-04).** `conv_reads` et `post_likes` sont en identité `rid` : un DELETE y livre `payload.old = {}`. `comment_interactions` (identité DEFAULT, RLS active) ne livre que `{id}`. Aucun filtre sur `conv_id` ou `user_id` ne reconnaît un DELETE de ces tables. Un gestionnaire DELETE qui lit `payload.old.comment_id` ne reçoit donc jamais rien : c'était le cas d'`_applyCommentInteractionEvent` jusqu'au 2026-11-05 (R37). **Jamais REPLICA IDENTITY FULL** pour « réparer » : c'est l'oracle de filtre que R25 a fermé, et la gate `audit-identite-replication` le refuse. Le remède en place est un INDEX côté client (`_ciIndexer` / `_commentInteractionRetiree`, app-04) : toute lecture d'une table dont on veut voir les retraits demande `id`, et le DELETE s'y résout sans requête. Ne pas « relire à chaque DELETE » : une suppression part à TOUS les abonnés, c'est de l'amplification.

## Valider
La livraison cross-compte ne se prouve QUE par `/e2e-multi` (2 comptes réels, `PASSIO_E2E_RT=v3|v2`). Vérifier la réception ~1 s sans rechargement.

## Rapport
Canal concerné, table dans la publication (oui/non), filtre du handler, souscription active, et cause racine si un événement manque.
