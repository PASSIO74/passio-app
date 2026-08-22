# PASSIO — IRL V2 · Expérience produit complète

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Boucle cœur** : **Passion → contenu → personne → conversation → IRL → expérience → nouveau contenu**
- **Objet** : transformer le module IRL existant en pilier simple, sûr et directement relié au Feed, aux profils, aux conversations et à la création.

---

# 1. Décision produit

IRL n’est pas un agenda générique ni une copie de Meetup/Eventbrite.

Dans PASSIO, sa fonction est plus précise :

> **Transformer une passion découverte dans l’application en moment réel partagé avec les bonnes personnes.**

Le produit doit donc optimiser :

```text
Découvrir une activité pertinente
→ comprendre immédiatement si elle me correspond
→ sentir que je peux y aller en confiance
→ répondre simplement
→ discuter / se coordonner
→ participer
→ partager l’expérience
→ nourrir le Feed et de nouvelles relations
```

La métrique finale n’est pas « événements vus » ou « temps sur la carte ».

La valeur est :

```text
IRL pertinent découvert
→ intention réelle
→ participation réelle
→ relation / contenu après rencontre
```

---

# 2. État actuel vérifié à préserver

PASSIO possède déjà beaucoup de briques utiles.

## 2.1 Découverte IRL

L’écran actuel contient :

- action `Créer un événement` ;
- panneau `Outils` pour ville / filtres / mes événements ;
- carte interactive repliable en mode `peek` ;
- carte plein écran ;
- recherche `ville, événement…` ;
- liste d’événements ;
- filtres passions/date/distance/horaire selon l’état existant ;
- tris imminent / proche / populaire.

**Décision : préserver le moteur, simplifier la hiérarchie.**

## 2.2 RSVP riche

Le code gère déjà :

```text
going     = Je viens
maybe     = Peut-être
declined  = Je ne peux pas
waitlist  = Liste d’attente
```

C’est plus honnête qu’un simple booléen inscrit/non inscrit.

## 2.3 Capacité et liste d’attente

Le produit sait :

- compter les places ;
- détecter un événement complet ;
- proposer la liste d’attente ;
- promouvoir un inscrit lorsque de la place se libère.

La logique organisateur doit cependant être alignée avec les RLS avant lancement public.

## 2.4 Conversation événement

`events.conv_id` existe déjà.

Un RSVP `going` ou `maybe` peut rejoindre une conversation de groupe dédiée à l’événement.

La discussion événement est donc déjà un bon pont :

```text
RSVP
→ groupe de coordination
→ rencontre
```

Ne pas créer un deuxième système de chat IRL.

## 2.5 Fiche événement

La fiche actuelle sait afficher :

- cover ;
- titre ;
- date/heure ;
- ville/lieu/adresse ;
- organisateur ;
- participants ;
- RSVP ;
- engagement ;
- album ;
- discussion ;
- outils organisateur.

## 2.6 Après-événement

Le produit possède déjà :

- check-in ;
- notation ;
- feedback ;
- album événement ;
- `shareEventExperience(id)` ;
- rattachement d’un post à `posts.event_id` via le contexte de création.

C’est une fondation stratégique : l’IRL peut déjà reboucler vers le Feed.

## 2.7 Gestion organisateur

Le système possède déjà des briques :

- édition ;
- annulation ;
- co-organisateurs ;
- récurrence/série ;
- liste d’attente ;
- message aux inscrits ;
- invitations directes.

Il faut les mettre derrière une UX progressive, pas toutes au premier écran.

---

# 3. Problèmes V2 à corriger

## 3.1 Trop de données privées dans la surface publique

La fiche actuelle construit une adresse complète à partir de :

```text
address
postalCode
city
```

et propose un lien Google Maps.

Le schéma public contient également coordonnées exactes/contact.

Cela doit être corrigé côté serveur, pas seulement masqué dans l’UI.

## 3.2 Participants trop exposés

La liste brute d’inscrits/check-ins n’est pas un bon modèle public par défaut.

Savoir publiquement qui sera à quel endroit et à quel moment est une information sensible.

## 3.3 Carte trop proche d’un produit géolocalisé classique

La carte est utile, mais ne doit pas devenir l’écran dominant.

La plupart des utilisateurs doivent pouvoir décider depuis une liste de cartes lisibles, sans devoir manipuler une map.

## 3.4 Prix encore relié à Passia

