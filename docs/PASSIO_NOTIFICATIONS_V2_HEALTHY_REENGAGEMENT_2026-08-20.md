# PASSIO — Notifications V2 · Réengagement sain

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Principe** : une notification doit mériter d’interrompre l’utilisateur.

---

# 1. Décision produit

PASSIO ne doit pas utiliser les notifications pour maximiser le retour dans l’app à n’importe quel prix.

Une notification est légitime lorsqu’elle aide à :

```text
répondre à une personne
→ poursuivre une relation
→ coordonner un IRL
→ gérer une situation importante
→ protéger le compte / la sécurité
```

Elle n’est pas légitime lorsqu’elle sert principalement à :

- créer du FOMO ;
- entretenir une streak ;
- annoncer des points ;
- annoncer un rang ;
- annoncer du Passia ;
- pousser artificiellement du contenu ;
- rappeler que « des gens sont actifs » sans action utile ;
- faire revenir quelqu’un uniquement pour gonfler une métrique de rétention.

---

# 2. État actuel vérifié

## 2.1 Centre de notifications dans l’app

Le topbar possède une cloche :

```text
openNotifications()
```

avec badge de non-lus.

La modale affiche actuellement :

> « Ce qui s'est passé pendant que tu vivais ta vraie vie. »

Cette intention produit est alignée avec PASSIO : l’app doit respecter la vie hors écran.

## 2.2 État local + Supabase

Le client garde :

```text
state.notifications
state.user.seenNotifIds
```

Les notifications Supabase sont chargées depuis :

```text
notifications
```

avec limite 30, puis fusionnées dans l’état local.

`seenNotifIds` sert de protection locale contre la réapparition d’anciennes notifications.

## 2.3 Schéma production actuel

```text
notifications
├── id
├── user_id
├── kind
├── from_id
├── ref_id
├── content
├── seen
└── created_at
```

Index :

```text
(user_id, created_at DESC)
```

## 2.4 Policy INSERT actuelle

La policy production vérifiée impose :

```text
from_id = auth.uid()
```

C’est utile contre l’usurpation d’auteur, mais insuffisant.

Elle ne prouve pas que :

- `user_id` est la vraie cible de l’action ;
- `kind` correspond à une action réelle ;
- `ref_id` correspond à un objet réellement lié à l’acteur et la cible ;
- `content` décrit honnêtement l’action ;
- l’acteur n’est pas bloqué ;
- la notification respecte les préférences du destinataire.

## 2.5 Création client actuelle

`supaInsertNotif(toUserId, kind, refId, content)` construit côté client :

```text
nom du profil actif
+ contenu fourni par le code appelant
```

puis insère directement la ligne `notifications`.

Des appels existent pour :

- like ;
- commentaire ;
- réponse aimée ;
- mention commentaire ;
- mention groupe ;
- événement rejoint ;
- interactions CDV/live legacy ;
- invitations/collaboration.

## 2.6 Kinds actuellement reconnus par l’UI

Le mapping courant inclut :

```text
like
comment
follow
message
mention
reaction
event_join
event_comment
event_update
event_cancelled
event_reminder
event_invite
event_feedback
live_video
cdv_live_step
```

Le seed contient aussi une notification `quest` avec récompense en points.

Cette catégorie disparaît du cœur.

## 2.7 Push Web existant

La table :

```text
push_subscriptions
├── endpoint
├── user_id
├── subscription
└── created_at
```

permet un abonnement par appareil/endpoint.

Le service worker sait afficher :

- push sociale `type = notif` ;
- push d’appel `type = call`.

## 2.8 Edge Function `notify-call`

La fonction `notify-call` gère en réalité :

```text
call
ET
notif sociale
```

Pour `type="notif"`, le client peut actuellement fournir :

```text
toUserId
kind
text
emoji
```

L’Edge Function :

- authentifie l’appelant ;
- charge les abonnements du destinataire avec `service_role` ;
- transmet ensuite le texte fourni au service worker.

### Problème P0

