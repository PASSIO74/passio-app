# PASSIO — Journal d'ingénierie

> Une entrée par grande boucle de travail. Faits et mesures uniquement ; les décisions durables vont dans `.passio/adr/`, les risques dans `.passio/context/KNOWN_RISKS.md`.

---

## 2026-08-15 — Boucle 1 : Phase 0 (baseline) + Phase 1a (exploration)

### Contexte
Démarrage de la mission « Production Readiness ». Règle cadre : la première analyse générale doit être **conjointe Claude Code + ChatGPT**, l'agent principal ne devant pas produire seul l'audit complet puis le faire entériner.

### Travail réalisé
- **Phase 0 — baseline factuelle** : état git, syntaxe, 3 audits statiques, build prod, suite e2e par défaut, suite e2e cross-compte réelle, tests backend du dashboard, inventaire RLS de la prod, mesure de la page d'accueil prod.
- **Phase 1a — exploration** : lecture du plan de contrôle `.passio/` (contexte, risques, priorités), de `PASSIO_REPOSITORY_AUDIT.md`, `PASSIO_SYSTEM_MODEL.md`, `PASSIO_CONTROL_CENTER_ROADMAP.md` ; inventaire du centre de pilotage (61 routes API, modules serveur, vues) ; inspection du schéma et des policies réelles en prod.
- **Phase 1b — préparation** : dossier d'analyse croisée rédigé (sans aucun secret), prêt à transmettre.

### Mesures (avant)
Voir le tableau « Baseline mesurée » de `PASSIO_MASTER_CONTROL.md`. Points saillants : 146 tests passés / 1 flaky / 12 skippés ; 89 tests backend dashboard verts ; 11 tests cross-compte réels verts ; RLS active sur 34/34 tables ; accueil prod 123 864 o en 0,76 s.

### Bugs détectés
- `CI-GATE-001` (**P1**) — la CI valide chaque déploiement prod sans jamais exercer RLS / cross-compte / realtime / confidentialité. Les 12 tests « skipped » sont exactement ceux-là (opt-in par variable d'environnement, absente du workflow).
- `TEL-IDENT-002` (**P2**) — la télémétrie abandonne ses lots au changement d'identité. Cause racine établie : `user_id` estampillé à la mise en file, jeton lu au flush ; la policy `WITH CHECK (user_id IS NULL OR user_id = auth.uid()::text)` rejette alors définitivement le lot (`42501`).
- `RACE-LIKE-003` (**P3**) — flaky sur l'annulation d'affichage optimiste pendant reconstruction du fil ; nature non tranchée.

### Bugs corrigés
Aucun. Conformément à la règle de cadrage, aucune modification structurelle avant l'analyse conjointe ; aucun des trois constats n'est un P0 mettant en danger sécurité, données ou intégrité du projet.

### Fichiers touchés
`PASSIO_MASTER_CONTROL.md`, `PASSIO_ENGINEERING_LOG.md`, `passio_qa_registry.json` (créés). Aucun fichier applicatif modifié.

### Blocage rencontré
**La boucle croisée avec ChatGPT n'a PAS pu avoir lieu.** `list_connected_browsers` renvoie une liste vide (extension Claude-in-Chrome non connectée) et le navigateur intégré présente ChatGPT déconnecté ; m'authentifier à la place du fondateur n'est pas une option. Le dossier de transmission est rédigé et prêt. **Aucune analyse de ChatGPT n'est donc rapportée nulle part** — ni ici, ni dans les livrables.

Conséquence directe : `PASSIO_INITIAL_JOINT_AUDIT.md` et `PASSIO_CONTROL_CENTER_AUDIT.md` ne sont **pas** créés. Ce sont par définition des livrables conjoints ; les produire en solo puis les faire relire contredirait la règle cadre de la mission.

### Décisions
1. **Ne pas fabriquer les livrables conjoints** tant que la seconde analyse n'existe pas, plutôt que de les remplir en solo (règle 116 : ne jamais prétendre que ChatGPT a été consulté).
2. **Ne pas afficher de score global** (santé, couverture fonctionnelle, performance) tant que ses composantes ne sont pas mesurées — `NON MESURÉ` plutôt qu'un chiffre arbitraire.
3. **Ne pas corriger `CI-GATE-001` à chaud** : faire tourner les tests cross-compte en CI implique des identifiants de test en secrets GitHub et des écritures dans la base de production depuis la CI — c'est un arbitrage à instruire, pas un `sed` sur un YAML.

### Risques / points à surveiller
- Le vert de la CI est aujourd'hui trompeur sur tout ce qui touche à la confidentialité et au cross-compte : ne pas le lire comme une garantie.
- Les tests cross-compte écrivent dans la base de production ; le nettoyage a été vérifié (0 compte e2e résiduel) mais reste à surveiller à chaque exécution.
- Les hachages d'assets prod (`app.js?v=0d7a125b26`) diffèrent du build local (`0b7e76c726`) : attendu, la CI minifie. **Ce n'est donc pas un indicateur de divergence exploitable** — ne pas en tirer de conclusion.
