# PROMPT À COLLER DANS CLAUDE CODE — Contrôle final des 16 missions + finalisation commerciale

> Copie tout ce qui suit la ligne, et colle-le dans Claude Code lancé depuis `C:\Users\BENJAMIN\Desktop\PASSIO`.

---

Tu es auditeur qualité senior ET développeur de finalisation sur l'application PASSIO. Lis d'abord `CLAUDE.md` et `docs/RAPPORT_SESSION_2026-06-10.md` en entier avant toute action.

# CONTEXTE

PASSIO a fait l'objet d'un programme de pré-commercialisation en 16 missions (liste complète ci-dessous). Plusieurs sessions ont déclaré des missions « faites ». Ta mission n'est PAS de refaire le travail : c'est de **CONTRÔLER, PREUVE À L'APPUI, que chaque mission est réellement terminée**, de **corriger ou terminer** ce qui ne l'est pas, et de livrer une application **prête à être commercialisée, sans aucun bug**.

# RÈGLE D'OR : PREUVE OU ÉCHEC

Pour chaque point de contrôle, tu dois produire une PREUVE VÉRIFIABLE : sortie de commande, test automatisé vert, capture d'écran Playwright, grep dont tu montres le résultat. **Interdit** de marquer ✅ sur la base d'une déclaration d'une session précédente, d'un commentaire dans le code, ou d'une intuition. Si tu ne peux pas prouver, le statut est ❌ et tu corriges. Chaque correction doit être suivie d'une re-vérification.

# MÉTHODE DE TRAVAIL

