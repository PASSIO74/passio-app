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

---

## 🔴 P0 — Bloquants réels avant ouverture large

### 1. Realtime : chaque client reçoit TOUS les messages 🧑 (dashboard) + 🤖 (diff prêt)

**Symptôme à l'échelle** : `realtime:my_messages` (`app-08-ui-modals-tour.js:1685`)
s'abonne à *tous* les INSERT `conv_messages` et filtre l'appartenance en JS
(`r.from_id === MY_UID`, lookup membership). Coût réseau ∝ trafic total × clients,
et confidentialité dégradée (le message transite chez des non-membres avant filtrage).

**Pourquoi pas corrigé en code seul** : le filtre `postgres_changes` ne supporte
qu'une égalité mono-colonne (`conv_id=eq.X`), pas « conv_id ∈ mes convs ». La
vraie correction est **Realtime Authorization (RLS)** côté serveur.

**Procédure (staged)** :
1. Dashboard → Database → Replication : confirmer que `conv_messages` est dans la
   publication `supabase_realtime` et que la diffusion respecte la RLS (la RLS
   SELECT « membre de la conv » existe déjà).
2. Tester avec **2 comptes réels** (cf. `tests/e2e/multi-comptes.spec.js`,
   `PASSIO_E2E_MULTI=1 npm test`) AVANT toute modif client : un compte C ne
   doit plus recevoir les INSERT d'une conv A↔B.
3. Si la diffusion ne respecte pas encore la RLS, passer le canal en privé :
   ```js
   // app-08, remplacer supa.channel("realtime:my_messages") par :
   supa.channel("conv:" + MY_UID, { config: { private: true } })
   ```
   et ajouter une policy sur `realtime.messages` autorisant l'écoute aux membres.
4. **Garde-fou** : ne livrer le diff client qu'une fois (1)–(2) verts, sinon
   plus aucun message n'est délivré. Le filtrage applicatif actuel reste un
   filet de sécurité fonctionnel correct en attendant.

**Test de régression** : envoi texte + vocal + GIF dans les 2 sens, réception
≤ ~1 s, et un 3ᵉ compte ne reçoit rien.

### 2. État applicatif entièrement dans une clé localStorage 🤖 (gros chantier)

`passio_mvp_state_v1` (`STATE_KEY`, app-02) contient profils + posts + convos.
Plafond ~5 Mo, sérialisation synchrone bloquante.

**Plan** : migrer le stockage volumineux (conversations, posts) vers IndexedDB,
garder en localStorage uniquement un index léger ; s'appuyer sur la pagination
Supabase (déjà en place) comme source de vérité. Migration one-shot au boot
(`if (!localStorage.passio_idb_migrated) { … }`). **Risque élevé** (touche tout
l'état) → à faire isolément, avec sauvegarde/rollback et tests E2E complets.

### 3. Gate d'accès purement client 🧑 (décision produit)

Code `2125` lisible dans le JS, contournable. OK pour filtrer le grand public en
beta (la RLS protège les **données**), mais ce n'est pas de la sécurité d'accès.
Avant ouverture large : vraie auth (email/OAuth Supabase) en remplacement/complément
du gate. Décision produit + intégration onboarding.

---

## 🟠 P1 — Important pendant la montée en charge

### 4. Feed serveur paginé 🤖
Le feed charge les posts puis filtre les « following » en JS
(`app-02 renderFeed`, `allPosts.filter`). À l'échelle : requête serveur paginée
par curseur — `posts` triés `created_at DESC`, `.lt('created_at', cursor).limit(N)`,
filtre `author_id IN (following)` côté SQL. Index déjà présents.

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

### 9. Monitoring & cleanup 🧑
- Alerting sur `client_errors` (la table existe, l'ingestion aussi) : vue
  d'agrégation + notification au-delà d'un seuil.
- Lifecycle Storage : job de nettoyage des médias orphelins (posts/messages supprimés).

---

## Ordre recommandé
**P0.1 (realtime, dashboard d'abord)** → P1.5 (pooling) → P1.4 (feed serveur) →
P0.3 (auth, avant ouverture publique) → P0.2 (IndexedDB) → P2.

Chaque étape : 1 unité cohérente, test E2E vert (`npm run test:all`), puis commit.
