# PASSIO — Recherche & Découverte V2

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Objectif** : unifier la recherche de Passio, personnes, contenus et IRL sans maintenir un univers Explorer concurrent du Feed.

---

# 1. Décision produit

PASSIO ne doit pas demander à l’utilisateur de comprendre la différence entre :

- Explorer ;
- rechercher depuis le Feed ;
- chercher une personne ;
- chercher une Passio ;
- chercher une activité IRL.

La cible est une seule capacité :

> **Recherche & Découverte**

accessible dans le contexte où l’utilisateur en a besoin.

Boucle :

```text
je cherche une Passio / personne / activité
→ je découvre
→ j’ouvre un contenu ou un profil
→ j’interagis
→ je discute
→ je peux aller vers un IRL
```

Explorer ne reste pas une destination primaire simplement parce qu’un écran historique existe.

---

# 2. État actuel vérifié

## 2.1 Explorer est un écran autonome

Le topbar possède actuellement une loupe :

```text
aria-label="Explorer"
→ goTo('explore')
```

L’écran `screen-explore` possède deux tabs :

```text
Recherche
Assistant IA
```

## 2.2 Recherche actuelle : Passions + utilisateurs

`filterExplore()` :

- recherche les Passions locales par `label` ;
- appelle `supaSearchUsers(query)` ;
- fusionne utilisateurs Supabase + seed ;
- déduplique les IDs Supabase/seed ;
- affiche badges Passio ;
- ouvre `openPassionExplorer()` ou `openUserProfile()`.

C’est une bonne base fonctionnelle à réutiliser.

## 2.3 Recherche Passio limitée au label

La recherche actuelle effectue essentiellement :

```text
p.label.toLowerCase().includes(q)
```

Elle ne possède pas encore un vrai modèle de :

- synonymes ;
- variantes orthographiques ;
- langues ;
- hiérarchie ;
- sous-Passio ;
- alias ;
- passions émergentes.

## 2.4 `openPassionExplorer()` mélange plusieurs concepts

Le modal Passio construit :

- des contenus ;
- des créateurs ;
- un bouton de création de profil passion si l’utilisateur n’en possède pas.

Cette dernière action mélange :

```text
Découvrir Photo
≠
Créer mon identité publique Photo
```

La séparation Feed interests / passion profiles définie dans Onboarding V2 et Profil V2 doit être appliquée ici aussi.

## 2.5 Créateurs Passio partiellement seed

`openPassionExplorer()` construit actuellement une partie de ses créateurs depuis :

```text
state.seed.users
```

La surface Passio n’est donc pas encore la vraie vue réseau canonique.

## 2.6 Explorer affiche encore une logique catalogue exhaustive

L’écran contient :

```text
Passions tendance
Toutes les passions
Créateurs à suivre
```

Avec un catalogue mondial très large, une grille `Toutes les passions` ne peut pas rester l’outil principal d’exploration.

## 2.7 Assistant IA contient des suggestions obsolètes

Les raccourcis / suggestions IA font encore référence à :

- CDV dans le cœur ;
- Passia ;
- gains de points.

Elles doivent être nettoyées avec les lots Wallet/CDV.

## 2.8 Recherche IRL séparée

IRL possède sa propre recherche ville/événement.

Elle doit rester spécialisée dans l’écran IRL, mais le moteur global doit pouvoir retourner des événements sûrs lorsque pertinent.

## 2.9 Recherche Messages séparée

La recherche de conversations/messages reste privée et locale au contexte Messages.

**Elle ne doit pas être fusionnée dans la recherche globale publique.**

---

# 3. Architecture cible

```text
Recherche globale PASSIO
├── Passio
├── Personnes
├── Publications
└── IRL

Recherche privée Messages
└── conversations/messages accessibles uniquement
```

La recherche globale peut être ouverte depuis :

- Feed ;
- topbar ;
- Profil / sélecteur Passio ;
- Creation V2 ;
- IRL lorsque la requête sort du filtre local.

Elle ne nécessite pas un onglet de navigation permanent.

---

