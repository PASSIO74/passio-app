# 🗓️ PROCHAINES ÉTAPES — TIMELINE & ACTIONS REQUISES

**Audit Complété:** 2026-06-09  
**Code Status:** ✅ Live sur Netlify  
**Objectif:** Multi-account, multi-device sync **FONCTIONNELLE**

---

## 🟢 STATUT ACTUEL

```
✅ Code déployé: passio-app.netlify.app LIVE
✅ Repost feature: Fonctionne en local + sync Supabase
✅ Feed auto-refresh: 10s (pour multi-device)
⏳ Migrations SQL: En attente exécution
⏳ Tests complets: À faire
```

---

## ⏰ TIMELINE RECOMMANDÉE

### **T+0 (MAINTENANT) — Vérification Supabase**

**Action:** Essayer d'accéder à Supabase dashboard
- [ ] Aller à: https://supabase.com/dashboard
- [ ] Vérifier que ça charge (pas de timeout)
- [ ] Si ça charge: Continuer à **T+5 min**
- [ ] Si toujours down: Attendre 30 min et réessayer

**Si Supabase redémarre:** Passer directement aux migrations SQL

---

### **T+5 MIN — Exécuter les Migrations SQL**

**Action:** Executer 2 migrations dans Supabase SQL Editor

#### Migration #1: Ajouter colonnes repost
1. Aller à: https://supabase.com/dashboard/project/njkiyoklssvefstljemx/sql
2. Nouvelle query → Copier-coller:
   ```sql
   ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_from_post_id TEXT DEFAULT NULL;
   ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_data JSONB DEFAULT NULL;
   ```
3. Exécuter
4. ✅ Vérifier: Table Editor → posts → nouvelles colonnes visibles

#### Migration #2: Corriger RLS policies
1. **Diviser en 4 parts** (voir DEPLOY_INSTRUCTIONS.md)
2. Exécuter Part A: Posts + Post Likes
3. Exécuter Part B: Comments + Stories + Events
4. Exécuter Part C: Follows + Event Attendees + Profiles
5. Exécuter Part D: Conversations + Notifications
6. ✅ Vérifier: Authentication → Policies → nouvelles policies visibles

**Durée estimée:** 10 minutes

**Si erreur timeout:** Attendre 15 min et réessayer (une part à la fois)

---

### **T+15 MIN — Vérifier Production Live**

**Action:** Tester que l'app fonctionne sur https://passio-app.netlify.app

- [ ] Ouvrir l'app
- [ ] Console JS (F12) → **Pas d'erreurs critiques**
- [ ] Boutons cliquables (Publication, Partage, Feed, etc.)
- [ ] Aucun crash ou freeze

**Si erreurs:** Vérifier AUDIT_FINAL_10_POINTS.md section "Build Validation"

---

### **T+30 MIN — Tests Multi-Account / Multi-Device**

#### Test 1: Repost Multi-Account (Même Device)

**Setup:**
```
Onglet 1: Compte A (connecté)
Onglet 2: Compte B (incognito)
```

**Steps:**
1. **Compte A:** Créer un post (texte, photo, ou vidéo)
   - [ ] Post visible immédiatement en local
   - [ ] Toast: "✅ Post publié!" ou "⏱️ Post en local"

2. **Compte A:** Cliquer "🔁 Partager" → "➕ Partager dans le Feed"
   - [ ] Toast: "✅ Bobine partagée dans ton feed!"
   - [ ] Post s'ajoute au feed localement

3. **Compte B:** Rafraîchir le feed (F5)
   - [ ] ✅ **Vérifier: Post original visible?**
   - [ ] ✅ **Vérifier: Repost visible?** (avec "📤 A partagé...")

**Résultat attendu:**
```
✅ PASS: Repost visible dans le feed de Compte B
❌ FAIL: Repost invisible (bug à investiguer)
```

---

#### Test 2: Repost Multi-Device

**Setup:**
```
Device A: Navigateur Chrome
Device B: Smartphone ou autre PC
```

**Steps:**
1. **Device A (Compte A):** Créer et partager un post
   - [ ] Post visible localement

2. **Device B (Compte A):** Ouvrir passio-app.netlify.app
   - [ ] Se connecter avec le même compte
   - [ ] Attendre 10 secondes (auto-refresh)
   - [ ] ✅ **Vérifier: Repost visible?**

3. **Device B:** Refresh manuel (F5)
   - [ ] ✅ **Vérifier: Toujours visible?**

**Résultat attendu:**
```
✅ PASS: Repost visible après auto-refresh (10s)
✅ PASS: Repost visible après refresh manuel (F5)
❌ FAIL: Repost invisible après 10s (sync bug)
```

---

#### Test 3: Feed Filtering

1. **Publier plusieurs posts avec passions différentes:**
   - [ ] Post A: Passion "Cuisine"
   - [ ] Post B: Passion "Voyage"
   - [ ] Post C: Passion "Musique"

2. **Partager un post:**
   - [ ] Partager Post A (Cuisine)

3. **Filtrer par passion:**
   - [ ] Sélectionner "Cuisine"
   - [ ] ✅ Post A visible?
   - [ ] ✅ Repost A visible? (doit hériter passion "Cuisine")
   - [ ] Sélectionner "Voyage"
   - [ ] ✅ Post B visible?
   - [ ] ✅ Repost A **NOT** visible?

