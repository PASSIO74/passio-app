# Story et bobine, suite : plusieurs prises, brouillons, « Suivre » — 2026-11-27

Suite de la fiche 33, le même jour. Après la mise en ligne du nouvel écran de capture,
Benjamin : « c'est quoi la suite ? » puis « Ok fait tout ». Ce lot livre ce que la fiche 33
avait laissé de côté, plus un défaut de navigation mesuré en route.

## Ce qui change

### Bobine en plusieurs prises (`meCap.prises`, outil « Plusieurs prises » de la colonne)

Comme Instagram : on filme, on s'arrête, on reprend ailleurs, puis « Terminer ».

- Toucher = filmer ; toucher = **pause** (on reste en capture) ; toucher = reprendre.
  Maintenir filme aussi, et relâcher met en pause. « Terminer » mène à l'aperçu.
- **Un seul `MediaRecorder`, mis en `pause()` entre deux prises** (`_meMettreEnPause`,
  `_meReprendrePrise`) : le fichier ne contient que ce qui a été filmé, sans assemblage
  après coup. Mesuré : deux prises séparées par 1,5 s de pause → une vidéo de 2,3 s.
- Le temps est le temps RÉELLEMENT filmé (`_meTempsFilme` : cumul + prise en cours) : le
  badge, l'anneau, la durée maximale (15 / 30 / 60 s, sur le CUMUL) et la durée gardée
  pour ✂️ (`meState.source.duree`) le lisent tous.
- En pause : « Refaire » (à gauche) et « Terminer » (à droite) prennent la place de la
  galerie et du changement de caméra ; le déclencheur reste centré.
- « Refaire », ✕ et le geste retour ne jettent rien d'un toucher : les deux premiers
  DEMANDENT, le troisième mène à l'aperçu de ce qui est filmé (et, question à l'écran,
  il ne ferme QUE la question). Page masquée : pause.
- Une pause est BORNÉE (`ME_PAUSE_MAX_MS`, 3 min) : passé ce délai, les prises vont à leur
  aperçu. Mise en pause à moins de 0,4 s de la durée choisie : l'aperçu directement.
- Minuteur armé : chaque reprise part après son décompte, la consigne le dit, et
  « Terminer » / « Refaire » annulent un décompte en cours.
