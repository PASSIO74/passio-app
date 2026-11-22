# 08 — Point de reprise (mis à jour le 2026-11-10 à 18:30 UTC)

> La mission dépasse une session. Ce fichier dit où elle en est et quelle est la prochaine action précise.
> **Une limite de quota n'est pas une conclusion** : rien de ce qui est listé « à faire » n'est vérifié.

## Ce qui s'est passé

- 16:02 → 17:20 UTC : baseline, sonde de la production, huit audits spécialisés lancés en parallèle (lecture seule).
- **17:20 UTC : la limite hebdomadaire du forfait a coupé les huit sous-agents** (erreur 429). Deux avaient écrit leur rapport.
- 17:31 UTC : reprise demandée par Benjamin. Les six autres agents ont été relancés avec l'ordre d'écrire ce qu'ils avaient
  déjà établi : **les huit rapports existent**. Trois PR de correction ouvertes.
- Une seconde interruption a eu lieu pendant la rédaction des documents ; rien n'a été perdu (tout était poussé ou sur disque).

## Branches et PR

| Branche | Worktree (`.claude/worktrees/…`) | PR | État au 10/11, 18:18 UTC |
|---|---|---|---|
| `security/profil-visite-identifiant-echappe` | `lot-profil-visite-xss` | **#823** | CLI-01 (P0). Testée, auto-relue, CI verte (un lot en cours). **Ni contre-revue, ni fusion, ni déploiement** |
| `fix/chargeur-app-onload-unique` | `lot-chargeur-onload` | **#822** | STAB-01. CI verte sauf « Gouvernance critique », rouge par conception : contre-revue de PASSIO74 requise |
| `fix/robustesse-client-2026-11-10` | `lot-robustesse-client` | **#824** | STAB-02, 08, 11. Testée, auto-relue, CI en cours |
| `docs/audit-stabilisation-2026-11-10` | `audit-stabilisation-fable-2026-11-10` | voir GitHub | ces documents |

Aucune fusion, aucun push sur `main`, aucune écriture en production, aucune migration appliquée par cette mission.

## Preuves et rapports

Dossier privé, hors git, sur le poste : `Desktop/PASSIO/.passio/reviews/2026-11-10-audit-stabilisation/`
— `rapports/` (SRV, ETAT, CLI, EXPL, PARC, PIL, PWA, PERF + le préambule donné aux agents), `preuves/` (journaux des passes de
test, sonde anonyme, reproductions, avant / après de chaque lot), `outils/` (`sonde-anon.mjs`, `repro-chargeur.mjs`,
`servir-exact.mjs`), `notes-agents/`, et le corps des trois PR. Le dossier temporaire de la session disparaît avec elle.

## Ce qui reste à faire, dans l'ordre

1. **Benjamin** : fusionner #823 ; contre-revoir #822 ; fusionner #824 ; trancher STAB-04, STAB-05, PIL-01.
2. Contre-revue indépendante (Codex / ChatGPT) des trois PR — **non faite**.
3. Lancer la suite navigateur sur la réplique exacte de la production (`outils/servir-exact.mjs`, `PASSIO_PORT` dédié) et
   consigner l'écart avec la baseline (2 560 verts, 11 sautés).
