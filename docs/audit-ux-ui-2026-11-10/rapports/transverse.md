# Transverse — réglages, notifications, signalement, hors ligne, composants partagés

> Domaine `transverse` · surfaces `TRA-001…` · constats `TRA-C01…C29`
> Registre et constats : `donnees/domaines/transverse.json` (construit par `outils/sondes/transverse-construire-json.js`).
> Captures : `captures/transverse/` ; scénarios : `outils/scenarios/transverse.js` ; données fictives : `outils/jeu/transverse.js`.

## 1. Périmètre et méthode

**Lu** : `index.html` (panneau `#devPanel` l. 484-599, `#offlineBanner`, `#modalBackdrop`, `#toastStack`) ; `js/app-02-state-utils.js` (toast l. 3324, panneau et réglages l. 3916-5340) ; `js/app-08-ui-modals-tour.js` (openModal l. 32, notifications l. 2100-2556, `supaInsertNotif` l. 7252, `supaLoadNotifications` l. 9161) ; `js/app-04-comments-shop.js` (blocage et signalement l. 5140-5440, 2970, 6371) ; `js/app-05-config-profil.js` (configurateur l. 1-260, permission de notifications l. 1700) ; `js/app-07-ia-explore-irl.js` (rappels l. 4683-5011, reportEvent l. 6940) ; `js/app-09-boot-pwa.js` (installation, hors ligne l. 1-275) ; `js/reglages-distants.js` ; `donnees/inventaire-code.json` (362 toasts, 8 `confirm()`, 4 `prompt()`) ; les registres des autres domaines (pour la synthèse).

**Ouvert dans le banc** : mode `compte` (faux serveur) pour tout, mode `visiteur` pour l'installation. Sondes gardées comme preuve : `outils/sondes/transverse-01…06`. Gabarits : `m390` partout ; `m360` pour le panneau, les sections, les réglages de saisie, les notifications, les toasts, le hors-ligne ; `t768` et `d1440` pour le panneau Paramètres et le panneau Notifications. Tous sont des émulations Chromium (aucun appareil réel).

**Conventions de capture** : les toasts sont FIGÉS par le banc (animation de sortie et retrait suspendus) — sans cela `animations: "disabled"` les fait disparaître de l'image. Un toast peint sous une superposition reste invisible : c'est ce qu'on mesure. La mesure de recouvrement lève `pointer-events` le temps de l'appel, car `elementFromPoint` ignore un élément en `pointer-events:none`. Hors ligne : `context.setOffline(true)` n'atteint pas le faux serveur, d'où un refus explicite des requêtes Supabase et l'événement `offline`. Bandeau distant : module inerte en local, réactivé (`window.PASSIO_REGLAGES_DISTANTS`) et réponse servie par le banc. Boîtes natives : non capturables ; leurs textes viennent de l'inventaire du code.

**Limites** : réception d'une notification poussée, page rechargée hors ligne (service worker bloqué par le banc), invite d'installation native (`beforeinstallprompt` non émis par Chromium de Playwright) — voir § 7.

## 2. Cartographie

