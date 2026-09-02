# Ce que le dépôt fait aujourd'hui (mesuré, 2026-08-16)

| Mécanisme | Où | État réel |
|---|---|---|
| État du compte cross-appareil | `user_state` (table), `supaLoadUserState`/`supaSaveUserState` (app-02) | arbitrage par **horloge client** — voir `horloge.md` |
| Outbox messages | `passio_outbox_v1` (localStorage), app-04 ~4328 | statut `failed` + renvoi sur `online` |
| Outbox commentaires | `passio_cmt_outbox_v1`, app-04 ~390 | porte un `opId`, le seul du dépôt |
| Realtime | canal unique `realtime:db` + canaux privés de conversation | `postgres_changes` |
| Sauvegarde de dernière chance | `supaSaveUserStateBeacon` | POST REST `keepalive:true` au `pagehide` |

Il n'existe **pas** d'`operation_id` de bout en bout, **pas** d'outbox serveur, **pas** de receipts, **pas** de révision monotone serveur. Les deux outbox sont locales, indépendantes, et propres à leur domaine.

## Défauts nommés à connaître

- **`like-intention-ecriture`** — une écriture d'état envoie l'**intention locale**, jamais un état re-déduit d'un `select` préalable : sinon elle s'inverse dès que local et base divergent.
- **`FEED-RT-007`** — le post temps réel arrivait, s'affichait, puis un instantané plus ancien l'écrasait. Étape « Application » : le handler doit écrire dans le **bon tableau d'état**.

## Idempotence — la liste à repasser

Toute opération rejouée doit produire **un seul** effet métier : double like, double unlike, double follow, double message, double commentaire, double RSVP, double soumission, rejeu après timeout.

Acquis vérifiés : `post_likes` a pour clé primaire `(post_id, user_id)` → ré-aimer est idempotent ; `event_reactions` impose une réaction par personne.

À vérifier au cas par cas ailleurs — l'idempotence n'est acquise que là où une **contrainte de base** la garantit, jamais parce que le client « ne devrait pas » envoyer deux fois.

## Format de résultat d'un audit de flux

```
FLUX <nom> — A → B
Émission     : ✅/❌  <preuve>
Acceptation  : ✅/❌  ({ error } lu ? )
Persistance  : ✅/❌  <requête et décompte>
Diffusion    : ✅/❌  <publication realtime>
Réception    : ✅/❌  <état du canal>
Application  : ✅/❌  <tableau d'état visé>
Convergence  : ✅/❌  <vérification en base>
Idempotence  : ✅/❌  <contrainte qui la garantit>
Non prouvé   : <ce que le harnais ne peut pas montrer>
```