# 4. UX cible — ouverture

Depuis le Feed :

```text
[🔍 Rechercher dans PASSIO]
```

ouvre un overlay / écran léger :

```text
← Recherche
[ Photo argentique, Nina, skate Lyon… ]

Tous | Passio | Personnes | Publications | IRL
```

Le clavier prend le focus immédiatement après geste utilisateur.

Retour : revient exactement à l’écran/source précédente.

---

# 5. État zéro — avant saisie

Ne pas afficher une grille infinie.

Proposer des blocs compacts :

```text
Tes Passio
🎵 Musique   📷 Photo   🛹 Skate

À découvrir
Passio / personnes pertinentes

Activités cette semaine
uniquement si IRL sûr et utilisateur éligible
```

Optionnel : recherches récentes **locales** contrôlables par l’utilisateur.

## Historique de recherche

P0 recommandé :

- stocké localement ;
- effaçable ;
- nombre limité ;
- jamais synchronisé comme donnée marketing par défaut.

---

# 6. Résultats `Tous`

Ne pas concaténer 100 résultats.

Exemple :

```text
Passio
📷 Photographie
📷 Photo argentique
Voir tout →

Personnes
[Lina] Street photo
[Hugo] Argentique
Voir tout →

Publications
[2–4 résultats]
Voir tout →

IRL
[1–3 activités sûres]
Voir tout →
```

Les catégories sans résultat disparaissent.

---

# 7. Passio = couche canonique de découverte

Une Passio n’est pas seulement un label de filtre.

Elle devient un nœud canonique reliant :

```text
Passio
├── sous-Passio
├── synonymes / langues
├── contenus
├── personnes
├── activités IRL
└── intérêt Feed de l’utilisateur
```

Mais **elle ne crée pas automatiquement un profil passion public**.

---

# 8. Catalogue mondial de Passio — modèle cible

Le catalogue doit pouvoir couvrir pratiquement tous les centres d’intérêt sans exposer une liste brute gigantesque.

## 8.1 Extension `passions`

Schéma actuel :

```text
id
emoji
label
color
sort_order
```

Extension expand-only proposée :

```text
slug
parent_id nullable
status
canonical_locale
created_at
updated_at
```

`status` :

```text
active
emerging
merged
archived
```

`parent_id` fournit une hiérarchie principale simple.

Exemple :

```text
Arts
└── Photographie
    ├── Street photography
    ├── Argentique
    ├── Portrait
    └── Astrophotographie
```

## 8.2 `passion_terms`

Table recommandée :

```text
id
passion_id
locale
term
normalized_term
kind
weight
created_at
```

`kind` :

```text
canonical
synonym
alias
abbreviation
variant
```

Exemple :

```text
Photographie
fr: photo, photographie
fr: photo argentique → Argentique

Skateboard
fr: skate
fr: planche à roulettes
EN: skateboarding
```

## 8.3 Multilingue

Une Passio garde un ID canonique mondial.

Les libellés sont localisés, pas dupliqués en passions différentes.

```text
passion_id = photography
fr = Photographie
EN = Photography
ES = Fotografía
```

Ne jamais créer `photography_fr`, `photography_en`, etc. comme objets différents.

## 8.4 Normalisation

Pour la recherche :

- Unicode normalisé ;
- casse ignorée ;
- accents tolérés ;
- espaces/punctuation normalisés ;
- variantes courantes ;
- translittération seulement si fiable.

Exemple :

```text
photographie
Photographie
PHOTOGRAPHIE
```

→ même match.

## 8.5 Sous-Passio

Une sous-Passio doit rester utilisable comme :

- intérêt Feed ;
- identité passion si cela a un sens ;
- filtre de recherche ;
- contexte IRL.

La hiérarchie permet des fallbacks :

```text
Astrophotographie
→ contenu exact d’abord
→ Photographie ensuite si nécessaire
```

Sans noyer le résultat exact.

---

# 9. Passions émergentes

PASSIO doit évoluer sans attendre une release applicative.

Créer un workflow serveur :

```text
passion_proposals
```

