# PASSIO — Release Execution Board J0 → J6

- **Date de cadrage** : 2026-08-20
- **Branche documentaire** : `product/passio-core-simplification-2026-08-20`
- **Dépôt** : `PASSIO74/passio-app`
- **Document parent** : `docs/PASSIO_MASTER_IMPLEMENTATION_ROADMAP_2026-08-20.md`
- **But** : transformer la roadmap en tableau de pilotage opérationnel pour Claude Code + ChatGPT + Codex.

---

# 1. Légende de statut

Chaque lot possède un statut unique :

```text
BLOCKED
READY
IN_PROGRESS
REVIEW
GREEN
ROLLED_BACK
DEFERRED
```

## BLOCKED

Une dépendance ou une preuve manque.

## READY

Le scope, les dépendances et les tests sont suffisamment clairs pour commencer après vérification de la dernière version réelle.

## IN_PROGRESS

Claude Code travaille sur le lot.

## REVIEW

Diff terminé localement, tests ciblés exécutés, en attente de revue ChatGPT/Codex.

## GREEN

Critères d’acceptation + sécurité + tests + instrumentation validés.

## ROLLED_BACK

Le lot a été retiré/reverti car son risque ou sa régression est supérieur à son bénéfice.

## DEFERRED

Hors chemin critique actuel.

---

# 2. Règle d’utilisation

Ce fichier est un **board**, pas une promesse d’état automatique.

Claude Code doit mettre à jour le statut seulement après avoir produit les preuves réelles.

Une ligne ne devient jamais `GREEN` uniquement parce que :

- le code compile ;
- l’écran semble bon ;
- un test isolé passe ;
- le diff est petit.

Le contrat `GREEN` est :

```text
comportement attendu
+ tests ciblés
+ non-régression minimale
+ sécurité si concernée
+ instrumentation/Sentinelle si nouvelle surface
+ mobile si surface utilisateur
+ rollback connu
```

---

# 3. Vérification obligatoire avant CHAQUE session

## EXEC-00 — Latest real version check

**Statut initial : READY**

### Responsable principal

Claude Code.

### Vérifier

```text
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
git merge-base HEAD main
git log --oneline -n 15
```

Puis :

- quelle branche contient le dernier code réellement exécuté ;
- quels changements locaux existent ;
- version/build visible ;
- service worker/cache ;
- derniers écrans mobiles réels ;
- dernier schéma prod.

### Commandes dépôt utiles

```text
npm run schema:baseline
npm run audit:globals
npm run audit:handlers
npm run audit:echappement
npm run audit:tests
```

### Preuve à consigner

```text
REPO=
BRANCH=
HEAD=
MAIN=
MERGE_BASE=
DIRTY=
RUNNING_BUILD=
SCHEMA_BASELINE=
```

### GO

Tout est déterminé et aucun travail utilisateur ne risque d’être écrasé.

### NO-GO

Version réelle inconnue, schéma inconnu, working tree sensible non sauvegardé ou cache exécutant une autre version.

### Revue IA

ChatGPT : vérification du contexte produit uniquement si une divergence apparaît.

Codex : non requis.

---

# 4. Board global

| ID | Lot | Statut initial | Jalon | Dépendance dure | Codex |
|---|---|---|---|---|---|
| EXEC-00 | Dernière version réelle | READY | J0 | aucune | non |
| SEC-00 | migration-checker / schema truth | READY | J0 | EXEC-00 | oui si modifié |
| PROD-01 | Wallet navigation | READY | J1 | EXEC-00 | optionnel |
| PROD-02 | Passia / points cœur | BLOCKED | J1 | PROD-01 | optionnel |
| PROD-03 | CDV hors cœur | READY | J1 | EXEC-00 | optionnel |
| PROD-04 | Onboarding First Value | BLOCKED | J1 | PROD-02 | non |
| PROD-05 | Feed V2 foundation | BLOCKED | J1/J2 | PROD-04 | non |
| PROD-06 | Create V2 | BLOCKED | J1/J2 | PROD-02 | non |
| PROD-07 | Navigation V2 | BLOCKED | J1/J2 | PROD-03/05/06 | non |
| SEC-01 | DM authz P0 | READY | J2/J3 | EXEC-00 | **oui** |
| SEC-02 | Notifications authz P0 | READY | J6 | EXEC-00 | **oui** |
| PROD-08 | Profile V2 UI cleanup | BLOCKED | J2 | PROD-02 | non |
| PROD-09 | Messages V2 UI | BLOCKED | J2/J3 | SEC-01 | selon diff |
| SEC-03 | IRL private details | BLOCKED | J4 | SEC-00 | **oui** |
| SEC-04 | IRL block/minor authz | BLOCKED | J4 | SEC-00 | **oui** |
| SEC-05 | IRL check-in | BLOCKED | J4 | SEC-03/04 | **oui** |
| PROD-10 | Conversation → IRL | BLOCKED | J4 | SEC-01/03/04 + PROD-09 | oui |
| PROD-11 | IRL V2 core | BLOCKED | J4 | SEC-03/04 | oui |
| PROD-12 | Post-IRL → Feed | BLOCKED | J4 | PROD-06/11 | selon diff |
| DATA-01 | passion_profiles expand | BLOCKED | J5 | SEC-00 | **oui** |
| DATA-02 | identité posts/stories | BLOCKED | J5 | DATA-01 | **oui** |
| DATA-03 | identité messages/events | BLOCKED | J5 | DATA-01 + SEC-01/03 | **oui** |
| DISC-01 | Search overlay V2 | BLOCKED | J5 | PROD-05 | non |
| DISC-02 | Taxonomie Passio | BLOCKED | J5 | SEC-00 | **oui** |
| NOTIF-01 | Notifications UX saine | BLOCKED | J6 | SEC-02 | selon diff |
| OPS-01 | Sentinelle couverture V2 | IN_PROGRESS conceptuel | J0→J6 | transverse | oui sur auto-actions |
| DATA-04 | Funnel analytics | READY transverse | J1→J6 | chaque lot | oui privacy |
| OPT-01 | Ranking Feed profond | DEFERRED | post-J4 | funnel fiable | oui selon modèle |

