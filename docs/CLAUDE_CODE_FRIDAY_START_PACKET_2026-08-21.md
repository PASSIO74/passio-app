# PASSIO — Paquet de démarrage Claude Code · vendredi 21 août 2026

- **Session prévue** : vendredi 21 août 2026 à 03:00 Europe/Paris
- **Branche de cadrage** : `product/passio-core-simplification-2026-08-20`
- **Dépôt attendu** : `PASSIO74/passio-app`
- **Objectif** : repartir immédiatement de la dernière version réelle du produit, puis exécuter les lots dans un ordre sûr et borné sans rouvrir les décisions déjà tranchées.

---

## 1. Mandat produit

PASSIO se simplifie autour de :

> **« partage tes Passio et rencontre les gens »**

Boucle canonique :

```text
Passion
→ contenu pertinent
→ personne intéressante
→ interaction
→ profil
→ conversation
→ IRL
→ nouvelle expérience
→ nouveau contenu
```

Valeurs produit :

```text
Découvrir · Partager · Rencontrer (IRL)
```

Les deux piliers indissociables du cœur sont :

1. **Feed** — découvrir et partager autour de ses passions ;
2. **IRL** — transformer naturellement ces découvertes et relations en expériences réelles.

---

## 2. Décisions déjà prises — ne pas redébattre pendant l’implémentation

- Wallet supprimé du cœur.
- Passia, points, étoiles, Score Passion, rangs, leaderboard, packs, Pass Passion, boutique et piste crypto supprimés du cœur.
- Aucun score ou monnaie générique de remplacement.
- CDV / carnet de voyage extrait vers **Passio : Voyage** ; données et briques partagées préservées.
- Navigation cible : **Fil · IRL · Créer · Messages · Profil**.
- Explorer est dépromu : la recherche devient une capacité contextuelle/globale, pas une destination cœur autonome.
- Bobines et stories sont des formats / modes de lecture, pas des destinations obligatoires.
- `Créer` devient une action centrale, pas un écran Studio à parcourir.
- Création V2 : **Publication · Bobine · Activité IRL**, audio/podcast sous `Plus` si conservé.
- Multi-profil reste fondamental mais se sépare des intérêts Feed.
- Choisir une Passio dans le Feed ne change jamais silencieusement l’identité active.
- Ajouter une Passio à ses intérêts ne crée pas automatiquement un profil passion public.
- Onboarding : passions choisies → Feed pertinent immédiat + un seul profil de départ.
- Recherche : un **ID canonique mondial par Passio**, avec synonymes, variantes linguistiques et sous-Passio.
- Messages : pont humain vers l’IRL, pas produit d’engagement autonome.
- IRL : second pilier du produit, mais aucun lancement public large avant gates Trust & Safety.
- Notifications : réengagement sain ; aucune quête/récompense/FOMO ; notification sociale server-authoritative.
- Sentinelle et Centre de pilotage supervisent toutes les nouvelles briques.

---

## 3. Étape 0 obligatoire à CHAQUE reprise Claude Code

Avant toute modification, confirmer que ChatGPT et Claude Code travaillent sur la **dernière version réelle** de PASSIO.

Claude Code doit afficher et vérifier :

```text
repo
branche
HEAD
merge-base
status
changements non commités
branches locales pertinentes
comparaison avec main
comparaison avec la branche de cadrage
```

Puis vérifier l’interface réellement exécutée :

- build/version affichée ;
- écrans mobiles actuels ;
- navigation ;
- derniers écrans de référence disponibles ;
- absence de version cache/service-worker obsolète.

### Stop condition

Ne rien modifier si :

- des changements utilisateur non commités risquent d’être écrasés ;
- le repo/branch est ambigu ;
- l’interface exécutée ne correspond pas au code inspecté ;
- la référence réelle la plus récente n’est pas déterminée.

---

## 4. Documents normatifs — ordre de lecture

### Vision et simplification