Champs conceptuels :

```text
id
proposed_label
normalized_label
locale
submitted_by nullable
matched_passion_id nullable
status
signal_count
created_at
reviewed_at
```

Statuts :

```text
pending
matched
approved
rejected
merged
```

## Règle

Ne jamais publier automatiquement toute chaîne saisie comme nouvelle Passio mondiale.

Risques :

- doublons ;
- spam ;
- insultes ;
- données personnelles ;
- marques/personnes mal utilisées ;
- catégories dangereuses ;
- variations linguistiques déjà couvertes.

---

# 10. Création d’une nouvelle Passio par l’utilisateur

Si aucun résultat n’est trouvé :

```text
Tu ne trouves pas cette Passio ?
[Suggérer « Aquascaping nano »]
```

Le bouton crée une proposition, pas automatiquement un nœud public.

## Retour immédiat possible

Pour ne pas bloquer l’utilisateur, P1 peut permettre un intérêt local temporaire :

```text
Passio en attente
```

mais elle ne doit pas être utilisée comme identité publique cross-account avant validation/canonicalisation.

---

# 11. Déduplication des Passio

Avant validation d’une proposition :

1. exact normalized match ;
2. synonym match ;
3. fuzzy/trigram ;
4. traduction/locale connue ;
5. parent/sous-Passio proche ;
6. revue si ambigu.

Exemple :

```text
Photo argentique
Photographie argentique
Analog photography
Film photography
```

peuvent converger vers un canonical ID selon la taxonomie décidée.

## Merge

Une Passio mergée conserve :

```text
ancien_id → canonical_id
```

via alias/redirection.

Ne pas casser posts/profils/intérêts historiques.

---

# 12. Ranking des résultats Passio

Ordre indicatif :

```text
1. correspondance canonical exacte
2. synonym/alias exact
3. préfixe exact
4. correspondance sous-Passio forte
5. fuzzy contrôlé
6. contexte utilisateur
```

Le contexte utilisateur peut reclasser légèrement :

- locale ;
- intérêts Feed ;
- historique de découverte ;
- contexte écran.

Il ne doit pas faire disparaître un match textuel évident.

---

# 13. Vue Passio V2

`openPassionExplorer()` devient une vraie vue Passio légère.

Exemple :

```text
📷 Photographie
Créer, apprendre et rencontrer autour de la photo

[Suivre cette Passio / Ajouter à mon Feed]

Publications
[contenus]

Passionnés
[personnes]

IRL
[activités sûres]

Sous-Passio
Argentique · Street · Portrait · Astro
```

## Action identité séparée

Dans menu secondaire :

```text
Créer mon profil Passio Photographie
```

Ce CTA n’est jamais confondu avec :

> Ajouter Photographie à mes intérêts Feed.

---

# 14. Ajouter une Passio au Feed

CTA cible :

```text
+ Ajouter à mes Passio
```

ou formulation finale choisie dans l’UX.

Effet :

```text
selectedFeedPassions += passion_id
```

et rien d’autre.

Ne change jamais :

- `currentProfileId` ;
- identité de publication ;
- confidentialité ;
- follows.

---

# 15. Créer un profil passion depuis la recherche

Action explicitement différente :

```text
Créer mon profil Photo
```

Flux Profil V2 :

- Passio préremplie ;
- nom/bio/avatar ;
- visibilité ;
- confirmation ;
- retour contexte.

Ne pas créer silencieusement au clic sur une Passio.

---

# 16. Recherche Personnes V2

## Résultat

```text
[avatar] Nina Costa
         🎵 Musique · 📷 Photo
         Bio courte
```

Tap → profil public.

## Ranking

Signaux possibles :

```text
match exact username
match display name
Passio recherchée
relation existante
visibilité
affinité
```

Éviter une logique pure `followers_count` qui favorise mécaniquement les gros comptes.

## Blocage

Aucun compte bloqué dans les deux sens ne doit apparaître via le moteur public selon la politique définie.

Au minimum : impossible d’utiliser la recherche pour contourner le block et initier une interaction.

