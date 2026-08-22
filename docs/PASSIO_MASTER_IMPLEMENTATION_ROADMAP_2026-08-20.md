# PASSIO — Roadmap maître d’implémentation

- **Date de cadrage** : 2026-08-20
- **Branche de référence produit** : `product/passio-core-simplification-2026-08-20`
- **Dépôt** : `PASSIO74/passio-app`
- **Promesse** : **« partage tes Passio et rencontre les gens »**
- **Valeurs** : **Découvrir · Partager · Rencontrer (IRL)**
- **Boucle canonique** : **Passion → contenu → personne → interaction → profil → conversation → IRL → nouveau contenu**

---

# 1. Rôle de ce document

Les specs V2 décrivent désormais précisément chaque domaine PASSIO.

Ce document répond à la question suivante :

> **Dans quel ordre faut-il réellement implémenter tout cela pour obtenir rapidement un nouveau cœur PASSIO testable, sans casser la sécurité, les données historiques, le multi-profil ou les parcours existants ?**

Il sert de :

- graphe de dépendances ;
- ordre d’exécution Claude Code ;
- registre de gates GO / NO-GO ;
- règle de découpage des branches et commits ;
- contrat de revue ChatGPT / Codex ;
- chemin vers le premier build V2 testable ;
- chemin vers une bêta publique sûre.

Il **ne remplace pas** les specs détaillées. Elles restent normatives pour les critères d’acceptation.

---

# 2. Principe général : deux pistes qui convergent

PASSIO ne doit pas implémenter les changements dans un unique méga-chantier.

Deux pistes avancent en parallèle :

```text
PISTE PRODUIT RÉVERSIBLE
Wallet/CDV → onboarding → Feed → Create → navigation → profil/messages UX

PISTE SÉCURITÉ / SERVEUR
migration gate → DM authz → notifications authz → IRL privacy/block/minor/check-in
```

Puis elles convergent vers :

```text
Feed + relation + IRL sûr
```

Les migrations d’identité, recherche/taxonomie et optimisation profonde viennent ensuite avec des dépendances explicites.

---

# 3. Les cinq règles absolues d’exécution

## Règle 1 — vérité du dépôt avant tout

À **chaque reprise Claude Code**, commencer par vérifier :

```text
repo
branche
HEAD
merge-base
status
changements non commités
main
branche produit de référence
version réellement exécutée
service worker / cache
écrans mobiles réels
```

Aucun diff tant que cette vérité n’est pas claire.

## Règle 2 — aucun méga-diff

Un lot doit avoir :

- une intention ;
- une liste de fichiers impactés ;
- ses tests ;
- son rollback évident.

Interdit :

```text
Wallet + Feed + RLS + Profile DB + IRL dans un seul commit
```

## Règle 3 — expand-only avant contract

Pour tout schéma :

```text
expand
→ dual-read / dual-write si nécessaire
→ migration / backfill idempotent
→ validation
→ bascule lecture
→ contract beaucoup plus tard
```

Pas de suppression de colonne/table historique pendant la première migration V2.

## Règle 4 — le serveur arbitre les autorisations

L’UI peut masquer un bouton, mais ne constitue jamais une barrière de sécurité.

Doivent être serveur-backed :

- ownership ;
- block ;
- membership conversation ;
- profils passion ;
- IRL privé ;
- gate mineurs ;
- check-in ;
- notification/push autorisée.

## Règle 5 — un lot n’est fini qu’avec preuve

```text
code
+ comportement
+ sécurité
+ tests
+ instrumentation
+ mobile
+ documentation
```

Aucune capture écran « ça a l’air bon » ne remplace les tests.

---

# 4. Priorités historiques qui restent P0

La simplification produit n’annule pas les P0 existants :

1. confirmation e-mail / SMTP ;
2. URLs signées pour médias privés ;
3. `migration-checker` prod ↔ repo ;
4. invariants RLS / authz / blocage / confidentialité / cross-compte.

Ces sujets peuvent avancer en parallèle des premiers retraits UI, mais **aucune migration sensible ni bêta élargie** ne doit contourner ces gates.

---

# 5. Graphe de dépendances simplifié

