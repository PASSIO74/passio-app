---
name: moderation
description: "Modération et Trust & Safety : traiter les signalements (reports), blocage, contenu abusif, abus."
---

# /moderation — Trust & Safety PASSIO

Un réseau qui grandit attire les abus. La modération protège les utilisateurs ET la réputation.

## Système existant
- Tables `blocks` (blocker_id/blocked_id, RLS owner) et `reports` (insert ouvert, lecture admin). Cache local `state.user.blocked`, filtrage central via `isBlocked(id)` (feed, commentaires, notifs, messages, conversations).
- UI : `blockUser`/`unblockUser`/`reportUser`/`reportPost`/`reportEvent`/`reportCdvLive`, `openBlockedList()`. `supaBlockUser`/`supaReport` (app-08). Supprimé au delete-account (RGPD).

## Traiter la file de signalements
```
supabase db query --linked "SELECT r.created_at, r.kind, r.target_id, r.reason, r.reporter_id FROM reports r ORDER BY r.created_at DESC LIMIT 50"
```
Pour chaque signalement : identifier le contenu/compte (`kind` = user/post/event/cdv_live…), évaluer la gravité, décider (ignorer / masquer / supprimer / bannir). Il n'y a pas encore d'outil admin de suppression cross-compte → documenter le geste SQL nécessaire (avec prudence, lecture d'abord).

## Renforcements possibles (standards FB/IG)
1. **File de modération dans le dashboard** : panneau « Signalements » dans le centre de pilotage (skill `/dashboard-widget`) avec actions.
2. **Seuils automatiques** : N signalements sur un même contenu → masquage auto en attente de revue.
3. **Filtres de contenu** : mots interdits / spam à la publication (`escapeHtml` gère le XSS, pas le spam).
4. **Rate limiting** : anti-flood déjà en place côté serveur — vérifier qu'il couvre posts/commentaires/messages.
5. **Appel/contestation** : notifier l'auteur d'une modération.

## Garde-fous
- Toute suppression de données prod = lecture d'abord, jamais de DELETE aveugle. RGPD : les blocages/reports partent au delete-account.
- Ne pas exposer l'identité du signalant.

## Rapport
Signalements en attente par gravité, patterns récurrents (même compte/contenu), et recommandations d'outillage.
