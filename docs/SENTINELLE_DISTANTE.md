# Sentinelle distante PASSIO

La Sentinelle historique du Centre de pilotage reste locale : elle analyse les alertes, prépare un correctif dans un worktree isolé et ne pousse ni ne déploie. Elle dépend donc du poste qui exécute `dashboard/`.

Le workflow `.github/workflows/sentinelle-distante.yml` ajoute une couche distante, disponible ordinateur éteint et indépendante des crédits Claude.

## Contrôles horaires

- audits de globals, handlers, échappement et tests creux ;
- disponibilité de la page publique PASSIO ;
- canari Playwright d'autorisation critique ;
- ouverture ou mise à jour d'une issue GitHub en cas d'échec ;
- fermeture automatique de l'issue lorsque tous les contrôles redeviennent verts.

Les résultats sont visibles dans GitHub Actions et dans les issues, donc consultables sur mobile.

## Coupe-circuit mobile

Pour suspendre les contrôles sans modifier le code :

1. ouvrir une issue depuis le compte `PASSIO74` ;
2. mettre exactement `[SENTINELLE PAUSE]` dans son titre ;
3. laisser l'issue ouverte.

La Sentinelle distante sort alors proprement sans lancer les contrôles. Fermer l'issue réactive le prochain passage horaire.

Le workflow peut également être désactivé depuis l'onglet Actions de GitHub.

## Limites de sécurité

Cette couche distante détecte et alerte ; elle ne modifie aucun fichier, ne crée aucune branche de réparation et ne déploie rien. L'auto-réparation existante reste confinée au Centre de pilotage local avec ses garde-fous.

Le passage à une réparation distante nécessitera un agent distant disponible, une branche dédiée, des tests obligatoires et une revue avant toute fusion. L'absence de crédits Claude ne doit jamais être contournée par une clé API facturée.

## Retour arrière

La suppression ou le revert du fichier `.github/workflows/sentinelle-distante.yml` retire entièrement cette couche, sans impact sur l'application ni sur la Sentinelle locale.
