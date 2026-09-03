---
name: motion
description: "Micro-interactions et animations juice : transitions, feedback tactile, effets de like. Dire : animations, plus fluide."
---

# /motion — Micro-interactions PASSIO

Le « juice » (feedback animé) est ce qui sépare une app fonctionnelle d'une app premium façon IG/TikTok. À doser : renforcer l'action, jamais gêner.

## Existant à réutiliser/étendre
- `_heartBurst` (double-tap like), `_likePop` (rebond du ❤️), cœurs flottants des lives (`heart`), barres de progression des stories/story CDV, squelettes shimmer des commentaires.
- Transitions d'écran via `goTo`, en-tête rétractable (`.chrome-collapsed`).

## Principes
1. **Court & réactif** : 150–300 ms, `ease-out`/`cubic-bezier`, `transform`/`opacity` uniquement (jamais `width`/`top` → reflow). GPU-friendly.
2. **Feedback immédiat** : chaque tap important a une réponse (scale, ripple, pop) — perçu comme plus rapide.
3. **`prefers-reduced-motion`** : respecter la préférence système (désactiver/atténuer).
4. **Pas de jank** : ne pas animer dans une boucle de rendu chaude ; attention aux guards no-op (`_feedDomSig`, `_lastHtml`) — une animation ne doit pas invalider un guard à chaque frame.

## Pistes de polish
- Animation de réaction (emoji qui gonfle puis se pose), transition d'ouverture de post/story (shared element), pull-to-refresh animé, skeleton→contenu en fondu, toast animé, badge qui « pop » à l'incrément.
- Transitions de navigation entre écrans (slide/fade cohérent).

## Méthode
1. Cibler UNE interaction à fort trafic (like, ouverture de story, envoi de message).
2. Ajouter l'animation en CSS (keyframes en fin de `styles.css`) + classe posée en JS, retirée à la fin (`animationend`).
3. Vérifier 60 fps dans le preview (pas de reflow), mobile 375px, et `prefers-reduced-motion`.

## Garde-fou
Cohérence : réutiliser les mêmes courbes/durées partout (créer des variables CSS `--ease`/`--dur` si besoin). Le violet `#7c3aed` reste la couleur d'accent des effets.
