// ═══════════════════════════════════════════════════════════════════════════
// ask-ai EXÉCUTÉE : chaque chemin du gestionnaire, de bout en bout (2026-11-09).
//
// Le gabarit de notify-call-chemins.test.mjs (une variable jamais déclarée, de
// #753 au 09/11, rendait 500 à toute push sociale ; seul un banc qui exécute le
// gestionnaire pouvait le voir), appliqué à ask-ai : le VRAI index.ts, chargé
// par tests/unit/lib/executer-fonction.mjs — types retirés par Node, imports
// remplacés par des doublures, mode strict. Rien ne sort : Anthropic est une
// doublure de `fetch`, Supabase une doublure de `createClient`, et le plafond
// (qui a sa suite, plafond.test.mjs) une doublure qui note ce qu'on lui demande.
// Lu ici, le code de la fonction fait tourner ce banc avant « Déployer »
// (edge-functions-verrous.test.mjs ②).
// ═══════════════════════════════════════════════════════════════════════════
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chargerFonction, requete } from "./lib/executer-fonction.mjs";

const SOURCE = fs.readFileSync("supabase/functions/ask-ai/index.ts", "utf8");
const URL_FN = "https://banc.example/functions/v1/ask-ai";
const MOI = "11111111-1111-4111-8111-111111111111";

const banc = { user: null, env: {}, clients: [], plafonds: [], verdicts: {}, fetchs: [], fetch: null, journaux: [] };

const MODULES = {
  "https://esm.sh/@supabase/supabase-js@2.118.0": {
    createClient: (url, cle, options) => {
      const c = {
        url, cle, options,
        auth: { getUser: async () => (banc.user ? { data: { user: banc.user }, error: null } : { data: { user: null }, error: { message: "jeton" } }) },
      };
      banc.clients.push(c);
      return c;
    },
  },
  "../_shared/plafond.js": {
    verifierPlafondEnBase: async (admin, cle, nom, plafond) => { banc.plafonds.push({ admin, cle, nom, plafond }); return banc.verdicts[nom] || { ok: true }; },
    reponsePlafond: (verdict, cors) => new Response(JSON.stringify({ error: "plafond", nom: verdict.nom }), { status: 429, headers: cors }),
  },
  "../_shared/revision.js": { REVISION: "revision-du-banc" },
};

let gestionnaire;
before(async () => { gestionnaire = await chargerFonction(SOURCE, { modules: MODULES, env: (n) => banc.env[n] }); });

const consoleError = console.error;
console.error = (...a) => { banc.journaux.push(a.join(" ")); };
process.on("exit", () => { console.error = consoleError; });
globalThis.fetch = async (url, init) => {
  banc.fetchs.push({ url: String(url), init });
  if (!banc.fetch) throw new Error("fetch inattendu : " + url);
  return banc.fetch(String(url), init);
};

function remettre({ user = { id: MOI }, env = {} } = {}) {
  banc.user = user;
  banc.env = { SUPABASE_URL: "https://banc.supabase.co", SUPABASE_ANON_KEY: "cle-anon", SUPABASE_SERVICE_ROLE_KEY: "cle-service", ASK_AI_ACTIF: "1", ANTHROPIC_API_KEY: "cle-anthropic-du-banc", ...env };
  banc.clients = [];
  banc.plafonds = [];
  banc.verdicts = {};
  banc.fetchs = [];
  banc.fetch = null;
  banc.journaux = [];
}
async function appeler(corps, options) {
  const r = await gestionnaire(requete(URL_FN, corps, options));
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch { /* « ok » d'un OPTIONS */ }
  return { status: r.status, entetes: r.headers, texte, corps: json };
}
const reponseAnthropic = (contenu, status = 200) => async () => new Response(JSON.stringify({ content: contenu }), { status });