| Zone | Porte | Surfaces | Code |
|---|---|---|---|
| Paramètres | « ⋯ » de la barre (34 × 34 px, `aria-label` « Paramètres ») | TRA-001…006 ; 5 sections, 23 entrées + 2 boutons de zone danger | index.html:484 ; toggleDevPanel app-02:3916 |
| Compte | Paramètres › Compte | Mon profil, Modifier le profil, Changer mon mot de passe (TRA-019), Se connecter avec un autre compte (TRA-079), Voir l'onboarding ; Se déconnecter (TRA-026), Supprimer mon compte (TRA-027) | app-02:4489, 5003, 5125 |
| Personnalisation | Paramètres › Personnalisation | Apparence & thème (TRA-014/015/055), Notifications (TRA-010), Confidentialité (TRA-011, export TRA-080), Comptes bloqués (TRA-012), Contenu & feed (TRA-013), Mes passions / Revoir les repères (première visite) | app-05:185 ; app-02:3994-4265 ; app-04:5432 |
| Bien-être | Paramètres › Bien-être digital | Temps d'écran (TRA-016, code parental TRA-081), Mode pause (TRA-017/018) | app-02:4267-4465 |
| Support | Paramètres › Support | Feedback & aide (TRA-020), Limites du pilote (TRA-021), Politique (TRA-022), CGU (TRA-023), Mentions (TRA-024), À propos (TRA-025), Inviter des amis (TRA-078) | app-08:269, 286 ; app-02:4467, 5313-5340 |
| Démo | Paramètres › Démo | Afficher le pitch, Tour démo (TRA-006) ; « Passions illimitées » réservé à l'éditeur | index.html:558 |
| Notifications | Cloche (pastille) | TRA-030…036 ; destinations (TRA-033/034) | app-08:2100-2556 |
| Toasts | partout | TRA-040…043, TRA-072, TRA-075 | app-02:3324 ; styles.css:1468-1556 |
| Signalement | 7 portes (tableau ci-dessous) | TRA-050…053, TRA-082 | app-04, app-07, app-08, app-09 |
| Permissions | rappels d'activité, 1re conversation | TRA-076, TRA-077 | app-07:4985 ; app-05:1700 |
| PWA / réseau | installation, hors ligne, bandeau distant, mise à jour | TRA-060…065, TRA-070/071/072 | app-09 ; reglages-distants.js |
| Dialogues natifs | 8 `confirm()`, 4 `prompt()` | TRA-073, TRA-074 | inventaire-code.json |

### Portes de signalement

| Objet | Porte | Libellé de la porte | Fenêtre de motif | Réponse si envoyé | Réponse si échec |
|---|---|---|---|---|---|
| Publication | « ⋯ » de la carte (app-04:40) | 🚩 Signaler cette publication | Signaler cette publication | Publication signalée. Merci, on s'en occupe. | Signalement déjà envoyé, ou impossible pour le moment. |
| Commentaire | menu du commentaire (app-04:2439) | ⚠️ Signaler | Signaler ce commentaire | Commentaire signalé. Merci, on s'en occupe. | idem |
| Compte | ⋯ du profil (app-04:4677), réglages de conversation (app-09:1698) | Signaler / Signaler (conversation) | Signaler ce compte (remplace le plein écran — PRO-C22) | 🚩 Signalement envoyé. Notre équipe va vérifier. | idem |
| Message | appui long (app-04:6359) | 🚩 Signaler ce message | Signaler ce message | 🚩 Message signalé. Notre équipe va vérifier. | idem |
| Story | « ⋯ » du lecteur (app-08:1950) | 🚩 Signaler cette story | Signaler cette story | Story signalée. Merci, on s'en occupe. | idem |
| Activité | bas de fiche (app-07:4512) — **recouvert par le pied collant** (TRA-C17) | Signaler cet événement | Signaler cette **rencontre** | Signalement envoyé — merci | idem |
| Passion | lien en bas de fiche passion (app-07:436) | Signaler cette passion (lien 11,5 px) | **aucune** (envoi immédiat) | 🚩 « X » signalée. On vérifie. | même phrase, type info |
| Bobine | — | **aucune porte** (BOB-C04) | — | — | — |

Toutes les portes avec motif exigent 3 caractères, ferment proprement et déposent un accusé « Signalement reçu — tu seras informé·e de la décision ici » dans la cloche (bon). Les visiteurs sont arrêtés par `requireAuthentication("signaler")` avant l'écriture.

## 3. Parcours déroulés et états difficiles