4. Relire dans le code, puis corriger avec un verrou chacun, un lot par PR :
   a. durcissement serveur de CLI-01 (migration à préparer, banc, retour arrière) ;
   b. ETAT-03 (verdict de `saveMainProfile`), ETAT-07 (bulles texte et brouillon au démarrage), SRV-03 (ne plus proposer
      « Modifier » sur un commentaire d'activité) — client, risque normal ;
   c. ETAT-02 + ETAT-06 (portée de `signOut`, écouteur `SIGNED_OUT`, bandeau qui purge) — critique ;
   d. ETAT-01 (base du rejeu de l'état) — critique ;
   e. « verdicts » : SRV-04, ETAT-04, ETAT-09, PARC-01 ;
   f. SRV-02, SRV-08, PIL-02, purge SRV-05 — migrations à préparer ;
   g. STAB-10 : tester l'artefact final avant de le déployer — `.github/`, critique.
5. Mettre à jour `.passio/residus/registre-residus.json` (non touché), `docs/ARCHITECTURE.md` et les documents périmés.
6. Exercer : retour arrière Netlify, déchiffrement d'une archive, banc de charge sur le staging, inscription réelle sur iPhone.

## Verdict à ce point

**NON PRÊT** — voir `00-SYNTHESE.md`.

## Ajout de 19:00 UTC — `main` a avancé pendant la mission

- `main` = production = `36b778d1` (PR #821, intégrité de la feuille de style ; buildId `7e41f8b20efe`), fusionnée par une autre
  session. Les mesures de cet audit portent sur `4e1d8ed1` ; #821 touche `scripts/build.js`, `sw.js`, `deploy.yml` et la suite du
  chargeur — **non auditée ici**.
- #822 : `main` fusionnée dans la branche sans conflit (`340db0aa`), suite du chargeur 12 / 12, `integrite-app` 9 / 9, `verif` vert.
  La contre-revue doit donc s'ancrer sur ce nouveau SHA.
- #824 : un rouge en CI sur `app-scripts-par-fichier` ⑤ (« l'application s'exécute avant `load` »), test que ce lot ne touche pas ;
  6 / 6 en local sur la branche ; déjà rouge sous charge sur `main` intact (baseline V7). Jobs relancés une fois. **Ce test est
  instable** : à inscrire au registre (STAB-12, P3) et à diagnostiquer — un rouge relancé n'est pas un rouge expliqué.
- PR des documents : **#825**.

## Ajout — lot « verdicts » (PR #826)

- Branche `fix/verdicts-profil-conversation-commentaire` (worktree `lot-verdicts-client`), base `36b778d1`.
- ETAT-03, ETAT-07, SRV-03 revérifiés dans le code par le coordinateur, puis corrigés : 7 verrous neufs, chacun rouge
  quand on rend le fichier de `main`, verts après ; 19 suites voisines 199 / 199 ; `npm run verif` vert. Risque normal.
- Reste de l'étape 4 du plan : c (session, critique), d (rejeu de l'état, critique), e (« verdicts » restants : SRV-04,
  ETAT-04, ETAT-09, PARC-01), f (migrations), g (CI).

## Ajout — lot « session » (PR #827, critique)

- Branche `security/session-deconnexion-locale` (worktree `lot-session`), base `36b778d1`.
- ETAT-02 (déconnexion locale + écoute de `SIGNED_OUT`) et ETAT-06 (bandeau rouge sans purge). 5 verrous rouges par
  mutation ; 28 suites voisines : 293 verts + 2 contrats de source qui figeaient ETAT-06, attendus changés avec leur
  raison, rouges sur le code d'avant ; `npm run verif` vert. **Contre-revue indépendante requise avant fusion.**
- Reste : au démarrage suivant d'une session perdue, `entrerEnSessionExpiree()` exige un jeton persisté
  (`session-expiree.spec.js` ② le fige) — lot à part. Étapes suivantes du plan : d (ETAT-01, rejeu de l'état),
  e (verdicts restants), f (migrations), g (CI).

## Ajout du 2026-11-12 — fusionné ET déployé

- Contre-revues de mainteneur unique postées le 10/11 depuis PASSIO74 sur l'ordre de Benjamin, rédigées par Claude Code
  et le disant (pas des revues indépendantes). La relecture a trouvé et corrigé un défaut dans #826 (visiteur).
- #823, #824, #822, #827 fusionnées le 10/11 ; #826 le 12/11. Production : `release.json` → commit `6aaafa79`
  (buildId `ef7641d4dca7`), run 43199065800 : gouvernance, fumée et « Déploiement production » verts.
- Reste du plan : ETAT-01 (rejeu de l'état, critique), verdicts restants (SRV-04, ETAT-04, ETAT-09, PARC-01),
  migrations à préparer (durcissement CLI-01, SRV-02, SRV-08, purge SRV-05), CI (STAB-10), décisions STAB-04 / STAB-05 / PIL-01.

## Ajout du 2026-11-12, après-midi — décisions de Benjamin et lots suivants

Décisions de Benjamin du 12/11 :
1. « on fait le ménage » (STAB-05) ;
2. « public » (STAB-04) ;
3. second facteur du pilotage : « suspendu » (PIL-01, rien à faire) ;
4. relecture : « fait au mieux » ;
5. essais sur un vrai téléphone : plus tard, de sa main.

- **#834 — ménage (STAB-05), fusionnée.** Migration appliquée en production le 12/11, fermée sur échec, après une
  sauvegarde complète hors du dépôt (`.passio/sauvegardes/menage-publications-test-2026-11-12.json`, poste de Benjamin).
  Mesuré au canal ① :
  - 3 publications restent, 0 masquage, 35 notes au journal de modération ;
  - plus rien ne vise les publications supprimées. Les 45 commentaires et 26 « j'aime » orphelins de la base existaient
    avant et visent d'autres identifiants.
  - **Reste** : 5 médias dans le seau `content`, à retirer par l'API Storage (clé de service, absente de ce poste).
- **#833 — un compte neuf naît public (STAB-04), fusionnée.** Les comptes existants n'ont pas été touchés. La CI à
  comptes réels a trouvé un test (`confidentialite.spec.js`) qui ne passait que parce que la ligne neuve naissait
  privée ; il a été corrigé dans la PR.
- **#838 — SRV-08, `client_errors` en trois réservoirs, fusionnée.** Appliquée au staging puis en production. Elle
  s'éprouve elle-même sous les vrais rôles : 8 contrôles sur 8 au vert sur les deux cibles. Mesurée au canal ①.
- **#836 — ETAT-01 (critique), ETAT-09, PARC-01, SRV-04, ETAT-04 (sortie d'un groupe).** Relue par un agent séparé
  (`audit-passio`). Il a trouvé un défaut **bloquant** dans le premier correctif d'ETAT-01 (perte hors ligne sur un
  appareil seul), corrigé avant fusion par une estampille d'écriture, verrou ⑥. Suites voisines : 282 tests sur 282.
- Attestations des trois migrations consignées dans cette PR (`.passio/migrations/attestations.json`).
- **Relecture « au mieux »** : chaque revue postée depuis PASSIO74 le dit, elle est écrite par Claude. La seule seconde
  lecture est celle d'un agent séparé, qui reste un modèle Claude : **aucune revue humaine ni d'un second modèle n'a eu lieu**.

### Ce qui reste ouvert
- Migrations de durcissement : le côté serveur de CLI-01 (forme du pseudo, `co_organizers`), SRV-02 (notifications
  forgées), purge SRV-05.
- ETAT-04 en partie (« supprimer pour tous », suppression d'un commentaire), ETAT-05, ETAT-08.
- STAB-10 : la CI ne teste pas la page minifiée (touche `.github/`).
- `entrerEnSessionExpiree()` exige un jeton persisté au démarrage suivant.
- Gestes de Benjamin : essais sur iPhone et Android réels, inscription réelle, retour arrière Netlify.

## Ajout du 2026-11-12, fin d'après-midi — durcissements serveur (PR #843, fusionnée et déployée)

Ordre de Benjamin : « Oui, enchaîne » (durcissements CLI-01 serveur, SRV-02, SRV-05).

- **#843 fusionnée**, production = `42fff1d5` (buildId `793660ea3d2b`), gouvernance, fumée et déploiement au vert. Cinq
  migrations, toutes appliquées au staging puis en production et mesurées au canal ① :
  - **CLI-01 serveur** : `profiles_username_forme` refuse `"`, `<`, `>`, l'accent grave et `\` ; les co-organisateurs
    sont des uuid. Le client refuse avant la base (inscription, onboarding, profil). Appliquée en production APRÈS le
    déploiement du client.
  - **SRV-02** : le nom et la phrase d'une notification sont posés par le serveur. Liens exigés : conversation commune
    pour `message` ; inscription à l'activité pour `event_update` et `event_cancelled`. L'avis de suppression d'une
    activité est écrit par la base. 17 contrôles verts sur les deux cibles.
  - **SRV-05** : purge de nuit à 03:53. Premier passage en production : 153 conversations vides, 8 stories,
    9 directs clos, 107 notifications lues de plus de 90 jours, 9 `conv_reads` et 15 vues orphelines.
- **Relecture adversariale** (agent `passio-red-team`, modèle Claude, avant toute application). Elle a trouvé un trou
  P1 dans SRV-02 que l'épreuve validait : un organisateur pouvait écrire à n'importe qui. Deux P2 et des épreuves
  creuses aussi. Tout a été corrigé avant l'application.
- **Incident au staging, créé par cette PR et réparé avant la production.** La contrainte des co-organisateurs appelle
  une fonction neuve, et `authenticated` n'avait pas le droit `execute` : créer une activité échouait en 42501. La CI à
  comptes réels l'a vu 4 minutes après l'application. Réparé par `migration_forme_pseudo_coorganisateurs_droits`, dont
  l'épreuve écrit SOUS `authenticated`. La production n'a jamais reçu la contrainte seule.

### Ce qui reste ouvert
- ETAT-04 (« supprimer pour tous », suppression d'un commentaire), ETAT-05, ETAT-08.
- STAB-10 : la page minifiée n'est testée par aucune CI (`.github/`).
- SRV-02 : l'événement métier n'est pas exigé pour chaque genre. On peut encore écrire « X a aimé ton post » sans avoir
  aimé, mais sous son vrai nom et avec une phrase fixe.
- Les médias des stories purgées et des publications de test restent dans le stockage, à retirer par l'API Storage
  avec la clé de service.
- Restent à faire par Benjamin : essais sur appareil réel, inscription réelle, retour arrière Netlify.

## Ajout du 2026-11-12, soir — les retraits (PR #852, fusionnée et déployée)

- Production = `39e4f605` (buildId `5a73b5291731`), run entièrement vert.
- **ETAT-04** : « Supprimer pour tous » attend le verdict de la base, et un refus laisse la bulle. Les deux autres
  gestes étaient déjà corrigés (FIL-C06, #836).
- **ETAT-05** : la file des suppressions n'accepte « 0 ligne + relecture vide » que sous la session de l'auteur.
- **ETAT-08** : suivis, blocages et inscriptions convergent. Une lecture réussie sous la session de ce compte
  remplace la liste locale, et « Ne plus suivre » lit son verdict.
- La relecture par l'agent `audit-passio` (modèle Claude, pas une revue humaine) a trouvé deux P1 dans la première
  version, tous deux corrigés avant fusion :
  - une session morte aurait effacé les blocages ;
  - un refus mémorisé aurait effacé les inscriptions.
- Restent ouverts :
  - STAB-10 : la CI ne teste pas la page minifiée (`.github/`) ;
  - l'événement métier n'est pas encore exigé pour chaque genre de notification ;
  - les médias orphelins, à retirer avec la clé de service ;
  - les gestes de Benjamin (essais sur appareil réel, inscription réelle, retour arrière Netlify).

## Ajout du 2026-11-13, matin — STAB-10 (PR #868, fusionnée et déployée)

- Production = `cbab5da9` (buildId `c14c2bad2f29`), run `43386994004` entièrement vert.
- **STAB-10 / EXPL-03** : la page est minifiée par `scripts/build.js` (étape 6 ter, mêmes octets que l'ancienne
  étape du workflow, retirée). « Gates artefact » joue `release-integrity`, `passion-context` et la fumée sur la
  page minifiée (12/12), puis publie l'empreinte de l'arbre `dist/` servi. Le déploiement reconstruit et refuse
  d'envoyer un arbre d'une autre empreinte : au premier déploiement, « dist/ identique à l'artefact testé :
  34 fichiers ». La page servie est d'une seule ligne (minifiée).
- Relecture `audit-passio` (modèle Claude) : aucun P1 ; trois P3 corrigés avant fusion, le quatrième noté au journal
  (le buildId reste celui de la page brute).
- Restent ouverts :
  - l'événement métier n'est pas encore exigé pour chaque genre de notification (SRV-02, reste) ;
  - les médias orphelins, à retirer avec la clé de service ;
  - `entrerEnSessionExpiree()` exige un jeton persisté au démarrage suivant ;
  - les gestes de Benjamin (essais sur appareil réel, inscription réelle, retour arrière Netlify).

## Ajout du 2026-11-13 — session perdue, démarrage suivant (branche `fix/session-expiree-marque`)

- **Le reste d'ETAT-02** : une session finie en cours de route (`SIGNED_OUT`, 401 sur une publication) pose le mode
  « session expirée », mais le SDK retire son jeton ; au démarrage suivant, `entrerEnSessionExpiree()` n'en trouvait
  plus et `boot()` montrait l'ancienne landing par-dessus un fil complet.
- **Corrigé** : `poserSessionExpiree()` pose la marque de compte `passio_session_expiree_v1` = `{uid, t}`. Au
  démarrage, le jeton OU cette marque (même `passio_uid`, moins de 30 jours) ouvre le fil en lecture. La clé est de
  compte (purgée à la déconnexion), effacée quand une session est retrouvée, jamais posée pour une session anonyme.
- Verrous `session-expiree.spec.js` ② bis à ② quater et ⑧ ; mutations vues rouges (jeton exigé seul, clé hors
  `ACCOUNT_SCOPED_KEYS`, borne de 30 jours retirée, garde anonyme retirée). 13/13 sur la suite, suites voisines vertes.
- Relecture `audit-passio` (modèle Claude, pas une revue humaine) : aucun P1 ; deux P2 corrigés avant la PR (compte
  supprimé ailleurs rouvert sans fin → borne de 30 jours ; compte anonyme enfermé → pas de marque) ; P3 regex en
  double corrigé, deux P3 notés sans effet.
- Restent ouverts : SRV-02 (événement métier par genre), médias orphelins (clé de service), gestes de Benjamin.

## Ajout du 2026-11-13 — SRV-02, le reste : pas de notification sans événement métier (PR #883, fusionnée, déployée, appliquée)

- **Approche** : (A) chaque notification part au VERDICT de son écriture — `notifierApresEcriture` (app-08), la
  file des commentaires notifie à la confirmation (`_cmtObNotifier`, app-04), 15 sites réordonnés — puis (B) la
  migration `migration_notifications_preuve_evenement_2026-11-13.sql` (`-- PREREQUIS-CLIENT:
  notifications:apres-ecriture`) : `trg_notifications_preuve` exige le fait qui lie émetteur et destinataire pour
  `like`, `comment`, `event_join`, `event_comment`, `event_feedback`, `event_invite`, `live_video`, `event_cancelled`
  (annulée ET par l'organisation) ; `reaction`, `event_reminder`, `cdv_live_step` refusés. Un fait ne vaut qu'une
  notification sur 24 h. Les déclencheurs serveur écrivant à la place du client ont été écartés : ils auraient doublé
  chaque notification des anciens clients et re-codé dix nuances de texte déjà tenues par le 12/11.
- **Relecture `passio-red-team`** (modèle Claude, pas une revue humaine) avant toute application : deux P1 corrigés —
  l'épreuve se serait faussée en production (`follows_notifier` laisse `passio.notification_serveur` posé ; mesuré
  au canal ①) et `co_organizers`, rempli par l'auteur seul, ouvrait la cloche de vingt inconnus. P2 corrigés : fait
  jamais consommé, j'aime de réponse `srep_` toujours refusé (perte légitime), invitation sur abonnement en attente.
  P3 corrigés : cible hors du fil, annulation par un inscrit, direct périmé, contrôle d'ordre tautologique.
- **Verrous** : `notifications-apres-ecriture.spec.js` (3) et `tests/unit/notifications-apres-ecriture.test.mjs`
  (dans `npm run verif`), mutations vues rouges ; banc `tests/sql/migration-notifications-preuve-evenement.test.sh`
  (socle + 12/11 + `follows_notifier` de production, quatre mutations de la migration) — **CI seulement**, pas de
  PostgreSQL sur le poste. `authz-critical` et `realtime-poussee-reelle` écrivaient un `like` sans j'aime : ils posent
  désormais le fait (sinon rouges dès la migration au staging).
- **Reste assumé** : l'invitation affiche le titre de l'activité, texte public choisi par son auteur (abonnement
  accepté exigé). Les anciens clients en cache perdent, jusqu'à leur mise à jour, les notifications qu'ils envoyaient
  avant leur fait.
- **Fait le 13/11, sur l'ordre de Benjamin** (« Continu et fait les contre revue toi même ») :
  - contre-revue postée depuis PASSIO74 par Claude, qui a écrit le diff : revues n°5890466275, puis n°5890483671 sur
    `c7e3e86b`. Elles le disent : ce n'est pas une relecture indépendante (ASTRA-61 bis) ;
  - staging : le premier envoi est REFUSÉ par l'épreuve (`events.co_organizers` est NOT NULL, rien n'est validé).
    Corrigé dans `c7e3e86b`, puis appliqué : 37/37 ;
  - CI de `c7e3e86b` entièrement verte, suite à comptes réels jouée contre le staging migré ;
  - fusion sur ce SHA (`c9e0fb91`), job « Déploiement production » vert, `release.json` = `c9e0fb91` ;
  - production : la barrière a lu le motif sur la page servie, verdict 37/37. Mesuré au canal ① : déclencheur actif
    entre l'origine et le texte, SECURITY DEFINER, `search_path` vide, sans EXECUTE pour `authenticated`, aucun
    résidu, journal présent ;
  - essai à deux comptes réels en production (`multi-comptes` « interactions sur un post ») : A reçoit les cinq
    notifications de B (j'aime, commentaire, commentaire GIF, abonnement, réaction 😍), aucune perdue. Comptes
    jetables purgés. Les refus sans fait sont éprouvés en production par l'épreuve, sous `authenticated`.
- Suite notée, sans rapport : `audit-2026-11-etats-degrades.spec.js` « RSVP · double clic » rougit aussi sur `main`
  (2 fois sur 4 le 13/11).