1. `.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`
2. `docs/PASSIO_PRODUCT_AUDIT_V2_2026-08-20.md`
3. `docs/CLAUDE_CODE_REPRISE_PRODUCT_2026-08-20.md`

### Retrait de dette produit

4. `docs/PASSIO_WALLET_PASSIA_REMOVAL_MAP_2026-08-20.md`
5. `docs/PASSIO_WALLET_PASSIA_DB_STATE_AUDIT_2026-08-20.md`
6. `docs/PASSIO_CDV_EXTRACTION_MAP_2026-08-20.md`

### Entrée / navigation / Feed / création

7. `docs/PASSIO_CORE_NAV_AND_JOURNEYS_V2_2026-08-20.md`
8. `docs/PASSIO_NAV_V2_IMPLEMENTATION_LOT_2026-08-20.md`
9. `docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md`
10. `docs/PASSIO_FEED_V2_CORE_EXPERIENCE_2026-08-20.md`
11. `docs/PASSIO_CREATION_V2_IMPLEMENTATION_LOT_2026-08-20.md`

### Identité / relation

12. `docs/PASSIO_PROFILE_MULTIPROFILE_V2_2026-08-20.md`
13. `docs/PASSIO_MESSAGES_CONVERSATION_V2_2026-08-20.md`
14. `docs/PASSIO_FEED_PROFILE_MESSAGE_LOT_2026-08-20.md`
15. `docs/PASSIO_CONVERSATION_TO_IRL_LOT_2026-08-20.md`

### IRL

16. `docs/PASSIO_IRL_TRUST_SAFETY_AUDIT_2026-08-20.md`
17. `docs/PASSIO_IRL_V2_PRODUCT_EXPERIENCE_2026-08-20.md`

### Découverte / réengagement

18. `docs/PASSIO_SEARCH_DISCOVERY_V2_2026-08-20.md`
19. `docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md`

### Mesure / preuves / exploitation

20. `docs/PASSIO_CORE_FUNNEL_ANALYTICS_V1_2026-08-20.md`
21. `docs/PASSIO_ACCEPTANCE_TEST_MATRIX_2026-08-20.md`
22. `docs/PASSIO_SENTINELLE_MOBILE_HARDENING_SPEC_2026-08-20.md`
23. `.passio/context/MULTI_PROFILE.md` — **à considérer comme partiellement stale sur la réalité serveur ; Profil V2 fait foi sur le nouveau modèle.**
24. `.passio/context/TESTING_STRATEGY.md`
25. `PASSIO_SENTINELLE_JOINT_AUDIT.md` avant toute extension de capacité Sentinelle.

---

## 5. Baseline avant premier diff

Enregistrer les faits, sans approximation :

- écrans/destinations visibles ;
- occurrences Wallet/Passia/points/score/rank/crypto ;
- occurrences CDV dans nav, Feed, tour, profil, création, IA et routes ;
- comportement onboarding réel ;
- premier Feed après sélection Passio ;
- Bobines actuellement exclues/incluses du Feed ;
- mood par défaut ;
- comportement `Créer` / Studio ;
- modèle multi-profil réellement persistant ;
- identité affichée sur anciens posts/messages après changement de profil ;
- policies DM actuelles ;
- policies notifications actuelles ;
- surface push actuelle ;
- données IRL exactes accessibles publiquement ;
- check-in réel ;
- catalogue Passio réel ;
- résultats des audits/scripts disponibles ;
- suites e2e existantes ;
- photographie schéma prod régénérée avant toute migration.

Exécuter au minimum si disponible :

```text
npm run audit:globals
npm run audit:handlers
smoke
dist-build
navigation
contextual-nav
profils/interactions
feed-ranking
feed-realtime
messages
irl
authz-critical
blocage-acces
confidentialite
multi-comptes
version-skew
```

---

# 6. Ordre d’implémentation recommandé

## Lot 1 — `remove/wallet-navigation`

Premier diff volontairement simple et réversible :

