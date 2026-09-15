# Manipulations à faire — 2026-09-15 (mis à jour à 10 h 45)

> Tout ce qui suit est **ce que je ne peux pas faire à ta place**. Le reste est fait, fusionné ou en attente de ta seule revue. Chaque geste dit ce qu'il débloque. Les SHA sont ceux de la tête au moment de l'écriture ; si une PR doit être rebasée, je te redonne son SHA.

> **État à 13 h (15/09) — TOUT EST FAIT.** A) droit `workflow` obtenu à 09:07 UTC (device-code validé) ; B) contre-revues #410, #416, #423 posées sur les bons SHA, les trois fusionnées, migrations appliquées en production et mesurées ; C) widget Turnstile créé par Claude Code après connexion de Benjamin à Cloudflare (#433 porte la sitekey ; interrupteur serveur après déploiement) ; D) UptimeRobot : création de compte = geste que Claude Code ne fait pas — remplacé par une sonde sans compte (à venir, PIL-10/EXP-06). Plus aucun geste en attente.

## A. Le droit `workflow` du jeton GitHub (30 secondes, durable) — **le plus urgent**

Mon `gh` (compte PASSIO74) n'a que les droits `repo, read:org, gist`. GitHub **refuse toute fusion d'une PR qui crée ou modifie un fichier de `.github/workflows/`** sans le droit `workflow` — c'est ce qui bloque #407 (revue faite, CI verte) et bloquera #416.

1. Ouvre https://github.com/login/device
2. Tape le code que je t'ai donné dans la conversation (il expire en 15 min ; je t'en redonne un à la demande — la commande côté poste est `gh auth refresh -h github.com -s workflow,repo,read:org,gist`).
3. Autorise.

À défaut : fusionne #407 toi-même d'un clic (https://github.com/PASSIO74/passio-app/pull/407, « Squash and merge ») — elle est verte et revue.

## B. Les contre-revues (~5 min chacune)

Le geste : ouvrir le lien **Files changed**, relire, puis **Review changes → Comment** (ou Approve) avec, dans le corps, exactement la phrase `Contre-revue technique indépendante`. Ma veille relance la gouvernance et fusionne dès que ta revue est posée sur le SHA de tête.

| PR | Quoi | SHA de tête | Ce que ça débloque |
|---|---|---|---|
| [#410](https://github.com/PASSIO74/passio-app/pull/410/files) | PERF-01 — outil de charge + recherche 15 → 149 req/s. **Revue à refaire** : un seul commit de plus depuis la tienne, `ANALYZE` avant l'`EXPLAIN` du banc (le rouge de CI d'Astra, cause démontrée) — la migration n'a pas changé d'un octet | `ca78f8bf` | j'applique la migration en prod et je re-mesure |
| [#416](https://github.com/PASSIO74/passio-app/pull/416/files) | deux lignes de `.github` : les quatre suites cross-compte tournent sur le staging en CI (TCI-01 9/9) ; le texte de l'issue [SENTINELLE] aligné sur la garde ASTRA-05 | `1db31dae` | TCI-01 fermé (Astra : PARTIEL tant que ce n'est pas en CI) ; nécessite le point A |
| [#423](https://github.com/PASSIO74/passio-app/pull/423/files) | MOD-04 — bloquer ferme l'accès au contenu privé **côté serveur** (une aide `abonne_accepte_non_bloque`, trois usages). Prouvé sur le staging : abonné accepté puis bloqué → 0 ligne | `f0ca5571` | j'applique la migration en prod |

**Faites ce matin, merci** : #395, #396, #403 (re-revue), #404 (fusionnée par toi), #407 (revue, bloquée par A), #409, #417 (ASTRA-11 — migration appliquée en prod à 08:18, fonction v7 déployée par la CI à 08:24, **vérifié en production** à 08:34 : le fichier de B intact, ceux de A partis).

## C. Le widget Turnstile (MOD-07 / SEC-06) — 5 min, un compte Cloudflare

Le seul défaut **P1 ouvert** que je ne peux pas fermer seul : le client captcha est déployé mais **inactif** (sitekey vide), et sans captcha un script vide le quota d'e-mails (150/h) et rend l'inscription indisponible. Astra le reclasse OUVERT.

1. https://dash.cloudflare.com → **Turnstile** → **Add widget** ; nom `PASSIO`, hostname `passio-app.netlify.app`, mode **Managed**.
2. Copie la **Site Key** et la **Secret Key** et colle-les-moi ici (le secret ne va nulle part d'autre : je le pose dans la configuration Supabase par l'API de gestion, jamais dans le dépôt).

Ensuite je fais tout : sitekey dans app-08 et déployée **d'abord**, puis `security_captcha_enabled` — dans cet ordre, sinon 100 % des inscriptions cassent (CLAUDE.md « captcha »).

## D. Une supervision extérieure (EXP-06) — 3 min, un compte UptimeRobot (gratuit)

1. https://uptimerobot.com → **Add New Monitor** : HTTP(s), URL `https://passio-app.netlify.app/release.json`, intervalle 5 min, alerte par e-mail à `passioadmin@gmail.com`.
2. Optionnel, un second : `https://njkiyoklssvefstljemx.supabase.co/rest/v1/` (répond 401 sans clé — le simple ping HTTP suffit).

Astra rappelle que sonder `release.json` ne prouve pas la santé du service entier : c'est un premier signal, pas une couverture.

## E. À lire, pas à faire

- **Le staging est réactivé** (`fcksxofaelcdmmifnwjo`) : un second projet sur le plan Pro, donc un coût de calcul (Micro, ~10 $/mois). Vide de données personnelles (référentiels + comptes jetables purgés par la CI). La CI en a besoin depuis #409. Mon conseil : le garder.
- **Ton brouillon local** `scripts/schema-origine.js` / `migrations/00_ORIGINE_PROD.sql` : je ne l'ai pas touché ; il décrit l'état du 17/08 (35 tables) et passe par `supabase db query`, retiré. `scripts/schema-executable.js` (fusionné, #401) lit la prod vivante — à réconcilier quand tu reprendras NET-07.
- **GitHub → Settings → Notifications** : vérifie que les e-mails d'issues arrivent bien sur une adresse que tu lis — c'est le canal de la sentinelle (PIL-01).
- **Le secret `SUPABASE_ACCESS_TOKEN`** (mon jeton personnel de la CLI) est posé dans les secrets du dépôt : c'est ce qui permet à `edge-functions.yml` de déployer. Il expire comme tout jeton personnel ; le jour où le workflow rougit sur « jeton », c'est lui.

## F. Ce que je fais dès que les revues tombent (sans toi)

Relance de la gouvernance, fusion, puis : migrations #410 et #423 appliquées en production (verdict mesuré en base), latence de `rpc/rechercher_passions` mesurée en production avant/après, registre mis à jour fiche par fiche. La liste de fiche 21 (plan d'Astra) continue dans l'ordre : ASTRA-14, ASTRA-15, ASTRA-20 + charge authentifiée, puis les OUVERT (UXO-02, PERF-02/06, PIL-10, MOD-07 dès que le widget est là).
