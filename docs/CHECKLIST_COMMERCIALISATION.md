# Checklist de commercialisation — PASSIO

**Refondue le 2026-09-10.** La version précédente datait du **2026-06-12** et cochait
« Wallet — score, Passia, quêtes, boutique » et « CDV — carnets, favoris, lives » :
deux fonctionnalités **retirées** depuis par ADR-009 et ADR-011. Elle affirmait donc
que le produit était prêt sur des écrans qui n'existent plus.

> ⚠️ **Une checklist périmée est pire qu'aucune checklist** : elle donne la
> confiance sans la preuve. Toute ligne cochée ici porte sa date et sa mesure.
> Ce qui n'a pas été mesuré est écrit « non mesuré », jamais coché.

---

## ⛔ Les deux seuils, à ne jamais confondre

|  | **A — Envoyer à des testeurs** | **B — Commercialiser** |
|---|---|---|
| Quoi | beta gratuite, quelques dizaines de personnes | encaisser de l'argent, ouvrir au public |
| Statut au 2026-09-10 | **possible**, une fois les trois points ① ② ③ ci-dessous réglés | **impossible en l'état** — voir « Ce qui bloque B » |

Un défaut acceptable en A peut être rédhibitoire en B. L'inverse n'est jamais vrai.

---

## ⛔ Ce qui bloque B (commercialiser) — aucun n'est un détail

- [ ] **Aucun chemin d'encaissement n'existe.** Pas une ligne : ni Stripe, ni PayPal,
      ni Paddle, ni achat intégré. Recherche exhaustive du dépôt, 2026-09-10.
      `openPassionPaywall` le dit d'ailleurs honnêtement à l'écran : « Cette formule
      n'est pas encore ouverte : aucun paiement n'est possible aujourd'hui ».
      **« Je commercialise » est aujourd'hui une intention, pas un état du produit.**
- [ ] **Les CGU en vigueur décrivent un service GRATUIT — et l'exonération de
      responsabilité repose explicitement dessus.** Art. 2 : « fourni gratuitement,
      EN L'ÉTAT, sans aucune garantie ». Art. 10 : « **Le service étant fourni
      gratuitement**, en phase de test et sans garantie, sa responsabilité ne peut
      être engagée… ». Encaisser un euro rend ces deux articles faux et fait tomber
      le bouclier avec eux (clause abusive présumée, art. R212-1 code de la
      consommation). Les articles 2 et 10 doivent être **réécrits**, pas complétés,
      et `PASSIO_CGU_VERSION` incrémentée avec eux.
- [ ] **Aucune CGV, aucune information précontractuelle, aucun droit de
      rétractation.** Les mots « CGV », « rétractation », « remboursement »
      n'existent nulle part dans le code. Vendre exige : information précontractuelle
      (L221-5), bouton « commande avec obligation de paiement » (L221-14),
      rétractation 14 jours (L221-18) ou renonciation expresse pour un contenu
      numérique fourni immédiatement (L221-28 13°), confirmation sur support durable
      (L221-13). **Aucun de ces éléments n'existe.**
