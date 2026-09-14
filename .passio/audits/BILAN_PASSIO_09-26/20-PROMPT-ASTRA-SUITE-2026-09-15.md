# Prompt pour GPT Astra — reprise du 2026-09-15

> À copier tel quel dans la conversation d'Astra. Il remplace `17-PROMPT-ASTRA-2026-09-13.md` : le commit examiné n'est plus le même, et 30 pull requests ont été fusionnées depuis. Le dossier de preuves est le dépôt lui-même (public) : `PASSIO74/passio-app`, branche `main`, plus le registre `.passio/audits/BILAN_PASSIO_09-26/18-REGISTRE-CORRECTIONS-ASTRA-2026-09-14.md` (68 fiches, quatre états chacune).

---

Tu es Astra. Le 2026-09-13 tu as rendu une contre-revue indépendante de PASSIO (`16-CONTRE-REVUE-ASTRA-REPRISE-2026-09-13.md`) : 65 points croisés, **4 fermés, 33 partiels, 28 ouverts**, trois bloquants intacts (SUP-04, EXP-01, PERF-01), dix trouvailles propres (ASTRA-01 à ASTRA-10), et un plan en dix chantiers. Voici ce qui a été fait depuis, en 36 heures, par Claude Code, sous la règle « un chantier par PR, reproduire d'abord, mesurer, verrouiller par réinjection, consigner en quatre états ». **Tu dois le contredire, pas l'enregistrer.**

## 1. Ce que tu dois savoir avant de lire

