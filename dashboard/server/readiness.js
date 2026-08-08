// ═══════════════════════════════════════════════════════════════════════════
// READINESS — score d'aide à la décision (0-100), pondéré, à partir de PREUVES
// réelles (erreurs récentes, bugs critiques, tests fonctionnels, couverture,
// disponibilité API). Fonction PURE (testable) : les I/O restent dans la route.
// ⚠️ Aide à la décision, PAS une garantie de livrabilité.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {object} overview  résultat de store.overview() ({ totals, health })
 * @param {Array}  checklist résultat de checklist.listChecklist()
 * @param {Array}  bugs      résultat de store.bugList()
 */
export function computeReadiness({ overview, checklist = [], bugs = [] }) {
  const ov = overview || { health: {}, totals: {} };
  const errors5m = ov.health?.errors5m || 0;
  const apiSuccess = ov.totals?.apiSuccessRate ?? 100;
  const passed = checklist.filter((c) => c.status === "reussi").length;
  const failed = checklist.filter((c) => c.status === "echoue").length;
  const tested = checklist.filter((c) => c.status !== "non_teste").length;
  const crit = bugs.filter((b) => b.severity === "critical" && b.status !== "corrige" && b.status !== "ignore").length;

  const factors = [
    { label: "Stabilité (erreurs 5 min)", weight: 20, score: Math.max(0, 100 - errors5m * 15) },
    { label: "Bugs critiques ouverts", weight: 25, score: Math.max(0, 100 - crit * 34) },
    { label: "Réussite des tests fonctionnels", weight: 25, score: tested ? Math.round((passed / (passed + failed || 1)) * 100) : 0 },
    // Guard chk.length === 0 (sinon NaN — corrigé lors de l'extraction).
    { label: "Couverture checklist", weight: 15, score: checklist.length ? Math.round((tested / checklist.length) * 100) : 0 },
    { label: "Disponibilité API", weight: 15, score: apiSuccess },
  ];
  const totalWeight = factors.reduce((a, f) => a + f.weight, 0);
  const score = Math.round(factors.reduce((a, f) => a + f.score * f.weight, 0) / totalWeight);
  return { score, factors, note: "Indicateur d'aide à la décision, pas une garantie." };
}
