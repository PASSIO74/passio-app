# Journal — Partage, liens courts et aperçus, invitation, entonnoir des liens

> **Fiches déplacées TELLES QUELLES de `CLAUDE.md` le 2026-10-05.** `CLAUDE.md` est rechargé à
> chaque session et avait atteint 410 000 caractères (Claude Code alerte dès 40 000) : il ne garde
> plus que les règles qui valent partout. Ici vivent le récit, les mesures et les pièges de chaque
> lot — **à lire AVANT de toucher au domaine.** Un commentaire du code qui cite « CLAUDE.md § … »
> désigne une fiche de ce dossier : `grep -rn "<début du titre>" docs/journal/`.
> **Nouvelle fiche** : à la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`.
> Si elle porte une règle qui vaut pour TOUTE modification, une seule ligne de plus dans la section
> « Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.

## Sommaire

- 🔗 DEUX BOUCLES DE PARTAGE SUR QUATRE ÉTAIENT ROMPUES — publication et profil (2026-10-03)
- 🖼️ LIENS COURTS ET APERÇUS — un partage montre enfin CE contenu (2026-10-04)
- 📣 INVITER JUSTE APRÈS AVOIR ORGANISÉ — le partage existait, personne ne s'en servait (2026-10-04)
- 👋 L'INVITATION — « Léa t'invite », et Léa suivie à la création du compte (2026-10-04)
- 📈 ENTONNOIR DES LIENS — LA MARCHE « COMPTE CRÉÉ » (2026-10-04)

---

## 🔗 DEUX BOUCLES DE PARTAGE SUR QUATRE ÉTAIENT ROMPUES — publication et profil (2026-10-03)

Question de Benjamin : « comment avoir des millions d'utilisateurs ? ». Mesuré d'abord (canal ①) : **10 comptes, 0 créé
en 7 jours, 1 connecté en 7 jours, 8 appareils, 42 sessions de production en une semaine**. Le mur n'est pas la
capacité (500 comptes simultanés, visiteurs illimités) : c'est la **diffusion**. Or un lien partagé est le SEUL chemin
d'entrée de quelqu'un qui ne connaît pas PASSIO — et sur les quatre types de partage, deux menaient nulle part :
« Partager en dehors » une **publication** envoyait l'URL de l'accueil **en dur** (depuis le retrait de `#carnet-<id>`,
rien ne l'avait remplacé) ; « Partager le profil » fabriquait **`#user-<id>`, que personne ne lisait**. Bobines
(`#reel=`), rencontres (`#irl-event-`) et lives (`?live=`) étaient routés. Même famille que `#irl-event-` (2026-07-21)
et `#reel=` : **un lien fabriqué, envoyé, et lu par personne — sans une erreur nulle part.**
⚠️ **`_ouvrirLienPartage` (app-06) est le routeur des deux**, avec les règles des deux routeurs voisins (attendre l'app
sans consommer d'essai, cible mémorisée, corps sous `try`, hash nettoyé AVANT l'ouverture et seulement sur succès, rien
par-dessus landing/onboarding) plus deux propres : ⑥ une publication absente de la page chargée est cherchée **UNE
fois, de façon CIBLÉE** (`posts.author_id` puis `supaLoadPosts(0, auteur)`, fusion dans `supabasePosts`, jamais
`seed.posts` — la RLS tranche pour un compte privé, et le lien le DIT) ; ⑦ un compte **bloqué** n'est jamais ouvert.
⚠️ **`#post-<id>` est un préfixe RÉSERVÉ AU PARTAGE** : `openPost` pose `#post` SANS identifiant, donc le routeur ne
réagit jamais à sa propre navigation. Ne pas faire poser `#post-<id>` par `openPost`. `lienPartagePublication(id)` est
la seule source de cette URL. `first-run.js` reconnaît `user-` comme lien profond, et `ecranOccupe()` regarde
`#postDetailPage` (le hash est nettoyé avant l'ouverture : seul l'affichage dit qu'elle est à l'écran).
⚠️ **`openUserProfile` relit TOUJOURS le profil en base avant d'ouvrir** : au démarrage, cette lecture attend
l'initialisation du SDK — 15,7 s mesurées hors réseau (bac local), quelques ms en CI. D'où le délai large du cas ②.
⚠️ **LA GARDE DE BLOCAGE REGARDAIT LA VALEUR REÇUE, PAS LE COMPTE OUVERT — trouvé par la revue de sécurité
automatique APRÈS la fusion de #567, refermé en suite.** `openUserProfile` sait aussi retrouver un compte par son
**PSEUDO** (local, puis `ilike` en base, où `%` et `_` sont des jokers) : un lien `#user-<pseudo>` ouvrait donc un
compte BLOQUÉ, la garde ayant examiné une chaîne qui n'était pas son identifiant. Deux couches, chacune mesurée seule :
① le routeur n'accepte qu'un **identifiant de compte** (`LIEN_PARTAGE_COMPTE_RE` : uuid d'auth, ou `u_…` de
démonstration — pour qui `openUserProfile` ne tente jamais le pseudo), sinon « Profil introuvable » ; ② `openUserProfile`
re-juge le blocage sur le compte **RÉSOLU** quand la source est `"lien"`, et seulement elle — les autres appelants
gardent leur comportement. **Une garde posée sur l'entrée d'une fonction qui résout l'entrée autrement ne garde rien.**
⚠️ **« CE QUI RESTE » DE CE LOT EST FAIT LE LENDEMAIN** : les liens courts et leurs aperçus (section suivante).
Verrou : `tests/e2e/liens-partage-post-profil.spec.js` (9), **éprouvé par RÉINJECTION de six mutations** — routeur
rendu muet (3 rouges), recherche ciblée retirée (1), garde de blocage retirée (1), partage rendu à l'accueil (1), garde
de forme retirée (1 : ⑧), re-jugement sur le compte résolu retiré (1 : ⑧ bis).

