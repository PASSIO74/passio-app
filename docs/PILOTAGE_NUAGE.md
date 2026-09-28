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

## Accès

Réservé au compte de l'éditeur (`passioadmin@gmail.com`, `COMPTE_PILOTE`), adresse confirmée —
échec fermé (403 pour tout autre compte, 401 sans session). La page réutilise la session de PASSIO
sur le téléphone (même origine) : se connecter dans PASSIO avec ce compte suffit, ou « Se connecter
avec Google ». Ajouter un compte : secret `PILOTAGE_EMAILS` de la fonction (virgules).

## Gestes d'exploitation (une fois)

1. **Déploiement** : automatique à la fusion (`edge-functions.yml`, fonction ajoutée à la liste).
2. **Relances depuis le téléphone** (facultatif) : jeton GitHub fin (dépôt `passio-app`, droits
   *Actions: write* + *Issues: read*), posé en secret de fonction :
   `supabase secrets set PILOTAGE_GITHUB_TOKEN=… --project-ref njkiyoklssvefstljemx`.
   Sans lui, tout s'affiche, seul le bouton « Lancer maintenant » est remplacé par une explication.
3. **Google** : ajouter `https://passio-app.netlify.app/pilotage/` aux *Redirect URLs* (Supabase →
   Authentication → URL Configuration). Sans ça, Google ramène sur l'accueil de PASSIO : rouvrir
   `/pilotage/`, la session est partagée.

## Garde-fous

- Seule écriture : `workflow_dispatch` de trois workflows en liste blanche (`RELANCES`).
- Aucun corps d'issue ni auteur ne quitte la fonction (`resumerIssue`) ; liens limités à github.com.
- Plafond 30/min, 600/h (`plafond.js`).
- Rendu par nœuds + `textContent` ; titre hostile éprouvé au navigateur.

Verrous : `tests/unit/pilotage.test.mjs` (6, dans `npm run verif` et avant déploiement),
`tests/e2e/pilotage-nuage.spec.js` (4, éprouvé par réinjection `innerHTML` → rouge).