---

# 17. Recherche avec Profil V2

Après matérialisation `passion_profiles`, la recherche peut retourner :

```text
Nina Costa
└── 📷 Street Photo
```

ou directement :

```text
Nina Costa · Street Photo
```

si la requête correspond à cette identité.

## RLS

Une identité passion privée ne doit pas être indexée/retournée aux comptes non autorisés.

---

# 18. Recherche Publications

## P0

Ne pas prétendre posséder une recherche serveur exhaustive si elle n’existe pas.

Options :

- rechercher uniquement dans les posts déjà chargés et l’indiquer implicitement comme découverte locale ; ou
- laisser `Publications` absent jusqu’au RPC sûr.

## P1 serveur

Créer une fonction/requête de recherche qui s’exécute sous les RLS existantes.

Champs indexables :

- contenu public/autorisé ;
- passion_id ;
- auteur visible ;
- format ;
- created_at.

## Interdit

- contourner compte privé ;
- index global administrateur servi au client ;
- rechercher dans DM ;
- exposer post supprimé/non autorisé via snippet.

---

# 19. Ranking Publications

Signaux :

```text
pertinence texte
match Passio
fraîcheur
visibilité
qualité
relation auteur
```

Ne pas utiliser un score d’engagement brut comme facteur dominant par défaut.

La recherche répond à une intention explicite ; la pertinence textuelle doit dominer.

---

# 20. Recherche IRL globale

À activer après gates IRL Trust & Safety.

Résultat :

```text
🤝 Jam photo argentique
Lyon · samedi
```

Index public :

- titre ;
- Passio ;
- ville/zone ;
- description publique ;
- type.

Jamais :

- adresse exacte privée ;
- GPS exact ;
- contact ;
- liste participants brute.

## Mineurs

Pour 13–17 lors du premier lancement public :

- ne pas retourner d’IRL actionable ;
- serveur refuse de toute façon l’accès/RSVP.

---

# 21. Recherche contextuelle IRL

Dans l’écran IRL, conserver la recherche spécialisée :

```text
ville + activité
```

Elle peut partager les fonctions de normalisation Passio, mais garde son UX spécifique.

Ne pas obliger l’utilisateur à ouvrir la recherche globale pour changer de ville.

---

# 22. Feed ↔ Recherche

Le Feed devient le point d’entrée principal de recherche globale.

## Depuis un filtre Passio

Tap `…` :

```text
Découvrir plus sur Photo
→ vue Passio V2
```

## Recherche → Feed

Depuis résultat Passio :

```text
Voir dans le Feed
```

applique un filtre de découverte temporaire ou ajoute l’intérêt selon l’action choisie.

Toujours sans switch d’identité.

---

# 23. Recherche ↔ Personne ↔ Message

```text
Recherche
→ Nina
→ Profil
→ Suivre / Message
```

Ne pas ajouter un bouton DM direct dominant dans chaque résultat de recherche.

Le profil sert de confirmation humaine avant interaction directe.

---

# 24. Recherche ↔ IRL

```text
Recherche « photo Lyon »
→ Passio Photo
→ personnes Photo
→ activités Photo à Lyon
```

La recherche peut interpréter des entités connues, mais ne doit pas inventer la localisation utilisateur.

Une ville explicitement tapée dans la requête est utilisable comme contexte de recherche, sans l’enregistrer automatiquement comme domicile.

---

# 25. Assistant IA — nouveau rôle

L’assistant IA n’est pas un deuxième moteur de vérité.

Il peut aider à :

- reformuler une recherche ;
- explorer une passion ;
- expliquer une sous-Passio ;
- suggérer des catégories connexes ;
- aider à trouver quoi chercher.

Il ne peut jamais :

- contourner RLS ;
- révéler profil/événement non retourné par les sources autorisées ;
- inventer des utilisateurs/événements comme résultats réels ;
- inférer une adresse privée ;
- promouvoir Passia/CDV cœur.

## UX

L’IA devient une action secondaire :

```text
Demander à Passio IA
```

pas un tab concurrent obligatoire de la recherche classique.

