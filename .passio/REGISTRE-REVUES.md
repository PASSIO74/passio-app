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
| 2 | Affichage de contenu d'autrui — XSS stockés | **fait** (2026-08-14), 2e passe à prévoir | 6 / 6 |
| 3 | Authentification, identité, isolation entre comptes | **fait** — 2 manches (2026-08-14) | 4 / 4 démontrés |
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

## Manche 5 — Identité et isolation, SECONDE manche avec le dossier complété (2026-08-14)

Relecteur : ChatGPT « Moyen », 39 s. Verdict d'entrée : « la seconde manche change
le verdict, mais **je ne valide toujours pas “isolation garantie”** ».

| # | Défaut | Verdict |
|---|--------|---------|
| 1 | **La fenêtre de 1,2 s.** `doLogout` purge puis `setTimeout(reload, 1200)`. Pendant ce délai l'application TOURNE ENCORE avec l'état du compte sortant en mémoire : tout `saveState()` réarme le timer et réécrit `passio_mvp_state_v1` APRÈS la purge, et le beacon `pagehide` que j'avais ajouté le matin même recréait `passio_pending_user_state_<A>`. `discardPendingStateSave()` ne désamorçait que le timer DÉJÀ armé — le commentaire du code décrivait pourtant exactement ce piège | **confirmé — résurrection du compte sortant** |
| 2 | `MY_UID` / `window.MY_UID` / `passio_uid` ne sont pas remis à null par `doLogout` : pendant la fenêtre, les écritures partent encore sous l'identité de A | **confirmé** |
| 3 | `_profileCache` (app-04) n'est jamais vidé ; le rechargement l'emporte, mais rien ne garantit que le rechargement aboutisse | **confirmé — portée limitée, corrigé quand même** |

**Correctif : un verrou `_accountPurged`**, posé EN PREMIER par
`purgeAccountScopedData`, qui neutralise `saveState`, `saveStateNow`, les handlers
`pagehide`/`beforeunload`, `_scheduleStateSync`, `_queuePendingUserState` et
`supaSaveUserStateBeacon`. Plus l'effacement de l'identité et du cache profils.

### Trouvé en propre — inventaire exhaustif des clés de stockage

L'app écrit 18 clés ; `ACCOUNT_SCOPED_KEYS` n'en purgeait que 7. Quatre portant du
CONTENU de compte survivaient : `passio_cdv_lives` (**carnets de voyage — vrai
contenu utilisateur**), `passio_cdv_geo_v1` (lieux géocodés), `passio_passion_requests`,
`passio_event_reminded`. Ajoutées.

Écartées **délibérément**, avec la raison écrite dans le code :
`passio_parental_code` et `passio_limit_sec` — le contrôle parental est posé sur
l'APPAREIL par un parent ; le purger à la déconnexion offrirait à l'enfant un
contournement en un clic.

Vérifié dans le navigateur : après la purge PUIS une salve de `saveState`,
`saveStateNow`, beacon, `pagehide` et `beforeunload`, **rien n'est revenu** ;
`MY_UID` est nul ; les clés d'appareil survivent.

---

## Manche 4 — Identité et isolation entre comptes (2026-08-14)

Relecteur : ChatGPT « Moyen », 28 s, sur 12 fonctions.

**Leçon de méthode, à retenir.** Le relecteur a refusé de conclure sur la question
centrale du domaine — la fuite entre comptes — parce que `doLogout` **délègue**
toute l'isolation à `purgeAccountScopedData()`, qui **n'était pas dans le dossier**.
Il écrit noir sur blanc qu'il ne peut affirmer ni que `passio_mvp_state_v1` est
purgé, ni qu'IndexedDB est vidé, et refuse d'inventer. C'est le bon comportement,
et c'est ma faute : **un dossier doit contenir la fonction qui fait le travail, pas
seulement celle qui l'appelle.** Ancres corrigées (`purgeAccountScopedData`,
`idbConvClear`, `discardPendingStateSave`) → ce domaine mérite une seconde manche.

