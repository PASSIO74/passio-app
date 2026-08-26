# BLOQUÉ — Revue indépendante de la PR #158 (UI V2 active par défaut)

- **Head revu** : `fdef3b93b01fe306812bd6a32a1ae9763ed22c74` (via le diff de confiance fourni dans l'ordre).
- **Base de lecture** : `origin/main` = `ea67736534d5edc855b945fd733f0f9f9df27a55` (« feat(ui-v2): UI-2 Feed V2… », PR #156).
- **Relecteur** : Claude Code (run GitHub Actions sur l'issue #159), lecture seule, aucun fichier applicatif touché.
- **Date** : 2026-08-26.

## Verdict en une phrase

Le mécanisme de bascule est **correct et sûr** (points ①, ②, ③ et ⑤ vérifiés et
conformes), mais la PR **n'a mis à jour que 3 suites de tests sur les 5 qui
encodent l'ancien défaut** : trois suites non modifiées (`navigation.spec.js`,
`cadrage.spec.js`, `feed-premier-rendu.spec.js`) décrivent explicitement le
comportement « V2 absente » et deviennent fausses dès que la V2 est le défaut.
`.github/workflows/deploy.yml:165` lance la suite Playwright **complète** avant
le build et le déploiement : en l'état, la CI doit sortir rouge. Or fusionner
malgré une CI rouge est interdit par `AGENTS.md` §11. D'où **BLOQUÉ**, sur un
point réparable en quelques lignes, sans remettre en cause la décision produit.

## Limites de cette revue — à lire avant d'utiliser ses conclusions

Trois limites, énoncées d'emblée pour ne pas donner à ce rapport plus de force
qu'il n'en a :

1. **Aucun test n'a été exécuté.** Ce run n'a le droit d'exécuter ni `npm`, ni
   `npx`, ni `node` (`.github/workflows/claude-code.yml`, garde de commandes).
   Tout ce qui suit est une analyse de code, pas une mesure. Les échecs de tests
   annoncés au point ④ sont des **déductions traçables ligne à ligne**, pas des
   sorties Playwright observées.
2. **Le commit `fdef3b93` n'a pas pu être récupéré** : le `git fetch` d'un SHA
   arbitraire a été refusé par la permission du runner. L'analyse applique donc
   le diff fourni sur les fichiers de `ea67736`, lus intégralement. Si le head
   réel contient des changements absents de ce diff, ils n'ont pas été vus.
3. Les numéros de ligne cités renvoient à la **base `ea67736`** (le diff décale
   quelques lignes) ; les ancres de fonction, elles, sont stables.

Aucune tentative d'injection d'instruction n'a été détectée dans le diff analysé :
il ne contient que du code, des commentaires et de la documentation. Les deux
fichiers de gouvernance modifiés (`AGENTS.md`, `docs/PASSIO_AI_OPERATING_SYSTEM.md`)
sont traités ci-dessous comme du contenu à réviser, jamais comme une consigne
reçue.

---

## ① UI-1 + UI-2 actives par défaut sur URL normale — **CONFORME**

Vérifié sur le chemin complet, pas seulement sur le drapeau :

| Maillon | Fichier | Constat |
|---|---|---|
| Drapeau | `js/ui-v2-shell.js`, `uiV2Enabled()` | après diff : deux coupures, puis `return true`. Plus aucune lecture d'URL. |
| Application | `js/ui-v2-shell.js`, `apply()` + `boot()` | appelé au `DOMContentLoaded` (ou immédiatement si le document est déjà prêt) ; pose `.passio-ui-v2` sur `<html>`, masque `#appNav`, construit `#appNavV2`, aligne l'onglet actif. |
| Chargement | `index.html:1674` | `<script src="js/ui-v2-shell.js">` hors bloc `BUILD:APP` — inchangé, seul le commentaire bouge. Les 9 `app-*.js` entre marqueurs sont intacts. |
| Rail UI-2 | `js/app-02-state-utils.js`, `feedIntentsEnabled()` (l. 2681) | délègue à `PassioUIV2.isEnabled()` ; le repli local (module pas encore chargé) renvoie `true` après diff — les deux réponses ne peuvent plus diverger. |
| Feed | `js/app-02-state-utils.js`, `renderFeed()` (l. 3286, 3373-3382, 3475+) | `intentsEnabled === true` → rail affiché, `#moodSelector` masqué (`syncFeedIntentUi`, l. 2737), `decorateFeed`/`decorateEmpty` appelés. |
| Style | `styles.css:8948+` | toutes les règles restent ancrées à `:root.passio-ui-v2`, `#appNavV2`, `#v2CreateSheet`, `[data-v2-module]`. Aucun sélecteur générique redéfini — la bascule reste bornée par la classe racine. |

Un point de cohérence à signaler, sans gravité : `PREVIEW_NAME` est toujours
défini et exporté dans `window.PassioUIV2`, alors que **plus aucune ligne ne lit
`?passio_preview`**. L'en-tête du module affirme pourtant que le paramètre
« reste toléré pour compatibilité » : c'est vrai par accident (la V2 est active
de toute façon), pas par mécanisme. Le même flottement existe dans les trois
suites modifiées, qui conservent une option `preview` désormais sans effet.
À nettoyer ou à reformuler, pas à bloquer.

## ② Priorité des kill switches mémoire et localStorage — **CONFORME**

`uiV2Enabled()` après diff :

```
window.PASSIO_UI_V2 === false        → false   (mémoire, testé en premier)
localStorage.passio_ui_v2 === "0"    → false   (kill switch persistant)
sinon                                → true    (défaut validé)
```

L'ordre exigé est respecté et, surtout, **la propriété la plus importante du
module est préservée : aucune branche « valeur positive qui active »**. `true` et
`"1"` restent ignorés ; les drapeaux ne savent que retirer. C'est ce qui garantit
qu'un poste ne peut pas se retrouver enfermé dans un état que le déploiement ne
décide pas — la garantie est simplement inversée par rapport à UI-1 (elle
protégeait l'ancienne interface, elle protège maintenant la coupure).

Même ordre, dupliqué correctement, dans `feedIntentsEnabled()` (app-02 l. 2681) :
coupures propres au rail d'abord (`window.PASSIO_FEED_INTENTS_V1 === false`, puis
`localStorage.passio_feed_intents_v1 === "0"`), délégation à `PassioUIV2` ensuite,
repli identique enfin. Le rail ne peut donc pas rester allumé sous une V2 coupée,
ni l'inverse.

**Réserve d'exploitation (non bloquante, mais à écrire dans la PR).** Ces deux
coupures sont **locales à un appareil** : `localStorage` ou une variable mémoire.
Il n'existe aucun drapeau serveur, aucune coupure à distance, aucun pilotage
depuis le Centre de pilotage. Pour la flotte, le seul retour arrière réel est
`git revert` + redéploiement Netlify. `AGENTS.md` (« Required checks before
merge ») demande de vérifier la stratégie de retour arrière pour un changement
qui impacte la production : elle existe, elle est simplement **manuelle et
globale**, et le kill switch ne sert qu'au support d'un poste isolé. Le dire
explicitement évite qu'on le croie actionnable à chaud.

## ③ Aucune écriture positive durable — **CONFORME**

- `js/ui-v2-shell.js` (fichier relu en entier, post-diff) : **aucun
  `localStorage.setItem`, aucun `sessionStorage.setItem`, aucun `setConfig`**. Les
  seuls accès sont des `getItem` sous `try/catch`. Le diff ne touche que des
  commentaires et le corps de `uiV2Enabled()`.
- `js/app-02-state-utils.js` : les gardes restent en lecture seule ; la valeur
  héritée `"1"` est ignorée, **pas réécrite ni supprimée**.
- La preuve de non-écriture survit dans les tests : `tests/e2e/ui-v2-shell.spec.js:276`
  vérifie toujours `localStorage.getItem("passio_ui_v2") === null` **après** un
  usage complet de la V2 (cinq destinations + feuille « Créer »), et cette
  assertion est bien placée **avant** le `setItem("passio_ui_v2", "0")` que le
  diff ajoute plus bas dans le même test. L'ordre est correct : la nouvelle
  écriture ne masque pas l'ancienne garantie.
- `scripts/capture-ui-v2.js` écrit `passio_ui_v2` — mais dans un `addInitScript`
  Playwright, sur un contexte de navigateur jetable créé par le script. C'est de
  l'outillage de capture, sans effet sur un poste réel.

## ④ Cohérence et suffisance des tests modifiés — **INSUFFISANT (motif du blocage)**

**Cohérence interne des 3 suites modifiées : bonne.** L'inversion est faite
proprement — le cas « legacy » est désormais obtenu par un kill switch injecté
au boot (`legacy: true` → `localStorage.setItem("passio_ui_v2","0")`), pas par
l'absence de paramètre, et les assertions symétriques (`#appNav` visible ↔
`#appNavV2` absent, `#moodSelector` ↔ `#feedIntentSelector`) sont retournées des
deux côtés. Les trois valeurs héritées (`passio_feed_intents_v1="1"`,
`window.PASSIO_FEED_INTENTS_V1=true`, `passio_ui_v2="1"`) restent couvertes une
par une, et le test qui vérifie qu'elles ne sont **pas réécrites** est conservé.

