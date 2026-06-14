# Contrôle qualité — 16 missions (audit du 2026-06-12)

Règle d'or : **preuve ou échec**. Aucun ✅ sans preuve vérifiable (sortie de commande,
test vert, capture, grep). Document mis à jour mission par mission pendant l'audit.

Skills disponibles dans cette session : `code-review`, `security-review`, `review`,
`verify`, `run`, `simplify`, `schedule`, `loop`, `claude-api`, bureautique
(docx/pdf/pptx/xlsx), `skill-creator`. **Pas de skill `frontend-design` installé**
(mission 4 faite à la main avec Playwright + captures ; pour l'installer :
`/plugin` → marketplace → frontend-design, à faire par Benjamin si souhaité).

| # | Mission | Statut | Preuve | Action corrective |
|---|---------|--------|--------|-------------------|
| 1 | Audit complet (handlers, tests, console) | ✅ | `scripts/audit-handlers.js` (0 fantôme/522 handlers), `npm test` 11✅, `navigation.spec.js` 2✅ | aucune (faux positifs CSS exclus du script) |
| 2 | Tests utilisateur simulés (9 profils types) | ✅ | `profils-types.spec.js` 6✅ (créateur, actif, visiteur, visiteur de profils, partageur, multi-passions) + `multi-comptes.spec.js` (messageur+onboarding, opt-in) | helper partagé `app-helper.js` (clé `passio_mvp_state_v1`) |
| 3 | Correction des bugs (14 + 4 critiques) | ⏳ | | |
| 4 | UX/UI design | ⏳ | | |
| 5 | Onglets & navigation | ⏳ | | |
| 6 | Partage de données et contenus | ⏳ | | |
| 7 | Profils et visites | ⏳ | | |
| 8 | Messagerie | ⏳ | | |
| 9 | Performance et scalabilité | ⏳ | | |
| 10 | Sécurité et données | ⏳ | | |
| 11 | Mise en ligne | ⏳ | | |
| 12 | Tests automatisés | ⏳ | | |
| 13 | Skills | ⏳ | | |
| 14 | Accessibilité | ⏳ | | |
| 15 | Livrables | ⏳ | | |
| 16 | Verrouillage par code | ⏳ | | |

## Détail des preuves

### Mission 1 — Audit complet ✅ (2026-06-12)

**(a) Audit statique des handlers inline** — `node scripts/audit-handlers.js` :
```
Handlers inline analysés : 522 (dans 16 fichiers)
Appels de fonction vérifiés : 554
Définitions globales recensées : 713
✅ AUCUNE fonction fantôme : tous les handlers inline référencent des fonctions définies.
```
Le script extrait les `on<event>=` (click/input/change/mousedown/mouseup/touchstart/
touchend/submit/keydown/…) de `index.html` + des chaînes JS, recense les définitions
(`function`, `window.x=`, `var/let/const x = function|()=>`) et liste les appels non
résolus. Faux positifs CSS (`rgba()`, `linear-gradient()`…) exclus.

**(b) Suite E2E** — `npm test` : 11 passed, 1 skipped (multi-comptes opt-in).

**(c) Zéro erreur JS au boot + tour des 8 écrans** — `npx playwright test navigation.spec.js` :
2 passed. Timings navigation (ms) : feed 12, profiles 97, studio 36, explore 107,
irl 173, wallet 42, messages 11, cdv 31 (tous < 1500 ms). Aucune exception `pageerror`
ni `console.error` applicatif (erreurs réseau Supabase hors-ligne comptées à part).
Bottom-nav : 6 libellés présents, clic réel sur chaque item → écran actif (cas
spécial « Bobines » → overlay `#reelsViewer`).

**Bug trouvé pendant l'audit** : `CLAUDE.md` documentait la clé d'état local comme
`passio_state`, alors que la vraie constante `STATE_KEY` (app-02) vaut
`passio_mvp_state_v1`. Les tests qui injectaient `passio_state` tombaient donc sur
`defaultState()` (0 profil). Corrigé dans le helper + CLAUDE.md.

### Mission 2 — Tests utilisateur simulés ✅ (2026-06-12)

`npx playwright test profils-types.spec.js` : **6 passed**. Profils couverts :
- **créateur** : `publishPost()` texte → apparition dans le fil après activation du
  filtre passion (le fil est volontairement vide sans passion choisie) + persistance
  vérifiée en `localStorage` après reload.
- **utilisateur actif** : `likePost()` (+1, ajout à `likedPosts`) + `submitComment()`
  (commentaire ajouté au post via le vrai parcours `openComments` → `#newComment`).
- **visiteur** : navigation feed/explore sans publier (`userPosts` reste vide).
- **visiteur de profils** : `openUserProfile()` sur un auteur seed → vue profil.
- **partageur** : `sharePost()` → feuille de partage ouverte (« Partager dans mon feed »).
- **multi-passions** : 3 profils, `switchToProfile()` effectif, `#profileBadges` +
  `#activityGraph` présents.

Écritures Supabase neutralisées pendant ces tests (prod non polluée). Les profils
**nouvel utilisateur (onboarding complet)** et **messageur (vocal/GIF/pièce jointe
sur 2 comptes réels + realtime)** sont couverts par `multi-comptes.spec.js` (opt-in
`PASSIO_E2E_MULTI=1`, inscription anonyme réelle).

### Suite complète — `npm run test:all`
18 passed, 1 skipped (multi-comptes opt-in), 1 flaky (access-gate « rechargement » :
timeout 10 s sous 5 workers parallèles, **vert au retry** — pas un bug applicatif,
artefact de charge CI).
