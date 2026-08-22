# PASSIO — Audit Trust & Safety IRL

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Objet** : sécuriser le pilier IRL avant d'accélérer le parcours Feed → personne → conversation → rencontre réelle.
- **Principe** : aucune métrique de croissance ne justifie une fuite de localisation, un contournement de blocage, un faux check-in ou une exposition inadaptée d'un mineur.

---

## 1. Verdict exécutif

PASSIO a déjà de bons fondements :

- blocages persistés cross-device ;
- signalements en base ;
- comptes privés protégés côté serveur pour posts/stories/commentaires/likes ;
- messages privés lisibles uniquement par les membres de la conversation ;
- RSVP, liste d'attente, check-in, annulation, co-organisateurs et groupe événement ;
- Access Gate et tests d'autorisation réels ;
- pas de score de confiance générique à ajouter.

Mais le **niveau de protection IRL est actuellement inférieur à celui du Feed et des DM**.

Les écarts P0 vérifiés sont :

1. `events` est encore lisible publiquement (`SELECT true`) avec adresse, coordonnées, contact et autres champs détaillés ;
2. `event_attendees` est publiquement lisible, y compris identités, RSVP, `checked_in_at`, rating et feedback ;
3. l'UI événement affiche l'adresse complète lorsqu'elle existe ;
4. le blocage n'est pas encore une barrière serveur générale sur événements/conversations/interactions ;
5. `conv_messages` vérifie l'auteur à l'INSERT, mais pas explicitement son appartenance à la conversation ;
6. `conversations` possède encore des policies INSERT permissives `check true` ;
7. le code de check-in est déterministe à partir de l'ID public de l'événement et la validation forte reste côté client ;
8. l'âge est demandé à l'onboarding et `<13` est refusé, mais aucun garde IRL serveur spécifique aux 13–17 ans n'a été trouvé dans le flux IRL inspecté ;
9. les commentaires/réactions événement sont publiquement lisibles et ne prennent pas la relation de blocage en compte côté RLS ;
10. plusieurs opérations organisateur sur `event_attendees` ne correspondent pas à la policy UPDATE actuelle limitée au propriétaire de la ligne, ce qui mérite une correction d'intégrité séparée.

**Décision : ne pas considérer l'IRL “production-ready grand public” tant que les lots T&S-1 à T&S-5 ci-dessous ne sont pas verts.**

---

## 2. Fondations déjà solides à préserver

### 2.1 Blocage persisté

La table :

```sql
blocks(blocker_id, blocked_id, created_at)
```

est protégée en RLS : seul le bloqueur peut lire, insérer et supprimer ses blocages.

Le client `supaBlockUser(targetId)` :

- écrit le blocage ;
- traite le doublon comme état déjà atteint ;
- retire également la personne de mes abonnés afin qu'un abonné ne conserve pas l'accès à un compte privé.

Le test réel `blocage-acces.spec.js` prouve qu'un abonné B perd l'accès aux posts privés de A lorsque A le bloque.

**À préserver absolument.**

### 2.2 Confidentialité des DM

Les trois tables :

- `conversations`
- `conv_members`
- `conv_messages`

ont une lecture réservée aux membres via `is_conv_member(...)`.

`confidentialite.spec.js` prouve avec trois comptes réels qu'un tiers ne peut lire ni la conversation, ni les membres, ni les messages.

**À préserver et étendre aux écritures.**

### 2.3 Comptes privés

`profiles.is_private` existe.

Les posts, stories, commentaires, likes et réactions de contenu utilisent désormais des règles RLS qui respectent le compte privé et l'abonnement.

Cette architecture constitue le modèle de référence pour le futur durcissement IRL : **serveur d'abord, filtre client en défense secondaire**.

### 2.4 Signalements

La photographie prod du 2026-08-17 montre que `reports_insert` impose maintenant :

```sql
reporter_id = auth.uid()::text
```

Le client possède déjà `reportEvent(id)` et envoie un signalement de type `event`.

Donc le signalement IRL peut réutiliser le canal existant ; inutile de créer un deuxième système de modération.

---

## 3. P0 — localisation : ne plus publier une adresse privée par défaut

### État actuel

`events` contient notamment :

- `lat`
- `lng`
- `city`
- `venue`
- `address`
- `postal_code`
- `contact`
- `external_link`

La production porte encore deux policies SELECT événement publiques.

Le loader fait :

```js
supa.from("events").select("*")
```

et réhydrate `address`, `postalCode`, `contact`, etc.

La fiche événement construit :

