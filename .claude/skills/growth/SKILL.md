---
name: growth
description: Audite et renforce les boucles de croissance/viralité de PASSIO (invitations, preuve sociale, partage, parrainage, notifications de ré-engagement) au niveau des standards Facebook/Instagram. À utiliser quand Benjamin veut faire grandir la base, augmenter la viralité, le partage, ou dit "croissance", "growth", "faire venir des gens", "viralité", "parrainage".
---

# /growth — Boucles de croissance PASSIO

Objectif : maximiser le coefficient viral (K) et les entrées, comme FB/IG. On raisonne en **boucles**, pas en features isolées.

## Boucles existantes à auditer/renforcer
- **Invitation directe** (IRL) : `openEventInvite`/`inviteToEvent` → notif `event_invite`. Étendre le pattern aux carnets CDV, profils, passions.
- **Preuve sociale** : `_eventSocialProofHtml` (« Marie et Tom y vont ») — LE déclencheur FB/IG. Manque-t-il sur d'autres surfaces (posts, lives, profils) ?
- **Partage sortant** : liens `#irl-event-<id>`, `#carnet-<id>`, `#cdv-live-<id>`, `shareUserProfile`. Chaque partage doit ramener sur une **landing riche** (preview + CTA d'inscription), pas la home.
- **Notifications de ré-engagement** : digest IRL hebdo (`_irlWeeklyDigest`), rappels J-7/J-1/H-2. Voir skill `/notifications-strategy`.

## Leviers à considérer (standards réseaux sociaux)
1. **Parrainage** : code de parrainage → crédit d'étoiles (système `score`/`RANKS` existe déjà) pour l'invitant ET l'invité.
2. **Contacts / partage natif** : `navigator.share` (déjà utilisé) sur tout contenu ; suggérer d'inviter après une action forte (1er post, 1er événement rejoint).
3. **Open Graph / preview de partage** : meta OG dynamiques par contenu partagé (aujourd'hui l'app est une PWA gate — un lien partagé doit afficher un aperçu attrayant hors du gate). ⚠️ Contrainte : beta protégée par code d'accès — arbitrer entre viralité et gate.
4. **Boucle de contenu** : réagir/commenter notifie l'auteur → le ramène → il republie. Vérifier que chaque interaction notifie et ramène.

## Mesurer
Toute hypothèse de croissance se valide sur la **télémétrie** (`telemetry_events`, skills `/kpi` et `/pilot-report`) : taux d'invitation envoyée→acceptée, partages, K-factor. Instrumenter le nouveau levier via `/telemetry-event` AVANT de le juger.

## Garde-fou
Rester non-spammy (cf. `/notifications-strategy`) et respecter la confidentialité (pas de compilation de contacts sans consentement, PII minimisé).