L’authentification prouve **qui appelle la fonction**, mais la fonction ne valide pas que l’appelant a réellement effectué l’action sociale décrite.

Un client modifié peut donc potentiellement tenter :

```text
push vers un user arbitraire
+ texte arbitraire
+ kind arbitraire
```

C’est un risque de spam/abus et une frontière d’autorisation insuffisante.

## 2.9 Push sociale non contextuelle

Le service worker donne actuellement aux push sociales :

```text
data.url = "./"
```

Un tap ouvre/focus simplement PASSIO.

Il ne conduit pas encore directement vers :

- le post ;
- le commentaire ;
- le profil ;
- la conversation ;
- l’événement.

## 2.10 Tag push trop large

Le tag d’une notification sociale est basé sur :

```text
passio-notif-<kind>
```

Deux notifications du même kind peuvent donc se remplacer/renotifier selon le navigateur alors qu’elles concernent des objets différents.

## 2.11 Permission push d’appel

`requestCallNotifications()` est actuellement déclenchée lors de la première ouverture d’une conversation directe.

Le commentaire du code précise que cela sert à recevoir des appels même app fermée.

La permission OS n’est pas redemandée après refus, ce qui est positif, mais le moment de demande doit être repensé : **ouvrir une conversation ne signifie pas vouloir activer les appels/push.**

## 2.12 Lecture / `seen`

Le client appelle :

```text
supaMarkNotifSeen()
supaMarkNotifsSeen()
```

qui font un `UPDATE seen=true`.

Le code affirme qu’une policy « Update propre » existe.

Mais la photographie production 2026-08-17 inspectée ne montre pas de policy UPDATE `notifications` dans la liste générée.

**À vérifier obligatoirement sur la dernière prod réelle avant modification.**

Si elle manque réellement, le `seen` cross-device peut échouer silencieusement et le fallback local `seenNotifIds` masque partiellement le problème.

---

# 3. Hiérarchie des notifications V2

Toutes les notifications ne méritent pas le même canal.

## Niveau A — critique / sécurité

Exemples :

- sécurité du compte ;
- changement important d’un IRL auquel je participe ;
- annulation d’un IRL ;
- promotion de liste d’attente avec action à prendre ;
- appel entrant si fonctionnalité activée ;
- action de modération nécessitant mon attention.

Comportement :

```text
in-app = oui
push = selon catégorie / nécessité
priorité = forte
```

## Niveau B — relation directe

Exemples :

- nouveau message direct ;
- mention explicite ;
- invitation IRL ;
- réponse directe à mon commentaire ;
- invitation à collaborer si module concerné.

Comportement :

```text
in-app = oui
push = activable, recommandé après consentement
```

## Niveau C — interaction sociale

Exemples :

- commentaire sur mon contenu ;
- nouvel abonnement ;
- réaction significative ;
- like.

Comportement :

```text
in-app = oui
push = généralement agrégé / configurable
```

## Niveau D — découverte / digest

Exemples :

- contenus pertinents autour d’une Passio ;
- activité IRL suggérée ;
- résumé périodique.

Comportement :

```text
in-app = facultatif
push temps réel = non par défaut
résumé/digest = opt-in
```

## Niveau interdit

Ne plus créer :

```text
quest
points gagnés
Passia gagnés
rang débloqué
streak
« reviens aujourd’hui »
« tu vas perdre… »
```

---

# 4. Principe server-authoritative

Une notification sociale ne doit pas être une phrase libre inventée par le client.

La source de vérité est l’action serveur.

Exemple :

```text
A like le post P de B
→ post_likes contient (P, A)
→ serveur sait que P appartient à B
→ serveur crée la notification pour B
```

Le client ne doit pas pouvoir dire :

> « Je viens de liker quelque chose chez X »

sans que le serveur puisse vérifier cette relation.

---

# 5. Architecture de création recommandée

Deux options valides, à choisir après audit Claude Code.

## Option 1 — triggers DB ciblés

Après action canonique :