---

# 26. Query understanding IA

P1 : l’IA peut proposer une expansion structurée :

```text
"photo nuit étoiles"
→ astrophotographie
```

mais le match final utilise des IDs canoniques autorisés.

Ne pas laisser un LLM générer directement une requête SQL libre.

---

# 27. Suggestions personnalisées

Zéro-query / suggestions peuvent utiliser :

- selectedFeedPassions ;
- comptes suivis ;
- contexte écran ;
- historique de clics Passio agrégé ;
- ville explicitement choisie pour IRL ;
- nouveautés raisonnables.

## Diversité

Éviter de ne montrer que les intérêts déjà connus.

Réserver une part à l’exploration :

```text
Passio adjacentes
nouveaux créateurs
contenus hors bulle mais cohérents
```

---

# 28. « Tendances »

Le label actuel `🔥 Hot` peut induire une tendance non mesurée.

## Règle

N’afficher `Tendance` que si une définition mesurable existe :

```text
croissance recherches
croissance nouveaux intérêts
croissance contenus qualifiés
```

avec seuil minimal pour éviter bruit/manipulation.

Sinon préférer :

```text
À découvrir
```

---

# 29. Anti-manipulation

Les résultats ne doivent pas être facilement gagnés par :

- répétition de mots-clés ;
- spam hashtags ;
- création massive de profils ;
- faux événements ;
- followers artificiels.

Search quality doit combiner :

- pertinence ;
- visibilité ;
- sécurité ;
- signaux de qualité bornés.

Pas de paiement pour être classé avant une politique de publicité explicite et séparée.

---

# 30. Confidentialité des requêtes

Une recherche peut révéler une information sensible sur l’utilisateur.

## Analytics P0

Ne pas stocker le texte brut de chaque recherche dans `analytics_events`.

Émettre :

```text
search_opened
search_submitted
search_results_shown
search_result_clicked
search_no_result
passion_added_from_search
```

Propriétés sûres :

- `source` ;
- `query_length_bucket` ;
- `result_count_bucket` ;
- `entity_type_clicked` ;
- `passion_id` seulement après sélection canonique ;
- `has_irl_result` ;
- `latency_bucket`.

Jamais :

- raw query ;
- nom recherché ;
- adresse ;
- texte DM ;
- email/téléphone.

---

# 31. Apprendre des recherches sans résultat

Pour enrichir le catalogue mondial, il faut détecter les termes manquants sans créer une base de requêtes personnelles.

## Modèle recommandé

Pipeline séparé `passion_candidate_signal` :

- uniquement lorsqu’une requête ressemble fortement à une Passio ;
- normalisation ;
- filtre PII/profanité/sécurité ;
- agrégation ;
- seuil k avant revue humaine/IA ;
- pas de lien vers utilisateur individuel dans l’outil catalogue.

Ainsi :

```text
37 personnes cherchent « aquascaping nano »
```

peut devenir un signal catalogue sans conserver leurs historiques individuels.

---

# 32. Search backend — doctrine

Ne pas construire immédiatement un moteur externe complexe.

P0/P1 peut rester PostgreSQL/Supabase avec :

- normalisation ;
- indexes adaptés ;
- trigram/unaccent si disponibles ;
- RPC limitées ;
- RLS.

Évaluer Meilisearch/OpenSearch/Typesense seulement si :

- volume ;
- latence ;
- ranking ;
- typo tolerance ;
- multilingue

ne peuvent plus être correctement servis par Postgres.

---

# 33. APIs / fonctions candidates

À confirmer techniquement par Claude Code.

```text
search_passions(query, locale, limit)
search_profiles(query, passion_id?, limit)
search_public_content(query, passion_id?, limit)
search_public_events(query, city?, passion_id?, limit)
```

Chaque fonction doit retourner uniquement ce que la session a le droit de voir.

Pas de clé service-role côté client.

---

# 34. Performance

Objectifs UX :

- résultat Passio local quasi immédiat ;
- personnes debounce réseau ;
- annuler réponse obsolète si requête change ;
- skeleton léger ;
- pas de re-render complet du Feed à chaque caractère.

