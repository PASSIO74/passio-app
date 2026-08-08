# Stratégie de test PASSIO

> Référencée par `PASSIO_REPOSITORY_AUDIT.md` §5. Ce que l'on prouve, et comment.

## Ce qui EST couvert

Playwright e2e (`tests/e2e/`, ~15 specs) + audits statiques :

- **Smoke** & **access-gate** (helper `gate-helper.js` déverrouille le code).
- **Feed** : ranking (`rankFeedPosts`), tolérance aux posts malformés.
- **IRL** (événements), **CDV** (carnets), navigation, contextual-nav, interactions, profils-types.
- **Multi-comptes** : la **seule** preuve possible des policies RLS et de la livraison realtime cross-compte (invisibles des tests mono-compte). Skill `/e2e-multi`.
- **dist-build** : le monolithe assemblé se charge.
- **Audits CI** : `npm run audit:globals` (collisions `window`), `npm run audit:handlers` (onclick → fonction existante).

## Lacunes connues (à combler — cf. roadmap P1)

- Parcours sensibles **partiellement** couverts : suppression de compte, changement de confidentialité, blocage bout-en-bout, accès cross-profil.
- Pas de tests de **charge** (relève du SCALE_RUNBOOK, à déclencher sur trigger).
- Régressions de **sécurité** à formaliser en specs (ownership, autorisation, contenu privé).

## Règles de rédaction (pièges connus)

- Toujours passer par `gate-helper.js` pour franchir le code d'accès.
- `state` **n'est pas** sur `window` : tester `typeof state !== "undefined"` dans tout code évalué dans la page (un garde `window.state` fait échouer une suite en silence).
- Les tests multi-comptes créent de vrais comptes → purge via `npm run purge:e2e`.

## Commandes

```bash
npx playwright install chromium   # une fois
npm test                          # suite e2e
npm run audit:globals             # collisions de globals
npm run audit:handlers            # handlers onclick fantômes
```

Skills associés : `/test`, `/e2e-multi`, `/new-test`. Subagent de relecture : `audit-passio`.
