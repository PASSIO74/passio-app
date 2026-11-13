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
- ↪️ TRANSFÉRER UN VOCAL ENVOYAIT UN MESSAGE VIDE — il part en vocal, son objet copié ou déposé dans la cible (2026-11-07)
- 📡 LE RELAIS DES LIVES ET DES APPELS ÉTAIT MORT — relais Cloudflare, identifiants fabriqués par le serveur (2026-11-09)
- 📵 LES PUSH SOCIALES PLANTAIENT DEPUIS LE 07/11 — `uid` jamais déclaré dans `notify-call` (2026-11-09)
- 🎞️ LES GIF PASSENT PAR KLIPY — Tenor fermé, Giphy plafonné à 100 recherches par heure pour toute l'app (2026-11-09)
- 🔔 PAS DE NOTIFICATION SANS ÉVÉNEMENT MÉTIER — elle part au verdict de son écriture (2026-11-13)
- 🔔 DES NOTIFICATIONS D'EXEMPLE PRÉSENTÉES COMME RÉELLES — résumé IRL, copies de la graine, tendances (2026-11-09)
- 🪆 LE DÉCOR DES EXEMPLES : UNE DISCUSSION QUI SE VIDAIT, DES MESSAGES QUI SE DÉDOUBLAIENT (2026-11-10)
- ✅ CE QUI EST ANNONCÉ EST CE QUI EST GARDÉ : PROFIL, BULLES EN ATTENTE, COMMENTAIRE MODIFIÉ (2026-11-10)
- 🧾 GROUPE : DESCRIPTION ET SORTIE SOUS VERDICT (2026-11-12, SRV-04 et ETAT-04)
- ↩️ LES RETRAITS DISENT LEUR VERDICT ET CONVERGENT : SUPPRIMER POUR TOUS, FILE DES SUPPRESSIONS, SUIVIS, BLOCAGES, INSCRIPTIONS (2026-11-12, ETAT-04, ETAT-05, ETAT-08)

---
- 🧹 PLUS DE PASSIONS SOUS LES PSEUDOS — messagerie et commentaires (2026-11-13)

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
  - **Transfert.** Le transfert copie l'objet déjà déposé (`m.pj.url`, lu par `_pieceJointeDuMessage`). Sinon il téléverse la copie dans le dossier de la cible par `_televerserPieceJointeVers` : la fonction de PASSIO74/passio-app#751, arrivée sur `main` le même jour pour la même porte (bornes de contenu de la base, `CONTENU_MESSAGE_BORNE`). Ce lot ne garde qu'UN mécanisme (le mien, `_pjDeposerDataUrl`, est retiré) et lui ajoute : le document local (`docData`, qui partait en message vide), l'attente de la page pendant le dépôt (`_envoiCommence`, fin rendue sur toute issue) et le signal au pilotage (`voie: "transfert"`). Un échec est un transfert refusé, et c'est dit.
  - **Fermeture en plein dépôt → reprise.** Une application TUÉE pendant un dépôt laisse la bulle « envoi… », sans file : aucun gestionnaire n'a tourné. Au premier vidage de la page suivante (`_pjReprendreInterrompus`, une fois par page), une bulle à moi encore « sending » et née AVANT ce chargement repart en file. Jamais une bulle de la page en cours : son insertion peut être en vol, et la doubler finirait en 23505 puis « échec » sur un message livré (ROB-06). Un simple RECHARGEMENT, lui, laisse le navigateur régler la requête coupée : elle passe par la file des coupures (⑫ bis).
- ⚠️ **La file est à part de `passio_outbox_v1`, délibérément.** Une entrée sans `content` serait insérée telle quelle par un client plus ancien après un retour arrière Netlify. Elle est dans `ACCOUNT_SCOPED_KEYS`.
- **Télémétrie** : `tel.error`, action `piece_jointe_depot`, `meta` = `rc` (code fermé : `reseau`, `refus`, `trop_lourd`, `limite`, `serveur`, `illisible`, `url_absente`, `copie_perdue`, `http_<n>`, `sans_code`), `http`, `kind`, `voie` (`premier`, `rejeu`, `manuel`, `transfert`), `essai`, `ko`. Coupure, limite et fichier trop lourd sont des `warn` ; le reste des `error`. Jamais le libellé du serveur, qui peut porter la clé de l'objet donc le nom du fichier.
  - ⚠️ `sante.erreursJs15` compte tout `type = "error"`, `warn` compris (seuil rouge à 10 en 15 min). Une coupure n'émet qu'au premier essai interactif, jamais à chaque rejeu.
  - Le parcours reste dans `PARCOURS_NON_INSTRUMENTES` (`piece_jointe`). Mettre à jour son `vuPar` touche `supabase/functions/**`, donc redéploie les quatre fonctions : laissé au prochain lot qui y touche.
- **Verrou** : `tests/e2e/piece-jointe-depot-echec.spec.js`, 27 cas. Vrai client Supabase et réseau tenu par `page.route`, posé APRÈS `bootOnboarded` : la route médias de l'isolation laisse partir les écritures vers la production. On mesure le corps des POST `conv_messages` et les chemins déposés.
  - Les attentes ne lisent que ce qui existait avant le correctif. La première rédaction attendait `_pjDeposer` et `m.pj` : sur le code d'avant, les 11 cas rougissaient par EXPIRATION, sans rien mesurer. Ils rougissent désormais sur l'écart (« sent » au lieu de « failed », 1 POST au lieu de 0).
- ⚠️ **LA REVUE `audit-passio` A TROUVÉ UN FAUX VERT, ET IL PORTAIT LA PROMESSE CENTRALE DU LOT.**
  - Au démarrage, `supaInit` attend `_rafraichirConversationsServeur()` sans `fusion` (app-08). Il REMPLACE chaque conversation connue du serveur par la sienne, dont `messages` ne porte que le dernier message.
  - La bulle en attente disparaissait donc avec sa copie, alors que la file des dépôts ne porte que des identifiants.
  - Le banc servait `conversations` / `conv_members` vides : le démarrage gardait la copie locale, et ⑫, ⑫ bis et le « après redémarrage » de ③ étaient verts pour une mauvaise raison.
  - Reproduit avant correctif (conversation connue du serveur) : 0 dépôt, 0 insertion, aucune trace.
  - Pire, un dépôt EN VOL à ce moment lisait la bulle absente comme « supprimée » et RETIRAIT l'objet déposé. L'ancien code, lui, insérait.
- **Correctifs de la revue** (sept constats, reproduits avant correction) :
  - `_rafraichirConversationsServeur` reporte sur l'objet serveur MES bulles de pièce jointe pas encore envoyées.
  - Une bulle introuvable n'est « supprimée » que sur PIERRE TOMBALE (`convTombAdd("msg", …)`) : sans elle, l'objet déposé est inséré quand même, et une copie perdue remonte en `copie_perdue`.
  - Le renvoi d'un média déjà déposé passe par `_sendTextToSupa`, qui tient un seul envoi en vol par message et prouve un 23505. `sendMessageToSupabase` renvoyait avec puis sans `from_id` (3 INSERT mesurés), et un message livré pouvait finir « échec ».
  - Une coupure ne se signale plus à chaque rejeu.
  - `_forwardTo` capture l'auteur AVANT ses `await` (ASTRA-21).
  - Un 403 de dépôt tente la réparation d'appartenance une fois, comme le texte (`_reparerAppartenanceConv`).
  - Le mode invité et une conversation de démonstration bloquent la pièce jointe et le vocal comme le texte (`_pjEnvoiPermis`).
  - « Supprimer pour tous » ma pièce jointe tout juste envoyée retire aussi son objet (MSG-03 : `_pieceJointeDuMessage` lit `m.pj.url`).
  - La fin d'envoi du téléversement d'un transfert est rendue sur toute issue, levée synchrone comprise.
  - Les deux `saveConversationsNow` du chemin nominal sont retirés (deux `JSON.stringify` complets, base64 compris, par envoi). Seul reste celui de la mise en file.
  - Le banc sert désormais toutes ses lectures, la conversation connue du serveur comprise, et attend `_supaReal` et `_supaInitTerminee`.
  - Nouveaux cas ⑮ à ㉖ (㉕ : une copie perdue remonte ; ㉖ : un document local transféré part comme document).
  - ⚠️ Deux gardes ajoutées en première intention (« la file des messages porte déjà ce message ») ont été RETIRÉES : avec le renvoi par `_sendTextToSupa`, son « un envoi en vol » suffit, et une garde qu'aucun cas ne peut faire rougir est du poids mort (⑲ reste le verrou).
