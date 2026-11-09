// ═══════════════════════════════════════════════════════════════════════════
// EXÉCUTER le vrai index.ts d'une Edge Function dans Node (2026-11-09).
//
// De #753 (07/11) au 09/11, `notify-call` lisait `uid`, jamais déclaré : un 500
// pour toute push sociale. Aucune suite ne l'a vu — la CI ne fait pas de
// `deno check`, et les suites de `_shared` éprouvent chaque module seul, jamais
// le site d'appel. Seul un banc qui EXÉCUTE le gestionnaire le voit.
//
// La SOURCE est lue par la suite elle-même, chemin écrit en littéral :
//   const SOURCE = fs.readFileSync("supabase/functions/<nom>/index.ts", "utf8");
// C'est cette lecture que voit tests/unit/edge-functions-verrous.test.mjs (② ③) :
// elle fait tourner la suite avant « Déployer », et rougit si sa ligne disparaît.
//
// Ici : types retirés par Node (`stripTypeScriptTypes`, mode « strip » : rien
// n'est transformé, ce qui ne s'efface pas lève) ; chaque import remplacé par sa
// doublure — un import sans doublure, ou une doublure sans import, rougit ;
// `Deno` fourni, `Deno.serve` capturé ; le tout exécuté en mode strict dans une
// fonction asynchrone, comme le module ES que Deno charge : la lecture d'une
// variable jamais déclarée lève. Les modules partagés ne sont pas chargés : ils
// ont leurs suites, ce banc éprouve le câblage du gestionnaire.
// Gabarit : notify-call-chemins.test.mjs, qui porte sa propre copie de ce
// chargeur (écrite avant cette aide).
// ═══════════════════════════════════════════════════════════════════════════
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";

const IDENT = String.raw`[\p{ID_Start}$_][\p{ID_Continue}$]*`;
const DEFAUT = new RegExp(`^(${IDENT})\\s*(?:,\\s*|$)`, "u");
const ESPACE = new RegExp(`^\\*\\s+as\\s+(${IDENT})$`, "u");
const RENOMME = new RegExp(`(${IDENT})\\s+as\\s+(${IDENT})`, "gu");

/** La clause d'un import → les liaisons d'un `const`, lues dans `m` (l'expression du module de doublures). */
function liaisons(clause, m) {
  const out = [];
  let reste = clause.trim();
  const d = DEFAUT.exec(reste);
  if (d) { out.push(`${d[1]} = ${m}.default`); reste = reste.slice(d[0].length); }
  const e = ESPACE.exec(reste);
  if (e) out.push(`${e[1]} = ${m}`);
  else if (/^\{[\s\S]*\}$/.test(reste)) out.push(`${reste.replace(RENOMME, "$1: $2")} = ${m}`);
  else if (reste) throw new Error("clause d'import non reconnue : " + clause);
  return out.join(", ");
}

/**
 * Charge le gestionnaire d'une Edge Function.
 * @param {string} source le texte de son index.ts, lu par la suite
 * @param {{ modules: Record<string, object>, env: (nom: string) => string | undefined }} doublures
 *   `modules` : une doublure par origine d'import, à l'identique (`"../_shared/plafond.js"`) ;
 *   `env` : relu à chaque `Deno.env.get` — une suite change l'environnement entre deux requêtes.
 * @returns {Promise<(req: Request) => Promise<Response>>}
 */
export async function chargerFonction(source, { modules, env }) {
  const vus = [];
  const js = stripTypeScriptTypes(source, { mode: "strip" }).replace(/^import\s+([^;]+?)\s+from\s+"([^"]+)";[ \t]*$/gm, (_, clause, origine) => {
    vus.push(origine);
    return `const ${liaisons(clause, `globalThis.__bancFonction.module(${JSON.stringify(origine)})`)};`;
  });
  assert.deepEqual(vus.filter((o) => !(o in modules)), [], "un import sans doublure : il doit rougir ICI, pas en production");
  assert.deepEqual(Object.keys(modules).filter((o) => !vus.includes(o)), [], "une doublure sans import : le banc ne décrit plus la fonction");
  assert.doesNotMatch(js, /^\s*import\s/m, "un import n'a pas été remplacé");
  assert.doesNotMatch(js, /^\s*export\s/m, "un export : la fonction devrait se charger comme un vrai module");
  let gestionnaire = null, servis = 0;
  globalThis.__bancFonction = { module: (o) => modules[o] };
  globalThis.Deno = {
    env: { get: (n) => env(n) },
    serve: (a, b) => { servis++; gestionnaire = typeof a === "function" ? a : b; },
  };
  const AsyncFunction = (async () => {}).constructor;
  await new AsyncFunction('"use strict";\n' + js)();
  assert.equal(servis, 1, "Deno.serve reçoit le gestionnaire, une fois");
  assert.equal(typeof gestionnaire, "function", "Deno.serve a reçu une fonction");
  return gestionnaire;
}

/** Une requête POST JSON, avec ou sans jeton. */
export function requete(url, corps, { jeton = "jeton-du-banc", methode = "POST", brut = null } = {}) {
  return new Request(url, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(jeton ? { Authorization: "Bearer " + jeton } : {}) },
    ...(methode === "GET" || methode === "OPTIONS" ? {} : { body: brut ?? JSON.stringify(corps ?? {}) }),
  });
}
