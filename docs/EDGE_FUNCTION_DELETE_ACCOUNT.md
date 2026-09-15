# Edge Function `delete-account` — guide de déploiement

> ✅ **DÉPLOYÉE le 2026-06-11** via l'éditeur du Dashboard (Edge Functions → delete-account).
> Testée en réel : compte anonyme jetable → invoke → `{ok:true}`, profil supprimé,
> compte auth supprimé. Le guide CLI ci-dessous reste valable pour les mises à jour
> (ou éditer directement dans le Dashboard, le code source de référence est
> `supabase/functions/delete-account/index.ts`).

## Pourquoi

La suppression de compte in-app (Paramètres → Supprimer mon compte) efface les données
des 12 tables via RLS, mais le **compte auth** (l'e-mail dans `auth.users`) ne peut pas
être supprimé par le client : il faut la clé `service_role`, qui ne doit jamais être
embarquée dans l'app. Cette Edge Function fait cette suppression côté serveur.

Tant qu'elle n'est pas déployée, l'app fonctionne quand même : l'appel est best-effort
(silencieux en cas d'échec) et le texte in-app promet la purge de l'e-mail « sous
30 jours » — à faire alors manuellement (Dashboard → Authentication → Users).

## Déploiement (une fois, ~5 minutes)

1. Installer la CLI Supabase si besoin : `npm install -g supabase`
   (ou `scoop install supabase` / binaire depuis github.com/supabase/cli)
2. Se connecter : `supabase login` (ouvre le navigateur)
3. Depuis la racine du repo :
   ```
   supabase link --project-ref njkiyoklssvefstljemx
   supabase functions deploy delete-account
   ```
   C'est tout : `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`
   sont injectées automatiquement par la plateforme, rien à configurer.

## Vérifier

1. Créer un compte jetable dans l'app.
2. Paramètres → Supprimer mon compte → taper SUPPRIMER.
3. Dashboard Supabase → Authentication → Users : le compte doit avoir disparu
   (avant : il restait, seules les données des tables partaient).
4. Logs : Dashboard → Edge Functions → delete-account → Logs.

## Sécurité

- La fonction n'accepte que POST avec un JWT utilisateur valide (header Authorization,
  envoyé automatiquement par `supa.functions.invoke`).
- Elle ne supprime QUE l'utilisateur identifié par ce JWT — impossible de supprimer
  quelqu'un d'autre.
- La clé `service_role` n'existe que dans l'environnement d'exécution de la fonction.

## Ce que la fonction purge, et sur quelle autorité (2026-09-14, revu le 2026-09-15)

`supabase/functions/_shared/purge-compte.js` (le même fichier que `tests/unit/purge-compte.test.mjs` charge) :

1. **Objets Storage par PROPRIÉTÉ** — `objets_stockage_du_compte(uid)` (migration du 2026-09-15, `service_role` seul) rend les objets dont `storage.objects.owner` est le compte, tous seaux. C'est la seule autorité. ⚠️ **ASTRA-11** : la version du 14/09 relevait les pièces jointes dans le CONTENU des messages du compte — un texte que le client écrit — et les supprimait avec la clé admin : un message de A visant le fichier de B faisait supprimer le fichier de B. Reproduit sur le staging le 15/09 avec cette version (fichier de B supprimé, celui de A oublié, `ok:true`), puis corrigé et re-prouvé (fichier de B intact, ceux de A partis, compte supprimé).
2. **Lignes** des 35 colonnes de `TABLES_COMPTE`, chaque verdict lu.
3. **Dossiers `<dossier>/<uid>/`** du seau `content` (second filet : le chemin y porte l'uid).
4. **Relecture** — objets par propriété, puis chaque table : ce qui reste est nommé ; une relecture illisible est un reste. Le compte Auth ne part que si rien ne reste (409 sinon, relançable).

**Fail-closed** : fonction SQL absente (migration non appliquée) → échec `objets:rpc`, compte conservé. Ordre de mise en ligne : la migration D'ABORD, la fonction ensuite.

**Le client ne supprime plus rien avant le verdict** (ASTRA-12) : `doDeleteAccount` (app-02) appelle la fonction et lit `ok`. Le bloc de onze `delete()` par RLS qui la précédait effaçait les messages avant que la fonction ne les lise, et laissait un compte à moitié vidé sur un 409.

## Limites connues

- Un objet Storage sans `owner` (déposé par la clé admin, ou antérieur à la plateforme actuelle) n'appartient à personne : il n'est purgé que s'il vit sous un dossier `<dossier>/<uid>/` du seau `content`.
- `client_errors` est purgée par la fonction (colonne `uid`) — si le schéma
  diffère, le DELETE échoue silencieusement sans bloquer la suppression du compte.
