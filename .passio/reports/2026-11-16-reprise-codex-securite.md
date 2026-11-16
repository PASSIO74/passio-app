# Reprise des correctifs de sécurité — 16 novembre 2026

État de travail, à relire avec les preuves de livraison. Cette page expurgée ne contient ni secret, ni donnée d'utilisateur, ni procédure d'exploitation. L'audit initial et son registre détaillé restent distincts des correctifs. La reprise du chat interrompu a récupéré les commits locaux et les fichiers non publiés dans un nouveau worktree isolé ; le dépôt principal et l'ancien checkout sont préservés.

## Mandat et références

Benjamin a étendu le mandat d'audit aux corrections et à leur livraison. La reprise par Codex conserve les branches des autres agents, les contrôles de revue et la CI. Aucune écriture directe sur `main`.

- Code audité initialement : `d4c885afb08d1c7312f58c336c6e5acf9b633197`.
- Base réelle de la reprise, vérifiée par fetch : `a270749b`.
- Branche : `security/codex-finalisation-2026-11-16`.
- [PR de correction #951](https://github.com/PASSIO74/passio-app/pull/951), en brouillon.
- Exécution : Codex, outils locaux PowerShell/Node/Git, Playwright avec Chrome installé, GitHub Actions, API de gestion Supabase. Les agents techniques utilisent le modèle hérité sans sélection supplémentaire. Le modèle exact de chaque agent n'est pas certifié par un nom inscrit dans le code.

## État des opérations

| Surface | État prouvé à cette étape | Limite |
|---|---|---|
| Administration | La session précédente a consigné l'exigence du second facteur ; présence du paramètre relue | Valeur non confirmée : contrôle automatique refusant la lecture de la collection des secrets ; effet et parcours mobile du propriétaire à rejouer |
| Relais d'appels | La session précédente a consigné la fermeture de l'émission des nouveaux identifiants | État fournisseur et expiration des identifiants déjà émis non recontrôlés |
| Authentification | Les trois notifications de sécurité configurées ont été relues à vrai le 16 novembre ; contrôle de connexion primaire relu et testé | Réception effective des emails et sessions réelles non démontrées par ces relevés |
| Messagerie | Correctif client et borne serveur préparés ; régression trouvée en contre-revue puis corrigée | SQL et code non déclarés livrés par leur seule présence dans Git |
| Rencontres | Réserves de création, export, suppression, rétention et notification corrigées et relues séparément | Banc PostgreSQL natif réussi ; essais sur cible encore requis ; promotion/suppression concurrentes hors couverture actuelle |
| Social | Rendu renforcé ; 102 cas de privilèges/RLS réussis sur PostgreSQL natif jetable en CI | Cela ne prouve pas l'application sur les cibles réelles |
| Auth/Edge et veille | Code relu séparément ; banc de veille avec vraie migration et journal, 40 contrôles PostgreSQL natifs réussis en CI | Configuration coordonnée et preuve de livraison encore requises |
| CI et agents | Cloisonnement des secrets et réduction des données non fiables préparés | Les règles textuelles d'un agent ne prouvent pas un confinement de ses permissions |
| Abus et capacité | Plafonds et lectures renforcés ; budget de diffusion messages/accusés intégré et relu, 12 tests client réussis | Banc SQL natif réussi en CI ; Broadcast directs, cumul de comptes, lectures anonymes et plafond financier global hors de cette preuve |

## Vérifications acquises et contrôles encore ouverts

Une campagne ciblée a exécuté **106 tests unitaires : 106 réussis**, sur les messages, rencontres, export, push, rétention, CI et plafonds. Les campagnes supplémentaires ont validé les 12 tests du client de reprise Realtime et 20 tests de connexion/export/suppression. Les connexions primaires documentées sont reconnues, sans traiter un renouvellement ou un second facteur seul comme une nouvelle connexion.

**35 scénarios Chrome distincts** ont été vérifiés avec les API interceptées : accès aux discussions, refus et succès d'inscription, adresse, messages et rendu social. Un scénario était rouge avant la correction du producteur client supplémentaire de notification, puis son fichier et les scénarios sociaux ont réussi. Deux autres suites ont ensuite validé **30 scénarios**, avec **10 répétitions ciblées réussies**. Les deux scénarios corrigés ont été rendus rouges par réinjection locale du défaut ; les mutations ont été retirées. Ces résultats concernent les versions testées et ne prouvent pas la RLS déployée ; la CI doit confirmer l'ensemble au commit final.

Le build local **minifié** et son contrôle d'intégrité passent : neuf scripts applicatifs et la feuille de style correspondent aux empreintes déclarées. Les quatre prérequis client des nouvelles migrations ont été vérifiés dans les scripts minifiés ; deux marqueurs initialement limités à des commentaires ont été corrigés pour survivre au build. Le banc SQL social est maintenant découvert par le lanceur automatique ; les bancs de concurrence exigent PostgreSQL natif et refusent une simulation locale qui prétendrait le remplacer.

Les audits locaux de données personnelles suivies dans Git, d'échappement, de globals et de publication Realtime passent. Leurs analyses statiques ont une portée limitée aux formes reconnues.

Le premier passage CI était rouge. Ses deux échecs unitaires ont été corrigés localement ; les attentes navigateur ont été adaptées au nouveau contrat, en préservant les assertions de refus. Le contrôle général a ensuite identifié une borne non référencée pour le nouveau job de build de preview : corrigée et testée. Son majorant initial provient de l'ancien job complet ; la durée du job séparé reste à relever lors de son premier passage CI réussi. Une nouvelle CI et une revue ancrée sur le commit final restent nécessaires avant fusion.

`npm run verif` a été rejoué entièrement après intégration du budget client : résultat vert. La CI a ensuite validé 102 cas sociaux sur PostgreSQL natif et identifié deux défauts dans les nouveaux bancs : observation périmée des statistiques de contention et décor historique de télémétrie incorrect. Les corrections préservent les assertions de concurrence, de rétention et d'horloge serveur. La CI `43886364040`, au commit `482b4bb3`, valide maintenant les bancs natifs Realtime, veille et rencontres. Le banc historique de sécurité a ensuite révélé une surcharge `cron.unschedule(bigint)` absente de son décor : correction limitée au test, avec diagnostic visible, retrait effectif du cron historique et planification rejouée. Les migrations de production ne changent pas pour cette correction. La CI `43888963493`, au commit `3c438e70`, confirme ensuite les audits et les 55 bancs SQL sans échec ; le banc historique termine avec 60 contrôles verts et ses 34 cas de capacité passent avant et après correction.

Le budget Realtime est préparé et relu, avec refus avant émission et reprise bornée des accusés par propriétaire. Il ne constitue pas une garantie de livraison distante. Le cumul de trafic de plusieurs comptes, les plafonds financiers et les lectures anonymes ne deviennent pas bornés par un seul quota par compte.

Le passage navigateur au commit `482b4bb3` valide iPhone et cinq des six suites Chrome. Trois échecs de la dernière suite ont été reproduits : notification désormais serveur et échéances de recul après erreur. Les corrections ne touchent que les tests : les 26 scénarios de compteurs, 10 répétitions ciblées et les deux parcours de contenu passent. La notification unique et les refus restent vérifiés ; un doublon de notification réinjecté est détecté. Une contre-épreuve supplémentaire sur les compteurs a été refusée par le contrôle automatique avant édition et n’a pas été exécutée. La CI `43890773273` au commit `ed753d5c` confirme les six suites Chrome, iPhone, les audits, les 55 bancs SQL et l’artefact. La gouvernance attendait alors la revue ; les jobs privilégiés étaient donc sautés et l’agrégat rouge. La revue R1 a depuis été publiée sur instruction expresse de Benjamin ; elle ne transforme pas les jobs sautés en preuves.

La récupération a été complétée pour les deux nouveaux schémas privés. Le DDL conserve leurs dépendances et droits ; les cinq tables d’autorisation de rencontres sont archivées et relues, tandis que les compteurs Realtime sont explicitement éphémères. La contre-revue a détecté puis fait corriger l’import privé en mode limité, un saut de pagination concurrente et le contrôle du DDL avant application. Les campagnes ciblées passent (66 tests côté DDL, 114 côté données, avec recouvrement possible), dont 46 vérifiés séparément. La reconstruction PostgreSQL native et son WAL restent requis en CI ; les essais en mémoire ne les remplacent pas. Le contrat de lecture seule de l’API a été vérifié par métadonnées et valeurs synthétiques, sans export utilisateur.

La modification du workflow de sauvegarde a d’abord été refusée automatiquement ; Benjamin l’a ensuite autorisée expressément, et sa proposition relue a été appliquée dans la branche. Ses huit tests de frontières passent, ainsi que le contrôle général complet et l’audit des workflows. L’export complet des comptes et médias vers le poste a été refusé séparément avant exécution et n’a pas été retenté. Des sauvegardes physiques et archives chiffrées existantes ont été confirmées par leurs métadonnées ; cela ne démontre pas une restauration et ne crée pas une nouvelle archive.

La revue R1 [5922486046](https://github.com/PASSIO74/passio-app/pull/951#pullrequestreview-5922486046) porte les neuf fichiers SQL et leurs 17 couples fichier/cible au commit `ed753d5c`. Les attestations locales ont été vérifiées par le script officiel contre cette revue réelle. Les SQL ne changent pas avec le complément de récupération. La seconde revue doit porter le seul commit d’enregistrement des attestations ; aucun déplacement artificiel de leur ancre n’est nécessaire.

Les contre-revues par des agents séparés ont effectivement détecté des régressions avant livraison. Elles ne sont ni une revue humaine indépendante, ni une certification de sécurité. Toute retouche critique invalide les conclusions portant uniquement sur le commit précédent.

## Ordre de livraison et récupération

1. Corriger les réserves, exécuter les bancs SQL jetables et relire le diff final.
2. Vérifier les dépendances de staging et tester les refus avec les vrais rôles et des données synthétiques.
3. Consigner les revues et attestations sur les fichiers exacts et les cibles exactes. Conserver les gardes du script officiel de migration.
4. Livrer les composants selon leurs prérequis : client avant les contraintes qui exigent sa présence, configuration authentifiée avant fermeture de la veille. Une migration ne devient pas appliquée par une fusion de code.
5. Vérifier version servie, configuration, état effectif et disponibilité ; conserver un retour arrière examiné qui ne réouvre pas silencieusement une faille.

Les plafonds de dépenses, la restauration de sauvegardes et les kill switches doivent être vérifiés par leur résultat effectif. Une sauvegarde présente ne prouve pas une restauration réussie.

La confrontation des catalogues réels du 16 novembre a confirmé des prérequis manquants sur une cible et une configuration opérationnelle à préparer avant la livraison. Ces vérifications sont restées en lecture seule. Neuf migrations ont depuis été appliquées au staging, par le canal officiel après revue et attestation. Aucune migration ni modification de configuration de production, ni rotation de secret, n’a encore été effectuée à cette étape.

## Réponses directes à cette étape

**Que peut réellement faire un attaquant aujourd'hui ?** Les chemins confirmés par l'audit restent ouverts tant que chaque correctif correspondant n'a pas été livré et vérifié. Cette page publique n'en donne pas les procédures. Les gestes de configuration déjà appliqués ferment des accès précis ; ils ne ferment pas tout le registre.

**Quelles protections avons-nous effectivement vérifiées ?** Les configurations relues et les tests explicitement cités ci-dessus. Une requête privilégiée de catalogue ne démontre pas l'efficacité de la RLS ; un résultat HTTP sans contrôle des lignes modifiées ne démontre pas une autorisation correcte.

**Quel scénario à 100 000 utilisateurs est démontré ?** Aucun nouveau scénario. Il faut distinguer comptes inscrits, activité quotidienne, connexions simultanées et trafic hostile. Aucune charge de production n'est autorisée ou exécutée par cette reprise.

**Quels points empêchent encore de conclure ?** La revue finale, les bancs et essais sur cible, l'application effective des migrations, les preuves de livraison et de récupération, ainsi que les constats non couverts par les lots. L'absence de faille trouvée ne constitue jamais une garantie absolue.
