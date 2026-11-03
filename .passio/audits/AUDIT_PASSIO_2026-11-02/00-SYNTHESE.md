# Audit PASSIO du 2026-11-02 — synthèse

> Qualité, fiabilité, sécurité et performance de **Passio**, de sa **Sentinelle** et de son **Centre de pilotage**.
> Mené du 2026-11-02 16:35 au 2026-11-03 02:00 (Paris) sur `main` à `6ea94e1` (PR #679, en production), par un
> coordinateur et sept agents spécialisés (B backend, C données/sécurité, D frontend, E parcours multi-comptes,
> F performance, G Sentinelle/exploitation, H Centre de pilotage), puis une **revue indépendante** des correctifs
> par un relecteur qui n'y avait pas participé. Branche : `audit/2026-11-02-qualite-securite`, PR **#681**.
> Rapports détaillés : `rapports/`, preuves : `preuves/`, registre : `02-REGISTRE-ANOMALIES.md`.

## Le verdict, en une page

**Aucun P0.** L'isolation des comptes tient là où on l'a regardée : policies RLS évaluées table par table sur le
catalogue réel (messagerie, notifications, push, `user_state`, `user_safety`, secrets de pointage, tables fermées →
rien pour un non-membre, rien pour `anon`), `search_path` figé sur 100 % des fonctions, barrière de suppression de
compte appliquée (27 tables), `attachments` privé, télémétrie horodatée serveur et sans donnée personnelle, portes
d'authentification des cinq Edge Functions fermées, aperçus de partage résistants aux charges hostiles, auto-fusion de
la Sentinelle réellement bloquée par la CI et la contre-revue (vérifié sur les PR #677/#678 du jour).

**Cinq P1, tous traités** (quatre corrigés et retestés dans la branche, le cinquième corrigé côté client avec sa
migration prête à appliquer) :

| ID | Problème | État |
|---|---|---|
| B-01 | XSS stocké : l'emoji d'une activité d'autrui entrait dans le marqueur de la carte sans échappement (exécution de script chez quiconque ouvrait la carte) | **corrigé et retesté** (rouge sur `main`, vert sur la branche) |
| B-02 / E-01 | La liste d'attente des activités n'avait AUCUNE sortie : la promotion faisait un UPDATE sur la ligne d'autrui, refusé par la RLS (0 ligne), automatique comme manuelle — depuis toujours | **corrigé** : RPC `promouvoir_attente` (migration prête, banc 43/43 dont concurrence et squat d'identifiant) + client avec transition ; **la migration attend ta contre-revue** |
| F-03 | Une conversation de plus de 1 000 messages perdait ses messages **les plus récents** à l'écran (plafond `max-rows` de PostgREST, lecture ascendante sans borne) | **corrigé et retesté** (pagination depuis la fin) |
| D-01 | À la déconnexion, les conversations du compte sortant étaient réécrites en local (`beforeunload`) et pouvaient réapparaître sous le compte suivant | **corrigé et retesté** |
| H-01 | La réparation automatique du dashboard pouvait écrire dans `tests/` ou `.github/` malgré la liste blanche (en-têtes `---/+++` non contrôlés) | **corrigé et retesté** (périmètre critique : contre-revue) |

**32 P2 et 37 P3** sont au registre ; **17 corrigés et retestés** dans la branche (10 P2, 7 P3 — dont la fausse alerte permanente de
la veille G-01, la mention `@claude` qui relançait un agent depuis un texte d'erreur G-02, MapLibre chargé à tout
démarrage F-01, le motif de signalement vide E-05, le SSE du dashboard non cloisonné H-02, `meta.ech` forgeable H-10,
les défauts d'accessibilité D-03…D-06), **1 partiel** (D-02 cibles tactiles), **2 préparés en migration** (C-01 accusés de lecture par appartenance + C-03
privilèges TRUNCATE/REFERENCES/TRIGGER inutiles), le reste documenté avec sa cause, son correctif proposé et sa
priorité.

**Ce que ça dit du produit.** Passio est solide là où ça compte : les frontières de confiance sont tenues par la
base, pas par l'écran ; les défauts trouvés sont des trous de couverture (une fonctionnalité annoncée jamais mesurée
en base réelle, une pagination oubliée, un emoji non échappé) plutôt que des défauts d'architecture. La Sentinelle et
le pilotage font ce qu'ils annoncent, avec les angles morts qu'ils nomment eux-mêmes. Ce qui manque pour une
croissance forte est mesuré, pas deviné : voir `05-RISQUES-RESIDUELS.md`.

## Ce qui a été démontré (et comment)

- **Suite locale complète** jouée sur `main` intact : **2 061 tests, 2 014 verts, 27 sautés, 20 rouges** — les 20 ont
  été **rejoués sur une copie intacte de `main`** et sont rouges à l'identique (`preuves/suite-locale-*`) ; la CI du
  même code (Chromium épinglé par Playwright) les passe tous : ce sont des écarts d'environnement (Chrome 148 stable
  du bac à sable), pas des défauts du produit. Après les correctifs : `irl` 120/120, messagerie 119/119, IRL/carte
  80/85 (les 5 rouges = ces écarts préexistants), `npm run verif` vert à chaque commit.
