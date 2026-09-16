# Pilote gratuit PASSIO — candidat, preuves, procédure de mise en service (2026-09-16)

> Sixième contre-revue Astra, reprise du 2026-09-16. Candidat : branche
> `claude/astra6-pilote-gratuit` (base : candidat d'intégration `26ffb00f` = #476 = #469–#475 sur
> `main` `a5e8c717`). **Rien n'a été fusionné, appliqué ni déployé** : toutes les opérations de
> production sont listées en §E et attendent une autorisation finale, unique, précise.
>
> Convention (inchangée) : **corrigé** = code écrit · **testé** = preuve jouée, nature dite ·
> **déployé** = en service sur la cible · **relu sur cible** = observé après mise en service. « Non
> mesuré » = aucune preuve. Natures de preuve : [PG] PostgreSQL 17.10 réel jetable · [simu] doubles
> JS avec les vraies fonctions applicatives · [nav] Chromium réel · [public] lecture publique de la
> cible, sans identifiant · [distant] non joué (aucun accès en écriture, aucun projet jetable).

## A. Ce qui fonctionne pour les premiers utilisateurs

Sur le candidat, dans le périmètre du pilote (site + PWA existants, aucun paiement) :

| Parcours | État sur le candidat | Preuve |
|---|---|---|
| Inscription (e-mail confirmé, 18+, CGU), connexion, déconnexion, récupération de compte | inchangé depuis `a5e8c717` (servi en production) | suites e2e `auth-*`, `inscription-*`, `recuperation-*` de la CI ; run complet local §C |
| Profil : création, modification, passions | inchangé | e2e `profil-*`, `passions-*` |
| Publications (feed), commentaires, likes, stories | inchangé | e2e `feed-*`, `post-*`, `commentaires-*` |
| Messagerie, photos, vocaux, pièces jointes | inchangé ; files hors ligne par compte (#472) | e2e `conv-*`, `file-messages-par-compte`, `message-media-echec` |
| Isolation entre deux comptes | RLS de production ; barrière de suppression v3 | e2e `authz-*`, bancs SQL des migrations, `migration-barriere-suppression` 88/88 |
| Blocage, signalement | inchangés (blocage dans les deux sens jusqu'à la push) | e2e `blocage-*`, `signalement-*` ; `notify-call` lit `blocks` |
| Export des données | instantané si la migration `export_instantane` est appliquée, sinon **repli partiel dit** (jamais « complet ») | `export-compte.test.mjs` 14, `migration-export-instantane` [PG] 17/17, e2e `export-donnees` |
| Suppression de compte | **barrière v3** (ASTRA-56) : verdict honnête jusqu'à l'interface ; **indisponible (503) tant que la migration n'est pas appliquée** — fail-closed | §C.1 |
| Notifications in-app et push | conservées ; mentions écrites par le serveur si la migration `notifications_serveur` est appliquée, sinon silence tracé | `migration-notifications-serveur` [PG] 37/37, e2e `mention-serveur` |
| PWA (installation, mise à jour des anciens clients) | inchangée : `sw.js` auto-bumpé par `build.js`, `release.json` porte le commit | `pwa-*` e2e ; mesure §F |
| Limites de la version, support, confidentialité | **nouveau** : « Limites de cette version pilote » dans Réglages → Support (appels indisponibles, fonctions en test, pas de garantie, export, politique, contact) | commit `55d45de7` ; gates handlers/échappement vertes |

Protections contre les abus conservées : plafonds `rate_limit_insert` (posts, notifications,
follows, réactions), plafonds par compte des Edge Functions (`plafond.js`), captcha Turnstile à
l'inscription, confirmation d'e-mail, admission 18+, RLS par propriétaire. Aucune dépense engagée :
pas de TURN dédié (appels retirés), pas de quota IA relevé.

## B. Ce qui est temporairement désactivé

- **Appels audio et vidéo** (ASTRA-60, commit `27e01724`) — à **tous** les points d'entrée : boutons
  non rendus, `startCall` refuse et prévient, sonnerie non abonnée, invitation d'un **ancien client
  en cache** ignorée et tracée (`call_ignore_pilote`), `notify-call` refuse `type:"call"` (503
  `appels_desactives`). Aucune policy rouverte, aucun canal public. Réactivation : deux constantes
  (`PASSIO_APPELS_ACTIFS`, app-05 ; `APPELS_ACTIFS`, notify-call) après correction bornée — RES-13.
  Les suites d'appels s'arment elles-mêmes (`passio_appels_actifs`) et restent vertes (21/21).
- Rien d'autre n'est désactivé. Les fonctions dont la migration n'est pas appliquée se **dégradent
  honnêtement** (export partiel dit, mentions silencieuses tracées, suppression 503) — jamais un
  succès annoncé sans garantie.

## C. Corrections et preuves (SHA, commande, résultat, environnement)

Environnement : Windows 11 Pro, Git Bash, Node 24.16.0, PostgreSQL **17.10** (binaires EDB, serveur
jetable par banc, `initdb --locale=C`), Playwright 1.60 + Chromium (projet `local`, `http-server`,
**aucune écriture en base**), `jq` 1.7.1 (`JQ_BIN`). Sorties conservées dans
`.passio/audits/BILAN_PASSIO_09-26/preuves/astra6/` (copie de `PASSIO-wt/preuves/astra6/`).
Deux gates sont **CRLF-sensibles** sur ce poste (`audit-supa-stub`, `generer-ouverture --verifier`) :
vertes dans le worktree LF et en CI, rouges dans le checkout CRLF — dit, pas contourné.

### C.1 ASTRA-56 — suppression de compte (bloquant) · commit `88ae43c1`

Cause, rejouée avec les vraies fonctions : `reclamer_suppression` donnait le marqueur `purgee` d'une
tentative **vivante** ; `terminer_suppression(…,'echec')` levait la protection d'un compte dont les
données étaient parties ; le handler annonçait `garantie:"barriere"` sur un `jeton_perime`.

Correction (migration **v3**, rejouable sur v1/v2 ; `purge-compte.js` ; `suppression-compte.js` ;
`doDeleteAccount`) :
1. `tentative_vivante` : une tentative vivante n'est jamais reprise, quel que soit son statut
   (péremption 15 min) → B reçoit 409 `deja_en_cours` ;
2. plus de transition purgee → echec : `echec` sur `purge_terminee_le` posé s'écrit `purgee` ;
3. événement `auth_echec` : Auth en échec = tentative terminée, protection conservée, reprise
   immédiate ; `deleteUser` 404 = reprise, pas un échec ;
4. le handler rapporte l'état **écrit** par SQL ; finalisation refusée → 500 `finalisation_refusee`
   (Auth parti, données purgées, marqueur = état réel, **pas de `garantie`**) ; le client ferme la
   session sans annoncer « Compte supprimé ».

| Preuve | Commande | Résultat | Nature |
|---|---|---|---|
| entrelacement A/B, tentative interrompue (15 min), échec Auth, mutation « purgee reprenable » | `bash tests/sql/migration-barriere-suppression.test.sh` | **88/88**, exit 0 (`astra56-barriere-v3.txt`) | [PG] |
| écritures en vol (deux connexions) | `bash tests/sql/ecriture-en-vol-suppression.test.sh` | 11/11 | [PG] |
| séquences de mise en service | `bash tests/sql/sequences-mise-en-service.test.sh` | 23/23 | [PG] |
| reproduction déterministe : modèle des transitions **v2** (défaut visible : marqueur `echec`, 1 ligne, handler sans `garantie`) puis **v3** (0 ligne, garantie) ; interruption, échec Auth, reprise, 404 | `node --test tests/unit/suppression-entrelacement.test.mjs` | 7/7 | [simu] vraies fonctions |
| purge / handler | `node --test tests/unit/purge-compte.test.mjs tests/unit/suppression-compte.test.mjs` | 29/29 | [simu] |
| interface : `finalisation_refusee`, « données déjà parties » | `npx playwright test --project=local tests/e2e/suppression-compte-verdict.spec.js` | 9/9 | [nav] |

Le refus honnête 409 `en_vol` après 5 s d'attente est **conservé** (`ATTENTE_EN_VOL_MS`).
Non joué : GoTrue réel (aucun projet jetable) — RES-04.

### C.2 ASTRA-57/58/59 — sauvegarde et restauration · commit `7365800c`

- **57** : `paginerProprietaires` — `limit`/`offset` + `order=bucket_id.asc,name.asc` + `Prefer:
  count=exact` ; terminaison par le total (vérifié) ou la page vide ; avance du nombre reçu ;
  non-progression = erreur nommée. Faux PostgREST réécrit selon ses **vraies règles de statut**
  (200 sans compte) ; l'ancien protocole rejoué s'arrête à 1 appel.
- **58** : NUL explicite écrit et **comparé** champ par champ ; `{}`/`null`/champ absent = inconnu →
  inventaire refusé, `prouvee:false`.
- **59** : `validerArchive` avant toute mutation (tables, index+fichiers, inventaire) → code 2 sans
  toucher la cible ; la phase médias ne dépose jamais un fichier hors index ou divergent.

| Preuve | Commande | Résultat |
|---|---|---|
| pagination à 2 501 objets (plafond 1 000), total inconnu, non-progression, total changeant, reproduction avant | `node --test tests/unit/sauvegarde-medias.test.mjs` | 9/9 [simu] |
| verdicts purs (NULL vs B divergent, `{}` refusé) | `node --test tests/unit/reprise-verdicts.test.mjs` | 30/30 [simu] |
| vraies phases : index AAA / disque BAD / cible AAA → cible **intacte** ; NULL rendu et vérifié ; `{}` → indéterminé | `node --test tests/unit/restaurer-phases.test.mjs` | 13/13 [simu] |
| vérificateur, restauration | `node --test tests/unit/sauvegarde-verifier.test.mjs tests/unit/restaurer-donnees.test.mjs` | 28/28 |

**Non fait, et dit** : le cycle sauvegarde → altération → restauration → relecture sur projet Supabase
jetable (RES-14). Accès nécessaire : un projet Supabase **distinct de la production** (ref 20
lettres), `migration_proprietaires_objets_stockage` appliquée dessus, et le jeton personnel
`sbp_…` (jamais `service_role`). `restaurer-donnees.js` refuse la production par construction.

### C.3 ASTRA-61/62/63/64 — chemin de livraison · commits `9ec69134`, `b7a2d4da`, `68103b91`

- **61** : preuve de revue = **APPROVED** uniquement ; relecteur ≠ auteur de la PR (auteur illisible =
  non vérifiable) ; relecteur dans `.passio/migrations/relecteurs-autorises.json` (vide = personne) ;
  fournisseur **fictif** (`PASSIO_GH_BIN`, `PASSIO_DEPOT`) refusé sur cible protégée par
  `appliquer-migration` et `attester-migration`. `barriere-migration.test.mjs` 17/17.
  ⚠️ La liste est **vide** : le dépôt n'a qu'un collaborateur (PASSIO74) — RES-15, à trancher avant
  la première migration.
- **62** : nom du secret insensible à la casse ; mappings YAML sans prototype (`__proto__` visible),
  clé en double = erreur ; échappements bornés (`s`, `\x73`, `\_` → rouge) ; déclencheur
  inconnu = concerné ; `secrets: inherit` = référence. Workflows réels relus : aucun workflow
  réutilisable, aucun `inherit`. `audit-cle-production.test.mjs` 12/12 ; gate verte sur le dépôt.
- **63** : lecteur statique borné (`of`, `partition of`, `set schema`, DDL dans `do`/fonction, SQL
  construit → indéterminé = rouge) ; **catalogue de la base construite** (`tables-compte-catalogue.js`,
  requête lecture seule, nom OU FK vers `auth.users`) ; banc [PG] `tables-compte-catalogue.test.sh`
  **18/18** (trois formes fuyantes construites puis vues ; socle couvert ; mutation).
- **64** : **retenue mécanique** — `edge-functions.yml` lit la cible en `read only`
  (`verifier-prerequis-fonctions.mjs`, manifeste `.passio/deploiement/prerequis-fonctions.json`)
  **avant** `supabase functions deploy` ; `delete-account` exige la barrière **v3** ; absent → job
  rouge, rien n'est déployé, la migration est nommée. Banc [PG] `prerequis-fonctions.test.sh`
  **18/18** (sans migration → retenue ; v2 seule → retenue ; v3 → autorisé ; lecture seule prouvée).
  Compatibilité de l'ordre inverse : la migration v3 **avant** la fonction — le code servi (v1) ne
  peut plus écrire le marqueur (INSERT révoqué) et continue en « mode sans barrière », c'est-à-dire
  l'état actuel (`sequences-mise-en-service` A).
- **Révision servie** : `X-Passio-Revision` sur toute réponse des quatre fonctions ; la CI écrit le
  SHA dans le bundle et la fumée exige l'égalité ; `release.json` porte déjà le commit du site.

### C.4 Périmètre · commits `27e01724`, `f897e133`, `55d45de7`

- Appels désactivés (§B) : `appels-desactives-pilote.spec.js` + 4 suites armées : **21/21** [nav].
- Mentions : ON CONFLICT gardé par destinataire + préfixe `n_m_` réservé au serveur ; banc [PG]
  § ⑤ bis (identifiant préexistant à un autre destinataire avant ON CONFLICT) : **37/37**.
- Notifications à texte client (like/comment/event_*) : conservées (chemin validé, plafonné, bloqué,
  échappé) — RES-16, P2.

### C.5 Suites globales sur le candidat

| Contrôle | Commande | Résultat | Preuve |
|---|---|---|---|
| unitaires | `node --test "tests/unit/*.test.mjs"` (JQ_BIN) | **323 / 323**, exit 0 | `unit-tous.txt` |
| gates statiques | `npm run verif` (worktree LF) + gates individuelles (handlers, globals, échappement, isolation, tests creux, télémétrie, clé de production, tables de compte, registre) | vertes ; `audit-supa-stub` et `generer-ouverture` rouges **uniquement** en checkout CRLF (env.) | §C en-tête |
| bancs SQL neufs/modifiés | barrière 88, en-vol 11, séquences 23, catalogue 18, prérequis 18, notifications 37 | tous verts, exit 0 | `astra56-barriere-v3.txt`, `astra41-en-vol.txt`, `sequences.txt`, `tables-compte-catalogue.txt`, `prerequis-fonctions.txt`, `migration-notifications-serveur.txt` |
| navigateur, projet `local` complet | `npx playwright test --project=local` | 1 579 passés, 15 rouges de charge → 146/147 rejoués seuls ; 1 préexistant (§C.6) | `e2e-local-tous.txt`, `e2e-rouges-rejoues.txt` |
| registre des résidus | `node scripts/audit-registre-residus.js --ci` | vert (17 résidus) | |
| build de production | `node scripts/build.js <tmp>/index.html` | OK | |
| lecture publique de la cible | `node scripts/controle-cible-pilote.mjs --public` | site = `a5e8c717` ; fonctions **sans** en-tête (version non vérifiable) | `cible-public-avant.txt` |

Non exécuté : `test:prod` (comptes réels : interdit hors CI par le mandat ; la CI de la PR le joue
sur le **staging**), bancs SQL antérieurs non modifiés (verts en CI le 15/09 ; 5 rouges locaux
d'environnement identiques à `main`), artefact `dist/` de la CI (job « Gates artefact »).

### C.6 Résultat de la suite navigateur complète

`npx playwright test --project=local` sur `55d45de7` (les trois commits suivants ne touchent que
docs, scripts de contrôle et registre — aucun code client) : **1 579 passés, 15 rouges, 6 ignorés,
32,4 min, exit 1** (`e2e-local-tous.txt`). Les 13 fichiers rouges **rejoués seuls, 1 worker**
(`e2e-rouges-rejoues.txt`) : **146 / 147** — quatorze rouges étaient la charge (timeouts, ralentissement
processeur non effectif, requêtes croisées). Le dernier, `reprise-lectures-boot ⑪` (« transitoire
prouvé est warn », reçu `info`), est **identique sur le candidat d'intégration `26ffb00f` sans
cette reprise** (`e2e-reprise-lectures-boot-sur-26ffb00f.txt`) et **vert en CI** sur #476 (run
35020434665, six lots navigateur verts) : préexistant, environnemental. Aucune suite n'a été
réécrite pour passer. La CI de la PR du candidat rejoue les six lots : c'est elle qui fait foi.

## D. Blocages restants

1. **RES-15 — aucun relecteur autorisé** : sans un second compte GitHub approuvant la PR, aucune
   migration ne peut être attestée pour la production (la barrière refuse l'auto-revue et le
   fournisseur fictif). Décision de gouvernance, pas de code.
2. **RES-14 — cycle réel de sauvegarde/restauration non joué** : sans projet jetable, la
   restauration est **testée** (vraies phases, services simulés) mais pas **répétée**. Ce n'est pas
   un blocage de l'ouverture (la restauration est un outil de reprise, pas un parcours utilisateur),
   c'est un blocage de la **promesse de reprise**.
3. **État de la cible non mesuré en base** : journal des migrations, permissions effectives, version
   des fonctions (aucun en-tête aujourd'hui). Les requêtes en lecture seule sont prêtes
   (`controle-cible-pilote.mjs --sql`) ; il faut le connecteur en lecture seule ou l'éditeur SQL.

Aucun autre blocage n'est connu sur le candidat. Le reste (RES-02 rétention non planifiée, RES-05
télémétrie de version, RES-13 appels, RES-16, RES-17) est suivi avec responsable, action, échéance.

## E. Procédure exacte de mise en service, de vérification et d'arrêt

Prérequis : RES-15 tranché (relecteur inscrit par PR, approbation réelle du candidat) ; fenêtre hors
pic ; sauvegarde **complète** (`npm run sauvegarde -- --avec-medias --avec-comptes`, puis
`--verifier` → COMPLÈTE) ; lecture de l'état initial (`controle-cible-pilote.mjs --sql`, résultats
dans un dossier, `--json <dossier>`).

| # | Geste | Outil / preuve | Effet attendu | Retour arrière |
|---|---|---|---|---|
| 0 | Mesurer la cible (lecture seule) | `--sql` → connecteur read-only → `--json` | fiche « appliquée / non » par migration ; version servie | — |
| 1 | Appliquer `migration_barriere_suppression_2026-09-15.sql` (**v3**) | `npm run migration:appliquer -- migrations/… --projet njkiyoklssvefstljemx` (exige l'attestation + approbation réelle) ; relire le verdict **en base** | 14 lignes OK ; `tentative_vivante` présente ; code servi (v1) inchangé = état actuel | idempotente ; inverse dans l'en-tête (drop des fonctions/trigger) — **non destructif des données** |
| 2 | Appliquer `migration_objets_stockage_compte`, `migration_proprietaires_objets_stockage`, `migration_export_instantane`, `migration_notifications_serveur` **si** l'étape 0 les montre absentes | idem | RPC présentes ; export instantané ; mentions serveur | chacune porte son inverse (fonctions, policies) ; aucune donnée supprimée |
| 3 | **Fusionner** la PR du candidat dans `main` (squash ou merge, SHA noté) | GitHub | `deploy.yml` : tests, build, **site** ; `edge-functions.yml` : **retenue** (lit la cible) puis déploie les 4 fonctions avec `X-Passio-Revision = SHA` | site : rollback Netlify (`npm run rollback:netlify`) ; fonctions : redéployer le SHA précédent via `workflow_dispatch` sur `main` antérieur |
| 4 | Vérifier | `controle-cible-pilote.mjs --public --attendu <SHA>` ; `--json` ; **suppression authentifiée d'un compte jetable** → 200 + `garantie:"barriere"`, relectures à zéro ; second appel concurrent → 409 ; export d'un compte jetable → `instantane` non nul ; une mention synthétique → ligne serveur | tout vert | si un contrôle est rouge : **arrêt**, pas d'étape suivante |
| 5 | Ouvrir (§F) à un petit nombre, observer 7 jours : `client_errors`, traces `suppression_compte`, `call_ignore_pilote`, `mentions_serveur_absente`, plafonds | pilotage (`dashboard/`), lecture seule | — | fermer = remettre le rideau (`passio_gate_actif` côté client n'est pas un kill-switch serveur : l'arrêt réel = rollback Netlify vers une version « rideau ») |

Si l'étape 1 n'est pas faite, la fusion (étape 3) **ne déploie pas** `delete-account` (retenue) : le
site part, la fonction reste v1 = état actuel, et le job est rouge en le disant.

## F. Diffusion gratuite

- **Lien web** : https://passio-app.netlify.app (rideau levé depuis le 2026-09-11 ; inscription
  avec e-mail confirmé, 18+, CGU).
- **Installation PWA** : depuis le site — Android/Chrome : menu ⋮ → « Installer l'application » ou
  la bannière ; iPhone/Safari : Partager → « Sur l'écran d'accueil ». Le service worker met à jour
  les anciens clients au prochain cycle (`release.json` = commit servi).
- **Texte d'invitation à copier** (aucun message n'a été envoyé) :

