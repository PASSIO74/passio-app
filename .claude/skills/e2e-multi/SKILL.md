---
name: e2e-multi
description: Lance la suite de tests end-to-end multi-comptes PASSIO (la seule preuve possible des policies RLS et de la livraison realtime cross-compte, invisibles des tests mono-compte). À utiliser quand Benjamin veut valider du cross-compte, une policy RLS, du realtime, ou dit "test multi-comptes", "e2e réel", "vérifie en base".
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
- Les comptes jetables restent dans `auth.users`. Purge périodique :
  ```
  supabase db query --linked "DELETE FROM auth.users WHERE email LIKE '%@passio-e2e.test'"
  ```
  (supprimer d'abord conv_members / conv_messages / profiles qui ont une FK).
- Rapporter le nombre de tests verts / rouges et, si rouge, la cause racine (pas juste « ça a planté »).
