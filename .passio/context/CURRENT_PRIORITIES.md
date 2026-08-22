# Priorités actuelles

> Mis à jour : 2026-08-20. Les priorités sécurité existantes restent obligatoires ; ce document ajoute le cadrage produit de simplification. Voir aussi `../../docs/PASSIO_PRODUCT_AUDIT_V2_2026-08-20.md` et `../../docs/CLAUDE_CODE_REPRISE_PRODUCT_2026-08-20.md`.

## P0 — sécurité / prérequis qui ne doivent pas régresser

1. **SMTP + confirmation e-mail** (confidentialité, anti-usurpation).
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