- **Réinjection, sur le code final** (fusion de `main` comprise) :
  - Le code d'avant (`019896b`, worktree séparé) rougit 25 des 27 cas.
  - ⑲ et ⑳ y sont verts, et c'est attendu : ils gardent deux défauts que la PREMIÈRE version de ce lot avait introduits (double insertion à la reprise, objet retiré quand la bulle manque), pas le défaut d'origine. Leur mutation les rougit.
  - 24 mutations, une à la fois, 24 tuées :

  | Mutation | Cas rouges |
  |---|---|
  | ancien repli data URL de `_processAttach` | ① ② ③ ④ ⑦ ⑩ ⑫ bis ⑮ ⑰ ㉑ ㉔ |
  | garde revenue à l'étiquette « non synchronisé » | ⑪ |
  | transfert sans téléversement de la copie locale | ⑧ ㉓ |
  | 409 accepté dès le 1er essai | ⑤ |
  | file rejouée sans vérifier le compte | ⑦ |
  | ancien repli du vocal | ⑥ |
  | `_flushOutbox` sans la file des dépôts | ③ ④ ⑥ ⑦ ⑫ ⑫ bis ⑭ ⑰ ㉒ ㉕ |
  | chemin d'objet neuf à chaque essai | ② ③ ④ ⑥ ⑫ ⑫ bis ⑮ |
  | toute panne lue comme un refus | ③ ④ ⑥ ⑦ ⑰ |
  | aucune télémétrie de l'échec | ① ③ ⑰ ㉕ |
  | « réessayer » reconstruit en texte | ② |
  | pas de reprise des bulles interrompues | ⑫ ⑭ ㉒ |
  | reprise des bulles de CETTE page | ⑬ |
  | reprise à chaque vidage | ⑭ |
  | démarrage : bulles en attente non reportées | ⑫ ⑫ bis ⑭ ⑯ ㉒ |
  | bulle absente lue « supprimée » (objet retiré) | ⑳ |
  | renvoi d'un média déposé par `sendMessageToSupabase` | ⑲ ㉒ |
  | coupure signalée à chaque rejeu | ⑰ |
  | 403 sans réparation d'appartenance | ① ② ⑮ |
  | ni mode invité ni démonstration bloqués | ⑱ |
  | transfert : auteur relu après les `await` | ㉓ |
  | « supprimer pour tous » sans `m.pj.url` | ⑩ ㉔ |
  | copie perdue muette | ㉕ |
  | transfert : document local ignoré | ㉖ |

  - ⚠️ **Le banc de mutations a menti deux fois, et c'était lui.** En série, « ancien repli » (la première de la série) et « document local ignoré » sont sortis « AUCUN cas rouge ».
    - La seconde : la lecture des cas s'arrêtait à ㉕, donc un échec de ㉖ ne se lisait pas.
    - La première : rejouée seule, elle rougit 11 cas (table ci-dessus).
    - Une mutation « survivante » se rejoue seule, sortie brute sous les yeux, avant d'être crue.
    - Dans la même série, ⑩ a rougi une fois sous « file sans compte », puis jamais (4 passages seul, une relance de la mutation) : un raté du banc, pas une dépendance.

