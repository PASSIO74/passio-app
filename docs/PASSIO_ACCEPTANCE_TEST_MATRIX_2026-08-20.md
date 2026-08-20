# PASSIO — Matrice d'acceptation et de non-régression

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **But** : transformer chaque décision produit, sécurité et architecture en preuve testable avant toute fusion vers `main`.

---

## 1. Règle générale

Un lot n'est jamais terminé parce que l'interface paraît correcte.

Il est terminé lorsque :

```text
comportement
+ sécurité
+ autorisations serveur
+ compatibilité legacy
+ instrumentation
+ mobile
+ tests
```

convergent.

Une absence de preuve est `UNKNOWN`, jamais un succès implicite.

---

## 2. Suites existantes à préserver

Base de preuve actuelle :

```text
smoke
navigation
contextual-nav
feed-ranking
feed-realtime-course
interactions
irl
profils-types
multi-comptes
authz-critical
blocage-acces
confidentialite
conv-suppression
transfert-message
version-skew
dist-build
audit:globals
audit:handlers
```

Les nouvelles specs V2 étendent cette base ; elles ne remplacent pas silencieusement les invariants existants.

---

# 3. Matrices V2 normatives

Les scénarios détaillés vivent dans leurs specs respectives et font partie de cette matrice globale.

| Domaine | IDs normatifs | Document |
|---|---|---|
| Wallet / Passia | `WAL-01..14` | ce document + specs retrait |
| CDV extraction | `CDV-01..06` | ce document + extraction map |
| Navigation | `NAV-01..09` | ce document + Nav V2 |
| Onboarding | `ONB-01..07` + scénarios détaillés | Onboarding → First Value |
| Feed V2 | `FEED2-01..20` | `PASSIO_FEED_V2_CORE_EXPERIENCE_2026-08-20.md` |
| Creation V2 | `CREATE2-01..24` | `PASSIO_CREATION_V2_IMPLEMENTATION_LOT_2026-08-20.md` |
| Profile V2 | `PROF2-01..26` | `PASSIO_PROFILE_MULTIPROFILE_V2_2026-08-20.md` |
| Feed→Profile→Message | `FPM-01..09` | ce document + lot dédié |
| Messages V2 | `MSG2-01..34` | `PASSIO_MESSAGES_CONVERSATION_V2_2026-08-20.md` |
| Conversation→IRL | `M2I-01..14` | `PASSIO_CONVERSATION_TO_IRL_LOT_2026-08-20.md` |
| IRL Trust & Safety | `IRL-TS-01..18` | `PASSIO_IRL_TRUST_SAFETY_AUDIT_2026-08-20.md` |
| IRL V2 | `IRL2-01..42` | `PASSIO_IRL_V2_PRODUCT_EXPERIENCE_2026-08-20.md` |
| Search V2 | `SEARCH2-01..40` | `PASSIO_SEARCH_DISCOVERY_V2_2026-08-20.md` |
| Notifications V2 | `NOTIF2-01..42` | `PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md` |
| Funnel analytics | invariants section 13 | `PASSIO_CORE_FUNNEL_ANALYTICS_V1_2026-08-20.md` |
| Sentinelle | `SEN-01..11` + nouveaux signaux | ce document + hardening spec |

### Règle

Une PR qui modifie un domaine doit identifier explicitement les IDs qu'elle rend verts.

---

# 4. Lot A — Retrait Wallet / Passia / points

| ID | Scénario | Preuve attendue | Type |
|---|---|---|---|
| WAL-01 | Navigation principale | aucun Wallet visible | e2e UI |
| WAL-02 | ancien `goTo('wallet')` / hash | redirection sûre, zéro erreur | e2e navigation |
| WAL-03 | Profil | aucun score/étoile/rang/Passia | négatif UI |
| WAL-04 | Landing | aucune promesse Passia/crypto/monnaie | texte |
| WAL-05 | IA | aucun raccourci gagner Passia/points | négatif DOM |
| WAL-06 | Publication | fonctionne sans reward | e2e métier |
| WAL-07 | Commentaire | fonctionne sans reward | e2e métier |
| WAL-08 | Like realtime | fonctionne sans reward | multi-compte |
| WAL-09 | Profil passion | création sans paywall/reward | profils |
| WAL-10 | IRL | create/join sans points | IRL |
| WAL-11 | état legacy | score/passia/transactions/quests tolérés mais non ressuscités | migration état |
| WAL-12 | sync cross-device legacy | aucune UI économie réapparue | version-skew |
| WAL-13 | recherche statique | chaque occurrence legacy restante justifiée | audit |
| WAL-14 | globals/handlers | aucun handler mort/collision | audits |

