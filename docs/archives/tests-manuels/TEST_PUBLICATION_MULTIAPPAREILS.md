# 🧪 TEST PUBLICATION MULTI-APPAREILS

## Scénario de test critique

Ceci teste le système de partage de contenu avec 2 appareils:

### Setup
- **Appareil A**: Ben2 (ou autre profil/utilisateur)
- **Appareil B**: BEN PC PORTABLE (ou autre profil/utilisateur)
- **Backend**: Supabase (https://njkiyoklssvefstljemx.supabase.co)

### Test 1: Publication texte simple
1. Sur Appareil A: Ouvre PASSIO
2. Va à "Studio"
3. Publie: "Test texte $(date)" 
4. Attends confirmation "Post publié!"
5. Sur Appareil B: Actualise le feed
6. **VÉRIFIE**: Tu vois le post texte de A dans le feed

### Test 2: Publication avec photo
1. Sur Appareil A: Publie une photo (500KB max)
2. Attends confirmation "Post publié!"
3. Sur Appareil B: Actualise et scroll
4. **VÉRIFIE**: La photo s'affiche correctement

### Test 3: Publication avec vidéo
1. Sur Appareil A: Publie une vidéo (500KB max)
2. Attends confirmation
3. Sur Appareil B: Actualise le feed
4. **VÉRIFIE**: La vidéo est jouable

### Test 4: Refresh automatique
1. Sur Appareil A: Publie 3 posts rapidement
2. Sur Appareil B: NE RAFRAÎCHIS PAS - attends 20 secondes
3. **VÉRIFIE**: Les 3 posts apparaissent automatiquement

### Critères de réussite

✅ **PASS** si:
- Post texte visible de A à B
- Photo visible et affichée de A à B
- Vidéo visible et jouable de A à B
- Refresh automatique marche (20s)
- Pas d'erreur console sur les deux appareils

❌ **FAIL** si:
- Post n'apparaît pas
- Photo affiche blanc ou erreur
- Vidéo ne charge pas ou montre base64
- Refresh n'actualise pas le feed
- Erreur console sur publication

## Diagnostics à faire

### Sur Appareil A (après publication):
Ouvre Console (F12) et cherche:
```
✅ [PUBLISH] Posts créés dans Supabase
🔗 [UPLOAD] URL publique: https://...
📤 [PUBLISH] Publication réussie
```

### Sur Appareil B (après refresh):
Cherche:
```
✅ [INIT] X posts chargés
🔄 [FEED] Refresh automatique du feed (10s)
```

## Si ça échoue

### Problème: Photo n'apparaît pas
- Vérifier que Supabase Storage existe (`content` bucket)
- Vérifier que `supaUploadMedia()` s'exécute
- Vérifier que la photo < 500KB
- Vérifier les logs: "Upload photo échoué"

### Problème: Post ne synchronise pas
- Vérifier MY_UID est défini: `console.log(MY_UID)`
- Vérifier Supabase connexion: `console.log(supa)`
- Vérifier les logs: "[PUBLISH] Tentative"
- Vérifier que `supaPublishPostWithRetry()` retourne true

### Problème: Feed ne rafraîchit pas
- Vérifier que refresh loop démarre: "Démarrage refresh"
- Vérifier que `state.supabasePosts` se met à jour
- Vérifier que `renderFeed()` est appelée

## Score final

- Tous les tests passent: ✅ **PRODUCTION-READY**
- 1-2 tests échouent: 🟡 **À INVESTIGUER**
- 3+ tests échouent: 🔴 **ARCHITECTURE À REVOIR**
