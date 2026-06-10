# 🔍 AUDIT: Partage/Sharing System — FIXES APPLIQUÉS

## 📋 RÉSUMÉ DU PROBLÈME

**Symptôme critique:** Les posts partagés ne s'affichaient pas sur d'autres comptes/appareils.

**Cause racine:** 
1. ❌ `shareReelInFeed()` créait un post local mais **NE LE PUBLIAIT JAMAIS** sur Supabase
2. ❌ La table `posts` n'avait **AUCUNE colonne** pour enregistrer qu'un post est un repost
3. ❌ Les RLS policies étaient trop permissives (`WITH CHECK (true)` = n'importe quel `author_id`)

---

## ✅ FIXES APPLIQUÉS

### FIX #1: Publier les posts partagés à Supabase ⭐ CRITIQUE

**Fichier:** `index.html`, ligne ~15830
**Changement:** Ajout de code pour synchroniser les posts partagés avec Supabase après `shareReelInFeed()`

```javascript
// 🔄 SYNC with Supabase (shared posts must be persisted!)
if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
  try {
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => {
        console.warn("⏱️ [SHARE] Timeout sync (3s)");
        resolve(false);
      }, 3000)
    );
    const syncPromise = supaPublishPostWithRetry(newPost);
    const syncSuccess = await Promise.race([syncPromise, timeoutPromise]);
    if (syncSuccess) {
      console.log("✅ [SHARE] Shared post synced to Supabase");
    } else {
      console.warn("⚠️ [SHARE] Shared post sync timeout - local only");
    }
  } catch (e) {
    console.warn("⚠️ [SHARE] Sync error:", e.message);
  }
}
```

**Impact:** Les posts partagés vont maintenant être publiés à Supabase en background, comme les posts normaux.

---

### FIX #2: Enregistrer les données du repost dans Supabase

**Fichier:** `index.html`, ligne ~20755
**Changement:** Adapter `supaPublishPostWithRetry()` pour enregistrer les colonnes de repost

```javascript
const postData = {
  id: post.id,
  author_id: MY_UID,
  passion_id: post.passion || null,
  mood: post.mood || "all",
  content: post.text || "",
  media_url: mediaUrl,
  created_at: new Date(post.createdAt).toISOString(),
  // 🔄 Ajouter les champs de repost si applicable
  ...(post.sharedReel && { shared_from_post_id: post.sharedReel }),
  ...(post.sharedReelData && { shared_data: JSON.stringify(post.sharedReelData) }),
};
```

**Impact:** Les données du repost seront sauvegardées correctement dans les colonnes `shared_from_post_id` et `shared_data`.

---

### FIX #3: Charger les reposts depuis Supabase

**Fichier:** `index.html`, ligne ~20988
**Changement:** Parser les données du repost quand on charge les posts depuis Supabase

```javascript
...(r.shared_from_post_id && { sharedReel: r.shared_from_post_id }),
...(r.shared_data && { sharedReelData: (() => {
  try {
    return typeof r.shared_data === 'string' ? JSON.parse(r.shared_data) : r.shared_data;
  } catch(e) {
    console.warn("Failed to parse shared_data:", e);
    return null;
  }
})() }),
```

**Impact:** Les posts partagés chargés depuis Supabase seront complètement reconstitués avec les données du post original.

---

### FIX #4: Ajouter les colonnes Supabase (MIGRATION)

**Fichier créé:** `migration_add_repost_support.sql`

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_from_post_id TEXT DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_data JSONB DEFAULT NULL;
```

**À exécuter:** Dans le dashboard Supabase → SQL Editor, copier-coller le contenu de `migration_add_repost_support.sql`

---

### FIX #5: Corriger les RLS policies (Recommandé)

**Fichier créé:** `migration_fix_rls_policies.sql`

**Problème actuel:**
```sql
CREATE POLICY "Ecriture propre"  ON posts FOR INSERT WITH CHECK (true);
```
✅ Permet à **N'IMPORTE QUI** de créer des posts avec **N'IMPORTE QUEL** `author_id`
→ Un utilisateur peut créer des posts en prétendant être quelqu'un d'autre

**Fix:**
```sql
CREATE POLICY "Ecriture propre"  ON posts FOR INSERT WITH CHECK (author_id = auth.uid());
```
✅ N'autorise que `author_id = auth.uid()` (l'utilisateur connecté)

**À exécuter:** `migration_fix_rls_policies.sql` dans le dashboard Supabase

---

## 🧪 ÉTAPES POUR TESTER (Multi-account, Multi-device)

### Test 1: Partage basique → Multi-account
1. **Compte A:** Créer un post normal (ex: texte, photo, vidéo)
   - Visible immédiatement dans le feed local ✅
   - Synchronisé à Supabase en background ✅
   
2. **Compte A:** Appuyer sur "🔁 Partager" (bouton Reel/Post)
   - Le modal de partage s'ouvre
   - Sélectionner "➕ Partager dans le Feed"
   - Toast: "✅ Bobine partagée dans ton feed!" ✅
   - **NOUVEAU:** Toast de sync: "⏳ Post en local..." ou "✅ Post publié!" ✅
   
3. **Compte B (même device):** Aller au Feed
   - Voir le post original de Compte A ✅
   - Voir le post partagé par Compte A (avec "📤 A partagé une bobine...") ✅
   
4. **Compte B (AUTRE device):** 
   - Ouvrir l'app dans un navigateur différent
   - Rafraîchir le feed
   - Voir le post original ✅
   - Voir le post partagé ✅ **← NOUVEAU, ne fonctionnait pas avant**

### Test 2: Feed filtering (Passion/Mood)
1. Publier des posts avec différentes passions/moods
2. Partager un post
3. Vérifier que le post partagé:
   - Porte la bonne passion ✅
   - S'affiche quand on filtre par cette passion ✅
   - S'affiche dans les posts "partagés par moi" ✅

### Test 3: Offline → Online
1. **Offline:** Créer et partager un post en mode hors-ligne
2. **Online:** Activer la connexion
3. Vérifier que le post partagé se synchronise ✅

---

## 🔧 CONFIGURATION REQUISE (TODO)

### Avant de déployer en production:

1. **✅ Code JS:** Modifications appliquées à `index.html`
2. **⏳ Supabase Migration #1:** Exécuter `migration_add_repost_support.sql`
   - Ajoute les colonnes `shared_from_post_id` et `shared_data` à la table `posts`
3. **⏳ Supabase Migration #2 (Sécurité):** Exécuter `migration_fix_rls_policies.sql`
   - Corrige les RLS policies pour empêcher la création de posts avec un `author_id` usurpé

### Commands pour Supabase CLI:
```bash
# Créer les migrations
supabase migration new add_repost_support
supabase migration new fix_rls_policies

# Exécuter les migrations
supabase migration up
```

---

## 📊 IMPACT ATTENDU

### Avant les fixes:
- ❌ Posts partagés restent locaux
- ❌ Impossible de voir les reposts sur d'autres appareils
- ❌ N'importe quel utilisateur peut créer des posts avec un autre `author_id`

### Après les fixes:
- ✅ Posts partagés se publient à Supabase automatiquement
- ✅ Reposts visibles sur tous les appareils et comptes
- ✅ Les RLS policies empêchent l'usurpation d'identité
- ✅ Multi-account, multi-device sync fonctionne parfaitement

---

## 🚨 NOTES DE SÉCURITÉ

**⚠️ AVANT les migrations RLS:**
- N'importe quel utilisateur peut créer des posts avec un `author_id` usurpé via la console JavaScript
- Exemple: `supa.from("posts").insert({ id: uid(), author_id: "u_lea", content: "..." })` = OK ❌

**✅ APRÈS les migrations RLS:**
- Seul `auth.uid()` peut être utilisé comme `author_id` lors de l'insertion
- Tentative d'usurpation = "Permission denied" de Supabase ✅

---

## 📝 SCHÉMA DE DONNÉES FINAL

### Table `posts` (après migration)
```sql
id                  TEXT PRIMARY KEY
author_id           TEXT           ← Sujet à RLS (doit = auth.uid() pour INSERT)
passion_id          TEXT
mood                TEXT DEFAULT 'all'
content             TEXT
media_url           TEXT
created_at          TIMESTAMPTZ DEFAULT NOW()
shared_from_post_id TEXT DEFAULT NULL  ← ✨ NOUVEAU: ID du post original si repost
shared_data         JSONB DEFAULT NULL ← ✨ NOUVEAU: Données du post original en JSON
```

---

## 🎯 PROCHAINES ÉTAPES

1. **Exécuter les migrations SQL** dans le dashboard Supabase
2. **Tester les 3 scénarios ci-dessus** sur passio-app.netlify.app
3. **Valider que les RLS policies ne cassent rien** (vérifier que les INSERT/UPDATE/DELETE continuent de fonctionner)
4. **Déployer vers Netlify** (le code JS est déjà en place)
5. **Vérifier en production** avec multi-account, multi-device

---

## 📋 CHECKLIST FINAL

- [ ] Migrations SQL exécutées (add_repost_support + fix_rls_policies)
- [ ] Code JS deploye à Netlify
- [ ] Test 1: Partage basique → visibilité multi-account ✅
- [ ] Test 2: Feed filtering (passion/mood) ✅
- [ ] Test 3: Offline → online sync ✅
- [ ] Vérification RLS: INSERT/UPDATE/DELETE toujours OK ✅
- [ ] Vérification: Impossible de créer un post avec un `author_id` usurpé ✅

---

**Audit complété:** 2026-06-09
**Auditor:** Senior Full-Stack Developer (Claude)
**Status:** ✅ Fixes appliqués, en attente d'exécution des migrations SQL
