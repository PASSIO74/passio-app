# Risques résiduels — audit PASSIO 2026-11-02

Ce qui reste incertain, pourquoi, avec quel impact et quelle prochaine action. « Non testé » n'est pas « validé ».

| # | Risque | Pourquoi il reste | Impact si réel | Prochaine action (qui) |
|---|---|---|---|---|
| R1 | **Isolation sous rôle réel en production** prouvée seulement par `authz-critical` (au push sur `main`) et par l'analyse des prédicats | `SET ROLE` refusé au rôle de lecture ; les suites `prod` de la CI visent le **staging** | une policy divergente entre staging et prod passerait la CI (c'est arrivé : `conv_reads`) | comparer `pg_policies` staging ↔ prod à chaque migration (script `schema:baseline` sur les deux projets) ; `confidentialite` + `multi-comptes` contre la prod sous `PASSIO_E2E_MULTI=1` une fois par mois (Benjamin) |
| R2 | **Capacité réelle inconnue au-delà de 100 comptes** ; chiffres de septembre partiellement périmés (page 20, pré-tri `post_masque` par ligne lue, paliers télémétrie) | aucun banc d'ici (staging injoignable, prod interdite) | un palier de croissance atteint sans l'avoir mesuré ; mur dur Realtime 500 (spend cap) | rejouer `charge-realiste.mjs --paliers 25,50,100,200` sur staging avec les seuils d'arrêt désormais codés ; relever `db-pool`, Usage et quotas dans la console (Benjamin) |
| R3 | **Liste d'attente** : correctif client déployable, mais la promotion n'aboutit en production qu'après la migration | migration non appliquée (contre-revue requise) | jusqu'à l'application : impasse honnête (0 ligne, rien annoncé), comme avant | appliquer la migration, puis `multi-comptes` B-02 (Benjamin) |
| R4 | **Trigger d'admission 18+ et promotion** : la garde porte sur l'appelant, pas sur la personne promue ; un mineur déclaré déjà en liste d'attente (entré avant l'allumage d'`irl_adult_only`) serait promu | banc sans ce trigger ; cas théorique (0 ligne `waitlist` en prod) | une promotion d'un compte non admis | ajouter au banc le trigger d'admission et un cas « promu non admis → refus » ; ou vérifier `adult_access_allowed()` pour la cible dans la RPC (coordinateur/agent C) |
| R5 | **Identifiants de notification non réservés** (`n_pa_`, `n_f*_` de `follows_notifier`) : squat contourné pour la promotion (ré-insertion), pas pour les suivis | défaut préexistant, hors lot | une notification de suivi détournée par un squatteur | étendre `identifiant_reserve_au_serveur` (migration, agent C) |
| R6 | **`conv_reads` par appartenance** casserait l'accusé ✓✓ des ~19 conversations historiques sans `conv_members` jusqu'au premier message | `supaMarkRead` ne lit pas `{ error }` | accusés de lecture manquants (silencieux) | corriger `supaMarkRead` AVANT d'appliquer la migration C (revue 10b) |
| R7 | **Pagination des messages par offset** : un INSERT/DELETE entre deux pages décale d'une ligne (doublon absorbé par la fusion, trou possible d'une ligne ancienne) | conversations > 1 000 messages seulement | un ancien message manquant jusqu'au rechargement suivant | curseur `(created_at, id)` (coordinateur) |
| R8 | **Edge Functions jamais exécutées par un test** (Deno absent ; CI = fumée OPTIONS/401) | environnement | un défaut de câblage `index.ts` passerait | extraire des fonctions pures testables en Node (B-03) ; ou job Deno en CI |
| R9 | **Dépendance MapLibre 4.7.1 (CVSS 10, sanitizer)** | montée de 2 majeures non faite dans le lot | faible : `escapeHtml` est la barrière et B-01 est fermé | monter en 6.16.0 avec `map-loader.js` ; gate d'avis sur `js/vendor/` |
| R10 | **Sentinelle** : un défaut n'est vu qu'en demi-journée (crons servis 3–17 % des créneaux) ; angle mort structurel (HTTP 200 faux, bouton mort, télémétrie coupée) ; G-02 fermé mais le même `if:` déclenche encore sur `opened` pour « Réparer » (voulu) | nature des crons GitHub ; conception | panne silencieuse entre deux passages | garder la veille et le pilotage comme second regard ; décider un cron pour `controle-realtime.yml` (G-03) |
| R11 | **Restauration** rejouée sur archive synthétique (PG16) : `auth.users`, Storage, API de gestion, schéma complet non éprouvés ici ; rollback Netlify jamais exercé en réel sur 30 j | GoTrue/Storage absents en local | une restauration réelle plus longue ou incomplète que prévu | exercer un rollback Netlify en heure creuse ; rejouer le cycle complet sur un projet jetable (RES-04) |
| R12 | **Fluidité réelle** (WebKit/iPhone, 3G, appareils modestes) non mesurée : LCP stub 3,9 s / 12,6 s, CLS 0,32 | stub local, hôtes externes coupés | première carte après 12 s sur mobile bas de gamme | réserver les hauteurs (CLS), découper `app.js` (messagerie/IRL/studio à la demande), mesurer sur un vrai iPhone |
| R13 | **Trafic d'écriture non plafonné** sur `conversations` (113 orphelines), `conv_members`, `post_likes`, `user_passions`… (C-05 et liste C §9) | pas d'anti-flood serveur sur ces tables | spam/abus à la croissance | anti-flood `trg_rate_limit` sur les tables listées ; purge des conversations sans membre |
| R14 | **Secrets** : historique git non audité (clone shallow) | environnement | une clé dans l'historique public | `gitleaks`/`trufflehog` sur l'historique complet (Benjamin) |
| R15 | 20 tests locaux rouges sous Chrome 148 stable, verts en CI | écart Chromium épinglé / Chrome stable | aucun pour les utilisateurs ; bruit pour qui teste hors CI | documenter `PASSIO_CHROMIUM` et le lot dans `docs/journal/` ; ou aligner la version |
| R16 | **`compte-suspendu.spec.js` ① instable en CI** (rouge sur `main` le 01/11 et sur la branche le 02/11 : l'écran montre « Choisis un nom d'utilisateur » au lieu du refus de suspension) | onboarding/ordre des gardes, hors diff de l'audit | un déploiement de `main` retardé par un rouge sans rapport ; ou un vrai défaut d'affichage du refus pour un compte suspendu (E-07 voisin) | diagnostiquer avec le skill `diag` sur ce cas précis ; décider flaky vs défaut (Benjamin/Claude) |