test("① OPTIONS : 200, CORS et révision servie ; toute autre méthode que POST : 405", async () => {
  remettre();
  const o = await appeler(null, { methode: "OPTIONS" });
  assert.equal(o.status, 200);
  assert.equal(o.texte, "ok");
  assert.equal(o.entetes.get("X-Passio-Revision"), "revision-du-banc");
  assert.equal(o.entetes.get("Access-Control-Allow-Origin"), "*");
  assert.equal(o.entetes.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  const g = await appeler(null, { methode: "GET" });
  assert.equal(g.status, 405);
  assert.deepEqual(g.corps, { error: "Method not allowed" });
  assert.equal(banc.clients.length, 0, "rien n'est lu avant la méthode");
});

test("② sans session : 401 — le jeton part au client anonyme, rien d'autre ne s'exécute", async () => {
  remettre({ user: null });
  const r = await appeler({ query: "Bonjour" }, { jeton: null });
  assert.equal(r.status, 401);
  assert.deepEqual(r.corps, { error: "Non authentifié" });
  assert.equal(banc.clients.length, 1);
  assert.equal(banc.clients[0].cle, "cle-anon");
  assert.deepEqual(banc.clients[0].options, { global: { headers: { Authorization: "" } } });
  assert.equal(banc.plafonds.length, 0);
  assert.equal(banc.fetchs.length, 0);
});

test("③ éteinte par défaut : sans ASK_AI_ACTIF=1, 503 — ni plafond ni Anthropic", async () => {
  for (const actif of [undefined, "", "0", "true", "oui"]) {
    remettre({ env: { ASK_AI_ACTIF: actif } });
    const r = await appeler({ query: "Bonjour" });
    assert.equal(r.status, 503, String(actif));
    assert.deepEqual(r.corps, { error: "Assistant indisponible" });
    assert.equal(banc.plafonds.length, 0);
    assert.equal(banc.fetchs.length, 0);
  }
});

test("④ plafond du COMPTE dépassé : 429, compté sur l'appelant authentifié, sous la clé de service — rien d'autre ne part", async () => {
  remettre();
  banc.verdicts["ask-ai"] = { ok: false, nom: "ask-ai" };
  const r = await appeler({ query: "Bonjour", uid: "22222222-2222-4222-8222-222222222222" });
  assert.equal(r.status, 429);
  assert.equal(r.entetes.get("X-Passio-Revision"), "revision-du-banc", "le refus porte les en-têtes CORS");
  assert.equal(banc.plafonds.length, 1, "le plafond global n'est pas consulté");
  const [p] = banc.plafonds;
  assert.equal(p.cle, MOI, "le compte vient de la session, jamais du corps");
  assert.equal(p.nom, "ask-ai");
  assert.deepEqual(p.plafond, { parMinute: 8, parHeure: 60 });
  assert.equal(p.admin.cle, "cle-service");
  assert.equal(banc.fetchs.length, 0);
});

test("⑤ plafond GLOBAL dépassé : 429 — une somme de comptes ne facture pas l'API au-delà", async () => {
  remettre();
  banc.verdicts["ask-ai-global"] = { ok: false, nom: "ask-ai-global" };
  const r = await appeler({ query: "Bonjour" });
  assert.equal(r.status, 429);
  assert.deepEqual(banc.plafonds.map((p) => [p.cle, p.nom, p.plafond]), [
    [MOI, "ask-ai", { parMinute: 8, parHeure: 60 }],
    ["systeme:ask-ai", "ask-ai-global", { parMinute: 30, parHeure: 300 }],
  ]);
  assert.equal(banc.fetchs.length, 0);
});

test("⑥ corps illisible : 400 ; question vide ou blanche : 400 — Anthropic jamais appelé", async () => {
  remettre();
  const illisible = await appeler(null, { brut: "{pas du json" });
  assert.equal(illisible.status, 400);
  assert.deepEqual(illisible.corps, { error: "Body invalide" });
  assert.equal(banc.fetchs.length, 0);
  for (const corps of [{}, { query: "" }, { query: "   \n " }, { autre: "x" }]) {
    remettre();
    const r = await appeler(corps);
    assert.equal(r.status, 400, JSON.stringify(corps));
    assert.deepEqual(r.corps, { error: "query requise" });
    assert.equal(banc.fetchs.length, 0);
  }
});

test("⑦ clé Anthropic absente : 503 explicite, rien n'est appelé", async () => {
  remettre({ env: { ANTHROPIC_API_KEY: "" } });
  const r = await appeler({ query: "Bonjour" });
  assert.equal(r.status, 503);
  assert.deepEqual(r.corps, { error: "IA non configurée (ANTHROPIC_API_KEY absent)" });
  assert.equal(banc.fetchs.length, 0);
});

test("⑧ réponse : la question (épurée, bornée à 800 caractères) part à l'API Messages avec la clé du serveur ; seuls les blocs texte reviennent", async () => {
  remettre();
  banc.fetch = reponseAnthropic([{ type: "text", text: "Commence par " }, { type: "tool_use", text: "jamais" }, { type: "text", text: "un boîtier d'occasion.\n" }]);
  const question = "  " + "photo ".repeat(200) + "  ";
  const r = await appeler({ query: question });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.equal(r.corps.text, "Commence par \nun boîtier d'occasion.");
  assert.equal(banc.fetchs.length, 1);
  const { url, init } = banc.fetchs[0];
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-api-key"], "cle-anthropic-du-banc");
  assert.equal(init.headers["anthropic-version"], "2023-06-01");
  assert.ok(init.signal instanceof AbortSignal, "une question abandonnée, ou trop longue, s'interrompt");
  const corps = JSON.parse(init.body);
  assert.deepEqual(corps.messages, [{ role: "user", content: question.trim().slice(0, 800) }]);
  assert.equal(corps.messages[0].content.length, 800);
  assert.ok(Number.isInteger(corps.max_tokens) && corps.max_tokens > 0 && corps.max_tokens <= 1024, "une réponse bornée");
  assert.match(corps.system, /PASSIO/);
  assert.equal(r.corps.model, corps.model, "la réponse nomme le modèle interrogé");
});

test("⑨ Anthropic en erreur : 502 avec le seul statut — son corps reste dans les journaux de la fonction", async () => {
  remettre();
  banc.fetch = async () => new Response("overloaded_error req_011CUfx secret-interne", { status: 529 });
  const r = await appeler({ query: "Bonjour" });
  assert.equal(r.status, 502);
  assert.deepEqual(r.corps, { error: "Appel IA indisponible (529)" });
  assert.doesNotMatch(r.texte, /req_011CUfx|secret-interne/);
  assert.ok(banc.journaux.some((j) => /ask-ai : Anthropic 529 — overloaded_error req_011CUfx/.test(j)), banc.journaux.join(" | "));
});

test("⑩ réponse sans bloc texte : 502 « Réponse vide »", async () => {
  for (const contenu of [[], [{ type: "tool_use" }], [{ type: "text", text: "  " }], null]) {
    remettre();
    banc.fetch = reponseAnthropic(contenu);
    const r = await appeler({ query: "Bonjour" });
    assert.equal(r.status, 502, JSON.stringify(contenu));
    assert.deepEqual(r.corps, { error: "Réponse vide" });
  }
});

test("⑪ réseau en panne ou délai dépassé : 502, journalisé, jamais une exception qui remonte", async () => {
  remettre();
  banc.fetch = async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); };
  const r = await appeler({ query: "Bonjour" });
  assert.equal(r.status, 502);
  assert.deepEqual(r.corps, { error: "Appel IA indisponible" });
  assert.ok(banc.journaux.some((j) => /ask-ai : appel échoué — TimeoutError/.test(j)), banc.journaux.join(" | "));
});
