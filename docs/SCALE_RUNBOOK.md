# PASSIO — Runbook montée en charge (2026-06-15)

Plan priorisé pour passer d'une **beta privée** (dizaines d'utilisateurs) à une
**utilisation à grande échelle** (dizaines de milliers). Chaque item indique :
qui l'exécute (🤖 code livré / 🧑 humain au dashboard), le risque, et le test.

Rappel : l'archi vanilla JS + Supabase est parfaitement adaptée à l'échelle
actuelle. Les items ci-dessous corrigent des choix qui marchent à 50 users mais
cassent à 50 000. **Ne pas tout déployer d'un coup** : valider chaque étape.

---

## ✅ Déjà fait (ne pas refaire)

- Index de perf principaux (`migration_indexes_et_monitoring.sql` : posts,
  comments, likes, conv_messages, conv_members, notifications, stories, events).
- Pagination conversations (30/page) + fil + messages (`_loadMoreConvs`, app-04).
- Miniatures CDN + WebP, base64 jamais persisté, vidéo plafonnée à 30 Mo.
- Table `client_errors` + RLS insert-only (monitoring brut).
- RLS par propriétaire sur toutes les tables ; suppression de compte + purge Storage.
- **Index complémentaires** (`migration_scale_v3.sql`, ce lot) : follows(following_id),
  conv_messages(from_id), conv_messages(conv_id, created_at).
- **Feed serveur paginé par curseur** : `supaLoadPosts(offset)` charge par lots de 60
  (`.range`), trié `created_at DESC`, likes + commentaires groupés (pas de N+1),
  colonnes explicites (zéro base64). `loadMoreFeedPosts()` + `_feedServerMayHaveMore`
  recharge à la demande. ⇒ **P1.4 ci-dessous est DÉJÀ FAIT.**

---

## 🔴 P0 — Bloquants réels avant ouverture large

### 1. Realtime : chaque client reçoit TOUS les messages ✅ RÉSOLU — v3 par défaut (2026-06-15)

**Réglé.** Realtime **v3 (topic privé par utilisateur)** déployé et **activé par
défaut**. `migration_realtime_user_topic.sql` appliquée en prod (trigger par membre
+ RLS `realtime.topic()='user:'||auth.uid()`). Client : `_subscribeUserTopic()`
abonné au boot. Scalable + sans course. Validé E2E 2 comptes (`PASSIO_E2E_RT=v3`,
vert). Soupape : `localStorage.passio_realtime_v3="0"` → v1. Détail technique du
parcours v1→v2→v3 conservé ci-dessous.

**Pourquoi pas par défaut** : le test 2 comptes automatisé (`PASSIO_E2E_MULTI=1`)
a révélé une **course** sur les convs créées PENDANT la session. En v2, B reçoit
les messages d'une nouvelle conv en s'abonnant à `conv:<id>` via le handler
`realtime:conv_members` — mais cet abonnement se fait APRÈS que A ait pu diffuser
le 1er message (les broadcasts ne sont pas rejoués) → 1er message perdu. Le
`_backfillConvMessages` atténue mais ne ferme pas la fenêtre. v1 (canal global)
n'a pas ce problème car il reçoit tout.

**Correctif robuste v3 ✅ IMPLÉMENTÉ (opt-in, à valider)** : topic privé **PAR
UTILISATEUR** (`user:<uid>`), abonné UNE fois au boot (stable, pas de course) ; le
trigger diffuse le message au topic perso de **chaque membre** de la conv. Scalable
(chaque client ne reçoit que ses messages) ET sans course.

- SQL : `migrations/migration_realtime_user_topic.sql` (trigger par membre + RLS
  `realtime.topic() = 'user:' || auth.uid()::text` ; supprime le trigger/policy v2).
- Client : `_subscribeUserTopic()` (app-08), branché en priorité dans `supaSubscribe`
  + appel idempotent au SIGNED_IN. `_supaConvSpecificChannel` inerte en v3.
- Flag : `localStorage.passio_realtime_v3 = "1"` (défaut OFF → v1 fiable).

**Pour activer (mise en charge)** :
1. Appliquer `migration_realtime_user_topic.sql` au Dashboard (SQL Editor).
2. Valider en E2E : `PASSIO_E2E_MULTI=1 PASSIO_E2E_RT=v3 npx playwright test multi-comptes`.
3. Si vert : passer le défaut de `PASSIO_REALTIME_V3` à `true` (app-08) + déployer.
4. Garder la soupape `passio_realtime_v2/v3 = "0"`/absent → v1.

