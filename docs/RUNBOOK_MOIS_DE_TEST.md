# Runbook des mois de test — ce que tu reçois, ce que tu fais

> Écrit le 2026-09-18 pour un pilote où le poste peut être éteint et où tu n'as presque rien à faire.
> Principe : **tout ce qui exige un geste de toi arrive par e-mail GitHub, une fois, avec le geste.** Rien d'autre ne doit t'arriver. Si tu ne reçois rien, ce n'est pas une preuve de santé — lis le digest du lundi.
>
> Une seule chose à vérifier une fois : GitHub → Settings → Notifications → les e-mails d'issues arrivent sur une adresse que tu lis.

## 1. Ce que tu reçois par e-mail, et ce que tu fais

| Tu reçois | Ce que c'est | Ce que tu fais | Se referme |
|---|---|---|---|
| **`[DIGEST] <date> — N à faire`** (label `digest`) | Le matin (08:30 Paris demandé, souvent servi vers 10-13 h), s'il y a quelque chose à faire, et tous les lundis | Lis « Ce qui t'attend » : chaque ligne porte le geste et le lien. Fais les gestes, c'est tout. « Ce que les machines ont fait » se lit, ne se traite pas. | Remplacé par le digest suivant |
| **`[VEILLE] N alerte(s) : …`** (label `veille`) | Une panne silencieuse : télémétrie arrêtée, inscriptions jamais confirmées, déploiement bloqué, cron mort, base pleine, jeton expiré, 5xx groupés | Lis la section « Ce que tu fais » de l'issue : un geste par signal (tableau §2). Ne réponds pas dans l'issue, elle est réécrite à chaque passage. | Seule, quand le signal revient (compte 2 à 5 h) |
| **`[DISPONIBILITÉ] passio-app.netlify.app ne répond pas`** (label `disponibilite`) | Le site servi ne répond plus (release.json ou accueil) | app.netlify.com (état du déploiement, incident Netlify) puis, si le dernier déploiement est en cause : `npm run rollback:netlify -- --restaurer precedent` depuis le poste | Seule, au retour du site |
| **`[MODÉRATION] N signalement(s) en attente`** (label `moderation`) | Un signalement attend depuis plus de 24 h | Depuis le poste : `npm run moderation`, puis `npm run moderation voir --id <id>` et `npm run moderation traiter --id <id> --statut handled\|dismissed --note "…"`. Décider est ton geste, personne ne le fera. | Seule, quand plus rien n'attend |
| **`[SENTINELLE] …`** avec label **`humain`** | Une enquête que la chaîne n'a pas pu finir (run perdu, PR refusée par la gouvernance, canal en panne) : bilan et liens dans l'issue | Lis le bilan. Trois issues possibles : corriger à la main dans une session, fermer (« not planned ») si c'est du bruit, ou retirer puis reposer le label `claude` **une fois** pour relancer. Puis ferme l'issue : tant qu'elle est ouverte avec `humain`, elle ne bloque plus le canal mais elle reste dans ton digest. | Toi |
| **`[SENTINELLE] …`** avec label **`recidive`** | Le même défaut revient après un correctif déployé (déjà corrigé ≥ 2 fois) | Décision humaine : la cause est ailleurs que là où la chaîne cherche. Ouvre une session Claude avec les liens des enquêtes précédentes. Ne relance pas `claude`. | Toi |
| **`[SENTINELLE DISTANTE] Santé rouge`** | Audit statique rouge, page publique cassée ou canari staging rouge | Ouvre le run lié. Un audit rouge = une PR l'a cassé (la CI l'aurait bloqué sur main : regarde ce qui a été poussé) ; canari staging rouge = souvent l'environnement staging. | Seule, au run vert suivant |
| **Run planifié rouge** (e-mail « Run failed ») pour `sauvegarde`, `sentinelle-autonome`, `moderation-alerte`, `veille-production`, `digest` | Le workflow lui-même a échoué, presque toujours un jeton | Ouvre le run, lis l'étape rouge : `SUPABASE_ACCESS_TOKEN` → supabase.com/dashboard/account/tokens ; `SENTINELLE_TOKEN` → github.com/settings/tokens (90 j) ; `SUPABASE_SERVICE_ROLE_KEY` → tableau Supabase > API. Colle la nouvelle valeur dans Settings > Secrets and variables > Actions. | Au run vert suivant |
| **`[VEILLE MUETTE]`** (label `veille-muette`) / **`[DIGEST MUET]`** (label `digest-muet`) | La veille (ou le digest) n'a pas pu rendre de verdict : jeton refusé, API en panne, script cassé. Tant qu'elle est muette, les pannes silencieuses ne sont vues par personne | Même geste que la ligne du dessus : ouvre le run lié, lis l'étape rouge, renouvelle le jeton. Le digest te la rappelle chaque matin. | Seule, au prochain verdict rendu (ou digest composé) |
| **Job « Gouvernance critique » rouge sur une PR** : « Contre-revue manquante » | La PR touche `.github/*`, `migrations/*`, `dashboard/server/{auth,config,repair,sentinel}.js`, `scripts/run_migrations.js` ou `scripts/sauvegarde-donnees.js` | Relis la PR, puis **`gh pr review <n> --comment --body "Contre-revue technique indépendante — <ce que tu as vérifié>"`** (ou le bouton *Review changes* dans GitHub, avec cette phrase dans le corps). Chaque nouveau commit sur la PR la redemande. Le digest te la rappelle chaque matin. | Au push suivant du check |
| **Job « Gouvernance critique » rouge sur une PR `[SENTINELLE]`** : « Perimetre depasse » / « Reparation trop large » | La chaîne a proposé un correctif hors bornes (plus de 2 fichiers, plus de 60 lignes, ou hors `js/`, `styles.css`, `index.html`, `sw.js`) | Un humain décide : relis la PR ; fusionne à la main si elle est bonne, sinon ferme-la avec un mot. L'issue liée porte le label `humain`. | Toi |

