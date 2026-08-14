---
name: a11y
description: Audite l'accessibilité de PASSIO (contraste AA, cibles tactiles 44px, champs 16px anti-zoom iOS, aria, navigation clavier). À utiliser quand Benjamin dit "accessibilité", "a11y", "contraste", "lisibilité", ou après une refonte visuelle.
---

# /a11y — Audit accessibilité PASSIO

## Acquis à ne pas casser
- `user-scalable=no` / `maximum-scale` **retirés** (le zoom doit rester possible).
- Champs de saisie à **16px** (sinon iOS zoome au focus).
- `--muted` calibré en contraste **AA**. Cibles tactiles **44px** minimum.
- Loupes et icônes fonctionnelles = SVG `currentColor` (héritent la couleur du texte → contraste cohérent).

## Méthode
1. Dans le preview (skill `/preview`), `read_page` pour l'arbre d'accessibilité (labels, rôles, refs).
2. Vérifier :
   - **Contraste** : texte sur `--bg-card`/`--bg`, états `--muted`, boutons violets. Cibler AA (4.5:1 texte normal, 3:1 gros texte/icônes).
   - **Cibles tactiles** : boutons/onglets ≥ 44px (mesurer via `javascript_tool` getBoundingClientRect).
   - **aria** : boutons-icônes sans libellé texte doivent avoir `aria-label` ; onglets multi-sélection ont `aria-pressed` (profil/IRL/CDV) ; listes de commentaires `aria-live`.
   - **Clavier** : Ctrl/Cmd+Entrée envoie un commentaire ; Échap/flèches dans les viewers story.
3. Tester mobile 375px + un zoom navigateur à 200 %.

## Rapport
Liste priorisée : élément, critère WCAG manqué, ratio/mesure constaté, correctif CSS/markup. Ne pas régresser les acquis ci-dessus.
