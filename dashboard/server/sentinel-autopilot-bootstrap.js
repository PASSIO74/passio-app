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

let installed = false;

export function makeAutopilotRepairer({
  repair = attemptRepair,
  promote = executeAutopilotPromotion,
  armRecurrence = armRecurrenceWatch,
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
