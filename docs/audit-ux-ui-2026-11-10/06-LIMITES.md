# Limites de l'audit et vérifications restantes

> Ce qui n'a pas été vu ne doit pas être lu comme couvert. Le registre
> ([02-REGISTRE-DE-COUVERTURE.md](02-REGISTRE-DE-COUVERTURE.md)) donne, surface par surface, le statut
> « code seul » ou « inaccessible » avec sa raison ; cette page les regroupe par cause.

## 1. Conditions de l'observation

- **Émulation, pas d'appareil réel.** Toutes les captures viennent de Chromium 158 (gabarits 320 à
  1440 px, agent Android et tactile émulés) et, pour un sous-ensemble, de WebKit 27.2 (gabarit
  iPhone 13). Aucun véritable téléphone n'a été utilisé : clavier virtuel (simulé en réduisant la
  fenêtre), appui long, geste de retour du système, zones sûres, lecture H.264, pincement du
  recadreur et retour haptique restent à vérifier sur appareil.
- **Serveur imité.** En mode connecté, Supabase est remplacé par un faux serveur en mémoire dont les
  policies sont recopiées de la production (relevé du 2026-11-02). Il ne prouve pas la RLS réelle,
  n'a pas toutes les fonctions serveur (`rechercher_passions`, adresse réservée aux inscrits), n'a
  pas de clé étrangère `conv_members → profiles`, et ne connaît pas la table `passions` (semée par
  certains domaines). Un comportement « d'après le faux serveur » est dit tel dans la preuve.
- **Hors ligne imparfait.** `context.setOffline` ne coupe pas les réponses servies par route :
  plusieurs domaines ont ajouté une route de refus ; les états hors ligne restants sont marqués
  « code » ou « hypothèse ».
- **Temps réel et service worker coupés.** L'arrivée en direct (messages, notifications, saisie en
  cours, présence) et le comportement hors ligne de l'application installée n'ont pas été observés.
- **Hôtes tiers refusés.** GIF (Klipy, Giphy), anti-robot Turnstile, connexion Google : leurs écrans
  sont lus dans le code ou simulés.
- **Toasts.** Les captures figent les animations à leur fin, ce qui efface un toast en sortie ; les
  domaines qui devaient en montrer un l'ont figé (déclaré dans la note de capture). Le défaut réel —
  toasts peints sous les superpositions (TRA-C01) — a été établi par mesure, pas par capture.
- **Mode connecté et première visite.** Le banc coupe la première visite en mode connecté ; les
  exemples y perdent leur étiquette « Exemple PASSIO ». Les domaines IRL l'ont rétablie ; d'autres
  captures connectées peuvent montrer des exemples sans étiquette : ce n'est pas un défaut du produit.
- **Jeu de données.** La première version du socle de données portait un identifiant de passion
  inconnu (`photographie`), d'où la tuile « ✨ Passion » des captures SOC-003 ; la bobine `pa_lea_2`
  du socle est lue comme une photo (marqueur vidéo absent) : artefacts du banc, signalés dans les
  constats concernés.

## 2. Ce qui n'a pas pu être vérifié (par cause)

| Cause | Surfaces concernées |
|---|---|
| Deux appareils ou WebRTC | appels audio et vidéo (désactivés en production : `PASSIO_APPELS_ACTIFS = false`), diffusion d'un Live |
| Caméra, micro réels | enregistrement vidéo, vocal réel, pointage par QR scanné |
| Notifications poussées | réception d'une push, rappels J-1 / H-2, sonnerie d'appel |
| Inscription réelle | création de compte, e-mail de confirmation, Google, mot de passe oublié, reprise d'une inscription interrompue (le banc refuse toute inscription) |
| Données de durée | récap de la semaine (compte de plus de 3 jours), stories expirées |
| Application installée | invite d'installation sur iPhone, hors ligne avec service worker, mise à jour en cours d'usage |
| Lecteurs d'écran | VoiceOver, TalkBack (seuls les noms accessibles et l'ordre de tabulation ont été mesurés) |

## 2 bis. Recroisement avec l'inventaire statique du code

`outils/inventaire-code.js` recense dans le code 95 fonctions d'ouverture (`open*`, `show*`,
`ouvrir*`) et 69 fonctions qui ouvrent une modale (`donnees/inventaire-code.json`). Après l'audit,
**21 fonctions d'ouverture** et **9 fonctions à modale** ne sont nommées dans aucun rapport ni
registre : `openFeedPost`, `openCommentReactors`, `openPostReactors`, `openCommentSheet`,
`showGroupMembers`, `openReelComments`, `openMyPostsTab`, `ouvrirGestionPassions`,
`ouvrirRecherchePassionStudio`, `openCreateProfile`, `openIrlCalendar`, `openIrlTimePicker`,
`openStudioAsStory`, `openStoryGroup`, `openStoryViewerAt`, `openStoryViewer`, `openConvFiles`,
les quatre sélecteurs d'emoji / GIF du fil, ainsi que `_legalModale`, `_proposerSuiviInvitant`,
`confirmDeleteProfile`, `admissionOuvrirPorte`, `admissionValiderAnnee`, `_openConvBgPicker`.
Plusieurs correspondent à des surfaces atteintes par le geste et capturées sous un autre nom
(visionneuse de stories, réactions, membres d'un groupe, calendrier du filtre, fichiers partagés) ;
la correspondance n'a pas été prouvée une par une. Les deux portes d'admission 18+ et la suppression
d'une passion personnalisée n'ont, elles, pas été ouvertes : **à examiner**.

## 3. Ce que l'audit n'a pas fait

- Aucun test auprès d'utilisateurs : les constats de type **hypothèse** (par exemple PCS-C05) sont à
  vérifier avant toute construction.
- Aucune lecture de la base de production ni de la télémétrie : les fréquences d'usage ne sont pas
  connues, donc la priorité tient à la gravité et à la place dans le parcours Fil → interaction → IRL,
  pas à des volumes.
- Aucune estimation de gain (temps, conversion) n'est présentée comme mesurée.
- Aucune modification de l'application, aucun déploiement.

## 4. Vérifications recommandées avant de livrer les lots

1. Sur un iPhone et un Android réels : le parcours `partage.html` (lien reçu → inscription →
   contenu), le vocal et l'appui long de `messagerie.html`, le clavier dans la conversation et dans
   l'inscription.
2. Sur la base de staging : rejouer les refus serveur du LOT-1 avec la vraie RLS.
3. Un test court (5 personnes) sur les hypothèses et sur le lexique proposé (LOT-8).
