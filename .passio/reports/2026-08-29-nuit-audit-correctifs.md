# Nuit du 2026-08-29 — audit adversarial et correctifs

Travail mené en autonomie pendant que Benjamin dormait, sur consigne
« finalise tout, règle tous les problèmes ». Tout ce qui suit a été **exécuté**,
jamais estimé. Ce qui n'a pas pu l'être est nommé comme tel, avec sa cause.

---

## 1. Ce qui est en production

Les cinq lots de la journée ont été fusionnés et publiés — déploiement Netlify
vert jusqu'à l'étape « Deploy to Netlify » sur chacun :

| PR | Contenu |
|---|---|
| #195 | ADR-009 : retrait complet de l'économie interne, prix des activités en euros |
| #196 | L'en-tête du Fil ne se replie plus au défilement |
| #147 | Contrôles d'exploitation de la migration T&S, éprouvés par mutation |
| #198 | Pastille de mood vide, et « Rencontrer » redevenu découvrable |
| #157 | Fenêtrage du Fil (`feed_window_v1`, coupé par défaut) |
| #199 | Documentation des trois lots que `CLAUDE.md` ne décrivait pas |

⚠️ **Rappel de l'effet irréversible de #195** : `stripLegacyEconomy()` expurge
aussi le blob ENVOYÉ au serveur, et l'enregistrement écrase `user_state` en
entier. Les soldes Passia, scores et pass actifs sont donc effacés du serveur au
premier enregistrement d'état de chaque compte. Un retour arrière du code ne les
rendrait pas.

---

## 2. Cinq défauts trouvés par l'audit, corrigés cette nuit

Un audit adversarial a passé les treize lots fusionnés dans la journée : neuf
domaines de recherche en parallèle, chaque trouvaille soumise à trois juges sous
des angles différents (atteignabilité, code réel, régression).

**Tous les cinq étaient en production. Tous ont été mesurés avant correction,
puis éprouvés par mutation** — annuler le correctif doit faire rougir ses tests.

Ils partagent une famille qu'il vaut la peine de nommer :
**une règle, un garde ou un test qui survit à la disparition de sa cible.**
C'est le risque propre à une journée où treize lots retirent chacun quelque
chose : ce qui gardait la chose retirée reste en place, à garder du vide.

### ① Taper 📷 sur une passion ouvrait aussi la modale d'édition

La pastille fait `event.stopPropagation()` puis `input.click()`. Ce
`stopPropagation` ne concerne que le clic **sur la pastille** : `.click()`
dispatche un **nouvel** événement, qui part de l'input — descendant de la carte
— et remonte à son `onclick`.

Le garde est posé sur l'**input**, jamais sur la pastille : le menu « Options »
déclenche le même `input.click()`. La carte historique portait le motif
identique, où taper 📷 basculait le filtre de contenu.

### ② Le texte des activités se corrompait à chaque enregistrement

Le helper `v()` échappe déjà ; dix de ses onze appels le ré-enveloppaient.
« Café d'Or » s'affichait « Café d&#39;Or ». **Ce n'était pas qu'un défaut
d'affichage** : ces valeurs sont celles que « Enregistrer » persiste, donc la
corruption s'aggravait à chaque édition.

Éprouvé par **deux mutations opposées** : remettre le double échappement fait
rougir les deux tests, et retirer *tout* échappement fait rougir le test de
sécurité. Chaque bord a son détecteur.

### ③ Une passion archivée restait « une de tes passions » sur Rencontrer

Après un archivage : Fil `["musique"]`, Rencontrer `["musique","cuisine"]`.

⚠️ L'audit annonçait en plus « et on ne peut plus l'en retirer ». **C'est
faux** — vérifié dans le code puis par un test dédié. Une trouvaille recopiée
sans vérification aurait fait écrire un correctif pour un problème inexistant.

### ④ Après synchronisation, la passion ACTIVE pouvait être archivée

`supaLoadUserState` restaurait `currentProfileId` sur le seul test « toujours
dans la liste fusionnée » — or une passion rangée sur un autre appareil y reste,
avec `archived:true`. L'écran affichait « Passion active : 🍳 Cuisine » pendant
que le Fil ne la connaissait plus, et le Studio publiait dedans.