### Gate

**NO-GO** si un parcours cœur affiche encore une récompense ou requiert un solde Passia.

---

# 5. Lot B — CDV hors du cœur

| ID | Scénario | Preuve attendue |
|---|---|---|
| CDV-01 | nav cœur | aucun bouton CDV primaire |
| CDV-02 | ancien état | chargement sans perte |
| CDV-03 | ancien deep link | comportement de compatibilité documenté |
| CDV-04 | données/media/comments | aucune suppression opportuniste |
| CDV-05 | module Voyage | CDV encore accessible par voie secondaire tant qu'existant |
| CDV-06 | Feed/IRL/Messages | aucun parcours cœur ne dépend du bouton CDV |

---

# 6. Lot C — Navigation V2

Cible :

```text
Fil · IRL · Créer · Messages · Profil
```

| ID | Scénario | Preuve attendue |
|---|---|---|
| NAV-01 | mobile | cinq points d'entrée max, utilisables au pouce |
| NAV-02 | desktop | destinations cohérentes |
| NAV-03 | actif | une seule destination active |
| NAV-04 | back | historique prévisible |
| NAV-05 | Fil | accès direct permanent |
| NAV-06 | Créer | une action, pas destination Studio obligatoire |
| NAV-07 | Explorer | pas de destination primaire redondante |
| NAV-08 | Bobines/stories | formats/modes de lecture |
| NAV-09 | multi-profil | navigation ne change jamais identité |

---

# 7. Lot D — Onboarding simplifié

| ID | Scénario | Preuve attendue |
|---|---|---|
| ONB-01 | nouveau compte | aucun Wallet/point/rang |
| ONB-02 | passions | sélection simple ; minimum fonctionnel et recommandation UX |
| ONB-03 | Feed interests | `selectedFeedPassions` persiste |
| ONB-04 | GPS | aucune position précise obligatoire |
| ONB-05 | première valeur | premier Feed pertinent non vide si contenu existe |
| ONB-06 | profils | un seul starter profile, pas un profil par intérêt |
| ONB-07 | reload/sync | aucune duplication profil/intérêt |

---

# 8. Lot E — Feed / Creation / Profile

Les matrices détaillées FEED2 / CREATE2 / PROF2 sont normatives.

## Invariants transverses obligatoires

- filtre Passio Feed ≠ switch profil ;
- création affiche l'identité qui publie ;
- aucun profil passion créé silencieusement ;
- Bobine redevient un contenu Feed éligible ;
- CDV sort du Feed cœur ;
- mood ne bloque pas le Feed par défaut ;
- anciens posts ne changent pas d'identité publique lorsque le profil actif change après migration Profile V2 ;
- `profiles.id` reste racine compte/sociale ; `passion_profiles` est séparé.

### Gate identité

**NO-GO** pour la phase Profile V2 si un nouveau post avec `passion_profile_id` peut référencer le profil passion d'un autre compte.

---

# 9. Lot F — Feed → Profil → Message

| ID | Scénario | Preuve attendue |
|---|---|---|
| FPM-01 | clic auteur | bon profil |
| FPM-02 | contexte Passio | visible |
| FPM-03 | block | profil/conversation respectent block |
| FPM-04 | privé | visibilité respectée |
| FPM-05 | Message | DM en peu d'étapes |
| FPM-06 | contexte | pas de PII inutile |
| FPM-07 | identité | identité émettrice cohérente |
| FPM-08 | cross-compte | bon destinataire réel |
| FPM-09 | historique | invariants suppression/realtime restent verts |

---

# 10. Lot G — Messages V2 / authz P0

Les `MSG2-01..34` sont obligatoires.

### Gates P0 supplémentaires

**DM-AUTHZ-01** — compte C connaît le `conv_id` de A↔B mais son INSERT `conv_messages` est rejeté.

**DM-AUTHZ-02** — `from_id=B` envoyé par A est rejeté.

**DM-AUTHZ-03** — block A↔B empêche toute nouvelle écriture directe côté serveur.

**DM-AUTHZ-04** — retry/outbox après block ne réussit pas silencieusement.

**DM-AUTHZ-05** — création simultanée d'un même direct ne produit pas plusieurs conversations si le lot d'unicité est implémenté.

