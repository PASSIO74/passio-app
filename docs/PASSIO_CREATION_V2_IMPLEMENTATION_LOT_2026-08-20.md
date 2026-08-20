# PASSIO — Création V2 · lot d’implémentation

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Rôle de Créer** : transformer une intention en contenu ou en expérience IRL avec le minimum d’étapes, sans masquer l’identité passionnelle qui agit.

---

## 1. Décision produit

`Créer` ne doit plus être un univers autonome à explorer.

C’est une **action centrale** accessible depuis toute l’application.

Le tap sur le bouton central ouvre un sélecteur léger :

```text
Créer
├── ✍️ Publication
│   └── texte + photo/vidéo dans un seul composer
├── 🎬 Bobine
│   └── éditeur média vertical existant
├── 🤝 Activité IRL
│   └── formulaire événement existant
└── ••• Plus
    ├── 🎙 Audio / podcast (fonction existante, secondaire)
    └── Story si nécessaire selon le contexte
```

**CDV / Carnet de voyage n’appartient pas à ce sélecteur cœur** : il relève de `Passio : Voyage`.

---

## 2. Existant vérifié

### 2.1 Le bouton central pointe aujourd’hui vers un écran

La navigation actuelle contient :

```html
<div class="nav-item nav-cta" data-screen="studio" ...>
  ...
  <span class="nav-label">Créer</span>
</div>
```

Donc `Créer` est aujourd’hui traité comme une destination `screen-studio`.

Cible : `Créer` devient une **action**, pas un onglet persistant.

### 2.2 Le Studio expose cinq types de création simultanément

L’écran actuel `screen-studio` affiche :

```text
Texte | Photo | Vidéo | Bobine | Podcast
```

Puis :

- un champ message toujours visible ;
- un bloc spécialisé selon le type ;
- une Passio liée ;
- un Mood ;
- le CTA de publication.

Le nombre de choix est techniquement riche mais inutilement frontal pour une action aussi fréquente.

### 2.3 La récompense artificielle est encore visible

Le CTA actuel est :

> `✨ Publier · +10 pts`

Cela doit devenir simplement :

> **Publier**

Aucun score, point, rang ou Passia dans le flux de création.

### 2.4 Le Mood est encore obligatoire visuellement

Le Studio propose :

```text
Création | Apprentissage | Chill | Actu
```

avec Création actif.

En cohérence avec le Feed V2, le Mood devient un **raffinement facultatif**, jamais un prérequis de publication ou de visibilité.

### 2.5 L’événement possède déjà son éditeur canonique

`openCreateEvent(editId)` et `submitEvent(editId)` existent déjà.

Le formulaire couvre notamment :

- titre ;
- Passio ;
- ville/date/heure ;
- lieu/adresse ;
- détails plus avancés.

Le lot Création V2 ne doit **pas reconstruire un second formulaire IRL**.

### 2.6 Le chemin publication est déjà testé

`tests/e2e/profils-types.spec.js` utilise déjà :

```text
goTo("studio")
studioType = "text" | "photo" | "video"
publishPost()
```

et vérifie publication, rendu Feed et persistance après reload.

Décision : conserver les handlers métier existants autant que possible ; simplifier **l’entrée et la présentation**.

---

## 3. Architecture UX cible

### Tap sur `Créer`

Au lieu de naviguer immédiatement vers le Studio :

```text
+ Créer
→ bottom sheet / modal léger
```

Le sélecteur doit s’ouvrir rapidement et être utilisable à une main sur mobile.

### Options P0

#### 1. `Publication`

Sous-titre :

> Partage une idée, une photo ou une vidéo.

Ouvre le composer unifié.

#### 2. `Bobine`

Sous-titre :

> Une vidéo courte autour de ta Passio.

Ouvre directement l’éditeur média Bobine existant.

#### 3. `Activité IRL`

Sous-titre :

> Propose quelque chose à vivre ensemble.