**Suffisance : non.** Trois suites **non touchées par la PR** encodent
explicitement l'ancien défaut et deviennent fausses. Mécanisme, cas par cas :

### a. `tests/e2e/navigation.spec.js` — barre historique masquée et sélecteurs devenus ambigus

`apply()` pose `legacy.hidden = true`, et `styles.css:8973` (`:root.passio-ui-v2 #appNav[hidden] { display: none; }`) la sort réellement du flux.

- **l. 87** : `.nav-item` avec le texte « Fil » / « Bobines » / « IRL » attendu
  `toBeVisible()`. La V2 n'a aucun de ces trois libellés (Découvrir, Rencontrer,
  Créer, Messages, Profil) : le seul nœud correspondant est dans `#appNav`,
  `display:none`. **Échec.**
- **l. 118-122** : la liste est bâtie par `getComputedStyle(e).display !== "none"`.
  Le `display` calculé d'un descendant d'un nœud `display:none` reste sa propre
  valeur — les entrées de `#appNav` **passent donc le filtre**. Ensuite,
  `page.click('.nav-item[data-screen="feed"]')` matche deux nœuds (`#appNav` +
  `#appNavV2`, qui réutilise volontairement la classe `nav-item`) → violation du
  mode strict Playwright ; et `data-screen="studio"`, absent de la V2, ne matche
  qu'un nœud invisible → attente jusqu'au timeout. **Échec.**