### Note

Les statuts ci-dessus décrivent la **préparation documentaire au 2026-08-20**, pas l’état du code local de Claude Code au moment de sa reprise.

La toute première action EXEC-00 peut modifier ces statuts si la branche réelle a déjà évolué.

---

# 5. J0 — Baseline / vérité / garde migrations

## J0-01 — Baseline repository + UI

**Statut : READY**

### Branche

Aucune branche de feature tant que la vérité n’est pas établie.

### Fichiers probables inspectés

```text
package.json
playwright.config.*
index.html
js/app-*.js
styles.css
sw.js
migrations/SCHEMA_PROD_REFERENCE.sql
.passio/context/*
```

### Tests/commandes

```text
npm run audit:globals
npm run audit:handlers
npm run audit:echappement
npm run audit:tests
npm run schema:baseline
```

### Test global minimum de référence

```text
npm test
```

Si trop lourd pour chaque micro-lot, au moins exécuter la suite globale avant de déclarer un jalon J1/J2/J4/J5/J6.

### Sortie attendue

Un baseline report court dans le journal de session Claude Code :

```text
screens=
core_nav=
wallet_refs=
passia_refs=
cdv_refs=
onboarding_behavior=
feed_behavior=
dm_authz_state=
notif_authz_state=
irl_privacy_state=
schema_sha=
tests_baseline=
```

---

## J0-02 — migration-checker

**Statut : READY pour audit, BLOCKED pour migrations sensibles tant que non vert**

### Objectif

Aucune migration sensible Profile/IRL/Search/Notifications sans preuve repo ↔ prod.

### Responsable

Claude Code.

### Codex

Obligatoire si le checker ou sa logique de sécurité est modifié.

### Rollback

Ne jamais appliquer une migration si le checker est incertain ; le rollback est alors **absence d’application**, pas une migration inverse improvisée.

### Gate

```text
schema repo connu
+
schema prod connu
+
ordre migrations connu
+
aucune migration manquante inattendue
```

---

# 6. PROD-01 — Wallet navigation

**Statut initial : READY après EXEC-00**

### Branche suggérée

```text
remove/wallet-navigation
```

### Fichiers probables

```text
index.html
js/app-05-config-profil.js
js/app-06-reels-partage.js
js/app-07-ia-explore-irl.js
js/app-08-ui-modals-tour.js
styles.css
```

**Claude Code doit confirmer la liste réelle avant édition.**

### Scope exact

- supprimer destination Wallet du cœur ;
- supprimer CTA/chips directs ;
- supprimer Wallet du tour cœur ;
- retirer promesse Passia/crypto landing/IA ;
- ancien deep link → fallback sûr ;
- conserver les données legacy.

### Acceptance IDs

```text
WAL-01
WAL-02
WAL-03
WAL-04
WAL-05
NAV-07 partiel
```

### Tests ciblés

```text
npm run audit:globals
npm run audit:handlers
npx playwright test tests/e2e/contextual-nav.spec.js
npx playwright test tests/e2e/dist-build.spec.js
```

Ajouter/adapter tests Wallet négatifs avant GREEN.

### ChatGPT review

Obligatoire : oui, après diff visible.

### Codex

Optionnel : recherche statique des routes/handlers oubliés.

### Rollback

Revert du commit UI ; aucune migration DB.

