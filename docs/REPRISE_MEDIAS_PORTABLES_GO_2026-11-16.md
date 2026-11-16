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
