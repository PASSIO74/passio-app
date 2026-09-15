# Dossier d'écart — PR #440 : une migration appliquée en production hors procédure

**ASTRA-33 (quatrième contre-revue, 15/09/2026) · NET-07 / EXP-12**
Consigné le **2026-09-15** (date de consignation). Les dates des faits sont
celles que GitHub et la base portent ; elles ne sont pas reconstruites.

> **Ce document ne requalifie rien.** Il n'invente aucune chronologie, ne
> transforme aucune revue postérieure en revue préalable, et distingue partout
> ce qui est **mesuré** de ce qui est **rapporté par l'auteur**.

---

## 1. Ce qui est établi, et par quoi

| Fait | Horodatage (UTC) | Source — vérifiable |
|---|---|---|
| Commit initial de la branche `mod-01-suspension-compte` | 2026-09-15 **10:38:45** | `git`/API GitHub, commit `f4d3c6c` |
| PR #440 ouverte | 2026-09-15 **10:38:52** | API GitHub, `created_at` |
| Review #5208862313 « Contre-revue technique indépendante », état **COMMENTED**, auteur **PASSIO74**, sur `f4d3c6c` | 2026-09-15 **10:42:44** | API GitHub, `submitted_at` |
| Second commit `f756041` (correction du banc) | 2026-09-15 **11:01:39** | API GitHub |
| Review #5209131307 « Contre-revue technique indépendante », état **COMMENTED**, auteur **PASSIO74**, sur `f756041` | 2026-09-15 **11:05:38** | API GitHub, `submitted_at` |
| PR #440 fusionnée par PASSIO74 | 2026-09-15 **11:37:06** | API GitHub, `merged_at` |
| `moderation_actions_action_check` admet `suspension` et `levee` **en production** | mesuré le 2026-09-15 | `pg_constraint` sur `njkiyoklssvefstljemx` (canal ① d'ADR-012) |
| `migrations/migration_moderation_suspension_2026-09-15.sql` **n'a AUCUNE ligne** dans `public.migrations_appliquees` de la production | mesuré le 2026-09-15 | `select * from public.migrations_appliquees order by id` (6 lignes, aucune pour ce fichier) |

## 2. Ce qui est rapporté par l'auteur, et non établi

Le corps de la PR #440 et le message de commit `f4d3c6c` disent :

> « ⚠️ Appliquée sur la **PRODUCTION à 13 h 30 AVANT la contre-revue**, par
> erreur de cible (sans `SUPABASE_PROJECT_REF`) — puis sur le staging ».

Ce qui **reste non établi** :

- **l'heure.** « 13 h 30 » n'est daté par aucune trace conservée. Si c'est
  l'heure locale (CEST, UTC+2), elle vaut **11:30 UTC** — soit **après** les
  deux reviews, et non « avant ». Si c'est UTC, elle est postérieure de près de
  deux heures à la fusion. **Les deux lectures contredisent le texte** ; aucune
  n'est démontrable. On conserve donc : *heure d'application non mesurée* ;
- **l'ordre revue / application.** Les deux reviews sont `COMMENTED`, pas
  `APPROVED` : elles n'établissent pas une validation, et leur horodatage ne
  peut pas être confronté à une application dont l'heure manque ;
- **le contenu revu.** Rien ne reliait le fichier envoyé à un contenu relu : la
  review porte sur un `commit_id`, pas sur l'empreinte du SQL effectivement
  exécuté. C'est exactement le trou qu'ASTRA-33 ② nomme.

## 3. Le fait NEUF, mesuré pendant ce lot

**La reconstruction rétroactive du journal a oublié la migration de #440.**

`public.migrations_appliquees` en production porte 6 lignes : quatre marquées
`outil = 'retroactif-2026-09-15'` (reconstruction) et deux écrites par
`appliquer-migration.mjs` (#442 et #447). `migration_moderation_suspension_2026-09-15.sql`
**n'y figure pas**, alors que son effet est en base (§1, dernière ligne).

Conséquence à retenir : **le journal ne sait pas dire ce qu'il ne sait pas.**
Une base peut porter une migration dont le journal n'a aucune trace, et rien ne
le signale — la seule façon de s'en apercevoir est de comparer l'état mesuré au
journal, migration par migration. Le journal reste utile ; il n'est pas une
preuve d'exhaustivité, et NET-07 ne peut pas être fermé sur sa seule existence.

## 4. Ce que la barrière change, et ce qu'elle ne change pas

Livré dans ce lot (`scripts/lib/barriere-migration.js`, 13 verrous dans
`tests/unit/barriere-migration.test.mjs`, trois réinjections mesurées) :

- **la cible ne peut plus être implicite** — la cause directe de l'incident.
  `appliquer-migration.mjs` refuse sans `--projet <ref>` ou
  `SUPABASE_PROJECT_REF` ; le projet lié du poste n'est plus une cible par
  défaut, il ne sert qu'à dire « tu vises ailleurs que lui » ;
- **sur une cible protégée, le contenu envoyé doit être celui qui a été revu** —
  empreinte SHA-256 attestée dans `.passio/migrations/attestations.json`, pour
  cette cible, avec PR, relecteur, date et source. Une retouche postérieure est
  refusée en nommant les deux empreintes ;
- **le journal entre dans la transaction de la migration** — plus de fenêtre
  entre « appliquée » et « journalisée ». Et son DDL part **avant** : ne pas
  savoir journaliser **interdit** d'appliquer ;
- **le processus ne sort plus vert** sur une phase échouée ou indéterminée (les
  deux anciennes sorties prématurées — verdict absent, verdict en ECHEC —
  passaient toutes deux avant l'écriture du journal).

Ce que la barrière **ne** change **pas** :

- elle ne remplace pas la revue, elle empêche d'appliquer autre chose que ce qui
  a été revu, ailleurs que là où la revue le permettait ;
- **elle ne répare pas #440 rétrospectivement.** La revue de #440 restera
  postérieure ou non située ; aucune attestation ne doit être fabriquée pour lui
  donner l'apparence d'une revue préalable ;
- elle n'établit pas l'exhaustivité du journal (§3).

## 5. Le retour arrière, dit juste

Le retour arrière évoqué pour cette migration — restreindre à nouveau le CHECK
de `moderation_actions.action` — **n'est pas sans perte** : il exige de
supprimer les lignes `suspension` et `levee` déjà écrites, sinon la contrainte
est refusée. Ce sont des décisions de modération journalisées. Le présenter
comme un retour arrière neutre serait faux. Le geste juste, si on veut revenir,
est d'**exporter** ces lignes avant, et de le dire.

## 6. État, en quatre colonnes

| | ASTRA-33 |
|---|---|
| **Corrigé dans le code** | OUI — `scripts/lib/barriere-migration.js`, `scripts/appliquer-migration.mjs`, `scripts/attester-migration.mjs`, `.passio/migrations/` |
| **Testé** | OUI — `tests/unit/barriere-migration.test.mjs` (13), exécutés sur ce poste ; trois réinjections font rougir 1, 6 et 2 cas |
| **Déployé** | **NON MESURÉ** — outil de poste, rien à déployer ; la barrière ne s'applique qu'à partir de la prochaine migration envoyée par cet outil |
| **Vérifié après déploiement** | **NON MESURÉ** — aucune migration n'a été appliquée depuis (aucune n'est attestée : `attestations.json` est vide, délibérément) |

**Reste ouvert et hors de ce lot :** NET-07 (exhaustivité du journal, §3),
l'absence de ligne pour #440 (une consignation rétroactive est **préparée mais
non appliquée** — c'est une écriture en production, non autorisée ici), et la
question de procédure (`COMMENTED` ≠ validation) qui appartient au propriétaire.
