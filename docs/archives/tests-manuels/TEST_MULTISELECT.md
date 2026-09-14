# 🧪 Test Multi-Sélection Profils IRL

## Test 1: Sélection unique
1. Va à IRL
2. Les profils (Musique, Voyage, Sport) apparaissent avec les événements
3. Clique sur **Musique** → Se surligne et affiche events musique ✅

## Test 2: Multi-sélection
1. La page IRL affiche les profils par défaut
2. Clique sur **Voyage** (en plus de Musique)
3. **Les DEUX devraient être surligné**
4. Devrais voir union: événements Musique + Voyage ✅

## Test 3: Triple sélection
1. Clique sur **Sport** (ajoute à Musique + Voyage)
2. **Les TROIS devraient être surligné**
3. Devrais voir: événements Musique + Voyage + Sport ✅

## Test 4: Retrait d'un filtre
1. Avec Musique + Voyage + Sport sélectionnés
2. Reclique sur **Voyage** (désélectionne)
3. Reste Musique + Sport ✅

## Test 5: Filtres + Distance + Heure
1. Sélectionnes Musique + Voyage
2. Sélectionnes distance 100 km
3. Sélectionnes heure 18:00
4. Devrais voir: Musique + Voyage à < 100 km et >= 18:00 ✅

## Console Debug
Ouvre F12 → Console et regarde:
- Les sélections/désélections devraient être fluides
- Pas de messages d'erreur