> Salut ! J'ouvre PASSIO à quelques personnes, gratuitement : un réseau pour partager ses passions et
> rencontrer des gens autour d'elles. C'est une version pilote : la messagerie, les photos et les
> vocaux marchent ; les appels ne sont pas encore disponibles. Tu peux installer l'app depuis le
> site (menu → Installer / Sur l'écran d'accueil). Si quelque chose coince, dis-le-moi ou utilise
> « Feedback & aide » dans les réglages. → https://passio-app.netlify.app

- Dans l'app, « Inviter des amis » (Réglages → Support) copie un lien suivi.

## G. Recommandation

**Non prêt aujourd'hui, prêt après deux gestes qui ne sont pas du code** :

1. **RES-15** — désigner et inscrire un relecteur GitHub distinct de l'auteur, puis obtenir son
   approbation réelle sur la PR du candidat : sans cela, la migration barrière **v3 ne peut pas
   être appliquée** par le canal outillé, et `delete-account` reste **v1** en production (suppression
   non garantie — le défaut ASTRA-42/56 vivant sur la cible).
2. **Étape 0** — mesurer la cible en lecture seule (journal, prérequis, catalogue, RLS) avec les
   requêtes prêtes.

Une fois ces deux points faits, le candidat est prêt pour un **pilote gratuit restreint** (une
première vague de quelques dizaines de comptes), avec les appels désactivés, la suppression de compte
garantie par la barrière v3 et vérifiable par `X-Passio-Revision`, et une restauration **testée mais
non répétée** sur un vrai projet (RES-14, à faire pendant la première semaine, avant élargissement).
Ce n'est pas une promesse de fiabilité absolue : c'est ce que les preuves ci-dessus couvrent, et
rien de plus.
