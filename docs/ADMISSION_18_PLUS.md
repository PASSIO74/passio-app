# Admission 18+ — la fondation serveur de l'accès aux rencontres

**État au 2026-09-08 : migration ÉCRITE et ÉPROUVÉE sur PostgreSQL jetable, NON APPLIQUÉE
en production, interrupteur ÉTEINT par construction. La porte CLIENT est branchée et
testée.** Rien n'a changé pour personne : tant que la migration n'est pas appliquée, la
porte est transparente (§5).

Fichiers du lot :

| fichier | rôle |
|---|---|
| `migrations/migration_admission_18_plus.sql` | la migration, atomique et idempotente |
| `migrations/preflight_admission_18_plus.sql` | diagnostic **avant** application (lecture seule) |
| `migrations/controles_post_admission_18_plus.sql` | vérification de l'état atteint **après** (lecture seule) |
| `tests/sql/migration-admission-18-plus.test.sh` | le banc : 133 contrôles, gate CI |
| `tests/sql/socle-prod-admission.sql` | addendum au socle #136 (policies UPDATE/DELETE réelles) |
| `js/app-07-ia-explore-irl.js` | la porte côté client (`requireAdmission`, bloc « ADMISSION 18+ ») |
| `tests/e2e/admission-18-plus.spec.js` | le verrou de la porte : 16 cas |

---

## 1. Le défaut qu'on ferme

L'audit du 2026-09-04 (`.passio/audits/BILAN_PASSIO_09-26/`) le dit à trois endroits —
IRL-02 (P1), MOD-08, AUTH-02 :

> `irl_interaction_allowed` et `declare_birth_year` ne sont appelés que sous le drapeau
> `passio_irl_proposal_v1`, éteint par défaut. L'âge est une année auto-déclarée côté
> client, `isMinor` vit en localStorage et n'est lu par **aucune** écriture IRL.

Autrement dit : **la garde de majorité serveur de #136 existe, et rien ne l'appelle.** Un
compte de 13 ans organise une rencontre, s'y inscrit, rejoint sa conversation de groupe.
La barrière n'était pas cassée, elle n'était branchée sur rien.

Ce lot la branche **là où elle ne peut pas être contournée** : dans les policies RLS des
surfaces d'écriture IRL. Pas dans un `if` du client, qui n'est jamais une frontière.

## 2. La règle

Trois gestes exigent l'admission :

