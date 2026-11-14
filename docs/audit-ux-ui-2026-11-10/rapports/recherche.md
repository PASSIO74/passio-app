# Recherche et découverte — rapport du domaine

Clé `recherche` · surfaces `REC-001…REC-036` · constats `REC-C01…REC-C19` · données : `donnees/domaines/recherche.json`
(construit par `outils/sondes/recherche-construire-json.js`).

## 1. Périmètre et méthode

- **Lu** : `index.html` l.965-1016 ; `js/app-06-reels-partage.js` (`renderExplorer` 5574-5797) ;
  `js/app-07-ia-explore-irl.js` (IA 1-134, recherche 136-321, fiche 323-571) ; `supaSearchUsers`
  (`js/app-08-ui-modals-tour.js:6472`) ; `passionById` (`app-02:2432`) ; `toggleFollowUser` (`app-04:4992`) ;
  `js/passion-selector.js`, `js/passions-flat-ui.js`, `js/ui-v3-passerelle.js` ; fiche lots-ui 20.
- **Ouvert par le banc uniquement** : modes `compte` (faux serveur ; jeu `outils/jeu/recherche.js` : référentiel
  serveur semé, Tom bloqué, activité « Musique » à venir, option passion inconnue) et `visiteur`.
- **Sondes** : `outils/sondes/recherche-01…09` (écran, tuile inconnue, saisie, fiche, défilement et portes,
  visiteur, hors ligne, suivi périmé, défilement de fiche).
- **Gabarits** : m390 partout ; m360, t768, d1440 pour l'écran principal ; m360 pour la saisie, la fiche et le
  hors-ligne. Émulations Chromium, aucun appareil réel.
- **Limites** : le repli serveur flou `rechercher_passions` n'existe pas sur le faux serveur ; le chargement du
  référentiel (568 Ko) n'a pas pu être ralenti (`page.route` ne voit pas cette requête, fiche lots-ui 20).

## 2. Cartographie

| Surface | Porte d'entrée | Fichier |
|---|---|---|
| Écran « Rechercher » (`#screen-explore`) | loupe de la barre du haut (aria « Explorer ») | index.html, app-06 `renderExplorer` |
| Panneau de résultats (passions ≤ 6, personnes ≤ 8) | frappe (anti-rebond 160 ms), « OK », Entrée | app-07 `filterExplore`, `_exSearchLancer` |
| Fiche d'une passion (modale) | tuile tendance, tuile de grille, résultat, « Passions proches », feuille « Trouver une expérience » → « Voir la page de la passion » | app-07 `openPassionExplorer` |
| Créateurs à suivre | bas de l'écran | app-06 `ligneCreateur` |
| Sélecteur partagé `PassionSearchSelector` | Mes passions, Studio, filtre Rencontrer, onboarding — PAS l'écran Rechercher | passions-flat-ui.js |
| Assistant IA, Recherches récentes, tuile « Créer une passion », « ← Retour au profil » | aucune (code mort ou réserve) | app-06/07/08 |

Ce qui est cherchable, établi par le code et l'essai : **passions** (référentiel complet, accents/casse/pluriel
repliés ; passions perso de l'utilisateur) et **personnes** (pseudo OU bio, sous-chaîne, 30 lignes lues, 8 montrées)
plus les **personnages d'exemple** (nom, bio, libellé de passion). Ni publications, ni activités, ni lieux.

Trois surfaces portent `data-follow-uid` (profil visité, Créateurs à suivre, fiche) : `toggleFollowUser` les
repeint toutes au geste (vérifié, REC-028). Elles ne sont en revanche **pas** repeintes quand l'état de suivi
arrive après le rendu (REC-C01).

## 3. Parcours et états exercés

| État | Résultat observé |
|---|---|
| « gui », puis « guitare » enchaînés | « Recherche… » puis résultats de la dernière frappe seulement |
| « theatre », « guitares », « ÉCHECS » | trouvés (REC-011) |
| « escalde » (faute) | aucun résultat ; flou serveur non exerçable (REC-010) |
| phrase de 90 caractères | aucun résultat, sans conseil (REC-009) |
| « tom » | Tom (bloqué) proposé ; Victor Aubry via « automobile » (REC-007) |
| Échap / toucher à côté / aller-retour | le panneau reste ouvert (REC-012) |
| Résultat personne → profil → retour | champ « malik » gardé, panneau fermé |
| Écran ouvert au démarrage | « Suivre » sur des suivis ; l'appui désabonne (REC-027/028) |
| « Suivre » un exemple | « Tu suis Karim Belkacem ! », ligne follows vers `u_karim` (REC-018) |
| Fiche « Musique » | « 42 posts » contre « 4 posts » sur la tuile ; aucune activité (REC-013) |
| Fiche défilée puis autre fiche par la recherche | s'ouvre à scrollTop 1 085–1 226 (REC-015) |
| « + Créer profil » | passion ajoutée, bascule vers Profil, toast (REC-016) |
| Fiche « Céramique » vide | deux états vides sans geste (REC-017) |
| Publication sur identifiant inconnu | tuile et fiche « ✨ Passion » (REC-019/020) |
| Visiteur | tendances alphabétiques ; « Suivre » → demande de compte (REC-021/022) |
| Hors ligne avant 1re ouverture | socle de 19, compteur muet ; recherche « n'a pas abouti. Réessaie. » (REC-023/024) ; après reconnexion, grille non repeinte jusqu'à la réouverture |

