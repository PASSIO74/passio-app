# Registre de couverture — audit UX/UI PASSIO

> Généré par `outils/construire-galerie.js` le 2026-11-10 à partir de `donnees/domaines/*.json`. Version auditée : main @ 4e1d8ed1152867f309668a4a6847b8219d2f6622 (PR #820, 2026-11-10 14:08 UTC) — identique à la production (release.json : buildId 3d8e98bb12ad).
> Ne pas modifier à la main : corriger le fichier de domaine puis régénérer.

## Compteurs

| | Inventoriées | Observées | Simulées | Code seul | Inaccessibles | Sans objet | Avec capture AVANT | Maquettées (avant/après) | À améliorer | À conserver | À vérifier | Restant à examiner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Entrée et navigation | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Fil et interactions | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Recherche et découverte | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Profils et passions | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Création et médias | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Bobines et stories | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Rencontres IRL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Messagerie | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Partage | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Transverse | 3 | 2 | 0 | 0 | 1 | 0 | 2 | 1 | 1 | 1 | 1 | 1 |
| **Total** | 3 | 2 | 0 | 0 | 1 | 0 | 2 | 1 | 1 | 1 | 1 | 1 |

« Restant à examiner » = surfaces identifiées dans le code mais non rendues, ou non vérifiables dans le banc (véritable appareil, deux appareils, caméra, notifications poussées…). Elles ne sont PAS couvertes.

Statuts : `observe` = Observé dans le navigateur · `simule` = Simulé en environnement de test · `code` = Identifié dans le code, non observé · `inaccessible` = Inaccessible ou non vérifiable · `sans-objet` = Sans objet.

## Transverse

| ID | Surface | Sous-onglet / composant | État | Rôle utilisateur | Geste à effectuer | Preuve | Problèmes | Proposition | Visuel avant/après | Statut | Verdict — justification |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ZZZ-001 | Rencontrer | Liste d'activités | exemples | démo | Onglet Rencontrer | capture ZZZ-001 (m390, d1440) | ZZZ-C01 | Rendre inactif le bouton d'un exemple. | Avant / après | Observé dans le navigateur | À améliorer — Le bouton promet une action désactivée. |
| ZZZ-002 | Messages | Liste | exemples | démo | Onglet Messages | capture ZZZ-002 | — | — | Avant seul | Observé dans le navigateur | À conserver — Lisible. |
| ZZZ-003 | Appel vidéo | Appel en cours | connecté | connecté | Bouton d'appel | WebRTC : deux appareils requis | — | — | Avant non capturé | Inaccessible ou non vérifiable | À vérifier — Non vérifiable dans le banc. |

