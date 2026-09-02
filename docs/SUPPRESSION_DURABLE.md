# SUPPRESSION_DURABLE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

## 🪦 SUPPRIMER UNE PUBLICATION — pierres tombales et file de suppression (2026-09-01)

Défaut vécu, signalé après un essai réel depuis « ben sur portable test » :
**« j'ai publié mon contenu, et tout l'ancien contenu que j'avais supprimé est
ressorti dans le fil »**. Trois causes se cumulaient, aucune visible depuis
l'écran, et chacune suffisait à elle seule à faire revenir du contenu.

① **`deletePost` ne connaissait que DEUX des quatre tableaux.** Une publication
   vit simultanément dans `state.userPosts` (copie locale), `state.supabasePosts`
   (copie serveur revenue au chargement), `state.seed.posts` et
   `window._feedExtraPosts` (le tampon anti-écrasement du rafraîchissement).
   L'ancien code ne retirait que des deux premiers… en oubliant justement
   `supabasePosts`. Pire : `startFeedRefreshLoop` fait
   `state.supabasePosts = posts.concat(extra)` toutes les 60 s, où `extra` est
   ce que le serveur NE renvoie PLUS — une entrée supprimée y était donc
   **réinjectée indéfiniment**, y compris quand la suppression serveur avait
   parfaitement réussi. `purgerPostsSupprimes()` (app-02) est désormais le seul
   point qui les connaît tous les quatre : ne jamais refaire ce filtrage à la main.

② **La suppression serveur était un « fire and forget ».**
   `supa.from("posts").delete()…then(()=>{}).catch(()=>{})` : ni `{ error }` lu,
   ni lignes comptées, **ni garde `window._supaReal`**. Envoyée au stub noop
   (SDK encore en chargement paresseux, réseau coupé), elle rendait
   `{ data: [], error: null }` — un **faux succès** parfait. La ligne restait en
   base, personne ne réessayait, et elle revenait au premier rechargement.
   ⚠️ **« 0 ligne touchée » ne se tranche pas seul** : la ligne a pu être déjà
   supprimée (succès) ou refusée par la policy (échec). `_delObRun` (app-04) lève
   le doute par une **relecture ciblée** — la seule preuve qui vaille. Échec →
   file d'attente persistante (`passio_post_delete_outbox_v1`, patron `_cmtOb*`),
   rejouée à `online`, au démarrage et toutes les 15 s, bornée en âge et en taille.

③ **`publishPost` déversait la page serveur dans `state.seed.posts`.** C'est
   l'amplificateur, et l'explication du « au moment où je publie » : après une
   publication réussie, `const newPosts = await supaLoadPosts()` suivi de
   `state.seed.posts = newPosts` recopiait la page serveur ENTIÈRE dans le
   tableau du contenu de **démonstration** — celui-là même que `deletePost`
   venait de filtrer. Tout ce que la base avait gardé remontait d'un bloc, et le
   contenu de démonstration disparaissait jusqu'au rechargement suivant. Le
   tableau des posts réseau est `supabasePosts` : c'est la convention de tous les
   autres chemins (temps réel, pull-to-refresh, boucle de rafraîchissement), et
   le seul que `_feedExtraPosts` sait protéger.

**La parade structurelle : une pierre tombale.** `state.deletedPostIds` (bloc
« SUPPRESSIONS DURABLES », app-02) est posée AVANT tout le reste par
`marquerPostSupprime(id)`. Elle est persistée dans `localStorage` **et
synchronisée par le blob `user_state`** — donc valable sur tous les appareils du
compte. Quatre points de filtrage la consultent : `supaLoadPosts` (le point
d'étranglement de TOUTES les lectures serveur — fil, rafraîchissement 60 s,
pull-to-refresh, retour d'arrière-plan, profil, bobines), `feedAddRealtimePost`,
`allFeedPosts` (filet final) et `buildReels`.
⚠️ **Une suppression ne s'annule jamais : deux listes se fusionnent en UNION,
jamais par remplacement.** `_applyUserState` recopie les clés du blob telles
quelles — un blob écrit AVANT la suppression effaçait la liste et le post
revenait au cycle suivant. D'où `fusionnerPostsSupprimes()` + un
`purgerPostsSupprimes()` immédiat après chaque hydratation.
⚠️ Bornée à `POSTS_SUPPRIMES_MAX` (500) : le blob `user_state` part EN ENTIER à
chaque synchronisation, même raison que `passionSignals`.

④ **Le bouton « ⋯ » de MA publication disparaissait, et c'est ce qui rendait le
   défaut si dur à contourner.** La carte testait `p._source === "me"`,
   c'est-à-dire la **provenance de la copie affichée**, pas l'auteur. Or
   `allFeedPosts` dédoublonne dans l'ordre seed → supabase → me : dès que la
   copie serveur d'un post est chargée, c'est elle qui s'affiche, avec
   `_source === "supabase"` — et le menu d'options de ma propre publication
   n'existait plus sur la carte. Seule la fiche ouverte (qui, elle, testait
   `userPosts`) permettait encore de supprimer. `_estMonPost(p)` (app-02) pose la
   bonne question : **l'auteur, jamais la source**. Corollaire, `confirmDeletePost`
   et `deletePost` passent par `findPostAnywhere` — l'ancien `userPosts.find`
   répondait « tu ne peux supprimer que tes propres posts » sur mon propre post.

Verrou : `tests/e2e/suppression-durable.spec.js` (8 cas), éprouvé par mutation —
rendre `state.seed.posts = newPosts` fait rougir le cas ③, retirer la purge de
`supabasePosts` **et** le filet d'`allFeedPosts` en fait rougir cinq.