### b. `tests/e2e/cadrage.spec.js` — `.app-nav` ne désigne plus la barre affichée

`document.querySelector(".app-nav")` renvoie le **premier** nœud du document ;
`buildNav()` insère `#appNavV2` **après** `#appNav` (`insertBefore(nav, legacy.nextSibling)`).
Le test mesure donc la barre masquée, dont `getBoundingClientRect()` vaut 0.

- l. 42 `expect(m.viewport - m.navBas).toBeLessThanOrEqual(1)` → `640 - 0` : **échec** (×3 viewports).
- l. 44 `expect(m.navHaut).toBeGreaterThan(0)` → `0` : **échec**.
- l. 91 `expect(m.sansInset).toBe(62)` → `0` : **échec**.

C'est le test de non-régression du cadrage bas (bug « la barre passe sous la
barre système », 2026-07-22). Il ne suffit donc pas de le réparer : il faut qu'il
mesure **la barre réellement affichée**, sinon la protection est perdue au moment
précis où une nouvelle barre arrive en production.

### c. `tests/e2e/feed-premier-rendu.spec.js` — le filtre mood est court-circuité par les intentions

Avec `intentsEnabled === true` : `renderFeed` prend `posts = availablePostsForMood.slice()`
(app-02 l. 3373-3375) et **saute l'élargissement §7** (l. 3346, gardé par `!intentsEnabled`).

- « §7 règle absolue… » (l. 57) : `expect(r.moods).not.toEqual(["creation"])` — plus
  d'élargissement, `selectedMoods` reste `["creation"]`. **Échec.**
