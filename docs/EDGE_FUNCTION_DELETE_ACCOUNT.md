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

## La barrière v2 : ce qui se passe pendant la purge, et après (2026-09-15, cinquième contre-revue)

`migrations/migration_barriere_suppression_2026-09-15.sql` + `purge-compte.js` + `_shared/suppression-compte.js`.

**Pendant.** `purgerCompte` RÉCLAME le compte (`reclamer_suppression(uid, jeton)` — une tentative
vivante à la fois, sérialisée par verrou consultatif), ATTEND les transactions qui avaient franchi
leur policy avant la marque (`attendre_ecritures_en_vol`, `pg_xact_status` sur les xids en cours,
5 s au plus ; s'il en reste, la purge ÉCHOUE), puis efface et relit. Entre-temps un trigger
`zz_barriere_suppression` (BEFORE INSERT OR UPDATE, toutes les tables de `TABLES_COMPTE`, toutes
leurs colonnes d'identifiant, **tous les rôles**) refuse toute ligne portant l'identifiant — celle
de l'appelant, celle d'un tiers (B suit A, B notifie A), l'anonyme (`client_errors`), un trigger
privilégié (`follows_notifier`), la clé de service (`plafond.js`). Le refus a le code et le
message d'un refus RLS (42501) : aucun oracle nouveau. La clause `not suppression_de_mon_compte()`
dans les policies d'écriture (v1) est conservée et étendue aux quatre tables omises (ASTRA-39).

**Fin d'opération, par jeton** (`terminer_suppression`) : `echec` lève la protection (compte
utilisable, purge relançable) ; `purgee` la conserve (le compte Auth doit encore partir) ;
`supprimee` la conserve (rétention). Une tentative tardive avec un autre jeton n'écrit rien
(ASTRA-40) — et une purge dont le jeton a été repris n'est jamais `ok` : `delete-account` ne
supprime pas le compte Auth sur la foi d'une relecture qui n'est plus la sienne.

**Contrat de réponse** (ASTRA-42) — `ok:true` + `garantie:"barriere"` UNIQUEMENT après
`deleteUser` réussi. Sinon `ok:false` et un `code` : `503 infrastructure_absente` (migration non
appliquée : RIEN n'est purgé), `409 deja_en_cours | deja_supprimee | en_vol | incomplete |
jeton_perdu | barriere`, `500 auth_non_supprime` (données purgées, compte Auth resté : protection
conservée, relance possible, la suppression reprend à la purge — idempotente — puis à deleteUser).
Le client (`doDeleteAccount`, app-02) lit le corps même sur non-2xx (`error.context`) et affiche
un message par code ; « Compte supprimé » exige `garantie:"barriere"`.

## La barrière v3 : deux tentatives entrelacées (2026-09-16, ASTRA-56, sixième contre-revue)

Le contre-exemple d'Astra, rejoué avec les vraies fonctions : A pose `purgee` et attend
`deleteUser` ; B réclame et **obtient** le marqueur (la v2 tenait `purgee` pour reprenable) ; B
échoue en vol et pose `echec` : la protection tombe ; une ligne `user_state` passe ; A finit Auth,
son jeton ne finalise plus (`jeton_perime`) — et le handler annonçait `garantie:"barriere"`.
Trois règles, dans la même migration (rejouable sur une base v1 ou v2) :

1. **Une tentative vivante n'est pas reprenable, quel que soit son statut.** `tentative_vivante`
   est posé à la réclamation et reste vrai après `purgee` ; il tombe à un événement terminal ou
   par péremption (15 min ; une fonction Edge vit ~150 s). B reçoit `acquise:false, motif:"vivante"`
   → `409 deja_en_cours`.
2. **La protection d'un compte dont les données sont parties ne se lève jamais.** `echec` demandé
   sur une ligne où `purge_terminee_le` est posé s'écrit `purgee`. Il n'existe plus de transition
   purgee → echec — même si la règle 1 était mutée (banc § ⑤ bis, mutation).
3. **Un échec d'Auth est un événement nommé** (`auth_echec`, `marquerAuthEchec`) : statut `purgee`,
   tentative terminée (reprenable **aussitôt**, sans attendre 15 min), erreur conservée.

Et le handler ne suppose plus rien : `terminer_suppression` rend l'état **écrit** (`statut`,
`protection`, `donnees_deja_purgees`) et c'est lui qui est rapporté. Deux codes de plus :
`500 finalisation_refusee` (compte Auth parti, données purgées, marqueur non finalisé par ce
jeton : `auth_supprimee:true`, `marqueur` = état réel, **pas de `garantie`** ; le client ferme la
session et le local, et le dit tel quel avec le contact) ; et `donnees_purgees:true` sur tout
arrêt d'une reprise (le message ne dit plus « rien n'a été supprimé »). `deleteUser` sur un
utilisateur déjà absent (404) est une reprise après une tentative morte, pas un échec.

Preuves : `tests/sql/migration-barriere-suppression.test.sh` § ⑤ bis (PostgreSQL réel :
entrelacement, tentative interrompue, échec Auth, mutation « purgee reprenable ») ;
`tests/unit/suppression-entrelacement.test.mjs` (vraies fonctions + modèle des transitions v2/v3,
deux tentatives entrelacées par une promesse tenue) ; `tests/e2e/suppression-compte-verdict.spec.js`
⑧⑨ (l'interface).

**Rétention du marqueur** (décision documentée, pas devinée) :
- renouvellement des sessions : s'arrête à `deleteUser` (sessions et jetons de rafraîchissement
  emportés avec `auth.users` — schéma GoTrue, `on delete cascade` ; **non mesuré sur la cible**) ;
- jetons d'accès déjà signés : valides jusqu'à `exp` — durée configurée dans le tableau de bord
  Auth (défaut Supabase 3600 s ; **non mesurée ici**) ; pendant ce temps PostgREST les accepte,
  et c'est le trigger qui refuse ;
- opérations en vol : attendues avant la purge (ci-dessus) ; celles qui commencent après
  relisent la marque à chaque ordre (READ COMMITTED) et sont refusées ;
- restauration / reprise : réinsérer une ligne d'un compte marqué est REFUSÉ par le trigger
  tant que le marqueur existe — c'est voulu (ne pas ressusciter un compte supprimé depuis une
  sauvegarde) et cela apparaît comme un conflit dans le verdict de restauration ;
- règle de purge du marqueur : `purger_marqueurs_suppression(interval)` retire les `supprimee`
  plus vieux que l'intervalle, refuse tout intervalle < 30 jours (durée de vie des artefacts de
  sauvegarde, `sauvegarde.yml`). **Non planifiée** : la durée est une décision du responsable de
  traitement (proposition : 45 jours = 30 jours de sauvegardes + marge). Un uuid seul, sans
  ligne `auth.users`, sans contenu, est ce qui reste entre-temps.

**Ordre de mise en ligne** : la migration D'ABORD (sinon la fonction répond 503 à tout le monde
— c'est l'effet voulu d'ASTRA-42, pas un bug), la fonction ensuite, puis le client. Le staging
doit recevoir la migration avant que `tests/e2e/suppression-compte.spec.js` (qui attend 200)
y tourne contre la nouvelle fonction.

## Limites connues

- Une session ouverte en REPEATABLE READ avant la marque et qui écrit ensuite échappe à la fois à
  l'attente (pas de xid au moment de l'instantané) et à la relecture de la marque (instantané
  figé). PostgREST ne l'offre pas aux clients ; c'est un chemin opérateur (psql), à connaître.
- `attendre_ecritures_en_vol` compte des xids, sous-transactions comprises (savepoints,
  blocs `exception`) : `en_vol_initial` peut dépasser le nombre de requêtes.
- Un objet Storage sans `owner` (déposé par la clé admin, ou antérieur à la plateforme actuelle) n'appartient à personne : il n'est purgé que s'il vit sous un dossier `<dossier>/<uid>/` du seau `content`.
- `client_errors` est purgée par la fonction (colonne `uid`) — si le schéma
  diffère, le DELETE échoue silencieusement sans bloquer la suppression du compte.
