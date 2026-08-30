# Priorités actuelles

> **2026-08-25 — nouvelle priorité n° 1 : rendre le concept PASSIO visible et testable, lot par lot.**
> Direction canonique : [`docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md`](../../docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md)
> (ordre du lot UI-1 : [`docs/PASSIO_UI_V2_ORDRE_UI1_2026-08-25.md`](../../docs/PASSIO_UI_V2_ORDRE_UI1_2026-08-25.md)).
> Ce document **consolide et remplace l'ancien ordre UX qui plaçait la refonte APRÈS la performance** :
> les chantiers de performance profonde et de montée en charge sont suspendus jusqu'à validation
> visuelle du concept. Les priorités **P0 sécurité ci-dessous restent intégralement en vigueur** —
> elles deviennent les garde-fous de l'expérimentation, elles ne sont pas suspendues.
> Doctrine : `DÉCOUVRIR → PARTAGER → RENCONTRER`. Livraison par lots UI-1 → UI-7. UI-1 + UI-2
> sont actives par défaut depuis leur validation du 2026-08-26 ; les lots suivants sont validés
> visuellement par Benjamin, puis fusionnés et déployés après revue et CI vertes sans demander une
> seconde autorisation. Les changements critiques restent hors de cette autorisation permanente.
> En cas de contradiction : décision utilisateur la plus récente pour le produit, ce document UI V2
> pour la direction UX, `main` GitHub pour l'état réel du code, sécurité déjà acquise non négociable.

> Mis à jour : 2026-08-20. Les priorités sécurité existantes restent obligatoires ; ce document ajoute le cadrage produit de simplification. Voir aussi `../../docs/PASSIO_PRODUCT_AUDIT_V2_2026-08-20.md` et `../../docs/CLAUDE_CODE_REPRISE_PRODUCT_2026-08-20.md`.

## P0 — sécurité / prérequis qui ne doivent pas régresser

1. ~~SMTP + confirmation e-mail~~ → **fait le 2026-08-30** (Brevo + « Confirm email » ON). Reste ouvert : **authentifier le domaine d'envoi** (DKIM/DMARC, accès DNS requis) et poser le secret `SUPABASE_SERVICE_ROLE_KEY` dans le dépôt, sans lequel les gates e2e qui écrivent en base échouent. Voir `docs/SETUP_SMTP_AUTH.md`.
2. **URLs signées** pour médias privés.
3. **Gate `migration-checker`** prod↔repo avant toute migration.
4. Maintenir verts les invariants **RLS / authz / blocage / confidentialité / cross-compte** pendant toute simplification.

## P0 — simplification produit à la reprise avec Claude Code

5. **Audit exact Wallet / Passia / points / Score Passion / rangs / leaderboard / packs / crypto** dans UI, JS, CSS, état local, seeds, tests, docs et DB.
6. **Retirer Wallet et l'économie interne du cœur PASSIO**, par lots réversibles et testés.
7. **Sortir CDV de la navigation cœur** tout en préservant ses données et ses briques pour **Passio : Voyage**.
8. Ramener la navigation et les parcours au noyau : **Feed → personne → interaction → conversation → IRL**.
9. Simplifier l'**onboarding** vers Passio → premier feed pertinent, sans gamification monétaire.
10. Définir/instrumenter le funnel produit Feed→IRL avant de modifier profondément le ranking.

## P1 — qualité du cœur

11. Simplifier le **Studio/création** : publier une Passio rapidement, options avancées repliées.
12. Rendre naturel **contenu → profil → message** en respectant confidentialité et blocage.
13. Rendre naturel **conversation → activité IRL** avec garde-fous localisation/visibilité.
14. Renforcer **Trust & Safety IRL** et scénarios cross-compte.
15. Optimiser le **Feed ranking V2** à partir de mesures réelles : pertinence, diversité, affinité, découverte, sécurité, conversation/IRL — pas uniquement temps passé.
16. Étendre **Sentinelle + centre de pilotage mobile** aux métriques produit et runbooks d'auto-réparation sûrs/réversibles.

## P1 — dette technique / validation déjà engagée

17. Dette **base64→Storage** finalisée.
18. Tests des parcours sensibles (suppression compte, confidentialité, blocage, cross-profil).
19. Régressions de sécurité → specs Playwright multi-comptes.
20. Remesurer après simplification : écrans cœur, interactions exposées, couverture fonctionnelle, poids JS/CSS, résultats P0.

## En cours / récent (contexte)

- ContextualTools (nav IRL/CDV) déployé 2026-08-07 — à réévaluer car CDV sort du cœur.
- Refonte CDV/IRL du 2026-08-03 — préserver les briques CDV pour Passio : Voyage ; ne pas les supprimer aveuglément.
- Centre de pilotage (télémétrie) actif par défaut en prod (opt-out) depuis 2026-08-05.
- ADR-009 du 2026-08-20 : cœur Feed→IRL et retrait Wallet/Passia/points.

## Suspendu par la direction UI V2 du 2026-08-25 (jusqu'à validation du concept)

- Optimisation profonde du DOM et de la fenêtre de fil, budgets p95/p99 complets, dimensionnement
  « un million d'utilisateurs ». Repris **après** validation visuelle des lots UI-1 → UI-7.
- Corollaire : une branche de lot UI ne porte aucun chantier performance.

## Ne PAS faire maintenant (anti-scope-creep)

- Wallet, Passia, points, Score Passion, rangs, leaderboard, packs ou piste crypto dans le cœur.
- Marketplace transactionnelle ou nouvelle économie interne.
- Paiements tant qu'un besoin utilisateur concret ne les exige pas ; si besoin futur, étudier d'abord le paiement direct en monnaie réelle.
- Podcasts dans le cœur.
- Framework/bundler ou réécriture technique sans bénéfice démontré.
- Mode sombre tant qu'il reste hors priorité produit.
- Nouveau gros chantier vertical avant validation de la boucle Feed→IRL.

## Mode de collaboration à la reprise

- **ChatGPT** : cadrage produit, arbitrages, UX, critères d'acceptation, KPI, revue fonctionnelle.
- **Claude Code** : audit exact du dépôt, changements multi-fichiers, migrations, intégration, exécution des tests.
- **Codex** : contrôle croisé ciblé, revue de diff, recherche de régressions et tests complémentaires.

Aucune fusion vers `main` ne doit être considérée terminée sans convergence **comportement + sécurité + tests + mesure + documentation**.
