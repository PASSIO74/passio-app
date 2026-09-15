# Contre-reprise de la cinquième contre-revue Astra — dossier de livraison (2026-09-15)

> **Mandat** : corriger les défauts confirmés ASTRA-39 → ASTRA-55 (et les chantiers ASTRA-23/24),
> renforcer les preuves, préparer un candidat d'intégration pour une nouvelle contre-revue.
> **Interdits respectés** : aucune fusion dans `main`, aucune migration en production, aucune
> donnée réelle touchée, aucun redéploiement d'Edge Function, aucun déploiement du site, aucun
> test de charge contre la production. Toutes les branches poussées sont des `claude/astra5-*`
> avec PR vers `main` ; le seul chemin qui emporte la clé de production (`deploy.yml`, job
> « Déploiement production ») est gardé par `github.event_name == 'push'` (vérifié par la gate
> `audit-cle-production`, réécrite dans ce mandat, §A ASTRA-52).
>
> **Convention** : « non mesuré » = aucune preuve n'existe ; une explication plausible n'en
> tient pas lieu. Les quatre états sont séparés : `corrigé` (code écrit) · `testé` (preuve
> jouée, avec sa nature) · `déployé` (en service sur la cible) · `relu sur cible` (observé
> après mise en service).

## 0. État de référence — écart constaté, et ce qu'il change

