# Audit de sécurité, de résistance aux abus et de capacité « 100 000 utilisateurs » — 2026-11-15

*Synthèse publique, volontairement réduite. Ce dépôt est public et rien de ce que l'audit a trouvé n'est encore corrigé : ce document ne décrit donc ni mécanisme, ni emplacement, ni seuil, ni valeur de configuration. Certains constats n'y figurent pas, même en termes généraux, parce que leur simple énoncé désignerait une cible. Le dossier complet (registre P0 à P4 avec preuves, scénarios, emplacements et tests de non-régression ; matrice des surfaces ; volet capacité ; cartographie ; rapports des analystes ; bancs d'essai et sorties brutes) est à diffusion restreinte, hors dépôt, chez le responsable du projet.*

| | |
|---|---|
| Commit audité | `d4c885afb08d1c7312f58c336c6e5acf9b633197` — tête de `main` le 15/11/2026 à 15:07 (heure de Paris) |
| Correspondance avec la production | les fichiers de code servis en production ont les mêmes empreintes que ce commit construit localement ; deux écarts expliqués, sans effet sur le code |
| Environnements | production : lecture seule (configuration, structure, requêtes anonymes bornées) ; environnement d'essai : comptes synthétiques ; poste local : contrôles, construction, essais en navigateur |
| Mandat | audit, vérifications, recommandations. Aucun correctif, aucune migration, aucune modification de règle d'accès, aucune rotation de secret, aucune fusion, aucun déploiement |
| Méthode | 16 analystes par domaine ; 7 lots d'essais joués avec de vrais rôles (visiteur sans compte, comptes connectés), dont un en navigateur ; 10 contre-relecteurs chargés de réfuter ; relevé de la configuration réellement déployée ; 2 relectures finales de la synthèse |

**Avertissement.** Ne pas avoir trouvé de faille n'est pas une garantie de sécurité. Une partie des surfaces n'a été examinée que par lecture, d'autres pas du tout ; aucune attaque n'a été menée jusqu'à la panne ; la contre-revue est faite par des instances du même modèle d'IA, pas par un tiers. Un test d'intrusion par une équipe extérieure reste à faire avant une ouverture large.

## 1. Verdict

| Question | Verdict |
|---|---|
| **Les comptes et les données sont-ils protégés ?** | **Le cœur tient, avec des exceptions.** Aucun chemin n'a été trouvé pour prendre le compte d'un autre, écrire en base sous son identité, modifier ou supprimer ses contenus, ni lire une conversation privée ordinaire. Des exceptions confirmées par l'exécution existent dans des cas particuliers ; elles sont au registre restreint. Aucun constat de niveau P0, sous une réserve : la contre-revue tient l'un des P1 pour candidat au niveau supérieur si une mesure venait confirmer une estimation. |
| **Confidentialité** | **Les conversations privées tiennent, le reste fuit par les bords.** Plusieurs règles ne réservent pas aux seules personnes concernées ce qui devrait l'être ; un compte « privé » ne masque pas tout ce qu'il devrait ; un membre peut apprendre des éléments techniques sur d'autres membres. Les métadonnées des médias déposés n'ont pas été examinées. |
| **Résistance aux abus** | **Insuffisante.** Des plafonds existent et sont correctement construits, mais ils ne couvrent ni le cumul dans le temps, ni tous les usages, ni les visiteurs sans compte. Un acteur décidé peut vraisemblablement dégrader le service pour tous ou en faire monter le coût. Aucune de ces voies n'a été jouée jusqu'au bout : le mandat l'interdisait. |
| **Capacité à accueillir 100 000 utilisateurs** | **Non démontrée.** La seule mesure valide porte sur 100 utilisateurs simultanés simulés, pendant 60 à 90 secondes, sur une base presque vide, avec une version de l'application antérieure au 9 novembre. L'outil de mesure du projet ne fonctionne plus sur l'architecture actuelle. |
| **Code, déploiement, agents** | **À renforcer.** Par les entrées du dépôt, aucun chemin n'a été trouvé pour un inconnu. Mais aucune validation indépendante n'est exigée avant la production, et des agents automatiques disposent de droits étendus sans confirmation humaine, alors que leur exposition à des contenus non fiables n'est pas assez cloisonnée. Aucune injection n'a été jouée. |

**Décompte après contre-revue : 172 constats actifs — 0 P0 · 11 P1 · 47 P2 · 77 P3 · 37 P4**, pour environ 220 constats bruts avant fusion. Sur les onze P1, deux décrivent la même chaîne et deux dépendent d'un réglage de facturation qui n'a pas pu être lu.

## 2. Les onze constats P1, par famille