```text
post_likes INSERT
post_comments INSERT
follows INSERT
...
```

un trigger crée une notification structurée.

Avantages :

- événement réellement arrivé ;
- pas de spoof client ;
- cohérence transactionnelle.

Limites :

- logique plus répartie en DB ;
- certaines notifications complexes ont besoin d’un service.

## Option 2 — RPC/Edge dispatcher autorisé

Client envoie uniquement l’action structurée :

```text
create_notification_for_action(kind, ref_id, target_id?)
```

Le serveur :

1. authentifie l’acteur ;
2. relit l’objet canonique ;
3. détermine la cible ;
4. vérifie block/privacy ;
5. vérifie préférences/rate limit ;
6. crée la notification ;
7. déclenche push si autorisé.

## Recommandation

P0 : privilégier **triggers pour actions simples** et **dispatcher pour événements métier complexes**.

---

# 6. Ne plus accepter de texte push arbitraire

La future Edge Function push sociale doit recevoir au maximum :

```text
notification_id
```

ou un identifiant d’événement serveur équivalent.

Elle charge ensuite :

- destinataire ;
- kind ;
- acteur ;
- ref ;
- préférences ;
- template autorisé.

Elle génère elle-même le texte.

### Interdit

```text
client → toUserId arbitraire + text arbitraire
```

---

# 7. Séparer appels et notifications sociales

`notify-call` doit revenir à un rôle clair :

```text
appel entrant uniquement
```

et valider au minimum :

- appelant authentifié ;
- destinataire valide ;
- conversation/relation autorisée ;
- membership ;
- block dans les deux sens ;
- rate limit anti-harcèlement.

Les notifications sociales utilisent une fonction dédiée, par exemple :

```text
dispatch-notification
```

Ne pas conserver un endpoint générique capable d’envoyer arbitrairement appels + texte social.

---

# 8. Modèle de notification V2

Conserver `notifications` et l’étendre plutôt que tout réécrire.

Ajouts expand-only candidats :

```text
category
entity_type
priority
dedupe_key
read_at nullable
pushed_at nullable
expires_at nullable
metadata jsonb safe
```

Le legacy :

```text
seen
content
```

reste compatible pendant la transition.

## `category`

Exemples :

```text
security
message
social
irl
system
```

## `entity_type`

```text
post
comment
profile
conversation
event
call
```

## `dedupe_key`

Permet :

- agrégation ;
- idempotence ;
- prévention des doubles notifications realtime/retry.

Exemple :

```text
like:post_123:user_A
```

---

# 9. Templates serveur

Le serveur rend des templates bornés.

Exemples :

```text
like
« Nina a aimé ta publication. »

comment
« Nina a commenté ta publication. »

follow
« Nina te suit maintenant. »

event_invite
« Nina t’invite à une activité Photo samedi. »

event_cancelled
« L’activité “Jam photo” a été annulée. »
```

Le texte libre du commentaire/message ne doit pas être injecté automatiquement dans une push lockscreen par défaut.

---

# 10. Notifications Messages

Messages V2 reste la source de vérité.

## In-app

Nouveau message : badge Messages + notification éventuelle selon architecture choisie.

Éviter un double comptage :

```text
badge conversation
+
badge cloche
```

ne doivent pas donner l’impression de deux événements distincts.

## Push

Par défaut recommandé :

```text
« Nouveau message de Nina »
```

sans texte du DM sur lockscreen.

Préférence optionnelle :

```text
Afficher l’aperçu des messages
```

si l’utilisateur le choisit explicitement.

## Block

Après block :

- aucune nouvelle push message ;
- aucune push appel ;
- aucune mention directe ;
- historique existant conservé selon Messages V2.

---

# 11. Notifications IRL

Prioritaires car elles peuvent changer une rencontre réelle.

## Push importantes

- invitation ;
- annulation ;
- changement majeur date/heure/ville ;
- promotion liste d’attente ;
- rappel choisi ;
- message organisateur important si canal structuré futur.

## Ne pas push par défaut

