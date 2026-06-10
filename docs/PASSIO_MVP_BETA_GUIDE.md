# PASSIO · MVP Beta — Guide de présentation

**Fichier** : `index.html` (un seul fichier, ouvre dans n'importe quel navigateur)
**Cible** : beta testeurs + présentation investisseurs / incubateur
**Type** : prototype interactif, données persistées en localStorage + sync temps réel via Supabase
**Dernière mise à jour** : Mai 2026

---

## 🆕 Version 3 — Backend réel + fonctionnalités avancées

Nouveautés majeures par rapport à la v2 :

### 🔗 Backend Supabase (temps réel)
- Connexion à une vraie base de données Supabase (URL + clé configurées)
- Sync des posts, stories, événements, commentaires entre utilisateurs
- Likes temps réel (`supaToggleLike`, `supaGetLikeCount`)
- Messagerie multi-utilisateurs persistée en base
- Notifications poussées via abonnements Supabase Realtime
- Recherche d'utilisateurs dans la base (`supaSearchUsers`)
- Profils synchronisés (`supaUpsertProfile`)

### 📡 CDV Live (Carnets de Voyage en direct)
- Créer un Carnet de Voyage en temps réel depuis le tab Carnets
- Étapes avec photos, texte, géolocalisation et notation (⭐)
- Durée et visibilité (public / amis / privé) configurables
- Réactions en direct sur les étapes
- Commentaires sur le live
- Visualiseur plein écran (`openCdvLiveViewer`)
- Liste des lives en cours dans le feed Carnets

### ⏸ Mode Pause & Bien-être digital
- **Temps d'écran** : limite quotidienne configurable (30 min, 1h, 1h30, 2h, 3h, illimité)
- **Mode Pause Weekend** : activation/désactivation manuelle
- Rappel automatique à l'approche de la limite
- Écran de pause avec message bienveillant
- Sauvegarde de la limite protégée par code parental optionnel

### 🔐 Contrôle parental
- Code parental à 4 chiffres (PIN)
- Protège la modification du temps d'écran
- Empêche les achats Passia pour les mineurs sans accord
- Activation/suppression depuis les Paramètres → Temps d'écran
- Code stocké localement (hashé)

### 🗂 Navigation personnalisable
- L'utilisateur peut réordonner les onglets de la barre de navigation
- Glisser-déposer ou flèches haut/bas dans les Paramètres → Apparence
- Ordre sauvegardé par profil

### 💬 Messagerie directe
- Nouveau message depuis l'onglet Messages → bouton "✉️ Nouveau message"
- Recherche d'un utilisateur par nom/pseudo
- Démarrer une conversation directe (`startDirectMessage`)
- Synchronisation des conversations via Supabase (`supaLoadMyConversations`)
- Abonnement temps réel aux nouveaux messages (`supaSubscribeMessages`)

### 🔍 Recherche & profils utilisateurs
- Recherche d'utilisateurs depuis la messagerie (`searchUsers`)
- Fiche profil utilisateur : posts, stats, passion badge
- Bouton Suivre / Ne plus suivre (`toggleFollowUser`)
- Clic sur l'avatar d'un post → ouvre le profil (`openUserProfile`)

### ⚙️ Paramètres avancés
- **Notifications** : personnalisation par type (likes, events, quêtes, messages)
- **Confidentialité** : profil public / amis / privé, visibilité des passions
- **Contenu & feed** : filtres de contenu, langues, sensibilité
- Chaque section sauvegardable individuellement

### 👤 Édition du profil principal
- Modifier le nom, la bio, l'avatar (upload photo)
- Changer la photo de couverture
- Changer la photo de passion par profil
- Accès via l'écran Profil → bouton ✏️ Éditer ou via le menu ⋯

### 🗑 Suppression de profil
- Supprimer un profil passion depuis la liste des profils
- Confirmation avant suppression
- Données du profil effacées proprement

### 🤖 Recherche IA dans Explorer
- Onglet **✨ IA** à côté de l'onglet Recherche classique dans Explorer
- Barre de recherche centrale avec sous-titre explicatif
- Deux sections de raccourcis cliquables :
  - **Dans PASSIO** : Événements IRL, Carnets CDV, Créateurs à suivre, Gagner des Passia
  - **Conseils par passion** : Photo, Musique, Cuisine, Voyage, Skate, Bien-être digital
- Chaque raccourci affiche son titre + description courte (on sait exactement ce qu'on va obtenir)
- Résultats en cartes avec bouton **‹ Retour** pour revenir à l'accueil IA
- Suggestions de recherches liées en bas de chaque résultat
- Répond aussi aux questions libres tapées dans la barre : conseils techniques, ressources, tendances 2026

---

## 1. Comment lancer la démo

1. Double-clique sur `index.html` → s'ouvre dans Chrome / Safari / Firefox.
2. Pour un rendu mobile : F12 → icône téléphone (mode responsive) → iPhone 14 ou équivalent.
3. Pour partager à un testeur distant : envoie le fichier HTML par email ou héberge-le sur Netlify / Vercel (drag & drop gratuit).

---

## 2. Parcours à montrer en 5 minutes (pitch investisseur)

### Étape 0 · Onboarding (30 s)
- Splash PASSIO (logo officiel)
- Vérification d'âge (mineurs détectés automatiquement)
- Saisie du prénom
- Choix de **1 à 3 passions** → chaque passion crée un profil dédié

### Étape 1 · Fil mood-based (1 min)
- Tap sur les 4 moods : **Tout / Création / Learn / Chill**
- Le contenu se filtre selon l'intention — pas un algorithme addictif
- Posts réalistes avec 25 créateurs pré-seed (Léa guitariste, Karim photographe, Yanis vibe-coder IA, etc.)
- Clic sur un avatar → fiche profil utilisateur avec option Suivre

### Étape 2 · Multi-profils (30 s)
- Tap sur le logo en haut à gauche → écran Profils
- Switcher entre identités (musique / photo / voyage / etc.)
- Éditer le profil : avatar, cover, bio
- Supprimer un profil si besoin

### Étape 3 · Studio de création (1 min)
- Tap sur **＋** en bas
- 3 types : texte / photo / podcast audio (enregistrement micro réel via navigateur)
- Templates pré-remplis (Journal de route, Mini-tuto, Coulisses, Question)
- Brouillons sauvegardés en localStorage
- Publier → +10 à +20 pts + Passia selon le type
- Post publié sync en temps réel via Supabase

### Étape 4 · Passio IRL (30 s)
- Onglet **IRL** → carte avec épingles cliquables
- 6 événements pré-seed (Jam Lyon, Photo Paris, Dîner Marseille, etc.)
- Rejoindre un événement → +25 pts · +5 💎
- Créer son événement → formulaire complet · +30 pts

### Étape 5 · CDV Live (30 s)
- Onglet **Carnets** → bouton "📡 CDV Live"
- Créer un live : destination, description, durée, visibilité
- Ajouter des étapes avec photo + géoloc + note
- Réactions et commentaires en direct

### Étape 6 · Wallet Passia + Score (1 min)
- Onglet **Wallet**
- **Score Passion** : anneau de progression animé, rang (Débutant → Ambassadeur)
- **Wallet Passia** : monnaie interne, historique des transactions
- **Leaderboard** hebdo des top passionnés
- Grille "Comment gagner" — barème transparent

### Bonus · Mode Pause & Bien-être
- Menu ⋯ → **Temps d'écran** → définir une limite quotidienne
- Menu ⋯ → **Mode pause** → activer une pause volontaire
- Contrôle parental pour les familles

### Bonus · Tour guidé intégré
- Tap sur les 3 points (⋯) en haut à droite → **🎬 Tour démo investisseurs**
- Parcours automatique des 6 écrans clés avec explications pitch

---

## 3. Ce qui fonctionne en vrai dans le MVP (v3)

✅ Onboarding complet + contrôle d'âge
✅ Multi-profils (création, switch, édition, suppression, stats par profil)
✅ Fil d'actualité filtrable par mood
✅ Publication texte / photo (upload local) / audio (enregistrement navigateur MediaRecorder)
✅ Templates de création + brouillons persistés
✅ Explorer 18 passions + trending + recherche classique
✅ **[NOUVEAU] Recherche IA dans Explorer** : assistant intelligent, 2 onglets (Recherche / IA), raccourcis par catégorie (events IRL, CDV, créateurs, Passia, conseils par passion)
✅ IRL : carte visuelle, création d'événements, inscription
✅ Wallet Passia + historique transactions + leaderboard
✅ Gamification : points gagnés à chaque action
✅ Tour guidé pour investisseurs
✅ Système de feedback beta intégré
✅ Reset complet possible depuis le panel dev
✅ Partage de la beta via lien
✅ **[NOUVEAU] Backend Supabase : posts, likes, stories, events, messages en temps réel**
✅ **[NOUVEAU] CDV Live : carnet de voyage en direct avec étapes et réactions**
✅ **[NOUVEAU] Mode Pause + Temps d'écran + Contrôle parental**
✅ **[NOUVEAU] Messagerie directe entre utilisateurs (via Supabase)**
✅ **[NOUVEAU] Recherche d'utilisateurs + follow/unfollow**
✅ **[NOUVEAU] Navigation personnalisable par l'utilisateur**
✅ **[NOUVEAU] Paramètres avancés : notifications, confidentialité, contenu**
✅ **[NOUVEAU] Édition du profil principal (avatar, cover, bio)**
✅ **[NOUVEAU] Suppression de profil passion**
✅ **[NOUVEAU] Recherche IA intégrée dans Explorer (assistant passions + recherche app)**

## 4. Ce qui reste à construire pour la v1 publique

- App mobile native (React Native / Expo)
- Vraie géolocalisation IRL (carte interactive type Mapbox)
- Système d'authentification complet (email/social login)
- Modération + IA de contrôle d'âge renforcé
- Marketplace Passia (conversion + transferts réels)
- Notifications push natives
- Système de paiement (Stripe)

---

## 5. Panel dev caché (démo avancée)

Tap sur les ⋯ en haut à droite pour accéder à :
- 🎬 Tour démo investisseurs (parcours guidé 6 étapes)
- 🔄 Switch profil rapide
- ✏️ Modifier le profil principal
- ⏸ Temps d'écran (limite quotidienne)
- 🌙 Mode pause
- 🔔 Notifications
- 🔒 Confidentialité
- 📺 Contenu & feed
- 📤 Partager la beta (génère un message prêt-à-envoyer)
- 💬 Feedback (formulaire bêta-testeur stocké localement)
- 🗑 Réinitialiser (purge localStorage)

---

## 6. Architecture technique (v3)

| Composant | Technologie |
|-----------|-------------|
| Frontend  | HTML / CSS / JS vanilla (single file) |
| Cartes    | Leaflet.js (OpenStreetMap) |
| Backend   | Supabase (PostgreSQL + Realtime) |
| Stockage local | localStorage (profils, config, brouillons) |
| Audio     | Web Audio API / MediaRecorder |
| Maps CDV  | Leaflet mini-carte intégrée |

---

## 7. Réponses rapides aux questions investisseurs

**« Quelle est la différence avec Instagram / TikTok ? »**
Pas d'algorithme addictif. L'utilisateur choisit son mood. Pas de follower count valorisé. L'identité est plurielle (multi-profils). Le digital est un moyen, pas une fin — le score récompense les rencontres IRL. Et Passio intègre nativement le bien-être digital (Mode Pause, temps d'écran, contrôle parental).

**« Comment monétisez-vous ? »**
Marketplace de la passion (formations, ressources, expériences), commissions sur ventes de créateurs, premium pour organisateurs d'événements IRL récurrents.

**« Pourquoi les gens adopteraient-ils ? »**
1. Lassitude des réseaux qui comparent les vies.
2. Besoin d'une identité professionnelle ET artistique ET personnelle sans conflit.
3. Demande croissante d'authenticité (gen Z : 80% disent rejeter le "fake" sur les réseaux).
4. Passio IRL = réponse à la crise de solitude post-COVID.

**« Vous avez un vrai backend maintenant ? »**
Oui — Supabase est connecté. Posts, likes, stories, événements, messages et notifications sont synchronisés en temps réel entre utilisateurs. Le MVP n'est plus un prototype local uniquement.

**« Quels KPI ciblez-vous ? »**
- Temps passé en mode "création" vs "consommation" (inversé vs TikTok)
- Ratio événements IRL créés / utilisateurs actifs mensuels
- Nombre moyen de profils par utilisateur (objectif : 2,3+)
- Score Passion moyen = indicateur de contribution réelle
- Taux d'activation du Mode Pause (indicateur de bien-être)

---

**Contact** : Benjamin · PASSIO Founder