```text
                              ┌──────────────────────┐
                              │ V0 Vérité / baseline │
                              └──────────┬───────────┘
                                         │
              ┌──────────────────────────┼───────────────────────────┐
              │                          │                           │
              ▼                          ▼                           ▼
     P1 Retrait Wallet            S1 DM / Notif authz        OPS1 migration gate
              │                          │                           │
              ▼                          │                           │
     P2 Retrait Passia                   │                           │
              │                          │                           │
              ▼                          │                           │
     P3 Extraction CDV                   │                           │
              │                          │                           │
              ▼                          │                           │
     P4 Onboarding First Value           │                           │
              │                          │                           │
              ▼                          │                           │
     P5 Feed V2 foundation               │                           │
              │                          │                           │
              ▼                          │                           │
     P6 Create V2                        │                           │
              │                          │                           │
              ▼                          │                           │
     P7 Navigation V2                    │                           │
              │                          │                           │
              ├──────────────┐           │                           │
              │              │           │                           │
              ▼              ▼           ▼                           ▼
       P8 Profil UX      P9 Messages UX  S2 IRL T&S            OPS2 Sentinelle
              │              │           │
              │              └─────┬─────┘
              │                    ▼
              │              P10 Conversation→IRL
              │                    │
              ├──────────────┐     ▼
              ▼              │  P11 IRL V2
       D1 passion_profiles   │     │
              │              │     ▼
              ├──────────────┤  P12 Post-IRL→Feed
              ▼              ▼
       D2 identité posts   D3 identité messages/events
              │              │
              └──────┬───────┘
                     ▼
              D4 Search/Taxonomie
                     │
                     ▼
              O1 Ranking / optimisation
```

Les notifications saines et la Sentinelle traversent toutes les phases et ont leur propre gate de sécurité avant bêta publique.

---

# 6. Jalons de sortie

La roadmap possède six sorties importantes.

## J0 — baseline fiable

Le produit réel, le code réel et le schéma réel sont alignés.

## J1 — cœur simplifié

Wallet/Passia/CDV cœur retirés, onboarding et navigation nettoyés.

## J2 — premier build V2 testable

Feed + Create + Profil + Messages + IRL shell cohérents sur mobile, sans exiger toutes les migrations avancées.

## J3 — boucle relationnelle sûre

Feed → profil → message fonctionne avec authz serveur P0.

## J4 — boucle IRL sûre

Conversation/Feed → IRL → RSVP → coordination → post-IRL fonctionne avec les gates Trust & Safety.

## J5 — identité/taxonomie V2

Multi-profil serveur stable + passions canoniques + recherche V2.

## J6 — candidat bêta publique

Notifications, Sentinelle, analytics, tests cross-compte, privacy, mobile et opérations convergent.

---

# 7. Phase V0 — vérité, baseline, migration gate

## Objectif

Éliminer toute ambiguïté avant code.

## Claude Code

Vérifier :

```text
git remote -v
git branch --show-current
git status
git rev-parse HEAD
git merge-base HEAD main
git log récent
```

Puis :

- version app réellement servie ;
- cache/service worker ;
- schéma prod régénéré ;
- migrations repo vs prod ;
- écrans mobile actuels ;
- scripts de test disponibles.

## Baseline obligatoire

Mesurer :

- destinations visibles ;
- occurrences Wallet/Passia/points/rangs ;
- CDV cœur ;
- premier Feed ;
- Bobines ;
- Studio ;
- profiles/multi-profile ;
- DM authz ;
- notifications authz ;
- IRL public/private ;
- poids JS/CSS si disponible ;
- tests/audits actuels.

## Gate V0

### GO

- code exécuté identifié ;
- schéma réel identifié ;
- aucun changement utilisateur non commité menacé ;
- migration-checker utilisable ou plan explicite pour le rendre fiable.

### NO-GO

- branche ambiguë ;
- UI exécutée ≠ code inspecté ;
- prod schema UNKNOWN ;
- travail local non sauvegardé.

## IA

- **Claude Code** : vérité technique.
- **ChatGPT** : vérifie que la baseline répond aux décisions produit.
- **Codex** : pas requis sauf incohérence technique critique.

---

# 8. Phase P1 — retirer Wallet de la navigation et des surfaces visibles

## Branche recommandée

```text
remove/wallet-navigation
```

## Scope

Retirer :

- destination Wallet ;
- CTA Wallet ;
- chips profil qui y mènent ;
- landing Passia/monnaie ;
- raccourcis IA liés ;
- deep links obsolètes avec fallback sûr.

## Ne pas faire

- aucun DROP DB ;
- aucune suppression massive `user_state` ;
- ne pas retirer encore toutes les fonctions reward dans ce même diff.

## Tests

```text
WAL-01..05
navigation
smoke
audit:handlers
audit:globals
```

## Gate P1

### GO

Aucun utilisateur ne peut atteindre Wallet depuis le cœur normal.

### NO-GO

Navigation cassée ou handler mort.

## Revue

- Claude Code implémente.
- ChatGPT valide la hiérarchie produit.
- Codex facultatif : recherche statique de références oubliées.

---

# 9. Phase P2 — retirer Passia / points / Score / rangs du comportement cœur

## Branche

```text
remove/passia-points-core
```

## Dépend de

P1 vert.

## Ordre interne

1. retirer `grantReward()` des parcours cœur ;
2. supprimer microcopy `+10 pts`, `+50 pts`, etc. ;
3. enlever paywall profils ;
4. neutraliser affichages Score/Passia/rang ;
5. sanitizer état legacy ;
6. seulement ensuite retirer tables/maps JS mortes locales (`REWARDS`, `RANKS`, renderers shop) si aucune dépendance.

## Données

