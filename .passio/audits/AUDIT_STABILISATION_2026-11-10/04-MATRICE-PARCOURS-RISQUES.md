# 04 — Matrice des parcours et des risques couverts (2026-11-10)

> Deux matrices : ce que la FRONTIÈRE SERVEUR autorise (qui peut lire et écrire quoi), et ce que les TESTS prouvent
> des parcours. Les versions complètes, cellule par cellule, sont au dossier privé (`rapports/SRV-…md` annexe B,
> `rapports/PARC-…md` § matrice). Ici : la synthèse, et surtout le NIVEAU DE PREUVE de chaque ligne.

## A. Autorisation à la frontière serveur

Niveaux : **réel-prod** = exécuté sous rôle réel contre la production · **réel-staging** = idem, staging · **sonde** = `GET`
anonyme contre la production (10/11) · **catalogue** = prédicats des policies de production lus au canal ① (non exécutés).

| Surface | Anonyme | Propriétaire | Autre compte | Membre / non-membre | Bloqué | Preuve |
|---|---|---|---|---|---|---|
| Messages, conversations, membres | 0 ligne | — | 0 ligne | membre ✔ / non-membre ✖ | messages de l'autre masqués | sonde + réel-prod (`authz-critical`) + réel-staging |
| Notifications | 0 ligne | lit, marque lu, supprime | 0 ligne ; écriture vers autrui trop ouverte (SRV-02) | — | ✖ | sonde + réel-prod + catalogue |
| `user_state`, `user_safety`, abonnements push | 0 ligne / refus | ✔ | ✖ | — | — | sonde + réel-prod (`user_state`) + catalogue |
| Publications, stories, commentaires, « j'aime » | compte public seulement (1 publication aujourd'hui) | ✔ | compte privé : abonné accepté seul | — | compte privé ✖ ; compte public lisible (par conception) | sonde + réel-staging + catalogue |
| Profils | **toutes colonnes, comptes privés compris** (`bio`, `rs_links` : STAB-09) | ✔ | lecture ✔, écriture ✖ | — | lecture ✔ | sonde + réel-prod |
| Activités | tout sauf `address`, `contact`, `conv_id` (refus 42501 mesuré) | ✔ | adresse : organisation et venants | — | ligne d'inscription de l'autre masquée | sonde + catalogue ; RSVP d'autrui : **réel-staging seulement** (12c sauté en production) |
| Inscriptions à une activité | refus | sa ligne | par lien (venants entre eux, abonnés mutuels) | — | ✖ | sonde + réel-staging + catalogue |
| Pièces jointes (seau privé) | ✖ (400 mesuré) | ✔ | ✖ | membre ✔ (bloqué compris : R42) | voir R42 | sonde + réel-prod (écriture cloisonnée) |
| Signalements, preuves, modération, pilotage, journal des migrations | 0 ligne ou refus | — | ✖ | — | — | sonde + catalogue |
| Télémétrie, erreurs clientes | écriture ✔ (voulu), lecture 0 ligne | idem | idem | — | — | sonde + réel-prod |
| Réglages distants | lecture `cle, valeur, maj` (0 ligne posée) | — | écriture ✖ | — | — | sonde + catalogue |
| Canaux temps réel privés | — | `user:<moi>`, `ring:<moi>` | ✖ | par appartenance | — | catalogue ; **révocation en cours de session : non vérifiée** |

**Ce qui n'est PAS démontré sous rôle réel en production** : tout ce qui dépasse le seul test `authz-critical` — blocage,
confidentialité de compte privé, messagerie de groupe, activités — n'est éprouvé que sur le staging, dont l'égalité avec la
production n'est mesurée par aucun outil (il a déjà eu dix-sept jours de retard, journal du 07/11).

## B. Parcours × preuves

Légende des preuves : **S** simulé (navigateur + faux serveur) · **R** réel (staging) · **P** réel (production) · **W** moteur WebKit ·
**—** aucune. « Rechargé » et « 2ᵉ compte » : vérifié après rechargement / depuis un second compte.

