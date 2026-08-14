---
name: engagement
description: Audite et enrichit les mécaniques d'engagement de PASSIO (réactions, commentaires, partages, likes, stories, micro-interactions) au niveau FB/IG. À utiliser quand Benjamin veut plus d'interactions, rendre l'app plus addictive/vivante, ou dit "engagement", "interactions", "rendre vivant", "faire réagir".
---

# /engagement — Mécaniques d'engagement PASSIO

Plus il y a d'interactions, plus il y a de notifications, plus les gens reviennent (boucle centrale des réseaux sociaux).

## Mécaniques existantes (parité FB/IG déjà atteinte sur beaucoup)
- **Charte d'engagement unifiée** : barre `post-actions` (❤️ like · 💬 commenter · 😊 réagir · partage) sur TOUTES les surfaces (fil, carnets CDV, événements IRL, lives).
- **Réactions** : 1 emoji/personne (toggle), GIF = commentaire, popover commun `_emojiReactPopover`.
- **Commentaires niveau IG/FB** : réponses repliées, tri Pertinents/Récents, @mentions autocomplete, épingler, éditer, liens cliquables, double-tap like + `_heartBurst`, squelettes, pagination, file offline.
- **Stories** (anneaux vus/non-vus), **lives** (vidéo + CDV), **badges/étoiles**.

## Pistes d'enrichissement
1. **Micro-interactions** (skill `/motion`) : le « juice » IG (animations de like, transitions) augmente le plaisir → l'engagement.
2. **Réactions rapides** : accès plus direct (long-press), réactions animées.
3. **Sondages / questions** dans les posts ou stories (format engageant FB/IG).
4. **Mentions & tags** de personnes dans les posts (pas que les commentaires) → notif → retour.
5. **Repartage** (repost/quote) — amplification interne du contenu.
6. **Réponses aux stories** en message privé (pont story→conversation).

## Méthode
1. Mesurer l'engagement actuel par surface (`/kpi` : likes/comments/réactions par post, taux de réponse).
2. Choisir la mécanique avec le meilleur ratio impact/effort qui manque encore.
3. Implémenter en respectant les invariants (`/feature` : 1 réaction/personne, findPostAnywhere, notif à l'auteur, escapeHtml).
4. Instrumenter et mesurer l'effet réel.

## Rapport
Taux d'engagement par surface, mécaniques manquantes vs FB/IG, recommandation priorisée.
