# Clôture d'un incident — critères et format

## Critères de réussite

- Le défaut est reproduit par un test **avant** correction.
- Le test est **rouge sans le correctif**, vert avec — les deux exécutions sont citées.
- Les audits statiques et la suite voisine sont verts.
- Le scénario est conservé comme test permanent dans `tests/e2e/`.
- L'incident est inscrit dans `passio_qa_registry.json` avec sa preuve.

## Format de résultat

Le rapport complet et l'inscription au registre relèvent de `passio-incident-report` ; ce squelette est le minimum qu'un incident doit porter en sortie du pipeline.

```
INCIDENT <ID> — <titre>
Sévérité     : critical | high | medium | low
Empreinte    : <message normalisé> @ <endpoint> / <action>
Impact       : <n> utilisateurs, <n> appareils, depuis <date>
Reproduction : tests/e2e/<spec>.spec.js
Cause racine : <la cause, pas le symptôme>
Correctif    : <fichier:ligne> — <ce qui change et pourquoi>
Preuve       : sans correctif → ROUGE (<sortie>) ; avec → VERT (<sortie>)
Régression   : <suites relancées et leur résultat>
Risque résiduel : <ce qui reste non couvert>
```
