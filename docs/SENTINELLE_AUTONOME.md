# Sentinelle autonome v2 — la chaîne GitHub, ses façons de mourir, ses gardes

Version du 2026-09-18 (lot A « autonomie »). Fichiers : `scripts/sentinelle-detecter.mjs`,
`tests/unit/sentinelle-detecter.test.mjs`, `.github/workflows/sentinelle-autonome.yml`,
`.github/workflows/claude-code.yml`, `.github/workflows/deploy.yml`, `docs/sentinelle/`.

## La chaîne, en une ligne

`sentinelle-autonome.yml` (cron horaire, servi 4 à 8 fois par jour) lit la production →
ouvre UNE issue `[SENTINELLE]` label `sentinelle` → pose le label `claude` 8 s plus tard →
`claude-code.yml` écrit le correctif, le verrou et la fiche → PR auto-fusionnée si toute la
CI passe (gouvernance : périmètre + 2 fichiers / 60 lignes) → `deploy.yml` déploie et
écrit « déployé » sur l'issue. Ni PC allumé, ni geste humain. Mesuré du 09 au 13/09 :
6 enquêtes sur 9 réparées seules, 25 à 79 min entre l'alerte et la production.

GitHub est la MAIN. Tout ce qui exige Benjamin lui arrive **par e-mail GitHub, une fois,
avec le geste à faire** : une issue ou un commentaire écrit avec `github.token` (jamais
`SENTINELLE_TOKEN`, dont GitHub ne notifie pas l'auteur de ses propres gestes).

## Ce que le détecteur lit (v2)

| Source | Table | Ce qui en sort |
|---|---|---|
| Erreurs JS des visiteurs identifiés | `client_errors` (`auth_uid` non nul) | famille `js` — `uid` = `auth_uid` (identité serveur), jamais le `uid` écrit par le client |
| Erreurs JS de la télémétrie | `telemetry_events` type `error`, env `production`, `auth_uid` non nul | famille `js`, fusionnée avec la précédente par empreinte (une même erreur vue par les deux moniteurs compte une fois), 5 par session au plus |
| Appels refusés | `telemetry_events` type `api`, status `error`, env `production` | famille `api`, avec `app_version`, `severity`, `meta` |
| Boutons sans effet | clics / effets | suspects seulement, jamais une cible |

Bruit lu sur ce que le client a **prouvé** : un statut 0 est du bruit sauf `severity =
error` sans `meta.masquee|hors_ligne|fermeture` (et alors ≥ 2 comptes) ; un 4xx avec
`meta.refus_attendu` est du bruit ; 429 se nomme « plafond de débit atteint ».

Chaque candidat porte `versions` (`app_version` → n, dernière) et ses 200 occurrences les
plus récentes `{at, app_version}` : c'est ce qui permet la dédup ci-dessous.

## Les façons dont la chaîne meurt, et la garde qui répond

| # | Façon de mourir | Mesuré | Garde (v2) |
|---|---|---|---|
| 1 | **Run Claude perdu par la course de 3 événements** (`--label claude --label sentinelle` → 3 runs dans le même groupe de concurrence, l'évincé était le seul qui travaille) | #316, #327, #337 : aucune PR, aucun commentaire, canal muet 6 h / 28 h 51 / 9 h | A1 : l'issue est créée avec le seul label `sentinelle`, `claude` est posé 8 s plus tard, seul dans son groupe |
| 2 | **Enquête ouverte sans personne dessus** → « une enquête à la fois » muet | 18 % du temps sur 10 j | A2 : veilleur en tête de run — sans PR ni run après 20 min : relance UNE fois (`claude` retiré puis reposé, label `sentinelle-relancee`) ; après 6 h sans PR fusionnée : label `humain` + bilan, l'enquête sort du compte, elle n'est PAS fermée |
| 3 | **Récidive fabriquée** : dédup datée sur la fermeture (fusion), pas sur le déploiement ni le build du client | #355 a rouvert #350 sur une occurrence 41 min après la fusion, d'un client encore sur l'ancien app.js | A3 : `estVivante` — vivante si `app_version` est un build qui contient le correctif, sinon si postérieure à `deployeA` + 2 h (`SENTINELLE_GRACE_H`) ; le workflow date chaque enquête fermée sur le run deploy.yml vert de sa PR ; sans PR ni déploiement retrouvé, règle historique par `closedAt` |
| 4 | **Boucle** : même titre corrigé N fois | trois enquêtes, une cause, le 12/09 | A4 : ≥ 2 correctifs déployés sur le même titre → issue `sentinelle` + `recidive` + `humain`, sans `claude`, corps « décision humaine » |
| 5 | **Aucune mémoire** : la leçon reste dans un commit que personne ne relit | idem | A5 : la fiche `docs/sentinelle/<date>-<condensé>.md` est exigée (périmètre + hors comptage), les fiches proches sont jointes à l'enquête suivante, le bloc Cause/Correctif/Verrou/Leçon du commit est recopié sur l'issue |
| 6 | **Gouvernance rouge muette** : refus de périmètre ou de taille sans un mot sur l'issue | jamais exercé, chemin aveugle | A6 : commentaire de refus sur l'issue d'origine + label `humain` ; la PR reste ouverte pour relecture |
| 7 | **Fermée à la fusion, jamais déployée** : main rouge après la fusion | 8 rouges sur main en 10 j, dont un job « Déploiement production » | A7 : job `retour-issue` de deploy.yml — succès : « déployé à <heure>, run, commit » ; échec ou déploiement sauté : l'issue `sentinelle` est rouverte avec `humain` |
| 8 | **Détecteur en panne** (Supabase 5xx, jeton mort, script cassé) : un e-mail de run rouge parmi d'autres | — | A8 : issue `[SENTINELLE MUETTE]` label `disponibilite`, refermée au run vert suivant |
| 9 | Jeton `SENTINELLE_TOKEN` expiré (90 j) | — | étape « Le jeton est-il vivant ? » : run rouge nommant la page de renouvellement, puis A8 |
| 10 | Clé `service_role` changée | — | `exit 2` du détecteur, puis A8 |
| 11 | GitHub désactive les crons après 60 j sans commit ; les crons sont servis 4 à 23× moins souvent qu'annoncé | 41 % des créneaux | hors de ce lot : le poste (lot D) et la veille (lot B) mesurent l'âge des runs |
| 12 | **L'angle mort** : bouton mort, HTTP 200 faux, télémétrie interrompue | permanent | aucune : le silence n'est jamais une preuve de santé |

## Les labels

| Label | Posé par | Jeton | Effet |
|---|---|---|---|
| `sentinelle` | sentinelle-autonome, à la création | `SENTINELLE_TOKEN` (enquête) / `github.token` (récidive) | marque d'origine ; avec l'auteur OWNER et le préfixe `[SENTINELLE]`, arme l'auto-fusion ; compte dans « une enquête à la fois » (sauf `humain`) |
| `claude` | sentinelle-autonome, étape séparée 8 s après | `SENTINELLE_TOKEN` | déclenche `claude-code.yml` (seul événement de son groupe) |
| `humain` | veilleur (6 h), gouvernance (refus), retour-issue (non déployé), récidive | `github.token` | la machine s'arrête, e-mail à Benjamin ; l'issue ne compte plus dans « une enquête à la fois » ; `choisirCible` saute son titre tant qu'elle est ouverte |
| `recidive` | sentinelle-autonome (A4) | `github.token` | ≥ 2 correctifs déployés sur le même titre |
| `sentinelle-relancee` | veilleur | `github.token` | le run Claude a été relancé une fois ; jamais deux |
| `disponibilite` | sentinelle-autonome (`[SENTINELLE MUETTE]`), disponibilite.yml | `github.token` | alerte de disponibilité, jamais de correctif automatique |
| `veille`, `digest` | lot B | `github.token` | veille production et digest quotidien (voir `docs/VEILLE_PRODUCTION.md` quand il existe) |

Coupe-circuit : une issue ouverte par PASSIO74 dont le titre contient `[SENTINELLE PAUSE]`
(lue par liste + filtre local, jamais par `--search`).

## Ce que Benjamin reçoit, et le geste

| E-mail | Geste |
|---|---|
| Commentaire « ✅ Claude Code a exécuté cette tâche » avec fiche et état de l'auto-fusion | rien, sauf « Auto-fusion : refusée / non armée » → fusionner à la main |
| « ✅ Déployé en production » | rien |
| Issue ou commentaire avec label `humain` (bilan du veilleur, refus de gouvernance, non déployé, récidive) | lire les liens, décider : correctif à la main (contre-revue si périmètre critique) ou fermeture motivée ; refermer l'issue |
| `[SENTINELLE MUETTE]` | ouvrir le run rouge : jeton, clé, Supabase, verrous |

Ce qu'il ne faut PAS faire : fermer une enquête `humain` sans correctif en pensant
« résolu » — sans `deployeA`, la dédup la lit par date et rouvrira à la première
occurrence suivante. Ouverte et `humain`, elle ne gêne rien.

## Vérifier sans GitHub

- `node --test tests/unit/sentinelle-detecter.test.mjs` (60 verrous, chacun éprouvé par
  la mutation nommée en tête du test) ;
- `node --test tests/unit/sentinelle-taille-pr.test.mjs` (le snippet ASTRA-34 réel de
  deploy.yml, dont l'exclusion de la fiche) ;
- `bash tests/ci/frontiere-confiance.sh` (les valeurs figées de claude-code.yml).