| État | Résultat observé |
|---|---|
| Panneau ouvert, chaque section dépliée (m390, m360, t768, d1440) | 33 px / 12 px par entrée ; Démo visible de tous ; Échap ne ferme pas ; toucher au-dehors ferme (TRA-001…006, sonde 06) |
| Chaque sous-écran ouvert par un vrai toucher | 16 sous-écrans capturés ; 5 + 2 réglages sans effet, configurateur hors charte (TRA-010…027) |
| « Sombre » choisi dans le configurateur | Thème sombre partiel appliqué au fil (TRA-055) |
| Mode pause → 1 h | Toast « Mode pause activé — 1h », aucune suspension (TRA-018) |
| Notifications : une de chaque type, lues / non lues | Pastille 8 → vide dès l'ouverture ; rappel « dans une semaine » pour le lendemain (TRA-031) |
| Toucher chaque type de notification (17) | Publication, mention, réaction → page de la publication ; abonnement → profil ; activité → fiche ; contenu supprimé, conversation absente, activité supprimée, modération → retour au fil sans un mot (TRA-033, sonde 02) |
| Liste vide / 45 notifications | État vide soigné (TRA-035) ; 45 lignes plates, 30 rendues par le serveur (TRA-036) |
| Toast sur fil, page de publication, clavier simulé | Visible, au-dessus de la barre et du clavier (TRA-040) |
| Toast sous fenêtre, conversation, lecteur de bobines | Invisible : dessus = #modalContent, #convFpThread, #reelsList (TRA-041/042, sonde 03) |
| Quatre toasts d'affilée | Échec violet comme un succès ; toast long bord à bord (TRA-043) |
| Signaler une activité, motif vide | Avertissement émis sous la fenêtre (TRA-041) |
| Fiche d'activité défilée au maximum | « Signaler » et « Inviter » sous le pied collant (TRA-050, sondes 04/05) |
| Signalement refusé (500 programmé) | « déjà envoyé, ou impossible » (TRA-052) |
| Bandeau d'équipe + hors ligne | Le bandeau distant cache la barre ET le bandeau hors ligne (TRA-060/061) |
| Retour du réseau, file vide | « envoi des messages en attente » (TRA-062) |
| Installer sans invite (Android émulé) | Consignes d'ordinateur (TRA-065) |
| Fenêtre commune au clavier | Focus laissé derrière, 25/25 tabulations hors fenêtre, pas de nom (sonde 06) |

## 4. Ce qui fonctionne et doit être conservé

- Les confirmations « Se déconnecter ? » (TRA-026) et « Supprimer mon compte » (TRA-027) : conséquences écrites, saisie de « SUPPRIMER ». C'est le modèle de la feuille de confirmation commune proposée en TRA-C11.
- Confidentialité réduite aux réglages branchés (TRA-011) — la méthode à appliquer aux autres sous-écrans.
- L'export qui annonce s'il est complet (TRA-080).
- La pré-question des rappels d'activité (TRA-076).
- La cloche et sa pastille (TRA-030), l'arrivée sur la bonne fiche (TRA-034), l'état vide (TRA-035), la demande d'abonnement tranchée depuis la notification.
- Le motif obligatoire et l'accusé de réception du signalement.
- « Limites de cette version pilote » (TRA-021), « Changer mon mot de passe » (TRA-019).

## 5. Constats détaillés

