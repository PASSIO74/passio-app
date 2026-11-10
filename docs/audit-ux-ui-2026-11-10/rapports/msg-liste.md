# Messagerie — liste, nouvelle conversation, groupes, paramètres, appels

> PREMIÈRE VERSION (sauvegarde progressive) — constats établis par les sondes `outils/sondes/msg-liste-*.js`, captures en cours.

## Constats établis (à détailler)

- Paramètres locaux (épingle, archive, sourdine, fond, brouillon, description de groupe) perdus au rechargement : sonde 07, `_rafraichirConversationsServeur` (app-08:7059–7086).
- « Couper les notifications » sans effet : `_muted` n'est lu nulle part (sonde 08).
- « Nouveau message » : personnages d'exemple mêlés aux vraies personnes ; compte neuf = 5 lignes « Passionné » (sonde 06b).
- « Nouveau groupe » : membres = 10 personnages d'exemple, aucune recherche (sonde 04).
- Ajout d'un membre annoncé réussi alors que le serveur refuse (sonde 04b).
- Recherche sensible aux accents (personnes, conversations, membres) ; recherche de message limitée au dernier message (sonde 06c).
- Fenêtre des membres : compte faux (N+1), « Admin · En ligne » en dur, « Retirer » 26 px sans confirmation, membres hors cache invisibles.
- Photo de groupe : `renderConvList is not defined`, avatar non rafraîchi.
- Aperçus « [DOC] … », « [AUDIO] … », adresse Google Maps brute.
- Fonds de conversation sombres (5 sur 6).
- Panneau Paramètres : 14 entrées en emoji, groupes incohérents, boîtes natives confirm()/prompt().
- Archivée non lue : badge d'onglet fantôme ; un message = 2 unités au badge d'application.
- État vide : « ci-dessus » renvoie à un champ qui ne cherche pas de personnes.
- Appels : désactivés en production ; écrans (simulés) en emoji, minuteur 2,1:1, statistiques techniques visibles.
- Hors ligne : « Aucun utilisateur trouvé » ; groupe créé hors ligne annoncé « créé », jamais synchronisé.
- Soi-même proposé dans la recherche ; conversation vide créée côté serveur dès le choix d'une personne.
