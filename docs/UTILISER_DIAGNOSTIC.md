# 🔧 Comment Utiliser le Diagnostic IRL

## Activation du Diagnostic

### Méthode 1: Console JavaScript
Ouvre F12 → Console et tape:
```javascript
toggleDiagPanel()
```

### Méthode 2: Chercher le Bouton
Il doit y avoir un bouton quelque part dans l'interface pour activer le mode debug.

## Panneau de Diagnostic

Une fois activé, un panneau s'affiche en bas à droite avec:
- **Fond noir** avec **bordure orange**
- Messages de diagnostic en temps réel
- Affiche les **20 derniers messages**

## Messages à Regarder

### 1️⃣ **Géolocalisation** (au démarrage IRL)

```
[GEO] 📍 Demande position utilisateur...
[GEO] ✅ Position obtenue: 45.9018, 6.1305
[GEO] 📍 Précision: 20m
```

**Interprétation:**
- ✅ `Position obtenue` = GPS fonctionne, ta position est utilisée
- ❌ `Erreur: User denied` = Tu as refusé la géolocalisation
- 🔄 `Fallback PARIS` = GPS indisponible, utilisation Paris

### 2️⃣ **Sélection de Distance**

```
=== DISTANCE: 100km ===
[DISTANCE] Référence: 📍 GPS (45.9018, 6.1305)
[DISTANCE] GPS utilisé? ✅ OUI
[DISTANCE] Jam session → 45.2km ✅
[DISTANCE] Concert → 150.5km ❌
[DISTANCE] RÉSULTAT: 8/40 événements
```

**Interprétation:**
- `Référence: 📍 GPS` = Distance calculée depuis TA position ✅
- `Référence: 🔄 PARIS` = Distance calculée depuis Paris 🔄
- Chaque ligne = 1 événement avec sa distance
- `✅` = Événement inclus dans la distance
- `❌` = Événement rejeté (trop loin)
- `RÉSULTAT: 8/40` = 8 événements sur 40 correspondent

## 🧪 Workflow Complet de Test

### Étape 1: Activer le Diagnostic
```javascript
toggleDiagPanel()
```

### Étape 2: Aller à IRL
- Tu devrais voir immédiatement:
```
[GEO] 📍 Demande position utilisateur...
```

### Étape 3: Autoriser la Géolocalisation
- Popup: "Autoriser géolocalisation?"
- Clique **ACCEPTER**

### Étape 4: Vérifier la Position
Tu devrais voir:
```
[GEO] ✅ Position obtenue: XX.XXXX, X.XXXX
[GEO] 📍 Précision: 20m
```

**Si tu vois cela = GPS fonctionne ✅**

### Étape 5: Sélectionner une Distance
Par exemple: "100 km"

### Étape 6: Lire le Diagnostic
Tu verras:
- Référence utilisée (GPS ou PARIS)
- Chaque événement avec sa distance
- Nombre total d'événements inclus

## ❓ Diagnostic Troubleshooting

### Cas 1: Tu vois "Fallback PARIS"
```
[GEO] 🔄 Fallback PARIS: 48.8566, 2.3522
[DISTANCE] Référence: 🔄 PARIS
```
**Problème:** Géolocalisation refusée ou échouée
**Solution:** Rafraîchis, accepte la géoloc

### Cas 2: Pas de messages de géolocation
```
(rien n'apparaît)
```
**Problème:** Tu n'as pas cliqué sur IRL
**Solution:** Va à IRL d'abord

### Cas 3: Tous les événements sont rejetés
```
[DISTANCE] RÉSULTAT: 0/40 événements
```
**Problème:** 
- Distance trop petite (5km quand tu es loin de tout)
- Événements n'ont pas de ville reconnue
**Solution:** Augmente la distance

### Cas 4: Trop d'événements inclus
```
[DISTANCE] RÉSULTAT: 40/40 événements
```
**Problème:** Distance trop grande
**Solution:** Réduis la distance

## 📊 Colonnes du Diagnostic

| Élément | Signification |
|---------|---------------|
| `[GEO]` | Messages géolocalisation |
| `[DISTANCE]` | Messages filtrage distance |
| `📍 GPS` | Distance calculée depuis ta position |
| `🔄 PARIS` | Distance calculée depuis Paris (fallback) |
| `✅` | Événement inclus |
| `❌` | Événement rejeté |
| `45.9018, 6.1305` | Coordonnées GPS (latitude, longitude) |
| `45.2km` | Distance de l'événement |

## 🚀 Checklist Rapide

- [ ] Ouvre F12
- [ ] Tape `toggleDiagPanel()`
- [ ] Va à IRL
- [ ] Accepte la géolocalisation
- [ ] Regarde le diagnostic (bas-droit)
- [ ] Sélectionne une distance
- [ ] Vérifies le résultat dans le diagnostic

**Si tu vois ta position (latitude/longitude) → Ça marche! ✅**
**Si tu vois Paris (48.8566, 2.3522) → Géoloc a échoué 🔄**
