# MSG-01 / SUP-06 — l'invitation d'appel est attestée par la base, en production (2026-09-15, ~15:20 UTC)

Ordre tenu : client #447 servi d'abord (`app.js?v=b69876cb80` porte `_callDeposerInvitation` et
`call_invites`), migration `migration_appels_invitations_attestees_2026-09-15.sql` ensuite
(`npm run migration:appliquer`, 7 OK, journal #6). Relu en base (canal ①) : `call_invites` avec trois
policies (`insert_propre` / `update_propre` : `from_id = auth.uid() and appel_autorise(to_id)` ;
`select_siennes` : émetteur ou destinataire), triggers `trg_call_invites_figes` et
`trg_call_invites_sonner`, `passio_rt_emettre` sans `ring:%`, cron `purge_call_invites` 04:17.

Preuve comportementale (`preuve-msg01-prod.mjs` via `preuve-prod.mjs`) : trois comptes jetables A, B, C
(A et B partagent un 1:1, C non), sessions par lien magique, B abonné à `ring:<B>` par un vrai
WebSocket Realtime (canal privé, son jeton), purge dans un `finally` relue (0 restant).

| Étape | Résultat |
|---|---|
| A insère `call_invites {from_id: A, to_id: B, kind: voice}` | 201 ; **B reçoit** `{ callId, from: A, kind: voice, atteste: true }` sur `ring:<B>` — émis par le trigger, pas par un client |
| C (aucune conversation avec B) insère | 403 `42501` |
| A signe `from_id: C` | 403 `42501` |
| A émet lui-même un broadcast REST sur `ring:<B>` (`callId: forge`) | 202 accepté par l'API, **jamais reçu** par B |
| A répète (`PATCH repete_le`) | 204 ; B reçoit une seconde sonnerie (2 reçues au total) |
| A déplace l'invitation vers C (`PATCH to_id`) | 400 `P0001` « from_id et to_id sont figés » |
| Même exercice sur le staging | identique |

Non mesuré : l'écran d'appel entre deux vrais téléphones ; `call:<id>` reste lisible par tout compte
(uuid aléatoire connu des deux parties — résidu écrit dans la fiche).