| Attendu par le mandat (§1) | Constaté à l'ouverture (lecture GitHub, 2026-09-15 ~17:40Z) |
|---|---|
| `main` = `bd837e9bd6e4a0a5cd7f69bb88b3a59a0354ccef` | `main` = **`a5e8c717`** (« Intégration finale de la reprise Astra — les six lots restants », **#468**, fusionné 17:28Z par PASSIO74) |
| dix-sept PR ouvertes, non fusionnées | **toutes fermées** : #451, 452, 453, 456, 457, 459, 460, 461, 465, 466 fusionnées 16:45–17:11Z ; #454, 455, 458, 463, 464, 467 fermées et reprises par #468 |
| aucune migration appliquée | **non mesuré** (aucun accès à la cible ; le journal `migrations_appliquees` vit dans la base) |
| aucune fonction redéployée | les runs CI de `86b372da`, `c42616ac` et `a5e8c717` ont **redéployé les Edge Functions et le site** (jobs verts, lus sur GitHub) |

Ces fusions et déploiements ne sont **pas** de cette session (une autre session Claude locale,
« passio-ce », en est l'auteur probable). Conséquence opérationnelle, écrite au registre
(**RES-10**, P1) : la production sert le code des dix-sept PR **sans que l'on sache** si les cinq
migrations du 2026-09-15 (`broadcast_bloque`, `inscription_identifiants_figes`,
`proprietaires_objets_stockage`, `barriere_suppression` v1, `canal_appel_lie`) sont appliquées.
En particulier `delete-account` v1 tourne en « mode sans barrière » (ASTRA-42 **vivant** sur la
cible, **RES-01**). Tout le travail ci-dessous part de `a5e8c717` ; les lectures « au SHA
examiné » ont été faites sur les têtes de PR citées par Astra quand elles différaient.

## A. ASTRA-39 → ASTRA-55 : verdicts, causes, corrections, preuves

Colonnes : **Verdict** (confirmé / partiel / contredit) · **Cause** · **PR / SHA** · **Test avant → après** (nature de la preuve entre crochets : [statique] lecture, [simu] doubles JS, [PG] PostgreSQL 17.6 réel jetable, [nav] Chromium réel, [distant] mesure sur la cible) · **Mutation** (régression réinjectée, détectée ?) · **Limites**.

| Id | Verdict | Cause | PR / SHA | Avant → après | Mutation | Limites restantes |
|---|---|---|---|---|---|---|
| **ASTRA-39** périmètre de la barrière | **confirmé** | la migration v1 durcissait une liste écrite à la main (41 couples) ; `client_errors`, `analytics_events`, `telemetry_events`, `passion_quotas` manquaient ; le verdict SQL relisait la même liste | #469 `7bdb8f3d` | [PG] `migration-barriere-suppression.test.sh` : socle **dérivé de `TABLES_COMPTE`** (node) — avant : 4 tables sans policy ni trigger ; après : 52/52, chaque couple porte la clause de policy ET le trigger `zz_barriere_suppression` (toutes rôles, y compris `anon` et un trigger SECURITY DEFINER tiers `follows_notifier`) | [PG] retirer une table de la liste → le banc rougit (couverture indépendante) | la liste des tables reste dans le dépôt : une table créée **hors dépôt** n'est vue par personne (dit dans `audit-tables-compte`) |
| **ASTRA-40** deux purges retirent leur protection mutuelle | **confirmé** (rejoué : A échoue tard, B pose, A retire, écriture, B « ok ») | une ligne par `user_id`, retrait inconditionnel | #469 | [simu] `purge-compte.test.mjs` ⑤ : avant rouge → après : `reclamer_suppression` (verrou consultatif + statut + **jeton**), `terminer_suppression(jeton)` conditionnel (`jeton_perime` sinon), échec de `deleteUser` après purge → 500 `auth_non_supprime`, protection **conservée**, `donnees_purgees:true` ; [PG] 52/52 dont « J2 ne retire pas la protection de J1 » | [PG] « terminer sans vérifier le jeton » → rouge ; [simu] 5 mutations JS (`lot1-mutations-js.txt`) | reprise après `auth_non_supprime` = nouvelle tentative (réclamation d'une tentative morte, bancée) ; jamais joué contre GoTrue réel |
| **ASTRA-41** écriture déjà engagée | **confirmé sur PostgreSQL réel** (Astra ne l'avait pas rejoué) | prédicat STABLE + comptages ne voient pas une transaction ouverte avant la marque | #469 | [PG] `ecriture-en-vol-suppression.test.sh`, **deux connexions** (S1 coprocess persistant, S2 one-shot), synchronisation par `select '__FIN__'` et `pg_locks` — **avant** (`astra41-avant.txt`) : S1 insère puis reste ouverte, purge = 0 ligne visible, S1 valide, **1 ligne survit** ; **après** : `attendre_ecritures_en_vol(p_max_ms)` (candidats = `xip` ∪ `[xmax, xid courant)` filtrés par `pg_xact_status = 'in progress'`, 50 ms de pas) attend S1 → la ligne est effacée, 11/11 | [PG] « ne regarde pas les xids » → rouge ; [simu] « attente sautée » → 3 rouges | la barrière ne couvre pas une transaction qui **dure plus** que `ATTENTE_EN_VOL_MS` (5 s) : la purge répond 409 `en_vol` et **ne purge pas** (dit) ; `en_vol` compte aussi les sous-transactions |
| **ASTRA-42** mode sans barrière annoncé comme succès | **confirmé** (jusqu'à l'UI : `doDeleteAccount` acceptait `ok:true`) | notes jetées par le handler ; UI sans exigence | #469 | [simu] `suppression-compte.test.mjs` 8 : infra absente → **503** `infrastructure_absente`, jamais 200 sans `garantie:"barriere"` ; [nav] `suppression-compte-verdict.spec.js` ⑥⑦ : `ok:true` sans garantie → rien n'est annoncé ni purgé ; corps non-2xx lu dans `error.context` | [nav] retirer l'exigence `garantie` → ⑥ rouge | **la production sert encore v1** (RES-01) ; rétention : `purger_marqueurs_suppression` non planifiée (RES-02) |
| **ASTRA-44** export sans instantané | **confirmé** (rejoué [simu] : 1 001 lignes, omission d'une ligne permanente, `complet:true`) | pagination par clé sans instantané | #470 `ab3c4df0` | [PG] `migration-export-instantane.test.sh` 17/17 : `export_compte_instantane` STABLE SECURITY DEFINER, `pg_current_snapshot()` renvoyé ; S2 modifie une table déjà lue et une table à lire **pendant** l'export (verrou consultatif, `pg_locks`) → l'export rend l'état de la prise ; [simu] `export-compte.test.mjs` 14 : repli par pages **jamais** `complet` ; [nav] `export-donnees.spec.js` ② ter : « Export complet » exige `instantane` | [PG] fonction remise VOLATILE → rouge ; [simu] 5 mutations (`lot2-mutations-js.txt`) | plafond 5 000 lignes/table (dit `tronque`) — RES-03 ; migration non appliquée : la cible fait le repli |
| **ASTRA-45** inventaire des propriétaires incomplet | **confirmé** (plafond simulé 1 000 → 1 objet sans propriétaire, « prouvée ») | un seul appel RPC, pas de rapprochement | #471 `0960d778` | [simu, vraie `exporterMedias`] `sauvegarde-medias.test.mjs` : pagination `Range` par 500, avance du nombre reçu, arrêt sur `≠206`/vide ; couverture **explicites / nuls / nonReleves / indisponible** ; manifeste `proprietaires_inventaire`, fichier versionné `passio-proprietaires/1` + sha256 ; vérificateur : inventaire absent → jamais COMPLÈTE ; restauration : couverture exigée | [simu] 6 mutations (`lot3-mutations.txt`) | plafond réel de PostgREST **non mesuré** ; aucun cycle sur projet jetable (RES-04) |
| **ASTRA-46** refus médias hors verdict | **confirmé** | tableau local, `ctx.bilan` non alimenté | #471 | [simu, vraies phases] `restaurer-phases.test.mjs` 9 : upload refusé et limite refusée → `bilan.refus`, `prouvee:false`, sortie 1 cohérente JSON/affichage/code | [simu] « refus gardés en local » → 2 rouges | — |
| **ASTRA-47** suspension expirée acceptée | **confirmé** | comparaison `banned_until > maintenant` | #471 | [simu] `reprise-verdicts.test.mjs` : `suspensionRestauree` compare les **bornes** (± 5 min) ; comptes déjà présents : relus puis `PUT ban_duration`, relecture ; mutation d'Astra « ban non transmis » **rouge** (`restaurer-phases` ⑦) | oui, celle d'Astra | tolérance fixée à 5 min (justifiée : dérive d'horloge + durée du POST) |
| **ASTRA-48** owners illisible → vide conforme | **confirmé** | `catch → {}` | #471 | [simu] `lireInventaireProprietaires` strict (format, empreinte sha256, structure) ; illisible = **indéterminé**, sortie 1 | [simu] remettre `{}` → rouge | — |
| **ASTRA-55** média absent de l'archive | **confirmé** | attendu reconstruit depuis le disque, `enTrop` hors `ok` | #471 | [simu] `_storage_index.json` (taille, md5) + `integriteArchive(ctx)` au moment de la restauration ; `verdictMedias` : `enTrop` ∈ ok, index absent = indéterminé | [simu] index ignoré → rouge | — |
| **ASTRA-43** rejet tardif après purge | **confirmé** (portée d'Astra retenue : résurrection, pas envoi sous B) | `catch` sans contexte | #472 `ca777b23` | [nav] `file-messages-par-compte.spec.js` ⑪⑫ + `message-media-echec` : contexte `{generation, auteur}` porté par **toutes** les continuations (catch, transitoire, transfert ×3, média app-09) ; avant : 2 rouges (`astra43-avant.txt`) | [nav] retirer `_outboxContextePerime` → rouge | — |
| **ASTRA-49** `ready` perdu | **confirmé** avec les vrais gestionnaires et un bus qui ne livre qu'aux abonnés | broadcast éphémère, `ready` unique | #472 | [nav, vrai `RTCPeerConnection`] `appel-reponse-rejouable.spec.js` 4 : `ready` répété (1 s) jusqu'à l'offre, offre créée une fois et rejouée, réponse rejouée ; avant : 4 rouges (`astra49-50-avant.txt`) | [nav] ne plus répéter → rouge | la **préparation séparée de la sonnerie** (serveur) reste à faire — **RES-06**, traitable (dépend de `call_invites`, déclarée) |
| **ASTRA-50** panne réseau = refus | **confirmé avec le SDK réel 2.116.0** (formes mesurées : transport → `status 0`, `code ""`, « Failed to fetch » ; 503 HTML sans code ; 429 `PGRST000` ; 403 `42501` ; 401 `PGRST301` ; 404 `PGRST205`) | tout `error` ≠ table absente = refus | #472 | [simu sur SDK réel, vm] `appel-verdict-invitation.test.mjs` 3 ; [nav] : transport → l'appel continue, 503 transitoire, 42501 refus | [simu] classer 42501 par le statut → rouge | classification = ensemble fermé ; forme inconnue = `echec` (jamais refus) |
| **ASTRA-51** attestation déclarative | **confirmé** (rejoué : attestation tapée → « envoyable ») | aucun lien avec une revue | #473 `1098a4d2`→`fc11cb87` | [simu + CLI réel] `barriere-migration.test.mjs` 17 : preuve = revue GitHub **APPROVED/COMMENTED**, `commit_id` = SHA attesté, marqueur « Contre-revue technique indépendante », fichier et `cible: <ref>` dans le corps, `user.login` = relecteur ≠ auteur de la PR, **contenu au commit** = attesté = envoyé (`gh api`) ; sans `gh` → refus | oui (chaque condition retirée → refus) | vérification **en ligne** obligatoire (RES-09) |
| **ASTRA-52** faux verts de la gate EXP-11 | **confirmé** : les six variantes d'Astra passaient (`astra52-avant.txt`) | regex sur du texte | #473 | [statique, gate réelle] `audit-cle-production.test.mjs` 9 : lecteur YAML **fermé** (`yaml-workflow.js` : ancres/alias/tags/multi-doc → erreur), expressions `if` = ensemble fermé (conjonction avec `event_name == 'push'` ou `!= 'pull_request'` [+ `pull_request_target` si écouté]), `secrets[...]`, `toJSON(secrets)`, `${{ secrets }}` ; rapport des workflows appelés, actions composites, secrets hérités/transmis | [statique] réinjection sur `deploy.yml` réel : `if:` retirés → rouge ; `\|\| true` → rouge | ce que GitHub exécute au-delà du texte (workflow appelé, action) est **nommé, pas certifié** |
| **ASTRA-53** faux `gh` ignore `jq` | **confirmé** (mutation « 0 » : 7/7 verts) | le faux calculait en JS | #473 | [simu + **jq réel**] `sentinelle-taille-pr.test.mjs` : le faux `gh` exécute l'expression `--jq` reçue ; mutation → **5 rouges** (`astra53-mutation.txt`) | oui, celle d'Astra | dépend de `jq` sur le poste (`JQ_BIN`) et sur le runner |
| **ASTRA-54** gate des tables aveugle | **confirmé** (`ALTER TABLE ADD`, `"public"` cité) | parseur `CREATE TABLE` seul | #473 | [statique] `schema-resultant.js` rejoue create/alter add/drop/rename/drop table ; `audit-tables-compte.test.mjs` 11 ; **trouvaille réelle** : `telemetry_events.auth_uid` manquait → ajoutée à la purge, à la barrière, exclue de l'export (RES-12) | [statique] rejouer sans ALTER → rouge | tables créées hors dépôt : hors portée (dit) |

**Contestations / nuances envers Astra** — (1) ASTRA-41 : l'objection était statique ; elle est
**vraie** et maintenant rejouée sur PostgreSQL réel — mais le protocole d'attente ne peut pas être
« attendre le commit » sans borne : au-delà de 5 s, la purge **refuse** (409 `en_vol`) au lieu de
purger à moitié. (2) ASTRA-43 : la portée retenue est celle qu'Astra a écrite (résurrection après
purge, pas envoi sous B) — les tests l'affirment tel quel. (3) ASTRA-50 : les formes de réponse
ne sont plus supposées : elles ont été **mesurées** contre le SDK embarqué (`astra50-formes-sdk.txt`),
y compris 503 HTML sans code, qu'Astra n'avait pas listé. (4) ASTRA-52 : les variantes restent
synthétiques (aucun incident réel) — dit tel quel dans le test et la gate.

## B. ASTRA-21 → ASTRA-38 et EXP-11 : reclassement en quatre états

Tout est **corrigé dans le code** (fusionné dans `main` `a5e8c717` par #468 et les PR individuelles,
hors de ce mandat). « Déployé » distingue le **code servi** (site + Edge Functions, redéployés par
les runs CI du 2026-09-15) de la **migration appliquée** (jamais mesurée). « Relu sur cible » :
**non mesuré partout** — aucune observation post-déploiement n'a été faite par cette session.

| Id | Sujet | PR | corrigé | testé | déployé | relu sur cible | Suite (ce mandat) |
|---|---|---|---|---|---|---|---|
| ASTRA-21 | réponse tardive sous B | #452 | oui | oui [nav] | oui (site) | non mesuré | complété par ASTRA-43 (#472) |
| ASTRA-22 | broadcast contournait le blocage | #453 | oui | oui [PG] | code oui · **migration `broadcast_bloque` : non mesuré** | non mesuré | nuance acceptée (registre) |
| ASTRA-23 | canal d'appel ouvert à tous | #465 | oui | oui [PG][nav] | code oui · **migration `canal_appel_lie` : non mesuré** | non mesuré | contrat de transition + garde (#474) ; RES-05, RES-08 |
| ASTRA-24 | push non fermée | #466 | partiel (l'événement était réduit, pas le texte) | oui | code oui (`notify-call` redéployée) | non mesuré | **chantier serveur livré** (#474) : mentions par ids, texte dérivé, `origine` ; RES-07 |
| ASTRA-25 | écriture après comptage | #464 → #468 | oui (v1) → **v2** | oui [PG] | **v1 en service sans migration = mode sans barrière (RES-01)** | non mesuré | remplacé par #469 |
| ASTRA-26 | propriétaire Storage ne voyageait pas | #463 → #468 | oui | oui [simu] | code oui · **migration `proprietaires_objets_stockage` : non mesuré** | non mesuré | complété (#471) ; nuance acceptée : la restauration RELIT |
| ASTRA-27 | table neuve oubliée | #458 → #468 | oui | oui | oui (gate) — mais la gate **ne tournait pas en CI** (RES-11) | sans objet | gate résultante (#473), CI (#473) |
| ASTRA-28 | export sans ordre total | #457 | oui | oui | oui (fonction) | non mesuré | instantané (#470) |
| ASTRA-29/30/31/32 | verdicts de reprise | #455 → #468 | oui | oui [simu] | sans objet (scripts) | non mesuré (aucune reprise jouée sur cible) | complétés (#471) ; RES-04 |
| ASTRA-33 | barrière des gestes critiques | #451 | oui | oui | sans objet (outil) | sans objet | preuve de revue (#473) |
| ASTRA-34 | taille Sentinelle contournée | #454 → #468 | oui | oui (mais faux `gh`) | oui (workflow) | non mesuré | vrai `jq` (#473) |
| ASTRA-35 | déplacer une inscription | #460 | oui | oui [PG] | code oui · **migration `inscription_identifiants_figes` : non mesuré** | non mesuré | — |
| ASTRA-36 | suppression d'activité | #461 | oui | oui | oui | non mesuré | nuance acceptée |
| ASTRA-37 | banc de charge | #459 | oui | oui | sans objet | sans objet | nuance acceptée ; aucun plafond établi |
| ASTRA-38 | « suspension levée » sans relecture | #456 | oui | oui | oui | non mesuré | — |
| EXP-11 | clé de production dans les runs de PR | #467 → #468 | oui | **faux verts** de la gate (ASTRA-52) | oui (`deploy.yml`) | **non mesuré** (aucune lecture des runs passés pour prouver l'absence de fuite) | gate réécrite (#473) |

**Aucune fermeture opérationnelle** n'est prononcée : aucune ligne n'a ses quatre états à « oui ».

## C. Preuves — environnement, commandes, natures, limites

**Poste** : Windows 11 Pro, Git Bash ; Node **24.16.0** ; PostgreSQL **17.6** (binaires EDB, `initdb --locale=C`, serveur jetable par banc, `pg_ctl` sur socket local) ; Playwright **1.60.0** + Chromium 1223 (projet `local`, `http-server`) ; `jq` **1.7.1** ; supabase-js **2.116.0** vendu (`js/vendor/`). Worktrees `C:\Users\BENJAMIN\Desktop\PASSIO-wt\<lot>\` (CRLF local, LF poussé). Sorties conservées dans `PASSIO-wt\preuves\` (hors dépôt) et citées ci-dessous par nom.

| Preuve | Commande (racine du worktree) | Nature | Sortie / limite |
|---|---|---|---|
| ASTRA-41 avant/après | `bash tests/sql/ecriture-en-vol-suppression.test.sh` (migration au SHA `a5e8c717` puis v2) | [PG] 2 connexions | `astra41-avant.txt` (1 ligne survit), `astra41-apres.txt` 11/11 |
| barrière v2 | `bash tests/sql/migration-barriere-suppression.test.sh` | [PG] | 52/52, 3 mutations (`astra39-40-barriere-apres.txt`) |
| purge / suppression JS | `node --test tests/unit/purge-compte.test.mjs tests/unit/suppression-compte.test.mjs` | [simu] faux admin partagé `tests/unit/lib/faux-admin-purge.mjs` | 21 + 8 ; 5 mutations (`lot1-mutations-js.txt`) |
| UI suppression | `npx playwright test --project=local tests/e2e/suppression-compte-verdict.spec.js` | [nav] | 7/7 |
| export | `bash tests/sql/migration-export-instantane.test.sh` ; `node --test tests/unit/export-compte.test.mjs` ; e2e `export-donnees.spec.js` | [PG][simu][nav] | 17/17 (`astra44-sql-apres.txt`), 14/14, 7/7 ; avant : `astra44-avant.txt` |
| sauvegarde / restauration | `node --test tests/unit/reprise-verdicts.test.mjs tests/unit/sauvegarde-verifier.test.mjs tests/unit/restaurer-phases.test.mjs tests/unit/sauvegarde-medias.test.mjs` | [simu] vraies phases, faux `fetch` routé par texte SQL / chemin | 28 + 16 + 9 + 3 ; 6 mutations (`lot3-mutations.txt`) — **aucun service réel** |
| files / appels | e2e `file-messages-par-compte`, `message-media-echec`, `appel-reponse-rejouable` ; `node --test tests/unit/appel-verdict-invitation.test.mjs` | [nav] vrai `RTCPeerConnection` ; [simu] SDK réel en `vm` | avant : `astra43-avant.txt`, `astra49-50-avant.txt` ; formes : `astra50-formes-sdk.txt` |
| gouvernance | `node --test tests/unit/audit-cle-production.test.mjs tests/unit/sentinelle-taille-pr.test.mjs tests/unit/audit-tables-compte.test.mjs tests/unit/barriere-migration.test.mjs` (`JQ_BIN` sur Windows) | [statique][simu + jq réel + CLI réel] | 9 + 5 + 11 + 17 ; `astra52-avant.txt`, `astra53-mutation.txt`, `astra51-avant-apres.txt` |
| mentions / push / transition | `bash tests/sql/migration-notifications-serveur.test.sh` ; `node --test tests/unit/lien-metier.test.mjs` ; e2e `mention-serveur`, `appel-canal-refuse` | [PG][simu][nav] | 31/31, 23, 3/3 + 3/3 ; avant : `astra24-avant.txt` (3 rouges) |
| registre des résidus | `node scripts/audit-registre-residus.js --ci` ; `node --test tests/unit/registre-residus.test.mjs` ; `cd dashboard && node --test test/residus.test.js` | [statique] + sous-processus réels | 9/9, 5/5 ; **rouge réel sur le SHA combiné** (`residus-integration-avant.txt`) puis vert après réexamen |

**Ce qui n'a pas été fait, et pourquoi** : aucune mesure distante (pas de jeton, interdit par le
mandat) ; aucun projet Supabase jetable (Storage, GoTrue, Realtime) — les phases de reprise et le
comportement Realtime sont simulés (RES-04, RES-08) ; les données sont synthétiques (uuid fixes
`aaaa…`, `bbbb…`, comptes « Léa », « Bruno »).

## D. Intégration — SHA combiné, conflits, contrôles

Branche **`claude/astra5-integration`**, base `a5e8c717`, fusions `--no-ff` dans l'ordre de
dépendance : lot 1 (#469) → lot 6 (#473, empilé) → lot 2 (#470) → lot 3 (#471) → lot 4 (#472) →
lot 5 (#474) → lot 7 (#475), puis les correctifs CI de #473 et #474.

- **Un seul conflit** : `js/app-05-config-profil.js`, `_callBindChannelEvents` — commentaire ASTRA-49 (#472) contre l'enveloppe de `subscribe` (#474) : **les deux conservés**, vérifiés par `appel-reponse-rejouable` + `appel-canal-refuse` + suites d'appels (13/13).
- **La gate des résidus a rougi sur le SHA combiné** (RES-11 : `scripts/lib/yaml-workflow.js` apparu avec #473) — c'est le comportement demandé ; le réexamen a été **écrit** (`planifie`, chantier #473) dans un commit d'intégration dédié.
- **Deux rouges CI réels** découverts sur les PR isolées et corrigés : #474 (`audit-supa-stub` prenait `sub` + `.apply` pour un membre de canal) ; #473 (quatre verrous du CLI d'application de migration refusaient sous `GITHUB_ACTIONS` — ils n'avaient jamais tourné en CI).

Contrôles sur le SHA combiné **(voir la fin de cette section pour le SHA exact et les résultats finaux)** : `node --test "tests/unit/*.test.mjs"` ; `audit-cle-production`, `audit-tables-compte`, `audit-registre-residus --ci`, `audit-supa-stub`, `audit-tests-creux`, `audit-tests-isolation` ; les 31 bancs SQL + le banc des **trois séquences de mise en service** (`tests/sql/sequences-mise-en-service.test.sh`, ajouté sur la branche d'intégration : infrastructure de suppression avant la fonction, RPC des propriétaires avant toute archive complète, protocole client compatible avant le resserrement des canaux) ; 10 suites e2e ciblées (58 cas).

### D.1 SHA combiné et résultats finaux

**SHA combiné (code) : `055efdef3dfcaa5fce82891cd3c2cbb43f68a8ec`** — `claude/astra5-integration` (le commit de dossier qui suit ne touche que `.passio/audits/`). Têtes des PR combinées : #469 `7bdb8f3d`, #473 `fc11cb87`, #470 `ab3c4df0`, #471 `0960d778`, #472 `ca777b23`, #474 `d7a2bb97`, #475 `7be5323a`.

| Contrôle | Résultat sur `055efdef` | Preuve |
|---|---|---|
| `node --test "tests/unit/*.test.mjs"` | **301 / 301** | `integration-final-controles.txt` |
| gates : clé de production, tables de compte, registre des résidus, stub hors ligne, tests creux, isolation e2e, globals, handlers, échappement, clés de télémétrie | **toutes vertes** | idem |
| bancs SQL (32, PostgreSQL 17.6) | **27 verts** ; 5 rouges **identiques sur `main` `a5e8c717`** sur ce poste (`python3` absent, extensions `pg_trgm`/`unaccent` absentes du zip EDB, CRLF) et **verts en CI** (run 35017677054, job Audits, bancs nommés et « non nommés : 14, rouges : 0 ») | `integration-bancs-sql-tous.txt`, `bancs-rouges-locaux-main.txt` |
| `tests/sql/sequences-mise-en-service.test.sh` (nouveau) | **23 / 23** | `integration-sequences.txt` |
| e2e ciblés (suppression, export, files, médias, appels ×4, mentions, XSS mentions) | **58 / 58** (Chromium) | `integration-e2e.txt` |
| tests du pilotage (`dashboard/`) | 407 / 409 — les 2 rouges lisent la révision git d'un **worktree** ; verts en CI | — |
| gate des résidus sur le SHA combiné | rouge sur RES-11 **avant** réexamen, verte après | `residus-integration-avant.txt`, `-apres.txt` |

Ce qui n'a **pas** été joué sur le SHA combiné : les 6 lots e2e complets de la CI (≈ 200 suites — la CI de la PR d'intégration les jouera), l'artefact minifié `dist/` (job « Gates artefact production » de la CI).

## E. Mise en service proposée — **une proposition, pas une autorisation**

Prérequis communs : lecture du journal `migrations_appliquees` et des versions servies (RES-10, **étape 0**) ; sauvegarde vérifiée (`sauvegarde-donnees --verifier`, archive COMPLÈTE) ; fenêtre hors pic ; chaque migration passée par `appliquer-migration.mjs` avec preuve de revue (#473).

| Étape | Geste | Prérequis | Clients en cache | Retour arrière | Vérification après |
|---|---|---|---|---|---|
| 0 | **Mesurer** : journal des migrations, versions des trois Edge Functions, `release.json` | aucun | — | — | fiche B mise à jour avec « appliquée / non » par migration |
| 1 | Fusionner #469 + #473 ; **appliquer `migration_barriere_suppression` v2** ; **puis** laisser la CI redéployer `delete-account` v2 | étape 0 ; migration relue (verdict 12/12 sur la cible) | aucun impact client (le message 503/409 est déjà lu par le client d'`a5e8c717`) | v2 est idempotente et rejouable ; retour = ne pas redéployer la fonction (v1 continue en mode sans barrière — l'état actuel) | suppression d'un compte jetable → 200 + `garantie:"barriere"` ; second appel concurrent → 409 ; RES-01 → `deploye: oui` |
| 2 | Fusionner #470 ; appliquer `migration_export_instantane` ; redéploiement d'`export-compte` par la CI | étape 1 (même CI) | ancien client : « export complet » disparaît (il exige `instantane`) — voulu | fonction VOLATILE/absente ⇒ le code fait le repli **partiel** (jamais complet) | export d'un compte jetable : `bilan.instantane` non nul |
| 3 | Fusionner #471 ; jouer une **sauvegarde COMPLÈTE** (RPC des propriétaires déjà déclarée par #468 — appliquée ? étape 0) | RPC `proprietaires_objets_stockage` appliquée | — | scripts seulement | `sauvegarde-donnees --verifier` : archive COMPLÈTE, inventaire complet |
| 4 | Fusionner #472 (client : réponse rejouable, classification, contexte de file) ; **attendre la propagation** du service worker | — | ancien client compatible sous les deux jeux de policies | site : rollback Netlify | traces `msg_file_perimee` = 0 anomalies ; appels : aucun `call_ready_perdu` |
| 5 | Fusionner #474 ; appliquer `migration_notifications_serveur` ; redéploiement de `notify-call` | étape 4 propagée (le client d'#474 porte les ids) | ancien client : ses `mention` sont **refusées** (silence, pas d'erreur visible) ; `follow*` in-app refusés (RES-07) | policy d'INSERT réouverte aux genres réservés (inverse écrite dans l'en-tête) | banc SQL 4 verdicts sur la cible ; une mention synthétique → push avec texte dérivé |
| 6 | **Seulement si étape 0 montre `canal_appel_lie` non appliquée** : l'appliquer **après** mesure de la propagation (RES-05) | client ≥ `45df96c0` propagé (télémétrie de version = chantier RES-05 ; sinon délai ≥ 7 jours, non mesuré) | ancien onglet perd les appels jusqu'au rechargement ; nouveau : message « version périmée » | policy d'avant (inverse dans la migration) ; le nouveau client fonctionne sous les deux | traces `call_canal_refuse` ≈ 0 sur 7 jours |
| 7 | Fusionner #475 (registre) ; `/api/residus` visible dans le pilotage | — | — | — | run CI de `main` : pas « Registre des résidus » vert ; RES-11 → fermé |

Conditions de **retour arrière** globales : toute étape dont la vérification n'est pas obtenue → arrêt, pas d'étape suivante ; les migrations 1, 2, 5, 6 portent leur inverse ou sont neutres ; les fonctions se redéploient par tag précédent.

## F. Prompt pour Astra — sixième contre-revue

Le prompt autonome est dans **`24-PROMPT-ASTRA-SIXIEME-PASSE-2026-09-15.md`** (même dossier), reproduit à l'identique dans le message de livraison.
