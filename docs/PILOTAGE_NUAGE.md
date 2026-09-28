# Pilotage dans le nuage — sans PC (2026-09-28)

**Adresse :** https://passio-app.netlify.app/pilotage/ — à installer sur l'écran d'accueil du téléphone.

## Ce qui tourne sans PC

| Pièce | Où | Rôle |
|---|---|---|
| Sentinelle autonome | GitHub Actions (`sentinelle-autonome.yml`, horaire) | lit `client_errors`, ouvre une enquête `[SENTINELLE]` |
| Correctif | GitHub Actions (`claude-code.yml`) | écrit le correctif, ouvre la PR, fusion auto si tout est vert |
| Veille, digest | GitHub Actions | ce que la Sentinelle ne voit pas (silences, 5xx, crons morts) |
| **Fonction `pilotage`** | Supabase Edge Function | lit la prod (service_role, côté serveur) + GitHub, rend un état résumé |
| **Page `/pilotage/`** | Netlify (HTTPS, installable) | l'écran du téléphone |

Le centre de pilotage du PC (`dashboard/`) reste utile pour le détail ; il n'est plus nécessaire pour surveiller.

## Ce que la page fait (lot 2, 2026-09-28)

| Onglet | Contenu | Gestes |
|---|---|---|
| Accueil | verdict, « le site répond depuis… », chiffres, ce qui t'attend, erreurs 7 j détaillées (appareils, pages, courbe) | Fermer une enquête · Confier à la Sentinelle |
| Machines | Sentinelle active/en pause, exécutions, PR en attente, relances | Pause/Reprendre · Fusionner · Refuser · Relancer |
| Utilisateurs | en ligne, inscriptions et erreurs par jour (7 j), signalements | Traité · Rejeter |
| Capacité | jauges : connexions (≈, plafond 500), e-mails 24 h (≈, 300), base (8 Go), stockage (100 Go) | — |
| Réglages | appareils qui reçoivent les alertes, état de la veille, installation | Déconnexion |

**Alertes sur le téléphone** : `pg_cron` appelle la fonction toutes les 5 min (`action: "veille"`,
migration `migration_pilotage_veille_2026-09-28.sql`). Elle sonne les appareils de l'éditeur où
PASSIO a les notifications activées, **seulement** sur un changement : passage au rouge, site
injoignable, retour à la normale, et un rappel toutes les 6 h si le rouge dure. L'orange ne sonne
jamais. Le tap ouvre `/pilotage/`. Logique : `decideAlerte` (`_shared/pilotage.js`).
Déclencheur de secours sans migration : `.github/workflows/pilotage-veille.yml` (toutes les 10 min, servi
quand GitHub a de la place) — les alertes marchent dès la fusion, pg_cron les rend ponctuelles.
L'état mémorisé vit dans `analytics_events` (`event = 'pilotage_etat'`, une ligne par changement).

⚠️ **Un texte d'erreur client n'est JAMAIS transmis à un agent** : « Confier à la Sentinelle »
relance le workflow, qui applique ses propres désamorçages (CLAUDE.md, défaut ⑤ du go/no-go).

## Accès

Réservé au compte de l'éditeur (`passioadmin@gmail.com`, `COMPTE_PILOTE`), adresse confirmée —
échec fermé (403 pour tout autre compte, 401 sans session). La page réutilise la session de PASSIO
sur le téléphone (même origine) : se connecter dans PASSIO avec ce compte suffit, ou « Se connecter
avec Google ». Ajouter un compte : secret `PILOTAGE_EMAILS` de la fonction (virgules).

## Gestes d'exploitation (une fois)

1. **Déploiement** : automatique à la fusion (`edge-functions.yml`, fonction ajoutée à la liste).
   Puis **coller `migrations/migration_pilotage_veille_2026-09-28.sql`** dans le SQL Editor
   (canal ③ d'ADR-012) : elle installe `pg_net`, planifie la veille et crée `pilotage_mesures()`.
   Le tableau final doit dire `OK` ; vérifier ensuite l'état en base (`select jobname, schedule
   from cron.job`), jamais le seul tableau.
2. **Relances depuis le téléphone** (facultatif) : jeton GitHub fin (dépôt `passio-app`, droits
   *Actions: write* + *Issues: read*), posé en secret de fonction :
   `supabase secrets set PILOTAGE_GITHUB_TOKEN=… --project-ref njkiyoklssvefstljemx`.
   Sans lui, tout s'affiche et les alertes marchent ; seuls les gestes GitHub (relancer, fusionner, fermer, pause) sont remplacés par une explication. Les signalements, eux, se traitent sans ce jeton.
3. **Google** : ajouter `https://passio-app.netlify.app/pilotage/` aux *Redirect URLs* (Supabase →
   Authentication → URL Configuration). Sans ça, Google ramène sur l'accueil de PASSIO : rouvrir
   `/pilotage/`, la session est partagée.

## Garde-fous

- Écritures possibles, toutes confirmées à l'écran : relancer 3 workflows en liste blanche, fusionner/fermer une PR ou une issue par son numéro, poser/retirer la pause Sentinelle, passer un signalement à `handled`/`dismissed`. Une fusion reste soumise à la protection de `main` (CI verte, contre-revue).
- Aucun corps d'issue ni auteur ne quitte la fonction (`resumerIssue`) ; liens limités à github.com.
- Plafond 30/min, 600/h (`plafond.js`).
- Rendu par nœuds + `textContent` ; titre hostile éprouvé au navigateur.

Verrous : `tests/unit/pilotage.test.mjs` (10, dans `npm run verif` et avant déploiement),
`tests/e2e/pilotage-nuage.spec.js` (7, éprouvé par réinjection : `innerHTML` → rouge, confirmation retirée → rouge),
`tests/sql/migration-pilotage-veille.test.sh` (11, dont le mutant sans `revoke … from anon` qui doit lever).
