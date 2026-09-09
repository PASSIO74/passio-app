# CONTEXTE PARTAGÉ — BILAN PASSIO 09/26 (à lire en premier par chaque sous-agent)

## Cadre figé
- Dépôt : /home/user/passio-app (PASSIO74/passio-app). Branche de travail : `audit/bilan-passio-09-26-fable51`, créée sur le SHA audité.
- **SHA audité** : c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf (= origin/main, 2026-09-04 12:07 +0200, PR #278). Ne JAMAIS auditer un autre état.
- CI sur ce SHA : run « CI & Deploy » 2494 (id 33861671142), 13 jobs verts, dont « Déploiement production » (Netlify, terminé 10:44 UTC). SHA de production = c8cb8e99 (par le job vert ; la vérification directe de https://passio-app.netlify.app est BLOQUÉE par le proxy réseau de l'environnement : tout accès HTTP sortant vers netlify.app renvoie 403 — ne pas réessayer, le noter comme BLOQUÉ).
- Date : 2026-09-04. Modèle : Claude Fable 5.1.
- Issue GitHub : #279 « [AUDIT] BILAN PASSIO 09/26 ».
- Dossier des rapports (écrit par l'orchestrateur, pas par toi) : `.passio/audits/BILAN_PASSIO_09-26/`.

## Règles ABSOLUES (audit uniquement)
1. NE MODIFIE AUCUN fichier suivi par git du dépôt (index.html, js/, styles.css, tests/, scripts/, dashboard/, migrations/, docs/, .passio/, .claude/…). Tu es en LECTURE SEULE sur le dépôt. `git status` doit rester propre à la fin de ton travail (node_modules, dist/, test-results/, playwright-report/ sont ignorés par git et tolérés).
2. Aucune écriture en base Supabase de production, aucune création de compte, aucune suppression, aucune migration. Le connecteur `supabase-passio-readonly` (outils `mcp__supabase-passio-readonly__execute_sql`, `list_tables`, `get_advisors`, …) est en lecture seule ; les requêtes SELECT / EXPLAIN (sans ANALYZE sur écriture) y sont autorisées. Un `SET LOCAL ROLE …` et son SELECT doivent être dans le MÊME appel `execute_sql`.
3. Aucun test de charge contre la production (ni Supabase prod, ni Netlify). Les mesures de performance se font sur le serveur local (http-server) et sur des calculs / lectures de plans.
4. Ne révèle aucun secret (clés, jetons, mots de passe), aucune adresse e-mail réelle, aucun contenu privé d'utilisateur (messages, photos). Si tu en rencontres, cite l'emplacement (fichier:ligne) sans recopier la valeur.
5. Ne corrige rien. Tu rapportes.
6. Fichiers de preuve (captures, JSON, sorties brutes) : uniquement dans `/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/preuves/<ton-domaine>/`. Garde-les petits (captures ≤ 300 Ko, pas de vidéo).
7. Playwright : Chromium seul est installé (/opt/pw-browsers ; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1, ne lance jamais `playwright install`). WebKit/Firefox/Safari/Samsung Internet = NON RÉALISÉ (le dire). Toute mesure navigateur est donc une ÉMULATION Chromium — jamais un appareil réel. Utilise un port dédié : `PASSIO_PORT=<port qui t'est attribué>`. Lance des suites CIBLÉES (`npx playwright test --project=local tests/e2e/x.spec.js --workers=2`), jamais la suite complète (l'orchestrateur la lance une seule fois à la fin). Les suites du projet `prod` (authz-critical, blocage-acces, user-state-horodatage, multi-comptes, confidentialite, qa-campaign, suppression-compte) exigent des comptes réels et `SUPABASE_SERVICE_ROLE_KEY` : NE LES LANCE PAS, note-les BLOQUÉ (et cite le run CI 33861671142 où le job « Suites production (comptes réels) » est vert).
8. Lis d'abord CLAUDE.md et AGENTS.md à la racine, puis les documents de ton domaine. Vérifie CHAQUE affirmation des anciens rapports (PASSIO_PRODUCTION_READINESS.md du 2026-08-16, PASSIO_FUNCTIONAL_MAP.md, PASSIO_CONTROL_CENTER_AUDIT.md, PASSIO_SENTINELLE_JOINT_AUDIT.md, docs/CHECKLIST_COMMERCIALISATION.md, .passio/context/KNOWN_RISKS.md) contre le code ACTUEL : une affirmation ancienne n'est jamais une preuve.

## Faits déjà établis par l'orchestrateur (réutilisables, à ne pas re-mesurer sauf pour contredire)
- `npm run verif` (8 gates statiques + référentiel des passions) : VERT en local sur le SHA audité (1,2 s).
- Supabase prod : PostgreSQL 17.6 ; 39 tables public, toutes `rls_enabled=true` ; 128 policies public ; 105 index ; 25 tables dans la publication realtime (dont telemetry_events, profiles, posts…) ; extensions : pg_cron, pg_trgm (dans public), pgcrypto, uuid-ossp, supabase_vault, pg_stat_statements ; 1 job cron `purge_client_errors` 03:00 ; migrations enregistrées côté Supabase : 4 seulement (20260809 ×3, 20260824) contre 64 fichiers dans migrations/ (divergence connue R3).
- Storage : DEUX buckets `attachments` et `content`, tous deux `public=true`, limite 50 Mo, aucun filtre MIME ; 70 objets, 171 Mo (attachments 12 obj / 10 Mo ; content 58 obj / 153 Mo).
- Volumes : 5 comptes auth (5 confirmés, 4 connectés < 30 j, 2 < 7 j) ; profiles 5, posts 32, conv_messages 68, conversations 117, notifications 188, telemetry_events 111 828 (54 Mo), user_state 84 (10 Mo), analytics_events 3 855, passions 1 908, passion_relations 3 830, reports 2, blocks 0, user_safety 2, push_subscriptions 5. Base 92 Mo.
- Advisors sécurité (WARN uniquement, aucune ERROR) : search_path mutable ×3 (storage_chemin_autorise, unaccent_immutable, rechercher_passions) ; pg_trgm en public ; SECURITY DEFINER exécutables par anon ×4 (can_edit_post, comment_target_visible, is_conv_member, post_is_visible) et par authenticated ×9 ; protection contre les mots de passe compromis DÉSACTIVÉE.
- Advisors performance : auth_rls_initplan ×78 (policies ré-évaluant auth.uid() par ligne, dont realtime.messages), multiple_permissive_policies ×30 (conv_members DELETE, events/profiles/follows SELECT, follows DELETE), unused_index ×20, unindexed_foreign_keys ×3 (passion_relations.target_passion_id, passion_requests.resolved_passion_id, user_passions.passion_id), Auth server limité à 10 connexions absolues.
- Fonctions public : 16 fonctions maison (dont 13 SECURITY DEFINER) + pg_trgm. Triggers : rate_limit sur comment_interactions/event_reactions/reports, freeze author sur posts, identité d'affichage propagée, horodatage serveur user_state, majorité non avançable user_safety, broadcast conv_messages.
- Rollback : workflow `rollback.yml` (workflow_dispatch, revert isolé → branche + PR brouillon, aucune fusion ni déploiement automatique). Déploiement : `deploy.yml` (push main → 13 jobs → netlify-cli deploy --prod --dir dist).
- Dépôt : 30 fichiers js/ (55 011 lignes, app-02 6 914, app-07 6 669, app-08 6 147), styles.css 11 677 lignes CRLF, index.html 1 736 lignes, sw.js 220 lignes, 131 specs e2e, 49 scripts, dashboard/ (Express + SPA, 54 modules serveur, 56 fichiers de test), 3 Edge Functions (ask-ai, notify-call, delete-account), 6 workflows GitHub.

## Vocabulaire de statut (obligatoire, un par contrôle)
PROUVÉ (test exécuté / requête / mesure reproductible, citée) · CONFORME PAR INSPECTION (lu dans le code, non exécuté) · PROBABLE (indices concordants sans preuve) · DÉFAILLANT (défaut constaté avec preuve) · BLOQUÉ (impossible ici, dire pourquoi et ce qu'il faudrait) · NON APPLICABLE.
Méthode (obligatoire) : « appareil réel » (jamais ici) · « émulation » · « inspection code » · « requête base » · « test exécuté » · « non réalisé ».

## Priorités
P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future.

## Format d'un problème (TOUS les champs, sans exception)
identifiant (préfixe de domaine, ex. SEC-01) · priorité · fonctionnalité · résultat attendu · résultat observé · reproduction (étapes ou requête) · preuve (fichier:ligne, sortie, capture) · impact utilisateur et commercial · visibilité dans le Centre de pilotage (oui/non/partiel + où) · détection par la Sentinelle (oui/non + comment) · proposition de correction · risque de régression · effort estimé (heures ou jours).

## Interdits de forme
Pas de « ça a l'air bon ». Aucune capacité annoncée sans mesure : écrire « capacité non prouvée ». Un test exécuté cite sa commande et son résultat. Une inspection cite fichier:ligne.

## Mise à jour 14:50 UTC (reprise après interruption de session)
- Playwright : le Chromium 1223 attendu par @playwright/test 1.60 est désormais présent (/opt/pw-browsers/chromium-1223, pont posé au redémarrage) : `npx playwright test` fonctionne SANS wrapper de config. Ne lance jamais `playwright install`.
- **INTERDICTION D'OUTIL (sauf mention contraire dans ta consigne)** : n'utilise PAS le connecteur Supabase (mcp__supabase-passio-readonly__*) ni ToolSearch pour le charger — chaque appel déclenche une invite d'autorisation chez Benjamin. Appuie-toi sur les preuves déjà déposées par le domaine supabase-isolation dans preuves/supabase-isolation/ (policies.json = dump complet des 125 policies avec qual/with_check ; fonctions_realtime_storage_staging.md = prosrc des fonctions maison, triggers, publication realtime, buckets, staging ; isolation_par_table.md ; ref_cols.txt = colonnes réelles des tables ; schema_reference_vs_prod.txt) et par pilotage-sentinelle (preuves/pilotage-sentinelle/requetes-supabase-lecture-seule.txt). Si une requête SQL est indispensable, écris-la textuellement dans `notes` (section « Requêtes à exécuter par l'orchestrateur ») et rends le contrôle BLOQUÉ : l'orchestrateur l'exécutera lui-même.
- Résultats déjà rendus par 7 domaines (à ne pas refaire, à réutiliser si utile) : resultats/*.json (carto, ux-onboarding, contenu, messagerie-notifs, supabase-isolation, code-nettoyage, pilotage-sentinelle).
