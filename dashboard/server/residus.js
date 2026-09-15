// ═══════════════════════════════════════════════════════════════════════════
// RÉSIDUS — le pilotage montre le registre structuré des résidus du dépôt
// (.passio/residus/registre-residus.json) tel que la gate CI l'évalue
// (scripts/lib/registre-residus.js), cinquième contre-revue Astra, mandat §9 :
// « une visibilité pertinente dans le pilotage/Sentinelle ».
//
// Même code que la CI, mêmes règles : un résidu devenu TRAITABLE (sa condition
// de réexamen est satisfaite par le dépôt) et non réexaminé est un ÉCART ; une
// fermeture sans les quatre états à « oui » aussi. Ici on ne corrige rien, on
// montre : le domaine « résidus » du readiness est AMBRE dès qu'un résidu est
// traitable, ROUGE si le registre et le dépôt se contredisent, INCONNU si le
// registre ne peut pas être lu (ce qui n'est pas « aucun résidu »).
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "./config.js";

const require = createRequire(import.meta.url);

/** Lit et évalue le registre du dépôt `repoPath`. Ne lève jamais : rend un état. */
export function residusSnapshot(repoPath = config.repoPath, { aujourdhui } = {}) {
  const luLe = new Date().toISOString();
  let R;
  try {
    R = require(path.join(repoPath, "scripts", "lib", "registre-residus.js"));
  } catch (e) {
    return { state: "UNAVAILABLE", detail: "évaluateur absent du dépôt (scripts/lib/registre-residus.js)", luLe };
  }
  const chemin = path.join(repoPath, R.CHEMIN_REGISTRE);
  if (!fs.existsSync(chemin)) return { state: "UNAVAILABLE", detail: `registre absent (${R.CHEMIN_REGISTRE})`, luLe };
  let registre;
  try {
    registre = R.lireRegistre(fs.readFileSync(chemin, "utf8"));
  } catch (e) {
    return { state: "INVALID", detail: "registre invalide", erreurs: e.erreurs || [e.message], luLe };
  }
  const bilan = R.evaluer(registre, R.sondeDepot(repoPath, { aujourdhui }));
  return {
    state: bilan.ecarts.length ? "INCONSISTENT" : "LIVE",
    luLe,
    mis_a_jour_le: bilan.mis_a_jour_le,
    total: bilan.total, ouverts: bilan.ouverts, traitables: bilan.traitables, non_mesurables: bilan.non_mesurables,
    ecarts: bilan.ecarts,
    lignes: bilan.lignes.map((l) => ({
      id: l.id, titre: l.titre, gravite: l.gravite, proprietaire: l.proprietaire, statut: l.statut,
      traitable: l.traitable, condition: l.condition, etats: l.etats, ecarts: l.ecarts,
    })),
    nuances_acceptees: registre.nuances_acceptees || [],
  };
}

/** Domaine readiness (non critique) dérivé d'un instantané. Fonction pure. */
export function residusDomaine(snap) {
  if (!snap || snap.state === "UNAVAILABLE") return { etat: "inconnu", detail: (snap && snap.detail) || "registre non lu — ce n'est pas « aucun résidu »" };
  if (snap.state === "INVALID") return { etat: "rouge", detail: "registre invalide : " + (snap.erreurs || []).slice(0, 2).join(" ; ") };
  if (snap.state === "INCONSISTENT") return { etat: "rouge", detail: `${snap.ecarts.length} écart(s) registre/dépôt : ${snap.ecarts[0]}` };
  if (snap.traitables.length) return { etat: "ambre", detail: `${snap.traitables.length} résidu(s) traitable(s) sur ${snap.ouverts} ouverts : ${snap.traitables.join(", ")}` };
  return { etat: "vert", detail: `${snap.ouverts} résidu(s) ouverts, aucun traitable oublié (${snap.non_mesurables.length} à condition manuelle)` };
}
