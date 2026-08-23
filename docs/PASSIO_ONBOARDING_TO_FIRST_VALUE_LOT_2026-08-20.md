# PASSIO — Onboarding → premier moment de valeur

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Objectif du lot** : faire arriver un nouveau compte sur un **Fil immédiatement pertinent**, avec le minimum de friction et sans sacrifier le multi-profil, la sécurité ou la confidentialité.

---

## 1. Diagnostic vérifié de l'existant

### Parcours actuel

Le code définit actuellement :

```js
const onbSteps = ["splash", "age", "name", "passions"];
```

Le parcours réel testé est :

```text
authentification → année de naissance → prénom → choix d'une passion → Entrer sur PASSIO
```

Le test multi-comptes utilise bien ce chemin réel avant de créer deux utilisateurs et tester la messagerie.

### Choix passions actuel

L'UI demande actuellement :

> « Choisis 1 à 3 passions. Chacune crée un profil dédié. »

`onbFinish()` transforme ensuite **chaque passion sélectionnée en profil passion**, choisit le premier comme profil actif, puis fait :

```js
_activeFeedPassions = new Set();
```

Donc l'utilisateur vient de dire ce qu'il aime, mais PASSIO **jette cette information pour le premier rendu du Fil**.

Le comportement du Feed confirme cette conséquence :

```text
si aucune passion ET aucun suivi sélectionné → feed vide
```

et l'état vide affiche :

> « Choisis une passion »

### Persistance incohérente

L'état contient déjà :

```js
selectedFeedPassions: []
```

et `loadState()` sait le migrer s'il manque.

Mais ce champ n'est pas aujourd'hui la source de vérité du filtre rendu ; le Feed travaille avec `_activeFeedPassions`, variable runtime distincte.

**Conclusion : il existe déjà le bon emplacement persistant mais il n'est pas réellement exploité.**

### Tour actuel

Le tour de démonstration contient plusieurs étapes et présente encore :

- CDV ;
- Wallet ;
- Passia ;
- gamification/monnaie.

Il ne doit pas être utilisé comme onboarding utilisateur V2.

---

## 2. Décision produit centrale

### Découpler trois concepts qui sont aujourd'hui confondus

1. **Passions d'intérêt** : ce que j'aime et veux découvrir dans mon Fil.
2. **Profil passion actif** : l'identité avec laquelle je publie/interagis quand le contexte l'exige.
3. **Profils passion supplémentaires** : séparation d'identité volontaire, créée plus tard quand elle apporte réellement de la valeur.

Aujourd'hui, sélectionner trois passions crée automatiquement trois profils.

La cible V2 est :

```text
sélectionner des passions → personnaliser immédiatement le Feed
                         ↘ créer un profil passion de départ
                         ↘ profils supplémentaires disponibles ensuite
```

Le multi-profil reste donc **fondamental**, mais il n'est plus une taxe cognitive avant la première valeur.

---

## 3. Parcours cible

### Nouveau compte e-mail

```text
Créer un compte
→ identité + sécurité essentielles
→ choisir ses Passio
→ Fil personnalisé
```

### Nouveau compte Google

```text
Google
→ compléter uniquement les champs essentiels manquants
→ choisir ses Passio
→ Fil personnalisé
```

### Compte existant

```text
Se connecter
→ restauration état/profils/préférences
→ Fil directement
```

Aucun onboarding ne doit être rejoué pour un compte existant correctement configuré.

---

## 4. Écran 1 — compte, identité minimale et âge

### Ce qu'il faut demander

Pour une inscription e-mail :

- adresse e-mail ;
- mot de passe ;
- **« Comment veux-tu qu'on t'appelle ? »** ;
- année de naissance.

Le vocabulaire « prénom » est évité comme obligation d'identité civile. PASSIO a besoin d'un nom d'affichage, pas du prénom légal.

### Âge

Le contrôle actuel est un calcul depuis l'année de naissance. Le texte actuel parlant de « contrôle d'âge IA » ne correspond donc pas au comportement réel et doit être retiré.

Copy cible :

> **Ton année de naissance**
> PASSIO est réservé aux 13 ans et plus. Pour le lancement public, les fonctionnalités IRL sont réservées aux adultes.

Règles :

- moins de 13 ans → inscription refusée ;
- 13–17 → compte possible, `isMinor=true`, IRL désactivé lorsque le lot serveur T&S correspondant est livré ;
- 18+ → parcours normal.

