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
- 🗓️ RÉCAP DE LA SEMAINE — une carte en tête du fil, dans l'app seulement (2026-10-06)
- 😍 UNE RÉACTION EMOJI S'EFFAÇAIT ELLE-MÊME — suppression et insertion en parallèle (2026-10-10)
- 🏷️ UN PSEUDO CHANGÉ RESTAIT L'ANCIEN DANS LA MESSAGERIE (2026-10-13)
- 📍 UNE ACTIVITÉ CRÉÉE N'APPARAISSAIT PAS DANS LE FIL (2026-10-23)
- 🤝 UNE ACTIVITÉ TAPÉE SUR UN PROFIL RAMENAIT À LA MESSAGERIE (2026-10-24)
- 🚩 SIGNALER UN MESSAGE — et ce qu'un identifiant forgé, un × et un `del` d'autrui faisaient autour (2026-11-03)
- 📞 UNE MISE À JOUR SILENCIEUSE COUPAIT L'APPEL, LE LIVE ET LA SAISIE — le rechargement attend (2026-11-04)
- 🎙️ UNE MISE À JOUR SILENCIEUSE PERDAIT LE VOCAL, LA CAPTURE ET L'ENVOI — le rechargement attend aussi (2026-11-04)
- 📎 UNE PIÈCE JOINTE EN ÉCHEC PARTAIT EN ÉTIQUETTE « NON SYNCHRONISÉ », ANNONCÉE ENVOYÉE — le dépôt a désormais un verdict, une file et un « réessayer » (2026-11-07)

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

---

## 🗓️ RÉCAP DE LA SEMAINE — une carte en tête du fil, dans l'app seulement (2026-10-06)

Rien ne disait à un compte ce qui s'était passé pour lui pendant la semaine : les notifications arrivent une à une dans la cloche, et le fil ne distingue pas ce qui est neuf. Mesuré le même jour (`docs/journal/telemetrie-pilotage-sentinelle.md`, activation) : sur les comptes créés entre 7 et 30 jours plus tôt, un sur trois seulement a fait un geste social dans sa première semaine.

**Ce qui existe désormais** : `js/recap-semaine.js` (IIFE `window.PassioRecapSemaine`, hors bloc app, inliné au build) pose UNE carte « Ta semaine sur PASSIO », en FRÈRE juste avant `#feedList`, au plus une fois par semaine ISO (lundi, date LOCALE) et par compte : publications des 7 derniers jours dans les passions du compte (`passionsPossedeesIds()`, hors ses propres publications), abonnements, commentaires et mentions, j'aime, inscriptions à ses activités (comptés sur SES `notifications` des 7 jours), activités à venir dans ses passions (7 prochains jours, hors `cancelled`). Chaque ligne mène là où ça se passe : Rencontrer (`goTo("irl")`), la cloche (`openNotifications()`), ou le fil juste dessous.

**Les règles du réengagement sain** (`docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md` §3 niveau D, §32), toutes tenues :
- **dans l'app seulement** — aucune notification système, aucun e-mail : le récap résume quand on revient, il ne fait revenir personne. Une version « digest poussé » serait OPT-IN (même document) et demanderait un envoyeur serveur : pas faite ;
- **une semaine vide n'est pas annoncée** (aucune ligne = aucune carte), et la semaine est marquée AVANT les lectures : un échec ne fait pas relire à chaque ouverture ;
- **des faits, aucun langage de pression** — le banc refuse « raté », « perdre », « série », « reviens » ;
- **coupé en un geste** (« Ne plus afficher le récap » → `passio_config.notifs.recap = false`, toast qui dit où le remettre) et dans Paramètres › Personnalisation › Notifications (case « Récap de la semaine ») ; coupure d'urgence `localStorage.passio_recap_semaine = "0"` ou `window.PASSIO_RECAP_SEMAINE = false`.

⚠️ **UNE SESSION, ET UN COMPTE D'AU MOINS 3 JOURS.** `_uidEstUnCompte()` est vrai pour un identifiant resté sur l'appareil SANS session : sans session, rien n'est lu (une lecture anonyme compterait des publications pour personne). L'âge vient de `supa.auth.getSession()` (stockage local du SDK, aucun appel réseau). La première semaine d'un compte est celle de la découverte ; et c'est aussi ce qui tient les comptes jetables des suites « production » à l'écart — créés il y a quelques minutes, ils ne lisent rien. Sans session ou trop jeune : la semaine n'est PAS marquée, la prochaine ouverture réévalue.

⚠️ **La marque de semaine est un bien de COMPTE** : `passio_recap_semaine_v1 = { uid, semaine }`, dans `ACCOUNT_SCOPED_KEYS` (purgée au changement de compte) et comparée au compte courant — un autre compte sur l'appareil a droit à son récap.

⚠️ **Lectures** : trois, en parallèle — `posts` en comptage seul (`head: true`), `notifications` (colonne `kind`, 500 au plus), `events` en QUATRE colonnes publiques nommées (jamais `select("*")`, 42501). Le SDK ne lève pas sur un refus : `{ error }` est lu et journalisé (`diagLog("recap-semaine: <lecture> — …")`), et seule la ligne concernée se tait. La carte est construite au DOM (`textContent`, `addEventListener`) : aucun `onclick` inline, aucun contenu d'autrui (des nombres et des libellés fixes). Son style est injecté par le module (`#recapSemaineCss`, classes `.recap-semaine-*`) : rien dans `styles.css`, dont le bloc UI-4A5 doit rester le dernier.

Verrou : `tests/e2e/recap-semaine.spec.js` (10, client du module REMPLACÉ par un faux qui note chaque appel — forme des lectures mesurée, rien ne part en production). Mutations éprouvées, chacune rougit son cas : semaine non marquée, activité annulée comptée, marque sans le compte, « Ne plus afficher » ignoré, refus non journalisé, lecture sans session ou pour un compte de moins de 3 jours.

