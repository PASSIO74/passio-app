# ADR-002 — Identité multi-profil comme concern de première classe

- **Statut** : **Superseded par [ADR-010](ADR-010-identite-publique-unique-passions-classification.md)** (2026-08-30)
- **Date** : 2026-08-08

> ⚠️ **Cet ADR ne décrit plus le produit.** Il posait « un compte porte plusieurs identités, chacune
> avec son contexte social », garanties au niveau des données. Cette séparation n'a jamais été
> implémentée : le schéma de production est compte-first (une ligne `profiles` par compte, `follows`
> entre comptes, aucune colonne d'identité par passion). ADR-010 acte le modèle réellement en
> vigueur — une identité publique unique, les passions servant à classer les publications et à
> choisir le contenu du fil. Le texte ci-dessous est conservé tel quel, comme trace de la décision
> d'origine et de son raisonnement.

## Contexte
Le concept produit central de PASSIO est le **multi-profil passionnel** : un compte porte plusieurs identités (photographe, motard, cuisinier…), chacune avec son contexte social.

## Problème
Comment garantir que ces identités multiples ne provoquent pas de fuites de données entre profils/comptes, à travers feed, notif, recherche, messagerie, analytics ?

## Décision
Traiter l'identité multi-profil comme un **invariant d'ingénierie**, pas une feature d'UI. La séparation est garantie **au niveau des données** (RLS/filtres serveur), jamais uniquement par l'affichage. Toute feature touchant du contenu répond d'abord aux 10 questions de `context/MULTI_PROFILE.md`.

## Pourquoi
Une fuite cross-profil est un risque de confidentialité de premier ordre (R9). L'UI seule est contournable (front hostile, cf. ADR-003).

## Compromis / risques
- Granularité RLS par profil vs par compte à confirmer table par table (**UNKNOWN**, auditer via `rls-audit`).
- Complexité des tests → nécessite des scénarios cross-profil (Playwright multi-comptes).

## Trigger
Toute feature multi-profil sensible → audit RLS préalable + test cross-profil obligatoire.

## Rollback
N/A (principe transverse).
