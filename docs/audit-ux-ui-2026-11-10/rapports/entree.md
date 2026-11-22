# Entrée et navigation — première visite, inscription, barres

> Domaine `entree` · surfaces `ENT-001…051` · constats `ENT-C01…C19` · code audité : `main@4e1d8ed1`.
> Données : `donnees/domaines/entree.json` (construit par `outils/sondes/entree-construire-json.js`) ·
> scénarios : `outils/scenarios/entree.js` · captures : `captures/entree/` · prototype : `prototypes/premiere-visite.html`.

## 1. Périmètre et méthode

- **Lu** : `js/first-run.js` (drapeau, carte de bienvenue, panneau de passions, porte de compte,
  repères, retour après compte), `js/app-02-state-utils.js` (`goTo`, `closeCurrentOverlay`,
  `popstate`, `toggleDevPanel`, `openAuthScreen`, `openAccountSwitch`, `switchAuthTab`, `onbDoAuth`,
  `_showResendConfirmation`, `ouvrirConsentementRequis`, `montrerHint`, fenêtrage du fil),
  `js/app-08-ui-modals-tour.js` (`showLanding`, `showTour`), `js/ui-v2-shell.js` (barre basse,
  feuille Créer), `js/access-gate.js`, `index.html` (landing, onboarding, barres), `styles.css`.
- **Ouvert dans le banc** (Chromium émulé, aucun appareil réel) : 5 sondes d'exploration
  (`outils/sondes/entree-01…05`) puis 15 scénarios de capture, 42 surfaces capturées, aucune
  erreur JavaScript relevée sur l'ensemble des fiches.
- **Modes** : `visiteur` (vraie première visite, drapeau actif par défaut), `visiteur` +
  `passio_first_run_experience_v1="0"` (parcours historique), `compte` (faux serveur, socle
  `jeu/base.js`), `compte` + `sansAides:false` (aides contextuelles).
- **Gabarits** : `m390` partout ; `m360` pour l'arrivée, le panneau de passions, la porte de compte,
  le formulaire, la barre de navigation, la feuille Créer et les Paramètres ; `m320` pour l'arrivée ;
  `t768` et `d1440` pour l'arrivée, la landing historique et la navigation connectée ; paysage
  844 × 390 par réduction de fenêtre.