Ouvre `openCreateEvent()`.

### Option secondaire `Plus`

Permet de préserver des capacités sans encombrer le chemin P0 :

- audio/podcast existant ;
- Story si un raccourci global est réellement utile.

Le podcast n’est **pas supprimé** par ce lot ; il cesse seulement d’occuper le même niveau hiérarchique que les trois actions cœur tant que son rôle d’activation n’est pas démontré.

---

## 4. Publication unifiée

### Problème actuel

Texte / Photo / Vidéo sont présentés comme trois types concurrents.

Mais pour l’utilisateur, ils répondent à une seule intention :

> **Partager quelque chose.**

### Composer cible

```text
Publier

[identité active]
🎵 Benjamin · Musique       Changer

[Écris quelque chose…]

[ + Photo/vidéo ]

Passio : Musique           Modifier
Affiner                    ▾

                 Publier
```

### Type technique

Le code peut continuer à utiliser les types historiques :

- texte seul → `text` ;
- image attachée → `photo` ;
- vidéo attachée → `video`.

L’utilisateur ne doit plus être obligé de choisir ce type **avant** de commencer à écrire.

### Médias

Un seul bouton principal :

> `+ Photo / vidéo`

Puis utiliser le sélecteur natif ou les handlers existants.

Ne pas déclencher automatiquement caméra/micro au simple tap sur `Créer`.

---

## 5. Bobine

### Entrée

`Créer → Bobine` ouvre directement le mode Bobine de l’éditeur média existant.

Ne pas faire :

```text
Créer → Studio → onglet Bobine → éditeur média
```

### Après publication

Avec Feed V2, la Bobine est un format du Feed.

Cible :

```text
publier Bobine
→ confirmation
→ retour Feed
→ nouvelle Bobine visible dans le flux
```

Le viewer plein écran reste un **mode de lecture**, pas la destination produit post-publication obligatoire.

### IRL

Si la Bobine est créée depuis un événement ou un contexte IRL, préserver `event_id` via le mécanisme existant.

---

## 6. Activité IRL

### Entrée globale

`Créer → Activité IRL` appelle le formulaire canonique existant.

### Entrée contextuelle

Sur l’écran IRL, conserver le raccourci direct :

> `Créer un événement`

Il serait inutile d’obliger :

```text
IRL → Créer → Activité IRL
```

quand le contexte rend déjà l’intention évidente.

### Entrée conversation

Le lot `Conversation → IRL` conserve son propre raccourci vers `openCreateEvent()` avec préremplissage sûr.

### Mineurs

Lorsque le lot Trust & Safety correspondant est actif :

- 13–17 ans : `Activité IRL` absente ou désactivée ;
- le refus doit également exister côté serveur ;
- ne jamais s’appuyer sur le masquage UI seul.

---

## 7. Identité multi-profil : visible avant toute publication

C’est l’invariant principal de Création V2.

Le composer affiche toujours explicitement :

> **Publier en tant que [identité / profil passion]**

avec avatar et Passio.

### Règle

`Créer` ne change jamais `currentProfileId` silencieusement.

### Changer d’identité

Un tap sur `Changer` ouvre un sélecteur des profils existants.

Le changement n’est appliqué qu’après choix explicite.

### Passio de publication

Par défaut :

```text
postPassion = currentProfile.passion
```

si ce contexte existe.

### Publier dans une autre Passio

Si l’utilisateur choisit une Passio pour laquelle il ne possède pas encore de profil dédié :

- ne pas créer un profil silencieusement ;
- proposer une action explicite :

> `Créer mon profil Photo`

puis revenir au composer.

Cela rend le multi-profil **progressif** : il apparaît quand l’utilisateur en a besoin, pas pendant les premières secondes d’onboarding.

### Garde-fou de schéma

Le premier lot ne doit pas inventer une nouvelle séparation serveur `profile_id` dans `posts` sans audit du modèle réel.

