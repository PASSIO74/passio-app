# ADR-010 — Une identité publique par compte ; les passions classent, elles n'identifient pas

- **Statut** : Accepté
- **Date** : 2026-08-30
- **Supersède** : [ADR-002](ADR-002-multi-profile-identity.md) (« Identité multi-profil comme concern de première classe »), qui passe au statut *Superseded par ADR-010*.

## Contexte

ADR-002 (2026-08-08) posait que « un compte porte plusieurs identités (photographe, motard,
cuisinier…), chacune avec son contexte social », et faisait de la séparation entre ces identités un
**invariant d'ingénierie** garanti au niveau des données.

Cet invariant n'a jamais été implémenté, et le produit a évolué dans la direction opposée. Trois
strates documentaires contradictoires coexistaient au moment d'écrire cet ADR :

1. **ADR-002** — plusieurs identités, séparation garantie par la donnée.
2. **`docs/PASSIO_PROFILE_MULTIPROFILE_V2_2026-08-20.md`** — trois concepts distincts (Compte /
   Profil passion / Intérêts Feed), avec une cible serveur `passion_profiles` et une visibilité par
   passion.
3. **Lot UI-8 (2026-08-29)** — « une personne, plusieurs passions » : un seul profil public, les
   passions n'étant que des univers de contenu.

C'est la strate (3) qui tourne en production. ADR-002 n'avait jamais été superseded, et
ADR-007 avait explicitement laissé la question ouverte (« est-ce que "commenter en tant que motard"
est une promesse produit ? »). Le lot UI-8 y a répondu **de fait**, sans rouvrir la décision.

### Ce que le code fait réellement (mesuré le 2026-08-30)

| Objet | Portée réelle | Ancrage |
|---|---|---|
| Abonnés / abonnements | compte | `follows(follower_id, following_id)` — deux identifiants de compte |
| Profil public | compte, **une seule ligne** | `supaUpsertProfile` écrit `{ id: MY_UID, username, passions: jsonb }` |
| Publications | compte + étiquette | `posts.author_id` + `posts.passion_id` |
| Likes, commentaires, réactions, RSVP, messages, notifications, stories | compte | `user_id` / `author_id` |

Le schéma de production ne contient **aucune** colonne d'identité par passion : ni `posts.profile_id`,
ni ligne `profiles` par passion, ni table `passion_profiles`. Le `profileId` local d'une publication
n'est jamais transmis au serveur. La spécification V2 le constatait elle-même : « l'architecture
actuelle est donc fondamentalement **compte-first** au niveau serveur ».

La conséquence pratique est que ADR-002 décrivait une garantie de confidentialité **inexistante**.
Un document d'architecture « Accepté » qui promet une séparation que le code n'offre pas est plus
dangereux qu'une absence de document : il invite à raisonner comme si la frontière existait.

## Décision

1. **Un compte possède une seule identité publique** : un pseudo, un avatar, une bio, un compteur
   d'abonnés, un historique. C'est l'objet `profiles` (une ligne, clé `id = MY_UID`).
2. **Une passion est une étiquette de classification et une préférence de lecture.** Elle n'a ni
   identité, ni abonnés, ni contexte social propre, ni pseudonyme.
3. **Toutes les interactions sociales appartiennent au compte** : publications, likes, commentaires,
   réactions, abonnements, messages, participations, signalements.
4. **Le graphe `follows` reste au niveau du compte.** On suit une personne entière, jamais une de
   ses passions.
5. **Aucune séparation de confidentialité entre passions.** Ce que je publie dans une passion est
   visible de quiconque peut voir mon contenu. Il n'existe pas de cloisonnement, et l'interface ne
   doit jamais laisser croire qu'il en existe un.
6. **Écriture et lecture sont deux états indépendants.** Choisir la passion dans laquelle on publie
   ne modifie pas les préférences du fil ; modifier les préférences du fil ne change pas la passion
   de publication. *(Ce principe est repris tel quel de la spécification V2 §1, qui l'avait énoncé
   correctement : il est la seule partie de ce document qui reste en vigueur.)*
