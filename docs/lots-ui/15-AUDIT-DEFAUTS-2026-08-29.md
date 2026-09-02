# 15 AUDIT DEFAUTS 2026 08 29

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **⚠️ Cinq défauts trouvés par audit adversarial après les treize lots du 2026-08-29.**
  Tous étaient EN PRODUCTION, tous ont été mesurés avant correction et éprouvés par
  mutation. Ils partagent une famille : **une règle ou un test qui survit à la
  disparition de sa cible**.

  ① **`HTMLElement.click()` sur un input remonte jusqu'à son conteneur.** La pastille
  📷 d'une carte de passion faisait `event.stopPropagation()` puis `input.click()` —
  mais ce `stopPropagation` ne concerne que le clic SUR LA PASTILLE : `.click()`
  dispatche un NOUVEL événement, qui part de l'input (descendant de la carte) et
  remonte à son `onclick`. Une seule tape ouvrait donc le sélecteur de fichier ET la
  modale d'édition. Le garde est posé sur l'**input** (`onclick="event.stopPropagation()"`),
  jamais sur la pastille : le menu « Options » déclenche le même `input.click()`.
  ⚠️ `#mainProfileAvatar` porte le motif identique et n'a PAS ce défaut — son `onclick`
  rappelle `input.click()`, et le *click in progress flag* de la spécification HTML
  arrête la récursion. Ne pas le « corriger ». Verrou : `carte-passion-photo.spec.js`.

  ② **`v()` du formulaire d'activité ÉCHAPPE DÉJÀ — ne jamais le ré-envelopper.**
  Dix de ses onze appels faisaient `escapeHtml(v("champ"))`. Mesuré : « Café d'Or »
  s'affichait « Café d&#39;Or ». Et ce n'était pas qu'un défaut d'affichage — ces
  valeurs sont celles que « Enregistrer » PERSISTE, donc la corruption s'aggravait à
  chaque édition (`&#39;` puis `&amp;#39;`). Le textarea `evDesc` était le seul appel
  correct. ⚠️ Retirer un `escapeHtml` demande de prouver qu'on n'ouvre pas une sortie
  d'attribut : `escapeHtml` échappe `& < > " '`, donc un seul passage suffit pour un
  `value="…"`. Le test le vérifie sur une charge réelle, pas par raisonnement.
  Verrou : `edition-activite-echappement.spec.js`.

  ③ **« Mes passions » doit dire la même chose partout.** `_irlMyPassions()` (app-07)
  mappait `state.user.profiles` en entier, archivées comprises, alors que le Fil rend
  `passionsVivantes()`. Après un archivage : Fil `["musique"]`, Rencontrer
  `["musique","cuisine"]`. Verrou : `irl-passion-archivee.spec.js`.

  ④ **La passion ACTIVE ne doit jamais être archivée — et le nettoyage appartient aux
  points d'ÉCRITURE.** `currentProfile()` rend `null` pour une passion archivée et son
  commentaire dit pourquoi il ne réécrit rien. `archiverPassion` et `deleteProfile`
  nettoient déjà ; `supaLoadUserState` restaurait `currentProfileId` sur le seul test
  « toujours dans la liste fusionnée » — or une passion archivée sur un AUTRE appareil
  y reste, avec `archived:true`. Extrait en fonction nommée
  `restaurerPassionActiveApresFusion` pour qu'un test exerce le code RÉEL : la première
  version du test recopiait la logique, et serait restée verte si la production avait
  changé. Verrou : `sync-passion-active.spec.js`.

  ⑤ **Une règle CSS survit à la disparition de sa cible.** UI-6 §11 masquait
  `.profile-chips-row` pour cacher les pastilles de score, rang et solde. ADR-009 a
  retiré ce moteur en entier, mais la règle est restée — et la rangée ne portait plus
  que la pastille de BADGES d'assiduité, que l'ADR garde expressément. Mesuré avec un
  badge gagné : pastille à `inline-flex`, rangée à `none`, hauteur visible 0, et
  `openBadgesSheet()` sans aucun autre appelant. Fonctionnalité calculée à chaque
  rendu, morte à l'écran. ⚠️ `myEngagementStats` compte par `organizerId`/`authorId`,
  jamais par `ownerId` — une sonde écrite avec `ownerId` rend 0 badge et fait conclure
  à tort que le défaut n'existe pas. Verrou : `profil-badges-visibles.spec.js`.

  **⚠️ Second lot de la même nuit — sept défauts de plus, même méthode.**
  Trois d'entre eux sont des failles d'échappement, quatre des chemins morts.

  ⑥ **XSS stockée dans les notifications.** `renderNotifs` (app-08) écrivait
  `${n.text}` BRUT parce que les notifications de démonstration portent des `<b>`
  voulus. Or `pushNotification` recopie du texte d'autrui (mentions, extraits de
  commentaires) et `supaLoadNotifs` remonte des lignes écrites par n'importe quel
  compte. Le rendu est désormais **sûr par défaut** : `_notifTexteHtml(n)` échappe,
  sauf discriminant explicite de confiance (`n.html === true` ou `kind === "local"`),
  que seules la graine et `pushNotification` posent. ⚠️ Le motif est général : dès
  qu'un champ mélange du balisage MAISON et du texte d'autrui, c'est un
  **discriminant de confiance** qu'il faut, jamais un échappement conditionnel au cas
  par cas. Verrou : `notifications-echappement.spec.js`.

  ⑦ **La même donnée échappée à un endroit et pas à l'autre.** `ev.eventType` était
  échappé sur la carte de la liste (app-07 ~2432) et BRUT dans la fiche (~3310) :
  mesuré, `<img src=x onerror=…>` s'exécutait à l'ouverture de la fiche. Idem pour
  `duration` d'un carnet en direct, brut dans le carrousel du Fil (app-02) et dans la
  fiche (app-03). ⚠️ « Le `<select>` de création ne propose que des valeurs fixes »
  n'est PAS une garantie : toute session authentifiée écrit ces colonnes par REST.
  Verrou : `echappement-type-et-duree.spec.js`.

  ⑧ **Un champ manquant qui fait échouer une publication EN SILENCE.**
  `shareReelInFeed` (app-05) fabriquait son post sans `createdAt`. Or
  `supaPublishPostWithRetry` fait `new Date(post.createdAt).toISOString()` : sur
  `undefined` cela lève un RangeError, avalé par le `catch` de la boucle de réessai
  qui renvoie `false`. Le partage n'atteignait donc JAMAIS Supabase — et le même champ
  date la carte (`fmtTime(undefined)` → "") et la classe dans le fil (tri sur
  `createdAt || 0` → tout en bas). Sa jumelle `sharePostInFeed` (app-03) le portait
  déjà : **deux fonctions presque identiques avaient divergé sur ce seul point**.
  Second défaut dans les DEUX : le texte était échappé à la SOURCE alors qu'il l'est
  déjà à l'affichage (`escapeHtml(displayText)`), donc doublement — et la valeur
  corrompue partait dans `posts.content`. Verrou : `partage-bobine.spec.js`.

  ⑨ **Le lecteur de bobines n'envoyait aucun commentaire.** `submitReelComment`
  (app-05) écrivait dans l'état local puis `saveState()`, et rien d'autre : ni
  `post_comments`, ni `comment_interactions`. L'auteur de la bobine ne voyait jamais
  le commentaire, et son auteur le perdait au premier rechargement. Le MÊME texte
  posté depuis la discussion du Fil partait, lui — d'où un défaut invisible à qui
  teste par le Fil. Corrigé **sans dupliquer de moteur** : passage par la file
  d'attente commune `_enqueueCommentSync` (app-04), qui gère le réessai hors-ligne.
  Dans la foulée : `loadReelComments` datait par `c.timestamp`, un champ qu'AUCUN
  chemin de création ne pose (tous écrivent `createdAt`) — le repli « Maintenant »
  était donc universel. Verrou : `commentaires-bobine.spec.js`.

  ⑩ **Le contenu de démonstration est COPIÉ dans l'état, puis persisté à vie.**
  `loadState` fait `parsed.notifications = def.seed.notifications.map(…)` à la
  première ouverture. ADR-009 a réécrit la graine — mais un compte ouvert AVANT le
  retrait garde sa copie : « Nouvelle quête du jour 🎨 **+15 pts** » et « Tu as gagné
  **10 💎 Passia** ». `stripLegacyEconomy` filtre désormais aussi `notifications`, aux
  TROIS frontières (`_leanState` recopie `notifications` dans le blob `user_state`,
  donc un vieil appareil les repousserait). ⚠️ Le filtrage par TEXTE est borné aux
  notifications écrites PAR L'APP (`fromId` absent ou `"me"`) : une notification qui
  rapporte le contenu d'autrui le CITE — la publication d'actualité de la graine
  contient « +4 pts ». Verrou : `notifications-economie-retiree.spec.js`.

  ⑪ **« Ma ville » posait son prédicat une fois, et ne le reprenait jamais.**
  `ui-v4a1-intentions.js` appelait `poserPredicatVille(nomVille())` au clic sur la
  chip. Changer de ville ensuite (`selectIrlCity` → `renderIRL`) laissait le filtre
  sur l'ANCIENNE : le titre annonçait Paris, la liste montrait Lyon. La
  resynchronisation post-rendu ré-aligne désormais le prédicat. ⚠️ Le prédicat est
  stocké NORMALISÉ (`_normIrlCityName`) et la ville garde son libellé d'affichage :
  comparer les deux valeurs brutes ferait croire à une divergence à chaque rendu et
  provoquerait une réécriture sans fin. Verrou : `irl-changement-ville.spec.js`.

  ⑫ **Ouvrir l'éditeur de carnet amputait le Studio, définitivement.**
  `activateStudioVlog` masque le texte libre, la passion et le mood — le carnet ne
  les utilise pas. Rien ne les rendait : `closeCarnetEditor` remettait `studioType` à
  `"text"` et s'arrêtait là, et le SEUL chemin de restauration était le clic sur un
  onglet de format… que le lot UI-6 a retiré de l'écran. Un composeur muet, sans
  erreur ni message, jusqu'au rechargement. Deux sorties tenues désormais : la porte
  (`closeCarnetEditor`) et un filet dans `renderStudio` pour qui quitte l'écran CDV
  par la navigation. ⚠️ Famille générale : **retirer un chemin d'accès (ici les
  onglets) peut supprimer le seul chemin de RETOUR d'un état transitoire.**
  Verrou : `studio-apres-carnet.spec.js`.

  ⑬ **Deux sessions ont corrigé le MÊME défaut à deux endroits — et le cumul a
  cassé l'affichage.** La XSS des notifications a été fermée deux fois le même
  soir : #202 neutralise les chevrons au **point d'entrée** (`mergeSupaNotifs`,
  par où passent la lecture REST et le temps réel), #200 échappait au **rendu**
  (`_notifTexteHtml`). Chacun était correct seul. Fusionnés, un texte distant
  passait deux fois — mesuré : « Ben&#39;j a aimé ton post &lt;img … &gt; »,
  entités visibles à l'écran. Le repli par défaut de `supaInsertNotif` étant
  `escapeHtml("Quelqu'un")`, **tout le monde** voyait « Quelqu&#39;un ».
  Réconcilié par #209 : le modèle de confiance du rendu est conservé (le défaut
  reste le REFUS) mais son désinfectant devient la même neutralisation de
  chevrons qu'à l'entrée — **idempotente** (`&lt;` ne contient plus de `<`) et
  suffisante dans un contenu d'élément. ⚠️ Deux leçons : un désinfectant appliqué
  à deux étages doit être idempotent, sinon il ne faut en garder qu'un ; et c'est
  exactement le risque que vise « une branche sensible = un seul écrivain » — ici
  les deux branches ne se touchaient même pas, ce sont les CORRECTIFS qui se sont
  recouverts. Verrou ajouté APRÈS coup, #209 n'en portait aucun : le test
  « passée par mergeSupaNotifs, elle n'est pas désinfectée deux fois » rougit
  seul quand on remet `escapeHtml` — les quatre tests de sécurité, eux, restent
  verts, ce qui montre qu'il s'agit d'un défaut d'affichage et non d'une faille.

