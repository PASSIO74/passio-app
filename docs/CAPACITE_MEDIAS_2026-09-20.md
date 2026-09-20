# Médias publics : économiser les téléchargements inutiles

Lot réalisé dans une branche isolée depuis `605b6e2`, sans action en production.
Objectif : ouvrir davantage de sessions à budget constant en évitant les vidéos
non regardées et en rendant effectives les préférences déjà affichées.
Implémentation : Codex ; revue indépendante : agent parent, à terminer avant fusion.
Risque normal côté interface ; aucune migration, modification Auth/RLS ou infrastructure.

## Comportement livré

- Fil et détail : bouton « Lire », aucune URL vidéo chargée avant ce geste.
- Bobines : seule la vidéo courante reçoit une source. Lecture automatique seulement
  si elle est autorisée et si le mode économie de données est désactivé.
- Stories : même politique ; le temps de lecture attend le démarrage de la vidéo.
- Profils personnel et visité : une image d'aperçu quand elle existe, sinon un bouton
  visuel de lecture. Plus de téléchargement vidéo pour fabriquer une miniature.
- Navigation, fermeture du détail/story/bobines et arrière-plan libèrent la source.
  Au retour d'arrière-plan le bouton Lire permet de reprendre volontairement.
- Les appels, lives et lecteurs de pièces jointes privées restent hors de ces helpers.
- Une préférence explicite reste prioritaire ; en son absence `navigator.connection.saveData`
  active le mode économe quand le navigateur fournit ce signal.

Le profil de préparation commun aux trois portes existantes (Studio, éditeur,
pièces jointes) passe à 720 pixels / 1,2 Mbit/s vidéo / 96 kbit/s audio au-delà de
2 Mio. Une source déjà plus petite est conservée. Exception : la conversion
WebM vers MP4, quand disponible, reste prioritaire pour la compatibilité.
Le repli existant sous 25 Mio et la borne de durée restent en place.
**Ces paramètres sont des cibles, pas des économies mesurées.**

## Mesures et tests

10 tests locaux `capacite-medias-publics.spec.js` passent : préférences, lecture
volontaire, sélection d'une bobine, libération des médias, navigation, fermeture,
course entre `play()` et arrière-plan, refus de grossissement, transcodage,
préservation d'un lecteur privé et requêtes réseau réelles sur fixture.

Mesure Chromium sur 30 copies d'une vidéo synthétique de 407 octets :

| À l'ouverture des Bobines | Renderer historique `605b6e2` | Après |
|---|---:|---:|
| Sources vidéo effectivement demandées | 30 | 1 |

Le renderer historique est conservé en fixture pour que cette mesure reste
reproductible même dans une copie Git sans historique. Le service worker est
désactivé dans ce test, car les fetch qu'il intercepte échappent à `page.route`.
Ce résultat mesure le nombre de ressources demandées pour ce parcours : il ne
prouve ni une baisse de 97 % du trafic total, ni un multiplicateur d'utilisateurs.

Mesure réelle complémentaire hors CI : bruit coloré animé pendant cinq secondes,
1920×1080, avec une piste sinus 440 Hz, créé par `canvas.captureStream` et
`MediaRecorder` dans Chromium. Le WebM brut produit une durée infinie : dans ce
premier essai le compresseur a utilisé son repli et **n'a rien économisé**
(20 415 080 → 20 415 080 octets). Le même fichier a ensuite été remuxé localement
avec FFmpeg, sans réencoder les images ni le son, pour inscrire sa durée.

| Mesure sur le WebM avec durée | Résultat |
|---|---:|
| Entrée | 20 415 219 octets, 1920×1080 |
| Sortie réelle | 5 692 773 octets, MP4, 720×406 |
| Réduction pour cette fixture | 72,1 % |
| Temps de préparation | 6 246 ms |
| Vidéo décodée | 5,718 s |
| Audio décodé | 2 canaux, 4,992 s, RMS 0,639 |

Les dimensions sont arrondies à des nombres pairs pour les encodeurs H.264.
« 720 » désigne le **grand côté**, pas une hauteur systématique de 720 pixels.
Le débit demandé n'est pas une taille garantie : cette sortie réelle est bien
plus lourde qu'un calcul naïf à partir du débit cible. Aucun de ces résultats
n'est une mesure de qualité perceptuelle ni un gain garanti sur les vidéos réelles.

Quatre mutations ont fait échouer leurs tests : préférences ignorées, sources de
toutes les bobines chargées d'avance, garde anti-grossissement retirée et contrôle
de la course d'arrière-plan retiré. Le code a été restauré après chaque mutation.

Les anciens cas vidéo du lot `capacite-sans-investir` et les 11 cas de liens
profonds Bobines passent. Le cas ancien de cache passions « la première visite
télécharge » a échoué indépendamment des médias (0 téléchargement observé).
Les audits globals, handlers, échappement, clés télémétrie, tests creux et isolation
sont verts. La vérification complète du socle est du ressort de l'intégration.

## Pilotage, limites et retour arrière

L'événement `video_preparee` contient les octets d'entrée et de sortie réellement
produits, et l'issue (`compression`, `original_plus_petit`, `transcodage`, `repli`,
`original`). Un événement par préparation ; aucun nom de fichier ni URL.
Le filtre PII existant accepte ces champs, vérifié par l'audit.

La qualité perceptuelle des nouvelles vidéos et la compatibilité Safari/iPhone
matériel ne sont pas démontrées par ces tests Chromium. L'arrêt au changement de
bobine remet la lecture au début au prochain passage. Sans poster, les grilles
affichent un repère de lecture à la place d'une première image téléchargée.

Retour arrière : révoquer le commit du lot, sans migration à annuler. Avant mise
en ligne : revue indépendante, vérifications d'intégration et contrôle visuel mobile.
