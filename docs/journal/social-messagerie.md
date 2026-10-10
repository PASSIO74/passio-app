# Journal — Social : suivre, messagerie, notifications, publications

> **Fiches déplacées TELLES QUELLES de `CLAUDE.md` le 2026-10-05.** `CLAUDE.md` est rechargé à
> chaque session et avait atteint 410 000 caractères (Claude Code alerte dès 40 000) : il ne garde
> plus que les règles qui valent partout. Ici vivent le récit, les mesures et les pièges de chaque
> lot — **à lire AVANT de toucher au domaine.** Un commentaire du code qui cite « CLAUDE.md § … »
> désigne une fiche de ce dossier : `grep -rn "<début du titre>" docs/journal/`.
> **Nouvelle fiche** : à la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`.
> Si elle porte une règle qui vaut pour TOUTE modification, une seule ligne de plus dans la section
> « Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.

## Sommaire

- 🔒 SUIVRE UN COMPTE PRIVÉ — « quand je clique dessus il ne se passe rien » (2026-09-22)
- ✉️ NOTIFIER UN MESSAGE PRIVÉ (2026-09-09) — la cloche ne sonnait que si l'appli était OUVERTE
- 🪦 SUPPRIMER UNE PUBLICATION — pierres tombales (2026-09-01)
- ⏰ RAPPELS D'ACTIVITÉ PAR PUSH — le rappel ne sonnait que si l'appli était OUVERTE (2026-10-05)
- 😍 UNE RÉACTION EMOJI S'EFFAÇAIT ELLE-MÊME — suppression et insertion en parallèle (2026-10-10)

---

## 🔒 SUIVRE UN COMPTE PRIVÉ — « quand je clique dessus il ne se passe rien » (2026-09-22)

Rapport d'usage, capture à l'appui : « quand je clique sur Suivre il le met en évidence, puis quand
je clique dessus il ne se passe rien ». **MESURÉ AVANT DE CONCLURE, et la mesure a renversé
l'hypothèse de départ.** `telemetry_events`, 22/09 14:01, compte `812aee2b` vers le compte PRIVÉ
`6b0a8694` : `click #followBtn_6b0a8694…` → **`POST /rest/v1/follows` 201**, puis **2,4 s plus
tard** second `click` → **`DELETE /rest/v1/follows` 204**. Les DEUX écritures partent, le verrou
`_ecritureSuiviEnCours` n'a rien bloqué, `trg_follows_statut` et la colonne `status` sont bien en
production — **le mécanisme était intact**, et `follows` ne portait aucune ligne vers ce compte
parce que le second tap avait **détruit la demande**.

⚠️ **LE DÉFAUT N'ÉTAIT PAS « RIEN NE SE PASSE », C'ÉTAIT « L'ÉCRAN NE DIT PAS CE QUI SE PASSE ».**
J'ai d'abord cherché une promesse jamais réglée qui aurait laissé le verrou posé à vie : c'est un
mode d'échec réel du code (`_verrouEcriture` se lève sur la réponse, **jamais sur un minuteur**),
mais ce n'était pas celui-là. **Un bouton dont les deux taps écrivent en base peut être vécu comme
un bouton mort** — la télémétrie d'API dit ce qui est parti, jamais ce qui a été COMPRIS.