| Famille | Nombre | En termes généraux | Force de la preuve |
|---|---:|---|---|
| Abus et plafonds | 4 | un compte peut faire écrire au serveur beaucoup plus qu'il n'envoie ; il manque des plafonds cumulés ; des opérations coûteuses sont possibles sans compte ; des quotas partagés peuvent être consommés par un tiers | un mécanisme confirmé par l'exécution à très petite échelle ; ampleur estimée, non mesurée |
| Mise en production et agents | 2 | pas de validation indépendante avant la production ; agents insuffisamment cloisonnés | configuration relue deux fois ; comportement d'un agent non mesuré |
| Coûts | 2 | selon des réglages de facturation non lus, un dépassement est une interruption du service ou une facture | règles officielles des fournisseurs relues |
| Capacité | 2 | un calcul fréquent coûte trop cher par élément ; rien n'est démontré au-delà de 100 utilisateurs simultanés | coût unitaire mesuré ; campagnes existantes relues |
| Messagerie | 1 | un compte peut dégrader l'usage de la messagerie d'un autre membre | confirmé par l'exécution, en navigateur, deux fois |

Les constats P2 « avant croissance » touchent des personnes (règles des rencontres et blocage, identité, direct vidéo, session volée, harcèlement) et la capacité à réagir (surveillance, réponse à un abus, sauvegardes). Une part d'entre eux est confirmée par l'exécution. Ils sont détaillés au registre restreint.

## 3. Ce qui a été vérifié et tient

Par ordre de force de la preuve. « Tient » veut dire : l'attaque a été refusée **et** l'état relu est inchangé, la donnée visée existant bien. Un code de réponse ne décide jamais du verdict.

1. **Par exécution avec de vrais rôles**, sur un environnement d'essai dont les règles d'accès ont été comparées objet par objet à celles de la production (identiques, sauf une fonctionnalité récente) — 171 cas par l'interface de données (98 où la protection tient, 62 écarts, 11 non tranchés) et 30 scénarios en navigateur (12, 17, 1) : cloisonnement des conversations ordinaires, de leurs messages et de leurs pièces jointes ; impossibilité d'écrire en base sous l'identité d'un autre ; canaux temps réel privés refusés aux étrangers et aux visiteurs ; stockage cloisonné par propriétaire ; blocage effectif sur les messages, les groupes, les abonnements et les appels ; informations sensibles d'une rencontre refusées à qui n'y est pas inscrit ; unicité des gestes et tenue des capacités sous concurrence ; fonctions de pilotage refusées ; révocation des sessions ; métadonnées modifiables du compte sans effet sur les règles d'accès de la base. La plupart des écarts sont de sévérité P3 ou P4.
2. **Par essais en navigateur** : aucune charge écrite par un autre compte ne s'est exécutée chez la personne visée, sur une trentaine de champs et d'écrans. Des points de rendu exécutent en revanche ce qu'on leur donne si la donnée est hostile ; ils ne sont tenus que par la validation côté serveur, et les protections de second rang sont à renforcer.
3. **Par requêtes anonymes réelles en production**, bornées : aucun message, aucune conversation, aucune notification, aucun état de compte lu ; fonctions serveur refusées sans session ; aucun fichier de travail servi.
4. **Par relevé de la configuration déployée** : règles d'accès actives sur toutes les tables ; confirmation de l'adresse e-mail, anti-robot côté serveur, refus des mots de passe compromis, nouvelle authentification pour changer de mot de passe ; passerelle d'authentification sur toutes les fonctions serveur ; sauvegardes quotidiennes présentes. Une seule clé réelle dans tout l'historique public : la clé publique, qui l'est par conception.
5. **Par comparaison d'empreintes** : la production sert le commit audité.
6. **Par trois lectures indépendantes du code d'interface** (deux par points d'injection, une ligne à ligne sur les 8 749 lignes modifiées depuis l'audit précédent) : aucune injection d'un utilisateur vers un autre trouvée. Ce n'est pas une preuve d'absence.

Contrôles du dépôt rejoués sur le commit audité : `npm run verif` (dont `audit:realtime`, `audit:echappement`, `audit:globals`) : code 0, deux fois. `npm run test:local` : 2 917 réussis, 11 ignorés, 6 échecs pendant que le poste faisait tourner l'audit en parallèle ; ces 6, rejoués seuls, passent. Intégration continue du commit : verte ; ses suites à comptes réels tournent sur l'environnement d'essai, pas sur la production. `tests/e2e/authz-critical.spec.js` a été lu avant tout choix d'environnement ; il écrit en base réelle et n'a pas été lancé par l'audit. Les suites qui écrivent en production n'ont pas été lancées.

Portée de la contre-revue : huit domaines sur seize ont été relus en entier par un second agent ; les huit autres ne l'ont été que sur des points ciblés (code modifié, migrations récentes, points résiduels) et reposent pour le reste sur l'analyste et sur l'exécution. Bilan : 113 verdicts — 62 confirmés, 49 confirmés avec réserve, 1 non confirmé, 1 réfuté — et 29 constats nouveaux. Aucun P1 réfuté ; plusieurs sévérités abaissées, dont deux que le responsable avait signalées P1 en cours d'audit.

