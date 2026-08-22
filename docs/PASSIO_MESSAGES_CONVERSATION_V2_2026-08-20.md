# PASSIO — Messages & Conversation V2

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Mission** : faire de la messagerie le pont humain entre découverte et IRL, sans devenir un produit parallèle surchargé.

---

## 1. Décision produit

Messages n’est pas un univers autonome à maximiser.

Son rôle dans PASSIO est :

```text
contenu pertinent
→ personne intéressante
→ profil
→ conversation
→ confiance / coordination
→ IRL
```

La messagerie doit donc être :

- simple ;
- rapide ;
- fiable ;
- sûre ;
- orientée relation humaine ;
- compatible avec le multi-profil ;
- capable de conduire naturellement vers un IRL.

Elle ne doit pas devenir :

- un Slack grand public ;
- un Discord bis ;
- un catalogue d’outils ;
- un canal d’exposition de données privées ;
- un contournement du blocage ou de la confidentialité.

---

## 2. Existant vérifié à préserver

Le produit possède déjà beaucoup de briques utiles.

### 2.1 Démarrer un DM

`startDirectMessage(...)` :

- cherche/réutilise une conversation 1:1 existante ;
- tente de réutiliser l’ID Supabase ;
- crée la conversation si nécessaire ;
- conserve un fallback local ;
- ouvre ensuite la conversation.

**Décision : ne pas réécrire cette logique sans nécessité.**

La cible conserve le principe :

```text
profil → Message
→ réutiliser le 1:1 existant
→ sinon créer une seule conversation
→ ne jamais envoyer automatiquement un premier message
```

### 2.2 Inbox

L’écran Messages possède déjà :

- `Nouveau message` ;
- `Nouveau groupe` ;
- recherche conversation/message ;
- archivage ;
- liste des conversations ;
- état vide.

### 2.3 Conversation pleine page

`openConversation(...)` et le thread existant gèrent notamment :

- navigation retour ;
- avatar / identité du correspondant ;
- brouillon restauré ;
- scroll paginé ;
- realtime ;
- statuts de message ;
- réponse à un message ;
- mentions dans les groupes ;
- paramètres de conversation.

### 2.4 Envoi optimiste

`sendMessageFp(...)` :

- lit le texte ;
- met à jour la conversation locale ;
- rend immédiatement le message ;
- tente ensuite l’écriture Supabase ;
- gère un statut / mécanisme d’attente hors-ligne.

Cette UX immédiate est utile et doit être conservée, mais un statut serveur ambigu ne doit jamais être présenté comme un succès définitif.

---

## 3. Problèmes actuels prioritaires

### 3.1 Autorisation d’INSERT DM insuffisante

Le schéma production audité montre :

```text
conv_messages SELECT → membership
conv_messages INSERT → from_id = auth.uid()
```

L’INSERT ne prouve donc pas explicitement que l’émetteur est membre de `conv_id`.

Risque : si un compte connaît un `conv_id` valide, il peut potentiellement tenter une écriture dans une conversation dont il n’est pas membre.

**C’est P0 avant toute accélération de la messagerie.**

### 3.2 `conversations` INSERT trop permissif

Les policies de création de conversation sont actuellement plus permissives que nécessaire.

Le serveur doit vérifier :

- `created_by = auth.uid()` ;
- règles de création directe/groupe ;
- blocage dans les deux sens ;
- membership cohérente.

### 3.3 Blocage seulement partiellement appliqué

Le client masque aujourd’hui certaines conversations bloquées dans la liste.

Masquer n’est pas une politique de sécurité.

Cible :

```text
historique existant conservé
+ conversation éventuellement visible en lecture seule
+ aucun nouvel envoi après block
+ aucune nouvelle conversation directe
+ aucun ajout forcé à un groupe
```

Le serveur doit appliquer cette règle.

### 3.4 Identité multi-profil non structurée

Le code d’envoi attache actuellement des informations de persona active au contenu via un mécanisme client.

Le schéma `conv_messages` ne possède pas encore d’identifiant de profil passion structuré.

Avec Profil V2, l’identité d’un ancien message ne doit jamais changer parce que le compte active une autre Passio.

### 3.5 Inbox trop riche au premier niveau

Deux CTA de même importance :

```text
Nouveau message | Nouveau groupe
```

plus recherche, archives et autres mécanismes.