Conserver/tolérer les anciens champs :

```text
score
passia
transactions
quests
activePass
```

mais ne plus les réinjecter dans le cœur ni les resynchroniser comme fonctionnalité active.

## Tests

```text
WAL-06..14
version-skew
publication
commentaires
likes
profils
IRL
```

## Gate P2

Toute action cœur fonctionne avec :

```text
score = absent
passia = absent
quests = absent
```

---

# 10. Phase P3 — extraire CDV du cœur

## Branche

```text
extract/cdv-core-navigation
```

## Dépend de

P1/P2 idéalement terminés pour éviter microcopy croisée.

## Scope

Retirer CDV de :

- navigation cœur ;
- Feed cœur ;
- Studio cœur ;
- tour principal ;
- profil cœur ;
- IA cœur.

Préserver :

- données ;
- tables ;
- `posts.vlog` ;
- interactions génériques ;
- médias ;
- route secondaire Passio : Voyage.

## Tests

```text
CDV-01..06
navigation
CDV legacy
smoke
```

## Gate P3

Le cœur PASSIO n’a plus besoin du CDV, mais aucun historique utilisateur n’est détruit.

---

# 11. Phase P4 — onboarding → première valeur

## Branche

```text
simplify/onboarding-first-value
```

## Dépend de

P1/P2 au minimum.

## Premier bug à corriger

La sélection de passions doit immédiatement nourrir le premier Feed.

Cible :

```text
passions choisies
→ selectedFeedPassions
→ premier Feed pertinent
```

et :

```text
première passion
→ un starter passion profile
```

pas un profil par passion.

## Scope

- min 1, recommander 3, max 7 au démarrage ;
- persistance/reload ;
- pas de GPS ;
- pas de tour forcé ;
- pas de Wallet ;
- un seul profil initial.

## Tests

```text
ONB-01..07
reload
cross-device
multi-profile
first-feed
```

## Gate P4

Nouveau compte → contenu pertinent visible sans étape inutile.

---

# 12. Phase P5 — Feed V2 foundation

## Branche

```text
improve/feed-v2-foundation
```

## Dépend de

P4.

## Ordre interne strict

### P5-A — intérêts Feed

- `selectedFeedPassions` canonique ;
- filtre Passio ≠ `currentProfileId` ;
- mood non restrictif par défaut.

### P5-B — retirer CDV du rendu Feed

Pas des données.

### P5-C — intégrer Bobines dans le flux

Retirer exclusion explicite `isReel`.

Conserver le viewer plein écran comme mode de lecture.

### P5-D — recherche légère

Réutiliser Passions/personnes ; ne pas lancer encore migration taxonomie.

### P5-E — modules personnes

Seulement après flux stable.

## Ranking

**Ne pas changer la formule actuelle dans ce lot.**

## Tests

```text
FEED2-01..20
feed-ranking
feed-realtime
block
private
scroll/mobile
```

## Gate P5

Le Feed V2 est multi-format, pertinent dès onboarding et ne change jamais silencieusement d’identité.

---

# 13. Phase P6 — Création V2

## Branche

```text
simplify/create-v2
```

## Dépend de

P2 et idéalement P5.

## Cible

```text
Créer
├── Publication
├── Bobine
├── Activité IRL
└── Plus
    └── Audio / autres formats secondaires
```

## Scope

- action sheet central ;
- Publication = texte/photo/vidéo unifiés ;
- réutiliser `publishPost()` ;
- identité visible ;
- Bobine ouvre éditeur existant ;
- Activité IRL ouvre `openCreateEvent()` ;
- aucun reward ;
- aucune permission au simple tap sur Créer.

## Tests

```text
CREATE2-01..24
publication
media
bobine
irl-create-entry
mobile keyboard
```

## Gate P6

L’utilisateur peut publier en quelques gestes et sait toujours sous quelle identité il publie.

---

# 14. Phase P7 — Navigation V2

## Branche

```text
simplify/navigation-v2
```

## Dépend de

P5/P6 afin d’éviter de pointer vers des flows non prêts.

## Cible finale

```text
Fil · IRL · Créer · Messages · Profil
```

## Règles

- `Créer` = action ;
- Bobines = mode de lecture ;
- Explorer = capacité recherche ;
- CDV = Passio : Voyage ;
- Wallet = absent.

## Tests

```text
NAV-01..09
navigation.spec.js
back/deep links
mobile thumb reach
```

## Gate J1 — cœur simplifié

Après P7, J1 est atteint si :

- aucune économie interne dans le cœur ;
- CDV sorti ;
- onboarding correct ;
- Feed V2 foundation ;
- Create V2 ;
- nav V2.

---

# 15. Piste sécurité S1 — DM authz P0

Ce chantier peut commencer en parallèle de P1–P4 après V0.

## Branche

```text
security/dm-authz-p0
```

## Pourquoi tôt

La policy actuelle d’INSERT messages doit exiger la membership conversation.

## Scope

