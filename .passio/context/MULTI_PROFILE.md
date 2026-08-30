# Passions & identité — garde-fous (capacité fondamentale)

> **Réécrit le 2026-08-30 par [ADR-010](../adr/ADR-010-identite-publique-unique-passions-classification.md).**
> La version précédente de ce document appliquait ADR-002 (« un compte porte plusieurs identités
> passionnelles ») et affirmait une modélisation `profiles` + `profile_passions`. Cette table
> n'existe pas en production, et cette séparation n'a jamais été implémentée : le document
> décrivait une frontière de confidentialité **inexistante**, ce qui est plus dangereux qu'une
> absence de document. Le modèle en vigueur est ci-dessous.

## Le modèle

Un compte possède **une seule identité publique** : un pseudo, un avatar, une bio, un compteur
d'abonnés, un historique. Ses **passions** servent à deux choses, et à rien d'autre :

1. **classer** ce qu'il publie (`posts.passion_id`) ;
2. **choisir** ce qu'il voit dans son fil (préférence de lecture).

Une passion n'a ni identité, ni abonnés, ni contexte social propre, ni pseudonyme. Il n'existe
**aucun cloisonnement de confidentialité entre passions**.

## Les 8 questions à se poser AVANT tout code touchant du contenu

1. **Quel COMPTE agit** (publie, commente, réagit) — jamais « quel profil » ?
2. **Quel compte possède** l'objet manipulé ?
3. Qu'est-ce qu'un **autre compte** peut voir ? (c'est la seule frontière réelle)
4. **Quel compte reçoit** la notification ?
5. **Quelle passion CLASSE** l'objet, et cette étiquette est-elle bien figée à la création ?
6. Le rendu confond-il l'étiquette de passion avec une identité ? (interdit)
7. L'écriture (passion de publication) et la lecture (passions affichées) restent-elles
   **indépendantes** ?
8. **Quelle identité est enregistrée** en analytics/télémétrie — le compte, pas la passion ?

## Invariant de sûreté

> La seule frontière de confidentialité est **entre comptes**, garantie au niveau des données
> (RLS/filtres serveur), jamais par l'UI seule (cf. ADR-003).

Corollaire à ne jamais oublier : **il n'y a rien à garantir entre les passions d'un même compte.**
Toute interface qui suggère le contraire (« publier en tant que… », un pseudonyme par passion, un
compteur d'abonnés par passion) est un bug de produit, pas une fonctionnalité.

## Ce qui est interdit sans nouvel ADR

- introduire un `profile_id` par passion, côté client comme serveur ;
- segmenter `follows` par passion ;
- donner un pseudo, un avatar public ou des abonnés propres à une passion ;
- laisser le choix de publication modifier les préférences du fil, ou l'inverse.

## Impacts transverses à vérifier

DB · permissions · publication · feed · recommandations · recherche · follow · messagerie ·
notifications · analytics · modération.

## État actuel (factuel, vérifié le 2026-08-30)

- **Serveur** : une ligne `profiles` par compte (`id = MY_UID`), `profiles.passions` en jsonb
  (liste des passions du compte — vitrine publique **et** sauvegarde relue à la reconstruction d'un
  appareil neuf ; les archivées y sont publiées marquées puis filtrées à l'affichage).
  `follows(follower_id, following_id)` entre comptes. `posts.passion_id` = étiquette de classement.
- **Aucune** table `passion_profiles` / `profile_passions`, aucune colonne `posts.profile_id`.
- **Client** : `state.user.profiles[]` + `currentProfileId` — la passion d'ÉCRITURE courante ;
  `state.selectedFeedPassions` / `_activeFeedPassions` — les préférences de LECTURE. Deux états
  distincts, par décision.

Lié : [[PASSIO_SYSTEM_MODEL]], `SECURITY.md`, skill `rls-audit`, ADR-003, ADR-010.
