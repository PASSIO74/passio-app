// ═══════════════════════════════════════════════════════════════════════════
// CAMPAGNE QA — expose le dernier rapport de la campagne multi-comptes.
//
// La campagne (tests/e2e/qa-campaign.spec.js) inscrit ~10 comptes réels, joue
// une matrice de transferts cross-compte (message/post/like/commentaire/réaction/
// follow/événement/notif + RLS), mesure la latence de bout en bout et écrit
// dashboard/data/qa-report.json. Ce module le sert tel quel (lecture seule).
//
// Pourquoi un fichier plutôt que la télémétrie live ? L'ingestion EXCLUT
// volontairement les comptes @passio-e2e.test des KPIs (ne pas polluer les vraies
// métriques). Le rapport de campagne est donc la source dédiée de la vue QA.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Le chemin suit `config.dataDir` comme tout le reste du pilotage. Il était
// calculé à part (`__dirname/../data`) : identique tant que `DASH_DATA_DIR`
// n'est pas posé, faux dès qu'il l'est — le rapport était alors cherché dans un
// dossier que plus personne n'écrivait, et la vue QA disait « aucune campagne »
// au lieu de montrer la dernière.
const REPORT = path.join(config.dataDir, "qa-report.json");

export function qaReport() {
  try {
    if (!fs.existsSync(REPORT)) {
      return { configured: false, message: "Aucune campagne QA n'a encore été exécutée. Lance : PASSIO_QA_CAMPAIGN=1 PASSIO_E2E_MULTI=1 npm test -- qa-campaign" };
    }
    const raw = fs.readFileSync(REPORT, "utf8");
    const data = JSON.parse(raw);
    const stat = fs.statSync(REPORT);
    return { configured: true, fileUpdatedAt: stat.mtimeMs, ...data };
  } catch (e) {
    return { configured: false, error: e.message };
  }
}