- [ ] **Le régime de l'éditeur est « particulier ».** `PASSIO_EDITEUR.regime =
      "particulier"` : l'anonymat vis-à-vis du public est réservé au **non-professionnel**
      (LCEN art. 1-1, II). Commercialiser fait tomber cet abri. Il faut une structure,
      un SIRET, et basculer sur `"societe"`. ⚠️ **La branche `"societe"` exige en dur
      `capital`, `rcs` et `tvaIntra`** — trois champs qu'un micro-entrepreneur en
      franchise de TVA n'a pas : elle afficherait « [à compléter] » sur des lignes que
      la loi ne lui demande pas. À adapter **avant** de basculer.
- [ ] **Le consentement aux CGU n'est enregistré nulle part.** Mesuré : **0 trace sur
      85 lignes `user_state`**, y compris pour le seul compte créé depuis la mise en
      place du dispositif. `state.user.cgu` vit en mémoire et n'atteint jamais le
      serveur ; `purgeAccountScopedData()` l'efface au passage. En cas de litige —
      typiquement une rencontre qui tourne mal — **rien ne prouve que la personne a
      accepté** l'art. 7 ni l'art. 10. C'est le bouclier lui-même qui est en cause.
- [ ] **« PASSIO » n'est ni déposé, ni disponible en domaine**, et les CGU affirment
      pourtant en détenir la propriété. À vérifier auprès de l'INPI avant toute
      dépense de communication.

---

## ① ② ③ Ce qui doit être réglé avant d'envoyer à des testeurs (seuil A)

- [ ] **① Les e-mails de confirmation partent probablement en spam.** Le domaine
      d'envoi **n'est pas authentifié** chez Brevo et **DMARC est absent**
      (`docs/SETUP_SMTP_AUTH.md` §4, risque R11). Depuis l'activation de « Confirm
      email » (2026-08-30), un compte non confirmé est **inutilisable** — et
      l'application n'en sait rien. **C'est le défaut qui tue une beta en silence :
      la personne ne vous dira pas qu'elle n'a rien reçu, elle abandonnera.**
      Geste : authentifier le domaine chez Brevo (code, DKIM, puis DMARC).
      Quota gratuit : **300 e-mails/jour**.
- [ ] **② Le code d'accès 2125 est redemandé à CHAQUE ouverture** (`sessionStorage`),
      et il faut le communiquer à chaque testeur. Décider : le garder (et
      l'écrire dans le message d'invitation), ou le retirer pour la beta.
      ⚠️ Ce n'est pas une barrière de sécurité : le hash est dans le JavaScript livré
      et un code à 4 chiffres se retrouve par force brute en quelques secondes.
- [ ] **③ Les signalements n'arrivent nulle part.** Voir la section « Confiance et
      sécurité » ci-dessous. Dans une application qui organise des **rencontres
      physiques**, c'est le point à ne pas laisser ouvert.

---

## ✅ Corrigé le 2026-09-10 (audit go/no-go)

- [x] **Le contenu de démonstration se dit à tout le monde.** L'étiquette
      « Exemple PASSIO », les chiffres muets et le refus de participation étaient
      conditionnés à `estVisiteur()` : ils s'éteignaient **à la création du compte**,
      donc pour exactement les personnes à qui l'app est envoyée. Mesuré :
      **550 publications de démonstration et 29 comptes fabriqués** contre
      **33 publications réelles** en production — un fil fabriqué à 94 %, sans
      étiquette, et une inscription possible à une rencontre qui n'existe pas.
      Verrous : `first-run.spec.js` (47 verts, dont 2 cas neufs).
- [x] **La notification de message privé était branchée sur une fonction morte.**
      `_notifierMessage` n'était appelée que par `supaSendMessage`, **sans aucun
      appelant dans le dépôt** : le correctif du 2026-09-09, ses 12 verrous et sa
      fiche portaient sur un chemin que personne n'emprunte. Mesuré : **0 ligne
      `notifications` de type `message`** en production, y compris après déploiement.
      Rebranché sur les deux vraies voies (texte et média), fonction morte retirée,
      et un 13ᵉ verrou mesure désormais **le câblage**, pas la fonction.
- [x] **Quatre portes de signalement sur cinq annonçaient un succès sans le vérifier.**
      `reportUser`, `reportPost`, `reportCommentEntry`, `reportEvent` n'attendaient
      pas `supaReport` et ne lisaient pas son verdict — un visiteur sans compte, à qui
      « Signaler cet événement » est proposé, lisait « Notre équipe va vérifier »
      alors que la RLS avait refusé. Elles suivent maintenant le patron de
      `reportPassion` : porte d'authentification, `await`, verdict lu, message vrai.
      **Et un motif est enfin demandé** — les 2 signalements de production ont un
      `reason` vide.
- [x] **Le numéro de téléphone obligatoire à l'inscription a été retiré.** Il était
      exigé (8–15 chiffres) et **lu nulle part** : aucun SMS, aucune récupération,
      aucune vérification. Donnée identifiante réclamée pour une finalité inexistante
      (minimisation, art. 5.1.c), et la politique affichée au même écran ne le
      mentionnait même pas. 3 comptes sur 7 en portaient un.
      ⚠️ **Reste à faire (canal ③)** : effacer les valeurs déjà en base —
      `update auth.users set raw_user_meta_data = raw_user_meta_data - 'phone'`.
- [x] **La politique de confidentialité a été réécrite** (version `2026-09-10`).
      L'ancienne datait de juin, décrivait les « carnets » (retirés par ADR-011) et
      **ne déclarait ni la télémétrie, ni les rapports d'erreur, ni la
      géolocalisation**. Elle porte maintenant : responsable de traitement, mesure
      d'usage et identifiant d'appareil, position, bases légales, sous-traitants et
      transferts hors UE, tiers qui reçoivent l'IP, durées, droits.
- [x] **La coupure de la mesure d'usage est enfin atteignable** : Paramètres →
      Confidentialité → « Mesure d'usage ». Elle n'existait que via `?telemetry=0`
      dans l'URL — donc pour personne. *Une opposition qu'on ne peut pas exercer
      n'est pas une opposition.*
- [x] **Le canal de retour de la beta n'envoyait rien.** « Feedback & aide » écrivait
      dans `state.feedbacks`, que **rien ne relit** (0 ligne en base sur 85), et
      promettait un export inexistant. Il part maintenant par e-mail, avec le contexte
      technique, et le message ne prétend plus que l'envoi est accompli.
- [x] **Injection de prompt dans la chaîne autonome.** `client_errors` accepte un
      INSERT **anonyme**, et son texte était recopié tel quel dans le corps **et le
      titre** d'une issue `[SENTINELLE]` — dont la PR est fusionnée automatiquement.
      Le titre porte maintenant l'**empreinte normalisée** (rien de librement choisi)
      et le corps passe par `desamorcer()` : lignes en forme d'instruction retirées,
      marqueurs de structure neutralisés, longueur bornée. **6 verrous unitaires**,
      dont un qui exige qu'un **vrai** message d'erreur survive intact.
- [x] **Le contenu de démonstration composait de vrais numéros** (7 numéros au format
      mobile attribuable, en lien `tel:` cliquable), une adresse Gmail et un domaine
      externe. Numéros remplacés par la plage **réservée à la fiction** (06 39 98 XX XX),
      e-mail en `@example.com`. ⚠️ Au passage : le lien `tel:` était posé **même sur
      une adresse e-mail** — corrigé, le schéma suit maintenant la forme du contact.
- [x] **`CLAUDE.md` affirmait que l'interrupteur 18+ était ÉTEINT.** Il est **ALLUMÉ**
      (`access_policies.irl_adult_only = true`, mesuré). Sur 7 comptes, **2** ont une
      ligne `user_safety` : les 5 autres passent par la fenêtre « Ton année de
      naissance » avant d'organiser ou de rejoindre. C'est le comportement voulu.

---

## 🗄️ À appliquer en base — canal ③ d'ADR-012 (psql ou SQL Editor)

`migrations/migration_fuites_2026-09-10.sql`, écrite et prête, **non appliquée** :

- [ ] **`conv_reads` est lisible sans compte.** Policy `reads_select`, rôle `public`,
      `qual = true`, plus le GRANT à `anon`. Mesuré : **37 lignes, 24 `user_id`,
      21 `conv_id`**. Deux `user_id` sur un même `conv_id` = ces deux personnes ont
      une conversation privée, avec l'heure de dernière lecture ; croisé avec
      `profiles` (public), ce sont des **pseudos**. Le contenu des messages, lui, est
      bien protégé — **c'est le graphe social qui fuit**, souvent l'information la
      plus sensible d'une messagerie.
- [ ] **`client_errors.auth_uid`** : colonne posée par le serveur (`default auth.uid()`),
      non écrivable par le client, pour que la sentinelle n'enquête que sur des
      erreurs d'origine vérifiée. Le détecteur la gère déjà **avant comme après**
      (repli signalé si la colonne n'existe pas).

---

## 🔐 Sécurité — mesuré le 2026-09-10

- [x] RLS active sur les **41 tables publiques**, sans exception. La seule sans policy
      (`access_policies`) l'est délibérément : fail-closed, aucun privilège `anon`.
- [x] Messages privés cloisonnés par `is_conv_member()` **côté serveur** ;
      `anon` n'a plus INSERT sur `conv_messages`.
- [x] Compte privé respecté par la RLS (`post_is_visible`), pas par l'affichage.
- [x] **828 appels d'échappement** : 427 `escapeHtml`, 345 `escapeJsArg`, 56 `safeUrlAttr`.
- [x] CSP stricte en liste blanche (9 destinations), `frame-ancestors 'none'`,
      `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.
