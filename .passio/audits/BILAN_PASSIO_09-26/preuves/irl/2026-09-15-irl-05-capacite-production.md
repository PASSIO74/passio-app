# IRL-05 — la capacité tient sous inscriptions CONCURRENTES, en production (2026-09-15, ~14:15 UTC)

Astra (fiche 21) : « contraintes et verrou présents dans la migration ; application effective et
concurrence sur la cible non vérifiables ici ». Mesuré sur la PRODUCTION (`njkiyoklssvefstljemx`,
trigger `trg_event_attendees_capacite` relu en base) avec huit comptes jetables majeurs déclarés
(`user_safety.majority_at`), sessions par lien magique (le captcha, allumé, ne garde pas `/verify`),
purge dans un `finally` et relue (0 profil, 0 compte, 0 événement restants). Script : `preuve-irl05.mjs`
(scratch), lancé par `preuve-prod.mjs`.

| Étape | Résultat |
|---|---|
| Activité à **3 places**, 8 `POST /rest/v1/event_attendees` (`rsvp = going`) lancés **en parallèle** | 289 ms au total ; **3 `going`**, **5 refusés** — tous `P0001 activite_complete`, jamais un 4ᵉ inscrit |
| Un refusé demande `waitlist` | 201 : la liste d'attente ne consomme pas de place |
| L'activité passe `cancelled` (capacité relevée à 10) ; le même compte redemande `going` | 400 `activite_annulee` |
| Même exercice sur le staging | identique (3 / 5, `activite_complete`, 201, `activite_annulee`) |

Observation à garder : un premier passage en production (avant l'ajout du `finally`) a rendu
`activite_introuvable` pour les huit — non reproduit sur les deux passages suivants ; cause non
établie (l'événement était bien en base : relu à 201 puis en SELECT). À surveiller dans
`client_errors` si un vrai utilisateur le rencontre.