Ne jamais afficher publiquement l'année de naissance.

### Google

Si Google fournit un nom d'affichage, préremplir sans rendre ce choix irréversible.

L'âge reste à demander s'il n'existe pas déjà dans l'état du compte.

---

## 5. Écran 2 — « Qu'est-ce qui te passionne ? »

### Nouvelle règle

- minimum : **1 passion** ;
- recommandation UX : **3 passions** ;
- maximum initial : **7 passions**.

Ne pas bloquer un utilisateur qui n'a réellement qu'une passion forte simplement pour satisfaire un chiffre produit.

### Copy cible

> **Qu'est-ce qui te passionne ?**
> Choisis ce que tu veux voir dans ton Fil. Tu pourras tout modifier plus tard.

### Sélection

L'UI doit :

- afficher les passions disponibles ;
- permettre la recherche si le catalogue devient long ;
- montrer clairement la sélection ;
- permettre 1–7 choix ;
- ne parler ni de score, ni de Passia, ni de rang ;
- ne demander aucune localisation précise.

### Passion de départ / identité

Parmi les passions choisies, PASSIO doit disposer d'une première identité passionnelle sans créer 7 profils.

Approche recommandée dans le même écran :

- la **première passion choisie** devient visuellement « profil de départ » ;
- l'utilisateur peut en désigner une autre d'un tap ;
- microcopy : « Ton profil de départ · tu pourras créer d'autres profils passion ensuite ».

Ainsi, le choix n'est pas silencieux.

---

## 6. État cible après validation

### Intérêts Feed

À la fin de l'onboarding :

```js
state.selectedFeedPassions = selectedPassions.slice();
_activeFeedPassions = new Set(state.selectedFeedPassions);
```

`selectedFeedPassions` devient la **source persistante** des filtres de base du Fil.

Les changements ultérieurs de filtres Feed doivent mettre à jour :

1. `_activeFeedPassions` pour le rendu immédiat ;
2. `state.selectedFeedPassions` pour la persistance ;
3. `saveState()` pour la restauration cross-appareil.

### Profil passion de départ

Créer automatiquement **un seul** profil passion au départ :

```text
passion = primarySelectedPassion
name = displayName
currentProfileId = starterProfile.id
```

Les autres passions sélectionnées restent des **intérêts Feed**, pas des profils automatiques.

### Profils supplémentaires

Après activation, le Profil peut proposer :

> « Créer un profil pour une autre Passio »

Uniquement lorsque l'utilisateur le souhaite.

---

## 7. Premier rendu du Feed

### Règle absolue

Si du contenu correspondant aux passions choisies existe, l'utilisateur **ne doit jamais atterrir sur « Choisis une passion »** juste après avoir terminé l'onboarding.

### Séquence

Après validation :

```text
save state
→ masquer onboarding
→ activer feed
→ initialiser passions sélectionnées
→ rendre feed
→ tracer personalized_feed_viewed
```

### Si aucun contenu n'existe pour une passion

Ne pas transformer immédiatement l'écran en catalogue générique sans rapport.

Ordre de fallback :

1. autres passions sélectionnées ;
2. contenus d'exploration clairement étiquetés ;
3. personnes pertinentes ;
4. proposition « ajoute une autre Passio » ;
5. proposition de publier le premier contenu.

Le fallback doit rester lisible comme **exploration**, pas prétendre être une personnalisation exacte.

---

## 8. Première session : faire comprendre PASSIO sans tutoriel bloquant

### Pas de tour forcé

Le tour long actuel ne doit pas suivre l'inscription.

La compréhension doit venir du produit lui-même.

### Aides contextuelles autorisées

Maximum une aide à la fois, dismissible :

- première carte : « Appuie sur l'auteur pour découvrir sa Passio » ;
- premier profil visité : mettre en évidence **Suivre** / **Message** ;
- première conversation : proposer plus tard **Proposer un IRL** lorsque T&S est prêt ;
- premier retour Profil : montrer comment créer un second profil passion.

Aucun carrousel de sept écrans avant de pouvoir utiliser PASSIO.

---

## 9. Feed + IRL dès la première session

PASSIO ne doit pas enseigner que le produit est seulement un Feed.

Après instrumentation et une fois le durcissement IRL livré, le Fil peut intégrer un module contextuel :