## 4. Réponses directes

**« Qu'est-ce qu'un attaquant peut réellement faire aujourd'hui ? »**
Un *visiteur sans compte* peut lire et aspirer ce qui est public — et un peu plus que ce qui devrait l'être —, et solliciter des opérations coûteuses. Dans les essais, il n'a pu lire ni message, ni conversation, ni pièce jointe, ni état de compte, et n'écrit dans aucune table de contenu.
Un *compte malveillant* peut tromper sur son identité, harceler, dégrader la messagerie d'un autre membre, consommer les ressources du service, et obtenir par certaines fonctions des informations réservées à d'autres.
*Contre le compte d'un autre* : pas de prise de compte, pas d'écriture en base sous son identité, pas de modification de ses contenus, pas de lecture de ses conversations ordinaires — refusé à l'exécution. Des exceptions confirmées existent dans des cas particuliers. Une session volée peut servir à verrouiller le compte de sa victime.
*Contre le code et le déploiement* : rien de démontré par les entrées du dépôt ; un agent détourné ou un jeton volé atteindrait la production sans regard indépendant.
*Rendre l'application indisponible ou faire monter la facture* : vraisemblablement oui, par plusieurs voies. Aucune n'a été jouée jusqu'au bout.

**« Quelles protections avons-nous effectivement vérifiées ? »** Celles du § 3, chacune avec la méthode qui l'établit.

**« Quel scénario à 100 000 utilisateurs est démontré, sous quelles conditions ? »** Aucun. Est mesuré : 100 utilisateurs simultanés simulés, sans erreur, le 7 novembre, sur l'environnement d'essai à la plus petite taille de calcul, par un programme sans navigateur qui imitait l'application d'avant le 9 novembre, sans médias ni inscriptions, sur une base presque vide. À 200, l'unique essai a perdu sa cible après une minute environ, pour une cause restée inconnue. Tout ce qui est dit au-delà — inscrits, actifs par jour, simultanés, pics, coûts — est une estimation, avec ses hypothèses, au volet capacité restreint. Cet audit n'a lancé aucune montée en charge : le banc du dépôt s'arrête de lui-même à son pré-vol, et ce garde-fou n'a pas été contourné. Seule mesure propre à l'audit : la latence à vide de la production, un client, quelques lectures (médianes de 121 à 214 ms), qui ne dit rien de la tenue sous charge.

**« Quels points empêchent encore de conclure ? »**
1. Des réglages de facturation que seul le propriétaire peut lire.
2. Aucun essai avec un compte connecté en production : la preuve passe par un environnement d'essai, qui peut être en retard sur la production.
3. Lus, pas exécutés : une fonctionnalité récente absente de l'environnement d'essai, les fonctions serveur appelées avec une session, ce qui dépend des réglages d'authentification de production, les gestes du pilotage avec un compte réel, la chaîne des agents.
4. Non examinés : les métadonnées des médias, les performances sur un vrai téléphone, certains réglages du compte de la plateforme de code.
5. Aucune mesure de charge sur l'architecture actuelle.
6. Le comportement réel d'un agent IA devant un texte piégé.
7. Aucune relecture par un tiers.
8. Aucune restauration complète rejouée depuis une sauvegarde au format actuel.

## 5. Détection et récupération

| Question | Verdict |
|---|---|
| Accès anormaux et abus | non détecté pour les accès ; partiel pour les abus |
| Saturation, erreurs, dépenses | détecté pour les mises en ligne en échec ; prévu par le code mais jamais éprouvé en réel pour les erreurs et les pannes ; partiel pour la saturation ; non détecté pour les dépenses |
| Écritures perdues, refus silencieux | partiel |
| Indisponibilité d'une source de surveillance | partiel : une source illisible n'est jamais affichée comme calme |
| Coupe-circuits, retour arrière | présents ; le retour arrière n'est pas armé sur tous les supports |
| Sauvegardes, restauration | sauvegardes présentes ; restauration complète à rejouer sur le format actuel |
| Organisation | une seule personne ; procédures de réponse non exercées |

La supervision crée elle-même un accès privilégié ; il est traité comme une surface d'attaque au dossier restreint.

## 6. « Protéger le code » : ce que cela veut dire