| # | Emplacement | Défaut | Verdict |
|---|-------------|--------|---------|
| 1 | `onbSkipAuth` (app-02:1831) | `onbNext()` est appelé AVANT `await signInAnonymously()`, et `MY_UID` n'est affecté qu'après. Pendant la fenêtre, `MY_UID` porte encore l'identifiant du **compte précédent de l'appareil** (restauré depuis `passio_uid` au boot) | **confirmé** — l'avance de l'UI est un compromis assumé et documenté (verrou auth de supabase-js), mais l'identité résiduelle ne l'est pas. `MY_UID` et `passio_uid` sont désormais effacés AVANT d'avancer : les fonctions d'écriture testent `!MY_UID` et s'abstiennent |
| 2 | `_fetchProfile` (app-04:2300) | `error` n'était pas lu : une coupure réseau ou un refus RLS momentané donnait `data` vide, et le repli anonyme était **mis en cache**. Toute la session affichait « Passionné ✨ » sans photo pour cette personne, jusqu'au rechargement | **confirmé** — on ne met plus en cache ce qu'on n'a pas obtenu |

### Trouvé en propre — une fuite que j'avais moi-même introduite

En relisant `purgeAccountScopedData` (que le relecteur ne pouvait pas voir), j'ai
constaté que la clé `passio_pending_user_state_<uid>` **introduite ce matin même**
n'y figurait pas. Le blob d'état COMPLET du compte A (profils, notifications,
likes…) restait donc sur l'appareil après sa déconnexion, lisible pendant que B
l'utilisait. La purge balaie désormais toutes les clés portant ce préfixe — vérifié
dans le navigateur : deux files purgées, une clé sans rapport intacte.

---

## Manche 3 — Affichage de contenu d'autrui, XSS stockés (2026-08-14)

Relecteur : ChatGPT **modèle « Moyen »** (le quota Pro de l'espace de travail est
épuisé jusqu'au 11 septembre 2026), 1 min 18 s, sur 9 fonctions.
Qualité remarquable malgré le modèle réduit : il **refuse** de qualifier d'XSS le
`javascript:` dans un `<img src>` — les navigateurs modernes ne l'exécutent pas —
et sépare explicitement « mauvais helper par contrat » de « XSS démontré ».

| # | Emplacement | Défaut | Verdict |
|---|-------------|--------|---------|
| 1 | `searchUsers` (app-04:2621) | `profiles.emoji` d'un autre compte injecté BRUT dans `data-emoji='…'`. Charge utile `' onmouseover='…` → sortie d'attribut, gestionnaire d'événement, exécution | **confirmé — XSS stocké** |
| 2 | `searchUsers` (app-04:2614) | `p.emoji` du jsonb `profiles.passions` rendu en HTML brut → `<img src=x onerror=…>` s'exécute **sans clic**, au simple affichage du résultat | **confirmé — XSS stocké** |
| 3 | `loadReelComments` (app-05:2354) | URL de GIF (`comment_interactions.text`) passée à `escapeHtml` au lieu de `safeUrlAttr` | **confirmé** — mauvais helper, non exploitable dans `<img src>` |
| 4 | `_renderCommentsList` (app-04:595) | idem, mais précédé de `_looksLikeMediaUrl` qui exige `^https?://` | **confirmé** — non exploitable, corrigé par contrat |
| 5-6 | `_fillEventReactionDetail` (app-07:2614, 2628) | idem sur `event_reactions` | **confirmé** — même classement |
| — | `safeUrlAttr`, `escapeJsArg` eux-mêmes | Cherché un contournement | **aucun trouvé** — l'ordre des opérations d'`escapeJsArg` est correct |

### Trouvé en propre en remontant la chaîne — plus large que la revue

Le relecteur ne voyait que `searchUsers`. Or la cause est en amont, dans deux
helpers **partagés par 38 appelants chacun** (`js/app-02-state-utils.js`) :

- `avatarInner(u)` renvoyait `profiles.emoji` **brut**, inséré tel quel en HTML par
  ses 38 appelants. Le XSS n'était donc pas cantonné à la recherche d'utilisateurs :
  il visait n'importe quel écran affichant l'avatar d'autrui.
- `avatarBg(u)` construisait `url('<photo>')` dans un attribut `style` sans aucune
  neutralisation : une apostrophe dans l'URL refermait l'`url()`, puis l'attribut.
  La couleur (`profiles.color`, champ libre) permettait en plus un
  `red;background-image:url(//evil.tld/x)`.

Corrigés à la source : `_cssUrl` (politique de schéma + pourcent-encodage de tout
ce qui peut refermer quelque chose ; `data:image` base64 validé strictement),
`_cssColor` (refus de `"'<>;{}`, `url(`, `expression(`, `@import`) et
`escapeHtml` dans `avatarInner`. Vérifié dans le navigateur : cas nominaux intacts
(URL Supabase réelle, emoji, initiale), quatre charges utiles neutralisées.

**Base de production inspectée : aucune valeur malveillante présente.** La faille
n'a pas été exploitée.

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