### GREEN si

- Wallet inaccessible du cœur ;
- aucune erreur navigation ;
- anciens blobs d’état chargent ;
- aucune donnée supprimée.

---

# 7. PROD-02 — Passia / points / Score / rangs

**Statut initial : BLOCKED par PROD-01**

### Branche

```text
remove/passia-points-core
```

### Fichiers probables

```text
js/app-01-diag-seed.js
js/app-02-state-utils.js
js/app-03-posts-vlogs.js
js/app-04-comments-shop.js
js/app-05-config-profil.js
js/app-06-reels-partage.js
js/app-07-ia-explore-irl.js
js/app-08-ui-modals-tour.js
index.html
styles.css
```

### Scope

Neutraliser les dépendances métier avant supprimer les helpers morts.

Ordre :

```text
reward calls
→ reward copy
→ profile paywall
→ score/passia UI
→ seeds quests
→ legacy sanitizer
→ dead code cleanup
```

### Acceptance

```text
WAL-06..14
NOTIF2-36
PROF2 économie subset
CREATE2 reward subset
IRL2 no Passia subset
```

### Tests ciblés

```text
npm run audit:globals
npm run audit:handlers
npm run audit:tests
npx playwright test tests/e2e/dist-build.spec.js
```

Puis tests publication/interactions/profile/IRL réellement présents dans la suite après audit.

### ChatGPT

Obligatoire : vérifier qu’aucune nouvelle gamification générique n’est ajoutée en remplacement.

### Codex

Optionnel, mais utile pour recherche de résidus `passia|score|quest|rank|reward`.

### Rollback

Revert commits applicatifs. Ne pas purger les anciens champs `user_state`.

### GREEN si

Toutes les fonctions cœur marchent sans score/passia/quest présents dans l’état.

---

# 8. PROD-03 — CDV hors cœur

**Statut initial : READY après EXEC-00 ; merge recommandé après PROD-01/02**

### Branche

```text
extract/cdv-core-navigation
```

### Fichiers probables

```text
index.html
js/app-03-posts-vlogs.js
js/app-04-comments-shop.js
js/app-05-config-profil.js
js/app-07-ia-explore-irl.js
js/app-08-ui-modals-tour.js
contextual-nav.js
styles.css
```

### Acceptance

```text
CDV-01..06
NAV CDV subset
```

### Tests

```text
npx playwright test tests/e2e/cdv.spec.js
npx playwright test tests/e2e/contextual-nav.spec.js
npm run audit:handlers
npm run audit:globals
```

### ChatGPT

Obligatoire pour vérifier que CDV devient **Voyage secondaire**, pas supprimé.

### Codex

Non, sauf modification de policies/data.

### Rollback

Réactiver les points d’entrée ; données n’ont jamais été supprimées.

### GREEN si

Le cœur ne dépend plus de CDV et les anciens carnets restent accessibles selon route de compatibilité décidée.

---

# 9. PROD-04 — Onboarding First Value

**Statut initial : BLOCKED par PROD-02**

### Branche

```text
simplify/onboarding-first-value
```

### Fichiers probables

```text
index.html
js/app-02-state-utils.js
js/app-08-ui-modals-tour.js
js/app-09-boot-pwa.js
```

### Bug P0 produit à corriger

```text
selected passions
→ profiles
→ _activeFeedPassions emptied
→ Feed potentiellement vide
```

### Target

```text
selectedPassions
→ selectedFeedPassions persistant
→ Feed

première passion
→ un starter profile
```

### Acceptance

```text
ONB-01..07
SEARCH2-36 future consistency
```

### Tests

Créer des tests e2e dédiés si absents.

Minimum :

```text
npm run audit:handlers
npx playwright test tests/e2e/access-gate.spec.js
npx playwright test tests/e2e/dist-build.spec.js
```

Puis test explicite : nouveau compte → sélection → premier Feed.

### ChatGPT

Obligatoire.

### Codex

Non, sauf changement auth/server.

### Rollback

Revert onboarding sans toucher aux données serveur historiques.

### GREEN si

Un nouveau compte voit de la valeur juste après ses passions et reload ne duplique pas les profils.

---

# 10. PROD-05 — Feed V2 foundation

**Statut : BLOCKED par PROD-04**

### Branche

```text
improve/feed-v2-foundation
```

### Fichiers probables

```text
index.html
js/app-02-state-utils.js
js/app-03-posts-vlogs.js
js/app-04-comments-shop.js
js/app-06-reels-partage.js
styles.css
```

### Sous-lots recommandés

```text
F5-A selectedFeedPassions
F5-B mood all/default
F5-C remove CDV carousel
F5-D include reels
F5-E compact discovery entry
```

### Interdit

Ne pas modifier le ranking profond dans ce lot.