### NO-GO

Aucune simplification visuelle Messages ne compense un INSERT non-member encore possible.

---

# 11. Lot H — Conversation → IRL

Les `M2I-01..14` sont normatifs.

Invariants :

```text
conversation source
≠
conversation événement
```

- CTA secondaire `Proposer un IRL` ;
- pas de GPS/adresse implicite ;
- pas d'auto-RSVP ;
- pas d'auto-message de succès avant création serveur ;
- `#irl-event-<id>` autorisé uniquement si l'événement reste accessible.

---

# 12. Lot I — IRL Trust & Safety + IRL V2

Les `IRL-TS-01..18` et `IRL2-01..42` sont normatifs.

## Gates public launch

**IRL-GATE-01** — adresse/GPS/contact exacts non lisibles publiquement par API.

**IRL-GATE-02** — `event_attendees` brut non public ; agrégats seulement pour découverte.

**IRL-GATE-03** — block empêche interactions directes côté serveur.

**IRL-GATE-04** — 13–17 ne peuvent créer/RSVP/discuter IRL côté serveur au premier lancement public.

**IRL-GATE-05** — check-in non dérivable de l'ID public ; validation serveur idempotente.

**IRL-GATE-06** — participant normal ne peut exercer droits organisateur/co-organisateur.

**IRL-GATE-07** — waitlist promotion autorisée/atomique, pas écriture cross-account client arbitraire.

**IRL-GATE-08** — album post-event respecte la visibilité du post source.

### NO-GO

IRL n'est pas « production-ready grand public » si un de ces gates échoue.

---

# 13. Lot J — Search / Discovery V2

Les `SEARCH2-01..40` sont normatifs.

## Gates principaux

**SEARCH-GATE-01** — ajouter une Passio modifie les intérêts Feed uniquement.

**SEARCH-GATE-02** — ouvrir une Passio ne crée aucun profil public.

**SEARCH-GATE-03** — synonymes/locales pointent vers un ID canonical stable.

**SEARCH-GATE-04** — alias/merge ne casse aucun contenu historique.

**SEARCH-GATE-05** — recherche globale ne lit jamais les DM.

**SEARCH-GATE-06** — posts/profils/events privés ou bloqués ne deviennent pas visibles via l'index.

**SEARCH-GATE-07** — résultat IRL ne contient aucune adresse/GPS/contact privé.

**SEARCH-GATE-08** — aucune raw query sensible dans analytics.

**SEARCH-GATE-09** — réponse réseau obsolète ne remplace pas la requête courante.

---

# 14. Lot K — Notifications V2 / Push authz

Les `NOTIF2-01..42` sont normatifs.

## Gates P0 supplémentaires

**NOTIF-GATE-01** — un client authentifié ne peut pas choisir arbitrairement `toUserId + text` et provoquer une push sociale.

**NOTIF-GATE-02** — notification sociale correspond à une action serveur réelle et une cible dérivée/validée.

**NOTIF-GATE-03** — `notify-call` refuse une cible non autorisée et respecte block/rate limit.

**NOTIF-GATE-04** — la policy UPDATE/read de `notifications` est vérifiée sur la prod réelle ; seul le destinataire marque lu/supprime.

**NOTIF-GATE-05** — ouvrir un DM ne déclenche pas automatiquement le prompt OS notifications.

**NOTIF-GATE-06** — texte DM absent du lockscreen par défaut.

**NOTIF-GATE-07** — aucune adresse IRL privée dans une push.

**NOTIF-GATE-08** — likes/réactions répétitifs sont dédupliqués/agrégés ; événements critiques non perdus.

**NOTIF-GATE-09** — Quest/Passia/points/rangs ne génèrent plus aucune notification cœur.

**NOTIF-GATE-10** — deep link revalide toujours l'autorisation au moment du clic.

### NO-GO

Push sociale publique interdite tant que l'endpoint accepte une cible et un texte libres contrôlés par le client.

---

# 15. Lot L — Instrumentation du funnel cœur

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

## Tests minimum

- événement non émis avant l'action ;
- une occurrence logique = un événement logique ;
- aucun texte DM ;
- aucune raw search query ;
- aucune adresse/GPS exacte ;
- aucun email/téléphone ;
- identité compte/profil conforme au modèle ;
- version/env/source présents si définis ;
- absence de données = UNKNOWN, pas zéro rassurant.

---

# 16. Lot M — Ranking Feed

