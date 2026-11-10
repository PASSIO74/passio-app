# Lot 28 — Contrôle général du 2026-11-10 : dix défauts, mesurés puis corrigés

> Demande de Benjamin : « un contrôle et une optimisation générale de PASSIO / Sentinelle / centre de
> pilotage ; teste chaque onglet ». Chaque onglet a été parcouru à **375 × 812** (iPhone 12/13 mini,
> X, 11 Pro), en visiteur puis avec un état embarqué, sur `main` 6dafc0f1. Rien n'a été corrigé
> avant d'être mesuré dans le DOM ; chaque correctif a son test, **rouge sur le code d'avant**
> (contre-épreuve faite sur un second worktree à 6dafc0f1 : 10 rouges).
> Verrou unique : `tests/e2e/controle-general-2026-11-10.spec.js` (10).

## Ce qui a été trouvé

| # | Écran | Défaut mesuré | Cause | Correctif |
|---|---|---|---|---|
| ① | Fil, **chaque carte** | Une ligne vide au-dessus du texte, première ligne décalée de 23 px, « Lire la suite » seul à la ligne, deux lignes vides sous un texte court : **7 lignes peintes pour 4 écrites** (157 px au lieu de 90) | `.post-body` est en `white-space: pre-wrap` ; le gabarit de `renderPostHTML` mettait le texte sur sa propre ligne, indentée | Le texte est collé à ses balises ; « Lire la suite » est insécable (`app-02`) |
| ② | Page d'une publication | « ✨ » sur fond violet à la place de l'avatar que la carte venait de montrer | `openPost` ne reprenait pas l'emoji et la couleur du COMPTE quand la publication ne porte que le nom | Même chaîne de repli que la carte (`app-02`) |
| ③ | Bulles de passion (tête du fil, profil) | Icône « image cassée » du navigateur et texte alternatif tronqué quand la vignette ne charge pas (hors ligne, relais d'images en panne, bloqueur) | `<img>` sans `onerror` hors du cas `fallbackUrl` | La vignette en échec se retire ; le repli est essayé une fois (`passionTileHTML`) |
| ④ | Fiche d'une activité | **« Demain » au-dessus de « Mardi 10 novembre · 18:30 », lu le 10 au matin** ; « Dans 2 jours » pour demain soir | `Math.ceil(durée / 24 h)` — la carte de la liste comptait déjà des minuits (`ui-v4a2-cartes.js`), pas la fiche | `joursCalendairesAvant()` (app-02), aux deux endroits d'`app-07` |
| ⑦ | Landing (compte connu, sans session) | Le sixième pilier lisible ENTRE « Se connecter » et « Créer un compte », et sous eux | `.landing-cta` collant et transparent | Pied dépoli, pleine largeur, jusqu'au bord bas (`styles.css`) |
| ⑧ | Carte d'exemple | « Mehdi Saïd » sur deux lignes, « Sport · 12:52 » aussi | « Exemple PASSIO » + la capsule d'envie laissaient ~62 px au pseudo | Les deux capsules s'empilent à droite (grille, `:has(> .fr-demo-tag)`) |
| ⑨ | Bobines | Le « Co » de « Commentaire » mangé ; l'indice « Glisse vers le haut… » posé sur la rangée de capsules cinq secondes à chaque ouverture | `.reel-info` finissait à 78 px du bord, le libellé déborde jusqu'à 86 ; l'indice datait d'avant la rangée du lot UI-5 | `right: 88px` ; l'indice à 260 px du bas sous `passio-ui-5` |

| ⑩ | Landing, onboarding | La bulle d'aide du fil (« Appuie sur l'auteur… », z-index 9000) posée SUR la page d'accueil, par-dessus un pilier, quand un état embarqué démarre sans session | `montrerHint` juge `offsetParent` : le fil est monté sous la landing, sa cible n'est pas « invisible » | La règle des routeurs de liens : rien ne s'ouvre par-dessus `#landing.active` ni `#onboarding.active` ; refusée, l'aide n'est pas marquée vue |

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
- **`audit:echappement` lit le contexte dans le littéral qui précède l'interpolation** : un gestionnaire
  `onerror="…"` s'écrit d'un seul tenant, attribut compris, sinon `this.src='` passe pour un attribut d'URL.

- **Une suite qui démarre par un état embarqué sans session démarre DERRIÈRE la landing.** `bootOnboarded`
  la ferme ; le `boot` d'`aides-contextuelles.spec.js` ne le faisait pas, et deux de ses tests mesuraient
  donc une bulle posée sur la page d'accueil (rouges dès la garde ⑩, prémisse corrigée dans leur `boot`).
  Effet de bord voulu : après `bootOnboarded`, la bulle « Appuie sur l'auteur… » n'est plus à l'écran —
  elle se posait pendant les 2,5 s où la landing couvrait le fil, puis restait par-dessus les tests.

## Vu, mesuré, laissé

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