## Debounce

Environ 150–300 ms selon mesure, pas une valeur dogmatique.

## Race

La réponse de `phot` ne doit pas écraser celle de `photo` arrivée plus tard dans l’intention mais plus tôt sur réseau.

Utiliser request sequence / AbortController si compatible.

---

# 35. Offline

Offline :

- Passio catalogue caché ;
- historique local ;
- contenus déjà chargés ;
- pas de faux résultats réseau.

Afficher clairement si la recherche personnes/IRL nécessite une connexion.

---

# 36. Accessibilité

- input labellé ;
- catégories navigables clavier ;
- résultats avec rôles corrects ;
- lecteur d’écran annonce nombre/type ;
- cible tactile suffisante ;
- focus restauré au retour ;
- escape/back ferme l’overlay sans perdre le Feed.

---

# 37. Deep links Passio

P1 : route canonique :

```text
#passion-<slug-or-id>
```

ouvre la vue Passio.

Les IDs/slug merged redirigent vers canonical.

Ne pas casser anciens liens lors d’un merge de taxonomie.

---

# 38. Migrations des passions locales existantes

Le client possède :

```text
state.user.customPassions
```

Avant de migrer :

1. inventaire des formes réelles ;
2. normalisation ;
3. match canonical ;
4. proposition si inconnue ;
5. mapping idempotent ;
6. conserver les références historiques jusqu’à migration complète.

Ne jamais supprimer brutalement un ID custom utilisé par des posts/profils.

---

# 39. Relation avec Onboarding V2

Onboarding recherche le même catalogue canonique.

P0 UX :

- suggestions simples ;
- recherche/autocomplétion ;
- minimum 1 ;
- recommandé 3 ;
- max 7 pour démarrage.

Le catalogue peut être immense, l’interface reste compacte.

---

# 40. Relation avec Creation V2

Le champ Passio du composer réutilise le même moteur.

Si Passio choisie :

- elle tague le contenu ;
- elle ne crée pas automatiquement un profil passion.

Si identité correspondante absente et nécessaire :

- action explicite Profil V2 ;
- retour composer.

---

# 41. Relation avec Profil V2

Création d’un profil passion utilise :

```text
search_passions
```

et interdit les doublons canoniques `(account_id, passion_id)` selon le modèle initial.

Un alias sélectionné est enregistré avec l’ID canonique.

---

# 42. Relation avec IRL V2

Création événement : sélection Passio canonique.

Recherche événement : synonymes/variantes Passio fonctionnent.

Exemple :

```text
« skate Lyon »
```

retrouve `Skateboard` même si l’événement est tagué avec l’ID canonique.

---

# 43. Sentinelle / Centre de pilotage

Superviser :

- taux erreur search RPC ;
- latence p50/p95 ;
- no-result rate ;
- erreurs taxonomy mapping ;
- passion merge loops ;
- résultats interdits détectés ;
- block/private leakage ;
- requêtes obsolètes qui écrasent UI ;
- explosion de proposals spam.

## Alertes sécurité

- résultat privé retourné à non autorisé ;
- profil bloqué actionable ;
- événement IRL privé/location leak ;
- service-role exposé ;
- raw query accidentellement envoyée analytics.

## Mobile cockpit

Ces signaux sont visibles dans le Centre de pilotage mobile conformément à la règle globale PASSIO.

---

# 44. Tests d’acceptation Search V2

## SEARCH2-01 — loupe Feed

Recherche globale accessible depuis Feed sans destination Explorer permanente.

## SEARCH2-02 — retour contexte

Fermer recherche revient au Feed et conserve position/filtres.

## SEARCH2-03 — Passio exact

`Photographie` retourne canonical exact en premier.

## SEARCH2-04 — accent/casse

Variantes de casse/accent retrouvent la même Passio.

## SEARCH2-05 — synonym

`photo` retrouve Photographie.

## SEARCH2-06 — locale

Terme anglais/français mappe le même ID canonical quand défini.