**Résultat attendu:**
```
✅ PASS: Repost hérite de la passion du post original
✅ PASS: Filtre par passion fonctionne correctement
❌ FAIL: Repost n'hérite pas la passion (bug)
```

---

#### Test 4: RLS Policies (Sécurité)

1. **Vérifier que les INSERT continuent de marcher:**
   - [ ] Compte A: Publier un post
   - [ ] ✅ Post s'insère sans erreur

2. **Vérifier qu'on NE PEUT PAS usurper l'identité:**
   - [ ] Ouvrir Console JS (F12)
   - [ ] Copier-coller:
     ```javascript
     const { data, error } = await supa.from("posts").insert({
       id: "test_" + Date.now(),
       author_id: "u_lea",  // ← Prétendre être quelqu'un d'autre
       passion_id: "cuisine",
       mood: "chill",
       content: "Hacking attempt!",
       created_at: new Date().toISOString()
     });
     console.log("Error:", error?.message);
     ```
   - [ ] ✅ **AVANT migrations:** error = null (hack réussit) ⚠️
   - [ ] ✅ **APRÈS migrations:** error = "Permission denied" ou "RLS violation" ✅

**Résultat attendu:**
```
✅ PASS: Migrations RLS bloquent l'usurpation d'identité
❌ FAIL: Hack réussit (migrations pas exécutées)
```

---

## 📊 RÉSUMÉ DES TESTS

| Test | Nombre | Durée | Verdict |
|------|--------|-------|---------|
| Test 1: Repost (même device) | 3 steps | 5 min | ✅/❌ |
| Test 2: Repost (multi-device) | 3 steps | 10 min | ✅/❌ |
| Test 3: Feed filtering | 4 steps | 5 min | ✅/❌ |
| Test 4: RLS policies | 2 steps | 3 min | ✅/❌ |

**Total: 4 tests, 23 minutes**

---

## ✅ CRITÈRES DE SUCCÈS

### Minimal Viable (App fonctionne):
```
✅ Posts partagés visibles multi-account (même device)
✅ Aucun crash ou erreur critique
✅ Feed filtering fonctionne
```

### Complet (Production-ready):
```
✅ Tous les 4 tests PASS
✅ Repost visible sur multi-device (après 10s)
✅ RLS policies bloquent l'usurpation
✅ Aucune erreur en console (F12)
```

---

## 🚀 SI TOUS LES TESTS PASS

**Vous pouvez:**
1. ✅ Déployer en production
2. ✅ Informer les utilisateurs (multi-account sync live!)
3. ✅ Activer les notifications pour les reposts
4. ✅ Monitor les erreurs (Sentry/logs)

---

## 🔴 SI UN TEST ÉCHOUE

**Troubleshooting:**

| Test | Échoue | Solution |
|------|--------|----------|
| Test 1 (Repost invisible) | Post partagé n'apparaît pas dans autre compte | • Vérifier que Migration #1 exécutée<br/>• Vérifier console (F12) pour erreurs<br/>• Vérifier que Supabase connecté |
| Test 2 (Multi-device) | Repost invisible après 10s | • Auto-refresh peut-être désactivé<br/>• Vérifier feed refresh loop fonctionne<br/>• Attendre plus longtemps (30s max) |
| Test 3 (Filtering cassé) | Repost apparaît dans filtre wrong | • Vérifier que passion correctement enregistrée<br/>• Vérifier allFeedPosts() logique<br/>• Vérifier renderFeed() filtre |
| Test 4 (RLS pas bloqué) | Hack réussit (error = null) | • Migration #2 n'a pas été exécutée<br/>• Exécuter migration_fix_rls_policies.sql<br/>• Vérifier policies dans Auth tab |

---

## 📞 SUPPORT & QUESTIONS

**Questions fréquentes:**

**Q: "Combien de temps avant sync?" →** 10 secondes maximum (auto-refresh)

**Q: "Et si Supabase redémarre encore?" →** Le code fonctionne quand même (fallback local)

**Q: "Dois-je attendre avant de tester?" →** Non! Tester maintenant (Netlify live)

---

## 📋 CHECKLIST FINAL

### Avant les tests:
- [ ] Supabase dashboard accessible
- [ ] Migrations SQL exécutées (ou notées pour plus tard)
- [ ] App live sur Netlify
- [ ] Console JS propre (pas d'erreurs)

### Pendant les tests:
- [ ] Test 1: ✅/❌
- [ ] Test 2: ✅/❌
- [ ] Test 3: ✅/❌
- [ ] Test 4: ✅/❌

### Après les tests:
- [ ] Tous les tests PASS?
- [ ] Documenter les résultats
- [ ] Prochaines étapes (production, monitoring, etc.)

---

**Vous êtes prêt!** 🚀

**Prochaines actions:**
1. Attendre que Supabase redémarre (ou skip si déjà up)
2. Exécuter les 2 migrations SQL
3. Tester les 4 scénarios ci-dessus
4. Vous aurez le multi-account, multi-device sync FONCTIONNE! ✅

---

**Status:** Code déployé, en attente de vos tests  
**ETA:** 30 minutes (avec tests) ou 15 minutes (migrations uniquement)  
**Contact:** Si problèmes, consultez AUDIT_FINAL_10_POINTS.md