> **À vivre en vrai · Musique**

avec une activité sûre liée à une passion sélectionnée.

Ce module est **distinct du ranking Feed V2** : ne pas modifier l'algorithme principal avant les données prévues dans `PASSIO_CORE_FUNNEL_ANALYTICS_V1_2026-08-20.md`.

---

## 10. Localisation : pas pendant l'onboarding

Ne pas demander la permission GPS au premier lancement.

La localisation doit être demandée **au moment où sa valeur est évidente**, par exemple :

- « Voir les activités près de moi » ;
- carte IRL ;
- check-in.

Et même dans ces cas :

- refus possible ;
- saisie manuelle d'une ville possible ;
- aucun GPS exact automatiquement publié ;
- règles du document Trust & Safety IRL applicables.

---

## 11. Analytics d'activation

Réutiliser le vocabulaire canonique déjà défini :

```text
signup_completed
passions_selected
personalized_feed_viewed
feed_post_impression
feed_author_opened
profile_opened_from_feed
meaningful_interaction
conversation_started
```

### Propriétés sûres onboarding

Pour `passions_selected` :

```text
n_interests
primary_id
starter_profiles
flag_v2
```

⚠️ **Corrigé le 2026-08-23 — les deux noms d'origine étaient morts-nés.** Cette
section prescrivait `passion_count` et `primary_passion_id`. Le filtre PII de
`js/telemetry.js` est une liste **NOIRE** de motifs de noms de clés (`DENY_KEY`)
qui contient `pass` : les deux clés matchent, et `scrubMeta` les jette **en
silence** — l'appel part, l'événement arrive, la propriété a disparu. C'est
exactement le défaut mesuré sur `passion_ctx` en production le 2026-08-22.

Le nommage retenu évite le radical `pass` (`n_interests`, `primary_id`). Toute
nouvelle clé doit passer `npm run audit:telemetry-keys`, qui relit `DENY_KEY`
depuis `js/telemetry.js` et échoue en CI si une clé émise n'y survit pas.

Ne pas envoyer :

- nom ;
- e-mail ;
- année de naissance ;
- position ;
- texte privé.

### Mesures prioritaires

1. `% signup_completed → passions_selected`
2. `% passions_selected → personalized_feed_viewed`
3. `% personalized_feed_viewed → feed_author_opened`
4. `% personalized_feed_viewed → meaningful_interaction`
5. `% meaningful_interaction → conversation_started`

La première optimisation n'est pas « temps passé », mais **vitesse vers une relation humaine pertinente**.

---

## 12. Compatibilité avec l'état historique

### Ancien compte avec plusieurs profils auto-créés

Ne rien supprimer.

Les profils existants restent valides.

Le nouveau modèle ne change que la création **future** lors d'un nouvel onboarding.

### Ancien état sans `selectedFeedPassions`

Migration recommandée :

```text
si selectedFeedPassions absent/vide
ET profils passion présents
→ initialiser depuis les passions uniques des profils existants
```

Ne pas le faire si l'utilisateur a explicitement vidé ses filtres dans le nouveau modèle : d'où l'intérêt d'un `stateSchemaVersion` ou d'un marqueur de migration explicite.

### Ancien compte avec filtre runtime perdu

Au boot :

```text
_activeFeedPassions ← state.selectedFeedPassions
```

Cela élimine le retour au Feed vide après reload.

---

## 13. Tests d'acceptation

### ONB-01 — nouveau compte → Feed pertinent

Inscription + 1 passion.

Attendu :

- profil de départ créé ;
- passion enregistrée ;
- Feed actif ;
- au moins un contenu correspondant si fixture disponible ;
- jamais « Choisis une passion ».

### ONB-02 — trois passions

Sélection de trois passions :

- trois intérêts Feed ;
- **un seul** profil passion initial ;
- profil principal explicitement identifié.

### ONB-03 — sept passions

Sept intérêts possibles sans créer sept profils.

### ONB-04 — reload

Après reload :

- mêmes intérêts ;
- filtre Feed restauré ;
- pas de Feed vide artificiel.

### ONB-05 — cross-device

Après sync `user_state`, un deuxième appareil restaure les intérêts Feed et le profil de départ sans duplication.

### ONB-06 — ancien état multi-profils

Un compte historique avec trois profils conserve ses trois profils ; la migration initialise les intérêts sans perte.