## 🖼️ LIENS COURTS ET APERÇUS — un partage montre enfin CE contenu (2026-10-04)

Suite directe de la section précédente. Tous les liens étaient des **hash** (`/#post-<id>`) : un robot d'aperçu
(WhatsApp, iMessage, Messenger, Telegram…) ne lit JAMAIS le fragment, donc chaque partage s'affichait avec la carte
générique d'`index.html` — la même pour une randonnée, un profil ou une rencontre. En production, les trois boutons
« Partager en dehors » diffusent désormais **`/p/<id>`, `/u/<id>`, `/e/<id>`**, servis par
`netlify/edge-functions/apercu.js` : un **humain reçoit un 302** vers le lien profond en hash (les routeurs d'app-06 et
d'app-07 l'ouvrent comme avant, `?plk=` conservé s'il est valide), un **robot d'aperçu reçoit une page** qui décrit le
contenu. Cœur PUR dans `netlify/lib/apercu-coeur.js`, testé tel quel en Node.
⚠️ **C'EST DU CONTENU D'AUTRUI ÉCRIT DANS DU HTML SUR L'ORIGINE DE L'APPLICATION — un lot de sécurité.** Sept règles,
écrites en tête du cœur : lecture sous la **clé ANON seule** (jamais `service_role` « pour voir plus » : l'aperçu
publierait ce que la RLS refuse), auteur privé **re-vérifié** sur son profil (défense en profondeur sur la RLS de
`posts`), **un carnet (`vlog` non nul) n'a JAMAIS d'aperçu** (sa visibilité vit dans le jsonb, hors RLS — c'est le
client qui l'écarte), un compte privé ne livre ni bio ni photo, textes bornés en points de code et purgés des marques
bidirectionnelles puis échappés, image seulement depuis le seau PUBLIC `content` (`attachments`, `data:`, autre hôte,
`..` ou `%2e` : rien — `new URL` NORMALISE `a/%2e%2e/b` en `b`, d'où un refus sur la forme BRUTE), libellé de passion
seulement s'il est `active` (une passion retirée par la modération se tait), page **sans script** sous
`default-src 'none'` + `sandbox`, `noindex` (partager n'est pas publier sur Google).
⚠️ **JAMAIS `/bot/i` POUR RECONNAÎTRE UN ROBOT** : « CUBOT » est une marque de téléphone Android. La liste est
nominative ; un robot non reconnu retombe sur l'aperçu générique (l'état d'avant), un humain pris pour un robot voit un
lien « Ouvrir sur PASSIO ». Personne n'est bloqué. ⚠️ **ET UN JETON N'Y ENTRE QUE S'IL EST PROPRE AU ROBOT, jamais
au NAVIGATEUR INTÉGRÉ de la même application** — trouvé par la contre-revue `passio-red-team` du jour, après des gates
vertes : `snapchat` et `pinterest/` reconnaissaient aussi les vues web de Snapchat (« Snapchat/12.x ») et de Pinterest
(« [Pinterest/iOS] »), qui sont des HUMAINS — ils recevaient la page nue au lieu du 302, un tap de plus sur le canal
même que ce lot vise. Les robots y ont leur propre jeton (« Snap URL Preview », « Pinterestbot », « Pinterest/0. ») ;
Viber, Tumblr, Zalo, Mattermost, Rocket.Chat sont SORTIS faute de jeton propre connu, et Applebot aussi (indexation).
Le test ③ porte désormais sept navigateurs intégrés réels. Au passage : la liste des caractères invisibles est passée
aux classes Unicode (`\p{Cc}\p{Cf}\p{Zl}\p{Zp}`, le liant U+200D excepté) — la liste écrite à la main laissait passer
U+061C et U+200B, de quoi fabriquer un « PASSIO » visuellement identique sous le domaine officiel ; `imageSure` refuse
tout blanc dans l'URL brute (`new URL` retire tabulations et sauts de ligne AVANT de résoudre `..`) ; et
`shareMyProfile` (app-06), qui diffusait `location.href` sans aucun appelant dans le dépôt, est RETIRÉE — une fonction
morte qui double une vivante offre au prochain correctif un endroit plausible où se poser.
⚠️ **LA FORME COURTE N'EXISTE QUE LÀ OÙ LA FONCTION TOURNE** (production et previews Netlify) : en local, `/p/<id>`
serait un 404, `lienPartageDe` (app-06, SEULE source des trois formes) garde le hash. Un identifiant hors des formes
que la fonction accepte (mêmes expressions qu'elle, dont `LIEN_PARTAGE_COMPTE_RE` : un pseudo n'est pas un compte)
garde aussi le hash — sinon elle le renverrait à l'accueil. Coupures : `localStorage.passio_liens_courts_v1="0"` ou
`window.PASSIO_LIENS_COURTS=false`. Le service worker ne met JAMAIS `/p/`, `/u/`, `/e/` en cache (son
stale-while-revalidate garderait sinon un 302 ou une page d'aperçu à vie) : réseau seul pour une navigation, et HORS
LIGNE — une PWA installée capte le lien — il redirige vers le lien profond, que l'app ouvre depuis son repli
`index.html`, plutôt que vers la page d'erreur du navigateur.
⚠️ **La fonction n'est pas joignable depuis un bac de session** (HTTP `000` sur `passio-app.netlify.app`) : la preuve
en production est le job « Déploiement production » vert (le CLI assemble les Edge Functions, `../lib/` compris) puis
un `curl -A "WhatsApp/2.24" https://passio-app.netlify.app/p/<id>` depuis un poste.
Verrous : `tests/unit/apercu-liens.test.mjs` (14, dans `npm run verif` — l'enveloppe est appelée avec un faux
PostgREST qui NOTE chaque lecture et sa clé) et `tests/e2e/liens-partage-post-profil.spec.js` (+3 : ⑨ forme selon
l'hôte, coupure et hors forme ; ⑩ le CÂBLAGE des trois boutons ; ⑪ la branche du service worker). **Éprouvés par
RÉINJECTION de vingt mutations**, chacune rouge sur son cas : carnet non écarté (2), guillemet non échappé (2),
détection `/bot/i` (2), seau non vérifié (1), profil privé ignoré (2), page servie aux humains (1), auteur privé ignoré
(2), passion non filtrée (1), `plk` non validé (1), profil et activité contournant `lienPartageDe` (1 chacun), coupure
ignorée (1), forme non vérifiée (1), service worker sans garde (1) ; puis, après la contre-revue, jetons de navigateur
intégré remis (1), liste d'invisibles d'origine (1), blancs admis dans l'URL d'image (1), moitié de paire orpheline (1),
service worker qui intercepte hors navigation (1) ou qui met en cache (1).
⚠️ **RÉSIDUS NOMMÉS** : n'importe qui peut se dire robot et coûter jusqu'à trois lectures PostgREST par requête (la
fonction n'a pas `cache: "manual"`, donc rien n'est gardé au bord — c'est le cache du ROBOT que `max-age=300` vise) ;
le partage d'une BOBINE reste en `#reel=`, sans aperçu ; et l'assemblage de l'import `../lib/` par le CLI Netlify ne se
prouve qu'au déploiement.

## 📣 INVITER JUSTE APRÈS AVOIR ORGANISÉ — le partage existait, personne ne s'en servait (2026-10-04)

Mesuré en production le jour même (canal ① d'ADR-012) : **aucun lien partagé en sept jours** — pas un seul événement
`link` dans `telemetry_events` (rétention 7 j) — pour **six activités créées en trente**, 45 sessions de production et
2 comptes actifs dans la semaine. Les boucles de partage réparées la veille (liens courts, aperçus) ne servent à rien
si personne ne partage, et personne ne revient sur la fiche de SA propre activité pour l'envoyer. Le moment où l'on a
le plus envie d'inviter est celui où l'on vient d'organiser : `submitEvent` (app-07) appelle désormais
`proposerInvitationActivite(ev)` à la fin d'une CRÉATION réussie — fenêtre « Ton activité est en ligne », bouton
« Inviter mes amis » → `inviterActivite`, qui diffuse le lien de `lienPartageDe` (donc court en production, avec
l'aperçu titre/date/ville) et un texte qui nomme l'activité.
⚠️ **LE PARTAGE PART DU CLIC, JAMAIS DE LA FIN DE LA PUBLICATION** : la publication est asynchrone et
`navigator.share` exige un geste de l'utilisateur — appelé après un `await`, il est refusé. D'où une fenêtre et un
bouton, pas une feuille de partage ouverte d'office.
⚠️ **SEULEMENT SI L'ACTIVITÉ EXISTE POUR LES AUTRES** (`ok && backend && !editId`) : en local, hors ligne ou sur un
refus, le lien mènerait à « introuvable » ; une édition n'est pas une création. ⚠️ **On ne remplace jamais une fenêtre
ouverte pendant la publication** (envoi de la couverture, géocodage) : `openModal` n'empile pas. ⚠️ Télémétrie
`activite_invite_proposee` / `_partagee` / `_plus_tard` — **jamais un nom en `irl_create_`/`irl_join_`**, que le funnel
IRL compte (`irl-funnel.spec.js`). Coupures : `localStorage.passio_invite_apres_creation_v1="0"` ou
`window.PASSIO_INVITE_APRES_CREATION=false`.
⚠️ **LE CAS « ÉDITION » ÉTAIT VERT POUR UNE MAUVAISE RAISON** : le banc stubbait `supaUpdateEvent` à `null`, donc
l'enregistrement échouait et l'invitation ne pouvait pas partir de toute façon — la mutation « édition non exclue »
restait verte. Le cas pose désormais une écriture qui RÉUSSIT et vérifie que l'édition a abouti. **Un cas négatif qui
peut être vert pour une autre raison que la sienne ne prouve rien** : prouver d'abord que la prémisse tient.
Verrou : `tests/e2e/invitation-activite.spec.js` (6), **éprouvé par RÉINJECTION de sept mutations** — appel retiré
(3 rouges), serveur ignoré (1), édition non exclue (1), fenêtre ouverte remplacée (1), coupure ignorée (1), titre non
échappé (1), lien recopié à la main au lieu de `lienPartageDe` (1 — un espion est le seul moyen de le voir en local,
où les deux formes coïncident).

## 👋 L'INVITATION — « Léa t'invite », et Léa suivie à la création du compte (2026-10-04)

Suite des liens courts et de l'invitation après création d'activité. Un lien partagé arrivait ANONYME : rien ne
disait qui l'avait envoyé, et le compte créé au bout repartait sans un seul abonnement — un fil vide, alors que la
personne qui l'a fait venir est celle qu'il veut retrouver. Module unique en fin de section partage d'app-06.
① `lienPartageDe` signe le lien `?inv=<uuid>` quand un VRAI compte partage (jamais un `u_…`) ; l'Edge Function
(`destination`) et le service worker hors ligne ne laissent passer `inv` que s'il est un uuid. ⚠️ Il désigne
l'auteur d'ORIGINE et survit aux transferts. ② `capterInvitation()` tourne au CHARGEMENT d'app-06 : mémorise
`passio_invitation_v1` (clé d'APPAREIL, hors `ACCOUNT_SCOPED_KEYS` — elle doit survivre à la purge d'adoption),
retire `inv` de l'URL, ignore un appareil qui porte déjà un compte. ⚠️ **`MY_UID` est un `let` d'app-08 : dans le
monolithe de prod il est en TDZ à cet instant** — `_uidEstUnCompte` avale l'erreur, d'où le repli sur `passio_uid`
(`_appareilPorteUnCompte`). Le toast « Léa t'invite » part de la reprise bornée (dev) ou de `passio:app-ready` (prod).
③ `#authInvite` (création seulement, peinte par `majInvitationAuth`, appelée par `switchAuthTab`) ANNONCE
l'abonnement — ou la DEMANDE vers un compte privé — et porte « Ne pas suivre » (44 px).
④ **L'ABONNEMENT AUTOMATIQUE N'A LIEU QUE SI L'ANNONCE ÉTAIT À L'ÉCRAN.** `signUp` n'emporte `invite_de` dans
`user_metadata` que si `#authInvite` est visible ET nomme l'invitant en attente (`data-de` : un autre onglet peut
remplacer l'invitation pendant que le formulaire montre l'ancienne ; l'événement `storage` repeint). L'invitation
locale est consommée par l'envoi. ⑤ `appliquerInvitation(session)` — `boot` (après `supaInit`) et `onbFinish`
(quand `signUp` a rendu une session) — suit l'invitant annoncé UNE fois ; ⑥ une invitation de l'APPAREIL seul
(Google, téléphone partagé, lien fabriqué) est **PROPOSÉE** (« Suivre Léa ? » / « Non merci »), jamais imposée.
⚠️ **DEUX REVUES DE SÉCURITÉ AUTOMATIQUES ont refusé les deux premières rédactions**, à raison : la première
suivait d'office sur la seule foi de la clé locale (abonner quelqu'un à un compte qu'il n'a jamais vu nommé), la
seconde emportait l'invitation COURANTE au lieu de celle AFFICHÉE. **Un consentement vaut pour ce qui a été
montré, pas pour ce qui est en mémoire au moment du clic.**
⚠️ **`audit-passio` en a trouvé deux autres APRÈS 19 tests verts** : ① aucun test n'exerçait l'accueil AUTOMATIQUE
(tous appelaient `accueillirInvitation()` à la main — câblage supprimable sans un rouge) ; ② `invite_de` est
PERMANENTE, et le seul verrou (`state.user.invitationTraitee`, blob « le dernier qui écrit gagne ») ne tenait pas
un désabonnement fait entre un premier démarrage en « attente » et le suivant. Remèdes : fenêtre de **7 jours**
après la création du compte, et **tout geste manuel sur l'invitant clôt l'invitation** (`invitationGesteManuel`,
appelé par `toggleFollowUser`). ⚠️ **On n'efface PAS la métadonnée par `updateUser`** : l'événement `USER_UPDATED`
atteint le gestionnaire `onAuthStateChange` du chemin `onbFinish`, dont la garde d'appropriation bloquerait toute
écriture d'état — un effet de bord pire que le défaut. ⚠️ `Date.parse(created_at)` et PAS `supaTs` : `supaTs`
replie sur `Date.now()`, ce qui ferait passer un compte EXISTANT pour neuf ; `NaN` retombe du côté sûr.
⚠️ La proposition n'écrit son verdict que sur une RÉPONSE : fermée sans choix, remplacée (`openModal` n'empile pas)
ou « Suivre » qui échoue → reposée au démarrage suivant, trois fois au plus (`ignoree`). Un compte sans nom valable
n'est jamais annoncé (on ne fait pas consentir à suivre quelqu'un qu'on ne nomme pas). `diagLog` n'écrit qu'en
mémoire : les `catch` du module passent aussi par `tel.error` (`_invitationEchec`).
Coupures : `passio_invitations_v1="0"` ou `window.PASSIO_INVITATIONS=false`. Télémétrie : `invitation_accueil`,
`invitation_proposee`, `invitation_refusee`, `invitation_suivie` (`verdict`, `source` : compte | appareil).
Verrous : `tests/e2e/invitation-arrivee.spec.js` (27) et `apercu-liens.test.mjs` ② bis, **éprouvés par RÉINJECTION
de vingt-six mutations, chacune rouge**. ⚠️ **RÉSIDUS NOMMÉS** : l'invitation est perdue si le nom n'était pas résolu
avant l'envoi du formulaire et que la confirmation s'ouvre dans un autre navigateur ; une bobine (`#reel=`) n'est
pas signée ; au banc, une bulle `.fr-tip` recouvre la rangée d'onglets du formulaire d'auth (à vérifier en usage
réel, hors lot) ; l'annonce ajoute ~90 px en création, sous laquelle « Créer mon compte » descend d'autant.

## 📈 ENTONNOIR DES LIENS — LA MARCHE « COMPTE CRÉÉ » (2026-10-04)

Le pilotage suivait un lien partagé jusqu'à « ouvert (confirmé) » (`?plk=`), et s'arrêtait là : il ne
disait pas si l'ouverture avait fait NAÎTRE un compte — la seule mesure qui dise si les partages et les
invitations font venir du monde. ① `captureLinkOpen` (js/telemetry.js) mémorise le lien d'arrivée de
l'appareil, `passio_lien_arrivee_v1 = { lk, at }` (clé d'APPAREIL, hors `ACCOUNT_SCOPED_KEYS`, TTL
14 j, le DERNIER lien ouvert l'emporte) ; ② `tel.linkSignup(voie, { invite })` émet `link_signup`
(`correlation_id` = le lien) et CONSOMME la mémoire — une inscription, un signal.
⚠️ **ÉMIS SUR L'APPAREIL D'ARRIVÉE, PAS À LA CONFIRMATION** : `onbDoAuth` l'appelle quand `signUp`
rend un compte neuf (après la sortie « déjà utilisé », qui n'est PAS une inscription, et avant la
branche « à confirmer ») — le lien de confirmation s'ouvre souvent dans un autre navigateur, qui ne
sait rien du lien d'arrivée. Le chemin **Google** n'appelle jamais `signUp` sur l'appareil :
`signalerInscriptionViaLien(session)` (app-08, aux DEUX entrées de session, à côté de
`signalerInscriptionConfirmee`) le reconnaît à la première session d'un compte NEUF — créé il y a
moins de 30 min ET après l'ouverture du lien (`Date.parse`, jamais `supaTs`, qui replie sur
`Date.now()`). Un compte existant OUBLIE le lien (`tel.linkArrivalForget`), sinon il s'attribuerait au
prochain compte créé sur l'appareil. Sur une inscription qui rend une session, `onAuthStateChange`
passe AVANT la fin de `signUp` : c'est lui qui émet, et la mémoire consommée empêche le doublon.
⚠️ **LE PILOTAGE NE DÉDUIT RIEN** (`_touchLink`, dashboard/server/store.js) : il compte `link_signup`,
statut `signed_up` (« a fait venir un compte »), et `signupRate` se lit parmi les liens CONFIRMÉS
ouverts, jamais parmi les créés. Seul un `invite === true` compte comme invitant, un `delai_s` non
numérique devient `null` — une valeur venue du client ne fabrique rien. Visiteurs : « … puis inscrits »
croise les deux signaux du MÊME appareil.
⚠️ **LE TEST ③ ter D'`invitation-arrivee` A BLOQUÉ LE DÉPLOIEMENT DE #573** : `INVITANT` était
l'identifiant d'un VRAI compte de production — en CI le vrai SDK atteint la base et lisait son vrai
nom, en local la base n'est pas joignable (vert local et sur la PR, rouge sur `main`). Un identifiant
d'essai est FICTIF et mesuré absent de `profiles`, jamais recopié d'une requête.
Verrous : `tests/e2e/lien-inscription.spec.js` (8) et `dashboard/test/links-inscriptions.test.js` (5),
**éprouvés par RÉINJECTION de dix mutations**, chacune rouge (mémoire non posée, appel retiré, émis
avant « déjà utilisé », garde « compte neuf » retirée, mémoire non consommée, péremption retirée ;
inscription ignorée, taux sur tous les liens, invitant non booléen, statut absent).
