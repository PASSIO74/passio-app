# Guide de l'audit UX/UI PASSIO — méthode, banc, contrat de sortie

> Ce guide est lu par chaque auditeur de domaine AVANT de commencer. Il fait aussi partie
> du livrable : il dit comment chaque capture, mesure et constat a été produit.

## 0. Version auditée et règles de sécurité (non négociables)

- **Version auditée** : `main` au commit `4e1d8ed1` (PR #820, 2026-11-10 14:08 UTC). La production
  (`release.json` : `buildId 3d8e98bb12ad`) porte le même commit. Ce worktree
  (`.claude/worktrees/audit-ux-ui-2026-11-10`, branche `docs/audit-ux-ui-2026-11-10`) EST ce commit.
- **On n'ouvre l'application QUE par le banc** (`outils/sonde.js`, `outils/capturer.js`). Jamais
  d'autre navigateur, jamais `npm run serve`, jamais `https://passio-app.netlify.app` : hors du banc,
  l'application joint la production (lectures de vrais contenus, télémétrie, canal temps réel).
- Aucune écriture en base, aucun compte créé, aucun message, invitation, publication ou notification
  vers de vraies personnes. Aucune commande `supabase`, `psql`, `npm test`, `npm run test:prod`.
- **Aucune commande git** qui écrit (`add`, `commit`, `stash`, `checkout`, `reset`, `push`…). Lire
  l'historique (`git log`, `git show`, `git blame`) est permis.
- **On ne modifie AUCUN fichier de l'application** (`index.html`, `styles.css`, `js/`, `tests/`,
  `scripts/`, `netlify/`, `migrations/`…). On n'écrit que dans `docs/audit-ux-ui-2026-11-10/`, et
  seulement dans SES fichiers de domaine (liste au § 6). Les propositions vivent dans des maquettes
  appliquées par le banc au moment de la capture.
- Le poste est chargé (peu de mémoire libre) : **un seul navigateur à la fois**, jamais deux
  commandes de capture en parallèle, pas de `--workers`.
- Données : tout est FICTIF. Ne jamais recopier un contenu, un nom ou un identifiant réel.

## 1. Ce qu'est PASSIO (à garder en tête pour juger)

- Promesse : **Découvrir, partager ses passions, rencontrer des gens dans la vraie vie.**
  Boucle centrale : **Fil → interaction → IRL**. Une interface se juge à ce qu'elle facilite de
  cette boucle. Simplicité et compréhension immédiate priment sur l'accumulation de fonctions.
- Une PERSONNE a un profil unique et PLUSIEURS passions ; chaque PUBLICATION porte une passion,
  choisie au Studio au moment de publier. Il n'existe AUCUNE passion principale (ADR-011).
- **Retiré, à ne jamais réintroduire ni proposer** : économie interne (wallet, points, étoiles,
  rangs, boutique, Passia — ADR-009), Carnet de voyage (ADR-011 § 6), mode sombre.
- **Identité visuelle ACTUELLE** (celle du code, palette « UI v2 », active par défaut) :
  violet `--accent` = `#6D32F4`, encre `--text` = `#17152B`, fond `--bg-deep` = `#F7F5FC`, cartes
  blanches `--bg-card`, lavis `--accent-tile` / `--accent-tile-on` / `--accent-tile-line`,
  `--muted`, `--border`, rayons `--radius-lg|md|sm` (24/18/12) et `--v2-radius` (20), titres en
  Manrope 700–800 (`--v2-titre`), texte courant en pile système. **Le corail `--v2-coral` `#FF6B57`
  est STRICTEMENT réservé au passage au réel (IRL)**. Emojis = contenu (passions, réactions) ;
  icônes fonctionnelles = SVG `currentColor`.
