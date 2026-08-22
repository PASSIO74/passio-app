# PASSIO — Lot Conversation → IRL

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **But** : transformer une conversation née autour d’une passion en proposition puis en expérience IRL, sans réinventer ni la messagerie ni le module événements.

## 1. Réalité actuelle vérifiée

PASSIO possède déjà les deux briques nécessaires :

1. une messagerie cross-compte avec conversations, membres et messages ;
2. un système IRL riche avec RSVP, liste d’attente, check-in, co-organisateurs, récurrence, album d’événement et discussion de groupe.

Le chaînon manquant est essentiellement **l’orchestration entre les deux**.

### Événement ↔ conversation déjà existant

`events` possède déjà `conv_id`.

Quand un utilisateur répond `going` ou `maybe` à un événement, le code appelle `_joinEventConversation(ev)`. Quand il se désinscrit, `_leaveEventConversation(ev)` est appelé. L’organisateur reste dans le groupe.

`_joinEventConversation` :

- crée la conversation événement si nécessaire ;
- évite les créations parallèles en réservant la création au gestionnaire ;
- écrit `ev.convId` ;
- met à jour l’événement ;
- ajoute le membre ;
- crée le miroir local attendu par la messagerie.

L’accès à la discussion événement refuse également les utilisateurs non inscrits/non gestionnaires.

**Conclusion** : ne pas créer un deuxième modèle de groupe IRL.

## 2. Limite de schéma à respecter au premier lot

La photographie production du 2026-08-17 montre :

- `conversations`: `id`, `is_group`, `group_name`, `passion_id`, `created_by`, `created_at`, `description` ;
- `conv_members`: `conv_id`, `user_id` ;
- `conv_messages`: `id`, `conv_id`, `from_id`, `content`, `created_at` ;
- `events.conv_id` existe déjà.

`conv_messages` n’a pas aujourd’hui de colonne structurée `event_id`/`meta` dans la photographie de production.

**Décision P0** : ne pas ajouter une migration de messagerie uniquement pour rendre une carte IRL. Le premier lot doit utiliser le contenu persistant existant et un deep link déterministe. Une extension structurée de message ne vient que si les métriques montrent qu’elle est nécessaire.

## 3. Parcours cible P0

### Étape A — Conversation active

Dans une conversation 1:1 ou de groupe ordinaire, afficher une action secondaire claire :

**🤝 Proposer un IRL**

Emplacements possibles, par ordre de préférence :

1. tiroir/actions de la conversation ;
2. action compacte dans le header ;
3. menu `+` près du composer.

Ne pas transformer le composer en barre d’actions surchargée.

### Étape B — Préremplissage intelligent mais prudent

Le CTA appelle le formulaire IRL existant (`openCreateEvent`) avec un contexte optionnel.

Préremplir uniquement :

- `passion` depuis `conversation.passion_id` si présent ;
- sinon passion du profil actif si non ambiguë ;
- titre suggéré seulement si l’utilisateur peut le modifier immédiatement ;
- ville/zone uniquement si l’utilisateur l’a déjà explicitement utilisée dans ce flux ou la saisit.

**Ne jamais préremplir automatiquement l’adresse précise ou les coordonnées GPS depuis la position de l’appareil.**

Le formulaire existant reste la source de vérité pour :

- titre ;
- passion ;
- ville ;
- date/heure ;
- lieu/adresse ;
- description ;
- capacité ;
- type/prix/contact/lien si ces champs sont conservés dans l’UX finale.

### Étape C — Création explicite

Aucun événement n’existe avant validation explicite de l’utilisateur.

Le bouton de création doit rester celui du flux IRL existant (`submitEvent`) plutôt qu’une seconde fonction parallèle.

Sur échec serveur :

- ne pas afficher « événement partagé » ;
- ne pas envoyer de lien dans la conversation ;
- conserver le brouillon ou permettre de réessayer selon le comportement existant.

### Étape D — Retour automatique vers la conversation source

Après une création réellement réussie :

1. conserver l’`eventId` ;
2. revenir à la conversation source ;
3. proposer un message prérempli ou l’envoyer uniquement après geste explicite selon l’UX retenue ;
4. contenu recommandé : titre + date/ville + lien canonique `#irl-event-<eventId>`.

Exemple fonctionnel :

`🤝 IRL proposé : Session photo au coucher du soleil · samedi 19h · Lyon — Ouvrir l’événement`

Le lien canonique est déjà un comportement que la suite IRL protège : `#irl-event-<id>` doit ouvrir la fiche correspondante.

### Étape E — Rendu riche sans nouvelle colonne DB

