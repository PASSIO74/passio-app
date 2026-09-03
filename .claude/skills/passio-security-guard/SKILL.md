---
name: passio-security-guard
description: "Garde-fou sécurité : RLS, auth, isolation des comptes, PII, secrets — et REFUSE tout correctif qui ouvre une porte."
---

# /passio-security-guard — Le droit de dire non

Deux emplois : **vérifier** une frontière de sécurité, et **refuser** un correctif qui la déplacerait. Le second prime : un pipeline d'auto-réparation qui n'a pas le droit de refuser finit par « corriger » en ouvrant une porte.

## Les correctifs interdits — sans exception ni dérogation

Quel que soit le problème qu'il prétend résoudre, un correctif est **refusé** s'il : ouvre, assouplit ou supprime une **policy RLS** · contourne l'**authentification** ou forge une identité · expose **`service_role`** côté client ou dans un log · désactive une **validation** ou un garde-fou · **avale une erreur** (`catch` muet, `{ error }` ignoré) · supprime ou affaiblit un **test** · désactive le **monitoring** ou la télémétrie · **supprime des données** pour faire disparaître un symptôme · écrit une **donnée personnelle** dans un log ou un rapport.

En cas de doute : **MITIGER → FEATURE FLAG → ISOLER → ROLLBACK → RAPPORTER.** Jamais « corriger vite ».

Justification de chaque ligne, et leur câblage dans le pilotage (`repair.js`, liste blanche de chemins, « PAS DE CORRECTIF SÛR » comme réponse valide) : [`interdits.md`](references/interdits.md).

## Vérifier les frontières

```bash
npx playwright test tests/e2e/authz-critical.spec.js   # 13 invariants, non skippable
```

Il vérifie par **appels REST bruts** : l'interface testerait la politesse du client, pas la RLS. **Toute nouvelle frontière de confiance y ajoute un invariant.**

⚠️ **Un refus RLS ne lève pas** : un UPDATE/DELETE refusé renvoie **200 avec 0 ligne touchée**. Asserter le décompte de lignes, jamais l'absence d'exception.

⚠️ **RLS activée ne veut pas dire correcte** : `notifications` était scellée en lecture mais son INSERT valait `true` (`NOTIF-FORGE-009`). Lire les policies, pas seulement leur existence.

Requête d'audit des 34 tables, détail du gate, filtrage PII/secrets (`telemetry.js`, `correlation_id`, téléphone) et sandbox des agents : [`frontieres.md`](references/frontieres.md).

## Avant de valider un changement à risque

Auth/identité, RLS/migration, affichage de contenu d'autrui, PII, paiement, modération → `npm run revue` (dossier pour un relecteur tiers en lecture seule) + subagent `passio-red-team`.

## Réussite / échec

✅ 0 table sans RLS, 0 policy permissive non justifiée · gate `authz-critical` vert, et enrichi si une frontière a bougé · aucun secret ni PII dans les artefacts · tout refus de correctif **écrit** avec son motif.

🛑 Refuser et remonter : un correctif figurant dans la table des interdits · une policy modifiée sans test d'intrusion joint · un correctif de sécurité appliqué sans revue tierce.

Format de résultat d'un contrôle : [`frontieres.md`](references/frontieres.md).
