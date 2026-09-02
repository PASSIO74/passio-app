# 11 RETOUCHES ESTHETIQUES 2026 09 02

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

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

  ③ **LE RAIL DE PASSIONS DU PROFIL PASSE DES BULLES AUX PASTILLES DE TEXTE.**
  « Enlève les onglets ronds violets sous le pseudo des passions, c'est trop gros
  trop visible ; tu mets juste les passions en question, fin élégant. »
  `passionChipHTML` (app-02) rend emoji + libellé + décompte ; le rail perd la
  classe `.profile-strip` (défilement horizontal, colonnes égales, désaturation)
  et vit sous `.v9-profile-strip`. Appliqué aux DEUX profils — le mien
  (`#v9ProfilePassions`, app-06) et celui d'un compte visité (`#visitedPassions`,
  app-04) : deux réponses visuelles à la même question selon le profil ouvert
  auraient été pires que l'ancienne.
  ⚠️ **LE FIL N'EST PAS TOUCHÉ.** « Remets les profils du fil comme avant, en
  bulle » (2026-08-29) tient toujours : cette demande-là ne portait pas sur cet
  écran. Les deux surfaces partagent désormais leur GESTE
  (`_passionTileOnclick`) et leur état, plus leur rendu — c'est le geste qui
  divergeait vraiment quand chacune avait sa copie.
  ⚠️ **CIBLE TACTILE 44 px, PASTILLE VISIBLE 30 px** — patron déjà établi
  (`.ident-passion-lien`, `.v3-tempt`, crayon d'UI-6B) : la boîte garde ses
  44 px, un `::before` en `inset: 7px 0` PEINT la pilule, les marges négatives
  rendent les 14 px au profil et le `row-gap` de 14 px empêche deux rangées de
  se chevaucher.
  ⚠️ **L'ÉTAT SE LIT AU REMPLISSAGE, JAMAIS À L'OPACITÉ.** La bulle distinguait
  coché de décoché par `opacity: 0.3` ; sur une pastille de texte cela ferait
  tomber le libellé sous le seuil AA — même piège que les cases du panneau
  Filtres, éclaircies le 2026-09-01. Corollaire : `_syncVisitedUI` (app-04)
  n'écrit plus AUCUN style inline, elle ne bascule que la classe et
  `aria-pressed`.
  ⚠️ **DEUX SÉLECTEURS QUI SURVIVAIENT À LEUR CIBLE ont été corrigés avec** :
  l'état vide du profil visité lisait le nom du filtre dans `.profile-tile-label`
  (il aurait affiché « aucune publication » au lieu de « rien en Moto »), et les
  deux règles `.psel-tile-plus` de `styles.css` n'avaient plus d'émetteur — la
  bulle « + » est devenue `.v9-chip-ajout`.
  ⚠️ **LE RAIL EST LA SEULE RANGÉE DE PASSIONS DU PROFIL — la ligne d'identité
  sous le pseudo a été RETIRÉE le même jour**, sur arbitrage de Benjamin : « on
  va supprimer les titres de passion dans le profil sous le pseudo et garder
  seulement les bulles dessous. » Les deux rangées nommaient les mêmes passions
  à 5 px d'écart : le doublon de la carte du fil (défaut ①), transposé au
  profil. Retrait appliqué aux DEUX en-têtes — le mien (`renderMainProfile`,
  app-06, qui créait `#mainProfileIdent`) et celui d'un compte visité (app-04).
  ⚠️ **CELA DÉFAIT LE LOT DU 2026-09-01** (« les passions cliquables renvoient
  vers la page de cette passion »), qui n'aura vécu qu'un jour : la page d'une
  passion ne s'ouvre plus depuis un profil. Elle reste atteignable depuis le Fil
  (« Voir la page de la passion », retouche ② ci-dessus, bien plus visible),
  depuis Explorer, les tuiles de tendance et l'IA. Sur un profil, le tap sur une
  passion FILTRE ce qu'on est en train de regarder — et une pastille ne peut pas
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