1. Crée `docs/CONTROLE_16_MISSIONS.md` : tableau des 16 missions × (critères de contrôle, commande/preuve, statut, action corrective, re-vérification).
2. Travaille mission par mission, dans l'ordre. Utilise le mode plan pour les corrections lourdes, et des sous-agents pour paralléliser les audits en lecture seule.
3. Utilise TOUS les skills et outils disponibles : `/security-review` pour la mission 10, le skill frontend-design (ou tout skill design installé — c'est lui « Claude Design ») pour les missions 4-5-6, Playwright pour toutes les preuves visuelles et fonctionnelles. Liste les skills disponibles au démarrage et indique dans le rapport lesquels tu as utilisés pour quoi.
4. Commits atomiques par mission contrôlée : `audit(mX): ...` ou `fix(mX): ...`. Push réguliers (la CI teste + déploie sur Netlify).
5. Respecte ABSOLUMENT les conventions et pièges de `CLAUDE.md` (build à 9 fichiers, hoisting, `escapeHtml()`, `toast()`, gate-helper, deadlock supabase-js, code mort de `supaInit`, garde `state.onboarded` de `initApp()`).

# LES 16 MISSIONS À CONTRÔLER (critères précis)

## Mission 1 — Audit complet
Contrôle : refais un audit statique ET runtime à froid. (a) Script qui extrait tous les handlers inline (`onclick/oninput/onchange/onmousedown/onmouseup/ontouchstart/ontouchend`) de `index.html` + des template literals JS, et vérifie que chaque fonction appelée existe (attention faux positifs : méthodes `.find(`, etc.). (b) `npm test` vert. (c) Zéro erreur console au boot et sur un tour des 8 écrans (test Playwright qui collecte `pageerror`). Preuve : sorties de script + rapport de test.

## Mission 2 — Tests utilisateur simulés
Contrôle : `tests/e2e/multi-comptes.spec.js` existe et passe (`PASSIO_E2E_MULTI=1 npm test`). Étends-le ou crée des specs pour couvrir les 9 profils types du cahier des charges : nouvel utilisateur complet (onboarding entier), créateur (post texte + photo + carnet), visiteur (consultation sans publier), utilisateur actif (3 posts, likes, commentaires), messageur (conversation + vocal + GIF + pièce jointe), visiteur de profils (navigation profil → profil), partageur (partage post + profil + CDV), profil incomplet (saute des étapes), multi-passions (3 profils passion). Chaque parcours = un test Playwright vert. Preuve : sortie `npm test` complète.

## Mission 3 — Correction des bugs
Contrôle : croise les bugs listés dans `docs/RAPPORT_SESSION_2026-06-10.md` (14 bugs) et `CLAUDE.md` (4 bugs critiques du 2026-06-11) avec le code actuel : vérifie par grep/lecture que chaque fix est présent ET couvert par un test quand c'est possible. Tout nouveau bug découvert pendant ce contrôle est corrigé immédiatement + ajouté au rapport. Preuve : tableau bug → fichier:ligne du fix → test qui le couvre.

## Mission 4 — UX/UI (« Claude Design »)
Contrôle visuel systématique : script Playwright qui capture les 8 écrans + états vides + modals principaux en 390×844 (mobile) et 1280×800 (desktop), dépose les captures dans `docs/screenshots/`. Examine chaque capture et corrige : débordements, textes tronqués, espacements incohérents, hiérarchie faible, états vides moches, boutons mal alignés. Utilise le skill design disponible pour proposer et appliquer les améliorations (sans casser l'identité violette #7c3aed ni les variables CSS). Preuve : captures avant/après + liste des changements.

## Mission 5 — Onglets & navigation
Contrôle : test Playwright qui clique chaque onglet de la bottom-nav + bouton « + » + topbar (wallet, notifications, menu ⋯) et vérifie que l'écran attendu devient actif, sans erreur console, en moins de 500 ms. Vérifie la cohérence des icônes et libellés (Fil, Bobines, Explorer, Messages, IRL, CDV). Preuve : test vert + captures.

## Mission 6 — Partage de données et contenus
Contrôle : tests E2E réels (pas de mock) : publier texte / photo (fixture < 500 Ko) / vidéo (fixture) / carnet CDV ; vérifier l'apparition immédiate dans le fil (optimistic update) ET la persistance après reload ; supprimer et éditer si l'UI le propose ; gérer le cas d'erreur upload (fixture > limite → toast d'erreur, pas de crash). Preuve : tests verts.

## Mission 7 — Profils et visites de profils
Contrôle : création de profil passion, modification (bio, photo, RS), bascule entre profils, visite du profil d'un autre utilisateur (depuis un post du fil et depuis la recherche), abonnement/désabonnement, partage de profil. Vérifie que badges (`#profileBadges`) et graphe d'activité (`#activityGraph`) se remplissent. Preuve : tests + captures.

## Mission 8 — Messagerie
Contrôle : multi-comptes déjà testé (mission 2) ; vérifie en plus : galerie pièces jointes (`#convFilesPanel`) avec contenu réel (média + vocal + doc), paramètres de conversation (mute, effacer, exporter, supprimer), groupes (création, renommage, membres), notifications de message, états vides. Le décodage des messages passe bien partout par `applyMsgContentData()` (grep : aucun parsing JSON de `content` en dehors). Preuve : tests + grep.

## Mission 9 — Performance et scalabilité
Contrôle : (a) Lighthouse (ou audit Playwright équivalent) sur la prod https://passio-app.netlify.app : Performance ≥ 85 mobile, vise 90+. (b) Poids réseau initial < 500 Ko hors médias. (c) Pagination : fil paginé ✅, messages paginés ✅ (`_loadMoreMsgs`), liste de conversations à paginer si > 30. (d) Toutes les images de templates ont `loading="lazy"`. Preuve : scores chiffrés avant/après.

## Mission 10 — Sécurité et données
Contrôle : lance `/security-review` sur tout le repo. Vérifie : aucune clé secrète en clair (la clé `anon` Supabase est OK par design, rien d'autre) ; `escapeHtml()` sur TOUTE interpolation de contenu utilisateur dans du HTML (script de vérification des template literals) ; RLS : liste les policies attendues par table et compare avec `migrations/` ; CSP dans `netlify.toml` à jour ; le gate (code 2125) intact : `npm test` access-gate vert. Preuve : rapport sécurité + sorties.

## Mission 11 — Mise en ligne
Contrôle : CI verte sur le dernier commit, build `node scripts/build.js` OK en local, prod accessible avec gate fonctionnel, manifest + SW + icônes servis (HTTP 200), monitoring `client_errors` opérationnel (provoque une erreur de test et vérifie l'insertion en base). Preuve : sorties + checks HTTP.

## Mission 12 — Tests automatisés
Contrôle : inventaire des specs existantes ; la suite complète couvre au minimum : gate, smoke, multi-comptes, navigation (m5), publication (m6), profils (m7), messagerie (m8). Toutes vertes en local ET en CI. Ajoute un script `npm run test:all` documenté. Preuve : sortie complète.

## Mission 13 — Skills
Contrôle : au démarrage, liste les skills/plugins disponibles ; dans le rapport final, indique lesquels ont servi pour quelles missions (design, sécurité, tests…). Si un skill utile manque (ex. frontend-design), signale-le à l'utilisateur avec la commande d'installation.

## Mission 14 — Accessibilité grand public
Contrôle : zoom non bloqué (grep viewport : pas de `user-scalable=no` ni `maximum-scale`) ; contrastes AA sur les textes (vérifie `--muted` et les textes sur fond violet) ; cibles tactiles ≥ 44 px sur la bottom-nav, les boutons de conversation et les modals ; tous les champs ≥ 16 px (anti-zoom iOS) ; labels/aria sur les boutons-icônes ; messages d'erreur compréhensibles (pas de jargon technique dans les toasts). Preuve : script d'audit + corrections.

## Mission 15 — Livrables
Contrôle : produis/actualise : `docs/CONTROLE_16_MISSIONS.md` (le tableau de contrôle complet), `docs/CHECKLIST_COMMERCIALISATION.md` (chaque onglet/bouton/icône/fonctionnalité testé : ✅/❌), rapport de performance (m9), rapport de sécurité (m10), liste des points restants nécessitant une décision humaine (clé API Giphy, nom de domaine, comptes admin…), instructions local + déploiement à jour dans `CLAUDE.md`.

## Mission 16 — Verrouillage par code
Contrôle : suite `access-gate.spec.js` verte ; le code n'apparaît NULLE PART en clair dans le code source (grep `2125` → uniquement hash/docs/tests via gate-helper) ; deep links protégés ; `docs/SECURITE_CODE_ACCES.md` à jour. Preuve : grep + tests.

# PÉRIMÈTRE DES CORRECTIONS

- Tout ❌ doit être corrigé dans la même session si c'est du code ; si ça demande une décision humaine (clé API, paiement, compte), liste-le dans « décisions requises » avec une recommandation.
- Backlog connu encore ouvert (à intégrer au contrôle) : GIFs Giphy hardcodés → si pas de clé API disponible, implémente le client Tenor/Giphy avec clé en variable et fallback sur les listes actuelles, et demande la clé à l'utilisateur ; redesign écran par écran (mission 4) ; pagination de la liste de conversations (mission 9).
- Ne touche PAS : le code d'accès (2125), le schéma Supabase sans migration documentée, l'ordre des fichiers app-01→09.

# FORMAT DU RAPPORT FINAL (à la fin de la session)

1. Tableau des 16 missions : statut prouvé (✅ avec preuve / ⚠️ partiel / ❌), preuves, corrections appliquées.
2. Liste des nouveaux bugs trouvés et corrigés (fichier:ligne).
3. Sortie complète de `npm run test:all`.
4. Scores de performance avant/après.
5. Décisions humaines requises, avec recommandations.
6. Verdict final motivé : « prêt à commercialiser : OUI / NON, parce que… ».

Commence maintenant : lis CLAUDE.md, liste les skills disponibles, crée le tableau de contrôle, puis attaque la mission 1.
