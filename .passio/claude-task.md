# Tâche Claude Code — Sentinelle autonome + centre de pilotage mobile

## Contexte

Tu travailles sur le dépôt PASSIO existant. Ne recrée pas la Sentinelle : pars impérativement de l'implémentation actuelle et durcis-la.

Lis d'abord, dans cet ordre :
1. `AGENTS.md`
2. `CLAUDE.md`
3. `PASSIO_SENTINELLE_JOINT_AUDIT.md`
4. `PASSIO_CONTROL_CENTER_ROADMAP.md`
5. `dashboard/server/sentinel.js`
6. `dashboard/server/repair.js`
7. `dashboard/server/alerts.js`
8. `dashboard/server/ingest.js`
9. `dashboard/server/sse.js`
10. `dashboard/server/auth.js`
11. `dashboard/server/config.js`
12. `dashboard/server/index.js`
13. `dashboard/public/js/app.js`
14. `dashboard/public/css/app.css`
15. les tests du dashboard et les tests de sécurité pertinents.

## Objectif produit

Faire évoluer la Sentinelle du centre de pilotage vers le maximum d'autonomie raisonnablement sûr : surveillance continue ; détection automatique des incidents et des pannes silencieuses ; diagnostic automatique ; auto-réparation immédiate lorsqu'une remédiation est objectivement sûre ; récupération automatique et continuité de service ; rollback/repli ; feature flags / kill switches ; journalisation et alertes ; visibilité des sauvegardes/restaurations ; escalade humaine uniquement lorsque l'automatisation n'est pas sûre ou pas suffisante ; accès mobile complet au centre de pilotage, avec consultation ET actions autorisées depuis smartphone, sécurité forte et traçabilité.

L'utilisateur veut pouvoir piloter Passio depuis son téléphone, pas seulement voir un dashboard réduit.

## Important — ne pas confondre autonomie et prise de risque

L'implémentation actuelle a déjà de bons garde-fous : sandbox Claude, patch limité, worktree isolé, tests intouchables, quotas, audit, route de fusion explicite. Ne les affaiblis pas.

Ne rends PAS `DASH_ALLOW_MUTATIONS=true` en production par défaut et n'introduis PAS un `git push`/déploiement automatique aveugle. Toute nouvelle auto-action doit être classée par risque.

Crée un modèle explicite de politique de remédiation au minimum avec ces catégories (noms ajustables) :
- `SAFE_AUTO` : action réversible, bornée, déterministe, préconditions vérifiables, rollback défini ; peut être appliquée automatiquement.
- `APPROVAL_REQUIRED` : correctif vérifié mais impact trop large / ambigu ; préparation automatique puis validation humaine.
- `FORBIDDEN` : sécurité, migrations/destruction de données, secrets, auth/RLS, modifications non bornées, tests/CI, opérations irréversibles ; jamais automatique.

La Sentinelle doit expliquer dans le dashboard POURQUOI elle a auto-réparé, préparé une réparation ou refusé d'agir.

## P0 — Santé de l'observation indépendante des alertes

Implémente une vraie santé de la chaîne d'observation, sans fabriquer de donnée :
1. `DB_READ` : lecture Supabase réussie même si 0 ligne.
2. `SSE` : heartbeat serveur -> dashboard et fraîcheur mesurée.
3. `CANARY_INGESTION` : canari synthétique périodique qui passe par le chemin PUBLIC normal de télémétrie, jamais par `service_role`, puis que le backend doit retrouver sous une fenêtre bornée.

Contraintes du canari : ne compte jamais dans les analytics/KPI/utilisateurs ; ne déclenche jamais la Sentinelle elle-même ; identifiable explicitement et filtré partout où nécessaire ; aucune donnée personnelle ; intervalle raisonnable, par défaut ~15 min si cohérent avec l'architecture ; états honnêtes `OK`, `DEGRADED`, `DOWN`, `UNKNOWN` (ou équivalents), jamais « vert par absence de signal ».

Expose ces états dans `/api/health` ou une route authentifiée dédiée selon sensibilité, dans l'Accueil et dans la vue Sentinelle.

