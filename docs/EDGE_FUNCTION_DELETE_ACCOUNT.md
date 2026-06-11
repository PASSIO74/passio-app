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

## Limites connues

- Les fichiers Storage (bucket `attachments`, médias des posts) ne sont pas purgés :
  les chemins ne contiennent pas l'uid de façon fiable. À traiter plus tard
  (politique de rétention ou job de nettoyage des orphelins).
- `client_errors` est purgée par la fonction (colonne `uid`) — si le schéma
  diffère, le DELETE échoue silencieusement sans bloquer la suppression du compte.
