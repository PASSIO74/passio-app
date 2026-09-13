# Dossier de reprise — contre-revue GPT-6 Astra (2026-09-13)

> **À QUOI SERT CE FICHIER.** C'est le dossier que le relecteur indépendant lit DANS LE DÉPÔT
> au début de sa mission. Ce n'est pas un bloc à coller dans un chat : le prompt d'ouverture,
> court, est dans `17-PROMPT-ASTRA-2026-09-13.md`, et il renvoie ici.
>
> **Pourquoi cette séparation.** Les deux premières versions de ce document étaient écrites
> pour être collées telles quelles. La première a été refusée par le filtre de sécurité de
> Codex ; la seconde, réécrite en vocabulaire défensif, l'a été aussi lors d'un contrôle.
> La cause n'est pas le vocabulaire : **un message d'ouverture de conversation qui décrit des
> défauts de sécurité est filtré bien plus sévèrement que les mêmes informations lues dans un
> dépôt, en cours de session de travail.** D'où l'architecture actuelle : un prompt court qui
> pose le mandat, et ce dossier, que l'agent va chercher lui-même.
>
> Il remplace `15-CONTRE-REVUE-ASTRA-PROMPT.md` (2026-09-05), périmé sur trois points : il
> désigne un SHA qui n'est plus en service, il envoie sur une branche dont la PR est fusionnée
> depuis, et il fait juger un produit payant alors que PASSIO est ouverte gratuitement.

