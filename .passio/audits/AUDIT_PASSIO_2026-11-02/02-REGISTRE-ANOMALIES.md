# Registre des anomalies — audit PASSIO 2026-11-02

Gravité : **P0** fuite / accès non autorisé / perte ou corruption de données / indisponibilité majeure · **P1** parcours
essentiel cassé, incohérence métier grave, défaillance fréquente · **P2** anomalie secondaire, fluidité ou accessibilité
significative · **P3** mineur. Statut : **corrigé et retesté** · **préparé** (code/migration prêts, à appliquer après
contre-revue) · **partiel** · **non corrigé** (cause et correctif proposés dans le rapport cité) · **constat** (pas un
défaut). Le détail (reproduction, cause, fichiers, retest) est dans `rapports/<lettre>-….md`, à l'identifiant.

Aucun P0 à l'audit du 02/11 ; R31, trouvé le 04/11 (section « Trouvé après l'audit »), en est un par nature — préparé.
5 P1 (B-02 et E-01 sont le même défaut), 32 P2, 37 P3.

## P1

| ID | Domaine | Anomalie | Impact | Cause | Correctif (fichiers) | Retest |
|---|---|---|---|---|---|---|
| **B-01** | Sécurité / IRL | `events.emoji` (texte, écrit par l'auteur, lu par tous) interpolé sans échappement dans `L.divIcon({html})` → `innerHTML` du marqueur de carte | exécution de script chez quiconque ouvre la carte avec un filtre incluant l'activité ; 0 emoji hostile en prod aujourd'hui | seul site non échappé d'un emoji d'activité | `js/app-07` : `escapeHtml(_emojiBorne(ev.emoji))` + popup `escapeHtml(passion.emoji)` ; verrou `tests/e2e/audit-2026-11-xss-marqueur.spec.js` (chemin réel : shim + vraie MapLibre) | **corrigé et retesté** — rouge sur `main` (`imgs:1, xss:true`), vert sur la branche ; IRL 120/120 |
| **B-02 / E-01** | IRL | Promotion depuis la liste d'attente = `UPDATE event_attendees` sur la ligne d'AUTRUI ; seule policy UPDATE : `user_id = auth.uid()` → 0 ligne, toujours (auto et manuelle) | fonctionnalité annoncée inopérante en base réelle depuis `migration_irl_v2` ; prouvée bout en bout sur faux serveur (E) | écriture jamais autorisée par la RLS, succès cross-compte jamais mesuré | `migrations/migration_promotion_attente_2026-11-02.sql` (RPC `promouvoir_attente` SECURITY DEFINER : `for update`, FIFO, capacité par le trigger, notification serveur protégée du squat d'identifiant) ; `js/app-08` `supaPromoteFromWaitlist` via RPC, repli PGRST202 ; `js/app-07` appelants sans double notification ; `multi-comptes.spec.js` conditionné à la présence de la RPC | **préparé** : banc `tests/sql/migration-promotion-attente.test.sh` **43/43** (concurrence : une seule promotion ; squat : mutation → 3 rouges) ; e2e `audit-2026-11-promotion-attente.spec.js` 3/3 + parcours E b vert ; **migration non appliquée (contre-revue)** |
| **F-03** | Messagerie | `supaLoadMessages` sans `limit`, ordre ascendant → PostgREST tronque à 1 000 lignes **en silence** : les PLUS RÉCENTS disparaissent | au 1 001ᵉ message d'une conversation, les derniers échangés n'apparaissent plus ; 88 messages en prod aujourd'hui (mur à la croissance) | pagination du rendu (30) sans pagination de la lecture | `js/app-08` : pages de 1 000 du plus récent au plus ancien, borne 3 000, erreur page n → plus récents conservés ; fusion locale additive inchangée | **corrigé et retesté** — `audit-2026-11-messagerie-pagination.spec.js` 2/2 (rouge sur `main` : 1 000 plus anciens), messagerie 119/119 |
| **D-01** | Comptes | `beforeunload` → `saveConversationsNow` ignorait `_accountPurged` : les conversations du compte sortant étaient réécrites dans localStorage + IndexedDB après `doLogout` | données privées de A réapparaissant sous B sur le même appareil | purge non consultée par le flush de sortie | `js/app-04` (`_conversationsPurgees()`), verrou `audit-2026-11-correctifs.spec.js` | **corrigé et retesté** (rouge sur HEAD restauré) ; vérifié par E (e2) |
| **H-01** | Centre de pilotage | `dashboard/server/repair.js` : liste blanche lue sur `diff --git` seulement ; `git apply` suit `---/+++` → un patch pouvait écrire dans `tests/` ou `.github/` | un « correctif » automatique pouvait se rendre vert en réécrivant le test | contrôle incomplet des en-têtes | `repair.js` : en-têtes `---/+++` soumis + relecture `git status` après apply ; `dashboard/test/repair.test.js` | **corrigé et retesté** (mutation rouge ; 13 cas sondés par la revue) — périmètre critique |

## P2

| ID | Domaine | Anomalie | Correctif | Statut |
|---|---|---|---|---|
| B-03 | Backend | les `index.ts` des Edge ne sont exécutés par aucun test (Deno absent, CI = fumée OPTIONS/401) | extraire `deciderPush` pure dans `_shared/` et la tester | non corrigé (environnement) |
| B-04 | Dépendances | `maplibre-gl@4.7.1` : GHSA-jrc7-96c5-q579 (CVSS 10, sanitizer) ; exploitabilité faible ici (`escapeHtml` est la barrière, B-01 fermé) | monter en 6.16.0 (`map-loader.js`), gate d'avis sur `js/vendor/` | non corrigé |
| C-01 | Données | `conv_reads` INSERT/UPDATE sans prédicat d'appartenance (9 lignes intruses en prod) ; UPDATE non filtré | `migration_audit_2026-11-02_oracles_et_privileges.sql` ; préalable client `supaMarkRead` (lit `{ error }`, répare l'appartenance sur 403/42501, 03/11) ; filet `migration_conv_members_reparation_2026-11-03.sql` (0 ligne à réparer mesurée) | **préparé** (banc 38/38) ; préalable client **corrigé et retesté** (`audit-2026-11-accuse-lecture.spec.js` 7/7) |
| C-02 | Données | `is_conv_member(conv, uid)` = oracle d'appartenance d'autrui pour tout connecté | diff proposé (chantier transverse) | non corrigé |
| C-03 | Données | TRUNCATE/REFERENCES/TRIGGER accordés à `anon`/`authenticated` sur ~40 tables | même migration que C-01 | **préparé** |
| C-04 | Confidentialité IRL | `event_attendees` lisible `true` par tout connecté (liste nominative + `feedback`, événements passés compris) | **tranché le 03/11** : liste par lien (sa ligne, organisation, venants `going` entre eux, abonnés mutuels, jamais un blocage), nombre par `participants_compte`, notes par `notes_evenement` (≥ 3), garde d'état sur activité passée/annulée — `migration_participants_visibilite_2026-11-03.sql` ; client (compteurs `_nbInscrits` sur toutes les surfaces, RPC + repli) | client **corrigé et retesté** ; migration **préparée** (banc ; contournement « peut-être » trouvé en revue et fermé) |
| C-05 | Données | `conversations` : création illimitée ; 113/125 sans membre en prod | anti-flood + policy de création bornée ; purge des orphelines | non corrigé |
| D-02 | Accessibilité | 120 cibles tactiles < 44 px ; 8 catégories corrigées (⋯ Paramètres, en-tête/envoi de conversation, 😊, × bobines, 📷) | `styles.css` (ajout CRLF), `index.html` | **partiel** |
| D-03 | Accessibilité | 7 champs à 12 px (zoom iOS) | 16 px | **corrigé et retesté** |
| D-04 | Accessibilité | boutons-icônes sans nom (Envoyer, 📷, 9 `span.modal-close`) | `aria-label` | **corrigé et retesté** |
| D-05 | Sécurité | `groupPhoto` dans `background:url(` sans `_cssUrl` | `_cssUrl(passioThumb(…))` ×3 | **corrigé et retesté** |
| D-06 | Fil | deux lectures de tête qui se croisent : la plus ancienne écrasait la plus récente (5 appelants) | génération `_feedTeteSeq` ; course inverse vérifiée par la revue (8c) | **corrigé et retesté** |
| D-07 | État local | deux onglets du même compte : le dernier `saveState` écrase (étendu aux conversations par E c6) | canal `BroadcastChannel`/`storage` à concevoir | non corrigé |
| D-08 | Accessibilité | modales sans piège de focus, fond non inerte, focus non rendu | `inert` + retour du focus | non corrigé |
| D-09 | Accessibilité | conversation masquée tabulable | `inert`/`tabindex` | non corrigé |
| D-10 | Accessibilité | contrastes : `#ef4444` 3,76:1 (`--danger` existe), dégradé iris 2,84:1 au bord, `--muted` 4,39:1 | proposition CSS | non corrigé |
| E-02 | Fil | post devenu privé/masqué reste dans `state.supabasePosts` de B (une tête vide = « rien à remplacer ») | app-02:7843 / app-08:8240 / app-06:5418, diff proposé | non corrigé |
| E-03 | IRL | perdant de la course : « tu peux rejoindre la liste d'attente » mais le second tap renvoie `going` (capacité locale périmée) → même refus | relire la capacité après un refus `activite_complete` | non corrigé |
| E-04 | Messagerie | 401 en plein envoi : message sorti définitivement de la file, mode « session expirée » jamais posé (seul émetteur : la publication) | poser `_sessionExpiree` et garder la file | non corrigé |
| E-05 | Modération | motif de signalement vide accepté (`reason=''` ; les 2 signalements de prod sont vides) | `js/app-04` `_signalementValider` : 3 caractères minimum, fenêtre maintenue ; CHECK serveur proposé (`reports.reason`, `reportPassion` à part) | **corrigé et retesté** (client) ; serveur proposé |
| F-01 | Performance | MapLibre (205 Ko br) chargé à TOUT démarrage, écran Rencontrer jamais ouvert (+27 % d'egress par démarrage froid, 1–3 tâches longues) | `js/app-07` `_scheduleIrlMapUpdate` : carte seulement si `#screen-irl` actif ; verrou dist ① bis + témoin | **corrigé et retesté** (dist 5/5 ; `irl.spec` 120/120 avec le prédicat corrigé) |
| F-02 | Performance | CWV stub/prod/CPU ×4 : LCP 3,9 s (4G lent) / 12,6 s (3G lent), CLS 0,32 (stories + complément différé du fil) | réserver les hauteurs, peindre le séparateur en passe rapide, découper `app.js` | non corrigé (mesuré) |
| F-04 | Performance | référentiel des passions : 6 requêtes `passions?select=id` par démarrage (3ᵉ requête de la base, 5,7 % du CPU sur 173 j) | miroir `data/passions-v1.json` + delta serveur | non corrigé |
| F-08 | Banc de charge | `charge.mjs` sans seuil d'arrêt ; p95 ignorant les échecs | `verdictPalierSimple`, `SEUILS_PALIER`, `p95Tous`, arrêt sur palier rouge | **corrigé et retesté** (12/12 ; réinjection rouge) |
| G-01 | Veille | fausse alerte permanente « aucune purge telemetry planifiée » depuis le 01/11 (fonction renommée `purge_telemetrie_paliers`) | `scripts/veille-production.mjs` + verrou | **corrigé et retesté** (mesuré en base avant/après) |
| G-02 | Sentinelle | `@claude` dans un texte d'erreur atteignait le corps/titre de l'issue → `claude-code.yml` matchait sur `opened` ET sur le label (double run = course A1) | `desamorcer` : `@` + alphanum → `＠` (U+FF20) ; test G-02 | **corrigé et retesté** (mutation rouge ; 63/63) — effet : une enquête fermée dont la clé portait un `@` sera rouverte UNE fois |
| G-03 | Exploitation | `controle-realtime.yml` jamais en cron (dernier run 12/09) | décider un cron | constat / décision |
| G-06 | CI / gouvernance | **trouvé à la livraison (03/11)** : le job « Gouvernance critique » lit `commits/<sha>/pulls` 2 s après la fusion, l'index GitHub n'est pas encore à jour → « Push direct sur main », déploiement sauté, `main` rouge (run 41596025846) ; la même lecture répond #681 une minute plus tard | `deploy.yml` : 6 lectures à 10 s, puis repli sur le message du commit **confirmé par `merge_commit_sha`** ; verrou unitaire 5 cas, 2 mutations rouges | **corrigé et retesté** (le run de livraison a été relancé : `gh run rerun --failed`, vert) |
| H-02 | Pilotage | SSE du dashboard : `broadcast("sentinel")` (code du dépôt) partait à tous les rôles dont `observer` | cloisonnement par capacité (`CAPACITE_PAR_TYPE`) | **corrigé et retesté** |
| H-03 | Pilotage | l'audience (`pilotage_audience`) compte l'éditeur et le canari alors que croissance/veille/digest les excluent | migration proposée (fonction SQL) | non corrigé |
| H-04 | Pilotage | rétention J1/J30 affiche 0 % sur des cohortes antérieures à `activite_jour` (30/10) au lieu de « … » | patch `croissance.js` + champ SQL proposés | non corrigé |
| H-05 | Pilotage | « erreurs » du pilotage = `client_errors` seul (vide 30 j) ; la veille lit aussi `telemetry_events` | aligner la source | non corrigé |
| H-06 | Pilotage | voyant orange tenu depuis le 28/10 (« la veille signale un problème ») alors que #627 est fermée depuis le 31/10 ; raison jamais journalisée | journaliser la raison, lecture GitHub avec jeton | non corrigé |

## P3

| ID | Domaine | Anomalie | Statut |
|---|---|---|---|
| B-05 | Edge | `ask-ai` renvoyait le corps d'erreur du fournisseur (`detail`) | **corrigé** (réponse neutre ; non exécuté : Deno absent) |
| B-06 | Edge | `notify-call` sans clé d'idempotence (N pushes dans la fenêtre, jusqu'au plafond) | non corrigé (proposition `analytics_events`) |
| B-07 | Dashboard | `proxy-addr` critical + `trust proxy=true` sur le rate-limit de connexion | non corrigé (`npm audit fix`, `loopback`) |
| B-08 | CDN | worker Cloudflare vestige (attachments, TTL 1 an) | **corrigé** (marqué hors service, `content` seul, TTL 1 h) |
| B-09 | Messagerie | deux onglets : 23505 peint « échec » alors que le message est en base | non corrigé (diff proposé) |
| B-10 | Réseau | `createClient` sans délai global (promesses jamais réglées hors réseau, mesuré par F) | non corrigé (diff `AbortSignal.timeout` + F-11) |
| B-11 | Diagnostic | catchs muets rendant `[]/null/false` | non corrigé (`diagLog` à ajouter) |
| B-12 | Edge | `supabase-js@2` flottant dans les 5 Edge | **corrigé** dans 4 (`2.118.0`) ; `pilotage/index.ts` reste à épingler |
| B-13 | Dette | 8 scripts jamais référencés, 16 handlers sans appel | non corrigé (retrait à relire) |
| B-14 | Config | CSP définie deux fois (`_headers`, `netlify.toml`) | **banc ajouté** (`entetes-coherence.test.mjs`, dans `verif`) |
| C-06…C-13 | Données | orphelins likes/commentaires/interactions (42/59/158), bio de compte privé hors CGU, oracle majorité d'un tiers, `pointer_par_code` sans plafond d'essais, mentions vers inconnus (60/min), `post_masque` oracle assumé, doublon policy realtime + stories/lives non expirés, 2 médias fantômes | non corrigés (détail C) |
| C-14 | Exposition | dépôt public avec dossier investisseurs et vidéos | **tranché le 03/11** : dossier sorti de l'arbre + `.gitignore`, 6 vidéos en double retirées (`b0588e0`) ; **reste dans l'historique git** (risque résiduel) |
| D-11 | Accessibilité | Échap n'atteint pas conversation/Paramètres/Filtre | non corrigé |
| D-12 | Accessibilité | `.modal-title` en `div` (hiérarchie de titres) | non corrigé |
| D-13 | CSS | « UI-4A5 dernier bloc CSS » plus tenu depuis le 23/10 | non corrigé |
| E-06 | IRL | notifications d'édition/annulation calculées sur l'objet local de l'organisateur | non corrigé (trigger serveur proposé) |
| E-07 | Comptes | compte suspendu non informé hors connexion (`user_banned` non distingué) | non corrigé |
| E-08 | Modération | pas de « signaler ce message » | **corrigé et retesté** (client : `reportMessage`, identifiants échappés `escapeJsArg`/`CSS.escape`) ; preuve serveur `signalements_preuves` **préparée** (banc) ; `moderation.js voir` branche message |
| F-05 | Base | index doublon `passions_trgm_idx` ≡ `passions_normalized_trgm` ; 11 index jamais lus | **tranché** : doublon + `passions_aliases_gin` retirés, les autres gardés (tables quasi vides) — `migration_index_realtime_2026-11-03.sql`, **préparé** (banc 18/18) |
| F-06 | Base | requête pilotage `telemetry_events` 54,6 ms de moyenne sans bon index ; `count: "exact"` | index partiel, même migration, **préparé** (construction non concurrente mesurée sous la seconde ; EXPLAIN à remesurer après application) |
| F-07 | Realtime | 2 policies `realtime.messages` en initplan (doublon d'accent) | une seule policy en `(select auth.uid())`, même migration, **préparé** |
| F-09 | Banc | `charge.mjs` ne refusait que `GITHUB_ACTIONS`, pas `CI` | **corrigé** (`charge-gardes.test.mjs`) |
| F-10 | Cache | vendors sans `Cache-Control` immutable | non corrigé (`_headers`, 1 ligne) |
| F-11 | Réseau | `estEchecReseau` ignore `TimeoutError`/`AbortError` | non corrigé (avec B-10) |
| G-04 | Veille | la veille ne surveille pas l'âge de 4 de ses propres crons | constat |
| H-07 | Pilotage | inscriptions comptées sur `profiles` vs `auth.users` | non corrigé |
| H-08 | Pilotage | signalements plafonnés à 20 par `.length` | non corrigé |
| H-09 | Pilotage | fuseau UTC non dit à l'écran | non corrigé |
| H-10 | Télémétrie | `meta.ech` fourni par l'appelant partait sur les lignes non échantillonnées (poids ×1000 forgeable) | **corrigé et retesté** |
| H-11 | Tests | `pilotage-nuage.spec.js` 22 rouges en local (Playwright 1.60, `import()` ESM) | **corrigé** (`require()`) |

## Trouvé par les contre-revues indépendantes du lot des décisions (03/11)

Deux relectures (conventions, puis vérification adverse des frontières) de la première version du lot. Tout est fermé
dans la PR du lot ; les migrations restent à appliquer après la contre-revue humaine.

| ID | Sév. | Anomalie | Correctif | Statut |
|---|---|---|---|---|
| RV-01 | P1 | C-04 contourné : s'écrire soi-même `maybe`/`waitlist` (activité passée, annulée ou complète comprise) ouvrait la branche « co-inscrit » | branche réservée à `going` (`vient_a_activite`) + garde `trg_event_attendees_etat` | **corrigé** (banc) |
| RV-02 | P1 | identifiants réservés contournés par un UPDATE de `id` ; `follows_notifier` réécrivait la ligne d'un tiers (`do update` sans `where`) | GRANT `update (seen)` seul, `anon` sans écriture, `where` sur `user_id`/`from_id`, marquage serveur, purge (0 ligne en prod) | **corrigé** (banc) |
| RV-03 | P1 | cartes UI-4A2 et fiche UI-4B (actives par défaut) comptaient la liste lisible après C-04 | `_nbInscrits` partout, signature de carte comprise | **corrigé et retesté** |
| RV-04 | P2 | branche « je suis » gagnée en un clic (suivi d'un profil public accepté d'office) → historique de présence | abonnement mutuel exigé, blocages exclus | **corrigé** (banc) |
| RV-05 | P2 | après C-04, une place libérée pouvait ne promouvoir personne (file relue sous un rôle qui ne la voit plus) ; et aucun passage `going` → `declined`/`maybe` ne promouvait | RPC appelée même file locale vide ; promotion sur chaque départ | **corrigé et retesté** |
| RV-06 | P2 | `avg: null` (moins de 3 notes) affiché « ☆☆☆☆☆ 0 » | `null` gardé jusqu'à l'écran, « N avis » seul | **corrigé et retesté** |
| RV-07 | P2 | la table des preuves échappait à `audit-tables-compte` (`auteur_id` non reconnu) | motif étendu + EXCEPTION écrite | **corrigé** |
| RV-08 | P2 | messages de contrôle `del`/`react` appliqués sans vérifier l'auteur : un membre effaçait le message d'un autre chez tous | `from_id` de la ligne serveur seul ; v2 (opt-in) n'applique aucun contrôle ; le retrait rejoué atteint la copie locale (la fusion la gardait, préexistant) | **corrigé et retesté** |
| RV-09 | P3 | fenêtre du motif de signalement : promesse pendante sur ×, fond, Échap (préexistant, les 4 signalements) | observation de la classe du fond | **corrigé et retesté** |
| RV-10 | P3 | compteurs non ajustés après une promotion ; double pastille « +N autres » ; mémo PGRST202 jamais levé ; 404 des deux RPC en erreur de télémétrie ; oracle différentiel des notes ; verdict `anon` faux ; sortie précoce de la garde d'état adossée en silence à `trg_event_attendees_figes` ; sortie terminal de `moderation.js` non filtrée | voir le journal du 03/11 | **corrigés** |
| RV-11 | **P1** | C-04 contourné par la discussion d'activité : un « peut-être » (même sur une activité complète, même bloqué par un venant) entrait dans `evgrp_<id>` et `conv_members` lui rendait la liste nominative | `can_join_event_conversation` en `going` ou organisation ; membre bloqué non montré ; purge (0 mesuré) ; le client n'entre qu'en « je viens » | **corrigé et retesté** (banc 128/0, `discussion-activite-refus` ⑤) |
| RV-12 | P3 | retour arrière des identifiants réservés qui rouvrait TRUNCATE à `anon` ; squat `n_pa_`/`n_m_` d'origine client gardé ; second abonné au même préfixe perdu ; pair retiré d'un 1:1 réinscrit ; verdict des preuves sans droits de colonne ; retour arrière F-07 inexact ; canal v2 non lié à sa conversation ; sélecteur `data-evrating` non échappé ; attente des PWA ouvertes | voir le journal du 03/11 | **corrigés et retestés** |
| RV-13 | P2 | Realtime diffuse les DELETE de `conv_members` et `notifications` à tout abonné, sans RLS (identifiants qui encodent l'activité et le compte) | préexistant, hors lot : refonte du temps réel | **résiduel R25** |

## Constats positifs notables (pas des anomalies)

- **G-05** : les deux PR de la Sentinelle du jour (#677, #678) attendent, auto-fusion armée mais CI rouge /
  contre-revue manquante : la garde fonctionne exactement comme conçue ; aucune PR auto-fusionnée sans CI verte ni
  contre-revue sur 30 jours.
- **RES-01** du registre des résidus est périmé : la barrière de suppression est appliquée en production (16/09,
  trigger sur 27 tables).
- Les 20 rouges de la suite locale complète sont rouges sur `main` intact et verts en CI : écart d'environnement.

## Déjà connus, reproduits par un parcours complet
C-01 (accusé d'un non-membre accepté ET visible des membres), D-07 (étendu aux conversations), B-02 (bout en bout,
E b). D-01 : vérifié corrigé (E e2).

## Trouvé après l'audit (04/11)

| ID | Sév. | Anomalie | Correctif | Statut |
|---|---|---|---|---|
| **R31** | **P0** par nature (fuite) | Supprimer une publication — ou son compte — rendait ses commentaires, « j'aime » et interactions lisibles par TOUS, visiteur compris : aucune clé étrangère vers `posts`, `deletePost` et la purge de compte n'effaçaient que la publication, `post_is_visible` rendait VRAI sur une ligne `posts` manquante, `comment_target_visible` sur toute cible inconnue. Même chose quand un commentaire était supprimé (les réponses d'autrui devenaient publiques), et, SANS suppression, pour les réactions aux réponses d'une publication privée (`srep_…`). Trouvé par la contre-revue finale de R25, confirmé sur deux bancs ; aucune fuite effective confirmée en production (80 orphelins au format réel, tous antérieurs au 2026-09-01) | `migrations/migration_publications_supprimees_2026-11-04.sql` : cible absente publique seulement pour un EXEMPLE (`est_identifiant_exemple`, liste fermée) ; interaction lue comme son FIL (`comment_target_visible(comment_id, post_id)`) ; déclencheurs AFTER DELETE `trg_purger_cibles_publication` / `trg_purger_cibles_commentaire` ; orphelins du passé effacés sous plafond ; `supabase/functions/_shared/purge-compte.js` relève, purge et relit les dépendances d'autrui ; aucun changement client | **préparé** : banc `migration-publications-supprimees` 63/0 (défaut mesuré d'abord, verdict réinjecté rouge, 9 mutations), `identifiants-exemple` 4/4, `purge-compte` R31 ①–⑧ (6 rouges sur la purge d'avant) ; **migration non appliquée (contre-revue)** — résiduel R31 dans `05-RISQUES-RESIDUELS.md` |