- non-member INSERT rejeté ;
- `from_id` spoof rejeté ;
- création conversation resserrée ;
- block helper serveur ;
- tests REST bruts ;
- outbox/retry après block.

## Ne pas mélanger

- aucune migration `passion_profiles` dans ce diff ;
- aucune refonte UI Messages nécessaire.

## Tests

```text
MSG2 security subset
DM-AUTHZ-01..05
authz-critical
multi-account
```

## Gate S1-DM

Compte C connaissant le `conv_id` A↔B ne peut ni lire ni écrire.

## Revue obligatoire

- Claude Code : migration/tests.
- Codex : attaque conv_id connu, spoof, block, retry/race.
- ChatGPT : confirme que le correctif ne casse pas le parcours DM voulu.

---

# 16. Piste sécurité S1 — Notifications authz P0

## Branche

```text
security/notifications-authz-p0
```

## Peut démarrer

Après V0, indépendamment de Feed V2.

## P0

- supprimer push sociale arbitraire de `notify-call` ;
- séparer appel / notification sociale ;
- ne plus accepter cible + texte arbitraires ;
- création notification server-authoritative ;
- block ;
- rate limit ;
- vérifier policy UPDATE read/seen.

## Tests

```text
NOTIF2-01..18
NOTIF2-30..39
raw REST
Edge Function direct
```

## Gate S1-NOTIF

Un client modifié ne peut pas envoyer une push libre à un utilisateur arbitraire.

## Revue

Codex obligatoire.

---

# 17. Piste sécurité S2 — IRL Trust & Safety

## Branche

Découper au minimum :

```text
security/irl-private-details
security/irl-block-minor-authz
security/irl-checkin
```

## Dépend de

V0 + migration-checker.

Ne dépend pas du redesign visuel IRL.

## S2-A — données publiques/privées

Créer expand-only :

```text
event_private_details
```

Déplacer/gater :

- adresse exacte ;
- GPS exact ;
- contact.

Créer agrégats participants sûrs.

## S2-B — block + mineurs

- `can_interact_with` ou équivalent ;
- 13–17 IRL désactivé serveur au lancement initial ;
- event comments/reactions authz cohérentes.

## S2-C — check-in

- token aléatoire serveur ;
- expiration ;
- idempotence ;
- aucune preuve dérivable de l’ID événement.

## Tests

```text
IRL-TS-01..18
IRL2 security subset
raw REST
multi-account
```

## Gate S2

Aucune adresse/participant/check-in sensible ne peut être récupéré par un compte non autorisé.

## Revue

Codex obligatoire après chaque migration sensible.

---

# 18. Phase P8 — Profil V2 UI cleanup

## Branche

```text
simplify/profile-v2-ui
```

## Peut commencer avant migration `passion_profiles`

Retirer :

- Score ;
- Passia ;
- rang ;
- badges prestige si liés économie ;
- Carnets du profil cœur ;
- paywall profils.

Clarifier :

```text
Mes Passio
→ Actif / Utiliser cette identité
```

Un tap sur une carte identité ne doit plus être confondu avec un filtre de contenu.

## Tests

Sous-ensemble PROF2 UI.

---

# 19. Phase P9 — Messages V2 UX

## Branche

```text
simplify/messages-v2-ui
```

## Dépend de

**S1-DM vert.**

Ne pas faire l’inverse : corriger l’UI avant authz ne rend pas la messagerie sûre.

## Scope

- un seul bouton `+` ;
- DM principal, groupes secondaires ;
- conversation header simplifié ;
- profil accessible ;
- composer réduit ;
- failed/retry explicite ;
- blocked conversation read-only selon policy.

## Preserve

- drafts ;
- replies ;
- pagination ;
- realtime ;
- outbox ;
- statuses ;
- mentions groupes.

## Gate J2 — premier build V2 testable

J2 peut être atteint après P8/P9 si :

- P1..P7 verts ;
- S1-DM vert ;
- navigation mobile finale visible ;
- Feed/Create/Profile/Messages/IRL shell cohérents ;
- aucune migration identity lourde requise pour naviguer/tester la proposition produit.

### J2 n’est pas encore bêta publique

IRL complet, notifications et migrations identité peuvent encore être en chantier.

---

# 20. Phase P10 — Conversation → IRL

## Branche

```text
improve/conversation-to-irl
```

## Dépend de

- S1-DM ;
- S2-A localisation au minimum ;
- P9 Messages V2 ;
- formulaire événement existant stable.

## Flow

```text
Conversation
→ Proposer un IRL
→ formulaire événement canonique
→ passion préremplie
→ ville seulement explicite
→ création explicite
→ retour conversation
→ card #irl-event-<id>
```

## Jamais

- auto RSVP ;
- auto invitation ;
- GPS/address auto ;
- message automatique sans confirmation.

## Tests

```text
M2I-01..14
MSG2 IRL subset
IRL2 source conversation
```

---

