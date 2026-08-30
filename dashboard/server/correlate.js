// ═══════════════════════════════════════════════════════════════════════════
// CORRÉLATION — « cet incident est-il apparu juste après un changement ? »
//
// Rapproche le DÉBUT d'un incident des commits qui le précèdent immédiatement,
// pour orienter le diagnostic vers un suspect plutôt que vers tout le dépôt.
//
// ⚠️ Une corrélation N'EST PAS une preuve. Deux choses arrivées coup sur coup
// ne sont pas liées pour autant, et un incident peut aussi être ancien et
// simplement remonté aujourd'hui. Ce module ne produit donc que des HYPOTHÈSES
// graduées, jamais un verdict : c'est au diagnostic (humain ou Claude Code) de
// trancher en lisant le code. On préfère afficher « aucun suspect » qu'un
// coupable désigné à tort.
// ═══════════════════════════════════════════════════════════════════════════
import * as git from "./git.js";
import { entree } from "./liste-blanche.js";

// Un changement postérieur au début de l'incident ne peut pas l'avoir causé ;
// au-delà de la fenêtre amont, la proximité temporelle ne veut plus rien dire.
const LOOKBACK_MS = 24 * 3600_000;
const CLOSE_MS = 2 * 3600_000;      // « juste avant » : forte proximité
const NEAR_MS = 6 * 3600_000;       // proximité moyenne

// Fonctionnalité (contrat de traçage) → fragments de chemin correspondants.
// Sert UNIQUEMENT à renforcer une hypothèse, jamais à en créer une seule.
const FEATURE_PATHS = {
  messaging: ["app-09", "app-04", "conv", "message"],
  feed: ["app-03", "app-04", "app-08", "post", "reel", "story"],
  irl: ["app-07", "irl", "event"],
  social: ["app-04", "app-08", "follow", "profil"],
  moderation: ["app-04", "app-08", "block", "report", "moderation"],
  app: [],
};

// Chemins qui ne partent JAMAIS dans l'app déployée : le centre de pilotage est
// exclu du build (Netlify ignore `dashboard/`), et tests/docs/plan de contrôle
// ne sont pas servis. Un commit qui ne touche QUE ça ne peut pas, par
// construction, avoir cassé l'app — le retenir comme suspect serait une fausse
// piste coûteuse (cinq commits du dashboard remontaient sur un incident du fil).
const NON_SHIPPING = [/^dashboard\//, /^tests?\//, /^docs?\//, /^\.passio\//, /^\.claude\//, /\.md$/i];
function shipsToApp(commit) {
  if (!commit.files.length) return true;            // dans le doute, on garde
  return commit.files.some((f) => !NON_SHIPPING.some((re) => re.test(f)));
}

function touchesFeature(commit, feature) {
  const frags = entree(FEATURE_PATHS, feature) || [];
  if (!frags.length) return false;
  const hay = (commit.files.join(" ") + " " + commit.subject).toLowerCase();
  return frags.some((f) => hay.includes(f));
}

/**
 * Suspects pour un incident démarré à `startedAt`.
 * @param {number} startedAt   première occurrence (ms epoch)
 * @param {string} feature     fonctionnalité concernée (optionnel)
 * @returns {Promise<{suspects:Array,scanned:number,window:string,note:string}>}
 */
export async function suspectsFor(startedAt, feature = "app") {
  if (!Number.isFinite(startedAt)) return { suspects: [], scanned: 0, window: "—", note: "Incident non daté : aucune corrélation possible." };
  let commits = [];
  try { commits = await git.commitsSince(startedAt - LOOKBACK_MS, 60); }
  catch (e) { return { suspects: [], scanned: 0, window: "24 h", note: "Dépôt illisible : " + e.message }; }

  // Antérieurs à l'incident ET susceptibles d'atteindre l'app déployée.
  const before = commits.filter((c) => c.at <= startedAt);
  const candidates = before.filter(shipsToApp);
  const suspects = candidates.map((c) => {
    const delta = startedAt - c.at;
    const sameArea = touchesFeature(c, feature);
    // Confiance : la proximité temporelle porte l'essentiel, le recoupement de
    // fichiers ne fait que la renforcer d'un cran.
    let level = "faible";
    if (delta <= CLOSE_MS) level = sameArea ? "élevée" : "moyenne";
    else if (delta <= NEAR_MS && sameArea) level = "moyenne";
    return {
      hash: c.hash, subject: c.subject, author: c.author, at: c.at,
      minutesBefore: Math.round(delta / 60000),
      files: c.files.slice(0, 12),
      fileCount: c.files.length,
      sameArea, confidence: level,
    };
  })
    // On ne remonte que ce qui vaut la peine d'être regardé : un commit lointain
    // et hors périmètre n'est pas un suspect, c'est du bruit.
    .filter((s) => s.confidence !== "faible")
    .sort((a, b) => a.minutesBefore - b.minutesBefore)
    .slice(0, 5);

  const excluded = before.length - candidates.length;
  return {
    suspects, scanned: before.length, excluded, window: "24 h",
    note: suspects.length
      ? "Hypothèses fondées sur la proximité temporelle (et le recoupement de fichiers) — à confirmer en lisant le code."
      : before.length
        ? `Aucun changement proche : l'incident ne semble PAS lié à un déploiement récent.${excluded ? ` (${excluded} commit(s) écarté(s) : hors de l'app déployée.)` : ""}`
        : "Aucun commit dans les 24 h précédentes.",
  };
}

/** Bloc texte prêt à insérer dans un prompt Claude Code. */
export function suspectsPromptBlock(result) {
  if (!result) return "";
  const L = ["## Changements récents pouvant expliquer l'incident (hypothèses)"];
  if (!result.suspects.length) { L.push("- " + result.note); return L.join("\n"); }
  for (const s of result.suspects) {
    L.push(`- [${s.confidence}] ${s.hash} « ${s.subject} » — ${s.minutesBefore} min avant le début de l'incident${s.sameArea ? ", touche la même zone fonctionnelle" : ""}`);
    if (s.files.length) L.push(`  fichiers : ${s.files.join(", ")}${s.fileCount > s.files.length ? ` (+${s.fileCount - s.files.length})` : ""}`);
  }
  L.push("⚠️ Corrélation ≠ causalité : vérifie le diff avant de conclure.");
  return L.join("\n");
}