- nouvelle réaction événement ;
- +1 participant ;
- événement plus populaire ;
- « des amis y vont » ;
- événement recommandé toutes les heures.

## Localisation

Une push IRL n’affiche jamais :

- adresse exacte sensible ;
- GPS ;
- téléphone/contact privé.

Exemple sûr :

> « Ton activité Photo est demain à Lyon. »

---

# 12. Rappels IRL

Le rappel doit être produit à partir d’un RSVP réel et d’une préférence.

Défaut candidat :

```text
24 h avant
```

Optionnel :

```text
2 h avant
```

Ne pas multiplier les rappels sans consentement.

Un `declined` annule tout rappel.

Un événement annulé annule tous les rappels futurs.

---

# 13. Notifications Feed / social

## Like

In-app : oui.

Push : agrégée par défaut.

Exemple :

```text
« Nina et 4 autres personnes ont aimé ta publication. »
```

Plutôt que 5 interruptions.

## Commentaire

Plus important qu’un like.

Push possible selon préférences :

```text
« Nina a commenté ta publication. »
```

## Réponse / mention

Relation directe → priorité supérieure.

## Follow

In-app immédiat.

Push configurable, pas critique.

---

# 14. Agrégation

Créer une fenêtre d’agrégation pour événements répétitifs.

Exemples :

```text
likes même post
réactions même post
nouveaux followers rapprochés
```

Ne pas agréger :

- message direct ;
- annulation IRL ;
- promotion waitlist ;
- sécurité.

---

# 15. Rate limiting anti-abus

Le serveur doit limiter :

- mentions ;
- invitations IRL ;
- appels ;
- notifications résultant de spam de follow/unfollow ;
- répétitions d’une même action.

## Exemple de garde

Un like/unlike/like répété ne doit pas produire 20 notifications.

Le `dedupe_key` + fenêtre temporelle protège ce cas.

---

# 16. Préférences notification

Créer une source de vérité account-level.

Table candidate :

```text
notification_preferences
├── user_id PK
├── push_enabled
├── messages_push
├── social_push
├── irl_push
├── calls_push
├── discovery_digest
├── message_preview
├── quiet_hours_enabled
├── quiet_start
├── quiet_end
├── timezone
└── updated_at
```

RLS owner-only.

Alternative : JSONB borné si migration plus simple, mais schéma explicite préféré pour les réglages critiques.

---

# 17. Réglages UX V2

```text
Notifications

Messages                    [✓]
IRL importants              [✓]
Commentaires & mentions     [✓]
Likes & abonnements         [ ]
Appels                      [ ]
Découvertes / résumé        [ ]

Aperçu des messages         [ ]
Heures calmes               22:00 – 08:00
```

Les catégories doivent être compréhensibles, pas une liste de 25 events techniques.

---

# 18. Permission OS — règle stricte

Ne jamais demander la permission browser/OS :

- sur la landing ;
- pendant l’onboarding ;
- au premier Feed ;
- automatiquement à l’ouverture d’une conversation.

## Cible

PASSIO affiche d’abord un soft prompt interne au bon moment :

```text
Recevoir les nouveaux messages même quand PASSIO est fermé ?
[Activer] [Pas maintenant]
```

Seulement si l’utilisateur tape `Activer` :

```text
Notification.requestPermission()
```

## Appels

Au premier usage explicite de l’appel ou dans les réglages :

> « Active les notifications d’appel pour recevoir les appels lorsque l’app est fermée. »

Pas à la simple lecture d’un DM.

---

# 19. Refus permission

Si OS = denied :

- ne pas reprompter en boucle ;
- réglage montre `Bloqué par le système` ;
- aide concise vers réglages système si l’utilisateur tente volontairement d’activer.

Ne pas afficher une bannière permanente culpabilisante.

---

# 20. Heures calmes

P0/P1 selon capacité serveur.

Pendant quiet hours :

- sécurité critique : peut passer selon classification ;
- appel : selon réglage spécifique ;
- message : silencieux/différé selon plateforme ;
- social : différé ;
- discovery : différé.