- **Le code du navigateur est public par nature.** Tout ce que l'application envoie au téléphone d'un visiteur peut être lu par lui. Le rendre illisible ne protège rien : c'est un ralentisseur, jamais une serrure. Les clés qui s'y trouvent sont publiques par conception ; ce qui protège les données, ce sont les règles appliquées côté serveur.
- **Ce qui peut rester confidentiel, c'est le dépôt et le serveur.** Le dépôt n'a aucune obligation d'être public : c'est une décision à prendre, et elle est au plan.
- **Ce qu'il faut garantir, c'est l'intégrité** : que le code servi soit bien celui qui a été relu. La correspondance est vérifiée ; c'est le contrôle de *qui* peut le changer qui manque.
- **Ce qu'il faut protéger absolument, ce sont les secrets et les privilèges** : leur nombre, leur emplacement, leur âge et qui peut les lire comptent plus que la lisibilité du code.

## 7. Plan priorisé (termes généraux ; le plan détaillé, constat par constat, est au dossier restreint)

**Avant de développer l'audience**
1. Gestes du propriétaire, sans code : lire et consigner les réglages de facturation ; exécuter les gestes de fermeture immédiate listés au dossier restreint ; décider si le dépôt reste public.
2. Messagerie : fermer le constat P1 et les écarts confirmés par l'exécution.
3. Mise en production : une approbation que ni l'auteur ni un agent ne peut donner seul ; secrets cloisonnés.
4. Agents : confirmation humaine pour les gestes irréversibles ; accès aux données réduit au nécessaire ; contenus non fiables tenus à l'écart des consignes.
5. Plafonds : cumulés, par usage, et pour les visiteurs sans compte.
6. Rencontres, identité, direct vidéo, sessions : fermer les écarts confirmés par l'exécution.
7. Environnement d'essai : aligné sur la production avant chaque changement, et comparé automatiquement.

**Avant toute campagne d'acquisition**
8. Réparer l'outil de mesure, puis mesurer par paliers sur un environnement dimensionné.
9. Alléger les calculs fréquents ; étaler les pics que l'application s'inflige.
10. Surveillance : usage et dépense, abus de lecture, inscriptions ; gestes outillés de réponse à un abus ; un exercice des procédures.
11. Sauvegardes : décider de la politique, jouer une restauration complète.
12. Un test d'intrusion par une équipe extérieure.

**Ensuite, puis améliorations** — les autres P2, les P3 et les P4 : durcissements de configuration et de chaîne, règles secondaires, hygiène des dépendances.

## 8. Effets de bord et limites de l'audit lui-même

- Aucune écriture volontaire en production. Un effet de bord imprévu sur un point d'entrée de la production a été constaté (quelques lignes techniques, sans donnée personnelle) ; le test a été arrêté et le point est à instruire.
- L'environnement d'essai a reçu des comptes synthétiques et des lignes de test. Contrôle de fin d'audit : plus aucun compte de l'audit, plus aucune ligne à son nom. Il y reste des lignes techniques orphelines, sans donnée personnelle, que rien ne permet de distinguer de celles que les essais automatiques du projet y laissent déjà ; elles n'ont pas été purgées.
- Aucun secret n'a été affiché, copié ni modifié. Aucune donnée personnelle n'a été extraite.
- Aucun test de charge, aucune recherche exhaustive de mot de passe, aucun scénario destructeur.
- Non fait, et pourquoi : essais avec un compte en production (c'est une écriture, hors mandat) ; montée en charge (banc arrêté à son pré-vol, environnement partagé) ; lecture de la facturation (aucun accès) ; exercice de restauration (hors mandat) ; revue ligne à ligne de tout le code d'interface (lecture dirigée, puis relecture du code modifié) ; analyse statique et recherche de secrets outillées (outils absents du poste, recherches par motifs) ; avis juridique.
- La demande de fusion qui porte ce document suspend volontairement l'intégration continue : elle ne contient que du texte, et ne doit pas produire de version d'essai en ligne.

## 9. Outils et modèle réellement observés

- Modèle : Claude Fable 5.2 (`claude-fable-5-2`), dans l'application de bureau Claude Code, pour l'audit, les essais et les relectures ; sous-agents lancés par l'outil d'orchestration de la même session, même modèle. La toute fin de session (commit, demande de fusion) a tourné sous Claude Opus 5.5 (`claude-opus-5-5`), après un changement de modèle de la session.
- Outils : `git`, `gh` (lecture), `node` 24, `npm`, `curl`, Playwright, connecteur de lecture de la base (qui contourne les règles d'accès : il sert à lire la configuration, jamais à prouver un refus), interface de gestion de l'hébergeur de la base en lecture seule.
- Absents du poste : `psql`, Docker, Deno, Python, gitleaks, semgrep.
- Contre-revue par un second modèle ou par un tiers : **n'a pas eu lieu**.

## 10. Impact Centre de pilotage / Sentinelle

Cet audit ne modifie rien. Il constate que le pilotage est l'accès le plus privilégié du système, qu'il ne voit ni la dépense ni certains abus, et que ses jauges supposent un réglage de facturation non vérifié. Les points 1, 10 et 11 du plan le concernent directement.
