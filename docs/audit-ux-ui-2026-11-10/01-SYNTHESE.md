# Synthèse — audit UX/UI de PASSIO

> Version auditée : `main` au commit `4e1d8ed1` (10 novembre 2026), identique à la production
> (`buildId 3d8e98bb12ad`). Audit réalisé dans un navigateur isolé de la production, avec des
> données fictives ; rien n'a été écrit en base ni envoyé à de vraies personnes. Modèle : Claude
> (Fable 5 puis Opus 5.5 pour la fin de session), dans l'application de bureau Claude, avec un
> sous-agent par domaine ; navigateurs Chromium 158 et WebKit 27.2 pilotés par Playwright 1.65.

## En une phrase

**PASSIO fonctionne de bout en bout — on peut découvrir une publication, écrire à son auteur et
rejoindre son activité en sept gestes — mais l'application dit trop souvent autre chose que ce
qu'elle fait : des messages cachés sous les fenêtres, des réussites annoncées pour des refus, des
réglages sans effet et des exemples qui se font passer pour de vraies personnes.**

## Couverture

| | Nombre |
|---|---|
| Surfaces et états inventoriés (code + navigateur) | **656** |
| Observés dans le navigateur par de vrais gestes | 433 |
| Simulés dans le banc (état forcé, déclaré) | 122 |
| Identifiés dans le code, non rendus | 81 |
| Non vérifiables ici (appareil réel, deux appareils, push…) | 17 |
| Sans objet | 3 |
| Avec capture « avant » réelle | 520 |
| **Maquettés avant / après** | **221** |
| Jugés « à conserver » | 165 |
| **Restant à examiner** (code seul + inaccessibles) | **98** |
| Images (captures, maquettes, gros plans) | 1 646 |
| Prototypes interactifs de parcours | 4 |

**La couverture n'est pas de 100 %** : 98 surfaces n'ont pas été vues fonctionner, et le
recroisement avec l'inventaire statique du code relève 21 fonctions d'ouverture (sur 95) que
les rapports ne nomment pas explicitement — la plupart correspondent à des surfaces atteintes par
le geste (visionneuse de stories, sélecteurs d'emoji), mais ce n'est pas prouvé une par une
(détail : [06-LIMITES.md](06-LIMITES.md)).

## Constats

**300 constats** : **1 P0**, **55 P1**, 135 P2, 109 P3 — par domaine dans la
[galerie](galerie/index.html) et dans [04-BACKLOG.md](04-BACKLOG.md).

| Domaine | Surfaces | Avant/après | Constats | P0 | P1 |
|---|---|---|---|---|---|
| Parcours cœur (bout en bout) | 10 | 3 | 6 | 0 | 2 |
| Entrée et navigation | 51 | 10 | 19 | 0 | 3 |
| Fil et interactions | 64 | 15 | 30 | 0 | 2 |
| Recherche et découverte | 36 | 13 | 19 | 0 | 4 |
| Profils et passions | 49 | 22 | 23 | 0 | 2 |
| Création et médias | 41 | 14 | 18 | 0 | 1 |
| Bobines et stories | 38 | 9 | 22 | 0 | 4 |
| Rencontres IRL | 96 | 22 | 39 | 0 | 6 |
| Messagerie | 146 | 69 | 71 | 0 | 18 |
| Partage | 59 | 23 | 21 | 1 | 5 |
| Transverse (et socle de mesure) | 66 | 21 | 32 | 0 | 8 |

## Les sept problèmes qui comptent le plus

1. **Arriver par un lien ne mène pas à un compte (P0, PAR-C01, PAR-C02).** Un visiteur qui ouvre un
   lien partagé et touche « Créer mon compte » ne voit rien : le formulaire s'ouvre derrière la
   publication, l'activité ou la bobine. Après l'inscription, le contenu du lien n'est pas rouvert.
   C'est la porte d'entrée de la croissance par le partage.
2. **Les messages de l'application sont cachés (TRA-C01).** Les toasts sont peints sous toute
   fenêtre, conversation, feuille ou lecteur : « Message trop long », « micro refusé », « Lien copié »,
   les validations de « Créer une activité »… ne se voient pas. Le geste semble ne rien faire.
3. **Des refus annoncés comme des réussites (TRA-C03).** Profil (y compris le passage en compte
   privé), suppression d'un commentaire, ajout d'un membre, envoi d'un GIF, publication : quand le
   serveur refuse, l'écran dit que c'est fait.
4. **Le passage du fil à la rencontre se casse en route (PCS-C01, PCS-C03, IRL-C50, BOB-C03,
   REC-C04).** La porte « Voir l'activité » manque pendant la première minute ; l'inscription ne
   confirme rien et place « Retirer ma participation » sous le doigt ; dans les bobines, les sorties
   vers le réel sont hors de l'écran ; la fiche d'une passion ne mène jamais à Rencontrer.
5. **La messagerie perd ou trompe (MSG-C01, MSG-C02, MSG-C53 à C58).** Épingles, archives, sourdine
   et brouillons s'effacent au démarrage ; « Couper les notifications » ne coupe rien ; un toucher bref
   sur le micro enregistre sans fin ; la position part en un toucher ; les suppressions n'ont ni
   confirmation ni annulation.
6. **Les exemples se font passer pour de vraies personnes (MSG-C03, MSG-C04, REC-C02, IRL-C01).**
   « Nouveau message », « Nouveau groupe », la recherche et les créateurs à suivre proposent des
   personnages d'exemple sans les marquer ; suivre l'un d'eux écrit une vraie ligne en base.
7. **Des réglages qui ne commandent rien et des confirmations absentes (TRA-C04, TRA-C05, TRA-C10,
   TRA-C11, TRA-C17).** Cinq interrupteurs de notifications sur six et tout « Bien-être digital » sont
   inopérants ; bloquer agit sans confirmation ou par une boîte native ; on ne peut pas signaler une
   activité (le bouton est sous le pied fixe) ni une bobine.

## Ce qui marche et doit être conservé

- **Les acquis d'accessibilité tiennent** : aucun champ sous 16 px, zoom permis, aucun débordement
  horizontal sur 686 captures mesurées (320 à 1440 px), contrastes de la palette v2 conformes sur
  fond uni, focus visible au clavier.
- **Un geste par étape** dans le parcours cœur, un profil visité clair (Message et Suivre côte à
  côte), une fiche d'activité qui dit l'essentiel d'un coup d'œil.
- **L'identité visuelle actuelle** (violet #6D32F4, Manrope, cartes blanches, corail réservé au
  réel) est cohérente et lisible ; les propositions la conservent.
