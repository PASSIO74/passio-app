# Rencontres IRL — fiche, participation, organisation (`irl-fiche`)

Audit UX/UI du 2026-11-10, code `main@4e1d8ed1` (identique à la production). Surfaces `IRL-101…194`,
constats `IRL-C50…C69`. Données : `donnees/domaines/irl-fiche.json` ; captures : `captures/irl-fiche/`.

## 1. Périmètre et méthode

**Lu** : `openEventDetails` et son pied historique (app-07:4243-4551), le décor UI-4B
(`js/ui-v4b-fiche.js`, en entier), `setEventRsvp` / promotion / discussion de groupe / pointage
(app-07:3449-4032), rappels (4955-5016), création, édition, gestion, annulation, suppression,
co-organisation, liste d'attente, message groupé (6431-7250), invitations, avis, QR et code
d'accueil (7325-8149), lot UI-6A0 (`js/ui-v6a0-activite.js`, en-tête), styles du pied
(styles.css:8560-8690) et de la pile des toasts (1468-1554), lectures serveur (app-08 :
`supaLoadEvents`, `supaLireAdresses`, commentaires, notes). Repris sans le redécouvrir : le parcours
cœur (`donnees/domaines/parcours.json`), en particulier **PCS-C03** (l'inscription ne confirme rien
et ne propose pas la suite), **PCS-C06** (« Je viens » vs « Je participe ») et **PCS-C01** (porte
« Voir l'activité » tardive).

**Ouvert** : uniquement par le banc isolé. Mode `compte` (faux serveur, jeu
`outils/jeu/irl-fiche.js` : 10 activités — à venir, aujourd'hui, complète + attente, passée, annulée,
la mienne, payante aux textes très longs, organisateur privé, en cours, presque complète), mode
`demo` pour l'activité d'exemple. Sondes gardées comme preuve : `outils/sondes/irl-fiche-01…06`.
Scénarios : `outils/scenarios/irl-fiche.js` (7 scénarios).

**Gabarits** : m390 partout ; m360 pour la fiche, la participation et la création ; t768 et d1440
pour la fiche. Émulations Chromium uniquement (aucun appareil réel).

**Ouverture de la fiche** : par `openEventDetails(id)`, la fonction appelée par la porte « Voir
l'activité » du fil (geste réel déjà capturé en PCS-008). Tous les gestes DANS la fiche (participer,
double appui, liste d'attente, retrait, discussion, publier) sont de vrais appuis. Les fenêtres
d'organisation sont ouvertes par leur fonction (statut « simulé »).

## 2. Cartographie

| Surface | Porte d'entrée | Condition d'apparition | Code |
|---|---|---|---|
| Fiche d'activité (UI-4B) | Fil « Voir l'activité », carte Rencontrer, profil, notification, lien `#irl-event-` | toujours | app-07:4243 ; ui-v4b-fiche.js |
| Pied « Je participe » / « Rejoindre la liste d'attente » / « ✓ Je participe » / « Sur liste d'attente » | fiche | ni annulée ni terminée | ui-v4b-fiche.js:579-640 |
| Pied « Événement annulé » / « Partager mon expérience » | fiche | annulée / terminée | app-07:4533-4543 |
| Feuille à trois états | Rencontrer › carte › « + Rejoindre » | — | app-07:4006 |
| Discussion des participants | fiche | inscrit·e « going » ou gestionnaire ; discussion déjà créée | app-07:3899 |
| Pointage (« Je suis sur place », code d'accueil) | fiche | fenêtre de pointage, inscrit·e | app-07:3928, 8096 |
| QR d'accueil, Affiche | fiche (organisation) | gestionnaire, non terminée | app-07:8042 ; affiche-rencontre.js |
| Avis | fiche | terminée, participant·e, pas organisateur | app-07:7645 |
| Inviter | fiche › Autres actions | non terminée | app-07:7411 |
| Gérer · Modifier · Prévenir · Co-organisateurs · Liste d'attente · Annuler · Supprimer | fiche › Autres actions › Gérer | gestionnaire | app-07:6677-6931 |
| Créer une activité (UI-6A0) | « + » central | compte, majorité déclarée | app-07:6431 ; ui-v6a0-activite.js |
| Invitation après création | après publication réussie | serveur OK, création | app-07:7187 |
| Rappels push | après inscription confirmée | push disponible, permission « default » | app-07:4981 |

## 3. Parcours déroulés et états difficiles

| État exercé | Résultat observé |
|---|---|
| S'inscrire (vrai appui) | Ligne `going` écrite ; pied pâle « ✓ Je participe » ; aucun toast, une notification interne « Tu rejoins … » ; rien sur la suite (PCS-C03). |
| Second appui 0,5 s après | Le lien « Retirer ma participation » est sous le doigt (`elementFromPoint`) → DELETE, « Désinscrit » (IRL-C50). Vu une fois avec un double-clic : écran « désinscrit », serveur « going » (non reproduit). |
| Discussion après inscription (en ligne) | « Ouverture de la discussion… » puis « Discussion indisponible hors connexion » (IRL-C51). |
| Retrait volontaire | Immédiat, sans annulation, « Désinscrit ». |
| Activité complète | « Rejoindre la liste d'attente » (bien) → « Sur liste d'attente » muet, deux toasts sur le pied (IRL-C55, C64). |
| Dernière place prise pendant la lecture (refus rejoué) | Toast exact, mais bouton « Je participe » et « 1 place restante » périmés (IRL-C54). |
| Hors ligne | Non représentatif sur le banc (voir § 7). |
| Passée / annulée / en cours | Places « restantes » sur une passée (C56) ; annulation discrète (C57) ; pointage clair (à conserver). |
| Adresse réservée | Deux lignes « Adresse » contradictoires (C58). |
| Ma propre activité | « ✓ Je participe / Retirer ma participation » à l'organisatrice (C53). |
| Titre et description très longs, nom très long | Titre sur 4 lignes sur la couverture, nom d'organisatrice sur 2 lignes : tient sans débordement. |
| Publier sans titre | Toast émis SOUS la fenêtre (z 200 < 10001) : rien de visible (C65). |
| Clavier ouvert (simulé) | Champ actif visible, focus marqué. |
| Modifier | Ancien formulaire (C61). |
| Activité d'exemple | Bouton corail actif, refus honnête mais après coup (C66). |
| Grand écran 1440 | Fiche étirée sur toute la largeur (C69). |

## 4. Ce qui fonctionne et doit être conservé

- Le bloc « Le rendez-vous » (IRL-101) : quand, où (zone publique seulement), combien, en mots.
- Une seule action primaire corail, réservée au passage au réel.
- « Rejoindre la liste d'attente » annonce la conséquence avant le geste (IRL-120).
- Les refus du serveur sont relus et dits avec leur raison (ROB-02, IRL-05).
- « Événement annulé » remplace l'action (IRL-132) ; le pointage par position ou par code (IRL-133, IRL-147).
- Le QR d'accueil (IRL-146), l'affiche (IRL-150), la proposition d'inviter après création (IRL-149).
- « Créer une activité » UI-6A0 (IRL-160/161/162) : couverture d'abord, champs à 16 px, aperçu, garde contre le double envoi.

## 5. Constats détaillés

**P1**
- **IRL-C50** — Après « Je participe », le lien « Retirer ma participation » prend la place exacte du
  bouton (mesure `elementFromPoint` à (195, 800), m390) : un second appui désinscrit (IRL-110, 111).
  Après : la zone porte « Écrire aux participants », le retrait « Je ne peux plus venir » est à l'écart.
- **IRL-C51** — « Discussion indisponible hors connexion » en ligne : seul un gestionnaire crée la
  discussion (app-07:3850), donc personne n'y entre tant que l'organisateur ne l'a pas ouverte (IRL-112).
  `sensible` (règle d'appartenance à la conversation).
- **IRL-C65** — Les toasts émis pendant une fenêtre sont dessous (pile z 200, fenêtre z 10001) :
  « Publier » sans titre ne montre rien (IRL-163) ; idem code incorrect, note manquante, invitation.

**P2**
- **IRL-C52** — Calendrier, inviter, itinéraire relégués sous les commentaires (IRL-103, 110) ; prolonge PCS-C03.
- **IRL-C53** — L'organisatrice voit « Je participe / Retirer » sur sa propre activité ; outils dispersés (IRL-135, 136). `sensible`.
- **IRL-C54** — Refus « complète » : message et bouton se contredisent, compteur périmé (IRL-122).
- **IRL-C55** — « Sur liste d'attente » ne dit pas la suite (IRL-121).
- **IRL-C57** — Annulation discrète, rendez-vous inchangé (IRL-132).
- **IRL-C58** — Deux lignes « Adresse » contradictoires, lien de carte vers une ville (IRL-134). `sensible` (règle de révélation de l'adresse conservée).
- **IRL-C60** — Annuler / supprimer : style ordinaire, `confirm()` natifs (IRL-143, 180, 181).
- **IRL-C61** — Modifier rouvre l'ancien formulaire (IRL-164 vs IRL-160).
- **IRL-C63** — Avis, message groupé, invitations annoncés sans verdict (code : app-07:7692, 6930, 7473).
- **IRL-C66** — Activité d'exemple : refus seulement après le geste (IRL-170, 171).

**P3**
- **IRL-C56** — Passée : « 7 places restantes », tuile corail, double « Partager mon expérience » (IRL-130, 131).
- **IRL-C59** — Feuille à trois états mal mise en page, « file » / « liste » d'attente (IRL-140, 141).
- **IRL-C62** — Lexique : activité / événement / rencontre ; participer / venir / inscrit (prolonge PCS-C06).
- **IRL-C64** — Toasts posés sur le pied ; deux toasts pour un geste (IRL-121, 122).
- **IRL-C67** — Partager trois fois, deux barres de tri des commentaires, chips de 23 px (IRL-103).
- **IRL-C68** — Cibles de 29 px : Inviter, Ajouter (co-organisateurs), Noter ; « Plus d'options » 33 px.
- **IRL-C69** — Fiche étirée à 1 440 px (IRL-101 d1440).

Maquettes APRÈS (banc, `css`/`js`) : IRL-110 (pied après inscription), IRL-121 (liste d'attente),
IRL-122 (refus complète), IRL-130 (passée), IRL-132 (annulée), IRL-134 (lieu), IRL-135
(organisatrice), IRL-140 (feuille à trois états), IRL-143 (Gérer).

### Sensible
- IRL-C51 (entrée dans la discussion de groupe) et IRL-C53 (droits de l'organisation) touchent à
  des règles d'appartenance ; IRL-C58 à la révélation de l'adresse. Les propositions conservent les
  garde-fous existants (`can_join_event_conversation`, RLS, adresse réservée aux inscrits).
- Observation de banc, pas de défaut de sécurité : sur le faux serveur, l'adresse est lisible par
  tous (la RPC `adresses_activites` y est absente, le repli lit la colonne) ; en production elle
  reste réservée aux inscrits.

## 6. Cohérence avec le reste de l'application

- **Mots** : « Je participe » (fiche) / « Je viens » (feuille, cartes) / « + Rejoindre » (cartes) /
  « Inscrit », « Désinscrit » (toasts) ; « activité » (création UI-6A0) / « événement » (Gérer,
  Signaler, Album, Terminé, Modifier) / « rencontre » (affiche, filtres) ; « file » et « liste »
  d'attente ; « Mes événements » / « Mes rencontres » / « Mes activités ».
- **Couleurs** : pied primaire corail sur la fiche, mais « Partager mon expérience » en dégradé violet
  et « Publier l'activité » en dégradé violet — deux langages pour l'action principale.
- **Comportements** : confirmations de destruction par `confirm()` natif ici, alors que d'autres
  parcours ont des feuilles internes ; les messages éphémères passent sous les fenêtres (transverse).
- **Fermeture** : × en haut à droite ET « Fermer » en bas dans Gérer / Co-organisateurs / Liste d'attente.

## 7. Ce qui n'a pas pu être vérifié, et comment

- **Hors ligne** : `context.setOffline(true)` ne coupe pas le faux serveur (il répond par
  interception de route) ; l'inscription passe. À vérifier en mode avion sur appareil (IRL-184).
- **Rappels push** après inscription (IRL-183), **pointage par QR scanné** (IRL-185), **promotion
  vue par la personne promue** (IRL-186) : push, caméra, deux comptes.
- **Dialogues natifs** `confirm()` (IRL-180, 181) : non capturables, lus dans le code.
- **Liste d'attente côté organisatrice** (IRL-182), **admission 18+** (IRL-190), **proposer une
  rencontre depuis une conversation** (IRL-188), **lien profond visiteur** (IRL-192) : non rendus ici.
- **Artefact du banc (toasts)** : les captures sont prises avec `animations: "disabled"`, ce qui
  avance l'animation `toastOut` (2,6 s, `forwards`) à sa fin — un toast n'apparaît jamais sur une
  capture. Le scénario neutralise l'animation des seuls toasts (`.toast{animation:none}`) avant les
  gestes concernés, pour montrer ce que voit réellement la personne ; c'est dit dans les fiches.
- Le format de date « 11/17/2026 » des champs `date`/`time` vient de la langue du Chromium du banc
  (non jugé).

## 8. Compteurs

| | Nombre |
|---|---|
| Surfaces inventoriées | 50 |
| Observées (vrais gestes) | 20 |
| Simulées (fonction appelée, clavier) | 15 |
| Code seul | 10 |
| Inaccessibles | 3 |
| Sans objet (autre domaine) | 2 |
| Avec avant-après | 9 |
| Avant seul | 26 |
| Verdict « à conserver » | 9 |
| Verdict « à vérifier » | 9 |
| Constats | 20 — P0 : 0 · P1 : 3 · P2 : 10 · P3 : 7 |