Le groupe existe et peut être utile, mais il n’a pas besoin d’être au même niveau que le 1:1 dans le cœur de la boucle PASSIO.

### 3.6 Conversation → IRL pas encore centrale

Le lot `PASSIO_CONVERSATION_TO_IRL_LOT_2026-08-20.md` définit déjà le chemin cible.

Messages V2 doit l’intégrer visuellement et techniquement sans dupliquer le formulaire IRL.

---

## 4. Architecture UX cible — Inbox

### En-tête

```text
Messages
                         [+]
[ Rechercher…              ]
```

Le `+` ouvre :

```text
Nouveau message
Nouveau groupe
```

Ainsi :

- `Nouveau message` reste l’intention principale ;
- groupe reste accessible ;
- la surface est plus légère.

### Liste

Une conversation 1:1 affiche :

```text
[avatar] Nina
         Dernier message…              12:43
         🎵 Musique                     ● 2
```

Le contexte Passio n’est affiché que s’il est fiable et utile.

### Groupe

```text
[avatar groupe] Jam Lyon
               Dernier message…
               8 membres
```

### Ordre

1. épinglées ;
2. activité récente ;
3. archivées hors flux principal.

### Non-lus

Badge discret, pas de design anxiogène.

---

## 5. Recherche

### P0

Recherche locale sur :

- nom de conversation ;
- correspondant ;
- messages déjà présents localement.

### Confidentialité

Le texte recherché ne doit pas être envoyé à analytics.

### Recherche serveur future

Si une recherche full-text privée est un jour ajoutée :

- elle doit respecter membership ;
- chiffrement / indexation à évaluer ;
- aucune indexation globale de DM ;
- pas dans le lot V2 initial.

---

## 6. Archivage

Conserver l’archivage comme fonction secondaire.

### Cible

Inbox principale :

```text
Conversations actives
```

Menu secondaire :

```text
Archivées
```

### Règle

Archiver :

- ne supprime rien ;
- ne bloque personne ;
- n’empêche pas un nouveau message reçu de réapparaître selon la règle produit choisie.

Décision recommandée : nouveau message entrant → désarchive automatiquement, sauf si l’utilisateur a explicitement quitté/bloqué.

---

## 7. Conversation 1:1 cible

### Header

```text
←  [avatar] Nina
    🎵 Musique

                 ⋯
```

Le nom/avatar ouvre le profil public.

### Action relationnelle

Ajouter un CTA léger et contextuel :

> **🤝 Proposer un IRL**

Il peut vivre :

- dans le header secondaire ; ou
- dans le menu `+` du composer.

Ne pas créer une grosse bannière permanente si elle réduit l’espace du thread.

### Menu `⋯`

P0 :

- Voir le profil ;
- Archiver ;
- Bloquer / débloquer ;
- Signaler ;
- Supprimer la conversation localement selon le comportement existant ;
- éventuellement personnalisation de fond en secondaire.

Les appels audio/vidéo existants restent possibles mais ne deviennent pas l’axe produit principal avant preuve d’usage et fiabilité.

---

## 8. Composer cible

```text
[ + ] [ Écrire un message…            ] [↑]
```

### `+`

Selon capacités existantes réellement stables :

- photo/fichier ;
- GIF ;
- vocal ;
- `🤝 Proposer un IRL`.

### Priorité

Le champ texte et le bouton envoyer restent dominants.

Ne pas transformer le composer en barre de 8 icônes.

### Permissions

- micro uniquement après action vocal ;
- photo/fichiers après action explicite ;
- GPS jamais au simple affichage du composer.

---

## 9. Conversation → IRL

Réutiliser le lot existant.

### CTA

```text
🤝 Proposer un IRL
```

### Action

Appeler `openCreateEvent()` avec contexte sûr.

### Préremplissage autorisé

- Passio de contexte si fiable ;
- titre suggéré éditable ;
- ville seulement si explicitement connue / choisie.

### Interdit

- GPS automatique ;
- adresse déduite du correspondant ;
- auto-RSVP ;
- auto-ajout du correspondant ;
- message automatique non consenti ;
- publication d’une adresse exacte dans le fil de conversation.

### Après création

Partager un objet/lien canonique :

```text
#irl-event-<eventId>
```

Le rendu conversation peut afficher une card sûre :

```text
🤝 Jam session guitare
Lyon · samedi · 18:00
Voir l’activité
```

Jamais l’adresse exacte tant que la politique IRL ne l’autorise pas.

