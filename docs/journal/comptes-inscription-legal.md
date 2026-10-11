# Journal — Comptes, inscription, connexion, textes légaux, majorité, première visite

> **Fiches déplacées TELLES QUELLES de `CLAUDE.md` le 2026-10-05.** `CLAUDE.md` est rechargé à
> chaque session et avait atteint 410 000 caractères (Claude Code alerte dès 40 000) : il ne garde
> plus que les règles qui valent partout. Ici vivent le récit, les mesures et les pièges de chaque
> lot — **à lire AVANT de toucher au domaine.** Un commentaire du code qui cite « CLAUDE.md § … »
> désigne une fiche de ce dossier : `grep -rn "<début du titre>" docs/journal/`.
> **Nouvelle fiche** : à la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`.
> Si elle porte une règle qui vaut pour TOUTE modification, une seule ligne de plus dans la section
> « Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.

## Sommaire

- 🤖 CAPTCHA TURNSTILE À L'INSCRIPTION — le client d'abord, l'interrupteur ensuite (2026-09-13)
- 🔑 MOT DE PASSE : 8 CARACTÈRES, ET LES REFUS DU SERVEUR EN FRANÇAIS (2026-09-13)
- 🔑 CHOISIR SON MOT DE PASSE — ON AIDE, ON N'EXIGE PAS PLUS (2026-09-16)
- 📱 DEUX TESTEUSES iPHONE, DEUX REFUS SANS SORTIE ATTEIGNABLE (2026-09-18)
- 📧 Confirmation d'e-mail ACTIVE depuis le 2026-08-30 (SMTP Brevo)
- 🙋 NOM D'UTILISATEUR DEMANDÉ À LA CRÉATION DU COMPTE (2026-09-09)
- 🎬 LE VIEUX TOUR REVENAIT SUR TOUT COMPTE NEUF — « Confirm email » avait tué son seul garde-fou (2026-09-12)
- 💬 LES TROIS REPÈRES ATTEIGNENT AUSSI UN COMPTE NEUF (2026-09-12, l'après-midi)
- ⚖️ TEXTES LÉGAUX LISIBLES SANS CODE D'ACCÈS (2026-09-11)
- ⚖️ CGU, MENTIONS LÉGALES ET CONSENTEMENT (2026-09-08)
- 🔞 PASSIO EST RÉSERVÉ AUX MAJEURS (2026-09-09) — la règle change, pas la barrière
- 🔞 ADMISSION 18+ ET COLONNES EXPLICITES — le CLIENT (2026-09-08)
- 🔞 ADMISSION 18+ — fondation serveur APPLIQUÉE EN PRODUCTION le 2026-09-08, interrupteur **ALLUMÉ** (mesuré le 2026-09-10)
- 🚪 PREMIÈRE VISITE — « l'application est elle-même le pitch » (ACTIF PAR DÉFAUT)
- 🔥 PREMIÈRE VISITE — LES PASSIONS POPULAIRES EN DIRECT : la grille suit les publications (2026-10-06)

---

## 🤖 CAPTCHA TURNSTILE À L'INSCRIPTION — le client d'abord, l'interrupteur ensuite (2026-09-13)

SEC-06 du go/no-go : sans captcha, un script vide le quota d'e-mails (150/h Supabase, 300/j Brevo) et rend l'inscription
indisponible 24 h. Moteur `captcha*` (app-02, avant `switchAuthTab`), conteneur `#authCaptcha` (index.html, juste avant
`#authSubmitBtn`), sitekey **publique** `PASSIO_TURNSTILE_SITEKEY` (app-08, à côté du CDN). **Sitekey VIDE = inactif** : aucun
script chargé, aucun jeton envoyé, l'appel part comme avant — c'est ce qui rend le client déployable AVANT l'interrupteur.
⚠️ **ORDRE D'ALLUMAGE, et il n'est pas négociable** : ① widget Turnstile créé chez Cloudflare (hostname `passio-app.netlify.app`) ;
② sitekey posée dans app-08 ET déployée ; ③ seulement alors, Supabase → Authentication → Attack Protection → « Enable Captcha
protection » + secret (ou `PATCH /v1/projects/<ref>/config/auth` : `security_captcha_enabled`, `security_captcha_provider: turnstile`,
`security_captcha_secret`). **Allumer avant ② casse 100 % des inscriptions** (`captcha_failed` sur signup, `/token` mot de passe,
`/recover`, `/resend`). ⚠️ **Un jeton ne sert qu'une fois** : `captchaReinitialiser()` après CHAQUE appel, réussi ou non. `captchaJeton()`
attend jusqu'à 20 s (mode Managed : une case à cocher parfois) et rend `""` sinon — le serveur refuse, `traduireRefusCaptcha` le dit.
⚠️ **LE BANC DE COMPTES RÉELS N'ENTRE PLUS PAR LE MOT DE PASSE** : `creerCompteE2E` (compte-e2e.js) demande un
`generate_link` (magiclink, service_role) et la page fait `verifyOtp({ token_hash })` — `/verify` n'est PAS gardé par le captcha,
`/token?grant_type=password` l'est. Prouvé contre la prod le 2026-09-13 (compte jetable, purgé). Repli sur le mot de passe si l'API
ne rend pas de jeton. ⚠️ **La CSP admet UN hôte tiers, et un seul** : `https://challenges.cloudflare.com` en `script-src` ET en
`frame-src` (netlify.toml ET `_headers`) — c'est un service, pas une copie flottante d'une bibliothèque (le verrou d'ouverture-publique
a été réécrit pour le dire). Verrous : `tests/e2e/captcha-turnstile.spec.js` (9, dont ①/③/④/⑥ éprouvés par RÉINJECTION — jeton
jamais joint → 2 rouges), faux `window.turnstile` posé AVANT l'app (donc rien ne part vers Cloudflare, et ① le mesure).

## 🔑 MOT DE PASSE : 8 CARACTÈRES, ET LES REFUS DU SERVEUR EN FRANÇAIS (2026-09-13)