Le fuseau appartient au réglage utilisateur, jamais déduit de GPS.

---

# 21. Deep links V2

Chaque notification doit posséder une destination canonique structurée.

Exemples :

```text
like/comment → #post-<id>
follow → #profile-<id>
message → #conversation-<id>
event_invite/update → #irl-event-<id>
```

Le tap push ouvre directement la destination après contrôles d’autorisation.

## Garde

Un deep link ne contourne jamais :

- block ;
- compte privé ;
- membership DM ;
- visibilité IRL.

---

# 22. Service worker V2

Payload push minimal :

```text
notification_id
kind
safe_title
safe_body
url
tag
```

Les champs sont générés serveur.

Le SW n’a pas à interpréter des données métier sensibles.

## Tag

Préférer une clé stable par entité/agrégat :

```text
passio:post:<postId>:likes
passio:conversation:<convId>
passio:event:<eventId>:update
```

plutôt que seulement :

```text
passio-notif-like
```

---

# 23. App badge

Le badge application doit représenter une information compréhensible.

Recommandation :

```text
nombre de notifications in-app non lues
```

mais ne pas additionner artificiellement :

- badge messages ;
- badge cloche ;
- badge app

comme trois métriques différentes.

Définir un calcul unique de `unread actionable`.

---

# 24. Centre de notifications V2

Garder la cloche.

Structure :

```text
Notifications

Aujourd’hui
[avatar] Nina a commenté ta publication
[avatar] Léa t’invite à une activité Photo

Cette semaine
...
```

## Groupement

Agrégation visuelle :

- likes même post ;
- réactions ;
- activité IRL même événement.

## Actions

- tap → destination ;
- tout marquer lu ;
- supprimer/masquer une notification si souhaité ;
- accéder aux réglages.

---

# 25. Seen / read — vérité serveur

`seenNotifIds` local devient un fallback de compatibilité, pas la source de vérité.

## Cible

```text
read_at timestamp nullable
```

`seen` peut rester legacy pendant transition.

### RLS

Le destinataire uniquement peut :

- lire ;
- marquer lu ;
- supprimer.

### Test obligatoire

Compte B ne peut pas marquer comme lue/supprimer une notification de A.

---

# 26. Vérifier la policy UPDATE réelle

Avant tout changement : Claude Code doit régénérer la référence schéma réelle.

Question à trancher :

> `notifications UPDATE` est-elle réellement déployée ?

Si non :

- ajouter policy owner-only ;
- test raw REST ;
- supprimer la dépendance au succès silencieux.

Le code doit inspecter `{ error, data }`, pas seulement `try/catch`.

---

# 27. Bloquage et notifications

Le block est transversal.

Si A bloque B ou B bloque A :

- aucun nouveau like/comment/follow direct actionable selon règles ;
- aucune mention ;
- aucun DM ;
- aucun appel ;
- aucune invitation IRL ;
- aucune push sociale.

Les anciennes notifications peuvent rester dans l’historique, mais leurs deep links respectent l’accès courant.

---

# 28. Comptes privés

Une notification ne doit pas fuiter un contenu devenu privé.

Exemple :

A reçoit une notification sur un post de B puis B passe privé / bloque A.

Tap :

```text
accès refusé / contenu indisponible
```

et non rendu depuis cache comme autorité finale.

---

# 29. Multi-profil

Une notification peut afficher l’identité passion stable de l’acteur lorsque le modèle Profil V2 est serveur-backed.

## Cible future

Ajouter éventuellement :

```text
actor_passion_profile_id nullable
```

ou dériver via l’objet source structuré.

### Invariant

Une ancienne notification ne doit pas changer de nom/persona parce que l’acteur change de profil actif.

## P0

Tant que ce modèle n’existe pas :

- utiliser identité account canonique ;
- ne pas sur-promettre une persona historique fiable.

---

# 30. Suppression Wallet / gamification