### Acceptance

```text
FEED2-01..20
```

### Tests connus à préserver

Rechercher puis exécuter les specs Feed réelles du dépôt. Ne pas inventer leur nom.

Toujours :

```text
npm run audit:handlers
npm run audit:globals
npm run audit:echappement
npx playwright test tests/e2e/blocage-acces.spec.js
npx playwright test tests/e2e/confidentialite.spec.js
```

### ChatGPT

Obligatoire à la fin de chaque sous-lot UX.

### Codex

Optionnel sauf privacy/block server modifications.

### Rollback

Sous-lot par sous-lot via commits séparés.

### GREEN si

Feed multi-format, non vide après onboarding, intérêts ≠ identité et privacy/block inchangés.

---

# 11. PROD-06 — Create V2

**Statut : BLOCKED par PROD-02 ; recommandé après PROD-05**

### Branche

```text
simplify/create-v2
```

### Fichiers probables

```text
index.html
js/app-03-posts-vlogs.js
js/app-07-ia-explore-irl.js
js/app-08-ui-modals-tour.js
styles.css
```

### Acceptance

```text
CREATE2-01..24
```

### Tests

- publication texte ;
- photo ;
- vidéo ;
- Bobine ;
- entrée IRL ;
- identité affichée ;
- aucune permission sans geste métier.

Audit :

```text
npm run audit:handlers
npm run audit:echappement
```

### ChatGPT

Obligatoire.

### Codex

Non sauf upload/authz.

### Rollback

Conserver les fonctions existantes sous les nouveaux entry points ; revert de l’action sheet possible.

### GREEN si

Créer n’est plus une destination Studio lourde et toutes les créations existantes restent fonctionnelles.

---

# 12. PROD-07 — Navigation V2

**Statut : BLOCKED par PROD-03/05/06**

### Branche

```text
simplify/navigation-v2
```

### Target

```text
Fil · IRL · Créer · Messages · Profil
```

### Fichiers probables

```text
index.html
js/app-05-config-profil.js
js/app-08-ui-modals-tour.js
contextual-nav.js
styles.css
```

### Acceptance

```text
NAV-01..09
```

### Tests

```text
npx playwright test tests/e2e/contextual-nav.spec.js
npx playwright test tests/e2e/dist-build.spec.js
npm run audit:handlers
npm run audit:globals
```

### ChatGPT

Obligatoire.

### Codex

Non.

### Gate J1

J1 devient GREEN uniquement si PROD-01..07 pertinents sont GREEN.

---

# 13. SEC-01 — DM authz P0

**Statut initial : READY après EXEC-00**

### Branche

```text
security/dm-authz-p0
```

### Fichiers probables

```text
migrations/*
tests/e2e/authz-critical.spec.js
tests/e2e/blocage-acces.spec.js
js/app-04-comments-shop.js
js/app-08-ui-modals-tour.js
```

### Scope serveur

- `conv_messages INSERT` exige membership ;
- `from_id = auth.uid()` reste requis ;
- création conversation resserrée ;
- block bidirectionnel ;
- retry/outbox fail proprement.

### Acceptance

```text
DM-AUTHZ-01..05
MSG2 security subset
```

### Tests obligatoires

```text
npx playwright test tests/e2e/authz-critical.spec.js
npx playwright test tests/e2e/blocage-acces.spec.js
npx playwright test tests/e2e/conv-suppression.spec.js
```

Ajouter test multi-compte brut : C connaît `conv_id` A↔B mais INSERT rejeté.

### ChatGPT

Revue après tests pour vérifier que l’UX voulue n’est pas cassée.

### Codex

**Obligatoire.**

Attaques :

```text
known conv_id
from_id spoof
non-member insert
block A→B
block B→A
retry after block
simultaneous direct create
```

### Rollback

Migration de policy doit avoir stratégie de rollback explicite ; ne jamais revenir à une policy permissive en prod sans mesure compensatoire.

### GREEN si

La suite multi-compte prouve lecture/écriture uniquement par membres autorisés.

---

# 14. PROD-08 — Profile V2 UI cleanup

**Statut : BLOCKED par PROD-02**

### Branche

```text
simplify/profile-v2-ui
```

### Scope sans migration lourde

- retirer économie ;
- retirer Carnets cœur ;
- clarifier identité vs filtre ;
- activation explicite `Utiliser cette identité` ;
- création profil sans paywall.

### Acceptance

Sous-ensemble :

```text
PROF2-01..UX
```

Claude Code doit mapper précisément les IDs détaillés de la spec au diff.

### Tests

Rechercher les specs profile existantes et préserver :

- compte général ;
- multiples profils locaux ;
- switching ;
- privacy ;
- followers.

### ChatGPT

Obligatoire.

### Codex

