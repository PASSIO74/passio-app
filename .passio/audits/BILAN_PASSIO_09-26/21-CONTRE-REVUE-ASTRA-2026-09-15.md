# Contre-revue Astra — troisième passe (2026-09-15)

> Texte rendu par Astra le 2026-09-15 au matin, transmis tel quel par Benjamin. Commit examiné : `8a11a1c2b485f8a94245fee6e5c50f958419d968` (main après #412), plus lecture séparée des sept PR alors ouvertes (#395, #396, #403, #404, #407, #409, #410). Contre-épreuves exécutées en mémoire sur les fonctions récupérées ; aucune requête Supabase, aucune modification. Le plan de correction (§ dernier) est l'ordre de travail de la suite du chantier ; le registre 18 est mis à jour fiche par fiche à mesure.

---

Je ne valide pas encore le maintien de PASSIO en ouverture publique sans restriction, ni son élargissement. Les corrections apportent des progrès réels, mais plusieurs fermetures sont prématurées. J'ai notamment reproduit un défaut permettant au code de suppression de compte d'effacer une pièce jointe appartenant à autrui.

Ce défaut est confirmé dans le code examiné, avec un service de stockage simulé. La version actuellement active de l'Edge Function en production reste non vérifiable d'ici. Aucun fichier réel, compte ou objet de production n'a été touché.

La revue porte sur 8a11a1c2b485f8a94245fee6e5c50f958419d968, avec lecture séparée des sept PR encore ouvertes lors du relevé. La CI de ce commit est verte ; son déploiement Netlify a réussi le 15 septembre à 07:03 UTC. Cela atteste le déploiement du site, pas les migrations ni les versions des fonctions Supabase.

J'ai lu le registre, les corrections et leurs tests, examiné les journaux GitHub disponibles, puis exécuté des contre-épreuves en mémoire sur les fonctions récupérées. Aucune requête Supabase, aucune correction, aucune publication de revue ou modification de fichier.

Dans les verdicts ci-dessous, FERMÉ concerne le défaut précis examiné. Cela ne transforme pas une correction de code en certification générale de production.

## Les dix nouveaux constats

| Identifiant | Constat et preuve | Ce qui manque pour fermer |
|---|---|---|
| ASTRA-11 — P1 urgent | Suppression administrative d'une pièce jointe d'autrui. Le serveur extrait un chemin depuis le contenu libre d'un message, puis supprime l'objet avec les privilèges administratifs, sans vérifier son propriétaire. Contre-épreuve : message de A contenant le chemin d'une pièce jointe de B → objet de B supprimé, résultat ok:true. Sources : purge-compte.js:55, suppression aux lignes 125–128 ; delete-account/index.ts:40. | Autorisation serveur fondée sur la propriété réelle de chaque objet ; test négatif avec une pièce jointe tierce. Version active en production à établir. |
| ASTRA-12 — P1 | La suppression perd les références nécessaires à la purge. Le bouton supprime déjà les messages avant d'appeler l'Edge Function. Celle-ci arrive donc trop tard pour relever leurs pièces jointes. Même en appel direct, elle efface les messages avant le Storage. Contre-épreuve : première tentative refusée, deuxième ok:true, fichier toujours présent. Sources : app-02-state-utils.js:4024, appel ligne 4055 ; purge-compte.js:109–135. | Manifeste serveur durable, pagination, reprise après interruption et contrôle final. Une erreur de relecture Storage doit empêcher la réussite. |
| ASTRA-13 — P1 | La correction clavier peut fermer une modale pendant la saisie. Le fond de modale vide reçoit role="button" ; les champs sont ajoutés ensuite. Espace ou Entrée dans un champ active alors ce bouton ancêtre. Contre-épreuve : textarea + Espace → frappe interceptée et clic du fond. Sources : app-08-ui-modals-tour.js:2295, classification ligne 2339 ; index.html:1358–1359. | Exclure les champs éditables et ces enveloppes ; tester une modale initialement vide, puis ouverte et remplie au clavier. |
| ASTRA-14 — P2 | L'export peut être incomplet sans le signaler. Sans colonne created_at, le chemin de repli atteint 5 000 lignes sans poser tronque=true. Contre-épreuve : cinq pages pleines → 5 000 lignes, aucune erreur, aucune troncature annoncée. Le listing Storage masque aussi ses erreurs et s'arrête à 1 000 éléments. Source : export-compte.js:35. | Pagination stable, omissions explicites et bilan visible au téléchargement. |
| ASTRA-15 — P3 | Deux contrôles de qualité restent contournables par du texte inerte. Un commentaire contenant page.goto(...) suffit au contrôle de « page réelle ». Une chaîne dans une interpolation suffit au contrôle d'appel de l'isolation. Les deux acceptations ont été reproduites. Sources : audit-tests-creux.js:131, audit-tests-isolation.js:121. | Vérifier des appels syntaxiques effectifs et ajouter ces deux contre-épreuves au banc. |
| ASTRA-16 — P1 | Le validateur de restauration confond mêmes quantités et mêmes données. Contre-épreuve : contenu différent, huit autres identités, objets seulement comptés → verdict « restauration prouvée ». ON CONFLICT DO NOTHING peut également conserver des données différentes. Source : restaurer-donnees.js:384, insertion ligne 239. | Vérifier identifiants, contenu et empreintes des médias ; contrôler les omissions et les conflits. |
| ASTRA-17 — P1 | La purge du staging peut terminer normalement malgré des suppressions refusées. Contre-épreuve : réponses HTTP 500 aux suppressions Auth et Storage → chemin de purge terminé sans échec final. Source : restaurer-donnees.js:416. | Échec explicite et relecture indépendante des comptes, lignes et objets restants. La purge historique des données copiées n'est pas vérifiable ici. |
| ASTRA-18 — P2 | Une restauration interrompue peut laisser les limites des buckets désactivées. Les limites sont retirées avant upload et restaurées hors finally. Contre-épreuve : exception d'upload → aucun rétablissement. Source : restaurer-donnees.js:348. | Rétablissement garanti, limité aux buckets concernés, avec échec signalé s'il est refusé. |
| ASTRA-19 — P2 | Le rollback « précédent » peut sélectionner une version plus récente. Seuls trente déploiements sont lus. Si le courant n'y figure pas, l'indice -1 fait choisir le premier de la liste. Contre-épreuve : courant ancien → version la plus récente proposée. Source : rollback-netlify.mjs:66, sélection ligne 101. | Paginer ou refuser explicitement un courant absent ; tester plusieurs contextes et un déploiement ancien. |
| ASTRA-20 — P2, PR #410 uniquement | Le banc de charge peut déclarer bonnes des lectures vides. Il vérifie le statut HTTP, sans vérifier les données attendues. Contre-épreuve : quatre réponses HTTP 200 vides → quatre succès, zéro erreur. Source : charge.mjs:150. | Vérifier le jeu semé et le contenu des réponses ; conserver les résultats bruts. Cela ne démontre pas que les mesures rapportées étaient vides : cela démontre que le banc ne les distingue pas. |

Ces contre-épreuves démontrent des défauts du code et de ses validateurs. Elles ne constituent pas la preuve d'incidents survenus en production.

## Les trois anciens bloquants

| Identifiants | Verdict | Motif déterminant |
|---|---|---|
| EXP-01 / TCI-03 | PARTIEL | L'outillage de restauration existe. L'exercice « 40 tables, 8 comptes, 67 médias » est documenté, mais son résultat détaillé indépendant manque et le validateur accepte des faux positifs : ASTRA-16/17/18. |
| SUP-04 / TCI-04 / EXP-11 | PARTIEL | Le client sait cibler le staging. La CI de main et les previews ne sont pas encore isolées. Même la PR #409 conserve une étape de création de comptes production sans condition la réservant aux déploiements. |
| PERF-01 | PARTIEL | Un outil et des résultats de lectures sur staging existent dans #410. Les écritures, sessions authentifiées, abonnements temps réel et usages mixtes restent non mesurés. Aucun plafond de personnes utilisable en exploitation n'en découle. |

La purge du staging n'annule pas la valeur d'un exercice passé. Il n'est pas nécessaire de conserver les données personnelles copiées pour prouver qu'une restauration a eu lieu. Il faut conserver une preuve durable : commandes, versions, résultats, contrôles d'intégrité et de fonctionnement. Ici, le récit existe ; la preuve détaillée permettant de contredire les compteurs n'a pas été trouvée.

La reprise reste aussi dépendante de composants extérieurs à l'archive : mots de passe, identités OAuth, réglages du projet et fonctions serveur. Le DDL est extrait du catalogue vivant, mais n'est pas inclus dans la sauvegarde automatisée examinée. Les médias sont sauvegardés le dimanche, malgré l'introduction parlant d'archive complète chaque nuit. Je ne conclus pas à l'absence de toute sauvegarde ; je conclus que la reconstruction complète à partir des seules archives conservées n'est pas démontrée.

L'isolation possède néanmoins une preuve positive : le canari de #409 a réellement visé le staging, passé son scénario et purgé ses deux comptes. C'est la preuve de ce canari, pas de toutes les suites ni de la purge des données de restauration.

Pour la capacité, les « 300 comptes » semés sont des profils synthétiques, pas 300 sessions authentifiées. Le banc répète quatre lectures anonymes, avec notamment la même recherche et le même profil. Les 200 travailleurs simultanés du banc ne sont pas 200 personnes, et encore moins une preuve de capacité pour 2 000 à 4 000 personnes. Le document de capacité emploie même « production » pour un résultat obtenu sur staging.

Enfin, #407 et #410 n'attendent pas seulement une contre-revue :
- #407 : un test de la console échoue parce que la nouvelle validation de configuration intervient avant le contrôle attendu.
- #410 : deux assertions SQL sur le plan d'exécution échouent ; le plan observé utilise l'index de statut, pas celui attendu. Des statistiques insuffisantes après création des fixtures sont une hypothèse à examiner, pas une cause démontrée. Ce rouge ne suffit pas non plus à nier le gain de performance rapporté.

## Reclassement — comptes, échanges, modération

| Identifiants | Verdict | Preuve lue et réserve |
|---|---|---|
| MSG-02 | FERMÉ | Suggestions construites par DOM, textContent et écouteurs ; suppression du chemin d'injection. app-04-comments-shop.js:5398–5415. |
| AUTH-06 | PARTIEL | Une ancienne entrée sans propriétaire peut être attribuée au nouveau compte à partir du cache conservé. Le renvoi manuel peut aussi reconstruire cet envoi. Tentative d'envoi de A sous B reproduite en mémoire ; livraison serveur non mesurée. app-04-comments-shop.js:5078–5084,5265–5281. |
| PRO-02 | FERMÉ | Nom/photo déclarés dans le message ignorés ; identité reconstruite depuis l'auteur serveur. app-04-comments-shop.js:4765–4769, app-08-ui-modals-tour.js:5707–5718. |
| MSG-01 / SUP-06 | PARTIEL | Lecture de la sonnerie restreinte dans la migration, mais identité d'appelant encore issue de payload.from, sans liaison au JWT de l'émetteur. app-05:893–921, migration d'ouverture : 421–429. Policies actives non vérifiables ici. |
| MOD-04 | PARTIEL | Le blocage peut annoncer une réussite malgré l'échec du retrait de l'abonné ; les règles de lecture privées continuent d'autoriser l'abonné accepté. app-08-ui-modals-tour.js:6278–6282, migration d'ouverture : 548–579. |
| MSG-04 | PARTIEL | La « preuve métier » de push est une notification que l'appelant peut lui-même créer. Vérifier son existence ne prouve pas un événement métier légitime. _shared/lien-metier.js:72–83, migration d'ouverture : 245–247. |
| MSG-10 | PARTIEL | Messages bloqués masqués dans plusieurs vues ; ce masquage local ne supprime ni l'appartenance au groupe ni les accès serveur. app-04-comments-shop.js:3853,4169,4526. |
| AUTH-05 / SUP-10 | PARTIEL | Verdict serveur désormais attendu, mais purge incorrecte : ASTRA-11/12. |
| MSG-03 | PARTIEL | Suppression Storage tentée, mais résultat ignoré après disparition de la ligne ; reprise durable absente. app-04-comments-shop.js:4616–4666. |
| ASTRA-01 | PARTIEL | Copie vers le dossier cible ajoutée avant transfert. Lecture réelle sous les policies Storage non mesurée ; chemin vocal encore imparfait. app-04-comments-shop.js:4636–4648,4698–4712. |
| CONT-11 / SUP-01 | OUVERT techniquement | La décision produit est maintenant exposée dans legal-textes.js:233. Elle ajuste la promesse de confidentialité ; elle ne rend pas privés les fichiers concernés. L'ancien constat portait sur des couvertures de profil privé, pas sur des messages privés. |
| MOD-01 | PARTIEL | Lecture et changement de statut présents, mais retrait/suspension encore renvoyés à SQL sur main. Les ajouts de #396 ne sont pas fusionnés. scripts/moderation.js:308,348–349. |
| MOD-02 | FERMÉ | Porte de signalement de publication effectivement raccordée. app-04-comments-shop.js:31–43. |
| MOD-03 | FERMÉ sur motif/verdict | Le formulaire demande un motif et attend le résultat. Cela ne ferme pas le reçu durable ni le traitement ultérieur. app-04-comments-shop.js:3594–3716. |
| AUTH-11 / MOD-09 | PARTIEL | Contact, règles et recours publiés ; accusé durable, journal et retour de décision encore dans #396. Traitement du canal e-mail non mesuré. |
| ASTRA-03 | FERMÉ | Filtre status=open appliqué avant pagination ; dépassement explicitement annoncé. scripts/moderation.js:155–178. |

## Reclassement — inscription et information

| Identifiants | Verdict | Preuve lue et réserve |
|---|---|---|
| AUTH-02 / AUTH-03 / EXP-14 | PARTIEL | Faux accord automatique retiré, mais le rappel ignore un compte sans accord après quinze minutes. Compte créé depuis seize minutes : absence de rappel reproduite. app-02-state-utils.js:4550–4562. |
| AUTH-04 / EXP-15 | PARTIEL | Opposition disponible, mais identifiant d'appareil créé avant le garde et conservé après opposition. Cela contredit le registre. Aucune preuve ici d'envoi après opposition. telemetry.js:118,706–716. |
| AUTH-09 / EXP-08 | PARTIEL | Export et contact présents ; incomplétude silencieuse : ASTRA-14. |
| AUTH-10 | PARTIEL | Google Fonts, TURN et STUN documentés ; contrats, garanties de transfert et région effective non établis par le texte. legal-textes.js:237, fiche AUTH-10. |
| ASTRA-09 / EXP-09 | FERMÉ pour l'information | Responsable et contact identifiés à la collecte. legal-textes.js:71,213–230, index.html:287. |
| UXO-07 | FERMÉ | La fausse promesse de contrôle d'âge par IA a disparu. index.html:313. |

## Reclassement — faux succès

| Identifiants | Verdict | Preuve lue et réserve |
|---|---|---|
| ASTRA-10 | FERMÉ | Une panne transitoire ne mémorise plus durablement un refus de droit. Banc de réinjection ciblé, fiche ASTRA-10. |
| CONT-02 / ROB-01 | FERMÉ sur la reprise ajoutée | États de synchronisation, reprise au démarrage/retour réseau et tentatives bornées présents. Fermeture réelle de l'application avec médias non remesurée. app-08-ui-modals-tour.js:1517–1591. |
| CONT-06 | FERMÉ | Publication de story soumise au verdict, retour arrière sur échec. app-08-ui-modals-tour.js:637–660. |
| ROB-02 | FERMÉ | RSVP avec instantané, attente et retour arrière avant notification. app-07-ia-explore-irl.js:3303–3393. |
| ROB-03 | FERMÉ sur le signal demandé | Bandeau d'erreur et traitement de session raccordés au fetch. app-02-state-utils.js:546–584. |
| ROB-04 / ROB-06 | FERMÉ sur les doubles actions ciblées | Verrous et libération au résultat/exception. Synchronisation entre onglets non mesurée. app-04-comments-shop.js:3410–3475,5205–5286. |
| ROB-05 | FERMÉ | Repli géographique annoncé comme Paris par défaut. app-07-ia-explore-irl.js:1178–1188,1276–1284. |
| MSG-06 | PARTIEL | Masquage conservé localement, mais borné à trente jours/2 000 entrées et non synchronisé entre appareils. app-04-comments-shop.js:2349–2412. |
| IRL-04 | PARTIEL | Promotion automatique corrigée ; promotion manuelle toujours optimiste. Refus serveur simulé → participant ajouté localement et succès annoncé. app-07-ia-explore-irl.js:5933–5943. |
| IRL-05 | PARTIEL | Contraintes et verrou présents dans la migration ; application effective et concurrence sur la cible non vérifiables ici. migration_capacite_activite_2026-09-14.sql:42–101. |
| IRL-06 | PARTIEL | Suppression attendue avant retrait local ; traitement effectif des dépendances et orphelins non démontré. app-07-ia-explore-irl.js:5991–6023. |
| IRL-10 | PARTIEL | Refus d'adhésion mieux traité ; fonctionnement réel du co-organisateur dépendant de la migration non établi. app-07-ia-explore-irl.js:3449–3523. |
| IRL-11 | PARTIEL | Négatifs et dates corrigés ; capacité 0 convertie en valeur illimitée malgré la borne annoncée. app-07-ia-explore-irl.js:6107–6113. |
| IRL-12 | OUVERT sur main | Client correctif dans #395 ouverte ; application serveur seulement déclarée dans la fiche. |
| IRL-13 | PARTIEL | Annulation simple corrigée ; annulation de série toujours annoncée réussie même si tous les appels échouent. Reproduit. app-07-ia-explore-irl.js:5957–5965. |
| PRO-04 | PARTIEL | L'empreinte mémorisée après sauvegarde peut être celle d'un nouvel état jamais envoyé. Course reproduite : A envoyé, état devenu B, B considéré synchronisé. app-08-ui-modals-tour.js:3595–3629. |
| PRO-05 | FERMÉ dans le mode actuel | Studio resynchronisé et publication empêchée sur une passion archivée. app-06-reels-partage.js:2707–2715,4247–4253. |

## Reclassement — exploitation et supervision

| Identifiants | Verdict | Preuve lue et réserve |
|---|---|---|
| EXP-03 | PARTIEL | Rollback outillé, mais sélection incorrecte dans un cas : ASTRA-19. Durées historiques documentées, non reproduites ici. |
| NET-07 / TCI-15 | PARTIEL | Export de schéma et quinze bancs SQL présents. Reconstruction intégrale depuis les archives, ordre complet et journal des migrations non démontrés. |
| EXP-04 | OUVERT sur main | Workflow Edge Functions uniquement dans #404 ; premier fonctionnement et retour arrière non établis. |
| TCI-16 | OUVERT sur main | Canari encore horaire et dirigé vers la production dans le workflow fusionné. Changements dans #404/#409. |
| ASTRA-02 | FERMÉ dans la migration ; production NON VÉRIFIABLE D'ICI | Date serveur imposée avant comptage ; banc SQL de main vert. Définition effectivement active seulement décrite au registre. |
| ASTRA-04 | OUVERT sur main | Verrou dans #407, annoncé appliqué sur staging. Le défaut n'a pas été reproduit dans les tirs rapportés, avec ou sans verrou : ces tirs ne prouvent donc pas sa correction. |
| ASTRA-05 | OUVERT sur main | Garde proposée dans #407 ; ni la limite de deux fichiers/soixante lignes ni tout le périmètre annoncé ne sont imposés. Un échec de reconnaissance de la branche/étiquette peut laisser la garde inactive. |
| ASTRA-06 | PARTIEL | Identité serveur préférée, mais repli HTTP 400 vers des identités déclaratives encore utilisables pour sélectionner une enquête. Reproduit sous cette condition ; activation de la condition en production non démontrée. sentinelle-detecter.mjs:517–541. |
| ASTRA-07 | FERMÉ | Archive vide comparée au manifeste ; test négatif exécutant le script réellement vert dans la CI actuelle. |
| ASTRA-08 | PARTIEL | Câblage effectivement fusionné, contrairement au titre périmé de la fiche. Mais seuls cinq candidats sont transmis : cinq déjà fermés masquent encore le sixième actif. Reproduit. sentinelle-detecter.mjs:622. |
| PIL-02 | OUVERT sur main | Refus des secrets par défaut proposé dans #407, encore ouverte et avec un test rouge. Configuration effective non vérifiable. |
| PIL-03 / CONT-08 / MOD-06 / SUP-07 | PARTIEL | Bornes sur plusieurs tables présentes ; elles ne couvrent pas tous les volumes, chemins et comportements. Les relevés de triggers/cron du 14 septembre restent documentaires. |
| MOD-07 | OUVERT | Captcha déclaré désactivé, sitekey vide ; fermeture non revendiquée dans la fiche. |
| PIL-01 / PIL-04 / EXP-06 | PARTIEL | Surveillance GitHub réelle et signaux présents ; livraison des alertes et couverture de bout en bout insuffisamment établies. Sonder seulement release.json ne prouverait pas la santé du service entier. |
| EXP-12 | PARTIEL | Revue indépendante possible, mais non imposée par l'identité du compte GitHub validant les PR. Le registre le reconnaît. |
| PIL-10 | OUVERT | Modération, sauvegardes, coûts et capacité encore incomplets dans le Centre de pilotage ; fiche correspondante et tableau restant. |
| PERF-02 | OUVERT | Démarrage lent non corrigé. Les « ≈12 s » sont une estimation corrigée de la compression à partir d'une mesure locale de 17,6 s, pas une mesure sur téléphone réel servi en production. |
| PERF-03 | PARTIEL | Migrations examinables dans #403 ; baisse des advisors et équivalence de toutes les policies appliquées non vérifiables à partir des seuls totaux rapportés. |
| PRO-06 / PERF-04, volet nettoyage | NON VÉRIFIABLE D'ICI | Comptages et purge racontés, sans preuve brute complète retrouvée. Je ne réaffirme donc pas que les anciens orphelins existent toujours. |
| PERF-05 | PARTIEL | Limites et coûts décrits ; maîtrise et alerte de coût non démontrées. |
| PERF-06 | OUVERT | Fenêtrage du fil toujours désactivé ; mesure DOM à grande profondeur non refaite. |

## Reclassement — parcours et preuves de qualité

| Identifiants | Verdict | Preuve lue et réserve |
|---|---|---|
| DEV-01 / DEV-04 | PARTIEL | Zones tactiles et noms améliorés ; couverture incomplète, chevauchements et usage physique non validés. styles.css:11298, fiche DEV-01/04. |
| DEV-02 | OUVERT | Régression démontrée : ASTRA-13. |
| DEV-03 | FERMÉ sur les contrastes ciblés | Couleurs corrigées ; cela ne constitue pas un audit d'accessibilité complet. styles.css:11157,11176. |
| UXO-01 / UXO-03 | FERMÉ sur les défauts ciblés | Installation iPhone non imposée ; démonstrations étiquetées, exclues des non-lus et non envoyables. platform.js:151–162, app-04-comments-shop.js:2239–2249,3887–3900. |
| UXO-02 | OUVERT | Mode local de lecture avec écritures bloquées toujours absent ; fiche UXO-02. |
| TCI-01 | PARTIEL | Suites réparées mais toujours optionnelles, scénario temps réel rouge et non activées systématiquement en CI. |
| TCI-05 / TCI-06 | PARTIEL | Nouveaux contournements : ASTRA-15. |
| TCI-14 | FERMÉ | Vérification de l'arbre et du diff : dix anciens harnais supprimés, deux documents déplacés dans les archives. |

Les autres points historiques, notamment DEV-05, TCI-02, TCI-07 à TCI-13, PRO-01 et PRO-03, ne reçoivent aucune fermeture nouvelle dans cette passe. Leurs états antérieurs ne doivent pas être remplacés par un feu vert collectif.

Pour TCI-01, la cause probable la mieux étayée est une course d'initialisation ou d'abonnement. Le scénario n'attend ni un acquittement d'insertion du message A ni la confirmation SUBSCRIBED de B. Le code pose même _supaSubscribed avant cette confirmation. Un INSERT refusé peut toutefois produire le même timeout : aucune cause RLS n'est démontrée. Sources : multi-comptes.spec.js:63–73,1154–1158, app-08-ui-modals-tour.js:5805.

Il faut conserver, pour un même essai rouge, la réponse d'insertion, l'état du message, les statuts d'abonnement et l'événement reçu ou rejeté. Exporter les policies de realtime.messages ne suffit pas à établir toute la configuration du flux Postgres Changes, qui dépend aussi de sa publication.

## Le plan de correction, dans cet ordre

Une petite audience ne neutralise pas les défauts entre comptes.

1. **Sécuriser la suppression de compte** — ASTRA-11/12, AUTH-05, SUP-10, MSG-03. Établir la version serveur active, supprimer l'autorisation fondée sur un chemin fourni par le client et conserver un manifeste de purge. Recette indispensable : pièce jointe d'autrui préservée, suppression normale avec médias, panne puis reprise, pagination, aucun succès si le contrôle final échoue.
2. **Terminer la séparation des comptes et des échanges** — AUTH-06, MSG-01/SUP-06, MSG-04, MOD-04. Refuser l'adoption d'envois anciens sans propriétaire, lier l'appelant à une identité serveur et fonder les push sur un événement métier autorisé. Éprouver le blocage avec un ancien abonné et une panne secondaire.
3. **Corriger la régression clavier et les faux succès restants** — ASTRA-13, IRL-04/13, PRO-04. Réutiliser les contre-épreuves décrites ci-dessus : elles donnent des critères précis, sans nouvelle refonte générale.
4. **Rendre la restauration et la purge vérifiables** — EXP-01, NET-07, TCI-03/15, ASTRA-16 à 19. Archiver le schéma avec les données, comparer l'intégrité, restaurer sur cible vide et prouver des parcours avec comptes et médias. Mesurer un délai incluant la remise en service complète. Vérifier ensuite la purge et le rétablissement des limites.
5. **Achever l'isolation** — SUP-04, TCI-04, EXP-11, TCI-16. Corriger #409 avant fusion : suites et previews sur staging, exception production explicitement conditionnée, suppression des références production codées en dur. Conserver les journaux des cibles réellement utilisées.
6. **Rendre la modération et l'admission opérationnelles** — MOD-01/09, AUTH-11, AUTH-02/03, MOD-07. Terminer et éprouver le traitement d'un signalement jusqu'au retrait, à la trace et au retour de décision. Fermer l'échappement OAuth sans accord et activer la protection d'inscription prévue.
7. **Achever export et opposition** — ASTRA-14, AUTH-04/09, EXP-08/15. Aucune omission silencieuse ; bilan compréhensible ; comportement de l'identifiant local conforme à la promesse publiée.
8. **Réparer les garanties de livraison et de supervision** — #404/#407, ASTRA-05/06/08, PIL-02, TCI-01/05/06. Résoudre les tests rouges, imposer les limites annoncées, prouver un déploiement et un retour arrière serveur, puis activer les suites entre comptes après diagnostic du temps réel.
9. **Mesurer avant d'élargir** — PERF-01/02/03/05/06, ASTRA-20. Corriger #410, conserver les résultats bruts et tester un mélange réaliste de lectures, écritures, uploads et temps réel authentifié, avec contrôles de contenu. Mesurer aussi le démarrage et la tenue dans la durée. Le plafond d'audience reste non mesuré jusque-là.

Chaque PR doit porter ses identifiants, une reproduction avant correction, le test qui échoue si le défaut revient, puis les quatre états séparés : code, staging, déploiement, vérification après déploiement. Une limite susceptible d'exposer un autre compte, de perdre des données ou d'annoncer un faux succès doit rester un défaut ouvert.

Je m'arrête au plan demandé. Aucun correctif, aucune fusion et aucun déploiement n'ont été effectués par cette revue.

---

## Note de reprise (Claude Code, 2026-09-15)

Reçu à 09 h 40 environ, pendant que #395, #396, #409 et #413 venaient d'être fusionnées. Deux de ses constats étaient déjà en cours au moment de la lecture : le rouge de #407 (test du pilotage, corrigé par #414) et celui de #410 (banc du plan d'exécution : la cause « statistiques absentes » est **démontrée**, pas supposée — `ANALYZE` avant l'`EXPLAIN` fait lire les deux index trigramme, plan relu sur le staging). Sur TCI-01 : la cause n'était ni une course d'abonnement ni une RLS — c'était #413, une régression de la veille en production (`_estConvDemo` prenait les profils réels pour le socle) ; 9/9 depuis. L'ordre de travail est celui du plan ci-dessus, en commençant par ASTRA-11/12 (P1 urgent) et ASTRA-13.
