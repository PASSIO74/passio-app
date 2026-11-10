# 08 — Point de reprise (mis à jour le 2026-11-10 à 18:30 UTC)

> La mission dépasse une session. Ce fichier dit où elle en est et quelle est la prochaine action précise.
> **Une limite de quota n'est pas une conclusion** : rien de ce qui est listé « à faire » n'est vérifié.

## Ce qui s'est passé

- 16:02 → 17:20 UTC : baseline, sonde de la production, huit audits spécialisés lancés en parallèle (lecture seule).
- **17:20 UTC : la limite hebdomadaire du forfait a coupé les huit sous-agents** (erreur 429). Deux avaient écrit leur rapport.
- 17:31 UTC : reprise demandée par Benjamin. Les six autres agents ont été relancés avec l'ordre d'écrire ce qu'ils avaient
  déjà établi : **les huit rapports existent**. Trois PR de correction ouvertes.
- Une seconde interruption a eu lieu pendant la rédaction des documents ; rien n'a été perdu (tout était poussé ou sur disque).

## Branches et PR

| Branche | Worktree (`.claude/worktrees/…`) | PR | État au 10/11, 18:18 UTC |
|---|---|---|---|
| `security/profil-visite-identifiant-echappe` | `lot-profil-visite-xss` | **#823** | CLI-01 (P0). Testée, auto-relue, CI verte (un lot en cours). **Ni contre-revue, ni fusion, ni déploiement** |
| `fix/chargeur-app-onload-unique` | `lot-chargeur-onload` | **#822** | STAB-01. CI verte sauf « Gouvernance critique », rouge par conception : contre-revue de PASSIO74 requise |
| `fix/robustesse-client-2026-11-10` | `lot-robustesse-client` | **#824** | STAB-02, 08, 11. Testée, auto-relue, CI en cours |
| `docs/audit-stabilisation-2026-11-10` | `audit-stabilisation-fable-2026-11-10` | voir GitHub | ces documents |

Aucune fusion, aucun push sur `main`, aucune écriture en production, aucune migration appliquée par cette mission.

## Preuves et rapports

Dossier privé, hors git, sur le poste : `Desktop/PASSIO/.passio/reviews/2026-11-10-audit-stabilisation/`
— `rapports/` (SRV, ETAT, CLI, EXPL, PARC, PIL, PWA, PERF + le préambule donné aux agents), `preuves/` (journaux des passes de
test, sonde anonyme, reproductions, avant / après de chaque lot), `outils/` (`sonde-anon.mjs`, `repro-chargeur.mjs`,
`servir-exact.mjs`), `notes-agents/`, et le corps des trois PR. Le dossier temporaire de la session disparaît avec elle.

## Ce qui reste à faire, dans l'ordre

1. **Benjamin** : fusionner #823 ; contre-revoir #822 ; fusionner #824 ; trancher STAB-04, STAB-05, PIL-01.
2. Contre-revue indépendante (Codex / ChatGPT) des trois PR — **non faite**.
3. Lancer la suite navigateur sur la réplique exacte de la production (`outils/servir-exact.mjs`, `PASSIO_PORT` dédié) et
   consigner l'écart avec la baseline (2 560 verts, 11 sautés).
4. Relire dans le code, puis corriger avec un verrou chacun, un lot par PR :
   a. durcissement serveur de CLI-01 (migration à préparer, banc, retour arrière) ;
   b. ETAT-03 (verdict de `saveMainProfile`), ETAT-07 (bulles texte et brouillon au démarrage), SRV-03 (ne plus proposer
      « Modifier » sur un commentaire d'activité) — client, risque normal ;
   c. ETAT-02 + ETAT-06 (portée de `signOut`, écouteur `SIGNED_OUT`, bandeau qui purge) — critique ;
   d. ETAT-01 (base du rejeu de l'état) — critique ;
   e. « verdicts » : SRV-04, ETAT-04, ETAT-09, PARC-01 ;
   f. SRV-02, SRV-08, PIL-02, purge SRV-05 — migrations à préparer ;
   g. STAB-10 : tester l'artefact final avant de le déployer — `.github/`, critique.
5. Mettre à jour `.passio/residus/registre-residus.json` (non touché), `docs/ARCHITECTURE.md` et les documents périmés.
6. Exercer : retour arrière Netlify, déchiffrement d'une archive, banc de charge sur le staging, inscription réelle sur iPhone.

## Verdict à ce point

**NON PRÊT** — voir `00-SYNTHESE.md`.

## Ajout de 19:00 UTC — `main` a avancé pendant la mission

- `main` = production = `36b778d1` (PR #821, intégrité de la feuille de style ; buildId `7e41f8b20efe`), fusionnée par une autre
  session. Les mesures de cet audit portent sur `4e1d8ed1` ; #821 touche `scripts/build.js`, `sw.js`, `deploy.yml` et la suite du
  chargeur — **non auditée ici**.
- #822 : `main` fusionnée dans la branche sans conflit (`340db0aa`), suite du chargeur 12 / 12, `integrite-app` 9 / 9, `verif` vert.
  La contre-revue doit donc s'ancrer sur ce nouveau SHA.
- #824 : un rouge en CI sur `app-scripts-par-fichier` ⑤ (« l'application s'exécute avant `load` »), test que ce lot ne touche pas ;
  6 / 6 en local sur la branche ; déjà rouge sous charge sur `main` intact (baseline V7). Jobs relancés une fois. **Ce test est
  instable** : à inscrire au registre (STAB-12, P3) et à diagnostiquer — un rouge relancé n'est pas un rouge expliqué.
- PR des documents : **#825**.

## Ajout — lot « verdicts » (PR #826)

- Branche `fix/verdicts-profil-conversation-commentaire` (worktree `lot-verdicts-client`), base `36b778d1`.
- ETAT-03, ETAT-07, SRV-03 revérifiés dans le code par le coordinateur, puis corrigés : 7 verrous neufs, chacun rouge
  quand on rend le fichier de `main`, verts après ; 19 suites voisines 199 / 199 ; `npm run verif` vert. Risque normal.
- Reste de l'étape 4 du plan : c (session, critique), d (rejeu de l'état, critique), e (« verdicts » restants : SRV-04,
  ETAT-04, ETAT-09, PARC-01), f (migrations), g (CI).