- **Non-régression** : `pwa-maj-pendant-appel.spec.js` 31/31 (⑭ vocal, ⑳ vidéo, ㉕ photo, ㉚ insertion refusée), 99/99 sur quinze suites de la messagerie (`message-media-echec`, `pieces-jointes-cycle`, `transfert-message`, `file-messages-par-compte`, `parcours-flux`…), et après la fusion de `main` : `message-contenu-borne` 9/9 (#751) avec les suites du transfert. CI entière verte sur 0a9c3dac et b6e466b0, socle WebKit compris. Chromium seulement pour la nouvelle suite : le socle WebKit n'accueille une suite qu'après un passage vert en CI (`playwright.config.js`).
- **Deux rouges de CI sans lien avec ce diff, analysés et relancés une fois** (commentaires sur PASSIO74/passio-app#747) :
  - `feed-window.spec.js:166`, 12 cartes au lieu de plus de 20, sur 603ebdb et ce3d4770, vert à la relance de ce3d4770, sur 0a9c3dac, b6e466b0 et le même code dans #750. Jamais reproduit en local. Cause non trouvée : la liste est REPEINTE avec moins de publications pendant le défilement.
  - Les suites à comptes réels : « Request rate limit reached » de l'authentification du staging.

- **Hors champ, constaté** :
  - transférer un VOCAL envoie toujours un message vide (`_forwardTo` n'a pas de branche `voiceData`) : PASSIO74/passio-app#750, empilée sur ce lot, le règle ;
  - aucune contrainte serveur n'interdit une data URL dans `conv_messages.content` : PASSIO74/passio-app#754 la propose (deux CHECK), en attente de sa contre-revue humaine ;
  - aucun plafond client pour un document ou un audio (le seau borne à 50 Mo, désormais dit par « trop lourd ») ;

## ↪️ TRANSFÉRER UN VOCAL ENVOYAIT UN MESSAGE VIDE — il part en vocal, son objet copié ou déposé dans la cible (2026-11-07)

Constaté le jour même par le lot pièce jointe (fiche précédente, « hors champ ») et confié comme ordre séparé.

- **Le défaut.** `_forwardTo` (app-04) reconstruit l'enveloppe selon le type du message : photo ou vidéo, GIF, document, position — sinon du texte. Aucune branche ne lisait `voiceData`. Mesuré sur le code d'avant (HEAD `603ebdb`, corps des POST `conv_messages` relevés par le banc) :
  - mon vocal tout juste enregistré (`text: ""`) partait en `{"type":"text","text":""}` : un message **vide**, et une bulle vide dans la cible ;
  - un vocal **reçu** partait en texte « [AUDIO] Message vocal (7s) » (son `content.text` d'origine), APRÈS que son objet eut été copié dans le dossier de la cible : `_copierPieceJointeVers` savait déjà copier un `voiceData`, c'est l'enveloppe qui manquait — un objet orphelin à chaque transfert ;
  - un fichier audio joint (`voiceData` + `isFile`, `_processAttach`) partait vide de même ;
  - le menu du message (`_openMsgActions`) offre « Transférer » pour tout message : le geste était proposé, vocal compris.
  - Toujours vrai après le téléversement de la copie locale (PASSIO74/passio-app#751, fusionné dans le lot précédent, `ce3d477`) : mon vocal y était bien DÉPOSÉ dans la cible, puis parti en message vide — l'objet, lui, orphelin.
- **Correctif** (app-04, `_forwardTo`) :
  - **Un vocal part en vocal** : `{ type: "audio", filename: "Message vocal (Ns)", fileType: <conteneur réel>, url, text: "🎙 Message vocal" }`. Le destinataire le reconnaît au **nom** (`applyMsgContentData`), lecteur intégré et durée compris. « 🎙 Message vocal » figurait déjà dans `_LIBELLES_ENVELOPPE`, sans aucun producteur.
  - **L'objet suit le contrat des photos** : déjà dans le seau → **copié** dans le dossier de la cible ; copie locale seulement → l'objet déjà déposé (`m.pj.url`, que `_pieceJointeDuMessage` lit depuis la revue du lot précédent) est copié, sinon la copie est **déposée** (`_televerserPieceJointeVers`, le mécanisme unique du lot précédent, sous `transfert.<sous-type>`). Copie ou dépôt refusé = transfert refusé, dit ; jamais une data URL vers `conv_messages`. Ce lot n'ajoute aucun mécanisme de dépôt : il ajoute l'ENVELOPPE qui manquait derrière.
  - **Le conteneur réel** (`_conteneurAudioDuMessage`) : le mime de la copie locale, sinon l'extension de l'objet — `_sendVoiceMessage` nomme tout vocal `voice.<ext>` d'après son conteneur, une copie garde ce nom, et le dépôt d'un transfert s'appelle `transfert.<sous-type>` (mp4, webm, ogg). ⚠️ Un vocal REÇU ne garde pas `d.fileType` (`applyMsgContentData` ne recopie que l'URL et la durée) : sans l'extension, un vocal d'iPhone repartirait étiqueté `audio/webm`. Le conteneur est lu **avant** que l'URL de la copie ne remplace la data URL.
  - **La bulle locale de la cible** porte l'URL de la copie : le lecteur y est peint (signé au premier toucher, `_playVoiceById`), et « supprimer pour tous » purge la copie (`_purgerPieceJointeDe`).
  - **Un fichier audio joint part en fichier** (`type: "doc"`), comme le transfert d'un fichier audio reçu le faisait déjà. Parti en `audio`, la règle « `audio/webm` = vocal » d'`applyMsgContentData` aurait fait avaler un `.webm` par le lecteur de vocaux du destinataire.
  - **Filet** : rien à transférer (aucun média lu, texte vide) = refusé et dit (« Ce message ne peut pas être transféré »), jamais inséré. Ni copie ni dépôt ne peut précéder ce refus : ils ne visent que des médias que l'enveloppe sait lire.
  - ⚠️ **L'auteur avant la copie ou le dépôt** (ASTRA-21/43). `auteurTransfert` et `genTransfert` étaient relus APRÈS les `await` : un compte connecté pendant la copie — et un vocal est le dépôt le plus lent — signait le transfert. Mesuré sur le code d'avant (⑨, HEAD `603ebdb`) : la ligne partait sous `from_id` du compte SUIVANT, avec le message écrit par le précédent. Le trou existait depuis la copie d'ASTRA-01, pour tout type. Les deux revues `audit-passio` l'ont trouvé le même jour : la garde vit dans la revue du lot précédent (`_ctxTransfert` capturé à l'entrée, annulation muette — `diagLog("transfert_perime")` — avant la bulle et l'insertion), et ⑨ la verrouille sur la copie d'un vocal reçu. L'objet déjà copié reste alors orphelin : le compte courant ne peut pas le supprimer (la policy DELETE exige l'auteur).
- « Transférer » reste offert pour un vocal : le geste fonctionne désormais. Le retirer était le repli de l'ordre, pas sa cible.
- **Verrou** : `tests/e2e/transfert-vocal.spec.js`, 9 cas, même montage que `piece-jointe-depot-echec` (vrai client Supabase, réseau tenu par `page.route` posé APRÈS `bootOnboarded`). Mesurés : le corps des POST `conv_messages`, les copies (`sourceKey` / `destinationKey`), les dépôts et le type de leur partie multipart, ce que le destinataire en décode, la bulle peinte dans la cible ; ⑨ retient la copie le temps de la purge réelle (`purgeAccountScopedData`) et d'une nouvelle identité. Le banc attend `_supaReal` ET `_supaInitTerminee` avant de poser ses conversations : un démarrage encore en cours passerait dessus.
- **Réinjection** : le code d'avant rougit sur l'écart (« text » au lieu de « audio », aucune copie, un message vide inséré, une ligne sous l'autre compte) — ① ② ③ ⑤ ⑥ ⑦ ⑧ ⑨ sur `603ebdb` ; ① ② ③ ⑥ ⑦ ⑧ sur la tête du lot précédent (`ce3d477`), qui tient déjà ④ (copie refusée), ⑤ (dépôt refusé, #751) et ⑨ (garde ASTRA-21) — ils restent ici en non-régression. 10 mutations, 10 tuées (sur `ce3d477` + ce lot) :

  | Mutation | Cas rouges |
  |---|---|
  | branche vocal retirée | ① ② ③ ⑥ |
  | `voiceData` retiré de `_urlLocaleDuMessage` (#751) | ③ ⑤ ⑦ (② passe par la copie de `m.pj.url`) |
  | conteneur codé en dur `audio/webm` | ① ② ⑥ |
  | extension de l'objet ignorée | ① ⑥ |
  | filet du message vide retiré | ⑧ |
  | fichier audio lu comme un vocal | ⑦ |
  | bulle locale sans le vocal | ① ② |
  | nom sans « Message vocal » | ① ② ③ ⑥ |
  | garde ASTRA-21 retirée (`_outboxContextePerime(_ctxTransfert)`) | ⑨ |
  | auteur capturé APRÈS les attentes | ⑨ |

- **Non-régression** : `npm run verif` vert, `node scripts/build.js` OK. Sur `ce3d477` + ce lot : 69/69 — `transfert-vocal` 9/9, `piece-jointe-depot-echec` 26/26, `message-contenu-borne` 9/9 (#751), `file-messages-par-compte` 15/15, `message-media-echec` 4/4, `pieces-jointes-cycle` 4/4, `transfert-message` 2/2. Plus tôt (sur `603ebdb`), 22 suites de la messagerie, des pièces jointes et de la PWA, 172/173 — `piece-jointe-depot-echec` 15/15, `pieces-jointes-cycle` 4/4, `transfert-message` 2/2, `file-messages-par-compte` 15/15, `notification-message` 13/13, `parcours-flux` 13/13, `identite-expediteur-serveur` 6/6, `audit-2026-11-xss` 5/5… Le seul rouge, `pwa-maj-pendant-appel` ㉒ (une bobine, sans rapport), attendait `SW_UPDATED` sous charge — un build et une sonde tournaient à côté — et passe 3/3 seul.
- **Hors champ, constaté** :
  - la bulle de l'AUTEUR d'un fichier audio joint est VIDE jusqu'à la relecture du fil (sondé : `<div class="conv-bubble me"></div>` et l'heure seule) — `renderConvFpThread` n'a aucune branche pour `voiceData` + `isFile` ; après la relecture, la ligne serveur la rend en fichier (`fileUrl`) ;
  - un fichier audio REÇU, transféré, part en document : `applyMsgContentData` remplace son `fileType` par « audio », le mime d'origine est perdu (🎵 chez moi, 📄 chez le destinataire) ;
  - un transfert RÉUSSI ne notifie jamais le destinataire, quel que soit son type : la branche de succès de `_forwardTo` n'appelle pas `_notifierMessage` (seuls `_sendTextToSupa` — donc le rejeu de la file — et `sendMessageToSupabase` le font) ;
  - aucun signe pendant la copie ou le dépôt : la fenêtre se ferme, la bulle n'apparaît qu'après l'attente — qui refait le transfert, faute de rien voir, double le dépôt et le message ;
  - un objet copié ou déposé reste orphelin si l'insertion est ensuite refusée pour de bon (compte bloqué, plus membre), ou si l'application est tuée entre les deux — pour tout média transféré ;
  - la bulle transférée ne porte pas `de` : si la file perd son entrée (refus définitif, plafond), « réessayer » refuse avec « écrit avec un autre compte », au lieu de reconstruire depuis un texte vide — sûr, mais trompeur.

---

## 📡 LE RELAIS DES LIVES ET DES APPELS ÉTAIT MORT — relais Cloudflare, identifiants fabriqués par le serveur (2026-11-09)

- **Constat, mesuré le 2026-11-09** : `openrelay.metered.ca` résout vers 192.0.2.1 et 100::1, deux adresses réservées et non routables (RFC 5737, RFC 6666). L'opérateur a neutralisé son TURN public, et un banc Chromium n'en obtenait aucun candidat `relay`. Ses entrées sont sorties de `CALL_ICE_SERVERS` avec #795. Sans relais, un live ou un appel entre deux réseaux à NAT strict (4G derrière un CGNAT, réseau d'entreprise) échoue. Les appels sont coupés pendant le pilote (ASTRA-60) : aujourd'hui, le relais sert aux **lives**.
- **Remède sans dépense** : le TURN de Cloudflare Realtime (1 000 Go par mois gratuits, partagés avec le SFU). Ses identifiants se **fabriquent côté serveur** avec un jeton secret : `notify-call` répond à `{ type: "ice" }` par un `POST rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers` (`ttl` 21 600 s). La clé ne quitte jamais le serveur (secrets de la fonction `TURN_CF_KEY_ID` / `TURN_CF_API_TOKEN`) ; le navigateur ne reçoit que des identifiants valables **6 h** — assez pour un live, assez court pour qu'un identifiant sorti d'une console ne serve pas de relais gratuit une journée entière (24 h dans la première version, ramenées à 6 par l'audit du même jour).
  - **Où le geste se place** : APRÈS l'authentification et le plafond (un visiteur ne fabrique rien ; une session ANONYME non plus, `compte_requis`), AVANT l'interrupteur des appels (un live en a besoin quand les appels sont coupés), jamais en cache (`Cache-Control: no-store`). Il consomme une place du plafond des pushes (20/min, 200/h) : un appareil n'en demande qu'une par tranche de 3 h.
  - **Toute réponse est un 200** : un relais absent est un repli PRÉVU, pas une erreur. Un 502 (première version) était compté en erreur par la télémétrie à chaque entrée dans un live pendant une panne Cloudflare — indiscernable d'une panne des pushes. Le corps dit pourquoi : `configure: false` (secrets absents), `cle_invalide` (identifiant hors forme), `turn_indisponible` (Cloudflare en erreur, hors forme ou muet au-delà de 4 s).
  - **Secrets nettoyés** (`trim`) : un identifiant collé avec un retour à la ligne final coupait le relais EN SILENCE (le `$` d'une regex JS ne tolère pas le `\n`). Les pannes sont journalisées (`console.error` : statut Cloudflare, nom d'erreur, longueur d'une clé hors forme — jamais le jeton ni l'identifiant).
  - **`serveursIceDepuisCloudflare`** (`_shared/appels.js`) ne laisse passer qu'une liste sûre : 4 serveurs et 8 adresses au plus ; schéma `stun:` / `turn:` / `turns:`, hôte en caractères fermés ; **port 53 écarté** (Cloudflare prévient qu'il expire souvent dans un navigateur) ; identifiants exigés pour un relais, 512 caractères au plus. Le client revalide la même forme (`_iceServeursSurs`).
- **Client** (`assurerServeursIce`, app-05) : les relais s'**AJOUTENT** au tableau `CALL_ICE_SERVERS`, que lisent les cinq `new RTCPeerConnection` ; rien d'autre n'a changé.
  - **Renouvelés quand il leur reste moins de 3 h** : un live ou un appel part toujours avec au moins 3 h de validité — une connexion relayée ne survit pas à l'expiration de ses identifiants (le serveur TURN refuse le rafraîchissement de l'allocation). Un renouvellement REMPLACE les précédents (le tableau ne grossit pas) ; des identifiants expirés sont retirés même quand le renouvellement échoue.
  - **Relais coupé** (`configure: false`) : les identifiants déjà posés sont RETIRÉS du tableau (la première version les gardait jusqu'à 23 h), et la fonction n'est pas redemandée avant une heure.
  - **Panne** (refus, Cloudflare, réseau, attente dépassée) : pas de nouvelle demande avant 5 min — sinon chaque entrée dans un live attendait 2,5 s de plus pendant toute la panne. Une réponse tardive qui réussit pose quand même ses identifiants.
  - La promesse se règle en **2,5 s au plus** : jamais un live ou un appel retardé davantage. Un refus du serveur arrive dans `error` (le SDK ne lève pas) : il l'emporte sur le corps et laisse une trace `diagLog`.
  - **ATTENDU avant chaque connexion** : `new RTCPeerConnection` COPIE la liste des serveurs à sa création. La première version demandait le relais sans l'attendre dans `startCall` et `acceptIncomingCall` (le commentaire « la connexion ne se crée qu'à la réponse » était faux : `_callSetupPeerConnection` part dès que `getUserMedia` rend la main) — le premier appel d'une session partait sans relais. Désormais : appels → attente juste avant `_callSetupPeerConnection` (et la demande APRÈS l'exclusion des contacts de démo) ; spectateur → avant le canal `vlive:` (l'offre de l'hôte peut arriver tout de suite) ; hôte → en tête de `_vliveHostAddViewer`, puis le live est revérifié.
  - ⚠️ **Double entrée dans un live** : `_vliveView` n'est posé qu'après les attentes (état du live, relais — jusqu'à 2,5 s sans rien à l'écran). Un second toucher passait toutes les gardes ; le SDK rendant le MÊME canal pour le même topic, chaque gestionnaire était attaché deux fois — tout le chat et toutes les réactions en double, chaque offre traitée deux fois. Marqueur `_vliveEntree` posé avant les attentes ; un toucher sur un AUTRE live entre-temps gagne (le dernier).
- **Cible supprimée = tout ce qui la vise part avec** : la CSP (`netlify.toml` ET `_headers`, identiques) n'autorise plus Open Relay, elle nomme le relais Cloudflare. La politique de confidentialité (§6, version 2026-11-09) nomme « Cloudflare, États-Unis, quand ce relais est activé » à la place d'Open Relay.
- **Gestes humains, faits le 2026-11-09** : Cloudflare exige une **carte bancaire** pour activer Realtime, même dans la tranche gratuite ; Benjamin l'a posée. L'application TURN « passio » a été créée (Cloudflare › Realtime › TURN Server) et ses deux valeurs collées par lui dans Supabase › Edge Functions › Secrets — l'API Token ne se relit jamais, ni chez Cloudflare ni dans Supabase (seul un condensé s'affiche). ⚠️ **Au-delà de 1 000 Go par mois, Cloudflare facture (de l'ordre de 0,05 $ le Go), sans plafond dur** : l'usage se lit dans Cloudflare › Realtime › TURN Server › Analytics. Seules les connexions qui échouent en direct passent par le relais.
- ⚠️ **Couper le relais VITE se fait chez Cloudflare** (Realtime › TURN Server › supprimer l'application « passio ») : c'est la seule coupure immédiate. Supprimer un secret Supabase empêche seulement d'en fabriquer de nouveaux — ceux déjà émis restent valables jusqu'à 6 h chez Cloudflare, même si l'app les retire au renouvellement suivant. N'importe quel compte confirmé peut lire ses identifiants dans la console et s'en servir comme relais général pendant leur durée : c'est le prix de tout TURN servi au navigateur, borné par la durée de 6 h, le plafond des pushes et la coupure chez Cloudflare.
- **Verrous** : `tests/e2e/relais-turn.spec.js` (10), `tests/unit/appels.test.mjs` ⑪ ⑫, `tests/unit/notify-call-chemins.test.mjs` (le gestionnaire EXÉCUTÉ, ③ à ⑧ pour `ice`), `tests/e2e/politique-tiers-appeles.spec.js` ③ (configuration, politique, CSP).
- ⚠️ **Piège du banc** : `supa.functions` est un ACCESSEUR du client supabase-js, sans mutateur. `supa.functions = faux` est ignoré EN SILENCE et c'est le vrai `invoke` qui part — cinq cas sur huit rouges pour une raison sans rapport avec le code. Le banc pose une propriété propre (`Object.defineProperty`) et vérifie que le faux a pris.
- **Réinjection** (8 défauts, 8 tués, avec le lot KLIPY) : refus du serveur ignoré → ④ ; renouvellement sans retrait des anciens → ⑥ ; visiteur non filtré → ⑦ ; borne de 2,5 s portée à 60 s → ⑤ ; port 53 gardé côté serveur → `appels.test.mjs` ⑪. Côté serveur, après l'audit : session anonyme servie → `notify-call-chemins` ⑦ ; secrets non nettoyés → ④ ; panne en 502 → ⑤ ; panne non journalisée → ⑤ (et `appels.test.mjs` ⑫ pour les quatre). Côté client, après l'audit : relais coupé sans retrait → ③ ; panne redemandée à chaque entrée → ⑤ ; expirés gardés → ⑨ ; appel qui n'attend pas le relais → ⑧ ; garde d'entrée retirée → ⑩ ; dernier toucher ignoré → ⑩ bis.
- ⚠️ **Deux gardes qui se couvrent l'une l'autre** : retirer la garde d'entrée de `joinVideoLive` a d'abord SURVÉCU — la garde d'après l'attente rattrapait aussi le double toucher. Chacune a pourtant son rôle propre (l'une évite une seconde lecture de l'état du live, l'autre fait gagner le dernier live touché) : le banc mesure désormais l'un (lectures de CE live, une seule) et l'autre (⑩ bis, deux lives). Et ne compter que la lecture visée : la liste des lives se rafraîchit en arrière-plan, et un compteur sur tout `supa.from` lisait 2 ou 4 selon le moment.
- **Audit indépendant du 2026-11-09** (`audit-passio`, lecture seule) : 1 P0 hors du lot (fiche suivante), 1 P1, 3 P2, 6 P3. Tous traités ici, sauf le §6 qui ne disait pas que les mots cherchés partent chez le fournisseur de GIF — traité dans la fiche KLIPY.
- **Seconde relecture, sur les corrections elles-mêmes** — elle a trouvé une RÉGRESSION de la première correction :
  - ⚠️ **`_vliveHostAddViewer` doit rester SYNCHRONE jusqu'à `H.pcs[vid]`** : `_vliveHostAssign` décide doublon et capacité sur cette table. L'`await` ajouté en tête (même un relais en cache coûte une microtâche) faisait répondre « complet » à des spectateurs arrivés dans le même message de présence alors que des relais étaient libres, et laissait une place perdue pour un spectateur parti pendant l'attente. Remède : l'hôte attend le relais UNE fois, après la caméra et avant d'ouvrir le live (`startVideoLive`) ; chaque connexion relance ensuite `assurerServeursIce()` SANS attente — les expirés tombent tout de suite, ceux qui restent ont au moins 3 h. Même relance devant les connexions côté spectateur (offre de l'hôte, offre d'un relais, relais vers un enfant).
  - **Appels (inactifs pendant le pilote, à tenir avant de les rallumer)** : l'attente du relais élargissait de 0,2 à 2,5 s une fenêtre déjà là. « Répondre » puis « Refuser » pendant ce temps : `declineIncomingCall` trouvait `_callIncoming` vide et fermait l'écran… puis l'appel se CONNECTAIT, caméra et micro ouverts, après un refus. Jeton `_callAcceptation`, que le refus fait tomber ; `_callDepart` contre le double départ ; dans les deux cas, un départ ou une acceptation devenus sans objet coupent les pistes obtenues.
  - **GIF** : la pause passe APRÈS le cache (des résultats déjà reçus restent servis) ; une panne réseau arme aussi la pause — un 429 sans en-tête CORS se lit comme une panne, et le vrai 429 de KLIPY n'a pas pu être observé sans consommer le quota partagé.
  - **Banc `notify-call-chemins`** : la relecture a prouvé un faux vert — une variable non déclarée dans `lienAppel(…)` restait 8/8, le chemin d'appel APRÈS l'interrupteur ne s'exécutant jamais. Le gestionnaire est désormais chargé deux fois (appels coupés ET allumés) et 17 chemins tournent : notification, appel, `ice`, et chaque refus (session, plafond, destinataire, blocage et panne de sa lecture, lien, réservation, abonnés, VAPID, abonnements morts).
  - **Réinjection de la seconde relecture** : 5 défauts client, 5 tués — acceptation qui ignore le refus → `relais-turn` ⑪ ; refus qui ne voit pas l'acceptation en cours → ⑪ ; hôte qui attend le relais par spectateur → ⑧ ; pause GIF avant le cache → `gif-klipy` ④ bis ; panne réseau sans pause → ④. Côté serveur, 8 défauts, 8 tués, dont la variable non déclarée dans `lienAppel(…)` qui survivait au premier banc (→ ⑨ ⑩). 133/133 sur les suites des appels, lives, GIF et politique.
  - ~~**Reste à faire** (gouvernance, pas ce lot) : `edge-functions.yml` déploie à chaque push sur `main` sans attendre la CI, et ne lance pas ce banc — un push direct qui réintroduirait un `uid` partirait en production. Le lister exige d'étendre `edge-functions-verrous` (qui refuse une suite listée n'important aucun module emporté : ce banc LIT la source, exprès) et de toucher `.github/`.~~ **Fait le jour même** : la gate voit les lectures de code, le banc tourne avant « Déployer », et ⑨ exige qu'un banc listé EXÉCUTE chaque fonction (fiche « 🏃 LES FONCTIONS S'EXÉCUTENT AVANT D'ÊTRE DÉPLOYÉES » de `telemetrie-pilotage-sentinelle.md`).

---

## 📵 LES PUSH SOCIALES PLANTAIENT DEPUIS LE 07/11 — `uid` jamais déclaré dans `notify-call` (2026-11-09)

- **Le défaut** : #753 (2da69bf7, 07/11, corrections de l'audit du 06/11) a ajouté le budget par émetteur de `reserverPush` et passé `uid` comme sixième argument — une variable déclarée NULLE PART dans `notify-call/index.ts`. Dans un module ES (strict), sa lecture lève une `ReferenceError` : toute push sociale (`type: "notif"`) rendait 500, pour tout le monde. Les appels n'étaient pas touchés (coupés pendant le pilote), ni les rappels (autre fonction).
- **Mesuré en production avant de conclure** : aucune ligne `notifications` créée depuis le 07/11 15:40, aucune `push_le` jamais posée, aucun journal d'erreur de la fonction sur 24 h (uniquement des 401) — le défaut était **déployé mais pas encore déclenché**, faute d'interaction sociale. Rien n'a été perdu.
- **Trouvé par** l'audit indépendant du lot relais/KLIPY, qui relisait la même fonction — pas par un banc.
- **Pourquoi aucun banc ne l'a vu** : la CI ne fait pas de `deno check` (les fonctions sont du TypeScript Deno ; le dépôt n'a ni TypeScript ni Deno) ; `lien-metier.test.mjs` teste `reserverPush` seule, jamais son site d'appel ; `appels.test.mjs` ⑦ ⑫ LISENT la source (un ordre, des motifs) — ils ne l'exécutent pas.
- **Correctif** : `fromUid`, l'appelant AUTHENTIFIÉ (la ligne relue par `autoriserPushNotif` est filtrée sur `from_id = fromUid`).
- **Le verrou qui manquait** : `tests/unit/notify-call-chemins.test.mjs` EXÉCUTE le vrai `index.ts` — types retirés par Node 24 (`stripTypeScriptTypes`), imports remplacés par des doublures (un import sans doublure rougit), `Deno.serve` capturé, code lancé en mode strict par `new Function` (pas d'`import()` calculé : la gate `edge-functions-verrous` refuse une suite qui charge un module par un chemin calculé tout en nommant `_shared`). Huit chemins : notification sociale jusqu'à l'envoi, appel coupé, et six cas du geste `ice`. Réinjecté : le `uid` rougit ①.
- **Pour une autre fonction** : le même gabarit s'applique tant qu'elle n'exporte rien ; il éprouve le CÂBLAGE (variables, arguments, branches), pas les modules partagés, qui ont leurs suites.

---

## 🎞️ LES GIF PASSENT PAR KLIPY — Tenor fermé, Giphy plafonné à 100 recherches par heure pour toute l'app (2026-11-09)

- **Constat** : Tenor a fermé son API le 2026-06-30. La clé Giphy de l'app était une clé « beta » : **100 appels par heure pour TOUTE l'application**, au-delà de quoi chaque recherche retombait sur la liste locale de 26 GIF. La clé de production de Giphy est devenue payante.
- **KLIPY** reprend l'API de Tenor à l'identique (`/v2/search`, `/v2/featured`, `results[].media_formats.{tinygif,gif}.url`) sur `api.klipy.com`, médias sur `static.klipy.com` (et `static1`/`static2`). Mesuré le 2026-11-09 : 200 en 0,6 s, forme conforme. Sa clé de **test** plafonne elle aussi à 100 appels par heure ; sa clé de **production** est gratuite, illimitée, **sur demande** dans partner.klipy.com.
- **Compte et clé** : plateforme « PASSIO », clé Web « PASSIO-WEB », **publicité KLIPY désactivée**. Benjamin a accepté lui-même les conditions de l'API (geste refusé à l'agent) et transmis la clé : elle est PUBLIQUE, comme la clé anon Supabase — KLIPY exige d'ailleurs que l'appel parte du navigateur.
- **Exigences de KLIPY** (docs.klipy.com/integration-requirements), et où elles vivent :
  - « Search KLIPY » comme texte d'appel du champ de recherche — **obligatoire** : `passioGifPlaceholder()` (emoji-misc), lu par les cinq champs (panneau générique, messagerie, deux panneaux de commentaires, réaction GIF d'une bobine) ; sans clé, le texte redevient « Rechercher un GIF… » ;
  - les URL des médias telles que l'API les rend, chargées en direct du navigateur — jamais copiées ni relayées ;
  - les résultats dans l'ordre rendu, jamais mêlés à un autre fournisseur dans une même grille : la liste locale (Giphy) ne sert que quand l'API ne rend RIEN.
- **Giphy reste** : 15 GIF Giphy existent en base (2 commentaires, 10 messages, 3 réactions, mesuré le 2026-11-09), la liste de secours est sur `media.giphy.com`, et le fournisseur de réserve se rebranche d'un mot (`PASSIO_GIF_CLE_GIPHY`). Tenor : 0 GIF en base, il part de la CSP, du code et de la politique (§6 : « GIF (KLIPY, Giphy) »).
- **`_looksLikeMediaUrl`** (app-04) reconnaît l'hôte des médias (`static\d*.klipy.com`), pas le site `klipy.com` : une page n'est pas une image.
- ⚠️ **Le panneau GIF débordait de l'écran sur téléphone** — vu sur la vidéo de démonstration filmée pour la demande de clé de production, pas par un test. Défaut antérieur au lot : quatre colonnes de 90 px font 406 px avec les marges, pour un écran de 390 px ; la première colonne et le début de « Rechercher sur KLIPY » sortaient par la gauche. Le panneau des commentaires calculait sa gauche avec `innerWidth - 420`, négative sur tout téléphone. Remède dans `passioGifPanel` : moins de colonnes quand l'écran est étroit (trois à 390 px), puis `_ramenerDansLEcran` garde le panneau à 8 px des bords, quelle que soit la position demandée. Verrou `gif-klipy` ⑧ (quatre positions, dont l'ancien calcul négatif) ; chacun des deux remèdes retiré le rougit.
- **Clé de production demandée le 2026-11-09** (partner.klipy.com, ligne PASSIO-WEB › « Demande de production ») : catégories messagerie et réseaux sociaux, 2 utilisateurs actifs par mois (le chiffre réel, `activite_jour`), et la vidéo exigée — filmée par Playwright sur le code du lot, une conversation de démonstration, recherche « bonjour », envoi d'un GIF. Réponse de KLIPY : « Demande reçue, nous vous contacterons bientôt ». Tant qu'elle n'est pas accordée, le plafond de 100 recherches par heure reste celui d'avant — avec Giphy, il l'était aussi.
- **Quota épuisé (429)** : plus d'appel pendant une minute (`_gifPauseJusqua`), la liste locale à la place. Sans cette pause, chaque frappe dans le champ de recherche rappelait l'API pour un refus de plus. Un échec laisse une trace `diagLog`.
- **§6 de la politique** : « GIF (KLIPY, Giphy — qui reçoivent aussi les mots que tu tapes dans la recherche de GIF) ». C'était déjà vrai avec Giphy, sans être dit (relevé par l'audit indépendant).
- **Verrou** : `tests/e2e/gif-klipy.spec.js` (9, dont ④ bis pour le quota) — le vrai `passioFetchGifs`, réseau tenu par `page.route`, aucun appel ne part vers KLIPY ; `politique-tiers-appeles` ①, ③ bis. Réinjection : paramètre `country` retiré → ① ; texte d'appel figé → ⑤ ; hôte des médias KLIPY oublié → ⑥.
- **Non-régression** (2026-11-09) : `npm run verif` vert (lancé depuis Git Bash — sous PowerShell, `bash` est introuvable et `edge-functions-verrous` ⑥ rougit sans rapport avec le code) ; 72/72 sur `gif-klipy`, `politique-tiers-appeles`, `relais-turn`, `echappement`, `reactions-commentaire-bloque`, `retrait-interactions-direct`, `audit-2026-11-xss`, `capacite-fil-compteurs` ; 147 cas sur les suites des appels, des lives, du consentement et de l'ouverture publique (huit rouges du premier passage : le faux `invoke` ci-dessus, et trois tests qui figeaient l'ancienne version de la politique ou l'ancienne ligne d'import — mis à jour).

---

## 🔔 DES NOTIFICATIONS D'EXEMPLE PRÉSENTÉES COMME RÉELLES — résumé IRL, copies de la graine, tendances (2026-11-09)

Mesuré en production (canal ①, 09/11) : **12 comptes réels sur 13 portaient 44 résumés « N événements cette
semaine »** — les comptes d'octobre en avaient tous reçu « 11 événements » — alors que la base n'avait
**aucune** activité réelle à venir : `_irlWeeklyDigest` (app-07) comptait `allEvents()`, qui inclut les
activités d'EXEMPLE, et pouvait le pousser en notification système. Un compte neuf recevait en plus trois
notifications sociales **fabriquées et non lues** (`loadState` recopiait `seed.notifications` dans toute
liste vide : « Clara Jensen suit maintenant tes publications » sur un profil à 0 abonné), comptées par la
cloche, le titre « (3) PASSIO » et `setAppBadge`. Explorer annonçait « Musique 41 posts » pour 2 réelles.
- **Résumé IRL** : `PassioFirstRun.evenementDemo` (exporté pour l'occasion — identifiant `^e\d+$`, le
  discriminant déjà utilisé par l'étiquette et `participationPossible`) écarte les exemples ; s'il ne reste
  rien, ni notification ni push, et la clé de semaine n'est PAS consommée (une vraie activité publiée plus
  tard dans la semaine sera annoncée). Fonction absente → muet : on ne compte jamais la démo par défaut.
  Le résumé corrigé porte l'id déterministe `irl_digest_<semaine>` (`NOTIF_DIGEST_IRL_PREFIXE`).
- **Copies et anciens résumés RETIRÉS, pas marqués lus** : `_estNotifFabriqueeDepuisDemo` (app-02) entre
  dans le filtre de `stripLegacyEconomy`, donc aux TROIS frontières (`loadState`, `_applyUserState`,
  `_syncableState`) — précédent : les notifications d'économie d'ADR-009. Copie de graine = id `n<chiffres>`
  + émetteur `u_…` + kind ≠ `system` (aucune notification serveur n'a cette forme : uuid, `n_…`, `x…`).
  Ancien résumé = écrit par l'app, id hors `irl_digest_`, texte `^(?:📍\s*)?<b>N événement(s)</b> cette
  semaine`. ⚠️ **Le préfixe « 📍 » DANS le texte** est celui des versions plus anciennes : 18 des 44 résumés
  de production le portent — la première version du filtre les laissait passer (relecture adverse du 09/11,
  inventaire complet de `user_state` : 234 notifications, les 44 retirées sont toutes fausses, aucune vraie
  n'est touchée). Marquer lu laissait le mensonge dans la liste : le NOMBRE d'un ancien résumé est faux par
  construction. Bienvenue (`n6`) et messages système gardés.
- **Tendances** (`peindreTendances`, app-06) : `userPosts` + `supabasePosts`, une fois par id, jamais
  `state.seed.posts` ; une tuile sans publication réelle n'affiche pas « 0 post ».
Verrou : `tests/e2e/notifications-exemples.spec.js` (5), **éprouvé par RÉINJECTION** (recopie de la graine
sans filtre, prédicat retiré de chaque frontière séparément, résumé sans filtre ni marque, tendances qui
recomptent la démo, « 0 post », dédoublonnage retiré, préfixe 📍 ignoré : chacun rouge).


---

## 🪆 LE DÉCOR DES EXEMPLES : UNE DISCUSSION QUI SE VIDAIT, DES MESSAGES QUI SE DÉDOUBLAIENT (2026-11-10)

Trouvés au contrôle général du 10/11 (fiche d'écran : `docs/lots-ui/28-CONTROLE-GENERAL-2026-11-10.md`), en
parcourant l'app comme quelqu'un qui arrive : le fil d'un nouveau compte est fait d'exemples, ce sont donc
ses PREMIERS gestes qui tombaient dessus. Deux défauts de la même famille — une règle écrite pour du
contenu réel, appliquée au décor.

**⑤ La discussion d'un exemple se vidait à l'ouverture.** La carte annonce « 💬 1 » avec l'aperçu du
commentaire ; on touche la bulle ; le commentaire paraît une demi-seconde, puis « Discussion (0) · Sois le
premier à réagir ». `_fusionnerPageCommentaires` (app-04, lot du 21/09) ne garde, hors page serveur, que
MES commentaires en attente : « une ligne sans drapeau ni `fromSupabase` est périmée » — vrai pour la
liste persistée de mes publications, faux pour les commentaires d'un exemple (`buildSeed`), qui n'ont ni
l'un ni l'autre. La page serveur d'un exemple étant presque toujours vide, la fusion les effaçait — de la
feuille « Discussion » ET du panneau de commentaires des Bobines (même fonction).
⚠️ **La lecture serveur d'un exemple n'est PAS à retirer** : le serveur accepte les commentaires et les
interactions sous un identifiant d'exemple (`est_identifiant_exemple`, R31) — mesuré ce jour, le
commentaire d'exemple `cp401_0` porte 3 « j'aime » et 1 réponse de vrais comptes en base. Le correctif
garde le décor ET la page : sur une publication d'exemple (`_ciEstExemple`, jamais `fromSupabase`), une
ligne sans drapeau EST le décor — `state.seed` n'est jamais persisté (`_leanState`), il ne peut pas
porter un reste d'ancien client. La règle d'origine tient partout ailleurs (verrou ⑤, troisième volet).

**⑥ Chaque message d'exemple apparaissait deux fois à la deuxième visite.** Les messages de
`SEED_CONVERSATIONS` n'ont pas d'identifiant et leur horodatage est relatif au démarrage
(`Date.now() - 90 min`). `_unionConvsById` les reconnaît par « émetteur | horodatage | texte » : une
graine semée à un autre démarrage est, pour elle, une autre série de messages. **Le chemin est celui de
tout appareil neuf, sans rien faire de spécial** : 1ʳᵉ visite — `hydrateConvsFromIDB` pousse la graine
dans IndexedDB (« migration initiale »), rien n'écrit `localStorage` tant qu'aucune conversation n'est
touchée ; 2ᵉ visite — `getConversations()` sème une graine fraîche, la fusion l'unit à celle d'IndexedDB :
8 messages au lieu de 4 dans « Léa Moreau », 6 au lieu de 3 ailleurs, puis l'état doublé est sauvegardé
dans les deux stores. Mesuré sur le navigateur de contrôle (deux graines à 312 s d'écart, l'intervalle
entre les deux démarrages). Le même chemin se rouvre dès qu'un des deux stores manque (purge ITP de
`localStorage`, quota).
Correctif : `_dedoublonnerDecorConversation` (app-04), appelée par `deduplicateConversations` — donc à la
lecture, à la fusion ET à la sauvegarde : **un appareil déjà doublé se répare au démarrage suivant**. Elle
ne touche qu'un fil dont l'identifiant est dans `SEED_CONVERSATIONS` (lecture seule : `_estConvDemo` y
refuse l'envoi), et que des messages SANS identifiant ; une vraie conversation où quelqu'un a écrit deux
fois « ok » est intouchable (verrou ⑥). La copie la plus ancienne est gardée, la date du fil suit son
dernier message.
⚠️ Ne pas « corriger » en donnant un identifiant aux messages de la graine : les copies déjà persistées
n'en ont pas, la fusion (clé `id:` contre clé `sig:`) les doublerait une fois de plus, pour toujours.

Verrou : `tests/e2e/controle-general-2026-11-10.spec.js` ⑤ ⑥, contre-éprouvé sur 6dafc0f1 (décor vidé :
1 ligne attendue, 0 reçue ; `conv_lea` : 4 attendus, 8 reçus).

## ✅ CE QUI EST ANNONCÉ EST CE QUI EST GARDÉ : PROFIL, BULLES EN ATTENTE, COMMENTAIRE MODIFIÉ (2026-11-10)

Trois défauts trouvés par l'audit de stabilisation du 10/11 (ETAT-03, ETAT-07, SRV-03), revérifiés dans le code avant
correction. Verrous : `tests/e2e/profil-confidentialite-interface.spec.js` (ETAT-03 ① ②) et
`tests/e2e/verdicts-conversation-commentaire.spec.js` (① à ⑤) — chacun rouge sur le code d'avant, par mutation.

**ETAT-03 — « Profil mis à jour » sans écriture.** `saveMainProfile` (app-06) avalait le verdict de
`supaSavePublicProfile` dans un `catch` vide. Hors ligne ou sur un refus, la personne voyait le succès — dont le
passage en compte privé — et sa ligne restait publique. Désormais : instantané de `general` avant l'écriture, verdict
lu, état rendu et écran laissé ouvert sur un échec (pour un COMPTE ; un visiteur n'a pas de ligne).
⚠️ **Le marqueur `privacyChoisi` ne prouve plus rien à lui seul.** Posé une fois, jamais retiré, il voyage par
`user_state` : `is_private` repartait avec la valeur AFFICHÉE par la case — celle de l'état local, périmé, quand la
relecture serveur était lente ou en panne. Un compte rendu privé ailleurs redevenait public en enregistrant une bio.
`is_private` ne part plus que sur le geste de CETTE ouverture (`_privacyTouched`). La garde serveur de
`supaSavePublicProfile` (`_choixConfidentialiteProuve`) reste en place, en seconde couche.

**ETAT-07 — Les bulles TEXTE en attente et le brouillon disparaissaient au démarrage.** `_rafraichirConversationsServeur`
(app-08), sans `fusion`, remplace la conversation par celle du serveur, qui ne porte que son dernier message. Le
report du 07/11 ne gardait que les bulles à pièce jointe (`m.pj`). Il garde désormais toutes MES bulles `sending` /
`failed`, et le brouillon.

**SRV-03 — « Modifier » sur un commentaire d'ACTIVITÉ.** Mesuré au canal ① le 10/11 : `event_comments` n'a ni colonne
`content` ni policy UPDATE. Le menu le proposait, l'écran disait « Commentaire modifié », et le texte ne quittait pas
l'appareil. `_commentaireModifiable` (app-04) est la seule autorité du menu et de l'édition : jamais sur `ec_` / `lc_`.
Sur une publication, `_enregistrerModificationCommentaire` lit le verdict (`.select("id")` + `_writeVerdict`,
`expectRows`) : refus ou 0 ligne → l'ancien texte revient, et c'est dit. Rendre un commentaire d'activité modifiable
demanderait une policy UPDATE (migration, critique) : non fait, délibérément.

---

## 🧾 GROUPE : DESCRIPTION ET SORTIE SOUS VERDICT (2026-11-12, SRV-04 et ETAT-04)

Deux écritures de groupe partaient sans qu'on lise leur résultat (`.then(function(){}, function(){})`). L'écran annonçait
pourtant le résultat :
- « Description mise à jour » apparaissait même quand la policy refusait la modification, et la description d'origine
  revenait au rechargement.
- « Tu as quitté le groupe » apparaissait même quand le retrait de `conv_members` échouait. La pierre tombale cachait
  alors la conversation, mais le compte restait membre et continuait d'en recevoir les messages.

Pour un compte réel, `editGroupDescription` et `leaveGroup` (app-05) lisent désormais le verdict
(`.select(…)` + `_writeVerdict`, `expectRows`). Sur un refus, l'ancienne description revient. Une sortie refusée
garde la conversation et affiche « Impossible de quitter le groupe pour l'instant — réessaie ».

Verrou : `tests/e2e/groupe-verdicts.spec.js` (4). Mutation : rougit ① et ③.

« Supprimer pour tous » et la suppression d'un commentaire (reste d'ETAT-04) ne sont pas dans ce lot : ils passent par
des files de rejeu qui ont leurs propres preuves.

---

## ↩️ LES RETRAITS DISENT LEUR VERDICT ET CONVERGENT : SUPPRIMER POUR TOUS, FILE DES SUPPRESSIONS, SUIVIS, BLOCAGES, INSCRIPTIONS (2026-11-12, ETAT-04, ETAT-05, ETAT-08)

**ETAT-04 — « Supprimer pour tous ».** Le DELETE de `conv_messages` partait sans que son résultat soit lu. La bulle
disparaissait, et une pierre tombale empêchait même de s'apercevoir de l'échec. Sur un refus, le message restait
donc lisible chez le destinataire. Pour un compte, la base tranche désormais d'abord
(`.select("id")` + `_writeVerdict`, `expectRows`). Un refus laisse la bulle à l'écran : pas de pierre tombale, pas
de contrôle `del`, et un message le dit. Un message « en cours d'envoi » ne se supprime pas pour tous. Un message en
échec, qui n'a jamais atteint la base, se retire de sa file.
- Les deux autres gestes cités par l'audit étaient déjà corrigés : supprimer un commentaire (FIL-C06, 10/11) et
  quitter un groupe (#836).
- Verrou : `audit-2026-11-controle-auteur-messages.spec.js` ② bis, rougi par mutation. Les faux serveurs de trois
  suites rendent désormais la ligne supprimée, comme PostgREST.

**ETAT-05 — la file des suppressions.** « 0 ligne + relecture vide » valait preuve de suppression, même sous une
session morte. Or la relecture anonyme ne voit pas la publication d'un compte PRIVÉ. La file l'abandonnait, et la
pierre tombale la cachait à son auteur pendant que ses abonnés la lisaient encore. `_delObRun` exige désormais une
session dont l'utilisateur est `MY_UID`. Sans elle, il rend `"sans_session"` : il attend, sans consommer d'essai.
- AUTH-06 : l'entrée porte `_fileProprietaire()`. Un visiteur n'y met rien, et une entrée sans propriétaire n'est
  plus rejouée sous n'importe quel compte.
- « Ne plus suivre » applique la même règle : 0 ligne n'est un succès que sous la session de ce compte.
- Verrou : `suppression-durable.spec.js`, ETAT-05, rougi par mutation.

**ETAT-08 — les retraits convergent.** Les trois lecteurs (`supaLoadFollowing`, `supaLoadBlocks`, `supaLoadMyRsvps`)
rendent `null` sur un échec. Après une lecture réussie, la liste du serveur REMPLACE la liste locale
(`_fusionnerSuivisServeur`, `_fusionnerBlocagesServeur`, `_fusionnerRsvpServeur`), avec deux exceptions :
- un identifiant dont l'écriture est EN VOL : l'état local décide, dans les deux sens ;
- un profil ou une activité d'EXEMPLE : il n'existe pas en base, il reste local.

« Ne plus suivre » lit enfin son verdict : un refus rend le suivi et le dit.
Verrou : `retraits-convergent.spec.js` (5). Mutations : rougissent ①, ③ et ⑤.

⚠️ Le bloc qui fusionnait `supaFollowing` dans `supaInit`, après un `return`, est du code mort. Il n'a pas été
touché.

**Corrigé avant fusion, après relecture par l'agent `audit-passio` (12/11).** La première version avait deux défauts P1 :
- sous une session morte, une lecture passe en rôle anonyme et rend 0 ligne sans erreur. Le remplacement aurait
  donc EFFACÉ tous les blocages et une partie des suivis. Le remplacement n'a désormais lieu que si
  `_sessionEstMoi()` confirme une session de ce compte ; sinon, la fusion retombe sur l'union d'avant.
- un refus de lecture déjà mémorisé faisait rendre `{}` à `supaLoadMyRsvps`, ce qui effaçait les inscriptions.
  Il rend maintenant `null` pour un compte, et `{}` reste réservé au visiteur.

Trois P2 corrigés dans le même temps :
- « Supprimer pour tous » : une ligne déjà partie (0 ligne sous MA session) est un succès ;
- un message « en échec » tente quand même le DELETE ;
- un message en file hors ligne se retire de sa file.

Enfin, `supaUnfollowUser` rend un succès local pour un visiteur (`parcours-suivre` l'a rattrapé : le suivi
revenait).

## 🔔 PAS DE NOTIFICATION SANS ÉVÉNEMENT MÉTIER — elle part au verdict de son écriture (2026-11-13)

SRV-02, reste (PR #883). Pour `like`, `comment`, `event_join`, `event_comment`, `event_feedback`, `event_invite`,
`live_video` et `event_cancelled`, la base exige le FAIT qui lie l'émetteur au destinataire à propos de `ref_id`
(`trg_notifications_preuve`, entre `trg_notifications_origine` et `trg_notifications_texte`). Un fait ne vaut qu'une
notification sur 24 h.

**Règle pour tout nouveau site** : une notification soumise à la preuve ne part JAMAIS en parallèle de son écriture.
Passer par `notifierApresEcriture(promesseDeLEcriture, …)` (app-08) ; dans la file des commentaires, poser
`op.notif = { to, kind, text }` et laisser `_cmtObNotifier` notifier à la confirmation. `tests/unit/notifications-apres-ecriture.test.mjs`
recense chaque appel direct à `supaInsertNotif` pour ces genres et refuse un site inconnu.

**Pièges** :
- `follows_notifier` pose `passio.notification_serveur` et ne le remet pas : dans une même transaction, tout ce qui
  suit passe pour « serveur ». Une épreuve qui crée un abonnement doit remettre le réglage à zéro avant d'éprouver.
- `co_organizers` est rempli par l'auteur seul, sans accord : il désigne qui PARLE pour l'activité, jamais qui
  REÇOIT ses interactions.
- Une réponse lue du serveur a l'identifiant `srep_<date>`, qu'aucune table ne porte : un j'aime de réponse vise
  cet identifiant, sa cible se résout dans le fil.
- Une suite à comptes réels qui écrit une notification doit poser son fait d'abord (`authz-critical`,
  `realtime-poussee-reelle`).

## 🧹 PLUS DE PASSIONS SOUS LES PSEUDOS — messagerie et commentaires (2026-11-13)

Demande de Benjamin, capture à l'appui : « supprime les noms des passions dessous les pseudos, ce n'est pas joli et trop chargé ».

- **Messagerie** : la liste des conversations ne préfixe plus l'aperçu par « Moto · Podcast · » (`decorerCartes`, `passionDe`, `convIdDe`, la signature `data-v6a-psn` et la règle `.v6a-psn` sont parties ensemble de `js/ui-v6a-messages.js` et `styles.css`). Le module UI-6A ne pose plus que la tête (« Messages », « + », recherche).
- **Commentaires** : plus de ligne `.ident-passions` sous le pseudo — commentaire et réponse dans la feuille (`_renderCommentsList`, app-04), aperçu des deux commentaires sur la carte du fil (`renderPostHTML`, app-02).
- **« Nouveau message »** (même jour, « supprime dans la messagerie aussi ») : les résultats de recherche (`searchUsers`, app-04) ne portent plus que le pseudo.
- **Ce qui reste, délibérément** : `identitePassionsHTML` sert encore hors messagerie — listes d'abonnés, suggestions, notifications. Ne pas la retirer d'app-02. Les passions d'un GROUPE (fiche du groupe) sont son sujet, pas une ligne sous un pseudo : intactes.
- Verrous : `ui-v6a-messages.spec.js` (« aucune passion sur une carte », « elle ne revient pas au rendu suivant »), `ui-v6a-boucle.spec.js`, `profil-entete-passions.spec.js` (« un commentaire ne porte AUCUNE passion sous le pseudo »). Chacun pose sa prémisse : l'auteur A une passion à afficher.
