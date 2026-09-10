# Le nom d'utilisateur est demandé À LA CRÉATION DU COMPTE (2026-09-09)

> Rapport d'un testeur : « à l'inscription le nom d'utilisateur n'est pas demandé ».

## Le défaut, mesuré

Il **était** demandé — à l'étape `name` de l'onboarding (« Comment t'appelles-tu ? »,
`onbValidateName`, app-02). Cette étape n'est **plus jamais atteinte par un compte neuf**
depuis l'activation de « Confirm email » (2026-08-30) :

1. `signUp` ne rend **plus de session** → `onbDoAuth` bascule sur l'onglet « Se connecter »,
   affiche « Compte créé ! Vérifie tes e-mails » et **sort**. L'onboarding n'a jamais démarré.
2. La personne confirme son e-mail, revient et se connecte → branche `signin` d'`onbDoAuth` :
   `state.onboarded = true` puis `location.reload()`.
3. `boot()` (app-08) voit une session valide et un état onboardé → **entre directement dans
   l'app**, et fabrique un profil de repli dont le nom est `state.user.name || "Passionné"`.

Résultat : un compte qui suit ce chemin s'appelle **« Passionné »** (repli local) ou
**« Profil »** (repli de `supaEnsureProfileExists`), et rien à l'écran ne propose de choisir
autre chose. Ce n'est pas une porte cassée : c'est une étape devenue **inaccessible** par un
changement fait ailleurs — la même famille que les « survivants d'un retrait » du dépôt.

### ⚠️ Ce que la production dit vraiment (mesuré le 2026-09-10)

La première rédaction de cette fiche affirmait « **tout** compte créé depuis le 2026-08-30
s'appelle Passionné ». C'était une **déduction du code, pas une mesure**, et la base la
dément :

| Mesure (connecteur lecture seule) | Résultat |
|---|---|
| `count(*) filter (where username in ('Passionné','Profil','Moi'))` sur `public.profiles` | **0** sur 6 comptes |
| Écart entre le compte auth et sa ligne `profiles`, seul compte créé depuis le 30/08 | **26 secondes**, avec nom **et** passion |
| Délai de confirmation de l'e-mail pour ce compte | **21 secondes** (lien ouvert sur le même téléphone) |

Un profil complet en 26 secondes n'est pas une reconnexion après confirmation : c'est un
**onboarding qui a continué**, donc `signUp` a bien rendu une session pour ce compte. **Les
deux chemins sont vivants** ; celui « sans session » n'a simplement pas encore laissé de cas
en base.

Deux conséquences, et la seconde est un défaut que ce constat a révélé :

1. **La reprise de données est SANS OBJET** : il n'y a personne à renommer. Ce point ouvert
   est clos par la mesure, pas par une décision — le rouvrir demande de refaire la requête.
2. **La question se posait deux fois** sur le chemin vivant : le formulaire demande le nom,
   puis l'écran suivant demande « Comment t'appelles-tu ? ». Corrigé le 2026-09-10 (ci-dessous).

## Le correctif

La question est posée au **SEUL écran que tout compte traverse** : le formulaire de création.

- `index.html` : `#authNameWrap` / `#authName`, en **premier champ**, `maxlength="40"`,
  masqué par défaut ; `switchAuthTab` le montre en mode `signup` uniquement
  (`display = ""` — `label.field` est `display:block`, c'est la mise en page voulue ;
  seule la case de consentement a besoin de `flex`).
- `nomCompteValide(v)` (app-02) : **seul** point de vérité. Normalise (blancs de bord et
  doublons internes réduits) et rend `""` hors de `[2, 40]`. Les appelants ne re-testent rien.
- `onbDoAuth` refuse l'inscription sans nom **avant tout autre contrôle** — le nom est le
  premier champ de l'écran, son refus doit se prononcer en premier — et le porte dans
  `user_metadata` sous **deux clés de même valeur** : `name` (relue par le client) et
  `display_name` (affichée par le tableau de bord Supabase).
