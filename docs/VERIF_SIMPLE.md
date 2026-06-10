# ✅ VÉRIFICATION SIMPLE - CHECK-LIST RAPIDE

**Durée:** 15 minutes  
**But:** Confirmer que toutes les corrections fonctionnent

---

## 📱 AVANT DE COMMENCER:

1. Ouvrir PASSIO sur votre appareil
2. Écrire les réponses OUI/NON pour chaque test
3. Si un test ÉCHOUE → prendre une **screenshot** et envoyer

---

## 🧪 TESTS (Dans cet ordre)

### TEST 1: Publication simple text
```
1. Aller "Studio"
2. Type: Text
3. Écrire: "Test publication 2026-06-09"
4. Passion: "Musique"
5. Cliquer "✨ Publier"

VÉRIFIER:
✅ Toast "📤 Publication en cours..." s'affiche immédiatement
✅ Texte disparaît du form
✅ Toast "✅ Post publié!" apparaît après 2-5 sec
✅ Page passe automatiquement au feed
✅ Le post apparaît EN HAUT du feed
✅ Nom auteur = votre vrai username (PAS "Passionné")
✅ Heure = heure correcte (fuseau horaire local)

OUI / NON / PARTIELLEMENT
```

### TEST 2: Upload photo 300 KB
```
1. Studio → Photo
2. Charger une photo d'environ 300 KB
3. Ajouter texte: "Photo test"
4. Publier

VÉRIFIER:
✅ Photo apparaît dans le preview
✅ Toast "Publication en cours..."
✅ Post avec photo visible immédiatement dans feed
✅ Photo bien affichée dans le post (pas placeholder)
✅ Toast final "✅ Post publié!"

OUI / NON / PARTIELLEMENT
```

### TEST 3: Upload vidéo 400 KB
```
1. Studio → Vidéo
2. Charger une vidéo d'environ 400 KB
3. Ajouter texte: "Vidéo test"
4. Publier

VÉRIFIER:
✅ Vidéo charge sans erreur
✅ Toast "Publication en cours..."
✅ Post avec vidéo visible immédiatement
✅ Vidéo jouable dans le post (apparaît avec controls)
✅ Toast "✅ Post publié!"

OUI / NON / PARTIELLEMENT
```

### TEST 4: Rejet fichier > 500 KB
```
1. Studio → Photo
2. Charger une photo de 600+ KB
3. Attendre

VÉRIFIER:
✅ Toast "Photo > 500 KB, compresse-la!" s'affiche
✅ Fichier rejeté (pas de preview)
✅ Formulaire reste vide, prêt pour autre fichier

OUI / NON / PARTIELLEMENT
```

### TEST 5: Synchronisation offline
```
1. Éteindre WiFi
2. Publier un post text
3. Vérifier qu'il apparaît localement
4. Rallumer WiFi après 20 secondes
5. Attendre

VÉRIFIER:
✅ Post publié même sans internet (optimistic update)
✅ Toast "Publication en cours..."
✅ Après reconnect, toast "⏱️ Connexion lente" ou "✅ Post publié!"
✅ Post synchronisé et visible sur feed
✅ L'autre appareil/profile voit le post

OUI / NON / PARTIELLEMENT
```

### TEST 6: Feed stable même avec media cassée
```
1. Aller au feed
2. Scroller vers le bas
3. Vérifier anciens posts

VÉRIFIER:
✅ Feed affiche normalement
✅ Aucun post n'est cassé
✅ Si une image manque → affiche rectangle gris (pas erreur)
✅ Si une vidéo manque → affiche rectangle noir (pas erreur)
✅ Console JavaScript = clean (pas d'erreurs rouges)

OUI / NON / PARTIELLEMENT
```

### TEST 7: Multi-profils
```
Profile A:
  1. Publier: "Message de Profile A"
  2. Vérifier: Nom = Profile A, Emoji = ✨ (ou custom)

Profile B:
  1. Switch à Profile B
  2. Vérifier: Voit le post de Profile A
  3. Publier: "Message de Profile B"
  4. Vérifier: Nom = Profile B

Switch back Profile A:
  1. Vérifier: Voit les deux posts
  2. Vérifier: Noms différents pour chaque

VÉRIFIER:
✅ Chaque profil a son vrai nom (pas "Passionné")
✅ Les posts des autres profils sont visibles
✅ Pas de confusion entre les noms

OUI / NON / PARTIELLEMENT
```

---

## 📊 RÉSULTATS

**Compter les OUI:**
- 7/7 OUI → ✅ **EXCELLENT** - Tout fonctionne!
- 5-6 OUI → 🟡 **BON** - Quelques ajustements nécessaires
- <5 OUI → 🔴 **PROBLÈMES** - Signaler les NON/PARTIELLEMENT

---

## 🚨 SI UN TEST ÉCHOUE:

1. **Prendre une screenshot** de l'erreur
2. **Copier le message d'erreur** de la console (F12)
3. **Noter le numéro du test** (ex: TEST 3)
4. **Envoyer screenshot + message d'erreur**

Exemple:
```
TEST 3 ÉCHOUE - Upload vidéo
Screenshot: [image]
Erreur console: "Failed to fetch (413 Payload Too Large)"
Comportement: Vidéo load mais publication échoue
```

---

## 📝 NOTES:

- Les corrections sont déployées, app devrait être **stable**
- Si vous trouvez des **bugs restants** → c'est normal, on va les fixer
- **Performance:** App peut être lente la première fois, c'est normal (pas encore minifiée)
- **Messages d'erreur:** Nouveau! Lisez les toasts, ils donnent des indices

---

## ⏱️ TIMELINE:

- **2-3 min:** Tests 1-2 (basique)
- **5-7 min:** Tests 3-4 (media)
- **3-4 min:** Test 5 (offline)
- **2-3 min:** Tests 6-7 (stabilité)

**Total: ~15 minutes**

---

**🚀 Lancez les tests et dites-moi les résultats!**