7. **Aucun `profile_id` par passion ne sera introduit**, ni côté client comme identité, ni côté
   serveur comme colonne.

## Conséquences

### Interface
- Le mot « profil » ne désigne plus que la page personnelle de quelqu'un. « Profil passion »,
  « multi-profils », « fil passion » et « univers de contenu » deviennent **« passion »**.
- Le vocabulaire d'identité (« activer un profil », « Utiliser pour créer ») est remplacé par un
  vocabulaire d'usage : **« Publier dans : X »** pour l'écriture, **« Passions à afficher »** pour
  la lecture.
- Le profil d'un autre compte présente **une seule identité** ; ses passions y sont des filtres de
  ses publications, jamais des personnes distinctes.
- Texte produit de référence : « Un seul profil, plusieurs passions. Publie dans la passion qui
  correspond ; ton fil réunit les passions que tu choisis et les personnes que tu suis. »

### Données
- Aucune migration. Le schéma de production tient déjà ce modèle ; c'est la documentation et
  l'interface qui le rejoignent.
- `profiles.passions` (jsonb) reste la liste des passions du compte. Elle a deux rôles assumés :
  vitrine publique et sauvegarde relue à la reconstruction d'un appareil neuf. Les passions
  archivées y sont **publiées marquées** et filtrées à l'affichage.
- `posts.passion_id` reste l'étiquette de classement d'une publication.

#### Une classification commune, deux politiques par type d'objet

La clé étrangère `passion_id → passions(id)` est la même sur les cinq tables ; l'invariant
**produit**, lui, ne l'est pas. Une seule question est posée partout — « cet identifiant existe-t-il
dans le référentiel ? » (`estPassionCanonique`, app-02) — et la réponse est appliquée par deux
politiques distinctes :