Non tant qu’aucune migration/authz.

---

# 15. PROD-09 — Messages V2 UI

**Statut : BLOCKED par SEC-01**

### Branche

```text
simplify/messages-v2-ui
```

### Scope

- `+` unique ;
- groupes secondaires ;
- inbox simplifiée ;
- header profil ;
- composer réduit ;
- blocked read-only ;
- failed/retry visible.

### Preserve

```text
drafts
reply
realtime
pagination
mentions
outbox
statuses
```

### Acceptance

```text
MSG2 UI/reliability subset
```

### Tests

```text
npx playwright test tests/e2e/conv-suppression.spec.js
npx playwright test tests/e2e/authz-critical.spec.js
```

Plus les specs messages exactes trouvées dans `tests/e2e`.

### ChatGPT

Obligatoire.

### Codex

Obligatoire si le diff touche outbox/realtime/authz ; facultatif si pur layout après SEC-01 GREEN.

### Gate J2

J2 peut devenir GREEN lorsque le shell cœur PROD-01..09 pertinent + SEC-01 est GREEN.

---

# 16. SEC-02 — Notifications authz P0

**Statut : READY après EXEC-00**

### Branche

```text
security/notifications-authz-p0
```

### Fichiers probables

```text
supabase/functions/notify-call/index.ts
sw.js
js/app-08-ui-modals-tour.js
migrations/*
tests/e2e/*
```

### P0

Fermer :

```text
client authenticated
→ toUserId arbitrary
→ text arbitrary
→ social push
```

### Target

- `notify-call` appels uniquement ;
- validation conversation/block/rate limit ;
- social notification server-authoritative ;
- policy read/update/delete owner-only ;
- push sociale depuis notification serveur validée.

### Acceptance

```text
NOTIF2-01..18
NOTIF2-30..40 security/reliability
```

### Tests

Créer impérativement des tests Edge Function/API négatifs.

Conserver :

```text
npm run audit:echappement
npm run audit:globals
```

### ChatGPT

Revue privacy/UX après sécurité.

### Codex

**Obligatoire.**

Attaques : cible arbitraire, texte libre, spoof kind/ref, block, spam, cross-account seen/delete.

### GREEN si

Aucun client modifié ne peut forger une notification/push vers un autre compte.

---

# 17. SEC-03 — IRL private details

**Statut : BLOCKED par SEC-00**

### Branche

```text
security/irl-private-details
```

### Données cible

```text
events = safe public discovery fields
event_private_details = exact venue/address/GPS/contact
```

### Fichiers

```text
migrations/*
js/app-07-ia-explore-irl.js
tests/e2e/irl*.spec.js ou suites existantes après audit
```

### Acceptance

```text
IRL-TS location subset
IRL2 public/private location subset
```

### Tests

Raw REST : compte non participant connaît event_id → exact address inaccessible.

Exécuter aussi :

```text
npx playwright test tests/e2e/confidentialite.spec.js
npx playwright test tests/e2e/authz-critical.spec.js
```

### Codex

**Obligatoire.**

### Rollback

Expand-only ; anciens champs ne sont pas supprimés avant dual-read/bascule/validation.

---

# 18. SEC-04 — IRL block + minors + interaction authz

**Statut : BLOCKED par SEC-00**

### Branche

```text
security/irl-block-minor-authz
```

### Acceptance

- block domine interaction directe ;
- 13–17 IRL refusé serveur ;
- comments/reactions alignés ;
- event conversation membership.

### Codex

**Obligatoire.**

Attaques : API direct minor, blocked RSVP, blocked comment, deep link, event conversation membership bypass.

---

# 19. SEC-05 — IRL check-in

**Statut : BLOCKED par SEC-03/04**

### Branche

```text
security/irl-checkin
```

### Target

```text
random server token
TTL
scope event
idempotent
RSVP validation
audit
rotation possible
```

### Interdit

- deterministic code from event ID ;
- direct client update `checked_in_at` comme preuve ;
- raw GPS analytics.

### Codex

**Obligatoire.**

Attaques : guessed token, replay, different event, non-attendee, expired token, concurrent check-in.

---

# 20. PROD-10 — Conversation → IRL

**Statut : BLOCKED par SEC-01/03/04 + PROD-09**

### Branche

```text
improve/conversation-to-irl
```

### Acceptance

```text
M2I-01..14
```

### ChatGPT

Obligatoire.

### Codex

Oui : address leak, auto-RSVP, block bypass, source/event-conversation confusion.

### Rollback

Désactiver CTA/feature flag sans supprimer événements créés.

---

# 21. PROD-11 — IRL V2 core

**Statut : BLOCKED par SEC-03/04**

### Branche

```text
improve/irl-v2-core
```

### Sous-lots