```js
const addressFull = [ev.address, ev.postalCode, ev.city]...
```

puis affiche une ligne **Adresse** et un lien Google Maps.

### Risque

Un organisateur peut saisir son domicile ou un lieu sensible en croyant simplement créer un événement communautaire. Cette information devient alors :

- visible dans l'UI ;
- récupérable par API ;
- exploitable sans RSVP ;
- associée à son identité/profil.

Le problème n'est donc pas cosmétique : **masquer l'adresse dans le DOM ne suffit pas.**

### Architecture cible

Séparer les données publiques des détails sensibles.

#### `events` — découverte sûre

Conserver publiquement :

- id ;
- titre ;
- passion ;
- ville / zone ;
- date et fin ;
- type ;
- cover ;
- statut ;
- capacité publique éventuelle ;
- organisateur ;
- coordonnées approximatives si la carte l'exige.

#### `event_private_details` — recommandé

Nouvelle table dédiée :

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

RLS :

- organisateur/co-organisateur ;
- participant autorisé selon la politique de révélation ;
- service/modération.

### `location_visibility`

Valeurs recommandées :

- `public` — lieu public explicitement choisi par l'organisateur ;
- `rsvp` — détails précis après RSVP `going` ;
- `organizer_approval` — révélation après acceptation explicite.

**Défaut recommandé : `rsvp`.**

Pour le parcours Conversation → IRL, ne jamais appeler un événement “privé” tant que cette autorisation serveur n'existe pas.

### Carte

Pour la découverte publique :

- utiliser centre-ville/zone approximative ;
- ou coordonnées volontairement arrondies ;
- ne pas envoyer les coordonnées exactes d'un domicile dans le payload public.

---

## 4. P0 — participants : passer d'une liste publique brute à un modèle de visibilité

### État actuel

`event_attendees` porte :

```text
event_id
user_id
rsvp
checked_in_at
rating
feedback
rated_at
```

Sa policy SELECT production est encore :

```sql
USING (true)
```

Le loader global récupère pour les événements :

```text
event_id,user_id,rsvp,checked_in_at
```

et la fiche événement construit des visages/noms de participants.

### Risques

Une lecture publique brute permet potentiellement de savoir :

- qui prévoit d'aller où ;
- qui hésite ;
- qui est en liste d'attente ;
- qui a réellement pointé son arrivée ;
- à quelle rencontre une personne a participé ;
- son feedback libre si celui-ci est lu directement par API.

### Cible P0

#### Public

Exposer seulement des agrégats nécessaires :

- nombre de `going` ;
- éventuellement nombre de places restantes ;
- note moyenne + nombre de notes si ce signal est conservé.

#### Participant

Peut voir :

- son propre RSVP ;
- les informations nécessaires à sa participation ;
- une liste sociale limitée uniquement si le produit l'assume clairement.

#### Organisateur/co-organisateur

Peut voir la liste nécessaire à la gestion :

- participants ;
- waitlist ;
- check-in ;
- feedback destiné à l'organisation.

### Feedback

Le texte libre ne doit pas devenir public par simple conséquence de `SELECT true`.

Deux options :

1. feedback privé organisateur + rating agrégé public ;
2. publication volontaire d'un avis distinct avec consentement explicite.

Choix P0 recommandé : **feedback privé, rating agrégé.**

---

## 5. P0 — blocage : une vraie frontière d'interaction

### État actuel

Le blocage protège désormais efficacement l'accès aux contenus privés grâce au retrait du follow.

Mais les policies de messagerie/IRL ne consultent pas encore `blocks` de façon générale.

En production :

- `conversations` possède encore deux INSERT `check true` ;
- `conv_members` permet à l'utilisateur de s'ajouter lui-même ou au créateur de la conversation d'ajouter des membres ;
- `conv_messages` INSERT vérifie `from_id = auth.uid()` mais pas explicitement `is_conv_member(conv_id, auth.uid())` ;
- événements/commentaires/réactions ne consultent pas une relation de blocage.

### Fonction serveur recommandée

Créer un helper unique, nom indicatif :

```sql
can_interact_with(target_uid text)
```

qui utilise l'identité courante et renvoie faux si un blocage existe **dans un sens ou l'autre**.

Le helper ne doit pas accepter un `viewer_uid` arbitraire fourni par le client.

### À appliquer au minimum

#### Conversation directe

- impossible de créer une nouvelle DM avec une personne bloquée ou qui m'a bloqué ;
- impossible d'ajouter cette personne comme membre direct ;
- impossible d'envoyer de nouveau message direct après blocage ;
- aucune invitation IRL directe après blocage.

