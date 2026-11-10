# Partage, liens et invitation — rapport de domaine

> Audit UX/UI PASSIO du 2026-11-10 · version auditée `main@4e1d8ed1` · domaine `partage` (groupe « Partage »)
> Surfaces `PAR-001…`, constats `PAR-C01…`. Données : `donnees/domaines/partage.json` (fabriqué et vérifié par
> `outils/sondes/partage-construire-json.js`). Captures : `captures/partage/`.

## 1. Périmètre et méthode

**Lu.** `docs/journal/partage-liens-invitation.md`, `docs/lots-ui/02-UI5-BOBINES-ET-LIENS-PROFONDS.md` ; le code des
portes (`sharePost`, `sharePostInFeed`, `partagerOuCopier`, `shareUserProfile`, `openReelShareModal`, `shareReelInFeed`,
`copyReelLink`, `shareReelVia/Email/SMS`, `shareEvent`, `shareEventInFeed`, `shareEventExperience`, `openEventInvite`,
`inviteToEvent`, `inviteAllFollowingToEvent`, `proposerInvitationActivite`, `inviterActivite`, `shareBeta`,
`inviterDesAmis`, `shareLocation`, `_vliveShare`, `js/affiche-rencontre.js`), des routeurs (`_ouvrirLienPartage`,
`_openReelDeepLink`, `_openIrlEventFromHash`, `_openIrlCheckinFromHash`), de l'invitation (`capterInvitation`,
`accueillirInvitation`, `majInvitationAuth`, `appliquerInvitation`), du retour après inscription
(`js/first-run.js` : `requireAuthentication`, `memoriserRetour`, `ouvrirAuth`, `apresAuthentification`), de
`signalerInscriptionViaLien`, et de l'aperçu (`netlify/edge-functions/apercu.js`, `netlify/lib/apercu-coeur.js`).

**Ouvert dans le banc isolé** (Chromium émulé, aucun véritable appareil) : 10 sondes d'exploration
(`outils/sondes/partage-01…10`) et 14 scénarios de capture (`outils/scenarios/partage.js`). Gabarits : m390 partout,
m360 pour les quatre feuilles de partage. Modes : `compte` (faux serveur en mémoire) pour les portes et l'ouverture
des liens en étant connecté ; `visiteur` pour l'ouverture des liens sans compte.

**Trois contournements du banc, à connaître pour lire les captures.**

1. *Le toast.* Le banc capture « animations coupées » : Playwright avance alors l'animation de sortie du toast à sa
   fin, et tout toast sort transparent. Les scénarios posent `.toast{animation:none}` : le toast est montré tel
   qu'il est pendant ses 2,6 s. Sa position et son plan sont ceux de l'application. La mesure « le toast est-il
   vu ? » (sonde 07) est faite animations actives, `pointer-events` du toast levé le temps de la mesure — sans quoi
   `elementFromPoint` ne rend jamais un toast.
2. *Le visiteur.* Le mode `visiteur` sert un projet vide ; un lien y serait toujours « introuvable ». Les scénarios
   y branchent le faux serveur en mémoire du banc (rôle `anon`, policies recopiées) : le visiteur lit ce qu'un
   visiteur lit en production, sur des données fictives.
