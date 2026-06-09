# 🚀 INSTRUCTIONS DE DÉPLOIEMENT — AUDIT PARTAGE

## 📋 PRÉREQUIS

- Accès au dashboard Supabase (https://supabase.com/dashboard)
- Accès au repo GitHub (pour push les changements)
- Accès à Netlify (déploiement auto)

---

## ÉTAPE 1: Exécuter les migrations SQL

### 1.1 Migration: Ajouter les colonnes de repost

1. Aller à: **https://supabase.com/dashboard/project/njkiyoklssvefstljemx/sql**
2. Créer une nouvelle query → Copier le contenu de:
   ```
   migration_add_repost_support.sql
   ```
3. Exécuter ✅
4. Vérifier dans l'onglet **Table Editor** que les colonnes sont ajoutées:
   - `posts` → `shared_from_post_id` (TEXT)
   - `posts` → `shared_data` (JSONB)

### 1.2 Migration: Corriger les RLS policies

1. **Supabase dashboard SQL** → Nouvelle query
2. Copier le contenu de:
   ```
   migration_fix_rls_policies.sql
   ```
3. Exécuter ✅
4. Vérifier dans l'onglet **Authentication** → **Policies** que les policies sont mises à jour

**Attention:** Cette migration DROP et RE-CREATE les policies. Vérifier qu'aucune erreur n'apparaît.

---

## ÉTAPE 2: Déployer le code JavaScript

### 2.1 Push vers le repo Git

```bash
cd /path/to/PASSIO
git add index.html AUDIT_SHARING_FIXES.md AUDIT_EXECUTIVE_SUMMARY.md \
  migration_add_repost_support.sql migration_fix_rls_policies.sql \
  DEPLOY_INSTRUCTIONS.md
git commit -m "audit: add repost/sharing support + fix RLS policies"
git push origin main
```

### 2.2 Vérifier le déploiement Netlify

- Aller à: https://app.netlify.com/sites/passio-app/deploys
- Vérifier que le déploiement a commencé ✅
- Attendre ~2-3 minutes
- Vérifier que le déploiement est réussi (vert) ✅

### 2.3 Vérifier en production

- Ouvrir: https://passio-app.netlify.app
- Console JS (F12) → Pas d'erreurs ✅
- Feed → Posts affichés ✅

---

## ÉTAPE 3: Tests

### Test 1: Partage basique → Visibilité multi-account

**Setup:**
- Compte A: Aller à https://passio-app.netlify.app
- Compte B: Ouvrir un autre onglet/window incognito

**Steps:**

1. **Compte A:**
   - Créer un post (texte, photo, vidéo, etc.)
   - Post visible immédiatement ✅

2. **Compte A:**
   - Appuyer sur "🔁 Partager" (bouton de partage du post)
   - Modal s'ouvre
   - Appuyer sur "➕ Partager dans le Feed"
   - Toast: "✅ Bobine partagée dans ton feed!" ✅
   - Toast optionnel: "⏱️ Post en local..." → "✅ Post publié!" (sync background)

3. **Compte B (MÊME DEVICE):**
   - Rafraîchir le feed (F5)
   - **AVANT les fixes:** Voir le post original MAIS pas le repost ❌
   - **APRÈS les fixes:** Voir BOTH le post original ET le repost ✅
   - Vérifier que le repost a le texte "📤 A partagé une bobine..."

4. **Compte B (AUTRE DEVICE):**
   - Ouvrir passio-app.netlify.app dans un NAVIGATEUR DIFFÉRENT
   - Attendez la synchro (~10s)
   - Vérifier:
     - Post original visible ✅
     - Post repost visible ✅ **← NOUVEAU**
   - ✅ **TEST RÉUSSI** si le repost apparaît!

### Test 2: RLS policies (Sécurité)

**Vérifier que les RLS policies fonctionnent:**

1. **Vérifier les INSERT continuent de marcher:**
   - Compte A: Créer un post normal
   - Post s'insère sans erreur ✅

2. **Vérifier qu'on NE PEUT PAS usurper l'identité:**
   - Console JS (F12)
   - Copier-coller:
     ```javascript
     const { data, error } = await supa.from("posts").insert({
       id: "test_" + Date.now(),
       author_id: "u_lea",  // Prétendre être quelqu'un d'autre
       passion_id: "cuisine",
       mood: "chill",
       content: "I am hacking!",
       created_at: new Date().toISOString()
     });
     console.log("Error:", error?.message);
     ```
   - **AVANT les fixes:** `error` sera `null` (hack réussi) ❌
   - **APRÈS les fixes:** `error` sera "Permission denied" ou "Row-level security policy violation" ✅
   - ✅ **TEST RÉUSSI** si l'erreur apparaît!

### Test 3: Feed filtering (Passion/Mood)

1. **Publier plusieurs posts avec différentes passions:**
   - Post A: Passion "cuisine"
   - Post B: Passion "voyage"
   - Post C: Passion "musique"

2. **Partager un post:**
   - Ex: Partager le Post A (cuisine)
   - Le repost doit avoir la passion "cuisine"

3. **Filtrer par passion:**
   - Cliquer sur "Passion" dans le feed
   - Sélectionner "cuisine"
   - Vérifier:
     - Post A visible ✅
     - Repost A visible ✅ (hérite de la passion du Post A)
   - Sélectionner "voyage"
   - Vérifier:
     - Post B visible ✅
     - Post C visible ✅
     - Repost A NOT visible ✅

---

## ÉTAPE 4: Rollback (SI PROBLÈME)

Si les tests échouent, rollback rapidement:

### Rollback Git:
```bash
git revert HEAD
git push origin main
# Netlify redéploie auto après ~2 min
```

### Rollback Supabase (si migration cassée):
- Exécuter dans le SQL Editor:
  ```sql
  -- Drop the new columns if needed
  ALTER TABLE posts DROP COLUMN IF EXISTS shared_from_post_id;
  ALTER TABLE posts DROP COLUMN IF EXISTS shared_data;
  ```
- Re-créer les policies originales si besoin

---

## ✅ CHECKLIST FINAL

- [ ] Migration #1 exécutée (colonnes ajoutées)
- [ ] Migration #2 exécutée (RLS policies corrigées)
- [ ] Code déployé vers main (Netlify auto-deploy)
- [ ] Test 1: Partage → Visibilité multi-account ✅
- [ ] Test 2: RLS policies bloquent l'usurpation ✅
- [ ] Test 3: Feed filtering fonctionne ✅
- [ ] Console JS: Pas d'erreurs critiques ✅
- [ ] Notifications Supabase: Status normal ✅

---

## 📞 TROUBLESHOOTING

### Symptôme: "Post partagé n'apparaît pas sur Compte B"
**Solutions:**
1. Vérifier que la migration #1 a été exécutée ✅
2. Vérifier que le Compte A voit le repost localement ✅
3. Rafraîchir le feed (F5) ✅
4. Attendre ~10 secondes (auto-refresh) ✅
5. Vérifier la console (F12) pour les erreurs ✅

### Symptôme: "INSERT génère une erreur 'Permission denied'"
**Solutions:**
1. Vérifier que les migrations RLS ont été exécutées ✅
2. Vérifier que `auth.uid()` retourne une valeur non-null ✅
3. Vérifier les policies dans l'onglet **Authentication** → **Policies** ✅

### Symptôme: "Netlify déploiement échoue"
**Solutions:**
1. Vérifier les logs Netlify: https://app.netlify.com/sites/passio-app/deploys ✅
2. Vérifier que `index.html` est valide (pas de syntaxe cassée) ✅
3. Vérifier que pas d'autre commit n'a créé de conflit ✅

---

## 🎯 OBJECTIFS RÉUSSIS

Si tous les tests passent ✅:
- ✅ Posts partagés synchro multi-account
- ✅ Posts partagés synchro multi-device
- ✅ RLS policies empêchent l'usurpation
- ✅ Feed filtering fonctionne correctement
- ✅ Aucune régression sur les fonctionnalités existantes

---

**Durée estimée:** ~15 minutes (migrations + tests)

**Risque:** Très faible (les migrations créent des colonnes optionnelles, les policies sont compatibles)

**Support:** Consultez `AUDIT_SHARING_FIXES.md` pour les détails techniques
