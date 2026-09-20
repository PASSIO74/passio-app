# La télémétrie sort du temps réel — 91 % du travail de réplication disparaît

*2026-09-20, quatrième volet de « capacité ». Mesures au canal ① d'ADR-012, cumul 129 jours.*

---

## 1. La demande, et pourquoi la réponse n'était pas où je cherchais

Benjamin : « trouve une solution pour augmenter **considérablement** ces chiffres, sans investir ».

Les trois volets précédents ont grignoté des postes réels (le filet du fil, l'amplification du
temps réel, le référentiel chargé par la CI). Aucun ne changeait l'**ordre de grandeur**, parce
qu'aucun ne touchait le premier poste de la base.

| Poste | CPU | Part |
|---|---:|---:|
| **Décodage WAL (Realtime)** — deux formes | **50 859 s** | **68,9 %** |
| Lectures `telemetry_events` (pilotage) | 6 397 s | 8,7 % |
| Référentiel des passions (fermé le même jour) | 4 368 s | 5,9 % |
| `rechercher_passions` | 1 687 s | 2,3 % |

Le temps réel est **le** poste. Son coût est proportionnel au nombre de **changements publiés**,
multiplié par le nombre d'abonnements qui matchent. Restait à savoir d'où viennent les changements.

## 2. Une seule table fait 91,4 % de tout ce que la base réplique

`pg_stat_user_tables`, somme `insert + update + delete`, sur les **douze** tables publiées :

| Table | Changements | Part |
|---|---:|---:|
| **`telemetry_events`** | **481 554** | **91,4 %** |
| `profiles` | 20 748 | 3,9 % |
| `posts` | 6 934 | 1,3 % |
| `video_lives` | 6 583 | 1,2 % |
| `notifications` | 5 901 | 1,1 % |
| `conv_messages` | 1 901 | 0,4 % |
| les six autres | 3 135 | 0,6 % |
| **Total** | **526 756** | |

Et l'abonné de cette table, **c'est UN client** : `dashboard/server/ingest.js`, le Centre de
pilotage, sur le poste de l'éditeur. **Neuf dixièmes du travail temps réel de la production
servaient un seul tableau de bord.**

⚠️ **Ce n'est pas un désaveu de la migration du 2026-09-19, qui avait raison.** Elle écrit noir sur
blanc que retirer cette table « aurait éteint le tableau de bord en direct, SANS une erreur » —
repli silencieux sur le polling, donc symptôme « c'est un peu en retard », jamais « c'est cassé ».
Ce raisonnement tient toujours. **Ce qui change, c'est qu'on ne se contente plus de retirer la
table : on change de mécanisme, explicitement.**

## 3. ⚠️ Ce que j'ai cru pouvoir faire et qui est IMPOSSIBLE — arrêté avant d'écrire du SQL

En croisant « ce qui est publié » et « ce que l'app écoute », j'ai mesuré **229 613 changements
(43,6 %) qui concernent des opérations que PERSONNE n'écoute** : le DELETE de la purge de
télémétrie (204 195), l'INSERT et le DELETE de `profiles` (16 223), le DELETE de `posts` (3 440)…
Le plan évident était de restreindre les opérations publiées table par table.

**C'est impossible.** `pubinsert`, `pubupdate`, `pubdelete` et `pubtruncate` sont des colonnes de
**`pg_publication`** — le paramètre `publish` est réglable **par publication, jamais par table**.
`pg_publication_rel` ne porte qu'un filtre de lignes (`prqual`) et une liste de colonnes
(`prattrs`). Vérifié sur la production (PG 17.6) avant d'écrire une ligne.

Ce gaspillage est donc **réel et inatteignable par ce chemin**. Il disparaît ici par un autre
effet : la table qui en porte 89 % sort entièrement de la publication.

## 4. Le lot

**Migration** `migrations/migration_realtime_telemetry_2026-09-20.sql` — une transaction, un
verdict qui **lève** si une table du produit disparaissait, **rejouable**, retour arrière d'une
ligne.

**Pilotage** — le canal `postgres_changes` est retiré de `dashboard/server/ingest.js`, et le
polling **cesse d'être un secours pour devenir le chemin nominal**. Trois conséquences traitées :

- ⚠️ **L'alerte « Realtime décroché » est désarmée EXPLICITEMENT** (`realtimeUtilise: false`). Elle
  ne se déclencherait déjà plus — `realtimeStatus` reste `null`, donc falsy — mais **un verrou qui
  tient par accident finit par le dire** : le jour où quelqu'un initialise ce champ à `"IDLE"` pour
  faire joli, l'alarme se rallume pour toujours. Une alarme qui crie à tort emporte les vraies.
