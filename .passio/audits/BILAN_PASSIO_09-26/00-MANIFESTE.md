# BILAN PASSIO 09/26 — Manifeste de l'audit

> Dossier documentaire du projet « BILAN PASSIO 09/26 » : déterminer, avec des preuves, si PASSIO est prête à être commercialisée à grande échelle, ce qui doit être corrigé, et quelle capacité réelle l'application peut supporter. Ce manifeste fige l'objet audité ; les rapports numérotés qui suivent en dépendent tous.

## 1. Identité de l'audit

| Élément | Valeur |
|---|---|
| Projet | BILAN PASSIO 09/26 |
| Date de l'audit | 2026-09-04 (démarré 12:29 UTC) |
| Auditeur | Claude Code, modèle **Claude Fable 5.1** (`claude-fable-5-1`) |
| Vérification du modèle | `get_session` : `configured_model = claude-fable-5-1`, `session_context.model = claude-fable-5-1`, `external_metadata.last_served_model = claude-fable-5-1`, `effort_level = xhigh`. Aucune substitution observée. |
| Sous-agents | Lancés avec `model: 'claude-fable-5-1'` explicite ; le transcript de la sonde préalable porte `"model":"claude-fable-5-1"` (`subagents/workflows/wf_73b979b6-705`). |
| Session | `session_01NEc7rnktuj6ZUS6weGb5nm` |
| Contre-revue prévue | GPT-6 Astra dans Codex, sur le **même SHA** (voir §7) |

## 2. Objet audité (figé)

| Élément | Valeur |
|---|---|
| Dépôt | `PASSIO74/passio-app` (GitHub), **visibilité : public** |
| Branche de référence | `main` |
| **SHA audité** | `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` |
| Commit | « Clôture des sessions parallèles : la spécialité choisie entre dans le fil, et le registre du 2026-09-04 (#278) », 2026-09-04 12:07:03 +0200, auteur PASSIO74 |
| Branche documentaire | `audit/bilan-passio-09-26-fable51`, créée sur ce SHA (aucune modification de code applicatif) |
| CI sur ce SHA | Workflow « CI & Deploy », run n° 2494, id `33861671142` — https://github.com/PASSIO74/passio-app/actions/runs/33861671142 |
| Jobs du run | 13 jobs, **tous `success`** (Gouvernance critique · Audits statiques et bancs serveur · Suites navigateur 1/6 → 6/6 · Suites production (comptes réels) · Gates artefact production (dist) · Tests smoke · Déploiement production) ; « Déploiement preview (PR) » `skipped` (normal sur un push `main`) |
| Déploiement production | Job « Déploiement production » vert : build dist, minification, `netlify-cli@27.1.2 deploy --prod --dir dist`, terminé le 2026-09-04 à 10:44:08 UTC |
| **SHA de production** | `c8cb8e99…` — **CONFORME PAR INSPECTION** (déduit du job de déploiement vert sur ce SHA ; aucun run « CI & Deploy » plus récent sur `main` au moment du gel). La vérification directe du site https://passio-app.netlify.app est **BLOQUÉE** : le proxy réseau de l'environnement d'audit refuse toute sortie vers `netlify.app` (HTTP 403 `CONNECT`, confirmé par `curl` et par l'outil de lecture web). Ce qu'il faudrait : un `curl -sI https://passio-app.netlify.app/release.json` depuis un poste hors de ce bac à sable. |
| Sentinelle distante | Run « Sentinelle distante » n° 165 (id `33867469764`) `success` sur ce même SHA à 11:28 UTC |

## 3. Environnement d'audit

| Élément | Valeur |
|---|---|
| Machine | Conteneur cloud isolé (Anthropic), Linux 6.18, **4 CPU**, 15 Go RAM, 30 Go libres |
| Navigateur | Chromium (Playwright 1.60.0) — **seul navigateur disponible**. Jusqu'à 14:50 UTC seule la révision 1194 était présente (la 1223 attendue par `@playwright/test` 1.60 manquait : les sous-agents ont utilisé une configuration d'enveloppe avec `executablePath`) ; un pont posé à la reprise de session a ensuite rendu `npx playwright test` utilisable sans surcharge (`chromium_headless_shell-1223`, Chromium 141). WebKit/Safari, Firefox, Edge, Samsung Internet : non installables. Toute mesure navigateur est une **émulation** ; aucun appareil réel. |
| Réseau sortant | Proxy avec liste d'autorisation : GitHub, Supabase (via connecteur), registres npm OK ; **netlify.app bloqué** ; tuiles de carte et géocodage probablement bloqués (voir rapports 04 et 07). |
| Accès base | Connecteur `supabase-passio-readonly` (lecture seule, `transaction_read_only`). Aucune écriture, aucune migration, aucun compte créé. |
| Accès GitHub | Outils GitHub de la plateforme, compte `PASSIO74` (admin). Utilisés pour lire, créer l'issue, la branche et la PR brouillon — rien d'autre. Le plugin `plugin:github:github` n'a jamais pu se connecter (hôte `api.githubcopilot.com` hors liste blanche du proxy) ; les journaux de jobs Actions sont restés inaccessibles (403). |
| Dépendances | `npm ci` (56 paquets), `npm run verif` vert (1,2 s), `dashboard/npm ci` par le sous-agent pilotage. |

