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

L'atelier technique du PC (`dashboard/`) reste utile pour le détail ; il n'est plus nécessaire pour surveiller.

## Ce que la page fait (refaite le 2026-11-04)

| Où | Contenu | Gestes |
|---|---|---|
| Accueil, en haut | le voyant, une ligne par problème (ce qui est cassé, ce que le bouton va faire), ce que les machines font déjà | **Régler** (un par problème) · **Tout régler** · une décision de signalement · le reste en dépliant la ligne |
| Accueil, dessous | le nombre d'utilisateurs, sa marche depuis le premier compte, l'évolution de la semaine, qui est là, les derniers arrivés | Toucher le nombre : tous les utilisateurs, par leur nom |
| D'où viennent les gens | sources, bouche-à-oreille, actifs par jour, rétention, utilisateurs mois par mois | — |
| Tout le détail technique | pour info (chantiers, résumés), chiffres clés, site, erreurs 7 j, activation, machines, jauges de capacité, coût, historique du voyant | Pause/Reprendre · Relancer · Fusionner ou refuser un chantier |
| Réglages | protection automatique, retour arrière, appareils qui reçoivent les alertes, installation | Délestage · Coupures · Message à tous · Déconnexion |

**Depuis le 2026-11-06** (`docs/AUTONOMIE_EXPLOITATION.md`) : « Tout le détail technique » commence par les **parcours critiques** (contrats d'action jugés sur le verdict de la base, avec leur dénominateur ; gris = trop peu pour conclure) et la **couverture** (ce qui n'est pas instrumenté est listé). « Machines » montre la **veille du pilotage** (son battement : ce qu'elle a lu et décidé) et la **politique d'automatisation** (ce que les machines font seules, ce qu'elles ne feront jamais). Un parcours critique en panne et une veille arrêtée ont chacun leur ligne « À faire ».

**Tout geste part d'un seul toucher et s'annule pendant 5 s** (`armer`, `pilotage/pilotage.js`) : plus aucune boîte de confirmation du navigateur.

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
   *Actions: write* + *Issues: write* + *Pull requests: write* + *Contents: write*), posé en secret de fonction.
   ⚠️ Avec *Issues: read* seul, GitHub laisse OUVRIR une issue, mais ignore les labels à la
   création et refuse d'étiqueter (`POST …/labels` en **403**, #653 le 2026-10-24) **et de
   commenter** (`POST …/comments` en **403**, #657 le 2026-10-25). C'est pourquoi « Réparer »
   confie l'issue **par son ouverture** : son corps commence par l'ordre fixe `@claude …`, que
   `claude-code.yml` accepte sur l'événement `opened` d'une issue de PASSIO74 — aucun droit
   d'écriture sur les issues n'est nécessaire, et AUCUN label n'est posé à la création (chaque
   `labeled` relancerait un agent). Une réparation se reconnaît à son titre `[RÉPARER]` et à son
   auteur, jamais à son label (`estReparationDuPilote`). Sans *Issues: write* restent bloqués :
   « Fermer », « Reprendre » la Sentinelle et « Relancer » une réparation d'avant le 2026-10-25.
   Le droit se donne sur le jeton existant (page du jeton → **Edit** → *Repository permissions*).
   `supabase secrets set PILOTAGE_GITHUB_TOKEN=… --project-ref njkiyoklssvefstljemx`.
   ⚠️ **Choisir une longue durée** : un jeton fin dure 30 jours par défaut. Expiré, GitHub répond 401 à tout, lectures comprises : plus aucun bouton ne répare et le voyant mémorisé se fige. L'écran le dit une semaine avant, puis en première ligne.
   Sans lui, tout s'affiche et les alertes marchent ; seuls les gestes GitHub (relancer, fusionner, fermer, pause) sont remplacés par une explication. Les signalements, eux, se traitent sans ce jeton.
3. **Google** : ajouter `https://passio-app.netlify.app/pilotage/` aux *Redirect URLs* (Supabase →
   Authentication → URL Configuration). Sans ça, Google ramène sur l'accueil de PASSIO : rouvrir
   `/pilotage/`, la session est partagée.

## Garde-fous

- Écritures possibles, chacune annulable 5 s à l'écran : relancer 3 workflows en liste blanche, fusionner/fermer une PR ou une issue par son numéro, poser/retirer la pause Sentinelle, passer un signalement à `handled`/`dismissed`. Une fusion reste soumise à la protection de `main` (CI verte, contre-revue).
- Aucun corps d'issue ni auteur ne quitte la fonction (`resumerIssue`) ; liens limités à github.com.
- Plafond 30/min, 600/h (`plafond.js`).
- Rendu par nœuds + `textContent` ; titre hostile éprouvé au navigateur.

Verrous : `tests/unit/pilotage.test.mjs` (dans `npm run verif` et avant déploiement),
`tests/e2e/pilotage-nuage.spec.js` (éprouvé par réinjection : `innerHTML` → rouge, annulation retirée → rouge),
`tests/sql/migration-pilotage-veille.test.sh` (11, dont le mutant sans `revoke … from anon` qui doit lever).
