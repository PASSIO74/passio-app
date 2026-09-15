# Prompt pour GPT Astra — cinquième passe (nuit du 2026-09-15)

> À copier tel quel dans la conversation d'Astra. Il fait suite à `22-PROMPT-ASTRA-QUATRIEME-PASSE-2026-09-15.md`. Le dépôt public reste la source : https://github.com/PASSIO74/passio-app.

---

Tu es Astra. Ta quatrième contre-revue a produit dix-huit constats neufs, **ASTRA-21 à
ASTRA-38**, tous OUVERTS. Les dix-huit ont été traités. Voici l'état, avec les quatre états
séparés que tu exiges, et « non mesuré » partout où il n'y a pas de preuve.

## 0. LA CHOSE À LIRE EN PREMIER, ET ELLE CHANGE TOUT PAR RAPPORT À LA PASSE PRÉCÉDENTE

**RIEN N'EST DÉPLOYÉ. AUCUNE MIGRATION N'EST APPLIQUÉE. AUCUNE FONCTION N'EST REDÉPLOYÉE.**

La passe précédente t'arrivait avec 28 PR fusionnées et sept migrations en production.
Celle-ci t'arrive avec **dix-sept pull requests OUVERTES** et zéro geste de production. La
consigne donnée à l'auteur était explicite : préparer des correctifs entièrement revus et
testables, et **ne pas réutiliser une autorisation antérieure** pour fusionner, migrer ou
déployer.

Concrètement, dans le tableau qui suit, la colonne « corrigé » veut dire *le code existe et
ses contrôles sont verts* ; les colonnes « déployé » et « vérifié » sont vides **partout**.

- **Cinq migrations** écrites et éprouvées sur **base PostgreSQL jetable**, jamais appliquées :
  ASTRA-22, ASTRA-35, ASTRA-26, ASTRA-25, ASTRA-23.
- **Trois Edge Functions** portent du code non redéployé : `delete-account` (ASTRA-27, 25),
  `export-account` (ASTRA-28), `notify-call` (ASTRA-24).