- `appliquerNomCompte(session)` (app-02), appelée par `boot()` **après** `supaLoadUserState`
  (l'état du compte fait foi) et **avant** le profil de repli (qui lit `state.user.name`).

## Les pièges du lot

- ⚠️ **`user_metadata` est la seule mémoire qui voyage.** On crée son compte sur le téléphone
  et on ouvre le lien de confirmation sur l'ordinateur : le `state` local de la création n'y
  est pas. Écrire le nom uniquement en local n'aurait corrigé le défaut que sur un appareil.
- ⚠️ **On n'écrase jamais un nom déjà choisi.** `appliquerNomCompte` ne remplace que les noms
  de **remplissage** (`""`, `Passionné`, `Profil`, `Moi`) — sinon quelqu'un qui s'est renommé
  depuis les Paramètres retrouverait son pseudo d'origine à chaque reconnexion.
- ⚠️ **`general.username` prime sur `state.user.name`** dans `supaEnsureProfileExists` : le
  laisser vide, c'est laisser le repli « Profil » gagner la course. Les deux sont écrits.
- ⚠️ **Aucune unicité n'est promise** : `profiles.username` n'a **pas** d'index unique en
  production. Le champ dit « ton nom public », jamais « identifiant unique » — annoncer une
  garantie que la base ne tient pas serait un mensonge de plus.
- ⚠️ **Tester la fonction ne suffit pas.** Le seul appelant vit dans la branche
  « session retrouvée » de `boot()`, chemin qu'un banc local ne parcourt pas (`_supaReal` y
  est faux, le SDK vient d'un CDN) : le cas ⑦ mesure donc le **câblage à la source** et sa
  **position** (après l'hydratation, avant le profil de repli).
- Le retour Google est couvert par le même chemin : `full_name` est lu au même titre que
  `name` / `display_name`.

## Le correctif du 2026-09-10 — l'étape « prénom » est sautée quand la réponse est connue

`onbNext` et `onbPrev` consultent `_onbEtapeASauter(nom)` : l'étape `name` est sautée dès que
`nomCompteValide(state.user.name)` rend un nom. Trois pièges, tous traités :

- ⚠️ **Le saut vaut DANS LES DEUX SENS.** Sauter à l'aller seulement, c'est laisser le
  « ← Retour » de l'écran des passions ré-afficher l'étape qu'on vient d'éviter : une porte
  fermée dans un seul sens.
- ⚠️ **Sauter une étape, c'est sauter ce qu'elle PRÉPARAIT.** `onbValidateName` appelait
  `renderPassionGrid()` et `PassioFirstRun.prefiller()` **après** son `onbNext()` : sans report
  dans `_onbPreparerEtape`, l'écran des passions s'ouvre **vide** — invisible au parseur comme
  aux gates, et seul un test qui COMPTE les tuiles peut le voir (cas ⑧ bis).
- ⚠️ **Le saut tient à la réponse connue, jamais à l'inscription elle-même** (cas ⑨) : sinon
  un compte sans nom sauterait l'étape et ne serait plus jamais nommé.

## ⚠️ Un serveur `dist/` laissé en vie fausse TOUS les tests locaux

Trouvé en se cassant dessus le 2026-09-10. Le `webServer` de Playwright **réutilise** un
serveur déjà à l'écoute sur le port 8080 : un `node scripts/servir-dist.js` oublié fait donc
mesurer **l'artefact précédent** au lieu des sources. Symptôme exact : quatre cas neufs rouges,
onze verts qui ne prouvaient rien, et une fonction qu'on vient d'écrire rendue `<absente>` par
la page. Réflexe : `pkill -f servir-dist.js` avant tout `npm run test:local`.

## Verrou

`tests/e2e/nom-utilisateur-inscription.spec.js` (14). Trois suites voisines ont été mises à
jour parce qu'elles remplissent le formulaire d'inscription : `cgu-consentement`,
`confirmation-email`, `exploration-anonyme-vs-compte`.

## Points ouverts

- ~~Renommer les comptes créés entre le 2026-08-30 et ce lot~~ → **SANS OBJET, mesuré le
  2026-09-10** : aucun compte ne porte « Passionné », « Profil » ni « Moi » (0 sur 6).
- **L'unicité des pseudos n'est pas retenue, et c'est une décision, pas un oubli.**
  `profiles.username` n'a aucun index unique, et il ne doit pas en recevoir : ce champ est un
  **nom d'affichage**, or deux personnes ont le droit de s'appeler « Léa ». Un index unique
  répondrait « ce nom est déjà pris » sur un prénom courant — et ne protégerait de rien, une
  usurpation se faisant à une lettre près. La réponse juste à ce besoin est un **identifiant
  distinct du nom affiché** (un `@handle` : colonne, index unique, contrainte de format,
  recherche, écran de choix, reprise des 6 comptes existants) — un lot produit à part entière,
  à ouvrir quand l'usurpation deviendra un problème réel. À 6 comptes et 6 noms distincts, elle
  ne l'est pas.
