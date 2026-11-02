# Brief commun — audit PASSIO 2026-11-02 (agents spécialisés)

Dépôt cloné : `/home/claude/passio-app` (branche `main`, HEAD 6ea94e1, 2026-11-02 13:25 UTC, CI verte).
Lire d'abord `/home/claude/passio-app/CLAUDE.md` (règles du dépôt) puis la fiche `docs/journal/<domaine>.md` de ton périmètre.

## Les trois systèmes
- **Passio** : PWA vanilla JS (index.html + js/app-01..09 + ~30 modules) + Supabase (projet njkiyoklssvefstljemx, ~50 tables sous RLS, Edge Functions dans `supabase/functions/`), servie par Netlify (https://passio-app.netlify.app) via `.github/workflows/deploy.yml`. Edge Functions Netlify : `netlify/edge-functions/` (aperçus de partage, médias).
- **Sentinelle** : (a) chaîne GitHub `sentinelle-autonome.yml` (cron) → `scripts/sentinelle-detecter.mjs` lit `client_errors` → issue `[SENTINELLE]` → `claude-code.yml` écrit un correctif, PR, auto-fusion ; (b) `veille-production.yml` → issue `[VEILLE]` ; (c) `digest.yml` ; (d) Sentinelle LOCALE du dashboard (`dashboard/server/sentinel*.js`, lecture seule, PC de Benjamin). Doc : `docs/journal/telemetrie-pilotage-sentinelle.md`, `docs/SENTINELLE_AUTONOME.md`, `docs/VEILLE_PRODUCTION.md`.
- **Centre de pilotage** : (a) `/pilotage/` (page `pilotage/` + Edge Function `supabase/functions/pilotage` + logique pure `supabase/functions/_shared/pilotage.js`, porte = compte de l'éditeur) ; (b) atelier local `dashboard/` (Express + SPA, télémétrie, Sentinelle locale, réparations). Doc : `docs/CENTRE_DE_PILOTAGE.md`, `dashboard/README.md`, `dashboard/docs/SECURITE.md`.

## Ce que l'environnement permet (et pas)
- Réseau depuis le shell : GitHub (`gh` configuré, lecture OK) et registres npm/pip SEULEMENT. **Supabase REST/Edge, Netlify, CDN : INJOIGNABLES depuis le shell** (403 du proxy). Donc : pas de `test:prod`, pas de banc de charge, pas d'appel d'Edge Function depuis ici.
- **Base de production : LECTURE SEULE via l'outil MCP `mcp__supabase-passio-readonly__execute_sql`** (transaction read-only). Pour évaluer une RLS sous rôle : `SET LOCAL role authenticated; SELECT set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true); SELECT …` **dans le MÊME appel** (sinon le rôle retombe au défaut sans erreur = faux vert). Si l'outil n'est pas dans ta liste, écris les requêtes dans `requetes-a-executer.sql` de ton dossier et dis-le : le coordinateur les exécutera.
- PostgreSQL 16 local disponible (`/usr/lib/postgresql/16/bin`) : les bancs `tests/sql/*.test.sh` tournent ici sur une base jetable (socle `tests/sql/socle-prod.sql`).
- Navigateur : `PASSIO_CHROMIUM=/usr/bin/google-chrome` obligatoire pour Playwright (téléchargement bloqué). **2 CPU seulement** : jamais la suite complète (une référence complète tourne déjà en arrière-plan sur le port 8080 — ne pas la perturber) ; cibler des specs, `--workers=1`, et **un port à toi** (`PASSIO_PORT=<ton port>`), ex. `PASSIO_CHROMIUM=/usr/bin/google-chrome PASSIO_PORT=8103 npx playwright test --project=local --workers=1 tests/e2e/x.spec.js`.
- Node 22, `npm ci` déjà fait (racine et `dashboard/`). `npm run verif` = 11 s, vert au départ.

## Règles non négociables
1. Aucune écriture en production (la connexion est read-only ; ne tente pas de la contourner). Aucun vrai utilisateur contacté. Aucune donnée personnelle (e-mail, nom, uid réel, contenu de message) dans tes livrables : comptes et agrégats seulement ; les comptes de test sont `%@passio-e2e.test`.
2. Ne reproduis jamais un secret (clé service_role, PAT, mot de passe) même tronqué.
3. Git : pas de commit, pas de push, pas de `git add -A/.`, `git stash`, `git reset --hard`, `git checkout -- .`. Tu modifies UNIQUEMENT les fichiers de ton périmètre (listé dans ta mission) ; tout le reste = proposition en diff dans ton rapport. `styles.css` est en CRLF (n'écrire qu'en binaire/ajout).
4. Un test rouge ne se « répare » pas en le désactivant. Un correctif = cause + patch ciblé + test qui détecte la régression + retest du scénario + voisins (`npm run verif` doit rester vert).
5. Preuve ou rien : chaque constat porte la commande/requête exécutée et sa sortie (extrait). Statuts autorisés : vérifié / corrigé et retesté / partiellement vérifié / non vérifié / bloqué. « Non testé » ne devient jamais « validé ». Distingue défaut du produit et limite de l'environnement.
6. Un avertissement de linter n'est pas un défaut en soi : vérifie le corps de la fonction/policy avant de conclure.

## Livrable attendu (fichier `/tmp/claude-0/-home-claude/8b869e5f-a0ce-5ebd-84c5-c10fb0d9acb3/scratchpad/audit/<lettre>-<nom>.md`)
1. Rôle réel de ce que tu as audité (sans inventer de responsabilité).
2. Matrice de couverture de ton périmètre : fonctionnalité → écran/route/fichier → rôles → données/API → scénario → attendu → observé → preuve → statut.
3. Registre des anomalies : ID `<LETTRE>-NN`, gravité P0–P3 (P0 fuite/accès non autorisé/perte de données/indispo majeure ; P1 parcours essentiel cassé/incohérence métier grave ; P2 anomalie secondaire/fluidité/a11y significative ; P3 mineur), reproduction, impact, cause, correctif (appliqué ? fichiers ? test ?), résultat du retest.
4. Résultats techniques : commandes, tests réussis/échoués, mesures.
5. Ce qui reste non vérifié / bloqué et pourquoi, avec la prochaine action concrète.
Réponse finale à ton coordinateur : un résumé de 20 lignes max (anomalies par gravité, fichiers modifiés, tests ajoutés, blocages) — le détail reste dans le fichier.
