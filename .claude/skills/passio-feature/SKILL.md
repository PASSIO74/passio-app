---
name: passio-feature
description: "Feature transverse ou sensible : produit, archi, DB/RLS, UX, tests, télémétrie. Dire : construis, développe X."
---

# /passio-feature — Feature de A à Z

Séquence standard. Adapter la profondeur à la complexité (une petite feature saute les étapes non pertinentes ; une feature sensible les fait toutes). **Ne pas s'arrêter pour demander d'autorisation** (autonomie totale, cf. `CLAUDE.md`) — choisir, appliquer, aller au bout.

## 0. Cadrage (produit)
- À quel pilier produit / au multi-profil ça se rattache ? (`.passio/context/PASSIO_CONTEXT.md`, `MULTI_PROFILE.md`, `PRODUCT_PRINCIPLES.md`).
- MVP vs plus tard : écrire ce qui est nécessaire **maintenant**. Éviter l'over-engineering (§69).

## 1. Architecture & modèle de données
- Où vit le code ? (rappel : `app-01..09`, hoisting, pas de modules ES, pas de collision de globals).
- Nouvelles données ? → concevoir tables/colonnes/RLS. **Lancer le subagent `migration-checker`** (schéma prod RÉEL ≠ repo) avant toute migration. Timestamps `timestamptz` par défaut, jamais base64 en DB.

## 2. Sécurité & confidentialité (obligatoire si contenu/identité)
- RLS par propriétaire ; UPDATE/DELETE 0-ligne = policy manquante.
- Frontières multi-profil (les 10 questions de `MULTI_PROFILE.md`).
- Échappement 3-helpers pour tout affichage de contenu tiers.

## 3. Implémentation
- Code vanilla cohérent avec l'existant (`$()`/`$$()`, guards `if(!el)return;`, `toast()`, `findPostAnywhere`, `supaTs`).
- Realtime : canal unique, respect RLS. Média → Storage (+ downscale).
- Guards de rendu : invalider `_feedDomSig`/`_lastHtml` si on écrit dans les zones concernées.

## 4. Télémétrie
- Instrumenter l'action clé via `telemetry-event` (passer par le filtre PII de `js/telemetry.js`).

## 5. Tests
- `node --check js/*.js` + `node scripts/build.js /tmp/t.html`.
- Ajouter/adapter une spec Playwright (`new-test`). Cross-compte/RLS/realtime → `e2e-multi` (seule preuve possible).
- `npm run audit:globals` + `npm run audit:handlers`.

## 6. Perf
- Si chemin chaud (feed, boot, upload) → passe `perf`.

## 7. Revue adversariale (si feature majeure)
- Feature sensible (auth, RLS, multi-profil, upload, paiement, modération) → subagent `passio-red-team`, traiter les P0/P1.

## 8. Revue & livraison
- `review` (→ `audit-passio`), puis `ship` (build + tests + commit + push = déploiement Netlify).

## 9. Doc & mémoire
- Mettre à jour la fiche `docs/PIEGES_CONNUS.md` si un nouveau piège émerge ; consigner une décision structurante en ADR (`.passio/adr/`).

## Definition of Done
Voir `.passio/context/ENGINEERING_PRINCIPLES.md` § DoD. **Preuve, pas affirmation.**
