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
- 🗓️ RÉCAP DE LA SEMAINE — une carte en tête du fil, dans l'app seulement (2026-10-06)

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
