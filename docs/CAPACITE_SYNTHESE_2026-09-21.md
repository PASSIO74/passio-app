# Capacité sans investir, quatre lots — synthèse et campagne staging (21 septembre 2026)

Demande : augmenter la capacité de navigation et réduire la consommation par
utilisateur, sans abonnement, quota ni service payant supplémentaire. Point de
départ : `3491317` (PR #519). Ce document est la synthèse ; chaque lot a sa
fiche (`docs/CAPACITE_FIL_COMPTEURS_2026-09-21.md` — client fusionné (#521), migration `fil_compteurs` en attente d'application humaine,
`docs/CAPACITE_IMAGES_LEGERES_2026-09-21.md`,
`docs/CAPACITE_COMPTEURS_CADENCE_2026-09-21.md`,
`docs/CAPACITE_TEMPS_REEL_CIBLE_2026-09-21.md`).

## 1. Ce qui est réellement livré

| Lot | PR | État | Ce qui change |
|---|---|---|---|
| ③ Cadence des compteurs visibles | #522 | **fusionnée, déployée** (`3f3e47a1`, servie dans `39e953de`) | 15 → 22,5 → 33,75 → 50,6 → 60 s quand rien ne bouge ; retour à 15 s sur changement, erreur, carte neuve, mon like, premier plan, réseau |
| ④ Temps réel ciblé | #523 | **fusionnée, déployée** (`715e47cc`) | `profiles` UPDATE d'un profil inconnu localement : ni cache, ni rendu ; inventaire mesuré des dix liaisons |
| ② Images légères | #524 | **fusionnée, déployée** (`39e953de`) | photo publiée = grande + légère 720 px WebP, `media_url` = légère, grilles et albums sans la grande |
| ① Compteurs du fil en une lecture | #521 | **ouverte, non fusionnée** | migration `fil_compteurs` (SECURITY INVOKER) + client à repli ; **contre-revue humaine exigée** par la CI (« Gouvernance critique » : revue GitHub de PASSIO74 avec le marqueur) ; `.passio/migrations/relecteurs-autorises.json` est vide (RES-15) — aucune attestation possible tant qu'un relecteur n'y est pas inscrit |

Version servie vérifiée après déploiement : `https://passio-app.netlify.app/release.json`
→ `commit 39e953de…`, et le bundle porte `compteursProchainPas`,
`profilConnuLocalement`, `_imageLegerePourFil`, `.v720`, mais pas
`fil_compteurs` (attendu : #521 n'est pas fusionnée).

## 2. Mesures avant / après

### Campagne staging (même scénario, mêmes fixtures, même graine, deux passes)

`scripts/charge-realiste.mjs --projet fcksxofaelcdmmifnwjo --paliers 100
--pages 20 --duree 90 --executer`, une passe `--compteurs-cadence fixe` (le
produit d'avant) puis une `adaptative` (le produit déployé). Staging seulement,
comptes `@passio-capacite.test`, poste tenu éveillé (`scripts/rester-eveille.ps1`,
demande transitoire `SetThreadExecutionState`, aucun réglage modifié).

| | Avant (fixe) | Après (adaptative) | Écart |
|---|---:|---:|---:|
| Comptes connectés / durée mesurée | 100 / 90,25 s (murale 90,25 s) | 100 / 90,26 s (murale 90,26 s) | — |
| Verdict du banc (durée, erreurs, p95, Realtime) | **valide** | **valide** | — |
| Requêtes HTTP (toutes) | 5 175 | 5 059 | **−2,2 %** |
| dont HEAD compteurs | 1 719 | 1 590 | **−7,5 %** |
| dont parcours principaux | 3 456 | 3 469 | +0,4 % |
| Erreurs HTTP | 0 | 0 | — |
| p50 / p95 HTTP | 78 / 144 ms | 75 / 134 ms | −7 % p95 |
| p95 HEAD | 140 ms | 130 ms | |
| Cycles de compteurs (dont calmes) | 574 (86) | 530 (84) | −7,7 % |
| HEAD par personne sur 90 s | 17,2 | 15,9 | |
| Realtime : livraisons (p95) | 28 (661 ms) | 28 (510 ms) | |
| Messages privés / publications (p95) | 18 (715 ms) / 10 (661 ms) | 18 (180 ms) / 10 (540 ms) | |
| Octets applicatifs (mesure) | 16,73 Mo | 16,80 Mo | +0,4 % |
| Budget campagne (octets / frames / requêtes) | 19,78 Mo / 2 633 / 6 306 | 19,66 Mo / 2 330 / 6 190 | |
| Nettoyage | 100 comptes, 0 erreur, 0 incertain | 100 comptes, 0 erreur, 0 incertain | — |

**Lecture honnête.** Dans ce scénario, cent acteurs aiment et commentent en
permanence les trois mêmes publications visibles : les compteurs *changent*
à presque chaque cycle (85 % des cycles « vivants » : 86 calmes sur 574), donc la cadence recule
rarement (59 cycles à 22,5 s, aucun au-delà). C'est le **pire cas** pour ce
lot ; le gain mesuré sous cette charge est **−7,5 % de HEAD**, pas plus. Le
gain de régime calme — celui d'un onglet qui regarde un fil qui ne bouge pas,
le cas courant — est mesuré au banc unitaire à horloge simulée : **4 cycles au
lieu de 6 sur 90 s (−33 %)** ; sur 5 min, par arithmétique de la politique
(15 → 22,5 → 33,75 → 50,6 → 60 s, non mesuré au banc), 7 au lieu de 20
(−65 %). Les deux
chiffres sont vrais, sur deux populations différentes ; aucun n'est « la
capacité ».

Ce que la campagne **ne mesure pas** : le chemin `fil_compteurs` (non
appliqué sur staging, même barrière que la production), les images (le banc
ne télécharge aucun média), le temps réel ciblé (gain client, pas serveur).
Les p95 des deux passes ne se comparent qu'entre elles : même heure, même
staging (configuration 200 connexions / 100 événements/s relevée le 20/09),
mais deux campagnes distinctes à vingt minutes d'écart.

### Mesures par lot (hors campagne)

- **① Fil** (production, lecture seule, vraie première page de 20) : 4 141 →
  6 380 octets **aujourd'hui** (+2,2 Ko : structure fixe, presque aucun
  like/commentaire), **3 requêtes de moins** par page, volume borné ; bascule
  dès ~2 likes + 1 commentaire par publication, −86 % à 30 likes + 10
  commentaires, compte juste au-delà de 200 commentaires. Latence non
  mesurable avant application.
- **② Images** (10 photos réelles de production, la fonction du produit dans
  Chromium) : grilles/albums **−68 %**, fil **+7 %** contre la transformation
  700/q75 mais **zéro transformation**, stockage **+29 %**, 27–89 ms par photo.
- **④ Temps réel** (inventaire `pg_stat_user_tables`, 129 jours) : `profiles`
  20 795 changements (4 537 UPDATE) poussés à tous ; avant, une entrée de cache
  persistée + deux rendus chez chaque connecté par UPDATE de n'importe qui.

## 3. Compromis visibles pour les utilisateurs

- Un like posé par quelqu'un d'autre sur une carte que je regarde **sans rien
  faire** apparaît en **60 s au pire** (15 s dès que quelque chose bouge) ;
  mes propres gestes restent immédiats ; messages, notifications, nouvelles
  publications restent en temps réel.
- Le fil sert les photos publiées après le lot en WebP q0,80 à 720 px : même
  famille que la transformation d'avant (700 px q75), +7 % d'octets ; un
  navigateur qui ne sait pas encoder WebP (Safari < 16) produit un JPEG.
- Une discussion s'ouvre par pages de 30 (#521, non fusionnée) ; la mise à
  jour d'un profil que l'écran ne montre pas n'est plus appliquée (elle l'est
  dès qu'il apparaît, par le résolveur).

## 4. Utilisateurs simultanés testés, durée, scénario

**100 comptes distincts, deux fois, 90 s de mesure chacune** (validité
monotone et murale confirmée), scénario `complet` page 20 du banc : lectures
du fil, likes retirés après insertion, publications, messages privés V3,
dix liaisons `postgres_changes` par socket, trois compteurs visibles relus.
**200 comptes n'ont pas été testés** dans cette session : le budget de la
journée est allé aux deux passes comparables à 100, et un palier 200 sans
passe « avant » comparable n'aurait rien prouvé sur ce lot. Aucun de ces
chiffres n'est un maximum de production ni une garantie de coût.

## 5. Nettoyage des données synthétiques

Passe « fixe » : `work/capacite-100-fixe-2026-09-21.json` — 100 comptes Auth,
100 profils, 130 publications, 120 likes, 120 commentaires, 120 interactions,
50 conversations, 100 membres, 68 messages, 19 accusés, 100 notifications, 1
activité : **tous supprimés, 0 erreur, 0 création incertaine**, 1 051 requêtes
et 329 Ko de nettoyage. Passe « adaptative » :
`work/capacite-100-adaptative-2026-09-21.json` — mêmes comptes de lignes,
**tous supprimés, 0 erreur, 0 création incertaine**, 1 051 requêtes, 329 Ko ;
campagne complète en 19 min 46 s (19 min 49 s pour la première). Les manifestes `*.manifest.json` restent dans `work/` (non
versionné) pour une reprise éventuelle.

## 6. Limites restantes et références

- #521 attend une revue humaine ; tant qu'elle n'est pas appliquée, le fil
  télécharge encore ses listes (et le compte de commentaires reste faux au-delà
  de 200 sur une page).
- `post_comments` / `comment_interactions` / `conv_reads` restent des liaisons
  sans filtre : « s'abonner à ce qui est chargé » est un changement
  d'architecture, pas un réglage.
- Avatars et couvertures restent servis par transformation (192/880 px) ; les
  photos existantes ne sont pas converties.
- Le banc ne mesure ni médias, ni rendu, ni inscriptions par e-mail.

PR : #521 (ouverte), #522, #523, #524 (fusionnées). CI de main : run
`35585796708` (`39e953de`) vert, déploiement production vert. Rapports :
`work/capacite-100-fixe-2026-09-21.json`, `work/capacite-100-adaptative-2026-09-21.json`,
`work/images-legeres-2026-09-21.json` (non versionnés).
