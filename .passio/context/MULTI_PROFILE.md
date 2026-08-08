# Multi-profil passionnel — garde-fous (capacité fondamentale)

Le multi-profil est le **concept produit central** de PASSIO : un compte porte plusieurs identités passionnelles. C'est donc un **concern d'ingénierie de première classe**, pas un détail d'UI.

## Les 10 questions à se poser AVANT tout code touchant du contenu

1. **Quel profil passionnel agit** (publie, commente, réagit) ?
2. **Quel profil possède l'objet** manipulé ?
3. **Quel compte contrôle** ce profil ?
4. Qu'est-ce que le **compte principal** peut voir/faire ?
5. Qu'est-ce qu'un **autre profil du même compte** peut voir ?
6. Qu'est-ce qu'un **autre compte** peut voir ?
7. **Quel profil reçoit** la notification ?
8. **Quelle identité est affichée** publiquement ?
9. **Quel contexte de recommandation** est affecté ?
10. **Quelle identité analytics/télémétrie** est enregistrée ?

## Invariant de sûreté

> Aucune donnée ne doit fuiter entre profils au-delà de ce que le modèle de confidentialité autorise.

Concrètement : la séparation par profil est garantie **au niveau des données (RLS/filtres serveur)**, jamais uniquement par l'UI. Un test cross-profil (Playwright multi-comptes / multi-profils) est la seule preuve.

## Impacts transverses à vérifier

DB · permissions · publication · feed · recommandations · recherche · follow · messagerie · notifications · analytics · modération.

## État actuel (factuel)

- Modélisation : `profiles` + `profile_passions` + état multi-profil local (`app-05`/`app-06`, mémoire `multi-profil centralisé`).
- **UNKNOWN à confirmer en prod** : granularité RLS par profil vs par compte pour chaque table de contenu. À auditer avec `rls-audit` avant toute feature multi-profil sensible.

Lié : [[PASSIO_SYSTEM_MODEL]], `SECURITY.md`, skill `rls-audit`.