## SEARCH2-07 — sous-Passio

`astrophotographie` retourne sous-Passio avant parent générique.

## SEARCH2-08 — alias merged

Ancien ID/alias ouvre la Passio canonique.

## SEARCH2-09 — intérêt Feed

Ajouter une Passio depuis recherche modifie `selectedFeedPassions` uniquement.

## SEARCH2-10 — aucun switch identité

Recherche/filtre n’altère jamais `currentProfileId`.

## SEARCH2-11 — création profil explicite

`Créer mon profil Photo` exige action distincte.

## SEARCH2-12 — pas de création profil automatique

Ouvrir une Passio ne crée aucune identité publique.

## SEARCH2-13 — personne Supabase

Recherche retourne un vrai compte accessible et ouvre `openUserProfile`.

## SEARCH2-14 — dédup seed/Supabase

Même user ID n’apparaît pas deux fois.

## SEARCH2-15 — block

Compte bloqué ne permet aucun contournement d’interaction depuis recherche.

## SEARCH2-16 — profil privé

Résultat respecte visibilité serveur.

## SEARCH2-17 — passion profile privé

Après Profil V2, identité privée absente pour non autorisé.

## SEARCH2-18 — publication RLS

Recherche contenu ne retourne aucun post inaccessible.

## SEARCH2-19 — supprimé

Post supprimé ne survit pas dans snippets/index.

## SEARCH2-20 — DM isolation

Recherche globale ne recherche jamais le contenu des messages privés.

## SEARCH2-21 — IRL safe

Résultat IRL n’expose pas adresse/GPS/contact.

## SEARCH2-22 — mineur IRL

Compte 13–17 ne reçoit pas d’action IRL contournant le gate.

## SEARCH2-23 — no result

État vide propose action utile sans inventer de résultat.

## SEARCH2-24 — proposal

Suggestion nouvelle Passio crée une proposition, pas une passion publique immédiate.

## SEARCH2-25 — dedupe proposal

Variantes évidentes sont rapprochées avant nouvelle création.

## SEARCH2-26 — custom migration

Ancienne customPassion mappe idempotemment sans casser contenu historique.

## SEARCH2-27 — raw query analytics

Texte de recherche absent de `analytics_events`.

## SEARCH2-28 — canonical analytics

Après clic Passio, `passion_id` canonical peut être mesuré.

## SEARCH2-29 — race réseau

Réponse ancienne ne remplace jamais résultats de la requête courante.

## SEARCH2-30 — offline

Catalogue local fonctionne ; résultats réseau clairement indisponibles.

## SEARCH2-31 — zéro-query

Aucune grille exhaustive massive ; suggestions bornées.

## SEARCH2-32 — tendances vraies

Aucun label `Hot/Tendance` sans définition mesurée.

## SEARCH2-33 — IA authz

Assistant IA ne peut afficher une entité que si source autorisée la retourne.

## SEARCH2-34 — IA legacy cleanup

Aucune suggestion Passia/Wallet/CDV cœur.

## SEARCH2-35 — creation reuse

Composer utilise le même canonical passion search.

## SEARCH2-36 — onboarding reuse

Onboarding et recherche produisent les mêmes IDs canonical.

## SEARCH2-37 — IRL synonym

Alias passion retrouve événements tagués canonical après T&S.

## SEARCH2-38 — mobile

Recherche, tabs et résultats restent utilisables à une main.

## SEARCH2-39 — accessibilité

Focus/labels/clavier/back conformes.

## SEARCH2-40 — Sentinelle

Leak privé/no-result spike/erreur RPC visibles sans raw query.

---

# 45. Ordre d’implémentation Claude Code

## D2-0 — audit exact

Avant code :

- toutes fonctions Explore ;
- `filterExplore` ;
- `openPassionExplorer` ;
- `supaSearchUsers` ;
- PASSIONS / customPassions ;
- usages de `passionById` ;
- champs `passion_id` toutes tables ;
- recherche Feed existante ;
- recherche IRL ;
- recherche Messages ;
- tests navigation/explore.

