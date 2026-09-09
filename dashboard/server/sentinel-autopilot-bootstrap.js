// SENTINEL AUTOPILOT BOOTSTRAP — branche l'exécuteur sans modifier le moteur.
//
// Sentinel garde sa responsabilité : détecter/diagnostiquer/réparer dans une
// branche isolée et vérifier le patch. Ce bootstrap enveloppe uniquement le
// réparateur : si (et seulement si) une réparation est déjà vérifiée, il demande
// à l'Autopilot de décider puis éventuellement d'exécuter la promotion locale
// transactionnelle. Les mutations restent impossibles en production et exigent
// les flags explicites déjà contrôlés par l'exécuteur.
import * as sentinel from "./sentinel.js";
import { attemptRepair } from "./repair.js";
import { executeAutopilotPromotion } from "./sentinel-autopilot-executor.js";
import { armRecurrenceWatch, startRecurrenceWatch } from "./sentinel-recurrence.js";
import { publishRepair, productionState } from "./sentinel-production.js";

let installed = false;

export function makeAutopilotRepairer({
  repair = attemptRepair,
  promote = executeAutopilotPromotion,
  armRecurrence = armRecurrenceWatch,
  publish = publishRepair,
  productionReady = () => productionState().possible,
} = {}) {
  return async function autopilotAwareRepair(record, analyzer) {
    const rep = await repair(record, analyzer);
    if (!rep || rep.ok !== true) return rep;

    // `record` est le diagnostic canonique que Sentinel vient de persister avant
    // d'appeler le réparateur. On scelle ici uniquement les champs causaux utiles
    // afin que les couches Autopilot n'aient jamais à réimporter `sentinel.js`
    // (et évitent ainsi un cycle ESM bootstrap→executor→autopilot→sentinel).
    const diagnosisEvidence = Object.freeze({
      id: record?.id || null,
      incidentId: record?.meta?.incidentId || null,
      incidentClusterKey: record?.meta?.incidentClusterKey || null,
      diagnosisTs: record?.ts || null,
    });

    const repairWithContext = {
      ...rep,
      key: record?.key || rep.key || null,
      title: record?.title || rep.title || null,
      diagnosisId: diagnosisEvidence.id,
      incidentId: diagnosisEvidence.incidentId || rep.incidentId || null,
      incidentClusterKey: diagnosisEvidence.incidentClusterKey || rep.incidentClusterKey || null,
      diagnosisEvidence,
    };

    // ═══ MISE EN LIGNE AUTOMATIQUE ═══════════════════════════════════════
    // Quand elle est armée, elle REMPLACE la promotion locale et ne s'y ajoute
    // pas. Faire les deux ferait DIVERGER le `main` local (un commit de fusion)
    // et `origin/main` (un squash de la PR) : l'appareil de Benjamin se
    // retrouverait avec un historique qu'aucun `pull --ff-only` ne rattrape,
    // et la prochaine promotion locale échouerait sur un arbre « sale » sans
    // que rien n'explique pourquoi. La source de vérité devient `origin`.
    if (productionReady()) {
      let production;
      try {
        production = await publish(repairWithContext);
      } catch (e) {
        // Même isolation que l'Autopilot : un défaut de publication ne doit
        // jamais annuler un correctif déjà vérifié ni casser la boucle.
        production = { published: false, reason: "exception", error: String(e?.message || e).slice(0, 500) };
      }
      return { ...rep, production };
    }

    let autopilot;
    try {
      autopilot = await promote(repairWithContext);
      if (autopilot?.status === "PROMOTED_LOCAL") {
        try { armRecurrence({ repair: repairWithContext, autopilot }); } catch {}
      }
    } catch (e) {
      // Un défaut de l'Autopilot ne doit JAMAIS annuler une réparation déjà
      // vérifiée ni casser la boucle Sentinel : il est isolé et reporté.
      autopilot = {
        attempted: false,
        status: "ERROR",
        blockers: ["autopilot_exception"],
        error: String(e?.message || e).slice(0, 500),
      };
    }
    return { ...rep, autopilot };
  };
}

export function startSentinelAutopilot({ setRepairer = sentinel._setRepairer } = {}) {
  if (installed) return { installed: true, alreadyInstalled: true };
  startRecurrenceWatch();
  setRepairer(makeAutopilotRepairer());
  installed = true;
  return { installed: true, alreadyInstalled: false };
}

export function autopilotBootstrapState() {
  return { installed };
}

export function _resetAutopilotBootstrapForTests() {
  installed = false;
}
