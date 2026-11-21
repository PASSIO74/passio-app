# Prototypes interactifs — comment ils sont faits

Un prototype est **une page HTML autonome** : elle s'ouvre par double-clic, ne joint aucun serveur,
ne contient aucune donnée réelle et ne modifie pas l'application. Elle montre l'ENCHAÎNEMENT proposé
pour un parcours majeur, écran par écran, avec un parcours guidé qui renvoie aux constats.

## Fidélité

- La page charge `kit/passio-styles.css`, **instantané de `styles.css` au commit audité**
  (`main@4e1d8ed1`), et les polices du produit (`kit/fonts/`). Les écrans portent donc les vraies
  classes et les vraies variables : ce qui est montré est réalisable avec la feuille actuelle, plus
  le petit bloc `<style>` propre au prototype — qui contient TOUTE la proposition, lisible d'un coup.
- Le balisage de départ est **extrait de l'application réelle** dans le banc isolé
  (`outils/sondes/_extraire-html.js`), puis réduit au nécessaire et modifié selon la proposition.
- `<html>` porte les classes de l'application en production :
  `passio-flat-passions passio-ui-v2 passio-ui-3 passio-ui-4b passio-ui-4a0 passio-ui-4a1 passio-ui-4a2 passio-ui-4a3 passio-ui-5 passio-ui-4a4 passio-ui-4a5 passio-ui-6 passio-ui-6a passio-ui-6b passio-ui-6c passio-ui-7`
  **plus** `proto-page` (cadre du prototype).
- Le téléphone (`.proto-telephone`, 390 × 844) est le bloc conteneur des éléments `position: fixed`
  de l'application : une feuille basse ou une modale reste DANS le cadre.

## Squelette

```html
<!doctype html>
<html lang="fr" class="proto-page passio-flat-passions passio-ui-v2 passio-ui-3 passio-ui-4b passio-ui-4a0 passio-ui-4a1 passio-ui-4a2 passio-ui-4a3 passio-ui-5 passio-ui-4a4 passio-ui-4a5 passio-ui-6 passio-ui-6a passio-ui-6b passio-ui-6c passio-ui-7">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prototype — … (audit UX/UI PASSIO)</title>
  <link rel="stylesheet" href="kit/passio-styles.css">
  <link rel="stylesheet" href="kit/kit.css">
  <style>/* LA PROPOSITION : uniquement ce qui change par rapport à l'application. */</style>
</head>
<body>
  <aside class="proto-notes">
    <span class="proto-surtitre">Prototype · proposition</span>
    <h1>Titre du parcours</h1>
    <p>Ce que le parcours démontre, en deux phrases.</p>
    <p class="proto-avis">Maquette interactive : rien n'est envoyé, rien n'est enregistré. Données fictives.</p>
    <ol class="proto-etapes"></ol>
    <div class="proto-commandes">
      <button type="button" data-proto="precedent">Étape précédente</button>
      <button type="button" class="principal" data-proto="suivant">Commencer le parcours</button>
      <button type="button" data-proto="zones" aria-pressed="false">Montrer les zones cliquables</button>
      <button type="button" data-proto="recommencer">Recommencer</button>
    </div>
    <p class="proto-legende">Flèches ← → : étape précédente / suivante. Le cadre corail désigne l'élément dont parle l'étape. On peut aussi cliquer librement dans le téléphone.</p>
    <a class="proto-retour" href="../galerie/index.html#/prototypes">← Retour à la galerie</a>
  </aside>
  <div class="proto-scene">
    <span class="proto-etiquette">Après · maquette interactive</span>
    <div class="proto-telephone">
      <section data-ecran="fil"> … <div class="proto-defile"> contenu défilant </div> … </section>
      <section data-ecran="conversation"> … </section>
      <div data-couche="partage"> feuille basse, menu ou modale </div>
    </div>
  </div>
  <script type="application/json" id="proto-parcours">[
    { "titre": "…", "note": "Ce que la personne voit et fait ; ce qui change par rapport à aujourd'hui.", "ecran": "fil", "cible": "#idCible", "refs": "FIL-C03 · PAR-C01" }
  ]</script>
  <script src="kit/kit.js"></script>
  <script>/* PROTO.actions.nom = function (el) { … } pour les micro-interactions (envoi, vocal, bascule). */</script>
</body>
</html>
```

Attributs compris par `kit/kit.js` : `data-ecran`, `data-couche`, `data-aller="écran"`,
`data-ouvrir="couche"`, `data-fermer="couche"` (ou `*`), `data-action="nom"`,
`data-etat="clé:valeur"` (pose `document.body.dataset`), et pour une étape : `ecran`, `couches`,
`cible` (sélecteur CSS), `etat`, `refs`. Fonctions : `PROTO.ecran(nom)`, `PROTO.couche(nom, bool)`,
`PROTO.fermerCouches()`, `PROTO.viser(sel)`, `PROTO.allerEtape(i)`, crochets `PROTO.surEtape`,
`PROTO.avantEtape`, `PROTO.surEcran`.

## Règles

- Chaque étape du parcours cite les constats qu'elle traite (`refs`).
- Ne montrer que des fonctions qui EXISTENT dans l'application auditée, réorganisées ou clarifiées.
  Une nouveauté réelle (rare) est signalée dans la note de l'étape par « nouveau ».
- Cibles ≥ 44 px, champs ≥ 16 px, contrastes AA, focus visible, noms accessibles — le prototype doit
  lui-même respecter ce que l'audit demande.
- Aucun `onclick` vers une fonction de l'application : les fragments extraits sont nettoyés de leurs
  gestionnaires (`onclick`, `onerror`…), remplacés par les attributs `data-*` du kit.
- Images : uniquement les médias fictifs du banc, copiés dans `prototypes/medias/`, ou des aplats.
- Chaque prototype a sa fiche `donnees/prototypes/<nom>.json` :
  `{ "ordre": 1, "fichier": "prototypes/<nom>.html", "titre": "…", "description": "…", "constats": ["XXX-C01"] }`.
- Avant de rendre : ouvrir la page dans le navigateur du banc (Playwright, `file:///…`), dérouler
  TOUTES les étapes, regarder une image de chaque étape, vérifier qu'aucune erreur n'apparaît en console.
