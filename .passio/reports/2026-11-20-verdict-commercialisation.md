# Verdict de commercialisation — 20 novembre 2026

**Verdict (mis à jour le 20/11 au soir) : GO pour une commercialisation à échelle maîtrisée. Les deux conditions préalables sont levées. NO-GO pour annoncer une tenue à 100 000 utilisateurs.**

Le GO est écrit par Claude Code, sur l'ordre du mainteneur. Il s'appuie sur des mesures en production et sur la CI, pas sur une relecture humaine indépendante, qui n'a pas eu lieu.

État livré : `main` à `a38ab74d`, servi en production (job « Déploiement production » vert, `release.json` portant ce commit). Correctifs du jour : PR #985 (client), #986 (base, cinq migrations appliquées au staging puis en production, état mesuré en base après application) et #987 (attestations).

## Conditions du GO (gestes du responsable, hors code)

1. ~~Plafond de dépense de l'hébergeur de la base~~. **Levée le 20/11** : relu sur le tableau de bord de facturation, le plafond était **déjà activé**. L'audit l'avait déduit à tort des limites du temps réel. Les dépassements ne sont donc jamais facturés. En contrepartie, l'organisation est **restreinte** dès qu'elle dépasse un quota de l'offre (voir « Quotas partagés » ci-dessous).
2. ~~Hébergeur du site~~ — **levée le 20/11**, consommation relevée sur le tableau de bord. Novembre, jusqu'au 20 : 2,4 Go de bande passante sur 100 Go, 97 000 requêtes, 19 000 appels de fonctions en bordure. La marge est d'environ 40 fois, et les médias sont servis par le CDN de la base, pas par le site. L'offre gratuite « historique » est conservée : en changer serait irréversible et sans objet à ce volume.

## Les 11 constats P1 de l'audit du 15/11

| Famille | État au 20/11 | Preuve |
|---|---|---|
| Forme des messages | Fermé | Base et client alignés, contrôle en production |
| Amplification temps réel | Fermé pour la messagerie ; borné ailleurs | Budget lié au compte, extraits pour les longs messages, accusés plafonnés ; les autres diffusions émettent au plus deux envois par ligne, et chaque écriture est déjà plafonnée par compte (catalogue de production relu) |
| Réécritures et stockage | Fermé | Plafonds par compte sur les réécritures, quota appliqué au remplacement de fichier (catalogue de production relu) |
| Lectures sans compte | Réduit | Table de liens fermée, recherche bornée. Il reste à poser une limite par adresse ou un cache en bordure |
| Coûts des services hébergés | Borné | Plafond de dépense actif ; consommation relevée le 20/11 |
| Repli coûteux du fil | Fermé | Le client recule au lieu de basculer sur le chemin coûteux ; tests e2e verts |
| Capacité à volume | Mesuré jusqu'à 200, pas de GO 100K | Campagne du 20/11 au staging, même instance que la production : 100 comptes simultanés sans dégradation (p95 116 ms, 0 erreur) ; à 200, p95 787 ms et pics à 2 s (`docs/CAPACITE_PALIERS_2026-11-20.md`) |
| Chaîne de livraison et secrets | Accepté pour l'échelle maîtrisée | Mainteneur unique, revues assumées et non indépendantes, secrets au niveau du dépôt |
| Intégrations et agents | Réduit | Voir le dossier restreint |
| Dépense de l'hébergeur de la base | Fermé | Plafond de dépense actif |
| Hébergeur du site | Fermé le 20/11 | Consommation relevée, marge d'environ 40 fois |

## Quotas partagés : le risque qui remplace la facture

Les quotas sont ceux de l'ORGANISATION, et l'environnement d'essai que sollicite la CI en fait partie. Relevé du 20/11, pour le cycle du 27/10 au 27/11 :

| Quota | Consommé | Part |
|---|---|---|
| Connexions temps réel simultanées (pic) | 203 sur 500 | 41 % |
| Utilisateurs actifs mensuels | 34 713 sur 100 000 | 35 % |
| Journaux interrogés | 41 % | |
| Messages temps réel | 8 % | |
| Trafic sortant | 4 % | |
| Appels de fonctions | 1 % | |

La production ne compte qu'une vingtaine de comptes. L'essentiel des utilisateurs actifs vient donc des comptes synthétiques créés puis supprimés par les tests. Un dépassement restreindrait aussi la production.
- **À faire** : sortir l'environnement d'essai de l'organisation, ou réutiliser des comptes de test au lieu d'en créer à chaque passe.
- **À surveiller** : le pic temps réel. 500 connexions simultanées pour toute l'organisation, c'est quelques centaines d'utilisateurs connectés en même temps en production.

## Ce que « échelle maîtrisée » veut dire

- Une croissance suivie au centre de pilotage, en surveillant les erreurs, le trafic sortant et le temps réel. Pas d'opération d'acquisition massive d'un seul coup.
- Une campagne de charge par paliers, sur un environnement d'essai dimensionné, avant de dépasser quelques milliers d'utilisateurs actifs. Elle conditionne tout discours sur les 100 000.
- Dès que possible : un relecteur indépendant pour les changements critiques, et les secrets déplacés dans un environnement de production protégé.

## Limites

Ne pas avoir trouvé de faille n'est pas une garantie. Le banc SQL de #986 n'a tourné qu'en CI. La livraison d'un long message de groupe entre deux vrais comptes n'a pas été éprouvée de bout en bout. Le détail des constats reste au dossier restreint, hors dépôt.