- **Deux ordres d'allumage** à ne pas inverser, écrits dans les migrations : ASTRA-23 exige
  que le client soit **servi avant** que la policy soit collée (sinon un `app.js` en cache se
  fait refuser son propre canal d'appel) ; ASTRA-25 se dégrade proprement mais le dit.

**Ne compte donc aucune ligne comme fermée.** Ce qui t'est soumis, c'est la *qualité des
correctifs et de leurs preuves*, pas un résultat en production.

## 1. Ce que tu dois savoir avant de lire

- **Le registre est la source** : `.passio/audits/BILAN_PASSIO_09-26/18-REGISTRE-CORRECTIONS-ASTRA-2026-09-14.md`,
  section datée du 15/09 au soir — une ligne par identifiant, quatre colonnes d'état, la PR.
- **Le commit que tu as lu était `872e30ea`.** `main` est à `bd837e9` : deux fichiers de
  preuve annoncés par la passe 4 étaient **réellement absents** de `872e30ea` et ont été
  ajoutés dans `bd837e9`. C'est écrit, daté, et aucune trace n'a été recréée après coup —
  dossier `preuves/migrations/2026-09-15-ecart-440-migration-production.md`.
- **Les correctifs et leurs preuves ont le même auteur.** Les contre-revues humaines du
  propriétaire portent sur les PR touchant une migration ou un workflow. C'est le conflit
  d'intérêts que tu existes pour lever.
- **Tes reproductions étaient locales ou statiques ; elles n'ont pas été renommées.** Là où
  une mesure de production a été faite, elle l'a été au connecteur **en lecture seule**
  (ADR-012 canal ①) et elle est citée comme telle.
- **Aucun compte réel, aucun média réel n'a été touché pour prouver un défaut.**

## 2. Tes dix-huit constats

| | État | PR |
|---|---|---|
| **ASTRA-21** file hors-ligne : auteur reconstruit à l'envoi | corrigé — identité d'écriture séparée de la propriété de file ; 13 cas e2e, 2 réinjections | #452 |
| **ASTRA-22** broadcast qui contourne le blocage | corrigé — `blocage_entre` dans le trigger ; banc SQL 20, 2 mutations. **Migration non appliquée** | #453 |
| **ASTRA-23** `call:<id>` lisible et émissible par un tiers | corrigé — canal lié aux deux parties via `call_invites` ; banc SQL 25, 4 e2e, 2 réinjections. **Migration non appliquée** | #465 |
| **ASTRA-24** mention sans destinataire, texte libre de push | **PARTIEL** — la push est fermée, la notification **in-app** ne l'est pas (voir §5) ; 18 verrous | #466 |
| **ASTRA-25** écriture arrivée après le comptage de sa table | corrigé — barrière serveur posée avant tout comptage ; banc SQL 25, 17 verrous, 3 réinjections. **Migration non appliquée** | #464 |
| **ASTRA-26** propriétaire Storage perdu à la restauration | corrigé — relevé et restitué par SQL ; banc SQL 21, 12 verrous. **Migration non appliquée** | #463 |
| **ASTRA-27** table neuve hors purge et hors export | corrigé — `call_invites` + 7 couples `cdv_*` purgés, **et une gate** qui refuse toute table neuve non décidée. **Fonction non redéployée** | #458 |
| **ASTRA-28** export : ordre non total, complétude annoncée à tort | corrigé — échelle d'ordre, comptage exact, doublons détectés. **Fonction non redéployée** | #457 |
| **ASTRA-29/30/31/32** verdicts de reprise (pagination, suspension, médias, global) | corrigés — 37 verrous, 5 réinjections | #455 |
| **ASTRA-33** migration appliquée sans attestation de revue | corrigé — barrière d'attestation, empreinte de contenu, cible jamais implicite ; 13 verrous, 3 réinjections | #451 |
| **ASTRA-34** taille de réparation Sentinelle annoncée, jamais mesurée | corrigé — mesurée en CI sur l'API des fichiers ; 7 verrous qui **exécutent le vrai extrait** | #454 |
| **ASTRA-35** identifiants d'inscription réassignables | corrigé — trigger de figement ; banc SQL 25. **Migration non appliquée** | #460 |
| **ASTRA-36** suppression d'activité non atomique | corrigé — DELETE parent seul, la cascade fait le reste ; 5 e2e + 29 de non-régression | #461 |
| **ASTRA-37** banc de charge : corrélation absente | corrigé — corrélateur armé avant émission, six états nommés ; 9 verrous. **Banc non rejoué** | #459 |
| **ASTRA-38** levée de suspension non relue | corrigé — verdict partagé par les deux sens ; 16 verrous | #456 |

Plus un résidu ancien, trouvé **dans la CI de cette reprise** : **EXP-11** — deux étapes de
`deploy.yml` emportaient la clé de service de la **production** dans chaque run de pull
request, l'une créant deux comptes réels en production à chaque poussée de branche. Leur
propre commentaire disait déjà « une fois par déploiement, pas 48 par jour ». Corrigé, **et
une gate** impose désormais la règle à tous les workflows (#467).

## 3. TROIS ENDROITS OÙ JE TE CONTREDIS OU TE NUANCE

C'est la partie que je te demande d'attaquer en premier.

1. **ASTRA-22 — ton raisonnement était trop fort, et c'est mesuré.** Tu écrivais que
   `is_blocked_with` ne filtre pas dans le trigger de broadcast. Le banc montre qu'il filtre
   **correctement** sur le chemin client : l'auteur insère depuis sa propre session, donc
   `auth.uid()` **est** l'auteur. Il cesse de filtrer, **en silence**, uniquement sur les
   chemins sans session (`service_role`, Edge Function, message système, rejeu de
   restauration) où `auth.uid()` est NULL. Le constat est confirmé, sa justification est
   corrigée, et le banc mesure **les deux** chemins.
2. **ASTRA-36 — le rayon est plus étroit que « les dépendances d'autrui ».** Les policies
   DELETE mesurées en production ne laissent supprimer que ses propres lignes ; les quatre
   tables filles d'`events` portent toutes `ON DELETE CASCADE` (mesuré). Le défaut est réel,
   sa portée annoncée ne l'était pas.
3. **ASTRA-37 — je ne peux pas conclure sur les runs passés.** La corrélation est corrigée,
   mais le banc **n'a pas été rejoué** : dire que les mesures antérieures étaient fausses
   serait une déduction, pas une mesure. C'est écrit « non mesuré », pas « fermé ».

## 4. CINQ FAITS MESURÉS EN PRODUCTION QUI N'ÉTAIENT PAS DANS TON RAPPORT

Tous au canal ① d'ADR-012 (lecture seule).

1. **Le journal des migrations OMET celle de #440**, alors que son effet est bien en base.
   Un journal qui se croit complet est pire qu'une absence de journal.
2. **Sept couples `cdv_*` (13 lignes) n'étaient purgés nulle part**, en plus de
   `call_invites` que tu avais vu.
3. **`notifications` accepte une écriture de n'importe qui vers n'importe qui**
   (`from_id = auth.uid()` et non bloqué, texte libre). C'est ce qui rend ASTRA-24 circulaire :
   le correctif MSG-04 du 14/09 avait déplacé le texte libre du corps de requête vers **une
   ligne que l'appelant écrit lui-même**. Déplacer une donnée non fiable ne la rend pas fiable.
4. **`passio_rt_emettre` ET `passio_rt_recevoir` portaient `call:%` sans aucune condition** —
   ASTRA-23 était vivant, dans les deux sens.
5. **Deux policies SELECT en double sur `realtime.messages`** (un topic `user:` qu'aucun code
   du dépôt n'utilise, l'une sans cédille). Inoffensives, mortes, non touchées.

## 5. CE QUI RESTE OUVERT, DIT TEL QUEL

- **ASTRA-24 est PARTIEL.** La notification **in-app** reste écrivable par un inconnu avec un
  texte libre. Porter la règle en SQL serait une **seconde copie** d'une règle qui vit en
  JavaScript ; le geste qui fermerait vraiment est de faire écrire ces lignes par le
  **serveur**, genre par genre, comme `follows_notifier` le fait déjà — lot à part entière,
  non fait. Dossier : `preuves/notifications/2026-09-15-astra-24-mention-et-texte-libre.md`.
- **La mention en groupe** n'exige pas que le message nomme la personne : choix écrit et
  mesuré, pas oubli. Juge-le.
- **`profiles.username` n'a pas d'index unique** : deux homonymes passent la garde d'ASTRA-24.
- **Résidus anciens non repris** : MSG-03/ASTRA-01, MSG-06, MOD-01/AUTH-11/MOD-09, IRL-10/12,
  CONT-11/SUP-01, PERF-02 et PERF-06, PRO-03, TCI-02.
- **Le verdict d'ouverture publique n'a pas bougé**, et il n'appartient pas à cette reprise de
  le changer.

## 6. DEUX LEÇONS DE MÉTHODE QUE JE TE SOUMETS, PARCE QU'ELLES SE REJOUERONT

1. **Un verrou qui mesure la PRÉSENCE d'un geste ne protège pas une propriété d'ORDRE.**
   Mon propre verrou d'ASTRA-25 vérifiait que la barrière est *posée*, jamais qu'elle l'est
   *avant tout comptage* : en déplaçant la pose après le premier relevé — c'est-à-dire en la
   ramenant exactement à la « passe de plus » que le lot refuse — **le banc restait vert**.
   Trouvé par réinjection, pas par relecture. Les correctifs de course (ASTRA-21, 25, 33) ont
   tous ce mode d'échec : le correctif marche pendant la démonstration.
2. **Un résidu écrit n'est pas un résidu suivi.** La migration du 14/09 avait écrit son propre
   résidu en toutes lettres — « le lier aux participants demanderait une table d'appels, autre
   lot » — et cette table est née **le lendemain**, sans que personne ne revienne fermer ce
   qu'elle rendait fermable. Rien, dans le dépôt, ne relie une phrase « autre lot » au jour où
   sa condition devient vraie. C'est ASTRA-23, et c'est un défaut de procédé, pas de code.

Deux contrôles de cette reprise ont d'ailleurs attrapé la reprise elle-même : la gate
d'ASTRA-27 a rougi sur une table née trois heures après elle, et EXP-11 a été vu dans la CI
d'une PR de ce lot.

## 7. CE QUE JE TE DEMANDE

1. **Contredis les correctifs, pas les intentions.** Cible en priorité :
   - **ASTRA-25** : une barrière en base suffit-elle, alors que la ligne SURVIT à la purge
     réussie (délibéré : un jeton déjà émis reste signé valide) et qu'aucune règle de
     rétention n'est décidée pour cet uuid orphelin ?
   - **ASTRA-23** : `call_partie_prenante(_id)` est-il vraiment sans oracle ? L'ordre imposé
     au client (invitation puis abonnement) est-il tenable pour les clients en cache ?
   - **ASTRA-24** : fermer la push en laissant la notification in-app ouverte est-il un
     correctif ou un déplacement du problème ?
   - **ASTRA-33** : une attestation stockée dans le dépôt, par le même auteur, est-elle une
     barrière ou une formalité ?
   - **ASTRA-26/29-32** : un verdict de restauration peut-il se prononcer sans relire la cible ?
   - **EXP-11** : la gate lit le TEXTE des workflows. Qu'est-ce qui lui échappe encore ?
2. **Juge le fait qu'aucune ligne ne soit déployée.** Est-ce la bonne séquence, ou faut-il
   appliquer certaines migrations avant d'en préparer d'autres ?
3. **Juge les deux leçons de méthode du §6**, et dis ce qui devrait exister dans le dépôt pour
   qu'un résidu écrit soit un résidu suivi.
4. **Reclasse** chaque identifiant (FERMÉ / PARTIEL / OUVERT / NON VÉRIFIABLE D'ICI) en tenant
   compte du §0 : rien n'est en production.
5. Numérote tes nouvelles trouvailles **ASTRA-39 et suivantes**, avec pour chacune le fichier,
   la ligne ou la fiche, ce que tu as lu, ce qui manque.

Une limite susceptible d'exposer un autre compte, de perdre des données ou d'annoncer un faux
succès doit rester un défaut ouvert — c'est ta règle, elle reste la nôtre.
