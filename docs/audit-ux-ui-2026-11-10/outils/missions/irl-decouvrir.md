# Mission — RENCONTRES IRL : DÉCOUVRIR (LISTE, CARTE, FILTRE)

- Clé de domaine : `irl-decouvrir` · Groupe : `Rencontres IRL`
- Identifiants : surfaces `IRL-001` à `IRL-099` ; constats `IRL-C01` à `IRL-C49`
- Un autre auditeur traite la FICHE d'activité, l'inscription, la création et la gestion (clé
  `irl-fiche`) : arrête-toi à la porte de la fiche (tu peux la montrer ouverte, sans l'auditer).

## Périmètre

- Écran « Rencontrer » (`#screen-irl`) : titre, recherche d'activité ou de ville, bascule
  Liste · Carte · Filtre (`js/ui-v4a3-vue.js`), en-tête (`js/ui-v4a0-tete.js`), intentions
  (`js/ui-v4a1-intentions.js`), outils (`js/ui-v4a4-outils.js`).
- Liste : carte d'activité (`js/ui-v4a2-cartes.js`) — vignette, titre long, passion, date relative
  (« Aujourd'hui · 18:30 »), ville, distance, places restantes, prix, état (exemple, complète,
  annulée, passée, la mienne, j'y vais), boutons « Détails » / « Je viens » (couleur corail :
  réservée au passage au réel — est-ce cohérent ici ?), exemples « participation désactivée » avec
  un bouton d'inscription actif, tri, pagination, liste vide, aucun résultat, chargement, erreur.
- Carte (`js/map-loader.js`, MapLibre + OpenFreeMap) : chargement, marqueurs, regroupements,
  sélection d'un marqueur, aperçu, recentrage, géolocalisation accordée / refusée
  (`contexte.permissions`, `contexte.geolocation`), carte sans activité, tuiles lentes ou en échec
  (bloquer `tiles.openfreemap.org` par une route), gestes (zoom, déplacement), lien liste ↔ carte.
- Filtre (`js/ui-v4a5-filtres.js`, fiche lots-ui 20 « Page Filtre ») : Quand ? (cases, calendrier
  `openIrlCalendar` app-07:2439), Où ? (ville `openIrlCitySelector` app-07:1374, distance, villes
  récentes), Quelles passions ? (`ouvrirRecherchePassionIRL`), Horaire (`openIrlTimePicker`),
  « Mes événements | Mes rencontres », pied fixe avec le nombre de résultats, réinitialisation,
  pastille « filtre actif », filtres combinés sans résultat, conservation des filtres au retour.
- Localisation et distance : demande de permission, refus, ville saisie à la main, géocodage
  (BAN / Photon), unité, « près de moi ».
- Entrées depuis ailleurs : bouton « Trouver une activité » du fil, feuille « Trouver une
  expérience » (`js/ui-v3-passerelle.js`), lien profond `#irl-event-…`.

## Points d'entrée dans le code

`js/app-07-ia-explore-irl.js` (`renderIRL`, `_filterIrlEvents`, sélecteurs ci-dessus),
`js/ui-v4a0-tete.js`, `ui-v4a1-intentions.js`, `ui-v4a2-cartes.js`, `ui-v4a3-vue.js`,
`ui-v4a4-outils.js`, `ui-v4a5-filtres.js`, `js/map-loader.js`, `js/ui-v3-passerelle.js`,
`styles.css` (le bloc UI-4A5 est le dernier). Fiches : `docs/lots-ui/` 01, 04, 06, 20 (les DEUX
fiches 20), `docs/PIEGES_CONNUS.md` (IRL, cartes/géocodage),
`tests/e2e/audit-2026-11-parcours-contenu-irl.spec.js` (semis d'événements sur le faux serveur).
Données fictives dans `outils/jeu/irl-decouvrir.js` (table `events`, colonnes publiques
`_EVENT_COLS_PUBLIC` dans app-08 ~6160) : 0, quelques-unes et 40+ activités, plusieurs villes et
passions, avec coordonnées, aujourd'hui / ce week-end / plus tard, complètes, annulées, payantes.