## 2. Les gestes derrière chaque signal `[VEILLE]`

| Signal | Ce que ça veut dire | Geste |
|---|---|---|
| `flux` : 0 canari en 2 h | Le poste de pilotage est éteint, ou Supabase refuse les écritures | Allume le poste / `Lancer-Pilotage.cmd` ; sinon status.supabase.com |
| `flux` : N h actives sans ligne, journée vide | La télémétrie ne part plus des clients, ou plus personne n'utilise l'app. Une alerte du soir tient toute la nuit (la journée de la veille est jugée jusqu'à 08 h) et se referme au premier passage actif où le trafic est revenu | Centre de pilotage > Sources (canari, Realtime, ingestion) ; ouvre l'app sur ton téléphone et regarde si ta session apparaît ; sinon regarde le dernier déploiement |
| `inscriptions` | L'e-mail de confirmation ne part plus | Tableau Brevo (envoyés/300 du jour, clé SMTP valide) → Supabase > Authentication > SMTP ; teste une inscription avec une adresse à toi |
| `api` : 5xx groupés | Supabase répond en erreur serveur | status.supabase.com, puis Supabase > Logs. Si c'est côté PASSIO, la sentinelle ouvrira l'enquête : ne double pas |
| `api` : refus 401/403 groupés | Jeton mort collectif ou policy RLS changée | Supabase > Authentication (sessions) et > Database > Policies : qu'est-ce qui a changé ? |
| `deploiement` : run main rouge | La prod est restée sur l'ancien commit | Ouvre le run, lis le job rouge ; corrige par une PR ou reviens en arrière (`docs/RECUPERATION.md`) |
| `deploiement` : bloqué | main est en avance sur ce que Netlify sert depuis > 90 min et rien ne tourne | Actions > CI & Deploy > dernier run main > *Re-run all jobs* (`gh run rerun <id>`) ; s'il n'y a aucun run pour ce commit, pousse un commit vide sur main (`git commit --allow-empty -m "Redéploiement" && git push`) — `deploy.yml` n'a pas de `workflow_dispatch`, `gh workflow run deploy.yml` est refusé ; si le build est vert mais Netlify sert l'ancien, app.netlify.com > Deploys |
| `crons` : désactivé | GitHub a coupé un cron (60 j sans commit) | Actions > le workflow nommé > *Enable workflow*. Un commit tous les < 60 j évite ça |
| `crons` : trop vieux | Le workflow ne tourne plus (échec répété ou file GitHub) | Actions > le workflow nommé : dernier run ? `gh workflow run <fichier>.yml` pour le relancer |
| `base` : anon ≠ 200 | Projet en pause, clé anon régénérée, ou API en panne | status.supabase.com ; Supabase > Project settings |
| `base` : > 6 / 7,5 Go | La base approche du plan (8 Go) | Supabase > Database : `select purge_telemetry(7)` puis vacuum ; ou palier supérieur |
| `base` : purge non planifiée | `cron.job` ne porte plus `purge_telemetry_*` | Rejoue la section « rétention » de `migrations/OUVERTURE_2026-09-11.sql` par `npm run migration:appliquer` |
| `jetons` | Un jeton expire ou est refusé | github.com/settings/tokens (`SENTINELLE_TOKEN`), supabase.com/dashboard/account/tokens, app.netlify.com/user/applications → nouveau jeton → Settings > Secrets |

## 3. Les trois gestes du poste (quand tu es devant)

Le poste (Centre de pilotage, `dashboard/`) est l'œil temps réel. Il n'est pas obligatoire pour que la chaîne GitHub répare, mais sans lui il n'y a ni canari ni règle sous l'heure.

1. **`Connecter-Claude.cmd`** quand la page Sources dit `logged_out` / `auth_refused` : la session OAuth du CLI a expiré. Un `claude auth login` dans un terminal ordinaire ne reconnecte **pas** le pilotage (dossier isolé `.claude-cli`).
2. **Disque C:** sous 10 Go (ligne « Disque du poste », page Sources) : libère de l'espace — d'abord `.passio/ai-worker/worktrees/*` et `.claude/worktrees/*`, puis les journaux. 22 plantages ENOSPC du 1er au 10/09 : c'est le poste qui tombe en premier.
3. **`Arreter-Pilotage.cmd` / `Lancer-Pilotage.cmd`** pour redémarrer proprement (le superviseur relance seul ; « Superviseur » rouge = 3 relances en boucle, regarde le journal avant de relancer).

## 4. Ce qu'il ne faut PAS faire

- **Ne régénère pas `CLAUDE_CODE_OAUTH_TOKEN` sur un `AUTH_REELLE: none`** : ce n'est pas une panne (`docs/CANAL_GITHUB_CLAUDE_CODE.md`). Une panne d'auth se voit par un run `claude-code` rouge à l'étape d'auth, avec un commentaire sur l'issue.
- **Ne repose pas le label `claude` en boucle** sur une enquête : une fois, tracée par `sentinelle-relancee`. Au deuxième échec c'est une décision, pas une relance.
- **Ne réponds pas dans une issue `[VEILLE]` / `[DISPONIBILITÉ]` / `[MODÉRATION]`** pour « noter » quelque chose : elles sont réécrites ou refermées par les workflows. Note dans le registre ou dans une fiche.
- **Ne resserre pas un seuil temporel** (cron « toutes les 30 min », sonde « 10 min ») parce qu'une alerte est arrivée tard : GitHub sert ces crons toutes les 2 à 5 h, c'est mesuré. Une alarme qui crie à tort finit par ne plus être lue.
- **N'applique pas de migration depuis le tableau Supabase** sans passer par `npm run migration:appliquer` et une attestation (RES-15) ; le digest te rappellera le résidu.
- **Ne ferme pas une issue `[SENTINELLE]` comme « completed »** si rien n'a été déployé : la dédup lirait « corrigé ». Utilise « not planned ».
- **Ne pose jamais le label `claude`** sur une issue `veille`, `digest`, `moderation`, `disponibilite`, `veille-muette`, `digest-muet` : ce ne sont pas des réparations bornées.
- **Ne pose pas le label `disponibilite`** sur une autre issue que `[DISPONIBILITÉ]` : la sonde du site referme « la première issue ouverte » de ce label dès que le site répond.

## 5. Cadence

- **Chaque jour (téléphone, 5 min)** : la boîte e-mail GitHub. Un digest → ses gestes. Rien → rien.
- **Chaque lundi (20 min, poste)** : le digest du lundi arrive même vide ; page Sources du pilotage (disque, superviseur, CLI, Realtime) ; tableau Brevo (envoyés/300, clé valide) ; Actions → les cinq crons ont tourné depuis < 24 h (la veille le vérifie aussi).
- **Jalons datés** :

| Date | Jalon | Geste |
|---|---|---|
| **2026-09-23** | RES-14 — cycle réel sauvegarde → restauration | Créer le projet Supabase jetable (ou réutiliser le staging hors fenêtre CI), transmettre ref + jeton, jouer le cycle une fois ; noter la valeur (RES-17) dans `docs/RECUPERATION.md` |
| **2026-09-30** | RES-13 — appels audio/vidéo | Décider : correction bornée ou maintien de la désactivation pour l'élargissement ; l'écrire dans le registre |
| **2026-10-01** | RES-05 — version client | Échéance du registre : décider ou reporter avec une date |
| **2026-10-15** | RES-02, RES-03, RES-16 | Purge des marqueurs (planifier sur la cible), élargissement du pilote : décider, dater, écrire |
| **2026-10-31** | RES-07, RES-09, RES-12 | Idem — le digest te les rappelle 7 jours avant |
| **≈ début décembre 2026** | `SENTINELLE_TOKEN` (jeton GitHub 90 j, posé vers le 2026-09-09) | La veille compte les jours (`jetons` : attention < 14 j, alerte < 3 j). Régénérer sur github.com/settings/tokens, coller dans Settings > Secrets |
| **Tous les < 60 jours** | Crons GitHub | Un commit sur `main` suffit ; sinon la veille dit `crons : DÉSACTIVÉ` et le geste est *Enable workflow* |

Les résidus vivent dans `.passio/residus/registre-residus.json` : un résidu devenu traitable et laissé « en_attente » fait rougir la CI (`npm run verif`). Le digest le liste 7 jours avant l'échéance.

## 6. Où lire le détail

- `docs/VEILLE_PRODUCTION.md` : les huit signaux, les seuils, les lectures, les verrous.
- `docs/SENTINELLE_AUTONOME.md` (lot A) : la chaîne de réparation et ses labels (`sentinelle`, `claude`, `humain`, `recidive`, `sentinelle-relancee`).
- `docs/SENTINELLE_DISTANTE.md`, `docs/CANAL_GITHUB_CLAUDE_CODE.md`, `docs/RECUPERATION.md`, `docs/MISE_EN_SERVICE_PILOTE.md`.
- `dashboard/README.md` : le poste, ses `.cmd`, la page Sources.
