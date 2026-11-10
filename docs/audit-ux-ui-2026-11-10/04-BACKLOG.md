# Backlog priorisé — audit UX/UI PASSIO

> Généré par `outils/construire-galerie.js` le 2026-11-10. Version auditée : main @ 4e1d8ed1152867f309668a4a6847b8219d2f6622 (PR #820, 2026-11-10 14:08 UTC) — identique à la production (release.json : buildId 3d8e98bb12ad).
> Priorité (P0–P3), gravité du problème (1–4), risque technique du changement et effort sont QUATRE notions séparées. Aucun gain chiffré n'est un résultat mesuré.

| Priorité | Constats |
|---|---|
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |
| P3 | 0 |

## Vue d'ensemble

| ID | Priorité | Gravité | Nature | Type | Effort | Risque technique | Domaine | Constat |
|---|---|---|---|---|---|---|---|---|
| ZZZ-C01 | P1 | 3 | clarte | observation | S | faible | Transverse | Le bouton « Je viens » d'un exemple paraît actif |

## P1 — friction importante sur un parcours essentiel

### ZZZ-C01 — Le bouton « Je viens » d'un exemple paraît actif

- **Emplacement** : Rencontrer › carte d'exemple
- **Domaine** : Transverse · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture ZZZ-001.
- **Problème** : Le bouton plein promet une inscription.
- **Situation déclenchante** : Carte marquée « Exemple PASSIO · participation désactivée ».
- **Conséquence pour l'utilisateur** : Un appui ne produit pas l'inscription attendue.
- **Proposition** : Bouton visiblement inactif ou remplacé.
- **Visuels** : [ZZZ-001](galerie/index.html#/surface/ZZZ-001) · **Surfaces** : ZZZ-001
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Un exemple n'affiche aucun bouton plein d'inscription.
- **Fichiers probables** : `styles.css`
