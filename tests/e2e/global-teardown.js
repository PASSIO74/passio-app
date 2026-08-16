// Teardown global Playwright : après une suite multi-comptes (PASSIO_E2E_MULTI=1),
// purge les comptes jetables %@passio-e2e.test en prod (best-effort — la CLI
// Supabase doit être liée ; sinon simple avertissement, la suite reste verte).
//
// DEUX purges, et il en faut deux. Le SQL nettoie les tables et les comptes,
// mais il ne peut PAS toucher aux fichiers : Supabase interdit le DELETE direct
// sur `storage.objects` (trigger `storage.protect_delete`). Le nettoyage des
// médias passe obligatoirement par l'API Storage — d'où le second script.
//
// Sans lui, chaque exécution abandonnait une douzaine de fichiers dans le seau
// PUBLIC `content` : 174 s'y étaient accumulés au 2026-08-16, sous des dossiers
// de comptes supprimés depuis des mois.
const { execSync } = require("child_process");
const path = require("path");

function purge(commande, etiquette) {
  try {
    execSync(commande, {
      cwd: path.resolve(__dirname, "..", ".."),
      stdio: "inherit",
      timeout: 240000,
    });
  } catch (e) {
    // Jamais bloquant : un nettoyage raté ne doit pas faire échouer une suite verte.
    console.warn(`[teardown] ${etiquette} non bloquante en échec :`, e.message);
  }
}

module.exports = async () => {
  if (!process.env.PASSIO_E2E_MULTI) return;
  purge("node scripts/purge-e2e-accounts.js", "purge des comptes");
  // Après la suppression des comptes : leurs fichiers sont alors, par
  // construction, « sans compte » — c'est le critère du script.
  purge("node scripts/purge-e2e-storage.js --appliquer", "purge du stockage");
};