```text
I2-4 discovery
I2-5 detail
I2-6 create
I2-7 conversation integration
I2-8 post-event
```

Les étapes de sécurité I2-1..I2-3 doivent être GREEN avant.

### Acceptance

```text
IRL2-01..42
```

### Tests

Preserve toute suite IRL existante + nouveaux raw REST/multi-account.

### ChatGPT

Obligatoire à chaque surface UX majeure.

### Codex

Oui sur les sous-lots qui touchent données/permissions.

### Gate J4

J4 ne peut pas être GREEN sans SEC-03/04 et SEC-05 si la présence est présentée comme vérifiée.

---

# 22. PROD-12 — Post-IRL → Feed

**Statut : BLOCKED par PROD-06/11**

### Branche

```text
improve/post-irl-loop
```

### Acceptance

- partage souvenir ;
- event_id lié ;
- Feed ;
- album ;
- visibilité post dominante ;
- Bobine liée à IRL possible.

### ChatGPT

Obligatoire : c’est la fermeture de la boucle cœur.

### Codex

Si album/visibility query change : obligatoire.

---

# 23. DATA-01 — passion_profiles expand

**Statut : BLOCKED par SEC-00**

### Branche

```text
data/passion-profiles-expand
```

### Fichiers

```text
migrations/*
js/app-06-reels-partage.js
js/app-08-ui-modals-tour.js
js/app-02-state-utils.js
tests/e2e/*profiles*
```

### Invariant

```text
profiles.id = account/social root
passion_profiles.id = contextual public identity
```

### Acceptance

```text
PROF2 server subset
```

### Raw attack test

A tente d’écrire `passion_profile_id` appartenant à B → rejet.

### Codex

**Obligatoire.**

### Rollback

Expand-only ; table peut rester inutilisée si bascule client revertie.

---

# 24. DATA-02 — identité posts/stories

**Statut : BLOCKED par DATA-01**

### Branche

```text
data/content-passion-profile-identity
```

### Schema

```text
posts.passion_profile_id nullable
stories.passion_profile_id nullable
```

### Legacy

Null → fallback account identity + content passion.

Aucun backfill deviné.

### Codex

**Obligatoire.**

### GREEN si

Changer le profil actif n’altère plus visuellement les anciens contenus nouvellement structurés.

---

# 25. DATA-03 — identité messages/events

**Statut : BLOCKED par DATA-01 + SEC-01/03**

### Target

```text
conv_messages.passion_profile_id nullable
events.passion_profile_id nullable
```

### Règle

Compte = autorisation.

Profil passion = identité affichée.

### Codex

**Obligatoire.**

---

# 26. DISC-01 — Search overlay V2

**Statut : BLOCKED par PROD-05**

### Branche

```text
improve/search-overlay-v2
```

### P0 sans migration taxonomie

- overlay global ;
- Passions ;
- personnes ;
- retour contexte ;
- Explorer dépromu ;
- intérêt Feed ≠ profil passion.

### Acceptance

Sous-ensemble :

```text
SEARCH2-01..20
```

### ChatGPT

Obligatoire.

### Codex

Si aucune nouvelle query serveur sensible : optionnel.

---

# 27. DISC-02 — Taxonomie Passio

**Statut : BLOCKED par SEC-00**

### Branche

```text
data/passion-taxonomy-v2
```

### Cible expand-only

```text
passions extensions
passion_terms
passion_proposals
alias/merge redirects
```

### Invariant

Un ID canonique mondial par passion.

### Acceptance

```text
SEARCH2 synonym/locale/subpassion/merge/proposal subset
```

### Codex

**Obligatoire** pour migration, merge et cross-reference integrity.

---

# 28. NOTIF-01 — Notifications UX saine

**Statut : BLOCKED par SEC-02**

### Branche

```text
improve/notifications-v2-ux
```

### Scope

- soft prompt ;
- pas de prompt OS au simple DM ;
- catégories simples ;
- DM preview off par défaut ;
- agrégation likes ;
- deep links ;
- IRL notifications safe ;
- quiet hours si serveur prêt ;
- aucune gamification.

### Acceptance

```text
NOTIF2-14..29
NOTIF2-34..42
```

### ChatGPT

Obligatoire.

### Codex

Privacy/deep-link review obligatoire si contenu sensible/push payload change.

---

# 29. DATA-04 — Funnel analytics

**Statut : READY transverse**

### Règle

Chaque lot ajoute seulement les événements nécessaires.

### Funnel

```text
signup_completed
passions_selected
personalized_feed_viewed
meaningful_interaction
conversation_started
irl_intent
irl_rsvp
irl_attended
post_irl_contribution
```

### Interdit dans properties

```text
DM text
search raw query
exact address
GPS
email
phone
report/block free text
```

### Codex