3. *Le lien en mode compte* passe par `query` (le banc ne transmet `hash` qu'au mode visiteur).

**Limites.** La feuille de partage du téléphone (`navigator.share`) n'existe pas dans ce Chromium : les AVANT montrent
la branche de repli (copie) ; la branche native est simulée par un espion qui note ce qui lui est confié. Aucune
inscription réelle : la fin d'inscription est simulée en appelant le crochet `apresAuthentification`. Les liens
courts `/p/ /u/ /e/` n'existent qu'en production : au banc tous les liens sont en `#…`.

## 2. Cartographie

| Objet | Porte(s) | Fichier |
|---|---|---|
| Publication | icône de la carte du fil et de la page ; feuille « Partager ce post » | app-02:10496/10577, app-03:11 |
| Bobine | bouton « Partager » du rail ; feuille à 8 options | app-05:3066, :3807 ; app-06:898–977 |
| Activité | 3 portes « Partager » + « Inviter » sur la fiche ; fenêtre « Ton activité est en ligne » ; QR d'accueil ; affiche ; « Partager mon expérience » | app-07:4412–4541, :5056, :7187, :7411, :8042 ; affiche-rencontre.js |
| Profil d'autrui | menu ⋯ → « Partager le profil » | app-04:4673, :5442 |
| Application / mon profil | crayon du profil → « Inviter des amis » ; Paramètres → Support ; séparateur « Exemples » du fil | app-06:885–896, :1886 ; index.html:554 ; app-02:8632 |
| Passion | aucune porte | app-07:330 |
| Live | bouton « ↗ » | app-05:5097, :5209 |
| Position | pièce jointe « Position » d'une conversation | app-09:1482 |
| Arrivée d'un lien | `#post-`, `#user-`, `#reel=`, `#irl-event-`, `#irl-checkin-`, `?inv=`, `?plk=`, `?live=` | app-06:77–367, :543 ; app-07:4896, :8186 |
| Aperçu | page servie aux robots sur `/p/ /u/ /e/` | netlify/edge-functions/apercu.js |

Partage **interne** : « dans mon feed » (publication, bobine, activité) et invitation des abonnements à une activité
(notification). Il n'existe **pas** d'envoi d'une publication à une personne ou à une conversation ; le seul envoi
vers une conversation est « Transférer » un message (messagerie, hors périmètre).

## 3. Parcours déroulés et états difficiles

| État exercé | Résultat observé |
|---|---|
| Partager une publication, copie autorisée | Lien copié avec le texte de la publication ; toast émis mais **sous la feuille** ; feuille reste ouverte |
| Idem, presse-papiers refusé | Toast « Lien : <adresse de 120+ caractères> », 3 s, sous la feuille |
| Feuille du téléphone présente (simulée) | Reçoit `{ title: "PASSIO", text: extrait, url }` ; annulation muette ; refus → copie |
| Double appui « Partager dans mon feed » (publication) | Une seule publication, bouton « Partage en cours… » |
| Double appui « Partager dans le Feed » (bobine) | Une publication, mais le 2e appui traverse la feuille : le lecteur se ferme, une fiche de passion s'ouvre |
| Copier le lien d'une bobine, copie refusée | Erreur JS non gérée, aucun message |
| Copier / réseaux depuis le lecteur de bobines | Toasts émis **sous le lecteur** |
| Repartage d'une publication | Carte en texte seul, sans la photo, sans lien vers l'originale |
| Repartage d'une activité | Carte avec « Voir l'activité › » (correct) ; on quitte la fiche pour le fil |
| Inviter un abonnement à une activité | Notification écrite ; bouton « ✓ Invité » ; toast sous la feuille ; personne retirée de la liste |
| Inviter : liste épuisée / recherche vide | « Tu as invité tout le monde » (impasse) / « Aucun résultat pour « … » » |
| Lien de pointage copié (QR d'accueil) | Toast sous la feuille |
| « Partager mon expérience » | Studio prérempli ; rattachement à l'album invisible |
| Lien valide, connecté (publication, profil, bobine, activité) | Ouvert en 40 à 530 ms ; retour arrière propre |
| Lien privé / supprimé / inconnu, connecté | 7,9 à 8,7 s sans rien, puis toast de 3 s |
| Profil inconnu / pseudo | « Profil non trouvé » / « Profil introuvable » |
| Activité annulée, profil privé | Fiche d'arrivée claire |
| Lien valide, visiteur (publication, activité, bobine, profil privé) | Contenu ouvert directement, sans accueil ; « Camille Audit t'invite » (6 s) |
| Visiteur → geste engageant → « Créer mon compte » | **Écran inchangé : le formulaire est derrière le contenu** (publication, activité, bobine) |
| Fin d'inscription (simulée) | Retour au fil, « Tu peux aimer cette publication. », publication non rouverte |
| Formulaire d'inscription d'un invité | Annonce d'abonnement + « Ne pas suivre » (correct) |
| Lien mort, visiteur | Fil d'exemples sans indication, puis toast |
| Aperçu robot (fonction réelle, faux `fetch`) | Titres justes ; contenu privé → aperçu générique ; humain → 302 |

Non exercés : hors ligne pendant un partage, clavier ouvert sur la recherche d'invités, t768/d1440 (les feuilles sont
des feuilles basses mobiles ; non prioritaire ici).

## 4. Ce qui fonctionne et doit être conservé

- L'arrivée directe sur le contenu pour un visiteur, et l'exactitude des quatre routeurs (jamais un autre contenu).
- Le consentement de l'invitation : annonce, « Ne pas suivre », demande plutôt qu'abonnement d'office (PAR-043, PAR-073).
- `partagerOuCopier` : partage dans le geste, annulation silencieuse, repli.
- « Ton activité est en ligne » : le bon moment et le bon message (PAR-027) — modèle pour les autres textes.
- L'affiche à QR (PAR-026), l'aperçu de lien (PAR-061), la carte d'activité repartagée (PAR-029).
- Le verrou anti-double-envoi de la publication (PAR-006) ; le séparateur « Exemples PASSIO » (PAR-034).
- Les fiches d'arrivée « profil privé » et « activité annulée » (PAR-051, PAR-053, PAR-054).

## 5. Constats par surface

### 5.1 Au bout du lien (priorité du domaine)

- **PAR-C01 (P0)** — *« Créer mon compte » ouvre le formulaire derrière le contenu.* `#onboarding` est en z-index 50 ;
  la page d'une publication et la fiche d'activité sont en 200, le lecteur de bobines en 9999. `ouvrirAuth`
  (first-run.js:1544) ne ferme que la modale. Mesuré (sonde 10) : 5 points sur 5 de l'écran rendent la publication,
  le champ du formulaire n'est atteignable qu'après un retour arrière. Captures PAR-042, PAR-046, PAR-048. Le toast
  « X t'invite — touche ici » mène au même formulaire caché.
- **PAR-C02 (P1)** — *Le contenu visé n'est pas rouvert après l'inscription.* `memoriserRetour` garde l'adresse, or
  les routeurs l'ont nettoyée (`#post`, `#reels`) : `retour.hash` est vide. PAR-044.
- **PAR-C05 (P1)** — *Lien mort : ~8 s de silence, 3 s de toast.* PAR-049, PAR-050, PAR-055, PAR-056.
- **PAR-C20 (P2)** — *L'invitation nominative ne tient que 6 s.* PAR-040.

### 5.2 Retour de l'action

- **PAR-C03 (P1)** — *Toasts sous les feuilles et sous le lecteur.* z-index 200 contre 10001 et 9999. PAR-003, PAR-012,
  PAR-025, PAR-031.
- **PAR-C04 (P1)** — *Copie refusée : adresse brute, ou rien (bobine).* PAR-004, PAR-013.
- **PAR-C19 (P3)** — *Feuille conservée ou fermée selon la porte.*
- **PAR-C15 (P2)** — *Double appui traversant (bobine).* PAR-016.

### 5.3 Ce qui part, et à qui

- **PAR-C06 (P1)** — *Le repartage perd le média et le lien.* PAR-005.
- **PAR-C10 (P2)** — *Message sans auteur ni PASSIO ; activité sans heure.*
- **PAR-C11 (P2, sensible)** — *Le lien porte mon nom sans le dire.*
- **PAR-C08 (P2)** — *Bobine et live hors de `lienPartageDe` : pas d'aperçu, pas d'invitation.*
- **PAR-C16 (P2, sensible)** — *Rattachement invisible de « mon expérience ».* PAR-028.
- **PAR-C17 (P2, sensible, d'après le code)** — *Position envoyée en un appui.*

### 5.4 Cohérence des portes

- **PAR-C07 (P2)** — *Quatre façons de partager* → feuille unifiée, maquettée sur publication (PAR-002), bobine
  (PAR-011), activité (PAR-022) et profil (PAR-031).
- **PAR-C09 (P2)** — *Vocabulaire.* **PAR-C12 (P2)** — *Trois portes, trois icônes.* **PAR-C13 (P2)** — *Feuille
  d'invitation aux abonnements.* **PAR-C14 (P2)** — *Portes d'invitation cachées.* **PAR-C18 (P3)** — *Cibles < 44 px.*
  **PAR-C21 (P3, hypothèse)** — *Page d'aperçu nue.*

## 6. Cohérence — tableau comparatif des portes

| Porte | Où | Libellé | Icône | Ce qui s'ouvre | Options | Message transmis | Lien | Retour |
|---|---|---|---|---|---|---|---|---|
| Publication | carte, page | (icône) | nœuds, 44 × 31 | feuille « Partager ce post » + extrait | « Partager dans mon feed », « Partager en dehors » | titre « PASSIO », texte = extrait | `/p/` signé `inv` | « Lien copié » (sous la feuille) ; feuille reste |
| Bobine | rail du lecteur | « Partager » | nœuds (SVG propre), 48 × 63 | feuille « Partager cette bobine », sans extrait | WhatsApp, Telegram, 𝕏 Twitter, Facebook, Email, SMS, « Partager dans le Feed », « Copier le lien » | « Regarde cette bobine PASSIO: …... » | `#reel=`, **non signé, sans aperçu** | « Lien copié » / « Ouverture whatsapp... » (sous le lecteur) ; feuille fermée |
| Activité | haut de fiche ; barre « Échanges » ; « Autres actions » | « Partager » | **flèche courbe** en haut, nœuds ailleurs | feuille « Partager cet événement » + titre, ville, jour | « Partager dans mon feed », « Partager en dehors » | « titre · ville · 13 nov » (sans heure) | `/e/` signé | « Lien de l'événement copié » (sous la feuille) ; feuille reste |
| Activité (abonnements) | « Autres actions » | « Inviter » | aucune | feuille « Inviter des amis » | liste + « Inviter » par personne | notification « t'invite à … » | — | bouton « ✓ Invité » ; toast sous la feuille |
| Activité (après création) | fenêtre automatique | « Inviter mes amis » | nœuds | feuille du téléphone ou copie | — | « Je t'invite : … — date, heure · ville. Rejoins-moi sur PASSIO 👇 » | `/e/` signé | « Lien d'invitation copié — colle-le dans ta conversation » ; fenêtre fermée |
| Profil d'autrui | menu ⋯ | « Partager le profil » | aucune | rien (direct) | — | « Découvre <nom> sur PASSIO » | `/u/` signé | « Lien du profil copié » (sous la modale) |
| Mon profil / l'app | crayon → 6e entrée ; Support → 7e ; séparateur du fil | « Inviter des amis » / « Inviter quelqu'un » | aucune | rien (direct) | — | « Je suis sur PASSIO, le réseau des passions — rejoins-moi : » | `/u/<moi>` signé | « Lien d'invitation copié » (visible) |
| Live | incrustation | (« ↗ ») | **caractère ↗** | rien (direct) | — | « 🔴 <prénom> est en direct : … sur PASSIO » | `/?live=`, non signé | « Lien du live copié » (d'après le code) |
| Pointage | QR d'accueil | « Copier le lien de pointage » | aucune | — | — | lien seul | `#irl-checkin-` | « Lien copié » (sous la feuille) |
| Affiche | fiche (organisateur) | « Affiche à imprimer · QR d'inscription » | aucune | aperçu A4 | « Partager l'affiche » (si fichiers), « Enregistrer l'image » | « Inscris-toi : <lien> » | `/e/` suivi | — |

**Divergences avec le reste de l'application** : « feed » / « Feed » alors que l'interface dit « Découvrir » et le
parcours d'accueil « Fil » ; « post » / « Post » alors que les fenêtres d'inscription disent « publication » ;
« événement » / « activité » / « rencontre » pour le même objet ; emoji 📤 et 📍 écrits dans le texte des repartages
alors que l'icône de partage est un SVG ; deux boutons « × » dans les feuilles « Inviter des amis » et « Accueil des
participants » (celui d'`openModal` et celui du gabarit) ; titre de la page d'arrivée « Post ».

## 7. Non vérifié, et comment le vérifier

- **La feuille de partage du téléphone** (titre, texte, vignette tels que WhatsApp, iMessage, Messenger les
  montrent) : sur un Android et un iPhone réels, depuis la production, pour une publication, une bobine, une activité.
- **L'aperçu de lien réel** : `curl -A "WhatsApp/2.24" https://passio-app.netlify.app/p/<id>` puis collage du lien
  dans une conversation ; ici, seule la page produite par la fonction a été rendue.
- **L'inscription réelle jusqu'au bout** (e-mail, Google) depuis un contenu ouvert par lien : PAR-C02 est établi par
  la valeur mémorisée et par un appel simulé du crochet ; à rejouer sur un environnement de recette avec un compte d'essai.
- **Le toast d'abonnement automatique** et la fenêtre « Suivre X ? » (PAR-073, PAR-074) : exigent une vraie session neuve.
- **Le double appui traversant** (PAR-C15) sur un écran tactile réel.
- **Le partage de position** (PAR-C17) et **le partage d'un live** (PAR-070) : lus dans le code seulement.
- **Le refus d'un mauvais code de pointage** par lien : le faux serveur répond « ok » à tout code.
- **Hors ligne** au moment du partage, et t768 / d1440.

## 8. Compteurs

Rendus par `node docs/audit-ux-ui-2026-11-10/outils/sondes/partage-construire-json.js` (voir la fin du fichier pour
les valeurs à jour) :

COMPTEURS_ICI
