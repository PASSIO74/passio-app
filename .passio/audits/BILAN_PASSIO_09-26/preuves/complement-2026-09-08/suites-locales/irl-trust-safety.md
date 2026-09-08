# MOD-C30 débloqué — tests/e2e/irl-trust-safety.spec.js exécutée localement (2026-09-08)

Commande : `PASSIO_PORT=8120 PASSIO_RETRIES=0 npx playwright test --project=local tests/e2e/irl-trust-safety.spec.js --workers=1 --reporter=list`
Environnement : SHA c8cb8e9 (code applicatif), Chromium 141 headless (r1194, pont vers la révision 1223 attendue par @playwright/test 1.60.0), serveur statique local, 4 CPU.
Résultat : **23 passed (5.7 min), 0 failed, 0 skipped.**
Lecture : la garde de proposition IRL (lot sous drapeau OFF par défaut) se comporte comme spécifié — OFF par défaut, kill switch, verdicts mineur/bloqué/soi-même, aucune fuite de position GPS, DM bloqué refusé, télémétrie sans PII. Cela NE lève PAS IRL-02/MOD-08 : la suite prouve un lot inactif ; en production le drapeau est OFF et `declare_birth_year` n'est appelée nulle part sur le chemin nominal.
Premier essai (avant le pont Chromium) : 21 échecs en 4 ms « Executable doesn't exist at …chromium_headless_shell-1223 » — défaut d'environnement, pas de l'application.
