---
name: passio-autoheal
description: Conduit un incident PASSIO du signal brut à la preuve de réparation — détection, corrélation, empreinte, classification, impact, reproduction, cause racine, correctif, RÉINJECTION du défaut, vérification, non-régression, rapport. À utiliser dès qu'un défaut est soupçonné ou signalé (erreur prod, alerte Sentinelle, plainte utilisateur, test rouge), et pour toute réparation qui doit être PROUVÉE et pas seulement plausible.
---

# /passio-autoheal — Un incident n'est clos que par une preuve

## La règle qui fonde ce skill

**Un correctif non réinjecté n'est pas un correctif prouvé, c'est un correctif espéré.**

Le 2026-08-16, deux pièges de vérification ont fait croire à un **succès** là où il n'y en avait pas : un test qui recopiait les deux lignes du correctif qu'il était censé garder (il serait resté vert après suppression du correctif), et une couverture V8 additionnée à plat qui annonçait 100 %. Ces pièges-là ne se signalent jamais seuls.

D'où l'étape non négociable de ce workflow : **remettre le défaut, voir le test redevenir rouge.** Un test qui ne rougit pas sans le correctif ne garde rien.

## Quand l'utiliser

- Une erreur remonte de `client_errors`, de la Sentinelle, ou d'un utilisateur.
- Un test devient rouge ou flaky.
- Une anomalie apparaît dans `/api/diagnose` ou l'onglet Intégrité du pilotage.
- Avant de déclarer « corrigé » quoi que ce soit.

## Le pipeline, étape par étape

### 1. DÉTECTER — partir d'un fait, pas d'une impression

```bash
# erreurs client de production
supabase db query --linked "select message, count(*) n, max(created_at) dernier from client_errors where created_at > now() - interval '7 days' group by 1 order by n desc limit 20;"
```

Sources : `client_errors`, `telemetry_events` (type `error`), onglet Sentinelle, `/api/diagnose`.

⚠️ **Angle mort structurel de la Sentinelle** : elle ne voit que ce qui déclenche une alerte. « Aucun diagnostic » ne veut jamais dire « tout va bien » — une panne silencieuse ou une télémétrie interrompue ne produit aucun signal. Chercher aussi les **absences** (§ `passio-sync-audit`).

### 2. CORRÉLER puis EMPREINDRE

Un défaut qui touche 100 personnes doit produire **un** incident, pas 100. L'empreinte se compose de : message d'erreur normalisé (nombres et ids retirés) + endpoint + action + code DB + version applicative. Garder le **décompte réel** d'utilisateurs et d'appareils distincts — c'est lui qui donne la sévérité, pas le nombre de lignes.

### 3. CLASSIFIER et MESURER L'IMPACT

| Sévérité | Critère |
|---|---|
| **critical** | perte de données, fuite cross-compte, écriture sous identité d'autrui |
| **high** | action utilisateur perdue en silence, convergence jamais atteinte |
| **medium** | dégradation visible mais récupérable au rechargement |
| **low** | cosmétique, ou auto-réparant au cycle suivant |

⚠️ Un défaut **auto-réparant au cycle suivant** est le plus dangereux à classer : il ne se signale jamais comme une perte. `FEED-RT-007` (post temps réel affiché puis effacé) est resté invisible pour cette raison exacte.

### 4. REPRODUIRE — avant toute hypothèse de cause

Écrire le test **d'abord**, et le voir **rouge**. Conventions maison : `tests/e2e/`, `gate-helper.js` pour déverrouiller le code d'accès, `PASSIO_E2E_MULTI=1` pour le cross-compte réel.

```bash
npx playwright test tests/e2e/<nouveau>.spec.js
```

Si le défaut ne se reproduit pas : ne pas corriger. Un correctif sur un défaut non reproduit ne peut pas être vérifié — et il ajoute du risque pour zéro preuve.

### 5. CAUSE RACINE — pas le symptôme

Trois causes récurrentes sur ce dépôt, à écarter avant d'en chercher une quatrième :

- **Écriture qui échoue en silence** : le SDK Supabase ne lève pas sur un refus RLS. Sans lire `{ error }`, l'action reste « réussie » à l'écran et disparaît au rechargement.
- **Survivant d'un correctif partiel** : la classe est déjà connue et traitée ailleurs. Lancer `chercher-survivants`.
- **Catch large** : `catch(e){return [];}` masque un `ReferenceError` (bug `diagLog` = fil vide pendant 6 jours).

### 6. RÉPARER — en copiant le chemin déjà correct

Le traitement juste existe presque toujours ailleurs dans le dépôt. L'aligner dessus plutôt qu'inventer une troisième variante. `FWD-SILENT-010` s'est corrigé en recopiant ce que le chemin d'envoi principal faisait **vingt lignes plus bas dans le même fichier**.

**Interdits absolus** (§36 de la charte de mission) — jamais « réparer » en ouvrant une RLS, en contournant l'auth, en exposant `service_role`, en supprimant une validation, en ignorant une erreur, en supprimant un test, ou en désactivant le monitoring. En cas d'incertitude : **mitiger → isoler → rapporter**, pas corriger à l'aveugle.

### 7. RÉINJECTER — l'étape qui distingue ce skill

```bash
# 1. le test est vert avec le correctif
npx playwright test tests/e2e/<spec>.spec.js

# 2. retirer le correctif (édition manuelle, ou git stash du seul hunk)
# 3. relancer : le test DOIT être rouge
npx playwright test tests/e2e/<spec>.spec.js

# 4. remettre le correctif, revérifier le vert
```

**Si le test reste vert sans le correctif, le test est creux.** Le réécrire — il ne garde rien. `npm run audit:tests` attrape une partie de ces cas en CI, pas tous.

Écrire dans le rapport le **résultat des deux exécutions**, pas seulement du vert final.

### 8. NON-RÉGRESSION — voisins puis suite

```bash
node --check js/*.js
npm run audit:globals && npm run audit:handlers && npm run audit:echappement && npm run audit:tests
npx playwright test                                    # suite par défaut
PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite   # si le défaut touche le cross-compte
```

### 9. RAPPORTER

Passer la main à `passio-incident-report`, qui impose le format et l'inscription au registre.

## Critères de réussite

- Le défaut est reproduit par un test **avant** correction.
- Le test est **rouge sans le correctif**, vert avec — les deux exécutions sont citées.
- Les audits statiques et la suite voisine sont verts.
- Le scénario est conservé comme test permanent dans `tests/e2e/`.
- L'incident est inscrit dans `passio_qa_registry.json` avec sa preuve.

## Critères d'échec — dire STOP plutôt que livrer

- Le défaut ne se reproduit pas → **ne pas corriger**, documenter la tentative.
- Le test reste vert sans le correctif → le test est creux, il ne compte pas.
- La cause racine reste inconnue → mitiger et rapporter, ne pas masquer le symptôme.
- Le correctif touche la RLS, l'auth ou une validation → passer par `passio-security-guard` et une revue, jamais en direct.

## Format de résultat

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
