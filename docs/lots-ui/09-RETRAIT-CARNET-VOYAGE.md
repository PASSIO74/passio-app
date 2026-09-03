# 09 RETRAIT CARNET VOYAGE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **RETRAIT DU CARNET DE VOYAGE (§6 de la refonte, ADR-011).** Écran, éditeur,
  viewer plein écran, CDV Lives et leurs étapes, commentaires et réactions
  d'étape, « Mes lieux », passeport, géocodage, liens profonds, 9 abonnements
  temps réel, 32 fonctions Supabase, contenu de démonstration, sous-filtre
  « Carnets » du profil, entrée de navigation, étape du tour, raccourci IA et pont
  IRL↔CDV : tout est retiré. `js/app-03-posts-vlogs.js` passe de 4 879 à ~400
  lignes ; 279 règles CSS partent. **`goTo("cdv")` est REDIRIGÉ vers le fil**,
  comme `goTo("wallet")` après ADR-009 — un ancien lien profond ne doit jamais
  laisser l'application sans écran actif.
  ⚠️ **AUCUNE DONNÉE N'EST DÉTRUITE** : `localStorage["passio_cdv_lives"]`, les
  publications de type `vlog` et les tables `cdv_*` restent intactes, et restent
  dans la publication realtime — on cesse seulement de les écouter.
  ⚠️ **`_kmBetween` RESTE dans app-03** : `app-07` s'en sert pour trier les
  activités par proximité. C'est de la géométrie, pas du voyage. La retirer aurait
  fait retomber toutes les distances à 0 — sans erreur, car l'appel est gardé par
  un `typeof`.
  ⚠️ **LE TYPAGE `vlog` EST CONSERVÉ À LA LECTURE** (`supaLoadPosts`), et c'est une
  garantie de CONFIDENTIALITÉ, pas une survivance : la visibilité d'un carnet
  (« public / abonnés / privé ») vivait dans un blob jsonb, hors de portée de la
  RLS. C'est ce type qui permet à `allFeedPosts` de les écarter TOUS. Le retirer
  ferait retomber un carnet « Privé » sur son type de média et l'afficherait, en
  clair, dans le fil de tout le monde.
  ⚠️ **`closeModal` levait à CHAQUE fermeture** si on oubliait son nettoyage CDV
  (`cdvLiveRefreshInterval`, `removeCdvLiveViewer`) — c'est-à-dire partout. Même
  famille que le `renderTopbar` d'ADR-009 : chercher tout accès à un nœud ou à une
  variable supprimés dans une fonction rappelée en permanence.
  ⚠️ Les badges « voyages / kilomètres / pays » valent désormais zéro. Ils ne sont
  PAS supprimés : ils restent visibles comme non acquis, plutôt que de disparaître
  d'un profil qui les affichait hier.
  Suites retirées : `cdv`, `cdv-deeplink`, `carnet-visibilite`,
  `commentaire-live-id`, `studio-apres-carnet`.

