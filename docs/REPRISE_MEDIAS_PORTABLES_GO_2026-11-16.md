# Reprise : références médias portables — 16 novembre 2026

Résultat attendu : après restauration d'un objet sur un autre projet, les champs qui servent ce média désignent le projet cible. Le texte libre reste celui de l'archive. Avant ce lot, la copie du blob et le verdict octets/empreintes pouvaient être verts alors que la publication cherchait encore son image sur le projet source.

Risque **critical** : import de données et vérification de récupération. Implémentation : Codex ; contre-revue indépendante requise avant livraison. Périmètre : `scripts/restaurer-donnees.js`, helper de projection, tests et ce contrat. Aucune modification de l'archive, de la base source, des droits Storage, des identités ou des secrets. Aucune ressource payante ni nouvelle dépense.

## Contrat de projection

La projection partage une seule fonction entre chargement SQL, gros objets SQL et comparaison attendue. La validation parcourt les références avant toute mutation de schéma, d'Auth ou de données. Une référence interne active non reconnue bloque la restauration ; le mode d'acceptation des archives historiques non vérifiables ne couvre pas ce refus.

Une URL source ne change que si son origine est exactement le projet HTTPS du manifeste, son endpoint Storage est reconnu, l'objet est présent dans l'index intègre de l'archive et la visibilité du seau provient des métadonnées DDL liées au manifeste. Les chemins ambigus, segments de traversée, séparateurs encodés, octets de contrôle et objets hors index sont refusés. Les paramètres de transformation, de téléchargement et de signature ne sont pas recopiés : la cible désigne l'objet original restauré.

Les champs reconnus sont :

- `posts.media_url`, `stories.media_url`, `profiles.avatar_url`, `profiles.cover_url`, `events.cover_url` ;
- `profiles.passions[].photoUrl/coverUrl`, profils correspondants de `user_state.data.user`, médias et étapes de `user_state.data.userPosts` ;
- champs médias de présentation de `posts.shared_data` (TEXT JSON ou JSONB) et des repartages de l'état utilisateur ;
- `overlays[].url` uniquement pour les objets de type `gif` ;
- `conv_messages.content.url` uniquement dans une enveloppe JSON `media`, `audio`, `doc` ou `gif`.

Les pièces jointes privées sont limitées aux enveloppes `media/audio/doc` du seau `attachments`. Leurs anciennes formes `public/sign/authenticated` deviennent une référence `authenticated` sur la cible, sans jeton source. Le vrai normaliseur du client reconnaît cette référence et demande une nouvelle signature au client Supabase courant. Un champ rendu directement par `src`, un GIF privé ou un autre seau privé est refusé : ce lot ne crée aucun lecteur privé supplémentaire.

L'ancien alias `/media/content/...`, relatif ou sous l'origine officielle du site, n'est accepté que si le manifeste désigne la production à laquelle cet alias est historiquement câblé. L'objet et le seau public doivent être attestés comme pour une URL Storage directe. Il devient une URL Storage de la cible. Un alias rencontré dans une archive d'un autre projet est ambigu et bloque la reprise.

Les références logiques `https://media.passio.invalid/...` restent identiques : leur cible n'est pas un ancien projet Storage. Les origines tierces, textes libres, enveloppes de message non actives et anciens carnets retirés ne sont pas réécrits. Il n'existe aucune substitution globale d'une origine dans toute l'archive.

## Exactitude et supervision

Le helper remplace seulement les tokens string reconnus. Il ne resérialise pas la ligne entière : `bigint`, `numeric`, nombres hors flottants, clés spéciales, espaces et champs arbitraires gardent leur représentation. Le parcours est itératif et ne descend pas récursivement dans le JSON utilisateur. Le découpage des lots mesure les lignes projetées avant le choix du transport SQL fragmenté.

Centre de pilotage/Sentinelle : aucun nouvel automatisme de production. Les refus remontent dans le bilan et le verdict JSON existants, avec une catégorie fixe sans URL ni valeur serveur ajoutée. Le verdict décrit la politique de projection (`projection_medias.version=1`) et l'archive immuable. La supervision doit continuer à considérer tout refus ou échec du workflow comme rouge. Aucun parcours mobile du propriétaire n'est modifié.

## Validation et limites

Les régressions locales exercent les champs typés, les textes inchangés, les pièces jointes avec le vrai normaliseur du client, les nombres exacts, un JSON de 6 000 niveaux et les refus d'index/visibilité/chemin. Le vrai chargeur et le vrai verdict acceptent la cible projetée puis refusent une URL source résiduelle.

Le banc `tests/sql/reprise-medias-portables-runner.mjs` réserve une base PostgreSQL locale neuve, exclusivement synthétique. Il exerce les vrais imports SQL, FK, triggers réactivés, `numeric` exact, comparaison positive puis négative et empreintes des archives inchangées ; il supprime sa base sous marqueur et vérifie son absence. Son transport Management/REST est doublé par `psql` : ce n'est pas une preuve HTTP Auth/Storage hébergée.

Le wrapper `tests/sql/reprise-medias-portables.test.sh` est découvert par le job existant des bancs SQL non nommés, sans workflow ni service supplémentaire. Il exige Node22 et sélectionne explicitement les binaires PostgreSQL18 de l'image Ubuntu26.04 actuelle (ou PostgreSQL17 s'il est explicitement disponible), annonce et enregistre la version réelle. Toute autre version est refusée, sans installation de paquet. Le port55472 doit être libre avant le démarrage ; un cluster neuf SCRAM et un PGPASSFILE temporaire0600 sont créés. Avant toute création de base, le runner compare le data_directory effectivement interrogé à celui de ce cluster et exige son marqueur. Le trap arrête uniquement ce cluster puis retire son dossier marqué ; si l'arrêt n'est pas prouvé, le dossier reste et le banc échoue. La preuve locale sur PostgreSQL17.12 et la future preuve CI sur PostgreSQL18 sont distinctes : aucune des deux ne prouve une récupération HTTP fournisseur. Les tests de protocole doublent les binaires du wrapper et vérifient les refus et le nettoyage ; ils ne remplacent pas le banc natif.