Le rendu actuel transforme un prix non nul en :

```text
X 💎 Passia
```

Cette logique doit disparaître du cœur avec Wallet/Passia.

## 3.5 Gamification IRL legacy

Création/join/check-in peuvent encore déclencher récompenses, badges, points ou quêtes.

Le cœur IRL V2 ne doit pas pousser l’utilisateur à rencontrer des inconnus pour gagner des points.

## 3.6 Check-in actuel insuffisamment fiable

Le système actuel possède une expérience QR/check-in riche, mais l’audit Trust & Safety a montré que la preuve est encore trop dérivable/contrôlée côté client.

Ne pas afficher une participation comme « vérifiée » tant qu’une validation serveur forte n’existe pas.

## 3.7 Mineurs

Pour le premier lancement public :

```text
<13     compte refusé
13–17   Feed/contenu possibles
13–17   IRL désactivé
18+     IRL disponible
```

Ce garde doit être serveur.

---

# 4. Architecture IRL V2

Le pilier se décompose en six moments.

```text
1. Découvrir
2. Comprendre
3. Répondre
4. Se coordonner
5. Participer
6. Partager après
```

Chaque écran/action doit servir l’un de ces moments.

---

# 5. Écran IRL V2 — découverte

## 5.1 Header cible

```text
IRL
Des activités autour de tes Passio

[ Rechercher une activité ou une ville ]
```

À droite ou dans le header secondaire :

```text
[Créer]   [Filtres]
```

Sur mobile, `Créer` peut aussi rester accessible via le bouton central global `Créer → Activité IRL`.

L’écran IRL n’a donc pas besoin d’un énorme CTA permanent si la navigation V2 rend déjà Create omniprésent.

## 5.2 Filtres principaux visibles

Limiter à quelques intentions compréhensibles :

```text
Pour toi
Cette semaine
Près de moi / Ma ville
Mes Passio
```

Les filtres détaillés vivent sous `Filtres` :

- date ;
- distance ;
- Passio ;
- horaire ;
- places disponibles ;
- éventuellement gratuit.

## 5.3 Localisation

Ne jamais exiger le GPS pour utiliser IRL.

Ordre recommandé :

```text
ville choisie manuellement
→ ville déjà enregistrée explicitement
→ GPS uniquement sur action « Utiliser ma position »
```

Si GPS refusé : expérience entière toujours utilisable avec ville manuelle.

## 5.4 Carte

La carte reste secondaire et repliable.

Cible :

```text
[Liste] [Carte]
```

ou conserver le `peek` actuel si les tests mobile montrent qu’il reste intuitif.

Sur la carte publique :

- coordonnées approximatives ;
- pas de domicile exact ;
- clusters si densité ;
- tap marker → card résumé ;
- tap card → fiche événement.

---

# 6. Ranking / pertinence IRL

Le premier ranking IRL doit rester explicable.

Signaux candidats :

```text
Passio match
proximité approximative
fraîcheur / imminence
disponibilité de places
affinité avec organisateur
relations déjà connues (si visibilité autorisée)
qualité / complétude événement
sécurité / modération
diversité
exploration contrôlée
```

Ne pas maximiser :

- distance minimale à tout prix ;
- popularité brute ;
- événements payants ;
- organisateurs qui publient le plus.

## P0

Conserver le tri actuel fiable :

```text
imminent
proche
populaire
```

et ajouter une vue `Pour toi` seulement lorsque l’instrumentation permet d’en mesurer la qualité.

---

# 7. Carte événement dans la liste

Une card doit permettre une décision rapide.

```text
[cover]
🎵 Musique
Jam acoustique au parc
Samedi · 18:00
Lyon 6e · ~3 km

12 personnes · 4 places restantes

[Nina, que tu suis, y va]   ← seulement si autorisé

[Voir]                     [Je viens]
```

## Informations publiques autorisées

- titre ;
- Passio ;
- ville/zone ;
- date/heure ;
- distance approximative ;
- cover ;
- type ;
- nombre agrégé de participants ;
- places restantes ;
- organisateur public ;
- statut annulé/complet/terminé.

## Ne pas afficher publiquement par défaut

- adresse exacte ;
- GPS exact ;
- téléphone/contact ;
- liste brute complète des participants ;
- check-ins individuels ;
- feedback individuel ;
- identité d’un participant qui a choisi de masquer sa présence.

---

# 8. Preuve sociale sûre