### ⑤ Un badge gagné était calculé, puis masqué

UI-6 masquait `.profile-chips-row` pour cacher les pastilles d'économie.
ADR-009 a retiré ce moteur en entier, mais la règle est restée — et la rangée ne
portait plus que la pastille de **badges d'assiduité**, que l'ADR garde
expressément. Mesuré avec un badge réellement gagné : pastille à `inline-flex`,
rangée à `none`, hauteur visible **0**. `openBadgesSheet()` n'avait aucun autre
appelant : fonctionnalité calculée à chaque rendu, morte à l'écran.

---

## 3. Preuves

| Vérification | Résultat |
|---|---|
| Tests neufs (5 fichiers) | 13/13 |
| `ui-v8-passions` + `ui-v6b-profil` | 39/39 |
| `ui-v4a1` + `ui-v4a2` + `ui-v4a5` + `ui-v8` | 68/68 |
| `etat-sync-base64` + `onboarding-passions-v2` + `partage-experience-passion` + `profils-types` + `ui-v8` | 49/49 |
| `irl` + `prix-euros` + `ui-v4a5` | 44/45 ⚠️ |
| Artefact de production réel (`PASSIO_CIBLE=dist`) | 6/6 |
| `audit:globals`, `audit:handlers`, `audit:echappement --ci`, `audit-tests-creux` | verts |

### Suite complète sur `main` : 615 passés, 5 échecs, 1 flaky

**Aucun des six n'est un défaut du code**, et chacun a une cause établie plutôt
que supposée :

