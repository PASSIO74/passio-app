# Consolidation des sessions — 2026-08-29

Document unique de reprise. Il remplace les 13 sessions ouvertes en parallèle
sur ce dépôt aujourd'hui, toutes fermées après rédaction. Établi sur des
preuves : PR fusionnées, branches distantes, runs GitHub Actions, revues
publiées. Aucun statut n'est déduit d'un résumé de session.

Référence `main` au moment de l'établissement : `77e8aae`.

> **⚠️ MISE À JOUR DU SOIR — tout ce que ce document listait comme « à faire »
> est en ligne.** Les cinq PR sont fusionnées et publiées : #195 (retrait
> complet de l'économie interne + prix en euros), #196 (en-tête du Fil
> permanent), #147 (contrôles de migration T&S), #198 (pastille de mood vide et
> « Rencontrer » découvrable), #157 (fenêtrage du Fil, drapeau coupé par
> défaut). Le détail de ce qui s'est passé entre-temps est en §5, ajoutée après
> coup. **Les sections 1 à 3 ci-dessous décrivent l'état de l'après-midi et sont
> conservées telles quelles** — elles expliquent d'où venaient les branches
> orphelines, ce qui reste la leçon du jour.

---

## 1. Ce qui a été demandé aujourd'hui, et ce qui est réellement livré

Treize sessions ont été ouvertes, une par demande. Sept demandes sont en
production, quatre sont restées sur leur branche sans jamais devenir une PR,
et une était un doublon.

### Livré, fusionné et déployé (7)