- retirer destination Wallet ;
- retirer chips/CTA visibles ;
- landing/microcopy/IA sans Wallet/crypto/Passia ;
- gérer routes/deep links legacy ;
- aucune suppression DB.

Preuves : navigation, smoke, handlers, tests négatifs Wallet.

---

## Lot 2 — `remove/passia-points-core`

- neutraliser récompenses avant fonctions centrales ;
- publication/commentaire/like/profil/IRL fonctionnent sans score ;
- retirer quests/rangs/Passia/transactions du cœur ;
- migration applicative idempotente des anciens blobs `user_state` ;
- ne pas réintroduire une autre gamification globale.

Important : supprimer aussi les notifications `quest` / récompenses.

---

## Lot 3 — `extract/cdv-core-navigation`

- dépromouvoir CDV du cœur ;
- retirer les points d’entrée Feed/nav/profil non pertinents ;
- préserver données, media, commentaires, tables et routes utiles à Passio : Voyage ;
- aucun purge destructif opportuniste.

---

## Lot 4 — `simplify/onboarding-first-value`

Priorité : corriger le défaut actuel où les passions sélectionnées peuvent mener à un Feed vide.

Cible :

```text
passions choisies
→ selectedFeedPassions persisté
→ Feed pertinent
↘ un profil passion de départ
```

- pas de GPS obligatoire ;
- pas de Wallet ;
- pas de tour long forcé ;
- reload/cross-device idempotent.

---

## Lot 5 — `improve/feed-v2-core`

En petits diffs :

1. intérêts Feed persistants ;
2. mood non restrictif par défaut ;
3. CDV retiré du Feed cœur ;
4. Bobines réintégrées comme posts éligibles ;
5. viewer Bobines conservé comme mode de lecture ;
6. recherche Passio/personnes réutilisée depuis Feed ;
7. modules personnes bornés plus tard ;
8. événements IRL seulement après gates T&S.

### Interdit

Ne pas changer la formule de ranking dans ce premier lot.

---

## Lot 6 — `simplify/create-v2`

- bouton central `Créer` → action sheet ;
- Publication = texte/photo/vidéo unifiés autour de `publishPost()` ;
- identité active affichée explicitement ;
- Bobine ouvre l’éditeur existant ;
- Activité IRL ouvre `openCreateEvent()` ;
- audio/podcast secondaire ;
- aucune récompense visible ;
- aucune permission caméra/micro/GPS au simple tap sur Créer.

---

## Lot 7 — Profil V2 · `improve/profile-multiprofile-v2`

### P2-0 audit obligatoire avant migration

Vérifier exactement :

- `profiles` et toutes ses FK ;
- `state.user.profiles` ;
- `switchToProfile()` ;
- `supaUpsertProfile()` ;
- rendu posts/stories/messages ;
- identité historique ;
- privacy/follows.

### Séquence

1. retirer Score/Passia/paywall profil de l’UI ;
2. clarifier `Mes Passio` vs filtre contenu ;
3. introduire `passion_profiles` expand-only + RLS ;
4. matérialiser les profils existants idempotemment ;
5. ajouter `posts.passion_profile_id nullable` ;
6. préserver fallback legacy ;
7. stories puis événements après preuves.

### Invariant

Ne jamais réutiliser `profiles.id` comme ID de profil passion.

---

## Lot 8 — Messages V2 sécurité d’abord · `harden/messages-v2`

### M2-0 audit exact

Avant UI : policies, conversations, conv_members, conv_messages, outbox, realtime, drafts, persona metadata, calls, groups.

### M2-1 P0 avant tout redesign

- INSERT message exige membership ;
- conversations INSERT durci ;
- block dans les deux sens ;
- tests raw REST : C connaît `conv_id` A↔B mais C ne peut pas écrire ;
- spoof `from_id` refusé.

Puis seulement :

- inbox simplifiée ;
- groupes sous `+` ;
- failed/retry fiable ;
- Conversation → IRL ;
- identité structurée après Profil V2 serveur.

