# Checklist de commercialisation — PASSIO (2026-06-12)

Statut par fonctionnalité, onglet et contrôle. Détail des preuves :
[CONTROLE_16_MISSIONS.md](CONTROLE_16_MISSIONS.md).

## Navigation & écrans (8)
- [x] Fil — filtres passion/mood, stories, posts, états vides
- [x] Bobines — overlay reels (`#reelsViewer`), état vide
- [x] Explorer — recherche, passions tendance, assistant IA
- [x] Créer (Studio) — texte (testé), photo/vidéo/audio/carnet (UI présente)
- [x] Messages — liste paginée (30/page), nouveau message/groupe
- [x] IRL — carte Leaflet, filtres date/distance/horaire
- [x] CDV — carnets, favoris, lives, état vide
- [x] Wallet — score, Passia, quêtes, boutique
- [x] Bottom-nav : 6 onglets + « + », libellés cohérents, < 1,5 s/écran

## Messagerie
- [x] Conversation 1-1 (texte) — testé multi-comptes réels (opt-in)
- [x] Message vocal reçu → lecteur intégré (`applyMsgContentData`)
- [x] GIF (API Tenor/Giphy + fallback), pièce jointe, localisation
- [x] Galerie pièces jointes (`#convFilesPanel` : médias/vocaux/fichiers)
- [x] Paramètres conv (mute, effacer, exporter, supprimer)
- [x] Groupes (création, membres, photo)
- [x] Realtime (livraison INSERT validée)

## Publication & contenu
- [x] Post texte — optimistic + persistance reload (testé)
- [x] Post photo / vidéo / carnet — testés (type + média + rendu fil)
- [x] Upload trop volumineux (>500 Ko) — rejet propre (toast, pas de crash)
- [x] Like / commentaire — testés
- [x] Partage post (feuille de partage)

## Profils
- [x] Multi-profils passion (3), bascule
- [x] Badges (`#profileBadges`) + graphe d'activité (`#activityGraph`)
- [x] Visite de profil (depuis le fil)
- [~] Follow/unfollow, édition bio — présents, non auto-testés

## Sécurité & conformité
- [x] Gate code 2125 (hash, jamais en clair, deep links protégés)
- [x] Aucun secret en clair (anon Supabase OK)
- [x] `escapeHtml` sur le contenu utilisateur (×206)
- [x] RLS v2 (26 policies) + migration conv_members appliquée en prod
- [x] CSP live (+ tenor/giphy), Referrer-Policy, Permissions-Policy
- [x] RGPD : suppression de compte réelle + Edge Function `delete-account` (déployée)
- [x] Politique de confidentialité in-app

## Performance
- [x] Transfert initial ~201 Ko (brotli) < 500 Ko
- [x] `loading="lazy"` (×32), pagination fil + messages + conversations
- [ ] Lighthouse mobile formel ≥ 85 — **à lancer (humain)**

## Accessibilité
- [x] Zoom non bloqué (pas de `user-scalable=no`)
- [x] Champs ≥ 16 px (anti-zoom iOS)
- [x] Cibles tactiles ≥ 44 px (nav, conv-tool-btn)
- [x] Contraste `--muted` AA

## Mise en ligne
- [x] Prod accessible (HTTP 200 : /, index, manifest, sw, icônes)
- [x] CI GitHub Actions → Netlify
- [x] Monitoring `client_errors` câblé

## Avant le grand public (décisions humaines)
- [x] Clé API GIF (Giphy) activée dans `PASSIO_GIF_API` — recherche en ligne live
- [x] Fixtures de test média (photo/vidéo/carnet + erreur upload) — tests verts
- [ ] Lighthouse mobile formel (poids déjà prouvé : 201 Ko brotli)
- [ ] (option) domaine perso, comptes admin, plugin frontend-design

Légende : [x] fait & prouvé · [~] partiel · [ ] à faire (humain)