## P0 — Boucle d'auto-réparation sûre

L'actuel `repair.js` prépare une branche vérifiée mais la fusion reste humaine. Conserve cette voie pour les changements de code à risque.

Ajoute une boucle de remédiation graduée. Peuvent devenir `SAFE_AUTO` uniquement si prouvées sûres : relancer/reconnecter une ingestion ou un abonnement temps réel dégradé ; basculer vers un mécanisme de repli déjà prévu ; réinitialiser un état mémoire/transitoire borné ; désactiver temporairement une fonctionnalité via un kill switch/feature flag si elle provoque un incident critique et si le rollback est immédiat ; reprendre automatiquement une file/backlog ; autres remédiations opérationnelles réellement réversibles que le code existant permet de valider.

Pour les correctifs de code, conserve a minima : diagnostic -> patch minimal -> worktree isolé -> syntaxe -> audits -> tests -> branche dédiée. N'autorise une auto-fusion de code que si tu peux démontrer une politique beaucoup plus stricte que la voie actuelle : très petit diff, fichiers strictement allowlistés, aucun domaine sécurité/auth/RLS/DB/migration/CI/tests/config sensible, tests verts, repo propre, branche de référence inchangée, rollback déterministe et audité. Si ces conditions ne peuvent pas être garanties, marque `APPROVAL_REQUIRED` et rends la validation mobile simple et sûre.

Ne pousse/déploie jamais automatiquement en production dans cette tâche sans mécanisme existant de déploiement protégé + rollback prouvé.

## P0 — Kill switch / repli / rollback

Unifie ou complète : kill switch global de la Sentinelle ; kill switch des réparations automatiques ; kill switch par fonctionnalité quand un feature flag existe ; historique avant/après de chaque changement ; restauration de l'état précédent en un clic lorsqu'elle est sûre ; toute action auditée avec acteur (`sentinelle` ou utilisateur), timestamp, raison, incident/diagnostic lié et résultat ; aucune action sensible accessible à un rôle insuffisant.

Si les feature flags actuels sont seulement des données de dashboard sans effet autoritatif dans Passio, ne prétends pas qu'ils coupent réellement la prod : marque cette limite et ne présente comme kill switch que ce qui agit réellement.

## P0 — Accès mobile complet au centre de pilotage

Fais une vraie passe mobile-first sur : Accueil / santé du système ; Alertes et incidents ; Sentinelle et diagnostics ; détail d'une réparation ; validation/fusion d'un correctif vérifié si l'utilisateur a la capacité ; feature flags / kill switches réels ; journal d'audit ; état des sources ; actions de reprise/rollback autorisées.

Exigences : fonctionnement correct sur largeur iPhone ~390 px et petits Android ; aucune table critique inutilisable horizontalement (cartes, empilement ou overflow ergonomique) ; cibles tactiles >= ~44 px pour actions sensibles ; boutons destructifs/à impact nettement séparés et libellés ; état temps réel/reconnexion visible ; drawer/modal utilisable au clavier ET au tactile ; pas de dépendance à hover ; gestion de safe-area iOS si nécessaire ; tests responsive automatisés au moins sur les vues critiques.

### Accès réseau mobile
Le dashboard local seul ne suffit pas. Ajoute une documentation/configuration sûre pour l'exposer derrière HTTPS (reverse proxy / tunnel privé type VPN/Tailscale ou hébergement sécurisé), sans ouvrir un port administrateur brut sur Internet. Ne mets aucun secret dans le client. Ne stocke aucun token sensible dans localStorage.

## P0 — Sécurité mobile des actions sensibles

Conserver `HttpOnly`, `Secure` en prod et permissions côté serveur ; vérifier si `SameSite=Lax` est suffisant pour les routes mutantes JSON et ajouter une protection CSRF explicite si nécessaire ; ajouter une ré-authentification ou confirmation forte pour actions à fort impact (merge, rollback, kill switch global) si faisable proprement ; ne jamais faire confiance à une simple désactivation de bouton côté UI ; rate limit/audit des actions sensibles ; ne jamais exposer `service_role` au navigateur.