| Suite | Cause établie |
|---|---|
| `authz-critical`, `blocage-acces`, `user-state-horodatage` | Supabase refusé par le proxy — le dernier échoue explicitement sur « compte e2e créé » |
| `irl` — recadrage carte | tuiles MapLibre bloquées ; vérifié **identiquement rouge sur `main` nu** |
| `ui-v7-bobine-camera` | **mon propre harnais** : ce test pose ses `launchOptions` pour la caméra simulée, ce qui écrase l'`executablePath` de ma config locale (`Executable doesn't exist … chromium_headless_shell-1223`) |
| `monitoring-file-boot` | flake sous charge — **6/6 vert en isolement**, 3 répétitions sans filet |

---

## 4. Mes erreurs de la nuit, consignées

1. **Mon premier test du correctif ④ recopiait la logique de production** au lieu
   de l'appeler. Il serait resté vert si le code de production avait changé —
   c'est le « test creux » que `scripts/audit-tests-creux.js` traque. La
   normalisation a été extraite en fonction nommée pour que le test exerce le
   code réel.
2. **J'ai failli classer l'échec `ui-v7-bobine-camera` en « environnement »**
   sans regarder. C'était mon contournement du Chromium manquant qui le cassait.
3. **Une hypothèse annoncée avant d'être mesurée** — je pensais qu'une passion
   archivée devenait inatteignable sous le kill switch UI-8. Mesuré : faux, le
   chemin historique l'affiche. Je l'ai vérifiée avant de la rapporter, ce que je
   n'avais pas fait plus tôt dans la journée sur le défaut « Rencontrer ».

---

## 5. Ce qui reste à faire, et qui t'appartient

- **Valider visuellement** les cinq lots du jour et les cinq correctifs de la
  nuit sur ton appareil. Le plus visible : l'en-tête du Fil qui ne disparaît plus
  (#196, ton signalement du matin), et le retrait complet du Wallet (#195).
- **Décider si les soldes Passia effacés méritent un geste** envers les comptes
  concernés. Le code ne les rendra pas.
- **Un point de gouvernance** : la protection de branche exigeait deux contextes
  de vérification qui n'ont plus aucun workflow derrière. Tu les as retirés cette
  nuit ; c'est ce qui a débloqué les fusions. Les deux gardes réelles — « Tests
  smoke » et « Gouvernance critique » — restent requises.

---

## 6. Second lot de la nuit — sept défauts de plus

Même méthode : mesurés avant correction, éprouvés par mutation (annuler le
correctif doit faire rougir ses tests), et aucun moteur dupliqué.

### ⑥ XSS stockée dans les notifications *(sécurité)*

`renderNotifs` écrivait `${n.text}` **brut**, parce que les notifications de
démonstration portent des `<b>` voulus. Or `pushNotification` recopie du texte
d'autrui (mentions, extraits de commentaires) et `supaLoadNotifs` remonte des
lignes écrites par n'importe quel compte.

Le rendu est désormais **sûr par défaut** : un discriminant de confiance
explicite (`n.html === true` ou `kind === "local"`) autorise le balisage, tout
le reste est échappé.

### ⑦ La même donnée échappée d'un côté, brute de l'autre *(sécurité)*

`ev.eventType` était échappé sur la **carte** d'activité et brut dans la
**fiche**. Mesuré : la charge `<img src=x onerror=…>` s'exécutait à l'ouverture
de la fiche. Idem pour la **durée** d'un carnet en direct, brute dans le
carrousel du Fil et dans la fiche du carnet.

> « Le `<select>` de création ne propose que des valeurs fixes » n'est pas une
> garantie : toute session authentifiée écrit ces colonnes par REST.

### ⑧ Partager une bobine n'atteignait jamais Supabase

Le post de partage était fabriqué **sans `createdAt`**. `supaPublishPostWithRetry`
fait `new Date(post.createdAt).toISOString()` : sur `undefined`, RangeError —
avalé par le `catch` du réessai, qui renvoie `false` sans un mot.

Un seul champ manquant, quatre conséquences : jamais persisté (donc perdu au
rechargement), aucune heure sur la carte, et classé tout en bas du fil (tri sur
`createdAt || 0`). Sa jumelle `sharePostInFeed` le portait déjà — **deux
fonctions presque identiques avaient divergé sur ce seul point**.

Au passage, dans les deux : le texte était échappé à la source **et** à
l'affichage, donc doublement — et la valeur corrompue partait dans
`posts.content`.

### ⑨ Le lecteur de bobines n'envoyait aucun commentaire

`submitReelComment` écrivait dans l'état local puis `saveState()`, et rien
d'autre. L'auteur de la bobine ne voyait jamais le commentaire ; son auteur le
perdait au premier rechargement. Le **même texte** posté depuis la discussion du
Fil partait, lui : un défaut invisible à qui teste par le Fil.

Corrigé par la file d'attente commune (réessai hors-ligne, statut « Envoi… /
Non envoyé »), sans écrire un second moteur.

Dans la foulée : tous les commentaires de bobine s'affichaient « Maintenant »,
parce que le rendu lisait `c.timestamp` — un champ qu'aucun chemin de création
ne pose.

### ⑩ Les notifications promettaient encore des points

Le contenu de démonstration est **copié** dans l'état à la première ouverture,
puis persisté. ADR-009 a réécrit la graine, mais un compte ouvert **avant** le
retrait garde sa copie : « Nouvelle quête du jour 🎨 **+15 pts** » et « Tu as
gagné **10 💎 Passia** ». Nettoyées aux trois frontières (elles voyagent aussi
par le blob `user_state`).

Le filtre est volontairement **borné** : il ne juge le texte que des
notifications écrites par l'app, et le « 💎 » nu en est exclu — une activité
peut légitimement s'appeler « Atelier 💎 Bijoux ». Un test tient ce cas limite.

### ⑪ « Ma ville » filtrait sur la ville précédente

Le prédicat était posé **une fois**, au clic sur l'intention. Changer de ville
ensuite laissait le filtre sur l'ancienne : le titre annonçait Paris, la liste
montrait Lyon, sans le moindre signe.

### ⑫ Ouvrir l'éditeur de carnet amputait le Studio

`activateStudioVlog` masque le texte libre, la passion et le mood. Rien ne les
rendait : le seul chemin de restauration était le clic sur un **onglet de
format**… que le lot UI-6 a précisément retiré de l'écran. Un composeur muet,
sans erreur ni message, jusqu'au rechargement complet de la page.

C'est une famille à retenir : **retirer un chemin d'accès peut supprimer le seul
chemin de retour d'un état transitoire.**