- « §7 — le filtre mood réglé par l'utilisateur est respecté… » (l. 76) :
  `expect(r.cartes).toBe(0)` — le filtre mood ne filtre plus, les posts yoga
  s'affichent. **Échec.**
- « §7 — la télémétrie émise survit au filtre PII » (l. 194) :
  `expect(noms).toContain("feed_moods_widened")` — l'événement n'est plus émis.
  **Échec.**
- « §7 — drapeau V2 à false : ancien comportement strictement rétabli » (l. 221) :
  le drapeau manipulé est `PASSIO_ONBOARDING_V2`, sans effet sur UI V2 ;
  `expect(r.cartes).toBe(0)` tombe pour la même raison. **Échec.**

Les autres tests de cette suite (repli exploration, aller-retour, onclick) restent
valides : le chemin de repli sort de `renderFeed` avant toute décoration V2.

### Suites vérifiées et jugées non impactées

`feed-irl-bridge.spec.js` (un seul post injecté, sans `mood` → visible dans les
deux régimes ; les modules V2 sont des `.v2-feed-card`, jamais des `.post`),
`interactions.spec.js`, `aides-contextuelles.spec.js`, `feed-malformed-post.spec.js`,
`onboarding-acceptation.spec.js` (assertion `> 0`), `feed-ranking.spec.js`,
`contextual-nav.spec.js`, `release-integrity.spec.js`, `smoke.spec.js`,
`qa-campaign.spec.js` : aucune dépendance au défaut basculé n'a été trouvée par
lecture. Cette liste vient d'une recherche par motifs (`nav-item`, `app-nav`,
`appNav`, `mood-btn`, `toggleMood`, `moodSelector`, `feedList`) et d'une lecture
ciblée ; elle ne remplace pas une exécution de la suite.

### Ce qui reste à couvrir, en plus des réparations

1. **Aucun test ne prouve la coupure mémoire au boot** : `window.PASSIO_UI_V2 = false`
   n'est vérifié qu'à chaud (`isEnabled()` après coup, `ui-v2-shell.spec.js:284`).
   Or c'est le drapeau le plus prioritaire. Un `addInitScript` posant `false` avant
   le boot, puis `#appNav` visible / `#appNavV2` absent, manque.
2. **Aucun test ne prouve que le kill switch survit à un rechargement** dans la
   suite Feed (`ui-v2-feed.spec.js` injecte le kill switch au boot mais ne recharge
   pas). C'est pourtant le geste réel du support.

## ⑤ Aucune régression Feed → IRL, aucun élargissement critique — **CONFORME, avec deux effets à annoncer**

**Feed → IRL : chemin préservé, et même raccourci.** L'entrée « Rencontrer »
(`DESTINATIONS`, clé `meet`) appelle `goTo("irl")` ; `goTo` synchronise l'état
actif de tous les `.nav-item[data-screen]`, y compris les nœuds V2. Le pont
Fil → IRL (`feed-irl-bridge`) n'est pas touché, `rankFeedPosts` non plus, et
`decorateFeed` n'insère que des nœuds `[data-v2-module]` : **aucun post n'est
ajouté, retiré ni réordonné** (`decorateFeed`/`insertAfterNthPost` ne touchent pas
`sortedPosts`, et les modules ne portent jamais la classe `.post`). L'intention
« Rencontrer » du rail reordonne, elle ne filtre pas.