---

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

⚠️ **AU PASSAGE, UN BANC QUI TENAIT PAR CHANCE** : sur la PR de ce correctif,
`ecritures-identite-compte.spec.js` ④ ⑥ ⑨ ont rougi 9 fois sur 9 (« la session du banc est
lisible » → null), pour un simple redécoupage des shards. Le banc posait `access_token:
"jeton-de-banc"` sans `refresh_token` : supabase-js 2.116 juge cette session invalide dès qu'il la
recharge (minuteur, `getSession`) et l'efface — piège déjà écrit pour `mes-passions-page` le 18/09,
resté ouvert ici. Reproduit : après la pose, un `getSession()` rend la lecture nulle avec l'ancien
jeton et intacte avec un JWT de forme valide. Le banc pose désormais la même forme que `poserSession`.

---

## 🏷️ UN PSEUDO CHANGÉ RESTAIT L'ANCIEN DANS LA MESSAGERIE (2026-10-13)

Rapport d'usage, capture à l'appui : « j'ai changé un nom de pseudo sur mon profil mais dans la
messagerie le nouveau nom n'apparaît pas ». La liste Messages affichait « Profil » ; en base,
`profiles.username` valait déjà « Ben test 1 sur portable » — et la ligne des passions de la MÊME
carte (lue sur le profil vivant par `ui-v6a-messages.js`) était à jour. Le serveur avait raison,
l'écran lisait une copie.

**Cause.** `c.userName` est écrit à la création du fil (`startDirectMessage`) et `renderMessages`
le préférait au profil (`c.userName || u.name`). Le rafraîchissement serveur le corrige en principe,
mais `deduplicateConversations` garde l'entrée la plus RÉCENTE d'une paire — une copie locale à
laquelle on vient d'écrire (« à l'instant ») — et ne rattrape son nom que s'il vaut « Passionné ».
Second relais de la copie périmée : `_primeProfileCache` écrasait une entrée déjà résolue de
`_profileCache` avec ce nom figé, que `_profilAuteur` pouvait ensuite réinscrire dans
`state.seed.users`.

**Correctif.** `_alignerIdentiteConv(c)` (app-04) : un profil RÉEL en cache (`distant: true`) fait
foi, la copie (nom, photo) est réalignée sur lui à chaque rendu de la liste et à l'ouverture d'une
conversation, puis sauvegardée. Un interlocuteur de démonstration (sans `distant`) garde le nom du
fil. `_primeProfileCache` n'écrase plus une entrée existante.

**Verrou.** `tests/e2e/conv-nom-suit-pseudo.spec.js` (3) — ① et ④ rouges sans le correctif.

---

## 📍 UNE ACTIVITÉ CRÉÉE N'APPARAISSAIT PAS DANS LE FIL (2026-10-23)

Signalé par Benjamin : « Jerem a créé une activité mais elle n'apparaît pas dans le feed ».
**Mesuré (canal ①)** : la ligne `events` existe (« Via ferrata », `xu147b6tbmvldjb5z`, créée le
23/10 à 19:39, statut `active`, le 31/10) ; AUCUNE ligne `posts` ne la cite. Ce n'était pas une
panne : créer une activité n'écrivait QUE dans `events`. La seule carte du fil était celle du
bouton « Partager dans mon feed » de la fiche — que personne ne va chercher sur sa propre activité.