Si la séparation compte/profil actuelle n’est pas garantie côté données, Claude Code doit documenter le gap avant tout changement sensible.

---

## 8. Passio et contexte

La Passio n’est pas un champ décoratif : elle conditionne découverte, profil et Feed.

### Préremplissage selon origine

#### Depuis Feed filtré sur une Passio

Préremplir cette Passio si elle correspond à une identité valide/explicite.

#### Depuis profil passion

Préremplir la Passio du profil.

#### Depuis événement

Préremplir la Passio de l’événement et préserver `event_id`.

#### Depuis conversation

Pour une proposition IRL, préremplir seulement le contexte non sensible déjà défini dans le lot Conversation→IRL.

### Aucun changement silencieux

Un contexte peut **préremplir** une valeur ; il ne doit pas changer en secret l’identité active.

---

## 9. Mood / Affiner

### Cible

Le champ Mood sort du chemin principal.

Dans `Affiner ▾` :

```text
Mood (optionnel)
○ Création
○ Apprendre
○ Chill
○ Actu
○ Aucun / général
```

Valeur par défaut recommandée :

```text
all
```

Le post ne doit jamais devenir invisible simplement parce que l’utilisateur n’a pas choisi de Mood.

---

## 10. Podcast / audio

Le projet possède déjà un recorder et un upload audio.

Décision de ce lot :

- conserver code et données ;
- ne pas le promouvoir au même niveau que Publication/Bobine/IRL ;
- placer l’entrée sous `Plus` ;
- ne pas approfondir le produit Podcast tant que les priorités Feed + IRL ne sont pas stabilisées.

Cela préserve l’investissement existant sans disperser le cœur.

---

## 11. Story

Une Story est un format temporaire.

Entrée recommandée :

- depuis la rangée Stories via `+` ;
- éventuellement `Créer → Plus → Story`.

Ne pas ajouter Story comme destination nav permanente.

Réutiliser l’éditeur média existant.

---

## 12. CDV / Carnet

Aucune entrée `Carnet` dans Créer cœur.

Pendant la transition :

- les handlers/données historiques peuvent rester ;
- leur accès utilisateur doit migrer vers `Passio : Voyage` ;
- ne pas supprimer naïvement les données ou `posts.vlog`.

Le test historique `profils-types.spec.js` qui publie encore un carnet devra être reclassé dans la suite Voyage/CDV plutôt que supprimé sans remplacement.

---

## 13. Permissions appareil

### Caméra

Demander seulement après :

```text
Bobine → Filmer
```

ou action équivalente explicite.

### Micro

Demander seulement après :

```text
Audio → Enregistrer
```

### Photos

Demander lors du choix de média.

### Géolocalisation

Jamais pour une publication standard.

Pour IRL : uniquement lorsque l’utilisateur demande une fonctionnalité qui a clairement besoin de sa position, avec alternative ville manuelle.

---

## 14. Publication et erreurs

### Bouton Publier

Doit se désactiver pendant l’envoi pour éviter les doubles publications.

### Optimistic UI

Préserver la stratégie actuelle si elle est confirmée fiable : le contenu peut apparaître immédiatement avec un statut de sync explicite.

### Erreur réseau

Ne jamais afficher “Publié” si l’état serveur final est inconnu sans indiquer le statut local.

### Retry

Réutiliser `supaPublishPostWithRetry` plutôt que créer une seconde file d’upload.

### Fichiers trop volumineux

Le rejet propre déjà couvert par les tests doit rester intact.

---

## 15. Retour après création

### Publication

```text
Créer → Publication → Publier
→ Feed
→ contenu nouvellement publié visible
```

### Bobine

```text
Créer → Bobine → Publier
→ Feed
→ Bobine visible inline
```

### Activité IRL

```text
Créer → Activité IRL → Créer
→ fiche de l’activité
```

