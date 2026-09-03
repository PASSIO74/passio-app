# 12 PROFIL VISITE OPTIONS

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **PROFIL VISITÉ — PARTAGER / SIGNALER / BLOQUER PASSENT DANS LE ⋯ (2026-09-02),
  ACTIF, SANS DRAPEAU.** Demande de Benjamin : « quand j'arrive sur le profil de
  quelqu'un, déplace les 3 onglets partager / signaler / bloquer, ils sont trop
  visibles et prennent trop de place ; mets plutôt trois petits points discrets en
  haut à droite du profil et tu les mets dedans. » La rangée de trois boutons
  posée sous la carte d'identité est RETIRÉE ; `openVisitedProfileMenu(ev, id,
  nom)` (app-04) ouvre le même menu que mon profil. Verrou :
  `tests/e2e/profil-visite-options.spec.js` (4).
  ⚠️ **Aucun moteur n'est dupliqué** : le popover est `_profileDotsOpen` (app-06),
  celui des ⋯ de mon profil et des cartes passion, et les trois entrées appellent
  toujours `shareUserProfile` / `reportUser` / `blockUser` — donc aucune règle de
  modération n'est redéfinie, seule la surface change. L'état bloqué garde sa
  bascule « Débloquer ».
  ⚠️ **`.profile-dots-menu` A DÛ PASSER DE 1200 À 10002.** C'est la première fois
  que ce composant sert depuis une MODALE, et `.modal-backdrop` est à 10001 : à
  1200 le menu était bien dans le DOM et INVISIBLE, derrière la fenêtre. Un test
  d'existence serait resté vert dessus — le cas ③ mesure donc le point CENTRAL du
  menu avec `elementFromPoint`, et rougit quand on remet 1200.
  ⚠️ **LE ⋯ EST À `right: 56px`, PAS DANS LE COIN** : dans une modale, le × occupe
  déjà le haut droite (top/right 12 px, 34 px de côté). Il est `position:
  absolute` et son ancêtre positionné est `.modal` (`position: relative`), PAS la
  carte — inutile donc de positionner celle-ci, qui est en `overflow: hidden` et
  clipperait un menu qu'on y placerait.
  ⚠️ **IL Y A DEUX × dans cette modale** : `openModal` en injecte un, et le
  balisage porte déjà le sien. Le test de non-recouvrement les mesure TOUS — viser
  le premier venu laisserait passer un chevauchement avec l'autre.
  ⚠️ **`reportUser` ENVOIE puis FERME** (`supaReport` + `closeModal` + toast) : ce
  n'est pas un formulaire, et `closeModal` masque la fenêtre sans retirer le nœud —
  un test doit mesurer la VISIBILITÉ, pas la présence dans le DOM.