Le minimum serveur (Supabase → Authentication → Sign In / Providers → **Email** → « Minimum password length ») passe de 6 à **8**,
avec « Password requirements » = lettres et chiffres. **`MOT_DE_PASSE_MIN` (app-02) est la SEULE source du nombre côté client** —
inscription (`onbDoAuth`), changement depuis les Paramètres (`#cpNew`), récupération par lien (`#pwdRecoveryInput`) : trois portes,
un seul nombre, et le `minlength` de chaque champ le suit (verrou ①). Le serveur tranche ; le client refuse plus tôt, en français.
⚠️ **Les refus du serveur partaient en anglais** (« Password should be at least… », « Password is known to be weak and easy to
guess… » — EM-6 du go/no-go, mesuré deux fois le 2026-09-11) : `traduireRefusMotDePasse(m)` (app-02) est la SEULE table, appelée
sur les DEUX chemins (inscription ET changement), et rend le message INTACT s'il n'est pas un refus de mot de passe (verrou ⑤).
⚠️ **Ordre de bascule** : ce client d'abord (il refuse à 8 quoi que dise le serveur), le réglage serveur ensuite — l'inverse
aurait affiché l'erreur anglaise à tout inscrit entre 6 et 7 caractères.
⚠️ **LES DEUX GARDES DE CHANGEMENT SONT ALLUMÉES CÔTÉ SERVEUR (2026-09-13)** — « Require current password when updating » et
« Secure password change » — et `openChangePassword`/`doChangePassword` (app-02) en sont la contrepartie : le champ « Mot de passe
actuel » part en `current_password` (champ du SERVEUR : supabase-js transmet l'objet tel quel, quelle que soit sa version), et un
refus `reauthentication_needed` (session > 24 h) déclenche `supa.auth.reauthenticate()` → champ « Code reçu par e-mail » → renvoi
avec `nonce`, le mot de passe saisi restant dans le formulaire. **Sans ce client, une session volée suffisait à changer le mot de
passe et à verrouiller le compte hors de son propriétaire.** ⚠️ Un compte **Google seul** n'a pas de mot de passe : le serveur ne
lui demande pas l'ancien (`user.HasPassword()` faux) et le champ est MASQUÉ (`app_metadata.providers` sans « email ») — le lui
demander l'aurait bloqué devant un champ qu'il ne peut pas remplir. ⚠️ La récupération par lien est EXEMPTÉE des deux gardes
(session `recovery`, GoTrue ≥ 2.189 — prod en 2.196) : ne pas y ajouter de champ. ⚠️ `[hidden]` ne replie rien sur un `label.field`
(display:block, fiche 19) : la visibilité des deux champs se pilote et se LIT par `style.display`. Verrou :
`tests/e2e/changement-mdp-securise.spec.js` (12, dont ① et ④ éprouvés par RÉINJECTION — `current_password` retiré → 2 rouges).
`LICENSE` (racine) dit « Tous droits réservés » — il ne bloque ni la lecture ni le fork d'un dépôt PUBLIC (CGU GitHub D.5) ;
seul le passage en privé le fait. Verrou : `tests/e2e/mot-de-passe-minimum.spec.js` (7, dont ①/②/④ éprouvés par RÉINJECTION à 6).

## 🔑 CHOISIR SON MOT DE PASSE — ON AIDE, ON N'EXIGE PAS PLUS (2026-09-16)

Capture d'un essai réel : quelqu'un tape « Emma0207@ » et lit « Ce mot de passe apparaît dans des
fuites de données connues. Choisis-en un autre, plus original. » — message posé EN HAUT du
formulaire, à quatre champs du mot de passe, donc hors de l'écran d'un téléphone quand on regarde le
champ, et qui ne dit NI ce qui est attendu, NI quoi faire ensuite. Demande de Benjamin : « ne
complique pas trop la sélection ».

⚠️ **AUCUNE RÈGLE N'A ÉTÉ AJOUTÉE, ET C'EST TOUT LE LOT.** Les trois exigences affichées
(`MOT_DE_PASSE_REGLES`, app-02) sont EXACTEMENT celles que le serveur applique déjà :
`MOT_DE_PASSE_MIN` caractères, des lettres, des chiffres. Les ÉCRIRE, ce n'est pas compliquer la
sélection — c'est cesser de la faire deviner refus après refus. **Ne jamais y ajouter majuscule,
symbole ni jauge de « force »** : le serveur ne les demande pas, et une règle affichée que rien
n'applique est une friction pure. `motDePasseVerdict`/`motDePasseAccepte` sont la SEULE autorité
côté client (même contrat que `nomCompteValide` : l'appelant ne re-teste rien).

⚠️ **LE RÉGLAGE « leaked passwords » N'EST PAS DESSERRÉ.** Il est allumé depuis le 2026-09-12 et le
reste : ce qui manquait n'était pas la permission de choisir un mot de passe fuité, c'était une
SORTIE. « Choisis-en un autre » est un ordre, pas une sortie — quelqu'un dont les trois mots de
passe habituels ont fuité n'a aucune idée du suivant, et c'est là qu'on abandonne une inscription.

⚠️ **LA CAUSE SILENCIEUSE ÉTAIT UN `autocomplete`.** `#authPassword` était figé sur
`current-password` pour les DEUX onglets : en création, le trousseau iOS et les gestionnaires du
navigateur se taisaient, donc personne ne se voyait proposer « Mot de passe fort » et chacun
inventait le sien — d'où les mots de passe déjà fuités. `switchAuthTab` bascule désormais l'attribut
avec l'onglet, et lui seul (verrou ⑥). Il pose aussi le `minlength` en création **seulement** :
en connexion il barrerait un mot de passe de 6 caractères d'avant le 2026-09-13, parfaitement valide
côté serveur — enfermer un compte dehors pour un attribut d'affichage.

⚠️ **LE REFUS SE PRONONCE LÀ OÙ L'ON TAPE**, en plus du bandeau (que `mot-de-passe-minimum.spec.js`
mesure, et qui ne bouge pas) : `#authPwdRefus`, sous le champ, avec la sortie nommée. Le
discriminant « est-ce un refus de mot de passe ? » se prend sur le message **BRUT**, AVANT les
réécritures qui suivent dans `onbDoAuth` (captcha, « déjà utilisé », quota d'e-mails) — après, la
table ne reconnaîtrait plus son propre refus. Retaper efface le refus : répondre, c'est répondre.

⚠️ **« Proposer un mot de passe » remplit les DEUX champs et les affiche EN CLAIR** — un mot de
passe proposé qu'on ne peut pas lire est un mot de passe perdu, et ne remplir que le premier ferait
tomber « les mots de passe ne correspondent pas » à la ligne suivante. `motDePasseSuggere()` rend
deux mots tirés au sort et quatre chiffres (`lavande-colibri-4917`) : prononçable, conforme par
construction, et hors de toute fuite puisqu'il vient d'être tiré. Tirage par **REJET** sur
`crypto.getRandomValues` (`_aleaEntier`) — un simple `% max` favoriserait les premiers mots de la
liste ; `Math.random()` n'est qu'un repli, jamais le chemin nominal.

⚠️ **LA GARDE « lettres + chiffres » NE VAUT QU'EN CRÉATION.** Posée en connexion, elle refuserait à
la porte un mot de passe choisi avant le réglage serveur — le compte serait inaccessible sans que
rien ne l'explique. Même raison que le `minlength`. Verrou ⑤, qui mesure les DEUX sens.

⚠️ **L'AIDE VIT HORS DU `<label>` VOISIN** : un bouton posé DANS un label voit son clic détourné
vers le champ du label (même famille que le piège des liens dans la case de consentement). Elle est
peinte par `majAideMotDePasse` et par lui seul ; l'état d'une règle ne repose JAMAIS sur la couleur
(✓ / ○), et le vert retenu est `#15803d` — `#16a34a` tombe à 3,9:1 sur fond clair, sous le seuil AA
d'un texte de 12 px. Aucune ligne de `styles.css` n'a été touchée (styles en ligne, comme le reste
du formulaire) : le bloc UI-4A5 reste le dernier.

⚠️ **UN FIXTURE DE TEST PEUT DEVENIR INVALIDE SANS ÊTRE FAUX** : `exploration-anonyme-vs-compte` ⑯
posait `"motdepasse"` (sans chiffre) pour mesurer le CÂBLAGE DE PROPRIÉTÉ de la branche `signup` —
la garde le faisait sortir avant son sujet. Le mot de passe du fixture a changé, aucune assertion
n'a bougé. Même famille que « sculpture sur glace » entrée au référentiel : un test qui tient par
une prémisse finit par le dire.

Verrou : `tests/e2e/mot-de-passe-aide.spec.js` (8), **éprouvé par RÉINJECTION de cinq mutations** —
câblage de `switchAuthTab` retiré (2 rouges), écho du refus coupé (2), garde lettres+chiffres
neutralisée (1), `autocomplete` refigé (1), confirmation non remplie (1).

## 📱 DEUX TESTEUSES iPHONE, DEUX REFUS SANS SORTIE ATTEIGNABLE (2026-09-18)

Capture d'écran à l'appui, le 17/09 au soir. ① « Moi ça bloque ici, je n'arrive pas à cliquer sur
l'encadré pour confirmer mon adresse mail » — l'écran de connexion, l'encadré rouge « Confirme ton
e-mail », et rien d'autre à l'écran. ② « Moi ça bloque quand j'appuie sur les différentes options » —
le détail d'une publication, avec sa rangée ❤️ 💬 😊 partage.

⚠️ **AUCUNE DES DEUX N'A LAISSÉ LA MOINDRE TRACE D'ERREUR.** `client_errors` ne porte **rien** d'iOS
sur cinq jours, et la télémétrie ne montre que des `POST /auth/v1/token` en 400 — le refus attendu.
C'est l'angle mort déjà écrit pour la Sentinelle : *un bouton qui n'émet rien ressemble exactement au
calme*. Ces deux défauts ne pouvaient être trouvés QUE par la mesure au navigateur, en gabarit de
téléphone, sur le geste réel.

### ⚠️ ① LA SORTIE EXISTAIT DEPUIS TROIS SEMAINES — SOUS LE PLI

Le renvoi du lien de confirmation (`#authResendLink`, 2026-08-30) est posé **après** « Se connecter »
et après « Mot de passe oublié ». Mesuré sur un iPhone 12 (390 × **664** px — la hauteur UTILE sous
Safari, pas les 844 du gabarit Playwright) : le lien occupe **647–669 px captcha ÉTEINT** — à cheval sur le pli,
17 px visibles sur 22 — et **724–746 px** avec le widget Turnstile de la production, soit **82 px sous
le pli**, entièrement hors écran. La
capture s'arrête exactement sur « Se connecter ».
⚠️ **ET LA BASE LE CONFIRME, ce n'est pas une déduction** : le compte bloqué porte un
`confirmation_sent_at` égal à son `created_at`, **jamais renouvelé**. Personne n'avait jamais atteint
cette sortie — ni elle, ni quiconque.
⚠️ **ON N'A PAS DÉPLACÉ LA SORTIE, ON EN A POSÉ UNE SECONDE** là où le refus s'écrit :
`#authResendTop` (index.html), juste sous `#authMsg`, un bouton plein de 44 px avec sa phrase
d'explication — **vraie sur les DEUX chemins qui l'affichent** (« Compte créé ! » comme « confirme ton
e-mail ») : la première rédaction disait « ton compte existe déjà » à qui venait de s'inscrire, relevé
par `audit-passio`. ⚠️ **Et la branche « e-mail déjà utilisé » de l'inscription était le dernier
cul-de-sac** : recréer son compte est le geste le plus naturel de qui n'a pas reçu son lien, et cette
branche répondait « déjà utilisé » sans proposer le renvoi — même relecture. Les TROIS branches
appellent désormais `_showResendConfirmation`. Le défilement cale **le message en haut** (`block:
"start"` sur `#authMsg`), pas le bloc au centre : centré, il renvoyait « Se connecter » 18 px sous
le pli avec le captcha — le défaut qu'on venait de corriger, déplacé d'un bouton. Le lien du bas reste **à l'octet près** — six cas de `confirmation-email.spec.js` le
visent, et un verrou qui cesse d'exercer un geste cesse de le protéger.
⚠️ **`_showResendConfirmation` (app-02) reste l'autorité UNIQUE des DEUX sorties** : elle les montre,
les cache (`switchAuthTab` l'appelle avec `""` à chaque bascule) et amène la seconde à l'écran par
`scrollIntoView`. Deux pilotages pour un même état finissent toujours par diverger sur celui qu'on
oublie. ⚠️ Et le refus **NOMME** désormais sa sortie : « Confirme ton e-mail avant de te connecter :
ouvre le lien qu'on t'a envoyé, ou fais-le renvoyer juste en dessous. » Un refus sans porte de sortie
est ce qui fait abandonner une inscription — même règle que le mot de passe fuité (2026-09-16).

### ⚠️ ② ELLE ÉTAIT ENFERMÉE DANS LA PAGE DÉTAIL — ET LA VIDÉO L'A MONTRÉ, PAS LA CAPTURE

La capture montrait le détail d'une publication ; la **vidéo** (VID-20260916-WA0005, 11 s) montre le
mécanisme : l'onglet du bas s'allume à chaque tap — Profil, Messages, Rencontrer, Découvrir — et
**l'écran ne change pas**. La page détail est rendue ENTRE la barre du haut et la barre d'onglets,
son en-tête « ← Post » est hors de vue, et la barre d'onglets reste tapable par-dessus. Deux causes,
deux correctifs, et le second vaut même sans le premier :

⚠️ **UNE PAGE `position: fixed` NE VIT JAMAIS DANS `#appMain`.** `#postDetailPage`, `#eventDetailPage`
et `#offlineBanner` étaient les **seules** surfaces plein écran du dépôt posées DANS le conteneur
défilant (`overflow-y: auto; -webkit-overflow-scrolling: touch`) — toutes les autres (`#reelsViewer`,
`#modalBackdrop`, `#conv-fullpage`, `#storyViewer`, `#mediaEditor`) sont des sœurs de `<main>`. Sur
Chromium, `fixed` se cale sur le viewport quoi qu'il arrive : **le défaut est INVISIBLE au banc**
(Chromium seul ici, et `closeCurrentOverlay` fonctionnait — c'est le geste de retour que personne
ne trouve sans bouton). Sur WebKit, la page est rendue dans le scroller, défile avec lui, et la barre
d'onglets reste au-dessus. Les trois blocs sont sortis de `<main>` (index.html), et les comptes de
balises structurelles sont **identiques** avant/après (main 1, section 6, div 417/418 — l'écart
préexistant compris). Aucun style ni script ne dépendait de l'ancien emplacement (mesuré au grep).

⚠️ **ET `goTo` FERME LES DEUX PAGES DE DÉTAIL AVANT LA BASCULE D'ÉCRAN**, comme il le fait déjà pour
« Mes passions » — la règle de la fiche 19 (« toute page plein écran doit avoir son entrée dans
`closeCurrentOverlay` ET `goTo` doit la fermer avant la bascule ») n'était appliquée qu'à moitié :
les deux pages étaient dans `closeCurrentOverlay`, aucune dans `goTo`. Un onglet du bas est une
NAVIGATION : il referme ce qui est ouvert. C'est ce qui aurait libéré la testeuse dès son premier
tap, quel que soit le moteur. L'entrée d'historique de la page devient orpheline, comme pour « Mes
passions » — coût déjà accepté par `goTo` (`_navOverlayDepth = 0`).

⚠️ **ET LA SEULE SORTIE RESTANTE FAISAIT 18 PIXELS.** DEV-01 (2026-09-14) a élargi à 44/40 px la
cloche, les croix de panneau et les actions de **COMMENTAIRE**. Il s'est arrêté là. Mesuré au
navigateur sur le détail d'une publication — l'écran même de la capture : **« ← » 18×22** (la seule
sortie VISIBLE de la page — le geste de retour du système la ferme aussi, mais personne ne le trouve
sans bouton), actions **55×27 / 47×27 / 31×27 / 35×31**, tri des commentaires **91×22**, « ⋯ »
d'un commentaire **24×24**, « ⋯ » d'une publication **30×30**. Apple demande 44 pt. **Corriger une
surface, c'est corriger une surface** — et la famille se re-traque après CHAQUE correctif de ce type.

⚠️ **L'ÉLARGISSEMENT SE PREND VERS LE HAUT, JAMAIS AUTOUR.** Les quatre actions d'une publication
sont séparées de 4 px : un `inset` symétrique ferait que la zone d'une action recouvre sa voisine et
lui vole ses taps — on aurait remplacé « trop petit » par « ça fait autre chose ». D'où
`left: 0; right: 0` (la largeur vient de `min-width: 44px` — les deux boutons étroits 😊 et partage
s'ÉLARGISSENT vraiment, de 31 et 35 à 44 px, et le partage glisse de 13 px : c'est le seul déplacement
visible du lot avec `.v3-bridge`, la hauteur de rangée et de carte étant identiques — sans déborder :
la rangée fait 324 px pour 202 px d'actions) et `top: -17px; bottom: 0` — au-dessus il n'y a que le corps de la
carte, dont le seul geste est « ouvrir la publication », c'est-à-dire l'issue d'un tap raté.

⚠️ **UNE ZONE DE 44 px NE VAUT QUE SI PERSONNE NE LA PREND, et un voisin la prenait déjà.** Sur les
cartes qui portent le pont IRL, `.v3-tempt` (lot UI-3) réclame ses 44 px par `margin: -11px 0` +
`z-index: 1`, et sa moitié haute remontait **dans la boîte VISIBLE** du bouton « partager » :
mesurée à **22 px de zone pour 31 px de bouton**. Taper l'icône de partage ouvrait « Trouver une
expérience ». **Défaut ANTÉRIEUR à ce lot**, invisible parce qu'aucune des deux zones n'est peinte.
Deux zones de 44 px ne tiennent pas dans 42 px de rangée + 2 px de marge : on ne désigne pas un
gagnant (l'autre resterait volée), on **donne la place** — `.post-actions + .v3-bridge { padding-top: 11px }`,
soit 9 px de plus sous la rangée, **sur les seules cartes où le pont SUIT la rangée** (5 sur 20 :
ailleurs l'aperçu de commentaires les sépare déjà — la première rédaction l'appliquait aux 20, relevé
par `audit-passio`). En-tête, hauteur de rangée, hauteur de carte et hauteur du fil sont mesurés
identiques ; ce qui bouge est dit au paragraphe précédent.

⚠️ **ON MESURE LA ZONE PAR `elementFromPoint`, JAMAIS PAR `getComputedStyle(::after)`.** Un
pseudo-élément parfaitement dimensionné mais recouvert ne reçoit aucun tap, et l'attribut serait vert
sur le défaut — c'est très exactement comme ça que `.v3-tempt` est passé. ⚠️ **Et la première mesure
était fausse** : les bulles d'aide `.fr-tip` couvraient la rangée, la sonde rendait 1 px partout. Une
sonde qui rend une valeur absurde ne mesure pas un défaut, elle mesure un obstacle — le retrait des
bulles fait partie du banc, et la sonde NOMME qui borne la zone (`borneHaut`/`borneBas`), sinon un
rouge dit « 29 au lieu de 44 » sans dire qui vole les pixels.

⚠️ **`.comment-menu-btn` est DÉJÀ en `position: absolute`** : on ne lui pose pas `position: relative`
— c'est la leçon `.modal-close` (rouge CI #400).

⚠️ **RÉSIDUS NOMMÉS, PAS RÉGLÉS** : les actions d'un COMMENTAIRE (❤️ 💬 😊) sont à 40 px de haut mais
24–38 px de large (DEV-01 n'avait traité que la hauteur). Essayé ici par `padding` + marge négative :
mesuré, les boîtes se recouvrent alors de 10 px et le voisin reprend exactement ce qu'on donne — la
rangée (`gap: 12px`) n'a pas la place de trois zones de 44 px, ce sera une autre mise en page, pas un
élargissement ; l'avatar d'un commentaire reste 30×30. Sur l'écran d'auth, les liens « Mot de passe oublié » / « Renvoyer » passent à 44 px de
haut et les deux « 👁 » de 18×21 à 44×44 (glyphe au même endroit, le champ garde son `padding-right`).

Verrous : `ios-navigation-et-zoom.spec.js` (+3 : les trois pages hors de `#appMain` à la SOURCE, un
onglet du bas referme la publication, un onglet du bas referme la fiche d'activité),
`accessibilite-cibles.spec.js` (+3 : ⑤ les options fil ET détail, ⑥ le « ← », ⑦ les deux
« ⋯ ») et `confirmation-email.spec.js` (+3 : ⑧ la sortie tient dans un écran de 664 px **avec** le
captcha, ⑨ le bouton du haut renvoie comme le lien du bas, ⑩ les deux sorties obéissent à la même
autorité). **Éprouvés par RÉINJECTION de cinq mutations** : bloc CSS retiré → 2 rouges ; « ← »
rendu à 18×22 → 1 rouge ; `#authResendTop` retiré → 3 rouges ; pages remises dans `<main>` → 1 rouge ;
fermeture retirée de `goTo` → 2 rouges.

## 📧 Confirmation d'e-mail ACTIVE depuis le 2026-08-30 (SMTP Brevo)

`signUp` ne rend **plus** de session : le compte existe, il est inutilisable tant que l'adresse n'est pas confirmée. Depuis le 2026-09-11, PASSIO a sa propre identité : contact `passioadmin@gmail.com` (`PASSIO_EDITEUR.email`, source unique), domaine d'envoi `passio-app.fr` sur des comptes OVH et Brevo dédiés — **plus aucune référence à une autre activité de l'éditeur**. Montage complet, enregistrements DKIM/DMARC, bascule SMTP et gabarits français : `docs/SETUP_SMTP_AUTH.md`.
Deux règles à ne pas enfreindre : **`switchAuthTab` d'abord, message ensuite** (il remet `#authMsg` à zéro — tout ce qu'on veut voir survivre à une bascule se pose APRÈS elle) ; et les comptes de test ne se créent JAMAIS par `signUp` mais par `tests/e2e/compte-e2e.js` (pré-confirmés via `service_role`, aucun e-mail envoyé).
Verrou : `tests/e2e/confirmation-email.spec.js` (7). Les quatre conséquences détaillées (chemins morts d'`onbDoAuth`, renvoi de lien, anti-énumération, `authz-critical` comme barrière RLS, risque R11 DKIM/DMARC) : `docs/CONFIRMATION_EMAIL.md`.

## 🙋 NOM D'UTILISATEUR DEMANDÉ À LA CRÉATION DU COMPTE (2026-09-09)

Rapport d'un testeur : « à l'inscription le nom d'utilisateur n'est pas demandé ». Il l'était — à l'étape `name` de l'onboarding, qu'un compte neuf **peut ne jamais atteindre** depuis « Confirm email » (2026-08-30) : quand `signUp` ne rend pas de session, la personne revient par « Se connecter », branche qui pose `onboarded = true` et RECHARGE, et `boot()` entre directement dans l'app — le compte s'appelle alors « **Passionné** » (repli local) ou « **Profil** » (repli de `supaEnsureProfileExists`). La question est désormais posée au **SEUL écran que tout compte traverse** : le formulaire de création (`#authName`, premier champ, montré par `switchAuthTab` en mode `signup` uniquement).
⚠️ **CE QUE LA PRODUCTION DIT VRAIMENT (mesuré le 2026-09-10, et il faut le lire avant de raisonner sur ce lot).** « Tout compte créé depuis le 30/08 s'appelle Passionné » était une DÉDUCTION, pas une mesure, et elle est **fausse** : `select count(*) filter (where username in ('Passionné','Profil','Moi')) from public.profiles` rend **0 sur 6 comptes**. Le seul compte créé depuis a sa ligne `profiles` **26 secondes** après son compte auth, **avec son nom ET sa passion** — donc `signUp` LUI A RENDU UNE SESSION et l'onboarding a continué (lien de confirmation ouvert en 21 s sur le même téléphone). **Les DEUX chemins sont vivants**, et la moitié « sans session » n'a simplement pas encore de cas en base. Ne jamais réécrire ce paragraphe en « le nom n'était jamais demandé » : le défaut rapporté par le testeur est que le **formulaire d'inscription** ne le demandait pas, ce qui est vrai et corrigé ; « le compte s'appelle Passionné » reste un chemin POSSIBLE, jamais un fait constaté.
⚠️ **LA MÊME QUESTION NE SE POSE PAS DEUX FOIS** (2026-09-10) : ce chemin vivant fait justement enchaîner le formulaire (« Nom d'utilisateur ») sur l'étape « Comment t'appelles-tu ? ». `onbNext`/`onbPrev` sautent donc l'étape `name` quand `nomCompteValide(state.user.name)` rend un nom — **dans les DEUX SENS**, sinon le « ← Retour » de l'écran des passions rouvre l'étape évitée. ⚠️ **Sauter une étape, c'est sauter ce qu'elle PRÉPARAIT** : `onbValidateName` peignait la grille des passions et rejouait `PassioFirstRun.prefiller()` APRÈS son `onbNext()` — c'est passé dans `_onbPreparerEtape`, sans quoi l'écran suivant s'ouvre VIDE, défaut muet qu'aucune gate ne voit.
⚠️ **`nomCompteValide` (app-02) est la SEULE autorité** : normalise les blancs, refuse hors de `[2, 40]`, et l'appelant ne re-teste rien. Le refus se prononce **avant** tous les autres contrôles — c'est le premier champ de l'écran.
⚠️ **`user_metadata` est la seule mémoire qui VOYAGE** (créer sur le téléphone, confirmer sur l'ordinateur) : le nom part dans `signUp` sous DEUX clés de même valeur (`name`, relue par `nomCompteDepuisSession` ; `display_name`, affichée par le tableau de bord Supabase), et `boot()` l'applique par `appliquerNomCompte(session)` **après** `supaLoadUserState` (l'état du compte fait foi) et **avant** le profil de repli, qui lit `state.user.name`. `full_name` couvre au passage le retour Google.
⚠️ **On n'écrase JAMAIS un nom déjà choisi** — seuls les noms de remplissage (`""`, `Passionné`, `Profil`, `Moi`) cèdent, sinon un compte renommé depuis les Paramètres retrouverait son pseudo d'origine à chaque reconnexion ; et `general.username` PRIME sur `state.user.name` dans `supaEnsureProfileExists`, donc les deux sont écrits. ⚠️ **Aucune unicité n'est promise** : `profiles.username` n'a pas d'index unique en production.
⚠️ **UN SERVEUR `dist/` LAISSÉ EN VIE FAUSSE TOUS LES TESTS LOCAUX** (mesuré le 2026-09-10) : `webServer` de Playwright RÉUTILISE un serveur déjà à l'écoute sur le port 8080. Un `node scripts/servir-dist.js` oublié fait donc mesurer l'ARTEFACT PRÉCÉDENT au lieu des sources — ici, quatre cas neufs rouges et onze verts qui ne prouvaient rien. Symptôme : une fonction que l'on vient d'écrire est `<absente>` de la page. `pkill -f servir-dist.js` avant tout `npm run test:local`.
Verrou : `tests/e2e/nom-utilisateur-inscription.spec.js` (14), dont ⑦ qui mesure le CÂBLAGE à la source et sa position — le seul appelant vit dans un chemin de `boot()` qu'un banc local ne parcourt pas. Détail et point ouvert (les comptes déjà nommés « Passionné ») : `docs/lots-ui/22-NOM-UTILISATEUR-INSCRIPTION-2026-09-09.md`.

## 🎬 LE VIEUX TOUR REVENAIT SUR TOUT COMPTE NEUF — « Confirm email » avait tué son seul garde-fou (2026-09-12)

Rapport d'essai réel : « je viens de créer un compte, la validation par mail a fonctionné, mais en
arrivant sur l'app c'était l'ancien système de présentation ». Mesuré : compte créé à 11:06:37,
confirmé à 11:07:39, et le **tour historique plein écran** (`#tourOverlay`, « Étape 1 / 5 ») s'ouvrait
par-dessus le Fil — au lieu de l'arrivée directe et des aides au geste. Reproduit au banc.
⚠️ **CE N'EST PAS UNE RÉGRESSION DU LOT PREMIÈRE VISITE : C'EST SON GARDE-FOU QUI EST MORT DE VIEILLESSE.**
La règle §8 (« le tour long ne doit pas suivre l'inscription, la compréhension vient du produit ») a été
posée le 2026-08-23 **dans `onbFinish`**, qui pose `tourSeen = true` au lieu d'appeler `launchTourSafe`.
Son propre commentaire disait déjà pourquoi sauter le seul appel ne suffisait pas — quatre appelants, trois
gardés par `if (!state.tourSeen)`. Sept jours plus tard, « Confirm email » (2026-08-30) a rendu `onbFinish`
**inatteignable pour tout compte neuf** : `signUp` ne rend plus de session. **Un remède posé à UN endroit
meurt le jour où cet endroit cesse d'être sur le chemin, et rien ne le signale.**
⚠️ **LA CHAÎNE, ET LE MAILLON QUE PERSONNE NE REGARDAIT** : lien de confirmation (ou « Se connecter ») →
`adopterCompteConnecte` **PURGE `STATE_KEY`, donc `tourSeen`** → rechargement → `boot()` pose
`onboarded = true` et rend le Fil → **et ~600 ms plus tard `emoji-misc.js` appelle `initApp()`**, qui teste
`!state.tourSeen` et lance le tour. L'appelant fatal n'est ni `boot()` ni l'onboarding : c'est un
`setTimeout` de fin de fichier, écrit en 2026-06 pour un tout autre motif. Chercher « qui lance le tour »
dans `boot()` ne le trouve jamais.
⚠️ **LA RÈGLE VIT DÉSORMAIS DANS `launchTourSafe` (app-08), seul entonnoir des lancements AUTOMATIQUES** :
`if (typeof onbV2Actif === "function" && onbV2Actif()) return;`. Aucun appelant, présent ou futur, ne peut
plus imposer le tour. `startTour()` (bouton « Tour démo », panneau de dev) ne passe pas par là et reste
entier — **un refus d'imposer n'est pas un retrait** — et la coupure `PASSIO_ONBOARDING_V2 = false` rend le
parcours historique à l'octet près, `onbFinish` compris.
⚠️ **L'ANGLE MORT ÉTAIT DANS LE FIXTURE, ET C'EST LE VRAI ENSEIGNEMENT** : `onboardedState` (`app-helper.js`)
pose `tourSeen: true`. Les ~120 suites qui l'utilisent démarrent donc **toutes dans le seul état où le défaut
ne peut pas se produire**. Aucune n'était fausse ; ensemble elles étaient aveugles. **Un fixture qui neutralise
la condition d'un défaut le rend invisible à toute la batterie** — vérifier ce qu'un fixture pose *en dur*
avant de conclure qu'un chemin est couvert.
⚠️ **`offsetParent` NE MESURE RIEN SUR UN ÉLÉMENT `position: fixed`** : il y vaut `null` affiché comme masqué.
Écrit ainsi, le cas ① bis restait VERT sous réinjection du défaut. Pour un élément fixe, mesurer le `display`
calculé et le rectangle. Trouvé parce que la réinjection était faite, pas parce qu'on l'a relu.
⚠️ **Les bulles, elles, fonctionnaient** : `montrerHint` ne s'efface que tant que `PassioFirstRun.estVisiteur()`
est vrai, donc un compte les reçoit (`hint_shown` mesuré sur le compte neuf à 11:07:50). Le défaut n'était pas
« les bulles ont disparu », c'était « le vieux tour se posait par-dessus » — ne pas partir chercher les aides.
⚠️ **POINT OUVERT, DE LA MÊME FAMILLE, NON CORRIGÉ ICI** : un appareil qui PORTE un compte (`passio_uid` ou
`state.onboarded`) mais dont la session n'est pas retrouvée au démarrage (jeton expiré, hors ligne, SDK non
chargé) sort de `boot()` par **`showLanding()`** — donc sur la landing historique, ses 8 piliers, sa mention
« Beta privée » et sa promesse « Documente tes voyages » (Carnet de voyage RETIRÉ par ADR-011). Elle reste
fonctionnelle (elle porte « Se connecter »), mais elle raconte une application qui n'existe plus.
Verrou : `tests/e2e/tour-jamais-impose.spec.js` (5), dont ①, ① bis et ④ éprouvés par RÉINJECTION (② et ③
restent verts, ils gardent la coupure et le geste manuel) et ④ qui mesure à la SOURCE que `showTour()` n'a
pas d'appelant hors du moteur du tour.

## 💬 LES TROIS REPÈRES ATTEIGNENT AUSSI UN COMPTE NEUF (2026-09-12, l'après-midi)

Suite directe de la fiche précédente. Question de Benjamin : « toutes les bulles d'explications sont
en place sur les nouveaux comptes ? » **Mesuré : non.** Les trois repères (« Ce qui t'inspire » ·
« Ce que tu veux vivre » · « Ce que tu veux partager ») étaient gardés par `estVisiteur()` : ils
s'éteignaient à la seconde où un compte existe — **pour exactement les personnes à qui l'application
est envoyée**. Quelqu'un qui explore d'abord les voit ; quelqu'un qui crée son compte directement
(lien de confirmation sur un appareil neuf, chemin NORMAL depuis « Confirm email ») ne les voyait
JAMAIS, et ne pouvait pas les rejouer — « Revoir les repères » portait `.fr-only`, donc
`display:none` dès qu'un compte existe. Troisième occurrence de la même famille après
`contenuDemoSignale()` et `filDecouverte()` (2026-09-10) : **c'est l'ÉTAT qui décide, jamais la
présence d'un compte.**
⚠️ **LA CARTE DE BIENVENUE, ELLE, RESTE VISITEUR — ET C'EST SON TEXTE QUI TRANCHE.** « Crée ton
compte pour les garder », « Personnaliser mon expérience » : c'est une carte de **CONVERSION**. La
montrer à quelqu'un qui vient de créer son compte serait sourd. `poserBienvenue` garde `estVisiteur()`,
et le verrou ⑦ l'exige à la source. Ne pas « harmoniser » les deux gardes : elles ne disent pas la
même chose.
⚠️ **`reperesAutorises()` (js/first-run.js) EST LA SEULE AUTORITÉ**, et elle a deux marches : sans
compte → visiteur, inchangé ; avec compte → **il faut le verdict d'hydratation PUIS
`comptePasEncoreGarni()`**.
⚠️ **LE DISCRIMINANT NE PEUT PAS ÊTRE « PRÉFÉRENCES LOCALES VIDES ».** Un habitué qui se connecte sur
un téléphone neuf en a d'aussi vides : `adopterCompteConnecte` vient de tout purger. On tranche sur
l'état du COMPTE (`comptePasEncoreGarni()` — aucune passion voulue, personne de suivi), la même
autorité que `filDecouverte()`. Le verrou ② mesure ce cas-là, c'est lui qui protège les habitués.
⚠️ **ET IL FAUT ATTENDRE `window._etatCompteCharge`.** Interrogé trop tôt, `comptePasEncoreGarni()`
dit « vide » pendant que `user_state` arrive encore : on servirait la présentation à quelqu'un qui
utilise PASSIO depuis des semaines. Sans verdict, on s'abstient — le silence est le bon sens de
l'échec ici.
⚠️ **LE DÉFAUT INTRODUIT PAR LA PREMIÈRE RÉDACTION, ET IL ÉTAIT MUET.** `planifierReperesCompte`
appelait `planifierTour()` **UNE FOIS**. Or `planifierTour` temporise 700 ms puis abandonne **sans
reprise** si l'écran n'est pas prêt : à ~2,1 s le Fil n'a pas fini de peindre, `#feedPassionsBlock`
n'existe pas encore, `montrerEtape` refuse l'ancrage sur `offsetParent`, et **rien ne se reproduit**.
Chez un visiteur le défaut n'existe pas — `planifierAccueil` réessaie 40 fois et rappelle
`planifierTour` à chaque tour ; un compte n'avait pas cette boucle. **Mesuré** : la fonction rendait
`true` en appel direct à 5 s pendant que le câblage ne posait jamais rien. Le planificateur du compte
est donc une BOUCLE DE REPRISE bornée (40 × 600 ms, même budget que l'accueil). **Relâcher une garde
ne suffit pas : il faut vérifier qui APPELLE, et à quel moment l'écran est prêt.**
⚠️ **SANS POINT D'ENTRÉE, LE LOT SERAIT RESTÉ MUET.** `planifierTour` n'avait que deux appelants —
`planifierAccueil` (gardé `estVisiteur()`) et `surNavigation("feed")` — et `entreeDirecte()`, qui
appelle le premier, rend `false` dès qu'un compte existe. Au DÉMARRAGE, rien ne planifiait donc les
repères pour un compte. `surNavigation("feed")` bifurque désormais : visiteur → `planifierAccueil`,
compte → `planifierTour` directement (sinon le retour sur le Fil ne reposerait jamais rien).
⚠️ **LA GARDE DE `montrerHint` (app-02) DEVAIT SUIVRE, SOUS PEINE DE ROUVRIR UN DÉFAUT CONNU.** Elle
lisait `estVisiteur()` ; dès que les repères atteignent un compte, elle ne protège plus rien et les
quatre aides contextuelles se seraient posées SUR les repères — le défaut exact mesuré en capture
390 px (« une bulle POSÉE SUR la carte de bienvenue »). `aidesHistoriquesEnPause()` est la seule
autorité : **branche visiteur rendue à l'octet près** (pause toute la session), et pour un compte la
pause ne dure que le temps de la présentation — sinon on lui retirerait des aides qu'il recevait hier.
⚠️ **LA PORTE DE REJEU EST PILOTÉE EN JS, PAS EN CSS, ET DÉLIBÉRÉMENT.** `majBoutonReperes()`
(app-02, appelée par `toggleDevPanel` comme `majSectionCompte` et `majBoutonPassionsIllimitees`) :
la règle `html:not(.passio-first-run) .fr-only` ne sait pas exprimer « le module est chargé », et
ajouter une règle obligerait à toucher `styles.css`, **dont le bloc UI-4A5 doit rester le DERNIER**.
Sa condition n'est **ni « visiteur » ni « compte neuf »** : c'est le KILL SWITCH du lot, et rien
d'autre — un compte qui a déjà vu les trois repères doit pouvoir les revoir, c'est ce que le libellé
promet. Lot coupé → le bouton DISPARAÎT plutôt que de rendre un tap mort (`relancerTour` sortirait
sur la garde `actif()` : un refus qui ne se prononce pas est indiscernable d'une panne, 2026-09-04).
⚠️ **`armerAidesAuGeste` RESTE VISITEUR**, et c'est un choix de PÉRIMÈTRE : il n'est armé que par
`entreeDirecte()`. Le relâcher ajouterait trois à quatre bulles de plus (passions, envies, stories)
à un compte neuf — hors de ce qui a été demandé. Sa garde interne est restée `estVisiteur()` pour ne
pas laisser de code inerte derrière.
⚠️ **MESURER `offsetParent` SUR UN BOUTON DU PANNEAU PARAMÈTRES NE PROUVE RIEN** : la section
« Démo » est REPLIÉE au repos, donc `offsetParent` y est nul pour tous ses boutons, quoi qu'on
fasse. Le verrou ⑤ mesure le `display` calculé. (Deuxième piège `offsetParent` de la journée, après
celui du `position: fixed` — les deux trouvés par la mesure, aucun par la relecture.)
Verrou : `tests/e2e/reperes-compte-neuf.spec.js` (7), éprouvé par RÉINJECTION de **quatre** mutations
(garde de `montrerEtape`, câblage du planificateur, garde de `montrerHint`, pilotage de la porte) —
elles rougissent respectivement 4, 3, 2 et 1 cas.

## ⚖️ TEXTES LÉGAUX LISIBLES SANS CODE D'ACCÈS (2026-09-11)

La LCEN (art. 1-1) impose des mentions légales à la disposition du PUBLIC ; le rideau du code d'accès masquait tout, et **en production `dist/app.js` — où vivaient les textes — n'est injecté qu'APRÈS le déverrouillage** : un visiteur sans code ne pouvait lire ni qui édite, ni qui héberge, ni comment joindre l'éditeur. Les textes et l'identité de l'éditeur vivent désormais dans **`js/legal-textes.js`**, script de TÊTE chargé juste après `access-gate.js` (donc inliné dans `index.html` par `scripts/build.js`, jamais dans `app.js`) : `PASSIO_EDITEUR`, `PASSIO_CGU_VERSION`, `PASSIO_CONFIDENTIALITE_VERSION`, et trois fonctions qui rendent le CORPS de chaque texte — `passioTexteMentionsLegales()`, `passioTexteCGU()`, `passioTextePolitique()`. L'écran du rideau (trois liens sous le pied, panneau `#pgLegalPanel`) et les modales d'app-02 (`openLegalNotice`, `openTermsOfService`, `openPrivacyPolicy`, réduites à l'enveloppe `_legalModale`) rendent le MÊME HTML.
⚠️ **UNE SEULE SOURCE, MESURÉE À L'OCTET** : `access-gate.spec.js` compare l'`innerHTML` du panneau du rideau à celui de la modale d'app-02 pour les trois textes. Toute retouche d'un texte se fait dans `legal-textes.js`, jamais dans une enveloppe. Les rendus des quatre modales ont été mesurés identiques avant/après le déplacement (1 812, 7 557, 4 713 et 1 654 caractères).
⚠️ **Ce fichier s'exécute AVANT l'application** : aucune fonction d'app-* n'y existe (`escapeHtml`, `openModal`, `$`). D'où `_legalEscapeHtml`, même table que `escapeHtml`, inscrite comme désinfectant dans `scripts/audit-echappement.js` — ne jamais faire diverger les deux tables.
⚠️ **Lire n'est pas entrer — et `aria-modal` n'isole RIEN par lui-même.** La relecture indépendante du lot a trouvé que Shift+Tab depuis le bouton × rejoignait les trois liens puis LE CHAMP DU CODE, invisibles sous l'overlay : quatre chiffres tapés là déverrouillaient l'application pendant la lecture. D'où, à l'ouverture, **`card.inert = true`** sur la carte du code (levé à la fermeture), le focus posé sur le × (`legalClose.focus()`), `focusInput` qui s'abstient tant que `legalOuvert` est posé (le focus différé de 700 ms du démarrage — mesuré avec `page.clock`, sans horloge simulée le clic arrive toujours après `load` et le cas ne mesure rien), et une garde de saisie qui vide le champ si un chiffre l'atteint quand même (navigateurs sans `inert`). Échap s'écoute au niveau du **document** (un clic sur un `<p>` du corps pose le focus sur `<body>`, et un keydown ciblé sur `<body>` ne traverse jamais `#passioGate`) et la carte du panneau est focalisable (`tabindex="-1"`). `#pgLegalPanel[hidden]{display:none}` est obligatoire : `[hidden]` ne replie rien sur un `display:flex` (fiche 19).
⚠️ **Pas de repli silencieux** : si `legal-textes.js` manque, le panneau ÉCRIT « Texte indisponible » ; `dist-build.spec.js` l'attrape sur l'ARTEFACT, où c'est le build qui décide de ce qui vit en tête de page.
⚠️ **`npm run verif` sur un poste Windows en `core.autocrlf=true`** (mesuré le 2026-09-11) : `audit-supa-stub`, `generer-ouverture --verifier` et `passions:verifier` rougissent sur des fichiers INTACTS — ils cherchent ou comparent des fins de ligne LF, et le poste a des CRLF (`git ls-files --eol` : `i/lf w/crlf`). Verts sur un worktree LF du même HEAD. Ce n'est pas le lot qui est rouge, c'est le poste ; la CI (Linux) fait foi. Les cinq autres gates ne dépendent pas des fins de ligne.
Verrous : `tests/e2e/access-gate.spec.js` (+6 : lisibles sans code · lire ne saisit rien · première seconde · inerte, mesuré APRÈS CHAQUE Shift+Tab · Échap après un clic dans le texte · source unique) et `tests/e2e/dist-build.spec.js` (+1 : sans `app.js`). **Réinjection** (sept mutations) : script de tête retiré, focus non déplacé, source unique cassée, `inert` retiré, et `inert` + garde de saisie retirés ensemble **rougissent** chacun sur le cas visé ; la garde de `focusInput` seule et `tabindex=-1` seul **restent verts** — chacun est doublé par une couche plus forte (`inert`, l'écoute d'Échap sur le document). C'est une défense en profondeur assumée : le verrou protège le comportement, pas chaque couche. Détail : `docs/CGU_ET_MENTIONS_LEGALES.md` §5 bis.

## ⚖️ CGU, MENTIONS LÉGALES ET CONSENTEMENT (2026-09-08)

Trois manques comblés avant l'ouverture à de vrais utilisateurs : le contrat (`openTermsOfService`), l'identité de l'éditeur (`openLegalNotice`) et le geste qui forme le contrat (case `#authConsent`). La politique de confidentialité, elle, existait déjà.
⚠️ **`PASSIO_EDITEUR` (app-02 jusqu'au 2026-09-11, désormais `js/legal-textes.js`) est la SEULE source de l'identité de l'éditeur, et elle n'invente RIEN.** `openAbout()` affichait « PASSIO SAS · France · contact@passio.app » — une forme juridique, un pays et une adresse qu'aucun document du dépôt n'établit, la dernière contredisant l'adresse réelle de la politique de confidentialité.
⚠️ **UN TROU N'EST PAS TOUJOURS UN TROU, et la première version a fait la faute SYMÉTRIQUE** : elle affichait huit « [à compléter] » parce qu'elle supposait un éditeur PROFESSIONNEL. Il n'y a pas de société — PASSIO est édité par une **personne physique à titre non professionnel** — et **annoncer huit manquements là où la loi n'en constate aucun est une deuxième façon de dire faux**. D'où **`PASSIO_EDITEUR.regime`, seul interrupteur** : `"particulier"` (actuel) publie l'identité COMPLÈTE de l'hébergeur du site et **rien d'autre**, sans aucun `[à compléter]` ; `"societe"` exige les huit champs et affiche « [à compléter] » EN CLAIR tant qu'ils sont vides. **Basculer est OBLIGATOIRE au premier encaissement** (les passions payantes en sont le déclencheur) : l'anonymat suppose un service non professionnel, c'est un abri temporaire, pas une destination.
⚠️ **NE PLUS CITER L'ARTICLE 6-III DE LA LCEN : il est ABROGÉ** (loi n° 2024-449 du 21 mai 2024, dite SREN). L'identification de l'éditeur est à l'**art. 1-1**, l'anonymat du non-professionnel à l'**art. 1-1, II**. **L'art. 6-I-5 est abrogé aussi** — le signalement de contenu illicite relève du **DSA (règlement UE 2022/2065), art. 16** depuis le 17 février 2024. **Une mention légale qui cite un article mort est une mention légale fausse** ; le verrou ⑧ refuse `6-III` et `6-I-5` dans le texte rendu.
⚠️ **L'anonymat tient à DEUX conditions CUMULATIVES** : publier le nom ET l'adresse postale complète de l'hébergeur du SITE (Netlify, Inc., 101 2nd Street, San Francisco — dans ce régime ce n'est pas un détail, c'est la SEULE identité publiée), et lui avoir communiqué ses éléments d'identification. **L'hébergeur du site (LCEN) n'est pas le sous-traitant des données (RGPD, Supabase)** : les confondre publierait la mauvaise identité. Un juriste doit relire les deux textes.
⚠️ **Le consentement n'est demandé qu'où un contrat se forme** : la case n'est à l'écran qu'en mode `signup` (`switchAuthTab`), et `onbGoogleAuth` l'exige dans ce mode SEULEMENT — le bouton Google est unique pour les deux modes. `state.user.cgu = { version, acceptedAt }` : **sans la version, « a accepté » ne dit rien**, une réécriture des CGU rendrait la trace inexploitable (`PASSIO_CGU_VERSION`).
⚠️ **Le piège du `<label>`** : les liens vers les CGU et la politique vivent DANS le label de la case — l'activation d'un label part du clic sur un de ses descendants, donc ouvrir les CGU COCHERAIT le consentement, un accord donné par le geste qui sert à le lire. D'où `preventDefault` + `stopPropagation` sur les deux liens (même famille que « `input.click()` remonte à son conteneur »). ⚠️ `switchAuthTab` pose `display: "flex"` et **jamais `""`** : `label.field` est `display:block` en CSS, rendre la main au CSS remettrait le texte SOUS la case.
⚠️ **Les CGU ne décrivent que ce que le code applique** (13 ans → `onbValidateAge` ; majorité IRL → `requireAdmission` ; signalement → `reportUser`/`blockUser` ; suppression du compte). Changer une de ces portes rend le texte MENTEUR, et aucun test ne peut le voir.
Verrou : `tests/e2e/cgu-consentement.spec.js` (11), dont ⑧/⑧ bis qui mesurent les DEUX régimes et ⑩ qui n'ouvre les Paramètres que par des GESTES. Détail, champs à renseigner et points ouverts : `docs/CGU_ET_MENTIONS_LEGALES.md`.

## 🔞 PASSIO EST RÉSERVÉ AUX MAJEURS (2026-09-09) — la règle change, pas la barrière

L'app passe de **13 ans** à **18 ans révolus** : `onbValidateAge` (app-02) refuse en dessous de 18, la case de consentement, les CGU (§2, §3, §7, §10, §11) et la politique de confidentialité (§6) le disent, et `PASSIO_CGU_VERSION` passe à `"2026-09-09"` — **la version SUIT le texte**, sinon un accord donné sur les CGU « 13 ans » vaudrait pour celles « 18 ans ».
⚠️ **« Réservé aux majeurs » est une règle CONTRACTUELLE, pas une garde technique, et le texte le dit.** L'âge est **DÉCLARATIF** : rien ne le vérifie. La seule barrière SERVEUR de majorité est la RLS de l'IRL (`irl_adult_only`) ; le fil, les messages et les publications n'en ont AUCUNE. Ne jamais écrire ni laisser croire que l'âge est contrôlé.
⚠️ **NE PAS remonter à 18 le pré-filtre d'`admissionValiderAnnee` (app-07)** — erreur commise puis défaite le jour même, révélée par le verrou « l'année part quand même au serveur ». Entre 13 et 17 ans la déclaration doit **PARTIR au serveur** pour y être enregistrée : c'est elle qui rend le refus DURABLE. Refuser localement ne garde RIEN, donc la personne ressaisit une autre année et passe. Le pré-filtre n'écarte qu'une saisie absurde (< 13 ans), et son message ne cite plus aucun seuil d'accès.
⚠️ **Cible supprimée = tout ce qui la vise part avec** : `admissionRefusHTML` promettait « le fil, les passions, les messages te reste ouvert » — faux dès que l'app entière est 18+. Le texte ET son verrou sont partis avec la règle.
⚠️ **UN `+` EN TROP A AVALÉ UN ARTICLE ENTIER DES CGU, sans une erreur.** L'insertion du §11 a laissé `p(§11) + +p(§12)` : le `+` unaire sur une chaîne rend **`NaN`**, et « 12. Fin du contrat » a disparu du rendu, remplacé par le texte `NaN`. **`node --check` était vert, les 8 gates étaient vertes** — seul le verrou e2e `/supprimer ton compte/i` l'a vu. Toute insertion dans une chaîne concaténée par `+` se relit **au rendu**, jamais au parseur.

**Les clauses de protection du lancement** (beta diffusée à des testeurs) sont dans les CGU et **verrouillées une par une** par `cgu-consentement.spec.js` ⑦ : service EN L'ÉTAT sans garantie, données pouvant être perdues, aucune vérification des membres, rencontres « à tes risques et périls », obligation de moyens, §11 « Ta responsabilité » (seul responsable + garantie de l'éditeur). ⚠️ **La réserve d'ordre public est ce qui rend la limitation OPPOSABLE** : une clause qui exonère de TOUT est réputée non écrite (clause abusive) et peut faire tomber l'article entier — `dol, faute lourde, dommage corporel` restent réservés, et le verrou l'exige. Ne jamais « nettoyer » cette phrase comme une redite.

## 🔞 ADMISSION 18+ ET COLONNES EXPLICITES — le CLIENT (2026-09-08)

Une migration appliquée en production le 2026-09-08 retire à `anon` le droit de lire `events.address` et `events.contact` (l'adresse exacte d'un rendez-vous et le téléphone de son organisateur étaient lisibles SANS COMPTE), et réserve `event_attendees` aux comptes connectés. Ce lot est la contrepartie CLIENT, obligatoire.
⚠️ **`select("*")` EST LE PIÈGE.** PostgREST refuse la requête ENTIÈRE (42501) dès qu'UNE colonne manque au rôle : un `*` ne masque pas deux champs, il fait **disparaître toutes les rencontres** pour tout visiteur sans compte. `supaLoadEvents` demande donc `_EVENT_COLS_PUBLIC` / `_EVENT_COLS_PRIVE` en toutes lettres, avec repli mémorisé sur la liste publique au premier refus — il fonctionne donc avant comme après la migration. **Toute colonne ajoutée à `events` doit l'être AUSSI dans ces listes**, sinon elle ne remonte pas : un oubli se voit comme une donnée vide, jamais comme une erreur.
**La porte d'admission 18+** (`requireAdmission(ctx)`, app-07) est posée sur `setEventRsvp` et `submitEvent`, APRÈS `requireAuthentication` — on ne demande pas son âge à quelqu'un sans compte. Le RETRAIT n'est jamais gardé (`null` et `declined` passent toujours). `admissionRappelServeur()` pousse au démarrage l'année déjà saisie, pour que les comptes EXISTANTS soient admis sans rien ressaisir.
⚠️ **CETTE PORTE ÉCHOUE OUVERT, et c'est l'inverse VOULU de `irlProposalVerdict`** : elle double une frontière déjà tenue par la RLS, donc un statut illisible (règle serveur absente, réseau coupé) la rend TRANSPARENTE — retenir couperait l'IRL à tout le monde pour une panne de courtoisie. Ne jamais la « durcir » en fail-closed.
⚠️ **`MY_UID` NE PROUVE PAS QU'UN COMPTE EXISTE, et la porte l'a enfreint** : `getMyUserId()` fabrique un `u_<aléatoire>` pour TOUT visiteur, donc la garde s'ouvrait AU BOOT et le rappel partait appeler le RPC en production sous une identité inexistante — en consommant son drapeau « une fois par session ». **Invisible en local** (le SDK vient d'un CDN, `_supaReal` reste faux) et **rouge en CI**, qui l'atteint : un test vert en local et rouge en CI est presque toujours une divergence d'environnement de cette famille. `admissionCompteReel()` exige désormais un vrai uuid Supabase.
Verrou : `tests/e2e/admission-18-plus.spec.js` (17).

## 🔞 ADMISSION 18+ — fondation serveur APPLIQUÉE EN PRODUCTION le 2026-09-08, interrupteur **ALLUMÉ** (mesuré le 2026-09-10)

`migrations/migration_admission_18_plus.sql` branche enfin la garde de majorité de #136 sur les surfaces d'écriture IRL : **organiser** (`events` INSERT), **s'inscrire / changer d'avis / pointer** (`event_attendees` INSERT et UPDATE) et **rejoindre la conversation** (`can_join_event_conversation`) exigent `user_safety.majority_at <= CURRENT_DATE`. Le défaut qu'elle ferme (audit IRL-02/MOD-08) n'était pas une barrière cassée : la barrière existait depuis #136 et **rien ne l'appelait** — `irl_interaction_allowed` ne vivait que sous `passio_irl_proposal_v1`, éteint.
**Le RETRAIT n'est JAMAIS conditionné** : passer en `declined` et supprimer sa ligne restent permis à tous — un compte rattrapé par la règle doit pouvoir sortir, jamais revenir (et le check-in réécrit `rsvp='going'`, donc il est couvert par la même policy UPDATE).
⚠️ **Interrupteur SERVEUR** (`public.access_policies`, clé `irl_adult_only`) — le premier du dépôt, les 35 autres drapeaux étant côté client : `UPDATE … SET enabled = TRUE` par le canal ③ d'ADR-012. **Il est ALLUMÉ depuis (au plus tard) le 2026-09-10 : `enabled = true`, mesuré.** Cette fiche a annoncé « ÉTEINT » jusque-là — une affirmation de sécurité fausse, et la plus coûteuse des trois familles de dette documentaire : elle décide d'un geste. **L'état d'un interrupteur SERVEUR ne se lit pas dans un fichier du dépôt, il se mesure** (`select key, enabled from public.access_policies`, canal ① d'ADR-012). Conséquence VIVANTE : sur 7 comptes de production, **2 seulement** ont une ligne `user_safety` — les 5 autres passent donc par la fenêtre « Ton année de naissance » (`requireAdmission` → `undeclared` → `admissionOuvrirPorte`) avant de pouvoir organiser ou rejoindre une rencontre. C'est le comportement VOULU, pas un défaut : le vérifier avant de « réparer » quoi que ce soit. **Ne JAMAIS supprimer la ligne pour éteindre** : `adult_access_enforced()` est fail-closed, ligne absente = admission **EXIGÉE**. La table n'est ni lisible ni écrivable par `anon`/`authenticated` (aucun GRANT, aucune policy).
**La porte CLIENT est branchée** (`requireAdmission(ctx)`, app-07, posée sur `setEventRsvp` et `submitEvent` APRÈS `requireAuthentication`) et `admissionRappelServeur()` pousse au démarrage l'année déjà saisie, pour que les comptes EXISTANTS soient admis sans rien ressaisir. ⚠️ **CETTE PORTE ÉCHOUE OUVERT, et c'est l'inverse VOULU de `irlProposalVerdict`** : elle double une frontière déjà tenue par la RLS, donc un statut illisible (migration non appliquée, réseau coupé) la rend TRANSPARENTE — retenir couperait l'IRL à tout le monde pour une panne de courtoisie. C'est ce qui rend le lot déployable AVANT la migration. Ne jamais la « durcir » en fail-closed. ⚠️ ORDRE D'ALLUMAGE : migration → contrôles verts → client déployé → PUIS `enabled = TRUE`. Allumer avant le client couperait l'IRL à tout le monde (2 lignes `user_safety` pour 6 comptes en prod).
⚠️ **`MY_UID` NE PROUVE PAS QU'UN COMPTE EXISTE, et la porte l'a enfreint** : `getMyUserId()` fabrique un `u_<aléatoire>` pour TOUT visiteur, donc `admissionCanalPret()` s'ouvrait AU BOOT et `admissionRappelServeur()` partait appeler le RPC en production sous une identité inexistante — en consommant son drapeau « une fois par session ». **Invisible en local** (le SDK vient d'un CDN, `_supaReal` reste faux) et **rouge en CI**, qui l'atteint : un test vert en local et rouge en CI est presque toujours une divergence d'environnement de cette famille. `admissionCompteReel()` exige désormais un vrai uuid Supabase. Le client demande sa propre porte par `adult_access_status()` → `off` | `admitted` | `undeclared` | `minor` ; `adult_access_enforced()` et `is_adult_declared()` sont des aides internes **sans EXECUTE pour `authenticated`**. ⚠️ **Un `WITH CHECK` ne voit que la ligne FINALE, jamais l'ancienne** : l'exception « declined » laissait un compte non admis écrire `checked_in_at`, `rating` et `feedback` (une preuve de participation) dans la même requête, et la policy « Update organisateurs », sans `WITH CHECK`, rendait `author_id` réassignable par un co-organisateur. Les deux passent donc par des TRIGGERS (`trg_event_attendees_admission`, `trg_events_admission`), seuls à voir `OLD`. ⚠️ Un garde de dérive qui ne cherche que `cmd = 'INSERT'`/`'UPDATE'` est AVEUGLE à une policy `FOR ALL` (`cmd = 'ALL'`) — le gabarit « Enable all operations » du tableau de bord Supabase, donc la dérive la plus probable. Verrous : `tests/sql/migration-admission-18-plus.test.sh` (133 contrôles, gate CI) et `tests/e2e/admission-18-plus.spec.js` (16), qui joue les DEUX états de l'interrupteur, 14 mutations et 26 contrôles d'exploitation. Procédure, retour arrière et les huit points ouverts : `docs/ADMISSION_18_PLUS.md`.

## 🚪 PREMIÈRE VISITE — « l'application est elle-même le pitch » (ACTIF PAR DÉFAUT)

`js/first-run.js` (IIFE `window.PassioFirstRun`) : un visiteur sans compte entre DIRECTEMENT dans le fil — aucune landing, aucun formulaire, **aucune demande de permission** (GPS, notifications, caméra) — et ne rencontre l'inscription qu'à la première action engageante (`requireAuthentication(ctx)`). Coupures : `localStorage.passio_first_run_experience_v1="0"` et `window.PASSIO_FIRST_RUN_V1=false`. **Un compte existant n'entre JAMAIS dans ce parcours.** Aucun compte anonyme n'est créé, aucune RLS n'est desserrée.
Trois règles générales : **`MY_UID` ne prouve PAS qu'un compte existe** (seul un uuid Supabase le prouve) ; garder la fonction qui ÉCRIT ne suffit pas, il faut garder celle qui **OUVRE LA PORTE** (cas `meOpen` → caméra) ; tout module inliné hors bloc `BUILD:APP` doit écouter `passio:app-ready` et y remettre ses compteurs à zéro. ⚠️ **`js/first-run.js` doit être chargé AVANT le bloc `BUILD:APP`** dans `index.html` : `app-09` lance `boot()` dans une microtâche qui part dès que la pile se vide, donc avant l'exécution du script suivant — placé après, le module n'est pas encore évalué quand `boot()` le cherche.
Convention de test : une suite qui démarre d'un appareil VIERGE et attend la landing historique pose `poserGateSansPremiereVisite(page)` (`tests/e2e/gate-helper.js`) et garde TOUTES ses assertions. Verrou : `tests/e2e/first-run.spec.js` (38).
**Se connecter à un compte DÉJÀ créé (2026-09-02)** — sans landing, le formulaire n'est plus à l'écran, et un appareil neuf/vidé/déconnecté fait passer un inscrit pour un visiteur. Trois portes : le lien de la carte de bienvenue, l'entrée « Compte » des Paramètres (libellé réécrit par `majSectionCompte()` à chaque ouverture — le panneau est du balisage STATIQUE, et tout ce qui suppose un compte y est masqué pour un visiteur), et toute déconnexion volontaire. ⚠️ `doLogout('signin')` pose l'intention `passio_auth_intent_v1` **APRÈS** `purgeAccountScopedData` (clé d'APPAREIL hors `ACCOUNT_SCOPED_KEYS`, HORODATÉE — TTL 10 min, sinon un « mur de connexion » resurgit des jours plus tard) ; `boot()` la consomme au tout début et l'applique **APRÈS** `entreeDirecte()`, jamais avant : c'est `entreeDirecte()` qui CONSTRUIT le mode invité (classe racine, contenu public, bienvenue), la sauter rendait un fil à moitié bâti derrière « ← Continuer à explorer », sans une erreur. Une session survivante + une intention = déconnexion inachevée : on lit `{ error }` de `signOut` (le SDK ne lève pas), `purgerJetonAuthLocal()` ferme la session CÔTÉ APPAREIL (le jeton `sb-<ref>-auth-token` EST la session pour le SDK, et `ACCOUNT_SCOPED_KEYS` ne le connaît pas), puis on RECHARGE — la purge ne vide pas la MÉMOIRE, et `saveConversations` n'a pas de garde `_accountPurged` : poursuivre sans recharger réinstallerait les messages privés du compte quitté pour le suivant. Aucun second système d'auth : `openAuthScreen` délègue à `PassioFirstRun.allerConnexion` (étape `splash`, jamais `auth`, alias mort en `display:none`). Verrou : `tests/e2e/connexion-compte-existant.spec.js` (14).
⚠️ **L'ÉTAT LOCAL APPARTIENT À UN COMPTE, JAMAIS À L'APPAREIL (2026-09-02).** Explorer sans compte puis se connecter POUSSAIT l'état de l'exploration dans `user_state` du vrai compte, via le beacon de `pagehide` (`supaSaveUserStateBeacon`), dont `onbDoAuth` levait les TROIS gardes avant son `reload`. `adopterCompteConnecte(uid)` (app-02) purge l'état local quand l'appareil adopte un compte dont il ne provient pas, aux **TROIS** entrées (`onbDoAuth` signin, `boot()`, et `onAuthStateChange` — qui, lui, PROTÈGE sans purger ni recharger : y adopter casserait les quatre suites e2e à comptes réels, donc la CI, donc le déploiement). ⚠️ **Le discriminant est un INSTANTANÉ pris à l'évaluation d'app-02, jamais une relecture** : supabase-js notifie ses abonnés PENDANT `signInWithPassword`, donc `onAuthStateChange` a déjà réécrit `passio_uid` quand la garde le consulterait — elle ne se déclenchait alors JAMAIS sur le chemin le plus courant. Sonde d'écriture sur clé JETABLE (jamais `passio_uid`, sinon une interruption désarme la garde à vie). ⚠️ **`_peutPousserEtat()` interdit toute écriture d'état** (les DEUX chemins : `supaSaveUserState` et le beacon) tant que la restauration n'est pas confirmée (`passio_restauration_requise`, persisté, levé au premier verdict RÉUSSI de `supaLoadUserState`) ou que l'état appartient à un autre compte — sans quoi une seule lecture ratée après la purge EFFACE le compte. ⚠️ `attribuerEtatLocalAuCompte` est la contrepartie : inscription et `signInAnonymously` DÉCLARENT la propriété sans purger, sinon l'onboarding en cours est jeté. ⚠️ Le profil de remplissage fabriqué par `boot()` (`allPassions()[0]` = « Musique ») porte `_parDefaut` et n'est compté NULLE PART — ni dans le verdict serveur, ni dans `restoreFeedPassions`, ni dans le repli local ; les choix du visiteur passent en TÊTE de la fusion. ⚠️ Le parcours « mot de passe oublié » ne se recharge JAMAIS en cours de route (fragment consommé, lien à usage unique) : l'adoption est déplacée au changement effectif du mot de passe, et la branche « déconnexion inachevée » de #250 porte la même exception. ⚠️ **Tester la fonction ne suffit pas** : le câblage, non couvert, pouvait être supprimé sans un seul rouge.
⚠️ Une passion du référentiel plat s'affichait « ✨ Passion » sans son nom tant que le sélecteur n'avait pas été ouvert. `js/passions-flat.js` charge désormais le référentiel **uniquement si un identifiant à l'écran n'est pas nommé par le socle embarqué**, et APRÈS l'hydratation — l'invariant « 568 Ko jamais au démarrage » (`passions-plates.spec.js` ⑤ et ⑰ bis) tient. Charger ne suffit pas : il faut invalider `_lastHtml` et `_feedDomSig` avant de repeindre.
Les quatorze pièges mesurés, le fil de découverte, le catalogue additif `SPECIALITES`/`SYNONYMES`, la migration des préférences, la propriété de l'état local et les corrections après essai réel : `docs/PREMIERE_VISITE.md`. Verrous dédiés : `tests/e2e/exploration-anonyme-vs-compte.spec.js` (12) et `tests/e2e/connexion-compte-existant.spec.js` (15).
⚠️ **Une spécialité proposée sous une passion EST une passion du référentiel plat**, avec son identifiant canonique (`["cyclisme","Vélo et cyclisme"]`) : les identifiants fabriqués (`"sport:velo"`) n'entraient pas dans `_activeFeedPassions` et le fil ne montrait que la passion PARENTE. Les intérêts du fil sont **parente PUIS spécialités** (`interetsDuVisiteur`), jamais l'une à la place de l'autre, aux DEUX points d'écriture (`appliquerPrefs` et `migrerPreferences`) ; `npm run passions:verifier` refuse un identifiant absent de `data/passions/`.

---

## 🔥 PREMIÈRE VISITE — LES PASSIONS POPULAIRES EN DIRECT : la grille suit les publications (2026-10-06)

Les 12 tuiles du panneau « Qu'est-ce qui te passionne ? » étaient une liste écrite à la main le jour du lot (`POPULAIRES`, `js/first-run.js`) : Musique, Sport, Cuisine, Voyage en tête. Mesuré le 2026-10-06 sur 90 jours de publications VISIBLES d'un visiteur : Yoga 8 (2 auteurs), Podcast 2, puis Musculation, Photo, Voyage, Tech, Cuisine — et rien en Musique, Sport ni Art, trois des quatre premières tuiles. Un visiteur qui coche ce qu'on lui montre en premier arrivait sur un fil sans une publication de sa passion.

**Ce qui change** : les passions où des gens PUBLIENT passent en tête (`classerPopulaires` : d'abord le nombre de PERSONNES qui publient, puis le nombre de publications, puis la plus récente). La liste écrite COMPLÈTE, elle ne disparaît jamais : au plus 8 tuiles vivantes (`POPULAIRES_VIVANTES_MAX`), donc au moins 4 grands domaines toujours là, et sans réponse — base vide, refus, hors ligne, SDK absent — la grille est celle d'avant, à l'identique.
- **La lecture est celle du fil invité** : `posts`, trois colonnes (`passion_id, author_id, created_at`), 90 jours, 300 lignes au plus, clé anon — mêmes policies, donc la publication d'un compte privé n'y compte pas (le visiteur ne la verrait pas). Aucune écriture, aucun socket.
- **Quand** : différée de 1,5 s après la pose de la carte de bienvenue (pour que les tuiles ne se réordonnent pas sous le doigt), sinon à l'ouverture du panneau ; une seule en vol, gardée pour la page ; sans client réel (`window._supaReal`), rien — la prochaine ouverture réessaie, jamais en boucle. `{ error }` est LU et journalisé (`journal("populaires")`) : le SDK ne lève pas sur un refus.
- **Une passion précise du référentiel** (« Musculation ») n'est peinte qu'avec son libellé : tant que le référentiel n'est pas chargé, sa tuile attend (`assurerMetasPopulaires` le charge puis repeint) — jamais une tuile « Passion ✨ ». Retenue, elle est mémorisée dans `_refVues` comme un résultat de recherche : validée, elle atteint le fil (`_activeFeedPassions`).
- `_parDefaut` (profil de remplissage) et tout identifiant réservé `_…` ne sont une passion nulle part — ni ici.

⚠️ **LES SUITES VISITEUR NE LE VOIENT PAS, ET C'EST VOULU** : `bootVisiteur` coupe tout ce qui contient « supabase » — le SDK local compris (`js/vendor/supabase-js-…`) —, donc `_supaReal` reste faux et la grille reste la liste écrite : les 56 cas de `first-run.spec.js` et `premiere-visite-referentiel.spec.js` qui cliquent « moto » ou « musique » ne dépendent pas de la production. Le banc dédié, `tests/e2e/populaires-vivantes.spec.js` (6), charge le VRAI client et sert la lecture par une route posée APRÈS `sansDonneesDistantes`. Mutations éprouvées : plafond de 8 retiré, classement par publications avant les personnes, vivantes plus en tête — chacune rougit ; la mémorisation `_refVues` retirée ne rougit pas (au clic, le référentiel est chargé), c'est dit dans l'en-tête du banc.
