# Manipulations à faire — matin du 2026-09-15

> Tout ce qui suit est **ce que je ne peux pas faire à ta place**. Le reste est fait, fusionné ou en attente de ta seule revue. Chaque geste dit ce qu'il débloque. Les SHA sont **finaux** : aucune de ces PR ne touche le registre, aucune ne sera rebasée — ta revue reste valable.

## A. Les contre-revues (7 PR, ~5 min chacune)

Le geste, pour chaque PR : ouvrir le lien **Files changed**, relire, puis **Review changes → Comment** (ou Approve) avec, dans le corps, exactement la phrase `Contre-revue technique indépendante`. La veille relance la gouvernance et fusionne toute seule. **Elles sont indépendantes** : aucun ordre à respecter.

| PR | Quoi | SHA de tête | Ce que ça débloque |
|---|---|---|---|
| [#395](https://github.com/PASSIO74/passio-app/pull/395/files) | IRL-12 — pointage par code secret servi par la base (migration **déjà appliquée** en prod) | `8e42a22e` | le client du pointage part en production |
| [#396](https://github.com/PASSIO74/passio-app/pull/396/files) | Modération lot 1 — retrait de contenu sans SQL, journal, story signalable, accusé de réception (migration **déjà appliquée**) | `298cafb5` | chantier 5, lot 1 |
| [#403](https://github.com/PASSIO74/passio-app/pull/403/files) | PERF-03 — `auth.uid()` calculé une fois (69 policies), doublons fusionnés (migrations **déjà appliquées et mesurées** : 71 → 2, 24 → 0) | `b245c58d` | le générateur et le verrou entrent au dépôt |
| [#404](https://github.com/PASSIO74/passio-app/pull/404/files) | EXP-04 / TCI-16 — Edge Functions déployées par la CI avec test de fumée ; canari toutes les 4 h | `ce116369` | déploiement contrôlé des EF ; après fusion je lance `edge-functions.yml` une fois |
| [#407](https://github.com/PASSIO74/passio-app/pull/407/files) | ASTRA-04 / ASTRA-05 / PIL-02 — plafond de création sérialisé (migration sur staging, **pas encore en prod**), périmètre de la sentinelle imposé, pilotage sans identifiants par défaut | `f56f0744` | après fusion j'applique la migration en prod |
| [#409](https://github.com/PASSIO74/passio-app/pull/409/files) | SUP-04 / TCI-04 / TCI-16 — la CI et le canari **tournent sur le staging** ; la prod ne garde que `authz-critical` au déploiement | `da9918f2` | plus une écriture de test en production |
| [#410](https://github.com/PASSIO74/passio-app/pull/410/files) | PERF-01 — outil de charge + recherche de passions 15 → 149 req/s (migration sur staging, **pas encore en prod**) | `8bfb02c5` | après fusion j'applique la migration en prod et je re-mesure |

⚠️ #404 et #409 touchent toutes deux `sentinelle-distante.yml` (blocs différents). Si la seconde à fusionner conflicte, je la rebase et je te redonne son SHA — c'est le seul cas où une revue pourrait être à refaire.

## B. Le widget Turnstile (MOD-07 / SEC-06) — 5 min, un compte Cloudflare

C'est le seul défaut **P1 ouvert** que je ne peux pas fermer seul : le client captcha est déployé mais **inactif** (sitekey vide), et sans captcha un script vide le quota d'e-mails (150/h) et rend l'inscription indisponible.

1. https://dash.cloudflare.com → **Turnstile** → **Add widget** ; nom `PASSIO`, hostname `passio-app.netlify.app`, mode **Managed**.
2. Copie la **Site Key** et la **Secret Key** et colle-les-moi ici (le secret ne va nulle part d'autre : je le pose dans la configuration Supabase par l'API de gestion, jamais dans le dépôt).

Ensuite je fais tout : sitekey dans app-08 et déployée **d'abord**, puis `security_captcha_enabled` — dans cet ordre, sinon 100 % des inscriptions cassent (CLAUDE.md « captcha »).

## C. Une supervision extérieure (EXP-06) — 3 min, un compte UptimeRobot (gratuit)

1. https://uptimerobot.com → **Add New Monitor** : HTTP(s), URL `https://passio-app.netlify.app/release.json`, intervalle 5 min, alerte par e-mail à `passioadmin@gmail.com`.
2. Optionnel, un second : `https://njkiyoklssvefstljemx.supabase.co/rest/v1/` (répond 401 sans clé — choisir « keyword » absent de `error` si tu veux un vrai test, sinon le simple ping HTTP suffit).

Sans ça, la supervision externe reste GitHub Actions toutes les 4 h (et GitHub abandonne ~60 % des créneaux).

## D. À lire, pas à faire

- **Le staging est réactivé** (`fcksxofaelcdmmifnwjo`) : un second projet sur le plan Pro, donc un coût de calcul (Micro, ~10 $/mois). Il est **vide de données personnelles** (référentiels + comptes jetables). Si tu veux l'arrêter : `POST /v1/projects/fcksxofaelcdmmifnwjo/pause` — mais #409 en a besoin pour que la CI n'écrive plus en production. Mon conseil : le garder.
- **Ton brouillon local** `scripts/schema-origine.js` / `migrations/00_ORIGINE_PROD.sql` : je ne l'ai pas touché ; il décrit l'état du 17/08 (35 tables) et passe par `supabase db query`. `scripts/schema-executable.js` (fusionné, #401) lit la prod vivante et a servi à reconstruire le staging à l'identique — à réconcilier quand tu reprendras NET-07.
- **GitHub → Settings → Notifications** : vérifie que les e-mails d'issues arrivent bien sur une adresse que tu lis — c'est le canal de la sentinelle (PIL-01).

## E. Ce que je fais dès que les revues tombent (sans toi)

Relance de la gouvernance, fusion, puis : migrations #407 et #410 appliquées en production (verdict mesuré en base), `edge-functions.yml` lancé une fois, latence de `rpc/rechercher_passions` mesurée en production avant/après (la charge, elle, reste sur le staging). Puis le registre mis à jour, fiche par fiche.
