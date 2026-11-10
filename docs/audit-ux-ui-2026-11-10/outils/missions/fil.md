# Mission — FIL ET INTERACTIONS

- Clé de domaine : `fil` · Groupe : `Fil et interactions`
- Identifiants : surfaces `FIL-001…` ; constats `FIL-C01…`
- Hors périmètre (traités par d'autres) : le lecteur de bobines et les stories en plein écran
  (`bobines`), le Studio (`creation`), la feuille de partage (`partage`), le profil visité
  (`profils`). Tu traites leurs PORTES D'ENTRÉE depuis le fil (rangée de stories, rail « Bobines à
  découvrir », bouton de partage, appui sur l'auteur) mais pas l'intérieur.

## Périmètre

- En-tête du fil : rail des passions (`#profileStrip`, bulle « Suivis », passions cochées), envies
  (`#feedIntentSelector` : Explorer · Apprendre · Idées · Rencontrer), ce que chaque sélection change,
  état « rien de sélectionné », « envie à vide », sélecteur de passions (`js/passion-selector.js`),
  rangée de stories, carte « Exemples PASSIO », carte de bienvenue, récap de la semaine
  (`js/recap-semaine.js`), séparateurs « panne » vs « vide », nouveaux contenus, tirer pour rafraîchir,
  pagination / bas de fil.
- Carte de publication, tous les types : texte court, texte long (« Lire la suite »), photo
  (paysage, portrait, panorama, très haute), vidéo, bobine, audio, repartage, publication reliée à
  une activité (« Voir l'activité », « Trouver une activité »), pastille d'envie, mention de passion,
  nom d'auteur très long, exemple (« Exemple PASSIO »), publication d'un compte privé suivi.
- Détail d'une publication (`openPost` app-02:10508, `openFeedPost` app-02:8250), média en plein
  écran (`openFullImg`), média absent / lent / en échec.
- Réactions (j'aime, réaction emoji `showEmojiPickerForPost`), liste des réactions
  (`openPostReactors` app-04:1288), commentaires (`openComments` app-04:1298, `openCommentSheet`
  app-04:2989), réponses, GIF (`showGifPickerForComment`, `showGifPickerForPost`), emoji, options
  d'un commentaire (`openCommentOptions` app-04:2381), réactions à un commentaire
  (`openCommentReactors`), commentaire en cours / en échec / hors ligne, double appui, texte long,
  clavier ouvert (simulé).
- Menus contextuels : options de MA publication (`openPostOptions` app-04:9) et de celle d'AUTRUI
  (`openPostOptionsAutrui` app-04:31) — modifier, supprimer (confirmation, annulation), signaler,
  masquer, ne plus suivre… ; cohérence des « … ».
- Visiteur vs connecté : ce qu'un visiteur peut faire, ce qui demande un compte, comment c'est dit.
- Passage vers l'IRL depuis le fil (pont `passio_feed_irl_bridge_v1`, bouton « Trouver une
  activité ») : est-il compréhensible, mène-t-il au bon endroit ?

## Points d'entrée dans le code

`js/app-02-state-utils.js` (rendu du fil : `renderFeed`, `renderPostHTML`, `setFeedPassions`,
envies), `js/app-03-posts-vlogs.js` (j'aime, partage), `js/app-04-comments-shop.js` (commentaires,
options), `js/emoji-misc.js`, `js/recap-semaine.js`, `js/ui-v3-passerelle.js`,
`js/passions-flat-ui.js`, `styles.css`. Fiches : `docs/journal/passions-fil.md`,
`docs/journal/social-messagerie.md` (publications, commentaires), `docs/lots-ui/` 08, 11, 14, 17,
23, 25, `docs/PIEGES_CONNUS.md` (fil, commentaires/réactions). Données fictives dans
`outils/jeu/fil.js` : publications de tous types avec commentaires (`post_comments`), j'aime
(`post_likes`), réactions (`comment_interactions`), fil vide, fil volumineux (60+).