Si l’activité est créée depuis une conversation, respecter le retour défini par le lot Conversation→IRL.

### Annuler

Fermer le composer revient au contexte d’origine sans changer la navigation active.

---

## 16. Drafts

Ne pas perdre les mécanismes de brouillon existants.

P0 :

- ne pas effacer un texte déjà saisi lors d’un changement accidentel de vue ;
- préserver les drafts existants si le code actuel les gère.

P1 :

- autosave local du composer unifié ;
- proposition `Reprendre le brouillon`.

Pas besoin d’une refonte de stockage dans le premier lot.

---

## 17. Analytics

Événements proposés :

```text
create_opened
create_type_selected
composer_opened
composer_media_added
publish_attempted
publish_succeeded
publish_failed
reel_create_opened
irl_create_opened
irl_create_succeeded
```

### Propriétés utiles

- `source = nav | feed | profile | irl | conversation | event` ;
- `format = text | photo | video | reel | audio | event` ;
- `passion_id` ;
- `active_profile_id` si nécessaire ;
- `has_event_context` booléen.

### Interdit

Ne pas envoyer dans analytics :

- texte du contenu ;
- fichier/média ;
- adresse exacte ;
- GPS ;
- contact ;
- message privé.

Métrique principale :

> **création démarrée → création réellement publiée**, puis contribution à la boucle relation/IRL.

Pas “nombre de taps sur Créer”.

---

## 18. Tests d’acceptation

### CREATE2-01 — bouton central

Tap `Créer` ouvre le sélecteur, sans activer `screen-studio` comme destination nav permanente.

### CREATE2-02 — Publication texte

`Créer → Publication → texte → Publier` crée un post visible dans Feed et persistant après reload.

### CREATE2-03 — Photo

Ajouter une photo dans Publication produit un post `photo` avec le média attendu.

### CREATE2-04 — Vidéo

Ajouter une vidéo produit un post `video` sans demander un onglet préalable.

### CREATE2-05 — Bobine

`Créer → Bobine` ouvre directement l’éditeur Bobine existant.

### CREATE2-06 — Bobine retour Feed

Après publication, Bobine visible dans Feed V2 ; pas de nav Bobines imposée.

### CREATE2-07 — IRL

`Créer → Activité IRL` ouvre le formulaire canonique `openCreateEvent`.

### CREATE2-08 — raccourci IRL

`IRL → Créer un événement` reste direct, sans sélecteur intermédiaire.

### CREATE2-09 — identité visible

Composer affiche le profil qui publie avant validation.

### CREATE2-10 — pas de switch silencieux

Changer Passio/format ne modifie jamais `currentProfileId` sans action explicite.

### CREATE2-11 — autre Passio

Si aucun profil correspondant n’existe, l’application demande explicitement de créer/choisir une identité ; aucune création silencieuse.

### CREATE2-12 — Mood facultatif

Post publiable sans Mood spécifique et visible dans le Feed.

### CREATE2-13 — zéro économie

Aucun `+10 pts`, Passia, score ou récompense dans le flux.

### CREATE2-14 — double tap

Double tap sur Publier ne produit qu’un seul post.

### CREATE2-15 — erreur réseau

État local/serveur clair, pas de faux succès.

### CREATE2-16 — gros fichier

Rejet propre conservé, aucun post créé.

### CREATE2-17 — permissions

Aucune caméra/micro/GPS demandée au simple tap sur `Créer`.

### CREATE2-18 — mineur

Une identité 13–17 peut créer du contenu autorisé mais ne peut pas créer une activité IRL après activation du gate T&S.

### CREATE2-19 — event context

Publication issue d’un événement conserve `event_id` sans exposer de localisation privée.

### CREATE2-20 — annulation

Annuler revient à l’écran d’origine avec état nav cohérent.

### CREATE2-21 — Podcast secondaire

Audio reste accessible via `Plus` et n’est pas supprimé par le lot.

