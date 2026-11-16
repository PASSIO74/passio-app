# private-media — lot serveur local, non déployé

Contrat : `GET|HEAD /functions/v1/private-media/{posts|stories}/{affichant_id}/{asset_uuid}/{original|v720|poster}`. Aucun paramètre query, cookie d'authentification, URL distante ou chemin Storage fourni librement. Une clé anon exactement égale à celle du runtime représente explicitement la voie anon ; tout autre Authorization fourni doit être un bearer utilisateur valide. Un bearer malformé, invalide ou révoqué ne retombe jamais vers anon.

Le client SDK utilise uniquement la clé publique et l'identité appelante : `getUser`, RPC booléen `media_session_active()` sans UID/session libre, puis `media_resoudre(p_type,p_affichant_id,p_asset_id,p_variante)` SECURITY INVOKER. Cette dernière relit les sources sous leur vraie RLS, source originale et affichant compris. La lecture privilégiée Storage intervient ensuite par `fetch` en flux, avec le service_role **déjà injecté dans Supabase Edge**, jamais une clé sur Netlify, un Blob SDK ou une signature retournée au client.

Le bucket `content-protected` est privé et son SELECT client est fermé, auteur compris. Le cache authentifié du fournisseur ne peut donc pas conserver un hit positif obtenu directement par un client. L'évaluation ACL/session est fraîche pour chaque nouvelle requête au broker ; les octets d'un flux déjà autorisé ou déjà reçus ne sont pas rappelables. Un logout resté hors ligne n'est connu du serveur qu'après notification Auth.

Toutes les réponses portent les headers de non-cache en code. Range simple, HEAD, taille déclarée et reçue (26 MiB), MIME fermé, CSP sandbox, nosniff, annulation et erreurs vides sont contrôlés par `../_shared/medias-proteges.js`. Le handler ne retransmet ni Location, ni Set-Cookie, ni headers arbitraires d'amont. L'adaptateur `medias-proteges-supabase.js` fixe l'origine Storage depuis la configuration serveur et n'envoie que les credentials runtime et Range vers celle-ci.

## Upload et publication atomique

RPC `media_reserver(p_type text,p_source_id text,p_variantes jsonb,p_cle_idempotence uuid)`. `p_variantes` contient 1 à 3 objets `{variant,mime_type,byte_size}`, dont `original` obligatoire ; v720/poster sont des images. La réponse contient l'asset, le bucket, l'expiration, et par variante le chemin d'upload neuf et une référence logique HTTPS sur le domaine réservé `media.passio.invalid`.

Cette référence n'est pas une URL d'hébergement et ne donne aucun accès. Le futur client doit la résoudre vers son propre projet/broker, sans fetch sur ce domaine et sans conserver un host utilisateur comme autorité. Un ancien client échoue fermé. Une réservation lie déjà compte, type, ID parent prévu et variantes avant l'upload ; aucun upsert. Limites : 15 minutes, 8 réservations actives et 120 variantes réservées par heure, cumul réservé + objets existants au plus 2 Gio. Les contrôles Storage existants (quota 120 objets/heure, 2 Gio, suppression/suspension) restent requis.

Les triggers `media_lier_source` AFTER INSERT/UPDATE des sources traitent ce protocole. Lors du vrai INSERT sous les RLS/triggers métier existants, ils vérifient acteur, réservation, ID parent, MIME/taille/owner des objets et présence de toutes les variantes, puis créent `media_assets` (FK exactement un post OU une story) et `media_objects`. Une erreur annule le contenu et le registre dans la même transaction. La réservation et les uploads restent récupérables et privés. Un UPDATE sur un parent publié ne peut pas finaliser une nouvelle réservation. Aucun RPC client de finalisation tardive n'existe.

Les identifiants/variantes sont immuables pour les clients ; la conversion historique et les outils opérateur ne doivent pas contourner cette règle sans procédure revue. La référence d'une republication seule ne prouve rien : le résolveur suit `shared_from_post_id`, relit chaque affichant/source sous RLS, borne la chaîne à huit lignes et refuse les cycles. `shared_data` n'est jamais une preuve. Une story est bornée à 24 h par horloge serveur et ancienneté du contenu ; un vlog retiré est refusé.

Storage : `owner_id` texte est pris en charge, ainsi que `owner` UUID déprécié ; au moins un doit prouver l'appelant et toute discordance entre les deux est refusée. Les plafonds du nouveau chemin comptent les deux représentations, en plus du contrôle historique conservé. Le chemin de fichier seul ne prouve jamais le propriétaire. [Propriété Storage Supabase](https://supabase.com/docs/guides/storage/security/ownership).

## Conditions restantes avant promotion

Validation locale acquise : 17 unités HTTP/adaptateur, 126 cas PostgreSQL natif 17.12, application/rejeux, mutations du littéral quota, de l'ACL source et collision de registre rejetées avant DDL, deux sessions réellement bloquées pour idempotence et plafond huit. Table/bucket homonyme inconnu refusé avant adoption ; seul notre registre marqué est rejouable. Le flux local de 26 MiB est testé par morceaux sans prélecture intégrale. Syntaxe JS/TS/Bash, globals, handlers, tests-creux et isolation vérifiés. Ce n'est pas une exécution Deno ou une preuve HTTP fournisseur ; les contraintes ci-dessous restent ouvertes.

- Contre-revue indépendante sécurité/DB de la migration et du handler, empreintes alignées sur preuves réelles.
- Recette HTTP sur nouvelles fixtures STAGING autorisées : gateway `verify_jwt=false` pour la voie réellement anon, vérification utilisateur ici, RPC/grants réels, jamais fallback permissif. Aucun déploiement n'est effectué par ce lot local.
- Prouver streaming/Range/HEAD, 26 MiB, annulation, cache à chaque couche, concurrence, mémoire, durée et coûts/quota des deux transits dans les runtimes hébergés. Les unités en mémoire ne remplacent pas cette preuve.
- Raccord client/SW/Netlify et compatibilité. Le prototype local séparé conserve deux rouges vidéo WebKit Windows ; aucun GO Safari/iOS.
- Migration des anciens objets publics avec originaux/variantes/covers, fermeture effective des anciennes origines et 301, minimum de version. Cette migration de schéma ne convertit ni ne protège rétroactivement les médias déjà dans `content`.
- Sauvegarde, restauration, export, purge de compte et collecte des réservations/orphelins : nouveaux bucket/registre à intégrer avant activation des uploads. Le lot serveur ne prétend pas que ces outils ont été modifiés.
- Rollback : suspension serveur des nouveaux usages, aucune remise en public. Retrait du schéma seulement si nouveau bucket et registre vides, après sauvegarde/revue ; sinon conserver les données privées et réparer en avant. La restauration d'une sauvegarde liée doit rétablir sources/réservations/registre ensemble par procédure opérateur dédiée, sans inventer une session utilisateur.

Les seuls logs ajoutés sont une catégorie fixe et un statut pour panne serveur. Aucun JWT, UID, objet, URL, header ou erreur brute. L'intégration de ces compteurs au pilotage/Sentinelle, ainsi que l'arrêt/reprise opérateur, reste à raccorder explicitement avant promotion.
