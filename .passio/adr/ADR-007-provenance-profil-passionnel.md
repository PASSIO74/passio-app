# ADR-007 — Provenance du profil passionnel dans les données

- **Statut** : **Accepté — option C** (Benjamin a délégué la décision le 2026-08-15)
- **Date** : 2026-08-15
- **Origine** : constat F6 de l'analyse croisée (`PASSIO_INITIAL_JOINT_AUDIT.md`)

## Contexte

Le concept produit central de PASSIO est le multi-profil passionnel (ADR-002). La question posée par la revue croisée est plus fondamentale qu'une fuite de données :

> Pour un objet donné, la base peut-elle prouver **quelle identité passionnelle** l'a produit ?

## Ce que dit la prod (vérifié le 2026-08-15)

| Fait | Réalité |
|---|---|
| Colonne de provenance | `passion_id` existe sur `posts`, `stories`, `events`, `conversations`, `profiles` |
| Tables d'interaction | `passion_id` **absent** de `post_comments`, `comment_interactions`, `post_likes`, `event_comments`, `event_reactions`, `cdv_*`, `step_interactions`, `follows`, `notifications`, `video_lives` |
| Nature de `passion_id` | **Slug de taxonomie en texte libre** — valeurs observées : `cuisine, mode, moto, musique, photo, podcast, tech, voyage, yoga` |
| Contrainte | **Aucune clé étrangère, aucune contrainte.** Le client choisit librement la valeur |
| Modèle multi-profil | Une seule ligne `profiles` par compte ; `profiles.passions` (jsonb) liste les passions, `profiles.passion_id` porte l'active. Il n'existe **pas** de table `profile_passions` en prod |

## Problème

Trois conséquences, par ordre de gravité décroissante :

1. **« Benjamin motard a publié » est prouvable en base. « Benjamin motard a commenté » ne l'est pas.** Toute l'interaction sociale — commentaires, réactions, likes, follows, notifications — est attribuée au **compte**, jamais au profil passionnel. Pour un produit dont c'est le concept central, c'est un trou de modèle, pas un détail.
2. **La provenance existante n'est pas vérifiée.** Rien n'empêche d'écrire `passion_id: 'photo'` sur un post depuis un compte qui ne revendique pas cette passion. Ce n'est pas une faille de sécurité — une passion n'appartient à personne — mais l'attribution reste déclarative.
3. **Aucune intégrité référentielle.** Un slug mal orthographié crée silencieusement une passion fantôme, invisible des filtres.

## Options

**A — Ne rien changer.** Le profil passionnel reste un concept d'affichage côté client. Coût nul, mais le produit ne peut jamais répondre « montre-moi ce que j'ai fait en tant que motard », ni segmenter le fil par identité de manière fiable.

**B — Étendre `passion_id` aux tables d'interaction.** Provenance complète. Coût : migration sur ~10 tables, écriture à adapter partout, et une question à trancher pour l'historique (rétro-attribuer, ou laisser NULL et l'assumer).

**C — Contraindre l'existant seulement.** Table de référence des passions + FK + vérification que la passion appartient au compte à l'écriture. Rend fiable ce qui existe, sans traiter les interactions.

**D — B puis C.** Provenance complète et vérifiée.

## Décision retenue : **C**

Benjamin a délégué l'arbitrage. Retenu : **contraindre l'existant, ne pas étendre aux interactions.**

Ce qui a emporté la décision : l'option C corrige un défaut **réel et déjà mesurable** (rien n'empêche aujourd'hui une passion fantôme née d'une faute de frappe), pour un coût faible et un risque nul — les 10 valeurs présentes en prod sont toutes dans la liste canonique de 19, aucun nettoyage n'est nécessaire. L'option B, elle, engagerait une migration sur dix tables et une modification de toutes les écritures **pour une fonctionnalité qui n'existe pas encore**. On ne paie pas aujourd'hui le prix d'un besoin hypothétique.

Mise en œuvre : `migrations/migration_passions_referentiel.sql` (préparée).

Conséquence à assumer : ajouter une passion dans l'app exigera désormais une migration **d'abord**. C'est le prix de l'intégrité référentielle, et il est modeste — la liste bouge rarement.

### Recommandation d'origine (conservée pour la traçabilité)

**C d'abord, B ensuite si le produit l'exige.**

Rendre fiable ce qui existe déjà coûte peu et supprime les passions fantômes. Étendre à dix tables d'interaction est une migration lourde qui ne se justifie que si une fonctionnalité la demande réellement — segmentation du fil par identité, statistiques par passion, ou notifications adressées à un profil précis.

Écrire dix colonnes « au cas où » serait exactement la sur-ingénierie que la revue croisée recommande d'éviter. **Ce qu'il faut trancher n'est pas technique : est-ce que « commenter en tant que motard » est une promesse produit, ou est-ce que la passion ne qualifie que le contenu publié ?**

## Compromis / risques

- Option B : les interactions historiques resteraient sans provenance — toute statistique par passion afficherait un « avant/après » trompeur si ce n'est pas signalé.
- Option C : introduire une FK sur une colonne libre exige un nettoyage préalable des valeurs existantes.
- Ne rien faire laisse le décalage entre la promesse produit (multi-profil) et ce que la base sait réellement.

## Trigger

À rouvrir dès qu'une fonctionnalité demande de segmenter, filtrer ou compter **par profil passionnel** plutôt que par compte.
