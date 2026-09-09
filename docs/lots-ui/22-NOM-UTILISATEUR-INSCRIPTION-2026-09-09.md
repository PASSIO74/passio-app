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

Résultat : tout compte créé depuis le 2026-08-30 s'appelle **« Passionné »**, et rien à
l'écran n'a jamais proposé de choisir autre chose. Ce n'est pas une porte cassée : c'est une
étape devenue **inaccessible** par un changement fait ailleurs — la même famille que les
« survivants d'un retrait » du dépôt.

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

## Verrou

`tests/e2e/nom-utilisateur-inscription.spec.js` (10). Trois suites voisines ont été mises à
jour parce qu'elles remplissent le formulaire d'inscription : `cgu-consentement`,
`confirmation-email`, `exploration-anonyme-vs-compte`.

## Point ouvert

Les comptes créés **entre le 2026-08-30 et ce lot** portent le nom « Passionné » dans
`profiles.username`. Ils peuvent se renommer depuis les Paramètres ; aucune reprise de
données n'est faite ici (elle écraserait un nom éventuellement déjà corrigé à la main).