- **Consignes anciennes devenues fausses — ne pas les appliquer** : « violet #7c3aed » (remappé en
  #6D32F4), « en-tête du fil rétractable `.chrome-collapsed` » (supprimé, fiche lots-ui 14),
  « pas de moods en pastilles » (les pastilles d'envie existent, fiche 17), plafond de 3 passions
  (levé depuis le lancement gratuit du 2026-11-01), code d'accès 2125 (rideau levé depuis le
  2026-09-11). En cas de doute : **le code actuel et la fiche la plus récente priment**.
- Acquis à contrôler, jamais à régresser : cibles tactiles ≥ 44 px, champs de saisie ≥ 16 px sur
  mobile, zoom possible (pas de `user-scalable=no`), contrastes AA (4,5:1 ; 3:1 grand texte).
- Lectures utiles : `CLAUDE.md`, `docs/lots-ui/INDEX.md` puis la fiche du lot concerné,
  `docs/journal/<domaine>.md`, `docs/PIEGES_CONNUS.md` (fiche du domaine).

## 2. Le banc

Tout se lance depuis la racine du worktree.

```bash
# Exploration : exécute un script, imprime ce qu'il rend, enregistre une image PNG légère à regarder
node docs/audit-ux-ui-2026-11-10/outils/sonde.js <script.js> [--mode demo|visiteur|compte] [--vue m390] [--mesurer] [--clavier 15]

# Captures du livrable (avant / après / gros plans / mesures) pour un fichier de scénarios
node docs/audit-ux-ui-2026-11-10/outils/capturer.js <domaine> [--scenario nom] [--id XXX-001] [--vue m390]
```

Les images produites se regardent avec l'outil de lecture de fichiers (PNG et WebP sont lisibles).
Regarder ses captures est OBLIGATOIRE : un constat visuel non regardé n'est pas un constat.

### 2.1 Modes de démarrage (`demarrage.mode`)

| Mode | Ce que c'est | Quand |
|---|---|---|
| `visiteur` | appareil vierge, aucune session : la vraie première visite | landing, première visite, liens ouverts sans compte |
| `demo` | état local « onboardé » sans session : socle d'exemples (« Exemple PASSIO »), interactions d'exemple désactivées | écrans de lecture, états d'exemple |
| `compte` | session fictive + **faux serveur Supabase en mémoire** (`tests/e2e/audit-2026-11-parcours-faux-serveur.js`, policies recopiées) | tout ce qu'un utilisateur CONNECTÉ fait : messagerie, suivi, RSVP, publication, notifications… |

Options de `demarrage` : `vue`, `etat` (état local complet, forme : `tests/e2e/app-helper.js`
→ `onboardedState`), `nbPassions`, `query`, `hash`, `stockage` (`{cléLocalStorage: valeur}` posées
avant le boot), `avantBoot(page, context)`, `peupler(serveur, {MOI, GENS, media})` (mode compte :
sème les tables `serveur.t.<table>`), `contexte` (options Playwright : `permissions`,
`geolocation`, `reducedMotion`, `offline`…), `sansAides: false` (laisse paraître les aides
contextuelles « Compris », masquées par défaut), `moteur: "webkit"` (gabarit iPhone, sous-ensemble),
`pwa: true`, `premiereVisite: true`.

Identités fictives : `MOI` (Camille Audit) et `GENS` (`lea`, `malik`, `ines`, `tom`, `prive` —
compte privé —, `long` — nom très long). Socle de données commun : `outils/jeu/base.js`
(`peupler`, `ilYA(minutes)`, `dans(minutes)`). Médias fictifs : `media("photo-paysage.jpg")`,
`photo-portrait.jpg`, `photo-carre.jpg`, `photo-panorama.jpg`, `photo-haute.jpg`,
`photo-atelier.jpg`, `couverture.jpg`, `couverture-evenement.jpg`, `avatar-1..6.jpg`, `boucle.webm`.
Chaque domaine écrit SES données dans `outils/jeu/<domaine>.js` (les formes de lignes se lisent
dans les fonctions `supaLoad*` de `js/app-08-ui-modals-tour.js` et dans
`migrations/SCHEMA_PROD_REFERENCE.sql`). Un état purement local (conversations de
`localStorage["passio_conversations_v1"]`, brouillons, etc.) se pose par `stockage` ou par
`page.evaluate` après le boot.

