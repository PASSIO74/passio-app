# Couverture des 37 points du mandat (+ Centre de pilotage, Sentinelle, sécurité administrative) — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf`. Pour chaque point de l'ordre de mission : le ou les domaines qui l'ont traité, le rapport où lire le détail, la couverture (OUI · PARTIEL · NON) et ce qui manque. Une couverture PARTIELLE signifie le plus souvent « fait en émulation ou par inspection, pas sur appareil réel ni en production » — le rapport 13 liste chaque preuve manquante.

| # | Point du mandat | Domaines | Rapport | Couverture | Ce qui manque |
|---|---|---|---|---|---|
| 1 | Cartographier écrans, onglets, boutons, modales, formulaires, fonctions, données, services | carto | 02 | OUI | Fichier servi en production non lu (proxy) |
| 2 | Tous les onglets, logique cohérente | carto, ux-onboarding | 02, 03 | OUI | — |
| 3 | Chaque fonctionnalité au bon endroit, non dupliquée | carto, code-nettoyage | 02, 05 | OUI | — |
| 4 | Tous les parcours de bout en bout | ux-onboarding, contenu, messagerie, irl, profils | 03, 04 | PARTIEL | Parcours sur la production et sur appareil réel ; inscription réelle par e-mail |
| 5 | Pitch, arrivée directe, onboarding, tour, bulles | ux-onboarding | 03 | OUI | Appareil iOS réel (UXO-01 mesuré en émulation) |
| 6 | Bulles claires, au bon moment, fermables, sans répétition | ux-onboarding | 03 | OUI | — |
| 7 | Profils multiples, passions, identité active par action | profils-passions | 04 | OUI (reconstitué) | Relecture adversariale ; valeur réelle de `max-rows` |
| 8 | Publications, photos, vidéos, bobines, stories, audio, podcast, formats réels | contenu | 04 | OUI | Lecture mp4/m4a sur iOS réel ; upload réel jusqu'au Storage |
| 9 | Réactions, commentaires, abonnements, invitations, partage | contenu, messagerie | 04 | OUI | — |
| 10 | Messagerie, pièces jointes, notifications | messagerie-notifs | 04 | OUI | Push et appels WebRTC sur deux appareils réels ; listing Storage réel (proxy) |
| 11 | IRL : création, modification, annulation, recherche, filtres, liste, carte, inscription, désinscription, adresse, participants | irl | 04 | OUI (reconstitué) | Carte (tuiles bloquées) ; relecture adversariale |
| 12 | Signalements, blocages, faux comptes, spam, harcèlement, outils de modération | moderation | 10 | OUI | Réglages captcha / rate limits Auth (non lisibles) |
| 13 | Authentification, confirmation e-mail, récupération, sessions, suppression du compte | auth-rgpd | 06 | OUI | Réglages Auth du projet (sessions, rate limits, Google) ; parcours e-mail réel ; relecture adversariale |
| 14 | Supabase : tables, RLS, Storage, Realtime, fonctions, clés, permissions, séparation | supabase-isolation | 06 | OUI | Plan/limites Realtime ; REST anon direct (proxy) |
| 15 | Plusieurs comptes : jamais accès aux données d'un autre | supabase-isolation, messagerie, moderation | 06, 04, 10 | PARTIEL | Preuve sous rôle (SET ROLE refusé) ; suites prod à comptes réels non relancées (vertes en CI) ; fuites transverses PROUVÉES (conv_reads, event_attendees, Storage) |
| 16 | Données personnelles, consentement, localisation, export, suppression, RGPD | auth-rgpd, exploitation | 06, 10 | OUI | Relecture adversariale |
| 17 | Code mort, doublons, anciennes interfaces, fonctions inutilisées, docs obsolètes | code-nettoyage, carto | 05, 02 | OUI | Confirmation une à une des 114 classes CSS candidates |
| 18 | Dépendances, secrets, erreurs silencieuses, collisions, migrations, SW, cache, flags, kill switches | code-nettoyage, supabase-isolation, tests-ci | 05, 06, 04 | OUI | Scan de secrets GitHub natif (droits admin) |
| 19 | Conserver / supprimer / nettoyer / refactoriser / soumettre | code-nettoyage | 05 | OUI | — |
| 20 | Performances : démarrage, navigation, recherche, carte, messagerie, longs fils, médias, mémoire, batterie, réseau lent | perf-capacite-couts | 07 | PARTIEL (reconstitué) | Carte ; batterie ; appareil réel ; médias réels |
| 21 | Requêtes lentes, index, pagination, traitements inutiles, limites Realtime | perf, supabase-isolation | 07, 06 | OUI | Limites du plan Realtime |
| 22 | Doubles clics, actions simultanées, pertes réseau, reprises, permissions refusées, changement de profil pendant une action | robustesse-pannes | 04 | OUI (reconstitué) | Appareil réel (veille, bascule Wi-Fi/4G) ; relecture |
| 23 | Capacité 1 000 / 10 000 / 100 000 | perf-capacite-couts | 07 | NON — **capacité non prouvée** | Staging + campagne de charge |
| 24 | Coûts Supabase / Netlify / stockage / bande passante / e-mails / médias / carte / services | perf-capacite-couts | 07 | PARTIEL | Plans et factures (non lisibles) ; seuls les volumes sont mesurés |
| 25 | « Capacité non prouvée » sans mesure | perf | 07, 12 | OUI | — (le verdict l'applique) |
| 26 | Charge sur staging seulement | perf | 07 | OUI | Aucune charge lancée (pas de staging) |
| 27 | iPhone / iPad / Android / tablette / Windows / macOS | appareils-a11y | 09 | PARTIEL | Émulation seulement ; aucun appareil réel |
| 28 | Safari / Chrome / Edge / Firefox / Samsung / PWA installée | appareils-a11y | 09 | NON (Chromium seul) | Autres navigateurs non installables |
| 29 | 320 / 360 / 390 / 412 / 430, tablettes, ordinateurs | appareils-a11y | 09 | OUI (émulation) | Appareil réel |
| 30 | Portrait / paysage / encoches / clavier virtuel / souris / clavier / zoom / texte agrandi | appareils-a11y | 09 | PARTIEL | Encoches, clavier virtuel, zoom 200 %, texte agrandi non analysés |
| 31 | Caméra / micro / localisation / partage / notifications / permissions refusées | appareils-a11y, robustesse | 09, 04 | OUI (émulation) | Appareil réel |
| 32 | Réel vs émulation vs non réalisé | tous | 13 | OUI | — (chaque contrôle porte sa méthode) |
| 33 | Accessibilité : contraste, lecteur d'écran, focus, boutons, alt, animations | appareils-a11y | 09 | PARTIEL | Lecteur d'écran, focus des modales, reduced-motion non réalisés |
| 34 | Sauvegardes / restauration / rollback / modes dégradés | exploitation-continuite, robustesse | 10, 04 | OUI | Plan Supabase (sauvegardes auto, PITR) ; rollback Netlify réel |
| 35 | Pannes Supabase / Netlify / SMTP / carte simulées sans risque | robustesse, exploitation | 04, 10 | PARTIEL | Panne SMTP non simulée ; Netlify non observable |
| 36 | Support, incidents, demandes RGPD, continuité | exploitation-continuite | 10 | OUI | — |
| 37 | Juridique, contenus, PI, mineurs, sécurité IRL | exploitation, moderation, auth-rgpd, irl | 10, 06, 04 | OUI | Relecture juridique par un professionnel |
| CP | Centre de pilotage : chaîne fonctionnalité → signal → alerte → diagnostic → action → preuve ; 15 affichages | pilotage-sentinelle | 08 | OUI | Déploiement Render réel ; runtime Sentinelle en conditions réelles |
| SE | Sentinelle : 10 propriétés | pilotage-sentinelle | 08 | OUI | Exécution réelle (CLI `claude` connecté) |
| AD | Sécurité administrative : MFA, rôles, autorisations, journal, confirmation | pilotage-sentinelle | 08 | OUI | Instance Render (mot de passe fort ?) |

## Synthèse de couverture

| Couverture | Points |
|---|---|
| OUI | 26 (dont 4 reconstitués par l'orchestrateur à partir des preuves de sous-agents interrompus : points 7, 11, 22 et 31 en partie) |
| PARTIEL | 11 |
| NON | 2 (23 capacité, 28 navigateurs) |

Le critique de complétude automatisé (`outillage/wf-completude.js`) n'a pas été lancé, faute de crédits ; cette matrice a été établie à la main par l'orchestrateur à partir des 462 contrôles rendus (135 PROUVÉ · 79 CONFORME PAR INSPECTION · 22 PROBABLE · 181 DÉFAILLANT · 41 BLOQUÉ · 4 NON APPLICABLE).
