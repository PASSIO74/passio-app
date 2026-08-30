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

### Fil
- Le fil « Accueil » est l'**union** des publications correspondant aux passions choisies par le
  lecteur et des publications des comptes suivis, dédupliquée. Suivre quelqu'un a donc un effet
  observable et durable, sans bascule à réactiver.
- Une vue « Suivis » stable permet de ne voir que les comptes suivis.

### Évolutions futures
- Un besoin de séparation réelle (audiences distinctes, pseudonymes) exigerait un nouvel ADR **et**
  une refonte du graphe social — ce n'est pas une évolution incrémentale de ce modèle.

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