Tant que (1)–(2) ne sont pas verts, **garder v1 par défaut**.

<details><summary>Historique de la mise en œuvre (P0.1)</summary>

**Symptôme à l'échelle** : `realtime:my_messages` (`app-08-ui-modals-tour.js:1685`)
s'abonne à *tous* les INSERT `conv_messages` et filtre l'appartenance en JS
(`r.from_id === MY_UID`, lookup membership). Coût réseau ∝ trafic total × clients,
et confidentialité dégradée (le message transite chez des non-membres avant filtrage).

**Pourquoi pas corrigé en code seul** : le filtre `postgres_changes` ne supporte
qu'une égalité mono-colonne (`conv_id=eq.X`), pas « conv_id ∈ mes convs ». La
vraie correction est **Realtime Authorization (RLS)** côté serveur.

**SQL prêt** : `migrations/migration_realtime_authorization.sql` (Broadcast-from-
Database : trigger sur `conv_messages` → topic privé `conv:<id>` + RLS sur
`realtime.messages` réservant l'écoute aux membres). Non destructif.

**Client prêt aussi** ✅ : le code v2 est **déjà implémenté** (app-08
`_subscribePrivateConv` + `_handleIncomingConvMessage` factorisé ; app-04
`_supaConvSpecificChannel` ; abonnement à l'ajout dans une conv), **derrière le
flag `window.PASSIO_REALTIME_V2` (false par défaut)**. En v1 ce code est inerte —
prod inchangée. Il ne reste qu'à appliquer le serveur puis flipper le flag.

**Procédure (staged)** — faire dans l'ordre, sinon plus aucun message livré :
1. Appliquer `migration_realtime_authorization.sql` au Dashboard (SQL Editor).
2. Dashboard → Database → Realtime : activer **Realtime Authorization**.
3. Passer `window.PASSIO_REALTIME_V2 = true` (une ligne, app-08 ou avant boot).
4. Tester avec **2 comptes réels** (`PASSIO_E2E_MULTI=1 npm test`) : réception
   ≤ ~1 s, texte + vocal + GIF dans les 2 sens, **et un 3ᵉ compte ne reçoit rien**.
5. Une fois (1)–(4) verts en prod, supprimer le canal global `realtime:my_messages`
   du `else` (v1) et nettoyer. **Garde-fou** : ne jamais retirer le canal v1 avant
   que v2 soit validé en prod.
</details>

### 2. État volumineux dans localStorage ✅ FAIT pour les conversations (2026-06-15)

Le plus gros volume (les **conversations + messages**, `passio_conversations_v1`,
y compris vocaux base64) est désormais persisté dans **IndexedDB** (store durable,
sans limite ~5 Mo) via `js/idb-store.js` :
- write-through à chaque `saveConversations`/`saveConversationsNow` (app-04) ;
- localStorage conservé en chemin sync rapide (toléré à échouer sur quota — plus
  de perte, IDB a tout) ;
- au boot, `hydrateConvsFromIDB()` (en tête de `boot()`) restaure depuis IDB et
  **fusionne sans perte** (union par id + messages par id) avec localStorage/seed/
  Supabase ; migration initiale automatique localStorage → IDB.

Vérifié : write-through + récupération (localStorage effacé → restauration complète
depuis IDB, messages inclus).

**Reste optionnel** (non bloquant) : `STATE_KEY` (profils, posts perso, notifs)
reste en localStorage — beaucoup plus léger (le base64 y est déjà strippé par
`saveState`). Le déplacer vers IDB aussi serait un confort, pas une urgence.

### 3. Auth ✅ DURCIE (2026-06-15) — gate beta conservé

L'auth email/mot de passe existait déjà (`onbDoAuth`). Ajouté le 2026-06-15 :
- **Compte obligatoire** : retrait du bouton « Continuer sans compte » (anonyme).
  Les sessions anonymes existantes continuent de fonctionner ; seuls les NOUVEAUX
  arrivants doivent créer/connecter un compte.
- **Mot de passe oublié** : `onbForgotPassword` (`resetPasswordForEmail`) + UI de
  nouveau mot de passe `_showPasswordRecoveryUI` déclenchée par l'événement
  `PASSWORD_RECOVERY` / `type=recovery` dans l'URL (`updateUser`).
- **Google OAuth** : `onbGoogleAuth` (`signInWithOAuth`), retour finalisé au boot
  via le flag `passio_oauth_pending` (marque onboardé + profil par défaut).

**🧑 Étape dashboard requise pour Google** : Supabase → Authentication → Providers
→ activer **Google** (client ID/secret OAuth Google Cloud) + ajouter l'URL de
redirection du site dans les Redirect URLs autorisées. Tant que ce n'est pas fait,
le bouton affiche une erreur propre (aucun crash).

Le **gate beta (2125) reste en place** (choix produit). À retirer seulement à
l'ouverture grand public.

---

## 🟠 P1 — Important pendant la montée en charge

### 4. Feed serveur paginé ✅ DÉJÀ FAIT
`supaLoadPosts(offset)` (app-08) charge par lots de 60 via `.range`, trié
`created_at DESC`, likes + commentaires groupés (pas de N+1), colonnes explicites.
`loadMoreFeedPosts()` recharge à la demande. Reste éventuel : filtre `author_id IN
(following)` côté SQL plutôt qu'en JS quand le nombre de suivis devient grand —
optimisation mineure, pas un bloquant.

### 5. Connection pooling ✅ DÉJÀ ACTIF (vérifié dashboard 2026-06-15)
Le pooler Supavisor est **activé par défaut** : Connection poolers SHARED, pool de
15 connexions backend, **200 clients simultanés** (limites de la compute Nano). Le
client PWA passe par PostgREST (REST), automatiquement poolé. **Rien à faire en
code.** Pour aller au-delà de 200 clients concurrents → monter la compute tier
(Nano → Small/Medium…), qui relève automatiquement ces limites (décision billing).

### 6. Insert messages : double-insert ✅ REVU — gardé volontairement
Le pattern « avec from_id, sinon sans » (sendMessageFp, sendMessageToSupabase,
_sendGif, shareLocation) ne déclenche le 2ᵉ insert **que sur erreur** (jamais dans
le chemin nominal). Le retirer = zéro gain utilisateur tout en touchant le chemin
critique d'envoi sur une app en prod. **Décision : conservé** comme filet de
sécurité inoffensif (coût nul en fonctionnement normal).

---

## 🟡 P2 — Confort / coûts

### 7. Code-splitting ⏸️ DIFFÉRÉ VOLONTAIREMENT (rapport risque/gain défavorable)
Le bundle app (9 fichiers `app-*.js`) repose sur le **hoisting inter-fichiers**
(CLAUDE.md : « NE PAS réordonner ») → un lazy-load casserait les dépendances. Le
bundle est déjà chargé en **fin de `<body>`** (ne bloque pas le rendu initial), et
le transfert prod est ~201 Ko brotli. Gain TTI réel marginal pour un risque élevé.
À ne revisiter que si un audit Lighthouse mobile l'exige réellement.

### 8. Proxy GIF avec cache serveur ⏸️ DIFFÉRÉ (marginal à l'échelle actuelle)
Le client utilise Tenor/Giphy avec clé partagée + cache 10 min par onglet — suffisant
tant qu'on n'a pas un volume massif de recherches GIF. Si le quota de la clé devient
un point de contention : Edge Function `gif-search` (cache edge) + le client appelle
la fonction au lieu de l'API directe. Approche prête, à construire au besoin.

### 9. Monitoring & cleanup ✅ FAIT (2026-06-15)
- **Vues d'agrégation** : `migration_monitoring_view.sql` (`client_errors_top_24h`,
  `client_errors_par_heure` + index) — appliquées en prod.
- **Médias orphelins réglés À LA SOURCE** : `deletePost` (app-04) supprime désormais
  l'objet Storage associé (image/vidéo/audio/cover) à la suppression d'un post —
  best-effort, plus d'accumulation de fichiers orphelins. La suppression de compte
  purgeait déjà tout le Storage de l'utilisateur (`delete-account`).
- Reste (optionnel) : alerting automatique au-delà d'un seuil (scheduled Edge
  Function lisant `client_errors_top_24h` + webhook/mail) — confort, non bloquant.

---

## État P0/P1/P2 (2026-06-15)
- **P0** : tous faits et déployés (realtime v3, IndexedDB, auth).
- **P1** : feed paginé ✅, pooling ✅ (par défaut), double-insert ✅ (gardé).
- **P2** : monitoring + cleanup orphelins ✅ ; code-splitting et proxy GIF différés
  volontairement (gain marginal / risque), prêts à construire si le besoin réel apparaît.

Chaque étape : 1 unité cohérente, test E2E vert (`npm run test:all`), puis commit.
