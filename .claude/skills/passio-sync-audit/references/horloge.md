# Le défaut d'autorité d'horloge — vérifié, non encore déclenché

`supaSaveUserState` écrit `updated_at: new Date().toISOString()` (app-02:348) — **l'horloge du client**. La colonne a pourtant `default now()` en base, et **aucun trigger** ne la réécrit : la valeur client gagne.

Or c'est cette valeur qui arbitre la fusion (app-02:544) : `if (!state.onboarded || serverTs > localTs)`.

## Enchaînement du défaut

Appareil A en avance d'une heure écrit `T+1h`. B (horloge juste) restaure, mémorise `_stateSyncedAt = T+1h`, puis écrit son propre état à `T`. Alors :

- `_markStateSynced(T)` refuse de reculer (app-02:326) → **`_stateDirty` n'est jamais abaissé** : chaque `saveState` renvoie un upsert, et le beacon repart à chaque passage en arrière-plan.
- A rouvre : `serverTs = T` < `localTs = T+1h` → A **ne restaure pas** les changements de B et repousse son propre état par-dessus. **Les modifications de B sont perdues en silence.**

Un appareil à l'horloge rapide gagne définitivement.

## État en production au 2026-08-16

Aucune dérive positive observée (toutes les lignes `user_state` ont un `updated_at` antérieur à `now()`). Le défaut est **réel et non déclenché** — ce qui en fait exactement le genre de bug qui attend un utilisateur avec un téléphone mal réglé.

Vérifier la dérive :

```
execute_sql  (connecteur supabase-passio-readonly)
select count(*) filter (where updated_at > now() + interval '60 seconds') as horloges_en_avance, max(updated_at - now()) as derive_max from user_state;
```