---

## 10. Sécurité P0 — INSERT message

Créer une policy basée sur membership réelle.

Concept :

```sql
WITH CHECK (
  from_id = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM conv_members m
    WHERE m.conv_id = conv_messages.conv_id
      AND m.user_id = auth.uid()::text
  )
)
```

Adapter à la syntaxe exacte / helpers prod.

### Test obligatoire

Compte C connaît le `conv_id` d’une conversation A↔B mais n’en est pas membre :

```text
POST conv_messages
→ refus serveur
```

Ce test rejoint `authz-critical.spec.js` dans le même lot que le correctif.

---

## 11. Sécurité P0 — création de conversation

### Directe

Le serveur doit garantir :

- créateur authentifié ;
- cible valide ;
- créateur ≠ cible ;
- aucune relation block dans les deux sens ;
- membership cohérente.

### Déduplication

P0 peut conserver la déduplication applicative existante.

P1 recommandé : clé/canonicalisation serveur pour éviter deux conversations 1:1 concurrentes lors de créations simultanées.

Exemple conceptuel :

```text
direct_pair_key = min(uidA, uidB) + ':' + max(uidA, uidB)
UNIQUE(direct_pair_key)
```

à évaluer selon schéma et compatibilité.

### Race test

Deux clients créent le même DM au même instant :

```text
→ une seule conversation canonique
```

---

## 12. Blocage

### Helper serveur cible

Réutiliser / introduire :

```text
can_interact_with(target_uid)
```

qui refuse si :

```text
A bloque B
OU
B bloque A
```

### Après blocage

Pour celui qui a bloqué :

- historique accessible si politique retenue ;
- composer désactivé ;
- CTA `Débloquer` ;
- aucun appel ;
- aucun nouvel IRL direct.

### Si l’autre compte a bloqué

Ne pas révéler explicitement :

> “Cette personne vous a bloqué.”

Le serveur refuse l’action ; UI peut afficher un message générique :

> “Impossible d’envoyer ce message.”

### Historique

Ne pas effacer automatiquement l’historique : utile pour contexte, signalement et sécurité.

---

## 13. Signalement

Depuis le menu conversation :

```text
Signaler
```

### Données

Ne pas envoyer automatiquement tout l’historique dans analytics.

Le système de modération peut recevoir le strict nécessaire selon le flux de signalement prévu, avec consentement clair lorsque du contenu de conversation est joint.

### Blocage proposé

Après signalement, proposer séparément :

> Bloquer cette personne

Ne pas présumer le choix si ce n’est pas requis par politique.

---

## 14. Identité multi-profil — modèle P0

Tant que `passion_profiles` n’est pas matérialisé côté serveur :

- membership reste compte-first ;
- `conv_messages.from_id` reste le compte ;
- ne pas faire de migration fragile en même temps que le correctif authz.

### Le problème à éviter

Un ancien message ne doit pas changer d’auteur visuel quand l’utilisateur active une autre identité passionnelle.

### Transition

Conserver temporairement la compatibilité du mécanisme actuel de persona si nécessaire, mais l’auditer avant toute suppression.

Ne pas stocker durablement une identité structurée dans le texte utilisateur si une colonne dédiée est disponible.

---

## 15. Identité multi-profil — cible structurée

Après `PASSIO_PROFILE_MULTIPROFILE_V2_2026-08-20.md` :

### Default persona de conversation

Ajouter éventuellement :

```text
conv_members.passion_profile_id nullable
```

pour dire :

> dans cette conversation, mon identité par défaut est Photo.

### Identité historique par message

Ajouter :

```text
conv_messages.passion_profile_id nullable
```

Chaque nouveau message copie l’identité utilisée à l’envoi.

Ainsi :

```text
message ancien
→ garde Photo

utilisateur active Musique ailleurs
→ message ancien reste Photo
```

### Ownership

Le serveur vérifie :

```text
passion_profiles.account_id = auth.uid()
```

avant d’accepter `passion_profile_id`.

### Legacy

Messages historiques sans champ :

- fallback identité générale ;
- ne pas inventer un profil passion passé.

---

## 16. Changer d’identité dans une conversation

Pas de switch silencieux.

Si la fonctionnalité est exposée :

```text
Conversation
→ Identité : 🎵 Musique
→ Changer
→ confirmation explicite
```

Le changement affecte uniquement les futurs messages.

Les anciens messages restent liés à l’identité historique.

