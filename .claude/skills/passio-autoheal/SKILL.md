---
name: passio-autoheal
description: "Incident du signal à la preuve : cause racine, correctif, réinjection du défaut, non-régression. Dire : répare, incident."
---

# /passio-autoheal — Un incident n'est clos que par une preuve

**Un correctif non réinjecté n'est pas un correctif prouvé, c'est un correctif espéré.**

Déclencheurs : une erreur de `client_errors`, de la Sentinelle ou d'un utilisateur ; un test rouge ou flaky ; une anomalie dans `/api/diagnose` ou l'onglet Intégrité — et avant de déclarer « corrigé » quoi que ce soit.

## Le pipeline

| # | Étape | L'essentiel |
|---|---|---|
| 1 | **DÉTECTER** | partir d'un fait → [`detection.md`](references/detection.md) |
| 2 | **EMPREINDRE** | 100 personnes touchées = **un** incident → *idem* |
| 3 | **CLASSIFIER** | grille critical → low, décompte réel d'appareils → *idem* |
| 4 | **REPRODUIRE** | le test **d'abord**, vu **rouge** (ci-dessous) |
| 5 | **CAUSE RACINE** | 3 causes récurrentes → [`causes-racines.md`](references/causes-racines.md) |
| 6 | **RÉPARER** | copier le chemin déjà correct ; interdits absolus → *idem* |
| 7 | **RÉINJECTER** | remettre le défaut, voir le test rougir (ci-dessous) |
| 8 | **NON-RÉGRESSION** | audits statiques + suite (ci-dessous) |
| 9 | **RAPPORTER** | `passio-incident-report` — squelette : [`rapport.md`](references/rapport.md) |

### 4 — Reproduire, avant toute hypothèse de cause

`npx playwright test tests/e2e/<nouveau>.spec.js` — conventions : `tests/e2e/`, `gate-helper.js` pour le code d'accès, `PASSIO_E2E_MULTI=1` pour le cross-compte réel. **Défaut non reproduit → ne pas corriger** : un correctif invérifiable n'ajoute que du risque.

### 7 — Réinjecter, l'étape qui distingue ce skill

```bash
npx playwright test tests/e2e/<spec>.spec.js   # vert AVEC le correctif
# retirer le correctif (édition manuelle, ou git stash du seul hunk)
npx playwright test tests/e2e/<spec>.spec.js   # DOIT être rouge
# remettre le correctif, revérifier le vert
```

Vert sans le correctif = **test creux**, à réécrire. Citer les **deux** exécutions. Pourquoi cette étape existe (les deux pièges du 2026-08-16) : [`preuve.md`](references/preuve.md).

### 8 — Non-régression : voisins puis suite

```bash
node --check js/*.js && npm run audit:globals && npm run audit:handlers && npm run audit:echappement && npm run audit:tests
npx playwright test
PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite   # si cross-compte
```

## Dire STOP plutôt que livrer

Défaut non reproduit → documenter, ne pas corriger · test vert sans le correctif → il ne compte pas · cause racine inconnue → mitiger et rapporter, jamais masquer le symptôme · correctif touchant RLS / auth / validation → `passio-security-guard` + revue, jamais en direct.

Critères de clôture et format de sortie : [`rapport.md`](references/rapport.md).
