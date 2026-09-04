# Clôture des sessions parallèles — 2026-09-04

Registre établi par la session « Consolidation et clôture des sessions »
(`session_01JhtPiYpLL9pjrCGhPgwFPr`), à la demande de Benjamin : tout
centraliser en une seule session, lister ce qui est en cours, finaliser,
afin d'ouvrir le bilan complet de l'application sur une table nette.

Méthode : pour chacune des 40 sessions distantes, on a relié la branche
d'issue à `main` (fusion à blanc `git merge-tree`, recherche de la PR
fermée, présence des symboles distinctifs dans `main`). Une branche dont
la fusion dans `main` ne change rien est **intégrée** ; une branche dont
la PR est fusionnée par écrasement (squash) l'est aussi, même si git la
compte « en avance ».

## État de `main` au départ

- Dernier commit : `9bb0e27` — « Réglages : ouvrir la liste des modèles
  autorisés et libérer les subagents (#274) ».
- Aucune PR ouverte. Neuf issues ouvertes, toutes datant d'août.
- Déploiement de #274 en cours à 08:44 UTC (gates dist, audits,
  gouvernance, suites production : verts ; six shards navigateur en cours).

## Travail EN COURS trouvé (trois sessions vivantes) — TOUT ATTERRI

| Session | Branche | Issue |
|---|---|---|
| Optimisation page recherche | `claude/search-page-optimization-l3byug` | fusionnée par sa session : **#275** (09:17 UTC) |
| Respect des sauts de ligne en biographie | `claude/biography-line-breaks-n5he02` | CI verte, fusionnée par la consolidation : **#277** (09:25 UTC) |
| Interface Filtre onglet Rencontrer | `claude/filtre-rencontrer-interface-xkqtnd` | rouge par verrou de concurrence, puis conflit `CLAUDE.md` avec #275/#277 ; fusion de `main` résolue (les deux fiches 20 gardées), 52 tests verts, CI verte, fusionnée par la consolidation : **#276** (09:50 UTC) |

Les trois sessions sont archivées. Plus aucune PR ouverte, plus aucune
session vivante en dehors de celle-ci.

## Travail ORPHELIN repris ici

- **`claude/passions-sport-display-fix-m4cys5`** (session « Passions
  sport affichage sélections », 2026-09-02, 75 tests verts, jamais
  fusionnée). Défaut rapporté par Benjamin : « je sélectionne Sport puis
  Vélo, le fil n'affiche que Sport ». Fusionnée dans cette branche, deux
  conflits résolus en gardant les deux camps (choix du visiteur en tête
  ET intérêts complets parente + spécialités).
- **`claude/monitor-sessions-p9lii1`** : rapport de surveillance
  `.passio/surveillance/NUIT_2026-09-02.md`, rapatrié tel quel.

## Travail SUPPLANTÉ (abandonné sans perte)

- **`claude/profile-passions-management-l02civ`** (« Gestion des passions
  du profil ») : même chantier que #265 (« Gérer mes passions », la bulle
  « + » quitte le rail), qui a gagné la course et est en production. La
  fiche 18 de `docs/lots-ui/` couvre le sujet. Branche laissée en l'état,
  session archivée.
- Sessions sans branche poussée : « Test avec Fable 5.1 »,
  « Fable 5.1 compatibility », « Centraliser les sessions actives »
  (2026-09-02, sa mission est en production).

## Sessions archivées par cette consolidation

Test avec Fable 5.1 · Onglets passion profil dysfonctionnels (#273) ·
Suppression des emojis dans les onglets (#266) · Fable 5.1 compatibility ·
Centraliser les sessions actives · Surveillance des sessions ·
Gestion des passions du profil · Passions sport affichage sélections ·
Respect des sauts de ligne en biographie (#277) · Optimisation page
recherche (#275) · Interface Filtre onglet Rencontrer (#276).

## Issues

Fermées comme **livrées** (le lot correspondant est en production et
documenté dans `docs/lots-ui/`) : #155 (UI-2), #161 (UI-3), #162 (UI-3A),
#165 (UI-4), #166 (UI-5), #175 (UI-2B multisélection).

Laissées ouvertes, **sans aucun travail en cours** — c'est du backlog pour
le bilan :

- #73 PERF-IOS : phase 2 livrée (#157) drapeau coupé, gain iPhone jamais
  mesuré ; phases 3 à 8 non démarrées.
- #69 Onboarding V2 solde : quatrième aide IRL toujours OFF (attend la
  preuve de la migration T&S en production), preuve d'activation non faite.
- #174 UI-6A0 couverture photo de l'activité : moteur présent, lot visuel
  jamais lancé.

## Branches distantes

237 branches sur `origin`. Toutes celles datées d'avant le 2026-09-02
portent une PR fermée et fusionnée par écrasement : leur « avance » sur
`main` n'est qu'un artefact du squash. Aucune n'a été supprimée par cette
consolidation (geste irréversible, hors mandat) ; un nettoyage des branches
de PR fusionnées est une tâche de ménage à part.
