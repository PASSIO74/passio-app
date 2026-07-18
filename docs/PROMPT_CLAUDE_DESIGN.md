# Prompt pour Claude Design — Audit & refonte visuelle de PASSIO

> Copier tout le bloc ci-dessous et l'envoyer avec `index.html` **ET `styles.css`** (le thème est dedans — sans lui, l'analyse sera aveugle).

---

Tu es un directeur artistique / designer UX-UI senior spécialisé en applications mobiles sociales (Instagram, WhatsApp, BeReal, LinkedIn). Je te confie l'audit visuel complet de **PASSIO**, le réseau social des passions : une PWA mobile-first en vanilla JS (pas de framework), thème violet (#7c3aed), avec variables CSS (`--bg-card`, `--border`, `--muted`, `--accent`…).

## 🎯 Mission

Analyser **ABSOLUMENT TOUT** ce qui est visible dans l'application — chaque page, chaque onglet, chaque modale, chaque panneau, chaque état vide, chaque bouton — et me proposer des améliorations visuelles concrètes pour obtenir une application **visuellement parfaite** : plus simple, plus épurée, plus cohérente, avec la meilleure ergonomie possible.

**Règle d'or : ne supprimer AUCUNE fonctionnalité.** On simplifie le visuel, la hiérarchie, la densité — jamais les capacités. Si un écran est surchargé, on réorganise (regroupement, hiérarchie, menus secondaires, disclosure progressive), on ne retire pas.

## 📱 Inventaire à couvrir (exhaustif — ne rien sauter)

Passe en revue chacun de ces éléments, un par un :

