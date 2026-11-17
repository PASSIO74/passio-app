# Restauration des identités physiques des médias protégés

Lors d’une restauration sur un autre projet, Storage peut attribuer un nouvel UUID au fichier recréé. Le registre de publication conserve l’identifiant physique dans `media_objects.storage_object_id`. Le restaurateur rapproche ce champ après le chargement des octets et des propriétaires.

Une archive historique dépourvue des trois registres et de fichiers `content-protected` suit le parcours existant. Pour un média protégé, le rapprochement exige les trois tables, l’asset propriétaire, une variante à clé canonique, les index d’octets et de propriétaires liés au manifeste par SHA-256. Le fichier doit appartenir au bon compte et son format doit correspondre à la variante. L’envoi reprend le MIME du registre, y compris pour distinguer audio et vidéo WebM.

Sur la cible de restauration, la requête exige les marqueurs des trois tables, un bucket privé et un objet vivant unique. Elle compare son chemin, ses deux champs de propriété, son MIME, sa taille et son ETag MD5 avec les valeurs archivées. Un UUID source encore attribué à un autre objet, une correspondance ambiguë, une empreinte absente ou multipart, ou un objet du bucket dépourvu de registre suspendent la preuve. Les réservations sans fichier peuvent être restaurées. Un fichier déjà déposé mais sans publication liée exige un traitement de reprise séparé.

Le restaurateur écrit uniquement le nouvel UUID dans la ligne de registre correspondante. Il accepte un UUID déjà rapproché lors d’un rejeu. Chaque lot de cent objets revalide les conditions dans la requête d’écriture. Un lot incomplet reste retenu ; des lots précédents déjà traités peuvent être rejoués. Les octets et le catalogue de l’archive restent la référence.

`--verifier` recalcule les correspondances en lecture seule. Il exige que l’UUID inscrit dans le registre soit bien l’UUID physique courant. Seul ce champ de la copie de comparaison est normalisé. Les autres colonnes et les vérifications ordinaires de la reprise continuent à compter dans le verdict global. La preuve JSON indique le nombre d’objets et le nombre d’identités physiques différentes, ou une catégorie fixe de refus.

Les bancs utilisent des fichiers synthétiques et un PostgreSQL jetable. La preuve de restauration commerciale exige encore une restauration autorisée et une lecture fonctionnelle des médias sur la cible isolée. Le changement ne crée aucune ressource ni activation.
