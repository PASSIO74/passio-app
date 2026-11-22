# Mission — RECHERCHE ET DÉCOUVERTE

- Clé de domaine : `recherche` · Groupe : `Recherche et découverte`
- Identifiants : surfaces `REC-001…` ; constats `REC-C01…`
- Hors périmètre : la recherche d'activités de l'écran Rencontrer (`irl-decouvrir`), la recherche
  de conversations (`msg-liste`), le profil visité lui-même (`profils`).

## Périmètre

- Écran « Rechercher » (`#screen-explore`, loupe de la barre supérieure, `index.html` l.965–1016,
  fiche lots-ui 20 « Page Rechercher ») : champ de recherche (libellé, bouton « OK », clavier
  `type="search"` / `enterkeyhint`, effacement, recherche à la frappe ou à la validation ?),
  ce qui est cherchable RÉELLEMENT (passions ? personnes ? contenus ? — établis-le par le code et
  l'essai, ne suppose rien), suggestions, tendances, grille des passions (aperçu parmi 5 001,
  compteur `#explorePassionsCount`), profils suggérés (`#suggestedCreators`, `discoverPeople`),
  résultats (passions, personnes), surlignage, aucun résultat (que propose l'écran ?), chargement
  du référentiel (568 Ko à l'ouverture : état d'attente ?), hors ligne (`PassioPassions.horsLigne`),
  fautes de frappe et accents, requête très longue, retour avec conservation de la requête.
- Fiche d'une passion (`openPassionExplorer` app-07:330) : en-tête, description, publications,
  créateurs (`#pexCreators`), activités liées, « Ajouter à mes passions » / suivre la passion,
  bouton de partage (porte seulement), passion personnalisée, passion sans contenu, retour.
- Création d'une passion personnalisée depuis la recherche
  (`openCreateCustomPassionFromExplorer` app-06:5794) : champs, doublon refusé, modération.
- Suivre depuis un résultat (trois surfaces portent `data-follow-uid` : restent-elles synchrones ?),
  passage vers une interaction (profil → message, passion → publications → activité).
- Assistant / « IA » (`js/app-07-ia-explore-irl.js`, `passio_ai_history`,
  `docs/EDGE_FUNCTION_ASK_AI.md`) : existe-t-il encore une porte visible ? Dis-le précisément
  (actif, masqué, code mort) sans le présenter comme une fonction si elle n'est pas atteignable.
- Feuille « Trouver une expérience » (`#v3PassioSheet`, `js/ui-v3-passerelle.js`) et sélecteur de
  passions partagé (`js/passion-selector.js`, « composant unique des 7 surfaces ») : inventorie ses
  occurrences et vérifie leur cohérence.
- Le parcours « Découvrir » mène-t-il à « Rencontrer » ? (présence d'activités dans les résultats
  et sur la fiche passion).

## Points d'entrée dans le code

`js/app-07-ia-explore-irl.js` (explore ~1–1370), `js/passions-flat.js`, `js/passions-flat-ui.js`,
`js/passion-selector.js`, `js/ui-v3-passerelle.js`, `js/app-06-reels-partage.js` (~5794),
`js/app-08-ui-modals-tour.js` (`supaSearchUsers` ~6477, profils ~5568, 8021–8100), `styles.css`.
Fiches : `docs/lots-ui/20-PAGE-RECHERCHER-REFERENTIEL-2026-09-03.md`,
`docs/PASSIONS_REFERENTIEL_PLAT_2026-09-01.md`, `docs/journal/passions-fil.md`,
`docs/PASSIO_SEARCH_DISCOVERY_V2_2026-08-20.md`, `tests/e2e/recherche-referentiel.spec.js`.
Le référentiel des passions est servi par le banc depuis `data/passions-v1.json` (miroir).
