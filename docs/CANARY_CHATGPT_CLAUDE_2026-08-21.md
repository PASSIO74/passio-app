# Canari — transport ChatGPT → Claude Code (OAuth), 21 août 2026

Le transport **ChatGPT → GitHub → Claude Code** via l'abonnement OAuth a été exécuté
avec succès le **21 août 2026**.

- Déclencheur : issue #76 du dépôt `PASSIO74/passio-app`.
- Agent d'implémentation : Claude Code, exécuté par GitHub Actions sur l'abonnement
  Claude Pro (authentification OAuth, aucune clé API).
- Portée : **canari non applicatif**. Ce fichier de documentation est la seule
  modification ; aucun `js/app-*.js`, `styles.css`, `index.html`, `sw.js`, migration,
  fichier `dashboard/` ni configuration de production n'a été touché.
- Réversibilité : supprimer ce fichier suffit à annuler entièrement le changement.

Ce document n'a aucune conséquence sur le comportement de PASSIO ; il ne sert qu'à
attester que la chaîne d'exécution automatisée fonctionne de bout en bout
(spécification → branche → commit → pull request → retour sur l'issue).