- **Limites** : le banc refuse toute inscription / connexion (les refus affichés viennent du faux
  serveur, traduits par le code) ; Google OAuth et Turnstile sont des hôtes tiers refusés ; le temps
  réel est coupé (badges non exercés) ; le banc fige les animations (repères et toasts capturés à
  l'arrêt) ; **hors ligne, les routes du faux serveur répondent quand même** : le message capturé
  en ENT-042 est un artefact (voir § 7). Le fait transverse « les toasts sont peints sous les
  modales, feuilles et panneaux » (PAR-C03, IRL-C65, MSG-C85) n'a pas été refait.

## 2. Cartographie du domaine

| Zone | Portes d'entrée | Condition d'apparition | Fichiers |
|---|---|---|---|
| Première visite (fil de découverte, carte, panneau de passions, repères) | ouverture sans compte | drapeau actif (défaut) et aucun compte (`compteExistant()`) | js/first-run.js |
| Porte de compte « Crée ton compte pour… » (10 contextes) | aimer, commenter, suivre, message, publier, bobine, activité, rejoindre, signaler, préférences | visiteur ; variante « Reconnecte-toi » si session expirée | js/first-run.js:1440–1495 |
| Formulaire de compte (onglets Se connecter / Créer un compte) | porte de compte, carte, Paramètres › Compte, landing | `#onboarding.active` | index.html:239–483, app-02 |
| Étapes après compte (âge, nom, passions) | chemin Google (âge, nom), tous (passions) | `onbSteps`, sautées si déjà connues | app-02:5348–5420, 7497 |
| Consentement requis « Avant de continuer » | retour Google sans accord | `passio_consentement_requis_v1="1"` | app-02:5937–5990 |
| Landing + tour historiques | ouverture sans compte | drapeau coupé (`"0"`) | index.html:96–165, app-08:160, 360 |
| Rideau d'accès | toute ouverture | `passio_gate_actif="1"` (levé par défaut) | js/access-gate.js |
| Barre supérieure (logo → Profil, loupe, cloche, ⋯) | toujours | — | index.html:451–480 |
| Barre inférieure (Découvrir · Rencontrer · Créer · Messages · Profil), feuille Créer | toujours | lot UI-1 actif | js/ui-v2-shell.js |
| Panneau Paramètres | « ⋯ » | — | index.html:483+, app-02:3916 |
| Aides contextuelles « Compris » (4) | premier passage | compte, hors présentation | app-02:9005 |
| Retour système, rechargement, anciens liens | geste système | — | app-02:3638, 3757, 3871 |

## 3. Parcours déroulés et états difficiles

| État exercé | Résultat observé | Surface |
|---|---|---|
| Appareil vierge | Fil de découverte + carte de bienvenue, aucune landing | ENT-001 |
| Fermer la carte | Repère « Un Fil construit autour de tes passions » posé sur les envies | ENT-002 |
| Choisir 2 passions + 1 spécialité | « Voir mon fil (3) », passions en tête du fil, la carte disparaît | ENT-003–005 |
| Visiteur : Rencontrer, Messages, Profil, Studio | un repère à chaque premier passage ; Profil = faux « Mon profil » vide | ENT-006–009 |
| Visiteur : « ⋯ » | Paramètres avec « Démo » ; Échap et retour sans effet | ENT-010 |
| Studio › Publier (visiteur) | porte « Crée ton compte pour publier ta création » | ENT-012 |
| Formulaire de création, à vide | un seul refus (nom), en haut, sous la sortie flottante ; bouton d'envoi à 1 117 px | ENT-013–015 |
| Consentement non coché | refus sous la case + bandeau | ENT-016 |
| Année 2012 | refus 18+ clair | ENT-017 |
| Connexion refusée | « E-mail ou mot de passe incorrect. » | ENT-018 |
| Mot de passe oublié sans e-mail | consigne « entre ton adresse ci-dessus » | ENT-019 |
| Retour système dans le formulaire | formulaire maintenu, écran dessous changé | ENT-020 |
| E-mail non confirmé (simulé) | sortie « Renvoyer l'e-mail » sous les yeux, 44 px | ENT-021 |
| Quota d'e-mails (simulé) | refus rassurant | ENT-022 |
| Google sans accord (simulé) | « Avant de continuer », case 13 px | ENT-023 |
| Session expirée (simulé) | « Reconnecte-toi pour… » | ENT-024 |
| Drapeau coupé | landing (3 boutons pleins), formulaire sans retour, retour système = sortie du site | ENT-025–027 |
| Étapes âge / nom / passions (simulé) | champs moins équipés, « Ton prénom » | ENT-028–030 |
| Compte : feuille Créer + retour système | feuille maintenue, écran dessous changé | ENT-032 |
| Compte : Paramètres + Échap / retour | panneau maintenu | ENT-033 |
| Aides contextuelles | une seule à la fois, posée sur la photo | ENT-034 |
| Rechargement sur #messages | Fil affiché, adresse #messages | ENT-036 |
| Fil défilé → autre onglet → retour | position perdue (1 200 → 0 ; 900 → 0) | ENT-037 |
| Clavier, 14 tabulations | focus visible, pas d'évitement, barre basse non atteinte | ENT-038 |
| Paysage 844 × 390 | barres ≈ 129 px sur 390 | ENT-039 |
| Tour historique (simulé) | 5 étapes, boutons 29 px | ENT-040 |
| Rideau armé | code à 4 chiffres, liens légaux | ENT-041 |
| Hors ligne › Se connecter | artefact du banc (voir § 7) | ENT-042 |
| goTo('wallet' / 'cdv') | Profil / Fil, sans erreur | ENT-051 |

## 4. Ce qui fonctionne et doit être conservé

- L'**entrée directe** dans un fil vivant, les exemples marqués « Exemple PASSIO », la **carte de
  bienvenue** à une seule action principale (ENT-001).
- La **porte de compte** : titre qui nomme le geste interrompu, promesse « Tes passions et tes
  préférences seront conservées », et « Continuer à explorer » (ENT-012) — même logique en
  session expirée (ENT-024).
- Le **panneau de passions** (ENT-003, ENT-004).
- Les **refus d'authentification** traduits, justes et rassurants (ENT-016, ENT-017, ENT-021,
  ENT-022), dont la sortie « Renvoyer l'e-mail » toujours visible avec son refus.