**Tuile « Passion ✨ 1 post » de SOC-003** : expliquée. La capture a été prise avec la première version de
`outils/jeu/base.js`, qui donnait à Inès et à sa publication la passion `photographie` — identifiant absent du
socle (`photo`) comme du référentiel. `passionById` rend alors son générique « ✨ Passion ». Le jeu de données a
été corrigé depuis (`photo`) ; le mécanisme reste réel pour toute passion inconnue (REC-C15, REC-019).

## 4. Ce qui fonctionne et doit être conservé

Recherche tolérante (accents, casse, pluriel) ; anti-rebond et jeton d'annulation ; compteur tiré du référentiel
et muet quand il ne sait pas ; repli hors ligne sur le socle ; champ en 16 px sans débordement à 320 px ;
« Signaler cette passion » discret en bas ; demande de compte claire pour un visiteur ; moteur unique de suivi et
d'ajout de passion ; feuille « Trouver une expérience » (déjà jugée FIL-064, IRL-061).

## 5. Constats

**P1**
- **REC-C01** (sensible) — Écran ouvert tôt : les boutons disent « Suivre » sur des abonnements existants, et
  l'appui désabonne (ligne follows 1 → 0, toast « Tu ne suis plus Léa Fontaine »). REC-027, REC-028.
- **REC-C02** (sensible) — Personnages d'exemple proposés sans marque dans Créateurs à suivre, résultats et fiche ;
  « Suivre » écrit un vrai suivi vers `u_karim`. Même famille que MSG-C03. REC-003, REC-006, REC-013, REC-018.
- **REC-C03** (sensible) — Un compte bloqué revient dans la recherche et dans Créateurs à suivre (aucun filtre
  `isBlocked`). REC-007, REC-003.
- **REC-C04** — La fiche d'une passion ne mène pas à Rencontrer : proposition d'un bouton corail réutilisant
  `voirActivites`. REC-013, REC-026.

**P2** — REC-C05 Créateurs à suivre sans pertinence ; REC-C06 personnes sous le pli, « Utilisateurs » ;
REC-C07 panneau qui ne se ferme pas ; REC-C08 « Aucun résultat » cul-de-sac ; REC-C09 42 contre 4 posts, 6 montrés ;
REC-C10 « + Créer profil » (sensible : règle métier ADR-011, garde-fous conservés) ; REC-C11 fiche ouverte au
milieu ; REC-C12 hors ligne mal nommé.

**P3** — REC-C13 champ (OK 28 px, sans étiquette ni croix, invite tronquée) ; REC-C14 « Hot » alphabétique ;
REC-C15 passion inconnue ; REC-C16 bio en sous-chaîne ; REC-C17 fiche vide sans geste ; REC-C18 cibles 29 px ;
REC-C19 IA et Recherches récentes en code mort.

### Sensible
Deux constats touchent aux relations entre comptes : le blocage n'est pas respecté par les listes de découverte
(REC-C03 ; aucune donnée privée n'est exposée, seulement pseudo/bio publics), et un bouton périmé provoque un
désabonnement ou l'annulation d'une demande vers un compte privé (REC-C01). Le suivi d'un identifiant d'exemple
écrit une ligne en base (REC-C02 ; écriture en production supposée d'après le schéma, non vérifiée).

## 6. Cohérence avec le reste de l'application

- Un même écran, trois noms : loupe « Explorer » (aria), titre « Explorer par passion », mission « Rechercher » ;
  l'onglet « Découvrir » désigne le Fil.
- « Utilisateurs » (résultats) / « Créateurs » (fiche, section) / « personnes » / « membres » (cf. MSG-C27).
- « posts » sur la fiche et les tuiles, « publications » ailleurs.
- « + Créer profil » contre « Ajouter une passion » de « Mes passions ».
- Deux recherches de passions : l'écran Rechercher (6 résultats, invite « Enduro, guitare électrique, un pseudo… »)
  et le sélecteur partagé (20 résultats, invite « Recherche : enduro, guitare électrique, cuisine coréenne… »).
- Carte du fil « Trouver une activité » / feuille « Trouver une expérience » (IRL-C13).
- Les publications d'exemple sont marquées « Exemple PASSIO », les personnes d'exemple jamais.

## 7. Non vérifié, et comment le vérifier

- Repli serveur flou (`rechercher_passions`) sur « escalde » : en production, compte de test.
- Écriture effective d'un suivi vers `u_karim` en production (schéma : text sans clé étrangère listée) : lecture
  de la table `follows` (lecture seule) à la recherche d'identifiants `u_%`.
- Durée réelle de la fenêtre REC-C01 sur réseau mobile : télémétrie `screen_view explore` au démarrage.
- Cause exacte du défilement hérité REC-C11.
- Temps de chargement du référentiel (568 Ko) et état d'attente : la requête échappe à `page.route`.

## 8. Compteurs

36 surfaces inventoriées : 24 observées, 6 simulées, 6 code seul, 0 inaccessible ; 13 avec avant-après ;
8 à conserver, 6 à vérifier, 22 à améliorer. Constats : P0 0 · P1 4 · P2 8 · P3 7 (19).