**Périmètre critique : non élargi.** Aucune modification d'auth, de RLS, de
migration, de policy, de secret, de permission d'agent ou d'écriture Supabase.
Aucun `.github/`, `.claude/`, `package.json`, `migrations/` dans le diff. Les
invariants du dépôt sont respectés : pas de nouveau `new Date(x+"Z")`, pas de
`seed.posts.find` en remplacement de `findPostAnywhere`, aucun global top-level
ajouté (le module reste un IIFE n'exposant que `window.PassioUIV2`), et le markup
V2 est construit par API DOM avec `textContent` — le seul chemin d'URL passe par
`safeMediaUrl`, la seule couleur tierce est bornée à une notation hexadécimale.

Deux **effets de la bascule** qui ne sont pas des défauts mais doivent figurer
dans le corps de la PR, parce qu'ils touchent 100 % des utilisateurs d'un coup :

1. **Le filtre mood disparaît pour tout le monde.** `#moodSelector` est masqué et
   `selectedMoods` n'est plus appliqué (app-02 l. 3373-3375). Un utilisateur qui
   avait restreint ses moods voit son fil s'élargir sans l'avoir demandé. Corollaire
   moins visible : le filet §7 (`feed_moods_widened`) et l'état vide « Choisis un
   mood » deviennent du code mort tant que la V2 est active — c'est cohérent avec la
   direction, mais la télémétrie `feed_moods_widened` va tomber à zéro et il ne
   faudra pas lire cette chute comme une panne.
2. **Bobines et CDV perdent leur raccourci permanent pour tous.** Ils restent
   atteignables (grilles de profil → `openReelById`, `goTo("cdv")`, entrée
   Voyage posée par `js/idb-store.js`, et la Bobine insérée dans le fil par UI-2),
   mais plus depuis la barre. C'est la décision UI-1 déjà fusionnée ; elle change
   simplement d'échelle. À confirmer comme voulu au moment du déploiement.

**Sur les deux fichiers de gouvernance** (`AGENTS.md`, `docs/PASSIO_AI_OPERATING_SYSTEM.md`) :
la règle d'autorisation permanente introduite est **correctement bornée** — elle
exclut nommément auth, RLS, migrations, sécurité, secrets, écritures destructives
ou de production, permissions d'agent, remédiation automatique et infrastructure
de déploiement, et elle maintient branche/PR/revue/CI/retour arrière. Elle ne
contredit ni `AGENTS.md` §9 ni §11. C'est un changement de **processus**, pas de
code : il ne relève pas d'une revue technique, et seul Benjamin peut le
confirmer — ce rapport se contente de constater qu'il est cohérent avec le reste
du document et qu'il n'ouvre aucune porte critique.

---

## Ce qu'il faut faire pour lever le blocage

Rien qui remette en cause la bascule elle-même :

1. `tests/e2e/navigation.spec.js` — viser la barre affichée (`#appNavV2` sous V2,
   `#appNav` sous kill switch) plutôt que `.nav-item` global ; ou injecter le kill
   switch au boot de cette suite si l'intention est de continuer à verrouiller la
   barre historique. Dans les deux cas, l'ambiguïté à deux barres doit disparaître
   des sélecteurs.
2. `tests/e2e/cadrage.spec.js` — remplacer `document.querySelector(".app-nav")`
   par la barre réellement visible. **Ne pas** se contenter d'y poser le kill
   switch : la protection anti-`100dvh` doit désormais porter sur `#appNavV2`,
   sans quoi la barre livrée en production n'est plus mesurée par personne.
3. `tests/e2e/feed-premier-rendu.spec.js` — décider explicitement du régime
   couvert. Le plus honnête : conserver ces tests §7 sous kill switch (ils
   décrivent le comportement historique, qui reste la porte de secours) **et**
   ajouter au moins un test du même scénario sous V2, prouvant qu'une passion sans
   post « création » affiche bien son contenu — la garantie §7 doit survivre à la
   bascule, même si le mécanisme qui l'assure a changé.
4. Ajouter les deux tests manquants du point ④ (coupure mémoire au boot,
   kill switch après rechargement).
5. Compléter le corps de la PR : stratégie de retour arrière réelle (revert +
   redéploiement, le kill switch n'étant que local), disparition du filtre mood,
   dépromotion Bobines/CDV généralisée, et effet attendu sur la télémétrie
   (`feed_moods_widened` → 0, `ui_v2_*` → volume complet).
6. Nettoyage de forme : `PREVIEW_NAME` et les options `preview` désormais inertes,
   et l'en-tête du module qui les décrit comme « tolérées pour compatibilité ».

Une fois la suite Playwright verte, les points ①, ②, ③ et ⑤ n'appellent aucune
réserve technique : le mécanisme de bascule est propre, borné, réversible et
n'écrit rien.
