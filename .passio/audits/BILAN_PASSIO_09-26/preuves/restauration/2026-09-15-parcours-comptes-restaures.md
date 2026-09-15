# EXP-01 — parcours de trois comptes RESTAURÉS sur base vide (staging, 2026-09-15, ~12:10 UTC)

Après `restaurer-donnees.js` sur le staging **purgé** (0 ligne, 0 compte, 0 objet), preuve
`2026-09-15-cible-vide.json` : `prouvee: true`, 0 écart, 41 tables au contenu identique,
10/10 comptes, 67/67 médias (taille et empreinte). Puis, pour chaque compte, la voie
prévue quand les mots de passe ne sont pas dans l'archive : `generate_link` (service_role,
magiclink) → `POST /auth/v1/verify` → jeton → lectures par l'API de l'application (clé anon
+ jeton du compte, RLS active), comparées à l'archive. Identifiants tronqués, e-mails
réduits au domaine.

| compte | profil | publications (archive / lues) | conversations | user_state | médias lus (HEAD, seau public) |
|---|---|---|---|---|---|
| 20762060… (@ladamemetallerie.com) | « ben test ordi », 15 passions | 21 / 21 | 3 / 3 | 1 / 1 | — (aucune publication avec média) |
| d59aaaa3… (@bbeje.com) | « Ben sur portable », 3 passions | 11 / 11 | 1 / 1 | 1 / 1 | `videos/…/reel_x6em6mrbnmst0s7h1.mp4` 200, 1 560 557 o · `photos/…/x20fwbp78mst0sufy.webp` 200, 154 500 o |
| 6902826f… (@gmail.com) | « Ben sur portable test », 16 passions | 0 / 0 | 3 / 3 | 1 / 1 | — |

Les trois parcours rendent `ok: true` (script `parcours-restaure.mjs`, scratch — reproduit
dans `docs/RECUPERATION.md`). Le staging a ensuite été **purgé** de nouveau ; seuls les
référentiels (`passions`, `passion_relations`, `access_policies`) ont été reversés.