#### Conversation existante

Ne pas détruire l'historique automatiquement : il peut constituer une preuve utile.

Mais :

- envoyer doit être refusé ;
- les notifications/appels doivent cesser ;
- l'UI doit indiquer que la conversation est verrouillée.

#### Groupes / groupes événement

Ne pas expulser automatiquement tout le monde d'un événement commun.

Recommandation :

- empêcher interactions directes ;
- masquer les messages de la personne bloquée pour le bloqueur si techniquement sûr ;
- ne pas révéler d'informations privées supplémentaires via la présence commune ;
- conserver les capacités de signalement.

---

## 6. P0 — écriture DM : exiger l'appartenance au serveur

### État actuel production

`conv_messages` :

```sql
INSERT CHECK (from_id = auth.uid()::text)
```

La lecture vérifie bien `is_conv_member`, mais l'écriture n'exige pas explicitement cette appartenance.

### Cible

L'INSERT doit exiger :

```text
from_id = auth.uid()
AND is_conv_member(conv_id, auth.uid())
AND interaction non bloquée selon le type de conversation
```

Même si les IDs de conversations sont difficiles à deviner, **l'ID n'est jamais une autorisation**.

Ajouter ce scénario au gate `authz-critical.spec.js` au moment du correctif.

---

## 7. P0 — check-in : ne pas appeler “présence vérifiée” une preuve client

### État actuel

Le code offre deux chemins :

- GPS dans un rayon de 500 m ;
- QR/code d'accueil.

Mais le code d'accueil :

- fait 6 caractères ;
- est stable ;
- est **dérivé directement de l'ID événement** par une fonction JS publique.

Le QR contient :

```text
#irl-checkin-<eventId>-<code>
```

Puis `_checkInViaCode` valide côté client et `supaCheckInEvent` écrit `checked_in_at` sur la propre ligne participant.

La policy UPDATE `event_attendees` autorise le participant à mettre à jour sa propre ligne.

### Risque

Un utilisateur techniquement motivé peut :

- calculer le code depuis l'ID public ;
- contourner l'UI ;
- appeler directement l'API pour modifier sa ligne ;
- obtenir un faux check-in.

### Cible P0

#### Token non dérivable

Créer un token événement aléatoire côté serveur, idéalement stocké sous forme de hash.

Le QR contient un nonce non calculable à partir de l'event ID.

#### Validation serveur

Le check-in doit passer par une fonction/RPC contrôlée qui vérifie :

- session ;
- événement actif ;
- fenêtre horaire selon l'heure serveur ;
- RSVP admissible ;
- token valide ;
- idempotence.

#### Interdire l'écriture directe de `checked_in_at`

Le client ne doit plus pouvoir régler arbitrairement `checked_in_at` via une UPDATE générique.

#### GPS

Le GPS reste une aide UX, pas une preuve cryptographique.

Ne pas persister les coordonnées GPS brutes du participant pour “prouver” sa présence.

---

## 8. P0 — mineurs : politique simple avant sophistication

### État actuel

L'onboarding :

- refuse les moins de 13 ans ;
- stocke `birthYear` ;
- marque `state.user.isMinor = age < 18`.

Dans le code IRL inspecté, aucune utilisation de `isMinor` n'a été trouvée pour :

- création événement ;
- RSVP ;
- adresse ;
- check-in ;
- discussion groupe événement.

Le schéma public `profiles` n'a pas non plus de champ d'âge permettant une policy IRL serveur directe.

### Politique recommandée pour la première version publique

**13–17 ans : Feed et création de contenu oui ; IRL désactivé tant qu'un cadre dédié n'est pas livré.**

Désactiver côté produit **et serveur** :

- création d'événement ;
- RSVP ;
- accès aux coordonnées précises ;
- check-in ;
- entrée automatique dans les groupes événement.

Pourquoi ce choix : il est simple, explicable et vérifiable. Introduire tout de suite un système complexe “mineurs entre mineurs / adultes vérifiés / tuteur / horaires / lieux autorisés” augmenterait fortement la surface de risque.

### Évolution future

Un futur lot peut concevoir :

- age band serveur ;
- consentement parental selon juridiction ;
- événements age-banded ;
- organisateurs vérifiés ;
- lieux publics uniquement ;
- règles horaires ;
- modération renforcée.

Mais ce travail ne doit pas être improvisé dans le lot Feed→IRL.

---

