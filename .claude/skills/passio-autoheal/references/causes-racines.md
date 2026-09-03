# Cause racine et réparation — étapes 5 et 6

## Trois causes récurrentes sur ce dépôt

À écarter avant d'en chercher une quatrième.

- **Écriture qui échoue en silence** : le SDK Supabase ne lève pas sur un refus RLS. Sans lire `{ error }`, l'action reste « réussie » à l'écran et disparaît au rechargement.
- **Survivant d'un correctif partiel** : la classe est déjà connue et traitée ailleurs. Lancer `chercher-survivants`.
- **Catch large** : `catch(e){return [];}` masque un `ReferenceError` (bug `diagLog` = fil vide pendant 6 jours).

## RÉPARER — en copiant le chemin déjà correct

Le traitement juste existe presque toujours ailleurs dans le dépôt. L'aligner dessus plutôt qu'inventer une troisième variante. `FWD-SILENT-010` s'est corrigé en recopiant ce que le chemin d'envoi principal faisait **vingt lignes plus bas dans le même fichier**.

## Interdits absolus (§36 de la charte de mission)

Jamais « réparer » en ouvrant une RLS, en contournant l'auth, en exposant `service_role`, en supprimant une validation, en ignorant une erreur, en supprimant un test, ou en désactivant le monitoring.

En cas d'incertitude : **mitiger → isoler → rapporter**, pas corriger à l'aveugle.

Un correctif qui touche la RLS, l'auth ou une validation passe par `passio-security-guard` et une revue, jamais en direct.