### Ne pas coupler

Changer l’identité conversationnelle ne modifie pas :

- filtres Feed ;
- intérêts Feed ;
- `currentProfileId` global, sauf choix explicite distinct.

---

## 17. Groupes

Le groupe existe et doit être préservé sans être sur-promu.

### Inbox

Entrée sous `+` :

```text
Nouveau groupe
```

### P0 groupe

Conserver :

- nom ;
- membres ;
- mentions ;
- messages ;
- statut ;
- réglages existants stables.

### Sécurité groupe

- seul membre peut lire ;
- seul membre peut envoyer ;
- ajout de membre selon rôle/politique ;
- block à traiter explicitement ;
- aucun compte extérieur via `conv_id`.

### IRL groupe

P1 après Trust & Safety :

`Proposer un IRL` peut devenir très pertinent dans un groupe, mais il faut clarifier :

- qui reçoit l’invitation ;
- qui devient attendee ;
- aucune auto-inscription ;
- confidentialité de la liste des participants.

---

## 18. Appels audio / vidéo

Le code contient des mécanismes d’appel/notifications.

### Décision V2

Ne pas supprimer si fonctionnels.

Ne pas les mettre au centre du premier redesign.

### Prérequis avant promotion

- permissions explicites ;
- blocage respecté ;
- notification push fiable ;
- refus/absence gérés ;
- anti-spam ;
- tests mobile ;
- mineurs/politiques évalués.

---

## 19. Brouillons

Conserver la restauration actuelle.

### Règle

Un brouillon :

- reste local / user-state selon architecture actuelle ;
- n’est pas envoyé en analytics ;
- ne crée pas de notification ;
- disparaît après envoi réussi ou suppression explicite.

### Multi-device P1

Synchronisation de draft non prioritaire.

---

## 20. Realtime et statuts

Conserver :

- optimistic UI ;
- realtime ;
- statuts pending/sent/read si réellement supportés.

### Vérité serveur

Ne jamais convertir une simple requête lancée en :

> “message envoyé”

si l’écriture a échoué sous RLS.

### État recommandé

```text
pending
sent
failed
read
```

### Failed

Afficher :

> Échec de l’envoi · Réessayer

Pas de disparition silencieuse.

---

## 21. Hors-ligne

Si l’outbox actuelle est conservée :

- idempotence ;
- message ID stable ;
- pas de duplication au retour réseau ;
- respect du block au moment du retry ;
- membership revalidée côté serveur.

Un message mis en attente avant un block puis renvoyé après le block doit être **refusé**.

---

## 22. Suppression de conversation

Séparer :

### Masquer chez moi

Action locale / membership-level :

> supprimer de ma liste

### Supprimer un message envoyé

Politique distincte à documenter ; pas nécessaire dans V2 initial.

### Hard delete global

Ne pas déclencher depuis un simple bouton utilisateur sans politique claire et vérification des droits.

---

## 23. Notifications

### Nouveau message

Notification minimale :

- auteur autorisé ;
- conversation ;
- aperçu selon préférence de confidentialité.

### Contenu lockscreen

Prévoir option produit :

```text
Afficher aperçu
Masquer le contenu
```

P1 si non disponible.

### Block

Après block : aucune nouvelle notification de message/appel direct.

---

## 24. Deep links

Une notification de message doit ouvrir :

```text
Messages
→ conversation exacte
```

### Garde

Avant ouverture : vérifier membership côté serveur.

Un ancien/deep link vers une conversation dont l’accès a disparu doit afficher une erreur sûre, pas le contenu en cache comme autorité finale.

---

## 25. Analytics produit

Événements :

```text
messages_inbox_viewed
new_message_opened
conversation_opened
message_send_attempted
message_send_succeeded
message_send_failed
conversation_profile_opened
conversation_irl_cta_opened
conversation_irl_created
conversation_archived
```

### Propriétés sûres

- `source` ;
- `is_group` ;
- `has_passion_context` ;
- `message_type = text | media | audio | irl_card` ;
- `send_result` ;
- `latency_bucket`.

### Interdit

Ne jamais envoyer :

- texte du message ;
- texte du draft ;
- pièce jointe / URL privée ;
- nom du correspondant ;
- adresse exacte ;
- GPS ;
- email/téléphone.

---

## 26. Métriques de réussite

La messagerie ne doit pas optimiser :

