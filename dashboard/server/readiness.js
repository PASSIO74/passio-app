// ═══════════════════════════════════════════════════════════════════════════
// READINESS — santé = PIRE DOMAINE CRITIQUE, jamais une moyenne.
// ═══════════════════════════════════════════════════════════════════════════
import { observationSnapshot } from "./observation.js";
import { releaseHealth } from "./release-recorder.js";

const RANG = { vert: 0, inconnu: 1, ambre: 2, rouge: 3 };
const PIRE = (a, b) => (RANG[b] > RANG[a] ? b : a);
const observationEtat = (state) => state === "LIVE" ? "vert" : state === "DEGRADED" ? "ambre" : state === "UNAVAILABLE" ? "rouge" : "inconnu";

export function computeReadiness({ overview, checklist = [], bugs = [], authz = null, observation = null, release = null }) {
  const ov = overview || { health: {}, totals: {} };
  const errors5m = ov.health?.errors5m || 0;
  const apiSuccess = ov.totals?.apiSuccessRate ?? null;
  const echoues = checklist.filter((c) => c.status === "echoue").length;
  const testes = checklist.filter((c) => c.status !== "non_teste").length;
  const critOuverts = bugs.filter((b) => b.severity === "critical" && b.status !== "corrige" && b.status !== "ignore").length;
  const observationNow = observation || observationSnapshot();
  const releaseNow = release || releaseHealth();

  const domaines = [
    {
      cle: "autorisation", label: "Autorisation (séparation entre comptes)", critique: true,
      etat: !authz || typeof authz.total !== "number" || !authz.total ? "inconnu" : (authz.pass === authz.total ? "vert" : "rouge"),
      detail: authz && authz.total ? `${authz.pass}/${authz.total} canaris` + (authz.verifieLe ? ` — vérifié ${authz.verifieLe}` : "") : "NON INSTRUMENTÉ — brancher tests/e2e/authz-critical.spec.js",
    },
    {
      cle: "observation", label: "Observation (DB + SSE + canari public)", critique: true,
      etat: observationEtat(observationNow.state),
      detail: Object.entries(observationNow.parts || {}).map(([k, v]) => `${k}:${v.state}`).join(" · ") || observationNow.detail || observationNow.state,
      meta: observationNow,
    },
    { cle: "bugs_critiques", label: "Bugs critiques ouverts", critique: true, etat: critOuverts > 0 ? "rouge" : "vert", detail: critOuverts ? `${critOuverts} ouvert(s)` : "aucun" },
    { cle: "parcours_critiques", label: "Parcours critiques", critique: true, etat: testes === 0 ? "inconnu" : (echoues > 0 ? "rouge" : "vert"), detail: testes === 0 ? "aucun parcours testé" : `${echoues} échec(s) sur ${testes} testés` },
    { cle: "disponibilite", label: "Disponibilité API", critique: true, etat: apiSuccess == null ? "inconnu" : (apiSuccess >= 99 ? "vert" : apiSuccess >= 95 ? "ambre" : "rouge"), detail: apiSuccess == null ? "NON INSTRUMENTÉ" : `${apiSuccess}% de succès` },
    { cle: "stabilite", label: "Stabilité (erreurs sur 5 min)", critique: true, etat: errors5m === 0 ? "vert" : errors5m < 5 ? "ambre" : "rouge", detail: `${errors5m} erreur(s)` },
    { cle: "release", label: "Release chain (commit → deploy → app → DB)", critique: false, etat: observationEtat(releaseNow.state), detail: releaseNow.detail, meta: releaseNow },
    { cle: "performance", label: "Performance", critique: false, etat: "inconnu", detail: "NON INSTRUMENTÉ — aucune mesure p50/p95 d'interaction" },
  ];

  let statut = "vert";
  for (const d of domaines) {
    if (d.critique) statut = PIRE(statut, d.etat);
    else if (d.etat === "rouge" || d.etat === "ambre") statut = PIRE(statut, "ambre");
  }

  const mesures = domaines.filter((d) => d.etat !== "inconnu").length;
  const confiance = Math.round((mesures / domaines.length) * 100);
  const cause = domaines.find((d) => d.critique && d.etat === statut && statut !== "vert") || null;
  const PLAFOND = { rouge: 40, ambre: 75, inconnu: 85, vert: 100 };
  const rouges = domaines.filter((d) => d.etat === "rouge").length;
  const ambres = domaines.filter((d) => d.etat === "ambre").length;
  const score = Math.max(0, Math.min(PLAFOND[statut], 100 - rouges * 30 - ambres * 10));

  return {
    statut, confiance, score, domaines, observation: observationNow, release: releaseNow,
    cause: cause ? { cle: cause.cle, label: cause.label, detail: cause.detail } : null,
    factors: domaines.map((d) => ({ label: d.label, score: d.etat === "vert" ? 100 : d.etat === "ambre" ? 60 : d.etat === "rouge" ? 0 : null, weight: d.critique ? 1 : 0 })),
    note: statut === "vert" && confiance < 100 ? `Aucun signal négatif, mais confiance ${confiance}% : des domaines ne sont pas instrumentés.` : "Santé = pire domaine critique. Les propriétés binaires ne se moyennent pas.",
  };
}
