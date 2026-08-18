// Projection UI pure pour l'observabilité des promotions Sentinel.
// Aucune requête, aucun effet de bord, aucune mutation.

const KNOWN = new Set(["NO_ATTEMPT", "HOLD", "PROMOTED_LOCAL", "ROLLED_BACK", "REJECTED", "ERROR"]);

export function promotionUiModel(input) {
  if (!input || typeof input !== "object") {
    return {
      state: "UNAVAILABLE",
      tone: "unknown",
      title: "Preuve de promotion indisponible",
      detail: "Aucune donnée vérifiable n’est disponible.",
      mutationAllowed: false,
      productionDeploy: false,
    };
  }

  const raw = String(input.state || "UNKNOWN").toUpperCase();
  const state = KNOWN.has(raw) ? raw : "UNKNOWN";
  const rolledBack = input.rolledBack === true || state === "ROLLED_BACK";
  const locked = input.lock?.locked === true;
  const policySafe = input.policy?.readOnly === true
    && input.policy?.productionDeploy === false
    && input.policy?.runtimeActivation === false;

  if (!policySafe) {
    return {
      state: "UNKNOWN",
      tone: "unknown",
      title: "Contrat d’observation non prouvé",
      detail: "La surface ne prouve pas explicitement son caractère read-only.",
      mutationAllowed: false,
      productionDeploy: false,
      locked,
    };
  }

  const titles = {
    NO_ATTEMPT: "Aucune promotion locale enregistrée",
    HOLD: "Promotion locale bloquée",
    PROMOTED_LOCAL: "Promotion locale vérifiée",
    ROLLED_BACK: "Promotion annulée et rollback exécuté",
    REJECTED: "Promotion locale rejetée",
    ERROR: "Erreur de promotion locale",
    UNKNOWN: "État de promotion inconnu",
  };

  return {
    state,
    tone: state === "PROMOTED_LOCAL" ? "ok" : state === "NO_ATTEMPT" ? "neutral" : "warning",
    title: titles[state],
    detail: input.reason || (rolledBack ? "Retour au SHA pré-promotion." : "Aucun détail supplémentaire."),
    incidentId: input.incidentId || null,
    diagnosisId: input.diagnosisId || null,
    beforeSha: input.beforeSha || null,
    afterSha: input.afterSha || null,
    guardianAgeMs: Number.isFinite(input.guardianAgeMs) ? input.guardianAgeMs : null,
    suites: Array.isArray(input.suites) ? input.suites : [],
    locked,
    rolledBack,
    mutationAllowed: false,
    productionDeploy: false,
  };
}