La preuve sociale peut être utile :

> « Nina, que tu suis, y va »

mais uniquement si la visibilité RSVP de Nina l’autorise.

## Modèle cible

Ajouter une préférence utilisateur / événement permettant :

```text
show_rsvp_to_public
show_rsvp_to_followers
show_rsvp_to_participants
hide_rsvp_identity
```

La version P0 peut être plus simple :

- public → agrégats seulement ;
- participants inscrits → autres participants autorisés ;
- relation suivie → seulement avec opt-in clair.

Ne jamais déduire qu’un follow vaut consentement à publier sa localisation future.

---

# 9. Fiche événement V2

## 9.1 Hero

```text
[cover]
🎵 Musique
Jam acoustique au parc
Samedi 22 août · 18:00–20:00
Lyon 6e
```

CTA sticky :

```text
[Je viens]   [Peut-être]
```

ou un bouton unique ouvrant le sheet RSVP existant.

## 9.2 Sections prioritaires

Ordre :

```text
1. Ce qu’on va faire
2. Quand / zone
3. Organisé par
4. Places / RSVP
5. Ce qu’il faut savoir
6. Discussion (si autorisée)
7. Album après événement
```

## 9.3 Adresse précise

Avant autorisation :

```text
📍 Lyon 6e
Adresse communiquée après inscription
```

Après autorisation serveur :

```text
📍 Parc / adresse exacte
[Ouvrir dans Plans]
```

## 9.4 Contact

Ne pas publier le numéro de téléphone brut.

Préférer :

```text
Contacter l’organisateur
```

→ DM PASSIO ou conversation événement.

Un contact externe explicite peut exister pour certains événements professionnels, mais ce n’est pas le défaut communautaire.

---

# 10. Modèle de localisation cible

Conserver `events` comme surface de découverte sûre.

## `events`

Exposer :

```text
id
title
passion_id
city
area_label
lat/lng approximatifs
date_at / end_at
description safe
cover_url
status
max_attendees
event_type
organizer_id
conv_id
```

## `event_private_details`

Créer :

```text
event_id
venue_exact
address_exact
postal_code
lat_exact
lng_exact
contact
location_visibility
updated_at
```

`location_visibility` :

```text
public
rsvp
organizer_approval
```

Défaut :

```text
rsvp
```

---

# 11. RSVP V2

Préserver les quatre états existants.

## Je viens

Effets :

- écrit RSVP ;
- reçoit les détails autorisés ;
- rejoint la conversation événement si policy le permet ;
- notification/confirmation ;
- aucun point/récompense.

## Peut-être

Effets :

- intention faible ;
- discussion événement possible selon politique ;
- ne compte pas forcément dans capacité ferme ;
- aucune pression de notification excessive.

## Je ne peux pas

Effets :

- sortie claire ;
- pas de relance automatique agressive ;
- invitation future à cet événement non répétée.

## Liste d’attente

- ordre serveur ;
- promotion atomique côté serveur ;
- notification de promotion ;
- délai de confirmation éventuel P1.

---

# 12. RSVP et blocage

Un blocage compte ↔ compte domine toute logique IRL.

Si A bloque B :

- B ne voit pas les événements restreints de A ;
- B ne peut pas rejoindre/inviter/commenter/réagir directement ;
- A/B ne se retrouvent pas via suggestions sociales ;
- aucune conversation événement ne contourne le block.

Pour les grands événements publics, la politique de visibilité exacte devra être définie explicitement ; le block doit au minimum empêcher interaction et exposition relationnelle directe.

---

# 13. Conversation événement V2

Réutiliser `events.conv_id`.

## Accès

P0 recommandé :

```text
organisateur
co-organisateur
going
maybe
```

selon les policies durcies.

## Dans la conversation

Header :

```text
🎵 Jam acoustique au parc
Samedi · Lyon
[Voir l’activité]
```

Messages pour :

- coordination ;
- retard ;
- matériel ;
- point de rendez-vous ;
- questions.

## Adresse

Si l’utilisateur a droit à l’adresse exacte, elle peut être visible dans la fiche événement sécurisée.

Ne pas recopier automatiquement l’adresse exacte en texte dans chaque message système.

---

# 14. Invitations directes

Le mécanisme actuel peut être conservé avec garde-fous.

## Inviter

Depuis fiche événement :

```text
Inviter
→ personnes suivies / contacts PASSIO autorisés
```