Ce lot ne reconfigure pas le frontend vers le projet cible, ne restaure pas les secrets ni les sessions et ne prouve pas à lui seul la lecture des médias sur une infrastructure hébergée. Les paramètres d'activation du nouveau service de médias protégés et la récupération complète Auth/Storage nécessitent leurs propres validations. Ce résultat n'accorde aucun GO grande échelle.

Retour arrière : revenir au commit précédent par PR rétablit l'ancien outil pour de futurs exercices. Une archive n'étant jamais modifiée, elle reste rejouable avec une version corrigée. Une restauration sur la production ou sur sa source demeure refusée par les gardes existantes.


## Activation des médias protégés maintenue fermée à la reprise

Une restauration ne reprend jamais automatiquement l'activation de la source. Une ligne `reglages_distants` dont la clé est `medias_proteges` doit porter exactement un objet `{actif:boolean}` ; toute autre forme ou plusieurs lignes de cette clé est un refus explicite. Le seul booléen `valeur.actif` est projeté à `false`, pour l'import et pour la comparaison attendue. Le texte, les autres réglages et leurs nombres restent inchangés ; l'archive n'est jamais réécrite. Le verdict déclare cette différence intentionnelle, plutôt que prétendre à une copie identique de l'activation.

Dès qu'un des trois registres `media_reservations`, `media_assets` ou `media_objects` est annoncé, l'archive doit porter le trio et une ligne valide du réglage. Un sous-ensemble, une entrée absente/invalide ou un mode `--tables` tronquant cette archive est refusé avant mutation. Une archive historique sans ces registres reste compatible ; sa couverture des médias protégés est explicitement NON attestée. Si elle porte néanmoins une entrée valide du réglage, celle-ci est également projetée fermée.

La cible est observée par des SELECT Management explicitement en lecture seule, dont l'attestation `transaction_read_only` est exigée. Une première lecture de catalogue évite toute référence à une table absente ; une seconde ne renvoie que les comptes de valeurs strictement fermées/actives. Une table ou ligne absente, ou exactement `{actif:false}`, est acceptable. Une cible active, malformée, filtrée ou illisible est refusée : l'outil ne la désactive pas automatiquement.

Cette garde précède les écritures DDL, Auth et données, y compris sans option `--schema`, puis est relue aux frontières des phases, après un DDL appliqué et avant les écritures des schémas privés. Les métadonnées d'une cible fraîche ne donnent pas lieu à une activation. Il s'agit d'observations par phase ; elles ne bloquent pas un administrateur externe qui réactiverait entre deux requêtes. Le protocole existant de reprise sur cible isolée impose donc de conserver la cible en maintenance et l'activation fermée pendant tout l'exercice.

Le banc natif est étendu à35 contrôles : source active vers cible fermée, trois registres présents, autre réglage et grand nombre conservés, verdict fermé positif puis mutant cible active négatif, refus avant écriture des phases tables/Auth et d'une cible malformée. Le wrapper CI exige ces35 contrôles ; ses doubles de protocole ne remplacent pas la future exécution PostgreSQL18 du job existant. La preuve locale PostgreSQL17/Node22 reste distincte d'une récupération Auth/Storage réellement hébergée.


## Conserver les états A/O/D/R des triggers

La reproduction native du16/17novembre sur le candidat0fb2eb05 a confirmé que les trois chemins de chargement (lot, ligne à ligne, grand objet SQL) transformaient les états A/D/R en O par un `ENABLE TRIGGER USER` global. Cela aurait affaibli une clôture `ENABLE ALWAYS` après récupération.

Le helper commun capture maintenant les relations concernées et leurs triggers dans des variables JSONB d'un bloc DO, après un verrou ACCESS EXCLUSIVE, dans la même transaction que les données. Le verrou couvre les descendants et son attente est bornée à5secondes. Seuls les triggers USER sont suspendus. Chaque trigger utilisateur retrouve son état exact A/O/D/R par une commande ONLY et des identifiants échappés avec format%I. Les identités, relations et états sont relus avant COMMIT ; une divergence provoque une erreur et le rollback de la transaction. Les triggers internes des contraintes et session_replication_role sont conservés. Aucune table durable ou temporaire supplémentaire n'est créée pour cette mémoire d'états ; la table temporaire des refus du chemin ligne à ligne reste celle qui existait auparavant.

Le banc natif passe à52 contrôles, incluant les35 contrôles de flag/URL et17 cas de triggers : trois chargeurs avec A/D/O/R, nom contenant un guillemet, données contenant des délimiteurs SQL, héritage et partitions aux états parent/enfants différents, erreurs CHECK/FK/LO, refus par lock_timeout, états conservés après rollback, absence de grands objets, journaux nettoyés et clôture de nouveau active après COMMIT. Les erreurs SQL de la fixture LO sont rendues comme une réponse HTTP400, tandis que le SQLSTATE attendu est vérifié séparément dans le transport local : aucun corps serveur n'est recopié dans la preuve. Cette simulation de transport ne constitue toujours pas une recette fournisseur hébergée.