- La **bascule de compte** qui dit la conséquence (ENT-035), les **anciens liens** redirigés (ENT-051).
- Zoom permis, champs en 16 px, contour de focus visible, hauteur mesurée (ENT-049).

## 5. Constats par surface

**Formulaire de compte** (P1) — ENT-C02 : six champs, une case et des aides avant le bouton,
placé à 1 117 px pour 844 ; erreurs une à une, en haut, champ non désigné. Proposition maquettée
(ENT-013 après) : **deux étapes** — l'accès d'abord (bouton visible sans défiler), le nom public et
l'année ensuite, contrôle 18+ inchangé. ENT-C01 : le retour système ne ferme pas le formulaire
(première visite : il navigue dessous ; parcours historique : il quitte PASSIO). ENT-C03 : la
sortie flottante recouvre le refus (maquette ENT-015 : barre fixe + erreur sous le champ).
ENT-C11 : onglets 35 px ; « Mot de passe oublié ? » et « Renvoyer l'e-mail » sont des `span`
inatteignables au clavier. ENT-C18 (hypothèse) : hors ligne, le message pourrait être faux ou
anglais. *Sensible* : C01, C02, C11, C16, C18, C19 touchent à l'authentification, à l'âge ou au
consentement ; les propositions conservent tous les garde-fous (18+ bloquant, accord explicite).

**Profil d'un visiteur** (P1) — ENT-C04 : « Mon profil », 0 abonné, crayon, « Créer un post », sans
porte vers le compte ; le logo y mène aussi. Maquette ENT-008 : carte « Ton profil t'attend ».

**Repères** (P2) — ENT-C05 : jusqu'à neuf bulles (trois d'étapes, trois d'écran, trois au geste),
chacune posée sur sa cible. Maquettes ENT-002 et ENT-006 : bulle posée au-dessus de la barre basse.
ENT-C15 : après le choix des passions, rien ne dit qu'il ne vit que sur l'appareil. ENT-C14 : aide
« Compris » posée sur la photo, « sa Passio ».

**Superpositions et retour système** (P2) — ENT-C06 : Paramètres sans croix ni fond, insensible à
Échap et au retour ; déconnexion et suppression collées (33 px) ; « Démo » public (maquette ENT-033 ;
contenu du panneau : MSG-C17). ENT-C07 : feuille Créer ignorée par le retour (même famille que
MSG-C73, BOB-C12). Les trois (C01, C06, C07) appellent un même correctif : un registre des
superpositions lu par `closeCurrentOverlay`.

**Navigation d'écran** (P2) — ENT-C09 : rechargement sur #messages → Fil sous l'adresse #messages.
ENT-C10 : la position du fil est remise à zéro à chaque changement d'onglet (`scrollTop = 0`,
restauration réservée au fenêtrage, inactif par défaut). Retour depuis une conversation : PCS-C02.

**Accessibilité de la navigation** (P3) — ENT-C12 : pas de lien d'évitement, barre basse au bout du
fil dans l'ordre de tabulation (voir aussi SOC-C02). Cibles de la barre supérieure : SOC-C01.

