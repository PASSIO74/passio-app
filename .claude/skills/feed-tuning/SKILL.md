---
name: feed-tuning
description: Règle et améliore l'algorithme de classement du fil PASSIO (rankFeedPosts — fraîcheur, affinité, engagement) au niveau du News Feed FB/IG. À utiliser quand Benjamin veut améliorer la pertinence du fil, l'ordre des posts, l'algo, ou dit "fil", "feed", "classement", "algorithme", "quel post en premier".
---

# /feed-tuning — Réglage de l'algo de fil PASSIO

Le classement du fil est LE cœur d'un réseau social. PASSIO a déjà un ranking par pertinence — on le règle finement, on ne le réécrit pas à l'aveugle.

## L'algo actuel (`rankFeedPosts`/`feedPostScore`, app-02)
- Le fil est **déjà filtré en amont** (passions sélectionnées + suivis) → le ranking ne change QUE l'ordre dans ce set, jamais ce qui est visible.
- Score = **fraîcheur dominante** (décroissance exp τ=48 h) + **affinité** (+1 passion pratiquée, +1 auteur suivi) + **engagement** (likes + 2×commentaires + réactions, `Math.log` compressé, plafonné à 3).
- ⚠️ **Bucket 5 min** partagé avec le guard `_feedDomSig` → l'ordre est stable dans la fenêtre du guard, pas de repaint parasite. Ne pas repasser à `Date.now()` continu sans revoir le guard.
- Soupape : `localStorage.passio_feed_rank="0"` = chronologique strict. Couverture : `tests/e2e/feed-ranking.spec.js` (5 tests déterministes).

## Réglages possibles (dans l'esprit FB/IG)
1. **Poids** : ajuster τ (fraîcheur), les bonus d'affinité, la compression d'engagement. Toute modif = mettre à jour/ajouter un test dans `feed-ranking.spec.js`.
2. **Signaux nouveaux** : temps passé (dwell, via télémétrie), diversité d'auteurs (éviter qu'un seul auteur monopolise), pénalité de contenu déjà vu.
3. **Anti-monotonie** : intercaler stories/lives, éviter les doublons de passion consécutifs.
4. **Cold start** : pour un compte sans follows, privilégier l'engagement global + passions.

## Méthode
1. Modifier `feedPostScore` de façon isolée et testable (fonction pure).
2. Mettre à jour `tests/e2e/feed-ranking.spec.js` (déterministe) pour figer le comportement voulu.
3. Vérifier la stabilité (pas de repaint, guard respecté) dans le preview.
4. Idéalement, mesurer l'effet réel via télémétrie (dwell/engagement par position).

## Garde-fou
Ne jamais faire disparaître du contenu via le ranking (le filtrage est séparé). Garder la soupape chronologique.
