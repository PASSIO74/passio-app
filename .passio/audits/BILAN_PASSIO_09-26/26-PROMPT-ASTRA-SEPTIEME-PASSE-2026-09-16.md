# Fiche 26 — prompt pour Astra, septième passe (après mise en service, 2026-09-16)

Tu es Astra. Septième contre-revue PASSIO — la première APRÈS mise en service.

## Références
- `main` : `c4f49b3c` (site servi) ; Edge Functions servies : `X-Passio-Revision = 5363c44e` (#477).
- Dossier : `docs/MISE_EN_SERVICE_PILOTE.md` (§ H = ce qui a été fait le 2026-09-16, mesuré) ; fiche 25 ;
  preuves : `.passio/audits/BILAN_PASSIO_09-26/preuves/astra6/` et `preuves/astra6/cible/`.
- Registre : `.passio/residus/registre-residus.json` (RES-01/10/11 fermés, RES-13→17 ouverts).
- Journal des migrations sur la cible : `public.migrations_appliquees` (8 lignes du 16/09).

## Ce que tu dois faire
1. **Vérifier la cible, pas le dépôt.** En lecture seule (connecteur `execute_sql`, transaction read only) :
   journal, objets réels (barrière v3 : `tentative_vivante`, `auth_echec`, 37 triggers
   `zz_barriere_suppression`, droits sur `comptes_en_suppression`), RLS, prérequis des fonctions
   (`scripts/verifier-prerequis-fonctions.mjs --sql`), catalogue des tables de compte
   (`scripts/controle-tables-compte-cible.js --sql`). Compare aux empreintes des fichiers du dépôt.
   Toute divergence est un constat.
2. **Rejouer la suppression de compte sur la cible** avec tes propres comptes jetables (`@passio-e2e.test`,
   service_role) : concurrence A/B, tentative interrompue, échec Auth simulé si possible, reprise. Exige
   200 + `garantie:"barriere"` ou un refus nommé ; jamais un 200 sans garantie. Relis les tables ET `auth.users`.
3. **Attaquer le chemin d'application des migrations** : équivalent de l'éditeur SQL sur autorisation
   explicite, hors de l'outil à preuve de revue (RES-15, aucun relecteur autorisé). Le journal suffit-il à
   reconstituer qui a appliqué quoi, avec quel contenu ? Que manque-t-il pour fermer ce chemin ?
4. **Chercher ce que la fumée n'a pas couvert** : mentions serveur (`notifier_mentions` sur la cible avec un
   identifiant préexistant), export instantané d'un compte avec médias et conversations, notifications à
   texte client (RES-16), anciens clients en cache (service worker) face aux appels désactivés, propagation
   de `release.json`.
5. **Relire le correctif trouvé sur la cible (#478, `uuid = text`) et chercher ses frères** : toute fonction
   SQL qui compare une colonne d'identifiant à un paramètre text (`passion_quotas.user_id`,
   `passions.created_by`, `client_errors.auth_uid`, `telemetry_events.auth_uid` sont des uuid en production).
6. **Sauvegarde/restauration** : le cycle réel n'a pas été rejoué (RES-14). Avec un projet jetable, joue-le ;
   sinon dis-le, ne le présente pas comme fait.

## Règles
- Quatre états séparés : corrigé / testé / déployé / relu sur cible. « Non mesuré » se dit.
- Un constat = reproduction (commande, sortie, SHA, environnement, services réels ou simulés), pas une lecture.
  Nuance acceptée ≠ défaut.
- Aucune écriture en production hors comptes jetables purgés ; aucune migration ; aucun redéploiement.
- Rends : constats P0→P3 avec verdict par identifiant (RES-* et nouveaux ASTRA-*), ce qui a été mesuré sur
  la cible, ce qui n'a pas pu l'être et pourquoi, et une recommandation : élargir le pilote, le maintenir en
  petite vague, ou l'arrêter.
