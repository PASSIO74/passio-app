# Prompt pour GPT Astra — quatrième passe (soir du 2026-09-15)

> À copier tel quel dans la conversation d'Astra. Il remplace `20-PROMPT-ASTRA-SUITE-2026-09-15.md` : ta troisième passe (`21-CONTRE-REVUE-ASTRA-2026-09-15.md`, ASTRA-11 à 20 + reclassement de 85 identifiants + plan en 9 points) a été traitée dans la journée, et 25 pull requests ont été fusionnées depuis le commit que tu as lu. Le dépôt public reste la source : https://github.com/PASSIO74/passio-app.

---

Tu es Astra. Le 2026-09-15 au matin tu as rendu ta troisième contre-revue de PASSIO : dix constats neufs (ASTRA-11 à ASTRA-20), 85 identifiants reclassés, et un plan de correction en neuf points que tu demandais de suivre **dans l'ordre**. Tu ne validais pas encore le maintien de l'ouverture publique sans restriction. Voici ce qui a été fait depuis, dans l'ordre que tu as fixé, avec les quatre états séparés que tu exiges (corrigé dans le code → testé sur staging → déployé → vérifié après déploiement) et « non mesuré » quand il n'y a pas de preuve.

## 1. Ce que tu dois savoir avant de lire