# 21. Phase P11 — IRL V2 expérience

## Branche

```text
improve/irl-v2-core
```

## Dépend de

**S2-A + S2-B obligatoirement.**

Check-in complet S2-C doit être vert avant de qualifier une présence de vérifiée.

## Ordre

1. liste prioritaire ;
2. carte secondaire ;
3. GPS explicite ;
4. cards safe ;
5. fiche safe ;
6. RSVP/waitlist ;
7. conversation événement ;
8. création progressive ;
9. organisateur ;
10. check-in serveur.

## Tests

```text
IRL2-01..42
irl existing suite
mobile
multi-account
```

## Gate J4 — boucle IRL sûre

```text
Feed/Profile/Conversation
→ événement
→ RSVP
→ coordination
→ participation sûre
```

sans fuite de localisation/participants.

---

# 22. Phase P12 — post-IRL → Feed

## Branche

```text
improve/post-irl-loop
```

## Dépend de

P6 Creation V2 + P11 IRL V2.

## Flow

```text
événement terminé
→ Partager un souvenir
→ Creation V2
→ event_id
→ publication/Bobine
→ Feed
→ album événement
```

## Privacy

L’album ne contourne jamais la visibilité du post.

## Analytics

Mesurer :

```text
irl_attended
→ post_irl_contribution
```

si attendance réellement vérifiée ; sinon conserver distinction RSVP/attendance.

---

# 23. Données D1 — `passion_profiles`

## Branche

```text
data/passion-profiles-expand
```

## Quand

Après :

- P8 UI cleanup utile ;
- V0 schema vérité ;
- migration-checker fiable.

Peut avancer en parallèle de P10/P11 si les migrations sont isolées.

## Décision

Ne pas repurposer `profiles.id`.

Créer :

```text
passion_profiles
```

avec :

```text
account_id → profiles.id
passion_id
identity fields
visibility
status
is_primary
```

## Ownership

Chaque write :

```text
passion_profiles.account_id = auth.uid()
```

## Migration

Matérialiser les profils locaux/actuels de façon idempotente.

Aucune supposition sur les identités historiques manquantes.

## Tests

```text
PROF2 server subset
cross-account spoof
RLS
legacy account
```

## Revue Codex

Obligatoire.

---

# 24. Données D2 — identité stable des publications/stories

## Branche

```text
data/content-passion-profile-identity
```

## Dépend de

D1.

## Expand

```text
posts.passion_profile_id nullable
stories.passion_profile_id nullable
```

## Règle historique

Legacy null :

```text
fallback identité compte + passion contenu
```

Ne jamais deviner un ancien profil passion.

## Nouveaux writes

Vérifier ownership du `passion_profile_id`.

## Goal

Changer de profil actif ne modifie plus rétroactivement l’identité des anciens posts.

## Tests

PROF2 historical identity + spoof.

---

# 25. Données D3 — identité Messages / IRL

## Dépend de

D1 + S1-DM + S2.

## Messages

P1 :

```text
conv_messages.passion_profile_id nullable
```

Chaque message capture l’identité utilisée au send.

## IRL

```text
events.passion_profile_id nullable
```

organizer account reste source ownership.

## Règle

Compte = autorisation.

Profil passion = identité publique contextuelle.

Ne jamais inverser ces rôles.

---

# 26. Recherche D4 — Search/Discovery V2

## Branche initiale

```text
improve/search-overlay-v2
```

## Phase D4-A — sans migration lourde

Après Feed V2 :

- overlay global ;
- Passions + personnes ;
- dépromouvoir Explorer ;
- retour contexte ;
- aucun switch identité.

## Phase D4-B — taxonomie

Après migration gate :

```text
passions extension
passion_terms
passion_proposals
```

## Modèle

Un ID canonique mondial par Passio.

Synonymes/langues/sous-passions ne créent pas d’identités taxonomiques dupliquées.

## Phase D4-C — contenu / IRL

Après leurs gates RLS respectifs :

- recherche posts ;
- recherche IRL safe.

## Gate J5

Onboarding, Feed, Create, Profil, Search et IRL parlent le même `passion_id` canonique.

---

# 27. Notifications N2 — expérience saine complète

## Après le P0 authz

La refonte UX peut arriver ensuite :

- réglages simples ;
- soft prompt ;
- plus de demande OS au simple DM ;
- agrégation likes ;
- deep links ;
- safe DM preview ;
- IRL reminders ;
- quiet hours ;
- digest opt-in seulement plus tard.

## Dépendances

- N2 sécurité P0 avant push large ;
- S1-DM pour messages/appels ;
- S2 pour IRL ;
- navigation/deep links stables.

## Tests

```text
NOTIF2-01..42
PWA/service worker
multi-device
```

---

# 28. Analytics A1 — instrumentation avant optimisation

## Ne pas attendre la fin

Les événements du funnel doivent être ajoutés au fur et à mesure des lots, mais sans changer le ranking sur intuition.

Funnel canonique :

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