- **Rendu identique sous WebKit** pour les six écrans principaux.

## Ce qu'il faut faire, dans l'ordre

Neuf lots, détaillés dans [03-LOTS.md](03-LOTS.md) avec résultat attendu, critères d'acceptation,
fichiers, risque, vérifications, métrique et retour arrière :

| Vague | Lots |
|---|---|
| 1 · corrections rapides | **LOT-1** les messages se voient et disent vrai · **LOT-2** arriver par un lien → compte → contenu (*critique : parcours d'authentification*) |
| 2 · parcours principaux | **LOT-3** du fil à la rencontre sans rupture · **LOT-4** messagerie fiable · **LOT-5** exemples séparés du réel · **LOT-6** suivre, bloquer, signaler, confirmer (*critique : droits et modération*) · **LOT-7** réglages honnêtes |
| 3 · harmonisation | **LOT-8** un vocabulaire, une famille d'icônes, des cibles de 44 px |
| 4 · évolutions | **LOT-9** à arbitrer après mesure (tablette/ordinateur, contexte de conversation, réponse aux stories, position) |

Les lots 1 à 3 simplifient et réparent ; aucun n'ajoute de fonctionnalité. Les quatre prototypes
([galerie › Prototypes](galerie/index.html#/prototypes)) montrent l'enchaînement proposé pour :
rejoindre une activité, écrire dans une conversation, partager un contenu, et la première visite.

## Observation, jugement, hypothèse

Chaque constat porte son type : **observation** (mesurée ou capturée), **jugement** (avis
ergonomique argumenté) ou **hypothèse** (à vérifier auprès d'utilisateurs). Aucun gain de temps ni
de conversion n'est présenté comme mesuré. Les limites du banc (émulation, serveur imité, temps réel
coupé) sont listées dans [06-LIMITES.md](06-LIMITES.md).