Supprimer toute notification liée à :

- `quest` ;
- points ;
- étoiles ;
- Score Passion ;
- rang ;
- Passia ;
- Pass Passion ;
- leaderboard.

Les seeds et tests doivent être nettoyés aussi.

---

# 31. CDV

Les kinds `cdv_live_step` peuvent rester dans le module Voyage tant que les données/fonctions existent.

Mais ils sortent du **cœur notifications PASSIO**.

À terme :

```text
Passio : Voyage
```

peut posséder sa propre préférence/module de notification.

Ne pas supprimer les données historiques opportunistement.

---

# 32. Découverte / réengagement

Une notification de découverte n’est jamais urgente.

P1 possible : digest opt-in :

```text
Cette semaine autour de tes Passio
• 3 publications intéressantes
• 1 activité Photo à Lyon
```

Mais seulement si :

- pertinence démontrée ;
- fréquence bornée ;
- utilisateur opt-in ;
- IRL T&S vert ;
- aucun langage de pression.

---

# 33. Fréquence

Pas de règle arbitraire « N pushes/jour » comme seule protection.

Le système combine :

- catégories ;
- priorité ;
- agrégation ;
- préférences ;
- quiet hours ;
- rate limits ;
- suppression des notifications faibles.

Un jour avec 2 vrais messages + une annulation IRL peut légitimement produire 3 pushes.

Un jour avec 40 likes ne doit pas produire 40 interruptions.

---

# 34. Analytics notifications

Événements :

```text
notification_center_opened
notification_opened
notification_marked_read
notification_settings_opened
notification_push_soft_prompt_shown
notification_push_enabled
notification_push_denied
notification_push_received
notification_push_opened
notification_digest_opened
```

## Propriétés sûres

- `kind` ;
- `category` ;
- `source` ;
- `priority` ;
- `age_bucket_ms` ;
- `delivery_channel` ;
- `permission_state` ;
- `was_aggregated`.

## Interdit

- texte notification libre ;
- contenu message ;
- commentaire brut ;
- nom utilisateur ;
- adresse IRL ;
- GPS ;
- téléphone/email.

---

# 35. Métriques produit saines

Ne pas optimiser uniquement :

```text
push open rate
```

Mesurer :

- notification → réponse message ;
- invitation → RSVP ;
- event update → participant informé ;
- commentaire → réponse utile ;
- taux de désactivation push ;
- taux de refus permission ;
- mute/block après notification ;
- notification spam reports ;
- push envoyées/utilisateur/semaine par catégorie.

Une hausse d’open rate accompagnée d’une hausse de mute/block est un échec.

---

# 36. Sentinelle / Centre de pilotage

## Sécurité

Surveiller :

- appels Edge Function vers cible arbitraire ;
- volume push anormal par acteur ;
- kinds inconnus ;
- ref invalides ;
- block bypass ;
- push vers utilisateur mineur pour IRL ;
- notification forgée ;
- erreurs RLS ;
- subscription ownership anomalies.

## Fiabilité

- push success/fail ;
- subscriptions mortes ;
- taux 404/410 ;
- latence dispatch ;
- doublons ;
- mismatch in-app/push ;
- `seen` sync failures.

## Privacy

La Sentinelle ne stocke pas :

- texte DM ;
- texte commentaire ;
- body push privé ;
- adresse exacte.

## Kill switches

- social push ;
- calls push ;
- IRL reminders ;
- digests.

Tous visibles depuis cockpit mobile.

---

# 37. Tests d’acceptation Notifications V2

## NOTIF2-01 — INSERT forgé acteur

B ne peut créer une notif avec `from_id=A`.

## NOTIF2-02 — cible arbitraire

B ne peut générer une notification sociale à A sans action canonique correspondante.

## NOTIF2-03 — texte arbitraire push

Client ne peut envoyer un body push libre à une cible choisie.

## NOTIF2-04 — dispatcher template

Push sociale est rendue depuis template serveur.

## NOTIF2-05 — like valide

