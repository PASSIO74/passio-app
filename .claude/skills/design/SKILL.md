---
name: design
description: "Refonte visuelle d'un écran selon la charte maison (violet, pas de mode sombre). Dire : refais l'écran, c'est moche, polish."
---

# /design — Refonte visuelle d'un écran PASSIO

## Charte à respecter (non négociable)
- **Thème violet** `#7c3aed`. Toujours les variables CSS : `--bg-card`, `--border`, `--muted`, `--accent`, `--bg`. Préférer `var(--bg-card)` à `background:#fff`.
- **PAS de mode sombre** — retiré à la demande du client le 2026-07-20. Ne jamais le re-proposer sans demande explicite. Idem : pas de moods en pills (grille 4 colonnes d'origine).
- **Fil compact** : `.profile-tile-avatar` 46px. En-tête rétractable via `.chrome-collapsed`.
- **Icônes** : SVG inline `currentColor` pour l'UI fonctionnelle (loupe, live, etc.), emojis réservés au CONTENU (passions, réactions).
- **Touch 44px**, champs à **16px** (zoom iOS), `--muted` en contraste AA.
- Toasts via `toast()`, jamais `alert()`. `styles.css` = 6300 lignes, ajouter en fin de section logique.

## Méthode
1. Localiser l'écran : markup dans `index.html` (`#screen-<nom>`), styles dans `styles.css`, rendu dans le bon `app-*.js` (feed→app-02, profil→app-06, IRL→app-07, CDV→app-03, messages→app-04).
2. Lire la fiche `docs/PIEGES_CONNUS.md` du domaine (beaucoup d'écrans ont des invariants de rendu — guards `_lastHtml`, `data-has-photo`, etc.).
3. Proposer un avant/après. Pour du HTML/CSS statique, un **Artifact** de maquette peut aider à valider vite (charger la skill `artifact-design`).
4. Implémenter dans les fichiers source (jamais dans `dist/`), en réutilisant les classes existantes.
5. **Vérifier dans le navigateur** : `preview_start {name}` (voir `.claude/launch.json`), screenshot, `resize_window` mobile 375px (l'app est mobile-first).
6. Ne PAS casser les guards de rendu : si tu écris dans `#feedList`/`#storiesRowFeed`/`#profileStrip`, invalider `_feedDomSig`/`_lastHtml`.

## Rendu
Screenshot avant/après. Respecter `escapeHtml`/`safeUrlAttr` sur tout contenu utilisateur affiché.