## Règles

- ne pas inviter un utilisateur bloqué ;
- ne pas relancer automatiquement quelqu’un qui a décliné ;
- rate limit ;
- notification claire ;
- pas d’ajout automatique en attendee ;
- pas de SMS/email externe sans geste explicite.

---

# 15. Création d’événement V2

Le formulaire actuel est riche ; V2 doit appliquer de la divulgation progressive.

## Étape courte P0

```text
Créer une activité

Titre
Passio
Date / heure
Ville
Description courte
Places (optionnel)

[Continuer]
```

## Étape lieu

```text
Type de lieu
Zone publique
Adresse exacte
Qui peut voir l’adresse ?  RSVP ▼
```

## Options avancées

Sous `Plus d’options` :

- cover ;
- durée ;
- co-organisateurs ;
- récurrence ;
- lien externe ;
- informations pratiques.

## Identité

Afficher :

> **Organisé en tant que 🎵 Benjamin · Musique**

Ne pas switcher silencieusement de profil passion.

Après Profil V2 serveur :

```text
events.organizer_id = compte
events.passion_profile_id = identité publique
```

---

# 16. Prix / monétisation

## P0 cœur

Recommandation : lancement communautaire IRL en priorité **gratuit**.

L’interface ne doit plus afficher de Passia.

Pour les anciens événements ayant `price > 0` :

```text
Payant
```

sans unité Passia inventée.

## P1

Si un besoin réel de paiement est prouvé :

- paiement fiat direct ;
- checkout dédié ;
- remboursement ;
- conformité ;
- frais transparents ;
- pas de monnaie interne.

Ne pas mélanger ce chantier avec IRL V2 initial.

---

# 17. Mineurs

## P0 public

Serveur :

```text
age < 18
→ création IRL refusée
→ RSVP IRL refusé
→ invitations IRL refusées
→ discussion événement refusée
```

L’UI masque/désactive en défense secondaire.

Message produit simple :

> Les rencontres IRL ne sont pas encore disponibles pour les comptes mineurs.

Ne pas demander de justification ou contourner via consentement client-only.

---

# 18. Check-in V2

Le check-in ne doit pas être un mécanisme de gamification.

But :

- présence utile pour organisateur ;
- déclencher éventuellement le feedback post-événement ;
- améliorer la mesure du funnel réel.

## Validation cible

Serveur génère/valide un token non dérivable :

```text
checkin_sessions
ou RPC sécurisée
```

Propriétés :

- token aléatoire ;
- expiration ;
- event_id ;
- idempotence ;
- validation membership/RSVP ;
- rotation possible ;
- logs audit.

## GPS

Si distance GPS utilisée :

- calcul local possible ;
- ne pas persister position brute ;
- le serveur ne doit pas recevoir un historique GPS ;
- prévoir voie QR/code pour accessibilité.

## Ne pas afficher

`✓ présence vérifiée` tant que ce modèle serveur n’est pas opérationnel.

---

# 19. Après l’événement

C’est un différenciateur majeur PASSIO.

## Timing

Après fin :

```text
Comment ça s’est passé ?
[Partager un souvenir]
[Donner un retour]
```

## Partager un souvenir

Réutiliser Creation V2 :

```text
Publication
→ event_id prérempli
→ Feed
→ album événement
```

Le CTA remplace l’ancien chemin Studio quand Creation V2 est disponible.

## Contenu post-IRL

Peut être :

- texte ;
- photo ;
- vidéo ;
- Bobine.

Bobine liée à `event_id` reste une Bobine normale dans le Feed, avec contexte IRL sûr.

---

# 20. Album événement

L’album existant doit devenir un agrégateur de contenus `posts.event_id`.

## Règle

Afficher seulement les posts que l’utilisateur a le droit de voir.

Ne pas rendre public un post privé parce qu’il appartient à un événement public.

## UX

```text
Souvenirs de l’activité
[grid contenu]
```

Tap → post canonique.

---

# 21. Feedback / note

## Séparer deux concepts

### Feedback privé

Pour l’organisateur / modération produit :

```text
Comment s’est passée l’activité ?
```

### Signal public

Si note publique conservée :

- agrégat ;
- nombre minimum de réponses ;
- pas de commentaire personnel public sans consentement.

`event_attendees.feedback` ne doit jamais être publiquement lisible en brut.

---

# 22. Organisateur V2