## Privacy

Jamais :

- DM texte ;
- query search brute ;
- adresse IRL ;
- GPS ;
- contact ;
- contenu report/block.

---

# 29. Sentinelle OPS2 — instrumentation obligatoire de chaque lot

Chaque nouveau composant doit déclarer :

```text
health signal
error signal
security signal
feature flag si utile
rollback / fallback
owner / runbook
```

## Exemples

Feed :

- render failure ;
- feed empty anomaly ;
- ranking latency.

Messages :

- non-member write ;
- RLS failures ;
- outbox loop ;
- duplicate direct.

IRL :

- private-details denied ;
- block bypass ;
- check-in invalid ;
- waitlist failures.

Notifications :

- arbitrary target attempts ;
- push failure ;
- spam actor ;
- dead subscriptions.

Profiles :

- passion_profile spoof ;
- identity migration failure.

Search :

- private leak ;
- taxonomy mapping loop ;
- no-result spike.

## Mobile

Tous les signaux critiques et kill switches doivent être consultables depuis le Centre de pilotage mobile.

---

# 30. Optimisation O1 — ranking profond Feed

## Commence seulement après

- J4 au minimum ;
- funnel instrumenté ;
- assez de signaux fiables.

## Candidats

```text
Passio match
affinité auteur
fraîcheur
qualité
diversité
découverte
conversation issue du contenu
IRL issue du contenu
sécurité
```

## Contre-métriques

- blocks ;
- reports ;
- unfollows ;
- répétition auteur/format ;
- IRL annulés/no-show ;
- qualité perçue.

## Interdit

Optimiser uniquement :

- watch time ;
- scroll depth ;
- sessions longues ;
- engagement brut.

---

# 31. Premier build V2 réellement testable — définition précise

Le **premier build V2 testable (J2)** ne doit pas attendre tous les chantiers futurs.

Il doit contenir :

```text
✓ Wallet absent du cœur
✓ Passia/points/rangs absents du cœur
✓ CDV sorti vers Voyage secondaire
✓ onboarding → Feed non vide
✓ Feed multi-format avec Bobines
✓ mood non bloquant
✓ Create action sheet
✓ Publication / Bobine / Activité IRL accessibles
✓ navigation Fil · IRL · Créer · Messages · Profil
✓ profil sans économie interne
✓ messages UI simplifiés
✓ DM INSERT authz corrigé
✓ blocage cross-compte non régressé
✓ instrumentation de base
✓ Centre de pilotage reçoit les erreurs du nouveau cœur
```

Il peut encore utiliser le modèle account-level historique pour certains aspects multi-profile tant que :

- aucune nouvelle fausse promesse de stabilité historique n’est faite ;
- migrations D1/D2 sont clairement identifiées comme prochaines ;
- sécurité n’est pas diminuée.

---

# 32. Candidat bêta privée sûre — définition

Avant élargissement à de vrais testeurs hors cercle technique :

En plus de J2 :

```text
✓ Profile V2 ownership sûr si activé
✓ notifications push arbitraires fermées
✓ IRL adresse/GPS privés
✓ participants IRL non publics bruts
✓ mineurs IRL gate serveur
✓ check-in non forgeable si présenté comme vérifié
✓ DM block serveur
✓ event conversation membership
✓ policies notifications read/write vérifiées
✓ médias privés signés
✓ confirmation e-mail opérationnelle
✓ migration-checker vert
✓ multi-account security suite verte
✓ PWA mobile vérifiée
✓ rollback / flags disponibles
```

---

# 33. Candidat bêta publique — GO / NO-GO

## GO uniquement si

### Produit

- première valeur Feed rapide ;
- parcours création simple ;
- Feed→profil→message cohérent ;
- IRL compréhensible et utile ;
- post-IRL boucle vers Feed.

### Sécurité

- aucune vulnérabilité P0 connue DM/notification/IRL/profile ;
- block server-side ;
- private media ;
- minor gate ;
- check-in ;
- raw REST tests.

### Fiabilité

- erreurs/régressions critiques sous contrôle ;
- offline/PWA raisonnable ;
- realtime Messages stable ;
- no false-success writes.

### Opérations

- Sentinelle voit les nouveaux lots ;
- kill switches ;
- rollback ;
- audit logs ;
- cockpit mobile.

### Privacy

- analytics sans PII sensible ;
- notifications lockscreen sûres ;
- recherche sans query brute analytics ;
- IRL exact location gated.

## NO-GO si au moins un P0 subsiste

Un bel écran IRL n’annule jamais un leak d’adresse.

Un DM fluide n’annule jamais une écriture non-member.

Une push efficace n’annule jamais un endpoint de spam arbitraire.

---

# 34. Branching recommandé

La branche de specs :

```text
product/passio-core-simplification-2026-08-20
```

reste la référence documentaire.

Pour le code, préférer des branches courtes et intentionnelles depuis la **dernière base réelle vérifiée** :