- L'enregistreur qui s'arrête TOUT SEUL (piste coupée par le système pendant une pause) :
  `_meOnRecordingStop` range l'état lui-même et le filmé part à l'aperçu, avec sa durée
  filmée (pas l'horloge).
- Une prise qui FINIT n'est pas écrasée par la suivante : entre `stop()` et la fin réelle
  de l'enregistreur, un second toucher (double toucher pour arrêter) ne relance rien
  (`_mePriseEnFin`, attente bornée à 5 s).
- Sans l'outil, la bobine garde son geste de la fiche 33 (toucher = filmer, toucher = aperçu).

### Brouillons (story et bobine)

- « **Enregistrer le brouillon** » dans la feuille « Abandonner ? » ; le bouton
  « Brouillons » de la colonne de capture (avec leur nombre) n'apparaît que s'il y en a.
  Reprendre restitue le média, les textes, stickers, dessin, filtre, fond et le MODE.
- Stockage : IndexedDB (`idb-store.js`, magasin `kv`), **une clé par brouillon**
  (`brouillon_media_v1:<id>`, l'enregistrement complet) **+ un index de fiches légères**
  (`brouillons_media_index_v1` : id, compte, mode, type, vignette, date). Compter et lister
  ne lisent que l'index ; un média n'est remonté qu'à la reprise de SON brouillon. Le
  média est un **Blob** — jamais du base64, jamais `localStorage` (une vidéo de bobine
  pèse jusqu'à ~27 Mo). Six brouillons au plus PAR COMPTE, quatorze jours ; le septième
  pousse le plus ancien dehors, et le toast le dit.
- L'écran est TENU pendant l'écriture et pendant la reprise (voile, un seul enregistrement
  à la fois, geste retour inerte). Supprimer depuis la liste DEMANDE.
- Un brouillon périmé n'est plus montré ET quitte l'appareil dès la lecture suivante de
  la liste (`_mePurgerBrouillonsPerimes`), fiche et média.
- ⚠️ « Quatorze jours » est NOTRE borne. Hors application installée, WebKit vide le
  stockage d'un site après sept jours sans visite : sur iPhone, dans Safari, un brouillon
  peut partir plus tôt.
- Un brouillon repris reste enregistré tant qu'il n'est ni publié ni supprimé : il n'est
  effacé qu'une fois la publication ARRIVÉE AU SERVEUR. Story : au verdict de
  `_publierStoryAvecVerdict` — et pas pour une story « enregistrée sur cet appareil »,
  qui ne survit pas au rechargement. Bobine : l'identifiant voyage sur la publication
  (`post._brouillonId`) et `_verdictPublication` le retire au succès — celui du premier
  essai comme celui d'un renvoi (45 s plus tard, ou au lancement suivant).

### « Suivre » sur une bobine

- Sixième surface de l'état de suivi (`boutonSuivreBobineHTML`, app-05). Elle n'a aucun
  moteur à elle : `data-follow-uid` la fait trouver par `_boutonsSuivi` /
  `_peindreBoutonsSuivi` (app-04), le libellé et les attributs viennent de
  `libelleBoutonSuivi` / `attrsBoutonSuivi` (app-02), le geste appelle `toggleFollowUser`.
- Pas de bouton sur MA bobine, sur un personnage d'exemple, ni sur un compte déjà suivi.
- Sur une bobine, « ✓ Suivi » est un ACCUSÉ, pas un bouton : un second toucher (le reste
  d'un double toucher) ne désabonne pas, et l'accusé s'efface une fois le verdict du
  serveur tombé. On se désabonne depuis le profil. « Demande envoyée » (compte privé)
  garde son geste commun : un toucher annule la demande.
- Une demande acceptée (`mergeSupaNotifs`) repeint désormais les boutons à l'écran.

### Retour après « Créer → Publication » (défaut antérieur, `js/ui-v2-shell.js`)

La feuille « Créer » rendait son entrée d'historique par un retour différé, puis naviguait
aussitôt : l'entrée restait orpheline sous le Studio. Mesuré : le premier geste retour
affichait le Fil, quel que soit l'écran d'origine. Un choix qui NAVIGUE vers un écran
(`ecran: true`) part désormais 80 ms après la fermeture.

## Invariants

- **Brouillons = données d'un compte (AUTH-06).** Chaque enregistrement porte
  `compte: _fileProprietaire()`, la lecture écarte tout autre compte, et
  `purgeAccountScopedData` ET `doDeleteAccount` (app-02) appellent `idbBrouillonsClear`
  (qui efface par PLAGE de clés, pas d'après l'index). Un nouveau magasin durable s'ajoute
  à ces DEUX endroits : aucun banc ne le fait à ta place.
  **Pas de compte, pas de brouillon** : un propriétaire « visiteur » serait le même pour
  tous les visiteurs de l'appareil. Un compte qui change PENDANT l'écriture : le brouillon
  est retiré aussitôt écrit.
- **L'index se modifie dans UNE transaction** (`idbBrouillonsModifier(decider)` : lecture
  de l'index, décision, écritures) — jamais lire puis réécrire en deux temps. Elle rend
  `{ ok, rendu }` ou `{ ok: false, cause }` (`quota`, `delai`, `indisponible`, `erreur`) :
  un échec laisse une trace (`diagLog`) et ne s'affiche « plus de place » que pour un
  quota. Elle est BORNÉE (90 s) : WebKit peut ne jamais répondre, et l'appelant tient l'écran. On n'y
  retire que le périmé et, au-delà du plafond, MES plus anciens : jamais le brouillon
  d'un autre compte. `idbBrouillonsIndex` rend `undefined` quand la lecture est
  impossible : ce « rien » ne sert de base à aucune écriture. Toute écriture LIT son
  verdict, et un refus se dit.
- **Le lien « cette édition = ce brouillon » (`meState.brouillonId`) ne se pose que sur
  l'édition enregistrée** (`meOpen` en crée une autre) : posé sur une autre, sa
  publication supprimerait le mauvais brouillon.
- **Un enregistreur ne parle que pour lui** : ses morceaux, sa fin et son drapeau « jeté »
  (`rec._jete`, posé par un arrêt silencieux) sont liés à SON instance
  (`rec.onstop → _meOnRecordingStop(rec, morceaux)`). Un drapeau commun restait levé quand
  l'enregistreur était déjà inactif, et avalait la prise suivante sans rien dire.
- **Une pause est bornée, et c'est elle qui borne `meCam.recording`** — le drapeau que la
  mise à jour de l'application attend (`pwa-detect.js`). Tout nouvel état « en cours »
  sans fin certaine doit porter sa borne.
- **Le fond d'un brouillon « Créer » est un INDICE** de `STORY_BGS`, comme à la publication.
- **Plusieurs prises : `meCam.recording` reste VRAI en pause** (`meCam.enPause` distingue).
  Toutes les gardes « pas pendant une prise » (mode, caméra, galerie) tiennent donc aussi
  entre deux prises — l'enregistreur est lié au flux de la caméra.
- **Le bouton « Suivre » d'une bobine n'a pas d'`onclick`** : le nom et l'identifiant d'un
  autre compte ne passent pas par un gestionnaire inline (MSG-02). Le toucher est écouté
  sur `#reelsList` en phase de CAPTURE (il ne doit pas atteindre `.reel-author`, qui
  ouvrirait le profil).
- **Une lecture des suivis partie AVANT un geste ne le défait pas** : pour un compte dont
  l'écriture est en vol, ou s'est terminée APRÈS le départ de la lecture
  (`_ecritureSuiviFinA`, app-04), l'état local fait foi (`_suiviLocalFaitFoi`).
  `supaLoadFollowing` rend la liste BRUTE du serveur avec son heure de départ (`_luA`) ;
  c'est `_fusionnerSuivisServeur` qui juge « récent », au moment d'APPLIQUER — il y a une
  attente entre les deux, pendant laquelle un « Suivre » ou un « Ne plus suivre » peut
  aboutir. Les demandes en attente, elles, sont fusionnées dans `supaLoadFollowing`, sans
  attente entre la réponse et l'écriture.

Verrous : `tests/e2e/bobine-prises-brouillons.spec.js` (6, caméra simulée),
`tests/e2e/bobine-suivre-retour-creer.spec.js` (8). Deux relectures `audit-passio`. Réinjectés
à l'envers, et le test qui les garde rougit : le brouillon de bobine au renvoi, « récent »
jugé à la fusion, l'arrêt spontané de l'enregistreur. Les autres correctifs sont gardés par
une assertion directe, sans réinjection exécutée.

Non éprouvé : WebKit. Ces deux suites tournent sous Chromium (caméra simulée) et ne sont pas
dans `SUITES_WEBKIT` — une suite n'y entre qu'après un passage WebKit vert en CI. Le Blob en
IndexedDB, `delete(IDBKeyRange)` et `MediaRecorder.pause()` n'ont donc été essayés ni sous
WebKit ni sur un téléphone.

## Non fait dans ce lot

- **Sondage en bobine** : il demande une table de votes (migration, RLS). PR séparée,
  client sous drapeau éteint tant que la migration n'est pas appliquée.
- La politique de confidentialité n'a pas été modifiée : son §5 dit déjà qu'une partie des
  données reste sur l'appareil (localStorage, IndexedDB).
