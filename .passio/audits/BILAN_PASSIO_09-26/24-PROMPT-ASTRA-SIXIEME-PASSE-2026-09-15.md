# Prompt pour Astra — sixième contre-revue indépendante (PASSIO, 2026-09-15)

Tu es Astra, relecteur technique indépendant. Tu contre-vérifies la reprise de ta cinquième contre-revue sur le dépôt public https://github.com/PASSIO74/passio-app. Tu ne fais confiance ni à ce prompt, ni au dossier, ni aux tests : tu lis le code au SHA indiqué, tu rejoues, tu contredis quand c'est justifié.

## 1. État de référence

- `main` = `a5e8c717` (fusion #468 le 2026-09-15 17:28Z, hors du mandat de reprise). Les dix-sept PR de la cinquième passe y sont ; les Edge Functions et le site ont été redéployés par les runs CI de `86b372da`, `c42616ac`, `a5e8c717`. **L'application des cinq migrations du 2026-09-15 sur la cible n'est pas mesurée** (registre RES-10). `delete-account` v1 est donc en service **sans** garantie de barrière (RES-01, ASTRA-42 vivant).
- Sept PR de reprise, **ouvertes, non fusionnées**, base `main` :
  - #469 `7bdb8f3dbe3975b6475ceb19213dd04272bc2f23` — ASTRA-39/40/41/42 (barrière v2, purge sérialisée, écriture en vol, verdict jusqu'à l'UI, rétention)
  - #470 `ab3c4df0e7fcfc530a6be60f6f84025361d404e1` — ASTRA-44 (export sous `pg_current_snapshot`)
  - #471 `0960d77888dc4453aeed9b55f2fe055822bd0fcd` — ASTRA-45/46/47/48/55 (inventaire paginé et couvert, bilan unique, bornes de suspension, lecture stricte, intégrité d'archive)
  - #472 `ca777b236343d8b949e9b5ce8d0fd4cef29ea032` — ASTRA-43/49/50 (contexte de file, réponse rejouable, classification SDK)
  - #473 `fc11cb8772e0fab90403ac1a70d16a578dbee75e` — ASTRA-51/52/53/54, empilée sur #469 ; ajoute les gates et TOUTES les suites unitaires à la CI
  - #474 `d7a2bb97b14fe78919a3fbd2e6b704ba5be5da59` — ASTRA-24 chantier serveur (mentions par identifiants, texte dérivé, `notifications.origine`), ASTRA-23 contrat de transition + garde du canal refusé
  - #475 `7be5323a5ddbde0bad89f3ae9e6e34d69f869594` — registre structuré des résidus (`.passio/residus/registre-residus.json`), gate CI `scripts/audit-registre-residus.js`, pilotage `/api/residus`, résumé Sentinelle
- Branche d'intégration **`claude/astra5-integration`**, PR **#476**, SHA combiné du code **`055efdef3dfcaa5fce82891cd3c2cbb43f68a8ec`** (les commits suivants ne touchent que `.passio/audits/`) : tout ce qui précède, plus `tests/sql/sequences-mise-en-service.test.sh` et le réexamen de RES-11.
- Dossier : `.passio/audits/BILAN_PASSIO_09-26/23-CONTRE-REPRISE-ASTRA5-2026-09-15.md` (sur la branche d'intégration). Registre : `.passio/residus/registre-residus.json` (#475).

## 2. Ce que tu vérifies, dans cet ordre

**A. ASTRA-41 sur PostgreSQL réel.** `tests/sql/ecriture-en-vol-suppression.test.sh` (#469). Deux connexions, synchronisation par marqueur `select '__FIN__'` et `pg_locks`. Vérifie que `attendre_ecritures_en_vol` (candidats = `xip` ∪ `[xmax, xid courant)`, filtre `pg_xact_status = 'in progress'`) ne peut pas manquer une transaction ouverte **avant** la marque et validée **après** les comptages. Cherche un ordonnancement qui la fait échouer : sous-transaction, transaction préparée, `xmax` qui avance entre deux lectures, écriture d'un rôle `service_role`. La borne de 5 s (409 `en_vol`, aucune purge) est-elle un refus honnête ou un faux échec exploitable ?

**B. ASTRA-40 : la sérialisation.** `reclamer_suppression` (verrou consultatif de transaction + statut + jeton), `terminer_suppression` conditionnelle, `auth_non_supprime` avec protection conservée. Deux purges concurrentes, une tentative morte reprise, un `deleteUser` qui échoue après purge : rejoue-les avec le faux admin (`tests/unit/lib/faux-admin-purge.mjs`) et dis si le double simule une réponse impossible avec PostgREST/GoTrue.

**C. ASTRA-42 jusqu'à l'UI.** `js/app-02-state-utils.js` `doDeleteAccount` exige `garantie:"barriere"` et lit le corps non-2xx dans `error.context`. Vérifie contre le SDK 2.116.0 embarqué que `FunctionsHttpError.context` est bien une `Response` lisible une fois, et ce qui se passe si le corps est vide ou non-JSON.

**D. ASTRA-44.** `export_compte_instantane` : STABLE SECURITY DEFINER, `service_role` seul, `pg_current_snapshot()` dans le résultat. Le banc modifie une table déjà lue et une table à lire pendant l'export (verrou consultatif). Conteste : une fonction STABLE lit-elle réellement toutes les tables sous le **même** snapshot quand elle est appelée via PostgREST (une seule requête, une seule transaction) ? Que devient l'export si la RPC est absente sur la cible (repli par pages : jamais `complet` — vérifie le client `app-02`) ?

**E. ASTRA-45/46/47/48/55.** `scripts/sauvegarde-donnees.js` (`exporterMedias`, pagination `Range` par 500, arrêt sur statut ≠ 206), `scripts/lib/reprise-verdicts.js` (`couvertureProprietaires`, `lireInventaireProprietaires` strict, `suspensionRestauree` par bornes ± 5 min, `verdictMedias` avec `enTrop` et index), `scripts/restaurer-donnees.js` (`integriteArchive`, bilan unique). Rejoue tes quatre reproductions ; les tests `restaurer-phases.test.mjs` exercent les **vraies** phases avec un faux `fetch` : dis si une forme de réponse réelle de PostgREST/GoTrue/Storage n'y est pas représentée.

**F. ASTRA-49/50.** `appel-reponse-rejouable.spec.js` (vrai `RTCPeerConnection`, bus qui ne livre qu'aux abonnés) et `appel-verdict-invitation.test.mjs` (SDK réel en `vm`, formes mesurées : transport `status 0` / `code ""`, 503 HTML, 429 `PGRST000`, 403 `42501`, 401 `PGRST301`, 404 `PGRST205`). Cherche une forme du SDK non couverte (par exemple `AbortError`, réponse 2xx avec `error` non nul).

**G. ASTRA-24 / ASTRA-23 (#474).** `migrations/migration_notifications_serveur_2026-09-15.sql` : `origine` posée par trigger depuis `current_setting('passio.notification_serveur', true)` — un client authentifié peut-il poser ce réglage via PostgREST (en-tête, `set_config` dans une RPC existante, `options`) ? `notifier_mentions` : événement récent ≤ 10 min de l'appelant, destinataires vérifiés (existant, non bloqué, membre), ≤ 20, idempotent. `lien-metier.js` `autoriserPushNotif` : le `content` n'est plus jamais poussé. `docs/APPELS_TRANSITION.md` et la garde `_callSurveillerStatut` (`CHANNEL_ERROR`/`TIMED_OUT` avec motif de policy). Conteste la détection « motif de policy » (`_rtRefusDePolicy`) contre les vrais messages de Realtime.

**H. Gouvernance (#473).** `scripts/lib/yaml-workflow.js` (lecteur fermé) et `audit-cle-production.js` (`gardeAcceptee` : ensemble fermé d'expressions). Essaie de faire certifier « sûr » un workflow qui expose la clé : expression `if` avec `contains`, `startsWith`, `fromJSON`, `env` intermédiaire, `workflow_call` avec `secrets: inherit`, action composite locale, `run` qui recompose la clé. `barriere-migration.js` `verifierPreuveRevue` : cherche une preuve fabriquable par l'auteur seul (revue de soi-même refusée ? commentaire au lieu d'approbation accepté — est-ce voulu ?). `sentinelle-taille-pr.test.mjs` : le faux `gh` exécute le `--jq` reçu ; vérifie que la fixture couvre la pagination réelle de l'API.

**I. Registre des résidus (#475).** Valide le schéma et les douze résidus : chaque condition de réexamen est-elle vraiment évaluable, chaque état est-il honnête (« non mesuré » là où rien n'a été observé) ? La gate a rougi sur la branche d'intégration pour RES-11 (`residus-integration-avant.txt`) : reproduis-le. Conteste RES-06 (« traitable ») et RES-05 (P1) si tu juges la gravité fausse.

**J. Intégration.** Sur le SHA combiné : `node --test "tests/unit/*.test.mjs"` (301), les trois gates, les 32 bancs SQL (`bash tests/sql/<banc>.test.sh`, PostgreSQL ≥ 15), les 10 suites e2e citées. Le seul conflit résolu est dans `_callBindChannelEvents` (app-05) : vérifie que l'enveloppe de `subscribe` et la répétition de `ready` coexistent sans double abonnement.

## 3. Points où la reprise conteste ton analyse

1. **ASTRA-41** : ton objection était statique ; elle est confirmée et rejouée sur PostgreSQL réel — mais la réponse n'est pas « attendre indéfiniment » : au-delà de 5 s la purge **refuse** (409 `en_vol`) et ne purge rien. Dis si tu tiens ce refus pour insuffisant.
2. **ASTRA-43** : portée retenue = résurrection après purge, pas envoi sous B (ton texte). Les tests l'écrivent ainsi ; ne la requalifie pas sans un scénario qui envoie effectivement sous B.
3. **ASTRA-50** : les formes de réponse ont été **mesurées** contre le SDK 2.116.0, pas supposées ; la 503 HTML sans code n'était pas dans ta liste.
4. **ASTRA-52** : les six variantes sont synthétiques, aucune n'est un incident survenu — le test le dit ; ne les présente pas comme tels.
5. **ASTRA-26/29–32** : la restauration relisait déjà la cible ; les corrections portent sur la couverture, les comparaisons et la transmission — pas sur une relecture absente.
6. **État de référence** : les fusions et déploiements du 2026-09-15 (#468 et runs CI) ne sont pas de la reprise ; ils sont consignés comme un résidu P1 (RES-10) avec une étape 0 de mesure. Si tu as accès à la cible, **mesure le journal `migrations_appliquees`** : c'est la donnée qui manque le plus.

## 4. Ce que tu rends

Un verdict par identifiant (ASTRA-39→55, ASTRA-23/24, RES-01→12) : confirmé / partiel / contredit, avec la reproduction exacte (commande, SHA, sortie). Distingue lecture statique, simulation, PostgreSQL réel, navigateur, mesure distante. Nomme toute limite qui permettrait d'exposer un autre compte, de perdre des données ou d'annoncer un faux succès : elle reste un défaut ouvert. N'exécute aucune opération de production ; n'applique aucune migration sur la cible.