```text
remove/wallet-navigation
remove/passia-points-core
extract/cdv-core-navigation
simplify/onboarding-first-value
improve/feed-v2-foundation
simplify/create-v2
simplify/navigation-v2
security/dm-authz-p0
security/notifications-authz-p0
security/irl-private-details
security/irl-block-minor-authz
security/irl-checkin
simplify/profile-v2-ui
simplify/messages-v2-ui
improve/conversation-to-irl
improve/irl-v2-core
data/passion-profiles-expand
data/content-passion-profile-identity
improve/search-overlay-v2
```

Ne pas supposer que chaque nom doit survivre exactement : Claude Code peut adapter au workflow local réel, mais la **granularité** doit rester équivalente.

---

# 35. Convention de commit

Chaque commit doit pouvoir répondre :

```text
Pourquoi ce commit existe ?
Quels invariants change-t-il ?
Quels tests le prouvent ?
Comment le rollbacker ?
```

Exemples :

```text
remove(wallet): hide core navigation entry
fix(authz): require conversation membership to insert messages
feat(feed): make selected passions persist across onboarding
feat(irl): gate precise location behind RSVP policy
```

Éviter :

```text
big update
fix stuff
passio v2
```

---

# 36. Revue ChatGPT — quand elle est obligatoire

ChatGPT intervient :

- avant chaque lot pour rappeler scope/acceptance ;
- après changement visible UX ;
- après une contradiction spec↔code ;
- avant une décision de scope ;
- avant de déclarer un jalon atteint.

ChatGPT vérifie surtout :

```text
promesse produit
simplicité
Feed + IRL
multi-profile semantics
privacy UX
acceptance IDs
scope creep
```

---

# 37. Revue Codex — quand elle est obligatoire

Codex est obligatoire pour :

- RLS ;
- migrations ;
- authz multi-compte ;
- block ;
- identité `passion_profile_id` ;
- notification/push ;
- check-in ;
- private location ;
- waitlist race ;
- retry/outbox ;
- deep links sensibles ;
- analytics leak.

Codex est facultatif pour une microcopy pure ou un déplacement CSS sans effet comportemental.

---

# 38. Protocole de lot standard

Pour chaque lot :

## A — Claude Code annonce

```text
base réelle
scope
fichiers attendus
tests attendus
risques
```

## B — implémentation

Petit diff.

## C — preuves locales

Tests ciblés + audits.

## D — ChatGPT revue

Produit/acceptance.

## E — Codex si sensible

Adversarial/security/regression.

## F — correction

Uniquement des écarts observés.

## G — commit

Message clair.

## H — suite globale minimale

Smoke + navigation + domaine touché.

## I — merge uniquement selon workflow réel

Jamais automatiquement parce que le diff « semble petit ».

---

# 39. Matrice des dépendances principales

| Lot | Dépend obligatoirement de | Peut avancer en parallèle avec | Bloque |
|---|---|---|---|
| Wallet nav | V0 | DM authz, notifications authz | Passia cleanup |
| Passia cleanup | Wallet nav | DM authz | Profile/Create cleanup |
| CDV extraction | V0 | DM authz, Passia | nav finale |
| Onboarding | Passia cleanup | IRL T&S | Feed foundation |
| Feed foundation | Onboarding | DM/IRL security | nav/search overlay |
| Create V2 | Passia cleanup | Feed | nav finale |
| Nav V2 | Feed + Create + CDV | security | J1/J2 |
| DM authz | V0 | all reversible UI | Messages V2, Conversation→IRL |
| Notifications authz | V0 | product UI | healthy push/public beta |
| IRL private details | migration gate | Feed/Create | IRL V2 |
| IRL block/minor | migration gate | Feed/Create | IRL V2 |
| Check-in | IRL authz base | Profile D1 | verified attendance |
| Profile UI | Passia cleanup | security | cleaner J2 |
| Messages UI | DM authz | Profile UI | Conversation→IRL |
| Conversation→IRL | DM authz + IRL privacy | Profile D1 | full core loop |
| IRL V2 | IRL T&S | D1 | J4 |
| passion_profiles | migration gate | IRL UX | stable identity |
| posts identity | passion_profiles | Search | J5 identity |
| messages/events identity | passion_profiles + authz | Search | contextual identity |
| Search overlay | Feed foundation | Profile D1 | Explorer removal |
| Taxonomy | migration gate | post-IRL | global passion scale |
| Ranking deep | analytics + stable core | — | optimization only |

---

# 40. Ce qui n’est PAS sur le chemin critique du premier build V2

Ne pas bloquer J2 pour :

- marketplace ;
- paiements ;
- crypto ;
- monnaie interne ;
- podcast comme destination ;
- Passio : Voyage avancé ;
- deep AI assistant ;
- dark mode ;
- moteur Elasticsearch ;
- ranking ML complexe ;
- profile_follows ;
- événements privés avancés invitation-only ;
- digest marketing ;
- système de badges.

