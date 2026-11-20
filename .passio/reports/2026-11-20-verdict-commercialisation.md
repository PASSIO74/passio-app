# Verdict de commercialisation — 20 novembre 2026

**Verdict : GO pour une commercialisation à échelle maîtrisée, sous deux conditions préalables qui relèvent du responsable. NO-GO pour annoncer une tenue à 100 000 utilisateurs.**

Le GO est écrit par Claude Code, sur l'ordre du mainteneur. Il s'appuie sur des mesures en production et sur la CI, pas sur une relecture humaine indépendante, qui n'a pas eu lieu.

État livré : `main` à `a38ab74d`, servi en production (job « Déploiement production » vert, `release.json` portant ce commit). Correctifs du jour : PR #985 (client), #986 (base, cinq migrations appliquées au staging puis en production, état mesuré en base après application) et #987 (attestations).

## Conditions du GO (gestes du responsable, hors code)

1. **Plafond de dépense de l'hébergeur de la base**, ou à défaut des alertes de budget. C'est la seule protection contre une facture non bornée en cas d'abus du trafic sortant. Sans ce plafond, le GO ne vaut pas.
2. **Accès de l'hébergeur du site** : renouveler le jeton du poste, aujourd'hui refusé, puis relever la consommation de l'offre actuelle et choisir l'offre adaptée au lancement. Sinon, le site peut être suspendu au dépassement.

## Les 11 constats P1 de l'audit du 15/11

| Famille | État au 20/11 | Preuve |
|---|---|---|
| Forme des messages | Fermé | Base et client alignés, contrôle en production |
| Amplification temps réel | Fermé pour la messagerie ; borné ailleurs | Budget lié au compte, extraits pour les longs messages, accusés plafonnés ; les autres diffusions émettent au plus deux envois par ligne, et chaque écriture est déjà plafonnée par compte (catalogue de production relu) |
| Réécritures et stockage | Fermé | Plafonds par compte sur les réécritures, quota appliqué au remplacement de fichier (catalogue de production relu) |
| Lectures sans compte | Réduit | Table de liens fermée, recherche bornée. Il reste à poser une limite par adresse ou un cache en bordure |
| Coûts des services hébergés | Ouvert, condition 1 | Pas de jauge ni de plafond côté hébergeur |
| Repli coûteux du fil | Fermé | Le client recule au lieu de basculer sur le chemin coûteux ; tests e2e verts |
| Capacité à volume | Ouvert, pas de GO 100K | Aucune campagne de charge au-delà de 100 utilisateurs sur un environnement dimensionné |
| Chaîne de livraison et secrets | Accepté pour l'échelle maîtrisée | Mainteneur unique, revues assumées et non indépendantes, secrets au niveau du dépôt |
| Intégrations et agents | Réduit | Voir le dossier restreint |
| Dépense de l'hébergeur de la base | Ouvert, condition 1 | |
| Hébergeur du site | Ouvert, condition 2 | |

## Ce que « échelle maîtrisée » veut dire

- Une croissance suivie au centre de pilotage, en surveillant les erreurs, le trafic sortant et le temps réel. Pas d'opération d'acquisition massive d'un seul coup.
- Une campagne de charge par paliers, sur un environnement d'essai dimensionné, avant de dépasser quelques milliers d'utilisateurs actifs. Elle conditionne tout discours sur les 100 000.
- Dès que possible : un relecteur indépendant pour les changements critiques, et les secrets déplacés dans un environnement de production protégé.

## Limites

Ne pas avoir trouvé de faille n'est pas une garantie. Le banc SQL de #986 n'a tourné qu'en CI. La livraison d'un long message de groupe entre deux vrais comptes n'a pas été éprouvée de bout en bout. Le détail des constats reste au dossier restreint, hors dépôt.