## Dashboard simple

Dans `Gérer` :

```text
12 viennent
3 peut-être
2 en attente

[Modifier]
[Discussion]
[Inviter]
[Participants autorisés]
[…]
```

## Actions avancées

Sous `…` :

- co-organisateurs ;
- annuler ;
- série/récurrence ;
- exports éventuels futurs.

## Pas de score organisateur générique

Ne pas créer un « Trust Score » ou rang public.

La confiance se construit via :

- identité ;
- historique de contenus ;
- relations ;
- signalements/modération ;
- événements passés visibles si autorisés ;
- informations contextuelles.

---

# 23. Co-organisateurs

Conserver la fonctionnalité, mais corriger les autorisations.

Le serveur doit distinguer :

```text
organizer
co-organizer
participant
```

et autoriser uniquement les opérations prévues.

Une simple présence du user ID dans un JSON client ne doit pas suffire à élever les privilèges.

P1 recommandé : table structurée `event_organizers` si les besoins dépassent le modèle actuel.

---

# 24. Événements privés / invitation-only

Ne pas simuler en UI.

## P1 structuré

Ajouter par exemple :

```text
events.visibility
public
unlisted
invite_only
```

avec RLS réelle.

## Public

Découvrable dans IRL/Feed selon règles.

## Unlisted

Accessible par lien aux utilisateurs autorisés selon politique.

## Invite-only

Accès uniquement via invitation/membership serveur.

Ce chantier ne doit pas être bloquant pour le lancement P0 si IRL public est suffisamment sécurisé.

---

# 25. Feed ↔ IRL

Le Feed doit montrer de l’IRL de manière contextuelle, pas comme publicité permanente.

## Entrées possibles

### Post lié à événement

```text
📍 Activité liée
Jam acoustique · samedi · Lyon
[Voir]
```

### Module Feed

Après Trust & Safety :

```text
Autour de ta Passio
3 activités cette semaine
```

### Bobine

Une Bobine peut mener vers :

- événement lié ;
- prochaine activité similaire ;
- personnes partageant cette Passio.

## Ne pas faire

- injecter des événements tous les N posts arbitrairement ;
- booster un événement parce qu’il est payant ;
- exposer adresse ou participants dans la carte Feed.

---

# 26. Profil ↔ IRL

Profil public V2 peut afficher :

```text
Activités organisées
```

uniquement pour événements réellement publics.

## Ne pas afficher par défaut

> « Benjamin participe samedi à … »

La participation d’une personne n’est pas automatiquement une donnée de profil public.

Le propriétaire peut éventuellement choisir d’afficher certaines activités futures/passées, P1.

---

# 27. Messages ↔ IRL

Réutiliser `PASSIO_MESSAGES_CONVERSATION_V2_2026-08-20.md` et le lot Conversation → IRL.

```text
conversation
→ Proposer un IRL
→ formulaire canonique
→ création explicite
→ retour conversation
→ lien/card événement
```

Aucun auto-RSVP ni auto-invitation.

---

# 28. Notifications IRL

Notifications utiles uniquement.

## P0

- invitation reçue ;
- RSVP confirmé ;
- événement modifié de manière importante ;
- événement annulé ;
- promotion liste d’attente ;
- rappel avant événement si activé ;
- nouveau message groupe événement selon préférences.

## Ne pas notifier agressivement

- popularité ;
- « X personnes viennent » répétitif ;
- rappel à quelqu’un qui a décliné ;
- proximité GPS permanente.

---

# 29. Rappels

Défaut raisonnable :

```text
24h avant
2h avant
```

mais contrôlable.

Une modification importante :

- heure ;
- date ;
- ville ;
- annulation ;

peut justifier notification indépendante.

Ne pas envoyer l’adresse exacte dans une notification lockscreen si elle est sensible.

---

# 30. Annulation / changement majeur

## Organisateur

Annuler explicitement avec confirmation.

## Participants

Recevoir notification.

## Fiche

Reste consultable avec statut :

```text
Annulé
```

pour conserver contexte/historique.

## Changement date/ville

Demander éventuellement re-confirmation RSVP si changement majeur.

P1.

---

# 31. Recherche IRL

La recherche actuelle inspecte titre/ville/lieu/adresse/description/type/Passio.

## V2 public

Ne pas rechercher sur `address_exact` côté public.

Indexables :

```text
title
city
area_label
description publique
Passio
event_type
organisateur public
```