Obligatoire lors de nouveaux payloads privacy-sensitive.

---

# 30. OPS-01 — Sentinelle V2 transverse

**Statut : IN_PROGRESS conceptuel ; implémentation par lot**

Chaque PR doit répondre :

```text
Que surveille la Sentinelle ?
Quel signal indique un incident ?
Quel feature flag/kill switch existe ?
Quel rollback ?
Qu’est-ce qui est visible mobile ?
```

### Minimum par domaine

Feed : feed-empty anomaly, render failure.

Messages : non-member attempt, outbox loop, RLS failure.

IRL : private detail denial, block bypass, check-in invalid.

Notifications : arbitrary target attempt, push failures, spam.

Profiles : cross-account passion-profile attempt.

Search : private leak, taxonomy merge anomaly.

### Codex

Obligatoire avant toute **auto-réparation** ou action write automatique nouvelle.

---

# 31. Commandes réelles du dépôt à privilégier

Ces scripts sont présents dans `package.json` au moment du cadrage :

```text
npm test
npm run test:all
npm run audit:handlers
npm run audit:globals
npm run audit:echappement
npm run audit:tests
npm run couverture
npm run couverture:mesure
npm run couverture:risque
npm run sauvegarde
npm run purge:e2e
npm run purge:storage
npm run revue
npm run schema:baseline
```

## Règle

Ne jamais écrire dans un compte rendu :

> « tous les tests passent »

si seulement une suite ciblée a été exécutée.

Préciser exactement :

```text
TARGETED_TESTS=...
FULL_SUITE=not_run | green | red
AUDITS=...
```

---

# 32. Suites e2e connues à préserver

La branche de cadrage contient notamment :

```text
access-gate.spec.js
authz-critical.spec.js
blocage-acces.spec.js
cadrage.spec.js
cdv.spec.js
confidentialite.spec.js
contextual-nav.spec.js
conv-suppression.spec.js
dist-build.spec.js
```

et d’autres specs dans `tests/e2e`.

Claude Code doit lister les fichiers réels au début de la session et choisir les suites correspondant au lot.

---

# 33. Format de mise à jour d’un lot

À la fin de chaque lot, ajouter dans le journal de session :

```text
LOT=
STATUS=REVIEW|GREEN|ROLLED_BACK
BRANCH=
BASE_SHA=
HEAD_SHA=
FILES_CHANGED=
MIGRATIONS=
ACCEPTANCE_IDS=
TARGETED_TESTS=
FULL_SUITE=
AUDITS=
CHATGPT_REVIEW=
CODEX_REVIEW=
SENTINELLE_SIGNAL=
ROLLBACK=
KNOWN_GAPS=
NEXT_LOT=
```

---

# 34. Conditions de passage de statut

## READY → IN_PROGRESS

Seulement si :

- EXEC-00 fait dans la session ;
- dépendances GREEN ;
- working tree compris ;
- scope annoncé.

## IN_PROGRESS → REVIEW

Seulement si :

- diff borné ;
- tests ciblés exécutés ;
- erreurs connues documentées.

## REVIEW → GREEN

Seulement si :

- acceptance IDs satisfaits ;
- revue ChatGPT faite si requise ;
- revue Codex faite si requise ;
- tests négatifs sécurité verts ;
- instrumentation ajoutée si nécessaire ;
- pas de régression connue bloquante.

---

# 35. Jalon J1 — Core Simplified

## GREEN si

```text
PROD-01 GREEN
PROD-02 GREEN
PROD-03 GREEN
PROD-04 GREEN
PROD-05 GREEN
PROD-06 GREEN
PROD-07 GREEN
```

et aucune régression P0 sécurité observée.

### Résultat utilisateur

PASSIO devient immédiatement plus lisible :

```text
Feed
IRL
Créer
Messages
Profil
```

sans Wallet/Passia/CDV cœur.

---

# 36. Jalon J2 — Premier build V2 testable

## GREEN si

J1 + :

```text
SEC-01 GREEN
PROD-08 GREEN
PROD-09 GREEN
OPS instrumentation minimum GREEN
```

### Le build doit permettre

```text
onboarding
→ Feed
→ profil
→ DM sûr
→ Create
→ IRL shell
```

### Il ne prétend pas encore

- multi-profile server complet ;
- IRL public production-ready ;
- notification push complète ;
- recherche taxonomie mondiale.

---

# 37. Jalon J3 — Relation sûre

## GREEN si

```text
SEC-01 GREEN
PROD-09 GREEN
Feed→Profile→Message acceptance GREEN
block server-side GREEN
```

### Résultat

Une découverte peut devenir une conversation sans faille authz connue.

---

# 38. Jalon J4 — IRL sûr

## GREEN si

