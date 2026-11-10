# Lot 28 — Contrôle général du 2026-11-10 : neuf défauts, mesurés puis corrigés

> Demande de Benjamin : « un contrôle et une optimisation générale de PASSIO / Sentinelle / centre de
> pilotage ; teste chaque onglet ». Chaque onglet a été parcouru à **375 × 812** (iPhone 12/13 mini,
> X, 11 Pro), en visiteur puis avec un état embarqué, sur `main` 6dafc0f1. Rien n'a été corrigé
> avant d'être mesuré dans le DOM ; chaque correctif a son test, **rouge sur le code d'avant**
> (contre-épreuve faite sur un second worktree à 6dafc0f1 : 9 rouges).
> Verrou unique : `tests/e2e/controle-general-2026-11-10.spec.js` (9).

## Ce qui a été trouvé

| # | Écran | Défaut mesuré | Cause | Correctif |
|---|---|---|---|---|
| ① | Fil, **chaque carte** | Une ligne vide au-dessus du texte, première ligne décalée de 23 px, « Lire la suite » seul à la ligne, deux lignes vides sous un texte court : **7 lignes peintes pour 4 écrites** (157 px au lieu de 90) | `.post-body` est en `white-space: pre-wrap` ; le gabarit de `renderPostHTML` mettait le texte sur sa propre ligne, indentée | Le texte est collé à ses balises ; « Lire la suite » est insécable (`app-02`) |
| ② | Page d'une publication | « ✨ » sur fond violet à la place de l'avatar que la carte venait de montrer | `openPost` ne reprenait pas l'emoji et la couleur du COMPTE quand la publication ne porte que le nom | Même chaîne de repli que la carte (`app-02`) |
| ③ | Bulles de passion (tête du fil, profil) | Icône « image cassée » du navigateur et texte alternatif tronqué quand la vignette ne charge pas (hors ligne, relais d'images en panne, bloqueur) | `<img>` sans `onerror` hors du cas `fallbackUrl` | La vignette en échec s'efface (`visibility`, jamais `display`) ; le repli est essayé une fois (`passionTileHTML`) |
| ④ | Fiche d'une activité | **« Demain » au-dessus de « Mardi 10 novembre · 18:30 », lu le 10 au matin** ; « Dans 2 jours » pour demain soir | `Math.ceil(durée / 24 h)` — la carte de la liste comptait déjà des minuits (`ui-v4a2-cartes.js`), pas la fiche | `joursCalendairesAvant()` (app-02), aux deux endroits d'`app-07` |
| ⑦ | Landing (compte connu, sans session) | Le sixième pilier lisible ENTRE « Se connecter » et « Créer un compte », et sous eux | `.landing-cta` collant et transparent | Pied dépoli, pleine largeur, jusqu'au bord bas (`styles.css`) |
| ⑧ | Carte d'exemple | « Mehdi Saïd » sur deux lignes, « Sport · 12:52 » aussi | « Exemple PASSIO » + la capsule d'envie laissaient ~62 px au pseudo | Les deux capsules s'empilent à droite (grille, `:has(> .fr-demo-tag)`) |
| ⑨ | Bobines | Le « Co » de « Commentaire » mangé ; l'indice « Glisse vers le haut… » posé sur la rangée de capsules cinq secondes à chaque ouverture | La colonne d'actions prenait la largeur de son plus long libellé, donc de la police de l'appareil (`system-ui`) : 82 px sous Segoe UI, ~95 sous la police de repli de la CI Linux ; `.reel-info` finissait à 78 px du bord. L'indice datait d'avant la rangée du lot UI-5 | Colonne de largeur FIXE (80 px), libellés bornés (points de suspension au-delà de 76 px), `.reel-info` 4 px avant (`right` 94, 96 au-delà de 480 px) ; l'indice à 260 px du bas sous `passio-ui-5` |

Les défauts ⑤ (discussion d'un exemple vidée à l'ouverture) et ⑥ (messages d'exemple en double à la
deuxième visite) sont de la logique, pas de l'écran : fiche dans `docs/journal/social-messagerie.md`.

## Invariants

- **Un gabarit qui écrit dans un élément `pre-wrap` / `pre-line` colle le texte à ses balises.** Les
  sept sélecteurs concernés : `.post-body`, `.main-profile-bio`, `.story-compose-preview > div`,
  `.me-overlay.text`, `.story-ov`, `.conv-bubble`, `.v6a0-apercu-desc`. Seul `.post-body` (carte du
  fil) était fautif ; les autres écrivaient déjà `>${…}</`.
- **« Dans combien de jours » se compte en minuits** : `joursCalendairesAvant(ts)`, jamais
  `Math.ceil((ts - Date.now()) / 86400000)`. Une DURÉE (compte à rebours, « il y a 3 h ») reste une durée.
- **Le pied collant de la landing porte le padding bas de la page** (`.landing` n'en a plus) : une marge
  négative sous un enfant de flex défilant ne le fait PAS descendre dans le padding du conteneur
  (mesuré : le bas du pied restait à 782 sur 812). `.landing-cta` doit rester le DERNIER enfant de `#landing`.
- **L'en-tête en grille ne vise que la carte qui porte `.fr-demo-tag`** : la carte d'une vraie
  publication est inchangée, à l'octet. Sans `:has()` (Safari < 15.4), la mise en page d'avant.
- **La colonne d'actions des bobines a une largeur FIXE (80 px), ses libellés y sont bornés.** La pile de
  polices est `system-ui` : la largeur d'un mot dépend de l'appareil (« Commentaire » : 70 px sous Segoe UI,
  ~83 sous la police de repli de la CI Linux). Un retrait calibré sur UNE police ne tient pas ailleurs : la
  première version (`right: 88px`) était verte sous Windows et rouge en CI (libellé à 275,8 px, texte
  jusqu'à 287). Le test ⑨ rejoue la mesure sous une police large ; le bouton le plus étroit garde 46 px.
- **Une vignette en échec s'efface par `visibility`, jamais par `display`** : `display` est l'autorité de
  la MISE EN PAGE. La première version (`display: none`) faisait lire « pas de vignette » à `ui-v7-lot` §3,
  en local et en CI, où les images de démonstration (Edge Function `demo`) répondent 404.
- **`audit:echappement` lit le contexte dans le littéral qui précède l'interpolation** : un gestionnaire
  `onerror="…"` s'écrit d'un seul tenant, attribut compris, sinon `this.src='` passe pour un attribut d'URL.

## Vu, mesuré, laissé

- **La bulle d'aide « Appuie sur l'auteur… » se pose par-dessus la landing** (z-index 9000 contre 60) quand
  un état embarqué démarre sans session : `montrerHint` juge `offsetParent`, et le fil est monté SOUS la
  landing. ⚠️ **Une garde a été ESSAYÉE puis RETIRÉE le jour même** (« rien ne s'ouvre par-dessus
  `#landing.active` ni `#onboarding.active` », la règle des routeurs de liens). Elle corrige l'écran, mais
  elle change l'état de départ de presque toutes les suites : `bootOnboarded` démarre derrière la landing,
  et c'est LÀ que l'aide du fil était consommée. Refusée au démarrage, elle se pose plus tard — au premier
  `renderFeed` — par-dessus le test en cours : `accessibilite-cibles` ⑦ y perdait 2 px de la zone tactile
  du « ⋯ » (42 pour 44, rouge net ; vert dès la garde retirée), et deux tests d'`aides-contextuelles`
  mesuraient une bulle posée sur la page d'accueil. Le reprendre, c'est d'abord décider ce que
  `bootOnboarded` fait de cette aide — un lot à part, pas un correctif d'écran. Chemin rare en production
  (session expirée, état local conservé).
- **Le fil d'un compte neuf ne montre que des exemples** quand ses passions n'ont aucune publication
  réelle, alors que le réseau en a ailleurs (37 en base) : `selectedFeedPassions` filtre le réel comme
  le décor. C'est une décision de produit (ChatGPT / Benjamin), pas un défaut.
- **`sw.js` (activate) supprime TOUS les autres caches de l'origine**, `passio-pilotage-*` compris : chaque
  mise en ligne de l'app vide le cache hors-ligne du pilotage. Non touché ici — une autre session
  écrit dans `sw.js` ce jour-là.
- En développement (`sw.js` servi tel quel), `CACHE = "passio-v" + Date.now()` crée un cache par
  réveil du worker, jamais purgé : 8 caches en vingt minutes de test. Sans effet en production
  (`build.js` y écrit le `buildId`), mais **une feuille de style modifiée n'apparaît pas tant que le
  worker n'est pas désinscrit** — `serviceWorkers: "block"` pour une capture.

## Audit du diff (`audit-passio`), mené après la fusion — et ce qu'il a changé

`CLAUDE.md` prescrit l'audit d'un diff par le subagent `audit-passio` AVANT de livrer ; il n'a été lancé
qu'après la fusion de #817 (déjà en ligne). Verdict : **aucun P0, P1 ni P2**. Les suites ont été traitées
dans une PR à part :

- **P3, confirmé — un trou dans le verrou ⑤.** Son cas « vraie publication » portait `fromSupabase`, qui
  court-circuite la garde : le cas pour lequel la règle d'origine a été écrite (MA publication dans
  `userPosts`, ni `fromSupabase` ni `_source`) n'était pas couvert. Couvert, et **prouvé par mutation** :
  `_ciEstExemple` simplifiée en `!p.fromSupabase` rougit le test.
- **P4 corrigés.** Le titre « Discussion (N) » d'un exemple dont la discussion pagine (31 vrais commentaires
  et plus) oubliait le décor : `nbCommentairesPost` le compte. `joursCalendairesAvant` passe une chaîne par
  `supaTs`. La suite tourne au fuseau de Paris (la CI est en UTC, où le cas du changement d'heure de ④ ne
  prouvait rien). Le masque du pied de la landing s'arrête à 10 px, avant l'anneau de focus des boutons.
  Enfin **la suite est inscrite dans `SUITES_WEBKIT`** : le pied collant (flou et masque) n'avait jamais
  été rendu par le moteur de l'iPhone. Sous WebKit, deux fragilités de TEST sont apparues et ont été
  corrigées — l'indice des bobines se mesure au repos (son animation de 5 s était lue en plein fondu), et le
  fondu d'entrée de la landing est terminé avant la mesure (figé au départ, il la décalait de 6 px) — puis
  27/27 en trois tours.
- **P4 laissés, avec leur raison.** L'indice des bobines en paysage, dans le navigateur, couvre 5 s le
  bouton « précédente » (la PWA est verrouillée en portrait ; l'indice ne capte aucun toucher). La fusion
  de deux copies d'un message d'EXEMPLE garde la plus ancienne valeur d'un champ présent des deux côtés
  (décor en lecture seule, aucune donnée réelle). Les points de suspension d'un libellé de bobine rognent
  les 3 px de flou de son ombre (cosmétique).
