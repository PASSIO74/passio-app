# Admission 18+ — la fondation serveur de l'accès aux rencontres

**État au 2026-09-08 : migration ÉCRITE et ÉPROUVÉE sur PostgreSQL jetable, NON APPLIQUÉE
en production, interrupteur ÉTEINT par construction.** Rien n'a changé pour personne.

Fichiers du lot :

| fichier | rôle |
|---|---|
| `migrations/migration_admission_18_plus.sql` | la migration, atomique et idempotente |
| `migrations/preflight_admission_18_plus.sql` | diagnostic **avant** application (lecture seule) |
| `migrations/controles_post_admission_18_plus.sql` | vérification de l'état atteint **après** (lecture seule) |
| `tests/sql/migration-admission-18-plus.test.sh` | le banc : 99 contrôles, gate CI |
| `tests/sql/socle-prod-admission.sql` | addendum au socle #136 (policies UPDATE/DELETE réelles) |

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
restent permis à tout le monde. Un compte que la règle rattrape — inscrit avant l'allumage,
ou dont l'année déclarée le rend mineur — doit pouvoir sortir ; il ne doit jamais pouvoir
revenir, ni pointer son arrivée (le check-in réécrit `rsvp = 'going'`, il est donc couvert
par la même policy UPDATE).

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
aucun GRANT, aucune policy, RLS active. Le client ne peut ni sonder l'état ni le changer.

## 5. Ce que le client peut demander

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

1. **Le client ne déclare toujours pas l'année.** `declare_birth_year` n'est appelé que par
   `irlProposalDeclareBirthYear` (app-07), sous le drapeau `passio_irl_proposal_v1`, éteint.
   Tant que l'onboarding ne l'appelle pas, **allumer l'interrupteur couperait l'IRL à tout
   le monde** — y compris aux comptes majeurs, qui n'ont aucune ligne `user_safety`
   (2 lignes pour 6 comptes en production au 2026-09-08, soit **4 comptes sur 6 sans
   majorité déclarée**, portant 4 inscriptions actives et 1 événement). C'est le prochain
   lot, et c'est un prérequis strict de l'allumage.
1 bis. **Aucune surface ne lit `adult_access_status()`** — zéro appelant dans `js/`. Sans
   elle, un compte non admis ne rencontre pas un refus expliqué mais une **écriture RLS à
   zéro ligne**, c'est-à-dire l'échec silencieux que `CLAUDE.md` interdit. Montrer la porte
   avant le refus fait partie du même lot que le point 1.
2. **L'étape d'âge n'est pas atteinte sur le chemin d'inscription nominal** (AUTH-02) :
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

`bash tests/sql/migration-admission-18-plus.test.sh` — **99 contrôles, 0 échec**, sur un
PostgreSQL 16 jetable, socle recopié des policies réelles de production. Gate CI (job
« Audits statiques et bancs serveur »).

Sept sections : atomicité (une policy inconnue annule tout, y compris ce qui précédait) ·
interrupteur éteint (comportement d'avant pour majeur, mineur et inconnu) · idempotence
(rejouée, elle ne rétrograde jamais un interrupteur allumé) · interrupteur allumé (les six
cas décidables, la porte qui s'ouvre par la déclaration, le retrait permis et le retour
interdit, la conversation qui suit) · fail-closed (ligne supprimée = exigé) · **11
mutations** (chaque garde retirée doit rendre son test rouge) · **19 contrôles
d'exploitation** confrontés à chaque faux vert connu.

Deux défauts ont été trouvés **en exécutant** le banc, pas en le relisant :

- une sonde faisait un `UPDATE` sur un compte sans ligne `user_safety` : zéro ligne touchée,
  aucune erreur, et la mutation « comparaison relâchée à l'année » paraissait détectée alors
  que rien n'était éprouvé. Corrigée en `INSERT … ON CONFLICT`.
- la même mutation est **indétectable le 31 décembre** (la date-témoin est atteinte ce
  jour-là). Le banc le détecte à l'exécution et saute les deux contrôles concernés en le
  disant, plutôt que de compter un vert qui n'en est pas un.

Le banc #136 reste vert (86 contrôles) : la redéfinition de `can_join_event_conversation`
n'y touche pas, il n'applique pas cette migration.
