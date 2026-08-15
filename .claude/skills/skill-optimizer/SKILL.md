---
name: skill-optimizer
description: Capitalise un acquis de session en amélioration durable de l'environnement Claude Code — créer/améliorer/fusionner un skill, sortir une procédure en script, poser une règle ou un hook, nettoyer la bibliothèque. À utiliser quand une procédure vient de se révéler réutilisable, quand Benjamin répète une instruction déjà donnée, quand un skill donne de mauvais résultats, ou quand il dit "capitalise", "fais-en un skill", "range les skills", "audite mes skills".
---

# /skill-optimizer — Transformer un acquis en outil durable

Objectif : que Benjamin ne redise jamais demain ce qui peut être structuré aujourd'hui.

## 1. Mesurer avant de décider

```bash
node .claude/scripts/skills-lint.js
```

Donne l'état factuel : nombre de skills, budget de listing consommé, descriptions
trop vagues, SKILL.md obèses, déclencheurs qui se chevauchent. **Ne jamais juger la
bibliothèque à l'œil** — au 2026-08-15 elle paraissait redondante (8 skills « produit »)
alors que le chevauchement maximal mesuré était de 21 % : aucune fusion n'était justifiée.

## 2. RÉUTILISER > AMÉLIORER > CRÉER

Dans cet ordre, sans exception :

1. **Réutiliser** — un skill existant couvre le besoin → l'invoquer, point.
2. **Améliorer** — il couvre 80 % → généraliser ce skill, enrichir sa référence,
   préciser sa description. Une description imprécise est la première cause de
   mauvais déclenchement.
3. **Créer** — seulement pour un workflow, une expertise ou une automatisation
   réellement nouvelle.

Un nouveau skill doit apporter au moins un bénéfice mesurable : temps, tokens,
erreurs évitées, répétitions supprimées, interruptions supprimées, workflow
standardisé. Sinon, ne pas le créer.

## 3. Le skill n'est pas toujours la bonne réponse

Choisir l'emplacement selon la portée — détail et exemples dans
[references/placement.md](references/placement.md) :

| Le comportement vaut… | → il va dans |
|---|---|
| partout, toujours, en 2 lignes | `~/.claude/settings.json` ou CLAUDE.md |
| pour ce projet uniquement | `CLAUDE.md` du projet |
| un workflow spécialisé | un skill |
| une connaissance volumineuse et occasionnelle | `references/` du skill |
| une procédure déterministe | un **script** (jamais des tokens) |
| une réaction à un évènement | un **hook** |
| une autorisation répétitive | une règle de permission à joker |

Règle de tri : *cette instruction doit-elle être chargée dans **toutes** les
conversations ?* Si non → elle ne va pas dans le noyau global.

## 4. Contrôle qualité avant de considérer un skill terminé

- déclencheur précis (verbes + mots que Benjamin emploie réellement) ;
- une seule responsabilité identifiable ;
- SKILL.md court ; le volume part en `references/` ;
- l'étape déterministe est un script, pas une explication ;
- relancer `skills-lint.js` : zéro régression de budget, zéro chevauchement neuf.

## 5. Après coup

Si l'acquis concerne le projet plutôt que la méthode, écrire aussi la mémoire
correspondante (`MEMORY.md` + fiche) — un skill outille un geste, la mémoire
retient un fait.