## 9. P1 — signalement événement et modération

### Existant

`reportEvent(id)` appelle le système générique de signalement.

La production contraint déjà `reporter_id = auth.uid()` à l'INSERT.

### À compléter

Pour l'IRL :

- raison structurée : sécurité, harcèlement, faux événement, lieu dangereux, spam, haine, contenu sexuel, autre ;
- source : fiche événement / conversation / après rencontre ;
- référence event + éventuellement message précis ;
- capacité modérateur à annuler/masquer ;
- journal d'action ;
- notification organisateur si appropriée ;
- aucune auto-sanction irréversible uniquement sur volume de signalements.

Le centre de pilotage/Sentinelle peut détecter les pics ou anomalies, mais la sanction humaine sensible reste explicite.

---

## 10. P1 — fiabilité des opérations organisateur

### Mismatch vérifié

`event_attendees` UPDATE est owner-only :

```sql
user_id = auth.uid()
```

Pourtant le client contient `supaPromoteFromWaitlist(eventId, userId)`, qui tente de mettre à jour la ligne d'une autre personne.

Cela signifie qu'une promotion initiée côté client par l'organisateur ne possède pas aujourd'hui l'autorisation RLS correspondante.

### Décision

Ne pas assouplir globalement UPDATE.

Créer une opération serveur étroite :

```text
promote_waitlisted(event_id, user_id)
```

qui vérifie :

- appelant = organisateur/co-organisateur ;
- cible réellement waitlistée ;
- capacité disponible ;
- événement actif.

Même logique pour toute future action organisateur sur la participation d'autrui.

---

## 11. Modèle de visibilité IRL cible

### Découverte publique

Visible :

- titre ;
- passion ;
- organisateur ;
- date ;
- ville/zone ;
- description ;
- capacité/places ;
- statut ;
- agrégats.

Non visible par défaut :

- adresse précise ;
- GPS exact ;
- contact privé ;
- identities RSVP brutes ;
- liste d'attente ;
- check-in individuels ;
- feedback privé.

### Participant accepté / `going`

Peut recevoir :

- détails de lieu selon `location_visibility` ;
- groupe événement ;
- informations logistiques.

### Organisateur

Peut gérer :

- participants ;
- waitlist ;
- check-in ;
- annulation ;
- feedback ;
- co-organisateurs.

### Modération

Accès justifié et audité via service/admin ; jamais via une policy client large.

---

## 12. Tests P0 à ajouter

### IRL-TS-01 — adresse non publique

Un compte non inscrit ou une requête publique ne peut pas lire l'adresse/GPS exacts d'un événement `rsvp`.

### IRL-TS-02 — révélation après RSVP

Un participant `going` autorisé reçoit les détails exacts ; un `declined` ou stranger non.

### IRL-TS-03 — participants non publics

Une requête non autorisée ne peut pas obtenir `user_id`, `rsvp`, `checked_in_at` ou `feedback` bruts.

### IRL-TS-04 — agrégats disponibles

Le compteur de participants reste disponible sans exposer les lignes individuelles.

### IRL-TS-05 — DM write membership

Un compte non membre qui connaît un `conv_id` ne peut y insérer aucun message par REST brut.

### IRL-TS-06 — blocage DM

Après blocage, un ancien interlocuteur ne peut plus envoyer de nouveau message direct.

### IRL-TS-07 — blocage nouvelle conversation

Une personne bloquée ne peut ni recréer une DM ni être ajoutée par le flux Conversation → IRL.

### IRL-TS-08 — événement d'un compte bloqué

Le comportement cible est explicitement testé : pas de découverte directe ni d'invitation de la personne bloquée.

### IRL-TS-09 — faux check-in REST

Une UPDATE directe de `checked_in_at` par un client standard échoue.

### IRL-TS-10 — code dérivé refusé

Connaître `eventId` ne permet pas de fabriquer un token de check-in valide.

### IRL-TS-11 — QR valide

Un participant éligible scannant un token serveur valide dans la fenêtre autorisée obtient un check-in unique.

### IRL-TS-12 — token expiré/invalide

Refus côté serveur.

### IRL-TS-13 — GPS non persisté

Le check-in ne stocke ni latitude ni longitude du participant dans analytics/user_state/telemetry.

### IRL-TS-14 — mineur UI

Compte `isMinor` : création/RSVP/check-in/groupe événement indisponibles.

### IRL-TS-15 — mineur REST

Le même contournement via API brute est refusé côté serveur.

### IRL-TS-16 — report forgé