Dans la page, les fonctions de l'application sont globales (`goTo('feed'|'profiles'|'studio'|
'explore'|'irl'|'messages')`, `openModal`, `state`, `MY_UID`…). ⚠️ `state`, `MY_UID`, `supa` sont
des `let` de portée script : ils se lisent par leur nom dans `page.evaluate`, PAS par `window.x`.

### 2.2 Réseau

Supabase : faux serveur (compte) ou projet vide (démo, visiteur). Tiers autorisés en lecture :
polices Google, tuiles OpenFreeMap, géocodage BAN/Photon. Les images d'exemple `/demo/u/…` sont
servies par la même fonction que la production (cache local). Les vidéos distantes sont remplacées
par `boucle.webm`. **Tout autre hôte est refusé** (GIF Klipy/Giphy compris : pour montrer le
sélecteur de GIF rempli, poser sa propre `page.route` qui répond des images locales, et le dire
dans la fiche : « simulé »). Les refus sont listés dans la fiche de capture (`reseauRefuse`).

### 2.3 Fichier de scénarios — `outils/scenarios/<domaine>.js`

```js
const base = require("../jeu/base");
module.exports = {
  domaine: "msg-conversation",            // = nom du fichier
  scenarios: [
    {
      nom: "conversation-1a1",
      demarrage: { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); /* + données du domaine */ } },
      vues: ["m390", "m360"],             // gabarits : m320 m360 m390 m430 t768 d1440
      async derouler({ page, prendre, banc, serveur, MOI, GENS, media, vue }) {
        await page.evaluate(() => goTo("messages"));
        await page.locator("text=Léa Fontaine").first().click();      // un VRAI geste quand c'est possible
        await prendre({
          id: "MSG-101",
          titre: "Conversation 1:1 — fil normal",
          zooms: [{ nom: "saisie", titre: "Champ de saisie", sel: "#convFpComposer", marge: 8 }],
          annotationsAvant: [{ n: 1, sel: "#convFpSend", texte: "Bouton d'envoi de 36 px" }],
          apres: {
            css: `#convFpSend{ min-width:44px; min-height:44px; }`,     // feuille de style de maquette
            js: async (page) => { /* option : retouches du DOM par page.evaluate */ },
          },
          annotations: [{ n: 1, sel: "#convFpSend", texte: "Cible portée à 44 px" }],  // posées sur l'APRÈS
          seulement: ["m390"],            // option : ne capturer cet identifiant que sur ces gabarits
        });
      },
    },
  ],
};
```

- `prendre()` enregistre : capture AVANT (fenêtre visible, densité 2), gros plans, mesures
  automatiques (§ 4), puis APRÈS si `apres` est donné. Une maquette `css` seule est appliquée puis
  retirée sur place. Une maquette avec `js` est capturée sur un **état rejoué à l'identique**
  (le scénario est relancé jusqu'à ce `prendre`) : elle ne pollue donc jamais la suite du parcours.
  Conséquence : `derouler` doit être DÉTERMINISTE (mêmes gestes → même écran).
- Un même scénario enchaîne plusieurs `prendre` : c'est ainsi qu'on déroule un PARCOURS.
- Aides : `banc.appuiLong(page, sel, ms)` et `banc.appuiMaintenu(page, sel)` (appui tactile réel,
  avec `.glisser(dx,dy)` puis `.relacher()`), `banc.simulerClavier(page, 300)` (réduit la fenêtre
  comme un clavier virtuel ; rend la fonction de restitution), `banc.parcoursClavier(page, n)`,
  `banc.stabiliser(page, ms)`.
- Défilement : la zone qui défile est `#appMain` (pas le document) ; pour une modale, son contenu.
- Un échec de scénario enregistre l'écran dans `donnees/echecs/` : le regarder avant de corriger.
- **L'AVANT n'est jamais retouché ni inventé.** Si une surface ne peut pas être atteinte, elle
  reste « avant non capturé » dans le registre, avec la raison.

