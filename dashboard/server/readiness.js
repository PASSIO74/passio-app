// ═══════════════════════════════════════════════════════════════════════════
// READINESS — santé = PIRE DOMAINE CRITIQUE, jamais une moyenne.
//
// Pourquoi cette réécriture (incident F7, analyse croisée du 2026-08-15).
// L'ancien modèle était une moyenne pondérée sur 5 facteurs. Deux défauts
// mesurés sur le code lui-même :
//
//   1. Trois bugs critiques ouverts faisaient tomber leur facteur à 0 — et le
//      score affichait encore 75/100 si le reste était au vert :
//      max(0, 100 − 3×34) = 0, puis (0×25 + 100×75)/100 = 75.
//   2. AUCUN facteur d'autorisation n'existait. Une fuite cross-compte totale
//      n'aurait pas déplacé le score d'un seul point.
//
// Une moyenne dit « plutôt en bonne santé » d'un système qui fuit. Certaines
// propriétés ne se moyennent pas : 11 canaris d'autorisation sur 12, ce n'est
// pas 92 %, c'est ROUGE.
//
// LE MODÈLE
//   • Chaque domaine rend un état : vert / ambre / rouge / inconnu.
//   • Santé globale = le PIRE état parmi les domaines CRITIQUES.
//   • Un domaine non critique (performance) ne peut qu'ambrer, jamais rougir.
//   • Un domaine sans donnée vaut INCONNU — jamais « vert par défaut ».
//     C'est le piège qu'on refuse : « 0 erreur remontée » ne veut pas dire
//     « tout va bien », ça peut vouloir dire « on ne voit rien ».
//
// LE SECOND CHIFFRE — CONFIANCE
// Part des domaines réellement mesurés. Il évite qu'un système aveugle passe
// pour un système sain : « VERT — confiance 40 % » est une phrase honnête,
// « 82/100 » n'en est pas une.
// ═══════════════════════════════════════════════════════════════════════════

const RANG = { vert: 0, inconnu: 1, ambre: 2, rouge: 3 };
const PIRE = (a, b) => (RANG[b] > RANG[a] ? b : a);

/**
 * @param {object} overview   store.overview() ({ totals, health })
 * @param {Array}  checklist  checklist.listChecklist()
 * @param {Array}  bugs       store.bugList()
 * @param {object} authz      { pass, total, verifieLe } — canaris d'autorisation.
 *                            Absent = domaine INCONNU (et non « vert »).
 */
export function computeReadiness({ overview, checklist = [], bugs = [], authz = null }) {
  const ov = overview || { health: {}, totals: {} };
  const errors5m = ov.health?.errors5m || 0;
  const apiSuccess = ov.totals?.apiSuccessRate ?? null;
  const echoues = checklist.filter((c) => c.status === "echoue").length;
  const testes = checklist.filter((c) => c.status !== "non_teste").length;
  const critOuverts = bugs.filter(
    (b) => b.severity === "critical" && b.status !== "corrige" && b.status !== "ignore",
  ).length;

  const domaines = [
    {
      cle: "autorisation",
      label: "Autorisation (séparation entre comptes)",
      critique: true,
      // Binaire par nature : on ne négocie pas un pourcentage de fuite.
      etat: !authz || typeof authz.total !== "number" || !authz.total
        ? "inconnu"
        : (authz.pass === authz.total ? "vert" : "rouge"),
      detail: authz && authz.total
        ? `${authz.pass}/${authz.total} canaris` + (authz.verifieLe ? ` — vérifié ${authz.verifieLe}` : "")
        : "NON INSTRUMENTÉ — brancher tests/e2e/authz-critical.spec.js",
    },
    {
      cle: "bugs_critiques",
      label: "Bugs critiques ouverts",
      critique: true,
      // UN bug critique ouvert suffit à rougir. C'est le défaut corrigé ici.
      etat: critOuverts > 0 ? "rouge" : "vert",
      detail: critOuverts ? `${critOuverts} ouvert(s)` : "aucun",
    },
    {
      cle: "parcours_critiques",
      label: "Parcours critiques",
      critique: true,
      etat: testes === 0 ? "inconnu" : (echoues > 0 ? "rouge" : "vert"),
      detail: testes === 0 ? "aucun parcours testé" : `${echoues} échec(s) sur ${testes} testés`,
    },
    {
      cle: "disponibilite",
      label: "Disponibilité API",
      critique: true,
      etat: apiSuccess == null ? "inconnu"
        : (apiSuccess >= 99 ? "vert" : apiSuccess >= 95 ? "ambre" : "rouge"),
      detail: apiSuccess == null ? "NON INSTRUMENTÉ" : `${apiSuccess}% de succès`,
    },
    {
      cle: "stabilite",
      label: "Stabilité (erreurs sur 5 min)",
      critique: true,
      etat: errors5m === 0 ? "vert" : errors5m < 5 ? "ambre" : "rouge",
      detail: `${errors5m} erreur(s)`,
    },
    {
      cle: "performance",
      label: "Performance",
      critique: false,          // ne peut jamais rougir la santé globale
      etat: "inconnu",
      detail: "NON INSTRUMENTÉ — aucune mesure p50/p95 d'interaction",
    },
  ];

  // Santé = pire état parmi les domaines critiques. Un domaine non critique
  // est plafonné à « ambre » : une app lente n'est pas une app cassée.
  let statut = "vert";
  for (const d of domaines) {
    if (d.critique) statut = PIRE(statut, d.etat);
    else if (d.etat === "rouge" || d.etat === "ambre") statut = PIRE(statut, "ambre");
  }

  const mesures = domaines.filter((d) => d.etat !== "inconnu").length;
  const confiance = Math.round((mesures / domaines.length) * 100);

  // Le premier domaine critique qui n'est pas vert : c'est ce qu'il faut lire.
  const cause = domaines.find((d) => d.critique && d.etat === statut && statut !== "vert") || null;

  // `score` reste exposé pour l'affichage historique, mais il ne peut plus
  // CONTREDIRE le statut : un système rouge ne montrera jamais 75.
  const PLAFOND = { rouge: 40, ambre: 75, inconnu: 85, vert: 100 };
  const rouges = domaines.filter((d) => d.etat === "rouge").length;
  const ambres = domaines.filter((d) => d.etat === "ambre").length;
  const score = Math.max(0, Math.min(PLAFOND[statut], 100 - rouges * 30 - ambres * 10));

  return {
    statut,                    // vert | ambre | rouge | inconnu  ← lecture principale
    confiance,                 // % de domaines réellement mesurés
    score,                     // compatibilité d'affichage, borné par le statut
    domaines,
    cause: cause ? { cle: cause.cle, label: cause.label, detail: cause.detail } : null,
    factors: domaines.map((d) => ({ label: d.label, score: d.etat === "vert" ? 100 : d.etat === "ambre" ? 60 : d.etat === "rouge" ? 0 : null, weight: d.critique ? 1 : 0 })),
    note: statut === "vert" && confiance < 100
      ? `Aucun signal négatif, mais confiance ${confiance}% : des domaines ne sont pas instrumentés.`
      : "Santé = pire domaine critique. Les propriétés binaires ne se moyennent pas.",
  };
}