Ne prétends pas fournir MFA si tu ne l'implémentes pas réellement. Si MFA dépasse raisonnablement la tâche, documente-le comme prochain durcissement nécessaire.

## P1 — Alertes et escalade

`alerts.js` contient des `NOTIFY_SINKS` encore TODO. Implémente au moins une abstraction réellement exploitable et testable pour les alertes critiques, avec configuration désactivée par défaut si aucun canal n'est fourni. Priorité : notifications compatibles avec un usage mobile et sans données sensibles. Si aucun canal externe n'est configuré, l'UI doit le dire explicitement.

Routage souhaité : `critical` immédiat ; `high` rapide ; auto-réparation réussie informative ; auto-réparation refusée/échouée = escalade humaine ; répétition d'un même incident après réparation = escalade plus forte et blocage de boucle infinie. Ajoute déduplication, budget/rate limit et audit.

## P1 — Boucle anti-récidive

Après une réparation : observer si l'incident réapparaît ; relier récidive au diagnostic/réparation précédents ; augmenter la sévérité/confiance d'escalade ; empêcher une même réparation d'être appliquée en boucle ; conserver cause, action, tests, résultat et récidive dans le journal.

## P1 — Sauvegarde / restauration / PRA

Ne fabrique pas de statut de backup. Expose un état honnête de préparation : `configured/unknown/not configured` ; date de dernière preuve de restauration si une source réelle existe ; RPO/RTO seulement si configurés ; lien/runbook vers la procédure. Si aucun fournisseur/API de backup n'existe dans le dépôt, implémente le modèle de preuve/config + UI `UNKNOWN/NOT CONFIGURED`, pas une fausse sauvegarde.

## P1 — Service role en lecture seule

Cherche si un rôle/secret DB réellement read-only peut être introduit sans casser les fonctions admin nécessaires. Ne change pas les politiques de production à l'aveugle. Si une migration sûre et testable n'est pas possible ici, isole clairement les usages read-only et documente le blocage comme dette de sécurité P0/P1 avec test empêchant d'étendre les écritures accidentelles.

## Cohérence UX

Corrige le texte obsolète de la vue Sentinelle qui affirme encore « elle ne modifie jamais le code » alors que `repair.js` produit déjà des branches de correctif.

L'interface doit distinguer clairement : « Surveillé » ; « Diagnostiqué » ; « Réparé automatiquement » ; « Correctif préparé — validation requise » ; « Refusé pour sécurité » ; « Rollback effectué » ; « Escalade humaine requise ».

## Tests obligatoires

Ajoute/étends des tests ciblés couvrant au minimum : santé DB/SSE/canari + canari exclu des analytics et de la Sentinelle ; politique `SAFE_AUTO / APPROVAL_REQUIRED / FORBIDDEN` ; dédup et anti-boucle de réparation ; audit de chaque action ; permissions serveur sur merge/rollback/kill switch ; action sensible refusée sans confirmation forte ; comportement mobile/responsive des vues Sentinelle/alertes/flags/audit à ~390 px ; aucune régression du pipeline de réparation existant ; tests existants du dashboard verts.

Exécute les tests pertinents et `git diff --check`.

## Contraintes générales

Plus petit changement cohérent possible ; pas de réécriture globale. Ne touche pas aux invariants sécurité déjà validés sans preuve meilleure. Aucune donnée factice présentée comme réelle. Toute métrique/état doit avoir provenance/fraîcheur/confiance lorsque pertinent. Aucun secret committé. Aucun changement de migration prod irréversible dans cette tâche. Ne modifie pas `.passio/claude-task.md`.

## Livrable attendu

Implémente autant que possible dans une seule PR cohérente, en priorisant P0. Si un sous-objectif exige une infrastructure externe non disponible, implémente le contrat/config/UI/tests qui permettent de l'activer plus tard et marque honnêtement `NOT CONFIGURED` / `UNKNOWN` au lieu de simuler.

À la fin, laisse dans le code ou la documentation un résumé très court : ce qui est devenu autonome ; ce qui reste soumis à validation humaine et pourquoi ; comment accéder au centre de pilotage depuis un smartphone de façon sûre ; quels tests prouvent le comportement.
