# PASSIO — Navigation cœur V2 et parcours Feed → IRL

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse produit** : **« partage tes Passio et rencontre les gens »**

## Principe directeur

Chaque destination primaire doit servir au moins une étape du cycle :

**Passion → contenu → personne → interaction → conversation → IRL → nouveau contenu.**

Une destination qui ne sert pas clairement cette boucle sort de la navigation cœur.

## Navigation cible

### Barre principale mobile

1. **Fil** — contenus et découvertes par passion.
2. **IRL** — activités, événements et rencontres liées aux passions.
3. **Créer** — action centrale, pas nécessairement un écran persistant : post, média ou activité selon contexte.
4. **Messages** — conversations privées et coordination humaine.
5. **Profil** — identité générale + profils passionnels + réglages essentiels.

Cette cible privilégie une navigation explicite à cinq points d'entrée maximum. Elle remplace la logique actuelle plus large où `DEFAULT_NAV_ORDER` contient `feed`, `bobines`, `explore`, `studio`, `messages`, `irl`, `cdv`.

### Explorer

**Explorer n'est pas une destination primaire par défaut.** Son rôle doit être absorbé par le Fil via recherche, filtres, découverte de passions/personnes/activités et suggestions contextuelles. Il ne redevient une destination autonome que si des tests montrent un rôle réellement distinct que le Fil ne remplit pas.

### Bobines / stories / vlog

Ce sont des **formats de contenu**, pas des univers produits concurrents. Ils doivent être accessibles dans le Fil, la création ou le profil, pas imposer chacun une destination permanente.

### CDV

Retiré de la navigation cœur. Le contenu et les données doivent être préservés pour **Passio : Voyage**.

### Wallet

Supprimé du cœur.

## Règles d'UX globales

- retour vers le Fil prévisible ;
- état actif de navigation toujours vrai ;
- création accessible en un geste depuis le Fil et IRL ;
- profil auteur toujours accessible depuis un contenu ;
- Messages accessibles depuis profil/contexte humain sans devoir repasser par un hub générique ;
- IRL accessible depuis une passion, une personne, une conversation et le nav global ;
- aucune identité passionnelle ne change silencieusement lors d'une navigation ;
- toute action sensible affiche l'identité avec laquelle l'utilisateur agit si une ambiguïté existe.

## Parcours P0-1 — Nouveau compte → premier contenu pertinent

### Objectif

Obtenir de la valeur avant toute configuration avancée.

### Parcours cible

`création compte → règles essentielles → choix de 3 à 7 Passio → confidentialité/localisation minimale → Fil personnalisé`.

### À différer

Bio détaillée, personnalisation esthétique, paramètres avancés, création de multiples profils complexes, marketplace, Wallet, gamification, abonnements, crypto.

### Critères

- aucun Wallet/point/rang ;
- le choix des passions est modifiable plus tard ;
- l'utilisateur voit un Fil pertinent immédiatement ;
- un écran vide propose une action claire : ajouter une passion ou explorer ;
- aucune localisation précise obligatoire pour voir du contenu ;
- analytics : `signup_completed`, `passions_selected`, `personalized_feed_viewed`.

## Parcours P0-2 — Fil → personne

### Carte de contenu cible

Toujours rendre visibles :

- auteur ;
- profil passionnel/contexte de publication ;
- Passio associée ;
- contenu ;
- actions sociales utiles ;
- accès au profil de l'auteur.

Ne pas afficher : score, rang, points, Passia.

### Interaction

Like/réaction reste un signal léger. Commentaire, profil visité, follow ou message sont des signaux plus forts pour le produit car ils rapprochent de la relation humaine.

### Critères

- avatar/nom ouvrent le bon profil ;
- pas de fuite entre profils du même compte ;
- blocage/confidentialité priment ;
- la carte conserve un contexte passion clair ;
- `content_opened`, `profile_opened_from_content`, `meaningful_interaction` instrumentables.

## Parcours P0-3 — Profil → conversation

### Profil public cible

Doit répondre vite à :

1. Qui est cette personne dans cette passion ?
2. Qu'est-ce qu'elle partage/fait ?
3. Avons-nous une passion ou activité commune ?
4. Puis-je la suivre ou lui parler ?

CTA prioritaires : **Suivre** et **Message** selon permissions.

### Démarrage conversation

Un message initié depuis un contenu peut transporter un contexte non sensible, par exemple une référence au post/activité, sans copier de PII ni révéler une information privée.

### Critères

- nombre minimal d'étapes ;
- utilisateur bloqué : aucun démarrage possible ;
- compte/profil privé : politique cohérente ;
- identité émettrice explicite quand plusieurs profils passionnels sont possibles ;
- cross-compte testé.

## Parcours P0-4 — Conversation → IRL

### Intention

Faire de l'IRL une suite naturelle d'une conversation, pas une mécanique de dating forcée.

### CTA possibles

- « Voir des activités de cette Passio » ;
- « Proposer une activité » ;
- partager une activité existante dans la conversation.

Éviter les CTA agressifs du type « Rencontrer cette personne » sans contexte, consentement ni règles de sécurité.

### Critères

- activité liée à une Passio ;
- refus/ignorer/annuler faciles ;
- lieu précis protégé selon visibilité ;
- pas de partage automatique de position ;
- block/report toujours disponibles ;
- analytics : `irl_intent`, `irl_event_opened`, `irl_rsvp`.

## Parcours P0-5 — IRL → retour dans le Fil

Après une activité :

- proposition facultative de partager une photo/post ;
- pré-remplir le contexte Passio/activité si autorisé ;
- visibilité choisie explicitement ;
- jamais de récompense artificielle ;
- jamais d'obligation de publier.

Analytics : `irl_attended`, `post_irl_contribution`.

## Multi-profil — règles non négociables

Le multi-profil reste une capacité fondamentale. Tout parcours ci-dessus doit répondre aux questions : quel profil agit, quelle identité est affichée, quel profil reçoit les notifications, quel compte contrôle l'objet, et quelles données sont visibles cross-profil/cross-compte.

Aucune séparation ne doit dépendre uniquement de l'UI. Les tests multi-comptes / multi-profils font foi.

## Ranking Feed — doctrine V2

Ne pas modifier la formule en même temps que la navigation sauf nécessité technique. L'existant possède déjà des invariants testés : affinité passions/auteur, fraîcheur dominante, conservation de l'ensemble de posts, fallback chronologique et ordre stable.

La V2 doit d'abord instrumenter puis évaluer des signaux candidats : pertinence passion, affinité humaine, fraîcheur, qualité, diversité, exploration, sécurité, potentiel de conversation/IRL. Le temps passé ne doit jamais être l'objectif unique.

## Definition of Done navigation/parcours

- cinq destinations cœur maximum ;
- Wallet et CDV absents du nav cœur ;
- Explorer n'est pas un doublon du Fil ;
- formats média ne deviennent pas des produits séparés ;
- nouveau compte → Fil pertinent sans gamification ;
- Fil → profil → message fonctionne de bout en bout ;
- message → IRL fonctionne avec confidentialité/blocage ;
- IRL → contribution reste facultatif ;
- tests mobile + desktop ;
- navigation, profils, interactions, messages, IRL, confidentialité, blocage et multi-comptes verts.