**Cadrage** (P3) — ENT-C17 (hypothèse) : en paysage, les deux barres prennent un tiers de la
hauteur. Tablette et ordinateur : SOC-C03 (colonne de 440 px au milieu du vide, confirmée en
ENT-001 / ENT-025 / ENT-031 à 768 et 1440).

**Parcours historique** (P3) — ENT-C13 : landing à trois boutons pleins, piliers tronqués, tour de
cinq cartes à boutons de 29 px (maquette ENT-025). ENT-C19 : étapes Google « Ton prénom », champ
d'année sans `inputmode`. ENT-C16 : « Avant de continuer », case de 13 px et croix trompeuse.

## 6. Cohérence avec le reste de l'application — vocabulaire de navigation

| Mot | Où on le lit | Ce qu'il désigne | Proposition |
|---|---|---|---|
| **Explorer** | loupe (nom accessible, infobulle) ; titre « Explorer par passion » ; envie du Fil | la recherche **et** un filtre « hors de mes passions » | loupe et écran : **Rechercher** ; envie : **Nouveau pour toi** |
| **Rencontrer** | onglet de la barre ; envie du Fil ; valeur de mood au Studio ; pastille des cartes | l'écran des activités **et** une forme de publication | onglet **Rencontrer** ; envie et pastille : **Rendez-vous** |
| **Découvrir / Fil** | onglet « Découvrir » ; ancienne barre « Fil » ; repères « Un Fil construit… » ; « Voir mon fil » | le même écran | un seul nom : **Découvrir** (le « fil » reste un nom commun) |
| **envie / mood / humeur** | rail du Fil (« Ton envie du moment ») ; Studio « Mood » ; landing « Choisis ton humeur » | la même notion | **envie** partout |
| **publication / post / Passio** | feuille « Publication » ; profil « Créer un post » ; fil « Publier une Passio » | une publication | **publication** partout (PAR-C09) |
| **profil / Passio** | aide « découvrir sa Passio » | le profil d'une personne | **profil** |
| **Nom d'utilisateur / prénom / pseudo** | formulaire e-mail ; étape Google « Ton prénom » ; tour « Un seul pseudo » | le nom public | **nom public** |
| **Paramètres / ⋯** | icône « ⋯ » nommée « Paramètres » | un panneau de réglages et de comptes | icône engrenage ou libellé visible |
| **Créer / Studio de création** | onglet « Créer » ; titre « Studio de création » | le même geste | garder « Créer » ; titre « Nouvelle publication » |

Icônes : la barre basse utilise des SVG `currentColor` (conforme) ; la barre supérieure aussi ; le
« ⋯ » est un caractère. Comportements divergents : Échap ferme la feuille Créer mais pas les
Paramètres ; le retour système ferme les modales mais ni le formulaire de compte, ni la feuille
Créer, ni les Paramètres.

## 7. Ce qui n'a pas pu être vérifié

- **Hors ligne** (ENT-042) : le banc répond même hors ligne ; le vrai message est à vérifier en mode
  avion sur téléphone (ENT-C18).
- **Google OAuth, Turnstile** (ENT-043, ENT-044) : hôtes tiers refusés ; mesurer sur appareil la
  position du bouton d'envoi avec le captcha affiché.
- **Retour après inscription** (ENT-046) et reprise d'une inscription interrompue (ENT-045) : le
  banc refuse toute inscription ; voir PAR-C02, et le prototype `premiere-visite.html` pour le
  comportement proposé.
- **Badges** (ENT-050) : temps réel coupé.
- Tous les gabarits sont des émulations Chromium ; paysage et clavier virtuel sont simulés.

## 8. Compteurs

- Surfaces inventoriées : **51** — observées 30 · simulées 13 · code seul 6 · inaccessibles 2.
- Visuels : avant-après **10** · avant seul 32 · aucun 9.
- Verdicts : à conserver **16** · à améliorer 27 · à vérifier 8.
- Constats : **19** — P0 0 · P1 3 (ENT-C01, C02, C04) · P2 10 · P3 6.
