# Ouverture publique gratuite — le lot du 2026-09-11, et les gestes qui restent

**La question posée :** « commercialiser » = rendre l'application publique, gratuitement,
et la faire utiliser par un maximum de personnes. **La réponse mesurée le matin même :**
sûre pour des testeurs avertis, pas pour le public. Ce lot ferme ce qui séparait les deux.

Tout ce qui suit a été **mesuré en production** (canal ① d'ADR-012) avant d'être corrigé,
puis **éprouvé par mutation** : chaque garde retirée fait rougir un banc.

---

## 1. Ce que le lot ferme — sept défauts serveur, un fichier à coller

`migrations/migration_ouverture_publique_2026-09-11.sql` — une transaction, rejouable,
tableau de verdict à **treize** lignes (tout doit dire `OK`). Banc :
`tests/sql/migration-ouverture-publique.test.sh` (**117 contrôles**, gate CI), qui mesure
chaque défaut AVANT, applique, rejoue, éprouve les deux sens, puis six mutations.

| # | Défaut mesuré en production | Correctif |
|---|---|---|
| ① | `is_conv_member(conv, uid)` est `SECURITY DEFINER` et **exécutable par `anon`** : un oracle « X est-il membre de Y ? » sans compte. Avec `events.conv_id` (accordé à `anon`) et `profiles.id` (public), la liste **nominative** des membres de la conversation d'une rencontre se reconstituait sans compte. | `EXECUTE` retiré à `anon` (et à `can_edit_post`, deux fonctions de trigger). Les policies de messagerie passent au rôle `authenticated` : un visiteur obtient **zéro ligne, aucune erreur**. `conv_id` sort du GRANT colonne d'`anon` — et de `_EVENT_COLS_PUBLIC` (le banc compare les deux listes à l'octet). |
| ② | **Bloquer quelqu'un ne l'empêchait ni de vous suivre, ni de vous écrire, ni de commenter, ni de vous notifier.** Seul `conv_members` connaissait `is_blocked_with`. | Six policies INSERT (`follows`, `conv_messages` 1:1, `post_comments`, `post_likes`, `event_comments`, `notifications`) exigent `not is_blocked_with(...)` via trois aides `SECURITY DEFINER`. Borné aux 1:1 pour les messages : dans un groupe, la personne bloquée reste membre. |
| ③ | **Trois tables seulement** avaient une limite de débit. Rien sur `posts`, `post_comments`, `conv_messages`, `stories`, `events`, `follows`, `notifications`, `analytics_events` — ni sur les **INSERT anonymes** de `client_errors` et `telemetry_events` : un script sans compte pouvait remplir la base jusqu'au mur lecture seule du plan (500 Mo). | `trg_rate_limit` (par compte, horodatage **serveur**) sur 9 tables de plus ; `limiter_debit_global()` (plafond par minute sur toute la table) sur les deux tables anonymes. `follows` reçoit `created_at`. |
| ④ | `reports` n'avait **aucun statut** ; `analytics_events` aucune purge (la politique promet 13 mois). | `status` (`open`/`handled`/`dismissed`, forcé `open` à l'insertion par trigger), `handled_at`, `handled_note`, index des ouverts ; `cron` `passio_purge_analytics` à 13 mois. |
| ⑤ | Canaux Realtime `ring:`, `call:`, `typing:`, `vlive:` **publics** : écouter qui appelle qui, faire sonner sous une fausse identité, couper un appel. | Policies `passio_rt_recevoir` / `passio_rt_emettre` sur `realtime.messages` : on ne reçoit que **sa** sonnerie, la frappe est réservée aux membres, tout exige un compte. Le client crée ces canaux en `private: true`. |
| ⑥ | Seau `attachments` `public = true` : une pièce jointe privée lisible **à vie par son URL exacte**. | `update storage.buckets set public = false` — **en dernier**, après le client (URL signées). |
| ⑦ | « Compte privé » sans approbation : `follows` n'avait que deux colonnes, tout compte s'abonnait d'un tap et lisait tout. | `follows.status` tranché par le **serveur** (`pending` vers un compte privé), `follows_accepter` (la cible seule, vers `accepted` seulement), identifiants figés par trigger, `posts`/`stories`/`post_is_visible` n'ouvrent qu'aux `accepted`. |

| ⑧ | **Red team** : `conv_messages."Update propre"` et `post_comments."Update propre"` sans `WITH CHECK`, rien ne figeait `conv_id`/`post_id` — un message se **déplaçait** par UPDATE dans le 1:1 d'un compte qui vous a bloqué ou le groupe d'une rencontre dont on n'est pas membre (ids publics). | `WITH CHECK` reprend la condition d'INSERT ; `trg_identifiants_figes` fige les identifiants. |
| ⑨ | **Red team** : un compte bloqué faisait encore sonner (`ring:%` ouvert à tout compte). | `passio_rt_emettre` lit le bloqueur dans le TOPIC : `not is_blocked_with(substr(topic, 6))`. |
| ⑩ | **Red team** : les demandes d'abonnement en attente se lisaient sans compte (`follows` : deux SELECT `true`). | `follows_lecture` : `accepted` pour tous, `pending` seulement à ses deux bouts. |
| ⑪ | **Red team** : `realtime:db` et `conv_specific:` restaient publics et sans policy — le geste « Allow public access OFF » les aurait tués sans erreur. | Policies pour les deux topics (`realtime:db` ouvert à `anon` aussi, le canal n'ouvre rien) ; client privé avec repli. |
| — | La ligne `notifications` d'un abonnement était écrite par le client qui s'abonne. | `follows_notifier` (serveur, identifiant déterministe) ; le client ne pousse que le push. `reports.target_type` sous `CHECK`. |

Résidus **assumés** et écrits : l'identité de l'appelant dans une sonnerie reste déclarative
**entre comptes** (ce qui est fermé : le sans-compte, l'écoute, et le compte bloqué) ; dans un
live, `from` reste déclaratif entre comptes (le client n'obéit qu'à `from = author_id`, qu'un
compte connecté peut usurper — fermer cela demande un topic d'hôte à part) ; les identifiants de
conversation restent des secrets partagés (aléatoires, 17 caractères) ; `is_conv_member` et
`is_blocked_with` restent des oracles pour un compte **connecté** (leur retirer EXECUTE ferait
lever « permission denied » à toutes les policies qui les appellent).

## 2. Le lot client — déployé AVANT la migration, et il fonctionne dans les deux états

- **Le rideau (code 2125) est levé.** `js/access-gate.js` ne s'arme que sur adhésion
  (`localStorage.passio_gate_actif = "1"`) : le mécanisme survit pour une préproduction et
  pour `access-gate.spec.js`, qui l'arme lui-même.
- **Plus aucun CDN de scripts.** `@supabase/supabase-js` était chargé depuis jsDelivr en
  version **flottante `@2`** sans intégrité ; MapLibre depuis unpkg. Les deux vivent dans
  `js/vendor/` (versions épinglées 2.116.0 et 4.7.1, `LICENCES.md`), copiés dans `dist/`
  par `scripts/build.js`, et la CSP ne connaît plus que `'self'`. Monter de version = un
  commit qui remplace le fichier et le chemin.
- **Pièces jointes par URL signée.** `attrMediaSrc` pose `data-pj` (pas de `src`),
  `signerPiecesJointes` résout après chaque `innerHTML` (fil de conversation, panneau
  Médias), `_playVoiceById` signe au premier tap. Repli sur l'URL d'origine si la signature
  échoue : tant que le seau est public, rien ne change ; une fois privé, seul un membre lit.
  `cdnUrl` ne réécrit plus les pièces jointes.
- **Canaux privés avec sonde.** `_callChannel`, `typing:`, `vlive:`, `realtime:db` et
  `conv_specific:` passent `private: true` — **tous** les `supa.channel(` du dépôt (le verrou
  ⑨ le balaie). La sonnerie (`_subscribeCallRing`) sert de sonde globale : un refus **de
  policy** pose `window._rtPriveIndisponible` et tout repart en public — le comportement
  d'avant ; chaque canal a en plus son propre repli.
- **Red team (client).** L'emoji d'une invitation d'appel est échappé et borné (`_emojiSur` —
  c'était un XSS exécutable par tout compte), les invitations sont bornées à une toutes les
  3 s, l'identifiant d'appel est aléatoire (`_callIdAleatoire`), un live n'obéit qu'à son hôte
  (`_vliveDeLHote`), une URL signée vaut une heure, et une demande d'abonnement en attente
  reste « Demande envoyée » sur un doublon.
- **Abonnement à trois états.** `libelleBoutonSuivi` (Suivre / Demande envoyée / ✓ Suivi),
  verdict serveur corrigeant l'affichage optimiste, demande tranchée depuis la notification
  (`follow_request` → Accepter / Refuser), `supaLoadFollowing` sépare acceptés et en attente.
  Sans la colonne `status` (42703), le client mémorise « pas de statut » et repart sur le
  chemin d'avant.
- **La politique dit ce que la base fait** : §8, 7 jours de mesure d'usage, 30 jours de
  rapports d'erreur ; `PASSIO_CONFIDENTIALITE_VERSION = "2026-09-11"`.

Verrou : `tests/e2e/ouverture-publique.spec.js` (35 cas, dont trois qui mesurent le
**câblage** à la source et deux éprouvés par réinjection).

## 3. Exploitation — ce qui tourne sans personne

- **Sauvegarde quotidienne** : `.github/workflows/sauvegarde.yml` (02:41 UTC) exporte
  données + comptes (médias le dimanche), **vérifie** l'archive, la **chiffre**
  (AES-256, phrase = secret `SAUVEGARDE_PASSPHRASE` ou, à défaut, SHA-256 de la clé
  `service_role`), la **déchiffre et la relit** pour prouver la restauration, puis la dépose
  30 jours en artefact. Le dépôt est public : rien ne sort en clair.
- **Alerte de modération** : `.github/workflows/moderation-alerte.yml` (06:17 UTC) compte
  les signalements ouverts depuis plus de 24 h et ouvre/met à jour/referme une issue
  `[MODÉRATION]` (label `moderation`, jamais `claude`) — GitHub envoie l'e-mail. Fonction
  pure `classerSignalements` (7 verrous unitaires), sans aucune donnée nominative.
- **`npm run moderation traiter --id … --statut handled|dismissed --note "…"`** ferme un
  signalement **en base** ; `lister` ne montre que les ouverts.

## 4. LES GESTES QUI RESTENT — dans l'ordre, et pourquoi cet ordre

> **Où l'on en est, mesuré le 2026-09-12** (canal ① d'ADR-012 — l'état d'une base ne se lit
> pas dans un fichier du dépôt). Le lot client est **déployé** et `migrations/OUVERTURE_2026-09-11.sql`
> est **appliqué** (`client_errors.auth_uid` présent, `profiles.phone` retiré, les deux purges
> `cron` en place). En revanche `migration_ouverture_publique_2026-09-11.sql` n'est **toujours pas
> collé** : `follows.status` absent, **zéro** policy `passio_rt_*`, seau `attachments` encore
> `public = true`. Autrement dit, l'étape 2 ci-dessous est le verrou de tout le reste — les étapes
> 3 et 4 en dépendent, et deux des trois points « reste ouvert » de ce document se ferment avec elle.
> Santé : **zéro `client_errors` sur 24 h**.


1. **Attendre le job « Déploiement production » vert** du lot client (c'est fait si vous
   lisez ceci depuis `main` déployé — vérifier sur https://passio-app.netlify.app que le
   code d'accès n'est plus demandé).
2. **Coller `migrations/migration_ouverture_publique_2026-09-11.sql`** dans l'éditeur SQL
   de Supabase, en un seul geste. Le tableau final doit afficher **13 × OK**. Rejouable.
   ⚠️ Avant le déploiement, la ligne ⑥ ferait disparaître toutes les pièces jointes.
   ⚠️ Coller le fichier ENTIER, jamais une version antérieure : le client cesse d'écrire
   lui-même la notification d'abonnement dès que `follows.status` existe, et c'est le
   trigger `follows_notifier` du même fichier qui la prend en charge. Mesuré le 2026-09-11
   à 17:30 UTC (canal ①) : rien de cette migration n'est encore en production — ni la
   colonne, ni un trigger, ni une policy Realtime.
3. **Tableau de bord Supabase → Realtime → Settings : désactiver les canaux publics**
   (« Allow public access »). C'est ce qui rend les policies de ⑤ **opposables** : tant que
   les canaux publics sont permis, un client qui omet `private: true` écoute encore.
   ⚠️ **Seulement APRÈS l'étape 2** : ce geste refuse tout canal public, et le client ne
   replie sur du public que si la souscription privée est refusée par policy — sans les
   policies, tout le temps réel serait mort. Le client est prêt : **tous** ses canaux sont
   privés (`ring:`, `call:`, `typing:`, `vlive:`, `conv_specific:`, `realtime:db`, `user:`,
   `conv:`), c'est ce que le verrou ⑨ de `ouverture-publique.spec.js` balaie. Après le geste,
   ouvrir l'application à deux comptes et vérifier qu'un message arrive en direct et qu'un
   appel sonne : c'est la seule preuve, aucun test du dépôt ne joue un join Realtime réel.
4. **Tableau de bord Supabase → Authentication** : vérifier que le fournisseur
   **Anonymous** est désactivé (`onbSkipAuth` est un chemin mort, mais un
   `signInAnonymously()` ouvrirait toutes les policies `authenticated`) ; activer la
   **protection des mots de passe compromis** (HaveIBeenPwned) ; lire les quotas d'e-mail.
5. **DKIM / DMARC de `passio-app.fr`** chez Brevo et OVH (`docs/SETUP_SMTP_AUTH.md`) —
   sans eux, l'e-mail de confirmation part en spam et **la personne n'entre jamais**.
   C'est le défaut qui tue une ouverture en silence.
6. **Lancer une fois `Sauvegarde production`** à la main (Actions → Run workflow) et
   déchiffrer l'artefact en local avec la commande de l'en-tête du workflow. Une sauvegarde
   jamais restaurée est une intention.
7. Facultatif : poser le secret `SAUVEGARDE_PASSPHRASE` (sinon le repli documenté sert).
8. **Après la fusion de la PR « search_path »** : coller
   `migrations/migration_search_path_fonctions.sql` (verdict à **4 × OK**). C'est de la défense
   en profondeur, pas une porte ouverte — aucune des trois fonctions n'est `SECURITY DEFINER` —
   donc ce geste vient en DERNIER, jamais avant l'étape 2. ⚠️ Ne pas le remplacer par le
   `set search_path = ''` que Supabase recommande partout : il casserait la recherche de passions
   (`rechercher_passions` appelle `similarity()` sans le qualifier). Le fichier se protège
   lui-même — sa dernière ligne de verdict APPELLE la recherche, donc il échoue bruyamment
   plutôt que de laisser le produit muet.

## 5. Les plafonds du gratuit — ce que « un maximum d'utilisateurs » veut dire ici

| Ressource | Plafond | Conséquence |
|---|---|---|
| Base Supabase (plan gratuit) | 500 Mo, puis **lecture seule** | **53 Mo** le 2026-09-12 ; purges à 7 j / 30 j / 13 mois ; débit borné par ③. |
| Sortie Supabase | 5 Go/mois | Les médias du fil passent par le CDN Netlify (100 Go/mois). Les **pièces jointes** signées n'y passent pas : elles sortent de Supabase. |
| Storage | 1 Go | **C'est le plafond qui mord en premier** — voir sous le tableau. Aucune purge de médias orphelins automatisée. |
| E-mails Brevo | **300 / jour** | Au plus ~300 inscriptions confirmables par jour. Au-delà, les confirmations attendent le lendemain. |
| Auth | 50 000 MAU | Hors de portée à court terme. |
| GitHub `cron` | ~41 % des créneaux servis, écarts de 4 à 5 h | Sauvegarde et alerte sont **quotidiennes**, pas horaires : un glissement de quelques heures ne change rien. |

⚠️ **LE PREMIER MUR N'EST PAS CELUI QU'ON SURVEILLE, ET IL EST BAS.** Mesuré le 2026-09-12 :
le Storage porte **79 Mo pour 65 objets** — 69 Mo dans `content` (53 objets, le plus gros
à **24 Mo**, moyenne 1,34 Mo) et 10 Mo dans `attachments` (12 objets). Rapporté aux **6 comptes**
qui ont produit ce contenu, cela fait ~13 Mo par compte, donc **le seau de 1 Go est plein vers
75 à 80 comptes**. À comparer aux autres lignes : la base est à **53 Mo sur 500** et la
télémétrie est retombée à 20 905 lignes. Autrement dit, ce n'est ni la base, ni la sortie
réseau, ni les e-mails qui arrêteront « un maximum d'utilisateurs » : **c'est le Storage**.

⚠️ **Et la cause est un réglage, pas un usage** : les deux seaux ont `file_size_limit`
à **26 Mo** et `allowed_mime_types` à **NULL** — un seul envoi peut donc consommer 2,6 % du
forfait, et rien ne restreint le type de fichier. Les deux leviers, dans l'ordre de coût
croissant : baisser la limite par fichier (un geste du tableau de bord, réversible) et
compresser les vidéos à l'envoi (un lot client). ⚠️ Ne pas confondre avec le point
« avatars non redimensionnés », qui parle de la charge utile SERVIE à chaque lecture, pas
de l'espace OCCUPÉ : ce sont deux problèmes différents, avec deux remèdes différents.

## 6. Ce qui reste ouvert, et qu'il ne faut pas croire réglé

- L'âge est **déclaratif** et aucun membre n'est vérifié — les CGU le disent.
- La **sonnerie** peut encore porter une fausse identité **entre comptes** (charge utile
  déclarative). Fermer cela demande de router l'invitation par la base (trigger + topic
  `user:<uid>`), un lot à part. Même résidu pour l'hôte d'un **live** (`from` déclaratif).
- **Non vérifié en conditions réelles** (aucun banc ne joue un join Realtime) : qu'un compte
  puisse s'abonner à `ring:<autre>` pour ÉMETTRE alors qu'il n'a pas le droit d'y LIRE. Si
  Realtime refuse le join sans droit de lecture, les appels SORTANTS meurent après l'étape 3
  — à éprouver à deux comptes juste après le geste, et à rouvrir la policy de réception sur
  `ring:%` si c'est le cas.
- `client_errors` : 120 lignes/min pour la table entière — une boucle anonyme suffit à
  faire perdre de vraies erreurs et à aveugler la sentinelle pendant qu'elle tourne.
- **Un seul opérateur** lit les signalements ; l'alerte les porte à son e-mail, elle ne
  décide pas.
- Les avatars ne sont toujours pas redimensionnés (point ouvert du 11/09 matin).
- Aucun test de charge n'a été joué à plus de quelques comptes.
