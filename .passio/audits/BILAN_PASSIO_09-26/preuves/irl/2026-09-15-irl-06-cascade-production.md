# IRL-06 — la suppression d'une activité emporte les lignes d'AUTRUI, en production (2026-09-15, ~14:45 UTC)

Astra (fiche 21) : « FK cascade lues dans la migration ; effet réel sur la cible non vérifié ». Mesuré
sur la PRODUCTION (`njkiyoklssvefstljemx`) puis sur le staging, avec trois comptes jetables majeurs
déclarés (organisateur, inscrit, tiers), sessions par lien magique, purge dans un `finally` relue
(0 profil, 0 compte, 0 événement restants). Script : `preuve-irl06.mjs` (scratch), lancé par
`preuve-prod.mjs`.

Relu en base avant l'exercice (canal ①) : `event_attendees`, `event_comments`, `event_reactions`,
`event_checkin_secrets` portent chacune `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE` ;
orphelins `{att: 0, com: 0, rea: 0}`.

| Étape | Résultat |
|---|---|
| L'inscrit (pas l'organisateur) s'inscrit `going`, commente, réagit 🔥 | 201 / 201 / 201 — avant suppression : 1 inscription, 1 commentaire, 1 réaction, **1 secret de pointage** (posé par le trigger) |
| Un **tiers** fait `DELETE /rest/v1/events?id=eq.<ev>` | 200, **0 ligne** touchée (RLS « Suppression propre ») — l'activité et ses lignes restent |
| L'**organisateur** fait le même `DELETE` | 200, **1 ligne** |
| Relecture `service_role` des quatre tables filles + `events` | **0 / 0 / 0 / 0 / 0** — les lignes d'autrui sont parties avec le parent, sans aucune écriture de l'organisateur sur les tables filles |
| Même exercice sur le staging | identique |

Ce qui n'est pas mesuré ici : la notification aux inscrits (`_prevenirSuppressionActivite`, côté
client de l'organisateur — verrou e2e `suppression-activite.spec.js`), et le parcours à l'écran.
