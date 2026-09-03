---
name: e2e-multi
description: "Tests end-to-end multi-comptes en base réelle : policies RLS, livraison realtime cross-compte, e2e réel."
---

# /e2e-multi — Tests multi-comptes réels

Ces tests inscrivent 2 vrais comptes Supabase (e-mail jetable `@passio-e2e.test`), échangent en base RÉELLE, et valident ce qu'aucun test mono-compte ne peut voir : policies RLS, triggers, colonnes lat/lng, livraison realtime.

## Lancer

```
npx playwright install chromium
```
puis (opt-in, sinon la suite est sautée) :
```
PASSIO_E2E_MULTI=1 npm test
```

Cibler un test précis :
```
PASSIO_E2E_MULTI=1 npm test -- -g "notifications"
```
Choisir la version realtime : `PASSIO_E2E_RT=v3` (défaut) ou `v2`.

Sous PowerShell (Windows), utiliser :
```
$env:PASSIO_E2E_MULTI="1"; npm test
```

## Ce que ça couvre
Messagerie texte + vocal, notifications + réactions cross-compte, événement IRL (RSVP/liste d'attente/co-organisateur), story + bobine, CDV Live + carnet co-écrit, policies RLS de confidentialité.

## Pièges de lecture (cf. CLAUDE.md)
- Un stub `supaUpdate*` qui renvoie `null` fait échouer à tort le chemin « notification après édition » → stubber `true`.
- La carte est initialisée en différé puis recadrée → attendre que le zoom se **stabilise** (2 mesures identiques) avant de comparer.
- Un UPDATE qui touche **0 ligne en silence** (RLS) est LE bug que seuls ces tests attrapent.

## Après coup
- Les comptes jetables restent dans `auth.users`. Purge périodique — c'est une **écriture de données**, donc le canal ② d'ADR-012 (PostgREST via `configAdmin()`), jamais le connecteur de lecture, qui la refuserait :
  ```
  npm run purge:e2e:rest
  ```
  Il porte l'équivalent de `DELETE FROM auth.users WHERE email LIKE '%@passio-e2e.test'` — écrit ici en prose, et non dans le bloc : une ligne de SQL nu sous une commande copiable se copie avec elle.
  (supprimer d'abord conv_members / conv_messages / profiles qui ont une FK).
- Rapporter le nombre de tests verts / rouges et, si rouge, la cause racine (pas juste « ça a planté »).
