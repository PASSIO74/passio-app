# 06 — Risques résiduels, surfaces non vérifiées, récupération (2026-11-10)

> « Non testé » n'est pas « validé ». Ce fichier dit ce qui reste ouvert APRÈS les trois PR de cette mission, ce qui
> n'a pas pu être regardé, et comment on revient en arrière. Le registre structuré `.passio/residus/registre-residus.json`
> (RES-01…17, daté du 01/11) **n'a pas été mis à jour par cette mission** : son gate est strict et chaque entrée
> demande ses quatre états — c'est la première tâche de la suite, pas un oubli silencieux.

## 1. Ouvert après cette mission

| Rang | Risque | Pourquoi il reste | Prochaine action |
|---|---|---|---|
| 1 | **CLI-01 n'est fermé que côté client, et seulement une fois #823 fusionnée et déployée.** La base accepte toujours la forme en cause. | Aucune migration n'est autorisée par ce mandat. | Fusionner #823 ; préparer la migration de durcissement (forme du pseudo, éléments de `co_organizers`), avec banc et retour arrière. |
| 2 | **PIL-01** : le pilotage en ligne tient à un facteur, sur l'origine de l'application. | Second facteur suspendu le 08/11 (#793), par décision. | Décider : remettre le second facteur, ou sortir le pilotage de l'origine publique. |
| 3 | **ETAT-01, ETAT-02, ETAT-03** : état plus ancien qui écrase un plus récent ; déconnexion globale invisible ; succès annoncé sur le profil. | Lots critiques (authentification, données du compte), non revérifiés par le coordinateur. | Relire chaque chemin, écrire le verrou, corriger par lots séparés, contre-revue. |
| 4 | **STAB-04 / STAB-05** : comptes privés par défaut ; 35 publications masquées. | Décisions de l'éditeur, données de production. | Trancher ; si STAB-05 n'est pas voulu, préparer le geste de données. |
| 5 | **Succès annoncés sans écriture** : SRV-03, SRV-04, ETAT-04, ETAT-09, PARC-01. | Corrections client + policies à préparer. | Un lot « verdicts » côté client ; les policies en migration. |
| 6 | **SRV-02, SRV-08, PIL-02** : contrôles serveur manquants (détail au dossier privé). | Migrations. | À préparer avec leur banc ; contre-revue. |
| 7 | **STAB-10 / EXPL-03** : la page minifiée n'est pas testée avant de partir. **Corrigé (#868)** : testée par « Gates artefact », et le déploiement refuse un artefact d'une autre empreinte. | `.github/` est critique. | Un job qui teste l'artefact final et que le déploiement publie tel quel. |
| 8 | **EXPL-01, EXPL-02, EXPL-05** : déchiffrement des archives jamais éprouvé ; échec de sauvegarde lu « ok » ; retour arrière non rejoué depuis le 14/09. | Demandent la clé privée, un créneau, une heure creuse. | Les trois exercices, datés et consignés. |
| 9 | **Capacité** : aucune mesure pour le code servi ; L (10 000 / 500) ne tient pas en calcul. | Aucun banc autorisé d'ici. | Rejouer le banc sur le staging avec le protocole du rapport PERF § 2.7. |

## 2. Anciens risques revérifiés (statut du 10/11)

| Statut | Risques |
|---|---|
| **Corrigés** (catalogue de production) | R36, R39, R40, C-03, C-09, C-10, R33 (sans objet), B-07, F-03 à F-07, D-03 |
| **Largement levés** | R14 (aucun secret dans l'historique complet, deux balayages indépendants), R13 (débit plafonné ; le ménage reste), R28, R29 |
| **Toujours présents** | R1, R4, R10, R18 (en partie), R19 (cause d'ETAT-02), R20, R27, R30, R32, R34, R42, C-07, R9 (MapLibre 4.7.1, contrôle vulnérable non utilisé), R17 (documents d'affaires dans l'historique) |
| **Non reproduits** | R15 / R23 (rouges locaux) : avec le Chromium épinglé, les seuls rouges locaux sont des rouges de charge du poste, verts une fois rejoués seuls |
| **Non revérifiés** | R35, C-13, E-04, E-06, E-07 |

## 3. Surfaces non vérifiées — et pourquoi

| Surface | Raison | Ce qu'il faudrait |
|---|---|---|
| Isolation sous rôle réel en production, au-delà d'`authz-critical` | `SET ROLE` refusé au canal ① ; les suites à comptes réels visent le staging | une passe `confidentialite` + `blocage-acces` + `multi-comptes` contre la production, comptes jetables purgés |
| Égalité staging ↔ production | aucun canal vers le staging | comparer les empreintes de `pg_policies`, `pg_proc`, `pg_trigger` des deux projets à chaque migration |
| Révocation en cours de session temps réel | se juge côté service | deux comptes sur le staging |
| Réglages Supabase Auth, Realtime, PostgREST ; quotas et facturation ; Netlify ; Brevo ; Cloudflare | hors catalogue, aucun accès console | lecture des consoles |
| Appareils réels (iPhone, Android, navigateurs intégrés) | aucun | les 14 manipulations du rapport PWA |
| Délivrabilité d'une inscription réelle | aucun envoi | une inscription sur une boîte neuve, en-têtes `dkim=pass` |
| Restauration et retour arrière récents ; déchiffrement d'archive | non exercés par cette mission | voir rang 8 |
| Charge | interdite en production, staging hors d'atteinte | voir rang 9 |
| Validation juridique (CGU, confidentialité, sous-traitants, durées) | hors compétence | juriste / DPO |
| Les findings `agent` du registre | analyse statique non rejouée | relecture du chemin avant chaque correction |
| La suite complète sur la réplique exacte de la production | préparée, non lancée | `outils/servir-exact.mjs` + `PASSIO_PORT` |

## 4. Récupération — pour les changements de cette mission

| Changement | Retour arrière | Effet sur les données | Éprouvé ? |
|---|---|---|---|
| #822, #823, #824 | `git revert` du commit de fusion, ou `npm run rollback:netlify` vers le déploiement précédent | aucun : pas de migration, pas d'écriture | le `revert` est trivial ; **le retour arrière Netlify n'a pas été rejoué en réel depuis le 14/09** (EXPL-05) |
| Documents de l'audit | suppression du dossier | aucun | — |

Procédures existantes, relues mais non exercées : `docs/ROLLBACK_DISTANT.md`, `docs/RECUPERATION.md`, `docs/INCIDENTS.md`
(non adopté : ni responsable ni suppléant nommés — EXPL-07).
