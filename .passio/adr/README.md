# Architecture Decision Records (ADR)

Décisions structurantes de PASSIO, une par fichier, immuables une fois `Accepté` (une décision qui change → nouvel ADR qui *supersède* l'ancien). Index dans [`../context/DECISIONS.md`](../context/DECISIONS.md).

## Modèle

```markdown
# ADR-NNN — Titre

- **Statut** : Proposé | Accepté | Superseded par ADR-XXX
- **Date** : AAAA-MM-JJ
- **Contexte** : la contrainte / le problème réel.
- **Décision** : ce qui est décidé.
- **Conséquences** : bénéfices, coûts, ce que ça interdit désormais.
- **Alternatives écartées** : et pourquoi.
- **Trigger de réexamen** : la métrique/l'événement qui rouvrirait la décision.
```

## Principe

On ne documente que les décisions **réelles et engageantes** (celles qui contraignent le code futur). Pas de décisions cosmétiques. Chaque « ce qu'on refuse par défaut » (framework, bundler, microservices) est un ADR avec son *trigger* de réexamen — cf. `../../PASSIO_TECHNICAL_VISION.md`.
