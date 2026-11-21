# Mission — TRANSVERSE

- Clé de domaine : `transverse` · Groupe : `Transverse`
- Identifiants : surfaces `TRA-001…` ; constats `TRA-C01…`
- Hors périmètre : la connexion et l'inscription (`entree`), la liste des bloqués vue depuis la
  messagerie (`msg-liste` — tu la traites depuis les réglages).

## Périmètre

- **Notifications** : cloche et pastille, panneau (`openNotifications` app-08:2383), chaque type de
  notification (j'aime, commentaire, mention, abonnement, demande d'abonnement, acceptation,
  message, activité : inscription / rappel / place libérée / annulation…), regroupement, lu / non
  lu, « tout marquer comme lu », destination d'un appui (`openNotifTarget` app-08:2470 : arrive-t-on
  au bon endroit ? contenu supprimé ?), liste vide, longue liste ; réglages des notifications
  (`openNotifSettings` app-02:3994) ; demande de permission de notifications poussées (quand
  apparaît-elle ? refus ? `passio_rappels_push_v1`) — la réception réelle d'une notification
  poussée est « inaccessible » ici.
- **Réglages** : panneau ouvert par le « ⋯ » de la barre supérieure (`toggleDevPanel()`,
  `#devPanel` dans `index.html` l.484–600 — nommé « dev » dans le code, « Paramètres » à l'écran) :
  inventorie CHAQUE entrée et sous-écran — compte (`majSectionCompte`), confidentialité et compte
  privé (`openPrivacySettings` app-02:4018), contenu (`openContentSettings` app-02:4241), temps
  d'écran (`openScreenTime` app-02:4267), mode pause (`openPauseMode` app-02:4448), configurateur
  (`openConfigurator` app-05:185), comptes bloqués (`openBlockedList` app-04:5432), changement de
  mot de passe (`openChangePassword` app-02:5003), déconnexion (`openLogoutConfirm` app-02:4489),
  suppression du compte (`openDeleteAccountConfirm` app-02:5125 — confirmations, délai,
  réversibilité, export des données), « Limites du pilote » (`openLimitesPilote` app-08:286),
  section « Démo », réinitialisation (`resetApp` — dialogue natif `confirm()`), à propos
  (`openAbout` app-02:4467), partage de l'application (porte seulement).
- **Aide et légal** : CGU (`openTermsOfService` app-02:5321), politique de confidentialité
  (`openPrivacyPolicy` app-02:5313), mentions légales (`openLegalNotice` app-02:5332) — longueur,
  lisibilité, navigation, version ; aide, contact, signalement d'un problème.
- **Signalement et blocage** : signaler une publication, un commentaire, un message, un profil,
  une activité (motifs, confirmation, feedback, suite donnée), bloquer / débloquer, effet visible
  d'un blocage. Dresse le TABLEAU de toutes les portes de signalement et de leur cohérence.
- **Permissions** : caméra, micro, géolocalisation, notifications — le moment de la demande, la
  phrase qui l'explique, le refus et la sortie proposée.
- **PWA** : invite d'installation (`pwaInstall`, `#btn-install-app`, `demarrage.pwa: true`),
  bandeau de mise à jour, hors ligne (`context.setOffline(true)` : bandeau ? actions refusées ?
  file d'attente ?) puis reconnexion, bandeau distant (`passio_bandeau_distant_ferme`), page
  rechargée hors ligne (service worker bloqué par le banc : « inaccessible », d'après le code).
- **Composants transverses** : toasts (`toast()` — 362 appels littéraux recensés dans
  `donnees/inventaire-code.json` : ton, longueur, durée, empilement, position au-dessus de la barre
  basse et du clavier, types info / succès / erreur / avertissement), dialogues NATIFS restants
  (8 `confirm()` et 4 `prompt()`, listés dans `donnees/inventaire-code.json`), pastilles et badges,
  infobulles, boutons « … », croix de fermeture (taille, position, double croix), listes
  déroulantes, états de chargement (squelettes ? rotations ?), messages d'erreur génériques,
  modale `openModal` (app-08:32 : n'empile pas, fermeture au fond, Échap, piège de focus, titre
  accessible), vocabulaire (un même geste porte-t-il le même mot partout ?).

## Points d'entrée dans le code

`js/app-02-state-utils.js` (réglages ~3990–5340, `toast`), `js/app-08-ui-modals-tour.js`
(`openModal`, notifications ~2329–2680, `supaLoadNotifications` ~9161), `js/app-09-boot-pwa.js`
(PWA, hors ligne), `js/app-04-comments-shop.js` (signalement, blocage), `js/legal-textes.js`,
`js/reglages-distants.js`, `sw.js`, `index.html`, `styles.css`. Fiches :
`docs/journal/social-messagerie.md` (notifications), `docs/journal/comptes-inscription-legal.md`,
`docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md`, `docs/CGU_ET_MENTIONS_LEGALES.md`,
`docs/PIEGES_CONNUS.md` (divers). Données fictives dans `outils/jeu/transverse.js` (table
`notifications` : une de chaque `kind`, lues et non lues ; `blocks`).
