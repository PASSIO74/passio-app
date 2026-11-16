# Préparation du GO grande échelle — 16 novembre 2026

État initial : **GO non établi**. Mandat en cours, critères dans `docs/GO_GRANDE_ECHELLE_2026-11-16.md`. Baseline GitHub `627b6d4c71cf8aaea2c9da275d6dceeec866f6ff`, branche `test/go-grande-echelle-2026-11-16`.

## Preuves reprises et portée

La PR951 a livré son lot de sécurité : client et cinq fonctions Edge de même révision, huit nouvelles migrations de production, neuf sur staging, contrôles d’autorisation et CI verts. La veille primaire, un battement avec quatre lectures réussies et les deux tests de secours expressément autorisés ont été observés. Les tests de secours manuels ne démontrent pas la ponctualité de l’ordonnanceur GitHub. Ce lot ne vaut pas clôture de l’audit complet ni preuve de capacité à 100 000 comptes.

## État du chantier

| Lot | État | Prochaine preuve |
|---|---|---|
| Réconciliation sécurité/privacy/continuité | Inventaire actuel en cours | Défauts reproduits et statuts datés, sans reconduire aveuglément les constats anciens |
| Inscription et réception réelle de l’email | DNS 4/4 ; réception et connexion déclarées par Benjamin ; confirmation/session/consentements vérifiés côté serveur | Refus, renvoi et expiration à rapprocher de la couverture existante |
| Parcours produit/modération | Couverture actuelle à rapprocher des critères | Matrice et recette ciblée, puis correction des défauts réels |
| Reprise complète | Nouveau DDL privé et bancs natifs validés par PR951 ; exercice hébergé complet encore à établir | Cycle isolé avec comptes et médias synthétiques et tables privées |
| Capacité à volume | Fil du banc aligné sur le RPC actuel ; prévol staging réussi ; banc natif corrigé et exercé | Paliers de concurrence, puis interprétation du volume et des limites |
| Exploitation/coûts/quotas | Quotas réels PROD/staging relevés, sans changement de configuration | Dimensionnement et garde-fous liés aux mesures |

## Vérifications du 16 novembre

Le prévol fonctionnel du banc réaliste s’est terminé sur staging à 18:52 UTC : deux comptes Auth distincts, lecture du fil par le RPC actuel, publication relue par le destinataire, message livré et compteur de « j’aime » vérifié à 1 → 2 → 1. Zéro palier de charge pendant ce prévol. Nettoyage déclaré réussi, puis contrôlé séparément par une transaction en lecture seule à 18:54:59 UTC : 21 catégories sans résidu, un identifiant technique de l’activité supprimée volontairement conservé par le mécanisme anti-réutilisation. Les comptes, profils, publications, commentaires, conversations et participations du test ont disparu. Cette trace technique n’est pas présentée comme zéro.

La recette publique d’inscription a été réalisée avec Benjamin sur une boîte Gmail autorisée : réception du message, confirmation et connexion réussies selon son retour. À 19:48:06 UTC, une lecture serveur limitée au compte de test confirme exactement un compte, une confirmation, une connexion enregistrée, une session active et les consentements aux versions courantes. Le captcha a demandé une intervention humaine ; aucun contournement ni préconfirmation administrative n’a servi de preuve à cette recette.

Le banc SQL natif utilise une base locale jetable, PostgreSQL 17.12, 100 000 profils applicatifs distincts, 100 000 publications, 300 000 likes et 200 000 commentaires. Une omission d’index dans le premier montage a été reproduite et corrigée en reprenant uniquement onze index déjà déclarés dans les migrations. Le catalogue est vérifié avant insertion ; une absence ou une différence fait désormais échouer le test. Aucun index produit nouveau n’est créé par ce lot.

Sur le montage corrigé, neuf plans sont mesurés sous `authenticated` avec RLS : médianes SQL de 619,494 ms pour le fil, 0,984 ms pour le profil et 2,516 ms pour le RPC compteurs isolé. Le corpus est uniforme, public et créé au même instant ; le tri, les transports et les configurations diffèrent d’une utilisation hébergée. ROLLBACK puis contrôle indépendant des résidus et des connexions : zéro. **Ces valeurs ne prouvent ni 100 000 comptes Auth, ni une concurrence, ni les P95/P99 hébergés.** L’empreinte du rapport corrigé est `c36a647636025de08f1dfddcd2d6b7b4f26e876d4c8e301255ca11b5a85d30a6` ; les mesures précédentes du montage sans index ne servent pas à annoncer une performance produit.

Les plafonds Realtime observés diffèrent : staging 200 connexions et 100 événements/s ; production 10 000 connexions et 2 500 événements/s. Un plafond configuré n’est pas une capacité mesurée. Les résultats staging ne seront pas extrapolés à la production.

## Première campagne de concurrence actuelle

Source locale `5158a031ddc43ce1d402fd9a4b44ceb659bdc032`, baseline distante restée `627b6d4c…`. Le second prévol avec le double tri exact de l’UI est vert avant la campagne. Cent comptes distincts sont préparés sur staging ; chacun des paliers dure 60 secondes, page de vingt publications, compteurs adaptatifs et profil Realtime actuel sans CDC. Budgets conservés : 20 000 requêtes et 180 Mo par campagne, réserve de nettoyage séparée ; arrêt au premier palier dégradé.

| Acteurs | HTTP mesurés | Erreurs HTTP | P50 / P95 / P99 (ms) | Verdict du scénario |
|---:|---:|---:|---:|---|
| 25 | 739 | 0 | 85 / 144 / 197 | Vert |
| 50 | 1 505 | 0 | 84 / 135 / 197 | Vert |
| 100 | 2 201 | 177 (8,04 %) | 114 / 12 001 / 12 008 | Rouge ; aucune augmentation à 200 |

Les erreurs à cent acteurs sont des expirations côté client concentrées sur environ quatorze secondes de départ de requêtes, avec deux livraisons de messages échouées sur huit. Les agrégats gateway observés indépendamment montrent un pic de latence origine dans cette même fenêtre ; l’hypothèse d’un incident limité au générateur ne suffit donc pas. La cause entre base, pool, service et réseau amont reste à établir. Les seuils n’ont pas été relevés pour obtenir un résultat vert.

Le contrôle du workflow de déploiement a été disponible sur les 44 observations espacées de trente secondes, sans concurrence observée. Cela n’est pas une garantie d’exclusivité absolue. Le nettoyage de la campagne a terminé sans erreur, puis un comptage indépendant sur le manifeste exact confirme les 21 catégories de données à zéro et le marqueur anti-réutilisation unique attendu. Aucun compte hors campagne supprimé. Empreinte du manifeste final : `a0ae46912ddff8559eec3874e30214928c32de5b1204e3103542e1d9a970c6c5`.

Les paliers portent sur un petit corpus fonctionnel ; ils ne sont pas une charge combinée avec les 100 000 profils du banc SQL local. Commentaires écrits, RSVP, reconnexion, endurance, débit média et réception SMTP restent à éprouver séparément. Les deux paliers verts ne constituent pas un GO grande échelle.

Les lots de confidentialité et de récupération restent en préparation et en contre-revue. Aucun correctif ni changement de configuration n’a encore été déployé en production dans ce nouveau chantier. Le compte autorisé reste réservé à la recette ; aucun compte extérieur aux campagnes n’est concerné par leur nettoyage. Le **GO reste à établir** après corrections, recettes, charge et livraison vérifiée.