⚠️ **Synthèse, pas mesure cellule par cellule.** Ce tableau résume le rapport de l'agent « parcours » (lecture du code et des titres
de tests ; seules certaines assertions ont été lues) et les rapports ETAT et SRV. Le coordinateur n'a relu une à une que les lignes
citées dans `03-REGISTRE-FINDINGS.md` sous `coord.`. Une cellule « S » ou « R » dit qu'une suite existe sur ce parcours, pas que
chaque état (vide, lent, refusé, interrompu, expiré, hors ligne) y est asserté — la matrice état par état est au rapport PARC.

| Parcours | Traité dans le code | Preuve | Rechargé | 2ᵉ compte | Ce qui reste |
|---|---|---|---|---|---|
| Inscription e-mail, consentements, majorité | refus dits en français, renvoi du lien | S | oui | — | jamais sur WebKit ni avec un vrai e-mail (PARC-07) ; lien expiré muet |
| Confirmation d'e-mail, connexion | oui | S, R (comptes pré-confirmés) | oui | — | délivrabilité réelle non prouvée depuis le 11/09 |
| Mot de passe oublié | écran sans sortie, refus en anglais brut | **—** (PARC-06) | — | — | à tester et à traduire |
| Déconnexion, changement de compte | purge + rechargement | S | oui | S | déconnexion globale (ETAT-02) ; deux clés hors purge (ETAT-12) |
| Première visite d'un visiteur | oui | S, W | oui | — | le fil réel ne porte qu'une publication (STAB-04, STAB-05) |
| Publier (texte, image, bobine, story) | états de synchronisation, reprise | S, R (texte) | oui | R | média sous session morte : « Média perdu » (ETAT-14) |
| Supprimer une publication | pierre tombale, file | S, R | oui | R | preuve de suppression sans session (ETAT-05) |
| Réagir, commenter une publication | file de commentaires | S, R | oui | R | réponse rejouée en double (ETAT-10) ; réactions sans verdict (ETAT-11) |
| Commenter, réagir sur une ACTIVITÉ | échec muet | S | — | — | PARC-01, ETAT-09, SRV-03 |
| Profil, suivre, compte privé | verdict lu pour l'abonnement | S, R | oui | R | « ne plus suivre » sans verdict, retraits qui reviennent (ETAT-08) ; demande en attente comptée abonné (PARC-04) |
| Modifier son profil, confidentialité | **succès annoncé sans verdict** | S | partiel | — | ETAT-03 |
| Conversation 1:1, médias | file par compte, propriétaire vérifié | S, R, W (ouverture) | oui | R | bulle en échec et brouillon perdus au démarrage (ETAT-07) ; « supprimer pour tous » sans verdict (ETAT-04) |
| Groupe | création avec comptes de démonstration seulement | S | — | — | PARC-02, SRV-04 |
| Créer une activité, s'inscrire, se désinscrire | `setEventRsvp` : verdict, motif, annulation | S, **R** | oui | R | pointage, note, annulation jamais joués en réel (PARC-10) |
| Blocage, signalement | verdict lu | S, R (blocage) | oui | R | signalement jamais joué en réel |
| Notifications, liens profonds | attente bornée, compte bloqué refusé | S | oui | — | « a aimé ton événement » n'ouvre rien (PARC-03) ; push jamais joué en réel |
| Export, suppression de compte | aucun succès sans verdict | S, R (suppression) | oui | — | export jamais joué en réel |
| Recherche, exploration | oui | S | — | — | — |
| Hors ligne, reconnexion, session expirée | files, mode expiré | S | oui | — | bandeau rouge qui purge (ETAT-06) |

## C. Ce que couvre réellement la CI du commit de référence

| Job | Ce qu'il prouve | Ce qu'il ne prouve pas |
|---|---|---|
| Audits statiques et bancs serveur | gates de structure, 1 038 tests unitaires, bancs SQL sur PostgreSQL jetable | l'état de la production |
| 6 lots navigateur (2 587 tests) | le comportement du CLIENT sur un serveur simulé, fichiers de développement | une policy réelle ; l'artefact minifié |
| Suites WebKit (12 suites) | démarrage, cadrage, première visite, chargeur, worker au moteur de l'iPhone | un vrai iPhone ; l'inscription |
| Suites à comptes réels | 21 tests sur le STAGING ; `authz-critical` sur la PRODUCTION | l'égalité staging ↔ production |
| Gates artefact (2 suites) | l'identité de version et le contexte passionnel sur `dist` | la page APRÈS minification (STAB-10) |