Like réel → au plus une notification logique.

## NOTIF2-06 — like toggle spam

like/unlike répété ne crée pas une rafale.

## NOTIF2-07 — comment valide

Commentaire autorisé → notification de l’auteur cible.

## NOTIF2-08 — comment private

Commentaire impossible sur contenu inaccessible → aucune notif.

## NOTIF2-09 — follow

Follow réel → bonne cible ; unfollow/refollow borné/dédupliqué.

## NOTIF2-10 — mention

Mention ne permet pas de spammer une cible inaccessible/bloquée.

## NOTIF2-11 — block

Après block, aucune nouvelle notif sociale/DM/appel/IRL directe.

## NOTIF2-12 — appel membership

`notify-call` refuse une cible sans relation/conversation autorisée selon politique.

## NOTIF2-13 — appel rate limit

Spam appels bloqué/limité serveur.

## NOTIF2-14 — permission pas onboarding

Aucun prompt navigateur pendant landing/onboarding/premier Feed.

## NOTIF2-15 — permission pas ouverture DM

Ouvrir une conversation seule ne déclenche plus le prompt OS.

## NOTIF2-16 — soft prompt

OS prompt seulement après tap explicite `Activer`.

## NOTIF2-17 — denied

Après refus OS, aucune boucle de prompt.

## NOTIF2-18 — preferences owner

A ne peut lire/modifier les préférences de B.

## NOTIF2-19 — messages preview off

Push message ne contient pas le texte DM par défaut.

## NOTIF2-20 — messages preview on

Si opt-in preview, comportement documenté sans fuite à d’autres comptes.

## NOTIF2-21 — IRL adresse

Push IRL n’expose aucune adresse privée.

## NOTIF2-22 — event cancelled

Participant reçoit une notification importante d’annulation.

## NOTIF2-23 — declined reminder

Utilisateur `declined` ne reçoit aucun rappel.

## NOTIF2-24 — waitlist promotion

Promotion réelle → notification prioritaire idempotente.

## NOTIF2-25 — mineur IRL

Compte 13–17 ne reçoit aucune invitation/rappel IRL actionable au premier lancement.

## NOTIF2-26 — deep link post

Tap like/comment ouvre le post si toujours autorisé.

## NOTIF2-27 — deep link private revoked

Accès retiré → deep link ne rend pas le contenu cache interdit.

## NOTIF2-28 — deep link message

Tap message ouvre conversation exacte après membership check.

## NOTIF2-29 — deep link event

Tap IRL ouvre événement exact sans contourner location RLS.

## NOTIF2-30 — seen owner

Destinataire peut marquer lu côté serveur.

## NOTIF2-31 — seen cross-account

B ne peut marquer la notification de A.

## NOTIF2-32 — cross-device read

Lire sur appareil 1 → état lu restauré appareil 2.

## NOTIF2-33 — local fallback

Ancien `seenNotifIds` ne ressuscite pas/duplique des notifs legacy.

## NOTIF2-34 — aggregation likes

Plusieurs likes rapprochés → push agrégée, centre in-app cohérent.

## NOTIF2-35 — unique critical

Annulation IRL n’est jamais perdue dans l’agrégation sociale.

## NOTIF2-36 — no rewards

Aucune notif Quest/Passia/points/rank.

## NOTIF2-37 — push tag

Deux posts différents ne s’écrasent pas à cause du même tag `like`.

## NOTIF2-38 — analytics privacy

Analytics notification ne contient aucun texte privé/body/adresse.

## NOTIF2-39 — dead subscriptions

404/410 supprime abonnement mort sans casser autres appareils.

## NOTIF2-40 — Sentinelle

Anomalie spam/authz/delivery visible au cockpit sans contenu privé.

## NOTIF2-41 — offline

Notification in-app chargée au retour réseau sans doublon.

## NOTIF2-42 — mobile

Centre, réglages et deep links fonctionnent mobile/PWA.

---

# 38. Ordre d’implémentation Claude Code

## N2-0 — audit dernière version réelle

