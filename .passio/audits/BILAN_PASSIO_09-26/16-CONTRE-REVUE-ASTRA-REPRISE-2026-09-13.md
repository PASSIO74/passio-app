# Contre-revue GPT-6 Astra — REPRISE après interruption (2026-09-13)

> Ce document remplace `15-CONTRE-REVUE-ASTRA-PROMPT.md`, écrit le 2026-09-05 et **périmé** :
> il désigne un SHA qui n'est plus en production, une branche dont la PR est fusionnée depuis,
> et un verdict qui portait sur un produit payant. Le bloc ci-dessous est à coller tel quel.

```text
CONTRE-REVUE INDÉPENDANTE — PASSIO — REPRISE APRÈS INTERRUPTION
Date de reprise : 2026-09-13. Tu es GPT-6 Astra, relecteur indépendant.

═══════════════════════════════════════════════════════════════════
0. CE QUI T'EST ARRIVÉ, ET POURQUOI CE PROMPT N'EST PAS L'ANCIEN
═══════════════════════════════════════════════════════════════════
Le 2026-09-05, on t'a confié la contre-revue du « BILAN PASSIO 09/26 », un audit rendu par
Claude Code (Fable 5.1) le 2026-09-04 : verdict NO-GO, 8 P0, 192 problèmes, 462 contrôles.
Tu as été interrompu en cours de route, faute de crédits. Tu as de nouveau des crédits.

Ne reprends PAS où tu t'étais arrêté. Entre-temps le produit a changé sous tes pieds :
109 commits, 75 pull requests fusionnées, 11 migrations SQL appliquées en production,
+137 540 lignes. L'ancien ordre de mission te demandait de vérifier un code figé au SHA
c8cb8e99 ; ce code n'est plus en production, et la moitié des défauts que tu devais
vérifier n'existent plus. Vérifier c8cb8e99 aujourd'hui serait un travail juste et inutile.

Ta mission est réécrite en §6. Elle est plus dure que l'ancienne, pas plus simple.

═══════════════════════════════════════════════════════════════════
1. LE CADRE A CHANGÉ — C'EST LE POINT LE PLUS IMPORTANT DE CE PROMPT
═══════════════════════════════════════════════════════════════════
Benjamin COMMERCIALISE PASSIO, ET IL LE FAIT GRATUITEMENT. L'application est ouverte au
public, sans code d'accès, sans encaissement d'aucune sorte. Le rideau « bêta privée »
(code 2125) est levé depuis le 2026-09-11 ; il ne s'arme plus que sur un drapeau local.

Cela déplace le verdict que tu dois rendre, dans les deux sens :

CE QUI DEVIENT SANS OBJET. Tout ce que l'audit du 04/09 jugeait au regard d'un service
PAYANT : CGV, information précontractuelle, droit de rétractation, TVA, droit de la
consommation marchande, garantie de conformité. Il n'existe aucun chemin d'encaissement
dans le dépôt (recherche exhaustive : ni Stripe, ni PayPal, ni Paddle, ni achat intégré),
et les CGU en vigueur FONDENT l'exonération de responsabilité sur la gratuité (art. 2 et
art. 10). Ne recote pas ces points : dis qu'ils sont caducs tant que rien n'est encaissé,
et signale que le jour où un euro entre, les articles 2 et 10 des CGU deviennent faux et
doivent être RÉÉCRITS, pas complétés.

CE QUI DEVIENT PLUS GRAVE, PAS MOINS. « Gratuit » n'allège aucune obligation envers les
personnes : RGPD, DSA (règlement UE 2022/2065, art. 16 — notice & action), LCEN art. 1-1,
protection des mineurs, sécurité des données. Un service gratuit ouvert à des inconnus
expose EXACTEMENT les mêmes personnes qu'un service payant. Et l'ouverture publique
change l'échelle : les défauts qui étaient tolérables devant 5 comptes connus ne le sont
plus devant un public qui ne connaît pas Benjamin et ne lui a rien pardonné d'avance.

Le verdict que tu dois rendre n'est donc PAS « peut-on commercialiser ». C'est :
  « PASSIO, gratuite et déjà ouverte au public, peut-elle continuer à l'être, et jusqu'à
    quelle échelle, sans exposer ses utilisateurs ni perdre leurs données ? »

═══════════════════════════════════════════════════════════════════
2. LA VERSION À ANALYSER
═══════════════════════════════════════════════════════════════════
Dépôt        : https://github.com/PASSIO74/passio-app  (PUBLIC — tu peux tout lire)
Branche      : main
SHA à auditer: 30cc8851d1f9486d146bbb6448612557cbc7f4bf  (2026-09-13, PR #371)
Ancien SHA   : c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf  (2026-09-04) — référence
               historique seulement. Le delta c8cb8e9..30cc885 EST ton objet d'étude.
Production   : https://passio-app.netlify.app  (vérifie /release.json — tu as le réseau,
               l'audit de Claude Code ne l'avait pas, c'est une preuve qu'il n'a pas pu faire)
Base         : projet Supabase njkiyoklssvefstljemx. La clé anon est PUBLIQUE, dans le
               bundle (js/app-08-ui-modals-tour.js). LECTURE SEULE, aucune écriture.

Le dossier d'audit N'EST PLUS sur une branche séparée : la PR #280 a été FUSIONNÉE le
2026-09-09. Tout est sur main, dans .passio/audits/BILAN_PASSIO_09-26/ :
  00-MANIFESTE · 01-SYNTHESE-BENJAMIN · 02-CARTOGRAPHIE · 03 UX · 04 fonctionnel ·
  05 code · 06 sécurité/données · 07 perf/capacité/coûts · 08 pilotage/Sentinelle ·
  09 appareils/a11y · 10 modération/IRL/exploitation · 11-REGISTRE-DES-RISQUES (les 192) ·
  12-VERDICT-COMMERCIAL · 13-PREUVES-NECESSAIRES (tout ce qui était BLOQUÉ) ·
  14-COUVERTURE-DU-MANDAT · donnees/registre-problemes.json (registre structuré complet) ·
  preuves/ (~400 fichiers).
Issue de suivi #279, toujours ouverte. Ne fais pas `git checkout audit/bilan-...` : inutile.

⚠️ Le dépôt se clone en profondeur COMPLÈTE, jamais en shallow : une session précédente a
cru compter 53 commits là où il y en avait 109, parce que son clone était tronqué et que
`git merge-base --is-ancestor c8cb8e9 HEAD` répondait NON. Fais ce contrôle en premier.

═══════════════════════════════════════════════════════════════════
3. CE QUI A ÉTÉ FAIT PENDANT TON ABSENCE (2026-09-04 → 2026-09-13)
═══════════════════════════════════════════════════════════════════
Chiffres mesurés (API GitHub, branche main, fenêtre du 04/09 12:07 UTC au 14/09) :

  109 commits · 75 PR fusionnées (#285 → #371) · 680 fichiers · +137 540 / −3 597 lignes
  Par jour : 04/09 : 5 (documentaires) · 05 : 1 · 06 et 07 : ZÉRO · 08 : 14 · 09 : 35 ·
             10 : 14 · 11 : 7 · 12 : 23 · 13 : 10
  11 migrations SQL réelles, TOUTES appliquées en production (mesuré, pas déduit)
  27 suites e2e nouvelles (264 cas) : 131 fichiers / 1 053 cas → 158 fichiers / 1 333 cas
  9 bancs SQL nouveaux (tests/sql/*.test.sh, bloquants en CI) + 3 suites unitaires (54 cas)
  npm run verif : 9 → 11 gates statiques · 4 workflows GitHub nouveaux · CLAUDE.md +1 411 l.

LES ONZE CHANTIERS, dans l'ordre où ils ont été menés :

① Sécurité serveur / RLS (08/09, 14 commits). Trois migrations le même jour, chacune avec
  son banc SQL bloquant : admission 18+ (garde de majorité branchée sur les écritures IRL,
  triggers parce qu'un WITH CHECK ne voit que la ligne finale) ; rencontres privées (retrait
  à anon de events.address et events.contact, et de toute event_attendees) ; pièces jointes
  (la policy passio_media_read, SELECT au rôle public sur attachments, est remplacée).

② Juridique (08 → 12/09). CGU, mentions légales LCEN art. 1-1, case de consentement
  #authConsent, PASSIO_EDITEUR.regime (« particulier » : publie l'identité de l'hébergeur
  et rien d'autre — l'anonymat du non-professionnel). Passage de 13 ans à 18 ans révolus.
  Identité propre (passioadmin@gmail.com, domaine passio-app.fr, SMTP Brevo avec DKIM et
  DMARC posés et vérifiés). js/legal-textes.js : les textes sont lisibles SANS le rideau,
  chargés en tête de page, versionnés (PASSIO_CGU_VERSION, PASSIO_CONFIDENTIALITE_VERSION).
  Un LICENSE a été ajouté.

③ Référentiel des passions (08 → 12/09) — le plus gros volume. 1 908 → 5 001 passions,
  9 100 alias. Création d'une passion depuis l'app (fonction SECURITY DEFINER creer_passion,
  public.passions reste non inscriptible, 3 créations offertes à vie). Correction du plafond
  max-rows de PostgREST qui rendait ~900 passions impubliables. Puis, le 12/09, « taper Ski
  ne rendait rien » : trois surfaces cherchaient encore dans les 19 passions du socle embarqué.

④ Messagerie et notifications (09 → 10/09). La notification de message privé n'écrivait
  AUCUNE ligne en base (la fonction corrective était branchée sur une fonction morte —
  défaut trouvé par l'audit de commercialisation du 10/09). File d'envoi qui ne renonçait
  jamais (798 refus rejoués pour 4 messages). Réparation des conversations orphelines
  (19 sur 20 sans conv_members ; conversations n'avait aucune policy DELETE).

⑤ Inscription et onboarding (09 → 13/09). Nom d'utilisateur demandé au formulaire.
  Le vieux tour plein écran ne s'impose plus à un compte neuf. Mot de passe : minimum 8
  caractères, refus du serveur traduits en français, changement exigeant l'ancien mot de
  passe et une réauthentification si la session a plus de 24 h. CAPTCHA Turnstile câblé
  côté client (sitekey vide = inactif : déployable avant l'interrupteur serveur).

⑥ Fiabilité client (09 → 13/09) — la série la plus dense, toujours le même schéma :
  une mesure en production, un correctif, un verrou. 401 sur analytics_events, sur events,
  sur user_state, sur profiles, story_views, conv_reads ; 403 sur push_subscriptions ;
  rejeu des lectures de démarrage coupées par le réseau (448 appels morts mesurés sur
  14 jours) ; « newestWorker is null » sur WebKit.

⑦ Ouverture publique gratuite (11 → 12/09) — le chantier pivot. Sept défauts serveur fermés
  d'un coup : is_conv_member retiré à anon (un oracle qui rouvrait par une fonction une porte
  fermée sur une table), blocage appliqué partout et non plus au seul conv_members, débit
  borné sur 9 tables, reports.status, policies Realtime, seau attachments passé en PRIVÉ,
  comptes privés à acceptation. Plus une red team qui a trouvé dix choses de plus, dont une
  XSS P0 par sonnerie d'appel et un UPDATE sans WITH CHECK qui laissait déplacer un message
  dans une conversation dont on n'est pas membre. SDK Supabase et MapLibre auto-hébergés
  (fin des versions flottantes de CDN), CSP réduite à 'self' plus un seul hôte tiers.
  CDN médias via Edge Function Netlify. Banc SQL de 117 contrôles, 35 cas e2e.

⑧ Sentinelle autonome (09 → 12/09). La détection quitte le PC pour GitHub : lecture horaire
  de client_errors, classement des causes par une fonction pure (26 verrous unitaires),
  ouverture d'une issue [SENTINELLE] étiquetée claude, correctif écrit et PR ouverte par la
  chaîne, auto-fusion. Un défaut a été réparé de bout en bout SANS AUCUN GESTE HUMAIN.

⑨ Centre de pilotage (09 → 13/09). Canal Realtime privé, mesure du disque, sonde
  d'authentification qui ne conclut plus à une déconnexion au premier délai dépassé.

⑩ Exploitation (09 → 13/09). Sauvegarde quotidienne chiffrée en artefact GitHub, DÉCHIFFRÉE
  ET RELUE dans le même run — elle a tourné, verte, le 12/09. Alerte de modération à 24 h.
  Plafonds sur les Edge Functions (ask-ai et notify-call n'en avaient AUCUN : un compte
  confirmé pouvait facturer l'API Anthropic en boucle et réveiller qui il voulait).

⑪ UI et fil (09 → 12/09). L'envie devient un FILTRE au lieu d'être une source (un post
  d'une passion non suivie entrait dans le fil). Avatars redimensionnés. Quatre surfaces
  qui « vieillissaient sans témoin » (landing promettant une fonctionnalité retirée).

ÉTAT MESURÉ DE LA PRODUCTION AU 2026-09-13 (connecteur lecture seule) :
  8 comptes auth (7 confirmés) · 7 profils · 33 publications (3 auteurs) · 74 messages ·
  119 conversations dont 113 VIDES · 9 événements · 2 signalements, tous deux TRAITÉS
  (status='dismissed', handled_at renseigné — file ouverte : 0) · 0 blocage ·
  5 003 passions actives · 32 361 lignes de télémétrie (14 Mo) · 23 erreurs client ·
  irl_adult_only = TRUE · seau attachments public = FALSE.
  Activité réelle sur 7 jours : 796 sessions, 4 comptes actifs, 1 publication.
  ⚠️ Ce produit est ouvert mais encore quasi vide. Aucune mesure de capacité n'a jamais
  été faite, et 8 comptes ne prouvent rien sur 8 000.

═══════════════════════════════════════════════════════════════════
4. LE CROISEMENT DÉJÀ FAIT — ET POURQUOI TU DOIS T'EN MÉFIER
═══════════════════════════════════════════════════════════════════
Claude Code a repris les 65 problèmes P0 et P1 de l'audit du 04/09 et les a confrontés un
par un au code du 13/09, puis a lancé une passe ADVERSARIALE chargée de réfuter chaque
« c'est réglé ». Elle a cassé 5 fermetures sur 9. Résultat consolidé :

    FERMÉ : 4    PARTIEL : 33    OUVERT : 28    (sur 65)

Sur les 8 P0 : AUCUN n'est intégralement fermé. Trois sont OUVERTS, cinq sont PARTIELS.

  P0 OUVERTS (intacts) :
   · SUP-04 — un seul projet Supabase. Les previews de PR et le job CI « Suites production »
     écrivent en PRODUCTION avec la service_role ; un troisième workflow y crée deux comptes
     jetables. L'URL du projet est EN DUR dans index.html et app-08 : rien n'est injecté au
     build. Le projet staging existe (fcksxofaelcdmmifnwjo) et n'a jamais servi.
   · EXP-01 — restauration jamais exécutée. docs/RECUPERATION.md le dit encore lui-même.
     SCHEMA_PROD_REFERENCE.sql est la photo du 17/08 : 36 tables listées contre 41 en prod,
     et il ne contient AUCUN CREATE TABLE exécutable, seulement des CREATE INDEX. Le schéma
     n'est pas reconstructible. Atténuation réelle : l'archive de DONNÉES, elle, est
     désormais produite, chiffrée et relue automatiquement chaque nuit.
   · PERF-01 — capacité toujours non mesurée. Zéro occurrence de k6, artillery ou autocannon
     dans le dépôt. max_connections = 60, identique au 04/09. 70 policies utilisent encore
     auth.uid() au lieu de (select auth.uid()), 24 policies permissives sont doublonnées,
     et conv_reads comme telemetry_events sont toujours dans la publication Realtime.

  P0 PARTIELS (cœur clos, résidu nommé) :
   · SUP-01 / MSG-03 / CONT-11 — le seau attachments est PRIVÉ et l'énumération anonyme est
     morte (mesuré en base, pas déduit) ; le client est passé aux URL signées d'une heure.
     Résidus : le seau `content` reste énuméré sans compte (55 objets, avatars, couvertures,
     photos, vidéos — dont ceux de comptes privés), c'est un choix assumé ; et une pièce
     jointe n'est pas supprimée quand son message l'est, ni quand le compte est supprimé.
   · MSG-01 — l'XSS par invitation d'appel est fermée, éprouvée par réinjection, et les
     canaux Realtime sont privés avec leurs policies en base. Résidu : la policy
     passio_rt_recevoir n'exige pas que le topic ring:<uid> soit celui de l'abonné.
     N'importe quel compte connecté peut donc encore s'abonner à la sonnerie de n'importe
     qui, lire qui l'appelle, et faire sonner sous un faux nom. L'identité de l'appelant
     reste déclarative entre comptes : c'est un résidu ASSUMÉ et écrit, pas un oubli.
   · MOD-01 — la file de signalement est désormais lisible et traçable (colonnes status,
     handled_at, handled_note posées par un trigger ; outil scripts/moderation.js ; alerte
     quotidienne à 24 h). Résidu, et il est lourd : le RETRAIT d'un contenu reste du SQL
     manuel. Aucune policy ni RPC de modération sur posts, post_comments, stories,
     conv_messages, events ; aucun journal moderation_actions ; aucune suspension de compte ;
     aucune interface. Notice & action au sens du DSA n'est donc pas tenable en pratique.

CE QUE LA PASSE ADVERSARIALE A CASSÉ — lis-le, c'est ce qui se rapproche le plus de ton
travail, et tu dois faire mieux :
   · AUTH-03 « CGU et consentement » annoncé FERMÉ → ramené à PARTIEL. Chemin alternatif
     vivant : l'écran d'authentification s'OUVRE en mode connexion ; la case de consentement
     n'est montrée qu'en mode inscription ; or le bouton « Continuer avec Google » n'est
     JAMAIS masqué et aucun code ne le pilote. Un compte peut donc naître par Google sans
     que la case ait été montrée, et l'application fabrique alors un consentement.
   · PRO-01 « référentiel tronqué » annoncé FERMÉ → PARTIEL : le correctif CONTOURNE le
     plafond max-rows sans le neutraliser, et sa condition d'arrêt transformerait une baisse
     de ce plafond en troncature GELÉE pour toute la session.
   · MOD-04 « un bloqué ne peut plus se réabonner » → PARTIEL : la policy serveur est juste,
     mais l'unique écrivain de la ligne `blocks` est un appel client non vérifié, non rejoué
     et non gardé. La garde est bonne, sa condition d'entrée ne l'est pas. (0 blocage en base.)
   · SUP-01 et EXP-09 : voir plus haut.

⚠️ TROIS AVERTISSEMENTS SUR CE CROISEMENT, et ils sont sérieux.
  (a) Il a été produit par Claude Code, c'est-à-dire par l'auteur des correctifs qu'il juge.
      C'est exactement le conflit d'intérêts que ta contre-revue existe pour lever.
      Prends-le comme une PISTE, jamais comme un acquis.
  (b) « PARTIEL » y est sévère par construction : les analystes avaient consigne de
      soupçonner toute fermeture. Un PARTIEL veut souvent dire « le cœur est clos, un résidu
      nommé demeure ». Ne lis pas 33 PARTIEL comme 33 défauts vivants — mais ne lis pas non
      plus un seul d'entre eux comme réglé sans l'avoir mesuré.
  (c) Les 81 problèmes que l'audit du 04/09 n'avait JAMAIS fait relire (domaines irl,
      profils-passions, robustesse-pannes, perf-capacite-couts, appareils-a11y, auth-rgpd,
      exploitation-continuite, tests-ci) ne l'ont toujours pas été par un tiers indépendant.
      Le croisement ne les a pas relus non plus : il a seulement vérifié s'ils existaient
      encore. Une priorité surestimée au 04/09 l'est encore aujourd'hui.

═══════════════════════════════════════════════════════════════════
5. CE QUE PERSONNE N'A PU PROUVER — ET QUE TOI, TU PEUX
═══════════════════════════════════════════════════════════════════
L'audit du 04/09 a rendu 41 contrôles BLOQUÉS (rapport 13), pour une raison bête : son bac
à sable refusait toute sortie réseau vers netlify.app et vers supabase.co. Tu n'as pas cette
limite. Ces preuves-là sont à ta portée, et elles pèsent sur le verdict :

  1. Le fichier RÉELLEMENT servi en production. curl -sI https://passio-app.netlify.app/
     release.json, puis compare le hash d'app.js au build de 30cc885. Personne ne l'a fait.
  2. L'isolation sous rôle, en vrai. Requêtes REST anon directes sur chaque table, avec la
     clé publique : count=exact doit rendre 0 ou du public assumé. Le connecteur de Claude
     Code ne pouvait pas faire SET ROLE (42501). C'est LA preuve manquante du critère
     « isolation des comptes prouvée ». LECTURE SEULE, aucune écriture, aucun compte créé.
  3. POST /storage/v1/object/list/content sans compte : combien d'objets, quels chemins.
  4. Les canaux Realtime : un client anon, puis un client authentifié, peuvent-ils encore
     rejoindre ring:<uid d'un tiers> et y émettre ? C'est le résidu MSG-01, et il se mesure.
  5. Les plans et quotas réels : Supabase (compute, connexions, Realtime, PITR), Netlify
     (bande passante), Brevo (e-mails/jour). Ils décident de la capacité autant que le code.
  6. Les appareils réels : iPhone Safari, Android Chrome, tablette, PWA installée. TOUT ce
     qui a été mesuré jusqu'ici l'a été sous Chromium headless. Le mur PWA « Installer sur
     iPhone » qui recouvre le fil 1,5 s après le chargement (UXO-01) est toujours dans le
     code, intact, et personne ne l'a jamais vu sur un vrai iPhone.

═══════════════════════════════════════════════════════════════════
6. TA MISSION — quatre étapes, dans cet ordre, une à la fois
═══════════════════════════════════════════════════════════════════
ÉTAPE 1 — VÉRIFIER, sur le SHA 30cc885 et sur la production.
  a. Reprends les 65 P0/P1 avec le croisement du §4 comme hypothèse à ATTAQUER. Pour chacun :
     CONFIRMÉ / RÉFUTÉ / INCERTAIN, avec TA preuve (fichier:ligne, requête et son résultat,
     commande et sa sortie). Concentre l'effort sur les 4 FERMÉ et les 33 PARTIEL : c'est là
     qu'une erreur coûte cher, parce qu'elle se lit comme une garantie.
  b. Débloque les preuves du §5. Ce sont elles qui changeront le verdict, pas une relecture
     de plus du même code.
  c. AUDITE LE NEUF. 137 000 lignes sont arrivées en dix jours, dont 11 migrations et une
     red team qui s'est auto-évaluée. Le delta c8cb8e9..30cc885 n'a JAMAIS été relu par un
     tiers. Cherche les défauts INTRODUITS par les correctifs — le dépôt en a déjà trouvé
     plusieurs de cette famille, et les nomme : un correctif qui rouvre le défaut qu'il ferme,
     une garde posée trop haut qui casse quinze tests, un verrou vert sur le défaut qu'il
     prétend garder. Numérote tes trouvailles ASTRA-xx.
  d. Traite les 81 problèmes jamais relus (§4c) — ils sont identifiés dans
     donnees/registre-problemes.json par le champ relecture = « NON VÉRIFIÉ ».

ÉTAPE 2 — CONSOLIDER, dans le cadre du §1 (gratuit, déjà ouvert).
  Trois listes : ce qui fonctionne (prouvé) · ce qui doit fermer avant de pousser l'échelle ·
  ce qui reste à mesurer. Puis un verdict motivé, à l'échelle : jusqu'à combien
  d'utilisateurs PASSIO peut-elle accueillir aujourd'hui sans exposer personne et sans
  risquer de perdre les données ? Dis un nombre, et dis ce qui le fixe.
  Note honnêtement la nature des trois P0 restants : staging, restauration et capacité ne
  mettent pas les UTILISATEURS en danger, ils mettent le PROJET en danger (perte
  irréversible, indisponibilité). Ce n'est pas la même urgence qu'une fuite de données,
  et ta priorisation doit le refléter au lieu de les empiler.

ÉTAPE 3 — PRÉSENTER À BENJAMIN un plan de correction ordonné : par chantier, avec les
  problèmes couverts, la correction proposée, le risque de régression, l'effort, et l'ordre.
  Puis STOP. Tu attends son accord.

ÉTAPE 4 — SEULEMENT APRÈS SON ACCORD : corriger, puis prouver (tests, réinjection du défaut,
  non-régression).

RÈGLES ABSOLUES pendant les étapes 1 à 3 : lecture seule. Ne corrige rien, ne fusionne rien,
ne déploie rien, n'écris rien en base, ne charge pas la production, ne crée aucun compte, ne
recopie aucun secret. GitHub est la seule source de vérité.

═══════════════════════════════════════════════════════════════════
7. SEPT PIÈGES DE MÉTHODE — chacun a déjà coûté du temps sur ce projet
═══════════════════════════════════════════════════════════════════
① L'ÉTAT DE LA BASE NE SE LIT PAS DANS LE DÉPÔT, IL SE MESURE. Cinq affirmations de
  CLAUDE.md se sont révélées périmées, dont une de sécurité (un interrupteur annoncé ÉTEINT
  était ALLUMÉ). Une migration présente dans migrations/ n'est pas une migration appliquée,
  et supabase_migrations.schema_migrations ne porte que 4 entrées sur des dizaines : les
  collers SQL manuels ne l'alimentent pas. Elle n'est PAS un indicateur d'état.
② CLAUDE.md (2 000+ lignes) est une piste, jamais une preuve. Il documente lui-même ses
  propres péremptions. Confronte toujours au code et à la base.
③ UNE FONCTION CORRECTIVE SANS APPELANT NE CORRIGE RIEN. Ce projet a vécu le cas en vrai :
  un correctif, 12 verrous et une fiche entière portaient sur une fonction que personne
  n'appelait, pendant que la production ne montrait aucune ligne. Cherche les appelants.
④ UNE GARDE POSÉE SUR L'INSERT SE CONTOURNE PAR L'UPDATE. Déjà trouvé deux fois ici.
  Et un WITH CHECK ne voit que la ligne finale, jamais l'ancienne.
⑤ UNE PORTE FERMÉE SUR UNE TABLE SE ROUVRE PAR UNE FONCTION. is_conv_member était
  SECURITY DEFINER et exécutable par anon : la liste nominative des membres d'une
  conversation se reconstituait sans compte, alors que la table était bien fermée. Après
  toute migration de confidentialité, lis get_advisors ET has_function_privilege('anon', …).
⑥ UN AVERTISSEMENT DE LINTER N'EST PAS UN DÉFAUT. Sur six alertes « SECURITY DEFINER
  exécutable par anon », cinq étaient du bruit (deux fonctions de trigger que PostgreSQL
  REFUSE d'appeler directement, deux ouvertures délibérées, une fonction qui répond sur
  l'APPELANT et non sur la CIBLE) et une seule était une vraie fuite. Le tri ne se fait
  qu'en lisant le corps de chaque fonction, et en demandant : sur QUOI répond-elle ?
⑦ UNE REPRODUCTION QUI ROUGIT POUR UNE AUTRE RAISON N'EST PAS UNE REPRODUCTION. Ce dépôt
  connaît « vert en local, rouge en CI » (le vrai SDK ne se charge qu'en CI) ET l'inverse
  (cinq suites rouges en local sur main pur, vertes en CI). Avant d'accuser un changement,
  rejoue la suite sur main dans un worktree séparé.

═══════════════════════════════════════════════════════════════════
8. FORMAT ATTENDU
═══════════════════════════════════════════════════════════════════
Problème : identifiant · priorité (P0 bloque l'ouverture large · P1 avant de pousser
l'échelle · P2 amélioration importante · P3 optimisation) · fonctionnalité · attendu ·
observé · reproduction · preuve · impact utilisateur · visibilité Pilotage · détection
Sentinelle · correction · risque de régression · effort · confiance.
Contrôles : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · SANS OBJET.
Méthodes : appareil réel · émulation · inspection code · requête base · test exécuté · non fait.

Une dernière chose, et elle compte. Ce projet a une règle qu'il s'applique à lui-même :
se taire plutôt qu'inventer, et écrire « non mesuré » plutôt que cocher. Tiens-la. Un
« je n'ai pas pu le prouver » vaut mieux qu'un vert qui enverrait quelqu'un ouvrir son
application à des inconnus sur une garantie qui n'en était pas une.
```
