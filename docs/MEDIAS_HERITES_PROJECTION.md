# Lecture protégée des photos héritées

Ce lot préserve les publications et leur audience lors du futur retrait de deux anciennes photos publiques. Il ajoute une association serveur et la projection de lecture ; il ne copie, n'associe et ne supprime aucun média existant à distance.

Risque critique. Implémentation ciblée Codex ; revue Root et contre-revue du code produit requises. La branche est volontairement empilée sur le client privé de la PR969, commit6e4c4e1. Aucun validateur, trigger, rôle d'authentification ou règle d'audience existant n'est modifié.

## Autorité et points d'entrée

`media_assets.heritage_ref_sha256`, modifiable seulement par l'autorité serveur déjà propriétaire du registre, lie l'asset à la valeur exacte de l'ancienne `posts.media_url`. Aucun marqueur utilisateur dans `shared_data` ne fait autorité.

Le RPC `media_projeter_heritage` est invoker, borné à100parents, et compare parent/auteur/empreinte/objet enregistré. Il appelle le résolveur canonique `media_resoudre` sous le rôle normal ; session, blocage, visibilité du parent et coupure des médias continuent donc de s'appliquer. Seul un locator privé est retourné, sans URL Storage ni clé privilégiée.

Les points de lecture intégrés sont `supaLoadPosts`, `supaLoadEventPosts` et `openPost`. La fiche projette toutes les copies via `allPostCopies`, puis relit avec `findPostAnywhere`. Une fermeture ou une ouverture plus récente invalide la réponse tardive. Les listes sans candidat n'ajoutent aucun RPC. Les ambiguïtés de chemin/autorité restent fermées avant l'exemption des cinq préfixes publics intentionnels.

Un candidat est effacé avant le premier await. Refus, association absente, erreur, réponse incohérente ou changement de session ne restaurent jamais son URL publique. Les copies effacées sont réhydratées par une prochaine lecture du serveur ; le helper ne conserve pas un fallback caché. La présentation photo ajoutée en mémoire n'écrit pas `shared_data` en base.

## Sauvegarde, export et reprise

Les projections déjà installées d'export (`select m.*`), de sauvegarde (`select=*`), de schéma et de restauration transmettent la colonne sans whitelist nouvelle. Le verdict compare toujours sa valeur et celle de l'ancienne référence ; seul `media_objects.storage_object_id` peut être remappé après preuve physique. Les tests couvrent conservation, altération et absence du SHA ainsi que l'archive historique sans ce champ. La suppression canonique de ligne/profil et les FKcascade emportent l'association.

La migration historique `migration_export_medias_proteges_go_2026-11-16.sql` garde volontairement son contrat à cinq colonnes et ne doit pas être réécrite. Elle s'applique avant celle-ci ; son export installé reste compatible. Son rejeu manuel après ajout de la sixième colonne refuse. La barrière/journal des migrations doit préserver cet ordre et ne pas rejouer un SQL historique attesté sur un schéma ultérieur. La nouvelle migration est elle-même à usage unique et refuse un homonyme au lieu de l'adopter.

## Livraison et récupération

1. Livrer et attester la migration de lecture sur les cibles autorisées. Elle ne crée aucune association ni activation.
2. Préparer séparément les deux copies canoniques `content-protected`, conserver tous les originaux, vérifier UUID réels, owner/owner_id, MIME, versions et deux flux frais SHA256/MD5/tailles ; vérifier les parents directs/non-vlog encore concordants et l'absence de suppression de compte.
3. Faire relire puis autoriser l'opération serveur qui crée les trois lignes canoniques cohérentes et le SHA exact de l'ancienne référence. Ce seed ne passe pas par la création utilisateur `media_lier_source` et doit en reproduire explicitement les validations ; aucun contournement d'identité ou désactivation de trigger n'est autorisé.
4. Avant le déploiement de ce client, établir les associations, le backend privé prêt et l'activation autorisée. Sans eux, le client ferme les images plutôt que de repasser public. Vérifier ensuite affichage propriétaire/destinataire et fiche directe hébergés, puis une sauvegarde complète avec ces associations.
5. Le retrait public des quatorze origines est un autre lot, après ces preuves et son accord spécifique. La présente PR ne l'exécute pas et ne donne aucun GO commercial.

Conserver les nouvelles associations et copies en cas de rollback. La coupure existante `medias_proteges` ferme les lectures ; aucun rollback ne republie automatiquement un original. Les anciennes copies déjà téléchargées et les caches navigateur ne sont pas révoqués par ce changement.

## Vérifications et pilotage

Les tests navigateur utilisent les vraies fonctions de lecture, fiche, namespace, relais et broker sur loopback ; SDK/RLS/projection/Storage y sont explicitement synthétiques. Le banc PostgreSQL exerce les vrais rôles/RLS et le nouveau RPC sur un catalogue de fixture. L'export/reprise garde ses vrais comparateurs et son remappage physique. Ces preuves locales ne remplacent pas une recette hébergée.

Pilotage/Sentinelle : diagnostics de catégorie fixe `heritage_projection_refusee`, compteurs numériques par `passioMediaProteges.etatHeritage()`, aucune URL/identité/erreur brute. Aucune correction ou relance destructive automatique. Le drapeau privé existant reste le kill-switch ; les refus répétés appellent un diagnostic, pas un fallback public.