## 4. Artefacts de l'audit

| Artefact | Référence |
|---|---|
| Issue | https://github.com/PASSIO74/passio-app/issues/279 — « [AUDIT] BILAN PASSIO 09/26 » (créée par cet audit : aucune issue homonyme n'existait) |
| Branche | `audit/bilan-passio-09-26-fable51` (créée : n'existait pas ; 238 branches distantes examinées, aucune branche d'audit homonyme) |
| PR brouillon | https://github.com/PASSIO74/passio-app/pull/280 — rapports et preuves uniquement, commits `[skip ci]` (une CI sur cette branche déploierait une preview Netlify et créerait des comptes de test en production, ce que l'ordre interdit) |
| Dossier | `.passio/audits/BILAN_PASSIO_09-26/` (ce dossier) + `preuves/` |
| Index des audits | `.passio/audits/README.md` (entrée ajoutée) |

Aucun doublon créé : recherche préalable des issues (« AUDIT BILAN PASSIO 09/26 », « audit bilan commercialisation readiness » → 0 résultat), des PR ouvertes (0), des branches (`audit/*`, `*bilan*` → 0).

Note sur la branche : la session a été ouverte par la plateforme sur `claude/bilan-passio-audit-fable51-yg7q8z` ; l'ordre de mission nomme explicitement `audit/bilan-passio-09-26-fable51`. C'est cette dernière qui porte le dossier, conformément à l'ordre ; aucune branche miroir n'a été créée.

## 5. Règles respectées pendant cette phase

- Aucun correctif, aucune modification du code de l'application (`index.html`, `js/`, `styles.css`, `sw.js`, `tests/`, `scripts/`, `migrations/`, `dashboard/`, `supabase/` : intacts — vérifiable par `git diff c8cb8e9 -- . ':!.passio/audits/BILAN_PASSIO_09-26' ':!.passio/audits/README.md'`, vide).
- Aucune PR fusionnée, aucun déploiement, aucun push sur `main`.
- Aucun test de charge sur la production ; les mesures de performance sont faites sur le serveur statique local.
- Aucune donnée réelle modifiée ou supprimée ; base en lecture seule.
- Aucun secret ni contenu privé recopié dans ce dossier (emplacements cités, jamais les valeurs).
- Les sous-agents ont reçu ces règles par écrit (`CONTEXTE_AUDIT.md`, reproduit dans `preuves/`) et terminent par un `git status` vide.

## 6. Méthode

