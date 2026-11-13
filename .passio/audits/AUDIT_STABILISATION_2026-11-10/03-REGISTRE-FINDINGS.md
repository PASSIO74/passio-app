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

**Un P0, corrigé en PR (#823, ni fusionnée ni déployée)** : CLI-01. Les huit domaines ont rendu leur rapport (six après la reprise de 17:31 UTC).
Les findings marqués `agent` sont des lectures : **non revérifiés par le coordinateur**, sauf mention.

| ID | Prio | Statut | Qui | En une ligne | Suite |
|---|---|---|---|---|---|
| CLI-01 | **P0** | confirmé, **corrigé** (client #823 ; serveur #843 : forme du pseudo et co-organisateurs uuid, appliquée au staging puis en production) | agent, puis coord. (code, catalogue de production, exécution sur serveur simulé) | Profil visité : une valeur reçue était écrite sans échappement dans un attribut (détail au dossier privé). Production : aucune ligne de la forme en cause | **PR #823** |
| PIL-01 | **P1** | confirmé (statique) | agent | Le pilotage en ligne tient à un seul facteur, sur l'origine et la session de l'application publique (second facteur suspendu le 08/11, #793) | décision de Benjamin |
| STAB-04 | **P1** (décision produit) | confirmé, **corrigé** (PR #833, décision du 12/11 : « public ») | coord. | Depuis le 31/08 (#226), tout compte neuf naît PRIVÉ : 9 profils sur 13, 36 publications sur 37 invisibles hors abonnés, 1 seule publication réelle visible d'un visiteur. Les comptes existants restent tels quels. | décision de Benjamin |
| ETAT-01 | **P1** | confirmé (statique), **corrigé** (PR #836, critique) | agent | Le rejeu de la file d'état remplace un état serveur plus récent par un instantané plus ancien (perte silencieuse à plusieurs appareils) | lot critique à préparer |
| ETAT-02 | **P1** | confirmé, **corrigé** (PR #827, critique) | agent, puis coord. (code, SDK, verrous) | Se déconnecter d'un appareil tue la session des autres (`signOut` global), et l'application n'y voit rien : aucun écouteur `SIGNED_OUT` | lot critique à préparer |
| ETAT-03 | **P1** | confirmé, **corrigé** (PR #826) | agent, puis coord. (code + verrous) | « Profil mis à jour » annoncé même quand l'écriture a échoué — dont le passage en compte privé ; `is_private` repart sans geste une fois le marqueur posé | lot 2 (client) |
| STAB-05 = SRV-01 | **P2** (P1 si non voulu) | confirmé, **réglé** (PR #834, décision du 12/11 : « ménage ») — appliquée en production le 12/11, mesurée au canal ① | coord. + agent | 35 publications sur 37 masquées le 04/11 à 13:25:36 UTC par une écriture directe, hors mécanisme, sans journal ; aucun geste du pilotage ne les rétablit. Le 12/11 : les 33 restantes supprimées avec leurs 28 commentaires, 29 « j'aime » et 128 interactions, après sauvegarde ; 35 notes au journal de modération. 5 médias restent dans le stockage. | question à Benjamin |
| SRV-02 | **P2** | confirmé (catalogue), **corrigé** (#843 : nom et phrase posés par le serveur, liens message et activité exigés, avis de suppression serveur ; appliquée au staging et en production le 12/11, mesurée) ; **reste** (événement métier par genre) **corrigé** (#883, fusionnée et déployée le 13/11 : client au verdict de l'écriture + `trg_notifications_preuve`, appliquée au staging puis en production le 13/11, mesurée au canal ①, essai à deux comptes réels en production) | agent | Notifications : un contrôle serveur manque sur une écriture cliente (détail au dossier privé) | migration à préparer (critique) |
| SRV-03 | **P2** | confirmé, **corrigé côté client** (PR #826) | agent, puis coord. (code + verrous) | Modifier un commentaire d'activité n'atteint jamais la base (colonne `content` inexistante, aucune policy UPDATE) : « Commentaire modifié » puis « Modification refusée » | lot 2 (client) |
| ETAT-04 | **P2** | confirmé (statique), **corrigé** (quitter un groupe : #836 ; supprimer un commentaire : FIL-C06, 10/11 ; « supprimer pour tous » : #852) | agent | « Supprimer pour tous », supprimer un commentaire, quitter un groupe : annoncés sans verdict ni rejeu | lot à préparer |
| ETAT-05 | **P2** | confirmé (statique), **corrigé** (#852 : session de l'auteur exigée, attente sans essai consommé, propriétaire réel) | agent | File des suppressions : « 0 ligne + relecture vide » vaut preuve même sans session de l'auteur | lot à préparer |
| ETAT-06 | **P2** | confirmé, **corrigé** (PR #827) | agent, puis coord. (code + verrous) | Le bandeau rouge « Se reconnecter » passe par `doLogout` : il purge ce qui n'était pas parti | lot critique à préparer |
| ETAT-07 | **P2** | confirmé, **corrigé** (PR #826) | agent, puis coord. (code + verrous) | Au démarrage, la conversation locale est remplacée par celle du serveur : bulle texte en échec et brouillon perdus | lot 2 (client) |
| ETAT-08 | **P2** | confirmé (statique), **corrigé** (#852 : lecteurs à `null` sur échec, remplacement sous session vérifiée, verdict de « ne plus suivre ») | agent | Désabonnement, déblocage, désinscription reviennent (fusion en union) ; « ne plus suivre » sans verdict | lot à préparer |
| ETAT-09 | **P2** | confirmé (statique), **corrigé** (PR #836) | agent | Commentaire d'activité : échec muet, commentaire fantôme durable | lot à préparer |
| STAB-10 | **P2** | confirmé, corrigé (#868) | coord. | La PAGE minifiée qui part en production n'est testée par rien : la minification a lieu dans le job de déploiement, après tous les tests | lot CI (critique) |
| STAB-01 | P3 | confirmé, **corrigé** | coord. | Chargeur des 9 scripts : un `load` rejoué lève 9 erreurs par page (vu en production le 10/11) | **PR #822** |
| STAB-02 | P3 | confirmé | coord. | `onload` d'une couverture du fil : `this.parentNode` nul quand l'image est détachée (vu en production, iPhone / Instagram) | lot 2 (client) |
| STAB-03 | P3 | confirmé | coord. | Les robots de prévisualisation (écran 2000 × 2000, plateforme Linux sous agent « Windows ») sont comptés dans l'audience | décision de mesure |
| SRV-04 | P3 | confirmé, **corrigé côté client** (PR #836 : le refus se dit et l’ancienne description revient ; sans policy UPDATE, la modification reste impossible — décision produit) | agent | « Description mise à jour » d'un groupe : aucune policy UPDATE, jamais relue | lot à préparer |
| SRV-05 = STAB-06/07 | P3 | confirmé, **corrigé** (#843 : purge de nuit bornée, premier passage le 12/11 : 153 conversations vides, 8 stories, 9 directs clos, 107 notifications lues anciennes, orphelins) | coord. + agent | Rien ne purge stories expirées (8 sur 8, lisibles par l'API), lives périmés (9 en `live`), notifications anciennes, 178 conversations sans membre dont 65 laissées par `authz-critical` en production | migration à préparer |
| SRV-06 | P3 | confirmé | agent | 5 fonctions et 1 déclencheur de production sans `CREATE` au dépôt ; 16 migrations sans ligne de journal | migration de reprise |
| SRV-07 | P3 | confirmé | agent | Pseudo : une règle annoncée par le client n'est pas tenue par la base (détail au dossier privé) | décision |
| SRV-08 | P3 | confirmé (catalogue), **corrigé** (PR #838 ; appliquée au staging puis en production le 12/11, mesurée au canal ①) | agent | Remontée d'erreurs : un plafond mal partagé (détail au dossier privé) | migration à préparer |
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

## STAB-10 — La page qui part en production n'est testée par rien — P2 — confirmé, corrigé (#868, 2026-11-13)

- **Preuve** : `deploy.yml`, job « Déploiement production » : `html-minifier-terser --minify-js` puis `clean-css` s'exécutent APRÈS tous les jobs de test ; seul `verifier-integrite-app.js` relit la page. Le job « Gates artefact production (dist) » joue 2 suites sur la page NON minifiée. `scripts/servir-dist.js` l'écrit lui-même : « Ce que ça ne prouve PAS : le comportement APRÈS minification de la PAGE ».
- **Ce que l'audit a fait à la place** : reconstruit localement la page minifiée, la feuille de style minifiée, `sw.js` et les 9 scripts — **identiques à l'octet à la production** (sha256 `4649d4dd…` pour la page) — voir `05-VERIFICATIONS.md`.
- **Correction recommandée** : un job qui construit ET minifie comme le déploiement, joue au moins la fumée et les gates sur ces octets, et dont le déploiement publie l'artefact (au lieu de le reconstruire). Périmètre critique (`.github/`).
- **Corrigé (#868, 2026-11-13)** : la page est minifiée par `scripts/build.js` (étape 6 ter, arbre `dist/` identique à l'octet à l'ancien chemin) ; « Gates artefact » joue `release-integrity`, `passion-context` et la fumée sur la page minifiée, puis publie l'empreinte de l'arbre servi ; le déploiement reconstruit et refuse d'envoyer un `dist/` d'une autre empreinte (`scripts/empreinte-dist.js`). Reste : le déploiement reconstruit au lieu de publier l'artefact du test — déterministe, prouvé à chaque envoi.

## STAB-11 — Une suite réécrit des fichiers versionnés — P4 — confirmé

`tests/e2e/ui-v6a0-activite.spec.js:230` écrit `docs/captures/ui-6a0/creer-activite-{320,390,430}.png` à chaque passage :
après `npm run test:local`, l'arbre est modifié (constaté le 10/11). Risque : captures commitées par inadvertance.

---

## Findings des six domaines rendus après la reprise (résumé — détail au dossier privé)

Tous `agent`, analyse statique ou catalogue, **non revérifiés par le coordinateur** sauf CLI-01. Les lignes de sécurité sont
volontairement dites sans mode d'emploi.

### Sécurité côté client (CLI)

| ID | Prio | Statut | En une ligne |
|---|---|---|---|
| CLI-01 | P0 | confirmé, corrigé (#823) | voir plus haut |
| CLI-02 | P2 | confirmé (client) | Un message de forme inattendue casse l'affichage des conversations de son destinataire |
| CLI-03 | P2 | confirmé | L'arrivée par un lien d'authentification forgé bascule de compte et purge l'état local (réglage par défaut du SDK) |
| CLI-04 | P2 | confirmé | Un média d'autrui peut être servi par un hôte tiers |
| CLI-05 | P3 | confirmé | Le gate `audit-echappement` ne tient pas le contexte « attribut » ; 24 des 65 entrées de son socle sont périmées |
| CLI-06 / 07 / 08 | P3–P4 | confirmé | identité d'affichage d'un live ; `?equipe=1` et `?telemetry=0` durables depuis un lien reçu ; observations |

Ce qui tient : aucun `escapeHtml` dans un attribut `on*` ; 349 interpolations `on*` sur 364 par `escapeJsArg` (les 15 autres relues) ;
messages, notifications, fiche d'activité et marqueurs de carte en `textContent` ou échappés (B-01 tient) ; fonctions de bord en listes
fermées ; **aucun secret dans l'historique complet** (4 111 commits, 19 motifs — R14 largement levé) ; MapLibre toujours en 4.7.1, mais le
contrôle vulnérable n'est plus utilisé (R9).

### Pilotage, Sentinelle, agents (PIL)

| ID | Prio | Statut | En une ligne |
|---|---|---|---|
| PIL-01 | P1 | confirmé | voir plus haut |
| PIL-02 | P2 | confirmé (catalogue), non reproduit | La télémétrie peut être saturée sans compte ; le voyant reste alors vert |
| PIL-03 | P2 | confirmé (données réelles) | « Régler » sur une exécution en échec lance un agent qui ne peut pas exécuter son ordre (PR #808, #809) |
| PIL-04 | P2 | confirmé | Une erreur de visiteurs sans compte n'a ni enquête ni alerte, et l'écran dit « rien à corriger » |
| PIL-05 | P2 | confirmé | Les robots sans signature comptent comme du public (= STAB-03) |
| PIL-06 … 13 | P3–P4 | confirmé | geste envoyé deux fois ; une réparation peut modifier son propre capteur (`pilotage/` et les capteurs ne sont pas classés critiques) ; six gestes sans trace en base ; interrupteurs distants jamais exercés en production ; seuil « Sentinelle muette » sous la cadence réelle de GitHub ; documents décrivant une auto-fusion qui n'existe plus ; balayage des secrets rouge et muet |

Ce qui tient : **un tiers ne peut rien déclencher dans la chaîne d'agents GitHub** (issue ET ordre de PASSIO74 exigés ; 102 événements de
tiers sortis `skipped` en 14 jours) ; plus d'auto-fusion ; `reglages_distants` sans écriture cliente ; agent distant en liste blanche
d'outils, sans réseau ; `main` protégée, administrateurs compris.

### Exploitation, CI, récupération, lancement (EXPL)

| ID | Prio | Statut | En une ligne |
|---|---|---|---|
| EXPL-01 | P2 | non vérifié | Archives chiffrées en `age` depuis le 07/11 : aucun déchiffrement éprouvé avec la clé privée |
| EXPL-02 | P2 | confirmé | La veille lit l'âge du dernier run d'une sauvegarde, jamais sa conclusion : un échec chaque nuit resterait « ok » |
| EXPL-03 | P2 | confirmé, corrigé (#868) | = STAB-10 (la page minifiée n'est testée par rien) |
| EXPL-04 | P2 | confirmé | `netlify-cli` installé sans lockfile avant de recevoir le jeton de déploiement |
| EXPL-05 | P2 | confirmé | Retour arrière exercé une seule fois, le 14/09, avant les 9 scripts et `integrity` ; `rollback.yml` : zéro run |
| EXPL-06 | P2 | confirmé | Une panne totale de Supabase n'est vue que par les crons GitHub : écart médian 5,7 h, maximum 10,6 h |
| EXPL-07 | P2 | confirmé | Procédure d'incident non adoptée : responsable et suppléant non nommés, un seul compte GitHub |
| EXPL-08 … 14 | P3–P4 | confirmé | gitleaks hebdomadaire rouge (64 constats publics ou de test) ; deux audits statiques hors de tout workflow ; `ask-ai` déployée sans porte dans l'interface ; politique de confidentialité incomplète sur les sous-traitants ; documents périmés |

Ce qui tient : protection de `main` (PR obligatoire, deux contrôles, `enforce_admins`) ; 18 déploiements verts sur 20, 17,4 min de
médiane ; **30 sauvegardes sur 30** ; restauration éprouvée de bout en bout sur le staging (14/09, 15/09, 21/10) ; `npm audit` à 0 ;
DKIM et DMARC en place. Écart avec `AGENTS.md` : zéro approbation exigée par GitHub, et la « contre-revue » est un commentaire du compte unique.

### Parcours et couverture (PARC)

| ID | Prio | Statut | En une ligne |
|---|---|---|---|
| PARC-01 | P2 | confirmé | Sur une activité, j'aime, réaction, GIF et commentaire : ni porte visiteur ni lecture du verdict ; « Réaction envoyée » avant l'écriture |
| PARC-02 | P2 | confirmé | « Nouveau groupe » ne propose que dix comptes de démonstration, en exige un, puis annonce « Groupe créé » |
| PARC-03 | P2 | confirmé | Toucher « a aimé / réagi à ton événement » n'ouvre rien |
| PARC-04 | P2 | confirmé (latent) | Une demande d'abonnement en attente est comptée comme abonné |
| PARC-05 | P2 | confirmé | Réglages sans effet : notifications, contenu sensible, langue, temps d'écran, mode pause |
| PARC-06 | P2 | confirmé | Récupération de mot de passe : aucun test ne l'exécute ; refus serveur en anglais brut |
| PARC-07 / 10 | P2 | confirmé | Inscription jamais jouée sur WebKit ni avec un vrai e-mail ; signalement, pointage, note, annulation, export, push jamais joués contre un vrai serveur |
| PARC-08 … 13 | P3–P4 | confirmé | suite de verrou jamais exécutée ; version des CGU jamais comparée ; sous-cas 12c sauté en production ; = STAB-04 |

Ce qui tient : chaque refus d'inscription ou de connexion est dit en français, avec le renvoi du lien ; `setEventRsvp` exemplaire et
joué en réel sur le staging ; suppression de compte et export sans succès annoncé à tort ; aucune porte vers Wallet, Passia, points ou Carnet.

### PWA, mobile, accessibilité (PWA)

| ID | Prio | Statut | En une ligne |
|---|---|---|---|
| PWA-01 | P2 | confirmé (mécanisme) | Le démarrage attend deux requêtes sans délai (page, SDK) : sur réseau présent mais muet, l'application installée reste blanche |
| PWA-02 | P2 | confirmé | Quand le chargeur abandonne : ni message, ni télémétrie, ni reprise |
| PWA-03 | P2 | confirmé (Chrome iOS) | « Installer l'application » recharge la racine au lieu d'ouvrir Safari ; aucun navigateur intégré n'est détecté |
| PWA-12 | P2 | confirmé | Accessibilité : placeholders à 2,06:1 seuls libellés d'une vingtaine de champs, toasts d'erreur effacés en 3 s, 22 gabarits d'image sans `alt` |
| PWA-04 … 14 | P3–P4 | voir rapport | = STAB-02, STAB-03 ; page rechargée après chaque déploiement ; faux bandeau hors-ligne ; `netlify.toml` gagne sur `_headers` pour `/sw.js` ; manifeste sans `id` |

Réponse à l'observation du chargeur : aucun navigateur ne rejoue un `load` de lui-même (ni bfcache, ni prérendu) — événements
synthétiques d'un automate. **Aucun appareil réel** : 14 manipulations exactes sont écrites au rapport pour iPhone et Android.

### Performance, capacité, coûts (PERF)

| ID | Prio | Statut | En une ligne |
|---|---|---|---|
| PERF-01 | P2 | confirmé (mur calculé) | `fil_compteurs` : 47,9 ms par appel ; coût qui croît avec l'engagement |
| PERF-02 | P2 | confirmé | Démarrage d'un compte ≈ 54 requêtes en 25 s ; `supaInit()` deux fois ; `user_state` lu 2,85 fois et réécrit 3,74 fois sans changement |
| PERF-03 | P2 | confirmé | Télémétrie au repos : 74 % des requêtes d'un visiteur |
| PERF-04 | P2 | confirmé / suspecté | Image d'exemple `/demo` : 139 Ko, cache de bord non servi |
| PERF-05 | P2 | confirmé | Le banc de charge ne joue ni `fil_compteurs`, ni la télémétrie, ni `user_state`, ni le démarrage |
| PERF-06 … 10 | P3 | confirmé | ≈ 290 Ko évitables par version ; trois bornes de taille différentes ; index et table jamais nettoyés |

**Aucune capacité n'est mesurée pour le code servi.** Mesuré : 630 Ko (brotli) avant le premier écran ; ≈ 272 requêtes par heure au
repos pour un visiteur, ≈ 572 pour un compte. Calculé, hypothèses écrites au rapport : S (100 inscrits / 20 simultanés) tient avec une
marge de plus de dix ; M (1 000 / 100) tient en calcul, avec deux réserves ; **L (10 000 / 500) ne tient pas en l'état** — premiers
murs, dans l'ordre : e-mails d'inscription, 500 connexions temps réel (vers 330 à 400 simultanés), télémétrie, calcul partagé.
