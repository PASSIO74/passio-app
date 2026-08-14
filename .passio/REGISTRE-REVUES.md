# Registre des revues par un second modèle

Une revue ne vaut que si l'on sait ce qu'on en a fait. Ce fichier suit chaque
remarque d'un relecteur tiers de bout en bout : **remontée → vérifiée contre le
code réel → confirmée ou infirmée → corrigée ou classée**.

Règle : aucune remarque n'est appliquée sans vérification préalable contre le code
réel et, si elle en dépend, contre la base de production. Le relecteur n'a accès à
rien — il peut se tromper sur une prémisse, et ça arrive.

## Balayage par domaine

`node scripts/dossier-domaine.js --liste` pour les domaines disponibles.

| # | Domaine | État | Confirmées / remontées |
|---|---------|------|------------------------|
| 1 | Écritures Supabase — échecs silencieux | **fait** (2026-08-14) | 5 vérifiées / 14 remontées — 9 restent à vérifier |
| 2 | Affichage de contenu d'autrui — XSS stockés | à faire | — |
| 3 | Authentification, identité, isolation entre comptes | à faire | — |
| 4 | État local, persistance, sync cross-appareil | **fait** (2026-08-14) | 6 / 7 |
| 5 | Messagerie et livraison temps réel | à faire | — |
| 6 | Médias — upload, Storage, downscale | à faire | — |
| 7 | Fil — classement et rendu | à faire | — |
| 8 | PWA — service worker, cache, mise à jour | à faire | — |
| 9 | Télémétrie — fuite de PII | à faire | — |

**Hors périmètre de cette méthode**, à traiter autrement : `styles.css` (298 Ko),
`index.html` (111 Ko), le schéma SQL et les policies RLS de production (nécessitent
un export dédié depuis la prod, pas une extraction de fonctions), et le dashboard
`dashboard/` (application distincte, avec sa propre suite de 77 tests).

---

## Manche 2 — Écritures Supabase, les échecs silencieux (2026-08-14)

Relecteur : GPT-5 Pro, lecture seule, **20 min 16 s** de raisonnement, sur les 107
fonctions extraites par `dossier-domaine.js`. 14 défauts remontés.

### Vérifiés contre le code réel

| # | Fonction | Défaut | Verdict |
|---|----------|--------|---------|
| 1 | `supaUpsertProfile` (app-08:2315) | L'erreur n'est traitée QUE si son message cite `passions`/`is_private`/`rs_links` (repli migration). Tout autre échec — refus RLS, contrainte, panne — tombe en fin de fonction sans log, sans retour, sans exception. Or `is_private` est dans ce payload : **un compte peut rester public alors que l'utilisateur voit le cadenas** | **confirmé — confidentialité** |
| 6 | `supaUpdateEvent` (app-08:3135), `supaCancelEvent` (3148) | `.eq("author_id", MY_UID)` exclut la ligne avant même que la RLS statue → un **co-organisateur** touche 0 ligne, `error` est null, la fonction renvoie `true`. `co_organizers` et `_canManageEvent` (app-07:382) existent bien : le cas est réel | **confirmé** |
| 8 | `supaToggleStepLike` (3439), `supaToggleEventLike` (3487), `supaToggleCdvLiveLike` (3564) | Relisent la base puis décident — l'invariant « l'écriture suit l'INTENTION, jamais une relecture » corrigé sur le like de post (`bf721bc`) est **encore violé à trois endroits**. Le résultat du DELETE n'est pas lu non plus | **confirmé** |
| 9 | `supaSetPostLike(…, want=false)` (app-03:242) | `out.ok = !del.error` : zéro ligne supprimée = succès. Ne distingue pas « ligne déjà absente » de « ligne présente mais filtrée par la policy DELETE » | **confirmé** (gravité à conditionner à la policy réelle) |
| — | Embeds `profiles(...)` sans FK, base64 en base, like de post par relecture | Contrôlés par le relecteur, **aucune violation trouvée** | cohérent avec le code |

### Remontés, pas encore vérifiés

2 (story publiée sans média quand l'upload échoue) · 3 (`supaPublishPostWithRetry` :
une exception dans `_buildVlogPayload` publie le carnet en post ordinaire, et
confirme le succès) · 4 (CDV live et étapes sans contrat de retour) · 5 (révocation
de collaborateur dont l'échec est invisible) · 7 (`supaSetEventRsvp` : un 23505
après un UPDATE refusé passe pour un succès) · 10 (`supaFollowUser` notifie même
quand le suivi a échoué) · 11 (`supaReport`, `supaUnblockUser` : résultat ignoré) ·
12 (`supaLeaveEvent`, `supaCheckInEvent`, `supaRateEvent`, `supaPromoteFromWaitlist`) ·
13 (`supaLikeComment`, `supaFollowCdvLive`, `supaAddEventReaction`…) ·
14 (`supaSetStepReaction` : deux réactions persistent, masquées par la déduplication d'affichage).

Non classable sans le schéma : `supaDeleteEvent` supprime trois tables filles en
ignorant leurs erreurs avant de supprimer le parent — l'absence d'atomicité est
établie, l'issue dépend des FK réelles.

---

## Manche 1 — État, persistance et sync cross-appareil (2026-08-14)

Relecteur : GPT-5 Pro, lecture seule, 14 min 46 s de raisonnement.
Dossier : `.passio/reviews/2026-08-14-sauvegarde-d-etat-fiabilisee-*`.
Correctif : commit `5fbb35d`.

| # | Remarque | Verdict | Suite |
|---|----------|---------|-------|
| 1 | Un acquittement tardif efface une sauvegarde plus récente mise en file entre-temps | **confirmé** | Acquittement ciblé par comparaison d'`updated_at` |
| 2 | SELECT puis upsert non atomiques : une écriture concurrente s'intercale et se fait écraser | **confirmé** | Écriture conditionnelle `update … .lt(updated_at)` + repli `insert` |
| 3 | `updated_at` généré côté client : le décalage d'horloge décide qui gagne | **confirmé** | Atténué par l'écriture conditionnelle (comparaison faite par la base). Fix complet = horodatage serveur, demande une migration — **non fait, dette assumée** |
| 4 | Le rejeu pousse le blob au serveur sans le réappliquer à l'état vivant | **confirmé** | `_applyUserState(pending.data)` + rendu après rejeu réussi |
| 5 | Drapeau d'état sale baissé alors que la mise en file a échoué (quota) | **confirmé** | `_queuePendingUserState` renvoie un booléen qui conditionne la retombée |
| 6 | Clé de file unique : un autre onglet ou compte détruit la seule copie de secours | **confirmé** | Clé suffixée par compte |
| 7 | Le timer de debounce n'est pas annulé par le beacon (bfcache → réécriture ré-horodatée) | **confirmé** | Le beacon annule le timer ; `supaSaveUserState` sort tôt si rien n'est sale |
| C | « Le statut du repli anon n'est pas lu » | **infirmé** | Prémisse fausse de ma part : `res.ok` est bien lu, rien n'est effacé sur un 401 |

Trouvé en propre pendant la même manche, hors revue : `supaPublishStory` lisait
`res.error` sans que `res` existe — `ReferenceError` à **chaque** publication de
story **en production**, avalé par le catch, qui faisait compter 100 % des
`publish_story` en échec au centre de pilotage. Corrigé dans le même commit.