- volume brut de messages ;
- temps passé ;
- notifications ouvertes à tout prix.

Mesures utiles :

```text
profil → conversation démarrée
conversation → réponse mutuelle
conversation → proposition IRL
proposition IRL → activité créée
activité créée → RSVP
IRL → nouveau contenu
```

Le but est une relation utile, pas un chat infini.

---

## 27. Sentinelle / Centre de pilotage

### Signaux sécurité

- tentative INSERT message hors membership ;
- tentative conversation bloquée ;
- tentative usurpation `passion_profile_id` ;
- duplication de conversation directe ;
- erreurs RLS répétées ;
- outbox en boucle ;
- hausse des messages failed.

### Signaux performance

- latence envoi ;
- latence realtime ;
- taux de retry ;
- reconnexions channel ;
- rendering thread lent.

### Actions automatiques sûres

Exemples :

- reconnect realtime ;
- retry borné ;
- bascule polling contrôlée ;
- kill switch feature d’appel si incident majeur.

### Interdit

Sentinelle ne lit pas le contenu privé des DM pour faire du monitoring produit générique.

---

## 28. Tests d’acceptation Messages V2

### MSG2-01 — DM existant réutilisé

Profil → Message deux fois → même conversation 1:1.

### MSG2-02 — race création

Deux créations simultanées du même DM ne produisent pas deux threads canoniques après mécanisme serveur P1.

### MSG2-03 — aucun auto-message

Ouvrir un DM ne publie aucun message automatiquement.

### MSG2-04 — non-membre INSERT

Compte C connaît `conv_id` de A↔B → INSERT refusé serveur.

### MSG2-05 — non-membre SELECT

Compte C → lecture vide/refusée.

### MSG2-06 — membre envoi

A membre de conversation → envoi accepté.

### MSG2-07 — from_id forgé

B ne peut envoyer sous `from_id=A`.

### MSG2-08 — block nouveau DM

A bloque B → B/A ne peuvent créer une nouvelle interaction directe selon helper serveur.

### MSG2-09 — block conversation existante

Historique reste selon politique ; nouvel envoi refusé.

### MSG2-10 — outbox après block

Message pending avant block → retry après block refusé sans duplication.

### MSG2-11 — inbox simple

Un CTA `+` donne accès Nouveau message / Nouveau groupe ; pas deux CTA dominants permanents.

### MSG2-12 — recherche

Recherche locale trouve conversations/messages accessibles uniquement.

### MSG2-13 — analytics search privacy

Texte de recherche absent de l’analytics.

### MSG2-14 — draft

Quitter/revenir conserve draft ; envoyer le retire.

### MSG2-15 — reply

Réponse à message conserve référence existante sans crash/realtime duplication.

### MSG2-16 — realtime

Message reçu apparaît sans reload.

### MSG2-17 — failed visible

RLS/réseau en erreur → état failed + retry, pas faux sent.

### MSG2-18 — retry idempotent

Retry n’insère pas deux messages.

### MSG2-19 — ouvrir profil

Avatar/nom header → bon profil public.

### MSG2-20 — IRL CTA

Conversation 1:1 → `Proposer un IRL` → formulaire existant.

### MSG2-21 — IRL safe prefill

Passio possible ; aucune adresse/GPS privé prérempli.

### MSG2-22 — IRL card

Événement partagé affiche ville/date sûres, jamais adresse exacte non autorisée.

### MSG2-23 — identité future stable

Message avec `passion_profile_id=Photo` reste Photo après activation Musique.

### MSG2-24 — profil usurpé

Compte A ne peut écrire un `passion_profile_id` appartenant à B.

### MSG2-25 — legacy identity

Ancien message sans passion_profile_id reste lisible via fallback général.

### MSG2-26 — groupe membership

Non-membre groupe ne lit/n’écrit pas.

### MSG2-27 — groupe mentions

Mentions existantes restent fonctionnelles après simplification UI.

### MSG2-28 — archived

Archiver ne supprime rien ; nouveau message désarchive selon décision.

### MSG2-29 — deep link

Deep link vers conversation vérifie l’accès réel avant rendu.

### MSG2-30 — notification block

Après block, aucune notification directe nouvelle.

### MSG2-31 — mobile keyboard

Clavier mobile ne masque pas composer/bouton envoi.

### MSG2-32 — long thread

Pagination/scroll reste fluide et charge plus en remontant.

### MSG2-33 — accessibility