## D2-1 — extraire moteur de recherche réutilisable

Sans changer schéma :

- Passions + personnes ;
- composant overlay ;
- intégration Feed ;
- conserver Explorer temporairement comme compatibilité ;
- tests.

## D2-2 — dépromouvoir `screen-explore`

Une fois overlay stable :

- topbar loupe ouvre recherche ;
- ancien `goTo('explore')` redirige/ouvre la nouvelle surface ;
- pas de dead handlers ;
- IA déplacée secondaire.

## D2-3 — taxonomie Passio expand-only

- colonnes canonical/hierarchy ;
- `passion_terms` ;
- indexes ;
- RLS lecture ;
- migration du catalogue existant ;
- aucune destruction d’IDs.

## D2-4 — moteur canonical

- exact/synonym/prefix/fuzzy ;
- locales ;
- tests de déterminisme ;
- performance.

## D2-5 — migration custom passions

- audit ;
- mapping ;
- proposals inconnues ;
- idempotence ;
- protection posts/profils historiques.

## D2-6 — publications

Après audit RLS :

- RPC search content ;
- snippets sûrs ;
- deleted/private/block tests.

## D2-7 — IRL

Après IRL T&S :

- événements safe ;
- synonyms ;
- city context ;
- mineur gate.

## D2-8 — passions émergentes

- proposals ;
- dedupe ;
- pipeline agrégé ;
- modération ;
- Centre de pilotage.

## D2-9 — ranking découverte

Seulement après instrumentation.

---

# 46. Scope guard

Ne pas :

- construire immédiatement Elasticsearch/OpenSearch ;
- garder une destination Explorer uniquement par héritage ;
- afficher une liste exhaustive de milliers de Passio ;
- créer un profil passion au clic sur une recherche ;
- créer une passion publique pour chaque texte libre ;
- dupliquer les Passio par langue ;
- casser les IDs historiques lors d’un merge ;
- indexer les DM ;
- contourner RLS avec un index service-role exposé ;
- stocker les requêtes brutes dans analytics ;
- utiliser l’IA comme source d’autorisation ;
- afficher IRL privé/adresse exacte dans recherche ;
- réécrire Feed/IRL/Profil dans le même diff que la première extraction search ;
- optimiser les résultats pour popularité brute uniquement.

---

# 47. Definition of Done

Recherche & Découverte V2 est fondée lorsque :

- la loupe ouvre une recherche globale réutilisable ;
- Explorer n’est plus requis comme destination cœur ;
- Passio + personnes fonctionnent sur le vrai réseau ;
- recherche/Feed/profil sont sémantiquement séparés ;
- catalogue Passio supporte hiérarchie, synonymes et langues ;
- nouvelles Passio passent par canonicalisation/déduplication ;
- contenus et IRL respectent RLS avant d’être indexés ;
- block/privacy s’appliquent partout ;
- aucune recherche globale n’accède aux DM ;
- aucune raw query sensible n’est envoyée en analytics ;
- Onboarding, Feed, Creation, Profil et IRL utilisent le même canonical `passion_id` ;
- Sentinelle supervise latence, erreurs, leaks et dérive catalogue ;
- tests Search V2 sont verts sur mobile et multi-compte.

---

# 48. Répartition IA

## ChatGPT

- architecture découverte ;
- sémantique Passio / intérêt / identité ;
- taxonomie produit ;
- ranking fonctionnel ;
- privacy analytics ;
- critères d’acceptation.

## Claude Code

- audit exhaustive du catalogue et des usages `passion_id` ;
- extraction du moteur de recherche ;
- migration expand-only taxonomie ;
- indexes/RPC/RLS ;
- migration customPassions ;
- tests performance/multi-compte ;
- intégration Centre de pilotage.

## Codex

- attaque RLS search ;
- leak profils/posts/events privés ;
- block bypass ;
- ID alias/merge corruption ;
- races de requêtes ;
- raw query analytics leak ;
- prompt/IA contournant permissions ;
- incohérences canonical IDs entre onboarding/feed/composer/profil/IRL.
