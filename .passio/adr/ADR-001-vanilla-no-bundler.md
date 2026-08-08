# ADR-001 — Front vanilla JS multi-script + build d'assemblage (pas de framework/bundler)

- **Statut** : Accepté (décision fondatrice, documentée a posteriori)
- **Date** : constatée 2026-08-08

## Contexte
PASSIO est une PWA sociale déjà en beta (1659 commits). Le front est écrit en **vanilla JS**, sans framework ni bundler : `index.html` + `styles.css` + `js/app-01..09` (scripts classiques partageant `window`), assemblés au build (`scripts/build.js`) en un monolithe.

## Problème
Faut-il migrer vers un framework (React/Next) + bundler pour « faire sérieux » / scaler ?

## Options
1. **Rester vanilla + build d'assemblage** (statu quo).
2. Introduire un bundler (Vite/esbuild) sans framework.
3. Migrer vers un framework + bundler.

## Décision
**Option 1.** On reste vanilla tant qu'aucun trigger mesuré ne le justifie.

## Pourquoi
- Vélocité réelle : l'équipe (Benjamin + Claude) livre vite dans ce modèle.
- Zéro coût de build/toolchain, hoisting maîtrisé, CI simple.
- Le mandat interdit l'over-engineering (§69) : la sophistication doit être justifiée.

## Compromis / risques
- Globals partagés → collisions (mitigé par `audit-globals` en CI).
- Fichiers app volumineux (dette P2, cf. `TECH_DEBT.md`).
- Pas de tree-shaking (parse JS = hotspot potentiel).

## Trigger de réévaluation
Parse JS front mesuré trop lourd, ou besoin de composants réutilisables complexes → envisager un bundler (ADR dédié), **jamais avant**.

## Rollback
N/A (statu quo). L'introduction d'un bundler serait additive et réversible.