---

## Lot 9 — Gate Trust & Safety IRL

Avant d’accélérer l’IRL public :

1. données publiques événement sûres ;
2. `event_private_details` / équivalent ;
3. participants non publics en brut ;
4. block serveur transversal ;
5. 13–17 hors IRL au lancement public ;
6. waitlist/organizer authz ;
7. check-in serveur non dérivable ;
8. commentaires/réactions alignés aux règles d’accès.

### No-Go

Aucune UI « adresse privée », « présence vérifiée » ou « événement privé » si le serveur ne l’applique pas réellement.

---

## Lot 10 — IRL V2 · `improve/irl-v2-core`

Après gates :

- liste prioritaire ;
- carte secondaire/repliable ;
- GPS uniquement sur geste explicite ;
- cards sûres ;
- fiche avec zone publique puis détails gated ;
- RSVP/waitlist ;
- conversation événement ;
- création progressive ;
- zéro Passia/points ;
- check-in serveur ;
- post-IRL → Creation V2 → Feed/album.

---

## Lot 11 — Recherche & Découverte V2 · `improve/search-discovery-v2`

### D2-0 audit

Chercher tous les usages de :

```text
PASSIONS
customPassions
passionById
filterExplore
openPassionExplorer
supaSearchUsers
passion_id
```

### Séquence

1. extraire un moteur Passio/personnes réutilisable ;
2. loupe Feed/topbar → overlay global ;
3. dépromouvoir `screen-explore` ;
4. séparer `Ajouter à mon Feed` de `Créer mon profil Passio` ;
5. taxonomie expand-only ;
6. synonymes/locales/sous-Passio ;
7. migration customPassions ;
8. contenu/IRL seulement sous RLS prouvée.

Ne pas construire un moteur externe lourd avant nécessité mesurée.

---

## Lot 12 — Notifications V2 sécurité d’abord · `harden/notifications-v2`

### N2-0 audit

Vérifier :

- producteurs de notifications ;
- table/policies `notifications` ;
- présence réelle d’une policy UPDATE owner-only ;
- `push_subscriptions` ;
- `supaInsertNotif` ;
- realtime ;
- SW ;
- `notify-call` ;
- permission OS ;
- settings.

### N2-1 P0

Fermer le chemin actuel où un client authentifié peut fournir une cible + un texte social à l’Edge Function push.

Cible :

- `notify-call` = appels seulement ;
- appels vérifient membership/block/rate limit ;
- notification sociale créée à partir d’une action serveur réelle ;
- push sociale dédiée reçoit `notification_id` ou événement serveur vérifié ;
- templates serveur ;
- aucune phrase arbitraire client → lockscreen.

### Ensuite

- état lu cross-device ;
- préférences owner-only ;
- soft prompt ;
- aucun prompt OS au simple DM ;
- DM preview off par défaut ;
- likes agrégés ;
- deep links sûrs ;
- IRL push sans adresse privée ;
- aucun quest/points/Passia.

---

## Lot 13 — Boucle relationnelle et analytics

Quand les briques sont sûres :

```text
Feed → Profil → Message → IRL → post-IRL
```

Instrumenter :

```text
signup_completed
→ passions_selected
→ personalized_feed_viewed
→ meaningful_interaction
→ conversation_started
→ irl_intent
→ irl_rsvp
→ irl_attended
→ post_irl_contribution
```

Aucune donnée privée inutile dans analytics.

Le ranking profond Feed vient **après** ces mesures.

---

# 7. Dépendances critiques

```text
Wallet/Passia removal
        ↓
Onboarding + Feed + Creation simplifiés
        ↓
Profile V2 foundation
        ↓
Messages identity future

Messages authz P0 ─────────┐
                           ├→ Conversation → IRL
IRL Trust & Safety P0 ─────┘
        ↓
IRL V2 public-ready

Search UI extraction
        ↓
Taxonomie canonical
        ↓
Onboarding/Feed/Creation/Profile/IRL partagent le même passion_id

Notifications authz P0
        ↓
Push sociale / IRL reminders / réengagement sain
```

