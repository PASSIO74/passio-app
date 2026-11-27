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
  DEMANDENT, le troisième mène à l'aperçu de ce qui est filmé. Page masquée : pause.
- Sans l'outil, la bobine garde son geste de la fiche 33 (toucher = filmer, toucher = aperçu).

### Brouillons (story et bobine)

- « **Enregistrer le brouillon** » dans la feuille « Abandonner ? » ; le bouton
  « Brouillons » de la colonne de capture (avec leur nombre) n'apparaît que s'il y en a.
  Reprendre restitue le média, les textes, stickers, dessin, filtre, fond et le MODE.
- Stockage : IndexedDB (`idb-store.js`, clé `brouillons_media_v1` du magasin `kv`), le
  média est un **Blob** — jamais du base64, jamais `localStorage` (une vidéo de bobine
  pèse jusqu'à ~27 Mo). Six brouillons au plus, quatorze jours.
- Un brouillon repris reste enregistré tant qu'il n'est ni publié ni supprimé : il n'est
  effacé qu'une fois la publication ARRIVÉE (`brouillonPublie` dans `mePublish`).

### « Suivre » sur une bobine

- Sixième surface de l'état de suivi (`boutonSuivreBobineHTML`, app-05). Elle n'a aucun
  moteur à elle : `data-follow-uid` la fait trouver par `_boutonsSuivi` /
  `_peindreBoutonsSuivi` (app-04), le libellé et les attributs viennent de
  `libelleBoutonSuivi` / `attrsBoutonSuivi` (app-02), le geste appelle `toggleFollowUser`.
- Pas de bouton sur MA bobine, sur un personnage d'exemple, ni sur un compte déjà suivi.
- Une demande acceptée (`mergeSupaNotifs`) repeint désormais les boutons à l'écran.

### Retour après « Créer → Publication » (défaut antérieur, `js/ui-v2-shell.js`)

La feuille « Créer » rendait son entrée d'historique par un retour différé, puis naviguait
aussitôt : l'entrée restait orpheline sous le Studio. Mesuré : le premier geste retour
affichait le Fil, quel que soit l'écran d'origine. Un choix qui NAVIGUE vers un écran
(`ecran: true`) part désormais 80 ms après la fermeture.

## Invariants

- **Brouillons = données d'un compte (AUTH-06).** Chaque enregistrement porte
  `compte: _fileProprietaire() || "visiteur"`, la lecture écarte tout autre compte, et
  `purgeAccountScopedData` ET `doDeleteAccount` (app-02) appellent `idbBrouillonsClear`.
  Un nouveau magasin durable s'ajoute à ces DEUX endroits : aucun banc ne le fait à ta place.
- **`idbBrouillonsLoad` : `[]` = rien, `undefined` = lecture impossible.** On ne réécrit
  JAMAIS la liste sur un `undefined` (cela effacerait les brouillons existants) ; toute
  écriture LIT son verdict (`idbPut` rend vrai / faux) et un refus se dit.
- **Le fond d'un brouillon « Créer » est un INDICE** de `STORY_BGS`, comme à la publication.
- **Plusieurs prises : `meCam.recording` reste VRAI en pause** (`meCam.enPause` distingue).
  Toutes les gardes « pas pendant une prise » (mode, caméra, galerie) tiennent donc aussi
  entre deux prises — l'enregistreur est lié au flux de la caméra.
- **Le bouton « Suivre » d'une bobine n'a pas d'`onclick`** : le nom et l'identifiant d'un
  autre compte ne passent pas par un gestionnaire inline (MSG-02). Le toucher est écouté
  sur `#reelsList` en phase de CAPTURE (il ne doit pas atteindre `.reel-author`, qui
  ouvrirait le profil).
- **`supaLoadFollowing` ne remplace plus aveuglément** : pour un compte dont l'écriture de
  suivi est en vol, ou s'est terminée APRÈS le départ de la lecture (`_ecritureSuiviFinA`,
  app-04), l'état local fait foi. Sans cela, « Suivre » touché pendant la lecture du
  démarrage voyait sa demande effacée par une réponse antérieure à l'écriture.

Verrous : `tests/e2e/bobine-prises-brouillons.spec.js` (4, caméra simulée),
`tests/e2e/bobine-suivre-retour-creer.spec.js` (7).

## Non fait dans ce lot

- **Sondage en bobine** : il demande une table de votes (migration, RLS). PR séparée,
  client sous drapeau éteint tant que la migration n'est pas appliquée.
- La politique de confidentialité n'a pas été modifiée : son §5 dit déjà qu'une partie des
  données reste sur l'appareil (localStorage, IndexedDB).