⚠️ **L'OPTIMISTE PROMETTAIT UN ABONNEMENT QUE LE CLIENT SAVAIT IMPOSSIBLE.** Le premier tap peignait
« ✓ Suivi » en violet PLEIN — le visuel d'un suivi acquis — avant d'être corrigé en « Demande
envoyée » au verdict serveur. Or l'écran SAIT que le compte est privé : il peint le 🔒 à côté du
pseudo et le bloc « Ce compte est privé » deux centimètres plus bas. `_ciblePrivee(uid)` (app-04)
lit `window._visited` et **échoue sur « public »** : `_profileCache` ne porte pas `is_private` (seul
`openUserProfile` le relit), donc pour un compte dont on ne sait rien le comportement d'avant tient —
c'est ce qui garde `ouverture-publique` ⑦ vert, et le cas ⑤ le mesure.
⚠️ **« À L'OCTET PRÈS » SERAIT FAUX, ET LA NUANCE COMPTE** : `window._visited` n'est jamais remis à
`null` (une seule affectation dans tout le dépôt). Une fois un profil privé ouvert, `_ciblePrivee`
rend donc `true` pour CET uid sur **toutes** les surfaces, pour le reste de la session. C'est
souhaitable (on ne désapprend pas qu'un compte est privé) mais ce n'est pas l'identité stricte, et
aucun cas ne le mesure — écrit plutôt que tu.

⚠️ **« EN ATTENTE » N'EST PAS « PAS ENCORE DEMANDÉ », ET C'ÉTAIT PEINT PAREIL.** `_peindreBoutonsSuivi`
n'avait que deux aspects : violet plein pour « suivi », l'état neutre pour tout le reste. « Demande
envoyée » était donc **indiscernable d'un « Suivre » qui n'aurait rien fait** — d'où le second tap.
Trois états, trois aspects : violet plein (suivi acquis), **CONTOUR accent** (demande en vol), neutre.

⚠️ **UN GESTE DESTRUCTEUR DIT CE QU'IL EST, AVANT ET APRÈS.** Rien n'annonçait qu'un second appui
ANNULE la demande. `aideBoutonSuivi(uid)` (app-02) est la SEULE table de l'infobulle et de
l'étiquette d'accessibilité — jamais une seconde à côté de `libelleBoutonSuivi`, elles divergeraient
sur celle qu'on oublie — et le toast d'annulation NOMME la sortie (« appuie sur Suivre pour la
renvoyer »), même règle que le mot de passe fuité (2026-09-16) et que le renvoi de confirmation
(2026-09-18) : **un refus ou une annulation sans porte de sortie fait abandonner.**

⚠️ **LA SURFACE QUI EXPLIQUE MENTAIT SUR L'ÉTAT.** Le bloc « Ce compte est privé » est peint À
L'OUVERTURE et continuait d'écrire « Abonne-toi pour voir ses publications » à quelqu'un dont la
demande était déjà partie. Il est repeint par `_majBlocPriveVisite`, appelée depuis
`_peindreBoutonsSuivi` — **seul point qui écrit ces boutons**, donc seul endroit d'où la mise à jour
ne peut pas être oubliée. Le texte d'origine vit dans l'attribut `data-prive-texte`, sinon une
annulation laisserait la phrase d'attente derrière elle.

⚠️ **LE VERDICT CORRIGE DÉSORMAIS DANS LES DEUX SENS.** Un compte repassé PUBLIC entre le chargement
du profil et le tap rend `accepted` : laisser « Demande envoyée » sur un abonnement acquis ferait
attendre une acceptation qui ne viendrait jamais. Et la branche de refus (`ok: false`) retire
l'identifiant des DEUX listes, là où elle ne nettoyait que `following` : un refus laissait sinon
« Demande envoyée » à l'écran et dans l'état persisté jusqu'à la prochaine lecture serveur.
⚠️ **LA PREMIÈRE RÉDACTION JUSTIFIAIT ÇA PAR UNE FUSION « EN UNION » QUI N'EXISTE PAS** :
`followingPending` est **REMPLACÉ** par `supaLoadFollowing`, jamais fusionné (vérifié au grep). Le
correctif est juste, sa raison écrite ne l'était pas — et le dépôt paie régulièrement ce défaut-là
(« dans un lot de capacité, une cause fausse coûte plus que le gain du lot »).

⚠️ **ET LE CORRECTIF A D'ABORD ÉTÉ DU CODE MORT, AVEC SIX VERROUS VERTS DESSUS.** `_ciblePrivee`
lisait `window._visited.user.isPrivate` — une clé que **le producteur n'écrit nulle part** (une seule
affectation de `_visited` dans tout le dépôt, sans champ `user`). La détection rendait donc toujours
`false`, et le banc était vert parce qu'il **FABRIQUAIT** la prémisse : il posait la forme qui
l'arrangeait, donc il mesurait la fonction et jamais le câblage. C'est la faute `_notifierMessage`,
rejouée dans le lot même qui cite la règle — et trouvée par `audit-passio`, après des gates vertes.
`_visited` publie désormais `isPrivate` **explicitement**, jamais déduit de `locked`
(= `isPrivate && !isFollowing` : deux notions qu'on ne conflera pas), et les cas ⑦ et ⑧ épinglent
**les DEUX bouts** — le gabarit du bouton et la ligne qui produit `_visited`.

⚠️ **L'IMAGE MIROIR DU DÉFAUT VIVAIT SUR LA BRANCHE DESTRUCTRICE.** `supaUnfollowUser` (app-08) ne
rendait **rien** et avalait `{ error }` : un DELETE refusé (RLS, réseau) laissait l'écran annoncer
« Demande annulée » pendant que la demande vivait encore côté serveur. Elle rend `{ ok }`, et
l'annulation le lit — **aux DEUX surfaces** (profil visité et overlay live), sinon on corrigeait un
mensonge d'écran en en laissant l'autre, sur le geste même que le rapport décrit.

⚠️ **SEUL UN `'accepted'` EXPLICITE PROMEUT**, symétrique de la règle déjà écrite pour le refus
(« seul un `ok: false` EXPLICITE est un refus ») : `r === true` ou un objet sans `status` satisfont
« ≠ pending » et annonceraient un abonnement acquis à qui attend encore. Et sur une base **sans**
colonne `status` il n'existe aucun mécanisme d'acceptation — d'où la borne `_followsSansStatut` sur
la déduction « doublon + état local en attente ⇒ pending » (app-08), qui figerait sinon « Demande
envoyée » pour toujours.

⚠️ **CINQ SURFACES, PAS UNE — ET LA PREMIÈRE RÉDACTION EN COMPTAIT QUATRE.** `_peindreBoutonsSuivi`
ne rattrape un bouton qu'au premier tap : au PREMIER RENDU, revenir sur Découvrir avec une demande en
vol rouvrait le défaut mot pour mot. `attrsBoutonSuivi(uid)` (app-02) sert les gabarits qui peuvent
le recevoir tel quel — app-06 et les DEUX d'app-07 ; le profil visité porte déjà un attribut `style`
(un second serait un doublon) et l'overlay d'un live peint son attente par un `box-shadow`, donc ces
deux-là lisent les autorités communes (`aideBoutonSuivi`, `etatSuivi`) sans passer par le helper.
⚠️ **LA CINQUIÈME A ÉTÉ OUBLIÉE UNE PASSE DE PLUS, ET C'ÉTAIT LA PIRE** : le gabarit de l'overlay
live (`app-05`) calculait `iFollow = etatSuivi(...) !== "aucun"`, donc posait la classe `.on` — le
visuel d'un abonnement acquis — sur une demande qui attend. Corriger `_vlivePeindreSuivi` ne
suffisait pas : **il n'a d'appelant que `_vliveToggleFollow`**, donc quitter le live et y revenir
repeignait l'état faux, et le tap suivant détruisait la demande. **Une repeinte ne couvre jamais un
premier rendu ; il faut corriger le GABARIT.**
⚠️ **ET LA SYMÉTRIE ENTRE LES DEUX APPELANTS DE `supaFollowUser` EST UN INVARIANT** : tous deux
testent `status === "pending"`. Tester « ≠ accepted » dans l'un rétrograderait l'optimiste sur un
verdict NON EXPLICITE — le même signal traité en sens opposé selon la surface, et un changement
d'état **en l'absence** de preuve.

⚠️ **L'ÉTIQUETTE CONTIENT LE LIBELLÉ VISIBLE** (WCAG 2.5.3, « Label in Name ») : « Tu suis ce
compte — … » sur un bouton qui affiche « ✓ Suivi » faisait échouer la commande vocale « clique
Suivi ». C'est « Suivi — appuie pour ne plus suivre ce compte ».

⚠️ **PIÈGE D'ENVIRONNEMENT, DÉJÀ ÉCRIT, RE-VÉRIFIÉ PLUTÔT QUE SUPPOSÉ** : `profil-visite-options`
(5 cas) est ROUGE en local — `.modal.modal-fullscreen` n'y devient pas visible — **et l'est à
l'identique sur `origin/main` PUR** (rejoué en worktree séparé, `PASSIO_PORT=8099`). Aucun banc local
n'ouvre donc la modale de la capture : le cas ⑦ mesure son gabarit **à la SOURCE**, sans quoi le
bouton du profil visité pourrait perdre son infobulle et son contour sans qu'un seul cas rougisse.

Verrou : `tests/e2e/suivre-compte-prive.spec.js` (11), **éprouvé par RÉINJECTION de huit
mutations** — producteur de `_visited` rendu muet, c'est-à-dire le défaut P0 lui-même (1 rouge : ⑧) ·
annulation qui cesse de lire son verdict (1 : ⑨) · promotion sur statut non explicite (1 : ⑩) ·
`attrsBoutonSuivi` rendu inerte (1 : ⑪) · détection du compte privé retirée (1 : ①) · peinture
« attente » rendue à l'état neutre (1 : ①) · bloc privé non repeint (1 : ③) · infobulle retirée
(1 : ②). **Chaque couche est mesurée par exactement un cas**, et le premier verrou du lot ne l'était
pas : il aurait laissé partir le correctif mort.

## ✉️ NOTIFIER UN MESSAGE PRIVÉ (2026-09-09) — la cloche ne sonnait que si l'appli était OUVERTE

Envoyer un message n'écrivait **aucune** ligne `notifications` : la seule notification existante était fabriquée **localement par le destinataire** (`pushNotification` dans `_handleIncomingConvMessage`), donc uniquement si son application était ouverte à l'instant exact de l'envoi. Application fermée = message découvert par hasard en ouvrant Messages, sans cloche et sans push. Mesuré en production : la table ne portait aucune ligne `kind = 'message'` alors que `_notifEmoji` (✉️) et `openNotifTarget` (→ `openConversation`) la connaissent depuis toujours — **le tuyau existait, personne n'y versait rien**.
`supaSendMessage` lit désormais `{ error }` (le SDK ne LÈVE PAS sur un refus RLS : notifier un message refusé annoncerait un message qui n'existe pas) puis appelle `_notifierMessage(convId, msgId)`, qui écrit une ligne par destinataire et déclenche le push `notify-call`.
⚠️ **L'IDENTIFIANT EST DÉTERMINISTE** — `_idNotifMessage(msgId, destinataire)` = `n_<msgId>_<8 premiers car.>` — et c'est LUI qui empêche le DOUBLON : le destinataire en ligne fabrique le même pour sa notification locale, et la dédup par id (`pushNotification`, `mergeSupaNotifs`) écarte la seconde. Un identifiant par **destinataire**, jamais un seul par message : la clé primaire refuserait la deuxième ligne d'un groupe, en silence.
⚠️ **ANTI-SPAM** : une notification par conversation et par fenêtre de 5 min (`window._msgNotifDerniere`, mémoire volatile), **remise à zéro dès qu'un message arrive** de cette conversation — l'autre est revenu, la relance suivante doit sonner.
⚠️ **Le CONTENU du message ne voyage jamais dans la notification** (elle transite aussi par le push) : on n'annonce que l'expéditeur.
⚠️ **`supaLoadMyConversations` rendait `unread: 0` EN DUR**, et son résultat REMPLACE l'entrée locale au boot : un message reçu appli fermée n'avait donc ni cloche ni pastille au retour. Le compteur se recalcule depuis `conv_reads` (même source que le ✓✓ de `supaLoadOtherRead`), en écartant les messages de CONTRÔLE (`react`/`del`) qui feraient clignoter une pastille sans bulle.
Verrou : `tests/e2e/notification-message.spec.js` (12), dont ④ bis qui RÉINJECTE le doublon et ① ter la divergence d'environnement — **en CI le VRAI SDK se charge, et `supa.functions` y est un GETTER de prototype** : le faux client d'une suite doit s'y poser par `Object.defineProperty`, une affectation échoue EN SILENCE (vert en local, rouge en CI).

## 🪦 SUPPRIMER UNE PUBLICATION — pierres tombales (2026-09-01)

Toute suppression passe par `deletePost` (app-04) : `marquerPostSupprime(id)` pose d'ABORD la pierre tombale (`state.deletedPostIds`, persistée en `localStorage` ET synchronisée par le blob `user_state`, fusionnée en **UNION** jamais par remplacement), puis `purgerPostsSupprimes()` (app-02) — seul point qui connaît les **QUATRE** tableaux où vit un post (`userPosts`, `supabasePosts`, `seed.posts`, `window._feedExtraPosts`). Ne jamais refaire ce filtrage à la main.
Un rechargement serveur s'écrit dans `supabasePosts`, **JAMAIS** dans `seed.posts`. La propriété d'un post se teste par `_estMonPost(p)` — l'AUTEUR, jamais `_source` — et se retrouve par `findPostAnywhere`.
Verrou : `tests/e2e/suppression-durable.spec.js` (8 cas). Les quatre causes du défaut, la file de suppression serveur (`passio_post_delete_outbox_v1`, `_delObRun`) et le post-mortem : `docs/SUPPRESSION_DURABLE.md`.

## ⏰ RAPPELS D'ACTIVITÉ PAR PUSH — le rappel ne sonnait que si l'appli était OUVERTE (2026-10-05)

Question de Benjamin : « c'est quoi la suite ? ». Mesuré d'abord (canal ①) : **11 comptes, 1 créé
en 7 jours, 59 sessions de production, 0 lien partagé, 0 publication en 7 jours, 6 activités en
30 jours, 8 inscriptions en 30 jours, 10 abonnements push sur 6 comptes.** Le mur est la diffusion
(la part de Benjamin : une ville, deux ou trois passions, de vraies activités partagées). Côté code,
le défaut qui tuerait ce lancement : **une activité où la moitié des inscrits oublie de venir.**

⚠️ **LE RAPPEL EXISTAIT, ET IL NE PARTAIT QUE SI L'APPLI ÉTAIT OUVERTE.** `_checkEventReminders`
(app-07, J-7 / J-1 / H-2 depuis le 2026-07-21) tourne DANS LA PAGE et n'écrit que dans la cloche :
appli fermée, rien. Le rappel de H-2, « celui qui fait effectivement VENIR », était le plus sûr de ne
jamais partir. Même famille que la cloche des messages privés (2026-09-09).

⚠️ **AUCUNE MIGRATION : LE MINUTEUR SERVEUR EXISTAIT.** La veille de pilotage (pg_cron toutes les
5 min → fonction `pilotage`, `{ action: "veille" }`) appelle désormais `envoyerRappels`
(`supabase/functions/_shared/rappels.js`, cœur PUR `rappelsDus`). Un cron GitHub (servi à 41 %, des
trous de 4 à 5 h) était inutilisable pour un rappel à H-2. Les rappels tournent DANS l'`allSettled`
de la veille : une panne ne la fait pas tomber, et laisse une trace (`analytics_events`,
`event = rappels_echec`). Déployé par `edge-functions.yml` à la fusion.

⚠️ **LES RÈGLES, TOUTES DANS `rappelsDus`** : deux paliers poussés (la veille entre H-24 et H-2,
puis H-2) — J-7 reste dans la cloche, une push une semaine avant est du bruit ; **on ne rappelle
jamais ce qu'on vient de faire** (inscription APRÈS l'ouverture du palier → silence) ; `going` et
`maybe` (la liste de `joinedEvents`) plus l'organisateur, jamais la liste d'attente ni une activité
annulée ; comptes réels (uuid) seulement ; texte de l'organisateur purgé (contrôle, bidi, sauts) et
borné ; heure ABSOLUE en heure de Paris (une veille reprise en retard ne dit jamais « dans 2 h » à
30 minutes du départ). Au plus `MAX_PAR_TOUR` (300) par tour, le reste au suivant.

⚠️ **UNE FOIS, PAS PLUS — ET LA MARQUE N'EST PAS UNE NOTIFICATION.** La marque
`<activité>:<palier>:<compte>` est écrite dans `analytics_events` sous `user_id = systeme:rappels`
**AVANT** l'envoi (marque refusée → on lève, rien ne part). Pas dans `notifications` : un client y
écrit (sauf `n_m_…`), donc pourrait forger la ligne pour TAIRE le rappel d'un autre, et il peut
effacer les siennes, donc se faire renvoyer le rappel à chaque tour. Au plus une fois : une push
perdue n'est pas rejouée, un doublon est pire qu'un oubli.

⚠️ **ENVOYER NE SERVAIT À RIEN SANS ABONNÉS — ET PERSONNE NE L'ÉTAIT PAR CE CHEMIN.** La seule
demande de permission partait à l'ouverture d'une conversation privée, avec un toast qui promettait
« les appels » (coupés pendant le pilote). Quelqu'un qui rejoint une activité depuis un lien WhatsApp
n'était jamais abonné. `proposerRappelsActivite(ev)` (app-07) propose « ⏰ Un rappel avant d'y
aller ? » **juste après une inscription CONFIRMÉE par le serveur** (`rsvpOk === true`, jamais sur
l'optimiste), et `_rappelsVerdict` se tait partout ailleurs : sans compte réel, navigateur qui ne
pousse pas (Safari hors application installée), permission déjà tranchée (accordée → abonnement
SILENCIEUX ; refusée → on n'insiste jamais), « Plus tard » il y a moins de 14 jours, activité dans
moins de 2 h (aucun rappel ne partirait), fenêtre déjà ouverte (`openModal` n'empile pas). Le clic
« Activer » EST le geste qu'exige `Notification.requestPermission`. Coupures :
`localStorage.passio_rappels_push_v1="0"` ou `window.PASSIO_RAPPELS_PUSH=false`. Télémétrie
`rappels_proposes` / `rappels_actives` (`verdict`) / `rappels_plus_tard`.

⚠️ **LE TAP OUVRE L'ACTIVITÉ, ET LE DIGEST EN PROFITE.** `sw.js` affiche la push `type: "rappel"`
(un tag par activité : H-2 remplace la veille) et, au tap, ouvre `./#irl-event-<id>` (appli fermée)
ou confie l'identifiant à la page ouverte (`OUVRIR_ACTIVITE` → `_ouvrirActiviteDepuisNotification`,
qui repasse par le routeur `#irl-event-`, jamais un second chemin). L'identifiant est revérifié au
service worker ET dans la page ; seules deux URL sont ouvertes (l'accueil, une activité). **Survivant
refermé au passage** : la notification du digest « ça se passe près de toi » (`tag: "irl-digest"`,
`data.url`) tombait dans le traitement d'un APPEL et ouvrait l'accueil avec un `?call=` vide. Le
rappel de la cloche (dans la page) porte `kind: "event_reminder"` + `refId` : le toucher ouvre
l'activité au lieu d'une ligne inerte.

⚠️ **CE QU'ON NE PEUT PAS PROUVER D'ICI** : la livraison réelle d'une push (Google/Apple) et
l'exécution Deno. Le service worker est exécuté pour de vrai dans une machine virtuelle Node, et
l'enveloppe contre un faux PostgREST ; la preuve en production est le run `edge-functions.yml` vert
(fumée OPTIONS 200 / POST sans jeton 401 / révision servie), puis une marque `rappel_activite` dans
`analytics_events` la veille d'une vraie activité.

Verrous : `tests/unit/rappels.test.mjs` (15, dans `npm run verif`) et
`tests/e2e/rappels-activite.spec.js` (8). **Éprouvés par RÉINJECTION de vingt-cinq mutations** (les
quatre dernières après la revue : une seule clé système, une seule page, marques non relues, réponse
qui livre les compteurs),
chacune rouge : inscription récente rappelée, marque refusée mais envoi quand même, liste d'attente
rappelée, marque ignorée, heure en UTC, bidi non purgé, activité annulée rappelée, service worker
sans branche « rappel », clic sans branche « destination », identifiant non revérifié au service
worker, veille sans rappels ; écouteur de page retiré, même hash non traité, identifiant non vérifié
dans la page, rappel de cloche inerte ; proposition retirée, proposée avant le verdict serveur, garde
« trop tard » retirée, repos de 14 jours retiré, fenêtre ouverte ignorée, visiteur admis.

⚠️ **CE QUE LA REVUE DE SÉCURITÉ AUTOMATIQUE A RELEVÉ, ET CE QUI EN A ÉTÉ FAIT.** ① La réponse de
la veille livrait les compteurs des rappels (activités dans les 24 h, envois, appareils) — or la
veille s'appelle avec la seule clé anon : **retirés**, ils se lisent dans `analytics_events`, et le
verrou ⑬ refuse leur retour. ② « Exiger un secret partagé pour la veille » : **non retenu** —
appeler la veille ne fait rien qu'elle ne ferait d'elle-même dans les 5 minutes (les rappels sont
calculés sur l'heure du serveur et marqués), elle est plafonnée à 1/min, et le secret imposerait de
réécrire le cron (migration). ③ « Index unique sur la marque + ON CONFLICT » : **résidu nommé** —
la marque est lue puis écrite, donc deux veilles lancées à la même milliseconde (le plafond 1/min
est lui-même un compte puis une écriture) enverraient le rappel deux fois ; au pire une notification
re-sonne sous le MÊME tag. Le fermer demande un index, donc une migration contre-revue : à faire si
un doublon est un jour observé, pas avant. ④ **Le défaut le plus grave était là, et c'est la revue
qui l'a vu, pas les 21 mutations** : `analytics_events` porte `trg_rate_limit` à **120 lignes par
minute ET PAR `user_id`** (lu en base), et toutes les marques partaient sous UN identifiant système —
une activité de 150 inscrits faisait échouer le lot entier à chaque tour, donc **plus aucun rappel,
pour personne, jamais**. Une marque porte désormais `systeme:rappels:<compte>` (`marqueUid`) : un
compteur par destinataire, toujours infalsifiable (`analytics_insert_own` exige `user_id =
auth.uid()`, un uuid nu). Le banc reproduit la limite de la production. ⑤ Les lectures étaient
plafonnées (500 activités, 5 000 inscrits) SANS tri : au-delà, des activités sortaient du tour au
hasard, indéfiniment. Elles sont triées (la plus proche d'abord), paginées, et les marques ne sont
plus lues sur trois jours d'historique mais pour les seuls destinataires du tour.

⚠️ **RÉSIDUS NOMMÉS** : un iPhone ne reçoit de push que si PASSIO est installée sur l'écran
d'accueil (iOS 16.4+) — `_rappelsVerdict` rend alors `non_supporte` et rien n'est proposé ; la
cloche garde son propre rappel local (J-7, J-1, H-2), donc l'appli ouverte après une push montre
aussi le rappel dans la cloche (une ligne, pas une seconde notification système) ; les heures sont
dites en heure de Paris, quel que soit le fuseau de l'activité.

## 😍 UNE RÉACTION EMOJI S'EFFAÇAIT ELLE-MÊME — suppression et insertion en parallèle (2026-10-10)

Trouvé par la CI, pas par un rapport : après la fusion de #590 (rappels), `multi-comptes.spec.js`
(« interactions sur un post », exécutée sur le staging) a rougi **2 fois sur 4** le même matin, sur
un code navigateur identique à l'octet entre les exécutions vertes et rouges — donc pas #590, et le
déploiement production a été sauté. **« Flake » n'était pas une cause** : la réaction 😍 de B
n'arrivait pas chez A et n'était pas en base au rechargement.

⚠️ **LA CAUSE : DEUX ÉCRITURES DONT L'ORDRE COMPTE PARTAIENT EN MÊME TEMPS.** « Une réaction par
personne » s'écrit en deux requêtes : `supaCommentRemoveReactions` (DELETE de MES réactions emoji
sur la cible) puis `supaCommentInteract` (INSERT de la nouvelle). `addEmojiToPost` et
`addEmojiToComment` lançaient la première **sans l'attendre**. Deux requêtes concurrentes ne sont
traitées dans aucun ordre garanti : quand le DELETE passait APRÈS l'INSERT, il effaçait la réaction
qu'on venait de poser — chez tout le monde, au rechargement comme en temps réel, **sans une erreur
nulle part** (le SDK ne lève pas, le geste était « réussi » à l'écran). En production, c'est une
réaction qui disparaît au hasard.

⚠️ **UNE FILE PAR CIBLE, PAS SEULEMENT « ATTENDRE LA SUPPRESSION »** : `_syncReactionEmoji(cible,
postId, emoji)` (emoji-misc.js) enchaîne suppression puis insertion, ET fait attendre le geste
suivant sur la même cible. Attendre la seule suppression laissait deux réactions tapées vite
(😍 puis 🔥) croiser l'insertion de la première avec la suppression de la seconde — deux réactions
du même compte, le défaut que la suppression existe pour empêcher. `emoji` vide = retrait seul
(re-tap). Les likes de commentaire n'ont pas ce défaut : retrait et ajout y sont deux branches d'un
même `if`, jamais deux requêtes d'un même geste.

Verrou : `tests/e2e/reaction-ordre.spec.js` (4) — un faux serveur dont la suppression est LENTE et
l'insertion rapide, et on lit l'état FINAL du serveur, jamais l'appel. **Éprouvé par réinjection** :
l'ancien code → 3 rouges ; attendre la suppression sans file par cible → 1 rouge (les deux
réactions rapides).

