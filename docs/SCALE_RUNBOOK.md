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

### 1. Realtime : chaque client reçoit TOUS les messages ✅ DÉPLOYÉ (2026-06-15)

**Réglé.** `migration_realtime_authorization.sql` appliquée en prod (trigger +
RLS `realtime.messages` active, vérifiée). Client v2 (`PASSIO_REALTIME_V2`)
**activé par défaut** : chaque client s'abonne à un canal privé `conv:<id>` par
conversation. Validé par test 2 comptes réels (texte/GIF/vocal dans les 2 sens).
Soupape : `localStorage.passio_realtime_v2 = "0"` → fallback v1. Historique
ci-dessous conservé pour mémoire.

---
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

### 3. Gate d'accès purement client 🧑 (décision produit)

Code `2125` lisible dans le JS, contournable. OK pour filtrer le grand public en
beta (la RLS protège les **données**), mais ce n'est pas de la sécurité d'accès.
Avant ouverture large : vraie auth (email/OAuth Supabase) en remplacement/complément
du gate. Décision produit + intégration onboarding.

---

## 🟠 P1 — Important pendant la montée en charge

### 4. Feed serveur paginé ✅ DÉJÀ FAIT
`supaLoadPosts(offset)` (app-08) charge par lots de 60 via `.range`, trié
`created_at DESC`, likes + commentaires groupés (pas de N+1), colonnes explicites.
`loadMoreFeedPosts()` recharge à la demande. Reste éventuel : filtre `author_id IN
(following)` côté SQL plutôt qu'en JS quand le nombre de suivis devient grand —
optimisation mineure, pas un bloquant.

### 5. Connection pooling 🧑
Dashboard → Database → Connection pooling : activer **PgBouncer (mode transaction)**
et viser l'endpoint *pooler* pour encaisser la concurrence (Edge Functions + clients).

### 6. Insert messages : retirer le double-insert quand la RLS v2 est stable 🤖
Le pattern « avec from_id, sinon sans » (sendMessageFp, sendMessageToSupabase,
_sendGif, shareLocation) garde un fallback. Le chemin nominal réussit au 1er essai ;
le fallback ne coûte que sur erreur. Quand la RLS v2 est confirmée stable partout,
simplifier en un seul insert (avec from_id) + gestion d'erreur, sans 2ᵉ requête.

---

## 🟡 P2 — Confort / coûts

### 7. Code-splitting 🤖
Monolithe JS (~1 Mo non minifié) chargé d'un bloc. Charger en lazy les écrans non
critiques (studio, IRL, IA). Sans bundler : `import()` dynamique ou injection de
`<script>` à la première navigation vers l'écran. Réduit le TTI mobile.

### 8. Proxy GIF avec cache serveur 🤖+🧑
La clé Giphy est partagée par tous les clients (quota commun) et le cache 10 min
est par-onglet. Edge Function `gif-search` (cache KV/edge), client appelle la
fonction au lieu de Giphy en direct. Bénéfice marginal en beta, utile à l'échelle.

### 9. Monitoring & cleanup 🤖+🧑
- **Vues d'agrégation livrées** : `migration_monitoring_view.sql`
  (`client_errors_top_24h`, `client_errors_par_heure` + index). À appliquer au
  dashboard, puis brancher une scheduled Edge Function pour l'alerting au-delà
  d'un seuil (Supabase n'a pas d'alerting natif sur vue).
- Lifecycle Storage : job de nettoyage des médias orphelins (posts/messages supprimés).

---

## Ordre recommandé
**P0.1 (realtime, dashboard d'abord)** → P1.5 (pooling) → P1.4 (feed serveur) →
P0.3 (auth, avant ouverture publique) → P0.2 (IndexedDB) → P2.

Chaque étape : 1 unité cohérente, test E2E vert (`npm run test:all`), puis commit.
