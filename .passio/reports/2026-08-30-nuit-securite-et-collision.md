# Nuit du 2026-08-29 au 2026-08-30 — audit de sécurité, correctifs, et une collision entre deux sessions

> Règle de ce document : **rien d'affirmé sans preuve exécutée**. Ce qui n'a pas
> pu être mesuré porte `NON MESURÉ` et sa raison.
>
> Session autonome (Benjamin dormait, aucune interaction possible). Une **seconde
> session Claude Code travaillait en parallèle** sur le même dépôt — c'est le
> fait le plus structurant de la nuit, voir §4.

## 1. Ce qui a été cherché

Un audit en **9 dimensions**, lancé en parallèle par agents en lecture seule, puis
une **vérification adversariale à 3 lentilles** par finding (réalité du code,
reproductibilité par un geste utilisateur, existence d'une garde ailleurs), avec
consigne de REFUTER par défaut.

- 69 agents, 0 erreur, ~2 h de calcul.
- **56 findings bruts** → 20 vérifiés (budget) → **13 confirmés, 7 réfutés**.
- 36 findings de moindre gravité n'ont pas été vérifiés faute de budget : ils sont
  listés en §5, non traités, et ne doivent pas être pris pour des défauts établis.

La vérification adversariale a fait son travail dans les deux sens : elle a
**réfuté** sept findings plausibles (dont « `deletePost` ne vérifie pas la
suppression serveur », faux : le chemin est couvert ailleurs), et elle a
**enrichi** un finding confirmé — c'est elle qui a signalé que neutraliser une
charge à l'affichage ne l'empêche pas de rester stockée dans IndexedDB.

## 2. Ce qui a été corrigé, et comment c'est prouvé

Chaque lot suit la même discipline : correctif → test → **réinjection du défaut**
(le test doit rougir) → PR → CI complète → fusion.

| Défaut | Gravité | Preuve |
|---|---|---|
| **Deux XSS stockées** : texte d'une notification distante, et clé d'une réaction de message — toutes deux insérables par n'importe quel compte authentifié | P0 | 6 tests à preuve ACTIVE (la charge appelle `window.__pwn()`, le DOM est secoué) ; 3 mutations, 3 rouges |
| **`href` acceptant `javascript:`** dans un message « 📍 position » (`escapeHtml` ferme l'attribut, pas le schéma) | P1 | idem |
| **Carnet « Privé » visible dans le fil de tout le monde** et ouvrable entièrement | P0 | 5 tests ; 2 mutations → 4 rouges |
| **Clé de réaction non filtrée à l'entrée** : la charge restait dans localStorage et IndexedDB, rejouée à chaque démarrage | P1 | 4 tests ; 1 mutation → 2 rouges |
| **Deux identifiants bruts dans un `onclick`** (pastille de réactions d'un post, d'un live) | P1 | 3 tests ; 2 mutations ciblées → 1 rouge chacune |
| **Inbox Messages qui se repeignait en boucle** | P1 | **mesuré : 1 047 mutations DOM en 1,5 s ; 0 après** |
| **Média/vocal perdu en silence** quand l'écriture Supabase échoue | P1 | 3 tests ; 1 mutation → 1 rouge |
| **Aucun indicateur de message non lu dans l'application**, et Messages inatteignable sous kill switch | P1 | 6 tests ; 2 mutations → 4 puis 1 rouge |
| **Recherche de comptes sans limite ni garde d'obsolescence** | P2 | 2 tests ; 2 mutations → 1 rouge chacune |

## 3. Deux de mes propres tests passaient pour la mauvaise raison

Trouvé par la réinjection, pas par la relecture — et c'est la partie la plus
instructive de la nuit :

1. **Une charge XSS qui ne s'exécutait pas.** En sortant de l'attribut, elle
   fabriquait `onmouseover="window.__pwn()', event);"` : une **erreur de syntaxe**,
   que le navigateur avale en silence. Le test passait donc *sans* échappement.
   Un `//` final rend le reste inerte et la charge réellement exécutable.
2. **Un test sans décor.** `_liveReactItems` ne trouvait pas le live, rendait une
   liste vide, et la pastille n'était jamais construite. Le test restait vert en
   retirant l'échappement.

Les deux appartiennent à la famille que l'audit signale par ailleurs dans
`echappement.spec.js`. Les avoir trouvés dans mes propres tests donne du crédit à
ce signalement — et une règle : **un test de sécurité qui n'a pas été vu rougir
n'est pas un test de sécurité.**

## 4. L'incident : deux sessions, le même défaut, deux correctifs corrects, une CI rouge

**`main` est resté rouge de 23:00 (fusion de #200) à 00:0x (fusion de #209).**
Aucun déploiement production pendant ce temps, et **six PR de la nuit ont été
bloquées en cascade** — #204 à #208 échouaient toutes sur exactement les deux
mêmes tests (`xss-notifs-messages.spec.js:45` et `:69`), non parce qu'elles
étaient fautives, mais parce que la CI d'une PR teste la **fusion** de sa branche
avec la base : une base rouge rend rouge tout ce qui s'y greffe.

Les deux sessions ont trouvé la **même XSS de notification** le même soir et l'ont
fermée **au même moment, à deux bouts différents de la chaîne** :

- l'une neutralise les chevrons **à l'entrée** (`mergeSupaNotifs`) ;
- l'autre pose **au rendu** un modèle de confiance explicite (`html: true` /
  `kind === "local"`, tout le reste échappé).

Chaque PR était verte séparément : **elles ne se voyaient pas**. Fusionnées, elles
se cumulent — et le double échappement affichait `Ben&#39;j` au lieu de `Ben'j`
dans les notifications, une régression visible pour tout pseudo avec apostrophe.

Ce qu'il faut en retenir, et qui n'est pas « quelqu'un a mal travaillé » :

- **deux correctifs corrects sur la même ligne ne font pas un correctif correct** ;
- la CI d'une PR ne teste pas la fusion, elle teste la branche ;
- `npm run sessions` existe précisément pour déclarer un périmètre de fichiers, et
  **aucune des deux sessions ne l'a utilisé cette nuit**.

La réconciliation garde le modèle de confiance de l'autre session — il est meilleur
que le mien, son défaut est le REFUS — et ne change que le désinfectant appliqué au
texte non fiable, pour qu'il soit **idempotent** avec la neutralisation d'entrée.

## 5. Ce qui n'a PAS été fait, et pourquoi

- **`PASSIO_E2E_MULTI=1`, RLS prod, vérification du site en ligne** : `NON MESURÉ`.
  Le proxy réseau de cet environnement refuse `njkiyoklssvefstljemx.supabase.co`
  **et** `passio-app.netlify.app`. Ni vert ni rouge : non lancé. La CI reste donc
  la seule autorité sur la suite complète.
- **Migration RLS pour la visibilité des carnets** : le correctif livré est un
  filet **client**. La vraie fermeture demande une colonne réelle et une policy.
  Non écrite : la prod est injoignable d'ici (impossible de lire le schéma réel),
  et la règle de la nuit interdit d'appliquer une migration sans supervision.
- **`NOTIF-FORGE-009`** (n'importe quel compte peut insérer une notification au nom
  d'un autre) : migration prête, toujours **non appliquée**. Les correctifs de
  cette nuit ferment l'affichage, pas l'écriture.
- **36 findings de moindre gravité** non vérifiés faute de budget — ils sont dans
  le résultat brut de l'audit, à traiter avec la même discipline (vérifier avant
  de corriger). Les plus prometteurs : stories qui échappent au filtre de blocage,
  liens `#irl-event-` et `#irl-checkin-` sondés une seule fois à 1 200 ms sur un
  `state` encore `null`, quatre tests soupçonnés creux, base64 déposé sur `window`
  et jamais libéré.

## 6. Ce qui attend une décision de Benjamin

- **PR « CI Node 24 »** — GitHub retire Node 20 des runners le **23 septembre 2026** ;
  passé cette date, `actions/checkout@v4` et `setup-node@v4` ne démarrent plus et
  **toute la chaîne s'arrête** (gouvernance, tests, build, déploiement, rollback,
  Sentinelle). Le correctif est prêt et minimal (v4 → v5). Il touche `.github/`,
  donc la garde « Gouvernance critique » **exige une contre-revue humaine ancrée
  sur le SHA** : elle a refusé la PR, ce qui est le comportement voulu. Je ne l'ai
  pas contournée.
