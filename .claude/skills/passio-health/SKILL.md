---
name: passio-health
description: "Santé technique sur preuves exécutées : build, syntaxe, e2e, audits, migrations. Dire : tout est vert ?, c'est livrable ?"
---

# /passio-health — Santé technique (preuves réelles)

Produire un dashboard concis. **Chaque ligne = une commande exécutée + son résultat.** Jamais de statut inventé ; si non exécuté → marquer `NON VÉRIFIÉ`.

## Vérifs (exécuter)
| Ligne | Commande | Vert si |
|---|---|---|
| Syntaxe JS | `node --check js/*.js` | aucun échec |
| Build | `node scripts/build.js /tmp/passio-health.html` | build OK |
| Collisions globals | `npm run audit:globals` | 0 collision |
| Handlers onclick | `npm run audit:handlers` | 0 fantôme |
| Tests e2e | `npx playwright test` (ou cibler un spec) | tous verts |
| Schéma prod↔repo | subagent `migration-checker` | cohérent |
| Erreurs prod | skill `prod-errors` (lit `client_errors`) | pas de pic |
| Dépendances | `package.json` (revue) | rien de risqué |

## État git / livraison
`git status --short` + `git log --oneline -3`. Rappeler : **tout push `main` = déploiement Netlify** (discipline de commit).

## Sortie
```
PASSIO — Santé technique <date>
SYNTAXE      ✅/❌  <détail>
BUILD        ✅/❌
GLOBALS      ✅/❌
HANDLERS     ✅/❌
TESTS E2E    ✅/❌  (<n> passés)
SCHÉMA DB    ✅/⚠️/NON VÉRIFIÉ
ERREURS PROD ✅/⚠️
RISQUES OUVERTS : cf. .passio/context/KNOWN_RISKS.md (P0 : SMTP, URLs signées)
VERDICT LIVRAISON : GO / GO AVEC RISQUES / NO-GO — <justif.>
```

Pour un GO/NO-GO produit complet (privacy, a11y, rollback, monitoring), enchaîner avec la checklist de `docs/CHECKLIST_COMMERCIALISATION.md`.