- [x] Aucun SDK d'analytics ni de publicité tiers.
- [x] Seau `attachments` : l'**énumération est fermée** (`passio_media_read` a disparu,
      remplacée par une policy réservée aux membres authentifiés).
- [ ] ⚠️ **Mais le seau reste déclaré `public = true`** : la route `/object/public/…`
      contourne la RLS, donc une pièce jointe de conversation privée **reste lisible
      à vie par son URL exacte**. La partie B (seau privé + URL signées aux deux
      points de dépôt et à l'affichage, avec renouvellement) est **un lot client
      entier** — l'appliquer sans lui ferait disparaître toutes les pièces jointes.
- [ ] ⚠️ **Les canaux Realtime d'appel sont publics** (`ring:`, `call:`, `typing:`,
      `vlive:` créés sans `{ private: true }`). Comme `profiles` est en lecture
      publique, la liste des `uid` s'obtient sans compte : on peut voir qui appelle
      qui, faire sonner un téléphone **sous une fausse identité**, ou couper un appel
      en cours. Le mécanisme privé existe pourtant déjà ailleurs dans le code.
      **Correctif = client + policies `realtime.messages` ensemble**, jamais l'un sans
      l'autre (les poser seules couperaient les appels).
- [ ] Protection des mots de passe compromis (HaveIBeenPwned) **désactivée** — un
      interrupteur dans le tableau de bord Supabase.