- ⚠️ **La cadence ne change pas (5 s), et c'est délibéré.** La tentation était de la resserrer pour
  « compenser » ; mais ce polling est mesuré à **1,0 ms** par lecture et 5 s suffisent largement à
  une console de supervision. Accélérer aurait ajouté du coût pour une latence imperceptible.
- ⚠️ **Le canari n'est pas concerné** : il est observé par `ingestOne`, point de passage UNIQUE de
  tout événement entrant (historique, realtime, polling). Il vivait déjà sans le canal, et sa
  fenêtre est de 15 minutes.

**Ordre d'application, non négociable** : ① le pilotage est déployé sur le poste, ② *seulement
ensuite* la migration. Dans l'autre sens, le pilotage garderait une souscription qui passe
`SUBSCRIBED` et ne livre plus jamais rien — le défaut muet que `audit:realtime` existe pour
empêcher.

## 5. Ce que ça change, dit juste

Le décodage WAL est proportionnel aux changements publiés. En retirer 91,4 % fait tomber ce poste
de **68,9 % à environ 6 %** du CPU actuel : **la base fait à peu près le tiers du travail, à trafic
identique.**

⚠️ **Et ça ne s'use pas avec la croissance** : le volume de télémétrie grandit avec le nombre
d'utilisateurs, donc ce n'est pas un gain ponctuel — c'est un terme qu'on retire de l'équation.

⚠️ **Ce que ça ne fait PAS, et il faut le dire** : la forme quadratique demeure sur les onze tables
du produit — à 2 000 connectés, une publication reste évaluée 2 000 fois. Elle ne pesait que
**8,6 %** des changements jusqu'ici, donc elle était invisible derrière la télémétrie ; elle
devient le poste dominant du temps réel après ce lot. **S'abonner à ce qui est VISIBLE reste un
changement d'architecture, pas un réglage** — c'est le prochain mur, et il n'est pas franchi ici.

## 6. Le geste qui reste à faire, et il est humain

La migration est écrite, son banc est vert (11 contrôles, deux réinjections), mais **elle n'est pas
appliquée** : ADR-012 réserve délibérément le canal ③ à un geste depuis le poste.

```
npm run migration:appliquer -- migrations/migration_realtime_telemetry_2026-09-20.sql
```

⚠️ **APRÈS le déploiement du pilotage**, jamais avant. Et on **mesure ensuite l'état en base**
(canal ①), jamais le tableau de verdict imprimé — un miroir périmé imprime OK sur tout :

```sql
select count(*) from pg_publication_tables
 where pubname = 'supabase_realtime' and schemaname = 'public';   -- doit rendre 11
```

## 7. Trois pièges rencontrés en chemin

⚠️ **Le commentaire qui explique la règle déclenche la règle — troisième fois en une journée.** La
gate `audit:realtime` s'était déjà attrapée elle-même le 19/09, puis avait attrapé le commentaire
de `charge.mjs` ce matin ; ici c'est mon verrou de source du pilotage qui a rougi parce que le
commentaire d'`ingest.js` **cite** `admin.channel(` pour expliquer le retour arrière. Le correctif
est durable : **un verrou de source qui cherche un jeton retire les commentaires d'abord** — sinon
il interdit d'expliquer ce qu'il garde, et un verrou qu'on ne peut pas documenter finit désarmé.

⚠️ **`alter publication … drop table` n'est pas du DDL de table**, et `audit:tables-compte` le
prenait pour tel : elle refusait cette migration — qui ne touche aucune table — en réclamant « un
identifiant de compte » sur une table qu'elle n'avait jamais lue. **Un faux positif sur une gate de
sécurité coûte plus qu'un trou** : il pousse à réécrire la migration pour lui plaire, ou à
l'inscrire au socle — deux façons de la désarmer en croyant la respecter. La gate neutralise
désormais cette forme avant de chercher du DDL, et un verrou exige qu'un **vrai** `drop table`
reste signalé.

⚠️ **Le banc de la migration précédente comparait son état final au JSON d'aujourd'hui.** Il
rougissait dès que la nouvelle migration retirait la table du fichier. Lui reprocher de ne pas
contenir l'avenir n'a pas de sens : son attendu porte désormais « le JSON + `telemetry_events` »,
et c'est le banc du 20/09 qui compare l'état FINAL au JSON.
