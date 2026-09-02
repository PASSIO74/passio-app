
  **QUATRE RETOUCHES ESTHÉTIQUES (2026-09-02), ACTIVES, SANS DRAPEAU.** Demandes
  de Benjamin après essai réel. Aucune n'ajoute de moteur : elles retirent, elles
  renomment ou elles remettent en page.

  ① **UNE CARTE DU FIL NE NOMME PLUS LA PASSION QU'UNE FOIS.** « Tu écris deux
  fois la passion concernée, je veux qu'il n'y en ait qu'une, celle avec l'heure
  du post. » L'en-tête empilait `identitePassionsHTML(author)` (les passions du
  COMPTE) puis `.post-author-meta` (la passion DE LA PUBLICATION + l'heure) : sur
  un compte mono-passion, le même mot deux fois. La ligne d'identité est retirée
  de `renderPostHTML` ET d'`openPost`, qui portaient la même paire.
  ⚠️ **ADR-011 §3 n'est pas annulée** : l'identité centralisée reste sur les deux
  en-têtes de profil (cliquable) et sur les surfaces denses (commentaires,
  listes, recherche, inbox, notifications) — aucune de celles-là n'affiche de
  passion à côté, donc aucune n'y faisait doublon. Seule la CARTE la perd.
  ⚠️ Les commentaires prévisualisés EN BAS d'une carte la gardent : ils parlent
  de leur auteur, pas de l'auteur du post.
  Verrous : `profil-entete-passions.spec.js` (assertion RETOURNÉE : la carte
  n'a plus de `.ident-passions` et sa `.post-author-meta` nomme la passion) et
  `refonte-multi-passion.spec.js` ② (l'auteur reste le COMPTE, ce que la refonte
  garantissait vraiment ici).

  ② **« Découvrir des personnes » devient « Voir la page de la passion »**
  (feuille « Trouver une expérience », `js/ui-v3-passerelle.js`). « Rajoute un
  onglet : voir la page de la passion, ce qui permet aux utilisateurs qui
  scrollent d'aller voir rapidement les pages en question. »
  ⚠️ **C'EST UN RENOMMAGE, PAS UN AJOUT, ET C'EST DÉLIBÉRÉ** : cette entrée
  ouvrait DÉJÀ `openPassionExplorer` — la page de la Passio, créateurs puis
  publications — mais son libellé le taisait, donc la porte existait sans être
  lisible. En ajouter une quatrième aurait donné deux portes pour une même
  destination, le doublon exact que ce lot passe son temps à éviter.
  ⚠️ **LA CLÉ RESTE `people`** : c'est la valeur `choice` de la télémétrie
  (comparabilité de l'historique) et le nom du moteur exporté (`discoverPeople`),
  que le lot UI-5 appelle depuis les bobines. Seuls le libellé et l'icône
  changent (l'icône « deux personnes » cède à deux étincelles, le signe de la
  Passio dans le reste de l'application).

  ③ **LA LIGNE DE TITRES DE PASSION QUITTE LES DEUX EN-TÊTES DE PROFIL — ET LES
  BULLES DU RAIL, ELLES, NE BOUGENT PAS.** C'est le point qui a demandé deux
  tours, et la leçon vaut plus que le résultat.
  Demande du matin : « enlève les onglets ronds violets sous le pseudo des
  passions, c'est trop gros trop visible ; tu mets juste les passions en
  question, fin élégant. » Lue comme une consigne sur les BULLES du rail
  (`#v9ProfilePassions`), elle a produit une rangée de pastilles de texte
  (`passionChipHTML`) — et un profil qui nommait ses passions DEUX fois, à 5 px
  d'écart : le doublon du fil, transposé au profil. Arbitrage du soir, en deux
  messages : « supprime les titres de passion dans le profil sous le pseudo et
  garde seulement les bulles dessous », puis « sur le profil remets les bulles
  rondes comme avant, pas de rangée de passions ovale ».
  ⚠️ **CE QUI VAUT, ET QU'IL NE FAUT PLUS RELIRE DE TRAVERS** : « les onglets
  ronds violets sous le pseudo » désignait la LIGNE DE TITRES posée par le lot
  du 2026-09-01, pas le rail. Elle est retirée de `renderMainProfile` (app-06,
  qui créait `#mainProfileIdent`) et de l'en-tête du profil visité (app-04). Le
  rail rend les BULLES `passionTileHTML`, exactement comme avant — même
  composant que le Fil, exigence de la refonte multi-passion (§1 et §7).
  `passionChipHTML` et ses règles `.v9-passion-chip` n'auront vécu que quelques
  heures : elles sont parties avec leur seul appelant.
  ⚠️ **CELA DÉFAIT LE LOT DU 2026-09-01** (« les passions cliquables renvoient
  vers la page de cette passion »), qui n'aura vécu qu'un jour : la page d'une
  passion ne s'ouvre plus depuis un profil. Elle reste atteignable depuis le Fil
  (« Voir la page de la passion », retouche ② ci-dessus, bien plus visible),
  depuis Explorer, les tuiles de tendance et l'IA. Sur un profil, le tap sur une
  passion FILTRE ce qu'on est en train de regarder — et une bulle ne peut pas
  avoir deux destinations.
  ⚠️ **CODE MORT RETIRÉ AVEC** : `identitePassionsChipsHTML`,
  `identitePassionsLiensHTML`, `_identPassionOnclick`, `IDENT_PASSIONS_MAX_PROFIL`
  (app-02) et leurs règles CSS (`.ident-passions-links`, `.ident-passion-lien`
  et son `::before`, `-nom`, `-emoji`, `-plus`, `.main-profile-body
  .ident-passions`, la déclinaison 359 px). ⚠️ **`identitePassionsHTML` /
  `identitePassionsTexte` RESTENT** : elles rendent la ligne de TEXTE INERTE des
  surfaces denses (commentaires, listes de personnes, recherche, inbox,
  notifications), qui n'affichent aucune passion à côté — ADR-011 §3 tient.
  ⚠️ **UN SEUL CHEMIN EST GARDÉ SANS APPELANT, ET C'EST DÉLIBÉRÉ** : le second
  argument d'`openPassionExplorer(pid, retourUserId)` et son lien « ← Retour au
  profil ». `openModal` n'empile pas — le jour où une porte vers une page de
  passion réapparaît dans une modale, l'oublier ferait perdre la personne par
  qui on l'a découverte. Le test ③ septies l'appelle DIRECTEMENT, puisqu'aucune
  surface ne le passe plus ; il ne peut rien peindre tant que c'est le cas.
  ⚠️ **VERROU CONTRE UN TROISIÈME TOUR** : le test ③ de
  `profil-entete-passions.spec.js` exige la présence de `.profile-tile-avatar`
  dans le rail, sur mon profil comme sur un profil visité. Une rangée « ovale »
  le fait rougir.

  ④ **LA FEUILLE « CRÉER » EST UNE GRILLE DE DEUX COLONNES.** « Je trouve que les
  onglets sont trop grands, mets-les plus petits et bien ordonnés pour que tout
  tienne sur un écran sans descendre. » Six lignes pleine largeur de 52 px, plus
  le titre et la poignée, dépassaient les 78vh de la feuille sur un écran court :
  les deux dernières entrées — dont « Audio / podcast » — n'existaient qu'après
  un défilement que rien n'annonçait. Mesuré après : feuille de 345 px en
  390 × 844, aucun défilement, cases de 76 px (89 px pour la rangée qui porte le
  sous-titre « Photo / vidéo »).
  ⚠️ **CES RÈGLES SONT BORNÉES À `#v2CreateSheet`**, alors que la PEAU (lavis
  violet, écriture violet foncé, pastille blanche) reste PARTAGÉE avec
  `#v3PassioSheet` comme demandé le 2026-09-01. « Trouver une expérience » n'a
  que trois entrées : une grille les étalerait en 2 + 1 avec une case vide à
  droite — le décalage exact qu'ADR-011 a dû corriger sur les onglets du profil.
  La grille répond au NOMBRE d'entrées, pas au style.
