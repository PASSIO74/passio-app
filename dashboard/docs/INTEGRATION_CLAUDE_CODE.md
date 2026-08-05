# Intégration Claude Code

Le module **Assistant Claude Code** transforme un bug réel observé sur Passio en
un **contexte de diagnostic structuré**, puis permet soit de le copier dans Claude
Code, soit de lancer une analyse en direct via l'API Anthropic.

L'assistant **propose** ; il ne modifie **jamais** la production directement. Toute
correction suit le flux sécurisé décrit dans `SECURITE.md` (diff → validation →
branche → tests).

## Ce que contient le contexte généré

Construit par `server/claude.js` à partir du store + du dépôt Git :

- fiche du bug (titre, gravité, occurrences, utilisateurs/appareils/versions/écrans) ;
- message + **stack trace** ;
- **localisation** (fichier:ligne:fonction) déduite de la stack ;
- **extrait de code** autour de la ligne (lu dans le dépôt local, anti-traversal) ;
- **commits récents** touchant le fichier ;
- **chronologie** des derniers événements de la session ayant produit l'erreur ;
- l'attendu de la réponse (cause, fichiers, explication, patch `git diff`, tests, risques).

## Deux modes

### A. Mode manuel (aucune clé requise) — recommandé par défaut

`ANTHROPIC_API_KEY` absente : le dashboard **prépare le prompt**. Boutons :
« Construire le contexte » puis « Copier ». Colle-le dans une session Claude Code
sur le dépôt Passio. C'est le mode le plus sûr (aucune donnée ne quitte ta machine
au-delà de Supabase déjà utilisé).

### B. Analyse en direct (API Anthropic)

Renseigne dans `.env` :

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8
```

Le bouton « Analyser en direct » appelle `POST https://api.anthropic.com/v1/messages`
côté **backend** (la clé ne transite jamais par le navigateur) et affiche la réponse.

> L'appel est un adaptateur propre (`analyze()` dans `claude.js`). Aucune intégration
> n'est simulée : sans clé, la fonction l'indique explicitement et se limite au prompt.

## Du diagnostic à la correction (flux complet)

1. **Bugs & erreurs** → ouvrir une fiche → « Envoyer à Claude Code ».
2. L'assistant produit cause probable, fichiers, explication, **patch `git diff`**.
3. **Modifications Git** → coller le patch, nommer une branche, **cocher la
   confirmation**, « Créer la branche & appliquer » (hors production uniquement).
4. **Tests** → lancer la suite pertinente (liste blanche), vérifier le vert.
5. Revue humaine du diff, puis promotion manuelle (commit/push par tes soins).

Chaque étape (contexte Claude, création de branche, application de patch, tests)
est inscrite au **journal d'audit**.

## Étendre

- Brancher un webhook Slack/e-mail sur les alertes : voir `NOTIFY_SINKS` dans
  `server/alerts.js`.
- Ajouter des suites de test : `TEST_SUITES` dans `server/tests.js` (liste blanche).
