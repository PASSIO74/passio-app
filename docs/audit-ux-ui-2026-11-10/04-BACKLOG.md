# Backlog priorisé — audit UX/UI PASSIO

> Généré par `outils/construire-galerie.js` le 2026-11-10. Version auditée : main @ 4e1d8ed1152867f309668a4a6847b8219d2f6622 (PR #820, 2026-11-10 14:08 UTC) — identique à la production (release.json : buildId 3d8e98bb12ad).
> Priorité (P0–P3), gravité du problème (1–4), risque technique du changement et effort sont QUATRE notions séparées. Aucun gain chiffré n'est un résultat mesuré.

| Priorité | Constats |
|---|---|
| P0 | 1 |
| P1 | 40 |
| P2 | 105 |
| P3 | 87 |

## Vue d'ensemble

| ID | Priorité | Gravité | Nature | Type | Effort | Risque technique | Domaine | Constat |
|---|---|---|---|---|---|---|---|---|
| PAR-C01 | P0 | 4 | fonctionnel | observation | S | moyen | Partage | Visiteur arrivé par un lien : « Créer mon compte » ouvre le formulaire derrière le contenu ⚠ sensible |
| PRO-C01 | P1 | 4 | fonctionnel | observation | S | faible | Profils et passions | Un enregistrement du profil refusé par le serveur s'annonce « Profil mis à jour » — confidentialité comprise ⚠ sensible |
| MSG-C53 | P1 | 4 | fonctionnel | observation | S | faible | Messagerie | Un toucher bref sur le micro lance un enregistrement qui ne s'arrête pas — et le toucher suivant l'envoie ⚠ sensible |
| PCS-C01 | P1 | 3 | fonctionnel | observation | S | faible | Parcours de bout en bout | La porte « Voir l'activité » n'apparaît qu'au bout d'une minute |
| PCS-C03 | P1 | 3 | clarte | observation | M | faible | Parcours de bout en bout | L'inscription à une activité ne confirme rien et ne propose pas la suite |
| FIL-C01 | P1 | 3 | fonctionnel | observation | S | faible | Fil et interactions | « Voir l'activité » n'apparaît pas à l'ouverture sur une publication reliée à une activité |
| FIL-C06 | P1 | 3 | fonctionnel | observation | M | faible | Fil et interactions | Supprimer un commentaire agit sans confirmation et annonce « supprimé » même si le serveur refuse |
| PRO-C02 | P1 | 3 | fonctionnel | observation | S | faible | Profils et passions | Changer la couverture depuis « Modifier le profil » : le recadreur s'ouvre sous la modale |
| CRE-C01 | P1 | 3 | fonctionnel | observation | S | moyen | Création et médias | Après une photo, une vidéo ou l'audio, le Studio refuse un texte seul |
| BOB-C01 | P1 | 3 | fonctionnel | observation | S | faible | Bobines et stories | Au clavier, chaque espace d'un commentaire de bobine fait passer à la bobine suivante |
| BOB-C02 | P1 | 3 | fonctionnel | observation | S | faible | Bobines et stories | Une bobine photo s'ouvre sans sa photo |
| BOB-C03 | P1 | 3 | friction | observation | S | faible | Bobines et stories | Les deux sorties vers le réel sont hors de l'écran |
| BOB-C04 | P1 | 3 | fonctionnel | observation | M | moyen | Bobines et stories | Aucune bobine ne peut être signalée ni supprimée depuis le lecteur ⚠ sensible |
| IRL-C01 | P1 | 3 | clarte | observation | S | faible | Rencontres IRL | Les exemples « participation désactivée » portent un « Je viens » corail plein et actif |
| IRL-C02 | P1 | 3 | fonctionnel | observation | S | faible | Rencontres IRL | Sans position, les distances sont calculées depuis Paris et affichées comme réelles ⚠ sensible |
| IRL-C07 | P1 | 3 | friction | observation | S | faible | Rencontres IRL | Les filtres actifs sont invisibles hors de la vue Filtre, et ils survivent à la navigation |
| IRL-C50 | P1 | 3 | fonctionnel | observation | S | faible | Rencontres IRL | Après « Je participe », un second appui au même endroit désinscrit |
| IRL-C51 | P1 | 3 | fonctionnel | observation | M | moyen | Rencontres IRL | « Discussion des participants » répond « indisponible hors connexion » alors qu'on est en ligne ⚠ sensible |
| IRL-C65 | P1 | 3 | fonctionnel | observation | S | faible | Rencontres IRL | Les messages émis pendant une fenêtre ouverte sont cachés dessous (validation de « Créer une activité » invisible) |
| MSG-C01 | P1 | 3 | fonctionnel | observation | S | moyen | Messagerie | Épingle, archive, sourdine, fond, brouillon et description s'effacent à chaque démarrage ⚠ sensible |
| MSG-C02 | P1 | 3 | fonctionnel | observation | M | moyen | Messagerie | « Couper les notifications » ne coupe rien ⚠ sensible |
| MSG-C03 | P1 | 3 | clarte | observation | S | faible | Messagerie | « Nouveau message » propose des personnages d'exemple sans le dire — cinq « Passionné » pour un compte neuf |
| MSG-C04 | P1 | 3 | fonctionnel | observation | M | moyen | Messagerie | « Nouveau groupe » n'invite que dix personnages d'exemple et annonce un groupe « créé » ⚠ sensible |
| MSG-C05 | P1 | 3 | fonctionnel | observation | S | faible | Messagerie | Ajouter un membre est annoncé réussi alors que le serveur a refusé ⚠ sensible |
| MSG-C06 | P1 | 3 | friction | observation | S | faible | Messagerie | Les trois recherches distinguent « lea » de « Léa » |
| MSG-C08 | P1 | 3 | clarte | observation | M | moyen | Messagerie | La fenêtre des membres ment sur le nombre, le rôle et la présence ⚠ sensible |
| MSG-C09 | P1 | 3 | friction | observation | S | faible | Messagerie | « Retirer » un membre agit au premier toucher, sans confirmation ni retour |
| MSG-C50 | P1 | 3 | accessibilite | observation | S | faible | Messagerie | Mes vocaux, documents et positions envoyés sont illisibles : blanc sur fond lavande |
| MSG-C52 | P1 | 3 | fonctionnel | observation | S | faible | Messagerie | À l'ouverture, le fil ne s'arrête pas sur le dernier message quand les derniers écrans contiennent des médias |
| MSG-C54 | P1 | 3 | friction | observation | M | moyen | Messagerie | Annuler un vocal demande un second doigt ; glisser hors du bouton puis relâcher l'envoie |
| MSG-C55 | P1 | 3 | friction | observation | M | faible | Messagerie | Un message reçu pendant qu'on relit l'historique ramène de force en bas ; aucun retour rapide aux derniers messages |
| MSG-C56 | P1 | 3 | clarte | observation | M | faible | Messagerie | Ma position précise part en un seul toucher, sans aperçu, sans confirmation ⚠ sensible |
| MSG-C57 | P1 | 3 | fonctionnel | observation | S | faible | Messagerie | Un GIF ou une position dont l'envoi échoue reste affiché comme envoyé |
| MSG-C58 | P1 | 3 | friction | observation | S | faible | Messagerie | « Supprimer pour moi » et « Supprimer pour tous » s'exécutent sans confirmation ni annulation |
| MSG-C60 | P1 | 3 | friction | observation | M | moyen | Messagerie | Le champ de saisie ne fait que 156 px sur 390 : cinq commandes permanentes l'encadrent, dont deux entrées GIF |
| MSG-C85 | P1 | 3 | fonctionnel | observation | S | faible | Messagerie | Conversation ouverte : aucun toast n'est visible — refus, erreurs et confirmations passent inaperçus |
| PAR-C02 | P1 | 3 | fonctionnel | observation | M | moyen | Partage | Après l'inscription, le contenu du lien n'est pas rouvert ⚠ sensible |
| PAR-C03 | P1 | 3 | friction | observation | S | faible | Partage | Les confirmations de partage sont peintes sous les feuilles et sous le lecteur de bobines |
| PAR-C04 | P1 | 3 | fonctionnel | observation | S | faible | Partage | Copie refusée : une adresse brute pendant 3 s, ou rien du tout pour une bobine |
| PAR-C05 | P1 | 3 | friction | observation | M | faible | Partage | Lien mort, privé ou inconnu : huit secondes de silence puis un toast de trois secondes ⚠ sensible |
| PAR-C06 | P1 | 3 | clarte | observation | M | moyen | Partage | Le repartage d'une publication ou d'une bobine perd le média et le lien vers l'originale ⚠ sensible |
| FIL-C08 | P2 | 3 | friction | observation | S | faible | Fil et interactions | « Bloquer » agit au premier toucher, sans confirmation, depuis deux menus ⚠ sensible |
| FIL-C10 | P2 | 3 | fonctionnel | observation | S | faible | Fil et interactions | Le panneau de réaction sort de l'écran par le haut et demande deux touchers |
| PRO-C03 | P2 | 3 | fonctionnel | observation | S | faible | Profils et passions | Le pseudo n'est pas validé à l'enregistrement (vide, « Admin » acceptés) ⚠ sensible |
| PRO-C05 | P2 | 3 | fonctionnel | observation | S | faible | Profils et passions | Une demande d'abonnement en attente est comptée et listée comme abonnement accepté ⚠ sensible |
| PRO-C06 | P2 | 3 | friction | observation | S | faible | Profils et passions | « Bloquer » agit au premier appui, sans confirmation, et retire l'abonnement en silence ⚠ sensible |
| CRE-C03 | P2 | 3 | fonctionnel | observation | S | faible | Création et médias | Le lien avec une activité est invisible et se colle à une publication ultérieure ⚠ sensible |
| MSG-C64 | P2 | 3 | fonctionnel | hypothese | S | faible | Messagerie | La feuille d'actions s'ouvre sous le doigt encore posé : le relâchement peut déclencher une action ou refermer la feuille |
| MSG-C65 | P2 | 3 | fonctionnel | observation | M | moyen | Messagerie | Le menu d'actions ne s'ouvre pas sur une vidéo |
| PAR-C17 | P2 | 3 | clarte | observation | M | faible | Partage | Partage de position : un appui envoie des coordonnées précises, sans aperçu ni confirmation ⚠ sensible |
| PCS-C02 | P2 | 2 | friction | observation | M | moyen | Parcours de bout en bout | « Retour » depuis une conversation perd le contexte d'origine |
| FIL-C02 | P2 | 2 | accessibilite | observation | M | faible | Fil et interactions | La barre d'actions est faite d'emojis : nommée « 🤍 5 », « 💬 34 », « 😊 », en 12,5 px |
| FIL-C03 | P2 | 2 | fonctionnel | observation | S | faible | Fil et interactions | Mon j'aime déjà posé s'affiche « 🤍 » pendant les premières secondes ; le toucher alors compte un j'aime de trop |
| FIL-C04 | P2 | 2 | friction | observation | S | faible | Fil et interactions | La discussion montre deux commentaires et demi : sa liste est bornée à 260 px |
| FIL-C07 | P2 | 2 | fonctionnel | observation | M | faible | Fil et interactions | « Masquer ce commentaire » ne tient que jusqu'à la relecture de la discussion |
| FIL-C11 | P2 | 2 | accessibilite | observation | S | faible | Fil et interactions | Cibles et champs de la discussion sous les seuils (28 × 40, 34 × 34, sans étiquette) |
| FIL-C12 | P2 | 2 | clarte | observation | M | faible | Fil et interactions | La page d'une publication s'intitule « Post » et n'offre aucun champ pour commenter |
| FIL-C13 | P2 | 2 | clarte | jugement | S | faible | Fil et interactions | Les envies ne se lisent pas comme des filtres |
| FIL-C15 | P2 | 2 | clarte | observation | S | faible | Fil et interactions | Le visiteur lit « ta communauté » et « Publier la première » avant tout contenu |
| FIL-C17 | P2 | 2 | clarte | observation | S | faible | Fil et interactions | États vides : le bouton ne fait pas ce que le message conseille |
| FIL-C20 | P2 | 2 | clarte | observation | M | faible | Fil et interactions | Un repartage est un texte sans lien vers l'original ; un partage d'activité déborde de la carte |
| PRO-C04 | P2 | 2 | friction | observation | S | faible | Profils et passions | « Tout » reste coché : toucher « Photos » ne filtre rien |
| PRO-C07 | P2 | 2 | clarte | observation | S | faible | Profils et passions | Le profil d'un compte que j'ai bloqué ne dit pas qu'il est bloqué ⚠ sensible |
| PRO-C15 | P2 | 2 | friction | jugement | S | faible | Profils et passions | « Modifier le profil » : 1 096 px de haut, huit champs de réseaux, Sauvegarder tout en bas |
| CRE-C02 | P2 | 2 | clarte | observation | S | faible | Création et médias | Choisir une passion pour une publication l'ajoute aux passions du compte, sans le dire ⚠ sensible |
| CRE-C04 | P2 | 2 | clarte | observation | M | moyen | Création et médias | Après Publier, les messages se contredisent et l'état de la carte reste figé sur « Sync… » |
| CRE-C05 | P2 | 2 | friction | observation | S | faible | Création et médias | Aucun brouillon : le texte est perdu au rechargement |
| CRE-C07 | P2 | 2 | polish | observation | S | faible | Création et médias | Une seconde zone d'envoi, sombre et illisible, sous chaque aperçu |
| CRE-C08 | P2 | 2 | accessibilite | observation | S | faible | Création et médias | Commandes de création sous 44 px ou sans nom accessible |
| CRE-C09 | P2 | 2 | friction | observation | M | faible | Création et médias | Le texte d'une story ou d'une bobine se saisit dans une boîte native prompt() |
| CRE-C14 | P2 | 2 | fonctionnel | observation | S | faible | Création et médias | Visiteur : le micro est demandé avant tout compte, et « Live vidéo » répond par un simple toast ⚠ sensible |
| BOB-C05 | P2 | 2 | clarte | observation | M | moyen | Bobines et stories | Les bobines vidéo n'ont pas de vignette (rail du fil, grilles de profil) |
| BOB-C06 | P2 | 2 | accessibilite | observation | S | faible | Bobines et stories | Impossible de mettre une bobine en pause, même avec « réduire les animations » |
| BOB-C07 | P2 | 2 | accessibilite | observation | S | faible | Bobines et stories | Stories : le maintien ne met pas en pause, le relâchement saute la story, et le clavier ne fait rien |
| BOB-C08 | P2 | 2 | fonctionnel | observation | S | faible | Bobines et stories | Les stories réelles n'affichent pas leur heure et passent de la plus récente à la plus ancienne |
| BOB-C09 | P2 | 2 | friction | jugement | M | moyen | Bobines et stories | Une story ne permet ni de répondre ni de réagir ⚠ sensible |
| BOB-C10 | P2 | 2 | friction | observation | S | faible | Bobines et stories | Fermer une bobine ouverte depuis un profil ne ramène pas à ce profil |
| BOB-C11 | P2 | 2 | clarte | observation | S | faible | Bobines et stories | Live : le nom de la personne en direct n'apparaît pas |
| BOB-C12 | P2 | 2 | friction | hypothese | S | faible | Bobines et stories | Échap ou retour ferment tout le lecteur au lieu du panneau ou de la feuille ouverte au-dessus |
| BOB-C22 | P2 | 2 | clarte | observation | S | faible | Bobines et stories | Les bobines d'exemple se mêlent à celles des comptes, sans marque et sans fin de liste |
| IRL-C03 | P2 | 2 | friction | jugement | S | faible | Rencontres IRL | Le seul chemin vers « ma position » est enfoui à trois gestes, dans la vue Filtre ⚠ sensible |
| IRL-C04 | P2 | 2 | fonctionnel | observation | S | faible | Rencontres IRL | « Aucune position » affiché, mais la distance et le libellé « Position actuelle » se réfèrent à Paris ⚠ sensible |
| IRL-C05 | P2 | 2 | friction | observation | S | faible | Rencontres IRL | Filtres combinés sans résultat : pied grisé, sans explication ni issue |
| IRL-C06 | P2 | 2 | clarte | observation | S | faible | Rencontres IRL | Le prix d'une activité payante n'apparaît plus sur la carte |
| IRL-C09 | P2 | 2 | accessibilite | observation | S | faible | Rencontres IRL | Commandes de la carte sous 44 px (zoom 29 px, replier / plein écran 38 px) |
| IRL-C11 | P2 | 2 | accessibilite | observation | S | faible | Rencontres IRL | Rouge de l'activité annulée sous le contraste AA (3,23:1 et 3,76:1) |
| IRL-C14 | P2 | 2 | friction | jugement | M | moyen | Rencontres IRL | Les exemples sont mêlés aux vraies activités et occupent la liste même quand le réel existe ⚠ sensible |
| IRL-C52 | P2 | 2 | friction | jugement | S | faible | Rencontres IRL | Après l'inscription, les gestes utiles restent tout en bas de la fiche |
| IRL-C53 | P2 | 2 | clarte | observation | S | faible | Rencontres IRL | L'organisatrice voit « ✓ Je participe / Retirer ma participation » sur sa propre activité ⚠ sensible |
| IRL-C54 | P2 | 2 | fonctionnel | observation | S | faible | Rencontres IRL | Refus « complète » : le message propose la liste d'attente, le bouton propose encore « Je participe » |
| IRL-C55 | P2 | 2 | clarte | jugement | S | faible | Rencontres IRL | « Sur liste d'attente » ne dit pas ce qui va se passer |
| IRL-C57 | P2 | 2 | clarte | jugement | S | faible | Rencontres IRL | Activité annulée : une petite pastille, et le rendez-vous a toujours l'air valable |
| IRL-C58 | P2 | 2 | clarte | observation | S | faible | Rencontres IRL | Deux lignes « Adresse » qui se contredisent quand l'adresse est réservée ⚠ sensible |
| IRL-C60 | P2 | 2 | friction | observation | M | faible | Rencontres IRL | Annuler et supprimer une activité : style ordinaire et `confirm()` natifs |
| IRL-C61 | P2 | 2 | clarte | observation | M | moyen | Rencontres IRL | Modifier une activité rouvre l'ancien formulaire |
| IRL-C63 | P2 | 2 | fonctionnel | observation | S | faible | Rencontres IRL | Avis, message groupé et invitations sont annoncés sans lire le résultat |
| IRL-C66 | P2 | 2 | clarte | observation | S | faible | Rencontres IRL | Activité d'exemple : bouton corail « Je participe » actif, refus seulement après le geste |
| MSG-C07 | P2 | 2 | clarte | observation | S | faible | Messagerie | La recherche « ou un message » ne connaît que le dernier message de chaque conversation |
| MSG-C10 | P2 | 2 | accessibilite | observation | S | faible | Messagerie | Cibles tactiles sous 44 px dans toute la messagerie |
| MSG-C11 | P2 | 2 | fonctionnel | observation | S | faible | Messagerie | Changer la photo du groupe : succès annoncé, rien ne change, erreur JavaScript |
| MSG-C12 | P2 | 2 | clarte | observation | S | faible | Messagerie | Aperçus techniques dans la liste : « [DOC] … », « [AUDIO] … », adresse Google Maps |
| MSG-C13 | P2 | 2 | clarte | jugement | S | faible | Messagerie | La ligne de conversation ne dit ni combien de non-lus, ni qu'elle est en sourdine |
| MSG-C14 | P2 | 2 | clarte | observation | S | faible | Messagerie | Une conversation archivée et non lue fait compter l'onglet sans rien montrer dans la liste |
| MSG-C15 | P2 | 2 | clarte | observation | S | faible | Messagerie | Un message reçu compte deux fois dans le badge de l'application |
| MSG-C16 | P2 | 2 | accessibilite | observation | S | faible | Messagerie | Cinq fonds de conversation sur six sont sombres |
| MSG-C17 | P2 | 2 | clarte | jugement | M | faible | Messagerie | Le panneau « Paramètres » : quatorze entrées en emoji, mal rangées |
| MSG-C18 | P2 | 2 | friction | observation | M | faible | Messagerie | Six boîtes du navigateur pour les actions graves, aux textes incomplets |
| MSG-C19 | P2 | 2 | clarte | observation | S | faible | Messagerie | L'état vide donne une consigne fausse |
| MSG-C20 | P2 | 2 | clarte | observation | S | faible | Messagerie | En-tête de groupe : la photo d'un membre, un nom inerte, aucun lien vers l'activité |
| MSG-C21 | P2 | 2 | clarte | jugement | S | faible | Messagerie | Deux sorties d'un groupe qui ne font pas la même chose |
| MSG-C22 | P2 | 2 | friction | observation | M | moyen | Messagerie | Choisir une personne crée la conversation chez elle avant tout message ; son propre compte est proposé ⚠ sensible |
| MSG-C23 | P2 | 2 | clarte | observation | M | moyen | Messagerie | Hors ligne ou serveur en panne : « aucun résultat » et faux succès |
| MSG-C24 | P2 | 2 | clarte | observation | S | faible | Messagerie | Une conversation d'exemple offre quatorze actions réelles et reste mêlée aux vraies |
| MSG-C25 | P2 | 2 | friction | observation | S | faible | Messagerie | La permission de notification est demandée sans un mot à la première conversation ⚠ sensible |
| MSG-C26 | P2 | 2 | accessibilite | observation | M | moyen | Messagerie | Écrans d'appel : commandes en emoji sans nom, minuteur peu lisible, diagnostic affiché |
| MSG-C51 | P2 | 2 | fonctionnel | observation | S | faible | Messagerie | Un fichier audio que je viens d'envoyer s'affiche comme une bulle vide |
| MSG-C59 | P2 | 2 | friction | observation | S | faible | Messagerie | Sur mobile, la touche Entrée envoie le message : impossible de sauter une ligne |
| MSG-C61 | P2 | 2 | clarte | observation | S | faible | Messagerie | Les séparateurs de jour comptent des tranches de 24 h : « Aujourd'hui » apparaît deux fois, « Hier » désigne avant-hier |
| MSG-C62 | P2 | 2 | clarte | observation | S | faible | Messagerie | Un message non parti affiche quand même « ✓ », et « réessayer » est un mot rouge de 47 × 15 px |
| MSG-C63 | P2 | 2 | friction | observation | S | faible | Messagerie | Hors ligne, le bandeau global recouvre l'en-tête de la conversation |
| MSG-C66 | P2 | 2 | clarte | observation | S | faible | Messagerie | Répondre à une photo ou à un vocal cite une étiquette technique ; « Copier le texte » est proposé sur une photo |
| MSG-C67 | P2 | 2 | friction | observation | S | moyen | Messagerie | Les liens ne sont pas cliquables dans un message ⚠ sensible |
| MSG-C68 | P2 | 2 | clarte | jugement | S | faible | Messagerie | L'en-tête ne donne pas le contexte de l'échange : « Voir le profil » en 1:1, aucun lien vers l'activité dans sa discussion |
| MSG-C69 | P2 | 2 | clarte | observation | S | faible | Messagerie | Deux entrées « proposer un IRL » différentes dans la même conversation, et aucune ne porte la couleur de l'IRL ⚠ sensible |
| MSG-C70 | P2 | 2 | friction | observation | S | faible | Messagerie | Panneau emoji : douze colonnes serrées, une barre de catégories vide, l'ancien violet, et une grille cassée quand la page charge lentement |
| MSG-C72 | P2 | 2 | friction | jugement | M | moyen | Messagerie | Une photo choisie part immédiatement : ni aperçu, ni possibilité de se raviser |
| MSG-C73 | P2 | 2 | fonctionnel | observation | S | faible | Messagerie | Le retour système ne ferme ni la visionneuse d'image ni le panneau emoji : il ferme la conversation derrière eux |
| MSG-C74 | P2 | 2 | friction | observation | S | moyen | Messagerie | Le brouillon ne survit pas au rechargement de l'application |
| MSG-C75 | P2 | 2 | accessibilite | observation | S | faible | Messagerie | Cibles tactiles sous 44 px et commandes sans nom accessible dans toute la conversation |
| MSG-C76 | P2 | 2 | accessibilite | observation | M | faible | Messagerie | Les actions d'un message n'existent qu'à l'appui long ; les pastilles de réaction sont inertes |
| MSG-C78 | P2 | 2 | clarte | observation | S | faible | Messagerie | Refus définitif (blocage) : un « réessayer » rouge qui échouera toujours ; aucune indication dans une conversation avec un compte que j'ai bloqué ⚠ sensible |
| MSG-C81 | P2 | 2 | clarte | observation | S | faible | Messagerie | Enregistrement vocal : rien ne s'affiche quand l'appui est trop court ou que rien n'a été capté ; le refus du micro pose une question |
| MSG-C87 | P2 | 2 | clarte | observation | S | faible | Messagerie | Conversation d'exemple : l'en-tête ne le dit pas et le champ de saisie reste actif |
| MSG-C88 | P2 | 2 | friction | hypothese | M | eleve | Messagerie | Clavier ouvert : la coque garde sa hauteur pendant la frappe — l'en-tête sort probablement de l'écran |
| PAR-C07 | P2 | 2 | clarte | jugement | M | moyen | Partage | Quatre contenus, quatre façons de partager |
| PAR-C08 | P2 | 2 | fonctionnel | observation | M | moyen | Partage | Le lien d'une bobine (et d'un live) n'a ni aperçu, ni forme courte, ni invitation |
| PAR-C09 | P2 | 2 | clarte | observation | S | faible | Partage | Vocabulaire du partage : feed/fil, post/publication, événement/activité/rencontre, trois sens pour « Inviter » |
| PAR-C10 | P2 | 2 | clarte | observation | S | faible | Partage | Le message partagé ne dit ni de qui est le contenu ni ce qu'est PASSIO |
| PAR-C11 | P2 | 2 | clarte | jugement | S | faible | Partage | Le lien porte l'identité de qui partage, sans que rien ne le dise ⚠ sensible |
| PAR-C12 | P2 | 2 | clarte | observation | S | faible | Partage | Fiche d'activité : trois portes « Partager », trois icônes dans l'application |
| PAR-C13 | P2 | 2 | friction | observation | S | faible | Partage | Feuille « Inviter des amis » d'une activité : étroite, sans trace, et en impasse |
| PAR-C14 | P2 | 2 | friction | observation | S | faible | Partage | Inviter à rejoindre PASSIO : deux portes sur trois sont cachées |
| PAR-C15 | P2 | 2 | fonctionnel | observation | S | faible | Partage | Bobine : un double appui sur « Partager dans le Feed » traverse la feuille |
| PAR-C16 | P2 | 2 | clarte | observation | S | faible | Partage | « Partager mon expérience » : le rattachement à l'activité est invisible et persiste ⚠ sensible |
| PAR-C20 | P2 | 2 | clarte | jugement | M | faible | Partage | L'invitation nominative ne tient que six secondes à l'arrivée ⚠ sensible |
| SOC-C02 | P2 | 2 | accessibilite | observation | S | faible | Transverse | Le panneau de conversation fermé reste atteignable au clavier |
| FIL-C14 | P3 | 2 | friction | jugement | S | faible | Fil et interactions | Sur petit écran, le premier contenu commence à mi-hauteur |
| FIL-C24 | P3 | 2 | friction | hypothese | L | faible | Fil et interactions | Une publication ne peut pas être corrigée : son menu n'offre que « Supprimer » |
| FIL-C27 | P3 | 2 | clarte | jugement | S | faible | Fil et interactions | Rien ne distingue la publication d'un compte privé ⚠ sensible |
| PRO-C10 | P3 | 2 | friction | observation | M | moyen | Profils et passions | Fermer un profil ouvert depuis une liste ramène au profil, pas à la liste |
| PRO-C11 | P3 | 2 | clarte | observation | S | faible | Profils et passions | « Toutes » est cité deux fois alors qu'aucun bouton ne porte ce nom |
| PRO-C18 | P3 | 2 | fonctionnel | observation | S | faible | Profils et passions | Photo : un fichier refusé ou un envoi raté ne dit rien |
| PRO-C20 | P3 | 2 | clarte | hypothese | M | moyen | Profils et passions | Le profil d'une personne qui m'a bloquée reste visible avec Suivre et Message ⚠ sensible |
| PRO-C23 | P3 | 2 | accessibilite | observation | S | faible | Profils et passions | Petites cibles et petits textes du domaine |
| CRE-C10 | P3 | 2 | clarte | jugement | S | faible | Création et médias | Story et publication partent sans dire pour qui, ni combien de temps ⚠ sensible |
| BOB-C13 | P3 | 2 | accessibilite | observation | S | faible | Bobines et stories | Commentaires de bobine : commandes minuscules et vouvoiement isolé |
| BOB-C21 | P3 | 2 | friction | observation | M | moyen | Bobines et stories | Ma story : ni « vue par », ni suppression, et elle s'insère au milieu des stories des autres ⚠ sensible |
| IRL-C10 | P3 | 2 | friction | observation | S | faible | Rencontres IRL | Carte plein écran : la seule sortie est l'icône d'entrée, sans libellé |
| MSG-C28 | P3 | 2 | accessibilite | observation | S | faible | Messagerie | Champs sans étiquette, onglets et calques sans rôle |
| MSG-C32 | P3 | 2 | clarte | hypothese | S | faible | Messagerie | Au-delà de 8 s de chargement, la liste affiche « Aucune conversation » |
| MSG-C84 | P3 | 2 | polish | observation | S | faible | Messagerie | Transférer : la conversation d'origine est proposée en premier et l'envoi part sans confirmation |
| PAR-C18 | P3 | 2 | accessibilite | observation | S | faible | Partage | Cibles de partage sous 44 px |
| SOC-C01 | P3 | 2 | accessibilite | observation | S | faible | Transverse | Plusieurs commandes fréquentes mesurent moins de 44 px |
| PCS-C04 | P3 | 1 | polish | observation | S | faible | Parcours de bout en bout | Le compteur d'abonnés ne bouge pas après « Suivre » |
| PCS-C05 | P3 | 1 | clarte | hypothese | M | faible | Parcours de bout en bout | La conversation ouverte depuis une publication ne rappelle pas ce qui l'a motivée |
| PCS-C06 | P3 | 1 | polish | observation | S | faible | Parcours de bout en bout | Le même geste d'inscription porte deux noms : « Je viens » et « Je participe » |
| FIL-C05 | P3 | 1 | clarte | observation | S | faible | Fil et interactions | Le même fil s'appelle « Discussion » ou « Commentaires », et son nombre passe de 34 à 37 en l'ouvrant |
| FIL-C09 | P3 | 1 | fonctionnel | observation | S | faible | Fil et interactions | « Copier le texte » annonce « Texte copié » sans attendre le presse-papiers |
| FIL-C16 | P3 | 1 | clarte | jugement | S | faible | Fil et interactions | Le séparateur « Exemples PASSIO » prend quatre lignes de 12 px et deux boutons |
| FIL-C18 | P3 | 1 | polish | observation | S | faible | Fil et interactions | Une photo qui ne charge pas laisse un rectangle gris muet |
| FIL-C19 | P3 | 1 | friction | jugement | S | faible | Fil et interactions | Une photo très haute occupe plus d'un écran |
| FIL-C21 | P3 | 1 | polish | observation | M | faible | Fil et interactions | La vidéo du fil montre un cadre noir et deux commandes de lecture |
| FIL-C22 | P3 | 1 | polish | observation | S | faible | Fil et interactions | « Post », « publication », « Passio », « feed » : quatre mots pour une publication et son fil |
| FIL-C23 | P3 | 1 | polish | observation | S | faible | Fil et interactions | Les menus mêlent emojis et pictogrammes comme icônes de fonction |
| FIL-C25 | P3 | 1 | polish | observation | S | faible | Fil et interactions | Le bandeau hors ligne recouvre la barre du haut |
| FIL-C26 | P3 | 1 | clarte | observation | S | faible | Fil et interactions | L'aperçu des commentaires d'une carte affiche « 🤍 0 » pour un commentaire aimé |
| FIL-C28 | P3 | 1 | friction | jugement | M | faible | Fil et interactions | La suite du fil se demande au bouton « ⤵ Charger plus de posts » |
| FIL-C29 | P3 | 1 | friction | observation | S | faible | Fil et interactions | La saisie d'un commentaire s'arrête à 400 caractères sans le dire |
| FIL-C30 | P3 | 1 | clarte | observation | S | faible | Fil et interactions | « Passionnés à découvrir » propose d'abord des comptes que je suis déjà |
| PRO-C08 | P3 | 1 | clarte | jugement | S | faible | Profils et passions | Mon profil et le profil visité ne disent pas les mêmes choses |
| PRO-C09 | P3 | 1 | polish | observation | S | faible | Profils et passions | Listes Abonnés / Abonnements : emoji au lieu des photos, rendus différents, double « × » |
| PRO-C12 | P3 | 1 | clarte | observation | S | faible | Profils et passions | L'aide des passions parle de « place » et de « changement » alors que le plafond est levé |
| PRO-C13 | P3 | 1 | polish | jugement | S | faible | Profils et passions | « Mes passions » : en-tête redondant, trois emojis par carte, badge photo de 20 px |
| PRO-C14 | P3 | 1 | clarte | observation | S | faible | Profils et passions | Vocabulaire hérité du multi-profil : « Mon profil principal », « Bio de ce profil » |
| PRO-C16 | P3 | 1 | clarte | jugement | S | faible | Profils et passions | Le crayon « Modifier le profil » ouvre un menu de six options |
| PRO-C17 | P3 | 1 | accessibilite | jugement | S | faible | Profils et passions | Profil visité : deux boutons « pleins », 39 px de haut, texte de 12 px |
| PRO-C19 | P3 | 1 | polish | observation | S | faible | Profils et passions | « Ajouter une passion » propose des passions que j'ai déjà |
| PRO-C21 | P3 | 1 | polish | observation | S | faible | Profils et passions | La pastille du nombre de publications est rognée sur le rail des passions |
| PRO-C22 | P3 | 1 | polish | observation | S | faible | Profils et passions | « Signaler ce compte » hérite du plein écran du profil et le remplace |
| CRE-C06 | P3 | 1 | clarte | observation | S | faible | Création et médias | « MOOD » en anglais, pastilles 40 px / 11 px, ordre différent du Fil |
| CRE-C11 | P3 | 1 | friction | observation | S | faible | Création et médias | Les panneaux emojis et GIF recouvrent la barre d'outils et ne se referment qu'en choisissant |
| CRE-C12 | P3 | 1 | polish | observation | S | faible | Création et médias | « Recommencer » quasi invisible sur l'aperçu de bobine |
| CRE-C13 | P3 | 1 | clarte | observation | M | faible | Création et médias | La bobine choisit sa passion autrement que le Studio, et sans envie |
| CRE-C15 | P3 | 1 | clarte | observation | S | faible | Création et médias | « Post » et « publication » alternent ; « Photo / vidéo » cache le texte seul |
| CRE-C16 | P3 | 1 | friction | hypothese | M | moyen | Création et médias | Une publication ne peut pas être corrigée, seulement supprimée ⚠ sensible |
| CRE-C17 | P3 | 1 | polish | observation | S | faible | Création et médias | Sélecteur de passion : titre sous la croix, « + » qui ne marque pas la sélection |
| CRE-C18 | P3 | 1 | friction | jugement | M | moyen | Création et médias | Préparation d'une vidéo lourde : plein écran sans annulation jusqu'à 90 s |
| BOB-C14 | P3 | 1 | polish | observation | S | faible | Bobines et stories | Haut du lecteur : fermer à 38 px, étiquette en doublon qui chevauche la flèche, « Commentaire » sans nombre |
| BOB-C15 | P3 | 1 | clarte | observation | S | faible | Bobines et stories | Vidéo illisible : un bouton « Lire » recouvre le message « Vidéo non lisible » |
| BOB-C16 | P3 | 1 | polish | observation | S | faible | Bobines et stories | Visionneuse de stories : piste des barres invisible, « ⋯ » au milieu, ✕ sans nom accessible |
| BOB-C17 | P3 | 1 | polish | observation | S | faible | Bobines et stories | Bobines et stories montrent l'emoji de la personne au lieu de sa photo ; ma bobine m'est proposée à « découvrir » |
| BOB-C18 | P3 | 1 | polish | observation | S | faible | Bobines et stories | Réactions de bobine et de commentaire : code masqué, mort ou purement local |
| BOB-C19 | P3 | 1 | polish | observation | S | faible | Bobines et stories | État vide du lecteur : chemin « ➕ → Studio → onglet Bobine » périmé |
| BOB-C20 | P3 | 1 | clarte | observation | S | faible | Bobines et stories | Les confirmations sont peintes sous le lecteur (commentaire posté, lien copié) |
| IRL-C08 | P3 | 1 | polish | observation | S | faible | Rencontres IRL | Les activités sans couverture portent toutes une épingle 📍 au lieu de l'emoji de leur passion |
| IRL-C12 | P3 | 1 | clarte | observation | S | faible | Rencontres IRL | Une recherche sans résultat annonce « Rien avec ces filtres » |
| IRL-C13 | P3 | 1 | clarte | observation | S | faible | Rencontres IRL | Mots divergents pour la même chose : activité / événement / rencontre / expérience ; « Je viens » / « Je participe » ; « Mes rencontres » = « Mes inscriptions » |
| IRL-C15 | P3 | 1 | polish | observation | M | moyen | Rencontres IRL | Carte : marqueurs empilés sans regroupement, et aucun message si les tuiles échouent |
| IRL-C16 | P3 | 1 | accessibilite | observation | S | faible | Rencontres IRL | Flèches de mois du calendrier à 28 × 28 px |
| IRL-C17 | P3 | 1 | polish | jugement | S | faible | Rencontres IRL | « C'est maintenant » et « En cours » disent deux fois la même chose sur la même carte |
| IRL-C18 | P3 | 1 | clarte | hypothese | S | faible | Rencontres IRL | Suggestions de lieu peu pertinentes (« Grenoble » → Le Boupère, Arcisses…) |
| IRL-C19 | P3 | 1 | clarte | observation | S | faible | Rencontres IRL | Le toast de refus de position renvoie à « Filtre → Autour de moi », qui n'existe plus |
| IRL-C56 | P3 | 1 | clarte | observation | S | faible | Rencontres IRL | Activité passée : « 7 places restantes », tuile corail et deux « Partager mon expérience » |
| IRL-C59 | P3 | 1 | polish | observation | S | faible | Rencontres IRL | Feuille à trois états : libellés cassés et mots différents de la fiche |
| IRL-C62 | P3 | 1 | clarte | observation | S | faible | Rencontres IRL | Activité, événement, rencontre ; participer, venir, inscrit : plusieurs mots pour la même chose |
| IRL-C64 | P3 | 1 | polish | observation | S | faible | Rencontres IRL | Les messages éphémères se posent sur le pied d'action, parfois deux pour un geste |
| IRL-C67 | P3 | 1 | polish | observation | S | faible | Rencontres IRL | Bas de fiche chargé : Partager trois fois, deux barres de tri des commentaires |
| IRL-C68 | P3 | 1 | accessibilite | observation | S | faible | Rencontres IRL | Petites cibles dans les fenêtres d'organisation (29 px) |
| IRL-C69 | P3 | 1 | polish | observation | S | faible | Rencontres IRL | Sur ordinateur, la fiche s'étire sur toute la largeur |
| MSG-C27 | P3 | 1 | polish | observation | S | faible | Messagerie | Mots qui varient : utilisateur / personne / membre, chercher / rechercher, conversation / discussion |
| MSG-C29 | P3 | 1 | polish | observation | S | faible | Messagerie | Après un déblocage, la conversation ne revient pas tout de suite |
| MSG-C30 | P3 | 1 | friction | hypothese | M | moyen | Messagerie | Archiver, épingler ou marquer non lu demande d'ouvrir la conversation |
| MSG-C31 | P3 | 1 | friction | jugement | S | faible | Messagerie | Une passion est exigée pour créer un groupe ⚠ sensible |
| MSG-C71 | P3 | 1 | polish | observation | S | faible | Messagerie | Deux sélecteurs de GIF différents, et un GIF part au premier toucher |
| MSG-C77 | P3 | 1 | polish | jugement | S | faible | Messagerie | L'heure sous chaque bulle et de grandes marges : sept messages courts par écran |
| MSG-C79 | P3 | 1 | accessibilite | observation | S | faible | Messagerie | Fonds de conversation sombres : heures et séparateurs peu lisibles, et un mode sombre local alors qu'il a été retiré |
| MSG-C80 | P3 | 1 | polish | observation | S | faible | Messagerie | Lecteur de vocal : deux vocaux jouent en même temps, le son continue après avoir quitté la conversation |
| MSG-C82 | P3 | 1 | polish | observation | S | faible | Messagerie | Icônes fonctionnelles en emoji et violet d'avant la palette actuelle |
| MSG-C83 | P3 | 1 | polish | observation | S | faible | Messagerie | Noms de fichier coupés à 140 px sans moyen de les lire en entier |
| MSG-C86 | P3 | 1 | polish | observation | S | faible | Messagerie | Répondre : la barre de réponse masque le bas du dernier message, et une citation ancienne mène à « Message introuvable » |
| PAR-C19 | P3 | 1 | polish | observation | S | faible | Partage | Après le partage, la feuille reste ouverte ici et se ferme là |
| PAR-C21 | P3 | 1 | polish | hypothese | S | moyen | Partage | Page d'aperçu : nue pour un humain pris pour un robot ⚠ sensible |
| SOC-C03 | P3 | 1 | polish | jugement | L | moyen | Transverse | Tablette et ordinateur : la colonne mobile au milieu d'un grand vide |

## P0 — parcours bloqué ou conséquence grave

### PAR-C01 — Visiteur arrivé par un lien : « Créer mon compte » ouvre le formulaire derrière le contenu  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Fenêtre « Crée ton compte pour… » et toast d'invitation → `ouvrirAuth` (js/first-run.js:1544) ; `#onboarding` z-index 50, `#postDetailPage` et `.event-detail-page` 200 (index.html:1256, styles.css:2342), `.reels-viewer` 9999 (styles.css:4736)
- **Domaine** : Partage · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde partage-10 (lien `#post-pa_lea_1`, visiteur) : après le geste, `#onboarding` est actif et affiché, mais 5 points sur 5 de l'écran rendent `postDetailPage` ; le premier champ du formulaire n'est pas atteignable ; il le devient seulement après un retour arrière. Captures PAR-042, PAR-046, PAR-048 : écran identique avant et après, `ecran.onboarding = true` dans les trois fiches.
- **Problème** : La personne qui vient d'ouvrir un lien partagé touche « Créer mon compte » : la fenêtre se ferme et l'écran reste celui du contenu. Le formulaire existe, dessous.
- **Situation déclenchante** : Visiteur sans compte sur la page d'une publication, une fiche d'activité ou le lecteur de bobines (les trois écrans d'arrivée d'un lien), qui tente d'aimer, de participer, de suivre — ou touche le toast « X t'invite ».
- **Conséquence pour l'utilisateur** : Le seul chemin d'inscription proposé à un invité ne mène visiblement nulle part ; il faut deviner de fermer le contenu pour trouver le formulaire.
- **Proposition** : `ouvrirAuth` ferme l'écran de contenu ouvert (`closePost`, `closeEventDetail`, `closeReels`) après avoir mémorisé sa cible (voir PAR-C02), ou `#onboarding` passe au-dessus de ces trois plans.
- **Visuels** : [PAR-042](galerie/index.html#/surface/PAR-042), [PAR-046](galerie/index.html#/surface/PAR-046), [PAR-048](galerie/index.html#/surface/PAR-048) · **Surfaces** : PAR-042, PAR-046, PAR-048
- **Priorité** : P0 · **Gravité** : 4/4 · **Effort** : S · **Risque technique** : moyen
- **Dépendances** : PAR-C02 (mémoriser la cible avant de fermer).
- **Risque de régression** : Pile d'historique (chaque fermeture rend une entrée) ; suites first-run-*.spec.js, liens-partage-post-profil.spec.js, reel-deeplink.spec.js.
- **Critère d'acceptation** : Visiteur sur `#post-<id>`, `#irl-event-<id>` et `#reel=<id>` : après « Créer mon compte », `document.elementFromPoint` au centre de l'écran appartient à `#onboarding`, et le champ e-mail reçoit le focus au toucher.
- **Fichiers probables** : `js/first-run.js`, `styles.css`

## P1 — friction importante sur un parcours essentiel

### PRO-C01 — Un enregistrement du profil refusé par le serveur s'annonce « Profil mis à jour » — confidentialité comprise  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Modifier le profil › Sauvegarder — saveMainProfile (js/app-06-reels-partage.js:2099-2113)
- **Domaine** : Profils et passions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Panne programmée PATCH profiles 500 : toast « Profil mis à jour », état local isPrivate=true et pseudo changé, ligne serveur inchangée (is_private=false). supaSavePublicProfile rend false (app-08:4026) mais son retour n'est pas lu ; le catch est vide.
- **Problème** : La personne croit son compte privé (et son pseudo changé) alors que rien n'est écrit.
- **Situation déclenchante** : Réseau instable, session expirée, refus RLS ou contrainte serveur (pseudo).
- **Conséquence pour l'utilisateur** : Publications visibles de tous alors qu'on les croit réservées ; écran et serveur divergent jusqu'au prochain démarrage.
- **Proposition** : Lire le verdict : en cas d'échec, garder la modale ouverte, dire « Rien n'a été enregistré — ton compte est toujours public », proposer « Réessayer », ne pas écrire l'état local avant le succès.
- **Visuels** : [PRO-015](galerie/index.html#/surface/PRO-015) · **Surfaces** : PRO-015
- **Priorité** : P1 · **Gravité** : 4/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faux clients des suites qui rendent true ; garde `privacyChoisi`. Verrous : suites confidentialité du profil.
- **Critère d'acceptation** : PATCH profiles refusé : aucun toast de succès, message d'échec visible, state.user.general inchangé, modale ouverte avec la saisie.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### MSG-C53 — Un toucher bref sur le micro lance un enregistrement qui ne s'arrête pas — et le toucher suivant l'envoie  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Conversation › bouton micro — startVoiceRecord attend getUserMedia (js/app-09-boot-pwa.js:1989) avant de poser _isRecording (:2028) ; stopVoiceRecord ne fait rien tant que _isRecording est faux (:2053-2057) ; index.html:1466-1472
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 05 (état simulé : micro remplacé par un flux de synthèse, vrai MediaRecorder) : après un simple toucher, 900 ms plus tard `_isRecording` = true et la barre « Enregistrement en cours… » reste affichée, personne ne tient le bouton ; le toucher suivant sur le micro envoie un vocal de 3 s. Même résultat quand l'autorisation arrive après le relâchement (1,8 s) : enregistrement mains libres, puis envoi de 4 s au toucher suivant. Capture MSG-172.
- **Problème** : Le micro s'ouvre après que j'ai levé le doigt : l'enregistrement démarre tout seul et continue. Rien ne dit comment l'arrêter ; si je retouche le micro pour « l'éteindre », le son capté part chez mon interlocuteur.
- **Situation déclenchante** : Tout appui plus court que le temps d'ouverture du micro : un toucher simple, ou le premier usage (on lève le doigt pour répondre à l'invite d'autorisation du navigateur).
- **Conséquence pour l'utilisateur** : Envoi involontaire d'un enregistrement d'ambiance à une autre personne : atteinte à la vie privée, et perte de confiance dans le bouton.
- **Proposition** : Mémoriser « doigt toujours posé » au touchstart ; si le doigt est levé avant l'arrivée du flux, fermer le flux aussitôt et ne rien enregistrer, puis afficher « Maintiens le micro pour enregistrer ». Ne jamais laisser un enregistrement actif sans doigt posé (ou alors comme mode verrouillé explicite, non proposé ici).
- **Visuels** : [MSG-172](galerie/index.html#/surface/MSG-172) · **Surfaces** : MSG-172, MSG-170
- **Priorité** : P1 · **Gravité** : 4/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune ; se livre avec MSG-C54.
- **Risque de régression** : Le premier usage (invite d'autorisation) ne doit plus démarrer d'enregistrement : la personne réappuie une fois l'accès accordé. Verrous : audit-2026-11-04 « mise à jour pendant un vocal » (pwa-maj-pendant-appel), message-media-echec.
- **Critère d'acceptation** : Toucher de 100 ms sur le micro, flux disponible après 300 ms : aucune piste audio active 1 s plus tard (`_isRecording` faux, barre masquée), aucun message créé, une consigne visible.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `index.html`

### PCS-C01 — La porte « Voir l'activité » n'apparaît qu'au bout d'une minute

- **Emplacement** : Fil › carte d'une publication reliée à une activité — js/app-08-ui-modals-tour.js:6283-6287 (rafraichir les activités : seul `renderIRL` est rappelé, et seulement si l'écran Rencontrer est actif), décorateur js/ui-v3-passerelle.js:976 (`construireVoirActivite`)
- **Domaine** : Parcours de bout en bout · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Mesuré au banc, compte connecté, sans aucun geste : porte absente à 5, 20 et 40 s après l'ouverture, présente à 60 s (sonde parcours-03-suite.js) ; présente aussitôt après un aller-retour d'écran (parcours-02-lien-activite.js). L'activité est chargée à ≈ 3 s (state.seed.events passe de 36 à 37) mais le fil n'est pas repeint.
- **Problème** : La publication annonce un rendez-vous (pastille « Rencontrer ») sans offrir de chemin vers lui.
- **Situation déclenchante** : Toute ouverture de l'application : le fil se peint avant l'arrivée des activités du serveur.
- **Conséquence pour l'utilisateur** : La personne qui lit la publication pendant sa première minute ne voit aucun moyen de rejoindre l'activité : le passage Fil → IRL, cœur de la promesse, est interrompu au moment où l'envie naît.
- **Proposition** : Quand `fusionnerEvenementsServeur` signale un changement, redécorer les cartes du fil visibles (ou invalider `_feedDomSig` et repeindre), comme c'est déjà fait pour l'écran Rencontrer.
- **Visuels** : [PCS-001](galerie/index.html#/surface/PCS-001) · **Surfaces** : PCS-001, PCS-007
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune ; à coordonner avec le fenêtrage du fil (`_feedWindowRedecorer`, fiche lots-ui 14) s'il est activé.
- **Risque de régression** : Repeint du fil au mauvais moment (perte de position, saut). Repeindre seulement les cartes concernées, ou garder l'ancrage. Verrous : feed-premier-rendu, ui-v3-passerelle, fil-reel-dabord.
- **Critère d'acceptation** : Compte connecté, publication reliée à une activité du serveur : « Voir l'activité » est visible au plus 1 s après l'arrivée de la lecture des activités, sans geste, et la position de défilement ne bouge pas.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`, `js/ui-v3-passerelle.js`

### PCS-C03 — L'inscription à une activité ne confirme rien et ne propose pas la suite

- **Emplacement** : Fiche d'activité › pied fixe `#eventDetailCta .v4b-rsvp` après « Je participe » (js/ui-v4b-fiche.js)
- **Domaine** : Parcours de bout en bout · **Nature** : clarte · **Type** : observation
- **Preuve** : Captures PCS-009/010 : aucun toast (journal des toasts vide après le geste), le bouton plein devient un bouton pâle « ✓ Je participe » et un lien « Retirer ma participation » ; l'écriture a bien eu lieu (event_attendees = going).
- **Problème** : L'état « inscrit » ressemble à un bouton désactivé ; la seule action offerte est de se désinscrire.
- **Situation déclenchante** : Toute inscription réussie.
- **Conséquence pour l'utilisateur** : Doute sur la réussite (risque de double geste ou d'abandon) et aucune passerelle vers la rencontre : on ne sait pas qu'on peut écrire aux participants, ni comment se préparer.
- **Proposition** : Remplacer l'état pâle par une confirmation explicite (date, organisateur prévenu, rappel si notifications activées, `role=status`) suivie de l'étape suivante : « Écrire aux participants » (discussion existante), puis « Itinéraire » et « Inviter quelqu'un » (fonctions existantes). Désinscription formulée « Je ne peux plus venir ».
- **Visuels** : [PCS-009](galerie/index.html#/surface/PCS-009) · **Surfaces** : PCS-009, PCS-010
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : La proposition d'abonnement aux notifications « juste après une inscription CONFIRMÉE » (CLAUDE.md) doit trouver sa place dans ce bloc, pas s'y superposer.
- **Risque de régression** : Marqueur RSVP sur le nœud injecté, jamais sur `#eventDetailCta` (lots-ui INDEX, UI-4B). Verrous : ui-v4b-fiche, irl-*.
- **Critère d'acceptation** : Après « Je participe » réussi : un message de confirmation lisible par un lecteur d'écran nomme la date ; une action « Écrire aux participants » est visible sans défilement ; « Je ne peux plus venir » reste accessible ; en cas de refus serveur (complète, annulée), le message dit pourquoi et rien n'est affiché comme réussi.
- **Fichiers probables** : `js/ui-v4b-fiche.js`, `js/app-07-ia-explore-irl.js`, `styles.css`

### FIL-C01 — « Voir l'activité » n'apparaît pas à l'ouverture sur une publication reliée à une activité

- **Emplacement** : Fil › carte reliée à une activité — décoration UI-3B (js/ui-v3-passerelle.js:382-383 et 1006-1008), arrivée des activités (js/app-08-ui-modals-tour.js:6283-6288 et 9881)
- **Domaine** : Fil et interactions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Capture FIL-005 (m390, m360) : pastille « Rencontrer », aucune porte, ~6 s après l'ouverture. Mesure du banc (outils/sondes/parcours-02-lien-activite.js, parcours-03-suite.js, capture PCS-001) : porte absente à 5, 20 et 40 s, présente à 60 s ou après un aller-retour d'écran. Cause lue dans le code : `decorerArticle` (ui-v3-passerelle.js:382-383) confie la carte à `decorerActivite`, qui sort sans rien peindre quand `trouverEvenement` ne connaît pas encore l'activité (1006-1008) ; les activités arrivent ensuite du serveur (`fusionnerEvenementsServeur`, app-08:6283) et le seul repeint déclenché est `renderIRL()` quand l'écran Rencontrer est actif (app-08:6286-6287, 9796) ; rien n'invalide `_feedDomSig` ni ne rappelle `PassioUIV3.decorateFeed()`. L'observateur du fil (ui-v3-passerelle.js:460) n'écoute que les ajouts de cartes.
- **Problème** : La carte annonce une rencontre (pastille corail) mais n'offre aucun moyen d'ouvrir l'activité pendant la première minute. Un partage d'activité montre, lui, l'ancienne sous-carte « ÉVÉNEMENT IRL » qui déborde de la carte (FIL-014).
- **Situation déclenchante** : Ouvrir l'application sur le fil quand une publication reliée à une activité est dans les premières cartes (cas normal : le fil se peint avant la lecture des activités).
- **Conséquence pour l'utilisateur** : Le passage Fil → IRL, cœur de la promesse, échoue au moment où la personne lit la publication : elle ne peut ni voir ni rejoindre l'activité.
- **Proposition** : À l'arrivée des activités (fin de `fusionnerEvenementsServeur` quand `change` est vrai, et après la fusion du démarrage), redécorer les cartes du fil qui portent une référence d'activité sans porte : appeler `PassioUIV3.decorateFeed()` (la décoration saute déjà les cartes décorées) — sans repeindre le fil.
- **Visuels** : [FIL-005](galerie/index.html#/surface/FIL-005) · **Surfaces** : FIL-005, FIL-014
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible : la décoration est idempotente (`[data-v3-bridge]`). Verrous concernés : tests/e2e/ui-v3-passerelle*.spec.js, activite-au-fil.spec.js.
- **Critère d'acceptation** : Compte connecté, faux serveur : 5 s après l'ouverture, la carte d'une publication dont `event_id` désigne une activité à venir porte « Voir l'activité », sans changer d'écran.
- **Fichiers probables** : `js/ui-v3-passerelle.js`, `js/app-08-ui-modals-tour.js`

### FIL-C06 — Supprimer un commentaire agit sans confirmation et annonce « supprimé » même si le serveur refuse

- **Emplacement** : Options de mon commentaire — `deleteCommentEntry` et `_supaDeleteCommentRow` (js/app-04-comments-shop.js:2444-2482) : ni confirmation, ni lecture de `{ error }`
- **Domaine** : Fil et interactions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Capture FIL-035. Sonde fil-04-ecritures (faux serveur répondant 500 au DELETE de post_comments) : toast « Commentaire supprimé », commentaire retiré de l'écran (oui), ligne toujours en base (true) ; à la relecture de la discussion il est de retour (true). Dans le code : `await supa.from(table).delete()` sans lecture du verdict, à l'inverse de la suppression d'une publication (file vérifiée `_delOb*`).
- **Problème** : Un toucher sur « Supprimer » efface aussitôt, sans retour possible ; et si l'écriture échoue, l'écran dit quand même « Commentaire supprimé » — le commentaire reste visible de tous et revient chez son auteur.
- **Situation déclenchante** : Toucher « Supprimer » (voisin de « Modifier ») ; réseau instable ou refus du serveur.
- **Conséquence pour l'utilisateur** : Suppression accidentelle irréversible ; ou fausse assurance d'avoir retiré un propos.
- **Proposition** : Confirmer (ou proposer « Annuler » pendant 5 s dans le toast) ; lire le verdict de l'écriture et, sur un échec, remettre le commentaire à l'écran avec « Non supprimé · Réessayer », sur le modèle de la file des commentaires.
- **Visuels** : — · **Surfaces** : FIL-035
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Compteur `commentsTotal` décrémenté à tort si l'annulation n'est pas symétrique. Verrous : commentaires*.spec.js, retrait-interactions-direct.spec.js.
- **Critère d'acceptation** : DELETE refusé par le serveur : le commentaire est de nouveau à l'écran avec un message d'échec ; aucun toast « supprimé ». Suppression réussie : un geste d'annulation ou une confirmation existe.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PRO-C02 — Changer la couverture depuis « Modifier le profil » : le recadreur s'ouvre sous la modale

- **Emplacement** : Modifier › Photo de couverture › Changer — passioOpenCropper z-index 6000 (app-06:1563) sous #modalBackdrop 10001
- **Domaine** : Profils et passions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde profils-07 (vrai filechooser) : recadreur présent, modale active, elementFromPoint au centre = #editBio ; après fermeture de la modale le recadreur réapparaît.
- **Problème** : Après le choix de la photo, rien ne bouge ; le recadreur est caché.
- **Situation déclenchante** : Seule porte de la couverture dans la modale d'édition.
- **Conséquence pour l'utilisateur** : Changement de couverture impossible par ce chemin ; recadreur fantôme ensuite.
- **Proposition** : Placer le recadreur au-dessus des modales (z-index > 10001) ou fermer la modale avant de l'ouvrir (le brouillon existe déjà).
- **Visuels** : — · **Surfaces** : PRO-017, PRO-018
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Ordre des couches avec le menu ⋯ (10002) et les toasts. Verrous : recadrage, couverture.
- **Critère d'acceptation** : Depuis la modale, après choix d'une image, elementFromPoint au centre de l'écran rend #pcropImg ; Valider rouvre la modale avec la saisie.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### CRE-C01 — Après une photo, une vidéo ou l'audio, le Studio refuse un texte seul

- **Emplacement** : Studio — js/app-06-reels-partage.js:5025, 5047 (clearPhoto), 5093 (clearVideo), 5229 (clearAudio), 5266-5281, 5428-5437 ; onglets masqués styles.css:9338
- **Domaine** : Création et médias · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sondes creation-01/02/03 : photo ajoutée puis retirée → studioType « photo », toast « Ajoute une photo. » ; photo PUBLIÉE puis texte → même refus ; Créer → Audio puis Publication → « Enregistre un audio. ». Captures CRE-007, CRE-011.
- **Problème** : Le format du dernier média reste en mémoire ; les onglets qui permettaient de revenir à « Texte » sont masqués depuis UI-6.
- **Situation déclenchante** : Retirer un média, publier une photo/vidéo puis vouloir publier un texte, ou passer par « Audio / podcast ».
- **Conséquence pour l'utilisateur** : La publication suivante est bloquée sans issue visible jusqu'au rechargement ; la personne croit que la photo est obligatoire.
- **Proposition** : Recalculer le type au moment de publier d'après le média réellement attaché (photo si photoDataUrl, vidéo si videoDataUrl, audio si audioDataUrl, sinon texte), et remettre studioType à « text » au retrait d'un média, après publication et à l'ouverture par « Publication ».
- **Visuels** : [CRE-007](galerie/index.html#/surface/CRE-007), [CRE-011](galerie/index.html#/surface/CRE-011) · **Surfaces** : CRE-007, CRE-011, CRE-006, CRE-009, CRE-010
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : studioType est la source de vérité de publishPost (piège UI-6) : ne jamais publier un texte avec un média perdu. Verrous : tests/e2e/ui-v6-composer.spec.js, studio-moods.spec.js.
- **Critère d'acceptation** : Ajouter puis retirer une photo, écrire 10 caractères, Publier → publication de type texte ; idem après une photo publiée et après Créer → Audio → Créer → Publication.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/ui-v2-shell.js`

### BOB-C01 — Au clavier, chaque espace d'un commentaire de bobine fait passer à la bobine suivante

- **Emplacement** : Lecteur › panneau Commentaires — écouteur keydown du document (js/app-06-reels-partage.js:1012-1024)
- **Domaine** : Bobines et stories · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Frappe réelle de « Bonjour à tous » : le champ contient « Bonjouràtous », le compteur passe de 1 / 27 à 2 / 27 (sonde bobines-02, capture BOB-022).
- **Problème** : Les espaces disparaissent du texte et la bobine change sous le panneau, qui garde les commentaires de la précédente.
- **Situation déclenchante** : Écrire un commentaire avec un clavier physique (ordinateur, tablette) ; très probablement aussi sur iPhone, dont le clavier émet la touche « » (hypothèse à vérifier sur appareil).
- **Conséquence pour l'utilisateur** : Commentaire illisible, publié sous une bobine qui n'est plus celle à l'écran ; Flèches haut/bas changent aussi de bobine.
- **Proposition** : Dans l'écouteur, ne rien faire si la cible est un champ (INPUT, TEXTAREA, contenteditable) ou si le panneau de commentaires est ouvert.
- **Visuels** : [BOB-022](galerie/index.html#/surface/BOB-022) · **Surfaces** : BOB-022
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Navigation clavier du lecteur (Espace, flèches) à revérifier hors champ.
- **Critère d'acceptation** : Taper « Bonjour à tous » dans #reelCommentInput donne exactement ce texte et #reelsCounter ne change pas.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### BOB-C02 — Une bobine photo s'ouvre sans sa photo

- **Emplacement** : Lecteur — reelMediaHTML (js/app-05-config-profil.js:3002-3008)
- **Domaine** : Bobines et stories · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Bobine dont media_url est une photo : la vignette du rail l'affiche (BOB-002), le lecteur montre un dégradé violet et seulement le texte superposé (BOB-013). Le code lit photo / coverPhotoUrl / cover ; la bobine créée (app-08:1684) et relue (app-08:4985) porte `image`.
- **Problème** : Le contenu publié est invisible dans le lecteur.
- **Situation déclenchante** : Toute bobine publiée à partir d'une photo, pour tout le monde, y compris son auteur.
- **Conséquence pour l'utilisateur** : L'auteur croit sa bobine ratée ; les autres voient un écran vide.
- **Proposition** : Ajouter `post.image` en tête des sources de reelMediaHTML (via passioThumb).
- **Visuels** : [BOB-013](galerie/index.html#/surface/BOB-013) · **Surfaces** : BOB-013
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Bobines vidéo dont `image` porte la couverture : ne pas l'utiliser quand `type === 'video'`.
- **Critère d'acceptation** : Une bobine photo ouverte dans #reelsViewer affiche une <img class=reel-media> dont la source est sa photo.
- **Fichiers probables** : `js/app-05-config-profil.js`

### BOB-C03 — Les deux sorties vers le réel sont hors de l'écran

- **Emplacement** : Lecteur — rangée .v5-actions (js/ui-v5-bobines.js:241-293 ; styles.css:9136-9147)
- **Domaine** : Bobines et stories · **Nature** : friction · **Type** : observation
- **Preuve** : À 390 px, .reel-info finit à x = 296 ; « À vivre près de moi » commence à x = 295 et « Proposer une sortie » à x = 452 (sonde bobines-04). Rangée en défilement horizontal sans barre ni indice.
- **Problème** : On ne voit que « Ça m'intéresse » et « Découvrir Musique » ; les portes vers les activités et la sortie sont cachées.
- **Situation déclenchante** : Toute bobine non reliée à une activité, sur mobile.
- **Conséquence pour l'utilisateur** : La boucle Découvrir → Rencontrer que le lot UI-5 veut ouvrir reste invisible ; un glisser horizontal dans un lecteur vertical ne se devine pas.
- **Proposition** : Grille 2 × 2 dans la zone texte (cibles 44 px maintenues), les deux sorties IRL bordées de corail.
- **Visuels** : [BOB-010](galerie/index.html#/surface/BOB-010) · **Surfaces** : BOB-010, BOB-013, BOB-015
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Hauteur de .reel-info : vérifier le dégagement de .reels-nav.next et des légendes longues.
- **Critère d'acceptation** : À 360 et 390 px, les quatre .v5-chip sont entièrement dans la fenêtre sans défilement horizontal.
- **Fichiers probables** : `styles.css`

### BOB-C04 — Aucune bobine ne peut être signalée ni supprimée depuis le lecteur  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Lecteur — rail .reel-actions (js/app-05-config-profil.js:3053-3072)
- **Domaine** : Bobines et stories · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Rail : Aimer, Commentaire, Partager ; aucun « ⋯ ». La story a un « Signaler » (app-08:1925-1935) ; la bobine, format le plus viral, non.
- **Problème** : Un contenu choquant vu en plein écran ne peut pas être signalé là où on le voit ; l'auteur ne peut pas retirer sa bobine depuis le lecteur.
- **Situation déclenchante** : Bobine d'un autre compte ou bobine à soi.
- **Conséquence pour l'utilisateur** : Modération affaiblie sur le format le plus exposé ; frustration de l'auteur.
- **Proposition** : Ajouter « Plus » au rail : Signaler (reportPost existant) pour autrui, Supprimer (suppression existante des publications) pour sa bobine.
- **Visuels** : [BOB-010](galerie/index.html#/surface/BOB-010) · **Surfaces** : BOB-010, BOB-015
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Flux de signalement et de suppression existants des publications.
- **Risque de régression** : Fermer le lecteur avant d'ouvrir une feuille (règle UI-5) ou utiliser la couche modale (10001).
- **Critère d'acceptation** : Chaque .reel-item porte un bouton « Plus » ouvrant Signaler (autrui) ou Supprimer (auteur).
- **Fichiers probables** : `js/app-05-config-profil.js`

### IRL-C01 — Les exemples « participation désactivée » portent un « Je viens » corail plein et actif

- **Emplacement** : Rencontrer › carte d'activité — .v4a2-go (js/ui-v4a2-cartes.js:627, styles.css:8983) ; bulle de carte app-07:1800
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : IRL-002 : la ligne dit « Exemple PASSIO · participation désactivée » ; le bouton « Je viens » (80 × 44 px, fond #C13D28, texte blanc, non désactivé) est identique à celui d'une vraie activité. Toucher → toast « Cette activité est un exemple : elle n'accueille pas de vraie participation. » (IRL-003). En démo, 12 cartes sur 12 de la première page sont des exemples ; en compte sans activité réelle, 35 sur 35 (IRL-055).
- **Problème** : L'action principale de l'écran, en corail (couleur du passage au réel), est proposée sur un contenu qui la refuse.
- **Situation déclenchante** : Toute personne qui découvre Rencontrer avant que des activités réelles existent autour d'elle — c'est-à-dire la majorité aujourd'hui.
- **Conséquence pour l'utilisateur** : Premier geste IRL raté et sanctionné par un refus ; le corail perd sa valeur de signal ; la personne apprend que « Je viens » peut ne rien faire.
- **Proposition** : Sur un exemple, remplacer le bouton par la pastille d'état existante (.v4a2-etat, comme « Annulé » / « Tu organises ») avec le mot « Exemple » ; ligne « Activité d'exemple · pas d'inscription » ; « Détails » reste la seule action. Même règle dans la bulle de la carte.
- **Visuels** : [IRL-002](galerie/index.html#/surface/IRL-002), [IRL-003](galerie/index.html#/surface/IRL-003) · **Surfaces** : IRL-001, IRL-002, IRL-003, IRL-031, IRL-055, IRL-063
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PassioFirstRun.masquerChiffresDemo / evenementDemo (first-run.js:735, 2509) déjà disponibles.
- **Risque de régression** : Verrous e2e du lot UI-4A2 et de first-run qui cliquent « Je viens » sur e1 (refus) : à adapter.
- **Critère d'acceptation** : Sur une carte dont l'id correspond à /^e\d+$/, aucun bouton .v4a2-go n'est rendu ; une pastille « Exemple » non cliquable est présente ; la bulle de carte d'un exemple n'a pas de distance.
- **Fichiers probables** : `js/ui-v4a2-cartes.js`, `js/app-07-ia-explore-irl.js`

### IRL-C02 — Sans position, les distances sont calculées depuis Paris et affichées comme réelles  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Carte d'activité › ligne lieu — ligneOu (js/ui-v4a2-cartes.js:332-356) ; repli _irlReferenceLoc (app-07:2495-2499) ; bulle de carte app-07:1799
- **Domaine** : Rencontres IRL · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Compte connecté, aucune position (état par défaut : l'écran ne la demande jamais seul, first-run.js:2392 et ui-v4a0-tete.js:377 ; 0 appel à getCurrentPosition mesuré par la sonde irl-decouvrir-05) : « Lyon · environ 391 km », « Grenoble · environ 481 km », « Paris · environ 0 m » (IRL-010, IRL-011). Avec position Lyon accordée : « Lyon · environ 2,6 km » (IRL-050). En démo, la liste masque la distance des exemples mais la bulle de carte affiche « 57 km » (IRL-031).
- **Problème** : Une distance précise (« environ 0 m ») est affirmée à partir d'un point par défaut que la personne n'a jamais choisi.
- **Situation déclenchante** : Toute personne qui n'a pas fait le geste « Utiliser ma position » ou choisi une ville — c'est l'état par défaut.
- **Conséquence pour l'utilisateur** : Une Lyonnaise lit que l'atelier du parc de la Tête d'Or est à 391 km ; un non-Parisien croit des activités parisiennes « à 0 m ». La confiance dans toutes les distances s'effondre.
- **Proposition** : N'afficher une distance que si une référence réelle existe (position obtenue ou ville choisie). Sinon : la ville seule, et une ligne-bouton « Choisis ta ville pour voir les distances » au-dessus de la liste qui ouvre le sélecteur existant. Même garde dans la bulle de la carte.
- **Visuels** : [IRL-010](galerie/index.html#/surface/IRL-010), [IRL-011](galerie/index.html#/surface/IRL-011) · **Surfaces** : IRL-007, IRL-010, IRL-011, IRL-017, IRL-030, IRL-031
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Tri « le plus proche » (irlSort near, sans interface) et filtre distance utilisent la même référence : voir IRL-C04.
- **Critère d'acceptation** : Avec irlUserLocation nul et irlSelectedCity nul, aucune carte ni bulle ne contient « km » ou « m » ; après « Utiliser ma position », les distances apparaissent.
- **Fichiers probables** : `js/ui-v4a2-cartes.js`, `js/app-07-ia-explore-irl.js`

### IRL-C07 — Les filtres actifs sont invisibles hors de la vue Filtre, et ils survivent à la navigation

- **Emplacement** : Commutateur › onglet « Filtre » — pastille #irlToolsBadge masquée (styles.css:11670)
- **Domaine** : Rencontres IRL · **Nature** : friction · **Type** : observation
- **Preuve** : IRL-044 : 3 filtres actifs, vue Liste « Rien avec ces filtres », l'onglet « Filtre » ne porte aucune marque (la pastille est alimentée mais masquée par CSS). IRL-045 : après Découvrir → Rencontrer, même état.
- **Problème** : La liste est amputée sans signal ; la seule trace est l'état vide quand il n'y a plus rien.
- **Situation déclenchante** : Poser un filtre, revenir à la Liste ou quitter l'écran.
- **Conséquence pour l'utilisateur** : On croit qu'il n'y a pas d'activité ; une liste partiellement filtrée passe pour complète.
- **Proposition** : Réafficher la pastille de compte existante (#irlToolsBadge) sur l'onglet « Filtre » : un nombre violet, comme ailleurs dans l'app.
- **Visuels** : [IRL-044](galerie/index.html#/surface/IRL-044) · **Surfaces** : IRL-044, IRL-045
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Maquette du 2026-09-04 (« trois cases d'un mot ») à rediscuter avec Benjamin.
- **Critère d'acceptation** : Avec n > 0 filtres actifs, l'onglet « Filtre » affiche n de façon visible et annoncée (aria-label « Filtre, 3 actifs »).
- **Fichiers probables** : `styles.css`, `js/ui-v4a5-filtres.js`

### IRL-C50 — Après « Je participe », un second appui au même endroit désinscrit

- **Emplacement** : Fiche › pied fixe `#eventDetailCta .v4b-rsvp` — js/ui-v4b-fiche.js:601-640, styles.css:8628-8672
- **Domaine** : Rencontres IRL · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Mesuré à m390 : 400 ms après l'appui en (195, 800), `elementFromPoint` = `.v4b-rsvp-retirer` (« Retirer ma participation »). Second appui 0,5 s plus tard : requêtes PATCH, POST puis DELETE sur `event_attendees`, toast « Désinscrit », pied revenu à « Je participe » (IRL-111). Vu une fois avec un double-clic : l'écran disait « désinscrit » alors que la ligne serveur restait « going » (non reproduit).
- **Problème** : Le bouton plein disparaît et le lien de retrait vient se placer exactement là où le doigt vient de toucher ; aucune confirmation ni annulation.
- **Situation déclenchante** : Double appui, appui impatient quand rien ne semble se passer, doigt qui rebondit.
- **Conséquence pour l'utilisateur** : La personne se croit inscrite ou ne comprend pas ce qui s'est passé ; une place est perdue ou rendue sans le vouloir, l'organisateur reçoit des allers-retours.
- **Proposition** : Ne jamais mettre le retrait dans la zone du bouton principal : après l'inscription, la zone du bouton porte l'étape suivante (« Écrire aux participants ») et « Je ne peux plus venir » passe sous les actions, à l'écart ; ajouter un « Annuler » de quelques secondes au retrait plutôt qu'un dialogue.
- **Visuels** : [IRL-110](galerie/index.html#/surface/IRL-110), [IRL-111](galerie/index.html#/surface/IRL-111) · **Surfaces** : IRL-110, IRL-111, IRL-113
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune ; à faire avec IRL-C52 (même pied).
- **Risque de régression** : Verrous e2e de UI-4B qui cherchent `[data-v4b-rsvp-remove]` et l'ordre des enfants du pied (tests/e2e/ui-v4b-*.spec.js).
- **Critère d'acceptation** : À 360 et 390 px, juste après « Je participe », l'élément au centre de l'ancien bouton n'est pas `[data-v4b-rsvp-remove]` ; deux appuis à 300 ms laissent la personne inscrite.
- **Fichiers probables** : `js/ui-v4b-fiche.js`, `styles.css`

### IRL-C51 — « Discussion des participants » répond « indisponible hors connexion » alors qu'on est en ligne  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Fiche › bouton « Discussion des participants » — js/app-07-ia-explore-irl.js:3845-3851 (`_joinEventConversation` : seul un gestionnaire crée la discussion), 3899-3910 (`openEventChat`)
- **Domaine** : Rencontres IRL · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Capture IRL-112 : inscrit·e, en ligne, conv_id nul ; toasts « Ouverture de la discussion… » puis « Discussion indisponible hors connexion ». D'après le code, la discussion n'existe qu'une fois qu'un gestionnaire l'a ouverte lui-même (l'organisateur entre dans `attendees` par `supaJoinEvent`, pas par `setEventRsvp`).
- **Problème** : Tant que l'organisateur n'a pas ouvert la discussion, aucun participant ne peut y entrer, et le message accuse le réseau.
- **Situation déclenchante** : Toute activité dont l'organisateur n'a jamais touché « Discussion des participants ».
- **Conséquence pour l'utilisateur** : Le lien entre inscrits — l'étape qui fait réellement venir — est coupé ; la personne croit à une panne et ne revient pas.
- **Proposition** : Créer la discussion à la publication de l'activité (ou à la première inscription, côté serveur, sous la même règle `can_join_event_conversation`) ; à défaut, message exact : « La discussion n'est pas encore ouverte par l'organisateur·ice ».
- **Visuels** : [IRL-112](galerie/index.html#/surface/IRL-112) · **Surfaces** : IRL-112, IRL-102
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Policy `can_join_event_conversation` et RPC de création de conversation d'activité (app-08 `supaCreateEventConversation` ~9119).
- **Risque de régression** : Création de conversations en double si plusieurs clients la créent ; garder un seul créateur (serveur).
- **Critère d'acceptation** : Sur une activité neuve, la première personne inscrite ouvre la discussion du groupe en un appui ; le texte « hors connexion » n'apparaît que hors connexion.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `js/app-08-ui-modals-tour.js`

### IRL-C65 — Les messages émis pendant une fenêtre ouverte sont cachés dessous (validation de « Créer une activité » invisible)

- **Emplacement** : Pile `#toastStack` z-index 200 vs `#modalBackdrop` z-index 10001 ; validations en toast `submitEvent` app-07:6994-7025 ; `submitCheckinCode` 8114-8149 ; `submitEventFeedback` 7685
- **Domaine** : Rencontres IRL · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde irl-fiche-06 : « Publier l'activité » sans titre émet « Titre trop court (3 caractères min) » ; au centre du toast, `elementFromPoint` = `#evDate` (la fenêtre) ; z-index pile 200, fenêtre 10001 ; focus non déplacé. Capture IRL-163 : rien de visible.
- **Problème** : Appuyer sur « Publier » sans titre, ville ou date ne produit rien de visible ; de même « Code incorrect », « Choisis une note d'abord », « Invitation envoyée », « Co-organisateur ajouté ».
- **Situation déclenchante** : Toute erreur ou confirmation dite par toast pendant qu'une fenêtre est ouverte.
- **Conséquence pour l'utilisateur** : On croit le bouton cassé et on abandonne la création d'activité — le geste le plus précieux du réseau.
- **Proposition** : Erreurs de formulaire sous le champ concerné avec focus dessus (et `aria-invalid`) ; plus généralement, pile des toasts au-dessus des fenêtres (z-index supérieur à `#modalBackdrop`).
- **Visuels** : [IRL-163](galerie/index.html#/surface/IRL-163) · **Surfaces** : IRL-163, IRL-142, IRL-144, IRL-147, IRL-148
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Transverse : vérifier l'ordre d'empilement avec le domaine transverse.
- **Risque de régression** : Toasts au-dessus d'une fenêtre : vérifier qu'ils ne masquent pas son bouton principal.
- **Critère d'acceptation** : Dans « Créer une activité », « Publier » sans titre montre un message lisible et place le focus sur « Titre ».
- **Fichiers probables** : `styles.css`, `js/app-07-ia-explore-irl.js`, `js/ui-v6a0-activite.js`

### MSG-C01 — Épingle, archive, sourdine, fond, brouillon et description s'effacent à chaque démarrage  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Démarrage › _rafraichirConversationsServeur (js/app-08-ui-modals-tour.js:7059–7094), appelé sans fusion par supaInit (js/app-08-ui-modals-tour.js:9837)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 07 : six réglages posés par de vrais gestes, présents en mémoire et dans localStorage ; après rechargement de la page, tous sont absents (épinglée false, archivée false, sourdine false, fond null, brouillon null, description null) et la conversation archivée est revenue dans la liste.
- **Problème** : Ce qu'on règle sur une conversation ne tient que jusqu'à la prochaine ouverture de l'application.
- **Situation déclenchante** : Tout compte réel dont la conversation existe côté serveur, à chaque démarrage à froid.
- **Conséquence pour l'utilisateur** : Une conversation archivée revient, une épinglée redescend, un brouillon disparaît : les fonctions paraissent ne pas marcher et la confiance dans les réglages tombe.
- **Proposition** : Au démarrage, fusionner comme au réveil du socket : reporter sur la copie serveur les champs locaux (pinned, archived, _muted, bg, draft, groupDesc, groupPhoto, groupPassions). À terme, porter épingle, archive et sourdine par compte côté serveur pour qu'elles suivent d'un appareil à l'autre.
- **Visuels** : [MSG-021](galerie/index.html#/surface/MSG-021), [MSG-030](galerie/index.html#/surface/MSG-030) · **Surfaces** : MSG-071, MSG-021, MSG-030, MSG-073
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : moyen
- **Dépendances** : Aucune pour la fusion locale ; une table par membre pour la version multi-appareils.
- **Risque de régression** : La fusion de démarrage remplace aujourd'hui les messages par le dernier seul : ne reporter que la liste fermée de champs. Verrous : controle-general-2026-11-10.spec.js, audit-2026-11-parcours-social-session.spec.js.
- **Critère d'acceptation** : Épingler A, archiver B, couper C, écrire un brouillon dans D, recharger : A est en tête avec son repère, B est sous « Archivées », C garde son état, D affiche « Brouillon : … ».
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`, `js/app-04-comments-shop.js`, `js/app-09-boot-pwa.js`

### MSG-C02 — « Couper les notifications » ne coupe rien  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Paramètres › Couper les notifications — _toggleMuteConv (js/app-09-boot-pwa.js:1715–1723) ; réception : _handleIncomingConvMessage (js/app-08-ui-modals-tour.js:7514–7538)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : `_muted` n'est écrit et lu que dans le panneau (recherche dans tout js/ : 4 occurrences, toutes dans app-09). Sonde 08 : sourdine posée par geste réel sur une conversation, puis message entrant simulé → son joué (1), notification ajoutée à la cloche (« Tom Girard t'a envoyé un message »), onglet 8 → 9, titre « (10) PASSIO ».
- **Problème** : Le réglage change de libellé et affiche « Notifications coupées », mais son, cloche, badge et push continuent.
- **Situation déclenchante** : Dès qu'un message arrive dans une conversation mise en sourdine.
- **Conséquence pour l'utilisateur** : La personne croit s'être mise au calme (groupe bavard, personne insistante) et continue d'être sollicitée : promesse non tenue sur un réglage de tranquillité.
- **Proposition** : Faire lire `_muted` par la réception : ni son, ni notification de cloche, ni unité au badge d'onglet et d'application (la ligne garde son point non lu). Côté expéditeur, ne pas pousser vers un membre qui a coupé (réglage à porter côté serveur). Montrer la sourdine sur la ligne de liste.
- **Visuels** : [MSG-001](galerie/index.html#/surface/MSG-001), [MSG-021](galerie/index.html#/surface/MSG-021) · **Surfaces** : MSG-072, MSG-021, MSG-001
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : MSG-C01 (sinon la sourdine se perd au démarrage) ; table de préférences par membre pour le push.
- **Risque de régression** : Ne pas toucher au compteur `unread` de la conversation. Verrous : notifications-exemples.spec.js, suites de messagerie.
- **Critère d'acceptation** : Conversation en sourdine + message entrant : aucun son, aucune notification de cloche, badge d'onglet inchangé, point non lu présent sur la ligne, cloche barrée visible sur la ligne.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`, `js/app-09-boot-pwa.js`, `js/app-04-comments-shop.js`, `supabase/functions/notify-call`

### MSG-C03 — « Nouveau message » propose des personnages d'exemple sans le dire — cinq « Passionné » pour un compte neuf

- **Emplacement** : Nouveau message › suggestions et résultats — _nmDoSearch (js/app-04-comments-shop.js:4033–4086)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 06b, compte connecté sans conversation : les dix suggestions sont des personnages d'exemple (`u_…`), dont les cinq premiers s'appellent tous « Passionné ». Recherche « m » : dix personnages d'exemple d'abord, les vraies personnes ensuite, sous le pli. Toucher « Tom Larivière » (exemple) ouvre un fil « Exemple PASSIO · réponse désactivée » ; l'envoi répond « Conversation de démonstration ».
- **Problème** : Au moment d'écrire à quelqu'un, la liste montre des personnes fictives, non signalées, auxquelles on ne peut pas écrire.
- **Situation déclenchante** : Compte connecté ; pire pour un compte neuf, dont c'est le premier message.
- **Conséquence pour l'utilisateur** : Le premier geste social échoue ou paraît absurde (cinq « Passionné ») ; les vraies personnes sont enfouies sous le décor.
- **Proposition** : Pour un compte connecté : ne proposer que de vraies personnes (contacts récents, puis recherche serveur). Sans contact : une consigne, pas de faux contacts. Jamais de personnage d'exemple dans les résultats d'un compte connecté.
- **Visuels** : [MSG-007](galerie/index.html#/surface/MSG-007), [MSG-005](galerie/index.html#/surface/MSG-005), [MSG-004](galerie/index.html#/surface/MSG-004) · **Surfaces** : MSG-007, MSG-005, MSG-004
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le mode démo (sans session) s'appuie sur ces personnages : borner le filtre aux comptes connectés (`_compteAuthReel`).
- **Critère d'acceptation** : Compte connecté : aucun résultat ni suggestion dont l'identifiant commence par `u_` ; compte sans conversation : la feuille affiche une consigne et zéro ligne « Passionné ».
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C04 — « Nouveau groupe » n'invite que dix personnages d'exemple et annonce un groupe « créé »  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Nouveau groupe › Membres à inviter — openCreateGroup (js/app-05-config-profil.js:1906–1941), confirmCreateGroup (1943–1997)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 04 : la liste est `state.seed.users.slice(0, 10)` — dix personnages `u_…`, aucun champ de recherche ; au moins un membre est exigé. Groupe créé avec u_lea et u_nina : toast « Groupe créé », ligne « 👥 2 membres ». D'après le code (js/app-05-config-profil.js:2246–2249), la clé étrangère de production refuse ces identifiants : le groupe n'a alors que son créateur. L'onglet « Ajouter » liste 78 candidats, exemples en tête, sans recherche serveur.
- **Problème** : On ne peut pas créer un groupe avec de vraies personnes ; il faut cocher un personnage fictif pour passer.
- **Situation déclenchante** : Tout compte connecté qui ouvre « Nouveau groupe ».
- **Conséquence pour l'utilisateur** : Le groupe annoncé n'a personne dedans ; inviter une vraie personne jamais contactée est impossible.
- **Proposition** : Même recherche de personnes que « Nouveau message » (contacts récents puis recherche serveur), sélection multiple, zéro personnage d'exemple pour un compte connecté ; lire le verdict de chaque ajout et dire qui n'a pas pu être ajouté.
- **Visuels** : [MSG-010](galerie/index.html#/surface/MSG-010) · **Surfaces** : MSG-010, MSG-011, MSG-014
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : MSG-C03 (même composant de recherche), MSG-C06.
- **Risque de régression** : retrait-membre-groupe.spec.js distingue les membres d'exemple par leur identifiant non uuid : garder ce chemin pour les groupes déjà créés.
- **Critère d'acceptation** : Compte connecté : la liste d'invitation ne contient aucun identifiant `u_` ; une personne trouvée par recherche peut être cochée ; après création, le nombre affiché égale le nombre de lignes `conv_members`.
- **Fichiers probables** : `js/app-05-config-profil.js`, `js/app-08-ui-modals-tour.js`

### MSG-C05 — Ajouter un membre est annoncé réussi alors que le serveur a refusé  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Groupe › onglet Ajouter — addGroupMember (js/app-05-config-profil.js:2211–2230)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 04b, participante non créatrice : « + Ajouter » sur Tom Girard → toast « ✅ Tom Girard ajouté·e au groupe », message « 👋 Tom Girard a rejoint le groupe. », compteur 8 → 9 ; en base : 1 POST refusé, Tom n'est pas membre (7 lignes).
- **Problème** : L'écran affirme un ajout que le serveur n'a pas fait.
- **Situation déclenchante** : Membre non créateur qui ajoute ; créateur dont l'écriture échoue (réseau, blocage).
- **Conséquence pour l'utilisateur** : La personne « ajoutée » ne reçoit rien ; le groupe local ne correspond plus au groupe réel.
- **Proposition** : Même patron que le retrait (RV-44) : écrire, lire le verdict, puis seulement annoncer ; sans droit d'ajout, ne pas montrer l'onglet.
- **Visuels** : [MSG-015](galerie/index.html#/surface/MSG-015) · **Surfaces** : MSG-015
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Connaître le créateur (`created_by`) côté client.
- **Risque de régression** : retrait-membre-groupe.spec.js (modale rendue de nouveau après aller-retour).
- **Critère d'acceptation** : Ajout refusé par le serveur : aucun message « a rejoint », compteur inchangé, toast d'échec ; non-créateur : pas d'onglet « Ajouter ».
- **Fichiers probables** : `js/app-05-config-profil.js`, `js/app-08-ui-modals-tour.js`

### MSG-C06 — Les trois recherches distinguent « lea » de « Léa »

- **Emplacement** : Nouveau message (js/app-04-comments-shop.js:4052), recherche de la liste (js/app-04-comments-shop.js:5486–5489), Ajouter un membre (js/app-05-config-profil.js:2041–2044), supaSearchUsers (js/app-08-ui-modals-tour.js:6499–6502)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sondes 06b, 06c, 04 : « lea f » → « Aucun utilisateur trouvé », « léa f » → Léa Fontaine ; « ines » → rien, « inès » → trouvée, dans la liste comme dans l'onglet Ajouter. Côté serveur la requête est un `ilike` simple (sensible aux accents ; non mesuré sur la base réelle).
- **Problème** : Sans l'accent exact, une personne ou une conversation existante est introuvable.
- **Situation déclenchante** : Saisie rapide au clavier mobile, prénoms accentués (Léa, Inès, Anaïs, Zoé…).
- **Conséquence pour l'utilisateur** : On conclut que la personne n'est pas sur PASSIO ou que la conversation a disparu.
- **Proposition** : Normaliser les deux côtés de la comparaison locale (NFD, sans diacritiques, minuscules) ; côté serveur, colonne ou fonction de recherche sans accents.
- **Visuels** : [MSG-006](galerie/index.html#/surface/MSG-006) · **Surfaces** : MSG-006, MSG-034, MSG-014
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Extension ou colonne normalisée côté base pour la partie serveur.
- **Risque de régression** : Aucun verrou connu sur la casse des accents ; vérifier la garde d'obsolescence de _nmDoSearch.
- **Critère d'acceptation** : « lea », « LEA » et « léa » rendent la même liste dans les trois recherches.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-05-config-profil.js`, `js/app-08-ui-modals-tour.js`, `migrations/`

### MSG-C08 — La fenêtre des membres ment sur le nombre, le rôle et la présence  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Groupe › fenêtre membres — _renderGroupMembersModal (js/app-05-config-profil.js:2006–2105)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sondes 04 et 04b : en-tête « 4 membres », fenêtre « 5 membres » et « Membres (5) » (longueur + 1 alors que la liste serveur m'inclut déjà) ; « Toi — Admin · En ligne » écrit en dur, y compris quand je ne suis pas la créatrice ; « ✨ Passion » sous chaque nom et en pastille ; discussion d'activité : 7 membres en base, « Membres (8) », 6 lignes (un membre hors cache n'est pas listé) ; « Retirer » offert sur l'organisatrice.
- **Problème** : Trois nombres différents pour le même groupe, un rôle faux, une présence inventée, des membres invisibles.
- **Situation déclenchante** : Tout groupe venu du serveur.
- **Conséquence pour l'utilisateur** : On ne sait pas qui est dans le groupe ni ce qu'on a le droit d'y faire ; dans une discussion d'activité, qui lit ce que j'écris.
- **Proposition** : Un seul calcul du nombre ; rôle tiré du créateur ; retirer « En ligne » et le libellé de remplissage ; lister tous les membres (nom chargé à la demande) ; « Retirer » et « Ajouter » réservés au créateur.
- **Visuels** : [MSG-013](galerie/index.html#/surface/MSG-013) · **Surfaces** : MSG-013, MSG-015
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : `created_by` dans la conversation locale ; résolution de profils par lot.
- **Risque de régression** : retrait-membre-groupe.spec.js lit les boutons « Retirer ».
- **Critère d'acceptation** : Le nombre est identique dans la liste, l'en-tête et la fenêtre et égal au nombre de lignes affichées ; un non-créateur ne voit ni « Admin » ni « Retirer ».
- **Fichiers probables** : `js/app-05-config-profil.js`, `js/app-04-comments-shop.js`, `js/app-08-ui-modals-tour.js`

### MSG-C09 — « Retirer » un membre agit au premier toucher, sans confirmation ni retour

- **Emplacement** : Groupe › fenêtre membres › Retirer — removeGroupMember (js/app-05-config-profil.js:2381–2462)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 04 : un toucher sur « Retirer » (55 × 26 px) → ligne `conv_members` supprimée en base, toast « retiré·e du groupe » ; aucune boîte de confirmation (0 dialogue), alors que « Quitter » en demande une.
- **Problème** : Un geste destructeur pour autrui part sur une cible de 26 px, à côté du défilement.
- **Situation déclenchante** : Créateur qui fait défiler la liste des membres.
- **Conséquence pour l'utilisateur** : Membre exclu par erreur, prévenu par un message « a quitté le groupe ».
- **Proposition** : Confirmation dans une feuille de l'application (« Retirer Malik du groupe ? ») et cible de 44 px.
- **Visuels** : [MSG-013](galerie/index.html#/surface/MSG-013) · **Surfaces** : MSG-013
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C18 (feuille de confirmation commune).
- **Risque de régression** : retrait-membre-groupe.spec.js clique « Retirer » directement : adapter.
- **Critère d'acceptation** : Toucher « Retirer » ouvre une confirmation ; rien n'est écrit avant « Confirmer » ; le bouton mesure ≥ 44 px de haut.
- **Fichiers probables** : `js/app-05-config-profil.js`, `styles.css`

### MSG-C50 — Mes vocaux, documents et positions envoyés sont illisibles : blanc sur fond lavande

- **Emplacement** : Conversation › bulles « moi » de type média — renderConvFpThread (js/app-04-comments-shop.js:6062-6097, bulle rendue transparente :6124) ; styles.css:6024 (.conv-bubble.me { color:#fff })
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures (fiche MSG-100--m390, mesures.contraste) : « Position » #ffffff sur #f7f5fc = 1,08:1 ; coordonnées 1,06:1 (seuil 4,5:1). Sonde 04 : le nom, le type et la taille de MON document sont en rgb(255,255,255) sur le même fond. Captures MSG-107 (vocal et document envoyés), MSG-171 (vocal juste enregistré).
- **Problème** : Dès que j'envoie un vocal, un document ou ma position, ma propre bulle devient un fantôme : bouton de lecture, durée, nom du fichier et coordonnées sont blancs sur le fond clair du fil. Les mêmes éléments reçus de l'autre restent lisibles.
- **Situation déclenchante** : Tout message « moi » qui n'est ni du texte ni une image : le rendu retire le fond violet de la bulle (isMedia) mais garde les couleurs prévues pour une bulle violette (blanc translucide).
- **Conséquence pour l'utilisateur** : Je ne peux pas vérifier ce que je viens d'envoyer ni réécouter mon vocal sans chercher le bouton à l'aveugle ; une personne malvoyante ne voit rien du tout. Le défaut touche chaque vocal envoyé, donc l'usage le plus courant après le texte.
- **Proposition** : Ne retirer le fond de la bulle que pour les médias visuels (photo, vidéo, GIF). Vocal, document, fichier audio et position gardent la bulle violette (moi) ou blanche (l'autre), avec leur marge intérieure : les couleurs en ligne existantes redeviennent correctes sans autre changement.
- **Visuels** : [MSG-107](galerie/index.html#/surface/MSG-107), [MSG-171](galerie/index.html#/surface/MSG-171), [MSG-100](galerie/index.html#/surface/MSG-100) · **Surfaces** : MSG-100, MSG-107, MSG-156, MSG-171
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le rendu des bulles est partagé par le fil, la recherche dans la conversation et les fonds personnalisés sombres (où le blanc était lisible) : vérifier les six fonds. Verrous e2e à relire : conv-ouverture-fil, message-media-echec, piece-jointe-depot-echec.
- **Critère d'acceptation** : À 390 et 360 px, sur le fond par défaut, chaque texte d'une bulle « moi » de type vocal, document, fichier audio ou position mesure ≥ 4,5:1 ; le bouton de lecture se distingue à ≥ 3:1.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `styles.css`

### MSG-C52 — À l'ouverture, le fil ne s'arrête pas sur le dernier message quand les derniers écrans contiennent des médias

- **Emplacement** : Conversation › ouverture — openConversation (js/app-04-comments-shop.js:5757-5782), _rerendreFilSansArracher (:6196-6220) ; images et vidéos rendues sans dimensions réservées (:6036, :6050, :6053)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 02 (conversation avec photo, GIF et vidéo dans le dernier écran, 390×844) : reste sous le bas = 0 px à 60 ms, puis 360 px de 200 ms à 3 000 ms (hauteur du fil passée de 2 915 à 3 275 px) ; le dernier message est à y = 1 033–1 121 pour un fil qui finit à 783 : invisible. `_auBas` reste vrai, rien ne recale. Capture MSG-103 (prise 1,8 s après le toucher). Conversation de texte seul : 0 px (sonde 06).
- **Problème** : J'ouvre une conversation et j'arrive au milieu : les derniers messages sont sous le pli, il faut faire défiler pour lire la réponse qu'on vient de recevoir.
- **Situation déclenchante** : Le fil est calé en bas avant que les images, GIF et vidéos des derniers écrans aient leur hauteur (aucune dimension réservée, chargement paresseux). Le recalage de 320 ms ne joue que si l'écart est < 80 px ; il n'y en a pas d'autre. En production les pièces jointes passent en plus par une URL signée : l'écart survient plus tard encore.
- **Conséquence pour l'utilisateur** : Le message le plus récent — celui pour lequel on ouvre la conversation — n'est pas visible ; la personne peut croire qu'il n'y a rien de nouveau. Les bulles bougent aussi sous le doigt pendant le chargement (un appui long de banc tombait à côté).
- **Proposition** : Réserver la place des médias (boîte de 200 px à ratio fixe, comme les vignettes du fil d'actualité) et recaler le bas à chaque `load` d'un média tant que la personne n'a pas remonté le fil (`_auBas`).
- **Visuels** : [MSG-103](galerie/index.html#/surface/MSG-103) · **Surfaces** : MSG-103, MSG-111
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Ne jamais recaler quelqu'un qui relit l'historique (`_auBas === false`, règle du 2026-10-18). Verrous : conv-ouverture-fil.spec.js, conv-clavier-ouverture.spec.js.
- **Critère d'acceptation** : Conversation dont les 3 derniers messages sont une photo, un GIF et une vidéo : 2 s après l'ouverture, scrollHeight − scrollTop − clientHeight ≤ 1 px et la dernière bulle est entièrement dans le fil, à 390 et 360 px.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `styles.css`

### MSG-C54 — Annuler un vocal demande un second doigt ; glisser hors du bouton puis relâcher l'envoie

- **Emplacement** : Conversation › enregistrement vocal — index.html:1424-1429 (barre, ✕) et :1466-1472 (ontouchend → stopVoiceRecord) ; js/app-09-boot-pwa.js:2053-2065 ; styles.css:6063 (.record-active jamais posée), :6270
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 05 (simulé) : doigt maintenu, glissé de 180 px hors du bouton, relâché → vocal envoyé. Le ✕ de la barre mesure 18 × 30 px, sans nom accessible, et n'est atteignable qu'en gardant le premier doigt sur le micro. La barre dit seulement « Enregistrement en cours… » ; le bouton micro garde la classe « conv-tool-btn » (aucun état visuel). Capture MSG-170.
- **Problème** : Pendant que je maintiens le micro, rien ne dit que relâcher envoie, et le seul moyen d'annuler est une croix minuscule à toucher de l'autre main. Le geste appris ailleurs (glisser pour annuler) envoie le message.
- **Situation déclenchante** : Vouloir abandonner un vocal commencé (bruit, erreur, changement d'avis).
- **Conséquence pour l'utilisateur** : Des vocaux ratés partent quand même ; il faut ensuite « supprimer pour tous ». Friction sur la fonction que le produit met en avant pour se parler avant de se voir.
- **Proposition** : Pendant l'appui : la barre de saisie devient la barre d'enregistrement (« ● 0:07 — relâche pour envoyer · glisse vers la gauche pour annuler »), le micro passe en état actif (.record-active). Glisser de plus de 80 px vers la gauche puis relâcher annule (la barre l'annonce : « Relâche pour annuler »). Le ✕ devient un bouton « Annuler » de 44 px.
- **Visuels** : [MSG-170](galerie/index.html#/surface/MSG-170) · **Surfaces** : MSG-170, MSG-173, MSG-174
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : MSG-C53 (même gestionnaire d'appui).
- **Risque de régression** : Gestes tactiles : ne pas bloquer le défilement du fil ; touchcancel doit toujours annuler. Tester Android Chrome et iOS Safari (appareils réels).
- **Critère d'acceptation** : Maintien 2 s, glissement de 120 px vers la gauche, relâchement : aucun message créé. Maintien 2 s, relâchement sur place : un vocal envoyé. Pendant l'appui, un texte visible décrit les deux issues ; le bouton d'annulation mesure ≥ 44 × 44 px et porte un nom accessible.
- **Fichiers probables** : `index.html`, `js/app-09-boot-pwa.js`, `styles.css`

### MSG-C55 — Un message reçu pendant qu'on relit l'historique ramène de force en bas ; aucun retour rapide aux derniers messages

- **Emplacement** : Conversation › défilement — _handleIncomingConvMessage appelle renderConvFpThread (js/app-08-ui-modals-tour.js:7511), qui recale toujours le bas (js/app-04-comments-shop.js:6165) ; aucun bouton de retour en bas dans #conv-fullpage
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 06 (230 messages ; arrivée simulée par le point d'entrée du canal temps réel, coupé dans le banc) : en lecture au message n° 116 (10 407 px au-dessus du bas), un message entrant → premier message visible n° 224, reste 0 px. Aucun indicateur « nouveau message ». Remonté de 2 680 px : aucun bouton pour revenir en bas (recherche dans le DOM). Captures MSG-183, MSG-184.
- **Problème** : Je relis un ancien message (une adresse, une heure de rendez-vous) ; l'autre écrit : l'écran saute tout en bas et je perds l'endroit. À l'inverse, remonté loin dans une longue conversation, je dois tout redescendre au doigt.
- **Situation déclenchante** : Message entrant alors que le fil n'est pas en bas ; ou simple remontée dans une conversation longue (la relecture serveur, elle, préserve déjà la position : _rerendreFilSansArracher).
- **Conséquence pour l'utilisateur** : Perte du point de lecture au moment où l'on cherche une information pratique ; redescente fastidieuse (jusqu'à 19 000 px pour 230 messages).
- **Proposition** : À la réception, utiliser le rendu qui conserve la position quand `_auBas` est faux, et afficher une pastille « 1 nouveau message ↓ ». Dès que le fil est remonté de plus d'un écran, afficher un bouton rond « ↓ » (44 px) au-dessus de la barre de saisie ; il ramène au dernier message et porte le nombre de nouveaux.
- **Visuels** : [MSG-183](galerie/index.html#/surface/MSG-183), [MSG-184](galerie/index.html#/surface/MSG-184) · **Surfaces** : MSG-183, MSG-184
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : L'accusé de lecture (supaMarkRead) est posé dès la réception conversation ouverte : s'il n'est plus affiché à l'écran, décider s'il attend le retour en bas. Verrous : conv-ouverture-fil.spec.js (position), notification-message.spec.js.
- **Critère d'acceptation** : Fil remonté de 2 écrans, un message entrant : le premier message visible ne change pas, une pastille annonce le nouveau message ; un toucher sur le bouton ↓ met la dernière bulle dans le fil. Fil en bas : le message entrant est visible sans geste (comportement actuel conservé).
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`, `js/app-04-comments-shop.js`, `styles.css`

### MSG-C56 — Ma position précise part en un seul toucher, sans aperçu, sans confirmation  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Conversation › menu « + » › Localisation — shareLocation (js/app-09-boot-pwa.js:1482-1558) : getCurrentPosition puis insertion immédiate, coordonnées à 5 décimales
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 04 (géolocalisation fictive accordée au contexte) : un toucher sur « Localisation » → toast « 📍 Localisation en cours… » → message « 📍 Ma position : https://maps.google.com/?q=45.74850,4.84670 » inséré localement et en base (1 ligne), aucune étape intermédiaire, aucun statut d'envoi. Capture MSG-157.
- **Problème** : Une fois la permission du navigateur accordée (une fois pour toutes), l'entrée « Localisation » du menu envoie mes coordonnées exactes — au mètre près — à l'interlocuteur, sans me montrer ce qui part ni me laisser confirmer. L'entrée voisine du menu est à 60 px.
- **Situation déclenchante** : Toucher « Localisation » dans le menu « + », volontairement ou par erreur (voisine de « Fichier audio » et de « Pièces jointes »).
- **Conséquence pour l'utilisateur** : Divulgation accidentelle de l'endroit où je me trouve (souvent mon domicile) à une personne rencontrée en ligne : c'est l'information la plus sensible de l'application, sur le parcours « Rencontrer ».
- **Proposition** : Après la mesure, ouvrir une feuille de confirmation : « Envoyer ta position actuelle à Léa ? » avec le point sur une mini-carte ou l'adresse approchée, « Envoyer » / « Annuler ». Donner au message le même statut d'envoi que les autres. Garder le lien vers la carte externe.
- **Visuels** : [MSG-157](galerie/index.html#/surface/MSG-157) · **Surfaces** : MSG-157, MSG-150
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : MSG-C57 (statut d'envoi de la position).
- **Risque de régression** : Aucune nouvelle collecte : la position n'est lue qu'au geste, jamais stockée ailleurs que dans le message. Verrou existant : irl-trust-safety.spec.js (la position de l'appareil ne part jamais dans un événement) — sans rapport direct, à ne pas affaiblir.
- **Critère d'acceptation** : Toucher « Localisation » ne crée aucun message tant que « Envoyer » n'a pas été touché dans la feuille ; « Annuler » ou Retour n'envoie rien ; la feuille nomme le destinataire.
- **Fichiers probables** : `js/app-09-boot-pwa.js`

### MSG-C57 — Un GIF ou une position dont l'envoi échoue reste affiché comme envoyé

- **Emplacement** : Conversation › envoi d'un GIF et d'une position — _sendGif (js/app-09-boot-pwa.js:612-706) et shareLocation (:1522-1540) : aucun statut posé sur la bulle, refus seulement journalisé (_diag) ou avalé (.catch vide)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 04 : après l'envoi, le message GIF et le message de position ont `status` = null (ni 🕓, ni « réessayer » possibles). Sonde 08 (serveur en erreur 500 programmée) : le GIF puis la position restent dans le fil avec « 18:48 ✓ », 0 ligne en base, 0 entrée en file, aucun toast (capture MSG-163). D'après le code, texte, photo, document et vocal ont, eux, un verdict, une file et un « réessayer » (lots du 2026-09-09 et du 2026-11-07).
- **Problème** : Hors ligne ou si le serveur refuse, mon GIF (ou ma position) reste dans le fil sans aucune marque : je le crois reçu, l'autre ne l'a jamais. Il disparaît à la prochaine relecture du fil.
- **Situation déclenchante** : Envoi d'un GIF ou d'une position pendant une coupure réseau, une panne ou un refus du serveur (blocage, session expirée).
- **Conséquence pour l'utilisateur** : Un message annoncé envoyé qui n'existe pas : exactement le défaut que le produit a fermé pour le texte et les pièces jointes. Pour une position de rendez-vous, l'autre attend une information qui n'arrivera pas.
- **Proposition** : Faire passer GIF et position par le chemin d'envoi commun (_sendTextToSupa) : statut « envoi… », échec visible, file hors ligne, « réessayer ».
- **Visuels** : [MSG-163](galerie/index.html#/surface/MSG-163) · **Surfaces** : MSG-163, MSG-154, MSG-157
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Retirer le « repli sans from_id » de ces deux chemins (la RLS le refuse de toute façon). Verrous : message-media-echec.spec.js, file-messages-par-compte.spec.js (propriétaire de la file).
- **Critère d'acceptation** : Serveur en panne (500) : un GIF et une position envoyés affichent l'état d'échec et « Réessayer » ; hors ligne, ils partent au retour du réseau ; aucun n'est affiché sans statut.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `js/app-04-comments-shop.js`

### MSG-C58 — « Supprimer pour moi » et « Supprimer pour tous » s'exécutent sans confirmation ni annulation

- **Emplacement** : Conversation › feuille d'actions d'un message — _openMsgActions (js/app-04-comments-shop.js:6360-6361), _deleteMsgForMe (:6421-6431), _deleteMsgForAll (:6435-6460)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 03 : un toucher sur « Supprimer pour moi » retire le message et affiche le toast « Message supprimé » (non cliquable, 3 s) ; un toucher sur « Supprimer pour tous » supprime la ligne en base, l'objet joint, et insère le contrôle `del` — aucune fenêtre de confirmation dans les deux cas (modaleConfirmation : false). Les deux lignes sont rouges, même icône 🗑️, 56 px l'une sous l'autre. Captures MSG-141, MSG-146.
- **Problème** : Deux actions irréversibles, visuellement jumelles, partent au premier toucher. « Pour tous » efface aussi le message chez l'autre, sans laisser de trace dans le fil ; « pour moi » fait disparaître un message reçu que je ne pourrai plus relire.
- **Situation déclenchante** : Toucher la mauvaise des deux lignes, ou relâcher le doigt sur l'une d'elles (voir MSG-C64).
- **Conséquence pour l'utilisateur** : Perte définitive d'un message (photo, vocal, information pratique) sans recours.
- **Proposition** : Une seule entrée « Supprimer… », séparée des autres actions ; elle ouvre une confirmation qui explique les deux portées (« Pour moi : il reste visible chez Léa » / « Pour tout le monde : il disparaît aussi chez Léa ») avec « Annuler ». À vérifier auprès d'utilisateurs : laisser ou non une mention « Message supprimé » dans le fil.
- **Visuels** : [MSG-141](galerie/index.html#/surface/MSG-141), [MSG-146](galerie/index.html#/surface/MSG-146) · **Surfaces** : MSG-141, MSG-146, MSG-140
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Pierres tombales (convTombAdd) et purge de la pièce jointe inchangées. Verrous : conv-suppression.spec.js, audit-2026-11-controle-auteur-messages.spec.js.
- **Critère d'acceptation** : Aucun message n'est retiré avant un second toucher explicite dans la confirmation ; « Annuler », le fond et Retour laissent le message en place ; la feuille d'actions ne montre qu'une entrée destructrice.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C60 — Le champ de saisie ne fait que 156 px sur 390 : cinq commandes permanentes l'encadrent, dont deux entrées GIF

- **Emplacement** : Conversation › barre de saisie — index.html:1432-1476 ; styles.css:6046-6085
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Mesure (sonde 02, 390 px) : + 36 px, emoji 36, champ 156 (126 px utiles, ≈ 17 caractères par ligne), GIF 36, micro 36, envoi 40. Un message de 141 caractères occupe 11 lignes pour une hauteur maximale de 5 : le champ défile à l'intérieur. Le bouton d'envoi et le micro sont toujours affichés tous les deux ; le bouton GIF ouvre un sélecteur flottant distinct de l'onglet GIF du panneau emoji. Sonde 08 : champ de 126 px (96 utiles) à 360 px et de 86 px (56 utiles, ≈ 7 caractères par ligne) à 320 px. Captures MSG-102 (390, 360, 320), MSG-121.
- **Problème** : J'écris dans une colonne de la largeur de deux mots ; au-delà de cinq lignes je ne vois plus le début de mon message. La rangée ne dit pas quelle est l'action principale : envoyer, enregistrer, ou ajouter un GIF.
- **Situation déclenchante** : Tout message de plus d'une vingtaine de caractères, sur téléphone.
- **Conséquence pour l'utilisateur** : Relecture difficile avant envoi, fautes non vues, messages longs découragés — alors que la conversation sert à organiser une rencontre (lieu, heure, matériel).
- **Proposition** : Trois zones : « + » (pièces jointes), le champ avec le bouton emoji/GIF à l'intérieur, et UN bouton rond de 44 px qui est le micro quand le champ est vide et la flèche d'envoi dès qu'il contient du texte. Le bouton GIF séparé disparaît (l'onglet GIF du panneau emoji le couvre). Champ à 390 px : ≈ 270 px.
- **Visuels** : [MSG-102](galerie/index.html#/surface/MSG-102), [MSG-121](galerie/index.html#/surface/MSG-121) · **Surfaces** : MSG-102, MSG-121, MSG-100, MSG-153, MSG-154
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : MSG-C54 (barre d'enregistrement), MSG-C70 (panneau emoji/GIF).
- **Risque de régression** : `#convFpSendBtn` et `#btnVoice` doivent rester dans le DOM (suites e2e et handlers en ligne) : on bascule leur affichage, on ne les retire pas. Verrous : conv-clavier-ouverture.spec.js, audit-2026-11-a11y.spec.js (cibles).
- **Critère d'acceptation** : À 390 px le champ mesure ≥ 250 px, à 360 px ≥ 220 px ; champ vide : micro visible, envoi masqué ; champ rempli : envoi visible, micro masqué ; chaque bouton de la barre mesure ≥ 44 × 44 px.
- **Fichiers probables** : `index.html`, `styles.css`, `js/app-04-comments-shop.js`, `js/emoji-misc.js`

### MSG-C85 — Conversation ouverte : aucun toast n'est visible — refus, erreurs et confirmations passent inaperçus

- **Emplacement** : Coque — .toast-stack en position absolue, z-index 200 (styles.css:1468-1485) ; #conv-fullpage en z-index 1200 dans la même coque (.app-shell) ; toast() (js/app-02-state-utils.js:3325)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 10 : même toast émis sur la liste des conversations puis dans une conversation, capture prise SANS figer les animations, 500 ms après l'émission (opacité mesurée : 1). Sur la liste il s'affiche au-dessus de la barre d'onglets ; dans la conversation il est absent de l'image. `document.elementFromPoint` au centre du toast rend #convFpThread (conversation) et #modalBackdrop (feuille ouverte par-dessus la conversation) : la pile des toasts (z-index 200) est sous le panneau de conversation (z-index 1200). Sonde 09 (mode démonstration) : l'appui sur Envoyer émet un toast et ne produit rien de visible. Les captures du banc figent les animations à leur fin et ne pouvaient donc pas le montrer : le défaut n'apparaît qu'avec la sonde 10.
- **Problème** : Dans une conversation, tout ce que l'application dit par toast est invisible : « Message trop long », « Impossible d'obtenir la position », « Micro non disponible », « Pièce jointe non envoyée », « Message introuvable », « Message supprimé pour tous », « Connexion rétablie — envoi des messages en attente », le refus d'écrire dans une conversation d'exemple, les fichiers trop lourds, les formats de vocal illisibles. Vu de la personne, le geste ne fait rien.
- **Situation déclenchante** : Tout appel à toast() pendant que #conv-fullpage est ouvert (et toute feuille modale ouverte par-dessus).
- **Conséquence pour l'utilisateur** : La personne répète le geste, croit l'application en panne ou abandonne ; les garde-fous déjà codés (limite de longueur, refus de permission, échec de dépôt) perdent leur effet. Dans la conversation d'exemple, l'envoi semble simplement cassé — c'est la première conversation qu'ouvre un nouveau venu.
- **Proposition** : Placer la pile des toasts au-dessus des panneaux plein écran et des feuilles (z-index supérieur à celui de #conv-fullpage et de #modalBackdrop) et, conversation ouverte, l'afficher juste sous l'en-tête (la barre de saisie grandit jusqu'à cinq lignes : un toast calé dessus la recouvrirait ; la barre d'onglets, repère actuel, est absente). Vérifier les autres panneaux plein écran (bobines, création) qui ont le même empilement.
- **Visuels** : [MSG-126](galerie/index.html#/surface/MSG-126), [MSG-158](galerie/index.html#/surface/MSG-158), [MSG-175](galerie/index.html#/surface/MSG-175) · **Surfaces** : MSG-126, MSG-158, MSG-175, MSG-146, MSG-185, MSG-206, MSG-164, MSG-125, MSG-165, MSG-177, MSG-178
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Socle (coque, z-index) — à traiter une fois pour tous les panneaux plein écran.
- **Risque de régression** : Un toast ne doit pas couvrir la barre de saisie ni le bouton d'envoi (position à recaler conversation ouverte) ; les toasts restent non interactifs (pointer-events: none). Verrous à ajouter : un test qui émet un toast conversation ouverte et vérifie par elementFromPoint qu'il est au premier plan.
- **Critère d'acceptation** : Conversation ouverte, puis feuille d'actions ouverte : un toast émis est l'élément au premier plan à son centre (elementFromPoint), entièrement visible, et ne recouvre ni le champ ni le bouton d'envoi.
- **Fichiers probables** : `styles.css`

### PAR-C02 — Après l'inscription, le contenu du lien n'est pas rouvert  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `memoriserRetour` / `apresAuthentification` (js/first-run.js:1513, :2313) ; nettoyage du hash par les routeurs (js/app-06-reels-partage.js:118, :325)
- **Domaine** : Partage · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde partage-09 : au moment de la fenêtre d'inscription, `retour = { screen: "feed", hash: "", action: "aimer" }` — l'adresse vaut `#post` (sans identifiant) parce que le routeur a nettoyé `#post-<id>` avant d'ouvrir, et `RE_LIEN_PROFOND` ne reconnaît pas `#post` ni `#reels`. Fin d'inscription simulée (crochet appelé, aucun compte créé) : retour sur le fil, toast « Tu peux aimer cette publication. », publication non affichée (capture PAR-044). Pour une activité, l'adresse mémorisée est `#event-<id>`, que le routeur `#irl-event-` ne lit pas (d'après le code, js/app-07-ia-explore-irl.js:4897).
- **Problème** : On crée un compte pour aimer une publication ou rejoindre une activité, et l'on se retrouve sur le fil général avec un message qui parle d'un contenu absent.
- **Situation déclenchante** : Inscription ou connexion commencée depuis un contenu ouvert par lien.
- **Conséquence pour l'utilisateur** : Le geste qui a motivé l'inscription est perdu ; pour une activité, la personne doit retrouver le lien pour s'inscrire.
- **Proposition** : Mémoriser la CIBLE (genre + identifiant) lue à l'écran au moment de la fenêtre, pas l'adresse ; au retour, rouvrir par `openPost` / `openEventDetails` / `openReelById` / `openUserProfile`, puis afficher le rappel sur ce contenu. Aucune action n'est rejouée.
- **Visuels** : [PAR-044](galerie/index.html#/surface/PAR-044) · **Surfaces** : PAR-044, PAR-046, PAR-048
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : PAR-C01.
- **Risque de régression** : `reprise()` après rechargement (connexion), confirmation d'e-mail ouverte dans un autre navigateur (la cible n'y existe pas) ; lien-inscription.spec.js, first-run-retour*.spec.js.
- **Critère d'acceptation** : Visiteur sur `#post-<id>` → cœur → inscription terminée : `#postDetailPage` affiche la publication `<id>` et le rappel y est visible ; idem pour une activité et une bobine.
- **Fichiers probables** : `js/first-run.js`

### PAR-C03 — Les confirmations de partage sont peintes sous les feuilles et sous le lecteur de bobines

- **Emplacement** : `.toast-stack` z-index 200 (styles.css:1484) ; `.modal-backdrop` 10001 (styles.css:1382) ; `.reels-viewer` 9999 (styles.css:4736)
- **Domaine** : Partage · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde partage-07 (images prises animations actives, `pointer-events` du toast levé pour la mesure) : toast vu sur le fil, la page d'une publication et la fiche d'activité ; NON vu sur la feuille de partage (dessus : `#_shareInFeedBtn`), la feuille d'invitation, le lecteur de bobines, la feuille de partage d'une bobine, le profil visité. Captures PAR-003, PAR-012, PAR-025, PAR-031.
- **Problème** : « Lien copié », « Lien du profil copié », « Invitation envoyée », « Ouverture whatsapp... » sont émis mais invisibles : on appuie, rien ne répond.
- **Situation déclenchante** : Tout partage par copie lancé depuis une feuille basse, le profil visité (modale plein écran) ou le lecteur de bobines — c'est-à-dire chaque fois que la feuille du téléphone manque (ordinateur, navigateur intégré d'une messagerie) ou échoue.
- **Conséquence pour l'utilisateur** : Appuis répétés (un lien suivi créé à chaque appui), doute sur la réussite, abandon du partage.
- **Proposition** : Faire passer `#toastStack` au-dessus des feuilles et du lecteur (position fixe, z-index supérieur à 10001), et confirmer dans la feuille elle-même quand elle reste ouverte.
- **Visuels** : [PAR-003](galerie/index.html#/surface/PAR-003), [PAR-012](galerie/index.html#/surface/PAR-012), [PAR-025](galerie/index.html#/surface/PAR-025), [PAR-031](galerie/index.html#/surface/PAR-031) · **Surfaces** : PAR-003, PAR-012, PAR-023, PAR-025, PAR-031, PAR-014, PAR-074
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Un toast cliquable au-dessus d'une fenêtre peut recouvrir un bouton bas ; vérifier la barre d'onglets et la zone sûre iOS.
- **Critère d'acceptation** : Feuille de partage ouverte, `toast("Lien copié")` : `elementFromPoint` au centre du toast rend le toast (mesure faite `pointer-events` levé), à 360 et 390 px ; idem lecteur de bobines ouvert.
- **Fichiers probables** : `styles.css`

### PAR-C04 — Copie refusée : une adresse brute pendant 3 s, ou rien du tout pour une bobine

- **Emplacement** : `partagerOuCopier` (js/app-02-state-utils.js:3602) ; `copyReelLink` (js/app-06-reels-partage.js:898) ; `_copyCheckinLink` (js/app-07-ia-explore-irl.js:8083)
- **Domaine** : Partage · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde partage-01, presse-papiers non autorisé : toast « Lien : http://…?inv=…&plk=…#post-pa_lea_1 », 390 × 73 px, non sélectionnable, retiré après 3 s (et sous la feuille, PAR-C03). Sonde partage-05 : `copyReelLink` lève « Write permission denied » sans `catch` — aucune réaction. Capture PAR-004.
- **Problème** : Quand le navigateur refuse la copie, il n'y a aucun moyen de récupérer le lien.
- **Situation déclenchante** : Navigateur intégré d'une application, permission de presse-papiers refusée, page hors premier plan.
- **Conséquence pour l'utilisateur** : Le partage échoue sans alternative ; pour une bobine, une erreur non gérée part en télémétrie.
- **Proposition** : Dans la feuille : champ en lecture seule contenant le lien, sélectionné, avec « Copier » ; même repli pour la bobine (`.catch`).
- **Visuels** : [PAR-004](galerie/index.html#/surface/PAR-004) · **Surfaces** : PAR-004, PAR-013, PAR-031
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PAR-C07 (feuille commune).
- **Risque de régression** : partage-bobine.spec.js, liens-partage-post-profil.spec.js ⑤.
- **Critère d'acceptation** : Presse-papiers refusé sur les quatre portes : le lien complet est lisible dans un champ ≥ 16 px tant que la feuille est ouverte, et aucune erreur JS n'est émise.
- **Fichiers probables** : `js/app-02-state-utils.js`, `js/app-06-reels-partage.js`

### PAR-C05 — Lien mort, privé ou inconnu : huit secondes de silence puis un toast de trois secondes  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `_ouvrirLienPartage`, `_openReelDeepLink` (js/app-06-reels-partage.js:265, :77) ; `_openIrlEventFromHash` (js/app-07-ia-explore-irl.js:4896) — 12 essais × 700 ms
- **Domaine** : Partage · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde partage-08, liens collés en session : publication d'un compte privé 7 950 ms, supprimée 7 864 ms, bobine inconnue 8 616 ms, activité inconnue 8 670 ms avant le toast ; pendant ce temps, aucun changement d'écran (capture PAR-049). Verdict : toast standard de 3 s (capture PAR-050).
- **Problème** : Qui ouvre un lien vers un contenu retiré voit le fil d'exemples, rien d'autre, puis un message bref qu'un regard ailleurs suffit à manquer.
- **Situation déclenchante** : Contenu supprimé, auteur passé en privé, identifiant erroné, réseau lent.
- **Conséquence pour l'utilisateur** : Le lien paraît cassé ou ignoré ; le visiteur ne sait pas ce qu'il devait voir ni quoi faire.
- **Proposition** : Dès la lecture du lien : un état d'attente discret (« Ouverture du lien… »). À l'échec : une carte d'arrivée qui reste en tête du fil, neutre sur la cause (« supprimée, ou réservée aux abonnés de son auteur »), avec une suite. Le budget d'essais ne change pas.
- **Visuels** : [PAR-050](galerie/index.html#/surface/PAR-050) · **Surfaces** : PAR-049, PAR-050, PAR-055, PAR-056, PAR-075
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Les quatre routeurs partagent leurs règles (hash conservé sur échec) : liens-partage-post-profil.spec.js ③, reel-deeplink.spec.js, irl-deeplink-etat-null.spec.js.
- **Critère d'acceptation** : Lien vers un identifiant inconnu : un indicateur est visible avant 1 s ; au verdict, un bloc non éphémère est présent en tête du fil et le même texte sert aux cas privé et supprimé.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/app-07-ia-explore-irl.js`, `styles.css`

### PAR-C06 — Le repartage d'une publication ou d'une bobine perd le média et le lien vers l'originale  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `sharePostInFeed` (js/app-03-posts-vlogs.js:49), `shareReelInFeed` (js/app-05-config-profil.js:3862) ; rendu `renderPostHTML` (js/app-02-state-utils.js:10325 ne traite que `kind === "event"`)
- **Domaine** : Partage · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde partage-02 : la carte créée contient « 📤 A partagé un post / 🎸 Léa Fontaine – Musique / "…" », `aImage: false`, aucun gestionnaire vers `pa_lea_1` ; la toucher ouvre le repartage lui-même. `shared_from_post_id` est bien écrit au serveur mais n'est lu par aucun rendu. Capture PAR-005.
- **Problème** : Les abonnés voient une citation en texte brut : pas la photo ni la vidéo, pas de chemin vers l'auteur d'origine.
- **Situation déclenchante** : « Partager dans mon feed » / « Partager dans le Feed ».
- **Conséquence pour l'utilisateur** : Le partage interne ne fait découvrir ni le contenu ni son auteur — l'inverse de sa promesse.
- **Proposition** : Rendre l'originale comme une carte citée (vignette, auteur, passion, extrait) cliquable vers elle, sur le modèle de la carte d'activité partagée ; retirer « 📤 » du texte stocké.
- **Visuels** : [PAR-005](galerie/index.html#/surface/PAR-005) · **Surfaces** : PAR-005, PAR-016
- **Priorité** : P1 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : Originale supprimée ou devenue privée après coup (afficher « publication indisponible ») ; partage-bobine.spec.js.
- **Critère d'acceptation** : Après repartage, la carte contient une zone cliquable qui ouvre la publication d'origine, et son média s'il existe.
- **Fichiers probables** : `js/app-02-state-utils.js`, `js/app-03-posts-vlogs.js`, `js/app-05-config-profil.js`

## P2 — amélioration significative du confort

### FIL-C08 — « Bloquer » agit au premier toucher, sans confirmation, depuis deux menus  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Options d'une publication d'autrui (js/app-04-comments-shop.js:41-43) et d'un commentaire (2407, 2438) → `blockUser` (5147-5160) : blocage et désabonnement immédiats
- **Domaine** : Fil et interactions · **Nature** : friction · **Type** : observation
- **Preuve** : Captures FIL-034 et FIL-060. Sonde fil-04-ecritures : un toucher sur « Bloquer ce compte » → toasts ["🚫 Utilisateur bloqué"], comptes bloqués : 1, abonnements restants : 2 (3 avant), aucune fenêtre de confirmation (modale ouverte : false). Dans le menu d'un commentaire, l'entrée ne nomme pas la personne.
- **Problème** : Une action lourde (ne plus se voir, ne plus se suivre, publications retirées du fil) part d'un toucher, à côté de « Masquer » et « Signaler ».
- **Situation déclenchante** : Toucher par erreur l'entrée rouge d'un menu « ⋯ ».
- **Conséquence pour l'utilisateur** : Blocage et désabonnement involontaires ; il faut retrouver « Comptes bloqués » dans les réglages puis se réabonner.
- **Proposition** : Demander confirmation en nommant la personne et les effets (« Vous ne verrez plus vos publications ; tu ne la suivras plus »), séparer visuellement les entrées de modération ; garder le moteur et ses garde-fous.
- **Visuels** : [FIL-034](galerie/index.html#/surface/FIL-034), [FIL-060](galerie/index.html#/surface/FIL-060) · **Surfaces** : FIL-034, FIL-060
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : stories-blocage.spec.js, reactions-commentaire-bloque.spec.js ; `blockUser` est aussi appelé depuis le profil visité (les changer ensemble).
- **Critère d'acceptation** : Depuis les deux menus, bloquer demande un second geste explicite qui nomme la personne ; annuler ne change rien.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### FIL-C10 — Le panneau de réaction sort de l'écran par le haut et demande deux touchers

- **Emplacement** : Panneau « Emoji ∣ GIF » — `emojiReactPanel` (js/app-04-comments-shop.js:3336-3470 ; position 3459-3463 sans retour dans l'écran) et `cmtComposerEmoji` (3092-3282)
- **Domaine** : Fil et interactions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Capture FIL-052 (m390) : les premières rangées d'emojis sont coupées par le haut de l'écran. À 360×640, le toucher du troisième emoji échoue dans le banc (« element is outside of the viewport », scénario detail-et-options) : il n'est pas atteignable. Emojis de 18 px dans des cases de 28 px ; onglets de 31 px. Un emoji touché n'est pas envoyé : il faut « Envoyer ✓ » (FIL-053).
- **Problème** : Réagir à une publication située en haut ou au milieu de l'écran ouvre un panneau dont le début est hors champ ; les cases sont petites ; le geste prend deux touchers.
- **Situation déclenchante** : Toucher « 😊 » sur une carte ou sur la page d'une publication quand le bouton est à moins de ~260 px du haut.
- **Conséquence pour l'utilisateur** : Emojis les plus courants (première rangée) inaccessibles sur petit écran ; réaction plus lente qu'un j'aime.
- **Proposition** : Passer le panneau par `_ramenerDansLEcran` (déjà écrit pour le panneau GIF, emoji-misc.js:200), cases de 40 px et emojis de 24 px ; un toucher sur un emoji réagit aussitôt (re-toucher le retire, comme aujourd'hui), la validation restant pour le GIF.
- **Visuels** : [FIL-052](galerie/index.html#/surface/FIL-052), [FIL-039](galerie/index.html#/surface/FIL-039) · **Surfaces** : FIL-052, FIL-053, FIL-039
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Verrous : reaction-ordre.spec.js, gif-klipy.spec.js ⑧ (position des panneaux). La validation avant envoi d'un GIF était une demande explicite : ne pas la retirer.
- **Critère d'acceptation** : À 360×640 et 390×844, quel que soit l'endroit du bouton, le panneau est entièrement dans l'écran (8 px de marge) ; chaque case mesure ≥ 40 px.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/emoji-misc.js`

### PRO-C03 — Le pseudo n'est pas validé à l'enregistrement (vide, « Admin » acceptés)  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Modifier › Pseudo — saveMainProfile (app-06:2042) ; règle nomCompteValide (app-02:6253)
- **Domaine** : Profils et passions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Pseudo vidé : « Profil mis à jour », PATCH username="" ; « Admin » : même chose (sonde profils-05). En production la contrainte profiles_username_forme refuserait — échec alors masqué par PRO-C01. « Déjà pris » passe par un toast, peint sous la modale (fait transverse PAR-C03 / IRL-C65 / MSG-C85).
- **Problème** : Aucune règle de pseudo à l'édition, alors qu'elle existe à l'inscription.
- **Situation déclenchante** : Vider ou raccourcir son pseudo, choisir un mot réservé.
- **Conséquence pour l'utilisateur** : Pseudo vide en base (banc) ou divergence silencieuse écran/serveur (production).
- **Proposition** : Appliquer nomCompteValide avant l'envoi ; erreur sous le champ (2 à 40 caractères, mots réservés, déjà pris), modale ouverte.
- **Visuels** : [PRO-013](galerie/index.html#/surface/PRO-013) · **Surfaces** : PRO-013, PRO-014
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PRO-C01.
- **Risque de régression** : Comptes existants dont le pseudo ne respecte pas la règle : ne bloquer que la saisie modifiée.
- **Critère d'acceptation** : Pseudo vide, d'un caractère ou réservé : aucune requête PATCH, message sous #editUsername.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### PRO-C05 — Une demande d'abonnement en attente est comptée et listée comme abonnement accepté  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : loadFollowersCount (app-06:1144), openFollowersList (app-06:1210), compteurs du profil visité (app-04:4519)
- **Domaine** : Profils et passions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Compte privé : « 8 abonnés » = 7 acceptés + Nora en attente, Nora dans la liste ; profil de Sacha (privé) : « 1 abonné » = ma propre demande ; Nora : « 1 abonnement » = sa demande. Aucune requête ne filtre status=accepted ; la policy follows ouvre les lignes pending aux deux intéressés.
- **Problème** : Les compteurs et la liste mélangent demandes et abonnés.
- **Situation déclenchante** : Compte privé recevant une demande ; visite d'un compte privé après avoir demandé.
- **Conséquence pour l'utilisateur** : On croit qu'une personne non acceptée voit déjà ses publications ; les demandes ne sont pas repérables hors de la cloche.
- **Proposition** : Filtrer status=accepted partout ; dans « Abonnés » d'un compte privé, une ligne « N demandes en attente » qui renvoie aux notifications.
- **Visuels** : [PRO-009](galerie/index.html#/surface/PRO-009), [PRO-049](galerie/index.html#/surface/PRO-049) · **Surfaces** : PRO-009, PRO-049, PRO-008, PRO-025, PRO-028
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Bases sans colonne status (repli _followsSansStatut).
- **Critère d'acceptation** : Avec une demande pending, « Abonnés » vaut le nombre de lignes accepted et la personne n'est pas listée ; profil visité privé : ma demande ne compte pas.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/app-04-comments-shop.js`

### PRO-C06 — « Bloquer » agit au premier appui, sans confirmation, et retire l'abonnement en silence  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Profil visité › ⋯ › Bloquer — openVisitedProfileMenu (app-04:4680), blockUser (app-04:5147)
- **Domaine** : Profils et passions · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde profils-06 : aucune modale, toast « 🚫 Malik Benali bloqué », ligne blocks écrite, Malik retiré des abonnements.
- **Problème** : Action lourde, irréversible en un geste, sans annoncer ses effets.
- **Situation déclenchante** : Appui involontaire dans un menu de trois lignes de 38 px.
- **Conséquence pour l'utilisateur** : Blocage et désabonnement non voulus ; l'autre perd la conversation.
- **Proposition** : Feuille de confirmation : conséquences (ne peut plus te suivre, t'écrire, voir tes publications ; tu ne le suis plus ; il n'est pas prévenu), bouton « Bloquer » rouge.
- **Visuels** : — · **Surfaces** : PRO-031, PRO-022
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Verrou d'écriture ROB-04 ; tests de modération.
- **Critère d'acceptation** : Toucher « Bloquer » ouvre une confirmation ; aucune ligne blocks avant « Bloquer » confirmé.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### CRE-C03 — Le lien avec une activité est invisible et se colle à une publication ultérieure  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : « Partager mon expérience » — js/app-07-ia-explore-irl.js:4558-4592 ; publishPost app-06:5379-5382
- **Domaine** : Création et médias · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde creation-06 : Studio ouvert depuis l'activité, retour au Fil sans publier, puis publication de « Un tout autre sujet… » → eventId = ev_cre_passee. Capture CRE-016 : aucune mention du rattachement.
- **Problème** : window._pendingEventPost n'est consommé qu'à la publication suivante, quelle qu'elle soit, et rien à l'écran ne le montre.
- **Situation déclenchante** : Ouvrir « Partager mon expérience » puis quitter le Studio.
- **Conséquence pour l'utilisateur** : Une publication sans rapport rejoint l'album public d'une activité ; à l'inverse, personne ne sait que son souvenir y sera rangé.
- **Proposition** : Pastille « Liée à l'activité X · Retirer » dans le composer (maquette CRE-016) ; effacer le lien quand on quitte le Studio sans publier.
- **Visuels** : [CRE-016](galerie/index.html#/surface/CRE-016) · **Surfaces** : CRE-016
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Album d'activité (_loadEventAlbum) ; colonne posts.event_id.
- **Critère d'acceptation** : Après « Partager mon expérience », quitter puis republier : la publication n'a pas d'event_id ; dans le Studio, le nom de l'activité est visible.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `js/app-06-reels-partage.js`, `js/ui-v6-composer.js`

### MSG-C64 — La feuille d'actions s'ouvre sous le doigt encore posé : le relâchement peut déclencher une action ou refermer la feuille

- **Emplacement** : Conversation › appui long sur une bulle — _wireMsgActions (js/app-04-comments-shop.js:6263-6283) : ouverture à 480 ms pendant l'appui, aucun traitement du clic qui suit le relâchement
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : hypothese
- **Preuve** : Observé dans le banc (appui tactile CDP, émulation Android) — sondes 03b et 03c : la feuille s'ouvre 485 ms après le touchstart ; au touchend un clic de synthèse tombe à l'endroit du doigt : sur le fond (feuille refermée, 3 essais sur 4) ou sur une ligne de la feuille — « ↩️ Répondre » déclenché au relâchement sur une bulle à y = 563. Le banc n'émet pas l'événement `contextmenu` d'un vrai appui long : sur Android réel le navigateur supprime normalement ce clic ; sur iOS le comportement n'a pas pu être établi.
- **Problème** : Les derniers messages sont en bas de l'écran, là où la feuille apparaît : le doigt qui vient d'ouvrir le menu se trouve déjà sur une de ses lignes, dont « Supprimer pour moi » (sans confirmation).
- **Situation déclenchante** : Appui long sur une bulle située dans la moitié basse de l'écran, sur un navigateur qui produit un clic au relâchement d'un appui long.
- **Conséquence pour l'utilisateur** : Action involontaire (réponse, signalement, suppression) ou menu qui « clignote » et se referme.
- **Proposition** : Neutraliser le toucher qui suit l'appui long (écouteur touchend non passif + preventDefault quand le minuteur a déclenché), ou n'ouvrir la feuille qu'au relâchement. Vérifier sur iPhone et Android réels avant et après.
- **Visuels** : [MSG-148](galerie/index.html#/surface/MSG-148) · **Surfaces** : MSG-148, MSG-140
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C58 réduit déjà la gravité (confirmation de suppression).
- **Risque de régression** : Écouteur non passif sur le fil : ne pas dégrader le défilement (le poser seulement après déclenchement du minuteur).
- **Critère d'acceptation** : Sur deux appareils réels (Android Chrome, iOS Safari) : appui long de 1 s sur la dernière bulle puis relâchement sur place → la feuille reste ouverte et aucune action n'est exécutée.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C65 — Le menu d'actions ne s'ouvre pas sur une vidéo

- **Emplacement** : Conversation › message vidéo — <video controls> (js/app-04-comments-shop.js:6050) : l'appui long est pris par le lecteur natif
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 03c (émulation tactile) : appui maintenu 750 ms au centre de la vidéo reçue → aucune feuille (élément sous le doigt : VIDEO, #modalBackdrop inactif). Sur une photo et sur un texte, la feuille s'ouvre. Sonde 08 : le clic droit (ordinateur) ouvre bien la feuille ; au doigt, la seule prise est la ligne de l'heure sous la vidéo (38 × 15 px).
- **Problème** : Je ne peux ni répondre à une vidéo, ni y réagir, ni la transférer, la signaler ou la supprimer : la seule prise est la petite ligne de l'heure sous la vidéo.
- **Situation déclenchante** : Appui long sur une vidéo reçue ou envoyée.
- **Conséquence pour l'utilisateur** : Une vidéo envoyée par erreur ne peut pas être supprimée par le geste habituel ; une vidéo déplacée ne peut pas être signalée (obligation de signalement d'un contenu).
- **Proposition** : Afficher la vidéo comme une vignette avec bouton de lecture (lecteur ouvert au toucher), ce qui rend l'appui long à la bulle ; ou ajouter un bouton « ⋯ » d'actions sur les bulles média.
- **Visuels** : [MSG-149](galerie/index.html#/surface/MSG-149) · **Surfaces** : MSG-149, MSG-111
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : MSG-C76 (accès aux actions sans appui long).
- **Risque de régression** : `playsinline` obligatoire sur iOS (commentaire du code) ; URL signée des pièces jointes posée après le rendu.
- **Critère d'acceptation** : Appui long (ou bouton d'actions) sur une vidéo reçue : la feuille s'ouvre avec « Signaler ce message » ; sur une vidéo envoyée : avec « Supprimer… ».
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PAR-C17 — Partage de position : un appui envoie des coordonnées précises, sans aperçu ni confirmation  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `shareLocation` (js/app-09-boot-pwa.js:1482), entrée « Position » du menu de pièces jointes (index.html:1453)
- **Domaine** : Partage · **Nature** : clarte · **Type** : observation
- **Preuve** : D'après le code (non exercé) : `getCurrentPosition` puis insertion immédiate de « 📍 Ma position : https://maps.google.com/?q=<lat>,<lng> » (5 décimales, ~1 m) dans la conversation — groupe compris ; seul retour : toast « 📍 Localisation en cours… » ; échec : « ❌ Impossible d'obtenir la position ».
- **Problème** : La position exacte part vers tous les membres de la conversation sans qu'on l'ait vue ni confirmée.
- **Situation déclenchante** : Toucher « Position » (y compris par erreur) alors que la permission du navigateur est déjà accordée.
- **Conséquence pour l'utilisateur** : Divulgation involontaire d'un lieu précis (domicile).
- **Proposition** : Étape d'aperçu : adresse approchée ou mini-carte, nom de la conversation, « Envoyer ma position » / « Annuler ».
- **Visuels** : — · **Surfaces** : PAR-071
- **Priorité** : P2 · **Gravité** : 3/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Domaine « messagerie ».
- **Risque de régression** : File d'envoi des messages (outbox).
- **Critère d'acceptation** : Aucun message de type `location` n'est inséré avant un second geste explicite.
- **Fichiers probables** : `js/app-09-boot-pwa.js`

### PCS-C02 — « Retour » depuis une conversation perd le contexte d'origine

- **Emplacement** : Conversation › bouton « Retour » — js/app-04-comments-shop.js:7789-7805 (`closeConversation` termine toujours par `renderMessages`)
- **Domaine** : Parcours de bout en bout · **Nature** : friction · **Type** : observation
- **Preuve** : Capture PCS-006 : conversation ouverte depuis le profil de Tom (lui-même ouvert depuis le fil) → « Retour » → écran Messages ; profil et fil ont disparu.
- **Problème** : On ne revient pas d'où l'on vient.
- **Situation déclenchante** : Écrire à quelqu'un depuis son profil, sa publication ou une activité, puis revenir.
- **Conséquence pour l'utilisateur** : Trois gestes pour retrouver la publication ou l'activité qui a motivé le message ; la personne perd le fil du parcours Fil → interaction → IRL.
- **Proposition** : Mémoriser l'origine de l'ouverture (écran + profil/fiche ouverts) et la rétablir au retour ; rester sur la liste Messages seulement quand la conversation a été ouverte depuis elle.
- **Visuels** : [PCS-006](galerie/index.html#/surface/PCS-006) · **Surfaces** : PCS-006
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : `openModal` n'empile pas (CLAUDE.md) : rouvrir le profil plutôt que d'empiler. Coordination avec l'historique (`closeCurrentOverlay`, un seul geste d'historique à la fois).
- **Risque de régression** : Historique navigateur (retour système) et panneau animé `#conv-fullpage` (fiche « contenu avant révélation »). Verrous : historique-retour-en-vol, conv-ouverture-fil.
- **Critère d'acceptation** : Fil → profil → Message → Retour : le profil est de nouveau affiché sur le fil, à la même position de défilement ; Messages → conversation → Retour : la liste Messages.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-08-ui-modals-tour.js`

### FIL-C02 — La barre d'actions est faite d'emojis : nommée « 🤍 5 », « 💬 34 », « 😊 », en 12,5 px

- **Emplacement** : Carte et page d'une publication › barre d'actions — `renderPostHTML` (js/app-02-state-utils.js:10490-10500), `openPost` (10571-10581), .post-action (styles.css:1155)
- **Domaine** : Fil et interactions · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Sonde fil-02-interactions : les quatre actions sont des `span` (rôle bouton posé après coup) dont le nom accessible est « 🤍 5 », « 💬 34 », « 😊 » ; seule « Partager » a un `aria-label`. Texte en 12,5 px. Le cœur non aimé est un emoji gris clair. Capture FIL-002 (gros plan « actions »). L'identité du produit réserve les emojis au contenu et demande des icônes SVG `currentColor` pour les fonctions — ce que fait déjà le partage, dans la même barre.
- **Problème** : Les actions les plus fréquentes du produit sont les moins lisibles : pictogrammes d'emoji pâles, compteurs petits, aucun nom prononçable pour un lecteur d'écran, aucun état « aimé » exposé.
- **Situation déclenchante** : Toute lecture du fil ; toute utilisation d'un lecteur d'écran ou d'un clavier.
- **Conséquence pour l'utilisateur** : Geste d'aimer et de commenter moins évident ; pour une personne non voyante, trois boutons sans nom utile par carte.
- **Proposition** : Remplacer les trois emojis par des icônes SVG `currentColor` (cœur plein et violet quand aimé), compteurs en 13,5 px à l'encre, `aria-label` (« J'aime — 5 », « Commenter — 34 commentaires », « Réagir ») et `aria-pressed` sur le j'aime. Les emojis restent pour les réactions choisies (pastille « 🔥 3 »).
- **Visuels** : [FIL-002](galerie/index.html#/surface/FIL-002) · **Surfaces** : FIL-002, FIL-003, FIL-051
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : `_paintPostLike`, `patchPostLikeDom`, `likePostDetail` et `_patchPostCommentCount` réécrivent ces boutons en `innerHTML` avec l'emoji : à modifier ensemble. Verrous : interactions.spec.js, accessibilite-cibles.spec.js.
- **Critère d'acceptation** : Chaque action de la barre a un nom accessible en toutes lettres ; le j'aime expose `aria-pressed` ; les compteurs mesurent ≥ 13 px ; contraste ≥ 4,5:1.
- **Fichiers probables** : `js/app-02-state-utils.js`, `js/app-03-posts-vlogs.js`, `js/app-04-comments-shop.js`, `styles.css`

### FIL-C03 — Mon j'aime déjà posé s'affiche « 🤍 » pendant les premières secondes ; le toucher alors compte un j'aime de trop

- **Emplacement** : Carte › j'aime — `renderPostHTML` lit `state.user.likedPosts` (js/app-02-state-utils.js:10314) alors que la lecture du fil rend `liked: cpl.aime` (js/app-08-ui-modals-tour.js:5007)
- **Domaine** : Fil et interactions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde fil-02-interactions (compte neuf sur l'appareil, j'aime présent en base) : à ~3 s, `post.liked = true`, `likes = 5`, mais la carte affiche « 🤍 5 » ; un toucher envoie un second POST post_likes et affiche « ❤️ 6 » (la base en compte 5). Capture FIL-002 (avant : cœur gris). Quelques secondes plus tard le tour de relecture des compteurs (`_postLikeRefreshTour`, app-03, phase initiale tirée entre 0,2 et 15 s) repeint « ❤️ 5 » (visible sur FIL-001).
- **Problème** : Sur un appareil où l'état local ne connaît pas encore mes j'aime (nouvel appareil, données effacées), le fil dit que je n'ai pas aimé ce que j'ai aimé, puis se corrige seul.
- **Situation déclenchante** : Première ouverture sur un appareil ; toucher le cœur avant le premier tour de relecture.
- **Conséquence pour l'utilisateur** : Compteur faux d'une unité jusqu'à la relecture suivante ; impression que le j'aime n'avait pas été gardé.
- **Proposition** : Peindre l'état aimé avec `p.liked === true ∣∣ likedPosts.includes(p.id)` dans `renderPostHTML` et `openPost`, et aligner `state.user.likedPosts` sur `aime` à la lecture du fil.
- **Visuels** : [FIL-002](galerie/index.html#/surface/FIL-002) · **Surfaces** : FIL-002
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Un j'aime retiré hors ligne ne doit pas réapparaître : respecter l'intention locale en attente (`_postLikeReconcileLoaded`). Verrous : interactions.spec.js (4 cas de like).
- **Critère d'acceptation** : État local vide, j'aime présent en base : la carte affiche l'état aimé dès le premier rendu qui suit la lecture du fil ; un toucher le retire (compteur 4), il n'en ajoute pas.
- **Fichiers probables** : `js/app-02-state-utils.js`, `js/app-08-ui-modals-tour.js`

### FIL-C04 — La discussion montre deux commentaires et demi : sa liste est bornée à 260 px

- **Emplacement** : Feuille « Discussion » — `#commentsBox` `max-height:260px` (js/app-04-comments-shop.js:1320)
- **Domaine** : Fil et interactions · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde fil-02 : `#commentsBox` 260 px de haut pour 2 975 px de contenu (30 commentaires chargés) ; la feuille occupe 522 px sur 844, les 322 px du haut restent vides. Capture FIL-030 (m390, m360) ; avec le clavier simulé (FIL-031) la liste garde ses 260 px.
- **Problème** : Lire une discussion de 34 commentaires se fait par une lucarne de 260 px, alors que la moitié de l'écran est libre.
- **Situation déclenchante** : Ouvrir la discussion d'une publication commentée.
- **Conséquence pour l'utilisateur** : Beaucoup de défilement pour peu de lecture ; le fil des réponses dépliées ne tient pas à l'écran.
- **Proposition** : Laisser la liste prendre la hauteur disponible (`max-height: min(54vh, 470px)`, davantage sans clavier), retirer le sous-titre « Réponds à cette publication. », ramener le champ vide à une ligne.
- **Visuels** : [FIL-030](galerie/index.html#/surface/FIL-030) · **Surfaces** : FIL-030, FIL-031
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : La feuille doit rester sous la hauteur visible clavier ouvert (mesurer avec `--app-vh`). Verrous : commentaires*.spec.js.
- **Critère d'acceptation** : À 390×844 sans clavier, au moins cinq commentaires d'une ligne sont visibles ; clavier ouvert, le champ et le bouton d'envoi restent visibles.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `styles.css`

### FIL-C07 — « Masquer ce commentaire » ne tient que jusqu'à la relecture de la discussion

- **Emplacement** : Options d'un commentaire d'autrui — action « hide » (js/app-04-comments-shop.js:2437) : retrait local de la liste, aucune mémoire
- **Domaine** : Fil et interactions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde fil-04-ecritures : après « Masquer », le commentaire disparaît (affiché : false) ; discussion rouverte après expiration du cache de 20 s (cache vidé par la sonde : temps simulé) : commentaire de retour (true).
- **Problème** : Le geste promet de ne plus voir un commentaire ; il revient à la prochaine ouverture.
- **Situation déclenchante** : Masquer un commentaire puis rouvrir la discussion plus de 20 s après, ou recharger.
- **Conséquence pour l'utilisateur** : Promesse non tenue sur un geste de confort et de protection.
- **Proposition** : Mémoriser les commentaires masqués (liste locale bornée, par compte) et les filtrer dans `_renderCommentsList`, comme les comptes bloqués ; ou retirer l'entrée si elle ne peut pas être tenue.
- **Visuels** : — · **Surfaces** : FIL-034
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Clé de stockage à inscrire dans `ACCOUNT_SCOPED_KEYS`.
- **Critère d'acceptation** : Un commentaire masqué reste masqué après rechargement de l'application, pour le même compte.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-02-state-utils.js`

### FIL-C11 — Cibles et champs de la discussion sous les seuils (28 × 40, 34 × 34, sans étiquette)

- **Emplacement** : Feuille « Discussion » et réponse en ligne — .comment-action (styles.css:3183, 11358), bouton « ✓ » (js/emoji-misc.js:380-382), `#newComment` (app-04:1323)
- **Domaine** : Fil et interactions · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Fiches FIL-030--m390 et FIL-037--m390 (mesures.cibles.sous44) : actions d'un commentaire 28 × 35-40 px (💬, 😊) et 38 × 35-40 (🤍) ; tri « Pertinents / Récents » 78 × 24-34 ; envoi d'une réponse « ✓ » 34 × 34 ; « × » de la feuille 34 × 34 ; « Publier » 42 px de haut. `mesures.champsSansEtiquette` : `textarea#newComment` et `input#reply-input-…` n'ont qu'un texte d'appel. Avatars des commentaires focalisables sans nom (`mesures.sansNom`).
- **Problème** : Les commandes d'une discussion sont petites et serrées (trois icônes sur 110 px) et les champs n'ont pas de nom.
- **Situation déclenchante** : Aimer, répondre ou réagir à un commentaire au pouce ; naviguer au lecteur d'écran.
- **Conséquence pour l'utilisateur** : Erreurs de toucher entre « répondre » et « réagir » ; champs annoncés sans libellé.
- **Proposition** : Actions de commentaire à 44 px de large, envoi de réponse à 44 × 44, « Publier » et outil emoji à 46 px, `aria-label` sur les deux champs et sur les avatars (« Profil de … »). Pendant une réponse, masquer la saisie de commentaire (un seul champ à l'écran).
- **Visuels** : [FIL-030](galerie/index.html#/surface/FIL-030), [FIL-037](galerie/index.html#/surface/FIL-037) · **Surfaces** : FIL-030, FIL-037, FIL-036
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : accessibilite-cibles.spec.js mesure déjà ces zones par `elementFromPoint` : étendre la liste.
- **Critère d'acceptation** : Dans la discussion à 360 px, toute commande mesure ≥ 44 × 44 px (zone sondée) et chaque champ a un nom accessible.
- **Fichiers probables** : `styles.css`, `js/emoji-misc.js`, `js/app-04-comments-shop.js`

### FIL-C12 — La page d'une publication s'intitule « Post » et n'offre aucun champ pour commenter

- **Emplacement** : Page d'une publication — en-tête (index.html:1256-1260, fond #ede9fe en dur), `openPost` (js/app-02-state-utils.js:10558-10588)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : observation
- **Preuve** : Captures FIL-050 et FIL-051. Fiche FIL-050--m390 : « Commentaires (0) » et « Aucun commentaire — sois le premier 💬 » à 4,39:1 (#6e6987 sur #ede9fe, seuil 4,5). Pour écrire, il faut toucher « 💬 », qui rouvre la même liste dans la feuille « Discussion » par-dessus la page. Aucune image ne s'agrandit (`openFullImg` n'est appelé que par la messagerie).
- **Problème** : La page qui montre le mieux la discussion ne permet pas d'y participer directement, emploie un autre mot que le reste de l'application et un fond différent.
- **Situation déclenchante** : Toucher le texte ou le média d'une carte (« Lire la suite »).
- **Conséquence pour l'utilisateur** : Invitation « sois le premier » sans geste associé ; doublon liste/feuille ; textes secondaires sous le seuil de contraste.
- **Proposition** : Titre « Publication », fond `--bg-deep`, intertitre « Discussion · N commentaires », et un bouton « Écrire un commentaire » (ou la saisie elle-même) en bas de page, qui ouvre le composeur existant.
- **Visuels** : [FIL-050](galerie/index.html#/surface/FIL-050) · **Surfaces** : FIL-050, FIL-051
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : La page est une sœur de `<main>` en `position: fixed` (z-index 200) : garder ce cadrage. Verrous : controle-general-2026-11-10 ②, post-detail*.spec.js.
- **Critère d'acceptation** : Depuis la page d'une publication, un commentaire peut être commencé en un toucher visible sans chercher l'icône ; contrastes ≥ 4,5:1 sur le fond de la page.
- **Fichiers probables** : `index.html`, `js/app-02-state-utils.js`, `styles.css`

### FIL-C13 — Les envies ne se lisent pas comme des filtres

- **Emplacement** : En-tête du fil — `#feedIntentSelector` (index.html:637-648), .feed-intent-btn (styles.css:1286-1322)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture FIL-001 : quatre mots en 11 px (10,5 px sous 360 px) sans bordure ni intitulé, entre le rail et les stories. Capture FIL-073 : « Apprendre » cochée alors qu'aucune source ne l'est, l'écran dit « Tu ne suis encore personne » sans parler de l'envie. Capture FIL-075 : l'envie cochée ne se distingue que par la graisse et un fond léger.
- **Problème** : Rien n'indique que « Explorer · Apprendre · Idées · Rencontrer » retranchent du fil ; « Rencontrer » y côtoie l'onglet « Rencontrer » de la barre basse, qui mène ailleurs.
- **Situation déclenchante** : Première lecture de l'en-tête ; fil qui se vide après un toucher.
- **Conséquence pour l'utilisateur** : Filtre posé sans le savoir, fil appauvri sans explication visible à l'endroit du geste.
- **Proposition** : Donner à la rangée la forme de filtres : intitulé « Filtrer : », pastilles bordées en 13 px, état coché plein. Sans changer le moteur (les envies filtrent l'union, fiche 23).
- **Visuels** : [FIL-001](galerie/index.html#/surface/FIL-001) · **Surfaces** : FIL-001, FIL-073, FIL-075
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : feed-envie-filtre.spec.js ⑦ compare les libellés aux boutons rendus : ne pas les changer. Largeur à 320 px à vérifier (quatre pastilles + intitulé).
- **Critère d'acceptation** : Test auprès de cinq personnes : quatre disent spontanément que la rangée filtre le fil. À 320 px, aucune pastille n'est tronquée.
- **Fichiers probables** : `index.html`, `styles.css`

### FIL-C15 — Le visiteur lit « ta communauté » et « Publier la première » avant tout contenu

- **Emplacement** : Fil d'un visiteur — séparateur « Exemples PASSIO » genre « seul » (js/app-02-state-utils.js:8625-8642), carte de bienvenue (js/first-run.js)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture FIL-080 (m390, m360) et sonde fil-03-visiteur : sous la carte de bienvenue, le séparateur dit « Pas encore de publication de ta communauté par ici… » avec un bouton violet « Publier la première » ; la première publication commence à ~670 px sur 844. Deux boutons principaux violets se suivent (« Choisir mes passions », « Publier la première »).
- **Problème** : Une personne sans compte n'a pas de communauté et ne peut pas publier ; le message et son bouton lui parlent d'un état qui n'est pas le sien et repoussent le contenu sous l'écran.
- **Situation déclenchante** : Première visite (appareil vierge).
- **Conséquence pour l'utilisateur** : Le premier écran d'un nouveau venu montre des commandes, presque pas de contenu ; « Publier la première » mène à une demande de compte.
- **Proposition** : Pour un visiteur (`PassioFirstRun.estVisiteur()`), réduire le séparateur à son titre et une ligne (« Voici des exemples de ce qui se partage sur PASSIO. ») sans bouton.
- **Visuels** : [FIL-080](galerie/index.html#/surface/FIL-080) · **Surfaces** : FIL-080
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : fil-reel-dabord.spec.js et fil-panne-reseau.spec.js lisent `data-genre` et le bouton : ajouter un genre ou un attribut plutôt que modifier « seul ».
- **Critère d'acceptation** : En visiteur à 390×844, le séparateur ne porte aucun bouton et la première carte commence au plus tard à 580 px.
- **Fichiers probables** : `js/app-02-state-utils.js`, `styles.css`

### FIL-C17 — États vides : le bouton ne fait pas ce que le message conseille

- **Emplacement** : `#feedEmpty` — textes (js/app-02-state-utils.js:9862-9895), bouton ajouté par `decorateEmpty` (js/ui-v2-shell.js:749-761)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture FIL-072 : « Tu ne suis encore personne — ouvre le profil de quelqu'un et touche « Suivre »… Tu peux aussi cocher une passion ci-dessus. », suivi du seul bouton « Publier une Passio ». Le guillemet fermant « » » commence une ligne. La bulle « Musique » décochée est à 40 % d'opacité et désaturée (styles.css:4555). Capture FIL-074 (« Choisis tes passions ») : bouton « Explorer les passions ».
- **Problème** : Le message donne deux sorties (suivre quelqu'un, cocher une passion) et le bouton en propose une troisième, dans un mot (« Passio ») que le reste du fil n'emploie pas pour une publication.
- **Situation déclenchante** : Décocher ses passions en gardant « Suivis » sans abonnement ; tout décocher.
- **Conséquence pour l'utilisateur** : La sortie la plus simple (recocher la bulle grisée) n'est pas celle qu'on montre.
- **Proposition** : Faire du bouton l'action du message : « Trouver des personnes à suivre » (écran Rechercher) pour « Tu ne suis encore personne » ; garder « Explorer les passions » pour « Choisis tes passions ». Espaces insécables autour des guillemets. Bulle décochée lisible (opacité ≥ 0,6).
- **Visuels** : — · **Surfaces** : FIL-072, FIL-073, FIL-074
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : ui-v2 §5 (decorateEmpty) et feed-envie-filtre.spec.js lisent ces libellés.
- **Critère d'acceptation** : Chaque état vide du fil a un bouton dont le libellé reprend une sortie nommée dans son texte.
- **Fichiers probables** : `js/ui-v2-shell.js`, `js/app-02-state-utils.js`, `styles.css`

### FIL-C20 — Un repartage est un texte sans lien vers l'original ; un partage d'activité déborde de la carte

- **Emplacement** : Repartage — `sharePostInFeed` (js/app-03-posts-vlogs.js:78-106), rendu sans branche dédiée dans `renderPostHTML` ; partage d'activité — sous-carte (js/app-02-state-utils.js:10325-10343)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture FIL-013 : « 📤 A partagé un post / 🎵 Léa Fontaine – Musique / citation » en texte, sans photo de l'original ni moyen de l'ouvrir (le toucher ouvre le repartage). Capture FIL-014 : la sous-carte « ÉVÉNEMENT IRL » dépasse des marges de la carte tant que la carte n'est pas redécorée (FIL-C01), et dit « événement » quand le reste dit « activité ».
- **Problème** : Le repartage perd ce qu'il partage ; l'ancienne sous-carte d'activité réapparaît mal cadrée.
- **Situation déclenchante** : Voir un repartage dans le fil ; ouvrir l'application avec un partage d'activité en tête.
- **Conséquence pour l'utilisateur** : Impossible de rejoindre la publication d'origine ou son auteur ; mot « événement » résiduel.
- **Proposition** : Rendre le repartage comme une carte citée cliquable (auteur, extrait, vignette) qui ouvre l'original par `sharedReel` ; aligner la sous-carte d'activité sur les marges et le mot « activité ».
- **Visuels** : — · **Surfaces** : FIL-013, FIL-014
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : partage*.spec.js ; les repartages existants portent le texte en dur dans `content`.
- **Critère d'acceptation** : Toucher la citation d'un repartage ouvre la publication d'origine ; aucune boîte ne dépasse la carte.
- **Fichiers probables** : `js/app-02-state-utils.js`, `js/app-03-posts-vlogs.js`, `styles.css`

### PRO-C04 — « Tout » reste coché : toucher « Photos » ne filtre rien

- **Emplacement** : Mon profil › filtres de type — switchProfileTab (app-06:1497), PROFILE_TAB_PRED.posts = tout
- **Domaine** : Profils et passions · **Nature** : friction · **Type** : observation
- **Preuve** : Capture PRO-003 : Tout + Photos cochés, la liste garde textes et vidéos (union). Le profil visité part de « rien coché » : même geste, effet différent.
- **Problème** : Le filtre le plus attendu semble cassé.
- **Situation déclenchante** : Premier usage des filtres.
- **Conséquence pour l'utilisateur** : On croit qu'il n'y a pas de photo ou que le filtre ne marche pas.
- **Proposition** : Choix unique avec « Tout » comme neutre (comme le rail) sur les deux profils.
- **Visuels** : [PRO-003](galerie/index.html#/surface/PRO-003) · **Surfaces** : PRO-003, PRO-021
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : État persistant contentTabIds ; tests des sous-filtres.
- **Critère d'acceptation** : Depuis « Tout », toucher « Photos » décoche « Tout » et n'affiche que la grille des photos ; idem sur le profil visité.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/app-04-comments-shop.js`

### PRO-C07 — Le profil d'un compte que j'ai bloqué ne dit pas qu'il est bloqué  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : openUserProfile (app-04:4596-4620)
- **Domaine** : Profils et passions · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde profils-06 : Tom bloqué → Message et Suivre affichés normalement ; seul le menu ⋯ montre « Débloquer ».
- **Problème** : Rien ne rappelle l'état de blocage.
- **Situation déclenchante** : Rouvrir le profil d'une personne bloquée (liste, lien, commentaire).
- **Conséquence pour l'utilisateur** : Message ou Suivre tentés puis refusés ; on oublie qu'on a bloqué.
- **Proposition** : Remplacer les actions par un bandeau « Tu as bloqué ce compte » et un bouton « Débloquer ».
- **Visuels** : — · **Surfaces** : PRO-029
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Profil d'un compte bloqué : bandeau visible, pas de bouton Message ni Suivre.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PRO-C15 — « Modifier le profil » : 1 096 px de haut, huit champs de réseaux, Sauvegarder tout en bas

- **Emplacement** : openEditMainProfile (app-06:1979-2001)
- **Domaine** : Profils et passions · **Nature** : friction · **Type** : jugement
- **Preuve** : Capture PRO-012 : 8 champs URL toujours affichés (39 px de haut), « Tiktok », « Youtube », « Linkedin », « Twitter » ; texte de confidentialité 11 px de six lignes.
- **Problème** : Long à parcourir pour une modification de bio.
- **Situation déclenchante** : Toute édition.
- **Conséquence pour l'utilisateur** : Défilement, risque d'abandon ; marques mal écrites.
- **Proposition** : N'afficher que les réseaux remplis + « Ajouter un réseau » ; barre d'enregistrement collante ; noms de marque corrects.
- **Visuels** : [PRO-012](galerie/index.html#/surface/PRO-012) · **Surfaces** : PRO-012
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Conservation du brouillon (editCoverFromModal).
- **Critère d'acceptation** : À 390 px, « Sauvegarder » visible sans défiler ; un réseau vide n'occupe pas de champ.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### CRE-C02 — Choisir une passion pour une publication l'ajoute aux passions du compte, sans le dire  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Studio › Changer — js/passions-flat-ui.js:158-250 (ajouterPassionAuCompte), app-06:4800-4813 (onStudioPassionChange → switchToProfile)
- **Domaine** : Création et médias · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde creation-03b : profils actifs [musique] → [musique, outdoor-escalade-bloc] après « Publier dans cette passion » ; aucun toast ; la zone de sélection s'intitule « TES PASSIONS ».
- **Problème** : Un choix ponctuel modifie durablement le profil (passions affichées, fil) et la passion courante.
- **Situation déclenchante** : Publier dans une passion que l'on n'a pas encore.
- **Conséquence pour l'utilisateur** : Le profil et le fil changent à l'insu de la personne ; le commentaire du composer UI-6 promet l'inverse (« ne change pas durablement »).
- **Proposition** : Dire avant de valider « … rejoindra aussi tes passions » (maquette CRE-005), et confirmer après ; l'intitulé de la zone devient « Pour cette publication ». Décision produit : faut-il vraiment l'ajouter ?
- **Visuels** : [CRE-005](galerie/index.html#/surface/CRE-005) · **Surfaces** : CRE-004, CRE-005
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Décision produit sur la règle « publier ⇒ posséder la passion ».
- **Risque de régression** : Ne pas écrire #postPassion avant l'acquisition (garde existante) ; plafond levé mais logique conservée.
- **Critère d'acceptation** : Choisir une passion non possédée affiche, avant validation, la phrase qui annonce son ajout au compte.
- **Fichiers probables** : `js/passions-flat-ui.js`, `js/passion-search-selector.js`

### CRE-C04 — Après Publier, les messages se contredisent et l'état de la carte reste figé sur « Sync… »

- **Emplacement** : Fil — app-06:5307, 5410-5424 ; carte app-02-state-utils.js:10473-10478
- **Domaine** : Création et médias · **Nature** : clarte · **Type** : observation
- **Preuve** : CRE-014 (refus 403 simulé) : « Publication en cours… » reste affiché à côté de « Post en local (connexion lente) » ; la carte dit « Sync… » alors que l'état est « offline ». CRE-013 : carte « Sync… » alors que l'état est « synced ». Libellé 10 px, couleurs #22c55e/#f59e0b sur blanc.
- **Problème** : Le toast de chargement n'est pas retiré, un refus serveur est attribué au réseau, la carte n'est pas repeinte au verdict.
- **Situation déclenchante** : Toute publication ; surtout un refus (RLS, session).
- **Conséquence pour l'utilisateur** : On croit à une lenteur et on attend un envoi qui ne viendra peut-être pas, ou on republie.
- **Proposition** : Remplacer le toast de chargement par le verdict ; distinguer « refusée » de « en attente de réseau » ; repeindre la carte au verdict ; libellé 12 px contrasté (« En ligne », « En attente — renvoi auto », « Non publiée »).
- **Visuels** : [CRE-013](galerie/index.html#/surface/CRE-013), [CRE-014](galerie/index.html#/surface/CRE-014) · **Surfaces** : CRE-013, CRE-014
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Fait transverse PAR-C03 / IRL-C65 / MSG-C85 (toasts sous les feuilles).
- **Risque de régression** : File de renvoi durable (app-08:1728-1840) ; tests publication-optimiste-refusee.spec.js, publications-reprise.spec.js.
- **Critère d'acceptation** : Refus 403 : un seul message « Publication refusée… » et la carte affiche « Non publiée » ; succès : la carte affiche « En ligne » sans rechargement.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/app-08-ui-modals-tour.js`, `js/app-02-state-utils.js`

### CRE-C05 — Aucun brouillon : le texte est perdu au rechargement

- **Emplacement** : Studio — app-06:4872-4890, 5478-5546 (saveDraft/loadDraft sans appelant, #draftList absent)
- **Domaine** : Création et médias · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde creation-02 : texte conservé en changeant d'onglet, vide après rechargement (CRE-015). grep : saveDraft n'est appelé nulle part.
- **Problème** : Une fermeture de la PWA, une mise à jour ou un rechargement efface la création en cours.
- **Situation déclenchante** : Quitter l'application en cours de rédaction.
- **Conséquence pour l'utilisateur** : Perte de texte ; découragement à rédiger long.
- **Proposition** : Conserver automatiquement le texte (et la passion, l'envie) du Studio en local, restauré à l'ouverture avec « Reprendre / Effacer » ; supprimer le code de brouillons orphelin. Pas de liste de brouillons.
- **Visuels** : [CRE-015](galerie/index.html#/surface/CRE-015) · **Surfaces** : CRE-015, CRE-032, CRE-002
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Quota localStorage : ne jamais y écrire un média base64 (_leanState).
- **Critère d'acceptation** : Saisir un texte, recharger, ouvrir le Studio : le texte est proposé à la reprise.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### CRE-C07 — Une seconde zone d'envoi, sombre et illisible, sous chaque aperçu

- **Emplacement** : Studio — .upload-zone styles.css:2659-2672 (fond rgba(15,23,42,.6)) ; index.html:889-903
- **Domaine** : Création et médias · **Nature** : polish · **Type** : observation
- **Preuve** : Captures CRE-006, CRE-007, CRE-009 : bloc gris foncé « Ajouter une photo / vidéo », texte d'aide 11 px muet sur fond sombre, troisième porte vers le même fichier ; Publier sort de l'écran à 390 px.
- **Problème** : Vestige d'un thème sombre ; doublon des boutons du composer.
- **Situation déclenchante** : Ajouter ou retirer un média.
- **Conséquence pour l'utilisateur** : Écran alourdi, hors identité ; laisse croire qu'on peut ajouter plusieurs photos.
- **Proposition** : Masquer .upload-zone sous UI-6 (les boutons du composer suffisent) ; le bouton devient « Changer la photo » quand une photo est là.
- **Visuels** : [CRE-006](galerie/index.html#/surface/CRE-006), [CRE-007](galerie/index.html#/surface/CRE-007), [CRE-009](galerie/index.html#/surface/CRE-009) · **Surfaces** : CRE-006, CRE-007, CRE-009
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : La zone déclenche #photoInput/#videoInput : les boutons v6 font de même.
- **Critère d'acceptation** : Avec une photo, aucun bloc sombre n'apparaît ; Publier visible à 390 × 844 sans défiler sous un texte court.
- **Fichiers probables** : `styles.css`

### CRE-C08 — Commandes de création sous 44 px ou sans nom accessible

- **Emplacement** : Retirer photo (.photo-clear, div 28 px, app-06:5043) ; #recBtn (index.html:914) ; .me-tool 40 px title seul (index.html:226-229) ; poignées 22/24 px (app-08:1505-1508) ; #v7BobineCoverBtn 29 px ; .v2-sheet-close 34 px
- **Domaine** : Création et médias · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures sondes creation-01/03/04 : 28 × 28, 34 × 34, 40 × 40, 22 × 22, 24 × 24, 116 × 29 px ; aria-label absent sur .photo-clear, #recBtn, .me-tool, .me-ov-del.
- **Problème** : Cibles petites et commandes muettes pour un lecteur d'écran.
- **Situation déclenchante** : Usage au pouce, lecteur d'écran.
- **Conséquence pour l'utilisateur** : Erreurs de toucher (retrait de photo, suppression d'un texte) ; outils inutilisables à l'aveugle.
- **Proposition** : 44 px minimum (zone tactile), vrai <button> avec aria-label : « Retirer la photo », « Enregistrer », « Ajouter un texte », « Supprimer ce texte ».
- **Visuels** : [CRE-001](galerie/index.html#/surface/CRE-001), [CRE-006](galerie/index.html#/surface/CRE-006), [CRE-019](galerie/index.html#/surface/CRE-019), [CRE-020](galerie/index.html#/surface/CRE-020), [CRE-025](galerie/index.html#/surface/CRE-025) · **Surfaces** : CRE-001, CRE-006, CRE-010, CRE-019, CRE-020, CRE-024, CRE-025
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Poignées d'overlay : contre-échelle (_meApplyTransform).
- **Critère d'acceptation** : Les commandes citées mesurent ≥ 44 × 44 px de zone tactile et ont un nom accessible.
- **Fichiers probables** : `index.html`, `styles.css`, `js/app-06-reels-partage.js`, `js/app-08-ui-modals-tour.js`, `js/ui-v7-lot.js`

### CRE-C09 — Le texte d'une story ou d'une bobine se saisit dans une boîte native prompt()

- **Emplacement** : Éditeur média — meAddText app-08:1451 ; modification au double-clic app-08:1511
- **Domaine** : Création et médias · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde creation-04 : dialogue natif « Ton texte : » ; modification par double-clic seulement (aucun geste tactile équivalent).
- **Problème** : Fenêtre système hors identité, sans aperçu ni couleur ; modifier un texte exige un double-clic de souris.
- **Situation déclenchante** : Ajouter ou corriger un texte superposé.
- **Conséquence pour l'utilisateur** : Saisie maladroite sur mobile, texte difficile à corriger.
- **Proposition** : Feuille de saisie dans l'éditeur (champ 16 px, aperçu en direct, 4 couleurs, OK), ouverte aussi par un appui sur le texte (maquette CRE-025).
- **Visuels** : [CRE-025](galerie/index.html#/surface/CRE-025) · **Surfaces** : CRE-025
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Format des overlays (_meOverlaysData) inchangé.
- **Critère d'acceptation** : Aa ouvre une saisie dans la page, sans window.prompt ; toucher un texte existant permet de le modifier.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`, `styles.css`

### CRE-C14 — Visiteur : le micro est demandé avant tout compte, et « Live vidéo » répond par un simple toast  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : toggleRecording app-06:5151 (aucun requireAuthentication) ; startVideoLive app-05:4233
- **Domaine** : Création et médias · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Captures CRE-031 (toast « Micro refusé » = getUserMedia appelé pour un visiteur) et CRE-030 (« Connecte-toi pour lancer un live ») ; Bobine/Story/Activité ouvrent la porte d'inscription (sonde creation-05).
- **Problème** : Contraire à la règle « aucune demande de permission à l'entrée » ; entrée Live incohérente avec les cinq autres.
- **Situation déclenchante** : Visiteur → Créer → Audio / podcast → micro ; ou → Live vidéo.
- **Conséquence pour l'utilisateur** : Demande système déroutante pour quelqu'un qui découvre ; message sans issue pour le live.
- **Proposition** : requireAuthentication("publier") en tête de toggleRecording et de la porte Audio ; porte d'inscription commune pour Live.
- **Visuels** : [CRE-031](galerie/index.html#/surface/CRE-031), [CRE-030](galerie/index.html#/surface/CRE-030) · **Surfaces** : CRE-031, CRE-030
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Gate visiteur (first-run.js) ; comptes existants non touchés (rend true).
- **Critère d'acceptation** : Visiteur : toucher le micro ou Live ouvre « Crée ton compte… » et aucun getUserMedia n'est appelé.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/app-05-config-profil.js`, `js/ui-v2-shell.js`

### BOB-C05 — Les bobines vidéo n'ont pas de vignette (rail du fil, grilles de profil)

- **Emplacement** : reelPoster js/ui-v2-shell.js:474 ; grilles app-06:1478 et app-04:4888
- **Domaine** : Bobines et stories · **Nature** : clarte · **Type** : observation
- **Preuve** : 5 tuiles sur 8 du rail sans image (sonde bobines-01) : aucune bobine vidéo de compte n'a de `poster`.
- **Problème** : Des aplats violets identiques à la place d'un aperçu.
- **Situation déclenchante** : Toute bobine vidéo.
- **Conséquence pour l'utilisateur** : Rien n'invite à ouvrir : la porte de découverte la plus visuelle ne montre rien.
- **Proposition** : Calculer une image de la vidéo à la publication (poster), ou à défaut <video preload=metadata> sur une image de la vidéo.
- **Visuels** : [BOB-002](galerie/index.html#/surface/BOB-002) · **Surfaces** : BOB-002, BOB-050, BOB-051
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Stockage d'une image de couverture à la publication.
- **Risque de régression** : Poids du fil (pas de vidéo jouée dans le rail).
- **Critère d'acceptation** : Chaque tuile du rail d'une bobine vidéo affiche une image extraite de la vidéo.
- **Fichiers probables** : `js/ui-v2-shell.js`, `js/app-08-ui-modals-tour.js`

### BOB-C06 — Impossible de mettre une bobine en pause, même avec « réduire les animations »

- **Emplacement** : Lecteur — aucun gestionnaire de toucher sur .reel-media ; videoPubliqueAutoplay js/app-02-state-utils.js:4163
- **Domaine** : Bobines et stories · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Toucher au centre : paused reste false (sonde bobines-04). Avec reducedMotion: reduce, la vidéo démarre et boucle (BOB-070).
- **Problème** : Une vidéo en boucle sans contrôle de pause.
- **Situation déclenchante** : Toute bobine vidéo.
- **Conséquence pour l'utilisateur** : Contraire au critère WCAG 2.2.2 ; gênant pour qui veut lire la légende ou est sensible au mouvement.
- **Proposition** : Toucher = pause/lecture avec repère ❚❚ ; pas de lecture automatique si prefers-reduced-motion: reduce (bouton « Lire » à la place).
- **Visuels** : [BOB-011](galerie/index.html#/surface/BOB-011) · **Surfaces** : BOB-011, BOB-070
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Les boutons du rail et les chips arrêtent déjà la propagation ; vérifier le défilement vertical.
- **Critère d'acceptation** : Un toucher sur la vidéo l'arrête et affiche un repère ; sous reduce, aucune vidéo ne démarre seule.
- **Fichiers probables** : `js/app-05-config-profil.js`, `js/app-02-state-utils.js`

### BOB-C07 — Stories : le maintien ne met pas en pause, le relâchement saute la story, et le clavier ne fait rien

- **Emplacement** : Visionneuse — .story-tap-prev/next index.html:183-184 ; minuteur app-08:2030-2045
- **Domaine** : Bobines et stories · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Appui maintenu 1,5 s : barre 17,9 % → 51,6 %, puis story suivante au relâcher. Échap et → : aucun effet (sonde bobines-03).
- **Problème** : Lire une story longue est impossible : elle avance en 4,5 s quoi qu'on fasse.
- **Situation déclenchante** : Story texte, maintien pour lire, ordinateur.
- **Conséquence pour l'utilisateur** : Contenu manqué ; WCAG 2.2.1 (durée réglable) non tenu.
- **Proposition** : Maintien = pause (pointerdown/up), relâcher ne navigue pas ; Échap ferme, ← → naviguent, Espace met en pause.
- **Visuels** : — · **Surfaces** : BOB-035, BOB-036, BOB-037
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Distinguer toucher court et maintien (> 250 ms).
- **Critère d'acceptation** : Pendant un maintien, la largeur de la barre courante ne change pas et la story ne change pas au relâcher.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`, `index.html`

### BOB-C08 — Les stories réelles n'affichent pas leur heure et passent de la plus récente à la plus ancienne

- **Emplacement** : supaLoadStories js/app-08-ui-modals-tour.js:5703 (aucun createdAt) ; tri app-08:603 ; fmtTime app-02:2098
- **Domaine** : Bobines et stories · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : #storyTime vide sur toutes les stories du faux serveur ; Léa : la story de 30 min est jouée avant celle de 90 min (sonde bobines-03).
- **Problème** : On ne sait pas quand la story a été publiée et l'histoire se lit à l'envers.
- **Situation déclenchante** : Toute story chargée depuis Supabase avec plusieurs stories d'un même auteur.
- **Conséquence pour l'utilisateur** : « Atelier ouvert ce soir » lu sans savoir si c'est encore ce soir : décision IRL faussée.
- **Proposition** : Reprendre createdAt: supaTs(r.created_at) dans supaLoadStories.
- **Visuels** : [BOB-030](galerie/index.html#/surface/BOB-030) · **Surfaces** : BOB-030, BOB-031
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Ordre des groupes (anneaux vus en fin) inchangé.
- **Critère d'acceptation** : #storyTime affiche l'âge de la story ; les stories d'un auteur passent de la plus ancienne à la plus récente.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`

### BOB-C09 — Une story ne permet ni de répondre ni de réagir  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Visionneuse de stories (index.html:168-187)
- **Domaine** : Bobines et stories · **Nature** : friction · **Type** : jugement
- **Preuve** : Seuls le nom (vers le profil), ⋯ (signaler) et ✕ sont actifs ; la story de Léa pose une question (« Qui passe les essayer avant samedi ? »).
- **Problème** : Rien ne prolonge la story en interaction.
- **Situation déclenchante** : Story qui invite à venir, à répondre.
- **Conséquence pour l'utilisateur** : La boucle interaction → IRL s'arrête net sur le format le plus spontané.
- **Proposition** : Un champ « Répondre à Léa… » qui ouvre la conversation EXISTANTE avec la story citée (pas de nouveau canal).
- **Visuels** : [BOB-030](galerie/index.html#/surface/BOB-030) · **Surfaces** : BOB-030
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Messagerie existante (ouverture d'une conversation 1:1).
- **Risque de régression** : Comptes privés et bloqués : réutiliser les règles de la messagerie.
- **Critère d'acceptation** : Sur la story d'autrui, « Répondre » ouvre la conversation avec cette personne, la story citée.
- **Fichiers probables** : `index.html`, `js/app-08-ui-modals-tour.js`

### BOB-C10 — Fermer une bobine ouverte depuis un profil ne ramène pas à ce profil

- **Emplacement** : Grille des bobines du profil visité — « closeModal();openReelById » (js/app-04-comments-shop.js:4890)
- **Domaine** : Bobines et stories · **Nature** : friction · **Type** : observation
- **Preuve** : Profil de Léa → Bobines → bobine → Fermer : écran « Mon profil », aucune modale (sonde bobines-05, capture BOB-052).
- **Problème** : Le profil visité disparaît.
- **Situation déclenchante** : Regarder les bobines de quelqu'un depuis son profil.
- **Conséquence pour l'utilisateur** : Il faut rechercher la personne pour revenir à elle (suivre, écrire).
- **Proposition** : Mémoriser le profil d'origine et le rouvrir à la fermeture du lecteur.
- **Visuels** : — · **Surfaces** : BOB-052
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Historique (pushOverlayHistory) : un seul retour doit suffire.
- **Critère d'acceptation** : Après Fermer, la fiche de Léa est de nouveau affichée.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-05-config-profil.js`

### BOB-C11 — Live : le nom de la personne en direct n'apparaît pas

- **Emplacement** : Visionneuse live — .vlive-topbar (styles.css:6468-6495 ; app-05:5084-5102)
- **Domaine** : Bobines et stories · **Nature** : clarte · **Type** : observation
- **Preuve** : À 390 px, .vlive-name (flex:1, nowrap) est réduit à 0 ; « EN DIRECT » et « 👁 0 » passent sur deux lignes ; Suivre 61 × 34 px, ↗ 40 × 40 px (sonde bobines-05).
- **Problème** : On regarde un direct sans savoir de qui.
- **Situation déclenchante** : Spectateur sur mobile.
- **Conséquence pour l'utilisateur** : Confiance et envie de suivre affaiblies.
- **Proposition** : Barre sur deux lignes : statut en haut, nom en clair dessous ; Suivre et partager à 44 px.
- **Visuels** : [BOB-040](galerie/index.html#/surface/BOB-040) · **Surfaces** : BOB-040
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Position de .vlive-title-pill.
- **Critère d'acceptation** : À 360 px, le nom du diffuseur est entièrement lisible et toutes les commandes font ≥ 44 px.
- **Fichiers probables** : `styles.css`

### BOB-C12 — Échap ou retour ferment tout le lecteur au lieu du panneau ou de la feuille ouverte au-dessus

- **Emplacement** : closeCurrentOverlay js/app-02-state-utils.js:3764 ; keydown js/app-06-reels-partage.js:1015
- **Domaine** : Bobines et stories · **Nature** : friction · **Type** : hypothese
- **Preuve** : D'après le code : les bobines sont fermées avant la modale et le panneau de commentaires n'est pas testé ; Échap déclenche à la fois closeModal (app-08:72) et closeReels.
- **Problème** : Revenir en arrière depuis les commentaires ou le partage quitte la bobine.
- **Situation déclenchante** : Geste retour / Échap avec un panneau ouvert.
- **Conséquence pour l'utilisateur** : Perte de la bobine en cours (et du commentaire tapé).
- **Proposition** : Fermer d'abord le panneau de commentaires puis la modale, et seulement ensuite le lecteur.
- **Visuels** : — · **Surfaces** : BOB-086
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Pile d'historique des overlays.
- **Critère d'acceptation** : Panneau ouvert : un retour le ferme et laisse la bobine à l'écran.
- **Fichiers probables** : `js/app-02-state-utils.js`, `js/app-06-reels-partage.js`

### BOB-C22 — Les bobines d'exemple se mêlent à celles des comptes, sans marque et sans fin de liste

- **Emplacement** : buildReels js/app-05-config-profil.js:2867 ; compteur #reelsCounter
- **Domaine** : Bobines et stories · **Nature** : clarte · **Type** : observation
- **Preuve** : Compte connecté : 27 bobines dont 20 d'exemple (sonde bobines-01) ; dans le lecteur aucune n'est marquée « Exemple » ; en fin de liste seule la flèche ↓ grise.
- **Problème** : On ne sait pas ce qui est réel.
- **Situation déclenchante** : Compte avec peu de bobines réelles.
- **Conséquence pour l'utilisateur** : Confiance : on peut vouloir rencontrer une personne d'exemple.
- **Proposition** : Étiquette « Exemple PASSIO » sur ces bobines (comme dans le fil) et carte de fin « Tu as tout vu ».
- **Visuels** : — · **Surfaces** : BOB-010, BOB-016
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Chaque bobine d'exemple porte la mention « Exemple » dans le lecteur.
- **Fichiers probables** : `js/app-05-config-profil.js`

### IRL-C03 — Le seul chemin vers « ma position » est enfoui à trois gestes, dans la vue Filtre  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Filtre › Où ? › Modifier › Utiliser ma position (ui-v4a5-filtres.js:355 ; openIrlCitySelector app-07:1374)
- **Domaine** : Rencontres IRL · **Nature** : friction · **Type** : jugement
- **Preuve** : Le choix « jamais de géolocalisation automatique » est documenté (first-run.js:2392) et l'aide visiteur l'annonce (IRL-063). Mais aucune porte n'existe dans la liste : il faut Filtre → Modifier → Utiliser ma position (IRL-047, IRL-051).
- **Problème** : La décision de ne pas demander la position est bonne, mais rien n'invite à la donner ni à choisir sa ville là où la distance compte.
- **Situation déclenchante** : Toute personne qui consulte la liste sans avoir ouvert Filtre.
- **Conséquence pour l'utilisateur** : La promesse « près de moi » n'est jamais tenue pour qui ne fouille pas ; la liste reste nationale.
- **Proposition** : Une ligne-bouton au-dessus de la liste, tant qu'aucune référence n'existe : « Choisis ta ville pour voir les distances » (ouvre le même sélecteur, qui garde « Utiliser ma position »). Disparaît dès qu'une référence existe.
- **Visuels** : [IRL-010](galerie/index.html#/surface/IRL-010) · **Surfaces** : IRL-010, IRL-047, IRL-051
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : IRL-C02 (même maquette).
- **Risque de régression** : Aucune demande de position ne doit partir sans geste : verrou ONB-11 à conserver.
- **Critère d'acceptation** : Sans référence, un bouton ≥ 44 px au-dessus de #eventList ouvre le sélecteur de lieu ; aucune permission n'est demandée à l'ouverture de l'écran.
- **Fichiers probables** : `js/ui-v4a2-cartes.js`, `styles.css`

### IRL-C04 — « Aucune position » affiché, mais la distance et le libellé « Position actuelle » se réfèrent à Paris  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Vue Filtre › Où ? et Distance maximale (ui-v4a5-filtres.js:340-380 ; _filterIrlEvents app-07:2627-2636)
- **Domaine** : Rencontres IRL · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : IRL-042 : « Choisir une ville · Aucune position », puis « 5 km » → « Afficher 6 résultats » (des activités parisiennes). IRL-053 (refus) : la même carte devient « Paris (par défaut) · Position actuelle ».
- **Problème** : Le filtre agit autour d'un point que l'écran dit ne pas avoir, puis appelle ce point « Position actuelle ».
- **Situation déclenchante** : Choisir une distance sans ville ni position ; refuser la position.
- **Conséquence pour l'utilisateur** : Résultats incompréhensibles (« 5 km » de quoi ?) pour qui n'habite pas Paris.
- **Proposition** : Sans référence réelle : pastilles de distance désactivées + phrase « Choisis une ville ou autorise ta position pour filtrer par distance ». Après un refus : « Aucune position » (jamais « Position actuelle » pour le repli).
- **Visuels** : [IRL-042](galerie/index.html#/surface/IRL-042) · **Surfaces** : IRL-040, IRL-042, IRL-053
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Un filtre distance déjà actif au moment où la référence disparaît doit être levé proprement (compteur, pastille).
- **Critère d'acceptation** : Sans référence, les boutons 5/10/25/50 km sont désactivés avec la phrase d'aide ; après refus, la carte « Où ? » ne contient pas « Position actuelle ».
- **Fichiers probables** : `js/ui-v4a5-filtres.js`, `js/app-07-ia-explore-irl.js`

### IRL-C05 — Filtres combinés sans résultat : pied grisé, sans explication ni issue

- **Emplacement** : Vue Filtre › pied fixe #v4a5Pied / #v4a5Done (ui-v4a5-filtres.js)
- **Domaine** : Rencontres IRL · **Nature** : friction · **Type** : observation
- **Preuve** : IRL-043 (m390, m360) : 5 km + Aujourd'hui + Soir → bouton « Aucun résultat » désactivé (2,87:1) ; « Tout effacer » est en haut de la vue, hors écran.
- **Problème** : La personne ne sait ni quel filtre bloque, ni comment sortir sans remonter.
- **Situation déclenchante** : Toute combinaison à zéro résultat.
- **Conséquence pour l'utilisateur** : Abandon de la recherche ou retour à la liste vide (IRL-044).
- **Proposition** : Dans le pied : une phrase qui nomme les choix actifs (« Aucune activité ne coche « 5 km » + « Aujourd'hui » + « Soir ». Retire un choix. ») et un bouton « Tout effacer » à côté du bouton grisé.
- **Visuels** : [IRL-043](galerie/index.html#/surface/IRL-043) · **Surfaces** : IRL-043
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le pied est recopié de window._irlResultCount : ne pas créer un second comptage.
- **Critère d'acceptation** : Avec 0 résultat, le pied visible contient un bouton « Tout effacer » ≥ 44 px et une phrase citant les filtres actifs.
- **Fichiers probables** : `js/ui-v4a5-filtres.js`, `styles.css`

### IRL-C06 — Le prix d'une activité payante n'apparaît plus sur la carte

- **Emplacement** : Carte d'activité V2 — ligneMonde (js/ui-v4a2-cartes.js:362-381)
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : IRL-014 : activité à 15 € → « 2 participants · 6 places restantes », aucun prix ; la carte historique l'affichait (app-07:3021).
- **Problème** : Une information de décision (payant ou non) n'est visible qu'en ouvrant la fiche.
- **Situation déclenchante** : Toute activité au prix renseigné.
- **Conséquence pour l'utilisateur** : Ouvertures de fiche inutiles ; surprise au moment de s'inscrire.
- **Proposition** : Ajouter « · 15 € » (fmtEventPrice) à la ligne des places ; rien pour une activité gratuite.
- **Visuels** : [IRL-014](galerie/index.html#/surface/IRL-014) · **Surfaces** : IRL-014
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Signature de la carte (ui-v4a2-cartes.js:512) à étendre si le prix peut changer sans rendu.
- **Critère d'acceptation** : Une activité avec price = 15 affiche « 15 € » sur sa carte ; price = 0 n'affiche rien.
- **Fichiers probables** : `js/ui-v4a2-cartes.js`

### IRL-C09 — Commandes de la carte sous 44 px (zoom 29 px, replier / plein écran 38 px)

- **Emplacement** : Vue Carte — .maplibregl-ctrl-zoom-in/out, .irl-map-collapse, .irl-map-expand
- **Domaine** : Rencontres IRL · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures sonde 03 : zoom 29 × 29 px, replier 38 × 38, plein écran 38 × 38 (IRL-030).
- **Problème** : Cibles trop petites, au pouce, sur une carte où un geste raté déplace la vue.
- **Situation déclenchante** : Utilisation à une main.
- **Conséquence pour l'utilisateur** : Erreurs de toucher.
- **Proposition** : Porter les quatre commandes à 44 × 44 px.
- **Visuels** : [IRL-030](galerie/index.html#/surface/IRL-030) · **Surfaces** : IRL-030
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Chevauchement avec les marqueurs du coin : vérifier à 360 px.
- **Critère d'acceptation** : À 360 px, chaque commande de carte mesure ≥ 44 × 44 px.
- **Fichiers probables** : `styles.css`

### IRL-C11 — Rouge de l'activité annulée sous le contraste AA (3,23:1 et 3,76:1)

- **Emplacement** : .event-card-banner.cancelled (styles.css:6825), .v4a2-etat-annule (styles.css:9004)
- **Domaine** : Rencontres IRL · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesure IRL-016--m390 : bandeau « Événement annulé par l'organisateur » 3,23:1, pastille « Annulé » 3,76:1 (#ef4444).
- **Problème** : L'information la plus importante de la carte est la moins lisible.
- **Situation déclenchante** : Activité annulée.
- **Conséquence pour l'utilisateur** : Risque de se déplacer pour rien.
- **Proposition** : #B42318 (rouge foncé) pour le texte du bandeau et de la pastille.
- **Visuels** : [IRL-016](galerie/index.html#/surface/IRL-016) · **Surfaces** : IRL-016
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Bandeau et pastille « Annulé » ≥ 4,5:1.
- **Fichiers probables** : `styles.css`

### IRL-C14 — Les exemples sont mêlés aux vraies activités et occupent la liste même quand le réel existe  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Fusion state.seed.events (app-08:9881) ; tri par date seul (_sortIrlEvents app-07:2663)
- **Domaine** : Rencontres IRL · **Nature** : friction · **Type** : jugement
- **Preuve** : Jeu « normal » (11 activités réelles, dont 7 à Lyon) : 9 des 12 premières cartes sont des exemples ailleurs en France (sonde 04). Jeu « gros » (51 réelles) : « Afficher plus (73 restants) », exemples toujours intercalés (IRL-056).
- **Problème** : Les rencontres réelles, rares et précieuses, sont noyées dans un décor.
- **Situation déclenchante** : Toute liste où existent des activités réelles.
- **Conséquence pour l'utilisateur** : On fait défiler des exemples inactifs pour trouver la seule vraie activité de sa ville ; la boucle Fil → IRL s'affaiblit.
- **Proposition** : Activités réelles d'abord ; les exemples regroupés après, sous un intertitre « Exemples pour découvrir », et retirés de la liste dès que les activités réelles dépassent une page.
- **Visuels** : [IRL-055](galerie/index.html#/surface/IRL-055) · **Surfaces** : IRL-010, IRL-055, IRL-056
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Règle produit à arbitrer par Benjamin (seuil de retrait).
- **Risque de régression** : Carte et liste doivent rester alimentées par le même filtrage (_filterIrlEvents).
- **Critère d'acceptation** : Avec au moins une activité réelle, aucune carte d'exemple ne précède une carte réelle.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C52 — Après l'inscription, les gestes utiles restent tout en bas de la fiche

- **Emplacement** : Fiche › « Autres actions » — js/ui-v4b-fiche.js:389-431 (classement « pratique » → section « secondaire »)
- **Domaine** : Rencontres IRL · **Nature** : friction · **Type** : jugement
- **Preuve** : Captures IRL-103 et IRL-110 : « Ajouter au calendrier » et « Inviter » sont sous les commentaires, dans « Autres actions » ; le pied après inscription ne propose que « Retirer ma participation ». Prolonge PCS-C03 (aucune confirmation ni suite).
- **Problème** : Une fois inscrite, la personne ne voit ni comment se préparer (calendrier, itinéraire) ni comment entraîner quelqu'un (inviter).
- **Situation déclenchante** : Juste après « Je participe ».
- **Conséquence pour l'utilisateur** : Moins de rappels personnels, moins d'invitations : l'activité se remplit moins et l'on oublie d'y aller.
- **Proposition** : Dans l'état « inscrit », le pied montre : confirmation datée, « Écrire aux participants » (plein), puis « Ajouter au calendrier », « Itinéraire », « Inviter » ; ces fonctions existent déjà (aucune nouvelle).
- **Visuels** : [IRL-110](galerie/index.html#/surface/IRL-110), [IRL-103](galerie/index.html#/surface/IRL-103) · **Surfaces** : IRL-110, IRL-103, IRL-193
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : IRL-C50 ; IRL-C51 pour que « Écrire aux participants » aboutisse.
- **Risque de régression** : Hauteur du pied fixe sur 320–360 px : vérifier qu'il ne masque pas plus d'un tiers de l'écran.
- **Critère d'acceptation** : Après « Je participe », « Ajouter au calendrier » et « Inviter » sont visibles sans défiler, à 360 px.
- **Fichiers probables** : `js/ui-v4b-fiche.js`, `styles.css`

### IRL-C53 — L'organisatrice voit « ✓ Je participe / Retirer ma participation » sur sa propre activité  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Fiche de MON activité › pied — js/ui-v4b-fiche.js:579-631 (aucune branche organisation) ; « Gérer » classé en « Autres actions » (ui-v4b-fiche.js:430)
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture IRL-135 : pied « ✓ Je participe » + « Retirer ma participation » ; « Gérer », « QR d'accueil », « Affiche », « Discussion » répartis dans trois sections (IRL-136).
- **Problème** : L'organisatrice peut se retirer de sa propre activité d'un geste, et ses outils sont dispersés.
- **Situation déclenchante** : Ouvrir sa propre activité (souvent juste après l'avoir créée, ou le jour J).
- **Conséquence pour l'utilisateur** : Risque de se compter hors de sa propre activité ; le jour J, chercher le QR ou le message groupé fait perdre du temps.
- **Proposition** : Pour l'organisation, le pied montre « Écrire aux participants » et « Gérer l'activité », plus un état « Tu organises · N participants » ; « Gérer » regroupe modifier, prévenir, co-organisateurs, QR, affiche, annuler.
- **Visuels** : [IRL-135](galerie/index.html#/surface/IRL-135) · **Surfaces** : IRL-135, IRL-136, IRL-143
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : `_canManageEvent` (app-07) pour la condition.
- **Risque de régression** : Co-organisateurs : même pied que l'organisatrice (droit déjà vérifié par la RLS).
- **Critère d'acceptation** : Sur sa propre activité, le pied ne contient pas « Retirer ma participation » et donne accès à « Gérer » en un appui.
- **Fichiers probables** : `js/ui-v4b-fiche.js`

### IRL-C54 — Refus « complète » : le message propose la liste d'attente, le bouton propose encore « Je participe »

- **Emplacement** : Fiche › pied après refus serveur — js/app-07-ia-explore-irl.js:3575-3583 (`annuler` rétablit l'état précédent sans relire le compteur)
- **Domaine** : Rencontres IRL · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Capture IRL-122 : la 5e place est prise pendant que la fiche est ouverte ; toast « Activité complète — tu peux rejoindre la liste d'attente », pied « Je participe », bloc « 4 participants · 1 place restante ».
- **Problème** : L'écran garde un compteur périmé ; un nouvel appui retente « going » et se fait refuser de nouveau.
- **Situation déclenchante** : Dernière place prise entre l'ouverture de la fiche et l'appui (activités populaires).
- **Conséquence pour l'utilisateur** : Boucle de refus ; la personne n'entre ni dans l'activité ni dans la liste d'attente.
- **Proposition** : Sur le motif `complete`, relire les compteurs (`supaLireParticipants`) et repeindre : « complet », bouton « Rejoindre la liste d'attente », phrase « La dernière place vient d'être prise ».
- **Visuels** : [IRL-122](galerie/index.html#/surface/IRL-122) · **Surfaces** : IRL-122
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Verrous ROB-02 / IRL-05 (annulation de l'optimiste) ; ne pas annoncer d'inscription.
- **Critère d'acceptation** : Après un refus `activite_complete`, le pied affiche « Rejoindre la liste d'attente » et le bloc « complet », sans rechargement.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C55 — « Sur liste d'attente » ne dit pas ce qui va se passer

- **Emplacement** : Fiche › pied en liste d'attente — js/ui-v4b-fiche.js:65, 608-616
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture IRL-121 : « Sur liste d'attente » + « Retirer ma participation ». La feuille à trois états dit pourtant « Tu seras inscrit·e automatiquement si une place se libère » (app-07:4025).
- **Problème** : La personne ne sait pas si elle doit revenir vérifier, ni comment elle sera prévenue ; le retrait parle de « participation » alors qu'elle n'en a pas.
- **Situation déclenchante** : Inscription sur une activité complète.
- **Conséquence pour l'utilisateur** : Inquiétude, retours répétés sur la fiche, ou abandon de la liste.
- **Proposition** : « Tu es sur la liste d'attente — si une place se libère, tu es inscrit·e automatiquement et prévenu·e » ; « Quitter la liste d'attente ». Pas de rang affiché (la base ne le montre plus aux tiers, C-04).
- **Visuels** : [IRL-121](galerie/index.html#/surface/IRL-121) · **Surfaces** : IRL-121, IRL-186
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Libellés vérifiés par les e2e UI-4B.
- **Critère d'acceptation** : En liste d'attente, le pied contient la phrase « inscrit·e automatiquement » et le lien « Quitter la liste d'attente ».
- **Fichiers probables** : `js/ui-v4b-fiche.js`

### IRL-C57 — Activité annulée : une petite pastille, et le rendez-vous a toujours l'air valable

- **Emplacement** : Fiche annulée — app-07:4405 (pastille `.event-detail-urgency.cancelled`), bloc `.v4b-rdv` inchangé
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture IRL-132 : pastille rose d'une ligne, tuile corail, « 2 participants » ; pied « Événement annulé » grisé ; rien ne dit que MA participation tombe.
- **Problème** : L'information la plus importante est la moins visible.
- **Situation déclenchante** : Inscrit·e qui rouvre la fiche (souvent depuis la notification d'annulation).
- **Conséquence pour l'utilisateur** : Risque de se déplacer pour rien si l'on lit la carte du rendez-vous plutôt que la pastille.
- **Proposition** : Bandeau d'annulation en tête : « Activité annulée par <organisateur>. Ta participation est annulée, rien d'autre à faire. » ; rendez-vous barré et éteint.
- **Visuels** : [IRL-132](galerie/index.html#/surface/IRL-132) · **Surfaces** : IRL-132
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Sur une activité annulée, le premier texte lisible sous le titre dit l'annulation et ses conséquences ; la date est barrée.
- **Fichiers probables** : `js/ui-v4b-fiche.js`, `styles.css`

### IRL-C58 — Deux lignes « Adresse » qui se contredisent quand l'adresse est réservée  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Fiche › Infos pratiques — js/app-07-ia-explore-irl.js:4375-4385
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture IRL-134 : « Adresse : 69001, Lyon » + « Voir sur Google Maps → » (vers la ville entière), puis « Lieu », puis « Adresse exacte : Communiquée une fois inscrit·e ».
- **Problème** : La zone publique est présentée comme une adresse, avec un lien de carte qui ne mène nulle part d'utile.
- **Situation déclenchante** : Toute activité dont l'adresse n'est lisible que par les inscrits.
- **Conséquence pour l'utilisateur** : On croit l'adresse incomplète ou fausse ; on peut partir vers le mauvais endroit.
- **Proposition** : Une ligne « Lieu » : nom du lieu + zone publique, et « L'adresse exacte s'affiche ici dès que tu participes » ; pas de lien de carte tant que l'adresse n'est pas connue. Règle de confidentialité inchangée.
- **Visuels** : [IRL-134](galerie/index.html#/surface/IRL-134) · **Surfaces** : IRL-134
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Lecture `supaLireAdresses` (app-08:5902) inchangée.
- **Risque de régression** : Ne jamais afficher l'adresse avant l'inscription (verrous de la migration adresses).
- **Critère d'acceptation** : Pour un non-inscrit, une seule ligne mentionne le lieu, sans lien Google Maps ; l'adresse apparaît après inscription.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C60 — Annuler et supprimer une activité : style ordinaire et `confirm()` natifs

- **Emplacement** : Gérer › `openEventManage` app-07:6677-6701 ; `toggleCancelEvent` 6844-6862, `deleteEventConfirm` 6864-6897, `cancelEventSeries` 6811-6839
- **Domaine** : Rencontres IRL · **Nature** : friction · **Type** : observation
- **Preuve** : Capture IRL-143 : « Annuler l'événement » a le même style que « Modifier » ; d'après le code, annuler / supprimer / annuler la série passent par `confirm()` natif (non capturable). Contraste « Supprimer définitivement » 3,76:1.
- **Problème** : L'action qui prévient tous les inscrits ressemble à une action anodine ; la confirmation sort de l'identité et ne dit pas combien de personnes seront touchées.
- **Situation déclenchante** : Imprévu de dernière minute de l'organisateur.
- **Conséquence pour l'utilisateur** : Annulation par erreur, ou suppression au lieu d'annulation (les inscrits perdent l'historique).
- **Proposition** : Séparer et signaler « Annuler l'activité » ; suppression en lien discret ; confirmation dans l'application avec le nombre de personnes prévenues et un message facultatif ; recommander l'annulation s'il y a des inscrits.
- **Visuels** : [IRL-143](galerie/index.html#/surface/IRL-143) · **Surfaces** : IRL-143, IRL-180, IRL-181
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Verrous IRL-06 / IRL-13 (verdict serveur, notification des trois listes) à conserver.
- **Critère d'acceptation** : Aucun `confirm(` dans le parcours d'annulation ; la confirmation affiche le nombre de personnes prévenues.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C61 — Modifier une activité rouvre l'ancien formulaire

- **Emplacement** : Gérer › Modifier → `openCreateEvent(editId)` app-07:6431-6620 ; lot UI-6A0 `js/ui-v6a0-activite.js` (n'agit qu'à la création)
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : Captures IRL-160 et IRL-164 : création = « Créer une activité », couverture 16:9, description en 3e ; édition = « Modifier l'événement », en-têtes « PHOTO DE COUVERTURE / INFOS PRINCIPALES / DÉTAILS », couverture 140 px, description en dernier.
- **Problème** : Deux formulaires pour la même activité ; l'organisatrice ne retrouve pas ses champs au même endroit.
- **Situation déclenchante** : Corriger une heure, un lieu, un nombre de places.
- **Conséquence pour l'utilisateur** : Temps perdu, impression d'application inachevée.
- **Proposition** : Appliquer la même réorganisation UI-6A0 en édition ; titre « Modifier l'activité » ; bouton « Enregistrer » avec la même garde contre le double envoi.
- **Visuels** : [IRL-164](galerie/index.html#/surface/IRL-164), [IRL-160](galerie/index.html#/surface/IRL-160) · **Surfaces** : IRL-164, IRL-160
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Lot UI-6A0 (garde `editId`).
- **Risque de régression** : Les identifiants de champs relus par `submitEvent` ; verrous tests/e2e/ui-v6a0-*.spec.js.
- **Critère d'acceptation** : « Modifier » affiche la même structure que « Créer » (couverture, titre, passion, description en tête).
- **Fichiers probables** : `js/ui-v6a0-activite.js`, `js/app-07-ia-explore-irl.js`

### IRL-C63 — Avis, message groupé et invitations sont annoncés sans lire le résultat

- **Emplacement** : `submitEventFeedback` app-07:7683-7704 ; `_sendEventBroadcast` 6924-6931 ; `inviteToEvent` 7461-7474
- **Domaine** : Rencontres IRL · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : D'après le code : « Merci pour ton retour » avant `supaRateEvent` (non attendu) ; « Message envoyé aux inscrits » sans verdict de `supaInsertNotif` ; bouton « ✓ Invité » et « Invitation envoyée » avant toute écriture. Même famille que ROB-02, déjà corrigée pour l'inscription.
- **Problème** : Un refus (réseau, droits, blocage) reste invisible : on croit avoir noté, prévenu, invité.
- **Situation déclenchante** : Réseau faible, refus RLS, personne bloquée.
- **Conséquence pour l'utilisateur** : Des participants ne sont pas prévenus d'un changement de lieu alors que l'organisatrice croit l'avoir fait.
- **Proposition** : Attendre le verdict des écritures, compter les réussites (« Message envoyé à 3 personnes sur 4 ») et dire les échecs, comme l'annulation de série (IRL-13).
- **Visuels** : [IRL-145](galerie/index.html#/surface/IRL-145), [IRL-148](galerie/index.html#/surface/IRL-148) · **Surfaces** : IRL-145, IRL-148, IRL-142, IRL-194
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Valeur de retour de `supaInsertNotif` / `supaRateEvent` (app-08).
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Avec une écriture refusée par le faux serveur, aucun message de succès n'est affiché et l'échec est dit.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C66 — Activité d'exemple : bouton corail « Je participe » actif, refus seulement après le geste

- **Emplacement** : Fiche d'une activité du socle de démonstration — `PassioFirstRun.participationPossible` (garde app-07:3482-3484), pied ui-v4b-fiche.js:619-626
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : Captures IRL-170/171 (mode demo) : rien n'indique « exemple » sur la fiche ; après l'appui, toast « Cette activité est un exemple : elle n'accueille pas de vraie participation. »
- **Problème** : La fiche d'exemple ressemble en tout point à une vraie rencontre jusqu'au refus.
- **Situation déclenchante** : Découverte de l'application avant d'avoir du contenu réel.
- **Conséquence pour l'utilisateur** : Déception au moment exact où l'on voulait passer au réel ; doute sur les vraies activités.
- **Proposition** : Pastille « Exemple » dans le bloc rendez-vous et pied neutre « Exemple — participation désactivée » (avec, si pertinent, « Voir les vraies activités près de toi »).
- **Visuels** : [IRL-170](galerie/index.html#/surface/IRL-170), [IRL-171](galerie/index.html#/surface/IRL-171) · **Surfaces** : IRL-170, IRL-171
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Marqueur d'exemple déjà connu de `PassioFirstRun`.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Sur une activité d'exemple, le pied n'est pas corail et dit « exemple » avant tout appui.
- **Fichiers probables** : `js/ui-v4b-fiche.js`

### MSG-C07 — La recherche « ou un message » ne connaît que le dernier message de chaque conversation

- **Emplacement** : Écran Messages › recherche — renderMessages (js/app-04-comments-shop.js:5484–5490) ; supaLoadMyConversations ne charge qu'un message (js/app-08-ui-modals-tour.js:7210–7230)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 06c : « accueil » (dernier message) → trouvé ; « capodastre » (message plus ancien du même compte) → « Aucun résultat ». Le champ n'a pas de bouton d'effacement ; la recherche reste posée après un aller-retour sur un autre onglet (champ « zzzz », liste vide). La ligne trouvée ne montre pas le passage.
- **Problème** : Le champ promet de chercher dans les messages et répond « Aucun résultat » pour un mot qui existe.
- **Situation déclenchante** : Recherche d'un mot ancien dans une conversation non rouverte depuis le démarrage.
- **Conséquence pour l'utilisateur** : Information jugée perdue ; en revenant sur l'onglet, liste vide tant que le champ n'est pas vidé à la main.
- **Proposition** : Sans changer le moteur : libellé « Rechercher une conversation », message vide qui dit la portée et renvoie à « Rechercher dans la conversation », bouton × de 44 px, recherche vidée en quittant l'écran. Une vraie recherche de messages serait une fonction serveur à part.
- **Visuels** : [MSG-034](galerie/index.html#/surface/MSG-034) · **Surfaces** : MSG-034, MSG-033
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le champ est déplacé par ui-v6a-messages.js (id et oninput à conserver).
- **Critère d'acceptation** : Le placeholder ne promet plus les messages ; un × vide le champ et rend la liste ; revenir sur l'onglet affiche la liste complète.
- **Fichiers probables** : `index.html`, `js/app-04-comments-shop.js`, `js/ui-v6a-messages.js`, `styles.css`

### MSG-C10 — Cibles tactiles sous 44 px dans toute la messagerie

- **Emplacement** : En-tête (.conv-fp-back, .conv-action-btn — styles.css:5936–5961), fenêtre membres, comptes bloqués, création de groupe, bandeau hors ligne
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures (sondes 03, 04, 05, 09, 10) : retour 36 × 36 px ; ⋮, membres, appels : boîte 34 × 34, zone sondée 38 × 46 ; « Retirer » 55 × 26 ; « + Ajouter » 73 × 27 ; « Débloquer » 81 × 29 ; onglets Membres / Ajouter 35 px ; case de passion 32 px ; fermeture de feuille 34 × 34 ; × du bandeau hors ligne 23 × 23 ; point non lu 12 × 9 (non interactif).
- **Problème** : Les commandes les plus fréquentes de la messagerie sont plus petites que le doigt.
- **Situation déclenchante** : Usage à une main, en marchant.
- **Conséquence pour l'utilisateur** : Erreurs de toucher ; pour « Retirer », erreur aux dépens d'un tiers.
- **Proposition** : Boîtes de 44 × 44 px (icône inchangée), boutons de liste à 44 px de haut.
- **Visuels** : [MSG-020](galerie/index.html#/surface/MSG-020), [MSG-012](galerie/index.html#/surface/MSG-012), [MSG-013](galerie/index.html#/surface/MSG-013) · **Surfaces** : MSG-020, MSG-012, MSG-013, MSG-014, MSG-010, MSG-040, MSG-038, MSG-050, MSG-001
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Bloc « cibles 44 px » de fin de styles.css (lignes 12262–12280) : y ajouter, ne pas dupliquer.
- **Critère d'acceptation** : À 360 px, chaque commande citée mesure ≥ 44 × 44 px par elementFromPoint.
- **Fichiers probables** : `styles.css`, `js/app-05-config-profil.js`, `js/app-04-comments-shop.js`, `index.html`

### MSG-C11 — Changer la photo du groupe : succès annoncé, rien ne change, erreur JavaScript

- **Emplacement** : Groupe › photo — pickGroupPhoto (js/app-05-config-profil.js:2107–2146)
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 04 : après choix d'une image, toast « Photo du groupe mise à jour », erreur « renderConvList is not defined » (fonction inexistante, ligne 2134), avatar de la fenêtre inchangé ; le code cherche `#modal-backdrop` et `#convFpHead .msg-avatar`, qui n'existent pas. La photo n'est écrite que dans la copie locale (data URL) : les autres membres ne la voient pas, et elle se perd au démarrage (MSG-C01).
- **Problème** : La photo choisie n'apparaît pas, puis disparaît.
- **Situation déclenchante** : Tout membre qui touche l'avatar du groupe.
- **Conséquence pour l'utilisateur** : Geste perdu, annoncé réussi.
- **Proposition** : Corriger les trois références, repeindre liste, en-tête et fenêtre ; tant que la photo n'est pas déposée côté serveur, dire « visible sur cet appareil ».
- **Visuels** : [MSG-016](galerie/index.html#/surface/MSG-016) · **Surfaces** : MSG-016
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Dépôt serveur de la photo pour un vrai partage (lot à part).
- **Risque de régression** : Échappement `_cssUrl` de la photo de groupe (audit-echappement).
- **Critère d'acceptation** : Après le choix : aucune erreur de page, avatar à jour dans la fenêtre, l'en-tête et la liste.
- **Fichiers probables** : `js/app-05-config-profil.js`

### MSG-C12 — Aperçus techniques dans la liste : « [DOC] … », « [AUDIO] … », adresse Google Maps

- **Emplacement** : Liste › aperçu — renderMessages (js/app-04-comments-shop.js:5554–5556), enveloppes écrites par js/app-09-boot-pwa.js:1396–1402 et 1501
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture MSG-002 : « [DOC] topo-falaise.pdf », « [AUDIO] maquette-refrain.mp3 », « Toi : 📍 Ma position : https://maps.google.com/?q=45.75000,4.85000 ». Photo, vidéo, vocal et GIF sont, eux, rendus en mots.
- **Problème** : Trois types de pièce jointe s'affichent avec leur étiquette interne.
- **Situation déclenchante** : Dernier message = document ou fichier audio reçu du serveur, ou position.
- **Conséquence pour l'utilisateur** : Liste moins lisible, impression d'inachevé.
- **Proposition** : Passer l'aperçu par _msgPreviewText (js/app-04-comments-shop.js:6326), qui traite déjà document et position, et y ajouter le fichier audio.
- **Visuels** : [MSG-002](galerie/index.html#/surface/MSG-002) · **Surfaces** : MSG-002
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : L'aperçu « Brouillon : » et « Toi : » doivent rester.
- **Critère d'acceptation** : Aucun aperçu ne commence par « [ » ni ne contient « http ».
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C13 — La ligne de conversation ne dit ni combien de non-lus, ni qu'elle est en sourdine

- **Emplacement** : Liste › ligne — .msg-badge (styles.css:5601–5614), nom (js/app-04-comments-shop.js:5599)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : jugement
- **Preuve** : Mesures (sonde 02) : point non lu de 12 × 9 px (ovale : largeur maximale 9 px + marges), nombre présent dans le DOM en taille 0 ; l'onglet affiche « 8 ». Nom en 800 (non lu) contre 700 (lu). Épingle = « 📌 » dans le texte du nom. Sourdine : aucun repère. 34 px vides entre la recherche et la première ligne. Nom long sur deux lignes.
- **Problème** : On voit qu'il y a du nouveau, pas combien ; on ne voit pas ce qui est coupé.
- **Situation déclenchante** : Liste avec plusieurs non-lus, groupes actifs.
- **Conséquence pour l'utilisateur** : Le compte de l'onglet ne se relie pas aux lignes ; on oublie qu'une conversation est en sourdine.
- **Proposition** : Pastille chiffrée de 20 px, épingle et cloche barrée en SVG, nom sur une ligne, espace ramené à 12 px.
- **Visuels** : [MSG-001](galerie/index.html#/surface/MSG-001), [MSG-030](galerie/index.html#/surface/MSG-030) · **Surfaces** : MSG-001, MSG-030
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C02 pour que la sourdine ait un sens.
- **Risque de régression** : Le point discret est un choix du 2026-07-20 (commentaire styles.css:5572) : à valider avec Benjamin.
- **Critère d'acceptation** : Une ligne à 5 non-lus affiche « 5 » ; une ligne en sourdine porte une icône nommée « Notifications coupées ».
- **Fichiers probables** : `styles.css`, `js/app-04-comments-shop.js`

### MSG-C14 — Une conversation archivée et non lue fait compter l'onglet sans rien montrer dans la liste

- **Emplacement** : Écran Messages › bandeau « Archivées » (js/app-04-comments-shop.js:5474–5482), _convNonLus (js/app-04-comments-shop.js:3723–3727)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 08 : conversation archivée avec 2 non-lus → onglet « 9 », liste visible sans elle, bandeau « Archivées (1) » sans marque ; un nouveau message y arrive : elle reste archivée, l'onglet passe à « 9+ », toujours rien dans la liste. La vue des archives garde le titre « Messages ».
- **Problème** : Le badge annonce des messages qu'on ne trouve pas.
- **Situation déclenchante** : Conversation archivée qui reçoit un message.
- **Conséquence pour l'utilisateur** : Recherche vaine dans la liste ; message manqué.
- **Proposition** : Porter les non-lus sur la rangée « Archivées » ; titre « Archivées » avec retour dans la vue.
- **Visuels** : [MSG-030](galerie/index.html#/surface/MSG-030), [MSG-031](galerie/index.html#/surface/MSG-031) · **Surfaces** : MSG-030, MSG-031, MSG-072
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C01.
- **Risque de régression** : Le bandeau est réécrit à chaque rendu (innerHTML).
- **Critère d'acceptation** : Archivée avec 2 non-lus : la rangée « Archivées » affiche 2 ; la vue des archives est titrée « Archivées ».
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/ui-v6a-messages.js`, `styles.css`

### MSG-C15 — Un message reçu compte deux fois dans le badge de l'application

- **Emplacement** : updateAppBadge (js/app-08-ui-modals-tour.js:2125–2134) : notifications non lues + messages non lus
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 08 : un message entrant → onglet +1, cloche +1, titre « (10) PASSIO » pour 9 non-lus de messagerie ; après 6 messages : onglet 14, cloche 6, titre « (20) ».
- **Problème** : Chaque message crée une notification de cloche en plus du non-lu.
- **Situation déclenchante** : Toute réception hors de la conversation ouverte.
- **Conséquence pour l'utilisateur** : Le nombre sur l'icône de l'application dit le double de la réalité.
- **Proposition** : Ne pas compter deux fois : soit la cloche ignore le genre « message », soit le badge ne compte que la messagerie pour ce genre. À trancher avec le domaine Notifications.
- **Visuels** : — · **Surfaces** : MSG-072
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Domaine Notifications.
- **Risque de régression** : notifications-exemples.spec.js.
- **Critère d'acceptation** : Un message reçu augmente le badge de l'application de 1.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`

### MSG-C16 — Cinq fonds de conversation sur six sont sombres

- **Emplacement** : Fond de conversation — CONV_BGS (js/app-09-boot-pwa.js:1855–1862)
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Capture MSG-024 : fond « Violet » (#2A1A4A → #160D2A) ; heures et date en #6E6987 : 3,0 à 3,6:1 calculés (seuil 4,5:1 pour 11 px). « Nuit » est #0A0A0F.
- **Problème** : Le sélecteur propose un mode sombre par conversation, que l'habillage ne suit pas.
- **Situation déclenchante** : Choix de tout fond autre que « Par défaut ».
- **Conséquence pour l'utilisateur** : Dates, heures et accusés de lecture presque invisibles.
- **Proposition** : Six fonds clairs dans la palette actuelle ; pas de fond sombre (mode sombre retiré du produit).
- **Visuels** : [MSG-023](galerie/index.html#/surface/MSG-023) · **Surfaces** : MSG-023, MSG-024
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C01 (le fond se perd au démarrage).
- **Risque de régression** : Une conversation qui porte déjà un fond sombre doit retomber sur « Par défaut ».
- **Critère d'acceptation** : Sur chacun des six fonds, l'heure d'une bulle atteint 4,5:1.
- **Fichiers probables** : `js/app-09-boot-pwa.js`

### MSG-C17 — Le panneau « Paramètres » : quatorze entrées en emoji, mal rangées

- **Emplacement** : Paramètres de conversation — openConvSettings (js/app-09-boot-pwa.js:1645–1713), styles.css:6280–6285
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : jugement
- **Preuve** : Captures MSG-021/022 : 14 entrées (877 px pour 784 visibles) ; « Supprimer la conversation » sous CONFIDENTIALITÉ ; « Effacer les messages » en gris #6E6987 (aspect inactif) ; rouge #EF4444 sur #F7F5FC : 3,5:1 ; « Archiver » 📥 et « Exporter » 📤 presque identiques ; « Accusés de lecture » est un réglage de tout le compte ; titre « Paramètres » sans nom ; icônes en emoji (la charte veut des SVG).
- **Problème** : On cherche, on hésite, les actions graves sont sous le pli et mal étiquetées.
- **Situation déclenchante** : Ouverture du panneau.
- **Conséquence pour l'utilisateur** : Réglage global changé sans le savoir ; action destructrice prise pour inactive.
- **Proposition** : Quatre groupes (Conversation, Contenu, Confidentialité, Supprimer), icônes SVG, sous-texte d'effet, nom en titre ; « Accusés de lecture » vers Options › Confidentialité.
- **Visuels** : [MSG-021](galerie/index.html#/surface/MSG-021) · **Surfaces** : MSG-021, MSG-022, MSG-026, MSG-074
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Les libellés sont lus par des tests (hasText) : garder les textes d'action.
- **Critère d'acceptation** : Le panneau tient sans défilement à 390 × 844 hors section « Supprimer » ; aucun emoji en icône ; texte rouge ≥ 4,5:1.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `styles.css`

### MSG-C18 — Six boîtes du navigateur pour les actions graves, aux textes incomplets

- **Emplacement** : confirm() / prompt() — js/app-09-boot-pwa.js:1726, 1758, 1807, 1820 ; js/app-05-config-profil.js:2467, 2484
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Textes relevés : « Effacer tous les messages ? », « Supprimer cette conversation ? », « Bloquer Malik Benali ?\nSes messages seront masqués et tu ne le suivras plus. », « Quitter ce groupe ? Tu ne recevras plus ses messages. », « 🔍 Rechercher dans la conversation : », « Description du groupe : ».
- **Problème** : Boîtes hors identité, qui ne disent pas la portée (pour moi seulement ? l'autre est-il prévenu ?).
- **Situation déclenchante** : Effacer, supprimer, bloquer, quitter, rechercher, décrire.
- **Conséquence pour l'utilisateur** : Décision prise sans connaître la conséquence ; sur une application installée, une boîte native peut être supprimée par le système.
- **Proposition** : Feuille de confirmation de l'application : titre, conséquence en une phrase (« Sur cet appareil seulement », « Elle ne sera pas prévenue »), bouton d'action nommé, Annuler ; champ dans une feuille pour la recherche et la description.
- **Visuels** : [MSG-021](galerie/index.html#/surface/MSG-021) · **Surfaces** : MSG-070, MSG-022, MSG-041
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Les suites e2e posent `window.confirm = () => true` : à adapter.
- **Critère d'acceptation** : Aucune de ces six actions n'appelle confirm() ni prompt().
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `js/app-05-config-profil.js`

### MSG-C19 — L'état vide donne une consigne fausse

- **Emplacement** : Écran Messages › #messagesEmpty (index.html:1210–1214, js/app-04-comments-shop.js:5527)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture MSG-037 : « Recherche un utilisateur ci-dessus pour démarrer une discussion. » ; le champ au-dessus est « Rechercher une conversation ou un message… » et ne cherche pas de personnes ; aucun bouton.
- **Problème** : La seule aide de l'écran envoie au mauvais endroit.
- **Situation déclenchante** : Compte sans conversation.
- **Conséquence pour l'utilisateur** : Impasse au moment où la personne veut écrire pour la première fois.
- **Proposition** : « Écris à une personne… » et un bouton « Nouveau message » (même action que le « + »).
- **Visuels** : [MSG-037](galerie/index.html#/surface/MSG-037) · **Surfaces** : MSG-037
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le texte est réécrit par renderMessages selon trois cas (vide, recherche, archives).
- **Critère d'acceptation** : L'état vide contient un bouton qui ouvre « Nouveau message » et ne contient plus « ci-dessus ».
- **Fichiers probables** : `index.html`, `js/app-04-comments-shop.js`

### MSG-C20 — En-tête de groupe : la photo d'un membre, un nom inerte, aucun lien vers l'activité

- **Emplacement** : Conversation de groupe › en-tête — openConversation (js/app-04-comments-shop.js:5685–5724)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture MSG-012 : l'avatar est la photo du premier autre membre (la liste montre 👥) ; le bloc du nom est annoncé role=button mais son onclick est vide (sonde 04) ; « 👥 4 membres » n'est pas touchable ; une discussion d'activité (« 📍 … ») n'offre aucun chemin vers l'activité (sonde 04b).
- **Problème** : Le groupe ressemble à un fil privé avec une personne ; toucher le nom ne fait rien.
- **Situation déclenchante** : Ouverture de tout groupe ou discussion d'activité.
- **Conséquence pour l'utilisateur** : Doute sur le destinataire ; depuis la discussion d'une activité, impossible de revoir l'heure et le lieu.
- **Proposition** : Avatar de groupe, nom qui ouvre la fenêtre du groupe ; pour une discussion d'activité, ligne « Voir l'activité ».
- **Visuels** : [MSG-012](galerie/index.html#/surface/MSG-012) · **Surfaces** : MSG-012, MSG-015
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le bouton IRL de l'en-tête 1:1 (irlProposalMountConversationAction) ne doit pas bouger.
- **Critère d'acceptation** : Dans un groupe, l'avatar d'en-tête est celui de la liste ; toucher le nom ouvre la fenêtre du groupe ; une discussion `evgrp_` propose l'activité.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C21 — Deux sorties d'un groupe qui ne font pas la même chose

- **Emplacement** : « Supprimer la conversation » (js/app-09-boot-pwa.js:1757–1769) et « Quitter » (js/app-05-config-profil.js:2466–2478)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : jugement
- **Preuve** : D'après le code : « Supprimer » retire le groupe de l'appareil sans toucher à l'appartenance (le prochain message le fait revenir) ; « Quitter » retire l'appartenance. En 1:1, « Supprimer cette conversation ? » ne dit pas que l'autre garde tout.
- **Problème** : Deux mots, deux endroits, deux effets.
- **Situation déclenchante** : Vouloir sortir d'un groupe.
- **Conséquence pour l'utilisateur** : On « supprime » un groupe et il revient ; ou l'on croit avoir effacé pour tout le monde.
- **Proposition** : Groupe : une seule sortie, « Quitter le groupe ». 1:1 : « Supprimer pour moi », avec la conséquence écrite.
- **Visuels** : [MSG-021](galerie/index.html#/surface/MSG-021) · **Surfaces** : MSG-026, MSG-022
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C18.
- **Risque de régression** : Pierres tombales `conv` / `clr` (MSG-06).
- **Critère d'acceptation** : Le panneau d'un groupe ne contient plus « Supprimer la conversation » mais « Quitter le groupe ».
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `js/app-05-config-profil.js`

### MSG-C22 — Choisir une personne crée la conversation chez elle avant tout message ; son propre compte est proposé  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : startDirectMessage (js/app-04-comments-shop.js:4205–4285), supaCreateConversation (js/app-08-ui-modals-tour.js:6554–6577)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 06b : toucher « Malik Benali » puis revenir sans écrire → 1 ligne `conversations` et 2 `conv_members` créées ; ligne « Démarrer la conversation… » en tête de ma liste. Jeu de données : un fil ouvert par un autre, sans message, apparaît dans ma liste (MSG-002). Sonde 09 : mon propre compte est dans les résultats et ouvre un fil avec moi-même.
- **Problème** : Un toucher de curiosité laisse une trace chez l'autre.
- **Situation déclenchante** : Ouvrir un fil sans écrire.
- **Conséquence pour l'utilisateur** : L'autre voit qu'on a « ouvert » une conversation ; listes encombrées de fils vides.
- **Proposition** : Créer la conversation au premier message envoyé ; ne pas lister un fil sans message ; exclure son propre compte.
- **Visuels** : [MSG-002](galerie/index.html#/surface/MSG-002) · **Surfaces** : MSG-061, MSG-002, MSG-081
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Chemin d'envoi du premier message (autre domaine).
- **Risque de régression** : audit-2026-11-parcours-social-session.spec.js crée la conversation avant d'écrire.
- **Critère d'acceptation** : Choisir une personne puis revenir : aucune ligne en base, aucune ligne dans la liste ; la recherche ne rend jamais mon compte.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-08-ui-modals-tour.js`

### MSG-C23 — Hors ligne ou serveur en panne : « aucun résultat » et faux succès

- **Emplacement** : Nouveau message (js/app-04-comments-shop.js:4055–4071), confirmCreateGroup (js/app-05-config-profil.js:1952–1996), bandeau #offlineBanner (index.html:1250)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 10 (hors ligne simulé) : recherche d'une personne existante → « Aucun utilisateur trouvé » ; groupe créé → « Groupe créé », identifiant local, 0 ligne en base, rien après reconnexion ; conversation dont la création échoue (500) → fil local ouvert sans un mot. Le bandeau hors ligne (43 px, z-index 9999) recouvre la barre du haut.
- **Problème** : Une panne se présente comme une absence, ou comme une réussite.
- **Situation déclenchante** : Réseau coupé, serveur indisponible.
- **Conséquence pour l'utilisateur** : La personne croit que quelqu'un n'existe pas, ou qu'un groupe existe.
- **Proposition** : « Pas de connexion — réessaie » dans la recherche ; groupe et conversation : dire « en attente » et créer au retour du réseau, ou refuser clairement.
- **Visuels** : — · **Surfaces** : MSG-039, MSG-083, MSG-038
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : File d'attente d'envoi existante (outbox).
- **Risque de régression** : retrait-membre-groupe.spec.js s'appuie sur le préfixe `conv_grp_` des ébauches.
- **Critère d'acceptation** : Hors ligne, la recherche affiche un message de connexion ; un groupe non créé côté serveur n'est jamais annoncé « créé ».
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-05-config-profil.js`, `index.html`

### MSG-C24 — Une conversation d'exemple offre quatorze actions réelles et reste mêlée aux vraies

- **Emplacement** : openConvSettings (js/app-09-boot-pwa.js:1645), _rafraichirConversationsServeur (js/app-08-ui-modals-tour.js:7067)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 06a : sur un exemple, le panneau propose bloquer (« Bloquer » sans nom), signaler, archiver, exporter… ; l'en-tête n'indique pas qu'il s'agit d'un exemple (seul l'envoi le dit). Sonde 06b et constat partagé par la coordination : avec une vraie conversation, les cinq exemples restent dans la liste pendant la session (ils ne partent qu'au démarrage suivant, d'après le code).
- **Problème** : Le décor se manipule comme du réel.
- **Situation déclenchante** : Compte neuf, mode démo.
- **Conséquence pour l'utilisateur** : Signalement ou blocage d'un personnage fictif ; vraie conversation noyée parmi les exemples.
- **Proposition** : Sur un exemple : étiquette dans l'en-tête et une seule action, « Supprimer cet exemple » ; retirer les exemples dès la première vraie conversation.
- **Visuels** : — · **Surfaces** : MSG-027, MSG-061
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : controle-general-2026-11-10.spec.js ⑥ (décor), UXO-03.
- **Critère d'acceptation** : Le panneau d'un exemple ne contient ni « Bloquer » ni « Signaler » ; après un premier fil réel, la liste ne contient plus d'exemple.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `js/app-04-comments-shop.js`, `js/app-08-ui-modals-tour.js`

### MSG-C25 — La permission de notification est demandée sans un mot à la première conversation  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : openConversation → requestCallNotifications (js/app-04-comments-shop.js:5665, js/app-05-config-profil.js:1703–1718)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 06b (demande du système remplacée par un témoin) : 1 appel à Notification.requestPermission à l'ouverture de la première conversation 1:1, sans explication préalable ; après accord, toast « Tu seras prévenu·e de tes messages même app fermée ». La demande réelle n'est pas observable sans tête.
- **Problème** : La boîte du système surgit au milieu d'un geste, sans raison donnée.
- **Situation déclenchante** : Première ouverture d'un fil privé.
- **Conséquence pour l'utilisateur** : Refus réflexe, définitif côté navigateur : plus de notification de message.
- **Proposition** : Une ligne d'explication avec « Activer » / « Plus tard » avant d'appeler le système ; ne rien demander si « Plus tard ».
- **Visuels** : — · **Surfaces** : MSG-078
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Domaine Notifications.
- **Risque de régression** : Le geste utilisateur doit rester l'origine de l'appel (exigence des navigateurs).
- **Critère d'acceptation** : Aucun appel à Notification.requestPermission sans un toucher sur « Activer ».
- **Fichiers probables** : `js/app-05-config-profil.js`, `js/app-04-comments-shop.js`

### MSG-C26 — Écrans d'appel : commandes en emoji sans nom, minuteur peu lisible, diagnostic affiché

- **Emplacement** : Appels — _callRenderIncomingUI, _callRenderActiveUI (js/app-05-config-profil.js:1512–1565), styles.css:5832–5894
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Écrans SIMULÉS (appels désactivés en production, js/app-05-config-profil.js:648). Sonde 05 : boutons 📵 ✅ 🎙 📷 🔄 📞 nommés par `title` seulement, sans aria-label ; Refuser et Répondre à 12 px l'un de l'autre ; avatar = emoji sur #7C3AED fixe, jamais la photo ; minuteur #6D32F4 sur fond nuit : 2,1:1 ; « audio · 32 kb/s · relais » affiché ; micro sombre sur fond sombre ; « Appel en cours… 00:00 » pendant la sonnerie ; calque sans rôle de dialogue ni prise de focus ; aucune trace de l'appel dans le fil.
- **Problème** : On ne sait pas lire les commandes ni reconnaître qui appelle.
- **Situation déclenchante** : Dès la réactivation des appels.
- **Conséquence pour l'utilisateur** : Refus ou réponse par erreur ; lecteur d'écran muet sur les commandes.
- **Proposition** : Icônes SVG avec libellés, commandes écartées, photo de profil, minuteur blanc, diagnostic réservé au mode de mise au point, « Ça sonne… » avant la réponse.
- **Visuels** : [MSG-051](galerie/index.html#/surface/MSG-051), [MSG-054](galerie/index.html#/surface/MSG-054), [MSG-050](galerie/index.html#/surface/MSG-050) · **Surfaces** : MSG-050, MSG-051, MSG-052, MSG-053, MSG-054, MSG-055, MSG-079
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : À traiter avant de remettre PASSIO_APPELS_ACTIFS à true.
- **Risque de régression** : appel-canal-refuse.spec.js, appels-sonnerie-privee.spec.js ciblent les classes `.call-control-btn`.
- **Critère d'acceptation** : Chaque commande d'appel a un nom accessible et un libellé visible ; le minuteur atteint 4,5:1 ; aucun débit n'est affiché.
- **Fichiers probables** : `js/app-05-config-profil.js`, `styles.css`

### MSG-C51 — Un fichier audio que je viens d'envoyer s'affiche comme une bulle vide

- **Emplacement** : Conversation › pièce jointe « Fichier audio » — _processAttach pose voiceData + isFile (js/app-09-boot-pwa.js:1314-1319) ; renderConvFpThread ne rend le lecteur que si !isFile (js/app-04-comments-shop.js:6075) et aucune autre branche ne lit ce message
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 04 (vrai sélecteur de fichier, fichier « repetition-jeudi.wav ») : la bulle n'a aucun nœud de texte (rendu : []), statut « sent ». Capture MSG-156 : capsule violette vide au-dessus de l'heure.
- **Problème** : Après « + › Fichier audio », ma bulle est une petite capsule violette sans nom, sans icône, sans lecteur. Le fichier est pourtant bien parti : rechargée depuis le serveur, la même bulle devient une carte « 🎵 nom · Télécharger ».
- **Situation déclenchante** : Envoi d'un fichier audio depuis le menu « + », tant que la conversation n'a pas été relue depuis le serveur (fermeture puis réouverture).
- **Conséquence pour l'utilisateur** : La personne croit l'envoi raté et renvoie le fichier, ou ne sait plus ce qu'elle a partagé.
- **Proposition** : Rendre la copie locale d'un fichier audio comme la version rechargée : carte de fichier (icône, nom, « Fichier audio »), dans la bulle violette.
- **Visuels** : [MSG-156](galerie/index.html#/surface/MSG-156) · **Surfaces** : MSG-156
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : À traiter avec MSG-C50 (même zone de rendu).
- **Risque de régression** : Ne pas faire passer un fichier audio par le lecteur de vocaux (règle écrite dans applyMsgContentData). Verrou à relire : tests/e2e/piece-jointe-depot-echec.spec.js.
- **Critère d'acceptation** : Après l'envoi d'un fichier audio, la bulle locale affiche le nom du fichier et une icône avant toute relecture serveur ; son texte fait ≥ 4,5:1.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C59 — Sur mobile, la touche Entrée envoie le message : impossible de sauter une ligne

- **Emplacement** : Conversation › champ de saisie — inp.onkeydown (js/app-04-comments-shop.js:5733-5735) ; index.html:1463 (ni enterkeyhint ni étiquette)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 02 (émulation Android Chrome, tactile) : texte de 340 caractères saisi au clavier, touche Entrée → 1 message ajouté, champ vidé, statut « sent ». `enterkeyhint`, `inputmode`, `autocapitalize`, `aria-label` : absents. Le champ sait pourtant grandir jusqu'à 120 px (5 lignes).
- **Problème** : Sur un clavier virtuel il n'y a pas de Maj+Entrée : la touche de retour, qui affiche une flèche de saut de ligne, envoie le message en cours. On ne peut écrire un message de plusieurs paragraphes qu'en le collant.
- **Situation déclenchante** : Appuyer sur Entrée pour aérer un message (adresse, liste, horaires) sur un téléphone.
- **Conséquence pour l'utilisateur** : Messages envoyés à moitié écrits, sans possibilité de les modifier ensuite (aucune édition de message).
- **Proposition** : Sur pointeur tactile (`_pointeurFin()` faux), Entrée insère un saut de ligne et seul le bouton d'envoi envoie ; poser `enterkeyhint="enter"`. Sur ordinateur, garder Entrée = envoyer et Maj+Entrée = saut de ligne.
- **Visuels** : [MSG-121](galerie/index.html#/surface/MSG-121) · **Surfaces** : MSG-121, MSG-128
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Suites e2e qui envoient par `keyboard.press("Enter")` sous un gabarit mobile : à recenser (conv-*.spec.js utilisent surtout sendMessageFp).
- **Critère d'acceptation** : Gabarit tactile : Entrée dans le champ ajoute une ligne et n'envoie rien ; gabarit ordinateur : Entrée envoie, Maj+Entrée ajoute une ligne.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `index.html`

### MSG-C61 — Les séparateurs de jour comptent des tranches de 24 h : « Aujourd'hui » apparaît deux fois, « Hier » désigne avant-hier

- **Emplacement** : Conversation › séparateurs — _dayLabel (js/app-04-comments-shop.js:5950-5958) : Math.floor((now − d) / 86 400 000) alors que la coupure se fait par jour calendaire (_dayKey, :5959)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 01 (passe du 10 novembre vers 17 h 30) : messages du 7, du 8, du 9 et du 10 novembre → séparateurs « 7 novembre », « Hier » (pour le 8), « Aujourd'hui » (pour le 9), « Aujourd'hui » (pour le 10). Capture MSG-104.
- **Problème** : Un message d'hier soir est rangé sous « Aujourd'hui », suivi d'un second « Aujourd'hui » ; un message d'avant-hier 18 h est sous « Hier ».
- **Situation déclenchante** : Tout message du jour précédent vieux de moins de 24 h (la veille au soir lue le matin : le cas ordinaire), ou de l'avant-veille vieux de moins de 48 h.
- **Conséquence pour l'utilisateur** : On se trompe sur le jour d'un message — donc d'un rendez-vous (« on se voit demain » écrit hier).
- **Proposition** : Calculer l'écart entre jours calendaires (minuit local) : « Aujourd'hui », « Hier », puis « samedi 8 novembre » (jour de la semaine ajouté dans la semaine écoulée).
- **Visuels** : [MSG-104](galerie/index.html#/surface/MSG-104) · **Surfaces** : MSG-104
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible ; fuseau : utiliser l'heure locale de l'appareil, comme _dayKey.
- **Critère d'acceptation** : Message daté d'hier 23 h 40 lu aujourd'hui 8 h : séparateur « Hier » ; un seul séparateur « Aujourd'hui » par fil ; un message d'il y a deux jours calendaires n'est jamais sous « Hier ».
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C62 — Un message non parti affiche quand même « ✓ », et « réessayer » est un mot rouge de 47 × 15 px

- **Emplacement** : Conversation › statut d'envoi — accusé posé sur le dernier message quel que soit son statut (js/app-04-comments-shop.js:5992-6000), _msgStatusIndHtml (:7158-7162), statut « failed » dès l'absence de réseau (:7363-7366)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 02 : message envoyé hors ligne → « 17:52 ✓ réessayer » ; la zone touchable de « réessayer » mesure 47 × 15 px, texte de 11 px rgb(239,68,68). Le message est pourtant en file et part seul au retour du réseau (statut « sent » après l'événement online). L'envoi en cours est un emoji 🕓 à 55 % d'opacité. Captures MSG-122, MSG-123, MSG-124.
- **Problème** : Trois signaux se contredisent sur la même ligne : la coche qui veut dire « envoyé », le mot rouge qui veut dire « raté », et la réalité (« en attente, partira tout seul »). Le seul moyen de relancer est un mot minuscule collé à l'heure.
- **Situation déclenchante** : Envoi sans réseau, panne ou refus du serveur ; envoi lent.
- **Conséquence pour l'utilisateur** : On ne sait pas si le message est parti ; on le retape (doublon à la reconnexion) ou on croit à tort qu'il est arrivé. La relance est difficile à toucher.
- **Proposition** : Un seul état par message, en toutes lettres : « Envoi… » (gris), « En attente du réseau » (gris, hors ligne), « Non envoyé · Réessayer » (pastille de 44 px de haut, bouton nommé), puis ✓ / ✓✓ seulement quand le serveur a confirmé.
- **Visuels** : [MSG-123](galerie/index.html#/surface/MSG-123), [MSG-124](galerie/index.html#/surface/MSG-124), [MSG-122](galerie/index.html#/surface/MSG-122) · **Surfaces** : MSG-123, MSG-124, MSG-122
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le statut est patché en place via [data-msgst] : garder ce support. Verrous : message-media-echec.spec.js, parcours-flux.spec.js, file-messages-par-compte.spec.js (lisent `status`, pas le libellé).
- **Critère d'acceptation** : Aucun ✓ n'est affiché sur un message dont `status` vaut « sending » ou « failed » ; hors ligne le libellé dit l'attente et non l'échec ; la relance mesure ≥ 44 × 44 px et se nomme « Réessayer l'envoi ».
- **Fichiers probables** : `js/app-04-comments-shop.js`, `styles.css`

### MSG-C63 — Hors ligne, le bandeau global recouvre l'en-tête de la conversation

- **Emplacement** : Conversation › en-tête — bandeau « Mode hors-ligne — contenu en cache » posé au-dessus de #conv-fullpage (z-index 1200, styles.css:5911)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 08 : `#offlineBanner` (position fixe, z-index 9999, 43 px de haut) ; `document.elementFromPoint` au centre du bouton Retour, sur le nom et sur le menu « ⋯ » rend le bandeau dans les trois cas. Capture MSG-124 : seule la moitié basse de l'avatar dépasse.
- **Problème** : Dès que le réseau tombe, je ne vois plus à qui j'écris et le bouton Retour est masqué par le bandeau.
- **Situation déclenchante** : Perte de réseau pendant qu'une conversation est ouverte (métro, ascenseur).
- **Conséquence pour l'utilisateur** : Navigation gênée au moment où l'application devrait rassurer ; le retour ne passe plus que par le geste système ou la fermeture du bandeau.
- **Proposition** : Dans la conversation, afficher l'état hors ligne SOUS l'en-tête (ligne fine « Hors ligne — tes messages partiront au retour du réseau »), ou décaler l'en-tête de la hauteur du bandeau.
- **Visuels** : [MSG-124](galerie/index.html#/surface/MSG-124) · **Surfaces** : MSG-124
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Bandeau global (socle) : à traiter avec le domaine concerné.
- **Risque de régression** : Les autres panneaux pleine page (bobines, story) ont le même empilement : vérifier.
- **Critère d'acceptation** : Hors ligne, conversation ouverte : `document.elementFromPoint` au centre du bouton Retour rend ce bouton ; le nom de l'interlocuteur est entièrement visible.
- **Fichiers probables** : `styles.css`, `index.html`

### MSG-C66 — Répondre à une photo ou à un vocal cite une étiquette technique ; « Copier le texte » est proposé sur une photo

- **Emplacement** : Conversation › citation et copie — _msgPreviewText lit m.text avant le type (js/app-04-comments-shop.js:6326-6332) ; canCopy (:6344) ; libellés d'enveloppe « [MEDIA] nom » écrits par _pjContenu (js/app-09-boot-pwa.js:936-939) absents de _LIBELLES_ENVELOPPE (js/app-04-comments-shop.js:6304-6311)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 03 : la feuille d'actions d'une photo reçue contient « 📋 Copier le texte ». Sonde 08 : barre de réponse « Réponse à Léa Fontaine — [MEDIA] atelier.jpg » pour une photo, « [AUDIO] Message vocal (14s) » pour un vocal, « [DOC] Programme-stage-lutherie-novembre-2026.pdf » pour un document ; « Copier le texte » est proposé pour les trois et place « [MEDIA] atelier.jpg » dans le presse-papiers. Captures MSG-142, MSG-143.
- **Problème** : Quand je réponds à une photo, la barre de réponse et la bulle citent « [MEDIA] atelier.jpg » ; pour un vocal, « [AUDIO] Message vocal (14s) ». « Copier le texte » sur une photo copie cette étiquette.
- **Situation déclenchante** : Répondre à (ou copier) un message photo, vidéo, vocal ou document reçu, ou un des miens après relecture du fil.
- **Conséquence pour l'utilisateur** : Jargon interne à l'écran et dans le message envoyé à l'autre ; nom de fichier de l'appareil photo exposé.
- **Proposition** : Décider du libellé par le TYPE du message (« Photo », « Vidéo », « Message vocal · 0:14 », « Document · nom ») avant de regarder le texte ; ne proposer « Copier le texte » que pour un message de texte.
- **Visuels** : [MSG-142](galerie/index.html#/surface/MSG-142), [MSG-143](galerie/index.html#/surface/MSG-143) · **Surfaces** : MSG-142, MSG-143
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : L'aperçu de la liste des conversations a sa propre table (renderMessages) : aligner les deux sur une seule fonction.
- **Critère d'acceptation** : Répondre à une photo affiche « Photo » dans la barre et dans la citation ; aucune chaîne « [MEDIA] », « [AUDIO] », « [DOC] » n'apparaît à l'écran ; la feuille d'une photo n'a pas « Copier le texte ».
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-09-boot-pwa.js`

### MSG-C67 — Les liens ne sont pas cliquables dans un message  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Conversation › bulle de texte — content = escapeHtml(m.text) (js/app-04-comments-shop.js:6108) ; les commentaires, eux, passent par _linkifyText (:314)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Capture MSG-106 : l'adresse https://exemple.passio.test/… est du texte brut (aucun élément <a> dans la bulle). Le seul lien actif d'un message est celui de la position.
- **Problème** : Un lien reçu (billetterie, itinéraire, page d'un lieu) ne s'ouvre pas : il faut le copier — or « Copier le texte » copie tout le message.
- **Situation déclenchante** : Tout message contenant une adresse web.
- **Conséquence pour l'utilisateur** : Friction sur l'échange d'informations pratiques avant une rencontre ; incohérence avec les commentaires, où les liens sont actifs.
- **Proposition** : Passer le texte des messages par le même traitement que les commentaires (échappement puis liens http(s) seulement, `rel="noopener"`, ouverture dans un nouvel onglet), lien souligné dans la couleur du texte.
- **Visuels** : [MSG-106](galerie/index.html#/surface/MSG-106) · **Surfaces** : MSG-106
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : Contenu écrit par un AUTRE compte : conserver l'échappement avant la mise en lien et le filtrage de schéma (safeUrlAttr). Verrous : audit-echappement, mention-groupe-xss.spec.js.
- **Critère d'acceptation** : Un message « voir https://exemple.test/a?b=1 » rend un lien <a> http(s) actif ; un texte `javascript:alert(1)` reste du texte ; le contraste du lien dans une bulle violette est ≥ 4,5:1.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C68 — L'en-tête ne donne pas le contexte de l'échange : « Voir le profil » en 1:1, aucun lien vers l'activité dans sa discussion

- **Emplacement** : Conversation › en-tête — sous-titre figé (js/app-04-comments-shop.js:5709) ; la liste des conversations affiche, elle, les passions de l'interlocuteur (js/ui-v6a-messages.js:231-242)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : jugement
- **Preuve** : Captures MSG-101 (« Léa Fontaine / Voir le profil », 11 px violet), MSG-194 (« 📍 Bœuf acoustique au parc de Gerland / 👥 3 membres » : aucun élément de l'en-tête n'ouvre la fiche de l'activité — sonde 07, lienVersActivite : false ; nom tronqué à 186 px).
- **Problème** : Une fois dans la conversation, plus rien ne rappelle ce qui nous relie (la passion commune) ; dans la discussion d'une activité, je ne peux pas retrouver la date et le lieu sans quitter la conversation et chercher l'activité.
- **Situation déclenchante** : Ouvrir une conversation depuis la liste (où les passions étaient affichées) ; chercher l'heure ou l'adresse d'une activité depuis sa discussion.
- **Conséquence pour l'utilisateur** : La conversation est coupée de la boucle Fil → interaction → IRL : l'information utile pour se rencontrer est à plusieurs écrans.
- **Proposition** : Sous le nom : les passions de l'interlocuteur (même formule que la liste, texte gris), l'ensemble de la zone restant le lien vers le profil. Discussion d'activité : « Activité · 3 participants — voir la fiche », qui ouvre la fiche de l'activité (l'identifiant est dans celui de la conversation). Groupe : « 5 membres ».
- **Visuels** : [MSG-101](galerie/index.html#/surface/MSG-101), [MSG-194](galerie/index.html#/surface/MSG-194) · **Surfaces** : MSG-101, MSG-194, MSG-192
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune (données déjà locales : identitePassionsTexte, identifiant evgrp_<activité>).
- **Risque de régression** : Aucune passion « principale » ne doit être mise en avant (ADR-011) : reprendre la formule de la liste telle quelle.
- **Critère d'acceptation** : En 1:1, le sous-titre de l'en-tête est identique au préfixe « passions » de la carte de la liste ; dans une discussion d'activité, toucher le sous-titre ouvre la fiche de cette activité.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/ui-v6a-messages.js`

### MSG-C69 — Deux entrées « proposer un IRL » différentes dans la même conversation, et aucune ne porte la couleur de l'IRL  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Conversation › en-tête (js/app-07-ia-explore-irl.js:6258-6306, « Proposer un moment IRL », épingle) et menu « + » (js/ui-v6c-proposer-irl.js:138-182, « Proposer un IRL », poignée de main) ; styles.css:5962-5965 et :6260 (violet)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Captures MSG-195 et MSG-150 : deux libellés, deux pictogrammes, tous deux violets (le corail #FF6B57 est réservé au passage au réel). D'après le code : le bouton d'en-tête n'apparaît qu'après un verdict serveur (âge déclaré, blocage) et ouvre le formulaire vide ; l'entrée du menu « + » est toujours présente en 1:1 et préremplit passion et titre. Sonde 08 (verdict serveur « non », simulé) : le bouton d'en-tête est absent, l'entrée « Proposer un IRL » du menu reste présente et ouvre « Créer une activité » (capture MSG-197).
- **Problème** : La même action existe en deux endroits avec deux noms, deux icônes et deux résultats différents ; l'action qui fait l'identité du produit (passer au réel) n'est pas distinguée des pièces jointes.
- **Situation déclenchante** : Vouloir proposer une rencontre depuis une conversation 1:1.
- **Conséquence pour l'utilisateur** : Hésitation, résultats inattendus (formulaire prérempli ou non). Le garde-fou serveur du bouton d'en-tête ne s'applique pas à l'entrée du menu.
- **Proposition** : Un seul libellé (« Proposer un moment IRL »), un seul pictogramme, un seul chemin (formulaire prérempli par la passion), soumis au même verdict serveur aux deux endroits ; teinte corail pour les deux entrées.
- **Visuels** : [MSG-195](galerie/index.html#/surface/MSG-195), [MSG-150](galerie/index.html#/surface/MSG-150) · **Surfaces** : MSG-195, MSG-196, MSG-197, MSG-150
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Domaine IRL (formulaire de création).
- **Risque de régression** : Garde-fous âge et blocage (irlProposalServerVerdict) à conserver et à étendre à l'entrée du menu ; verrous irl-trust-safety.spec.js, ui-v6c.
- **Critère d'acceptation** : Les deux entrées portent le même nom accessible et la même icône ; quand le verdict serveur est « non », aucune des deux n'est affichée ; les deux ouvrent le même formulaire dans le même état.
- **Fichiers probables** : `js/ui-v6c-proposer-irl.js`, `js/app-07-ia-explore-irl.js`, `styles.css`

### MSG-C70 — Panneau emoji : douze colonnes serrées, une barre de catégories vide, l'ancien violet, et une grille cassée quand la page charge lentement

- **Emplacement** : Conversation › panneau emoji/GIF — index.html:1729-1762 ; js/emoji-misc.js:234-264 (boucle qui découpe la chaîne par unité UTF-16) ; js/app-09-boot-pwa.js:556-583 (remplissage correct, différé de 100 ms)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Grille saine (sonde 08, capture MSG-151) : 230 emojis sur 12 colonnes, cellules de 31 × 32 px. Barre de catégories : 0 élément, 17 px de haut. Onglets « Emoji / GIF » : fond #7c3aed en dur (l'accent actuel est #6D32F4), 36 px de haut. Le panneau se referme après chaque emoji choisi. Grille cassée (sonde 04, capture MSG-152) : 327 cellules de 31 × 12 px affichant « � » — obtenue quand le minuteur de 100 ms d'app-09 passe AVANT js/emoji-misc.js ; dans le banc, une ouverture sur deux selon la vitesse de chargement des scripts.
- **Problème** : Les emojis sont petits et collés (douze par ligne), une bande vide sépare la recherche de la grille, et le panneau se referme après chaque emoji. Si le minuteur passe avant le script, la grille n'affiche que des caractères de remplacement.
- **Situation déclenchante** : Ouvrir le panneau emoji ; chargement lent ou page de développement pour la grille cassée.
- **Conséquence pour l'utilisateur** : Choix imprécis (cibles de 31 px), panneau à rouvrir pour chaque emoji ; au pire, sélecteur inutilisable.
- **Proposition** : Supprimer la boucle de js/emoji-misc.js (elle ne peut produire que des demi-caractères) et la bande de catégories vide ; grille de 8 colonnes, cellules de 44 px ; onglets à la couleur d'accent ; le panneau reste ouvert tant qu'on choisit des emojis.
- **Visuels** : [MSG-151](galerie/index.html#/surface/MSG-151), [MSG-152](galerie/index.html#/surface/MSG-152) · **Surfaces** : MSG-151, MSG-152
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C60 (bouton emoji dans le champ).
- **Risque de régression** : Ordre de chargement : emoji-misc.js est inclus dans le 9ᵉ script en production (scripts/build.js) — vérifier la page construite, pas seulement la page de développement.
- **Critère d'acceptation** : Dans la page construite ET la page de développement, la grille ne contient aucun caractère U+FFFD ; chaque cellule mesure ≥ 44 × 44 px à 360 px ; aucune bande vide ; trois emojis peuvent être insérés sans rouvrir le panneau.
- **Fichiers probables** : `js/emoji-misc.js`, `index.html`, `js/app-09-boot-pwa.js`, `styles.css`

### MSG-C72 — Une photo choisie part immédiatement : ni aperçu, ni possibilité de se raviser

- **Emplacement** : Conversation › menu « + » › Photo / Vidéo — handleAttachFile → _processAttach (js/app-09-boot-pwa.js:1209-1350) : bulle et dépôt dès la lecture du fichier ; index.html:1441 (un seul fichier)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : jugement
- **Preuve** : Sonde 04 (vrai sélecteur de fichier) : 300 ms après le choix, le message existe déjà (`status` « sent » dans le banc) ; aucune fenêtre ni bandeau d'aperçu (apercuAvantEnvoi : false) ; l'attribut `multiple` est absent. Capture MSG-155.
- **Problème** : La photo touchée dans la galerie du téléphone est envoyée sans que l'application me la montre : une erreur de vignette (photo voisine, capture d'écran personnelle) part chez l'autre.
- **Situation déclenchante** : Choisir un fichier dans le sélecteur du système.
- **Conséquence pour l'utilisateur** : Envoi d'une image privée par erreur ; seule issue : « Supprimer pour tous », après coup.
- **Proposition** : Après le choix, poser la vignette dans une bande d'aperçu au-dessus du champ (même emplacement que la barre de réponse) avec « Retirer » ; c'est le bouton d'envoi qui la fait partir. Aucune nouvelle donnée, aucun nouveau format de message.
- **Visuels** : [MSG-155](galerie/index.html#/surface/MSG-155) · **Surfaces** : MSG-155
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : MSG-C60 (bouton d'envoi unique).
- **Risque de régression** : File de dépôt (`passio_pj_outbox_v1`) et verdict du dépôt inchangés : seul le déclenchement est différé. Verrous : piece-jointe-depot-echec.spec.js, capacité vidéo (passioVideoPourEnvoi).
- **Critère d'acceptation** : Après le choix d'une photo, aucune ligne conv_messages ni objet Storage n'est créé tant que « Envoyer » n'est pas touché ; « Retirer » vide l'aperçu.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `index.html`, `js/app-04-comments-shop.js`

### MSG-C73 — Le retour système ne ferme ni la visionneuse d'image ni le panneau emoji : il ferme la conversation derrière eux

- **Emplacement** : Conversation › superpositions — openFullImg (js/app-09-boot-pwa.js:1933-1973, aucune entrée d'historique) ; #convEmojiPanel en position fixe hors de #conv-fullpage (index.html:1729, styles.css:6088-6115) ; closeConversation (js/app-04-comments-shop.js:7789-7804) ne les ferme pas
- **Domaine** : Messagerie · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde 04 : visionneuse ouverte, `history.back()` → la visionneuse est toujours là, la conversation est fermée, l'écran derrière est la liste (capture MSG-160). Sonde 07 : panneau emoji ouvert, retour → conversation fermée, panneau toujours visible par-dessus la liste (capture MSG-202).
- **Problème** : Le geste « retour » du téléphone, que j'utilise pour fermer une image, me sort de la conversation en laissant l'image (ou le panneau emoji) flotter sur l'écran précédent.
- **Situation déclenchante** : Geste ou bouton Retour du système pendant qu'une image est en plein écran ou que le panneau emoji est ouvert.
- **Conséquence pour l'utilisateur** : Désorientation ; sur iPhone le geste du bord est le chemin principal (défaut déjà traité pour la conversation elle-même, pas pour ses couches).
- **Proposition** : Donner une entrée d'historique à la visionneuse (pushOverlayHistory / releaseOverlayHistory, comme les modales) ; fermer le panneau emoji, le menu « + » et le sélecteur GIF dans closeConversation et sur Retour.
- **Visuels** : [MSG-160](galerie/index.html#/surface/MSG-160), [MSG-202](galerie/index.html#/surface/MSG-202) · **Surfaces** : MSG-160, MSG-202, MSG-159
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Règle « un seul geste d'historique à la fois » (app-02, 2026-11-07) ; plafond d'écritures d'historique WebKit.
- **Critère d'acceptation** : Visionneuse ouverte + Retour : la visionneuse se ferme, la conversation reste ouverte. Panneau emoji ouvert + Retour : le panneau se ferme ; après fermeture de la conversation aucun élément de la conversation n'est visible.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `js/app-04-comments-shop.js`, `js/emoji-misc.js`

### MSG-C74 — Le brouillon ne survit pas au rechargement de l'application

- **Emplacement** : Conversation › brouillon — c.draft écrit à la frappe (js/app-04-comments-shop.js:7617-7626) ; au démarrage la copie serveur REMPLACE l'entrée locale (_rafraichirConversationsServeur, js/app-08-ui-modals-tour.js:7059-7094)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde 07 : texte tapé, sortie puis retour dans la conversation → brouillon restauré et « Brouillon : … » dans la liste (conservé). Après `location.reload()` (sauvegarde forcée avant) : champ vide, aperçu de la liste revenu au dernier message. Sonde 08 : brouillon, fond de conversation, épinglage et sourdine posés puis sauvegardés ; après rechargement tous les quatre sont revenus à vide (draft null, bg null, pinned false, muted false).
- **Problème** : Un message commencé puis interrompu (appel, application fermée, mise à jour) est perdu à la réouverture.
- **Situation déclenchante** : Rechargement ou redémarrage de l'application avec un brouillon en cours, pour toute conversation connue du serveur.
- **Conséquence pour l'utilisateur** : Texte à retaper ; les longs messages sont les plus exposés.
- **Proposition** : Au démarrage, reporter sur l'entrée venue du serveur les champs purement locaux de l'entrée existante (brouillon, fond) — c'est déjà ce que fait la fusion du réveil (`_fusionnerConvsServeurDansLocal`).
- **Visuels** : — · **Surfaces** : MSG-200, MSG-199
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : moyen
- **Dépendances** : Même cause que MSG-C01 (domaine « liste » : épinglage, archivage, sourdine, fond, description effacés au démarrage) — un seul correctif ; ce constat en est la face « conversation » (le brouillon).
- **Risque de régression** : Pierres tombales et déduplication des conversations ; purge au changement de compte (un brouillon ne doit pas passer d'un compte à l'autre). Verrous : conv-suppression.spec.js, file-messages-par-compte.spec.js.
- **Critère d'acceptation** : Brouillon tapé, application rechargée : le champ de la même conversation contient le brouillon et la liste affiche « Brouillon : … ».
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`, `js/app-04-comments-shop.js`

### MSG-C75 — Cibles tactiles sous 44 px et commandes sans nom accessible dans toute la conversation

- **Emplacement** : Conversation › en-tête (js/app-04-comments-shop.js:5712-5723, title sans aria-label), lecteur de vocal (:6084-6087), barre de réponse (:6417), réactions de la feuille (:6339), barre d'enregistrement (index.html:1428), visionneuse (js/app-09-boot-pwa.js:1948-1949), champ (index.html:1463), images (js/app-04-comments-shop.js:6036, 6053 sans alt)
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures (elementFromPoint, 390 px) : « Paramètres » et « Membres » 34 × 34 (zone 38 × 46), sans aria-label ; Retour 36 × 36 (zone 40 × 48) ; lecture d'un vocal 34 × 34 nommée « ▶ » ; vitesse 24 × 18 ; ✕ de la réponse 23 × 24 sans nom ; réactions de la feuille 36 × 35 ; ✕ de l'enregistrement 18 × 30 sans nom ; boutons de la visionneuse 38 × 38 ; champ de saisie sans étiquette (placeholder seul) ; photos et GIF sans texte alternatif ; avatar et titre d'un groupe annoncés « bouton » sans action (onclick vide).
- **Problème** : Beaucoup de petites commandes de la conversation sont difficiles à toucher et muettes pour un lecteur d'écran.
- **Situation déclenchante** : Usage à une main, doigts larges, lecteur d'écran, commande vocale.
- **Conséquence pour l'utilisateur** : Touches ratées (le voisin d'un bouton de 34 px est à 4 px), fonctions inaccessibles en synthèse vocale.
- **Proposition** : Porter chaque cible à 44 px (zone tactile, taille visuelle conservée quand elle suffit), ajouter les noms accessibles (« Paramètres de la conversation », « Membres du groupe », « Lire le message vocal », « Vitesse de lecture : 1× », « Annuler la réponse », « Annuler l'enregistrement »), étiqueter le champ (« Message à Léa Fontaine »), donner un texte alternatif aux images (« Photo envoyée par Léa »), ne pas poser d'attribut onclick vide.
- **Visuels** : [MSG-101](galerie/index.html#/surface/MSG-101), [MSG-107](galerie/index.html#/surface/MSG-107), [MSG-140](galerie/index.html#/surface/MSG-140) · **Surfaces** : MSG-101, MSG-108, MSG-130, MSG-140, MSG-159, MSG-176, MSG-190, MSG-102
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Constat transverse du socle : le panneau de conversation FERMÉ garde 8 commandes focusables (sonde socle-focus-cache.js).
- **Risque de régression** : Mesures de audit-2026-11-a11y.spec.js (cibles de l'en-tête) ; règle WCAG 2.5.3 (le nom contient le libellé visible).
- **Critère d'acceptation** : Aucune commande visible de la conversation ne mesure moins de 44 × 44 px par elementFromPoint à 360 px ; `mesures.sansNom` et `mesures.champsSansEtiquette` sont vides sur les fiches du domaine.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-09-boot-pwa.js`, `index.html`, `styles.css`

### MSG-C76 — Les actions d'un message n'existent qu'à l'appui long ; les pastilles de réaction sont inertes

- **Emplacement** : Conversation › bulles — _wireMsgActions (js/app-04-comments-shop.js:6263-6283) ; pastilles .conv-react-badge sans gestionnaire (:6136-6145)
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Sonde 03 : une bulle n'a ni tabindex, ni rôle, ni bouton (bulleFocusable : tous nuls) ; le clic droit ouvre la feuille sur ordinateur. Les pastilles de réaction mesurent 32 × 20 px, sans gestionnaire : pour retirer ma réaction il faut rouvrir la feuille et retoucher le même emoji. Rien ne signale l'existence de l'appui long.
- **Problème** : Répondre, réagir, copier, signaler, supprimer : tout passe par un geste invisible, impossible au clavier et au lecteur d'écran. Ma réaction posée ne se retire pas en la touchant.
- **Situation déclenchante** : Première utilisation (découverte), navigation au clavier, lecteur d'écran, retrait d'une réaction.
- **Conséquence pour l'utilisateur** : Fonctions ignorées par une partie des utilisateurs ; signalement d'un message inaccessible sans appui long (obligation de moyen).
- **Proposition** : Rendre chaque bulle atteignable au clavier (tabindex, Entrée ou touche Menu → feuille d'actions, nom « Message de Léa, 17 h 24 : … ») ; toucher sa propre pastille retire la réaction ; au premier message reçu, une aide contextuelle « Appuie longuement sur un message pour répondre ou réagir » (mécanisme HINTS existant).
- **Visuels** : [MSG-147](galerie/index.html#/surface/MSG-147) · **Surfaces** : MSG-147, MSG-140, MSG-112
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : MSG-C65 (vidéos).
- **Risque de régression** : Ne pas voler le focus du champ de saisie ; ordre de tabulation d'un fil de 40 bulles (un seul arrêt « fil », flèches pour parcourir).
- **Critère d'acceptation** : Au clavier seul, on peut ouvrir la feuille d'actions du dernier message reçu et la refermer ; toucher une pastille que j'ai posée la retire.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-02-state-utils.js`

### MSG-C78 — Refus définitif (blocage) : un « réessayer » rouge qui échouera toujours ; aucune indication dans une conversation avec un compte que j'ai bloqué  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Conversation › refus du serveur — _sendTextToSupa, branche refus définitif (js/app-04-comments-shop.js:7416-7446) ; _retryMsg (:7495-7529) ; rendu du fil sans état « bloqué » (:5919-5947)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 07 : l'interlocutrice me bloque (ligne `blocks` posée côté serveur) → mon message passe « failed », « ✓ réessayer », aucun toast ; un toucher sur « réessayer » → même état, toujours sans explication ; le champ reste actif. Conversation avec un compte que J'AI bloqué, rouverte : 2 bulles (les miennes seulement), aucun bandeau, champ actif. Captures MSG-203, MSG-204.
- **Problème** : Quand le serveur refuse pour de bon, l'écran m'invite à réessayer indéfiniment. Et si j'ouvre la conversation d'une personne que j'ai bloquée, je vois un fil amputé de ses messages, où je peux écrire des messages qui échoueront.
- **Situation déclenchante** : Écrire à quelqu'un qui m'a bloqué, ou que j'ai bloqué (conversation atteinte par une notification, le transfert ou le profil).
- **Conséquence pour l'utilisateur** : Insistance inutile et incompréhension ; côté bloqueur, oubli du blocage et impression de panne.
- **Proposition** : Refus définitif : état neutre « Non distribué » sans bouton de relance (ne révèle pas le blocage). Compte que j'ai bloqué : bandeau « Tu as bloqué Inès — Débloquer » à la place de la barre de saisie.
- **Visuels** : [MSG-203](galerie/index.html#/surface/MSG-203), [MSG-204](galerie/index.html#/surface/MSG-204) · **Surfaces** : MSG-203, MSG-204
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Domaine sécurité / blocage.
- **Risque de régression** : Ne jamais afficher « tu es bloqué » (information protégée). Verrous : audit-2026-11-parcours-social-session.spec.js (E-c1), conv-reparation-appartenance.spec.js (un 403 réparable reste relancé une fois).
- **Critère d'acceptation** : Après un refus 403 non réparable, aucun contrôle « réessayer » n'est affiché et aucun texte ne mentionne un blocage par l'autre ; dans une conversation avec un compte bloqué par moi, le champ de saisie est remplacé par le bandeau de déblocage.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C81 — Enregistrement vocal : rien ne s'affiche quand l'appui est trop court ou que rien n'a été capté ; le refus du micro pose une question

- **Emplacement** : Conversation › enregistrement — onstop : sortie muette si < 600 ms ou aucun fragment (js/app-09-boot-pwa.js:2019) ; toast du refus (:2040) ; aucune durée maximale
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde 05 : micro refusé (simulé) → toast « 🎙️ Micro non disponible (autorisation refusée ?) ». Sonde 05b : le Chromium du banc annonce audio/mp4 puis n'encode rien (0 octet) → l'application ne dit rien, aucun message, aucun toast (limite du banc, mais le chemin muet est celui du code). D'après le code : appui < 0,6 s → rien ; pas de plafond de durée. Tant que MSG-C85 n'est pas corrigé, ces textes resteraient de toute façon invisibles conversation ouverte : les deux corrections vont ensemble.
- **Problème** : Après un appui trop bref ou un enregistrement vide, rien n'explique pourquoi aucun vocal n'apparaît. Quand le micro est bloqué, le message doute lui-même de la cause et ne dit pas quoi faire.
- **Situation déclenchante** : Appui bref sur le micro ; micro refusé dans le navigateur ; encodeur indisponible.
- **Conséquence pour l'utilisateur** : Le bouton paraît cassé ; la personne ne sait pas comment réautoriser le micro.
- **Proposition** : Appui trop court : « Maintiens le micro pour enregistrer ». Aucun son capté : « L'enregistrement n'a pas fonctionné, réessaie ». Micro refusé : « Micro bloqué — autorise-le dans les réglages du site pour envoyer un vocal ». Vérifier s'il faut une durée maximale (hypothèse).
- **Visuels** : [MSG-175](galerie/index.html#/surface/MSG-175) · **Surfaces** : MSG-175, MSG-172, MSG-177
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C53, MSG-C85 (sans lui, aucun de ces messages n'est visible).
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Chaque sortie sans message de startVoiceRecord / onstop affiche un texte ; aucun texte d'erreur ne se termine par un point d'interrogation.
- **Fichiers probables** : `js/app-09-boot-pwa.js`

### MSG-C87 — Conversation d'exemple : l'en-tête ne le dit pas et le champ de saisie reste actif

- **Emplacement** : Conversation › fil de démonstration — sous-titre « Voir le profil » (js/app-04-comments-shop.js:5709) ; refus par toast à l'envoi (:6999-7002) ; la liste, elle, affiche « Exemple PASSIO · réponse désactivée » (:5603)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture MSG-206 (mode démonstration) : voir la fiche — en-tête identique à celui d'une vraie conversation, barre de saisie complète. Sonde 09 : l'envoi et le micro émettent le toast « Conversation de démonstration — écris à un vrai membre depuis son profil », que la conversation masque (MSG-C85) : à l'écran, il ne se passe rien et le texte reste dans le champ.
- **Problème** : Dans la liste la conversation est étiquetée « Exemple », mais une fois ouverte rien ne le rappelle : on écrit un message, on appuie sur Envoyer, et rien ne se passe — le refus existe mais reste invisible.
- **Situation déclenchante** : Nouveau compte ou visiteur qui ouvre une des conversations d'exemple.
- **Conséquence pour l'utilisateur** : Premier essai de la messagerie qui ressemble à une panne, après l'effort d'écrire.
- **Proposition** : Dans une conversation d'exemple : sous-titre « Exemple PASSIO », et à la place de la barre de saisie une ligne « Conversation d'exemple — pour écrire à quelqu'un, ouvre son profil » avec le bouton « Découvrir des profils ».
- **Visuels** : [MSG-206](galerie/index.html#/surface/MSG-206) · **Surfaces** : MSG-206
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Domaine « première visite / exemples ».
- **Risque de régression** : _estConvDemo ne doit jamais attraper une vraie conversation (profil réel mis en cache, cf. correctif du 2026-09-15). Verrou : controle-general-2026-11-10.spec.js.
- **Critère d'acceptation** : Conversation d'exemple ouverte : le mot « Exemple » est visible dans l'en-tête et aucun champ de saisie actif n'est affiché.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `index.html`

### MSG-C88 — Clavier ouvert : la coque garde sa hauteur pendant la frappe — l'en-tête sort probablement de l'écran

- **Emplacement** : Conversation › clavier virtuel — syncAppViewportHeight refuse de réduire --app-vh quand un champ a le focus (js/app-09-boot-pwa.js:2143-2155) ; #conv-fullpage borné par --app-vh (styles.css:5924-5925)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : hypothese
- **Preuve** : Simulé (fenêtre réduite de 300 px, champ en focus) — sonde 02 : --app-vh reste à 844 px pour 544 px visibles ; avant la première frappe la barre de saisie est à y = 792-834, hors de la fenêtre ; à la première touche le navigateur ramène le champ à l'écran en faisant glisser toute la page : l'en-tête (retour, nom) n'est plus visible. Capture MSG-120. L'émulation ne reproduit pas le comportement d'un clavier réel (zone visible déplacée par le système).
- **Problème** : Pendant que j'écris, je ne verrais plus à qui j'écris ni le bouton Retour ; selon le navigateur, le champ pourrait rester sous le clavier jusqu'à la première frappe.
- **Situation déclenchante** : Toucher le champ de saisie sur un téléphone (clavier virtuel).
- **Conséquence pour l'utilisateur** : Risque d'écrire à la mauvaise personne sans s'en apercevoir ; inconfort au moment central de l'écran.
- **Proposition** : Vérifier d'abord sur Android Chrome et iOS Safari réels. Si confirmé : pendant la frappe dans la conversation, caler #conv-fullpage sur la hauteur de visualViewport (en-tête fixe, fil réduit, barre au-dessus du clavier) au lieu de laisser le système déplacer la page.
- **Visuels** : [MSG-120](galerie/index.html#/surface/MSG-120) · **Surfaces** : MSG-120
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : eleve
- **Dépendances** : Socle (--app-vh, correctif du 2026-07-22 « barre d'onglets cachée »).
- **Risque de régression** : Zone déjà réglée trois fois (2026-07-22, 2026-09-02) : ne pas figer une hauteur amputée après la fermeture du clavier. Verrous : conv-clavier-ouverture.spec.js, cadrage.
- **Critère d'acceptation** : Sur deux téléphones réels, clavier ouvert dans une conversation : le nom de l'interlocuteur, le dernier message et le champ sont visibles en même temps ; clavier refermé, la barre de saisie revient en bas sans espace vide.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `styles.css`

### PAR-C07 — Quatre contenus, quatre façons de partager

- **Emplacement** : `sharePost` (app-03:11), `openReelShareModal` (app-05:3807), `shareEvent` (app-07:5056), `shareUserProfile` (app-04:5442)
- **Domaine** : Partage · **Nature** : clarte · **Type** : jugement
- **Preuve** : Tableau comparatif du rapport (§ 6) : publication et activité = 2 boutons ; bobine = 8 boutons sans feuille système ; profil = aucun écran. Seules publication et activité montrent un extrait ; aucune ne montre l'auteur ou une vignette. Captures PAR-002, PAR-011, PAR-022, PAR-030.
- **Problème** : Il faut réapprendre le partage à chaque type de contenu, et aucune feuille ne dit clairement ce qui part ni à qui.
- **Situation déclenchante** : Tout partage.
- **Conséquence pour l'utilisateur** : Hésitation, options tierces figées (Telegram, 𝕏) là où le téléphone propose les applications réellement installées.
- **Proposition** : Une feuille unique : aperçu (vignette, auteur ou titre, extrait), phrase « qui verra quoi », puis « Envoyer à quelqu'un » (feuille du téléphone, sinon copie), « Copier le lien », « Republier dans mon fil » ; pour une activité, « Inviter mes abonnements ». Maquettée sur publication, bobine, activité et profil.
- **Visuels** : [PAR-002](galerie/index.html#/surface/PAR-002), [PAR-011](galerie/index.html#/surface/PAR-011), [PAR-022](galerie/index.html#/surface/PAR-022), [PAR-031](galerie/index.html#/surface/PAR-031) · **Surfaces** : PAR-002, PAR-011, PAR-022, PAR-030, PAR-031
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : `navigator.share` doit rester appelé dans le geste (pas d'`await` avant) ; liens-partage-post-profil.spec.js ⑩ (câblage des trois boutons), partage-bobine.spec.js.
- **Critère d'acceptation** : Les quatre portes ouvrent le même composant ; ses libellés et leur ordre sont identiques ; chaque bouton mesure ≥ 44 px à 360 px.
- **Fichiers probables** : `js/app-03-posts-vlogs.js`, `js/app-05-config-profil.js`, `js/app-07-ia-explore-irl.js`, `js/app-04-comments-shop.js`, `styles.css`

### PAR-C08 — Le lien d'une bobine (et d'un live) n'a ni aperçu, ni forme courte, ni invitation

- **Emplacement** : `openReelShareModal` fabrique `#reel=<id>` à la main (js/app-05-config-profil.js:3813) ; `_vliveShare` `/?live=<id>` (:5215) ; `LIENS_PARTAGE` ne connaît que post, user, event (js/app-06-reels-partage.js:391)
- **Domaine** : Partage · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde partage-05 : lien diffusé `…/index.html?plk=…#reel=pa_lea_2`, sans `inv=` (les trois autres portes le portent). Un fragment n'est pas lu par un robot d'aperçu : la carte sera celle, générique, d'index.html (d'après netlify/edge-functions/apercu.js, chemins `/p/ /u/ /e/` seulement). Texte : « Regarde cette bobine PASSIO: Trente secondes d'arpèges.... ».
- **Problème** : Le format le plus partageable s'affiche dans une conversation comme un lien PASSIO générique, et l'invité n'est pas accueilli par le nom de qui l'envoie.
- **Situation déclenchante** : Partage d'une bobine ou d'un live.
- **Conséquence pour l'utilisateur** : Moins d'ouvertures, pas d'abonnement automatique à l'inscription.
- **Proposition** : Faire passer la bobine par `lienPartageDe` (une bobine est une publication : `/p/<id>` ouvre déjà la bonne ligne ; le routeur choisit le lecteur si `is_reel`). Corriger le texte (« … » seulement si coupé).
- **Visuels** : [PAR-011](galerie/index.html#/surface/PAR-011) · **Surfaces** : PAR-011, PAR-014, PAR-015, PAR-047, PAR-070, PAR-078
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : reel-deeplink.spec.js (les anciens liens `#reel=` déjà envoyés doivent rester lus) ; tests/unit/apercu-liens.test.mjs.
- **Critère d'acceptation** : Le lien copié depuis une bobine en production est de la forme `/p/<id>?inv=<uuid>` et son aperçu porte le pseudo de l'auteur.
- **Fichiers probables** : `js/app-05-config-profil.js`, `js/app-06-reels-partage.js`, `netlify/lib/apercu-coeur.js`

### PAR-C09 — Vocabulaire du partage : feed/fil, post/publication, événement/activité/rencontre, trois sens pour « Inviter »

- **Emplacement** : Libellés et toasts des fichiers app-03, app-05, app-06, app-07, affiche-rencontre.js
- **Domaine** : Partage · **Nature** : clarte · **Type** : observation
- **Preuve** : Relevé : « Partager dans mon feed » (publication, activité) / « Partager dans le Feed » (bobine) / « Partager dans mon fil » (libellé rétabli après refus, app-03:113) ; « Partager ce post », titre « Post » / « publication » (fenêtres d'inscription, toasts) ; « Partager cet événement », « Événement introuvable » / « Voir l'activité », « Ton activité est en ligne » / « Affiche de la rencontre » ; « Inviter des amis » = notifier ses abonnements (activité) ET envoyer le lien de l'app (profil, Support), « Inviter mes amis » = envoyer le lien de l'activité, « Inviter quelqu'un » (fil) ; « Profil non trouvé » / « Profil introuvable » ; confirmations « Publication partagée avec succès. » (vert), « Événement partagé dans ton feed. » (violet), « Bobine partagée dans ton feed » (vert) ; « Ouverture whatsapp... ».
- **Problème** : Le même objet et la même action changent de nom d'un écran à l'autre.
- **Situation déclenchante** : Parcours de partage complet.
- **Conséquence pour l'utilisateur** : « Inviter » ne permet pas de prévoir si l'on va notifier des abonnés ou ouvrir WhatsApp.
- **Proposition** : Glossaire unique : « fil », « publication », « activité » ; « Envoyer à quelqu'un » (lien, hors PASSIO), « Inviter mes abonnements » (notification), « Republier dans mon fil » ; une seule phrase d'échec par type ; une seule forme de confirmation.
- **Visuels** : [PAR-002](galerie/index.html#/surface/PAR-002), [PAR-011](galerie/index.html#/surface/PAR-011), [PAR-022](galerie/index.html#/surface/PAR-022), [PAR-023](galerie/index.html#/surface/PAR-023) · **Surfaces** : PAR-002, PAR-005, PAR-011, PAR-022, PAR-023, PAR-026, PAR-027, PAR-029, PAR-032, PAR-034, PAR-040, PAR-050, PAR-052, PAR-055, PAR-014
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Suites e2e qui cherchent ces textes (invitation-amis.spec.js, invitation-activite.spec.js, liens-partage-post-profil.spec.js ③).
- **Critère d'acceptation** : `grep -i "feed\∣ce post\∣cet événement"` ne rend plus aucune chaîne affichée dans js/ ; « Inviter des amis » n'intitule plus qu'un seul mécanisme.
- **Fichiers probables** : `js/app-03-posts-vlogs.js`, `js/app-05-config-profil.js`, `js/app-06-reels-partage.js`, `js/app-07-ia-explore-irl.js`, `js/affiche-rencontre.js`, `index.html`

### PAR-C10 — Le message partagé ne dit ni de qui est le contenu ni ce qu'est PASSIO

- **Emplacement** : `sharePost` : `{ title: "PASSIO", text: <100 premiers caractères> }` (js/app-03-posts-vlogs.js:44) ; `shareEvent` : texte « titre · ville · jour mois » (app-07:5064)
- **Domaine** : Partage · **Nature** : clarte · **Type** : observation
- **Preuve** : Presse-papiers relu (sonde partage-01) : « Chevalet recollé, cordes neuves. Elle sonne mieux qu'à l'achat.\n<lien> » — le texte de Léa, sans son nom, collé comme si l'expéditeur l'avait écrit ; le toast dit « Lien copié » alors que texte + lien sont copiés. Activité (sonde partage-03) : « Atelier lutherie : régler son chevalet · Lyon · 13 nov », sans heure. À comparer au profil (« Découvre Léa Fontaine sur PASSIO ») et à l'invitation d'après création (« Je t'invite : … — date, heure · ville. Rejoins-moi sur PASSIO 👇 »).
- **Problème** : Dans la conversation de destination, le message est ambigu pour qui ne connaît pas PASSIO, surtout si l'aperçu du lien ne se charge pas.
- **Situation déclenchante** : « Partager en dehors » d'une publication ou d'une activité.
- **Conséquence pour l'utilisateur** : Attribution floue, invitation à sortir sans horaire.
- **Proposition** : Publication : « Une publication de <auteur> sur PASSIO : “<extrait>…” ». Activité : reprendre le texte de `inviterActivite` (date, heure, ville). Toast : « Message et lien copiés ».
- **Visuels** : [PAR-002](galerie/index.html#/surface/PAR-002), [PAR-022](galerie/index.html#/surface/PAR-022) · **Surfaces** : PAR-002, PAR-003, PAR-007, PAR-022
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune suite ne fixe ces textes hors invitation-activite.spec.js.
- **Critère d'acceptation** : Le texte transmis à `navigator.share` pour une publication contient le pseudo de l'auteur et « PASSIO » ; pour une activité, l'heure.
- **Fichiers probables** : `js/app-03-posts-vlogs.js`, `js/app-07-ia-explore-irl.js`

### PAR-C11 — Le lien porte l'identité de qui partage, sans que rien ne le dise  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `lienPartageDe` ajoute `?inv=<mon uuid>` (js/app-06-reels-partage.js:411, :504)
- **Domaine** : Partage · **Nature** : clarte · **Type** : jugement
- **Preuve** : Tous les liens relevés (sondes 01, 03, 06) portent `inv=a0d17000-…a001` ; à l'arrivée : « Camille Audit t'invite sur PASSIO », et l'inscription annonce « tu suivras automatiquement Camille Audit » (capture PAR-043). D'après le code, la signature survit aux transferts du lien.
- **Problème** : La personne qui partage ignore que son nom sera montré à quiconque ouvre le lien, même relayé, et que ces personnes la suivront en s'inscrivant.
- **Situation déclenchante** : Tout partage externe par un compte.
- **Conséquence pour l'utilisateur** : Effet utile mais non annoncé ; surprise possible pour un compte discret.
- **Proposition** : Une phrase dans la feuille (« Le lien porte ton nom : si la personne s'inscrit, elle te suivra »). Aucune règle n'est modifiée ; le consentement de l'invité, déjà en place, est conservé.
- **Visuels** : [PAR-002](galerie/index.html#/surface/PAR-002) · **Surfaces** : PAR-002, PAR-022
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PAR-C07.
- **Risque de régression** : Aucun (texte).
- **Critère d'acceptation** : La feuille de partage d'un compte connecté affiche la phrase ; elle est absente pour un visiteur (lien non signé).
- **Fichiers probables** : `js/app-03-posts-vlogs.js`, `js/app-07-ia-explore-irl.js`

### PAR-C12 — Fiche d'activité : trois portes « Partager », trois icônes dans l'application

- **Emplacement** : `#eventDetailShareBtn` (index.html:1270, redessiné par js/ui-v4b-fiche.js:562) ; app-07:4412 et :4498 ; live : « ↗ » (app-05:5097)
- **Domaine** : Partage · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde partage-03 : portes à 14 px (flèche courbe, 45 × 45), 1 554 px (icône à nœuds, 44 × 31) et 1 799 px (bouton texte) ; « Inviter » à 1 848 px sur 2 058. Captures PAR-020, PAR-021.
- **Problème** : La même feuille s'ouvre de trois endroits, avec deux icônes, tandis que l'invitation — l'action qui remplit une activité — est sous les commentaires.
- **Situation déclenchante** : Vouloir faire venir quelqu'un à une activité.
- **Conséquence pour l'utilisateur** : On partage un lien sans découvrir qu'on pouvait inviter ses abonnements.
- **Proposition** : Icône à nœuds en haut ; une seule porte en bas ; l'invitation des abonnements dans la feuille unifiée.
- **Visuels** : [PAR-020](galerie/index.html#/surface/PAR-020), [PAR-021](galerie/index.html#/surface/PAR-021) · **Surfaces** : PAR-020, PAR-021, PAR-070
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PAR-C07 ; coordination avec le domaine « fiche d'activité ».
- **Risque de régression** : ui-v4b-fiche.spec.js (rangement des boutons par expression régulière, ui-v4b-fiche.js:430).
- **Critère d'acceptation** : La fiche ne contient plus que deux commandes de partage ; toutes deux portent `.share-ico`.
- **Fichiers probables** : `js/ui-v4b-fiche.js`, `js/app-07-ia-explore-irl.js`, `js/app-05-config-profil.js`

### PAR-C13 — Feuille « Inviter des amis » d'une activité : étroite, sans trace, et en impasse

- **Emplacement** : `openEventInvite`, `_renderEventInviteList`, `inviteToEvent` (js/app-07-ia-explore-irl.js:7411–7474)
- **Domaine** : Partage · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde partage-04 : 2 boutons « × » superposés (celui d'`openModal` + celui du gabarit) ; bouton « Inviter » 56 × 29 px ; champ de recherche sans libellé ; nom long coupé par une ellipse ; après envoi la personne disparaît de la liste, « Tu as invité tout le monde » à la réouverture ; l'invitation part au premier appui, sans annulation. Captures PAR-023, PAR-024.
- **Problème** : On ne sait plus qui l'on a invité, on ne peut pas corriger un appui sur une cible de 29 px, et quand la liste est vide rien ne propose d'envoyer le lien.
- **Situation déclenchante** : Inviter ses abonnements à une activité.
- **Conséquence pour l'utilisateur** : Invitations envoyées par erreur ; abandon quand on n'a pas (ou plus) d'abonnements à inviter.
- **Proposition** : Titre « Inviter mes abonnements », bouton ≥ 44 px, noms sur deux lignes, libellé accessible, un seul « × », section « Déjà invités », et sortie « Envoyer le lien à quelqu'un d'autre ».
- **Visuels** : [PAR-023](galerie/index.html#/surface/PAR-023), [PAR-024](galerie/index.html#/surface/PAR-024) · **Surfaces** : PAR-023, PAR-024
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : La mémoire des invitations est locale à l'appareil (`eventInvitesSent`) : « Déjà invités » sera vide sur un autre appareil — le dire.
- **Critère d'acceptation** : À 360 px, `[data-invite]` mesure ≥ 44 px de haut ; `#modalContent .modal-close` est unique ; l'état vide contient un bouton de partage du lien.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `styles.css`

### PAR-C14 — Inviter à rejoindre PASSIO : deux portes sur trois sont cachées

- **Emplacement** : `openMainProfileMenu` (js/app-06-reels-partage.js:1886) derrière `.v6b-modifier` (js/ui-v6b-profil.js:104) ; index.html:554
- **Domaine** : Partage · **Nature** : friction · **Type** : observation
- **Preuve** : Sonde partage-06 : sur le profil, le bouton s'annonce « Modifier le profil » et « Inviter des amis » est la 6e entrée de son menu ; dans Paramètres, 3 appuis, 7e bouton de « Support » (218 × 33 px) après « Mentions légales ». Captures PAR-032, PAR-033.
- **Problème** : L'action dont dépend la croissance n'est visible qu'à qui la cherche.
- **Situation déclenchante** : Vouloir faire venir un ami.
- **Conséquence pour l'utilisateur** : Peu de partages (constat du journal : aucun lien partagé en 7 jours début octobre).
- **Proposition** : Un bouton « Partager mon profil » visible sous l'identité (il envoie déjà le lien de mon profil) ; retirer l'entrée du menu du crayon ; dans Paramètres, la sortir de « Support ».
- **Visuels** : [PAR-032](galerie/index.html#/surface/PAR-032) · **Surfaces** : PAR-032, PAR-033
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : ui-v6b-profil.spec.js (compte 6 entrées), invitation-amis.spec.js ③.
- **Critère d'acceptation** : Sur « Profil », une commande de partage est visible sans ouvrir de menu, ≥ 44 px.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/ui-v6b-profil.js`, `index.html`

### PAR-C15 — Bobine : un double appui sur « Partager dans le Feed » traverse la feuille

- **Emplacement** : `shareReelInFeed` (js/app-05-config-profil.js:3862) : aucun verrou, `closeModal()` synchrone
- **Domaine** : Partage · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde partage-05, double appui réel : une publication créée, mais le second appui tombe sur la puce « Découvrir Musique » du lecteur — lecteur fermé, fiche de passion ouverte, confirmation dessous. Vu une fois, reproduit à l'identique dans la même sonde ; non essayé sur écran tactile réel.
- **Problème** : Un appui nerveux mène à un écran sans rapport.
- **Situation déclenchante** : Double appui rapide.
- **Conséquence pour l'utilisateur** : Désorientation ; la confirmation du repartage n'est jamais vue.
- **Proposition** : Même garde que la publication (bouton désactivé, « Partage en cours… ») et fermeture de la feuille après un court délai.
- **Visuels** : — · **Surfaces** : PAR-016
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : partage-bobine.spec.js.
- **Critère d'acceptation** : `dblclick` sur le bouton : une seule publication, et l'écran actif reste le lecteur ou le fil.
- **Fichiers probables** : `js/app-05-config-profil.js`

### PAR-C16 — « Partager mon expérience » : le rattachement à l'activité est invisible et persiste  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `shareEventExperience` pose `window._pendingEventPost` (js/app-07-ia-explore-irl.js:4562), lu à la prochaine publication (js/app-06-reels-partage.js:5379)
- **Domaine** : Partage · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde partage-04 : le Studio s'ouvre avec « 📍 Initiation grimpe en salle · Villeurbanne (6 nov) », `_pendingEventPost = "ev_par_passee"`, aucune mention à l'écran ; « Publier dans : Musique » alors que l'activité est en Sport. D'après le code, le marqueur n'est effacé que par une publication : quitter le Studio puis publier autre chose rattache cette autre publication à l'album (non exercé).
- **Problème** : On ne sait pas que ce qu'on publie ira dans l'album public de l'activité, et l'on ne peut pas y renoncer.
- **Situation déclenchante** : Activité passée → « Partager mon expérience ».
- **Conséquence pour l'utilisateur** : Publication rangée dans un album par surprise, possiblement une publication sans rapport.
- **Proposition** : Bandeau « Souvenir de <activité> — ira dans l'album » avec une croix ; effacer le marqueur en quittant le Studio.
- **Visuels** : [PAR-028](galerie/index.html#/surface/PAR-028) · **Surfaces** : PAR-028
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Domaine « Studio ».
- **Risque de régression** : partage-experience-passion.spec.js.
- **Critère d'acceptation** : Le Studio affiche le nom de l'activité tant que le marqueur est posé ; après `goTo("feed")`, `window._pendingEventPost` est nul.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `js/app-06-reels-partage.js`

### PAR-C20 — L'invitation nominative ne tient que six secondes à l'arrivée  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `accueillirInvitation` (js/app-06-reels-partage.js:597)
- **Domaine** : Partage · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture PAR-040 : le seul signe de l'invitation est un toast cliquable de 6 s (« 👋 Camille Audit t'invite sur PASSIO — touche ici pour créer ton compte »), posé une fois par invitation ; la page n'explique pas ce qu'est PASSIO (titre « Post »). Et le toucher mène au formulaire caché (PAR-C01).
- **Problème** : Le visiteur qui lit d'abord le contenu ne revoit jamais qui l'a invité ni pourquoi s'inscrire.
- **Situation déclenchante** : Arrivée par un lien signé.
- **Conséquence pour l'utilisateur** : L'élan de l'invitation est perdu.
- **Proposition** : Un bandeau bas discret et persistant sur l'écran d'arrivée : « <Nom> t'invite sur PASSIO » + une ligne de promesse + « Créer mon compte ».
- **Visuels** : [PAR-040](galerie/index.html#/surface/PAR-040) · **Surfaces** : PAR-040, PAR-045
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : PAR-C01.
- **Risque de régression** : invitation-arrivee.spec.js ② (toast attendu) ; ne rien poser pour un appareil qui porte un compte.
- **Critère d'acceptation** : Visiteur invité sur un contenu : le nom de l'invitant est encore visible 30 s après l'arrivée.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `styles.css`

### SOC-C02 — Le panneau de conversation fermé reste atteignable au clavier

- **Emplacement** : `#conv-fullpage` fermé (déplacé hors champ par `translateX`, sans `inert` ni `aria-hidden`)
- **Domaine** : Transverse · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Sonde socle-focus-cache.js : 8 commandes du panneau fermé (Retour, Pièce jointe, Emoji, champ Message, Envoyer…) atteignables par tabulation et exposées aux lecteurs d'écran ; sonde socle-panneau-invisible.js : le panneau est hors champ (x = 390) et n'intercepte aucun toucher.
- **Problème** : Une personne au clavier ou au lecteur d'écran traverse des commandes qu'elle ne voit pas.
- **Situation déclenchante** : Navigation au clavier, lecteur d'écran (VoiceOver, TalkBack).
- **Conséquence pour l'utilisateur** : Focus perdu hors de l'écran, annonces de « Envoyer le message » sans conversation ouverte : désorientation.
- **Proposition** : Poser `inert` (et `aria-hidden`) sur `#conv-fullpage` tant qu'il n'est pas `.active`, et le retirer à l'ouverture — après injection du contenu (règle « contenu avant révélation »).
- **Visuels** : — · **Surfaces** : SOC-030
- **Priorité** : P2 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Ordre d'ouverture du panneau (CLAUDE.md, « Panneau animé : le contenu AVANT la révélation »).
- **Risque de régression** : Focus initial à l'ouverture de la conversation. Verrou : conv-ouverture-fil.
- **Critère d'acceptation** : Conversation fermée : aucune tabulation n'atteint un descendant de `#conv-fullpage` ; ouverte : le focus peut atteindre le champ Message.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `index.html`

## P3 — finition et cohérence visuelle

### FIL-C14 — Sur petit écran, le premier contenu commence à mi-hauteur

- **Emplacement** : En-tête du fil — barre (64 px), rail (70), envies (44), stories (65)
- **Domaine** : Fil et interactions · **Nature** : friction · **Type** : jugement
- **Preuve** : Sonde fil-01 : `#feedList` commence à 273 px. Capture FIL-001--m320 (320×568) : la première carte commence à 273 px, soit 48 % de la hauteur ; il reste ~230 px de contenu au-dessus de la barre basse. Libellés des stories en 9,5 px.
- **Problème** : L'en-tête permanent (décision du 2026-08-29) prend près de la moitié d'un petit écran avant toute publication.
- **Situation déclenchante** : Ouvrir le fil sur un téléphone de 568 à 640 px de haut.
- **Conséquence pour l'utilisateur** : La première publication n'est qu'entrevue ; la promesse « découvrir » passe après quatre rangées de commandes.
- **Proposition** : Sans replier l'en-tête : sous 660 px de haut, masquer les libellés des stories et resserrer les marges ; porter ces libellés à 11 px ailleurs.
- **Visuels** : [FIL-001](galerie/index.html#/surface/FIL-001) · **Surfaces** : FIL-001, FIL-016
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : entete-fil-permanent.spec.js exige que rail, envies et stories restent visibles : la proposition n'en retire aucun.
- **Critère d'acceptation** : À 320×568, la première carte commence au plus tard à 250 px ; aucun libellé de l'en-tête sous 11 px à 390 px.
- **Fichiers probables** : `styles.css`

### FIL-C24 — Une publication ne peut pas être corrigée : son menu n'offre que « Supprimer »

- **Emplacement** : Options de ma publication — `openPostOptions` (js/app-04-comments-shop.js:9-26)
- **Domaine** : Fil et interactions · **Nature** : friction · **Type** : hypothese
- **Preuve** : Capture FIL-062 : deux entrées, « Supprimer le post » et « Annuler ». Un commentaire, lui, se modifie (FIL-036).
- **Problème** : Une coquille oblige à supprimer puis republier (les j'aime et la discussion sont perdus).
- **Situation déclenchante** : Erreur dans un texte publié.
- **Conséquence pour l'utilisateur** : Perte d'interactions ou faute laissée en ligne.
- **Proposition** : À arbitrer par le produit : permettre de modifier le TEXTE d'une publication (mention « modifié »), comme pour un commentaire. Aucune maquette : ce serait une fonction nouvelle.
- **Visuels** : — · **Surfaces** : FIL-062
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : L · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Écriture sur `posts` (policy UPDATE auteur existante côté faux serveur ; à vérifier en production).
- **Critère d'acceptation** : Décision produit consignée ; si retenue : le texte modifié est visible après rechargement, sur un second compte.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-08-ui-modals-tour.js`

### FIL-C27 — Rien ne distingue la publication d'un compte privé  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Carte — en-tête (js/app-02-state-utils.js:10466-10485) ; filtre client des comptes privés (js/app-08-ui-modals-tour.js:4880-4882)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture FIL-090 : la carte d'un compte privé que je suis est identique aux autres ; « Partager » y est proposé. Observation du banc : avec un état local sans abonnements, la première lecture du fil écarte cette publication (le filtre client lit `state.user.following` avant qu'il soit chargé) ; elle n'apparaît qu'au rafraîchissement suivant (échec du premier passage du scénario « volume », donnees/echecs).
- **Problème** : On ne sait pas qu'on regarde un contenu réservé aux abonnés, au moment où l'on peut le partager.
- **Situation déclenchante** : Suivre un compte privé.
- **Conséquence pour l'utilisateur** : Risque de rediffuser sans le vouloir ce qu'un compte privé réservait.
- **Proposition** : Un cadenas discret près de l'heure (« Réservé aux abonnés ») ; vérifier ce que « Partager » propose pour ces publications (domaine « partage »).
- **Visuels** : — · **Surfaces** : FIL-090
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : La RLS reste la barrière : ne rien assouplir.
- **Critère d'acceptation** : La carte d'un compte privé porte une mention de visibilité lisible par un lecteur d'écran.
- **Fichiers probables** : `js/app-02-state-utils.js`

### PRO-C10 — Fermer un profil ouvert depuis une liste ramène au profil, pas à la liste

- **Emplacement** : _personRowHTML : closeModal();openUserProfile (app-06:1185)
- **Domaine** : Profils et passions · **Nature** : friction · **Type** : observation
- **Preuve** : Capture PRO-033 : Abonnés → Léa → × : retour sur mon profil, la liste a disparu.
- **Problème** : Parcourir ses abonnés un par un oblige à rouvrir la liste.
- **Situation déclenchante** : Visiter plusieurs abonnés.
- **Conséquence pour l'utilisateur** : Trois gestes de plus par personne.
- **Proposition** : Mémoriser la liste d'origine et la rouvrir à la fermeture du profil (ou empiler la modale).
- **Visuels** : [PRO-033](galerie/index.html#/surface/PRO-033) · **Surfaces** : PRO-033
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : Historique et bouton retour Android (openModal pose une entrée).
- **Critère d'acceptation** : Abonnés → profil → × : la liste « Abonnés » est de nouveau affichée, à la même position.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/app-04-comments-shop.js`

### PRO-C11 — « Toutes » est cité deux fois alors qu'aucun bouton ne porte ce nom

- **Emplacement** : État vide filtré (app-06:1458) ; confirmation d'archivage (app-06:2732)
- **Domaine** : Profils et passions · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture PRO-004 : « Touche « Toutes » pour revoir… » ; le rail n'a que des bulles. Le profil visité a déjà corrigé ce texte (app-04:4863).
- **Problème** : Consigne impossible à suivre.
- **Situation déclenchante** : Filtre qui vide l'écran ; archivage.
- **Conséquence pour l'utilisateur** : On cherche un bouton absent.
- **Proposition** : « Touche de nouveau la bulle X » ; « restent sur ton profil ».
- **Visuels** : [PRO-004](galerie/index.html#/surface/PRO-004) · **Surfaces** : PRO-004, PRO-040
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Tests de textes d'archivage.
- **Critère d'acceptation** : Aucun texte de Profil ou de Mes passions ne mentionne « Toutes ».
- **Fichiers probables** : `js/app-06-reels-partage.js`

### PRO-C18 — Photo : un fichier refusé ou un envoi raté ne dit rien

- **Emplacement** : _readAndCrop / changeCoverPhoto / changeAvatarPhoto / _syncProfilePhoto (app-06:1511-1710)
- **Domaine** : Profils et passions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde profils-07 : vidéo choisie → aucun recadreur, aucun message. D'après le code : toast « mise à jour » avant l'envoi, échec avalé (console.warn).
- **Problème** : Échecs silencieux.
- **Situation déclenchante** : Fichier non image, réseau coupé.
- **Conséquence pour l'utilisateur** : Photo perdue sans le savoir.
- **Proposition** : Message « Ce fichier n'est pas une image » ; annoncer le succès après l'envoi, sinon dire l'échec.
- **Visuels** : — · **Surfaces** : PRO-019, PRO-020
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Fichier non image : message visible ; Storage refusé : pas de toast de succès.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### PRO-C20 — Le profil d'une personne qui m'a bloquée reste visible avec Suivre et Message  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : openUserProfile (app-04:4287)
- **Domaine** : Profils et passions · **Nature** : clarte · **Type** : hypothese
- **Preuve** : Sonde profils-06 (faux serveur, policies recopiées) : profil et publication d'Inès visibles, Suivre proposé ; d'après le code, Suivre sera refusé (« Impossible de suivre … pour le moment »).
- **Problème** : Proposition d'actions vouées à l'échec, message trompeur « pour le moment ».
- **Situation déclenchante** : Ouvrir le profil de quelqu'un qui m'a bloqué.
- **Conséquence pour l'utilisateur** : Insistance involontaire envers quelqu'un qui a choisi de couper le lien.
- **Proposition** : À trancher côté règle métier (ce qu'un compte bloqué voit) ; au minimum un message de refus neutre.
- **Visuels** : — · **Surfaces** : PRO-030
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Décision produit sur la visibilité réciproque.
- **Risque de régression** : Ne jamais révéler explicitement « X t'a bloqué ».
- **Critère d'acceptation** : Règle décidée et appliquée ; aucun bouton menant à un refus certain.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PRO-C23 — Petites cibles et petits textes du domaine

- **Emplacement** : Réactiver 83 × 34 ; badge photo de passion 20 × 20 ; ⋯ et × du profil visité 34 × 34 ; curseur du recadreur 16 px ; dates d'activité 10,5 px
- **Domaine** : Profils et passions · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Sondes profils-03, 04, 07 ; capture PRO-006. Les compteurs du profil (40 px) sont déjà établis : SOC-C01.
- **Problème** : Cibles sous 44 px, textes sous 12 px.
- **Situation déclenchante** : Usage à une main.
- **Conséquence pour l'utilisateur** : Appuis manqués, lecture difficile.
- **Proposition** : Zones tactiles de 44 px (marge ou pseudo-élément), dates ≥ 12 px.
- **Visuels** : — · **Surfaces** : PRO-041, PRO-036, PRO-021, PRO-016, PRO-006
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Mise en page des cartes à 320 px.
- **Critère d'acceptation** : elementFromPoint rend la même commande sur 44 × 44 px pour chacune ; aucun texte < 12 px.
- **Fichiers probables** : `styles.css`, `js/app-06-reels-partage.js`, `js/app-04-comments-shop.js`

### CRE-C10 — Story et publication partent sans dire pour qui, ni combien de temps  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Éditeur story (#mePublishBtn) ; Studio (aucune lecture de isPrivate)
- **Domaine** : Création et médias · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture CRE-024 : seul « Publier ma story » ; la story part dans la passion courante (app-08:1655) sans choix ; l'ancien compositeur disait « Visible 24 h par ta communauté » (app-08:725).
- **Problème** : Durée, public et passion d'une story ne sont pas affichés ; un compte privé n'a aucun rappel.
- **Situation déclenchante** : Publier une story ; publier depuis un compte privé.
- **Conséquence pour l'utilisateur** : Doute sur la confidentialité, frein à partager.
- **Proposition** : Une ligne au-dessus de Publier : « Visible 24 h par ta communauté · 🎸 Musique » (maquette CRE-024) ; au Studio d'un compte privé, « Visible par tes abonnés ».
- **Visuels** : [CRE-024](galerie/index.html#/surface/CRE-024) · **Surfaces** : CRE-024, CRE-028, CRE-038
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Confirmer la règle de visibilité réelle des stories (RLS).
- **Risque de régression** : Texte seulement.
- **Critère d'acceptation** : L'éditeur story affiche durée, public et passion avant Publier.
- **Fichiers probables** : `index.html`, `js/app-08-ui-modals-tour.js`

### BOB-C13 — Commentaires de bobine : commandes minuscules et vouvoiement isolé

- **Emplacement** : Panneau — .reel-comments-close (styles.css:5136), .reel-comments-send (5338), pied de commentaire (app-05:3412-3416), placeholder index.html:1311
- **Domaine** : Bobines et stories · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Fermer « − » 28 × 28 px, envoi « ↑ » 36 × 36 px, j'aime / répondre / réagir 16 px de haut, sans libellé (sonde bobines-02) ; « Lancez la conversation... » alors que l'application tutoie.
- **Problème** : Cibles difficiles ; « − » ne dit pas « fermer ».
- **Situation déclenchante** : Tout commentaire de bobine.
- **Conséquence pour l'utilisateur** : Mauvais touchers, ton incohérent.
- **Proposition** : « Fermer » en toutes lettres à 44 px, envoi 44 px plein, zones de 44 px autour des icônes, « Écris un commentaire… ».
- **Visuels** : [BOB-020](galerie/index.html#/surface/BOB-020) · **Surfaces** : BOB-020
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Toutes les commandes du panneau mesurent ≥ 44 px ; le texte d'invite tutoie.
- **Fichiers probables** : `styles.css`, `index.html`, `js/app-05-config-profil.js`

### BOB-C21 — Ma story : ni « vue par », ni suppression, et elle s'insère au milieu des stories des autres  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : playCurrentStory app-08:1925 (⋯ réservé à autrui) ; buildStoryGroups app-08:574
- **Domaine** : Bobines et stories · **Nature** : friction · **Type** : observation
- **Preuve** : Aucune commande sur ma story ; après la dernière story de Léa, la suivante est la mienne (sonde bobines-03).
- **Problème** : Je ne peux pas retirer une story publiée par erreur ; je revois la mienne en parcourant celles des autres.
- **Situation déclenchante** : Avoir une story active.
- **Conséquence pour l'utilisateur** : Perte de contrôle sur son contenu.
- **Proposition** : « ⋯ » sur ma story : Supprimer (et « Vue par » si la donnée existe déjà) ; sortir mon groupe de l'enchaînement.
- **Visuels** : — · **Surfaces** : BOB-034, BOB-038
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : RLS de stories (suppression par l'auteur).
- **Critère d'acceptation** : Sur ma story, « Supprimer » retire la story ; le parcours des autres ne passe plus par la mienne.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`

### IRL-C10 — Carte plein écran : la seule sortie est l'icône d'entrée, sans libellé

- **Emplacement** : toggleIrlMapFullscreen (app-07:1838) ; .irl-map-expand
- **Domaine** : Rencontres IRL · **Nature** : friction · **Type** : observation
- **Preuve** : IRL-032 : la carte couvre l'écran et la barre basse ; en haut à droite, la même icône ⛶ ; croix de bulle ≈ 12 px ; texte d'aide « pince ou molette » (molette sur mobile).
- **Problème** : On ne sait pas comment revenir à la liste (le retour système marche, d'après le code, mais rien ne le dit).
- **Situation déclenchante** : Toucher plein écran.
- **Conséquence pour l'utilisateur** : Sentiment d'être enfermé dans la carte.
- **Proposition** : Bouton nommé « ✕ Fermer la carte » 44 px en haut à droite en plein écran ; croix de bulle 44 px.
- **Visuels** : [IRL-032](galerie/index.html#/surface/IRL-032) · **Surfaces** : IRL-032
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Entrée d'historique #carte (pushOverlayHistory) à garder cohérente.
- **Critère d'acceptation** : En plein écran, un bouton visible au libellé « Fermer la carte » referme la vue.
- **Fichiers probables** : `index.html`, `styles.css`, `js/app-07-ia-explore-irl.js`

### MSG-C28 — Champs sans étiquette, onglets et calques sans rôle

- **Emplacement** : Recherches, création de groupe, fenêtre membres, panneau Paramètres, calque d'appel
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Sondes 02, 03, 04, 05 : #convGlobalSearch, #_nmSearch, #grpSearchInput sans aria-label (placeholder seul, type text, pas d'enterkeyhint) ; ⋮, membres, appels nommés par `title` ; onglets Membres / Ajouter sans role=tab ; cases de membre et de passion sans état coché exposé ; panneau Paramètres et calque d'appel sans rôle de dialogue ; nom de groupe annoncé bouton sans action.
- **Problème** : Un lecteur d'écran n'annonce ni l'objet des champs ni l'état des choix.
- **Situation déclenchante** : Navigation assistée ou au clavier.
- **Conséquence pour l'utilisateur** : Parcours de messagerie peu praticable sans la vue.
- **Proposition** : aria-label sur les trois champs et les boutons d'icône, role=tab/aria-selected, aria-pressed sur les cases, role=dialog et focus sur les panneaux.
- **Visuels** : [MSG-020](galerie/index.html#/surface/MSG-020), [MSG-004](galerie/index.html#/surface/MSG-004) · **Surfaces** : MSG-004, MSG-001, MSG-020, MSG-084
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : La règle mécanique de app-08:2604 pose déjà role=button : ne pas la doubler.
- **Critère d'acceptation** : Les trois champs et tous les boutons d'icône de la messagerie ont un nom accessible non vide.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-05-config-profil.js`, `js/app-09-boot-pwa.js`, `index.html`

### MSG-C32 — Au-delà de 8 s de chargement, la liste affiche « Aucune conversation »

- **Emplacement** : renderMessages › squelette (js/app-04-comments-shop.js:5498–5519)
- **Domaine** : Messagerie · **Nature** : clarte · **Type** : hypothese
- **Preuve** : D'après le code : un minuteur de 8 s pose `_convNetLoaded = true` et rend l'état vide, que la lecture soit revenue ou non. Non reproduit au banc.
- **Problème** : Sur un réseau lent, l'écran affirme qu'il n'y a aucune conversation.
- **Situation déclenchante** : Stockage local vide et première lecture de plus de 8 s.
- **Conséquence pour l'utilisateur** : Inquiétude (« j'ai tout perdu »), puis apparition tardive de la liste.
- **Proposition** : Après 8 s : « Chargement plus long que prévu… » avec « Réessayer », jamais « Aucune conversation ».
- **Visuels** : — · **Surfaces** : MSG-075
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : feed-premier-rendu et suites de démarrage.
- **Critère d'acceptation** : Tant que la première lecture n'a pas répondu, l'écran n'affiche jamais « Aucune conversation ».
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C84 — Transférer : la conversation d'origine est proposée en premier et l'envoi part sans confirmation

- **Emplacement** : Conversation › Transférer — _forwardPick (js/app-04-comments-shop.js:6569-6580), _forwardTo (:6602-6736)
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Sonde 03, capture MSG-144 : « Transférer vers… » liste les 7 conversations, celle d'où vient le message en tête ; pas de recherche ; un toucher envoie et affiche « Transféré ». Les comptes bloqués ne sont pas filtrés (seules les archivées le sont).
- **Problème** : Un toucher sur la première ligne renvoie le message dans la conversation où il se trouve déjà ; une erreur de ligne envoie le message (ou la photo) à la mauvaise personne.
- **Situation déclenchante** : Transférer un message.
- **Conséquence pour l'utilisateur** : Doublon, ou divulgation à un tiers non voulu.
- **Proposition** : Retirer la conversation d'origine et les comptes bloqués de la liste, afficher l'avatar et le nom, et confirmer par un toast annulable ou une ligne « Transférer à Malik ? ».
- **Visuels** : [MSG-144](galerie/index.html#/surface/MSG-144) · **Surfaces** : MSG-144
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Copie de la pièce jointe vers la conversation cible (ASTRA-01) inchangée.
- **Critère d'acceptation** : La conversation d'origine n'apparaît pas dans « Transférer vers… » ; aucun message n'est inséré avant un second toucher.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PAR-C18 — Cibles de partage sous 44 px

- **Emplacement** : `.post-action` (carte, page, fiche) ; `.btn.block` des feuilles ; `.modal-close` (styles.css:1418) ; `.profile-dots-menu button` ; `[data-invite]` ; bouton de « Support »
- **Domaine** : Partage · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures des sondes 01, 03, 04, 05, 06 : icône de partage 44 × 31 ; boutons des feuilles 354 × 42 (173 × 42 pour les réseaux) ; « × » 34 × 34 ; entrées du menu ⋯ 196 × 38 ; « Inviter » 56 × 29 ; « Inviter des amis » (Support) 218 × 33.
- **Problème** : Appuis manqués ou à côté sur les commandes de partage.
- **Situation déclenchante** : Usage au pouce.
- **Conséquence pour l'utilisateur** : Erreurs, surtout sur « Inviter » (29 px, envoi immédiat).
- **Proposition** : 44 px minimum sur toutes ces cibles (la feuille unifiée les porte à 56 px).
- **Visuels** : [PAR-001](galerie/index.html#/surface/PAR-001), [PAR-023](galerie/index.html#/surface/PAR-023) · **Surfaces** : PAR-001, PAR-002, PAR-011, PAR-021, PAR-023, PAR-030, PAR-033
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Hauteur des feuilles à 360 × 640.
- **Critère d'acceptation** : `mesures.cibles.sous44` vide pour PAR-001, PAR-002, PAR-011, PAR-022, PAR-023 à 360 et 390 px.
- **Fichiers probables** : `styles.css`, `js/app-07-ia-explore-irl.js`

### SOC-C01 — Plusieurs commandes fréquentes mesurent moins de 44 px

- **Emplacement** : Barre supérieure (`.topbar-bell` Explorer 40 × 44, Notifications 41 × 44 ; zone « Mon profil » 170 × 36) ; Rechercher (bouton « OK » 40,9 × 28) ; Studio (pastilles d'envie 32–40 px de haut) ; Profil (compteurs 40 px de haut)
- **Domaine** : Transverse · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures automatiques (zone sondée par elementFromPoint) sur les 43 captures du socle, voir 05-MESURES.md.
- **Problème** : Cibles un peu étroites ou basses par rapport à l'acquis PASSIO de 44 px.
- **Situation déclenchante** : Usage à une main, pouce, mouvement ou tremblement.
- **Conséquence pour l'utilisateur** : Appuis manqués ou voisins (Explorer et Notifications sont collés), surtout sur la barre supérieure utilisée à chaque session.
- **Proposition** : Porter à 44 × 44 px la zone tactile (la taille visible peut rester la même : marge interne ou pseudo-élément mesuré par elementFromPoint) des icônes de la barre supérieure, du bouton « OK » et des pastilles d'envie.
- **Visuels** : [SOC-001](galerie/index.html#/surface/SOC-001) · **Surfaces** : SOC-001, SOC-002, SOC-003, SOC-005, SOC-006
- **Priorité** : P3 · **Gravité** : 2/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Décalage de la barre supérieure sur 320 px. Verrous : cadrage, ios-zones-sures.
- **Critère d'acceptation** : À 360 px, `elementFromPoint` rend la même commande sur 44 × 44 px autour du centre de chaque icône de la barre supérieure, du bouton « OK » et de chaque pastille d'envie.
- **Fichiers probables** : `styles.css`

### PCS-C04 — Le compteur d'abonnés ne bouge pas après « Suivre »

- **Emplacement** : Profil visité › `.main-profile-stats`
- **Domaine** : Parcours de bout en bout · **Nature** : polish · **Type** : observation
- **Preuve** : Capture PCS-003 : bouton « ✓ Suivi », toast « Tu suis Tom Girard ! », compteur « 0 ABONNÉS » inchangé ; la ligne follows est `accepted` sur le faux serveur.
- **Problème** : Deux informations contradictoires sur le même écran.
- **Situation déclenchante** : Suivre un compte depuis son profil.
- **Conséquence pour l'utilisateur** : Léger doute sur la prise en compte du geste.
- **Proposition** : Mettre à jour le compteur avec l'état du bouton (et le décrémenter au désabonnement) ; ne rien changer pour un compte privé (demande en attente).
- **Visuels** : [PCS-003](galerie/index.html#/surface/PCS-003) · **Surfaces** : PCS-003
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : CINQ surfaces peignent l'état de suivi (journal social-messagerie) : toutes doivent suivre.
- **Risque de régression** : Compte privé : ne pas compter une demande `pending`.
- **Critère d'acceptation** : Compte public : Suivre fait passer « Abonnés » de N à N+1 dans la même seconde ; Ne plus suivre le ramène à N ; compte privé : inchangé tant que la demande n'est pas acceptée.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-08-ui-modals-tour.js`

### PCS-C05 — La conversation ouverte depuis une publication ne rappelle pas ce qui l'a motivée

- **Emplacement** : Conversation neuve ouverte depuis un profil visité
- **Domaine** : Parcours de bout en bout · **Nature** : clarte · **Type** : hypothese
- **Preuve** : Capture PCS-004 : conversation vide, aucun rappel de la publication ou de l'activité d'origine.
- **Problème** : Premier message plus difficile à écrire sans le contexte sous les yeux (hypothèse).
- **Situation déclenchante** : Écrire à l'auteur d'une publication qu'on vient de lire.
- **Conséquence pour l'utilisateur** : Possible hésitation au premier message, moment décisif du passage à la rencontre.
- **Proposition** : À vérifier auprès d'utilisateurs avant toute construction. Piste légère : ouvrir « Message » depuis une publication en rappelant son titre au-dessus du champ, sans rien envoyer automatiquement.
- **Visuels** : [PCS-004](galerie/index.html#/surface/PCS-004) · **Surfaces** : PCS-004
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Lot UI-6C « Proposer un IRL » (aucun message automatique, aucune donnée déduite).
- **Risque de régression** : Ne rien envoyer ni publier automatiquement.
- **Critère d'acceptation** : Décision prise après test : si retenu, le rappel s'affiche, se ferme d'un geste et n'est jamais envoyé sans action explicite.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PCS-C06 — Le même geste d'inscription porte deux noms : « Je viens » et « Je participe »

- **Emplacement** : Rencontrer › carte d'activité (« Je viens ») ; fiche d'activité (« Je participe »)
- **Domaine** : Parcours de bout en bout · **Nature** : polish · **Type** : observation
- **Preuve** : Captures PCS-008 et SOC-002 (liste Rencontrer).
- **Problème** : Deux mots pour une même action.
- **Situation déclenchante** : Passer de la liste à la fiche.
- **Conséquence pour l'utilisateur** : Petite charge de compréhension ; incohérence perçue.
- **Proposition** : Choisir un seul libellé pour l'action et son état (« Je participe » / « Tu participes »), partout.
- **Visuels** : [PCS-008](galerie/index.html#/surface/PCS-008) · **Surfaces** : PCS-008
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Vocabulaire IRL (domaines irl-decouvrir et irl-fiche).
- **Risque de régression** : Tests qui cherchent le libellé exact.
- **Critère d'acceptation** : Une recherche du libellé non retenu dans index.html et js/ ne rend plus que des commentaires.
- **Fichiers probables** : `js/ui-v4a2-cartes.js`, `js/ui-v4b-fiche.js`

### FIL-C05 — Le même fil s'appelle « Discussion » ou « Commentaires », et son nombre passe de 34 à 37 en l'ouvrant

- **Emplacement** : Carte « 💬 34 » (app-02:10494) · feuille « Discussion », « Discussion (37) », « Discussion · 38 » (app-04:1318, 1374, 1494, 2331) · page « Commentaires (34) » (app-02:10584) · `nbCommentairesPost` (app-02:2407)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde fil-02 : la carte annonce 34, la feuille titre « Discussion (37) » une fois chargée (les 3 réponses s'ajoutent), puis « Discussion · N » après un envoi ; la page d'une publication titre « Commentaires (34) » (capture FIL-052). Trois écritures du titre dans le code.
- **Problème** : Deux mots pour un même objet et un compteur qui change de définition (commentaires, puis commentaires + réponses) dès qu'on ouvre le fil.
- **Situation déclenchante** : Ouvrir la discussion d'une publication qui a des réponses.
- **Conséquence pour l'utilisateur** : Doute sur le nombre réel ; vocabulaire instable.
- **Proposition** : Un seul mot (« Discussion ») et une seule forme (« Discussion · 34 commentaires »), fondée sur le compte des commentaires de premier niveau partout ; les réponses restent comptées sous leur commentaire.
- **Visuels** : [FIL-030](galerie/index.html#/surface/FIL-030), [FIL-050](galerie/index.html#/surface/FIL-050) · **Surfaces** : FIL-002, FIL-030, FIL-051
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Les verrous qui lisent le titre « Discussion (N) » (controle-general-2026-11-10 ⑤, commentaires-pagination) sont à réaligner.
- **Critère d'acceptation** : Carte, feuille et page affichent le même nombre pour une même publication, avant et après ouverture.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-02-state-utils.js`

### FIL-C09 — « Copier le texte » annonce « Texte copié » sans attendre le presse-papiers

- **Emplacement** : Options d'un commentaire — action « copy » (js/app-04-comments-shop.js:2430-2433) : la promesse de `navigator.clipboard.writeText` n'est pas attendue
- **Domaine** : Fil et interactions · **Nature** : fonctionnel · **Type** : observation
- **Preuve** : Sonde fil-04-ecritures (presse-papiers non autorisé dans le banc) : toasts ["Texte copié"], rejets non rattrapés : ["NotAllowedError"]. Le `try/catch` n'entoure qu'un appel asynchrone.
- **Problème** : Le succès est annoncé avant d'être connu.
- **Situation déclenchante** : Copier quand le navigateur refuse l'accès au presse-papiers.
- **Conséquence pour l'utilisateur** : Rien n'est copié alors que l'écran dit le contraire.
- **Proposition** : Attendre la promesse : « Texte copié » au succès, « Copie impossible » au refus (même aide que `partagerOuCopier`).
- **Visuels** : — · **Surfaces** : FIL-034
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucun.
- **Critère d'acceptation** : Presse-papiers refusé : le toast dit « Copie impossible ».
- **Fichiers probables** : `js/app-04-comments-shop.js`

### FIL-C16 — Le séparateur « Exemples PASSIO » prend quatre lignes de 12 px et deux boutons

- **Emplacement** : Séparateur — `poserSeparateurExemples` (js/app-02-state-utils.js:8595-8644), .feed-exemples-sep (styles.css:11549-11594)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture FIL-070 : quatre lignes centrées en 12 px gris, puis « Publier la première » et « Inviter quelqu'un », avant la première carte (qui commence à ~475 px).
- **Problème** : Le message juste (réel d'abord, exemples ensuite) est long et pâle à l'endroit où il compte.
- **Situation déclenchante** : Compte sans publication réelle dans ses passions (cas de tout compte neuf).
- **Conséquence pour l'utilisateur** : Lu en diagonale ; le contenu descend.
- **Proposition** : Une phrase en 13 px à l'encre (« Personne de ta communauté n'a encore publié ici : voici des exemples. »), mêmes deux gestes.
- **Visuels** : [FIL-070](galerie/index.html#/surface/FIL-070) · **Surfaces** : FIL-070, FIL-019
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Textes lus par fil-reel-dabord.spec.js : à réaligner.
- **Critère d'acceptation** : Le séparateur « seul » mesure au plus 170 px de haut à 390 px ; son texte est ≥ 13 px.
- **Fichiers probables** : `js/app-02-state-utils.js`, `styles.css`

### FIL-C18 — Une photo qui ne charge pas laisse un rectangle gris muet

- **Emplacement** : Carte photo — `onerror` (js/app-02-state-utils.js:10349-10356)
- **Domaine** : Fil et interactions · **Nature** : polish · **Type** : observation
- **Preuve** : Capture FIL-012 (adresse d'image en 404) : boîte #eee de 200 px, sans texte.
- **Problème** : L'échec n'est pas dit et le gris #eee est hors palette.
- **Situation déclenchante** : Média supprimé, réseau instable, bloqueur.
- **Conséquence pour l'utilisateur** : Carte qui paraît cassée.
- **Proposition** : Boîte plus basse sur lavis `--accent-tile` avec « Image indisponible ».
- **Visuels** : [FIL-012](galerie/index.html#/surface/FIL-012) · **Surfaces** : FIL-012
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le `onerror` est écrit d'un seul tenant (audit:echappement).
- **Critère d'acceptation** : Une image en échec affiche un libellé lisible sur un fond de la palette.
- **Fichiers probables** : `js/app-02-state-utils.js`, `styles.css`

### FIL-C19 — Une photo très haute occupe plus d'un écran

- **Emplacement** : Carte photo — image en `width:100%` sans plafond (js/app-02-state-utils.js:10349-10356)
- **Domaine** : Fil et interactions · **Nature** : friction · **Type** : jugement
- **Preuve** : Capture FIL-008 : la photo (rapport ~1:2,2) dépasse la hauteur visible ; ni l'auteur ni les actions ne sont à l'écran avec elle.
- **Problème** : Le fil perd son rythme et la carte ses repères.
- **Situation déclenchante** : Capture d'écran ou photo verticale très allongée.
- **Conséquence pour l'utilisateur** : Défilement long sans commande.
- **Proposition** : Plafonner la hauteur dans le fil (≈ 480 px, recadrage centré) ; l'image entière reste sur la page de la publication.
- **Visuels** : [FIL-008](galerie/index.html#/surface/FIL-008) · **Surfaces** : FIL-008
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : cadrage.spec.js ; ne pas rogner les photos portrait ordinaires (4:5).
- **Critère d'acceptation** : Dans le fil à 390×844, aucune image ne dépasse 480 px de haut.
- **Fichiers probables** : `styles.css`

### FIL-C21 — La vidéo du fil montre un cadre noir et deux commandes de lecture

- **Emplacement** : Carte vidéo — `videoPubliqueHTML` (js/app-02-state-utils.js:4224-4228)
- **Domaine** : Fil et interactions · **Nature** : polish · **Type** : observation
- **Preuve** : Capture FIL-010 : bouton « ▶ Lire » superposé aux commandes natives (lecture, volume, plein écran, menu) sur fond noir, sans image d'aperçu (`preload="none"`). Fichier de substitution du banc.
- **Problème** : Deux façons de lancer la lecture et aucune idée du contenu avant de la lancer.
- **Situation déclenchante** : Publication vidéo dans le fil.
- **Conséquence pour l'utilisateur** : Carte peu engageante ; commandes natives de 0:00 inutiles avant lecture.
- **Proposition** : Masquer les commandes natives tant que la lecture n'a pas commencé ; afficher une image d'aperçu quand elle existe.
- **Visuels** : — · **Surfaces** : FIL-010
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Lecture automatique et économie de données (`preferencesVideoPublique`) ; iOS exige `playsinline`.
- **Critère d'acceptation** : Avant lecture, une seule commande « Lire » est visible sur la vidéo.
- **Fichiers probables** : `js/app-02-state-utils.js`

### FIL-C22 — « Post », « publication », « Passio », « feed » : quatre mots pour une publication et son fil

- **Emplacement** : « Options du post », « Supprimer le post », « Supprimer ce post ? », « Post supprimé. » (app-04:19, 218, 261) · titre « Post » (index.html:1259) · « Charger plus de posts » (app-02:9802) · « Aucun post pour cette sélection » (app-02:9886) · « Signaler cette publication » (app-04:40) · « Publier une Passio » (ui-v2-shell.js:761)
- **Domaine** : Fil et interactions · **Nature** : polish · **Type** : observation
- **Preuve** : Captures FIL-050, FIL-062, FIL-063, FIL-091, FIL-072 et lecture du code (lignes citées).
- **Problème** : Le même objet change de nom d'un écran à l'autre, parfois dans la même feuille.
- **Situation déclenchante** : Parcours ordinaire du fil.
- **Conséquence pour l'utilisateur** : Vocabulaire hésitant, anglicismes dans une interface en français.
- **Proposition** : « Publication » partout (« Supprimer la publication », « Afficher plus de publications »), « fil » pour le fil.
- **Visuels** : [FIL-050](galerie/index.html#/surface/FIL-050) · **Surfaces** : FIL-050, FIL-062, FIL-063, FIL-091, FIL-072
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Nombreux verrous lisent ces libellés (suppression-durable, interactions).
- **Critère d'acceptation** : Aucune chaîne visible du fil ne contient « post » ou « feed ».
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-02-state-utils.js`, `index.html`, `js/ui-v2-shell.js`

### FIL-C23 — Les menus mêlent emojis et pictogrammes comme icônes de fonction

- **Emplacement** : Options d'un commentaire (js/app-04-comments-shop.js:2391-2408), d'une publication d'autrui (37-46), de ma publication (19-21)
- **Domaine** : Fil et interactions · **Nature** : polish · **Type** : observation
- **Preuve** : Captures FIL-034 (💬 😊 🎬 📋 🔕 🚫 ⚠️), FIL-060 (🚩 🚫), FIL-062 (corbeille SVG). Deux entrées « Réagir avec un emoji » et « Réagir avec un GIF » ouvrent des panneaux voisins.
- **Problème** : Trois menus contextuels, trois styles d'icône ; l'identité demande des SVG `currentColor` pour les fonctions.
- **Situation déclenchante** : Ouvrir un « ⋯ ».
- **Conséquence pour l'utilisateur** : Aspect hétérogène ; rendu des emojis variable selon l'appareil.
- **Proposition** : Pictogrammes SVG dans les trois menus ; une seule entrée « Réagir » ; même feuille pour les deux menus (aujourd'hui `openModal` pour l'un, `#cmtSheet` pour l'autre).
- **Visuels** : [FIL-034](galerie/index.html#/surface/FIL-034), [FIL-060](galerie/index.html#/surface/FIL-060) · **Surfaces** : FIL-034, FIL-035, FIL-060
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Les trois menus « ⋯ » du fil emploient le même gabarit et aucune icône en emoji.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### FIL-C25 — Le bandeau hors ligne recouvre la barre du haut

- **Emplacement** : `#offlineBanner` — position fixe en haut, z-index 9999 (index.html:1250-1253)
- **Domaine** : Fil et interactions · **Nature** : polish · **Type** : observation
- **Preuve** : Capture FIL-076 (hors ligne simulé) : le bandeau « Mode hors-ligne — contenu en cache » masque le logo et les boutons Rechercher, Notifications et Menu ; sa croix de fermeture est un « × » de 16 px.
- **Problème** : Pendant la coupure, trois commandes de la barre sont inatteignables tant qu'on n'a pas fermé le bandeau, dont la croix est petite.
- **Situation déclenchante** : Perte de réseau.
- **Conséquence pour l'utilisateur** : Barre du haut masquée.
- **Proposition** : Faire pousser le contenu par le bandeau (ou le poser sous la barre), croix à 44 px.
- **Visuels** : — · **Surfaces** : FIL-076
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : cadrage.spec.js (hauteur du shell).
- **Critère d'acceptation** : Hors ligne, les boutons de la barre du haut restent visibles et touchables.
- **Fichiers probables** : `index.html`, `styles.css`

### FIL-C26 — L'aperçu des commentaires d'une carte affiche « 🤍 0 » pour un commentaire aimé

- **Emplacement** : Carte › aperçu de deux commentaires — `commentsPreview` (js/app-02-state-utils.js:10388-10419) ; aperçus servis sans interactions (`fil_compteurs`)
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture FIL-003 : « 🤍 0 » sous un commentaire qui porte deux j'aime en base (visible « 🤍 2 » dans la discussion, FIL-030). Les trois actions de l'aperçu (🤍 💬 😊) font 28 × 40 px et leurs avatars sont focalisables sans nom (fiche FIL-002--m390, mesures.sansNom).
- **Problème** : L'aperçu se présente comme interactif mais ses compteurs sont faux tant que la discussion n'a pas été ouverte.
- **Situation déclenchante** : Lire une carte commentée.
- **Conséquence pour l'utilisateur** : Chiffres contradictoires entre la carte et la discussion.
- **Proposition** : Aperçu en lecture seule (auteur, texte, heure) : un toucher ouvre la discussion, où les compteurs sont justes.
- **Visuels** : [FIL-003](galerie/index.html#/surface/FIL-003) · **Surfaces** : FIL-003
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : `likeComment` et `_patchCmtLike` ciblent aussi ces boutons ([data-cmtlike]).
- **Critère d'acceptation** : Aucun compteur de j'aime d'un commentaire n'est affiché avant que ses interactions aient été lues.
- **Fichiers probables** : `js/app-02-state-utils.js`

### FIL-C28 — La suite du fil se demande au bouton « ⤵ Charger plus de posts »

- **Emplacement** : Bas de fil — `moreBtnHtml` (js/app-02-state-utils.js:9802), `loadMoreFeedPosts` (js/app-08-ui-modals-tour.js:9260)
- **Domaine** : Fil et interactions · **Nature** : friction · **Type** : jugement
- **Preuve** : Captures FIL-091 et FIL-092 (fil de 80 publications) : 20 cartes, puis un bouton ; après le toucher, la suite s'ajoute sous la position de lecture, sans saut. Le chargement automatique (`feed_window_v1`) est coupé par défaut (fiche 14).
- **Problème** : Geste manuel toutes les 20 publications ; flèche « ⤵ » et mot « posts ».
- **Situation déclenchante** : Lire plus de 20 publications.
- **Conséquence pour l'utilisateur** : Interruption de lecture.
- **Proposition** : Garder le bouton tant que le fenêtrage n'est pas levé (préalable documenté), le renommer « Afficher la suite » et montrer « Chargement… » pendant la lecture.
- **Visuels** : — · **Surfaces** : FIL-091
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : Levée du drapeau `feed_window_v1` (fiche lots-ui 14).
- **Risque de régression** : feed-window.spec.js, capacite-fil-cache.spec.js.
- **Critère d'acceptation** : Le bouton de pagination ne contient pas le mot « posts » et indique son état pendant la lecture.
- **Fichiers probables** : `js/app-02-state-utils.js`

### FIL-C29 — La saisie d'un commentaire s'arrête à 400 caractères sans le dire

- **Emplacement** : `#newComment` `maxlength="400"` (js/app-04-comments-shop.js:1323) ; refus « Trop court » sous 2 caractères (1449)
- **Domaine** : Fil et interactions · **Nature** : friction · **Type** : observation
- **Preuve** : Capture FIL-032 : texte long en cours de saisie, aucun compteur ; le champ cesse d'accepter des caractères à 400. Le toast « Trop court » ne dit pas le minimum.
- **Problème** : Limite invisible.
- **Situation déclenchante** : Écrire un commentaire long.
- **Conséquence pour l'utilisateur** : Fin de phrase coupée sans explication.
- **Proposition** : Afficher « 380 / 400 » à partir de 350 caractères ; toast « Écris au moins 2 caractères ».
- **Visuels** : — · **Surfaces** : FIL-032
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Au-delà de 350 caractères, un compteur est visible sous le champ.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### FIL-C30 — « Passionnés à découvrir » propose d'abord des comptes que je suis déjà

- **Emplacement** : Module inséré dans le fil — js/ui-v2-shell.js:704-730
- **Domaine** : Fil et interactions · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture FIL-005 (avant, ~6 s après l'ouverture) : le module liste Léa Fontaine, Malik Benali et Marie-Charlotte…, tous trois suivis ; après un repeint (FIL-005 après) il liste d'autres comptes. Capture FIL-018.
- **Problème** : Le module est peint avant la lecture des abonnements et n'est pas repeint ensuite.
- **Situation déclenchante** : Ouverture de l'application sur un appareil dont l'état local ne connaît pas encore les abonnements.
- **Conséquence pour l'utilisateur** : Suggestions sans objet.
- **Proposition** : Repeindre le module à l'arrivée des abonnements (même moment que FIL-C01).
- **Visuels** : — · **Surfaces** : FIL-018
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : 10 s après l'ouverture, le module ne liste aucun compte déjà suivi.
- **Fichiers probables** : `js/ui-v2-shell.js`

### PRO-C08 — Mon profil et le profil visité ne disent pas les mêmes choses

- **Emplacement** : Compteurs (« posts » vs « passions »), filtres (« Posts » vs « Tout », « Audio / podcast » vs « Audio »), état vide « Rien à afficher pour cette sélection » sans filtre
- **Domaine** : Profils et passions · **Nature** : clarte · **Type** : jugement
- **Preuve** : Sonde profils-03 : POSTS · ABONNÉS · ABONNEMENTS chez l'autre, ABONNÉS · PASSIONS · ABONNEMENTS chez moi ; compteurs du profil visité non cliquables ; « Créer un post » sur mon état vide.
- **Problème** : Deux écrans jumeaux, deux vocabulaires (et l'anglicisme « post »).
- **Situation déclenchante** : Passer de son profil à celui d'un autre.
- **Conséquence pour l'utilisateur** : Moins de repères ; impression de produit inachevé.
- **Proposition** : « publications » partout ; mêmes libellés de filtres ; état vide sans « sélection » quand rien n'est filtré.
- **Visuels** : — · **Surfaces** : PRO-021, PRO-024, PRO-002
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Tests de libellés.
- **Critère d'acceptation** : Aucune occurrence visible de « posts » / « Posts » / « Audio / podcast » sur les deux profils.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-06-reels-partage.js`, `index.html`

### PRO-C09 — Listes Abonnés / Abonnements : emoji au lieu des photos, rendus différents, double « × »

- **Emplacement** : _personRowHTML / openFollowersList (app-06:1184-1232)
- **Domaine** : Profils et passions · **Nature** : polish · **Type** : observation
- **Preuve** : Capture PRO-008 : Léa (avatar_url renseigné) montrée en emoji ; « Abonnés » sans passions, « Abonnements » avec ; deux éléments « Fermer » superposés (bouton d'openModal + span) ; lignes en div sans rôle.
- **Problème** : On reconnaît mal les personnes.
- **Situation déclenchante** : Parcourir ses abonnés.
- **Conséquence pour l'utilisateur** : Découverte entre passionnés moins efficace ; lecteur d'écran : deux « Fermer », lignes non annoncées.
- **Proposition** : Charger avatar_url et passions ; même ligne dans les deux listes ; une seule fermeture ; rôle bouton.
- **Visuels** : [PRO-008](galerie/index.html#/surface/PRO-008) · **Surfaces** : PRO-008, PRO-010
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Une ligne d'abonné montre la photo si avatar_url existe et ses passions ; un seul élément « Fermer » dans la modale.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### PRO-C12 — L'aide des passions parle de « place » et de « changement » alors que le plafond est levé

- **Emplacement** : openPassionsAide (app-06:2664-2666)
- **Domaine** : Profils et passions · **Nature** : clarte · **Type** : observation
- **Preuve** : Sonde profils-04 : « tu peux la réactiver quand une place et un changement sont disponibles », phrase non conditionnée à plafondPassionsActif().
- **Problème** : Règle obsolète présentée comme actuelle.
- **Situation déclenchante** : Ouvrir l'aide de « Mes passions ».
- **Conséquence pour l'utilisateur** : Peur d'archiver ; doute sur la gratuité.
- **Proposition** : Conditionner la fin de phrase au plafond actif ; sinon « tu peux la réactiver quand tu veux ».
- **Visuels** : — · **Surfaces** : PRO-037
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Plafond levé : l'aide ne contient ni « place » ni « changement ».
- **Fichiers probables** : `js/app-06-reels-partage.js`

### PRO-C13 — « Mes passions » : en-tête redondant, trois emojis par carte, badge photo de 20 px

- **Emplacement** : #passionsResume + titre « Passions actives » ; .v8-passion-card
- **Domaine** : Profils et passions · **Nature** : polish · **Type** : jugement
- **Preuve** : Sonde profils-04 : « 3 passions actives » (icône de personnes) puis titre « Passions actives » 26 px ; carte « 🎸 » + badge 📷 + « 🎸 Musique » ; badge 20 × 20.
- **Problème** : La même information deux fois, emojis répétés.
- **Situation déclenchante** : Ouvrir la page.
- **Conséquence pour l'utilisateur** : Page plus chargée qu'elle ne devrait.
- **Proposition** : Un compteur dans le titre de rubrique, un seul emoji (avatar), badge 28 px avec zone de 44 px.
- **Visuels** : — · **Surfaces** : PRO-036
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Tests de l'en-tête (_rendrePagePassionsEntete).
- **Critère d'acceptation** : Une seule mention du nombre de passions actives ; badge ≥ 44 px de zone tactile.
- **Fichiers probables** : `js/app-06-reels-partage.js`, `styles.css`

### PRO-C14 — Vocabulaire hérité du multi-profil : « Mon profil principal », « Bio de ce profil »

- **Emplacement** : openEditMainProfile (app-06:1943), openEditPassionProfile (app-06:3513)
- **Domaine** : Profils et passions · **Nature** : clarte · **Type** : observation
- **Preuve** : Captures PRO-011 : titre « Mon profil principal », libellés 16 px casse normale puis 11 px capitales ; sonde profils-08 : « ✏️ 🎸 Musique », « Bio de ce profil ».
- **Problème** : Laisse croire à plusieurs profils (contraire d'ADR-011).
- **Situation déclenchante** : Éditer son profil ou une passion.
- **Conséquence pour l'utilisateur** : Confusion personne / passion.
- **Proposition** : « Modifier mon profil », « Modifier « Musique » », « Ce que tu partages ici » ; un seul style de libellé.
- **Visuels** : [PRO-011](galerie/index.html#/surface/PRO-011) · **Surfaces** : PRO-011, PRO-039
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Tests de libellés de modales.
- **Critère d'acceptation** : Aucune occurrence de « profil principal » ni « de ce profil » ; libellés de champs d'un seul style.
- **Fichiers probables** : `js/app-06-reels-partage.js`

### PRO-C16 — Le crayon « Modifier le profil » ouvre un menu de six options

- **Emplacement** : #v6bModifier (ui-v6b-profil.js) → openMainProfileMenu
- **Domaine** : Profils et passions · **Nature** : clarte · **Type** : jugement
- **Preuve** : Capture PRO-007 : crayon → Modifier, Photo de profil, Photo de couverture, Gérer mes passions, Apparence & thème, Inviter des amis.
- **Problème** : L'icône promet une chose, le bouton en propose six.
- **Situation déclenchante** : Chercher « Mes passions » ou l'invitation.
- **Conséquence pour l'utilisateur** : Ces entrées restent introuvables pour qui ne pense pas « éditer ».
- **Proposition** : Icône « ⋯ » (convention des autres profils et cartes) et nom « Options du profil ».
- **Visuels** : [PRO-007](galerie/index.html#/surface/PRO-007) · **Surfaces** : PRO-007, PRO-001
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Ancre de l'aide « second profil » (#v6bModifier).
- **Critère d'acceptation** : Le bouton porte l'icône ⋯ et un nom accessible « Options du profil ».
- **Fichiers probables** : `js/ui-v6b-profil.js`, `styles.css`

### PRO-C17 — Profil visité : deux boutons « pleins », 39 px de haut, texte de 12 px

- **Emplacement** : #visitedProfileActions (app-04:4617-4620)
- **Domaine** : Profils et passions · **Nature** : accessibilite · **Type** : jugement
- **Preuve** : Sonde profils-03 : Message (dégradé) et « ✓ Suivi » (violet plein) 173 × 39 ; ⋯ et × 34 × 34.
- **Problème** : Un état (« Suivi ») est plus fort que l'action ; cibles basses.
- **Situation déclenchante** : Visiter un profil suivi.
- **Conséquence pour l'utilisateur** : Hiérarchie confuse ; appuis manqués.
- **Proposition** : « ✓ Suivi » en contour, Message seule action pleine ; 44 px, 14 px.
- **Visuels** : — · **Surfaces** : PRO-021
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : _peindreBoutonsSuivi peint le style inline des trois états.
- **Critère d'acceptation** : Boutons ≥ 44 px ; état « suivi » non plein.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PRO-C19 — « Ajouter une passion » propose des passions que j'ai déjà

- **Emplacement** : Sélecteur js/passion-selector.js (idées)
- **Domaine** : Profils et passions · **Nature** : polish · **Type** : observation
- **Preuve** : Sonde profils-04 : Musique et Photo (miennes) dans « Quelques idées » ; « Musculation » et « Musculation et fitness » ; Piano en 🎸 ; exemple de saisie tronqué.
- **Problème** : Idées sans tenir compte du compte.
- **Situation déclenchante** : Ajouter une passion.
- **Conséquence pour l'utilisateur** : Bruit, doute sur ce qui est ajouté.
- **Proposition** : Exclure ou marquer « Déjà ajoutée » ; dédoublonner les idées.
- **Visuels** : — · **Surfaces** : PRO-043
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Aucune passion vivante du compte n'est proposée comme idée actionnable.
- **Fichiers probables** : `js/passion-selector.js`

### PRO-C21 — La pastille du nombre de publications est rognée sur le rail des passions

- **Emplacement** : #v9ProfilePassions .profile-tile-count (passionTileHTML, app-02 : vignette en overflow:hidden, pastille à top/right -5 px)
- **Domaine** : Profils et passions · **Nature** : polish · **Type** : observation
- **Preuve** : Capture PRO-001, gros plan « rail » : « 4 », « 2 », « 1 » coupés à moitié.
- **Problème** : Chiffre illisible.
- **Situation déclenchante** : Toute vignette avec photo.
- **Conséquence pour l'utilisateur** : Information perdue.
- **Proposition** : Poser la pastille dans la vignette (top/right 1 px) ou hors du conteneur rogné.
- **Visuels** : [PRO-001](galerie/index.html#/surface/PRO-001) · **Surfaces** : PRO-001
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Même composant au Fil (règle propre en styles.css:9805).
- **Critère d'acceptation** : La pastille est entièrement visible à 360 et 390 px.
- **Fichiers probables** : `js/app-02-state-utils.js`, `styles.css`

### PRO-C22 — « Signaler ce compte » hérite du plein écran du profil et le remplace

- **Emplacement** : reportUser → _demanderMotifSignalement, classe .modal-fullscreen laissée par openUserProfile
- **Domaine** : Profils et passions · **Nature** : polish · **Type** : observation
- **Preuve** : Sonde profils-08 : modale plein écran presque vide, poignée en haut, « Envoyer le signalement » sur deux lignes ; le profil est perdu.
- **Problème** : Mise en page incohérente ; pas de retour au profil.
- **Situation déclenchante** : Signaler depuis un profil.
- **Conséquence pour l'utilisateur** : Désorientation dans un geste déjà délicat.
- **Proposition** : Retirer .modal-fullscreen à l'ouverture d'une autre modale ; revenir au profil après Annuler.
- **Visuels** : — · **Surfaces** : PRO-032
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Autres modales ouvertes depuis le profil visité.
- **Critère d'acceptation** : La modale de signalement s'affiche en feuille basse ; Annuler ramène au profil.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-08-ui-modals-tour.js`

### CRE-C06 — « MOOD » en anglais, pastilles 40 px / 11 px, ordre différent du Fil

- **Emplacement** : Studio — index.html:940-956 ; styles.css:9438-9452
- **Domaine** : Création et médias · **Nature** : clarte · **Type** : observation
- **Preuve** : Mesure : pastilles 49-81 × 40 px, texte 11 px (sonde creation-01) ; titre « MOOD » ; Fil : rail « Envie du moment » Explorer · Apprendre · Idées · Rencontrer. Rejoint SOC-C01.
- **Problème** : Un mot anglais pour un choix qui pilote le classement, des cibles sous 44 px, un ordre qui change entre écrire et lire.
- **Situation déclenchante** : Chaque publication.
- **Conséquence pour l'utilisateur** : Choix compris de travers ou ignoré ; erreurs de toucher.
- **Proposition** : « Envie », pastilles 44 px / 13 px dans l'ordre du rail (maquette CRE-002).
- **Visuels** : [CRE-002](galerie/index.html#/surface/CRE-002) · **Surfaces** : CRE-002
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : SOC-C01 (socle).
- **Risque de régression** : Valeurs creation/learn/irl/all inchangées (fiche lots-ui 07) ; studio-moods.spec.js lit les libellés.
- **Critère d'acceptation** : Le bloc s'intitule « Envie » ; chaque pastille mesure ≥ 44 px de haut à 360 px.
- **Fichiers probables** : `index.html`, `styles.css`

### CRE-C11 — Les panneaux emojis et GIF recouvrent la barre d'outils et ne se referment qu'en choisissant

- **Emplacement** : meAddEmoji app-08:1456-1467 (bottom 84 px), meAddGif app-08:1468
- **Domaine** : Création et médias · **Nature** : friction · **Type** : observation
- **Preuve** : Captures CRE-026, CRE-027 : le panneau couvre 😀/GIF ; 3 emojis par ligne sur 20.
- **Problème** : Le bouton qui refermerait le panneau est dessous.
- **Situation déclenchante** : Ouvrir les emojis ou les GIF.
- **Conséquence pour l'utilisateur** : Obligé de poser un emoji pour sortir.
- **Proposition** : Panneau au-dessus des outils, pleine largeur, 44 px par emoji (maquette CRE-026) ; toucher hors du panneau le referme.
- **Visuels** : [CRE-026](galerie/index.html#/surface/CRE-026) · **Surfaces** : CRE-026, CRE-027
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : passioGifPanel partagé avec la messagerie.
- **Critère d'acceptation** : Panneau ouvert, le bouton 😀 reste visible et le referme.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`

### CRE-C12 — « Recommencer » quasi invisible sur l'aperçu de bobine

- **Emplacement** : js/ui-v7-lot.js:346-357 (btn ghost sur fond sombre)
- **Domaine** : Création et médias · **Nature** : polish · **Type** : observation
- **Preuve** : Capture CRE-019 : texte gris sur fond translucide sombre.
- **Problème** : L'issue de reprise ne se voit pas.
- **Situation déclenchante** : Aperçu d'une bobine.
- **Conséquence pour l'utilisateur** : On continue faute de voir qu'on peut refaire.
- **Proposition** : Contour blanc, texte blanc, 48 px (maquette CRE-019).
- **Visuels** : [CRE-019](galerie/index.html#/surface/CRE-019) · **Surfaces** : CRE-019
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : ui-v7-bobine-camera.spec.js.
- **Critère d'acceptation** : Contraste du libellé ≥ 4,5:1 sur l'aperçu.
- **Fichiers probables** : `styles.css`

### CRE-C13 — La bobine choisit sa passion autrement que le Studio, et sans envie

- **Emplacement** : Feuille « Ta bobine » — ui-v7-lot.js:403-404, 487-519 ; mood « creation » forcé app-08:1682
- **Domaine** : Création et médias · **Nature** : clarte · **Type** : observation
- **Preuve** : Capture CRE-020 : « Passion » en liste native des passions du compte ; le Studio dit « Publier dans : » et ouvre la recherche plate.
- **Problème** : Deux sélecteurs, deux mots ; toute bobine est classée « Idées ».
- **Situation déclenchante** : Publier une bobine.
- **Conséquence pour l'utilisateur** : Incohérence ; une bobine « Rencontrer » est impossible.
- **Proposition** : « Publier dans » + même sélecteur que le Studio ; ajouter la rangée « Envie » si le produit le souhaite.
- **Visuels** : [CRE-020](galerie/index.html#/surface/CRE-020) · **Surfaces** : CRE-020
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : faible
- **Dépendances** : CRE-C02 (règle d'ajout au compte).
- **Risque de régression** : passionDeRepartage / publicationRefuseeFautePassion avant meClose (app-08:1637-1646).
- **Critère d'acceptation** : La feuille de bobine et le Studio utilisent le même libellé et le même sélecteur de passion.
- **Fichiers probables** : `js/ui-v7-lot.js`, `js/app-08-ui-modals-tour.js`

### CRE-C15 — « Post » et « publication » alternent ; « Photo / vidéo » cache le texte seul

- **Emplacement** : Toasts app-06:5413, 5420 ; menu app-04:21 ; feuille Créer ui-v2-shell.js:126
- **Domaine** : Création et médias · **Nature** : clarte · **Type** : observation
- **Preuve** : « Post publié », « Post en local », « Supprimer le post » vs « Publication » (feuille), « Associer cette publication » (sélecteur), « Publication envoyée » (rejeu app-08:1804).
- **Problème** : Deux mots pour une chose ; sous-titre trompeur.
- **Situation déclenchante** : Créer, publier, supprimer.
- **Conséquence pour l'utilisateur** : Petite friction de compréhension.
- **Proposition** : « Publication » partout ; sous-titre « Texte, photo ou vidéo » (maquette CRE-001).
- **Visuels** : [CRE-001](galerie/index.html#/surface/CRE-001) · **Surfaces** : CRE-001, CRE-013, CRE-017
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Tests qui lisent les toasts.
- **Critère d'acceptation** : Aucun texte visible du domaine ne contient « post ».
- **Fichiers probables** : `js/app-06-reels-partage.js`, `js/app-04-comments-shop.js`, `js/ui-v2-shell.js`

### CRE-C16 — Une publication ne peut pas être corrigée, seulement supprimée  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Menu ⋯ — app-04-comments-shop.js:9-26
- **Domaine** : Création et médias · **Nature** : friction · **Type** : hypothese
- **Preuve** : Capture CRE-017 : « Supprimer le post · Annuler ».
- **Problème** : Une coquille ou une mauvaise passion impose de supprimer (réactions perdues) et de republier.
- **Situation déclenchante** : Erreur après publication.
- **Conséquence pour l'utilisateur** : Hypothèse : publications erronées laissées en ligne ou supprimées avec leurs réactions.
- **Proposition** : Vérifier le besoin auprès des testeurs avant tout développement ; s'il est confirmé, « Modifier le texte » seul.
- **Visuels** : [CRE-017](galerie/index.html#/surface/CRE-017) · **Surfaces** : CRE-017, CRE-040
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Décision produit ; policy UPDATE sur posts.
- **Risque de régression** : RLS posts.
- **Critère d'acceptation** : Décision documentée.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### CRE-C17 — Sélecteur de passion : titre sous la croix, « + » qui ne marque pas la sélection

- **Emplacement** : js/passion-search-selector.js (.psel-titre, .psel-item-plus)
- **Domaine** : Création et médias · **Nature** : polish · **Type** : observation
- **Preuve** : Captures CRE-004/005 : « une » du titre passe sous le bouton Fermer ; la ligne choisie garde son « + ».
- **Problème** : Chevauchement ; état choisi lisible seulement dans la pastille du haut.
- **Situation déclenchante** : Ouvrir le sélecteur à 390 px.
- **Conséquence pour l'utilisateur** : Finition.
- **Proposition** : Marge droite du titre = largeur de la croix ; « ✓ » sur la ligne choisie.
- **Visuels** : [CRE-005](galerie/index.html#/surface/CRE-005) · **Surfaces** : CRE-004, CRE-005
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Composant partagé avec Rencontrer.
- **Risque de régression** : Sélecteur partagé (filtre IRL).
- **Critère d'acceptation** : À 360 px le titre ne recouvre pas la croix ; la ligne choisie affiche ✓.
- **Fichiers probables** : `js/passion-search-selector.js`, `styles.css`

### CRE-C18 — Préparation d'une vidéo lourde : plein écran sans annulation jusqu'à 90 s

- **Emplacement** : _meShowProgress app-08:1110-1127, borne 1234
- **Domaine** : Création et médias · **Nature** : friction · **Type** : jugement
- **Preuve** : Capture CRE-022 (simulée) : voile noir, barre, pourcentage, aucune commande.
- **Problème** : On ne peut ni annuler ni choisir une autre vidéo.
- **Situation déclenchante** : Vidéo > 2 Mo.
- **Conséquence pour l'utilisateur** : Attente subie ; tentation de fermer l'application.
- **Proposition** : Bouton « Annuler » qui interrompt la préparation.
- **Visuels** : [CRE-022](galerie/index.html#/surface/CRE-022) · **Surfaces** : CRE-022
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : Un seul point de retrait de l'overlay (finally) à conserver.
- **Critère d'acceptation** : Pendant la préparation, « Annuler » rend la main en moins d'une seconde.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`

### BOB-C14 — Haut du lecteur : fermer à 38 px, étiquette en doublon qui chevauche la flèche, « Commentaire » sans nombre

- **Emplacement** : .reels-close styles.css:4958 ; .reel-tag-mood 4827 ; .reels-nav.prev 5048 ; libellé app-05:3064
- **Domaine** : Bobines et stories · **Nature** : polish · **Type** : observation
- **Preuve** : Fermer 38 × 38 px ; « SPORT · RENCONTRER » (14→184 px) sous la flèche ↑ (174→216 px) ; la passion est déjà sous le nom de l'auteur ; 3 commentaires affichés « Commentaire ».
- **Problème** : Petites frictions cumulées sur l'écran le plus regardé.
- **Situation déclenchante** : Toute bobine.
- **Conséquence pour l'utilisateur** : Fermeture ratée, information répétée, compte d'engagement invisible.
- **Proposition** : Fermer 44 px ; envie ajoutée à la ligne de passion, étiquette du haut retirée ; nombre de commentaires sous l'icône.
- **Visuels** : [BOB-010](galerie/index.html#/surface/BOB-010) · **Surfaces** : BOB-010, BOB-012, BOB-018
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : .reels-close ≥ 44 px ; aucune superposition étiquette/flèche ; le libellé du bouton commentaire est un nombre.
- **Fichiers probables** : `styles.css`, `js/app-05-config-profil.js`

### BOB-C15 — Vidéo illisible : un bouton « Lire » recouvre le message « Vidéo non lisible »

- **Emplacement** : _reelVideoError js/app-05-config-profil.js:2843 ; boutonVideoPubliqueHTML app-02:4168
- **Domaine** : Bobines et stories · **Nature** : clarte · **Type** : observation
- **Preuve** : Bobine en 404 : placeholder 🎬 « Vidéo non lisible sur cet appareil » et bouton « ▶ Lire » au même endroit (BOB-014).
- **Problème** : Promesse contradictoire.
- **Situation déclenchante** : Vidéo absente ou format non décodable (webm sur iPhone).
- **Conséquence pour l'utilisateur** : Touchers inutiles.
- **Proposition** : Masquer le bouton de lecture quand la vidéo est remplacée.
- **Visuels** : [BOB-014](galerie/index.html#/surface/BOB-014) · **Surfaces** : BOB-014
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Sur une bobine en erreur, aucun [data-video-public-play] visible.
- **Fichiers probables** : `js/app-05-config-profil.js`

### BOB-C16 — Visionneuse de stories : piste des barres invisible, « ⋯ » au milieu, ✕ sans nom accessible

- **Emplacement** : .story-progress styles.css:4172 ; #storyReportBtn app-08:1930 ; .story-viewer-close index.html:176
- **Domaine** : Bobines et stories · **Nature** : polish · **Type** : observation
- **Preuve** : Piste rgba(139,92,246,0.18) sur #0a0818 ; ⋯ à x = 221 (deux marges auto) ; ✕ div 32 px, role ajouté par DEV-02, sans aria-label (sonde bobines-03).
- **Problème** : On ne voit pas combien de stories restent ; commandes mal rangées.
- **Situation déclenchante** : Toute story.
- **Conséquence pour l'utilisateur** : Lecture moins prévisible ; lecteur d'écran : « bouton ✕ ».
- **Proposition** : Piste blanche 35 %, ⋯ collé à ✕ à 44 px, aria-label « Fermer ».
- **Visuels** : [BOB-030](galerie/index.html#/surface/BOB-030) · **Surfaces** : BOB-030
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Piste visible (contraste ≥ 3:1 avec le fond) ; ⋯ et ✕ adjacents ; ✕ nommé « Fermer ».
- **Fichiers probables** : `styles.css`, `index.html`, `js/app-08-ui-modals-tour.js`

### BOB-C17 — Bobines et stories montrent l'emoji de la personne au lieu de sa photo ; ma bobine m'est proposée à « découvrir »

- **Emplacement** : authorOfReel app-05:2960 ; playCurrentStory app-08:1915 ; pickFeedReels ui-v2-shell.js:463 ; ui-v5 sans test d'auteur
- **Domaine** : Bobines et stories · **Nature** : polish · **Type** : observation
- **Preuve** : Léa a une photo de profil (fil, profil) mais 🎸 dans le lecteur et la story ; ma bobine figure dans « Bobines à découvrir » et porte « Ça m'intéresse ».
- **Problème** : Reconnaissance des personnes plus difficile ; propositions absurdes sur son propre contenu.
- **Situation déclenchante** : Toute bobine / story.
- **Conséquence pour l'utilisateur** : Incohérence avec le reste de l'application.
- **Proposition** : Utiliser la photo de profil quand elle existe ; exclure mes bobines du rail et des sorties UI-5.
- **Visuels** : [BOB-002](galerie/index.html#/surface/BOB-002) · **Surfaces** : BOB-002, BOB-010, BOB-015, BOB-030
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Avatar photo dans le lecteur et la story ; aucune de mes bobines dans le rail.
- **Fichiers probables** : `js/app-05-config-profil.js`, `js/app-08-ui-modals-tour.js`, `js/ui-v2-shell.js`, `js/ui-v5-bobines.js`

### BOB-C18 — Réactions de bobine et de commentaire : code masqué, mort ou purement local

- **Emplacement** : index.html:1302-1309 ; styles.css:5291 ; app-05:3652-3801
- **Domaine** : Bobines et stories · **Nature** : polish · **Type** : observation
- **Preuve** : Rangée ❤️🔥… en display:none ; deux sélecteurs sans appelant ; la réaction 😊 à un commentaire n'est écrite que dans l'état local.
- **Problème** : Dette qui ressortira si quelqu'un réaffiche la rangée : réactions jamais envoyées.
- **Situation déclenchante** : —
- **Conséquence pour l'utilisateur** : Risque de fausse fonctionnalité.
- **Proposition** : Retirer ce code ou le brancher sur les réactions de commentaire du fil.
- **Visuels** : — · **Surfaces** : BOB-083, BOB-084, BOB-085
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Plus aucune réaction locale non envoyée dans le panneau des bobines.
- **Fichiers probables** : `index.html`, `styles.css`, `js/app-05-config-profil.js`

### BOB-C19 — État vide du lecteur : chemin « ➕ → Studio → onglet Bobine » périmé

- **Emplacement** : openReels js/app-05-config-profil.js:3093
- **Domaine** : Bobines et stories · **Nature** : polish · **Type** : observation
- **Preuve** : Texte de l'état vide (BOB-060) ; la création passe aujourd'hui par « Créer ».
- **Problème** : Indication fausse.
- **Situation déclenchante** : Aucune bobine (rare : exemples présents).
- **Conséquence pour l'utilisateur** : Faible.
- **Proposition** : « Filme un moment de ta passion » + le bouton existant.
- **Visuels** : — · **Surfaces** : BOB-060
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Le texte ne cite plus « Studio → onglet Bobine ».
- **Fichiers probables** : `js/app-05-config-profil.js`

### BOB-C20 — Les confirmations sont peintes sous le lecteur (commentaire posté, lien copié)

- **Emplacement** : .toast-stack z-index 200 < .reels-viewer 9999 (styles.css:1484, 4736)
- **Domaine** : Bobines et stories · **Nature** : clarte · **Type** : observation
- **Preuve** : Fait transverse établi : PAR-C03, IRL-C65, MSG-C85 ; ici « Commentaire posté » et « Réponse postée » (app-05:3536, 3550) sont émis sous le lecteur.
- **Problème** : Aucune confirmation visible.
- **Situation déclenchante** : Commenter, répondre, copier depuis le lecteur.
- **Conséquence pour l'utilisateur** : Doute, double envoi.
- **Proposition** : Corriger une fois pour toutes la couche des toasts (voir PAR-C03).
- **Visuels** : — · **Surfaces** : BOB-020, BOB-081
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PAR-C03.
- **Risque de régression** : Voir PAR-C03.
- **Critère d'acceptation** : Un toast émis lecteur ouvert est visible au-dessus.
- **Fichiers probables** : `styles.css`

### IRL-C08 — Les activités sans couverture portent toutes une épingle 📍 au lieu de l'emoji de leur passion

- **Emplacement** : Carte › .v4a2-visuel — emoji par défaut « 📍 » posé au chargement (app-08:6208), prioritaire sur la passion (ui-v4a2-cartes.js:418)
- **Domaine** : Rencontres IRL · **Nature** : polish · **Type** : observation
- **Preuve** : IRL-010 (salsa → 📍), IRL-015, IRL-017 (Art → 📍) ; les marqueurs de carte, eux, montrent l'emoji de la passion.
- **Problème** : La vignette ne dit plus de quoi il s'agit.
- **Situation déclenchante** : Activité sans cover_url ni emoji.
- **Conséquence pour l'utilisateur** : Liste moins lisible ; incohérence avec les marqueurs.
- **Proposition** : Ne pas poser « 📍 » par défaut au chargement (laisser null) : le repli passion de la carte s'applique.
- **Visuels** : [IRL-017](galerie/index.html#/surface/IRL-017) · **Surfaces** : IRL-010, IRL-015, IRL-017
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Autres lecteurs de ev.emoji (fiche, partage) à vérifier.
- **Critère d'acceptation** : Une activité Art sans couverture ni emoji affiche 🎨 dans sa vignette.
- **Fichiers probables** : `js/app-08-ui-modals-tour.js`

### IRL-C12 — Une recherche sans résultat annonce « Rien avec ces filtres »

- **Emplacement** : _irlEmptyStateHtml (app-07:2872-2887)
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : IRL-006 : « kitesurf » → « Rien avec ces filtres · Élargis la zone, la date ou la passion » ; aucun filtre posé. #irlSearchEmpty (« Aucun événement trouvé pour cette recherche. ») n'est plus jamais affiché.
- **Problème** : Le message accuse des filtres inexistants.
- **Situation déclenchante** : Recherche texte sans correspondance.
- **Conséquence pour l'utilisateur** : On ouvre Filtre pour rien.
- **Proposition** : Branche dédiée quand seule la recherche est active : « Aucune activité pour « kitesurf » » + « Effacer la recherche ».
- **Visuels** : [IRL-006](galerie/index.html#/surface/IRL-006) · **Surfaces** : IRL-006
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Recherche seule à 0 résultat : le titre cite la saisie et le bouton efface la recherche.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C13 — Mots divergents pour la même chose : activité / événement / rencontre / expérience ; « Je viens » / « Je participe » ; « Mes rencontres » = « Mes inscriptions »

- **Emplacement** : Cartes (ui-v4a2-cartes.js:89-99), bandeau annulé et état vide (app-07:2875-2886, 3046), bulle de carte (app-07:1800), vue Filtre (ui-v4a5-filtres.js:108-114), dialogue de repli (app-07:2822-2824), passerelle (ui-v3-passerelle.js:68-69), feuille passion « Quelles activités ? »
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : Relevés : carte « Je viens » / fiche « Je participe » (IRL-062 ; constat PCS-C06 de parcours.json) ; « Détails » / « Voir l'événement » ; « Événement annulé » sur une carte d'« activité » ; « Mes événements ∣ Mes rencontres » (vue Filtre) = « Mes événements ∣ Mes inscriptions » (dialogue) ; CTA « Trouver une activité » → feuille « Trouver une expérience » → écran « Rencontrer » ; section « Quelles passions ? » → feuille « Quelles activités ? ».
- **Problème** : Chaque surface nomme autrement l'objet et l'action centrale de la boucle IRL.
- **Situation déclenchante** : Parcours Fil → Rencontrer → fiche.
- **Conséquence pour l'utilisateur** : Charge de compréhension ; « Mes rencontres » se lit comme « personnes rencontrées », pas « activités où je suis inscrit ».
- **Proposition** : Un lexique : l'objet = « activité » ; l'action = un seul verbe partout (choix PCS-C06) ; « Mes inscriptions » au lieu de « Mes rencontres » ; « Détails » aussi dans la bulle ; « Activité annulée par l'organisateur ».
- **Visuels** : [IRL-041](galerie/index.html#/surface/IRL-041), [IRL-061](galerie/index.html#/surface/IRL-061) · **Surfaces** : IRL-012, IRL-016, IRL-031, IRL-041, IRL-049, IRL-061, IRL-062, IRL-071
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PCS-C06 (même décision de verbe).
- **Risque de régression** : Tests e2e qui cherchent les libellés par texte.
- **Critère d'acceptation** : Aucune occurrence visible de « événement » ou « expérience » dans les surfaces du domaine ; le même verbe sur la carte et la fiche.
- **Fichiers probables** : `js/ui-v4a2-cartes.js`, `js/ui-v4a5-filtres.js`, `js/app-07-ia-explore-irl.js`, `js/ui-v3-passerelle.js`

### IRL-C15 — Carte : marqueurs empilés sans regroupement, et aucun message si les tuiles échouent

- **Emplacement** : updateIrlMapMarkers (app-07:1694-1836) ; micro-décalage :1774
- **Domaine** : Rencontres IRL · **Nature** : polish · **Type** : observation
- **Preuve** : IRL-030 / IRL-057 : six marqueurs superposés sur Paris, impossibles à toucher séparément ; IRL-058 : tuiles refusées → fond gris uni, aucun texte.
- **Problème** : La carte ne sert pas à choisir entre activités proches ; l'échec réseau est muet.
- **Situation déclenchante** : Plusieurs activités dans une même ville ; réseau faible.
- **Conséquence pour l'utilisateur** : On revient à la liste ; on attend une carte qui ne viendra pas.
- **Proposition** : Regrouper les marqueurs proches en une pastille chiffrée qui zoome au toucher ; en cas d'erreur de tuiles, réutiliser le message de repli existant (« La carte n'est pas disponible… la liste fonctionne normalement »).
- **Visuels** : [IRL-057](galerie/index.html#/surface/IRL-057), [IRL-058](galerie/index.html#/surface/IRL-058) · **Surfaces** : IRL-030, IRL-052, IRL-057, IRL-058
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : Shim Leaflet → MapLibre (map-loader.js) : le regroupement passe par une source GeoJSON.
- **Critère d'acceptation** : Deux activités à moins de 40 px l'une de l'autre forment une pastille « 2 » ; tuiles en échec → message visible.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `js/map-loader.js`

### IRL-C16 — Flèches de mois du calendrier à 28 × 28 px

- **Emplacement** : .irl-cal-nav (index.html:1107-1109)
- **Domaine** : Rencontres IRL · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesure IRL-046--m390 : « Mois précédent » et « Mois suivant » 28 × 28 px.
- **Problème** : Cibles trop petites.
- **Situation déclenchante** : Chercher une date le mois suivant.
- **Conséquence pour l'utilisateur** : Erreurs de toucher.
- **Proposition** : 44 × 44 px.
- **Visuels** : [IRL-046](galerie/index.html#/surface/IRL-046) · **Surfaces** : IRL-046
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : ‹ et › ≥ 44 × 44 px.
- **Fichiers probables** : `styles.css`

### IRL-C17 — « C'est maintenant » et « En cours » disent deux fois la même chose sur la même carte

- **Emplacement** : Bandeau historique app-07:3046 + ligne quand ui-v4a2-cartes.js:295
- **Domaine** : Rencontres IRL · **Nature** : polish · **Type** : jugement
- **Preuve** : IRL-001 / IRL-010 : bandeau lavande « C'est maintenant » puis « Musique · En cours ».
- **Problème** : Redondance qui coûte une ligne par carte.
- **Situation déclenchante** : Activité en cours.
- **Conséquence pour l'utilisateur** : Moins de cartes visibles.
- **Proposition** : Garder la ligne « En cours » (dans le corps) et retirer le bandeau, ou l'inverse — un seul signal.
- **Visuels** : [IRL-001](galerie/index.html#/surface/IRL-001) · **Surfaces** : IRL-001, IRL-010
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Le bandeau est conservé par la règle CSS du lot (styles.css:8891).
- **Critère d'acceptation** : Une activité en cours n'affiche qu'un seul marqueur « en cours ».
- **Fichiers probables** : `styles.css`

### IRL-C18 — Suggestions de lieu peu pertinentes (« Grenoble » → Le Boupère, Arcisses…)

- **Emplacement** : passioGeoSuggest (app-07:1112), feuille « Changer de lieu »
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : hypothese
- **Preuve** : IRL-048 : « Grenoble » → résultat Grenoble + « Autres communes » Le Boupère, Arcisses, Saint-Priest, Aulnay-sous-Bois (réponses réelles des géocodeurs, une seule saisie observée).
- **Problème** : Des communes sans rapport peuvent faire douter du sélecteur.
- **Situation déclenchante** : Saisie d'une grande ville.
- **Conséquence pour l'utilisateur** : Faible : le bon résultat est en tête.
- **Proposition** : Vérifier sur une dizaine de saisies ; si confirmé, n'afficher « Autres communes » que si elles contiennent la saisie.
- **Visuels** : [IRL-048](galerie/index.html#/surface/IRL-048) · **Surfaces** : IRL-048
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : « Grenoble » ne propose que des communes dont le nom ou le contexte contient « Grenoble ».
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C19 — Le toast de refus de position renvoie à « Filtre → Autour de moi », qui n'existe plus

- **Emplacement** : requestUserLocation, branche erreur (app-07:1226) ; section « Autour de moi » seulement dans le dialogue de repli (app-07:2811)
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : IRL-053 : toast « Localisation indisponible — résultats autour de Paris. Choisis ta ville dans Filtre → Autour de moi. » affiché alors qu'on est déjà dans Filtre, dont la section s'appelle « Où ? » ; le toast recouvre le pied « Afficher 45 résultats ».
- **Problème** : Le message guide vers un mot introuvable.
- **Situation déclenchante** : Refus ou échec de la position.
- **Conséquence pour l'utilisateur** : On cherche « Autour de moi » ; on lit « résultats autour de Paris » sans savoir corriger.
- **Proposition** : « Position indisponible. Choisis ta ville dans « Où ? ». » — et le toast au-dessus du pied fixe.
- **Visuels** : [IRL-053](galerie/index.html#/surface/IRL-053) · **Surfaces** : IRL-053, IRL-071
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Aucune.
- **Critère d'acceptation** : Le texte du toast ne contient plus « Autour de moi » ; il ne recouvre pas #v4a5Done.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`

### IRL-C56 — Activité passée : « 7 places restantes », tuile corail et deux « Partager mon expérience »

- **Emplacement** : Fiche passée — js/ui-v4b-fiche.js:327-338 (`texteParticipation`), app-07:4338, 4450-4455, 4540-4542
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : Captures IRL-130/131 : « 3 participants · 7 places restantes », « 7 places disponibles » ; même tuile corail qu'une activité à venir ; « Partager mon expérience » dans le corps et dans le pied.
- **Problème** : Des places « restantes » sur une activité finie, et le signal du passage au réel sur ce qui est passé.
- **Situation déclenchante** : Ouvrir une activité terminée (depuis une notification, son profil, l'album).
- **Conséquence pour l'utilisateur** : Confusion (« je peux encore y aller ? »), corail affaibli comme signal.
- **Proposition** : Activité terminée : « Tu y étais · N participants » (ou « N participants »), tuile neutre, une seule porte « Partager mon expérience » (le pied).
- **Visuels** : [IRL-130](galerie/index.html#/surface/IRL-130), [IRL-131](galerie/index.html#/surface/IRL-131) · **Surfaces** : IRL-130, IRL-131
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : Sur une activité terminée, aucune mention de places restantes ; la tuile n'est pas corail.
- **Fichiers probables** : `js/ui-v4b-fiche.js`, `js/app-07-ia-explore-irl.js`, `styles.css`

### IRL-C59 — Feuille à trois états : libellés cassés et mots différents de la fiche

- **Emplacement** : Rencontrer › carte › « + Rejoindre » → `openEventRsvpSheet`, js/app-07-ia-explore-irl.js:4006-4032 ; libellés RSVP_LABELS app-07:612-617
- **Domaine** : Rencontres IRL · **Nature** : polish · **Type** : observation
- **Preuve** : Captures IRL-140/141 : titre et description côte à côte, « Je viens » sur deux lignes, « Peut-être » centré ; « Complet — file d'attente ouverte » puis option « Liste d'attente ». Vocabulaire : voir PCS-C06 (« Je viens » vs « Je participe »).
- **Problème** : Le choix est difficile à lire, et le même geste porte d'autres mots que sur la fiche.
- **Situation déclenchante** : S'inscrire depuis une carte de la liste Rencontrer.
- **Conséquence pour l'utilisateur** : Hésitation, erreurs de choix (« Peut-être » au lieu de venir).
- **Proposition** : Titre au-dessus de la description, alignés à gauche, cibles de 56 px ; mêmes mots partout (« Je participe », « Liste d'attente »).
- **Visuels** : [IRL-140](galerie/index.html#/surface/IRL-140) · **Surfaces** : IRL-140, IRL-141
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Décision de vocabulaire PCS-C06.
- **Risque de régression** : Faible ; `.btn` est partagé, cibler la feuille.
- **Critère d'acceptation** : Dans la feuille, chaque titre tient sur une ligne au-dessus de sa description à 360 px ; « file d'attente » n'apparaît plus.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `styles.css`

### IRL-C62 — Activité, événement, rencontre ; participer, venir, inscrit : plusieurs mots pour la même chose

- **Emplacement** : Fiche, feuilles, Gérer, filtres — ui-v4b-fiche.js:62-66, app-07:612-617, 4405-4414, 4488, 4512, 6690 ; ui-v4a5-filtres.js:109-113 ; index.html:863
- **Domaine** : Rencontres IRL · **Nature** : clarte · **Type** : observation
- **Preuve** : Relevé à l'écran : « Créer une activité » / « Modifier l'événement » / « Affiche de la rencontre » ; « Album de l'événement », « Signaler cet événement », « Événement terminé », « Gérer l'événement » ; « Je participe » / « Je viens » / « Inscrit » / « Désinscrit » ; « Mes événements » / « Mes rencontres » / « Mes activités ». Prolonge PCS-C06.
- **Problème** : Une même chose porte trois noms selon l'écran.
- **Situation déclenchante** : Tout le parcours IRL.
- **Conséquence pour l'utilisateur** : Charge de compréhension, doute sur le fait qu'il s'agisse du même objet.
- **Proposition** : Un lexique : « activité » (l'objet), « Je participe » / « Je ne peux plus venir » (le geste), « participants » (les personnes), « Rencontrer » (l'onglet) ; appliquer aux libellés listés.
- **Visuels** : [IRL-103](galerie/index.html#/surface/IRL-103), [IRL-113](galerie/index.html#/surface/IRL-113), [IRL-164](galerie/index.html#/surface/IRL-164) · **Surfaces** : IRL-103, IRL-113, IRL-140, IRL-141, IRL-143, IRL-164, IRL-187
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Décision de Benjamin sur le lexique (PCS-C06).
- **Risque de régression** : Tests e2e qui cherchent des libellés exacts.
- **Critère d'acceptation** : Aucune occurrence visible de « événement » ni de « Je viens » dans les surfaces IRL.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `js/ui-v4b-fiche.js`, `js/ui-v4a5-filtres.js`, `index.html`

### IRL-C64 — Les messages éphémères se posent sur le pied d'action, parfois deux pour un geste

- **Emplacement** : Pile `#toastStack` (styles.css:1468-1495, positionnée au-dessus de la barre d'onglets, masquée sous la fiche) ; doublon app-07:3491-3494 + 3606
- **Domaine** : Rencontres IRL · **Nature** : polish · **Type** : observation
- **Preuve** : Captures IRL-121/122 : toast mesuré en (103, 705, 184 × 39) à m390, sur le pied de fiche ; « C'est complet — tu es sur liste d'attente » + « Liste d'attente » pour un seul geste, posés sur l'état « Sur liste d'attente ». (Le banc neutralise l'animation de sortie pour rendre les toasts visibles : voir rapport § 7.)
- **Problème** : Le message recouvre l'état qu'il commente ; deux messages disent la même chose.
- **Situation déclenchante** : Tout geste du pied de fiche.
- **Conséquence pour l'utilisateur** : On lit mal l'état final ; impression de bruit.
- **Proposition** : Sur la fiche, placer la pile au-dessus du pied (variable de décalage), un seul message par geste, et dire l'état durable dans le pied plutôt qu'en toast.
- **Visuels** : [IRL-121](galerie/index.html#/surface/IRL-121), [IRL-122](galerie/index.html#/surface/IRL-122) · **Surfaces** : IRL-121, IRL-122
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : IRL-C65 (même pile).
- **Risque de régression** : Position des toasts ailleurs dans l'application.
- **Critère d'acceptation** : Fiche ouverte, un toast ne chevauche pas `#eventDetailCta` ; un seul toast après « Rejoindre la liste d'attente ».
- **Fichiers probables** : `styles.css`, `js/app-07-ia-explore-irl.js`

### IRL-C67 — Bas de fiche chargé : Partager trois fois, deux barres de tri des commentaires

- **Emplacement** : Fiche › Échanges et Autres actions — app-07:4495-4512 ; hero `#eventDetailShareBtn` index.html:1269
- **Domaine** : Rencontres IRL · **Nature** : polish · **Type** : observation
- **Preuve** : Capture IRL-103 : « Partager » en haut de fiche, dans la barre d'échanges et dans « Autres actions » ; tris « Récents / Aimés » puis « Pertinents / Récents » ; chips de tri 23 px de haut.
- **Problème** : Doublons qui allongent la fiche et brouillent la hiérarchie.
- **Situation déclenchante** : Lecture du bas de fiche.
- **Conséquence pour l'utilisateur** : Défilement plus long avant les informations utiles, cibles minuscules.
- **Proposition** : Un seul « Partager » (icône du haut), une seule barre de tri, chips à 44 px de zone tactile.
- **Visuels** : [IRL-103](galerie/index.html#/surface/IRL-103) · **Surfaces** : IRL-103, IRL-189
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Composant de commentaires partagé avec les publications (domaine fil).
- **Risque de régression** : Le composant de tri est commun : vérifier les publications.
- **Critère d'acceptation** : La fiche ne contient qu'une porte « Partager » et qu'une barre de tri.
- **Fichiers probables** : `js/app-07-ia-explore-irl.js`, `js/ui-v4b-fiche.js`

### IRL-C68 — Petites cibles dans les fenêtres d'organisation (29 px)

- **Emplacement** : Boutons `.btn.small` : Inviter (app-07:7455), Ajouter co-organisateur (6720), Noter (7719) ; « Plus d'options » (UI-6A0)
- **Domaine** : Rencontres IRL · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Mesures m390 : « Inviter » 29 px de haut, « Ajouter » 29 px, « Noter » 29 px, « Plus d'options » 33 px (fiches IRL-142, IRL-144, IRL-131, IRL-161, mesures.cibles.sous44).
- **Problème** : Cibles sous 44 px sur des gestes répétés (inviter plusieurs personnes).
- **Situation déclenchante** : Usage à une main, en mouvement.
- **Conséquence pour l'utilisateur** : Appuis manqués ou sur la mauvaise ligne.
- **Proposition** : Zone tactile ≥ 44 px (padding ou pseudo-élément) pour `.btn.small` dans ces listes.
- **Visuels** : [IRL-142](galerie/index.html#/surface/IRL-142), [IRL-144](galerie/index.html#/surface/IRL-144) · **Surfaces** : IRL-142, IRL-144, IRL-131, IRL-161
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Hauteur des lignes de liste.
- **Critère d'acceptation** : À 360 px, chaque bouton « Inviter » / « Ajouter » / « Noter » offre ≥ 44 × 44 px.
- **Fichiers probables** : `styles.css`

### IRL-C69 — Sur ordinateur, la fiche s'étire sur toute la largeur

- **Emplacement** : `#eventDetailPage` — styles.css (pas de largeur maximale sous `.passio-ui-4b`)
- **Domaine** : Rencontres IRL · **Nature** : polish · **Type** : observation
- **Preuve** : Capture IRL-101 d1440 : bloc rendez-vous, organisateur et bouton « Je participe » de 1 408 px de large.
- **Problème** : Lignes et bouton démesurés, lecture difficile.
- **Situation déclenchante** : Ouverture sur un ordinateur ou une tablette paysage.
- **Conséquence pour l'utilisateur** : Aspect inachevé pour les personnes qui découvrent PASSIO sur ordinateur via un lien partagé.
- **Proposition** : Largeur de lecture bornée (≈ 640 px) centrée, pied aligné sur la même colonne.
- **Visuels** : [IRL-101](galerie/index.html#/surface/IRL-101) · **Surfaces** : IRL-101
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Gabarit ordinateur transverse.
- **Risque de régression** : Faible.
- **Critère d'acceptation** : À 1 440 px, le contenu de la fiche ne dépasse pas 680 px de large.
- **Fichiers probables** : `styles.css`

### MSG-C27 — Mots qui varient : utilisateur / personne / membre, chercher / rechercher, conversation / discussion

- **Emplacement** : Libellés de la messagerie
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Relevé : « Chercher un utilisateur… », « Rechercher un utilisateur... », « Aucun utilisateur trouvé », « Membres à inviter », « démarrer une discussion », « Démarrer la conversation… », « Nouveau message » (ouvre une conversation) ; « bloqué », « débloqué », « tu ne le suivras plus » au masculin, alors que « ajouté·e », « retiré·e », « prévenu·e » sont inclusifs ; emojis en tête de toasts et de titres.
- **Problème** : Le même objet change de nom d'un écran à l'autre.
- **Situation déclenchante** : Lecture des écrans à la suite.
- **Conséquence pour l'utilisateur** : Impression de pièces rapportées.
- **Proposition** : « Personne » pour qui l'on cherche, « membre » dans un groupe, « Rechercher », « conversation » partout ; formulations sans genre (« Compte bloqué »).
- **Visuels** : [MSG-004](galerie/index.html#/surface/MSG-004) · **Surfaces** : MSG-004, MSG-041
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Glossaire commun à l'audit.
- **Risque de régression** : Tests qui lisent des libellés.
- **Critère d'acceptation** : Les mots « utilisateur » et « discussion » n'apparaissent plus dans la messagerie (hors « discussion d'activité »).
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-05-config-profil.js`, `js/app-09-boot-pwa.js`, `index.html`

### MSG-C29 — Après un déblocage, la conversation ne revient pas tout de suite

- **Emplacement** : unblockUser (js/app-04-comments-shop.js:5185–5210)
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Sonde 09 : « Débloquer » → ligne `blocks` supprimée, toast, fenêtre « Aucun compte bloqué » ; à la fermeture, la conversation n'est pas dans la liste (unblockUser repeint le fil et la fenêtre, pas la liste des messages). La fenêtre est à trois niveaux (Options ··· › Personnalisation › Comptes bloqués) et le toast de blocage n'y renvoie pas.
- **Problème** : On débloque et la conversation reste absente.
- **Situation déclenchante** : Déblocage depuis l'écran Messages.
- **Conséquence pour l'utilisateur** : Doute sur l'effet du déblocage.
- **Proposition** : Repeindre la liste après déblocage ; toast de blocage avec « Gérer les comptes bloqués ».
- **Visuels** : — · **Surfaces** : MSG-040, MSG-082
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : ROB-04 (verrou d'écriture du blocage).
- **Critère d'acceptation** : Après « Débloquer » puis « OK », la conversation est visible dans la liste sans autre geste.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C30 — Archiver, épingler ou marquer non lu demande d'ouvrir la conversation

- **Emplacement** : Liste › ligne (js/app-04-comments-shop.js:5595) — aucun geste
- **Domaine** : Messagerie · **Nature** : friction · **Type** : hypothese
- **Preuve** : D'après le code : la ligne n'a qu'un onclick ; chaque action de liste passe par ouvrir → ⋮ → entrée (3 gestes), et ouvrir marque la conversation comme lue.
- **Problème** : On ne peut pas ranger une conversation sans la lire.
- **Situation déclenchante** : Tri rapide de la liste.
- **Conséquence pour l'utilisateur** : Hypothèse : usage faible de l'archive et de l'épingle.
- **Proposition** : À vérifier auprès d'utilisateurs avant d'ajouter quoi que ce soit ; piste sobre : un appui long ouvrant les mêmes entrées.
- **Visuels** : — · **Surfaces** : MSG-077
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : M · **Risque technique** : moyen
- **Dépendances** : MSG-C01, MSG-C17.
- **Risque de régression** : Défilement de #appMain et geste de retour.
- **Critère d'acceptation** : À définir après vérification auprès d'utilisateurs.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C31 — Une passion est exigée pour créer un groupe  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : Nouveau groupe › « Passion(s) du groupe (1 à 3) » — confirmCreateGroup (js/app-05-config-profil.js:1949)
- **Domaine** : Messagerie · **Nature** : friction · **Type** : jugement
- **Preuve** : Sonde 04 : sans passion cochée, « Choisis au moins 1 passion » ; seules les passions du compte sont proposées (une ici) ; côté serveur la passion d'une conversation est facultative (js/app-08-ui-modals-tour.js:6591–6593, ADR-010).
- **Problème** : Un choix obligatoire qui n'en est pas un quand le compte n'a qu'une passion.
- **Situation déclenchante** : Création d'un groupe.
- **Conséquence pour l'utilisateur** : Étape de plus ; groupe d'amis classé de force.
- **Proposition** : Rendre la passion facultative, comme le serveur. Règle métier : à décider par Benjamin.
- **Visuels** : [MSG-010](galerie/index.html#/surface/MSG-010) · **Surfaces** : MSG-010
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Décision produit.
- **Risque de régression** : Fenêtre membres (pastilles de passion).
- **Critère d'acceptation** : Un groupe se crée sans passion cochée.
- **Fichiers probables** : `js/app-05-config-profil.js`

### MSG-C71 — Deux sélecteurs de GIF différents, et un GIF part au premier toucher

- **Emplacement** : Conversation › GIF — onglet du panneau emoji (js/emoji-misc.js:269-289) et panneau flottant du bouton GIF (showGifPickerForMessage, :476-494 ; passioGifPanel, :117-193)
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Captures MSG-153 (onglet GIF : feuille basse, 3 colonnes de 120 px de haut) et MSG-154 (bouton GIF : carte flottante de 308 × 355 px, 3 colonnes de 90 px, par-dessus le dernier message). Les deux portent « Rechercher sur KLIPY ». Toucher une vignette envoie aussitôt (sonde 04 : 1 ligne en base, aucune étape). GIF servis localement dans le banc (KLIPY refusé) : état simulé.
- **Problème** : Selon le bouton touché, le même choix de GIF se présente de deux façons ; dans les deux, effleurer une vignette en faisant défiler envoie le GIF.
- **Situation déclenchante** : Ajouter un GIF par le bouton pellicule ou par l'onglet GIF du panneau emoji.
- **Conséquence pour l'utilisateur** : Envoi accidentel d'un GIF (parfois malvenu) ; interface à apprendre deux fois.
- **Proposition** : Garder un seul sélecteur (l'onglet GIF du panneau), retirer le bouton GIF de la barre (voir MSG-C60) ; le GIF touché apparaît en aperçu au-dessus du champ avec « Envoyer » — même mécanisme que l'aperçu photo de MSG-C72.
- **Visuels** : [MSG-153](galerie/index.html#/surface/MSG-153), [MSG-154](galerie/index.html#/surface/MSG-154) · **Surfaces** : MSG-153, MSG-154
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C60, MSG-C72.
- **Risque de régression** : Exigences KLIPY (libellé du champ, ordre des résultats) à conserver.
- **Critère d'acceptation** : Un seul point d'entrée GIF dans la conversation ; toucher une vignette n'insère aucun message avant confirmation.
- **Fichiers probables** : `js/emoji-misc.js`, `index.html`

### MSG-C77 — L'heure sous chaque bulle et de grandes marges : sept messages courts par écran

- **Emplacement** : Conversation › rythme vertical — heure rendue pour chaque message (js/app-04-comments-shop.js:6010-6022) ; styles.css:5990-5998 (marge 12 px, 20 px entre expéditeurs), :6032
- **Domaine** : Messagerie · **Nature** : polish · **Type** : jugement
- **Preuve** : Capture MSG-180 : 7 messages d'une ligne ou deux dans 723 px de fil à 390×844 (≈ 100 px par message) ; à 360×640, voir la fiche. Les messages consécutifs d'un même expéditeur ont des coins resserrés mais gardent chacun leur heure et 12 px de marge.
- **Problème** : Un échange rapide de messages courts occupe tout l'écran ; il faut beaucoup défiler pour retrouver le fil d'une discussion.
- **Situation déclenchante** : Conversation active faite de messages courts (le cas général).
- **Conséquence pour l'utilisateur** : Moins de contexte visible quand on répond ; lecture hachée.
- **Proposition** : N'afficher l'heure que sous le dernier message d'un groupe (même expéditeur, messages rapprochés), réduire la marge interne d'un groupe à 4 px ; l'heure d'un message reste disponible dans sa feuille d'actions. À confirmer auprès d'utilisateurs.
- **Visuels** : [MSG-105](galerie/index.html#/surface/MSG-105), [MSG-180](galerie/index.html#/surface/MSG-180) · **Surfaces** : MSG-105, MSG-180, MSG-100
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C62 (statut sur la même ligne que l'heure).
- **Risque de régression** : Le statut d'envoi (data-msgst) vit dans la ligne de l'heure : elle doit rester présente pour mes messages en cours ou en échec.
- **Critère d'acceptation** : Dix messages d'une ligne échangés en deux minutes tiennent dans 560 px de fil à 390 px de large.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `styles.css`

### MSG-C79 — Fonds de conversation sombres : heures et séparateurs peu lisibles, et un mode sombre local alors qu'il a été retiré

- **Emplacement** : Conversation › fond personnalisé — CONV_BGS (js/app-09-boot-pwa.js:1855-1862, cinq fonds sombres sur six) ; couleurs du fil inchangées (styles.css:6032, séparateurs js/app-04-comments-shop.js:5974-5978)
- **Domaine** : Messagerie · **Nature** : accessibilite · **Type** : observation
- **Preuve** : Sonde 07, fond « Nuit » (#0a0a0f) : heures et séparateurs restent en rgb(110,105,135) sur ce fond, soit ≈ 3,7:1 pour un texte de 11 px (seuil 4,5:1) — voir mesures de la fiche MSG-198. L'en-tête et la barre de saisie restent clairs.
- **Problème** : Avec un fond sombre, l'heure des messages et les séparateurs de jour se lisent mal, et l'écran mélange un fil sombre avec un en-tête et une barre clairs.
- **Situation déclenchante** : Choisir un des cinq fonds sombres dans les paramètres de la conversation.
- **Conséquence pour l'utilisateur** : Lisibilité dégradée ; incohérence avec la décision produit de retirer le mode sombre.
- **Proposition** : Remplacer les cinq fonds sombres par des lavis clairs de la palette actuelle (accent, corail très pâle, etc.), ou à défaut éclaircir heures et séparateurs quand le fond est sombre.
- **Visuels** : [MSG-198](galerie/index.html#/surface/MSG-198) · **Surfaces** : MSG-198
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Domaine « paramètres de conversation » (sélecteur de fond).
- **Risque de régression** : Conversations ayant déjà un fond sombre enregistré : prévoir la correspondance.
- **Critère d'acceptation** : Quel que soit le fond proposé, l'heure et les séparateurs mesurent ≥ 4,5:1.
- **Fichiers probables** : `js/app-09-boot-pwa.js`, `styles.css`

### MSG-C80 — Lecteur de vocal : deux vocaux jouent en même temps, le son continue après avoir quitté la conversation

- **Emplacement** : Conversation › lecteur — _playVoiceById (js/app-04-comments-shop.js:6812-6873) : un objet Audio par message, jamais mis en pause par un autre ni par closeConversation (:7789)
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Sonde 05 : lecture du vocal reçu puis toucher du second → deux objets Audio en lecture simultanée ; fermeture de la conversation → un des deux joue encore. La barre de progression ne permet pas de se déplacer (un toucher met en pause). Le bouton vitesse (1× → 1,5× → 2×) s'applique à tous les vocaux.
- **Problème** : Lancer un deuxième vocal superpose les deux voix ; quitter la conversation ne coupe pas le son et plus rien à l'écran ne permet de l'arrêter.
- **Situation déclenchante** : Enchaîner des vocaux ; revenir à la liste pendant une lecture.
- **Conséquence pour l'utilisateur** : Cacophonie, son impossible à couper sans rouvrir la conversation.
- **Proposition** : Un seul vocal à la fois (le nouveau met l'ancien en pause) ; pause à la fermeture de la conversation ; toucher la barre déplace la lecture.
- **Visuels** : [MSG-176](galerie/index.html#/surface/MSG-176) · **Surfaces** : MSG-176, MSG-179
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Lecture par URL signée (résolue au premier toucher) ; vitesse mémorisée.
- **Critère d'acceptation** : À tout instant, au plus un élément audio de la messagerie est en lecture ; après closeConversation, aucun.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C82 — Icônes fonctionnelles en emoji et violet d'avant la palette actuelle

- **Emplacement** : Conversation › feuille d'actions (js/app-04-comments-shop.js:6354-6361 : ↩️ 📋 ↪️ 🚩 🗑️), statut 🕓 (:7159), lecteur ▶ / ⏸ (:6084, :6838-6846), cartes 📄 🎵 📍 (:6058-6073), visionneuse ⬇️ (js/app-09-boot-pwa.js:1948), onglets #7c3aed (index.html:1732, js/emoji-misc.js:236), teintes rgba(139,92,246) du lecteur
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Captures MSG-140, MSG-108, MSG-151, MSG-159. La charte en vigueur réserve les emojis au contenu (passions, réactions) et demande des pictogrammes SVG `currentColor` pour les fonctions ; le menu « + » voisin l'applique déjà.
- **Problème** : Dans le même écran, le menu « + » a des pictogrammes dessinés et la feuille d'actions des emojis de couleur ; le rendu des emojis change d'un téléphone à l'autre.
- **Situation déclenchante** : Ouvrir la feuille d'actions, lire un vocal, ouvrir le panneau emoji.
- **Conséquence pour l'utilisateur** : Impression d'application composite ; le rouge de 🚩 et le gris de 🗑️ ne suivent pas la hiérarchie voulue.
- **Proposition** : Remplacer ces emojis par les pictogrammes au trait déjà présents dans l'application ; remplacer #7c3aed et rgba(139,92,246,…) par les variables --accent / --accent-wash.
- **Visuels** : [MSG-140](galerie/index.html#/surface/MSG-140) · **Surfaces** : MSG-140, MSG-108, MSG-151, MSG-159
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Tests qui ciblent un libellé contenant l'emoji (hasText) : utiliser le texte seul.
- **Critère d'acceptation** : Aucun emoji n'est utilisé comme icône de commande dans la conversation ; aucune couleur #7c3aed en dur dans ses composants.
- **Fichiers probables** : `js/app-04-comments-shop.js`, `js/app-09-boot-pwa.js`, `index.html`, `js/emoji-misc.js`, `styles.css`

### MSG-C83 — Noms de fichier coupés à 140 px sans moyen de les lire en entier

- **Emplacement** : Conversation › carte de document — max-width:140px / 120px en ligne (js/app-04-comments-shop.js:6067, :6096) alors que la bulle peut faire 85 % de la largeur
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Capture MSG-107 : « Programme-stage-lu… », « maquette-pont-re-m… » (mesures.tronques de la fiche) ; la taille d'un petit fichier s'affiche « 0 KB ». Le sous-titre est « Télécharger » (10 px).
- **Problème** : Deux documents au nom proche sont indiscernables ; rien ne donne le nom complet.
- **Situation déclenchante** : Recevoir ou envoyer un fichier au nom de plus d'une vingtaine de caractères.
- **Conséquence pour l'utilisateur** : Ouvrir le mauvais fichier ; doute sur ce qui a été reçu.
- **Proposition** : Laisser le nom occuper la largeur de la bulle sur deux lignes au plus (coupure au milieu en gardant l'extension), afficher le type et la taille (« PDF · 240 Ko ») ; « moins de 1 Ko » plutôt que « 0 KB ».
- **Visuels** : [MSG-107](galerie/index.html#/surface/MSG-107) · **Surfaces** : MSG-110, MSG-156
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : MSG-C50.
- **Risque de régression** : Nom de fichier écrit par un autre compte : garder escapeHtml.
- **Critère d'acceptation** : Un nom de 45 caractères est lisible en entier à 390 px ; l'extension reste visible à 320 px.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### MSG-C86 — Répondre : la barre de réponse masque le bas du dernier message, et une citation ancienne mène à « Message introuvable »

- **Emplacement** : Conversation › réponse — _renderReplyBar (js/app-04-comments-shop.js:6407-6418, insérée sans recalage du fil) ; _jumpToMsg (:6286-6293)
- **Domaine** : Messagerie · **Nature** : polish · **Type** : observation
- **Preuve** : Capture MSG-130 : la barre « Réponse à Léa Fontaine » (53 px) recouvre les réactions et l'heure du dernier message. Sonde 06 : toucher une citation dont l'original n'est pas dans les 40 derniers messages → toast « Message introuvable (peut-être plus ancien) » alors que le message existe (230 chargés).
- **Problème** : Au moment de répondre, le bas du fil glisse sous la barre ; une citation ne ramène à son message que s'il est récent.
- **Situation déclenchante** : Choisir « Répondre » fil en bas ; toucher la citation d'un message de plus de 40 messages.
- **Conséquence pour l'utilisateur** : Petite perte de contexte ; lien de citation mort dans les longues conversations.
- **Proposition** : Recaler le bas du fil quand la barre de réponse apparaît ; pour une citation hors page, charger les pages nécessaires puis faire défiler jusqu'au message.
- **Visuels** : [MSG-130](galerie/index.html#/surface/MSG-130), [MSG-185](galerie/index.html#/surface/MSG-185) · **Surfaces** : MSG-130, MSG-185, MSG-113
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : Aucune.
- **Risque de régression** : Pagination par 40 (`_convPage`) et conservation de la position.
- **Critère d'acceptation** : Barre de réponse affichée : la dernière bulle et son heure restent entièrement visibles ; toucher une citation du message n° 10 d'un fil de 230 l'amène à l'écran.
- **Fichiers probables** : `js/app-04-comments-shop.js`

### PAR-C19 — Après le partage, la feuille reste ouverte ici et se ferme là

- **Emplacement** : `sharePost`, `shareEvent` (feuille conservée) ; `copyReelLink`, `shareReelVia`, `inviterActivite` (feuille fermée)
- **Domaine** : Partage · **Nature** : polish · **Type** : observation
- **Preuve** : Sondes 01, 03, 05 : `modaleEncoreOuverte: true` après « Partager en dehors » (copie comme feuille système simulée) pour publication et activité ; fermée pour la bobine et l'invitation d'après création.
- **Problème** : Comportement imprévisible d'une porte à l'autre.
- **Situation déclenchante** : Partage externe.
- **Conséquence pour l'utilisateur** : Un appui de plus, ou un doute.
- **Proposition** : Règle unique : la feuille reste le temps de montrer la confirmation, puis se ferme seule ; après la feuille du téléphone, elle se ferme.
- **Visuels** : [PAR-003](galerie/index.html#/surface/PAR-003) · **Surfaces** : PAR-003, PAR-007
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : faible
- **Dépendances** : PAR-C07.
- **Risque de régression** : Entrée d'historique de la modale.
- **Critère d'acceptation** : Même état de `#modalBackdrop` 2 s après le partage sur les quatre portes.
- **Fichiers probables** : `js/app-03-posts-vlogs.js`, `js/app-07-ia-explore-irl.js`

### PAR-C21 — Page d'aperçu : nue pour un humain pris pour un robot  ⚠ sensible (auth, droits, données privées ou règle métier)

- **Emplacement** : `pageApercu` (netlify/lib/apercu-coeur.js:264)
- **Domaine** : Partage · **Nature** : polish · **Type** : hypothese
- **Preuve** : Capture PAR-060 : trois paragraphes et un lien « Ouvrir sur PASSIO » sans style (CSP `default-src 'none'`). Hypothèse : des navigateurs intégrés dont l'agent contient un jeton de la liste (« WhatsApp », « Mastodon »…) recevraient cette page ; non vérifié sur appareil.
- **Problème** : Une page sans mise en forme inspire peu confiance.
- **Situation déclenchante** : Agent d'un humain reconnu à tort comme robot.
- **Conséquence pour l'utilisateur** : Abandon possible avant d'ouvrir l'application.
- **Proposition** : Quelques styles en ligne (CSP `style-src 'unsafe-inline'`, toujours sans script) : fond, titre, bouton pleine largeur.
- **Visuels** : [PAR-060](galerie/index.html#/surface/PAR-060) · **Surfaces** : PAR-060
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : S · **Risque technique** : moyen
- **Dépendances** : Aucune.
- **Risque de régression** : tests/unit/apercu-liens.test.mjs (CSP et gabarit fixés) ; lot de sécurité : revue obligatoire.
- **Critère d'acceptation** : La page reste sans script ; le lien mesure ≥ 44 px de haut à 360 px.
- **Fichiers probables** : `netlify/lib/apercu-coeur.js`

### SOC-C03 — Tablette et ordinateur : la colonne mobile au milieu d'un grand vide

- **Emplacement** : `.app-shell` (colonne de 440 px) sur t768 et d1440
- **Domaine** : Transverse · **Nature** : polish · **Type** : jugement
- **Preuve** : Captures SOC-001 à SOC-006 en t768 et d1440 : la colonne mobile est centrée, le reste de l'écran est un fond décoratif.
- **Problème** : L'espace disponible n'apporte rien (sur 1440 px, 70 % de la largeur est vide) ; la barre de navigation reste en bas.
- **Situation déclenchante** : Ouverture sur tablette ou ordinateur (partage d'un lien ouvert au bureau, par exemple).
- **Conséquence pour l'utilisateur** : Impression d'application « téléphone » ; pas de défaut fonctionnel.
- **Proposition** : Garder la colonne (choix mobile-first assumé) ; à moyen terme, sur ≥ 1024 px, une barre de navigation latérale et une colonne plus large pour les fiches et les conversations. À arbitrer selon la part réelle de trafic hors mobile.
- **Visuels** : [SOC-001](galerie/index.html#/surface/SOC-001) · **Surfaces** : SOC-001
- **Priorité** : P3 · **Gravité** : 1/4 · **Effort** : L · **Risque technique** : moyen
- **Dépendances** : Mesure de la part de trafic tablette/ordinateur (Centre de pilotage).
- **Risque de régression** : Pages en `position: fixed` hors de `#appMain` (lots-ui INDEX), pied fixe de la vue Filtre calé sur `.app-shell`.
- **Critère d'acceptation** : Décision documentée à partir de la mesure de trafic ; si réalisé, aucune régression mobile sur les suites de cadrage.
- **Fichiers probables** : `styles.css`, `js/ui-v2-shell.js`
