# Appels — contrat de transition entre clients servis, clients en cache et policies (ASTRA-23, 2026-09-15)

> Cinquième contre-revue Astra. Le prédicat `call_partie_prenante` ne présente **pas** d'oracle
> d'existence dans son résultat booléen pour un tiers — cette accusation n'est pas reprise. En
> revanche, **servir un nouveau client ne prouve pas son adoption** par les onglets et PWA déjà
> ouverts. Ce document est le contrat que le code tient, et ce qu'il ne tient pas.

## Les acteurs

| | Ancien client (avant `45df96c0`, ASTRA-23) | Nouveau client (`main` ≥ `45df96c0`) |
|---|---|---|
| Ordre | s'abonne à `call:<id>` **puis** dépose l'invitation | dépose l'invitation (`call_invites`) **puis** s'abonne |
| `ready` | envoyé une fois à l'abonnement | envoyé et **rejoué** chaque seconde jusqu'à l'offre (ASTRA-49, #472) |
| Canal refusé | journalisé seulement — l'appel « sonne » jusqu'au délai | l'appel se termine, la personne est prévenue « version périmée — recharge », tracé `call_canal_refuse` (ce lot) |

La policy Realtime resserrée (`migration_canal_appel_lie_2026-09-15.sql`) n'ouvre `call:<id>`
qu'aux deux parties nommées par la ligne `call_invites`. **Aucune migration n'est appliquée au moment
de ce lot** (non mesuré sur la cible ; voir le registre).

## La matrice

| Situation | Avant la migration | Après la migration |
|---|---|---|
| **Ancien client**, onglet frais | fonctionne (policies d'avant) | l'abonnement à `call:<id>` précède la ligne → **refusé** ; l'appel sonne dans le vide jusqu'au délai (60 s), l'appelé reste « connexion… ». **Perte de service jusqu'au rechargement.** |
| **Nouveau client**, onglet frais | fonctionne (l'ordre invitation → canal marche sous les deux jeux de policies) | fonctionne |
| **Onglet déjà ouvert** (ancien client chargé avant `45df96c0`, jamais rechargé) | fonctionne | comme « ancien client » ci-dessus. Le service worker sert la version en cache jusqu'au prochain cycle de mise à jour ; rien ne force le rechargement d'un onglet ouvert. |
| **Onglet déjà ouvert** sur le nouveau client | fonctionne | fonctionne |
| **Abonnement refusé puis reprise** | — | nouveau client : `CHANNEL_ERROR` + motif de policy → fin d'appel + message ; **reprise** = recharger (service worker à jour) puis rappeler. Une coupure réseau (`TIMED_OUT` sans motif de policy) n'est **pas** traitée comme un refus : Realtime retente seul. |
| **Canal déjà ouvert** au moment où la policy change | l'autorisation d'un canal est évaluée **à l'abonnement** ; un appel en cours au moment de l'application de la migration n'est pas coupé (**non mesuré** : comportement Realtime attendu, pas observé) | le prochain abonnement (nouvel appel, reconnexion après coupure) est réévalué sous la nouvelle policy. Une **reconnexion automatique** d'un ancien client en plein appel serait refusée → fin d'appel par la garde (nouveau client) ou silence (ancien). |
| **Renouvellement des autorisations** d'un canal ouvert | — | Realtime ré-autorise à chaque `subscribe` ; il n'y a pas de renouvellement « en place » : la seule façon de rejouer les droits est de se réabonner. Le client ne le fait qu'à la reconnexion. |

## Ce que le contrat impose à la mise en service

1. **Servir le nouveau client d'abord** (fait : `main` déployé à `45df96c0`, puis `a5e8c717`), puis
   laisser le service worker propager — **la propagation n'est pas mesurée** : aucun compteur de
   versions clientes n'existe (résidu, registre).
2. **Appliquer la migration ensuite** ; accepter qu'un onglet ancien encore ouvert perde les appels
   jusqu'à son rechargement, et que ce cas soit **détectable** : sur le nouveau client, par la trace
   `call_canal_refuse` ; sur l'ancien, par rien (c'est la raison d'attendre la propagation).
3. **Ne pas rouvrir le canal à tous les comptes** pour résoudre une incompatibilité : la policy
   resserrée est la correction d'ASTRA-23 (un tiers lisait l'offre SDP et pouvait raccrocher).
4. **Retour arrière** : la migration porte son inverse (rouvrir la policy d'avant) ; le client
   nouveau fonctionne sous les deux jeux de policies, donc revenir en arrière ne casse pas les
   onglets à jour.

## Ce que ce lot ne fait pas, et dit

- Il ne force pas le rechargement des onglets ouverts (pas de « kill switch » client) — résidu.
- Il ne mesure pas la part de clients en cache sur la cible — résidu (télémétrie de version).
- La préparation **séparée** de la sonnerie (ligne écrite, canal rejoint, **puis** sonnerie déclenchée)
  reste le durcissement serveur complémentaire d'ASTRA-49 ; le client seul ferme déjà la course par
  la réponse rejouable (#472).

Verrous : `tests/e2e/appel-canal-refuse.spec.js` (3, Chromium) ; `appel-canal-lie.spec.js` et
`appels-sonnerie-privee.spec.js` restent verts.