Préserver d'abord les invariants existants :

- affinité utile à fraîcheur égale ;
- fraîcheur dominante ;
- set de posts conservé ;
- fallback chronologique ;
- ordre stable.

Tout changement V2 profond doit être :

- versionné ;
- déterministe ;
- testé ;
- rollbackable ;
- mesuré sur Feed→relation→IRL, pas seulement watch time.

---

# 17. Lot N — Sentinelle / Centre de pilotage

| ID | Scénario | Preuve attendue |
|---|---|---|
| SEN-01 | aucune alerte | l'UI ne conclut pas « sain » uniquement sur silence |
| SEN-02 | DB_READ | lecture santé prouvée |
| SEN-03 | canari | ingestion prouvée et exclue métier |
| SEN-04 | SSE | heartbeat dashboard |
| SEN-05 | réparation | worktree isolé + tests |
| SEN-06 | patch invalide | rejet |
| SEN-07 | kill switch | arrêt effectif/audité |
| SEN-08 | rollback | chemin de retour |
| SEN-09 | mobile | cockpit utilisable smartphone |
| SEN-10 | action sensible | authn + authz + audit |
| SEN-11 | prod/main | aucune fusion/déploiement autonome |

## Nouveaux signaux obligatoires

- DM non-member write ;
- passion_profile spoof ;
- IRL private-detail access denied ;
- check-in forgé ;
- mineur IRL denied ;
- search privacy leak ;
- push arbitrary-target attempt ;
- notification spam/rate-limit ;
- duplicate notification/realtime loop.

Aucun contenu privé ne doit être nécessaire à ces diagnostics.

---

# 18. Campagne obligatoire avant fusion du chantier cœur

Ordre recommandé :

1. `npm run audit:globals`
2. `npm run audit:handlers`
3. smoke / dist-build
4. navigation / contextual-nav
5. Wallet negatives + legacy state
6. onboarding
7. Feed + ranking + realtime
8. Creation
9. Profile / multi-profile
10. Messages / authz-critical / raw REST
11. IRL / block / minor / check-in / raw REST
12. Search RLS/private/block
13. Notifications/push/PWA/authz
14. multi-comptes
15. version-skew / sync
16. analytics privacy
17. Sentinelle/mobile cockpit

---

# 19. Contrôle croisé Codex

Codex reçoit un mandat d'attaque ciblé après chaque lot sensible.

## Identité

- ownership `passion_profile_id` ;
- historique posts/messages ;
- switch profil et anciens contenus.

## Messages

- known `conv_id` non-member insert ;
- `from_id` spoof ;
- block deux sens ;
- retry/outbox après block ;
- duplicate direct race.

## IRL

- adresse/participants privés ;
- block bypass ;
- mineur API bypass ;
- check-in forge ;
- co-organizer escalation ;
- waitlist race.

## Search

- index privé ;
- block leak ;
- alias merge corruption ;
- raw query analytics ;
- race de requêtes.

## Notifications

- arbitrary target/text ;
- kind/ref spoof ;
- push après block ;
- call spam ;
- cross-account seen/delete ;
- DM/address lockscreen leak ;
- realtime/push duplicate.

Codex propose des tests ; il ne redéfinit pas le produit.

---

# 20. Go / No-Go global

## GO uniquement si

- parcours cœur Feed + relation + IRL est testable ;
- anciens états sont tolérés ;
- aucune UI économie interne cœur ;
- CDV historique préservé ;
- identité passion stable sur les nouveaux contenus ;
- DM authz P0 vert ;
- IRL gates P0 verts ;
- recherche ne contourne aucune confidentialité ;
- push sociale server-authoritative ;
- analytics respecte privacy ;
- Sentinelle voit les échecs critiques ;
- chaque diff reste compréhensible et rollbackable.

## NO-GO si

- une migration destructive n'a pas rollback/inventaire ;
- un test critique est neutralisé ;
- un utilisateur peut écrire dans une conversation dont il n'est pas membre ;
- une identité passion d'un autre compte peut être usurpée ;
- adresse/GPS/participants IRL privés sont exposés ;
- un mineur peut contourner le gate IRL côté API ;
- un check-in reste forgeable mais présenté comme vérifié ;
- recherche révèle contenu/profil/event inaccessible ;
- une push sociale accepte encore cible + texte libres du client ;
- Wallet/Passia/Quest/rang revient dans le cœur ;
- Sentinelle peut fusionner/déployer sans geste autorisé.
