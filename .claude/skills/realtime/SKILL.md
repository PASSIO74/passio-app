---
name: realtime
description: Audite/débogue le temps réel de PASSIO (canaux Supabase Realtime, broadcast, presence, livraison cross-compte) pour messages, notifs, likes, lives, appels. À utiliser quand quelque chose n'arrive pas en direct, pour vérifier la livraison instantanée, ou quand Benjamin dit "realtime", "temps réel", "ça n'arrive pas en direct", "les messages ne se reçoivent pas".
---

# /realtime — Temps réel PASSIO

## Architecture (à connaître avant de toucher)
- **Au repos, un client a 3 canaux** : `user:<uid>` (messages v3), `ring:<uid>` (appels), `realtime:db`.
- **UN SEUL canal `realtime:db`** pour TOUS les postgres_changes (conv_reads, comment_interactions, conv_members, profiles, posts, post_likes, notifications, post_comments, event_comments + 5 tables cdv_*). Bindings multiples `.on().on()…` puis UN `.subscribe()`. Ne PAS recréer des canaux séparés (quota Supabase).
- **Messages v3** : topic privé par utilisateur `user:<MY_UID>` (`_subscribeUserTopic`) alimenté par le trigger SQL `broadcast_conv_message_to_users`. Handler commun `_handleIncomingConvMessage(r)`. Garde `_supaSubscribed` contre le double abonnement.
- **Appels / Live vidéo** : Broadcast + Presence sur canaux publics (`call:<id>`, `ring:<uid>`, `vlive:<liveId>`) — pas de table.

## Débogage
1. La table concernée est-elle dans la **publication realtime** ? `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'` (skill `/schema`). Une table absente = 0 événement.
2. Le handler du binding filtre-t-il correctement (ex. notifications `user_id===MY_UID`) ? Un echo de sa propre action peut créer un double (cf. double-like corrigé par garde `r.user_id===MY_UID`).
3. Le canal est-il bien souscrit (pas dans du code mort) ? ⚠️ `supaInit` a un GROS bloc mort après `return;` — `supaSubscribe()` en a été extrait (un bug historique : personne ne recevait rien).
4. Jamais de requête Supabase dans `onAuthStateChange` (deadlock) → `setTimeout(...,0)`.
5. Pollings de secours suspendus si `document.hidden` (rattrapage au retour).

## Valider
La livraison cross-compte ne se prouve QUE par `/e2e-multi` (2 comptes réels, `PASSIO_E2E_RT=v3|v2`). Vérifier la réception ~1 s sans rechargement.

## Rapport
Canal concerné, table dans la publication (oui/non), filtre du handler, souscription active, et cause racine si un événement manque.
