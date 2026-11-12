# 05 — Résultats des vérifications (2026-11-10)

> Chaque ligne : commande, cible, SHA, heure (UTC), résultat, et la NATURE de la preuve.
> Poste : Windows 11, Node 24.16, Playwright 1.65 (Chromium 1254, WebKit 2388). Journaux : dossier privé, `preuves/`.

## Avant tout changement — SHA `4e1d8ed1`

| # | Contrôle | Nature | Cible | Heure | Résultat |
|---|---|---|---|---|---|
| V1 | `git ls-remote origin refs/heads/main` | état du dépôt | GitHub | 16:02 | `4e1d8ed1` |
| V2 | `curl …/release.json` | service déployé | production | 16:11 | commit `4e1d8ed1`, buildId `3d8e98bb12ad` |
| V3 | `node scripts/build.js` + sha384 des 9 scripts | vérification du build | local ↔ page de production | 16:12 | 9 / 9 identiques à l'octet |
| V4 | build + `html-minifier-terser` + `clean-css` (mêmes options que `deploy.yml`) puis sha256 | vérification du build | local ↔ production | 17:10 | page (391 004 octets), `styles.css` (231 511), `sw.js` (29 547) : **identiques à l'octet** |
| V5 | `npm run verif` | analyse statique | worktree | 16:07 | vert, 125 s |
| V6 | `npm run test:unit` | tests unitaires | worktree | 16:09 | 1 038 / 1 038 |
| V7 | `npx playwright test --project=local` (6 workers, poste chargé par 8 agents) | test navigateur, serveur **simulé** | worktree, port 8137 | 16:13 → 17:18 | 2 587 : 2 560 verts, 11 sautés, 16 rouges |
| V8 | `--last-failed --workers=2` | idem | idem | 17:19 | **16 / 16 verts** : les rouges de V7 venaient de la charge du poste |
| V9 | `SHOW transaction_read_only` (canal ①) | catalogue de production | production | 16:10 | `on`, rôle `supabase_read_only_user` ; `SET ROLE` refusé |
| V10 | `get_advisors` sécurité | catalogue de production | production | 16:13 | 0 ERROR |
| V11 | sonde anonyme, `GET` sur 57 relations | intégration serveur réelle | production | 16:33 | 13 lisibles (contenu public), 20 à 0 ligne, 24 refusées ; `events.address` / `contact` refusés |
| V12 | CI du commit, run 42831070685 | CI | staging + production | 14:09 → 14:26 | tous les jobs verts ; 21 / 24 sur le staging (3 sautés) ; `authz-critical` 1 / 1 sur la production (sous-cas 12c sauté) |

## Reproductions

| # | Défaut | Nature | Résultat |
|---|---|---|---|
| R1 | STAB-01 : 9 `load` rejoués sur l'artefact de production reconstruit | test navigateur, Chromium | 9 erreurs, au message de la production |
| R2 | STAB-02 : attribut `onload` réel sur une image détachée | test navigateur, Chromium et WebKit | erreur au message exact de la production (WebKit) |
| R3 | CLI-01 : code d'avant, serveur simulé | test navigateur, Chromium | le gestionnaire du bouton « Suivre » est celui de la valeur reçue ; un toucher l'exécute |

## Après changement

| Lot | Contrôle | Résultat |
|---|---|---|
| #822 (chargeur) | cas ⑨ avant / après | rouge (18 erreurs) / vert |
| | `app-scripts-par-fichier`, `version-skew`, `dist-build` — Chromium | 20 verts, 4 sautés |
| | `app-scripts-par-fichier` — WebKit | 10 / 10 |
| | gates artefact + fumée, `PASSIO_CIBLE=dist`, scripts minifiés | 12 / 12 |
| | `npm run verif` | vert |
| #823 (profil visité) | 3 cas avant / après | 3 rouges / 3 verts |
| | mutation (`app-04` d'avant) | ① ② rouges |
| | 36 suites voisines, 344 tests | 343 verts ; le 344ᵉ rougi par un commentaire, reverdi sans toucher au test |
| | `npm run verif` | rouge une fois (le gate des gestionnaires lisait un commentaire), puis vert |
| #824 (robustesse client) | couverture : mutation / après | ① rouge / 2 verts |
| | 7 suites voisines | 50 / 50 ; arbre git propre après la suite des captures |
| | `npm run verif` | vert |

## Ce qui n'a PAS été exécuté

- La suite navigateur sur la **réplique exacte de la production** (V4 la rend possible : `outils/servir-exact.mjs`) — non lancée.
- Aucune suite à comptes réels depuis ce poste (pas de clé de service ; c'est voulu).
- Aucun test de charge, aucun appareil réel, aucune restauration, aucun retour arrière, aucun envoi d'e-mail.
- La CI des trois PR : en cours ou à lire — voir l'état des PR sur GitHub, pas ce fichier.