## 3. Méthode attendue pour chaque domaine

1. **Lire** la fiche de journal et les fiches lots-ui du domaine, puis le code (rendu, portes
   d'entrée, conditions d'apparition). Chercher TOUTES les surfaces : écrans, onglets, sous-onglets,
   menus, modales (`openModal(`), feuilles basses, panneaux, sélecteurs, états vides, chargements,
   erreurs, confirmations, toasts, badges, variantes par rôle (propriétaire / autre / visiteur).
2. **Explorer dans le navigateur** (sonde) : atteindre chaque surface par de vrais gestes ; quand ce
   n'est pas possible, forcer l'état (appel de fonction, données injectées) et le déclarer « simulé ».
3. **Exercer les états difficiles** pertinents du domaine : vide / normal / volumineux ; noms longs,
   bio multiligne, textes très longs ; média absent, lent, en échec ; hors ligne
   (`context.setOffline(true)`) puis reconnexion ; permission refusée ; clavier ouvert
   (`banc.simulerClavier`) ; modale au-dessus d'un écran déjà défilé ; double appui / action
   répétée ; retour après interruption (rechargement de la page en cours de saisie) ; lien profond
   valide, absent, interdit ; propriétaire vs autre ; public / privé / bloqué ; visiteur vs connecté.
   Regarder les SUPERPOSITIONS : z-index, clics interceptés (`document.elementFromPoint`), commandes
   cachées sous le clavier ou la barre basse.
4. **Gabarits** : `m390` partout ; `m360` (petit écran) pour chaque écran principal et chaque
   surface de saisie ; `m320` si un débordement est suspecté ; `t768` et `d1440` pour les écrans
   principaux du domaine. Tous sont des ÉMULATIONS Chromium (aucun véritable appareil) — le dire.
5. **Juger** avec la grille du § 5, **mesurer** dès que possible, séparer observation / jugement /
   hypothèse.
6. **Proposer et maquetter** : pour chaque écran, sous-onglet et état visuellement distinct qui
   porte un constat, un APRÈS rendu (maquette `css`/`js`), annoté, avec gros plan sur les petits
   détails. Un composant strictement identique sur plusieurs surfaces se maquette une fois, en
   citant toutes ses occurrences. **Ne pas forcer un changement** : ce qui fonctionne reçoit le
   verdict « à conserver » avec sa justification.
7. **Recroiser** avant de rendre : chaque surface inventoriée a un statut et un verdict ; chaque
   constat cite ses surfaces et ses visuels ; les compteurs du rapport sont exacts.

## 4. Mesures automatiques (fiche `donnees/captures/<domaine>/<id>--<vue>.json`)