### ONB-07 — moins de 13 ans

Refus propre avant entrée dans l'app.

### ONB-08 — 13–17 ans

Compte marqué mineur ; aucune promesse IRL disponible lorsque le lot serveur mineurs est actif.

### ONB-09 — Google

OAuth réussi : ne demander que les informations essentielles manquantes.

### ONB-10 — compte existant

Connexion → Feed direct, aucun onboarding rejoué.

### ONB-11 — aucune permission localisation

Fin d'onboarding sans appel `navigator.geolocation`.

### ONB-12 — aucun ancien produit

Aucun Wallet, Passia, score, rang, leaderboard, CDV ou crypto dans le parcours.

### ONB-13 — pas de tour forcé

Entrée directe dans le Feed ; les coachmarks éventuels ne bloquent pas la navigation.

### ONB-14 — identité multi-profil

Le profil de départ est stable ; aucune bascule silencieuse de profil pendant la navigation.

### ONB-15 — filtre modifié ensuite

Une modification du filtre met à jour à la fois runtime + état persistant et survit au reload.

### ONB-16 — analytics privacy

Les événements d'activation sont présents sans nom/e-mail/date de naissance/GPS.

---

## 14. Ordre d'implémentation Claude Code

### O1 — Corriger le First Feed

Diff minimal en premier :

- utiliser les passions choisies pour le premier Feed ;
- persister/restaurer `selectedFeedPassions` ;
- ajouter tests ONB-01, ONB-04, ONB-15.

**Ne pas attendre la refonte visuelle pour corriger ce défaut d'activation.**

### O2 — Découpler intérêts et profils

- `selectedPassions` → intérêts Feed ;
- une passion primaire → profil de départ ;
- aucun profil supplémentaire automatique ;
- migration anciens états ;
- tests multi-profils.

### O3 — Compacter les écrans

- réunir identité minimale + âge avec signup lorsque possible ;
- préserver le chemin OAuth ;
- changer « prénom » en nom d'affichage ;
- retirer la copy « contrôle IA » non fondée.

### O4 — Supprimer le tutoriel bloquant

- aucune auto-ouverture du tour ;
- retirer du tour user-facing les produits supprimés ;
- garder éventuellement un mode démo/dev séparé.

### O5 — Instrumentation

- signup ;
- passions ;
- premier Feed ;
- premier auteur/profil ;
- première interaction.

### O6 — Coachmarks contextuels

Seulement après O1–O5 et uniquement s'ils améliorent une friction mesurée.

---

## 15. Scope guard

Ce lot ne doit pas :

- réécrire le ranking Feed ;
- créer une recommandation IA complexe ;
- demander une localisation exacte ;
- ajouter Wallet/gamification/badges ;
- créer un système de streak ;
- imposer plusieurs profils ;
- réintroduire CDV dans le cœur ;
- mélanger le durcissement IRL serveur avec la refonte onboarding dans un même méga-diff.

---

## 16. Definition of Done

Le nouvel onboarding est terminé quand :

- un nouvel utilisateur fournit uniquement les informations indispensables ;
- une seule sélection de passions personnalise immédiatement le Fil ;
- `selectedFeedPassions` est persisté et restauré ;
- un seul profil passion est créé au départ ;
- plusieurs intérêts ne signifient plus plusieurs profils imposés ;
- un compte existant revient directement à son expérience ;
- aucune permission GPS n'est demandée sans contexte ;
- aucun Wallet/CDV/score/Passia dans la première expérience ;
- aucun long tour obligatoire ;
- analytics activation disponibles avec provenance ;
- tests onboarding, feed, profils, auth, state sync et multi-comptes verts.

---

## 17. Répartition IA

### ChatGPT

- garde la simplicité du parcours ;
- arbitre intérêts vs identité multi-profil ;
- définit microcopy, métriques et critères d'acceptation ;
- vérifie que le premier écran apporte réellement de la valeur.

### Claude Code

- inspecte les vrais handlers `onb*`, Feed et state sync ;
- implémente les lots O1→O5 en diffs séparés ;
- adapte les tests et migrations d'état ;
- mesure la non-régression.

### Codex

- vérifie les cas reload/cross-device/ancien état ;
- cherche les duplications de profils ;
- teste les chemins signup/signin/OAuth ;
- vérifie qu'aucun Feed vide artificiel ou ancien produit ne réapparaît.