**Correctif** (`js/app-07-ia-explore-irl.js`) :
- `submitEvent` appelle `publierActiviteAuFil(ev)` quand la création est CONFIRMÉE par le serveur
  (`ok && backend && !editId`, la même condition que l'invitation). UNE carte par création, même
  récurrente. Silencieuse : ni `closeModal` ni `goTo` (la proposition d'invitation est à l'écran,
  `openModal` n'empile pas).
- `_postActiviteAuFil` est la SEULE fabrique de la carte (partage manuel et automatique).
- ⚠️ **Identifiant déterministe `post_ev_<idActivité>`** : la clé primaire refuse le doublon entre
  la création, le rattrapage et un second appareil ; une pierre tombale sur cet id empêche la carte
  supprimée de revenir.
- **Rattrapage** `rattraperActivitesAuFil` (appelé après `supaLoadEvents` au boot, app-08) : mes
  activités À VENIR, actives, créées depuis moins de 7 jours (`createdAt`, désormais mappé), au
  plus 3 par démarrage. ⚠️ On demande au SERVEUR si une carte existe (`shared_data like
  '%"id":"<activité>"%'`, partage manuel compris) ; une lecture en échec ne publie rien. C'est ce
  chemin qui pose la carte de Jerem à sa prochaine ouverture de l'app (aucun canal d'écriture de
  données depuis la session de correction).
- ⚠️ Sous UI-3 la sous-carte `.post-vlog-card` d'un partage d'événement est MASQUÉE au profit de
  « Voir l'activité » : un test qui attend la sous-carte visible est faux — mesurer l'ARTICLE.

Coupures : `localStorage.passio_activite_au_fil_v1="0"`, `window.PASSIO_ACTIVITE_AU_FIL=false`.
Verrou : `tests/e2e/activite-au-fil.spec.js` (5), éprouvé par réinjection (branchement retiré → ① rouge).

---

## 🤝 UNE ACTIVITÉ TAPÉE SUR UN PROFIL RAMENAIT À LA MESSAGERIE (2026-10-24)

Rapport d'usage : « quand je clique sur une activité sur un profil ça m'emmène sur la messagerie et
non sur l'activité ». **Chemin** : conversation → avatar ou nom de l'en-tête (`openUserProfile`) →
onglet « Activité » → tap. La ligne fait `closeModal();openEventDetails(id)` : la modale part, la
fiche s'ouvre bien (`display:flex`) — mais **SOUS** le fil de messages : `#eventDetailPage` est en
`z-index: 200`, `#conv-fullpage` en `1200`, et rien ne fermait la conversation. Depuis le fil ou
mon propre profil, aucun panneau n'est au-dessus : le défaut ne se voyait que depuis la messagerie.

**Correctif.** `openEventDetails` (app-07) ferme la conversation (`closeConversation`) AVANT de
pousser l'entrée d'historique de la fiche, si l'activité existe. On n'a PAS remonté le z-index de
la fiche : `closeCurrentOverlay` (app-02) ferme les panneaux dans l'ordre du z-index décroissant
(conversation avant fiche), et les feuilles ouvertes depuis la fiche se seraient retrouvées dessous.
Le retour depuis la fiche ramène à la liste des messages.

**Verrou.** `tests/e2e/profil-activite-depuis-conversation.spec.js` (2) — mesuré par
`elementFromPoint` au centre de l'écran ; ① rouge sans le correctif (réinjection faite).

---

## 🚩 SIGNALER UN MESSAGE — et ce qu'un identifiant forgé, un × et un `del` d'autrui faisaient autour (2026-11-03)

Décision E-08 de l'audit du 2026-11-02 (DSA : un contenu reçu doit pouvoir être signalé). Le menu d'un message
REÇU (appui long / clic droit, `_openMsgActions`, app-04) porte « 🚩 Signaler ce message » → `reportMessage(convId,
msgId)` : compte réel exigé (`requireAuthentication("signaler")`), motif de 3 caractères minimum
(`_demanderMotifSignalement`), `supaReport("message", msgId, motif)`, accusé « Signalement reçu ». Jamais sur mon
propre message ni sur un message système. Le CONTENU ne voyage pas dans le signalement : le serveur en fait la copie
(`signalements_preuves`, fiche du même jour dans `serveur-securite-base.md`), parce que l'auteur peut encore
supprimer ou réécrire son message après coup.

**Ce que le lot a fermé autour, trouvé en le testant :**

- **Les identifiants de message entraient TELS QUELS dans les `onclick` du menu.** `conv_messages.id` n'a aucune
  contrainte de forme : un expéditeur qui forge `m_a'),(window.__pwn='a'),('` exécutait du code chez le destinataire
  au premier appui long. Tous les items passent par `escapeJsArg` (`cj`, `mj`), et les deux `querySelector` qui
  cherchent un message par son identifiant (`data-mid`, `data-msgst`) par `CSS.escape`. Verrou :
  `audit-2026-11-signaler-message.spec.js` ① et ⑤ (identifiants à apostrophe, guillemet, crochet, barre oblique).
- **Fermer la fenêtre du motif par ×, le fond ou Échap laissait la promesse PENDANTE.** `closeModal` retire `.active`
  du fond sans vider `#modalContent` ; l'observateur attendait que `#signalementMotif` quitte le DOM. Les quatre
  signalements (message, publication, profil, story) restaient suspendus jusqu'à la fenêtre suivante. L'observateur
  suit aussi la classe du fond et compare le champ par identité (`isConnected`).
- **N'importe quel membre effaçait le message d'un AUTRE chez tout le monde.** Un message de contrôle
  `{"type":"del","target":…}` était appliqué sans vérifier que son expéditeur était l'auteur de la cible ; une
  réaction était comptée sans attribution. Désormais un `del` ne s'applique que si l'auteur de la cible est le
  `from_id` de la LIGNE serveur (jamais un champ du JSON), et une réaction est attribuée à cet expéditeur
  (`reactBy`, une par personne et par emoji) — au temps réel comme au rejeu de `supaLoadMessages`. Le canal
  temps réel v2 (opt-in, broadcast dont la charge n'est pas prouvée par le serveur) n'applique AUCUN message de
  contrôle : le rejeu suivant s'en charge. Et ce rejeu atteint la COPIE LOCALE : `_deleteMsgForAll` supprime la
  ligne de la cible, le serveur ne la rend donc plus, et la fusion à l'ouverture (`_fusionnerMessagesServeur`)
  gardait la copie — un retrait manqué en temps réel ne quittait jamais l'appareil. `supaLoadMessages` remet à la
  fusion ses retraits (`_retraitsPourTous`, propriété non énumérable) avec l'expéditeur de la ligne ; la fusion ne
  retire une copie que si son auteur est cet expéditeur. Verrou : `audit-2026-11-controle-auteur-messages.spec.js` (6).
- **L'accusé de lecture partait sans lire sa réponse** (`supaMarkRead`, revue 10b, R6). Il lit `{ error }` : 403/42501
  → réparation de l'appartenance par `_reparerAppartenanceConv` (même tentative mémorisée que l'envoi), une relance,
  une trace sans donnée personnelle ; panne réseau silencieuse ; 401 jamais réparé ; réparation réservée à un 1:1 de
  ma liste dont le pair est connu (jamais un groupe quitté). C'est le préalable de `oracles_et_privileges` (C-01).
  Verrou : `audit-2026-11-accuse-lecture.spec.js`.

**Ce qui reste (registre de l'audit, risques résiduels).** `retirer` dans `scripts/moderation.js` supprime la ligne en
base mais pas les copies déjà chargées sur les appareils des membres (pas de marqueur `del` envoyé) ;
`conv_messages.id` n'a toujours pas de contrainte de forme alors que `reports.target_id` est plafonné à 120
caractères (un identifiant forgé plus long rend un message insignalable) ; le canal v2 accepte encore un
`from_id` non prouvé pour un message ORDINAIRE (opt-in, éteint par défaut).

## 📞 UNE MISE À JOUR SILENCIEUSE COUPAIT L'APPEL, LE LIVE ET LA SAISIE — le rechargement attend (2026-11-04)

Suite de #704 (`buildId`, journal Télémétrie). Chaque build qui change réinstalle le worker, et `reloadOnce` (`js/pwa-detect.js`) ne regardait que `hadController` et `_reloaded` : une page contrôlée rechargeait, quoi qu'elle fût en train de faire. Le `buildId` change 256 fois sur les 76 jours mesurés par #704, soit plus de trois rechargements par jour pour une page restée ouverte.

- **Mesuré avant correctif** : deux vrais artefacts (`scripts/build.js` lancé deux fois), le vrai worker, `reg.update()` comme le fait `majSilencieuse`, l'état posé tel que l'écrivent les gestionnaires. Délai entre le déploiement et le rechargement :

| Page contrôlée | Chromium | WebKit de Playwright |
|---|---|---|
| Sans activité (témoin) | 437 ms | 217 ms |
| Appel en cours (`_call`) | 544 ms | 421 ms |
| Appel sortant qui sonne (`_call`) | 486 ms | 249 ms |
| Sonnerie entrante (`_callIncoming`) | 244 ms | 637 ms |
| Je diffuse un Live (`_vliveHost`) | 506 ms | 630 ms |
| Je regarde un Live (`_vliveView`) | 735 ms | 619 ms |

- **La saisie perdait aussi, contrairement à ce qu'on croyait** : `c.draft` ne protège pas la frappe en cours. `_draftTimer` (350 ms) se réarme à chaque touche, donc rien n'est écrit tant qu'on tape. Vraies frappes clavier, rechargement pendant la frappe, à 120 ms par touche : Chromium 24 caractères tapés, 0 relu ; WebKit 25 et 23, 0 relu ; à 250 ms par touche, 12 ou 13 sur 12 ou 13 perdus. Le flush `beforeunload` ne change rien à ces chiffres : il écrit un `c.draft` qui n'a pas encore été posé. Une pause de 1,5 s avant le déploiement : tout est relu. Une pause de 500 ms sans ce flush, branché seulement à la fin de `supaInit` : 32 caractères perdus. Au Studio (`#postText`) et dans un commentaire, aucun brouillon : 31 caractères tapés, 0 relu, même après 1,5 s de pause.
- **Exposition aujourd'hui** : le Live et la saisie. Les appels sont coupés pour le pilote (`PASSIO_APPELS_ACTIFS = false`, ASTRA-60) et les suites les arment elles-mêmes ; ce report les protège pour le jour où ils reviennent.
- **Correctif** : le rechargement n'est jamais annulé, il attend. `pageOccupee()` = `appelOuLiveEnCours() || saisieEnCours()`. Occupée, `reloadOnce` arme une minuterie de 500 ms, qui n'existe que le temps du report et relit l'état ; après 3,5 s de calme, la page recharge. La nouvelle version a déjà pris la main, seule la page reste sur l'ancienne le temps de finir.
- ⚠️ **Un rechargement reporté ne se perd pas parce qu'on relit l'état au lieu de brancher chaque fin** : un appel finit par raccrocher, le pair qui raccroche, un refus, une connexion perdue, l'absence de réponse. En oublier un laisserait la page sur l'ancienne version.
- ⚠️ **L'état se lit sur `window.`** : ce script tourne en tête de page, avant le bloc app. Un `_call` nu lèverait une `ReferenceError` si `app.js` n'a pas chargé, et la page ne rechargerait plus jamais (⑫).
- ⚠️ **IL Y A UN TROU ENTRE LE GESTE ET L'ÉTAT, et c'est le pire moment.** `acceptIncomingCall` efface `_callIncoming`, puis attend la permission du micro AVANT de poser `_call` : pendant ce temps, aucun état n'existe. Sans rien de plus, un rechargement reporté à cause de la sonnerie partait sous un appel que l'utilisateur vient d'accepter. Mêmes trous : `startCall`, `startVideoLive` (titre, caméra, insertion), `joinVideoLive` (lecture), et les deux liens `?call=` et `?live=`, qui nettoient l'URL puis attendent le client. `_appelEnPreparation()` (app-05) pose `window._appelLanceA` à ces six gestes.
- ⚠️ **La marque est bornée à 60 s et s'efface à la fermeture de l'interface** (`_callCloseUI`, `_vliveCloseUI`) : une marque sans borne, sur un geste abandonné, retiendrait la page pour toujours ; sans effacement, un refus d'appel retenait la page une minute (⑬, ④, ⑦). Un geste abandonné sans fermeture (micro refusé à `startCall`, titre annulé) retient la page au plus 60 s, délibérément.
- ⚠️ **SEUL COMPTE CE QUE L'UTILISATEUR A TAPÉ** (`isTrusted`, ⑩). Un champ rempli par l'application (brouillon restauré, formulaire prérempli) n'a rien à perdre : s'il retenait la page, un seul champ prérempli à l'écran suffirait à ne plus jamais appliquer de mise à jour.
- ⚠️ **Un champ masqué ne retient rien** (⑧, ⑨) : `#convFpInput` garde son texte quand le panneau sort sur le côté, et ce texte est déjà dans le brouillon. **Le cadre, pas la fenêtre** : sur un grand écran, `.app-shell` ne fait que 440 px, le panneau refermé reste dans la fenêtre, découpé seulement par le cadre ; le test sur `window.innerWidth`, vert sur un téléphone, retenait la page pour toujours sur un ordinateur (⑧ tourne à 1 280 px pour ça). Pas de test vertical : dans un long formulaire, le champ rempli sort souvent de l'écran. **Limite assumée** : un texte laissé au Studio puis l'écran quitté part au rechargement, comme avant.
- ⚠️ **Le toast se tait pendant le report** (`passioMajDifferee`, app-09) : « recharge pour l'appliquer » inviterait à couper soi-même l'appel qu'on vient de protéger. **Pas sur une page sans contrôleur** : elle ne recharge pas d'elle-même, le toast reste sa seule annonce (UXO-11, ⑪).
- ⚠️ **Les 3,5 s de calme viennent du toast de fin** : « Live terminé · 3 min · pic 5 spectateurs » vit 3 s et n'existe nulle part ailleurs. Le calme est mesuré dans la page (`pagehide` − fin) : une attente de Playwright rougirait au moindre ralentissement de la CI.
- ⚠️ **Le banc a failli ne rien prouver** : la marque du geste couvrait toute la durée de chaque test, et retirer la lecture de `_call` n'aurait fait rougir aucun cas, alors qu'à la 61ᵉ seconde d'un vrai appel la page aurait rechargé. `gesteDepasse` fait passer la borne après la pose de l'état.
- ⚠️ **Banc : la cible Supabase des artefacts n'existe pas et le proxy est mort.** Sous WebKit, une page contrôlée échappe à `page.route` (fiche du 04/11 sur le pilotage) : la route seule ne garantissait pas qu'aucune requête n'atteigne la production. Le WebKit de Playwright n'a ni WebRTC ni `mediaDevices` : un double, pour que les vrais gestionnaires tournent.
- **Verrou** : `tests/e2e/pwa-maj-pendant-appel.spec.js` (13), le vrai worker, deux artefacts, les vrais gestionnaires ; seul le client du serveur est simulé. Chromium, et socle WebKit de la CI.
- **Mutations** : 28 réinjectées, 28 rouges. Aucun report → ② à ⑨ ; la minuterie ne recharge jamais → ② ⑥ ; page toujours occupée → ① ⑩ ⑬ ; chaque lecture d'état retirée → son cas (② ③, ③, ⑤, ⑥) ; marque ignorée → ② à ⑦ ; borne retirée → ⑬ ; chacun des six gestes non marqué → son cas ; marque non effacée → ④, ⑦ ; pas de calme → ② ⑤ ; saisie ignorée → ⑧ ⑨ ; `isTrusted` retiré → ⑩ ; focus exigé → ⑨ ; champ masqué compté, panneau compté, fenêtre au lieu du cadre → ⑧ (et ⑨ pour le premier) ; toast sans garde → ② ⑤ ⑧ ; `hadController` oublié au toast → ⑪, au rechargement → `pwa-premiere-installation.spec.js` ② ; lecture sans `window.` → ⑫. Le témoin ①, repassé sous chaque mutation : vert sous 26, rouge quand la page est toujours occupée et quand `hadController` saute (une première installation recharge alors). C'est lui qui prouve que la sonde voit un rechargement.
- **Artefact minifié comme en CI** (`html-minifier-terser`, `terser --compress --mangle`), contrôle ponctuel hors suite : sous Chromium et WebKit, même page et aucun toast pendant l'appel, la sonnerie et le Live ; rechargement 4,0 à 4,4 s après la fin, sur le code et le `buildId` de B. `window._call` et `_appelLanceA` sont des propriétés : le minifieur ne les renomme pas.
- **Une vraie conversation, contrôle ponctuel hors suite** : deux pages Chromium, deux vrais `RTCPeerConnection`, le média factice du navigateur, les vrais gestionnaires des deux côtés, la signalisation relayée par le script. Mise à jour pendant l'appel, puis 6 s : toujours `connected`, 102 750 octets envoyés au lieu de 27 336, 105 087 reçus au lieu de 29 043, aucun toast ; A raccroche, les deux pages rechargent sur le code de B, 4,7 et 4,2 s après. Le même contrôle sur le code d'avant : plus d'appel des deux côtés, et le toast.
- **Un vrai Live, même contrôle** (c'est l'exposition d'aujourd'hui) : un diffuseur, un spectateur, la présence relayée par le script. 6 s après la mise à jour : toujours `connected`, 247 527 octets de vidéo reçus au lieu de 61 237, 171 images décodées au lieu de 49, aucun toast de mise à jour ; le diffuseur termine, sa page recharge 4,7 s après, celle du spectateur 6,6 s après (1,8 s de « Le live est terminé », puis le calme). Sur le code d'avant : plus de Live des deux côtés.
- **Deux onglets, deux déploiements pendant le même appel, même contrôle**, Chromium et WebKit : l'onglet libre recharge à chaque version ; l'onglet en appel reste la même page, puis recharge une seule fois à la fin, sur la dernière version, 3,8 et 4,2 s après.
- **Non vérifié** : aucun iPhone réel ; la vraie conversation et le vrai Live n'ont tourné que sous Chromium, sur un seul poste (le WebKit de Playwright n'a pas WebRTC).
- ⚠️ **Deux PR vertes peuvent faire un `main` rouge.** Cette fiche avait sa ligne dans `CLAUDE.md`. #716 en a ajouté une de son côté, après le passage de la CI de cette PR : 39 617 + 259 + 150 = 40 026 caractères, 26 au-dessus du plafond. `tests/unit/audit-claude-md.test.mjs` a rougi sur `main` seulement, et le déploiement a sauté, pour cette PR comme pour les suivantes. La ligne est retirée. `CLAUDE.md` est à 39 876 : une ligne de plus demande d'en retirer une, et une PR qui y touche se relit contre le `main` du moment, juste avant de fusionner.
- **Hors champ de cette fiche** : l'enregistrement d'un vocal (app-09), la capture d'une story ou d'une bobine (app-08), l'envoi d'une publication en cours (`publishPost`, `storage.upload`). Mesurés et traités le même jour, fiche suivante.

## 🎙️ UNE MISE À JOUR SILENCIEUSE PERDAIT LE VOCAL, LA CAPTURE ET L'ENVOI — le rechargement attend aussi (2026-11-04)

Suite de la fiche précédente. La question : une mise à jour silencieuse interrompt-elle un enregistrement ou un envoi en cours ? Oui, et deux de ces pertes ne se voyaient nulle part.

- **Mesuré avant correctif**, même banc : vrai worker, deux artefacts, serveur qui bascule de A à B. Chromium avec son micro et sa caméra factices, vrais `MediaRecorder`, vrais gestionnaires, vrai SDK, réseau tenu par `page.route`. La page recharge partout entre 65 ms et 1,1 s après la fin de `update()` (témoin : 273 ms).

| Au moment du déploiement | Après le rechargement |
|---|---|
| Vocal en cours, 2 s enregistrées | Rien, 0 vocal |
| Vocal ou pièce jointe envoyés, dépôt en cours | Affiché chez l'auteur, sans statut, **0 insertion et rien en file**, encore 9 s après : le destinataire ne le reçoit jamais, et personne ne le sait |
| Vidéo jointe en cours d'optimisation | Rien, 0 message |
| Bobine ou story en cours de capture | Rien, éditeur fermé |
| Bobine ou story dans l'aperçu, avant publication | Rien, éditeur fermé |
| Audio du Studio en cours, ou prêt à publier ; photo choisie au Studio | Rien |
| Photo, vidéo ou audio publiés, dépôt en cours | `perdue`, « son média n'est plus sur cet appareil — republie-la » |
| Bobine publiée, dépôt en cours | Reste dans `userPosts` **sans vidéo, sans statut, jamais renvoyée, sans un mot** |
| Story publiée, dépôt en cours | Disparue |
| Photo en échec, renvoi prévu dans 45 s | `perdue` |

- **Trois mesures sans perte, donc rien d'ajouté** : une publication de texte repart seule au démarrage (`synced`, « Publication envoyée ») ; un message texte en vol, vraie requête sans réponse vers le banc, est écrit dans `passio_outbox_v1` avant le départ de la page, sous Chromium et WebKit ; une caméra ouverte sans rien de filmé n'a qu'à se refermer. ㉔ et ⑰ gardent la publication et la caméra : la page recharge aussitôt.
- **Cause** : un média ne vit qu'en mémoire tant que le serveur ne l'a pas. `_leanState` retire le base64 de `userPosts` et n'écrit jamais `seed`, donc les stories.
- **Correctif** : `pageOccupee()` lit aussi `enregistrementEnCours()`, `mediaEnAttente()` et `envoiEnCours()`, toujours sur `window` ou dans le DOM. Enregistrer : `_isRecording`, `meCam.recording`, `_enregistreurStudio.state` (`let mediaRecorder` n'est pas sur `window`). Attendre : `#mediaEditor.open.phase-edit`, l'aperçu du Studio sur `#screen-studio.active`, `#meProgressOv`. Envoyer : `_envoiCommence()` (app-02) à `supaPublishPostWithRetry`, `supaPublishStory`, `_processAttach`, `_sendVoiceMessage`, `sendMessageToSupabase`.
- ⚠️ **Toutes les lectures sont bornées, un rechargement ne se perd jamais** (⑮, ㉗, ㉘, ㉙). Le vocal n'a aucune durée maximale : 15 min, ici seulement. La capture s'arrête seule à 60 s, le Studio à 120 s. Un envoi : 15 min depuis le dernier lancé, assez pour 25 Mo à 256 kb/s. L'optimisation : 90 s (`VIDEO_COMPRESSION_DELAI_MAX`). L'aperçu et le Studio se comportent comme un champ rempli : ils finissent quand on les quitte.
- ⚠️ **ENCORE UN TROU ENTRE L'ARRÊT ET LA SUITE.** Dès `recorder.stop()`, plus rien ne dit qu'un enregistrement existe : la lecture du fichier est asynchrone, et l'aperçu ou l'envoi n'arrivent qu'après. `_mediaEnPreparation()` pose une marque de 15 s à l'arrêt des trois enregistreurs et au choix d'une pièce jointe (`handleAttachFile`, la compression précède aussi l'envoi). Jamais effacée : au pire, 15 s de report en plus. `preparationDepassee` la fait passer dans les cas, sinon elle couvrirait la suite, comme `gesteDepasse` à la fiche précédente.
- ⚠️ **`_publishInProgress` ne dit rien de l'envoi** : `publishPost` rend la main au bout de 5 s (« Post en local »), le verrou retombe et le dépôt continue. Le lire aurait rechargé en plein dépôt (㉑). D'où un compteur au point d'écriture central, pour tous les producteurs.
- ⚠️ **Un échec n'est pas une fin.** Sans `_mediaARenvoyer()`, une coupure réseau ouvrait la porte : dépôt échoué, 3,5 s de calme, rechargement, média perdu, avant même le premier des huit renvois (㉖). La lecture exige `_reelRetryTimer` : plus aucun après le dernier essai, et la page recharge (㉗). C'est une fonction, lue dans un `try` : une exception ici ne rechargerait plus jamais.
- ⚠️ **Seul le média compte** (`_publicationPorteUnMedia`, ㉔, ㉛) : ni un texte, ni une publication dont le média est déjà une URL. L'envoi d'une story compte toujours : `seed` n'est jamais écrit, même une story sans média n'existe qu'en mémoire.
- **La prise de contrôle ne coupe pas un dépôt.** `sw.js` ne touche pas aux POST. Contrôle ponctuel, Chromium : vrai SDK, requête tenue par `page.route`, cache de B seul présent, 6 s plus tard la réponse arrive : `synced`, 4,0 s après, sur le code de B. Même chose pour une pièce jointe.
- **Banc** : `launchOptions` y est une fonction, parce que ces drapeaux n'ont de sens que pour Chromium et que la suite tourne aussi sous WebKit, qui n'a ni `MediaRecorder` ni `mediaDevices` (double, sous WebKit seulement : `vraisMedias`). Le client simulé gagne `storage` et peut tenir un dépôt ou une insertion ; une écriture aboutie s'inscrit dans `sessionStorage`, seule preuve qui survive au rechargement (`ecritures`). Seules les tables mesurées sont tenues : une notification qui passe ne doit pas prendre la place de l'écriture attendue.
- **Verrou** : `tests/e2e/pwa-maj-pendant-appel.spec.js`, 18 cas de plus (⑭ à ㉛), Chromium et socle WebKit de la CI. Le témoin ① reste : une page sans activité recharge aussitôt.
- **Mutations** : 40 réinjectées, 40 rouges. Chaque lecture retirée → son cas (⑭, ⑯, ⑱, ⑲, ⑳, ㉑ ㉒ ㉓ ㉕, ㉖) ; chaque borne retirée → ⑮, ㉘, ㉙ ; `#screen-studio.active` élargi → ⑱ ; envoi non compté → ⑭, ㉑ ㉒, ㉓, ㉕ ; fin d'envoi oubliée à chaque point → ⑭, ㉑, ㉓, ㉕, ㉚ ; fin comptée deux fois → ㉙ ; marque oubliée à chaque arrêt → ⑭, ⑯, ⑱, ㉕ ; image, vidéo, audio ignorés → ㉑, ㉒, ㉔ ; texte compté → ㉔, ㉛ ; renvoi sans minuteur → ㉗. Le témoin ①, repassé sous chacune : vert sous les 40.
- ⚠️ **La première passe en a laissé filer une** : « renvoi d'un texte compté » restait vert. Le cas posait lui-même `_reelRetryTimer`, et la reprise du démarrage (`_rejouerPublicationsEnAttente`, à 6 s) l'effaçait avant le déploiement : vert pour une mauvaise raison. ㉛ passe par le vrai chemin d'échec, après ces 6 s, et il rougit.
- **Artefact minifié comme en CI** (`html-minifier-terser`, `terser --compress --mangle`), contrôle ponctuel hors suite : ①, ⑭, ⑮, ⑯, ⑱, ㉑, ㉓, ㉕ et ㉖ verts sous Chromium et WebKit. `meCam` et `_voiceStartAt` sont des `var` de premier niveau, donc des propriétés de `window`, et sans `--toplevel` le minifieur ne les renomme pas.
- **Non vérifié** : aucun iPhone réel, et sous WebKit l'enregistreur est un double : seuls les gestionnaires y sont éprouvés. Pas de cas pour `reader.onerror` et pour une conversation disparue à la lecture du fichier : si leur fin d'envoi manquait, seule la borne rendrait la main.
- **Hors champ** : le report ne protège que d'une mise à jour. Une application fermée pendant un dépôt coupe le même code, sans mesure à ce jour : vocal ou pièce jointe affichés sans jamais partir, bobine sans vidéo. Les autres dépôts (photo de profil, couverture d'événement) n'ont pas été mesurés. Un média laissé au Studio puis l'écran quitté part au rechargement, comme un texte.

## 📎 UNE PIÈCE JOINTE EN ÉCHEC PARTAIT EN ÉTIQUETTE « NON SYNCHRONISÉ », ANNONCÉE ENVOYÉE — le dépôt a désormais un verdict, une file et un « réessayer » (2026-11-07)

Reste listé au § 8 de `docs/AUTONOMIE_EXPLOITATION.md` (« lot pièce jointe »). L'ordre décrivait un repli qui écrivait le fichier en base64 dans `conv_messages`. **La mesure a corrigé la prémisse avant le code** : ce n'était pas le défaut de ce chemin-là, c'en était un autre, et pire.

- **Mesuré en production, en lecture seule (canal ①)** : 88 lignes `conv_messages`, **0** data URL, **0** étiquette `"expired":true`, la plus longue 551 caractères. La garde de `sendMessageToSupabase` retirait bien le base64 depuis la beta.
- **Le vrai défaut était le repli lui-même.** Sur un dépôt Storage en échec, refus OU coupure, `_processAttach` (photo, vidéo, document, audio) et `_sendVoiceMessage` appelaient `sendMessageToSupabase(…, dataUrl, …)`. La garde insérait alors `{"url":"","expired":true,"text":"📎 … (non synchronisé)"}` et le message passait **envoyé**. Trois effets, aucun visible :
  - le destinataire ne recevait qu'une étiquette ;
  - chez l'auteur, la relecture du fil à l'ouverture suivante **remplace** la copie locale par la ligne serveur (`_fusionnerMessagesServeur`). La photo de l'auteur devenait l'étiquette : le média était perdu pour tout le monde ;
  - hors ligne, c'est l'étiquette qui partait en file (`_outboxAdd`) puis au retour du réseau. Une coupure n'était jamais rattrapée.
  - Et rien au pilotage : `_diag` n'écrit qu'en mode debug.
- **La vraie porte du base64 était le TRANSFERT.** Ma propre photo, tout juste envoyée, n'existe sur l'appareil qu'en data URL jusqu'à la relecture du fil. `_forwardTo` l'insérait telle quelle dans `conv_messages`, sans passer par la garde. Mesuré sur le code d'avant : `"url":"data:image/png;base64,iVBOR…"` dans le POST (⑨). Pas encore vu en production (0 ligne), parce que personne n'avait transféré dans la fenêtre.
- **Correctif** (app-09, `_pjDeposer`, avec `_flushOutbox` et `_retryMsg` en app-04) :
  - **Statut dès la bulle.** Toute pièce jointe et tout vocal porte `status: "sending"`, `de` (le compte réel, AUTH-06) et `pj` (type, nom, chemin d'objet **fixé au premier essai**). L'ancienne bulle n'avait aucun statut, donc passait pour envoyée d'office.
  - **Coupure → file.** Une coupure (`estEchecReseau`, seule autorité ; SDK pas chargé ou `navigator.onLine === false` aussi) affiche l'échec, écrit la file `passio_pj_outbox_v1` sous le propriétaire capturé à l'origine (ASTRA-21/43) et enregistre la copie locale **tout de suite** (`saveConversationsNow`). `_flushOutbox` la rejoue au démarrage et au retour du réseau : compte d'abord, un dépôt en vol à la fois, plafond `MSG_ESSAIS_MAX`.
  - **Refus → visible.** Un refus réel (403, 413, 5xx…) affiche l'échec et un toast, sans rejeu automatique. « réessayer » redépose depuis la copie locale. Avant ce lot, un renvoi de média reconstruit depuis le texte partait en message **vide**.
  - **Réponse perdue → 409.** Au renvoi, l'objet déjà présent sous NOTRE chemin (409 « already exists ») prouve le dépôt. Seulement à partir du 2ᵉ essai (⑤) : le chemin porte un aléa propre au message.
  - **Garde = refus.** La garde de `sendMessageToSupabase` ne fabrique plus d'étiquette : une data URL n'insère rien, le message passe en échec, et une erreur `piece_jointe_data_url` est levée. C'est un défaut de notre code, puisque plus aucun appelant n'en passe.
  - **Transfert.** Le transfert copie l'objet déjà déposé (`m.pj.url`), sinon il dépose la copie dans le dossier de la cible (`_pjDeposerDataUrl`). Un échec est un transfert refusé, et c'est dit. Un document local part comme document : il partait en message vide.
  - **Fermeture en plein dépôt → reprise.** Une application TUÉE pendant un dépôt laisse la bulle « envoi… », sans file : aucun gestionnaire n'a tourné. Au premier vidage de la page suivante (`_pjReprendreInterrompus`, une fois par page), une bulle à moi encore « sending » et née AVANT ce chargement repart en file. Jamais une bulle de la page en cours : son insertion peut être en vol, et la doubler finirait en 23505 puis « échec » sur un message livré (ROB-06). Un simple RECHARGEMENT, lui, laisse le navigateur régler la requête coupée : elle passe par la file des coupures (⑫ bis).
- ⚠️ **La file est à part de `passio_outbox_v1`, délibérément.** Une entrée sans `content` serait insérée telle quelle par un client plus ancien après un retour arrière Netlify. Elle est dans `ACCOUNT_SCOPED_KEYS`.
- **Télémétrie** : `tel.error`, action `piece_jointe_depot`, `meta` = `rc` (code fermé : `reseau`, `refus`, `trop_lourd`, `limite`, `serveur`, `illisible`, `url_absente`, `http_<n>`), `http`, `kind`, `voie` (`premier`, `rejeu`, `manuel`, `transfert`), `essai`, `ko`. Coupure, limite et fichier trop lourd sont des `warn` ; le reste des `error`. Jamais le libellé du serveur, qui peut porter la clé de l'objet donc le nom du fichier.
  - ⚠️ `sante.erreursJs15` compte tout `type = "error"`, `warn` compris (seuil rouge à 10 en 15 min). Une coupure n'émet qu'au premier essai interactif, jamais à chaque rejeu.
  - Le parcours reste dans `PARCOURS_NON_INSTRUMENTES` (`piece_jointe`). Mettre à jour son `vuPar` touche `supabase/functions/**`, donc redéploie les quatre fonctions : laissé au prochain lot qui y touche.
- **Verrou** : `tests/e2e/piece-jointe-depot-echec.spec.js`, 15 cas. Vrai client Supabase et réseau tenu par `page.route`, posé APRÈS `bootOnboarded` : la route médias de l'isolation laisse partir les écritures vers la production. On mesure le corps des POST `conv_messages` et les chemins déposés.
  - Les attentes ne lisent que ce qui existait avant le correctif. La première rédaction attendait `_pjDeposer` et `m.pj` : sur le code d'avant, les 11 cas rougissaient par EXPIRATION, sans rien mesurer. Ils rougissent désormais sur l'écart (« sent » au lieu de « failed », 1 POST au lieu de 0).
- **Réinjection** : le code d'avant (HEAD `019896b`, worktree séparé) rougit les 11 cas. 11 mutations, 11 tuées :

  | Mutation | Cas rouges |
  |---|---|
  | ancien repli data URL de `_processAttach` | ① ② ③ ④ ⑦ ⑩ |
  | garde revenue à l'étiquette | ⑪ |
  | transfert de la copie brute | ⑧ ⑨ ⑩ |
  | 409 accepté dès le 1er essai | ⑤ |
  | file rejouée sans vérifier le compte | ⑦ |
  | ancien repli du vocal | ⑥ |
  | `_flushOutbox` sans la file des dépôts | ③ ④ ⑥ ⑦ |
  | chemin neuf à chaque essai | ② ③ ④ ⑥ ⑩ |
  | toute panne lue comme un refus | ③ ④ ⑥ ⑦ |
  | aucune télémétrie | ① ③ |
  | « réessayer » reconstruit en texte | ② |

- **Non-régression** : `pwa-maj-pendant-appel.spec.js` 31/31 (⑭ vocal, ⑳ vidéo, ㉕ photo, ㉚ insertion refusée), et 99/99 sur quinze suites de la messagerie (`message-media-echec`, `pieces-jointes-cycle`, `transfert-message`, `file-messages-par-compte`, `parcours-flux`…). Chromium seulement : le socle WebKit n'accueille une suite qu'après un passage vert en CI (`playwright.config.js`).
- **Hors champ, constaté** :
  - transférer un VOCAL envoie toujours un message vide (`_forwardTo` n'a pas de branche `voiceData`) ;
  - aucune contrainte serveur n'interdit une data URL dans `conv_messages.content` : une migration, donc une contre-revue humaine ;
  - aucun plafond client pour un document ou un audio (le seau borne à 50 Mo, désormais dit par « trop lourd ») ;
  - application tuée APRÈS le dépôt, pendant l'insertion : la reprise renvoie la ligne, le serveur répond 23505 et la bulle passe « échec » jusqu'au rejeu suivant de la file des messages, qui prouve la ligne (`_conflitClePrimaire`, `_ligneDejaEnBase`) et la dit envoyée. Elle converge, avec un détour.
