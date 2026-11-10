# 08 — Point de reprise (mis à jour le 2026-11-10 à 17:50 UTC)

> La mission dépasse une session. Ce fichier dit exactement où elle en est : ce qui est fait, ce qui ne l'est pas, et
> la prochaine action précise. **Une limite de quota n'est pas une conclusion** : rien de ce qui est listé « à faire »
> n'est vérifié.

## Ce qui s'est passé

- 16:02 → 17:20 UTC : baseline, sonde de la production, huit audits spécialisés lancés en parallèle (lecture seule).
- **17:20 UTC : la limite hebdomadaire du forfait a coupé les huit sous-agents** (erreur 429, « resets Nov 13, 2am
  Europe/Paris », modèle envoyé : `claude-fable-5-2`). Deux avaient déjà écrit leur rapport (SRV, ETAT) ; six n'avaient que
  des notes brutes (CLI, PARC, PWA, PERF, EXPL, PIL).
- 17:31 UTC : reprise demandée par Benjamin. La session principale a continué seule : correction du premier défaut
  (PR #822), registre, ce point de reprise.

## État exact de chaque livrable

| Livrable | État |
|---|---|
| `01-BASELINE.md` | **fait** — dépôt, SHA, production, accès, résultats avant changement |
| `03-REGISTRE-FINDINGS.md` | **partiel** — findings du coordinateur (STAB-01…11) et des deux agents qui ont rendu (SRV, ETAT) ; six domaines manquent |
| `02-CARTE-ARCHITECTURE.md` (carte + diagramme) | **à faire** — les faits sont réunis (voir ci-dessous), le document n'est pas écrit |
| `04-MATRICE-PARCOURS-RISQUES.md` | **à faire** — la matrice d'autorisation serveur existe (rapport SRV, annexe B, dossier privé) ; la matrice des parcours dépendait de l'agent PARC, interrompu |
| `05-VERIFICATIONS.md` | **à faire** — les résultats sont dans `01-BASELINE.md` § 4 et ci-dessous |
| `06-RISQUES-RESIDUELS.md` et mise à jour de `.passio/residus/registre-residus.json` | **à faire** |
| `07-PREPARATION-LANCEMENT.md` (verdict) | **à faire** — verdict provisoire ci-dessous |
| ADR | aucun nécessaire à ce stade : aucune transformation structurelle n'est proposée |

## Branches et PR

| Branche | Worktree | PR | État |
|---|---|---|---|
| `docs/audit-stabilisation-2026-11-10` | `.claude/worktrees/audit-stabilisation-fable-2026-11-10` | à ouvrir à la fin | documents de l'audit, poussée |
| `fix/chargeur-app-onload-unique` | `.claude/worktrees/lot-chargeur-onload` | **#822** | proposé, testé (Chromium, WebKit, artefact), auto-relu. **Périmètre critique : contre-revue de PASSIO74 requise ; ni fusionné ni déployé** |
| lot 2 « robustesse client » | à créer depuis `origin/main` | — | **non commencé** |

Aucune fusion, aucun push sur `main`, aucune écriture en production, aucune migration appliquée par cette mission.

## Preuves

- Dossier privé, hors git, sur le poste : `Desktop/PASSIO/.passio/reviews/2026-11-10-audit-stabilisation/`
  — `rapports/` (SRV, ETAT, préambule des agents), `preuves/` (journaux et JSON des passes de test, sonde anonyme, reproductions),
  `outils/` (`sonde-anon.mjs`, `repro-chargeur.mjs`, `servir-exact.mjs`), `notes-agents/` (notes brutes des six agents interrompus).
- Les fichiers du dossier temporaire de la session (`…/scratchpad/`) disparaissent avec elle : tout ce qui compte a été recopié.

## Vérifications faites (SHA `4e1d8ed1`)

| Contrôle | Résultat |
|---|---|
| `npm run verif` | vert |
| `npm run test:unit` | 1 038 / 1 038 |
| `npx playwright test --project=local` (Chromium, serveur simulé), 6 workers, poste chargé par 8 agents | 2 587 tests : 2 560 verts, 11 sautés, **16 rouges — rejoués seuls : 16 / 16 verts** (rouges de charge du poste, pas du produit) |
| Réplique locale de la production | page minifiée, CSS minifié, `sw.js`, 9 scripts : **identiques à l'octet** à `passio-app.netlify.app` |
| Sonde anonyme de la production (GET) | messages, conversations, notifications, `user_state`, télémétrie, signalements : 0 ligne ; `events` sans adresse ni contact |
| CI du commit (run 42831070685) | tout vert, dont `authz-critical` contre la PRODUCTION et 21/24 suites à comptes réels contre le STAGING |

## Non vérifié (et pourquoi)

- **Six domaines d'audit sans rapport** : sécurité côté client (XSS, URLs, secrets dans l'historique), parcours et couverture
  de test, PWA / mobile / accessibilité, performance / capacité / coûts, exploitation / CI / sauvegardes / e-mails / légal,
  pilotage / Sentinelle / agents. Notes brutes au dossier privé ; aucune conclusion n'en est tirée ici.
- **Suite navigateur sur la réplique exacte de la production** (page minifiée) : préparée (`outils/servir-exact.mjs`), **pas lancée**.
- Les findings ETAT-xx sont une analyse statique d'agent : **non revérifiés par le coordinateur**, à relire avant toute correction.
- Isolation sous rôle réel en production au-delà d'`authz-critical` ; égalité staging ↔ production ; restauration de bout en
  bout ; retour arrière Netlify en réel ; charge ; appareils réels ; délivrabilité des e-mails ; quotas et facturation.
- Contre-revue indépendante (Codex / ChatGPT) : **non faite** — aucune relecture de cette mission n'en tient lieu.

## Verdict provisoire

**NON PRÊT** pour une commercialisation, à ce stade de l'audit — pour trois raisons mesurées, et une d'incomplétude :
1. deux décisions sur l'état de la production restent à prendre (STAB-04 : comptes privés par défaut ; STAB-05 : 35 publications masquées) ;
2. trois P1 de fiabilité du compte sont ouverts (ETAT-01, ETAT-02, ETAT-03) ;
3. plusieurs actions annoncent un succès que la base n'a pas (SRV-03, SRV-04, ETAT-04, ETAT-09) ;
4. six domaines sur huit ne sont pas audités : une surface critique non vérifiée interdit tout feu vert.

## Prochaine action précise

1. Relancer les six agents interrompus quand le quota le permet (leur contexte est gardé : un message suffit), ou reprendre
   leurs domaines un par un, dans l'ordre : sécurité client → exploitation → pilotage → parcours → PWA → performance.
2. Revérifier ETAT-03 et ETAT-07 dans le code, puis ouvrir le lot 2 (client, risque normal) : STAB-02, STAB-08, STAB-11,
   ETAT-03 (a), ETAT-07, SRV-03 (ne plus proposer « Modifier » sur un commentaire d'activité), avec un test par défaut.
3. Lancer la suite navigateur sur la réplique exacte de la production et consigner l'écart avec la baseline.
4. Préparer (sans appliquer) les lots critiques : ETAT-01, ETAT-02 + ETAT-06, SRV-02, purge (SRV-05), CI (STAB-10).
5. Écrire la carte d'architecture, la matrice, les risques résiduels, le verdict final ; ouvrir la PR des documents.
6. Benjamin : trancher STAB-04 et STAB-05 ; contre-revoir #822.
