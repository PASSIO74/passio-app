# Nettoyage des médias : rapport uniquement

Le CLI `medias:orphelins -- --appliquer` refuse désormais avec `GC_SNAPSHOT_REQUIRED` et le code2, avant toute lecture du credential ou requête HTTP. Le rapport sans cette option reste disponible ; ses candidats ne constituent pas une preuve d'absence de référence.

Une référence encore vivante peut manquer à une lecture paginée pourtant entièrement réussie : sur1001lignes, retirer une ligne de la première page déplace la dernière à la position999 avant la lecture offset1000. L'ancien outil pouvait alors supprimer le média lié. La régression reproduit ce cas sur des réponses synthétiques, sans aucune opération réelle.

Cette fermeture préventive conserve les fichiers. Elle ne fournit pas un nouveau protocole de collecte et ne qualifie ni les médias protégés, ni la purge de compte. Réactivation uniquement après une preuve temporelle et un protocole de revalidation contre-relus ; ne pas retirer le refus pour faire passer un nettoyage ou une CI.

Implémentation ciblée Codex, risque critique (suppression). Pilotage/Sentinelle : catégorie fixe et code d'échec explicite, aucune remédiation ou suppression automatique. Aucun réglage de production, secret ou nouveau coût. Les contrôles CI requis et la revue indépendante restent obligatoires avant fusion.