### Composants partagés
- **TRA-C01 (P1)** — Synthèse des toasts peints sous les superpositions (PAR-C03, IRL-C65, MSG-C85, BOB-C20). Mesure unique, toast figé : visibles sur le fil, la page de publication et au-dessus du clavier ; masqués par `#modalContent`, `#convFpThread`, `#reelsList`. Nouvelle occurrence : la validation du motif de signalement. Maquette TRA-041/042 : pile `position:fixed`, z-index maximal, en haut de l'écran quand une superposition occupe le bas.
- **TRA-C02 (P2)** — 74 des 85 messages d'échec émis en « info » (même violet que les succès), 3 s pour tous (jusqu'à 113 caractères), toast long bord à bord (TRA-043). Les couleurs d'échec existent déjà (styles.css:1516-1530).
- **TRA-C03 (P1)** — Synthèse des faux succès : PRO-C01, FIL-C06, MSG-C05, CRE-C04 (+ IRL-C63, MSG-C11, MSG-C23, FIL-C09) ; ici Mode pause, « Configuration appliquée ! », « Notifications mises à jour », reconnexion.
- **TRA-C11 (P1)** — Synthèse des actions destructrices : sans confirmation (FIL-C06, FIL-C08, PRO-C06, MSG-C09, MSG-C58, MSG-C84) ou par 8 `confirm()` (dont `resetApp`, jamais appelée) et 4 `prompt()` natifs (IRL-C60, CRE-C09). Proposition : composant `confirmerAction` sur le gabarit de TRA-026, toast « Annuler » pour le réversible.
- **TRA-C21 (P2)** — openModal : focus non déplacé, 25/25 tabulations derrière la fenêtre, pas d'`aria-labelledby`, focus non rendu. Une correction couvre 69 fenêtres.
- **TRA-C22 (P3)** — Dix gabarits ajoutent un `span.modal-close` à la croix injectée (liste dans le constat) : PRO-C09, PAR-C13, accueil des participants, configurateur.
- **TRA-C23 (P3)** — Vocabulaire (PAR-C09, IRL-C62, PRO-C14, BOB-C13) : toasts « événement » 14 / « activité » 3 / « rencontre » 1, « post » 9 / « publication » 5 ; Paramètres en franglais.
- **TRA-C24 (P3)** — Emojis comme icônes de fonction (FIL-C02, FIL-C23, MSG-C17, MSG-C26, MSG-C82, PRO-C13, IRL-C08) ; 50 toasts commencent par un emoji.

### Paramètres
- **TRA-C04 (P1)** — Notifications : `posts`, `messages`, `likes`, `events`, `system` écrits dans `passio_config`, jamais lus ; seul `recap` agit (TRA-010).
- **TRA-C05 (P1, sensible)** — Bien-être digital inerte : `passio_usage_min` jamais écrit (compteur à 0), `passio_limit_sec` jamais appliqué, `activatePause` = un toast (TRA-016/017/018).
- **TRA-C06 (P2)** — Configurateur : thème « Sombre » (id `noir`) et six palettes, 16 polices chargées, ordre d'onglets agissant sur `#appNav` masqué, « Appliquer » mensonger (TRA-014/015/055). Maquette : « Affichage », taille du texte seule.
- **TRA-C07 (P2)** — « Contenu & feed » : contenu sensible et langue sans effet (TRA-013).
- **TRA-C08 (P2)** — Panneau : 33 px / 11–12 px, Démo ouverte à tous, Échap sans effet, pas d'`aria-expanded` (TRA-001…006).
- **TRA-C09 (P2, sensible)** — Comptes bloqués : « ? Utilisateur », « Débloquer » 81 × 29 px (TRA-012).
- **TRA-C25 (P3)** — À propos : « Version Beta 1.1 · Mai 2026 », emoji 🟣 (TRA-025).
- **TRA-C26 (P3, sensible, hypothèse)** — Textes légaux longs sans sommaire, dates différentes ; contradiction apparente identité / anonymat de l'éditeur entre politique et mentions, à faire trancher.
- **TRA-C27 (P2, sensible)** — Suppression du compte sans proposition d'export (TRA-027).
- **TRA-C29 (P3)** — « Feedback & aide » sans aide (TRA-020).

