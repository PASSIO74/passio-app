# 03 — Registre priorisé des findings (2026-11-10)

> Référence : `origin/main` = `4e1d8ed1`, en production (`release.json`, buildId `3d8e98bb12ad`).
> Ce registre ne recopie pas les risques déjà inscrits (R1…R42, C-/E-/F-/G-/H-, RES-01…17) : leur statut ACTUEL
> est dans le rapport SRV du dossier privé (§ 4) et dans `06-RISQUES-RESIDUELS.md`. Chaque ligne dit QUI l'a établi et à quel niveau de preuve.

## Grille de gravité (définie avant d'être appliquée)

| | Définition |
|---|---|
| **P0** | fuite ou perte de données privées exploitable ; contournement d'une autorisation serveur ; exécution de script chez autrui ; perte durable de données ; application qui ne démarre pas pour une population réelle ; contenu d'un compte envoyé sous un autre |
| **P1** | parcours essentiel cassé ou trompeur (action affichée réussie mais non persistée) ; faille exploitable sous conditions réalistes ; aucune récupération éprouvée sur un incident probable ; décision produit qui contredit la promesse au lancement |
| **P2** | parcours secondaire dégradé ; incohérence de synchronisation récupérable ; défaut d'exploitation ; défense en profondeur manquante sur une surface sensible |
| **P3** | robustesse, bruit de surveillance, cosmétique, document périmé qui induit en erreur |
| **P4** | observation, sans défaut démontré |

**Statuts** : `confirmé` (reproduit, ou démontré par une lecture sans ambiguïté, chemin complet cité) · `suspecté` · `non vérifié`.
**Qui** : `coord.` = établi et vérifié par le coordinateur · `agent` = établi par un sous-agent spécialisé de la même session
(analyse statique ou catalogue), **pas encore revérifié par le coordinateur** — à relire avant de corriger.

## Vue d'ensemble