B ne peut pas déposer un report signé au nom de A ; B peut signaler sous sa propre identité.

### IRL-TS-17 — waitlist promotion

Un stranger ne peut promouvoir personne ; organisateur/co-organisateur le peut via l'opération dédiée.

### IRL-TS-18 — annulation

Un événement annulé reste identifiable comme annulé, bloque le RSVP/check-in et ne révèle pas davantage de données privées.

---

## 13. Ordre d'implémentation recommandé

### T&S-1 — Gate authz messagerie

Avant le nouveau CTA Conversation → IRL :

1. INSERT conversation lié à l'identité réelle du créateur ;
2. INSERT message exige membership ;
3. bloque interaction directe en cas de block ;
4. tests REST bruts + multi-comptes.

### T&S-2 — Séparation localisation

1. définir schéma public vs privé ;
2. migrer sans perte les champs exacts ;
3. RLS ;
4. adapter loader/detail/map ;
5. fallback ancien client borné ;
6. tests anonymes/authentifiés.

### T&S-3 — Confidentialité participants

1. fermer `event_attendees SELECT true` ;
2. exposer agrégats sûrs ;
3. accès organisateur/participant ;
4. feedback privé ;
5. adapter UI.

### T&S-4 — Check-in serveur

1. secret aléatoire ;
2. validation serveur ;
3. interdire UPDATE directe `checked_in_at` ;
4. conserver UX QR ;
5. requalifier GPS en signal UX ;
6. tests fraude.

### T&S-5 — Mineurs

1. définir age band serveur minimal ;
2. interdire IRL 13–17 pour le premier lancement public ;
3. UI + RLS/RPC ;
4. tests de contournement.

### T&S-6 — Modération enrichie

Raisons, dashboard, journal, traitement, métriques anonymisées.

---

## 14. Interaction avec Conversation → IRL

Le lot `PASSIO_CONVERSATION_TO_IRL_LOT_2026-08-20.md` reste valide, avec ces garde-fous supplémentaires :

- CTA absent/verrouillé si relation bloquée ;
- aucun RSVP automatique ;
- aucune adresse exacte préremplie depuis GPS ;
- aucun événement présenté comme privé sans RLS réelle ;
- mineur : pas de CTA IRL dans le premier lancement public ;
- le partage d'un event dans une conversation n'accorde jamais à lui seul l'accès aux détails privés ;
- l'accès aux détails vient des droits serveur de l'événement.

---

## 15. Interaction avec la Sentinelle

La Sentinelle peut surveiller :

- taux de reports IRL ;
- erreurs RLS ;
- échecs de check-in ;
- pics de création/spam ;
- tentatives répétées de message refusé ;
- erreurs de révélation de localisation ;
- anomalie de RSVP.

Mais elle ne doit pas :

- lever automatiquement une interdiction de sécurité ;
- rendre un événement privé public pour “réparer” une erreur ;
- auto-bannir définitivement sur simple heuristique ;
- exposer adresse/identité dans ses notifications mobiles.

---

## 16. Definition of Done Trust & Safety IRL

Le pilier IRL est prêt pour le cœur PASSIO quand :

- localisation précise non publique par défaut ;
- politique de révélation explicite + serveur ;
- participants/check-ins/feedback non exposés en brut au public ;
- blocage empêche réellement les interactions directes ;
- INSERT DM exige membership ;
- check-in non dérivable et validé serveur ;
- GPS participant non persisté inutilement ;
- politique mineurs appliquée côté serveur ;
- signalement événement fonctionnel et authentifié ;
- waitlist/co-organisateur autorisés par opérations étroites, pas par RLS large ;
- tests REST bruts et multi-compte verts ;
- aucun Score/Passia/trust score réintroduit ;
- la boucle Feed → conversation → IRL reste fluide malgré ces protections.

---

## 17. Répartition IA

### ChatGPT

- définit la frontière produit/sécurité ;
- arbitre visibilité, mineurs, consentement et Definition of Done ;
- refuse les faux signaux de “sécurité UI”.

### Claude Code

- vérifie les policies réelles depuis le schéma local/lié ;
- implémente migrations expand/contract, RPC/helpers, loaders et UI ;
- ajoute tests REST/multi-comptes ;
- sépare les lots pour rollback.

### Codex

- attaque le modèle d'autorisation ;
- tente lecture adresse/participants hors droits ;
- tente injection message hors membership ;
- tente contournement block ;
- tente faux RSVP/check-in ;
- vérifie les régressions anciens clients et realtime.