Obligatoire :

- repo / branche / HEAD / status ;
- schéma prod régénéré ;
- policies `notifications` ;
- policies `push_subscriptions` ;
- `supaInsertNotif` ;
- `supaLoadNotifications` ;
- `supaMarkNotifSeen` ;
- realtime notifications ;
- `notify-call` ;
- SW push ;
- subscription client ;
- `openNotifSettings` ;
- tous les kinds producteurs.

## N2-1 — fermer le trou push générique P0

- `notify-call` limité aux appels ;
- block/membership/rate limit ;
- supprimer `type=notif` arbitraire ;
- test appel Edge Function direct.

## N2-2 — création notification server-authoritative

- choisir triggers/RPC ;
- kind/ref/target validés ;
- dedupe ;
- block ;
- tests raw REST.

## N2-3 — read state serveur

- confirmer/ajouter UPDATE owner-only ;
- `read_at` expand-only si retenu ;
- inspecter résultats Supabase au lieu de swallow erreurs ;
- cross-device test.

## N2-4 — push sociale dédiée

- fonction `dispatch-notification` ;
- notification_id comme entrée ;
- templates serveur ;
- prefs ;
- deep link ;
- tag canonique.

## N2-5 — réglages / permission UX

- soft prompt ;
- catégories ;
- preview messages ;
- plus de prompt au premier DM.

## N2-6 — simplification centre

- agrégation ;
- groupement temporel ;
- réglages accessibles ;
- zéro gamification.

## N2-7 — IRL notifications

Après IRL T&S :

- annulation ;
- update majeur ;
- waitlist ;
- reminders.

## N2-8 — digests découverte

Seulement après métriques, opt-in, fréquence saine.

---

# 39. Scope guard

Ne pas :

- reconstruire un système push externe si Web Push suffit ;
- laisser le client choisir librement cible + texte ;
- utiliser service_role côté client ;
- envoyer une push pour chaque like ;
- demander la permission au premier écran ;
- demander la permission juste parce qu’un DM s’ouvre ;
- envoyer texte DM sur lockscreen par défaut ;
- révéler adresse IRL ;
- contourner block ;
- réintroduire quest/streak/points/Passia ;
- utiliser FOMO (« 12 personnes t’attendent ») ;
- stocker body push privé en analytics/Sentinelle ;
- mélanger le correctif authz push avec une refonte visuelle massive.

---

# 40. Definition of Done

Notifications V2 est fondée lorsque :

- aucune notification sociale ne peut être forgée par simple requête client ;
- aucune push arbitraire ne peut cibler un utilisateur ;
- block/membership/privacy sont validés serveur ;
- `seen/read` fonctionne cross-device ;
- la permission OS n’est demandée qu’après consentement explicite ;
- messages/IRL importants restent fiables ;
- likes/réactions sont agrégés ;
- deep links ouvrent la bonne destination autorisée ;
- aucun texte DM/adresse privée ne fuit en push ;
- aucune notification Wallet/points/quest/rang ne subsiste ;
- préférences sont simples et owner-only ;
- Sentinelle supervise authz, spam et délivrabilité sans lire le contenu privé ;
- tests raw REST + PWA/mobile sont verts.

---

# 41. Répartition IA

## ChatGPT

- hiérarchie d’attention ;
- règles de fréquence ;
- permission UX ;
- priorités relation/IRL ;
- privacy lockscreen ;
- critères d’acceptation.

## Claude Code

- audit producteurs ;
- policies RLS ;
- triggers/RPC ;
- séparation `notify-call` / social push ;
- preferences ;
- service worker deep links ;
- tests multi-comptes/PWA ;
- Centre de pilotage.

## Codex

- appelle directement les endpoints avec cible arbitraire ;
- tente forge kind/ref/content ;
- spam call/follow/mention ;
- block bypass ;
- cross-account read/update/delete ;
- leak DM/adresse ;
- duplicate push / race realtime ;
- vérifie suppression complète Quest/Passia/points.