| geste | table / fonction | policy |
|---|---|---|
| organiser une rencontre | `events` INSERT | `events_insert_author_adult` |
| s'inscrire, changer d'avis, pointer son arrivée | `event_attendees` INSERT / UPDATE | `event_attendees_insert_own_adult`, `event_attendees_update_own_adult` |
| rejoindre la conversation de groupe | `can_join_event_conversation()` | policy INSERT de `conv_members` (#136) |

Et **un geste ne l'exige jamais : le RETRAIT.** Passer en `declined` et supprimer sa ligne
restent permis à tout le monde, y compris par `upsert` (l'exception vaut sur l'INSERT comme
sur l'UPDATE). Un compte que la règle rattrape — inscrit avant l'allumage, ou dont l'année
déclarée le rend mineur — doit pouvoir sortir ; il ne doit jamais pouvoir revenir.

⚠️ **Un `WITH CHECK` ne voit que la ligne finale, jamais l'ancienne.** L'exception
« declined » ouvrait donc bien plus que le retrait : un compte non admis écrivait
`checked_in_at`, `rating` et `feedback` — une preuve de participation — du moment que la
même requête posait `rsvp = 'declined'`. Le pointage alimente « N sur place » et le badge
« Fiable » ; la note entre dans la moyenne. Seul un trigger voit `OLD` :
`trg_event_attendees_admission` (BEFORE INSERT OR UPDATE) ramène ces colonnes à leur valeur
d'avant au lieu de refuser, pour que « je me retire » ne puisse jamais transporter autre
chose que le retrait. Défaut trouvé en revue adversariale, reproduit, corrigé, verrouillé.

⚠️ **Organiser ne se résume pas à l'INSERT.** La policy de production
« Update organisateurs » n'a aucun `WITH CHECK` : PostgreSQL réutilise alors son `USING`, et
`author_id` devenait réassignable — un co-organisateur, promu par un geste produit ordinaire,
se déclarait auteur puis déplaçait date et lieu. `trg_events_admission` pose deux règles :
`author_id` est immuable pour qui n'est pas l'auteur courant (vrai **en toutes
circonstances**, seul point que ce lot change interrupteur éteint), et un compte non admis ne
modifie plus son événement sauf pour l'**annuler** — le pendant, côté organisateur, du droit
de retrait.

**Est admis** un compte connecté dont `user_safety.majority_at <= CURRENT_DATE`. Cette date
vient de #136 : elle est dérivée par le serveur du **31 décembre de l'année des 18 ans** à
partir de l'année auto-déclarée, jamais reculable (trigger `trg_user_safety_majorite`).

## 3. Ce que ce lot NE fait PAS

- **Il ne vérifie pas l'âge.** L'année reste auto-déclarée. Une vérification documentaire
  ou par tiers est un autre chantier, avec un coût et une décision produit.
- **Il n'allume rien.** L'interrupteur est éteint à l'application (§4).
- **Il ne touche pas la LECTURE.** Adresse, téléphone et liste des participants d'une
  rencontre restent lisibles sans compte (IRL-01/IRL-03) : c'est un lot distinct, et le
  refermer sans lui laisserait la moitié du problème.
- **Il ne touche pas les commentaires ni les réactions d'événement** (`event_comments`,
  `event_reactions`) : un mineur peut toujours y écrire. Point ouvert assumé §7.
- **Il ne change rien côté client.** Aucun fichier `js/` n'est modifié. La conséquence est
  au §7.

## 4. L'interrupteur

Premier kill switch **serveur** du dépôt. L'audit relevait 35 drapeaux, tous côté client,
donc tous inopérants à distance : celui-ci se bascule en une requête, sans redéployer.

```sql
-- ALLUMER  (canal ③ d'ADR-012 : psql ou SQL Editor — jamais depuis la CI, jamais le client)
UPDATE public.access_policies SET enabled = TRUE,  updated_at = NOW() WHERE key = 'irl_adult_only';
-- ÉTEINDRE
UPDATE public.access_policies SET enabled = FALSE, updated_at = NOW() WHERE key = 'irl_adult_only';
```

⚠️ **Ne JAMAIS supprimer la ligne pour « éteindre ».** `adult_access_enforced()` est
fail-closed : ligne absente = admission **EXIGÉE**. Une table vidée par accident durcit la
règle, elle ne l'ouvre pas. Le banc l'éprouve (section ⑤) et les contrôles post-migration
le disent (ligne `A. interrupteur` → `ABSENT`).

La table `access_policies` n'est lisible ni écrivable par `anon` ni par `authenticated` :
aucun GRANT, aucune policy, RLS active. Le client ne peut pas **basculer** l'interrupteur
ni lire cette table. Il en connaît en revanche le verdict **le concernant** par
`adult_access_status()`, et c'est voulu : l'état de la règle n'est pas un secret, c'est ce
qui permet de montrer la bonne porte avant le refus.

## 5. La porte côté client

La **barrière** est serveur. Le client porte une **porte** : `requireAdmission(ctx)`, posée
sur `setEventRsvp` et `submitEvent`, juste après `requireAuthentication` — on ne demande
pas son âge à quelqu'un qui n'a pas encore de compte.

⚠️ **Elle échoue OUVERT, et c'est le point le plus important du lot.** C'est l'inverse exact
de la garde `irlProposalVerdict` juste en dessous d'elle dans le même fichier : celle-là tient
une frontière que personne d'autre ne tient, donc elle retient au moindre doute. Celle-ci
double une frontière déjà tenue par la base. Si le statut est illisible — migration pas
encore appliquée, réseau coupé, SDK absent — retenir couperait l'IRL à **tout le monde**
pour une panne de courtoisie, alors que le serveur, lui, sait très bien décider. On laisse
passer, et le serveur refuse.

C'est ce qui rend ce lot **déployable avant la migration** : tant que `adult_access_status`
n'existe pas, la porte est transparente. Le cas ① de la suite e2e mesure exactement cela.

Ce qu'elle fait, selon le statut :

| statut | ce qui se passe |
|---|---|
| `off`, `inconnu`, `admitted` | rien, l'action continue |
| `undeclared` | l'année locale est d'abord poussée en silence ; si ça ne suffit pas, une fenêtre la demande |
| `minor` | refus expliqué, qui dit ce qui **reste ouvert** — et ne redemande pas l'année |

**Le retrait n'est jamais gardé** : `setEventRsvp` n'appelle la porte que pour une valeur
d'inscription, jamais pour `null` ni `declined`.

**Les comptes existants n'ont rien à ressaisir** : `admissionRappelServeur()`, déclenché une
fois au démarrage depuis `_initRealSupa`, pousse l'année déjà saisie à l'onboarding. Sans ce
rappel, allumer la règle couperait l'IRL à tous les comptes créés avant elle — ils ont une
année en local et aucune ligne côté serveur.

## 5 bis. Ce que le client peut demander

Une seule fonction, pour choisir la porte à montrer **avant** de se prendre un refus :

```js
const { data } = await supa.rpc("adult_access_status");
// "off"        → la règle est éteinte : aucune porte à montrer
// "admitted"   → rien à demander
// "undeclared" → demander l'année de naissance, puis rpc("declare_birth_year", { _birth_year })
// "minor"      → l'IRL n'est pas accessible ; le dire, sans redemander l'année
```

`adult_access_allowed()` rend le booléen brut. Les deux ne parlent **que de l'appelant** :
aucun oracle sur l'âge d'autrui, contrairement à `irl_interaction_allowed(_other)` de #136
(qui, lui, révèle indirectement la majorité déclarée d'un tiers — SUP-05, point ouvert).

`adult_access_enforced()` et `is_adult_declared()` sont des aides internes : les policies
les atteignent par le `SECURITY DEFINER`, `authenticated` n'a pas l'`EXECUTE`. Un contrôle
post-migration l'exige, et une mutation du banc le prouve.

## 6. Procédure d'application

1. **Preflight** (SQL Editor, lecture seule) : `migrations/preflight_admission_18_plus.sql`.
   Aucun `BLOQUANT` attendu. La section 3 dit **combien de comptes** l'allumage coupera —
   c'est le chiffre à regarder avant de décider, pas après.
2. **Migration** (canal ③) : `psql "$DATABASE_URL" -f migrations/migration_admission_18_plus.sql`.
   Atomique : toute erreur annule tout. Elle **refuse** de s'appliquer si une policy
   INSERT/UPDATE inconnue traîne sur `events` / `event_attendees`, ou si #136 manque.
3. **Contrôles** : `migrations/controles_post_admission_18_plus.sql`. Toutes les lignes en
   `OK`, plus une ligne `INFO` disant `irl_adult_only = eteint`. **Un seul `ECHEC` = ne pas
   allumer.**
4. **Allumer** — décision produit, pas technique. Rejouer les contrôles après.

Retour arrière : en pied de `migration_admission_18_plus.sql`. Il restaure les policies
d'avant et n'efface **aucune** donnée (`user_safety` et les inscriptions restent).

## 7. Points ouverts — ce qui reste à faire avant que la règle protège vraiment

Ils sont listés parce qu'ils sont réels, pas pour mémoire. La fondation serveur est posée ;
elle ne suffit pas.

1. ~~Le client ne déclare pas l'année.~~ **FERMÉ le 2026-09-08** : `requireAdmission` +
   `admissionRappelServeur` (§5), 16 cas e2e. Ce qui suit décrit l'état d'AVANT et reste
   pour mémoire — l'ordre d'allumage, lui, tient toujours : appliquer la migration, vérifier
   les contrôles, déployer le client, PUIS allumer.
   *(état d'avant)* **Le client ne déclarait pas l'année.** `declare_birth_year` n'est appelé que par
   `irlProposalDeclareBirthYear` (app-07), sous le drapeau `passio_irl_proposal_v1`, éteint.
   Tant que l'onboarding ne l'appelle pas, **allumer l'interrupteur couperait l'IRL à tout
   le monde** — y compris aux comptes majeurs, qui n'ont aucune ligne `user_safety`
   (2 lignes pour 6 comptes en production au 2026-09-08, soit **4 comptes sur 6 sans
   majorité déclarée**, portant 4 inscriptions actives et 1 événement). C'est le prochain
   lot, et c'est un prérequis strict de l'allumage.
1 bis. ~~Aucune surface ne lit `adult_access_status()`.~~ **FERMÉ le 2026-09-08.**
   *(état d'avant)* **Aucune surface ne lisait `adult_access_status()`** — zéro appelant dans `js/`. Sans
   elle, un compte non admis ne rencontre pas un refus expliqué mais une **écriture RLS à
   zéro ligne**, c'est-à-dire l'échec silencieux que `CLAUDE.md` interdit. Montrer la porte
   avant le refus fait partie du même lot que le point 1.
2. **L'étape d'âge n'est toujours pas atteinte sur le chemin d'inscription nominal**
   (AUTH-02) — mais elle ne bloque plus l'admission : la porte demande l'année au premier
   geste IRL, ce qui contourne le trou sans le refermer. Le trou reste, et il reste à
   corriger pour la cohérence de l'onboarding :
   depuis l'activation de « Confirm email », `signUp` ne rend plus de session, et les trois
   chemins de retour (lien de confirmation, connexion, reprise) posent `onboarded = true`
   sans passer par `onbValidateAge`. Corriger l'un sans l'autre ne donne rien.
3. **`skipToApp` pose `birthYear = 1995`** (app-08:320) — un compte « majeur » sans saisie.
   Sans appelant dans le dépôt, atteignable par la console. À borner au mode démo.
4. **L'écran promet un « contrôle d'âge IA » qui n'existe pas** (`index.html:311`, UXO-07).
   La documentation du produit demande son retrait depuis le 2026-08-20.
5. **La lecture reste ouverte** : adresse, téléphone, participants sans compte (IRL-01/03).
6. **Commentaires et réactions d'événement** ne sont pas couverts.
6 bis. **Les adhésions déjà posées survivent.** `can_join_event_conversation`
   garde l'INSERT dans `conv_members` : un compte non admis qui était **déjà**
   membre d'une conversation d'événement le reste, et continue d'y lire et d'y
   écrire (la policy INSERT de `conv_messages` teste l'appartenance, pas
   l'admission). Le jour de l'allumage, cela concerne les adhésions existantes ;
   les retirer serait une décision produit distincte, pas un effet de bord.
6 quater. **La branche « créateur » de `conv_members` n'est pas gardée.** L'admission entre
   par `can_join_event_conversation`, qui ne couvre que le self-join. Un organisateur adulte
   peut donc ajouter n'importe qui, mineur compris, au groupe de sa rencontre. Le fermer
   demanderait un prédicat sur la majorité **d'un tiers**, et toute fonction appelée par une
   policy doit être exécutable par le rôle appelant — elle deviendrait donc un RPC, c'est-à-dire
   un oracle sur l'âge d'autrui. Le geste correct est de la poser dans un schéma non exposé
   (`migrations/migration_fonctions_rls_hors_schema_expose.sql`, écrite le 2026-09-03, jamais
   appliquée). Limite assumée, pas un oubli.
6 ter. **`anon` garde UPDATE et DELETE** sur `events` et `event_attendees` : la
   migration ne lui retire que l'INSERT. Ces droits sont inopérants — leurs
   policies exigent `auth.uid()`, NULL sans session — mais ils sont là, et le
   banc le mesure explicitement plutôt que de laisser croire le contraire.
7. **Âge minimum** : 13 ans aujourd'hui, la majorité numérique française est à 15 (EXP-14).
   Décision produit et juridique, pas technique.
8. **`irl_interaction_allowed(_other)` reste un oracle** sur la majorité déclarée d'un tiers
   (SUP-05). La migration `migration_fonctions_rls_hors_schema_expose.sql`, écrite le
   2026-09-03, n'est toujours pas appliquée.

## 8. Ce qui a été éprouvé, et comment

`bash tests/sql/migration-admission-18-plus.test.sh` — **133 contrôles, 0 échec**, sur un
PostgreSQL 16 jetable, socle recopié des policies réelles de production. Gate CI (job
« Audits statiques et bancs serveur »).

Sept sections : atomicité · interrupteur éteint (comportement d'avant pour majeur, mineur
et inconnu) · idempotence · interrupteur allumé (les cas décidables, la porte qui s'ouvre
par la déclaration, le retrait permis et le retour interdit, le pointage et la note
inaccessibles à un non admis, l'édition d'événement gardée, la conversation qui suit) ·
fail-closed · **14 mutations** (chaque garde retirée doit rendre son test rouge) · **26
contrôles d'exploitation** confrontés à chaque faux vert connu.

Défauts trouvés **en exécutant**, pas en relisant :

- une sonde faisait un `UPDATE` sur un compte sans ligne `user_safety` : zéro ligne touchée,
  aucune erreur, et la mutation « comparaison relâchée à l'année » paraissait détectée alors
  que rien n'était éprouvé. Corrigée en `INSERT … ON CONFLICT`.
- la même mutation est **indétectable le 31 décembre** (la date-témoin est atteinte ce
  jour-là). Le banc le détecte à l'exécution et saute les deux contrôles concernés en le
  disant, plutôt que de compter un vert qui n'en est pas un.
- le socle du banc divergeait de la production sur six points (co-organisateurs, policy
  SELECT en doublon, GRANTs de `anon`, colonnes `feedback` et `rated_at`). Corrigés dans
  l'addendum, jamais dans `socle-prod.sql`, pour ne pas déplacer les prémisses du banc #136.
- une assertion affirmait qu'un auteur peut céder son événement : c'est **faux**, la policy
  le refuse déjà. Le test dit désormais le vrai — et prouve au passage que le trigger ne
  retire aucun geste légitime.

Défauts trouvés par la **revue adversariale** du 2026-09-08, tous reproduits par exécution
et tous corrigés ici : l'échappatoire « declined » (§2), l'édition d'événement non gardée
(§2), les policies `FOR ALL` invisibles des gardes et des contrôles (`cmd = 'ALL'`, le
gabarit « Enable all operations » du tableau de bord), le préflight qui échouait au *parse*
sur la base même qu'il doit diagnostiquer, le compteur du banc qui rendait « aucun échec »
quand le fichier de contrôle partait en erreur, l'upsert qui fermait le retrait, et le
`USING` d'une policy que nul contrôle ne lisait.

Le banc #136 reste vert (86 contrôles) : la redéfinition de `can_join_event_conversation`
n'y touche pas, il n'applique pas cette migration.