Adresse exacte reste dans table privée et ne participe pas aux résultats non autorisés.

---

# 32. Données et RLS — modèle cible

## `events`

Public safe fields.

SELECT : selon visibilité/block/privacy.

INSERT :

```text
organizer_id = auth.uid()
age gate
block invariants
```

UPDATE/DELETE : organisateur/co-organisateur autorisé.

## `event_private_details`

SELECT :

```text
organizer/co-organizer
OU participant autorisé par location_visibility
```

## `event_attendees`

Public : aucune lecture brute.

Participant : sa propre ligne + données autorisées.

Organisateur : données nécessaires à la gestion, jamais feedback exposé à d’autres participants.

## commentaires/réactions

Membership/visibilité/block cohérents avec événement.

---

# 33. Agrégats publics

Créer vue/RPC sûre pour :

```text
going_count
maybe_count optionnel
spots_left
rating_average
rating_count
```

La liste publique ne doit pas télécharger toutes les lignes `event_attendees` pour faire un compteur côté client.

---

# 34. Identité multi-profil IRL

Après Profil V2 serveur :

```text
events.organizer_id = account id
events.passion_profile_id = identité organisatrice
```

La fiche affiche cette identité stable.

Un changement de profil actif ne modifie pas rétroactivement l’organisateur public d’un ancien événement.

## Participant

RSVP reste account-level en P0.

Ne pas rendre un utilisateur capable de s’inscrire trois fois avec trois profils passion.

---

# 35. Analytics IRL V2

Événements :

```text
irl_screen_viewed
irl_search_used
irl_filter_applied
irl_event_impression
irl_event_opened
irl_rsvp_opened
irl_rsvp_changed
irl_waitlist_joined
irl_conversation_opened
irl_invite_sent
irl_create_opened
irl_create_succeeded
irl_create_failed
irl_checkin_attempted
irl_checkin_succeeded
irl_post_event_prompt_shown
irl_post_event_contribution_created
```

## Propriétés autorisées

- `source` ;
- `passion_id` ;
- `event_type` ;
- `distance_bucket` ;
- `time_until_bucket` ;
- `rsvp_state` ;
- `is_organizer` ;
- `has_capacity` ;
- `is_from_conversation` ;
- `is_from_feed`.

## Interdit

- adresse exacte ;
- lat/lng exacts ;
- téléphone ;
- contact ;
- texte libre feedback ;
- noms des participants ;
- message privé.

---

# 36. Funnel IRL

```text
irl_event_impression
→ irl_event_opened
→ irl_rsvp
→ irl_conversation_opened
→ irl_attended
→ post_irl_contribution
```

Segments :

- depuis Feed ;
- depuis Profil ;
- depuis Conversation ;
- depuis écran IRL ;
- par Passio ;
- par distance bucket.

La présence réelle ne peut être utilisée dans le funnel que si le check-in est suffisamment fiable.

Sinon distinguer :

```text
rsvp_going
vs
attendance_verified
```

---

# 37. Métriques produit

## Activation IRL

% utilisateurs éligibles qui :

```text
ouvrent un événement pertinent
→ RSVP
```

## Conversion relationnelle

```text
conversation → IRL
```

## Réalité

```text
RSVP → présence vérifiée
```

## Boucle

```text
présence → nouveau contenu
```

## Qualité

- annulations ;
- no-show ;
- reports ;
- blocks post-event ;
- feedback qualitatif agrégé ;
- incidents sécurité.

Ne pas optimiser la croissance IRL sans suivre ces contre-métriques.

---

# 38. Sentinelle / Centre de pilotage

Tout IRL est supervisé.

## Sécurité

- accès `event_private_details` refusé ;
- tentative lecture participants brute ;
- RSVP mineur refusé ;
- block bypass ;
- check-in invalide/répété ;
- co-organizer privilege violation ;
- spam invitations ;
- hausse reports.

## Produit

- taux échec création ;
- taux échec RSVP ;
- discussion événement inaccessible ;
- album post-event cassé ;
- deep links événement cassés.

## Performance

- temps chargement liste ;
- temps carte ;
- géocodage ;
- latence RSVP ;
- latence conversation événement.

## Kill switches possibles

- check-in ;
- invitations ;
- création d’événement ;
- carte précise ;
- conversation événement.

Chaque switch doit être traçable et visible mobile dans le Centre de pilotage.