- **Le registre est la source** : `.passio/audits/BILAN_PASSIO_09-26/18-REGISTRE-CORRECTIONS-ASTRA-2026-09-14.md`, bloc « Reprise du 15/09 — état à 17 h » (une ligne par identifiant, quatre colonnes d'état, la PR), puis les fiches, chacune avec ses lignes « Suite du 15/09 » datées.
- **Les preuves durables** sont versionnées sous `.passio/audits/BILAN_PASSIO_09-26/preuves/` : `suppression-compte/2026-09-15-astra-11-production.md`, `blocage/2026-09-15-mod-04-production.md`, `performance/2026-09-15-recherche-production.md`, `performance/2026-09-15-charge-mixte-staging.json` (10 413 mesures brutes), `restauration/2026-09-15-cible-vide.json` et `…-parcours-comptes-restaures.md`. Les documents : `docs/RECUPERATION.md` (§ exercice du 15/09), `docs/CAPACITE_2026-09-14.md` (§ charge mixte authentifiée).
- **Tout a été fait par le même auteur que les correctifs**, à l'exception des contre-revues humaines posées par le propriétaire sur chaque PR portant une migration ou un workflow. C'est le conflit d'intérêts que tu existes pour lever : prends chaque « mesuré » comme une affirmation à vérifier.
- **Un écart de procédure est écrit, pas tu** : la migration `moderation_suspension` (élargissement d'un CHECK) a été appliquée en production AVANT sa contre-revue, par erreur de cible (fiche MOD-01, PR #440). Juge-le.
- **Ce que tu ne peux pas voir d'ici** : l'état de la base de production (cinq migrations appliquées ce jour et mesurées — les mesures sont dans les fiches, pas la base), les réglages Supabase (captcha ALLUMÉ depuis 12:5x UTC), les Edge Functions déployées (`delete-account` v8, `export-account` v4, `notify-call` v9 — `supabase functions list`).

## 2. Tes dix trouvailles, ASTRA-11 à 20

| | État | PR |
|---|---|---|
| ASTRA-11 / 12 suppression : objet d'autrui effacé, références perdues | **vérifié en production** : objets relevés par propriétaire (`objets_stockage_du_compte`, service_role), purge paginée relue fail-closed, rien côté client avant le verdict ; preuve avec comptes jetables : fichier de B intact, ceux de A partis. Résidu SUP-10 trouvé par la première CI staging (état repoussé pendant la purge = « reste ») : client gelé le temps du verdict, reprise serveur — v8 | #417, #438 |
| ASTRA-13 règle clavier ferme une modale | déployé, `data-tabulable` dans l'artefact servi | #418 |
| ASTRA-14 export incomplet silencieux | déployé : pagination stable, troncature posée partout, listing Storage paginé, `bilan` en tête et « Export INCOMPLET » affiché | #426 |
| ASTRA-15 contrôles contournables par du texte inerte | déployé (épurateur récursif, audit des tests creux hors commentaires/chaînes) | #427 |
| ASTRA-16 / 17 / 18 verdict de restauration par quantités, purge qui termine malgré des refus, limites levées | déployé ; **exercé sur base VIDE** ce soir : `prouvee: true`, 0 écart, 41 tables « contenu identique », 10/10 comptes, 67/67 médias ; purge fail-closed relue | #421, #445 |
| ASTRA-19 rollback « précédent » plus récent | déployé, fonctions pures testées | #420 |
| ASTRA-20 banc de charge aveugle aux réponses vides | déployé : verdict de contenu par requête (contre-épreuve rejouée : 4 × « vide », 0 succès), mesures brutes conservées, **mode mixte authentifié** mesuré | #437 |

## 3. Ton plan en neuf points — état

1. **Suppression de compte** : fait, vérifié en production ; résidu SUP-10 fermé (#438).
2. **Séparation des comptes et des échanges** : AUTH-06, MSG-04, MOD-04 (serveur : `abonne_accepte_non_bloque`, migration en prod, preuve comportementale en prod) faits ; MSG-01/SUP-06 inchangés depuis #377 ; **MSG-10 (résidu) : policy de lecture de `conv_messages` « membre ET non bloqué », symétrique, prouvée sur le staging — #442 en contre-revue, production après. MSG-01/SUP-06 (résidu) : l'invitation d'appel devient une ligne `call_invites` (from_id = jeton), la sonnerie part d'un trigger `realtime.send`, un client n'émet plus sur `ring:` — prouvé sur le staging avec un vrai canal Realtime (#447, en contre-revue).**
3. **Clavier et faux succès** : ASTRA-13, IRL-04/13, PRO-04, IRL-11 faits, déployés.
4. **Restauration et purge vérifiables** : EXP-01 rejoué sur base VIDE avec `--preuve` et parcours de trois comptes restaurés (#445) ; NET-07/TCI-15 : journal `migrations_appliquees` écrit par l'outil d'application (rétroactif pour les quatre du jour), `schema.sql` dans la sauvegarde quotidienne, exigé par le vérificateur (#441). **Trois défauts de l'outil trouvés par l'exercice**, corrigés : identité `generated always`, eTag multipart pris pour un MD5, noms des objets absents de la preuve.
5. **Isolation** : #409/#416 fusionnées, la CI tourne sur le staging avec les quatre suites cross-compte (`PASSIO_E2E_MULTI=1`). Constat : le staging n'est pas « vide » longtemps — la CI y crée des comptes pendant tout exercice.
6. **Modération et admission** : MOD-01 résidu **suspension de compte** outillée (ban GoTrue relu, journal, signalant et personne visée prévenus, refus dit en français) ; MOD-07 **captcha Turnstile actif en production**, prouvé depuis le navigateur du propriétaire (jeton accepté ; sans jeton `captcha_failed`) ; AUTH-02/03 fait (#430).
7. **Export et opposition** : ASTRA-14 (#426), AUTH-04/EXP-15 (#429 — identifiant d'appareil créé seulement si la mesure est active, effacé à l'opposition), EXP-08 déployé.
8. **Livraison et supervision** : #404/#407 fusionnées (droit `workflow` obtenu), ASTRA-05 limite « 2 fichiers / 60 lignes » IMPOSÉE (#436), ASTRA-06/08 (#428), PIL-02, TCI-01 en CI, EXP-06 sonde de disponibilité sans compte tiers (#435, run vert), PIL-10 vue « Exploitation » du pilotage (#443, coûts NON mesurés et dit), DEV-05 mode PWA en télémétrie (#444).
9. **Mesurer avant d'élargir** : PERF-01 en production (recherche p50 951 → 193 ms à 20 en parallèle, mesuré avant/après) ; charge MIXTE authentifiée sur le staging (10 comptes actifs → p95 ≈ 100 ms, temps réel < 1 s ; 25 → queue ; 50 → p95 ≈ 1,8 s ; ~20 comptes actifs simultanés en écriture sur le Micro) ; **tenue 5 min à 10 comptes actifs** (27 746 mesures, 1 sur 5 conservée) : lectures p95 102–117 ms stables, publier p95 578 ms, temps réel p50 272 ms / p95 799 ms, 5 événements sur 367 non reçus en 10 s, 0 erreur HTTP — `preuves/performance/2026-09-15-tenue-5min-staging.json` ; PERF-02 mesuré, non corrigé.

## 4. Ce qui reste ouvert, dit tel quel

PERF-02 (découpage du monolithe, 6 s de JavaScript sur téléphone lent — non corrigé) ; PRO-03 (décision produit) ; TCI-02 (inscription réelle par e-mail sans boîte pilotable) et TCI-07 à 13 ; MSG-06, IRL-05/06/10, AUTH-09/10, CONT-11/SUP-01 (décision « 2 ») : consignés avec leur état, non repris ce jour ; rôle modérateur distinct de l'opérateur ; réactions et accusés de lecture d'un membre bloqué non filtrés.

## 5. Ce que je te demande

1. **Contredis les fermetures** — la même méthode que tes deux passes précédentes. Cible en priorité : ASTRA-11/12 (la preuve en production suffit-elle ?), MOD-04 et MSG-10 (symétrie du blocage côté serveur : est-ce le bon choix ?), MOD-07 (un jeton accepté depuis le navigateur du propriétaire prouve-t-il l'inscription réelle ?), EXP-01 sur base vide (que manque-t-il encore pour appeler cela une capacité de reprise ?), NET-07 (le journal rétroactif est-il une trace ou une reconstruction ?).
2. **Juge l'écart de procédure** (migration appliquée avant contre-revue) et la règle qui doit l'empêcher.
3. **Juge les mesures de capacité** : le plafond « ~20 comptes actifs en écriture » est-il fondé, et que faudrait-il mesurer avant d'élargir l'audience ?
4. **Reclasse** chaque identifiant (FERMÉ / PARTIEL / OUVERT / NON VÉRIFIABLE D'ICI) et donne le nouveau plan, dans l'ordre.
5. Numérote tes nouvelles trouvailles **ASTRA-21 et suivantes**, avec pour chacune le fichier, la ligne ou la fiche, ce que tu as lu, ce qui manque.

Une limite susceptible d'exposer un autre compte, de perdre des données ou d'annoncer un faux succès doit rester un défaut ouvert — c'est ta règle, elle reste la nôtre.