Le renderer de message peut reconnaître un lien PASSIO contenant `#irl-event-<id>` et afficher une carte enrichie **à partir de l’événement déjà stocké**, tout en conservant le texte brut comme fallback.

Règles :

- parser uniquement les liens internes PASSIO attendus ;
- récupérer l’événement via la fonction canonique existante ;
- si l’événement n’est pas chargé/introuvable, afficher le message normal ;
- si l’événement est annulé, la carte doit le montrer ;
- ne jamais faire confiance à du HTML contenu dans le message ;
- ne pas ajouter de payload JSON opaque dans `content` au P0.

Cela fournit une UX de « carte IRL » sans migration `conv_messages`.

## 4. Ne pas auto-inscrire les interlocuteurs

Créer/proposer un IRL depuis une conversation ne vaut jamais RSVP pour les autres membres.

Règles :

- l’organisateur suit le comportement actuel du module IRL ;
- les autres membres restent libres de choisir `going`, `maybe`, `declined` ou aucune réponse ;
- aucun ajout silencieux à `event_attendees` ;
- aucune création silencieuse d’une nouvelle conversation avec les membres de la conversation source.

Le groupe événement existant est rejoint via les règles RSVP déjà en place.

## 5. Relation entre conversation source et conversation événement

Il existe deux conversations conceptuellement différentes :

### Conversation source

Exemple : Alice ↔ Bob parlent de photographie.

Elle sert à :

- découvrir l’envie de se voir ;
- proposer l’IRL ;
- partager le lien de l’événement.

### Conversation événement

Elle est liée à `events.conv_id` et sert aux participants confirmés/possibles :

- logistique ;
- coordination ;
- questions collectives ;
- suite de l’événement.

**Ne pas fusionner les deux automatiquement.**

Dans un 1:1, cette séparation peut sembler redondante mais elle devient essentielle dès que d’autres personnes rejoignent l’événement.

## 6. Confidentialité et localisation

Point important : le schéma `events` actuel contient `venue`, `address`, `postal_code`, `lat`, `lng`, mais la photographie production ne montre pas de champ `visibility` sur `events`.

Donc le lot Conversation → IRL ne doit **pas** présenter un événement comme « privé à la conversation » tant qu’une vraie règle d’autorisation serveur n’existe pas.

P0 :

- ne pas promettre de privacy que le serveur n’applique pas ;
- ville/zone avant adresse précise dans le flow de proposition ;
- l’adresse exacte reste une saisie explicite ;
- ne jamais transférer la géolocalisation du téléphone dans la conversation sans geste explicite ;
- conserver block/report/authz comme barrières transverses.

Si un mode événement privé/invitation-only devient nécessaire, il faudra un lot séparé avec colonne/règles RLS/tests multi-comptes ; pas un simple flag UI.

## 7. Contexte multi-profil

Le parcours doit respecter l’identité passionnelle active.

Avant création :

- afficher clairement l’identité/profil qui crée l’événement ;
- utiliser la passion de la conversation seulement comme suggestion ;
- ne jamais changer silencieusement de profil ;
- l’`organizer_id`/auteur doit rester cohérent avec le modèle d’identité réellement utilisé par le backend.

Si une conversation n’a pas de `passion_id`, ne pas inventer une passion à partir du texte des messages.

## 8. Instrumentation du maillon Conversation → IRL

La table `analytics_events` est déjà générique et append-only avec `event` + `properties jsonb`. Aucun nouveau fournisseur analytics n’est requis.

Événements recommandés :

- `conversation_irl_cta_opened`
- `conversation_irl_form_opened`
- `irl_created_from_conversation`
- `irl_share_prompt_shown`
- `irl_shared_to_conversation`
- `irl_opened_from_conversation`
- `irl_rsvp_after_conversation`
- `irl_checkin_after_conversation`

Propriétés minimales :

- `conversation_type`: `direct | group | event_group`
- `has_conversation_passion`: bool
- `passion_id`: si non sensible et conforme au modèle analytics
- `event_id`
- `source_screen`: `messages`

Ne pas envoyer le texte des messages, l’adresse précise ou les coordonnées GPS dans les analytics.

## 9. Fichiers candidats pour Claude Code

À confirmer par recherche locale avant modification :

