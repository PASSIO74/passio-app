# Priorités actuelles

> Mis à jour : 2026-08-08. Détail séquencé : `../../PASSIO_TECHNICAL_ROADMAP.md`.

## P0 (maintenant)
1. **SMTP + confirmation e-mail** (confidentialité, anti-usurpation).
2. **URLs signées** pour médias privés.
3. **Gate `migration-checker`** prod↔repo avant toute migration.

## P1 (30 j)
4. Dette **base64→Storage** finalisée.
5. Tests des parcours sensibles (suppression compte, confidentialité, blocage, cross-profil).
6. Régressions de sécurité → specs Playwright multi-comptes.

## En cours / récent (contexte)
- ContextualTools (nav IRL/CDV) déployé 2026-08-07.
- Refonte CDV/IRL (budget €, vidéo étape, réactions par étape) 2026-08-03.
- Centre de pilotage (télémétrie) actif par défaut en prod (opt-out) depuis 2026-08-05.

## Ne PAS faire maintenant (anti-scope-creep)
Podcasts, marketplace transactionnelle, paiements, framework/bundler, mode sombre. → exploration/ADR only.
