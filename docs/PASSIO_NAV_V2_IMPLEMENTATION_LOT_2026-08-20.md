# PASSIO — Lot d’implémentation Navigation V2

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **But** : préparer un lot de modification court, testable et réversible pour Claude Code.

## 1. Navigation actuelle vérifiée

La bottom-nav de `index.html` expose aujourd’hui :

1. Fil
2. Bobines
3. Créer
4. IRL
5. CDV

La topbar contient en plus :

- Explorer ;
- Messages ;
- Notifications.

Le configurateur (`app-05-config-profil.js`) utilise actuellement un ordre configurable :

`feed, bobines, explore, studio, messages, irl, cdv`.

Il existe donc aujourd’hui **plus de destinations conceptuelles que la bottom-nav affichée**, ce qui rend la hiérarchie produit difficile à comprendre et ouvre un risque de divergence entre configuration, topbar et navigation réelle.

## 2. Cible V2 verrouillée

### Bottom-nav

Cible :

**Fil · IRL · Créer · Messages · Profil**

`Créer` reste au centre visuel comme action primaire.

### Explorer

Explorer devient un accès secondaire depuis le Fil/recherche tant que son rôle ne se distingue pas clairement de la découverte déjà contenue dans le Feed.

### Bobines

Bobines devient **un format de contenu** et non une destination produit de niveau 1. Les vidéos courtes peuvent apparaître dans le Feed ou dans un filtre/format dédié accessible depuis le contenu, mais ne doivent plus consommer un emplacement primaire face à Messages ou Profil.

### CDV

CDV sort du cœur et rejoint Passio : Voyage. Aucun emplacement primaire.

### Profil

Le profil doit être accessible en un tap depuis la bottom-nav. Le multi-profil reste une capacité essentielle : l’entrée Profil ouvre l’identité active et donne accès au switch de profils passionnels.

## 3. Pourquoi cet ordre

La navigation doit représenter le produit, pas le catalogue de fonctionnalités :

- **Fil** = découvrir une passion, un contenu, une personne ;
- **IRL** = transformer la passion en activité réelle ;
- **Créer** = contribuer à la boucle ;
- **Messages** = construire la relation ;
- **Profil** = identité et multi-profils.

Cette structure rend visible la boucle :

`Feed → personne → message → IRL → contenu`.

## 4. Premier lot technique recommandé

Nom : **`simplify/core-navigation-v2`**

### Fichiers probables

Claude Code doit confirmer localement, mais le lot devrait toucher au minimum :

- `index.html` ;
- `js/app-02-state-utils.js` ou module contenant `goTo()` si routage à adapter ;
- `js/app-05-config-profil.js` pour `DEFAULT_NAV_ORDER` / `NAV_LABELS` / configurateur ;
- `js/app-08-ui-modals-tour.js` pour le tour ;
- `styles.css` uniquement si classes dédiées ;
- tests navigation/contextual-nav.

### Changement minimal

1. Remplacer destination Bobines par Messages dans bottom-nav.
2. Remplacer destination CDV par Profil dans bottom-nav.
3. Conserver Créer au centre.
4. Réordonner en `feed, irl, studio, messages, profiles` ou l’ordre DOM équivalent avec Créer centré visuellement.
5. Adapter le mécanisme d’état actif.
6. Mettre à jour les libellés/config de navigation et nettoyer les anciennes options de configurateur qui ne sont plus autorisées comme destinations cœur.
7. Maintenir les routes `bobines`, `explore`, `cdv` en compatibilité temporaire si des deep links ou appels internes existent, mais ne plus les exposer comme navigation primaire.
8. Mettre à jour le tour pour qu’il ne traverse plus Wallet/CDV et que Bobines ne soit pas présentée comme pilier distinct.

## 5. Compatibilité à ne pas casser

### Bobines

`goTo('bobines')` peut continuer à fonctionner comme route secondaire pendant la transition. On retire seulement son statut de destination primaire.

### Explorer

`goTo('explore')` reste possible depuis recherche/topbar tant que la fonction existe. Ne pas supprimer l’écran dans ce lot.

### CDV

`goTo('cdv')` peut rester fonctionnel pendant l’extraction, mais aucun bouton cœur ne doit y pointer après le lot.

### Messages

La topbar contient déjà un raccourci Messages. Après ajout à la bottom-nav :

- soit conserver temporairement l’icône pour unread/accès rapide ;
- soit la retirer dans un lot ultérieur si elle devient redondante.

Décision de ce lot : **ne pas multiplier les changements**. On ajoute Messages à la bottom-nav sans supprimer immédiatement l’icône topbar, puis on mesure la redondance.

### Profil

Le bouton Profil doit aller vers l’écran actuellement utilisé pour le profil principal / multi-profil. Claude Code doit vérifier le nom de route réel (`profiles` vs autre) avant modification.

## 6. Configurateur : nouvelle règle

Le configurateur ne doit plus permettre à l’utilisateur de remettre Wallet/CDV/Bobines comme destination cœur simplement parce qu’une ancienne configuration persiste.

Cible :

- ordre configurable uniquement parmi les destinations cœur autorisées si cette personnalisation est conservée ;
- sinon, désactiver provisoirement le réordonnancement des destinations pendant la simplification ;
- ancien `passio_config.navOrder` contenant `cdv`, `bobines`, `explore` doit être normalisé sans exception.

Normalisation recommandée :

- filtrer les ids non autorisés ;
- ajouter les ids cœur manquants ;
- garantir `studio` en position centrale si la bottom-nav l’exige ;
- ne pas effacer les autres réglages du configurateur.

## 7. Tour de démonstration V2

Le tour cœur ne doit plus vendre huit mini-produits. Cible maximale :

1. **Tes passions, plusieurs facettes de toi** — multi-profil ;
2. **Découvre ce qui te passionne** — Feed ;
3. **Rencontre les personnes derrière les contenus** — profils/interactions/messages ;
4. **Retrouvez-vous en vrai** — IRL ;
5. **Partage à ton tour** — création.

Le tour doit finir sur Feed ou IRL, jamais Wallet/CDV.

## 8. Tests du lot

Minimum :

- `navigation.spec.js` ;
- `contextual-nav.spec.js` ;
- `smoke.spec.js` ;
- `profils-types.spec.js` ;
- `interactions.spec.js` si le profil/message est touché ;
- `audit:handlers` ;
- `audit:globals`.

Nouveaux tests à ajouter :

- bottom-nav contient exactement les cinq destinations cœur attendues ;
- aucun `data-screen="cdv"` dans la bottom-nav ;
- aucun `data-screen="bobines"` dans la bottom-nav ;
- Messages est accessible depuis bottom-nav ;
- Profil est accessible depuis bottom-nav ;
- ancienne config navOrder avec `cdv/bobines/explore` est normalisée ;
- ancienne route CDV/Bobines ne fait pas planter l’app ;
- bouton retour téléphone reste cohérent.

## 9. Critères d’acceptation produit

Le lot est validé si un nouveau testeur peut identifier en moins de quelques secondes les cinq fonctions essentielles :

**voir · rencontrer · créer · discuter · être soi**.

Il ne doit plus interpréter PASSIO comme une juxtaposition de Feed, Reels, Carnets, Wallet, Explorer, etc.

## 10. Répartition IA

- **ChatGPT** : valide la hiérarchie produit et le résultat UX.
- **Claude Code** : inspecte les routes réelles, implémente le changement multi-fichiers, exécute les tests.
- **Codex** : vérifie le diff sur navigation/history/config legacy et cherche les handlers/routes orphelins.