Boutons retour/envoi/menu ont labels et cibles tactiles correctes.

### MSG2-34 — Sentinelle

Violation membership et taux d’échec anormal remontent sans texte de DM.

---

## 29. Ordre d’implémentation Claude Code

### M2-0 — audit exact avant diff

Confirmer :

- toutes policies `conversations`, `conv_members`, `conv_messages`, `conv_reads` ;
- `startDirectMessage` ;
- `supaCreateConversation` ;
- fonction d’envoi Supabase ;
- outbox ;
- `_withSenderMeta` / parser persona ;
- realtime channels ;
- appels/notifications ;
- suppression/archivage ;
- groupe ;
- tests multi-comptes.

### M2-1 — authz DM P0

- membership obligatoire à l’INSERT ;
- created_by sur création ;
- block helper sur interaction directe ;
- tests REST bruts ;
- intégrer test non-membre à `authz-critical.spec.js`.

**Ce lot passe avant le redesign visuel.**

### M2-2 — inbox simplifiée

- remplacer deux CTA dominants par `+` ;
- Nouveau message / Nouveau groupe ;
- archives secondaires ;
- conserver recherche ;
- conserver rendering/realtime.

### M2-3 — conversation simplifiée

- header propre ;
- profil accessible ;
- composer principal ;
- fonctions secondaires sous `+`/`⋯` ;
- états failed/retry clairs ;
- blocage lecture seule.

### M2-4 — Conversation → IRL

- intégrer CTA ;
- réutiliser `openCreateEvent()` ;
- retour conversation ;
- card événement sûre ;
- tests du lot existant Conversation→IRL.

### M2-5 — identité structurée

Après Profil V2 serveur :

- `conv_messages.passion_profile_id nullable` ;
- ownership ;
- dual-read legacy ;
- message historique stable.

Évaluer ensuite `conv_members.passion_profile_id` comme persona par défaut du thread.

### M2-6 — groupes / appels

Seulement après P0 :

- durcir membership groupe ;
- promotion IRL groupe ;
- appels si fiabilité/sécurité suffisantes.

---

## 30. Scope guard

Ne pas :

- réécrire tout le système realtime ;
- remplacer la messagerie par une nouvelle stack ;
- mettre du contenu DM dans analytics ;
- révéler l’adresse exacte via les cards IRL ;
- autoriser INSERT message sur simple `from_id` ;
- considérer le masquage UI comme block ;
- supprimer l’historique au block ;
- envoyer un premier message automatiquement depuis un profil ;
- créer automatiquement un événement IRL ;
- changer silencieusement d’identité passionnelle ;
- migrer les groupes, appels et profils passion dans le même diff authz ;
- casser brouillons, replies, pagination ou realtime déjà fonctionnels ;
- optimiser le produit pour le volume brut de messages.

---

## 31. Definition of Done

Messages V2 est correctement fondé lorsque :

- un non-membre ne peut jamais lire ou écrire dans une conversation ;
- le block empêche réellement toute nouvelle interaction directe côté serveur ;
- l’inbox est simple et lisible ;
- `Nouveau groupe` reste accessible sans dominer ;
- le thread conserve realtime, draft, reply et états d’envoi ;
- un échec serveur n’est jamais affiché comme succès ;
- Profil → Message réutilise le DM existant ;
- Conversation → IRL est accessible et sûr ;
- aucune localisation privée n’est exposée ;
- le futur multi-profil possède un chemin structuré vers des identités de messages stables ;
- les historiques legacy restent lisibles ;
- Sentinelle voit les anomalies techniques sans lire les DM ;
- tests cross-account et mobile sont verts.

---

## 32. Répartition IA

### ChatGPT

- hiérarchie UX inbox/thread ;
- règles relationnelles ;
- Conversation→IRL ;
- modèle d’identité ;
- critères d’acceptation ;
- frontières privacy/safety.

### Claude Code

- audit policies réelles ;
- migration authz ;
- tests REST bruts ;
- conservation realtime/outbox/drafts ;
- simplification UI ;
- intégration `openCreateEvent()` ;
- migration future `passion_profile_id`.

### Codex

- attaque `conv_id` connu hors membership ;
- attaque `from_id` forgé ;
- teste block dans les deux sens ;
- races de création/retry ;
- message pending après block ;
- identité passionnelle usurpée ;
- fuite de localisation via IRL card ;
- duplication realtime/outbox.