- **CI complète sur la branche** (run 41550158186 sur le SHA final `387e585`) : smoke, **suites production à comptes
  réels** (`authz-critical`, `blocage-acces`, `irl-trust-safety-reel`, `user-state-horodatage`, `confidentialite`),
  6 shards navigateur, WebKit iPhone, gates de l'artefact `dist`, audits statiques et bancs serveur : **tous verts** ;
  seule « Gouvernance critique » est rouge, **par conception** : la branche touche un périmètre critique et exige ta
  revue GitHub ancrée sur le SHA de tête (détail des runs intermédiaires dans `03-RESULTATS-TECHNIQUES.md`).
- **Base de production, lecture seule** : inventaire complet des policies, GRANTs, fonctions `SECURITY DEFINER`
  (corps lus), triggers, buckets, publication realtime ; intégrité par agrégats (orphelins, doublons, conversations
  sans membre) ; `pg_stat_statements` sur 173 jours ; `EXPLAIN ANALYZE` des huit lectures les plus fréquentes ;
  recalcul indépendant des chiffres du pilotage (0 écart sur les agrégats, 4 écarts de **définition**).
- **Bancs SQL sur PostgreSQL 16 jetable** avec les policies et triggers de prod recopiés : 42 bancs existants verts,
  3 bancs neufs (oracles/privilèges 38/38, promotion 43/43, injection Sentinelle) avec **mutations** prouvant que
  chaque banc rougit quand on retire la garde.
- **Parcours multi-comptes** sur un faux serveur PostgREST partagé (policies de prod recopiées, vrai SDK, un
  navigateur par compte) : 10/10 scénarios (contenu, course pour la dernière place, messagerie, suivi, session,
  signalement), plus 6 cas de promotion/pagination/XSS écrits pour l'audit ; et des cas AJOUTÉS aux suites `prod`
  (cas 12 d'`authz-critical` : auto-acceptation d'un suivi, intrusion dans une conversation, RSVP d'autrui).
- **Sentinelle** : injection de lots d'erreurs synthétiques (nouveau défaut, rejeu, récidive, bruit, charges
  hostiles avec `@claude`, Markdown, 20 Ko) → titre et corps désamorcés ; la seule brèche (G-02) est fermée ;
  restauration **rejouée** sur archive synthétique au format exact ; vie réelle des 9 crons mesurée sur 7 jours
  (100 % de réussite, servis 3–17 % des créneaux : un défaut se voit en demi-journée, pas dans l'heure).
- **Fluidité** (stub local, artefact de production, CPU ×4) : premier écran ~1 s, LCP 3,9 s en 4G lent / 12,6 s en
  3G lent, CLS 0,32 au démarrage visiteur, 0 fuite mémoire (plateau 16,6 Mo), 0 tâche longue sur 200 publications.

## Ce qui N'A PAS pu être vérifié d'ici (limites de l'environnement, pas du produit)

- **Rien en production depuis le shell** : Supabase REST/Edge et Netlify injoignables (proxy), base en lecture
  seule, `SET ROLE` refusé au rôle de lecture → l'isolation sous rôle réel n'est prouvée que par la CI (suites `prod`)
  et par l'analyse des prédicats ; les Edge Functions sont vérifiées par lecture + fumée CI, jamais exécutées ici.
- **Aucun banc de charge** : interdit en production et staging injoignable. Les capacités citées sont celles des
  bancs du 15 et 20–21/09 (staging, 100 comptes), **partiellement périmées** ; rien n'est mesuré au-delà de 100
  comptes simultanés. Le protocole à rejouer, avec ses seuils d'arrêt (désormais codés dans `charge.mjs`), est dans
  `rapports/F-performance-charge.md`.
- WebKit/iPhone, Core Web Vitals réels et appareils réels : non mesurés ici (CI WebKit verte sur le socle).

## Ce qu'il te reste à faire (dans l'ordre)

1. **Contre-revoir la PR #681** (`gh pr review 681 --comment --body-file …` avec le marqueur attendu) : elle porte
   deux migrations prêtes et le correctif `repair.js` — périmètre critique, c'est toi le seul contrôle humain.
2. **Appliquer `migrations/migration_promotion_attente_2026-11-02.sql`** (`npm run migration:appliquer`) : le
   client déployé sait vivre avec ou sans elle ; sans elle, la liste d'attente reste une impasse (honnête, 0 ligne).
   Puis `migration_audit_2026-11-02_oracles_et_privileges.sql` (conv_reads, privilèges) — lire d'abord le point 10b
   de la revue (`rapports/REVUE-INDEPENDANTE.md`) : `supaMarkRead` devra réparer l'appartenance sur 42501.
3. Décider les **quatre décisions produit** listées dans `05-RISQUES-RESIDUELS.md` (liste nominative des
   participants lisible par tout connecté C-04, dépôt public avec dossier investisseur C-14, index inutiles F-05,
   fusion des policies realtime F-07).
4. **Rejouer un banc de charge sur staging** avec le protocole F (paliers 25/50/100/200, seuils d'arrêt codés).

Rien n'a été appliqué en production, aucune donnée réelle touchée, aucun vrai utilisateur contacté.