| Table | Politique | Point d'écriture | Obligatoire dans l'interface ? | Comportement |
|---|---|---|---|---|
| `posts` | **obligatoire** | `supaPublishPostWithRetry` (point central : Studio, bobine, partage d'événement, repartages) | oui — le `<select>` est toujours peuplé et présélectionné | refus **avant** la requête, avec une cause distincte (`passion_absente` / `passion_inconnue`) |
| `events` | **obligatoire** | `supaPublishEvent`, `supaUpdateEvent` | oui — `submitEvent` refuse déjà une passion vide | refus avant la requête, aux deux points d'écriture |
| `profiles` | facultative | `supaUpsertProfile` | non | normalisée en `null` ; le reste du profil public part quand même |
| `stories` | facultative | `supaPublishStory` | non | idem — une story éphémère vaut d'être publiée sans classement |
| `conversations` | facultative | `supaCreateConversation`, `supaCreateGroup`, `supaCreateEventConversation` | non | idem — une conversation existe pour ses membres |

**Pourquoi pas un garde universel.** Un refus uniforme sur les cinq tables aurait fait échouer tout
l'upsert du profil public pour un classement dont il n'a pas besoin : c'est exactement le défaut P0
du 2026-08-30 (pseudo, avatar, bio et liste des passions n'atteignaient plus personne). À l'inverse,
normaliser en `null` sur `posts` ferait perdre le classement d'une publication en silence.

**Le référentiel fait autorité, la liste locale sert de repli.** La table `passions` est chargée une
fois en arrière-plan et mise en cache (`chargerReferentielPassions`). Le démarrage ne l'attend
jamais, et un échec de chargement laisse les 19 passions de `PASSIONS` (app-01) opérantes — une
panne réseau ne doit pas bloquer une publication légitime.

#### `PASSIONS` est un SOCLE, pas un simple repli

Conséquence à assumer, formulée par Benjamin le 2026-08-31 :

> `PASSIONS` constitue le socle canonique **minimal embarqué** ; Supabase peut **ajouter** des
> identifiants, mais ne peut pas **désactiver à lui seul** une passion encore embarquée dans le
> client.

La liste locale et le référentiel serveur sont donc en **union**, pas en remplacement. Un identifiant
présent dans `PASSIONS` reste accepté même si le serveur cesse de le servir — c'est ce qui garantit
qu'une panne de chargement, une réponse partielle ou un filtre RLS ne bloquent jamais les 19 passions
existantes.

Le prix de cette garantie : **supprimer ou désactiver une passion exigera une mise à jour du client**,
ou l'ajout ultérieur d'un statut serveur explicite (une colonne `active`, que le client lirait et
respecterait). Tant que ce statut n'existe pas, retirer une ligne de `passions` côté serveur ne
retire rien côté client.

#### Passions personnalisées : création SUSPENDUE

Arbitrage de Benjamin, 2026-08-31. La sortie A permettait de conserver une passion personnalisée
comme centre d'intérêt du fil, puisque le filtre de lecture est 100 % local. **Cette porte reste
fermée**, pour une raison de produit et non de technique : une passion non canonique ne peut
alimenter **aucun** contenu serveur, donc l'offrir comme nouveau centre d'intérêt créerait un
**filtre sans contenu** — une fonctionnalité incapable de rien montrer.

- aucune **nouvelle** passion personnalisée ne peut être créée (trois tuiles masquées **et** garde au
  point de convergence `openCreateCustomPassion` — masquer sans garder laisserait passer un appelant
  futur, garder sans masquer offrirait une porte qui refuse au tap) ;
- les **anciennes** sont conservées, sans suppression ni transformation : elles restent dans
  `state.user.customPassions`, restent publiées dans le jsonb `profiles.passions` (qui ne porte
  aucune clé étrangère) et leurs publications restent en place ;
- elles ne peuvent pas servir à publier ;
- aucune interface ne propose de rouvrir leur création.

La suite envisagée est « **Proposer une passion** », avec validation avant ajout au référentiel
canonique. Hors périmètre de cet ADR.

⚠️ **Le discriminant n'est ni le drapeau `custom: true`, ni le préfixe `custom_`.** Le drapeau ne vit
que dans `state.user.customPassions` et disparaît sur un appareil neuf ; le préfixe est une liste
noire, qui ne couvre ni la valeur fantôme `"autre"`, ni `"test"`, ni la chaîne vide. Seule la liste
blanche du référentiel les rejette toutes.

### Fil
- Le fil « Accueil » est l'**union** des publications correspondant aux passions choisies par le
  lecteur et des publications des comptes suivis, dédupliquée. Suivre quelqu'un a donc un effet
  observable et durable, sans bascule à réactiver.
- Une vue « Suivis » stable permet de ne voir que les comptes suivis.

### Évolutions futures
- Un besoin de séparation réelle (audiences distinctes, pseudonymes) exigerait un nouvel ADR **et**
  une refonte du graphe social — ce n'est pas une évolution incrémentale de ce modèle.

### Deux pièges de FUSION, payés le 2026-08-31

Le hotfix #226 (séparation des autorités d'écriture du profil) et cette refonte ont été menés
sur deux branches, puis fusionnés. Sept conflits, tous des correctifs qui se recouvrent. Deux
résolutions étaient fausses, et **aucune ne se voyait** — ni dans le diff, ni à l'exécution, ni
dans les audits statiques. Seule la suite complète en CI les a levées (run 2342, 16 rouges).

**① Un nom qui a changé de sens.** Quatre chemins continuaient d'appeler `supaUpsertProfile()`
pour publier la carte d'une passion (photo, couverture, retrait de couverture, bio). Le nom
existait toujours, l'appel compilait, aucun test unitaire ne bronchait — mais depuis le hotfix
ce n'est plus qu'un **alias d'`ensure`**, qui n'écrit AUCUN champ d'une ligne existante. Les
quatre étaient devenus des no-op silencieux : la carte vue par un visiteur ne bougeait plus.
La leçon générale : **garder un ancien nom comme alias d'une sémantique réduite transforme
chaque appelant non recâblé en écriture morte.** Un alias est commode pour les tests ; en
production il vaut mieux supprimer le nom, pour que le compilateur — ici `audit:handlers` et la
revue — désigne les appelants restants.

**② « Même effet » n'est pas une preuve.** La résolution avait remplacé le choix de la passion
principale par `optionalCanonicalPassion(première vivante)`, avec le commentaire « même effet,
une seule règle ». Les deux expressions ne répondent pas à la même question : `optionalCanonical`
répond « cette valeur-là est-elle écrivable ? », le parcours répond « laquelle de mes passions
représente ce compte ? ». Un compte portant une passion personnelle **puis** une canonique
publiait donc `passion_id: null` — il perdait son classement public en possédant pourtant une
passion valide. La leçon : **une fusion qui unifie deux implémentations doit être justifiée par
un test, jamais par un commentaire affirmant l'équivalence.**

Conséquence de méthode, appliquée : les deux verrous ajoutés visent le **résultat** (« la liste
des passions atteint la base », « la principale vaut yoga ») et non le nom de la fonction
appelée. Un verrou qui exigerait « `supaUpsertProfile` n'est plus appelée » resterait vert le
jour où un cinquième chemin oublierait de publier tout court.

### Un test qui ne contrôle pas sa prémisse mesure autre chose

Trois tests du référentiel passaient en local et échouaient en CI. La cause n'était pas le code :
`index.html` charge le SDK Supabase depuis un CDN. Sans réseau sortant, `_initRealSupa()` renonce
et le test installe son faux référentiel en premier. **Avec** réseau, le SDK se charge au boot,
`chargerReferentielPassions()` lit la table `passions` de la **vraie base**, et comme ce cache est
à un seul coup, le faux n'est plus jamais interrogé. Le test mesurait la production.

Le défaut était dans le test, pas dans le code — un vrai client DOIT charger le vrai référentiel
au démarrage. La suite coupe désormais la source du SDK **et vérifie sa prémisse** avant chaque
cas. Règle à retenir : **tout test qui injecte un faux client doit prouver qu'aucun vrai client
ne l'a précédé**, sinon il finit par passer, ou échouer, pour une raison qui ne le regarde pas.

## Alternatives écartées

- **Segmenter les abonnements par passion** (colonne `passion_id` dans `follows`) : rejeté. Coût de
  migration et de RLS élevé, et fragmentation d'un graphe social encore très petit (beta privée).
  Un abonnement segmenté rendrait aussi le bouton « Suivre » ambigu à chaque endroit où il apparaît.
- **Implémenter réellement ADR-002** (table `passion_profiles`, contenus rattachés à une identité
  passionnelle, visibilité par passion) : rejeté. C'est la cible de la spécification V2 ; elle
  suppose de réécrire l'attribution de tout le contenu social existant pour livrer une promesse
  — « commenter en tant que motard » — dont aucun besoin utilisateur n'a été observé. Le produit
  a par ailleurs constaté qu'elle rendait le système incompréhensible à son propre auteur.
- **Supprimer les passions** et ne garder que des tags de publication : rejeté. Les passions servent
  aussi de préférence de lecture du fil et d'axe de découverte (Explorer, Rencontrer) ; ce sont deux
  usages réels, indépendants de la question de l'identité.
- **Laisser ADR-002 « Accepté » et le contredire en pratique** : rejeté. C'est l'état qui a produit
  la confusion que cet ADR clôt.

## Trigger de réexamen

- Une demande utilisateur **répétée et observée** de séparer les audiences (« je ne veux pas que mes
  collègues voient ma passion X ») — le besoin de confidentialité entre passions étant aujourd'hui
  supposé, jamais mesuré.
- Un compte type dépassant durablement ~5 passions actives, où le fil unique deviendrait illisible.
- L'ouverture du produit au-delà de la beta privée, si la taille du graphe social change les
  arbitrages ci-dessus.
