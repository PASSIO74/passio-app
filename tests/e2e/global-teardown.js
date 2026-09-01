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
  // ⚠️ `PASSIO_E2E_MULTI` NE SUFFISAIT PAS, ET C'ÉTAIT LA CAUSE RACINE.
  // Cette variable n'est définie NULLE PART dans le workflow de CI — le
  // nettoyage n'y a donc jamais tourné. Or la CI crée bel et bien de vrais
  // comptes en production : `authz-critical`, `blocage-acces` et
  // `user-state-horodatage` passent par `compte-e2e.js`, qui exporte
  // `creerCompteE2E` et AUCUNE fonction de suppression. Les comptes se sont
  // accumulés jusqu'à mettre `main` au rouge le 2026-09-01.
  //
  // ⚠️ ON N'OUVRE PAS LA PURGE À TOUTE EXÉCUTION LOCALE, et c'est délibéré :
  // elle supprime les comptes PAR MOTIF, donc une purge lancée pendant qu'une
  // AUTRE suite tourne sur le même poste effacerait ses comptes en plein vol
  // (le risque documenté dans `/passio-multi-session`). En CI ce risque
  // n'existe plus : le verrou de concurrence `passio-e2e-prod` posé sur le job
  // `test` garantit qu'une seule suite touche la base à la fois.
  if (!process.env.PASSIO_E2E_MULTI && !process.env.CI) return;
  purge("node scripts/purge-e2e-accounts.js", "purge des comptes");
  // Après la suppression des comptes : leurs fichiers sont alors, par
  // construction, « sans compte » — c'est le critère du script.
  purge("node scripts/purge-e2e-storage.js --appliquer", "purge du stockage");
};