1. Reconnaissance : état GitHub (issues, branches, PR, runs), état Supabase (tables, policies, advisors, volumes), `npm run verif`.
2. Audit en éventail : 16 domaines confiés à 16 sous-agents Fable 5.1 en lecture seule (chaque domaine relancé jusqu'à trois fois après épuisement des crédits de session ; sept domaines — irl, profils-passions, auth-rgpd, robustesse-pannes, perf-capacite-couts, appareils-a11y et, avant que sa troisième tentative n'aboutisse, exploitation-continuite — ont été reconstitués par l'orchestrateur à partir des preuves déposées par leurs sous-agents, ce que chaque rapport concerné signale en tête de domaine) (cartographie ; UX/onboarding ; contenu ; messagerie/notifications ; IRL ; profils/passions ; modération ; auth/RGPD ; Supabase/isolation ; code/nettoyage ; performance/capacité/coûts ; Centre de pilotage/Sentinelle ; appareils/accessibilité ; robustesse/pannes ; exploitation/continuité ; tests/CI), chacun rendant des contrôles statués et des problèmes au format complet.
3. Relecture adversariale : chaque problème est attaqué par des relecteurs indépendants (angles reproduction et impact/priorité pour les P0/P1 ; reproduction pour les P2/P3 ; l'angle contexte/doublons a été appliqué aux premiers domaines puis retiré pour économiser les crédits). 111 problèmes relus, 75 non relus (crédits épuisés). Un problème réfuté par la majorité est conservé dans le rapport avec son verdict, jamais effacé.
4. Tests : `npm run verif` vert ; suites Playwright **ciblées** par domaine pendant l'audit (~650 tests) ; **une seule suite complète** locale à la fin (`npx playwright test --project=local --workers=3`, 1 103 tests — résultat dans `01-SYNTHESE-BENJAMIN.md` §Suite complète et `preuves/suite-complete/`).
5. Rédaction : rapports 01 à 14 (01 synthèse · 02 cartographie · 03 UX/onboarding · 04 fonctionnel · 05 code · 06 sécurité/données · 07 performance/capacité/coûts · 08 pilotage/Sentinelle · 09 appareils/accessibilité · 10 modération/IRL/support/exploitation · 11 registre des risques · 12 verdict · 13 preuves nécessaires · 14 couverture du mandat), `donnees/` (sorties structurées des 16 domaines, votes des relecteurs, registre JSON), `outillage/` (scripts d'orchestration).

Vocabulaire des statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE. Priorités : P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future. Méthode de chaque contrôle : appareil réel (jamais ici) · émulation · inspection code · requête base · test exécuté · non réalisé.

## 7. Transmission à la contre-revue (GPT-6 Astra, Codex)

À transmettre tel quel : le SHA `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf`, ce dossier, et l'issue #279. Le relecteur n'a besoin d'aucun accès à la production : tous les constats sont ancrés dans le dépôt à ce SHA ou dans des sorties de requêtes reproduites ici (sans données personnelles). Les contrôles BLOQUÉS (rapport 13) lui sont signalés pour qu'il ne les prenne pas pour des verts.

## 8. Audit différentiel — changements de l'application pendant le bilan

`git fetch origin main` à 20:32 UTC : `git rev-list --count c8cb8e9..origin/main` = **0**. Aucun commit, aucune PR fusionnée, aucune branche nouvelle de Benjamin pendant le bilan (dernière branche de travail antérieure au gel : `claude/consolidate-close-sessions-shbepm`, 09:51 UTC). **Aucun audit différentiel n'est nécessaire** ; la contre-revue peut se faire sur `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` sans réserve.

## 9. Déroulement et interruptions

- 12:29 UTC : gel du SHA, manifeste, issue #279, branche, PR #280.
- 12:44 → 14:40 : première vague de 16 sous-agents ; limite de session atteinte (reprise à 14:40).
- 14:40 → 19:40 : deuxième vague et relectures ; limite atteinte de nouveau (reprise à 19:40).
- 19:40 → 19:55 : troisième vague pour les 7 domaines manquants et 24 relectures ; « out of usage credits » à 19:55 — six domaines interrompus définitivement, un (exploitation-continuite) achevé à 20:33.
- 20:00 → fin : reconstitution des six domaines par l'orchestrateur, rapports, suite complète, commit et restitution.

Aucune donnée n'a été inventée pour combler une interruption : chaque contrôle et chaque problème d'un domaine reconstitué cite un fichier de `preuves/` ou une ligne du code au SHA audité, et le rapport le dit.
