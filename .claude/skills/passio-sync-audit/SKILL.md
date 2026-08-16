---
name: passio-sync-audit
description: Audite la synchronisation de PASSIO — multi-appareils, Supabase Realtime, outbox, idempotence, hors-ligne, concurrence, convergence, et l'autorité de l'horloge. À utiliser quand une donnée n'arrive pas sur l'autre appareil, qu'un changement se perd, qu'un état diverge entre deux sessions, ou avant de toucher à `user_state`, aux outbox ou aux canaux realtime.
---

# /passio-sync-audit — Prouver la convergence, pas la supposer

## Ce que le dépôt fait aujourd'hui (mesuré, 2026-08-16)

| Mécanisme | Où | État réel |
|---|---|---|
| État du compte cross-appareil | `user_state` (table), `supaLoadUserState`/`supaSaveUserState` (app-02) | arbitrage par **horloge client** — voir défaut ci-dessous |
| Outbox messages | `passio_outbox_v1` (localStorage), app-04 ~4328 | statut `failed` + renvoi sur `online` |
| Outbox commentaires | `passio_cmt_outbox_v1`, app-04 ~390 | porte un `opId`, le seul du dépôt |
| Realtime | canal unique `realtime:db` + canaux privés de conversation | `postgres_changes` |
| Sauvegarde de dernière chance | `supaSaveUserStateBeacon` | POST REST `keepalive:true` au `pagehide` |

Il n'existe **pas** d'`operation_id` de bout en bout, **pas** d'outbox serveur, **pas** de receipts, **pas** de révision monotone serveur. Les deux outbox sont locales, indépendantes, et propres à leur domaine.

## Le défaut d'autorité d'horloge — vérifié, non encore déclenché

`supaSaveUserState` écrit `updated_at: new Date().toISOString()` (app-02:348) — **l'horloge du client**. La colonne a pourtant `default now()` en base, et **aucun trigger** ne la réécrit : la valeur client gagne.

Or c'est cette valeur qui arbitre la fusion (app-02:544) : `if (!state.onboarded || serverTs > localTs)`.

**Enchaînement du défaut.** Appareil A en avance d'une heure écrit `T+1h`. B (horloge juste) restaure, mémorise `_stateSyncedAt = T+1h`, puis écrit son propre état à `T`. Alors :

- `_markStateSynced(T)` refuse de reculer (app-02:326) → **`_stateDirty` n'est jamais abaissé** : chaque `saveState` renvoie un upsert, et le beacon repart à chaque passage en arrière-plan.
- A rouvre : `serverTs = T` < `localTs = T+1h` → A **ne restaure pas** les changements de B et repousse son propre état par-dessus. **Les modifications de B sont perdues en silence.**

Un appareil à l'horloge rapide gagne définitivement.

**État en production au 2026-08-16** : aucune dérive positive observée (toutes les lignes `user_state` ont un `updated_at` antérieur à `now()`). Le défaut est **réel et non déclenché** — ce qui en fait exactement le genre de bug qui attend un utilisateur avec un téléphone mal réglé.

Vérifier la dérive :

```bash
supabase db query --linked "select count(*) filter (where updated_at > now() + interval '60 seconds') as horloges_en_avance, max(updated_at - now()) as derive_max from user_state;"
```

## Les questions à poser à chaque flux

Pour toute donnée qui voyage `CLIENT A → SERVEUR → BASE → REALTIME → CLIENT B` :

1. **Émission** — l'intention part-elle ? (et pas une relecture : une écriture d'état envoie l'**intention locale**, jamais un état re-déduit d'un `select` préalable — sinon elle s'inverse dès que local et base divergent, défaut `like-intention-ecriture`)
2. **Acceptation** — le `{ error }` est-il **lu** ? Le SDK ne lève pas sur un refus RLS.
3. **Persistance** — la ligne existe-t-elle vraiment en base ? Un UPDATE/DELETE qui touche 0 ligne est un refus RLS déguisé en succès.
4. **Diffusion** — la table est-elle dans la publication realtime ?
5. **Réception** — B a-t-il un abonnement vivant, et autorisé ?
6. **Application** — le handler écrit-il dans le bon tableau d'état ? (`FEED-RT-007` : le post arrivait, s'affichait, puis un instantané plus ancien l'écrasait)
7. **Convergence** — A et B affichent-ils la même chose après stabilisation ?

Une étape manquante = anomalie, même si l'écran a l'air correct.

## Détecter les ABSENCES

Le plus dur n'est pas l'erreur, c'est le silence. Chercher explicitement :

- une mutation en base **sans** événement realtime correspondant ;
- un événement diffusé **sans** réception ;
- une réception **sans** application ;
- un appareil qui ne reçoit plus rien depuis N minutes ;
- une file d'outbox qui n'avance plus ;
- un abonnement mort (statut du canal jamais repassé à `SUBSCRIBED`).

## Idempotence — la liste à repasser

Toute opération rejouée doit produire **un seul** effet métier : double like, double unlike, double follow, double message, double commentaire, double RSVP, double soumission, rejeu après timeout.

Acquis vérifiés : `post_likes` a pour clé primaire `(post_id, user_id)` → ré-aimer est idempotent ; `event_reactions` impose une réaction par personne. À vérifier au cas par cas ailleurs — l'idempotence n'est acquise que là où une contrainte de base la garantit, jamais parce que le client « ne devrait pas » envoyer deux fois.

## Tester

```bash
PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite
npx playwright test tests/e2e/feed-realtime-course.spec.js tests/e2e/etat-sync-base64.spec.js tests/e2e/conv-suppression.spec.js
```

⚠️ Les tests « multi-appareils » utilisent **deux contextes de navigateur**, pas deux appareils. Horloge, réseau et service worker y sont partagés : ils ne prouvent ni la dérive d'horloge, ni le comportement d'une PWA suspendue. Le dire dans tout rapport plutôt que laisser croire à une preuve multi-appareils.

## Critères de réussite

- Chaque étape du trajet est **observée**, pas déduite de l'affichage.
- La convergence est vérifiée **en base**, pas à l'écran.
- L'idempotence s'appuie sur une contrainte, pas sur une politesse du client.
- Aucune décision de fusion ne repose sur une horloge client.

## Critères d'échec

- « Ça s'affiche sur B » présenté comme preuve de convergence.
- Une écriture jugée réussie sans lecture de `{ error }`.
- Un test mono-contexte présenté comme multi-appareils.

## Format de résultat

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