---

# 8. Contrôle croisé des IA

## ChatGPT

- garde promesse et scope ;
- arbitre UX/architecture produit ;
- vérifie cohérence entre specs ;
- définit acceptance/no-go ;
- protège simplicité, privacy et boucle Feed + IRL.

## Claude Code

- possède la vérité du dépôt local ;
- annonce les fichiers avant chaque lot ;
- recherche exhaustivement ;
- implémente ;
- migre expand-only ;
- teste ;
- mesure ;
- fait de petits commits relisibles ;
- ne suppose jamais que la spec décrit encore exactement la prod.

## Codex

Après chaque lot sensible :

- DM non-member write ;
- `from_id` spoof ;
- profile identity spoof ;
- historique identité ;
- IRL address/participant leak ;
- check-in forge ;
- mineur API bypass ;
- search private/block leak ;
- notification arbitrary target/text ;
- push block bypass ;
- analytics PII leak ;
- races/retries/idempotence.

Codex attaque les frontières ; il ne redéfinit pas le produit.

---

# 9. Garde-fous absolus

- pas de suppression DB opportuniste ;
- pas de migration destructive sans inventaire + rollback + tests ;
- pas de mega-commit Wallet + identity + IRL + notifications ;
- pas de test désactivé pour passer CI ;
- pas de service_role dans le client ;
- pas de ranking modifié au feeling ;
- pas de Bobine boostée par format ;
- pas de nouvelle gamification générique ;
- pas de profil passion créé silencieusement ;
- pas de changement silencieux d’identité ;
- pas d’adresse/GPS exact public par commodité ;
- pas de check-in « vérifié » client-only ;
- pas de DM write sans membership ;
- pas de notification/push avec cible ou texte arbitraire contrôlé par le client ;
- pas de texte DM lockscreen par défaut ;
- pas de permission caméra/micro/GPS/push au mauvais moment ;
- pas de 13–17 IRL client-only ;
- pas d’auto-merge/auto-deploy Sentinelle ;
- main/prod uniquement après preuves + revue explicite.

---

# 10. Campagne avant fusion du chantier cœur

Ordre recommandé :

1. audits globals/handlers ;
2. smoke + dist-build ;
3. navigation/contextual-nav ;
4. Wallet/legacy state negatives ;
5. onboarding ;
6. Feed + ranking + realtime ;
7. Creation ;
8. Profile + multi-profile ;
9. Messages + raw REST authz ;
10. IRL + raw REST T&S ;
11. Search RLS/private/block ;
12. Notifications/push authz/PWA ;
13. multi-account ;
14. version-skew ;
15. analytics privacy ;
16. Sentinelle/mobile cockpit.

---

# 11. Première phrase recommandée à Claude Code

> Reprends PASSIO depuis la dernière version réelle vérifiée du dépôt `PASSIO74/passio-app`, puis compare repo, branche, HEAD, status, changements locaux, build exécuté et interface mobile avec la référence la plus récente avant toute modification. Charge ensuite `product/passio-core-simplification-2026-08-20`, lis le paquet et les specs dans l’ordre, enregistre la baseline, puis commence uniquement `remove/wallet-navigation`. Avant chaque lot, annonce les fichiers réellement impactés, les migrations éventuelles et les tests qui prouveront le résultat.

---

# 12. Résultat attendu de la première séquence

À la fin du premier bloc Claude Code :

- dernière version réelle confirmée ;
- baseline enregistrée ;
- inventaire Wallet/CDV confirmé localement ;
- premier diff Wallet borné ;
- aucune DB supprimée ;
- tests du lot verts ;
- diff relisible ;
- revue ChatGPT ;
- contrôle Codex ciblé ;
- lot suivant clairement identifié sans scope creep.