- `index.html` — emplacement du CTA/menu de conversation ;
- `js/app-04-comments-shop.js` — logique de conversation/message, `openConversation`, `sendMessageFp`, renderer message ;
- `js/app-07-ia-explore-irl.js` — `openCreateEvent`, `submitEvent`, RSVP, discussion événement ;
- `js/app-02-state-utils.js` ou fichier Supabase réel — helpers analytics / persistance si nécessaire ;
- `styles.css` — carte/CTA compact ;
- `tests/e2e/irl.spec.js` ;
- nouveau `tests/e2e/message-to-irl.spec.js` recommandé ;
- `tests/e2e/multi-comptes.spec.js` pour validation cross-compte sensible.

Claude doit annoncer les fichiers exacts avant de modifier.

## 10. Tests P0 proposés

### M2I-01 — CTA présent

Dans une conversation directe ordinaire, `Proposer un IRL` est accessible sans remplacer les actions message essentielles.

### M2I-02 — Passion préremplie

Une conversation avec `passion_id=photo` ouvre le formulaire avec `photo`, sans basculer le profil actif silencieusement.

### M2I-03 — Pas de localisation implicite

Ouvrir le flow depuis une conversation ne remplit pas `address`, `lat`, `lng` à partir de la position navigateur.

### M2I-04 — Annulation

Fermer le formulaire sans publier ne crée aucun événement et n’écrit aucun message d’invitation.

### M2I-05 — Échec de publication

Si `supaPublishEvent` échoue, aucun message « IRL créé » ni lien n’est envoyé.

### M2I-06 — Succès

Une création réussie depuis `conv-source` produit un event unique et permet de revenir à `conv-source` avec le lien canonique.

### M2I-07 — Deep link

Le lien `#irl-event-<id>` partagé dans la conversation ouvre la bonne fiche événement.

### M2I-08 — Aucun RSVP forcé

Les autres membres de la conversation ne sont pas ajoutés à `event_attendees` au moment de la création.

### M2I-09 — RSVP → groupe événement

Quand un interlocuteur répond `going` ou `maybe`, le comportement existant le rattache à la conversation `events.conv_id`.

### M2I-10 — Désinscription

Quitter l’événement retire le participant du groupe événement selon les règles existantes ; l’organisateur reste membre.

### M2I-11 — Événement annulé

Un ancien message d’invitation reste rendu, mais ouvrir l’événement montre l’état annulé et empêche de rejoindre.

### M2I-12 — Blocage

Le nouveau CTA ne contourne jamais les protections de blocage/accès de la messagerie ou de l’IRL.

### M2I-13 — Multi-profil

Créer l’IRL conserve explicitement l’identité choisie ; aucun changement de profil implicite.

### M2I-14 — Analytics sans contenu sensible

Les événements de funnel sont écrits sans texte de conversation, adresse exacte ni GPS.

## 11. Ordre d’implémentation recommandé

1. Ajouter CTA Conversation → IRL.
2. Introduire un contexte temporaire `sourceConversationId` sans DB.
3. Préremplir `openCreateEvent` de manière non intrusive.
4. Réutiliser `submitEvent`.
5. Sur succès seulement, revenir à la conversation source.
6. Partager un lien canonique événement via le pipeline de message existant.
7. Enrichir le renderer pour transformer les liens internes d’événements en carte, avec fallback texte.
8. Ajouter instrumentation.
9. Ajouter tests ciblés.
10. Faire passer les suites sécurité/multi-compte concernées.

## 12. Hors scope du premier lot

- nouveau système de rencontre/date ;
- matching romantique ;
- géolocalisation automatique persistée ;
- événement « privé » uniquement UI ;
- ajout automatique de tous les membres à un événement ;
- nouvelle table `event_invites` sans besoin prouvé ;
- `conv_messages.meta` ou `event_id` tant que le lien canonique suffit ;
- recommandation IA de lieux basée sur l’historique privé de conversation ;
- paiement/billetterie/Wallet/Passia.

## 13. Definition of Done

Le lot est terminé quand un utilisateur peut réellement faire :

**conversation → Proposer un IRL → créer → partager → interlocuteur ouvre → RSVP → discussion événement**

avec :

- zéro duplication du moteur de messagerie ;
- zéro duplication du moteur IRL ;
- zéro RSVP silencieux ;
- zéro promesse de confidentialité non appliquée serveur ;
- aucune exposition GPS implicite ;
- deep link fonctionnel ;
- tests de non-régression verts ;
- funnel instrumenté avec provenance.

## 14. Répartition IA

- **ChatGPT** : parcours produit, privacy/safety, critères d’acceptation, arbitrage de scope.
- **Claude Code** : modifications multi-fichiers, intégration dans messagerie + IRL existants, tests locaux.
- **Codex** : contrôle du diff, recherche de contournements block/authz, doublons d’événement/conversation, fuite de localisation et régressions cross-compte.
