# 🔒 Code d'accès PASSIO (Access Gate)

> ⚠️ **LE RIDEAU EST LEVÉ DEPUIS L'OUVERTURE PUBLIQUE (2026-09-11).** Par défaut, aucun
> code n'est demandé : `js/access-gate.js` rend `__gateReady` résolue et ne masque rien.
> Le mécanisme n'est conservé que pour REFERMER une préproduction ou rejouer la suite
> `tests/e2e/access-gate.spec.js`, et il ne s'arme que sur adhésion explicite :
> `localStorage.setItem("passio_gate_actif", "1")` (ou `window.PASSIO_GATE_ACTIF = true`
> posé AVANT le script, qui est le premier de la page). Sans cette adhésion, tout ce qui
> suit décrit un code dormant. Ce n'était pas une serrure : le hash est dans le
> JavaScript livré et un code à quatre chiffres se retrouve en quelques secondes.

## Ce que fait le système (quand il est armé)

À **chaque ouverture** de l'application (nouvel onglet, relance de la PWA), un écran de sécurité s'affiche avant tout contenu. Tant que le code n'est pas validé :

- l'app est masquée (`html.passio-locked`) et l'overlay couvre tout l'écran ;
- **`boot()` n'est pas exécuté** : aucune donnée Supabase n'est chargée, aucun écran rendu ;
- URL directes, routes internes et deep links sont couverts (SPA : tout passe par `index.html`, donc par le gate).

Le déverrouillage est mémorisé en `sessionStorage` uniquement → il expire à la fermeture de l'onglet/app.

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `js/access-gate.js` | Tout le système (logique + UI + styles) |
| `index.html` (head) | `<script src="js/access-gate.js"></script>` — doit rester le **premier** script |
| `js/app-09-boot-pwa.js` (ligne 1) | `boot()` attend `window.__gateReady` |

Le build (`node scripts/build.js`) inline automatiquement le gate dans le monolithe de production.

## 🔑 Changer le code d'accès

Le code n'est **jamais stocké en clair** : seul son hash SHA-256 salé est embarqué.

1. Choisir le nouveau code, ex. `4807`.
2. Générer le hash :

```bash
node -e "console.log(require('crypto').createHash('sha256').update('passio-gate-v1::4807').digest('hex'))"
```

Ou dans la console du navigateur (F12) :

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("passio-gate-v1::4807"))
  .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("")));
```

3. Dans `js/access-gate.js`, remplacer la valeur de `GATE_HASH` par le résultat.
4. Rebuild + redéployer.

Code actuel : `2125` → hash `67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f`.

## Limites connues (assumées pour une beta privée)

Le gate est **côté client** : un développeur qui lit le code source peut le contourner (le hash empêche seulement de retrouver le code). C'est suffisant pour empêcher l'usage non autorisé par le grand public, pas contre un attaquant motivé. Les données restent de toute façon protégées par les policies RLS Supabase côté serveur.

## Migration future (prévue dans l'architecture)

`verifyCode()` dans `access-gate.js` est le seul point à remplacer pour migrer vers :

- **Comptes administrateurs / beta-testeurs** : appeler une Edge Function Supabase `verify-access` qui valide le code/l'email côté serveur et renvoie un jeton signé.
- **Liste blanche** : table `beta_whitelist` (emails autorisés) + vérification à la connexion Supabase Auth.
- **Invitations** : codes uniques en table `invites`, consommés à la première utilisation.
- **Authentification complète** : supprimer le gate et exiger Supabase Auth dès `boot()`.

Dans tous les cas, la signature reste `verifyCode(input) → Promise<boolean>` : le reste du gate (UI, blocage du boot) ne change pas.