`mesures.cibles.sous44` (zone tactile sondée par `elementFromPoint`), `mesures.champs.sous16`,
`mesures.contraste.sousSeuil` (ratio, couleurs, taille), `mesures.sansNom`,
`mesures.champsSansEtiquette`, `mesures.debordement`, `mesures.tronques`, plus `erreurs.js`
(erreurs JavaScript de la page) et `ecran` (écran actif, modale ouverte).
⚠️ Ce sont des INDICES à vérifier à l'œil : une cible « en ligne » (`enLigne: true`) n'est pas
un bouton ; un contraste sur image n'est pas jugé ; une opacité d'ancêtre n'est pas composée.
Citer la mesure exacte dans la preuve du constat (« 36 × 36 px », « 3,2:1 sur #F7F5FC »).

## 5. Grille de jugement (pour chaque surface)

Compréhension · Hiérarchie · Densité · Lisibilité · Cohérence (mêmes mots, icônes, comportements) ·
Confort tactile (44 px, une main) · Saisie (libellés, clavier adapté `inputmode`/`type`, validation,
conservation) · Feedback (en cours / réussi / refusé) · Récupération (annuler, corriger, brouillon) ·
Navigation (retour, fermeture, historique, position de défilement) · Accessibilité (clavier, focus
visible, noms accessibles, zoom, mouvement réduit) · Confiance (destinataire, visibilité,
confidentialité, conséquences) · Fluidité perçue (sauts, délais, clignotements) · Utilité produit
(Découvrir / Partager / Rencontrer).

### Charte des propositions (les APRÈS)

- Simplifier, clarifier, réorganiser AVANT d'ajouter. Pas de nouvelle fonctionnalité pour compenser
  une interface confuse. Ne jamais présenter une fonction hypothétique comme existante.
- Rester dans l'identité actuelle : variables CSS existantes, rayons, Manrope pour les titres,
  cartes blanches sur fond lavande ; corail réservé à l'IRL ; pas de mode sombre.
- Une action principale par écran, visiblement prioritaire ; les actions destructrices séparées et
  confirmées ; mêmes mots et mêmes icônes pour une même action dans toute l'application.
- Cibles ≥ 44 px, champs ≥ 16 px, contrastes AA, focus visible, libellés accessibles.
- Toute proposition qui touche à l'authentification, aux droits, aux données privées ou à une règle
  métier est marquée `sensible: true` et conserve les garde-fous existants.
- Aucune nouvelle collecte de données personnelles.

## 6. Contrat de sortie (fichiers du domaine — et eux seuls)

| Fichier | Contenu |
|---|---|
| `outils/scenarios/<domaine>.js` | scénarios de capture |
| `outils/jeu/<domaine>.js` | données fictives du domaine (si besoin) |
| `outils/sondes/<domaine>-*.js` | scripts d'exploration gardés comme preuve (facultatif) |
| `captures/<domaine>/…` et `donnees/captures/<domaine>/…` | produits par `capturer.js` |
| `donnees/domaines/<domaine>.json` | registre + constats (schéma ci-dessous) |
| `rapports/<domaine>.md` | rapport détaillé du domaine |

### 6.1 `donnees/domaines/<domaine>.json`

```json
{
  "domaine": "msg-conversation",
  "groupe": "Messagerie",
  "titre": "Messagerie — conversation",
  "resume": "4 à 8 phrases : ce qui marche, ce qui gêne, l'enjeu pour Découvrir/Partager/Rencontrer.",
  "aConserver": ["Ce qui fonctionne bien et doit rester (phrases courtes, concrètes)."],
  "registre": [
    {
      "id": "MSG-101",
      "surface": "Conversation 1:1",
      "composant": "Fil de messages",
      "etat": "contenu normal",
      "role": "connecté · participant",
      "geste": "Messages → toucher une conversation",
      "observation": "observe",
      "preuve": "capture MSG-101 (m390, m360) ; rendu : js/app-04-comments-shop.js:6120",
      "problemes": ["MSG-C51", "MSG-C52"],
      "proposition": "Une phrase : ce que change l'après.",
      "visuel": "avant-apres",
      "verdict": "a-ameliorer",
      "justification": "Une phrase."
    }
  ],
  "constats": [
    {
      "id": "MSG-C51",
      "titre": "Le bouton d'envoi fait 36 px",
      "emplacement": "Conversation › champ de saisie — #convFpSend (styles.css:8123, js/app-04…:6410)",
      "surfaces": ["MSG-101", "MSG-104"],
      "type": "observation",
      "nature": "accessibilite",
      "preuve": "Mesure : 36 × 36 px (fiche MSG-101--m390, mesures.cibles.sous44).",
      "probleme": "Ce que la personne rencontre.",
      "declencheur": "Dans quelle situation.",
      "consequence": "Conséquence concrète pour l'utilisateur.",
      "proposition": "Ce qui est recommandé, précisément.",
      "visuels": ["MSG-101"],
      "priorite": "P2",
      "gravite": 2,
      "effort": "S",
      "risqueTechnique": "faible",
      "dependances": "Aucune.",
      "risqueRegression": "Ce qui pourrait casser, verrous e2e concernés.",
      "critereAcceptation": "Observable et vérifiable : « à 360 px, #convFpSend mesure ≥ 44 × 44 px ».",
      "fichiers": ["styles.css", "js/app-04-comments-shop.js"],
      "sensible": false
    }
  ]
}
```

Valeurs fermées :
- `observation` : `observe` (atteint par de vrais gestes dans le navigateur du banc) · `simule`
  (état forcé : fonction appelée, données injectées, clavier/hors-ligne émulés — dire comment dans
  `preuve`) · `code` (identifié dans le code, non rendu) · `inaccessible` (non vérifiable ici :
  dire pourquoi — véritable appareil, deux appareils, caméra, push…) · `sans-objet`.
- `visuel` : `avant-apres` · `avant` (capture sans maquette) · `aucun` (avant non capturé).
- `verdict` : `a-ameliorer` · `a-conserver` · `a-verifier` (hypothèse à confirmer auprès
  d'utilisateurs ou sur appareil réel). TOUTE ligne du registre a un verdict et une justification.
- `type` : `observation` (fait constaté, mesuré ou capturé) · `jugement` (avis ergonomique argumenté)
  · `hypothese` (à vérifier auprès d'utilisateurs — ne jamais la présenter comme un fait).
- `nature` : `fonctionnel` · `friction` · `clarte` · `accessibilite` · `polish`.
- `priorite` : `P0` parcours bloqué ou conséquence grave · `P1` friction importante sur un parcours
  essentiel · `P2` amélioration significative du confort · `P3` finition et cohérence.
- `gravite` (du problème, 1 à 4) est DISTINCTE de `risqueTechnique` (`faible`|`moyen`|`eleve`) et
  de `effort` (`S` < 1 j · `M` 1–3 j · `L` > 3 j). Ne jamais chiffrer un gain de temps ou de
  conversion comme un résultat mesuré.
- Identifiants : surfaces `XXX-NNN`, constats `XXX-CNN` (préfixe et plage donnés dans l'ordre de
  mission). L'`id` d'une ligne du registre est celui de sa capture quand elle en a une.
- Le JSON doit être VALIDE (`node -e "JSON.parse(require('fs').readFileSync('…','utf8'))"`).

### 6.2 `rapports/<domaine>.md` (français, concret, sans remplissage)

1. Périmètre et méthode (ce qui a été lu, ce qui a été ouvert, gabarits, modes, limites).
2. Cartographie du domaine (surfaces, portes d'entrée, conditions d'apparition, fichiers).
3. Parcours déroulés et états difficiles exercés (tableau : état → résultat observé).
4. Ce qui fonctionne et doit être conservé.
5. Constats détaillés par surface (renvoyer aux identifiants ; citer mesures et lignes de code).
6. Cohérence avec le reste de l'application (mots, icônes, comportements divergents repérés).
7. Ce qui n'a pas pu être vérifié, et comment le vérifier.
8. Compteurs : surfaces inventoriées / observées / simulées / code seul / inaccessibles /
   maquettées (avant-après) / à conserver / constats par priorité.

## 7. Honnêteté du livrable

- Ne jamais annoncer une couverture complète si une surface n'a pas été ouverte.
- Un comportement lu dans le code mais non vu s'écrit « d'après le code » ; un défaut vu une fois
  et non reproduit s'écrit ainsi.
- Si le banc lui-même déforme l'écran (image tierce refusée, vidéo remplacée, temps réel coupé),
  le dire dans la preuve : ce n'est pas un défaut du produit.
- Un défaut qui touche à la sécurité ou à la vie privée (fuite, contournement) : le décrire
  sobrement dans le rapport sous une rubrique « Sensible », sans mode opératoire détaillé.