```text
SEC-03 GREEN
SEC-04 GREEN
SEC-05 GREEN si attendance verified annoncée
PROD-10 GREEN
PROD-11 GREEN
PROD-12 GREEN
```

### NO-GO immédiat si

- adresse exacte publique ;
- attendee raw public ;
- mineur peut RSVP par API ;
- block bypass ;
- check-in forgeable présenté comme preuve.

---

# 39. Jalon J5 — Identité + découverte scalable

## GREEN si

```text
DATA-01 GREEN
DATA-02 GREEN
DATA-03 si activé GREEN
DISC-01 GREEN
DISC-02 GREEN
```

### Invariant final J5

```text
Onboarding
Feed
Create
Profile
Search
IRL
```

parlent des mêmes Passio canoniques sans confondre intérêts et identités.

---

# 40. Jalon J6 — Candidat bêta élargie

## GREEN si

En plus de J0..J5 nécessaires :

```text
SEC-02 GREEN
NOTIF-01 GREEN
SMTP confirmation GREEN
private signed media GREEN
migration-checker GREEN
full multi-account critical suite GREEN
Sentinelle mobile GREEN
analytics privacy GREEN
PWA/mobile critical flows GREEN
rollback/kill switches documented
```

### Décision finale

ChatGPT fait revue produit/acceptance.

Claude Code fournit preuves techniques.

Codex fait revue adversariale finale des surfaces sensibles.

---

# 41. Ordre de travail recommandé à la prochaine reprise

Après EXEC-00 :

## Flux produit

```text
1 PROD-01 Wallet nav
2 PROD-02 Passia core
3 PROD-03 CDV extraction
4 PROD-04 Onboarding
5 PROD-05 Feed
6 PROD-06 Create
7 PROD-07 Navigation
```

## Flux sécurité parallèle

```text
A SEC-00 migration truth
B SEC-01 DM authz
C SEC-02 Notifications authz
D SEC-03/04 IRL privacy/authz
```

### Priorité en cas de conflit

Un P0 authz rouge passe avant une amélioration visuelle non bloquante.

---

# 42. Lot de départ concret pour Claude Code

Après vérification de la dernière version réelle, le **premier diff recommandé** reste :

```text
PROD-01 remove/wallet-navigation
```

Pourquoi :

- très visible ;
- faible risque DB ;
- réversible ;
- retire un concept désormais rejeté ;
- simplifie immédiatement le produit ;
- prépare Passia cleanup.

En parallèle, si une seconde piste peut être isolée sans mélanger les diffs :

```text
SEC-01 DM authz audit/tests first
```

Le correctif DM ne doit pas attendre toute la refonte visuelle.

---

# 43. Rollback doctrine

## UI-only

Revert commit.

## Feature comportementale

Feature flag/fallback si disponible + revert.

## Migration expand-only

Bascule lecture/writes vers ancien chemin ; conserver colonnes/tables ajoutées jusqu’à investigation.

## RLS

Ne jamais « rollbacker » vers une policy permissive connue dangereuse uniquement pour restaurer une fonctionnalité.

Préférer :

```text
feature disabled
+
policy sûre
```

## IRL / notifications

Kill switch du sous-système si incident privacy/authz.

---

# 44. Règle anti-scope-creep

Si un lot découvre une amélioration intéressante qui n’est pas nécessaire à son acceptance :

```text
noter
→ créer NEXT / dette
→ ne pas l’ajouter au diff courant
```

Exceptions :

- faille sécurité ;
- perte de données ;
- corruption ;
- test démontrant une régression directement liée.

---

# 45. Ce board ne doit jamais contenir de faux GREEN

Un statut inconnu reste :

```text
BLOCKED
```

ou :

```text
READY_FOR_AUDIT
```

si cette nuance est ajoutée plus tard.

Ne jamais convertir l’absence d’information en réussite.

---

# 46. Répartition IA par défaut

## ChatGPT

```text
scope
produit
UX
acceptance
arbitrage
GO/NO-GO jalons
```

## Claude Code

```text
repo truth
code
migrations
RLS
tests
commits
instrumentation
```

## Codex

```text
security adversarial
cross-account
race
spoof
privacy leaks
migration regressions
```

---

# 47. Résultat attendu du board

À chaque instant, il doit être possible de répondre sans ambiguïté :

```text
Qu’est-ce qui est GREEN ?
Qu’est-ce qui est BLOCKED ?
Pourquoi ?
Quel est le prochain lot ?
Quels tests prouvent le dernier changement ?
Quel lot nécessite Codex ?
Quel rollback existe ?
Quel jalon pouvons-nous réellement déclarer atteint ?
```

Ce niveau de traçabilité est requis pour faire évoluer PASSIO rapidement sans perdre la vérité technique ni la sécurité du produit.