**Aucun P0 trouvé à ce stade** — sur un périmètre incomplet (voir `08-POINT-DE-REPRISE.md` : six domaines sur huit n'ont pas rendu leur rapport).

| ID | Prio | Statut | Qui | En une ligne | Suite |
|---|---|---|---|---|---|
| STAB-04 | **P1** (décision produit) | confirmé | coord. | Depuis le 31/08 (#226), tout compte neuf naît PRIVÉ : 9 profils sur 13, 36 publications sur 37 invisibles hors abonnés, 1 seule publication réelle visible d'un visiteur | décision de Benjamin |
| ETAT-01 | **P1** | confirmé (statique) | agent | Le rejeu de la file d'état remplace un état serveur plus récent par un instantané plus ancien (perte silencieuse à plusieurs appareils) | lot critique à préparer |
| ETAT-02 | **P1** | confirmé (statique) | agent ; R19 relu par coord. | Se déconnecter d'un appareil tue la session des autres (`signOut` global), et l'application n'y voit rien : aucun écouteur `SIGNED_OUT` | lot critique à préparer |
| ETAT-03 | **P1** | confirmé (statique) | agent | « Profil mis à jour » annoncé même quand l'écriture a échoué — dont le passage en compte privé ; `is_private` repart sans geste une fois le marqueur posé | lot 2 (client) |
| STAB-05 = SRV-01 | **P2** (P1 si non voulu) | confirmé | coord. + agent | 35 publications sur 37 masquées le 04/11 à 13:25:36 UTC par une écriture directe, hors mécanisme, sans journal ; aucun geste du pilotage ne les rétablit | question à Benjamin |
| SRV-02 | **P2** | confirmé (catalogue) | agent | Notifications : un contrôle serveur manque sur une écriture cliente (détail au dossier privé) | migration à préparer (critique) |
| SRV-03 | **P2** | confirmé (statique + catalogue) | agent | Modifier un commentaire d'activité n'atteint jamais la base (colonne `content` inexistante, aucune policy UPDATE) : « Commentaire modifié » puis « Modification refusée » | lot 2 (client) |
| ETAT-04 | **P2** | confirmé (statique) | agent | « Supprimer pour tous », supprimer un commentaire, quitter un groupe : annoncés sans verdict ni rejeu | lot à préparer |
| ETAT-05 | **P2** | confirmé (statique) | agent | File des suppressions : « 0 ligne + relecture vide » vaut preuve même sans session de l'auteur | lot à préparer |
| ETAT-06 | **P2** | confirmé (statique) | agent | Le bandeau rouge « Se reconnecter » passe par `doLogout` : il purge ce qui n'était pas parti | lot critique à préparer |
| ETAT-07 | **P2** | confirmé (statique) | agent | Au démarrage, la conversation locale est remplacée par celle du serveur : bulle texte en échec et brouillon perdus | lot 2 (client) |
| ETAT-08 | **P2** | confirmé (statique) | agent | Désabonnement, déblocage, désinscription reviennent (fusion en union) ; « ne plus suivre » sans verdict | lot à préparer |
| ETAT-09 | **P2** | confirmé (statique) | agent | Commentaire d'activité : échec muet, commentaire fantôme durable | lot à préparer |
| STAB-10 | **P2** | confirmé | coord. | La PAGE minifiée qui part en production n'est testée par rien : la minification a lieu dans le job de déploiement, après tous les tests | lot CI (critique) |
| STAB-01 | P3 | confirmé, **corrigé** | coord. | Chargeur des 9 scripts : un `load` rejoué lève 9 erreurs par page (vu en production le 10/11) | **PR #822** |
| STAB-02 | P3 | confirmé | coord. | `onload` d'une couverture du fil : `this.parentNode` nul quand l'image est détachée (vu en production, iPhone / Instagram) | lot 2 (client) |
| STAB-03 | P3 | confirmé | coord. | Les robots de prévisualisation (écran 2000 × 2000, plateforme Linux sous agent « Windows ») sont comptés dans l'audience | décision de mesure |
| SRV-04 | P3 | confirmé | agent | « Description mise à jour » d'un groupe : aucune policy UPDATE, jamais relue | lot à préparer |
| SRV-05 = STAB-06/07 | P3 | confirmé | coord. + agent | Rien ne purge stories expirées (8 sur 8, lisibles par l'API), lives périmés (9 en `live`), notifications anciennes, 178 conversations sans membre dont 65 laissées par `authz-critical` en production | migration à préparer |
| SRV-06 | P3 | confirmé | agent | 5 fonctions et 1 déclencheur de production sans `CREATE` au dépôt ; 16 migrations sans ligne de journal | migration de reprise |
| SRV-07 | P3 | confirmé | agent | Pseudo : une règle annoncée par le client n'est pas tenue par la base (détail au dossier privé) | décision |
| SRV-08 | P3 | confirmé (catalogue) | agent | Remontée d'erreurs : un plafond mal partagé (détail au dossier privé) | migration à préparer |
| STAB-08 | P3 | confirmé | coord. | La page de production s'intitule « PASSIO – MVP Beta », description « MVP beta testable. » | lot 2 (libellés) |
| STAB-09 | P3 | confirmé | coord. | Texte de confidentialité § 2 ter : `bio` et `rs_links` d'un compte privé sont lisibles par tous, le texte ne les cite pas | validation juridique |
| ETAT-10…14, SRV-09…10 | P3 | voir rapports | agent | réponse rejouée non idempotente ; réactions sans verdict ; clés hors purge ; état illisible → vide en silence ; courses de démarrage ; instantané de partage ; appels dormants | rapports |
| STAB-11 | P4 | confirmé | coord. | Une suite réécrit des fichiers versionnés (`docs/captures/ui-6a0/*.png`) à chaque passage local | lot 2 |
| SRV-11, ETAT-15 | P4 | confirmé | agent | surface morte exposée ; commentaires que le code contredit | ménage |

**Où est le détail.** Ce dépôt est PUBLIC. Comme pour l'audit de sécurité du 06/11 (« le rapport reste hors du dépôt »), les rapports
complets des agents — scénarios pas à pas compris — ne sont PAS versionnés tant que leurs findings serveur sont ouverts. Ils sont sur le
poste de Benjamin, dans un dossier ignoré par git : `.passio/reviews/2026-11-10-audit-stabilisation/rapports/`
(`SRV-securite-serveur-donnees.md`, `ETAT-etat-local-synchronisation.md`), avec les preuves et les outils de sonde. Ce registre n'en garde
que ce qui ne donne pas de mode d'emploi.

---

## STAB-01 — Chargeur du bloc app : un `load` rejoué lève 9 erreurs par page — P3 — confirmé — corrigé (PR #822)

- **Composant** : `scripts/build.js` (chargeur inline de la page de production).
- **Preuve** : `client_errors` 211 à 220 et 19 `window_error` du 2026-11-10 12:18 UTC, version `7dade60f` ; pile `suivant` ← `s.onload`, colonne 199000 = la lecture `scripts[i][0]`. Deux pages arrivées par `?fbclid=`, écran 2000 × 2000.
- **Reproduction** : `preuves/repro-chargeur-chromium-avant.json` — artefact de production reconstruit localement, 9 `load` rejoués → 9 erreurs au message de la production.
- **Attendu / observé** : un événement rejoué ne fait rien / `i++` puis `suivant()` au-delà du dernier script.
- **Impact** : aucun pour un visiteur ; 9 fausses erreurs de production par passage de robot (veille, Sentinelle).
- **Cause racine** : écouteurs `onload` / `onerror` jamais désarmés.
- **Correction** : désarmement au premier appel. **Non-régression** : `app-scripts-par-fichier.spec.js` ⑨ (rouge avant : 18 erreurs ; vert après ; Chromium et WebKit).
- **Risque** : critique (`scripts/build.js`) — contre-revue de PASSIO74 requise.

## STAB-02 — `onload` d'une couverture : `this.parentNode` nul — P3 — confirmé

- **Composant** : `js/app-02-state-utils.js:10166` (`renderPostCover`).
- **Preuve** : `client_errors` 210, 2026-11-10 12:18:00 UTC, iPhone / navigateur intégré d'Instagram : `TypeError: null is not an object (evaluating 'this.parentNode.classList')`, `onload@…:1:51` — la colonne 51 de l'attribut. Reproduit sous WebKit et Chromium (`preuves/repro-chargeur-webkit-avant.json`, bloc `apresB`), au message exact.
- **Scénario** : le fil est repeint pendant qu'une image `/demo/u/…` charge ; son `load` arrive sur un nœud détaché.
- **Impact** : aucun effet visible ; une erreur de production par occurrence.
- **Correction** : `var p=this.parentNode;if(p&&…)p.classList.add('cover-ok')`. **Autres occurrences** : aucune autre lecture `this.parentNode` / `parentElement` / voisin dans un gestionnaire inline (cherché dans `js/*.js` et `index.html`).
- **Risque** : normal.

## STAB-03 — Des robots comptés comme des visiteurs — P3 — confirmé

- **Preuve** : télémétrie du 10/11 12:17–12:19 UTC : `session start`, `first_run_started`, `page_load` et 18 `window_error` sous `platform = linux`, `screen_size = 2000x2000`, `meta.trafic` vide, alors que l'agent déclaré de l'une des deux pages est « Windows NT 10.0 … Chrome/139 ». `detecterTrafic` (`js/telemetry.js:228-236`) ne reconnaît que `navigator.webdriver`, une liste d'agents nommés, et l'iPhone émulé.
- **Impact** : visiteurs, entonnoir des liens et « première visite » gonflés à chaque lien partagé sur Facebook ou Instagram — précisément le canal d'acquisition.
- **Correction recommandée** (décision de mesure, non faite) : classer `robot` un agent dont la plateforme déclarée contredit `navigator.platform`, et l'écran carré 2000 × 2000 ; les trois lecteurs partagent la définition (`tests/unit/trafic-hors-public.test.mjs`).

## STAB-04 — Tout compte neuf naît privé — P1 (décision produit) — confirmé

- **Composant** : `js/app-08-ui-modals-tour.js:3646-3664` (`_confidentialiteDeLaLigneMinimale`), PR #226 du 2026-08-31 (« PRIVÉ PAR DÉFAUT quand le choix est inconnu… l'onboarding ne propose aucun contrôle de confidentialité »).
- **Preuve (production, canal ① et sonde anonyme, 10/11)** : `profiles.is_private` a pour défaut serveur `false`, mais **9 profils sur 13 sont privés**, dont **7 des 8 créés depuis septembre** (le seul public a `privacyChoisi = true`). 36 publications sur 37 appartiennent à un compte privé. Un visiteur sans compte lit **1** publication réelle (`GET /rest/v1/posts` : `0-0/1`). Cinq comptes privés n'ont jamais exprimé de choix (`isPrivate` absent de leur état).
- **Ce n'est pas un défaut de code** : la règle est écrite (« Règle produit (Benjamin, 2026-08-31) »), verrouillée par des tests (`profil-identite-serveur-autoritaire.spec.js:129`, « aucun choix prouvé → privé »). Elle est née d'un correctif de confidentialité P0 légitime (ne jamais rendre public par accident).
- **Ce que la mesure dit pour un lancement** : la promesse est « Découvrir → Partager → Rencontrer ». Avec cette règle, ce qu'un nouvel inscrit publie n'est vu de personne (il n'a pas d'abonné), le fil réel des autres reste vide, et rien ne le lui dit.
- **Options** (à trancher, aucune n'est implémentée) : ① garder — et le dire à l'inscription et sur le profil ; ② demander le choix pendant l'onboarding (une preuve explicite, conforme à la règle du 31/08) ; ③ public par défaut pour un compte NEUF, privé seulement pour une ligne ambiguë.
- **Risque de tout changement** : critique (confidentialité) — contre-revue.

## STAB-05 — 35 publications sur 37 masquées hors mécanisme — P2, P1 si non voulu — confirmé

Voir SRV-01 (rapport SRV du dossier privé), établi indépendamment par le coordinateur et par l'agent, aux mêmes chiffres.
`contenus_masques` : 35 lignes, `signaleurs = 0`, `decision = 'garde'`, un seul instant de pose (`2026-11-04 13:25:36.194882+00`) ;
tout ce qu'ont publié 3 comptes. Aucun signalement de publication, aucune ligne de journal de modération (le déclencheur de journal
date du 07/11), aucun script du dépôt n'écrit cette table en bloc. `deciderMasquage` n'agit que sur `decision IS NULL` :
**aucun geste du pilotage ne rétablit une ligne « garde »**. L'en-tête de `migration_securite_lot1_2026-11-06.sql:31` notait
déjà « `contenus_masques` du 04/11 (question à l'éditeur) » : la réponse n'est écrite nulle part.
**Aucune écriture n'a été tentée** : si le masquage n'est pas voulu, le geste de données est à préparer et à relire (canal ② ou ③).

## STAB-06 / STAB-07 — Stories et lives jamais purgés — P3 — confirmé

Voir SRV-05. 8 stories sur 8 ont plus de 24 h (26/06 → 01/09) ; la policy de lecture n'a aucune borne de temps : 5 sont lisibles
sans compte par l'API, alors que l'application ne les montre que 24 h (`supaLoadStories`, `gte("created_at", since)`).
9 `video_lives` en `live` dont le dernier signe date d'août. 10 tâches cron, aucune sur ces tables.

## STAB-08 — Titre « MVP Beta » en production — P3 — confirmé

`index.html:5` `<title>PASSIO – MVP Beta</title>`, `:7` description « … MVP beta testable. » ; les balises `og:` disent déjà
« PASSIO — Le réseau social de tes passions ». Seule `smoke.spec.js:38` lit le titre (`/PASSIO/i`). Correction proposée dans le lot 2.

## STAB-09 — Ce que protège un compte privé : le texte et le serveur ne disent pas la même chose — P3 — confirmé

`js/legal-textes.js:238` : « Ton pseudo, ton avatar, ta photo de couverture et tes passions restent visibles de tous ».
Sonde anonyme du 10/11 : `profiles` rend aussi `bio` et `rs_links` (liens vers d'autres réseaux) des 9 comptes privés.
Correction : compléter le texte, ou fermer ces deux colonnes — validation juridique nécessaire, non faite.

## STAB-10 — La page qui part en production n'est testée par rien — P2 — confirmé

- **Preuve** : `deploy.yml`, job « Déploiement production » : `html-minifier-terser --minify-js` puis `clean-css` s'exécutent APRÈS tous les jobs de test ; seul `verifier-integrite-app.js` relit la page. Le job « Gates artefact production (dist) » joue 2 suites sur la page NON minifiée. `scripts/servir-dist.js` l'écrit lui-même : « Ce que ça ne prouve PAS : le comportement APRÈS minification de la PAGE ».
- **Ce que l'audit a fait à la place** : reconstruit localement la page minifiée, la feuille de style minifiée, `sw.js` et les 9 scripts — **identiques à l'octet à la production** (sha256 `4649d4dd…` pour la page) — voir `05-VERIFICATIONS.md`.
- **Correction recommandée** : un job qui construit ET minifie comme le déploiement, joue au moins la fumée et les gates sur ces octets, et dont le déploiement publie l'artefact (au lieu de le reconstruire). Périmètre critique (`.github/`).

## STAB-11 — Une suite réécrit des fichiers versionnés — P4 — confirmé

`tests/e2e/ui-v6a0-activite.spec.js:230` écrit `docs/captures/ui-6a0/creer-activite-{320,390,430}.png` à chaque passage :
après `npm run test:local`, l'arbre est modifié (constaté le 10/11). Risque : captures commitées par inadvertance.