### Notifications
- **TRA-C15 (P1)** — Rappel « dans une semaine » pour une activité du lendemain : le libellé du palier `d7` est affiché tel quel (app-07:4716).
- **TRA-C12 (P2, sensible)** — Cible absente → silence ; notification de modération sans cible (TRA-033, TRA-032).
- **TRA-C13 (P2)** — « Tout marquer lu » sans objet (l'ouverture marque déjà tout lu), Accepter/Refuser 29 px, heures sans jour (TRA-031/032).
- **TRA-C14 (P3)** — Pas de regroupement, plafond 30 sans « voir plus » (TRA-036).
- **TRA-C16 (P3)** — « Léa Fontaine une place s'est libérée… » : nom préfixé à des phrases sans sujet (supaInsertNotif).
- **TRA-C28 (P2)** — Deux manières de demander la permission (pré-question des rappels vs demande sèche, MSG-C25) ; état de la permission invisible ; voisins CRE-C14, IRL-C19.

### Signalement, blocage
- **TRA-C17 (P1, sensible)** — « Signaler cet événement » sous le pied collant au défilement maximal (`elementFromPoint` = #eventDetailCta ; marge basse 100 px pour un pied de 129 px) ; « Inviter » à moitié couvert (TRA-050).
- **TRA-C18 (P2, sensible)** — Sept portes, trois mots pour l'activité, six réponses, passion sans motif, échec ambigu (tableau § 2, TRA-051/052/053).
- **TRA-C10 (P1, sensible)** — Bloquer : immédiat depuis publication / commentaire / profil (FIL-C08, PRO-C06), `confirm()` depuis une conversation.

### Réseau, installation
- **TRA-C19 (P2)** — Bandeaux du haut superposés à la barre et entre eux (FIL-C25, MSG-C63) ; « × » sans nom ; toast de reconnexion inconditionnel (TRA-060/061/062).
- **TRA-C20 (P3)** — Installation : consignes d'ordinateur sur téléphone, « Installation en cours… » sans installation, ancien violet, redirections `intent://` en cascade (TRA-065).

### Sensible
Signalement d'activité inatteignable (TRA-C17), cohérence des textes légaux sur l'identité de l'éditeur (TRA-C26) et lisibilité de la liste des comptes bloqués (TRA-C09) relèvent de la sécurité des personnes ou du droit : décrits sans mode opératoire, à traiter avec les garde-fous existants (RLS `blocks`, `reports`).

## 6. Cohérence avec le reste de l'application

- **Mots** : publication / post, activité / événement / rencontre (sur la seule porte de signalement d'activité : trois mots), fil / feed, j'aime / likes, retour / feedback, « IRL » dans les réglages ; tutoiement partout sauf les commentaires de bobines.
- **Icônes** : emojis-fonctions dans Paramètres (📦), À propos (🟣), installation (1️⃣ 2️⃣ ✅), toasts (⚠️ ✅ 🚩 🟢), notifications (rendues en images d'emoji).
- **Comportements** : même geste « Bloquer » immédiat ou natif selon l'écran ; même permission demandée avec ou sans explication ; confirmations maison (déconnexion, suppression du compte) contre boîtes du navigateur (groupe, activité, conversation) ; réglages branchés (Confidentialité) contre réglages décoratifs (Notifications, Bien-être, Contenu) ; toasts visibles sur les écrans, invisibles sur les superpositions.
- **Couleurs** : configurateur (six palettes, sombre) et invite d'installation (#7c3aed, #1e1b4b) hors de la palette UI v2.

## 7. Ce qui n'a pas pu être vérifié

- Réception d'une notification poussée (texte, regroupement système, destination) : vrai téléphone, application installée (TRA-070).
- Page rechargée hors ligne et bandeau « contenu en cache » réellement servi par le service worker : bloqué par le banc (TRA-071).
- Invite d'installation native (`beforeinstallprompt`) et rendu iPhone de l'overlay Safari (TRA-065 simulé).
- Boîtes natives `confirm()` / `prompt()` : rendu non capturable ; textes relevés dans le code (TRA-073/074).
- Contraste complet du thème « Sombre » : jugé hors charte, non mesuré écran par écran.
- Contradiction identité / anonymat des textes légaux : question juridique (TRA-C26).
À vérifier sur un Android et un iPhone réels, application installée, avec un second compte qui déclenche une notification.

## 8. Compteurs

- Surfaces inventoriées : **57** — observées **33**, simulées **11**, code seul **10**, inaccessibles **2**, sans objet **1**.
- Avec avant-après : **20** ; avant seul : **24** ; sans capture : **13**.
- Verdicts : à améliorer **41**, à conserver **13**, à vérifier **3**.
- Constats : **29** — P0 **0**, P1 **8** (TRA-C01, C03, C04, C05, C10, C11, C15, C17), P2 **12**, P3 **9**. Dont 6 synthèses de constats de domaine (TRA-C01, C03, C11, C22, C23, C24).
