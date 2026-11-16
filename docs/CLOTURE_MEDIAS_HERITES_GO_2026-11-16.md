# Fermer les nouveaux écrits des médias hérités

Résultat utilisateur : un ancien onglet ne peut plus alimenter les dossiers personnels publics ni rattacher nouvellement ces références à une publication ou une story. Les cinq surfaces volontairement publiques et les pièces jointes privées de messagerie conservent leurs contrôles actuels.

Risque **critical**. Implémentation Codex, contre-revue indépendante requise. Périmètre : migration complémentaire, tests PostgreSQL et protocole CI. Le client `14fa9af7` et la migration primaire des médias privés restent inchangés. Ce lot ne convertit aucun objet ni ligne existante, ne purge rien, n'active aucun réglage et ne crée aucune dépense.

## Autorité observée et barrière

Le catalogue en lecture seule des deux cibles du 16 novembre à 22:38 UTC porte l'empreinte `ed125de18c90aeae2e4b2c335a49b2259241e4a0244240d7b2420a87f9a638d7`. `content` est public ; les deux policies d'écriture existantes n'ont pas de restriction de catégorie. `service_role` et `postgres` ont BYPASSRLS. Une nouvelle policy RLS seule ne ferme donc pas les finalisations privilégiées.

La migration ajoute deux policies restrictives pour les clients et trois triggers **AFTER ROW, ENABLE ALWAYS**, sans exemption de rôle. Pour `content`, seules `avatars`, `covers`, `passion_photos`, `passion_covers` et `events` sont admises, sur l'ancienne et la nouvelle destination d'un UPDATE. Les noms ambigus (segments vides, traversées, séparateurs échappés, contrôles) sont refusés. Les autres buckets traversent cette classification, puis restent soumis à leurs autorisations antérieures. Aucun contrôle propriétaire/quota n'est remplacé.

Le contrôle AFTER lit la valeur finale après les normaliseurs BEFORE ; un refus annule toute la transaction. Les fonctions de trigger sont SECURITY INVOKER, search_path vide. Les helpers purs exposés aux rôles existants classent leurs seuls arguments ; ils ne lisent aucune table et n'accordent aucun droit.

Sur posts/stories, seuls les nouveaux champs médias actifs sont contrôlés : `media_url`, présentation typée de `shared_data` (dont `passio_media.poster`) et URL des overlays GIF. Les valeurs anciennes inchangées au même chemin restent éditables selon les droits existants. Texte libre, enveloppes non rendues et GIF tiers courants sont conservés. Les références logiques privées gardent leur binder et resolver existants ; `shared_data` n'est jamais une preuve de droits de repartage.

Les URL internes non reconnues, les anciens dossiers personnels, leurs alias/transformations et formes ambiguës sont refusés. Les cinq catégories publiques connues restent publiques, y compris leurs URL absolues canoniques. Un classement « public » n'annule pas le CHECK HTTPS existant : les URL relatives ne deviennent pas un nouveau format accepté en base.

Les gardes vérifient les corps source bruts, les policies antérieures et les marqueurs/empreintes des nouveaux objets au rejeu. Collision, fonction/policy modifiée ou trigger différent de l'état ALWAYS provoquent un refus avant remplacement. Les empreintes de rôles ne dépendent pas des OID propres à un projet.

## Preuves locales

Le banc PostgreSQL 17.12/Node 22 a exercé **284 contre-épreuves métier et 16 contrôles de prérequis/rejeu**, sans erreur, avec base synthétique neuve puis suppression et absence vérifiée. Il couvre les rôles authenticated/service_role/postgres, les cinq publics (original et version légère), les refus personnels/inconnus/encodés, UPSERT, changement de bucket, copie DM autorisée, propriété, quota, références typées et privées, BEFORE hostile, corruption après binder et rollback de la publication/asset. Le DELETE natif conserve les droits propres et laisse l'objet d'un tiers ; il ne remplace pas la preuve du service Storage de suppression.

Le quota réel de dix publications/minute est gardé : les succès sont répartis entre comptes synthétiques, puis dix succès et un onzième refus sont testés séparément. Aucune date ni fonction de quota n'est modifiée pour faire passer ces cas. Les refus CHECK 23514 préexistants et l'UPDATE client de story à zéro ligne sont explicitement distingués des refus 42501 de la nouvelle barrière.

Le wrapper `*.test.sh` est ramassé par le collecteur SQL existant, avec PostgreSQL 18 fourni par la CI (17 explicite accepté), Node 22, cluster neuf SCRAM, pgpass 0600, port loopback libre, répertoire attesté et nettoyage sous marqueur. Cinq tests de protocole doublent seulement les outils du wrapper ; le SQL métier est testé séparément sur PostgreSQL réel. La preuve CI native 18 reste à obtenir avant fusion.

Les audits des tests creux et workflows passent localement. L'audit des tables de compte refuse encore les deux couples `media_reservations.owner_id` et `media_assets.owner_id` introduits par la migration primaire : le lot export/purge distinct doit fournir leur traitement avant intégration. Ce refus n'est pas neutralisé par cette migration complémentaire.

## Exploitation et limites

Centre de pilotage/Sentinelle : les refus ont des messages fixes, sans chemin, URL ni texte utilisateur. Les contrôles GitHub existants montrent les échecs ; aucun nouvel automatisme de production ou collecte PII. Le réglage médias reste fermé jusqu'aux recettes et à la clôture complète des sources héritées.

Un UPDATE de métadonnées d'un ancien objet personnel est volontairement refusé. Si le fournisseur met à jour last_accessed_at pendant lecture/copie, cette opération peut échouer : cette interaction doit être éprouvée sur la plateforme avant application de production. Pour authenticated, une ancienne ligne filtrée par RLS peut rendre zéro ligne modifiée ; le comportement HTTP/blob du fournisseur dans ce cas n'est pas attesté par le banc SQL.

POST/PUT/upsert, copy/move, liens signés antérieurs, TUS, S3, écritures blob hors transaction et anciens caches nécessitent toujours leurs recettes hébergées et protocole de quiescence/retrait. Aucun média réel n'a été lu, copié ou supprimé. La barrière ne rappelle pas les octets déjà distribués et ne certifie pas leur confidentialité rétroactive.

Retour arrière conservateur : suspendre les nouveaux envois/lectures et livrer une correction compatible, conserver la fermeture des anciens préfixes. Ne pas réouvrir le public ni supprimer les registres. Les anciennes archives portant ces chemins exigent une conversion de reprise revue ; une restauration doit préserver l'état ALWAYS des triggers. Aucun GO d'activation ou grande échelle ne découle de ce lot.

Références : [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [RLS PostgreSQL17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [transactions et triggers](https://www.postgresql.org/docs/17/trigger-definition.html).
