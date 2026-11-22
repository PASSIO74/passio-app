# Mission — CRÉATION ET MÉDIAS

- Clé de domaine : `creation` · Groupe : `Création et médias`
- Identifiants : surfaces `CRE-001…` ; constats `CRE-C01…`
- Hors périmètre : la création d'une ACTIVITÉ (`irl-fiche`), la lecture des bobines et des stories
  (`bobines`) — tu traites leur CRÉATION (bobine, story).

## Périmètre

- Bouton « Créer » de la barre basse et feuille « Créer » (`#v2CreateSheet`, `js/ui-v2-shell.js`,
  grille 2 colonnes) : chaque entrée, où elle mène, fermeture.
- Studio (`#screen-studio`, composer UI-6 `js/ui-v6-composer.js`) : choix du type de contenu
  (texte, photo, vidéo, bobine, audio/podcast, story… — découvre la liste réelle ; `studioType`
  est la SEULE source de vérité de ce qui est publié), choix de la passion
  (`ouvrirRecherchePassionStudio` app-06:4502, sélecteur) et de l'envie / intention (moods :
  Idées · Apprendre · Rencontrer · Tous — fiche lots-ui 07), rédaction (titre ? texte, longueur,
  compteur, clavier ouvert simulé), lien avec une activité.
- Photo : sélection (le banc peut fournir un fichier : `page.setInputFiles` avec un média fictif
  de `outils/medias/`), recadrage, filtres / retouches, plusieurs photos ?, format refusé, fichier
  trop lourd, échec d'envoi.
- Vidéo et bobine : sélection d'un fichier (`boucle.webm`), enregistrement (caméra et micro :
  permission accordée avec faux flux impossible ici → teste la permission REFUSÉE et décris le
  reste d'après le code, « inaccessible »), éditeur (`#meOverlays`, texte superposé `meAddText` —
  dialogue natif `prompt()`), découpe, son, couverture, progression de l'envoi, annulation,
  échec et reprise.
- Story : compositeur (`openStoryComposer` app-08:717, `openStudioAsStory` app-08:803).
- Aperçu avant publication : comprend-on EXACTEMENT ce qui sera publié, dans quelle passion, avec
  quelle visibilité (compte privé) ? Bouton Publier (états désactivé / en cours / réussi / refusé),
  feedback, où l'on atterrit après publication, proposition de partage.
- Brouillon : conservation en quittant le Studio, en changeant d'onglet, en rechargeant la page,
  hors ligne ; brouillons listés (`state.user.drafts`) ; reprise ; abandon confirmé ?
- Modification d'une publication existante depuis son menu ; publication refusée par le serveur
  (passion inconnue `estPassionCanonique`, session expirée) ; double appui sur Publier.
- Visiteur sans compte qui touche « Créer ».

## Points d'entrée dans le code

`js/app-06-reels-partage.js` (Studio, publication), `js/app-05-config-profil.js` (éditeur, bobines),
`js/app-08-ui-modals-tour.js` (stories ~700–1900, éditeur média ~1400–1600, `supaPublishPostWithRetry`
~4400), `js/ui-v6-composer.js`, `js/ui-v2-shell.js`, `js/passions-flat-ui.js`, `index.html`
(`#screen-studio` l.869–964), `styles.css`. Fiches : `docs/lots-ui/` 04 (UI-6), 05, 07, 11,
`docs/RAPPORT_ARCHITECTURE_PUBLICATION.md`, `docs/PIEGES_CONNUS.md` (bobines / stories / éditeur
média), `tests/e2e/*studio*.spec.js`, `*publication*.spec.js`, `*composer*.spec.js` (mise en place).
