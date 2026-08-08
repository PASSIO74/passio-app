# Dette technique

> Pas un dépotoir de TODO vagues. Chaque item : description · impact · système · priorité · difficulté · trigger de résolution.

| Item | Impact | Système | Prio | Difficulté | Trigger |
|---|---|---|---|---|---|
| Fichiers app géants (`app-03` 257 Ko, `app-07` 274 Ko, `app-04` 250 Ko) | Coût cognitif, couplage caché | js/ | P2 | Moyenne (hoisting à préserver) | Avant grosse feature dans ces fichiers. |
| base64 legacy en DB (vocaux) | Coût/limites Storage vs DB | Supabase | P1 | Moyenne | Migration Storage planifiée. |
| Schéma prod↔repo non synchronisé | Requêtes 400, confusion | migrations/ | P1 | Faible-Moyenne | À chaque nouvelle migration. |
| `styles.css` monolithique (~301 Ko) | Parse CSS, maintenabilité | styles.css | P3 | Élevée | Si perf CSS devient hotspot mesuré. |
| Couverture tests parcours sensibles partielle | Régressions silencieuses (suppression, confidentialité) | tests/e2e | P1 | Moyenne | Avant activation grand public. |
| `commentLikeBtnHtml` = code mort (mémoire) | Bruit | app-04 | P3 | Faible | Prochaine passe refacto. |

Ne pas résoudre par réflexe : résoudre au trigger, pour éviter le churn.
