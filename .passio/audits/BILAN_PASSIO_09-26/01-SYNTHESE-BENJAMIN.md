# Synthèse pour Benjamin — BILAN PASSIO 09/26

> Lecture en cinq minutes. Le détail est dans les rapports 02 à 14 du même dossier ; les preuves sont dans `preuves/`, les sorties brutes des auditeurs dans `donnees/`.

## Ce qui a été audité

- **Quoi** : PASSIO au commit `c8cb8e99` de `main` (le 2026-09-04 à 12:07, PR #278), celui qui est en production (run CI 2494 vert, déploiement Netlify 10:44 UTC). `main` n'a pas bougé pendant l'audit.
- **Par qui** : Claude Fable 5.1, vérifié (`claude-fable-5-1` configuré ET servi, effort xhigh) ; 16 auditeurs de domaine et les relecteurs adversariaux lancés explicitement sur ce modèle. Aucune substitution.
- **Comment** : lecture seule. Aucune ligne de code de l'application modifiée, aucune PR fusionnée, rien déployé, aucune donnée réelle touchée, aucun test de charge sur la production, aucun secret recopié. Une issue (#279), une branche documentaire (`audit/bilan-passio-09-26-fable51`) et une PR brouillon (#280) — c'est tout.
- **Ce qui a gêné** : les crédits de session se sont épuisés trois fois ; sept domaines ont dû être reconstitués par l'orchestrateur à partir des preuves déposées par leurs sous-agents interrompus, et 75 problèmes sur 186 n'ont pas eu de relecture adversariale. Ils sont signalés comme tels, à chaque endroit.

## Le verdict

# BÊTA FERMÉE UNIQUEMENT — NO-GO pour la grande échelle

Les sept critères d'interdiction de l'ordre de mission sont **tous** vrais aujourd'hui : 8 P0 ouverts, isolation non prouvée sous rôle (et trois fuites transverses prouvées), restauration jamais exécutée, capacité jamais mesurée, fonctions critiques invisibles du Pilotage et de la Sentinelle, sécurité IRL et modération insuffisantes, staging et production confondus. Le rapport 12 les détaille un par un.

Ce n'est pas un verdict sur la qualité du produit : l'expérience de première visite, le référentiel plat, le fil additif, la RLS par propriétaire, la CI à 13 jobs et les performances sur appareil rapide sont solides. C'est un verdict sur ce qui manque pour laisser entrer des inconnus.

## Les cinq risques principaux

1. **Les messages privés ne sont pas privés.** Les vocaux et fichiers échangés en messagerie sont dans un bucket public, listables et lisibles par n'importe qui avec la clé publique de l'app, et jamais effacés — même après suppression du compte (SUP-01, MSG-03, CONT-11, AUT-02). Risque connu depuis le 8 août, toujours ouvert.
2. **Une rencontre physique expose son organisateur.** L'adresse exacte, les coordonnées GPS, le téléphone de contact et la liste nominative des participants sont lisibles par tout visiteur sans compte ; un mineur de 13 ans peut créer ou rejoindre une rencontre sans qu'aucune garde ne s'applique ; aucun conseil de sécurité, aucun moyen de signaler l'organisateur depuis la fiche (IRL-01, IRL-02, IRL-03, IRL-09).
3. **Aucune modération possible, aucune base légale.** Rien ne traite les signalements (motif toujours vide), rien ne permet de retirer un contenu illicite, une publication ou un message ne peut même pas être signalé ; il n'existe ni CGU, ni mentions légales complètes, ni consentement à l'inscription, ni point de contact réel — le bouton « Support » enregistre un texte sur le téléphone et n'envoie rien (MOD-01, MOD-02, MOD-09, AUT-01, EXP-07, EXP-09).
4. **Pas de filet.** La restauration n'a jamais été essayée, la sauvegarde est manuelle, locale, sans les mots de passe et datée du 16 août ; il n'y a pas de staging (les tests de la CI créent des comptes dans la production) ; la capacité n'a jamais été mesurée ; une panne n'alerte personne si la page du dashboard n'est pas ouverte, et la console d'administration accepte ses identifiants par défaut (EXP-01, SUP-04, PERF-01, PIL-01, PIL-02).
5. **Le dépôt est public.** Le dossier investisseur, le business plan, les finances, les documents internes et 51 Mo de vidéos sont lisibles par quiconque — ainsi que le hash du code d'accès de la « beta privée », cassable en 6 ms (EXP-10, AUT-06).

Deux autres découvertes à connaître : en messagerie, l'expéditeur choisit lui-même le nom, l'emoji et la photo que voit le destinataire — l'usurpation « Équipe PASSIO » fonctionne (PRO-02) ; et environ 900 des 1 908 passions du référentiel restent impubliables parce que le client ne charge que les 1 000 premières lignes (PRO-01) — une passion vivante d'un compte réel est concernée.

## Les chiffres

| | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Problèmes retenus | **8** | **54** | **65** | **56** |

186 problèmes rapportés (3 réfutés par la relecture et conservés pour mémoire), 407 contrôles statués (132 prouvés, 73 conformes par inspection, 21 probables, 144 défaillants, 33 bloqués, 4 sans objet). Tests : `npm run verif` vert ; ~650 tests e2e ciblés exécutés par les domaines pendant l'audit ; une suite complète locale lancée à la fin (résultat en fin de ce document).

## Ce que je ferais en premier (dans l'ordre)

1. **Fermer les huit P0** : bucket `attachments` privé + URL signées + listing anon retiré ; échapper l'invitation d'appel et autoriser les canaux Realtime ; chaîne de signalement avec retrait de contenu ; second projet Supabase pour le staging ; exercer une restauration complète ; mesurer la capacité sur ce staging. Ordre de grandeur : deux semaines.
2. **Sécurité IRL et mineurs** : adresse, téléphone et participants réservés aux inscrits ; appeler `declare_birth_year` à l'onboarding et faire porter la garde de majorité par la RLS ; retirer l'allégation « contrôle d'âge IA ».
3. **Juridique et support** : CGU + mentions légales + case de consentement ; politique de confidentialité réécrite ; une seule adresse de contact qui reçoit vraiment ; effacement complet du compte.
4. **Pilotage** : notification hors page (e-mail/push), signaux pour la confirmation d'e-mail, la suppression de compte et les signalements ; mot de passe fort + second facteur sur la console.
5. **Rendre le dépôt privé** ou en sortir le dossier investisseur et les documents internes.

Tout cela est chiffré problème par problème (effort, risque de régression, correction proposée) dans les rapports de domaine et le registre (rapport 11).

## Ce que l'audit n'a PAS pu prouver

Rapport 13. En résumé : ce que sert réellement la production (réseau bloqué), l'isolation sous rôle (SET ROLE refusé), les plans et quotas Supabase/Netlify/Brevo, les réglages Auth (captcha, limites), les appareils et navigateurs réels (Chromium seul, tout est émulé), la carte (tuiles bloquées), et la relecture adversariale de 75 problèmes. Sept preuves à apporter sont listées avec qui peut les fournir.

## Audit différentiel

`git fetch origin main` en fin d'audit (20:32 UTC) : **0 commit** au-delà de `c8cb8e99`. Aucune modification de l'application pendant le bilan ; aucune branche créée par Benjamin pendant la journée (dernière branche de travail : `claude/consolidate-close-sessions-shbepm`, 09:51 UTC, avant le gel). Aucun audit différentiel n'est donc nécessaire : la contre-revue GPT-6 Astra peut se faire sur le même SHA sans réserve.

## Liens

- Issue : https://github.com/PASSIO74/passio-app/issues/279
- PR brouillon (rapports et preuves uniquement) : https://github.com/PASSIO74/passio-app/pull/280
- Dossier : `.passio/audits/BILAN_PASSIO_09-26/` — rapports 00 à 14, `preuves/`, `donnees/` (sorties brutes des 16 domaines et votes des relecteurs), `outillage/` (scripts d'orchestration pour rejouer l'audit).

## Suite complète locale (une seule exécution, à la fin)

_Section renseignée à la fin de l'exécution — voir ci-dessous._
