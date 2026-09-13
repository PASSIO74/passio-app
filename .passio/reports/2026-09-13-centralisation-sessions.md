# Centralisation des sessions parallèles — 2026-09-13

Document unique de reprise. Il remplace les 40 sessions Claude Code visibles sur
ce compte (30 actives ou au repos, 10 archivées) et les 235 branches distantes du
dépôt. **Aucun statut n'est déduit d'un résumé de session** : chaque ligne
ci-dessous est établie sur une PR, un run GitHub Actions, une requête en
production (canal ① d'ADR-012) ou une commande exécutée dans ce worktree.

Référence `main` à l'ouverture : `ca2daba` — « Captcha Turnstile à l'inscription »
(#368), run « CI & Deploy » n° 2681 **vert**, job « Déploiement production »
terminé à 06:10 UTC. C'est donc bien l'état servi aux utilisateurs.

---

## 1. Ce que la centralisation a trouvé

**Le dépôt était déjà presque entièrement centralisé.** Sur les 100 dernières PR
(#243 → #368), **deux seulement** ne sont pas fusionnées, et une seule porte du
code de produit :

| PR | Branche | État | Verdict |
|---|---|---|---|
| [#367](https://github.com/PASSIO74/passio-app/pull/367) | `claude/user-state-sans-compte` | ouverte, `mergeable_state: clean`, CI verte | **le seul travail de produit non livré** |
| [#281](https://github.com/PASSIO74/passio-app/pull/281) | `chore/cc-fable5-only` | **brouillon**, sans activité depuis le 2026-09-07 | infrastructure des canaux IA, pas du produit — décision de Benjamin |

Deux PR sont closes **sans** fusion, et ni l'une ni l'autre ne laisse un trou :

- **#354** (`account-creation-old-onboarding-ar7av1`) — remplacée par **#358**,
  fusionnée. Vérifié au contenu : `main:CLAUDE.md` porte bien « CETTE LISTE EST
  VIDE DEPUIS LE 2026-09-12 » et le paragraphe « Statut de la marque ».
- **#260** — remplacée par les suites de messagerie du 2026-09-03.

**Aucune branche récente n'est orpheline.** Les 50 branches touchées depuis le
2026-09-09 ont toutes eu leur PR — le mode d'échec du 2026-08-29 (« quatre
demandes codées, jamais de PR ») ne s'est pas reproduit.

⚠️ **Le piège de méthode de cette centralisation, à ne pas refaire.** Trois
mesures « évidentes » ont donné des verdicts FAUX avant d'être abandonnées :
`git rev-list --count main..branche` (une branche d'août affiche 2 200 commits
« non fusionnés » parce que `main` est en squash-merge) ; `git diff main...branche`
(diff depuis la base de fusion : il montre le travail de la branche même quand
`main` porte le même contenu) ; `git apply --reverse --check` (le contexte a
dérivé, tout ressort « non fusionné »). **La seule autorité est l'état de la PR
sur GitHub** (`is:closed is:unmerged`), croisé au contenu pour les cas douteux.

---

## 2. Ce qui a été fait dans cette session

1. **`main` + #367 fusionnés et éprouvés ici**, avant toute fusion distante :
   - les **11 gates statiques** de `npm run verif` — vertes, code de sortie 0
     (5 001 passions, 1 663 globals, 666 handlers, miroir `OUVERTURE` exact) ;
   - **78 cas e2e verts** sur l'état combiné : `user-state-invite` (5/5) puis
     `captcha-turnstile`, `changement-mdp-securise`, `mot-de-passe-minimum`,
     `reprise-lectures-boot`, `exploration-anonyme-vs-compte`,
     `connexion-compte-existant` (73/73). #367 et #368 touchent tous deux
     `app-02` : c'est cette combinaison-là qu'il fallait mesurer, pas #367 seule.
2. **La branche de #367 a été mise à jour depuis `main`** pour que sa CI mesure
   l'état fusionné, et non plus sa base d'origine (`d93f016`).
3. Fusion de #367 dès la CI verte → redéploiement de production.

⚠️ **Note d'environnement, pour la session suivante.** Dans ce conteneur,
`@playwright/test` s'installe en 1.56 et réclame `chromium-1223` ; le conteneur
fournit `chromium-1194`. Les suites échouent alors toutes avec « Executable
doesn't exist », ce qui **ressemble à un dépôt cassé**. Remède sans installer
quoi que ce soit : une config de session qui étend `playwright.config.js` et pose
`launchOptions.executablePath` sur
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Elle doit vivre **à la
racine du dépôt** (une config placée ailleurs casse la résolution de
`testDir`), et ne pas être commitée.

---

## 3. Ce qui reste à faire

### 3.1 Le défaut vivant que #367 ne ferme qu'en partie — mesuré ce matin

`telemetry_events`, `type='api'`, 7 derniers jours, production :

| Cible | Statut | Refus | Sessions | Comptes | Dernier |
|---|---|---|---|---|---|
| `rest/v1/user_state` | 401 | 278 | 109 | **0** | 2026-09-13 06:03 |
| `rest/v1/profiles` | 401 | 102 | 101 | **0** | 2026-09-13 06:03 |
| `rest/v1/push_subscriptions` | 403 | 17 | 12 | 2 | **2026-09-13 05:51** |
| `rest/v1/conv_messages` | 403 | 285 | 31 | 2 | 2026-09-10 07:19 |
| `rest/v1/story_views` | 401 | 17 | 3 | **0** | 2026-09-08 19:15 |
| `rest/v1/conv_reads` | 401 | 13 | 5 | **0** | 2026-09-12 15:12 |

**`user_state` et `profiles` refusent à la même minute, sur 0 compte** : c'est une
seule cause — `getMyUserId()` fabrique un `u_<aléatoire>` pour tout visiteur, et
les gardes d'écriture ne testaient que `!MY_UID`. #367 ferme `user_state` ; **les
quatre autres surfaces restent ouvertes** :

- **`profiles` 401 (102 refus / 101 sessions / 0 compte) — le prochain lot**, via
  `supaEnsureProfileExists`. Même correctif, même autorité (`_uidEstUnCompte`).
  La PR #367 le dit déjà hors de son périmètre.
- **`push_subscriptions` 403, encore ce matin à 05:51, avec 2 comptes.** Ses
  quatre policies exigent `user_id = auth.uid()::text` : un refus signifie que le
  client écrit un identifiant qui n'est pas celui de la session. **Conséquence
  produit directe : l'appareil ne s'abonne pas, donc aucune notification push
  n'arrive** — ce qui vide de son effet la fiche « Notifier un message privé ».
  Non documenté jusqu'ici.
- **`conv_messages` 403 : 285 refus, 31 sessions, sur de vrais téléphones**
  (android/chrome, du 07/09 au 10/09 ; ce n'est pas le banc CI, qui est
  linux/chrome). Deux causes candidates, à trancher avant de corriger :
  `from_id` ≠ `auth.uid()` (même famille) ou `is_conv_member` faux. **Un message
  qui ne part pas est le défaut le plus coûteux de cette liste.**
- `story_views` et `conv_reads` (0 compte) : même famille visiteur, moins graves.

`analytics_events` 401 (274 refus) s'arrête au **2026-09-09 11:06**, jour du
déploiement de #298 : refermé, à ne pas rouvrir.

### 3.2 Gestes hors dépôt — aucun n'est du code

1. **Le captcha Turnstile est DÉPLOYÉ mais INACTIF.** Mesuré :
   `PASSIO_TURNSTILE_SITEKEY = ""` (app-08). L'ordre d'allumage n'est pas
   négociable : ① créer le widget chez Cloudflare (hostname
   `passio-app.netlify.app`) ② poser la sitekey dans app-08 **et déployer**
   ③ seulement alors, Supabase → Authentication → Attack Protection → « Enable
   Captcha protection » + secret. Allumer ③ avant ② casse 100 % des inscriptions.
   Tant que ce n'est pas fait, SEC-06 du go/no-go reste ouvert : un script peut
   vider le quota d'e-mails et rendre l'inscription indisponible 24 h.
2. **Minimum du mot de passe côté serveur.** Le client refuse à 8
   (`MOT_DE_PASSE_MIN`) et traduit les refus ; le réglage serveur
   (Authentication → Email → « Minimum password length » = 8, « Password
   requirements » = lettres et chiffres) **ne se lit depuis aucune API** — GoTrue
   ne l'expose pas, et le réseau sortant de cet environnement n'atteint ni
   Supabase en HTTP ni Netlify (CONNECT 403 par la politique réseau). À constater
   sur le tableau de bord. L'ordre est le bon : le client d'abord, c'est fait.

### 3.3 Points ouverts déjà écrits, toujours vrais

- **Aucun chemin d'encaissement n'existe**, et les CGU en vigueur **promettent la
  gratuité** (art. 2 et 10) en y fondant l'exonération de responsabilité.
  Encaisser un euro rend ces deux articles faux : il faut réécrire les CGU,
  incrémenter `PASSIO_CGU_VERSION`, et basculer `PASSIO_EDITEUR.regime` sur
  `"societe"` (huit champs à renseigner).
- **1 021 passions n'ont qu'un seul alias** (cible 2, plancher 1), sur 5 003
  actives en base.
- Résidus assumés de l'ouverture publique : identité de l'appelant déclarative
  **entre comptes** (live, `fromName`/`text` de `notify-call`) ; `is_conv_member`
  et `is_blocked_with` restent des oracles pour un compte **connecté**.

### 3.4 Deux points annoncés ouverts qui ne le sont PLUS — mesuré, à ne pas rouvrir

C'est la sixième fois que la règle sert : **l'état d'un système ne se lit pas dans
un fichier du dépôt, il se mesure.**

- **« `reports` n'a aucune colonne de statut, un signalement n'arrive nulle
  part »** (go/no-go du 2026-09-10) : **faux aujourd'hui.** La table porte
  `status`, `handled_at` et `handled_note` ; `scripts/moderation.js`
  (`npm run moderation`) la lit, et `.github/workflows/moderation-alerte.yml`
  ouvre une issue `[MODÉRATION]` sans identifiant ni motif. 2 signalements en
  base.
- **« Le moteur IA local ne connaît que 19 passions »** : refermé.
  `aiGenerateResponse` (app-06) est `async` et appelle
  `moteur.chercherAsync(query)`, en fusionnant devant ses propres résultats, avec
  `diagLog` avant tout repli. De même, `passioThumb` n'a plus trois appelants
  mais une quinzaine — avatars (192/352), couvertures (880), photos de groupe
  (192), bobines (720) : le point « les avatars partent en pleine résolution »
  est traité.

### 3.5 Issues ouvertes — cadrage, pas du code en attente

| Issue | Sujet | Ce qui la bloque |
|---|---|---|
| [#282](https://github.com/PASSIO74/passio-app/issues/282) | Isoler les tests de la production | la CI des PR crée encore des comptes de production ; demande un backend de test distinct |
| [#279](https://github.com/PASSIO74/passio-app/issues/279) / [#284](https://github.com/PASSIO74/passio-app/issues/284) | BILAN 09/26 et sa contre-revue | audit sur un SHA du 2026-09-04, dépassé par 90 fusions |
| [#174](https://github.com/PASSIO74/passio-app/issues/174) | UI-6A0 — créer une activité avec couverture | en attente d'une validation visuelle de Benjamin |
| [#73](https://github.com/PASSIO74/passio-app/issues/73) | PERF-IOS phases 2 à 8 | une phase par branche, aucune lancée |
| [#69](https://github.com/PASSIO74/passio-app/issues/69) | Onboarding V2 — 4ᵉ aide IRL | volontairement bloquée jusqu'aux tests T&S multi-comptes réels |

---

## 4. Hygiène du dépôt

235 branches distantes, dont **~180 antérieures au 2026-09-01 dont la PR est
fusionnée ou close**. Elles ne gênent aucun outil, mais elles rendent toute
lecture de « ce qui reste » coûteuse — c'est très exactement ce qui a fait perdre
du temps au début de cette session. Un élagage des branches dont la PR est
fermée est sans risque (l'historique vit dans `main`), et c'est un geste que
personne n'a encore fait.