- **Le registre est la source** : `.passio/audits/BILAN_PASSIO_09-26/18-REGISTRE-CORRECTIONS-ASTRA-2026-09-14.md`. Chaque fiche porte : état constaté (reproduit ou non), correction, test effectué, résultat avant/après, limite restante, état parmi `corrigé dans le code → testé sur staging → déployé → vérifié après déploiement`, PR. « non mesuré » y est écrit quand aucune preuve n'existe. Son tableau « Points restants » donne l'état par chantier.
- **Les preuves techniques** vivent dans le dépôt : `docs/RECUPERATION.md` (restauration et rollback exercés), `docs/STAGING.md` (second projet et comment le viser), `docs/CAPACITE_2026-09-14.md` (charge mesurée), `CLAUDE.md` (fiches de leçons, sections datées 14/09), les bancs `tests/sql/*.test.sh`, les verrous `tests/e2e/*.spec.js` et `tests/unit/*.test.mjs`.
- **Ce qui a été fait par le même auteur que les correctifs** — c'est le conflit d'intérêts que tu existes pour lever. Prends chaque « mesuré » comme une affirmation à vérifier, pas comme un acquis.
- **Ce qui n'est PAS dans le dépôt** et que tu ne peux pas voir : l'état de la base de production (migrations appliquées, triggers, cron, advisors), les réglages Supabase (captcha OFF, confirmation d'e-mail ON, mots de passe compromis refusés), les deux projets Supabase (prod `njkiyoklssvefstljemx`, staging `fcksxofaelcdmmifnwjo`), les secrets GitHub. Quand une fiche dit « mesuré en base », tu peux exiger la requête et son résultat, mais pas la rejouer.

## 2. Les trois bloquants intacts de ta revue — ce qui leur est arrivé

**EXP-01 (restauration jamais exercée)** — FAIT et mesuré (#401). Trois outils par l'API de gestion Supabase : `scripts/schema-executable.js` (le DDL de la prod lu dans le catalogue : 16 sections — dont privilèges de table ET de colonne, EXECUTE des fonctions avec PUBLIC révoqué d'abord, vues `security_invoker`, séquences, cron, policies `realtime`), `scripts/restaurer-donnees.js` (schéma → comptes avec leur identifiant → tables par lots SQL, triggers utilisateur coupés, liste de colonnes explicite → médias → verdict table par table), `scripts/sauvegarde-donnees.js` (existant). Exercice : artefact CI de la nuit déchiffré avec la phrase de repli, DDL appliqué sur le staging vide puis rejoué, **16 compteurs d'objets égaux prod = staging**, `get_advisors` identiques, archive reversée **40 tables / 8 comptes / 67 médias / 0 écart**, frontière anonyme identique, puis staging purgé. Six défauts trouvés par l'exercice (dont : une reconstruction « tables + policies » rend `events.address` lisible sans compte — seuls des GRANT de colonnes le protègent — et `is_conv_member` appelable par `anon`, PUBLIC gardant EXECUTE). Limites écrites : mots de passe, identités OAuth, configuration du projet non restaurables ; `authz-critical` ne savait pas viser le staging (voir SUP-04).

**SUP-04 (un seul environnement)** — le client sait viser un autre projet (#406) : `window.PASSIO_SUPABASE_CIBLE` posé avant app-08, forme vérifiée sinon ignoré ; suites `prod` de Playwright, `compte-e2e`, purge et `build.js` suivent la cible. Mesuré : `authz-critical`, `blocage-acces`, `user-state-horodatage` **verts contre le staging**, 5 comptes créés là-bas, production intacte (8 comptes, dernier du 12/09). **La CI, elle, écrit encore en production** tant que #409 (`.github`, contre-revue humaine) n'est pas fusionnée : suites prod et canari sur le staging, `authz-critical` seule gardée sur la prod comme barrière de déploiement. Aperçus de PR : pas encore sur la cible.

**PERF-01 (capacité jamais mesurée)** — mesuré (#410, contre-revue). `scripts/charge.mjs` (refuse la production) sur le staging semé (300 comptes, 6 000 publications). **Trouvé** : plafond à ~60 req/s quel que soit le nombre d'utilisateurs, goulot `rechercher_passions` (430 ms/appel, `unnest(aliases)` + `like` par ligne). Migration (colonne `recherche` par trigger + index GIN trigram, mêmes résultats — banc sur 12 requêtes) : recherche **15 → 149 req/s**, **~400 req/s de lectures réelles à p95 < 1 s**, 0 erreur à 200 simultanés sans pause. Appliquée sur le staging seulement. Non mesuré : écritures, temps réel. PERF-02 mesuré et confirmé (≈ 12 s jusqu'à la première carte sur téléphone lent, dont ≈ 6 s de JavaScript), non corrigé.

## 3. Tes dix trouvailles

| | État | Où |
|---|---|---|
| ASTRA-01 pièces jointes mal purgées | fait, déployé, éprouvé | #379 |
| ASTRA-02 plafond global sur dates fournies par l'émetteur | appliqué en prod | registre |
| ASTRA-03 modération : 500 derniers puis filtre | fait, dans #396 (contre-revue) | |
| ASTRA-04 quota de création non sérialisé | verrou consultatif par compte, migration sur staging (#407, contre-revue) — **le défaut ne s'est pas reproduit** en 3 tirs de 6 appels parallèles, ni avec ni sans le verrou ; posé par principe | |
| ASTRA-05 limites de la chaîne autonome non imposées | garde mécanique dans la gouvernance de `deploy.yml` (#407) ; **note** : elle admet `tests/e2e/*.spec.js` que le texte de l'issue interdit — à aligner | |
| ASTRA-06 erreurs anonymes → enquête automatique | partiel (désamorçage + `auth_uid` serveur) | registre |
| ASTRA-07 vérificateur de sauvegarde | fait | registre |
| ASTRA-08 dédup sur premier candidat | préparé, câblage à venir | registre |
| ASTRA-09 responsable de traitement | fait (« a ») | #380 |
| ASTRA-10 erreur transitoire mémorisée comme absence de droit | fait, déployé | #385–#394 |

## 4. Par chantier — l'état au 15/09 au matin

- **2** (comptes, échanges) : fait, déployé. **3** (suppression, médias) : fait ; CONT-11/SUP-01 décidé « 2 ». **4** (inscription, information) : fait ; AUTH-10 complété le 14/09 (Google Fonts, relais TURN, STUN nommés — verrou qui compare le texte aux hôtes appelés). **8** (faux succès) : fait, déployé (#385–#394 ; IRL-12 en contre-revue #395).
- **5** (modération) : lot 1 en contre-revue (#396 : retrait sans SQL, journal `moderation_actions`, story signalable, accusé de réception). Reste : suspension de compte, interface.
- **6** (isoler, restaurer) : EXP-01 fait, EXP-03 fait (`rollback-netlify.mjs`, **1,8 s** aller / 1,1 s retour, exercé en production), SUP-04/TCI-04/EXP-11 client fait + CI en revue (#409), EXP-04/TCI-16 en revue (#404), ASTRA-07 fait. Reste NET-07 (baseline), TCI-15.
- **7** (bornes) : ASTRA-04/05 + PIL-02 en revue (#407) ; PIL-03/CONT-08/MOD-06/SUP-07 déjà traités le 11/09 (12 tables sous `trg_rate_limit`, `trg_debit_global`, purges cron — mesurés) ; PIL-01/04, EXP-06/12 consignés avec l'état réel ; **MOD-07 (captcha) attend un geste humain** (widget Cloudflare) ; PIL-10 ouvert.
- **9** (capacité) : PERF-01 mesuré + goulot corrigé (staging), PERF-02 mesuré, PERF-03 en revue (#403 — migrations déjà en prod : advisors 71 → 2, 24 → 0), PERF-05/06 consignés, PRO-06 fait (79 `user_state` orphelins purgés, miroir complet), ASTRA-04 en revue ; PRO-01 partiel, PRO-03 = décision produit.
- **10** (parcours, preuves) : TCI-05/06/14, UXO-01/03, DEV-01/04, DEV-03, **DEV-02** (règle mécanique : tout `<div onclick>` tabulable, conteneurs sans rôle), **TCI-01 partiel** (suites cross-compte réparées : 8 scénarios vivants sur 9, le temps réel du staging reste rouge). Restent DEV-05, UXO-02 (analysé : un mode « session expirée » avec écritures coupées, pas fait), TCI-02, TCI-07 à 13.

Compte approximatif : sur 118 points + 10 ASTRA, **~85 fermés ou consignés avec mesure, 7 PR en attente de la contre-revue humaine, ~30 ouverts**.

## 5. Ce que je te demande

1. **Contredis les fermetures.** Prends chaque fiche dont l'état est « déployé » ou « vérifié après déploiement » et cherche le résidu : la même méthode que ta seconde passe du 13/09 (elle avait invalidé 5 fermetures sur 9). Cible en priorité : EXP-01 (une restauration prouvée SANS données réelles depuis la purge — que vaut-elle ?), SUP-04 (le client sait viser, la CI pas encore : quel est l'état RÉEL de l'isolation aujourd'hui ?), PERF-01 (une charge sans écritures ni temps réel : que ne dit-elle pas ?), DEV-02 (une règle mécanique peut rendre tabulable ce qui ne devrait pas l'être — cherche le cas), TCI-01 (le scénario temps réel rouge : cause probable ?).
2. **Juge les résidus assumés.** Le registre en écrit beaucoup (« limite restante »). Lesquels sont en réalité des défauts vivants qu'on a habillés en résidus ?
3. **Vérifie les affirmations de mesure** : quand une fiche dit « mesuré », la requête et le résultat sont-ils dans le dépôt ou dans un document ? Sinon, dis-le.
4. **Reclasse.** Donne le nouveau verdict par identifiant (FERMÉ / PARTIEL / OUVERT / NON VÉRIFIABLE D'ICI), et le nouveau plan : ce qui reste bloquant pour ouvrir au public, dans l'ordre.
5. Numérote tes nouvelles trouvailles **ASTRA-11 et suivantes**. Écris en français, sans complaisance, avec pour chaque constat : le fichier, la ligne ou la fiche, ce que tu as lu, ce qui manque.

Méfie-toi de deux choses que tu ne peux pas voir d'ici : l'état de la production (le dépôt décrit des intentions ; la base et les réglages Supabase sont ailleurs), et l'ordre des dates (plusieurs fiches ont été réécrites le jour même). Si une preuve n'est pas dans le dépôt, elle n'existe pas pour toi — dis-le tel quel.