## Décisions produit à prendre (pas des défauts techniques)

1. **C-04** — la liste nominative des participants (et leur `feedback`) est lisible par tout compte connecté, événements
   passés compris : réserver aux inscrits + organisation ?
2. **C-14** — dépôt public : dossier investisseurs, business plan, vidéos (51 Mo) lisibles par tous ; rendre le dépôt
   privé ou en sortir ces dossiers ?
3. **F-05 / F-07** — supprimer l'index doublon et les 11 inutilisés ; fusionner les deux policies `realtime.messages`
   (doublon d'accent) et les réécrire en `(select auth.uid())`.
4. **E-08** — « signaler ce message » n'existe pas (DSA) ; et R5 côté suivis.

## Conditions d'une ouverture plus large

Les preuves de cet audit soutiennent une **poursuite de l'ouverture à l'échelle actuelle (dizaines à centaines de
comptes)** : aucun P0, les P1 traités, les frontières de confiance tenues par la base. Elles ne soutiennent **pas
encore** une ouverture à des milliers d'actifs simultanés : il faut d'abord (a) le banc de charge R2 sur staging avec
ses seuils d'arrêt, (b) la comparaison staging ↔ prod R1 outillée, (c) les migrations de ce lot appliquées et
mesurées, (d) une décision sur C-04 et C-14 avant d'accueillir des inconnus en nombre.