### CREATE2-22 — CDV absent

Aucune entrée Carnet/CDV dans le sélecteur Créer cœur.

### CREATE2-23 — analytics privacy

Aucun texte, média, GPS ou adresse exacte dans la télémétrie.

### CREATE2-24 — mobile

Bottom sheet, clavier, upload, bouton Publier et changement d’identité fonctionnent sur petit viewport sans CTA masqué.

---

## 19. Ordre d’implémentation Claude Code

### C2-1 — Transformer `Créer` en action

- intercepter la nav CTA ;
- ouvrir un sélecteur léger ;
- ne pas supprimer `screen-studio` immédiatement ;
- conserver le Studio comme shell interne pendant la migration.

### C2-2 — Publication unifiée

- fusionner l’entrée Texte/Photo/Vidéo ;
- réutiliser `postText`, media inputs et `publishPost()` ;
- déduire le type depuis le média ;
- Mood optionnel ;
- supprimer copy de points.

### C2-3 — Identité explicite

- afficher profil actif ;
- sélection explicite ;
- aucun switch silencieux ;
- création progressive de profil passion si nécessaire.

### C2-4 — Bobine directe

- raccourci vers éditeur existant ;
- retour Feed ;
- préserver `event_id` si contexte.

### C2-5 — IRL direct

- `openCreateEvent()` depuis le sélecteur ;
- raccourcis contextuels conservés ;
- appliquer ensuite gate mineurs et règles T&S.

### C2-6 — Plus / audio

- déplacer Podcast/Audio sous `Plus` ;
- aucun changement de données ;
- tests non-régression.

### C2-7 — retrait Studio comme destination

Seulement lorsque tous les chemins précédents sont verts :

- retirer la destination nav ;
- conserver/extraire les composants réellement utilisés ;
- supprimer le code mort après audit handlers/globals.

---

## 20. Scope guard

Ce lot ne doit pas :

- réécrire `publishPost()` sans nécessité ;
- réécrire le media editor ;
- créer un second éditeur événement ;
- modifier le ranking Feed ;
- supprimer les données Podcast ;
- supprimer les données CDV ;
- ajouter une monnaie/récompense ;
- demander GPS au lancement du composer ;
- créer un profil passion sans consentement explicite ;
- modifier le schéma multi-profil sensible sans audit ;
- mélanger les migrations T&S IRL avec la refonte visuelle du composer.

---

## 21. Definition of Done

Création V2 est prête quand :

- `Créer` ouvre un choix d’intention plutôt qu’un écran complexe ;
- Publication fusionne texte/photo/vidéo ;
- Bobine ouvre directement l’éditeur adapté ;
- Activité IRL réutilise `openCreateEvent()` ;
- Podcast est préservé mais secondaire ;
- CDV est absent du cœur ;
- identité active visible avant publication ;
- aucun changement d’identité silencieux ;
- Mood facultatif ;
- aucune récompense artificielle ;
- permissions demandées seulement au moment utile ;
- publication et retour Feed cohérents ;
- tests existants de publication restent verts ou sont migrés avec preuve équivalente ;
- mobile, multi-profil, sécurité et télémétrie restent maîtrisés.

---

## 22. Répartition IA

### ChatGPT

- hiérarchie des intentions ;
- règles identité/Passio ;
- UX mobile et critères d’acceptation ;
- cohérence Feed + IRL ;
- arbitrage du scope.

### Claude Code

- cartographie tous les handlers Studio/media/IRL ;
- implémente C2-1→C2-7 en petits diffs ;
- conserve `publishPost`, uploads, retry et media editor quand possible ;
- adapte les tests ;
- mesure les régressions mobile.

### Codex

- attaque doubles publications et races réseau ;
- vérifie fuites cross-profil ;
- contrôle les permissions appareil ;
- vérifie `event_id`, mineurs et absence de localisation privée ;
- recherche le code Studio réellement mort avant suppression.