---

# 39. Tests d’acceptation IRL V2

## IRL2-01 — découverte sans GPS

Ville manuelle → événements utilisables sans permission de localisation.

## IRL2-02 — GPS explicite

Aucune permission GPS au simple ouverture de l’écran.

## IRL2-03 — liste prioritaire

Les cards événements sont visibles sans devoir déplier la carte.

## IRL2-04 — recherche sûre

La recherche publique ne retourne pas de résultat grâce à une adresse exacte privée.

## IRL2-05 — localisation publique

Non-inscrit voit ville/zone, pas adresse exacte pour événement `rsvp`.

## IRL2-06 — adresse après RSVP

Participant `going` autorisé obtient l’adresse via policy serveur.

## IRL2-07 — API brute adresse

Compte non autorisé ne peut lire `event_private_details`.

## IRL2-08 — participants publics

Compte anonyme/non participant ne peut lire lignes `event_attendees` brutes.

## IRL2-09 — agrégats

Public obtient seulement compteurs autorisés.

## IRL2-10 — RSVP going

Écriture acceptée, état UI cohérent, aucune récompense.

## IRL2-11 — RSVP maybe

Maybe fonctionne sans compter comme présence vérifiée.

## IRL2-12 — decline

Decline retire accès selon politique et ne déclenche pas relance agressive.

## IRL2-13 — waitlist

Événement complet → waitlist serveur.

## IRL2-14 — promotion waitlist

Place libérée → promotion atomique autorisée, pas manipulation client cross-account.

## IRL2-15 — block

Blocage empêche nouvelle interaction IRL côté serveur.

## IRL2-16 — mineur

Compte 13–17 → création/RSVP/discussion événement refusés par serveur.

## IRL2-17 — création minimum

Titre/Passio/date/ville suffisent au flux de base selon champs requis définis.

## IRL2-18 — identité création

Identité organisatrice visible avant publication ; aucun switch silencieux.

## IRL2-19 — prix

Aucun `Passia`, point, étoile, récompense dans création/join/detail.

## IRL2-20 — legacy price

Ancien événement price>0 n’affiche pas de devise Passia inventée.

## IRL2-21 — conversation événement

Going/maybe autorisé peut ouvrir le groupe lié.

## IRL2-22 — non participant conversation

Compte extérieur ne lit/n’écrit pas dans groupe événement.

## IRL2-23 — conversation source

Conversation→IRL conserve son thread source séparé du groupe événement.

## IRL2-24 — invitation

Invitation n’inscrit pas automatiquement la cible.

## IRL2-25 — invitation block

Utilisateur bloqué absent/refusé.

## IRL2-26 — check-in token

Token non dérivable, expirant, idempotent.

## IRL2-27 — check-in forged

Event ID public seul ne permet pas de forger une présence.

## IRL2-28 — GPS check-in privacy

Aucune position brute conservée dans analytics/log produit.

## IRL2-29 — post-event contribution

Après événement, CTA ouvre Creation V2 avec `event_id` préservé.

## IRL2-30 — album

Post lié apparaît dans album seulement si viewer a droit de voir le post.

## IRL2-31 — Bobine event-linked

Bobine liée reste visible dans Feed et album sans fuite localisation.

## IRL2-32 — feedback privé

Feedback libre non lisible publiquement par API.

## IRL2-33 — rating agrégé

Seul agrégat autorisé visible publiquement.

## IRL2-34 — annulation

Événement annulé reste identifiable et participants notifiés.

## IRL2-35 — co-organizer authz

Participant normal ne peut exercer aucune action organisateur.

## IRL2-36 — recurrence

Modifier/annuler une occurrence ne corrompt pas la série.

## IRL2-37 — deep link

`#irl-event-<id>` ouvre la bonne fiche si autorisée.

## IRL2-38 — event private details deep link

Deep link ne contourne pas RLS localisation.

## IRL2-39 — analytics privacy

Aucun payload analytics IRL ne contient adresse/GPS/contact/participant.

## IRL2-40 — Sentinelle

Violation RLS/check-in/block visible au cockpit sans PII sensible.

## IRL2-41 — mobile

Liste, fiche, RSVP, création et conversation accessibles au pouce et clavier mobile.

## IRL2-42 — offline/error

Échec RSVP/création ne produit pas de faux succès.

---

# 40. Ordre d’implémentation Claude Code