- [ ] Le tableau de bord de pilotage écoute sur **toutes les interfaces** avec
      `admin/admin` et un secret par défaut (`dashboard/`, hors déploiement Netlify —
      donc sans effet tant qu'il n'est pas lancé sur une machine exposée).

---

## 🛡️ Confiance et sécurité des personnes — le point le plus lourd

PASSIO organise des **rencontres physiques entre inconnus**. C'est la responsabilité
la plus grave du produit, et c'est là que la dette est la plus visible.

- [ ] **Un signalement n'arrive nulle part.** `reports` n'a que 6 colonnes —
      `id, reporter_id, target_type, target_id, reason, created_at` — et **aucun
      statut**. Il est *structurellement impossible* de savoir si un signalement a été
      lu. Les 2 signalements de production ont **21 et 74 jours**. Le seul outil du
      dépôt (`passions-moderation.js`) ne lit que `target_type=passion`. Le Centre de
      pilotage ne surveille pas la table. Aucune alerte, aucun e-mail.
      **Une testeuse signale un comportement inquiétant, lit « notre équipe va
      vérifier », et personne n'est prévenu.** À faire : colonnes de statut (canal ③),
      un `scripts/moderation.js` sur le modèle de `passions-moderation.js`, `reports`
      dans `SAFE_TABLES` du dashboard, et une alerte au-delà de 24 h.
