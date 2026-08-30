// Analyse des déclarations de routes de `server/index.js`, partagée par
// `routes-caps.test.js` (qui fige la garde déclarée) et `http-routes.test.js`
// (qui vérifie la garde APPLIQUÉE sur un vrai serveur). Une seule lecture de la
// source pour les deux : si le motif dérive, les deux fichiers dérivent ensemble
// au lieu de diverger en silence.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SRC = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "index.js"), "utf8");

export const METHODES = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

/**
 * `@public` = aucun middleware de garde ; `@auth` = requireAuth ; sinon la
 * capacité exigée. Le verbe n'est PAS énuméré dans le motif : c'est ce qui avait
 * rendu les routes `api.patch(...)` invisibles.
 */
export function parseRoutes(src = SRC) {
  const re = /^api\.([a-z]+)\(\s*"([^"]+)"\s*,\s*([^\n]*)$/gm;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const rest = m[3];
    const cap = rest.match(/^auth\.requireCap\("([a-z_]+)"\)/);
    out.push({
      method: m[1].toUpperCase(),
      route: m[2],
      guard: cap ? cap[1] : /^auth\.requireAuth\b/.test(rest) ? "@auth" : "@public",
      at: m.index,
    });
  }
  return out;
}

/** Chemin concret : les paramètres deviennent une valeur inexistante. */
export function cheminConcret(route) {
  return "/api" + route.replace(/:[A-Za-z_]+/g, "zzz_inexistant");
}