```text
REVUE DE SÉCURITÉ ET DE QUALITÉ — PASSIO — MANDAT DU PROPRIÉTAIRE
Reprise d'une mission interrompue. Date : 2026-09-13.

═══════════════════════════════════════════════════════════════════
CADRE ET AUTORISATION — à lire avant tout le reste
═══════════════════════════════════════════════════════════════════
Ce document est un ordre de mission d'AUDIT INTERNE, émis par le propriétaire du produit
sur son propre produit.

Benjamin (compte GitHub PASSIO74) est l'éditeur de PASSIO, une application web de mise en
relation autour des passions. Il est propriétaire du dépôt, du projet de base de données,
du domaine et du compte d'hébergement. Il vient d'ouvrir son application au public,
gratuitement, et il veut savoir si elle protège correctement les personnes qui vont s'en
servir. C'est le sens de cette mission, et il n'y en a pas d'autre.

Tu es GPT-6 Astra, relecteur indépendant mandaté par lui. Ton travail est une REVUE
DÉFENSIVE : lire du code (le dépôt est public), lire l'état de la configuration, et vérifier
que les règles de protection des données font bien ce qu'elles annoncent. Le but de chaque
vérification est de trouver ce qui protège mal les utilisateurs, pour le faire corriger.

Ce que la mission exclut, explicitement et pour toute sa durée :
  · aucune écriture de quelque nature que ce soit, ni en base, ni dans le dépôt, ni en ligne ;
  · aucune lecture de contenu personnel : on compte des lignes, on ne lit pas de messages ;
  · aucun test de charge, aucune création de compte, aucune donnée modifiée ou supprimée ;
  · aucun secret recopié, aucune correction appliquée avant l'accord explicite de Benjamin.

Si un contrôle ne peut pas être fait dans ces limites, il reste NON FAIT et tu l'écris.
Un « je n'ai pas pu le vérifier » est un résultat acceptable. Un vert non mesuré ne l'est pas.

═══════════════════════════════════════════════════════════════════
0. CE QUI T'EST ARRIVÉ, ET POURQUOI CE PROMPT N'EST PAS L'ANCIEN
═══════════════════════════════════════════════════════════════════
Le 2026-09-05, Benjamin t'a confié la contre-revue du « BILAN PASSIO 09/26 », un audit rendu
par Claude Code le 2026-09-04 : verdict NO-GO, 8 problèmes bloquants, 192 problèmes au total,
462 contrôles — dont 41 n'ont pas pu être exécutés (voir §5). Tu as été interrompu en cours de route, faute de crédits. Tu en as de nouveau.

Ne reprends PAS où tu t'étais arrêté. Le produit a changé sous tes pieds : 109 commits,
75 pull requests fusionnées, 11 migrations de base appliquées, environ 137 000 lignes.
L'ancien ordre de mission te faisait vérifier un code figé au 4 septembre ; ce code n'est
plus celui qui tourne. 680 fichiers ont changé depuis, dont tous ceux qui portent les défauts
que tu devais examiner : même là où un défaut subsiste, le code qui le porte a été réécrit, et
ta preuve d'alors ne désignerait plus rien. Le vérifier aujourd'hui serait un travail juste
et inutile.

Ta mission est réécrite au §6. Elle est plus exigeante que l'ancienne, pas plus simple.

═══════════════════════════════════════════════════════════════════
1. LE CADRE PRODUIT A CHANGÉ — C'EST LE POINT LE PLUS IMPORTANT
═══════════════════════════════════════════════════════════════════
PASSIO est désormais ouverte au public, ET ELLE EST GRATUITE. Aucun encaissement d'aucune
sorte. Le code d'accès qui réservait l'application à des testeurs a été retiré le 11/09.

Cela déplace le verdict attendu, dans les deux sens :

CE QUI DEVIENT SANS OBJET. Tout ce que l'audit du 04/09 jugeait au regard d'un service
PAYANT : conditions de vente, information précontractuelle, droit de rétractation, TVA,
droit de la consommation marchande, garantie de conformité. Il n'existe aucun moyen de payer
dans le produit (vérification exhaustive du dépôt : aucun prestataire de paiement, aucun
achat intégré), et les conditions d'utilisation en vigueur FONDENT l'exonération de
responsabilité sur la gratuité (articles 2 et 10). Ne recote pas ces points : dis qu'ils
sont caducs tant que rien n'est encaissé, et signale que le jour où un paiement apparaîtra,
ces deux articles deviendront faux et devront être RÉÉCRITS, pas complétés.

CE QUI DEVIENT PLUS EXIGEANT, PAS MOINS. La gratuité n'allège aucune obligation envers les
personnes : RGPD, règlement européen sur les services numériques (UE 2022/2065, article 16
sur le signalement et l'action), LCEN article 1-1, protection des mineurs, sécurité des
données. Un service gratuit ouvert à des inconnus expose exactement les mêmes personnes
qu'un service payant. Et l'ouverture change l'échelle : ce qui était tolérable devant cinq
comptes connus et prévenus ne l'est plus devant un public qui ne connaît pas l'éditeur.

La question à laquelle tu dois répondre n'est donc pas « peut-on commercialiser ». C'est :
  « PASSIO, gratuite et déjà ouverte, peut-elle le rester, et jusqu'à quelle échelle,
    sans exposer ses utilisateurs ni risquer de perdre leurs données ? »

═══════════════════════════════════════════════════════════════════
2. LA VERSION À EXAMINER
═══════════════════════════════════════════════════════════════════
Dépôt         : https://github.com/PASSIO74/passio-app  (dépôt public, propriété du mandant)
Branche       : main
Version cible : 30cc8851d1f9486d146bbb6448612557cbc7f4bf  (2026-09-13, PR #371)
Version 04/09 : c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf  — référence historique seulement.
                L'écart entre les deux EST ton objet d'étude.
En ligne      : https://passio-app.netlify.app

Le dossier d'audit N'EST PLUS sur une branche séparée : la PR #280 a été fusionnée le
2026-09-09. Tout est sur main, dans .passio/audits/BILAN_PASSIO_09-26/ :
  00-MANIFESTE · 01-SYNTHESE-BENJAMIN · 02-CARTOGRAPHIE · 03 UX · 04 fonctionnel ·
  05 code · 06 sécurité/données · 07 performance/capacité/coûts · 08 pilotage/supervision ·
  09 appareils/accessibilité · 10 modération/rencontres/exploitation ·
  11-REGISTRE-DES-RISQUES (les 192) · 12-VERDICT-COMMERCIAL ·
  13-PREUVES-NECESSAIRES (tout ce qui n'a pas pu être vérifié) · 14-COUVERTURE-DU-MANDAT ·
  donnees/registre-problemes.json (registre structuré complet) · preuves/ (~400 fichiers).
Issue de suivi #279, toujours ouverte. Ne fais pas `git checkout audit/bilan-...` : inutile.

⚠️ Clone le dépôt en profondeur COMPLÈTE, jamais en superficiel : une session précédente a
cru compter 53 commits là où il y en avait 109, parce que son clone était tronqué et que
`git merge-base --is-ancestor c8cb8e9 HEAD` répondait NON. Fais ce contrôle en premier.

═══════════════════════════════════════════════════════════════════
3. CE QUI A ÉTÉ FAIT PENDANT TON ABSENCE (2026-09-04 → 2026-09-13)
═══════════════════════════════════════════════════════════════════
Chiffres mesurés (interface GitHub, branche main, du 04/09 12:07 UTC au 14/09) :

  109 commits · 75 PR fusionnées (#285 → #371) · 680 fichiers · +137 540 / −3 597 lignes
  Par jour : 04/09 : 5 (documentaires) · 05 : 1 · 06 et 07 : ZÉRO · 08 : 14 · 09 : 35 ·
             10 : 14 · 11 : 7 · 12 : 23 · 13 : 10
  11 migrations de base réelles, toutes appliquées en production (mesuré, pas déduit)
  27 suites de tests nouvelles (264 cas) : 131 fichiers / 1 053 cas → 158 / 1 333
  9 bancs de test SQL nouveaux, bloquants en intégration continue, + 3 suites unitaires
  Les contrôles statiques passent de 9 à 11 · 4 automatismes nouveaux, dont 3 planifiés ·
  CLAUDE.md +1 411 lignes

LES ONZE CHANTIERS, dans l'ordre où ils ont été menés :

① Règles d'accès aux données (08/09, 14 commits). Trois migrations le même jour, chacune
  avec son banc de test bloquant : réservation des rencontres aux majeurs (la règle existait
  mais n'était appelée par rien) ; adresse et téléphone d'une rencontre retirés au rôle
  visiteur, liste des participants réservée aux comptes ; règle de lecture des pièces
  jointes de messagerie resserrée aux membres de la conversation.

② Juridique (08 → 12/09). Conditions d'utilisation, mentions légales conformes à la LCEN
  article 1-1, case de consentement à l'inscription, régime d'éditeur « particulier » (qui
  publie l'identité de l'hébergeur et rien d'autre, ce que la loi permet au non-professionnel).
  Passage de 13 à 18 ans révolus. Identité de contact propre au produit, domaine dédié pour
  l'envoi d'e-mails, avec les enregistrements d'authentification posés et vérifiés. Les textes
  légaux sont désormais lisibles sans compte et sans code d'accès, et versionnés.

③ Référentiel des passions (08 → 12/09), le plus gros volume. De 1 908 à 5 001 passions et
  9 100 synonymes. Création d'une passion depuis l'application, par une fonction serveur
  contrôlée : la table reste non inscriptible par un client. Correction d'un plafond de
  pagination qui rendait environ 900 passions impubliables. Puis, le 12/09 : « taper Ski ne
  rendait rien », trois écrans cherchaient encore dans les 19 passions embarquées d'origine.

④ Messagerie et notifications (09 → 10/09). La notification de message privé n'écrivait
  aucune ligne : le correctif était branché sur une fonction que plus personne n'appelait.
  File d'envoi qui ne renonçait jamais (798 refus rejoués pour 4 messages). Réparation des
  conversations orphelines et ajout de la règle de suppression qui manquait.

⑤ Inscription et accueil (09 → 13/09). Nom d'utilisateur demandé au formulaire. L'ancienne
  visite guidée ne s'impose plus à un compte neuf. Mot de passe : minimum porté à 8
  caractères, refus du serveur traduits en français, changement exigeant l'ancien mot de
  passe et une nouvelle preuve d'identité si la session est ancienne. Vérification anti-robot
  câblée côté client mais AUJOURD'HUI INACTIVE : sa clé publique est vide dans le code servi,
  donc aucun contrôle ne s'exécute et rien n'est exigé du serveur. C'est conforme au plan (le
  client se déploie avant l'interrupteur), ce n'est pas une protection en place.

⑥ Fiabilité (09 → 13/09), la série la plus dense, toujours le même schéma : une mesure en
  production, un correctif, un test de non-régression. Six tables refusaient des ÉCRITURES
  (l'application écrivait sous une identité de visiteur, ou sous une identité qui n'était pas
  celle de la session) ; deux autres refusaient des LECTURES pour une cause DIFFÉRENTE — un
  droit de colonne retiré au rôle visiteur, que le client sollicitait quand même. Le même
  symptôme, deux causes : c'est le genre de piste à garder. Plus le rejeu des lectures de
  démarrage coupées par le réseau (448 appels perdus mesurés sur deux semaines) et un rejet
  de promesse non capturé sur iOS.

⑦ Ouverture publique (11 → 12/09), le chantier pivot. Sept points fermés d'un coup côté
  serveur : une fonction d'aide qui restait appelable par le rôle visiteur et permettait de
  reconstituer une information qu'on venait de fermer ; le blocage d'un compte rendu effectif
  partout et non plus sur une seule table ; un débit maximal posé sur neuf tables ; un statut
  sur les signalements ; des règles d'autorisation sur les canaux temps réel ; le stockage
  des pièces jointes passé en privé ; les comptes privés à acceptation. Plus une revue
  adversariale interne qui a trouvé dix points supplémentaires, dont un défaut CRITIQUE
  d'échappement (un champ de la charge utile d'une invitation d'appel, affiché sans
  désinfection, permettait l'exécution de script chez tout compte connecté) et une règle de
  mise à jour à laquelle il manquait sa contrainte de sortie.
  Bibliothèques tierces auto-hébergées et épinglées, politique de sécurité du contenu
  resserrée. Banc de 117 contrôles SQL et 35 cas de test.

⑧ Supervision autonome (09 → 12/09). La détection d'erreurs quitte le poste de travail pour
  une tâche planifiée : lecture horaire du journal d'erreurs, classement des causes par une
  fonction pure couverte par 26 tests unitaires, ouverture d'une fiche, correctif écrit et
  proposé par la chaîne. Un défaut a été réparé de bout en bout sans aucun geste humain.

⑨ Centre de pilotage (09 → 13/09). Canal temps réel privé, surveillance de l'espace disque,
  sonde d'état qui ne conclut plus à une panne au premier délai dépassé.

⑩ Exploitation (09 → 13/09). Sauvegarde quotidienne chiffrée, DÉCHIFFRÉE ET RELUE dans la
  même exécution : elle a tourné, avec succès, le 12/09. Alerte quotidienne sur les
  signalements non traités depuis 24 h. Plafonds d'usage sur les fonctions serveur, qui n'en
  avaient aucun (un compte pouvait déclencher un service payant en boucle).

⑪ Interface et fil (09 → 12/09). Le critère d'envie devient un filtre au lieu d'être une
  source (des publications de passions non suivies entraient dans le fil). Images de profil
  redimensionnées. Quatre écrans qui promettaient encore des fonctionnalités retirées.

ÉTAT MESURÉ DE LA PRODUCTION AU 2026-09-13 (lecture seule) :
  8 comptes (7 confirmés) · 7 profils · 33 publications (3 auteurs) · 74 messages ·
  119 conversations dont 113 vides · 9 rencontres · 2 signalements, tous deux TRAITÉS
  (file en attente : 0) · 0 blocage · 5 003 passions actives (5 001 livrées par le dépôt,
  plus celles créées depuis l'application) · 32 361 lignes de télémétrie (compteur vivant,
  relevé le 13/09) ·
  23 erreurs clientes · règle de majorité activée · stockage des pièces jointes privé.
  Activité réelle sur 7 jours : 796 sessions, 4 comptes actifs, 1 publication.
  ⚠️ Le produit est ouvert mais encore quasi vide. La capacité n'a jamais été mesurée,
  et 8 comptes ne prouvent rien sur 8 000.

═══════════════════════════════════════════════════════════════════
4. LE CROISEMENT DÉJÀ FAIT — ET POURQUOI T'EN MÉFIER
═══════════════════════════════════════════════════════════════════
Claude Code a repris les 65 problèmes les plus graves de l'audit du 04/09 et les a confrontés
un par un au code du 13/09, puis a fait relire chaque « c'est réglé » par un second analyste
chargé de le contredire. Ce second passage a invalidé 5 fermetures sur 9. Bilan :

    FERMÉ : 4    PARTIEL : 33    ENCORE OUVERT : 28    (sur 65)

Sur les 8 problèmes bloquants d'origine, AUCUN n'est intégralement clos : trois sont
intacts, cinq ont leur cœur réglé et un résidu nommé.

  LES TROIS INTACTS :
   · SUP-04 — UN SEUL ENVIRONNEMENT. Le même projet de base sert au développement, aux
     aperçus de pull request, aux tests d'intégration à comptes réels — qui ÉCRIVENT en
     production avec la clé de service et y purgent des comptes — et à la production
     elle-même ; un quatrième automatisme y crée deux comptes jetables à chaque exécution.
     L'adresse du projet est écrite en dur dans la page et dans le code : rien n'est injecté
     à la construction. Un projet de pré-production existe et n'a jamais servi.
   · EXP-01 — RESTAURATION JAMAIS EXERCÉE. Le document de reprise le dit lui-même, et deux
     de ses prémisses sont périmées, à re-vérifier : le dossier du 11/09 note que la base
     cible existe et que l'hébergeur produit des sauvegardes physiques quotidiennes en état
     « terminé ». Le fichier de référence du schéma date du 17/08, liste 36 tables contre 41
     aujourd'hui, et ne contient aucune instruction de création exécutable : le schéma n'est
     pas reconstructible à partir du dépôt. Atténuation réelle : l'archive des DONNÉES est
     désormais produite, chiffrée et relue automatiquement chaque nuit, ce qui n'existait pas
     au 04/09. Ce qui manque n'est donc pas un fichier, c'est l'EXERCICE : personne n'a
     jamais reconstruit la base de bout en bout.
   · PERF-01 — CAPACITÉ JAMAIS MESURÉE. Aucun outil de test de charge dans le dépôt.
     La limite de connexions simultanées est à 60, inchangée depuis le 04/09. 70 règles
     d'accès ré-évaluent la fonction d'identité à chaque ligne au lieu de la calculer une
     fois, 24 règles permissives font doublon, et deux tables à fort volume (accusés de
     lecture, télémétrie) sont toujours dans la publication temps réel — ce qui fait porter
     à chaque abonné le coût d'évaluation de leurs règles. ⚠️ Confidentialité INCHANGÉE :
     ces deux tables ont leurs règles d'accès actives, chaque abonné ne reçoit que ses
     lignes. C'est un point de COÛT, pas une fuite ; ne le lis pas comme telle.

  LES CINQ AU CŒUR RÉGLÉ, avec leur résidu :
   · SUP-01 / MSG-03 / CONT-11 — PIÈCES JOINTES DE MESSAGERIE. Le stockage est privé et l'accès sans compte est fermé
     (mesuré dans la configuration, pas déduit du dépôt) ; l'affichage passe par des liens
     signés d'une heure. Résidus : le stockage des médias PUBLICS reste listable sans compte,
     ce qui est un choix assumé mais qui expose les chemins des médias de comptes privés ;
     et une pièce jointe n'est pas supprimée avec son message ni avec le compte.
   · MSG-01 — AFFICHAGE D'UNE INVITATION D'APPEL. Le champ non échappé est corrigé et le correctif
     est éprouvé par réinjection du défaut ; les canaux temps réel sont privés et portent
     leurs règles d'autorisation. Résidu : la règle de réception n'exige pas que le canal
     d'un utilisateur soit celui de l'abonné. Conséquence, et c'est elle qui donne sa gravité
     au point : tout compte connecté peut observer qui appelle qui, et présenter une invitation
     sous un nom qui n'est pas le sien, l'identité transmise dans le message n'étant pas
     rattachée à sa session. C'est un résidu ASSUMÉ et écrit comme tel, pas un oubli.
   · MOD-01 — TRAITEMENT DES SIGNALEMENTS. La file est désormais consultable et traçable (statut,
     date et note de traitement posés par le serveur ; outil en ligne de commande ; alerte
     quotidienne). Résidu, et il est lourd : le RETRAIT d'un contenu reste une opération SQL
     manuelle. Aucune règle ni fonction de modération sur les publications, commentaires,
     stories, messages et rencontres ; aucun journal des décisions ; aucune suspension de
     compte ; aucune interface. L'obligation de retrait du règlement européen n'est donc pas
     tenable en pratique aujourd'hui.

CE QUE LE SECOND PASSAGE A INVALIDÉ — c'est ce qui ressemble le plus à ton travail, et tu
dois faire mieux :
   · AUTH-03 — « Conditions d'utilisation et consentement » annoncé FERMÉ, ramené à PARTIEL. Un chemin
     de contournement est vivant : l'écran d'authentification s'ouvre en mode connexion, la
     case de consentement n'est affichée qu'en mode inscription, or le bouton d'inscription
     par Google n'est jamais masqué et aucun code ne le pilote. Un compte peut donc être créé
     sans que la case ait été montrée, et l'application enregistre alors un consentement
     qui n'a pas été donné.
   · PRO-01 — « Référentiel tronqué » annoncé FERMÉ, ramené à PARTIEL : le correctif contourne le
     plafond de pagination sans le neutraliser, et sa condition d'arrêt transformerait une
     baisse de ce plafond en troncature figée pour toute la session.
   · MOD-04 — « Un compte bloqué ne peut plus se réabonner » ramené à PARTIEL : la règle serveur est
     juste, mais l'unique écrivain de la ligne de blocage est un appel client non vérifié,
     non rejoué et non gardé. La garde est bonne, sa condition d'entrée ne l'est pas.
   · SUP-01 est la quatrième : elle est décrite plus haut, parmi les cinq au cœur réglé.
   · EXP-09 — « Mentions légales, conditions et consentement horodaté sont en place » annoncé
     FERMÉ, ramené à PARTIEL : les images de démonstration restent des adresses tierces (une
     soixantaine d'occurrences), désormais déclarées dans la politique de confidentialité mais
     jamais remplacées par des médias dont la licence est tracée.

⚠️ TROIS AVERTISSEMENTS SUR CE CROISEMENT, et ils comptent.
  (a) Il a été produit par Claude Code, c'est-à-dire par l'auteur des correctifs qu'il juge.
      C'est exactement le conflit d'intérêts que ta relecture existe pour lever. Prends-le
      comme une piste de départ, jamais comme un acquis.
  (b) « PARTIEL » y est sévère par construction : les analystes avaient consigne de
      soupçonner toute fermeture. Un PARTIEL signifie souvent « le cœur est réglé, un résidu
      nommé demeure ». Ne lis pas 33 PARTIEL comme 33 défauts vivants, mais n'en considère
      aucun comme réglé sans l'avoir vérifié toi-même.
  (c) Les 81 problèmes que l'audit du 04/09 n'avait jamais fait relire ne l'ont toujours pas
      été par un tiers. Ils se répartissent en 2 graves, 26 importants, 34 moyens, 19 mineurs,
      et se lisent dans donnees/registre-problemes.json au champ relecture = « NON VÉRIFIÉ » :
      exploitation-continuite 16 · tests-ci 16 · auth-rgpd 13 · irl 13 · perf-capacite-couts 6
      · profils-passions 6 · robustesse-pannes 6 · appareils-a11y 5 (valeurs exactes du champ
      `domaine`, à reprendre telles quelles pour filtrer). Le croisement a seulement vérifié s'ils
      existaient encore, jamais si leur gravité était juste. Une priorité surestimée au 04/09
      l'est donc encore aujourd'hui, dans un sens comme dans l'autre.

═══════════════════════════════════════════════════════════════════
5. LES CONTRÔLES QUE L'AUDIT N'A PAS PU FAIRE — ET QUE TU PEUX FAIRE
═══════════════════════════════════════════════════════════════════
L'audit du 04/09 a laissé 41 contrôles non réalisés (rapport 13) pour une raison matérielle :
son environnement d'exécution n'avait aucune sortie réseau vers l'hébergeur ni vers la base.
Tu n'as pas cette limite. Ces vérifications-là pèsent sur le verdict. Toutes sont des
contrôles de CONFORMITÉ, en lecture seule, sur le produit du mandant :

  (les six ci-dessous sont ceux qui pèsent le plus ; le rapport 13 en liste 41 — vas-y
  chercher le reste une fois ceux-là faits)

  1. La version réellement servie correspond-elle à celle du dépôt ? Le produit publie
     /release.json à la racine (généré par scripts/build.js) : lis-le et compare l'identifiant
     de construction et l'empreinte du bundle à la construction de 30cc885. Personne ne l'a
     encore fait, et tout le reste en dépend.
  2. Les règles de confidentialité au niveau ligne tiennent-elles vraiment pour un visiteur
     non connecté ? Le produit expose sa clé d'interface publique dans le bundle servi — celle
     que tout navigateur reçoit, prévue pour cela : c'est avec elle, et sans aucune session,
     que le contrôle se fait. Pour chaque table, un DÉCOMPTE doit rendre zéro, ou un contenu
     délibérément public. Compte des lignes, ne lis aucun contenu personnel, n'écris rien.
     C'est le contrôle qui manque pour affirmer « l'isolation des comptes est prouvée » :
     l'outil dont disposait l'audit s'exécutait avec des droits élevés et ne pouvait pas se
     placer dans le rôle à tester.
  3. Le stockage des médias publics : combien d'objets sont listables sans compte ? Un chemin
     d'objet n'est pas du contenu personnel — compte-les et regarde leur FORME (révèle-t-elle
     à quel compte appartient le média, et ce compte est-il privé ?), sans jamais télécharger
     ni reproduire un fichier.
  4. Les règles d'autorisation des canaux temps réel restreignent-elles bien l'abonnement à
     son destinataire ? Lis les règles TELLES QU'ELLES SONT EN BASE, jamais le fichier de
     migration — une migration écrite n'est pas une migration appliquée (§7①). Si tu peux
     l'observer sans rien émettre, fais-le ; sinon écris-le NON FAIT.
  5. Les limites réelles des fournisseurs, à relever dans les consoles d'administration
     auxquelles Benjamin a accès : pour la base, la puissance allouée, le nombre de connexions,
     les quotas temps réel ET la profondeur de récupération à un instant donné — ce dernier
     point décide si « restauration jamais exercée » est un risque de PERTE ou seulement
     d'indisponibilité ; pour l'hébergement, la bande passante ; pour l'envoi d'e-mails, le
     quota journalier. Elles décident de la capacité autant que le code.
  6. Les appareils réels : iPhone, Android, tablette, application installée. TOUT ce qui a
     été mesuré jusqu'ici l'a été sous un seul navigateur sans interface. Exemple concret et
     toujours dans le code : un panneau « Installer sur iPhone » recouvre le fil une seconde
     et demie après le chargement, à chaque session, et personne ne l'a jamais vu sur un
     vrai téléphone (UXO-01).
  7. TROIS MÉCANISMES SONT DANS LE CODE ET N'ONT JAMAIS ÉTÉ OBSERVÉS EN SERVICE. Chacun se
     tranche par un simple décompte, et ce sont les contrôles les plus rentables de la liste :
     · la vérification anti-robot à l'inscription : clé vide dans le code servi, donc rien ne
       s'exécute aujourd'hui ;
     · les plafonds d'usage des fonctions serveur : ils écrivent un événement par appel
       accepté, et la table d'analytique n'en porte AUCUN — soit les fonctions n'ont pas été
       redéployées, soit personne ne les appelle ;
     · la notification de message privé : la table des notifications ne porte toujours aucune
       ligne de ce type. Ce défaut a DÉJÀ été « corrigé » une fois sur une fonction que
       personne n'appelait ; ne conclus ni dans un sens ni dans l'autre sans mesurer.
     Un mécanisme présent dans le dépôt et jamais observé en production n'est pas une
     protection : c'est une intention.

═══════════════════════════════════════════════════════════════════
6. TA MISSION — quatre étapes, dans cet ordre, une à la fois
═══════════════════════════════════════════════════════════════════
ÉTAPE 1 — VÉRIFIER, sur la version 30cc885 et sur le service en ligne.
  a. Reprends les 65 problèmes les plus graves avec le croisement du §4 comme hypothèse à
     CONTREDIRE. Pour chacun : CONFIRMÉ / INFIRMÉ / INCERTAIN, avec ta propre preuve
     (fichier et ligne, requête et son résultat, commande et sa sortie). Concentre l'effort
     sur les 4 FERMÉ et les 33 PARTIEL : c'est là qu'une erreur coûte cher, parce qu'elle
     se lit comme une garantie.
  b. Fais les contrôles du §5. Ce sont eux qui feront bouger le verdict, pas une relecture
     de plus du même code.
  c. EXAMINE LE NEUF. 137 000 lignes sont arrivées en dix jours, dont 11 migrations et une
     revue adversariale qui s'est auto-évaluée. L'écart entre les deux versions n'a jamais
     été relu par un tiers. Cherche les défauts INTRODUITS par les correctifs : ce dépôt en
     a déjà trouvé plusieurs de cette famille et les nomme — un correctif qui rouvre le
     défaut qu'il ferme, une garde posée trop haut qui casse quinze tests, un test vert sur
     le défaut qu'il prétend protéger. Numérote tes trouvailles ASTRA-xx.
  d. Traite les 81 problèmes jamais relus (§4c) : ils sont identifiés dans
     donnees/registre-problemes.json au champ relecture, dont la valeur exacte est
     « NON VÉRIFIÉ (pas de relecture) » — 81 entrées sur 192.

ÉTAPE 2 — CONSOLIDER, dans le cadre du §1 (gratuit, déjà ouvert).
  Trois listes : ce qui fonctionne et le prouve · ce qui doit être réglé avant d'augmenter
  l'audience · ce qui reste à mesurer. Puis un verdict motivé, à l'échelle : combien
  d'utilisateurs PASSIO peut-elle accueillir aujourd'hui sans exposer personne et sans
  risquer de perdre les données ? Donne un nombre, et dis ce qui le fixe.
  Sois honnête sur la NATURE des trois points intacts : environnement unique, restauration
  et capacité ne mettent pas les UTILISATEURS en danger, ils mettent le PROJET en danger
  (perte irréversible, indisponibilité). Ce n'est pas la même urgence qu'un défaut de
  confidentialité, et ta priorisation doit le refléter au lieu de les empiler.

ÉTAPE 3 — PRÉSENTER À BENJAMIN un plan de correction ordonné : par chantier, avec les
  problèmes couverts, la correction proposée, le risque de régression, l'effort estimé et
  l'ordre recommandé. Puis STOP, jusqu'à son accord.

ÉTAPE 4 — APRÈS SON ACCORD SEULEMENT : corriger, puis prouver (tests, réinjection du
  défaut pour vérifier que le test le voit, non-régression).

Rappel : pendant les étapes 1 à 3, lecture seule stricte, selon le cadre posé en tête. Et une
règle de méthode propre à ce projet : GitHub et la base sont les seules sources de vérité —
ni une conversation, ni un prototype, ni un export ne fait foi.

═══════════════════════════════════════════════════════════════════
7. SEPT PIÈGES DE MÉTHODE — chacun a déjà coûté du temps sur ce projet
═══════════════════════════════════════════════════════════════════
① L'ÉTAT DE LA BASE NE SE LIT PAS DANS LE DÉPÔT, IL SE MESURE. Cinq affirmations du guide
  interne se sont révélées périmées, dont une de sécurité (un réglage annoncé éteint était
  allumé). Une migration présente dans le dossier n'est pas une migration appliquée, et la
  table d'historique n'en enregistre que 4 sur des dizaines, parce que les applications
  manuelles ne l'alimentent pas. Elle n'est donc pas un indicateur d'état.
② Le guide interne CLAUDE.md (plus de 2 000 lignes) est une piste, jamais une preuve. Il
  documente lui-même ses propres péremptions. Confronte toujours au code et à la base.
③ UNE FONCTION CORRECTIVE SANS APPELANT NE CORRIGE RIEN. Ce projet l'a vécu : un correctif,
  12 tests et une fiche entière portaient sur une fonction que personne n'appelait, pendant
  que la production ne montrait aucune ligne. Cherche systématiquement les appelants.
④ UNE GARDE POSÉE SUR LA CRÉATION SE CONTOURNE PAR LA MISE À JOUR. Déjà trouvé deux fois
  ici. Et une contrainte de sortie ne voit que la ligne finale, jamais l'ancienne.
⑤ UNE PORTE FERMÉE SUR UNE TABLE PEUT SE ROUVRIR PAR UNE FONCTION. Une fonction d'aide
  s'exécutant avec les droits de son propriétaire restait appelable par le rôle visiteur :
  une information qu'on venait de fermer se reconstituait par elle. Après toute migration de
  confidentialité, relis les recommandations de l'outil d'analyse ET les droits d'exécution
  des fonctions.
⑥ UN AVERTISSEMENT D'OUTIL D'ANALYSE N'EST PAS UN DÉFAUT. Sur six alertes du même type,
  cinq étaient du bruit (deux fonctions de déclencheur que le moteur refuse d'appeler
  directement, deux ouvertures délibérées, une fonction qui répond sur l'appelant et non sur
  la cible) et une seule était réelle. Le tri ne se fait qu'en lisant le corps de chaque
  fonction et en demandant : sur QUOI répond-elle ?
⑦ UNE REPRODUCTION QUI ÉCHOUE POUR UNE AUTRE RAISON N'EST PAS UNE REPRODUCTION. Ce dépôt
  connaît « vert en local, rouge en intégration » (la vraie bibliothèque ne se charge qu'en
  intégration) ET l'inverse (cinq suites rouges en local sur main pur, vertes en intégration).
  Avant d'accuser un changement, rejoue la suite sur main dans une copie de travail séparée.

═══════════════════════════════════════════════════════════════════
8. FORMAT ATTENDU
═══════════════════════════════════════════════════════════════════
Problème : identifiant · priorité (P0 empêche d'élargir l'audience · P1 à régler avant de
l'élargir · P2 amélioration importante · P3 optimisation) · fonctionnalité · comportement
attendu · comportement observé · reproduction · preuve · impact pour l'utilisateur ·
visible depuis le centre de pilotage ? · détectable par la supervision ? · correction
proposée · risque de régression · effort · confiance.
Statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · NON VÉRIFIABLE · SANS OBJET.
Méthodes : appareil réel · émulation · inspection du code · requête base · test exécuté · non fait.

Une dernière chose, et elle compte. Ce projet s'applique une règle à lui-même : se taire
plutôt qu'inventer, et écrire « non mesuré » plutôt que cocher. Tiens-la. Un « je n'ai pas
pu le prouver » vaut mieux qu'un vert qui enverrait quelqu'un ouvrir son application à des
inconnus sur une garantie qui n'en était pas une.
```
