# Mission — ENTRÉE ET NAVIGATION

- Clé de domaine : `entree` · Groupe : `Entrée et navigation`
- Identifiants : surfaces `ENT-001…` ; constats `ENT-C01…`
- Hors périmètre : l'arrivée par un lien de PARTAGE ou d'invitation (`partage`), les réglages du
  compte, les textes légaux lus hors inscription et l'invite d'installation PWA (`transverse`).

## Périmètre

- **Première visite** (mode `visiteur`, `js/first-run.js`, actif par défaut) : entrée directe dans
  le fil de découverte, carte de bienvenue, ce qu'un visiteur peut faire et ce qui déclenche la
  demande de compte, retour d'un visiteur (préférences `passio_first_run_v1`), puis l'ancien
  parcours sous `passio_first_run_experience_v1="0"` : landing (`#landing`, `showLanding`
  app-08:360, `showPitchLanding` app-08:2677), ses piliers, ses deux boutons de même poids
  « Se connecter » / « Créer un compte », pied collant.
- **Inscription et connexion** (`openAuthScreen` app-02:4551 ; `#onboarding` dans `index.html`
  l.239–483, `showOnbStep` app-02:5348) : chaque étape (e-mail / mot de passe, Google, année de
  naissance et majorité 18+, prénom / nom de compte, choix des passions, « Entrer sur PASSIO »),
  libellés, types de clavier (`type`, `inputmode`, `autocomplete`), affichage du mot de passe,
  erreurs (e-mail invalide, mot de passe faible, compte existant, mauvais identifiants, hors ligne),
  consentements CGU (`ouvrirConsentementRequis` app-02:5958, « Avant de continuer »), vérification
  anti-robot (Turnstile — hôte tiers refusé par le banc : à dire), e-mail de confirmation en attente
  (« Ton compte attend… », renvoi du lien : un refus montre-t-il TOUJOURS sa sortie ?),
  récupération d'accès / mot de passe oublié, moins de 18 ans, reprise d'un parcours interrompu
  (fermeture puis retour, rechargement en cours d'inscription, `passio_signup_pending`,
  `passio_auth_intent_v1`), bascule de compte (`openAccountSwitch` app-02:4609).
  ⚠️ Rien ne doit partir : le banc refuse toute inscription (réponse 422 « banc_projet_vide » en
  mode visiteur). Observe les écrans et les ERREURS ; pour l'état « connecté », utilise le mode
  `compte`.
- **Tutoriel et aides** : tour guidé (`showTour` app-08:160, `#tourOverlay`), aides contextuelles
  « Compris » (`montrerHint` app-02:9005, quatre aides : `demarrage.sansAides: false`) — une seule
  à la fois ? masquent-elles du contenu ? se ferment-elles ?
- **Navigation principale** (lot UI-1/UI-2 `js/ui-v2-shell.js`) : barre supérieure (logo → profil,
  loupe, cloche, « ⋯ » qui ouvre `toggleDevPanel()` sous le nom « Paramètres »), barre inférieure
  (Découvrir · Rencontrer · Créer · Messages · Profil : libellés, état actif, badges, zone sûre),
  cohérence des noms entre onglet, titre d'écran et vocabulaire (« Découvrir » / « Fil » /
  « Explorer » / « Rechercher » ; « Rencontrer » / « IRL »), feuille « Créer », retour système et
  historique (`closeCurrentOverlay`, un seul geste d'historique à la fois), fermeture des
  superpositions (croix, fond, Échap, glisser), conservation de la position de défilement au
  retour, rechargement sur un écran profond (`#messages`, `#irl`), anciens liens
  (`goTo('wallet'|'shop'|'cdv')` redirigés).
- **Cadrage** : hauteur mesurée (`--app-vh`), zones sûres, petit écran (`m320`, `m360`), tablette
  et ordinateur (colonne de 440 px : que devient l'espace restant ?), orientation paysage
  (viewport 844×390), zoom du navigateur.
- **Clavier et lecteur d'écran** : ordre de tabulation des barres, focus visible, lien d'évitement,
  rôles (`role="button"` sur des `div`), noms accessibles.

## Points d'entrée dans le code

`index.html` (landing l.96–165, onboarding l.239–483, barres), `js/first-run.js`,
`js/app-02-state-utils.js` (auth, onboarding, `goTo`), `js/app-08-ui-modals-tour.js` (`boot`,
modales, tour, landing), `js/ui-v2-shell.js`, `js/access-gate.js` (rideau levé par défaut, armé
par `localStorage.passio_gate_actif="1"` : à capturer comme état conditionnel), `js/platform.js`,
`js/legal-textes.js`, `styles.css`. Fiches : `docs/journal/comptes-inscription-legal.md`,
`docs/lots-ui/` 01, 03, `docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md`,
`docs/CONFIRMATION_EMAIL.md`, `docs/ADMISSION_18_PLUS.md`, `tests/e2e/first-run.spec.js`,
`first-run-helper.js`, `historique-retour-en-vol.spec.js`, `cadrage.spec.js`.
