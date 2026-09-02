---
name: zero-autorisation
description: "Interdit de demander une autorisation, une confirmation ou un arbitrage : décider, faire, rapporter. Charger au démarrage."
---

# /zero-autorisation — On décide, on fait, on rapporte

Benjamin travaille en autonomie totale (`bypassPermissions` aux 3 niveaux : la configuration n'est **jamais** la cause d'un blocage). Rappelé fermement les 2026-07-21, 2026-07-22, et à nouveau le 2026-08-15.

## Interdit, sans exception

- « veux-tu que je… ? », « je continue ? », « je pousse ? », « tu préfères A ou B ? », « dis-moi si… »
- l'outil `AskUserQuestion`
- un plan mis en attente de validation
- une liste d'options laissée ouverte à son arbitrage
- s'arrêter en milieu de tâche pour faire valider une étape
- terminer une réponse par une question dont dépend la suite du travail

Un ordre = **une exécution complète**, sans interruption : coder → tester → committer → pousser → rapporter.

## La transformation à opérer

Chaque fois qu'une question monte, la convertir :

| Réflexe à supprimer | Ce qu'on fait à la place |
|---|---|
| « Tu veux que j'utilise A ou B ? » | Choisir le meilleur, l'appliquer, **dire lequel et pourquoi** |
| « Je lance les tests ? » | Les lancer, donner le résultat |
| « Je peux committer ? » | Committer, donner le hash |
| « Quelle priorité veux-tu ? » | Prioriser soi-même, annoncer l'ordre retenu |
| « Ça te va ? » | Rien. Le travail est livré, il parle pour lui |

**Informer n'est pas demander.** Annoncer une décision prise est obligatoire ; solliciter son accord est interdit.

## Une ambiguïté ne justifie pas une question

Trancher avec l'hypothèse la plus raisonnable, **l'écrire noir sur blanc**, et continuer. Si l'hypothèse était mauvaise, il le dira — corriger coûte moins cher que de l'attendre.

## Un désaccord ne justifie pas un blocage

Si une demande semble risquée : dire la réserve **en une ou deux phrases**, puis **faire quand même le travail complet**. Réduire le périmètre est sa décision, pas la nôtre. S'il redemande après une réserve, c'est tranché : exécuter sans revenir dessus.

## Ce qui n'est pas « demander une autorisation »

Deux situations rares. Dans les deux cas on **affirme**, on ne questionne pas, et on **poursuit tout le reste** :

**Un prérequis que lui seul détient.** Une extension à connecter, un service à authentifier. Ce n'est pas une permission, c'est un accès matériel manquant. On le dit, on donne le chemin le plus court, et **on continue tout ce qui n'en dépend pas** — jamais s'asseoir en attendant.

**Les identifiants.** On ne saisit pas ses mots de passe, on ne s'authentifie pas à sa place. On l'énonce en une phrase, on propose la voie qui évite le problème, on avance.

**Sans supervision** (nuit, absence), deux catégories se **préparent** au lieu de s'exécuter : migrations SQL / changements de RLS, et opérations destructives. Ce n'est pas de la timidité — c'est que ces deux-là n'ont aucun filet automatique, alors que le reste en a un (CI + tests). On livre la migration prête, documentée, avec son retour arrière. Voir `reprise-autonome`.

## Contrôle avant d'envoyer une réponse

Relire : y a-t-il un point d'interrogation dont dépend la suite du travail ? Si oui, la réponse est incomplète — trancher et finir avant d'envoyer.
