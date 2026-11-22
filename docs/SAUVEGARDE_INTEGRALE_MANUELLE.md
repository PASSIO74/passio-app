# Demander une sauvegarde avec fichiers sans attendre dimanche

Le workflow **Sauvegarde production** propose l'option manuelle booléenne
`avec_medias`. Cocher cette option sur `main` ajoute les fichiers Storage à
l'export habituel des données et des comptes. La sauvegarde reste chiffrée et
déposée dans les artefacts du run. Une exécution sur une autre branche est refusée.

Sans option, les passages manuels et planifiés gardent leur rythme actuel :
données et comptes chaque jour, fichiers Storage le dimanche. Une demande
manuelle ne modifie pas la planification. Un déclenchement planifié GitHub
n'est pas une garantie d'exécution ; vérifier les runs et leurs résultats.

Cette possibilité sert à préparer une vérification complète de récupération.
Un run vert atteste les contrôles de sauvegarde ; il ne prouve pas à lui seul
une restauration ni un GO commercial. Le contrôle hors CI doit déchiffrer
l'archive avec la clé conservée par le propriétaire, vérifier son inventaire
et qualifier la restauration sur une cible isolée adaptée. Aucune clé privée
ne doit être copiée dans GitHub ou envoyée dans un chat.

Une sauvegarde avec fichiers lit le Storage et consomme du temps et du trafic.
Vérifier le volume et les quotas restants avant de la lancer. L'ajout de cette
option ne lance aucune sauvegarde, n'autorise aucune nouvelle dépense et ne
crée aucune ressource cloud. Les accords de tests précédents restent limités
à leur périmètre ; ils ne valent pas autorisation de nouvelle campagne.

## Cadre de livraison

- Résultat : pouvoir produire une archive avec fichiers à la demande.
- Acceptation : option typée, false par défaut ; choix effectif des arguments
  testé pour planification et demande manuelle ; protection main et chaîne de
  chiffrement conservées.
- Portée : workflow de sauvegarde et tests de sélection. Aucun changement des
  exporteurs, de l'Auth/RLS, des schémas ou du cycle de suppression des médias.
- Risque : critical, workflow ayant accès aux secrets de sauvegarde.
- Implémentation : Codex, correctif ciblé depuis main09554beb.
- Revue : Codex Root et contre-revue technique distincte avant fusion ;
  autorisation explicite du propriétaire et CI verte restent nécessaires.
- Pilotage/Sentinelle : résultats et échecs visibles par le workflow et sa
  surveillance existante ; aucun nouveau geste de remédiation automatique.
- Retour arrière : décocher l'option revient au périmètre habituel ; un retour
  du code passe par une PR. Aucun geste de restauration ne découle de ce lot.
