---
name: lot-drapeau
description: Lot sous drapeau : double coupure, bloc CSS, tests, mise en ligne. Dire : nouveau lot, kill switch, activer par défaut.
---

# Lot sous drapeau — poser, tester, mettre en ligne

Le patron le plus répété de PASSIO : **16 modules `js/ui-v*.js` + `first-run.js`,
34 `window.PASSIO_*`, 43 coupures `localStorage`**. Chaque lot suit le même
déroulé, et chaque écart s'est déjà payé.

⚠️ `passio-release-guard` affirmait « il n'existe pas de système de flags
généralisé ». C'était faux, c'est corrigé — mais si tu lis encore cette phrase
quelque part, c'est ce fichier qui fait foi.

## La garde canonique — la recopier telle quelle

```js
function actif() {
  try { if (window.PASSIO_UI_7 === false) return false; } catch (e) {}
  try { if (localStorage.getItem("passio_ui_7") === "0") return false; } catch (e) {}
  return true;
}
```

**Deux coupures, jamais une.** `window.*` sert au test et à la console,
`localStorage` survit au rechargement. Les deux sont **prioritaires sur tout** et
chaque lecture est sous `try` : un `localStorage` indisponible (navigation
privée, quota) ne doit jamais éteindre le lot par accident.

**Le drapeau ne sait qu'ENLEVER.** Aucune valeur positive n'active, rien n'est
jamais écrit dans `localStorage`. Un lot en ligne est actif par défaut ; la
coupure le retire à l'octet près.

## Poser un lot — les 5 pièces, aucune facultative

1. **Un module `js/<nom>.js`** avec `actif()`, un `fail(etape, e)` qui journalise
   par `diagLog` (jamais un `catch` muet), et `etat()` qui garde contre
   `state === null`.
2. **Un bloc CSS en fin de `styles.css`**, ancré à une classe racine.
   ⚠️ **Le bloc UI-4A5 doit rester le DERNIER de la feuille** (4 rappels dans le
   fichier) : poser le nouveau bloc JUSTE AVANT lui.
   ⚠️ `styles.css` est en **CRLF** — n'y écrire qu'en binaire ou en ajout.
3. **Un `<script>` dans `index.html`**, hors du bloc `BUILD:APP`.
   ⚠️ Le module DOIT écouter `passio:app-ready` et y remettre ses compteurs de
   reprise à zéro — en production le bloc app n'est injecté qu'après le code
   d'accès, et un budget d'essais brûlé pendant la saisie ne revient jamais.
4. **Une suite `tests/e2e/<nom>.spec.js`**, avec un cas de kill switch qui exige
   le retour à l'état d'avant.
5. **Un verrou de coupure DANS la fonction de décoration** (`if (!actif()) return;`) :
   un rendez-vous armé avant la coupure survit à l'arrêt de l'observateur et
   reconstruit la surface juste après sa dépose — le kill switch paraît sans effet.

Détail des pièges par famille : `references/pieges.md`.

## Mettre un lot en ligne (aperçu → actif par défaut)

Procédure appliquée au moins 5 fois, écrite dans `references/mise-en-ligne.md`.
En bref : le drapeau perd toute activation positive, les anciens
`?passio_preview=…` sont tolérés **sans plus rien décider** (et leur code lecteur
est RETIRÉ, pas laissé mort), puis **chaque suite qui observait le comportement
historique pose la coupure au boot et GARDE TOUTES ses assertions**. Les contrôles
« URL normale = rien du lot » sont **RETOURNÉS** en contrôles de kill switch,
jamais supprimés.

⚠️ **L'en-tête du bloc CSS suit l'état réel du drapeau.** Cinq en-têtes de
`styles.css` annoncent encore « aperçu seulement » pour des lots actifs par
défaut — dont un qui documente une activation retirée depuis. Un commentaire faux
coûte plus cher qu'un commentaire absent.

## Vérifier

```bash
npm run verif                                   # 1 s
npm run test:local -- tests/e2e/<nom>.spec.js   # la suite du lot
```
