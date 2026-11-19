# Maintenance : copie privée conservant les originaux

Risque critique. Ce lot fournit une action JS serveur pour une copie seule et une qualification GitHub synthétique séparée. Aucun retrait d'original, seed de registre, changement client ou activation média n'est inclus. Les deux photos actives et le retrait relèvent d'opérations distinctes. Centre de pilotage/Sentinelle : catégories/comptes/IDs d'artefacts dans le run GitHub, annulation depuis GitHub ; aucun automatisme destructif.

## Qualification avant usage

Le workflow `qualification-copie-medias.yml` exécute le véritable entrypoint JS de l'action, sur PR du dépôt par PASSIO74 ou dispatch main. Il n'injecte ni plan privé, ni PAT Supabase, ni clé service. Seul un journal synthétique vide de données utilisateur est chiffré AGE et uploadé. Le résultat doit constater réellement nom/id/digest et zéro appel Supabase. Les tests doublés ne remplacent pas ce passage : les variables runtime Artifacts ne sont pas présumées disponibles dans une étape shell. Le token runtime reste dans l'action/enfant fermé, sans export GITHUB_ENV ni log.

L'action d'upload officielle est celle déjà épinglée par la sauvegarde : commit ea165f8d65b6e75b540449e92b4886f43607fa02, SDK2.3.2 intégré. Son bundle exécuté est comparé à l'objet Git de ce commit avant chaque spawn ; HEAD seul ne suffit pas. Les3outputs standards sont parsés strictement. Les logs du sous-processus sont capturés et supprimés, pas enregistrés ; son environnement ne contient aucun plan ou secret Supabase. Seul le ciphertext précis est envoyé.

## Production et plan à usage unique

Le workflow manuel n'accepte pas de données privées en inputs. Il exige le dépôt, actorPASSIO74, main, jobcopie_heritage et attempt1. Le groupe `maintenance-medias-production` (cancel=false) est partagé avec les opérations suivantes. L'environnement `maintenance-medias` doit être configuré réellement : branche personnalisée exactementmain, reviewerPASSIO74. Cette configuration externe ne découle pas d'une variable saisie.

Après dispatch, Root connaît run_id. Avant d'approuver le job en attente, Root pose le seul secret d'environnement `PASSIO_COPIE_PLAN_PRIVE`, JSON<=40KiB, lié à run/attempt/job/head/workflow et au manifeste du code contre-revu. GitHub lit les secrets d'environnement au démarrage du job ; une autre exécution ou retry est donc refusée avant lecture des clés Supabase. Consommation wx/fsync/close locale supplémentaire pour ce job. Pas de reprise automatique, même après crash ; retirer le secret après le lot est une mesure d'hygiène distincte.

Le plan contient seulement le contrat privé approuvé : cohorte exacte14empreintes et contexte/compte/source du constat ; références staging et production avant/après clôture ; instruction humaine et deux revues, réservation des écrivains connus, bornes temporelles et droit de compensation. Aucun credential dans ce JSON. Ces pièces ne sont PAS publiées dans Git ou les logs. Un hash ne prouve pas son auteur : Root doit contrôler la provenance des pièces et l'accord pour la version exacte.

Les clés existantes SUPABASE_ACCESS_TOKEN/SUPABASE_SERVICE_ROLE_KEY sont ensuite injectées normalement ; aucune collection/rotation ni nouveau bucket de journal. Le recipient AGE est la variable publique existante SAUVEGARDE_AGE_PUBLIC. Aucune clé privée AGE en CI, aucun repli symétrique.

## Prévol lié à la référence étendue

La référence avant clôture est vérifiée contre son empreinte étendue privée et la référence staging stricte. Le snapshot post31f doit être réel, récent<=5min au lancement et de sémantique identique (set3SELECT/ALL, rôles/owner/membership/RLS et3helpers documentaires). Les changements du catalogue brut dus à31f ne sont pas confondus avec une dérive des lectures. Le prévol live exige le hash EXACT du snapshot post31f et les10objets/9marques/modesO-A-A du fence canonique et son journal ; aucun hash neuf ne s'approuve seul. Snapshot live cohérent en une requête ; cela ne verrouille pas un DDL concurrent.

## Checkpoints et conservation

Avant toute mutation : intention locale complète wx/fsync/close, snapshot chiffré AGE, dépôt Artifacts immuable, ACKid/digest puis ACK local durable. Une autorisation correspond à une seule action et ses empreintes exactes ; aucune clé réautorisée. Sans ACK ou sur persistance/chiffrement/upload ambigu : journal empoisonné, zéro mutation suivante. Le digest ZIP distant et le SHA du ciphertext local sont des valeurs distinctes.

Quatre phases normales : création du bucket ; COPY14sansoverwrite ; checkpoint des14échos UUID/version avant les CAS d'owners ; vérifications finales puis FIN. Source/destination GETSHA256/MD5, métadonnées/versions, propriétaires Auth+profil et marqueurs de suppression contrôlés. Les sources restent intactes. Compensation facultative : uniquement nouvelles copies identifiées, checkpoint préalable, puis relecture APRÈS cet upload avant DELETE. Toute identité recréée refuse le lot ; aucun DELETE conditionnel/version atomique fournisseur n'est inventé. Une course résiduelle après dernière lecture exige la réservation des écrivains connus ; aucun verrou global sur les administrateurs n'est promis.

Budget :14COPY,28GET attendus,200requêtes Supabase/10min,40MiB de lecture/24MiB de copies ; réserve40requêtes/5min. Les transferts GitHub/AGE consomment du temps dans ces bornes. Maximum8checkpoints, fichierchiffré<=1MiB, rétentiondemandée7jours ; quota/rétention réels du dépôt peuvent imposer moins. ACK signifie dépôt accepté, pas conservation éternelle. Root doit garder le checkpoint chiffré final et rapprocher les intentions après perte du runner ; aucune adoption/reprise/suppression aveugle. Une copie privée incertaine n'autorise pas le retrait de sa source.

La preuve détaillée des14copies n'est jamais claire dans un artefact public. `extraire-preuve.mjs` est une fonction pure destinée à Root APRÈS déchiffrement et contrôle de provenance du dépôt : elle valide chaîne/nonce/run/code/FIN/cohorte et produit le format passio-preuve-copies-privees/1 attendu par l'opération suivante. Ses empreintes restent privées.

Sources primaires : [secrets GitHub,48KiB](https://docs.github.com/en/actions/reference/security/secrets), [upload-artifactv4.6.2, immutabilité et500artefacts](https://github.com/actions/upload-artifact/blob/v4.6.2/README.md), [README actuel duSDK mentionnant10](https://github.com/actions/toolkit/blob/main/packages/artifact/README.md). La borne conservatrice8 reste sous les deux limites documentées. Aucune qualification réelle GitHub/Supabase ni aucun GO ne peut être déduit des seuls tests locaux.