## I2-0 — vérification obligatoire de la dernière version réelle

Avant tout :

- repo ;
- branche ;
- HEAD ;
- status ;
- version UI réellement exécutée ;
- comparaison avec référence mobile la plus récente.

## I2-1 — Trust & Safety localisation/participants

Avant redesign de croissance :

- `event_private_details` ;
- safe public events ;
- agrégats attendees ;
- block helper ;
- tests RLS bruts.

## I2-2 — authz conversation IRL + mineurs

- DM/group membership ;
- event conversation membership ;
- gate 13–17 serveur ;
- commentaires/réactions block-aware.

## I2-3 — check-in serveur

- token/nonce ;
- idempotence ;
- suppression faux `verified` client-only ;
- tests attaque.

## I2-4 — expérience découverte

- simplifier header/filtres ;
- liste prioritaire ;
- carte secondaire ;
- GPS explicite ;
- conserver les handlers de filtres existants.

## I2-5 — fiche événement V2

- zone publique ;
- adresse gated ;
- organisateur ;
- RSVP ;
- discussion ;
- zéro Passia/points ;
- participants agrégés.

## I2-6 — création V2

- formulaire progressif ;
- `Créer → Activité IRL` ;
- identité organisatrice explicite ;
- location visibility ;
- options avancées secondaires.

## I2-7 — Conversation → IRL

Implémenter le lot déjà spécifié après gates sécurité.

## I2-8 — après-événement

- Creation V2 ;
- `event_id` ;
- album ;
- feedback privé ;
- analytics funnel.

## I2-9 — ranking `Pour toi`

Seulement après instrumentation, sans casser les tris simples existants.

---

# 41. Scope guard

Ne pas :

- réécrire le moteur événement complet ;
- remplacer carte/realtime sans nécessité ;
- ajouter un Trust Score ;
- réintroduire points/Passia/badges comme motivation IRL ;
- demander GPS au démarrage ;
- publier adresse exacte par défaut ;
- afficher attendees/check-ins bruts publiquement ;
- appeler un événement privé sans RLS ;
- auto-inscrire une personne invitée ;
- auto-RSVP depuis une conversation ;
- confondre conversation source et groupe événement ;
- hard-delete l’historique à l’annulation ;
- promouvoir `attendance verified` avec le check-in client actuel ;
- mélanger migration T&S et refonte visuelle dans un méga-diff ;
- permettre à un mineur de contourner le gate par appel API ;
- optimiser IRL au nombre d’événements ou de messages au détriment de la sécurité.

---

# 42. Definition of Done

IRL V2 est prêt lorsque :

- la liste permet de découvrir une activité pertinente immédiatement ;
- GPS est facultatif ;
- carte est secondaire ;
- adresse/coordonnées/contact sensibles sont protégés serveur ;
- participants/check-ins ne sont pas publics en brut ;
- RSVP et waitlist sont fiables ;
- block domine l’IRL ;
- mineurs 13–17 sont réellement bloqués côté serveur au premier lancement ;
- groupe événement respecte membership ;
- check-in est serveur et non forgeable ;
- création est simple, identité explicite, sans Passia/points ;
- Conversation → IRL est naturel ;
- post-event → Creation V2 → Feed fonctionne ;
- album respecte visibilité des posts ;
- analytics ne contient aucune localisation privée ;
- Sentinelle supervise chaque nouvelle brique ;
- tests multi-comptes / authz / mobile sont verts.

---

# 43. Répartition IA

## ChatGPT

- architecture produit IRL ;
- hiérarchie découverte/fiche/création ;
- arbitrage privacy UX ;
- intégration Feed/Profile/Messages/Creation ;
- critères d’acceptation ;
- funnel et contre-métriques sécurité.

## Claude Code

- vérité du repo et schéma ;
- migrations expand-only ;
- RLS `events` / private details / attendees ;
- gate mineurs ;
- check-in serveur ;
- simplification UI ;
- réutilisation handlers existants ;
- tests multi-comptes et raw REST ;
- instrumentation Centre de pilotage.

## Codex

- attaque lecture adresse/participants ;
- forge RSVP/check-in ;
- block bypass ;
- escalation co-organizer ;
- deep-link bypass ;
- mineur appel API ;
- leak analytics ;
- race waitlist ;
- régression conversation événement ;
- vérifie qu’aucune mécanique Passia/points ne subsiste dans l’IRL cœur.