1. **Écran de verrouillage** (code d'accès beta) — première impression
2. **Landing page** (visiteur non connecté) + bannière d'installation PWA
3. **Onboarding** (toutes les étapes : choix des passions, pseudo, compte)
4. **Fil / Feed** (`#screen-feed`) : cartes de post, barre d'actions (❤️ 💬 😊 partage), pastilles de réactions, bulles de stories en tête, posts média/texte/vidéo
5. **Stories** : bulles, viewer plein écran (`#storyMedia`/`#storyOverlays`), progression
6. **Bobines / Reels** : viewer vertical, overlays, état vide
7. **Commentaires** : modale, fil de discussion, réponses repliées/dépliées, tri « Pertinents | Récents », composeur (emoji/GIF à onglets, @mentions), commentaires GIF, badges « épinglé » / « modifié », squelettes de chargement, statut « ⏳ Envoi… / ⚠️ Réessayer »
8. **Profils-passions** (`#screen-profiles`) : liste, création, cartes
9. **Profil principal** (`#screen-cdv` / profil) : en-tête, avatar, pastille étoiles « ⭐ score · rang », grilles de contenus
10. **Profil d'un autre utilisateur** (`openUserProfile`) : boutons suivre / bloquer / signaler / partager, liste des passions
11. **Studio** (`#screen-studio`) : types de création (post, vidéo, carnet, bobine), formulaires
12. **Éditeur média façon Instagram** (`#mediaEditor`) : phase capture (caméra, obturateur, flip, galerie, fonds colorés) et phase édition (overlays texte/emoji/GIF déplaçables)
13. **Explore** (`#screen-explore`) : recherche, résultats, suggestions
14. **IRL / Événements** (`#screen-irl`) : cartes événement, 5 filtres + indicateur « X filtres · Réinitialiser », carte Leaflet, sélecteur de ville, détail événement, participants/avatars, bouton .ics
15. **CDV** (`#screen-cdv`) : carnets de voyage, Lives (création, viewer, étapes, commentaires, réactions, followers, badge live), états vides distincts
16. **Wallet** (`#screen-wallet`) : score, rangs, historique de points
17. **Messagerie** (`#screen-messages`) : liste des conversations, aperçus, fil de conversation, bulles, messages vocaux (lecteur intégré), médias, GIFs, documents, localisation, panneau emoji/GIF, panneau « Pièces jointes » (`#convFilesPanel`), file d'attente hors-ligne
18. **Appels audio/vidéo** : overlay plein écran (`#callOverlay`), écran d'appel entrant, boutons muet/caméra/flip/raccrocher, PiP local
19. **Notifications** : panneau, badge, liste, emojis par type
20. **Réglages** : tous les sous-écrans (compte, confidentialité, comptes bloqués, suppression de compte, politique de confidentialité)
21. **Navigation globale** : barre d'onglets du bas, en-têtes d'écran, transitions entre écrans
22. **Composants transverses** : toasts, modales génériques, boutons, champs de formulaire, badges, avatars, squelettes, états vides, états d'erreur, watermark « MVP BETA »

## 📋 Livrable attendu

Pour **chaque** écran/composant de l'inventaire :

1. **Diagnostic** (2-5 points) : ce qui nuit à la lisibilité, la hiérarchie, la cohérence ou l'ergonomie (densité, alignements, espacements, tailles de texte, contrastes, redondances visuelles, incohérences entre écrans)
2. **Propositions concrètes** classées par impact : quoi changer précisément (espacements, typographie, couleurs, rayons, ombres, disposition, regroupements), avec le CSS/HTML modifié quand c'est pertinent
3. **Note de simplicité** avant/après (sur 10)

Puis en synthèse finale :

- **Un design system unifié** : échelle typographique (tailles/graisses), échelle d'espacement (4/8/12/16/24…), rayons de bordure, ombres, palette complète (en variables CSS, en gardant le violet #7c3aed comme accent), styles canoniques de boutons (primaire/secondaire/fantôme/danger), de cartes, de champs, de modales — pour que TOUS les écrans parlent le même langage visuel
- **Top 10 des changements** au meilleur ratio impact visuel / effort
- **Les incohérences inter-écrans** à harmoniser (ex. deux styles de cartes, trois styles de boutons…)

## ⚠️ Contraintes techniques STRICTES (à respecter dans toute proposition)

- **Vanilla JS, pas de framework, pas de bundler.** Pas de Tailwind, pas de composants React — uniquement du CSS (dans `styles.css`) et des ajustements de markup dans `index.html`.
- **Ne JAMAIS renommer ou supprimer un `id` ou une classe existante** : le JS les cible directement (`$()`/`$$()`, `#screen-<nom>`, `#convFilesPanel`, `#callOverlay`, `#mediaEditor`, `[data-cmtchip]`, etc.). On peut AJOUTER des classes, pas retirer les existantes.
- **Ne JAMAIS toucher aux attributs `onclick`** ni aux fonctions qu'ils appellent.
- **Conserver et étendre les variables CSS existantes** (`--bg-card`, `--border`, `--muted`, `--accent`…) plutôt que des couleurs en dur.
- **Accessibilité non négociable** : contrastes AA minimum, cibles tactiles ≥ 44px, champs de saisie ≥ 16px (anti-zoom iOS), conserver tous les attributs `aria-*` et `aria-live` existants.
- **Mobile-first** : l'app se consomme à 95 % sur téléphone ; le desktop est secondaire.
- Beaucoup de HTML est généré par des template literals JS — pour ces zones, proposer les changements en termes de **classes CSS et structure**, je les reporterai dans les templates.

## 🧭 Direction artistique souhaitée

- **Simplicité radicale** : moins de bordures, moins de fonds différents, plus de respiration (whitespace), une seule idée forte par écran
- **Hiérarchie claire** : 1 action primaire évidente par écran, le secondaire en retrait
- **Cohérence système** : mêmes cartes, mêmes boutons, mêmes espacements partout
- **Modernité sobre** : niveau de finition Instagram/Linear — pas de gadgets, pas de dégradés criards, le violet en accent ponctuel, pas en tapisserie
- **Emojis** : ils font partie de l'identité PASSIO, mais rationaliser leur usage dans l'UI (pas d'emoji à chaque libellé de bouton)

Procède écran par écran dans l'ordre de l'inventaire, sans en sauter aucun. Si le fichier est long, traite-le en plusieurs réponses en suivant l'inventaire — je te dirai « continue » entre chaque partie.