| Demande | PR | Fusion | État |
|---|---|---|---|
| Profil : aucune passion cochée ≠ tout masquer | [#187](https://github.com/PASSIO74/passio-app/pull/187) | 09:27 | ✅ en prod |
| Fil : profils en bulles, plus petites | [#189](https://github.com/PASSIO74/passio-app/pull/189) | 11:51 | ✅ en prod |
| Profil : onglet « Modifier » → crayon discret | [#190](https://github.com/PASSIO74/passio-app/pull/190) | 12:17 | ✅ en prod |
| Bouton « + » : une seule liste de tout ce qu'on peut créer | [#191](https://github.com/PASSIO74/passio-app/pull/191) | 12:43 | ✅ en prod |
| « Filtres » devient une vue de Rencontrer, bulles dedans (UI-4A5) | [#192](https://github.com/PASSIO74/passio-app/pull/192) | 13:31 | ✅ en prod |
| Studio : moods alignés sur le rail d'intentions | [#194](https://github.com/PASSIO74/passio-app/pull/194) | 14:12 | ✅ en prod |
| Profil : une personne, plusieurs passions (UI-8) | [#193](https://github.com/PASSIO74/passio-app/pull/193) | 14:43 | ⏳ déploiement en cours |

### Demandé, codé, mais JAMAIS livré — aucune PR ouverte (4)

C'est le vrai résultat de cette consolidation : quatre demandes ont produit du
code, des tests verts annoncés, puis se sont arrêtées à la branche. Rien de tout
cela n'est en production, et rien n'était visible depuis GitHub.

| Demande | Branche | Contenu | Pourquoi c'est bloqué |
|---|---|---|---|
| « Argent dans IRL » | `claude/irl-money-cleanup-ikdi61` | prix en euros, retrait des points — 15 fichiers, +420/−308 | **Conflit** : recouvre largement la branche ci-dessous |
| « Suppression données Money Passia » | `claude/money-passia-cleanup-uwjjdd` | ADR-009, retrait complet de l'économie interne (Wallet, points, Passia) — 27 fichiers, +583/−2102 | **Conflit** : surensemble de la précédente |
| « Profils et mood disparaissent au scroll » | `claude/feed-profile-mood-scroll-bug-plh7u1` | en-tête du Fil rendu permanent — 8 fichiers | Aucune PR ouverte, sans autre obstacle |
| « Mood affichage fil d'actualité » | `claude/mood-feed-display-y4xk3d` | vocabulaire des intentions sur la pastille | **Doublon** : traité et fusionné par #194 |

### Le doublon, en clair

Deux sessions ont reçu la même demande sous deux formulations (« Nouveaux mood
dans les options » et « Mood affichage fil d'actualité ») et ont écrit deux
solutions concurrentes dans **les mêmes fichiers** (`index.html`, `app-02`,
`app-05`, `app-06`) :

- **#194, fusionné** : une table unique `PASSIO_MOOD_LABELS` + `moodTagLabel()`
  / `moodShortLabel()`, couvrant `creation/learn/irl/chill/actu`.
- **`mood-feed-display`, non fusionné** : la pastille dérive de
  `legacyMoodToFeedIntent()` → `FEED_INTENT_CONTENT_LABELS`, et `chill`/`actu`
  ne reçoivent **aucune** pastille.

Les deux corrigent le même défaut de fond. `#194` a gagné par l'ordre de fusion,
pas par arbitrage. La seconde approche est défendable sur un point précis — ne
pas peindre de pilule pour un mood sans intention — mais la fusionner
maintenant écrase `PASSIO_MOOD_LABELS` et casse `studio-moods.spec.js`.

**Décision retenue : `main` fait foi, la branche `mood-feed-display` est
abandonnée.** Le seul apport à récupérer est le contrôle « ne jamais rendre un
`<span>` vide » — `.post-mood-tag` a un fond et une bordure, donc un libellé
vide dessine une pilule creuse.

---

## 2. Ce qui reste à faire — travail de code, pas d'arbitrage

Classé par ordre d'exécution recommandé.

### P1 — Deux PR bloquées par des défauts réels, déjà diagnostiqués

Ces deux PR ne sont **pas** en attente de Benjamin. Elles portent une
contre-revue publiée aujourd'hui (12:22 et 12:24) qui nomme un défaut précis et
reproductible. Il faut corriger le code, pas relire.

**[#157](https://github.com/PASSIO74/passio-app/pull/157) — perf iOS, fenêtre du Fil (#73 phase 2)**
`feedWindowHydrate()` remplace `card.innerHTML` par le HTML régénéré depuis
`_renderPostHTMLSafe(post)`. Cela efface la passerelle UI-3 `[data-v3-bridge]`
tout en laissant `data-v3-decore` sur la carte. Or l'observateur UI-3 surveille
`#feedList` en `{ childList: true }` **sans `subtree`** : la mutation de
`innerHTML` ne redéclenche jamais `decorateFeed()`. Et comme le CTA historique
reste masqué par la règle liée à `data-v3-decore`, la carte se retrouve **sans
aucune porte Fil → IRL** après déshydratation/réhydratation.
→ Réappliquer explicitement `PassioUIV3.decorateFeed()` après réhydratation, et
ajouter un test croisé `feed_window_v1` + UI-3 (décoration → hors fenêtre →
réhydratation → `[data-v3-bridge]` toujours là, y compris après aller-retour
d'écran). Risque prod actuel limité : `feed_window_v1` est OFF.

**[#147](https://github.com/PASSIO74/passio-app/pull/147) — contrôles de la migration T&S (#136)**
Deux **faux verts** : une base cassée peut être déclarée saine, ce qui est
exactement le contraire du contrat de cette PR.
1. Le contrôle des fonctions accepte n'importe quelle valeur dès que la chaîne
   contient `search_path=`. Une fonction `SECURITY DEFINER SET search_path =
   public` — la configuration détournable que le contrôle prétend exclure —
   sort donc `OK`. Vérifier la **valeur** (`search_path=''` ou allow-list), et
   filtrer les fonctions par signature, pas par `proname` seul.
2. Les trois policies INSERT ne sont contrôlées que par nom et par nombre. Une
   policy du même nom avec `WITH CHECK (true)` produit `OK` alors que la
   frontière est grande ouverte. Valider rôles, permissif/restrictif et surtout
   `with_check`, et muter la policy attendue affaiblie sous le même nom.
3. Réserve : le verdict « trigger de non-régression » accepte n'importe quel
   trigger utilisateur sur `user_safety`.
La migration #136 étant **déjà appliquée en prod** depuis le 24 août, ce lot
n'est pas sur le chemin critique — mais il ne doit pas être fusionné en l'état.

### P2 — Sortir les trois branches orphelines de l'ornière

1. **Économie interne.** `money-passia-cleanup` (ADR-009, surensemble) est la
   base ; en rebaser `irl-money-cleanup` par-dessus pour n'en garder que
   l'apport propre : les prix en euros. Les fusionner dans l'autre sens rejoue
   deux fois le retrait des points. Une seule PR à l'arrivée.
2. **En-tête du Fil permanent** (`feed-profile-mood-scroll-bug`) : indépendante
   des autres, la plus simple à sortir. Rebase sur `main` puis PR.
3. **`mood-feed-display`** : abandonner, après avoir repris le seul garde utile
   (pas de `<span>` vide).

### P3 — [#188](https://github.com/PASSIO74/passio-app/pull/188), documentation
Réconciliation du plan de contrôle avec la réalité mesurée. Sans risque, en
attente depuis 09:49 ce matin.

---

## 3. Ce que Benjamin doit faire — et rien de plus

La liste est courte, et volontairement : tout le reste est du travail de code
qui n'a pas besoin de lui.

1. **Valider visuellement UI-8** ([#193](https://github.com/PASSIO74/passio-app/pull/193), fusionné à 14:43, déploiement en cours au moment
   d'écrire). Il est parti en production sans passer par l'aperçu, comme les
   lots UI-4. Vérifier sur l'appareil réel que « une personne, plusieurs
   passions » se comporte comme attendu. La garde « Gouvernance critique » est
   passée **verte** sur ce run (14:43:50) — le piège de la course avec
   l'indexation GitHub n'a pas eu lieu cette fois ; restent les tests puis la
   publication. Ne pas annoncer « c'est en ligne » avant d'avoir vu le job
   « Déploiement production » vert.
2. **Trancher sur l'économie interne.** Deux sessions ont retiré les points ;
   l'une va plus loin et supprime **tout** (Wallet, Passia, boutique). Le plan
   ci-dessus retient le retrait complet — dire si ce n'est pas ce qui était
   voulu, sinon il sera appliqué tel quel.
3. **Ne plus ouvrir une session par demande.** C'est la cause directe de tout ce
   qui précède : deux sessions ont écrit deux fois le même correctif de moods
   dans les mêmes fichiers, deux autres ont retiré deux fois le même système de
   points, et quatre demandes se sont perdues faute de PR. Le dépôt ne dit
   jamais qu'une session a fini — seule une PR fusionnée le dit.

**Ce que Benjamin n'a PAS à faire**, contrairement à ce qu'annonçaient deux
sessions restées bloquées : il n'a aucune contre-revue à écrire. Celles de #157
et #147 ont été publiées aujourd'hui à 12:22 et 12:24. Ces PR attendent des
correctifs de code, pas une relecture.

---

## 4. Ce que cette journée apprend

- **Une branche poussée n'est pas un travail livré.** Quatre demandes ont fini
  avec du code, des tests annoncés verts et un résumé de session satisfait —
  sans PR. Le résumé d'une session est une intention ; la preuve est la fusion.
- **Le parallélisme sans périmètre déclaré produit du doublon, pas de la
  vitesse.** `CLAUDE.md` documente déjà `/passio-multi-session` et l'écrivain
  unique par branche sensible. La règle existait ; elle n'a pas été appliquée
  parce que chaque session ignorait les douze autres.
- **Le fichier partagé est le point de collision, pas la branche.** Les deux
  paires en conflit ont touché exactement les mêmes fichiers (`app-02`,
  `index.html` pour les moods ; sept fichiers `app-0*` pour les points).


---

## 5. Ce qui s'est passé ensuite — ajouté le soir même

### Les cinq lots sont en ligne

| PR | Contenu | Publication |
|---|---|---|
| [#195](https://github.com/PASSIO74/passio-app/pull/195) | ADR-009 : retrait complet de l'économie interne, prix des activités en euros | ✅ |
| [#196](https://github.com/PASSIO74/passio-app/pull/196) | L'en-tête du Fil ne se replie plus au défilement | ✅ |
| [#147](https://github.com/PASSIO74/passio-app/pull/147) | Contrôles d'exploitation de la migration T&S | ✅ |
| [#198](https://github.com/PASSIO74/passio-app/pull/198) | Les moods ne se lisent plus dans le DOM d'un rail masqué | ✅ |
| [#157](https://github.com/PASSIO74/passio-app/pull/157) | Fenêtrage du Fil (`feed_window_v1`, coupé par défaut) | ✅ |

### Ce que le document annonçait mal, et qui a été corrigé

**Les correctifs de #157 et #147 existaient déjà.** La §2 les présentait comme
du travail à écrire. En réalité leurs sessions les avaient écrits *après* les
contre-revues de midi — à 12:39 et 13:12 — puis s'étaient arrêtées sans pousser
les PR jusqu'à la fusion. C'est le même défaut que les quatre branches
orphelines, une couche plus loin : **du travail terminé et invisible**.

Les correctifs ont été vérifiés plutôt que crus sur parole. Pour #147, le banc
`tests/sql/migration-ts-serveur.test.sh` a été monté sur un PostgreSQL 16
jetable : **86 OK · 0 KO**, et chacun des cinq faux verts signalés redevient
ROUGE sous mutation (`search_path = public`, surcharge de mauvais type,
`WITH CHECK (true)` sous le même nom, rôles inchangés, trigger sans rapport).

### Deux défauts neufs, trouvés en consolidant

La branche doublon `mood-feed-display` a été abandonnée — mais elle avait vu
juste sur un point, et le chercher a fait apparaître un second défaut de la même
famille. Les deux sont en ligne dans #198, avec leurs tests et une preuve par
mutation.

1. **Une capsule vide sur chaque post venu de Supabase**, mesurée à 20 × 8 px.
2. **Une publication « Rencontrer » ne pouvait pas être découverte** par
   quelqu'un qui ne suit pas déjà sa passion — défaut rendu atteignable le matin
   même par #194, qui a ajouté cette pastille au composer.

### Trois erreurs de ma part, consignées

1. **`styles.css` converti de CRLF en LF** en résolvant un conflit, produisant
   un diff de 11 700 lignes pour un changement qui en fait 34. C'est très
   exactement le piège que `CLAUDE.md` documente au lot UI-7 ⑥, et que j'avais
   lu dans la même session. Reconstruit depuis les octets de `main`.
2. **Une portée surestimée.** J'ai écrit qu'une publication « Rencontrer » était
   invisible pour tout le monde, auteur compris. Mesure faite : elle est visible
   dans sa propre passion. Le défaut était réel, sa portée était plus étroite.
3. **Un diagnostic cherché au mauvais endroit.** Le blocage de fusion venait des
   réglages du dépôt (deux contextes requis sans workflow), pas des branches. Le
   test qui l'a tranché — une PR verte, jamais rebasée, qui échoue quand même —
   était faisable au premier échec plutôt qu'au sixième.

### Ce qui reste vrai de la leçon du jour

La cause première n'a pas changé : **une session par demande, sans périmètre
déclaré**. Elle a produit deux doublons francs, quatre branches orphelines et
deux PR bloquées sur des correctifs déjà écrits. Le dépôt ne dit jamais qu'une
session a fini — seule une PR **fusionnée** le dit.