Ils peuvent être évalués après preuve du cœur Feed + IRL.

---

# 41. Dette acceptable temporairement dans J2

On peut tolérer temporairement, si explicitement documenté :

- anciennes colonnes économie non utilisées ;
- écran/code legacy non accessible, destiné au contract ultérieur ;
- `profiles` account-level avant D1 ;
- identité legacy fallback sur anciens contenus ;
- Search P0 uniquement Passions/personnes ;
- IRL sans ranking personnalisé avancé ;
- notifications in-app simples si push social P0 est fermé proprement.

On ne peut **jamais** tolérer :

- faille authz connue ;
- leak adresse/GPS ;
- push arbitraire ;
- block uniquement UI ;
- faux succès serveur ;
- destruction données historique sans retour.

---

# 42. Tableau GO / NO-GO par jalon

| Jalon | GO si | NO-GO si |
|---|---|---|
| J0 | repo/schema/UI réels identifiés | version réelle inconnue |
| J1 | Wallet/Passia/CDV cœur retirés, onboarding/feed/create/nav cohérents | récompenses encore requises |
| J2 | shell V2 mobile + DM authz | DM non-member write possible |
| J3 | Feed→Profil→Message sûr | block/spoof non serveur |
| J4 | IRL privacy/authz/check-in conforme au niveau annoncé | exact location/attendees exposés |
| J5 | passion_profiles + IDs canonique cohérents | cross-account profile spoof |
| J6 | notifications, Sentinelle, privacy, tests, ops verts | P0 sécurité/fiabilité connu |

---

# 43. Ordre recommandé de la prochaine session Claude Code

Après vérification obligatoire de la version réelle :

```text
1. baseline
2. remove/wallet-navigation
3. tests/revue
4. remove/passia-points-core
5. tests/revue
6. extract/cdv-core-navigation
7. onboarding-first-value
8. feed-v2-foundation
9. create-v2
10. navigation-v2
```

En parallèle ou dès qu’un second lot sûr peut être isolé :

```text
A. security/dm-authz-p0
B. security/notifications-authz-p0
C. migration-checker / schema truth
D. IRL private-details/authz
```

Le lot UI suivant ne doit pas être utilisé pour éviter un blocage sécurité : si l’authz est rouge, on corrige l’authz.

---

# 44. Ordre après premier build V2 J2

```text
1. Profile V2 UI + passion_profiles
2. Messages V2 final + structured identity plus tard
3. IRL Trust & Safety complet
4. Conversation → IRL
5. IRL V2
6. post-IRL → Feed
7. Search overlay
8. Taxonomie Passio
9. Notifications UX saine
10. instrumentation consolidation
11. Sentinelle/ops consolidation
12. ranking profond après données
```

Certaines étapes peuvent se chevaucher, mais leurs gates ne changent pas.

---

# 45. Definition of Done de la refonte du cœur

La refonte du cœur PASSIO est fonctionnellement accomplie lorsque :

```text
un nouvel utilisateur
→ comprend PASSIO rapidement
→ choisit ses Passio
→ reçoit un Feed pertinent
→ découvre du contenu
→ découvre une personne
→ ouvre son profil
→ échange
→ propose ou découvre un IRL
→ participe de manière sûre
→ partage l’expérience
→ nourrit de nouveau le Feed
```

et que :

- aucune économie interne ne détourne cette boucle ;
- aucune destination redondante ne brouille la navigation ;
- multi-profil reste explicite ;
- permissions/privacy sont serveur-backed ;
- analytics mesurent la valeur humaine ;
- Sentinelle voit et protège le système ;
- mobile est une surface de premier rang.

---

# 46. Répartition globale des IA

## ChatGPT — Product / Architecture / Acceptance

Responsable de :

- cohérence Feed + IRL ;
- priorisation ;
- UX ;
- modèle multi-profil ;
- frontières sécurité produit ;
- critères d’acceptation ;
- arbitrage scope ;
- revue de jalons.

## Claude Code — Repository Truth / Implementation

Responsable de :

- dernière version réelle ;
- inventaires exhaustifs ;
- modifications multi-fichiers ;
- migrations ;
- RLS ;
- tests ;
- commits ;
- intégration ;
- instrumentation ;
- preuve locale.

## Codex — Adversarial Cross-check

Responsable de :

- attaques cross-account ;
- failles RLS ;
- spoof ;
- race ;
- retries ;
- leak privacy ;
- migrations dangereuses ;
- regressions silencieuses ;
- tests négatifs complémentaires.

---

# 47. Résultat attendu

La roadmap n’essaie pas de « tout refaire ».

Elle transforme progressivement PASSIO :

```text
produit riche mais dispersé
```

vers :

```text
Feed simple et pertinent
→ relations humaines
→ IRL sûr
→ contenu après rencontre
```

avec une architecture qui peut ensuite s’étendre mondialement sans sacrifier sécurité, historique utilisateur ou clarté produit.
