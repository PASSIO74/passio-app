# Fil et profils : limiter les lectures sans perdre la suite

Lot du 20 septembre 2026, développé depuis `605b6e2`. Aucun changement SQL,
RLS, abonnement ou donnée de production. Risque normal ; implémentation Codex,
contre-revue indépendante requise avant intégration.

## Résultat attendu

- Le fil demande 20 lignes réseau au premier lot au lieu de 60. Le chargement
  d'un profil visité conserve ses 60 lignes. Ce gain porte sur la requête de
  publications ; il ne signifie pas trois fois moins de trafic total.
- La suite utilise un ordre stable `created_at, id` et la dernière ligne brute
  comme curseur. Les filtres privés et les suppressions locales ne changent
  pas le curseur. Un double clic ne déclenche pas deux pages.
- Les publications déjà lues restent accessibles lorsque de nouvelles lignes
  les font sortir de la tête. Une tête modifiée rétablit son propre curseur
  pour combler les éventuels intervalles ; une tête inchangée conserve la fin
  de liste connue. Au plus trois pages sans nouvel élément sont traversées
  par clic, puis le bouton permet de continuer. Les lignes de la tranche
  effectivement relue ne sont pas réinjectées depuis les anciennes pages.
  Une ancienne page encore en vol ne déplace pas le curseur installé par une
  actualisation plus récente. La publication du curseur attend l'hydratation.
- Le filet périodique ne lit plus le fil quand Messages, Profil ou un autre
  écran est affiché. Revenir au fil programme un rattrapage immédiat. Les
  requêtes restent suspendues sous onglet masqué et pendant un rechargement.
- Le résolveur de profils réutilise le cache de messagerie existant pendant
  deux minutes. Seuls les identifiants absents ou périmés repartent au réseau.
  Le propriétaire du cache et une génération de purge empêchent une réponse
  ancienne de remplir le cache après déconnexion. Une mise à jour de profil
  reçue rafraîchit ce même cache. Un embed partiel n'efface plus bio/passions
  et ne rajeunit pas les champs qu'il n'a pas relus.
  Les gardes sont revérifiées après les lectures de likes et de profils ; la
  passion d'une publication ne remplace jamais celle de son auteur en cache.

## Vérification

`tests/e2e/capacite-fil-cache.spec.js` exerce les fonctions du produit dans un
navigateur isolé, avec des réponses réseau contrôlées :

- première page de 20, profil de 60, filtres privés et pages entièrement masquées ;
- insertions concurrentes, double clic, rafale de 35 nouveaux posts entre deux
  pages, conservation des 85 publications visibles et absence de doublons ;
- deuxième résolution identique sans requête, expiration, changement reçu,
  refus serveur, changement de compte et purge pendant une réponse différée ;
- absence de polling hors écran, retour immédiat, masquage, rechargement et
  arrêt/redémarrage du filet pendant une ancienne lecture lente.

La campagne locale initiale incluant dix cas et les régressions filtres,
fenêtrage, identité de profil et blocage termine avec **73 tests réussis**
(Chromium, deux workers, code de sortie 0). Une première campagne capacité,
course temps réel et lien d'activité a également affiché ses 39 cas réussis,
mais son arrêt du serveur local Windows est resté en attente.
La revue a ensuite ajouté cinq cas ciblés : page ancienne après changement de
tête, changement de compte, purge et redémarrage pendant l'hydratation, puis
passion de profil distincte de celle du post. Les quatre courses ont échoué
avant correction ; la suite finale termine avec **15 tests réussis**, code de
sortie 0. La contre-revue indépendante confirme les gardes et la frontière.
Les résultats ne constituent pas un test de charge Supabase : les quotas et
la capacité simultanée doivent être mesurés séparément.

Le pilotage continue à recevoir la télémétrie API existante : comparer les
requêtes et octets par session, puis les latences. Aucun nouveau champ ni
échantillonnage n'est ajouté. Retour arrière : revert du lot client.

## Ce qui demande un autre contrat

Les likes individuels, les commentaires et les réactions restent chargés
selon leurs règles existantes. Réduire simplement les commentaires de 200 à
2 rendrait les compteurs faux : `post.comments` porte aujourd'hui à la fois
le détail et son nombre. Une réponse agrégée demanderait un RPC
`SECURITY INVOKER`, une limite de 20 identifiants, les comptes exacts visibles
au lecteur, l'état de son like, deux aperçus et un chargement séparé du détail.
Ce changement doit être testé sous RLS avec blocages et comptes distincts.

Les deltas ne sont pas simulés avec le seul `created_at` : ils manqueraient
les modifications et suppressions. La relecture bornée de la tête reste le
rattrapage explicite des événements temps réel manqués.