- [ ] **Bloquer quelqu'un ne l'empêche ni de vous suivre, ni de vous écrire.**
- [ ] Aucun dispositif de sécurité des rencontres : pas de partage de trajet à un
      proche, pas de bouton d'alerte, aucune vérification d'identité — ce que les CGU
      §7 disent honnêtement (« aucun membre n'est vérifié »).
- [x] L'âge est **déclaratif** et le texte le dit — jamais l'inverse.
- [x] CGU §7 : l'éditeur n'est pas organisateur, la responsabilité et l'assurance sont
      à la charge des membres.

---

## 🧯 Exploitation

- [ ] **Aucune sauvegarde automatique de la production**, et la restauration n'a
      **jamais été exécutée une seule fois**. Une sauvegarde jamais restaurée n'est
      pas une sauvegarde, c'est une intention.
- [ ] Le retour arrière n'a jamais été exercé.
- [ ] `telemetry_events` occupe **~60 % de la base** et **rien ne la purge** — alors
      que la politique s'engage désormais sur **13 mois**. Une fonction de purge
      existe (`migrations/purge_telemetry_development.sql`) mais n'est pas planifiée.
- [ ] **Aucune continuité humaine** : un seul contributeur, aucun suppléant, aucune
      procédure d'absence.
- [x] Monitoring `client_errors` câblé, sentinelle horaire (~41 % des créneaux tenus
      par GitHub, écarts de 4 à 5 h — le seuil de contrôle est « moins de 6 h »).
- [x] 28 déploiements verts sur 30 en 23 heures.

---

## 🧪 Qualité

- [x] **1 620 cas automatisés** à chaque commit : 1 221 e2e navigateur, 15 e2e en base
      réelle, 365 unitaires du dashboard, 25 unitaires de la sentinelle.
- [x] **~224 contrôles SQL** sur 7 bancs, joués sur un PostgreSQL jetable avec les
      policies réelles de production reconstituées.
- [x] Les **8 gates statiques** vertes (`npm run verif`, ~2 s).
- [x] 11 scénarios REST bruts d'usurpation joués contre la vraie production à chaque
      déploiement.
- [ ] **12 cas ne s'exécutent jamais en CI**, dont le seul qui prouve que
      « Supprimer mon compte » fonctionne réellement.
- [ ] Messagerie de groupe : **non testée**. Appels audio/vidéo et Live : **~1 300
      lignes atteignables d'un tap, sans un seul test**.

---

## 📱 Performance et accessibilité

- [ ] **Lighthouse mobile n'a jamais été mesuré sur l'application** : le « 100/100 »
      des archives porte sur la page **verrouillée** par le code d'accès.
- [ ] **116 cibles tactiles sous 24×24 px** (les actions d'un commentaire font 27×14).
- [ ] **333 des 348 éléments interactifs du fil** sont invisibles au clavier et aux
      lecteurs d'écran.
- [ ] Le premier rendu dépend de `fonts.googleapis.com`.
- [x] Zoom non bloqué, champs ≥ 16 px (anti-zoom iOS).

---

## 📌 En un mot

**A (testeurs) :** oui, une fois ① l'authentification du domaine d'envoi faite,
② le code d'accès tranché, ③ les signalements dotés d'un destinataire.

**B (commercialiser) :** non. Il n'existe **aucun chemin d'encaissement**, et le
contrat en vigueur **interdit** de facturer — il promet la gratuité et fonde son
exonération dessus. C'est un chantier juridique et technique à part entière, pas un
réglage.

Détail complet des 107 constats et de leurs contre-expertises :
[`AUDIT_COMMERCIALISATION_2026-09-10.md`](AUDIT_COMMERCIALISATION_2026-09-10.md).
