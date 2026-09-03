---
name: passio-incident-report
description: "Rapport normalisé d'un incident ou d'une réparation, inscrit au registre machine. Dire : écris le rapport, incident clos."
---

# /passio-incident-report — Le format qui empêche de tricher

## À quoi sert ce format

Il est conçu pour qu'un incident **ne puisse pas être déclaré clos sans preuve**. Chaque champ obligatoire correspond à une façon dont une clôture s'est déjà révélée fausse sur ce projet.

| Champ | Ce qu'il empêche |
|---|---|
| `preuve_avant` **et** `preuve_apres` | déclarer réparé sans avoir vu le rouge |
| `cause_racine` distincte de `symptome` | corriger l'affichage et laisser la cause |
| `impact` en utilisateurs **et** appareils | confondre volume de lignes et gravité |
| `risque_residuel` | prétendre à une couverture totale |
| `test_permanent` | perdre le scénario après la session |

Un champ non mesuré s'écrit `null` avec un statut explicite. **Jamais une valeur inventée.**

## Les deux artefacts, et leur ordre

1. **`passio_qa_registry.json`** — source de vérité **machine**. Tableau `incidents[]`.
2. **`PASSIO_MASTER_CONTROL.md`** — vue **humaine**, tableau « INCIDENTS ACTIFS ».

Écrire le registre d'abord, la vue humaine ensuite : c'est le sens qui garde les deux cohérents.

Journal chronologique : `PASSIO_ENGINEERING_LOG.md`. Décision d'architecture : `.passio/adr/`. Piège réutilisable ailleurs : `docs/PIEGES_CONNUS.md` — et si l'invariant vaut pour toute modification future, `CLAUDE.md`.

## Nommage

`<DOMAINE>-<MOTIF>-<NNN>` — `SYNC-B64-005`, `NOTIF-FORGE-009`, `CI-GATE-001`. Le numéro est global et ne se réutilise jamais.

## Statuts autorisés

| Statut | Signification stricte |
|---|---|
| `DETECTED` | observé, cause non établie |
| `REPRODUCED` | test rouge écrit |
| `FIXED_LOCALLY` | corrigé, prouvé, **pas encore en production** |
| `MIGRATION_PRETE_NON_APPLIQUEE` | le correctif est une migration en attente |
| `CLOS` | en production **et** vérifié en production |
| `NON_REPRODUCTIBLE` | tentative documentée, abandon assumé |
| `MITIGE` | contourné, cause toujours présente — reste ouvert |

⚠️ `FIXED_LOCALLY` n'est pas `CLOS`. La différence est un déploiement **et** une vérification après coup.

## Le gabarit

```json
{
  "id": "SYNC-CLOCK-011",
  "severite": "P1",
  "domaine": "Synchronisation multi-appareils",
  "statut": "REPRODUCED",
  "detecte_le": "2026-08-16",
  "symptome": "Ce que l'utilisateur constate.",
  "cause_racine": "Le mécanisme, pas l'écran.",
  "empreinte": "<message normalisé> @ <endpoint> / <action>",
  "impact": { "utilisateurs": null, "appareils": null, "note": "non déclenché en prod à ce jour" },
  "reproduction": "tests/e2e/<spec>.spec.js",
  "preuve_avant": "sans correctif → ROUGE : <sortie citée>",
  "preuve_apres": "avec correctif → VERT : <sortie citée>",
  "mutation_teste": true,
  "correctif": { "fichiers": ["js/app-02-state-utils.js:348"], "resume": "…" },
  "regression": ["npx playwright test → …", "audits statiques → …"],
  "test_permanent": "tests/e2e/<spec>.spec.js",
  "commit": null,
  "risque_residuel": "Ce qui reste non couvert.",
  "prevention": "Le garde-fou qui empêche la récidive."
}
```

## Les règles de rédaction

**Citer la sortie, pas la conclusion.** « Le test passe » ne vaut rien ; `Received: 1` en vaut la peine.

**Écrire la contre-épreuve.** Un correctif de suppression doit prouver que le non-supprimé survit — sinon un correctif qui efface tout passerait le test.

**Corriger ses propres affirmations dans le document.** Le projet a déjà consigné trois conclusions fausses de sa propre main (une baseline gonflée 3,5×, un levier « massif » mesuré à 24 ms, un `InitPlan` mal attribué). Une correction datée vaut mieux qu'une réécriture silencieuse : elle apprend quelque chose.

**Nommer les zones aveugles.** Un incident dont l'impact est inconnu s'écrit `null` + note, jamais 0.

## Rapport d'auto-réparation

Quand la réparation vient du pipeline plutôt que d'une main humaine, ajouter :

```
Déclencheur      : <alerte, règle, seuil>
Mécanisme choisi : <reconnect | resubscribe | refresh | retry | replay | refetch | invalidation | correctif de code>
Réinjection      : <la panne a-t-elle été remise ? résultat>
Convergence      : <vérifiée en base ? entre quels appareils ?>
Décision         : appliqué | proposé non appliqué | REFUSÉ (<motif de sécurité>)
Temps de résolution : <détection → preuve>
```

**« REFUSÉ » est une issue légitime et doit apparaître dans le rapport** — un pipeline qui n'a jamais refusé n'a pas de garde-fou, il a une rampe.

## Critères de réussite

- Registre et vue humaine à jour et cohérents.
- Preuve avant **et** après citées littéralement.
- Statut exact (`FIXED_LOCALLY` ≠ `CLOS`).
- Risque résiduel écrit.

## Critères d'échec

- Un `CLOS` sans vérification en production.
- Une preuve résumée (« ça marche ») au lieu d'être citée.
- Un impact estimé plutôt que mesuré ou déclaré inconnu.

## Format de résultat

Le bloc JSON ci-dessus, plus une ligne de tableau dans `PASSIO_MASTER_CONTROL.md`, plus l'entrée datée du journal.
